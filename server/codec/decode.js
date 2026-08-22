/**
 * codec/decode.js — universal text-encoding decoder.
 *
 * Pure Node.js. Covers: base64, base64url, hex, URL-encoding, HTML
 * entities, JWT (split + decode header + payload), percent-escaped,
 * Unicode escapes. Auto-detection of the encoding when none given.
 */

"use strict";

const HTML_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", deg: "°", plusmn: "±",
  times: "×", divide: "÷", euro: "€", pound: "£", yen: "¥", cent: "¢"
};

function decodeHtmlEntities(input) {
  return String(input).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(whole, ref) {
    if (ref[0] === "#") {
      const cp = ref[1] === "x" || ref[1] === "X"
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    const lower = ref.toLowerCase();
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, lower) ? HTML_ENTITIES[lower] : whole;
  });
}

function decodeUnicodeEscapes(input) {
  // \uXXXX and \u{XXXXX}
  return String(input)
    .replace(/\\u\{([0-9a-f]+)\}/gi, function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
    .replace(/\\u([0-9a-f]{4})/gi,    function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
    .replace(/\\x([0-9a-f]{2})/gi,    function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)); });
}

function decodeHex(input) {
  const clean = String(input).replace(/[\s,:-]/g, "").replace(/^0x/i, "");
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Not valid hex");
  }
  return Buffer.from(clean, "hex").toString("utf8");
}

function decodeBase64(input, urlSafe) {
  let s = String(input).replace(/\s+/g, "");
  if (urlSafe) s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function decodeUrl(input) {
  // Repeatedly apply decodeURIComponent if still encoded (common API artifact).
  let out = String(input);
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) return out;
      out = next;
    } catch (_) { return out; }
  }
  return out;
}

function decodeJwt(input) {
  const parts = String(input).trim().split(".");
  if (parts.length !== 3) throw new Error("Not a JWT — expected 3 dot-separated segments");
  const header  = JSON.parse(decodeBase64(parts[0], true));
  const payload = JSON.parse(decodeBase64(parts[1], true));
  const now = Math.floor(Date.now() / 1000);
  return {
    header,
    payload,
    signaturePresent: parts[2].length > 0,
    expired: typeof payload.exp === "number" ? now > payload.exp : null,
    notBefore: typeof payload.nbf === "number" && now < payload.nbf ? true : false,
    issuer: payload.iss || null,
    subject: payload.sub || null,
    audience: payload.aud || null,
    issuedAtIso: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
    expiresAtIso: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
  };
}

const KNOWN = [
  "auto", "base64", "base64url", "hex", "url", "jwt", "html-entities", "unicode-escape"
];

/**
 * @param {string} input
 * @param {string} [mode] — one of KNOWN. "auto" tries to detect.
 * @returns {{ mode, decoded, detected?, preview? }}
 */
function decode(input, mode) {
  mode = (mode || "auto").toLowerCase();
  const raw = String(input == null ? "" : input);

  if (!KNOWN.includes(mode)) throw new Error("Unknown mode: " + mode + ". Known: " + KNOWN.join(", "));

  if (mode === "auto") {
    const detected = detectEncoding(raw);
    if (!detected) return { mode: "auto", detected: "plain-text", decoded: raw };
    const { mode: picked, decoded } = decodeSingle(raw, detected);
    return { mode: "auto", detected: picked, decoded };
  }
  return decodeSingle(raw, mode);
}

function decodeSingle(raw, mode) {
  switch (mode) {
    case "base64":        return { mode, decoded: decodeBase64(raw, false) };
    case "base64url":     return { mode, decoded: decodeBase64(raw, true) };
    case "hex":           return { mode, decoded: decodeHex(raw) };
    case "url":           return { mode, decoded: decodeUrl(raw) };
    case "jwt":           return { mode, decoded: decodeJwt(raw) };
    case "html-entities": return { mode, decoded: decodeHtmlEntities(raw) };
    case "unicode-escape":return { mode, decoded: decodeUnicodeEscapes(raw) };
  }
  throw new Error("Unsupported: " + mode);
}

function detectEncoding(s) {
  const t = s.trim();
  // JWT: 3 dot segments, each base64url
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)) return "jwt";
  // URL-encoded: has %XX sequences
  if (/%[0-9a-f]{2}/i.test(t)) return "url";
  // HTML entities
  if (/&(?:#x?[0-9a-f]+|[a-z]+);/i.test(t)) return "html-entities";
  // Unicode/hex escapes
  if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(t)) return "unicode-escape";
  // Hex string (at least 16 hex chars, even length, no other chars)
  if (/^[0-9a-f\s:,-]+$/i.test(t) && t.replace(/[\s:,-]/g, "").length % 2 === 0 && t.replace(/[\s:,-]/g, "").length >= 16) return "hex";
  // base64url (contains - or _)
  if (/^[A-Za-z0-9_-]+={0,2}$/.test(t) && (t.includes("-") || t.includes("_")) && t.length % 4 <= 2) return "base64url";
  // base64 classic
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length >= 8 && t.length % 4 === 0) return "base64";
  return null;
}

module.exports = { decode, decodeBase64, decodeHex, decodeUrl, decodeJwt, decodeHtmlEntities, detectEncoding, KNOWN };
