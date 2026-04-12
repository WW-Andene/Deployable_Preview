/**
 * mcp.js — Model Context Protocol (MCP) Server for DeployView
 *
 * Implements the MCP specification (JSON-RPC 2.0 over stdio) to let
 * AI assistants like Claude interact with deployed app previews.
 *
 * Capabilities:
 *   - Take screenshots of deployed previews (vision access)
 *   - Inspect DOM / accessibility tree
 *   - Click, type, scroll, hover, navigate (live interaction)
 *   - Capture console logs and errors
 *   - List deployed previews and their status
 *   - Trigger builds and check build status
 *   - Get build logs
 *
 * Usage:
 *   node server/mcp.js              # Start as MCP stdio server
 *   node server/index.js --mcp      # Start HTTP + MCP combined
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "deployview": {
 *         "command": "node",
 *         "args": ["server/mcp.js"],
 *         "cwd": "/path/to/Deployable_Preview"
 *       }
 *     }
 *   }
 */

const readline = require("readline");

// ── Load app modules ─────────────────────────────────────────────────────────
const { loadConfig, getConfig, migrateConfig } = require("./config");
const { buildStatus, branchSlug, buildKey, deployBranch } = require("./build");
const { runningServers, killServer } = require("./process");
const { loadLog } = require("./logs");
const { webFetch, extractFromHtml } = require("./web-fetch");

// Load config on startup
loadConfig();
migrateConfig();

// Lazy-load browser module (deferred so stdio MCP starts fast)
let mcpBrowser = null;
function getBrowserModule() {
  if (!mcpBrowser) mcpBrowser = require("./mcp-browser");
  return mcpBrowser;
}

