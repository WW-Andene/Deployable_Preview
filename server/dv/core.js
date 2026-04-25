/**
 * dv/core.js — DeployView tool engine.
 *
 * One place to define tools. One place to call them. Uniform result shape.
 * Uniform capability gates. Single source of truth for everything the MCP
 * adapter, the HTTP REST adapter, and any future client sees.
 *
 * Tools register themselves by calling defineTool({ name, category,
 * description, schema, requires, handler }) — typically at module load
 * time inside dv/tools/*.js files.
 *
 * A tool handler returns either:
 *   • A result object from one of the helpers (jsonText / text / image /
 *     imageWithJson / ok / fail) — passed through unchanged.
 *   • A plain value — wrapped as JSON text automatically.
 *   • An object with `.error` — auto-converted to a fail() result.
 *
 * Handlers should never need try/catch — callTool catches and converts
 * thrown errors into fail() results.
 */

"use strict";

const registry = new Map();

// ── Tool registration ──────────────────────────────────────────────────────

/**
 * Register a tool with the dv engine.
 *
 * @param {object} def
 * @param {string}  def.name         — unique tool name (MCP-visible)
 * @param {string}  def.category     — logical grouping: browse / visual / state / audit / network / deploy / interact / content / ai / pages
 * @param {string}  def.description  — free-form description shown to Claude
 * @param {object}  def.schema       — JSON schema for the tool inputs
 * @param {object[]} [def.requires]  — capability requirements, e.g.
 *                                     [{ kind: "browser" },
 *                                      { kind: "library", name: "pixelmatch" },
 *                                      { kind: "groq" }]
 * @param {function} def.handler     — async (args) => result
 */
function defineTool(def) {
  if (!def || typeof def !== "object") throw new Error("defineTool: object required");
  if (!def.name) throw new Error("defineTool: name required");
  if (typeof def.handler !== "function") throw new Error("defineTool: handler function required (" + def.name + ")");
  if (registry.has(def.name)) {
    throw new Error("defineTool: duplicate tool name: " + def.name);
  }
  registry.set(def.name, {
    name: def.name,
    category: def.category || "misc",
    description: def.description || "",
    schema: def.schema || { type: "object", properties: {}, required: [] },
    requires: Array.isArray(def.requires) ? def.requires : [],
    handler: def.handler,
    cache: (def.cache && typeof def.cache === "object" && Number(def.cache.ttlMs) > 0) ? { ttlMs: Number(def.cache.ttlMs) } : null,
    deprecatedFor: typeof def.deprecatedFor === "string" ? def.deprecatedFor : null
  });
}

/**
 * Get the full flat tool list in MCP shape.
 * @returns {Array<{
 *   name: string,
 *   description: string,
 *   inputSchema: object,
 *   category: string,
 *   requires: Array<object>,
 *   deprecatedFor?: string,
 *   cached?: { ttlMs: number }
 * }>}
 */
function listTools() {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description + (t.deprecatedFor ? "  [DEPRECATED — use `" + t.deprecatedFor + "` instead]" : ""),
    inputSchema: t.schema,
    // Non-standard extras — ignored by strict MCP clients, used by our dashboards
    category: t.category,
    requires: t.requires,
    deprecatedFor: t.deprecatedFor || undefined,
    cached: t.cache ? { ttlMs: t.cache.ttlMs } : undefined
  }));
}

