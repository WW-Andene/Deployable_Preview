/**
 * fetch/client.js — HTTP/HTTPS fetcher + dispatcher.
 *
 * Owns:
 *   - The webFetch entrypoint
 *   - doFetch (HTTP request + redirect + retry + decompression)
 *   - processResponse (charset detection + format dispatch to parser/transform/rss)
 *   - Charset detection + normalization + buffer decode
 *   - jsonPath lookup
 *   - Header/cookie/form-body helpers
 *
 * Extracted from web-fetch.js (R6.7).
 */

"use strict";

const http  = require("http");
const https = require("https");
const { URL } = require("url");
const zlib  = require("zlib");

const {
  MAX_RESPONSE_BYTES,
  MAX_RESPONSE_BYTES_HARD,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_RETRIES,
  MAX_BASE64_BYTES,
  MAX_BODY_CHARS,
  DEFAULT_USER_AGENT,
  DEFAULT_ACCEPT,
  DEFAULT_ACCEPT_LANGUAGE,
  isBlockedHost
} = require("./constants");

const {
  extractFromHtml,
  extractTitle,
  extractText,
  extractLinks,
  extractMeta,
  extractImages,
  extractHeadings,
  stripBoilerplate,
  sanitizeHeaders,
  resolveMaxTextLength
} = require("./parser");

const { htmlToMarkdown } = require("./transform");
const { parseRssAtom } = require("./rss");

/**
 * Fetch a URL and return the response body and metadata. See web-fetch.js
 * docstring history for the full opts contract — preserved verbatim.
 */