// ── MCP Protocol constants ───────────────────────────────────────────────────
const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "deployview-mcp";
const SERVER_VERSION = "1.0.0";

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_previews",
    description: "List all deployed app previews with their status, URLs, and metadata. Use this first to discover what apps are available.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "screenshot",
    description: "Take a screenshot of a deployed app preview. Returns a PNG image. Requires Playwright to be installed.",
    inputSchema: {
      type: "object",
      properties: {
        owner:    { type: "string", description: "Repository owner (GitHub username or org)" },
        repo:     { type: "string", description: "Repository name" },
        slug:     { type: "string", description: "Branch slug (e.g., 'main', 'feature__login')" },
        width:    { type: "number", description: "Viewport width in pixels (default: 1280)" },
        height:   { type: "number", description: "Viewport height in pixels (default: 720)" },
        fullPage: { type: "boolean", description: "Capture full scrollable page (default: false)" },
        selector: { type: "string", description: "CSS selector to screenshot a specific element" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "inspect",
    description: "Inspect the DOM structure, accessibility tree, and page metadata of a deployed preview. Optionally inspect a specific element by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        owner:    { type: "string", description: "Repository owner" },
        repo:     { type: "string", description: "Repository name" },
        slug:     { type: "string", description: "Branch slug" },
        selector: { type: "string", description: "CSS selector to inspect a specific element" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "interact",
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
      "  • toggle — selector + value ('hide'|'show'|'toggle'). Hides/shows elements for A/B comparison.",
      "  • dialog — pre-arm a one-shot dialog handler (accept:boolean, value:prompt-text)"
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        owner:    { type: "string", description: "Repository owner" },
        repo:     { type: "string", description: "Repository name" },
        slug:     { type: "string", description: "Branch slug" },
        action:   {
          type: "string",
          enum: [
            "click", "type", "select", "scroll", "hover", "navigate", "evaluate",
            "drag", "file_upload", "back", "forward", "reload",
            "key", "tap", "swipe", "long_press", "toggle", "dialog"
          ],
          description: "Action to perform"
        },
        selector: { type: "string", description: "CSS selector of the target element" },
        value:    { type: "string", description: "Value for type/select/scroll/navigate/evaluate/key/toggle/long_press actions" },
        x:        { type: "number", description: "X coordinate for click/hover/tap/long_press (alternative to selector)" },
        y:        { type: "number", description: "Y coordinate for click/hover/tap/long_press (alternative to selector)" },
        fromX:    { type: "number", description: "Drag/swipe: start X" },
        fromY:    { type: "number", description: "Drag/swipe: start Y" },
        toX:      { type: "number", description: "Drag/swipe: end X" },
        toY:      { type: "number", description: "Drag/swipe: end Y" },
        fromSelector: { type: "string", description: "Drag/swipe: CSS selector for the start element" },
        toSelector:   { type: "string", description: "Drag/swipe: CSS selector for the end element" },
        steps:    { type: "number", description: "Drag/swipe: number of interpolation steps (default: 20)" },
        stepDelay:{ type: "number", description: "Drag: milliseconds between interpolation steps (default: 8)" },
        files: {
          type: "array",
          description: "file_upload: list of files to upload",
          items: {
            type: "object",
            properties: {
              name:     { type: "string", description: "Filename" },
              mimeType: { type: "string", description: "MIME type (default: application/octet-stream)" },
              base64:   { type: "string", description: "File contents as base64" }
            },
            required: ["name", "base64"]
          }
        },
        accept:   { type: "boolean", description: "dialog: accept (true) or dismiss (false). Default: accept." },
        width:    { type: "number", description: "Viewport width in pixels (default: 1280)" },
        height:   { type: "number", description: "Viewport height in pixels (default: 720)" }
      },
      required: ["owner", "repo", "slug", "action"]
    }
  },
  {
    name: "console_logs",
    description: "Navigate to a deployed preview and capture console logs, errors, and failed network requests for a specified duration.",
    inputSchema: {
      type: "object",
      properties: {
        owner:    { type: "string", description: "Repository owner" },
        repo:     { type: "string", description: "Repository name" },
        slug:     { type: "string", description: "Branch slug" },
        duration: { type: "number", description: "Seconds to capture console output (default: 3, max: 30)" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "build_status",
    description: "Get the build status of a specific branch deployment, including build logs, commit SHA, and server port if running.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo:  { type: "string", description: "Repository name" },
        slug:  { type: "string", description: "Branch slug" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "trigger_build",
    description: "Trigger a rebuild or server restart for a specific branch deployment.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo:  { type: "string", description: "Repository name" },
        slug:  { type: "string", description: "Branch slug" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "get_build_log",
    description: "Retrieve the full build log for a specific branch deployment.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo:  { type: "string", description: "Repository name" },
        slug:  { type: "string", description: "Branch slug" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "reset_session",
    description: "Reset the persistent browser session for a preview. Use this to clear page state (localStorage, cookies, modals) and start fresh. If no owner/repo/slug given, resets all sessions.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo:  { type: "string", description: "Repository name" },
        slug:  { type: "string", description: "Branch slug" }
      }
    }
  },
  {
    name: "run_test",
    description: "Run the automated test harness on a deployed preview. Tests all tabs, buttons, inputs, toggles, dropdowns, and captures console errors. Returns structured results with pass/fail counts and full log.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo:  { type: "string", description: "Repository name" },
        slug:  { type: "string", description: "Branch slug" },
        mode:  { type: "string", enum: ["full", "quick"], description: "Test mode: 'full' (deep interaction, ~2min) or 'quick' (tab navigation only, ~30s). Default: full" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "get_pixel_color",
    description: "Read the RGB(A) colour of a single pixel in the rendered preview. Returns hex, rgba, and raw channel values. Use this for exact colour verification — e.g. scan a horizontal line across a sprite to find where red ends and green starts, then compute offsets mathematically.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        x: { type: "number", description: "X coordinate in viewport CSS pixels" },
        y: { type: "number", description: "Y coordinate in viewport CSS pixels" },
        width:  { type: "number", description: "Viewport width (default: 1280)" },
        height: { type: "number", description: "Viewport height (default: 720)" }
      },
      required: ["owner", "repo", "slug", "x", "y"]
    }
  },
  {
    name: "get_element_rect",
    description: "Return the bounding box, centre point, visibility, and computed styles for one or more elements matching a CSS selector. Structured data you can do math on — no screenshot to squint at. Returns all matches; primary is the first.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        selector: { type: "string", description: "CSS selector" },
        width:  { type: "number" },
        height: { type: "number" }
      },
      required: ["owner", "repo", "slug", "selector"]
    }
  },
  {
    name: "measure",
    description: "Measure the distance and delta between two points or elements. Either endpoint can be a selector or {x,y}. Returns dx, dy, Euclidean distance, and Manhattan distance — so Claude can do layout math in one shot.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        a: {
          type: "object",
          description: "First point. { selector } OR { x, y }",
          properties: {
            selector: { type: "string" },
            x: { type: "number" },
            y: { type: "number" }
          }
        },
        b: {
          type: "object",
          description: "Second point. { selector } OR { x, y }",
          properties: {
            selector: { type: "string" },
            x: { type: "number" },
            y: { type: "number" }
          }
        },
        width:  { type: "number" },
        height: { type: "number" }
      },
      required: ["owner", "repo", "slug", "a", "b"]
    }
  },
  {
    name: "screenshot_diff",
    description: "Pixel-compare two base64-encoded PNG screenshots. Returns diff pixel count, percentage, max per-channel delta, and a bounding box of where the differences are. Typical flow: take a screenshot → make a change → take another → call this with both base64 strings.",
    inputSchema: {
      type: "object",
      properties: {
        before: { type: "string", description: "Base64-encoded PNG (earlier state)" },
        after:  { type: "string", description: "Base64-encoded PNG (later state)" },
        threshold: { type: "number", description: "Per-channel tolerance 0..255 (default: 10)" }
      },
      required: ["before", "after"]
    }
  },
  {
    name: "emulate",
    description: "Apply environment emulation to a preview session: device pixel ratio (DPR), colour scheme (dark/light), reduced motion, touch, geolocation, custom User-Agent, and network throttling (offline / slow / latency). Sticky for the lifetime of the session.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        deviceScaleFactor: { type: "number", description: "DPR (0.5 – 4). Makes screenshots accurate on high-DPI designs." },
        colorScheme: { type: "string", enum: ["light", "dark", "no-preference"], description: "prefers-color-scheme value" },
        reducedMotion: { type: "string", enum: ["reduce", "no-preference"], description: "prefers-reduced-motion value" },
        touch: { type: "boolean", description: "Enable touch events" },
        geolocation: {
          type: "object",
          description: "Spoofed geolocation",
          properties: {
            latitude:  { type: "number" },
            longitude: { type: "number" },
            accuracy:  { type: "number" }
          }
        },
        offline:            { type: "boolean", description: "Simulate offline mode" },
        downloadThroughput: { type: "number", description: "Bytes/sec (-1 = unlimited)" },
        uploadThroughput:   { type: "number", description: "Bytes/sec (-1 = unlimited)" },
        latency:            { type: "number", description: "Added latency in ms" },
        userAgent:          { type: "string", description: "Custom User-Agent string" },
        width:  { type: "number" },
        height: { type: "number" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "storage",
    description: "Read or write cookies, localStorage, or sessionStorage on a preview session. Ops: list, get, set, delete, clear.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        store: { type: "string", enum: ["cookies", "localStorage", "sessionStorage"], description: "Which store to operate on (default: localStorage)" },
        op:    { type: "string", enum: ["list", "get", "set", "delete", "clear"], description: "Operation (default: list)" },
        key:   { type: "string", description: "Key / cookie name" },
        value: { type: "string", description: "Value to set" },
        cookie: {
          type: "object",
          description: "Full cookie descriptor for set (alternative to key/value)",
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
    }
  },
  {
    name: "performance",
    description: "Collect performance metrics for a preview: navigation timing (TTFB, DCL, load), paint timings, resource counts by type, total transfer size, and heap memory if available.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        reload: { type: "boolean", description: "Reload the page before measuring for a clean run" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "capture_requests",
    description: "Attach a network-request recorder to a preview session and collect requests for a duration. Good for spotting lazy-loaded assets, XHR/fetch calls, and websocket upgrades.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        duration: { type: "number", description: "Seconds to capture (default: 5, max: 60)" },
        maxRequests: { type: "number", description: "Cap on stored requests (default: 500, max: 2000)" },
        reload: { type: "boolean", description: "Reload the page first to capture from the beginning" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "download",
    description: "Trigger a file download in a preview and return the downloaded bytes as base64. Use 'click' with a selector to click a download button, or 'evaluate' with JS that triggers a download (e.g. setting location.href to a blob URL).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        trigger:  { type: "string", enum: ["click", "evaluate"], description: "How to initiate the download" },
        selector: { type: "string", description: "Element to click (for trigger=click)" },
        code:     { type: "string", description: "JavaScript to run (for trigger=evaluate)" },
        timeout:  { type: "number", description: "Max milliseconds to wait for the download (default: 30000)" }
      },
      required: ["owner", "repo", "slug", "trigger"]
    }
  },
  {
    name: "deploy_and_verify",
    description: "One-shot deploy + verify. Triggers a build, polls until ready, then returns a screenshot, brief console log, and commit info — replacing the typical trigger_build → build_status (x3) → screenshot flow.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
        slug:  { type: "string" },
        wait:    { type: "number", description: "Max ms to wait for ready (default: 180000)" },
        width:   { type: "number", description: "Screenshot viewport width" },
        height:  { type: "number", description: "Screenshot viewport height" },
        fullPage:{ type: "boolean", description: "Take a full-page screenshot" },
        duration:{ type: "number", description: "Seconds of console capture (default: 2)" }
      },
      required: ["owner", "repo", "slug"]
    }
  },
  {
    name: "web_fetch",
    description: [
      "Universal URL fetcher and scraper. Handles:",
      "  • HTML pages — extract readable text, links, images, headings, meta tags, or convert to Markdown",
      "  • JSON APIs — parse with optional jsonPath lookup",
      "  • RSS/Atom feeds and XML sitemaps — parsed into structured items",
      "  • Plain text / CSS / JS / YAML / CSV — returned as-is",
      "  • Binary content (images, PDFs, etc.) — base64 when allowBinary:true",
      "Supports gzip/deflate/brotli/zstd, automatic character-encoding detection (UTF-8, Latin-1, Shift-JIS, GBK, …), cookies, custom headers, retries on 429/503 with Retry-After.",
      "Uses a modern Chrome User-Agent by default to avoid 403s.",
      "Set jsRender:true to render JavaScript in a headless browser (for SPAs / client-rendered sites).",
      "Set captureRequests:true to also return every network request the page makes (images, media, XHR, Spine skeletons, etc.) — implies jsRender."
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        // ── Request ──
        url:             { type: "string", description: "URL to fetch (http or https)" },
        method:          { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"], description: "HTTP method (default: GET)" },
        headers:         { type: "object", description: "Custom request headers (merged over defaults)" },
        body:            { description: "Request body for POST/PUT/PATCH. String, or object (auto-serialized per bodyType)." },
        bodyType:        { type: "string", enum: ["json", "form", "text"], description: "How to encode the body (default: auto-detect — objects → json)" },
        timeout:         { type: "number", description: "Request timeout in milliseconds (default: 20000, max: 60000)" },
        retries:         { type: "number", description: "Retries on 429/503/network errors (default: 2, max: 3)" },
        maxRedirects:    { type: "number", description: "Max redirects to follow (default: 8, max: 15)" },
        maxSize:         { type: "number", description: "Max response bytes (default: 5MB, hard cap: 20MB)" },
        userAgent:       { type: "string", description: "Override User-Agent header (default: modern Chrome)" },
        acceptLanguage:  { type: "string", description: "Accept-Language header (default: en-US,en;q=0.9)" },
        referer:         { type: "string", description: "Referer header" },
        cookies:         { description: "Cookie header — either a raw string 'k=v; k2=v2' or an object {k: v, k2: v2}" },
        // ── Output format ──
        format:          { type: "string", enum: ["auto", "text", "markdown", "html", "json", "xml", "base64", "raw"], description: "Output format. 'auto' picks based on Content-Type. 'markdown' converts HTML to Markdown preserving headings/links/lists/code. 'raw' returns the untouched decoded body." },
        allowBinary:     { type: "boolean", description: "Allow non-text content (images, PDFs, etc.) to be returned as base64 instead of erroring" },
        parseXml:        { type: "boolean", description: "Parse RSS/Atom/sitemap XML into structured items (auto-detected for XML content-types)" },
        jsonPath:        { type: "string", description: "For JSON responses: dot-path to extract a subtree, e.g. 'data.items.0.title'" },
        // ── HTML extractors ──
        extractText:     { type: "boolean", description: "HTML: strip tags and return readable plain text (default when no other extractor set)" },
        extractLinks:    { type: "boolean", description: "HTML: extract all <a> links" },
        extractMeta:     { type: "boolean", description: "HTML: extract meta tags (title, description, Open Graph, etc.)" },
        extractImages:   { type: "boolean", description: "HTML: extract <img> URLs with alt/width/height" },
        extractHeadings: { type: "boolean", description: "HTML: extract h1-h6 outline" },
        selector:        { type: "string", description: "HTML: CSS-like selector to scope extraction — 'tag', '.class', '#id', or 'tag.class'" },
        readability:     { type: "boolean", description: "HTML: strip nav/footer/sidebar/header boilerplate before extraction" },
        maxTextLength:   { type: "number", description: "Max text/markdown length in characters (default: 50000, max: 400000)" },
        // ── JavaScript rendering / network capture (headless browser path) ──
        jsRender:        { type: "boolean", description: "Render JavaScript in a headless browser before extraction. Required for SPAs or client-rendered content. Slower than plain fetch." },
        captureRequests: { type: "boolean", description: "Also capture every network request the page makes (URLs, content-types, sizes, XHR/fetch, media, fonts, …). Implies jsRender." },
        waitMs:          { type: "number", description: "With jsRender/captureRequests: extra wait after page load in ms (default: 2000, max: 30000)" },
        waitUntil:       { type: "string", enum: ["load", "domcontentloaded", "networkidle", "networkidle2"], description: "With jsRender/captureRequests: navigation completion signal" },
        requestFilter: {
          type: "object",
          description: "With captureRequests: filter the captured requests. All filters AND-combined.",
          properties: {
            resourceTypes: { type: "array", items: { type: "string" }, description: "Include only these resource types: image, media, font, script, stylesheet, xhr, fetch, document, websocket" },
            extensions:    { type: "array", items: { type: "string" }, description: "Include only URLs ending in these extensions, e.g. ['skel','atlas','webm','mp4','png','json']" },
            urlPattern:    { type: "string", description: "Include only URLs matching this JavaScript regex" }
          }
        },
        maxRequests:     { type: "number", description: "With captureRequests: max requests to store (default: 500, max: 2000)" },
        width:           { type: "number", description: "With jsRender: browser viewport width (default: 1280)" },
        height:          { type: "number", description: "With jsRender: browser viewport height (default: 720)" }
      },
      required: ["url"]
    }
  }
];

