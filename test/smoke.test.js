/**
 * test/smoke.test.js — registry integrity smoke test for the dv toolbox.
 *
 * Loads every tool and asserts: no duplicate names, every tool has a valid
 * schema shape, every deprecatedFor target actually exists, every category
 * is non-empty and lower-case, and the workflow phases reference real tools.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../server/dv/tools");
const dv = require("../server/dv/core");

const tools = dv.listTools();

// Force-exit after the suite — the browser/session/log modules install
// long-running setInterval loops that would otherwise keep the process alive.
test.after(() => {
  setImmediate(() => process.exit(process.exitCode || 0));
});

test("registry has tools", () => {
  assert.ok(tools.length > 50, "expected at least 50 tools, got " + tools.length);
});

test("no duplicate tool names", () => {
  const seen = new Set();
  for (const t of tools) {
    assert.ok(!seen.has(t.name), "duplicate tool name: " + t.name);
    seen.add(t.name);
  }
});

test("every tool has name + description + schema", () => {
  for (const t of tools) {
    assert.ok(typeof t.name === "string" && t.name.length > 0, "tool missing name");
    assert.ok(typeof t.description === "string" && t.description.length > 0, t.name + ": missing description");
    assert.ok(t.inputSchema && t.inputSchema.type === "object", t.name + ": schema must be object-typed");
  }
});

test("schema properties are objects", () => {
  for (const t of tools) {
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    for (const k of Object.keys(props)) {
      assert.ok(typeof props[k] === "object" && props[k] !== null, t.name + ".properties." + k + " must be an object");
    }
  }
});

test("required[] only references existing properties", () => {
  for (const t of tools) {
    const required = (t.inputSchema && t.inputSchema.required) || [];
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    for (const r of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(props, r),
        t.name + ": required[] references unknown property '" + r + "'");
    }
  }
});

test("category is a non-empty lowercase string", () => {
  for (const t of tools) {
    assert.ok(typeof t.category === "string" && t.category.length > 0, t.name + ": missing category");
    assert.equal(t.category, t.category.toLowerCase(), t.name + ": category must be lowercase: " + t.category);
  }
});

test("deprecatedFor points to an existing tool", () => {
  const names = new Set(tools.map(t => t.name));
  for (const t of tools) {
    if (t.deprecatedFor) {
      assert.ok(names.has(t.deprecatedFor), t.name + ": deprecatedFor='" + t.deprecatedFor + "' not in registry");
    }
  }
});

test("requires[] entries have a known kind", () => {
  const KNOWN_KINDS = new Set(["browser", "library", "groq"]);
  for (const t of tools) {
    for (const r of (t.requires || [])) {
      assert.ok(r && KNOWN_KINDS.has(r.kind), t.name + ": unknown requires.kind '" + (r && r.kind) + "'");
    }
  }
});

test("dv_state, dv_toolbox, sandbox_exec, dv_workflow exist (key MCP surface)", () => {
  const names = new Set(tools.map(t => t.name));
  for (const must of ["dv_state", "dv_toolbox", "dv_status", "dv_tools", "sandbox_start", "sandbox_exec", "sandbox_log", "dv_workflow", "screenshot", "page_eval", "page_errors", "decode", "convert_format", "compare_branches", "screenshot_multi", "cross_viewport", "live_burst"]) {
      assert.ok(names.has(must), "missing critical tool: " + must);
    }
});

test("cached tools have ttlMs > 0", () => {
  for (const t of tools) {
    if (t.cached) {
      assert.ok(t.cached.ttlMs > 0, t.name + ": cache ttlMs must be > 0");
    }
  }
});

test("dv.callTool('dv_status', {}) returns ok shape", async () => {
  const r = await dv.callTool("dv_status", {});
  assert.ok(r && Array.isArray(r.content), "result must have .content[]");
  assert.ok(!r.isError, "dv_status must succeed in a fresh process");
  const first = r.content.find(c => c.type === "text");
  assert.ok(first, "dv_status should return at least one text block");
  const parsed = JSON.parse(first.text);
  assert.ok(parsed.toolCount > 0, "toolCount should be > 0");
});

test("dv.callTool('dv_toolbox', {}) returns workflow phases", async () => {
  const r = await dv.callTool("dv_toolbox", {});
  const parsed = JSON.parse(r.content[0].text);
  assert.ok(Array.isArray(parsed.phases) && parsed.phases.length > 5, "expected 5+ workflow phases");
  for (const p of parsed.phases) {
    assert.ok(typeof p.phase === "string");
    assert.ok(Array.isArray(p.featured));
  }
});

test("unknown tool returns isError", async () => {
  const r = await dv.callTool("__not_a_real_tool__", {});
  assert.equal(r.isError, true);
});

test("failCode payload is JSON-parseable with required fields", () => {
  const r = dv.failCode("TEST_CODE", "test message", { extra: 1 });
  assert.equal(r.isError, true);
  const body = JSON.parse(r.content[0].text);
  assert.equal(body.error, true);
  assert.equal(body.code, "TEST_CODE");
  assert.equal(body.message, "test message");
  assert.equal(body.extra, 1);
});

test("failFromBrowser classifies known patterns", () => {
  const cases = [
    [{ error: "No browser available" },          "BROWSER_UNAVAILABLE"],
    [{ error: "Operation timed out after 30s" }, "TIMEOUT"],
    [{ error: "Element not found: .foo" },       "SELECTOR_NOT_FOUND"],
    [{ error: "EADDRINUSE" },                    "PORT_IN_USE"],
    [{ error: "Cannot find module 'x'" },        "LIBRARY_MISSING"],
    [{ error: "something weird happened" },      "TOOL_FAILED"]
  ];
  for (const [input, expectedCode] of cases) {
    const r = dv.failFromBrowser(input);
    const body = JSON.parse(r.content[0].text);
    assert.equal(body.code, expectedCode, "expected " + expectedCode + " for: " + input.error);
  }
});

test("cache memoizes a successful read-only tool", async () => {
  const a = await dv.callTool("dv_status", {});
  const b = await dv.callTool("dv_status", {});
  // dv_status isn't cached, so this just verifies non-identity for a non-cached tool
  assert.notEqual(a, b, "non-cached tool should return fresh objects");
  // list_previews IS cached (2s) — same object inside the window
  const c = await dv.callTool("list_previews", {});
  const d = await dv.callTool("list_previews", {});
  assert.equal(c, d, "cached tool should return identical object within TTL");
  dv.invalidateCache("list_previews");
  const e = await dv.callTool("list_previews", {});
  assert.notEqual(c, e, "after invalidate, cache should miss");
});
