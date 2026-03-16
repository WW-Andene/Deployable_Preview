const express = require("express");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
const WORKSPACE = path.join(__dirname, "..", "workspace");
const CONFIG_FILE = path.join(__dirname, "..", "deployview.json");
const POLL_INTERVAL = 30000; // 30s

// ── State ──
let config = { token: "", repos: [] };
let buildStatus = {}; // { "owner/repo:branch": { status, log, lastBuild, commitSha } }

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) { console.error("Config load error:", e.message); }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

loadConfig();
if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

// ── GitHub API helper ──
function ghApi(apiPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: apiPath,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "User-Agent": "DeployView" }
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.message || "GitHub " + res.statusCode));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ── Build logic ──
function getRepoDir(owner, repo) { return path.join(WORKSPACE, owner + "__" + repo); }
function getBranchDir(owner, repo, branch) { return path.join(getRepoDir(owner, repo), "branches", branch.replace(/\//g, "__")); }
function buildKey(owner, repo, branch) { return owner + "/" + repo + ":" + branch; }

function runCmd(cmd, cwd) {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 600000, env: { ...process.env, CI: "true" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error("Exit " + code + "\n" + stderr.slice(-2000)));
    });
    child.on("error", reject);
  });
}

async function buildBranch(repoConfig, branch) {
  const { owner, repo, buildCommand, outputDir } = repoConfig;
  const key = buildKey(owner, repo, branch);
  const branchDir = getBranchDir(owner, repo, branch);
  const repoDir = getRepoDir(owner, repo);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "" };
  let log = "";

  function addLog(msg) {
    log += msg + "\n";
    buildStatus[key].log = log;
    console.log("[" + key + "] " + msg);
  }

  try {
    // Clone or pull
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      addLog("Cloning " + owner + "/" + repo + "...");
      fs.mkdirSync(repoDir, { recursive: true });
      await runCmd("git clone https://" + config.token + "@github.com/" + owner + "/" + repo + ".git .", repoDir);
      // Detach HEAD so worktrees can use any branch including the default
      await runCmd("git checkout --detach", repoDir).catch(() => {});
    } else {
      addLog("Fetching latest...");
      await runCmd("git fetch --all --prune", repoDir);
      // Ensure HEAD is detached so worktrees can use any branch
      await runCmd("git checkout --detach", repoDir).catch(() => {});
    }

    // Create branch working directory
    fs.mkdirSync(branchDir, { recursive: true });

    addLog("Checking out branch: " + branch);
    await runCmd("git worktree prune", repoDir).catch(() => {});
    try { await runCmd("git worktree remove --force " + JSON.stringify(branchDir), repoDir); } catch (e) {}

    addLog("Setting up worktree for " + branch + "...");
    await runCmd("git worktree add " + JSON.stringify(branchDir) + " " + branch, repoDir);

    // Get current commit
    const sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
    buildStatus[key].commitSha = sha;
    addLog("Commit: " + sha.slice(0, 7));

    // Determine the actual working directory (baseDir support)
    const baseDir = repoConfig.baseDir || "";
    const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;

    if (baseDir) {
      addLog("Base directory: " + baseDir);
      if (!fs.existsSync(workDir)) {
        throw new Error("Base directory '" + baseDir + "' not found in repo");
      }
    }

    // Install dependencies (clean node_modules first to avoid ENOTEMPTY on rebuild)
    addLog("Cleaning node_modules...");
    const nmDir = path.join(workDir, "node_modules");
    if (fs.existsSync(nmDir)) {
      await runCmd("rm -rf node_modules", workDir);
    }
    addLog("Installing dependencies in " + (baseDir || "root") + "...");
    const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
    const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
    if (hasPnpmLock) {
      await runCmd("pnpm install", workDir);
    } else if (hasYarnLock) {
      await runCmd("yarn install", workDir);
    } else {
      await runCmd("npm install", workDir);
    }

    // Build
    const cmd = buildCommand || "npm run build";
    addLog("Building: " + cmd);
    await runCmd(cmd, workDir);

    // Determine output directory (search inside workDir, not repo root)
    const outName = outputDir || "dist";
    const outPath = path.join(workDir, outName);
    const altPaths = ["dist", "build", "out", "web-build", ".next/static", "public"];

    let finalOut = null;
    if (fs.existsSync(outPath)) {
      finalOut = outPath;
    } else {
      for (const alt of altPaths) {
        const p = path.join(workDir, alt);
        if (fs.existsSync(p)) { finalOut = p; break; }
      }
    }

    if (!finalOut) {
      addLog("WARNING: No output directory found. Tried: " + outName + ", " + altPaths.join(", "));
      addLog("Serving the workDir instead.");
      finalOut = workDir;
    }

    addLog("Build complete! Output: " + path.relative(WORKSPACE, finalOut));
    buildStatus[key].status = "ready";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].outputPath = finalOut;

  } catch (e) {
    addLog("BUILD FAILED: " + e.message);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
  }
}

// ── Polling for new commits ──
async function pollForChanges() {
  if (!config.token) return;
  for (const repo of config.repos) {
    for (const branch of repo.activeBranches || []) {
      const key = buildKey(repo.owner, repo.repo, branch);
      try {
        const data = await ghApi("/repos/" + repo.owner + "/" + repo.repo + "/commits?sha=" + branch + "&per_page=1", config.token);
        const latest = data[0];
        if (!latest) continue;
        const current = buildStatus[key];
        if (current && current.commitSha && current.commitSha !== latest.sha && current.status !== "building") {
          console.log("[POLL] New commit on " + key + ": " + latest.sha.slice(0, 7));
          buildBranch(repo, branch);
        }
      } catch (e) { /* ignore poll errors */ }
    }
  }
}

