/**
 * build.js — re-export shim (R6.6).
 *
 * Original 745-LOC monolith was split into focused modules:
 *   - build/state.js     — state, key/path helpers, createLogger, SSOT prune
 *   - build/detect.js    — language + pygame detection + per-language defaults
 *   - build/pipeline.js  — updateRepo, resolveWorkDir, installDeps (shared)
 *   - build/thumb.js     — post-build thumbnail capture + diff + LRU
 *   - build/executor.js  — buildBranch (static-build path)
 *   - build/server.js    — startServer + deployBranch + cancelBuild
 *
 * This shim preserves the legacy import surface so existing
 * `require("./build")` / `require("../build")` callers (routes, dv tools,
 * mcp.js, index.js) keep working without churn.
 */

"use strict";

const state    = require("./build/state");
const detect   = require("./build/detect");
const thumb    = require("./build/thumb");
const executor = require("./build/executor");
const srv      = require("./build/server");

module.exports = Object.assign(
  {},
  state,
  detect,
  thumb,
  executor,
  srv
);
