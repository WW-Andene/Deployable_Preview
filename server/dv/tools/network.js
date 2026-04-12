/**
 * dv/tools/network.js — network tools.
 *
 * Request capture (simple + HAR-style), file downloads, robots.txt,
 * and the universal web_fetch dispatcher.
 */

"use strict";

const dv = require("../core");
const browser = require("../../mcp-browser");
const { webFetch, extractFromHtml } = require("../../web-fetch");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── capture_requests ──────────────────────────────────────────────────────

dv.defineTool({
  name: "capture_requests",
  category: "network",
  description: "Attach a network recorder to the preview session and collect responses for a duration. Good for spotting lazy-loaded assets, XHR, and websocket upgrades.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      duration: { type: "number" },
      maxRequests: { type: "number" },
      reload: { type: "boolean" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.capturePreviewRequests(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── har_capture ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "har_capture",
  category: "network",
  description: "Capture a full HAR-like log (requests, responses, headers, sizes, TLS details) for a duration. Richer than capture_requests — includes request headers, post data, and response security details.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      duration: { type: "number" },
      maxEntries: { type: "number" },
      reload: { type: "boolean" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.captureHar(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── download ──────────────────────────────────────────────────────────────

dv.defineTool({
  name: "download",
  category: "network",
  description: "Trigger a file download in a preview and return the bytes as base64. Use 'click' with a selector for a download button, or 'evaluate' with JS that triggers a download.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      trigger: { type: "string", enum: ["click", "evaluate"] },
      selector: { type: "string" },
      code: { type: "string" },
      timeout: { type: "number" }
    },
    required: ["owner", "repo", "slug", "trigger"]
  },
  async handler(args) {
    const result = await browser.captureDownload(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok({
      suggestedFilename: result.suggestedFilename,
      byteLength: result.byteLength,
      url: result.url,
      base64: result.base64
    });
  }
});

// ── robots ────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "robots",
  category: "network",
  description: "Fetch robots.txt for the preview origin and parse it with robots-parser. Returns crawl-delay, sitemaps, and whether a given URL is allowed for a user agent.",
  requires: [{ kind: "browser" }, { kind: "library", name: "robots-parser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      url: { type: "string" },
      userAgent: { type: "string" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getRobots(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── web_fetch ─────────────────────────────────────────────────────────────

async function runWebFetch(args) {
  args = args || {};
  const useBrowser = !!(args.jsRender || args.captureRequests);
  if (!useBrowser) return webFetch(args);

  const browseResult = await browser.browseUrl({
    url: args.url,
    waitMs: args.waitMs,
    waitUntil: args.waitUntil,
    width: args.width,
    height: args.height,
    filter: args.requestFilter,
    headers: args.headers,
    userAgent: args.userAgent || (args.headers && (args.headers["User-Agent"] || args.headers["user-agent"])),
    returnHtml: true,
    captureConsole: true,
    maxRequests: args.captureRequests ? (args.maxRequests || 500) : 1
  });
  if (browseResult.error) return browseResult;

  const extracted = extractFromHtml(browseResult.html || "", args, browseResult.finalUrl || args.url);
  const result = {
    url: browseResult.url,
    finalUrl: browseResult.finalUrl,
    statusCode: 200,
    contentType: "text/html",
    jsRendered: true,
    title: extracted.title || browseResult.title,
    duration: browseResult.duration,
    ...extracted
  };
  if (args.captureRequests) {
    result.capturedRequests = true;
    result.requestCount = browseResult.requestCount;
    result.requestsByType = browseResult.requestsByType;
    result.requests = browseResult.requests;
    result.requestsTruncated = browseResult.truncated;
    result.consoleLogs = browseResult.consoleLogs;
    result.browseErrors = browseResult.errors;
  }
  return result;
}

function formatWebFetchResult(result) {
  const parts = [];
  parts.push("URL: " + result.url);
  if (result.finalUrl && result.finalUrl !== result.url) parts.push("Final URL: " + result.finalUrl);
  if (result.statusCode != null) parts.push("Status: " + result.statusCode);
  if (result.contentType) parts.push("Content-Type: " + result.contentType);
  if (result.charset && result.charset !== "utf-8") parts.push("Charset: " + result.charset);
  if (result.jsRendered) parts.push("Mode: JS-rendered (headless browser)");
  if (result.duration != null && result.jsRendered) parts.push("Load duration: " + result.duration + "ms");
  if (result.truncated) parts.push("⚠ Response was truncated");
  if (result.title) parts.push("Title: " + result.title);

  if (result.json !== undefined) {
    const json = JSON.stringify(result.json, null, 2);
    parts.push("\n" + (json.length > 100000 ? json.slice(0, 100000) + "\n[... JSON truncated]" : json));
  } else if (result.feed) {
    parts.push("\n--- Feed: " + result.feed.type + (result.feed.title ? " — " + result.feed.title : "") + " ---");
    if (result.feed.description) parts.push(result.feed.description);
    parts.push("(" + result.feed.itemCount + " items)");
    const show = Math.min(result.feed.items.length, 50);
    for (let i = 0; i < show; i++) {
      const it = result.feed.items[i];
      const line = [];
      if (it.title) line.push(it.title);
      if (it.loc) line.push(it.loc);
      if (it.link) line.push("→ " + it.link);
      if (it.pubDate) line.push("(" + it.pubDate + ")");
      parts.push("- " + line.join(" "));
    }
    if (result.feed.items.length > show) parts.push("... and " + (result.feed.items.length - show) + " more items");
  } else if (result.markdown) { parts.push("\n" + result.markdown); }
  else if (result.html) { parts.push("\n" + result.html); }
  else if (result.text) { parts.push("\n" + result.text); }
  else if (result.body) { parts.push("\n" + result.body); }
  else if (result.base64) {
    parts.push("\n[Binary content, " + result.byteLength + " bytes]");
    parts.push(result.base64.slice(0, 2000) + (result.base64.length > 2000 ? "..." : ""));
  }

  if (result.headings && result.headings.length) {
    parts.push("\n--- Outline (" + result.headings.length + ") ---");
    for (const h of result.headings) parts.push("  ".repeat(h.level - 1) + "H" + h.level + ": " + h.text);
  }
  if (result.links && result.links.length) {
    parts.push("\n--- Links (" + result.links.length + ") ---");
    for (const link of result.links.slice(0, 100)) {
      parts.push((link.text ? link.text + " → " : "") + link.href);
    }
  }
  if (result.capturedRequests && result.requests) {
    parts.push("\n--- Network (" + result.requestCount +
               (result.requestsTruncated ? ", truncated" : "") + ") ---");
    if (result.requestsByType) {
      parts.push("By category: " + Object.keys(result.requestsByType).sort().map((k) => k + "=" + result.requestsByType[k]).join(", "));
    }
  }
  return parts.join("\n");
}

dv.defineTool({
  name: "web_fetch",
  category: "network",
  description: [
    "Universal URL fetcher and scraper. Handles HTML, JSON, RSS/Atom, XML sitemaps, text, binary content.",
    "Supports gzip/deflate/brotli/zstd, charset detection, cookies, custom headers, retries on 429/503.",
    "Set jsRender:true to render JavaScript in a headless browser (for SPAs).",
    "Set captureRequests:true to also return every network request the page makes — implies jsRender."
  ].join("\n"),
  requires: [],
  schema: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
      headers: { type: "object" },
      body: {},
      bodyType: { type: "string", enum: ["json", "form", "text"] },
      timeout: { type: "number" },
      retries: { type: "number" },
      maxRedirects: { type: "number" },
      maxSize: { type: "number" },
      userAgent: { type: "string" },
      acceptLanguage: { type: "string" },
      referer: { type: "string" },
      cookies: {},
      format: { type: "string", enum: ["auto", "text", "markdown", "html", "json", "xml", "base64", "raw"] },
      allowBinary: { type: "boolean" },
      parseXml: { type: "boolean" },
      jsonPath: { type: "string" },
      extractText: { type: "boolean" },
      extractLinks: { type: "boolean" },
      extractMeta: { type: "boolean" },
      extractImages: { type: "boolean" },
      extractHeadings: { type: "boolean" },
      selector: { type: "string" },
      readability: { type: "boolean" },
      maxTextLength: { type: "number" },
      jsRender: { type: "boolean" },
      captureRequests: { type: "boolean" },
      waitMs: { type: "number" },
      waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle", "networkidle2"] },
      requestFilter: { type: "object" },
      maxRequests: { type: "number" },
      width: { type: "number" },
      height: { type: "number" }
    },
    required: ["url"]
  },
  async handler(args) {
    const result = await runWebFetch(args);
    if (result.error) return dv.fail(result.error);
    return dv.text(formatWebFetchResult(result));
  }
});

module.exports = { runWebFetch, formatWebFetchResult };
