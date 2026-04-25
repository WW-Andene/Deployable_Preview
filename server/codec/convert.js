/**
 * codec/convert.js — format conversion with pure-Node fallbacks.
 *
 * Supported pairs (via a JSON intermediate):
 *   JSON → YAML, CSV, XML
 *   YAML → JSON   (optional lib: `yaml`; else limited built-in)
 *   CSV  → JSON   (RFC-4180 lite, built-in)
 *   XML  → JSON   (optional lib: `fast-xml-parser`; else limited built-in)
 *
 * Any conversion not listed above is routed through JSON (e.g. CSV → YAML
 * = CSV → JSON → YAML).
 */

"use strict";

const FORMATS = ["json", "yaml", "csv", "xml"];

function tryRequire(name) { try { return require(name); } catch (_) { return null; } }

// ── JSON -------------------------------------------------------------------

function parseJson(src) { return JSON.parse(src); }
function stringifyJson(obj) { return JSON.stringify(obj, null, 2); }

// ── YAML (emit only; parse needs `yaml` lib) --------------------------------

function stringifyYaml(value) {
  const lines = [];
  emitYaml(value, "", lines);
  return lines.join("\n") + "\n";
}

function emitYaml(v, indent, out) {
  if (v === null)                         { out.push(indent + "null"); return; }
  if (typeof v === "boolean")             { out.push(indent + (v ? "true" : "false")); return; }
  if (typeof v === "number")              { out.push(indent + (Number.isFinite(v) ? String(v) : ".nan")); return; }
  if (typeof v === "string")              { out.push(indent + yamlString(v)); return; }
  if (Array.isArray(v)) {
    if (!v.length) { out.push(indent + "[]"); return; }
    for (const item of v) {
      if (isLeaf(item)) {
        out.push(indent + "- " + yamlLeaf(item));
      } else {
        out.push(indent + "-");
        emitYaml(item, indent + "  ", out);
      }
    }
    return;
  }
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) { out.push(indent + "{}"); return; }
    for (const k of keys) {
      const val = v[k];
      if (isLeaf(val)) {
        out.push(indent + yamlKey(k) + ": " + yamlLeaf(val));
      } else {
        out.push(indent + yamlKey(k) + ":");
        emitYaml(val, indent + "  ", out);
      }
    }
    return;
  }
  out.push(indent + String(v));
}

