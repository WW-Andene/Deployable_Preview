const session = require("../dv/session");

// ── Playwright-native probes (round 4) ────────────────────────────────────

/** Get the latest screenshot of a preview as a buffer — used by tools that
 *  need the raw image (palette, SSIM, render_overlay, image_meta). */
async function _pagePng(opts, fullPage) {
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const buf = await page.screenshot({ type: "png", fullPage: !!fullPage });
  return { page, url, buf };
}

/**
 * Extract the dominant palette from the current page (or a selector).
 */
async function getPalette(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  let buf;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (!el) return { error: "selector not found: " + opts.selector, url };
    buf = await el.screenshot({ type: "png" });
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const enrich = require("../mcp-enrichments");
  const result = await enrich.extractPalette(buf, opts.count || 6);
  return { ...result, url };
}

/**
 * Full color statistics (vibrancy, luminance) for the page or a selector.
 */
async function getColorStats(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  let buf;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (!el) return { error: "selector not found: " + opts.selector, url };
    buf = await el.screenshot({ type: "png" });
  } else {
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const enrich = require("../mcp-enrichments");
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
  const enrich = require("../mcp-enrichments");
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
  const enrich = require("../mcp-enrichments");
  const a = Buffer.from(opts.before, "base64");
  const b = Buffer.from(opts.after, "base64");
  return enrich.toleranceDiff(a, b, opts);
}

/**
 * Render shapes on top of a preview screenshot (rectangles, lines, labels).
 */
async function renderOverlayTool(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  const enrich = require("../mcp-enrichments");
  const result = await enrich.renderOverlay(buf, opts.shapes || []);
  if (result && result.error) return { error: result.error, url };
  return { base64: result.toString("base64"), mimeType: "image/png", url };
}

/**
 * Return image dimensions + EXIF metadata for a screenshot or arbitrary PNG.
 */
async function imageInfo(opts) {
  const enrich = require("../mcp-enrichments");
  let buf;
  if (opts && opts.base64) {
    buf = Buffer.from(opts.base64, "base64");
  } else {
    if (!session.hasPlaywright()) return { error: "No browser available and no base64 provided" };
    const browser = await session.getBrowser();
    const { page } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
    buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }
  const dims = enrich.imageDimensions(buf);
  const meta = await enrich.imageMetadata(buf);
  return { dimensions: dims, metadata: meta };
}

module.exports = { getPalette, getColorStats, visualSimilarity, toleranceDiffTool, renderOverlayTool, imageInfo };
