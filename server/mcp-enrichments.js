/**
 * mcp-enrichments.js — optional npm libraries that enrich MCP tools.
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

// ── pixelmatch + pngjs ──────────────────────────────────────────────────────

/**
 * Pixel-compare two PNG buffers using pixelmatch. Returns a diff buffer
 * (base64 PNG heatmap) plus match/mismatch counts.
 *
 * @param {Buffer|string} a      — before PNG (Buffer or base64)
 * @param {Buffer|string} b      — after PNG
 * @param {object} [opts]        — pixelmatch options: threshold (0..1), includeAA, alpha
 * @returns {object} { width, height, diffCount, percent, box, heatmapBase64 }
 */
function pixelDiff(a, b, opts) {
  const pixelmatch = tryRequire("pixelmatch");
  const pngjs = tryRequire("pngjs");
  if (!pixelmatch || !pngjs) {
    return missing(pixelmatch ? "pngjs" : "pixelmatch", "screenshot_diff");
  }
  // pixelmatch v6 is ESM; v5 is CJS. Handle both.
  const pm = typeof pixelmatch === "function" ? pixelmatch : pixelmatch.default;

  const aBuf = Buffer.isBuffer(a) ? a : Buffer.from(a, "base64");
  const bBuf = Buffer.isBuffer(b) ? b : Buffer.from(b, "base64");

  let imgA, imgB;
  try {
    imgA = pngjs.PNG.sync.read(aBuf);
    imgB = pngjs.PNG.sync.read(bBuf);
  } catch (e) {
    return { error: "PNG decode failed: " + e.message };
  }

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      error: "size-mismatch",
      a: { width: imgA.width, height: imgA.height },
      b: { width: imgB.width, height: imgB.height }
    };
  }

  const { width, height } = imgA;
  const diffPng = new pngjs.PNG({ width, height });
  const threshold = opts && opts.threshold != null ? Number(opts.threshold) : 0.1;
  const includeAA = !!(opts && opts.includeAA);

  const diffCount = pm(
    imgA.data, imgB.data, diffPng.data,
    width, height,
    { threshold, includeAA, alpha: 0.3, diffColor: [255, 0, 0] }
  );

  // Walk the diff buffer to find the bounding box of changed pixels
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // pixelmatch writes a red-ish pixel for diffs
      if (diffPng.data[i] > 0 && diffPng.data[i + 1] === 0 && diffPng.data[i + 2] === 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const box = diffCount > 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;

  const heatmapPng = pngjs.PNG.sync.write(diffPng);
  return {
    width, height,
    totalPixels: width * height,
    diffCount,
    percent: Number((diffCount / (width * height) * 100).toFixed(4)),
    threshold,
    box,
    identical: diffCount === 0,
    heatmapBase64: heatmapPng.toString("base64"),
    heatmapMimeType: "image/png"
  };
}

// ── sharp ───────────────────────────────────────────────────────────────────

/**
 * Read a single pixel from a PNG buffer via sharp. Returns RGBA + hex.
 */
