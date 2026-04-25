/**
 * dv/pool.js — persistent page session pool with refcount + TTL eviction.
 *
 * Pages are kept alive across tool calls so per-preview state
 * (localStorage, modals, scroll position) persists. Keyed by
 * "owner/repo/slug". Pool is bounded (DV_MAX_SESSIONS, default 100) and
 * sessions idle longer than DV_SESSION_TTL_MS (default 5 min) are
 * evicted. Sessions in use (refCount > 0) are skipped by the eviction
 * loop until a 2-min stale-grace window expires.
 *
 * Extracted from dv/session.js (R6.5).
 */

"use strict";

const lifecycle = require("./lifecycle");

const pageSessions = new Map();
const SESSION_TTL_MS = parseInt(process.env.DV_SESSION_TTL_MS, 10) || (5 * 60 * 1000);
const MAX_SESSIONS  = parseInt(process.env.DV_MAX_SESSIONS, 10) || 100;
// Cap for the initial page.goto when a session is created. 0 = no cap.
// Override via DV_NAV_TIMEOUT_MS env var or per-call by passing navTimeout
// down through the tools (already plumbed in screenshot/audit/network).
const NAV_TIMEOUT_MS = parseInt(process.env.DV_NAV_TIMEOUT_MS, 10);
const NAV_TIMEOUT_DEFAULT = Number.isFinite(NAV_TIMEOUT_MS) ? NAV_TIMEOUT_MS : 30000;

// A leaked refCount (caller forgot to release) shouldn't pin the session
// forever. After this grace period an in-use entry is treated as stale and
// evicted anyway.
const STALE_REFCOUNT_GRACE_MS = 2 * 60 * 1000;

// Snapshot the keys so additions during iteration aren't observed mid-cycle.
const _evictTimer = setInterval(() => {
  const now = Date.now();
  for (const key of Array.from(pageSessions.keys())) {
    const session = pageSessions.get(key);
    if (!session) continue;
    const idleFor = now - session.lastUsed;
    const inUse = (session.refCount || 0) > 0;
    if (inUse && idleFor < STALE_REFCOUNT_GRACE_MS) continue; // active — skip
    if (!inUse && idleFor <= SESSION_TTL_MS) continue;        // fresh — skip
    session.page.close().catch(() => {});
    pageSessions.delete(key);
    console.log("[mcp-browser] Session expired: " + key + (inUse ? " (stale refCount)" : ""));
  }
}, 60 * 1000);
// Don't keep the event loop alive on shutdown.
if (typeof _evictTimer.unref === "function") _evictTimer.unref();

// F-NEW-A001: track the most recent eviction reason so the next-acquired
// session can attach a warning to its result. Surfaced to callers as
// `pool: { evictedKey, reason }` so they know "your previous viewport
// session was dropped — this is a fresh page" instead of seeing wrong
// state silently.
let _lastEviction = null;
function getLastEviction() { const e = _lastEviction; _lastEviction = null; return e; }

// Evict oldest non-busy session if the pool is full.
function evictOldestIfFull() {
  if (pageSessions.size < MAX_SESSIONS) return;
  let oldestKey = null, oldestAt = Infinity;
  for (const [k, s] of pageSessions) {
    if ((s.refCount || 0) > 0) continue;
    if (s.lastUsed < oldestAt) { oldestAt = s.lastUsed; oldestKey = k; }
  }
  if (oldestKey) {
    const s = pageSessions.get(oldestKey);
    s.page.close().catch(() => {});
    pageSessions.delete(oldestKey);
    _lastEviction = { key: oldestKey, at: Date.now(), reason: "pool full (max " + MAX_SESSIONS + ")" };
    console.log("[mcp-browser] Session evicted (pool full): " + oldestKey);
  }
}

/**
 * Get or create a persistent page for a preview.
 * Reuses existing page if viewport matches, otherwise creates new.
 *
 * The returned `release` function MUST be called (in a finally) once the
 * caller is done with the page. While refCount > 0 the TTL eviction loop
 * will not close this session out from under the caller. The .release is
 * idempotent.
 */
