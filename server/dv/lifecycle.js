/**
 * dv/lifecycle.js — browser library loader, browser instance, page factory.
 *
 * Owns:
 *   - Detecting which browser library to use (playwright / puppeteer)
 *   - Launching / connecting (local launch + Browserless remote CDP)
 *   - Creating new pages with the right headers
 *   - Resolving the public preview URL (depends on remote endpoint)
 *
 * Does NOT own session state — that's dv/pool.js. closeBrowser() looks
 * up closeAllSessions() lazily to break the otherwise-circular import.
 *
 * Extracted from dv/session.js (R6.5).
 */

"use strict";

let _lib = null;          // { launch: fn, type: "playwright"|"puppeteer" }
let browserInstance = null;

function loadLib() {
  if (_lib) return _lib;

  // Ask browser-setup which library it verified at startup
  let preferred = null;
  try { preferred = require("../browser-setup").getActiveBrowser(); } catch (_) {}

  // Try preferred first, then the other
  const order = preferred === "puppeteer"
    ? ["puppeteer", "playwright"]
    : ["playwright", "puppeteer"];

  for (const name of order) {
    try {
      if (name === "playwright") {
        let pw;
        try { pw = require("playwright"); } catch (_) { pw = require("playwright-core"); }
        _lib = {
          type: "playwright",
          launch: (opts) => pw.chromium.launch(opts)
        };
        return _lib;
      }
      if (name === "puppeteer") {
        let pptr;
        try { pptr = require("puppeteer"); } catch (_) { pptr = require("puppeteer-core"); }
        _lib = {
          type: "puppeteer",
          launch: (opts) => pptr.launch(opts)
        };
        return _lib;
      }
    } catch (_) { /* try next */ }
  }
  return null;
}

// ── Compatibility helpers (Playwright vs Puppeteer) ─────────────────────────

async function setViewport(page, width, height) {
  if (typeof page.setViewportSize === "function") {
    await page.setViewportSize({ width, height });
  } else if (typeof page.setViewport === "function") {
    await page.setViewport({ width, height });
  }
}

function getViewport(page) {
  if (typeof page.viewportSize === "function") return page.viewportSize();
  if (page.viewport && typeof page.viewport === "function") return page.viewport();
  return { width: 1280, height: 720 };
}

// Playwright uses "networkidle", Puppeteer uses "networkidle2" (allows 2 open connections — needed for Firebase/websocket apps)
function waitUntilIdle() {
  return _lib && _lib.type === "puppeteer" ? "networkidle2" : "domcontentloaded";
}

function hasPlaywright() {
  // Returns true if any browser method is available (local or remote)
  return !!loadLib() || !!getRemoteWSEndpoint();
}

// ── Page factory (sets headers needed for ngrok etc.) ───────────────────────

async function newPage(browser) {
  const page = await browser.newPage();
  // Skip ngrok free-tier interstitial — only for same-origin requests
  if (getRemoteWSEndpoint()) {
    // Determine the ngrok origin to match against
    let ngrokOrigin = null;
    try {
      const tunnelStatus = require("../tunnel").status();
      if (tunnelStatus && tunnelStatus.url) {
        ngrokOrigin = new URL(tunnelStatus.url).origin;
      }
    } catch (_) {}

    if (typeof page.setRequestInterception === "function") {
      // Puppeteer: intercept requests and only add header for same-origin
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const headers = { ...req.headers() };
        try {
          const reqOrigin = new URL(req.url()).origin;
          if (ngrokOrigin && reqOrigin === ngrokOrigin) {
            headers["ngrok-skip-browser-warning"] = "true";
          }
        } catch (_) {}
        req.continue({ headers });
      });
    } else if (page.route) {
      // Playwright: use route to add header only for same-origin
      await page.route("**/*", (route) => {
        const headers = { ...route.request().headers() };
        try {
          const reqOrigin = new URL(route.request().url()).origin;
          if (ngrokOrigin && reqOrigin === ngrokOrigin) {
            headers["ngrok-skip-browser-warning"] = "true";
          }
        } catch (_) {}
        route.continue({ headers });
      });
    }
  }
  return page;
}

// ── Remote browser (Browserless.io / any CDP WebSocket) ─────────────────────

function getRemoteWSEndpoint() {
  // Check config secrets, then env vars
  let token = "";
  let url = "";
  try {
    const { getSecret } = require("../config");
    token = getSecret("BROWSERLESS_API_KEY", "BROWSERLESS_API_KEY");
    url = getSecret("BROWSER_WS_ENDPOINT", "BROWSER_WS_ENDPOINT");
  } catch (_) {
    token = process.env.BROWSERLESS_API_KEY || "";
    url = process.env.BROWSER_WS_ENDPOINT || "";
  }
  // Custom WebSocket URL takes priority
  if (url) return url;
  // Browserless.io token → construct endpoint
  if (token) return "wss://production-sfo.browserless.io?token=" + token;
  return null;
}

