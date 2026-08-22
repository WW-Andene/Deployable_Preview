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
    // F-C026: never return stack to clients — leaks $HOME, usernames, module
    // layout. Operator can read the full trace from server logs.
    if (e.stack) console.error("[browser/test]", e.stack);
    res.json({ ok: false, error: e.message, steps });
  }
});

router.get("/browser/status", (req, res) => {
  try {
    const { getActiveBrowser } = require("../../browser-setup");
    const { hasPlaywright } = require("../../browser");
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
    const mcpBrowser = require("../../browser");
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
// F-C004: tokens are now scoped to a specific (owner, repo, slug) triple.
// A leaked token can no longer be replayed against a different preview.
const _liveTokens = new Map(); // token → { scope, exp }
const LIVE_TOKEN_TTL_MS = 10 * 60 * 1000;
function scopeKey(owner, repo, slug) { return owner + "/" + repo + "/" + slug; }
function mintLiveToken(scope) {
  const crypto = require("crypto");
  const t = crypto.randomBytes(16).toString("base64url");
  _liveTokens.set(t, { scope, exp: Date.now() + LIVE_TOKEN_TTL_MS });
  // Opportunistic GC
  if (_liveTokens.size > 100) {
    const now = Date.now();
    for (const [k, v] of _liveTokens) if (v.exp < now) _liveTokens.delete(k);
  }
  return t;
}
function checkLiveToken(t, expectedScope) {
  if (!t) return false;
  const entry = _liveTokens.get(t);
  if (!entry) return false;
  if (entry.exp < Date.now()) { _liveTokens.delete(t); return false; }
  if (entry.scope !== expectedScope) return false;
  return true;
}

// POST /api/live/token → { token, expiresAt }
// Body: { owner, repo, slug } — the triple this token will be valid for.
router.post("/live/token", (req, res) => {
  const { owner, repo, slug } = req.body || {};
  if (!owner || !repo || !slug) return res.status(400).json({ error: "owner, repo, slug required" });
  const token = mintLiveToken(scopeKey(owner, repo, slug));
  res.json({ token, expiresInMs: LIVE_TOKEN_TTL_MS, scope: { owner, repo, slug }, hint: "Append ?token=... to the /api/live/" + owner + "/" + repo + "/" + slug + " URL. Token is bound to this preview only and expires after 10 minutes." });
});

router.get("/live/:owner/:repo/:slug", async (req, res) => {
  const expectedScope = scopeKey(req.params.owner, req.params.repo, req.params.slug);
  if (!checkLiveToken(req.query.token, expectedScope)) {
    res.status(401).json({ error: "Unauthorized", hint: "POST /api/live/token with this preview's owner/repo/slug to mint a scoped token." });
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

  // Helper that resolves to the first of {result, abort}. We can't cancel
  // a Playwright screenshot once it's started, but we can stop awaiting it
  // and let the next iteration short-circuit.
  function abortable(p) {
    return new Promise(function(resolve) {
      let settled = false;
      p.then(function(v) { if (!settled) { settled = true; resolve(v); } },
              function(e) { if (!settled) { settled = true; resolve({ error: e && e.message || String(e) }); } });
      const onAbort = function() { if (!settled) { settled = true; resolve({ aborted: true }); } };
      req.once("close", onAbort);
    });
  }

  while (!aborted && Date.now() < stopAt) {
    const shot = await abortable(browserMod.takeScreenshot({
      owner, repo, slug, width, height, fullPage: false
    }));
    if (aborted || (shot && shot.aborted)) { aborted = true; break; }
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
