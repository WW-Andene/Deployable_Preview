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
      const launchOpts = {
        chromeFlags: [
          "--headless",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-gl=swiftshader",
          "--enable-webgl"
        ]
      };
      if (process.env.CHROME_PATH) launchOpts.chromePath = process.env.CHROME_PATH;
      chrome = await launch(launchOpts);
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

// ── Color palette (color-thief / get-image-colors) ────────────────────────

/**
 * Extract the dominant color and palette from a PNG buffer using colorthief.
 */
async function extractPalette(pngBuf, count) {
  const ColorThief = tryRequire("colorthief");
  if (!ColorThief) return missing("colorthief", "palette");
  try {
    const os = require("os");
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    // colorthief needs a file path or Jimp/Buffer; use a temp file for wide compat
    const tmp = path.join(os.tmpdir(), "dv-ct-" + crypto.randomBytes(6).toString("hex") + ".png");
    fs.writeFileSync(tmp, pngBuf);
    let dominant, palette;
    try {
      // colorthief API varies by version; try the common shapes
      const CT = ColorThief.default || ColorThief;
      if (typeof CT.getColor === "function") {
        dominant = await CT.getColor(tmp);
        palette  = await CT.getPalette(tmp, count || 6);
      } else {
        const inst = new CT();
        dominant = await inst.getColor(tmp);
        palette  = await inst.getPalette(tmp, count || 6);
      }
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
    const toHex = (rgb) =>
      "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");
    return {
      dominant: { rgb: dominant, hex: toHex(dominant) },
      palette: (palette || []).map((rgb) => ({ rgb, hex: toHex(rgb) })),
      engine: "colorthief"
    };
  } catch (e) {
    return { error: "colorthief failed: " + e.message };
  }
}

/**
 * Full color distribution / stats via get-image-colors (uses Vibrant).
 */
async function colorStats(pngBuf, count) {
  const getColors = tryRequire("get-image-colors");
  if (!getColors) return missing("get-image-colors", "color_stats");
  try {
    const fn = typeof getColors === "function" ? getColors : getColors.default;
    const colors = await fn(pngBuf, { count: count || 8, type: "image/png" });
    return {
      count: colors.length,
      colors: colors.map((c) => ({
        hex: c.hex ? c.hex() : null,
        rgb: c._rgb || (typeof c.rgb === "function" ? c.rgb() : null),
        hsl: typeof c.hsl === "function" ? c.hsl() : null,
        luminance: typeof c.luminance === "function" ? c.luminance() : null
      })),
      engine: "get-image-colors"
    };
  } catch (e) {
    return { error: "get-image-colors failed: " + e.message };
  }
}

// ── SSIM (structural similarity) ───────────────────────────────────────────

async function ssimDiff(beforeBuf, afterBuf) {
  const ssim = tryRequire("ssim.js");
  const pngjs = tryRequire("pngjs");
  if (!ssim || !pngjs) return missing(ssim ? "pngjs" : "ssim.js", "visual_similarity");
  try {
    const a = pngjs.PNG.sync.read(beforeBuf);
    const b = pngjs.PNG.sync.read(afterBuf);
    if (a.width !== b.width || a.height !== b.height) {
      return {
        error: "size-mismatch",
        a: { width: a.width, height: a.height },
        b: { width: b.width, height: b.height }
      };
    }
    const fn = ssim.default || ssim.ssim || ssim;
    const result = fn({ data: a.data, width: a.width, height: a.height }, { data: b.data, width: b.width, height: b.height });
    return {
      mssim: result.mssim,
      performance: result.performance,
      similarity: result.mssim,
      identical: result.mssim >= 0.999,
      engine: "ssim.js",
      interpretation:
        result.mssim >= 0.99 ? "visually identical"
        : result.mssim >= 0.95 ? "minor differences"
        : result.mssim >= 0.85 ? "noticeable differences"
        : "significantly different"
    };
  } catch (e) {
    return { error: "ssim.js failed: " + e.message };
  }
}

// ── Anti-alias / tolerance diff (looks-same) ──────────────────────────────

