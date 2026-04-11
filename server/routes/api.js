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
// Suggested keys with hints (but any key is allowed)
const SUGGESTED_KEYS = [
  { key: "GITHUB_TOKEN",       label: "GitHub Token",         hint: "Personal Access Token with repo + workflow scope", link: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=DeployView" },
  { key: "NGROK_AUTHTOKEN",    label: "ngrok Auth Token",     hint: "Free at ngrok.com \u2014 enables HTTPS tunnels", link: "https://dashboard.ngrok.com/get-started/your-authtoken" },
  { key: "BROWSERLESS_API_KEY",label: "Browserless API Key",  hint: "Remote browser for screenshots on mobile/Android \u2014 free 1k units", link: "https://www.browserless.io/pricing" },
  { key: "BROWSER_WS_ENDPOINT",label: "Browser WS Endpoint",  hint: "Custom Chrome DevTools WebSocket URL (overrides Browserless)" },
  { key: "WEBHOOK_SECRET",     label: "Webhook Secret",       hint: "GitHub webhook HMAC verification (optional)" },
  { key: "OPENAI_API_KEY",     label: "OpenAI API Key",       hint: "For AI-powered features in your apps", link: "https://platform.openai.com/api-keys" },
  { key: "ANTHROPIC_API_KEY",  label: "Anthropic API Key",    hint: "Claude API access for your apps", link: "https://console.anthropic.com/settings/keys" },
  { key: "VERCEL_TOKEN",       label: "Vercel Token",         hint: "For Vercel API integrations" },
  { key: "SUPABASE_KEY",       label: "Supabase Key",         hint: "Supabase project API key" },
  { key: "DATABASE_URL",       label: "Database URL",         hint: "PostgreSQL / MySQL connection string" },
  { key: "STRIPE_SECRET_KEY",  label: "Stripe Secret Key",    hint: "For payment integrations", link: "https://dashboard.stripe.com/apikeys" },
  { key: "RESEND_API_KEY",     label: "Resend API Key",       hint: "For email sending", link: "https://resend.com/api-keys" },
];
const SAFE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function maskValue(val) {
  if (!val) return "";
  if (val.length <= 8) return val.slice(0, 2) + "...";
  return val.slice(0, 4) + "\u2022\u2022\u2022" + val.slice(-4);
}

router.get("/secrets", (req, res) => {
  const config = getConfig();
  const secrets = config.secrets || {};
  // Merge: suggested keys + any custom keys already saved
  const allKeys = new Map();
  for (const sk of SUGGESTED_KEYS) allKeys.set(sk.key, { ...sk });
  for (const k of Object.keys(secrets)) {
    if (!allKeys.has(k)) allKeys.set(k, { key: k, label: k, hint: "Custom key" });
  }
  const result = [];
  for (const [key, meta] of allKeys) {
    let val = secrets[key] || process.env[key] || "";
    if (key === "GITHUB_TOKEN" && !val) val = config.token || "";
    result.push({
      key,
      label: meta.label || key,
      hint: meta.hint || "",
      link: meta.link || null,
      suggested: SUGGESTED_KEYS.some((sk) => sk.key === key),
      hasValue: !!val,
      masked: maskValue(val),
      source: secrets[key] ? "config" : (process.env[key] ? "env" : (key === "GITHUB_TOKEN" && config.token ? "config" : "none"))
    });
  }
  res.json(result);
});

router.get("/secrets/suggestions", (req, res) => {
  res.json(SUGGESTED_KEYS);
});

router.post("/secrets", (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const { key, value } = req.body;
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!SAFE_KEY_RE.test(key)) return res.status(400).json({ error: "Invalid key name \u2014 use A-Z, 0-9, _ only" });
  if (value === undefined || value === null) return res.status(400).json({ error: "value required" });
  const trimmed = String(value).trim();
  if (trimmed) {
    config.secrets[key] = trimmed;
    if (key === "GITHUB_TOKEN") config.token = trimmed;
    process.env[key] = trimmed;
  } else {
    delete config.secrets[key];
    if (key === "GITHUB_TOKEN") config.token = "";
    delete process.env[key];
  }
  saveConfig();
  res.json({ ok: true, key, hasValue: !!trimmed });
});

