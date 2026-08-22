// ── Fetch sub-router ─────────────────────────────────────────────────────────
// Web fetch POST endpoint and browse POST endpoint

const express = require("express");
const router = express.Router();

const { webFetch } = require("../../web-fetch");
const { extractFromHtml } = require("../../web-fetch");
const mcpBrowser = require("../../browser");

// Unified dispatcher: plain fetch, JS-rendered, or JS-rendered + network capture
async function dispatchWebFetch(opts) {
  const useBrowser = !!(opts.jsRender || opts.captureRequests);
  if (!useBrowser) return webFetch(opts);

  const browseResult = await mcpBrowser.browseUrl({
    url: opts.url,
    waitMs: opts.waitMs,
    waitUntil: opts.waitUntil,
    width: opts.width,
    height: opts.height,
    filter: opts.requestFilter,
    headers: opts.headers,
    userAgent: opts.userAgent || (opts.headers && (opts.headers["User-Agent"] || opts.headers["user-agent"])),
    returnHtml: true,
    captureConsole: true,
    maxRequests: opts.captureRequests ? (opts.maxRequests || 500) : 1
  });
  if (browseResult.error) return browseResult;
  const extracted = extractFromHtml(browseResult.html || "", opts, browseResult.finalUrl || opts.url);
  const out = {
    url: browseResult.url,
    finalUrl: browseResult.finalUrl,
    statusCode: 200,
    contentType: "text/html",
    jsRendered: true,
    title: extracted.title || browseResult.title,
    duration: browseResult.duration,
    ...extracted
  };
  if (opts.captureRequests) {
    out.capturedRequests = true;
    out.requestCount = browseResult.requestCount;
    out.requestsByType = browseResult.requestsByType;
    out.requests = browseResult.requests;
    out.requestsTruncated = browseResult.truncated;
    out.consoleLogs = browseResult.consoleLogs;
    out.browseErrors = browseResult.errors;
  }
  return out;
}

// POST /api/fetch — full-featured fetch (accepts every webFetch option)
router.post("/fetch", async (req, res) => {
  const opts = req.body || {};
  if (!opts.url) return res.status(400).json({ error: "url parameter is required" });
  try {
    const result = await dispatchWebFetch(opts);
    if (result.error && !result.statusCode) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fetch?url=... — quick shortcut
router.get("/fetch", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "url query parameter is required" });
  const opts = {
    url,
    format:       req.query.format,
    extractText:  req.query.text !== "false",
    extractLinks: req.query.links === "true",
    extractMeta:  req.query.meta === "true",
    extractImages: req.query.images === "true",
    extractHeadings: req.query.headings === "true",
    readability:  req.query.readability === "true",
    selector:     req.query.selector,
    jsonPath:     req.query.jsonPath,
    parseXml:     req.query.parseXml === "true",
    allowBinary:  req.query.allowBinary === "true",
    userAgent:    req.query.userAgent,
    referer:      req.query.referer,
    acceptLanguage: req.query.acceptLanguage,
    jsRender:     req.query.jsRender === "true",
    captureRequests: req.query.captureRequests === "true",
    waitMs:       req.query.waitMs ? parseInt(req.query.waitMs, 10) : undefined,
    maxTextLength: req.query.maxTextLength ? parseInt(req.query.maxTextLength, 10) : undefined
  };
  if (req.query.resourceTypes || req.query.extensions || req.query.urlPattern) {
    opts.requestFilter = {};
    if (req.query.resourceTypes) opts.requestFilter.resourceTypes = String(req.query.resourceTypes).split(",").map((s) => s.trim()).filter(Boolean);
    if (req.query.extensions)    opts.requestFilter.extensions    = String(req.query.extensions).split(",").map((s) => s.trim()).filter(Boolean);
    if (req.query.urlPattern)    opts.requestFilter.urlPattern    = req.query.urlPattern;
  }
  try {
    const result = await dispatchWebFetch(opts);
    if (result.error && !result.statusCode) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
