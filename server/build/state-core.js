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
  // Mirror routes/api/repos.js CUSTOM_SLUG_RE so a slug accepted on
  // save is also accepted at slug-resolution time. Dots after the
  // first char allow semver-style ids (v1.0); leading-dot rejected
  // to keep .htaccess-style hidden paths + .. traversal out.
  if (bc.customSlug && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,63}$/.test(bc.customSlug)) {
    return bc.customSlug;
  }
  let slug = bc.branch.replace(/\//g, "__");
  if (bc.baseDir) slug += "--" + bc.baseDir.replace(/\//g, "__");
  return slug;
}

function getBranchDir(owner, repo, bc) {
  return path.join(WORKSPACE, owner + "__" + repo + "__" + branchSlug(bc));
}

// Canonical key for buildStatus / buildLocks / SSE log streams /
// snapshots / thumbnails. Owner+repo are lowercased so a request
// hitting /api/.../Owner/Repo… still resolves to state stored when
// the same repo was added as owner/repo (or vice versa). GitHub
// itself treats owner/repo case-insensitively; this just makes
// the runtime layer agree. Slug stays in its original case
// because it's user-controlled (custom slug) or already
// transformed (auto-slug uses __ for slashes — predictable).
function buildKey(owner, repo, bc) {
  return String(owner).toLowerCase() + "/" + String(repo).toLowerCase() + ":" + branchSlug(bc);
}

// Same canonicalization as buildKey but takes the slug directly —
// for callers that already know the slug (route handlers, API
// endpoints) and don't have the branchConfig at hand. Export both
// so every key construction in the codebase routes through one of
// them rather than reinventing string concat per file.
function keyFromSlug(owner, repo, slug) {
  return String(owner).toLowerCase() + "/" + String(repo).toLowerCase() + ":" + String(slug);
}

// Look up the branchConfig (has .branch, .baseDir, ...) for a given
// owner/repo/slug. buildStatus entries don't carry the git branch name
// themselves — only repos.js's frontend-facing serialization merges it in
// — so anything that needs to check out the *actual* branch (GitHub
// Actions workflows for APK/Android-session builds, which otherwise
// default to checking out the repo's default branch) has to look it up
// here instead.
function findBranchConfig(owner, repo, slug) {
  const { getConfig } = require("../config");
  const config = getConfig();
  const r = (config.repos || []).find((x) =>
    String(x.owner).toLowerCase() === String(owner).toLowerCase() &&
    String(x.repo).toLowerCase() === String(repo).toLowerCase());
  if (!r) return null;
  return (r.activeBranches || []).find((bc) => branchSlug(bc) === slug) || null;
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

// ── Rehydrate from disk on startup ─────────────────────────────────────────
// buildStatus lives in memory; a process restart wipes it. Build artifacts
// remain on disk in workspace/owner__repo__slug/<outputDir>, so without
// rehydration the dashboard reports "Idle / Never built" and the preview
// view shows "AWAITING BUILD" even though /preview/.../  would still serve
// the artifacts. Walk the config + workspace and reconstruct the minimum
// state (status: ready, outputPath, lastBuild from mtime) for every branch
// whose output dir exists.

function rehydrateBuildStatus(config) {
  if (!config || !Array.isArray(config.repos)) return 0;
  let restored = 0;
  // Lazy-require to avoid a circular dep with detect.js consumers.
  let outputSearchPaths;
  try { ({ outputSearchPaths } = require("./detect")); } catch (_) { outputSearchPaths = null; }

  for (const repo of config.repos) {
    for (const bc of (repo.activeBranches || [])) {
      const key = buildKey(repo.owner, repo.repo, bc);
      if (buildStatus[key] && buildStatus[key].status) continue;

      const workDir = getBranchDir(repo.owner, repo.repo, bc);
      if (!fs.existsSync(workDir)) continue;

      // Resolve output dir: explicit branch → repo → language defaults
      const language = bc.language || "auto";
      const candidates = [];
      if (bc.outputDir) candidates.push(bc.outputDir);
      if (repo.outputDir) candidates.push(repo.outputDir);
      if (outputSearchPaths) candidates.push(...outputSearchPaths(language === "auto" ? "nodejs" : language));
      else candidates.push("dist", "build", "out", "web-build", "public");

      let outputPath = null;
      for (const cand of candidates) {
        if (!cand) continue;
        const candPath = path.join(workDir, cand);
        if (fs.existsSync(candPath) && fs.statSync(candPath).isDirectory()) {
          // Sanity: must contain at least one file (avoid hitting an empty
          // build/ dir created mid-flight).
          try {
            if (fs.readdirSync(candPath).length > 0) { outputPath = candPath; break; }
          } catch (_) { /* unreadable — skip */ }
        }
      }
      if (!outputPath) continue;

      const stat = fs.statSync(outputPath);
      buildStatus[key] = {
        status: "ready",
        log: "",
        lastBuild: stat.mtimeMs,
        commitSha: "",
        mode: bc.mode || "static",
        outputPath,
        outputDir: path.relative(workDir, outputPath),
        workDir,
        rehydrated: true
      };
      restored++;
    }
  }
  if (restored) console.log("[build] Rehydrated " + restored + " branch state(s) from disk");
  return restored;
}

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
  keyFromSlug,
  findBranchConfig,
  createLogger,
  rehydrateBuildStatus
};


