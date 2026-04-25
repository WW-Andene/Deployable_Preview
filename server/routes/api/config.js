// ── Config sub-router ────────────────────────────────────────────────────────
// Token, repos, branches, secrets, preferences, workspace, config export/import

const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { getConfig, saveConfig, getSecret } = require("../../config");
const { ghApi } = require("../../github");
const { buildStatus, branchSlug, buildKey, getBranchDir, deployBranch } = require("../../build");
const { runningServers, killServer } = require("../../process");

// ── Token ────────────────────────────────────────────────────────────────────
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
  { key: "GROQ_API_KEY",       label: "Groq API Key",         hint: "Enables visual_query / find_element / visual_diff / verify_loop (vision-model Q&A on screenshots)", link: "https://console.groq.com/keys" },
  { key: "VERCEL_TOKEN",       label: "Vercel Token",         hint: "For Vercel API integrations" },
  { key: "SUPABASE_KEY",       label: "Supabase Key",         hint: "Supabase project API key" },
  { key: "DATABASE_URL",       label: "Database URL",         hint: "PostgreSQL / MySQL connection string" },
  { key: "STRIPE_SECRET_KEY",  label: "Stripe Secret Key",    hint: "For payment integrations", link: "https://dashboard.stripe.com/apikeys" },
  { key: "RESEND_API_KEY",     label: "Resend API Key",       hint: "For email sending", link: "https://resend.com/api-keys" },
];
const SAFE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