async function getBrowser() {
  // Clear dead instances
  if (browserInstance) {
    try {
      if (!browserInstance.isConnected()) { browserInstance = null; }
    } catch (_) { browserInstance = null; }
  }
  if (browserInstance) return browserInstance;

  const remoteWS = getRemoteWSEndpoint();

  // ── Mode 1: Remote browser via WebSocket (Browserless.io etc.) ──
  if (remoteWS) {
    console.log("[mcp-browser] Connecting to remote browser: " + remoteWS.replace(/token=[^&]+/, "token=***"));
    // Prefer puppeteer-core for CDP connect (lighter, always works)
    let pptr = null;
    try { pptr = require("puppeteer-core"); } catch (_) {
      try { pptr = require("puppeteer"); } catch (_2) {}
    }
    if (pptr) {
      // Force puppeteer as the active lib for compat helpers
      if (!_lib || _lib.type !== "puppeteer") {
        _lib = { type: "puppeteer", launch: (opts) => pptr.launch(opts) };
      }
      try {
        // Add connection timeout to prevent hanging
        const connectPromise = pptr.connect({ browserWSEndpoint: remoteWS });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Remote browser connection timed out after 15s")), 15000)
        );
        browserInstance = await Promise.race([connectPromise, timeoutPromise]);
        console.log("[mcp-browser] Remote browser connected via Puppeteer");
        return browserInstance;
      } catch (e) {
        console.error("[mcp-browser] Remote connect failed:", e.message);
        throw new Error("Remote browser connection failed: " + e.message);
      }
    }
    // Fallback: Playwright connectOverCDP
    let pw = null;
    try { pw = require("playwright"); } catch (_) {
      try { pw = require("playwright-core"); } catch (_2) {}
    }
    if (pw) {
      if (!_lib || _lib.type !== "playwright") {
        _lib = { type: "playwright", launch: (opts) => pw.chromium.launch(opts) };
      }
      try {
        const connectPromise = pw.chromium.connectOverCDP(remoteWS);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Remote browser CDP connection timed out after 15s")), 15000)
        );
        browserInstance = await Promise.race([connectPromise, timeoutPromise]);
        console.log("[mcp-browser] Remote browser connected via Playwright CDP");
        return browserInstance;
      } catch (e) {
        console.error("[mcp-browser] Remote CDP connect failed:", e.message);
        throw new Error("Remote browser connection failed: " + e.message);
      }
    }
    throw new Error("No browser library available for remote connection. Install puppeteer-core or playwright.");
  }

  // ── Mode 2: Local browser launch ──
  const lib = loadLib();
  if (!lib) throw new Error(
    "No browser available. Options:\n" +
    "  1. Add BROWSERLESS_API_KEY in Settings (free at browserless.io)\n" +
    "  2. Add BROWSER_WS_ENDPOINT for any remote Chrome\n" +
    "  3. Install Playwright or Puppeteer locally"
  );

  // Enable WebGL via swiftshader (software rasterizer). This lets MediaPipe,
  // three.js, Spine WebGL, and anything else requiring a GL context run inside
  // a headless Chromium without a real GPU. --disable-gpu is intentionally
  // *not* passed — it would kill WebGL along with the hardware path.
  const opts = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist"
    ]
  };

  // Use system Chromium path if set (Termux / Android)
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
                   process.env.PUPPETEER_EXECUTABLE_PATH;
  if (execPath) opts.executablePath = execPath;

  // Auto-detect Playwright's Chrome binary for Puppeteer-core
  if (!opts.executablePath && lib.type === "puppeteer") {
    const fs = require("fs");
    const path = require("path");
    const pwBrowsers = "/opt/pw-browsers";
    try {
      if (fs.existsSync(pwBrowsers)) {
        const dirs = fs.readdirSync(pwBrowsers).filter(d => d.startsWith("chromium-")).sort().reverse();
        for (const d of dirs) {
          const candidates = [
            path.join(pwBrowsers, d, "chrome-linux64", "chrome"),
            path.join(pwBrowsers, d, "chrome-linux", "chrome"),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) { opts.executablePath = c; break; }
          }
          if (opts.executablePath) break;
        }
      }
    } catch (_) {}
  }

  browserInstance = await lib.launch(opts);
  return browserInstance;
}

async function closeBrowser() {
  // Close all open page sessions first — looked up lazily so this module
  // doesn't depend on dv/pool at load time (would create a cycle).
  try { require("./pool").closeAllSessions(); } catch (_) {}
  if (browserInstance) {
    if (typeof browserInstance.disconnect === "function" && getRemoteWSEndpoint()) {
      try { browserInstance.disconnect(); } catch (_) {}
    } else {
      await browserInstance.close().catch(() => {});
    }
    browserInstance = null;
  }
}

// ── Resolve preview URL from owner/repo/slug ─────────────────────────────────
// When using a remote browser (Browserless), the URL must be publicly reachable
// via the tunnel, not localhost (which would be the remote server's localhost).
function resolvePreviewUrl(owner, repo, slug, serverPort) {
  // Sanitize inputs to prevent path injection
  const safeOwner = (owner || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRepo  = (repo || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeSlug  = (slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeOwner || !safeRepo || !safeSlug) {
    throw new Error("Invalid owner, repo, or slug");
  }
  const previewPath = "/preview/" + safeOwner + "/" + safeRepo + "/" + safeSlug + "/";

  // If using remote browser, use the public tunnel URL so the remote Chrome can reach us
  if (getRemoteWSEndpoint()) {
    try {
      const tunnelStatus = require("../tunnel").status();
      if (tunnelStatus && tunnelStatus.url) {
        return tunnelStatus.url + previewPath;
      }
    } catch (_) {}
    // Remote browser needs a public URL — localhost won't work
    throw new Error(
      "Remote browser (Browserless) is configured but no tunnel URL is available. " +
      "The remote Chrome cannot reach localhost. Ensure ngrok/localtunnel is running."
    );
  }

  const port = serverPort || process.env.PORT || 3000;
  return "http://127.0.0.1:" + port + previewPath;
}

module.exports = {
  loadLib,
  getBrowser,
  closeBrowser,
  hasPlaywright,
  setViewport,
  getViewport,
  waitUntilIdle,
  newPage,
  getRemoteWSEndpoint,
  resolvePreviewUrl
};
