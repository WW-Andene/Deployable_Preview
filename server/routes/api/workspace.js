// ── Workspace + config import/export sub-router ──────────────────────────────
// /workspace/stats   — disk usage + active vs orphaned dir count
// /workspace/cleanup — rm -rf orphaned per-branch dirs (path-traversal-safe)
// /config/export     — sanitized JSON dump (secrets / token / apiSecret stripped)
// /config/import     — merge repos that don't already exist

"use strict";

const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

router.get("/workspace/stats", (req, res) => {
  const { WORKSPACE, branchSlug } = require("../../build");
  try {
    const dirs = fs.readdirSync(WORKSPACE);
    const config = getConfig();
    const activeKeys = new Set();
    for (const repo of config.repos) {
      for (const bc of repo.activeBranches || []) {
        activeKeys.add(repo.owner + "__" + repo.repo + "__" + branchSlug(bc));
      }
    }
    const stats = dirs.map((d) => ({ name: d, active: activeKeys.has(d) }));
    res.json({
      total: dirs.length,
      active: stats.filter((s) => s.active).length,
      orphaned: stats.filter((s) => !s.active).length,
      dirs: stats
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/workspace/cleanup", async (req, res) => {
  const { WORKSPACE, branchSlug } = require("../../build");
  const config = getConfig();
  const activeKeys = new Set();
  for (const repo of config.repos) {
    for (const bc of repo.activeBranches || []) {
      activeKeys.add(repo.owner + "__" + repo.repo + "__" + branchSlug(bc));
    }
  }
  try {
    const dirs = await fsp.readdir(WORKSPACE);
    const targets = [];
    for (const d of dirs) {
      if (activeKeys.has(d)) continue;
      const fullPath = path.resolve(WORKSPACE, d);
      // Belt-and-braces: skip paths that escape the workspace root.
      if (!fullPath.startsWith(path.resolve(WORKSPACE) + path.sep)) continue;
      targets.push(fullPath);
    }
    // fs.rm with shell=false is faster, atomic per-call, and surfaces
    // errors. The previous shell-out fire-and-forget hid disk-full +
    // permission failures and the user got an optimistic "removed N"
    // toast even when nothing was deleted.
    const results = await Promise.allSettled(targets.map((p) => fsp.rm(p, { recursive: true, force: true })));
    const removed = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - removed;
    const errors = results
      .filter((r) => r.status === "rejected")
      .slice(0, 5)
      .map((r) => (r.reason && r.reason.message) || "rm failed");
    res.json({ ok: true, removed, failed, remaining: dirs.length - removed, errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/config/export", (req, res) => {
  const config = getConfig();
  // F-J007 + F-C015: strip everything that could leak credentials.
  const safe = {
    ...config,
    token: config.token ? "[redacted]" : "",
    secrets: undefined,
    apiSecret: undefined,
    preferences: config.preferences || {},
    __version: "1.1"
  };
  res.setHeader("Content-Disposition", 'attachment; filename="deployview-config.json"');
  res.json(safe);
});

router.post("/config/import", (req, res) => {
  const config = getConfig();
  const imported = req.body;
  if (!imported || !Array.isArray(imported.repos)) {
    return res.status(400).json({ error: "Invalid config: repos array required" });
  }
  let added = 0;
  let skippedDup = 0;
  for (const repo of imported.repos) {
    if (!repo.owner || !repo.repo) continue;
    if (!SAFE_NAME_RE.test(repo.owner) || !SAFE_NAME_RE.test(repo.repo)) continue;
    const id = repo.owner + "/" + repo.repo;
    // Case-insensitive duplicate detection — same reasoning as POST /repos:
    // GitHub treats Owner/Repo and owner/repo as the same source.
    const idLower = id.toLowerCase();
    if (config.repos.some((r) => r.id.toLowerCase() === idLower)) { skippedDup++; continue; }
    config.repos.push({ ...repo, id });
    added++;
  }
  if (added > 0) saveConfig();
  res.json({ ok: true, added, skippedDup, total: config.repos.length });
});

module.exports = router;
