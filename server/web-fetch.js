/**
 * web-fetch.js — HTTP fetch / web scraping utility for DeployView
 *
 * Provides a lightweight web fetching and scraping tool that works across
 * all DeployView interfaces:
 *   - MCP stdio (Claude Desktop, Termux)
 *   - MCP Streamable HTTP (Claude web at claude.ai)
 *   - REST HTTP API (/api/fetch)
 *
 * Uses only Node.js built-in modules (http, https, url, zlib) so it runs on
 * Termux and other constrained environments without extra dependencies.
 *
 * Features:
 *   - Fetch any public URL (HTML, JSON, text, etc.)
 *   - Gzip / deflate / brotli decompression (transparent)
 *   - Extract readable text from HTML (strip tags)
 *   - Extract links, images, headings, meta tags from HTML
 *   - CSS-like selectors: tag, .class, #id, tag.class
 *   - Readability mode — strips nav/footer/sidebar boilerplate
 *   - Follow redirects (configurable depth)
 *   - Custom headers and timeout support
 *   - Response size limiting for safety
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const zlib = require("zlib");

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RESPONSE_BYTES = 1024 * 1024 * 1024;     // 1 GB default max response body
const MAX_RESPONSE_BYTES_HARD = 4 * 1024 * 1024 * 1024; // 4 GB absolute hard cap (Node Buffer limit)
const DEFAULT_TIMEOUT_MS = 900000;              // 15 minute default timeout
const MAX_TIMEOUT_MS = 1800000;                 // 30 minute absolute max
const MIN_TIMEOUT_MS = 5000;                     // Minimum allowed timeout
const MAX_REDIRECTS = 16;
const MAX_RETRIES = 3;                           // Max retries on 429/503/network errors
const DEFAULT_MAX_TEXT_CHARS = 500000;           // Default text extraction length
const MAX_TEXT_CHARS_LIMIT = 100000000;          // Absolute max text extraction length (~100 M chars)
const MAX_BODY_CHARS = 100000000;                // Max plain-text body length (~100 M chars)
const MAX_EXTRACTED_LINKS = 50000;               // Max links to extract from HTML
const MAX_EXTRACTED_IMAGES = 20000;              // Max images to extract from HTML
const MAX_TAG_SEARCH_DEPTH = 50000;             // Max iterations when searching for closing tags
const MAX_BASE64_BYTES = 1024 * 1024 * 1024;    // Max binary size to base64-encode (1 GB)

// Modern Chrome User-Agent — many sites reject unfamiliar UAs with 403.
// Kept current-ish so we look like a real browser.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

// ── Blocked hosts (prevent SSRF to internal networks) ────────────────────────

const BLOCKED_HOST_RE = /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|localhost|::1|\[::1\])$/i;

function isBlockedHost(hostname) {
  return BLOCKED_HOST_RE.test(hostname);
}

// ── Core fetch function ──────────────────────────────────────────────────────

/**
 * Fetch a URL and return the response body and metadata.
 *
 * @param {object} opts
 * @param {string}  opts.url              - URL to fetch (required)
 * @param {string}  [opts.method]         - HTTP method (default: GET)
 * @param {object}  [opts.headers]        - Custom request headers (override defaults)
 * @param {string|object} [opts.body]     - Request body (string, object → JSON, or form)
 * @param {string}  [opts.bodyType]       - "json" | "form" | "text" (default: auto-detect)
 * @param {number}  [opts.timeout]        - Timeout in ms (default: 900000, max: 1800000)
 * @param {number}  [opts.maxRedirects]   - Max redirects to follow (default: 16)
 * @param {number}  [opts.maxSize]        - Max response bytes (default: 1GB, hard cap: 4GB)
 * @param {number}  [opts.retries]        - Retries on 429/503/network errors (default: 2)
 * @param {string}  [opts.userAgent]      - Override User-Agent (default: modern Chrome)
 * @param {string}  [opts.acceptLanguage] - Accept-Language header (default: en-US)
 * @param {string}  [opts.referer]        - Referer header
 * @param {string|object} [opts.cookies]  - Cookie header: string "k=v; k2=v2" or object
 * @param {string}  [opts.format]         - Output format: "auto" (default), "text", "markdown", "html", "json", "xml", "base64", "raw"
 * @param {boolean} [opts.allowBinary]    - Return non-text content as base64 instead of erroring
 * @param {boolean} [opts.parseXml]       - Parse RSS/Atom/sitemap XML into structured JSON
 * @param {string}  [opts.jsonPath]       - Dot-path to extract from JSON response, e.g. "data.items.0.title"
 * @param {boolean} [opts.extractText]    - HTML: strip tags and return plain text
 * @param {boolean} [opts.extractLinks]   - HTML: extract all links
 * @param {boolean} [opts.extractMeta]    - HTML: extract meta tags (Open Graph, etc.)
 * @param {boolean} [opts.extractImages]  - HTML: extract <img> URLs
 * @param {boolean} [opts.extractHeadings]- HTML: extract h1-h6 outline
 * @param {string}  [opts.selector]       - HTML: CSS-like filter (tag, .class, #id)
 * @param {boolean} [opts.readability]    - HTML: strip nav/footer/sidebar boilerplate
 * @param {number}  [opts.maxTextLength]  - Max text/markdown output length (default: 50000, max: 400000)
 * @returns {Promise<object>}
 */
