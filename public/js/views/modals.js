(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Escape-key closes any open modal ─────────────────────────── */
document.addEventListener("keydown", function(e) {
  if (e.key !== "Escape") return;
  var changed = false;
  if (S.apkModal) { S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } changed = true; }
  if (S.logModal) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } changed = true; }
  if (S.editModal) { S.editModal = null; changed = true; }
  if (S.shareModal) { S.shareModal = null; changed = true; }
  if (S.historyModal) { S.historyModal = null; changed = true; }
  if (changed) DV.render();
});

// G1-004 / G3-002: real focus trap. Records the element that had focus
// before the modal opened, focuses the first interactive child, and on
// Tab cycles within the modal so keyboard users can't escape into the
// background. Returns a cleanup function that restores prior focus.
var _modalRestoreStack = [];
function focusTrap(root) {
  var prevFocus = document.activeElement;
  function focusables() {
    return Array.prototype.slice.call(root.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ));
  }
  setTimeout(function() {
    var fs = focusables();
    if (fs.length) fs[0].focus();
  }, 0);
  function trap(e) {
    if (e.key !== "Tab") return;
    var fs = focusables();
    if (!fs.length) return;
    var first = fs[0], last = fs[fs.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  root.addEventListener("keydown", trap);
  _modalRestoreStack.push(function() {
    root.removeEventListener("keydown", trap);
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus(); } catch (_) {}
    }
  });
}

// Called by render() when modals close — pops + invokes the cleanups.
function flushModalRestores() {
  while (_modalRestoreStack.length) {
    var fn = _modalRestoreStack.pop();
    try { fn(); } catch (_) {}
  }
}
DV._flushModalRestores = flushModalRestores;

