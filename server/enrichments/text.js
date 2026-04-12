const { tryRequire, missing } = require("./index");

// ── Text diff / analysis ──────────────────────────────────────────────────

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
        value: p.value.length > 500 ? p.value.slice(0, 500) + "\u2026" : p.value
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

// ── Broken-link scanner (linkinator) ──────────────────────────────────────

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

module.exports = {
  textDiff,
  textAnalysis,
  scanBrokenLinks
};
