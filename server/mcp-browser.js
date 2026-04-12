/**
 * mcp-browser.js — Lightweight browser automation for MCP tools
 *
 * Provides screenshot capture, DOM inspection, element interaction,
 * and console log collection by controlling a headless Chromium instance
 * via Playwright (when available) or falling back to a fetch + DOM snapshot
 * approach for environments without a browser.
 *
 * All methods operate against deployed preview URLs served by DeployView.
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const { buildStatus, branchSlug, buildKey } = require("./build");
const { runningServers } = require("./process");

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
  try { preferred = require("./browser-setup").getActiveBrowser(); } catch (_) {}

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
      const tunnelStatus = require("./tunnel").status();
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
    const { getSecret } = require("./config");
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
      const tunnelStatus = require("./tunnel").status();
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

// ── Screenshot ───────────────────────────────────────────────────────────────

/**
 * Take a screenshot of a deployed preview.
 * @param {object} opts - { owner, repo, slug, width, height, fullPage, selector }
 * @returns {{ base64: string, mimeType: string, width: number, height: number, title: string, url: string }}
 */
async function takeScreenshot(opts) {
  const { owner, repo, slug, width, height, fullPage, selector } = opts;

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, width, height);

  let buf;
  if (selector) {
    const el = await page.$(selector);
    if (el) {
      buf = await el.screenshot({ type: "png" });
    } else {
      buf = await page.screenshot({ type: "png", fullPage: !!fullPage });
    }
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!fullPage });
  }

  const base64 = buf.toString("base64");
  const title = await page.title();
  const viewport = getViewport(page);

  return {
    base64,
    mimeType: "image/png",
    width: viewport.width,
    height: viewport.height,
    title,
    url
  };
}

// ── DOM Inspection (accessibility tree) ──────────────────────────────────────

/**
 * Get the accessibility tree / DOM structure of a deployed preview.
 * @param {object} opts - { owner, repo, slug, selector }
 * @returns {{ tree: object, url: string }}
 */
async function inspectDOM(opts) {
  const { owner, repo, slug, selector } = opts;

  if (!hasPlaywright()) {
    const url = resolvePreviewUrl(owner, repo, slug);
    return await fetchDOMFallback(url, selector);
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug);

  let snapshot = null;
  try {
    if (page.accessibility && typeof page.accessibility.snapshot === "function") {
      snapshot = await page.accessibility.snapshot();
    }
  } catch (_) {}

  let elementInfo = null;
  if (selector) {
    elementInfo = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        textContent: el.textContent.slice(0, 500),
        innerHTML: el.innerHTML.slice(0, 2000),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        computedStyles: {
          display: styles.display,
          position: styles.position,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          fontSize: styles.fontSize,
          fontFamily: styles.fontFamily,
          margin: styles.margin,
          padding: styles.padding,
          border: styles.border,
          visibility: styles.visibility,
          opacity: styles.opacity,
          overflow: styles.overflow
        },
        childCount: el.children.length,
        attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
      };
    }, selector);
  }

  const metadata = await page.evaluate(() => ({
    title: document.title,
    charset: document.characterSet,
    doctype: document.doctype ? document.doctype.name : null,
    bodyClasses: document.body.className,
    elementCount: document.querySelectorAll("*").length,
    linkCount: document.querySelectorAll("a").length,
    imageCount: document.querySelectorAll("img").length,
    formCount: document.querySelectorAll("form").length,
    buttonCount: document.querySelectorAll("button").length,
    inputCount: document.querySelectorAll("input, textarea, select").length,
    scriptCount: document.querySelectorAll("script").length,
    styleSheetCount: document.styleSheets.length,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  }));

  return { accessibilityTree: snapshot, elementInfo, metadata, url };
}

// Fallback DOM fetch (no Playwright)
async function fetchDOMFallback(url, selector) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        resolve({
          html: body.slice(0, 10000),
          note: "Playwright not available — returning raw HTML. Install playwright for full DOM inspection.",
          url
        });
      });
    }).on("error", reject);
  });
}

// ── Console Log Capture ──────────────────────────────────────────────────────

/**
 * Navigate to a preview and capture console output for a duration.
 * @param {object} opts - { owner, repo, slug, duration, actions }
 * @returns {{ logs: Array, errors: Array, url: string }}
 */
async function captureConsole(opts) {
  const { owner, repo, slug, duration } = opts;
  const url = resolvePreviewUrl(owner, repo, slug);

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment.", url };
  }

  const browser = await getBrowser();
  const page = await newPage(browser);
  const logs = [];
  const errors = [];

  try {
    page.on("console", (msg) => {
      logs.push({ type: msg.type(), text: msg.text(), timestamp: Date.now() });
    });
    page.on("pageerror", (err) => {
      errors.push({ message: err.message, stack: err.stack, timestamp: Date.now() });
    });
    page.on("requestfailed", (req) => {
      errors.push({ type: "network", url: req.url(), failure: req.failure(), timestamp: Date.now() });
    });

    await page.goto(url, { waitUntil: waitUntilIdle(), timeout: 30000 });

    // Wait for specified duration to collect console output
    const waitMs = Math.min((duration || 3) * 1000, 30000);
    await new Promise((r) => setTimeout(r, waitMs));

    return { logs, errors, url, duration: waitMs / 1000 };
  } finally {
    await page.close();
  }
}

// ── Click / Interact ─────────────────────────────────────────────────────────

/**
 * Perform an action on a deployed preview.
 * @param {object} opts - { owner, repo, slug, action, selector, value, x, y, ... }
 * action: "click" | "type" | "select" | "scroll" | "hover" | "navigate" |
 *         "evaluate" | "drag" | "file_upload" | "back" | "forward" | "reload" |
 *         "key" | "tap" | "swipe" | "long_press" | "toggle" | "dialog"
 * @returns {{ success: boolean, screenshot?: string }}
 */
