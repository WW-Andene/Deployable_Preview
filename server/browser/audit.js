// browser/audit.js – performance, accessibility, OCR, Lighthouse, computed styles, web vitals, coverage
const fs = require("fs");
const path = require("path");
const session = require("../dv/session");
const enrich = require("../mcp-enrichments");

// F-NEW-B003: read web-vitals source once at module load, not on every
// audit call. Avoids a sync disk read on the hot path.
let _webVitalsSrc = null;
try {
  const wvPath = require.resolve("web-vitals/dist/web-vitals.iife.js");
  _webVitalsSrc = fs.readFileSync(wvPath, "utf8");
} catch (_) { /* web-vitals not installed — getWebVitals will report */ }

// ── Performance metrics ────────────────────────────────────────────────────

/**
 * Collect performance metrics for a preview: navigation timing, resource count,
 * and paint timings. Optionally reloads to get a clean measurement.
 */
async function performanceMetrics(opts) {
  const { owner, repo, slug } = opts;
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  if (opts.reload) {
    try {
      const _t = session.navTimeout(opts);
      const _r = { waitUntil: session.waitUntilIdle() };
      if (_t != null) _r.timeout = _t;
      await page.reload(_r);
    } catch (_) {}
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

// ── axe-core accessibility audit ───────────────────────────────────────────

/**
 * Run a full axe-core accessibility audit against a preview session.
 * Returns structured violations grouped by rule with node targets + HTML.
 *
 * @param {object} opts - { owner, repo, slug, tags? }
 */
async function runAccessibility(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

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
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!enrich.have("tesseract.js")) {
    return { error: "tesseract.js not installed. Run: npm install tesseract.js" };
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.vw, opts.vh);

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
  if (!enrich.have("lighthouse")) {
    return { error: "lighthouse not installed. Run: npm install lighthouse chrome-launcher" };
  }

  let auditUrl;
  try {
    auditUrl = session.resolvePreviewUrl(opts.owner, opts.repo, opts.slug);
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
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

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

// ── Web Vitals ───────────────────────────────────────────────────────────

/**
 * Inject web-vitals via evaluate and collect CLS, LCP, INP, FCP, TTFB.
 * Waits a short "settle" duration so values converge.
 */
async function getWebVitals(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  // Prefer bundled web-vitals if installed, otherwise load from CDN
  // (cached at module load — see _webVitalsSrc above).
  const source = _webVitalsSrc;

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

// ── Code Coverage ────────────────────────────────────────────────────────

/**
 * Collect JS + CSS coverage using Playwright's coverage API.
 * Returns per-URL usage percentages.
 */
async function getCodeCoverage(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  if (!page.coverage) return { error: "coverage API not available on this browser driver", url };

  const waitMs = Math.max(500, Math.min(parseInt(opts.waitMs, 10) || 3000, 30000));

  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    if (typeof page.coverage.startCSSCoverage === "function") {
      await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    }

    if (opts.reload) {
      try {
      const _t = session.navTimeout(opts);
      const _r = { waitUntil: session.waitUntilIdle() };
      if (_t != null) _r.timeout = _t;
      await page.reload(_r);
    } catch (_) {}
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

// ── OCR upgrade: Tesseract or Groq vision ─────────────────────────────────

/**
 * Same interface as runOCR but accepts engine: "tesseract" | "groq".
 * Groq path uses a vision model to transcribe the image — faster and
 * often more accurate for handwriting or stylised fonts.
 */
async function runOCRDispatch(opts) {
  const engine = (opts && opts.engine) || "tesseract";
  if (engine === "groq") {
    const groq = require("../mcp-groq");
    if (!groq.isClaudeGroqAuthorized()) {
      return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };
    }
    if (!session.hasPlaywright()) return { error: "No browser available." };
    const browser = await session.getBrowser();
    const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.vw, opts.vh);

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

module.exports = { performanceMetrics, runAccessibility, runOCR, runOCRDispatch, runLighthouseAudit, getComputedStyles, getWebVitals, getCodeCoverage };
