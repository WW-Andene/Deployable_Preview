/**
 * server/tunnel.js — HTTPS tunnel manager for DeployView
 *
 * Claude.ai's MCP connector requires a publicly reachable HTTPS URL.
 * This module spawns a tunnel process (cloudflared if installed,
 * otherwise localtunnel via npx) and extracts the public URL so it
 * can be shown in the MCP settings panel.
 *
 * Usage (from api.js routes):
 *   const tunnel = require("./tunnel");
 *   await tunnel.start(port);   // → { url: "https://xxxx.trycloudflare.com" }
 *   tunnel.stop();
 *   tunnel.status();            // → { running, url, provider, error }
 */

"use strict";

const { spawn } = require("child_process");

let proc    = null;
let state   = { running: false, url: null, provider: null, error: null };
let _resolve = null; // promise resolver waiting for the URL

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCloudflaredUrl(line) {
  // cloudflared prints: "https://xxxx.trycloudflare.com" in its tunnel output
  const m = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  return m ? m[0] : null;
}

function extractLocaltunnelUrl(line) {
  // localtunnel prints: "your url is: https://xxxx.loca.lt"
  const m = line.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
  return m ? m[0] : null;
}

function cleanup() {
  if (proc) {
    try { proc.kill(); } catch (_) {}
    proc = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the tunnel. Returns a promise that resolves with { url } once the
 * public URL is known, or rejects after a timeout.
 * @param {number} port  Local HTTP port to expose (default 3000)
 */
function start(port) {
  if (state.running) return Promise.resolve({ url: state.url });

  cleanup();
  state = { running: false, url: null, provider: null, error: null };

  return new Promise((resolve, reject) => {
    _resolve = resolve;
    const timeout = setTimeout(() => {
      cleanup();
      state.error = "Timed out waiting for tunnel URL (60s)";
      reject(new Error(state.error));
    }, 60000);

    function tryCloudflared() {
      let fellBack = false;  // prevent double localtunnel fallback
      // cloudflared tunnel --url http://localhost:<port>
      proc = spawn("cloudflared", ["tunnel", "--url", "http://localhost:" + port], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      proc.on("error", () => {
        // cloudflared not installed — fall back to localtunnel
        if (!fellBack) { fellBack = true; tryLocaltunnel(); }
      });

      function onData(data) {
        const text = data.toString();
        if (!state.url) {
          const url = extractCloudflaredUrl(text);
          if (url) {
            clearTimeout(timeout);
            state.running = true;
            state.url = url;
            state.provider = "cloudflared";
            if (_resolve) { _resolve({ url }); _resolve = null; }
          }
        }
      }

      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData); // cloudflared logs to stderr

      proc.on("exit", (code) => {
        if (!state.url) {
          // Likely not installed, try localtunnel
          if (!fellBack) { fellBack = true; tryLocaltunnel(); }
        } else {
          state.running = false;
          state.url = null;
          proc = null;
        }
      });
    }

    function tryLocaltunnel() {
      // npx localtunnel --port <port>
      proc = spawn("npx", ["--yes", "localtunnel", "--port", String(port)], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        state.error = "Neither cloudflared nor localtunnel (npx) could be started: " + err.message;
        reject(new Error(state.error));
      });

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        if (!state.url) {
          const url = extractLocaltunnelUrl(text);
          if (url) {
            clearTimeout(timeout);
            state.running = true;
            state.url = url;
            state.provider = "localtunnel";
            if (_resolve) { _resolve({ url }); _resolve = null; }
          }
        }
      });

      proc.on("exit", () => {
        state.running = false;
        state.url = null;
        proc = null;
      });
    }

    tryCloudflared();
  });
}

function stop() {
  cleanup();
  state = { running: false, url: null, provider: null, error: null };
}

function status() {
  return { ...state };
}

// Clean up on process exit
process.on("exit",    cleanup);
process.on("SIGINT",  cleanup);
process.on("SIGTERM", cleanup);

module.exports = { start, stop, status };
