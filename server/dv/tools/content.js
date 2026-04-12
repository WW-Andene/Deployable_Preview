/**
 * dv/tools/content.js — text, OCR, links, and runtime utilities.
 *
 * OCR (Tesseract or Groq), text diffs, text analysis, broken-link
 * crawling, stack-trace parsing, source-map unminify, CSP validation,
 * JS vulnerability scanning.
 */

"use strict";

const dv = require("../core");
const browser = require("../../mcp-browser");
const enrich = require("../../mcp-enrichments");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── ocr ───────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "ocr",
  category: "content",
  description: "Read text from a preview screenshot. Two engines: 'tesseract' (local, needs tesseract.js) or 'groq' (vision model, faster + often more accurate — needs GROQ_API_KEY). The primary real-world use is the Whispering Wishes app's OCR feature.",
  // Note: we intentionally don't hard-require a library here — the engine
  // dispatcher inside browser.runOCRDispatch picks tesseract or groq and
  // reports a clean error if the chosen backend isn't available.
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      engine: { type: "string", enum: ["tesseract", "groq"] },
      model: { type: "string" },
      selector: { type: "string" },
      x: { type: "number" }, y: { type: "number" },
      width: { type: "number" }, height: { type: "number" },
      fullPage: { type: "boolean" },
      lang: { type: "string" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.runOCRDispatch(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok({
      text: result.text,
      confidence: result.confidence,
      wordCount: result.wordCount,
      lang: result.lang,
      url: result.url,
      engine: result.engine,
      wordsSample: (result.words || []).slice(0, 50)
    });
  }
});

// ── text_diff ─────────────────────────────────────────────────────────────

dv.defineTool({
  name: "text_diff",
  category: "content",
  description: "Structured text diff between two strings. Modes: chars, words, sentences, lines (default). Returns per-part add/remove breakdown.",
  requires: [{ kind: "library", name: "diff" }],
  schema: {
    type: "object",
    properties: {
      a: { type: "string" },
      b: { type: "string" },
      mode: { type: "string", enum: ["chars", "words", "sentences", "lines"] }
    },
    required: ["a", "b"]
  },
  async handler(args) {
    const result = enrich.textDiff(args.a, args.b, args.mode);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── text_analysis ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "text_analysis",
  category: "content",
  description: "Tokenize text, count sentences/words, detect unique vocabulary, and run AFINN sentiment scoring via the natural package.",
  requires: [{ kind: "library", name: "natural" }],
  schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"]
  },
  async handler(args) {
    const result = enrich.textAnalysis(args.text);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── broken_links ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "broken_links",
  category: "content",
  description: "Crawl the preview for broken links using linkinator. Returns links that failed with status codes.",
  requires: [{ kind: "library", name: "linkinator" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      recurse: { type: "boolean" },
      concurrency: { type: "number" },
      timeout: { type: "number" },
      skip: { type: "array", items: { type: "string" } }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const pvPath = "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/";
    const port = process.env.PORT || 3000;
    const fullUrl = "http://127.0.0.1:" + port + pvPath;
    const result = await enrich.scanBrokenLinks(fullUrl, {
      recurse: args.recurse,
      concurrency: args.concurrency,
      timeout: args.timeout,
      skip: args.skip
    });
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── stack_trace ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "stack_trace",
  category: "content",
  description: "Parse a raw JavaScript stack trace into structured frames (function, file, line, col) using error-stack-parser.",
  requires: [{ kind: "library", name: "error-stack-parser" }],
  schema: {
    type: "object",
    properties: { stack: { type: "string" } },
    required: ["stack"]
  },
  async handler(args) {
    const result = enrich.parseStackTrace(args.stack);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── unminify ──────────────────────────────────────────────────────────────

dv.defineTool({
  name: "unminify",
  category: "content",
  description: "Resolve a minified JS line/col back to the original source using a supplied source-map JSON.",
  requires: [{ kind: "library", name: "source-map" }],
  schema: {
    type: "object",
    properties: {
      lineNumber: { type: "number" },
      columnNumber: { type: "number" },
      sourceMap: {}
    },
    required: ["lineNumber", "columnNumber", "sourceMap"]
  },
  async handler(args) {
    const sm = typeof args.sourceMap === "string" ? JSON.parse(args.sourceMap) : args.sourceMap;
    const result = await enrich.unminifyFrame(
      { lineNumber: args.lineNumber, columnNumber: args.columnNumber },
      sm
    );
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── csp_check ─────────────────────────────────────────────────────────────

dv.defineTool({
  name: "csp_check",
  category: "content",
  description: "Parse a Content-Security-Policy header and report directives + common issues (unsafe-inline / unsafe-eval / missing default-src).",
  requires: [{ kind: "library", name: "csp-parse" }],
  schema: {
    type: "object",
    properties: { header: { type: "string" } },
    required: ["header"]
  },
  async handler(args) {
    const result = enrich.cspCheck(args.header);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── vuln_scan ─────────────────────────────────────────────────────────────

dv.defineTool({
  name: "vuln_scan",
  category: "content",
  description: "Scan JS library fingerprints for known vulnerabilities using retire.js. Pass an array of { path, url, content } entries — e.g. gathered from capture_requests.",
  requires: [{ kind: "library", name: "retire" }],
  schema: {
    type: "object",
    properties: {
      fingerprints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            url:  { type: "string" }
          }
        }
      }
    },
    required: ["fingerprints"]
  },
  async handler(args) {
    const result = enrich.vulnScan(args.fingerprints);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});
