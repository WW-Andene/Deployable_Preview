/**
 * dv/tools/visual.js — pixel, colour, and image-diff tools.
 *
 * Everything that treats the preview as an image: single-pixel reads,
 * element measurement, pixel/perceptual/structural diffs, palette
 * extraction, canvas pixel access, image metadata, and overlay
 * rendering for visual annotations.
 */

"use strict";

const dv = require("../core");
const browser = require("../../browser");

const OWNER = { type: "string", description: "Repository owner" };
const REPO  = { type: "string", description: "Repository name" };
const SLUG  = { type: "string", description: "Branch slug" };
const VW = { type: "number", description: "Viewport width (default: 1280)" };
const VH = { type: "number", description: "Viewport height (default: 720)" };

// ── get_pixel_color ───────────────────────────────────────────────────────

dv.defineTool({
  name: "get_pixel_color",
  category: "visual",
  description: "Read the RGB(A) colour of a single pixel in the rendered preview. Returns hex, rgba, and raw channel values. Prefers sharp (native) when available, falls back to png-lite. Use for exact colour verification.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      x: { type: "number", description: "X coordinate in viewport CSS pixels" },
      y: { type: "number", description: "Y coordinate in viewport CSS pixels" },
      width: VW, height: VH
    },
    required: ["owner", "repo", "slug", "x", "y"]
  },
  async handler(args) {
    const result = await browser.getPixelColor(args);
    if (result.error) return dv.fail(result.error, result);
    return dv.ok(result);
  }
});

// ── measure ───────────────────────────────────────────────────────────────

