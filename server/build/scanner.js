/**
 * build/scanner.js — post-build secret scanning + performance budgets.
 *
 * After every successful build we walk the output dir looking for:
 *   1. Leaked secrets — regex sweep over text-like files. Fires
 *      build.security.warning webhook + records on the history entry.
 *   2. Performance budget violations — bundle bytes vs branch.budgets,
 *      duration vs branch.budgets.
 *
 * Both are best-effort and never crash the build. Misses are infinitely
 * better than false-fail-on-customer's-real-build.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Patterns that almost certainly indicate a real leaked secret.
// Conservative on purpose — false positives are worse than false
// negatives in this UX (the user's been told "your bundle is leaking"
// by mistake will lose trust fast).
const SECRET_PATTERNS = [
  { id: "github_pat",      re: /\bghp_[A-Za-z0-9]{36}\b/g,                 label: "GitHub Personal Access Token" },
  { id: "github_oauth",    re: /\bgho_[A-Za-z0-9]{36}\b/g,                 label: "GitHub OAuth token" },
  { id: "github_app",      re: /\bghs_[A-Za-z0-9]{36}\b/g,                 label: "GitHub App token" },
  { id: "github_refresh",  re: /\bghr_[A-Za-z0-9]{36}\b/g,                 label: "GitHub Refresh token" },
  { id: "openai",          re: /\bsk-[A-Za-z0-9]{20,}\b/g,                 label: "OpenAI API key" },
  { id: "anthropic",       re: /\bsk-ant-[A-Za-z0-9-]{40,}\b/g,            label: "Anthropic API key" },
  { id: "stripe_live",     re: /\bsk_live_[A-Za-z0-9]{24,}\b/g,            label: "Stripe LIVE secret key" },
  { id: "stripe_pub",      re: /\bpk_live_[A-Za-z0-9]{24,}\b/g,            label: "Stripe LIVE publishable key" },
  { id: "aws_access",      re: /\bAKIA[0-9A-Z]{16}\b/g,                    label: "AWS Access Key ID" },
  { id: "google_api",      re: /\bAIza[0-9A-Za-z_-]{35}\b/g,               label: "Google API key" },
  { id: "slack_token",     re: /\bxox[abp]-[A-Za-z0-9-]{10,}\b/g,          label: "Slack token" },
  { id: "private_key_pem", re: /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/g, label: "PEM private key" }
];

const SCANNABLE_EXT = /\.(html?|js|mjs|cjs|jsx|ts|tsx|json|css|map|txt|md|env|yml|yaml|xml|svg)$/i;
const MAX_FILE_BYTES = 5 * 1024 * 1024;          // skip files larger than 5MB
const MAX_FINDINGS_TOTAL = 500;                  // hard cap so a malicious file can't blow memory

function scanForSecrets(rootDir) {
  const findings = [];
  function walk(d) {
    if (findings.length >= MAX_FINDINGS_TOTAL) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.isFile() || !SCANNABLE_EXT.test(e.name)) continue;
      let stat;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      if (stat.size > MAX_FILE_BYTES) continue;
      let content;
      try { content = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
      for (const p of SECRET_PATTERNS) {
        const matches = content.match(p.re);
        if (!matches) continue;
        // Mask the matched value so we don't echo the secret in our
        // own log/UI/webhook.
        for (const m of matches.slice(0, 3)) {
          if (findings.length >= MAX_FINDINGS_TOTAL) return;
          findings.push({
            type: p.id,
            label: p.label,
            file: path.relative(rootDir, full),
            preview: m.slice(0, 6) + "…" + m.slice(-4)
          });
        }
      }
    }
  }
  walk(rootDir);
  return findings;
}

// Compare actual build metrics against a per-branch budgets object.
// budgets shape:
//   { maxBundleBytes?: number, maxBuildSeconds?: number, action?: "warn"|"fail" }
function checkBudgets(metrics, budgets) {
  const out = { violations: [], action: (budgets && budgets.action) || "warn" };
  if (!budgets) return out;
  if (budgets.maxBundleBytes && metrics.outputBytes > budgets.maxBundleBytes) {
    out.violations.push({
      kind: "bundle_size",
      limit: budgets.maxBundleBytes,
      actual: metrics.outputBytes,
      overBy: metrics.outputBytes - budgets.maxBundleBytes,
      message: "Bundle size " + (metrics.outputBytes / 1024).toFixed(1) + " KB exceeds budget " +
               (budgets.maxBundleBytes / 1024).toFixed(1) + " KB"
    });
  }
  if (budgets.maxBuildSeconds && metrics.duration > budgets.maxBuildSeconds) {
    out.violations.push({
      kind: "build_duration",
      limit: budgets.maxBuildSeconds,
      actual: metrics.duration,
      overBy: metrics.duration - budgets.maxBuildSeconds,
      message: "Build took " + metrics.duration + "s, over budget of " + budgets.maxBuildSeconds + "s"
    });
  }
  return out;
}

module.exports = { scanForSecrets, checkBudgets, SECRET_PATTERNS };
