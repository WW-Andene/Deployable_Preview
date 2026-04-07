const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { getConfig, saveConfig, parseEnvVars, getSecret } = require("../config");
const { ghApi } = require("../github");
const { buildStatus, branchSlug, buildKey, getBranchDir, deployBranch, cancelBuild } = require("../build");
const { runningServers, killServer } = require("../process");
const { loadLog, logStreams } = require("../logs");
const { apkStatus, buildApk, APK_DIR } = require("../apk");

// ── Simple rate limiting ─────────────────────────────────────────────────────
const _rateLimits = {};
function rateLimit(windowMs, maxRequests) {
  return function(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    if (!_rateLimits[ip] || _rateLimits[ip].reset < now) {
      _rateLimits[ip] = { count: 1, reset: now + windowMs };
    } else {
      _rateLimits[ip].count++;
    }
    if (_rateLimits[ip].count > maxRequests) {
      return res.status(429).json({ error: "Too many requests, try again later" });
    }
    next();
  };
}
// Clean up stale entries every 5 minutes
setInterval(function() {
  var now = Date.now();
  for (var ip in _rateLimits) { if (_rateLimits[ip].reset < now) delete _rateLimits[ip]; }
}, 5 * 60 * 1000);

// Apply rate limiting to mutation endpoints
router.post("/token", rateLimit(60000, 10));
router.post("/repos", rateLimit(60000, 20));
router.post("/build/:owner/:repo", rateLimit(30000, 5));
router.post("/webhook", rateLimit(5000, 30));

// ── Input validation helper ──────────────────────────────────────────────────
// Reject owner/repo names with characters that could break shell commands or paths
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateParams(req, res, next) {
  const { owner, repo } = req.params;
  if (owner && !SAFE_NAME_RE.test(owner)) return res.status(400).json({ error: "Invalid owner name" });
  if (repo && !SAFE_NAME_RE.test(repo)) return res.status(400).json({ error: "Invalid repo name" });
  next();
}

router.param("owner", validateParams);
router.param("repo", validateParams);

// Token
router.post("/token", (req, res) => {
  const config = getConfig();
  config.token = req.body.token || "";
  saveConfig();
  ghApi("/user", config.token)
    .then((user) => res.json({ ok: true, user: user.login }))
    .catch((e) => { config.token = ""; saveConfig(); res.status(401).json({ error: e.message }); });
});

router.get("/token", (req, res) => {
  res.json({ hasToken: !!getConfig().token });
});

