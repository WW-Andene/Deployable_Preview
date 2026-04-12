const { tryRequire, missing } = require("./index");

// ── Cheerio (HTML parse) + CSS specificity ───────────────────────────────

function parseHtml(html) {
  const cheerio = tryRequire("cheerio");
  if (!cheerio) return null;
  try {
    const load = cheerio.load || (cheerio.default && cheerio.default.load);
    return load(html);
  } catch (_) { return null; }
}

/**
 * Query HTML (page source or remote) with a cheerio selector, return matches.
 * Supports attribute + text extraction.
 */
function domQuery(html, selector, opts) {
  const $ = parseHtml(html);
  if (!$) return missing("cheerio", "dom_query");
  try {
    const max = Math.min(Math.max(parseInt((opts && opts.limit) || 100, 10), 1), 1000);
    const results = [];
    $(selector).each((_, el) => {
      if (results.length >= max) return;
      const $el = $(el);
      const attrs = {};
      if (el.attribs) {
        for (const k of Object.keys(el.attribs)) attrs[k] = el.attribs[k];
      }
      results.push({
        tag: el.name || el.tagName,
        text: $el.text().slice(0, 500).trim(),
        html: $el.html() ? $el.html().slice(0, 1000) : null,
        attrs
      });
    });
    return { selector, count: results.length, matches: results };
  } catch (e) {
    return { error: "cheerio query failed: " + e.message };
  }
}

/**
 * Compute CSS specificity for a selector using the `specificity` package.
 */
function cssSpecificity(selector) {
  const spec = tryRequire("specificity");
  if (!spec) return missing("specificity", "css_specificity");
  try {
    const fn = spec.calculate || (spec.default && spec.default.calculate);
    if (!fn) return { error: "specificity.calculate not found" };
    const result = fn(selector);
    return { selector, specificity: result };
  } catch (e) {
    return { error: "specificity failed: " + e.message };
  }
}

/**
 * HTML5 validation via the W3C Nu validator API (direct HTTPS call).
 * Replaces the deprecated html-validator package which pulled in the
 * deprecated `request` library.
 */
async function validateHtml(htmlOrUrl) {
  const https = require("https");

  try {
    let apiUrl;
    let body = null;
    let headers = { "Accept": "application/json" };

    if (typeof htmlOrUrl === "string" && /^https?:\/\//.test(htmlOrUrl)) {
      apiUrl = "https://validator.w3.org/nu/?doc=" + encodeURIComponent(htmlOrUrl) + "&out=json";
    } else {
      apiUrl = "https://validator.w3.org/nu/?out=json";
      body = typeof htmlOrUrl === "string" ? htmlOrUrl : String(htmlOrUrl);
      headers["Content-Type"] = "text/html; charset=utf-8";
    }

    const result = await new Promise((resolve, reject) => {
      const parsed = new URL(apiUrl);
      const opts = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: body ? "POST" : "GET",
        headers,
        timeout: 30000
      };
      const req = https.request(opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch (e) { reject(new Error("W3C validator returned non-JSON")); }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("W3C validator timed out")); });
      if (body) req.write(body);
      req.end();
    });

    const messages = (result && result.messages) || [];
    return {
      errorCount: messages.filter((m) => m.type === "error").length,
      warningCount: messages.filter((m) => m.type === "info" || m.type === "warning").length,
      messages: messages.slice(0, 100).map((m) => ({
        type: m.type,
        subType: m.subType,
        message: m.message,
        line: m.lastLine,
        col: m.lastColumn
      }))
    };
  } catch (e) {
    return { error: "W3C HTML validation failed: " + e.message };
  }
}

module.exports = {
  parseHtml,
  domQuery,
  cssSpecificity,
  validateHtml
};
