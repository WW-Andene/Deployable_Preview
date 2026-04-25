/**
 * build/state.js — runtime state + key helpers shared across the build pipeline.
 *
 * Owns:
 *   - The mutable in-memory state (buildStatus, buildLocks)
 *   - Key/path helpers (branchSlug, getBranchDir, buildKey)
 *   - The global concurrency counter
 *   - The createLogger helper (binds log strings to buildStatus[key].log)
 *   - SSOT prune subscriber: when config is saved, drop orphan entries
 *
 * Does NOT own anything that touches subprocesses, browsers, or the
 * filesystem beyond the workspace directory.
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { broadcastLog } = require("../logs");

const WORKSPACE = path.join(__dirname, "..", "..", "workspace");
if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS, 10) || 4;

// Mutable state — single source of truth for "what's the build doing right now".
const buildStatus = {};
const buildLocks  = {};   // prevents concurrent builds for the same key

function countActiveBuilds() {
  let count = 0;
  for (const k in buildLocks) { if (buildLocks[k]) count++; }
  return count;
}

// ── Key & path helpers ──────────────────────────────────────────────────────

function branchSlug(bc) {
  if (typeof bc === "string") return bc.replace(/\//g, "__");
  // D3: customSlug overrides the auto-generated one when set + valid.
  // Routing, history files, snapshots, build keys all key off this, so
  // the custom alias becomes the canonical identifier — preview URLs,
  // file paths, MCP results all use it consistently.
  if (bc.customSlug && /^[a-zA-Z0-9_-]{1,64}$/.test(bc.customSlug)) {
    return bc.customSlug;
  }
  let slug = bc.branch.replace(/\//g, "__");
  if (bc.baseDir) slug += "--" + bc.baseDir.replace(/\//g, "__");
  return slug;
}

function getBranchDir(owner, repo, bc) {
  return path.join(WORKSPACE, owner + "__" + repo + "__" + branchSlug(bc));
}

function buildKey(owner, repo, bc) {
  return owner + "/" + repo + ":" + branchSlug(bc);
}

// ── Logger factory ──────────────────────────────────────────────────────────
// Returns an addLog function bound to buildStatus[key].log + the SSE log
// stream. The buildStatus check guards against the slot being deleted
// mid-build (e.g. by the SSOT prune subscriber when a branch is removed).

function createLogger(key) {
  let log = "";
  function addLog(msg) {
    log += msg + "\n";
    if (buildStatus[key]) buildStatus[key].log = log;
    broadcastLog(key, msg);
    console.log("[" + key + "] " + msg);
  }
  addLog.getLog = () => log;
  addLog.setLog = (l) => { log = l; };
  return addLog;
}

// ── Status broadcaster (H1: SSE dashboard updates) ──────────────────────────
// Subscribers receive every buildStatus state change so the dashboard can
// show ready/error/building transitions without polling. Listeners are
// fire-and-forget; throwing in one doesn't affect the others.
const _statusListeners = new Set();
function onStatusChange(cb) { _statusListeners.add(cb); return () => _statusListeners.delete(cb); }
function broadcastStatus(key, slot) {
  for (const cb of _statusListeners) {
    try { cb(key, slot); } catch (_) {}
  }
}
// Wrap mutations to buildStatus[key].status with a Proxy-like setter.
// Simpler approach: callers (executor/server) explicitly call markStatus
// after each transition. Provide a helper they can use.
function markStatus(key, patch) {
  if (!buildStatus[key]) buildStatus[key] = {};
  Object.assign(buildStatus[key], patch || {});
  // Strip heavy fields from the broadcast payload.
  const { thumb, diffThumb, log, ...lean } = buildStatus[key];
  broadcastStatus(key, { ...lean, hasThumb: !!buildStatus[key].thumb });
}

// ── SSOT prune subscriber ───────────────────────────────────────────────────
// When the config is saved, drop buildStatus entries for branches that no
// longer exist in any repo. Otherwise removed branches keep stale state +
// thumbs in memory forever.
try {
  const { onConfigSaved } = require("../config");
  const { killServer } = require("../process");
  onConfigSaved(function pruneBuildStatusOnConfigChange(cfg) {
    const valid = new Set();
    for (const r of (cfg.repos || [])) {
      for (const bc of (r.activeBranches || [])) {
        valid.add(buildKey(r.owner, r.repo, bc));
      }
    }
    for (const k of Object.keys(buildStatus)) {
      if (!valid.has(k)) {
        try { killServer(k); } catch (_) {}
        delete buildStatus[k];
        console.log("[build] Pruned orphan buildStatus: " + k);
      }
    }
  });
} catch (_) { /* config module not yet loaded — pruning will not register */ }

// ── Deployment history ──────────────────────────────────────────────────────
// Track every successful (status=ready or running) build so users + Claude
// can see a timeline and roll back to a previous SHA. Bounded per-key to
// avoid unbounded growth; persisted via logs.js sidecar file so it survives
// restarts. Each entry: { commitSha, timestamp, duration, outputPath,
// snapshotDir, mode, by ("build"|"webhook"|"manual") }.
const HISTORY_DIR = path.join(WORKSPACE, ".history");
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
const MAX_HISTORY_PER_KEY = parseInt(process.env.DV_MAX_HISTORY_PER_KEY, 10) || 10;

