// ── Android live-session sub-router ─────────────────────────────────────────
// Start/stop a live Android emulator session, poll status, stream logs,
// and proxy screenshot/tap/swipe/text/key calls to the running bridge.

const express = require("express");
const router = express.Router();

const { sessionStatus, startSession, stopSession, bridgeRequest } = require("../../android-session");
const { logStreams } = require("../../logs");

function keyOf(req) {
  const slug = req.query.slug;
  if (!slug) return null;
  return req.params.owner + "/" + req.params.repo + ":" + slug;
}

router.post("/android-session/:owner/:repo", (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  if (sessionStatus[key] && (sessionStatus[key].status === "starting" || sessionStatus[key].status === "ready")) {
    return res.status(409).json({ error: "Session already running for this branch" });
  }
  let workingDir = (req.body && req.body.workingDir) ? String(req.body.workingDir).trim() : ".";
  if (/\.\.[\\/]|[\\/]\.\./.test(workingDir) || /^[\\/]/.test(workingDir)) {
    return res.status(400).json({ error: "Invalid workingDir — must be a relative path without '..'" });
  }
  const timeoutMinutes = Math.min(360, Math.max(10, parseInt(req.body && req.body.timeoutMinutes, 10) || 90));
  startSession(req.params.owner, req.params.repo, req.query.slug, workingDir, timeoutMinutes);
  res.json({ ok: true, message: "Android session starting" });
});

router.post("/android-session/:owner/:repo/stop", async (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  await stopSession(req.params.owner, req.params.repo, req.query.slug);
  res.json({ ok: true });
});

router.get("/android-session/:owner/:repo/status", (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  const st = sessionStatus[key] || { status: "idle" };
  // Never leak the bridge bearer token to the general status payload.
  const { bridgeToken, ...safe } = st;
  res.json(safe);
});

router.get("/android-session/:owner/:repo/log-stream", (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");
  if (sessionStatus[key] && sessionStatus[key].log) {
    res.write("data: " + JSON.stringify({ log: sessionStatus[key].log }) + "\n\n");
  }
  const stream = { res, key: "android:" + key, closed: false };
  logStreams.push(stream);
  req.on("close", () => { stream.closed = true; });
});

// Live-view screenshot poll (drives the preview iframe). No auth token
// echoed to the client — this route holds the bridge credentials server-side.
router.get("/android-session/:owner/:repo/screenshot", async (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  try {
    const { buffer, contentType } = await bridgeRequest(key, "GET", "/screenshot");
    res.setHeader("Content-Type", contentType || "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post("/android-session/:owner/:repo/input", async (req, res) => {
  const key = keyOf(req);
  if (!key) return res.status(400).json({ error: "slug query param required" });
  const { action, ...body } = req.body || {};
  const paths = {
    tap: "/tap", swipe: "/swipe", text: "/text", key: "/key", ui: "/ui",
    shell: "/shell", logcat: "/logcat", tapElement: "/tap_element",
    batch: "/batch", stress: "/stress", state: "/state"
  };
  if (!paths[action]) return res.status(400).json({ error: "action must be one of: " + Object.keys(paths).join(", ") });
  try {
    const method = action === "ui" ? "GET" : "POST";
    const { buffer, contentType } = await bridgeRequest(key, method, paths[action], method === "POST" ? body : undefined);
    res.setHeader("Content-Type", contentType || "application/json");
    res.send(buffer);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