function webFetch(opts) {
  return new Promise((resolve) => {
    if (!opts || !opts.url) {
      return resolve({ error: "url parameter is required" });
    }

    let parsed;
    try { parsed = new URL(opts.url); }
    catch (e) { return resolve({ error: "Invalid URL: " + e.message }); }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return resolve({ error: "Only http and https URLs are supported" });
    }
    if (isBlockedHost(parsed.hostname)) {
      return resolve({ error: "Requests to private/internal network addresses are not allowed" });
    }
    // F-C012: DNS-rebinding guard is plumbed via a custom `lookup` callback
    // that's installed on the actual http(s).request below. The callback
    // gets called with the real resolved IP and rejects connections to
    // private ranges, eliminating the TOCTOU window between filter and
    // socket connect.

    const method = (opts.method || "GET").toUpperCase();
    // Use ?? not || so callers can disable defaults with 0 (e.g. maxRedirects:0 → never follow).
    const timeout = Math.min(Math.max(opts.timeout ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
    const maxRedirects = Math.min(opts.maxRedirects ?? MAX_REDIRECTS, 15);
    const maxSize = Math.min(opts.maxSize ?? MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES_HARD);
    const retries  = Math.min(Math.max(opts.retries != null ? opts.retries : 2, 0), MAX_RETRIES);

    const userHeaders = normalizeHeaders(opts.headers);
    const reqHeaders = {
      "User-Agent":      opts.userAgent || userHeaders["user-agent"] || DEFAULT_USER_AGENT,
      "Accept":          userHeaders["accept"] || DEFAULT_ACCEPT,
      "Accept-Language": opts.acceptLanguage || userHeaders["accept-language"] || DEFAULT_ACCEPT_LANGUAGE,
      "Accept-Encoding": "gzip, deflate, br"
    };
    if (opts.headers && typeof opts.headers === "object") {
      for (const k in opts.headers) {
        if (typeof opts.headers[k] !== "string") continue;
        const lk = k.toLowerCase();
        if (lk === "host" || lk === "content-length") continue;
        reqHeaders[k] = opts.headers[k];
      }
    }
    if (opts.referer) reqHeaders["Referer"] = opts.referer;
    const cookieHeader = buildCookieHeader(opts.cookies);
    if (cookieHeader) reqHeaders["Cookie"] = cookieHeader;

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

  const reqHeaders = { ...headers };
  if (body != null && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")) {
    const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    reqHeaders["Content-Length"] = buf.length;
  }

  // F-C012: same lookup that's used for the actual TCP connect — TOCTOU-safe.
  const dns = require("dns");
  const safeLookup = function(hostname, options, cb) {
    if (typeof options === "function") { cb = options; options = {}; }
    dns.lookup(hostname, options, function(err, address, family) {
      if (err) return cb(err);
      const addrs = Array.isArray(address) ? address : [{ address, family }];
      for (const a of addrs) {
        if (isBlockedHost(a.address)) {
          return cb(new Error("DNS resolved to a blocked address: " + a.address));
        }
      }
      cb(null, address, family);
    });
  };

  const reqOpts = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: method,
    headers: reqHeaders,
    timeout: timeout,
    lookup: safeLookup
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
      try { redirectUrl = new URL(res.headers.location, parsedUrl.href); }
      catch (e) { return resolve({ error: "Invalid redirect URL: " + res.headers.location }); }
      if (isBlockedHost(redirectUrl.hostname)) {
        return resolve({ error: "Redirect to private/internal network address blocked" });
      }
      let nextMethod = method, nextBody = body;
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        if (method !== "GET" && method !== "HEAD") { nextMethod = "GET"; nextBody = null; }
      }
      res.resume();
      return doFetch(redirectUrl, nextMethod, headers, nextBody, timeout, redirectsLeft - 1, maxSize, retriesLeft, opts, resolve);
    }

    // Retry on 429 / 502 / 503 / 504 if retries remain
    if ((res.statusCode === 429 || res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) && retriesLeft > 0) {
      const retryAfterHdr = res.headers["retry-after"];
      let delay = 1500 * (MAX_RETRIES - retriesLeft + 1);
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
    if (encoding === "gzip" || encoding === "x-gzip")           stream = res.pipe(zlib.createGunzip());
    else if (encoding === "deflate") {
      stream = res.pipe(zlib.createInflate());
      stream.on("error", () => { /* swallowed, will retry raw inflate below */ });
    }
    else if (encoding === "br" && typeof zlib.createBrotliDecompress === "function") stream = res.pipe(zlib.createBrotliDecompress());
    else if (encoding === "zstd" && typeof zlib.createZstdDecompress === "function") stream = res.pipe(zlib.createZstdDecompress());

    const chunks = [];
    let totalSize = 0;
    let truncated = false;
    let aborted = false;

    stream.on("data", (chunk) => {
      if (aborted) return;
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        truncated = true; aborted = true;
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });

    stream.on("error", (e) => {
      if (chunks.length > 0) processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
      else resolve({ error: "Decompression error: " + e.message, url: parsedUrl.href });
    });

    stream.on("end", () => {
      processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
    });

    res.on("error", (e) => {
      if (chunks.length > 0) processResponse(Buffer.concat(chunks), res, parsedUrl, totalSize, truncated, opts, resolve);
      else resolve({ error: "Response error: " + e.message, url: parsedUrl.href });
    });
  });

  req.on("timeout", () => {
    req.destroy();
    if (!retry("timeout", 1000)) {
      resolve({ error: "Request timed out after " + timeout + "ms", url: parsedUrl.href });
    }
  });

  req.on("error", (e) => {
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

  if (format === "raw") { result.body = rawBody; return resolve(result); }
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
    if (feed) result.feed = feed;
    else      result.text = extractText(rawBody, null, maxTextLen);
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

  // ── Plain text / JS / CSS / YAML / CSV / etc. ──
  if (format === "markdown" && mime.startsWith("text/")) {
    result.markdown = rawBody.slice(0, maxTextLen);
  } else {
    result.body = rawBody.slice(0, MAX_BODY_CHARS);
  }
  return resolve(result);
}

// ── Character encoding detection ────────────────────────────────────────────

function detectCharset(buffer, contentTypeHeader, isHtml) {
  if (contentTypeHeader) {
    const m = contentTypeHeader.match(/charset\s*=\s*["']?([^"';\s]+)/i);
    if (m) return normalizeCharset(m[1]);
  }
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return "utf-8";
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) return "utf-16be";
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) return "utf-16le";
  if (isHtml) {
    const head = buffer.slice(0, Math.min(4096, buffer.length)).toString("latin1");
    let m = head.match(/<meta\s[^>]*charset\s*=\s*["']?([a-zA-Z0-9_\-:]+)/i);
    if (m) return normalizeCharset(m[1]);
    m = head.match(/<meta\s[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9_\-:]+)/i);
    if (m) return normalizeCharset(m[1]);
  }
  return "utf-8";
}

function normalizeCharset(cs) {
  const c = String(cs).toLowerCase().replace(/[ _]/g, "-");
  const aliases = {
    "ascii":       "ascii",  "us-ascii":    "ascii",
    "latin1":      "iso-8859-1", "latin-1":     "iso-8859-1", "iso8859-1":   "iso-8859-1", "iso-8859-1":  "iso-8859-1",
    "cp1252":      "windows-1252", "cp-1252":     "windows-1252",
    "gbk":         "gbk", "gb2312":      "gb2312",
    "shift-jis":   "shift_jis", "shiftjis":    "shift_jis", "sjis":        "shift_jis", "x-sjis":      "shift_jis",
    "euc-jp":      "euc-jp", "euc-kr":      "euc-kr", "big5":        "big5",
    "utf8":        "utf-8", "utf-8":       "utf-8",
    "utf-16":      "utf-16le", "utf-16le":    "utf-16le", "utf-16be":    "utf-16be"
  };
  return aliases[c] || c;
}

function decodeBuffer(buffer, charset) {
  try { return new TextDecoder(charset, { fatal: false }).decode(buffer); }
  catch (e) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(buffer); }
    catch (_) { return buffer.toString("utf-8"); }
  }
}

// ── JSON path lookup ────────────────────────────────────────────────────────

function jsonPathLookup(obj, path) {
  if (!path) return obj;
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(p)) cur = cur[parseInt(p, 10)];
    else if (typeof cur === "object")           cur = cur[p];
    else return undefined;
  }
  return cur;
}

module.exports = {
  webFetch,
  detectCharset,
  decodeBuffer,
  normalizeCharset,
  jsonPathLookup
};