function webFetch(opts) {
  return new Promise((resolve) => {
    if (!opts || !opts.url) {
      return resolve({ error: "url parameter is required" });
    }

    let parsed;
    try {
      parsed = new URL(opts.url);
    } catch (e) {
      return resolve({ error: "Invalid URL: " + e.message });
    }

    // Only allow http and https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return resolve({ error: "Only http and https URLs are supported" });
    }

    // Block internal/private network addresses to prevent SSRF
    if (isBlockedHost(parsed.hostname)) {
      return resolve({ error: "Requests to private/internal network addresses are not allowed" });
    }

    const method = (opts.method || "GET").toUpperCase();
    const timeout = Math.min(Math.max(opts.timeout || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
    const maxRedirects = Math.min(opts.maxRedirects || MAX_REDIRECTS, 15);
    const maxSize = Math.min(opts.maxSize || MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES_HARD);
    const retries  = Math.min(Math.max(opts.retries != null ? opts.retries : 2, 0), MAX_RETRIES);

    // Build the final headers: defaults first, then user overrides
    const userHeaders = normalizeHeaders(opts.headers);
    const reqHeaders = {
      "User-Agent":      opts.userAgent || userHeaders["user-agent"] || DEFAULT_USER_AGENT,
      "Accept":          userHeaders["accept"] || DEFAULT_ACCEPT,
      "Accept-Language": opts.acceptLanguage || userHeaders["accept-language"] || DEFAULT_ACCEPT_LANGUAGE,
      "Accept-Encoding": "gzip, deflate, br"
    };
    // Merge user headers (original case preserved for non-reserved)
    if (opts.headers && typeof opts.headers === "object") {
      for (const k in opts.headers) {
        if (typeof opts.headers[k] !== "string") continue;
        // Don't let user headers clobber Host / Content-Length
        const lk = k.toLowerCase();
        if (lk === "host" || lk === "content-length") continue;
        reqHeaders[k] = opts.headers[k];
      }
    }
    if (opts.referer) reqHeaders["Referer"] = opts.referer;
    const cookieHeader = buildCookieHeader(opts.cookies);
    if (cookieHeader) reqHeaders["Cookie"] = cookieHeader;

    // Encode body
    let body = opts.body;
    if (body != null) {
      const bodyType = (opts.bodyType || "").toLowerCase();
      if (bodyType === "json" || (!bodyType && typeof body === "object" && !(body instanceof Buffer))) {
        body = JSON.stringify(body);
        if (!reqHeaders["Content-Type"] && !reqHeaders["content-type"]) {
          reqHeaders["Content-Type"] = "application/json";
        }
      } else if (bodyType === "form") {
        body = typeof body === "string" ? body : encodeFormData(body);
        if (!reqHeaders["Content-Type"] && !reqHeaders["content-type"]) {
          reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        }
      }
      // "text" and default: leave body as-is
    }

    doFetch(parsed, method, reqHeaders, body, timeout, maxRedirects, maxSize, retries, opts, resolve);
  });
}

function normalizeHeaders(h) {
  const out = {};
  if (h && typeof h === "object") {
    for (const k in h) out[k.toLowerCase()] = h[k];
  }
  return out;
}

function buildCookieHeader(cookies) {
  if (!cookies) return null;
  if (typeof cookies === "string") return cookies;
  if (typeof cookies === "object") {
    const parts = [];
    for (const k in cookies) {
      if (typeof cookies[k] === "string" || typeof cookies[k] === "number") {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(cookies[k]));
      }
    }
    return parts.join("; ");
  }
  return null;
}

function encodeFormData(obj) {
  if (typeof obj !== "object") return String(obj);
  const parts = [];
  for (const k in obj) {
    if (obj[k] == null) continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
  }
  return parts.join("&");
}

