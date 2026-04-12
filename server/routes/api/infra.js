// ── Infra sub-router ─────────────────────────────────────────────────────────
// Browser setup/test/disable/status, tunnel start/stop/status

const express = require("express");
const router = express.Router();

const { getConfig, saveConfig, getSecret } = require("../../config");

// ── Browser setup ─────────────────────────────────────────────────────────
// Test remote browser connection — step by step diagnostic
router.get("/browser/test", async (req, res) => {
  const steps = [];
  try {
    const token = getSecret("BROWSERLESS_API_KEY", "BROWSERLESS_API_KEY");
    const wsUrl = getSecret("BROWSER_WS_ENDPOINT", "BROWSER_WS_ENDPOINT");
    steps.push("token_length: " + (token || "").length);
    steps.push("ws_url: " + (wsUrl || "none"));

    const endpoint = wsUrl || (token ? "wss://production-sfo.browserless.io?token=" + token : null);
    if (!endpoint) {
      return res.json({ ok: false, error: "No BROWSERLESS_API_KEY or BROWSER_WS_ENDPOINT set", steps });
    }
    steps.push("endpoint: " + endpoint.replace(/token=[^&]+/, "token=***"));

    let pptr;
    try { pptr = require("puppeteer-core"); steps.push("puppeteer-core: loaded"); }
    catch (_) { try { pptr = require("puppeteer"); steps.push("puppeteer: loaded"); } catch (_2) { return res.json({ ok: false, error: "No puppeteer library", steps }); } }

    steps.push("connecting...");
    const browser = await pptr.connect({ browserWSEndpoint: endpoint });
    steps.push("connected: " + browser.isConnected());

    steps.push("newPage...");
    const page = await browser.newPage();
    steps.push("page created");

    steps.push("setViewport...");
    await page.setViewport({ width: 320, height: 240 });
    steps.push("viewport set");

    steps.push("goto about:blank...");
    await page.goto("about:blank", { waitUntil: "networkidle0", timeout: 10000 });
    steps.push("navigated");

    steps.push("screenshot...");
    const buf = await page.screenshot({ type: "png" });
    steps.push("screenshot: " + buf.length + " bytes");

    await page.close();
    browser.disconnect();
    steps.push("done");

    res.json({ ok: true, steps });
  } catch (e) {
    steps.push("ERROR: " + e.message);
    res.json({ ok: false, error: e.message, steps, stack: e.stack ? e.stack.split("\n").slice(0, 3) : [] });
  }
});

router.get("/browser/status", (req, res) => {
  try {
    const { getActiveBrowser } = require("../../browser-setup");
    const { hasPlaywright } = require("../../mcp-browser");
    const preferred = (getConfig().preferences || {}).browser || "off";
    const active = getActiveBrowser();
    res.json({
      active: active,
      ready: preferred !== "off" && !!active && hasPlaywright(),
      preferred: preferred
    });
  } catch (e) { res.json({ active: null, ready: false, preferred: "off" }); }
});

router.post("/browser/setup", async (req, res) => {
  const { ensureBrowser } = require("../../browser-setup");
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  const engine = (req.body && req.body.engine) || "playwright";
  config.preferences.browser = engine;
  saveConfig();
  try {
    await ensureBrowser();
    const { getActiveBrowser } = require("../../browser-setup");
    res.json({ ok: true, active: getActiveBrowser() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.post("/browser/disable", (req, res) => {
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  config.preferences.browser = "off";
  saveConfig();
  try {
    const mcpBrowser = require("../../mcp-browser");
    mcpBrowser.closeBrowser().catch(() => {});
  } catch (_) {}
  res.json({ ok: true });
});

// ── Tunnel routes (HTTPS exposure for Claude.ai MCP) ─────────────────────────

const tunnel = require("../../tunnel");

// GET /api/tunnel/status
router.get("/tunnel/status", (req, res) => {
  res.json(tunnel.status());
});

// POST /api/tunnel/start  — body: { port?: number }
router.post("/tunnel/start", async (req, res) => {
  const port = (req.body && req.body.port) || process.env.PORT || 3000;
  try {
    const result = await tunnel.start(port);
    res.json({ ok: true, url: result.url, provider: tunnel.status().provider });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/tunnel/stop
router.post("/tunnel/stop", (req, res) => {
  tunnel.stop();
  res.json({ ok: true });
});

module.exports = router;
