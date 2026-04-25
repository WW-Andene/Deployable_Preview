// ── DV engine + legacy MCP sub-router ────────────────────────────────────────
// DV engine HTTP surface + legacy /api/mcp/* aliases

const express = require("express");
const router = express.Router();

const dv = require("../../dv");
const mcpBrowser = require("../../browser");

// ── DV engine HTTP surface ─────────────────────────────────────────────────

// Engine status: tool count, categories, library + Groq availability.
router.get("/dv/status", (req, res) => {
  res.json(dv.status());
});

// Full tool catalogue grouped by category. Optional ?category= filter.
router.get("/dv/tools", (req, res) => {
  if (req.query.category) {
    const grouped = dv.getToolsByCategory();
    if (!grouped[req.query.category]) {
      return res.status(404).json({
        error: "Unknown category: " + req.query.category,
        available: Object.keys(grouped)
      });
    }
    return res.json({ category: req.query.category, tools: grouped[req.query.category] });
  }
  res.json({ byCategory: dv.getToolsByCategory(), flat: dv.listTools() });
});

// Invoke any tool by name: POST /api/dv/call { tool, args }
router.post("/dv/call", async (req, res) => {
  const { tool, args } = req.body || {};
  if (!tool) return res.status(400).json({ error: "tool name required" });
  const result = await dv.callTool(tool, args || {});
  if (result.isError) res.status(400).json(result);
  else res.json(result);
});

// Named POST shortcut: POST /api/dv/call/:name — body IS the args object.
router.post("/dv/call/:name", async (req, res) => {
  const result = await dv.callTool(req.params.name, req.body || {});
  if (result.isError) res.status(400).json(result);
  else res.json(result);
});

// ── Legacy /api/mcp/* aliases ─────────────────────────────────────────────

router.get("/mcp/tools", (req, res) => {
  res.json({
    tools: dv.listTools(),
    playwrightAvailable: mcpBrowser.hasPlaywright(),
    hint: "POST /api/mcp/call with { tool, args } — or use /api/dv/call"
  });
});

router.post("/mcp/call", async (req, res) => {
  const { tool, args } = req.body || {};
  if (!tool) return res.status(400).json({ error: "tool name required" });
  const result = await dv.callTool(tool, args || {});
  res.json(result);
});

// Shortcut: screenshot
router.get("/mcp/screenshot/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.takeScreenshot({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      width: parseInt(req.query.width) || 1280,
      height: parseInt(req.query.height) || 720,
      fullPage: req.query.fullPage === "true",
      selector: req.query.selector
    });
    if (result.error) return res.status(500).json({ error: result.error });
    if (req.query.format === "json") return res.json(result);
    // Return as image
    const buf = Buffer.from(result.base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", buf.length);
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: inspect
router.get("/mcp/inspect/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.inspectDOM({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      selector: req.query.selector
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: console logs
router.get("/mcp/console/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.captureConsole({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      duration: parseInt(req.query.duration) || 3
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shortcut: interact
router.post("/mcp/interact/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.interact({
      owner: req.params.owner,
      repo: req.params.repo,
      slug: req.params.slug,
      ...req.body
    });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List previews (for MCP dashboard)
router.get("/mcp/previews", (req, res) => {
  res.json(mcpBrowser.listPreviews());
});

// ── New MCP primitives (HTTP shortcuts) ───────────────────────────────────

// Pixel color at (x, y)
router.get("/mcp/pixel/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.getPixelColor({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      x: parseFloat(req.query.x),
      y: parseFloat(req.query.y),
      width:  parseInt(req.query.width, 10) || undefined,
      height: parseInt(req.query.height, 10) || undefined
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Element rect + computed styles
router.get("/mcp/rect/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.getElementRect({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      selector: req.query.selector,
      width:  parseInt(req.query.width, 10) || undefined,
      height: parseInt(req.query.height, 10) || undefined
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Measure distance between two points/selectors
router.post("/mcp/measure/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.measure({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      ...req.body
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Screenshot diff — accepts { before, after, threshold? } as JSON
router.post("/mcp/screenshot-diff", async (req, res) => {
  try {
    const result = await mcpBrowser.screenshotDiff(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Emulate environment (DPR, dark mode, geolocation, network throttle…)
router.post("/mcp/emulate/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.emulate({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      ...req.body
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Storage CRUD (cookies / localStorage / sessionStorage)
router.post("/mcp/storage/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.storage({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      ...req.body
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Performance metrics
router.get("/mcp/perf/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.performanceMetrics({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      reload: req.query.reload === "true"
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Network request capture (duration-based)
router.get("/mcp/requests/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.capturePreviewRequests({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      duration: parseFloat(req.query.duration) || 5,
      maxRequests: parseInt(req.query.maxRequests, 10) || undefined,
      reload: req.query.reload === "true"
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deploy + verify one-shot
router.post("/mcp/deploy-and-verify/:owner/:repo/:slug", async (req, res) => {
  try {
    const result = await mcpBrowser.deployAndVerify({
      owner: req.params.owner,
      repo:  req.params.repo,
      slug:  req.params.slug,
      ...req.body
    });
    if (result.error) return res.status(500).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
