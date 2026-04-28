// ── Repos & branches CRUD sub-router ─────────────────────────────────────────
// /repos          — list (with branch statuses + ETag), create, delete
// /repos/:o/:r    — patch top-level toggles
// /repos/:o/:r/branch — add, edit, delete branch configs

"use strict";

const express = require("express");
const { exec } = require("child_process");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");
const { buildStatus, branchSlug, buildKey, getBranchDir, deployBranch, queueAhead } = require("../../build");
const { runningServers, killServer } = require("../../process");

// Body-supplied owner/repo names skip the router.param("owner"/"repo")
// validator, which only fires on path parameters. POST /api/repos takes
// these from req.body and feeds them straight into path.join via
// getBranchDir; an owner containing "/" or starting with ".." escapes
// the workspace root. Same shape as SAFE_NAME_RE in routes/api/index.js
// — keep them in sync.
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

// ── List repos with branch statuses (ETag-aware) ────────────────────────────
router.get("/repos", (req, res) => {
  const config = getConfig();
  const crypto = require("crypto");
  const withStatus = config.repos.map((r) => {
    const branchStatuses = {};
    for (const bc of r.activeBranches || []) {
      const slug = branchSlug(bc);
      const bk = buildKey(r.owner, r.repo, bc);
      const srv = runningServers[bk];
      // Strip heavy fields (thumb base64, full log) — exposed on dedicated endpoints.
      const raw = buildStatus[bk] || { status: "idle" };
      // eslint-disable-next-line no-unused-vars
      const { thumb, diffThumb, log, ...lean } = raw;
      branchStatuses[slug] = {
        ...lean,
        hasThumb: !!raw.thumb,
        hasDiffThumb: !!raw.diffThumb,
        thumbAt: raw.thumbAt || null,
        branch: bc.branch,
        baseDir: bc.baseDir || "",
        buildCommand: bc.buildCommand || "",
        outputDir: bc.outputDir || "",
        mode: bc.mode || "static",
        startCommand: bc.startCommand || "",
        envVars: bc.envVars || "",
        language: bc.language || "auto",
        serverPort: srv ? srv.port : null,
        queuedAhead: lean.status === "queued" ? queueAhead(bk) : 0
      };
    }
    return { ...r, branchStatuses };
  });
  // Stable hash → ETag. Lets clients short-circuit polling with 304.
  const body = JSON.stringify(withStatus);
  const etag = '"' + crypto.createHash("sha1").update(body).digest("base64").slice(0, 16) + '"';
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  res.type("application/json").send(body);
});

router.post("/repos", (req, res) => {
  const config = getConfig();
  const { owner, repo, activeBranches, buildCommand, outputDir, baseDir, description, mode, startCommand, envVars, language } = req.body;
  if (!owner || typeof owner !== "string" || !SAFE_NAME_RE.test(owner)) {
    return res.status(400).json({ error: "Invalid owner name" });
  }
  if (!repo || typeof repo !== "string" || !SAFE_NAME_RE.test(repo)) {
    return res.status(400).json({ error: "Invalid repo name" });
  }
  const id = owner + "/" + repo;
  if (config.repos.some((r) => r.id === id)) return res.status(400).json({ error: "Already exists" });
  const branchConfigs = (activeBranches || []).map((b) => {
    if (typeof b === "object") return b;
    return { branch: b, baseDir: baseDir || "", buildCommand: "", outputDir: "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "", language: language || "auto" };
  });
  const newRepo = { id, owner, repo, activeBranches: branchConfigs, buildCommand: buildCommand || "", outputDir: outputDir || "", baseDir: baseDir || "", description: description || "", startCommand: startCommand || "" };
  config.repos.push(newRepo);
  saveConfig();
  for (const bc of branchConfigs) deployBranch(newRepo, bc);
  res.json(newRepo);
});

// I2: repo-level PATCH for top-level toggles. Whitelisted to avoid drift.
const PATCHABLE_REPO_KEYS = ["autoPRPreviews", "description", "buildCommand", "outputDir", "baseDir", "startCommand", "mode"];
router.patch("/repos/:owner/:repo", (req, res) => {
  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  for (const k of PATCHABLE_REPO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
      if (k === "autoPRPreviews") repoConfig[k] = !!req.body[k];
      else if (typeof req.body[k] === "string") repoConfig[k] = req.body[k];
    }
  }
  saveConfig();
  res.json({ ok: true, repo: repoConfig });
});