async function interact(opts) {
  const { owner, repo, slug, action, selector, value, x, y, width, height } = opts;

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, width, height);

  // Resolve iframe target if requested. Selector-based actions (click/type/
  // select/hover/evaluate/toggle) operate on `target`. Coordinate-based
  // actions (mouse, keyboard, tap, swipe, drag) stay on `page`.
  const target = opts.frame ? await resolveFrame(page, opts.frame) : page;

  let result = { success: true, action, url };
  if (opts.frame) result.frame = opts.frame;

  switch (action) {
    case "click":
      if (selector) {
        await target.click(selector);
      } else if (x !== undefined && y !== undefined) {
        await page.mouse.click(x, y);
      }
      result.clicked = selector || (x + "," + y);
      break;

    case "drag": {
      const [sx, sy] = await resolvePoint(page, { selector: opts.selector || opts.fromSelector, x: opts.fromX, y: opts.fromY });
      const [ex, ey] = await resolvePoint(page, { selector: opts.toSelector, x: opts.toX, y: opts.toY });
      const steps = Math.max(1, Math.min(parseInt(opts.steps, 10) || 20, 200));
      const stepDelay = Math.max(0, Math.min(parseInt(opts.stepDelay, 10) || 8, 100));
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
        if (stepDelay) await new Promise((r) => setTimeout(r, stepDelay));
      }
      await page.mouse.up();
      result.draggedFrom = { x: sx, y: sy };
      result.draggedTo = { x: ex, y: ey };
      break;
    }

    case "file_upload": {
      if (!selector) throw new Error("selector required for file_upload action");
      const files = Array.isArray(opts.files) ? opts.files : [];
      if (!files.length) throw new Error("files array required for file_upload action");
      const el = await page.$(selector);
      if (!el) throw new Error("file input not found: " + selector);

      if (typeof el.setInputFiles === "function") {
        // Playwright
        const payload = files.map((f) => ({
          name: f.name || "upload.bin",
          mimeType: f.mimeType || "application/octet-stream",
          buffer: Buffer.from(f.base64 || "", "base64")
        }));
        await el.setInputFiles(payload);
      } else if (typeof el.uploadFile === "function") {
        // Puppeteer — needs filesystem paths
        const os = require("os");
        const crypto = require("crypto");
        const tmpPaths = [];
        for (const f of files) {
          const base = (f.name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
          const tmp = path.join(os.tmpdir(), "dv-upload-" + crypto.randomBytes(6).toString("hex") + "-" + base);
          fs.writeFileSync(tmp, Buffer.from(f.base64 || "", "base64"));
          tmpPaths.push(tmp);
        }
        await el.uploadFile(...tmpPaths);
        // Cleanup after a short delay so the page has time to read them
        setTimeout(() => { for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch (_) {} } }, 15000);
      } else {
        throw new Error("File upload not supported by this browser driver");
      }
      result.uploaded = files.map((f) => f.name || "upload.bin");
      result.into = selector;
      break;
    }

    case "back":
      if (typeof page.goBack === "function") {
        await page.goBack({ waitUntil: waitUntilIdle(), timeout: 30000 }).catch(() => {});
      }
      result.navigated = "back";
      break;

    case "forward":
      if (typeof page.goForward === "function") {
        await page.goForward({ waitUntil: waitUntilIdle(), timeout: 30000 }).catch(() => {});
      }
      result.navigated = "forward";
      break;

    case "reload":
      if (typeof page.reload === "function") {
        await page.reload({ waitUntil: waitUntilIdle(), timeout: 30000 });
      }
      result.reloaded = true;
      break;

    case "key": {
      if (!value) throw new Error("value required for key action (e.g. 'Enter', 'Escape', 'Tab')");
      if (selector) {
        try { await page.focus(selector); } catch (_) {}
      }
      if (page.keyboard && typeof page.keyboard.press === "function") {
        await page.keyboard.press(value);
      }
      result.keyPressed = value;
      if (selector) result.focused = selector;
      break;
    }

    case "tap": {
      const [tx, ty] = await resolvePoint(page, { selector, x, y });
      if (typeof page.tap === "function" && selector) {
        try { await page.tap(selector); break; } catch (_) { /* fall through */ }
      }
      // Emulate a touch tap via CDP touch events if available, otherwise click
      await simulateTouchTap(page, tx, ty);
      result.tappedAt = { x: tx, y: ty };
      break;
    }

    case "swipe": {
      const [sx, sy] = await resolvePoint(page, { selector: opts.fromSelector, x: opts.fromX, y: opts.fromY });
      const [ex, ey] = await resolvePoint(page, { selector: opts.toSelector, x: opts.toX, y: opts.toY });
      const steps = Math.max(2, Math.min(parseInt(opts.steps, 10) || 20, 200));
      await simulateTouchSwipe(page, sx, sy, ex, ey, steps);
      result.swipedFrom = { x: sx, y: sy };
      result.swipedTo = { x: ex, y: ey };
      break;
    }

    case "long_press": {
      const [px, py] = await resolvePoint(page, { selector, x, y });
      const duration = Math.max(100, Math.min(parseInt(value, 10) || 800, 10000));
      await page.mouse.move(px, py);
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, duration));
      await page.mouse.up();
      result.longPressedAt = { x: px, y: py };
      result.holdMs = duration;
      break;
    }

    case "toggle": {
      if (!selector) throw new Error("selector required for toggle action");
      // Toggles display:none on the matching element(s). Useful for A/B visual comparison.
      const mode = value || "toggle"; // "hide" | "show" | "toggle"
      const state = await page.evaluate((args) => {
        const els = Array.from(document.querySelectorAll(args.sel));
        if (!els.length) return { count: 0, visible: null };
        let nowVisible;
        for (const el of els) {
          const currentlyHidden = el.style.display === "none" || getComputedStyle(el).display === "none";
          if (args.mode === "hide") {
            el.dataset.__dvPrevDisplay = el.dataset.__dvPrevDisplay || el.style.display || "";
            el.style.display = "none";
            nowVisible = false;
          } else if (args.mode === "show") {
            el.style.display = el.dataset.__dvPrevDisplay != null ? el.dataset.__dvPrevDisplay : "";
            nowVisible = true;
          } else {
            if (currentlyHidden) {
              el.style.display = el.dataset.__dvPrevDisplay != null ? el.dataset.__dvPrevDisplay : "";
              nowVisible = true;
            } else {
              el.dataset.__dvPrevDisplay = el.dataset.__dvPrevDisplay || el.style.display || "";
              el.style.display = "none";
              nowVisible = false;
            }
          }
        }
        return { count: els.length, visible: nowVisible };
      }, { sel: selector, mode });
      result.toggled = selector;
      result.count = state.count;
      result.nowVisible = state.visible;
      if (!state.count) throw new Error("toggle: no elements match " + selector);
      break;
    }

    case "dialog": {
      // Install a one-shot handler for the next dialog (alert / confirm / prompt / beforeunload)
      if (typeof page.once !== "function") {
        result.warning = "Dialog handling not supported by this browser driver";
        break;
      }
      const accept = opts.accept !== false;
      const promptText = typeof value === "string" ? value : undefined;
      page.once("dialog", async (dialog) => {
        try {
          if (accept) {
            if (promptText != null && typeof dialog.accept === "function") {
              await dialog.accept(promptText);
            } else {
              await dialog.accept();
            }
          } else {
            await dialog.dismiss();
          }
        } catch (_) {}
      });
      result.dialogHandlerInstalled = true;
      result.accept = accept;
      if (promptText != null) result.promptText = promptText;
      break;
    }

    case "type":
      if (!selector) throw new Error("selector required for type action");
      await target.click(selector);
      if (typeof target.fill === "function") {
        await target.fill(selector, value || "");
      } else {
        await target.evaluate(function(sel) { document.querySelector(sel).value = ""; }, selector);
        await target.type(selector, value || "");
      }
      result.typed = value;
      result.into = selector;
      break;

    case "select":
      if (!selector) throw new Error("selector required for select action");
      if (typeof target.selectOption === "function") {
        await target.selectOption(selector, value || "");
      } else {
        await target.select(selector, value || "");
      }
      result.selected = value;
      result.from = selector;
      break;

    case "scroll":
      await page.evaluate((scrollY) => {
        window.scrollBy(0, scrollY);
      }, parseInt(value) || 500);
      result.scrolledBy = parseInt(value) || 500;
      break;

    case "hover":
      if (selector) {
        await target.hover(selector);
      } else if (x !== undefined && y !== undefined) {
        await page.mouse.move(x, y);
      }
      result.hoveredOn = selector || (x + "," + y);
      break;

    case "navigate":
      if (value) {
        var navUrl;
        if (value.startsWith("/") && !value.startsWith("//")) {
          navUrl = url.replace(/\/preview\/.*$/, "") + value;
        } else {
          navUrl = url + value;
        }
        try {
          var parsed = new URL(navUrl);
          var baseUrl = new URL(url);
          if (parsed.origin !== baseUrl.origin) {
            throw new Error("Navigation restricted to preview origin only");
          }
        } catch (parseErr) {
          if (parseErr.message.includes("restricted")) throw parseErr;
          throw new Error("Navigation restricted to preview origin only");
        }
        await page.goto(navUrl, { waitUntil: waitUntilIdle(), timeout: 30000 });
      }
      result.navigatedTo = value;
      break;

    case "evaluate":
      if (!value) throw new Error("value required for evaluate action (JavaScript code to run)");
      try {
        // Wrap in async IIFE so user code can use await and statements
        var wrappedCode = "(async () => { " + value + " })()";
        var evalResult = await target.evaluate(wrappedCode);
        result.evaluated = true;
        result.returnValue = evalResult !== undefined ? JSON.stringify(evalResult) : undefined;
      } catch (evalErr) {
        result.evaluated = false;
        result.evalError = evalErr.message;
      }
      break;

    case "pinch": {
      // Two-finger pinch gesture. Moves two touch points from startDistance
      // to endDistance along a horizontal axis centred at (cx, cy).
      const [cx, cy] = await resolvePoint(page, {
        selector, x: opts.centerX != null ? opts.centerX : x, y: opts.centerY != null ? opts.centerY : y
      });
      const startDist = Math.max(2, Number(opts.startDistance) || 200);
      const endDist   = Math.max(2, Number(opts.endDistance)   || 50);
      const steps     = Math.max(2, Math.min(Number(opts.steps) || 20, 200));
      const out = await simulateTouchPinch(page, cx, cy, startDist, endDist, steps);
      result.pinched = { centerX: cx, centerY: cy, startDistance: startDist, endDistance: endDist, steps };
      if (out && out.error) result.warning = out.error;
      break;
    }

    default:
      throw new Error("Unknown action: " + action + ". Supported: click, type, select, scroll, hover, navigate, evaluate");
  }

  // Wait a moment for any animations/updates
  await new Promise((r) => setTimeout(r, 500));

  // Take a screenshot after the action
  const screenshotBuf = await page.screenshot({ type: "png" });
  result.screenshot = {
    base64: screenshotBuf.toString("base64"),
    mimeType: "image/png"
  };
  result.pageTitle = await page.title();
  result.currentUrl = page.url();

  return result;
}

// ── Arbitrary URL browsing with network request capture ─────────────────────

const { isBlockedHost, extractFromHtml } = require("./web-fetch");

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

/**
 * Navigate to an arbitrary URL, wait for JS to execute, and capture all
 * network requests the page makes. Useful for finding dynamically-loaded
 * assets (Spine skeletons, video, lazy-loaded images, XHR/fetch calls)
 * that a plain HTTP fetch cannot see.
 *
 * @param {object} opts
 * @param {string}  opts.url             - URL to load (http/https, public hosts only)
 * @param {number}  [opts.waitMs]        - Extra wait after navigation completes (default: 2000, max: 30000)
 * @param {string}  [opts.waitUntil]     - Navigation completion signal ("load", "domcontentloaded", "networkidle", "networkidle2")
 * @param {number}  [opts.width]         - Viewport width (default: 1280)
 * @param {number}  [opts.height]        - Viewport height (default: 720)
 * @param {object}  [opts.filter]        - { resourceTypes?: [...], urlPattern?: "regex", extensions?: [...] }
 * @param {boolean} [opts.returnHtml]    - Include rendered HTML content in response
 * @param {boolean} [opts.captureConsole]- Capture console logs + page errors (default: true)
 * @param {number}  [opts.maxRequests]   - Cap on stored requests (default: 500, max: 2000)
 * @param {string}  [opts.userAgent]     - Override User-Agent header
 * @param {object}  [opts.headers]       - Extra HTTP headers to send with every request
 * @returns {Promise<object>} { url, finalUrl, title, requestCount, requestsByType, requests, consoleLogs, errors, duration, truncated, html? }
 */
