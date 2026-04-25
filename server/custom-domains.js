/**
 * custom-domains.js — map incoming Host headers onto preview URLs.
 *
 * config.domains: { "preview.example.com": { owner, repo, slug } }
 *
 * On each request, if the Host header (lowercased, port stripped)
 * matches a configured domain AND the URL doesn't already start with
 * /preview/ or /api/, we rewrite req.url to point at the matching
 * preview. This way users hit https://preview.example.com/some/page
 * and get the same content as /preview/owner/repo/slug/some/page.
 *
 * No-op when:
 *   - the Host header is missing or matches our local origin (so the
 *     dashboard at localhost:3000 keeps working).
 *   - the request is for /api, /preview, /mcp, /test, /browser, /sw.js,
 *     or anything in the dashboard shell.
 *
 * Entries are validated to point at a real (owner, repo, slug) at the
 * time of API write — but routing is best-effort: a stale mapping
 * (branch deleted) just falls through to the default 404.
 */

"use strict";

const SHELL_PREFIXES = [
  "/api/", "/preview/", "/mcp", "/test/", "/browser/",
  "/sw.js", "/manifest.webmanifest", "/icon.svg",
  "/css/", "/js/", "/__auth"
];

function _normalizeHost(h) {
  if (!h) return "";
  const s = String(h).toLowerCase().trim();
  // Strip port
  const colon = s.indexOf(":");
  return colon === -1 ? s : s.slice(0, colon);
}

function _isLocalHost(h) {
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

// Express middleware. Mount before any other route. Honors
// X-Forwarded-Host so reverse proxies (cloudflared, ngrok, custom
// nginx) work too.
function customDomainsMiddleware(req, res, next) {
  const host = _normalizeHost(req.headers["x-forwarded-host"] || req.headers["host"]);
  if (!host || _isLocalHost(host)) return next();
  // If the URL is already a shell path, don't double-route.
  for (const p of SHELL_PREFIXES) if (req.url === p || req.url.startsWith(p)) return next();

  let cfg;
  try { cfg = require("./config").getConfig(); } catch (_) { return next(); }
  const map = (cfg && cfg.domains) || {};
  const entry = map[host];
  if (!entry || !entry.owner || !entry.repo || !entry.slug) return next();

  // Rewrite the URL so the existing /preview/* router picks it up.
  const subpath = req.url === "" || req.url === "/" ? "" : req.url;
  req.url = "/preview/" + encodeURIComponent(entry.owner) + "/" + encodeURIComponent(entry.repo) + "/" + encodeURIComponent(entry.slug) + (subpath.startsWith("/") ? subpath : "/" + subpath);
  // Keep originalUrl pointing at the unmodified path so logs / debug
  // still see what the client asked for.
  next();
}

module.exports = { customDomainsMiddleware };