router.post("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { branch, baseDir, buildCommand, outputDir, mode, startCommand, envVars, language } = req.body;
  if (!branch) return res.status(400).json({ error: "branch required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bd = baseDir || "";
  if (repoConfig.activeBranches.some((bc) => bc.branch === branch && (bc.baseDir || "") === bd))
    return res.status(400).json({ error: "Branch with this root directory already active" });
  const bc = { branch, baseDir: bd, buildCommand: buildCommand || "", outputDir: outputDir || "", mode: mode || "static", startCommand: startCommand || "", envVars: envVars || "", language: language || "auto" };
  repoConfig.activeBranches.push(bc);
  saveConfig();
  deployBranch(repoConfig, bc);
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

router.delete("/repos/:owner/:repo", (req, res) => {
  const config = getConfig();
  const id = req.params.owner + "/" + req.params.repo;
  const repoConfig = config.repos.find((r) => r.id === id);
  // Tear down each branch's runtime state before forgetting the repo —
  // otherwise server-mode processes keep running, ports stay allocated,
  // buildStatus slots leak, and workspace clones accumulate on disk.
  if (repoConfig) {
    for (const bc of repoConfig.activeBranches || []) {
      const key = buildKey(req.params.owner, req.params.repo, bc);
      killServer(key);
      delete buildStatus[key];
      const dir = getBranchDir(req.params.owner, req.params.repo, bc);
      exec("rm -rf " + JSON.stringify(dir), () => {});
    }
  }
  config.repos = config.repos.filter((r) => r.id !== id);
  saveConfig();
  res.json({ ok: true });
});

router.delete("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: "slug query param required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const idx = repoConfig.activeBranches.findIndex((bc) => branchSlug(bc) === slug);
  if (idx === -1) return res.status(404).json({ error: "Branch config not found" });
  const bc = repoConfig.activeBranches[idx];
  const key = buildKey(req.params.owner, req.params.repo, bc);
  killServer(key);
  delete buildStatus[key];
  const dir = getBranchDir(req.params.owner, req.params.repo, bc);
  exec("rm -rf " + JSON.stringify(dir), () => {});
  repoConfig.activeBranches.splice(idx, 1);
  saveConfig();
  res.json({ ok: true, activeBranches: repoConfig.activeBranches });
});

// D3: customSlug — letters/numbers/_/- only, ≤ 64 chars.
const CUSTOM_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;

router.put("/repos/:owner/:repo/branch", (req, res) => {
  const config = getConfig();
  const { slug, baseDir, buildCommand, outputDir, mode, startCommand, envVars, language, customSlug, previewPassword } = req.body;
  if (!slug) return res.status(400).json({ error: "slug required" });
  const repoConfig = config.repos.find((r) => r.owner === req.params.owner && r.repo === req.params.repo);
  if (!repoConfig) return res.status(404).json({ error: "Repo not found" });
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return res.status(404).json({ error: "Branch config not found" });
  if (baseDir !== undefined) bc.baseDir = baseDir;
  if (buildCommand !== undefined) bc.buildCommand = buildCommand;
  if (outputDir !== undefined) bc.outputDir = outputDir;
  if (mode !== undefined) bc.mode = mode;
  if (startCommand !== undefined) bc.startCommand = startCommand;
  if (envVars !== undefined) bc.envVars = envVars;
  if (language !== undefined) bc.language = language;
  if (previewPassword !== undefined) bc.previewPassword = String(previewPassword || "");
  if (req.body.injectSecrets !== undefined) bc.injectSecrets = !!req.body.injectSecrets;
  if (req.body.schedule !== undefined) bc.schedule = req.body.schedule;
  if (req.body.budgets !== undefined) {
    const b = req.body.budgets || {};
    bc.budgets = {
      maxBundleBytes: Math.max(0, Number(b.maxBundleBytes) || 0) || undefined,
      maxBuildSeconds: Math.max(0, Number(b.maxBuildSeconds) || 0) || undefined,
      action: b.action === "fail" ? "fail" : "warn"
    };
  }
  if (req.body.edge !== undefined) {
    const e = req.body.edge && typeof req.body.edge === "object" ? req.body.edge : {};
    bc.edge = {
      redirects: Array.isArray(e.redirects) ? e.redirects.filter((r) => r && r.from && r.to).map((r) => ({
        from: String(r.from), to: String(r.to),
        status: [301,302,307,308].indexOf(Number(r.status)) !== -1 ? Number(r.status) : 302
      })) : [],
      headers: Array.isArray(e.headers) ? e.headers.filter((h) => h && typeof h.headers === "object").map((h) => ({
        pathPattern: String(h.pathPattern || "/*"), headers: h.headers
      })) : []
    };
  }
  if (req.body.envGroupIds !== undefined) {
    bc.envGroupIds = Array.isArray(req.body.envGroupIds)
      ? req.body.envGroupIds.filter((x) => typeof x === "string" && x)
      : [];
  }
  if (customSlug !== undefined) {
    const cs = String(customSlug || "").trim();
    if (cs === "") {
      bc.customSlug = "";
    } else {
      if (!CUSTOM_SLUG_RE.test(cs)) {
        return res.status(400).json({ error: "Invalid customSlug — letters, numbers, _ and - only (1–64 chars)" });
      }
      const collision = (repoConfig.activeBranches || []).some((other) => {
        if (other === bc) return false;
        if (other.customSlug && other.customSlug === cs) return true;
        if (!other.customSlug && branchSlug(other) === cs) return true;
        return false;
      });
      if (collision) return res.status(409).json({ error: "customSlug already in use by another branch in this repo" });
      bc.customSlug = cs;
    }
  }
  saveConfig();
  res.json({ ok: true, branch: bc });
});

module.exports = router;
