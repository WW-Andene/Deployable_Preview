/**
 * dv/tools/network.js — network tools.
 *
 * Request capture (simple + HAR-style), file downloads, robots.txt,
 * and the universal web_fetch dispatcher.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const { webFetch, extractFromHtml } = require("../../web-fetch");
const webFetchCache = require("./web-fetch-cache");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── capture_requests ──────────────────────────────────────────────────────

dv.defineTool({
  name: "capture_requests",
  category: "network",
  description: "Attach a network recorder to the preview session and collect responses for a duration. Good for spotting lazy-loaded assets, XHR, and websocket upgrades. Set summaryOnly:true for just counts + top URLs (token-efficient).",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      duration: { type: "number" },
      maxRequests: { type: "number" },
      reload: { type: "boolean" },
      summaryOnly: { type: "boolean", description: "Return only counts + top 20 failing/slow URLs — drops full request list" },
      filter: { type: "string", enum: ["all", "failing", "slow", "thirdParty"], description: "Post-filter the request list" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.capturePreviewRequests(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(summarizeNetwork(result, args));
  }
});

// ── har_capture ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "har_capture",
  category: "network",
  description: "Capture a full HAR-like log (requests, responses, headers, sizes, TLS details) for a duration. Richer than capture_requests — includes request headers, post data, and response security details. Set summaryOnly:true to skip headers/TLS and drop most requests.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      duration: { type: "number" },
      maxEntries: { type: "number" },
      reload: { type: "boolean" },
      summaryOnly: { type: "boolean", description: "Drop headers + TLS + post data, return top 20 by duration" },
      filter: { type: "string", enum: ["all", "failing", "slow", "thirdParty"] }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.captureHar(args);
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(summarizeNetwork(result, args));
  }
});

// ── download ──────────────────────────────────────────────────────────────

dv.defineTool({
  name: "download",
  category: "network",
  description: "Trigger a file download in a preview and return the bytes as base64. Use 'click' with a selector for a download button, or 'evaluate' with JS that triggers a download. Set summaryOnly:true to skip the base64 body and only return filename + size.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      trigger: { type: "string", enum: ["click", "evaluate"] },
      selector: { type: "string" },
      code: { type: "string" },
      timeout: { type: "number" },
      summaryOnly: { type: "boolean", description: "Omit base64 body — return only filename, size, url" }
    },
    required: ["owner", "repo", "slug", "trigger"]
  },
  async handler(args, ctx) {
    // Forward MCP progress callback so captureDownload can heartbeat
    // every few seconds — this keeps client-side timeouts (Claude Desktop's
    // 60 s default) from killing slow downloads.
    const result = await browser.captureDownload(Object.assign({}, args, {
      onProgress: ctx && ctx.progress
    }));
    if (result.error) return dv.failFromBrowser(result);
    const out = {
      suggestedFilename: result.suggestedFilename,
      byteLength: result.byteLength,
      url: result.url
    };
    if (!args.summaryOnly) out.base64 = result.base64;
    return dv.ok(out);
  }
});

// ── helpers ───────────────────────────────────────────────────────────────

// Collapse requests that hit the same path (query string stripped) + method
// into groups, so a poll/pagination pattern (50 near-identical XHRs to
// /api/items?page=1, ?page=2, ...) reads as one line instead of 50 — this
// is exactly the signal that points at "here's the API endpoint behind the
// widget", which is the whole reason captureRequests/har_capture exist.
// Purely additive: existing `requests`/`entries`/`top` fields are untouched.
function groupSimilarRequests(list) {
  const groups = new Map();
  for (const r of list) {
    const url = r.url || (r.request && r.request.url) || "";
    const method = r.method || (r.request && r.request.method) || "GET";
    let path = url;
    try { const u = new URL(url); path = u.origin + u.pathname; } catch (_) {}
    const key = method + " " + path;
    if (!groups.has(key)) groups.set(key, { method, path, count: 0, sampleUrl: url, statuses: new Set() });
    const g = groups.get(key);
    g.count++;
    const status = r.status || (r.response && r.response.status) || null;
    if (status != null) g.statuses.add(status);
  }
  return Array.from(groups.values())
    .filter((g) => g.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((g) => ({ method: g.method, path: g.path, count: g.count, sampleUrl: g.sampleUrl, statuses: Array.from(g.statuses) }));
}

function summarizeNetwork(result, args) {
  const list = Array.isArray(result.requests) ? result.requests.slice() :
               Array.isArray(result.entries)  ? result.entries.slice()  : null;
  if (!list) return result;

  let filtered = list;
  const filter = args && args.filter;
  if (filter && filter !== "all") {
    if (filter === "failing")    filtered = list.filter((r) => (r.status || r.response && r.response.status || 0) >= 400 || r.failed || r.error);
    else if (filter === "slow")  filtered = list.filter((r) => (r.duration || r.time || 0) > 500);
    else if (filter === "thirdParty") {
      const origin = (result.url || result.pageUrl || "");
      let host = "";
      try { host = new URL(origin).host; } catch (_) {}
      filtered = list.filter((r) => {
        const u = r.url || (r.request && r.request.url) || "";
        try { return new URL(u).host !== host; } catch (_) { return false; }
      });
    }
  }

  const summary = {
    url: result.url || result.pageUrl,
    total: list.length,
    shown: filtered.length,
    byType: result.requestsByType || null,
    truncated: !!(result.truncated || result.requestsTruncated),
    duration: result.duration || null,
    similarGroups: groupSimilarRequests(filtered)
  };

  if (args && args.summaryOnly) {
    // Top 20 by duration/size — drop headers, post data, security, response bodies
    const ranked = filtered
      .map((r) => ({
        url: r.url || (r.request && r.request.url),
        method: r.method || (r.request && r.request.method) || "GET",
        status: r.status || (r.response && r.response.status) || null,
        duration: r.duration || r.time || 0,
        size: r.size || (r.response && (r.response.bodySize || r.response.size)) || 0,
        type: r.resourceType || r.type || null
      }))
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 20);
    summary.top = ranked;
    return summary;
  }

  summary.requests = filtered;
  return summary;
}

// ── robots ────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "robots",
  category: "network",
  description: "Fetch robots.txt for the preview origin and parse it with robots-parser. Returns crawl-delay, sitemaps, and whether a given URL is allowed for a user agent.",
  requires: [{ kind: "browser" }, { kind: "library", name: "robots-parser" }],
  cache: { ttlMs: 300000 }, // robots.txt is effectively static — cache 5min
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
    if (result.error) return dv.failFromBrowser(result);
    return dv.ok(result);
  }
});

// ── web_fetch ─────────────────────────────────────────────────────────────

async function runWebFetch(args) {
  args = args || {};
  const useBrowser = !!(args.jsRender || args.captureRequests || args.waitForSelector ||
                         (Array.isArray(args.actions) && args.actions.length) || args.screenshot || args.ocrText);
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
    maxRequests: args.captureRequests ? (args.maxRequests || 500) : 1,
    waitForSelector: args.waitForSelector,
    waitForSelectorTimeout: args.waitForSelectorTimeout,
    actions: args.actions,
    screenshot: args.screenshot,
    screenshotSelector: args.screenshotSelector,
    fullPageScreenshot: args.fullPageScreenshot,
    stealth: args.stealth,
    ocrText: args.ocrText,
    ocrLang: args.ocrLang,
    minRequestIntervalMs: args.minRequestIntervalMs
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
  if (browseResult.errors && browseResult.errors.length && !result.browseErrors) {
    result.browseErrors = browseResult.errors;
  }
  if (browseResult.screenshotBase64) {
    result.screenshotBase64 = browseResult.screenshotBase64;
    result.screenshotMimeType = browseResult.screenshotMimeType;
  } else if (browseResult.screenshotError) {
    result.screenshotError = browseResult.screenshotError;
  }
  if (browseResult.ocrText !== undefined) result.ocrText = browseResult.ocrText;
  if (browseResult.ocrError) result.ocrError = browseResult.ocrError;
  if (browseResult.downloads && browseResult.downloads.length) result.downloads = browseResult.downloads;
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

  if (result.rawHtml !== undefined) {
    parts.push("\n--- Raw HTML ---");
    parts.push(result.rawHtml);
  }
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
  if (result.browseErrors && result.browseErrors.length) {
    parts.push("\n--- Browse warnings (" + result.browseErrors.length + ") ---");
    for (const e of result.browseErrors.slice(0, 20)) {
      parts.push("- [" + e.type + "]" + (e.selector ? " " + e.selector + ":" : "") + " " + e.message);
    }
  }
  if (result.screenshotBase64) parts.push("\n[Screenshot captured — returned as image content]");
  else if (result.screenshotError) parts.push("\n[Screenshot failed: " + result.screenshotError + "]");
  if (result.ocrText !== undefined) parts.push("\n--- OCR text ---\n" + result.ocrText);
  else if (result.ocrError) parts.push("\n[OCR failed: " + result.ocrError + "]");
  if (result.downloads && result.downloads.length) {
    parts.push("\n--- Downloaded assets (" + result.downloads.length + ") ---");
    for (const d of result.downloads) parts.push("• " + d.source + "  [" + (d.mimeType || "?") + ", " + d.byteLength + " bytes]");
    parts.push("\nBase64 payloads (JSON):");
    parts.push(JSON.stringify(result.downloads, null, 2));
  }
  return parts.join("\n");
}

dv.defineTool({
  name: "web_fetch",
  category: "network",
  description: [
    "Universal URL fetcher and scraper — works on ANY public URL, not just deployed previews. Handles HTML, JSON, RSS/Atom, XML sitemaps, text, binary content.",
    "Supports gzip/deflate/brotli/zstd, charset detection, cookies, custom headers, retries on 429/503.",
    "Set jsRender:true to render JavaScript in a headless browser (for SPAs).",
    "Set captureRequests:true to also return every network request the page makes — implies jsRender. Use this to find the underlying API endpoint behind a scraped widget and call it directly instead of parsing rendered text.",
    "Set getRawHtml:true for the actual markup (outerHTML), including hidden <script> JSON blobs like __NEXT_DATA__ — combine with `selector` to scope it to one element instead of the whole page. Implies jsRender.",
    "Set waitForSelector to block until a specific element exists before capturing, instead of guessing a fixed waitMs — use this for lazy-loaded widgets/tables. Implies jsRender.",
    "Set actions:[{action,selector,value}] to run a short interaction sequence (click/hover/type/select/scroll/key/wait/waitForSelector) before capture — e.g. selecting a dropdown option or dismissing a cookie banner on a third-party site. Implies jsRender.",
    "Set screenshot:true to get a PNG of the rendered page (or a selector via screenshotSelector) for visual verification. Implies jsRender.",
    "Set ocrText:true to OCR the rendered page (tesseract.js, no external service) — the only way to read text baked into canvas/WebGL/images with no DOM representation. Implies jsRender.",
    "Use actions:[{action:'downloadAsset', selector or value}] to download a client-side-rendered asset's actual bytes as base64 — regular lazy-loaded images/JSON/fonts are just a URL captureRequests reveals, then a normal web_fetch call away, but blob: URLs (URL.createObjectURL — never reachable by a server-side fetch, only from inside the page) and <canvas> pixel buffers (toDataURL, lossless — unlike a screenshot) need this. 50MB cap per asset by default — raise it with maxBytes (hard ceiling 500MB), but the whole thing still has to fit in one MCP response, so a multi-hundred-MB payload may be impractical regardless of the cap.",
    "stealth defaults to true whenever jsRender is used: patches common headless tells (navigator.webdriver, empty plugin list) with no external dependency. Pass stealth:false to disable.",
    "Note: jsRender/stealth only defeat JS-based bot checks (Cloudflare interstitials, etc) and naive automation flags. Pure network/WAF blocks (e.g. Reddit's IP-level firewall, some CloudFront 403s) and real fingerprinting/CAPTCHAs cannot be bypassed by header/UA tricks — that needs a different egress IP. Set proxy (or proxyList, rotated round-robin/random) to a forward-proxy URL to route the request through one — this is a modulable outbound IP, not a bypass of fingerprinting/CAPTCHAs."
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
      height: { type: "number" },
      getRawHtml: { type: "boolean", description: "Return actual markup (outerHTML), not visible-text-only. Scope with `selector`. Implies jsRender." },
      waitForSelector: { type: "string", description: "Block until this CSS selector exists before capturing. Implies jsRender." },
      waitForSelectorTimeout: { type: "number", description: "Max ms to wait for waitForSelector (default 10000, max 60000)." },
      actions: {
        type: "array",
        description: "Interaction sequence run before capture. Each: {action, selector?, value?, timeout?, maxBytes?}. actions: click, hover, type, select, scroll, key, wait, waitForSelector, downloadAsset. `downloadAsset` fetches the actual bytes of an asset from inside the page's JS realm and returns them as base64 in the result's `downloads` array — the only way to get a blob: URL (createObjectURL — no server-side fetch can ever reach it) or a <canvas>'s rendered pixels (toDataURL — lossless, unlike a JPEG/PNG screenshot). Pass `selector` (an <img>/<video>/<audio>/<a>/<canvas> element) or a literal blob:/data:/http(s) URL as `value`. `maxBytes` overrides the default 50MB cap for that one asset (hard ceiling 500MB). Implies jsRender.",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["click", "hover", "type", "select", "scroll", "key", "wait", "waitForSelector", "downloadAsset"] },
            selector: { type: "string" },
            value: {},
            timeout: { type: "number" },
            maxBytes: { type: "number", description: "downloadAsset only: max asset size in bytes before it's rejected instead of base64-encoded. Default 50MB, hard ceiling 500MB." }
          },
          required: ["action"]
        }
      },
      screenshot: { type: "boolean", description: "Capture a PNG of the rendered page after actions/waits. Implies jsRender." },
      screenshotSelector: { type: "string", description: "Screenshot only this element instead of the full viewport." },
      fullPageScreenshot: { type: "boolean", description: "Capture the full scrollable page instead of just the viewport." },
      stealth: { type: "boolean", description: "On by default when jsRender is used — patches common headless tells (navigator.webdriver, empty plugins list). Pass false to disable." },
      ocrText: { type: "boolean", description: "Run OCR (tesseract.js) on the rendered page and return recognized text — the only way to read text baked into canvas/WebGL/images that has no DOM representation for `selector`/`getRawHtml` to find. Implies jsRender." },
      ocrLang: { type: "string", description: "tesseract.js language code for ocrText (default 'eng')." },
      minRequestIntervalMs: { type: "number", description: "Minimum spacing (ms) between navigations to the same hostname, tracked across calls in this process. Off by default. Set this when firing several jsRender fetches at the same third-party host (e.g. via dv_workflow's parallel batches) to avoid a self-inflicted rate-limit/WAF flag that would look identical to a real block." },
      cache: { type: "boolean", description: "Cache the result to disk (workspace/web-fetch-cache/) keyed by URL + options, and serve repeat calls from disk instead of re-fetching/re-rendering. Default true — useful for big pages/JSON you keep re-reading while iterating. Skipped automatically for calls with downloadAsset actions. Set false to always hit the network." },
      cacheTtlMs: { type: "number", description: "How long a cached result stays valid, in ms. Default 900000 (15 min)." },
      forceRefresh: { type: "boolean", description: "Bypass any existing cache entry for this exact call and re-fetch, overwriting it. Use when you know the page changed." },
      proxy: { type: "string", description: "Route this request through a forward proxy, e.g. \"http://user:pass@host:port\" — gives the request a different outbound (egress) IP than this box's own, for working around IP-reputation/WAF blocks on the target. HTTP proxy only (CONNECT tunneling is used automatically for https:// targets). Not applied to jsRender/browser-based fetches, only the plain HTTP path." },
      proxyList: { type: "array", items: { type: "string" }, description: "Pool of proxy URLs to rotate across instead of a single `proxy` — one is picked per call (round-robin by default, or random with proxyRotation:\"random\"). Falls back to the WEB_FETCH_PROXIES env var (comma-separated) when neither proxy nor proxyList is set." },
      proxyRotation: { type: "string", enum: ["roundRobin", "random"], description: "How to pick from proxyList/WEB_FETCH_PROXIES. Default roundRobin." }
    },
    required: ["url"]
  },
  async handler(args) {
    const hasDownloadAsset = Array.isArray(args.actions) && args.actions.some((a) => a && a.action === "downloadAsset");
    const cacheEnabled = args.cache !== false && !hasDownloadAsset;
    const cacheKey = cacheEnabled ? webFetchCache.cacheKeyFor(args) : null;

    if (cacheKey && !args.forceRefresh) {
      const cached = webFetchCache.get(cacheKey);
      if (cached) {
        const text = formatWebFetchResult(cached) + "\n\n[Served from web_fetch disk cache]";
        if (cached.screenshotBase64) {
          return dv.imageWithJson(cached.screenshotBase64, cached.screenshotMimeType, { summary: text });
        }
        return dv.text(text);
      }
    }

    const result = await runWebFetch(args);
    if (result.error) return dv.failFromBrowser(result);
    if (cacheKey) webFetchCache.put(cacheKey, result, args.cacheTtlMs);
    const text = formatWebFetchResult(result);
    if (result.screenshotBase64) {
      return dv.imageWithJson(result.screenshotBase64, result.screenshotMimeType, { summary: text });
    }
    return dv.text(text);
  }
});

module.exports = { runWebFetch, formatWebFetchResult };
