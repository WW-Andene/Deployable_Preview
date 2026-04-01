(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass;

DV.views.dashboard = function(app) {
  var ct = el("div", { s: { maxWidth: "960px", margin: "0 auto", padding: "20px 16px" } });
  if (!S.repos.length) {
    ct.appendChild(el("div", { s: { textAlign: "center", padding: "80px 20px" } }, [
      el("div", { s: { fontSize: "48px", marginBottom: "20px", filter: "drop-shadow(0 0 20px var(--accent-glow))" } }, "\u26a1"),
      el("h2", { s: { fontSize: "22px", fontWeight: "700", marginBottom: "8px", letterSpacing: "-0.03em" } }, "Your workspace is ready"),
      el("p", { s: { color: "var(--tx2)", fontFamily: "var(--font-mono)", fontSize: "13px", maxWidth: "420px", margin: "0 auto 28px", lineHeight: "1.7" } }, "Connect a repo, choose your branches, and DeployView handles the rest \u2014 clone, build, serve, auto-rebuild on push."),
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
            repo.description ? el("p", { s: { color: "var(--tx3)", fontSize: "12px", fontFamily: "monospace", marginTop: "4px" } }, repo.description) : null,
            el("p", { s: { color: "var(--tx3)", fontSize: "11px", fontFamily: "monospace", marginTop: "4px" } }, "Build: " + (repo.buildCommand || "npm run build") + " \u2192 " + (repo.outputDir || "dist"))
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
            var borderL = bs.status === "ready" ? "var(--ok)" : bs.status === "running" ? "var(--run)" : bs.status === "building" ? "var(--accent)" : bs.status === "error" ? "var(--err)" : "transparent";
            var row = el("div", { s: { background: "var(--bg)", borderRadius: "var(--r-input)", padding: "calc(var(--sp) * 1.5) calc(var(--sp) * 2)", borderLeft: "3px solid " + borderL, borderTop: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "calc(var(--sp) * 1.5)", flexWrap: "wrap", marginBottom: "calc(var(--sp))", transition: "border-color 180ms ease-out, background 180ms ease-out" } });
            // Building indicator — branded sweep bar
            if (bs.status === "building") {
              var loadBar = el("div", { c: "dv-loading", s: { position: "absolute", bottom: "0", left: "0", right: "0" } });
              row.style.position = "relative";
              row.style.overflow = "hidden";
              row.appendChild(loadBar);
            }
            var rowKids = [
              el("div", { s: { minWidth: "100px", display: "flex", alignItems: "center", gap: "8px" } }, [
                el("span", { c: statusClass(bs.status) }),
                el("span", { c: "btag", s: { background: bs.status === "ready" ? "var(--ok-dim)" : bs.status === "running" ? "var(--run-dim)" : bs.status === "building" ? "var(--accent-dim)" : bs.status === "error" ? "var(--err-dim)" : "var(--border)", color: bs.status === "ready" ? "var(--ok)" : bs.status === "running" ? "var(--run)" : bs.status === "building" ? "var(--accent)" : bs.status === "error" ? "var(--err)" : "var(--tx3)" } }, label)
              ]),
              el("span", { s: { fontFamily: "monospace", fontSize: "11px", color: "var(--tx3)", flex: "1" } },
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
            ];
            for (var ki = 0; ki < rowKids.length; ki++) { if (rowKids[ki]) row.appendChild(rowKids[ki]); }
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
