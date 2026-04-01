const express = require("express");
const { execSync, exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const net = require("net");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
const WORKSPACE = path.join(__dirname, "..", "workspace");
const CONFIG_FILE = path.join(__dirname, "..", "deployview.json");
const POLL_INTERVAL = 30000; // 30s

// ── State ──
let config = { token: "", repos: [] };
let buildStatus = {}; // { "owner/repo:slug": { status, log, lastBuild, commitSha } }
let runningServers = {}; // { "owner/repo:slug": { proc, port, status } }

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) { console.error("Config load error:", e.message); }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

loadConfig();
migrateConfig();
if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

// Migrate old config: convert activeBranches from string[] to object[]
function migrateConfig() {
  let changed = false;
  for (const repo of config.repos || []) {
    if (!repo.activeBranches || !repo.activeBranches.length) continue;
    if (typeof repo.activeBranches[0] === "string") {
      const defaultBaseDir = repo.baseDir || "";
      repo.activeBranches = repo.activeBranches.map((b) => ({
        branch: b,
        baseDir: defaultBaseDir,
        buildCommand: "",
        outputDir: ""
      }));
      changed = true;
    }
  }
  if (changed) saveConfig();
}

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
function branchSlug(bc) {
  if (typeof bc === "string") return bc.replace(/\//g, "__");
  var slug = bc.branch.replace(/\//g, "__");
  if (bc.baseDir) slug += "--" + bc.baseDir.replace(/\//g, "__");
  return slug;
}
function getBranchDir(owner, repo, bc) { return path.join(WORKSPACE, owner + "__" + repo + "__" + branchSlug(bc)); }
function buildKey(owner, repo, bc) { return owner + "/" + repo + ":" + branchSlug(bc); }

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

async function buildBranch(repoConfig, branchConfig) {
  const { owner, repo } = repoConfig;
  const branch = branchConfig.branch;
  const key = buildKey(owner, repo, branchConfig);
  const branchDir = getBranchDir(owner, repo, branchConfig);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "" };
  let log = "";

  function addLog(msg) {
    log += msg + "\n";
    buildStatus[key].log = log;
    console.log("[" + key + "] " + msg);
  }

  try {
    // Simple approach: each branch gets its own full clone
    if (!fs.existsSync(path.join(branchDir, ".git"))) {
      // First time: clone and checkout this branch
      addLog("Cloning " + owner + "/" + repo + " (branch: " + branch + ")...");
      fs.mkdirSync(branchDir, { recursive: true });
      await runCmd("git clone --branch " + JSON.stringify(branch) + " --single-branch https://" + config.token + "@github.com/" + owner + "/" + repo + ".git .", branchDir);
    } else {
      // Already cloned: fetch and hard reset to latest
      addLog("Updating branch: " + branch);
      await runCmd("git fetch origin " + JSON.stringify(branch), branchDir);
      await runCmd("git reset --hard origin/" + JSON.stringify(branch), branchDir);
    }

    // Get current commit
    const sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
    buildStatus[key].commitSha = sha;
    addLog("Commit: " + sha.slice(0, 7));

    // Determine the actual working directory (baseDir support — per-branch override)
    const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
    const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;

    if (baseDir) {
      addLog("Base directory: " + baseDir);
      if (!fs.existsSync(workDir)) {
        throw new Error("Base directory '" + baseDir + "' not found in repo");
      }
    }

    // Clean old build artifacts
    addLog("Cleaning...");
    await runCmd("rm -rf node_modules dist build out web-build", workDir).catch(() => {});

    // Install dependencies
    addLog("Installing dependencies...");
    const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
    const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
    if (hasPnpmLock) {
      await runCmd("pnpm install", workDir);
    } else if (hasYarnLock) {
      await runCmd("yarn install", workDir);
    } else {
      await runCmd("npm install", workDir);
    }

    // Build (per-branch override > repo default > fallback)
    const cmd = branchConfig.buildCommand || repoConfig.buildCommand || "npm run build";
    addLog("Building: " + cmd);
    await runCmd(cmd, workDir);

    // Determine output directory (search inside workDir, not repo root)
    const outName = branchConfig.outputDir || repoConfig.outputDir || "dist";
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

// ── Server mode: spawn and proxy ──
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => { sock.destroy(); retry(); });
      sock.once("timeout", () => { sock.destroy(); retry(); });
      sock.connect(port, "127.0.0.1");
    }
    function retry() {
      if (Date.now() - start > timeout) reject(new Error("Server did not start within " + (timeout / 1000) + "s"));
      else setTimeout(check, 500);
    }
    check();
  });
}

