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
  description: "List or search every registered DV tool. Much easier to navigate than the flat MCP tools/list when looking for something specific — pass `search` for a keyword lookup across 100+ tools instead of scanning the full list, or `compact:true` to shave the payload down to name+description (no schemas) when you just need an overview.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Optional: filter to a single category" },
      search: { type: "string", description: "Keyword(s) matched against tool name + description (case-insensitive, any-word-matches). Fastest way to find the right tool without reading the whole list." },
      compact: { type: "boolean", description: "Drop input schemas from the response — just name/category/description. Much smaller payload for a quick overview." }
    }
  },
  async handler(args) {
    args = args || {};
    const shrink = (t) => args.compact
      ? { name: t.name, category: t.category, description: t.description }
      : t;

    if (args.search && String(args.search).trim()) {
      const words = String(args.search).toLowerCase().split(/\s+/).filter(Boolean);
      const all = dv.listTools();
      const scored = [];
      for (const t of all) {
        const hay = (t.name + " " + t.category + " " + t.description).toLowerCase();
        let score = 0;
        for (const w of words) {
          if (t.name.toLowerCase() === w) score += 10;
          else if (t.name.toLowerCase().includes(w)) score += 5;
          else if (hay.includes(w)) score += 1;
        }
        if (score > 0) scored.push({ t, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return dv.ok({
        query: args.search,
        matchCount: scored.length,
        tools: scored.slice(0, 25).map((s) => shrink(s.t))
      });
    }

    const grouped = dv.getToolsByCategory();
    if (args.category) {
      const only = grouped[args.category];
      if (!only) return dv.failCode("BAD_ARGS", "Unknown category: " + args.category, { available: Object.keys(grouped) });
      return dv.ok({ category: args.category, tools: only.map(shrink) });
    }
    const toolsByCategory = {};
    for (const cat of Object.keys(grouped)) toolsByCategory[cat] = grouped[cat].map(shrink);
    return dv.ok({
      categories: Object.keys(grouped).sort(),
      toolsByCategory
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
