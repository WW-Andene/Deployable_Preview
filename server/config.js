const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_FILE = path.join(__dirname, "..", "deployview.json");

let config = { token: "", repos: [], secrets: {}, preferences: {}, apiSecret: "" };

// Last schema validation report — exposed via /api/health.
let _lastValidation = { ok: true, fixes: [], errors: [] };

function getValidationReport() { return _lastValidation; }

// Schema: each field describes the expected shape. Fields are repaired in
// place where possible; unrepairable inconsistencies go into errors.
function validateAndRepairConfig(c, report) {
  if (typeof c !== "object" || c === null || Array.isArray(c)) {
    report.errors.push("root: expected object");
    return { token: "", repos: [], secrets: {}, preferences: {} };
  }
  if (typeof c.token !== "string") { report.fixes.push("token: non-string → ''"); c.token = ""; }
  if (typeof c.secrets !== "object" || c.secrets === null || Array.isArray(c.secrets)) {
    report.fixes.push("secrets: non-object → {}"); c.secrets = {};
  }
  if (typeof c.preferences !== "object" || c.preferences === null || Array.isArray(c.preferences)) {
    report.fixes.push("preferences: non-object → {}"); c.preferences = {};
  }
  if (!Array.isArray(c.repos)) { report.fixes.push("repos: non-array → []"); c.repos = []; }
  c.repos = c.repos.filter(function(r, i) {
    if (!r || typeof r !== "object") { report.errors.push("repos[" + i + "]: not an object, dropped"); return false; }
    if (typeof r.owner !== "string" || !r.owner) { report.errors.push("repos[" + i + "]: missing owner, dropped"); return false; }
    if (typeof r.repo  !== "string" || !r.repo)  { report.errors.push("repos[" + i + "]: missing repo, dropped"); return false; }
    return true;
  });
  for (let i = 0; i < c.repos.length; i++) {
    const r = c.repos[i];
    if (!Array.isArray(r.activeBranches)) { report.fixes.push("repos[" + i + "].activeBranches: non-array → []"); r.activeBranches = []; }
    r.activeBranches = r.activeBranches.filter(function(bc, j) {
      if (typeof bc === "string") return true; // legacy format, migrated elsewhere
      if (!bc || typeof bc !== "object" || typeof bc.branch !== "string" || !bc.branch) {
        report.errors.push("repos[" + i + "].activeBranches[" + j + "]: missing branch name, dropped");
        return false;
      }
      return true;
    });
    // Coerce nullable string fields
    for (const k of ["baseDir", "buildCommand", "outputDir", "description", "startCommand", "envVars", "mode", "language"]) {
      if (r[k] != null && typeof r[k] !== "string") { report.fixes.push("repos[" + i + "]." + k + ": non-string → ''"); r[k] = ""; }
    }
  }
  return c;
}

function loadConfig() {
  _lastValidation = { ok: true, fixes: [], errors: [] };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw);
      config = validateAndRepairConfig(parsed, _lastValidation);
      _lastValidation.ok = _lastValidation.errors.length === 0;
      if (_lastValidation.fixes.length) {
        console.log("  Config auto-repaired: " + _lastValidation.fixes.length + " field(s)");
        for (const f of _lastValidation.fixes) console.log("    - " + f);
        saveConfig(); // persist the repairs
      }
      if (_lastValidation.errors.length) {
        console.warn("  Config validation errors (data dropped):");
        for (const e of _lastValidation.errors) console.warn("    - " + e);
      }
    }
  } catch (e) {
    console.error("Config load error:", e.message);
    _lastValidation.ok = false;
    _lastValidation.errors.push("parse: " + e.message);
    // Try to recover from backup
    const backupFile = CONFIG_FILE + ".bak";
    if (fs.existsSync(backupFile)) {
      console.log("  Attempting recovery from backup...");
      try {
        const parsed = JSON.parse(fs.readFileSync(backupFile, "utf8"));
        config = validateAndRepairConfig(parsed, _lastValidation);
        console.log("  Recovered from backup.");
      } catch (_) { console.error("  Backup also corrupt. Starting fresh."); }
    }
  }
}

