/**
 * test/codec.test.js — pure-Node tests for codec/decode.js, codec/convert.js,
 * and codec/classify.js. No browser, no network, no filesystem.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { decode, decodeBase64, decodeHex, decodeJwt, decodeUrl, decodeHtmlEntities, detectEncoding } = require("../server/codec/decode");
const { convert, parse, stringify, FORMATS } = require("../server/codec/convert");
const { detectLanguage, sniffFile, inferJsonSchema } = require("../server/codec/classify");

// ── decode ────────────────────────────────────────────────────────────────

test("decode: base64 round-trip", () => {
  assert.equal(decodeBase64("SGVsbG8gd29ybGQ=", false), "Hello world");
});

test("decode: base64url accepts -_", () => {
  assert.equal(decodeBase64("SGVsbG8td29ybGRfIQ", true), "Hello-world_!");
});

test("decode: hex with separators", () => {
  assert.equal(decodeHex("48 65 6c 6c 6f"), "Hello");
  assert.equal(decodeHex("0x48656c6c6f"), "Hello");
});

test("decode: URL-encoded", () => {
  assert.equal(decodeUrl("%3Chello%20world%3E"), "<hello world>");
});

test("decode: HTML entities", () => {
  assert.equal(decodeHtmlEntities("&amp;&lt;&gt;&#65;&#x41;"), "&<>AA");
});

test("decode: JWT extracts header + payload + flags", () => {
  // {"alg":"HS256"} . {"sub":"abc","exp":9999999999} . sig
  const tok = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMiLCJleHAiOjk5OTk5OTk5OTl9.sig";
  const out = decodeJwt(tok);
  assert.equal(out.header.alg, "HS256");
  assert.equal(out.payload.sub, "abc");
  assert.equal(out.expired, false);
  assert.equal(out.signaturePresent, true);
});

test("decode: invalid JWT throws", () => {
  assert.throws(() => decodeJwt("not.a"), /3 dot-separated/);
});

test("decode: auto-detect picks correct mode", () => {
  assert.equal(detectEncoding("SGVsbG8gd29ybGQ="), "base64");
  assert.equal(detectEncoding("48656c6c6f20776f726c64"), "hex");
  assert.equal(detectEncoding("%E2%82%AC"), "url");
  assert.equal(detectEncoding("&amp;hello"), "html-entities");
  assert.equal(detectEncoding("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig"), "jwt");
});

test("decode: auto mode round-trips through detector", () => {
  const r = decode("SGVsbG8gd29ybGQ=", "auto");
  assert.equal(r.detected, "base64");
  assert.equal(r.decoded, "Hello world");
});

// ── convert ───────────────────────────────────────────────────────────────

test("convert: JSON → YAML emits scalar values + arrays + nested objects", () => {
  const out = convert('{"name":"a","tags":["x","y"],"meta":{"v":1}}', "json", "yaml").output;
  assert.match(out, /^name: a$/m);
  assert.match(out, /^  - x$/m);
  assert.match(out, /^meta:$/m);
  assert.match(out, /^  v: 1$/m);
});

test("convert: JSON → CSV produces headers + rows", () => {
  const out = convert('[{"a":1,"b":2},{"a":3,"b":4}]', "json", "csv").output;
  assert.equal(out.trim().split("\n")[0], "a,b");
  assert.equal(out.trim().split("\n").length, 3);
});

test("convert: CSV → JSON parses headers + values", () => {
  const out = convert("a,b\n1,2\n3,4", "csv", "json").output;
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].a, "1");
  assert.equal(parsed[1].b, "4");
});

test("convert: CSV with quoted fields containing commas", () => {
  const out = convert('name,bio\n"Doe, J","says ""hi"""', "csv", "json").output;
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].name, "Doe, J");
  assert.equal(parsed[0].bio, 'says "hi"');
});

test("convert: JSON → XML emits @_attributes + #text", () => {
  const out = convert('{"item":{"@_id":"1","#text":"hi"}}', "json", "xml").output;
  assert.match(out, /<item id="1">hi<\/item>/);
});

test("convert: rejects unknown formats", () => {
  assert.throws(() => convert("x", "yaml", "binary"), /one of/);
  assert.throws(() => convert("x", "binary", "json"), /one of/);
});

test("convert: FORMATS array is the source of truth", () => {
  assert.deepEqual(FORMATS.sort(), ["csv", "json", "xml", "yaml"]);
});

// ── classify ──────────────────────────────────────────────────────────────

test("lang_detect: identifies python", () => {
  const r = detectLanguage('def hello():\n    return "hi"\n');
  assert.equal(r.language, "python");
});

test("lang_detect: identifies rust", () => {
  const r = detectLanguage('fn main() { let mut x: i32 = 3; impl Foo for Bar {} }');
  assert.equal(r.language, "rust");
});

test("lang_detect: identifies SQL", () => {
  const r = detectLanguage("SELECT id, name FROM users WHERE active = 1 ORDER BY id");
  assert.equal(r.language, "sql");
});

test("lang_detect: empty input gracefully degrades", () => {
  const r = detectLanguage("");
  assert.equal(r.language, "empty");
});

test("file_sniff: detects PNG by magic bytes", () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  assert.equal(sniffFile(buf).type, "png");
  assert.equal(sniffFile(buf).mime, "image/png");
});

test("file_sniff: detects PDF", () => {
  assert.equal(sniffFile(Buffer.from("%PDF-1.7")).type, "pdf");
});

test("file_sniff: detects gzip", () => {
  assert.equal(sniffFile(Buffer.from([0x1f, 0x8b, 0x08, 0x00])).type, "gzip");
});

test("file_sniff: ascii falls back to text", () => {
  assert.equal(sniffFile(Buffer.from("hello world\nplain text")).type, "text");
});

test("inferJsonSchema: object with required fields", () => {
  const s = inferJsonSchema({ a: 1, b: "foo", c: true });
  assert.equal(s.type, "object");
  assert.deepEqual(s.required.sort(), ["a", "b", "c"]);
  assert.equal(s.properties.a.type, "integer");
  assert.equal(s.properties.b.type, "string");
  assert.equal(s.properties.c.type, "boolean");
});

test("inferJsonSchema: array of objects merges schemas", () => {
  const s = inferJsonSchema([{ a: 1 }, { a: 2, b: "x" }]);
  assert.equal(s.type, "array");
  assert.equal(s.items.type, "object");
  // 'a' present in all → required; 'b' not → not required
  assert.deepEqual(s.items.required, ["a"]);
});

test("inferJsonSchema: tags string formats", () => {
  const s = inferJsonSchema({
    when: "2026-04-25T12:00:00Z",
    site: "https://example.com",
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "a@b.co"
  });
  assert.equal(s.properties.when.format, "date-time");
  assert.equal(s.properties.site.format, "uri");
  assert.equal(s.properties.id.format, "uuid");
  assert.equal(s.properties.email.format, "email");
});
