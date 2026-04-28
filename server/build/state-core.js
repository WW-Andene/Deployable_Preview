/**
 * build/state-core.js — mutable runtime state + key/path helpers + logger.
 *
 * Owns:
 *   - WORKSPACE root + MAX_CONCURRENT_BUILDS knob
 *   - In-memory state: buildStatus, buildLocks
 *   - Key / path helpers: branchSlug, getBranchDir, buildKey
 *   - createLogger factory (binds log strings to buildStatus[key].log)
 *   - SSOT prune subscriber: drop orphan buildStatus entries on save
 *
 * Pure with respect to subprocesses, browsers, and disk I/O outside
 * WORKSPACE.
 *
 * R3: extracted from state.js (which became a re-export shim).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { broadcastLog } = require("../logs");

const WORKSPACE = path.join(__dirname, "..", "..", "workspace");
if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS, 10) || 4;

// Single source of truth for "what's the build doing right now".
const buildStatus = {};
const buildLocks  = {};   // prevents concurrent builds for the same key

function countActiveBuilds() {
  let count = 0;
  for (const k in buildLocks) { if (buildLocks[k]) count++; }
  return count;
}

// queueAhead(key) — how many other keys are currently queued AND were
// queued before this one. Returns 0 if the key isn't queued or has no
// queuedAt timestamp. Approximate (the queue itself isn't an array) but
// gives the dashboard something concrete to show instead of bare "Queued".
function queueAhead(key) {
  const slot = buildStatus[key];
  if (!slot || slot.status !== "queued" || !slot.queuedAt) return 0;
  let ahead = 0;
  for (const k in buildStatus) {
    if (k === key) continue;
    const s = buildStatus[k];
    if (s && s.status === "queued" && s.queuedAt && s.queuedAt < slot.queuedAt) ahead++;
  }
  return ahead;
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
  queueAhead,
  branchSlug,
  getBranchDir,
  buildKey,
  createLogger
};
