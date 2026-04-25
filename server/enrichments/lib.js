/**
 * enrichments/lib.js — lazy module loader + library status report.
 *
 * The foundation every other enrichments/*.js module imports from. All
 * heavy npm dependencies (sharp, lighthouse, tesseract, axe, etc.) are
 * loaded on first use via tryRequire so DeployView can ship the core
 * features even when a host can't compile native modules.
 *
 * Extracted from mcp-enrichments.js (R6.8).
 */

"use strict";

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

// Library list reported by /api/health and dv_status. Kept in sync with
// the actual tryRequire calls scattered across the enrichment modules.
const LIBRARY_NAMES = [
  "pixelmatch", "pngjs", "sharp", "axe-core", "tesseract.js", "lighthouse",
  "css-tree", "colorthief", "get-image-colors", "ssim.js", "looks-same",
  "canvas", "image-size", "exifreader", "cheerio", "specificity",
  "html-validator", "diff", "natural", "linkinator", "error-stack-parser",
  "source-map", "v8-to-istanbul", "retire", "csp-parse",
  "set-cookie-parser", "tough-cookie", "robots-parser", "gzip-size"
];

function status() {
  const out = {};
  for (const name of LIBRARY_NAMES) out[name] = have(name);
  return out;
}

module.exports = { tryRequire, have, missing, status, LIBRARY_NAMES };
