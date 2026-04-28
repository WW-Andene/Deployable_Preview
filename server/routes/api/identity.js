// ── Identity & secrets sub-router ────────────────────────────────────────────
// Token (GitHub PAT), secrets store, preferences. Mounted at /api by the
// parent index — paths inside this file are relative to that mount.

"use strict";

const express = require("express");
const router = express.Router();

const { getConfig, saveConfig } = require("../../config");
const { ghApi, ghApiRaw } = require("../../github");
const audit = require("../../audit");

// ── Token ────────────────────────────────────────────────────────────────────
// Validates the PAT against /user/repos. That endpoint requires the `repo`
// scope on classic PATs (or the equivalent fine-grained permission), so a
// 2xx response is sufficient proof the token works for our use case — no
// need to parse the X-OAuth-Scopes header (which fine-grained tokens omit
// anyway, and which an earlier revision of this code parsed too strictly,
// rejecting valid tokens whose scope strings didn't include the literal
// "repo" — e.g. orgs that grant access via SAML rather than scopes).
// Strip surrounding whitespace AND a single layer of matching quotes
// — common copy-from-docs mistakes (pasting "ghp_…" verbatim from a
// JSON snippet or 'ghp_…' from a YAML config). Without this, the
// token reaches GitHub with literal quote characters and 401s
// despite being perfectly valid.
function _cleanToken(raw) {
  let t = String(raw || "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))) {
    if (t.length >= 2) t = t.slice(1, -1).trim();
  }
  return t;
}

router.post("/token", async (req, res) => {
  const config = getConfig();
  const raw = (req.body && req.body.token) || "";
  const token = _cleanToken(raw);
  if (!token) {
    config.token = "";
    saveConfig();
    return res.status(400).json({ error: "Token required", code: "empty" });
  }
  config.token = token;
  saveConfig();
  try {
    const probe = await ghApiRaw("/user/repos?per_page=1", token);
    if (probe.status === 401) {
      config.token = ""; saveConfig();
      return res.status(401).json({ error: "Invalid or expired token", code: "invalid" });
    }
    if (probe.status === 403) {
      config.token = ""; saveConfig();
      const msg = (probe.body && probe.body.message) || "Forbidden";
      // 403 on /user/repos most often means missing `repo` scope (or
      // SAML SSO not authorized). Surface GitHub's own message verbatim.
      return res.status(401).json({ error: "Token rejected by GitHub: " + msg, code: "forbidden" });
    }
    if (probe.status >= 400) {
      config.token = ""; saveConfig();
      return res.status(401).json({ error: "GitHub " + probe.status + " " + ((probe.body && probe.body.message) || ""), code: "gh_error" });
    }
    // 2xx — token works. Pull /user once for the login + record observed
    // scopes for diagnostics, but don't gate acceptance on them.
    const scopes = String((probe.headers && probe.headers["x-oauth-scopes"]) || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const isFineGrained = /^github_pat_/i.test(token);
    let login = "";
    try { const u = await ghApi("/user", token); login = u && u.login || ""; } catch (_) { /* non-fatal */ }
    res.json({ ok: true, user: login, scopes, fineGrained: isFineGrained });
  } catch (e) {
    config.token = ""; saveConfig();
    res.status(401).json({ error: e.message, code: "network" });
  }
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
  const secretsMeta = config.secretsMeta || {};
  // Build a case-folded view of stored secrets so any pre-existing
  // mixed-case keys (saved by an older revision before the POST
  // normalized to uppercase) still surface under their canonical
  // uppercase name. A literal-key match still wins over the folded
  // match — protects against two intentionally-different-cased
  // entries that happen to share an uppercase form.
  const folded = {};
  const foldedMeta = {};
  for (const k of Object.keys(secrets)) {
    const u = k.toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(folded, u)) folded[u] = secrets[k];
    if (secretsMeta[k] && !foldedMeta[u]) foldedMeta[u] = secretsMeta[k];
  }
  const allKeys = new Map();
  for (const sk of SUGGESTED_KEYS) allKeys.set(sk.key, { ...sk });
  for (const k of Object.keys(folded)) {
    if (!allKeys.has(k)) allKeys.set(k, { key: k, label: k, hint: "Custom key" });
  }
  const result = [];
  for (const [key, meta] of allKeys) {
    let val = secrets[key] || folded[key] || process.env[key] || "";
    if (key === "GITHUB_TOKEN" && !val) val = config.token || "";
    const meta2 = secretsMeta[key] || foldedMeta[key] || null;
    result.push({
      key,
      label: meta.label || key,
      setAt: meta2 && meta2.setAt ? meta2.setAt : null,
      hint: meta.hint || "",
      link: meta.link || null,
      suggested: SUGGESTED_KEYS.some((sk) => sk.key === key),
      hasValue: !!val,
      masked: maskValue(val),
      source: (secrets[key] || folded[key]) ? "config" : (process.env[key] ? "env" : (key === "GITHUB_TOKEN" && config.token ? "config" : "none"))
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
  // Normalize to uppercase. Env-var convention is uppercase by POSIX
  // definition; process.env is case-sensitive on Linux/macOS; every
  // getSecret() call site in this codebase uses the uppercase form.
  // Without this, a bulk paste of `github_token=ghp_…` stored under
  // the literal lowercase key and the rest of the app went on looking
  // for GITHUB_TOKEN — the secret was 'set' but invisible to anyone
  // reading it.
  const upperRaw = rawKey.toUpperCase();
  const key = KEY_ALIASES[upperRaw] || upperRaw;
  const cased = key !== rawKey;     // we changed the case OR aliased
  if (!Object.prototype.hasOwnProperty.call(config.secrets, key) && Object.keys(config.secrets).length >= MAX_SECRETS) {
    return res.status(429).json({ error: "Secret cap reached (" + MAX_SECRETS + ")" });
  }
  // Same quote-stripping the token endpoint applies — covers pastes
  // of `KEY="value"` style lines from .env.example snippets that the
  // bulk parser already strips, but a direct POST to a single key
  // (or an over-eager paste handler in a browser) bypasses.
  const trimmed = _cleanToken(value);
  if (!config.secretsMeta) config.secretsMeta = {};
  if (trimmed) {
    config.secrets[key] = trimmed;
    if (key === "GITHUB_TOKEN") config.token = trimmed;
    process.env[key] = trimmed;
    // Record set-time in a side table (config.secretsMeta) so we don't
    // change the shape of config.secrets and break older configs that
    // assume flat string values. Lets the UI render 'set 12d ago' so
    // users can see which secrets are stale and need rotation.
    config.secretsMeta[key] = { setAt: Date.now() };
    // Also clear any stale lowercase/mixed-case version that may have
    // been written by the buggy older revision so reads are unambiguous.
    if (rawKey !== key && Object.prototype.hasOwnProperty.call(config.secrets, rawKey)) {
      delete config.secrets[rawKey];
      delete config.secretsMeta[rawKey];
      try { delete process.env[rawKey]; } catch (_) {}
    }
  } else {
    delete config.secrets[key];
    delete config.secretsMeta[key];
    if (key === "GITHUB_TOKEN") config.token = "";
    delete process.env[key];
  }
  saveConfig();
  res.json({ ok: true, key, aliasedFrom: cased ? rawKey : undefined, hasValue: !!trimmed });
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
  if (config.secretsMeta) delete config.secretsMeta[key];
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
