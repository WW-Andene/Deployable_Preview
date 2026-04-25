// ── Build artifact ZIP download (H3) ─────────────────────────────────────────
// Streams a STORED-only ZIP of the current outputDir so users can deploy
// the same bytes elsewhere or hand them to a customer for offline review.
// Filename: <repo>-<slug>-<sha7>.zip — character-sanitised.

"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const { createZipStream } = require("../../zip-stream");
const { buildStatus } = require("../../build");

function _walk(rootDir, sub, out) {
  const cur = sub ? path.join(rootDir, sub) : rootDir;
  let entries;
  try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    const rel = sub ? path.posix.join(sub, e.name) : e.name;
    if (e.isDirectory()) _walk(rootDir, rel, out);
    else if (e.isFile())  out.push(rel);
  }
}

router.get("/artifact/:owner/:repo", async (req, res) => {
  const slug = req.query.slug || req.query.branch || "";
  if (!slug) return res.status(400).json({ error: "slug required" });
  const key = req.params.owner + "/" + req.params.repo + ":" + slug;
  const slot = buildStatus[key];
  if (!slot || !slot.outputPath) return res.status(404).json({ error: "No build output for " + key });
  if (!fs.existsSync(slot.outputPath)) return res.status(410).json({ error: "Output dir missing on disk" });

  const filename = req.params.repo + "-" + slug + "-" + (slot.commitSha || "").slice(0, 7) + ".zip";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="' + filename.replace(/[^A-Za-z0-9._-]/g, "_") + '"');
  res.setHeader("Cache-Control", "no-store");

  const files = [];
  _walk(slot.outputPath, "", files);

  const z = createZipStream(res);
  try {
    for (const rel of files) await z.addFile(rel, path.join(slot.outputPath, rel));
    await z.end();
  } catch (e) {
    console.error("[artifact] zip stream error:", e.message);
    try { res.end(); } catch (_) {}
  }
});

module.exports = router;
