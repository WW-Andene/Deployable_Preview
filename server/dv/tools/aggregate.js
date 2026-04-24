/**
 * dv/tools/aggregate.js — high-leverage aggregate + batch tools.
 *
 * These exist to collapse common 3-call sequences into one round trip:
 *   dv_state           — everything about every repo/branch in one shot
 *   get_last_error     — parsed root cause from a build log (no more log grep)
 *   screenshot_multi   — parallel screenshots across branches/viewports
 *   compare_branches   — screenshot two slugs at the same path and diff them
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const { getConfig } = require("../../config");
const { buildStatus, branchSlug } = require("../../build");
const { runningServers } = require("../../process");
const { loadLog } = require("../../logs");

// ── dv_state ─────────────────────────────────────────────────────────────────

dv.defineTool({
  name: "dv_state",
  category: "engine",
  description:
    "One-shot snapshot of the full DeployView state: every repo, every configured branch, build/server status, ports, preview URLs, and the short tail of the last error (if any). Use this instead of list_previews + build_status per branch — it's one call.",
  requires: [],
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    const config = getConfig();
    const repos = [];
    let readyCount = 0, buildingCount = 0, errorCount = 0;

    for (const r of config.repos || []) {
      const branches = [];
      for (const bc of r.activeBranches || []) {
        const slug = branchSlug(bc);
        const key = r.owner + "/" + r.repo + ":" + slug;
        const st = buildStatus[key] || { status: "idle" };
        const srv = runningServers[key];

        let errorTail = null;
        if (st.status === "error") {
          const log = st.log || loadLog(key) || "";
          errorTail = extractErrorTail(log);
          errorCount++;
        } else if (st.status === "building" || st.status === "queued") {
          buildingCount++;
        } else if (st.status === "ready" || st.status === "running") {
          readyCount++;
        }

        branches.push({
          slug,
          branch: bc.branch,
          baseDir: bc.baseDir || "",
          mode: bc.mode || st.mode || "static",
          status: st.status,
          commitSha: st.commitSha ? String(st.commitSha).slice(0, 7) : null,
          lastBuild: st.lastBuild ? new Date(st.lastBuild).toISOString() : null,
          duration: st.duration || null,
          serverPort: srv ? srv.port : null,
          serverRunning: !!(srv && srv.status === "running"),
          previewUrl: "/preview/" + r.owner + "/" + r.repo + "/" + slug + "/",
          errorTail
        });
      }
      repos.push({ owner: r.owner, repo: r.repo, branches });
    }

    return dv.ok({
      totals: {
        repos: repos.length,
        branches: repos.reduce((n, r) => n + r.branches.length, 0),
        ready: readyCount,
        building: buildingCount,
        errors: errorCount
      },
      browser: browser.hasPlaywright(),
      repos,
      hint: errorCount > 0
        ? "Some branches failed — call get_last_error with their owner/repo/slug for a parsed root cause."
        : (repos.length === 0 ? "No repos configured yet. Add one in the dashboard." : "All clear.")
    });
  }
});

// ── get_last_error ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "get_last_error",
  category: "deploy",
  description:
    "Parse the build log for a branch and return a structured root-cause summary: {phase, errorType, line, snippet, hint}. Much cheaper than get_build_log when you only need to know what failed.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo:  { type: "string" },
      slug:  { type: "string" },
      context: { type: "number", description: "Lines of context around the error (default: 8, max: 40)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const st = buildStatus[key];
    const log = (st && st.log) ? st.log : loadLog(key);
    if (!log) {
      return dv.failCode("NO_LOG", "No build log available for " + key, {
        hint: "Trigger a build first, or check the slug with dv_state."
      });
    }
    const ctx = Math.max(1, Math.min(Number(args.context) || 8, 40));
    const parsed = parseBuildLog(log, ctx);
    return dv.ok(Object.assign({
      key,
      status: st ? st.status : "unknown",
      logLength: log.length
    }, parsed));
  }
});

// ── screenshot_multi ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "screenshot_multi",
  category: "browse",
  description:
    "Take parallel screenshots of multiple branches (and optionally multiple viewports per branch). Returns an image for each target plus a JSON index mapping {slug, viewport} → content-block position. Replaces N separate screenshot calls.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      targets: {
        type: "array",
        description: "List of {owner, repo, slug, path?} tuples to screenshot.",
        items: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo:  { type: "string" },
            slug:  { type: "string" },
            path:  { type: "string", description: "Optional path inside the preview (default: /)" }
          },
          required: ["owner", "repo", "slug"]
        }
      },
      viewports: {
        type: "array",
        description: "Optional list of {width, height, label?} — each target is captured at each viewport. Default: single 1280x720.",
        items: {
          type: "object",
          properties: {
            width:  { type: "number" },
            height: { type: "number" },
            label:  { type: "string" }
          }
        }
      },
      fullPage: { type: "boolean" }
    },
    required: ["targets"]
  },
  async handler(args) {
    const targets = Array.isArray(args.targets) ? args.targets : [];
    if (!targets.length) {
      return dv.failCode("BAD_ARGS", "screenshot_multi requires at least one target", {
        example: { targets: [{ owner: "me", repo: "app", slug: "main" }] }
      });
    }
    const viewports = (Array.isArray(args.viewports) && args.viewports.length)
      ? args.viewports
      : [{ width: 1280, height: 720, label: "desktop" }];

    const jobs = [];
    for (const t of targets) {
      for (const vp of viewports) {
        jobs.push({ t, vp });
      }
    }

    const results = await Promise.all(jobs.map(async ({ t, vp }) => {
      try {
        const out = await browser.takeScreenshot({
          owner: t.owner, repo: t.repo, slug: t.slug,
          width: vp.width || 1280, height: vp.height || 720,
          path: t.path, fullPage: !!args.fullPage
        });
        return { t, vp, out };
      } catch (e) {
        return { t, vp, out: { error: e && e.message || String(e) } };
      }
    }));

    const content = [];
    const index = [];
    for (const { t, vp, out } of results) {
      const label = t.owner + "/" + t.repo + ":" + t.slug + " @ " + (vp.label || (vp.width + "x" + vp.height));
      if (out && out.base64) {
        index.push({
          target: { owner: t.owner, repo: t.repo, slug: t.slug, path: t.path || "/" },
          viewport: { width: vp.width || 1280, height: vp.height || 720, label: vp.label || null },
          contentIndex: content.length,
          status: "ok",
          url: out.url,
          title: out.title
        });
        content.push({ type: "image", data: out.base64, mimeType: out.mimeType || "image/png" });
      } else {
        index.push({
          target: { owner: t.owner, repo: t.repo, slug: t.slug, path: t.path || "/" },
          viewport: { width: vp.width || 1280, height: vp.height || 720, label: vp.label || null },
          contentIndex: null,
          status: "error",
          error: (out && out.error) || "unknown"
        });
      }
      // Put a short label as text before each image so Claude can map them even without the index
      if (out && out.base64) content.push({ type: "text", text: label });
    }
    content.push({ type: "text", text: JSON.stringify({ index, count: results.length }, null, 2) });
    return dv.makeResult(content);
  }
});

// ── compare_branches ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "compare_branches",
  category: "visual",
  description:
    "Screenshot two branches at the same path and run a pixel diff in one call. Returns both screenshots, the diff heatmap (if pixelmatch is available), and {diffCount, percent, bbox}. Use for visual regression across branches.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo:  { type: "string" },
      base:  { type: "string", description: "Slug of the base branch (e.g. 'main')" },
      head:  { type: "string", description: "Slug of the branch to compare against base" },
      path:  { type: "string", description: "Path to compare, default: /" },
      width:  { type: "number", description: "Viewport width (default: 1280)" },
      height: { type: "number", description: "Viewport height (default: 720)" },
      fullPage:  { type: "boolean" },
      threshold: { type: "number", description: "Pixel tolerance (default: 10)" }
    },
    required: ["owner", "repo", "base", "head"]
  },
  async handler(args) {
    const shared = {
      owner: args.owner, repo: args.repo,
      width: args.width || 1280, height: args.height || 720,
      path: args.path, fullPage: !!args.fullPage
    };
    const [before, after] = await Promise.all([
      browser.takeScreenshot(Object.assign({}, shared, { slug: args.base })),
      browser.takeScreenshot(Object.assign({}, shared, { slug: args.head }))
    ]);

    if (before.error) return dv.failCode("SCREENSHOT_FAILED", "Base screenshot failed: " + before.error, { side: "base", slug: args.base });
    if (after.error)  return dv.failCode("SCREENSHOT_FAILED", "Head screenshot failed: " + after.error,  { side: "head", slug: args.head });

    const diff = await browser.screenshotDiff({
      before: before.base64, after: after.base64,
      threshold: args.threshold != null ? args.threshold : 10
    });

    const content = [
      { type: "image", data: before.base64, mimeType: before.mimeType || "image/png" },
      { type: "text", text: "base: " + args.base },
      { type: "image", data: after.base64,  mimeType: after.mimeType  || "image/png" },
      { type: "text", text: "head: " + args.head }
    ];
    if (diff && diff.base64) {
      content.push({ type: "image", data: diff.base64, mimeType: diff.mimeType || "image/png" });
      content.push({ type: "text", text: "diff heatmap" });
    }
    const summary = {
      base: { slug: args.base, url: before.url },
      head: { slug: args.head, url: after.url },
      path: args.path || "/",
      diff: diff && !diff.error ? {
        diffCount: diff.diffCount,
        percent:   diff.percent,
        bbox:      diff.bbox,
        maxDelta:  diff.maxDelta,
        engine:    diff.engine || null
      } : (diff && diff.error ? { error: diff.error } : null)
    };
    content.push({ type: "text", text: JSON.stringify(summary, null, 2) });
    return dv.makeResult(content);
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Pull the short, recent error signature out of a build log.
 * Used inline by dv_state for quick status glances.
 */
