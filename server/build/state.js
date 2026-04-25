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

module.exports = {
  WORKSPACE,
  MAX_CONCURRENT_BUILDS,
  buildStatus,
  buildLocks,
  countActiveBuilds,
  branchSlug,
  getBranchDir,
  buildKey,
  createLogger
};