function killServer(key) {
  const srv = runningServers[key];
  if (!srv || !srv.proc) return;
  try { srv.proc.kill("SIGTERM"); } catch (e) {}
  delete runningServers[key];
}

async function startServer(repoConfig, branchConfig) {
  const { owner, repo } = repoConfig;
  const branch = branchConfig.branch;
  const key = buildKey(owner, repo, branchConfig);
  const branchDir = getBranchDir(owner, repo, branchConfig);

  // Kill existing process
  killServer(key);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "", mode: "server" };
  let log = "";

  function addLog(msg) {
    log += msg + "\n";
    buildStatus[key].log = log;
    console.log("[" + key + "] " + msg);
  }

  try {
    // Clone / update (same as buildBranch)
    if (!fs.existsSync(path.join(branchDir, ".git"))) {
      addLog("Cloning " + owner + "/" + repo + " (branch: " + branch + ")...");
      fs.mkdirSync(branchDir, { recursive: true });
      await runCmd("git clone --branch " + JSON.stringify(branch) + " --single-branch https://" + config.token + "@github.com/" + owner + "/" + repo + ".git .", branchDir);
    } else {
      addLog("Updating branch: " + branch);
      await runCmd("git fetch origin " + JSON.stringify(branch), branchDir);
      await runCmd("git reset --hard origin/" + JSON.stringify(branch), branchDir);
    }

    const sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
    buildStatus[key].commitSha = sha;
    addLog("Commit: " + sha.slice(0, 7));

    const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
    const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;

    if (baseDir) {
      addLog("Base directory: " + baseDir);
      if (!fs.existsSync(workDir)) throw new Error("Base directory '" + baseDir + "' not found in repo");
    }

    // Install dependencies
    addLog("Installing dependencies...");
    const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
    const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
    if (hasPnpmLock) {
      await runCmd("pnpm install", workDir);
    } else if (hasYarnLock) {
      await runCmd("yarn install", workDir);
    } else {
      await runCmd("npm install", workDir);
    }

    // Find a free port and start the server
    const port = await findFreePort();
    const startCmd = branchConfig.startCommand || repoConfig.startCommand || "npm start";
    addLog("Starting server: " + startCmd + " (port " + port + ")");

    const child = spawn("sh", ["-c", startCmd], {
      cwd: workDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    runningServers[key] = { proc: child, port, status: "starting" };

    child.stdout.on("data", (d) => {
      const line = d.toString();
      log += line;
      buildStatus[key].log = log;
    });
    child.stderr.on("data", (d) => {
      const line = d.toString();
      log += line;
      buildStatus[key].log = log;
    });
    child.on("exit", (code) => {
      addLog("Server exited with code " + code);
      if (runningServers[key] && runningServers[key].proc === child) {
        runningServers[key].status = "stopped";
        buildStatus[key].status = "error";
      }
    });

    // Wait for the port to be listening
    addLog("Waiting for server to be ready on port " + port + "...");
    await waitForPort(port, 60000);

    addLog("Server is running on port " + port);
    runningServers[key].status = "running";
    buildStatus[key].status = "running";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].serverPort = port;

  } catch (e) {
    addLog("SERVER FAILED: " + e.message);
    killServer(key);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
  }
}

// Dispatch to build or start based on mode
function deployBranch(repoConfig, branchConfig) {
  if (branchConfig.mode === "server") {
    startServer(repoConfig, branchConfig);
  } else {
    buildBranch(repoConfig, branchConfig);
  }
}

