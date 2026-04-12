const session = require("../dv/session");
const pngLite = require("../png-lite");

// ── Pixel color / element rect / measurement ────────────────────────────────

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

  if (!session.hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, width, height);

  const vp = session.getViewport(page) || { width: 1280, height: 720 };
  if (x < 0 || y < 0 || x >= vp.width || y >= vp.height) {
    return { error: "point out of viewport", point: { x, y }, viewport: vp };
  }

  const enrich = require("../mcp-enrichments");

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

  if (!session.hasPlaywright()) {
    return { error: "No browser available." };
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, width, height);

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

  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, width, height);

  const [ax, ay] = await session.resolvePoint(page, a);
  const [bx, by] = await session.resolvePoint(page, b);
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

  const enrich = require("../mcp-enrichments");
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

module.exports = { getPixelColor, getElementRect, measure, screenshotDiff };
