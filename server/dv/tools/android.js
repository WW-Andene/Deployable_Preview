/**
 * dv/tools/android.js — live Android app interaction.
 *
 * Mirrors interact.js/visual.js but targets a real running app on a
 * GitHub-Actions-hosted emulator (see android-session.js) instead of a
 * browser-rendered preview. android_start/android_stop manage the
 * session; android_tap/swipe/type/key/screenshot drive it once ready.
 */

"use strict";

const dv = require("../core");
const { sessionStatus, startSession, stopSession, bridgeRequest } = require("../../android-session");

function keyOf(args) { return args.owner + "/" + args.repo + ":" + args.slug; }

dv.defineTool({
  name: "android_start",
  category: "deploy",
  description: [
    "Start a live Android emulator session for a native Kotlin/Android branch — builds the debug APK,",
    "boots a KVM emulator on GitHub Actions, installs + launches the app, and exposes it for",
    "android_screenshot/android_tap/android_swipe/android_type/android_key. Takes ~3-6 min to come up.",
    "Call android_start once, then poll with android_status until status is 'ready'."
  ].join("\n"),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      workingDir: { type: "string", description: "Subdirectory containing settings.gradle, default repo root" },
      timeoutMinutes: { type: "number", description: "Max session length, default 90" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = keyOf(args);
    if (sessionStatus[key] && ["starting", "ready"].includes(sessionStatus[key].status)) {
      return dv.fail("Session already " + sessionStatus[key].status + " for " + key);
    }
    startSession(args.owner, args.repo, args.slug, args.workingDir || ".", args.timeoutMinutes || 90);
    return dv.jsonText({ ok: true, message: "Session starting — poll android_status" });
  }
});

dv.defineTool({
  name: "android_status",
  category: "deploy",
  description: "Poll the live Android session's status/log (starting / ready / error / stopped).",
  schema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" } },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const st = sessionStatus[keyOf(args)] || { status: "idle" };
    const { bridgeToken, ...safe } = st;
    return dv.jsonText(safe);
  }
});

dv.defineTool({
  name: "android_stop",
  category: "deploy",
  description: "Stop the live Android session (cancels the underlying GitHub Actions run).",
  schema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" } },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    await stopSession(args.owner, args.repo, args.slug);
    return dv.jsonText({ ok: true });
  }
});

dv.defineTool({
  name: "android_screenshot",
  category: "visual",
  description: "Screenshot the running app on the live Android session. Requires android_start to have reached 'ready'.",
  schema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" } },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    try {
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/screenshot");
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_tap",
  category: "interact",
  description: "Tap a point on the live Android app screen. Returns a screenshot after the tap.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      x: { type: "number" }, y: { type: "number" }
    },
    required: ["owner", "repo", "slug", "x", "y"]
  },
  async handler(args) {
    try {
      await bridgeRequest(keyOf(args), "POST", "/tap", { x: args.x, y: args.y });
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/screenshot");
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_swipe",
  category: "interact",
  description: "Swipe from (x1,y1) to (x2,y2) on the live Android app. Returns a screenshot after the swipe.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
      durationMs: { type: "number" }
    },
    required: ["owner", "repo", "slug", "x1", "y1", "x2", "y2"]
  },
  async handler(args) {
    try {
      await bridgeRequest(keyOf(args), "POST", "/swipe", { x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2, durationMs: args.durationMs || 300 });
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/screenshot");
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_type",
  category: "interact",
  description: "Type text into the focused field on the live Android app. Returns a screenshot after typing.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      text: { type: "string" }
    },
    required: ["owner", "repo", "slug", "text"]
  },
  async handler(args) {
    try {
      await bridgeRequest(keyOf(args), "POST", "/text", { text: args.text });
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/screenshot");
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_key",
  category: "interact",
  description: "Send an Android keyevent code (e.g. 4=BACK, 66=ENTER, 67=DEL) to the live session. Returns a screenshot after.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      keycode: { type: "number", description: "Android KEYCODE_* integer value" }
    },
    required: ["owner", "repo", "slug", "keycode"]
  },
  async handler(args) {
    try {
      await bridgeRequest(keyOf(args), "POST", "/key", { keycode: args.keycode });
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/screenshot");
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_ui_dump",
  category: "audit",
  description: "Dump the current Android UI hierarchy (uiautomator XML) — element bounds/text/resource-ids for locating tap targets precisely.",
  schema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" } },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    try {
      const { buffer } = await bridgeRequest(keyOf(args), "GET", "/ui");
      return dv.text(buffer.toString("utf8"));
    } catch (e) { return dv.fail(e.message); }
  }
});

module.exports = {};
