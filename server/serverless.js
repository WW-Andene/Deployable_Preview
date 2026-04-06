const fs = require("fs");
const path = require("path");

// Scan for Vercel-style serverless functions in api/ directory
// Supports: api/foo.js -> /api/foo, api/bar/baz.js -> /api/bar/baz
// Supports: api/[...path].js -> /api/* catch-all
function scanApiRoutes(workDir, addLog) {
  const apiDir = path.join(workDir, "api");
  if (!fs.existsSync(apiDir)) return null;

  const routes = [];
  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + "/" + entry.name);
      } else if (entry.name.endsWith(".js")) {
        const name = entry.name.replace(/\.js$/, "");
        let routePath;
        let isCatchAll = false;

        if (name.match(/^\[\.\.\..*\]$/)) {
          // Catch-all: [...path].js -> /*
          const paramName = name.slice(4, -1); // extract "path" from "[...path]"
          routePath = prefix + "/*";
          isCatchAll = true;
          routes.push({ routePath, filePath: full, paramName, isCatchAll });
        } else if (name === "index") {
          routePath = prefix || "/";
          routes.push({ routePath, filePath: full, paramName: null, isCatchAll });
        } else {
          routePath = prefix + "/" + name;
          routes.push({ routePath, filePath: full, paramName: null, isCatchAll });
        }
      }
    }
  }

  walk(apiDir, "/api");

  if (routes.length > 0) {
    addLog("Found " + routes.length + " serverless function(s):");
    for (const r of routes) addLog("  " + r.routePath + " -> " + path.relative(workDir, r.filePath));
  }

  return routes.length > 0 ? routes : null;
}

// Execute a serverless function handler
function executeHandler(route, envVars, req, res) {
  // Set env vars before requiring the module
  for (const k in envVars) process.env[k] = envVars[k];

  // Clear require cache so changes are picked up on rebuild
  try { delete require.cache[require.resolve(route.filePath)]; } catch (_) { /* file may no longer exist */ }

  let handler;
  try {
    const mod = require(route.filePath);
    handler = mod.default || mod;
  } catch (e) {
    console.error("[SERVERLESS] Failed to load " + route.filePath + ": " + e.message);
    res.status(500).json({ error: "Function load error: " + e.message });
    return;
  }

  if (typeof handler !== "function") {
    res.status(500).json({ error: "No default export function in " + path.basename(route.filePath) });
    return;
  }

  // For catch-all routes, set req.query.path to remaining segments
  if (route.isCatchAll && route.paramName) {
    const prefix = route.routePath.replace("/*", "");
    const remaining = req.path.slice(prefix.length).replace(/^\//, "");
    if (!req.query) req.query = {};
    req.query[route.paramName] = remaining.split("/").filter(Boolean);
  }

  try {
    const result = handler(req, res);
    // Handle async handlers
    if (result && typeof result.catch === "function") {
      result.catch(function(e) {
        console.error("[SERVERLESS] " + route.routePath + " error: " + e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message });
      });
    }
  } catch (e) {
    console.error("[SERVERLESS] " + route.routePath + " error: " + e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
}

module.exports = { scanApiRoutes, executeHandler };
