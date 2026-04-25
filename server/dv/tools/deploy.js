/**
 * dv/tools/deploy.js — build + deployment orchestration.
 *
 * Discover previews, query build state, trigger rebuilds, stream logs,
 * run the end-to-end "deploy + verify" flow, and invoke the built-in
 * test harness.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const { getConfig, saveConfig } = require("../../config");
const { buildStatus, branchSlug, deployBranch } = require("../../build");
const { runningServers } = require("../../process");
const { loadLog } = require("../../logs");
const deployment = require("../../services/deployment");
const { ghApi } = require("../../github");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── list_previews ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "list_previews",
  category: "deploy",
  description: "List all deployed app previews with status, URLs, and metadata. Use first to discover what's available. Cached for 2s.",
  requires: [],
  cache: { ttlMs: 2000 },
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    const previews = browser.listPreviews();
    const config = getConfig();
    return dv.ok({
      previews,
      totalRepos: config.repos.length,
      playwrightAvailable: browser.hasPlaywright(),
      hint: previews.length === 0
        ? "No previews deployed. Add a repo and build a branch in the dashboard."
        : "Use the owner/repo/slug from a preview to take screenshots, inspect, or interact."
    });
  }
});

// ── build_status ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "build_status",
  category: "deploy",
  description: "Get the build status of a specific branch deployment, including commit SHA, server port (if running), and preview URL. Cached for 1s.",
  requires: [],
  cache: { ttlMs: 1000 },
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const status = buildStatus[key] || { status: "unknown" };
    const srv = runningServers[key];
    return dv.ok({
      key,
      status: status.status,
      mode: status.mode,
      lastBuild: status.lastBuild ? new Date(status.lastBuild).toISOString() : null,
      commitSha: status.commitSha,
      serverPort: srv ? srv.port : null,
      serverRunning: srv ? srv.status === "running" : false,
      previewUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/"
    });
  }
});

// ── trigger_build ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "trigger_build",
  category: "deploy",
  description: "Trigger a rebuild or server restart for a specific branch deployment.",
  requires: [],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const config = getConfig();
    const repoConfig = config.repos.find((r) => r.owner === args.owner && r.repo === args.repo);
    if (!repoConfig) {
      return dv.failCode("REPO_NOT_FOUND", "Repository not found: " + args.owner + "/" + args.repo, {
        hint: "Call list_previews to see available repos.",
        availableRepos: config.repos.map((r) => r.owner + "/" + r.repo)
      });
    }
    const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === args.slug);
    if (!bc) {
      return dv.failCode("SLUG_NOT_FOUND", "Branch config not found for slug: " + args.slug, {
        hint: "Call list_previews to see slugs for this repo.",
        availableSlugs: (repoConfig.activeBranches || []).map(branchSlug)
      });
    }
    deployBranch(repoConfig, bc);
    // Invalidate read-only caches so next dv_state / build_status sees the new state.
    dv.invalidateCache("dv_state");
    dv.invalidateCache("list_previews");
    dv.invalidateCache("build_status");
    return dv.text(
      (bc.mode === "server" ? "Server restart" : "Build") +
      " triggered for " + args.owner + "/" + args.repo + ":" + args.slug
    );
  }
});

// ── get_build_log ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "get_build_log",
  category: "deploy",
  description: "Retrieve the full build log for a specific branch deployment.",
  requires: [],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const status = buildStatus[key];
    const log = (status && status.log) ? status.log : loadLog(key);
    if (!log) {
      return dv.failCode("NO_LOG", "No build log available for " + key, {
        hint: "Trigger a build first with trigger_build, then poll build_status.",
        key
      });
    }
    return dv.text(log);
  }
});

// ── deploy_and_verify ─────────────────────────────────────────────────────

dv.defineTool({
  name: "deploy_and_verify",
  category: "deploy",
  description: "One-shot deploy + verify. Triggers a build, polls until ready, then returns a screenshot, brief console log, and commit info. Replaces the typical trigger_build → build_status (x3) → screenshot flow.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      wait:   { type: "number" },
      width:  { type: "number" },
      height: { type: "number" },
      fullPage: { type: "boolean" },
      duration: { type: "number" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.deployAndVerify(args);
    if (result.error) {
      return dv.failFromBrowser(result, { logTail: result.log ? String(result.log).slice(-4000) : undefined });
    }
    const content = [];
    if (result.screenshot && result.screenshot.base64) {
      content.push({ type: "image", data: result.screenshot.base64, mimeType: result.screenshot.mimeType });
    }
    // eslint-disable-next-line no-unused-vars
    const { screenshot, ...meta } = result;
    content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
    return dv.makeResult(content);
  }
});

// ── run_test ──────────────────────────────────────────────────────────────

dv.defineTool({
  name: "run_test",
  category: "deploy",
  description: "Run the automated test harness on a deployed preview. Tests all tabs, buttons, inputs, toggles, dropdowns, and captures console errors. Returns structured results.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      mode: { type: "string", enum: ["full", "quick"] }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.runTest(args);
    if (result.error) return dv.failFromBrowser(result);
    const content = [];
    if (result.screenshot) {
      content.push({ type: "image", data: result.screenshot.base64, mimeType: result.screenshot.mimeType });
    }
    const statsLine = (result.stats || []).map((s) => s.label + ": " + s.value).join(", ");
    content.push({
      type: "text",
      text: (result.passed ? "✓ ALL PASSED" : "✗ FAILURES DETECTED") +
            " (" + result.mode + " test)\n" + statsLine + "\n\n" + result.fullLog
    });
    return dv.makeResult(content);
  }
});

// ── deployment_history ────────────────────────────────────────────────────
// List the recent successful builds for a branch — newest first. Each
// entry has a stable `id` you can pass to rollback. Lets Claude reason
// about "what was deployed when" without re-running anything.
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

// ── rollback ──────────────────────────────────────────────────────────────
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
    return dv.ok({ message: r.message, entry: r.entry, previewUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/" });
  }
});

// ── analyze_build_failure ─────────────────────────────────────────────────
// Heuristic regex pass over a failed build's log, classifying the failure
// into a small set of common categories with concrete fix suggestions.
// Saves Claude (and humans) from eyeballing 5MB of npm output.
const FAIL_PATTERNS = [
  { code: "MISSING_DEP",     re: /(?:Cannot find module|Module not found|ERR! 404 Not Found - GET).*?['"]?([@\w./-]+)['"]?/i,
    fix: function(m){ return "Install missing dependency: " + (m[1] || "<unknown>") + " — add it to package.json or run `npm install " + (m[1] || "<package>") + "`."; } },
  { code: "OOM",             re: /JavaScript heap out of memory|FATAL ERROR.*out of memory/i,
    fix: function(){ return "Build ran out of RAM. Set NODE_OPTIONS=--max-old-space-size=4096 in env vars, or reduce the build's memory footprint."; } },
  { code: "PORT_IN_USE",     re: /EADDRINUSE.*?:(\d+)|address already in use.*?:(\d+)/i,
    fix: function(m){ return "Port " + (m[1] || m[2] || "?") + " is already bound. DV's server-mode picks a free port automatically — make sure your start command honours $PORT."; } },
  { code: "SYNTAX_ERROR",    re: /SyntaxError:\s+([^\n]{1,200})/,
    fix: function(m){ return "Syntax error: " + (m[1] || "<see log>") + ". Check the latest commit's diff."; } },
  { code: "TYPESCRIPT_ERROR", re: /TS\d{4}:\s+([^\n]{1,200})/,
    fix: function(m){ return "TypeScript error: " + (m[1] || "<see log>") + ". Run `tsc --noEmit` locally to reproduce."; } },
  { code: "PERMISSION",      re: /EACCES|permission denied|operation not permitted/i,
    fix: function(){ return "Filesystem permission error. Check that the build process can write to its workspace directory."; } },
  { code: "NETWORK",         re: /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i,
    fix: function(){ return "Network error during build (likely npm registry or git fetch). Check internet/proxy and retry."; } },
  { code: "TOKEN_EXPIRED",   re: /401 Unauthorized|Bad credentials|token.*?invalid/i,
    fix: function(){ return "GitHub token rejected — rotate it in Settings → Secrets (needs `repo` scope, plus `workflow` for APK builds)."; } },
  { code: "BUILD_TIMEOUT",   re: /timed out|timeout exceeded|reached.*?timeout/i,
    fix: function(){ return "Build exceeded the runCmd 10-minute cap. Heavy builds can be split (skip optional deps, prebuild assets)."; } },
  { code: "DISK_FULL",       re: /ENOSPC|no space left/i,
    fix: function(){ return "Disk full. Run the workspace cleanup endpoint, or raise DV_MAX_HISTORY_PER_KEY to evict old snapshots faster."; } },
  { code: "MISSING_OUTPUT",  re: /WARNING: No output dir found/,
    fix: function(){ return "Build succeeded but DV couldn't find an output directory. Set `outputDir` explicitly in the branch config (e.g. `dist`, `build`, `out`)."; } }
];

dv.defineTool({
  name: "analyze_build_failure",
  category: "deploy",
  description:
    "Heuristic-classify the most recent build failure for a branch. Returns a structured " +
    "{cause, code, suggestion, matchingLines} so Claude can propose a fix without re-reading " +
    "the entire log. Falls back to the last 40 log lines if no pattern matches.",
  requires: [],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = args.owner + "/" + args.repo + ":" + args.slug;
    const status = buildStatus[key] || {};
    const log = (status.log) ? status.log : loadLog(key);
    if (!log) return dv.failCode("NO_LOG", "No build log to analyze for " + key);
    const matches = [];
    for (const p of FAIL_PATTERNS) {
      const m = log.match(p.re);
      if (m) {
        // Find ±2 lines of surrounding context for citation.
        const lines = log.split("\n");
        const matchedLineIdx = lines.findIndex((l) => p.re.test(l));
        const ctx = matchedLineIdx >= 0
          ? lines.slice(Math.max(0, matchedLineIdx - 1), matchedLineIdx + 3).join("\n")
          : m[0];
        matches.push({ code: p.code, suggestion: p.fix(m), matchedAt: matchedLineIdx, context: ctx });
      }
    }
    if (matches.length === 0) {
      const tail = log.split("\n").slice(-40).join("\n");
      return dv.ok({
        key,
        status: status.status || "unknown",
        cause: "UNKNOWN",
        suggestion: "No known failure pattern matched. Read the last 40 lines of the log for clues.",
        logTail: tail
      });
    }
    return dv.ok({
      key,
      status: status.status || "unknown",
      cause: matches[0].code,
      allMatches: matches,
      suggestion: matches[0].suggestion,
      hint: "Apply the suggestion, then trigger_build to retry."
    });
  }
});

// ── commit_changelog ──────────────────────────────────────────────────────
// Wraps GitHub's compare endpoint to give Claude an at-a-glance "what
// shipped between two SHAs" view. Useful after rollback + redeploy or
// for AI-generated release notes.
dv.defineTool({
  name: "commit_changelog",
  category: "deploy",
  description:
    "Fetch the commit list between two SHAs (or refs like branch names / tags) for a repo. " +
    "Returns commit messages, authors, and short SHAs — perfect for AI-generated release notes " +
    "or for understanding what changed between two deployments.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO,
      base: { type: "string", description: "Older ref (SHA, branch, tag)" },
      head: { type: "string", description: "Newer ref (SHA, branch, tag)" },
      maxCommits: { type: "number", description: "Cap returned commits (default 50)" }
    },
    required: ["owner", "repo", "base", "head"]
  },
  async handler(args) {
    const cfg = getConfig();
    if (!cfg.token) return dv.failCode("NO_TOKEN", "GitHub token not set in DV config");
    const max = Math.max(1, Math.min(Number(args.maxCommits) || 50, 250));
    try {
      const data = await ghApi("/repos/" + args.owner + "/" + args.repo + "/compare/" + encodeURIComponent(args.base) + "..." + encodeURIComponent(args.head), cfg.token);
      const commits = (data.commits || []).slice(0, max).map((c) => ({
        sha: (c.sha || "").slice(0, 7),
        author: c.commit && c.commit.author && c.commit.author.name,
        date: c.commit && c.commit.author && c.commit.author.date,
        message: (c.commit && c.commit.message || "").split("\n")[0],
        url: c.html_url
      }));
      return dv.ok({
        base: args.base, head: args.head,
        ahead: data.ahead_by, behind: data.behind_by,
        totalCommits: (data.commits || []).length,
        commits,
        truncated: (data.commits || []).length > max,
        compareUrl: data.html_url
      });
    } catch (e) {
      return dv.failCode("GITHUB_FAILED", e.message, { hint: "Verify both refs exist and the token has read access to this repo." });
    }
  }
});

// ── deploy_repo ───────────────────────────────────────────────────────────
// One-shot: add a repo if not already configured, fetch its branches,
// run framework detection, and trigger the initial build for the
// default branch. Replaces the typical "Add Repo" UI flow with a single
// MCP call so Claude can spin up a preview from a chat instruction.
dv.defineTool({
  name: "deploy_repo",
  category: "deploy",
  description:
    "End-to-end add-and-build: takes `owner/repo` (or full GitHub URL), adds it to DV if " +
    "missing, fetches branches, auto-detects the framework, and triggers a build for the " +
    "default branch (or any branch you specify). Returns the preview URL once the build " +
    "is queued. Idempotent — safe to call on already-configured repos.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      url:    { type: "string", description: "owner/repo or https://github.com/owner/repo URL" },
      owner:  OWNER,
      repo:   REPO,
      branches: { type: "array", items: { type: "string" }, description: "Optional explicit branch list. Defaults to repo's default branch." },
      mode:   { type: "string", enum: ["static", "server"], description: "Build mode (default: auto-detected)" },
      buildCommand: { type: "string" },
      outputDir:    { type: "string" }
    }
  },
  async handler(args) {
    let owner = args.owner, repo = args.repo;
    if ((!owner || !repo) && args.url) {
      const m = String(args.url).trim().replace(/\.git$/, "").replace(/\/$/, "")
        .match(/(?:github\.com\/)?([^\/]+)\/([^\/]+)$/);
      if (m) { owner = m[1]; repo = m[2]; }
    }
    if (!owner || !repo) return dv.failCode("BAD_ARGS", "Pass either {owner, repo} or {url: 'owner/repo'}");
    const cfg = getConfig();
    if (!cfg.token) return dv.failCode("NO_TOKEN", "GitHub token not set in DV config");
    // Fetch repo metadata + branches in parallel.
    let info, branches;
    try {
      [info, branches] = await Promise.all([
        ghApi("/repos/" + owner + "/" + repo, cfg.token),
        ghApi("/repos/" + owner + "/" + repo + "/branches?per_page=100", cfg.token)
      ]);
    } catch (e) {
      return dv.failCode("GITHUB_FAILED", e.message, { hint: "Check repo name + token scope (needs `repo` for private)." });
    }
    const defaultBranch = info.default_branch || "main";
    const targetBranches = (Array.isArray(args.branches) && args.branches.length) ? args.branches : [defaultBranch];
    // Validate every requested branch actually exists upstream.
    const branchNames = new Set((branches || []).map((b) => b.name));
    const missing = targetBranches.filter((b) => !branchNames.has(b));
    if (missing.length) return dv.failCode("BRANCH_NOT_FOUND", "Unknown branches: " + missing.join(", "), { availableBranches: Array.from(branchNames).slice(0, 50) });
    // Auto-detect framework on the default branch (best effort).
    let detected = null;
    try {
      const fd = require("../../framework-detect");
      const meta = await ghApi("/repos/" + owner + "/" + repo + "/contents/package.json?ref=" + encodeURIComponent(defaultBranch), cfg.token);
      if (meta && meta.content) {
        const pkg = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
        detected = fd.detect(pkg);
      }
    } catch (_) { /* no package.json or non-Node repo — fine */ }
    // Upsert the repo in config.
    if (!cfg.repos) cfg.repos = [];
    let repoConfig = cfg.repos.find((r) => r.owner === owner && r.repo === repo);
    if (!repoConfig) {
      repoConfig = {
        id: owner + "/" + repo,
        owner, repo,
        description: info.description || "",
        baseDir: "",
        buildCommand: args.buildCommand || (detected && detected.buildCommand) || "",
        outputDir:    args.outputDir    || (detected && detected.outputDir)    || "",
        mode: args.mode || (detected && detected.mode) || "static",
        startCommand: (detected && detected.startCommand) || "",
        envVars: "",
        activeBranches: []
      };
      cfg.repos.push(repoConfig);
    }
    // Add any new branches.
    const existingSlugs = new Set((repoConfig.activeBranches || []).map(branchSlug));
    for (const b of targetBranches) {
      const bc = { branch: b, baseDir: "", buildCommand: "", outputDir: "" };
      if (!existingSlugs.has(branchSlug(bc))) repoConfig.activeBranches.push(bc);
    }
    saveConfig();
    // Kick off builds.
    const triggered = [];
    for (const b of targetBranches) {
      const bc = repoConfig.activeBranches.find((x) => x.branch === b);
      if (!bc) continue;
      try {
        deployBranch(repoConfig, bc);
        triggered.push({
          branch: b,
          slug: branchSlug(bc),
          previewUrl: "/preview/" + owner + "/" + repo + "/" + branchSlug(bc) + "/"
        });
      } catch (e) {
        triggered.push({ branch: b, error: e.message });
      }
    }
    dv.invalidateCache("list_previews");
    dv.invalidateCache("dv_state");
    return dv.ok({
      owner, repo,
      defaultBranch,
      detectedFramework: detected && detected.framework || null,
      mode: repoConfig.mode,
      triggered,
      hint: "Poll build_status for each slug to watch the build, or call deploy_and_verify to wait + screenshot."
    });
  }
});
