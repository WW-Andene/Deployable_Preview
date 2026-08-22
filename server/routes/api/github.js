// ── GitHub-fetching sub-router ───────────────────────────────────────────────
// All read-only proxies to the GitHub API: user repo list, branches,
// README, framework auto-detect. Per-route caches keep API quota low.

"use strict";

const express = require("express");
const router = express.Router();

const { getConfig } = require("../../config");
const { ghApi } = require("../../github");

// ── Per-SHA commit-date cache (1024-entry LRU) ──────────────────────────────
const _commitDateCache = new Map();
function _cacheGetDate(sha) {
  const v = _commitDateCache.get(sha);
  if (v !== undefined) {
    _commitDateCache.delete(sha);
    _commitDateCache.set(sha, v);
  }
  return v;
}
function _cachePutDate(sha, date) {
  if (_commitDateCache.size >= 1024) {
    _commitDateCache.delete(_commitDateCache.keys().next().value);
  }
  _commitDateCache.set(sha, date);
}

// ── User's GitHub repositories ──────────────────────────────────────────────
let _reposCache = null;
const REPOS_CACHE_TTL_MS = 5 * 60 * 1000;

router.get("/github/repos", async (req, res) => {
  try {
    const config = getConfig();
    if (!config.token) return res.status(401).json({ error: "GitHub token not set" });
    const type = (req.query.type || "all").toLowerCase();
    const force = req.query.refresh === "1";
    const now = Date.now();
    if (!force && _reposCache && _reposCache.type === type && (now - _reposCache.fetchedAt) < REPOS_CACHE_TTL_MS) {
      return res.json({ repos: _reposCache.data, cached: true, ageMs: now - _reposCache.fetchedAt });
    }
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const path = "/user/repos?per_page=100&sort=updated&type=" + encodeURIComponent(type) + "&page=" + page;
      const batch = await ghApi(path, config.token);
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const r of batch) {
        all.push({
          owner: r.owner && r.owner.login,
          repo: r.name,
          fullName: r.full_name,
          description: r.description || "",
          private: !!r.private,
          fork: !!r.fork,
          archived: !!r.archived,
          defaultBranch: r.default_branch,
          updatedAt: r.updated_at,
          pushedAt: r.pushed_at,
          stars: r.stargazers_count || 0,
          language: r.language || null
        });
      }
      if (batch.length < 100) break;
    }
    _reposCache = { fetchedAt: now, type, data: all };
    res.json({ repos: all, cached: false, count: all.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── README (10-min cached) ──────────────────────────────────────────────────
const _readmeCache = new Map();
const README_TTL_MS = 10 * 60 * 1000;

router.get("/github/:owner/:repo/readme", async (req, res) => {
  const key = req.params.owner + "/" + req.params.repo;
  const now = Date.now();
  const hit = _readmeCache.get(key);
  if (hit && (now - hit.fetchedAt) < README_TTL_MS) {
    return res.json({ md: hit.md, cached: true, ageMs: now - hit.fetchedAt });
  }
  try {
    const cfg = getConfig();
    if (!cfg.token) return res.status(401).json({ error: "GitHub token not set" });
    const meta = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/readme", cfg.token);
    if (!meta || !meta.content) { _readmeCache.set(key, { md: "", fetchedAt: now }); return res.json({ md: "" }); }
    const md = Buffer.from(meta.content, meta.encoding || "base64").toString("utf8");
    _readmeCache.set(key, { md, fetchedAt: now });
    res.json({ md, cached: false });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Branch list with commit-date enrichment ─────────────────────────────────
router.get("/github/:owner/:repo/branches", async (req, res) => {
  try {
    const config = getConfig();
    const branches = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/branches?per_page=100", config.token);
    const info = await ghApi("/repos/" + req.params.owner + "/" + req.params.repo, config.token);
    const withDates = branches.map((b) => ({ name: b.name, sha: b.commit && b.commit.sha, date: null }));
    const need = [];
    for (const b of withDates.slice(0, 30)) {
      const cached = b.sha ? _cacheGetDate(b.sha) : null;
      if (cached !== undefined && cached !== null) b.date = cached;
      else if (b.sha) need.push(b);
    }
    if (need.length) {
      try {
        const dateResults = await Promise.all(need.map((b) =>
          ghApi("/repos/" + req.params.owner + "/" + req.params.repo + "/commits/" + b.sha, config.token)
            .then((c) => ({ name: b.name, sha: b.sha, date: c.commit && c.commit.committer && c.commit.committer.date }))
            .catch(() => ({ name: b.name, sha: b.sha, date: null }))
        ));
        const dateMap = {};
        for (const d of dateResults) {
          dateMap[d.name] = d.date;
          if (d.date) _cachePutDate(d.sha, d.date);
        }
        for (const b of withDates) { if (b.date == null) b.date = dateMap[b.name] || null; }
      } catch (_) { /* fall through */ }
    }
    withDates.sort((a, b) => {
      if (a.name === info.default_branch) return -1;
      if (b.name === info.default_branch) return 1;
      if (a.date && b.date) return new Date(b.date) - new Date(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ branches: withDates.map((b) => b.name), defaultBranch: info.default_branch, description: info.description });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Framework detection ─────────────────────────────────────────────────────
router.get("/github/:owner/:repo/detect", async (req, res) => {
  const branch = req.query.branch || "";
  const baseDir = req.query.baseDir || "";
  const pkgPath = (baseDir ? baseDir.replace(/^\/|\/$/g, "") + "/" : "") + "package.json";
  const { detect } = require("../../framework-detect");
  try {
    const config = getConfig();
    const url = "/repos/" + req.params.owner + "/" + req.params.repo +
                "/contents/" + encodeURI(pkgPath) +
                (branch ? "?ref=" + encodeURIComponent(branch) : "");
    const meta = await ghApi(url, config.token);
    if (!meta || !meta.content) return res.json({ framework: "unknown", confidence: "none", reason: "no package.json" });
    const raw = Buffer.from(meta.content, meta.encoding || "base64").toString("utf8");
    let pkg;
    try { pkg = JSON.parse(raw); } catch (e) { return res.json({ framework: "unknown", confidence: "none", reason: "invalid package.json: " + e.message }); }
    res.json(detect(pkg));
  } catch (e) {
    if (/Not Found/i.test(e.message)) { res.json({ framework: "none", confidence: "none", reason: "no package.json on this branch" }); return; }
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