// ── Unified web_fetch dispatcher ────────────────────────────────────────────
//
// Three paths:
//   1. Plain HTTP (default) — fast Node fetch via webFetch()
//   2. jsRender: true       — headless browser, run HTML extractors on rendered DOM
//   3. captureRequests: true — headless browser + network request capture (implies jsRender)

async function runWebFetch(args) {
  args = args || {};

  const useBrowser = !!(args.jsRender || args.captureRequests);
  if (!useBrowser) {
    return webFetch(args);
  }

  // Browser path
  const browser = getBrowserModule();
  const browseResult = await browser.browseUrl({
    url: args.url,
    waitMs: args.waitMs,
    waitUntil: args.waitUntil,
    width: args.width,
    height: args.height,
    filter: args.requestFilter,
    headers: args.headers,
    userAgent: args.userAgent || (args.headers && (args.headers["User-Agent"] || args.headers["user-agent"])),
    returnHtml: true,
    captureConsole: true,
    maxRequests: args.captureRequests ? (args.maxRequests || 500) : 1
  });

  if (browseResult.error) return browseResult;

  // Run the HTML extractors on the post-JS DOM
  const extracted = extractFromHtml(browseResult.html || "", args, browseResult.finalUrl || args.url);

  const result = {
    url: browseResult.url,
    finalUrl: browseResult.finalUrl,
    statusCode: 200,
    contentType: "text/html",
    jsRendered: true,
    title: extracted.title || browseResult.title,
    duration: browseResult.duration,
    ...extracted
  };

  if (args.captureRequests) {
    result.capturedRequests = true;
    result.requestCount = browseResult.requestCount;
    result.requestsByType = browseResult.requestsByType;
    result.requests = browseResult.requests;
    result.requestsTruncated = browseResult.truncated;
    result.consoleLogs = browseResult.consoleLogs;
    result.browseErrors = browseResult.errors;
  }

  return result;
}

