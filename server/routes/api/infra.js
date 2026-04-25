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

// ── Live preview stream (MJPEG) ──────────────────────────────────────────────
// GET /api/live/:owner/:repo/:slug?token=XXX
// Opens a long-lived multipart/x-mixed-replace response. Each frame is a PNG
// captured from the persistent preview page via the existing session pool.
// Human-facing: open in any <img src="…">, or paste the URL in a browser.
// Closes automatically after 5 minutes or when the client disconnects.
//
// Auth: a short-lived token is required (issued by POST /api/live/token).
// This prevents random strangers on the tunnel URL from watching previews.
const _liveTokens = new Map(); // token → expiresAt
const LIVE_TOKEN_TTL_MS = 10 * 60 * 1000;
function mintLiveToken() {
  const crypto = require("crypto");
  const t = crypto.randomBytes(16).toString("base64url");
  _liveTokens.set(t, Date.now() + LIVE_TOKEN_TTL_MS);
  // Opportunistic GC
  if (_liveTokens.size > 100) {
    const now = Date.now();
    for (const [k, exp] of _liveTokens) if (exp < now) _liveTokens.delete(k);
  }
  return t;
}
function checkLiveToken(t) {
  if (!t) return false;
  const exp = _liveTokens.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { _liveTokens.delete(t); return false; }
  return true;
}

// POST /api/live/token → { token, expiresAt }
router.post("/live/token", (req, res) => {
  const token = mintLiveToken();
  res.json({ token, expiresInMs: LIVE_TOKEN_TTL_MS, hint: "Append ?token=... to the /api/live/... URL. Tokens are single-origin and expire after 10 minutes." });
});

router.get("/live/:owner/:repo/:slug", async (req, res) => {
  if (!checkLiveToken(req.query.token)) {
    res.status(401).json({ error: "Unauthorized", hint: "POST /api/live/token to mint a short-lived token, then append ?token=... to this URL." });
    return;
  }
  const { owner, repo, slug } = req.params;
  const fps      = Math.max(0.5, Math.min(Number(req.query.fps) || 2, 10));
  const maxSecs  = Math.max(5, Math.min(Number(req.query.seconds) || 300, 600));
  const width    = Number(req.query.width)  || 1280;
  const height   = Number(req.query.height) || 720;
  const boundary = "dvframe";

  let browserMod;
  try { browserMod = require("../../browser"); } catch (e) { res.status(500).json({ error: "Browser module unavailable" }); return; }
  if (!browserMod.hasPlaywright || !browserMod.hasPlaywright()) {
    res.status(503).json({ error: "No browser available on this host. Install playwright or configure BROWSERLESS_API_KEY." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=" + boundary,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Connection": "close",
    "Pragma": "no-cache"
  });

  const intervalMs = Math.round(1000 / fps);
  const stopAt = Date.now() + maxSecs * 1000;
  let aborted = false;

  req.on("close", function() { aborted = true; });
  res.on("error", function() { aborted = true; });

  while (!aborted && Date.now() < stopAt) {
    let shot;
    try {
      shot = await browserMod.takeScreenshot({ owner, repo, slug, width, height, fullPage: false });
    } catch (e) {
      shot = { error: e.message };
    }
    if (aborted) break;
    if (shot && shot.base64) {
      const buf = Buffer.from(shot.base64, "base64");
      try {
        res.write("--" + boundary + "\r\n");
        res.write("Content-Type: image/png\r\n");
        res.write("Content-Length: " + buf.length + "\r\n\r\n");
        res.write(buf);
        res.write("\r\n");
      } catch (_) { aborted = true; break; }
    } else if (shot && shot.error) {
      // Send a tiny text frame carrying the error so the viewer sees something
      const msg = Buffer.from("live stream error: " + shot.error, "utf8");
      try {
        res.write("--" + boundary + "\r\n");
        res.write("Content-Type: text/plain\r\n");
        res.write("Content-Length: " + msg.length + "\r\n\r\n");
        res.write(msg);
        res.write("\r\n");
      } catch (_) { aborted = true; break; }
      // Back off harder on repeated errors
      await new Promise(function(r){ setTimeout(r, 1500); });
      continue;
    }
    await new Promise(function(r){ setTimeout(r, intervalMs); });
  }

  try { res.end(); } catch (_) {}
});

module.exports = router;
