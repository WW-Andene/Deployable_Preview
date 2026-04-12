/**
 * dv/tools/pages.js — multi-page / popup management.
 *
 * The browser may have multiple tabs open (popups, target=_blank, new
 * windows spawned by a page). These tools list and close them.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");

dv.defineTool({
  name: "list_pages",
  category: "pages",
  description: "List all open pages/tabs (including popups and target=_blank links) in the current browser. Use after an interaction that might open a new window.",
  requires: [{ kind: "browser" }],
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    const result = await browser.listPages();
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

dv.defineTool({
  name: "close_page",
  category: "pages",
  description: "Close a specific page/tab by zero-based index (from list_pages) or by a URL substring match.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      index: { type: "number" },
      urlContains: { type: "string" }
    }
  },
  async handler(args) {
    const result = await browser.closePage(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});