async function toleranceDiff(beforeBuf, afterBuf, opts) {
  const looksSame = tryRequire("looks-same");
  if (!looksSame) return missing("looks-same", "tolerance_diff");
  try {
    const fn = looksSame.default || looksSame;
    const result = await fn(beforeBuf, afterBuf, {
      tolerance: opts && opts.tolerance != null ? Number(opts.tolerance) : 2.3,
      ignoreAntialiasing: opts && opts.ignoreAntialiasing !== false,
      antialiasingTolerance: opts && opts.antialiasingTolerance != null ? Number(opts.antialiasingTolerance) : 4,
      ignoreCaret: opts && opts.ignoreCaret !== false,
      strict: !!(opts && opts.strict)
    });
    const output = {
      equal: !!result.equal,
      engine: "looks-same"
    };
    if (result.diffClusters) output.clusters = result.diffClusters;
    if (result.differentPixels != null) output.differentPixels = result.differentPixels;
    if (result.totalPixels != null) output.totalPixels = result.totalPixels;
    return output;
  } catch (e) {
    return { error: "looks-same failed: " + e.message };
  }
}

// ── Render overlay (node-canvas) ──────────────────────────────────────────

/**
 * Draw annotations (rectangles, lines, labels) on top of a PNG buffer.
 * Used by DV:render_overlay to annotate measurement output visually.
 *
 * @param {Buffer} pngBuf
 * @param {object[]} shapes - [{ type: "rect"|"line"|"text"|"circle", x, y, ... }]
 * @returns {Promise<Buffer>} annotated PNG buffer
 */
async function renderOverlay(pngBuf, shapes) {
  const canvasMod = tryRequire("canvas");
  if (!canvasMod) return missing("canvas", "render_overlay");
  try {
    const { createCanvas, loadImage } = canvasMod;
    const img = await loadImage(pngBuf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    for (const s of (shapes || [])) {
      ctx.lineWidth = s.lineWidth || 2;
      ctx.strokeStyle = s.stroke || "#ff0000";
      ctx.fillStyle   = s.fill   || "rgba(255,0,0,0.25)";
      if (s.type === "rect") {
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.width, s.height);
        if (s.fill) ctx.fill();
        ctx.stroke();
      } else if (s.type === "line") {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      } else if (s.type === "circle") {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius || 8, 0, Math.PI * 2);
        if (s.fill) ctx.fill();
        ctx.stroke();
      } else if (s.type === "text") {
        ctx.font = s.font || "16px sans-serif";
        ctx.fillStyle = s.color || "#ff0000";
        ctx.fillText(s.text, s.x, s.y);
      }
    }
    return canvas.toBuffer("image/png");
  } catch (e) {
    return { error: "render overlay failed: " + e.message };
  }
}

// ── Image dimensions + metadata ───────────────────────────────────────────

function imageDimensions(buf) {
  const sizeOf = tryRequire("image-size");
  if (!sizeOf) return missing("image-size", "image_dimensions");
  try {
    const fn = sizeOf.default || sizeOf;
    const result = fn(buf);
    return result;
  } catch (e) {
    return { error: "image-size failed: " + e.message };
  }
}

async function imageMetadata(buf) {
  const exifReader = tryRequire("exifreader");
  if (!exifReader) return missing("exifreader", "image_meta");
  try {
    const fn = exifReader.load || (exifReader.default && exifReader.default.load);
    if (!fn) return { error: "exifreader.load not found" };
    // The npm build of exifreader accepts ArrayBuffer or Buffer
    const tags = fn(buf.buffer ? buf.buffer : buf);
    // Trim verbose fields
    const out = {};
    for (const k of Object.keys(tags)) {
      const v = tags[k];
      if (v && (v.description != null || v.value != null)) {
        out[k] = v.description != null ? v.description : v.value;
      }
    }
    return out;
  } catch (e) {
    return { error: "exifreader failed: " + e.message };
  }
}

// ── Cheerio (HTML parse) + CSS specificity ───────────────────────────────

function parseHtml(html) {
  const cheerio = tryRequire("cheerio");
  if (!cheerio) return null;
  try {
    const load = cheerio.load || (cheerio.default && cheerio.default.load);
    return load(html);
  } catch (_) { return null; }
}

/**
 * Query HTML (page source or remote) with a cheerio selector, return matches.
 * Supports attribute + text extraction.
 */
