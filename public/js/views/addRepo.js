(function(){
var S = DV.S, el = DV.el, api = DV.api;

function parseRepoUrl(raw) {
  var c = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  return c.match(/(?:github\.com\/)?([^\/]+)\/([^\/]+)$/);
}

DV.views.addRepo = function(app) {
  var w = el("div", { c: "add-repo-page" });
  w.appendChild(el("h2", { c: "page-title" }, "Add Repository"));

  var ri = document.createElement("input"); ri.placeholder = "owner/repo or full GitHub URL"; ri.value = S.repoUrl;
  ri.addEventListener("input", function(e) { S.repoUrl = e.target.value; });
  ri.addEventListener("paste", function(e) {
    setTimeout(function() {
      var m = parseRepoUrl(ri.value);
      if (m) { S.repoUrl = ri.value; fb.click(); }
    }, 0);
  });

  var es = el("span", { c: "error-text hidden" });
  var fb = el("button", { c: "bp", on: { click: function() {
    es.classList.add("hidden");
    var m = parseRepoUrl(S.repoUrl);
    if (!m) { es.textContent = "Invalid. Use owner/repo."; es.classList.remove("hidden"); return; }
    fb.innerHTML = "<span class='spin'></span>";
    api("GET", "/api/github/" + m[1] + "/" + m[2] + "/branches").then(function(r) {
      if (r.error) { es.textContent = r.error; es.classList.remove("hidden"); fb.textContent = "Fetch"; return; }
      S.repoInfo = { owner: m[1], repo: m[2], description: r.description, defaultBranch: r.defaultBranch };
      S.fetchedBranches = r.branches;
      S.selectedBranches = [r.defaultBranch];
      S.detectedFramework = null;
      fb.textContent = "Fetch"; DV.render();
      // Best-effort framework detect on default branch — fills in defaults
      api("GET", "/api/github/" + m[1] + "/" + m[2] + "/detect?branch=" + encodeURIComponent(r.defaultBranch))
        .then(function(d) {
          if (!d || d.error || !d.framework || d.framework === "unknown" || d.framework === "none") return;
          S.detectedFramework = d;
          // Only overwrite form fields if the user hasn't already customized them
          if (!S.buildCommand) S.buildCommand = d.buildCommand || S.buildCommand;
          if (!S.outputDir)    S.outputDir    = d.outputDir    || S.outputDir;
          if (!S.startCommand) S.startCommand = d.startCommand || S.startCommand;
          if (d.mode && S.mode === "static") S.mode = d.mode;
          if (!S.envVars && d.envTemplate) S.envVars = d.envTemplate;
          DV.render();
        }).catch(function() { /* silent */ });
    }).catch(function(e) { es.textContent = e.message; es.classList.remove("hidden"); fb.textContent = "Fetch"; });
  } } }, "Fetch");

  w.appendChild(el("div", { c: "form-section" }, [
    el("div", { c: "label mb-6" }, "1. Repository"),
    el("div", { c: "form-row" }, [ri, fb]), es
  ]));

  if (S.fetchedBranches.length && S.repoInfo) {
    var detectedBadge = null;
    if (S.detectedFramework && S.detectedFramework.framework && S.detectedFramework.framework !== "unknown") {
      var d = S.detectedFramework;
      detectedBadge = el("div", { c: "detect-badge mt-8" }, [
        el("span", { c: "detect-badge-icon" }, "⚡"),
        el("span", {}, "Detected: "),
        el("strong", {}, d.framework),
        el("span", { c: "detect-badge-meta" }, " · " + d.confidence + " confidence · defaults pre-filled")
      ]);
    }
    w.appendChild(el("div", { c: "card form-section-lg" }, [
      el("div", { c: "card-section-title" }, S.repoInfo.owner + "/" + S.repoInfo.repo),
      el("div", { c: "color-tx3 text-12 font-mono mt-4" }, S.repoInfo.description || "No description"),
      detectedBadge
    ].filter(Boolean)));

    var bd = el("div", { c: "chip-row mt-6" });
    for (var i = 0; i < S.fetchedBranches.length; i++) {
      (function(b) {
        bd.appendChild(el("div", { c: "chip" + (S.selectedBranches.indexOf(b) !== -1 ? " on" : ""), on: { click: function() {
          var idx = S.selectedBranches.indexOf(b); if (idx !== -1) S.selectedBranches.splice(idx, 1); else S.selectedBranches.push(b); DV.render();
        } } }, b));
      })(S.fetchedBranches[i]);
    }
    w.appendChild(el("div", { c: "form-section" }, [el("div", { c: "label mb-6" }, "2. Branches to monitor"), bd]));

    var langRow = el("div", { c: "chip-row" });
    var langs = ["auto", "nodejs", "java", "python"];
    for (var li = 0; li < langs.length; li++) {
      (function(lang) {
        langRow.appendChild(el("div", { c: "chip" + (S.language === lang ? " on" : ""), on: { click: function() { S.language = lang; DV.render(); } } }, lang));
      })(langs[li]);
    }
    w.appendChild(el("div", { c: "form-section-sm" }, [
      el("div", { c: "label mb-6" }, "3. Language"),
      langRow,
      el("p", { c: "label-hint" }, "Auto-detects from project files (pom.xml, requirements.txt, package.json)")
    ]));

    var modeRow = el("div", { c: "chip-row" });
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "static" ? " on" : ""), on: { click: function() { S.mode = "static"; DV.render(); } } }, "Static Build"));
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "server" ? " on" : ""), on: { click: function() { S.mode = "server"; DV.render(); } } }, "Running Server"));
    w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "4. Mode"), modeRow]));

    var bdi = document.createElement("input"); bdi.value = S.baseDir; bdi.placeholder = "Leave empty if project root is at repo root";
    bdi.addEventListener("input", function(e) { S.baseDir = e.target.value; });
    w.appendChild(el("div", { c: "form-section-sm" }, [
      el("div", { c: "label mb-6" }, "5. App subdirectory"), bdi,
      el("p", { c: "label-hint" }, "If your app is inside a subfolder")
    ]));

    var langPh = { auto: { build: "auto-detected", output: "auto-detected", start: "auto-detected" }, nodejs: { build: "npm run build", output: "dist", start: "npm start" }, java: { build: "mvn package -DskipTests", output: "target", start: "java -jar target/*.jar" }, python: { build: "python -m py_compile *.py || true", output: ".", start: "python app.py" } };
    var ph = langPh[S.language || "auto"] || langPh.auto;

    if (S.mode === "static") {
      var bci = document.createElement("input"); bci.value = S.buildCommand; bci.placeholder = ph.build;
      bci.addEventListener("input", function(e) { S.buildCommand = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "6. Build command"), bci]));

      var odi = document.createElement("input"); odi.value = S.outputDir; odi.placeholder = ph.output;
      odi.addEventListener("input", function(e) { S.outputDir = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "7. Output directory"), odi,
        el("p", { c: "label-hint" }, "Common: dist, build, out, target, web-build")
      ]));
    } else {
      var sci = document.createElement("input"); sci.value = S.startCommand; sci.placeholder = ph.start;
      sci.addEventListener("input", function(e) { S.startCommand = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "6. Start command"), sci,
        el("p", { c: "label-hint" }, "DeployView sets PORT env var automatically")
      ]));
    }

    var evi = document.createElement("textarea"); evi.value = S.envVars; evi.placeholder = "KEY=value\nANOTHER=value"; evi.rows = 3;
    evi.addEventListener("input", function(e) { S.envVars = e.target.value; });
    w.appendChild(el("div", { c: "form-section-lg" }, [
      el("div", { c: "label mb-6" }, (S.mode === "static" ? "8" : "7") + ". Environment variables"), evi,
      el("p", { c: "label-hint" }, "One per line: KEY=value")
    ]));

    var hasBranches = S.selectedBranches.length > 0;
    var submitAttrs = hasBranches ? {} : { disabled: "" };
    w.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg", on: { click: function() { S.view = "dashboard"; DV.render(); } } }, "Cancel"),
      el("button", { c: "bp flex-1", attr: submitAttrs, on: { click: function() {
        if (!S.selectedBranches.length) return;
        api("POST", "/api/repos", {
          owner: S.repoInfo.owner, repo: S.repoInfo.repo, activeBranches: S.selectedBranches,
          buildCommand: S.buildCommand, outputDir: S.outputDir, baseDir: S.baseDir,
          description: S.repoInfo.description, mode: S.mode, startCommand: S.startCommand, envVars: S.envVars, language: S.language
        }).then(function() { S.view = "dashboard"; DV.loadRepos(); });
      } } }, S.mode === "server" ? "Add & Start" : "Add & Build")
    ]));
  }
  app.appendChild(w);

  // Auto-focus the repo input on mount
  setTimeout(function() { ri.focus(); }, 50);
};
})();
