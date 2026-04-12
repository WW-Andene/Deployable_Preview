/**
 * mcp.js — Model Context Protocol (MCP) adapter for DeployView.
 *
 * Thin wrapper around the dv engine. Implements the MCP JSON-RPC 2.0
 * protocol over stdio and forwards every call to dv.listTools() /
 * dv.callTool(). All tool definitions, schemas, handlers, capability
 * gates, and result shapes live in server/dv/, not here.
 *
 * Usage:
 *   node server/mcp.js              # MCP stdio server (standalone)
 *   node server/index.js --mcp      # HTTP + MCP combined
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

"use strict";

const readline = require("readline");

// ── Load app modules ─────────────────────────────────────────────────────────
const { loadConfig, migrateConfig } = require("./config");

// Load config on startup
loadConfig();
migrateConfig();

// The dv engine — loading this registers every tool via side effects
const dv = require("./dv");

// Lazy-load the browser module only when we need it for the stdio cleanup
// path (so MCP stdio starts fast).
let mcpBrowser = null;
function getBrowserModule() {
  if (!mcpBrowser) mcpBrowser = require("./mcp-browser");
  return mcpBrowser;
}

// ── MCP Protocol constants ───────────────────────────────────────────────────
const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "deployview-mcp";
const SERVER_VERSION = "2.0.0";

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
      return null; // notifications have no response

    case "tools/list":
      // Strip our non-standard extras (category, requires) for strict MCP clients
      return makeResponse(id, {
        tools: dv.listTools().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      });

    case "tools/call": {
      const toolName = params && params.name;
      const toolArgs = (params && params.arguments) || {};
      const result = await dv.callTool(toolName, toolArgs);
      return makeResponse(id, result);
    }

    case "ping":
      return makeResponse(id, {});

    default:
      if (id !== undefined) {
        return makeError(id, -32601, "Method not found: " + method);
      }
      return null; // ignore unknown notifications
  }
}

// ── stdio transport ──────────────────────────────────────────────────────────

function startStdioServer() {
  const isStandalone = require.main === module || process.argv.includes("--mcp-only");

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let buffer = "";

  process.stderr.write("[MCP] DeployView MCP server ready on stdio (" + dv.listTools().length + " tools)\n");

  rl.on("line", async (line) => {
    try {
      const msg = JSON.parse(line);
      const response = await handleMessage(msg);
      if (response) process.stdout.write(response + "\n");
    } catch (_) {
      // Accumulate for multi-line JSON
      buffer += line;
      try {
        const msg = JSON.parse(buffer);
        buffer = "";
        const response = await handleMessage(msg);
        if (response) process.stdout.write(response + "\n");
      } catch (_2) {
        if (buffer.length > 100000) {
          process.stderr.write("[MCP] Buffer overflow, clearing\n");
          buffer = "";
        }
      }
    }
  });

  rl.on("close", () => {
    process.stderr.write("[MCP] stdin closed\n");
    const cleanup = mcpBrowser
      ? mcpBrowser.closeBrowser().catch((e) => { process.stderr.write("[MCP] Browser cleanup error: " + e.message + "\n"); })
      : Promise.resolve();
    if (isStandalone) {
      cleanup.then(() => process.exit(0));
    }
  });
}

// ── Legacy adapter for call sites that still ask for TOOLS / handleTool ──
//
// A few HTTP routes and older code paths still import { TOOLS, handleTool }
// from this module. Keep them as thin adapters over dv so we don't have to
// touch every caller at once.

function getLegacyTools() {
  return dv.listTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}

async function handleTool(name, args) {
  return dv.callTool(name, args);
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  get TOOLS() { return getLegacyTools(); },
  handleTool,
  handleMessage,
  startStdioServer,
  MCP_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  // new: direct access to the engine
  dv
};

// ── Direct execution ─────────────────────────────────────────────────────────
if (require.main === module) {
  startStdioServer();
}
