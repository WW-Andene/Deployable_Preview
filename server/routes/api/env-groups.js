// ── Env-var groups CRUD sub-router (E1) ──────────────────────────────────────
// Reusable named bundles of KEY=value pairs. Branches reference them by id
// via envGroupIds; resolveBranchEnv merges them into the build/run env.
// Values are masked (last-4) when listed via API — never echoed in clear.

"use strict";

const express = require("express");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");

const SAFE_ID_RE  = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

router.get("/env-groups", (req, res) => {
  const cfg = getConfig();
  const groups = (cfg.envGroups || []).map((g) => ({
    id: g.id, name: g.name,
    keys: Object.keys(g.vars || {}),
    keyCount: Object.keys(g.vars || {}).length
  }));
  res.json({ groups });
});

router.get("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  const g = (cfg.envGroups || []).find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "group not found" });
  const masked = {};
  for (const k of Object.keys(g.vars || {})) {
    const v = String(g.vars[k] || "");
    masked[k] = v.length <= 4 ? "••••" : "••••" + v.slice(-4);
  }
  res.json({ id: g.id, name: g.name, vars: masked, keyCount: Object.keys(g.vars || {}).length });
});

router.post("/env-groups", (req, res) => {
  const cfg = getConfig();
  if (!Array.isArray(cfg.envGroups)) cfg.envGroups = [];
  const { id, name, vars } = req.body || {};
  if (!id || !SAFE_ID_RE.test(id)) return res.status(400).json({ error: "id required (a-z, 0-9, _ or -, ≤64 chars)" });
  if (cfg.envGroups.some((g) => g.id === id)) return res.status(409).json({ error: "id already exists" });
  const cleanVars = {};
  if (vars && typeof vars === "object" && !Array.isArray(vars)) {
    for (const k of Object.keys(vars)) {
      if (!SAFE_ENV_RE.test(k)) return res.status(400).json({ error: "Invalid var name '" + k + "' — A-Z, 0-9, _ only" });
      const v = vars[k];
      if (typeof v !== "string") return res.status(400).json({ error: "Var '" + k + "' must be a string" });
      cleanVars[k] = v;
    }
  }
  cfg.envGroups.push({ id, name: String(name || id), vars: cleanVars });
  saveConfig();
  res.json({ ok: true, id });
});

router.put("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  const g = (cfg.envGroups || []).find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "group not found" });
  const { name, vars } = req.body || {};
  if (typeof name === "string" && name) g.name = name;
  if (vars && typeof vars === "object" && !Array.isArray(vars)) {
    const cleanVars = {};
    for (const k of Object.keys(vars)) {
      if (!SAFE_ENV_RE.test(k)) return res.status(400).json({ error: "Invalid var name '" + k + "'" });
      const v = vars[k];
      if (typeof v !== "string") return res.status(400).json({ error: "Var '" + k + "' must be a string" });
      cleanVars[k] = v;
    }
    g.vars = cleanVars;
  }
  saveConfig();
  res.json({ ok: true, id: g.id });
});

router.delete("/env-groups/:id", (req, res) => {
  const cfg = getConfig();
  if (!Array.isArray(cfg.envGroups)) return res.status(404).json({ error: "no groups" });
  const before = cfg.envGroups.length;
  cfg.envGroups = cfg.envGroups.filter((g) => g.id !== req.params.id);
  if (cfg.envGroups.length === before) return res.status(404).json({ error: "group not found" });
  saveConfig();
  res.json({ ok: true });
});

module.exports = router;
