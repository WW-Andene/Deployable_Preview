const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { buildStatus } = require("../build");
const { runningServers } = require("../process");
const { proxyTo, serveIndex } = require("../proxy");
const { executeHandler } = require("../serverless");
const { previewAuthMiddleware, previewAuthLogin } = require("../preview-auth");
const { edgeMiddleware } = require("../edge");
const imageOpt = require("../image-opt");
const { getHistory } = require("../build");

// Escape user-controlled strings before splicing into the small HTML
// error pages this router emits. Without this an attacker can craft
// /preview/.../__snapshot/<script>... and trigger reflected XSS in
// DV's origin (which has the dv_token cookie).
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Login form POST handler — must be registered before the catch-all
// preview routes so __auth doesn't get proxied to the user's app.
router.post("/preview/:owner/:repo/:branchSlug/__auth", express.urlencoded({ extended: false }), previewAuthLogin);

// J1: time-travel preview routing. /preview/owner/repo/slug/__snapshot/<id>/...
// serves the bytes from a specific history entry's snapshotDir. Lets users
// (and Claude) compare past builds side-by-side without rolling back.
router.use("/preview/:owner/:repo/:branchSlug/__snapshot/:snapId", function(req, res, next) {
  const { owner, repo, branchSlug, snapId } = req.params;
  const key = owner + "/" + repo + ":" + branchSlug;
  const hist = getHistory(key);
  // K4: snapId may be either a raw history id OR a tag. Tag wins so
  // /preview/.../__snapshot/v1.0/ keeps working as v1.0 moves.
  const entry = hist.find(function(h){ return h.id === snapId || h.tag === snapId; });
  if (!entry) return res.status(404).type("text/html").send("<h1>404 — Snapshot not found</h1><p>id: " + escHtml(snapId) + "</p>");
  if (!entry.snapshotDir || !fs.existsSync(entry.snapshotDir)) {
    return res.status(410).type("text/html").send("<h1>410 — Snapshot evicted</h1><p>The snapshot directory is no longer on disk.</p>");
  }
  // Strip the /__snapshot/<id> prefix off req.url so express.static
  // resolves relative to the snapshot dir.
  const stripPrefix = "/preview/" + owner + "/" + repo + "/" + branchSlug + "/__snapshot/" + snapId;
  if (req.originalUrl.startsWith(stripPrefix)) {
    req.url = req.originalUrl.slice(stripPrefix.length) || "/";
    if (!req.url.startsWith("/")) req.url = "/" + req.url;
  }
  // Static dir lookup, with the same image-optimization pass.
  res.removeHeader("X-Frame-Options");
  res.setHeader("X-DV-Snapshot", snapId);
  if (req.url === "/" || req.url === "" || (!path.extname(req.url) && req.url.indexOf(".") === -1)) {
    const indexHtml = path.join(entry.snapshotDir, "index.html");
    if (fs.existsSync(indexHtml)) return res.type("text/html").send(fs.readFileSync(indexHtml, "utf8"));
    return res.status(404).type("text/html").send("<h1>No index.html in snapshot</h1>");
  }
  const filePath = path.join(entry.snapshotDir, decodeURIComponent(req.url.split("?")[0]));
  Promise.resolve(imageOpt.maybeServeOptimized(filePath, req, res))
    .then(function(handled) { if (!handled) express.static(entry.snapshotDir)(req, res, next); })
    .catch(function() { express.static(entry.snapshotDir)(req, res, next); });
});

// Password gate — runs in front of every other preview route. No-op for
// branches without a previewPassword set.
router.use("/preview/:owner/:repo/:branchSlug", previewAuthMiddleware);
// Edge middleware — per-branch redirects + custom headers. No-op when
// branchConfig.edge is unset.
router.use("/preview/:owner/:repo/:branchSlug", edgeMiddleware);

function findOutputDir(owner, repo, slug) {
  const key = owner + "/" + repo + ":" + slug;
  if (buildStatus[key] && buildStatus[key].outputPath) return buildStatus[key].outputPath;
  return null;
}

