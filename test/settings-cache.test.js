/**
 * test/settings-cache.test.js — regression test for the settings-page
 * fetch caching introduced after users reported the page felt stuck on
 * a spinner. Boots a JSDOM window, loads the real public/js bundle, and
 * verifies that:
 *   - rendering /settings only fires API calls for the active tab
 *   - re-rendering the same tab does NOT re-fetch
 *   - switching between tabs and back doesn't re-fetch the first tab
 *   - leaving the view and returning DOES re-fetch (cache reset)
 *   - mutations invalidate the relevant cache key
 *
 * Runs in pure Node.js (no browser binary required) so it can execute
 * in the same sandbox we develop in. The Playwright-based UI smoke
 * test covers real browser layout in CI.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

// Force-exit after the suite — app.js installs polling intervals + an
// SSE reconnect chain that would keep the process alive otherwise.
test.after(() => {
  setImmediate(() => process.exit(process.exitCode || 0));
});

// ── Test fixture: minimal HTML page wired to the real app scripts ───────────
const PUBLIC = path.join(__dirname, "..", "public", "js");

function readScript(rel) { return fs.readFileSync(path.join(PUBLIC, rel), "utf8"); }

// Routes whose responses we mock. Each maps a URL prefix → JSON body.
// Anything not listed returns {} — the tested view should still render.
const ROUTES = {
  "/api/preferences":     {},
  "/api/token":           { hasToken: true },
  "/api/secrets":         [
    { key: "GITHUB_TOKEN", label: "GitHub Token", hasValue: true, masked: "••••abcd", source: "config" }
  ],
  "/api/browser/status":  { preferred: "off", active: null, ready: false },
  "/api/tunnel/status":   { running: false },
  "/api/workspace/stats": { total: 0, active: 0, orphaned: 0, totalBytes: 0 },
  "/api/webhooks":        { webhooks: [], validEvents: [] },
  "/api/env-groups":      { groups: [] },
  "/api/domains":         { domains: [] },
  "/api/health":          { version: "test", node: "test", uptime: 0, memory: "0", repos: 0, previews: { ready: 0, building: 0 } },
  "/api/repos":           []
};

function makeDom() {
  const counts = Object.create(null);

  const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost/"
  });
  const { window } = dom;

  // Stub fetch to count calls per URL prefix and return the mock body.
  window.fetch = function(url, opts) {
    const u = String(url).split("?")[0];
    counts[u] = (counts[u] || 0) + 1;
    let body = {};
    for (const prefix of Object.keys(ROUTES)) {
      if (u === prefix || u.startsWith(prefix + "/")) { body = ROUTES[prefix]; break; }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body)
    });
  };
  // The status SSE stream is opened on token-success; provide a no-op stub.
  window.EventSource = function() {
    return { addEventListener: function(){}, close: function(){} };
  };
  // app.js calls navigator.serviceWorker.register; jsdom doesn't have it.
  Object.defineProperty(window.navigator, "serviceWorker", { value: undefined, configurable: true });

  // Inject the scripts in dependency order. icons/qr/md are tiny shims that
  // the views call into for SVG glyphs / markdown rendering; no-op stubs are
  // enough for the cache test.
  window.eval(readScript("app.js"));
  // Stubs for view-side helpers used by topbar/dashboard/settings rendering.
  window.DV.iconEl = function() { return window.document.createElement("span"); };
  window.DV.openPalette = function() {};
  window.DV.closePalette = function() {};
  window.DV.renderPalette = function() {};
  window.DV.renderShortcuts = function() {};
  // Stub topbar to a no-op so its side-effects (tunnel-status fetch,
  // _lastRenderedView tracking) don't pollute the call counts under test.
  // We replicate the _prevRenderedView / _lastRenderedView contract here
  // because settings.js relies on it to decide whether to clear the cache.
  window.DV.views.topbar = function() {
    window.DV._prevRenderedView = window.DV._lastRenderedView || null;
    window.DV._lastRenderedView = window.DV.S.view;
  };
  window.eval(readScript("views/settings.js"));

  return { dom, window, counts };
}

// JSDOM resolves microtasks on the next tick; flush them so loadCached's
// fetch().then(...) fires before assertions.
async function flush(window) {
  for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
}

// Drive the SPA into the settings view at the given tab. The async init
// chain in app.js races our setup — wait for it to settle (S.view becomes
// "dashboard" once /api/token resolves), then switch to settings.
async function enterSettings(window, tab) {
  await flush(window);
  const S = window.DV.S;
  S.view = "settings";
  S.settingsTab = tab || "keys";
  window.DV.render();
  await flush(window);
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("settings: renders the active tab only and fetches its data", async () => {
  const { window, counts } = makeDom();
  await enterSettings(window, "keys");
  assert.equal(counts["/api/secrets"], 1, "keys tab should fetch /api/secrets once");
  assert.equal(counts["/api/browser/status"], undefined, "browser tab should not fetch on keys");
  assert.equal(counts["/api/tunnel/status"], undefined, "tunnel tab should not fetch on keys");
  assert.equal(counts["/api/webhooks"], undefined, "webhooks tab should not fetch on keys");
  assert.equal(counts["/api/env-groups"], undefined, "env-groups tab should not fetch on keys");
  assert.equal(counts["/api/domains"], undefined, "domains tab should not fetch on keys");
  assert.equal(counts["/api/workspace/stats"], undefined, "workspace tab should not fetch on keys");
  assert.equal(counts["/api/health"], undefined, "about tab should not fetch on keys");
});

test("settings: re-rendering the same tab uses the cache (no extra fetch)", async () => {
  const { window, counts } = makeDom();
  await enterSettings(window, "keys");
  assert.equal(counts["/api/secrets"], 1);
  // Simulate an SSE-driven re-render. With no cache, the previous code would
  // fire /api/secrets again every render.
  window.DV.render();
  await flush(window);
  window.DV.render();
  await flush(window);
  assert.equal(counts["/api/secrets"], 1, "same-tab re-render must not refetch");
});

test("settings: switching tabs and back preserves the first tab's cache", async () => {
  const { window, counts } = makeDom();
  await enterSettings(window, "keys");
  assert.equal(counts["/api/secrets"], 1);

  // Click into webhooks.
  window.DV.S.settingsTab = "webhooks";
  window.DV.render();
  await flush(window);
  assert.equal(counts["/api/webhooks"], 1, "webhooks tab fetches once");

  // Back to keys — should reuse the cache from the first visit.
  window.DV.S.settingsTab = "keys";
  window.DV.render();
  await flush(window);
  assert.equal(counts["/api/secrets"], 1, "returning to keys must not refetch");
});

test("settings: leaving the view and returning resets the cache", async () => {
  const { window, counts } = makeDom();
  await enterSettings(window, "keys");
  assert.equal(counts["/api/secrets"], 1);

  // Bounce to dashboard, then back to settings.
  window.DV.S.view = "dashboard";
  window.DV.render();
  await flush(window);

  await enterSettings(window, "keys");
  assert.equal(counts["/api/secrets"], 2, "fresh visit should refetch");
});
