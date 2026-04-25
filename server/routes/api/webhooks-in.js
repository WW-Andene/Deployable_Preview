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
  const sig = req.headers["x-hub-signature-256"] || "";
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.warn("[WEBHOOK] Signature mismatch from " + (req.ip || "unknown"));
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const event = req.headers["x-github-event"];
  const fullName = req.body.repository && req.body.repository.full_name;
  if (!fullName) return res.status(400).json({ error: "Invalid payload — missing repository" });
  const [owner, repo] = fullName.split("/");
  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.owner === owner && r.repo === repo);
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
