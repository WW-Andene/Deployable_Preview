// F-M015: best-effort dotenv loader. Reads .env from the project root if the
// dotenv module is available; falls back to a hand-rolled parser so users
// don't need to install it. Order: .env then .env.local (local overrides).
(function loadDotenv() {
  const fsLocal = require("fs");
  const pathLocal = require("path");
  const root = pathLocal.join(__dirname, "..");
  const files = [".env", ".env.local"];
  for (const f of files) {
    const file = pathLocal.join(root, f);
    if (!fsLocal.existsSync(file)) continue;
    try {
      const lines = fsLocal.readFileSync(file, "utf8").split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const k = line.slice(0, eq).trim();
        let v = line.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch (_) { /* ignore */ }
  }
})();

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
const { deployBranch } = require("./build");
const apiRoutes = require("./routes/api");
const previewRoutes = require("./routes/preview");
const { setupStreamableHTTP } = require("./mcp-streamable-http");
const { ensureBrowser } = require("./browser-setup");

// ── Termux runtime env setup ──
// On Termux, native modules and chrome-launcher need env vars pointing
// to system libraries. Set them early so every require() sees them.
const isTermux = !!process.env.TERMUX_VERSION || (process.env.PREFIX || "").includes("com.termux");
if (isTermux) {
  const PREFIX = process.env.PREFIX || "/data/data/com.termux/files/usr";
  if (!process.env.PKG_CONFIG_PATH) process.env.PKG_CONFIG_PATH = PREFIX + "/lib/pkgconfig";
  if (!process.env.LD_LIBRARY_PATH) process.env.LD_LIBRARY_PATH = PREFIX + "/lib";
  if (!process.env.SHARP_FORCE_GLOBAL_LIBVIPS) process.env.SHARP_FORCE_GLOBAL_LIBVIPS = "true";
  if (!process.env.CHROME_PATH) {
    try {
      process.env.CHROME_PATH = execSync(
        "which chromium-browser 2>/dev/null || which chromium 2>/dev/null",
        { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }
      ).toString().trim();
    } catch (_) {}
  }
}

// ── Startup validation ──
(function checkPrerequisites() {
  // Node version check (F-O005: bumped to 20 — node:test is used in tests
  // and the http.lookup option is widely available since 16+ but cleaner on 20+)
  const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeVersion < 20) {
    console.error("  ✗ Node.js 20+ required (found v" + process.versions.node + ")");
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
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }  // preserve raw body for webhook HMAC
}));

// ── Request logging with timing ──
if (process.env.LOG_REQUESTS !== "false") {
  app.use((req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - start;
      const status = res.statusCode;
      // Only log API requests and slow static requests
      if (req.url.startsWith("/api") || req.url.startsWith("/mcp") || duration > 500) {
        console.log("[HTTP] " + req.method + " " + req.url + " " + status + " " + duration + "ms");
      }
      originalEnd.apply(res, args);
    };
    next();
  });
}

// H4: custom domains — must come BEFORE static + router so that a
// CNAMEd hostname (preview.example.com) gets rewritten to its target
// /preview/owner/repo/slug/ path before any other matching happens.
app.use(require("./custom-domains").customDomainsMiddleware);

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
  let tunnelInfo = null;
  try { tunnelInfo = require("./tunnel").status(); } catch (_) {}
  // Calculate workspace disk usage
  let workspaceSize = null;
  try {
    const { WORKSPACE } = require("./build");
    if (fs.existsSync(WORKSPACE)) {
      const dirs = fs.readdirSync(WORKSPACE);
      workspaceSize = { dirs: dirs.length };
    }
  } catch (_) {}
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    version: require("../package.json").version,
    node: process.versions.node,
    repos: config.repos.length,
    previews: { ready: readyCount, building: buildingCount, error: errorCount, servers: serverCount },
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
    tunnel: tunnelInfo && tunnelInfo.url ? { url: tunnelInfo.url, provider: tunnelInfo.provider } : null,
    workspace: workspaceSize
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

// ── Graceful shutdown ──
let httpServer = null;

// Track in-flight shutdown so a second SIGINT doesn't fork the work.
let _shuttingDown = false;
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log("\n  [" + signal + "] Shutting down gracefully...");

  // Kill all running server processes
  const { runningServers, killServer } = require("./process");
  for (const key in runningServers) {
    console.log("  Stopping server: " + key);
    try { killServer(key); } catch (e) { console.warn("  killServer(" + key + ") failed: " + e.message); }
  }

  // Close Playwright browser — actually await so the connection closes.
  try {
    const mcpBrowser = require("./browser");
    await mcpBrowser.closeBrowser();
  } catch (e) { console.warn("  Browser close failed: " + e.message); }

  // Stop the tunnel before HTTP — otherwise the tunnel keeps the event loop alive.
  try { require("./tunnel").stop(); } catch (_) {}

  // Close HTTP and HTTPS servers, awaiting both, with a 5s force-exit fallback.
  const closes = [];
  if (httpServer)  closes.push(new Promise((resolve) => httpServer.close(() => resolve())));
  if (httpsServer) closes.push(new Promise((resolve) => httpsServer.close(() => resolve())));
  const force = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([Promise.all(closes), force]);
  console.log("  Server(s) closed.");
  process.exit(0);
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

  // Only set up browser if explicitly enabled in preferences
  const prefs = getConfig().preferences || {};
  if (prefs.browser && prefs.browser !== "off") {
    console.log("  Setting up browser: " + prefs.browser + "...");
    ensureBrowser().catch(() => {});
  } else {
    console.log("  Browser tools: off (enable in Settings)");
  }

  // ── Background: auto-install missing MCP enrichment libraries ──
  //
  // Without blocking startup, check whether any of the ~30 optional
  // library-backed MCP tools are missing their npm package and trigger
  // a background `npm install` for whatever's absent. Libraries are
  // lazy-loaded inside the tools so anything that finishes installing
  // becomes available immediately on the next tool call.
  if (process.env.DEPLOYVIEW_SKIP_ENRICHMENTS !== "1") {
    try {
      const { LIBS, isInstalled } = require("../scripts/install-enrichments");
      const missing = LIBS.filter((lib) => !isInstalled(lib));
      if (missing.length) {
        console.log("  Enrichments: " + missing.length + " missing — installing in background");
        const { spawn } = require("child_process");
        const child = spawn(
          "node",
          [path.join(__dirname, "..", "scripts", "install-enrichments.js"), "--quiet"],
          {
            cwd: path.join(__dirname, ".."),
            stdio: ["ignore", "pipe", "pipe"],
            detached: false
          }
        );
        child.stdout.on("data", (d) => process.stdout.write("[enrichments] " + d.toString()));
        child.stderr.on("data", (d) => process.stderr.write("[enrichments] " + d.toString()));
        child.on("exit", (code) => {
          if (code === 0) console.log("  Enrichments: install finished, tools now available");
          else console.warn("  Enrichments: installer exited with code " + code);
        });
        child.on("error", (e) => console.warn("  Enrichments: spawn error: " + e.message));
      } else {
        console.log("  Enrichments: all libraries present");
      }
    } catch (e) {
      console.warn("  Enrichments: check failed: " + e.message);
    }
  }
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