async function browseUrl(opts) {
  if (!opts || !opts.url) return { error: "url parameter is required" };

  let parsed;
  try {
    parsed = new URL(opts.url);
  } catch (e) {
    return { error: "Invalid URL: " + e.message };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { error: "Requests to private/internal network addresses are not allowed" };
  }

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const width  = Math.min(Math.max(parseInt(opts.width, 10)  || 1280, 200), 3840);
  const height = Math.min(Math.max(parseInt(opts.height, 10) || 720,  200), 2160);
  const waitMs = Math.min(Math.max(parseInt(opts.waitMs, 10) || 2000, 0), 30000);
  const maxReq = Math.min(Math.max(parseInt(opts.maxRequests, 10) || 500, 1), 2000);

  // Parse filter options
  const resourceTypesFilter = (opts.filter && Array.isArray(opts.filter.resourceTypes) && opts.filter.resourceTypes.length)
    ? new Set(opts.filter.resourceTypes.map((t) => String(t).toLowerCase()))
    : null;
  const extensionsFilter = (opts.filter && Array.isArray(opts.filter.extensions) && opts.filter.extensions.length)
    ? new Set(opts.filter.extensions.map((e) => String(e).toLowerCase().replace(/^\./, "")))
    : null;
  let urlPatternRe = null;
  if (opts.filter && opts.filter.urlPattern) {
    try { urlPatternRe = new RegExp(opts.filter.urlPattern); }
    catch (e) { return { error: "Invalid urlPattern regex: " + e.message }; }
  }

  const browser = await getBrowser();
  const page = await newPage(browser);

  const requests = [];
  const seenUrls = new Set();
  const consoleLogs = [];
  const errors = [];
  let truncated = false;

  try {
    await setViewport(page, width, height);

    // Set custom user-agent if provided
    if (opts.userAgent) {
      if (typeof page.setUserAgent === "function") {
        await page.setUserAgent(opts.userAgent);
      } else if (typeof page.setExtraHTTPHeaders === "function") {
        await page.setExtraHTTPHeaders({ "User-Agent": opts.userAgent });
      }
    }
    // Set extra headers if provided
    if (opts.headers && typeof opts.headers === "object" && typeof page.setExtraHTTPHeaders === "function") {
      // Strip any unsafe header names
      const safeHeaders = {};
      for (const k in opts.headers) {
        if (/^[a-zA-Z0-9_-]+$/.test(k) && typeof opts.headers[k] === "string") {
          safeHeaders[k] = opts.headers[k];
        }
      }
      if (Object.keys(safeHeaders).length) await page.setExtraHTTPHeaders(safeHeaders);
    }

    // Response listener — capture every network response
    page.on("response", (resp) => {
      try {
        if (requests.length >= maxReq) { truncated = true; return; }
        const req = resp.request ? resp.request() : null;
        const rurl = typeof resp.url === "function" ? resp.url() : "";
        if (!rurl || seenUrls.has(rurl)) return;

        const rtype = (req && typeof req.resourceType === "function") ? req.resourceType() : "other";
        if (resourceTypesFilter && !resourceTypesFilter.has(rtype)) return;
        if (urlPatternRe && !urlPatternRe.test(rurl)) return;
        if (extensionsFilter) {
          // Match against the URL path extension
          let pathname = "";
          try { pathname = new URL(rurl).pathname; } catch (_) { pathname = rurl; }
          const dot = pathname.lastIndexOf(".");
          const ext = dot >= 0 ? pathname.slice(dot + 1).toLowerCase() : "";
          if (!extensionsFilter.has(ext)) return;
        }

        const headers = typeof resp.headers === "function" ? (resp.headers() || {}) : {};
        const clHeader = headers["content-length"];
        const size = clHeader ? parseInt(clHeader, 10) : null;

        seenUrls.add(rurl);
        requests.push({
          url: rurl,
          method: (req && typeof req.method === "function") ? req.method() : "GET",
          resourceType: rtype,
          category: categorizeResourceType(rtype),
          status: typeof resp.status === "function" ? resp.status() : 0,
          contentType: (headers["content-type"] || "").split(";")[0].trim(),
          size: Number.isFinite(size) ? size : null,
          fromCache: typeof resp.fromCache === "function" ? !!resp.fromCache() : false
        });
      } catch (_) { /* ignore individual response errors */ }
    });

    if (opts.captureConsole !== false) {
      page.on("console", (msg) => {
        if (consoleLogs.length >= 200) return;
        try { consoleLogs.push({ type: msg.type(), text: msg.text() }); } catch (_) {}
      });
      page.on("pageerror", (err) => {
        if (errors.length >= 100) return;
        errors.push({ type: "pageerror", message: err.message });
      });
      page.on("requestfailed", (req) => {
        if (errors.length >= 100) return;
        try {
          const failure = typeof req.failure === "function" ? req.failure() : null;
          errors.push({
            type: "requestfailed",
            url: req.url(),
            failure: failure ? (failure.errorText || String(failure)) : null
          });
        } catch (_) {}
      });
    }

    // Navigate
    const navWaitUntil = opts.waitUntil || (_lib && _lib.type === "puppeteer" ? "networkidle2" : "networkidle");
    const navStart = Date.now();
    try {
      await page.goto(parsed.href, { waitUntil: navWaitUntil, timeout: 45000 });
    } catch (navErr) {
      // Navigation errors (timeouts) are common on heavy pages — keep whatever we captured
      errors.push({ type: "navigation", message: navErr.message });
    }

    // Extra wait for delayed loads (animations, lazy-loaded media, Spine init, etc.)
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const duration = Date.now() - navStart;
    const finalUrl = typeof page.url === "function" ? page.url() : parsed.href;
    let title = "";
    try { title = await page.title(); } catch (_) {}

    // Group requests by category for quick overview
    const requestsByType = {};
    for (const r of requests) {
      const cat = r.category;
      requestsByType[cat] = (requestsByType[cat] || 0) + 1;
    }

    const result = {
      url: parsed.href,
      finalUrl,
      title,
      duration,
      requestCount: requests.length,
      requestsByType,
      requests,
      consoleLogs,
      errors,
      truncated
    };

    if (opts.returnHtml) {
      try {
        result.html = await page.content();
      } catch (e) {
        result.html = "";
        result.htmlError = e.message;
      }
    }

    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── List deployed previews ───────────────────────────────────────────────────

function listPreviews() {
  const previews = [];
  for (const key in buildStatus) {
    const st = buildStatus[key];
    if (st.status === "ready" || st.status === "running") {
      const [ownerRepo, slug] = key.split(":");
      const [owner, repo] = ownerRepo.split("/");
      const srv = runningServers[key];
      previews.push({
        key,
        owner,
        repo,
        slug,
        status: st.status,
        mode: st.mode || "static",
        serverPort: srv ? srv.port : null,
        previewUrl: "/preview/" + owner + "/" + repo + "/" + slug + "/",
        lastBuild: st.lastBuild,
        commitSha: st.commitSha
      });
    }
  }
  return previews;
}

// ── Run Test Harness ─────────────────────────────────────────────────────────

/**
 * Load the test harness page and run the full or quick test suite.
 * Waits for completion and returns structured results.
 * @param {object} opts - { owner, repo, slug, mode }
 * mode: "full" (default) | "quick"
 */
async function runTest(opts) {
  const { owner, repo, slug, mode } = opts;

  if (!hasPlaywright()) {
    return { error: "No browser available." };
  }

  // Build the test harness URL
  const safeOwner = (owner || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRepo  = (repo || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeSlug  = (slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeOwner || !safeRepo || !safeSlug) {
    throw new Error("Invalid owner, repo, or slug");
  }

  let baseUrl = "http://127.0.0.1:" + (process.env.PORT || 3000);
  if (getRemoteWSEndpoint()) {
    try {
      const tunnelStatus = require("./tunnel").status();
      if (tunnelStatus && tunnelStatus.url) baseUrl = tunnelStatus.url;
      else throw new Error("No tunnel URL for remote browser");
    } catch (e) {
      throw new Error("Remote browser needs tunnel URL: " + e.message);
    }
  }
  const testUrl = baseUrl + "/test/" + safeOwner + "/" + safeRepo + "/" + safeSlug;

  const browser = await getBrowser();
  const page = await newPage(browser);
  try {
    await setViewport(page, 1280, 900);
    console.log("[mcp-browser] Loading test harness: " + testUrl);
    await page.goto(testUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Click the appropriate test button
    const btnText = (mode === "quick") ? "Quick Test" : "Run Full Test";
    await page.evaluate((text) => {
      const btns = [...document.querySelectorAll("button")];
      const btn = btns.find(b => b.textContent.trim() === text);
      if (btn) btn.click();
      else throw new Error("Button '" + text + "' not found");
    }, btnText);

    console.log("[mcp-browser] Test started: " + btnText);

    // Poll for completion (check status element for "Done!" text)
    const maxWaitMs = (mode === "quick") ? 120000 : 300000;
    const pollInterval = 2000;
    let elapsed = 0;
    let done = false;

    while (elapsed < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollInterval));
      elapsed += pollInterval;
      const statusText = await page.evaluate(() => {
        const s = document.getElementById("status");
        return s ? s.textContent : "";
      });
      if (statusText === "Done!") { done = true; break; }
    }

    if (!done) {
      return { error: "Test timed out after " + (maxWaitMs / 1000) + "s" };
    }

    // Extract results
    const results = await page.evaluate(() => {
      const logEl = document.getElementById("log");
      const sumEl = document.getElementById("sum");
      return {
        summary: sumEl ? sumEl.textContent : "",
        passed: sumEl ? sumEl.classList.contains("pass") : false,
        fullLog: logEl ? logEl.textContent : "",
        // Extract stats from stats row
        stats: [...document.querySelectorAll(".stat-box")].map(box => ({
          label: box.querySelector(".lbl")?.textContent || "",
          value: parseInt(box.querySelector(".num")?.textContent || "0")
        }))
      };
    });

    // Take screenshot of the results
    const screenshotBuf = await page.screenshot({ type: "png" });
    results.screenshot = {
      base64: screenshotBuf.toString("base64"),
      mimeType: "image/png"
    };
    results.testUrl = testUrl;
    results.mode = mode || "full";

    return results;
  } finally {
    await page.close();
  }
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

// ── Pixel color / element rect / measurement ────────────────────────────────

const pngLite = require("./png-lite");

/**
 * Read the RGB(A) color of a single pixel in the current rendered page.
 * Prefers sharp (native) when available and falls back to png-lite.
 *
 * @param {object} opts - { owner, repo, slug, x, y, width?, height? }
 */
async function getPixelColor(opts) {
  const { owner, repo, slug, width, height } = opts;
  const x = Number(opts.x);
  const y = Number(opts.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { error: "x and y required" };
  }

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, width, height);

  const vp = getViewport(page) || { width: 1280, height: 720 };
  if (x < 0 || y < 0 || x >= vp.width || y >= vp.height) {
    return { error: "point out of viewport", point: { x, y }, viewport: vp };
  }

  const enrich = require("./mcp-enrichments");

  // Try sharp path first — faster, no JS PNG parsing
  if (enrich.have("sharp")) {
    try {
      const buf = await page.screenshot({ type: "png" });
      const pixel = await enrich.sharpPixel(buf, x, y);
      if (!pixel.error) return { point: { x, y }, viewport: vp, url, ...pixel };
      // fall through on error
    } catch (_) { /* fall through */ }
  }

  // png-lite fallback: take a 1x1 clip, decode
  let buf;
  try {
    buf = await page.screenshot({ type: "png", clip: { x, y, width: 1, height: 1 } });
  } catch (e) {
    buf = await page.screenshot({ type: "png" });
    const full = pngLite.decode(buf);
    const pixel = pngLite.getPixel(full, x, y);
    return { point: { x, y }, viewport: vp, url, engine: "png-lite", ...pixel };
  }
  const img = pngLite.decode(buf);
  const pixel = pngLite.getPixel(img, 0, 0);
  return { point: { x, y }, viewport: vp, url, engine: "png-lite", ...pixel };
}

/**
 * Get the bounding rect + computed styles of a single element by selector.
 * Structured data — no screenshot to squint at.
 *
 * @param {object} opts - { owner, repo, slug, selector, width?, height? }
 */
async function getElementRect(opts) {
  const { owner, repo, slug, selector, width, height } = opts;
  if (!selector) return { error: "selector required" };

  if (!hasPlaywright()) {
    return { error: "No browser available." };
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, width, height);

  const info = await page.evaluate((sel) => {
    const els = Array.from(document.querySelectorAll(sel));
    if (!els.length) return null;
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        rect: {
          x: r.x, y: r.y,
          top: r.top, left: r.left, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
          centerX: r.x + r.width / 2,
          centerY: r.y + r.height / 2
        },
        visible: !!(r.width && r.height) && s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0,
        styles: {
          display: s.display, position: s.position, visibility: s.visibility,
          opacity: s.opacity, zIndex: s.zIndex,
          width: s.width, height: s.height,
          color: s.color, backgroundColor: s.backgroundColor,
          font: s.font, fontSize: s.fontSize, fontWeight: s.fontWeight,
          margin: s.margin, padding: s.padding, border: s.border,
          transform: s.transform, transformOrigin: s.transformOrigin,
          overflow: s.overflow,
          boxShadow: s.boxShadow,
          borderRadius: s.borderRadius
        }
      };
    });
  }, selector);

  if (!info || !info.length) {
    return { error: "no element matched", selector, url };
  }
  return {
    selector,
    count: info.length,
    elements: info,
    primary: info[0],
    url
  };
}

/**
 * Measure distance / delta between two points, selectors, or a mix.
 * Returns structured data (dx, dy, Euclidean distance) so Claude can do math
 * directly instead of squinting at screenshots.
 *
 * @param {object} opts - { owner, repo, slug, a: {selector|x,y}, b: {selector|x,y} }
 */
