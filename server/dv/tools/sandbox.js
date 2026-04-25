/**
 * dv/tools/sandbox.js — persistent, pinned DV sandboxes.
 *
 * A "sandbox" is a named, long-lived reference to one deployed preview
 * (owner/repo/slug). It's a thin layer over the existing session pool in
 * dv/session.js: every tool call against the same slug already shares a
 * page, so "sandbox" mostly delivers:
 *
 *   1. `sandbox_exec` — batch many tool calls in one round-trip. Huge
 *      win for Claude: instead of N MCP round-trips, submit an array and
 *      get N results back.
 *   2. Short, stable handles (`sb_xyz`) so Claude doesn't have to repeat
 *      owner/repo/slug on every call.
 *   3. Explicit lifecycle (start/close) + state inspection.
 *   4. A place to hang per-sandbox notes/scratch state.
 */

"use strict";

const crypto = require("crypto");
const dv = require("../core");
const browser = require("../../browser");
const session = require("../session");
const { branchSlug } = require("../../build");
const { getConfig } = require("../../config");

// In-memory sandbox registry. Lost on server restart (by design — they're
// session-scoped, not durable state).
const sandboxes = new Map();

function newId() {
  return "sb_" + crypto.randomBytes(4).toString("hex");
}

function getSandbox(id) {
  const sb = sandboxes.get(id);
  if (!sb) return null;
  sb.lastUsed = Date.now();
  return sb;
}

// ── sandbox_start ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_start",
  category: "sandbox",
  description:
    "Open a sandbox session bound to a specific deployed preview. Returns a stable `sandboxId` " +
    "you can pass to sandbox_exec / sandbox_state / sandbox_close. Under the hood this reuses " +
    "the existing session pool, so state (cookies, localStorage, scroll position, modals) persists " +
    "across every call made with the same sandboxId.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo:  { type: "string" },
      slug:  { type: "string" },
      width:  { type: "number", description: "Initial viewport width (default 1280)" },
      height: { type: "number", description: "Initial viewport height (default 720)" },
      note:   { type: "string", description: "Optional label shown in sandbox_list" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const config = getConfig();
    const repoCfg = (config.repos || []).find(function(r) { return r.owner === args.owner && r.repo === args.repo; });
    if (!repoCfg) {
      return dv.failCode("REPO_NOT_FOUND", "Repository not configured: " + args.owner + "/" + args.repo, {
        hint: "Call list_previews to see available owner/repo/slug triples."
      });
    }
    const known = (repoCfg.activeBranches || []).map(branchSlug);
    if (!known.includes(args.slug)) {
      return dv.failCode("SLUG_NOT_FOUND", "Unknown slug: " + args.slug, {
        availableSlugs: known,
        hint: "Use one of the listed slugs, or configure the branch in the dashboard."
      });
    }

    const id = newId();
    sandboxes.set(id, {
      id,
      owner: args.owner, repo: args.repo, slug: args.slug,
      width: args.width || 1280,
      height: args.height || 720,
      note: args.note || "",
      createdAt: Date.now(),
      lastUsed: Date.now(),
      execCount: 0,
      transcript: [] // ring buffer of recent {tool, args, ok, textPreview, t}
    });

    // Warm the page so subsequent calls are fast.
    try {
      const b = await browser.getBrowser ? await browser.getBrowser() : null;
      if (b && session.getSessionPage) {
        await session.getSessionPage(b, args.owner, args.repo, args.slug, args.width, args.height);
      }
    } catch (e) {
      // Starting without a live page is OK — user might be about to trigger a build.
      return dv.ok({
        sandboxId: id,
        owner: args.owner, repo: args.repo, slug: args.slug,
        warmed: false,
        warning: "Session could not be warmed: " + e.message
      });
    }

    return dv.ok({
      sandboxId: id,
      owner: args.owner, repo: args.repo, slug: args.slug,
      viewport: { width: args.width || 1280, height: args.height || 720 },
      warmed: true,
      hint: "Use sandbox_exec with this sandboxId to batch many tools in one round-trip."
    });
  }
});