// Proxy helper for server-mode branches
function proxyTo(port, req, res) {
  const opts = {
    hostname: "127.0.0.1",
    port: port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + port }
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", (e) => {
    res.status(502).send("Server not responding: " + e.message);
  });
  req.pipe(proxyReq);
}

// ── Polling for new commits ──
async function pollForChanges() {
  if (!config.token) return;
  for (const repo of config.repos) {
    // Deduplicate: only poll each unique branch name once, then rebuild all configs for that branch
    const branchNames = [...new Set((repo.activeBranches || []).map((bc) => bc.branch))];
    for (const branch of branchNames) {
      try {
        const data = await ghApi("/repos/" + repo.owner + "/" + repo.repo + "/commits?sha=" + branch + "&per_page=1", config.token);
        const latest = data[0];
        if (!latest) continue;
        // Rebuild all configs for this branch if new commit
        for (const bc of repo.activeBranches) {
          if (bc.branch !== branch) continue;
          const key = buildKey(repo.owner, repo.repo, bc);
          const current = buildStatus[key];
          if (current && current.commitSha && current.commitSha !== latest.sha && current.status !== "building") {
            console.log("[POLL] New commit on " + key + ": " + latest.sha.slice(0, 7));
            deployBranch(repo, bc);
          }
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
    for (const bc of r.activeBranches || []) {
      const slug = branchSlug(bc);
      const srv = runningServers[buildKey(r.owner, r.repo, bc)];
      branchStatuses[slug] = { ...(buildStatus[buildKey(r.owner, r.repo, bc)] || { status: "idle" }), branch: bc.branch, baseDir: bc.baseDir || "", buildCommand: bc.buildCommand || "", outputDir: bc.outputDir || "", mode: bc.mode || "static", startCommand: bc.startCommand || "", serverPort: srv ? srv.port : null };
    }
    return { ...r, branchStatuses };
  });
  res.json(withStatus);
});

app.post("/api/repos", (req, res) => {
  const { owner, repo, activeBranches, buildCommand, outputDir, baseDir, description, mode, startCommand } = req.body;
  const id = owner + "/" + repo;
  if (config.repos.some((r) => r.id === id)) return res.status(400).json({ error: "Already exists" });
  // Convert branch names to branch config objects
  const branchConfigs = (activeBranches || []).map((b) => {
    if (typeof b === "object") return b;
    return { branch: b, baseDir: baseDir || "", buildCommand: "", outputDir: "", mode: mode || "static", startCommand: startCommand || "" };
  });
  const newRepo = { id, owner, repo, activeBranches: branchConfigs, buildCommand: buildCommand || "npm run build", outputDir: outputDir || "dist", baseDir: baseDir || "", description: description || "", startCommand: startCommand || "" };
  config.repos.push(newRepo);
  saveConfig();
  for (const bc of branchConfigs) deployBranch(newRepo, bc);
  res.json(newRepo);
});

// Add a single branch to an existing repo (used from preview view)
// Allows the same branch with a different baseDir (for multi-root repos)
app.post("/api/repos/:owner/:repo/branch", (req, res) => {
  const { branch, baseDir, buildCommand, outputDir, mode, startCommand } = req.body;
  if (!branch) return res.status(400).json({ error: "branch required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bd = baseDir || "";
  // Check for duplicate: same branch + same baseDir
  const duplicate = repoConfig.activeBranches.some((bc) => bc.branch === branch && (bc.baseDir || "") === bd);
  if (duplicate) return res.status(400).json({ error: "Branch with this root directory already active" });
  const bc = { branch, baseDir: bd, buildCommand: buildCommand || "", outputDir: outputDir || "", mode: mode || "static", startCommand: startCommand || "" };
  repoConfig.activeBranches.push(bc);
  saveConfig();
  deployBranch(repoConfig, bc);
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

app.delete("/api/repos/:owner/:repo", (req, res) => {
  const id = req.params.owner + "/" + req.params.repo;
  config.repos = config.repos.filter((r) => r.id !== id);
  saveConfig();
  res.json({ ok: true });
});

// Remove a single branch config by slug
app.delete("/api/repos/:owner/:repo/branch", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const idx = repoConfig.activeBranches.findIndex((bc) => branchSlug(bc) === slug);
  if (idx === -1) return res.status(404).json({ error: "Branch config not found" });
  // Kill running server if any
  const key = buildKey(req.params.owner, req.params.repo, repoConfig.activeBranches[idx]);
  killServer(key);
  repoConfig.activeBranches.splice(idx, 1);
  saveConfig();
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

// Trigger rebuild — slug via query param (or legacy branch param)
app.post("/api/build/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return res.status(404).json({ error: "Branch config not found" });
  deployBranch(repoConfig, bc);
  res.json({ ok: true, message: (bc.mode === "server" ? "Server restart" : "Build") + " started" });
});

// Build status — slug via query param
app.get("/api/status/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.json(buildStatus[key] || { status: "idle" });
});

// Build log — slug via query param
app.get("/api/log/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const s = buildStatus[key];
  res.type("text/plain").send(s ? s.log : "No build log.");
});

// ── Serve built output ──
// Look up the actual output path from buildStatus
function findOutputDir(owner, repo, slug) {
  // Build key format: "owner/repo:slug"
  const expectedKey = owner + "/" + repo + ":" + slug;
  if (buildStatus[expectedKey] && buildStatus[expectedKey].outputPath) {
    return buildStatus[expectedKey].outputPath;
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

  // PWA shim: fix service worker registration and manifest paths
  // When apps use absolute paths like register('/sw.js', {scope: '/'}),
  // they break under /preview/... subpaths. This rewrites them to relative.
  const pwaShim = `<script>(function(){
if(navigator.serviceWorker){var r=navigator.serviceWorker.register.bind(navigator.serviceWorker);
navigator.serviceWorker.register=function(u,o){
if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u='.'+u;
if(o&&o.scope&&o.scope.startsWith('/')&&!o.scope.startsWith('//'))o=Object.assign({},o,{scope:'.'+o.scope});
return r(u,o);};}
var B=window.Blob;window.Blob=function(p,o){
if(o&&o.type==='application/json'&&p&&p[0]){try{var m=JSON.parse(p[0]);
if(m.start_url&&m.display){if(m.start_url==='/')m.start_url='./';
if(!m.scope||m.scope==='/')m.scope='./';
return new B([JSON.stringify(m)],o);}}catch(e){}}
return new B(p,o);};window.Blob.prototype=B.prototype;
})();</script>`;

  // Inject shim right after <head> (before any other scripts)
  html = html.replace(/<head([^>]*)>/i, '<head$1>' + pwaShim);

  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", "");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
}

// Static assets / server proxy
app.use("/preview/:owner/:repo/:branchSlug", (req, res, next) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;

  // Server mode: proxy to the running process
  const srv = runningServers[key];
  if (srv && srv.status === "running") {
    res.removeHeader("X-Frame-Options");
    return proxyTo(srv.port, req, res);
  }

  // Static mode: serve built output
  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir || !fs.existsSync(outDir)) return res.status(404).send("Not built yet.");
  const reqPath = req.path;
  if (reqPath === "/" || reqPath === "" || (!path.extname(reqPath) && !reqPath.includes("."))) {
    return serveIndex(outDir, res);
  }
  res.removeHeader("X-Frame-Options");
  express.static(outDir)(req, res, next);
});

// SPA fallback / server proxy for deep routes
app.use("/preview/:owner/:repo/:branchSlug/*", (req, res) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;

  // Server mode: proxy
  const srv = runningServers[key];
  if (srv && srv.status === "running") {
    res.removeHeader("X-Frame-Options");
    return proxyTo(srv.port, req, res);
  }

  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir) return res.status(404).send("Not built yet.");
  serveIndex(outDir, res);
});

