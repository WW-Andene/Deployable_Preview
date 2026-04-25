(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Helpers ── */
function section(title, children) {
  var s = el("div", { c: "settings-section" });
  s.appendChild(el("h3", { c: "settings-section-title" }, title));
  if (Array.isArray(children)) children.forEach(function(c) { if (c) s.appendChild(c); });
  return s;
}

function keyRow(secret, onSave, onDelete) {
  var card = el("div", { c: "settings-key-row" });
  var top = el("div", { c: "flex-row gap-8 items-center" });
  top.appendChild(el("span", { c: "settings-key-name" }, secret.label || secret.key));
  if (secret.hasValue) {
    top.appendChild(el("span", { c: "pill pill-ok" }, "\u2714"));
    top.appendChild(el("span", { c: "settings-masked" }, secret.masked));
    if (secret.source === "env") top.appendChild(el("span", { c: "pill pill-info" }, "env"));
  } else {
    top.appendChild(el("span", { c: "pill pill-warn" }, "\u2014"));
  }
  card.appendChild(top);

  if (secret.hint) {
    var hint = el("div", { c: "settings-hint" });
    hint.appendChild(document.createTextNode(secret.hint));
    if (secret.link) {
      hint.appendChild(el("a", { attr: { href: secret.link, target: "_blank", rel: "noopener" }, c: "settings-link" }, " Get \u2197"));
    }
    card.appendChild(hint);
  }

  var row = el("div", { c: "flex-row gap-6 mt-6" });
  var inp = document.createElement("input");
  inp.className = "flex-1 font-mono text-12";
  inp.type = "password";
  inp.placeholder = secret.hasValue ? "New value\u2026" : "Paste key\u2026";
  inp.addEventListener("focus", function() { inp.type = "text"; });
  inp.addEventListener("blur", function() { if (!inp.value) inp.type = "password"; });
  row.appendChild(inp);

  row.appendChild(el("button", { c: "bp bs", on: { click: function() {
    var val = inp.value.trim();
    if (!val) return;
    onSave(secret.key, val, this);
  } } }, "Save"));

  if (secret.hasValue && secret.source === "config") {
    row.appendChild(el("button", { c: "bd bs", on: { click: function() {
      if (!confirm("Remove " + (secret.label || secret.key) + "?")) return;
      onDelete(secret.key);
    } } }, "\u00d7"));
  }
  card.appendChild(row);
  return card;
}

/* ── Main view ── */
DV.views.settings = function(app) {
  var page = el("div", { c: "settings-page" });
  page.appendChild(el("h2", { c: "page-title" }, "Settings"));

  /* ══════════ Section: API Keys ══════════ */
  var keysBody = el("div", {});
  keysBody.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));

  function saveKey(key, value, btn) {
    btn.disabled = true; btn.textContent = "\u2026";
    fetch("/api/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, value: value })
    }).then(function(r) { return r.json(); }).then(function(r) {
      if (r.ok) {
        DV.showToast(key + " saved", "success");
        if (key === "GITHUB_TOKEN") S.hasToken = true;
        loadKeys();  // refresh keys section only, no full re-render
      } else {
        DV.showToast(r.error || "Failed", "error");
        btn.disabled = false; btn.textContent = "Save";
      }
    }).catch(function() { btn.disabled = false; btn.textContent = "Save"; });
  }

  function saveBulk(text, btn) {
    var lines = text.split("\n");
    var pairs = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      // Support: KEY=value, KEY = value, export KEY=value, KEY="value"
      var clean = line.replace(/^export\s+/i, "");
      var eq = clean.indexOf("=");
      if (eq <= 0) continue;
      var k = clean.slice(0, eq).trim();
      var v = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (k && v) pairs.push({ key: k, value: v });
    }
    if (pairs.length === 0) {
      DV.showToast("No valid KEY=value pairs found", "error");
      return;
    }
    btn.disabled = true; btn.textContent = "Saving " + pairs.length + "\u2026";
    var done = 0, errors = 0;
    pairs.forEach(function(p) {
      fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key, value: p.value })
      }).then(function(r) { return r.json(); }).then(function(r) {
        if (!r.ok) errors++;
        if (r.ok && p.key === "GITHUB_TOKEN") S.hasToken = true;
      }).catch(function() { errors++; }).finally(function() {
        done++;
        if (done === pairs.length) {
          var msg = (pairs.length - errors) + " key(s) saved";
          if (errors) msg += ", " + errors + " failed";
          DV.showToast(msg, errors ? "error" : "success");
          loadKeys();
        }
      });
    });
  }

  function deleteKey(key) {
    fetch("/api/secrets/" + encodeURIComponent(key), { method: "DELETE" })
      .then(function(r) { return r.json(); })
      .then(function(r) {
        if (r.ok) {
          DV.showToast(key + " removed", "info");
          if (key === "GITHUB_TOKEN") S.hasToken = false;
          loadKeys();
        }
      });
  }

  function loadKeys() {
    fetch("/api/secrets").then(function(r) { return r.json(); }).then(function(secrets) {
      keysBody.innerHTML = "";

      // Active keys first, then suggested empties
      var active = secrets.filter(function(s) { return s.hasValue; });
      var suggested = secrets.filter(function(s) { return !s.hasValue && s.suggested; });

      if (active.length > 0) {
        active.forEach(function(s) { keysBody.appendChild(keyRow(s, saveKey, deleteKey)); });
      }

      if (suggested.length > 0) {
        keysBody.appendChild(el("div", { c: "settings-divider-label" }, "Quick add"));
        suggested.forEach(function(s) { keysBody.appendChild(keyRow(s, saveKey, deleteKey)); });
      }

      // Bulk paste area
      keysBody.appendChild(el("div", { c: "settings-divider-label mt-16" }, "Bulk import"));
      var bulkWrap = el("div", { c: "settings-bulk" });
      var bulkTA = document.createElement("textarea");
      bulkTA.className = "settings-bulk-textarea";
      bulkTA.placeholder = "Paste multiple keys \u2014 one per line:\n\nGITHUB_TOKEN=ghp_xxxx\nOPENAI_API_KEY=sk-xxxx\nSTRIPE_SECRET_KEY=sk_live_xxxx\nMY_CUSTOM_KEY=some_value\n\nSupports: KEY=value, export KEY=value, KEY=\"value\"";
      bulkTA.rows = 6;
      bulkWrap.appendChild(bulkTA);
      var bulkBtn = el("button", { c: "bp bs mt-6", on: { click: function() {
        var text = bulkTA.value.trim();
        if (!text) return;
        saveBulk(text, bulkBtn);
      } } }, "Import All Keys");
      bulkWrap.appendChild(bulkBtn);
      keysBody.appendChild(bulkWrap);

      // Single custom key adder
      keysBody.appendChild(el("div", { c: "settings-divider-label mt-12" }, "Add single key"));
      var addRow = el("div", { c: "settings-add-row" });
      var nameInp = document.createElement("input");
      nameInp.placeholder = "KEY_NAME"; nameInp.className = "font-mono text-12";
      nameInp.style.width = "160px";
      var valInp = document.createElement("input");
      valInp.placeholder = "Value"; valInp.className = "flex-1 font-mono text-12";
      valInp.type = "password";
      valInp.addEventListener("focus", function() { valInp.type = "text"; });
      valInp.addEventListener("blur", function() { if (!valInp.value) valInp.type = "password"; });
      addRow.appendChild(nameInp);
      addRow.appendChild(valInp);
      addRow.appendChild(el("button", { c: "bp bs", on: { click: function() {
        var k = nameInp.value.trim().toUpperCase();
        var v = valInp.value.trim();
        if (!k || !v) { DV.showToast("Both name and value required", "error"); return; }
        saveKey(k, v, this);
      } } }, "+"));
      keysBody.appendChild(addRow);

    }).catch(function(e) {
      keysBody.innerHTML = "";
      keysBody.appendChild(el("div", { c: "color-err" }, "Failed to load: " + e.message));
    });
  }
  loadKeys();
  page.appendChild(section("API Keys & Secrets", [
    el("div", { c: "settings-hint mb-8" }, "Saved to this server only. Env vars work as fallback. All keys are injected into build environments."),
    keysBody
  ]));

  /* ══════════ Section: Browser Engine ══════════ */
  var browserBody = el("div", {});
  function refreshBrowser() {
    Promise.all([
      fetch("/api/browser/status").then(function(r) { return r.json(); }),
      fetch("/api/secrets").then(function(r) { return r.json(); })
    ]).then(function(results) {
      var st = results[0];
      var secrets = results[1];
      var hasBrowserlessKey = secrets.some(function(s) { return s.key === "BROWSERLESS_API_KEY" && s.hasValue; });
      var hasWSEndpoint = secrets.some(function(s) { return s.key === "BROWSER_WS_ENDPOINT" && s.hasValue; });
      var hasRemote = hasBrowserlessKey || hasWSEndpoint;

      browserBody.innerHTML = "";
      browserBody.appendChild(el("div", { c: "settings-hint mb-8" }, "Browser for MCP screenshots & interaction. On mobile, use Remote (Browserless)."));

      var options = [
        { id: "off", label: "Off" },
        { id: "remote", label: "Remote" },
        { id: "playwright", label: "Playwright" },
        { id: "puppeteer", label: "Puppeteer" }
      ];
      // Determine current mode
      var currentMode = st.preferred || "off";
      if (hasRemote && currentMode !== "off") currentMode = "remote";

      var chips = el("div", { c: "settings-chip-row" });
      options.forEach(function(opt) {
        var isActive = currentMode === opt.id;
        chips.appendChild(el("div", { c: "chip" + (isActive ? " on" : ""), on: { click: function() {
          if (opt.id === "off") {
            fetch("/api/browser/disable", { method: "POST" }).then(function() {
              DV.showToast("Browser disabled", "info"); refreshBrowser();
            });
          } else if (opt.id === "remote") {
            if (!hasRemote) {
              DV.showToast("Add BROWSERLESS_API_KEY in Keys section first (free at browserless.io)", "error");
              return;
            }
            // Just enable puppeteer-core (used for remote connect)
            fetch("/api/browser/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine: "puppeteer" }) })
              .then(function(r) { return r.json(); })
              .then(function(r) {
                DV.showToast("Remote browser active", "success"); refreshBrowser();
              });
          } else {
            var chip = this; chip.textContent = "Setting up\u2026";
            fetch("/api/browser/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine: opt.id }) })
              .then(function(r) { return r.json(); })
              .then(function(r) {
                if (r.ok) DV.showToast(opt.label + " active", "success");
                else DV.showToast("Setup failed: " + (r.error || ""), "error");
                refreshBrowser();
              });
          }
        } } }, opt.label));
      });
      browserBody.appendChild(chips);

      // Status display
      if (hasRemote && currentMode === "remote") {
        var provider = hasBrowserlessKey ? "Browserless.io" : "Custom WebSocket";
        browserBody.appendChild(el("div", { c: "flex-row gap-6 items-center mt-8" }, [
          el("span", { c: "pill pill-ok" }, "remote"),
          el("span", { c: "settings-hint" }, provider + " \u2014 screenshots work from anywhere, no local Chrome needed")
        ]));
      } else if (st.active && st.ready) {
        browserBody.appendChild(el("div", { c: "flex-row gap-6 items-center mt-8" }, [
          el("span", { c: "pill pill-ok" }, st.active),
          el("span", { c: "settings-hint" }, "Ready \u2014 local browser")
        ]));
      } else if (st.preferred !== "off") {
        browserBody.appendChild(el("div", { c: "settings-hint mt-8 color-tx3" }, "Not ready \u2014 select a mode above"));
      }
    }).catch(function() { browserBody.textContent = "Could not load."; });
  }
  refreshBrowser();
  page.appendChild(section("Browser Engine", [browserBody]));

  /* ══════════ Section: HTTPS Tunnel ══════════ */
  var tunnelBody = el("div", {});
  function refreshTunnel() {
    Promise.all([
      fetch("/api/tunnel/status").then(function(r) { return r.json(); }),
      fetch("/api/preferences").then(function(r) { return r.json(); })
    ]).then(function(results) {
      var st = results[0];
      var prefs = results[1];
      tunnelBody.innerHTML = "";
      S._tunnelStatus = st;

      tunnelBody.appendChild(el("div", { c: "settings-hint mb-8" }, "HTTPS tunnel so claude.ai can reach this server."));

      // Provider selector chips
      var providers = [
        { id: "cloudflared", label: "Cloudflare", desc: "Free, no account needed" },
        { id: "ngrok", label: "ngrok", desc: "Needs NGROK_AUTHTOKEN" },
        { id: "localtunnel", label: "Localtunnel", desc: "npm package, always available" }
      ];
      var currentPref = prefs.tunnel || "cloudflared";
      var chips = el("div", { c: "settings-chip-row mb-8" });
      providers.forEach(function(p) {
        chips.appendChild(el("div", { c: "chip" + (currentPref === p.id ? " on" : ""), on: { click: function() {
          fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tunnel: p.id }) })
            .then(function() { DV.showToast("Preferred: " + p.label, "info"); refreshTunnel(); });
        } } }, p.label));
      });
      tunnelBody.appendChild(chips);

      // Status + start/stop
      if (st.running && st.url) {
        var mcpUrl = st.url + "/mcp";
        tunnelBody.appendChild(el("div", { c: "flex-row gap-6 items-center mb-8 flex-wrap" }, [
          el("span", { c: "pill pill-ok" }, st.provider),
          el("code", { c: "settings-url" }, mcpUrl),
          el("button", { c: "bg bs", on: { click: function() {
            navigator.clipboard.writeText(mcpUrl).then(function() { DV.showToast("Copied", "info"); }).catch(function(){});
          } } }, "Copy")
        ]));
        tunnelBody.appendChild(el("div", { c: "settings-hint mb-8" }, "Paste into claude.ai \u2192 Settings \u2192 Integrations."));
        tunnelBody.appendChild(el("button", { c: "bd bs", on: { click: function() {
          fetch("/api/tunnel/stop", { method: "POST" }).then(function() { refreshTunnel(); DV.showToast("Stopped", "info"); });
        } } }, "Stop Tunnel"));
      } else {
        if (st.error) tunnelBody.appendChild(el("div", { c: "color-err text-11 mb-8" }, st.error));
        tunnelBody.appendChild(el("button", { c: "bp bs", on: { click: function() {
          var btn = this; btn.disabled = true; btn.textContent = "Starting\u2026";
          fetch("/api/tunnel/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then(function(r) { return r.json(); })
            .then(function(r) {
              if (r.ok) { DV.showToast("Tunnel: " + r.url, "success"); refreshTunnel(); }
              else { DV.showToast(r.error || "Failed", "error"); btn.disabled = false; btn.textContent = "Start Tunnel"; }
            }).catch(function() { btn.disabled = false; btn.textContent = "Start Tunnel"; });
        } } }, "Start Tunnel"));
      }
    }).catch(function() { tunnelBody.textContent = "Could not reach API."; });
  }
  refreshTunnel();
  page.appendChild(section("HTTPS Tunnel", [tunnelBody]));

  /* ══════════ Section: Workspace ══════════ */
  var wsBody = el("div", {});
  fetch("/api/workspace/stats").then(function(r) { return r.json(); }).then(function(stats) {
    wsBody.innerHTML = "";
    wsBody.appendChild(el("div", { c: "settings-hint mb-8" }, stats.total + " workspace dir(s) \u2014 " + stats.active + " active, " + stats.orphaned + " orphaned"));
    if (stats.orphaned > 0) {
      wsBody.appendChild(el("button", { c: "bd bs", on: { click: function() {
        if (!confirm("Remove " + stats.orphaned + " orphaned dir(s)?")) return;
        fetch("/api/workspace/cleanup", { method: "POST" }).then(function(r) { return r.json(); }).then(function(r) {
          DV.showToast("Cleaned " + r.removed + " dir(s)", "success");
        });
      } } }, "Clean " + stats.orphaned + " orphaned"));
    }
  }).catch(function() { wsBody.textContent = "Could not load."; });
  page.appendChild(section("Workspace", [wsBody]));

  /* ══════════ Section: Actions ══════════ */
  page.appendChild(section("Actions", [
    el("div", { c: "settings-actions-grid" }, [
      el("button", { c: "bg bs", on: { click: function() {
        if (!confirm("Rebuild all branches?")) return;
        for (var i = 0; i < S.repos.length; i++) {
          var r = S.repos[i]; var slugs = Object.keys(r.branchStatuses || {});
          for (var j = 0; j < slugs.length; j++) api("POST", "/api/build/" + r.owner + "/" + r.repo + "?slug=" + encodeURIComponent(slugs[j]));
        }
        DV.showToast("Rebuilding all\u2026", "info"); setTimeout(DV.loadRepos, 1000);
      } } }, "Rebuild All"),
      el("a", { c: "bg bs", attr: { href: "/api/config/export", download: "deployview-config.json" } }, "Export Config"),
      el("button", { c: "bg bs", on: { click: function() {
        var input = document.createElement("input"); input.type = "file"; input.accept = ".json";
        input.addEventListener("change", function() {
          var file = input.files[0]; if (!file) return;
          var reader = new FileReader();
          reader.onload = function() {
            try {
              var data = JSON.parse(reader.result);
              fetch("/api/config/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
                .then(function(r) { return r.json(); })
                .then(function(r) { DV.showToast("Imported " + r.added + " repo(s)", "success"); DV.loadRepos(); });
            } catch (e) { DV.showToast("Invalid JSON", "error"); }
          };
          reader.readAsText(file);
        });
        input.click();
      } } }, "Import Config"),
      el("button", { c: "bd bs", on: { click: function() {
        api("POST", "/api/token", { token: "" }).then(function() { S.hasToken = false; S.view = "setup"; DV.render(); });
      } } }, "Logout")
    ])
  ]));

  /* ══════════ Section: About ══════════ */
  var aboutBody = el("div", { c: "settings-about" });
  fetch("/api/health").then(function(r) { return r.json(); }).then(function(h) {
    aboutBody.innerHTML = "";
    [["Version", "v" + h.version], ["Node.js", "v" + h.node], ["Uptime", Math.floor(h.uptime / 60) + "m"],
     ["Memory", h.memory], ["Repos", h.repos], ["Previews", h.previews.ready + " ready, " + h.previews.building + " building"]
    ].forEach(function(item) {
      aboutBody.appendChild(el("div", { c: "settings-about-row" }, [
        el("span", { c: "settings-about-label" }, item[0]),
        el("span", { c: "settings-about-value" }, String(item[1]))
      ]));
    });
  }).catch(function() {});
  page.appendChild(section("About", [aboutBody]));

  app.appendChild(page);
};
})();
