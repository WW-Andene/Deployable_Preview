/**
 * dv/index.js — DeployView engine facade.
 *
 * Importing this file gives you the full dv API AND triggers registration
 * of every tool in dv/tools/*.js (via side-effect imports). Any code that
 * wants to dispatch a DV tool should go through here — mcp.js, the HTTP
 * REST layer, tests, future dashboards, etc.
 *
 *   const dv = require("./dv");
 *   const tools = dv.listTools();
 *   const result = await dv.callTool("screenshot", { owner, repo, slug });
 */

"use strict";

const core = require("./core");

// Load all tool categories — each file calls defineTool() at module load
// time. This is the one and only place that triggers registration.
require("./tools");

module.exports = core;