router.delete("/secrets/:key", (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const key = req.params.key;
  delete config.secrets[key];
  if (key === "GITHUB_TOKEN") config.token = "";
  delete process.env[key];
  saveConfig();
  res.json({ ok: true, key, removed: true });
});

// ── Preferences ──────────────────────────────────────────────────────────────
router.get("/preferences", (req, res) => {
  const config = getConfig();
  res.json(config.preferences || {});
});

router.post("/preferences", (req, res) => {
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  const updates = req.body;
  if (typeof updates !== "object" || updates === null || Array.isArray(updates)) return res.status(400).json({ error: "Object required" });
  for (const key of Object.keys(updates)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    config.preferences[key] = updates[key];
  }
  saveConfig();
  res.json({ ok: true, preferences: config.preferences });
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
      branchStatuses[slug] = { ...(buildStatus[buildKey(r.owner, r.repo, bc)] || { status: "idle" }), branch: bc.branch, baseDir: bc.baseDir || "", buildCommand: bc.buildCommand || "", outputDir: bc.outputDir || "", mode: bc.mode || "static", startCommand: bc.startCommand || "", envVars: bc.envVars || "", language: bc.language || "auto", serverPort: srv ? srv.port : null };
    }
    return { ...r, branchStatuses };
  });
  res.json(withStatus);
});