DV.views.modals = function(app) {

  /* ═══════════════ Edit modal ═══════════════ */
  if (S.editModal) {
    var m = S.editModal;
    var bg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg) { S.editModal = null; DV.render(); } } } });
    var box = el("div", { c: "modal", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-edit-title" } });
    box.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-edit-title" } }, "Edit: " + m.branch + (m.baseDir ? " \u2192 " + m.baseDir : "")));

    var langPlaceholders = {
      auto: { build: "auto-detected", output: "auto-detected", start: "auto-detected" },
      nodejs: { build: "npm run build", output: "dist", start: "npm start" },
      java: { build: "mvn package -DskipTests", output: "target", start: "java -jar target/*.jar" },
      python: { build: "python -m py_compile *.py || true", output: ".", start: "python app.py" }
    };
    var lp = langPlaceholders[m.language || "auto"] || langPlaceholders.auto;

    var fields = [
      { label: "Language", key: "language", type: "chips", options: ["auto", "nodejs", "java", "python"] },
      { label: "Mode", key: "mode", type: "chips", options: ["static", "server"] },
      { label: "Custom URL slug (optional)", key: "customSlug", placeholder: "letters, numbers, - or _ — leave blank for auto", hint: "Defaults to the branch name. Used in /preview/owner/repo/<slug>/" },
      { label: "Base directory", key: "baseDir", placeholder: "repo root" },
      { label: "Build command", key: "buildCommand", placeholder: lp.build, show: function() { return m.mode !== "server"; } },
      { label: "Output directory", key: "outputDir", placeholder: lp.output, show: function() { return m.mode !== "server"; } },
      { label: "Start command", key: "startCommand", placeholder: lp.start, show: function() { return m.mode === "server"; } },
      { label: "Environment variables", key: "envVars", type: "textarea", placeholder: "KEY=value", hint: "Highest priority — overrides anything from groups or secrets." },
      { label: "Env-var groups", key: "envGroupIds", type: "envGroups", hint: "Reusable named bundles. Manage them in Settings → Env Groups." },
      { label: "Inject ALL stored secrets as env", key: "injectSecrets", type: "toggle", hint: "Exports every key from Settings → Secrets to the build/server. Use sparingly." },
      { label: "Preview password (optional)", key: "previewPassword", type: "password", placeholder: "leave blank for public preview", hint: "Visitors must enter this before the preview loads. Stored on this server only." }
    ];

    for (var fi = 0; fi < fields.length; fi++) {
      (function(f) {
        if (f.show && !f.show()) return;
        var wrap = el("div", { c: "form-field" });
        wrap.appendChild(el("div", { c: "label" }, f.label));
        if (f.type === "chips") {
          var row = el("div", { c: "mode-chip-row" });
          for (var oi = 0; oi < f.options.length; oi++) {
            (function(opt) {
              row.appendChild(el("div", { c: "chip" + (m[f.key] === opt ? " on" : ""), on: { click: function() { m[f.key] = opt; DV.render(); } } }, opt));
            })(f.options[oi]);
          }
          wrap.appendChild(row);
        } else if (f.type === "textarea") {
          var ta = document.createElement("textarea"); ta.value = m[f.key] || ""; ta.placeholder = f.placeholder || ""; ta.rows = 3;
          ta.addEventListener("input", function(e) { m[f.key] = e.target.value; });
          wrap.appendChild(ta);
        } else if (f.type === "toggle") {
          var tog = el("div", {
            c: "chip" + (m[f.key] ? " on" : ""),
            attr: { role: "switch", "aria-checked": m[f.key] ? "true" : "false", tabindex: "0" },
            on: {
              click: function() { m[f.key] = !m[f.key]; DV.render(); },
              keydown: function(e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); m[f.key] = !m[f.key]; DV.render(); } }
            }
          }, m[f.key] ? "Enabled" : "Disabled");
          wrap.appendChild(tog);
        } else if (f.type === "envGroups") {
          // Multi-select chip row populated from /api/env-groups. We
          // refresh the list once per modal open via S._envGroupsCache.
          var row = el("div", { c: "chip-row" });
          var current = Array.isArray(m[f.key]) ? m[f.key] : [];
          var groups = S._envGroupsCache || [];
          if (!S._envGroupsCache) {
            api("GET", "/api/env-groups").then(function(r){
              S._envGroupsCache = (r && r.groups) || [];
              DV.render();
            }).catch(function(){ S._envGroupsCache = []; });
          }
          if (!groups.length) {
            row.appendChild(el("div", { c: "color-tx3 text-12" }, "No env groups defined yet — create one in Settings."));
          } else {
            for (var gi = 0; gi < groups.length; gi++) {
              (function(g) {
                var on = current.indexOf(g.id) !== -1;
                row.appendChild(el("div", {
                  c: "chip" + (on ? " on" : ""),
                  attr: { role: "button", "aria-pressed": on ? "true" : "false", tabindex: "0" },
                  on: {
                    click: function() {
                      var arr = Array.isArray(m[f.key]) ? m[f.key].slice() : [];
                      var idx = arr.indexOf(g.id);
                      if (idx !== -1) arr.splice(idx, 1); else arr.push(g.id);
                      m[f.key] = arr; DV.render();
                    }
                  }
                }, g.name + " (" + g.keyCount + ")"));
              })(groups[gi]);
            }
          }
          wrap.appendChild(row);
        } else {
          var inp = document.createElement("input"); inp.value = m[f.key] || ""; inp.placeholder = f.placeholder || "";
          if (f.type === "password") { inp.type = "password"; inp.autocomplete = "new-password"; }
          inp.addEventListener("input", function(e) { m[f.key] = e.target.value; });
          wrap.appendChild(inp);
        }
        if (f.hint) wrap.appendChild(el("p", { c: "label-hint" }, f.hint));
        box.appendChild(wrap);
      })(fields[fi]);
    }

    box.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg", on: { click: function() { S.editModal = null; DV.render(); } } }, "Cancel"),
      el("button", { c: "bp flex-1", on: { click: function() {
        api("PUT", "/api/repos/" + m.owner + "/" + m.repo + "/branch", {
          slug: m.slug, baseDir: m.baseDir, buildCommand: m.buildCommand, outputDir: m.outputDir,
          mode: m.mode, startCommand: m.startCommand, envVars: m.envVars, language: m.language,
          customSlug: m.customSlug, previewPassword: m.previewPassword,
          injectSecrets: m.injectSecrets, envGroupIds: m.envGroupIds || []
        }).then(function() { S.editModal = null; DV.loadRepos(); });
      } } }, "Save")
    ]));
    bg.appendChild(box);
    app.appendChild(bg);
    focusTrap(bg);
  }

  /* ═══════════════ Live-log modal ═══════════════ */
  if (S.logModal) {
    var lm = S.logModal;
    // Strip ANSI escape sequences so colour codes don't leak into the text.
    var ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
    function stripAnsi(s) { return String(s).replace(ANSI_RE, ""); }
    // Collapse runs of \r (carriage-return progress bars from npm/pip) — keep only the last line of each burst.
    function collapseCR(s) { return String(s).replace(/\r([^\n])/g, "\n$1"); }

    // Auto-scroll is re-enabled only when the user scrolls to the bottom.
    // Disengaged as soon as they scroll up — prevents fighting the reader.
    var autoScroll = true;
    var userDisengaged = false;

    var bg2 = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg2) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } } });
    var box2 = el("div", { c: "modal modal-log", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-log-title" } });
    box2.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-log-title" } }, "Log: " + lm.slug));

    var logDiv = el("div", { c: "live-log", attr: { id: "live-log-content" } }, "Loading...");
    // Track scroll engagement so SSE doesn't yank the view out from under the user.
    logDiv.addEventListener("scroll", function() {
      var atBottom = (logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight) < 24;
      if (atBottom) { userDisengaged = false; autoScrollCb.checked = true; autoScroll = true; }
      else { userDisengaged = true; autoScroll = false; autoScrollCb.checked = false; }
    });

    // Filter input — hide lines that don't match
    var filterInp = document.createElement("input");
    filterInp.placeholder = "Filter (substring)";
    filterInp.addEventListener("input", function() { applyFilter(); });
    function applyFilter() {
      var q = (filterInp.value || "").toLowerCase();
      // Work from full cache, not the rendered DOM
      var lines = logDiv._full ? logDiv._full.split("\n") : logDiv.textContent.split("\n");
      logDiv.textContent = q ? lines.filter(function(l){ return l.toLowerCase().indexOf(q) !== -1; }).join("\n") : lines.join("\n");
      if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight;
    }

    var autoScrollCb = document.createElement("input");
    autoScrollCb.type = "checkbox"; autoScrollCb.checked = true;
    autoScrollCb.addEventListener("change", function() { autoScroll = autoScrollCb.checked; userDisengaged = !autoScroll; if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight; });

    var wrapCb = document.createElement("input");
    wrapCb.type = "checkbox"; wrapCb.checked = true;
    wrapCb.addEventListener("change", function() {
      if (wrapCb.checked) logDiv.classList.remove("no-wrap");
      else logDiv.classList.add("no-wrap");
    });

    var ansiCb = document.createElement("input");
    ansiCb.type = "checkbox"; ansiCb.checked = true;
    ansiCb.addEventListener("change", function() {
      // Re-render from raw cache with new setting
      if (logDiv._raw != null) {
        logDiv._full = ansiCb.checked ? stripAnsi(logDiv._raw) : logDiv._raw;
        applyFilter();
      }
    });

    var toolbar = el("div", { c: "log-toolbar" }, [
      filterInp,
      el("button", { c: "bg", on: { click: function() { logDiv._raw = ""; logDiv._full = ""; logDiv.textContent = ""; } } }, "Clear"),
      el("label", {}, [autoScrollCb, "Auto-scroll"]),
      el("label", {}, [wrapCb, "Wrap"]),
      el("label", {}, [ansiCb, "Strip ANSI"])
    ]);
    box2.appendChild(toolbar);
    box2.appendChild(logDiv);

    box2.appendChild(el("div", { c: "btn-row-sm" }, [
      el("button", { c: "bg", on: { click: function() { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } }, "Close"),
      el("button", { c: "bg", on: { click: function() { var text = logDiv.textContent; navigator.clipboard && navigator.clipboard.writeText(text); DV.showToast && DV.showToast("Log copied", "info"); } } }, "Copy")
    ]));
    bg2.appendChild(box2);
    app.appendChild(bg2);
    focusTrap(bg2);

    function appendChunk(chunk) {
      var processed = collapseCR(chunk);
      logDiv._raw = (logDiv._raw || "") + processed;
      // Cap retained size at 2 MB — drop oldest if exceeded
      if (logDiv._raw.length > 2 * 1024 * 1024) logDiv._raw = logDiv._raw.slice(-2 * 1024 * 1024);
      logDiv._full = ansiCb.checked ? stripAnsi(logDiv._raw) : logDiv._raw;
      // Cheap incremental render: append, then re-filter only if a filter is set
      if (!filterInp.value) {
        // Fast path: just append the processed chunk to DOM text
        logDiv.textContent = logDiv._full;
      } else {
        applyFilter();
      }
      if (autoScroll && !userDisengaged) logDiv.scrollTop = logDiv.scrollHeight;
    }

    fetch("/api/log/" + lm.owner + "/" + lm.repo + "?slug=" + encodeURIComponent(lm.slug))
      .then(function(r) { return r.text(); })
      .then(function(t) {
        logDiv._raw = ""; logDiv._full = "";
        if (t && t !== "No build log.") {
          appendChunk(t);
        } else {
          // Empty-state — clearer guidance than the bare "No log yet."
          logDiv.innerHTML =
            '<div class="modal-empty">' +
              '<div class="modal-empty-title">No build log for this branch yet</div>' +
              '<div class="modal-empty-body">Trigger a build from the dashboard rebuild button. Live output will stream in here as it runs.</div>' +
            '</div>';
        }
      });
    if (S._logSSE) { S._logSSE.close(); S._logSSE = null; }
    S._logSSE = new EventSource("/api/logs/stream?key=" + encodeURIComponent(lm.key));
    S._logSSE.onmessage = function(e) {
      try { var data = JSON.parse(e.data); if (data.msg) appendChunk(data.msg + "\n"); } catch (err) {}
    };
    S._logSSE.onerror = function() {
      if (S._logSSE) { S._logSSE.close(); S._logSSE = null; }
    };
  }

  /* ═══════════════ APK build modal ═══════════════ */
  if (S.apkModal) {
    var am = S.apkModal;
    var apkBg = el("div", { c: "modal-bg", on: { click: function(e) {
      if (e.target === apkBg) { S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render(); }
    } } });
    var apkBox = el("div", { c: "modal", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-apk-title" } });

    /* Header */
    apkBox.appendChild(el("div", { c: "apk-header" }, [
      el("span", { c: "apk-icon", attr: { "aria-hidden": "true" } }, "\uD83D\uDCE6"),
      el("h3", { c: "apk-title flex-1", attr: { id: "modal-apk-title" } }, "Build Android APK"),
      el("span", { c: "apk-meta" }, am.slug)
    ]));

    /* Info box */
    apkBox.appendChild(el("div", { c: "apk-info-box" }, [
      el("div", { c: "apk-info-label" }, "Builds in GitHub Actions \u2014 no SDK needed here"),
      el("div", {}, "1. Pushes a workflow to your repo"),
      el("div", {}, "2. GitHub\u2019s cloud runners build the APK (~4\u20138 min)"),
      el("div", {}, "3. Downloads the .apk back here when done"),
      el("div", { c: "apk-info-hint" }, "Requires your token to have the \u2018workflow\u2019 scope.")
    ]));

    /* Status area */
    var apkStatusDiv = el("div", { c: "apk-log-container" });
    var apkLogDiv = el("div", { c: "live-log hidden" });

    function refreshApkStatus() {
      fetch("/api/apk/" + am.owner + "/" + am.repo + "/status?slug=" + encodeURIComponent(am.slug))
        .then(function(r) { return r.json(); })
        .then(function(st) {
          apkStatusDiv.innerHTML = "";
          var statusColor = st.status === "ready" ? "var(--ok)" : st.status === "building" ? "var(--accent)" : st.status === "error" ? "var(--err)" : "var(--tx3)";
          var statusLabel = { idle: "Not built yet", building: "Building\u2026", ready: "Ready to download", error: "Build failed" }[st.status] || st.status;
          apkStatusDiv.appendChild(el("div", { c: "status-row" }, [
            el("span", { c: "dot " + (st.status === "ready" ? "ok" : st.status === "building" ? "building" : st.status === "error" ? "err" : "idle") }),
            el("span", { c: "status-label", attr: { style: "color:" + statusColor } }, statusLabel +
              (st.status === "ready" && st.sizeKb ? " (" + st.sizeKb + " KB)" : "") +
              (st.startedAt ? " \xB7 " + new Date(st.startedAt).toLocaleTimeString() : ""))
          ]));
          if (st.status === "ready") {
            apkStatusDiv.appendChild(el("a", {
              c: "download-link",
              attr: { href: "/api/apk/" + am.owner + "/" + am.repo + "/download?slug=" + encodeURIComponent(am.slug), download: "" }
            }, [
              el("button", { c: "download-btn bp" }, "\u2B07  Download APK")
            ]));
          }
          if (st.log) {
            apkLogDiv.classList.remove("hidden");
            apkLogDiv.textContent = st.log;
            apkLogDiv.scrollTop = apkLogDiv.scrollHeight;
          }
        });
    }

    refreshApkStatus();

    apkBox.appendChild(apkStatusDiv);
    apkBox.appendChild(apkLogDiv);

    /* Actions */
    var apkBtnRow = el("div", { c: "btn-row" });

    /* Working directory input — shown above the button row */
    var wdRow = el("div", { c: "apk-wd-row" });
    wdRow.appendChild(el("label", { c: "apk-wd-label", attr: { "for": "apk-wd-input" } }, "Working directory"));
    var wdInput = el("input", { c: "apk-wd-input", attr: {
      id: "apk-wd-input",
      type: "text",
      placeholder: ". (repo root)",
      title: "Subdirectory containing package.json, e.g. \"app\" or \"frontend\". Leave blank for repo root."
    } });
    if (am.workingDir) wdInput.value = am.workingDir;
    wdRow.appendChild(wdInput);
    wdRow.appendChild(el("span", { c: "apk-wd-hint" }, "Subdirectory with package.json — leave blank if it\u2019s in the repo root"));
    apkBox.appendChild(wdRow);

    apkBtnRow.appendChild(el("button", { c: "bg", on: { click: function() {
      S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render();
    } } }, "Close"));
    apkBtnRow.appendChild(el("button", { c: "bp flex-1", on: { click: function(e) {
      var wd = wdInput.value.trim() || ".";
      am.workingDir = wd; // remember for re-renders
      e.target.disabled = true; e.target.textContent = "Starting\u2026";
      apkLogDiv.classList.remove("hidden"); apkLogDiv.textContent = "";
      fetch("/api/apk/" + am.owner + "/" + am.repo + "?slug=" + encodeURIComponent(am.slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDir: wd })
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          if (S._apkSSE) S._apkSSE.close();
          S._apkSSE = new EventSource("/api/apk/" + am.owner + "/" + am.repo + "/log-stream?slug=" + encodeURIComponent(am.slug));
          S._apkSSE.onmessage = function(ev) {
            try {
              var data = JSON.parse(ev.data);
              if (data.log) { apkLogDiv.textContent = data.log; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
              if (data.msg) { apkLogDiv.textContent += data.msg + "\n"; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
            } catch (err) {}
          };
          var pollId = setInterval(function() {
            if (!S.apkModal) { clearInterval(pollId); return; }
            refreshApkStatus();
            fetch("/api/apk/" + am.owner + "/" + am.repo + "/status?slug=" + encodeURIComponent(am.slug))
              .then(function(r) { return r.json(); })
              .then(function(st) {
                if (st.status !== "building") {
                  clearInterval(pollId);
                  if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; }
                  refreshApkStatus();
                }
              })
              .catch(function() { /* ignore transient poll errors */ });
          }, 3000);
        })
        .catch(function(err) { apkLogDiv.textContent = "Failed to start: " + err.message; e.target.disabled = false; e.target.textContent = "Build APK"; });
    } } }, "Build APK"));
    apkBox.appendChild(apkBtnRow);

    apkBg.appendChild(apkBox);
    app.appendChild(apkBg);
    focusTrap(apkBg);
  }

  /* ═══════════════ Share modal ═══════════════ */
  // Renders a QR code + URL + copy button. Triggered by DV.openShare(url).
  // On mobile DV.openShare prefers navigator.share() first; this modal is
  // the desktop fallback (and also the mobile fallback if the user
  // cancels the system sheet).
  if (S.shareModal) {
    var sm = S.shareModal;
    var sg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === sg) { S.shareModal = null; DV.render(); } } } });
    var sb = el("div", { c: "modal modal-share", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-share-title" } });
    sb.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-share-title" } }, "Share preview"));
    if (sm.title) sb.appendChild(el("div", { c: "color-tx2 text-13 mb-12" }, sm.title));

    // QR code (best-effort — only if DV.qr loaded)
    var qrWrap = el("div", { c: "share-qr-wrap" });
    if (window.DV && DV.qr) {
      try {
        qrWrap.innerHTML = DV.qr.renderSVG(sm.url, { cell: 5, margin: 2, dark: "#e6e1d5", light: "#0f1117", attrs: 'class="share-qr"' });
      } catch (e) {
        qrWrap.appendChild(el("div", { c: "color-err text-12" }, "QR generation failed: " + e.message));
      }
    } else {
      qrWrap.appendChild(el("div", { c: "color-tx3 text-12" }, "QR library not loaded"));
    }
    sb.appendChild(qrWrap);

    // URL input (selectable)
    var urlInp = document.createElement("input");
    urlInp.className = "share-url-input";
    urlInp.value = sm.url;
    urlInp.readOnly = true;
    urlInp.setAttribute("aria-label", "Share URL");
    urlInp.addEventListener("focus", function() { this.select(); });
    sb.appendChild(urlInp);

    // Action row
    var copyBtn = el("button", { c: "bp", on: { click: function() {
      function done() { copyBtn.textContent = "Copied ✓"; setTimeout(function(){ copyBtn.textContent = "Copy URL"; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sm.url).then(done, function(){
          urlInp.select(); document.execCommand && document.execCommand("copy"); done();
        });
      } else {
        urlInp.select(); document.execCommand && document.execCommand("copy"); done();
      }
    } } }, "Copy URL");

    var openBtn = el("a", { c: "bg", attr: { href: sm.url, target: "_blank", rel: "noopener" } }, "Open ↗");

    var nativeShareBtn = null;
    if (navigator.share) {
      nativeShareBtn = el("button", { c: "bg", on: { click: function() {
        navigator.share({ title: sm.title || "DeployView preview", url: sm.url }).catch(function(){});
      } } }, "Share via…");
    }

    var closeBtn = el("button", { c: "bg", on: { click: function() { S.shareModal = null; DV.render(); } } }, "Close");

    var btnRow = el("div", { c: "btn-row share-btn-row" });
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(openBtn);
    if (nativeShareBtn) btnRow.appendChild(nativeShareBtn);
    btnRow.appendChild(closeBtn);
    sb.appendChild(btnRow);

    sg.appendChild(sb);
    app.appendChild(sg);
    focusTrap(sb);
  }

  /* ═══════════════ Deployment-history modal ═══════════════ */
  if (S.historyModal) {
    var hm = S.historyModal;
    var hbg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === hbg) { S.historyModal = null; DV.render(); } } } });
    var hbox = el("div", { c: "modal modal-history", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-history-title" } });
    hbox.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-history-title" } }, "Deployment history — " + hm.owner + "/" + hm.repo + " · " + hm.slug));

    if (hm.loading) {
      hbox.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));
    } else if (hm.error) {
      hbox.appendChild(el("div", { c: "color-err font-mono text-12" }, hm.error));
    } else if (!hm.history.length) {
      hbox.appendChild(el("div", { c: "color-tx3 text-12 pad-md" }, "No deployment history yet — build the branch at least twice to see entries here."));
    } else {
      var listBody = el("div", { c: "history-list" });
      for (var hi = 0; hi < hm.history.length; hi++) {
        (function(entry) {
          var rolledBack = entry.by === "rollback";
          var row = el("div", { c: "history-row" + (rolledBack ? " history-row-rollback" : "") });

          var meta = el("div", { c: "history-row-main" });
          meta.appendChild(el("div", { c: "history-row-label" }, [
            el("span", { c: "history-row-sha font-mono" }, entry.commitShort || "—"),
            el("span", { c: "color-tx3 text-11" }, " · " + (entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "?")),
            entry.duration ? el("span", { c: "color-tx3 text-11" }, " · " + entry.duration + "s") : null,
            rolledBack ? el("span", { c: "pill pill-warn" }, "rollback") : null
          ].filter(Boolean)));
          row.appendChild(meta);

          // Don't offer rollback to the row that's already a rollback
          // action (it's an audit entry, not a snapshot). Snapshots are
          // entries with by="build".
          if (entry.by === "build") {
            row.appendChild(el("button", { c: "bg bs", on: { click: function() {
              if (!confirm("Roll the live preview back to commit " + (entry.commitShort || entry.id) + "?\n\nDoes NOT re-run the build — instantly serves the older bytes.")) return;
              api("POST", "/api/rollback/" + hm.owner + "/" + hm.repo, { slug: hm.slug, historyId: entry.id }).then(function(r) {
                if (r.error) { DV.showToast(r.error, "error"); return; }
                DV.showToast("Rolled back to " + (entry.commitShort || entry.id), "success");
                S.historyModal = null;
                DV.loadRepos();
              });
            } } }, "Rollback"));
          }

          listBody.appendChild(row);
        })(hm.history[hi]);
      }
      hbox.appendChild(listBody);
    }

    hbox.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg flex-1", on: { click: function() { S.historyModal = null; DV.render(); } } }, "Close")
    ]));

    hbg.appendChild(hbox);
    app.appendChild(hbg);
    focusTrap(hbox);
  }
};

})();