function doFetch(parsedUrl, method, headers, body, timeout, redirectsLeft, maxSize, retriesLeft, opts, resolve) {
  const transport = parsedUrl.protocol === "https:" ? https : http;

  // Compute Content-Length for bodied requests
  const reqHeaders = { ...headers };
  if (body != null && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")) {
    const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    reqHeaders["Content-Length"] = buf.length;
  }

  const reqOpts = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: method,
    headers: reqHeaders,
    timeout: timeout
  };

  const retry = (reason, delayMs) => {
    if (retriesLeft <= 0) return false;
    setTimeout(() => {
      doFetch(parsedUrl, method, headers, body, timeout, redirectsLeft, maxSize, retriesLeft - 1, opts, resolve);
    }, Math.min(Math.max(delayMs || 1000, 500), 15000));
    return true;
  };

  const req = transport.request(reqOpts, (res) => {
    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      if (redirectsLeft <= 0) {
        return resolve({ error: "Too many redirects", statusCode: res.statusCode, url: parsedUrl.href });
      }
      let redirectUrl;
      try {
        redirectUrl = new URL(res.headers.location, parsedUrl.href);
      } catch (e) {
        return resolve({ error: "Invalid redirect URL: " + res.headers.location });
      }
      if (isBlockedHost(redirectUrl.hostname)) {
        return resolve({ error: "Redirect to private/internal network address blocked" });
      }
      // For 301/302/303, drop body and switch to GET per RFC 7231
      let nextMethod = method;
      let nextBody = body;
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        if (method !== "GET" && method !== "HEAD") {
          nextMethod = "GET";
          nextBody = null;
        }
      }
      res.resume(); // Drain response
      return doFetch(redirectUrl, nextMethod, headers, nextBody, timeout, redirectsLeft - 1, maxSize, retriesLeft, opts, resolve);
    }

    // Retry on 429 / 502 / 503 / 504 if retries remain
    if ((res.statusCode === 429 || res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) && retriesLeft > 0) {
      const retryAfterHdr = res.headers["retry-after"];
      let delay = 1500 * (MAX_RETRIES - retriesLeft + 1); // backoff
      if (retryAfterHdr) {
        const n = parseInt(retryAfterHdr, 10);
        if (Number.isFinite(n)) delay = Math.min(n * 1000, 15000);
      }
      res.resume();
      retry("status " + res.statusCode, delay);
      return;
    }

    // Decompress response based on Content-Encoding
    let stream = res;
    const encoding = (res.headers["content-encoding"] || "").toLowerCase();
    if (encoding === "gzip" || encoding === "x-gzip") {
      stream = res.pipe(zlib.createGunzip());
    } else if (encoding === "deflate") {
      // Some servers send raw deflate without zlib header; try both
      stream = res.pipe(zlib.createInflate());
      stream.on("error", () => { /* swallowed, will retry raw inflate below */ });
    } else if (encoding === "br") {
      if (typeof zlib.createBrotliDecompress === "function") {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
    } else if (encoding === "zstd") {
      // Node 23+ has zstd support; check for it
      if (typeof zlib.createZstdDecompress === "function") {
        stream = res.pipe(zlib.createZstdDecompress());
      }
    }

    const chunks = [];
    let totalSize = 0;
    let truncated = false;
    let aborted = false;

    stream.on("data", (chunk) => {
      if (aborted) return;
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        truncated = true;
        aborted = true;
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });

    stream.on("error", (e) => {
      // Decompression errors — fall back to treating as plain response
      if (chunks.length > 0) {
        processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
      } else {
        resolve({ error: "Decompression error: " + e.message, url: parsedUrl.href });
      }
    });

    stream.on("end", () => {
      processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
    });

    res.on("error", (e) => {
      if (chunks.length > 0) {
        processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
      } else {
        resolve({ error: "Response error: " + e.message, url: parsedUrl.href });
      }
    });
  });

  req.on("timeout", () => {
    req.destroy();
    if (!retry("timeout", 1000)) {
      resolve({ error: "Request timed out after " + timeout + "ms", url: parsedUrl.href });
    }
  });

  req.on("error", (e) => {
    // Retry on transient network errors
    const code = e.code || "";
    const transient = code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN" ||
                      code === "ECONNREFUSED" || code === "EPIPE" || code === "ENETUNREACH";
    if (transient && retry(code, 1000)) return;
    resolve({ error: "Request failed: " + e.message + (code ? " (" + code + ")" : ""), url: parsedUrl.href });
  });

  if (body != null && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")) {
    req.write(typeof body === "string" ? body : body);
  }
  req.end();
}

/**
 * Process the response body after fetch/decompression.
 * `rawBuffer` is a Buffer (not yet decoded). Charset is detected per-response.
 */
function processResponse(rawBuffer, res, parsedUrl, totalSize, truncated, opts, resolve) {
  const contentType = res.headers["content-type"] || "";
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const isHtml   = mime === "text/html" || mime === "application/xhtml+xml";
  const isJson   = mime === "application/json" || mime.endsWith("+json");
  const isXml    = mime === "application/xml" || mime === "text/xml" || mime.endsWith("+xml") ||
                   mime === "application/rss+xml" || mime === "application/atom+xml";
  const isText   = mime.startsWith("text/") || mime === "application/javascript" ||
                   mime === "application/x-javascript" || mime === "application/ecmascript" ||
                   mime === "application/graphql" || mime === "application/yaml" ||
                   mime === "application/x-yaml" || mime === "application/toml" ||
                   mime === "application/x-www-form-urlencoded" || mime === "application/csv";
  const isBinary = !isHtml && !isJson && !isXml && !isText;

  const result = {
    url: parsedUrl.href,
    statusCode: res.statusCode,
    contentType: mime,
    contentLength: totalSize,
    truncated: truncated,
    headers: sanitizeHeaders(res.headers)
  };

  // ── Binary content path — only return bytes if explicitly allowed ──
  if (isBinary) {
    if (opts.format === "base64" || opts.allowBinary) {
      if (rawBuffer.length > MAX_BASE64_BYTES) {
        result.error = "Binary content too large to return as base64 (" +
                       rawBuffer.length + " bytes, max " + MAX_BASE64_BYTES + ")";
        result.byteLength = rawBuffer.length;
      } else {
        result.base64 = rawBuffer.toString("base64");
        result.byteLength = rawBuffer.length;
      }
    } else {
      result.error = "Binary content (" + mime + ") — set allowBinary:true or format:\"base64\" to receive it";
      result.byteLength = rawBuffer.length;
    }
    return resolve(result);
  }

  // ── Text content — detect charset and decode ──
  const charset = detectCharset(rawBuffer, contentType, isHtml);
  const rawBody = decodeBuffer(rawBuffer, charset);
  result.charset = charset;

  const format = (opts.format || "auto").toLowerCase();
  const maxTextLen = resolveMaxTextLength(opts.maxTextLength);

  // Explicit format overrides
  if (format === "raw") {
    result.body = rawBody;
    return resolve(result);
  }
  if (format === "base64") {
    result.base64 = rawBuffer.toString("base64");
    result.byteLength = rawBuffer.length;
    return resolve(result);
  }

  // ── JSON ──
  if (isJson || format === "json") {
    try {
      const parsed = JSON.parse(rawBody);
      if (opts.jsonPath) {
        result.json = jsonPathLookup(parsed, opts.jsonPath);
        result.jsonPath = opts.jsonPath;
      } else {
        result.json = parsed;
      }
    } catch (e) {
      result.error = "Failed to parse JSON: " + e.message;
      result.body = rawBody.slice(0, maxTextLen);
    }
    return resolve(result);
  }

  // ── XML / RSS / Atom / sitemap ──
  if (isXml || format === "xml" || opts.parseXml) {
    const feed = parseRssAtom(rawBody);
    if (feed) {
      result.feed = feed;
    } else {
      // Generic XML — strip tags for text view
      result.text = extractText(rawBody, null, maxTextLen);
    }
    if (format === "raw" || opts.includeRawXml) result.body = rawBody.slice(0, MAX_BODY_CHARS);
    return resolve(result);
  }

  // ── HTML ──
  if (isHtml) {
    if (format === "markdown") {
      const cleaned = opts.readability ? stripBoilerplate(rawBody) : rawBody;
      result.markdown = htmlToMarkdown(cleaned, parsedUrl.href, maxTextLen);
      result.title = extractTitle(rawBody);
      result.rawHtmlLength = rawBody.length;
      // Also run any explicitly-requested extractors
      if (opts.extractLinks)    result.links    = extractLinks(rawBody, parsedUrl.href);
      if (opts.extractMeta)     result.meta     = extractMeta(rawBody);
      if (opts.extractImages)   result.images   = extractImages(rawBody, parsedUrl.href);
      if (opts.extractHeadings) result.headings = extractHeadings(rawBody);
      return resolve(result);
    }
    if (format === "html") {
      result.html = rawBody.slice(0, maxTextLen * 4);
      result.title = extractTitle(rawBody);
      return resolve(result);
    }
    Object.assign(result, extractFromHtml(rawBody, opts, parsedUrl.href));
    return resolve(result);
  }

  // ── Plain text / JavaScript / CSS / YAML / CSV / etc. ──
  if (format === "markdown" && mime.startsWith("text/")) {
    result.markdown = rawBody.slice(0, maxTextLen);
  } else {
    result.body = rawBody.slice(0, MAX_BODY_CHARS);
  }
  return resolve(result);
}

