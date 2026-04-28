// ── Deployment-history routes ────────────────────────────────────────────────
// History listing, rollback, notes (single string per entry), tags
// (memorable per-entry name), and comment threads. All proxy to the
// build/state.js persistence layer via services/deployment.js.

"use strict";

const express = require("express");
const router = express.Router();

const audit = require("../../audit");
const deployment = require("../../services/deployment");
const STATUS = deployment.CODE_TO_STATUS;
const { setHistoryTag, addHistoryComment, deleteHistoryComment } = require("../../build");

router.get("/history/:owner/:repo", (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  const r = deployment.listHistory(req.params.owner, req.params.repo, slug);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ history: r.history, currentOutput: r.current });
});

router.post("/rollback/:owner/:repo",
  audit.logAction("rollback", { target: ["params.owner", "params.repo", "body.slug"], bodyKeys: ["historyId"] }),
  (req, res) => {
    const { slug, historyId } = req.body || {};
    const r = deployment.rollback(req.params.owner, req.params.repo, slug, historyId);
    if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
    res.json({ ok: true, message: r.message, entry: r.entry });
  }
);

// Set / clear free-text note. Empty string clears.
router.post("/history/:owner/:repo/note", (req, res) => {
  const { slug, historyId, note } = req.body || {};
  const r = deployment.annotateHistory(req.params.owner, req.params.repo, slug, historyId, note);
  if (!r.ok) return res.status(STATUS[r.code] || 500).json({ error: r.error });
  res.json({ ok: true, entry: r.entry });
});

// K4: tag a snapshot with a memorable name (transfers off any prior holder).
router.post("/history/:owner/:repo/tag", (req, res) => {
  const { slug, historyId, tag } = req.body || {};
  if (!slug || !historyId) return res.status(400).json({ error: "slug + historyId required" });
  // Lowercased owner/repo for case-insensitive routing parity (the rest
  // of the codebase routes via the canonical lower-case key now — this
  // endpoint was still using raw URL casing).
  const key = String(req.params.owner).toLowerCase() + "/" + String(req.params.repo).toLowerCase() + ":" + slug;
  let entry;
  try { entry = setHistoryTag(key, historyId, tag); }
  catch (e) {
    if (e && e.code === "INVALID_TAG") return res.status(400).json({ error: e.message });
    throw e;
  }
  if (!entry) return res.status(404).json({ error: "history entry not found" });
  res.json({ ok: true, entry });
});

// H5: comments thread. Add → 200 with comment, delete → 200 / 404.
router.post("/history/:owner/:repo/comment", (req, res) => {
  const { slug, historyId, by, text } = req.body || {};
  if (!slug || !historyId || !text) return res.status(400).json({ error: "slug, historyId, text required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const c = addHistoryComment(key, historyId, by || "anon", text);
  if (!c) return res.status(404).json({ error: "history entry not found OR text empty" });
  res.json({ ok: true, comment: c });
});

router.delete("/history/:owner/:repo/comment/:commentId", (req, res) => {
  const { slug, historyId } = req.query;
  if (!slug || !historyId) return res.status(400).json({ error: "slug + historyId query required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const ok = deleteHistoryComment(key, historyId, req.params.commentId);
  if (!ok) return res.status(404).json({ error: "comment not found" });
  res.json({ ok: true });
});

module.exports = router;
