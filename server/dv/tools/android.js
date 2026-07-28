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

// tap/swipe/text/key/tap_element/batch all respond with either a
// screenshot (image/png, default) or a bare JSON ack (screenshot:false —
// for firing many actions back-to-back without paying for image
// encoding/transfer on every single one). Render whichever came back.
function respondFromBridge(buffer, contentType) {
  if (contentType && contentType.indexOf("image") !== -1) {
    return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
  }
  return dv.jsonText(JSON.parse(buffer.toString("utf8")));
}

// MCP clients (Claude Desktop / claude.ai) default to a 60s per-request
// timeout, but reset it every time a progress notification arrives —
// same mechanism dv/tools/network.js's `download` tool already relies on.
// android_batch/android_stress genuinely can run past 60s (a long action
// sequence, or a big stress-test count), so heartbeat through them
// instead of letting the client kill the call. No-op when the client
// didn't ask for progress (ctx.progress is undefined outside that case).
function startHeartbeat(ctx) {
  if (!ctx || typeof ctx.progress !== "function") return { stop() {} };
  let n = 0;
  const id = setInterval(() => { n++; ctx.progress(n, undefined, "still running…"); }, 8000);
  return { stop() { clearInterval(id); } };
}

dv.defineTool({
  name: "android_start",
  category: "deploy",
  description: [
    "Start a live Android emulator session for a native Kotlin/Android branch — builds the debug APK,",
    "boots a KVM emulator on GitHub Actions, installs + launches the app. Takes ~3-6 min to come up.",
    "Call android_start once, then poll with android_status until status is 'ready'.",
    "",
    "Once ready, every android_* tool falls into one of two modes:",
    "  • Debug Interface (visual) — android_screenshot, and android_tap/swipe/type/key/tap_element/batch",
    "    by default: each returns a PNG of the resulting screen. Use these when you need to actually SEE",
    "    what happened — one-off exploration, confirming a specific visual, debugging something unclear.",
    "  • Debug Command (headless/code-only) — the same tap/swipe/type/key/tap_element/batch tools with",
    "    screenshot:false, plus android_state/logcat/shell/ui_dump/stress: no image ever generated or",
    "    transferred, just small JSON. Use these for anything you'd run more than a couple of times —",
    "    scripted test sequences, assertions ('did this button appear', 'did it crash'), bulk fuzzing.",
    "    This is the fast path; the visual mode is for when you specifically need eyes on the screen."
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
  description: "[Session control] Poll the live Android session's status/log (starting / ready / error / stopped).",
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
  description: "[Session control] Stop the live Android session (cancels the underlying GitHub Actions run).",
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
  description: "[Debug Interface — visual] Screenshot the running app on the live Android session. Requires android_start to have reached 'ready'.",
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
  description: "[Debug Interface by default, Debug Command with screenshot:false] Tap a point on the live Android app screen. Returns a screenshot after the tap, unless screenshot:false (for rapid-fire input sequences where you only want to look once at the end).",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      x: { type: "number" }, y: { type: "number" },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the screenshot and get a near-instant ack instead — for stress-testing many actions back-to-back." }
    },
    required: ["owner", "repo", "slug", "x", "y"]
  },
  async handler(args) {
    try {
      // The bridge now returns the resulting screenshot directly from the
      // POST itself — no separate GET /screenshot needed. Halves the
      // round-trips through the tunnel + GitHub Actions runner per call.
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/tap", { x: args.x, y: args.y, screenshot: args.screenshot !== false });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_swipe",
  category: "interact",
  description: "[Debug Interface by default, Debug Command with screenshot:false] Swipe from (x1,y1) to (x2,y2) on the live Android app. Returns a screenshot after the swipe, unless screenshot:false.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
      durationMs: { type: "number" },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the screenshot for a near-instant ack." }
    },
    required: ["owner", "repo", "slug", "x1", "y1", "x2", "y2"]
  },
  async handler(args) {
    try {
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/swipe", { x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2, durationMs: args.durationMs || 300, screenshot: args.screenshot !== false });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_type",
  category: "interact",
  description: "[Debug Interface by default, Debug Command with screenshot:false] Type text into the focused field on the live Android app. Returns a screenshot after typing, unless screenshot:false.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      text: { type: "string" },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the screenshot for a near-instant ack." }
    },
    required: ["owner", "repo", "slug", "text"]
  },
  async handler(args) {
    try {
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/text", { text: args.text, screenshot: args.screenshot !== false });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_key",
  category: "interact",
  description: "[Debug Interface by default, Debug Command with screenshot:false] Send an Android keyevent code (e.g. 4=BACK, 66=ENTER, 67=DEL) to the live session. Returns a screenshot after, unless screenshot:false.",
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      keycode: { type: "number", description: "Android KEYCODE_* integer value" },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the screenshot for a near-instant ack." }
    },
    required: ["owner", "repo", "slug", "keycode"]
  },
  async handler(args) {
    try {
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/key", { keycode: args.keycode, screenshot: args.screenshot !== false });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_ui_dump",
  category: "audit",
  description: "[Debug Command — headless] Dump the current Android UI hierarchy (uiautomator XML) — element bounds/text/resource-ids for locating tap targets precisely. For simple existence checks prefer android_state (much smaller response); use this when you need the full tree.",
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
    "[Debug Interface by default, Debug Command with screenshot:false]",
    "Tap a UI element by its exact text or resource-id instead of pixel coordinates — resolved from a fresh",
    "uiautomator dump, so it doesn't depend on reading a screenshot first. Fails with a clear error if no",
    "element matches, rather than silently tapping the wrong spot. Returns a screenshot after the tap."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      text: { type: "string", description: "Exact visible text of the target element" },
      resourceId: { type: "string", description: "Exact android:id resource-id of the target element (e.g. com.app:id/submit_button)" },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the screenshot for a near-instant ack." }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    if (!args.text && !args.resourceId) return dv.fail("Provide text or resourceId");
    try {
      const { buffer, contentType } = await bridgeRequest(keyOf(args), "POST", "/tap_element", { text: args.text, resourceId: args.resourceId, screenshot: args.screenshot !== false });
      if (contentType && contentType.indexOf("image") === -1) {
        const parsed = JSON.parse(buffer.toString("utf8"));
        if (parsed.error) return dv.fail(parsed.error);
        return dv.jsonText(parsed);
      }
      return dv.imageWithJson(buffer.toString("base64"), "image/png", { ok: true });
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_logcat",
  category: "audit",
  description: "[Debug Command — headless] Read recent logcat output from the live session — the app's own console/exception output, for auditing what the running code actually did instead of only what it visually shows.",
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
    "[Debug Command — headless]",
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

dv.defineTool({
  name: "android_batch",
  category: "interact",
  description: [
    "[Debug Interface by default, Debug Command with screenshot:false]",
    "Run a whole scripted sequence of taps/swipes/text/key/wait actions in ONE round-trip instead of one",
    "per action — each round-trip pays full tunnel + GitHub Actions runner latency regardless of how fast",
    "you can produce the next action, so this is the real lever for driving the app as fast as you can",
    "think rather than as fast as the network allows one action at a time. Returns a screenshot after the",
    "whole sequence, unless screenshot:false. Self-healing: if any action in the sequence (e.g. a Back/Home",
    "key buried among many taps) knocks the app out to the launcher, it's automatically relaunched before",
    "returning — a stray key in a long batch can no longer strand you with no way back to the app.",
    "Long sequences won't hit the MCP client's 60s timeout — this heartbeats progress notifications while running."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      actions: {
        type: "array",
        description: "Executed in order. Each item: {action:'tap',x,y} | {action:'swipe',x1,y1,x2,y2,durationMs?} | {action:'text',text} | {action:'key',keycode} | {action:'wait',ms}",
        items: { type: "object" }
      },
      screenshot: { type: "boolean", description: "Default true. Set false to skip the trailing screenshot." },
      pkg: { type: "string", description: "Package to auto-relaunch if the batch ends outside it. Defaults to the session's launched app; pass '' to disable the check." }
    },
    required: ["owner", "repo", "slug", "actions"]
  },
  async handler(args, ctx) {
    if (!Array.isArray(args.actions) || !args.actions.length) return dv.fail("actions must be a non-empty array");
    const key = keyOf(args);
    const pkg = args.pkg !== undefined ? args.pkg : (sessionStatus[key] && sessionStatus[key].packageName);
    const heartbeat = startHeartbeat(ctx);
    try {
      const { buffer, contentType } = await bridgeRequest(key, "POST", "/batch", { actions: args.actions, screenshot: args.screenshot !== false, pkg: pkg });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
    finally { heartbeat.stop(); }
  }
});

dv.defineTool({
  name: "android_stress",
  category: "audit",
  description: [
    "[Debug Command — headless, except for the one trailing screenshot]",
    "Heavy stress test via Android's own `monkey` fuzzer — fires random touch/motion/app-switch events",
    "directly on-device with zero network round-trip per event (nothing over HTTP could match its raw",
    "throughput). Use this, not a loop of individual taps, for genuinely hammering the app fast. Reports",
    "whether it crashed, the crash log if so, and a final screenshot. Heartbeats progress so a large event",
    "count won't hit the MCP client's 60s timeout."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      pkg: { type: "string", description: "Package to fuzz. Defaults to the session's launched app." },
      count: { type: "number", description: "Number of events to fire, default 500, max 20000" },
      throttleMs: { type: "number", description: "Delay between events in ms, default 0 (as fast as possible)" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args, ctx) {
    const key = keyOf(args);
    const pkg = args.pkg || (sessionStatus[key] && sessionStatus[key].packageName);
    if (!pkg) return dv.fail("No package specified and none known for this session — pass pkg explicitly");
    const heartbeat = startHeartbeat(ctx);
    try {
      const { buffer } = await bridgeRequest(key, "POST", "/stress", { pkg: pkg, count: args.count || 500, throttleMs: args.throttleMs || 0 });
      const parsed = JSON.parse(buffer.toString("utf8"));
      const content = [];
      if (parsed.screenshotBase64) content.push({ type: "image", data: parsed.screenshotBase64, mimeType: "image/png" });
      const { screenshotBase64, ...meta } = parsed;
      content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
      return dv.makeResult(content, !!meta.crashed);
    } catch (e) { return dv.fail(e.message); }
    finally { heartbeat.stop(); }
  }
});

dv.defineTool({
  name: "android_state",
  category: "audit",
  description: [
    "[Debug Command — headless]",
    "Code-only test primitive: no screenshot, no full UI-tree transfer — just the current top activity,",
    "whether anything has crashed, and found/count/bounds for whatever element selectors you ask about,",
    "in one tiny JSON response. This is what makes running hundreds or thousands of assertions practical:",
    "reach for android_screenshot only when a specific check actually needs visual confirmation, use this",
    "for everything else (\"did this button appear\", \"did navigation land on the right screen\", \"did it crash\")."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      selectors: {
        type: "array",
        description: "Elements to check for existence in the current UI, e.g. [{\"text\":\"Log In\"},{\"resourceId\":\"com.app:id/submit\"}]. Omit for just topActivity/crashed.",
        items: {
          type: "object",
          properties: { text: { type: "string" }, resourceId: { type: "string" } }
        }
      }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    try {
      const { buffer } = await bridgeRequest(keyOf(args), "POST", "/state", { selectors: args.selectors || [] });
      return dv.jsonText(JSON.parse(buffer.toString("utf8")));
    } catch (e) { return dv.fail(e.message); }
  }
});

dv.defineTool({
  name: "android_relaunch",
  category: "interact",
  description: [
    "[Debug Interface by default, Debug Command with screenshot:false]",
    "Bring the app back to the foreground if a Home/Back press (or anything else) knocked it out to the",
    "launcher — no app icon to tap needed. Also runs automatically at the end of every android_batch, so",
    "you should rarely need this manually; it's here as an explicit escape hatch for the tap/swipe/type/key",
    "tools too, and for recovering an already-stranded session."
  ].join(" "),
  schema: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" }, slug: { type: "string" },
      pkg: { type: "string", description: "Package to bring to the foreground. Defaults to the session's launched app." },
      screenshot: { type: "boolean", description: "Default true." }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const key = keyOf(args);
    const pkg = args.pkg || (sessionStatus[key] && sessionStatus[key].packageName);
    if (!pkg) return dv.fail("No package specified and none known for this session — pass pkg explicitly");
    try {
      const { buffer, contentType } = await bridgeRequest(key, "POST", "/relaunch", { pkg: pkg, screenshot: args.screenshot !== false });
      return respondFromBridge(buffer, contentType);
    } catch (e) { return dv.fail(e.message); }
  }
});

module.exports = {};
