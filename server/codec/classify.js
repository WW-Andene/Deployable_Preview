/**
 * codec/classify.js — heuristic content classifiers.
 *
 *   detectLanguage(code)  — guesses the programming language from a snippet
 *   sniffFile(buffer)     — detects a binary format from magic bytes
 *   inferJsonSchema(obj)  — produces a JSON-Schema-shaped outline
 */

"use strict";

// ── Language detection ─────────────────────────────────────────────────────

const LANG_SIGNALS = [
  { lang: "typescript",      score: function(s){ return mscore(s,[[/\binterface\s+[A-Z]\w*/,3],[/:\s*[A-Z]\w*\s*[=;]/,1],[/\bas\s+[A-Z]\w*\b/,1],[/import\s+type\s+/,3],[/\b(readonly|public|private)\b/,1],[/\.ts$/,6]]); } },
  { lang: "javascript",      score: function(s){ return mscore(s,[[/\b(const|let|function)\s+\w/,1],[/=>\s*[{(]/,1],[/console\.log/,2],[/require\(['"]/,1],[/module\.exports/,2],[/\bthis\.\w/,0.5]]); } },
  { lang: "jsx/tsx",         score: function(s){ return mscore(s,[[/<[A-Z]\w*[\s/>]/,3],[/className=/,2],[/useState|useEffect/,3],[/<\/?[a-z]+\s+[^=]*?=\{/,2]]); } },
  { lang: "python",          score: function(s){ return mscore(s,[[/^\s*def\s+\w+\s*\(/m,3],[/^\s*import\s+\w/m,2],[/^\s*from\s+\w+\s+import/m,3],[/\b(self|None|True|False)\b/,1],[/:\s*$/m,0.3]]); } },
  { lang: "rust",            score: function(s){ return mscore(s,[[/\bfn\s+\w+\s*\(/,3],[/\blet\s+mut\b/,3],[/\bimpl\s+/,3],[/\b(struct|enum)\s+[A-Z]/,2],[/::<\w/,2],[/\bmatch\s+\w+\s*\{/,2]]); } },
  { lang: "go",              score: function(s){ return mscore(s,[[/\bpackage\s+\w+/,3],[/\bfunc\s+\(?\w/,2],[/:=\s/,2],[/\bimport\s+\(/,3],[/\bgoroutine\b/,2],[/\bchan\b/,2]]); } },
  { lang: "java",            score: function(s){ return mscore(s,[[/\bpublic\s+(class|interface|enum)\b/,3],[/System\.out\.println/,3],[/\bpackage\s+[a-z]+\./,2],[/\b(Integer|String|ArrayList|HashMap)\b/,1]]); } },
  { lang: "kotlin",          score: function(s){ return mscore(s,[[/\bfun\s+\w+\s*\(/,2],[/\bval\s+\w+\s*[:=]/,2],[/\bvar\s+\w+\s*[:=]/,1],[/\bobject\s+\w/,2],[/\bdata\s+class\b/,3]]); } },
  { lang: "c",               score: function(s){ return mscore(s,[[/\#include\s*<\w+\.h>/,3],[/\bint\s+main\s*\(/,3],[/\bprintf\s*\(/,2],[/->\w/,1]]); } },
  { lang: "cpp",             score: function(s){ return mscore(s,[[/std::/,3],[/\#include\s*<iostream>/,3],[/template\s*</,2],[/::\s*\w+\(/,1]]); } },
  { lang: "csharp",          score: function(s){ return mscore(s,[[/\bnamespace\s+\w/,3],[/\busing\s+System\b/,3],[/\bvar\s+\w+\s*=\s*new\s/,2],[/Console\.WriteLine/,3]]); } },
  { lang: "ruby",            score: function(s){ return mscore(s,[[/\bdef\s+\w+/,2],[/^\s*end\s*$/m,2],[/@\w+/,1],[/\brequire\s+['"]/,2],[/\bputs\s+/,2]]); } },
  { lang: "php",             score: function(s){ return mscore(s,[[/<\?php/,5],[/\$[a-z_]\w*/i,1],[/->\w+\(/,1],[/\becho\s+/,2]]); } },
  { lang: "shell",           score: function(s){ return mscore(s,[[/^#!\/bin\/(bash|sh|zsh)/m,5],[/\$\{?\w+\}?/,0.5],[/\becho\s+/,1],[/^\s*if\s+\[/m,2],[/\bfi\b/,2]]); } },
  { lang: "sql",             score: function(s){ return mscore(s,[[/\bSELECT\s+.+\sFROM\b/i,4],[/\bINSERT\s+INTO\b/i,3],[/\bCREATE\s+(TABLE|INDEX)\b/i,3],[/\bWHERE\b/i,1],[/\bJOIN\b/i,2]]); } },
  { lang: "html",            score: function(s){ return mscore(s,[[/<!DOCTYPE\s+html/i,5],[/<html[\s>]/i,4],[/<head>|<body>/i,2],[/<\/?\w+[^>]*>/,0.2]]); } },
  { lang: "css",             score: function(s){ return mscore(s,[[/\{\s*[\w-]+\s*:\s*[^;]+;/,1.5],[/@media\b/,2],[/^\s*\.\w[\w-]*\s*\{/m,2],[/^\s*#[\w-]+\s*\{/m,2]]); } },
  { lang: "scss",            score: function(s){ return mscore(s,[[/\$[\w-]+\s*:/,3],[/@mixin\b/,3],[/@include\b/,3],[/&:\w/,2]]); } },
  { lang: "json",            score: function(s){ return /^\s*[{\[]/.test(s) && /[}\]]\s*$/.test(s) ? tryParseScore(s, JSON.parse, 6) : 0; } },
  { lang: "yaml",            score: function(s){ return mscore(s,[[/^---\s*$/m,3],[/^\s*\w[\w-]*:\s+\S/m,2],[/^\s*-\s+\S/m,1]]); } },
  { lang: "toml",            score: function(s){ return mscore(s,[[/^\s*\[[\w.]+\]\s*$/m,3],[/^\s*\w+\s*=\s*".*"\s*$/m,2],[/^\s*\w+\s*=\s*\d+\s*$/m,1]]); } },
  { lang: "xml",             score: function(s){ return mscore(s,[[/<\?xml\b/,5],[/<\/?[A-Za-z]\w*[\s/>]/,0.3]]); } },
  { lang: "markdown",        score: function(s){ return mscore(s,[[/^#+\s+\w/m,3],[/^[-*]\s+\w/m,1],[/\[[^\]]+\]\([^)]+\)/,2],[/^```/m,3]]); } },
  { lang: "dockerfile",      score: function(s){ return mscore(s,[[/^FROM\s+\S/m,5],[/^RUN\s+/m,3],[/^CMD\s+\[/m,3],[/^EXPOSE\s+\d+/m,3]]); } }
];

function mscore(s, pairs) {
  let total = 0;
  for (const [re, w] of pairs) {
    const m = s.match(new RegExp(re.source, re.flags + (re.flags.includes("g") ? "" : "g")));
    if (m) total += w * Math.min(m.length, 10);
  }
  return total;
}
function tryParseScore(s, fn, boost) { try { fn(s); return boost; } catch (_) { return 0; } }

function detectLanguage(code) {
  const s = String(code || "");
  if (!s.trim()) return { language: "empty", confidence: 0, candidates: [] };
  const ranked = LANG_SIGNALS
    .map(function(sig){ return { lang: sig.lang, score: sig.score(s) }; })
    .filter(function(x){ return x.score > 0; })
    .sort(function(a,b){ return b.score - a.score; });
  if (!ranked.length) return { language: "unknown", confidence: 0, candidates: [] };
  const top = ranked[0];
  const second = ranked[1] || { score: 0 };
  const margin = top.score - second.score;
  const confidence = margin >= 3 ? "high" : margin >= 1 ? "medium" : "low";
  return {
    language: top.lang,
    confidence,
    score: round1(top.score),
    candidates: ranked.slice(0, 5).map(function(r){ return { lang: r.lang, score: round1(r.score) }; })
  };
}
function round1(n) { return Math.round(n * 10) / 10; }

// ── Magic-byte file sniffing ───────────────────────────────────────────────

const MAGIC = [
  { type: "png",        mime: "image/png",        sig: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] },
  { type: "jpeg",       mime: "image/jpeg",       sig: [0xff,0xd8,0xff] },
  { type: "gif",        mime: "image/gif",        sig: [0x47,0x49,0x46,0x38] },
  { type: "webp",       mime: "image/webp",       test: function(b){ return b.length>=12 && b.slice(0,4).toString("ascii")==="RIFF" && b.slice(8,12).toString("ascii")==="WEBP"; } },
  { type: "bmp",        mime: "image/bmp",        sig: [0x42,0x4d] },
  { type: "tiff",       mime: "image/tiff",       sig: [0x49,0x49,0x2a,0x00] },
  { type: "tiff-be",    mime: "image/tiff",       sig: [0x4d,0x4d,0x00,0x2a] },
  { type: "avif",       mime: "image/avif",       test: function(b){ return b.length>=12 && b.slice(4,8).toString("ascii")==="ftyp" && /avif|avis/.test(b.slice(8,12).toString("ascii")); } },
  { type: "heic",       mime: "image/heic",       test: function(b){ return b.length>=12 && b.slice(4,8).toString("ascii")==="ftyp" && /heic|heix|mif1/.test(b.slice(8,12).toString("ascii")); } },
  { type: "ico",        mime: "image/x-icon",     sig: [0x00,0x00,0x01,0x00] },
  { type: "svg",        mime: "image/svg+xml",    test: function(b){ const s = b.slice(0, Math.min(b.length, 256)).toString("utf8"); return /<svg[\s>]/i.test(s); } },

  { type: "pdf",        mime: "application/pdf",  sig: [0x25,0x50,0x44,0x46] },
  { type: "zip",        mime: "application/zip",  sig: [0x50,0x4b,0x03,0x04] },
  { type: "gzip",       mime: "application/gzip", sig: [0x1f,0x8b] },
  { type: "7z",         mime: "application/x-7z-compressed", sig: [0x37,0x7a,0xbc,0xaf,0x27,0x1c] },
  { type: "tar",        mime: "application/x-tar", test: function(b){ return b.length >= 265 && b.slice(257,262).toString("ascii") === "ustar"; } },
  { type: "xz",         mime: "application/x-xz", sig: [0xfd,0x37,0x7a,0x58,0x5a,0x00] },
  { type: "bz2",        mime: "application/x-bzip2", sig: [0x42,0x5a,0x68] },
  { type: "zstd",       mime: "application/zstd", sig: [0x28,0xb5,0x2f,0xfd] },

  { type: "mp4",        mime: "video/mp4",        test: function(b){ return b.length>=12 && b.slice(4,8).toString("ascii")==="ftyp"; } },
  { type: "webm",       mime: "video/webm",       sig: [0x1a,0x45,0xdf,0xa3] },
  { type: "mkv",        mime: "video/x-matroska", sig: [0x1a,0x45,0xdf,0xa3] },
  { type: "flv",        mime: "video/x-flv",      sig: [0x46,0x4c,0x56,0x01] },
  { type: "ogg",        mime: "audio/ogg",        sig: [0x4f,0x67,0x67,0x53] },
  { type: "mp3",        mime: "audio/mpeg",       test: function(b){ return (b[0]===0xff && (b[1]&0xe0)===0xe0) || (b.slice(0,3).toString("ascii")==="ID3"); } },
  { type: "wav",        mime: "audio/wav",        test: function(b){ return b.length>=12 && b.slice(0,4).toString("ascii")==="RIFF" && b.slice(8,12).toString("ascii")==="WAVE"; } },
  { type: "flac",       mime: "audio/flac",       sig: [0x66,0x4c,0x61,0x43] },

  { type: "woff",       mime: "font/woff",        sig: [0x77,0x4f,0x46,0x46] },
  { type: "woff2",      mime: "font/woff2",       sig: [0x77,0x4f,0x46,0x32] },
  { type: "ttf",        mime: "font/ttf",         sig: [0x00,0x01,0x00,0x00] },
  { type: "otf",        mime: "font/otf",         sig: [0x4f,0x54,0x54,0x4f] },

  { type: "elf",        mime: "application/x-executable", sig: [0x7f,0x45,0x4c,0x46] },
  { type: "mach-o-64",  mime: "application/x-mach-binary", sig: [0xcf,0xfa,0xed,0xfe] },
  { type: "wasm",       mime: "application/wasm", sig: [0x00,0x61,0x73,0x6d] },
  { type: "sqlite",     mime: "application/x-sqlite3", sig: [0x53,0x51,0x4c,0x69,0x74,0x65,0x20,0x66,0x6f,0x72,0x6d,0x61,0x74,0x20,0x33,0x00] }
];

function sniffFile(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  for (const m of MAGIC) {
    if (m.test) { if (m.test(buf)) return { type: m.type, mime: m.mime, byteLength: buf.length }; }
    else if (m.sig) {
      if (buf.length >= m.sig.length && m.sig.every(function(b, i) { return buf[i] === b; })) {
        return { type: m.type, mime: m.mime, byteLength: buf.length };
      }
    }
  }
  // Is it likely text?
  const sample = buf.slice(0, Math.min(buf.length, 1024));
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++;
  }
  if (sample.length && printable / sample.length > 0.9) {
    return { type: "text", mime: "text/plain", byteLength: buf.length };
  }
  return { type: "unknown", mime: "application/octet-stream", byteLength: buf.length };
}

// ── JSON Schema inference ──────────────────────────────────────────────────

function inferJsonSchema(v, depth) {
  depth = depth || 0;
  if (depth > 12) return { type: "any", note: "max depth reached" };
  if (v === null) return { type: "null" };
  if (Array.isArray(v)) {
    if (!v.length) return { type: "array", items: { type: "any" }, minItems: 0 };
    const samples = v.slice(0, Math.min(v.length, 50)).map(function(x){ return inferJsonSchema(x, depth + 1); });
    return { type: "array", items: mergeSchemas(samples), minItems: v.length };
  }
  if (typeof v === "object") {
    const keys = Object.keys(v);
    const props = {};
    const required = [];
    for (const k of keys) {
      props[k] = inferJsonSchema(v[k], depth + 1);
      if (v[k] !== null && v[k] !== undefined) required.push(k);
    }
    return { type: "object", properties: props, required: required };
  }
  if (typeof v === "string") {
    const s = v;
    let format = null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) format = "date-time";
    else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) format = "date";
    else if (/^https?:\/\//.test(s)) format = "uri";
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) format = "email";
    else if (/^[0-9a-f-]{36}$/i.test(s)) format = "uuid";
    return { type: "string", format: format, length: s.length };
  }
  if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "number", sample: v };
  if (typeof v === "boolean") return { type: "boolean" };
  return { type: typeof v };
}

function mergeSchemas(list) {
  // For arrays of mixed items, union types; keep properties common-to-many.
  const types = Array.from(new Set(list.map(function(s){ return s.type; })));
  if (types.length === 1 && types[0] === "object") {
    const allProps = {};
    const counts = {};
    for (const s of list) {
      for (const k of Object.keys(s.properties || {})) {
        counts[k] = (counts[k] || 0) + 1;
        allProps[k] = s.properties[k];
      }
    }
    const required = Object.keys(counts).filter(function(k){ return counts[k] === list.length; });
    return { type: "object", properties: allProps, required: required };
  }
  if (types.length === 1) return list[0];
  return { type: types };
}

module.exports = { detectLanguage, sniffFile, inferJsonSchema };
