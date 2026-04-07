/**
 * server/browser-setup.js
 *
 * Runs at every server launch to ensure a working headless browser is
 * available for MCP screenshot / interaction tools.
 *
 * Strategy (tried in order):
 *   1. Playwright  — preferred, richer API
 *   2. Puppeteer   — fallback if Playwright can't launch
 *
 * On Termux / Android:
 *   - Neither ships ARM Chromium binaries, so we use the system one.
 *   - Installs `chromium` via `pkg` automatically if missing.
 *   - Sets PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / PUPPETEER_EXECUTABLE_PATH.
 *
 * On Desktop (Linux / macOS / Windows):
 *   - Tries to launch Playwright's Chromium; downloads it if missing.
 *   - If Playwright still fails, installs puppeteer and uses its Chromium.
 *
 * Sets activeBrowser = "playwright" | "puppeteer" | null
 * so mcp-browser.js knows which library to use.
 */

"use strict";

const { execSync } = require("child_process");

const isTermux =
  !!process.env.TERMUX_VERSION ||
  (process.env.PREFIX || "").includes("com.termux");

let activeBrowser = null;

const TAG  = "  [browser-setup]";
const log  = (m) => console.log(TAG + " " + m);
const warn = (m) => console.warn(TAG + " \u26a0 " + m);

// ── Helpers ───────────────────────────────────────────────────────────────────

function which(cmd) {
  try {
    return execSync(
      "which " + cmd + " 2>/dev/null || command -v " + cmd + " 2>/dev/null",
      { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }
    ).toString().trim() || null;
  } catch (_) { return null; }
}

function npmInstall(pkg) {
  log("Installing " + pkg + "...");
  execSync("npm install " + pkg + " --no-save", {
    stdio: "inherit",
    timeout: 3 * 60 * 1000,
    cwd: require("path").join(__dirname, "..")
  });
}

function findSystemChromium() {
  for (const name of ["chromium-browser", "chromium", "google-chrome", "google-chrome-stable"]) {
    const p = which(name);
    if (p) return p;
  }
  return null;
}

async function ensureSystemChromium() {
  let p = findSystemChromium();
  if (p) { log("\u2713 System Chromium found at " + p); return p; }

  log("Chromium not found. Installing via pkg (may take a minute)...");
  try {
    execSync("pkg install chromium -y", { stdio: "inherit", timeout: 5 * 60 * 1000 });
  } catch (e) {
    warn("pkg install chromium failed: " + e.message);
    return null;
  }
  p = findSystemChromium();
  if (p) { log("\u2713 Chromium installed at " + p); return p; }
  warn("Could not locate chromium binary after install.");
  return null;
}

async function tryPlaywright(executablePath) {
  let pw;
  try { pw = require("playwright"); }
  catch (_) { try { pw = require("playwright-core"); } catch (_2) { return false; } }
  const opts = {
    headless: true, timeout: 15000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  };
  if (executablePath) opts.executablePath = executablePath;
  try { const b = await pw.chromium.launch(opts); await b.close(); return true; }
  catch (_) { return false; }
}

async function tryPuppeteer(executablePath) {
  let puppeteer;
  try { puppeteer = require("puppeteer"); }
  catch (_) { try { puppeteer = require("puppeteer-core"); } catch (_2) { return false; } }
  const opts = {
    headless: true, timeout: 15000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  };
  if (executablePath) opts.executablePath = executablePath;
  try { const b = await puppeteer.launch(opts); await b.close(); return true; }
  catch (_) { return false; }
}

function installPlaywrightBrowser() {
  log("Downloading Playwright Chromium binary...");
  try {
    execSync("npx playwright install chromium --with-deps", { stdio: "inherit", timeout: 5 * 60 * 1000 });
    return true;
  } catch (e) { warn("Playwright browser download failed: " + e.message); return false; }
}

function installPuppeteer() {
  try { npmInstall("puppeteer"); return true; }
  catch (e) {
    warn("puppeteer install failed: " + e.message);
    try { npmInstall("puppeteer-core"); return true; } catch (_) { return false; }
  }
}

// ── Termux ────────────────────────────────────────────────────────────────────

async function setupTermux() {
  log("Termux / Android detected.");
  const chromePath = await ensureSystemChromium();
  if (!chromePath) { warn("No system Chromium. Browser tools unavailable."); return; }

  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chromePath;
  process.env.PUPPETEER_EXECUTABLE_PATH           = chromePath;

  log("Testing Playwright with system Chromium...");
  if (!require.resolve) {}
  const hasPw = (() => { try { require.resolve("playwright"); return true; } catch (_) { return false; } })();
  if (!hasPw) { try { npmInstall("playwright"); } catch (_) {} }

  if (await tryPlaywright(chromePath)) {
    log("\u2713 Playwright working with system Chromium.");
    activeBrowser = "playwright"; return;
  }

  warn("Playwright failed. Trying Puppeteer...");
  const hasPptr = (() => { try { require.resolve("puppeteer"); return true; } catch (_) { return false; } })();
  if (!hasPptr) installPuppeteer();

  if (await tryPuppeteer(chromePath)) {
    log("\u2713 Puppeteer working with system Chromium.");
    activeBrowser = "puppeteer"; return;
  }

  warn("Neither Playwright nor Puppeteer could launch system Chromium. Browser tools unavailable.");
}

// ── Desktop ───────────────────────────────────────────────────────────────────

async function setupDesktop() {
  log("Checking Playwright...");
  const hasPw = (() => { try { require.resolve("playwright"); return true; } catch (_) { return false; } })();

  if (!hasPw) { try { npmInstall("playwright"); } catch (_) {} }

  if (await tryPlaywright()) {
    log("\u2713 Playwright already working."); activeBrowser = "playwright"; return;
  }
  if (installPlaywrightBrowser() && await tryPlaywright()) {
    log("\u2713 Playwright working after browser download."); activeBrowser = "playwright"; return;
  }

  warn("Playwright unavailable. Falling back to Puppeteer...");
  const hasPptr = (() => { try { require.resolve("puppeteer"); return true; } catch (_) { return false; } })();
  if (!hasPptr) installPuppeteer();

  if (await tryPuppeteer()) {
    log("\u2713 Puppeteer working."); activeBrowser = "puppeteer"; return;
  }

  warn("Neither Playwright nor Puppeteer could be set up. Browser tools unavailable.");
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function ensureBrowser() {
  try {
    if (isTermux) { await setupTermux(); } else { await setupDesktop(); }
    if (activeBrowser) log("Active browser library: " + activeBrowser);
  } catch (e) {
    warn("Unexpected error: " + e.message);
  }
}

function getActiveBrowser() { return activeBrowser; }

module.exports = { ensureBrowser, getActiveBrowser };
