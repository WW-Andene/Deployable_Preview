/**
 * dv/tools/web-fetch-cache.js — disk-backed cache for web_fetch results.
 *
 * web_fetch is often pointed at large pages (long articles, big JSON APIs,
 * JS-rendered SPAs) that a session re-fetches repeatedly while iterating —
 * paying the full download/render cost each time just to look at the same
 * data again. This persists successful results to disk under
 * workspace/web-fetch-cache/ so a repeat call with the same URL/options
 * within the TTL is served from disk instead of hitting the network again.
 *
 * Deliberately separate from dv/core.js's in-memory `cache: { ttlMs }`
 * mechanism: that cache is small, per-process, and lost on restart —
 * fine for cheap idempotent lookups (robots.txt) but wrong for
 * multi-MB page bodies that are worth keeping across restarts and out
 * of process memory.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "..", "..", "..", "workspace", "web-fetch-cache");
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min
const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500MB total on disk
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;  // don't persist a single entry over 50MB

// Args that don't affect the fetched content, only how the tool call itself
// is invoked/reported — excluded from the cache key so equivalent requests
// still hit.
const KEY_IGNORE_ARGS = new Set(["cache", "cacheTtlMs", "noCache", "forceRefresh"]);

function ensureDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) { /* best effort */ }
}

function cacheKeyFor(args) {
  const filtered = {};
  for (const k of Object.keys(args || {}).sort()) {
    if (KEY_IGNORE_ARGS.has(k)) continue;
    filtered[k] = args[k];
  }
  const hash = crypto.createHash("sha256").update(JSON.stringify(filtered)).digest("hex");
  return hash;
}

function entryPath(key) {
  return path.join(CACHE_DIR, key + ".json");
}

function get(key) {
  try {
    const p = entryPath(key);
    const raw = fs.readFileSync(p, "utf8");
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.expiresAt !== "number") return null;
    if (Date.now() > entry.expiresAt) {
      fs.unlink(p, () => {});
      return null;
    }
    return entry.result;
  } catch (_) {
    return null;
  }
}

function put(key, result, ttlMs) {
  try {
    const serialized = JSON.stringify({
      savedAt: Date.now(),
      expiresAt: Date.now() + (Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_TTL_MS),
      result
    });
    if (Buffer.byteLength(serialized, "utf8") > MAX_ENTRY_BYTES) return false;
    ensureDir();
    fs.writeFileSync(entryPath(key), serialized, "utf8");
    evictIfOversized();
    return true;
  } catch (_) {
    return false;
  }
}

// Cap total cache footprint by deleting the oldest entries (by mtime) once
// the directory grows past MAX_CACHE_BYTES. Runs opportunistically after a
// write rather than on a timer — cheap relative to the fetch it follows.
function evictIfOversized() {
  try {
    const files = fs.readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const full = path.join(CACHE_DIR, f);
        const st = fs.statSync(full);
        return { full, size: st.size, mtime: st.mtimeMs };
      });
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= MAX_CACHE_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= MAX_CACHE_BYTES) break;
      try { fs.unlinkSync(f.full); total -= f.size; } catch (_) { /* ignore */ }
    }
  } catch (_) { /* best effort */ }
}

module.exports = { cacheKeyFor, get, put, DEFAULT_TTL_MS, CACHE_DIR };
