#!/usr/bin/env node
/**
 * scripts/postinstall.js — DeployView unified post-install setup
 *
 * Runs automatically after every `npm install`.
 * Never blocks or crashes the install — all failures are warnings only.
 *
 * What it does:
 *   1. Verifies localtunnel loaded correctly (it's in dependencies, should always work)
 *   2. Downloads Playwright Chromium browser binary (desktop only, skipped on Termux)
 *   3. Checks git is available (required at runtime — warns now, not at startup)
 *
 * Environment flags:
 *   DEPLOYVIEW_SKIP_POSTINSTALL=1   — skip everything
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — skip Playwright binary download
 */

"use strict";

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const TAG = "[postinstall]";

function log(msg)  { console.log(TAG + " " + msg); }
function warn(msg) { console.warn(TAG + " ⚠  " + msg); }
function ok(msg)   { console.log(TAG + " ✓  " + msg); }

// ── Early bail-out ────────────────────────────────────────────────────────────

if (process.env.DEPLOYVIEW_SKIP_POSTINSTALL === "1") {
  log("DEPLOYVIEW_SKIP_POSTINSTALL=1 — skipping all setup.");
  process.exit(0);
}

// Detect Termux / Android
const isTermux =
  !!process.env.TERMUX_VERSION ||
  (process.env.PREFIX || "").includes("com.termux") ||
  os.platform() === "android";

// ── Step 1: Verify localtunnel ────────────────────────────────────────────────

log("Verifying localtunnel...");
try {
  // Clear any stale cache entries
  Object.keys(require.cache)
    .filter((k) => k.includes("localtunnel"))
    .forEach((k) => { delete require.cache[k]; });

  const ltPath = path.join(ROOT, "node_modules", "localtunnel");
  const mod = require(ltPath);
  const fn = typeof mod === "function" ? mod
            : (mod && typeof mod.default === "function") ? mod.default
            : null;

  if (!fn) {
    // Edge case: installed but export shape is wrong — reinstall
    warn("localtunnel found but its export is not callable. Attempting reinstall...");
    const r = spawnSync("npm", ["install", "localtunnel@latest", "--save"], {
      cwd: ROOT, stdio: "inherit", timeout: 90000,
      shell: process.platform === "win32"
    });
    if (r.status !== 0) {
      warn("localtunnel reinstall failed. Tunnel will fall back to cloudflared.");
    } else {
      ok("localtunnel reinstalled successfully.");
    }
  } else {
    ok("localtunnel loaded correctly.");
  }
} catch (e) {
  // Shouldn't happen since it's in dependencies, but handle gracefully
  warn("localtunnel failed to load: " + e.message);
  warn("Attempting to install localtunnel manually...");
  const r = spawnSync("npm", ["install", "localtunnel@latest", "--save"], {
    cwd: ROOT, stdio: "inherit", timeout: 90000,
    shell: process.platform === "win32"
  });
  if (r.status !== 0) {
    warn("localtunnel install failed. Tunnel will fall back to cloudflared.");
  } else {
    ok("localtunnel installed successfully.");
  }
}

// ── Step 2: Playwright browser binary ────────────────────────────────────────

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  log("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — skipping Playwright setup.");
} else if (isTermux) {
  log("Termux/Android detected — skipping Playwright binary download.");
  log("  For screenshots, run: pkg install chromium");
} else {
  log("Setting up Playwright Chromium browser...");

  // Check whether the playwright package itself was actually installed
  // (it's optional, so npm may have skipped it)
  let pwInstalled = false;
  try {
    require.resolve("playwright/package.json");
    pwInstalled = true;
  } catch (_) {}

  if (!pwInstalled) {
    log("playwright package not installed (optional dep may have been skipped).");
    log("  To enable screenshots: npm install playwright");
  } else {
    try {
      execSync("npx playwright install chromium --with-deps", {
        stdio: "inherit",
        timeout: 5 * 60 * 1000,
        cwd: ROOT
      });
      ok("Playwright Chromium installed successfully.");
    } catch (err) {
      warn("Playwright browser install failed (non-fatal).");
      warn("  MCP screenshot tools will be unavailable until you run:");
      warn("  npx playwright install chromium");
    }
  }
}

// ── Step 3: Termux native libraries ─────────────────────────────────────────
//
// On Termux, native npm modules (sharp, canvas, puppeteer) need system
// libraries that don't exist by default. Install them via `pkg` so the
// enrichment libraries can build/run correctly.

