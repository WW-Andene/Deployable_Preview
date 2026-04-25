/**
 * dv/tools/live.js — Claude's closest-to-live view of a running preview.
 *
 * MCP is synchronous, so Claude can't truly "watch" a stream. Instead
 * this tool captures N frames over K seconds and returns them as a
 * filmstrip in a single tool response. A human can view the live MJPEG
 * stream at /api/live/:owner/:repo/:slug served in parallel (see
 * server/routes/api/infra.js).
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const session = require("../session");
const { getSandbox } = require("./sandbox");

dv.defineTool({
  name: "live_burst",
  category: "sandbox",
  description:
    "Capture a rapid burst of screenshots over a short interval and return them all as a " +
    "filmstrip in one response. Closest MCP equivalent of a live view: lets Claude perceive " +
    "motion, transitions, and animated state without a dedicated streaming channel. " +
    "Accepts either (owner, repo, slug) directly or a sandboxId. For humans who want a real " +
    "stream, open /api/live/<owner>/<repo>/<slug> in a browser.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      sandboxId: { type: "string", description: "Use the sandbox's preview (alternative to owner/repo/slug)" },
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      frames:   { type: "number", description: "Number of frames to capture (default 6, max 30)" },
      intervalMs: { type: "number", description: "Delay between frames in ms (default 400, min 100, max 2000)" },
      width:  { type: "number" },
      height: { type: "number" }
    }
  },
  async handler(args) {
    let owner = args.owner, repo = args.repo, slug = args.slug;
    let width = args.width, height = args.height;
    if (args.sandboxId) {
      const sb = getSandbox(args.sandboxId);
      if (!sb) return dv.failCode("SANDBOX_NOT_FOUND", "No sandbox with id: " + args.sandboxId);
      owner = sb.owner; repo = sb.repo; slug = sb.slug;
      width = width || sb.width; height = height || sb.height;
    }
    if (!owner || !repo || !slug) {
      return dv.failCode("BAD_ARGS", "live_burst needs either sandboxId or owner+repo+slug");
    }

    const frameCount = Math.max(1, Math.min(Number(args.frames) || 6, 30));
    const intervalMs = Math.max(100, Math.min(Number(args.intervalMs) || 400, 2000));

    const content = [];
    const meta = [];
    const started = Date.now();
    for (let i = 0; i < frameCount; i++) {
      const shotStart = Date.now();
      const shot = await browser.takeScreenshot({
        owner, repo, slug, width: width || 1280, height: height || 720, fullPage: false
      });
      if (shot.error) {
        return dv.failCode("BURST_FAILED", shot.error, {
          hint: "Verify the preview is running (build_status / dv_state).",
          frameIndex: i,
          framesCaptured: meta.length
        });
      }
      content.push({ type: "image", data: shot.base64, mimeType: shot.mimeType || "image/png" });
      meta.push({ index: i, tSinceStartMs: shotStart - started, url: shot.url, bytes: shot.base64.length });
      if (i < frameCount - 1) await new Promise(function(r){ setTimeout(r, intervalMs); });
    }
    content.push({
      type: "text",
      text: JSON.stringify({
        owner, repo, slug,
        frames: frameCount,
        intervalMs,
        totalDurationMs: Date.now() - started,
        frameMeta: meta
      }, null, 2)
    });
    return dv.makeResult(content);
  }
});
