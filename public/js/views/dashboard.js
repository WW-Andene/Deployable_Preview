(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

// ── Multi-select helpers (exposed on DV for the keyboard handler) ──
function rowKey(owner, repo, slug) { return owner + "/" + repo + ":" + slug; }
function selectedKeys() { return Object.keys(S.selectedRows || {}).filter(function(k){ return S.selectedRows[k]; }); }
function clearSelection() { S.selectedRows = {}; }

DV._selectAllBranches = function() {
  var any = false;
  for (var i = 0; i < (S.repos || []).length; i++) {
    var r = S.repos[i], slugs = Object.keys(r.branchStatuses || {});
    for (var j = 0; j < slugs.length; j++) {
      var k = rowKey(r.owner, r.repo, slugs[j]);
      if (!S.selectedRows[k]) { S.selectedRows[k] = true; any = true; }
    }
  }
  if (!any) clearSelection(); // toggle off if everything was already selected
  DV.render();
};
DV._rebuildSelectedBranches = function() {
  var keys = selectedKeys();
  if (!keys.length) { DV.showToast("Nothing selected", "info"); return; }
  if (!confirm("Rebuild " + keys.length + " selected branch" + (keys.length === 1 ? "" : "es") + "?")) return;
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split(":");
    var ownerRepo = parts[0].split("/");
    api("POST", "/api/build/" + ownerRepo[0] + "/" + ownerRepo[1] + "?slug=" + encodeURIComponent(parts[1]));
  }
  DV.showToast("Rebuilding " + keys.length + " branch" + (keys.length === 1 ? "" : "es") + "…", "info");
  clearSelection();
  DV.loadRepos();
};
DV._stopSelectedBranches = function() {
  var keys = selectedKeys();
  if (!keys.length) return;
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split(":");
    var ownerRepo = parts[0].split("/");
    api("POST", "/api/stop/" + ownerRepo[0] + "/" + ownerRepo[1] + "?slug=" + encodeURIComponent(parts[1]));
  }
  DV.showToast("Stopping " + keys.length + "…", "info");
  clearSelection();
  DV.loadRepos();
};

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

    // Bulk action bar — appears when 1+ branches selected
    var selCount = selectedKeys().length;
    if (selCount > 0) {
      var bar = el("div", { c: "bulk-bar" }, [
        el("span", {}, selCount + " selected"),
        el("span", { c: "bulk-bar-sep" }),
        el("button", { c: "bg bs", on: { click: DV._rebuildSelectedBranches } }, "Rebuild (b)"),
        el("button", { c: "bg bs", on: { click: DV._stopSelectedBranches } }, "Stop"),
        el("button", { c: "bg bs", on: { click: function(){ clearSelection(); DV.render(); } } }, "Clear")
      ]);
      ct.appendChild(bar);
    }

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

            // Checkbox for multi-select
            var rk = rowKey(repo.owner, repo.repo, slug);
            var checked = !!S.selectedRows[rk];
            row.appendChild(el("div", {
              c: "branch-check" + (checked ? " on" : ""),
              attr: { title: "Select for bulk action", "aria-label": "Select " + label + " for bulk action", role: "checkbox", "aria-checked": S.selectedRows[rk] ? "true" : "false", tabindex: "0" },
              on: {
                click: function(e) {
                  e.stopPropagation();
                  if (S.selectedRows[rk]) delete S.selectedRows[rk]; else S.selectedRows[rk] = true;
                  DV.render();
                },
                // G3-001: keyboard-toggle support (Space / Enter)
                keydown: function(e) {
                  if (e.key !== " " && e.key !== "Enter") return;
                  e.preventDefault();
                  if (S.selectedRows[rk]) delete S.selectedRows[rk]; else S.selectedRows[rk] = true;
                  DV.render();
                }
              }
            }));

            var info = el("div", { c: "branch-info" }, [
              // G1-002: status conveyed by aria-label, not just colour
              el("span", { c: statusClass(bs.status), attr: { role: "img", "aria-label": "Status: " + (bs.status || "idle") } }),
              el("span", { c: btagClass(bs.status) }, label)
            ]);
            if (bs.hasThumb) {
              var thumb = document.createElement("img");
              thumb.className = "branch-thumb";
              thumb.src = "/api/thumb/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug) + "&t=" + (bs.thumbAt || 0);
              thumb.alt = "preview of " + label;
              thumb.title = "Latest preview — click to open";
              thumb.addEventListener("click", (function(r2, s2){ return function(){
                S.activeRepo = r2; S.activeBranch = s2; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
              }; })(repo, slug));
              info.insertBefore(thumb, info.firstChild);
            }
            // Auto-diff pill: shows pixel change vs. previous build's thumb.
            if (bs.diff && typeof bs.diff.percent === "number") {
              var pct = bs.diff.percent;
              var diffCls = pct < 0.5 ? "diff-badge diff-badge-none"
                          : pct < 5  ? "diff-badge diff-badge-small"
                          : pct < 20 ? "diff-badge diff-badge-medium"
                                     : "diff-badge diff-badge-large";
              var diffPill = el("span", {
                c: diffCls,
                attr: { title: "Pixel change vs. previous build — click for heatmap" },
                on: { click: (function(r2, s2){ return function(ev) {
                  ev.stopPropagation();
                  window.open("/api/thumb-diff/" + r2.owner + "/" + r2.repo + "?slug=" + encodeURIComponent(s2), "_blank");
                }; })(repo, slug) }
              }, "Δ " + pct.toFixed(1) + "%");
              info.appendChild(diffPill);
            }
            row.appendChild(info);

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
              // F2-003: surface "see Log" inline so users know how to recover.
              statusParts.push(el("span", {}, branchMode === "server" ? "Server failed" : "Build failed"));
              statusParts.push(el("span", { c: "color-tx3 text-10" }, "— open Log for details"));
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
              } } }, DV.iconEl("close")));
            } else if (isLive) {
              actions.appendChild(el("button", { c: "bp bs", attr: { title: "Preview" }, on: { click: function() {
                S.activeRepo = repo; S.activeBranch = slug; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
              } } }, DV.iconEl("preview")));
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "New tab" }, on: { click: function() {
                window.open(previewUrl, "_blank");
              } } }, DV.iconEl("arrow_out")));
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "Copy shareable URL (uses tunnel when active)" }, on: { click: function() {
                var origin = (S._tunnelStatus && S._tunnelStatus.url) ? S._tunnelStatus.url : window.location.origin;
                var full = origin.replace(/\/$/, "") + previewUrl;
                var done = function(ok){ DV.showToast(ok ? "Copied: " + full : "Copy failed", ok ? "success" : "error"); };
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(full).then(function(){ done(true); }, function(){ done(false); });
                } else {
                  var ta = document.createElement("textarea"); ta.value = full; document.body.appendChild(ta);
                  ta.select(); try { done(document.execCommand("copy")); } catch (e) { done(false); }
                  document.body.removeChild(ta);
                }
              } } }, DV.iconEl("link")));
            }

            /* Secondary actions */
            if (branchMode === "server" && bs.status === "running") {
              actions.appendChild(el("button", { c: "bg bs", attr: { title: "Stop" }, on: { click: function() {
                api("POST", "/api/stop/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, DV.iconEl("stop")));
            }
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Rebuild" }, on: { click: function() {
              api("POST", "/api/build/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)); DV.loadRepos();
            } } }, DV.iconEl("rebuild")));
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Log" }, on: { click: function() {
              S.logModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, DV.iconEl("log")));
            actions.appendChild(el("button", { c: "bg bs", attr: { title: "Edit" }, on: { click: function() {
              S.editModal = { owner: repo.owner, repo: repo.repo, slug: slug, branch: bs.branch, baseDir: bs.baseDir || "", buildCommand: bs.buildCommand || "", outputDir: bs.outputDir || "", mode: bs.mode || "static", startCommand: bs.startCommand || "", envVars: bs.envVars || "", language: bs.language || "auto" }; DV.render();
            } } }, DV.iconEl("edit")));
            actions.appendChild(el("button", { c: "bg bs btn-accent-highlight", attr: { title: "APK" }, on: { click: function() {
              S.apkModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
            } } }, "APK"));
            actions.appendChild(el("button", { c: "bd bs", attr: { title: "Delete" }, on: { click: function() {
              if (!confirm("Remove this branch?")) return;
              api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo + "/branch?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
            } } }, DV.iconEl("close")));
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