if (isTermux) {
  log("Termux detected — ensuring native libraries for enrichments...");

  // Libraries needed by:
  //   canvas (node-canvas): libcairo, pango, libjpeg-turbo, giflib, librsvg, pkg-config
  //   sharp:                libvips (pkg has it as vips)
  //   puppeteer/chromium:   chromium (for the browser binary)
  const pkgs = [
    "pkg-config",                                                 // for node-gyp to find libs
    "libcairo", "pango", "libjpeg-turbo", "giflib", "librsvg",  // for canvas
    "libvips",                                                    // for sharp (Termux pkg name)
    "libcompiler-rt",                                             // provides libgcc_s.so.1 (needed by SWC musl binary)
    "chromium"                                                    // for browser tools
  ];

  for (const pkg of pkgs) {
    try {
      execSync("dpkg -s " + pkg + " 2>/dev/null", { stdio: "pipe", timeout: 5000 });
    } catch (_) {
      log("  Installing " + pkg + "...");
      try {
        execSync("pkg install " + pkg + " -y", { stdio: "inherit", timeout: 3 * 60 * 1000 });
        ok(pkg + " installed.");
      } catch (e) {
        warn(pkg + " install failed: " + (e.message || "").split("\n")[0]);
        warn("  Install manually: pkg install " + pkg);
      }
    }
  }

  // Set environment variables so node-gyp and native modules find Termux libraries.
  // These paths are non-standard — without them, canvas/sharp/etc. can't build or
  // link against the system libraries we just installed.
  const PREFIX = process.env.PREFIX || "/data/data/com.termux/files/usr";
  const envVars = {
    PKG_CONFIG_PATH: PREFIX + "/lib/pkgconfig",
    CFLAGS:  "-I" + PREFIX + "/include",
    CXXFLAGS: "-I" + PREFIX + "/include",
    LDFLAGS: "-L" + PREFIX + "/lib",
    LD_LIBRARY_PATH: PREFIX + "/lib",
    // sharp: use the system libvips instead of downloading a prebuilt (no Android ARM prebuilt)
    SHARP_FORCE_GLOBAL_LIBVIPS: "true",
    // lighthouse: tell chrome-launcher where system Chromium lives
    CHROME_PATH: (() => {
      try {
        return execSync("which chromium-browser 2>/dev/null || which chromium 2>/dev/null", { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).toString().trim();
      } catch (_) { return ""; }
    })()
  };

  for (const [k, v] of Object.entries(envVars)) {
    if (v && !process.env[k]) {
      process.env[k] = v;
      log("  Set " + k + "=" + v);
    }
  }

  // Also write a .npmrc in the project root so future npm install runs pick up the flags
  const npmrcPath = path.join(ROOT, ".npmrc");
  const npmrcLines = [
    "# Auto-generated for Termux native module builds",
    "sharp_force_global_libvips=true"
  ];
  try {
    const existing = require("fs").readFileSync(npmrcPath, "utf8");
    if (!existing.includes("sharp_force_global_libvips")) {
      require("fs").appendFileSync(npmrcPath, "\n" + npmrcLines.join("\n") + "\n");
      log("  Updated .npmrc with Termux build flags");
    }
  } catch (_) {
    // .npmrc doesn't exist or can't be read — that's fine, env vars are set
  }
}

// ── Step 4: Runtime prerequisite checks ──────────────────────────────────────

log("Checking runtime prerequisites...");

// git
try {
  execSync("git --version", { stdio: "pipe", timeout: 5000 });
  ok("git is available.");
} catch (_) {
  warn("git is not installed or not in PATH.");
  warn("  git is required to clone and update repos.");
  if (isTermux) {
    warn("  Fix: pkg install git");
  } else if (os.platform() === "linux") {
    warn("  Fix: sudo apt install git  (or equivalent for your distro)");
  } else if (os.platform() === "darwin") {
    warn("  Fix: xcode-select --install  (or brew install git)");
  } else if (os.platform() === "win32") {
    warn("  Fix: https://git-scm.com/download/win");
  }
}

// Node version check
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 18) {
  warn("Node.js v" + process.versions.node + " detected. DeployView requires Node 18+.");
  warn("  Please upgrade: https://nodejs.org/");
} else {
  ok("Node.js v" + process.versions.node + " — OK.");
}

// ── Step 4: Enrichment libraries (optional, library-backed MCP tools) ──
//
// The MCP tool suite uses ~30 optional npm libraries (pixelmatch, sharp,
// axe-core, tesseract.js, lighthouse, css-tree, colorthief, cheerio,
// natural, linkinator, etc.) — all listed as optionalDependencies so
// they're installed automatically by npm, but a native build failure
// on one (sharp / canvas / tesseract) must not block the rest.
//
// We delegate to scripts/install-enrichments.js which:
//   • checks each library via require.resolve()
//   • batches the install for speed
//   • falls back to one-at-a-time retries when the batch fails
//   • never fails hard
//
// Flag DEPLOYVIEW_SKIP_ENRICHMENTS=1 to skip entirely.

if (process.env.DEPLOYVIEW_SKIP_ENRICHMENTS === "1") {
  log("DEPLOYVIEW_SKIP_ENRICHMENTS=1 — skipping enrichment library setup.");
} else {
  log("Verifying enrichment libraries...");
  try {
    const installerPath = path.join(__dirname, "install-enrichments.js");
    const r = spawnSync("node", [installerPath], {
      cwd: ROOT,
      stdio: "inherit",
      timeout: 15 * 60 * 1000
    });
    if (r.status === 0) {
      ok("Enrichment libraries verified.");
    } else {
      warn("Enrichment installer exited with code " + r.status + " — some libraries may be missing.");
      warn("  Affected MCP tools will return a clean 'install X' error when invoked.");
    }
  } catch (e) {
    warn("Enrichment installer failed: " + e.message);
  }
}

log("Setup complete.");
