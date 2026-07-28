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
      // The bridge now returns the resulting screenshot directly from the
      // POST itself — no separate GET /screenshot needed. Halves the
      // round-trips through the tunnel + GitHub Actions runner per call.
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/tap", { x: args.x, y: args.y });
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
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/swipe", { x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2, durationMs: args.durationMs || 300 });
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
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/text", { text: args.text });
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
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/key", { keycode: args.keycode });
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

dv.defineTool({
  name: "android_tap_element",
  category: "interact",
  description: [
    "Tap a UI element by its exact text or resource-id instead of pixel coordinates — resolved from a fresh",
    "uiautomator dump, so it doesn't depend on reading a screenshot first. Fails with a clear error if no",
    "element matches, rather than silently tapping the wrong spot. Returns a screenshot after the tap."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      text: { type: "string", description: "Exact visible text of the target element" },
      resourceId: { type: "string", description: "Exact android:id resource-id of the target element (e.g. com.app:id/submit_button)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    if (!args.text && !args.resourceId) return dv.fail("Provide text or resourceId");
    try {
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/tap_element", { text: args.text, resourceId: args.resourceId });
      if (contentType && contentType.indexOf("json") !== -1) {
        return dv.fail(JSON.parse(buffer.toString("utf8")).error || "Element not found");
      }
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_logcat",
  category: "audit",
  description: "Read recent logcat output from the live session — the app's own console/exception output, for auditing what the running code actually did instead of only what it visually shows.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      lines: { type: "number", description: "Max lines to return, default 300" },
      pkg: { type: "string", description: "Filter to one process's PID (e.g. the app's package name) — omit for the full system log" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    try {
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/logcat", { lines: args.lines || 300, pkg: args.pkg });
      const parsed = JSON.parse(buffer.toString("utf8"));
      return dv.text(parsed.log || "");
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_shell",
  category: "audit",
  description: [
    "Run an arbitrary `adb shell` command on the live session's emulator — dumpsys, pm, content query,",
    "am start with a deep-link URI to jump straight to a screen/feature, etc. This is throwaway CI",
    "infrastructure scoped to one session, not the user's real device — safe to be broad with it.",
    "Returns stdout/stderr/exitCode, no screenshot (use android_screenshot separately if you need one)."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      cmd: { type: "string", description: "Command to run under `adb shell`, e.g. 'dumpsys activity activities' or 'am start -a android.intent.action.VIEW -d myapp://route'" }
    },
    required: ["owner", "repo", "slug", "cmd"]
  },
  async handler(args) {
    try {
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/shell", { cmd: args.cmd });
      return dv.jsonText(JSON.parse(buffer.toString("utf8")));
    } catch (e) { return dv.fail(e.message); }
  }
});

module.exports = {};
