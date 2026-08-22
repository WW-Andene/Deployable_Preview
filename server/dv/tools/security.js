/**
 * dv/tools/security.js — security_audit tool.
 *
 * Wraps `npm audit --json` and returns a structured summary with stable
 * fields: totals per severity, ranked advisories with title/url/range,
 * fix-available flag. Long-running so cached for 60s.
 */

"use strict";

const dv = require("../core");
const { runAudit } = require("../../security-audit");

dv.defineTool({
  name: "security_audit",
  category: "engine",
  description:
    "Run `npm audit` (production deps only) and return a structured summary: totals " +
    "by severity, ranked advisories with title/range/fix-available/URL. Cached for 60s. " +
    "Use `severity:'high'` to filter to high+critical only.",
  requires: [],
  cache: { ttlMs: 60000 },
  schema: {
    type: "object",
    properties: {
      severity: { type: "string", enum: ["info", "low", "moderate", "high", "critical"], description: "Minimum severity to include (default: info)" },
      timeoutMs: { type: "number", description: "Subprocess timeout (default 30000, max 120000)" }
    }
  },
  async handler(args) {
    const r = await runAudit({ severity: args && args.severity, timeoutMs: args && args.timeoutMs });
    if (!r.ok) {
      return dv.failCode("AUDIT_FAILED", r.error || "npm audit did not produce parseable output", {
        hint: "Verify `npm` is installed and the project's package.json/lock are present."
      });
    }
    return dv.ok(r);
  }
});
