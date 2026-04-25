(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.mcp = function(app) {
  var ct = el("div", { c: "mcp-page" });

  // Header
  ct.appendChild(el("div", { c: "page-header" }, [
    el("span", { c: "page-header-icon" }, DV.iconEl("plug", 18)),
    el("h2", { c: "page-header-title" }, "MCP Server Tools"),
    el("span", { c: "chip on" }, "Model Context Protocol")
  ]));

  // Status panel
  var statusPanel = el("div", { c: "card mb-20" });
  var statusHeader = el("div", { c: "mcp-status-row" });
  statusHeader.appendChild(el("h3", { c: "mcp-status-label" }, "Server Status"));
  var playwrightDot = el("span", { c: "dot idle ml-auto" });
  var playwrightLabel = el("span", { c: "mcp-status-meta" }, "Checking Playwright...");
  statusHeader.appendChild(playwrightDot);
  statusHeader.appendChild(playwrightLabel);
  statusPanel.appendChild(statusHeader);

  // Fetch MCP status
  fetch("/api/mcp/tools").then(function(r) { return r.json(); }).then(function(data) {
    if (data.playwrightAvailable) {
      playwrightDot.className = "dot ok";
      playwrightLabel.textContent = "Playwright available — screenshots & interaction enabled";
      playwrightLabel.className = "mcp-status-meta color-ok";
    } else {
      playwrightDot.className = "dot err";
      playwrightLabel.textContent = "Playwright not installed — run: npm install playwright && npx playwright install chromium";
      playwrightLabel.className = "mcp-status-meta color-err";
    }
  }).catch(function() {
    playwrightLabel.textContent = "Could not reach MCP endpoint";
    playwrightDot.className = "dot err";
  });

  // Claude Desktop config
  var claudeJson = '{\n  "mcpServers": {\n    "deployview": {\n      "command": "node",\n      "args": ["server/mcp.js"],\n      "cwd": "/path/to/Deployable_Preview"\n    }\n  }\n}';
  var claudeConfigLabel = el("div", { c: "flex-row" }, [
    el("div", { c: "config-label" }, "Claude Desktop Configuration"),
    el("button", { c: "btn-copy", on: { click: function() { navigator.clipboard.writeText(claudeJson).then(function() { DV.showToast("Config copied to clipboard", "info"); }).catch(function(){}); } } }, "Copy")
  ]);
  statusPanel.appendChild(el("div", { c: "config-panel" }, [
    claudeConfigLabel,
    el("pre", { c: "config-text" }, claudeJson)
  ]));

  // Claude Web (Streamable HTTP) — Tunnel panel
  var tunnelPanel = el("div", { c: "config-panel" });
  var tunnelLabelRow = el("div", { c: "flex-row" });
  tunnelLabelRow.appendChild(el("div", { c: "config-label" }, "Claude Web (claude.ai) \u2014 HTTPS Tunnel"));
  tunnelPanel.appendChild(tunnelLabelRow);

  var tunnelBody = el("div", { c: "config-text-loose" });
  tunnelPanel.appendChild(tunnelBody);

  function renderTunnelBody(st) {
    tunnelBody.innerHTML = "";
    if (st && st.running && st.url) {
      // Running — show the live URL and a Stop button
      var mcpUrl = st.url + "/mcp";
      tunnelBody.appendChild(el("div", { c: "tunnel-url-row" }, [
        el("span", { c: "tunnel-url" }, mcpUrl),
        el("button", { c: "btn-copy", on: { click: function() {
          navigator.clipboard.writeText(mcpUrl).then(function() { DV.showToast("MCP URL copied", "info"); }).catch(function(){});
        } } }, "Copy")
      ]));
      tunnelBody.appendChild(el("div", { c: "config-hint" }, "\u2713 Tunnel active via " + (st.provider || "tunnel") + ". Paste the URL above into claude.ai \u2192 Settings \u2192 Integrations."));
      var stopBtn = el("button", { c: "bg bs tunnel-stop-btn", on: { click: function() {
        stopBtn.disabled = true; stopBtn.textContent = "Stopping\u2026";
        fetch("/api/tunnel/stop", { method: "POST" }).then(function() { pollTunnelStatus(); });
      } } }, "Stop Tunnel");
      tunnelBody.appendChild(stopBtn);
    } else {
      // Not running
      tunnelBody.appendChild(el("div", {}, "Start an HTTPS tunnel so claude.ai can reach this server."));
      tunnelBody.appendChild(el("div", { c: "config-hint" }, "Uses cloudflared if installed, otherwise npx localtunnel (no install needed)."));
      if (st && st.error) {
        tunnelBody.appendChild(el("div", { c: "config-hint color-err" }, "Last error: " + st.error));
      }
      var startBtn = el("button", { c: "bp bs tunnel-start-btn", on: { click: function() {
        startBtn.disabled = true; startBtn.textContent = "Starting\u2026";
        fetch("/api/tunnel/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.ok) { DV.showToast("Tunnel started: " + (data.url || ""), "success"); pollTunnelStatus(); }
            else { startBtn.disabled = false; startBtn.textContent = "Start HTTPS Tunnel"; DV.showToast("Tunnel failed: " + (data.error || "Unknown"), "error"); tunnelBody.appendChild(el("div", { c: "config-hint color-err" }, data.error || "Failed")); }
          })
          .catch(function(e) { startBtn.disabled = false; startBtn.textContent = "Start HTTPS Tunnel"; });
      } } }, "Start HTTPS Tunnel");
      tunnelBody.appendChild(startBtn);
    }
  }

  function pollTunnelStatus() {
    fetch("/api/tunnel/status").then(function(r) { return r.json(); }).then(renderTunnelBody).catch(function(){});
  }

  pollTunnelStatus();
  statusPanel.appendChild(tunnelPanel);

  // HTTP endpoints reference
  statusPanel.appendChild(el("div", { c: "config-panel mb-0" }, [
    el("div", { c: "config-label" }, "HTTP API Endpoints"),
    el("div", { c: "config-text-2" }, [
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
  ct.appendChild(el("h3", { c: "section-title" }, "Available Tools (" + S.mcpTools.length + ")"));

  for (var i = 0; i < S.mcpTools.length; i++) {
    (function(tool) {
      var toolCard = el("div", { c: "card tool-card" });
      var toolHeader = el("div", { c: "tool-header" });
      toolHeader.appendChild(el("span", { c: "tool-name" }, tool.name));
      var props = tool.inputSchema && tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : [];
      var required = tool.inputSchema && tool.inputSchema.required || [];
      if (props.length) {
        toolHeader.appendChild(el("span", { c: "tool-params" },
          "(" + props.map(function(p) { return required.indexOf(p) >= 0 ? p : p + "?"; }).join(", ") + ")"
        ));
      }
      toolCard.appendChild(toolHeader);
      toolCard.appendChild(el("p", { c: "tool-desc" }, tool.description));
      ct.appendChild(toolCard);
    })(S.mcpTools[i]);
  }

  // ── Web Fetch panel ──────────────────────────────────────────────────────
  ct.appendChild(el("h3", { c: "section-title-mt" }, "🌐 Web Fetch"));

  var fetchPanel = el("div", { c: "card mb-20" });
  var fetchUrl = el("input", { c: "fetch-input", attr: { type: "text", placeholder: "https://example.com", id: "mcp-fetch-url" } });
  fetchPanel.appendChild(fetchUrl);

  var fetchOpts = el("div", { c: "fetch-options-row" });

  var fetchExtractText = el("label", { c: "fetch-option" });
  var chkText = el("input", { attr: { type: "checkbox", checked: "checked" } });
  fetchExtractText.appendChild(chkText);
  fetchExtractText.appendChild(document.createTextNode("Text"));
  fetchOpts.appendChild(fetchExtractText);

  var fetchExtractLinks = el("label", { c: "fetch-option" });
  var chkLinks = el("input", { attr: { type: "checkbox" } });
  fetchExtractLinks.appendChild(chkLinks);
  fetchExtractLinks.appendChild(document.createTextNode("Links"));
  fetchOpts.appendChild(fetchExtractLinks);

  var fetchExtractMeta = el("label", { c: "fetch-option" });
  var chkMeta = el("input", { attr: { type: "checkbox" } });
  fetchExtractMeta.appendChild(chkMeta);
  fetchExtractMeta.appendChild(document.createTextNode("Meta"));
  fetchOpts.appendChild(fetchExtractMeta);

  var fetchExtractImages = el("label", { c: "fetch-option" });
  var chkImages = el("input", { attr: { type: "checkbox" } });
  fetchExtractImages.appendChild(chkImages);
  fetchExtractImages.appendChild(document.createTextNode("Images"));
  fetchOpts.appendChild(fetchExtractImages);

  var fetchExtractHeadings = el("label", { c: "fetch-option" });
  var chkHeadings = el("input", { attr: { type: "checkbox" } });
  fetchExtractHeadings.appendChild(chkHeadings);
  fetchExtractHeadings.appendChild(document.createTextNode("Headings"));
  fetchOpts.appendChild(fetchExtractHeadings);

  var fetchExtractReadability = el("label", { c: "fetch-option" });
  var chkReadability = el("input", { attr: { type: "checkbox" } });
  fetchExtractReadability.appendChild(chkReadability);
  fetchExtractReadability.appendChild(document.createTextNode("Readability"));
  fetchOpts.appendChild(fetchExtractReadability);

  var selectorInput = el("input", { c: "selector-input", attr: { type: "text", placeholder: "tag filter (e.g. article)" } });
  fetchOpts.appendChild(selectorInput);

  var maxTextInput = el("input", { c: "max-text-input", attr: { type: "number", placeholder: "maxLen", min: "0" } });
  fetchOpts.appendChild(maxTextInput);

  var fetchBtn = el("button", { c: "bg bs btn-fetch", on: { click: function() {
    var urlVal = fetchUrl.value.trim();
    if (!urlVal) return;
    fetchResultDiv.innerHTML = "";
    fetchResultDiv.appendChild(el("div", { c: "fetch-status-ok" }, "Fetching..."));
    var maxLen = parseInt(maxTextInput.value, 10);
    fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: urlVal,
        extractText: chkText.checked,
        extractLinks: chkLinks.checked,
        extractMeta: chkMeta.checked,
        extractImages: chkImages.checked,
        extractHeadings: chkHeadings.checked,
        readability: chkReadability.checked,
        selector: selectorInput.value.trim() || undefined,
        maxTextLength: maxLen > 0 ? maxLen : undefined
      })
    }).then(function(r) { return r.json(); }).then(function(data) {
      fetchResultDiv.innerHTML = "";
      if (data.error) {
        fetchResultDiv.appendChild(el("div", { c: "fetch-status-err" }, "Error: " + data.error));
        return;
      }
      fetchResultDiv.appendChild(el("div", { c: "fetch-meta" }, [
        el("span", {}, "Status: " + data.statusCode + " | "),
        el("span", {}, "Type: " + data.contentType + " | "),
        el("span", {}, "Size: " + (data.contentLength || 0) + " bytes")
      ]));
      if (data.title) {
        fetchResultDiv.appendChild(el("div", { c: "result-title" }, data.title));
      }
      var body = data.text || data.body || (data.json ? JSON.stringify(data.json, null, 2) : "");
      if (body) {
        fetchResultDiv.appendChild(el("pre", { c: "code-block" }, body.slice(0, 20000)));
      }
      if (data.links && data.links.length) {
        var linksSection = el("details", { c: "mt-8" });
        linksSection.appendChild(el("summary", { c: "details-accent" }, "Links (" + data.links.length + ")"));
        var linksList = el("div", { c: "code-block-sm" });
        for (var li = 0; li < Math.min(data.links.length, 50); li++) {
          linksList.appendChild(el("div", {}, (data.links[li].text ? data.links[li].text + " → " : "") + data.links[li].href));
        }
        linksSection.appendChild(linksList);
        fetchResultDiv.appendChild(linksSection);
      }
      if (data.images && data.images.length) {
        var imagesSection = el("details", { c: "mt-8" });
        imagesSection.appendChild(el("summary", { c: "details-accent" }, "Images (" + data.images.length + ")"));
        var imagesList = el("div", { c: "code-block-sm" });
        for (var ii = 0; ii < Math.min(data.images.length, 50); ii++) {
          imagesList.appendChild(el("div", {}, (data.images[ii].alt ? data.images[ii].alt + " → " : "") + data.images[ii].src));
        }
        imagesSection.appendChild(imagesList);
        fetchResultDiv.appendChild(imagesSection);
      }
      if (data.headings && data.headings.length) {
        var headingsSection = el("details", { c: "mt-8" });
        headingsSection.appendChild(el("summary", { c: "details-accent" }, "Headings (" + data.headings.length + ")"));
        var headingsList = el("div", { c: "code-block-sm" });
        for (var hi = 0; hi < Math.min(data.headings.length, 50); hi++) {
          headingsList.appendChild(el("div", {}, (data.headings[hi].level ? data.headings[hi].level + ": " : "") + data.headings[hi].text));
        }
        headingsSection.appendChild(headingsList);
        fetchResultDiv.appendChild(headingsSection);
      }
      if (data.meta && Object.keys(data.meta).length) {
        var metaSection = el("details", { c: "mt-8" });
        metaSection.appendChild(el("summary", { c: "details-accent" }, "Meta Tags (" + Object.keys(data.meta).length + ")"));
        var metaList = el("div", { c: "details-content" });
        for (var mk in data.meta) {
          metaList.appendChild(el("div", {}, mk + ": " + data.meta[mk]));
        }
        metaSection.appendChild(metaList);
        fetchResultDiv.appendChild(metaSection);
      }
    }).catch(function(e) {
      fetchResultDiv.innerHTML = "";
      fetchResultDiv.appendChild(el("div", { c: "fetch-status-err" }, "Failed: " + e.message));
    });
  } } }, "Fetch");
  fetchOpts.appendChild(fetchBtn);

  fetchPanel.appendChild(fetchOpts);
  var fetchResultDiv = el("div", { attr: { id: "mcp-fetch-result" } });
  fetchPanel.appendChild(fetchResultDiv);
  ct.appendChild(fetchPanel);

  // Live preview panel — interactive tool runner
  ct.appendChild(el("h3", { c: "section-title-mt" }, "Quick Actions"));

  var previewsPanel = el("div", { c: "card mb-16" });
  var previewsList = el("div", { attr: { id: "mcp-previews-list" } }, "Loading previews...");
  previewsPanel.appendChild(previewsList);

  // Load previews
  fetch("/api/mcp/previews").then(function(r) { return r.json(); }).then(function(previews) {
    previewsList.innerHTML = "";
    if (!previews.length) {
      previewsList.appendChild(el("div", { c: "mcp-empty-text" }, "No active previews. Deploy a branch first."));
      return;
    }
    for (var pi = 0; pi < previews.length; pi++) {
      (function(p) {
        var row = el("div", { c: "preview-row" });
        row.appendChild(el("span", { c: "dot " + (p.status === "ready" ? "ok" : p.status === "running" ? "ok" : "idle") }));
        row.appendChild(el("span", { c: "preview-row-name" }, p.owner + "/" + p.repo + ":" + p.slug));
        row.appendChild(el("span", { c: "chip preview-row-chip" + (p.status === "running" ? " on" : "") }, p.mode));

        // Screenshot button
        row.appendChild(el("button", { c: "bg bs btn-accent-highlight", on: { click: function() {
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
        } } }, DV.iconEl("clipboard")));

        previewsList.appendChild(row);
      })(previews[pi]);
    }
  }).catch(function() {
    previewsList.innerHTML = "";
    previewsList.appendChild(el("div", { c: "fetch-status-err" }, "Failed to load previews"));
  });

  ct.appendChild(previewsPanel);

  // Action result panel
  if (S.mcpAction) {
    var actionPanel = el("div", { c: "card mb-16" });
    var actionTitle = S.mcpAction.type.charAt(0).toUpperCase() + S.mcpAction.type.slice(1) + ": " + S.mcpAction.owner + "/" + S.mcpAction.repo + ":" + S.mcpAction.slug;
    actionPanel.appendChild(el("div", { c: "agent-header" }, [
      el("h3", { c: "agent-title" }, actionTitle),
      el("button", { c: "bg bs", on: { click: function() { S.mcpAction = null; S.mcpResult = null; DV.render(); } } }, DV.iconEl("close"))
    ]));

    var resultDiv = el("div", { attr: { id: "mcp-result" } });

    if (S.mcpResult) {
      if (S.mcpResult.loading) {
        resultDiv.appendChild(el("div", { c: "fetch-status-ok" }, "Loading..."));
      } else if (S.mcpResult.error) {
        resultDiv.appendChild(el("div", { c: "fetch-status-err" }, "Error: " + S.mcpResult.error));
      } else if (S.mcpAction.type === "screenshot" && S.mcpResult.content) {
        // Find image content
        for (var ci = 0; ci < S.mcpResult.content.length; ci++) {
          var c = S.mcpResult.content[ci];
          if (c.type === "image") {
            var img = document.createElement("img");
            img.src = "data:" + c.mimeType + ";base64," + c.data;
            img.className = "mcp-img-preview";
            resultDiv.appendChild(img);
          } else if (c.type === "text") {
            resultDiv.appendChild(el("div", { c: "mcp-result-meta" }, c.text));
          }
        }
      } else if (S.mcpResult.content) {
        for (var ci2 = 0; ci2 < S.mcpResult.content.length; ci2++) {
          var c2 = S.mcpResult.content[ci2];
          if (c2.type === "text") {
            resultDiv.appendChild(el("pre", { c: "code-block" }, c2.text));
          }
        }
      } else {
        resultDiv.appendChild(el("pre", { c: "code-block" }, JSON.stringify(S.mcpResult, null, 2)));
      }
    } else {
      resultDiv.appendChild(el("div", { c: "mcp-empty-text" }, "Running tool..."));
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
