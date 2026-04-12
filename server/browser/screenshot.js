// browser/screenshot.js – screenshot, DOM inspection, and console capture helpers
const http = require("http");
const session = require("../dv/session");

/**
 * Take a screenshot of a deployed preview.
 * @param {object} opts - { owner, repo, slug, width, height, fullPage, selector }
 * @returns {{ base64: string, mimeType: string, width: number, height: number, title: string, url: string }}
 */
async function takeScreenshot(opts) {
  const { owner, repo, slug, width, height, fullPage, selector } = opts;

  if (!session.hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, width, height);

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
  const viewport = session.getViewport(page);

  return {
    base64,
    mimeType: "image/png",
    width: viewport.width,
    height: viewport.height,
    title,
    url
  };
}

/**
 * Get the accessibility tree / DOM structure of a deployed preview.
 * @param {object} opts - { owner, repo, slug, selector }
 * @returns {{ tree: object, url: string }}
 */
async function inspectDOM(opts) {
  const { owner, repo, slug, selector } = opts;

  if (!session.hasPlaywright()) {
    const url = session.resolvePreviewUrl(owner, repo, slug);
    return await fetchDOMFallback(url, selector);
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug);

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

/**
 * Navigate to a preview and capture console output for a duration.
 * @param {object} opts - { owner, repo, slug, duration, actions }
 * @returns {{ logs: Array, errors: Array, url: string }}
 */
async function captureConsole(opts) {
  const { owner, repo, slug, duration } = opts;
  const url = session.resolvePreviewUrl(owner, repo, slug);

  if (!session.hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment.", url };
  }

  const browser = await session.getBrowser();
  const page = await session.newPage(browser);
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

    await page.goto(url, { waitUntil: session.waitUntilIdle(), timeout: 30000 });

    // Wait for specified duration to collect console output
    const waitMs = Math.min((duration || 3) * 1000, 30000);
    await new Promise((r) => setTimeout(r, waitMs));

    return { logs, errors, url, duration: waitMs / 1000 };
  } finally {
    await page.close();
  }
}

module.exports = { takeScreenshot, inspectDOM, fetchDOMFallback, captureConsole };
