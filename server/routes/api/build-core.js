// ── Build core sub-router ────────────────────────────────────────────────────
// Build trigger / cancel / stop / status / log / SSE log + status streams /
// thumbnails. The webhook endpoint moved to webhooks-in.js; history /
// rollback / artifact / preview-errors moved to their own files.

"use strict";

const express = require("express");
const router = express.Router();

const { logStreams } = require("../../logs");
const audit = require("../../audit");
const deployment = require("../../services/deployment");
const STATUS = deployment.CODE_TO_STATUS;

// Stop server
router.post("/stop/:owner/:repo", (req, res) => {
  const r = deployment.stopServer(req.params.owner, req.params.repo, req.query.slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true });
});

// SSE log stream — Express transport, kept inline for the long-lived
// connection registration.
router.get("/logs/stream", (req, res) => {
  const key = req.query.key || "";
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: " + JSON.stringify({ connected: true, key }) + "\n\n");
  const stream = { res, key, closed: false };
  logStreams.push(stream);
  req.on("close", () => { stream.closed = true; });
});

// H1: SSE status broadcast — pushes every buildStatus transition to the
// dashboard. ping every 25s defeats proxy idle-timeouts.
const { onStatusChange } = require("../../build");
router.get("/status/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");
  const off = onStatusChange((key, slot) => {
    if (res.writableEnded || res.destroyed) return;
    try { res.write("data: " + JSON.stringify({ key, slot }) + "\n\n"); } catch (_) {}
  });
  const ping = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    try { res.write(":ping\n\n"); } catch (_) {}
  }, 25000);
  req.on("close", () => { off(); clearInterval(ping); });
});

// Build trigger
router.post("/build/:owner/:repo", audit.logAction("build.trigger", { target: ["params.owner", "params.repo"] }), (req, res) => {
  const slug = req.query.slug || req.query.branch;
  const r = deployment.triggerBuild(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error, availableSlugs: r.availableSlugs });
  res.json({ ok: true, message: r.message });
});

router.post("/cancel/:owner/:repo", (req, res) => {
  const r = deployment.cancel(req.params.owner, req.params.repo, req.query.slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true, message: r.message, cancelled: r.cancelled !== false });
});

router.get("/status/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getStatus(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json(r.status);
});

router.get("/log/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getLog(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).type("text/plain").send(r.error);
  res.type("text/plain").send(r.log || "No build log.");
});

// Thumbnail PNG (post-build screenshot, ETag-cached)
router.get("/thumb/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getThumb(req.params.owner, req.params.repo, slug);
  if (!r.ok) { res.status(STATUS[r.code] || 404).end(); return; }
  res.type("image/png");
  res.setHeader("Cache-Control", "public, max-age=30");
  res.setHeader("ETag", '"' + r.thumbAt + '"');
  if (req.headers["if-none-match"] === '"' + r.thumbAt + '"') { res.status(304).end(); return; }
  res.end(r.buffer);
});

// Diff heatmap PNG (pixel changes vs previous build)
router.get("/thumb-diff/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getDiffThumb(req.params.owner, req.params.repo, slug);
  if (!r.ok) { res.status(STATUS[r.code] || 404).end(); return; }
  const etag = '"diff-' + r.thumbAt + '"';
  res.type("image/png");
  res.setHeader("Cache-Control", "public, max-age=30");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  res.end(r.buffer);
});

module.exports = router;
