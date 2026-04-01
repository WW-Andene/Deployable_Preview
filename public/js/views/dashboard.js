(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

DV.views.dashboard = function(app) {
  var ct = el("div", { s: { maxWidth: "960px", margin: "0 auto", padding: "calc(var(--sp) * 3) calc(var(--sp) * 2.5)" } });

  if (!S.repos.length) {
    ct.appendChild(el("div", { s: { textAlign: "center", padding: "100px 20px" } }, [
      el("div", { s: { fontSize: "56px", marginBottom: "24px", filter: "drop-shadow(0 0 24px var(--accent-glow))" } }, "\u26a1"),
      el("h2", { s: { fontSize: "24px", fontWeight: "700", marginBottom: "8px", letterSpacing: "-0.04em" } }, "Your workspace is ready"),
      el("p", { s: { color: "var(--tx2)", fontFamily: "var(--font-mono)", fontSize: "12px", maxWidth: "400px", margin: "0 auto 32px", lineHeight: "1.8", letterSpacing: "0.01em" } }, "Connect a repo, choose your branches, and DeployView handles the rest \u2014 clone, build, serve, auto-rebuild on push."),
      el("button", { c: "bp", s: { padding: "calc(var(--sp) * 1.5) calc(var(--sp) * 4)" }, on: { click: function() {
        S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
        S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
        S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
        S.view = "addRepo"; DV.render();
      } } }, "+ Add Repository")
    ]));
  } else {
    // Stats bar — at-a-glance overview (focal point)
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
    statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num", s: { color: "var(--ok)" } }, readyCount), el("span", { c: "stat-label" }, "Ready")]));
    if (buildingCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num", s: { color: "var(--accent)" } }, buildingCount), el("span", { c: "stat-label" }, "Building")]));
    if (errorCount) statsBar.appendChild(el("div", { c: "stat-item" }, [el("span", { c: "stat-num", s: { color: "var(--err)" } }, errorCount), el("span", { c: "stat-label" }, "Failed")]));
    ct.appendChild(statsBar);

    for (var i = 0; i < S.repos.length; i++) {
      (function(repo) {
        var card = el("div", { c: "card" });

        // Repo header with accent separator
        var header = el("div", { c: "repo-header" });
        var headerLeft = el("div", {});
        headerLeft.appendChild(el("h3", {}, repo.owner + "/" + repo.repo));
        if (repo.description) headerLeft.appendChild(el("p", { c: "repo-meta" }, repo.description));
        headerLeft.appendChild(el("p", { c: "repo-meta" }, (repo.buildCommand || "npm run build") + " \u2192 " + (repo.outputDir || "dist")));
        header.appendChild(headerLeft);
        header.appendChild(el("button", { c: "bd bs", on: { click: function() {
          api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo).then(DV.loadRepos);
        } } }, "\u2715"));
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
            var borderL = bs.status === "ready" ? "var(--ok)" : bs.status === "running" ? "var(--run)" : bs.status === "building" ? "var(--accent)" : bs.status === "error" ? "var(--err)" : "transparent";

            var row = el("div", { c: "branch-row", s: { borderLeftColor: borderL } });

            // Branded sweep bar for building state
            if (bs.status === "building") {
              row.appendChild(el("div", { c: "dv-loading", s: { position: "absolute", bottom: "0", left: "0", right: "0" } }));
            }

            // Status + label
            row.appendChild(el("div", { s: { display: "flex", alignItems: "center", gap: "calc(var(--sp))", minWidth: "0", flexShrink: "1" } }, [
              el("span", { c: statusClass(bs.status) }),
              el("span", { c: "btag", s: { background: bs.status === "ready" ? "var(--ok-dim)" : bs.status === "running" ? "var(--run-dim)" : bs.status === "building" ? "var(--accent-dim)" : bs.status === "error" ? "var(--err-dim)" : "var(--border)", color: bs.status === "ready" ? "var(--ok)" : bs.status === "running" ? "var(--run)" : bs.status === "building" ? "var(--accent)" : bs.status === "error" ? "var(--err)" : "var(--tx3)" } }, label)
            ]));

            // Status text
            row.appendChild(el("span", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx3)", flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
              bs.status === "building" ? (branchMode === "server" ? "Starting..." : "Building...") :
              bs.status === "running" ? "Running \u2014 port " + (bs.serverPort || "?") :
              bs.status === "ready" ? "Ready \u2014 " + previewUrl :
              bs.status === "error" ? (branchMode === "server" ? "Server failed" : "Build failed") : "Idle"
            ));

            // Action buttons
            var actions = el("div", { s: { display: "flex", gap: "calc(var(--sp) * 0.7)", flexShrink: "0" } });
            actions.appendChild(el("button", { c: "bg bs", on: { click: function() {
              api("POST", "/api/build/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug));
              DV.loadRepos();
            } } }, branchMode === "server" ? "\u27f3" : "\u27f3"));
            if (branchMode === "server" && bs.status === "running") {
              actions.appendChild(el("button", { c: "bg bs", on: { click: function() {
                api("POST", "/api/stop/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, "\u25a0"));
            }
            actions.appendChild(el("button", { c: "bp bs", s: { opacity: (bs.status === "ready" || bs.status === "running") ? "1" : ".35", pointerEvents: (bs.status === "ready" || bs.status === "running") ? "auto" : "none" }, on: { click: function() {
              S.activeRepo = repo; S.activeBranch = slug; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
            } } }, "\u25b6"));
            actions.appendChild(el("button", { c: "bg bs", on: { click: function() {
              S.logModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, "\ud83d\udccb"));
            actions.appendChild(el("button", { c: "bg bs", on: { click: function() {
              S.editModal = { owner: repo.owner, repo: repo.repo, slug: slug, branch: bs.branch, baseDir: bs.baseDir || "", buildCommand: bs.buildCommand || "", outputDir: bs.outputDir || "", mode: bs.mode || "static", startCommand: bs.startCommand || "", envVars: bs.envVars || "" }; DV.render();
            } } }, "\u270e"));
            actions.appendChild(el("button", { c: "bd bs", on: { click: function() {
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
