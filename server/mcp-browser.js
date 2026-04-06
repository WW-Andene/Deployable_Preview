/**
 * mcp-browser.js — Lightweight browser automation for MCP tools
 *
 * Provides screenshot capture, DOM inspection, element interaction,
 * and console log collection by controlling a headless Chromium instance
 * via Puppeteer (when available) or falling back to a fetch + DOM snapshot
 * approach for environments without a browser.
 *
 * All methods operate against deployed preview URLs served by DeployView.
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const { buildStatus, branchSlug, buildKey } = require("./build");
const { runningServers } = require("./process");

// ── Puppeteer lazy loader ────────────────────────────────────────────────────
let puppeteer = null;
let browserInstance = null;

function hasPuppeteer() {
  if (puppeteer) return true;
  try { puppeteer = require("puppeteer"); return true; } catch (e) {
    try { puppeteer = require("puppeteer-core"); return true; } catch (e2) { return false; }
  }
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (!hasPuppeteer()) throw new Error("Puppeteer is not installed. Run: npm install puppeteer");
  browserInstance = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) { await browserInstance.close().catch(() => {}); browserInstance = null; }
}

// ── Resolve preview URL from owner/repo/slug ─────────────────────────────────
// Only allows navigating to local DeployView previews to prevent SSRF
function resolvePreviewUrl(owner, repo, slug, serverPort) {
  // Sanitize inputs to prevent path injection
  const safeOwner = (owner || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRepo  = (repo || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeSlug  = (slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeOwner || !safeRepo || !safeSlug) {
    throw new Error("Invalid owner, repo, or slug");
  }
  const port = serverPort || process.env.PORT || 3000;
  return "http://127.0.0.1:" + port + "/preview/" + safeOwner + "/" + safeRepo + "/" + safeSlug + "/";
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

  if (!hasPuppeteer()) {
    return { error: "Puppeteer not installed. Run: npm install puppeteer", url };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: width || 1280, height: height || 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    let screenshotOpts = { encoding: "base64", type: "png", fullPage: !!fullPage };
    if (selector) {
      const el = await page.$(selector);
      if (el) screenshotOpts.clip = await el.boundingBox();
    }

    const base64 = await page.screenshot(screenshotOpts);
    const title = await page.title();
    const viewport = page.viewport();

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

  if (!hasPuppeteer()) {
    // Fallback: fetch HTML and return raw structure
    return await fetchDOMFallback(url, selector);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    const snapshot = await page.accessibility.snapshot();

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

// Fallback DOM fetch (no Puppeteer)
async function fetchDOMFallback(url, selector) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        resolve({
          html: body.slice(0, 10000),
          note: "Puppeteer not available — returning raw HTML. Install puppeteer for full DOM inspection.",
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

  if (!hasPuppeteer()) {
    return { error: "Puppeteer not installed. Run: npm install puppeteer", url };
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
      errors.push({ type: "network", url: req.url(), failure: req.failure().errorText, timestamp: Date.now() });
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

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

  if (!hasPuppeteer()) {
    return { error: "Puppeteer not installed. Run: npm install puppeteer", url };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

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
        await page.type(selector, value || "");
        result.typed = value;
        result.into = selector;
        break;

      case "select":
        if (!selector) throw new Error("selector required for select action");
        await page.select(selector, value || "");
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
          var navUrl = value.startsWith("/") ? url.replace(/\/preview\/.*$/, "") + value : url + value;
          if (!navUrl.startsWith("http://127.0.0.1:")) {
            throw new Error("Navigation restricted to local previews only");
          }
          await page.goto(navUrl, { waitUntil: "networkidle2", timeout: 30000 });
        }
        result.navigatedTo = value;
        break;

      default:
        throw new Error("Unknown action: " + action + ". Supported: click, type, select, scroll, hover, navigate");
    }

    // Wait a moment for any animations/updates
    await new Promise((r) => setTimeout(r, 500));

    // Take a screenshot after the action
    result.screenshot = {
      base64: await page.screenshot({ encoding: "base64", type: "png" }),
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
  hasPuppeteer
};
