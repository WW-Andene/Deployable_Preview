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
