(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

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
    var statsBar = el("div", { c: "stats-bar" });
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num" }, S.repos.length), el("span", { c: "stat-label" }, "Repos")]));
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num" }, totalBranches), el("span", { c: "stat-label" }, "Branches")]));
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-ok" }, readyCount), el("span", { c: "stat-label" }, "Ready")]));
    if (buildingCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-accent" }, buildingCount), el("span", { c: "stat-label" }, "Building")]));
    if (errorCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num color-err" }, errorCount), el("span", { c: "stat-label" }, "Failed")]));
    ct.appendChild(statsBar);

    for (var i = 0; i < S.repos.length; i++) {
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

            row.appendChild(el("span", { c: "branch-status-text" },
              bs.status === "building" ? (branchMode === "server" ? "Starting..." : "Building...") :
              bs.status === "running" ? "Running \u2014 port " + (bs.serverPort || "?") :
              bs.status === "ready" ? "Ready \u2014 " + previewUrl :
              bs.status === "error" ? (branchMode === "server" ? "Server failed" : "Build failed") : "Idle"
            ));

            var actions = el("div", { c: "branch-actions" });
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Rebuild" }, on: { click: function() {
              api("POST", "/api/build/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug));
              DV.loadRepos();
            } } }, "R"));
            if (branchMode === "server" && bs.status === "running") {
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "Stop server" }, on: { click: function() {
                api("POST", "/api/stop/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, "Stop"));
            }
            if (isLive) {
              actions.appendChild(el("button", { c: "bp bs", attr: { title: "Open preview" }, on: { click: function() {
                S.activeRepo = repo; S.activeBranch = slug; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
              } } }, "Go"));
            } else {
              actions.appendChild(el("button", { c: "bp bs opacity-dim", attr: { disabled: "", title: "Preview unavailable" } }, "Go"));
            }
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "View build log" }, on: { click: function() {
              S.logModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, "Log"));
            actions.appendChild(el("button", { c: "bg bs btn-accent-highlight", attr: { title: "Build Android APK" }, on: { click: function() {
              S.apkModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug };
              DV.render();
            } } }, "APK"));
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Edit branch settings" }, on: { click: function() {
              S.editModal = { owner: repo.owner, repo: repo.repo, slug: slug, branch: bs.branch, baseDir: bs.baseDir || "", buildCommand: bs.buildCommand || "", outputDir: bs.outputDir || "", mode: bs.mode || "static", startCommand: bs.startCommand || "", envVars: bs.envVars || "" }; DV.render();
            } } }, "Edit"));
            actions.appendChild(el("button", { c: "bd bs", attr: { title: "Delete branch" }, on: { click: function() {
              if (!confirm("Delete this branch?")) return;
              api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo + "/branch?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
            } } }, "x"));
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
