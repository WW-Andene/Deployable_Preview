#!/usr/bin/env node
/**
 * scripts/install-enrichments.js
 *
 * Auto-install the optional enrichment libraries that power the MCP
 * library-backed tools (pixelmatch, sharp, axe-core, tesseract.js,
 * lighthouse, css-tree, colorthief, cheerio, natural, linkinator, etc.)
 *
 * Usage:
 *   node scripts/install-enrichments.js              # install everything missing
 *   node scripts/install-enrichments.js --check      # just report which are present
 *   node scripts/install-enrichments.js --quiet      # suppress per-lib logs
 *
 * Behaviour:
 *   • Each library is checked via require.resolve() — already-installed
 *     libraries are skipped.
 *   • Missing libraries are installed in a single batched `npm install`
 *     call with --no-save and --no-audit --no-fund for speed.
 *   • Native modules that fail to build (sharp, canvas, tesseract on
 *     some hosts) do NOT abort the run — they're marked as failed and
 *     the rest still install.
 *   • This script is called by scripts/postinstall.js and can also be
 *     triggered at server startup in the background.
 *
 * Environment flags:
 *   DEPLOYVIEW_SKIP_ENRICHMENTS=1   — skip entirely
 *   DEPLOYVIEW_ENRICHMENT_TIMEOUT   — per-install timeout in ms (default: 10 min)
 */

"use strict";

const { spawnSync } = require("child_process");
const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const TAG = "[enrichments]";

// Resolve modules as if from the project root so ROOT/node_modules is walked.
const projectRequire = createRequire(path.join(ROOT, "package.json"));

function log(msg)  { if (!QUIET) console.log(TAG + " " + msg); }
function warn(msg) { console.warn(TAG + " ⚠  " + msg); }
function ok(msg)   { if (!QUIET) console.log(TAG + " ✓  " + msg); }

const CHECK_ONLY = process.argv.includes("--check");
const QUIET      = process.argv.includes("--quiet");

// The full list of enrichment libraries. Keep this in sync with the
// optionalDependencies block in package.json.
const LIBS = [
  // Image / visual diffing
  "pixelmatch",
  "pngjs",
  "sharp",
  "ssim.js",
  "looks-same",
  "canvas",
  "image-size",
  "exifreader",
  "colorthief",
  "get-image-colors",
  // Accessibility / audit / OCR
  "axe-core",
  "tesseract.js",
  "lighthouse",
  // CSS / DOM parsing
  "css-tree",
  "cheerio",
  "css-select",
  "specificity",
  // html-validator removed — replaced with direct W3C Nu validator HTTPS call
  // Performance
  "web-vitals",
  "gzip-size",
  // Text
  "diff",
  "natural",
  "linkinator",
  // Runtime debugging
  "error-stack-parser",
  "source-map",
  "v8-to-istanbul",
  // Security / cookies / robots
  "retire",
  // csp-parse removed — replaced with inline CSP parser
  "set-cookie-parser",
  "tough-cookie",
  "robots-parser"
];

