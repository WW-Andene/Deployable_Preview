(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Escape-key closes any open modal ─────────────────────────── */
document.addEventListener("keydown", function(e) {
  if (e.key !== "Escape") return;
  var changed = false;
  if (S.apkModal) { S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } changed = true; }
  if (S.logModal) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } changed = true; }
  if (S.editModal) { S.editModal = null; changed = true; }
  if (changed) DV.render();
});

function focusTrap(root) {
  setTimeout(function() {
    var target = root.querySelector("input, button, textarea");
    if (target) target.focus();
  }, 0);
}

DV.views.modals = function(app) {

  /* ═══════════════ Edit modal ═══════════════ */
  if (S.editModal) {
    var m = S.editModal;
    var bg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg) { S.editModal = null; DV.render(); } } } });
    var box = el("div", { c: "modal" });
    box.appendChild(el("h3", { c: "modal-title" }, "Edit: " + m.branch + (m.baseDir ? " \u2192 " + m.baseDir : "")));

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
      { label: "Base directory", key: "baseDir", placeholder: "repo root" },
      { label: "Build command", key: "buildCommand", placeholder: lp.build, show: function() { return m.mode !== "server"; } },
      { label: "Output directory", key: "outputDir", placeholder: lp.output, show: function() { return m.mode !== "server"; } },
      { label: "Start command", key: "startCommand", placeholder: lp.start, show: function() { return m.mode === "server"; } },
      { label: "Environment variables", key: "envVars", type: "textarea", placeholder: "KEY=value" }
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
        } else {
          var inp = document.createElement("input"); inp.value = m[f.key] || ""; inp.placeholder = f.placeholder || "";
          inp.addEventListener("input", function(e) { m[f.key] = e.target.value; });
          wrap.appendChild(inp);
        }
        box.appendChild(wrap);
      })(fields[fi]);
    }

    box.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg", on: { click: function() { S.editModal = null; DV.render(); } } }, "Cancel"),
      el("button", { c: "bp flex-1", on: { click: function() {
        api("PUT", "/api/repos/" + m.owner + "/" + m.repo + "/branch", {
          slug: m.slug, baseDir: m.baseDir, buildCommand: m.buildCommand, outputDir: m.outputDir,
          mode: m.mode, startCommand: m.startCommand, envVars: m.envVars, language: m.language
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
    var autoScroll = true;
    var bg2 = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg2) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } } });
    var box2 = el("div", { c: "modal" });
    box2.appendChild(el("h3", { c: "modal-title" }, "Log: " + lm.slug));

    var logDiv = el("div", { c: "live-log", attr: { id: "live-log-content" } }, "Loading...");

    /* Toolbar: Clear | Auto-scroll | Word wrap */
    var autoScrollCb = document.createElement("input");
    autoScrollCb.type = "checkbox"; autoScrollCb.checked = true;
    autoScrollCb.addEventListener("change", function() { autoScroll = autoScrollCb.checked; });

    var wrapCb = document.createElement("input");
    wrapCb.type = "checkbox"; wrapCb.checked = true;
    wrapCb.addEventListener("change", function() {
      if (wrapCb.checked) logDiv.classList.remove("no-wrap");
      else logDiv.classList.add("no-wrap");
    });

    var toolbar = el("div", { c: "log-toolbar" }, [
      el("button", { c: "bg", on: { click: function() { logDiv.textContent = ""; } } }, "Clear"),
      el("label", {}, [autoScrollCb, "Auto-scroll"]),
      el("label", {}, [wrapCb, "Word wrap"])
    ]);
    box2.appendChild(toolbar);
    box2.appendChild(logDiv);

    box2.appendChild(el("div", { c: "btn-row-sm" }, [
      el("button", { c: "bg", on: { click: function() { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } }, "Close"),
      el("button", { c: "bg", on: { click: function() { var text = logDiv.textContent; navigator.clipboard && navigator.clipboard.writeText(text); } } }, "Copy")
    ]));
    bg2.appendChild(box2);
    app.appendChild(bg2);
    focusTrap(bg2);

    fetch("/api/log/" + lm.owner + "/" + lm.repo + "?slug=" + encodeURIComponent(lm.slug)).then(function(r) { return r.text(); }).then(function(t) {
      logDiv.textContent = t || "No log yet.";
      if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight;
    });
    if (S._logSSE) { S._logSSE.close(); S._logSSE = null; }
    S._logSSE = new EventSource("/api/logs/stream?key=" + encodeURIComponent(lm.key));
    S._logSSE.onmessage = function(e) {
      try { var data = JSON.parse(e.data); if (data.msg) { logDiv.textContent += data.msg + "\n"; if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight; } } catch (err) {}
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
    var apkBox = el("div", { c: "modal" });

    /* Header */
    apkBox.appendChild(el("div", { c: "apk-header" }, [
      el("span", { c: "apk-icon" }, "\uD83D\uDCE6"),
      el("h3", { c: "apk-title flex-1" }, "Build Android APK"),
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
};

})();