// ── sandbox_exec ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_exec",
  category: "sandbox",
  description:
    "Batch-run an array of tool calls against a sandbox in one round-trip. Each call's " +
    "owner/repo/slug is auto-filled from the sandbox; individual calls can override. " +
    "Calls run sequentially against the same browser page, so later calls see the state " +
    "left by earlier ones. Set `stopOnError:true` to abort the sequence on the first failure.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      sandboxId:   { type: "string" },
      calls: {
        type: "array",
        description: "Ordered list of tool invocations: [{tool: 'screenshot', args: {...}}, ...]",
        items: {
          type: "object",
          properties: {
            tool: { type: "string" },
            args: { type: "object" }
          },
          required: ["tool"]
        }
      },
      stopOnError: { type: "boolean", description: "Abort on first failure (default false)" },
      includeImages: { type: "boolean", description: "Include image content from image-returning tools (default true). Set false to save tokens when only metadata matters." },
      maxImages:    { type: "number",  description: "Cap total images in the response (oldest dropped). Default 12." },
      maxBytes:     { type: "number",  description: "Cap total base64 bytes across images. Default 8 MB." }
    },
    required: ["sandboxId", "calls"]
  },
  async handler(args) {
    const sb = getSandbox(args.sandboxId);
    if (!sb) {
      return dv.failCode("SANDBOX_NOT_FOUND", "No sandbox with id: " + args.sandboxId, {
        hint: "Call sandbox_start first, or sandbox_list to see active sandboxes.",
        active: Array.from(sandboxes.keys())
      });
    }
    const calls = Array.isArray(args.calls) ? args.calls : [];
    if (!calls.length) {
      return dv.failCode("BAD_ARGS", "`calls` must be a non-empty array", {
        example: { sandboxId: args.sandboxId, calls: [{ tool: "screenshot" }, { tool: "inspect" }] }
      });
    }
    const stopOnError = !!args.stopOnError;
    const includeImages = args.includeImages !== false;
    const maxImages = Math.max(0, Math.min(Number(args.maxImages) || 12, 60));
    const maxBytes  = Math.max(256 * 1024, Number(args.maxBytes) || 8 * 1024 * 1024);

    const results = [];
    const aggregated = [];
    let aggregatedBytes = 0;
    let droppedImages = 0;
    let failedAt = -1;

    for (let i = 0; i < calls.length; i++) {
      const c = calls[i] || {};
      if (typeof c.tool !== "string" || !c.tool) {
        results.push({ index: i, tool: null, ok: false, error: "Missing `tool` field" });
        if (stopOnError) { failedAt = i; break; }
        continue;
      }
      const callArgs = Object.assign(
        { owner: sb.owner, repo: sb.repo, slug: sb.slug, width: sb.width, height: sb.height },
        c.args || {}
      );
      const tStart = Date.now();
      let r;
      try { r = await dv.callTool(c.tool, callArgs); }
      catch (e) { r = dv.failCode("INTERNAL", e.message); }

      const ok = !r.isError;
      // Extract the text payload for the summary; keep images for the aggregated content (but only if desired)
      const textBlocks = (r.content || []).filter(function(x){ return x.type === "text"; }).map(function(x){ return x.text; });
      const imageCount = (r.content || []).filter(function(x){ return x.type === "image"; }).length;
      const firstText = textBlocks[0] || null;

      const row = {
        index: i,
        tool: c.tool,
        ok,
        text: textBlocks.length ? textBlocks.join("\n") : null,
        images: imageCount,
        durationMs: Date.now() - tStart
      };
      results.push(row);

      // Append to sandbox transcript (ring buffer, 50 entries)
      sb.transcript.push({
        t: Date.now(),
        tool: c.tool,
        args: c.args || null,
        ok,
        durationMs: row.durationMs,
        textPreview: firstText ? String(firstText).slice(0, 300) : null,
        images: imageCount
      });
      if (sb.transcript.length > 50) sb.transcript.splice(0, sb.transcript.length - 50);

      if (includeImages) {
        for (const block of (r.content || [])) {
          if (block.type !== "image") continue;
          const size = block.data ? block.data.length : 0;
          if (aggregated.length >= maxImages || aggregatedBytes + size > maxBytes) {
            droppedImages++;
            continue;
          }
          aggregated.push(block);
          aggregatedBytes += size;
        }
      }

      if (!ok && stopOnError) { failedAt = i; break; }
    }

    sb.execCount += calls.length;
    sb.lastUsed = Date.now();

    const summary = {
      sandboxId: sb.id,
      owner: sb.owner, repo: sb.repo, slug: sb.slug,
      called: results.length,
      succeeded: results.filter(function(r){ return r.ok; }).length,
      failed: results.filter(function(r){ return !r.ok; }).length,
      stoppedEarly: failedAt >= 0,
      imagesIncluded: aggregated.length,
      imagesDropped: droppedImages,
      imageBytes: aggregatedBytes,
      results,
      hint: droppedImages > 0
        ? "Some images were dropped to stay under maxImages/maxBytes. Re-run individual calls or raise the cap."
        : undefined
    };

    if (aggregated.length) {
      aggregated.push({ type: "text", text: JSON.stringify(summary, null, 2) });
      return dv.makeResult(aggregated);
    }
    return dv.ok(summary);
  }
});

// ── sandbox_log ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_log",
  category: "sandbox",
  description: "Return the transcript (last 50 calls) for a sandbox: tool name, args, ok/fail, duration, 300-char text preview. Useful when you want to remind yourself what you already ran before issuing the next call.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      sandboxId: { type: "string" },
      limit:     { type: "number", description: "Max entries to return (default 20, max 50)" }
    },
    required: ["sandboxId"]
  },
  async handler(args) {
    const sb = getSandbox(args.sandboxId);
    if (!sb) return dv.failCode("SANDBOX_NOT_FOUND", "No sandbox with id: " + args.sandboxId);
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
    const tail = sb.transcript.slice(-limit).map(function(e) {
      return Object.assign({}, e, { iso: new Date(e.t).toISOString() });
    });
    return dv.ok({ sandboxId: sb.id, totalCalls: sb.execCount, shown: tail.length, entries: tail });
  }
});