// F-C015: don't leak the leading bytes \u2014 token-type prefixes (ghp_, sk-, \u2026)
// already shrink the search space; combined with the trailing 4 they hand
// an attacker a useful brute-force prefix. Show only the trailing 4.
function maskValue(val) {
  if (!val) return "";
  if (val.length <= 4) return "\u2022\u2022\u2022\u2022";
  return "\u2022\u2022\u2022\u2022" + val.slice(-4);
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

// F-C018: cap the number of stored secrets so a misbehaving caller can't
// fill deployview.json with junk and OOM the parser on next load.
const MAX_SECRETS = 200;

router.post("/secrets", (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const { key, value } = req.body;
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!SAFE_KEY_RE.test(key)) return res.status(400).json({ error: "Invalid key name \u2014 use A-Z, 0-9, _ only" });
  if (value === undefined || value === null) return res.status(400).json({ error: "value required" });
  // Block adding new keys when at cap; updates to existing keys still allowed.
  if (!Object.prototype.hasOwnProperty.call(config.secrets, key) && Object.keys(config.secrets).length >= MAX_SECRETS) {
    return res.status(429).json({ error: "Secret cap reached (" + MAX_SECRETS + ")" });
  }
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

// ── GitHub branches ──────────────────────────────────────────────────────────
// Per-SHA commit-date cache. SHA → ISO date string. Commits are immutable
// so a SHA's date never changes; this turns the N+1 GitHub call into 0
// once a branch list has been fetched once. LRU-capped to 1024 entries.
const _commitDateCache = new Map();
function _cacheGetDate(sha) {
  const v = _commitDateCache.get(sha);
  if (v !== undefined) {
    // Refresh recency
    _commitDateCache.delete(sha);
    _commitDateCache.set(sha, v);
  }
  return v;
}
function _cachePutDate(sha, date) {
  if (_commitDateCache.size >= 1024) {
    _commitDateCache.delete(_commitDateCache.keys().next().value);
  }
  _commitDateCache.set(sha, date);
}

// ── User's GitHub repositories ──────────────────────────────────────────────
// GET /api/github/repos?type=all|owner|member&search=foo
// Returns the authenticated user's repos (own + collaborator + org member),
// sorted by recent activity. 5-minute cache so polling the picker stays cheap.
let _reposCache = null; // { fetchedAt, type, data }
const REPOS_CACHE_TTL_MS = 5 * 60 * 1000;

router.get("/github/repos", async (req, res) => {
  try {
    const config = getConfig();
    if (!config.token) return res.status(401).json({ error: "GitHub token not set" });
    const type = (req.query.type || "all").toLowerCase();
    const force = req.query.refresh === "1";
    const now = Date.now();
    if (!force && _reposCache && _reposCache.type === type && (now - _reposCache.fetchedAt) < REPOS_CACHE_TTL_MS) {
      return res.json({ repos: _reposCache.data, cached: true, ageMs: now - _reposCache.fetchedAt });
    }
    // Pull up to 3 pages (300 repos). GitHub caps per_page at 100.
    // sort=updated puts recently-touched repos first.
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const path = "/user/repos?per_page=100&sort=updated&type=" + encodeURIComponent(type) + "&page=" + page;
      const batch = await ghApi(path, config.token);
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const r of batch) {
        all.push({
          owner: r.owner && r.owner.login,
          repo: r.name,
          fullName: r.full_name,
          description: r.description || "",
          private: !!r.private,
          fork: !!r.fork,
          archived: !!r.archived,
          defaultBranch: r.default_branch,
          updatedAt: r.updated_at,
          pushedAt: r.pushed_at,
          stars: r.stargazers_count || 0,
          language: r.language || null
        });
      }
      if (batch.length < 100) break;
    }
    _reposCache = { fetchedAt: now, type, data: all };
    res.json({ repos: all, cached: false, count: all.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/github/:owner/:repo/branches", async (req, res) => {
  try {
    const config = getConfig();
    const branches = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/branches?per_page=100", config.token);
    const info = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo, config.token);
    const withDates = branches.map((b) => ({
      name: b.name,
      sha: b.commit && b.commit.sha,
      date: null
    }));
    // Look up cached SHAs first; only fetch what we don't already know.
    // The GitHub branches endpoint doesn't include commit dates, but commits
    // are immutable, so caching by SHA collapses repeat polls to zero calls.
    const need = [];
    for (const b of withDates.slice(0, 30)) {
      const cached = b.sha ? _cacheGetDate(b.sha) : null;
      if (cached !== undefined && cached !== null) b.date = cached;
      else if (b.sha) need.push(b);
    }
    if (need.length) {
      try {
        const dateResults = await Promise.all(need.map((b) =>
          ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/commits/" + b.sha, config.token)
            .then((c) => ({ name: b.name, sha: b.sha, date: c.commit && c.commit.committer && c.commit.committer.date }))
            .catch(() => ({ name: b.name, sha: b.sha, date: null }))
        ));
        const dateMap = {};
        for (const d of dateResults) {
          dateMap[d.name] = d.date;
          if (d.date) _cachePutDate(d.sha, d.date);
        }
        for (const b of withDates) { if (b.date == null) b.date = dateMap[b.name] || null; }
      } catch (_) { /* fall through with whatever dates we have */ }
    }
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

// ── Framework detection ──────────────────────────────────────────────────────
// Peek at a repo's package.json on a given branch and suggest sensible
// build / output / start defaults. Best-effort — errors are reported inline
// so the client can still render the form.
router.get("/github/:owner/:repo/detect", async (req, res) => {
  const branch = req.query.branch || "";
  const baseDir = req.query.baseDir || "";
  const pkgPath = (baseDir ? baseDir.replace(/^\/|\/$/g, "") + "/" : "") + "package.json";
  const { detect } = require("../../framework-detect");
  try {
    const config = getConfig();
    const url = "/repos/" + req.params.owner + "/" + req.params.repo +
                "/contents/" + encodeURI(pkgPath) +
                (branch ? "?ref=" + encodeURIComponent(branch) : "");
    const meta = await ghApi(url, config.token);
    if (!meta || !meta.content) return res.json({ framework: "unknown", confidence: "none", reason: "no package.json" });
    const raw = Buffer.from(meta.content, meta.encoding || "base64").toString("utf8");
    let pkg;
    try { pkg = JSON.parse(raw); } catch (e) { return res.json({ framework: "unknown", confidence: "none", reason: "invalid package.json: " + e.message }); }
    res.json(detect(pkg));
  } catch (e) {
    // package.json missing on this branch → let the client treat it as "no hint"
    if (/Not Found/i.test(e.message)) { res.json({ framework: "none", confidence: "none", reason: "no package.json on this branch" }); return; }
    res.status(400).json({ error: e.message });
  }
});

// ── Repos CRUD ───────────────────────────────────────────────────────────────
router.get("/repos", (req, res) => {
  const config = getConfig();
  const crypto = require("crypto");
  const withStatus = config.repos.map((r) => {
    const branchStatuses = {};
    for (const bc of r.activeBranches || []) {
      const slug = branchSlug(bc);
      const bk = buildKey(r.owner, r.repo, bc);
      const srv = runningServers[bk];
      // Strip heavy fields (thumb base64, full log) from the broadcast shape —
      // expose them on dedicated endpoints instead.
      const raw = buildStatus[bk] || { status: "idle" };
      // eslint-disable-next-line no-unused-vars
      const { thumb, diffThumb, log, ...lean } = raw;
      branchStatuses[slug] = {
        ...lean,
        hasThumb: !!raw.thumb,
        hasDiffThumb: !!raw.diffThumb,
        thumbAt: raw.thumbAt || null,
        branch: bc.branch,
        baseDir: bc.baseDir || "",
        buildCommand: bc.buildCommand || "",
        outputDir: bc.outputDir || "",
        mode: bc.mode || "static",
        startCommand: bc.startCommand || "",
        envVars: bc.envVars || "",
        language: bc.language || "auto",
        serverPort: srv ? srv.port : null
      };
    }
    return { ...r, branchStatuses };
  });
  // Stable hash → ETag. Lets clients short-circuit polling when nothing
  // has actually changed (returns 304 with no body).
  const body = JSON.stringify(withStatus);
  const etag = '"' + crypto.createHash("sha1").update(body).digest("base64").slice(0, 16) + '"';
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  res.type("application/json").send(body);
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

// Edit branch config
// D3: customSlug must be unique per repo and a-zA-Z0-9_- only.
const CUSTOM_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;

router.put("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { slug, baseDir, buildCommand, outputDir, mode, startCommand, envVars, language, customSlug, previewPassword } = req.body;
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
  if (previewPassword !== undefined) bc.previewPassword = String(previewPassword || "");
  if (req.body.injectSecrets !== undefined) bc.injectSecrets = !!req.body.injectSecrets;
  if (req.body.edge !== undefined) {
    // Light validation — accept the shape, ignore garbage. Redirect
    // statuses get coerced to a known set; missing arrays default to [].
    const e = req.body.edge && typeof req.body.edge === "object" ? req.body.edge : {};
    bc.edge = {
      redirects: Array.isArray(e.redirects) ? e.redirects.filter(function(r){ return r && r.from && r.to; }).map(function(r){
        return { from: String(r.from), to: String(r.to), status: [301,302,307,308].indexOf(Number(r.status)) !== -1 ? Number(r.status) : 302 };
      }) : [],
      headers: Array.isArray(e.headers) ? e.headers.filter(function(h){ return h && typeof h.headers === "object"; }).map(function(h){
        return { pathPattern: String(h.pathPattern || "/*"), headers: h.headers };
      }) : []
    };
  }
  if (req.body.envGroupIds !== undefined) {
    bc.envGroupIds = Array.isArray(req.body.envGroupIds)
      ? req.body.envGroupIds.filter(function(x){ return typeof x === "string" && x; })
      : [];
  }
  if (customSlug !== undefined) {
    const cs = String(customSlug || "").trim();
    if (cs === "") {
      bc.customSlug = "";
    } else {
      if (!CUSTOM_SLUG_RE.test(cs)) {
        return res.status(400).json({ error: "Invalid customSlug — letters, numbers, _ and - only (1–64 chars)" });
      }
      // Uniqueness check across this repo's branches (excluding self)
      const collision = (repoConfig.activeBranches || []).some(function(other) {
        if (other === bc) return false;
        if (other.customSlug && other.customSlug === cs) return true;
        // Also reject if the alias would collide with another branch's
        // auto-slug, since both resolve through the same routing key.
        if (!other.customSlug && branchSlug(other) === cs) return true;
        return false;
      });
      if (collision) return res.status(409).json({ error: "customSlug already in use by another branch in this repo" });
      bc.customSlug = cs;
    }
  }
  saveConfig();
  res.json({ ok: true, branch: bc });
});

// ── Env-var groups (E1) ───────────────────────────────────────────────────
// Reusable named bundles of KEY=value pairs. Branches reference groups
// by id via envGroupIds; resolveBranchEnv merges them into the build/run
// environment.
const SAFE_ID_RE  = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

router.get("/env-groups", (req, res) => {
  const cfg = getConfig();
  // Don't leak values — return key list + count only. Use the inspect
  // endpoint when the user wants to see/edit a single group's values.
  const groups = (cfg.envGroups || []).map(function(g){
    return { id: g.id, name: g.name, keys: Object.keys(g.vars || {}), keyCount: Object.keys(g.vars || {}).length };
  });
  res.json({ groups });
});

router.get("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  const g = (cfg.envGroups || []).find(function(x){ return x.id === req.params.id; });
  if (!g) return res.status(404).json({ error: "group not found" });
  // Mask values like the secrets endpoint — last 4 only.
  const masked = {};
  for (const k of Object.keys(g.vars || {})) {
    const v = String(g.vars[k] || "");
    masked[k] = v.length <= 4 ? "••••" : "••••" + v.slice(-4);
  }
  res.json({ id: g.id, name: g.name, vars: masked, keyCount: Object.keys(g.vars || {}).length });
});

router.post("/env-groups", (req, res) => {
  const cfg = getConfig();
  if (!Array.isArray(cfg.envGroups)) cfg.envGroups = [];
  const { id, name, vars } = req.body || {};
  if (!id || !SAFE_ID_RE.test(id)) return res.status(400).json({ error: "id required (a-z, 0-9, _ or -, ≤64 chars)" });
  if (cfg.envGroups.some(function(g){ return g.id === id; })) return res.status(409).json({ error: "id already exists" });
  // Validate each key
  const cleanVars = {};
  if (vars && typeof vars === "object" && !Array.isArray(vars)) {
    for (const k of Object.keys(vars)) {
      if (!SAFE_ENV_RE.test(k)) return res.status(400).json({ error: "Invalid var name '" + k + "' — A-Z, 0-9, _ only" });
      const v = vars[k];
      if (typeof v !== "string") return res.status(400).json({ error: "Var '" + k + "' must be a string" });
      cleanVars[k] = v;
    }
  }
  cfg.envGroups.push({ id, name: String(name || id), vars: cleanVars });
  saveConfig();
  res.json({ ok: true, id });
});

router.put("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  const g = (cfg.envGroups || []).find(function(x){ return x.id === req.params.id; });
  if (!g) return res.status(404).json({ error: "group not found" });
  const { name, vars } = req.body || {};
  if (typeof name === "string" && name) g.name = name;
  if (vars && typeof vars === "object" && !Array.isArray(vars)) {
    const cleanVars = {};
    for (const k of Object.keys(vars)) {
      if (!SAFE_ENV_RE.test(k)) return res.status(400).json({ error: "Invalid var name '" + k + "'" });
      const v = vars[k];
      if (typeof v !== "string") return res.status(400).json({ error: "Var '" + k + "' must be a string" });
      cleanVars[k] = v;
    }
    g.vars = cleanVars;
  }
  saveConfig();
  res.json({ ok: true, id: g.id });
});

router.delete("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  if (!Array.isArray(cfg.envGroups)) return res.status(404).json({ error: "no groups" });
  const before = cfg.envGroups.length;
  cfg.envGroups = cfg.envGroups.filter(function(g){ return g.id !== req.params.id; });
  if (cfg.envGroups.length === before) return res.status(404).json({ error: "group not found" });
  saveConfig();
  res.json({ ok: true });
});

// ── Custom domains (H4) ────────────────────────────────────────────────────
// Map hostnames → (owner, repo, slug). Server-side this is just a
// lookup the customDomainsMiddleware does on every request. The user
// owns the DNS — they CNAME their domain at the DV host.
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

router.get("/domains", (req, res) => {
  const cfg = getConfig();
  const map = (cfg && cfg.domains) || {};
  res.json({ domains: Object.keys(map).map(function(host){ return Object.assign({ host: host }, map[host]); }) });
});

router.post("/domains", (req, res) => {
  const { host, owner, repo, slug } = req.body || {};
  const h = String(host || "").toLowerCase().trim();
  if (!HOST_RE.test(h)) return res.status(400).json({ error: "Invalid host (must be a real DNS name)" });
  if (!owner || !repo || !slug) return res.status(400).json({ error: "owner, repo, slug required" });
  const cfg = getConfig();
  // Validate the target points at a configured branch.
  const r = (cfg.repos || []).find(function(x){ return x.owner === owner && x.repo === repo; });
  if (!r) return res.status(404).json({ error: "Repo not configured: " + owner + "/" + repo });
  const bc = (r.activeBranches || []).find(function(b){ return branchSlug(b) === slug; });
  if (!bc) return res.status(404).json({ error: "Branch not configured for slug: " + slug });
  if (!cfg.domains) cfg.domains = {};
  cfg.domains[h] = { owner, repo, slug };
  saveConfig();
  res.json({ ok: true, host: h, target: { owner, repo, slug }, hint: "Point '" + h + "' at this server via DNS A or CNAME, then visit https://" + h });
});

router.delete("/domains/:host", (req, res) => {
  const cfg = getConfig();
  const h = String(req.params.host || "").toLowerCase().trim();
  if (!cfg.domains || !cfg.domains[h]) return res.status(404).json({ error: "host not mapped" });
  delete cfg.domains[h];
  saveConfig();
  res.json({ ok: true });
});

// ── Workspace cleanup ─────────────────────────────────────────────────────
router.get("/workspace/stats", (req, res) => {
  const { WORKSPACE, buildStatus: bs, buildKey, branchSlug } = require("../../build");
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
  const { WORKSPACE, branchSlug } = require("../../build");
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
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

router.get("/config/export", (req, res) => {
  const config = getConfig();
  // Strip secrets, token, and apiSecret for safety — export only structure
  const safe = { ...config, token: config.token ? "[redacted]" : "", secrets: undefined, apiSecret: undefined, preferences: config.preferences || {}, __version: "1.1" };
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

module.exports = router;
