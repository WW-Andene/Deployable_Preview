/**
 * web-fetch.js — re-export shim (R6.7).
 *
 * Original 1271-LOC monolith was split into focused modules:
 *   - fetch/constants.js — limits, defaults, SSRF guard
 *   - fetch/parser.js    — HTML extractors, selector engine, entity decode
 *   - fetch/transform.js — HTML → Markdown converter
 *   - fetch/rss.js       — RSS / Atom / sitemap parser
 *   - fetch/client.js    — HTTP/HTTPS fetcher + dispatcher
 *
 * This shim preserves the legacy import surface so the 4 active callers
 * (routes/api/fetch.js, dv/tools/network.js, browser/network.js, plus the
 * server itself) keep working without churn.
 *
 * Public surface preserved (per the original module.exports):
 *   webFetch, extractFromHtml, isBlockedHost, htmlToMarkdown,
 *   parseRssAtom, detectCharset, decodeBuffer
 */

"use strict";

const { isBlockedHost }    = require("./fetch/constants");
const { extractFromHtml }  = require("./fetch/parser");
const { htmlToMarkdown }   = require("./fetch/transform");
const { parseRssAtom }     = require("./fetch/rss");
const { webFetch, detectCharset, decodeBuffer } = require("./fetch/client");

module.exports = {
  webFetch,
  extractFromHtml,
  isBlockedHost,
  htmlToMarkdown,
  parseRssAtom,
  detectCharset,
  decodeBuffer
};
