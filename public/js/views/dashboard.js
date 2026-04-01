(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

DV.views.dashboard = function(app) {
  var ct = el("div", { s: { maxWidth: "960px", margin: "0 auto", padding: "20px 16px" } });
  if (!S.repos.length) {
    ct.appendChild(el("div", { s: { textAlign: "center", padding: "60px 0" } }, [
      el("div", { s: { fontSize: "40px", marginBottom: "16px", opacity: ".3" } }, "\u26a1"),
      el("h2", { s: { fontSize: "20px", fontWeight: "700", marginBottom: "10px" } }, "No repositories yet"),
      el("p", { s: { color: "#565250", fontFamily: "monospace", fontSize: "13px", maxWidth: "440px", margin: "0 auto 24px", lineHeight: "1.6" } }, "Add a repo, pick branches \u2014 DeployView will clone, build, and serve them. Auto-rebuilds on every push."),
      el("button", { c: "bp", on: { click: function() {
        S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
        S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
        S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
        S.view = "addRepo"; DV.render();
      } } }, "+ Add Repo")
    ]));
  } else {
    for (var i = 0; i < S.repos.length; i++) {
      (function(repo) {
        var card = el("div", { c: "card" });
        card.appendChild(el("div", { s: { display: "flex", justifyContent: "space-between", marginBottom: "14px" } }, [
          el("div", {}, [
            el("h3", { s: { fontSize: "15px", fontWeight: "700", wordBreak: "break-all" } }, repo.owner + "/" + repo.repo),
            repo.description ? el("p", { s: { color: "#565250", fontSize: "12px", fontFamily: "monospace", marginTop: "4px" } }, repo.description) : null,
            el("p", { s: { color: "#565250", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "Build: " + (repo.buildCommand || "npm run build") + " \u2192 " + (repo.outputDir || "dist"))
          ]),
          el("button", { c: "bd bs", on: { click: function() {
            api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo).then(DV.loadRepos);
          } } }, "\u2715 Remove")
        ]));

        var slugs = Object.keys(repo.branchStatuses || {});
        for (var j = 0; j < slugs.length; j++) {
          (function(slug) {
            var bs = repo.branchStatuses[slug] || { status: "idle" };
            var branchName = bs.branch || slug;
            var branchBaseDir = bs.baseDir || "";
            var branchMode = bs.mode || "static";
            var label = branchName + (branchBaseDir ? " \u2192 " + branchBaseDir : "") + (branchMode === "server" ? " [server]" : "");
            var previewUrl = "/preview/" + repo.owner + "/" + repo.repo + "/" + slug + "/";
            var row = el("div", { s: { background: "#0b0c10", borderRadius: "10px", padding: "12px", border: "1.5px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" } }, [
              el("div", { s: { minWidth: "100px", display: "flex", alignItems: "center", gap: "8px" } }, [
                el("span", { c: statusClass(bs.status) }),
                el("span", { c: "btag", s: { background: bs.status === "ready" ? "rgba(72,176,136,.1)" : bs.status === "running" ? "rgba(91,159,212,.1)" : bs.status === "building" ? "rgba(232,169,74,.1)" : bs.status === "error" ? "rgba(224,84,104,.1)" : "rgba(255,255,255,.05)", color: bs.status === "ready" ? "#48b088" : bs.status === "running" ? "#5b9fd4" : bs.status === "building" ? "#e8a94a" : bs.status === "error" ? "#e05468" : "#565250" } }, label)
              ]),
              el("span", { s: { fontFamily: "monospace", fontSize: "11px", color: "#565250", flex: "1" } },
                bs.status === "building" ? (branchMode === "server" ? "Starting..." : "Building...") :
                bs.status === "running" ? "Running \u2014 port " + (bs.serverPort || "?") :
                bs.status === "ready" ? "Ready \u2014 " + previewUrl :
                bs.status === "error" ? (branchMode === "server" ? "Server failed" : "Build failed") : "Not started yet"
              ),
              el("button", { c: "bg bs", on: { click: function() {
                api("POST", "/api/build/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug));
                DV.loadRepos();
              } } }, branchMode === "server" ? "\u27f3 Restart" : "\u27f3 Build"),
              branchMode === "server" && bs.status === "running" ? el("button", { c: "bg bs", on: { click: function() {
                api("POST", "/api/stop/" + repo.owner + "/" + repo.repo + "?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, "\u25a0 Stop") : null,
              el("button", { c: "bp bs", s: { opacity: (bs.status === "ready" || bs.status === "running") ? "1" : ".4", pointerEvents: (bs.status === "ready" || bs.status === "running") ? "auto" : "none" }, on: { click: function() {
                S.activeRepo = repo; S.activeBranch = slug; S.compareMode = false; S.compareBranch = ""; S.view = "preview"; DV.render();
              } } }, "\u25b6 Preview"),
              el("button", { c: "bg bs", on: { click: function() {
                S.logModal = { owner: repo.owner, repo: repo.repo, slug: slug, key: repo.owner + "/" + repo.repo + ":" + slug }; DV.render();
              } } }, "\ud83d\udccb Log"),
              el("button", { c: "bg bs", s: { padding: "5px 10px", fontSize: "12px" }, on: { click: function() {
                S.editModal = { owner: repo.owner, repo: repo.repo, slug: slug, branch: bs.branch, baseDir: bs.baseDir || "", buildCommand: bs.buildCommand || "", outputDir: bs.outputDir || "", mode: bs.mode || "static", startCommand: bs.startCommand || "", envVars: bs.envVars || "" }; DV.render();
              } } }, "\u270e"),
              el("button", { c: "bd bs", s: { padding: "5px 10px", fontSize: "12px" }, on: { click: function() {
                api("DELETE", "/api/repos/" + repo.owner + "/" + repo.repo + "/branch?slug=" + encodeURIComponent(slug)).then(DV.loadRepos);
              } } }, "\u2715")
            ]);
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
