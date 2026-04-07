const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "deployview.json");

let config = { token: "", repos: [], secrets: {}, preferences: {} };

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw);
      // Validate basic structure
      if (typeof parsed === "object" && parsed !== null) {
        config = parsed;
        if (!Array.isArray(config.repos)) config.repos = [];
        if (typeof config.token !== "string") config.token = "";
        if (typeof config.secrets !== "object" || config.secrets === null) config.secrets = {};
        if (typeof config.preferences !== "object" || config.preferences === null) config.preferences = {};
      } else {
        throw new Error("Config is not an object");
      }
    }
  } catch (e) {
    console.error("Config load error:", e.message);
    // Try to recover from backup
    const backupFile = CONFIG_FILE + ".bak";
    if (fs.existsSync(backupFile)) {
      console.log("  Attempting recovery from backup...");
      try {
        config = JSON.parse(fs.readFileSync(backupFile, "utf8"));
        console.log("  Recovered from backup.");
      } catch (_) { console.error("  Backup also corrupt. Starting fresh."); }
    }
  }
}

function saveConfig() {
  // Write backup first, then main file (atomic-ish save)
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + ".bak");
    }
  } catch (_) {}
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

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

// Get a secret: config.secrets[key] first, then process.env[envKey] fallback
function getSecret(key, envKey) {
  const val = config.secrets && config.secrets[key];
  if (val) return val;
  if (envKey && process.env[envKey]) return process.env[envKey];
  return "";
}

module.exports = { loadConfig, saveConfig, getConfig, migrateConfig, parseEnvVars, getSecret };
