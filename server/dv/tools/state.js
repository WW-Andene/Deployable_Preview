/**
 * dv/tools/state.js — session state tools.
 *
 * Everything that reads or writes persistent browser state: viewport /
 * DPR / colour scheme / geolocation / network throttling (emulate),
 * cookies + local/session storage (storage), the clipboard, full cookie
 * parsing, and session resets.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");
const enrich = require("../../mcp-enrichments");

const OWNER = { type: "string" };
const REPO  = { type: "string" };
const SLUG  = { type: "string" };

// ── emulate ───────────────────────────────────────────────────────────────

dv.defineTool({
  name: "emulate",
  category: "state",
  description: "Apply environment emulation to a preview session: DPR, colour scheme (dark/light), reduced motion, touch, geolocation, custom User-Agent, and network throttling (offline / slow / latency). Sticky for the lifetime of the session.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      deviceScaleFactor: { type: "number" },
      colorScheme: { type: "string", enum: ["light", "dark", "no-preference"] },
      reducedMotion: { type: "string", enum: ["reduce", "no-preference"] },
      touch: { type: "boolean" },
      geolocation: {
        type: "object",
        properties: {
          latitude:  { type: "number" },
          longitude: { type: "number" },
          accuracy:  { type: "number" }
        }
      },
      offline: { type: "boolean" },
      downloadThroughput: { type: "number" },
      uploadThroughput: { type: "number" },
      latency: { type: "number" },
      userAgent: { type: "string" },
      width:  { type: "number" },
      height: { type: "number" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.emulate(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── storage ───────────────────────────────────────────────────────────────

dv.defineTool({
  name: "storage",
  category: "state",
  description: "Read or write cookies, localStorage, or sessionStorage on a preview session. Ops: list, get, set, delete, clear.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      store: { type: "string", enum: ["cookies", "localStorage", "sessionStorage"] },
      op:    { type: "string", enum: ["list", "get", "set", "delete", "clear"] },
      key:   { type: "string" },
      value: { type: "string" },
      cookie: {
        type: "object",
        properties: {
          name:    { type: "string" },
          value:   { type: "string" },
          domain:  { type: "string" },
          path:    { type: "string" },
          expires: { type: "number" }
        }
      }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.storage(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── clipboard ─────────────────────────────────────────────────────────────

dv.defineTool({
  name: "clipboard",
  category: "state",
  description: "Read or write the browser clipboard inside a preview session. Grants clipboard permissions automatically.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      op: { type: "string", enum: ["read", "write"] },
      value: { type: "string" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.clipboard(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── cookies_full ──────────────────────────────────────────────────────────

dv.defineTool({
  name: "cookies_full",
  category: "state",
  description: "Parse Set-Cookie headers and cookie strings with set-cookie-parser + tough-cookie — returns full flag details (httpOnly, secure, sameSite, expires, domain, path).",
  requires: [{ kind: "library", name: ["set-cookie-parser", "tough-cookie"] }],
  schema: {
    type: "object",
    properties: {
      setCookieHeaders: { type: "array", items: { type: "string" } },
      cookies: { type: "array", items: { type: "string" } }
    }
  },
  async handler(args) {
    const out = {};
    if (args.setCookieHeaders) out.setCookieHeaders = enrich.parseSetCookie(args.setCookieHeaders);
    if (args.cookies) out.cookies = enrich.parseCookieJar(args.cookies);
    return dv.ok(out);
  }
});

// ── reset_session ─────────────────────────────────────────────────────────

dv.defineTool({
  name: "reset_session",
  category: "state",
  description: "Reset the persistent browser session for a preview. Clears page state (localStorage, cookies, modals) and starts fresh. If no owner/repo/slug given, resets all sessions.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: { owner: OWNER, repo: REPO, slug: SLUG }
  },
  async handler(args) {
    if (args.owner && args.repo && args.slug) {
      const closed = browser.closeSession(args.owner, args.repo, args.slug);
      return dv.text(closed
        ? "Session reset for " + args.owner + "/" + args.repo + "/" + args.slug
        : "No active session for " + args.owner + "/" + args.repo + "/" + args.slug);
    }
    browser.closeAllSessions();
    return dv.text("All browser sessions reset.");
  }
});