setInterval(pollForChanges, POLL_INTERVAL);

// ══════════════════════════════
//  API ROUTES
// ══════════════════════════════

// Token
app.post("/api/token", (req, res) => {
  config.token = req.body.token || "";
  saveConfig();
  // Validate
  ghApi("/user", config.token)
    .then((user) => res.json({ ok: true, user: user.login }))
    .catch((e) => { config.token = ""; saveConfig(); res.status(401).json({ error: e.message }); });
});

app.get("/api/token", (req, res) => {
  res.json({ hasToken: !!config.token });
});

// List branches from GitHub
app.get("/api/github/:owner/:repo/branches", async (req, res) => {
  try {
    const branches = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/branches?per_page=100", config.token);
    const info = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo, config.token);
    res.json({ branches: branches.map((b) => b.name), defaultBranch: info.default_branch, description: info.description });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Repos CRUD
app.get("/api/repos", (req, res) => {
  const withStatus = config.repos.map((r) => {
    const branchStatuses = {};
    for (const b of r.activeBranches || []) {
      branchStatuses[b] = buildStatus[buildKey(r.owner, r.repo, b)] || { status: "idle" };
    }
    return { ...r, branchStatuses };
  });
  res.json(withStatus);
});

app.post("/api/repos", (req, res) => {
  const { owner, repo, activeBranches, buildCommand, outputDir, baseDir, description } = req.body;
  const id = owner + "/" + repo;
  if (config.repos.some((r) => r.id === id)) return res.status(400).json({ error: "Already exists" });
  const newRepo = { id, owner, repo, activeBranches, buildCommand: buildCommand || "npm run build", outputDir: outputDir || "dist", baseDir: baseDir || "", description: description || "" };
  config.repos.push(newRepo);
  saveConfig();
  // Trigger initial builds
  for (const branch of activeBranches) buildBranch(newRepo, branch);
  res.json(newRepo);
});

app.delete("/api/repos/:owner/:repo", (req, res) => {
  const id = req.params.owner + "/" + req.params.repo;
  config.repos = config.repos.filter((r) => r.id !== id);
  saveConfig();
  res.json({ ok: true });
});

// Trigger rebuild — branch via query param to handle slashes
app.post("/api/build/:owner/:repo", (req, res) => {
  const branch = req.query.branch;
  if (!branch) return res.status(400).json({ error: "branch query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  buildBranch(repoConfig, branch);
  res.json({ ok: true, message: "Build started" });
});

// Build status — branch via query param
app.get("/api/status/:owner/:repo", (req, res) => {
  const branch = req.query.branch || "";
  const key = buildKey(req.params.owner, req.params.repo, branch);
  res.json(buildStatus[key] || { status: "idle" });
});

// Build log — branch via query param
app.get("/api/log/:owner/:repo", (req, res) => {
  const branch = req.query.branch || "";
  const key = buildKey(req.params.owner, req.params.repo, branch);
  const s = buildStatus[key];
  res.type("text/plain").send(s ? s.log : "No build log.");
});

// ── Serve built output ──
// Look up the actual output path from buildStatus
function findOutputDir(owner, repo, branchSlug) {
  for (const key in buildStatus) {
    const s = buildStatus[key];
    if (!s.outputPath) continue;
    const parts = key.split(":");
    const repoId = parts[0];
    const branch = parts.slice(1).join(":");
    if (repoId === owner + "/" + repo && branch.replace(/\//g, "__") === branchSlug) {
      return s.outputPath;
    }
  }
  return null;
}

// Serve index.html with absolute paths rewritten to relative
function serveIndex(outDir, res) {
  const indexPath = path.join(outDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    try {
      const files = fs.readdirSync(outDir);
      return res.status(404).send("index.html not found. Files: " + files.join(", "));
    } catch (e) {
      return res.status(404).send("Output error: " + e.message);
    }
  }
  let html = fs.readFileSync(indexPath, "utf8");
  // Rewrite absolute paths to relative: /assets/ → ./assets/, /favicon → ./favicon, etc.
  html = html.replace(/(src|href|content)="\/(?!\/)/g, '$1="./');
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", "");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
}

// Static assets (JS, CSS, images, etc.)
app.use("/preview/:owner/:repo/:branchSlug", (req, res, next) => {
  const outDir = findOutputDir(req.params.owner, req.params.repo, req.params.branchSlug);
  if (!outDir || !fs.existsSync(outDir)) return res.status(404).send("Not built yet.");
  const reqPath = req.path;
  if (reqPath === "/" || reqPath === "" || (!path.extname(reqPath) && !reqPath.includes("."))) {
    return serveIndex(outDir, res);
  }
  res.removeHeader("X-Frame-Options");
  express.static(outDir)(req, res, next);
});

// SPA fallback — any deep route serves index.html
app.use("/preview/:owner/:repo/:branchSlug/*", (req, res) => {
  const outDir = findOutputDir(req.params.owner, req.params.repo, req.params.branchSlug);
  if (!outDir) return res.status(404).send("Not built yet.");
  serveIndex(outDir, res);
});

// ── Start ──
app.listen(PORT, () => {
  console.log("");
  console.log("  ⚡ DeployView running on http://localhost:" + PORT);
  console.log("  Dashboard: http://localhost:" + PORT);
  console.log("  Previews:  http://localhost:" + PORT + "/preview/{owner}/{repo}/{branch}/");
  console.log("");
  if (config.token && config.repos.length) {
    console.log("  Auto-building " + config.repos.length + " repo(s)...");
    for (const repo of config.repos) {
      for (const branch of repo.activeBranches || []) buildBranch(repo, branch);
    }
  }
});
