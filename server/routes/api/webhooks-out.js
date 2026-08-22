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
  try {
    const wh = webhooks.updateWebhook(req.params.id, req.body || {});
    if (!wh) return res.status(404).json({ error: "webhook not found" });
    res.json({ ok: true, webhook: { ...wh, secret: undefined, hasSecret: !!wh.secret } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/webhooks/:id", (req, res) => {
  const ok = webhooks.removeWebhook(req.params.id);
  if (!ok) return res.status(404).json({ error: "webhook not found" });
  res.json({ ok: true });
});

// Test endpoint: synchronously POST a synthetic build.ready to the
// subscriber and report what the receiver said. This is a *real*
// round-trip — if the URL is dead the user finds out here, not when
// the next real build silently fails to deliver.
router.post("/webhooks/:id/test", async (req, res) => {
  const wh = webhooks.listWebhooks().find(w => w.id === req.params.id);
  if (!wh) return res.status(404).json({ error: "webhook not found" });
  const fake = {
    repo: "owner/repo", branch: "main", slug: "main",
    commitSha: "0000000abcdef", duration: 12.3,
    previewUrl: "/preview/owner/repo/main/"
  };
  try {
    const body = webhooks._shapePayload(wh.format, "build.ready", fake);
    const r = await webhooks._post(wh.url, body, wh.secret, wh.format);
    webhooks.recordDelivery(wh, "build.ready", r);
    if (r.ok) {
      res.json({ ok: true, statusCode: r.statusCode, message: "Receiver returned " + r.statusCode });
    } else {
      res.status(502).json({
        ok: false,
        statusCode: r.statusCode || null,
        error: r.error || ("Receiver returned " + r.statusCode)
      });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
