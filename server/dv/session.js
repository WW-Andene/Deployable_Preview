/**
 * session.js — Browser session / lifecycle manager
 *
 * Owns the headless browser instance (Playwright or Puppeteer), persistent
 * page sessions keyed by owner/repo/slug, and low-level touch/input helpers
 * shared across all browser-tool modules.
 *
 * Extracted from mcp-browser.js so that every tool file in server/dv/tools/
 * can import a single authoritative source for browser state.
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const { buildStatus, branchSlug, buildKey } = require("../build");
const { runningServers } = require("../process");

// ── Browser library loader ───────────────────────────────────────────────────
// browser-setup.js runs at startup and sets which library actually works.
// We honour that choice here, with a live fallback chain if needed.

let _lib = null;          // { launch: fn, type: "playwright"|"puppeteer" }
let browserInstance = null;

// ── Persistent page sessions ────────────────────────────────────────────────
// Pages are kept alive across tool calls so state (localStorage, modals, etc.)
// persists. Keyed by "owner/repo/slug".
const pageSessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 min idle expiry

// Cleanup idle sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of pageSessions) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      session.page.close().catch(() => {});
      pageSessions.delete(key);
      console.log("[mcp-browser] Session expired: " + key);
    }
  }
}, 60 * 1000);

/**
 * Get or create a persistent page for a preview.
 * Reuses existing page if viewport matches, otherwise creates new.
 */
async function getSessionPage(browser, owner, repo, slug, width, height) {
  const key = owner + "/" + repo + "/" + slug;
  const w = width || 1280;
  const h = height || 720;
  const url = resolvePreviewUrl(owner, repo, slug);

  const existing = pageSessions.get(key);
  if (existing) {
    // Check if page is still alive
    try {
      await existing.page.title(); // will throw if closed/crashed
    } catch (_) {
      pageSessions.delete(key);
      return getSessionPage(browser, owner, repo, slug, width, height);
    }

    // Resize viewport if needed
    if (existing.width !== w || existing.height !== h) {
      await setViewport(existing.page, w, h);
      existing.width = w;
      existing.height = h;
    }
    existing.lastUsed = Date.now();
    return { page: existing.page, url, isNew: false };
  }

  // Create new session
  const page = await newPage(browser);
  await setViewport(page, w, h);
  await page.goto(url, { waitUntil: waitUntilIdle(), timeout: 30000 });

  pageSessions.set(key, { page, width: w, height: h, lastUsed: Date.now() });
  console.log("[mcp-browser] New session: " + key + " (" + w + "x" + h + ")");
  return { page, url, isNew: true };
}

function closeSession(owner, repo, slug) {
  const key = owner + "/" + repo + "/" + slug;
  const session = pageSessions.get(key);
  if (session) {
    session.page.close().catch(() => {});
    pageSessions.delete(key);
    return true;
  }
  return false;
}

function closeAllSessions() {
  for (const [key, session] of pageSessions) {
    session.page.close().catch(() => {});
  }
  pageSessions.clear();
}

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
  closeAllSessions();
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

// ── Asset categories (used by browseUrl / network tools) ────────────────────

// Map of Playwright/Puppeteer resourceType → short category used for grouping
const ASSET_CATEGORIES = {
  document:    "documents",
  stylesheet:  "stylesheets",
  script:      "scripts",
  image:       "images",
  media:       "media",
  font:        "fonts",
  xhr:         "xhr",
  fetch:       "xhr",
  websocket:   "websockets",
  manifest:    "other",
  texttrack:   "media",
  eventsource: "other",
  other:       "other"
};

function categorizeResourceType(t) {
  return ASSET_CATEGORIES[t] || "other";
}

// ── Shared helpers for interaction and measurement ──────────────────────────

/**
 * Resolve an iframe target from a frame descriptor. Accepts a CSS selector
 * pointing to an <iframe> element, a URL substring, or a frame name.
 * Returns the frame-like target (has .click / .type / .evaluate).
 */
