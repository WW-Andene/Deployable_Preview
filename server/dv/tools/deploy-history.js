/**
 * dv/tools/deploy-history.js — history navigation + rollback + bisect.
 *
 * Tools that work with the deployment-history JSON (stored under
 * workspace/.history/<key>.json by build/history.js):
 *   deployment_history    list past builds (newest-first)
 *   rollback              point the live URL at a prior snapshot
 *   bisect_builds         O(log N) regression search via time-travel URLs
 *   compare_deployments   file-level diff between two snapshots
 *   read_deployed_file    read any file from the live outputDir
 *   annotate_deployment   attach a note to a history entry
 *
 * R4: extracted from deploy.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const dv = require("../core");
const { buildStatus, getHistory } = require("../../build");
const deployment = require("../../services/deployment");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

dv.defineTool({
  name: "deployment_history",
  category: "deploy",
  description:
    "List recent successful deployments for a branch (newest first). Each entry has an `id` " +
    "you can pass to rollback. Includes commitSha, timestamp, duration, and whether the entry " +
    "is a normal build or a manual rollback action.",
  requires: [],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const r = deployment.listHistory(args.owner, args.repo, args.slug);
    if (!r.ok) return dv.failCode(r.code || "HISTORY_FAILED", r.error);
    return dv.ok({
      key: args.owner + "/" + args.repo + ":" + args.slug,
      currentlyServing: r.current,
      history: (r.history || []).map((h) => ({
        id: h.id,
        commitSha: h.commitSha,
        commitShort: (h.commitSha || "").slice(0, 7),
        timestamp: h.timestamp ? new Date(h.timestamp).toISOString() : null,
        duration: h.duration,
        by: h.by,
        rolledBackFromId: h.rolledBackToId
      })),
      hint: "Use rollback with one of the `id`s to point the live preview at that snapshot."
    });
  }
});

dv.defineTool({
  name: "rollback",
  category: "deploy",
  description:
    "Roll a static-mode preview back to a prior build snapshot. Pass `id` from deployment_history. " +
    "Does NOT re-run the build — instantly redirects the live URL at the older bytes. " +
    "Server-mode previews can't rollback this way (re-run the build at the target SHA instead).",
  requires: [],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG, id: { type: "string", description: "history entry id from deployment_history" } },
    required: ["owner", "repo", "slug", "id"]
  },
  async handler(args) {
    const r = deployment.rollback(args.owner, args.repo, args.slug, args.id);
    if (!r.ok) return dv.failCode(r.code || "ROLLBACK_FAILED", r.error);
    dv.invalidateCache("build_status");
    dv.invalidateCache("list_previews");
    return dv.ok({
      message: r.message, entry: r.entry,
      previewUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/"
    });
  }
});

dv.defineTool({
  name: "bisect_builds",
  category: "deploy",
  description:
    "Binary-search through deployment history to find the build that introduced a regression. " +
    "Pass `goodId` (a known-working snapshot) and `badId` (a known-broken one). " +
    "Returns the midpoint snapshot id + its time-travel URL — visit it, decide good/bad, then " +
    "call again with the narrowed (goodId/badId) range. Converges in O(log N) steps.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      goodId: { type: "string", description: "known-good history id (or 'oldest' for the earliest entry)" },
      badId:  { type: "string", description: "known-bad history id (or 'latest' for the most recent build)" }
    },
    required: ["owner", "repo", "slug", "goodId", "badId"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const hist = (getHistory(key) || []).filter((h) => h && h.by === "build");
    if (!hist.length) return dv.failCode("NO_HISTORY", "No build history for " + key);
    // History stored newest-first; bisect math reads cleaner chronologically.
    const chrono = hist.slice().reverse();
    function findIdx(id) {
      if (id === "oldest") return 0;
      if (id === "latest") return chrono.length - 1;
      return chrono.findIndex((h) => h.id === id);
    }
    const goodIdx = findIdx(args.goodId);
    const badIdx  = findIdx(args.badId);
    if (goodIdx === -1) return dv.failCode("BAD_REF", "goodId not found: " + args.goodId);
    if (badIdx  === -1) return dv.failCode("BAD_REF", "badId not found: "  + args.badId);
    if (goodIdx >= badIdx) return dv.failCode("BAD_RANGE", "goodId must come BEFORE badId chronologically (good must be older)");

    if (badIdx - goodIdx === 1) {
      return dv.ok({
        done: true,
        firstBadId: chrono[badIdx].id,
        firstBadCommit: chrono[badIdx].commitSha,
        firstBadAt: chrono[badIdx].timestamp,
        timeTravelUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/__snapshot/" + chrono[badIdx].id + "/",
        message: "Bisection complete. " + (chrono[badIdx].commitSha || "").slice(0, 7) + " is the first known-bad build."
      });
    }
    const midIdx = Math.floor((goodIdx + badIdx) / 2);
    const mid = chrono[midIdx];
    return dv.ok({
      done: false,
      probeId: mid.id,
      probeCommit: mid.commitSha,
      probeAt: mid.timestamp,
      timeTravelUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/__snapshot/" + mid.id + "/",
      remainingSteps: Math.ceil(Math.log2(badIdx - goodIdx)),
      hint: "Visit timeTravelUrl. If it works, call bisect_builds again with goodId='" + mid.id + "', badId='" + args.badId + "'. If broken, with goodId='" + args.goodId + "', badId='" + mid.id + "'."
    });
  }
});

// Walk an output dir, return a path → bytes Map. Local helper for compare_deployments.
function _walkSizes(rootDir) {
  const out = new Map();
  function walk(d, sub) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      const rel = sub ? sub + "/" + e.name : e.name;
      if (e.isDirectory()) walk(full, rel);
      else if (e.isFile()) {
        try { out.set(rel, fs.statSync(full).size); } catch (_) {}
      }
    }
  }
  walk(rootDir, "");
  return out;
}

dv.defineTool({
  name: "compare_deployments",
  category: "deploy",
  description:
    "Diff two deployment-history snapshots at the file level. Returns lists of added, " +
    "removed, and changed files (with byte deltas) plus aggregate sizes. Pass two `id`s from " +
    "deployment_history. Perfect for AI-generated 'what changed in this release' summaries.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      base: { type: "string", description: "Older history entry id (or 'latest' for the most recent build)" },
      head: { type: "string", description: "Newer history entry id (or 'current' for the live output)" },
      maxFilesPerCategory: { type: "number", description: "Cap each of added/removed/changed (default 200)" }
    },
    required: ["owner", "repo", "slug", "base", "head"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const hist = getHistory(key) || [];
    const slot = buildStatus[key] || {};
    function resolveDir(token) {
      if (token === "current") return slot.outputPath || null;
      if (token === "latest") {
        const h = hist.find((x) => x && x.by === "build");
        return h && h.snapshotDir;
      }
      const h = hist.find((x) => x && x.id === token);
      return h && h.snapshotDir;
    }
    const baseDir = resolveDir(args.base);
    const headDir = resolveDir(args.head);
    if (!baseDir) return dv.failCode("BASE_NOT_FOUND", "Base snapshot not found / not on disk: " + args.base);
    if (!headDir) return dv.failCode("HEAD_NOT_FOUND", "Head snapshot not found / not on disk: " + args.head);

    const baseMap = _walkSizes(baseDir);
    const headMap = _walkSizes(headDir);
    const added = [], removed = [], changed = [];
    let baseTotal = 0, headTotal = 0;
    for (const [, v] of baseMap) baseTotal += v;
    for (const [, v] of headMap) headTotal += v;

    for (const [p, size] of headMap) {
      if (!baseMap.has(p)) added.push({ path: p, bytes: size });
      else if (baseMap.get(p) !== size) {
        const before = baseMap.get(p);
        changed.push({ path: p, before, after: size, delta: size - before });
      }
    }
    for (const [p, size] of baseMap) {
      if (!headMap.has(p)) removed.push({ path: p, bytes: size });
    }
    const cap = Math.max(1, Math.min(Number(args.maxFilesPerCategory) || 200, 5000));
    return dv.ok({
      base: { ref: args.base, files: baseMap.size, totalBytes: baseTotal },
      head: { ref: args.head, files: headMap.size, totalBytes: headTotal },
      delta: {
        files: headMap.size - baseMap.size,
        bytes: headTotal - baseTotal,
        bytesPct: baseTotal > 0 ? +(((headTotal - baseTotal) / baseTotal) * 100).toFixed(2) : null
      },
      added:   { count: added.length,   shown: Math.min(added.length, cap),   items: added.slice(0, cap) },
      removed: { count: removed.length, shown: Math.min(removed.length, cap), items: removed.slice(0, cap) },
      changed: { count: changed.length, shown: Math.min(changed.length, cap), items: changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, cap) }
    });
  }
});

dv.defineTool({
  name: "read_deployed_file",
  category: "deploy",
  description:
    "Read a file from a branch's deployed output directory. Use the path AS SERVED — e.g. " +
    "'index.html' or 'assets/app.js' — relative to the preview root. Path traversal is rejected. " +
    "Binary files come back base64-encoded with a `binary: true` flag; text files come back as-is.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      path: { type: "string", description: "Relative path within the deployed output directory" },
      maxBytes: { type: "number", description: "Cap the returned bytes (default 1 MiB)" }
    },
    required: ["owner", "repo", "slug", "path"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const slot = buildStatus[key];
    if (!slot || !slot.outputPath) return dv.failCode("NOT_BUILT", "No build output for " + key);
    if (!fs.existsSync(slot.outputPath)) return dv.failCode("OUTPUT_GONE", "Output dir missing on disk");
    const root = path.resolve(slot.outputPath);
    const requested = path.resolve(root, args.path);
    if (!requested.startsWith(root + path.sep) && requested !== root) {
      return dv.failCode("PATH_TRAVERSAL", "Path escapes the output directory: " + args.path);
    }
    let stat;
    try { stat = fs.statSync(requested); }
    catch (e) { return dv.failCode("NOT_FOUND", "File not found: " + args.path); }
    if (!stat.isFile()) return dv.failCode("NOT_A_FILE", "Path is a directory: " + args.path);
    const cap = Math.max(1024, Math.min(Number(args.maxBytes) || (1024 * 1024), 50 * 1024 * 1024));
    let buf;
    try { buf = fs.readFileSync(requested); }
    catch (e) { return dv.failCode("READ_FAILED", e.message); }
    const truncated = buf.length > cap;
    if (truncated) buf = buf.slice(0, cap);
    // Heuristic text/binary sniff: NUL byte in the first 8 KiB → binary.
    const sniff = buf.slice(0, Math.min(buf.length, 8192));
    let isBinary = false;
    for (let i = 0; i < sniff.length; i++) { if (sniff[i] === 0) { isBinary = true; break; } }
    return dv.ok({
      path: args.path,
      bytes: stat.size,
      truncated,
      binary: isBinary,
      content: isBinary ? buf.toString("base64") : buf.toString("utf8")
    });
  }
});

dv.defineTool({
  name: "annotate_deployment",
  category: "deploy",
  description:
    "Attach a free-text note (≤2000 chars) to a deployment-history entry. " +
    "Pass an empty note to clear. Use deployment_history to find the `id`. " +
    "AI use case: write a one-liner summary of what shipped in this deploy " +
    "right after build.ready, so future Claude sessions have context.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      id:   { type: "string", description: "history entry id" },
      note: { type: "string", description: "Free-text note. Empty/missing clears any existing note." }
    },
    required: ["owner", "repo", "slug", "id"]
  },
  async handler(args) {
    const r = deployment.annotateHistory(args.owner, args.repo, args.slug, args.id, args.note || "");
    if (!r.ok) return dv.failCode(r.code || "ANNOTATE_FAILED", r.error);
    return dv.ok({ entry: r.entry, message: (args.note ? "Note set" : "Note cleared") });
  }
});
