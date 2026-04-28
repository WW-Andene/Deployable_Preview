// ── Incoming GitHub webhook receiver ─────────────────────────────────────────
// HMAC-verified push + pull_request handler. F-C002: WEBHOOK_SECRET is
// mandatory; missing secret returns 403 fail-secure.
//
// push        → trigger every matching active branch
// pull_request → if repoConfig.autoPRPreviews:
//                  opened/reopened/synchronize → ensure pr-<N> branch + build
//                  closed                       → drop pr-<N> branch

"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { getConfig, getSecret, saveConfig } = require("../../config");
const { deployBranch } = require("../../build");

router.post("/webhook", (req, res) => {
  const secret = getSecret("WEBHOOK_SECRET", "WEBHOOK_SECRET");
  if (!secret) {
    console.warn("[WEBHOOK] Rejected: WEBHOOK_SECRET is unset (set it in Settings → Secrets to enable webhooks)");
    return res.status(403).json({ error: "WEBHOOK_SECRET not configured on server" });
  }
  // raw body MUST be captured by the json-body verify hook in index.js —
  // re-serializing req.body would change key order and bytes (whitespace,
  // unicode escaping) and the HMAC would always mismatch. Fail loudly
  // instead of falsely rejecting every legitimate webhook.
  if (!req.rawBody) {
    console.error("[WEBHOOK] req.rawBody missing — body-parser verify hook not wired. Payload cannot be HMAC-verified.");
    return res.status(500).json({ error: "Server misconfigured: raw body not captured" });
  }
  const sig = req.headers["x-hub-signature-256"] || "";
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  let sigBuf, expBuf;
  try { sigBuf = Buffer.from(sig); expBuf = Buffer.from(expected); }
  catch (_) { sigBuf = Buffer.alloc(0); expBuf = Buffer.alloc(0); }
  if (!sig || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn("[WEBHOOK] Signature mismatch from " + (req.ip || "unknown"));
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const event = req.headers["x-github-event"];
  const fullName = req.body.repository && req.body.repository.full_name;
  if (!fullName || typeof fullName !== "string") return res.status(400).json({ error: "Invalid payload — missing repository" });
  // GitHub names are ASCII and may contain dot/underscore/dash only; the
  // first slash splits owner from repo. Don't naive-split — pathological
  // payloads with multiple slashes would silently mismatch lookups.
  const slashAt = fullName.indexOf("/");
  if (slashAt <= 0 || slashAt === fullName.length - 1) return res.status(400).json({ error: "Invalid repository name" });
  const owner = fullName.slice(0, slashAt);
  const repo = fullName.slice(slashAt + 1);
  const config = getConfig();
  // GitHub treats owner/repo case-insensitively (you can clone Foo/Bar
  // as foo/bar). Match the same way so a webhook for "Foo/Bar" still
  // hits a config stored as "foo/bar".
  const repoConfig = config.repos.find((r) =>
    r.owner.toLowerCase() === owner.toLowerCase() &&
    r.repo.toLowerCase() === repo.toLowerCase()
  );
  if (!repoConfig) return res.json({ ok: true, skipped: true });

  if (event === "push") {
    const ref = (req.body.ref || "").replace("refs/heads/", "");
    if (!ref) return res.status(400).json({ error: "Invalid payload" });
    let triggered = 0;
    for (const bc of repoConfig.activeBranches) {
      if (bc.branch === ref) {
        Promise.resolve(deployBranch(repoConfig, bc)).catch((e) => {
          console.error("[WEBHOOK] Build failed for " + fullName + ":" + ref + " — " + e.message);
        });
        triggered++;
      }
    }
    console.log("[WEBHOOK] push " + fullName + ":" + ref + " — " + triggered + " build(s)");
    return res.json({ ok: true, triggered });
  }

  // I2: auto PR previews — opt-in per repo.
  if (event === "pull_request" && repoConfig.autoPRPreviews) {
    const action = req.body.action;
    const pr = req.body.pull_request || {};
    const head = pr.head && pr.head.ref;
    const number = pr.number;
    if (!head || !number) return res.json({ ok: true, skipped: true, reason: "no head ref / number" });
    const customSlug = "pr-" + number;

    if (action === "opened" || action === "reopened" || action === "synchronize") {
      let bc = (repoConfig.activeBranches || []).find((b) => b.customSlug === customSlug);
      if (!bc) {
        bc = {
          branch: head, customSlug,
          baseDir: "", buildCommand: "", outputDir: "",
          mode: repoConfig.mode || "static",
          startCommand: "", envVars: ""
        };
        repoConfig.activeBranches.push(bc);
        try { saveConfig(); } catch (_) {}
      }
      Promise.resolve(deployBranch(repoConfig, bc)).catch((e) => {
        console.error("[WEBHOOK] PR build failed for #" + number + ": " + e.message);
      });
      console.log("[WEBHOOK] pr " + action + " " + fullName + " #" + number + " head=" + head + " slug=" + customSlug);
      return res.json({ ok: true, action, prNumber: number, slug: customSlug });
    }

    if (action === "closed") {
      const before = repoConfig.activeBranches.length;
      repoConfig.activeBranches = (repoConfig.activeBranches || []).filter((b) => b.customSlug !== customSlug);
      if (repoConfig.activeBranches.length !== before) {
        try { saveConfig(); } catch (_) {}
        console.log("[WEBHOOK] pr closed " + fullName + " #" + number + " — slug " + customSlug + " removed");
        return res.json({ ok: true, action, prNumber: number, slug: customSlug, removed: true });
      }
      return res.json({ ok: true, action, prNumber: number, slug: customSlug, removed: false });
    }

    return res.json({ ok: true, action, prNumber: number, skipped: true });
  }

  return res.json({ ok: true, skipped: true, event });
});

module.exports = router;