function domQuery(html, selector, opts) {
  const $ = parseHtml(html);
  if (!$) return missing("cheerio", "dom_query");
  try {
    const max = Math.min(Math.max(parseInt((opts && opts.limit) || 100, 10), 1), 1000);
    const results = [];
    $(selector).each((_, el) => {
      if (results.length >= max) return;
      const $el = $(el);
      const attrs = {};
      if (el.attribs) {
        for (const k of Object.keys(el.attribs)) attrs[k] = el.attribs[k];
      }
      results.push({
        tag: el.name || el.tagName,
        text: $el.text().slice(0, 500).trim(),
        html: $el.html() ? $el.html().slice(0, 1000) : null,
        attrs
      });
    });
    return { selector, count: results.length, matches: results };
  } catch (e) {
    return { error: "cheerio query failed: " + e.message };
  }
}

/**
 * Compute CSS specificity for a selector using the `specificity` package.
 */
function cssSpecificity(selector) {
  const spec = tryRequire("specificity");
  if (!spec) return missing("specificity", "css_specificity");
  try {
    const fn = spec.calculate || (spec.default && spec.default.calculate);
    if (!fn) return { error: "specificity.calculate not found" };
    const result = fn(selector);
    return { selector, specificity: result };
  } catch (e) {
    return { error: "specificity failed: " + e.message };
  }
}

/**
 * HTML5 validation via the W3C Nu validator API (direct HTTPS call).
 * Replaces the deprecated html-validator package.
 */
async function validateHtml(htmlOrUrl) {
  const https = require("https");
  try {
    let apiUrl;
    let body = null;
    let headers = { "Accept": "application/json" };
    if (typeof htmlOrUrl === "string" && /^https?:\/\//.test(htmlOrUrl)) {
      apiUrl = "https://validator.w3.org/nu/?doc=" + encodeURIComponent(htmlOrUrl) + "&out=json";
    } else {
      apiUrl = "https://validator.w3.org/nu/?out=json";
      body = typeof htmlOrUrl === "string" ? htmlOrUrl : String(htmlOrUrl);
      headers["Content-Type"] = "text/html; charset=utf-8";
    }
    const result = await new Promise((resolve, reject) => {
      const parsed = new URL(apiUrl);
      const opts = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: body ? "POST" : "GET",
        headers,
        timeout: 30000
      };
      const req = https.request(opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch (e) { reject(new Error("W3C validator returned non-JSON")); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("W3C validator timed out")); });
      if (body) req.write(body);
      req.end();
    });
    const messages = (result && result.messages) || [];
    return {
      errorCount: messages.filter((m) => m.type === "error").length,
      warningCount: messages.filter((m) => m.type === "info" || m.type === "warning").length,
      messages: messages.slice(0, 100).map((m) => ({
        type: m.type,
        subType: m.subType,
        message: m.message,
        line: m.lastLine,
        col: m.lastColumn
      }))
    };
  } catch (e) {
    return { error: "W3C HTML validation failed: " + e.message };
  }
}

// ── Text diff / analysis ──────────────────────────────────────────────────

function textDiff(a, b, mode) {
  const diff = tryRequire("diff");
  if (!diff) return missing("diff", "text_diff");
  try {
    const m = mode || "lines";
    const fn =
      m === "chars"    ? diff.diffChars
    : m === "words"    ? diff.diffWords
    : m === "sentences"? diff.diffSentences
    :                    diff.diffLines;
    const parts = fn(a || "", b || "");
    const added = parts.filter((p) => p.added).map((p) => p.value).join("");
    const removed = parts.filter((p) => p.removed).map((p) => p.value).join("");
    return {
      mode: m,
      parts: parts.map((p) => ({
        added: !!p.added,
        removed: !!p.removed,
        value: p.value.length > 500 ? p.value.slice(0, 500) + "…" : p.value
      })),
      addedLength: added.length,
      removedLength: removed.length,
      identical: !parts.some((p) => p.added || p.removed)
    };
  } catch (e) {
    return { error: "diff failed: " + e.message };
  }
}

function textAnalysis(text) {
  const natural = tryRequire("natural");
  if (!natural) return missing("natural", "text_analysis");
  try {
    const input = String(text || "");
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(input);
    const sentTokenizer = new natural.SentenceTokenizer();
    const sentences = sentTokenizer.tokenize(input);
    let sentiment = null;
    try {
      const Analyzer = natural.SentimentAnalyzer;
      const stemmer = natural.PorterStemmer;
      const analyzer = new Analyzer("English", stemmer, "afinn");
      sentiment = analyzer.getSentiment(tokens);
    } catch (_) {}
    return {
      length: input.length,
      tokenCount: tokens.length,
      sentenceCount: sentences.length,
      uniqueWords: new Set(tokens.map((t) => t.toLowerCase())).size,
      sentiment,
      sampleTokens: tokens.slice(0, 40)
    };
  } catch (e) {
    return { error: "natural failed: " + e.message };
  }
}

