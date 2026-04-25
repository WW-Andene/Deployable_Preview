/**
 * dv/tools/engine.js — self-introspection tools.
 *
 * Lets Claude (and humans) ask the engine what it can do, how it's
 * configured, and which optional libraries are installed.
 */

"use strict";

const dv = require("../core");

dv.defineTool({
  name: "dv_status",
  category: "engine",
  description: "Return the DeployView engine's status: tool count, category breakdown, browser availability, Groq authorization, and per-library install status. Use first to see what's actually available on this host.",
  requires: [],
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    return dv.ok(dv.status());
  }
});

dv.defineTool({
  name: "dv_tools",
  category: "engine",
  description: "List every registered DV tool grouped by category. Much easier to navigate than the flat MCP tools/list when looking for something specific.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Optional: filter to a single category" }
    }
  },
  async handler(args) {
    const grouped = dv.getToolsByCategory();
    if (args && args.category) {
      const only = grouped[args.category];
      if (!only) return dv.fail("Unknown category: " + args.category, { available: Object.keys(grouped) });
      return dv.ok({ category: args.category, tools: only });
    }
    return dv.ok({
      categories: Object.keys(grouped).sort(),
      toolsByCategory: grouped
    });
  }
});

// ── dv_toolbox ────────────────────────────────────────────────────────────
// Workflow-oriented view of the tool registry. Groups the flat category
// list into the phases of a typical Claude session:
//   discover → observe → interact → measure → compare → capture → analyze
//            → codec → devtools → deploy → sandbox → engine
// Useful as a first call in any new task: "what should I reach for next?"

const WORKFLOW = [
  { phase: "discover",  desc: "Find what's deployed and what you can run",  categories: ["deploy", "engine"], pick: ["list_previews", "dv_state", "dv_status", "dv_tools", "dv_toolbox"] },
  { phase: "observe",   desc: "See the page without touching it",          categories: ["browse", "pages"],    pick: ["screenshot", "inspect", "console_logs", "list_pages"] },
  { phase: "interact",  desc: "Type, click, scroll, drag",                 categories: ["interact"],           pick: ["click", "type", "scroll", "hover"] },
  { phase: "measure",   desc: "Exact geometry, pixels, distances",         categories: ["visual"],             pick: ["get_pixel_color", "measure", "get_element_rect"] },
  { phase: "compare",   desc: "Diff between branches or moments in time",   categories: ["visual"],             pick: ["screenshot_diff", "compare_branches", "visual_similarity", "tolerance_diff"] },
  { phase: "capture",   desc: "Record what the app does over the network", categories: ["network"],            pick: ["capture_requests", "har_capture", "web_fetch", "download"] },
  { phase: "analyze",   desc: "Accessibility, perf, structure, state",     categories: ["audit", "state", "content"], pick: ["accessibility_tree", "lighthouse", "perf_vitals", "find_all", "get_coverage", "storage"] },
  { phase: "codec",     desc: "Decode, convert, classify, sniff",          categories: ["codec"],              pick: ["decode", "convert_format", "lang_detect", "file_sniff", "structure_analyze"] },
  { phase: "devtools",  desc: "Run JS inside the page (console eval)",      categories: ["devtools"],           pick: ["page_eval"] },
  { phase: "deploy",    desc: "Trigger builds, check logs, restart servers",categories: ["deploy"],             pick: ["trigger_build", "build_status", "get_build_log", "get_last_error", "deploy_and_verify"] },
  { phase: "batch",     desc: "Do many things in one round-trip",          categories: ["browse", "visual", "deploy"], pick: ["screenshot_multi", "compare_branches", "dv_state"] }
];

dv.defineTool({
  name: "dv_toolbox",
  category: "engine",
  description: "Workflow-oriented view of the toolbox: returns the DV tools grouped by the phase of a typical task (discover → observe → interact → measure → compare → capture → analyze → codec → devtools → deploy). Ideal as a first call to know which tool to reach for.",
  requires: [],
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    const all = dv.listTools();
    const have = new Set(all.map(function(t){ return t.name; }));
    const byCat = {};
    for (const t of all) (byCat[t.category] = byCat[t.category] || []).push(t.name);
    return dv.ok({
      phases: WORKFLOW.map(function(w) {
        const catTools = [];
        for (const c of w.categories) (byCat[c] || []).forEach(function(n){ if (!catTools.includes(n)) catTools.push(n); });
        const featured = w.pick.filter(function(n){ return have.has(n); });
        return {
          phase: w.phase,
          description: w.desc,
          featured,
          allInCategories: catTools.sort()
        };
      }),
      hint: "Start with `dv_state` to see what's deployed, then `screenshot` or `page_eval` to observe."
    });
  }
});