// ══════════════════════════════
//  REMOTE TEST HARNESS
//  Allows Claude Code to fetch runtime errors via API
// ══════════════════════════════

// Store for test results (keyed by branch slug)
const testResults = {};

// API: Get test results (Claude fetches this)
app.get("/api/test-results/:owner/:repo/:branchSlug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.branchSlug;
  res.json(testResults[key] || { status: "no-results", message: "Open /test/... in your browser first" });
});

// API: Receive test results from the browser harness
app.post("/api/test-results/:owner/:repo/:branchSlug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.branchSlug;
  testResults[key] = { ...req.body, timestamp: Date.now() };
  console.log("[TEST] Results received for " + key + ": " + req.body.errors?.length + " errors, " + req.body.warnings?.length + " warnings");
  res.json({ ok: true });
});

// Serve the test harness page — inline JS for comprehensive UI testing
app.get("/test/:owner/:repo/:branchSlug", (req, res) => {
  const { owner, repo, branchSlug } = req.params;
  const previewUrl = "/preview/" + owner + "/" + repo + "/" + branchSlug + "/";
  const apiUrl = "/api/test-results/" + owner + "/" + repo + "/" + branchSlug;

  // Load the full test harness from the external file
  const harnessPath = path.join(__dirname, "test-harness.js");
  let harnessJS = "";
  try { harnessJS = fs.readFileSync(harnessPath, "utf8"); } catch (e) { harnessJS = "document.body.innerHTML='<h1>test-harness.js not found</h1>';"; }

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Full Run Test — ${repo} / ${branchSlug}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;background:#0a0e17;color:#e0e0e0;padding:12px}
  h1{color:#edaf18;font-size:16px;margin-bottom:6px}
  .controls{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .controls button{background:#edaf18;color:#000;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:inherit;font-size:13px}
  .controls button:hover{background:#ffc942}
  .controls button.sec{background:#1a1e28;color:#edaf18;border:1px solid #edaf18}
  .controls button.sec:hover{background:#2a2e38}
  #status{color:#60a5fa;font-size:13px;margin:6px 0}
  #progress{width:100%;height:4px;background:#1a1e28;border-radius:2px;margin:4px 0;overflow:hidden}
  #progress-bar{height:100%;background:#edaf18;width:0%;transition:width 0.3s}
  #log{background:#111520;border:1px solid #222;border-radius:8px;padding:10px;height:400px;overflow-y:auto;font-size:11px;line-height:1.6;white-space:pre-wrap}
  .e{color:#f87171} .w{color:#fbbf24} .ok{color:#4ade80} .i{color:#60a5fa} .s{color:#c084fc;font-weight:bold;margin-top:8px}
  .dim{color:#565250}
  iframe{width:100%;height:500px;border:1px solid #333;border-radius:8px;margin-top:8px;background:#000}
  .sum{margin-top:8px;padding:10px;border-radius:8px;font-weight:bold;font-size:14px}
  .sum.pass{background:#064e3b;color:#4ade80;border:1px solid #4ade80}
  .sum.fail{background:#450a0a;color:#f87171;border:1px solid #f87171}
  .stats{display:flex;gap:12px;margin:8px 0;font-size:12px}
  .stat-box{padding:6px 12px;border-radius:6px;background:#1a1e28;border:1px solid #222}
  .stat-box .num{font-size:18px;font-weight:bold}
  .stat-box .lbl{color:#666;font-size:10px;text-transform:uppercase}
</style>
</head>
<body>
<h1>\u26a1 Full Run Test — ${branchSlug}</h1>
<div class="controls">
  <button onclick="runFullTest()">Run Full Test</button>
  <button class="sec" onclick="runQuickTest()">Quick Test</button>
  <button class="sec" onclick="copyLog()">Copy Report</button>
</div>
<div id="progress"><div id="progress-bar"></div></div>
<div id="status">Click "Run Full Test" to start</div>
<div id="stats-row" class="stats" style="display:none"></div>
<div id="log"></div>
<div id="sum"></div>
<iframe id="app" src="${previewUrl}"></iframe>
<script>
const PREVIEW_URL='${previewUrl}';
const API_URL='${apiUrl}';
const BRANCH='${branchSlug}';
${harnessJS}
<\/script>
</body>
</html>`);
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
      for (const bc of repo.activeBranches || []) deployBranch(repo, bc);
    }
  }
});
