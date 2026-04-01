const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "deployview.json");

let config = { token: "", repos: [] };

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) { console.error("Config load error:", e.message); }
}

function saveConfig() {
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

module.exports = { loadConfig, saveConfig, getConfig, migrateConfig, parseEnvVars };
