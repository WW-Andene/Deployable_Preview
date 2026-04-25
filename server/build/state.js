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
  // ── deployment history ──
  getHistory,
  appendHistory,
  snapshotBuildOutput,
  MAX_HISTORY_PER_KEY
};
