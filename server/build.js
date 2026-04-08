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
const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS, 10) || 4;

function countActiveBuilds() {
  let count = 0;
  for (const k in buildLocks) { if (buildLocks[k]) count++; }
  return count;
}

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

// ── Language detection ──
function detectLanguage(workDir, branchConfig) {
  // Explicit config takes priority
  if (branchConfig && branchConfig.language && branchConfig.language !== "auto") return branchConfig.language;
  // Auto-detect from project files
  if (fs.existsSync(path.join(workDir, "pom.xml")) || fs.existsSync(path.join(workDir, "build.gradle")) || fs.existsSync(path.join(workDir, "build.gradle.kts"))) return "java";
  if (fs.existsSync(path.join(workDir, "requirements.txt")) || fs.existsSync(path.join(workDir, "pyproject.toml")) || fs.existsSync(path.join(workDir, "setup.py")) || fs.existsSync(path.join(workDir, "Pipfile"))) return "python";
  // Check for .py files (no manifest but still a Python project)
  try { var entries = fs.readdirSync(workDir); if (entries.some(function(f) { return f.endsWith(".py"); })) return "python"; } catch (e) {}
  return "nodejs";
}

// ── Detect pygame in Python files ──
function detectPygame(workDir) {
  try {
    var files = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py"); });
    for (var i = 0; i < files.length; i++) {
      var content = fs.readFileSync(path.join(workDir, files[i]), "utf8");
      if (/^\s*(import\s+pygame|from\s+pygame)/m.test(content)) return files[i];
    }
  } catch (e) {}
  return null;
}