// "Not Built Yet" placeholder with configurable refresh
// ?refresh=N (seconds), ?refresh=0 or ?refresh=off to disable
function notBuiltPage(statusText, req) {
  var raw = (req.query.refresh || "").toLowerCase();
  var disabled = raw === "0" || raw === "off" || raw === "false" || raw === "no";
  var rate = disabled ? 0 : (parseInt(raw) > 0 ? parseInt(raw) : 5);
  var metaTag = rate > 0 ? '<meta http-equiv="refresh" content="' + rate + '">' : '';
  var refreshMsg = rate > 0
    ? '<p>Auto-refreshes every ' + rate + 's. <a href="?refresh=off" style="color:#d4a030">Disable</a></p>'
    : '<p>Auto-refresh disabled. <a href="?" style="color:#d4a030">Enable (5s)</a> · <button onclick="location.reload()" style="background:none;border:none;color:#d4a030;cursor:pointer;font-size:13px;text-decoration:underline;padding:0">Refresh now</button></p>';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Built Yet</title>'
    + '<style>body{background:#090a10;color:#e6e1d5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center}h1{color:#d4a030;font-size:18px}p{color:#9e9890;font-size:13px;margin:8px 0}a{text-decoration:underline}.status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-family:monospace;background:rgba(212,160,48,.1);color:#d4a030;border:1px solid rgba(212,160,48,.2)}</style>'
    + metaTag
    + '</head><body><div><h1>Not Built Yet</h1><p>Status: <span class="status">' + statusText + '</span></p>'
    + refreshMsg
    + '</div></body></html>';
}

// Match a request path against serverless API routes
function matchApiRoute(apiRoutes, reqPath) {
  if (!apiRoutes) return null;
  // Try exact match first
  for (const route of apiRoutes) {
    if (!route.isCatchAll && route.routePath === reqPath) return route;
  }
  // Try catch-all routes
  for (const route of apiRoutes) {
    if (route.isCatchAll) {
      const prefix = route.routePath.replace("/*", "");
      if (reqPath.startsWith(prefix + "/") || reqPath === prefix) return route;
    }
  }
  return null;
}

// Helper: build the prefix to strip when proxying
function previewPrefix(req) {
  return "/preview/" + req.params.owner + "/" + req.params.repo + "/" + req.params.branchSlug;
}

// Serverless API functions — must come before static serving
router.use("/preview/:owner/:repo/:branchSlug/api", express.json(), (req, res, next) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const status = buildStatus[key];

  // Server mode: proxy to running process
  const srv = runningServers[key];
  if (srv && srv.status === "running") {
    res.removeHeader("X-Frame-Options");
    return proxyTo(srv.port, req, res, previewPrefix(req));
  }

  // Static mode: check for serverless functions
  // req.path is relative to mount: /preview/.../api, so "/ocr" for .../api/ocr
  if (status && status.apiRoutes) {
    var apiPath = "/api" + (req.path === "/" ? "" : req.path);
    console.log("[SERVERLESS] Trying: " + req.method + " " + apiPath + " (url: " + req.originalUrl + ")");
    var route = matchApiRoute(status.apiRoutes, apiPath);
    if (route) {
      console.log("[SERVERLESS] Hit: " + apiPath + " -> " + path.basename(route.filePath));
      res.removeHeader("X-Frame-Options");
      return executeHandler(route, status.envVars || {}, req, res);
    }
    console.log("[SERVERLESS] No match. Available: " + status.apiRoutes.map(function(r) { return r.routePath; }).join(", "));
  }

  next();
});

// Static assets / server proxy
router.use("/preview/:owner/:repo/:branchSlug", (req, res, next) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;

  const srv = runningServers[key];
  if (srv && srv.status === "running") { res.removeHeader("X-Frame-Options"); return proxyTo(srv.port, req, res, previewPrefix(req)); }

  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir || !fs.existsSync(outDir)) {
    const st = buildStatus[key];
    const statusText = st ? st.status : "idle";
    return res.status(404).send(notBuiltPage(statusText, req));
  }
  const reqPath = req.path;
  if (reqPath === "/" || reqPath === "" || (!path.extname(reqPath) && !reqPath.includes("."))) return serveIndex(outDir, res, previewPrefix(req));
  res.removeHeader("X-Frame-Options");
  // H2: image optimization. Only kicks in when the client passed
  // ?w=/?h=/?fmt=/?q= and sharp is installed; otherwise pass through.
  const filePath = path.join(outDir, decodeURIComponent(reqPath));
  Promise.resolve(imageOpt.maybeServeOptimized(filePath, req, res))
    .then(function(handled) { if (!handled) express.static(outDir)(req, res, next); })
    .catch(function() { express.static(outDir)(req, res, next); });
});

