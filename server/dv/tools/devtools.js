/**
 * dv/tools/devtools.js — browser DevTools-console equivalent.
 *
 * page_eval runs arbitrary JavaScript inside a preview page's context,
 * returns the result plus any console output / page errors emitted
 * during evaluation. This is the functional equivalent of typing into
 * Chrome/Firefox DevTools.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const session = require("../session");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

dv.defineTool({
  name: "page_eval",
  category: "devtools",
  description:
    "Run arbitrary JavaScript inside a preview page (like typing into DevTools console). " +
    "Returns the expression's value (serialized), plus any console.* output and page errors " +
    "emitted during evaluation. Supports `await` at the top level — the tool auto-wraps when " +
    "it detects it. Set `captureLogs:false` to skip console capture for cleaner output. " +
    "Good for: probing app state, inspecting globals, reading framework stores, calling methods.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      code: { type: "string", description: "JS expression or statement block to evaluate in the page" },
      await: { type: "boolean", description: "Force async-IIFE wrapping (auto-enabled if code contains 'await')" },
      timeout: { type: "number", description: "Abort after N ms (default 15000, max 60000)" },
      captureLogs: { type: "boolean", description: "Collect console.* during eval (default true)" },
      width:  { type: "number" },
      height: { type: "number" }
    },
    required: ["owner", "repo", "slug", "code"]
  },
  async handler(args) {
    const result = await browser.pageEval(args);
    if (result.error) {
      return dv.failCode("PAGE_EVAL_FAILED", result.error, {
        url: result.url,
        duration: result.duration,
        logs: result.logs,
        errors: result.errors,
        hint: /SyntaxError/i.test(result.error)
          ? "Code has a syntax error — DevTools-console-style expression or statement block expected."
          : /timed out/i.test(result.error)
            ? "Evaluation exceeded timeout. Raise `timeout` or simplify the code."
            : "Check that the preview is running and the selectors/globals you reference exist."
      });
    }
    return dv.ok(result);
  }
});

// ── page_errors ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "page_errors",
  category: "devtools",
  description:
    "Read the always-on runtime error log for a preview session: uncaught JS errors, console.error / console.warn, and failed network requests (since the session was opened). Cheaper than a new console_logs capture. Set `clear: true` to reset the log after reading.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      clear: { type: "boolean", description: "Drop the log after reading (default false)" },
      type:  { type: "string",  enum: ["all", "pageerror", "console.error", "console.warning", "requestfailed"], description: "Optional filter" },
      limit: { type: "number",  description: "Max entries to return (default 100)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const res = session.getSessionErrors(args.owner, args.repo, args.slug, { clear: !!args.clear });
    if (!res.sessionExists) {
      return dv.ok({
        sessionExists: false,
        count: 0,
        errors: [],
        hint: "No session for this preview yet. Take a screenshot or call inspect to open one — error capture starts automatically."
      });
    }
    let list = res.errors;
    if (args.type && args.type !== "all") list = list.filter(function(e){ return e.type === args.type; });
    const limit = Math.max(1, Math.min(Number(args.limit) || 100, 200));
    const shown = list.slice(-limit).map(function(e){ return Object.assign({}, e, { iso: new Date(e.t).toISOString() }); });
    return dv.ok({
      sessionExists: true,
      total: res.errors.length,
      shown: shown.length,
      cleared: !!args.clear,
      errors: shown
    });
  }
});
