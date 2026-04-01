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
};
})();
