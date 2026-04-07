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
    btn.disabled = true; btn.textContent = "...";
    fetch("/api/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, value: value })
    }).then(function(r) { return r.json(); }).then(function(r) {
      if (r.ok) {
        DV.showToast(key + " saved", "success");
        if (key === "GITHUB_TOKEN") S.hasToken = true;
        DV.render();
      } else {
        DV.showToast(r.error || "Failed", "error");
        btn.disabled = false; btn.textContent = "Save";
      }
    }).catch(function() { btn.disabled = false; btn.textContent = "Save"; });
  }

  function deleteKey(key) {
    fetch("/api/secrets/" + encodeURIComponent(key), { method: "DELETE" })
      .then(function(r) { return r.json(); })
      .then(function(r) {
        if (r.ok) {
          DV.showToast(key + " removed", "info");
          if (key === "GITHUB_TOKEN") S.hasToken = false;
          DV.render();
        }
      });
  }

  function loadKeys() {
    fetch("/api/secrets").then(function(r) { return r.json(); }).then(function(secrets) {
      keysBody.innerHTML = "";

      // Separate: keys with values first, then suggested empty, hide the rest
      var active = secrets.filter(function(s) { return s.hasValue; });
      var suggested = secrets.filter(function(s) { return !s.hasValue && s.suggested; });

      if (active.length > 0) {
        active.forEach(function(s) { keysBody.appendChild(keyRow(s, saveKey, deleteKey)); });
      }

      if (suggested.length > 0) {
        keysBody.appendChild(el("div", { c: "settings-divider-label" }, "Quick add"));
        suggested.forEach(function(s) { keysBody.appendChild(keyRow(s, saveKey, deleteKey)); });
      }

      // Custom key adder
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
      } } }, "+ Add"));
      keysBody.appendChild(el("div", { c: "settings-divider-label mt-12" }, "Custom key"));
      keysBody.appendChild(addRow);

    }).catch(function(e) {
      keysBody.innerHTML = "";
      keysBody.appendChild(el("div", { c: "color-err" }, "Failed to load: " + e.message));
    });
  }
  loadKeys();
  page.appendChild(section("API Keys & Secrets", [
    el("div", { c: "settings-hint mb-8" }, "Saved to this server only. Env vars work as fallback."),
    keysBody
  ]));

  /* ══════════ Section: HTTPS Tunnel ══════════ */
  var tunnelBody = el("div", {});
  function refreshTunnel() {
    fetch("/api/tunnel/status").then(function(r) { return r.json(); }).then(function(st) {
      tunnelBody.innerHTML = "";
      S._tunnelStatus = st;
      if (st.running && st.url) {
        var mcpUrl = st.url + "/mcp";
        tunnelBody.appendChild(el("div", { c: "flex-row gap-6 items-center mb-8" }, [
          el("span", { c: "pill pill-ok" }, st.provider),
          el("code", { c: "settings-url" }, mcpUrl),
          el("button", { c: "bg bs", on: { click: function() {
            navigator.clipboard.writeText(mcpUrl).then(function() { DV.showToast("Copied", "info"); }).catch(function(){});
          } } }, "Copy")
        ]));
        tunnelBody.appendChild(el("div", { c: "settings-hint mb-8" }, "Paste this URL into claude.ai \u2192 Settings \u2192 Integrations."));
        tunnelBody.appendChild(el("button", { c: "bd bs", on: { click: function() {
          fetch("/api/tunnel/stop", { method: "POST" }).then(function() { refreshTunnel(); DV.showToast("Tunnel stopped", "info"); });
        } } }, "Stop Tunnel"));
      } else {
        tunnelBody.appendChild(el("div", { c: "settings-hint mb-8" }, "Start an HTTPS tunnel so claude.ai can reach this server. Uses cloudflared \u2192 ngrok \u2192 localtunnel fallback."));
        if (st.error) tunnelBody.appendChild(el("div", { c: "color-err text-11 mb-8" }, st.error));
        tunnelBody.appendChild(el("button", { c: "bp bs", on: { click: function() {
          var btn = this; btn.disabled = true; btn.textContent = "Starting\u2026";
          fetch("/api/tunnel/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then(function(r) { return r.json(); })
            .then(function(r) {
              if (r.ok) { DV.showToast("Tunnel active: " + r.url, "success"); refreshTunnel(); }
              else { DV.showToast(r.error || "Failed", "error"); btn.disabled = false; btn.textContent = "Start Tunnel"; }
            }).catch(function() { btn.disabled = false; btn.textContent = "Start Tunnel"; });
        } } }, "Start Tunnel"));
      }
    }).catch(function() { tunnelBody.textContent = "Could not reach tunnel API."; });
  }
  refreshTunnel();
  page.appendChild(section("HTTPS Tunnel", [tunnelBody]));

  /* ══════════ Section: Workspace ══════════ */
  var wsBody = el("div", {});
  fetch("/api/workspace/stats").then(function(r) { return r.json(); }).then(function(stats) {
    wsBody.innerHTML = "";
    wsBody.appendChild(el("div", { c: "settings-hint mb-8" }, stats.total + " dir(s) total \u2014 " + stats.active + " active, " + stats.orphaned + " orphaned"));
    if (stats.orphaned > 0) {
      wsBody.appendChild(el("button", { c: "bd bs", on: { click: function() {
        if (!confirm("Remove " + stats.orphaned + " orphaned workspace dir(s)?")) return;
        fetch("/api/workspace/cleanup", { method: "POST" }).then(function(r) { return r.json(); }).then(function(r) {
          DV.showToast("Cleaned " + r.removed + " dir(s)", "success"); DV.render();
        });
      } } }, "Clean " + stats.orphaned + " orphaned dir(s)"));
    }
  }).catch(function() { wsBody.textContent = "Could not load workspace stats."; });
  page.appendChild(section("Workspace", [wsBody]));

  /* ══════════ Section: Actions ══════════ */
  page.appendChild(section("Actions", [
    el("div", { c: "settings-actions-grid" }, [
      el("button", { c: "bg bs", on: { click: function() {
        if (!confirm("Rebuild all branches?")) return;
        for (var i = 0; i < S.repos.length; i++) {
          var r = S.repos[i];
          var slugs = Object.keys(r.branchStatuses || {});
          for (var j = 0; j < slugs.length; j++) {
            api("POST", "/api/build/" + r.owner + "/" + r.repo + "?slug=" + encodeURIComponent(slugs[j]));
          }
        }
        DV.showToast("Rebuilding all branches\u2026", "info");
        setTimeout(DV.loadRepos, 1000);
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
    var items = [
      ["Version", "v" + h.version],
      ["Node.js", "v" + h.node],
      ["Uptime", Math.floor(h.uptime / 60) + "m"],
      ["Memory", h.memory],
      ["Repos", h.repos],
      ["Previews", h.previews.ready + " ready, " + h.previews.building + " building"]
    ];
    items.forEach(function(item) {
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