/** Get tools grouped by category. */
function getToolsByCategory() {
  const out = {};
  for (const t of registry.values()) {
    (out[t.category] = out[t.category] || []).push({
      name: t.name,
      description: t.description,
      requires: t.requires
    });
  }
  for (const cat of Object.keys(out)) out[cat].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function hasTool(name) { return registry.has(name); }
function getTool(name) { return registry.get(name); }
function toolCount() { return registry.size; }

// ── Result helpers — every tool returns one of these ─────────────────────

/**
 * @typedef {{ type: "text", text: string }
 *           | { type: "image", data: string, mimeType: string }} MCPContentBlock
 *
 * @typedef {{ content: MCPContentBlock[], isError?: boolean }} MCPResult
 */

/**
 * The universal tool-result shape: { content: [...], isError?: boolean }.
 * This is the MCP tool call response shape — the adapter can pass it
 * straight through.
 *
 * @param {MCPContentBlock[]} content
 * @param {boolean} [isError]
 * @returns {MCPResult}
 */
function makeResult(content, isError) {
  const r = { content };
  if (isError) r.isError = true;
  return r;
}

/** Wrap a JSON-serializable value as a single text-content response. */
function jsonText(obj) {
  return makeResult([{ type: "text", text: JSON.stringify(obj, null, 2) }]);
}

/** Wrap a string as a single text-content response. */
function text(str) {
  return makeResult([{ type: "text", text: String(str == null ? "" : str) }]);
}

/** Wrap a base64 image, optionally with a caption. */
function image(base64, mimeType, caption) {
  const content = [{ type: "image", data: base64, mimeType: mimeType || "image/png" }];
  if (caption) content.push({ type: "text", text: String(caption) });
  return makeResult(content);
}

/** Wrap a base64 image plus a JSON sidecar. */
function imageWithJson(base64, mimeType, obj) {
  return makeResult([
    { type: "image", data: base64, mimeType: mimeType || "image/png" },
    { type: "text", text: JSON.stringify(obj, null, 2) }
  ]);
}

/** Shorthand: plain value → JSON text. */
function ok(data) { return jsonText(data); }

/** Error result — adds isError:true so MCP clients style it as a failure. */
function fail(message, details) {
  const body = details != null
    ? String(message) + "\n" + JSON.stringify(details, null, 2)
    : String(message);
  return makeResult([{ type: "text", text: body }], true);
}

/**
 * Structured error for Claude: always returns a JSON object with
 * { error: true, code, message, hint?, ...details } so the model can
 * branch on the code instead of regex-parsing strings.
 *
 * Stable codes used by dv tools:
 *   REPO_NOT_FOUND, BRANCH_NOT_FOUND, SLUG_NOT_FOUND,
 *   BUILD_FAILED, BUILD_TIMEOUT, BUILD_IN_PROGRESS, NO_LOG,
 *   PORT_COLLISION, SERVER_NOT_RUNNING,
 *   BROWSER_UNAVAILABLE, LIBRARY_MISSING, GROQ_UNAUTHORIZED,
 *   BAD_ARGS, NOT_IMPLEMENTED
 */
function failCode(code, message, extra) {
  const body = Object.assign(
    { error: true, code: String(code), message: String(message) },
    (extra && typeof extra === "object") ? extra : {}
  );
  return makeResult([{ type: "text", text: JSON.stringify(body, null, 2) }], true);
}

// ── Result cache (memoize hot read-only tools) ────────────────────────────
// Small TTL cache keyed by (tool, stable JSON(args)). Tools that opt in
// via `cache: { ttlMs }` in their defineTool call get automatic memoization.
// Dashboard polling and sandbox_exec batches hammer the same read-only
// endpoints repeatedly; caching eliminates that duplicate work.

const _toolCache = new Map(); // key → { result, expiresAt }
const _CACHE_MAX = 256;

function _cacheKey(name, args) {
  try { return name + "|" + JSON.stringify(args || {}); }
  catch (_) { return name + "|<unserializable>"; }
}

function _cacheGet(key) {
  const e = _toolCache.get(key);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) { _toolCache.delete(key); return null; }
  // True LRU: re-insert to move to "most recently used" end.
  _toolCache.delete(key);
  _toolCache.set(key, e);
  return e.result;
}

