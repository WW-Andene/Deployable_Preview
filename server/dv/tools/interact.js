/**
 * dv/tools/interact.js — user actions.
 *
 * Everything that changes the preview: click, type, drag, file_upload,
 * tap, swipe, pinch, long_press, key, back / forward / reload, toggle,
 * dialog, evaluate, navigate, scroll, hover, select. One tool, one
 * action dispatch.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");

dv.defineTool({
  name: "interact",
  category: "interact",
  description: [
    "Perform an action on a deployed preview. Returns a screenshot after the action.",
    "Sessions persist across calls (state like modals, localStorage is preserved).",
    "Actions:",
    "  • click / hover — selector OR {x,y}",
    "  • type — selector + value",
    "  • select — selector + value (option)",
    "  • scroll — value = pixels to scroll by (positive = down)",
    "  • navigate — value = path/URL (same-origin)",
    "  • evaluate — value = JS code, returns result",
    "  • drag — {selector|fromX,fromY} → {toSelector|toX,toY}, optional steps/stepDelay",
    "  • file_upload — selector + files: [{ name, mimeType?, base64 }]",
    "  • back / forward / reload — history navigation",
    "  • key — value = key name (e.g. 'Enter', 'Escape', 'ArrowDown'), optional selector to focus first",
    "  • tap / long_press — selector OR {x,y} (value = hold-duration ms for long_press)",
    "  • swipe — {fromSelector|fromX,fromY} → {toSelector|toX,toY}, touchscreen-backed",
    "  • pinch — two-finger pinch centred on selector or (centerX,centerY); startDistance → endDistance",
    "  • toggle — selector + value ('hide'|'show'|'toggle'). Hides/shows elements for A/B comparison.",
    "  • dialog — pre-arm a one-shot dialog handler (accept:boolean, value:prompt-text)",
    "",
    "iframe: pass `frame` (CSS selector of an <iframe>, frame URL substring, or frame name) to scope",
    "selector-based actions to that frame."
  ].join("\n"),
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner:    { type: "string" },
      repo:     { type: "string" },
      slug:     { type: "string" },
      action:   {
        type: "string",
        enum: [
          "click", "type", "select", "scroll", "hover", "navigate", "evaluate",
          "drag", "file_upload", "back", "forward", "reload",
          "key", "tap", "swipe", "long_press", "pinch", "toggle", "dialog"
        ],
        description: "Action to perform"
      },
      selector: { type: "string" },
      value:    { type: "string" },
      x:        { type: "number" },
      y:        { type: "number" },
      fromX: { type: "number" }, fromY: { type: "number" },
      toX:   { type: "number" }, toY:   { type: "number" },
      fromSelector: { type: "string" },
      toSelector:   { type: "string" },
      steps:    { type: "number" },
      stepDelay:{ type: "number" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name:     { type: "string" },
            mimeType: { type: "string" },
            base64:   { type: "string" }
          },
          required: ["name", "base64"]
        }
      },
      accept:   { type: "boolean", description: "dialog: accept (true) or dismiss (false)" },
      frame:    { type: "string", description: "Optional iframe target" },
      centerX:  { type: "number", description: "pinch: centre X" },
      centerY:  { type: "number", description: "pinch: centre Y" },
      startDistance: { type: "number", description: "pinch: initial finger distance (default 200)" },
      endDistance:   { type: "number", description: "pinch: final finger distance (default 50)" },
      width:  { type: "number" },
      height: { type: "number" }
    },
    required: ["owner", "repo", "slug", "action"]
  },
  async handler(args) {
    const result = await browser.interact(args);
    if (result && result.error) return dv.failFromBrowser(result);

    const content = [];
    if (result.screenshot && result.screenshot.base64) {
      content.push({
        type: "image",
        data: result.screenshot.base64,
        mimeType: result.screenshot.mimeType
      });
    }
    // eslint-disable-next-line no-unused-vars
    const { screenshot, ...meta } = result;
    content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
    return dv.makeResult(content);
  }
});
