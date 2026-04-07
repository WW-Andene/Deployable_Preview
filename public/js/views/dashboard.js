(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

function timeAgo(ts) {
  if (!ts) return "";
  var diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return diff + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function btagClass(status) {
  return "btag btag-" + (status === "ready" ? "ready" : status === "running" ? "running" : status === "building" ? "building" : status === "error" ? "error" : "idle");
}
function rowClass(status) {
  return "branch-row stagger-in branch-row-" + (status === "ready" ? "ready" : status === "running" ? "running" : status === "building" ? "building" : status === "error" ? "error" : "idle");
}

DV.views.dashboard = function(app) {
  var ct = el("div", { c: "container" });

  if (!S.repos.length) {
    ct.appendChild(el("div", { c: "loading-view" }, [
      el("div", { c: "setup-logo" }, "DV"),
      el("h2", { c: "page-title" }, "Deploy your first app"),
      el("p", { c: "preview-empty-text mb-32" }, "Pick a repo, choose branches, and DeployView handles the rest \u2014 clone, build, serve, auto-rebuild on push."),
      el("button", { c: "bp p-10-28 text-14", on: { click: function() {
        S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
        S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
        S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
        S.view = "addRepo"; DV.render();
      } } }, "+ Add Repository")
    ]));
  } else {
    var totalBranches = 0, readyCount = 0, buildingCount = 0, errorCount = 0;
    for (var ri = 0; ri < S.repos.length; ri++) {
      var bs = S.repos[ri].branchStatuses || {};
      for (var k in bs) {
        totalBranches++;
        if (bs[k].status === "ready" || bs[k].status === "running") readyCount++;
        else if (bs[k].status === "building") buildingCount++;
        else if (bs[k].status === "error") errorCount++;
      }
    }
    // Search/filter bar
    if (S.repos.length > 2) {
      var searchRow = el("div", { c: "flex-row gap-8 mb-12" });
      var searchInput = document.createElement("input");
      searchInput.className = "flex-1";
      searchInput.placeholder = "Filter repos & branches...";
      searchInput.value = S.dashboardFilter || "";
      searchInput.addEventListener("input", function(e) {
        S.dashboardFilter = e.target.value;
        DV.render();
      });
      searchRow.appendChild(searchInput);
      ct.appendChild(searchRow);
    }

    var statsBar = el("div", { c: "stats-bar" });
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num" }, S.repos.length), el("span", { c: "stat-label" }, "Repos")]));
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num" }, totalBranches), el("span", { c: "stat-label" }, "Branches")]));
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-ok" }, readyCount), el("span", { c: "stat-label" }, "Ready")]));
    if (buildingCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-accent" }, buildingCount), el("span", { c: "stat-label" }, "Building")]));
    if (errorCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-err" }, errorCount), el("span", { c: "stat-label" }, "Failed")]));
    ct.appendChild(statsBar);

    var filteredRepos = S.repos;
    if (S.dashboardFilter) {
      var q = S.dashboardFilter.toLowerCase();
      filteredRepos = S.repos.filter(function(r) {
        if ((r.owner + "/" + r.repo).toLowerCase().indexOf(q) !== -1) return true;
        var bs = r.branchStatuses || {};
        for (var k in bs) { if ((bs[k].branch || k).toLowerCase().indexOf(q) !== -1) return true; }
        return false;
      });
    }

    for (var i = 0; i < filteredRepos.length; i++) {
      (function(repo) {
        var card = el("div", { c: "card" });

        var header = el("div", { c: "repo-header" });
        var headerLeft = el("div", {});
        headerLeft.appendChild(el("h3", {}, repo.owner + "/" + repo.repo));
        if (repo.description) headerLeft.appendChild(el("p", { c: "repo-meta" }, repo.description));
        headerLeft.appendChild(el("p", { c: "repo-meta" }, (repo.buildCommand || "npm run build") + " \u2192 " + (repo.outputDir || "dist")));
        header.appendChild(headerLeft);
        header.appendChild(el("button", { c: "bd bs", attr: { title: "Delete repository" }, on: { click: function() {
          if (!confirm("Delete this repository?")) return;
          api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo).then(DV.loadRepos);
        } } }, "x"));
        card.appendChild(header);

        var slugs = Object.keys(repo.branchStatuses || {});
        for (var j = 0; j < slugs.length; j++) {
          (function(slug) {
            var bs = repo.branchStatuses[slug] || { status: "idle" };
            var branchName = bs.branch || slug;
            var branchBaseDir = bs.baseDir || "";
            var branchMode = bs.mode || "static";
            var label = branchName + (branchBaseDir ? " \u2192 " + branchBaseDir : "") + (branchMode === "server" ? " [server]" : "");
            var previewUrl = "/preview/" + repo.owner + "/" + repo.repo + "/" + slug + "/";
            var isLive = bs.status === "ready" || bs.status === "running";

            var row = el("div", { c: rowClass(bs.status) });

            if (bs.status === "building") {
              row.appendChild(el("div", { c: "dv-loading branch-loading" }));
            }

            row.appendChild(el("div", { c: "branch-info" }, [
              el("span", { c: statusClass(bs.status) }),
              el("span", { c: btagClass(bs.status) }, label)
            ]));

            var statusParts = [];
            if (bs.status === "cancelled") {
              statusParts.push(el("span", {}, "Cancelled"));
            } else if (bs.status === "queued") {
              statusParts.push(el("span", {}, "Queued..."));
            } else if (bs.status === "building") {
              statusParts.push(el("span", {}, branchMode === "server" ? "Starting..." : "Building..."));
            } else if (bs.status === "running") {
              statusParts.push(el("span", {}, "Running \u2014 port " + (bs.serverPort || "?")));
            } else if (bs.status === "ready") {
              statusParts.push(el("span", {}, "Ready"));
            } else if (bs.status === "error") {
              statusParts.push(el("span", {}, branchMode === "server" ? "Server failed" : "Build failed"));
            } else {
              statusParts.push(el("span", {}, "Idle"));
            }
            if (bs.duration && bs.status !== "building") {
              statusParts.push(el("span", { c: "duration-badge" }, bs.duration + "s"));
            }
            if (bs.lastBuild && bs.status !== "building") {
              statusParts.push(el("span", { c: "color-tx3 text-10 font-mono" }, timeAgo(bs.lastBuild)));
            }
            if (bs.commitSha && bs.status !== "building" && bs.status !== "idle") {
              statusParts.push(el("span", { c: "sha-badge", attr: { title: "Commit: " + bs.commitSha }, on: { click: function() {
                if (navigator.clipboard) { navigator.clipboard.writeText(bs.commitSha); DV.showToast("SHA copied: " + (bs.commitSha || "").slice(0, 7), "info"); }
              } } }, bs.commitSha.slice(0, 7)));
            }
            row.appendChild(el("div", { c: "branch-status-text flex-row gap-6 items-center flex-wrap" }, statusParts));

            var actions = el("div", { c: "branch-actions" });

            /* Primary action */
            if (bs.status === "building" || bs.status === "queued") {
              actions.appendChild(el("button", { c: "bd bs", attr: { title: "Cancel" }, on: { click: function() {
                api("POST", "/api/cancel/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(function(r) {
                  if (r.ok) DV.showToast("Cancelled", "info"); DV.loadRepos();
                });
              } } }, "\u2715"));
            } else if (isLive) {
              actions.appendChild(el("button", { c: "bp bs", attr: { title: "Preview" }, on: { click: function() {
                S.activeRepo = repo; S.activeBranch = slug; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
              } } }, "\u25B6"));
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "New tab" }, on: { click: function() {
                window.open(previewUrl, "_blank");
              } } }, "\u2197"));
            }

            /* Secondary actions */
            if (branchMode === "server" && bs.status === "running") {
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "Stop" }, on: { click: function() {
                api("POST", "/api/stop/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, "\u25A0"));
            }
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Rebuild" }, on: { click: function() {
              api("POST", "/api/build/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)); DV.loadRepos();
            } } }, "\u21BB"));
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Log" }, on: { click: function() {
              S.logModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, "\u2261"));
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Edit" }, on: { click: function() {
              S.editModal = { owner: repo.owner, repo: repo.repo, slug: slug, branch: bs.branch, baseDir: bs.baseDir || "", buildCommand: bs.buildCommand || "", outputDir: bs.outputDir || "", mode: bs.mode || "static", startCommand: bs.startCommand || "", envVars: bs.envVars || "" }; DV.render();
            } } }, "\u270E"));
            actions.appendChild(el("button", { c: "bg bs btn-accent-highlight", attr: { title: "APK" }, on: { click: function() {
              S.apkModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, "APK"));
            actions.appendChild(el("button", { c: "bd bs", attr: { title: "Delete" }, on: { click: function() {
              if (!confirm("Remove this branch?")) return;
              api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo + "/branch?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
            } } }, "\u2715"));
            row.appendChild(actions);

            card.appendChild(row);
          })(slugs[j]);
        }
        ct.appendChild(card);
      })(S.repos[i]);
    }
  }
  app.appendChild(ct);
};
})();
