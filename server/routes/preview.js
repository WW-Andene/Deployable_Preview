const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { buildStatus } = require("../build");
const { runningServers } = require("../process");
const { proxyTo, serveIndex } = require("../proxy");

function findOutputDir(owner, repo, slug) {
  const key = owner + "/" + repo + ":" + slug;
  if (buildStatus[key] && buildStatus[key].outputPath) return buildStatus[key].outputPath;
  return null;
}

// Helper: build the prefix to strip when proxying
function previewPrefix(req) {
  return "/preview/" + req.params.owner + "/" + req.params.repo + "/" + req.params.branchSlug;
}

// Static assets / server proxy
router.use("/preview/:owner/:repo/:branchSlug", (req, res, next) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;

  const srv = runningServers[key];
  if (srv && srv.status === "running") { res.removeHeader("X-Frame-Options"); return proxyTo(srv.port, req, res, previewPrefix(req)); }

  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir || !fs.existsSync(outDir)) return res.status(404).send("Not built yet.");
  const reqPath = req.path;
  if (reqPath === "/" || reqPath === "" || (!path.extname(reqPath) && !reqPath.includes("."))) return serveIndex(outDir, res);
  res.removeHeader("X-Frame-Options");
  express.static(outDir)(req, res, next);
});

// SPA fallback
router.use("/preview/:owner/:repo/:branchSlug/*", (req, res) => {
  const slug = req.params.branchSlug;
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const srv = runningServers[key];
  if (srv && srv.status === "running") { res.removeHeader("X-Frame-Options"); return proxyTo(srv.port, req, res, previewPrefix(req)); }
  const outDir = findOutputDir(req.params.owner, req.params.repo, slug);
  if (!outDir) return res.status(404).send("Not built yet.");
  serveIndex(outDir, res);
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
