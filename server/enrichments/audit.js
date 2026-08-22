/**
 * enrichments/audit.js — accessibility / OCR / perf / security / network audits.
 *
 * Wraps the heavy "audit" libs:
 *   runAxe, runOCR, shutdownTesseract, runLighthouse, validateHtml,
 *   vulnScan, cspCheck, parseSetCookie, parseCookieJar, parseRobots.
 *
 * Extracted from mcp-enrichments.js (R6.8).
 */

"use strict";

const { tryRequire, missing } = require("./lib");

async function runAxe(page, opts) {
  const axeCore = tryRequire("axe-core");
  if (!axeCore) return missing("axe-core", "accessibility");

  // axe-core exports { source } — the full script string to inject.
  const source = axeCore.source;
  if (!source) return { error: "axe-core package does not expose .source" };

  try {
    // Inject via addScriptTag (Playwright) or evaluate (both)
    if (typeof page.addScriptTag === "function") {
      await page.addScriptTag({ content: source });
    } else {
      await page.evaluate(source);
    }

    const runOptions = {};
    if (opts && Array.isArray(opts.tags)) runOptions.runOnly = { type: "tag", values: opts.tags };
    if (opts && opts.rules) runOptions.rules = opts.rules;

    const results = await page.evaluate(async (runOpts) => {
      if (!window.axe) return { error: "axe not loaded" };
      return await window.axe.run(document, runOpts);
    }, runOptions);

    if (results && results.error) return results;

    // Compact the violations so the response stays readable
    const compact = (list) => (list || []).map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: (v.nodes || []).slice(0, 10).map((n) => ({
        target: n.target,
        html: n.html ? n.html.slice(0, 500) : "",
        failureSummary: n.failureSummary
      })),
      totalNodes: (v.nodes || []).length
    }));

    return {
      url: results.url,
      testEngine: results.testEngine,
      timestamp: results.timestamp,
      violationCount: (results.violations || []).length,
      passCount: (results.passes || []).length,
      incompleteCount: (results.incomplete || []).length,
      inapplicableCount: (results.inapplicable || []).length,
      violations: compact(results.violations),
      incomplete: compact(results.incomplete)
    };
  } catch (e) {
    return { error: "axe-core run failed: " + e.message };
  }
}

async function getTesseractWorker(lang) {
  const tesseract = tryRequire("tesseract.js");
  if (!tesseract) return null;
  const targetLang = lang || "eng";
  if (_tesseractWorker && _tesseractWorker._lang === targetLang) return _tesseractWorker;
  if (_tesseractWorker) {
    try { await _tesseractWorker.terminate(); } catch (_) {}
    _tesseractWorker = null;
  }
  const createWorker = tesseract.createWorker || (tesseract.default && tesseract.default.createWorker);
  if (!createWorker) return null;
  const worker = await createWorker(targetLang);
  worker._lang = targetLang;
  _tesseractWorker = worker;
  return worker;
}

/**
 * Run OCR on a PNG buffer and return recognized text.
 */
async function runOCR(pngBuf, opts) {
  if (!tryRequire("tesseract.js")) return missing("tesseract.js", "ocr");
  try {
    const worker = await getTesseractWorker(opts && opts.lang);
    if (!worker) return { error: "tesseract.js could not start a worker" };
    const result = await worker.recognize(pngBuf);
    const data = result.data || {};
    const words = (data.words || []).map((w) => ({
      text: w.text,
      confidence: Math.round(w.confidence || 0),
      bbox: w.bbox
    }));
    return {
      text: data.text || "",
      confidence: Math.round(data.confidence || 0),
      wordCount: words.length,
      words: words.slice(0, 500),
      wordsTruncated: words.length > 500,
      engine: "tesseract.js",
      lang: (opts && opts.lang) || "eng"
    };
  } catch (e) {
    return { error: "tesseract OCR failed: " + e.message };
  }
}

async function shutdownTesseract() {
  if (_tesseractWorker) {
    try { await _tesseractWorker.terminate(); } catch (_) {}
    _tesseractWorker = null;
  }
}

async function runLighthouse(url, opts) {
  const lighthouse = tryRequire("lighthouse");
  if (!lighthouse) return missing("lighthouse", "lighthouse");

  const chromeLauncher = tryRequire("chrome-launcher");
  // Lighthouse v12 is ESM — require() may return a module namespace object
  const lh = typeof lighthouse === "function" ? lighthouse : lighthouse.default;
  if (!lh) return { error: "lighthouse import shape unexpected" };

  let chrome = null;
  let port = opts && opts.port;
  try {
    if (!port) {
      if (!chromeLauncher) return missing("chrome-launcher", "lighthouse");
      const launch = chromeLauncher.launch || (chromeLauncher.default && chromeLauncher.default.launch);
      const launchOpts = {
        chromeFlags: [
          "--headless",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-gl=swiftshader",
          "--enable-webgl"
        ]
      };
      if (process.env.CHROME_PATH) launchOpts.chromePath = process.env.CHROME_PATH;
      chrome = await launch(launchOpts);
      port = chrome.port;
    }

    const categories = (opts && opts.categories) || ["performance", "accessibility", "best-practices", "seo"];
    const lhOptions = {
      logLevel: "error",
      output: "json",
      onlyCategories: categories,
      port
    };

    const runnerResult = await lh(url, lhOptions);
    const lhr = runnerResult.lhr;

    const scores = {};
    for (const key of Object.keys(lhr.categories || {})) {
      const cat = lhr.categories[key];
      scores[key] = {
        title: cat.title,
        score: cat.score != null ? Math.round(cat.score * 100) : null
      };
    }

    // Extract key performance metrics
    const metrics = {};
    const metricIds = [
      "first-contentful-paint",
      "largest-contentful-paint",
      "total-blocking-time",
      "cumulative-layout-shift",
      "speed-index",
      "interactive"
    ];
    for (const id of metricIds) {
      const audit = lhr.audits && lhr.audits[id];
      if (audit) {
        metrics[id] = {
          score: audit.score != null ? Math.round(audit.score * 100) : null,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue
        };
      }
    }

    // Collect notable failures
    const failures = [];
    for (const key of Object.keys(lhr.audits || {})) {
      const a = lhr.audits[key];
      if (a.score != null && a.score < 0.9 && a.title) {
        failures.push({
          id: key,
          title: a.title,
          score: Math.round((a.score || 0) * 100),
          displayValue: a.displayValue
        });
      }
    }
    failures.sort((a, b) => a.score - b.score);

    return {
      url,
      scores,
      metrics,
      failures: failures.slice(0, 30),
      fetchTime: lhr.fetchTime,
      userAgent: lhr.userAgent,
      lighthouseVersion: lhr.lighthouseVersion
    };
  } catch (e) {
    return { error: "lighthouse failed: " + e.message };
  } finally {
    if (chrome && typeof chrome.kill === "function") {
      try { await chrome.kill(); } catch (_) {}
    }
  }
}

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

module.exports = { runAxe, runOCR, shutdownTesseract, runLighthouse, validateHtml, vulnScan, cspCheck, parseSetCookie, parseCookieJar, parseRobots };
