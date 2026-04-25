// ── Build sub-router ─────────────────────────────────────────────────────────
// Build trigger, stop, cancel, status, log, log SSE stream, webhook.
//
// All business logic lives in services/deployment.js — these handlers
// just translate {ok, code} → HTTP status and shape the JSON response.
// Demonstrates the service-layer pattern; other route files can migrate
// the same way.

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { getConfig, getSecret } = require("../../config");
const { logStreams } = require("../../logs");
const { deployBranch } = require("../../build");

const deployment = require("../../services/deployment");
const STATUS = deployment.CODE_TO_STATUS;

// Stop server
router.post("/stop/:owner/:repo", (req, res) => {
  const r = deployment.stopServer(req.params.owner, req.params.repo, req.query.slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true });
});

// Webhook — kept inline because the HMAC verification is HTTP-specific
// (uses req.headers + req.rawBody) and has no service-layer equivalent.
// F-C002: WEBHOOK_SECRET is mandatory. Reject unsigned webhooks fail-secure
// rather than accepting forged ones from anyone reaching the tunnel URL.
router.post("/webhook", (req, res) => {
  const config = getConfig();
  const secret = getSecret("WEBHOOK_SECRET", "WEBHOOK_SECRET");
  if (!secret) {
    console.warn("[WEBHOOK] Rejected: WEBHOOK_SECRET is unset (set it in Settings → Secrets to enable webhooks)");
    return res.status(403).json({ error: "WEBHOOK_SECRET not configured on server" });
  }
  const sig = req.headers["x-hub-signature-256"] || "";
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.warn("[WEBHOOK] Signature mismatch from " + (req.ip || "unknown"));
    return res.status(401).json({ error: "Invalid webhook signature" });
  }
  if (req.headers["x-github-event"] !== "push") return res.json({ ok: true, skipped: true });
  const ref = (req.body.ref || "").replace("refs/heads/", "");
  const fullName = req.body.repository && req.body.repository.full_name;
  if (!ref || !fullName) return res.status(400).json({ error: "Invalid payload" });
  const [owner, repo] = fullName.split("/");
  const repoConfig = config.repos.find((r) => r.owner === owner && r.repo === repo);
  if (!repoConfig) return res.json({ ok: true, skipped: true });
  let triggered = 0;
  for (const bc of repoConfig.activeBranches) {
    if (bc.branch === ref) {
      Promise.resolve(deployBranch(repoConfig, bc)).catch((e) => {
        console.error("[WEBHOOK] Build failed for " + fullName + ":" + ref + " — " + e.message);
      });
      triggered++;
    }
  }
  console.log("[WEBHOOK] " + fullName + ":" + ref + " — " + triggered + " build(s)");
  res.json({ ok: true, triggered });
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
// dashboard so it can update without polling. One stream per client; an
// initial "connected" event lets the client confirm wiring + a ping
// every 25s keeps the connection alive through proxies.
const { onStatusChange } = require("../../build");
router.get("/status/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");
  const off = onStatusChange(function(key, slot) {
    if (res.writableEnded || res.destroyed) return;
    try { res.write("data: " + JSON.stringify({ key, slot }) + "\n\n"); } catch (_) {}
  });
  const ping = setInterval(function() {
    if (res.writableEnded || res.destroyed) return;
    try { res.write(":ping\n\n"); } catch (_) {}
  }, 25000);
  req.on("close", function() { off(); clearInterval(ping); });
});

// Build trigger
router.post("/build/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch;
  const r = deployment.triggerBuild(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error, availableSlugs: r.availableSlugs });
  res.json({ ok: true, message: r.message });
});

// Cancel build
router.post("/cancel/:owner/:repo", (req, res) => {
  const r = deployment.cancel(req.params.owner, req.params.repo, req.query.slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true, message: r.message, cancelled: r.cancelled !== false });
});

// Status
router.get("/status/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getStatus(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json(r.status);
});

// Log (text/plain)
router.get("/log/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getLog(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).type("text/plain").send(r.error);
  res.type("text/plain").send(r.log || "No build log.");
});

// Thumbnail — PNG screenshot captured after the last successful build.
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

// Deployment history (newest first).
router.get("/history/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.listHistory(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ history: r.history, currentOutput: r.current });
});

// Roll back to a prior history entry. Body: { slug, historyId }.
router.post("/rollback/:owner/:repo", (req, res) => {
  const { slug, historyId } = req.body || {};
  const r = deployment.rollback(req.params.owner, req.params.repo, slug, historyId);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true, message: r.message, entry: r.entry });
});

// Set/clear a note on a history entry. Body: { slug, historyId, note }.
// Pass note: null or empty string to remove.
router.post("/history/:owner/:repo/note", (req, res) => {
  const { slug, historyId, note } = req.body || {};
  const r = deployment.annotateHistory(req.params.owner, req.params.repo, slug, historyId, note);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true, entry: r.entry });
});