function isInstalled(name) {
  try {
    projectRequire.resolve(name);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Known-failed cache ────────────────────────────────────────────────────
// Some native modules (canvas, sharp, tesseract) refuse to compile on
// certain hosts (Windows without VS build tools, Alpine without musl
// deps, etc.). Once we've tried to install them and they STILL refuse
// to resolve afterwards, remember that so subsequent `npm install`
// invocations don't pay the retry cost on every startup.
//
// The cache lives under node_modules/ so a clean install (which
// deletes node_modules) automatically resets it — giving the user a
// fresh attempt whenever they wipe and reinstall.
const FAIL_CACHE = path.join(__dirname, "..", "node_modules", ".deployview-enrichment-skip.json");
const MAX_ATTEMPTS_PER_LIB = 3;

function loadFailCache() {
  try { return JSON.parse(fs.readFileSync(FAIL_CACHE, "utf8")) || {}; }
  catch (_) { return {}; }
}
function saveFailCache(c) {
  try { fs.writeFileSync(FAIL_CACHE, JSON.stringify(c, null, 2)); }
  catch (_) { /* nothing sensible to do */ }
}
function shouldSkip(name) {
  const c = loadFailCache();
  return (c[name] && c[name].attempts >= MAX_ATTEMPTS_PER_LIB);
}
function recordFailure(name) {
  const c = loadFailCache();
  c[name] = { attempts: (c[name] && c[name].attempts || 0) + 1, lastAt: new Date().toISOString() };
  saveFailCache(c);
}
function recordSuccess(name) {
  const c = loadFailCache();
  if (c[name]) { delete c[name]; saveFailCache(c); }
}

function getTermuxEnv() {
  // On Termux, native modules need these env vars to find system libraries
  const isTermux = !!process.env.TERMUX_VERSION || (process.env.PREFIX || "").includes("com.termux");
  if (!isTermux) return {};
  const PREFIX = process.env.PREFIX || "/data/data/com.termux/files/usr";
  const chromePath = (() => {
    try {
      return require("child_process").execSync(
        "which chromium-browser 2>/dev/null || which chromium 2>/dev/null",
        { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }
      ).toString().trim();
    } catch (_) { return ""; }
  })();
  return {
    PKG_CONFIG_PATH: PREFIX + "/lib/pkgconfig",
    CFLAGS: "-I" + PREFIX + "/include",
    CXXFLAGS: "-I" + PREFIX + "/include",
    LDFLAGS: "-L" + PREFIX + "/lib",
    LD_LIBRARY_PATH: PREFIX + "/lib",
    SHARP_FORCE_GLOBAL_LIBVIPS: "true",
    CHROME_PATH: chromePath || undefined
  };
}

function runNpmInstall(packages) {
  const timeout = parseInt(process.env.DEPLOYVIEW_ENRICHMENT_TIMEOUT, 10) || (10 * 60 * 1000);
  const args = [
    "install",
    "--no-save",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    ...packages
  ];
  log("Running: npm " + args.join(" "));
  const env = { ...process.env, ...getTermuxEnv() };
  const r = spawnSync("npm", args, {
    cwd: ROOT,
    env,
    stdio: QUIET ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout,
    shell: process.platform === "win32"
  });
  return r.status === 0;
}

function installOneAtATime(packages) {
  // When batched install fails (typically because ONE native dep failed to
  // build), fall back to one-by-one so every other library still lands.
  const succeeded = [];
  const failed = [];
  for (const pkg of packages) {
    const ok = runNpmInstall([pkg]);
    if (ok) succeeded.push(pkg);
    else {
      failed.push(pkg);
      warn("  ✗ " + pkg + " — install failed (native build?)");
    }
  }
  return { succeeded, failed };
}

function main() {
  if (process.env.DEPLOYVIEW_SKIP_ENRICHMENTS === "1") {
    log("DEPLOYVIEW_SKIP_ENRICHMENTS=1 — skipping.");
    return 0;
  }

  const missing = [];
  const present = [];
  const skipped = [];
  for (const lib of LIBS) {
    if (isInstalled(lib)) { present.push(lib); recordSuccess(lib); }
    else if (shouldSkip(lib)) skipped.push(lib);
    else missing.push(lib);
  }

  log("Enrichment libraries: " + present.length + "/" + LIBS.length + " installed");
  if (present.length) log("  Installed: " + present.join(", "));
  if (missing.length) log("  Missing:   " + missing.join(", "));
  if (skipped.length) {
    log("  Skipped:   " + skipped.join(", ") + " (failed " + MAX_ATTEMPTS_PER_LIB + " previous attempts — wipe node_modules/.deployview-enrichment-skip.json to retry)");
  }

  if (CHECK_ONLY) {
    return missing.length === 0 ? 0 : 1;
  }

  if (!missing.length) {
    ok("All enrichment libraries are present.");
    return 0;
  }

  log("Installing " + missing.length + " missing libraries...");

  // Try a single batched install first — much faster.
  const batchOk = runNpmInstall(missing);
  if (batchOk) {
    // Re-verify — some libs may have failed silently
    const stillMissing = missing.filter((m) => !isInstalled(m));
    if (!stillMissing.length) {
      ok("All " + missing.length + " libraries installed.");
      return 0;
    }
    warn(stillMissing.length + " libraries still missing after batch install — retrying individually.");
    const { succeeded, failed } = installOneAtATime(stillMissing);
    for (const s of succeeded) recordSuccess(s);
    for (const f of failed) recordFailure(f);
    // Anything in stillMissing that the individual retry didn't actually
    // make resolvable is recorded as a failure too (npm said "installed"
    // but require still fails → native compile dropped).
    for (const lib of stillMissing) {
      if (!isInstalled(lib)) recordFailure(lib);
    }
    ok("Installed individually: " + (succeeded.length || 0));
    if (failed.length) {
      warn("Failed to install: " + failed.join(", "));
      warn("  (Tools depending on these libraries will report 'install X' errors.)");
    }
    return 0;
  }

  // Batch failed — retry one-by-one so a single bad native build doesn't block everything
  warn("Batch install failed. Retrying one-at-a-time...");
  const { succeeded, failed } = installOneAtATime(missing);
  for (const s of succeeded) recordSuccess(s);
  for (const f of failed) recordFailure(f);
  for (const lib of missing) {
    if (!isInstalled(lib)) recordFailure(lib);
  }
  ok("Installed: " + succeeded.length + " / " + missing.length);
  if (failed.length) {
    warn("Failed: " + failed.join(", "));
    warn("  (Tools depending on these libraries will report 'install X' errors — the rest still work.)");
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main() || 0);
  } catch (e) {
    warn("Unexpected error: " + e.message);
    process.exit(0); // never fail hard — enrichments are optional
  }
}

module.exports = { LIBS, isInstalled, runNpmInstall };
