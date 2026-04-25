/**
 * dv/tools/codec.js — encoding / format / classification toolbox.
 *
 * Tools:
 *   decode         — base64, base64url, hex, URL-encoding, JWT, HTML entities, Unicode escapes
 *   convert_format — JSON ↔ YAML ↔ CSV ↔ XML
 *   lang_detect    — guess programming language from a snippet
 *   file_sniff     — detect binary format from magic bytes (from base64 or buffer)
 *   structure_analyze — JSON schema inference, array/object outline, size stats
 */

"use strict";

const dv = require("../core");
const { decode, KNOWN: DECODE_MODES } = require("../../codec/decode");
const { convert, FORMATS } = require("../../codec/convert");
const { detectLanguage, sniffFile, inferJsonSchema } = require("../../codec/classify");

// ── decode ────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "decode",
  category: "codec",
  description:
    "Decode encoded text. Supports base64, base64url, hex, URL-encoding, JWT, HTML entities, Unicode/hex escapes. " +
    "`mode: \"auto\"` (default) attempts to detect the encoding. Returns both the detected mode and the decoded value.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      input: { type: "string", description: "Encoded text to decode" },
      mode:  { type: "string", enum: DECODE_MODES, description: "Encoding mode (default: auto)" }
    },
    required: ["input"]
  },
  async handler(args) {
    try {
      return dv.ok(decode(args.input, args.mode || "auto"));
    } catch (e) {
      return dv.failCode("DECODE_FAILED", e.message, {
        hint: "Check that the input matches the declared mode, or try mode:'auto'."
      });
    }
  }
});

// ── convert_format ────────────────────────────────────────────────────────

dv.defineTool({
  name: "convert_format",
  category: "codec",
  description:
    "Convert between JSON, YAML, CSV, and XML. Routes all conversions through a JSON " +
    "intermediate. Pure-Node fallbacks are built in; if optional libs `yaml` / `fast-xml-parser` " +
    "are installed they'll be used for higher fidelity parsing. For CSV, the input is parsed as " +
    "a list of objects (first row = headers).",
  requires: [],
  schema: {
    type: "object",
    properties: {
      input:    { type: "string", description: "Source document" },
      from:     { type: "string", enum: FORMATS, description: "Source format" },
      to:       { type: "string", enum: FORMATS, description: "Target format" },
      rootName: { type: "string", description: "XML only: root element name when emitting" }
    },
    required: ["input", "from", "to"]
  },
  async handler(args) {
    try {
      const r = convert(args.input, args.from, args.to, { rootName: args.rootName });
      return dv.ok(r);
    } catch (e) {
      return dv.failCode("CONVERT_FAILED", e.message, {
        from: args.from, to: args.to,
        hint: "Verify the input is valid " + args.from + ". For YAML parsing, install the optional `yaml` package for full spec support."
      });
    }
  }
});

// ── lang_detect ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "lang_detect",
  category: "codec",
  description:
    "Heuristic programming-language detector. Returns the best guess plus confidence " +
    "(high / medium / low) and the top-5 ranked candidates. Covers 25+ languages including " +
    "TypeScript, Python, Rust, Go, Java, Kotlin, Ruby, PHP, SQL, HTML, CSS, Markdown, Dockerfile.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source snippet" }
    },
    required: ["code"]
  },
  async handler(args) { return dv.ok(detectLanguage(args.code)); }
});

// ── file_sniff ────────────────────────────────────────────────────────────

dv.defineTool({
  name: "file_sniff",
  category: "codec",
  description:
    "Detect a file's format from its first bytes. Takes a base64-encoded buffer and returns " +
    "`{type, mime, byteLength}`. Recognizes images (png, jpeg, gif, webp, avif, heic, svg, …), " +
    "archives (zip, gzip, 7z, tar, xz, zstd, bz2), video/audio (mp4, webm, mkv, mp3, wav, flac, ogg), " +
    "fonts, executables (elf, mach-o, wasm), sqlite, PDF. Falls back to `text/plain` for ASCII-heavy input.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      base64: { type: "string", description: "Base64-encoded bytes to inspect (first ~1 KB is enough)" }
    },
    required: ["base64"]
  },
  async handler(args) {
    try {
      const buf = Buffer.from(String(args.base64).replace(/\s+/g, ""), "base64");
      if (!buf.length) return dv.failCode("BAD_ARGS", "Empty buffer after base64 decode");
      return dv.ok(sniffFile(buf));
    } catch (e) {
      return dv.failCode("SNIFF_FAILED", e.message);
    }
  }
});

// ── structure_analyze ─────────────────────────────────────────────────────

dv.defineTool({
  name: "structure_analyze",
  category: "codec",
  description:
    "Analyze the structure of a JSON document: infer a JSON-Schema-style outline, flag " +
    "recognised string formats (date-time, uri, uuid, email), count leaves vs branches, " +
    "and report nesting depth. Use before writing code that consumes an unfamiliar JSON blob.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      input: { type: "string", description: "JSON string to analyze" }
    },
    required: ["input"]
  },
  async handler(args) {
    let parsed;
    try { parsed = JSON.parse(args.input); }
    catch (e) { return dv.failCode("BAD_JSON", "Could not parse JSON: " + e.message); }
    const stats = { leaves: 0, objects: 0, arrays: 0, maxDepth: 0 };
    walk(parsed, 0, stats);
    return dv.ok({
      schema: inferJsonSchema(parsed),
      stats,
      rootType: Array.isArray(parsed) ? "array" : (parsed === null ? "null" : typeof parsed)
    });
  }
});

function walk(v, depth, stats) {
  if (depth > stats.maxDepth) stats.maxDepth = depth;
  if (Array.isArray(v)) { stats.arrays++; for (const x of v) walk(x, depth + 1, stats); return; }
  if (v !== null && typeof v === "object") { stats.objects++; for (const k of Object.keys(v)) walk(v[k], depth + 1, stats); return; }
  stats.leaves++;
}
