// ── MCP stdio mode (checked first to avoid loading HTTP modules / timers) ──
if (process.argv.includes("--mcp-only")) {
  // Run as pure MCP stdio server (no HTTP)
  const { startStdioServer } = require("./mcp");
  startStdioServer();
  return;
}

const express = require("express");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const { loadConfig, getConfig, migrateConfig } = require("./config");
const { ghApi } = require("./github");
const { deployBranch } = require("./build");
const apiRoutes = require("./routes/api");
const previewRoutes = require("./routes/preview");
const { setupStreamableHTTP } = require("./mcp-streamable-http");

// ── Startup validation ──
(function checkPrerequisites() {
  // Node version check
  const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeVersion < 18) {
    console.error("  ✗ Node.js 18+ required (found v" + process.versions.node + ")");
    process.exit(1);
  }
  // git check
  try {
    execSync("git --version", { stdio: "pipe" });
  } catch (e) {
    console.error("  ✗ git is not installed or not in PATH");
    process.exit(1);
  }
})();

// ── Init ──
loadConfig();
migrateConfig();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Health check ──
app.get("/api/health", (req, res) => {
  const { buildStatus } = require("./build");
  const { runningServers } = require("./process");
  const config = getConfig();
  let readyCount = 0, buildingCount = 0, errorCount = 0, serverCount = 0;
  for (const key in buildStatus) {
    const s = buildStatus[key].status;
    if (s === "ready") readyCount++;
    else if (s === "running") { readyCount++; serverCount++; }
    else if (s === "building") buildingCount++;
    else if (s === "error") errorCount++;
  }
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    version: require("../package.json").version,
    node: process.versions.node,
    repos: config.repos.length,
    previews: { ready: readyCount, building: buildingCount, error: errorCount, servers: serverCount },
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB"
  });
});

// ── Routes ──
app.use("/api", apiRoutes);
setupStreamableHTTP(app, "/mcp");
app.use(previewRoutes);

// ── Global error handler ──
app.use((err, req, res, _next) => {
  console.error("[ERROR] " + req.method + " " + req.url + ":", err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Polling ──
const POLL_INTERVAL = 5000;
let pollIntervalId = null;

async function pollForChanges() {
  const config = getConfig();
  if (!config.token) return;
  for (const repo of config.repos) {
    const branchNames = [...new Set((repo.activeBranches || []).map((bc) => bc.branch))];
    for (const branch of branchNames) {
      try {
        const data = await ghApi("/repos/" + repo.owner + "/" + repo.repo + "/commits?sha=" + branch + "&per_page=1", config.token);
        const latest = data[0];
        if (!latest) continue;
        const { buildKey, buildStatus } = require("./build");
        for (const bc of repo.activeBranches) {
          if (bc.branch !== branch) continue;
          const key = buildKey(repo.owner, repo.repo, bc);
          const current = buildStatus[key];
          if (current && current.commitSha && current.commitSha !== latest.sha && current.status !== "building") {
            console.log("[POLL] New commit on " + key + ": " + latest.sha.slice(0, 7));
            deployBranch(repo, bc);
          }
        }
      } catch (e) { /* ignore */ }
    }
  }
}

pollIntervalId = setInterval(pollForChanges, POLL_INTERVAL);

// ── Graceful shutdown ──
let httpServer = null;

function shutdown(signal) {
  console.log("\n  [" + signal + "] Shutting down gracefully...");

  if (pollIntervalId) clearInterval(pollIntervalId);

  // Kill all running server processes
  const { runningServers, killServer } = require("./process");
  for (const key in runningServers) {
    console.log("  Stopping server: " + key);
    killServer(key);
  }

  // Close Playwright browser
  try {
    const mcpBrowser = require("./mcp-browser");
    mcpBrowser.closeBrowser().catch(() => {});
  } catch (e) { /* not loaded */ }

  // Close HTTP and HTTPS servers
  let pendingClose = 0;
  function onServerClosed() {
    pendingClose--;
    if (pendingClose <= 0) {
      console.log("  Server(s) closed.");
      process.exit(0);
    }
  }
  if (httpServer) { pendingClose++; httpServer.close(onServerClosed); }
  if (httpsServer) { pendingClose++; httpsServer.close(onServerClosed); }
  if (pendingClose > 0) {
    // Force exit after 5s if graceful close hangs
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Catch unhandled errors to prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message);
  console.error(err.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("[WARN] Unhandled promise rejection:", reason);
});

// ── Start ──
const PORT = process.env.PORT || 3000;

// ── Optional HTTPS support ──
// Set HTTPS_CERT and HTTPS_KEY env vars (file paths) to enable TLS.
// This is required for Claude web (claude.ai) MCP integration, which
// requires an HTTPS endpoint.
const certPath = process.env.HTTPS_CERT;
const keyPath  = process.env.HTTPS_KEY;
let httpsServer = null;

if (certPath && keyPath) {
  try {
    const https = require("https");
    const tlsOpts = {
      cert: fs.readFileSync(certPath),
      key:  fs.readFileSync(keyPath)
    };
    const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
    httpsServer = https.createServer(tlsOpts, app).listen(HTTPS_PORT, () => {
      console.log("");
      console.log("  🔒 DeployView HTTPS running on https://localhost:" + HTTPS_PORT);
      console.log("    MCP HTTPS:     https://localhost:" + HTTPS_PORT + "/mcp  (for Claude web)");
    });
  } catch (e) {
    console.error("  ⚠ Failed to start HTTPS server: " + e.message);
    console.error("    Check HTTPS_CERT and HTTPS_KEY environment variables.");
  }
}

httpServer = app.listen(PORT, () => {
  console.log("");
  console.log("  ⚡ DeployView running on http://localhost:" + PORT);
  console.log("");
  console.log("  All modes active simultaneously:");
  console.log("    Static pages:  http://localhost:" + PORT + "/preview/{owner}/{repo}/{branch}/");
  console.log("    Server proxy:  http://localhost:" + PORT + "/preview/{owner}/{repo}/{branch}/  (server-mode branches)");
  console.log("    MCP stdio:     reading from stdin (for Claude Desktop / Termux)");
  console.log("    MCP HTTP:      http://localhost:" + PORT + "/mcp  (Streamable HTTP for claude.ai)");
  console.log("    Web Fetch API: POST http://localhost:" + PORT + "/api/fetch");
  console.log("    MCP tools:     http://localhost:" + PORT + "/api/mcp/tools");
  console.log("    Dashboard:     http://localhost:" + PORT);
  console.log("    Health:        http://localhost:" + PORT + "/api/health");
  if (!httpsServer) {
    console.log("");
    console.log("  💡 For Claude web (HTTPS), set HTTPS_CERT and HTTPS_KEY env vars:");
    console.log("     HTTPS_CERT=cert.pem HTTPS_KEY=key.pem npm start");
  }
  console.log("");

  // Always start MCP stdio server alongside HTTP —
  // this makes all modes (static, server, MCP, web fetch) run simultaneously.
  // Use --no-mcp to disable stdio MCP if stdin is not a terminal / not needed.
  if (!process.argv.includes("--no-mcp")) {
    const { startStdioServer } = require("./mcp");
    startStdioServer();
  }

  const config = getConfig();
  if (config.token && config.repos.length) {
    console.log("  Auto-building " + config.repos.length + " repo(s)...");
    for (const repo of config.repos) {
      for (const bc of repo.activeBranches || []) deployBranch(repo, bc);
    }
  }
});