// ── Character encoding detection ────────────────────────────────────────────

function detectCharset(buffer, contentTypeHeader, isHtml) {
  // 1. Charset from Content-Type header
  if (contentTypeHeader) {
    const m = contentTypeHeader.match(/charset\s*=\s*["']?([^"';\s]+)/i);
    if (m) return normalizeCharset(m[1]);
  }

  // 2. Byte-order mark
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return "utf-8";
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) return "utf-16be";
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) return "utf-16le";

  // 3. <meta charset> in the first 4 KB for HTML
  if (isHtml) {
    const head = buffer.slice(0, Math.min(4096, buffer.length)).toString("latin1");
    let m = head.match(/<meta\s[^>]*charset\s*=\s*["']?([a-zA-Z0-9_\-:]+)/i);
    if (m) return normalizeCharset(m[1]);
    m = head.match(/<meta\s[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9_\-:]+)/i);
    if (m) return normalizeCharset(m[1]);
  }

  // 4. Default
  return "utf-8";
}

function normalizeCharset(cs) {
  const c = String(cs).toLowerCase().replace(/[ _]/g, "-");
  const aliases = {
    "ascii":       "ascii",
    "us-ascii":    "ascii",
    "latin1":      "iso-8859-1",
    "latin-1":     "iso-8859-1",
    "iso8859-1":   "iso-8859-1",
    "iso-8859-1":  "iso-8859-1",
    "cp1252":      "windows-1252",
    "cp-1252":     "windows-1252",
    "gbk":         "gbk",
    "gb2312":      "gb2312",
    "shift-jis":   "shift_jis",
    "shiftjis":    "shift_jis",
    "sjis":        "shift_jis",
    "x-sjis":      "shift_jis",
    "euc-jp":      "euc-jp",
    "euc-kr":      "euc-kr",
    "big5":        "big5",
    "utf8":        "utf-8",
    "utf-8":       "utf-8",
    "utf-16":      "utf-16le",
    "utf-16le":    "utf-16le",
    "utf-16be":    "utf-16be"
  };
  return aliases[c] || c;
}

function decodeBuffer(buffer, charset) {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch (e) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(buffer); }
    catch (_) { return buffer.toString("utf-8"); }
  }
}

// ── JSON path lookup ────────────────────────────────────────────────────────

/**
 * Simple dot-path lookup into a JSON value: "data.items.0.title"
 * Supports numeric indices for arrays.
 */
