/**
 * dv/tools/workflow.js — dv_workflow, a scripted runner for named tool calls.
 *
 * Elevates sandbox_exec from "batch" to "scripted" by letting Claude
 * reference results of earlier steps in later steps:
 *
 *   {
 *     "steps": [
 *       { "as": "state",  "tool": "dv_state" },
 *       { "as": "shot",   "tool": "screenshot", "args": { "owner": "me", ... },
 *         "when": "results.state.totals.ready > 0" },
 *       { "tool": "get_last_error", "args": { ... }, "when": "!last.ok" }
 *     ]
 *   }
 *
 * Each step can:
 *   - bind its result to `as` (available in later conditions and args)
 *   - gate itself on `when` (JS expression with `results` + `last` in scope)
 *   - use an `argsFrom` expression that computes args from prior results
 *   - choose `onError: "continue" | "abort"` (default abort)
 */

"use strict";

const dv = require("../core");

dv.defineTool({
  name: "dv_workflow",
  category: "sandbox",
  description:
    "Run a scripted sequence of tool calls. Each step can bind its result " +
    "(`as`), gate itself (`when` — JS expression with `results`, `last` in scope), " +
    "compute args from earlier results (`argsFrom`), and choose onError policy. " +
    "Returns a transcript with per-step {ok, durationMs, textPreview, error?}.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "Ordered list of steps.",
        items: {
          type: "object",
          properties: {
            tool:      { type: "string" },
            args:      { type: "object" },
            argsFrom:  { type: "string", description: "JS expression returning the args object; takes precedence over `args` when both set" },
            as:        { type: "string", description: "Bind result to results.<name> for later steps" },
            when:      { type: "string", description: "JS expression that must be truthy for this step to run" },
            onError:   { type: "string", enum: ["continue", "abort"], description: "Default: abort" },
            label:     { type: "string", description: "Human-readable label in the transcript" }
          },
          required: ["tool"]
        }
      },
      initial: { type: "object", description: "Seed values merged into the `results` namespace before step 0" },
      maxSteps: { type: "number", description: "Safety cap (default 40)" }
    },
    required: ["steps"]
  },
  async handler(args) {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    if (!steps.length) {
      return dv.failCode("BAD_ARGS", "dv_workflow requires a non-empty `steps` array");
    }
    const maxSteps = Math.max(1, Math.min(Number(args.maxSteps) || 40, 80));
    const results = Object.assign({}, args.initial || {});
    let last = null;
    const transcript = [];
    let aborted = false, abortReason = null;

    for (let i = 0; i < steps.length && i < maxSteps && !aborted; i++) {
      const step = steps[i] || {};
      const label = step.label || step.as || step.tool || ("step_" + i);

      // Gate
      if (step.when) {
        let passed;
        try { passed = !!evalExpr(step.when, results, last); }
        catch (e) {
          transcript.push({ index: i, label, tool: step.tool, ok: false, skipped: false, error: "when-eval: " + e.message });
          if ((step.onError || "abort") === "abort") { aborted = true; abortReason = "when-eval failure"; break; }
          continue;
        }
        if (!passed) { transcript.push({ index: i, label, tool: step.tool, skipped: true, reason: "when was falsy" }); continue; }
      }

      // Args
      let finalArgs;
      if (typeof step.argsFrom === "string" && step.argsFrom.trim()) {
        try { finalArgs = evalExpr(step.argsFrom, results, last); }
        catch (e) {
          transcript.push({ index: i, label, tool: step.tool, ok: false, error: "argsFrom-eval: " + e.message });
          if ((step.onError || "abort") === "abort") { aborted = true; abortReason = "argsFrom failure"; break; }
          continue;
        }
      } else {
        finalArgs = Object.assign({}, step.args || {});
      }

      const tStart = Date.now();
      let r;
      try { r = await dv.callTool(step.tool, finalArgs || {}); }
      catch (e) { r = dv.failCode("INTERNAL", e.message); }
      const ok = !r.isError;

      // Parse first text block for inclusion in `results` (JSON if possible).
      const textBlocks = (r.content || []).filter(function(x){ return x.type === "text"; }).map(function(x){ return x.text; });
      let parsed = null;
      if (textBlocks.length) {
        try { parsed = JSON.parse(textBlocks[0]); } catch (_) { parsed = textBlocks[0]; }
      }

      const entry = {
        index: i,
        label,
        tool: step.tool,
        ok,
        durationMs: Date.now() - tStart,
        textPreview: textBlocks[0] ? String(textBlocks[0]).slice(0, 300) : null,
        images: (r.content || []).filter(function(x){ return x.type === "image"; }).length,
        error: ok ? undefined : parsed && parsed.message ? parsed.message : (textBlocks[0] || "").slice(0, 400)
      };
      transcript.push(entry);

      last = { ok, result: parsed, tool: step.tool };
      if (step.as) results[step.as] = parsed;

      if (!ok && (step.onError || "abort") === "abort") {
        aborted = true;
        abortReason = entry.error || ("step " + i + " failed");
        break;
      }
    }

    return dv.ok({
      totalSteps: steps.length,
      ran: transcript.filter(function(t){ return !t.skipped; }).length,
      skipped: transcript.filter(function(t){ return t.skipped; }).length,
      succeeded: transcript.filter(function(t){ return t.ok; }).length,
      failed: transcript.filter(function(t){ return t.ok === false; }).length,
      aborted,
      abortReason,
      transcript,
      results: summarizeResults(results)
    });
  }
});

// Safely-ish evaluate a workflow expression. Only `results` and `last` are
// in scope — no Function global, no module ref. The recipe author is the
// caller (Claude or a human writing MCP input), which is already
// privileged; this restriction is about ergonomics, not sandboxing.
function evalExpr(expr, results, last) {
  // eslint-disable-next-line no-new-func
  const fn = new Function("results", "last", '"use strict"; return (' + expr + ");");
  return fn(results, last);
}

// Produce a lightweight summary of the results namespace for the response
// (full values can be hundreds of KB — only keep sizes + preview strings).
function summarizeResults(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v === null || typeof v !== "object") { out[k] = v; continue; }
    if (Array.isArray(v)) { out[k] = { __type: "array", length: v.length }; continue; }
    const keys = Object.keys(v);
    out[k] = { __type: "object", keys: keys.slice(0, 20), keyCount: keys.length };
  }
  return out;
}
