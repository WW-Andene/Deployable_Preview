/**
 * test/ui-smoke.js — Playwright-driven UI smoke test (CI-only).
 *
 * Boots the real server, opens the dashboard in headless Chromium, then
 * walks every Settings tab and saves a screenshot to test/artifacts/.
 * Uploaded as an artifact by .github/workflows/ci.yml so changes to
 * the UI can be visually reviewed in the PR.
 *
 * Skipped in the regular `npm test` run because Chromium isn't always
 * available locally — invoked explicitly from CI.
 */

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

const ARTIFACT_DIR = path.join(__dirname, "artifacts");
const CONFIG_FILE  = path.join(__dirname, "..", "deployview.json");
const SERVER_ENTRY = path.join(__dirname, "..", "server", "index.js");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function poll() {
      fetch(url).then((r) => {
        if (r.ok) resolve();
        else if (Date.now() > deadline) reject(new Error("Server never returned 2xx — last status " + r.status));
        else setTimeout(poll, 200);
      }).catch(() => {
        if (Date.now() > deadline) reject(new Error("Server never came up at " + url));
        else setTimeout(poll, 200);
      });
    })();
  });
}

const TABS = ["keys", "browser", "tunnel", "webhooks", "envgroups", "domains", "workspace", "actions", "about"];

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Seed a config with a fake token so the dashboard renders without
  // needing a real GitHub PAT. /api/token returns hasToken:true, the
  // SPA flips to view='dashboard' instead of 'setup'.
  let originalConfig = null;
  try { originalConfig = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE) : null; } catch (_) {}
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token: "ci-fake-token-do-not-use", repos: [], secrets: {}, preferences: {} }, null, 2));

  const port = await findFreePort();
  const env = Object.assign({}, process.env, { PORT: String(port), NO_HTTPS: "1" });
  const server = spawn(process.execPath, [SERVER_ENTRY, "--no-mcp"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let serverOut = "";
  server.stdout.on("data", (b) => { serverOut += b.toString(); });
  server.stderr.on("data", (b) => { serverOut += b.toString(); });

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    console.error("Playwright not installed — `npm install playwright && npx playwright install chromium`");
    process.exit(2);
  }

  let browser, exitCode = 0;
  try {
    await waitForServer(`http://localhost:${port}/api/health`, 30000);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (err) => console.error("[page error]", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[console]", msg.text());
    });

    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    // Force the SPA into the settings view; our seeded fake token gets the
    // dashboard to render but real-world entry to settings is via the cog.
    await page.waitForFunction(() => window.DV && window.DV.render);

    for (const tab of TABS) {
      await page.evaluate((t) => {
        window.DV.S.view = "settings";
        window.DV.S.settingsTab = t;
        window.DV.render();
      }, tab);
      // Let any cached fetches resolve and re-render.
      await page.waitForTimeout(400);
      const out = path.join(ARTIFACT_DIR, `settings-${tab}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log("captured", path.relative(process.cwd(), out));
    }

    // Quick assertion: confirm the tab bar has the expected number of tabs.
    const tabCount = await page.evaluate(() =>
      document.querySelectorAll(".settings-tab").length
    );
    if (tabCount < TABS.length) {
      throw new Error(`expected at least ${TABS.length} settings tabs, found ${tabCount}`);
    }
    console.log("ok — rendered", tabCount, "tabs");
  } catch (err) {
    console.error("UI smoke failed:", err.message);
    if (serverOut) console.error("--- server output ---\n" + serverOut.split("\n").slice(-30).join("\n"));
    exitCode = 1;
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    try { server.kill("SIGTERM"); } catch (_) {}
    // Restore the original config so a local re-run doesn't lose state.
    try {
      if (originalConfig != null) fs.writeFileSync(CONFIG_FILE, originalConfig);
      else fs.unlinkSync(CONFIG_FILE);
    } catch (_) {}
    process.exit(exitCode);
  }
}

main();
