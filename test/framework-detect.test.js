/**
 * test/framework-detect.test.js — heuristic classification of package.json
 * against expected build/run defaults.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detect } = require("../server/framework-detect");

test("detect: Next.js with `next start` → server mode", () => {
  const r = detect({ dependencies: { next: "14" }, scripts: { build: "next build", start: "next start" } });
  assert.equal(r.framework, "Next.js");
  assert.equal(r.mode, "server");
  assert.equal(r.outputDir, ".next");
  assert.equal(r.confidence, "high");
});

test("detect: Next.js without start → static `out`", () => {
  const r = detect({ dependencies: { next: "14" }, scripts: { build: "next build" } });
  assert.equal(r.framework, "Next.js");
  assert.equal(r.mode, "static");
  assert.equal(r.outputDir, "out");
});

test("detect: Vite project → static dist", () => {
  const r = detect({ devDependencies: { vite: "5" }, scripts: { build: "vite build" } });
  assert.equal(r.framework, "Vite");
  assert.equal(r.mode, "static");
  assert.equal(r.outputDir, "dist");
});

test("detect: Create React App → build dir", () => {
  const r = detect({ dependencies: { "react-scripts": "5" } });
  assert.equal(r.framework, "Create React App");
  assert.equal(r.outputDir, "build");
});

test("detect: SvelteKit static adapter", () => {
  const r = detect({ devDependencies: { "@sveltejs/kit": "2", "@sveltejs/adapter-static": "3" } });
  assert.match(r.framework, /SvelteKit/);
  assert.equal(r.mode, "static");
});

test("detect: SvelteKit node adapter (default) → server", () => {
  const r = detect({ devDependencies: { "@sveltejs/kit": "2" } });
  assert.match(r.framework, /SvelteKit/);
  assert.equal(r.mode, "server");
});

test("detect: NestJS → server mode", () => {
  const r = detect({ dependencies: { "@nestjs/core": "10", "@nestjs/common": "10" } });
  assert.equal(r.framework, "NestJS");
  assert.equal(r.mode, "server");
});

test("detect: Astro SSR via @astrojs/node", () => {
  const r = detect({ dependencies: { astro: "4", "@astrojs/node": "8" } });
  assert.match(r.framework, /Astro \(SSR\)/);
  assert.equal(r.mode, "server");
});

test("detect: empty package returns 'unknown' or 'Plain static'", () => {
  const r = detect({});
  assert.ok(["unknown", "Plain static"].includes(r.framework));
});

test("detect: env templates are framework-appropriate", () => {
  assert.match(detect({ dependencies: { next: "14" } }).envTemplate, /NEXT_PUBLIC_/);
  assert.match(detect({ dependencies: { astro: "4" } }).envTemplate, /PUBLIC_/);
  assert.match(detect({ dependencies: { vite: "5" } }).envTemplate, /VITE_/);
  assert.match(detect({ dependencies: { "react-scripts": "5" } }).envTemplate, /REACT_APP_/);
});
