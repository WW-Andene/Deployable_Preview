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
 * HTML5 validation via the W3C Nu validator (html-validator package).
 */
async function validateHtml(htmlOrUrl) {
  const validator = tryRequire("html-validator");
  if (!validator) return missing("html-validator", "validate_html");
  try {
    const fn = validator.default || validator;
    const options = { format: "json" };
    if (typeof htmlOrUrl === "string" && /^https?:\/\//.test(htmlOrUrl)) {
      options.url = htmlOrUrl;
    } else {
      options.data = htmlOrUrl;
    }
    const result = await fn(options);
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
    return { error: "html-validator failed: " + e.message };
  }
}

module.exports = {
  parseHtml,
  domQuery,
  cssSpecificity,
  validateHtml
};
