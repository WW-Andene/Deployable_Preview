/**
 * dv/tools/deploy-basic.js — discovery + lifecycle + verify.
 *
 * The tools every workflow starts with:
 *   list_previews        what's deployed?
 *   build_status         is this build ready?
 *   trigger_build        start a (re)build
 *   get_build_log        full log text
 *   deploy_and_verify    one-shot trigger + wait + screenshot
 *   run_test             built-in E2E harness
 *
 * R4: extracted from deploy.js.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const { getConfig } = require("../../config");
const { buildStatus, branchSlug, deployBranch } = require("../../build");
const { runningServers } = require("../../process");
const { loadLog } = require("../../logs");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

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
    dv.invalidateCache("dv_state");
    dv.invalidateCache("list_previews");
    dv.invalidateCache("build_status");
    return dv.text(
      (bc.mode === "server" ? "Server restart" : "Build") +
      " triggered for " + args.owner + "/" + args.repo + ":" + args.slug
    );
  }
});

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
