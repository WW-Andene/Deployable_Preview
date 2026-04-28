// ── Identity & secrets sub-router ────────────────────────────────────────────
// Token (GitHub PAT), secrets store, preferences. Mounted at /api by the
// parent index — paths inside this file are relative to that mount.

"use strict";

const express = require("express");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");
const { ghApi } = require("../../github");
const audit = require("../../audit");

// ── Token ────────────────────────────────────────────────────────────────────
router.post("/token", (req, res) => {
  const config = getConfig();
  config.token = req.body.token || "";
  saveConfig();
  ghApi("/user", config.token)
    .then((user) => res.json({ ok: true, user: user.login }))
    .catch((e) => { config.token = ""; saveConfig(); res.status(401).json({ error: e.message }); });
});

router.get("/token", (req, res) => {
  res.json({ hasToken: !!getConfig().token });
});

// ── Secrets / Keys management ────────────────────────────────────────────────
const SUGGESTED_KEYS = [
  { key: "GITHUB_TOKEN",       label: "GitHub Token",         hint: "Personal Access Token with repo + workflow scope", link: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=DeployView" },
  { key: "NGROK_AUTHTOKEN",    label: "ngrok Auth Token",     hint: "Free at ngrok.com — enables HTTPS tunnels", link: "https://dashboard.ngrok.com/get-started/your-authtoken" },
  { key: "BROWSERLESS_API_KEY",label: "Browserless API Key",  hint: "Remote browser for screenshots on mobile/Android — free 1k units", link: "https://www.browserless.io/pricing" },
  { key: "BROWSER_WS_ENDPOINT",label: "Browser WS Endpoint",  hint: "Custom Chrome DevTools WebSocket URL (overrides Browserless)" },
  { key: "WEBHOOK_SECRET",     label: "Webhook Secret",       hint: "GitHub webhook HMAC verification (optional)" },
  { key: "OPENAI_API_KEY",     label: "OpenAI API Key",       hint: "For AI-powered features in your apps", link: "https://platform.openai.com/api-keys" },
  { key: "ANTHROPIC_API_KEY",  label: "Anthropic API Key",    hint: "Claude API access for your apps", link: "https://console.anthropic.com/settings/keys" },
  { key: "GROQ_API_KEY",       label: "Groq API Key",         hint: "Enables visual_query / find_element / visual_diff / verify_loop (vision-model Q&A on screenshots)", link: "https://console.groq.com/keys" },
  { key: "VERCEL_TOKEN",       label: "Vercel Token",         hint: "For Vercel API integrations" },
  { key: "SUPABASE_KEY",       label: "Supabase Key",         hint: "Supabase project API key" },
  { key: "DATABASE_URL",       label: "Database URL",         hint: "PostgreSQL / MySQL connection string" },
  { key: "STRIPE_SECRET_KEY",  label: "Stripe Secret Key",    hint: "For payment integrations", link: "https://dashboard.stripe.com/apikeys" },
  { key: "RESEND_API_KEY",     label: "Resend API Key",       hint: "For email sending", link: "https://resend.com/api-keys" }
];
const SAFE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const MAX_SECRETS = 200;

// Common name confusions — older docs / .env.example used these spellings.
// Normalize on save so users pasting from old sources don't silently fail.
const KEY_ALIASES = {
  BROWSERLESS_WS_ENDPOINT: "BROWSER_WS_ENDPOINT",
  BROWSERLESS_TOKEN: "BROWSERLESS_API_KEY",
  NGROK_TOKEN: "NGROK_AUTHTOKEN",
  NGROK_AUTH_TOKEN: "NGROK_AUTHTOKEN"
};

// F-C015: don't leak the leading bytes — token-type prefixes (ghp_, sk-, …)
// already shrink the search space; combined with the trailing 4 they hand
// an attacker a useful brute-force prefix. Show only the trailing 4.
function maskValue(val) {
  if (!val) return "";
  if (val.length <= 4) return "••••";
  return "••••" + val.slice(-4);
}

router.get("/secrets", (req, res) => {
  const config = getConfig();
  const secrets = config.secrets || {};
  const allKeys = new Map();
  for (const sk of SUGGESTED_KEYS) allKeys.set(sk.key, { ...sk });
  for (const k of Object.keys(secrets)) {
    if (!allKeys.has(k)) allKeys.set(k, { key: k, label: k, hint: "Custom key" });
  }
  const result = [];
  for (const [key, meta] of allKeys) {
    let val = secrets[key] || process.env[key] || "";
    if (key === "GITHUB_TOKEN" && !val) val = config.token || "";
    result.push({
      key,
      label: meta.label || key,
      hint: meta.hint || "",
      link: meta.link || null,
      suggested: SUGGESTED_KEYS.some((sk) => sk.key === key),
      hasValue: !!val,
      masked: maskValue(val),
      source: secrets[key] ? "config" : (process.env[key] ? "env" : (key === "GITHUB_TOKEN" && config.token ? "config" : "none"))
    });
  }
  res.json(result);
});

router.get("/secrets/suggestions", (req, res) => {
  res.json(SUGGESTED_KEYS);
});

router.post("/secrets", audit.logAction("secret.write", { target: ["body.key"] }), (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const { key: rawKey, value } = req.body;
  if (!rawKey || typeof rawKey !== "string") return res.status(400).json({ error: "key required" });
  if (!SAFE_KEY_RE.test(rawKey)) return res.status(400).json({ error: "Invalid key name — use A-Z, 0-9, _ only" });
  if (value === undefined || value === null) return res.status(400).json({ error: "value required" });
  const key = KEY_ALIASES[rawKey] || rawKey;
  const aliased = key !== rawKey;
  if (!Object.prototype.hasOwnProperty.call(config.secrets, key) && Object.keys(config.secrets).length >= MAX_SECRETS) {
    return res.status(429).json({ error: "Secret cap reached (" + MAX_SECRETS + ")" });
  }
  const trimmed = String(value).trim();
  if (trimmed) {
    config.secrets[key] = trimmed;
    if (key === "GITHUB_TOKEN") config.token = trimmed;
    process.env[key] = trimmed;
  } else {
    delete config.secrets[key];
    if (key === "GITHUB_TOKEN") config.token = "";
    delete process.env[key];
  }
  saveConfig();
  res.json({ ok: true, key, aliasedFrom: aliased ? rawKey : undefined, hasValue: !!trimmed });
});

router.delete("/secrets/:key", audit.logAction("secret.delete", { target: ["params.key"] }), (req, res) => {
  const config = getConfig();
  if (!config.secrets) config.secrets = {};
  const key = req.params.key;
  if (!SAFE_KEY_RE.test(key)) return res.status(400).json({ error: "Invalid key name" });
  // Only clear process.env when DV is the one that put the value there.
  // Otherwise an authed DELETE could wipe a system-provided env var
  // (PATH, HOME, …) that DV never set, breaking the running process.
  const wasOurs = Object.prototype.hasOwnProperty.call(config.secrets, key);
  delete config.secrets[key];
  if (key === "GITHUB_TOKEN") config.token = "";
  if (wasOurs) delete process.env[key];
  saveConfig();
  res.json({ ok: true, key, removed: wasOurs });
});

// ── Preferences ──────────────────────────────────────────────────────────────
router.get("/preferences", (req, res) => {
  res.json(getConfig().preferences || {});
});

router.post("/preferences", (req, res) => {
  const config = getConfig();
  if (!config.preferences) config.preferences = {};
  const updates = req.body;
  if (typeof updates !== "object" || updates === null || Array.isArray(updates)) return res.status(400).json({ error: "Object required" });
  for (const key of Object.keys(updates)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    config.preferences[key] = updates[key];
  }
  saveConfig();
  res.json({ ok: true, preferences: config.preferences });
});

module.exports = router;
