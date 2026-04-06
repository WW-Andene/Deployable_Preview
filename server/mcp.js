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
const { webFetch } = require("./web-fetch");

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
    description: "Take a screenshot of a deployed app preview. Returns a PNG image. Requires Puppeteer to be installed.",
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
    description: "Perform an action on a deployed preview — click buttons, type text, scroll, hover, or navigate. Returns a screenshot after the action.",
    inputSchema: {
      type: "object",
      properties: {
        owner:    { type: "string", description: "Repository owner" },
        repo:     { type: "string", description: "Repository name" },
        slug:     { type: "string", description: "Branch slug" },
        action:   { type: "string", enum: ["click", "type", "select", "scroll", "hover", "navigate"], description: "Action to perform" },
        selector: { type: "string", description: "CSS selector of the target element" },
        value:    { type: "string", description: "Value for type/select/scroll/navigate actions" },
        x:        { type: "number", description: "X coordinate for click/hover (alternative to selector)" },
        y:        { type: "number", description: "Y coordinate for click/hover (alternative to selector)" }
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
    name: "web_fetch",
    description: "Fetch a URL and extract its content. Supports HTML pages (extracts readable text, links, meta tags), JSON APIs, and plain text. Use this to read web pages, scrape content, check API responses, or download text data from the internet. Works without Puppeteer.",
    inputSchema: {
      type: "object",
      properties: {
        url:          { type: "string", description: "URL to fetch (http or https)" },
        method:       { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"], description: "HTTP method (default: GET)" },
        headers:      { type: "object", description: "Custom request headers as key-value pairs" },
        body:         { type: "string", description: "Request body for POST/PUT/PATCH requests" },
        timeout:      { type: "number", description: "Request timeout in milliseconds (default: 15000, max: 30000)" },
        extractText:  { type: "boolean", description: "For HTML: strip tags and return readable text (default: true for HTML)" },
        extractLinks: { type: "boolean", description: "For HTML: extract all links with their text" },
        extractMeta:  { type: "boolean", description: "For HTML: extract meta tags (title, description, Open Graph, etc.)" },
        selector:     { type: "string", description: "For HTML: extract content from specific tag (e.g. 'article', 'main', 'p')" }
      },
      required: ["url"]
    }
  }
];

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
            puppeteerAvailable: browser.hasPuppeteer(),
            hint: previews.length === 0
              ? "No previews are deployed. Add a repo and build a branch first via the DeployView dashboard."
              : "Use the owner, repo, and slug from a preview to take screenshots, inspect, or interact."
          }, null, 2)
        }]
      };
    }

    case "screenshot": {
      const browser = getBrowserModule();
      const result = await browser.takeScreenshot(args);
      if (result.error) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }
      return {
        content: [
          { type: "image", data: result.base64, mimeType: result.mimeType },
          { type: "text", text: "Screenshot of " + result.url + " (" + result.width + "x" + result.height + ") — " + result.title }
        ]
      };
    }

    case "inspect": {
      const browser = getBrowserModule();
      const result = await browser.inspectDOM(args);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    case "interact": {
      const browser = getBrowserModule();
      const result = await browser.interact(args);
      if (result.error) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }
      const content = [];
      if (result.screenshot) {
        content.push({ type: "image", data: result.screenshot.base64, mimeType: result.screenshot.mimeType });
      }
      const { screenshot, ...meta } = result;
      content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
      return { content };
    }

    case "console_logs": {
      const browser = getBrowserModule();
      const result = await browser.captureConsole(args);
      if (result.error) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
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

    case "web_fetch": {
      const result = await webFetch(args);
      if (result.error) {
        return { content: [{ type: "text", text: "Fetch error: " + result.error }], isError: true };
      }
      // Build a clean text summary for the AI
      const parts = [];
      parts.push("URL: " + result.url);
      parts.push("Status: " + result.statusCode);
      parts.push("Content-Type: " + result.contentType);
      if (result.truncated) parts.push("⚠ Response was truncated (exceeded size limit)");
      if (result.title) parts.push("Title: " + result.title);
      if (result.json !== undefined) {
        parts.push("\n" + JSON.stringify(result.json, null, 2));
      } else if (result.text) {
        parts.push("\n" + result.text);
      } else if (result.body) {
        parts.push("\n" + result.body);
      }
      if (result.links && result.links.length) {
        parts.push("\n--- Links (" + result.links.length + ") ---");
        // Show first 100 links in MCP response to keep it manageable
        for (const link of result.links.slice(0, 100)) {
          parts.push((link.text ? link.text + " → " : "") + link.href);
        }
        if (result.links.length > 100) {
          parts.push("... and " + (result.links.length - 100) + " more links");
        }
      }
      if (result.meta && Object.keys(result.meta).length) {
        parts.push("\n--- Meta Tags ---");
        for (const k in result.meta) {
          parts.push(k + ": " + result.meta[k]);
        }
      }
      return {
        content: [{
          type: "text",
          text: parts.join("\n")
        }]
      };
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
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let buffer = "";

  process.stderr.write("[MCP] DeployView MCP server starting on stdio...\n");

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
    process.stderr.write("[MCP] stdin closed, shutting down\n");
    const browser = getBrowserModule();
    browser.closeBrowser().catch((e) => { process.stderr.write("[MCP] Browser cleanup error: " + e.message + "\n"); }).then(() => process.exit(0));
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
