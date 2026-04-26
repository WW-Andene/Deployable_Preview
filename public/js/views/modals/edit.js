// modals/edit.js — extracted from monolith via R5.
// Renders into the supplied app element when S.editModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.edit = function render(app) {
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
      { label: "Preview password (optional)", key: "previewPassword", type: "password", placeholder: "leave blank for public preview", hint: "Visitors must enter this before the preview loads. Stored on this server only." },
      { label: "Edge rules (advanced — JSON)", key: "edgeJson", type: "textarea", placeholder: '{ "redirects": [{ "from": "/old", "to": "/new", "status": 301 }], "headers": [{ "pathPattern": "/api/*", "headers": { "Access-Control-Allow-Origin": "*" } }] }', hint: "Per-branch redirects + response headers, applied at the proxy layer. Supports trailing /* in patterns." },
      { label: "Auto-rebuild schedule", key: "schedule", placeholder: "Seconds (e.g. 3600) OR cron expression (e.g. 0 3 * * *) — empty/0 disables", hint: "Numbers = seconds (min 30). Otherwise standard 5-field cron: 'min hour day-of-month month day-of-week'." },
      { label: "Performance budgets (advanced — JSON)", key: "budgetsJson", type: "textarea", placeholder: '{ "maxBundleBytes": 524288, "maxBuildSeconds": 90, "action": "warn" }', hint: "action: 'warn' logs but ships, 'fail' marks the build error. Empty / {} disables." }
    ];

    if (m.budgets !== undefined && m.budgetsJson === undefined) {
      try { m.budgetsJson = JSON.stringify(m.budgets || {}, null, 2); }
      catch (_) { m.budgetsJson = ""; }
    }

    // Hydrate edgeJson from m.edge once on first render
    if (m.edge !== undefined && m.edgeJson === undefined) {
      try { m.edgeJson = JSON.stringify(m.edge || { redirects: [], headers: [] }, null, 2); }
      catch (_) { m.edgeJson = ""; }
    }

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
        // Parse edgeJson back to an object — empty string means clear.
        var edge;
        if (m.edgeJson !== undefined && m.edgeJson !== null) {
          var trimmed = String(m.edgeJson).trim();
          if (trimmed === "" || trimmed === "{}") {
            edge = { redirects: [], headers: [] };
          } else {
            try { edge = JSON.parse(trimmed); }
            catch (e) { DV.showToast("Edge rules JSON invalid: " + e.message, "error"); return; }
          }
        }
        // schedule may be a number-of-seconds OR a 5-field cron expression
        // (e.g. "0 3 * * *"). Coercing with Number() turned every cron
        // string into NaN → 0, silently disabling the schedule. Preserve
        // the type: empty → 0, numeric string → Number, anything else
        // (cron expression) → trimmed string.
        var schedRaw = String(m.schedule == null ? "" : m.schedule).trim();
        var schedule;
        if (!schedRaw) schedule = 0;
        else if (/^-?\d+$/.test(schedRaw)) schedule = Number(schedRaw);
        else schedule = schedRaw;
        var payload = {
          slug: m.slug, baseDir: m.baseDir, buildCommand: m.buildCommand, outputDir: m.outputDir,
          mode: m.mode, startCommand: m.startCommand, envVars: m.envVars, language: m.language,
          customSlug: m.customSlug, previewPassword: m.previewPassword,
          injectSecrets: m.injectSecrets, envGroupIds: m.envGroupIds || [],
          schedule: schedule
        };
        if (edge !== undefined) payload.edge = edge;
        if (m.budgetsJson !== undefined && m.budgetsJson !== null) {
          var bt = String(m.budgetsJson).trim();
          if (bt === "" || bt === "{}") payload.budgets = {};
          else { try { payload.budgets = JSON.parse(bt); } catch (e) { DV.showToast("Budgets JSON invalid: " + e.message, "error"); return; } }
        }
        api("PUT", "/api/repos/" + m.owner + "/" + m.repo + "/branch", payload).then(function(r) {
          if (r.error) { DV.showToast(r.error, "error"); return; }
          S.editModal = null;
          DV.loadRepos();
        });
      } } }, "Save")
    ]));
    bg.appendChild(box);
    app.appendChild(bg);
    focusTrap(bg, "edit");
  }
};
})();
