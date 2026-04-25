/**
 * fetch/parser.js — HTML extraction + selector matching + entity decoding.
 *
 * Pure functions over HTML strings:
 *   - extractFromHtml — top-level dispatcher honoring opts.{extractText,
 *     extractLinks, extractMeta, extractImages, extractHeadings, selector,
 *     readability}
 *   - extractTitle / extractText / extractLinks / extractMeta /
 *     extractImages / extractHeadings — narrow extractors
 *   - parseSelector / matchSelector / hasAttribute / findClosingTag — the
 *     CSS-lite selector engine used by extractText
 *   - stripBoilerplate / stripScripts / decodeEntities — HTML cleaners
 *   - sanitizeHeaders — drop sensitive response headers
 *
 * Extracted from web-fetch.js (R6.7).
 */

"use strict";

const {
  DEFAULT_MAX_TEXT_CHARS,
  MAX_TEXT_CHARS_LIMIT,
  MAX_EXTRACTED_LINKS,
  MAX_EXTRACTED_IMAGES,
  MAX_TAG_SEARCH_DEPTH
} = require("./constants");

/**
 * Top-level HTML extraction. Honors opts.{extractText, extractLinks,
 * extractMeta, extractImages, extractHeadings, selector, readability,
 * maxTextLength}. If no extract option is set, defaults to readable text.
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
  if (opts.extractLinks)    out.links    = extractLinks(html, baseUrl);
  if (opts.extractMeta)     out.meta     = extractMeta(html);
  if (opts.extractImages)   out.images   = extractImages(html, baseUrl);
  if (opts.extractHeadings) out.headings = extractHeadings(html);
  // If no extract options, provide readable text by default for HTML
  if (!opts.extractText && !opts.extractLinks && !opts.extractMeta && !opts.selector && !opts.extractImages && !opts.extractHeadings) {
    out.title = extractTitle(rawHtml);
    out.text = extractText(opts.readability ? html : rawHtml, null, maxTextLen);
  }
  out.rawHtmlLength = rawHtml.length;
  return out;
}

function resolveMaxTextLength(val) {
  if (typeof val === "number" && val > 0) {
    return Math.min(val, MAX_TEXT_CHARS_LIMIT);
  }
  return DEFAULT_MAX_TEXT_CHARS;
}

// ── Narrow extractors ──────────────────────────────────────────────────────

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : "";
}

/**
 * Extract readable text from HTML, optionally filtered by a CSS-like selector.
 */
function extractText(html, selector, maxTextLen) {
  let content = html;

  if (selector) {
    const extracted = matchSelector(html, selector);
    content = extracted.length ? extracted.join("\n\n") : html;
  }

  // Remove script and style blocks (loop to handle nested/malformed tags)
  let prev;
  do {
    prev = content;
    content = content.replace(/<script\b[^<]*(?:(?!<\/script)<[^<]*)*<\/script\s*>/gi, "");
    content = content.replace(/<style\b[^<]*(?:(?!<\/style)<[^<]*)*<\/style\s*>/gi, "");
    content = content.replace(/<noscript\b[^<]*(?:(?!<\/noscript)<[^<]*)*<\/noscript\s*>/gi, "");
  } while (content !== prev);
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

  const limit = maxTextLen || DEFAULT_MAX_TEXT_CHARS;
  if (content.length > limit) {
    content = content.slice(0, limit) + "\n\n[... truncated at " + limit + " characters]";
  }
  return content;
}

// ── CSS-like selector matching ──────────────────────────────────────────────

function parseSelector(selector) {
  if (!selector || typeof selector !== "string") return {};
  const s = selector.trim();
  let tag = null, className = null, id = null;
  const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) id = idMatch[1];
  const classMatch = s.match(/\.([a-zA-Z0-9_-]+)/);
  if (classMatch) className = classMatch[1];
  const tagMatch = s.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch) tag = tagMatch[1];
  return { tag, className, id };
}

function matchSelector(html, selector) {
  const { tag, className, id } = parseSelector(selector);
  if (!tag && !className && !id) return [];
  const matches = [];
  const tagPattern = tag || "[a-zA-Z][a-zA-Z0-9]*";
  const re = new RegExp("<(" + tagPattern + ")\\b([^>]*)>", "gi");
  let m;
  while ((m = re.exec(html)) !== null) {
    const matchedTag = m[1];
    const attrs = m[2];
    const startIdx = m.index + m[0].length;
    if (className && !hasAttribute(attrs, "class", className)) continue;
    if (id && !hasAttributeExact(attrs, "id", id)) continue;
    const inner = findClosingTag(html, matchedTag, startIdx);
    if (inner !== null) matches.push(inner);
  }
  return matches;
}