async function measure(opts) {
  const { owner, repo, slug, a, b, width, height } = opts;
  if (!a || !b) return { error: "a and b required" };

  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, width, height);

  const [ax, ay] = await resolvePoint(page, a);
  const [bx, by] = await resolvePoint(page, b);
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return {
    a: { x: ax, y: ay, selector: a.selector || null },
    b: { x: bx, y: by, selector: b.selector || null },
    dx, dy,
    distance,
    manhattan: Math.abs(dx) + Math.abs(dy),
    url
  };
}

/**
 * Compare two PNG screenshots pixel-by-pixel and return diff stats.
 * Prefers pixelmatch (generates a heatmap) when available; falls back to
 * the zero-dep png-lite diff.
 *
 * @param {object} opts - { before, after, threshold?, includeAA? }
 */
async function screenshotDiff(opts) {
  if (!opts || !opts.before || !opts.after) {
    return { error: "before and after (base64 PNGs) are required" };
  }

  const enrich = require("./mcp-enrichments");
  if (enrich.have("pixelmatch") && enrich.have("pngjs")) {
    // pixelmatch threshold is 0..1, default 0.1 — map our "10/255" default
    const threshold = opts.threshold != null
      ? (opts.threshold > 1 ? Number(opts.threshold) / 255 : Number(opts.threshold))
      : 0.1;
    const result = enrich.pixelDiff(opts.before, opts.after, {
      threshold,
      includeAA: !!opts.includeAA
    });
    if (!result.error) {
      result.engine = "pixelmatch";
      return result;
    }
    // fall through on error
  }

  // png-lite fallback
  let a, b;
  try {
    a = pngLite.decode(Buffer.from(opts.before, "base64"));
  } catch (e) {
    return { error: "failed to decode 'before' PNG: " + e.message };
  }
  try {
    b = pngLite.decode(Buffer.from(opts.after, "base64"));
  } catch (e) {
    return { error: "failed to decode 'after' PNG: " + e.message };
  }
  const threshold = opts.threshold != null ? Number(opts.threshold) : 10;
  const out = pngLite.diff(a, b, { threshold });
  out.engine = "png-lite";
  return out;
}

// ── Emulation (DPR, color scheme, geolocation, network throttling) ──────────

/**
 * Apply environment emulation to a persistent preview session.
 * Resets are sticky for that session (cleared on session reset / close).
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   deviceScaleFactor?, colorScheme?, reducedMotion?, touch?, geolocation?,
 *   offline?, downloadThroughput?, uploadThroughput?, latency?, userAgent?
 * }
 */
async function emulate(opts) {
  const { owner, repo, slug } = opts;
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const applied = {};

  // devicePixelRatio / deviceScaleFactor
  if (opts.deviceScaleFactor != null) {
    const dpr = Math.max(0.5, Math.min(Number(opts.deviceScaleFactor), 4));
    if (typeof page.setViewport === "function") {
      // Puppeteer
      const vp = getViewport(page) || { width: 1280, height: 720 };
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: dpr });
      applied.deviceScaleFactor = dpr;
    } else {
      // Playwright can't change DPR after context creation — emulate via CDP
      try {
        const client = await page.createCDPSession();
        const vp = getViewport(page) || { width: 1280, height: 720 };
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: vp.width, height: vp.height, deviceScaleFactor: dpr, mobile: false
        });
        applied.deviceScaleFactor = dpr;
        await client.detach().catch(() => {});
      } catch (e) {
        applied.deviceScaleFactorError = e.message;
      }
    }
  }

  // Color scheme (dark / light / no-preference)
  if (opts.colorScheme) {
    try {
      if (typeof page.emulateMediaFeatures === "function") {
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: opts.colorScheme }]);
      } else if (typeof page.emulateMedia === "function") {
        await page.emulateMedia({ colorScheme: opts.colorScheme });
      }
      applied.colorScheme = opts.colorScheme;
    } catch (e) {
      applied.colorSchemeError = e.message;
    }
  }

  // Reduced motion
  if (opts.reducedMotion) {
    try {
      if (typeof page.emulateMediaFeatures === "function") {
        await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: opts.reducedMotion }]);
      } else if (typeof page.emulateMedia === "function") {
        await page.emulateMedia({ reducedMotion: opts.reducedMotion });
      }
      applied.reducedMotion = opts.reducedMotion;
    } catch (e) {
      applied.reducedMotionError = e.message;
    }
  }

  // Touch
  if (opts.touch != null) {
    try {
      if (typeof page.setViewport === "function") {
        const vp = getViewport(page) || { width: 1280, height: 720 };
        await page.setViewport({ ...vp, hasTouch: !!opts.touch, isMobile: !!opts.touch });
      }
      applied.touch = !!opts.touch;
    } catch (e) {
      applied.touchError = e.message;
    }
  }

  // Geolocation (Puppeteer: page.setGeolocation; Playwright: context.setGeolocation)
  if (opts.geolocation && typeof opts.geolocation === "object") {
    try {
      const geo = {
        latitude:  Number(opts.geolocation.latitude),
        longitude: Number(opts.geolocation.longitude),
        accuracy:  Number(opts.geolocation.accuracy) || 50
      };
      if (typeof page.setGeolocation === "function") {
        await page.setGeolocation(geo);
      } else if (page.context && typeof page.context === "function") {
        const ctx = page.context();
        if (ctx && typeof ctx.setGeolocation === "function") {
          await ctx.setGeolocation(geo);
          await ctx.grantPermissions(["geolocation"]).catch(() => {});
        }
      }
      applied.geolocation = geo;
    } catch (e) {
      applied.geolocationError = e.message;
    }
  }

  // Network throttling / offline mode (via CDP)
  if (opts.offline != null || opts.downloadThroughput != null || opts.latency != null) {
    try {
      const client = typeof page.createCDPSession === "function"
        ? await page.createCDPSession()
        : null;
      if (client) {
        await client.send("Network.enable");
        await client.send("Network.emulateNetworkConditions", {
          offline: !!opts.offline,
          latency: opts.latency != null ? Number(opts.latency) : 0,
          downloadThroughput: opts.downloadThroughput != null ? Number(opts.downloadThroughput) : -1,
          uploadThroughput:   opts.uploadThroughput   != null ? Number(opts.uploadThroughput)   : -1
        });
        applied.network = {
          offline: !!opts.offline,
          latency: opts.latency != null ? Number(opts.latency) : 0,
          downloadThroughput: opts.downloadThroughput != null ? Number(opts.downloadThroughput) : -1,
          uploadThroughput: opts.uploadThroughput != null ? Number(opts.uploadThroughput) : -1
        };
        await client.detach().catch(() => {});
      }
    } catch (e) {
      applied.networkError = e.message;
    }
  }

  // Custom User-Agent
  if (opts.userAgent) {
    try {
      if (typeof page.setUserAgent === "function") {
        await page.setUserAgent(opts.userAgent);
      } else if (typeof page.setExtraHTTPHeaders === "function") {
        await page.setExtraHTTPHeaders({ "User-Agent": opts.userAgent });
      }
      applied.userAgent = opts.userAgent;
    } catch (e) {
      applied.userAgentError = e.message;
    }
  }

  return { applied, url };
}

// ── Storage: cookies, localStorage, sessionStorage ─────────────────────────

/**
 * Read or write cookies, localStorage, or sessionStorage on a preview session.
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   store: "cookies" | "localStorage" | "sessionStorage",
 *   op: "get" | "set" | "delete" | "list" | "clear",
 *   key?, value?, cookie?: { name, value, domain?, path?, expires? }
 * }
 */
async function storage(opts) {
  const { owner, repo, slug } = opts;
  const store = opts.store || "localStorage";
  const op = opts.op || "list";

  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  if (store === "cookies") {
    if (op === "list" || op === "get") {
      let cookies = [];
      try {
        if (typeof page.cookies === "function") {
          cookies = await page.cookies();
        } else if (page.context && typeof page.context === "function") {
          cookies = await page.context().cookies();
        }
      } catch (e) { return { error: "cookies read failed: " + e.message, url }; }
      if (op === "get" && opts.key) {
        return { cookie: cookies.find((c) => c.name === opts.key) || null, url };
      }
      return { cookies, url };
    }
    if (op === "set") {
      const c = opts.cookie || { name: opts.key, value: opts.value };
      if (!c.name) return { error: "cookie name required", url };
      try {
        if (typeof page.setCookie === "function") {
          await page.setCookie(c);
        } else if (page.context && typeof page.context === "function") {
          await page.context().addCookies([{
            name: c.name, value: String(c.value || ""),
            domain: c.domain, path: c.path || "/",
            expires: c.expires, url: (!c.domain ? url : undefined)
          }]);
        }
      } catch (e) { return { error: "cookie set failed: " + e.message, url }; }
      return { set: c.name, url };
    }
    if (op === "delete") {
      try {
        if (typeof page.deleteCookie === "function") {
          await page.deleteCookie({ name: opts.key });
        } else if (page.context && typeof page.context === "function") {
          const ctx = page.context();
          const cookies = await ctx.cookies();
          await ctx.clearCookies();
          // Re-add everything except the deleted one
          const keep = cookies.filter((c) => c.name !== opts.key);
          if (keep.length) await ctx.addCookies(keep);
        }
      } catch (e) { return { error: "cookie delete failed: " + e.message, url }; }
      return { deleted: opts.key, url };
    }
    if (op === "clear") {
      try {
        if (page.context && typeof page.context === "function") {
          await page.context().clearCookies();
        } else if (typeof page.deleteCookie === "function") {
          const cookies = await page.cookies();
          for (const c of cookies) await page.deleteCookie({ name: c.name });
        }
      } catch (e) { return { error: "cookie clear failed: " + e.message, url }; }
      return { cleared: true, url };
    }
  }

  // localStorage / sessionStorage via page.evaluate
  if (store === "localStorage" || store === "sessionStorage") {
    const result = await page.evaluate((args) => {
      const s = args.store === "sessionStorage" ? window.sessionStorage : window.localStorage;
      switch (args.op) {
        case "list": {
          const out = {};
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            out[k] = s.getItem(k);
          }
          return { items: out, count: s.length };
        }
        case "get":
          return { key: args.key, value: s.getItem(args.key) };
        case "set":
          s.setItem(args.key, args.value == null ? "" : String(args.value));
          return { set: args.key };
        case "delete":
          s.removeItem(args.key);
          return { deleted: args.key };
        case "clear":
          s.clear();
          return { cleared: true };
        default:
          return { error: "unknown op: " + args.op };
      }
    }, { store, op, key: opts.key, value: opts.value });
    return { store, ...result, url };
  }

  return { error: "unknown store: " + store };
}

// ── Performance metrics ────────────────────────────────────────────────────

/**
 * Collect performance metrics for a preview: navigation timing, resource count,
 * and paint timings. Optionally reloads to get a clean measurement.
 */