function _historyFile(key) { return path.join(HISTORY_DIR, key.replace(/[\/\:]/g, "__") + ".json"); }

function getHistory(key) {
  try {
    const raw = fs.readFileSync(_historyFile(key), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function appendHistory(key, entry) {
  const arr = getHistory(key);
  arr.unshift(Object.assign({ id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) }, entry));
  // Keep newest N. Older snapshot dirs are cleaned up by the caller.
  while (arr.length > MAX_HISTORY_PER_KEY) {
    const evicted = arr.pop();
    if (evicted && evicted.snapshotDir) {
      try { fs.rmSync(evicted.snapshotDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
  return arr;
}

// G2 / H5: comments + notes on history entries.
//   - `note`        — singular free-text (legacy; still settable for AI tools).
//   - `comments[]`  — multiple authored comments. { id, by, text, at }
// Both capped at 2000 chars per text. Comments are kept newest-last so
// the list reads as a thread.
const MAX_NOTE_CHARS = 2000;
function setHistoryNote(key, historyId, note) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry) return null;
  if (note == null || String(note).trim() === "") {
    delete entry.note;
    delete entry.noteAt;
  } else {
    entry.note = String(note).slice(0, MAX_NOTE_CHARS);
    entry.noteAt = Date.now();
  }
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
  return entry;
}

function addHistoryComment(key, historyId, by, text) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry) return null;
  if (!Array.isArray(entry.comments)) entry.comments = [];
  const comment = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
    by: String(by || "anon").slice(0, 64),
    text: String(text || "").slice(0, MAX_NOTE_CHARS),
    at: Date.now()
  };
  if (!comment.text.trim()) return null;
  entry.comments.push(comment);
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
  return comment;
}

// K4: tag a snapshot with a memorable name. Tags are repo-unique
// strings — re-tagging an entry updates instead of duplicating, and a
// tag may only point at one entry at a time (transferring it away
// implicitly).
function setHistoryTag(key, historyId, tag) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry) return null;
  if (tag == null || String(tag).trim() === "") {
    delete entry.tag;
  } else {
    const t = String(tag).trim().slice(0, 64);
    // Strip the tag off any other entry that already has it.
    for (const other of arr) if (other !== entry && other.tag === t) delete other.tag;
    entry.tag = t;
  }
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
  return entry;
}
function findHistoryByTag(key, tag) {
  if (!tag) return null;
  const arr = getHistory(key);
  return arr.find((h) => h.tag === String(tag)) || null;
}

function deleteHistoryComment(key, historyId, commentId) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry || !Array.isArray(entry.comments)) return false;
  const before = entry.comments.length;
  entry.comments = entry.comments.filter((c) => c.id !== commentId);
  if (entry.comments.length === before) return false;
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
  return true;
}

// I1: walk the output dir and total its bytes. Used to compute
// per-build bundle size + delta vs previous build. Best-effort:
// returns 0 on any IO error rather than crashing the build flow.
function getDirectorySize(dir) {
  let total = 0;
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        try { total += fs.statSync(full).size; } catch (_) {}
      }
    }
  }
  walk(dir);
  return total;
}

// snapshotBuildOutput copies the current outputPath into a versioned
// directory under WORKSPACE/<owner__repo__slug>/.snapshots/<id>/. We copy
// rather than move so the live preview keeps serving while history grows.
function snapshotBuildOutput(key, outputPath) {
  if (!outputPath || !fs.existsSync(outputPath)) return null;
  const id = Date.now().toString(36);
  const branchDir = path.dirname(outputPath); // workspace/<owner__repo__slug>/[…]
  const snapsRoot = path.join(branchDir, ".snapshots");
  const dest = path.join(snapsRoot, id);
  try {
    fs.mkdirSync(snapsRoot, { recursive: true });
    // fs.cpSync recursive — Node 16.7+. Fallback to spawn cp on older nodes.
    if (typeof fs.cpSync === "function") {
      fs.cpSync(outputPath, dest, { recursive: true, force: true });
    } else {
      require("child_process").execSync("cp -R " + JSON.stringify(outputPath) + " " + JSON.stringify(dest));
    }
    return dest;
  } catch (e) {
    console.warn("[history] snapshot failed for " + key + ": " + e.message);
    return null;
  }
}

module.exports = {
  WORKSPACE,
  MAX_CONCURRENT_BUILDS,
  buildStatus,
  buildLocks,
  countActiveBuilds,
  branchSlug,
  getBranchDir,
  buildKey,
  createLogger,
  // ── status broadcaster ──
  onStatusChange,
  broadcastStatus,
  markStatus,
  // ── deployment history ──
  getHistory,
  appendHistory,
  setHistoryNote,
  setHistoryTag,
  findHistoryByTag,
  addHistoryComment,
  deleteHistoryComment,
  snapshotBuildOutput,
  getDirectorySize,
  MAX_HISTORY_PER_KEY
};