function hasAttribute(attrStr, attrName, word) {
  const re = new RegExp(attrName + '\\s*=\\s*["\']([^"\']*)["\']', "i");
  const m = attrStr.match(re);
  if (!m) return false;
  return m[1].split(/\s+/).indexOf(word) >= 0;
}

function hasAttributeExact(attrStr, attrName, value) {
  const re = new RegExp(attrName + '\\s*=\\s*["\']([^"\']*)["\']', "i");
  const m = attrStr.match(re);
  if (!m) return false;
  return m[1].trim() === value;
}

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
    if (!closeMatch) return null;
    openRe.lastIndex = lastSearchIdx;
    let openMatch;
    while ((openMatch = openRe.exec(html)) !== null && openMatch.index < closeMatch.index) depth++;
    depth--;
    lastSearchIdx = closeMatch.index + closeMatch[0].length;
    if (depth === 0) return html.slice(startIdx, closeMatch.index);
  }
  return null;
}

// ── Other extractors ──────────────────────────────────────────────────────

function extractLinks(html, baseUrl) {
  const links = [];
  let safeHtml = stripScripts(html);
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(safeHtml)) !== null && links.length < MAX_EXTRACTED_LINKS) {
    let href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    try { href = new URL(href, baseUrl).href; } catch (e) {}
    const scheme = href.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") continue;
    if (href) links.push({ href, text: text.slice(0, 200) });
  }
  return links;
}

function extractMeta(html) {
  const meta = {};
  const re1 = /<meta\s[^>]*name\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re1.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2];
  const re2 = /<meta\s[^>]*property\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re2.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2];
  const re3 = /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re3.exec(html)) !== null) meta[m[2].toLowerCase()] = m[1];
  const re4 = /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = re4.exec(html)) !== null) meta[m[2].toLowerCase()] = m[1];
  return meta;
}

function extractImages(html, baseUrl) {
  const images = [];
  let safeHtml = stripScripts(html);
  const re = /<img\s[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(safeHtml)) !== null && images.length < MAX_EXTRACTED_IMAGES) {
    let src = m[1];
    const tag = m[0];
    try { src = new URL(src, baseUrl).href; } catch (e) {}
    const scheme = src.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") continue;
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

function extractHeadings(html) {
  const headings = [];
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

// ── HTML cleaners (also exported for transform/rss to import) ─────────────

function stripBoilerplate(html) {
  let content = html;
  const boilerplateTags = ["nav", "footer", "aside", "header"];
  for (const tag of boilerplateTags) {
    let prev;
    do {
      prev = content;
      content = content.replace(new RegExp("<" + tag + "\\b[^<]*(?:(?!<\\/" + tag + ")<[^<]*)*<\\/" + tag + "\\s*>", "gi"), "");
    } while (content !== prev);
    content = content.replace(new RegExp("<" + tag + "\\b[^>]*>", "gi"), "");
  }
  const boilerplatePatterns = [
    /class\s*=\s*["'][^"']*\b(sidebar|menu|breadcrumb|cookie|banner|advertisement|ad-|social-share|share-buttons)\b[^"']*["']/i
  ];
  for (const pattern of boilerplatePatterns) {
    content = content.replace(new RegExp("<div\\s[^>]*" + pattern.source + "[^>]*>[\\s\\S]*?<\\/div>", "gi"), "");
  }
  return content;
}

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

function sanitizeHeaders(headers) {
  const safe = {};
  const keep = ["content-type", "content-length", "last-modified", "etag", "cache-control", "date", "server", "x-powered-by", "access-control-allow-origin"];
  for (const k of keep) if (headers[k]) safe[k] = headers[k];
  return safe;
}

module.exports = {
  extractFromHtml,
  resolveMaxTextLength,
  extractTitle,
  extractText,
  parseSelector,
  matchSelector,
  hasAttribute,
  hasAttributeExact,
  findClosingTag,
  extractLinks,
  extractMeta,
  extractImages,
  extractHeadings,
  stripBoilerplate,
  stripScripts,
  decodeEntities,
  sanitizeHeaders
};