// ── Find main Python file ──
function findMainPyFile(workDir) {
  if (fs.existsSync(path.join(workDir, "main.py"))) return "main.py";
  try {
    var pyFiles = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py") && f !== "__init__.py" && f !== "setup.py"; });
    if (pyFiles.length === 1) return pyFiles[0];
    // Look for if __name__ == "__main__" pattern
    for (var i = 0; i < pyFiles.length; i++) {
      var content = fs.readFileSync(path.join(workDir, pyFiles[i]), "utf8");
      if (/__name__\s*==\s*['"]__main__['"]/.test(content)) return pyFiles[i];
    }
    return pyFiles[0] || "main.py";
  } catch (e) { return "main.py"; }
}

// ── Shared: install dependencies ──
async function installDeps(workDir, addLog, language) {
  if (language === "java") {
    addLog("Java project detected — skipping npm install");
    return;
  }
  if (language === "python") {
    addLog("Installing Python dependencies...");
    var pipFlags = "--break-system-packages";
    if (fs.existsSync(path.join(workDir, "Pipfile"))) {
      await runCmd("pip install " + pipFlags + " pipenv && pipenv install --deploy --system", workDir);
    } else if (fs.existsSync(path.join(workDir, "pyproject.toml"))) {
      await runCmd("pip install " + pipFlags + " .", workDir);
    } else if (fs.existsSync(path.join(workDir, "requirements.txt"))) {
      await runCmd("pip install " + pipFlags + " -r requirements.txt", workDir);
    } else {
      addLog("No Python dependency file found — skipping install");
    }
    // Auto-detect pygame and install pygbag for web builds
    var pygameFile = detectPygame(workDir);
    if (pygameFile) {
      addLog("Pygame detected in " + pygameFile + " — installing pygame + pygbag for web build...");
      await runCmd("pip install " + pipFlags + " pygame-ce pygbag", workDir);
    }
    return;
  }
  // Node.js (default)
  const hasNodeModules = fs.existsSync(path.join(workDir, "node_modules"));
  addLog(hasNodeModules ? "Checking dependencies..." : "Installing dependencies...");
  const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
  if (hasPnpmLock) await runCmd("pnpm install", workDir);
  else if (hasYarnLock) await runCmd("yarn install", workDir);
  else await runCmd("npm install", workDir);
}

// ── Default build commands per language ──
function defaultBuildCommand(language) {
  if (language === "java") {
    return "mvn package -DskipTests";
  }
  if (language === "python") {
    return "python -m py_compile *.py || true";
  }
  return "npm run build";
}

// ── Default start commands per language ──
function defaultStartCommand(language) {
  if (language === "java") return "java -jar target/*.jar";
  if (language === "python") return "python app.py";
  return "npm start";
}

// ── Default output dirs per language ──
function defaultOutputDir(language) {
  if (language === "java") return "target";
  if (language === "python") return ".";
  return "dist";
}

// ── Output dir search paths per language ──
function outputSearchPaths(language) {
  if (language === "java") return ["target", "build/libs", "build", "dist"];
  if (language === "python") return ["build/web", "dist", "build", "static", "public", "."];
  return ["dist", "build", "out", "web-build", ".next/static", "public"];
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
  // Enforce max concurrent builds
  if (countActiveBuilds() >= MAX_CONCURRENT_BUILDS) {
    console.log("[" + key + "] Max concurrent builds (" + MAX_CONCURRENT_BUILDS + ") reached, queuing...");
    buildStatus[key] = { status: "queued", log: "Waiting for build slot...\n", lastBuild: null, commitSha: "", mode: "static" };
    // Retry after 5 seconds
    setTimeout(() => buildBranch(repoConfig, branchConfig), 5000);
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "", mode: "static", startedAt: Date.now() };
  const addLog = createLogger(key);

  try {
    const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
    buildStatus[key].commitSha = sha;

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);
    const language = detectLanguage(workDir, branchConfig);
    addLog("Language: " + language);

    addLog("Cleaning...");
    await runCmd("rm -rf dist build out web-build", workDir).catch(() => {});

    await installDeps(workDir, addLog, language);

    // Pygame auto-build: use pygbag to compile to WebAssembly
    var pygameFile = (language === "python") ? detectPygame(workDir) : null;
    var cmd, outName;

    if (pygameFile && !branchConfig.buildCommand) {
      var mainFile = findMainPyFile(workDir);
      // pygbag expects main.py — rename if needed
      if (mainFile !== "main.py") {
        addLog("Renaming " + mainFile + " -> main.py for pygbag...");
        fs.copyFileSync(path.join(workDir, mainFile), path.join(workDir, "main.py"));
      }
      cmd = "pygbag --build " + JSON.stringify(workDir);
      addLog("Building Pygame for web with pygbag...");
      var userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");
      await runCmd(cmd, workDir, userEnv);
      outName = "build/web";
    } else {
      cmd = branchConfig.buildCommand || (language === "nodejs" ? repoConfig.buildCommand : "") || defaultBuildCommand(language);
      var userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");
      addLog("Building: " + cmd);
      await runCmd(cmd, workDir, userEnv);
      outName = branchConfig.outputDir || (language === "nodejs" ? repoConfig.outputDir : "") || defaultOutputDir(language);
    }

    const outPath = path.join(workDir, outName);
    const altPaths = outputSearchPaths(language);
    let finalOut = null;
    if (fs.existsSync(outPath)) finalOut = outPath;
    else { for (const alt of altPaths) { const p = path.join(workDir, alt); if (fs.existsSync(p)) { finalOut = p; break; } } }
    if (!finalOut) { addLog("WARNING: No output dir found. Serving workDir."); finalOut = workDir; }

    // Scan for serverless API functions in the workDir (not output dir)
    const apiRoutes = scanApiRoutes(workDir, addLog);
    const userEnvForRuntime = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");

    var duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
    addLog("Build complete in " + duration + "s! Output: " + path.relative(WORKSPACE, finalOut));
    buildStatus[key].status = "ready";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].duration = parseFloat(duration);
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
  // Enforce max concurrent builds (restarts skip the queue)
  if (!isRestart && countActiveBuilds() >= MAX_CONCURRENT_BUILDS) {
    console.log("[" + key + "] Max concurrent builds (" + MAX_CONCURRENT_BUILDS + ") reached, queuing...");
    buildStatus[key] = { status: "queued", log: "Waiting for build slot...\n", lastBuild: null, commitSha: "", mode: "server" };
    setTimeout(() => startServer(repoConfig, branchConfig, false), 5000);
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);

  killServer(key);

  const restarts = isRestart ? ((buildStatus[key] && buildStatus[key].restarts) || 0) : 0;
  buildStatus[key] = { status: "building", log: isRestart ? (buildStatus[key].log || "") : "", lastBuild: null, commitSha: "", mode: "server", restarts, startedAt: Date.now() };
  const addLog = createLogger(key);
  if (isRestart) addLog.setLog(buildStatus[key].log);

  try {
    if (!isRestart) {
      const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
      buildStatus[key].commitSha = sha;
    }

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);
    const language = detectLanguage(workDir, branchConfig);
    addLog("Language: " + language);
    if (!isRestart) await installDeps(workDir, addLog, language);

    const port = await findFreePort();
    const startCmd = branchConfig.startCommand || (language === "nodejs" ? repoConfig.startCommand : "") || defaultStartCommand(language);
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

    var duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
    addLog("Server running on port " + port + " (started in " + duration + "s)");
    runningServers[key].status = "running";
    buildStatus[key].status = "running";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].duration = parseFloat(duration);
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
  // Pygame projects always use static build (pygbag produces HTML/WASM)
  if (branchConfig.mode === "server") {
    // Quick-check: if language is python, peek for pygame and reroute to static
    var baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
    var branchDir = getBranchDir(repoConfig.owner, repoConfig.repo, branchConfig);
    var checkDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
    if ((branchConfig.language === "python" || branchConfig.language === "auto") && fs.existsSync(checkDir) && detectPygame(checkDir)) {
      console.log("[" + repoConfig.owner + "/" + repoConfig.repo + "] Pygame detected — using static build with pygbag instead of server mode");
      buildBranch(repoConfig, branchConfig);
      return;
    }
    startServer(repoConfig, branchConfig);
  } else {
    buildBranch(repoConfig, branchConfig);
  }
}

function cancelBuild(key) {
  if (buildLocks[key]) {
    delete buildLocks[key];
    if (buildStatus[key]) {
      buildStatus[key].status = "cancelled";
      buildStatus[key].lastBuild = Date.now();
    }
    killServer(key);
    return true;
  }
  return false;
}

module.exports = { buildStatus, branchSlug, getBranchDir, buildKey, buildBranch, startServer, deployBranch, cancelBuild, WORKSPACE, detectLanguage, defaultBuildCommand, defaultStartCommand, defaultOutputDir };
