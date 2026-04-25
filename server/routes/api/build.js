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
