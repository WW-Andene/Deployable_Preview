/**
 * mcp-streamable-http.js — MCP Streamable HTTP Transport for DeployView
 *
 * Implements the MCP Streamable HTTP transport specification so that
 * remote clients (e.g. Claude web at claude.ai) can connect to this
 * MCP server over plain HTTP.
 *
 * Protocol overview:
 *   POST /mcp   — Client sends JSON-RPC 2.0 messages (initialize, tools/list, tools/call, etc.)
 *   GET  /mcp   — Client opens an SSE stream for server-initiated notifications
 *   DELETE /mcp — Client closes a session
 *
 * Session management via the Mcp-Session-Id header.
 */

const crypto = require("crypto");
const { handleMessage } = require("./mcp");

// ── Session store ────────────────────────────────────────────────────────────

const sessions = new Map();

// Clean up sessions idle for more than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastActivity < cutoff) {
      // Close any open SSE connections
      for (const client of session.sseClients) {
        if (!client.closed) client.res.end();
      }
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ── CORS helpers ─────────────────────────────────────────────────────────────

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

// ── Setup ────────────────────────────────────────────────────────────────────

/**
 * Mount the MCP Streamable HTTP transport on an Express app.
 * @param {import("express").Express} app - Express application
 * @param {string} endpoint - URL path to mount on (default: "/mcp")
 */
function setupStreamableHTTP(app, endpoint) {
  // ── CORS preflight ──
  app.options(endpoint, (req, res) => {
    setCorsHeaders(res);
    res.sendStatus(204);
  });

  // ── POST: Client → Server JSON-RPC messages ──
  app.post(endpoint, async (req, res) => {
    setCorsHeaders(res);

    const body = req.body;
    if (!body || typeof body !== "object" || body.jsonrpc !== "2.0") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request — expected JSON-RPC 2.0" }
      });
    }

    try {
      // ── Initialize: create a new session ──
      if (body.method === "initialize") {
        const sessionId = crypto.randomUUID();
        sessions.set(sessionId, {
          id: sessionId,
          lastActivity: Date.now(),
          sseClients: []
        });
        res.setHeader("Mcp-Session-Id", sessionId);

        const result = await handleMessage(body);
        if (result) {
          res.setHeader("Content-Type", "application/json");
          return res.send(result);
        }
        return res.sendStatus(202);
      }

      // ── Notifications (no id field) — accept with or without session ──
      if (body.method && body.id === undefined) {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId).lastActivity = Date.now();
        }
        await handleMessage(body);
        return res.sendStatus(202);
      }

      // ── All other requests require a valid session ──
      const sessionId = req.headers["mcp-session-id"];
      if (!sessionId || !sessions.has(sessionId)) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32000, message: "Bad Request: missing or invalid Mcp-Session-Id header" }
        });
      }
      sessions.get(sessionId).lastActivity = Date.now();
      res.setHeader("Mcp-Session-Id", sessionId);

      const result = await handleMessage(body);
      if (result) {
        res.setHeader("Content-Type", "application/json");
        return res.send(result);
      }
      return res.sendStatus(202);
    } catch (err) {
      console.error("[MCP-HTTP] Error:", err.message);
      return res.status(500).json({
        jsonrpc: "2.0",
        id: body.id || null,
        error: { code: -32603, message: err.message || "Internal error" }
      });
    }
  });

  // ── GET: SSE stream for server-initiated notifications ──
  app.get(endpoint, (req, res) => {
    setCorsHeaders(res);

    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(400).json({ error: "Bad Request: missing or invalid Mcp-Session-Id header" });
    }

    const session = sessions.get(sessionId);
    session.lastActivity = Date.now();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Mcp-Session-Id": sessionId
    });
    res.write(":ok\n\n");

    const client = { res, closed: false };
    session.sseClients.push(client);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      if (!client.closed) res.write(":ping\n\n");
    }, 30000);

    req.on("close", () => {
      client.closed = true;
      clearInterval(keepAlive);
      session.sseClients = session.sseClients.filter((c) => c !== client);
    });
  });

  // ── DELETE: Close session ──
  app.delete(endpoint, (req, res) => {
    setCorsHeaders(res);

    const sessionId = req.headers["mcp-session-id"];
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      // Close any open SSE connections
      for (const client of session.sseClients) {
        if (!client.closed) { client.closed = true; client.res.end(); }
      }
      sessions.delete(sessionId);
    }
    res.sendStatus(200);
  });
}

module.exports = { setupStreamableHTTP };
