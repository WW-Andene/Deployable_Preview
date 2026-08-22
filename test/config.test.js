/**
 * test/config.test.js — validateAndRepairConfig coercion + drop behaviour.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateAndRepairConfig } = require("../server/config");

function fresh() { return { fixes: [], errors: [], ok: true }; }

test("config: coerces non-string scalars to ''", () => {
  const r = fresh();
  const c = validateAndRepairConfig({ token: 42, secrets: null, preferences: null }, r);
  assert.equal(c.token, "");
  assert.deepEqual(c.secrets, {});
  assert.deepEqual(c.preferences, {});
  assert.ok(r.fixes.length >= 3);
});

test("config: drops repos missing owner/repo", () => {
  const r = fresh();
  const c = validateAndRepairConfig({
    repos: [
      null,
      { owner: "a" },
      { repo: "b" },
      { owner: "c", repo: "d", activeBranches: [{ branch: "main" }] }
    ]
  }, r);
  assert.equal(c.repos.length, 1);
  assert.equal(c.repos[0].owner, "c");
  assert.ok(r.errors.length >= 3);
});

test("config: drops branch entries missing branch name", () => {
  const r = fresh();
  const c = validateAndRepairConfig({
    repos: [{ owner: "a", repo: "b", activeBranches: [{}, { branch: "" }, { branch: "main" }] }]
  }, r);
  assert.equal(c.repos[0].activeBranches.length, 1);
});

test("config: keeps legacy string branch entries", () => {
  const r = fresh();
  const c = validateAndRepairConfig({
    repos: [{ owner: "a", repo: "b", activeBranches: ["main", "feat"] }]
  }, r);
  assert.equal(c.repos[0].activeBranches.length, 2);
});

test("config: non-object root produces empty default", () => {
  const r = fresh();
  const c = validateAndRepairConfig("nope", r);
  assert.deepEqual(Object.keys(c).sort(), ["preferences", "repos", "secrets", "token"]);
  assert.ok(r.errors.length > 0);
});
