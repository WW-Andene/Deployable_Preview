(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.addRepo = function(app) {
  var w = el("div", { s: { maxWidth: "540px", margin: "0 auto", padding: "24px 16px" } });
  w.appendChild(el("h2", { s: { fontSize: "20px", fontWeight: "700", marginBottom: "20px" } }, "Add Repository"));

  var ri = document.createElement("input"); ri.placeholder = "owner/repo or full GitHub URL"; ri.value = S.repoUrl;
  ri.addEventListener("input", function(e) { S.repoUrl = e.target.value; });

  var es = el("span", { s: { color: "var(--err)", fontSize: "12px", fontFamily: "monospace", display: "none" } });
  var fb = el("button", { c: "bp", on: { click: function() {
    es.style.display = "none";
    var c = S.repoUrl.trim().replace(/\.git$/, "").replace(/\/$/, "");
    var m = c.match(/(?:github\.com\/)?([^\/]+)\/([^\/]+)$/);
    if (!m) { es.textContent = "Invalid. Use owner/repo."; es.style.display = "block"; return; }
    fb.innerHTML = "<span class='spin'></span>";
    api("GET", "/api/github/" + m[1] + "/" + m[2] + "/branches").then(function(r) {
      if (r.error) { es.textContent = r.error; es.style.display = "block"; fb.textContent = "Fetch"; return; }
      S.repoInfo = { owner: m[1], repo: m[2], description: r.description, defaultBranch: r.defaultBranch };
      S.fetchedBranches = r.branches;
      S.selectedBranches = [r.defaultBranch];
      fb.textContent = "Fetch"; DV.render();
    }).catch(function(e) { es.textContent = e.message; es.style.display = "block"; fb.textContent = "Fetch"; });
  } } }, "Fetch");

  w.appendChild(el("div", { s: { marginBottom: "20px" } }, [
    el("div", { c: "label", s: { marginBottom: "6px" } }, "Repository"),
    el("div", { s: { display: "flex", gap: "8px" } }, [ri, fb]), es
  ]));

  if (S.fetchedBranches.length && S.repoInfo) {
    w.appendChild(el("div", { c: "card", s: { marginBottom: "18px" } }, [
      el("div", { s: { fontWeight: "700", fontSize: "14px" } }, S.repoInfo.owner + "/" + S.repoInfo.repo),
      el("div", { s: { color: "var(--tx3)", fontSize: "12px", fontFamily: "monospace", marginTop: "4px" } }, S.repoInfo.description || "No description")
    ]));

    var bd = el("div", { s: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" } });
    for (var i = 0; i < S.fetchedBranches.length; i++) {
      (function(b) {
        bd.appendChild(el("div", { c: "chip" + (S.selectedBranches.indexOf(b) !== -1 ? " on" : ""), on: { click: function() {
          var idx = S.selectedBranches.indexOf(b); if (idx !== -1) S.selectedBranches.splice(idx, 1); else S.selectedBranches.push(b); DV.render();
        } } }, b));
      })(S.fetchedBranches[i]);
    }
    w.appendChild(el("div", { s: { marginBottom: "18px" } }, [el("div", { c: "label", s: { marginBottom: "6px" } }, "Branches to monitor"), bd]));

    // Mode toggle
    var modeRow = el("div", { s: { display: "flex", gap: "8px", marginBottom: "18px" } });
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "static" ? " on" : ""), on: { click: function() { S.mode = "static"; DV.render(); } } }, "Static Build"));
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "server" ? " on" : ""), on: { click: function() { S.mode = "server"; DV.render(); } } }, "Running Server"));
    w.appendChild(el("div", { s: { marginBottom: "14px" } }, [el("div", { c: "label", s: { marginBottom: "6px" } }, "Mode"), modeRow]));

    var bdi = document.createElement("input"); bdi.value = S.baseDir; bdi.placeholder = "Leave empty if package.json is at root";
    bdi.addEventListener("input", function(e) { S.baseDir = e.target.value; });
    w.appendChild(el("div", { s: { marginBottom: "14px" } }, [
      el("div", { c: "label", s: { marginBottom: "6px" } }, "App subdirectory"), bdi,
      el("p", { s: { color: "var(--tx3)", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "If your app is inside a subfolder")
    ]));

    if (S.mode === "static") {
      var bci = document.createElement("input"); bci.value = S.buildCommand; bci.placeholder = "npm run build";
      bci.addEventListener("input", function(e) { S.buildCommand = e.target.value; });
      w.appendChild(el("div", { s: { marginBottom: "14px" } }, [el("div", { c: "label", s: { marginBottom: "6px" } }, "Build command"), bci]));

      var odi = document.createElement("input"); odi.value = S.outputDir; odi.placeholder = "dist";
      odi.addEventListener("input", function(e) { S.outputDir = e.target.value; });
      w.appendChild(el("div", { s: { marginBottom: "14px" } }, [el("div", { c: "label", s: { marginBottom: "6px" } }, "Output directory"), odi,
        el("p", { s: { color: "var(--tx3)", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "Common: dist, build, out, web-build")
      ]));
    } else {
      var sci = document.createElement("input"); sci.value = S.startCommand; sci.placeholder = "npm start";
      sci.addEventListener("input", function(e) { S.startCommand = e.target.value; });
      w.appendChild(el("div", { s: { marginBottom: "14px" } }, [el("div", { c: "label", s: { marginBottom: "6px" } }, "Start command"), sci,
        el("p", { s: { color: "var(--tx3)", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "DeployView sets PORT env var automatically")
      ]));
    }

    var evi = document.createElement("textarea"); evi.value = S.envVars; evi.placeholder = "KEY=value\nANOTHER=value"; evi.rows = 3;
    evi.addEventListener("input", function(e) { S.envVars = e.target.value; });
    w.appendChild(el("div", { s: { marginBottom: "22px" } }, [
      el("div", { c: "label", s: { marginBottom: "6px" } }, "Environment variables"), evi,
      el("p", { s: { color: "var(--tx3)", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "One per line: KEY=value")
    ]));

    w.appendChild(el("div", { s: { display: "flex", gap: "10px" } }, [
      el("button", { c: "bg", on: { click: function() { S.view = "dashboard"; DV.render(); } } }, "Cancel"),
      el("button", { c: "bp", s: { flex: "1" }, on: { click: function() {
        if (!S.selectedBranches.length) return;
        api("POST", "/api/repos", {
          owner: S.repoInfo.owner, repo: S.repoInfo.repo, activeBranches: S.selectedBranches,
          buildCommand: S.buildCommand, outputDir: S.outputDir, baseDir: S.baseDir,
          description: S.repoInfo.description, mode: S.mode, startCommand: S.startCommand, envVars: S.envVars
        }).then(function() { S.view = "dashboard"; DV.loadRepos(); });
      } } }, S.mode === "server" ? "\u2713 Add & Start" : "\u2713 Add & Build")
    ]));
  }
  app.appendChild(w);
};
})();
