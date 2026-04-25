/**
 * browser/index.js — lazy-loading backward-compatibility shim.
 *
 * Aggregates server/browser/*.js + dv/session lifecycle helpers into a
 * single namespace matching the old mcp-browser.js export shape. Modules
 * are loaded on first access of one of their exports, so a tool that only
 * needs `screenshot` does not pay the startup cost of loading axe-core,
 * lighthouse, sharp, and canvas via audit/visual.
 *
 * Once all consumers are updated to import from focused modules directly,
 * this file can be removed.
 */

"use strict";

// Map sub-module name → list of exported names. Listed explicitly so the
// proxy can route get(prop) to the right module without loading anything
// else. Keeps an export → module index without paying load cost up-front.
//
// CAUTION: keep in sync with each sub-module's `module.exports`.
const MODULE_EXPORTS = {
  "../dv/session": ["hasPlaywright", "closeBrowser", "closeSession", "closeAllSessions"],
  "./screenshot":  ["takeScreenshot", "inspectDOM", "captureConsole", "fetchDOMFallback"],
  "./interact":    ["interact"],
  "./measure":     ["getPixelColor", "getElementRect", "measure", "screenshotDiff"],
  "./visual":      ["getPalette", "getColorStats", "visualSimilarity", "toleranceDiffTool", "renderOverlayTool", "imageInfo"],
  "./state":       ["emulate", "storage", "clipboard", "canvasData"],
  "./audit":       ["performanceMetrics", "runAccessibility", "runOCR", "runOCRDispatch", "runLighthouseAudit", "getComputedStyles", "getWebVitals", "getCodeCoverage"],
  "./network":     ["capturePreviewRequests", "captureHar", "captureDownload", "browseUrl"],
  "./deploy":      ["listPreviews", "runTest", "deployAndVerify"],
  "./probe":       ["domQueryTool", "findAll", "listServiceWorkers", "getResourceTiming", "getBrowserApis", "inspectIndexedDB", "getFrameworkData", "getDataAttrs", "getMeta", "getRobots"],
  "./ai":          ["visualQuery", "findElementVisually", "visualDiffWithAction", "runVerifyLoop"],
  "./pages":       ["listPages", "closePage"],
  "./eval":        ["pageEval"]
};

// Reverse index: { exportName → modulePath }
const _byExport = {};
for (const mod of Object.keys(MODULE_EXPORTS)) {
  for (const name of MODULE_EXPORTS[mod]) _byExport[name] = mod;
}

// Cache of loaded sub-modules. require() is itself memoised by Node, but
// keeping our own ref avoids the cache lookup on every property access.
const _loaded = {};
function _loadFor(prop) {
  const modPath = _byExport[prop];
  if (!modPath) return null;
  if (!_loaded[modPath]) _loaded[modPath] = require(modPath);
  return _loaded[modPath];
}

// Proxy: on get, find the owning module, load it lazily, return the
// function. has() returns true for known exports without triggering load.
module.exports = new Proxy({}, {
  get(_, prop) {
    if (typeof prop !== "string") return undefined;
    const mod = _loadFor(prop);
    if (!mod) return undefined;
    const val = mod[prop];
    // Bind methods so `this` works inside them.
    return typeof val === "function" ? val.bind(mod) : val;
  },
  has(_, prop) {
    return typeof prop === "string" && Object.prototype.hasOwnProperty.call(_byExport, prop);
  },
  ownKeys() { return Object.keys(_byExport); },
  getOwnPropertyDescriptor(_, prop) {
    if (!Object.prototype.hasOwnProperty.call(_byExport, prop)) return undefined;
    return { enumerable: true, configurable: true, value: this.get(_, prop) };
  }
});
