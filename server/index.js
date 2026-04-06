const express = require("express");
const path = require("path");

const { loadConfig, getConfig, migrateConfig } = require("./config");
const { ghApi } = require("./github");
const { deployBranch } = require("./build");
const apiRoutes = require("./routes/api");
const previewRoutes = require("./routes/preview");

// ── MCP stdio mode ──
if (process.argv.includes("--mcp-only")) {
  // Run as pure MCP stdio server (no HTTP)
  const { startStdioServer } = require("./mcp");
  startStdioServer();
  return;
}

// ── Init ──
loadConfig();
migrateConfig();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Routes ──
app.use("/api", apiRoutes);
app.use(previewRoutes);

// ── Polling ──
const POLL_INTERVAL = 5000;

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

setInterval(pollForChanges, POLL_INTERVAL);

// ── Start ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("");
  console.log("  \u26a1 DeployView running on http://localhost:" + PORT);
  console.log("  Dashboard: http://localhost:" + PORT);
  console.log("  Previews:  http://localhost:" + PORT + "/preview/{owner}/{repo}/{branch}/");
  console.log("  MCP tools: http://localhost:" + PORT + "/api/mcp/tools");
  console.log("");

  // Start MCP stdio server alongside HTTP if --mcp flag passed
  if (process.argv.includes("--mcp")) {
    const { startStdioServer } = require("./mcp");
    startStdioServer();
    console.log("  MCP stdio server: active (reading from stdin)");
    console.log("");
  }

  const config = getConfig();
  if (config.token && config.repos.length) {
    console.log("  Auto-building " + config.repos.length + " repo(s)...");
    for (const repo of config.repos) {
      for (const bc of repo.activeBranches || []) deployBranch(repo, bc);
    }
  }
});
