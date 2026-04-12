/**
 * png-lite.js — Minimal PNG decoder for pixel inspection and diffing.
 *
 * Uses only Node built-ins (zlib). Decodes RGB and RGBA PNGs, which is
 * what Playwright and Puppeteer produce. Good enough to read individual
 * pixels and compare two images of the same size.
 *
 * Public API:
 *   decode(buf)                 → { width, height, bpp, data }   // RGBA planar
 *   getPixel(img, x, y)         → { r, g, b, a, hex }
 *   diff(a, b, opts)            → { width, height, diffCount, totalPixels, percent, box, maxChannelDelta }
 */

const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function isPNG(buf) {
  if (!buf || buf.length < 8) return false;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer into a flat RGBA byte array.
 * Only supports 8-bit depth, colorType 2 (RGB), 6 (RGBA), 0 (grayscale), 4 (grayscale+alpha).
 */
function decode(buf) {
  if (!isPNG(buf)) throw new Error("Not a PNG");

  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatChunks = [];
  let palette = null;
  let trns = null;

  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString("ascii", pos, pos + 4); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // CRC (unverified)

    if (type === "IHDR") {
      width  = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth  = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) throw new Error("Invalid PNG: no IHDR");
  if (bitDepth !== 8) throw new Error("Unsupported PNG bit depth: " + bitDepth);
  if (interlace !== 0) throw new Error("Interlaced PNGs not supported");

  let srcBpp;
  if (colorType === 2) srcBpp = 3;       // RGB
  else if (colorType === 6) srcBpp = 4;  // RGBA
  else if (colorType === 0) srcBpp = 1;  // grayscale
  else if (colorType === 4) srcBpp = 2;  // grayscale + alpha
  else if (colorType === 3) srcBpp = 1;  // indexed (palette)
  else throw new Error("Unsupported PNG colorType: " + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * srcBpp;
  const unfiltered = Buffer.alloc(width * height * srcBpp);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const srcByte = raw[rowStart + 1 + x];
      const a = x >= srcBpp ? unfiltered[y * stride + x - srcBpp] : 0;
      const b = y > 0 ? unfiltered[(y - 1) * stride + x] : 0;
      const c = y > 0 && x >= srcBpp ? unfiltered[(y - 1) * stride + x - srcBpp] : 0;
      let v;
      switch (filter) {
        case 0: v = srcByte; break;
        case 1: v = (srcByte + a) & 0xff; break;
        case 2: v = (srcByte + b) & 0xff; break;
        case 3: v = (srcByte + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: v = (srcByte + paeth(a, b, c)) & 0xff; break;
        default: throw new Error("Unknown PNG filter type: " + filter);
      }
      unfiltered[y * stride + x] = v;
    }
  }

  // Convert to flat RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const si = i * srcBpp;
    const di = i * 4;
    if (colorType === 2) {
      rgba[di]     = unfiltered[si];
      rgba[di + 1] = unfiltered[si + 1];
      rgba[di + 2] = unfiltered[si + 2];
      rgba[di + 3] = 255;
    } else if (colorType === 6) {
      rgba[di]     = unfiltered[si];
      rgba[di + 1] = unfiltered[si + 1];
      rgba[di + 2] = unfiltered[si + 2];
      rgba[di + 3] = unfiltered[si + 3];
    } else if (colorType === 0) {
      const g = unfiltered[si];
      rgba[di] = g; rgba[di + 1] = g; rgba[di + 2] = g; rgba[di + 3] = 255;
    } else if (colorType === 4) {
      const g = unfiltered[si];
      rgba[di] = g; rgba[di + 1] = g; rgba[di + 2] = g; rgba[di + 3] = unfiltered[si + 1];
    } else if (colorType === 3 && palette) {
      const idx = unfiltered[si] * 3;
      rgba[di]     = palette[idx] || 0;
      rgba[di + 1] = palette[idx + 1] || 0;
      rgba[di + 2] = palette[idx + 2] || 0;
      rgba[di + 3] = trns && trns[unfiltered[si]] != null ? trns[unfiltered[si]] : 255;
    }
  }

  return { width, height, bpp: 4, data: rgba };
}

function toHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

function getPixel(img, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return { error: "out-of-bounds", x, y, width: img.width, height: img.height };
  }
  const i = (y * img.width + x) * 4;
  const r = img.data[i];
  const g = img.data[i + 1];
  const b = img.data[i + 2];
  const a = img.data[i + 3];
  return { r, g, b, a, hex: toHex(r, g, b), rgba: "rgba(" + r + "," + g + "," + b + "," + (a / 255).toFixed(3) + ")" };
}

/**
 * Pixel-diff two decoded images. Returns the diff count, percentage,
 * bounding box of differences, and max per-channel delta.
 *
 * @param {object} a - decoded image { width, height, data }
 * @param {object} b - decoded image { width, height, data }
 * @param {object} [opts] - { threshold: 0..255 (default 10) }
 */
function diff(a, b, opts) {
  const threshold = (opts && opts.threshold != null) ? opts.threshold : 10;
  if (a.width !== b.width || a.height !== b.height) {
    return {
      error: "size-mismatch",
      a: { width: a.width, height: a.height },
      b: { width: b.width, height: b.height }
    };
  }
  const w = a.width, h = a.height;
  const total = w * h;
  let diffCount = 0;
  let maxDelta = 0;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(a.data[i]     - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
      const m = Math.max(dr, dg, db, da);
      if (m > maxDelta) maxDelta = m;
      if (m > threshold) {
        diffCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const percent = diffCount / total * 100;
  const box = diffCount > 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;

  return {
    width: w,
    height: h,
    totalPixels: total,
    diffCount,
    percent: Number(percent.toFixed(4)),
    threshold,
    maxChannelDelta: maxDelta,
    box,
    identical: diffCount === 0
  };
}

module.exports = { decode, getPixel, diff, toHex, isPNG };
