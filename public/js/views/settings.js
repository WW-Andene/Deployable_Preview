(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Helpers ── */
// section(title, children, tabId?) — when tabId is provided, the section
// only renders when S.settingsTab matches it (D1: tabs). Sections without
// tabId render unconditionally — used for the implicit "all" view if any.
function section(title, children, tabId) {
  if (tabId && S.settingsTab && S.settingsTab !== tabId) return null;
  var s = el("div", { c: "settings-section" });
  s.appendChild(el("h3", { c: "settings-section-title" }, title));
  if (Array.isArray(children)) children.forEach(function(c) { if (c) s.appendChild(c); });
  return s;
}

// Tab bar — sticky at the top of the settings page. Clicks switch
// S.settingsTab and re-render. Each tab corresponds to one section()
// callsite below.
var SETTINGS_TABS = [
  { id: "keys",       label: "API Keys" },
  { id: "browser",    label: "Browser" },
  { id: "tunnel",     label: "Tunnel" },
  { id: "webhooks",   label: "Webhooks" },
  { id: "envgroups",  label: "Env Groups" },
  { id: "domains",    label: "Domains" },
  { id: "workspace",  label: "Workspace" },
  { id: "actions",    label: "Actions" },
  { id: "about",      label: "About" }
];
function tabBar() {
  var bar = el("div", { c: "settings-tab-bar", attr: { role: "tablist", "aria-label": "Settings sections" } });
  for (var i = 0; i < SETTINGS_TABS.length; i++) {
    (function(t) {
      var active = S.settingsTab === t.id;
      bar.appendChild(el("button", {
        c: "settings-tab" + (active ? " settings-tab-active" : ""),
        attr: { role: "tab", "aria-selected": active ? "true" : "false", title: t.label },
        on: { click: function() { S.settingsTab = t.id; DV.render(); } }
      }, t.label));
    })(SETTINGS_TABS[i]);
  }
  return bar;
}

// appendIfExists — used to swallow null returns from section() so the
// page-level appends in the body below don't crash.
function appendIfExists(parent, child) { if (child) parent.appendChild(child); }

function keyRow(secret, onSave, onDelete) {
  var card = el("div", { c: "settings-key-row" });
  var top = el("div", { c: "flex-row gap-8 items-center" });
  top.appendChild(el("span", { c: "settings-key-name" }, secret.label || secret.key));
  if (secret.hasValue) {
    top.appendChild(el("span", { c: "pill pill-ok" }, "\u2714"));
    top.appendChild(el("span", { c: "settings-masked" }, secret.masked));
    if (secret.source === "env") top.appendChild(el("span", { c: "pill pill-info" }, "env"));
    // Age indicator \u2014 surfaces 'set 47d ago' so users can see which
    // secrets are stale and need rotation. Only shown when the
    // server has a setAt timestamp (older configs without metadata
    // show nothing, no false 'fresh' claim).
    if (secret.setAt) {
      var ageMs = Date.now() - secret.setAt;
      var ageDays = Math.floor(ageMs / 86400000);
      var label;
      if (ageMs < 60000) label = "set just now";
      else if (ageMs < 3600000) label = "set " + Math.floor(ageMs / 60000) + "m ago";
      else if (ageMs < 86400000) label = "set " + Math.floor(ageMs / 3600000) + "h ago";
      else label = "set " + ageDays + "d ago";
      // Stale-warning bg when > 90 days for tokens that benefit from
      // rotation (GitHub PATs, OpenAI/Anthropic keys, Stripe, etc.).
      var rotateRecommended = ageDays > 90;
      top.appendChild(el("span", {
        c: "settings-age" + (rotateRecommended ? " settings-age-stale" : ""),
        attr: { title: rotateRecommended
          ? "Set " + new Date(secret.setAt).toLocaleString() + " \u2014 consider rotating"
          : "Set " + new Date(secret.setAt).toLocaleString() }
      }, label + (rotateRecommended ? " \u00b7 rotate?" : "")));
    }
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
  // Reveal while focused so the user can verify what they typed/pasted,
  // then always re-mask on blur. Previously we only re-masked when the
  // field was empty, which left fresh API keys readable on screen until
  // the next render.
  inp.addEventListener("focus", function() { inp.type = "text"; });
  inp.addEventListener("blur", function() { inp.type = "password"; });
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
  page.appendChild(tabBar());

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
    var skipped = [];      // 1-based line numbers that looked like content but didn't parse
    var interpolated = []; // keys whose value still has ${VAR} or $VAR \u2014 we save literally and warn
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.trim();
      if (!line || line.charAt(0) === "#") continue;
      // Support: KEY=value, KEY = value, export KEY=value, KEY="value"
      var clean = line.replace(/^export\s+/i, "");
      var eq = clean.indexOf("=");
      if (eq <= 0) { skipped.push(i + 1); continue; }
      var k = clean.slice(0, eq).trim();
      var v = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (k && v) {
        if (/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/.test(v)) interpolated.push(k);
        pairs.push({ key: k, value: v });
      } else {
        skipped.push(i + 1);
      }
    }
    if (pairs.length === 0) {
      var why = skipped.length
        ? "No KEY=value pairs found. " + skipped.length + " line(s) didn't parse \u2014 each line must look like KEY=value (no spaces in KEY)."
        : "No valid KEY=value pairs found";
      DV.showToast(why, "error");
      return;
    }
    if (interpolated.length) {
      DV.showToast("Heads up: " + interpolated.join(", ") + " contain $VAR / ${VAR} \u2014 they're saved literally (no shell interpolation).", "info");
    }
    btn.disabled = true; btn.textContent = "Saving " + pairs.length + "\u2026";
    var done = 0;
    var failed = [];   // key names that the server rejected
    var aliased = [];  // [from, to] pairs the server normalized
    pairs.forEach(function(p) {
      fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key, value: p.value })
      }).then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); }).then(function(r) {
        if (r.body && r.body.ok) {
          if (p.key === "GITHUB_TOKEN" || r.body.key === "GITHUB_TOKEN") S.hasToken = true;
          if (r.body.aliasedFrom) aliased.push([r.body.aliasedFrom, r.body.key]);
        } else {
          failed.push(p.key + (r.body && r.body.error ? " (" + r.body.error + ")" : ""));
        }
      }).catch(function() { failed.push(p.key + " (network error)"); }).finally(function() {
        done++;
        if (done === pairs.length) {
          var saved = pairs.length - failed.length;
          var msg = saved + " key(s) saved";
          if (failed.length) msg += " \u2014 failed: " + failed.join(", ");
          if (skipped.length) msg += " \u2014 skipped " + skipped.length + " unparseable line(s)";
          if (aliased.length) {
            msg += " \u2014 renamed: " + aliased.map(function(a) { return a[0] + "\u2192" + a[1]; }).join(", ");
          }
          DV.showToast(msg, failed.length ? "error" : "success");
          loadKeys();
        }
      });
    });
  }

  function deleteKey(key) {
    fetch("/api/secrets/" + encodeURIComponent(key), { method: "DELETE" })
      .then(function(r) { return r.json().catch(function(){ return { error: "HTTP " + r.status }; }); })
      .then(function(r) {
        if (r && r.ok) {
          DV.showToast(key + " removed", "info");
          if (key === "GITHUB_TOKEN") S.hasToken = false;
          loadKeys();
        } else {
          // Surface server-side validation errors and similar — without
          // this the click silently no-ops and the user has no idea why.
          DV.showToast("Remove failed: " + ((r && r.error) || "unknown"), "error");
        }
      })
      .catch(function() { DV.showToast("Remove failed: network error", "error"); });
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
      bulkTA.id = "settings-bulk-import";
      bulkTA.className = "settings-bulk-textarea";
      bulkTA.setAttribute("aria-label", "Bulk import: paste KEY=value pairs, one per line");
      bulkTA.placeholder = "Paste multiple keys \u2014 one per line:\n\nGITHUB_TOKEN=ghp_xxxx\nOPENAI_API_KEY=sk-xxxx\nSTRIPE_SECRET_KEY=sk_live_xxxx\nMY_CUSTOM_KEY=some_value\n\nSupports: KEY=value, export KEY=value, KEY=\"value\"";
      bulkTA.rows = 6;
      bulkWrap.appendChild(bulkTA);
      var bulkBtn = el("button", { c: "bp bs mt-6", attr: { title: "Parse the textarea above and save each KEY=value pair" }, on: { click: function() {
        var text = bulkTA.value.trim();
        if (!text) { DV.showToast("Paste at least one KEY=value line first", "info"); return; }
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
  appendIfExists(page, section("API Keys & Secrets", [
    el("div", { c: "settings-hint mb-8" }, "Saved to this server only. Env vars work as fallback. All keys are injected into build environments."),
    keysBody
  ], "keys"));

  /* ══════════ Section: Browser Engine ══════════ */
  var browserBody = el("div", {});
  // Heuristic: Termux / Android / generic ARM userland — local browser
  // engines won't install Chromium and the user is better off going
  // straight to Remote. We surface a hint instead of disabling the
  // chips outright (they might know what they're doing).
  var isMobileLike = (function() {
    var ua = (navigator.userAgent || "").toLowerCase();
    var plat = (navigator.platform || "").toLowerCase();
    return /android|termux|iphone|ipad|ipod|aarch64|armv7|arm64/.test(ua) ||
           /android|aarch64|arm/.test(plat);
  })();

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
      var hintText = isMobileLike
        ? "Browser for MCP screenshots & interaction. You appear to be on mobile/ARM — use Remote (Browserless). Local Playwright/Puppeteer rarely work on Termux."
        : "Browser for MCP screenshots & interaction. On mobile, use Remote (Browserless).";
      browserBody.appendChild(el("div", { c: "settings-hint mb-8" }, hintText));

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
              // Deep-link: jump to the Keys tab so the user doesn't have
              // to hunt for it after seeing the toast.
              DV.showToast("Add BROWSERLESS_API_KEY first — switching to Keys tab (free at browserless.io)", "info");
              S.settingsTab = "keys";
              setTimeout(function(){ DV.render(); }, 300);
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
        var testBtn = el("button", { c: "bg bs", on: { click: function() {
          var orig = testBtn.textContent;
          testBtn.disabled = true; testBtn.textContent = "Testing\u2026";
          fetch("/api/browser/test").then(function(r) { return r.json(); }).then(function(r) {
            testBtn.disabled = false; testBtn.textContent = orig;
            if (r.ok) DV.showToast("Remote browser OK", "success");
            else DV.showToast("Remote test failed: " + (r.error || "unknown"), "error");
          }).catch(function(e) {
            testBtn.disabled = false; testBtn.textContent = orig;
            DV.showToast("Remote test failed: " + ((e && e.message) || "network"), "error");
          });
        } } }, "Test connection");
        browserBody.appendChild(el("div", { c: "flex-row gap-6 items-center mt-8 flex-wrap" }, [
          el("span", { c: "pill pill-ok" }, "remote"),
          el("span", { c: "settings-hint" }, provider + " \u2014 screenshots work from anywhere, no local Chrome needed"),
          testBtn
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
  appendIfExists(page, section("Browser Engine", [browserBody], "browser"));

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
          el("code", { c: "settings-url", attr: { "aria-label": "MCP URL: " + mcpUrl, title: mcpUrl } }, mcpUrl),
          el("button", { c: "bg bs", on: { click: function() { DV.copyToClipboard(mcpUrl); } } }, "Copy")
        ]));
        tunnelBody.appendChild(el("div", { c: "settings-hint mb-8" }, "Paste into claude.ai \u2192 Settings \u2192 Integrations. The URL must stay reachable from Anthropic\u2019s edge \u2014 keep this server and the tunnel running."));
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
  appendIfExists(page, section("HTTPS Tunnel", [tunnelBody], "tunnel"));

  /* ══════════ Section: Workspace ══════════ */
  var wsBody = el("div", {});
  function refreshWorkspaceStats() {
    fetch("/api/workspace/stats").then(function(r) { return r.json(); }).then(function(stats) {
    wsBody.innerHTML = "";
    function fmtBytes(n) {
      if (!n) return "0 B";
      if (n < 1024) return n + " B";
      if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
      if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
      return (n / 1073741824).toFixed(2) + " GB";
    }
    var hintLine = stats.total + " workspace dir(s) \u2014 " + stats.active + " active, " + stats.orphaned + " orphaned";
    if (typeof stats.totalBytes === "number") {
      hintLine += " \u00b7 " + fmtBytes(stats.totalBytes) + " total";
      if (stats.orphanedBytes) hintLine += " (" + fmtBytes(stats.orphanedBytes) + " in orphaned)";
    }
    wsBody.appendChild(el("div", { c: "settings-hint mb-8" }, hintLine));
    if (stats.orphaned > 0) {
      wsBody.appendChild(el("button", { c: "bd bs", on: { click: function() {
        var confirmMsg = "Remove " + stats.orphaned + " orphaned dir(s)";
        if (stats.orphanedBytes) confirmMsg += " (frees ~" + fmtBytes(stats.orphanedBytes) + ")";
        confirmMsg += "?";
        if (!confirm(confirmMsg)) return;
        var b = this; var orig = b.textContent; b.disabled = true; b.textContent = "Cleaning…";
        fetch("/api/workspace/cleanup", { method: "POST" }).then(function(r) { return r.json(); }).then(function(r) {
          var msg = "Cleaned " + (r.removed || 0) + " dir(s)";
          if (r.failed) msg += " — " + r.failed + " failed" + (r.errors && r.errors.length ? " (" + r.errors[0] + ")" : "");
          DV.showToast(msg, r.failed ? "error" : "success");
          refreshWorkspaceStats();
        }).catch(function() {
          b.disabled = false; b.textContent = orig;
          DV.showToast("Cleanup failed: network error", "error");
        });
      } } }, "Clean " + stats.orphaned + " orphaned"));
    }
    }).catch(function() { wsBody.textContent = "Could not load."; });
  }
  refreshWorkspaceStats();
  appendIfExists(page, section("Workspace", [wsBody], "workspace"));

  /* ══════════ Section: Outgoing webhooks ══════════ */
  // Slack/Discord/custom URL receivers for build events. Lets a team
  // wire DV into their existing channels without polling /api/repos.
  var whBody = el("div", {});
  whBody.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));

  // Compact "Xs/m/h ago" formatter for last-delivery pills.
  function _wTimeAgo(ms) {
    if (!ms) return "";
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function loadWebhooks() {
    api("GET", "/api/webhooks").then(function(r) {
      whBody.innerHTML = "";
      var list = (r && r.webhooks) || [];
      var validEvents = (r && r.validEvents) || [];

      // Existing webhooks
      if (list.length === 0) {
        whBody.appendChild(DV.emptyState({
          icon: "📡",
          title: "No webhooks configured",
          sub: "Wire DV into Slack / Discord / your own server with a single POST URL — fired on every build event."
        }));
      } else {
        for (var i = 0; i < list.length; i++) {
          (function(wh) {
            var card = el("div", { c: "settings-key-row" });
            var headerKids = [
              el("span", { c: "settings-key-name" }, wh.label || wh.url),
              el("span", { c: "pill " + (wh.enabled ? "pill-ok" : "pill-warn") }, wh.enabled ? "on" : "off"),
              el("span", { c: "pill pill-info" }, wh.format),
              el("span", { c: "color-tx3 text-11 font-mono" }, wh.events.join(","))
            ];
            if (wh.lastDelivery) {
              var ld = wh.lastDelivery;
              var pillCls = ld.ok ? "pill pill-ok" : "pill pill-err";
              var pillText = (ld.ok ? "✓ " : "✗ ") + (ld.statusCode || (ld.error ? "err" : "?")) + " · " + _wTimeAgo(ld.at);
              var pillTitle = "Last " + (ld.event || "delivery") + ": " + (ld.ok ? ("HTTP " + ld.statusCode) : (ld.error || ("HTTP " + ld.statusCode))) + " (" + new Date(ld.at).toLocaleString() + ")";
              headerKids.push(el("span", { c: pillCls, attr: { title: pillTitle } }, pillText));
            } else {
              headerKids.push(el("span", { c: "pill", attr: { title: "No delivery yet — click Test to fire one now" } }, "no delivery yet"));
            }
            card.appendChild(el("div", { c: "flex-row gap-8 items-center flex-wrap" }, headerKids));
            card.appendChild(el("div", { c: "color-tx3 text-12 font-mono mt-4" }, wh.url));
            card.appendChild(el("div", { c: "flex-row gap-6 mt-6" }, [
              el("button", { c: "bg bs", on: { click: function() {
                var btn = this; var orig = btn.textContent;
                btn.disabled = true; btn.textContent = "Testing…";
                api("POST", "/api/webhooks/" + wh.id + "/test").then(function(r) {
                  btn.disabled = false; btn.textContent = orig;
                  if (r.ok) {
                    DV.showToast("Receiver returned " + (r.statusCode || "OK"), "success");
                  } else {
                    var detail = r.statusCode ? (" (HTTP " + r.statusCode + ")") : "";
                    DV.showToast("Test failed: " + (r.error || "unknown") + detail, "error");
                  }
                }).catch(function(e) {
                  btn.disabled = false; btn.textContent = orig;
                  DV.showToast("Test failed: " + ((e && e.message) || "network"), "error");
                });
              } } }, "Test"),
              el("button", { c: "bg bs", on: { click: function() {
                api("PUT", "/api/webhooks/" + wh.id, { enabled: !wh.enabled }).then(loadWebhooks);
              } } }, wh.enabled ? "Disable" : "Enable"),
              el("button", { c: "bd bs", on: { click: function() {
                if (!confirm("Delete this webhook?")) return;
                api("DELETE", "/api/webhooks/" + wh.id).then(loadWebhooks);
              } } }, "×")
            ]));
            whBody.appendChild(card);
          })(list[i]);
        }
      }

      // Add new
      var form = el("div", { c: "settings-key-row" });
      form.appendChild(el("div", { c: "label" }, "Add webhook"));
      var urlInp = document.createElement("input");
      urlInp.placeholder = "https://hooks.slack.com/services/… or https://discord.com/api/webhooks/…";
      urlInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(urlInp);
      var labelInp = document.createElement("input");
      labelInp.placeholder = "Label (optional, e.g. #builds Slack)";
      labelInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(labelInp);
      // Format chips
      var fmt = "json";
      var fmtRow = el("div", { c: "chip-row mb-6" });
      ["json", "slack", "discord"].forEach(function(f){
        var chip = el("div", { c: "chip" + (fmt === f ? " on" : ""), on: { click: function(){
          fmt = f;
          [].forEach.call(fmtRow.children, function(c){ c.classList.toggle("on", c.textContent === f); });
        } } }, f);
        fmtRow.appendChild(chip);
      });
      form.appendChild(fmtRow);
      // Event chips (multi-select). Empty selection silently means
      // "fire on everything", which is surprising — we re-arm "*" if
      // the user deselects everything.
      var selectedEvents = ["*"];
      var evRow = el("div", { c: "chip-row mb-6" });
      function syncEvChips() {
        if (!selectedEvents.length) selectedEvents = ["*"];
        [].forEach.call(evRow.children, function(c){ c.classList.toggle("on", selectedEvents.indexOf(c.textContent) !== -1); });
      }
      ["*"].concat(validEvents).forEach(function(e){
        var chip = el("div", { c: "chip" + (selectedEvents.indexOf(e) !== -1 ? " on" : ""), on: { click: function(){
          var idx = selectedEvents.indexOf(e);
          if (idx !== -1) selectedEvents.splice(idx, 1); else selectedEvents.push(e);
          syncEvChips();
        } } }, e);
        evRow.appendChild(chip);
      });
      form.appendChild(evRow);
      var secretInp = document.createElement("input");
      secretInp.placeholder = "Optional HMAC secret (X-DV-Signature header)";
      secretInp.type = "password";
      secretInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(secretInp);
      form.appendChild(el("button", { c: "bp bs", on: { click: function() {
        if (!urlInp.value.trim()) { DV.showToast("URL required", "error"); return; }
        api("POST", "/api/webhooks", {
          url: urlInp.value.trim(), label: labelInp.value.trim(),
          format: fmt, events: selectedEvents.length ? selectedEvents : ["*"],
          secret: secretInp.value.trim()
        }).then(function(r) {
          if (r.error) { DV.showToast(r.error, "error"); return; }
          DV.showToast("Webhook added", "success");
          urlInp.value = ""; labelInp.value = ""; secretInp.value = "";
          loadWebhooks();
        });
      } } }, "Add"));
      whBody.appendChild(form);
    }).catch(function() { whBody.textContent = "Could not load."; });
  }
  loadWebhooks();
  appendIfExists(page, section("Outgoing Webhooks", [whBody], "webhooks"));

  /* ══════════ Section: Env-var groups ══════════ */
  // Reusable named bundles of KEY=value, attached per-branch via the
  // Edit modal. Values are masked (last 4) in the UI; full values only
  // exist server-side.
  var egBody = el("div", {});
  egBody.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));

  function loadEnvGroups() {
    // Drop the modal-side cache so the next Edit modal pulls fresh.
    delete S._envGroupsCache;
    api("GET", "/api/env-groups").then(function(r) {
      egBody.innerHTML = "";
      var groups = (r && r.groups) || [];
      if (groups.length === 0) {
        egBody.appendChild(DV.emptyState({
          icon: "🗂",
          title: "No env-var groups yet",
          sub: "Bundle reusable KEY=value pairs and attach them to multiple branches without copy-pasting."
        }));
      } else {
        for (var i = 0; i < groups.length; i++) {
          (function(g) {
            var card = el("div", { c: "settings-key-row" });
            card.appendChild(el("div", { c: "flex-row gap-8 items-center" }, [
              el("span", { c: "settings-key-name" }, g.name),
              el("span", { c: "pill pill-info" }, g.id),
              el("span", { c: "color-tx3 text-11" }, g.keyCount + " keys")
            ]));
            if (g.keys && g.keys.length) {
              card.appendChild(el("div", { c: "color-tx3 text-12 font-mono mt-4" }, g.keys.join(", ")));
            }
            // Edit + delete
            card.appendChild(el("div", { c: "flex-row gap-6 mt-6" }, [
              el("button", { c: "bg bs", on: { click: function() { editEnvGroup(g.id); } } }, "Edit values"),
              el("button", { c: "bd bs", on: { click: function() {
                if (!confirm("Delete env group '" + g.name + "'?")) return;
                api("DELETE", "/api/env-groups/" + g.id).then(loadEnvGroups);
              } } }, "×")
            ]));
            egBody.appendChild(card);
          })(groups[i]);
        }
      }

      // Add new group
      var form = el("div", { c: "settings-key-row" });
      form.appendChild(el("div", { c: "label" }, "New group"));
      var idInp = document.createElement("input");
      idInp.placeholder = "id (e.g. staging — letters, numbers, _ -)";
      idInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(idInp);
      var nameInp = document.createElement("input");
      nameInp.placeholder = "name (display label)";
      nameInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(nameInp);
      var varsInp = document.createElement("textarea");
      varsInp.rows = 4;
      varsInp.placeholder = "KEY=value\nDATABASE_URL=postgres://…";
      varsInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(varsInp);
      form.appendChild(el("button", { c: "bp bs", on: { click: function() {
        if (!idInp.value.trim()) { DV.showToast("id required", "error"); return; }
        var vars = {};
        var interpolated = []; // keys whose values still have $VAR / ${VAR}
        varsInp.value.split("\n").forEach(function(line){
          var t = line.trim(); if (!t || t.startsWith("#")) return;
          // Tolerate `export KEY=value` style pastes the same way the
          // bulk-secrets import does — parity matters because users
          // copy-paste the same .env between the two textareas.
          t = t.replace(/^export\s+/i, "");
          var eq = t.indexOf("="); if (eq < 1) return;
          var k = t.slice(0, eq).trim();
          // Strip a single matched layer of leading/trailing quotes.
          var v = t.slice(eq + 1).trim().replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
          if (/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/.test(v)) interpolated.push(k);
          vars[k] = v;
        });
        if (interpolated.length) {
          DV.showToast("Heads up: " + interpolated.join(", ") + " contain $VAR / ${VAR} — saved literally (no shell interpolation).", "info");
        }
        api("POST", "/api/env-groups", {
          id: idInp.value.trim(), name: nameInp.value.trim() || idInp.value.trim(), vars: vars
        }).then(function(r){
          if (r && r.error) { DV.showToast(r.error, "error"); return; }
          DV.showToast("Group created", "success");
          idInp.value = ""; nameInp.value = ""; varsInp.value = "";
          loadEnvGroups();
        }).catch(function(e){ DV.showToast("Failed: " + ((e && e.message) || "network"), "error"); });
      } } }, "Create"));
      egBody.appendChild(form);
    }).catch(function() { egBody.textContent = "Could not load."; });
  }

  function editEnvGroup(id) {
    api("GET", "/api/env-groups/" + id).then(function(g) {
      if (g && g.error) { DV.showToast(g.error, "error"); return; }
      var current = "";
      Object.keys(g.vars || {}).forEach(function(k){ current += k + "=\n"; });
      var newVars = prompt("Replace ALL values for '" + g.name + "'.\n\nFormat: KEY=value, one per line.\nMasked existing keys:\n" + Object.keys(g.vars || {}).join(", "), current);
      if (newVars === null) return;
      var vars = {};
      var interpolated = [];
      newVars.split("\n").forEach(function(line){
        var t = line.trim(); if (!t || t.startsWith("#")) return;
        // Same parser as the create form: tolerate `export KEY=…`,
        // strip matching wrap quotes, warn on $VAR / ${VAR}.
        t = t.replace(/^export\s+/i, "");
        var eq = t.indexOf("="); if (eq < 1) return;
        var k = t.slice(0, eq).trim();
        var v = t.slice(eq + 1).trim().replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
        if (!v) return;
        if (/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/.test(v)) interpolated.push(k);
        vars[k] = v;
      });
      if (interpolated.length) {
        DV.showToast("Heads up: " + interpolated.join(", ") + " contain $VAR / ${VAR} — saved literally.", "info");
      }
      api("PUT", "/api/env-groups/" + id, { vars: vars }).then(function(r){
        if (r && r.error) { DV.showToast(r.error, "error"); return; }
        DV.showToast("Saved", "success");
        loadEnvGroups();
      }).catch(function(e){ DV.showToast("Save failed: " + ((e && e.message) || "network"), "error"); });
    }).catch(function(e){ DV.showToast("Load failed: " + ((e && e.message) || "network"), "error"); });
  }
  loadEnvGroups();
  appendIfExists(page, section("Env-Var Groups", [egBody], "envgroups"));

  /* ══════════ Section: Custom Domains (H4) ══════════ */
  // Map a hostname → (owner, repo, slug). Users CNAME their domain at
  // this server; DV does the URL rewriting. Server validates the
  // target points at a real configured branch on POST.
  var domBody = el("div", {});
  domBody.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));

  function loadDomains() {
    api("GET", "/api/domains").then(function(r) {
      domBody.innerHTML = "";
      var list = (r && r.domains) || [];
      if (list.length === 0) {
        domBody.appendChild(el("div", { c: "color-tx3 text-12 mb-12" }, "No custom domains mapped."));
      } else {
        for (var i = 0; i < list.length; i++) {
          (function(d) {
            var card = el("div", { c: "settings-key-row" });
            var dnsPill = el("span", { c: "pill", attr: { title: "DNS status not checked yet — click Refresh DNS" } }, "DNS ?");
            card.appendChild(el("div", { c: "flex-row gap-8 items-center flex-wrap" }, [
              el("a", { c: "settings-key-name", attr: { href: "https://" + d.host, target: "_blank", rel: "noopener", title: "Open " + d.host + " in a new tab" } }, d.host),
              el("span", { c: "color-tx3 text-12 font-mono" }, "→ " + d.owner + "/" + d.repo + " · " + d.slug),
              dnsPill,
              el("button", { c: "bg bs", attr: { title: "Re-check DNS resolution" }, on: { click: function() {
                var btn = this; var orig = btn.textContent;
                btn.disabled = true; btn.textContent = "…";
                api("GET", "/api/domains/" + encodeURIComponent(d.host) + "/check").then(function(r2) {
                  btn.disabled = false; btn.textContent = orig;
                  if (!r2 || r2.error) {
                    dnsPill.textContent = "DNS error";
                    dnsPill.className = "pill pill-err";
                    dnsPill.title = (r2 && r2.error) || "check failed";
                    return;
                  }
                  var p = r2.dns || {};
                  if (p.pointsHere) { dnsPill.textContent = "DNS ok"; dnsPill.className = "pill pill-ok"; dnsPill.title = "Resolves to this server"; }
                  else if (p.error) { dnsPill.textContent = "DNS missing"; dnsPill.className = "pill pill-warn"; dnsPill.title = p.error; }
                  else {
                    dnsPill.textContent = "DNS elsewhere";
                    dnsPill.className = "pill pill-warn";
                    dnsPill.title = "Resolves to " + (p.cname ? ("CNAME " + p.cname) : ((p.a || []).concat(p.aaaa || []).join(", ") || "?")) + " — not this server";
                  }
                }).catch(function(e) {
                  btn.disabled = false; btn.textContent = orig;
                  dnsPill.textContent = "DNS error"; dnsPill.className = "pill pill-err"; dnsPill.title = (e && e.message) || "network";
                });
              } } }, "Refresh DNS"),
              el("a", { c: "bg bs", attr: { href: "https://" + d.host, target: "_blank", rel: "noopener" } }, "Visit ↗"),
              el("button", { c: "bd bs", attr: { title: "Remove mapping" }, on: { click: function() {
                if (!confirm("Remove mapping for " + d.host + "?")) return;
                api("DELETE", "/api/domains/" + encodeURIComponent(d.host)).then(loadDomains);
              } } }, "×")
            ]));
            domBody.appendChild(card);
          })(list[i]);
        }
      }
      // Add form
      var form = el("div", { c: "settings-key-row" });
      form.appendChild(el("div", { c: "label" }, "Map a domain"));
      form.appendChild(el("div", { c: "settings-hint mb-6" }, "Add a DNS record at your provider: an A record to this server's IP, or a CNAME if your provider supports flat-zone CNAMEs (root domains usually need A). DV will probe DNS once you save and again on demand."));
      var hostInp = document.createElement("input");
      hostInp.placeholder = "preview.example.com";
      hostInp.className = "flex-1 font-mono text-12 mb-6";
      form.appendChild(hostInp);
      // Target picker — select from existing branches
      var ownerInp = document.createElement("input"); ownerInp.placeholder = "owner"; ownerInp.className = "flex-1 font-mono text-12 mb-6";
      var repoInp  = document.createElement("input"); repoInp.placeholder  = "repo";  repoInp.className  = "flex-1 font-mono text-12 mb-6";
      var slugInp  = document.createElement("input"); slugInp.placeholder  = "slug";  slugInp.className  = "flex-1 font-mono text-12 mb-6";
      // If we already have repos loaded, suggest them via datalist
      if (S.repos && S.repos.length) {
        var dl = document.createElement("datalist");
        dl.id = "domain-target-suggestions";
        for (var i = 0; i < S.repos.length; i++) {
          var rr = S.repos[i];
          var slugs = Object.keys(rr.branchStatuses || {});
          for (var j = 0; j < slugs.length; j++) {
            var opt = document.createElement("option");
            opt.value = rr.owner + "/" + rr.repo + " · " + slugs[j];
            dl.appendChild(opt);
          }
        }
        form.appendChild(dl);
        var picker = document.createElement("input");
        picker.placeholder = "Quick-pick from your existing branches…";
        picker.setAttribute("list", "domain-target-suggestions");
        picker.className = "flex-1 font-mono text-12 mb-6";
        picker.addEventListener("change", function() {
          var m = picker.value.match(/^([^/]+)\/([^\s]+)\s+·\s+(.+)$/);
          if (m) { ownerInp.value = m[1]; repoInp.value = m[2]; slugInp.value = m[3]; }
        });
        form.appendChild(picker);
      }
      form.appendChild(ownerInp);
      form.appendChild(repoInp);
      form.appendChild(slugInp);
      form.appendChild(el("button", { c: "bp bs", on: { click: function() {
        var host = hostInp.value.trim().toLowerCase();
        if (!host || !ownerInp.value.trim() || !repoInp.value.trim() || !slugInp.value.trim()) {
          DV.showToast("All fields required", "error"); return;
        }
        var btn = this; var orig = btn.textContent;
        btn.disabled = true; btn.textContent = "Saving…";
        api("POST", "/api/domains", {
          host: host, owner: ownerInp.value.trim(), repo: repoInp.value.trim(), slug: slugInp.value.trim()
        }).then(function(r) {
          btn.disabled = false; btn.textContent = orig;
          if (r.error) { DV.showToast(r.error, "error"); return; }
          // Server returns r.hint with the DNS probe verdict baked in.
          var dnsOk = r.dns && r.dns.pointsHere;
          DV.showToast((dnsOk ? "Mapped — DNS ready. " : "Mapped — ") + (r.hint || ""), dnsOk ? "success" : "info");
          hostInp.value = ownerInp.value = repoInp.value = slugInp.value = "";
          loadDomains();
        }).catch(function(e) {
          btn.disabled = false; btn.textContent = orig;
          DV.showToast("Failed: " + ((e && e.message) || "network"), "error");
        });
      } } }, "Map"));
      domBody.appendChild(form);
    }).catch(function() { domBody.textContent = "Could not load."; });
  }
  loadDomains();
  appendIfExists(page, section("Custom Domains", [domBody], "domains"));

  /* ══════════ Section: Actions ══════════ */
  appendIfExists(page, section("Actions", [
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
            var data;
            try { data = JSON.parse(reader.result); }
            catch (e) { DV.showToast("Invalid JSON: " + e.message, "error"); return; }
            // Surface server errors and network failures instead of
            // silently saying "Imported undefined repo(s)" or nothing.
            api("POST", "/api/config/import", data).then(function(r) {
              if (r.error) { DV.showToast("Import failed: " + r.error, "error"); return; }
              DV.showToast("Imported " + (r.added || 0) + " repo(s)", "success");
              DV.loadRepos();
            }).catch(function(e) {
              DV.showToast("Import failed: " + (e && e.message ? e.message : "network error"), "error");
            });
          };
          reader.readAsText(file);
        });
        input.click();
      } } }, "Import Config"),
      el("button", { c: "bd bs", on: { click: function() {
        api("POST", "/api/token", { token: "" }).then(function() { S.hasToken = false; S.view = "setup"; DV.render(); });
      } } }, "Logout")
    ])
  ], "actions"));

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
  appendIfExists(page, section("About", [aboutBody], "about"));

  app.appendChild(page);
};
})();
