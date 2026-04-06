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

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;   // 2 MB max response body
const DEFAULT_TIMEOUT_MS = 15000;               // 15 second timeout
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_TEXT_CHARS = 50000;            // Default text extraction length
const MAX_TEXT_CHARS_LIMIT = 200000;             // Absolute max text extraction length
const MAX_BODY_CHARS = 100000;                   // Max plain-text body length
const MAX_EXTRACTED_LINKS = 200;                 // Max links to extract from HTML
const MAX_EXTRACTED_IMAGES = 100;                // Max images to extract from HTML
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
 * @param {boolean} [opts.extractImages] - Extract image URLs from HTML
 * @param {boolean} [opts.extractHeadings] - Extract heading structure (h1-h6) from HTML
 * @param {string} [opts.selector]       - CSS-like filter: tag, .class, #id, tag.class (e.g. "article", ".content", "#main")
 * @param {boolean} [opts.readability]   - Strip nav/footer/sidebar boilerplate for cleaner text
 * @param {number} [opts.maxTextLength]  - Max text extraction length (default: 50000, max: 200000)
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
    "Accept-Encoding": "gzip, deflate, br",
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

    // Decompress response based on Content-Encoding
    let stream = res;
    const encoding = (res.headers["content-encoding"] || "").toLowerCase();
    if (encoding === "gzip" || encoding === "x-gzip") {
      stream = res.pipe(zlib.createGunzip());
    } else if (encoding === "deflate") {
      stream = res.pipe(zlib.createInflate());
    } else if (encoding === "br") {
      // Brotli support (Node.js 10.16+)
      if (typeof zlib.createBrotliDecompress === "function") {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      // If brotli not available, fall through to raw stream
    }

    const chunks = [];
    let totalSize = 0;
    let truncated = false;

    stream.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        truncated = true;
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });

    stream.on("error", (e) => {
      // Decompression errors — fall back to treating as plain response
      if (chunks.length > 0) {
        processResponse(Buffer.concat(chunks).toString("utf-8"), res, parsedUrl, totalSize, truncated, opts, resolve);
      } else {
        resolve({ error: "Decompression error: " + e.message, url: parsedUrl.href });
      }
    });

    stream.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      processResponse(rawBody, res, parsedUrl, totalSize, truncated, opts, resolve);
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

/**
 * Process the response body after fetch/decompression.
 */
function processResponse(rawBody, res, parsedUrl, totalSize, truncated, opts, resolve) {
  const contentType = res.headers["content-type"] || "";
  const isHtml = contentType.includes("text/html");
  const isJson = contentType.includes("application/json") || contentType.includes("+json");
  const maxTextLen = resolveMaxTextLength(opts.maxTextLength);

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
      result.body = rawBody.slice(0, maxTextLen);
    }
    return resolve(result);
  }

  // HTML responses — optionally extract useful content
  if (isHtml) {
    // Optionally strip boilerplate before extraction
    const html = opts.readability ? stripBoilerplate(rawBody) : rawBody;

    if (opts.extractText || opts.selector) {
      result.text = extractText(html, opts.selector, maxTextLen);
    }
    if (opts.extractLinks) {
      result.links = extractLinks(html, parsedUrl.href);
    }
    if (opts.extractMeta) {
      result.meta = extractMeta(html);
    }
    if (opts.extractImages) {
      result.images = extractImages(html, parsedUrl.href);
    }
    if (opts.extractHeadings) {
      result.headings = extractHeadings(html);
    }
    // If no extract options, provide readable text by default for HTML
    if (!opts.extractText && !opts.extractLinks && !opts.extractMeta && !opts.selector && !opts.extractImages && !opts.extractHeadings) {
      result.title = extractTitle(rawBody);
      result.text = extractText(opts.readability ? html : rawBody, null, maxTextLen);
    }
    result.rawHtmlLength = rawBody.length;
    return resolve(result);
  }

  // Plain text / other
  result.body = rawBody.slice(0, MAX_BODY_CHARS);
  return resolve(result);
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
  // Use [^<]* pattern to match content, and permissive closing tags
  let prev;
  do {
    prev = content;
    content = content.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script[\s>][^>]*>/gi, "");
    content = content.replace(/<style\b[^<]*(?:(?!<\/style)<[^<]*)*<\/style[\s>][^>]*>/gi, "");
    content = content.replace(/<noscript\b[^<]*(?:(?!<\/noscript)<[^<]*)*<\/noscript[\s>][^>]*>/gi, "");
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
 * Returns { tag, className, id }
 */
function parseSelector(selector) {
  if (!selector || typeof selector !== "string") return {};
  const s = selector.trim();
  let tag = null, className = null, id = null;

  // #id
  const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) id = idMatch[1];

  // .class
  const classMatch = s.match(/\.([a-zA-Z0-9_-]+)/);
  if (classMatch) className = classMatch[1];

  // tag name (leading alphanumeric before . or #)
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

  // Build regex to find opening tags
  // We match any tag or the specific tag, then check attributes
  const tagPattern = tag ? tag : "[a-zA-Z][a-zA-Z0-9]*";
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
 */
function findClosingTag(html, tag, startIdx) {
  const openRe = new RegExp("<" + tag + "\\b[^>]*>", "gi");
  const closeRe = new RegExp("</" + tag + "[\\s>][^>]*>|</" + tag + ">", "gi");
  openRe.lastIndex = startIdx;
  closeRe.lastIndex = startIdx;

  let depth = 1;
  let lastSearchIdx = startIdx;

  // Safety limit to prevent runaway loops on malformed HTML
  for (let i = 0; i < 5000 && depth > 0; i++) {
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
    safeHtml = safeHtml.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script[\s>][^>]*>/gi, "");
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
      content = content.replace(new RegExp("<" + tag + "\\b[^<]*(?:(?!<\\/" + tag + ")<[^<]*)*<\\/" + tag + "[\\s>][^>]*>", "gi"), "");
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
    safeHtml = safeHtml.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script[\s>][^>]*>/gi, "");
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
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
