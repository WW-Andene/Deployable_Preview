/**
 * enrichments/visual.js — image / pixel / color enrichments.
 *
 * Wraps optional native + JS image libs:
 *   pixelDiff, sharpPixel/Crop/Metadata, ssimDiff, toleranceDiff,
 *   renderOverlay, imageDimensions, imageMetadata, extractPalette,
 *   colorStats. All lazy-loaded via lib.tryRequire.
 *
 * Extracted from mcp-enrichments.js (R6.8).
 */

"use strict";

const { tryRequire, missing } = require("./lib");

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
  // Clamp threshold to [0, 1] — pixelmatch contract; out-of-range silently broke diffs.
  const _t = opts && opts.threshold != null ? Number(opts.threshold) : 0.1;
  const threshold = Number.isFinite(_t) ? Math.max(0, Math.min(_t, 1)) : 0.1;
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
        palette  = await CT.getPalette(tmp, count ?? 6);
      } else {
        const inst = new CT();
        dominant = await inst.getColor(tmp);
        palette  = await inst.getPalette(tmp, count ?? 6);
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
    const colors = await fn(pngBuf, { count: count ?? 8, type: "image/png" });
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

module.exports = { pixelDiff, sharpPixel, sharpCrop, sharpMetadata, extractPalette, colorStats, ssimDiff, toleranceDiff, renderOverlay, imageDimensions, imageMetadata };