// ── sandbox_state ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_state",
  category: "sandbox",
  description:
    "Read the current state of a sandbox's browser page: URL, viewport, title, scroll position, " +
    "and (depending on reveal level) cookie/storage names or values. " +
    "reveal levels:\n" +
    "  'none' — URL, title, viewport, scroll, readyState, form/input/iframe counts only.\n" +
    "  'keys-only' (default) — also the KEYS of cookies / localStorage / sessionStorage (no values).\n" +
    "  'values' — also the VALUES. Only use if you know the preview doesn't hold sensitive data.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      sandboxId: { type: "string" },
      reveal:    { type: "string", enum: ["none", "keys-only", "values"], description: "How much cookie/storage detail to include (default keys-only)" }
    },
    required: ["sandboxId"]
  },
  async handler(args) {
    const sb = getSandbox(args.sandboxId);
    if (!sb) return dv.failCode("SANDBOX_NOT_FOUND", "No sandbox with id: " + args.sandboxId);

    const reveal = (["none", "keys-only", "values"].includes(args.reveal) ? args.reveal : "keys-only");

    const alwaysProbe = [
      "url: location.href",
      "title: document.title",
      "scroll: { x: window.scrollX, y: window.scrollY }",
      "viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }",
      "readyState: document.readyState",
      "formsCount: document.forms.length",
      "inputsCount: document.querySelectorAll('input,select,textarea').length",
      "framesCount: document.querySelectorAll('iframe').length"
    ];
    const keyProbe = [
      "cookieKeys: document.cookie.split(';').map(function(p){return (p.split('=')[0]||'').trim();}).filter(Boolean)",
      "localStorageKeys: Object.keys(localStorage || {})",
      "sessionStorageKeys: Object.keys(sessionStorage || {})"
    ];
    const valueProbe = [
      "cookies: document.cookie",
      "localStorageEntries: Object.keys(localStorage||{}).reduce(function(o,k){o[k]=localStorage.getItem(k);return o;},{})",
      "sessionStorageEntries: Object.keys(sessionStorage||{}).reduce(function(o,k){o[k]=sessionStorage.getItem(k);return o;},{})"
    ];
    const fields = alwaysProbe.slice();
    if (reveal === "keys-only" || reveal === "values") fields.push.apply(fields, keyProbe);
    if (reveal === "values") fields.push.apply(fields, valueProbe);
    const code = "({ " + fields.join(", ") + " })";

    const r = await browser.pageEval({
      owner: sb.owner, repo: sb.repo, slug: sb.slug, width: sb.width, height: sb.height,
      code, captureLogs: false, timeout: 5000
    });
    if (r.error) return dv.failCode("STATE_READ_FAILED", r.error);
    let state;
    try { state = JSON.parse(r.result); } catch (_) { state = r.result; }
    return dv.ok({
      sandboxId: sb.id,
      owner: sb.owner, repo: sb.repo, slug: sb.slug,
      createdAt: new Date(sb.createdAt).toISOString(),
      ageSeconds: Math.round((Date.now() - sb.createdAt) / 1000),
      execCount: sb.execCount,
      note: sb.note,
      reveal,
      page: state,
      hint: reveal === "values" ? "You asked for storage values — treat these as sensitive." : undefined
    });
  }
});

// ── sandbox_list ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_list",
  category: "sandbox",
  description: "List all currently active sandboxes with their owner/repo/slug, age, and exec count.",
  requires: [],
  schema: { type: "object", properties: {}, required: [] },
  async handler() {
    const list = Array.from(sandboxes.values()).map(function(sb) {
      return {
        sandboxId: sb.id,
        owner: sb.owner, repo: sb.repo, slug: sb.slug,
        note: sb.note || null,
        createdAt: new Date(sb.createdAt).toISOString(),
        lastUsedAt: new Date(sb.lastUsed).toISOString(),
        ageSeconds: Math.round((Date.now() - sb.createdAt) / 1000),
        execCount: sb.execCount,
        viewport: { width: sb.width, height: sb.height }
      };
    });
    return dv.ok({ count: list.length, sandboxes: list });
  }
});

// ── sandbox_close ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "sandbox_close",
  category: "sandbox",
  description: "Close a sandbox and its underlying browser page session. Use when you're done to free resources.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      sandboxId: { type: "string" },
      keepSession: { type: "boolean", description: "If true, keep the browser session alive (just drop the sandbox handle)" }
    },
    required: ["sandboxId"]
  },
  async handler(args) {
    const sb = sandboxes.get(args.sandboxId);
    if (!sb) return dv.failCode("SANDBOX_NOT_FOUND", "No sandbox with id: " + args.sandboxId);
    sandboxes.delete(args.sandboxId);
    if (!args.keepSession) {
      try { session.closeSession(sb.owner, sb.repo, sb.slug); } catch (_) {}
    }
    return dv.ok({ closed: args.sandboxId, owner: sb.owner, repo: sb.repo, slug: sb.slug, sessionDropped: !args.keepSession });
  }
});

// Expose for sibling modules (live stream needs to resolve sandbox → slug)
module.exports = { getSandbox, sandboxes };
