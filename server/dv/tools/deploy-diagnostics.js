/**
 * dv/tools/deploy-diagnostics.js — failure analysis + GitHub helpers.
 *
 *   analyze_build_failure   regex-classify a failed build log
 *   commit_changelog        GitHub compare-commits between two refs
 *   deploy_repo             one-shot upsert + framework-detect + build
 *
 * R4: extracted from deploy.js.
 */

"use strict";

const dv = require("../core");
const { getConfig, saveConfig } = require("../../config");
const { buildStatus, branchSlug, deployBranch } = require("../../build");
const { loadLog } = require("../../logs");
const { ghApi } = require("../../github");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── analyze_build_failure ────────────────────────────────────────────────
// Eleven heuristic patterns. Each match contributes (code, suggestion,
// ±2 lines of context). First match wins as the cause; the full set is
// returned in `allMatches` so Claude can reason about secondary issues.
const FAIL_PATTERNS = [
  { code: "MISSING_DEP",     re: /(?:Cannot find module|Module not found|ERR! 404 Not Found - GET).*?['"]?([@\w./-]+)['"]?/i,
    fix: (m) => "Install missing dependency: " + (m[1] || "<unknown>") + " — add it to package.json or run `npm install " + (m[1] || "<package>") + "`." },
  { code: "OOM",             re: /JavaScript heap out of memory|FATAL ERROR.*out of memory/i,
    fix: () => "Build ran out of RAM. Set NODE_OPTIONS=--max-old-space-size=4096 in env vars, or reduce the build's memory footprint." },
  { code: "PORT_IN_USE",     re: /EADDRINUSE.*?:(\d+)|address already in use.*?:(\d+)/i,
    fix: (m) => "Port " + (m[1] || m[2] || "?") + " is already bound. DV's server-mode picks a free port automatically — make sure your start command honours $PORT." },
  { code: "SYNTAX_ERROR",    re: /SyntaxError:\s+([^\n]{1,200})/,
    fix: (m) => "Syntax error: " + (m[1] || "<see log>") + ". Check the latest commit's diff." },
  { code: "TYPESCRIPT_ERROR", re: /TS\d{4}:\s+([^\n]{1,200})/,
    fix: (m) => "TypeScript error: " + (m[1] || "<see log>") + ". Run `tsc --noEmit` locally to reproduce." },
  { code: "PERMISSION",      re: /EACCES|permission denied|operation not permitted/i,
    fix: () => "Filesystem permission error. Check that the build process can write to its workspace directory." },
  { code: "NETWORK",         re: /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i,
    fix: () => "Network error during build (likely npm registry or git fetch). Check internet/proxy and retry." },
  { code: "TOKEN_EXPIRED",   re: /401 Unauthorized|Bad credentials|token.*?invalid/i,
    fix: () => "GitHub token rejected — rotate it in Settings → Secrets (needs `repo` scope, plus `workflow` for APK builds)." },
  { code: "BUILD_TIMEOUT",   re: /timed out|timeout exceeded|reached.*?timeout/i,
    fix: () => "Build exceeded the runCmd 10-minute cap. Heavy builds can be split (skip optional deps, prebuild assets)." },
  { code: "DISK_FULL",       re: /ENOSPC|no space left/i,
    fix: () => "Disk full. Run the workspace cleanup endpoint, or raise DV_MAX_HISTORY_PER_KEY to evict old snapshots faster." },
  { code: "MISSING_OUTPUT",  re: /WARNING: No output dir found/,
    fix: () => "Build succeeded but DV couldn't find an output directory. Set `outputDir` explicitly in the branch config (e.g. `dist`, `build`, `out`)." }
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
        key, status: status.status || "unknown",
        cause: "UNKNOWN",
        suggestion: "No known failure pattern matched. Read the last 40 lines of the log for clues.",
        logTail: tail
      });
    }
    return dv.ok({
      key, status: status.status || "unknown",
      cause: matches[0].code,
      allMatches: matches,
      suggestion: matches[0].suggestion,
      hint: "Apply the suggestion, then trigger_build to retry."
    });
  }
});

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
      const data = await ghApi(
        "/repos/" + args.owner + "/" + args.repo + "/compare/" +
        encodeURIComponent(args.base) + "..." + encodeURIComponent(args.head),
        cfg.token
      );
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

    if (!cfg.repos) cfg.repos = [];
    let repoConfig = cfg.repos.find((r) => r.owner === owner && r.repo === repo);
    if (!repoConfig) {
      repoConfig = {
        id: owner + "/" + repo, owner, repo,
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
    const existingSlugs = new Set((repoConfig.activeBranches || []).map(branchSlug));
    for (const b of targetBranches) {
      const bc = { branch: b, baseDir: "", buildCommand: "", outputDir: "" };
      if (!existingSlugs.has(branchSlug(bc))) repoConfig.activeBranches.push(bc);
    }
    saveConfig();

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
      owner, repo, defaultBranch,
      detectedFramework: detected && detected.framework || null,
      mode: repoConfig.mode,
      triggered,
      hint: "Poll build_status for each slug to watch the build, or call deploy_and_verify to wait + screenshot."
    });
  }
});
