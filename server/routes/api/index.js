// ── API sub-router index ─────────────────────────────────────────────────────
// Mounts focused sub-routers so the parent can do:
//   app.use("/api", require("./routes/api"))

const express = require("express");
const router = express.Router();

// ── Simple rate limiting ─────────────────────────────────────────────────────
const _rateLimits = {};
function rateLimit(windowMs, maxRequests) {
  return function(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    if (!_rateLimits[ip] || _rateLimits[ip].reset < now) {
      _rateLimits[ip] = { count: 1, reset: now + windowMs };
    } else {
      _rateLimits[ip].count++;
    }
    if (_rateLimits[ip].count > maxRequests) {
      return res.status(429).json({ error: "Too many requests, try again later" });
    }
    next();
  };
}
// Clean up stale entries every 5 minutes
setInterval(function() {
  var now = Date.now();
  for (var ip in _rateLimits) { if (_rateLimits[ip].reset < now) delete _rateLimits[ip]; }
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

// ── Metrics + health ─────────────────────────────────────────────────────────
const metrics = require("../../metrics");
router.get("/metrics", (req, res) => { res.json(metrics.snapshot()); });

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
