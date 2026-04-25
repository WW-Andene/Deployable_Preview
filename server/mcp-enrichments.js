/**
 * mcp-enrichments.js — re-export shim (R6.8).
 *
 * Original 1191-LOC monolith was split into focused modules:
 *   - enrichments/lib.js     — tryRequire / have / missing / status
 *   - enrichments/visual.js  — pixel diff + sharp + ssim + tolerance +
 *                              overlay + image meta + palette
 *   - enrichments/audit.js   — axe + tesseract + lighthouse + html
 *                              validation + retire + csp + cookies +
 *                              robots
 *   - enrichments/parsing.js — css + dom + text diff + linkinator +
 *                              stack + source-map + gzip
 *
 * This shim preserves the legacy import surface (35 exports) so the 30+
 * existing 'require(.../mcp-enrichments)' callers (every browser/* +
 * dv/core + dv/tools/{audit,content,state}) keep working without edit.
 *
 * The original file already lazy-loaded heavy deps via tryRequire, so
 * this split is structural (one concern per file) rather than a perf
 * change.
 */

"use strict";

module.exports = Object.assign(
  {},
  require("./enrichments/lib"),
  require("./enrichments/visual"),
  require("./enrichments/audit"),
  require("./enrichments/parsing")
);