async function sharpPixel(pngBuf, x, y) {
  const sharp = tryRequire("sharp");
  if (!sharp) return missing("sharp", "pixel_color");

  try {
    // Crop a 1x1 region and extract raw bytes
    const { data, info } = await sharp(pngBuf)
      .extract({ left: Math.floor(x), top: Math.floor(y), width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels; // 3 or 4
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = channels === 4 ? data[3] : 255;
    const hex = "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0");
    return {
      r, g, b, a, hex,
      rgba: "rgba(" + r + "," + g + "," + b + "," + (a / 255).toFixed(3) + ")",
      engine: "sharp"
    };
  } catch (e) {
    return { error: "sharp pixel extract failed: " + e.message };
  }
}

/**
 * Crop a region from a PNG buffer and return the cropped PNG as base64.
 */
async function sharpCrop(pngBuf, x, y, w, h) {
  const sharp = tryRequire("sharp");
  if (!sharp) return missing("sharp", "sharp_crop");
  try {
    const out = await sharp(pngBuf)
      .extract({ left: Math.floor(x), top: Math.floor(y), width: Math.floor(w), height: Math.floor(h) })
      .png()
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/png" };
  } catch (e) {
    return { error: "sharp crop failed: " + e.message };
  }
}

/**
 * Get image metadata (width, height, channels, format, size).
 */
async function sharpMetadata(pngBuf) {
  const sharp = tryRequire("sharp");
  if (!sharp) return missing("sharp");
  try {
    const meta = await sharp(pngBuf).metadata();
    return {
      width: meta.width,
      height: meta.height,
      channels: meta.channels,
      format: meta.format,
      size: meta.size,
      hasAlpha: meta.hasAlpha,
      density: meta.density
    };
  } catch (e) {
    return { error: "sharp metadata failed: " + e.message };
  }
}

// ── axe-core ───────────────────────────────────────────────────────────────

/**
 * Run axe-core inside a Playwright/Puppeteer page. Injects the axe-core
 * source from the npm package, then calls axe.run() and returns violations.
 */
async function runAxe(page, opts) {
  const axeCore = tryRequire("axe-core");
  if (!axeCore) return missing("axe-core", "accessibility");

  // axe-core exports { source } — the full script string to inject.
  const source = axeCore.source;
  if (!source) return { error: "axe-core package does not expose .source" };

  try {
    // Inject via addScriptTag (Playwright) or evaluate (both)
    if (typeof page.addScriptTag === "function") {
      await page.addScriptTag({ content: source });
    } else {
      await page.evaluate(source);
    }

    const runOptions = {};
    if (opts && Array.isArray(opts.tags)) runOptions.runOnly = { type: "tag", values: opts.tags };
    if (opts && opts.rules) runOptions.rules = opts.rules;

    const results = await page.evaluate(async (runOpts) => {
      if (!window.axe) return { error: "axe not loaded" };
      return await window.axe.run(document, runOpts);
    }, runOptions);

    if (results && results.error) return results;

    // Compact the violations so the response stays readable
    const compact = (list) => (list || []).map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: (v.nodes || []).slice(0, 10).map((n) => ({
        target: n.target,
        html: n.html ? n.html.slice(0, 500) : "",
        failureSummary: n.failureSummary
      })),
      totalNodes: (v.nodes || []).length
    }));

    return {
      url: results.url,
      testEngine: results.testEngine,
      timestamp: results.timestamp,
      violationCount: (results.violations || []).length,
      passCount: (results.passes || []).length,
      incompleteCount: (results.incomplete || []).length,
      inapplicableCount: (results.inapplicable || []).length,
      violations: compact(results.violations),
      incomplete: compact(results.incomplete)
    };
  } catch (e) {
    return { error: "axe-core run failed: " + e.message };
  }
}

// ── tesseract.js ───────────────────────────────────────────────────────────

let _tesseractWorker = null;
async function getTesseractWorker(lang) {
  const tesseract = tryRequire("tesseract.js");
  if (!tesseract) return null;
  const targetLang = lang || "eng";
  if (_tesseractWorker && _tesseractWorker._lang === targetLang) return _tesseractWorker;
  if (_tesseractWorker) {
    try { await _tesseractWorker.terminate(); } catch (_) {}
    _tesseractWorker = null;
  }
  const createWorker = tesseract.createWorker || (tesseract.default && tesseract.default.createWorker);
  if (!createWorker) return null;
  const worker = await createWorker(targetLang);
  worker._lang = targetLang;
  _tesseractWorker = worker;
  return worker;
}

/**
 * Run OCR on a PNG buffer and return recognized text.
 */
async function runOCR(pngBuf, opts) {
  if (!tryRequire("tesseract.js")) return missing("tesseract.js", "ocr");
  try {
    const worker = await getTesseractWorker(opts && opts.lang);
    if (!worker) return { error: "tesseract.js could not start a worker" };
    const result = await worker.recognize(pngBuf);
    const data = result.data || {};
    const words = (data.words || []).map((w) => ({
      text: w.text,
      confidence: Math.round(w.confidence || 0),
      bbox: w.bbox
    }));
    return {
      text: data.text || "",
      confidence: Math.round(data.confidence || 0),
      wordCount: words.length,
      words: words.slice(0, 500),
      wordsTruncated: words.length > 500,
      engine: "tesseract.js",
      lang: (opts && opts.lang) || "eng"
    };
  } catch (e) {
    return { error: "tesseract OCR failed: " + e.message };
  }
}

async function shutdownTesseract() {
  if (_tesseractWorker) {
    try { await _tesseractWorker.terminate(); } catch (_) {}
    _tesseractWorker = null;
  }
}

// ── lighthouse ─────────────────────────────────────────────────────────────

/**
 * Run a full Lighthouse audit against a preview URL. Lighthouse launches
 * its own Chrome via chrome-launcher; we pass the existing session port
 * if available to reuse our already-running Chromium.
 */