async function performanceMetrics(opts) {
  const { owner, repo, slug } = opts;
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  if (opts.reload) {
    try { await page.reload({ waitUntil: waitUntilIdle(), timeout: 30000 }); } catch (_) {}
  }

  const metrics = await page.evaluate(() => {
    const out = {};
    const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav) {
      out.navigation = {
        type: nav.type,
        duration: Math.round(nav.duration),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd),
        ttfb: Math.round(nav.responseStart),
        domInteractive: Math.round(nav.domInteractive),
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize
      };
    }
    const paint = performance.getEntriesByType && performance.getEntriesByType("paint") || [];
    out.paint = {};
    for (const p of paint) out.paint[p.name] = Math.round(p.startTime);

    const resources = performance.getEntriesByType && performance.getEntriesByType("resource") || [];
    out.resourceCount = resources.length;
    out.totalTransfer = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
    out.resourcesByType = resources.reduce((acc, r) => {
      const t = r.initiatorType || "other";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    out.memory = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;

    return out;
  });

  return { metrics, url };
}

// ── Network request capture for a preview ─────────────────────────────────

/**
 * Attach network capture to the preview session and collect requests for a duration.
 * Useful for spotting lazy-loaded assets or XHR calls without using web_fetch.
 */
async function capturePreviewRequests(opts) {
  const { owner, repo, slug } = opts;
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const duration = Math.max(1, Math.min(Number(opts.duration) || 5, 60)) * 1000;
  const maxRequests = Math.max(10, Math.min(Number(opts.maxRequests) || 500, 2000));
  const requests = [];
  let truncated = false;

  const onResponse = (resp) => {
    try {
      if (requests.length >= maxRequests) { truncated = true; return; }
      const req = resp.request ? resp.request() : null;
      const rurl = typeof resp.url === "function" ? resp.url() : "";
      if (!rurl) return;
      const rtype = (req && typeof req.resourceType === "function") ? req.resourceType() : "other";
      const headers = typeof resp.headers === "function" ? (resp.headers() || {}) : {};
      requests.push({
        url: rurl,
        method: (req && typeof req.method === "function") ? req.method() : "GET",
        resourceType: rtype,
        status: typeof resp.status === "function" ? resp.status() : 0,
        contentType: (headers["content-type"] || "").split(";")[0].trim(),
        size: headers["content-length"] ? parseInt(headers["content-length"], 10) : null
      });
    } catch (_) {}
  };
  page.on("response", onResponse);

  if (opts.reload) {
    try { await page.reload({ waitUntil: waitUntilIdle(), timeout: 30000 }); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("response", onResponse); } catch (_) {}

  const byType = {};
  for (const r of requests) byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;

  return {
    url, duration: duration / 1000,
    requestCount: requests.length,
    truncated,
    requestsByType: byType,
    requests
  };
}

// ── File download capture ──────────────────────────────────────────────────

/**
 * Trigger a download (via click or evaluate) and return the downloaded file
 * as base64. Works by subscribing to the browser's download events.
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   trigger: "click" | "evaluate",
 *   selector?, code?, timeout?
 * }
 */
async function captureDownload(opts) {
  const { owner, repo, slug } = opts;
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const timeout = Math.max(1000, Math.min(Number(opts.timeout) || 30000, 120000));

  // ── Playwright path ──
  if (typeof page.waitForEvent === "function") {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout });
      if (opts.trigger === "evaluate" && opts.code) {
        await page.evaluate("(async () => { " + opts.code + " })()");
      } else if (opts.selector) {
        await page.click(opts.selector).catch(() => {});
      } else {
        throw new Error("trigger requires selector or code");
      }
      const download = await downloadPromise;
      const fsp = fs.promises;
      const os = require("os");
      const crypto = require("crypto");
      const tmp = path.join(os.tmpdir(), "dv-download-" + crypto.randomBytes(6).toString("hex"));
      await download.saveAs(tmp);
      const buf = await fsp.readFile(tmp);
      await fsp.unlink(tmp).catch(() => {});
      return {
        suggestedFilename: download.suggestedFilename ? download.suggestedFilename() : null,
        byteLength: buf.length,
        base64: buf.toString("base64"),
        url
      };
    } catch (e) {
      return { error: "download capture failed: " + e.message, url };
    }
  }

  // ── Puppeteer path ──
  // Set download behaviour to a temp dir via CDP
  try {
    const os = require("os");
    const crypto = require("crypto");
    const downloadDir = path.join(os.tmpdir(), "dv-download-" + crypto.randomBytes(6).toString("hex"));
    fs.mkdirSync(downloadDir, { recursive: true });
    const client = await page._client().send
      ? page._client()
      : (typeof page.target === "function" ? await page.target().createCDPSession() : null);
    if (client) {
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadDir
      });
    }
    if (opts.trigger === "evaluate" && opts.code) {
      await page.evaluate("(async () => { " + opts.code + " })()");
    } else if (opts.selector) {
      await page.click(opts.selector).catch(() => {});
    } else {
      return { error: "trigger requires selector or code", url };
    }
    // Poll downloadDir for a non-crdownload file
    const deadline = Date.now() + timeout;
    let fileName = null;
    while (Date.now() < deadline) {
      const files = fs.readdirSync(downloadDir).filter((f) => !f.endsWith(".crdownload"));
      if (files.length) { fileName = files[0]; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!fileName) return { error: "download timed out", url };
    const full = path.join(downloadDir, fileName);
    const buf = fs.readFileSync(full);
    try { fs.unlinkSync(full); fs.rmdirSync(downloadDir); } catch (_) {}
    return {
      suggestedFilename: fileName,
      byteLength: buf.length,
      base64: buf.toString("base64"),
      url
    };
  } catch (e) {
    return { error: "download capture failed: " + e.message, url };
  }
}

// ── Deploy + verify one-shot ───────────────────────────────────────────────

/**
 * One-call build-and-verify. Triggers a deploy, waits for it to become ready,
 * then returns a screenshot, console capture, and brief page metadata.
 * Replaces the common 5-call flow: trigger_build → build_status (x3) → screenshot.
 *
 * @param {object} opts - { owner, repo, slug, wait?, width?, height?, duration? }
 */
async function deployAndVerify(opts) {
  const { owner, repo, slug } = opts;
  if (!owner || !repo || !slug) return { error: "owner, repo, slug required" };

  const { getConfig } = require("./config");
  const { branchSlug, buildStatus: bs, deployBranch } = require("./build");

  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.owner === owner && r.repo === repo);
  if (!repoConfig) return { error: "Repository not found: " + owner + "/" + repo };
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return { error: "Branch config not found for slug: " + slug };

  const key = owner + "/" + repo + ":" + slug;
  const startTs = Date.now();

  // Close the existing session so we get a fresh page on the new build
  try { closeSession(owner, repo, slug); } catch (_) {}

  // Kick off the deploy
  deployBranch(repoConfig, bc);

  // Wait for ready (or running). Polls buildStatus.
  const waitMs = Math.max(5000, Math.min(Number(opts.wait) || 180000, 600000));
  const pollInterval = 1000;
  let status;
  while (Date.now() - startTs < waitMs) {
    status = bs[key];
    if (status && (status.status === "ready" || status.status === "running")) break;
    if (status && status.status === "failed") break;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  const deployDuration = Date.now() - startTs;

  if (!status || (status.status !== "ready" && status.status !== "running")) {
    return {
      error: "deploy did not become ready within " + (waitMs / 1000) + "s",
      status: status ? status.status : "unknown",
      log: status && status.log ? String(status.log).slice(-4000) : null,
      duration: deployDuration
    };
  }

  // Give the server a moment to settle, then screenshot + capture logs briefly
  await new Promise((r) => setTimeout(r, 800));

  let screenshot = null;
  let screenshotError = null;
  try {
    const shot = await takeScreenshot({
      owner, repo, slug,
      width: opts.width, height: opts.height,
      fullPage: !!opts.fullPage
    });
    if (shot.error) screenshotError = shot.error;
    else screenshot = shot;
  } catch (e) {
    screenshotError = e.message;
  }

  // Capture console for a short duration (default 2s)
  let consoleResult = null;
  try {
    const duration = opts.duration != null ? Number(opts.duration) : 2;
    consoleResult = await captureConsole({ owner, repo, slug, duration });
  } catch (e) {
    consoleResult = { error: e.message };
  }

  return {
    key,
    status: status.status,
    commitSha: status.commitSha,
    deployDuration,
    screenshot,
    screenshotError,
    console: consoleResult,
    previewUrl: "/preview/" + owner + "/" + repo + "/" + slug + "/"
  };
}

// ── Clipboard read / write ─────────────────────────────────────────────────

/**
 * Read or write the system clipboard inside a preview session. Grants
 * clipboard permissions on the browser context first so navigator.clipboard
 * calls succeed without a user gesture.
 *
 * @param {object} opts - { owner, repo, slug, op: "read" | "write", value? }
 */
async function clipboard(opts) {
  const { owner, repo, slug } = opts;
  const op = opts.op || "read";
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  // Try to grant clipboard permissions. Silently ignore if the API isn't there.
  try {
    const origin = new URL(url).origin;
    if (page.context && typeof page.context === "function") {
      const ctx = page.context();
      if (ctx && typeof ctx.grantPermissions === "function") {
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin }).catch(() => {});
      }
    } else if (browser.defaultBrowserContext) {
      const bctx = browser.defaultBrowserContext();
      if (bctx && typeof bctx.overridePermissions === "function") {
        await bctx.overridePermissions(origin, ["clipboard-read", "clipboard-write"]).catch(() => {});
      }
    }
  } catch (_) {}

  if (op === "read") {
    try {
      const text = await page.evaluate(async () => {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          return { __error: "navigator.clipboard.readText unavailable" };
        }
        try { return await navigator.clipboard.readText(); }
        catch (e) { return { __error: e.message }; }
      });
      if (text && typeof text === "object" && text.__error) {
        return { error: text.__error, url };
      }
      return { text, url };
    } catch (e) {
      return { error: "clipboard read failed: " + e.message, url };
    }
  }

  if (op === "write") {
    const value = opts.value != null ? String(opts.value) : "";
    try {
      const out = await page.evaluate(async (v) => {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          return { __error: "navigator.clipboard.writeText unavailable" };
        }
        try { await navigator.clipboard.writeText(v); return { ok: true }; }
        catch (e) { return { __error: e.message }; }
      }, value);
      if (out && out.__error) return { error: out.__error, url };
      return { wrote: value.length + " chars", url };
    } catch (e) {
      return { error: "clipboard write failed: " + e.message, url };
    }
  }

  return { error: "unknown op: " + op };
}

// ── Canvas data extraction ─────────────────────────────────────────────────

/**
 * Extract pixel data from a <canvas> element. Can return either the full
 * canvas as a base64 PNG (dataUrl=true) or an ImageData region as raw
 * RGBA bytes. Useful for verifying WebGL / 2D canvas output without
 * screenshotting the whole page.
 */
