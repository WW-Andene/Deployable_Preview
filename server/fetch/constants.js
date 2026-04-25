/**
 * fetch/constants.js — limits, timeouts, default headers, SSRF guard.
 *
 * Pure constants (and one helper that uses one of them — kept here so
 * everything related to "what the fetcher refuses to do" is in one place).
 *
 * Extracted from web-fetch.js (R6.7).
 */

"use strict";

// ── Sizes & timeouts (configurable via web_fetch options) ──────────────────

const MAX_RESPONSE_BYTES = 1024 * 1024 * 1024;        // 1 GB default max response body
const MAX_RESPONSE_BYTES_HARD = 4 * 1024 * 1024 * 1024; // 4 GB absolute hard cap (Node Buffer limit)
const DEFAULT_TIMEOUT_MS = 900000;                     // 15 minute default timeout
const MAX_TIMEOUT_MS = 1800000;                        // 30 minute absolute max
const MIN_TIMEOUT_MS = 5000;                            // Minimum allowed timeout
const MAX_REDIRECTS = 16;
const MAX_RETRIES = 3;                                  // Max retries on 429/503/network errors
const MAX_BASE64_BYTES = 1024 * 1024 * 1024;           // Max binary size to base64-encode (1 GB)

// ── Text extraction limits ─────────────────────────────────────────────────

const DEFAULT_MAX_TEXT_CHARS = 500000;                  // Default text extraction length
const MAX_TEXT_CHARS_LIMIT = 100000000;                 // Absolute max text extraction length (~100 M chars)
const MAX_BODY_CHARS = 100000000;                       // Max plain-text body length (~100 M chars)
const MAX_EXTRACTED_LINKS = 50000;                      // Max links to extract from HTML
const MAX_EXTRACTED_IMAGES = 20000;                     // Max images to extract from HTML
const MAX_TAG_SEARCH_DEPTH = 50000;                     // Max iterations when searching for closing tags

// ── Default request headers ────────────────────────────────────────────────

// Modern Chrome User-Agent — many sites reject unfamiliar UAs with 403.
// Kept current-ish so we look like a real browser.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

// ── Blocked hosts (prevent SSRF to internal networks) ──────────────────────

const BLOCKED_HOST_RE = /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|localhost|::1|\[::1\])$/i;

function isBlockedHost(hostname) {
  return BLOCKED_HOST_RE.test(hostname);
}

module.exports = {
  MAX_RESPONSE_BYTES,
  MAX_RESPONSE_BYTES_HARD,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_RETRIES,
  MAX_BASE64_BYTES,
  DEFAULT_MAX_TEXT_CHARS,
  MAX_TEXT_CHARS_LIMIT,
  MAX_BODY_CHARS,
  MAX_EXTRACTED_LINKS,
  MAX_EXTRACTED_IMAGES,
  MAX_TAG_SEARCH_DEPTH,
  DEFAULT_USER_AGENT,
  DEFAULT_ACCEPT,
  DEFAULT_ACCEPT_LANGUAGE,
  BLOCKED_HOST_RE,
  isBlockedHost
};