// ── Secrets / Keys management ────────────────────────────────────────────────
// Known keys and their metadata
const SECRET_KEYS = [
  { key: "GITHUB_TOKEN",    envKey: "GITHUB_TOKEN",    label: "GitHub Token",         hint: "Personal Access Token with repo + workflow scope", link: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=DeployView" },
  { key: "NGROK_AUTHTOKEN", envKey: "NGROK_AUTHTOKEN", label: "ngrok Auth Token",     hint: "Free at ngrok.com — enables HTTPS tunnels for Claude web", link: "https://dashboard.ngrok.com/get-started/your-authtoken" },
  { key: "WEBHOOK_SECRET",  envKey: "WEBHOOK_SECRET",  label: "Webhook Secret",       hint: "GitHub webhook secret for HMAC signature verification (optional)" },
];

router.get("/secrets", (req, res) => {
  const config = getConfig();
  const secrets = config.secrets || {};
  // Return key metadata + masked values (never expose full secrets)
  const result = SECRET_KEYS.map((sk) => {
    const val = secrets[sk.key] || process.env[sk.envKey] || "";
    // For GitHub token, also check the legacy config.token field
    const effective = sk.key === "GITHUB_TOKEN" ? (val || config.token || "") : val;
    return {
      key: sk.key,
      label: sk.label,
      hint: sk.hint,
      link: sk.link || null,
      hasValue: !!effective,
      masked: effective ? effective.slice(0, 4) + "..." + effective.slice(-4) : "",
      source: secrets[sk.key] ? "config" : (process.env[sk.envKey] ? "env" : (sk.key === "GITHUB_TOKEN" && config.token ? "config" : "none"))
    };
  });
  res.json(result);
});

router.post("/secrets", (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const { key, value } = req.body;
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  // Only allow known keys
  const known = SECRET_KEYS.find((sk) => sk.key === key);
  if (!known) return res.status(400).json({ error: "Unknown key: " + key });
  if (value === undefined || value === null) return res.status(400).json({ error: "value required" });
  const trimmed = String(value).trim();
  if (trimmed) {
    config.secrets[key] = trimmed;
    // Also sync GitHub token to the legacy config.token field
    if (key === "GITHUB_TOKEN") config.token = trimmed;
    // Set in process.env so modules pick it up immediately
    if (known.envKey) process.env[known.envKey] = trimmed;
  } else {
    delete config.secrets[key];
    if (key === "GITHUB_TOKEN") config.token = "";
    if (known.envKey) delete process.env[known.envKey];
  }
  saveConfig();
  res.json({ ok: true, key, hasValue: !!trimmed });
});

router.delete("/secrets/:key", (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const key = req.params.key;
  const known = SECRET_KEYS.find((sk) => sk.key === key);
  if (!known) return res.status(400).json({ error: "Unknown key: " + key });
  delete config.secrets[key];
  if (key === "GITHUB_TOKEN") config.token = "";
  if (known.envKey) delete process.env[known.envKey];
  saveConfig();
  res.json({ ok: true, key, removed: true });
});

// GitHub branches — sorted by most recent commit
router.get("/github/:owner/:repo/branches", async (req, res) => {
  try {
    const config = getConfig();
    const branches = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/branches?per_page=100", config.token);
    const info = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo, config.token);
    // Sort: default branch first, then by commit date (newest first)
    // GitHub branches API includes commit.sha — fetch dates for top branches
    const withDates = branches.map((b) => ({
      name: b.name,
      sha: b.commit && b.commit.sha,
      date: b.commit && b.commit.url ? null : null // placeholder
    }));
    // Fetch commit dates in parallel (limit to first 30 to avoid rate limits)
    const toFetch = withDates.slice(0, 30);
    try {
      const dateResults = await Promise.all(toFetch.map((b) =>
        ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/commits/" + b.sha, config.token)
          .then((c) => ({ name: b.name, date: c.commit && c.commit.committer && c.commit.committer.date }))
          .catch(() => ({ name: b.name, date: null }))
      ));
      const dateMap = {};
      for (const d of dateResults) dateMap[d.name] = d.date;
      withDates.forEach((b) => { b.date = dateMap[b.name] || null; });
    } catch (e) { /* ignore date fetch errors, use unsorted */ }
    // Sort: default branch first, then by date descending
    withDates.sort((a, b) => {
      if (a.name === info.default_branch) return -1;
      if (b.name === info.default_branch) return 1;
      if (a.date && b.date) return new Date(b.date) - new Date(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ branches: withDates.map((b) => b.name), defaultBranch: info.default_branch, description: info.description });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Repos CRUD
router.get("/repos", (req, res) => {
  const config = getConfig();
  const withStatus = config.repos.map((r) => {
    const branchStatuses = {};
    for (const bc of r.activeBranches || []) {
      const slug = branchSlug(bc);
      const srv = runningServers[buildKey(r.owner, r.repo, bc)];
      branchStatuses[slug] = { ...(buildStatus[buildKey(r.owner, r.repo, bc)] || { status: "idle" }), branch: bc.branch, baseDir: bc.baseDir || "", buildCommand: bc.buildCommand || "", outputDir: bc.outputDir || "", mode: bc.mode || "static", startCommand: bc.startCommand || "", envVars: bc.envVars || "", serverPort: srv ? srv.port : null };
    }
    return { ...r, branchStatuses };
  });
  res.json(withStatus);
});

router.post("/repos", (req, res) => {
  const config = getConfig();
  const { owner, repo, activeBranches, buildCommand, outputDir, baseDir, description, mode, startCommand, envVars } = req.body;
  const id = owner + "/" + repo;
  if (config.repos.some((r) => r.id === id)) return res.status(400).json({ error: "Already exists" });
  const branchConfigs = (activeBranches || []).map((b) => {
    if (typeof b === "object") return b;
    return { branch: b, baseDir: baseDir || "", buildCommand: "", outputDir: "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "" };
  });
  const newRepo = { id, owner, repo, activeBranches: branchConfigs, buildCommand: buildCommand || "npm run build", outputDir: outputDir || "dist", baseDir: baseDir || "", description: description || "", startCommand: startCommand || "" };
  config.repos.push(newRepo);
  saveConfig();
  for (const bc of branchConfigs) deployBranch(newRepo, bc);
  res.json(newRepo);
});

router.post("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { branch, baseDir, buildCommand, outputDir, mode, startCommand, envVars } = req.body;
  if (!branch) return res.status(400).json({ error: "branch required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bd = baseDir || "";
  if (repoConfig.activeBranches.some((bc) => bc.branch === branch && (bc.baseDir || "") === bd))
    return res.status(400).json({ error: "Branch with this root directory already active" });
  const bc = { branch, baseDir: bd, buildCommand: buildCommand || "", outputDir: outputDir || "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "" };
  repoConfig.activeBranches.push(bc);
  saveConfig();
  deployBranch(repoConfig, bc);
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

router.delete("/repos/:owner/:repo", (req, res) => {
  const config = getConfig();
  config.repos = config.repos.filter((r) => r.id !== req.params.owner + "/" + req.params.repo);
  saveConfig();
  res.json({ ok: true });
});

router.delete("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const idx = repoConfig.activeBranches.findIndex((bc) => branchSlug(bc) === slug);
  if (idx === -1) return res.status(404).json({ error: "Branch config not found" });
  const bc = repoConfig.activeBranches[idx];
  const key = buildKey(req.params.owner, req.params.repo, bc);
  killServer(key);
  delete buildStatus[key];
  const dir = getBranchDir(req.params.owner, req.params.repo, bc);
  exec("rm -rf " + JSON.stringify(dir), () => {});
  repoConfig.activeBranches.splice(idx, 1);
  saveConfig();
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

// Stop server
router.post("/stop/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  if (runningServers[key]) { runningServers[key].manualStop = true; killServer(key); }
  if (buildStatus[key]) buildStatus[key].status = "stopped";
  res.json({ ok: true });
});

// Edit branch config
router.put("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { slug, baseDir, buildCommand, outputDir, mode, startCommand, envVars } = req.body;
  if (!slug) return res.status(400).json({ error: "slug required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return res.status(404).json({ error: "Branch config not found" });
  if (baseDir !== undefined) bc.baseDir = baseDir;
  if (buildCommand !== undefined) bc.buildCommand = buildCommand;
  if (outputDir !== undefined) bc.outputDir = outputDir;
  if (mode !== undefined) bc.mode = mode;
  if (startCommand !== undefined) bc.startCommand = startCommand;
  if (envVars !== undefined) bc.envVars = envVars;
  saveConfig();
  res.json({ ok: true, branch: bc });
});

// Webhook
router.post("/webhook", (req, res) => {
  const config = getConfig();
  // Verify webhook signature if WEBHOOK_SECRET is set
  const secret = getSecret("WEBHOOK_SECRET", "WEBHOOK_SECRET");
  if (secret) {
    const sig = req.headers["x-hub-signature-256"] || "";
    const body = JSON.stringify(req.body);
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }
  if (req.headers["x-github-event"] !== "push") return res.json({ ok: true, skipped: true });
  const ref = (req.body.ref || "").replace("refs/heads/", "");
  const fullName = req.body.repository && req.body.repository.full_name;
  if (!ref || !fullName) return res.status(400).json({ error: "Invalid payload" });
  const [owner, repo] = fullName.split("/");
  const repoConfig = config.repos.find((r) => r.owner === owner && r.repo === repo);
  if (!repoConfig) return res.json({ ok: true, skipped: true });
  let triggered = 0;
  for (const bc of repoConfig.activeBranches) {
    if (bc.branch === ref) {
      Promise.resolve(deployBranch(repoConfig, bc)).catch((e) => {
        console.error("[WEBHOOK] Build failed for " + fullName + ":" + ref + " — " + e.message);
      });
      triggered++;
    }
  }
  console.log("[WEBHOOK] " + fullName + ":" + ref + " — " + triggered + " build(s)");
  res.json({ ok: true, triggered });
});

// SSE log stream
router.get("/logs/stream", (req, res) => {
  const key = req.query.key || "";
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: " + JSON.stringify({ connected: true, key }) + "\n\n");
  const stream = { res, key, closed: false };
  logStreams.push(stream);
  req.on("close", () => { stream.closed = true; });
});

// Build trigger
router.post("/build/:owner/:repo", (req, res) => {
  const config = getConfig();
  const slug = req.query.slug || req.query.branch;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return res.status(404).json({ error: "Branch config not found" });
  deployBranch(repoConfig, bc);
  res.json({ ok: true, message: (bc.mode === "server" ? "Server restart" : "Build") + " started" });
});

// Cancel build
router.post("/cancel/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const cancelled = cancelBuild(key);
  if (cancelled) {
    res.json({ ok: true, message: "Build cancelled" });
  } else {
    res.json({ ok: false, message: "No active build to cancel" });
  }
});

// Status & log
router.get("/status/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.json(buildStatus[key] || { status: "idle" });
});

router.get("/log/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const s = buildStatus[key];
  const log = s && s.log ? s.log : loadLog(key);
  res.type("text/plain").send(log || "No build log.");
});

// ── APK build ──────────────────────────────────────────────────────────────

// Trigger APK build for a deployed branch
router.post("/apk/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  if (apkStatus[key] && apkStatus[key].status === "building") {
    return res.status(409).json({ error: "APK build already in progress" });
  }
  let workingDir = (req.body && req.body.workingDir) ? String(req.body.workingDir).trim() : ".";
  // Sanitize: reject path traversal attempts
  if (/\.\.[\\/]|[\\/]\.\./.test(workingDir) || /^[\\/]/.test(workingDir)) {
    return res.status(400).json({ error: "Invalid workingDir — must be a relative path without '..'" });
  }
  // fire and forget — client polls /api/apk/status
  buildApk(req.params.owner, req.params.repo, slug, workingDir);
  res.json({ ok: true, message: "APK build started" });
});

// Poll APK build status
router.get("/apk/:owner/:repo/status", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.json(apkStatus[key] || { status: "idle" });
});

// Stream APK build log (SSE)
router.get("/apk/:owner/:repo/log-stream", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");
  // send existing log
  if (apkStatus[key] && apkStatus[key].log) {
    res.write("data: " + JSON.stringify({ log: apkStatus[key].log }) + "\n\n");
  }
  const stream = { res, key: "apk:" + key, closed: false };
  logStreams.push(stream);
  req.on("close", () => { stream.closed = true; });
});

// Download the finished APK
router.get("/apk/:owner/:repo/download", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const st = apkStatus[key];
  if (!st || st.status !== "ready" || !st.apkPath) {
    return res.status(404).json({ error: "APK not ready" });
  }
  // Validate apkPath is inside APK_DIR to prevent path traversal
  const resolvedPath = path.resolve(st.apkPath);
  const resolvedDir  = path.resolve(APK_DIR);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    return res.status(403).json({ error: "Invalid APK path" });
  }
  if (!fs.existsSync(st.apkPath)) {
    return res.status(410).json({ error: "APK file missing — rebuild required" });
  }
  const safeOwner = req.params.owner.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeRepo  = req.params.repo.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSlug  = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename  = safeOwner + "-" + safeRepo + "-" + safeSlug + ".apk";
  res.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.sendFile(resolvedPath);
});

// ── MCP HTTP tools ─────────────────────────────────────────────────────────

const { TOOLS: mcpTools, handleTool: mcpHandleTool } = require("../mcp");
const mcpBrowser = require("../mcp-browser");

// List available MCP tools
router.get("/mcp/tools", (req, res) => {
  res.json({
    tools: mcpTools,
    playwrightAvailable: mcpBrowser.hasPlaywright(),
    hint: "POST /api/mcp/call with { tool, args } to invoke a tool"
  });
});

// Call an MCP tool via HTTP
router.post("/mcp/call", async (req, res) => {
  const { tool, args } = req.body;
  if (!tool) return res.status(400).json({ error: "tool name required" });
  try {
    const result = await mcpHandleTool(tool, args || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: screenshot
router.get("/mcp/screenshot/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.takeScreenshot({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      width: parseInt(req.query.width) || 1280,
      height: parseInt(req.query.height) || 720,
      fullPage: req.query.fullPage === "true",
      selector: req.query.selector
    });
    if (result.error) return res.status(500).json({ error: result.error });
    if (req.query.format === "json") return res.json(result);
    // Return as image
    const buf = Buffer.from(result.base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", buf.length);
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: inspect
router.get("/mcp/inspect/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.inspectDOM({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      selector: req.query.selector
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: console logs
router.get("/mcp/console/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.captureConsole({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      duration: parseInt(req.query.duration) || 3
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: interact
router.post("/mcp/interact/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.interact({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      ...req.body
    });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List previews (for MCP dashboard)
router.get("/mcp/previews", (req, res) => {
  res.json(mcpBrowser.listPreviews());
});

// ── Web Fetch tool (HTTP API) ──────────────────────────────────────────────

const { webFetch } = require("../web-fetch");

// Fetch a URL and return extracted content
router.post("/fetch", async (req, res) => {
  const { url, method, headers, body, timeout, extractText, extractLinks, extractMeta, extractImages, extractHeadings, selector, readability, maxTextLength } = req.body;
  if (!url) return res.status(400).json({ error: "url parameter is required" });
  try {
    const result = await webFetch({ url, method, headers, body, timeout, extractText, extractLinks, extractMeta, extractImages, extractHeadings, selector, readability, maxTextLength });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET shortcut for quick fetches
router.get("/fetch", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "url query parameter is required" });
  try {
    const result = await webFetch({
      url,
      extractText: req.query.text !== "false",
      extractLinks: req.query.links === "true",
      extractMeta: req.query.meta === "true",
      extractImages: req.query.images === "true",
      extractHeadings: req.query.headings === "true",
      readability: req.query.readability === "true",
      selector: req.query.selector,
      maxTextLength: req.query.maxTextLength ? parseInt(req.query.maxTextLength, 10) : undefined
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Workspace cleanup ─────────────────────────────────────────────────────
router.get("/workspace/stats", (req, res) => {
  const { WORKSPACE, buildStatus: bs, buildKey, branchSlug } = require("../build");
  try {
    const dirs = fs.readdirSync(WORKSPACE);
    const config = getConfig();
    // Determine which dirs are still active
    const activeKeys = new Set();
    for (const repo of config.repos) {
      for (const bc of repo.activeBranches || []) {
        activeKeys.add(repo.owner + "__" + repo.repo + "__" + branchSlug(bc));
      }
    }
    const stats = dirs.map((d) => {
      const fullPath = path.join(WORKSPACE, d);
      const isActive = activeKeys.has(d);
      return { name: d, active: isActive };
    });
    res.json({ total: dirs.length, active: stats.filter((s) => s.active).length, orphaned: stats.filter((s) => !s.active).length, dirs: stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/workspace/cleanup", (req, res) => {
  const { WORKSPACE, branchSlug } = require("../build");
  const config = getConfig();
  const activeKeys = new Set();
  for (const repo of config.repos) {
    for (const bc of repo.activeBranches || []) {
      activeKeys.add(repo.owner + "__" + repo.repo + "__" + branchSlug(bc));
    }
  }
  try {
    const dirs = fs.readdirSync(WORKSPACE);
    let removed = 0;
    for (const d of dirs) {
      if (!activeKeys.has(d)) {
        const fullPath = path.join(WORKSPACE, d);
        exec("rm -rf " + JSON.stringify(fullPath), () => {});
        removed++;
      }
    }
    res.json({ ok: true, removed, remaining: dirs.length - removed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Config export/import ──────────────────────────────────────────────────
router.get("/config/export", (req, res) => {
  const config = getConfig();
  // Strip the token for safety
  const safe = { ...config, token: config.token ? "[redacted]" : "" };
  res.setHeader("Content-Disposition", 'attachment; filename="deployview-config.json"');
  res.json(safe);
});

router.post("/config/import", (req, res) => {
  const config = getConfig();
  const imported = req.body;
  if (!imported || !Array.isArray(imported.repos)) {
    return res.status(400).json({ error: "Invalid config: repos array required" });
  }
  // Merge: add repos that don't already exist
  let added = 0;
  for (const repo of imported.repos) {
    if (!repo.owner || !repo.repo) continue;
    if (!SAFE_NAME_RE.test(repo.owner) || !SAFE_NAME_RE.test(repo.repo)) continue;
    const id = repo.owner + "/" + repo.repo;
    if (config.repos.some((r) => r.id === id)) continue;
    config.repos.push({ ...repo, id });
    added++;
  }
  if (added > 0) saveConfig();
  res.json({ ok: true, added, total: config.repos.length });
});

// ── Tunnel routes (HTTPS exposure for Claude.ai MCP) ─────────────────────────

const tunnel = require("../tunnel");

// GET /api/tunnel/status
router.get("/tunnel/status", (req, res) => {
  res.json(tunnel.status());
});

// POST /api/tunnel/start  — body: { port?: number }
router.post("/tunnel/start", async (req, res) => {
  const port = (req.body && req.body.port) || process.env.PORT || 3000;
  try {
    const result = await tunnel.start(port);
    res.json({ ok: true, url: result.url, provider: tunnel.status().provider });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/tunnel/stop
router.post("/tunnel/stop", (req, res) => {
  tunnel.stop();
  res.json({ ok: true });
});

module.exports = router;
