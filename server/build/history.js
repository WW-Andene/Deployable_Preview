/**
 * build/history.js — deployment-history persistence + snapshots.
 *
 * Each branch has a per-key JSON file at WORKSPACE/.history/<key>.json
 * holding an array of entries (newest-first). Entries:
 *
 *   {
 *     id, commitSha, timestamp, duration,
 *     outputPath, snapshotDir, mode, by ("build"|"rollback"),
 *     bytes?, bytesDelta?, bytesDeltaPct?,
 *     note?, noteAt?, tag?, comments?: [{ id, by, text, at }]
 *   }
 *
 * Bounded per key by DV_MAX_HISTORY_PER_KEY (default 10) — older
 * entries' snapshot dirs are rm -rf'd on eviction so disk usage stays
 * predictable.
 *
 * snapshotBuildOutput(key, outputPath) copies the output dir into
 * <branchDir>/.snapshots/<id>/ — used by the rollback path.
 *
 * R3: extracted from state.js (which became a re-export shim).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { WORKSPACE } = require("./state-core");

const HISTORY_DIR = path.join(WORKSPACE, ".history");
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

const MAX_HISTORY_PER_KEY = parseInt(process.env.DV_MAX_HISTORY_PER_KEY, 10) || 10;
const MAX_NOTE_CHARS = 2000;

function _historyFile(key) {
  return path.join(HISTORY_DIR, key.replace(/[\/\:]/g, "__") + ".json");
}

function _save(key, arr) {
  try { fs.writeFileSync(_historyFile(key), JSON.stringify(arr, null, 2)); } catch (_) {}
}

function getHistory(key) {
  try {
    const raw = fs.readFileSync(_historyFile(key), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function appendHistory(key, entry) {
  const arr = getHistory(key);
  arr.unshift(Object.assign({
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  }, entry));
  // Keep newest N. Older snapshot dirs are cleaned up here so disk
  // doesn't bloat. Best-effort — failing to rm -rf a dir doesn't
  // block append.
  while (arr.length > MAX_HISTORY_PER_KEY) {
    const evicted = arr.pop();
    if (evicted && evicted.snapshotDir) {
      try { fs.rmSync(evicted.snapshotDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
  _save(key, arr);
  return arr;
}

// G2 / H5: notes (singular) + comments (multi-author thread).
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
  _save(key, arr);
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
  _save(key, arr);
  return comment;
}

function deleteHistoryComment(key, historyId, commentId) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry || !Array.isArray(entry.comments)) return false;
  const before = entry.comments.length;
  entry.comments = entry.comments.filter((c) => c.id !== commentId);
  if (entry.comments.length === before) return false;
  _save(key, arr);
  return true;
}

// K4: tag a snapshot with a memorable name. Tags are repo-unique —
// re-tagging transfers ownership off any prior holder.
//
// Tag regex mirrors customSlug (routes/api/repos.js). Tags are used
// as URL path components in /__snapshot/<tag>/ so they have to be
// URL-safe. Previously setHistoryTag accepted any 64-char string,
// which let a tag like 'foo/bar' or '..' break the routing layer.
const TAG_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,63}$/;
function setHistoryTag(key, historyId, tag) {
  const arr = getHistory(key);
  const entry = arr.find((h) => h.id === historyId);
  if (!entry) return null;
  if (tag == null || String(tag).trim() === "") {
    delete entry.tag;
  } else {
    const t = String(tag).trim().slice(0, 64);
    if (!TAG_RE.test(t)) {
      const err = new Error("Invalid tag — letters/numbers/._- only, must not start with .");
      err.code = "INVALID_TAG";
      throw err;
    }
    for (const other of arr) if (other !== entry && other.tag === t) delete other.tag;
    entry.tag = t;
  }
  _save(key, arr);
  return entry;
}

function findHistoryByTag(key, tag) {
  if (!tag) return null;
  const arr = getHistory(key);
  return arr.find((h) => h.tag === String(tag)) || null;
}

// I1: walk an output dir and total its bytes — feeds the per-build
// bundle-size delta. Best-effort: returns 0 on any IO error.
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
// dir under <branchDir>/.snapshots/<id>/. Copies (not moves) so the
// live preview keeps serving while history grows.
function snapshotBuildOutput(key, outputPath) {
  if (!outputPath || !fs.existsSync(outputPath)) return null;
  const id = Date.now().toString(36);
  const branchDir = path.dirname(outputPath); // workspace/<owner__repo__slug>/[…]
  const snapsRoot = path.join(branchDir, ".snapshots");
  const dest = path.join(snapsRoot, id);
  try {
    fs.mkdirSync(snapsRoot, { recursive: true });
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
  MAX_HISTORY_PER_KEY,
  getHistory,
  appendHistory,
  setHistoryNote,
  addHistoryComment,
  deleteHistoryComment,
  setHistoryTag,
  findHistoryByTag,
  getDirectorySize,
  snapshotBuildOutput
};
