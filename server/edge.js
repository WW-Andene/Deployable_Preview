/**
 * edge.js — per-branch edge middleware: redirects + custom headers.
 *
 * Stored on branchConfig.edge:
 *   {
 *     headers: [{ pathPattern, headers: { "X-Foo": "bar" } }],
 *     redirects: [{ from, to, status?: 301|302|307|308 }]
 *   }
 *
 * pathPattern + from match against the path INSIDE the preview (after
 * the /preview/owner/repo/slug/ prefix is stripped). They support a
 * single trailing /* wildcard. No regex — keep the surface tiny so
 * misconfiguration can't crash the proxy.
 *
 * Vercel ships _headers + _redirects files; Netlify reads vercel.json.
 * DV keeps it inside DV's own config so it works for any framework
 * without polluting the user's repo.
 */

"use strict";

function _previewSubpath(req) {
  // Match the prefix the existing routes strip.
  const prefix = "/preview/" + req.params.owner + "/" + req.params.repo + "/" + req.params.branchSlug;
  let p = req.path; // path WITHIN the router scope is already relative
  if (p === "" || p === "/") return "/";
  // Defensive: if we ever get a fully-prefixed url, strip it.
  if (req.originalUrl) {
    const ou = req.originalUrl.split("?")[0];
    if (ou.startsWith(prefix)) p = ou.slice(prefix.length) || "/";
  }
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

function _matchesPattern(pattern, path) {
  if (!pattern) return false;
  if (pattern === path) return true;
  // Single trailing wildcard. /assets/* matches /assets/x, /assets/, etc.
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix + "/") || path === prefix + "/";
  }
  return false;
}

function _applyRedirects(rules, path) {
  for (const r of rules) {
    if (!r || !r.from || !r.to) continue;
    if (_matchesPattern(r.from, path)) {
      const status = (r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308) ? r.status : 302;
      return { to: r.to, status };
    }
  }
  return null;
}

function _applyHeaders(rules, path, res) {
  let applied = 0;
  for (const r of rules) {
    if (!r || !r.headers || typeof r.headers !== "object") continue;
    if (!_matchesPattern(r.pathPattern || "/*", path)) continue;
    for (const h of Object.keys(r.headers)) {
      // Reject content-length / transfer-encoding — these would corrupt
      // the actual response body.
      const lk = h.toLowerCase();
      if (lk === "content-length" || lk === "transfer-encoding") continue;
      try { res.setHeader(h, String(r.headers[h])); applied++; } catch (_) {}
    }
  }
  return applied;
}

// Express middleware. Looks up the branch's edge config from DV config
// and applies redirects / response headers. No-op when bc has no .edge.
function edgeMiddleware(req, res, next) {
  let bc;
  try {
    const { getConfig } = require("./config");
    const { branchSlug } = require("./build");
    const cfg = getConfig();
    const r = (cfg.repos || []).find((x) => x.owner === req.params.owner && x.repo === req.params.repo);
    if (!r) return next();
    bc = (r.activeBranches || []).find((b) => branchSlug(b) === req.params.branchSlug);
  } catch (_) { return next(); }
  if (!bc || !bc.edge || typeof bc.edge !== "object") return next();
  const path = _previewSubpath(req);

  // Redirects first — they short-circuit the response.
  if (Array.isArray(bc.edge.redirects)) {
    const hit = _applyRedirects(bc.edge.redirects, path);
    if (hit) {
      res.setHeader("Location", hit.to);
      return res.status(hit.status).send("Redirecting to " + hit.to);
    }
  }
  // Headers: applied to whatever the downstream handler ends up
  // sending. We monkey-patch the res so they survive res.setHeader
  // calls inside express.static / proxy.
  if (Array.isArray(bc.edge.headers)) {
    _applyHeaders(bc.edge.headers, path, res);
    // Some downstream handlers (proxy.js) call res.removeHeader to
    // strip CSP / X-Frame-Options. Re-apply our headers right before
    // the response ends so user-set values always win.
    const origEnd = res.end;
    res.end = function() {
      try { _applyHeaders(bc.edge.headers, path, res); } catch (_) {}
      return origEnd.apply(this, arguments);
    };
  }
  next();
}

module.exports = { edgeMiddleware };