async function resolveFrame(page, frameDesc) {
  if (!frameDesc) return page;

  // 1. Try as a CSS selector (iframe element)
  try {
    const el = await page.$(frameDesc);
    if (el && typeof el.contentFrame === "function") {
      const frame = await el.contentFrame();
      if (frame) return frame;
    }
  } catch (_) {}

  // 2. Try matching frames() by URL substring or name
  if (typeof page.frames === "function") {
    const frames = page.frames();
    for (const f of frames) {
      try {
        if (typeof page.mainFrame === "function" && f === page.mainFrame()) continue;
      } catch (_) {}
      let fUrl = "";
      let fName = "";
      try { fUrl  = typeof f.url === "function" ? f.url() : ""; } catch (_) {}
      try { fName = typeof f.name === "function" ? f.name() : ""; } catch (_) {}
      if ((fUrl && fUrl.includes(frameDesc)) || (fName && fName === frameDesc)) {
        return f;
      }
    }
  }

  throw new Error("iframe not found: " + frameDesc);
}

/**
 * Resolve a point on the page from either a selector (center of bounding box)
 * or explicit {x, y} coordinates. Used by drag/swipe/tap/long_press.
 */
async function resolvePoint(page, { selector, x, y }) {
  if (selector) {
    const el = await page.$(selector);
    if (!el) throw new Error("Element not found: " + selector);
    let box = null;
    if (typeof el.boundingBox === "function") {
      box = await el.boundingBox();
    }
    if (!box) {
      box = await page.evaluate((sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, selector);
    }
    if (!box) throw new Error("Could not compute bounding box for: " + selector);
    return [box.x + box.width / 2, box.y + box.height / 2];
  }
  if (x != null && y != null) return [Number(x), Number(y)];
  throw new Error("Either selector or {x,y} required");
}

/**
 * Simulate a touch tap via the CDP touchscreen (Puppeteer/Playwright both expose it).
 * Falls back to a mouse click if touch isn't available.
 */
async function simulateTouchTap(page, x, y) {
  if (page.touchscreen && typeof page.touchscreen.tap === "function") {
    try { await page.touchscreen.tap(x, y); return; } catch (_) {}
  }
  await page.mouse.click(x, y);
}

/**
 * Simulate a touch swipe. Uses CDP touchscreen if available.
 */
async function simulateTouchSwipe(page, sx, sy, ex, ey, steps) {
  const client = (typeof page.createCDPSession === "function")
    ? await page.createCDPSession().catch(() => null)
    : (page._client && typeof page._client === "function" ? page._client() : null);
  if (client) {
    try {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t }]
        });
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      if (typeof client.detach === "function") await client.detach().catch(() => {});
      return;
    } catch (_) {
      if (typeof client.detach === "function") client.detach().catch(() => {});
    }
  }
  // Fallback: mouse drag
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
  }
  await page.mouse.up();
}

/**
 * Simulate a two-finger pinch gesture via CDP touch events. Moves two touch
 * points horizontally centred on (cx, cy) from startDistance to endDistance.
 * Used to trigger pinch-zoom in apps that listen for touch events.
 */
async function simulateTouchPinch(page, cx, cy, startDist, endDist, steps) {
  const getClient = async () => {
    if (typeof page.createCDPSession === "function") {
      try { return await page.createCDPSession(); } catch (_) { return null; }
    }
    if (page._client && typeof page._client === "function") {
      try { return page._client(); } catch (_) { return null; }
    }
    return null;
  };
  const client = await getClient();
  if (!client) return { error: "CDP session unavailable for pinch" };
  try {
    const pointsAt = (dist) => ([
      { x: cx - dist / 2, y: cy, id: 0 },
      { x: cx + dist / 2, y: cy, id: 1 }
    ]);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pointsAt(startDist) });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const dist = startDist + (endDist - startDist) * t;
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pointsAt(dist) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (typeof client.detach === "function") await client.detach().catch(() => {});
    return { ok: true };
  } catch (e) {
    if (typeof client.detach === "function") client.detach().catch(() => {});
    return { error: e.message };
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  // Session management
  getSessionPage,
  closeSession,
  closeAllSessions,

  // Browser lifecycle
  loadLib,
  getBrowser,
  closeBrowser,
  hasPlaywright,

  // Viewport / navigation helpers
  setViewport,
  getViewport,
  waitUntilIdle,

  // Page factory & URL resolution
  newPage,
  getRemoteWSEndpoint,
  resolvePreviewUrl,

  // Frame & coordinate helpers
  resolveFrame,
  resolvePoint,

  // Touch simulation
  simulateTouchTap,
  simulateTouchSwipe,
  simulateTouchPinch,

  // Asset categorization
  ASSET_CATEGORIES,
  categorizeResourceType,
};
