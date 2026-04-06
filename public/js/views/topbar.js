(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.topbar = function(app) {
  var viewLabels = { preview: "Preview", addRepo: "Add Repo", mcp: "MCP Tools" };
  var left = el("div", { c: "topbar-left" });
  if (S.view !== "setup" && S.view !== "dashboard" && S.view !== "loading") {
    left.appendChild(el("button", { c: "bg bs", attr: { title: "Back (Esc)" }, on: { click: function() { S.view = "dashboard"; S.showBranchDropdown = false; DV.render(); } } }, "< Back"));
    if (viewLabels[S.view]) left.appendChild(el("span", { c: "breadcrumb" }, viewLabels[S.view]));
  }
  left.appendChild(el("span", { c: "dv-badge" }, "DeployView"));

  var right = el("div", { c: "topbar-right" });
  if (S.view === "dashboard") {
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Reload repos (R)" }, on: { click: function() { DV.loadRepos(); } } }, "Reload"));
    right.appendChild(el("button", { c: "bg bs btn-accent-highlight", attr: { title: "MCP Tools" }, on: { click: function() {
      S.mcpAction = null; S.mcpResult = null;
      DV.loadMcpTools();
      S.view = "mcp"; DV.render();
    } } }, "🔌 MCP"));
    right.appendChild(el("button", { c: "bp", attr: { title: "Add repository (N)" }, on: { click: function() {
      S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
      S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
      S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
      S.view = "addRepo"; DV.render();
    } } }, "+ Add Repo"));
  }
  if (S.view === "preview") {
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Toggle compare mode (C)" }, on: { click: function() { S.compareMode = !S.compareMode; S.compareBranch = ""; DV.render(); } } }, S.compareMode ? "Single" : "Compare"));
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Refresh preview (R)" }, on: { click: function() { S.refreshKey++; DV.render(); } } }, "Refresh"));
    right.appendChild(el("button", { c: "bp bs", attr: { title: "Run tests (T)" }, on: { click: function() {
      window.open("/test/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/" + S.activeBranch, "_blank");
    } } }, "Run Test"));
  }
  if (S.view !== "setup" && S.view !== "loading") {
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Logout" }, on: { click: function() {
      api("POST", "/api/token", { token: "" }).then(function() { S.hasToken = false; S.view = "setup"; DV.render(); });
    } } }, "Logout"));
  }
  app.appendChild(el("div", { c: "topbar" }, [left, right]));
};
})();
