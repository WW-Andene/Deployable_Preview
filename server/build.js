const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { getConfig } = require("./config");
const { parseEnvVars } = require("./config");
const { runCmd, findFreePort, waitForPort, runningServers, killServer } = require("./process");
const { saveLog, broadcastLog } = require("./logs");
const { scanApiRoutes } = require("./serverless");

const WORKSPACE = path.join(__dirname, "..", "workspace");
const AUTO_RESTART_DELAY = 5000;
const MAX_RESTARTS = 3;

if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

const buildStatus = {};
const buildLocks = {};   // prevents concurrent builds for the same key

// ── Slug & path helpers ──
function branchSlug(bc) {
  if (typeof bc === "string") return bc.replace(/\//g, "__");
  var slug = bc.branch.replace(/\//g, "__");
  if (bc.baseDir) slug += "--" + bc.baseDir.replace(/\//g, "__");
  return slug;
}

function getBranchDir(owner, repo, bc) {
  return path.join(WORKSPACE, owner + "__" + repo + "__" + branchSlug(bc));
}

function buildKey(owner, repo, bc) {
  return owner + "/" + repo + ":" + branchSlug(bc);
}

// ── Shared: clone/update repo ──
async function updateRepo(owner, repo, branch, branchDir, addLog) {
  const config = getConfig();
  if (!fs.existsSync(path.join(branchDir, ".git"))) {
    // Clean up if dir exists but has no .git (corrupt/partial clone)
    if (fs.existsSync(branchDir)) {
      addLog("Cleaning stale directory...");
      await runCmd("rm -rf " + JSON.stringify(branchDir));
    }
    addLog("Cloning " + owner + "/" + repo + " (branch: " + branch + ")...");
    fs.mkdirSync(branchDir, { recursive: true });
    await runCmd("git clone --branch " + JSON.stringify(branch) + " --single-branch --depth 1 https://" + config.token + "@github.com/" + owner + "/" + repo + ".git .", branchDir);
  } else {
    addLog("Updating branch: " + branch);
    await runCmd("git fetch origin " + JSON.stringify(branch), branchDir);
    await runCmd("git reset --hard origin/" + JSON.stringify(branch), branchDir);
  }
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
  } catch (e) {
    addLog("WARNING: Could not read commit SHA: " + e.message);
  }
  // Remove token from git remote to avoid credential leakage in workspace
  try {
    execSync("git remote set-url origin https://github.com/" + owner + "/" + repo + ".git", { cwd: branchDir, stdio: "ignore" });
  } catch (_) {}
  addLog("Commit: " + sha.slice(0, 7));
  return sha;
}

// ── Shared: resolve work directory ──
function resolveWorkDir(branchDir, branchConfig, repoConfig, addLog) {
  const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
  const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
  if (baseDir) {
    addLog("Base directory: " + baseDir);
    if (!fs.existsSync(workDir)) throw new Error("Base directory '" + baseDir + "' not found in repo");
  }
  return workDir;
}

// ── Shared: install dependencies ──
async function installDeps(workDir, addLog) {
  const hasNodeModules = fs.existsSync(path.join(workDir, "node_modules"));
  addLog(hasNodeModules ? "Checking dependencies..." : "Installing dependencies...");
  const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
  if (hasPnpmLock) await runCmd("pnpm install", workDir);
  else if (hasYarnLock) await runCmd("yarn install", workDir);
  else await runCmd("npm install", workDir);
}

// ── Shared: create addLog function ──
function createLogger(key) {
  let log = "";
  function addLog(msg) {
    log += msg + "\n";
    buildStatus[key].log = log;
    broadcastLog(key, msg);
    console.log("[" + key + "] " + msg);
  }
  addLog.getLog = () => log;
  addLog.setLog = (l) => { log = l; };
  return addLog;
}

// ── Static build ──
async function buildBranch(repoConfig, branchConfig) {
  const { owner, repo } = repoConfig;
  const key = buildKey(owner, repo, branchConfig);

  // Prevent concurrent builds for the same key
  if (buildLocks[key]) {
    console.log("[" + key + "] Build already in progress, skipping");
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "", mode: "static" };
  const addLog = createLogger(key);

  try {
    const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
    buildStatus[key].commitSha = sha;

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);

    addLog("Cleaning...");
    await runCmd("rm -rf dist build out web-build", workDir).catch(() => {});

    await installDeps(workDir, addLog);

    const cmd = branchConfig.buildCommand || repoConfig.buildCommand || "npm run build";
    const userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");
    addLog("Building: " + cmd);
    await runCmd(cmd, workDir, userEnv);

    const outName = branchConfig.outputDir || repoConfig.outputDir || "dist";
    const outPath = path.join(workDir, outName);
    const altPaths = ["dist", "build", "out", "web-build", ".next/static", "public"];
    let finalOut = null;
    if (fs.existsSync(outPath)) finalOut = outPath;
    else { for (const alt of altPaths) { const p = path.join(workDir, alt); if (fs.existsSync(p)) { finalOut = p; break; } } }
    if (!finalOut) { addLog("WARNING: No output dir found. Serving workDir."); finalOut = workDir; }

    // Scan for serverless API functions in the workDir (not output dir)
    const apiRoutes = scanApiRoutes(workDir, addLog);
    const userEnvForRuntime = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");

    addLog("Build complete! Output: " + path.relative(WORKSPACE, finalOut));
    buildStatus[key].status = "ready";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].outputPath = finalOut;
    buildStatus[key].apiRoutes = apiRoutes;
    buildStatus[key].workDir = workDir;
    buildStatus[key].envVars = userEnvForRuntime;
    buildStatus[key].buildCommand = cmd;
    buildStatus[key].outputDir = outName;
    saveLog(key, addLog.getLog());
  } catch (e) {
    addLog("BUILD FAILED: " + e.message);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
    saveLog(key, addLog.getLog());
  } finally {
    delete buildLocks[key];
  }
}

