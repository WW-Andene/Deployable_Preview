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
    handler: def.handler
  });
}

/** Get the full flat tool list in MCP shape. */
function listTools() {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.schema,
    // Non-standard extras — ignored by strict MCP clients, used by our dashboards
    category: t.category,
    requires: t.requires
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
 * The universal tool-result shape: { content: [...], isError?: boolean }.
 * This is the MCP tool call response shape — the adapter can pass it
 * straight through.
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

// ── Capability gates ──────────────────────────────────────────────────────

/**
 * Resolve a `requires` entry to either null (OK) or a fail() result.
 * Called by callTool before invoking the handler.
 */
function checkRequirement(req) {
  if (!req || !req.kind) return null;

  if (req.kind === "browser") {
    const browser = require("../mcp-browser");
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
 *   2. Run every requirement gate. First failure → fail.
 *   3. Invoke the handler. Thrown errors → fail.
 *   4. Normalize the return value.
 */
async function callTool(name, args) {
  const tool = registry.get(name);
  if (!tool) return fail("Unknown tool: " + name);

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
  if (result && Array.isArray(result.content)) return result;
  // Primitive returned a raw error object — upgrade to fail()
  if (result && typeof result === "object" && result.error && !result.content) {
    return fail(String(result.error), Object.keys(result).length > 1
      ? Object.fromEntries(Object.entries(result).filter(([k]) => k !== "error"))
      : undefined);
  }
  return jsonText(result);
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
  try { browserAvailable = require("../mcp-browser").hasPlaywright(); } catch (_) {}

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
  // capability
  checkRequirement,
  // introspection
  status
};
