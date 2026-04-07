/**
 * server/tunnel.js — HTTPS tunnel manager for DeployView
 *
 * Tries in order:
 *   1. cloudflared  (system install, or auto-downloaded binary)
 *   2. localtunnel  (via JS API — npm install, no CLI hang)
 */

"use strict";

const { spawn, execSync, spawnSync } = require("child_process");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");
const os     = require("os");

let proc  = null;
let state = { running: false, url: null, provider: null, error: null };
let _resolve = null;

const ROOT    = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, ".tunnel-bin");

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractCloudflaredUrl(text) {
  const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  return m ? m[0] : null;
}

function extractLocaltunnelUrl(text) {
  const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
  return m ? m[0] : null;
}

function cleanup() {
  if (proc) { try { proc.kill("SIGKILL"); } catch (_) {} proc = null; }
}

function which(cmd) {
  try {
    return execSync("which " + cmd + " 2>/dev/null", {
      stdio: ["ignore", "pipe", "ignore"], timeout: 3000
    }).toString().trim() || null;
  } catch (_) { return null; }
}

// ── cloudflared auto-download ─────────────────────────────────────────────────

function cloudflaredBinPath() {
  const platform = os.platform();
  const arch     = os.arch();

  let name;
  if (platform === "linux") {
    name = arch === "arm64" ? "cloudflared-linux-arm64"
         : arch === "arm"   ? "cloudflared-linux-arm"
         :                    "cloudflared-linux-amd64";
  } else if (platform === "darwin") {
    name = arch === "arm64" ? "cloudflared-darwin-arm64"
         :                    "cloudflared-darwin-amd64";
  } else if (platform === "win32") {
    name = arch === "arm64" ? "cloudflared-windows-arm64.exe"
         :                    "cloudflared-windows-amd64.exe";
  } else {
    return null;
  }

  return path.join(BIN_DIR, name);
}

function downloadCloudflared(destPath) {
  return new Promise((resolve, reject) => {
    const binName = path.basename(destPath);
    const url = "https://github.com/cloudflare/cloudflared/releases/latest/download/" + binName;
    console.log("  [tunnel] Downloading cloudflared from GitHub releases...");

    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

    const tmpPath = destPath + ".tmp";
    const file    = fs.createWriteStream(tmpPath);

    function get(urlStr) {
      https.get(urlStr, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + res.statusCode + " downloading cloudflared"));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tmpPath, destPath);
            try { fs.chmodSync(destPath, 0o755); } catch (_) {}
            console.log("  [tunnel] cloudflared downloaded to " + destPath);
            resolve(destPath);
          });
        });
      }).on("error", (err) => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
    }

    get(url);
  });
}

async function ensureCloudflared() {
  // 1. Already on PATH?
  const system = which("cloudflared");
  if (system) return system;

  // 2. Previously downloaded?
  const binPath = cloudflaredBinPath();
  if (!binPath) return null;
  if (fs.existsSync(binPath)) return binPath;

  // 3. Download it now
  try {
    return await downloadCloudflared(binPath);
  } catch (e) {
    console.warn("  [tunnel] Could not download cloudflared: " + e.message);
    return null;
  }
}

// ── localtunnel JS API (fallback) ─────────────────────────────────────────────

function ensureLocaltunnelPackage() {
  try { require.resolve("localtunnel"); return true; } catch (_) {}

  console.log("  [tunnel] Installing localtunnel npm package...");
  const r = spawnSync("npm", ["install", "localtunnel", "--no-save"], {
    cwd: ROOT,
    stdio: "inherit",
    timeout: 90 * 1000,
    shell: process.platform === "win32"
  });
  if (r.status !== 0) {
    console.warn("  [tunnel] npm install localtunnel failed (exit " + r.status + ")");
    return false;
  }
  console.log("  [tunnel] localtunnel installed.");
  return true;
}

function tryLocaltunnelApi(port, onUrl, onFail) {
  if (!ensureLocaltunnelPackage()) {
    onFail(new Error("Could not install localtunnel"));
    return;
  }

  try {
    const localtunnel = require(path.join(ROOT, "node_modules", "localtunnel"));
    localtunnel({ port })
      .then((tunnel) => {
        // Shim so cleanup() can close it
        proc = { kill: () => { try { tunnel.close(); } catch (_) {} } };
        tunnel.on("close", () => { state.running = false; state.url = null; proc = null; });
        tunnel.on("error", (err) => { console.warn("  [tunnel] localtunnel error: " + err.message); });
        onUrl(tunnel.url, "localtunnel");
      })
      .catch((err) => onFail(err));
  } catch (e) {
    onFail(e);
  }
}

// ── Tunnel starters ───────────────────────────────────────────────────────────

function tryCloudflared(cfBin, port, onUrl, onFail) {
  proc = spawn(cfBin, ["tunnel", "--url", "http://localhost:" + port], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  proc.on("error", onFail);
  proc.on("exit", () => {
    if (!state.url) onFail(new Error("cloudflared exited before emitting URL"));
    else { state.running = false; state.url = null; }
  });

  function check(data) {
    const url = extractCloudflaredUrl(data.toString());
    if (url) onUrl(url, "cloudflared");
  }
  proc.stdout.on("data", check);
  proc.stderr.on("data", check);
}

// ── Public API ────────────────────────────────────────────────────────────────

function start(port) {
  port = port || process.env.PORT || 3000;
  if (state.running) return Promise.resolve({ url: state.url });

  cleanup();
  state = { running: false, url: null, provider: null, error: null };

  return new Promise((resolve, reject) => {
    _resolve = resolve;

    const timeout = setTimeout(() => {
      cleanup();
      state.error = "Timed out waiting for tunnel URL (120s)";
      reject(new Error(state.error));
    }, 120000);

    function onUrl(url, provider) {
      if (state.url) return;
      clearTimeout(timeout);
      state.running  = true;
      state.url      = url;
      state.provider = provider;
      console.log("  [tunnel] \u2713 " + provider + " tunnel active: " + url);
      if (_resolve) { _resolve({ url }); _resolve = null; }
    }

    function onCloudflaredFail(err) {
      console.log("  [tunnel] cloudflared unavailable" +
        (err ? " (" + err.message + ")" : "") +
        ", trying localtunnel JS API...");
      tryLocaltunnelApi(port, onUrl, (ltErr) => {
        clearTimeout(timeout);
        state.error = ltErr ? ltErr.message : "localtunnel failed";
        reject(new Error(state.error));
      });
    }

    console.log("  [tunnel] Starting HTTPS tunnel on port " + port + "...");

    ensureCloudflared().then((cfBin) => {
      if (!cfBin) {
        onCloudflaredFail(new Error("not available on this platform"));
        return;
      }
      console.log("  [tunnel] Using cloudflared: " + cfBin);
      tryCloudflared(cfBin, port, onUrl, onCloudflaredFail);
    }).catch(onCloudflaredFail);
  });
}

function stop() {
  cleanup();
  state = { running: false, url: null, provider: null, error: null };
}

function status() { return { ...state }; }

process.on("exit",    cleanup);
process.on("SIGINT",  cleanup);
process.on("SIGTERM", cleanup);

module.exports = { start, stop, status };
