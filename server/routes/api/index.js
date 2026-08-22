// ── API sub-router index ─────────────────────────────────────────────────────
// Mounts focused sub-routers so the parent can do:
//   app.use("/api", require("./routes/api"))

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

// ── Tunnel-exposure auth (F-C001) ────────────────────────────────────────────
// Localhost is trusted (developer's own machine). Anything else must present
// the auto-generated API token. Routes that are intentionally public —
// /health (no secrets), /webhook (HMAC-protected), /live/... (own token) —
// are skipped via the early-return below.
//
// /api/preview-errors POST is public (the in-app collector posts back from
// the user's deployed JS). GET/DELETE on the same path are NOT public:
// they expose internal stack traces / file paths and let anyone wipe the
// error log, so they go through the normal auth check.
const PUBLIC_PATHS = /^\/(health|metrics|webhook|live\/)/;

function isPublicRequest(req) {
  if (PUBLIC_PATHS.test(req.path)) return true;
  if (req.method === "POST" && req.path.indexOf("/preview-errors/") === 0) return true;
  return false;
}

function isLocalIp(ip) {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || /^::ffff:127\./.test(ip);
}

function constantTimeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch (_) { return false; }
}

router.use(function(req, res, next) {
  if (isPublicRequest(req)) return next();
  const ip = req.ip || (req.connection && req.connection.remoteAddress);
  if (isLocalIp(ip)) return next();
  let expected = "";
  try { expected = require("../../config").getApiSecret(); } catch (_) {}
  if (!expected) return next(); // config not loaded yet — fail open during boot
  const cookieToken = (req.headers.cookie || "").match(/(?:^|;\s*)dv_token=([^;]+)/);
  const supplied = req.headers["x-dv-token"] || req.query.dv_token || (cookieToken && cookieToken[1]) || "";
  if (constantTimeEq(supplied, expected)) return next();
  res.status(401).json({ error: "Auth required for non-localhost access. Pass X-DV-Token header or ?dv_token= query." });
});

// ── Simple rate limiting ─────────────────────────────────────────────────────
// Each rateLimit() call segregates its bucket by a unique id so endpoints
// don't trample each other's windows. Previously every limiter shared the
// _rateLimits[ip] slot, and a hit on /api/webhook (5s window) would
// override the in-flight /api/token window (60s) for that IP.
const _rateLimits = {};
let _rateLimitSeq = 0;
function rateLimit(windowMs, maxRequests) {
  const id = "rl" + (++_rateLimitSeq) + ":";
  return function(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const key = id + ip;
    if (!_rateLimits[key] || _rateLimits[key].reset < now) {
      _rateLimits[key] = { count: 1, reset: now + windowMs };
    } else {
      _rateLimits[key].count++;
    }
    if (_rateLimits[key].count > maxRequests) {
      return res.status(429).json({ error: "Too many requests, try again later" });
    }
    next();
  };
}
// Clean up stale entries every 5 minutes
setInterval(function() {
  var now = Date.now();
  for (var key in _rateLimits) { if (_rateLimits[key].reset < now) delete _rateLimits[key]; }
}, 5 * 60 * 1000);

// Apply rate limiting to mutation endpoints
router.post("/token", rateLimit(60000, 10));
router.post("/repos", rateLimit(60000, 20));
router.post("/build/:owner/:repo", rateLimit(30000, 5));
router.post("/webhook", rateLimit(5000, 30));

// ── Input validation helper ──────────────────────────────────────────────────
// Reject owner/repo names with characters that could break shell commands or paths
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateParams(req, res, next) {
  const { owner, repo } = req.params;
  if (owner && !SAFE_NAME_RE.test(owner)) return res.status(400).json({ error: "Invalid owner name" });
  if (repo && !SAFE_NAME_RE.test(repo)) return res.status(400).json({ error: "Invalid repo name" });
  next();
}

router.param("owner", validateParams);
router.param("repo", validateParams);

// Mount sub-routers
router.use("/", require("./config"));
router.use("/", require("./build"));
router.use("/", require("./infra"));
router.use("/", require("./apk"));
router.use("/", require("./dv"));
router.use("/", require("./fetch"));
router.use("/", require("./studio"));

// ── Metrics + health ─────────────────────────────────────────────────────────
const metrics = require("../../metrics");
router.get("/metrics", (req, res) => { res.json(metrics.snapshot()); });
// K5: audit log tail. Last N entries, newest first.
router.get("/audit", (req, res) => {
  const n = Math.max(1, Math.min(parseInt(req.query.n, 10) || 200, 5000));
  res.json({ entries: require("../../audit").tail(n), max: 5000 });
});
// F-M005: Prometheus scrape endpoint
router.get("/metrics/prometheus", (req, res) => {
  res.type("text/plain; version=0.0.4").send(metrics.prometheus());
});

router.get("/health", (req, res) => {
  let validation = { ok: true };
  try { validation = require("../../config").getValidationReport(); } catch (_) {}
  let toolsLoaded = 0, browser = false;
  try { toolsLoaded = require("../../dv/core").toolCount(); } catch (_) {}
  try { browser = require("../../browser").hasPlaywright(); } catch (_) {}
  res.json({
    ok: validation.ok !== false,
    uptimeSec: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    toolsLoaded,
    browser,
    config: validation
  });
});

module.exports = router;
