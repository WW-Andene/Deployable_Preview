/**
 * preview-auth.js — optional per-branch password gate for preview URLs.
 *
 * If a branchConfig has `previewPassword` set, every request to the
 * matching /preview/:owner/:repo/:slug/* path must present a valid
 * signed cookie. Without it, the user sees a small login form.
 *
 * Cookie name: dv_pp_<key-hash>  (key-hash so the value doesn't leak
 * which branches a user has logged into).
 * Cookie value: HMAC-SHA256(password, apiSecret) hex.
 *
 * The cookie is set by POST /preview/:owner/:repo/:slug/__auth with
 * { password } in the body, and is httpOnly + Secure (when over HTTPS)
 * + SameSite=Lax. 12-hour expiry.
 */

"use strict";

const crypto = require("crypto");
const { getConfig, getApiSecret } = require("./config");
const { branchSlug } = require("./build");

const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

function _resolveBranch(owner, repo, slug) {
  const cfg = getConfig();
  const r = (cfg.repos || []).find((x) => x.owner === owner && x.repo === repo);
  if (!r) return null;
  const bc = (r.activeBranches || []).find((b) => branchSlug(b) === slug);
  if (!bc) return null;
  return { repoConfig: r, bc };
}

function _keyHash(owner, repo, slug) {
  return crypto.createHash("sha256").update(owner + "/" + repo + ":" + slug).digest("hex").slice(0, 16);
}

function _cookieName(owner, repo, slug) {
  return "dv_pp_" + _keyHash(owner, repo, slug);
}

function _expectedCookieValue(password) {
  // HMAC the password with the server's apiSecret. Anyone who can read the
  // cookie still can't recover the password without the secret. The
  // apiSecret is auto-rotated only when the user resets it manually, so
  // existing cookies stay valid across restarts.
  return crypto.createHmac("sha256", getApiSecret()).update(String(password)).digest("hex");
}

function _readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq > 0 && p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

function _constantTimeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch (_) { return false; }
}

function _loginPage(owner, repo, slug, error) {
  const errorBlock = error ? '<div class="err">' + error + '</div>' : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>Preview locked</title>'
    + '<style>'
    + 'body{background:#090a10;color:#e6e1d5;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}'
    + '.card{max-width:340px;width:100%;background:#101218;border:1px solid #1a1e28;border-radius:12px;padding:24px;box-shadow:0 24px 48px rgba(0,0,0,.4)}'
    + 'h1{color:#d4a030;font-size:18px;margin:0 0 4px}'
    + 'p.sub{color:#9e9890;font-size:13px;margin:0 0 18px;font-family:ui-monospace,monospace}'
    + 'label{display:block;font-size:12px;color:#9e9890;margin-bottom:6px;font-family:ui-monospace,monospace}'
    + 'input{width:100%;padding:12px 14px;font-family:ui-monospace,monospace;font-size:14px;background:#090a10;color:#e6e1d5;border:1px solid #1a1e28;border-radius:8px;box-sizing:border-box}'
    + 'input:focus{outline:none;border-color:#d4a030}'
    + 'button{width:100%;margin-top:14px;padding:12px;font-family:inherit;font-size:14px;font-weight:600;background:#d4a030;color:#090a10;border:0;border-radius:8px;cursor:pointer}'
    + 'button:hover{background:#eab840}'
    + '.err{color:#ef4444;font-size:12px;margin-top:10px;font-family:ui-monospace,monospace}'
    + '</style></head><body>'
    + '<form class="card" method="POST" action="/preview/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/' + encodeURIComponent(slug) + '/__auth">'
    + '<h1>Preview locked</h1>'
    + '<p class="sub">' + owner + '/' + repo + ' · ' + slug + '</p>'
    + '<label for="pw">Password</label>'
    + '<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>'
    + errorBlock
    + '<button type="submit">Unlock</button>'
    + '</form></body></html>';
}

// Express middleware. Sits in front of every /preview/:owner/:repo/:slug/*
// route. No-op when the branch has no previewPassword.
function previewAuthMiddleware(req, res, next) {
  const { owner, repo, branchSlug: slug } = req.params;
  if (!owner || !repo || !slug) return next();
  const found = _resolveBranch(owner, repo, slug);
  if (!found || !found.bc.previewPassword) return next(); // no gate
  const expected = _expectedCookieValue(found.bc.previewPassword);
  const supplied = _readCookie(req, _cookieName(owner, repo, slug));
  if (_constantTimeEq(supplied, expected)) return next();
  // Reject — show login form.
  res.status(401).type("text/html").send(_loginPage(owner, repo, slug));
}

// Express handler for POST /preview/:owner/:repo/:branchSlug/__auth
// Body: { password }. Sets the cookie and 302s back to the preview.
function previewAuthLogin(req, res) {
  const { owner, repo, branchSlug: slug } = req.params;
  const found = _resolveBranch(owner, repo, slug);
  if (!found || !found.bc.previewPassword) {
    return res.status(404).type("text/html").send(_loginPage(owner || "?", repo || "?", slug || "?", "No password set on this branch."));
  }
  const supplied = (req.body && req.body.password) ? String(req.body.password) : "";
  if (!supplied || supplied !== String(found.bc.previewPassword)) {
    return res.status(401).type("text/html").send(_loginPage(owner, repo, slug, "Wrong password."));
  }
  const cookieValue = _expectedCookieValue(found.bc.previewPassword);
  const isHttps = req.secure || (req.headers["x-forwarded-proto"] === "https");
  const cookieParts = [
    _cookieName(owner, repo, slug) + "=" + cookieValue,
    "Path=/preview/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/" + encodeURIComponent(slug),
    "Max-Age=" + Math.floor(COOKIE_TTL_MS / 1000),
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttps) cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  res.redirect(302, "/preview/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/" + encodeURIComponent(slug) + "/");
}

module.exports = { previewAuthMiddleware, previewAuthLogin };