async function canvasData(opts) {
  const { owner, repo, slug, selector } = opts;
  if (!selector) return { error: "selector required (must point to a <canvas>)" };
  if (!hasPlaywright()) return { error: "No browser available." };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, owner, repo, slug);

  const result = await page.evaluate((args) => {
    const el = document.querySelector(args.sel);
    if (!el) return { __error: "canvas not found" };
    if (el.tagName !== "CANVAS") return { __error: "not a <canvas> element: " + el.tagName };
    const canvas = el;
    const canvasWidth  = canvas.width;
    const canvasHeight = canvas.height;

    if (args.dataUrl) {
      try {
        return { width: canvasWidth, height: canvasHeight, dataUrl: canvas.toDataURL("image/png") };
      } catch (e) {
        return { __error: "toDataURL failed: " + e.message + " (canvas may be tainted)" };
      }
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // WebGL canvas — fall back to dataUrl
      try {
        return {
          width: canvasWidth, height: canvasHeight,
          dataUrl: canvas.toDataURL("image/png"),
          note: "WebGL canvas — returning dataUrl (no 2D context for getImageData)"
        };
      } catch (e) {
        return { __error: "WebGL canvas read failed: " + e.message };
      }
    }

    const sx = Number.isFinite(args.x) ? args.x : 0;
    const sy = Number.isFinite(args.y) ? args.y : 0;
    const sw = Number.isFinite(args.w) && args.w > 0 ? args.w : canvasWidth - sx;
    const sh = Number.isFinite(args.h) && args.h > 0 ? args.h : canvasHeight - sy;

    try {
      const img = ctx.getImageData(sx, sy, sw, sh);
      const bytes = new Uint8Array(img.data.buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return {
        width: sw, height: sh,
        canvasWidth, canvasHeight,
        region: { x: sx, y: sy, width: sw, height: sh },
        base64: btoa(bin)
      };
    } catch (e) {
      return { __error: "getImageData failed: " + e.message };
    }
  }, { sel: selector, x: opts.x, y: opts.y, w: opts.width, h: opts.height, dataUrl: !!opts.dataUrl });

  if (result && result.__error) return { error: result.__error, url };
  return { ...result, url };
}

// ── Pages / popups / new tabs ──────────────────────────────────────────────

async function listPages() {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  let pages = [];
  try {
    if (typeof browser.pages === "function") {
      pages = await browser.pages();
    } else if (browser.contexts && typeof browser.contexts === "function") {
      for (const c of browser.contexts()) {
        if (typeof c.pages === "function") pages = pages.concat(await c.pages());
      }
    }
  } catch (e) {
    return { error: "listPages failed: " + e.message };
  }
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let pUrl = "";
    let pTitle = "";
    try { pUrl = typeof p.url === "function" ? p.url() : ""; } catch (_) {}
    try { pTitle = await p.title(); } catch (_) {}
    out.push({ index: i, url: pUrl, title: pTitle });
  }
  return { count: out.length, pages: out };
}

async function closePage(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  let pages = [];
  try {
    if (typeof browser.pages === "function") pages = await browser.pages();
    else if (browser.contexts && typeof browser.contexts === "function") {
      for (const c of browser.contexts()) {
        if (typeof c.pages === "function") pages = pages.concat(await c.pages());
      }
    }
  } catch (e) { return { error: e.message }; }

  let target = null;
  if (Number.isFinite(opts && opts.index)) {
    target = pages[opts.index];
  } else if (opts && opts.urlContains) {
    target = pages.find((p) => {
      try { return (p.url() || "").includes(opts.urlContains); } catch (_) { return false; }
    });
  }
  if (!target) return { error: "no matching page" };
  try {
    await target.close();
    return { closed: true };
  } catch (e) {
    return { error: "close failed: " + e.message };
  }
}

// ── axe-core accessibility audit ───────────────────────────────────────────

/**
 * Run a full axe-core accessibility audit against a preview session.
 * Returns structured violations grouped by rule with node targets + HTML.
 *
 * @param {object} opts - { owner, repo, slug, tags? }
 */
async function runAccessibility(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const enrich = require("./mcp-enrichments");
  if (!enrich.have("axe-core")) {
    return {
      error: "axe-core not installed. Run: npm install axe-core",
      url
    };
  }

  const result = await enrich.runAxe(page, { tags: opts.tags, rules: opts.rules });
  return { ...result, url };
}

// ── Tesseract OCR ──────────────────────────────────────────────────────────

/**
 * Take a screenshot (or region) and run Tesseract OCR over it.
 * Returns extracted text + word-level bounding boxes.
 *
 * @param {object} opts - { owner, repo, slug, selector?, x?, y?, width?, height?, lang? }
 */
async function runOCR(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const enrich = require("./mcp-enrichments");
  if (!enrich.have("tesseract.js")) {
    return { error: "tesseract.js not installed. Run: npm install tesseract.js" };
  }

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.vw, opts.vh);

  let buf;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (el) {
      buf = await el.screenshot({ type: "png" });
    } else {
      return { error: "selector not found: " + opts.selector, url };
    }
  } else if (
    opts.x != null && opts.y != null &&
    opts.width != null && opts.height != null
  ) {
    buf = await page.screenshot({
      type: "png",
      clip: {
        x: Number(opts.x), y: Number(opts.y),
        width: Number(opts.width), height: Number(opts.height)
      }
    });
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }

  const result = await enrich.runOCR(buf, { lang: opts.lang });
  return { ...result, url };
}

// ── Lighthouse full audit ──────────────────────────────────────────────────

/**
 * Run a full Lighthouse audit on a preview URL. Note: Lighthouse launches
 * its own Chrome instance — this is separate from the DeployView browser
 * session. Takes ~15–30s.
 *
 * @param {object} opts - { owner, repo, slug, categories? }
 */
async function runLighthouseAudit(opts) {
  const enrich = require("./mcp-enrichments");
  if (!enrich.have("lighthouse")) {
    return { error: "lighthouse not installed. Run: npm install lighthouse chrome-launcher" };
  }

  let auditUrl;
  try {
    auditUrl = resolvePreviewUrl(opts.owner, opts.repo, opts.slug);
  } catch (e) {
    return { error: e.message };
  }
  return enrich.runLighthouse(auditUrl, { categories: opts.categories });
}

// ── Computed styles with css-tree structural diff ─────────────────────────

/**
 * Get the computed style map for an element, and optionally diff against
 * a second selector so callers can compare tokens structurally (e.g.
 * "1rem" vs "16px" — not the same string but equivalent).
 *
 * @param {object} opts - { owner, repo, slug, selector, compareTo?, properties? }
 */
async function getComputedStyles(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  if (!opts.selector) return { error: "selector required" };

  // Whitelist of properties to collect (configurable)
  const defaultProps = [
    "display", "position", "visibility", "opacity", "z-index",
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "margin", "padding", "border", "border-radius", "box-sizing",
    "color", "background-color", "background-image", "background-size",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
    "text-align", "text-transform", "text-decoration",
    "transform", "transform-origin", "transition", "animation",
    "flex", "flex-direction", "justify-content", "align-items", "gap",
    "grid-template-columns", "grid-template-rows",
    "overflow", "box-shadow", "filter", "cursor"
  ];
  const props = Array.isArray(opts.properties) && opts.properties.length
    ? opts.properties
    : defaultProps;

  const getStyles = async (sel) => {
    return await page.evaluate((args) => {
      const el = document.querySelector(args.sel);
      if (!el) return null;
      const s = window.getComputedStyle(el);
      const out = {};
      for (const p of args.props) out[p] = s.getPropertyValue(p);
      return out;
    }, { sel, props });
  };

  const styles = await getStyles(opts.selector);
  if (!styles) return { error: "selector not found: " + opts.selector, url };

  const result = { selector: opts.selector, styles, url };

  if (opts.compareTo) {
    const other = await getStyles(opts.compareTo);
    if (!other) {
      result.compareError = "compareTo not found: " + opts.compareTo;
      return result;
    }

    const enrich = require("./mcp-enrichments");
    const hasCssTree = enrich.have("css-tree");

    const diffs = {};
    for (const p of props) {
      const a = styles[p];
      const b = other[p];
      if (a === b) continue;
      if (hasCssTree) {
        const structural = enrich.diffCssValues(a, b);
        if (!structural.error && structural.same) continue;  // equivalent
        diffs[p] = { a, b, structural: structural.error ? undefined : structural };
      } else {
        diffs[p] = { a, b };
      }
    }
    result.compareTo = opts.compareTo;
    result.otherStyles = other;
    result.diffCount = Object.keys(diffs).length;
    result.diffs = diffs;
    result.engine = hasCssTree ? "css-tree" : "string";
  }

  return result;
}

// ── Groq visual tools ─────────────────────────────────────────────────────

/**
 * Take a screenshot of a preview and ask Groq a natural-language question
 * about it. Claude gets the text answer — no pixels in its context.
 */
async function visualQuery(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const groq = require("./mcp-groq");
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  const result = await groq.visualQuery({
    pngBase64: buf.toString("base64"),
    question: opts.question,
    model: opts.model,
    maxTokens: opts.maxTokens
  });
  return { ...result, url };
}

/**
 * Use Groq to find an element visually (no CSS selector required) and
 * return its bounding box and a confidence score.
 */
async function findElementVisually(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const groq = require("./mcp-groq");
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const buf = await page.screenshot({ type: "png" });
  const result = await groq.findElement({
    pngBase64: buf.toString("base64"),
    description: opts.description,
    model: opts.model
  });
  return { ...result, url };
}

/**
 * Take two screenshots around an action and ask Groq to describe what changed.
 * Useful for "did my change break anything" checks.
 *
 * @param {object} opts - { owner, repo, slug, action?: { ...interactOpts }, waitMs? }
 */
async function visualDiffWithAction(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const groq = require("./mcp-groq");
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const beforeBuf = await page.screenshot({ type: "png" });

  if (opts.action) {
    try {
      await interact({ owner: opts.owner, repo: opts.repo, slug: opts.slug, ...opts.action });
    } catch (e) {
      return { error: "action failed: " + e.message, url };
    }
  }
  if (opts.waitMs) await new Promise((r) => setTimeout(r, Math.min(Number(opts.waitMs) || 0, 30000)));

  const afterBuf = await page.screenshot({ type: "png" });

  const result = await groq.visualDiff({
    beforeBase64: beforeBuf.toString("base64"),
    afterBase64:  afterBuf.toString("base64"),
    model: opts.model
  });
  return { ...result, url };
}

/**
 * Verify loop: run an action, take a screenshot, ask Groq whether the
 * success condition is met, repeat until pass or maxAttempts. Returns a
 * text summary so Claude doesn't see the intermediate pixels.
 */
