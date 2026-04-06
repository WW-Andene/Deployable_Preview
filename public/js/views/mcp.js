(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.mcp = function(app) {
  var ct = el("div", { s: { maxWidth: "960px", margin: "0 auto", padding: "calc(var(--sp) * 3) calc(var(--sp) * 2.5)" } });

  // Header
  ct.appendChild(el("div", { s: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" } }, [
    el("span", { s: { fontSize: "24px" } }, "🔌"),
    el("h2", { s: { fontSize: "var(--text-xl)", fontWeight: "700", flex: "1", letterSpacing: "-0.03em" } }, "MCP Server Tools"),
    el("span", { c: "chip on", s: { fontSize: "11px" } }, "Model Context Protocol")
  ]));

  // Status panel
  var statusPanel = el("div", { c: "card", s: { marginBottom: "20px" } });
  var statusHeader = el("div", { s: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } });
  statusHeader.appendChild(el("h3", { s: { fontSize: "14px", fontWeight: "600" } }, "Server Status"));
  var puppeteerDot = el("span", { c: "dot idle", s: { marginLeft: "auto" } });
  var puppeteerLabel = el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx3)" } }, "Checking Puppeteer...");
  statusHeader.appendChild(puppeteerDot);
  statusHeader.appendChild(puppeteerLabel);
  statusPanel.appendChild(statusHeader);

  // Fetch MCP status
  fetch("/api/mcp/tools").then(function(r) { return r.json(); }).then(function(data) {
    if (data.puppeteerAvailable) {
      puppeteerDot.className = "dot ok";
      puppeteerLabel.textContent = "Puppeteer available — screenshots & interaction enabled";
      puppeteerLabel.style.color = "var(--ok)";
    } else {
      puppeteerDot.className = "dot err";
      puppeteerLabel.textContent = "Puppeteer not installed — run: npm install puppeteer";
      puppeteerLabel.style.color = "var(--err)";
    }
  }).catch(function() {
    puppeteerLabel.textContent = "Could not reach MCP endpoint";
    puppeteerDot.className = "dot err";
  });

  // Connection info
  statusPanel.appendChild(el("div", { s: { background: "var(--sf1)", borderRadius: "6px", padding: "12px 14px", marginBottom: "12px" } }, [
    el("div", { s: { fontWeight: "600", fontSize: "12px", marginBottom: "8px", color: "var(--accent)" } }, "Claude Desktop Configuration"),
    el("pre", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", lineHeight: "1.7", whiteSpace: "pre-wrap", wordBreak: "break-all" } },
      '{\n  "mcpServers": {\n    "deployview": {\n      "command": "node",\n      "args": ["server/mcp.js"],\n      "cwd": "/path/to/Deployable_Preview"\n    }\n  }\n}')
  ]));

  // Claude Web (Streamable HTTP) connection info
  statusPanel.appendChild(el("div", { s: { background: "var(--sf1)", borderRadius: "6px", padding: "12px 14px", marginBottom: "12px" } }, [
    el("div", { s: { fontWeight: "600", fontSize: "12px", marginBottom: "8px", color: "var(--accent)" } }, "Claude Web (claude.ai) — Streamable HTTP"),
    el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", lineHeight: "1.8" } }, [
      el("div", {}, "Endpoint: " + window.location.origin + "/mcp"),
      el("div", {}, "Protocol: MCP Streamable HTTP (JSON-RPC 2.0)"),
      el("div", { s: { marginTop: "6px", color: "var(--tx3)", fontSize: "10px" } }, "In claude.ai → Settings → Integrations, add this URL as an MCP server.")
    ])
  ]));

  // HTTP endpoints reference
  statusPanel.appendChild(el("div", { s: { background: "var(--sf1)", borderRadius: "6px", padding: "12px 14px" } }, [
    el("div", { s: { fontWeight: "600", fontSize: "12px", marginBottom: "8px", color: "var(--accent)" } }, "HTTP API Endpoints"),
    el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", lineHeight: "2" } }, [
      el("div", {}, "POST /mcp — MCP Streamable HTTP (for Claude web)"),
      el("div", {}, "GET  /api/mcp/tools — List available tools"),
      el("div", {}, "POST /api/mcp/call — Invoke any MCP tool"),
      el("div", {}, "POST /api/fetch — Fetch/scrape a URL"),
      el("div", {}, "GET  /api/fetch?url=... — Quick URL fetch"),
      el("div", {}, "GET  /api/mcp/screenshot/:owner/:repo/:slug — Screenshot"),
      el("div", {}, "GET  /api/mcp/inspect/:owner/:repo/:slug — DOM inspection"),
      el("div", {}, "GET  /api/mcp/console/:owner/:repo/:slug — Console logs"),
      el("div", {}, "POST /api/mcp/interact/:owner/:repo/:slug — Interact"),
      el("div", {}, "GET  /api/mcp/previews — List active previews"),
      el("div", {}, "GET  /api/health — Server health check")
    ])
  ]));

  ct.appendChild(statusPanel);

  // Available tools
  ct.appendChild(el("h3", { s: { fontSize: "14px", fontWeight: "600", marginBottom: "12px" } }, "Available Tools (" + S.mcpTools.length + ")"));

  for (var i = 0; i < S.mcpTools.length; i++) {
    (function(tool) {
      var toolCard = el("div", { c: "card", s: { marginBottom: "8px", padding: "calc(var(--sp) * 1.5) calc(var(--sp) * 2)" } });
      var toolHeader = el("div", { s: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" } });
      toolHeader.appendChild(el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: "600", color: "var(--accent)" } }, tool.name));
      var props = tool.inputSchema && tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : [];
      var required = tool.inputSchema && tool.inputSchema.required || [];
      if (props.length) {
        toolHeader.appendChild(el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--tx3)" } },
          "(" + props.map(function(p) { return required.indexOf(p) >= 0 ? p : p + "?"; }).join(", ") + ")"
        ));
      }
      toolCard.appendChild(toolHeader);
      toolCard.appendChild(el("p", { s: { fontSize: "12px", color: "var(--tx2)", lineHeight: "1.6", margin: "0" } }, tool.description));
      ct.appendChild(toolCard);
    })(S.mcpTools[i]);
  }

  // ── Web Fetch panel ──────────────────────────────────────────────────────
  ct.appendChild(el("h3", { s: { fontSize: "14px", fontWeight: "600", marginTop: "24px", marginBottom: "12px" } }, "🌐 Web Fetch"));

  var fetchPanel = el("div", { c: "card", s: { marginBottom: "20px" } });
  var fetchUrl = el("input", { attr: { type: "text", placeholder: "https://example.com", id: "mcp-fetch-url" }, s: { width: "100%", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", background: "var(--sf1)", border: "1px solid var(--sf3)", borderRadius: "6px", color: "var(--tx1)", boxSizing: "border-box", marginBottom: "8px" } });
  fetchPanel.appendChild(fetchUrl);

  var fetchOpts = el("div", { s: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" } });

  var fetchExtractText = el("label", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } });
  var chkText = el("input", { attr: { type: "checkbox", checked: "checked" } });
  fetchExtractText.appendChild(chkText);
  fetchExtractText.appendChild(document.createTextNode("Text"));
  fetchOpts.appendChild(fetchExtractText);

  var fetchExtractLinks = el("label", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } });
  var chkLinks = el("input", { attr: { type: "checkbox" } });
  fetchExtractLinks.appendChild(chkLinks);
  fetchExtractLinks.appendChild(document.createTextNode("Links"));
  fetchOpts.appendChild(fetchExtractLinks);

  var fetchExtractMeta = el("label", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } });
  var chkMeta = el("input", { attr: { type: "checkbox" } });
  fetchExtractMeta.appendChild(chkMeta);
  fetchExtractMeta.appendChild(document.createTextNode("Meta"));
  fetchOpts.appendChild(fetchExtractMeta);

  var selectorInput = el("input", { attr: { type: "text", placeholder: "tag filter (e.g. article)" }, s: { width: "140px", padding: "4px 8px", fontFamily: "var(--font-mono)", fontSize: "11px", background: "var(--sf1)", border: "1px solid var(--sf3)", borderRadius: "4px", color: "var(--tx1)" } });
  fetchOpts.appendChild(selectorInput);

  var fetchBtn = el("button", { c: "bg bs", s: { background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)", marginLeft: "auto", padding: "6px 16px", cursor: "pointer", fontWeight: "600", fontSize: "12px" }, on: { click: function() {
    var urlVal = fetchUrl.value.trim();
    if (!urlVal) return;
    fetchResultDiv.innerHTML = "";
    fetchResultDiv.appendChild(el("div", { s: { color: "var(--accent)", fontSize: "12px" } }, "Fetching..."));
    fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: urlVal,
        extractText: chkText.checked,
        extractLinks: chkLinks.checked,
        extractMeta: chkMeta.checked,
        selector: selectorInput.value.trim() || undefined
      })
    }).then(function(r) { return r.json(); }).then(function(data) {
      fetchResultDiv.innerHTML = "";
      if (data.error) {
        fetchResultDiv.appendChild(el("div", { s: { color: "var(--err)", fontSize: "12px" } }, "Error: " + data.error));
        return;
      }
      var info = el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", marginBottom: "8px" } }, [
        el("span", {}, "Status: " + data.statusCode + " | "),
        el("span", {}, "Type: " + data.contentType + " | "),
        el("span", {}, "Size: " + (data.contentLength || 0) + " bytes")
      ]);
      fetchResultDiv.appendChild(info);
      if (data.title) {
        fetchResultDiv.appendChild(el("div", { s: { fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "var(--tx1)" } }, data.title));
      }
      var body = data.text || data.body || (data.json ? JSON.stringify(data.json, null, 2) : "");
      if (body) {
        fetchResultDiv.appendChild(el("pre", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "400px", overflow: "auto", background: "var(--sf1)", padding: "10px", borderRadius: "6px" } }, body.slice(0, 20000)));
      }
      if (data.links && data.links.length) {
        var linksSection = el("details", { s: { marginTop: "8px" } });
        linksSection.appendChild(el("summary", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)", cursor: "pointer" } }, "Links (" + data.links.length + ")"));
        var linksList = el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--tx3)", lineHeight: "1.8", padding: "6px 0", maxHeight: "200px", overflow: "auto" } });
        for (var li = 0; li < Math.min(data.links.length, 50); li++) {
          linksList.appendChild(el("div", {}, (data.links[li].text ? data.links[li].text + " → " : "") + data.links[li].href));
        }
        linksSection.appendChild(linksList);
        fetchResultDiv.appendChild(linksSection);
      }
      if (data.meta && Object.keys(data.meta).length) {
        var metaSection = el("details", { s: { marginTop: "8px" } });
        metaSection.appendChild(el("summary", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)", cursor: "pointer" } }, "Meta Tags (" + Object.keys(data.meta).length + ")"));
        var metaList = el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--tx3)", lineHeight: "1.8", padding: "6px 0" } });
        for (var mk in data.meta) {
          metaList.appendChild(el("div", {}, mk + ": " + data.meta[mk]));
        }
        metaSection.appendChild(metaList);
        fetchResultDiv.appendChild(metaSection);
      }
    }).catch(function(e) {
      fetchResultDiv.innerHTML = "";
      fetchResultDiv.appendChild(el("div", { s: { color: "var(--err)", fontSize: "12px" } }, "Failed: " + e.message));
    });
  } } }, "Fetch");
  fetchOpts.appendChild(fetchBtn);

  fetchPanel.appendChild(fetchOpts);
  var fetchResultDiv = el("div", { attr: { id: "mcp-fetch-result" } });
  fetchPanel.appendChild(fetchResultDiv);
  ct.appendChild(fetchPanel);

  // Live preview panel — interactive tool runner
  ct.appendChild(el("h3", { s: { fontSize: "14px", fontWeight: "600", marginTop: "24px", marginBottom: "12px" } }, "Quick Actions"));

  var previewsPanel = el("div", { c: "card", s: { marginBottom: "16px" } });
  var previewsList = el("div", { attr: { id: "mcp-previews-list" } }, "Loading previews...");
  previewsPanel.appendChild(previewsList);

  // Load previews
  fetch("/api/mcp/previews").then(function(r) { return r.json(); }).then(function(previews) {
    previewsList.innerHTML = "";
    if (!previews.length) {
      previewsList.appendChild(el("div", { s: { color: "var(--tx3)", fontSize: "12px", padding: "8px 0" } }, "No active previews. Deploy a branch first."));
      return;
    }
    for (var pi = 0; pi < previews.length; pi++) {
      (function(p) {
        var row = el("div", { s: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--sf3)" } });
        row.appendChild(el("span", { c: "dot " + (p.status === "ready" ? "ok" : p.status === "running" ? "ok" : "idle") }));
        row.appendChild(el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "12px", flex: "1" } }, p.owner + "/" + p.repo + ":" + p.slug));
        row.appendChild(el("span", { c: "chip" + (p.status === "running" ? " on" : ""), s: { fontSize: "10px" } }, p.mode));

        // Screenshot button
        row.appendChild(el("button", { c: "bg bs", s: { background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)" }, on: { click: function() {
          S.mcpAction = { type: "screenshot", owner: p.owner, repo: p.repo, slug: p.slug };
          DV.render();
        } } }, "📸"));

        // Inspect button
        row.appendChild(el("button", { c: "bg bs", on: { click: function() {
          S.mcpAction = { type: "inspect", owner: p.owner, repo: p.repo, slug: p.slug };
          DV.render();
        } } }, "🔍"));

        // Console button
        row.appendChild(el("button", { c: "bg bs", on: { click: function() {
          S.mcpAction = { type: "console", owner: p.owner, repo: p.repo, slug: p.slug };
          DV.render();
        } } }, "📋"));

        previewsList.appendChild(row);
      })(previews[pi]);
    }
  }).catch(function() {
    previewsList.innerHTML = "";
    previewsList.appendChild(el("div", { s: { color: "var(--err)", fontSize: "12px" } }, "Failed to load previews"));
  });

  ct.appendChild(previewsPanel);

  // Action result panel
  if (S.mcpAction) {
    var actionPanel = el("div", { c: "card", s: { marginBottom: "16px" } });
    var actionTitle = S.mcpAction.type.charAt(0).toUpperCase() + S.mcpAction.type.slice(1) + ": " + S.mcpAction.owner + "/" + S.mcpAction.repo + ":" + S.mcpAction.slug;
    actionPanel.appendChild(el("div", { s: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" } }, [
      el("h3", { s: { fontSize: "14px", fontWeight: "600", flex: "1" } }, actionTitle),
      el("button", { c: "bg bs", on: { click: function() { S.mcpAction = null; S.mcpResult = null; DV.render(); } } }, "✕")
    ]));

    var resultDiv = el("div", { attr: { id: "mcp-result" } });

    if (S.mcpResult) {
      if (S.mcpResult.loading) {
        resultDiv.appendChild(el("div", { s: { color: "var(--accent)", fontSize: "12px" } }, "Loading..."));
      } else if (S.mcpResult.error) {
        resultDiv.appendChild(el("div", { s: { color: "var(--err)", fontSize: "12px" } }, "Error: " + S.mcpResult.error));
      } else if (S.mcpAction.type === "screenshot" && S.mcpResult.content) {
        // Find image content
        for (var ci = 0; ci < S.mcpResult.content.length; ci++) {
          var c = S.mcpResult.content[ci];
          if (c.type === "image") {
            var img = document.createElement("img");
            img.src = "data:" + c.mimeType + ";base64," + c.data;
            img.style.cssText = "max-width:100%;border-radius:8px;border:1px solid var(--sf3)";
            resultDiv.appendChild(img);
          } else if (c.type === "text") {
            resultDiv.appendChild(el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", marginTop: "8px" } }, c.text));
          }
        }
      } else if (S.mcpResult.content) {
        for (var ci2 = 0; ci2 < S.mcpResult.content.length; ci2++) {
          var c2 = S.mcpResult.content[ci2];
          if (c2.type === "text") {
            resultDiv.appendChild(el("pre", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "400px", overflow: "auto", background: "var(--sf1)", padding: "10px", borderRadius: "6px" } }, c2.text));
          }
        }
      } else {
        resultDiv.appendChild(el("pre", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx2)", whiteSpace: "pre-wrap", maxHeight: "400px", overflow: "auto", background: "var(--sf1)", padding: "10px", borderRadius: "6px" } }, JSON.stringify(S.mcpResult, null, 2)));
      }
    } else {
      resultDiv.appendChild(el("div", { s: { color: "var(--tx3)", fontSize: "12px" } }, "Running tool..."));
      // Execute the tool
      S.mcpResult = { loading: true };
      var toolName = S.mcpAction.type === "console" ? "console_logs" : S.mcpAction.type;
      fetch("/api/mcp/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, args: { owner: S.mcpAction.owner, repo: S.mcpAction.repo, slug: S.mcpAction.slug } })
      }).then(function(r) { return r.json(); }).then(function(result) {
        S.mcpResult = result;
        DV.render();
      }).catch(function(e) {
        S.mcpResult = { error: e.message };
        DV.render();
      });
    }

    actionPanel.appendChild(resultDiv);
    ct.appendChild(actionPanel);
  }

  app.appendChild(ct);
};

// Load MCP tools on init
if (!S.mcpTools) S.mcpTools = [];
if (!S.mcpAction) S.mcpAction = null;
if (!S.mcpResult) S.mcpResult = null;

})();