// ── Broken-link scanner (linkinator) ──────────────────────────────────────

async function scanBrokenLinks(url, opts) {
  const linkinator = tryRequire("linkinator");
  if (!linkinator) return missing("linkinator", "broken_links");
  try {
    const LinkChecker = linkinator.LinkChecker;
    const checker = new LinkChecker();
    const results = await checker.check({
      path: url,
      recurse: !!(opts && opts.recurse),
      concurrency: (opts && opts.concurrency) || 10,
      timeout: (opts && opts.timeout) || 5000,
      linksToSkip: (opts && opts.skip) || [],
      retry: false
    });
    const broken = results.links.filter((l) => l.state === "BROKEN");
    return {
      url,
      total: results.links.length,
      broken: broken.length,
      brokenLinks: broken.slice(0, 100).map((l) => ({
        url: l.url,
        status: l.status,
        parent: l.parent,
        failureDetails: (l.failureDetails || []).slice(0, 2)
      }))
    };
  } catch (e) {
    return { error: "linkinator failed: " + e.message };
  }
}

// ── Error stack parsing + source-map unminify ─────────────────────────────

function parseStackTrace(stack) {
  const parser = tryRequire("error-stack-parser");
  if (!parser) return missing("error-stack-parser", "stack_trace");
  try {
    const fn = parser.parse || (parser.default && parser.default.parse);
    // error-stack-parser expects an Error — build a fake one
    const fakeErr = { stack };
    const frames = fn(fakeErr);
    return {
      frameCount: frames.length,
      frames: frames.map((f) => ({
        functionName: f.functionName,
        fileName: f.fileName,
        lineNumber: f.lineNumber,
        columnNumber: f.columnNumber,
        source: f.source
      }))
    };
  } catch (e) {
    return { error: "error-stack-parser failed: " + e.message };
  }
}

async function unminifyFrame(frame, sourceMapJSON) {
  const sourceMap = tryRequire("source-map");
  if (!sourceMap) return missing("source-map", "unminify");
  try {
    const SourceMapConsumer = sourceMap.SourceMapConsumer;
    const consumer = await new SourceMapConsumer(sourceMapJSON);
    try {
      const pos = consumer.originalPositionFor({
        line: frame.lineNumber,
        column: frame.columnNumber
      });
      return pos;
    } finally {
      if (typeof consumer.destroy === "function") consumer.destroy();
    }
  } catch (e) {
    return { error: "source-map failed: " + e.message };
  }
}

async function unminifyCoverage(jsText, coverage, sourceMapJSON) {
  const v8ToIstanbul = tryRequire("v8-to-istanbul");
  if (!v8ToIstanbul) return missing("v8-to-istanbul", "code_coverage");
  try {
    const fn = v8ToIstanbul.default || v8ToIstanbul;
    const converter = fn("", 0, {
      source: jsText,
      sourceMap: sourceMapJSON ? { sourcemap: sourceMapJSON } : undefined
    });
    await converter.load();
    converter.applyCoverage(coverage);
    return converter.toIstanbul();
  } catch (e) {
    return { error: "v8-to-istanbul failed: " + e.message };
  }
}

// ── Security: retire.js + csp-parse ───────────────────────────────────────

/**
 * Scan JS source (and optional library fingerprints) for known vulnerabilities.
 * retire.js exposes its scanner programmatically — falls back to the public
 * vulnerabilities list via a simple fingerprint match when not available.
 */
function vulnScan(fingerprints) {
  const retire = tryRequire("retire");
  if (!retire) return missing("retire", "vuln_scan");
  try {
    const scanJsFile = retire.scanJsFile || (retire.default && retire.default.scanJsFile);
    if (!scanJsFile) {
      return {
        error: "retire.scanJsFile not exposed by this version — use the CLI or upgrade"
      };
    }
    const repo = retire.loadJsRepository ? retire.loadJsRepository() : null;
    const findings = [];
    for (const f of (fingerprints || [])) {
      try {
        const result = scanJsFile(f.path || f.url || "", "", repo || {});
        if (result && result.length) findings.push({ file: f.path || f.url, findings: result });
      } catch (_) {}
    }
    return { findings, scanned: (fingerprints || []).length };
  } catch (e) {
    return { error: "retire failed: " + e.message };
  }
}