function jsonPathLookup(obj, path) {
  if (!path) return obj;
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(p)) {
      cur = cur[parseInt(p, 10)];
    } else if (typeof cur === "object") {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// ── HTML → Markdown conversion ──────────────────────────────────────────────

/**
 * Convert HTML to Markdown, preserving structure:
 * headings, paragraphs, links, images, lists, code blocks, blockquotes, emphasis.
 * This is a regex-based converter — not perfect, but handles 95% of real-world HTML.
 */
function htmlToMarkdown(rawHtml, baseUrl, maxLen) {
  let html = rawHtml;

  // Strip script/style/noscript/svg/iframe completely
  html = stripScripts(html);
  html = html.replace(/<style\b[^<]*(?:(?!<\/style)<[^<]*)*<\/style\s*>/gi, "");
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript)<[^<]*)*<\/noscript\s*>/gi, "");
  html = html.replace(/<svg\b[^<]*(?:(?!<\/svg)<[^<]*)*<\/svg\s*>/gi, "");
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe)<[^<]*)*<\/iframe\s*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Code blocks — <pre><code>...</code></pre> → ```\n...\n```
  html = html.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, inner) =>
    "\n\n```\n" + decodeEntities(inner.replace(/<[^>]+>/g, "")) + "\n```\n\n");
  html = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) =>
    "\n\n```\n" + decodeEntities(inner.replace(/<[^>]+>/g, "")) + "\n```\n\n");

  // Inline code
  html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) =>
    "`" + decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/`/g, "\\`") + "`");

  // Headings — process h6 first so they don't get partially matched by h1 regex
  for (let level = 6; level >= 1; level--) {
    const re = new RegExp("<h" + level + "\\b[^>]*>([\\s\\S]*?)<\\/h" + level + "\\s*>", "gi");
    const prefix = "\n\n" + "#".repeat(level) + " ";
    html = html.replace(re, (_, inner) => prefix + collapseInlineText(inner) + "\n\n");
  }

  // Horizontal rule
  html = html.replace(/<hr\b[^>]*\/?>/gi, "\n\n---\n\n");

  // Line break
  html = html.replace(/<br\b[^>]*\/?>/gi, "  \n");

  // Images — ![alt](src)
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return "";
    const altMatch = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : "";
    let src = srcMatch[1];
    try { src = new URL(src, baseUrl).href; } catch (_) {}
    // Filter data/javascript URIs
    const scheme = src.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") return "";
    return "![" + alt + "](" + src + ")";
  });

  // Links — [text](href)
  html = html.replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    let resolved = href;
    try { resolved = new URL(href, baseUrl).href; } catch (_) {}
    const scheme = resolved.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript") return collapseInlineText(text);
    const label = collapseInlineText(text).trim();
    if (!label) return resolved;
    return "[" + label + "](" + resolved + ")";
  });

  // Emphasis — must run after link extraction so we don't break link text formatting
  html = html.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _t, inner) => "**" + collapseInlineText(inner) + "**");
  html = html.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _t, inner) => "*" + collapseInlineText(inner) + "*");
  html = html.replace(/<del\b[^>]*>([\s\S]*?)<\/del\s*>/gi, (_, inner) => "~~" + collapseInlineText(inner) + "~~");

  // Lists
  html = html.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, inner) => "\n- " + collapseInlineText(inner).trim());
  html = html.replace(/<\/?(ul|ol|menu)\b[^>]*>/gi, "\n");

  // Blockquote
  html = html.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_, inner) => {
    const text = collapseInlineText(inner).trim();
    if (!text) return "";
    return "\n\n> " + text.split(/\n+/).join("\n> ") + "\n\n";
  });

  // Tables — simple row-based conversion
  html = html.replace(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, tableHtml) => {
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push(collapseInlineText(cm[1]).trim() || " ");
      }
      if (cells.length) rows.push("| " + cells.join(" | ") + " |");
    }
    if (!rows.length) return "";
    // Insert header separator after first row
    const sep = rows[0].split("|").length - 2;
    const separator = "| " + Array(sep).fill("---").join(" | ") + " |";
    return "\n\n" + rows[0] + "\n" + separator + "\n" + rows.slice(1).join("\n") + "\n\n";
  });

  // Paragraphs & block containers → line breaks
  html = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi, (_, inner) => "\n\n" + collapseInlineText(inner) + "\n\n");
  html = html.replace(/<\/?(div|section|article|main|header|footer|nav|aside|figure|figcaption|details|summary|dd|dt|dl|form|fieldset)\b[^>]*>/gi, "\n");

  // Strip any remaining tags
  html = html.replace(/<[^>]+>/g, "");

  // Decode entities
  html = decodeEntities(html);

  // Normalize whitespace
  html = html.replace(/\r/g, "");
  html = html.replace(/[ \t]+/g, " ");
  html = html.replace(/[ \t]+\n/g, "\n");
  html = html.replace(/\n[ \t]+/g, "\n");
  html = html.replace(/\n{3,}/g, "\n\n");
  html = html.trim();

  if (maxLen && html.length > maxLen) {
    html = html.slice(0, maxLen) + "\n\n[... truncated at " + maxLen + " characters]";
  }
  return html;
}

/**
 * Collapse an inline chunk to plain text with entities decoded, preserving
 * inline markdown (because this helper is called inside partially-converted HTML).
 */
function collapseInlineText(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ── RSS / Atom / Sitemap parsing ────────────────────────────────────────────

/**
 * Parse common feed formats into a structured result.
 * Recognises: RSS 2.0, Atom, urlset (sitemap), sitemapindex.
 * Returns null if the XML doesn't look like any known feed format.
 */
function parseRssAtom(xml) {
  if (!xml || typeof xml !== "string") return null;

  // Determine feed type
  let type = null;
  if (/<rss[\s>]/i.test(xml))          type = "rss";
  else if (/<feed[\s>][^>]*xmlns/i.test(xml) || /<feed\b[\s\S]*?xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml)) type = "atom";
  else if (/<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)) type = "atom";
  else if (/<urlset[\s>]/i.test(xml))  type = "sitemap";
  else if (/<sitemapindex[\s>]/i.test(xml)) type = "sitemapindex";
  else return null;

  const result = { type, title: null, description: null, link: null, items: [] };

  // Pre-process CDATA sections → plain text
  const clean = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner);

  // Feed-level metadata
  const chanMatch = clean.match(/<channel[\s>][\s\S]*?<\/channel\s*>/i);
  const chanScope = chanMatch ? chanMatch[0] : clean;
  result.title       = extractXmlTag(chanScope, "title")       || null;
  result.description = extractXmlTag(chanScope, "description") ||
                       extractXmlTag(chanScope, "subtitle")    || null;
  result.link        = extractXmlTag(chanScope, "link")        || null;

  if (type === "rss") {
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
    let m;
    while ((m = itemRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        title:       extractXmlTag(inner, "title"),
        link:        extractXmlTag(inner, "link"),
        description: extractXmlTag(inner, "description"),
        content:     extractXmlTag(inner, "content:encoded"),
        pubDate:     extractXmlTag(inner, "pubDate") || extractXmlTag(inner, "dc:date"),
        author:      extractXmlTag(inner, "author")  || extractXmlTag(inner, "dc:creator"),
        guid:        extractXmlTag(inner, "guid"),
        categories:  extractAllXmlTags(inner, "category")
      });
    }
  } else if (type === "atom") {
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi;
    let m;
    while ((m = entryRe.exec(clean)) !== null) {
      const inner = m[1];
      // Atom link is typically <link href="..." />
      let link = null;
      const linkMatch = inner.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["']/i);
      if (linkMatch) link = linkMatch[1];
      else link = extractXmlTag(inner, "link");
      result.items.push({
        title:     extractXmlTag(inner, "title"),
        link,
        summary:   extractXmlTag(inner, "summary"),
        content:   extractXmlTag(inner, "content"),
        updated:   extractXmlTag(inner, "updated"),
        published: extractXmlTag(inner, "published"),
        id:        extractXmlTag(inner, "id"),
        author:    extractXmlTag(inner, "name") || extractXmlTag(inner, "author")
      });
    }
  } else if (type === "sitemap") {
    const urlRe = /<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi;
    let m;
    while ((m = urlRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        loc:        extractXmlTag(inner, "loc"),
        lastmod:    extractXmlTag(inner, "lastmod"),
        changefreq: extractXmlTag(inner, "changefreq"),
        priority:   extractXmlTag(inner, "priority")
      });
    }
  } else if (type === "sitemapindex") {
    const smRe = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi;
    let m;
    while ((m = smRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        loc:     extractXmlTag(inner, "loc"),
        lastmod: extractXmlTag(inner, "lastmod")
      });
    }
  }

  result.itemCount = result.items.length;
  return result;
}

function extractXmlTag(xml, tag) {
  // Escape ':' and '-' for regex; tag names from code paths are known-safe
  const tagRe = tag.replace(/[:.-]/g, "\\$&");
  const re = new RegExp("<" + tagRe + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagRe + "\\s*>", "i");
  const m = xml.match(re);
  if (!m) {
    // Try self-closing variant (e.g., <link href="..."/>)
    const selfRe = new RegExp("<" + tagRe + "\\b([^>]*)\\/>", "i");
    const sm = xml.match(selfRe);
    if (sm) {
      const hrefMatch = sm[1].match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch) return hrefMatch[1];
    }
    return null;
  }
  return cleanXmlText(m[1]);
}

function extractAllXmlTags(xml, tag) {
  const tagRe = tag.replace(/[:.-]/g, "\\$&");
  const re = new RegExp("<" + tagRe + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagRe + "\\s*>", "gi");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = cleanXmlText(m[1]);
    if (v) results.push(v);
  }
  return results;
}

function cleanXmlText(s) {
  return decodeEntities(
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  ).trim();
}

/**
 * Run the HTML extractors (text, links, meta, images, headings, selector, readability)
 * against a pre-fetched HTML string. Shared between the plain-fetch path and the
 * JS-rendered (browser) path.
 *
 * @param {string} rawHtml - Full HTML source to extract from
 * @param {object} opts    - Extraction options (same shape as webFetch opts)
 * @param {string} baseUrl - Base URL used to resolve relative links/images
 * @returns {object} — subset of webFetch result: { text?, title?, links?, meta?, images?, headings?, rawHtmlLength }
 */
function extractFromHtml(rawHtml, opts, baseUrl) {
  opts = opts || {};
  const maxTextLen = resolveMaxTextLength(opts.maxTextLength);
  const out = {};

  // Optionally strip boilerplate before extraction
  const html = opts.readability ? stripBoilerplate(rawHtml) : rawHtml;

  if (opts.extractText || opts.selector) {
    out.text = extractText(html, opts.selector, maxTextLen);
  }
  if (opts.extractLinks) {
    out.links = extractLinks(html, baseUrl);
  }
  if (opts.extractMeta) {
    out.meta = extractMeta(html);
  }
  if (opts.extractImages) {
    out.images = extractImages(html, baseUrl);
  }
  if (opts.extractHeadings) {
    out.headings = extractHeadings(html);
  }
  // If no extract options, provide readable text by default for HTML
  if (!opts.extractText && !opts.extractLinks && !opts.extractMeta && !opts.selector && !opts.extractImages && !opts.extractHeadings) {
    out.title = extractTitle(rawHtml);
    out.text = extractText(opts.readability ? html : rawHtml, null, maxTextLen);
  }
  out.rawHtmlLength = rawHtml.length;
  return out;
}

/**
 * Resolve the effective maxTextLength from caller option.
 */
function resolveMaxTextLength(val) {
  if (typeof val === "number" && val > 0) {
    return Math.min(val, MAX_TEXT_CHARS_LIMIT);
  }
  return DEFAULT_MAX_TEXT_CHARS;
}

// ── HTML extraction helpers ──────────────────────────────────────────────────

/**
 * Extract page title from HTML.
 */
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : "";
}

/**
 * Extract readable text from HTML, optionally filtered by a CSS-like selector.
 * Supports selectors: tag name, .class, #id, tag.class, tag#id
 * This is a lightweight extraction — no DOM parser needed.
 */
function extractText(html, selector, maxTextLen) {
  let content = html;

  // If a selector is specified, extract only matching elements
  if (selector) {
    const extracted = matchSelector(html, selector);
    content = extracted.length ? extracted.join("\n\n") : html;
  }

  // Remove script and style blocks (loop to handle nested/malformed tags)
  // Use [^<]* pattern to match content, and strict closing tags
  let prev;
  do {
    prev = content;
    content = content.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script\s*>/gi, "");
    content = content.replace(/<style\b[^<]*(?:(?!<\/style)<[^<]*)*<\/style\s*>/gi, "");
    content = content.replace(/<noscript\b[^<]*(?:(?!<\/noscript)<[^<]*)*<\/noscript\s*>/gi, "");
  } while (content !== prev);
  // Final pass: remove any remaining opening script/style tags without proper closing
  content = content.replace(/<script\b[^>]*>/gi, "");
  content = content.replace(/<style\b[^>]*>/gi, "");

  // Replace block-level tags with newlines
  content = content.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|nav|aside|main|figure|figcaption|details|summary)[^>]*>/gi, "\n");

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  content = decodeEntities(content);

  // Normalize whitespace
  content = content.replace(/[ \t]+/g, " ");
  content = content.replace(/\n\s*\n/g, "\n\n");
  content = content.trim();

  // Limit length for MCP responses
  const limit = maxTextLen || DEFAULT_MAX_TEXT_CHARS;
  if (content.length > limit) {
    content = content.slice(0, limit) + "\n\n[... truncated at " + limit + " characters]";
  }

  return content;
}

// ── CSS-like selector matching ──────────────────────────────────────────────

/**
 * Parse a simple CSS-like selector into its components.
 * Supports: "tag", ".class", "#id", "tag.class", "tag#id"
 * Returns { tag, className, id } — all values are regex-safe alphanumeric.
 */
function parseSelector(selector) {
  if (!selector || typeof selector !== "string") return {};
  const s = selector.trim();
  let tag = null, className = null, id = null;

  // #id (alphanumeric, underscore, hyphen only — safe for regex)
  const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) id = idMatch[1];

  // .class (alphanumeric, underscore, hyphen only — safe for regex)
  const classMatch = s.match(/\.([a-zA-Z0-9_-]+)/);
  if (classMatch) className = classMatch[1];

  // tag name (strictly alphanumeric — safe for regex)
  const tagMatch = s.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch) tag = tagMatch[1];

  return { tag, className, id };
}

/**
 * Match elements in HTML using a parsed selector.
 * Returns an array of matched inner HTML strings.
 */
function matchSelector(html, selector) {
  const { tag, className, id } = parseSelector(selector);
  if (!tag && !className && !id) return [];

  const matches = [];

  // Build regex to find opening tags.
  // tagPattern is safe: either a validated alphanumeric tag name from parseSelector,
  // or a fixed character class pattern. No user input reaches the regex unvalidated.
  const tagPattern = tag || "[a-zA-Z][a-zA-Z0-9]*";
  const re = new RegExp("<(" + tagPattern + ")\\b([^>]*)>", "gi");
  let m;

  while ((m = re.exec(html)) !== null) {
    const matchedTag = m[1];
    const attrs = m[2];
    const startIdx = m.index + m[0].length;

    // Check class/id constraints
    if (className && !hasAttribute(attrs, "class", className)) continue;
    if (id && !hasAttributeExact(attrs, "id", id)) continue;

    // Find the matching closing tag (handle nesting)
    const inner = findClosingTag(html, matchedTag, startIdx);
    if (inner !== null) {
      matches.push(inner);
    }
  }

  return matches;
}

/**
 * Check if an attribute string contains a word in a space-separated value.
 * e.g., hasAttribute('class="foo bar"', 'class', 'bar') → true
 */
function hasAttribute(attrStr, attrName, word) {
  const re = new RegExp(attrName + '\\s*=\\s*["\']([^"\']*)["\']', "i");
  const m = attrStr.match(re);
  if (!m) return false;
  return m[1].split(/\s+/).indexOf(word) >= 0;
}

/**
 * Check if an attribute has an exact value.
 */
function hasAttributeExact(attrStr, attrName, value) {
  const re = new RegExp(attrName + '\\s*=\\s*["\']([^"\']*)["\']', "i");
  const m = attrStr.match(re);
  if (!m) return false;
  return m[1].trim() === value;
}

/**
 * Find the inner content of an element by locating its matching closing tag.
 * Handles basic nesting of the same tag.
 * Note: `tag` parameter is always a validated alphanumeric string from parseSelector/regex match.
 */
function findClosingTag(html, tag, startIdx) {
  const openRe = new RegExp("<" + tag + "\\b[^>]*>", "gi");
  const closeRe = new RegExp("</" + tag + "\\s*>", "gi");
  openRe.lastIndex = startIdx;
  closeRe.lastIndex = startIdx;

  let depth = 1;
  let lastSearchIdx = startIdx;

  for (let i = 0; i < MAX_TAG_SEARCH_DEPTH && depth > 0; i++) {
    closeRe.lastIndex = lastSearchIdx;
    const closeMatch = closeRe.exec(html);
    if (!closeMatch) return null; // No closing tag found

    // Count any opens between lastSearchIdx and the close
    openRe.lastIndex = lastSearchIdx;
    let openMatch;
    while ((openMatch = openRe.exec(html)) !== null && openMatch.index < closeMatch.index) {
      depth++;
    }

    depth--; // For the close we found
    lastSearchIdx = closeMatch.index + closeMatch[0].length;

    if (depth === 0) {
      return html.slice(startIdx, closeMatch.index);
    }
  }

  return null;
}

/**
 * Extract links from HTML.
 */
function extractLinks(html, baseUrl) {
  const links = [];
  // Strip script tags first to avoid extracting links from JS code
  let safeHtml = html;
  let prevHtml;
  do {
    prevHtml = safeHtml;
    safeHtml = safeHtml.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script\s*>/gi, "");
  } while (safeHtml !== prevHtml);
  safeHtml = safeHtml.replace(/<script\b[^>]*>/gi, "");
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(safeHtml)) !== null && links.length < MAX_EXTRACTED_LINKS) {
    let href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    // Resolve relative URLs
    try {
      href = new URL(href, baseUrl).href;
    } catch (e) {
      // Keep as-is if can't resolve
    }
    // Block dangerous URI schemes
    const scheme = href.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") continue;
    if (href) {
      links.push({ href, text: text.slice(0, 200) });
    }
  }
  return links;
}

/**
 * Extract meta tags from HTML.
 */
function extractMeta(html) {
  const meta = {};
  // <meta name="..." content="...">
  const re1 = /<meta\s[^>]*name\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re1.exec(html)) !== null) {
    meta[m[1].toLowerCase()] = m[2];
  }
  // <meta property="..." content="..."> (Open Graph)
  const re2 = /<meta\s[^>]*property\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    meta[m[1].toLowerCase()] = m[2];
  }
  // Also try reversed attribute order (content before name/property)
  const re3 = /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re3.exec(html)) !== null) {
    meta[m[2].toLowerCase()] = m[1];
  }
  const re4 = /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re4.exec(html)) !== null) {
    meta[m[2].toLowerCase()] = m[1];
  }
  return meta;
}

/**
 * Extract images from HTML.
 * Returns array of { src, alt, width, height }.
 */
function extractImages(html, baseUrl) {
  const images = [];
  // Strip script tags first
  let safeHtml = stripScripts(html);
  const re = /<img\s[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(safeHtml)) !== null && images.length < MAX_EXTRACTED_IMAGES) {
    let src = m[1];
    const tag = m[0];
    // Resolve relative URLs
    try {
      src = new URL(src, baseUrl).href;
    } catch (e) {
      // Keep as-is
    }
    // Block dangerous URI schemes
    const scheme = src.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") continue;
    // Extract alt, width, height
    const altMatch = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const widthMatch = tag.match(/width\s*=\s*["']?(\d+)["']?/i);
    const heightMatch = tag.match(/height\s*=\s*["']?(\d+)["']?/i);
    images.push({
      src,
      alt: altMatch ? altMatch[1] : "",
      width: widthMatch ? parseInt(widthMatch[1], 10) : null,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null
    });
  }
  return images;
}

/**
 * Extract heading structure (h1–h6) from HTML.
 * Returns array of { level, text }.
 */
function extractHeadings(html) {
  const headings = [];
  // Strip script/style first
  let safeHtml = stripScripts(html);
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1[^>]*>/gi;
  let m;
  while ((m = re.exec(safeHtml)) !== null && headings.length < 200) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) {
      headings.push({ level: parseInt(m[1], 10), text: decodeEntities(text).slice(0, 300) });
    }
  }
  return headings;
}

/**
 * Strip boilerplate elements (nav, footer, sidebar, header, aside) from HTML
 * to produce a cleaner "readable" body — like a lightweight readability mode.
 */
function stripBoilerplate(html) {
  let content = html;
  // Remove common boilerplate tags and their content
  const boilerplateTags = ["nav", "footer", "aside", "header"];
  for (const tag of boilerplateTags) {
    // Iterative removal to handle nesting
    let prev;
    do {
      prev = content;
      content = content.replace(new RegExp("<" + tag + "\\b[^<]*(?:(?!<\\/" + tag + ")<[^<]*)*<\\/" + tag + "\\s*>", "gi"), "");
    } while (content !== prev);
    // Remove any unclosed opening tags
    content = content.replace(new RegExp("<" + tag + "\\b[^>]*>", "gi"), "");
  }
  // Remove elements with common boilerplate class/id names
  const boilerplatePatterns = [
    /class\s*=\s*["'][^"']*\b(sidebar|menu|breadcrumb|cookie|banner|advertisement|ad-|social-share|share-buttons)\b[^"']*["']/i
  ];
  // Remove <div> with boilerplate classes (one level, non-greedy)
  for (const pattern of boilerplatePatterns) {
    content = content.replace(new RegExp("<div\\s[^>]*" + pattern.source + "[^>]*>[\\s\\S]*?<\\/div>", "gi"), "");
  }
  return content;
}

/**
 * Helper: strip all script tags from HTML (used by multiple extractors).
 */
function stripScripts(html) {
  let safeHtml = html;
  let prevHtml;
  do {
    prevHtml = safeHtml;
    safeHtml = safeHtml.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script\s*>/gi, "");
  } while (safeHtml !== prevHtml);
  safeHtml = safeHtml.replace(/<script\b[^>]*>/gi, "");
  return safeHtml;
}

/**
 * Decode common HTML entities.
 * Note: &amp; is decoded last to prevent double-unescaping (e.g., &amp;lt; → &lt; → <)
 */
function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = parseInt(n, 10);
      try { return (cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : ""; } catch (e) { return ""; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const cp = parseInt(h, 16);
      try { return (cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : ""; } catch (e) { return ""; }
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Remove sensitive headers from response before returning to clients.
 */
function sanitizeHeaders(headers) {
  const safe = {};
  const keep = ["content-type", "content-length", "last-modified", "etag", "cache-control", "date", "server", "x-powered-by", "access-control-allow-origin"];
  for (const k of keep) {
    if (headers[k]) safe[k] = headers[k];
  }
  return safe;
}

module.exports = {
  webFetch,
  extractFromHtml,
  isBlockedHost,
  htmlToMarkdown,
  parseRssAtom,
  detectCharset,
  decodeBuffer
};
