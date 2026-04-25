// ── Runtime-error collector routes (J3) ──────────────────────────────────────
// Public — called by the user's own deployed JS via the inline collector
// the proxy injects into HTML responses. Auth would gate the user's app.
// Server-side dedupes by signature, caps at 50 unique entries per branch.

"use strict";

const express = require("express");
const router = express.Router();

const previewErrors = require("../../preview-errors");

router.post("/preview-errors/:owner/:repo/:slug", express.json({ limit: "32kb" }), (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.slug;
  previewErrors.record(key, req.body || {});
  res.status(204).end();
});

router.get("/preview-errors/:owner/:repo/:slug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.slug;
  res.json({ errors: previewErrors.list(key), summary: previewErrors.summary(key) });
});

router.delete("/preview-errors/:owner/:repo/:slug", (req, res) => {
  const key = req.params.owner + "/" + req.params.repo + ":" + req.params.slug;
  previewErrors.clear(key);
  res.json({ ok: true });
});

module.exports = router;
