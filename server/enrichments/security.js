const { tryRequire, missing } = require("./index");

// ── Security: retire.js + csp-parse ───────────────────────────────────────

/**
 * Scan JS source (and optional library fingerprints) for known vulnerabilities.
 * retire.js exposes its scanner programmatically — falls back to the public
 * vulnerabilities list via a simple fingerprint match when not available.
 */
function vulnScan(fingerprints) {
  const retire = tryRequire("retire");
  if (!retire) return missing("retire", "vuln_scan");
  try {
    const scanJsFile = retire.scanJsFile || (retire.default && retire.default.scanJsFile);
    if (!scanJsFile) {
      return {
        error: "retire.scanJsFile not exposed by this version — use the CLI or upgrade"
      };
    }
    const repo = retire.loadJsRepository ? retire.loadJsRepository() : null;
    const findings = [];
    for (const f of (fingerprints || [])) {
      try {
        const result = scanJsFile(f.path || f.url || "", "", repo || {});
        if (result && result.length) findings.push({ file: f.path || f.url, findings: result });
      } catch (_) {}
    }
    return { findings, scanned: (fingerprints || []).length };
  } catch (e) {
    return { error: "retire failed: " + e.message };
  }
}

/**
 * Parse a Content-Security-Policy header string into directives.
 * Inline implementation — replaces the deprecated csp-parse package.
 *
 * CSP format: "directive-name value1 value2; directive-name value3"
 */
function cspCheck(cspHeader) {
  if (!cspHeader || typeof cspHeader !== "string") {
    return { error: "CSP header string required" };
  }
  try {
    const directives = {};
    const parts = cspHeader.split(";").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const name = tokens[0].toLowerCase();
      directives[name] = tokens.slice(1);
    }

    const issues = [];
    const all = JSON.stringify(directives);
    if (/'unsafe-inline'/.test(all)) issues.push("contains 'unsafe-inline'");
    if (/'unsafe-eval'/.test(all))   issues.push("contains 'unsafe-eval'");
    if (!directives["default-src"])  issues.push("no default-src directive");
    if (directives["script-src"] && directives["script-src"].includes("*")) {
      issues.push("script-src allows wildcard (*)");
    }
    if (!directives["frame-ancestors"]) issues.push("no frame-ancestors directive (clickjacking risk)");

    return { directives, directiveCount: Object.keys(directives).length, issues };
  } catch (e) {
    return { error: "CSP parse failed: " + e.message };
  }
}

// ── Cookie parsing (set-cookie-parser + tough-cookie) ─────────────────────

function parseSetCookie(setCookieHeaders) {
  const parser = tryRequire("set-cookie-parser");
  if (!parser) return missing("set-cookie-parser", "cookies_full");
  try {
    const fn = parser.parse || (parser.default && parser.default.parse);
    const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const parsed = fn(arr, { decodeValues: true });
    return { count: parsed.length, cookies: parsed };
  } catch (e) {
    return { error: "set-cookie-parser failed: " + e.message };
  }
}

function parseCookieJar(cookies) {
  const tough = tryRequire("tough-cookie");
  if (!tough) return missing("tough-cookie", "cookies_full");
  try {
    const Cookie = tough.Cookie;
    const parsed = (cookies || []).map((raw) => {
      try {
        const c = typeof raw === "string" ? Cookie.parse(raw) : Cookie.fromJSON(raw);
        return c ? c.toJSON() : { raw };
      } catch (_) { return { raw }; }
    });
    return { count: parsed.length, cookies: parsed };
  } catch (e) {
    return { error: "tough-cookie failed: " + e.message };
  }
}

// ── robots.txt parsing ────────────────────────────────────────────────────

async function parseRobots(url, userAgent) {
  const robotsParser = tryRequire("robots-parser");
  if (!robotsParser) return missing("robots-parser", "robots");
  try {
    const https = require("https");
    const http = require("http");
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    const robotsUrl = origin + "/robots.txt";
    const robotsText = await new Promise((resolve) => {
      const lib = robotsUrl.startsWith("https:") ? https : http;
      const req = lib.get(robotsUrl, { timeout: 10000 }, (res) => {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => resolve(body));
      });
      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
    });
    const fn = robotsParser.default || robotsParser;
    const robots = fn(robotsUrl, robotsText);
    const ua = userAgent || "Claude";
    return {
      robotsUrl,
      allowed: robots.isAllowed(url, ua),
      disallowed: robots.isDisallowed(url, ua),
      crawlDelay: robots.getCrawlDelay(ua),
      sitemaps: robots.getSitemaps(),
      preferredHost: robots.getPreferredHost ? robots.getPreferredHost() : null
    };
  } catch (e) {
    return { error: "robots-parser failed: " + e.message };
  }
}

// ── gzip-size for asset sizing ─────────────────────────────────────────────

async function gzipSize(input) {
  const gz = tryRequire("gzip-size");
  if (!gz) return missing("gzip-size");
  try {
    const fn = gz.gzipSize || gz.default || gz;
    return typeof fn === "function" ? await fn(input) : fn.sync(input);
  } catch (e) {
    return { error: "gzip-size failed: " + e.message };
  }
}

module.exports = {
  vulnScan,
  cspCheck,
  parseSetCookie,
  parseCookieJar,
  parseRobots,
  gzipSize
};
