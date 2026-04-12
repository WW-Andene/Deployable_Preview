/**
 * dv/tools/audit.js — audits and metrics.
 *
 * axe-core accessibility, Lighthouse, performance metrics, web-vitals,
 * JS/CSS code coverage, HTML validation, CSS specificity, computed
 * styles with structural diff.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const enrich = require("../../mcp-enrichments");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── accessibility ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "accessibility",
  category: "audit",
  description: "Run a full axe-core WCAG accessibility audit. Returns structured violations grouped by rule with node targets, HTML snippets, and impact levels.",
  requires: [{ kind: "browser" }, { kind: "library", name: "axe-core" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.runAccessibility(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── lighthouse ────────────────────────────────────────────────────────────

dv.defineTool({
  name: "lighthouse",
  category: "audit",
  description: "Run a full Lighthouse audit (performance / accessibility / best-practices / SEO). Takes ~15–30s. Returns category scores, key metrics, and notable failing audits.",
  requires: [{ kind: "library", name: "lighthouse" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      categories: { type: "array", items: { type: "string" } }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.runLighthouseAudit(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── performance ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "performance",
  category: "audit",
  description: "Collect performance metrics for a preview: navigation timing, paint timings, resource counts by type, total transfer size, heap memory if available.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      reload: { type: "boolean" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.performanceMetrics(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── vitals ────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "vitals",
  category: "audit",
  description: "Inject web-vitals into the preview and collect CLS, LCP, INP, FCP, TTFB. Returns per-metric value + rating. Requires web-vitals (bundled or CDN).",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      waitMs: { type: "number", description: "How long to let metrics accumulate (default: 4000)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getWebVitals(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── code_coverage ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "code_coverage",
  category: "audit",
  description: "Start JS + CSS coverage on the preview, optionally reload, wait for a duration, then return per-URL usage percentages. Playwright-native.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      reload: { type: "boolean" },
      waitMs: { type: "number" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getCodeCoverage(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── validate_html ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "validate_html",
  category: "audit",
  description: "Run the W3C Nu HTML validator on the live preview, a supplied HTML string, or a URL. Returns errors and warnings with line/column info.",
  requires: [{ kind: "library", name: "html-validator" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      html: { type: "string" },
      url:  { type: "string" }
    }
  },
  async handler(args) {
    let input = args.html || args.url || null;
    if (!input && args.owner && args.repo && args.slug) {
      const r = await browser.interact({
        owner: args.owner, repo: args.repo, slug: args.slug,
        action: "evaluate", value: "return document.documentElement.outerHTML;"
      });
      if (r && r.returnValue != null) {
        try { input = JSON.parse(r.returnValue); }
        catch (_) { input = r.returnValue; }
      }
    }
    if (!input) return dv.fail("html, url, or (owner, repo, slug) required");
    const result = await enrich.validateHtml(input);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── css_specificity ───────────────────────────────────────────────────────

dv.defineTool({
  name: "css_specificity",
  category: "audit",
  description: "Compute CSS specificity for a selector (A,B,C,D tuple) via the specificity package. Useful for debugging override conflicts.",
  requires: [{ kind: "library", name: "specificity" }],
  schema: {
    type: "object",
    properties: { selector: { type: "string" } },
    required: ["selector"]
  },
  async handler(args) {
    const result = enrich.cssSpecificity(args.selector);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── computed_styles ───────────────────────────────────────────────────────

dv.defineTool({
  name: "computed_styles",
  category: "audit",
  description: "Get the computed style map for an element. Pass compareTo to diff against another element — css-tree compares values structurally so '1rem' and '16px' register as equal.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string" },
      compareTo: { type: "string" },
      properties: { type: "array", items: { type: "string" } }
    },
    required: ["owner", "repo", "slug", "selector"]
  },
  async handler(args) {
    const result = await browser.getComputedStyles(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});