// ── web_fetch result → text summary ─────────────────────────────────────────

function formatWebFetchResult(result) {
  const parts = [];
  parts.push("URL: " + result.url);
  if (result.finalUrl && result.finalUrl !== result.url) parts.push("Final URL: " + result.finalUrl);
  if (result.statusCode != null) parts.push("Status: " + result.statusCode);
  if (result.contentType) parts.push("Content-Type: " + result.contentType);
  if (result.charset && result.charset !== "utf-8") parts.push("Charset: " + result.charset);
  if (result.jsRendered) parts.push("Mode: JS-rendered (headless browser)");
  if (result.duration != null && result.jsRendered) parts.push("Load duration: " + result.duration + "ms");
  if (result.truncated) parts.push("⚠ Response was truncated (exceeded size limit)");
  if (result.title) parts.push("Title: " + result.title);

  // Primary content
  if (result.json !== undefined) {
    const json = JSON.stringify(result.json, null, 2);
    parts.push("\n" + (json.length > 100000 ? json.slice(0, 100000) + "\n[... JSON truncated]" : json));
  } else if (result.feed) {
    parts.push("\n--- Feed: " + result.feed.type + (result.feed.title ? " — " + result.feed.title : "") + " ---");
    if (result.feed.description) parts.push(result.feed.description);
    parts.push("(" + result.feed.itemCount + " items)");
    const showCount = Math.min(result.feed.items.length, 50);
    for (let i = 0; i < showCount; i++) {
      const it = result.feed.items[i];
      const line = [];
      if (it.title)   line.push(it.title);
      if (it.loc)     line.push(it.loc);
      if (it.link)    line.push("→ " + it.link);
      if (it.pubDate) line.push("(" + it.pubDate + ")");
      if (it.published) line.push("(" + it.published + ")");
      if (it.updated) line.push("[updated " + it.updated + "]");
      parts.push("- " + line.join(" "));
      const desc = it.summary || it.description || it.content;
      if (desc) parts.push("  " + String(desc).slice(0, 300).replace(/\s+/g, " "));
    }
    if (result.feed.items.length > showCount) {
      parts.push("... and " + (result.feed.items.length - showCount) + " more items");
    }
  } else if (result.markdown) {
    parts.push("\n" + result.markdown);
  } else if (result.html) {
    parts.push("\n" + result.html);
  } else if (result.text) {
    parts.push("\n" + result.text);
  } else if (result.body) {
    parts.push("\n" + result.body);
  } else if (result.base64) {
    parts.push("\n[Binary content, " + result.byteLength + " bytes, base64 length: " + result.base64.length + "]");
    parts.push(result.base64.slice(0, 2000) + (result.base64.length > 2000 ? "..." : ""));
  }

  if (result.headings && result.headings.length) {
    parts.push("\n--- Page Outline (" + result.headings.length + " headings) ---");
    for (const h of result.headings) {
      parts.push("  ".repeat(h.level - 1) + "H" + h.level + ": " + h.text);
    }
  }
  if (result.links && result.links.length) {
    parts.push("\n--- Links (" + result.links.length + ") ---");
    for (const link of result.links.slice(0, 100)) {
      parts.push((link.text ? link.text + " → " : "") + link.href);
    }
    if (result.links.length > 100) parts.push("... and " + (result.links.length - 100) + " more links");
  }
  if (result.images && result.images.length) {
    parts.push("\n--- Images (" + result.images.length + ") ---");
    for (const img of result.images.slice(0, 50)) {
      let desc = img.src;
      if (img.alt) desc += " [" + img.alt + "]";
      if (img.width && img.height) desc += " (" + img.width + "x" + img.height + ")";
      parts.push(desc);
    }
    if (result.images.length > 50) parts.push("... and " + (result.images.length - 50) + " more images");
  }
  if (result.meta && Object.keys(result.meta).length) {
    parts.push("\n--- Meta Tags ---");
    for (const k in result.meta) parts.push(k + ": " + result.meta[k]);
  }

  // Captured network requests (captureRequests mode)
  if (result.capturedRequests && result.requests) {
    parts.push("\n--- Network Requests (" + result.requestCount +
               (result.requestsTruncated ? ", truncated — raise maxRequests for more" : "") + ") ---");
    if (result.requestsByType && Object.keys(result.requestsByType).length) {
      const breakdown = Object.keys(result.requestsByType).sort()
        .map((k) => k + "=" + result.requestsByType[k]).join(", ");
      parts.push("By category: " + breakdown);
    }
    const byCategory = {};
    for (const r of result.requests) {
      const cat = r.category || "other";
      (byCategory[cat] = byCategory[cat] || []).push(r);
    }
    for (const cat of Object.keys(byCategory).sort()) {
      parts.push("\n  [" + cat + " × " + byCategory[cat].length + "]");
      for (const r of byCategory[cat]) {
        let line = "  [" + r.status + "] " + r.url;
        const extras = [];
        if (r.contentType) extras.push(r.contentType);
        if (r.size != null) extras.push(r.size + "B");
        if (r.fromCache) extras.push("cached");
        if (extras.length) line += "  (" + extras.join(", ") + ")";
        parts.push(line);
      }
    }
    if (result.browseErrors && result.browseErrors.length) {
      parts.push("\n--- Browser errors (" + result.browseErrors.length + ") ---");
      for (const err of result.browseErrors.slice(0, 50)) {
        parts.push((err.type || "error") + ": " + (err.url ? err.url + " — " : "") + (err.message || err.failure || ""));
      }
    }
    if (result.consoleLogs && result.consoleLogs.length) {
      parts.push("\n--- Console (" + result.consoleLogs.length + ") ---");
      for (const log of result.consoleLogs.slice(0, 30)) {
        parts.push("[" + log.type + "] " + log.text);
      }
    }
  }

  return parts.join("\n");
}

