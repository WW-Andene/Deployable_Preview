/**
 * dv/tools/browse.js — observation tools.
 *
 * Everything that looks at the preview without changing it: screenshots,
 * DOM inspection, element geometry, metadata, framework internals,
 * IndexedDB, service workers, and resource timing.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");

const OWNER = { type: "string", description: "Repository owner" };
const REPO  = { type: "string", description: "Repository name" };
const SLUG  = { type: "string", description: "Branch slug" };
const VIEWPORT = {
  width:  { type: "number", description: "Viewport width (default: 1280)" },
  height: { type: "number", description: "Viewport height (default: 720)" }
};

// ── screenshot ────────────────────────────────────────────────────────────

dv.defineTool({
  name: "screenshot",
  category: "browse",
  description: "Take a PNG screenshot of a deployed preview. Returns a PNG image plus viewport metadata. Sessions persist, so repeated calls reuse the same page.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      ...VIEWPORT,
      fullPage: { type: "boolean", description: "Capture the full scrollable page (default: false)" },
      selector: { type: "string", description: "CSS selector to screenshot a specific element" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.takeScreenshot(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.imageWithJson(result.base64, result.mimeType, {
      url: result.url, width: result.width, height: result.height, title: result.title
    });
  }
});

// ── inspect ───────────────────────────────────────────────────────────────

dv.defineTool({
  name: "inspect",
  category: "browse",
  description: "Inspect DOM structure, accessibility tree, and page metadata of a deployed preview. Optionally inspect a specific element by CSS selector.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string", description: "CSS selector to inspect a specific element" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.inspectDOM(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── console_logs ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "console_logs",
  category: "browse",
  description: "Navigate to a deployed preview and capture console logs, page errors, and failed network requests for a specified duration.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      duration: { type: "number", description: "Seconds to capture (default: 3, max: 30)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.captureConsole(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── get_element_rect ──────────────────────────────────────────────────────

dv.defineTool({
  name: "get_element_rect",
  category: "browse",
  description: "Return the bounding box, centre point, visibility, and computed styles for every element matching a CSS selector. Structured data — no screenshot to squint at.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string", description: "CSS selector" },
      ...VIEWPORT
    },
    required: ["owner", "repo", "slug", "selector"]
  },
  async handler(args) {
    const result = await browser.getElementRect(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── dom_query ─────────────────────────────────────────────────────────────

dv.defineTool({
  name: "dom_query",
  category: "browse",
  description: "Parse the live preview HTML (or a supplied HTML string) with cheerio and return elements matching a selector, including attributes and text.",
  requires: [{ kind: "library", name: "cheerio" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      html: { type: "string", description: "Optional HTML input (overrides the live session)" },
      selector: { type: "string", description: "CSS selector (cheerio-supported)" },
      limit: { type: "number", description: "Max matches to return (default: 100)" }
    },
    required: ["selector"]
  },
  async handler(args) {
    const result = await browser.domQueryTool(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── find_all ──────────────────────────────────────────────────────────────

dv.defineTool({
  name: "find_all",
  category: "browse",
  description: "Find every element matching a CSS selector on the live preview and return their bounding boxes, visibility, and a short text preview. Unlike dom_query this includes layout info.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string" },
      limit: { type: "number" },
      ...VIEWPORT
    },
    required: ["owner", "repo", "slug", "selector"]
  },
  async handler(args) {
    const result = await browser.findAll(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── meta ──────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "meta",
  category: "browse",
  description: "Collect every meta tag, Open Graph / Twitter card, canonical link, favicon, hreflang, and JSON-LD structured-data block on the preview page.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getMeta(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── data_attrs ────────────────────────────────────────────────────────────

dv.defineTool({
  name: "data_attrs",
  category: "browse",
  description: "Extract every [data-*] attribute from the preview DOM. Often contains IDs, state, and config not visible in the rendered UI.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getDataAttrs(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── framework_data ────────────────────────────────────────────────────────

dv.defineTool({
  name: "framework_data",
  category: "browse",
  description: "Dump framework state: Next.js __NEXT_DATA__, Nuxt __NUXT__, SvelteKit, Remix, Redux initial state, Vue/React devtools hooks.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getFrameworkData(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── browser_apis ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "browser_apis",
  category: "browse",
  description: "Feature-detect which Web APIs are available on the preview: service workers, WebGL, Bluetooth, FileSystem, WebGPU, SpeechRecognition, etc. Plus the full navigator fingerprint.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getBrowserApis(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── idb_inspect ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "idb_inspect",
  category: "browse",
  description: "Dump IndexedDB databases and object-store names for the preview origin. Useful for finding hidden offline state.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.inspectIndexedDB(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── service_workers ───────────────────────────────────────────────────────

dv.defineTool({
  name: "service_workers",
  category: "browse",
  description: "List service workers active on the preview (Playwright workers + navigator.serviceWorker registrations) with scopes and script URLs.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.listServiceWorkers(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── resource_timing ───────────────────────────────────────────────────────

dv.defineTool({
  name: "resource_timing",
  category: "browse",
  description: "performance.getEntriesByType('resource') for every asset: DNS / TCP / SSL / TTFB / total duration, sorted slowest-first.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getResourceTiming(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});