dv.defineTool({
  name: "measure",
  category: "visual",
  description: "Measure the distance and delta between two points or elements. Either endpoint can be a selector or {x,y}. Returns dx, dy, Euclidean, and Manhattan distance.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      a: {
        type: "object",
        properties: { selector: { type: "string" }, x: { type: "number" }, y: { type: "number" } }
      },
      b: {
        type: "object",
        properties: { selector: { type: "string" }, x: { type: "number" }, y: { type: "number" } }
      },
      width: VW, height: VH
    },
    required: ["owner", "repo", "slug", "a", "b"]
  },
  async handler(args) {
    const result = await browser.measure(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── screenshot_diff ───────────────────────────────────────────────────────

dv.defineTool({
  name: "screenshot_diff",
  category: "visual",
  description: "Pixel-compare two base64 PNG screenshots. Prefers pixelmatch (red heatmap PNG returned as base64) when installed; falls back to the zero-dep png-lite diff. Returns diff count, percent, bounding box, and max per-channel delta.",
  requires: [],
  schema: {
    type: "object",
    properties: {
      before: { type: "string", description: "Base64 PNG" },
      after: { type: "string", description: "Base64 PNG" },
      threshold: { type: "number", description: "Per-channel tolerance (default: 10)" },
      includeAA: { type: "boolean", description: "Pixelmatch: include anti-aliased pixels" }
    },
    required: ["before", "after"]
  },
  async handler(args) {
    const result = await browser.screenshotDiff(args);
    if (result.error) return dv.fail(result.error, result);
    return dv.ok(result);
  }
});

// ── visual_similarity ─────────────────────────────────────────────────────

dv.defineTool({
  name: "visual_similarity",
  category: "visual",
  description: "Structural similarity index (SSIM) between two base64 PNG screenshots. Better than pixel diff at 'does it look the same' — ignores minor rendering variance. Returns mssim 0..1 plus a human-readable interpretation.",
  requires: [{ kind: "library", name: ["ssim.js", "pngjs"] }],
  schema: {
    type: "object",
    properties: {
      before: { type: "string" },
      after:  { type: "string" }
    },
    required: ["before", "after"]
  },
  async handler(args) {
    const result = await browser.visualSimilarity(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── tolerance_diff ────────────────────────────────────────────────────────

dv.defineTool({
  name: "tolerance_diff",
  category: "visual",
  description: "Screenshot diff with perceptual tolerance and anti-alias ignoring, via looks-same. Far fewer false positives than pixelmatch on text-heavy pages.",
  requires: [{ kind: "library", name: "looks-same" }],
  schema: {
    type: "object",
    properties: {
      before: { type: "string" },
      after: { type: "string" },
      tolerance: { type: "number" },
      ignoreAntialiasing: { type: "boolean" },
      antialiasingTolerance: { type: "number" },
      ignoreCaret: { type: "boolean" },
      strict: { type: "boolean" }
    },
    required: ["before", "after"]
  },
  async handler(args) {
    const result = await browser.toleranceDiffTool(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── palette ───────────────────────────────────────────────────────────────

dv.defineTool({
  name: "palette",
  category: "visual",
  description: "Extract the dominant colour and palette from the preview page (or a selector) using color-thief. Returns hex/RGB swatches sorted by visual weight.",
  requires: [{ kind: "browser" }, { kind: "library", name: "colorthief" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string" },
      count: { type: "number", description: "Number of palette entries (default: 6)" },
      fullPage: { type: "boolean" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getPalette(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── color_stats ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "color_stats",
  category: "visual",
  description: "Full colour distribution / vibrancy / luminance for the preview (or selector) via get-image-colors.",
  requires: [{ kind: "browser" }, { kind: "library", name: "get-image-colors" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string" },
      count: { type: "number" },
      fullPage: { type: "boolean" }
    },
    required: ["owner", "repo", "slug"]
  },
  async handler(args) {
    const result = await browser.getColorStats(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── image_info ────────────────────────────────────────────────────────────

dv.defineTool({
  name: "image_info",
  category: "visual",
  description: "Get image dimensions and EXIF metadata for a preview screenshot or a supplied base64 image. Uses image-size and exifreader.",
  requires: [{ kind: "library", name: ["image-size", "exifreader"] }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      base64: { type: "string", description: "Optional base64 image (skip the session screenshot)" },
      fullPage: { type: "boolean" }
    }
  },
  async handler(args) {
    const result = await browser.imageInfo(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});

// ── render_overlay ────────────────────────────────────────────────────────

dv.defineTool({
  name: "render_overlay",
  category: "visual",
  description: "Draw annotations (rectangles, lines, circles, labels) on top of a preview screenshot. Returns the annotated image as base64. Good for showing measurement results visually.",
  requires: [{ kind: "browser" }, { kind: "library", name: "canvas" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      fullPage: { type: "boolean" },
      shapes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["rect", "line", "circle", "text"] },
            x: { type: "number" }, y: { type: "number" },
            x1: { type: "number" }, y1: { type: "number" },
            x2: { type: "number" }, y2: { type: "number" },
            width: { type: "number" }, height: { type: "number" },
            radius: { type: "number" },
            text: { type: "string" }, font: { type: "string" }, color: { type: "string" },
            stroke: { type: "string" }, fill: { type: "string" }, lineWidth: { type: "number" }
          }
        }
      }
    },
    required: ["owner", "repo", "slug", "shapes"]
  },
  async handler(args) {
    const result = await browser.renderOverlayTool(args);
    if (result.error) return dv.fail(result.error);
    return dv.image(result.base64, result.mimeType, "Overlay rendered for " + result.url);
  }
});

// ── canvas_data ───────────────────────────────────────────────────────────

dv.defineTool({
  name: "canvas_data",
  category: "visual",
  description: "Extract pixel data from a <canvas> element. Returns a base64 PNG when dataUrl=true, or raw RGBA bytes from getImageData for a 2D canvas region. WebGL canvases fall back to toDataURL.",
  requires: [{ kind: "browser" }],
  schema: {
    type: "object",
    properties: {
      owner: OWNER, repo: REPO, slug: SLUG,
      selector: { type: "string", description: "CSS selector pointing to the <canvas>" },
      x: { type: "number" }, y: { type: "number" },
      width: { type: "number" }, height: { type: "number" },
      dataUrl: { type: "boolean" }
    },
    required: ["owner", "repo", "slug", "selector"]
  },
  async handler(args) {
    const result = await browser.canvasData(args);
    if (result.error) return dv.fail(result.error);
    return dv.ok(result);
  }
});