async function runVerifyLoop(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const groq = require("./mcp-groq");
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const actAndCapture = async (attempt) => {
    // Optional per-attempt evaluate step so the page advances
    if (opts.evaluate) {
      try {
        const code = typeof opts.evaluate === "string"
          ? opts.evaluate
          : (typeof opts.evaluate === "function" ? opts.evaluate(attempt) : null);
        if (code) {
          await page.evaluate("(async () => { " + code + " })()");
        }
      } catch (e) {
        return { pngBase64: null, note: "evaluate threw: " + e.message };
      }
    }
    // Optional structured interact action
    if (opts.action) {
      try {
        await interact({ owner: opts.owner, repo: opts.repo, slug: opts.slug, ...opts.action });
      } catch (e) {
        return { pngBase64: null, note: "action threw: " + e.message };
      }
    }
    await new Promise((r) => setTimeout(r, Math.min(Number(opts.settleMs) || 300, 5000)));
    const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
    return { pngBase64: buf.toString("base64"), note: "attempt " + (attempt + 1) };
  };

  const result = await groq.verifyLoop({
    condition: opts.condition,
    actAndCapture,
    maxAttempts: opts.maxAttempts,
    delayMs: opts.delayMs,
    model: opts.model
  });
  // Don't return the final screenshot bytes back to Claude unless asked
  if (!opts.returnScreenshot && result.finalScreenshot) {
    delete result.finalScreenshot;
  }
  return { ...result, url };
}

// ── Playwright-native probes (round 4) ────────────────────────────────────

/** Get the latest screenshot of a preview as a buffer — used by tools that
 *  need the raw image (palette, SSIM, render_overlay, image_meta). */
async function _pagePng(opts, fullPage) {
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const buf = await page.screenshot({ type: "png", fullPage: !!fullPage });
  return { page, url, buf };
}

/**
 * Extract the dominant palette from the current page (or a selector).
 */
async function getPalette(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  let buf;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (!el) return { error: "selector not found: " + opts.selector, url };
    buf = await el.screenshot({ type: "png" });
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const enrich = require("./mcp-enrichments");
  const result = await enrich.extractPalette(buf, opts.count || 6);
  return { ...result, url };
}

/**
 * Full color statistics (vibrancy, luminance) for the page or a selector.
 */
async function getColorStats(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  let buf;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (!el) return { error: "selector not found: " + opts.selector, url };
    buf = await el.screenshot({ type: "png" });
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const enrich = require("./mcp-enrichments");
  const result = await enrich.colorStats(buf, opts.count || 8);
  return { ...result, url };
}

/**
 * Visual SSIM similarity between two base64 PNG screenshots.
 */
async function visualSimilarity(opts) {
  if (!opts || !opts.before || !opts.after) {
    return { error: "before and after base64 PNGs are required" };
  }
  const enrich = require("./mcp-enrichments");
  const a = Buffer.from(opts.before, "base64");
  const b = Buffer.from(opts.after, "base64");
  return enrich.ssimDiff(a, b);
}

/**
 * Anti-alias-tolerant screenshot diff via looks-same.
 */
async function toleranceDiffTool(opts) {
  if (!opts || !opts.before || !opts.after) {
    return { error: "before and after base64 PNGs are required" };
  }
  const enrich = require("./mcp-enrichments");
  const a = Buffer.from(opts.before, "base64");
  const b = Buffer.from(opts.after, "base64");
  return enrich.toleranceDiff(a, b, opts);
}

/**
 * Render shapes on top of a preview screenshot (rectangles, lines, labels).
 */
async function renderOverlayTool(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  const enrich = require("./mcp-enrichments");
  const result = await enrich.renderOverlay(buf, opts.shapes || []);
  if (result && result.error) return { error: result.error, url };
  return { base64: result.toString("base64"), mimeType: "image/png", url };
}

/**
 * Return image dimensions + EXIF metadata for a screenshot or arbitrary PNG.
 */
async function imageInfo(opts) {
  const enrich = require("./mcp-enrichments");
  let buf;
  if (opts && opts.base64) {
    buf = Buffer.from(opts.base64, "base64");
  } else {
    if (!hasPlaywright()) return { error: "No browser available and no base64 provided" };
    const browser = await getBrowser();
    const { page } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const dims = enrich.imageDimensions(buf);
  const meta = await enrich.imageMetadata(buf);
  return { dimensions: dims, metadata: meta };
}

/**
 * Parse HTML (page source or remote HTML) with cheerio and return matches.
 */
async function domQueryTool(opts) {
  const enrich = require("./mcp-enrichments");
  if (!opts) return { error: "opts required" };

  let html = opts.html || null;
  let url = null;
  if (!html) {
    if (!hasPlaywright()) return { error: "No browser available and no html provided" };
    const browser = await getBrowser();
    const session = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
    html = await session.page.content();
    url = session.url;
  }
  if (!opts.selector) return { error: "selector required" };
  const result = enrich.domQuery(html, opts.selector, { limit: opts.limit });
  return { ...result, url };
}

/**
 * Find all elements matching a selector on the live page and return their
 * bounding boxes and a short text preview. Live version of domQuery that
 * returns layout info the parser can't see.
 */
async function findAll(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  if (!opts.selector) return { error: "selector required" };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 500);
  const results = await page.evaluate((args) => {
    const out = [];
    const els = document.querySelectorAll(args.sel);
    for (let i = 0; i < Math.min(els.length, args.limit); i++) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: (el.textContent || "").slice(0, 200).trim(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        visible: !!(r.width && r.height) && s.visibility !== "hidden" && s.display !== "none"
      });
    }
    return { total: els.length, items: out };
  }, { sel: opts.selector, limit });
  return { selector: opts.selector, url, ...results };
}

/**
 * Inject web-vitals via evaluate and collect CLS, LCP, INP, FCP, TTFB.
 * Waits a short "settle" duration so values converge.
 */
async function getWebVitals(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const enrich = require("./mcp-enrichments");

  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  // Prefer bundled web-vitals if installed, otherwise load from CDN
  let source = null;
  try {
    const path = require("path");
    const fs = require("fs");
    const wvPath = require.resolve("web-vitals/dist/web-vitals.iife.js");
    source = fs.readFileSync(wvPath, "utf8");
  } catch (_) {}

  if (source) {
    try {
      if (typeof page.addScriptTag === "function") {
        await page.addScriptTag({ content: source });
      } else {
        await page.evaluate(source);
      }
    } catch (e) {
      return { error: "web-vitals inject failed: " + e.message, url };
    }
  } else {
    // Fallback: tell the page to load from a CDN
    try {
      if (typeof page.addScriptTag === "function") {
        await page.addScriptTag({ url: "https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js" });
      } else {
        await page.evaluate(async () => {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js";
            s.onload = resolve;
            s.onerror = () => reject(new Error("CDN load failed"));
            document.head.appendChild(s);
          });
        });
      }
    } catch (e) {
      return { error: "web-vitals CDN load failed: " + e.message, url };
    }
  }

  // Collect vitals — run a listener and wait for a settle duration
  const waitMs = Math.max(500, Math.min(parseInt(opts.waitMs, 10) || 4000, 30000));
  const vitals = await page.evaluate((duration) => {
    return new Promise((resolve) => {
      const got = {};
      const wv = window.webVitals || {};
      const fns = ["onCLS", "onLCP", "onINP", "onFID", "onFCP", "onTTFB"];
      for (const fn of fns) {
        if (typeof wv[fn] === "function") {
          wv[fn]((metric) => {
            got[metric.name] = {
              value: metric.value,
              rating: metric.rating,
              delta: metric.delta,
              id: metric.id
            };
          });
        }
      }
      setTimeout(() => resolve(got), duration);
    });
  }, waitMs);

  return { vitals, url, hasWebVitalsLib: enrich.have("web-vitals") };
}

/**
 * Collect JS + CSS coverage using Playwright's coverage API.
 * Returns per-URL usage percentages.
 */
async function getCodeCoverage(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  if (!page.coverage) return { error: "coverage API not available on this browser driver", url };

  const waitMs = Math.max(500, Math.min(parseInt(opts.waitMs, 10) || 3000, 30000));

  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    if (typeof page.coverage.startCSSCoverage === "function") {
      await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    }

    if (opts.reload) {
      try { await page.reload({ waitUntil: waitUntilIdle(), timeout: 30000 }); } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, waitMs));

    const jsCov = await page.coverage.stopJSCoverage();
    const cssCov = typeof page.coverage.stopCSSCoverage === "function"
      ? await page.coverage.stopCSSCoverage()
      : [];

    const summarize = (items) => items.map((i) => {
      let usedBytes = 0;
      let totalBytes = i.text ? i.text.length : 0;
      for (const r of (i.ranges || [])) usedBytes += r.end - r.start;
      return {
        url: i.url,
        totalBytes,
        usedBytes,
        unusedBytes: totalBytes - usedBytes,
        usedPercent: totalBytes ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0
      };
    });

    return { url, js: summarize(jsCov), css: summarize(cssCov) };
  } catch (e) {
    return { error: "coverage failed: " + e.message, url };
  }
}

/**
 * Capture every request/response for a duration and return a HAR-like array.
 * Richer than capture_requests — includes headers, timings, post data.
 */
async function captureHar(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const duration = Math.max(1, Math.min(Number(opts.duration) || 5, 60)) * 1000;
  const maxEntries = Math.max(10, Math.min(Number(opts.maxEntries) || 500, 2000));
  const entries = [];
  let truncated = false;

  const onRequest = (req) => {
    try {
      if (entries.length >= maxEntries) { truncated = true; return; }
      const entry = {
        startedDateTime: new Date().toISOString(),
        request: {
          method: typeof req.method === "function" ? req.method() : "GET",
          url: typeof req.url === "function" ? req.url() : "",
          headers: typeof req.headers === "function" ? req.headers() : {},
          postData: typeof req.postData === "function" ? req.postData() : null,
          resourceType: typeof req.resourceType === "function" ? req.resourceType() : "other"
        },
        response: null
      };
      entries.push(entry);
      req.__dvEntry = entry;
    } catch (_) {}
  };
  const onResponse = async (resp) => {
    try {
      const req = resp.request ? resp.request() : null;
      const entry = req && req.__dvEntry;
      if (!entry) return;
      const headers = typeof resp.headers === "function" ? resp.headers() : {};
      entry.response = {
        status: typeof resp.status === "function" ? resp.status() : 0,
        statusText: typeof resp.statusText === "function" ? resp.statusText() : "",
        headers,
        contentType: (headers["content-type"] || "").split(";")[0].trim(),
        size: headers["content-length"] ? parseInt(headers["content-length"], 10) : null,
        fromCache: typeof resp.fromCache === "function" ? !!resp.fromCache() : false,
        fromServiceWorker: typeof resp.fromServiceWorker === "function" ? !!resp.fromServiceWorker() : false
      };
      // Capture security info when available
      if (typeof resp.securityDetails === "function") {
        try {
          const sec = await resp.securityDetails();
          if (sec) {
            entry.response.security = {
              protocol: sec.protocol && sec.protocol(),
              issuer: sec.issuer && sec.issuer(),
              subjectName: sec.subjectName && sec.subjectName(),
              validFrom: sec.validFrom && sec.validFrom(),
              validTo: sec.validTo && sec.validTo()
            };
          }
        } catch (_) {}
      }
    } catch (_) {}
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  if (opts.reload) {
    try { await page.reload({ waitUntil: waitUntilIdle(), timeout: 30000 }); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("request", onRequest); } catch (_) {}
  try { page.off("response", onResponse); } catch (_) {}

  return { url, duration: duration / 1000, count: entries.length, truncated, entries };
}

/**
 * List all service workers active in the current context.
 */
async function listServiceWorkers(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const workers = [];
  if (typeof page.workers === "function") {
    for (const w of page.workers()) {
      try {
        workers.push({ url: typeof w.url === "function" ? w.url() : null });
      } catch (_) {}
    }
  }

  // Ask the page itself for service worker registrations
  const registrations = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return [];
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.map((r) => ({
        scope: r.scope,
        active: r.active ? { scriptURL: r.active.scriptURL, state: r.active.state } : null,
        installing: r.installing ? { scriptURL: r.installing.scriptURL, state: r.installing.state } : null,
        waiting: r.waiting ? { scriptURL: r.waiting.scriptURL, state: r.waiting.state } : null,
        updateViaCache: r.updateViaCache
      }));
    } catch (e) {
      return [{ error: e.message }];
    }
  });

  return { workers, registrations, url };
}