// ── Server mode ──
async function startServer(repoConfig, branchConfig, isRestart) {
  const { owner, repo } = repoConfig;
  const key = buildKey(owner, repo, branchConfig);

  // Prevent concurrent starts for the same key (allow restarts to proceed)
  if (buildLocks[key] && !isRestart) {
    console.log("[" + key + "] Server start already in progress, skipping");
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);

  killServer(key);

  const restarts = isRestart ? ((buildStatus[key] && buildStatus[key].restarts) || 0) : 0;
  buildStatus[key] = { status: "building", log: isRestart ? (buildStatus[key].log || "") : "", lastBuild: null, commitSha: "", mode: "server", restarts };
  const addLog = createLogger(key);
  if (isRestart) addLog.setLog(buildStatus[key].log);

  try {
    if (!isRestart) {
      const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
      buildStatus[key].commitSha = sha;
    }

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);
    if (!isRestart) await installDeps(workDir, addLog);

    const port = await findFreePort();
    const startCmd = branchConfig.startCommand || repoConfig.startCommand || "npm start";
    const userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");
    addLog((isRestart ? "Restarting" : "Starting") + " server: " + startCmd + " (port " + port + ")");

    const child = spawn("sh", ["-c", startCmd], {
      cwd: workDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production", ...userEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    });

    runningServers[key] = { proc: child, port, status: "starting", restarts };
    child.stdout.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.stderr.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.on("exit", (code) => {
      addLog("Server exited with code " + code);
      saveLog(key, addLog.getLog());
      if (runningServers[key] && runningServers[key].proc === child) {
        runningServers[key].status = "stopped";
        buildStatus[key].status = "error";
        if (restarts < MAX_RESTARTS && !runningServers[key].manualStop) {
          addLog("Auto-restarting in " + (AUTO_RESTART_DELAY / 1000) + "s (" + (restarts + 1) + "/" + MAX_RESTARTS + ")...");
          buildStatus[key].restarts = restarts + 1;
          setTimeout(() => { if (buildStatus[key] && buildStatus[key].status === "error") startServer(repoConfig, branchConfig, true); }, AUTO_RESTART_DELAY);
        } else if (restarts >= MAX_RESTARTS) { addLog("Max restarts reached."); }
      }
    });

    addLog("Waiting for port " + port + "...");
    await waitForPort(port, 60000);

    addLog("Server running on port " + port);
    runningServers[key].status = "running";
    buildStatus[key].status = "running";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].serverPort = port;
    buildStatus[key].restarts = 0;
    saveLog(key, addLog.getLog());
  } catch (e) {
    addLog("SERVER FAILED: " + e.message);
    killServer(key);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
    saveLog(key, addLog.getLog());
  } finally {
    delete buildLocks[key];
  }
}

function deployBranch(repoConfig, branchConfig) {
  if (branchConfig.mode === "server") startServer(repoConfig, branchConfig);
  else buildBranch(repoConfig, branchConfig);
}

module.exports = { buildStatus, branchSlug, getBranchDir, buildKey, buildBranch, startServer, deployBranch, WORKSPACE };
