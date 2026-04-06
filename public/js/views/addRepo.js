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
      fb.textContent = "Fetch"; DV.render();
    }).catch(function(e) { es.textContent = e.message; es.classList.remove("hidden"); fb.textContent = "Fetch"; });
  } } }, "Fetch");

  w.appendChild(el("div", { c: "form-section" }, [
    el("div", { c: "label mb-6" }, "1. Repository"),
    el("div", { c: "form-row" }, [ri, fb]), es
  ]));

  if (S.fetchedBranches.length && S.repoInfo) {
    w.appendChild(el("div", { c: "card form-section-lg" }, [
      el("div", { c: "card-section-title" }, S.repoInfo.owner + "/" + S.repoInfo.repo),
      el("div", { c: "color-tx3 text-12 font-mono mt-4" }, S.repoInfo.description || "No description")
    ]));

    var bd = el("div", { c: "chip-row mt-6" });
    for (var i = 0; i < S.fetchedBranches.length; i++) {
      (function(b) {
        bd.appendChild(el("div", { c: "chip" + (S.selectedBranches.indexOf(b) !== -1 ? " on" : ""), on: { click: function() {
          var idx = S.selectedBranches.indexOf(b); if (idx !== -1) S.selectedBranches.splice(idx, 1); else S.selectedBranches.push(b); DV.render();
        } } }, b));
      })(S.fetchedBranches[i]);
    }
    w.appendChild(el("div", { c: "form-section" }, [el("div", { c: "label mb-6" }, "2. Branches to monitor"), bd]));

    var modeRow = el("div", { c: "chip-row" });
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "static" ? " on" : ""), on: { click: function() { S.mode = "static"; DV.render(); } } }, "Static Build"));
    modeRow.appendChild(el("div", { c: "chip" + (S.mode === "server" ? " on" : ""), on: { click: function() { S.mode = "server"; DV.render(); } } }, "Running Server"));
    w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "3. Mode"), modeRow]));

    var bdi = document.createElement("input"); bdi.value = S.baseDir; bdi.placeholder = "Leave empty if package.json is at root";
    bdi.addEventListener("input", function(e) { S.baseDir = e.target.value; });
    w.appendChild(el("div", { c: "form-section-sm" }, [
      el("div", { c: "label mb-6" }, "4. App subdirectory"), bdi,
      el("p", { c: "label-hint" }, "If your app is inside a subfolder")
    ]));

    if (S.mode === "static") {
      var bci = document.createElement("input"); bci.value = S.buildCommand; bci.placeholder = "npm run build";
      bci.addEventListener("input", function(e) { S.buildCommand = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "5. Build command"), bci]));

      var odi = document.createElement("input"); odi.value = S.outputDir; odi.placeholder = "dist";
      odi.addEventListener("input", function(e) { S.outputDir = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "6. Output directory"), odi,
        el("p", { c: "label-hint" }, "Common: dist, build, out, web-build")
      ]));
    } else {
      var sci = document.createElement("input"); sci.value = S.startCommand; sci.placeholder = "npm start";
      sci.addEventListener("input", function(e) { S.startCommand = e.target.value; });
      w.appendChild(el("div", { c: "form-section-sm" }, [el("div", { c: "label mb-6" }, "5. Start command"), sci,
        el("p", { c: "label-hint" }, "DeployView sets PORT env var automatically")
      ]));
    }

    var evi = document.createElement("textarea"); evi.value = S.envVars; evi.placeholder = "KEY=value\nANOTHER=value"; evi.rows = 3;
    evi.addEventListener("input", function(e) { S.envVars = e.target.value; });
    w.appendChild(el("div", { c: "form-section-lg" }, [
      el("div", { c: "label mb-6" }, (S.mode === "static" ? "7" : "6") + ". Environment variables"), evi,
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
          description: S.repoInfo.description, mode: S.mode, startCommand: S.startCommand, envVars: S.envVars
        }).then(function() { S.view = "dashboard"; DV.loadRepos(); });
      } } }, S.mode === "server" ? "Add & Start" : "Add & Build")
    ]));
  }
  app.appendChild(w);
};
})();
