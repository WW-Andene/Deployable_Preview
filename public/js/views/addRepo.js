(function(){
var S = DV.S, el = DV.el, api = DV.api;

function parseRepoUrl(raw) {
  // Strip query (?...) and fragment (#...) BEFORE the .git / trailing-
  // slash cleanup, otherwise URLs like
  //   https://github.com/owner/repo?ref=main
  // capture "repo?ref=main" as the repo name and fail server validation.
  var c = raw.trim().replace(/[?#].*$/, "").replace(/\.git$/, "").replace(/\/$/, "");
  return c.match(/(?:github\.com\/)?([^\/]+)\/([^\/]+)$/);
}

// Format an ISO date as "5h ago" / "3d ago" / "2025-04-21".
function timeAgo(iso) {
  if (!iso) return "";
  var ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || isNaN(ms)) return "";
  var s = Math.floor(ms / 1000);
  if (s < 60)        return s + "s ago";
  if (s < 3600)      return Math.floor(s / 60) + "m ago";
  if (s < 86400)     return Math.floor(s / 3600) + "h ago";
  if (s < 604800)    return Math.floor(s / 86400) + "d ago";
  return iso.slice(0, 10);
}

// Fire the same fetch-branches + detect-framework chain that the URL
// "Fetch" button triggers, but starting from a known (owner, repo, defaultBranch).
function installFromGh(repoEntry, onProgress, onError) {
  S.repoUrl = repoEntry.fullName;
  if (typeof onProgress === "function") onProgress("loading");
  api("GET", "/api/github/" + repoEntry.owner + "/" + repoEntry.repo + "/branches").then(function(r) {
    if (r.error) { if (typeof onError === "function") onError(r.error); return; }
    S.repoInfo = {
      owner: repoEntry.owner, repo: repoEntry.repo,
      description: r.description || repoEntry.description,
      defaultBranch: r.defaultBranch || repoEntry.defaultBranch
    };
    S.fetchedBranches = r.branches;
    S.selectedBranches = [S.repoInfo.defaultBranch];
    S.detectedFramework = null;
    DV.render();
    var branch = S.repoInfo.defaultBranch;
    api("GET", "/api/github/" + repoEntry.owner + "/" + repoEntry.repo + "/detect?branch=" + encodeURIComponent(branch))
      .then(function(d) {
        if (!d || d.error || !d.framework || d.framework === "unknown" || d.framework === "none") return;
        S.detectedFramework = d;
        if (!S.buildCommand) S.buildCommand = d.buildCommand || S.buildCommand;
        if (!S.outputDir)    S.outputDir    = d.outputDir    || S.outputDir;
        if (!S.startCommand) S.startCommand = d.startCommand || S.startCommand;
        if (d.mode && S.mode === "static") S.mode = d.mode;
        if (!S.envVars && d.envTemplate) S.envVars = d.envTemplate;
        DV.render();
      }).catch(function(){ /* silent */ });
  }).catch(function(e) { if (typeof onError === "function") onError(e.message); });
}

DV.views.addRepo = function(app) {
  var w = el("div", { c: "add-repo-page" });
  w.appendChild(el("h2", { c: "page-title" }, "Add Repository"));

  // ── 1a. Pick from your GitHub repositories ────────────────────────────
  // Auto-fetch on first mount (uses 5-min server cache afterwards).
  if (S.ghRepos === null && !S.ghReposLoading) DV.fetchGhRepos(false);

  // Set of "owner/repo" strings already configured in DV — used to mark
  // rows as already installed.
  var installedSet = {};
  for (var ri2 = 0; ri2 < S.repos.length; ri2++) {
    installedSet[S.repos[ri2].owner + "/" + S.repos[ri2].repo] = true;
  }

  var pickerHeader = el("div", { c: "form-row repo-picker-header" }, [
    el("div", { c: "label" }, "1. Pick from your GitHub"),
    el("button", {
      c: "bg bs",
      attr: { title: "Refresh from GitHub", "aria-label": "Refresh repository list" },
      on: { click: function() { DV.fetchGhRepos(true); } }
    }, S.ghReposLoading ? "Refreshing…" : "Refresh")
  ]);

  // Filter input
  var filterInput = document.createElement("input");
  filterInput.placeholder = "Filter by name…";
  filterInput.value = S.ghReposFilter || "";
  filterInput.className = "repo-picker-filter";
  filterInput.addEventListener("input", function(e) { S.ghReposFilter = e.target.value; DV.render(); });

  // Type filter chips (all / mine / shared)
  var typeRow = el("div", { c: "chip-row repo-picker-types" });
  var types = [{ k: "all", l: "All" }, { k: "owner", l: "Mine" }, { k: "member", l: "Shared" }];
  for (var ti = 0; ti < types.length; ti++) {
    (function(t) {
      typeRow.appendChild(el("div", {
        c: "chip" + (S.ghReposType === t.k ? " on" : ""),
        attr: { role: "button", tabindex: "0", "aria-pressed": S.ghReposType === t.k ? "true" : "false" },
        on: {
          click: function() { if (S.ghReposType !== t.k) { S.ghReposType = t.k; DV.fetchGhRepos(false); } },
          keydown: function(e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (S.ghReposType !== t.k) { S.ghReposType = t.k; DV.fetchGhRepos(false); } } }
        }
      }, t.l));
    })(types[ti]);
  }

  // Repo list
  var listBody = el("div", { c: "repo-picker-list", attr: { role: "list" } });
  if (S.ghReposLoading && S.ghRepos === null) {
    listBody.appendChild(el("div", { c: "repo-picker-status" }, [
      el("span", { c: "spin" }), el("span", { c: "ml-8" }, "Loading repositories…")
    ]));
  } else if (S.ghReposError) {
    listBody.appendChild(el("div", { c: "repo-picker-status color-err" }, S.ghReposError));
  } else if (Array.isArray(S.ghRepos)) {
    var q = (S.ghReposFilter || "").trim().toLowerCase();
    var filtered = S.ghRepos.filter(function(r) {
      if (!q) return true;
      return r.fullName.toLowerCase().indexOf(q) !== -1
          || (r.description || "").toLowerCase().indexOf(q) !== -1;
    });
    if (!filtered.length) {
      listBody.appendChild(el("div", { c: "repo-picker-status" }, q ? "No repositories match “" + q + "”" : "No repositories found"));
    } else {
      for (var i = 0; i < filtered.length; i++) {
        (function(r) {
          var installed = installedSet[r.fullName];
          var loadingThisRow = S.repoUrl === r.fullName && S.fetchedBranches.length === 0 && !S.repoInfo;
          var meta = [];
          if (r.private)  meta.push(el("span", { c: "repo-picker-tag tag-private" }, "private"));
          if (r.fork)     meta.push(el("span", { c: "repo-picker-tag tag-fork" }, "fork"));
          if (r.archived) meta.push(el("span", { c: "repo-picker-tag tag-arch" }, "archived"));
          if (r.language) meta.push(el("span", { c: "repo-picker-tag" }, r.language));
          meta.push(el("span", { c: "repo-picker-meta" }, "updated " + timeAgo(r.pushedAt || r.updatedAt)));

          var actionBtn;
          if (installed) {
            actionBtn = el("button", {
              c: "bg bs repo-picker-installed",
              attr: { disabled: "", title: "Already added — open from Dashboard", "aria-label": "Already installed" }
            }, "✓ Installed");
          } else {
            actionBtn = el("button", {
              c: "bp bs",
              attr: { title: "Install " + r.fullName, "aria-label": "Install " + r.fullName },
              on: { click: function() {
                actionBtn.innerHTML = "<span class='spin'></span>";
                installFromGh(r,
                  function() {/* progress */},
                  function(err) {
                    actionBtn.textContent = "Install";
                    DV.showToast("Failed: " + err, "error");
                  });
              } }
            }, loadingThisRow ? "Installing…" : "Install");
          }

          var row = el("div", {
            c: "repo-picker-row" + (installed ? " repo-picker-row-installed" : ""),
            attr: { role: "listitem" }
          }, [
            el("div", { c: "repo-picker-row-main" }, [
              el("div", { c: "repo-picker-name" }, r.fullName),
              r.description ? el("div", { c: "repo-picker-desc" }, r.description) : null,
              el("div", { c: "repo-picker-tags" }, meta)
            ].filter(Boolean)),
            actionBtn
          ]);
          listBody.appendChild(row);
        })(filtered[i]);
      }
    }
  }

  w.appendChild(el("div", { c: "form-section" }, [
    pickerHeader,
    typeRow,
    filterInput,
    listBody
  ]));

  // ── 1b. Or paste a URL (collapsed unless no picker selection yet) ─────
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
    installFromGh({
      owner: m[1], repo: m[2], fullName: m[1] + "/" + m[2], description: "", defaultBranch: ""
    }, function(){ fb.textContent = "Fetch"; }, function(err) {
      es.textContent = err; es.classList.remove("hidden"); fb.textContent = "Fetch";
    });
  } } }, "Fetch");

  w.appendChild(el("div", { c: "form-section-sm" }, [
    el("div", { c: "label mb-6" }, "Or paste a repository URL"),
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

  // Auto-focus the URL input only on a FRESH entry into addRepo. Without
  // this guard the unconditional focus() steals focus from the picker
  // filter input and chip selectors on every re-render — making them
  // effectively unusable.
  if (DV._prevRenderedView !== "addRepo") {
    setTimeout(function() { ri.focus(); }, 50);
  }
};
})();
