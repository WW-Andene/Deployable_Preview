/**
 * web-fetch.js — HTTP fetch / web scraping utility for DeployView
 *
 * Provides a lightweight web fetching and scraping tool that works across
 * all DeployView interfaces:
 *   - MCP stdio (Claude Desktop, Termux)
 *   - MCP Streamable HTTP (Claude web at claude.ai)
 *   - REST HTTP API (/api/fetch)
 *
 * Uses only Node.js built-in modules (http, https, url) so it runs on
 * Termux and other constrained environments without extra dependencies.
 *
 * Features:
 *   - Fetch any public URL (HTML, JSON, text, etc.)
 *   - Extract readable text from HTML (strip tags)
 *   - Extract links, images, meta tags from HTML
 *   - Follow redirects (configurable depth)
 *   - Custom headers and timeout support
 *   - Response size limiting for safety
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;   // 2 MB max response body
const DEFAULT_TIMEOUT_MS = 15000;               // 15 second timeout
const MAX_REDIRECTS = 5;
const MAX_TEXT_CHARS = 50000;                    // Max text extraction length
const MAX_BODY_CHARS = 100000;                   // Max plain-text body length
const MAX_EXTRACTED_LINKS = 200;                 // Max links to extract from HTML
const MIN_TIMEOUT_MS = 5000;                     // Minimum allowed timeout
const USER_AGENT = "DeployView/1.0 (MCP web-fetch tool)";

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
 * @param {string} opts.url              - URL to fetch (required)
 * @param {string} [opts.method]         - HTTP method (default: GET)
 * @param {object} [opts.headers]        - Custom request headers
 * @param {string} [opts.body]           - Request body (for POST/PUT)
 * @param {number} [opts.timeout]        - Timeout in ms (default: 15000)
 * @param {number} [opts.maxRedirects]   - Max redirects to follow (default: 5)
 * @param {number} [opts.maxSize]        - Max response bytes (default: 2MB)
 * @param {boolean} [opts.extractText]   - Strip HTML tags and return plain text
 * @param {boolean} [opts.extractLinks]  - Extract links from HTML
 * @param {boolean} [opts.extractMeta]   - Extract meta tags from HTML
 * @param {string} [opts.selector]       - Basic CSS-like tag filter (e.g. "article", "main", "p")
 * @returns {Promise<object>}
 */
function webFetch(opts) {
  return new Promise((resolve, reject) => {
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
    const timeout = Math.min(Math.max(opts.timeout || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), 30000);
    const maxRedirects = Math.min(opts.maxRedirects || MAX_REDIRECTS, 10);
    const maxSize = Math.min(opts.maxSize || MAX_RESPONSE_BYTES, 5 * 1024 * 1024);

    doFetch(parsed, method, opts.headers || {}, opts.body, timeout, maxRedirects, maxSize, opts, resolve);
  });
}

function doFetch(parsedUrl, method, headers, body, timeout, redirectsLeft, maxSize, opts, resolve) {
  const transport = parsedUrl.protocol === "https:" ? https : http;

  const reqHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html, application/json, text/plain, */*",
    "Accept-Encoding": "identity",
    ...headers
  };

  const reqOpts = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: method,
    headers: reqHeaders,
    timeout: timeout
  };

  const req = transport.request(reqOpts, (res) => {
    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      if (redirectsLeft <= 0) {
        return resolve({ error: "Too many redirects", statusCode: res.statusCode });
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
      res.resume(); // Drain response
      return doFetch(redirectUrl, method, headers, body, timeout, redirectsLeft - 1, maxSize, opts, resolve);
    }

    const chunks = [];
    let totalSize = 0;
    let truncated = false;

    res.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        truncated = true;
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });

    res.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      const contentType = res.headers["content-type"] || "";
      const isHtml = contentType.includes("text/html");
      const isJson = contentType.includes("application/json") || contentType.includes("+json");

      const result = {
        url: parsedUrl.href,
        statusCode: res.statusCode,
        contentType: contentType.split(";")[0].trim(),
        contentLength: totalSize,
        truncated: truncated,
        headers: sanitizeHeaders(res.headers)
      };

      // JSON responses — parse and return
      if (isJson) {
        try {
          result.json = JSON.parse(rawBody);
        } catch (e) {
          result.body = rawBody.slice(0, MAX_TEXT_CHARS);
        }
        return resolve(result);
      }

      // HTML responses — optionally extract useful content
      if (isHtml) {
        if (opts.extractText || opts.selector) {
          result.text = extractText(rawBody, opts.selector);
        }
        if (opts.extractLinks) {
          result.links = extractLinks(rawBody, parsedUrl.href);
        }
        if (opts.extractMeta) {
          result.meta = extractMeta(rawBody);
        }
        // If no extract options, provide readable text by default for HTML
        if (!opts.extractText && !opts.extractLinks && !opts.extractMeta && !opts.selector) {
          result.title = extractTitle(rawBody);
          result.text = extractText(rawBody, null);
        }
        result.rawHtmlLength = rawBody.length;
        return resolve(result);
      }

      // Plain text / other
      result.body = rawBody.slice(0, MAX_BODY_CHARS);
      return resolve(result);
    });

    res.on("error", (e) => {
      resolve({ error: "Response error: " + e.message, url: parsedUrl.href });
    });
  });

  req.on("timeout", () => {
    req.destroy();
    resolve({ error: "Request timed out after " + timeout + "ms", url: parsedUrl.href });
  });

  req.on("error", (e) => {
    resolve({ error: "Request failed: " + e.message, url: parsedUrl.href });
  });

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    req.write(typeof body === "string" ? body : JSON.stringify(body));
  }
  req.end();
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
 * Extract readable text from HTML, optionally filtered by a tag name.
 * This is a lightweight extraction — no DOM parser needed.
 */
function extractText(html, selector) {
  let content = html;

  // If a selector (tag name) is specified, extract only that tag's content
  if (selector) {
    const tag = selector.replace(/[^a-zA-Z0-9-]/g, "");
    const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "gi");
    const matches = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      matches.push(m[1]);
    }
    content = matches.length ? matches.join("\n\n") : html;
  }

  // Remove script and style blocks (loop to handle nested/malformed tags)
  let prev;
  do {
    prev = content;
    content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
    content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
    content = content.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "");
  } while (content !== prev);

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
  if (content.length > MAX_TEXT_CHARS) {
    content = content.slice(0, MAX_TEXT_CHARS) + "\n\n[... truncated at " + MAX_TEXT_CHARS + " characters]";
  }

  return content;
}

/**
 * Extract links from HTML.
 */
function extractLinks(html, baseUrl) {
  const links = [];
  // Strip script tags first to avoid extracting links from JS code
  const safeHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
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

module.exports = { webFetch };