function extractErrorTail(log) {
  if (!log) return null;
  const lines = String(log).split(/\r?\n/);
  const ERR = /\b(error|fail(?:ed)?|exception|fatal|ENOENT|EACCES|ECONNREFUSED|EADDRINUSE|Cannot\s+find\s+module|SyntaxError|TypeError|ReferenceError)\b/i;
  // Scan from the end — real errors usually live in the last ~80 lines.
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 120); i--) {
    const l = lines[i];
    if (!l || !l.trim()) continue;
    if (ERR.test(l)) {
      const start = Math.max(0, i - 2);
      return lines.slice(start, i + 1).join("\n");
    }
  }
  // No obvious error — return the last 4 non-empty lines as a fallback.
  const nonEmpty = lines.filter((l) => l && l.trim());
  return nonEmpty.slice(-4).join("\n") || null;
}

/**
 * Richer log parser for the get_last_error tool. Returns:
 *   { phase, errorType, line, snippet, hint, endedWithError }
 */
function parseBuildLog(log, context) {
  const lines = String(log).split(/\r?\n/);
  const joined = lines.join("\n");

  // Detect phase from the last phase marker we emitted.
  // build.js prints lines like "Cloning...", "Installing deps...", "Running build command: ...", "Starting server: ..."
  const phaseMatchers = [
    { re: /Starting server/i,          phase: "start" },
    { re: /Running build command/i,    phase: "build" },
    { re: /Running install|npm ci|npm install|yarn install|pnpm install/i, phase: "install" },
    { re: /Cloning|Updating branch/i,  phase: "clone" }
  ];
  let phase = "unknown";
  for (let i = lines.length - 1; i >= 0 && phase === "unknown"; i--) {
    for (const pm of phaseMatchers) {
      if (pm.re.test(lines[i])) { phase = pm.phase; break; }
    }
  }

  // Error classifier — first match wins.
  const patterns = [
    { code: "MODULE_NOT_FOUND",    re: /Cannot find module ['"]([^'"]+)['"]/,         hint: (m) => "Missing dependency '" + m[1] + "' — add it to package.json." },
    { code: "PORT_IN_USE",         re: /EADDRINUSE|address already in use/i,          hint: () => "Port collision — another server owns this port. Kill it or pick another." },
    { code: "CONNECTION_REFUSED",  re: /ECONNREFUSED/,                                 hint: () => "Target refused connection — check the URL/port." },
    { code: "PERMISSION_DENIED",   re: /EACCES|permission denied/i,                    hint: () => "Filesystem permission error — check file ownership or run with correct user." },
    { code: "FILE_NOT_FOUND",      re: /ENOENT.*open ['"]([^'"]+)['"]|ENOENT: no such file or directory.*'([^']+)'/, hint: () => "File not found — the build expected a path that doesn't exist." },
    { code: "SYNTAX_ERROR",        re: /SyntaxError:\s*(.+)/,                          hint: (m) => "Syntax error: " + (m[1] || "").slice(0, 200) },
    { code: "TYPE_ERROR",          re: /TypeError:\s*(.+)/,                            hint: (m) => "TypeError: " + (m[1] || "").slice(0, 200) },
    { code: "REFERENCE_ERROR",     re: /ReferenceError:\s*(.+)/,                       hint: (m) => "ReferenceError: " + (m[1] || "").slice(0, 200) },
    { code: "BUILD_COMMAND_EXIT",  re: /Command failed with exit code|exit code (\d+)/i, hint: () => "Build command exited non-zero — check the snippet above." },
    { code: "NPM_ERROR",           re: /npm ERR!/,                                     hint: () => "npm failed — inspect the snippet for the actual npm error." },
    { code: "GIT_ERROR",           re: /fatal:\s*(.+)/,                                hint: (m) => "Git error: " + (m[1] || "").slice(0, 200) },
    { code: "GENERIC_ERROR",       re: /\b(?:Error|Fatal|FAIL)\b:\s*(.+)/,             hint: (m) => (m[1] || "").slice(0, 200) }
  ];

  let found = null;
  for (const pat of patterns) {
    const m = pat.re.exec(joined);
    if (m) {
      const lineIdx = joined.slice(0, m.index).split(/\r?\n/).length - 1;
      found = { pat, m, lineIdx };
      break;
    }
  }

  const endedWithError = /\b(error|fail(?:ed)?|exception|fatal)\b/i.test(
    lines.slice(-5).join("\n")
  );

  if (!found) {
    return {
      phase,
      errorType: endedWithError ? "UNKNOWN_ERROR" : "NO_ERROR_DETECTED",
      line: null,
      snippet: lines.slice(-context).join("\n"),
      hint: endedWithError
        ? "Log ends on an error-ish line but no known pattern matched. Review the snippet."
        : "No error pattern matched — build may still be running, or finished fine.",
      endedWithError
    };
  }

  const start = Math.max(0, found.lineIdx - Math.floor(context / 2));
  const end   = Math.min(lines.length, found.lineIdx + Math.ceil(context / 2) + 1);
  return {
    phase,
    errorType: found.pat.code,
    line: found.lineIdx + 1,
    snippet: lines.slice(start, end).join("\n"),
    hint: found.pat.hint(found.m),
    endedWithError
  };
}