function isLeaf(v) { return v === null || typeof v !== "object"; }
function yamlLeaf(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ".nan";
  if (typeof v === "string") return yamlString(v);
  return String(v);
}
function yamlKey(k) {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)) return k;
  return JSON.stringify(k);
}
function yamlString(s) {
  if (s === "" || /^[\s"']/.test(s) || /[:#\[\]\{\}\n\r\t]/.test(s)) return JSON.stringify(s);
  if (/^(true|false|null|yes|no|on|off|-?\d+(?:\.\d+)?)$/i.test(s)) return JSON.stringify(s);
  return s;
}

function parseYaml(src) {
  const mod = tryRequire("yaml") || tryRequire("js-yaml");
  if (mod) {
    if (typeof mod.parse === "function") return mod.parse(src);
    if (typeof mod.load === "function") return mod.load(src); // js-yaml
  }
  // Fallback: only handles simple key: value / lists of scalars / nested maps.
  return parseYamlLite(src);
}

function parseYamlLite(src) {
  const lines = String(src).replace(/\r\n/g, "\n").split("\n").filter(function(l) {
    const t = l.replace(/\s+$/, "");
    if (!t) return false;
    if (/^\s*#/.test(t)) return false;
    return true;
  });
  let idx = 0;
  function indentOf(l) { return l.match(/^(\s*)/)[1].length; }
  function parseVal(s) {
    const t = s.trim();
    if (t === "" || t === "~" || t.toLowerCase() === "null") return null;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    if (/^(true|yes|on)$/i.test(t)) return true;
    if (/^(false|no|off)$/i.test(t)) return false;
    if ((t[0] === '"' && t[t.length-1] === '"') || (t[0] === "'" && t[t.length-1] === "'")) {
      return t.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    return t;
  }
  function parseBlock(baseIndent) {
    // Peek to decide list vs map
    if (idx >= lines.length) return null;
    const first = lines[idx];
    const isList = /^\s*-\s/.test(first) || /^\s*-\s*$/.test(first);
    if (isList) return parseList(baseIndent);
    return parseMap(baseIndent);
  }
  function parseMap(baseIndent) {
    const out = {};
    while (idx < lines.length) {
      const l = lines[idx];
      const ind = indentOf(l);
      if (ind < baseIndent) break;
      if (ind > baseIndent) break; // shouldn't happen at this entry point
      const m = l.trim().match(/^([^:\s][^:]*?):\s*(.*)$/);
      if (!m) break;
      const key = m[1].trim();
      const val = m[2];
      idx++;
      if (val === "") {
        // nested block
        if (idx < lines.length && indentOf(lines[idx]) > baseIndent) {
          out[key] = parseBlock(indentOf(lines[idx]));
        } else {
          out[key] = null;
        }
      } else {
        out[key] = parseVal(val);
      }
    }
    return out;
  }
  function parseList(baseIndent) {
    const out = [];
    while (idx < lines.length) {
      const l = lines[idx];
      const ind = indentOf(l);
      if (ind < baseIndent) break;
      const stripped = l.slice(ind);
      if (!stripped.startsWith("- ") && stripped !== "-") break;
      const afterDash = stripped.slice(2);
      idx++;
      if (afterDash.trim() === "") {
        if (idx < lines.length && indentOf(lines[idx]) > baseIndent) {
          out.push(parseBlock(indentOf(lines[idx])));
        } else { out.push(null); }
      } else if (afterDash.includes(":")) {
        // inline key:val in list → treat as one-entry map, collect siblings at +2 indent
        const reparseFrom = idx - 1;
        const mapLines = [" ".repeat(baseIndent + 2) + afterDash];
        while (idx < lines.length && indentOf(lines[idx]) > baseIndent) {
          mapLines.push(lines[idx]); idx++;
        }
        const savedLines = lines.slice();
        // Run a nested parse on synthetic lines
        const prevLines = JSON.stringify(lines);
        lines.splice(0, lines.length, ...mapLines);
        const savedIdx = idx;
        idx = 0;
        const obj = parseMap(baseIndent + 2);
        lines.splice(0, lines.length, ...JSON.parse(prevLines));
        idx = savedIdx;
        out.push(obj);
        void reparseFrom; void savedLines;
      } else {
        out.push(parseVal(afterDash));
      }
    }
    return out;
  }
  return parseBlock(0);
}

// ── CSV --------------------------------------------------------------------

function parseCsv(src, opts) {
  const delim = (opts && opts.delimiter) || ",";
  const rows = [];
  const s = String(src);
  let i = 0, field = "", row = [], inQ = false;
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"' && s[i+1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQ = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.filter(function(r) { return r.length > 1 || r[0]; }).map(function(r) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = r[j] == null ? "" : r[j];
    return obj;
  });
}

function stringifyCsv(value) {
  if (!Array.isArray(value) || !value.length) return "";
  const headers = Array.from(value.reduce(function(set, row) {
    if (row && typeof row === "object") Object.keys(row).forEach(function(k){ set.add(k); });
    return set;
  }, new Set()));
  const esc = function(v) {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of value) {
    lines.push(headers.map(function(h) { return esc(row ? row[h] : ""); }).join(","));
  }
  return lines.join("\n") + "\n";
}

// ── XML --------------------------------------------------------------------

function parseXml(src) {
  const mod = tryRequire("fast-xml-parser");
  if (mod) {
    const Parser = mod.XMLParser || mod;
    const parser = new Parser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
    return parser.parse(String(src));
  }
  return parseXmlLite(src);
}

function parseXmlLite(src) {
  // Strip comments + declaration
  const clean = String(src).replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").trim();
  const RE = /<\/?([A-Za-z_][\w.-]*)((?:\s+[^>]*)?)\/?>/g;
  let cursor = 0, match;
  const stack = [{ name: "__root", children: [], text: "" }];
  while ((match = RE.exec(clean)) !== null) {
    const before = clean.slice(cursor, match.index);
    if (before.trim()) stack[stack.length - 1].text += before;
    const full = match[0];
    const name = match[1];
    const attrs = {};
    const attrStr = match[2] || "";
    const ARE = /([A-Za-z_:][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let am;
    while ((am = ARE.exec(attrStr)) !== null) attrs["@_" + am[1]] = am[3] != null ? am[3] : am[4];
    const selfClose = full.endsWith("/>");
    const isClose = full.startsWith("</");
    if (isClose) {
      stack.pop();
    } else {
      const node = { name, attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
    }
    cursor = RE.lastIndex;
  }
  function compact(n) {
    if (!n.children.length) {
      const t = n.text.trim();
      if (!Object.keys(n.attrs).length) return t || null;
      return Object.assign({}, n.attrs, t ? { "#text": t } : {});
    }
    const byName = {};
    for (const c of n.children) {
      const compacted = compact(c);
      if (byName[c.name] == null) byName[c.name] = compacted;
      else {
        if (!Array.isArray(byName[c.name])) byName[c.name] = [byName[c.name]];
        byName[c.name].push(compacted);
      }
    }
    if (n.text.trim()) byName["#text"] = n.text.trim();
    return Object.assign({}, n.attrs, byName);
  }
  const root = stack[0];
  if (root.children.length === 1) {
    const c = root.children[0];
    return { [c.name]: compact(c) };
  }
  return compact(root);
}

function stringifyXml(value, rootName) {
  const root = rootName || "root";
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlNode(root, value, 0);
}
function xmlNode(tag, v, depth) {
  const pad = "  ".repeat(depth);
  if (v === null || v === undefined) return pad + "<" + tag + "/>\n";
  if (typeof v !== "object") return pad + "<" + tag + ">" + xmlEscape(String(v)) + "</" + tag + ">\n";
  if (Array.isArray(v)) { return v.map(function(item) { return xmlNode(tag, item, depth); }).join(""); }
  // object: attributes (@_x) + children
  let attrs = "";
  let text = "";
  const childKeys = [];
  for (const k of Object.keys(v)) {
    if (k.startsWith("@_")) attrs += " " + k.slice(2) + '="' + xmlEscape(String(v[k])) + '"';
    else if (k === "#text") text = String(v[k]);
    else childKeys.push(k);
  }
  if (!childKeys.length && !text) return pad + "<" + tag + attrs + "/>\n";
  if (!childKeys.length && text)   return pad + "<" + tag + attrs + ">" + xmlEscape(text) + "</" + tag + ">\n";
  let out = pad + "<" + tag + attrs + ">\n";
  if (text) out += "  ".repeat(depth + 1) + xmlEscape(text) + "\n";
  for (const k of childKeys) out += xmlNode(k, v[k], depth + 1);
  out += pad + "</" + tag + ">\n";
  return out;
}
function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Public orchestrator ----------------------------------------------------

function parse(src, fmt) {
  switch (fmt) {
    case "json": return parseJson(src);
    case "yaml": return parseYaml(src);
    case "csv":  return parseCsv(src);
    case "xml":  return parseXml(src);
  }
  throw new Error("Unsupported `from` format: " + fmt);
}
function stringify(value, fmt, opts) {
  switch (fmt) {
    case "json": return stringifyJson(value);
    case "yaml": return stringifyYaml(value);
    case "csv":  return stringifyCsv(value);
    case "xml":  return stringifyXml(value, opts && opts.rootName);
  }
  throw new Error("Unsupported `to` format: " + fmt);
}

function convert(src, fromFmt, toFmt, opts) {
  fromFmt = (fromFmt || "").toLowerCase();
  toFmt = (toFmt || "").toLowerCase();
  if (!FORMATS.includes(fromFmt)) throw new Error("`from` must be one of: " + FORMATS.join(", "));
  if (!FORMATS.includes(toFmt))   throw new Error("`to` must be one of: " + FORMATS.join(", "));
  const intermediate = parse(src, fromFmt);
  const out = stringify(intermediate, toFmt, opts || {});
  return { from: fromFmt, to: toFmt, output: out, intermediateSummary: summarize(intermediate) };
}

function summarize(v, depth) {
  depth = depth || 0;
  if (v === null) return "null";
  if (Array.isArray(v)) return "array[" + v.length + "]";
  if (typeof v === "object") return "object{" + Object.keys(v).slice(0, 6).join(",") + (Object.keys(v).length > 6 ? ",…" : "") + "}";
  if (typeof v === "string") return "string(" + v.length + ")";
  return typeof v;
}

module.exports = { FORMATS, convert, parse, stringify };
