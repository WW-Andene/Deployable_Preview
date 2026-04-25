/**
 * enrichments/parsing.js — text / DOM / CSS / stack-trace / link / gzip parsing.
 *
 * Wraps the lighter "parsing" libs:
 *   parseCssValue, diffCssValues, parseHtml (internal), domQuery,
 *   cssSpecificity, textDiff, textAnalysis, scanBrokenLinks,
 *   parseStackTrace, unminifyFrame, unminifyCoverage, gzipSize.
 *
 * Extracted from mcp-enrichments.js (R6.8).
 */

"use strict";

const { tryRequire, missing } = require("./lib");

function parseCssValue(value) {
  const cssTree = tryRequire("css-tree");
  if (!cssTree) return missing("css-tree", "computed_styles");
  try {
    const ast = cssTree.parse(value, { context: "value" });
    // Walk and collect an easier-to-diff list of tokens
    const tokens = [];
    cssTree.walk(ast, (node) => {
      if (node.type === "Dimension") {
        tokens.push({ type: "dimension", value: node.value, unit: node.unit });
      } else if (node.type === "Number") {
        tokens.push({ type: "number", value: node.value });
      } else if (node.type === "Percentage") {
        tokens.push({ type: "percent", value: node.value });
      } else if (node.type === "HexColor") {
        tokens.push({ type: "hex", value: "#" + node.value });
      } else if (node.type === "Identifier") {
        tokens.push({ type: "ident", value: node.name });
      } else if (node.type === "Function") {
        tokens.push({ type: "fn", name: node.name });
      } else if (node.type === "String") {
        tokens.push({ type: "string", value: node.value });
      }
    });
    return {
      normalized: cssTree.generate(ast),
      tokens
    };
  } catch (e) {
    return { error: "css-tree parse failed: " + e.message };
  }
}

/**
 * Diff two parsed CSS values structurally. Returns match/mismatch per token.
 */
function diffCssValues(a, b) {
  const pa = parseCssValue(a);
  const pb = parseCssValue(b);
  if (pa.error) return pa;
  if (pb.error) return pb;
  const same = pa.normalized === pb.normalized;
  return {
    same,
    a: pa,
    b: pb
  };
}

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
 * Replaces the deprecated html-validator package.
 */

function textDiff(a, b, mode) {
  const diff = tryRequire("diff");
  if (!diff) return missing("diff", "text_diff");
  try {
    const m = mode || "lines";
    const fn =
      m === "chars"    ? diff.diffChars
    : m === "words"    ? diff.diffWords
    : m === "sentences"? diff.diffSentences
    :                    diff.diffLines;
    const parts = fn(a || "", b || "");
    const added = parts.filter((p) => p.added).map((p) => p.value).join("");
    const removed = parts.filter((p) => p.removed).map((p) => p.value).join("");
    return {
      mode: m,
      parts: parts.map((p) => ({
        added: !!p.added,
        removed: !!p.removed,
        value: p.value.length > 500 ? p.value.slice(0, 500) + "…" : p.value
      })),
      addedLength: added.length,
      removedLength: removed.length,
      identical: !parts.some((p) => p.added || p.removed)
    };
  } catch (e) {
    return { error: "diff failed: " + e.message };
  }
}

function textAnalysis(text) {
  const natural = tryRequire("natural");
  if (!natural) return missing("natural", "text_analysis");
  try {
    const input = String(text || "");
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(input);
    const sentTokenizer = new natural.SentenceTokenizer();
    const sentences = sentTokenizer.tokenize(input);
    let sentiment = null;
    try {
      const Analyzer = natural.SentimentAnalyzer;
      const stemmer = natural.PorterStemmer;
      const analyzer = new Analyzer("English", stemmer, "afinn");
      sentiment = analyzer.getSentiment(tokens);
    } catch (_) {}
    return {
      length: input.length,
      tokenCount: tokens.length,
      sentenceCount: sentences.length,
      uniqueWords: new Set(tokens.map((t) => t.toLowerCase())).size,
      sentiment,
      sampleTokens: tokens.slice(0, 40)
    };
  } catch (e) {
    return { error: "natural failed: " + e.message };
  }
}

async function scanBrokenLinks(url, opts) {
  const linkinator = tryRequire("linkinator");
  if (!linkinator) return missing("linkinator", "broken_links");
  try {
    const LinkChecker = linkinator.LinkChecker;
    const checker = new LinkChecker();
    const results = await checker.check({
      path: url,
      recurse: !!(opts && opts.recurse),
      concurrency: (opts && opts.concurrency) || 10,
      timeout: (opts && opts.timeout) || 5000,
      linksToSkip: (opts && opts.skip) || [],
      retry: false
    });
    const broken = results.links.filter((l) => l.state === "BROKEN");
    return {
      url,
      total: results.links.length,
      broken: broken.length,
      brokenLinks: broken.slice(0, 100).map((l) => ({
        url: l.url,
        status: l.status,
        parent: l.parent,
        failureDetails: (l.failureDetails || []).slice(0, 2)
      }))
    };
  } catch (e) {
    return { error: "linkinator failed: " + e.message };
  }
}

function parseStackTrace(stack) {
  const parser = tryRequire("error-stack-parser");
  if (!parser) return missing("error-stack-parser", "stack_trace");
  try {
    const fn = parser.parse || (parser.default && parser.default.parse);
    // error-stack-parser expects an Error — build a fake one
    const fakeErr = { stack };
    const frames = fn(fakeErr);
    return {
      frameCount: frames.length,
      frames: frames.map((f) => ({
        functionName: f.functionName,
        fileName: f.fileName,
        lineNumber: f.lineNumber,
        columnNumber: f.columnNumber,
        source: f.source
      }))
    };
  } catch (e) {
    return { error: "error-stack-parser failed: " + e.message };
  }
}

async function unminifyFrame(frame, sourceMapJSON) {
  const sourceMap = tryRequire("source-map");
  if (!sourceMap) return missing("source-map", "unminify");
  try {
    const SourceMapConsumer = sourceMap.SourceMapConsumer;
    const consumer = await new SourceMapConsumer(sourceMapJSON);
    try {
      const pos = consumer.originalPositionFor({
        line: frame.lineNumber,
        column: frame.columnNumber
      });
      return pos;
    } finally {
      if (typeof consumer.destroy === "function") consumer.destroy();
    }
  } catch (e) {
    return { error: "source-map failed: " + e.message };
  }
}

async function unminifyCoverage(jsText, coverage, sourceMapJSON) {
  const v8ToIstanbul = tryRequire("v8-to-istanbul");
  if (!v8ToIstanbul) return missing("v8-to-istanbul", "code_coverage");
  try {
    const fn = v8ToIstanbul.default || v8ToIstanbul;
    const converter = fn("", 0, {
      source: jsText,
      sourceMap: sourceMapJSON ? { sourcemap: sourceMapJSON } : undefined
    });
    await converter.load();
    converter.applyCoverage(coverage);
    return converter.toIstanbul();
  } catch (e) {
    return { error: "v8-to-istanbul failed: " + e.message };
  }
}

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

module.exports = { parseCssValue, diffCssValues, domQuery, cssSpecificity, textDiff, textAnalysis, scanBrokenLinks, parseStackTrace, unminifyFrame, unminifyCoverage, gzipSize };