// F-NEW-B002: serialised async save chain. saveConfig() schedules the
// write and returns immediately; calls during an in-flight save queue
// behind it so we never race the .tmp+rename. Errors propagate via the
// returned promise but callers historically didn't await — we keep that
// behaviour and just log save errors instead.
let _savingChain = Promise.resolve();
function saveConfig() {
  // Snapshot the payload synchronously so concurrent mutations between
  // schedule and write don't leak into the wrong on-disk state.
  const payload = JSON.stringify(config, null, 2);
  const tmpFile = CONFIG_FILE + ".tmp";
  _savingChain = _savingChain.then(async () => {
    try {
      // Take a backup of the previous good file (best-effort) so a corrupted
      // write can be recovered from .bak on next startup.
      try { if (fs.existsSync(CONFIG_FILE)) await fs.promises.copyFile(CONFIG_FILE, CONFIG_FILE + ".bak"); } catch (_) {}
      // Atomic write: stage to .tmp then rename. POSIX rename is atomic;
      // on Windows fs.rename overwrites.
      try {
        await fs.promises.writeFile(tmpFile, payload);
        await fs.promises.rename(tmpFile, CONFIG_FILE);
      } catch (e) {
        try { await fs.promises.writeFile(CONFIG_FILE, payload); }
        catch (_) { throw e; }
      }
    } catch (err) {
      console.error("[config] save failed:", err.message);
    }
    // Notify SSOT subscribers — best-effort.
    for (const cb of _saveSubscribers) {
      try { cb(config); } catch (err) { console.warn("[config] save subscriber threw: " + err.message); }
    }
  });
  return _savingChain;
}

// SSOT enforcement: callers register here to be notified after every save
// so they can prune/refresh derived state (e.g. drop buildStatus entries
// for branches no longer in config.repos).
const _saveSubscribers = new Set();
function onConfigSaved(cb) { _saveSubscribers.add(cb); return () => _saveSubscribers.delete(cb); }

function getConfig() { return config; }

function migrateConfig() {
  let changed = false;
  for (const repo of config.repos || []) {
    if (!repo.activeBranches || !repo.activeBranches.length) continue;
    if (typeof repo.activeBranches[0] === "string") {
      const defaultBaseDir = repo.baseDir || "";
      repo.activeBranches = repo.activeBranches.map((b) => ({
        branch: b, baseDir: defaultBaseDir, buildCommand: "", outputDir: ""
      }));
      changed = true;
    }
  }
  if (changed) saveConfig();
}

function parseEnvVars(envStr) {
  const env = {};
  if (!envStr) return env;
  for (const line of envStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// E1+E2: resolve the full env handed to a build / server-mode start.
// Layered, with later entries overriding earlier ones:
//   1. Secrets from config.secrets (only if branch.injectSecrets is true)
//   2. Each referenced env-var group's vars (in branch.envGroupIds order)
//   3. The repo-level envVars text field
//   4. The branch-level envVars text field (highest priority — last word)
//
// Group definitions live in config.envGroups: [{ id, name, vars: {…} }].
// Missing groups are skipped silently (don't break a build because a
// group was renamed). Returns a plain object suitable to spread into
// process.env when spawning the build / server process.
function resolveBranchEnv(repoConfig, branchConfig) {
  const out = {};
  // 1. Inject ALL stored secrets if explicitly opted in.
  if (branchConfig && branchConfig.injectSecrets && config && config.secrets) {
    for (const k of Object.keys(config.secrets)) {
      const v = config.secrets[k];
      if (typeof v === "string" && v) out[k] = v;
    }
  }
  // 2. Env-var groups in the order the branch references them.
  const groupIds = (branchConfig && Array.isArray(branchConfig.envGroupIds)) ? branchConfig.envGroupIds : [];
  const groups = (config && Array.isArray(config.envGroups)) ? config.envGroups : [];
  for (const id of groupIds) {
    const g = groups.find(function(x){ return x && x.id === id; });
    if (!g || !g.vars) continue;
    for (const k of Object.keys(g.vars)) {
      const v = g.vars[k];
      if (typeof v === "string") out[k] = v;
    }
  }
  // 3. Repo-level envVars (legacy free-text field).
  if (repoConfig && repoConfig.envVars) {
    Object.assign(out, parseEnvVars(repoConfig.envVars));
  }
  // 4. Branch-level envVars wins.
  if (branchConfig && branchConfig.envVars) {
    Object.assign(out, parseEnvVars(branchConfig.envVars));
  }
  return out;
}

// Get a secret: config.secrets[key] first, then process.env[envKey] fallback
function getSecret(key, envKey) {
  const val = config.secrets && config.secrets[key];
  if (val) return val;
  if (envKey && process.env[envKey]) return process.env[envKey];
  return "";
}

// Auto-generated API auth token used to gate /api when reached via tunnel.
// Localhost requests bypass it; non-localhost callers must supply it via
// X-DV-Token header, ?dv_token= query, or dv_token= cookie.
function getApiSecret() {
  if (!config.apiSecret) {
    config.apiSecret = crypto.randomBytes(24).toString("base64url");
    try { saveConfig(); } catch (_) {}
  }
  return config.apiSecret;
}

module.exports = { loadConfig, saveConfig, getConfig, migrateConfig, parseEnvVars, resolveBranchEnv, getSecret, getApiSecret, getValidationReport, validateAndRepairConfig, onConfigSaved };