// ── Tool handlers ────────────────────────────────────────────────────────────

async function handleTool(name, args) {
  switch (name) {
    case "list_previews": {
      const browser = getBrowserModule();
      const previews = browser.listPreviews();
      const config = getConfig();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            previews,
            totalRepos: config.repos.length,
            playwrightAvailable: browser.hasPlaywright(),
            hint: previews.length === 0
              ? "No previews are deployed. Add a repo and build a branch first via the DeployView dashboard."
              : "Use the owner, repo, and slug from a preview to take screenshots, inspect, or interact."
          }, null, 2)
        }]
      };
    }

    case "screenshot": {
      try {
        const browser = getBrowserModule();
        const result = await browser.takeScreenshot(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Screenshot error: " + result.error }], isError: true };
        }
        return {
          content: [
            { type: "image", data: result.base64, mimeType: result.mimeType },
            { type: "text", text: "Screenshot of " + result.url + " (" + result.width + "x" + result.height + ") — " + result.title }
          ]
        };
      } catch (e) {
        return { content: [{ type: "text", text: "Screenshot failed: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 3).join("\n") }], isError: true };
      }
    }

    case "inspect": {
      try {
        const browser = getBrowserModule();
        const result = await browser.inspectDOM(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "Inspect failed: " + e.message }], isError: true };
      }
    }

    case "interact": {
      try {
        const browser = getBrowserModule();
        const result = await browser.interact(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Interact error: " + result.error }], isError: true };
        }
        const content = [];
        if (result.screenshot) {
          content.push({ type: "image", data: result.screenshot.base64, mimeType: result.screenshot.mimeType });
        }
        const { screenshot, ...meta } = result;
        content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
        return { content };
      } catch (e) {
        return { content: [{ type: "text", text: "Interact failed: " + e.message }], isError: true };
      }
    }

    case "console_logs": {
      try {
        const browser = getBrowserModule();
        const result = await browser.captureConsole(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Console error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "Console failed: " + e.message }], isError: true };
      }
    }

    case "build_status": {
      const key = args.owner + "/" + args.repo + ":" + args.slug;
      const status = buildStatus[key] || { status: "unknown" };
      const srv = runningServers[key];
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            key,
            status: status.status,
            mode: status.mode,
            lastBuild: status.lastBuild ? new Date(status.lastBuild).toISOString() : null,
            commitSha: status.commitSha,
            serverPort: srv ? srv.port : null,
            serverRunning: srv ? srv.status === "running" : false,
            previewUrl: "/preview/" + args.owner + "/" + args.repo + "/" + args.slug + "/"
          }, null, 2)
        }]
      };
    }

    case "trigger_build": {
      const config = getConfig();
      const repoConfig = config.repos.find(r => r.owner === args.owner && r.repo === args.repo);
      if (!repoConfig) {
        return { content: [{ type: "text", text: "Repository not found: " + args.owner + "/" + args.repo }], isError: true };
      }
      const bc = repoConfig.activeBranches.find(b => branchSlug(b) === args.slug);
      if (!bc) {
        return { content: [{ type: "text", text: "Branch config not found for slug: " + args.slug }], isError: true };
      }
      deployBranch(repoConfig, bc);
      return {
        content: [{
          type: "text",
          text: (bc.mode === "server" ? "Server restart" : "Build") + " triggered for " + args.owner + "/" + args.repo + ":" + args.slug
        }]
      };
    }

    case "get_build_log": {
      const key = args.owner + "/" + args.repo + ":" + args.slug;
      const status = buildStatus[key];
      const log = (status && status.log) ? status.log : loadLog(key);
      return {
        content: [{
          type: "text",
          text: log || "No build log available for " + key
        }]
      };
    }

    case "reset_session": {
      const browser = getBrowserModule();
      if (args.owner && args.repo && args.slug) {
        const closed = browser.closeSession(args.owner, args.repo, args.slug);
        return {
          content: [{ type: "text", text: closed
            ? "Session reset for " + args.owner + "/" + args.repo + "/" + args.slug
            : "No active session for " + args.owner + "/" + args.repo + "/" + args.slug
          }]
        };
      }
      browser.closeAllSessions();
      return { content: [{ type: "text", text: "All browser sessions reset." }] };
    }

    case "run_test": {
      const browser = getBrowserModule();
      const result = await browser.runTest(args);
      if (result.error) {
        return { content: [{ type: "text", text: "Test error: " + result.error }], isError: true };
      }
      const content = [];
      // Screenshot of results
      if (result.screenshot) {
        content.push({
          type: "image",
          data: result.screenshot.base64,
          mimeType: result.screenshot.mimeType
        });
      }
      // Summary text
      const statsLine = result.stats.map(s => s.label + ": " + s.value).join(", ");
      content.push({
        type: "text",
        text: (result.passed ? "✓ ALL PASSED" : "✗ FAILURES DETECTED")
          + " (" + result.mode + " test)\n"
          + statsLine + "\n\n"
          + result.fullLog
      });
      return { content };
    }

    case "get_pixel_color": {
      try {
        const browser = getBrowserModule();
        const result = await browser.getPixelColor(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Pixel color error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "get_pixel_color failed: " + e.message }], isError: true };
      }
    }

    case "get_element_rect": {
      try {
        const browser = getBrowserModule();
        const result = await browser.getElementRect(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Element rect error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "get_element_rect failed: " + e.message }], isError: true };
      }
    }

    case "measure": {
      try {
        const browser = getBrowserModule();
        const result = await browser.measure(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Measure error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "measure failed: " + e.message }], isError: true };
      }
    }

    case "screenshot_diff": {
      try {
        const browser = getBrowserModule();
        const result = await browser.screenshotDiff(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Screenshot diff error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "screenshot_diff failed: " + e.message }], isError: true };
      }
    }

    case "emulate": {
      try {
        const browser = getBrowserModule();
        const result = await browser.emulate(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Emulate error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "emulate failed: " + e.message }], isError: true };
      }
    }

    case "storage": {
      try {
        const browser = getBrowserModule();
        const result = await browser.storage(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Storage error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "storage failed: " + e.message }], isError: true };
      }
    }

    case "performance": {
      try {
        const browser = getBrowserModule();
        const result = await browser.performanceMetrics(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Performance error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "performance failed: " + e.message }], isError: true };
      }
    }

    case "capture_requests": {
      try {
        const browser = getBrowserModule();
        const result = await browser.capturePreviewRequests(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Capture requests error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "capture_requests failed: " + e.message }], isError: true };
      }
    }

    case "download": {
      try {
        const browser = getBrowserModule();
        const result = await browser.captureDownload(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Download error: " + result.error }], isError: true };
        }
        // Return both the file info and the raw bytes (base64)
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              suggestedFilename: result.suggestedFilename,
              byteLength: result.byteLength,
              url: result.url,
              base64: result.base64
            }, null, 2)
          }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: "download failed: " + e.message }], isError: true };
      }
    }

    case "deploy_and_verify": {
      try {
        const browser = getBrowserModule();
        const result = await browser.deployAndVerify(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Deploy and verify error: " + result.error + (result.log ? "\n\n--- Build log tail ---\n" + result.log : "") }], isError: true };
        }
        const content = [];
        if (result.screenshot && result.screenshot.base64) {
          content.push({ type: "image", data: result.screenshot.base64, mimeType: result.screenshot.mimeType });
        }
        const { screenshot, ...meta } = result;
        content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
        return { content };
      } catch (e) {
        return { content: [{ type: "text", text: "deploy_and_verify failed: " + e.message }], isError: true };
      }
    }

    case "web_fetch": {
      try {
        const result = await runWebFetch(args);
        if (result.error) {
          return { content: [{ type: "text", text: "Fetch error: " + result.error }], isError: true };
        }
        return { content: [{ type: "text", text: formatWebFetchResult(result) }] };
      } catch (e) {
        return { content: [{ type: "text", text: "Fetch failed: " + e.message }], isError: true };
      }
    }

    default:
      return { content: [{ type: "text", text: "Unknown tool: " + name }], isError: true };
  }
}

