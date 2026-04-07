/**
 * server/tunnel.js — HTTPS tunnel manager for DeployView
 *
 * Tries in order:
 *   1. cloudflared  (if installed)
 *   2. localtunnel  (npm package — auto-installed if missing)
 */

"use strict";

const { spawn, execSync } = require("child_process");
const path = require("path");

let proc  = null;
let state = { running: false, url: null, provider: null, error: null };
let _resolve = null;

const ROOT = path.join(__dirname, "..");

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
  if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) return null;
  try {
    return execSync("which " + cmd + " 2>/dev/null", { stdio: ["ignore","pipe","ignore"], timeout: 3000 })
      .toString().trim() || null;
  } catch (_) { return null; }
}

// ── Tunnel starters ───────────────────────────────────────────────────────────

function tryCloudflared(port, onUrl, onFail) {
  if (!which("cloudflared")) { onFail(); return; }

  proc = spawn("cloudflared", ["tunnel", "--url", "http://localhost:" + port], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  proc.on("error", onFail);
  proc.on("exit", () => { if (!state.url) onFail(); else { state.running = false; state.url = null; } });

  function check(data) {
    const url = extractCloudflaredUrl(data.toString());
    if (url) onUrl(url, "cloudflared");
  }
  proc.stdout.on("data", check);
  proc.stderr.on("data", check);
}

function tryLocaltunnel(port, onUrl, onFail) {
  // Use npx --yes so no pre-install step is needed; works across environments.
  console.log("  [tunnel] Spawning localtunnel via npx...");
  proc = spawn("npx", ["--yes", "localtunnel", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: ROOT
  });

  proc.on("error", onFail);
  proc.on("exit", () => { state.running = false; state.url = null; proc = null; });

  function checkForUrl(data) {
    // localtunnel may print the URL to either stdout or stderr depending on version
    const url = extractLocaltunnelUrl(data.toString());
    if (url) onUrl(url, "localtunnel");
  }

  proc.stdout.on("data", (data) => {
    checkForUrl(data);
  });

  proc.stderr.on("data", (data) => {
    // npx download progress + localtunnel output both come through stderr
    checkForUrl(data);
    const text = data.toString();
    if (text.includes("ERR") || text.includes("error")) {
      console.warn("  [tunnel] localtunnel stderr: " + text.trim());
    }
  });
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
      if (state.url) return; // already resolved
      clearTimeout(timeout);
      state.running  = true;
      state.url      = url;
      state.provider = provider;
      console.log("  [tunnel] \u2713 " + provider + " tunnel active: " + url);
      if (_resolve) { _resolve({ url }); _resolve = null; }
    }

    function onCloudflaredFail() {
      // cloudflared not available — try localtunnel
      console.log("  [tunnel] cloudflared unavailable, trying localtunnel...");
      tryLocaltunnel(port, onUrl, (err) => {
        clearTimeout(timeout);
        state.error = err ? err.message : "localtunnel failed";
        reject(new Error(state.error));
      });
    }

    console.log("  [tunnel] Starting HTTPS tunnel on port " + port + "...");
    tryCloudflared(port, onUrl, onCloudflaredFail);
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