// ── Outgoing webhook subscribers ───────────────────────────────────────────
const webhooks = require("../../webhooks");

router.get("/webhooks", (req, res) => {
  // Don't leak the HMAC secret over the wire — replace with hasSecret bool.
  res.json({ webhooks: webhooks.listWebhooks().map(w => ({
    ...w, secret: undefined, hasSecret: !!w.secret
  })), validEvents: webhooks.VALID_EVENTS });
});

router.post("/webhooks", (req, res) => {
  try {
    const wh = webhooks.addWebhook(req.body || {});
    res.json({ ok: true, webhook: { ...wh, secret: undefined, hasSecret: !!wh.secret } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/webhooks/:id", (req, res) => {
  const wh = webhooks.updateWebhook(req.params.id, req.body || {});
  if (!wh) return res.status(404).json({ error: "webhook not found" });
  res.json({ ok: true, webhook: { ...wh, secret: undefined, hasSecret: !!wh.secret } });
});

router.delete("/webhooks/:id", (req, res) => {
  const ok = webhooks.removeWebhook(req.params.id);
  if (!ok) return res.status(404).json({ error: "webhook not found" });
  res.json({ ok: true });
});

// Test endpoint: fire a synthetic event to a single webhook so users can
// verify the receiver is wired up without waiting for a real build.
router.post("/webhooks/:id/test", async (req, res) => {
  const wh = webhooks.listWebhooks().find(w => w.id === req.params.id);
  if (!wh) return res.status(404).json({ error: "webhook not found" });
  // Temporarily emit just to this one — easiest path is to call _post
  // directly via a wrapper exposed for tests.
  const ev = "build.ready";
  // Use the internal emit; it's a no-op if webhook is disabled or events
  // don't include this one. For a true test, just always send.
  try {
    const fake = {
      repo: "owner/repo", branch: "main", slug: "main",
      commitSha: "0000000abcdef", duration: 12.3,
      previewUrl: "/preview/owner/repo/main/"
    };
    // Force-send by temporarily enabling and matching
    const saved = { events: wh.events, enabled: wh.enabled };
    wh.events = ["*"]; wh.enabled = true;
    webhooks.emit(ev, fake);
    wh.events = saved.events; wh.enabled = saved.enabled;
    res.json({ ok: true, message: "Test event dispatched (check receiver)" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// H3: Build artifact ZIP download. Streams a STORED-only ZIP of the
// current outputDir so users can deploy the same bytes elsewhere or
// hand them to a customer for offline review.
const fsLocal = require("fs");
const pathLocal = require("path");
const { createZipStream } = require("../../zip-stream");
const { buildStatus: bs2 } = require("../../build");

function _walk(rootDir, sub, out) {
  const cur = sub ? pathLocal.join(rootDir, sub) : rootDir;
  let entries;
  try { entries = fsLocal.readdirSync(cur, { withFileTypes: true }); }
  catch (_) { return; }
  for (const e of entries) {
    const rel = sub ? pathLocal.posix.join(sub, e.name) : e.name;
    if (e.isDirectory()) _walk(rootDir, rel, out);
    else if (e.isFile())  out.push(rel);
  }
}

router.get("/artifact/:owner/:repo", async (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  if (!slug) return res.status(400).json({ error: "slug required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const slot = bs2[key];
  if (!slot || !slot.outputPath) return res.status(404).json({ error: "No build output for " + key });
  if (!fsLocal.existsSync(slot.outputPath)) return res.status(410).json({ error: "Output dir missing on disk" });

  const filename = req.params.repo + "-" + slug + "-" + (slot.commitSha || "").slice(0, 7) + ".zip";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="' + filename.replace(/[^A-Za-z0-9._-]/g, "_") + '"');
  res.setHeader("Cache-Control", "no-store");

  const files = [];
  _walk(slot.outputPath, "", files);

  const z = createZipStream(res);
  try {
    for (const rel of files) {
      await z.addFile(rel, pathLocal.join(slot.outputPath, rel));
    }
    await z.end();
  } catch (e) {
    console.error("[artifact] zip stream error:", e.message);
    try { res.end(); } catch (_) {}
  }
});

// Diff heatmap — PNG showing pixel changes vs. the previous build's thumb.
router.get("/thumb-diff/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.getDiffThumb(req.params.owner, req.params.repo, slug);
  if (!r.ok) { res.status(STATUS[r.code] || 404).end(); return; }
  res.type("image/png");
  res.setHeader("Cache-Control", "public, max-age=30");
  res.setHeader("ETag", '"diff-' + r.thumbAt + '"');
  res.end(r.buffer);
});

module.exports = router;