function cspCheck(cspHeader) {
  if (!cspHeader || typeof cspHeader !== "string") {
    return { error: "CSP header string required" };
  }
  try {
    const directives = {};
    const parts = cspHeader.split(";").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const name = tokens[0].toLowerCase();
      directives[name] = tokens.slice(1);
    }
    const issues = [];
    const all = JSON.stringify(directives);
    if (/'unsafe-inline'/.test(all)) issues.push("contains 'unsafe-inline'");
    if (/'unsafe-eval'/.test(all))   issues.push("contains 'unsafe-eval'");
    if (!directives["default-src"])  issues.push("no default-src directive");
    if (directives["script-src"] && directives["script-src"].includes("*")) {
      issues.push("script-src allows wildcard (*)");
    }
    if (!directives["frame-ancestors"]) issues.push("no frame-ancestors directive (clickjacking risk)");
    return { directives, directiveCount: Object.keys(directives).length, issues };
  } catch (e) {
    return { error: "CSP parse failed: " + e.message };
  }
}

// ── Cookie parsing (set-cookie-parser + tough-cookie) ─────────────────────

function parseSetCookie(setCookieHeaders) {
  const parser = tryRequire("set-cookie-parser");
  if (!parser) return missing("set-cookie-parser", "cookies_full");
  try {
    const fn = parser.parse || (parser.default && parser.default.parse);
    const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const parsed = fn(arr, { decodeValues: true });
    return { count: parsed.length, cookies: parsed };
  } catch (e) {
    return { error: "set-cookie-parser failed: " + e.message };
  }
}

function parseCookieJar(cookies) {
  const tough = tryRequire("tough-cookie");
  if (!tough) return missing("tough-cookie", "cookies_full");
  try {
    const Cookie = tough.Cookie;
    const parsed = (cookies || []).map((raw) => {
      try {
        const c = typeof raw === "string" ? Cookie.parse(raw) : Cookie.fromJSON(raw);
        return c ? c.toJSON() : { raw };
      } catch (_) { return { raw }; }
    });
    return { count: parsed.length, cookies: parsed };
  } catch (e) {
    return { error: "tough-cookie failed: " + e.message };
  }
}

// ── robots.txt parsing ────────────────────────────────────────────────────

async function parseRobots(url, userAgent) {
  const robotsParser = tryRequire("robots-parser");
  if (!robotsParser) return missing("robots-parser", "robots");
  try {
    const https = require("https");
    const http = require("http");
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    const robotsUrl = origin + "/robots.txt";
    const robotsText = await new Promise((resolve) => {
      const lib = robotsUrl.startsWith("https:") ? https : http;
      const req = lib.get(robotsUrl, { timeout: 10000 }, (res) => {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => resolve(body));
      });
      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
    });
    const fn = robotsParser.default || robotsParser;
    const robots = fn(robotsUrl, robotsText);
    const ua = userAgent || "Claude";
    return {
      robotsUrl,
      allowed: robots.isAllowed(url, ua),
      disallowed: robots.isDisallowed(url, ua),
      crawlDelay: robots.getCrawlDelay(ua),
      sitemaps: robots.getSitemaps(),
      preferredHost: robots.getPreferredHost ? robots.getPreferredHost() : null
    };
  } catch (e) {
    return { error: "robots-parser failed: " + e.message };
  }
}

// ── gzip-size for asset sizing ─────────────────────────────────────────────

async function gzipSize(input) {
  const gz = tryRequire("gzip-size");
  if (!gz) return missing("gzip-size");
  try {
    const fn = gz.gzipSize || gz.default || gz;
    return typeof fn === "function" ? await fn(input) : fn.sync(input);
  } catch (e) {
    return { error: "gzip-size failed: " + e.message };
  }
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
  diffCssValues,
  // batch 2 (round 3)
  extractPalette,
  colorStats,
  ssimDiff,
  toleranceDiff,
  renderOverlay,
  imageDimensions,
  imageMetadata,
  domQuery,
  cssSpecificity,
  validateHtml,
  textDiff,
  textAnalysis,
  scanBrokenLinks,
  parseStackTrace,
  unminifyFrame,
  unminifyCoverage,
  vulnScan,
  cspCheck,
  parseSetCookie,
  parseCookieJar,
  parseRobots,
  gzipSize
};