function _cachePut(key, result, ttlMs) {
  // Map iteration order is insertion order, so the first key is genuinely
  // the least-recently-used (because _cacheGet re-inserts on access).
  if (_toolCache.size >= _CACHE_MAX) {
    const lruKey = _toolCache.keys().next().value;
    if (lruKey) _toolCache.delete(lruKey);
  }
  _toolCache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

function invalidateCache(prefix) {
  if (!prefix) { _toolCache.clear(); return; }
  for (const k of _toolCache.keys()) {
    if (k.startsWith(prefix + "|")) _toolCache.delete(k);
  }
}

/**
 * Classify a browser-layer error string into a stable code + hint. Takes the
 * same shape tool handlers get from browser/* modules (`{error, ...ctx}`).
 * Used so each tool can write one line instead of a bespoke try/classify
 * block:
 *
 *   if (result.error) return dv.failFromBrowser(result);
 *
 * Classification patterns are intentionally conservative — unknown errors
 * fall through as TOOL_FAILED with the raw message preserved.
 */
function failFromBrowser(result, opts) {
  const raw = String(result && result.error ? result.error : result || "");
  const extra = {};
  // Preserve any context the browser module attached (result.url, result.code, etc.)
  if (result && typeof result === "object") {
    for (const k of Object.keys(result)) {
      if (k === "error") continue;
      // Skip bulk binary fields
      if (k === "base64" || k === "raw" || k === "buffer") continue;
      extra[k] = result[k];
    }
  }
  if (opts && typeof opts === "object") Object.assign(extra, opts);

  const rules = [
    [/no browser|browser.*unavailable|still setting one up/i,          "BROWSER_UNAVAILABLE", "The headless browser isn't ready. Check dv_status; if unavailable, configure BROWSERLESS_API_KEY or install playwright."],
    [/timed out|timeout|timed-out/i,                                    "TIMEOUT",             "Operation exceeded its time budget. Raise the timeout, simplify the task, or check that the preview is actually up."],
    [/element not found|selector.*not found|no element|match(es)? nothing/i, "SELECTOR_NOT_FOUND", "The CSS selector matched nothing. Use `inspect` or `find_all` to discover the correct selector."],
    [/bounding ?box|boundingRect/i,                                    "GEOMETRY_UNRESOLVED", "The element exists but has no bounding box (hidden, display:none, or zero-size). Scroll it into view or wait for a render."],
    [/iframe not found/i,                                               "FRAME_NOT_FOUND",    "The frame descriptor didn't match any iframe. Accepts: CSS selector, URL substring, or frame name."],
    [/navigation|net::ERR_|ERR_CONNECTION|ERR_NAME/i,                   "NAV_FAILED",         "Navigation failed. Check the preview is running and the URL resolves."],
    [/library not installed|Cannot find module/i,                       "LIBRARY_MISSING",    "An optional library is missing. Install the package mentioned in the error."],
    [/groq|GROQ_API_KEY|claudeGroqAccess/i,                             "GROQ_UNAUTHORIZED",  "Groq access is not authorized. Set GROQ_API_KEY and preferences.claudeGroqAccess in deployview.json."],
    [/CDP session|dispatchTouchEvent/i,                                 "CDP_UNAVAILABLE",    "The CDP channel needed for this feature isn't available on this browser build."],
    [/decompression|charset|content-type/i,                             "RESPONSE_DECODE",    "Response could not be decoded. Try a different format flag, or fetch raw bytes via base64."],
    [/EADDRINUSE|address already in use/i,                              "PORT_IN_USE",        "Port collision — kill the conflicting process or pick another port."],
    [/ENOTFOUND|EAI_AGAIN/i,                                            "DNS_UNREACHABLE",    "Hostname could not be resolved."]
  ];
  for (const [re, code, hint] of rules) {
    if (re.test(raw)) return failCode(code, raw, Object.assign({ hint }, extra));
  }
  return failCode((opts && opts.fallbackCode) || "TOOL_FAILED", raw, extra);
}

// ── Capability gates ──────────────────────────────────────────────────────

/**
 * Resolve a `requires` entry to either null (OK) or a fail() result.
 * Called by callTool before invoking the handler.
 */
function checkRequirement(req) {
  if (!req || !req.kind) return null;

  if (req.kind === "browser") {
    const browser = require("../browser");
    if (!browser.hasPlaywright()) {
      return fail("No browser available — server is still setting one up, try again in a moment.");
    }
    return null;
  }

  if (req.kind === "library") {
    const enrich = require("../mcp-enrichments");
    const libs = Array.isArray(req.name) ? req.name : [req.name];
    const missing = libs.filter((l) => !enrich.have(l));
    if (missing.length) {
      return fail(
        "Library not installed: " + missing.join(", ") + ". Install: npm install " + missing.join(" "),
        { missing }
      );
    }
    return null;
  }

  if (req.kind === "groq") {
    const groq = require("../mcp-groq");
    if (!groq.isClaudeGroqAuthorized()) {
      return fail("Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false).");
    }
    return null;
  }

  return null;
}

// ── Tool invocation ───────────────────────────────────────────────────────

/**
 * Invoke a tool by name. Returns a normalized MCP-shape result.
 *
 * Flow:
 *   1. Look up the tool. Unknown → fail.
 *   2. Cache check (if the tool opted in via { cache: { ttlMs } }).
 *   3. Run every requirement gate. First failure → fail.
 *   4. Invoke the handler. Thrown errors → fail.
 *   5. Normalize the return value, write-through to cache on success.
 *   6. Record metrics.
 *
 * @param {string} name
 * @param {object} [args]
 * @returns {Promise<MCPResult>}
 */
async function callTool(name, args) {
  const tool = registry.get(name);
  if (!tool) return fail("Unknown tool: " + name);

  // Cache hit?
  let cacheKey = null;
  if (tool.cache) {
    cacheKey = _cacheKey(name, args);
    const hit = _cacheGet(cacheKey);
    if (hit) {
      try { require("../metrics").inc("tool.cachehit." + name); } catch (_) {}
      return hit;
    }
  }
  const _tStart = Date.now();

  // Capability checks
  for (const req of tool.requires) {
    const failure = checkRequirement(req);
    if (failure) return failure;
  }

  let result;
  try {
    result = await tool.handler(args || {});
  } catch (e) {
    const stackHead = (e && e.stack) ? String(e.stack).split("\n").slice(0, 4).join("\n") : "";
    return fail("Tool '" + name + "' failed: " + (e && e.message || e), stackHead ? { stack: stackHead } : undefined);
  }

  // Normalize: if handler returned MCP shape, pass through. Otherwise wrap.
  let normalized;
  if (result && Array.isArray(result.content)) normalized = result;
  else if (result && typeof result === "object" && result.error && !result.content) {
    normalized = fail(String(result.error), Object.keys(result).length > 1
      ? Object.fromEntries(Object.entries(result).filter(([k]) => k !== "error"))
      : undefined);
  } else {
    normalized = jsonText(result);
  }

  // Write-through cache: only cache successes
  if (cacheKey && !normalized.isError) {
    _cachePut(cacheKey, normalized, tool.cache.ttlMs);
  }

  // Metrics: per-tool latency + ok/fail counters
  try {
    const m = require("../metrics");
    m.observe("tool.latencyMs." + name, Date.now() - _tStart);
    m.inc("tool." + (normalized.isError ? "fail." : "ok.") + name);
  } catch (_) {}
  return normalized;
}

// ── Engine status / introspection ─────────────────────────────────────────

/**
 * Lightweight status report. Shows tool count, category breakdown,
 * library availability, Groq authorization, and browser state. Used by
 * /api/dv/status, the dashboard, and the `dv_status` tool.
 */
function status() {
  let libraries = {};
  let groqAuthorized = false;
  let browserAvailable = false;

  try { libraries = require("../mcp-enrichments").status(); } catch (_) {}
  try { groqAuthorized = require("../mcp-groq").isClaudeGroqAuthorized(); } catch (_) {}
  try { browserAvailable = require("../browser").hasPlaywright(); } catch (_) {}

  const byCat = {};
  for (const t of registry.values()) byCat[t.category] = (byCat[t.category] || 0) + 1;

  return {
    toolCount: registry.size,
    categories: byCat,
    browser: browserAvailable,
    groqAuthorized,
    libraries
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // registration
  defineTool,
  listTools,
  getToolsByCategory,
  hasTool,
  getTool,
  toolCount,
  // invocation
  callTool,
  // result helpers
  makeResult,
  jsonText,
  text,
  image,
  imageWithJson,
  ok,
  fail,
  failCode,
  failFromBrowser,
  // cache
  invalidateCache,
  // capability
  checkRequirement,
  // introspection
  status
};