// ── JSON-RPC 2.0 message handling ────────────────────────────────────────────

function makeResponse(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function makeError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return makeResponse(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });

    case "notifications/initialized":
      // No response needed for notifications
      return null;

    case "tools/list":
      return makeResponse(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params && params.name;
      const toolArgs = params && params.arguments || {};
      try {
        const result = await handleTool(toolName, toolArgs);
        return makeResponse(id, result);
      } catch (e) {
        return makeResponse(id, {
          content: [{ type: "text", text: "Tool error: " + e.message }],
          isError: true
        });
      }
    }

    case "ping":
      return makeResponse(id, {});

    default:
      if (id !== undefined) {
        return makeError(id, -32601, "Method not found: " + method);
      }
      return null; // Ignore unknown notifications
  }
}

// ── stdio transport ──────────────────────────────────────────────────────────

function startStdioServer() {
  // Detect whether we should exit when stdin closes:
  // - Direct execution: node server/mcp.js (require.main === module)
  // - Via --mcp-only flag: node server/index.js --mcp-only
  const isStandalone = require.main === module || process.argv.includes("--mcp-only");

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let buffer = "";

  process.stderr.write("[MCP] DeployView MCP server ready on stdio\n");

  rl.on("line", async (line) => {
    try {
      const msg = JSON.parse(line);
      const response = await handleMessage(msg);
      if (response) {
        process.stdout.write(response + "\n");
      }
    } catch (e) {
      // If we can't parse, try accumulating (for multi-line JSON)
      buffer += line;
      try {
        const msg = JSON.parse(buffer);
        buffer = "";
        const response = await handleMessage(msg);
        if (response) {
          process.stdout.write(response + "\n");
        }
      } catch (e2) {
        // Still not valid JSON, keep accumulating
        if (buffer.length > 100000) {
          process.stderr.write("[MCP] Buffer overflow, clearing\n");
          buffer = "";
        }
      }
    }
  });

  rl.on("close", () => {
    process.stderr.write("[MCP] stdin closed\n");
    // Only close the browser if it was previously loaded
    const cleanup = mcpBrowser
      ? mcpBrowser.closeBrowser().catch((e) => { process.stderr.write("[MCP] Browser cleanup error: " + e.message + "\n"); })
      : Promise.resolve();
    if (isStandalone) {
      // In standalone mode, exit the process after cleanup
      cleanup.then(() => process.exit(0));
    }
    // In combined mode (HTTP + MCP), just clean up — don't kill the HTTP server
  });
}

// ── Exports for HTTP integration ─────────────────────────────────────────────

module.exports = {
  TOOLS,
  handleTool,
  handleMessage,
  startStdioServer,
  MCP_VERSION,
  SERVER_NAME,
  SERVER_VERSION
};

// ── Direct execution ─────────────────────────────────────────────────────────
if (require.main === module) {
  startStdioServer();
}