// SPA fallback
router.use("/preview/:owner/:repo/:branchSlug/*", (req, res) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const srv = runningServers[key];
  if (srv && srv.status === "running") { res.removeHeader("X-Frame-Options"); return proxyTo(srv.port, req, res, previewPrefix(req)); }

  // Check serverless API before SPA fallback
  const status = buildStatus[key];
  if (status && status.apiRoutes) {
    const apiPath = req.originalUrl.replace(previewPrefix(req), "") || "/";
    const route = matchApiRoute(status.apiRoutes, apiPath);
    if (route) {
      console.log("[SERVERLESS] " + req.method + " " + apiPath + " -> " + path.basename(route.filePath));
      return executeHandler(route, status.envVars || {}, req, res);
    }
  }

  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir) {
    const st = buildStatus[key];
    const statusText = st ? st.status : "idle";
    return res.status(404).send(notBuiltPage(statusText, req));
  }
  serveIndex(outDir, res, previewPrefix(req));
});

// Test results
const testResults = {};

router.get("/api/test-results/:owner/:repo/:branchSlug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.branchSlug;
  res.json(testResults[key] || { status: "no-results" });
});

router.post("/api/test-results/:owner/:repo/:branchSlug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.branchSlug;
  testResults[key] = { ...req.body, timestamp: Date.now() };
  res.json({ ok: true });
});

// Test harness page
router.get("/test/:owner/:repo/:branchSlug", (req, res) => {
  const { owner, repo, branchSlug } = req.params;

  // Sanitize params to prevent XSS — only allow safe characters
  const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;
  if (!SAFE_NAME_RE.test(owner) || !SAFE_NAME_RE.test(repo) || !SAFE_NAME_RE.test(branchSlug)) {
    return res.status(400).send("Invalid parameters");
  }

  const previewUrl = "/preview/" + owner + "/" + repo + "/" + branchSlug + "/";
  const apiUrl = "/api/test-results/" + owner + "/" + repo + "/" + branchSlug;
  const harnessPath = path.join(__dirname, "..", "test-harness.js");
  let harnessJS = "";
  try { harnessJS = fs.readFileSync(harnessPath, "utf8"); } catch (e) { harnessJS = "document.body.innerHTML='<h1>test-harness.js not found</h1>';"; }

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Test — ${repo}/${branchSlug}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;background:#0a0e17;color:#e0e0e0;padding:12px}h1{color:#edaf18;font-size:16px;margin-bottom:6px}.controls{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.controls button{background:#edaf18;color:#000;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:inherit;font-size:13px}.controls button:hover{background:#ffc942}.controls button.sec{background:#1a1e28;color:#edaf18;border:1px solid #edaf18}#status{color:#60a5fa;font-size:13px;margin:6px 0}#progress{width:100%;height:4px;background:#1a1e28;border-radius:2px;margin:4px 0;overflow:hidden}#progress-bar{height:100%;background:#edaf18;width:0%;transition:width 0.3s}#log{background:#111520;border:1px solid #222;border-radius:8px;padding:10px;height:400px;overflow-y:auto;font-size:11px;line-height:1.6;white-space:pre-wrap}.e{color:#f87171}.w{color:#fbbf24}.ok{color:#4ade80}.i{color:#60a5fa}.s{color:#c084fc;font-weight:bold;margin-top:8px}.dim{color:#565250}iframe{width:100%;height:500px;border:1px solid #333;border-radius:8px;margin-top:8px;background:#000}.sum{margin-top:8px;padding:10px;border-radius:8px;font-weight:bold;font-size:14px}.sum.pass{background:#064e3b;color:#4ade80;border:1px solid #4ade80}.sum.fail{background:#450a0a;color:#f87171;border:1px solid #f87171}.stats{display:flex;gap:12px;margin:8px 0;font-size:12px}.stat-box{padding:6px 12px;border-radius:6px;background:#1a1e28;border:1px solid #222}.stat-box .num{font-size:18px;font-weight:bold}.stat-box .lbl{color:#666;font-size:10px;text-transform:uppercase}</style>
</head><body>
<h1>\u26a1 Test — ${branchSlug}</h1>
<div class="controls"><button onclick="runFullTest()">Run Full Test</button><button class="sec" onclick="runQuickTest()">Quick Test</button><button class="sec" onclick="copyLog()">Copy Report</button></div>
<div id="progress"><div id="progress-bar"></div></div><div id="status">Click "Run Full Test" to start</div>
<div id="stats-row" class="stats" style="display:none"></div><div id="log"></div><div id="sum"></div>
<iframe id="app" src="${previewUrl}"></iframe>
<script>const PREVIEW_URL='${previewUrl}';const API_URL='${apiUrl}';const BRANCH='${branchSlug}';${harnessJS}<\/script>
</body></html>`);
});

module.exports = router;