/**
 * Return performance.getEntries() for every loaded resource. Includes
 * TCP / request / response / decoded timings for each URL.
 */
async function getResourceTiming(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const entries = await page.evaluate(() => {
    const items = performance.getEntriesByType ? performance.getEntriesByType("resource") : [];
    return items.map((r) => ({
      name: r.name,
      initiatorType: r.initiatorType,
      duration: Math.round(r.duration),
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
      startTime: Math.round(r.startTime),
      responseEnd: Math.round(r.responseEnd),
      dns: Math.round(r.domainLookupEnd - r.domainLookupStart),
      tcp: Math.round(r.connectEnd - r.connectStart),
      ssl: r.secureConnectionStart ? Math.round(r.connectEnd - r.secureConnectionStart) : 0,
      ttfb: Math.round(r.responseStart - r.requestStart)
    }));
  });
  entries.sort((a, b) => b.duration - a.duration);
  return { url, count: entries.length, slowest: entries.slice(0, 50), all: entries };
}

/**
 * Feature-detect which Web APIs are available on the page.
 */
async function getBrowserApis(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const apis = await page.evaluate(() => {
    const has = (path) => {
      try {
        const parts = path.split(".");
        let cur = window;
        for (const p of parts) { if (!cur || !(p in cur)) return false; cur = cur[p]; }
        return true;
      } catch (_) { return false; }
    };
    const list = [
      "navigator.serviceWorker", "navigator.clipboard", "navigator.share",
      "navigator.geolocation", "navigator.mediaDevices", "navigator.bluetooth",
      "navigator.usb", "navigator.hid", "navigator.serial", "navigator.wakeLock",
      "navigator.storage", "navigator.permissions", "navigator.credentials",
      "navigator.xr", "navigator.gpu",
      "window.WebGLRenderingContext", "window.WebGL2RenderingContext",
      "window.AudioContext", "window.SpeechSynthesis", "window.SpeechRecognition",
      "window.webkitSpeechRecognition", "window.IntersectionObserver",
      "window.ResizeObserver", "window.MutationObserver", "window.PerformanceObserver",
      "window.Worker", "window.SharedWorker", "window.BroadcastChannel",
      "window.indexedDB", "window.caches", "window.crypto", "window.crypto.subtle",
      "window.FileSystemHandle", "window.showOpenFilePicker",
      "window.customElements", "window.Notification",
      "window.BarcodeDetector", "window.EyeDropper"
    ];
    const out = {};
    for (const p of list) out[p] = has(p);
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      online: navigator.onLine,
      maxTouchPoints: navigator.maxTouchPoints,
      features: out
    };
  });
  return { ...apis, url };
}

/**
 * Dump IndexedDB databases and their object stores (keys only).
 */
async function inspectIndexedDB(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const result = await page.evaluate(async () => {
    if (!window.indexedDB || !indexedDB.databases) {
      return { error: "IndexedDB not supported or databases() missing" };
    }
    try {
      const dbs = await indexedDB.databases();
      const out = [];
      for (const info of dbs) {
        const dbInfo = { name: info.name, version: info.version, stores: [] };
        try {
          await new Promise((resolve, reject) => {
            const req = indexedDB.open(info.name);
            req.onsuccess = () => {
              const db = req.result;
              dbInfo.stores = Array.from(db.objectStoreNames || []);
              db.close();
              resolve();
            };
            req.onerror = () => reject(req.error);
          });
        } catch (e) { dbInfo.error = e.message; }
        out.push(dbInfo);
      }
      return { databases: out };
    } catch (e) { return { error: e.message }; }
  });
  return { ...result, url };
}

/**
 * Dump framework state: Next.js __NEXT_DATA__, Nuxt __NUXT__, Sveltekit, etc.
 */
async function getFrameworkData(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const frameworks = await page.evaluate(() => {
    const out = {};
    try {
      const nextScript = document.getElementById("__NEXT_DATA__");
      if (nextScript) out.next = JSON.parse(nextScript.textContent);
    } catch (_) {}
    if (window.__NUXT__) out.nuxt = window.__NUXT__;
    if (window.__NUXT_DATA__) out.nuxtData = window.__NUXT_DATA__;
    if (window.__SVELTEKIT_DATA__) out.sveltekit = window.__SVELTEKIT_DATA__;
    if (window.__remixContext) out.remix = window.__remixContext;
    if (window.__INITIAL_STATE__) out.initialState = window.__INITIAL_STATE__;
    if (window.__REDUX_DEVTOOLS_EXTENSION__) out.hasReduxDevtools = true;
    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) out.hasVueDevtools = true;
    return out;
  });
  return { ...frameworks, url };
}

/**
 * Extract every `[data-*]` attribute on the live page — useful for finding
 * hidden IDs, config blocks, and analytics targets.
 */
async function getDataAttrs(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const attrs = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll("*");
    for (const el of els) {
      if (!el.attributes) continue;
      const data = {};
      let has = false;
      for (const a of el.attributes) {
        if (a.name.startsWith("data-")) { data[a.name] = a.value; has = true; }
      }
      if (has) {
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          data
        });
        if (out.length >= 500) break;
      }
    }
    return out;
  });
  return { url, count: attrs.length, items: attrs };
}

/**
 * Collect every meta tag, Open Graph / Twitter card, canonical URL, and
 * JSON-LD structured-data block on the page.
 */
async function getMeta(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const info = await page.evaluate(() => {
    const meta = {};
    const og = {};
    const twitter = {};
    for (const m of document.querySelectorAll("meta")) {
      const name = m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("itemprop");
      if (!name) continue;
      const value = m.getAttribute("content") || "";
      if (name.startsWith("og:")) og[name] = value;
      else if (name.startsWith("twitter:")) twitter[name] = value;
      else meta[name] = value;
    }
    const canonical = document.querySelector("link[rel=canonical]");
    const title = document.title;
    const jsonLd = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { jsonLd.push(JSON.parse(s.textContent)); }
      catch (_) { jsonLd.push({ __parseError: true, raw: (s.textContent || "").slice(0, 500) }); }
    }
    const favicons = Array.from(document.querySelectorAll("link[rel*=icon]")).map((l) => ({
      rel: l.getAttribute("rel"),
      href: l.href,
      sizes: l.getAttribute("sizes"),
      type: l.getAttribute("type")
    }));
    const hreflangs = Array.from(document.querySelectorAll("link[rel=alternate][hreflang]")).map((l) => ({
      hreflang: l.getAttribute("hreflang"),
      href: l.href
    }));
    return { title, canonical: canonical ? canonical.href : null, meta, og, twitter, jsonLd, favicons, hreflangs };
  });
  return { ...info, url };
}

/**
 * Fetch + parse robots.txt for the preview origin using robots-parser.
 */
async function getRobots(opts) {
  if (!hasPlaywright()) return { error: "No browser available." };
  const browser = await getBrowser();
  const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const target = opts.url || url;
  const enrich = require("./mcp-enrichments");
  return enrich.parseRobots(target, opts.userAgent);
}

// ── OCR upgrade: Tesseract or Groq vision ─────────────────────────────────

/**
 * Same interface as runOCR but accepts engine: "tesseract" | "groq".
 * Groq path uses a vision model to transcribe the image — faster and
 * often more accurate for handwriting or stylised fonts.
 */
async function runOCRDispatch(opts) {
  const engine = (opts && opts.engine) || "tesseract";
  if (engine === "groq") {
    const groq = require("./mcp-groq");
    if (!groq.isClaudeGroqAuthorized()) {
      return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };
    }
    if (!hasPlaywright()) return { error: "No browser available." };
    const browser = await getBrowser();
    const { page, url } = await getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.vw, opts.vh);

    let buf;
    if (opts.selector) {
      const el = await page.$(opts.selector);
      if (!el) return { error: "selector not found: " + opts.selector, url };
      buf = await el.screenshot({ type: "png" });
    } else if (opts.x != null && opts.y != null && opts.width != null && opts.height != null) {
      buf = await page.screenshot({
        type: "png",
        clip: { x: Number(opts.x), y: Number(opts.y), width: Number(opts.width), height: Number(opts.height) }
      });
    } else {
      buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
    }

    return await groq.runGroqOCR({
      pngBase64: buf.toString("base64"),
      model: opts.model,
      lang: opts.lang,
      url
    });
  }
  return runOCR(opts);
}

// ── Extended exports ──────────────────────────────────────────────────────

module.exports = {
  takeScreenshot,
  inspectDOM,
  captureConsole,
  interact,
  runTest,
  listPreviews,
  closeBrowser,
  closeSession,
  closeAllSessions,
  hasPlaywright,
  browseUrl,
  // Round 1 primitives
  getPixelColor,
  getElementRect,
  measure,
  screenshotDiff,
  emulate,
  storage,
  performanceMetrics,
  capturePreviewRequests,
  captureDownload,
  deployAndVerify,
  clipboard,
  canvasData,
  listPages,
  closePage,
  // Round 2 library-backed
  runAccessibility,
  runOCR,
  runOCRDispatch,
  runLighthouseAudit,
  getComputedStyles,
  // Round 2 Groq-backed
  visualQuery,
  findElementVisually,
  visualDiffWithAction,
  runVerifyLoop,
  // Round 3 image / visual
  getPalette,
  getColorStats,
  visualSimilarity,
  toleranceDiffTool,
  renderOverlayTool,
  imageInfo,
  // Round 3 DOM
  domQueryTool,
  findAll,
  // Round 3 perf / runtime
  getWebVitals,
  getCodeCoverage,
  captureHar,
  listServiceWorkers,
  getResourceTiming,
  getBrowserApis,
  inspectIndexedDB,
  getFrameworkData,
  getDataAttrs,
  // Round 3 SEO / meta
  getMeta,
  getRobots
};
