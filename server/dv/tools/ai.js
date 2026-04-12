/**
 * dv/tools/ai.js — Groq-backed visual reasoning.
 *
 * These tools offload visual reasoning to Groq vision models so Claude
 * never has to inhale pixels — it gets text answers only. Every tool
 * here requires GROQ_API_KEY AND preferences.claudeGroqAccess not
 * explicitly set to false. The capability gate is the single source of
 * truth for authorization.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── visual_query ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "visual_query",
  category: "ai",
  description: "Ask Groq a natural-language question about a preview screenshot. Claude gets the text answer — no pixels in its context. Good for: 'is there an error banner visible?', 'what does the heading say?', 'how many products are shown?'.",
  requires: [{ kind: "browser" }, { kind: "groq" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      question: { type: "string" },
      fullPage: { type: "boolean" },
      model: { type: "string" },
      maxTokens: { type: "number" }
    },
    required: ["owner", "repo", "slug", "question"]
  },
  async handler(args) {
    const result = await browser.visualQuery(args);
    if (result.error) return dv.fail(result.error);
    return dv.text(result.text || "(no answer)");
  }
});

// ── find_element ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "find_element",
  category: "ai",
  description: "Use Groq to locate an element visually from a natural-language description. Returns approximate bounding box and confidence. Good for 'the login button', 'the red error text'.",
  requires: [{ kind: "browser" }, { kind: "groq" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      description: { type: "string" },
      model: { type: "string" }
    },
    required: ["owner", "repo", "slug", "description"]
  },
  async handler(args) {
    const result = await browser.findElementVisually(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── visual_diff ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "visual_diff",
  category: "ai",
  description: "Take two screenshots of a preview around an optional action and ask Groq to describe what changed in words. Much cheaper context-wise than sending both screenshots to Claude.",
  requires: [{ kind: "browser" }, { kind: "groq" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      action: {
        type: "object",
        properties: {
          action: { type: "string" },
          selector: { type: "string" },
          value: { type: "string" },
          x: { type: "number" }, y: { type: "number" }
        }
      },
      waitMs: { type: "number" },
      model: { type: "string" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.visualDiffWithAction(args);
    if (result.error) return dv.fail(result.error);
    return dv.text(result.summary || "(no summary)");
  }
});

// ── verify_loop ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "verify_loop",
  category: "ai",
  description: "Run an evaluate → screenshot → Groq-check cycle in a loop until a natural-language success condition is met. Returns a text summary of attempts. Use when dialling in a visual state.",
  requires: [{ kind: "browser" }, { kind: "groq" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      condition: { type: "string" },
      evaluate: { type: "string" },
      action: { type: "object" },
      maxAttempts: { type: "number" },
      delayMs: { type: "number" },
      settleMs: { type: "number" },
      model: { type: "string" },
      returnScreenshot: { type: "boolean" }
    },
    required: ["owner", "repo", "slug", "condition"]
  },
  async handler(args) {
    const result = await browser.runVerifyLoop(args);
    if (result.error) return dv.fail(result.error);
    const content = [];
    if (args.returnScreenshot && result.finalScreenshot) {
      content.push({ type: "image", data: result.finalScreenshot, mimeType: "image/png" });
    }
    // eslint-disable-next-line no-unused-vars
    const { finalScreenshot, ...meta } = result;
    content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
    return dv.makeResult(content);
  }
});
