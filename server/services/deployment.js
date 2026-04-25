/**
 * services/deployment.js — business logic for deploy/build/stop/cancel.
 *
 * Sits between routes/api/* and core (build/process/config). Encapsulates
 * the recurring "find repo by owner/repo, find branch config by slug,
 * act on it" pattern + returns structured results that map cleanly to
 * HTTP status codes.
 *
 * All functions return either:
 *   { ok: true,  ... }
 *   { ok: false, code: "REPO_NOT_FOUND" | "SLUG_NOT_FOUND" | "BAD_ARGS",
 *                error: string }
 *
 * Routes translate { code } → HTTP status; everything else is straight
 * passthrough. Equally callable from CLI, scheduled jobs, or other
 * services — no Express coupling.
 */

"use strict";

const fs = require("fs");
const { getConfig } = require("../config");
const { buildStatus, branchSlug, deployBranch, cancelBuild, getHistory, appendHistory } = require("../build");
const { runningServers, killServer } = require("../process");
const { loadLog } = require("../logs");

/**
 * Look up a repo + branchConfig by owner/repo/slug. Returned shape lets
 * the caller branch on the failure code or destructure {repo, bc} on
 * success.
 */
function resolveBranch(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const config = getConfig();
  const repoConfig = (config.repos || []).find((r) => r.owner === owner && r.repo === repo);
  if (!repoConfig) return { ok: false, code: "REPO_NOT_FOUND", error: "Repo not found: " + owner + "/" + repo };
  const bc = (repoConfig.activeBranches || []).find((b) => branchSlug(b) === slug);
  if (!bc) return { ok: false, code: "SLUG_NOT_FOUND", error: "Branch config not found for slug: " + slug, availableSlugs: (repoConfig.activeBranches || []).map(branchSlug) };
  return { ok: true, repoConfig, bc };
}

/**
 * Trigger a build for owner/repo/slug.
 */
function triggerBuild(owner, repo, slug) {
  const r = resolveBranch(owner, repo, slug);
  if (!r.ok) return r;
  deployBranch(r.repoConfig, r.bc);
  return {
    ok: true,
    message: (r.bc.mode === "server" ? "Server restart" : "Build") + " started",
    mode: r.bc.mode || "static"
  };
}

/**
 * Cancel an in-flight build (no-op if nothing is building for this key).
 */
function cancel(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const cancelled = cancelBuild(key);
  return cancelled
    ? { ok: true, message: "Build cancelled" }
    : { ok: true, cancelled: false, message: "No active build to cancel" };
}

/**
 * Stop a running server-mode preview. Marks runningServers[key].manualStop
 * so the auto-restart loop doesn't bring it back.
 */
function stopServer(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  if (runningServers[key]) {
    runningServers[key].manualStop = true;
    killServer(key);
  }
  if (buildStatus[key]) buildStatus[key].status = "stopped";
  return { ok: true };
}

/**
 * Read the build status for owner/repo/slug. Returns the literal slot
 * object (not a copy) — callers must not mutate.
 */
function getStatus(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  return { ok: true, status: buildStatus[key] || { status: "idle" } };
}

/**
 * Read the log text for a build (in-memory if available, else from disk
 * via loadLog). Returns "" if neither exists.
 */
function getLog(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const s = buildStatus[key];
  const log = (s && s.log) ? s.log : loadLog(key);
  return { ok: true, log: log || "" };
}

/**
 * Return the latest thumbnail bytes (base64-decoded) + thumbAt timestamp
 * for owner/repo/slug, or { ok: false, code: "NO_THUMB" } if none.
 */
function getThumb(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const s = buildStatus[key];
  if (!s || !s.thumb) return { ok: false, code: "NO_THUMB" };
  return { ok: true, buffer: Buffer.from(s.thumb, "base64"), thumbAt: s.thumbAt || 0 };
}

/**
 * Return the deployment history (newest first) for owner/repo/slug.
 * Each entry: { id, commitSha, timestamp, duration, snapshotDir, mode, by }.
 */
function listHistory(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const history = getHistory(key);
  return { ok: true, history, current: buildStatus[key] && buildStatus[key].outputPath };
}

/**
 * Roll back to a specific history entry. Sets buildStatus[key].outputPath
 * to the snapshot directory and marks the slot ready. Records a "manual"
 * rollback entry in the history so the audit trail is preserved. Does
 * NOT re-run the build — purely points the static server at older bytes.
 *
 * Server-mode previews can't rollback (the snapshot is the static output,
 * not a runnable process); we return BAD_MODE in that case.
 */
function rollback(owner, repo, slug, historyId) {
  if (!owner || !repo || !slug || !historyId) {
    return { ok: false, code: "BAD_ARGS", error: "owner, repo, slug, and historyId required" };
  }
  const key = owner + "/" + repo + ":" + slug;
  const history = getHistory(key);
  const target = history.find((h) => h.id === historyId);
  if (!target) return { ok: false, code: "HISTORY_NOT_FOUND", error: "No history entry with id: " + historyId };
  if (target.mode === "server") {
    return { ok: false, code: "BAD_MODE", error: "Cannot rollback a server-mode preview — re-run the build at the target SHA instead" };
  }
  if (!target.snapshotDir || !fs.existsSync(target.snapshotDir)) {
    return { ok: false, code: "SNAPSHOT_GONE", error: "Snapshot directory missing on disk: " + (target.snapshotDir || "<none>") };
  }
  // Point the live preview at the snapshot.
  if (!buildStatus[key]) buildStatus[key] = {};
  const previousOutput = buildStatus[key].outputPath;
  buildStatus[key].status = "ready";
  buildStatus[key].outputPath = target.snapshotDir;
  buildStatus[key].commitSha = target.commitSha || buildStatus[key].commitSha || "";
  buildStatus[key].lastBuild = Date.now();
  buildStatus[key].rolledBackTo = target.id;
  // Audit: prepend a rollback entry so future "history" listings show
  // the action. Not a snapshot itself (we'd just point at the same dir).
  appendHistory(key, {
    commitSha: target.commitSha || "",
    timestamp: Date.now(),
    duration: 0,
    outputPath: target.snapshotDir,
    snapshotDir: target.snapshotDir,
    mode: "static",
    by: "rollback",
    rolledBackFrom: previousOutput,
    rolledBackToId: target.id
  });
  return { ok: true, message: "Rolled back to " + (target.commitSha || target.id).slice(0, 7), entry: target };
}

function getDiffThumb(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const s = buildStatus[key];
  if (!s || !s.diffThumb) return { ok: false, code: "NO_THUMB" };
  return { ok: true, buffer: Buffer.from(s.diffThumb, "base64"), thumbAt: s.thumbAt || 0 };
}

// Map service code → HTTP status — used by route adapters.
const CODE_TO_STATUS = {
  BAD_ARGS:           400,
  REPO_NOT_FOUND:     404,
  SLUG_NOT_FOUND:     404,
  NO_THUMB:           404,
  HISTORY_NOT_FOUND:  404,
  SNAPSHOT_GONE:      410,
  BAD_MODE:           409
};

module.exports = {
  resolveBranch,
  triggerBuild,
  cancel,
  stopServer,
  getStatus,
  getLog,
  getThumb,
  getDiffThumb,
  listHistory,
  rollback,
  CODE_TO_STATUS
};
