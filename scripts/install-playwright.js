#!/usr/bin/env node
/**
 * scripts/install-playwright.js
 *
 * Postinstall hook: downloads the Playwright Chromium browser binary so that
 * screenshot / interaction MCP tools work out of the box after `npm install`.
 *
 * Skipped automatically when:
 *   - PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 is set
 *   - Running on ARM (Termux / Android) where official binaries aren't built
 *   - The `playwright` package itself isn't present (shouldn't happen, but safe)
 */

"use strict";

const { execSync } = require("child_process");
const os = require("os");

// ── Bail-out conditions ──────────────────────────────────────────────────────

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  console.log("[postinstall] PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — skipping.");
  process.exit(0);
}

// Official Playwright Chromium binaries are only built for x64/arm64 desktop.
// On Termux (Android arm/arm64) there are no pre-built binaries.
const arch = os.arch(); // arm, arm64, x64, ia32 …
const platform = os.platform(); // linux, darwin, win32, android
const isTermux = !!process.env.TERMUX_VERSION || !!process.env.PREFIX?.includes("com.termux");

if (isTermux || (platform === "android")) {
  console.log(
    "[postinstall] Termux / Android detected — skipping Playwright binary download.\n" +
    "             To use screenshots, point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at\n" +
    "             a system Chromium build (e.g. pkg install chromium)."
  );
  process.exit(0);
}

// ── Check whether the playwright package itself was installed ────────────────

let pwPath;
try {
  pwPath = require.resolve("playwright/package.json");
} catch (_) {
  // playwright is optional — it may not be present if npm skipped optionals.
  console.log(
    "[postinstall] playwright package not found — skipping browser download.\n" +
    "             Run `npm install playwright` then `npx playwright install chromium`\n" +
    "             to enable screenshot / interaction MCP tools."
  );
  process.exit(0);
}

// ── Download Chromium ────────────────────────────────────────────────────────

console.log("[postinstall] Installing Playwright Chromium browser binary…");
try {
  execSync("npx playwright install chromium --with-deps", {
    stdio: "inherit",
    // Give it up to 5 min — the binary download can be slow on a fresh machine.
    timeout: 5 * 60 * 1000
  });
  console.log("[postinstall] ✓ Playwright Chromium installed successfully.");
} catch (err) {
  // Non-fatal: the server starts fine without it; only screenshot tools are affected.
  console.warn(
    "[postinstall] ⚠ Playwright browser install failed (non-fatal).\n" +
    "             MCP screenshot / interaction tools will be unavailable.\n" +
    "             To retry manually: npx playwright install chromium\n" +
    "             Error: " + err.message
  );
}
