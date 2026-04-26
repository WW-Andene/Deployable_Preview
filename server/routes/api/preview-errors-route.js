// ── Runtime-error collector routes (J3) ──────────────────────────────────────
// Public — called by the user's own deployed JS via the inline collector
// the proxy injects into HTML responses. Auth would gate the user's app.
// Server-side dedupes by signature, caps at 50 unique entries per branch.

"use strict";

const express = require("express");
const router = express.Router();

const previewErrors = require("../../preview-errors");
const { getConfig } = require("../../config");
const { branchSlug } = require("../../build");

// The POST endpoint is intentionally public (called by the in-app
// collector that the proxy injects into deployed HTML), but accepting
// arbitrary owner/repo/slug from the open internet would let any
// unauthenticated client fill the in-memory errorsByKey Map with
// junk keys — DoS / memory pressure / drowning out real entries.
// Drop any post whose key doesn't match a real configured branch.
function _isKnownBranch(owner, repo, slug) {
  const cfg = getConfig();
  const r = (cfg.repos || []).find((x) => x.owner === owner && x.repo === repo);
  if (!r) return false;
  return (r.activeBranches || []).some((bc) => branchSlug(bc) === slug);
}

router.post("/preview-errors/:owner/:repo/:slug", express.json({ limit: "32kb" }), (req, res) => {
  const { owner, repo, slug } = req.params;
  if (!_isKnownBranch(owner, repo, slug)) {
    // 204 (not 404) so probes don't get a useful signal.
    return res.status(204).end();
  }
  const key = owner + "/" + repo + ":" + slug;
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
