/**
 * browser/index.js — backward-compatibility re-export shim.
 *
 * Any code that still does `require("./mcp-browser")` or
 * `require("../mcp-browser")` can be pointed here instead to get the
 * same exports. This file aggregates all browser/*.js modules + session
 * lifecycle helpers into a single flat namespace matching the old
 * mcp-browser.js export shape.
 *
 * Once all consumers are updated to import from the focused modules
 * directly, this file can be removed (§R12 cleanup).
 */

"use strict";

const session    = require("../dv/session");
const screenshot = require("./screenshot");
const interact   = require("./interact");
const measure    = require("./measure");
const visual     = require("./visual");
const state      = require("./state");
const audit      = require("./audit");
const network    = require("./network");
const deploy     = require("./deploy");
const probe      = require("./probe");
const ai         = require("./ai");
const pages      = require("./pages");
const evalMod    = require("./eval");

module.exports = {
  // Session lifecycle (from dv/session.js)
  hasPlaywright:     session.hasPlaywright,
  closeBrowser:      session.closeBrowser,
  closeSession:      session.closeSession,
  closeAllSessions:  session.closeAllSessions,

  // Screenshot / inspect / console
  ...screenshot,

  // Interact
  ...interact,

  // Pixel / rect / measure / diff
  ...measure,

  // Palette / color / SSIM / tolerance / overlay / canvas / imageInfo
  ...visual,

  // Emulate / storage / clipboard / canvasData
  ...state,

  // Accessibility / OCR / Lighthouse / styles / perf / vitals / coverage
  ...audit,

  // Capture requests / HAR / download / browseUrl
  ...network,

  // List previews / deploy+verify / run test
  ...deploy,

  // DOM query / find all / service workers / timing / APIs / IDB / framework / meta / robots
  ...probe,

  // Groq visual tools
  ...ai,

  // Multi-tab pages
  ...pages,

  // JS eval in page context (devtools-console-like)
  ...evalMod
};
