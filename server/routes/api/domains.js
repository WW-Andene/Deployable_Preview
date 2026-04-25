// ── Custom-domain mapping CRUD sub-router (H4) ───────────────────────────────
// Hostnames → (owner, repo, slug). The customDomainsMiddleware does the
// actual rewrite on each request; this file just manages the lookup table.
// User owns the DNS — they CNAME their domain at the DV host.

"use strict";

const express = require("express");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");
const { branchSlug } = require("../../build");
const audit = require("../../audit");

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

router.get("/domains", (req, res) => {
  const cfg = getConfig();
  const map = (cfg && cfg.domains) || {};
  res.json({
    domains: Object.keys(map).map((host) => Object.assign({ host }, map[host]))
  });
});

router.post("/domains",
  audit.logAction("domain.add", { target: ["body.host"], bodyKeys: ["owner", "repo", "slug"] }),
  (req, res) => {
    const { host, owner, repo, slug } = req.body || {};
    const h = String(host || "").toLowerCase().trim();
    if (!HOST_RE.test(h)) return res.status(400).json({ error: "Invalid host (must be a real DNS name)" });
    if (!owner || !repo || !slug) return res.status(400).json({ error: "owner, repo, slug required" });
    const cfg = getConfig();
    const r = (cfg.repos || []).find((x) => x.owner === owner && x.repo === repo);
    if (!r) return res.status(404).json({ error: "Repo not configured: " + owner + "/" + repo });
    const bc = (r.activeBranches || []).find((b) => branchSlug(b) === slug);
    if (!bc) return res.status(404).json({ error: "Branch not configured for slug: " + slug });
    if (!cfg.domains) cfg.domains = {};
    cfg.domains[h] = { owner, repo, slug };
    saveConfig();
    res.json({
      ok: true, host: h, target: { owner, repo, slug },
      hint: "Point '" + h + "' at this server via DNS A or CNAME, then visit https://" + h
    });
  }
);

router.delete("/domains/:host",
  audit.logAction("domain.remove", { target: ["params.host"] }),
  (req, res) => {
    const cfg = getConfig();
    const h = String(req.params.host || "").toLowerCase().trim();
    if (!cfg.domains || !cfg.domains[h]) return res.status(404).json({ error: "host not mapped" });
    delete cfg.domains[h];
    saveConfig();
    res.json({ ok: true });
  }
);

module.exports = router;