async function getSessionPage(browser, owner, repo, slug, width, height, _depth, _opts) {
  // F-A006: cap recursion. If a freshly created page also fails .title()
  // (e.g. browser crashed entirely) we'd otherwise loop forever, ballooning
  // the call stack and leaking sessions.
  const depth = _depth || 0;
  if (depth > 2) throw new Error("getSessionPage: page kept dying — browser may have crashed");
  const key = owner + "/" + repo + "/" + slug;
  const w = width || 1280;
  const h = height || 720;
  const url = lifecycle.resolvePreviewUrl(owner, repo, slug);

  const existing = pageSessions.get(key);
  if (existing) {
    // Check if page is still alive
    try {
      await existing.page.title(); // will throw if closed/crashed
    } catch (_) {
      pageSessions.delete(key);
      return getSessionPage(browser, owner, repo, slug, width, height, depth + 1, _opts);
    }

    // Resize viewport if needed
    if (existing.width !== w || existing.height !== h) {
      await lifecycle.setViewport(existing.page, w, h);
      existing.width = w;
      existing.height = h;
    }
    existing.lastUsed = Date.now();
    existing.refCount = (existing.refCount || 0) + 1;
    return Object.assign(
      { page: existing.page, url, isNew: false },
      { release: makeRelease(key) }
    );
  }

  // Honour the pool cap before allocating a new page.
  evictOldestIfFull();

  // Create new session
  const page = await lifecycle.newPage(browser);
  await lifecycle.setViewport(page, w, h);

  // Always-on runtime error capture — ring buffer per session.
  const errorLog = [];
  try {
    page.on("pageerror", function(err) {
      const entry = {
        t: Date.now(),
        type: "pageerror",
        message: (err && err.message) || String(err),
        stack: err && err.stack ? String(err.stack).split("\n").slice(0, 8).join("\n") : null
      };
      errorLog.push(entry);
      if (errorLog.length > 200) errorLog.splice(0, errorLog.length - 200);
    });
    page.on("console", function(msg) {
      try {
        const type = msg.type ? msg.type() : "log";
        if (type !== "error" && type !== "warning") return;
        const entry = {
          t: Date.now(),
          type: "console." + type,
          message: msg.text ? msg.text().slice(0, 2000) : String(msg),
          stack: null
        };
        errorLog.push(entry);
        if (errorLog.length > 200) errorLog.splice(0, errorLog.length - 200);
      } catch (_) {}
    });
    page.on("requestfailed", function(req) {
      try {
        const entry = {
          t: Date.now(),
          type: "requestfailed",
          message: req.url() + " — " + (req.failure && req.failure() ? req.failure().errorText : "unknown"),
          stack: null
        };
        errorLog.push(entry);
        if (errorLog.length > 200) errorLog.splice(0, errorLog.length - 200);
      } catch (_) {}
    });
  } catch (_) { /* listener setup is best-effort */ }

  // Pass navTimeout=0 from the tool layer to disable the cap entirely
  // for this nav. Anything else (or undefined) uses the env-configured
  // default. Negative values fall back to the default too.
  const navTimeoutOpt = _opts && Number.isFinite(_opts.navTimeout) ? _opts.navTimeout : NAV_TIMEOUT_DEFAULT;
  const goOpts = { waitUntil: lifecycle.waitUntilIdle() };
  if (navTimeoutOpt > 0) goOpts.timeout = navTimeoutOpt;
  // navTimeoutOpt === 0 → omit timeout → Playwright treats as no timeout.
  await page.goto(url, goOpts);

  pageSessions.set(key, { page, width: w, height: h, lastUsed: Date.now(), errorLog, refCount: 1 });
  console.log("[mcp-browser] New session: " + key + " (" + w + "x" + h + ")");
  return Object.assign(
    { page, url, isNew: true },
    { release: makeRelease(key) }
  );
}

// Returns an idempotent release function bound to one acquisition.
function makeRelease(key) {
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    const s = pageSessions.get(key);
    if (s && s.refCount > 0) s.refCount--;
  };
}

/**
 * Read the captured error log for a preview session. Returns an empty
 * array if no session exists. Optionally clears the log.
 */
function getSessionErrors(owner, repo, slug, opts) {
  const key = owner + "/" + repo + "/" + slug;
  const s = pageSessions.get(key);
  if (!s) return { errors: [], sessionExists: false };
  const log = s.errorLog || [];
  const out = { errors: log.slice(), sessionExists: true, count: log.length };
  if (opts && opts.clear) s.errorLog = [];
  return out;
}

function closeSession(owner, repo, slug) {
  const key = owner + "/" + repo + "/" + slug;
  const session = pageSessions.get(key);
  if (session) {
    session.page.close().catch(() => {});
    pageSessions.delete(key);
    return true;
  }
  return false;
}

function closeAllSessions() {
  for (const [, session] of pageSessions) {
    session.page.close().catch(() => {});
  }
  pageSessions.clear();
}

module.exports = {
  getSessionPage,
  closeSession,
  closeAllSessions,
  getSessionErrors,
  evictOldestIfFull,
  getLastEviction
};
