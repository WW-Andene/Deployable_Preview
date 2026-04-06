(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.modals = function(app) {
  // Edit modal
  if (S.editModal) {
    var m = S.editModal;
    var bg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg) { S.editModal = null; DV.render(); } } } });
    var box = el("div", { c: "modal" });
    box.appendChild(el("h3", { s: { fontSize: "16px", fontWeight: "700", marginBottom: "16px" } }, "Edit: " + m.branch + (m.baseDir ? " \u2192 " + m.baseDir : "")));

    var fields = [
      { label: "Mode", key: "mode", type: "chips", options: ["static", "server"] },
      { label: "Base directory", key: "baseDir", placeholder: "repo root" },
      { label: "Build command", key: "buildCommand", placeholder: "npm run build", show: function() { return m.mode !== "server"; } },
      { label: "Output directory", key: "outputDir", placeholder: "dist", show: function() { return m.mode !== "server"; } },
      { label: "Start command", key: "startCommand", placeholder: "npm start", show: function() { return m.mode === "server"; } },
      { label: "Environment variables", key: "envVars", type: "textarea", placeholder: "KEY=value" }
    ];

    for (var fi = 0; fi < fields.length; fi++) {
      (function(f) {
        if (f.show && !f.show()) return;
        var wrap = el("div", { s: { marginBottom: "12px" } });
        wrap.appendChild(el("div", { c: "label", s: { marginBottom: "4px" } }, f.label));
        if (f.type === "chips") {
          var row = el("div", { s: { display: "flex", gap: "6px" } });
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

    box.appendChild(el("div", { s: { display: "flex", gap: "8px", marginTop: "16px" } }, [
      el("button", { c: "bg", on: { click: function() { S.editModal = null; DV.render(); } } }, "Cancel"),
      el("button", { c: "bp", s: { flex: "1" }, on: { click: function() {
        api("PUT", "/api/repos/" + m.owner + "/" + m.repo + "/branch", {
          slug: m.slug, baseDir: m.baseDir, buildCommand: m.buildCommand, outputDir: m.outputDir,
          mode: m.mode, startCommand: m.startCommand, envVars: m.envVars
        }).then(function() { S.editModal = null; DV.loadRepos(); });
      } } }, "Save")
    ]));
    bg.appendChild(box);
    app.appendChild(bg);
  }

  // Live log modal
  if (S.logModal) {
    var lm = S.logModal;
    var bg2 = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg2) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } } });
    var box2 = el("div", { c: "modal" });
    box2.appendChild(el("h3", { s: { fontSize: "16px", fontWeight: "700", marginBottom: "12px" } }, "Log: " + lm.slug));
    var logDiv = el("div", { c: "live-log", attr: { id: "live-log-content" } }, "Loading...");
    box2.appendChild(logDiv);
    box2.appendChild(el("div", { s: { display: "flex", gap: "8px", marginTop: "12px" } }, [
      el("button", { c: "bg", on: { click: function() { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } }, "Close"),
      el("button", { c: "bg", on: { click: function() { var text = logDiv.textContent; navigator.clipboard && navigator.clipboard.writeText(text); } } }, "Copy")
    ]));
    bg2.appendChild(box2);
    app.appendChild(bg2);

    fetch("/api/log/" + lm.owner + "/" + lm.repo + "?slug=" + encodeURIComponent(lm.slug)).then(function(r) { return r.text(); }).then(function(t) {
      logDiv.textContent = t || "No log yet.";
      logDiv.scrollTop = logDiv.scrollHeight;
    });
    if (S._logSSE) S._logSSE.close();
    S._logSSE = new EventSource("/api/logs/stream?key=" + encodeURIComponent(lm.key));
    S._logSSE.onmessage = function(e) {
      try { var data = JSON.parse(e.data); if (data.msg) { logDiv.textContent += data.msg + "\n"; logDiv.scrollTop = logDiv.scrollHeight; } } catch (err) {}
    };
  }

  // ── APK build modal ────────────────────────────────────────────────────────
  if (S.apkModal) {
    var am = S.apkModal;
    var apkBg = el("div", { c: "modal-bg", on: { click: function(e) {
      if (e.target === apkBg) { S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render(); }
    } } });
    var apkBox = el("div", { c: "modal" });

    // Header
    apkBox.appendChild(el("div", { s: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" } }, [
      el("span", { s: { fontSize: "20px" } }, "📦"),
      el("h3", { s: { fontSize: "16px", fontWeight: "700", flex: "1", margin: "0" } }, "Build Android APK"),
      el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx3)" } }, am.slug)
    ]));

    // Info box
    apkBox.appendChild(el("div", { s: { background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "var(--tx2)", lineHeight: "1.7" } }, [
      el("div", { s: { fontWeight: "600", marginBottom: "4px", color: "var(--accent)" } }, "Builds in GitHub Actions — no SDK needed here"),
      el("div", {}, "1. Pushes a workflow to your repo"),
      el("div", {}, "2. GitHub's cloud runners build the APK (~4–8 min)"),
      el("div", {}, "3. Downloads the .apk back here when done"),
      el("div", { s: { marginTop: "6px", color: "var(--tx3)" } }, "Requires your token to have the 'workflow' scope.")
    ]));

    // APK status area
    var apkStatusDiv = el("div", { s: { marginBottom: "12px" } });
    var apkLogDiv = el("div", { c: "live-log", s: { maxHeight: "220px", display: "none" } });

    function refreshApkStatus() {
      fetch("/api/apk/" + am.owner + "/" + am.repo + "/status?slug=" + encodeURIComponent(am.slug))
        .then(function(r) { return r.json(); })
        .then(function(st) {
          apkStatusDiv.innerHTML = "";
          var statusColor = st.status === "ready" ? "var(--ok)" : st.status === "building" ? "var(--accent)" : st.status === "error" ? "var(--err)" : "var(--tx3)";
          var statusLabel = { idle: "Not built yet", building: "Building…", ready: "Ready to download", error: "Build failed" }[st.status] || st.status;
          apkStatusDiv.appendChild(el("div", { s: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" } }, [
            el("span", { c: "dot " + (st.status === "ready" ? "ok" : st.status === "building" ? "building" : st.status === "error" ? "err" : "idle") }),
            el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "13px", color: statusColor } }, statusLabel +
              (st.status === "ready" && st.sizeKb ? " (" + st.sizeKb + " KB)" : "") +
              (st.startedAt ? " · " + new Date(st.startedAt).toLocaleTimeString() : ""))
          ]));
          if (st.status === "ready") {
            apkStatusDiv.appendChild(el("a", {
              attr: { href: "/api/apk/" + am.owner + "/" + am.repo + "/download?slug=" + encodeURIComponent(am.slug), download: "" },
              s: { display: "block", marginTop: "8px" }
            }, [
              el("button", { c: "bp", s: { width: "100%", fontSize: "14px" } }, "⬇  Download APK")
            ]));
          }
          if (st.log) {
            apkLogDiv.style.display = "block";
            apkLogDiv.textContent = st.log;
            apkLogDiv.scrollTop = apkLogDiv.scrollHeight;
          }
        });
    }

    refreshApkStatus();

    apkBox.appendChild(apkStatusDiv);
    apkBox.appendChild(apkLogDiv);

    // Actions
    var apkBtnRow = el("div", { s: { display: "flex", gap: "8px", marginTop: "14px" } });
    apkBtnRow.appendChild(el("button", { c: "bg", on: { click: function() {
      S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render();
    } } }, "Close"));
    apkBtnRow.appendChild(el("button", { c: "bp", s: { flex: "1" }, on: { click: function(e) {
      e.target.disabled = true; e.target.textContent = "Starting…";
      apkLogDiv.style.display = "block"; apkLogDiv.textContent = "";
      fetch("/api/apk/" + am.owner + "/" + am.repo + "?slug=" + encodeURIComponent(am.slug), { method: "POST" })
        .then(function(r) { return r.json(); })
        .then(function() {
          // Start SSE log stream
          if (S._apkSSE) S._apkSSE.close();
          S._apkSSE = new EventSource("/api/apk/" + am.owner + "/" + am.repo + "/log-stream?slug=" + encodeURIComponent(am.slug));
          S._apkSSE.onmessage = function(ev) {
            try {
              var data = JSON.parse(ev.data);
              if (data.log) { apkLogDiv.textContent = data.log; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
              if (data.msg) { apkLogDiv.textContent += data.msg + "\n"; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
            } catch (err) {}
          };
          // Poll status every 3 s
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
              });
          }, 3000);
        })
        .catch(function(err) { apkLogDiv.textContent = "Failed to start: " + err.message; e.target.disabled = false; e.target.textContent = "Build APK"; });
    } } }, "Build APK"));
    apkBox.appendChild(apkBtnRow);

    apkBg.appendChild(apkBox);
    app.appendChild(apkBg);
  }

})();
