/**
 * mcp-enrichments/index.js — shared helpers for optional npm libraries.
 *
 * All libraries are lazy-loaded on first use via `tryRequire`. If a library
 * isn't installed, the caller gets a structured "install X" error instead
 * of a crash. This lets DeployView ship the core features even when heavy
 * native modules (sharp, lighthouse, tesseract) can't be built on a host.
 *
 * Libraries wrapped:
 *   pixelmatch   — pixel-level diff with heatmap
 *   pngjs        — PNG encode/decode for pixelmatch I/O
 *   sharp        — fast RGBA extraction, crop, resize
 *   axe-core     — WCAG accessibility audit (injected into page)
 *   tesseract.js — OCR over screenshots
 *   lighthouse   — full Lighthouse audit (perf/SEO/a11y/best-practices)
 *   css-tree     — structural CSS value parsing for computed_styles
 */

const cache = new Map();
const NOT_FOUND = Symbol("not-found");

function tryRequire(name) {
  if (cache.has(name)) {
    const v = cache.get(name);
    return v === NOT_FOUND ? null : v;
  }
  try {
    const mod = require(name);
    cache.set(name, mod);
    return mod;
  } catch (e) {
    cache.set(name, NOT_FOUND);
    return null;
  }
}

function have(name) { return !!tryRequire(name); }

function missing(name, toolName) {
  return {
    error:
      "Library '" + name + "' is not installed. " +
      (toolName ? "Install it to enable " + toolName + ": " : "Install it: ") +
      "npm install " + name
  };
}

// ── Library status report ──────────────────────────────────────────────────

function status() {
  return {
    pixelmatch:         have("pixelmatch"),
    pngjs:              have("pngjs"),
    sharp:              have("sharp"),
    "axe-core":         have("axe-core"),
    "tesseract.js":     have("tesseract.js"),
    lighthouse:         have("lighthouse"),
    "css-tree":         have("css-tree"),
    colorthief:         have("colorthief"),
    "get-image-colors": have("get-image-colors"),
    "ssim.js":          have("ssim.js"),
    "looks-same":       have("looks-same"),
    canvas:             have("canvas"),
    "image-size":       have("image-size"),
    exifreader:         have("exifreader"),
    cheerio:            have("cheerio"),
    specificity:        have("specificity"),
    "html-validator":   have("html-validator"),
    diff:               have("diff"),
    natural:            have("natural"),
    linkinator:         have("linkinator"),
    "error-stack-parser": have("error-stack-parser"),
    "source-map":       have("source-map"),
    "v8-to-istanbul":   have("v8-to-istanbul"),
    retire:             have("retire"),
    "csp-parse":        have("csp-parse"),
    "set-cookie-parser": have("set-cookie-parser"),
    "tough-cookie":     have("tough-cookie"),
    "robots-parser":    have("robots-parser"),
    "gzip-size":        have("gzip-size")
  };
}

module.exports = {
  tryRequire,
  have,
  missing,
  status
};
