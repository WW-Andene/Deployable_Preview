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

// Playwright uses "networkidle", Puppeteer uses "networkidle0"
function waitUntilIdle() {
  return _lib && _lib.type === "puppeteer" ? "networkidle0" : "networkidle";
}

function hasPlaywright() {
  // Returns true if any browser method is available (local or remote)
  return !!loadLib() || !!getRemoteWSEndpoint();
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
        browserInstance = await pptr.connect({ browserWSEndpoint: remoteWS });
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
        browserInstance = await pw.chromium.connectOverCDP(remoteWS);
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

  const opts = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
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
  if (browserInstance) {
    // Remote connections use disconnect(), local use close()
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
  const url = resolvePreviewUrl(owner, repo, slug);

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment.", url };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await setViewport(page, width || 1280, height || 720);
    await page.goto(url, { waitUntil: waitUntilIdle(), timeout: 30000 });

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
  } finally {
    await page.close();
  }
}

// ── DOM Inspection (accessibility tree) ──────────────────────────────────────

/**
 * Get the accessibility tree / DOM structure of a deployed preview.
 * @param {object} opts - { owner, repo, slug, selector }
 * @returns {{ tree: object, url: string }}
 */
async function inspectDOM(opts) {
  const { owner, repo, slug, selector } = opts;
  const url = resolvePreviewUrl(owner, repo, slug);

  if (!hasPlaywright()) {
    // Fallback: fetch HTML and return raw structure
    return await fetchDOMFallback(url, selector);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: waitUntilIdle(), timeout: 30000 });

    let snapshot = null;
    try {
      if (page.accessibility && typeof page.accessibility.snapshot === "function") {
        snapshot = await page.accessibility.snapshot();
      }
    } catch (_) {}

    // Also get computed styles for the target selector if provided
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

    // Get page metadata
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
  } finally {
    await page.close();
  }
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
  const page = await browser.newPage();
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
 * @param {object} opts - { owner, repo, slug, action, selector, value, x, y }
 * action: "click" | "type" | "select" | "scroll" | "hover" | "navigate"
 * @returns {{ success: boolean, screenshot?: string }}
 */
async function interact(opts) {
  const { owner, repo, slug, action, selector, value, x, y } = opts;
  const url = resolvePreviewUrl(owner, repo, slug);

  if (!hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment.", url };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await setViewport(page, 1280, 720);
    await page.goto(url, { waitUntil: waitUntilIdle(), timeout: 30000 });

    let result = { success: true, action, url };

    switch (action) {
      case "click":
        if (selector) {
          await page.click(selector);
        } else if (x !== undefined && y !== undefined) {
          await page.mouse.click(x, y);
        }
        result.clicked = selector || (x + "," + y);
        break;

      case "type":
        if (!selector) throw new Error("selector required for type action");
        await page.click(selector);
        if (typeof page.fill === "function") {
          await page.fill(selector, value || "");
        } else {
          // Puppeteer: clear then type
          await page.evaluate(function(sel) { document.querySelector(sel).value = ""; }, selector);
          await page.type(selector, value || "");
        }
        result.typed = value;
        result.into = selector;
        break;

      case "select":
        if (!selector) throw new Error("selector required for select action");
        if (typeof page.selectOption === "function") {
          await page.selectOption(selector, value || "");
        } else {
          await page.select(selector, value || "");
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
          await page.hover(selector);
        } else if (x !== undefined && y !== undefined) {
          await page.mouse.move(x, y);
        }
        result.hoveredOn = selector || (x + "," + y);
        break;

      case "navigate":
        if (value) {
          // Only allow navigation within the local preview (prevent SSRF)
          var navUrl;
          if (value.startsWith("/") && !value.startsWith("//")) {
            navUrl = url.replace(/\/preview\/.*$/, "") + value;
          } else {
            navUrl = url + value;
          }
          // Validate: only allow navigation to our own previews (local or tunnel)
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

      default:
        throw new Error("Unknown action: " + action + ". Supported: click, type, select, scroll, hover, navigate");
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
  } finally {
    await page.close();
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

module.exports = {
  takeScreenshot,
  inspectDOM,
  captureConsole,
  interact,
  listPreviews,
  closeBrowser,
  hasPlaywright
};
