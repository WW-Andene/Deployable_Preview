// ── Build sub-router ─────────────────────────────────────────────────────────
// Build trigger, stop, cancel, status, log, log SSE stream, webhook

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { getConfig, getSecret } = require("../../config");
const { buildStatus, branchSlug, buildKey, deployBranch, cancelBuild } = require("../../build");
const { runningServers, killServer } = require("../../process");
const { loadLog, logStreams } = require("../../logs");

// Stop server
router.post("/stop/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  if (runningServers[key]) { runningServers[key].manualStop = true; killServer(key); }
  if (buildStatus[key]) buildStatus[key].status = "stopped";
  res.json({ ok: true });
});

// Webhook
router.post("/webhook", (req, res) => {
  const config = getConfig();
  // Verify webhook signature if WEBHOOK_SECRET is set
  const secret = getSecret("WEBHOOK_SECRET", "WEBHOOK_SECRET");
  if (secret) {
    const sig = req.headers["x-hub-signature-256"] || "";
    // Use raw body (preserved by express.json verify option) for accurate HMAC
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
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

// SSE log stream
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
  const config = getConfig();
  const slug = req.query.slug || req.query.branch;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return res.status(404).json({ error: "Branch config not found" });
  deployBranch(repoConfig, bc);
  res.json({ ok: true, message: (bc.mode === "server" ? "Server restart" : "Build") + " started" });
});

// Cancel build
router.post("/cancel/:owner/:repo", (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const cancelled = cancelBuild(key);
  if (cancelled) {
    res.json({ ok: true, message: "Build cancelled" });
  } else {
    res.json({ ok: false, message: "No active build to cancel" });
  }
});

// Status & log
router.get("/status/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  res.json(buildStatus[key] || { status: "idle" });
});

router.get("/log/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const s = buildStatus[key];
  const log = s && s.log ? s.log : loadLog(key);
  res.type("text/plain").send(log || "No build log.");
});

module.exports = router;