async function runLighthouse(url, opts) {
  const lighthouse = tryRequire("lighthouse");
  if (!lighthouse) return missing("lighthouse", "lighthouse");

  const chromeLauncher = tryRequire("chrome-launcher");
  // Lighthouse v12 is ESM — require() may return a module namespace object
  const lh = typeof lighthouse === "function" ? lighthouse : lighthouse.default;
  if (!lh) return { error: "lighthouse import shape unexpected" };

  let chrome = null;
  let port = opts && opts.port;
  try {
    if (!port) {
      if (!chromeLauncher) return missing("chrome-launcher", "lighthouse");
      const launch = chromeLauncher.launch || (chromeLauncher.default && chromeLauncher.default.launch);
      chrome = await launch({
        chromeFlags: [
          "--headless",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-gl=swiftshader",
          "--enable-webgl"
        ]
      });
      port = chrome.port;
    }

    const categories = (opts && opts.categories) || ["performance", "accessibility", "best-practices", "seo"];
    const lhOptions = {
      logLevel: "error",
      output: "json",
      onlyCategories: categories,
      port
    };

    const runnerResult = await lh(url, lhOptions);
    const lhr = runnerResult.lhr;

    const scores = {};
    for (const key of Object.keys(lhr.categories || {})) {
      const cat = lhr.categories[key];
      scores[key] = {
        title: cat.title,
        score: cat.score != null ? Math.round(cat.score * 100) : null
      };
    }

    // Extract key performance metrics
    const metrics = {};
    const metricIds = [
      "first-contentful-paint",
      "largest-contentful-paint",
      "total-blocking-time",
      "cumulative-layout-shift",
      "speed-index",
      "interactive"
    ];
    for (const id of metricIds) {
      const audit = lhr.audits && lhr.audits[id];
      if (audit) {
        metrics[id] = {
          score: audit.score != null ? Math.round(audit.score * 100) : null,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue
        };
      }
    }

    // Collect notable failures
    const failures = [];
    for (const key of Object.keys(lhr.audits || {})) {
      const a = lhr.audits[key];
      if (a.score != null && a.score < 0.9 && a.title) {
        failures.push({
          id: key,
          title: a.title,
          score: Math.round((a.score || 0) * 100),
          displayValue: a.displayValue
        });
      }
    }
    failures.sort((a, b) => a.score - b.score);

    return {
      url,
      scores,
      metrics,
      failures: failures.slice(0, 30),
      fetchTime: lhr.fetchTime,
      userAgent: lhr.userAgent,
      lighthouseVersion: lhr.lighthouseVersion
    };
  } catch (e) {
    return { error: "lighthouse failed: " + e.message };
  } finally {
    if (chrome && typeof chrome.kill === "function") {
      try { await chrome.kill(); } catch (_) {}
    }
  }
}

// ── css-tree ───────────────────────────────────────────────────────────────

/**
 * Parse a CSS value string with css-tree and return structured AST data
 * so comparisons can be exact. Useful for diffing computed styles between
 * two elements or two states.
 */
function parseCssValue(value) {
  const cssTree = tryRequire("css-tree");
  if (!cssTree) return missing("css-tree", "computed_styles");
  try {
    const ast = cssTree.parse(value, { context: "value" });
    // Walk and collect an easier-to-diff list of tokens
    const tokens = [];
    cssTree.walk(ast, (node) => {
      if (node.type === "Dimension") {
        tokens.push({ type: "dimension", value: node.value, unit: node.unit });
      } else if (node.type === "Number") {
        tokens.push({ type: "number", value: node.value });
      } else if (node.type === "Percentage") {
        tokens.push({ type: "percent", value: node.value });
      } else if (node.type === "HexColor") {
        tokens.push({ type: "hex", value: "#" + node.value });
      } else if (node.type === "Identifier") {
        tokens.push({ type: "ident", value: node.name });
      } else if (node.type === "Function") {
        tokens.push({ type: "fn", name: node.name });
      } else if (node.type === "String") {
        tokens.push({ type: "string", value: node.value });
      }
    });
    return {
      normalized: cssTree.generate(ast),
      tokens
    };
  } catch (e) {
    return { error: "css-tree parse failed: " + e.message };
  }
}

/**
 * Diff two parsed CSS values structurally. Returns match/mismatch per token.
 */
function diffCssValues(a, b) {
  const pa = parseCssValue(a);
  const pb = parseCssValue(b);
  if (pa.error) return pa;
  if (pb.error) return pb;
  const same = pa.normalized === pb.normalized;
  return {
    same,
    a: pa,
    b: pb
  };
}

// ── Library status report ──────────────────────────────────────────────────

function status() {
  return {
    pixelmatch: have("pixelmatch"),
    pngjs: have("pngjs"),
    sharp: have("sharp"),
    "axe-core": have("axe-core"),
    "tesseract.js": have("tesseract.js"),
    lighthouse: have("lighthouse"),
    "css-tree": have("css-tree")
  };
}

module.exports = {
  tryRequire,
  have,
  status,
  pixelDiff,
  sharpPixel,
  sharpCrop,
  sharpMetadata,
  runAxe,
  runOCR,
  shutdownTesseract,
  runLighthouse,
  parseCssValue,
  diffCssValues
};
