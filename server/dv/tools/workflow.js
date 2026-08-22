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
            label:     { type: "string", description: "Human-readable label in the transcript" },
            parallel:  { type: "boolean", description: "Run concurrently with adjacent parallel:true steps (Promise.all) instead of waiting for the previous step. Big latency win for independent read-only calls (e.g. several screenshots/audits at once). Steps in the same parallel batch can't see each other's results via `as`/`last` — only what was bound before the batch started." }
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

    // Evaluate gate + args for one step against the `results`/`last` snapshot
    // as of the start of its batch, then run it. Returns a transcript entry
    // plus the bits needed to commit it into `results`/`last` afterwards.
    async function runOne(step, i, snapshotResults, snapshotLast) {
      const label = step.label || step.as || step.tool || ("step_" + i);

      if (step.when) {
        let passed;
        try { passed = !!evalExpr(step.when, snapshotResults, snapshotLast); }
        catch (e) {
          return { index: i, label, tool: step.tool, ok: false, skipped: false, error: "when-eval: " + e.message, hardFail: (step.onError || "abort") === "abort", failReason: "when-eval failure" };
        }
        if (!passed) return { index: i, label, tool: step.tool, skipped: true, reason: "when was falsy" };
      }

      let finalArgs;
      if (typeof step.argsFrom === "string" && step.argsFrom.trim()) {
        try { finalArgs = evalExpr(step.argsFrom, snapshotResults, snapshotLast); }
        catch (e) {
          return { index: i, label, tool: step.tool, ok: false, error: "argsFrom-eval: " + e.message, hardFail: (step.onError || "abort") === "abort", failReason: "argsFrom failure" };
        }
      } else {
        finalArgs = Object.assign({}, step.args || {});
      }

      const tStart = Date.now();
      let r;
      try { r = await dv.callTool(step.tool, finalArgs || {}); }
      catch (e) { r = dv.failCode("INTERNAL", e.message); }
      const ok = !r.isError;

      const textBlocks = (r.content || []).filter(function(x){ return x.type === "text"; }).map(function(x){ return x.text; });
      let parsed = null;
      if (textBlocks.length) {
        try { parsed = JSON.parse(textBlocks[0]); } catch (_) { parsed = textBlocks[0]; }
      }

      return {
        index: i,
        label,
        tool: step.tool,
        ok,
        durationMs: Date.now() - tStart,
        textPreview: textBlocks[0] ? String(textBlocks[0]).slice(0, 300) : null,
        images: (r.content || []).filter(function(x){ return x.type === "image"; }).length,
        error: ok ? undefined : parsed && parsed.message ? parsed.message : (textBlocks[0] || "").slice(0, 400),
        hardFail: !ok && (step.onError || "abort") === "abort",
        failReason: !ok ? (parsed && parsed.message ? parsed.message : (textBlocks[0] || "").slice(0, 400)) || ("step " + i + " failed") : null,
        as: step.as,
        parsed
      };
    }

    function commit(entry) {
      // eslint-disable-next-line no-unused-vars
      const { as, parsed, hardFail, failReason, ...pub } = entry;
      transcript.push(pub);
      if (!entry.skipped) last = { ok: entry.ok, result: parsed, tool: entry.tool };
      if (as) results[as] = parsed;
      if (entry.hardFail) { aborted = true; abortReason = failReason; }
    }

    for (let i = 0; i < steps.length && i < maxSteps && !aborted;) {
      // Batch consecutive parallel:true steps together (min batch size 2 —
      // a lone parallel:true step just runs normally).
      let j = i;
      if (steps[i] && steps[i].parallel) {
        while (j + 1 < steps.length && j + 1 < maxSteps && steps[j + 1] && steps[j + 1].parallel) j++;
      }

      if (j > i) {
        const snapResults = Object.assign({}, results);
        const snapLast = last;
        const batch = steps.slice(i, j + 1);
        const entries = await Promise.all(batch.map((step, k) => runOne(step, i + k, snapResults, snapLast)));
        for (const entry of entries) commit(entry);
        i = j + 1;
      } else {
        const entry = await runOne(steps[i], i, results, last);
        commit(entry);
        i++;
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
