const { tryRequire, missing } = require("./index");

// ── Error stack parsing + source-map unminify ─────────────────────────────

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

module.exports = {
  parseStackTrace,
  unminifyFrame,
  unminifyCoverage
};
