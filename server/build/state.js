/**
 * build/state.js — re-export shim (R3).
 *
 * The original 303-LOC mix-of-concerns was split into focused modules:
 *   - state-core.js  → mutable state, key helpers, createLogger, SSOT prune
 *   - broadcast.js   → SSE status broadcaster (onStatusChange/markStatus)
 *   - history.js     → deployment history, snapshots, notes, comments, tags,
 *                      directory-size walk
 *
 * This shim preserves the legacy `require("./state")` import surface so
 * callers (executor.js, server.js, scanner.js, plus the routes layer)
 * keep working without churn.
 */

"use strict";

module.exports = Object.assign(
  {},
  require("./state-core"),
  require("./broadcast"),
  require("./history")
);
