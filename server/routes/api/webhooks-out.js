// ── Outgoing webhook CRUD ────────────────────────────────────────────────────
// Slack / Discord / custom-URL receivers fired on build state transitions.
// HMAC `X-DV-Signature: sha256=<hex>` over the JSON body when `secret`
// is set on the subscriber. Secrets are never echoed in API responses.

"use strict";

const express = require("express");
const router = express.Router();

const webhooks = require("../../webhooks");

router.get("/webhooks", (req, res) => {
  res.json({
    webhooks: webhooks.listWebhooks().map(w => ({ ...w, secret: undefined, hasSecret: !!w.secret })),
    validEvents: webhooks.VALID_EVENTS
  });
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

// Test endpoint: fire a synthetic build.ready to a single subscriber.
// Temporarily forces enabled + events:["*"] so the recipient sees the
// ping regardless of the subscriber's configured filter.
router.post("/webhooks/:id/test", (req, res) => {
  const wh = webhooks.listWebhooks().find(w => w.id === req.params.id);
  if (!wh) return res.status(404).json({ error: "webhook not found" });
  try {
    const fake = {
      repo: "owner/repo", branch: "main", slug: "main",
      commitSha: "0000000abcdef", duration: 12.3,
      previewUrl: "/preview/owner/repo/main/"
    };
    const saved = { events: wh.events, enabled: wh.enabled };
    wh.events = ["*"]; wh.enabled = true;
    webhooks.emit("build.ready", fake);
    wh.events = saved.events; wh.enabled = saved.enabled;
    res.json({ ok: true, message: "Test event dispatched (check receiver)" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
