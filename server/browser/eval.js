// browser/eval.js — devtools-console-like JS evaluation in a preview page
const fs   = require("fs");
const path = require("path");
const session = require("../dv/session");

/**
 * Evaluate JavaScript inside the preview page. Equivalent to typing into
 * the browser devtools console. Captures synchronous + async results,
 * console logs emitted during evaluation, and page errors.
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   code: string,            — the JS expression/statements to run
 *   await?: boolean,         — wrap in async IIFE (default: true if code contains "await")
 *   timeout?: number,        — pass 0 (default) to never time out; any
 *                              positive value means abort after N ms.
 *   captureLogs?: boolean,   — also collect console.* output during eval (default: true)
 *   maxResultBytes?: number, — cap stringified result; 0/unset = no cap
 *   writeFilesTo?: string,   — if set, treat the eval result as a {relpath:
 *                              base64} object and decode each value to
 *                              <writeFilesTo>/<relpath>. Returns a manifest
 *                              instead of the base64 — bypasses the MCP
 *                              channel size limit so multi-MB asset dumps
 *                              don't blow the agent's context.
 *                              Path traversal (..) is rejected.
 *   width?, height?
 * }
 * @returns { result, type, logs, errors, url, duration, truncated, files? } | { error }
 */
async function pageEval(opts) {
  const { owner, repo, slug, code } = opts;
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (typeof code !== "string" || !code.trim()) return { error: "`code` must be a non-empty string" };

  // 0 / unset = no timeout. Caller can still pass a positive value to cap it.
  const rawTimeout = Number(opts.timeout);
  const timeout = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 0;
  const captureLogs = opts.captureLogs !== false;
  // Auto-detect: if the code has a top-level await or is an expression-returning-Promise,
  // wrap in async IIFE so the result serializes.
  const wantsAsync = opts.await === true || /\bawait\b/.test(code);

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const logs = [];
  const errors = [];

  // Attach temporary listeners so we can peel them off after eval.
  let consoleListener = null, pageErrorListener = null;
  if (captureLogs) {
    consoleListener = (msg) => {
      try {
        const type = msg.type ? msg.type() : "log";
        const text = msg.text ? msg.text() : String(msg);
        if (logs.length < 500) logs.push({ type, text: text.slice(0, 4000) });
      } catch (_) {}
    };
    pageErrorListener = (err) => {
      try { errors.push({ message: err.message || String(err), stack: (err.stack || "").split("\n").slice(0, 6).join("\n") }); } catch (_) {}
    };
    page.on("console", consoleListener);
    page.on("pageerror", pageErrorListener);
  }

  const wrapped = wantsAsync
    ? "(async () => { " + code + " })()"
    // Try to evaluate as expression; if that's a syntax error the caller can retry as a block.
    : code;

  const started = Date.now();
  let rawResult = null, err = null;
  try {
    const evalPromise = page.evaluate((src) => {
      // Inside the page: use Function so we can return a value from an expression string.
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("return (" + src + ");");
        return Promise.resolve(fn());
      } catch (e1) {
        // Fall back: run as statements (no return — caller must set a var)
        try {
          // eslint-disable-next-line no-new-func
          const fn2 = new Function(src);
          return Promise.resolve(fn2());
        } catch (e2) {
          throw e1; // original error is more informative
        }
      }
    }, wrapped);

    if (timeout > 0) {
      const timer = new Promise((_, reject) => setTimeout(() => reject(new Error("pageEval timed out after " + timeout + "ms")), timeout));
      rawResult = await Promise.race([evalPromise, timer]);
    } else {
      // No timeout — wait forever (or until the page closes / process exits).
      rawResult = await evalPromise;
    }
  } catch (e) {
    err = e;
  } finally {
    if (consoleListener) { try { page.off("console", consoleListener); } catch (_) {} }
    if (pageErrorListener) { try { page.off("pageerror", pageErrorListener); } catch (_) {} }
  }

  const duration = Date.now() - started;
  if (err) {
    return {
      error: err.message || String(err),
      url, duration,
      logs: captureLogs ? logs : undefined,
      errors: captureLogs ? errors : undefined
    };
  }

  // ── Server-side file dump (writeFilesTo) ──
  // When writeFilesTo is set, the caller wants page_eval to act as a
  // bulk asset extractor: the eval result must be { "rel/path": base64,
  // ... } and we decode + write each entry to disk. This sidesteps the
  // 25k-token cap on MCP responses for callers that are dumping multi-MB
  // binaries (e.g. webp portraits).
  if (opts.writeFilesTo && rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
    const targetDir = path.resolve(String(opts.writeFilesTo));
    let written = [], skipped = [];
    try { fs.mkdirSync(targetDir, { recursive: true }); }
    catch (e) {
      return { error: "writeFilesTo: cannot mkdir " + targetDir + ": " + e.message, url, duration };
    }
    for (const [rel, b64] of Object.entries(rawResult)) {
      // Reject anything that escapes targetDir (no .. or absolute paths).
      const out = path.resolve(targetDir, rel);
      if (!out.startsWith(targetDir + path.sep) && out !== targetDir) {
        skipped.push({ path: rel, reason: "path traversal rejected" });
        continue;
      }
      if (typeof b64 !== "string") {
        skipped.push({ path: rel, reason: "value not a string (got " + typeof b64 + ")" });
        continue;
      }
      // Caller convention: anything starting with "ERR_" is a sentinel error
      // string from the in-page code, not actual data.
      if (b64.startsWith("ERR_")) {
        skipped.push({ path: rel, reason: b64 });
        continue;
      }
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const buf = Buffer.from(b64, "base64");
        fs.writeFileSync(out, buf);
        written.push({ path: rel, fullPath: out, bytes: buf.length });
      } catch (e) {
        skipped.push({ path: rel, reason: e.message });
      }
    }
    return {
      url,
      type: "files",
      duration,
      truncated: false,
      files: { dir: targetDir, written, skipped, totalBytes: written.reduce((s, f) => s + f.bytes, 0) },
      logs: captureLogs ? logs : undefined,
      errors: captureLogs ? errors : undefined
    };
  }

  // Serialize result safely. Playwright already does this, but it can throw
  // on circular refs. Our inner Function returns a resolved value → already
  // structured-clone-friendly. Cap stringified size.
  let resultText;
  let resultType = typeof rawResult;
  let truncated = false;
  try {
    if (rawResult === undefined) { resultText = "undefined"; resultType = "undefined"; }
    else if (rawResult === null) { resultText = "null"; resultType = "null"; }
    else if (resultType === "string") { resultText = rawResult; }
    else if (resultType === "number" || resultType === "boolean") { resultText = String(rawResult); }
    else {
      resultText = JSON.stringify(rawResult, null, 2);
      resultType = Array.isArray(rawResult) ? "array" : "object";
    }
  } catch (e) {
    resultText = "[unserializable: " + (e.message || e) + "]";
    resultType = "unserializable";
  }
  // No truncation by default. Caller can pass maxResultBytes to opt in
  // to a cap (useful when probing huge DOM trees). Truncation breaks any
  // downstream JSON.parse on the result, so we no longer impose one
  // unilaterally — bandwidth/limits are the caller's problem now.
  const MAX = Number(opts.maxResultBytes) > 0 ? Number(opts.maxResultBytes) : 0;
  if (MAX > 0 && resultText && resultText.length > MAX) {
    resultText = resultText.slice(0, MAX) + "\n[… truncated]";
    truncated = true;
  }

  return {
    url,
    type: resultType,
    result: resultText,
    logs: captureLogs ? logs : undefined,
    errors: captureLogs ? errors : undefined,
    duration,
    truncated
  };
}

module.exports = { pageEval };
