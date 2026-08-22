// ── Custom-domain mapping CRUD sub-router (H4) ───────────────────────────────
// Hostnames → (owner, repo, slug). The customDomainsMiddleware does the
// actual rewrite on each request; this file just manages the lookup table.
// User owns the DNS — they CNAME their domain at the DV host.

"use strict";

const express = require("express");
const router = express.Router();
const dns = require("dns").promises;
const os = require("os");

const { getConfig, saveConfig } = require("../../config");
const { branchSlug } = require("../../build");
const audit = require("../../audit");

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Best-effort: collect non-loopback IPv4/IPv6 of this host so we can
// compare against the user's resolved DNS. Network changes are rare
// enough that we cache forever per process.
let _myIps = null;
function _localIps() {
  if (_myIps) return _myIps;
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (!a.internal) out.push(a.address);
    }
  }
  _myIps = out;
  return out;
}

async function _probeDns(host) {
  const result = { host, a: [], aaaa: [], cname: null, error: null, pointsHere: false };
  try {
    result.a = await dns.resolve4(host).catch(() => []);
    result.aaaa = await dns.resolve6(host).catch(() => []);
    try { const c = await dns.resolveCname(host); if (c && c.length) result.cname = c[0]; } catch (_) {}
    if (!result.a.length && !result.aaaa.length && !result.cname) {
      result.error = "No A, AAAA, or CNAME record found";
      return result;
    }
    const mine = new Set(_localIps());
    for (const ip of result.a.concat(result.aaaa)) {
      if (mine.has(ip)) { result.pointsHere = true; break; }
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

router.get("/domains", (req, res) => {
  const cfg = getConfig();
  const map = (cfg && cfg.domains) || {};
  res.json({
    domains: Object.keys(map).map((host) => Object.assign({ host }, map[host]))
  });
});

router.post("/domains",
  audit.logAction("domain.add", { target: ["body.host"], bodyKeys: ["owner", "repo", "slug"] }),
  async (req, res) => {
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
    const probe = await _probeDns(h);
    let hint;
    if (probe.error) {
      hint = "Mapping saved, but DNS lookup for '" + h + "' failed (" + probe.error + "). Add an A record pointing to this server's IP, or a CNAME if your provider supports flat-zone CNAMEs.";
    } else if (!probe.pointsHere) {
      const where = probe.cname ? ("CNAME → " + probe.cname) : ("A " + probe.a.concat(probe.aaaa).join(", "));
      hint = "DNS resolves (" + where + ") but not to this server. Update DNS to point at this host, then revisit.";
    } else {
      hint = "DNS already points at this server. Visit https://" + h;
    }
    res.json({ ok: true, host: h, target: { owner, repo, slug }, dns: probe, hint });
  }
);

// On-demand DNS recheck — UI calls this from a "refresh" button so the
// user can confirm propagation without re-creating the mapping.
router.get("/domains/:host/check", async (req, res) => {
  const cfg = getConfig();
  const h = String(req.params.host || "").toLowerCase().trim();
  if (!cfg.domains || !cfg.domains[h]) return res.status(404).json({ error: "host not mapped" });
  const probe = await _probeDns(h);
  res.json({ ok: true, host: h, dns: probe });
});

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
