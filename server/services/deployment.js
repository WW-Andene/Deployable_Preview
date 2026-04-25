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

const { getConfig } = require("../config");
const { buildStatus, branchSlug, deployBranch, cancelBuild } = require("../build");
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

function getDiffThumb(owner, repo, slug) {
  if (!owner || !repo || !slug) return { ok: false, code: "BAD_ARGS", error: "owner, repo, and slug required" };
  const key = owner + "/" + repo + ":" + slug;
  const s = buildStatus[key];
  if (!s || !s.diffThumb) return { ok: false, code: "NO_THUMB" };
  return { ok: true, buffer: Buffer.from(s.diffThumb, "base64"), thumbAt: s.thumbAt || 0 };
}

// Map service code → HTTP status — used by route adapters.
const CODE_TO_STATUS = {
  BAD_ARGS:        400,
  REPO_NOT_FOUND:  404,
  SLUG_NOT_FOUND:  404,
  NO_THUMB:        404
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
  CODE_TO_STATUS
};
