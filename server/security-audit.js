/**
 * security-audit.js — wraps `npm audit --json` and surfaces a parsed,
 * Claude-friendly summary. Pure subprocess; no network beyond npm itself.
 */

"use strict";

const { exec } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");

/**
 * Run npm audit and return a structured summary.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {string} [opts.severity]   — minimum severity to include: low|moderate|high|critical
 * @returns {Promise<{
 *   ok: boolean,
 *   ranAt: string,
 *   totals: {info:number, low:number, moderate:number, high:number, critical:number, total:number},
 *   advisories: Array<{name, severity, title, via, range, fixAvailable, url}>,
 *   raw?: object,
 *   error?: string
 * }>}
 */
function runAudit(opts) {
  opts = opts || {};
  const timeoutMs = Math.max(5000, Math.min(opts.timeoutMs || 30000, 120000));
  const severityFilter = opts.severity ? String(opts.severity).toLowerCase() : null;
  const SEV_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
  const minRank = severityFilter ? (SEV_RANK[severityFilter] || 0) : 0;

  return new Promise((resolve) => {
    exec("npm audit --json --omit=dev || true", { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const ranAt = new Date().toISOString();
      if (!stdout) {
        resolve({ ok: false, ranAt, totals: emptyTotals(), advisories: [], error: (err && err.message) || stderr || "no output from npm audit" });
        return;
      }
      let report;
      try { report = JSON.parse(stdout); }
      catch (e) { resolve({ ok: false, ranAt, totals: emptyTotals(), advisories: [], error: "could not parse npm audit JSON: " + e.message }); return; }

      // npm v7+ shape: report.metadata.vulnerabilities + report.vulnerabilities
      const meta = report.metadata && report.metadata.vulnerabilities;
      const totals = meta
        ? {
            info:     meta.info     || 0,
            low:      meta.low      || 0,
            moderate: meta.moderate || 0,
            high:     meta.high     || 0,
            critical: meta.critical || 0,
            total:    meta.total    || (meta.info + meta.low + meta.moderate + meta.high + meta.critical) || 0
          }
        : emptyTotals();

      const advisoryMap = report.vulnerabilities || {};
      const advisories = [];
      for (const name of Object.keys(advisoryMap)) {
        const v = advisoryMap[name];
        if (!v) continue;
        const sev = v.severity || "info";
        if ((SEV_RANK[sev] || 0) < minRank) continue;
        const via = Array.isArray(v.via) ? v.via.map(function(x){ return typeof x === "string" ? x : (x && x.name) || "?"; }) : [];
        const titles = Array.isArray(v.via) ? v.via.map(function(x){ return x && x.title ? x.title : null; }).filter(Boolean) : [];
        const urls   = Array.isArray(v.via) ? v.via.map(function(x){ return x && x.url   ? x.url   : null; }).filter(Boolean) : [];
        advisories.push({
          name,
          severity: sev,
          title: titles[0] || null,
          via,
          range: v.range || null,
          fixAvailable: v.fixAvailable === true || (v.fixAvailable && typeof v.fixAvailable === "object" ? { name: v.fixAvailable.name, version: v.fixAvailable.version, isSemVerMajor: v.fixAvailable.isSemVerMajor } : false),
          url: urls[0] || null
        });
      }
      // Stable sort: critical → high → moderate → low → info, then name
      advisories.sort(function(a, b) {
        return (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0) || a.name.localeCompare(b.name);
      });

      resolve({
        ok: true,
        ranAt,
        totals,
        advisoriesFound: advisories.length,
        advisories,
        npmVersion: report.metadata && report.metadata.npmVersion,
        nodeVersion: report.metadata && report.metadata.nodeVersion
      });
    });
  });
}

function emptyTotals() {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
}

module.exports = { runAudit };