router.post("/repos", (req, res) => {
  const config = getConfig();
  const { owner, repo, activeBranches, buildCommand, outputDir, baseDir, description, mode, startCommand, envVars, language } = req.body;
  const id = owner + "/" + repo;
  if (config.repos.some((r) => r.id === id)) return res.status(400).json({ error: "Already exists" });
  const branchConfigs = (activeBranches || []).map((b) => {
    if (typeof b === "object") return b;
    return { branch: b, baseDir: baseDir || "", buildCommand: "", outputDir: "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "", language: language || "auto" };
  });
  const newRepo = { id, owner, repo, activeBranches: branchConfigs, buildCommand: buildCommand || "", outputDir: outputDir || "", baseDir: baseDir || "", description: description || "", startCommand: startCommand || "" };
  config.repos.push(newRepo);
  saveConfig();
  for (const bc of branchConfigs) deployBranch(newRepo, bc);
  res.json(newRepo);
});

router.post("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { branch, baseDir, buildCommand, outputDir, mode, startCommand, envVars, language } = req.body;
  if (!branch) return res.status(400).json({ error: "branch required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bd = baseDir || "";
  if (repoConfig.activeBranches.some((bc) => bc.branch === branch && (bc.baseDir || "") === bd))
    return res.status(400).json({ error: "Branch with this root directory already active" });
  const bc = { branch, baseDir: bd, buildCommand: buildCommand || "", outputDir: outputDir || "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "", language: language || "auto" };
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
  const { slug, baseDir, buildCommand, outputDir, mode, startCommand, envVars, language } = req.body;
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
  if (language !== undefined) bc.language = language;
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
    // Use raw body (preserved by express.json verify option) for accurate HMAC
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
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

// ── Browse URL (network request capture via headless browser) ─────────────

// POST /api/browse — load any URL in a headless browser and return all network requests
router.post("/browse", async (req, res) => {
  const {
    url, waitMs, waitUntil, width, height,
    filter, returnHtml, captureConsole, maxRequests, userAgent, headers
  } = req.body || {};
  if (!url) return res.status(400).json({ error: "url parameter is required" });
  try {
    const result = await mcpBrowser.browseUrl({
      url, waitMs, waitUntil, width, height,
      filter, returnHtml, captureConsole, maxRequests, userAgent, headers
    });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/browse?url=... — quick shortcut for read-only browsing
router.get("/browse", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "url query parameter is required" });
  const filter = {};
  if (req.query.resourceTypes) filter.resourceTypes = String(req.query.resourceTypes).split(",").map((s) => s.trim()).filter(Boolean);
  if (req.query.extensions)    filter.extensions    = String(req.query.extensions).split(",").map((s) => s.trim()).filter(Boolean);
  if (req.query.urlPattern)    filter.urlPattern    = req.query.urlPattern;
  try {
    const result = await mcpBrowser.browseUrl({
      url,
      waitMs:     req.query.waitMs ? parseInt(req.query.waitMs, 10) : undefined,
      waitUntil:  req.query.waitUntil,
      width:      req.query.width  ? parseInt(req.query.width, 10)  : undefined,
      height:     req.query.height ? parseInt(req.query.height, 10) : undefined,
      filter:     Object.keys(filter).length ? filter : undefined,
      returnHtml: req.query.returnHtml === "true",
      captureConsole: req.query.captureConsole !== "false",
      maxRequests: req.query.maxRequests ? parseInt(req.query.maxRequests, 10) : undefined,
      userAgent:  req.query.userAgent
    });
    if (result.error) return res.status(400).json(result);
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
        const fullPath = path.resolve(WORKSPACE, d);
        // Safety: ensure resolved path is inside WORKSPACE
        if (!fullPath.startsWith(path.resolve(WORKSPACE) + path.sep)) continue;
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
  // Strip secrets and token for safety — export only structure
  const safe = { ...config, token: config.token ? "[redacted]" : "", secrets: undefined, preferences: config.preferences || {} };
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

// ── Browser setup ─────────────────────────────────────────────────────────
// Test remote browser connection — step by step diagnostic
router.get("/browser/test", async (req, res) => {
  const steps = [];
  try {
    const { getSecret } = require("../config");
    const token = getSecret("BROWSERLESS_API_KEY", "BROWSERLESS_API_KEY");
    const wsUrl = getSecret("BROWSER_WS_ENDPOINT", "BROWSER_WS_ENDPOINT");
    steps.push("token_length: " + (token || "").length);
    steps.push("ws_url: " + (wsUrl || "none"));

    const endpoint = wsUrl || (token ? "wss://production-sfo.browserless.io?token=" + token : null);
    if (!endpoint) {
      return res.json({ ok: false, error: "No BROWSERLESS_API_KEY or BROWSER_WS_ENDPOINT set", steps });
    }
    steps.push("endpoint: " + endpoint.replace(/token=[^&]+/, "token=***"));

    let pptr;
    try { pptr = require("puppeteer-core"); steps.push("puppeteer-core: loaded"); }
    catch (_) { try { pptr = require("puppeteer"); steps.push("puppeteer: loaded"); } catch (_2) { return res.json({ ok: false, error: "No puppeteer library", steps }); } }

    steps.push("connecting...");
    const browser = await pptr.connect({ browserWSEndpoint: endpoint });
    steps.push("connected: " + browser.isConnected());

    steps.push("newPage...");
    const page = await browser.newPage();
    steps.push("page created");

    steps.push("setViewport...");
    await page.setViewport({ width: 320, height: 240 });
    steps.push("viewport set");

    steps.push("goto about:blank...");
    await page.goto("about:blank", { waitUntil: "networkidle0", timeout: 10000 });
    steps.push("navigated");

    steps.push("screenshot...");
    const buf = await page.screenshot({ type: "png" });
    steps.push("screenshot: " + buf.length + " bytes");

    await page.close();
    browser.disconnect();
    steps.push("done");

    res.json({ ok: true, steps });
  } catch (e) {
    steps.push("ERROR: " + e.message);
    res.json({ ok: false, error: e.message, steps, stack: e.stack ? e.stack.split("\n").slice(0, 3) : [] });
  }
});

router.get("/browser/status", (req, res) => {
  try {
    const { getActiveBrowser } = require("../browser-setup");
    const { hasPlaywright } = require("../mcp-browser");
    const preferred = (getConfig().preferences || {}).browser || "off";
    const active = getActiveBrowser();
    res.json({
      active: active,
      ready: preferred !== "off" && !!active && hasPlaywright(),
      preferred: preferred
    });
  } catch (e) { res.json({ active: null, ready: false, preferred: "off" }); }
});

router.post("/browser/setup", async (req, res) => {
  const { ensureBrowser } = require("../browser-setup");
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  const engine = (req.body && req.body.engine) || "playwright";
  config.preferences.browser = engine;
  saveConfig();
  try {
    await ensureBrowser();
    const { getActiveBrowser } = require("../browser-setup");
    res.json({ ok: true, active: getActiveBrowser() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.post("/browser/disable", (req, res) => {
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  config.preferences.browser = "off";
  saveConfig();
  try {
    const mcpBrowser = require("../mcp-browser");
    mcpBrowser.closeBrowser().catch(() => {});
  } catch (_) {}
  res.json({ ok: true });
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
