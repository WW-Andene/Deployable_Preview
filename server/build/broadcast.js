/**
 * build/broadcast.js — H1 SSE status broadcaster.
 *
 * Subscribers receive every buildStatus state change so the dashboard can
 * show ready/error/building transitions without polling. Listeners are
 * fire-and-forget; throwing in one doesn't affect the others.
 *
 * markStatus(key, patch) is the convenience helper that mutates the
 * slot AND broadcasts in one call. The route SSE handler in
 * routes/api/build-core.js subscribes via onStatusChange.
 *
 * R3: extracted from state.js (which became a re-export shim).
 */

"use strict";

const { buildStatus } = require("./state-core");

const _statusListeners = new Set();

function onStatusChange(cb) {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

function broadcastStatus(key, slot) {
  for (const cb of _statusListeners) {
    try { cb(key, slot); } catch (_) {}
  }
}

// markStatus(key, patch) — mutate the slot AND broadcast in one call.
// Strips heavy fields (thumb base64, diffThumb, full log) from the
// broadcast payload so SSE clients aren't asked to decode 200KB
// images on every keystroke-time transition.
function markStatus(key, patch) {
  if (!buildStatus[key]) buildStatus[key] = {};
  Object.assign(buildStatus[key], patch || {});
  // eslint-disable-next-line no-unused-vars
  const { thumb, diffThumb, log, ...lean } = buildStatus[key];
  broadcastStatus(key, { ...lean, hasThumb: !!buildStatus[key].thumb });
}

module.exports = { onStatusChange, broadcastStatus, markStatus };
