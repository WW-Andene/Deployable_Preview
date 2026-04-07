/**
 * server/tunnel.js — HTTPS tunnel manager for DeployView
 *
 * Tries providers in order, falling back automatically on any failure:
 *   1. cloudflared  — preferred (no account needed, very reliable)
 *                     auto-downloads the binary if not on PATH
 *   2. ngrok        — requires NGROK_AUTHTOKEN env var; auto-installs @ngrok/ngrok
 *   3. localtunnel  — JS API via npm package (in dependencies, always present)
 *                     sends Bypass-Tunnel-Reminder header to skip loca.lt splash
 *
 * Public API:
 *   tunnel.start(port)  → Promise<{ url: string }>
 *   tunnel.stop()
 *   tunnel.status()     → { running, url, provider, error }
 */

"use strict";

const { spawn, execSync, spawnSync } = require("child_process");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");
const os     = require("os");

// ── State ─────────────────────────────────────────────────────────────────────

let proc  = null;
let state = { running: false, url: null, provider: null, error: null };

const ROOT    = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, ".tunnel-bin");

// ── Helpers ───────────────────────────────────────────────────────────────────

function tag(msg)  { return "  [tunnel] " + msg; }
function log(msg)  { console.log(tag(msg)); }
function warn(msg) { console.warn(tag(msg)); }

function cleanup() {
  if (proc) {
    try { proc.kill("SIGKILL"); } catch (_) {}
    proc = null;
  }
}

function which(cmd) {
  try {
    const out = execSync(
      process.platform === "win32"
        ? "where " + cmd + " 2>nul"
        : "which " + cmd + " 2>/dev/null",
      { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }
    ).toString().trim();
    return out || null;
  } catch (_) { return null; }
}

// ── cloudflared binary resolution + auto-download ─────────────────────────────

function cloudflaredBinName() {
  const p = os.platform(), a = os.arch();
  if (p === "linux") {
    if (a === "arm64") return "cloudflared-linux-arm64";
    if (a === "arm")   return "cloudflared-linux-arm";
    return "cloudflared-linux-amd64";
  }
  if (p === "darwin") return a === "arm64" ? "cloudflared-darwin-arm64" : "cloudflared-darwin-amd64";
  if (p === "win32")  return a === "arm64" ? "cloudflared-windows-arm64.exe" : "cloudflared-windows-amd64.exe";
  return null;
}

function downloadCloudflared(destPath) {
  return new Promise((resolve, reject) => {
    const name = path.basename(destPath);
    const url  = "https://github.com/cloudflare/cloudflared/releases/latest/download/" + name;
    log("Downloading cloudflared from GitHub releases...");

    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

    const tmpPath = destPath + ".tmp";
    const file    = fs.createWriteStream(tmpPath);

    file.on("error", (err) => {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      reject(err);
    });

    function get(urlStr) {
      https.get(urlStr, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          reject(new Error("HTTP " + res.statusCode + " downloading cloudflared"));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
              fs.chmodSync(destPath, 0o755);
              log("cloudflared downloaded to " + destPath);
              resolve(destPath);
            } catch (e) { reject(e); }
          });
        });
      }).on("error", (err) => {
        file.close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
    }

    get(url);
  });
}

async function ensureCloudflared() {
  // 1. System PATH
  const system = which("cloudflared");
  if (system) return system;

  const binName = cloudflaredBinName();
  if (!binName) return null;   // unsupported platform

  const binPath = path.join(BIN_DIR, binName);

  // 2. Previously cached download
  if (fs.existsSync(binPath)) {
    try { fs.chmodSync(binPath, 0o755); } catch (_) {}
    return binPath;
  }

  // 3. Download fresh
  try {
    return await downloadCloudflared(binPath);
  } catch (e) {
    warn("Could not download cloudflared: " + e.message);
    return null;
  }
}

// ── cloudflared tunnel starter ────────────────────────────────────────────────

