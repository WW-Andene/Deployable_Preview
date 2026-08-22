// ── APK sub-router ───────────────────────────────────────────────────────────
// APK build trigger, status polling, log stream, download

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { apkStatus, buildApk, APK_DIR } = require("../../apk");
const { logStreams } = require("../../logs");

// Trigger APK build for a deployed branch
router.post("/apk/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  if (apkStatus[key] && apkStatus[key].status === "building") {
    return res.status(409).json({ error: "APK build already in progress" });
  }
  let workingDir = (req.body && req.body.workingDir) ? String(req.body.workingDir).trim() : ".";
  // Sanitize: reject path traversal attempts
  if (/\.\.[\\/]|[\\/]\.\./.test(workingDir) || /^[\\/]/.test(workingDir)) {
    return res.status(400).json({ error: "Invalid workingDir — must be a relative path without '..'" });
  }
  // fire and forget — client polls /api/apk/status
  buildApk(req.params.owner, req.params.repo, slug, workingDir);
  res.json({ ok: true, message: "APK build started" });
});

// Poll APK build status
router.get("/apk/:owner/:repo/status", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.json(apkStatus[key] || { status: "idle" });
});

// Stream APK build log (SSE)
router.get("/apk/:owner/:repo/log-stream", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");
  // send existing log
  if (apkStatus[key] && apkStatus[key].log) {
    res.write("data: " + JSON.stringify({ log: apkStatus[key].log }) + "\n\n");
  }
  const stream = { res, key: "apk:" + key, closed: false };
  logStreams.push(stream);
  req.on("close", () => { stream.closed = true; });
});

// Download the finished APK
router.get("/apk/:owner/:repo/download", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const st = apkStatus[key];
  if (!st || st.status !== "ready" || !st.apkPath) {
    return res.status(404).json({ error: "APK not ready" });
  }
  // Validate apkPath is inside APK_DIR to prevent path traversal
  const resolvedPath = path.resolve(st.apkPath);
  const resolvedDir  = path.resolve(APK_DIR);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    return res.status(403).json({ error: "Invalid APK path" });
  }
  if (!fs.existsSync(st.apkPath)) {
    return res.status(410).json({ error: "APK file missing — rebuild required" });
  }
  const safeOwner = req.params.owner.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeRepo  = req.params.repo.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSlug  = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename  = safeOwner + "-" + safeRepo + "-" + safeSlug + ".apk";
  res.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.sendFile(resolvedPath);
});

module.exports = router;
