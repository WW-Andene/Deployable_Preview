(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Global keyboard shortcuts ── */
if (!DV._kbBound) {
  DV._kbBound = true;
  document.addEventListener("keydown", function(e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case "Escape":
        if (S.editModal || S.logModal || S.apkModal) return;
        if (S.view !== "dashboard" && S.view !== "setup" && S.view !== "loading") {
          S.view = "dashboard"; S.showBranchDropdown = false; DV.render(); e.preventDefault();
        }
        break;
      case "r": case "R":
        if (S.view === "dashboard") { DV.loadRepos(); e.preventDefault(); }
        if (S.view === "preview") { S.refreshKey++; DV.render(); e.preventDefault(); }
        break;
      case "n": case "N":
        if (S.view === "dashboard") {
          S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
          S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
          S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
          S.view = "addRepo"; DV.render(); e.preventDefault();
        }
        break;
      case "c": case "C":
        if (S.view === "preview") { S.compareMode = !S.compareMode; S.compareBranch = ""; DV.render(); e.preventDefault(); }
        break;
      case "t": case "T":
        if (S.view === "preview" && S.activeRepo) {
          window.open("/test/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/" + S.activeBranch, "_blank");
          e.preventDefault();
        }
        break;
      case ",":
        if (S.view !== "setup" && S.view !== "loading") { S.view = "settings"; DV.render(); e.preventDefault(); }
        break;
    }
  });
}

DV.views.topbar = function(app) {
  var bar = el("div", { c: "topbar" });

  /* ── Left: logo + back ── */
  var left = el("div", { c: "topbar-left" });
  if (S.view !== "setup" && S.view !== "dashboard" && S.view !== "loading") {
    left.appendChild(el("button", { c: "bg bs", on: { click: function() { S.view = "dashboard"; S.showBranchDropdown = false; DV.render(); } } }, "\u2190"));
  }
  left.appendChild(el("span", { c: "dv-badge", on: { click: function() { if (S.hasToken) { S.view = "dashboard"; DV.render(); } } } }, "DeployView"));

  // Tunnel indicator
  if (S._tunnelStatus && S._tunnelStatus.url) {
    left.appendChild(el("span", { c: "topbar-pill topbar-pill-ok", attr: { title: S._tunnelStatus.url } }, "HTTPS"));
  }
  bar.appendChild(left);

  /* ── Right: contextual actions + nav icons ── */
  var right = el("div", { c: "topbar-right" });

  if (S.view === "dashboard" && S.repos.length > 0) {
    right.appendChild(el("button", { c: "bp bs", on: { click: function() {
      S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
      S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
      S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
      S.view = "addRepo"; DV.render();
    } } }, "+ Add Repo"));
  }

  if (S.view === "preview") {
    right.appendChild(el("button", { c: "bg bs", on: { click: function() { S.compareMode = !S.compareMode; S.compareBranch = ""; DV.render(); } } }, S.compareMode ? "Single" : "Compare"));
    right.appendChild(el("button", { c: "bg bs", on: { click: function() { S.refreshKey++; DV.render(); } } }, "Refresh"));
    right.appendChild(el("button", { c: "bg bs", on: { click: function() {
      window.open("/test/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/" + S.activeBranch, "_blank");
    } } }, "Test"));
  }

  /* ── Nav icons (always visible when logged in) ── */
  if (S.view !== "setup" && S.view !== "loading") {
    right.appendChild(el("button", { c: "topbar-icon" + (S.view === "mcp" ? " topbar-icon-active" : ""), attr: { title: "MCP Tools" }, on: { click: function() {
      S.mcpAction = null; S.mcpResult = null; DV.loadMcpTools(); S.view = "mcp"; DV.render();
    } } }, "\uD83D\uDD0C"));

    right.appendChild(el("button", { c: "topbar-icon" + (S.view === "settings" ? " topbar-icon-active" : ""), attr: { title: "Settings (,)" }, on: { click: function() {
      S.view = "settings"; DV.render();
    } } }, "\u2699"));
  }

  bar.appendChild(right);
  app.appendChild(bar);

  // Fetch tunnel status once
  if (S.view !== "setup" && S.view !== "loading" && !S._tunnelChecked) {
    S._tunnelChecked = true;
    fetch("/api/tunnel/status").then(function(r) { return r.json(); }).then(function(t) {
      S._tunnelStatus = t;
    }).catch(function() {});
  }
};
})();