function tryCloudflared(cfBin, port, onUrl, onFail) {
  log("Using cloudflared: " + cfBin);

  const child = spawn(cfBin, ["tunnel", "--url", "http://localhost:" + port], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  proc = child;
  let urlFound = false;

  function checkForUrl(data) {
    if (urlFound) return;
    const m = data.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (m) { urlFound = true; onUrl(m[0], "cloudflared"); }
  }

  child.stdout.on("data", checkForUrl);
  child.stderr.on("data", checkForUrl);
  child.on("error", (err) => { if (!urlFound) onFail(err); });
  child.on("exit", (code, signal) => {
    if (!urlFound) {
      onFail(new Error("cloudflared exited (code=" + code + " signal=" + signal + ") before emitting URL"));
    } else {
      state.running = false;
      state.url = null;
    }
  });
}

// ── ngrok ─────────────────────────────────────────────────────────────────────

function installNgrok() {
  log("Installing @ngrok/ngrok from npm...");
  const r = spawnSync("npm", ["install", "@ngrok/ngrok", "--save-optional"], {
    cwd: ROOT, stdio: "inherit", timeout: 90000,
    shell: process.platform === "win32"
  });
  if (r.status !== 0) {
    warn("npm install @ngrok/ngrok failed (exit " + r.status + ")");
    return false;
  }
  log("@ngrok/ngrok installed.");
  return true;
}

function loadNgrok() {
  const candidates = [
    path.join(ROOT, "node_modules", "@ngrok", "ngrok"),
    path.join(ROOT, "..", "node_modules", "@ngrok", "ngrok"),
    "@ngrok/ngrok",
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) {}
  }
  return null;
}

function tryNgrok(port, onUrl, onFail) {
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) {
    onFail(new Error("NGROK_AUTHTOKEN env var not set — skipping ngrok"));
    return;
  }

  let ngrok = loadNgrok();
  if (!ngrok) {
    warn("@ngrok/ngrok not found — attempting automatic install...");
    if (installNgrok()) ngrok = loadNgrok();
  }
  if (!ngrok) {
    onFail(new Error("@ngrok/ngrok could not be loaded"));
    return;
  }

  ngrok.connect({ addr: port, authtoken: token })
    .then((url) => {
      if (!url) { onFail(new Error("ngrok returned no URL")); return; }
      // Register cleanup
      const origCleanup = cleanup;
      proc = {
        kill: () => {
          try { ngrok.disconnect(url); } catch (_) {}
          try { ngrok.kill(); }          catch (_) {}
        }
      };
      onUrl(url, "ngrok");
    })
    .catch((err) => onFail(err));
}

// ── localtunnel resolution ────────────────────────────────────────────────────

function loadLocaltunnel() {
  // Wipe stale cache first (MODULE_NOT_FOUND errors are cached by Node)
  Object.keys(require.cache)
    .filter((k) => k.includes("localtunnel"))
    .forEach((k) => { delete require.cache[k]; });

  const candidates = [
    path.join(ROOT, "node_modules", "localtunnel"),
    path.join(ROOT, "..", "node_modules", "localtunnel"),
    path.join(ROOT, "..", "..", "node_modules", "localtunnel"),
    "localtunnel",
  ];

  // Dynamic: npm global root
  try {
    const r = spawnSync("npm", ["root", "-g"], {
      encoding: "utf8", timeout: 5000, shell: process.platform === "win32"
    });
    if (r.stdout && r.stdout.trim()) {
      candidates.push(path.join(r.stdout.trim(), "localtunnel"));
    }
  } catch (_) {}

  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      // Handle CJS export (function) and ESM interop ({ default: fn })
      const fn = typeof mod === "function"
        ? mod
        : (mod && typeof mod.default === "function") ? mod.default
        : null;
      if (fn) return fn;
    } catch (_) {}
  }

  return null;
}

function installLocaltunnel() {
  log("Installing localtunnel from npm...");
  const r = spawnSync("npm", ["install", "localtunnel@latest", "--save"], {
    cwd: ROOT, stdio: "inherit", timeout: 90000,
    shell: process.platform === "win32"
  });
  if (r.status !== 0) {
    warn("npm install localtunnel failed (exit " + r.status + ")");
    warn("  Manual fix: npm install localtunnel  (run in project root)");
    return false;
  }
  log("localtunnel installed.");
  return true;
}

