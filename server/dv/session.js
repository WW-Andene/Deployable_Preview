/**
 * dv/session.js — re-export shim (R6.5).
 *
 * Original 714-LOC monolith was split into focused modules:
 *   - dv/lifecycle.js — browser library, instance, page factory, URL resolve
 *   - dv/pool.js      — page session pool with refcount + TTL eviction
 *   - dv/helpers.js   — frame/coordinate/touch helpers + asset categories
 *
 * This shim preserves the legacy import surface so the 50+ existing
 * `require("../dv/session")` / `require("./dv/session")` callers keep
 * working without churn.
 */

"use strict";

module.exports = Object.assign(
  {},
  require("./lifecycle"),
  require("./pool"),
  require("./helpers")
);
