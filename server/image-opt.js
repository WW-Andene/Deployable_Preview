/**
 * image-opt.js — on-the-fly image transcoding for /preview/* routes.
 *
 * Activates only when:
 *   - sharp is installed (optional dep — gracefully degrades if not)
 *   - the response is image/jpeg, image/png, image/webp, or image/avif
 *   - the request supplies at least one of: ?w=, ?h=, ?fmt=, ?q=
 *
 * Otherwise the original bytes pass through unchanged.
 *
 * Query params:
 *   w  — target width  (≥ 1, ≤ 8192). Aspect preserved unless h also set.
 *   h  — target height (≥ 1, ≤ 8192).
 *   fmt — webp | avif | jpeg | png. Defaults to webp if Accept allows.
 *   q  — quality 1..100 (default 80 for lossy, ignored for png).
 *   fit — cover | contain | inside | outside | fill (default: inside).
 *
 * 24h immutable cache — Vary: Accept so the CDN keeps separate webp/avif
 * variants per Accept header.
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

let _sharp = null, _sharpTried = false;
function getSharp() {
  if (_sharpTried) return _sharp;
  _sharpTried = true;
  try { _sharp = require("sharp"); }
  catch (_) { _sharp = null; }
  return _sharp;
}

const IMAGE_EXTS = /\.(jpe?g|png|webp|avif)$/i;
const SUPPORTED_FMT = ["webp", "avif", "jpeg", "png"];

// Tiny in-process LRU so back-to-back requests for the same variant
// don't re-encode. Capped at ~64MB to keep RAM bounded on heavy use.
const _cache = new Map(); // key -> { buf, mime, at }
const CACHE_MAX_BYTES = 64 * 1024 * 1024;
let _cacheBytes = 0;
function _cacheGet(k) {
  const v = _cache.get(k);
  if (!v) return null;
  // refresh LRU
  _cache.delete(k); _cache.set(k, v);
  return v;
}
function _cachePut(k, buf, mime) {
  while (_cache.size && _cacheBytes + buf.length > CACHE_MAX_BYTES) {
    const oldest = _cache.keys().next().value;
    const old = _cache.get(oldest);
    _cache.delete(oldest);
    if (old && old.buf) _cacheBytes -= old.buf.length;
  }
  _cache.set(k, { buf, mime, at: Date.now() });
  _cacheBytes += buf.length;
}

function pickFormat(reqFmt, acceptHeader) {
  const f = (reqFmt || "").toLowerCase();
  if (SUPPORTED_FMT.indexOf(f) !== -1) return f;
  // Auto: prefer avif → webp → jpeg based on Accept
  const accept = String(acceptHeader || "").toLowerCase();
  if (accept.indexOf("image/avif") !== -1) return "avif";
  if (accept.indexOf("image/webp") !== -1) return "webp";
  return "jpeg";
}

// Returns true if any of w/h/fmt/q was supplied (so we have a reason to
// touch the image). Otherwise the static handler streams the raw file.
function wantsTransform(query) {
  return !!(query && (query.w || query.h || query.fmt || query.q || query.fit));
}

// Try-best-effort: serve a transformed image, or return false to let
// the caller fall through to the next handler (express.static).
async function maybeServeOptimized(filePath, req, res) {
  if (!wantsTransform(req.query)) return false;
  if (!IMAGE_EXTS.test(filePath)) return false;
  const sharp = getSharp();
  if (!sharp) return false;
  let stat;
  try { stat = fs.statSync(filePath); } catch (_) { return false; }

  const fmt = pickFormat(req.query.fmt, req.headers["accept"]);
  const w = Math.min(8192, Math.max(1, parseInt(req.query.w, 10) || 0)) || null;
  const h = Math.min(8192, Math.max(1, parseInt(req.query.h, 10) || 0)) || null;
  const q = Math.min(100, Math.max(1, parseInt(req.query.q, 10) || 80));
  const fit = ["cover","contain","inside","outside","fill"].indexOf(req.query.fit) !== -1
    ? req.query.fit : "inside";

  // Cache key includes mtime so a rebuild's new bytes invalidate cleanly.
  const key = filePath + "|" + stat.mtimeMs + "|" + w + "x" + h + "|" + fmt + "|q" + q + "|" + fit;
  const etag = '"' + crypto.createHash("sha1").update(key).digest("hex").slice(0, 16) + '"';

  // ETag short-circuit
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }

  const cached = _cacheGet(key);
  let buf, mime;
  if (cached) { buf = cached.buf; mime = cached.mime; }
  else {
    try {
      let pipeline = sharp(filePath);
      if (w || h) pipeline = pipeline.resize({ width: w || null, height: h || null, fit, withoutEnlargement: true });
      if (fmt === "webp") { pipeline = pipeline.webp({ quality: q }); mime = "image/webp"; }
      else if (fmt === "avif") { pipeline = pipeline.avif({ quality: q }); mime = "image/avif"; }
      else if (fmt === "png")  { pipeline = pipeline.png({ compressionLevel: 9 }); mime = "image/png"; }
      else                     { pipeline = pipeline.jpeg({ quality: q, mozjpeg: true }); mime = "image/jpeg"; }
      buf = await pipeline.toBuffer();
      _cachePut(key, buf, mime);
    } catch (e) {
      // Encoder bombed — let the caller fall through to raw serving.
      return false;
    }
  }

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("ETag", etag);
  res.setHeader("Vary", "Accept");
  res.setHeader("Content-Length", buf.length);
  // Don't expose the source extension to leak format
  res.end(buf);
  return true;
}

function isAvailable() { return !!getSharp(); }

module.exports = { maybeServeOptimized, isAvailable };