function tryLocaltunnelApi(port, onUrl, onFail) {
  let lt = loadLocaltunnel();

  if (!lt) {
    warn("localtunnel not found — attempting automatic install...");
    if (installLocaltunnel()) lt = loadLocaltunnel();
  }

  if (!lt) {
    onFail(new Error(
      "localtunnel could not be loaded.\n" +
      "  Fix: cd " + ROOT + " && npm install localtunnel"
    ));
    return;
  }

  lt({ port, request_header: { 'Bypass-Tunnel-Reminder': 'true' } })
    .then((tunnel) => {
      if (!tunnel || !tunnel.url) {
        onFail(new Error("localtunnel connected but returned no URL"));
        return;
      }
      proc = { kill: () => { try { tunnel.close(); } catch (_) {} } };
      tunnel.on("close", () => { state.running = false; state.url = null; proc = null; });
      tunnel.on("error", (err) => { warn("localtunnel error: " + err.message); });
      onUrl(tunnel.url, "localtunnel");
    })
    .catch((err) => onFail(err));
}

// ── Public API ────────────────────────────────────────────────────────────────

function start(port) {
  port = port || parseInt(process.env.PORT, 10) || 3000;
  if (state.running) return Promise.resolve({ url: state.url });

  cleanup();
  state = { running: false, url: null, provider: null, error: null };

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const msg = "Timed out after 120s waiting for tunnel URL";
      state.error = msg;
      reject(new Error(msg));
    }, 120 * 1000);

    function onUrl(url, provider) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      state = { running: true, url, provider, error: null };
      log("\u2713 " + provider + " tunnel active: " + url);
      resolve({ url });
    }

    function onLocaltunnelFail(cfErr, ngrokErr, ltErr) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const msg = [
        "All tunnel providers failed.",
        "  cloudflared: " + (cfErr    ? cfErr.message    : "unavailable"),
        "  ngrok:       " + (ngrokErr ? ngrokErr.message : "unavailable"),
        "  localtunnel: " + (ltErr    ? ltErr.message    : "failed"),
        "",
        "  Manual fixes:",
        "    brew install cloudflared           (macOS)",
        "    pkg install cloudflared            (Termux)",
        "    NGROK_AUTHTOKEN=<token> npm start  (ngrok — get token at ngrok.com)",
        "    npm install localtunnel            (any platform)"
      ].join("\n");
      state.error = msg;
      reject(new Error(msg));
    }

    function onNgrokFail(cfErr, ngrokErr) {
      warn("ngrok unavailable" + (ngrokErr ? " (" + ngrokErr.message + ")" : "") + " \u2014 falling back to localtunnel...");
      tryLocaltunnelApi(port, onUrl, (ltErr) => onLocaltunnelFail(cfErr, ngrokErr, ltErr));
    }

    function onCloudflaredFail(cfErr) {
      warn("cloudflared unavailable" + (cfErr ? " (" + cfErr.message + ")" : "") + " \u2014 falling back to ngrok...");
      tryNgrok(port, onUrl, (ngrokErr) => onNgrokFail(cfErr, ngrokErr));
    }

    log("Starting HTTPS tunnel on port " + port + "...");

    ensureCloudflared()
      .then((cfBin) => {
        if (!cfBin) { onCloudflaredFail(new Error("not available for this platform/arch")); return; }
        tryCloudflared(cfBin, port, onUrl, onCloudflaredFail);
      })
      .catch(onCloudflaredFail);
  });
}

function stop() {
  cleanup();
  state = { running: false, url: null, provider: null, error: null };
  log("Tunnel stopped.");
}

function status() { return { ...state }; }

// ── Graceful shutdown hooks ───────────────────────────────────────────────────

process.on("exit",    cleanup);
process.on("SIGINT",  cleanup);
process.on("SIGTERM", cleanup);

module.exports = { start, stop, status };
