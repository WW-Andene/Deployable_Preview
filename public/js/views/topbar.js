(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.topbar = function(app) {
  var left = el("div", { s: { display: "flex", alignItems: "center", gap: "10px" } });
  if (S.view !== "setup" && S.view !== "dashboard" && S.view !== "loading") {
    left.appendChild(el("button", { c: "bg bs", on: { click: function() { S.view = "dashboard"; S.showBranchDropdown = false; DV.render(); } } }, "\u2190 Back"));
  }
  left.appendChild(el("span", { s: { fontWeight: "800", fontSize: "17px", letterSpacing: "-0.03em" } }, [
    el("span", { s: { color: "var(--accent)" } }, "Deploy"), document.createTextNode("View")
  ]));

  var right = el("div", { s: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } });
  if (S.view === "dashboard") {
    right.appendChild(el("button", { c: "bg bs", on: { click: function() { DV.loadRepos(); } } }, "\u21bb"));
    right.appendChild(el("button", { c: "bp", on: { click: function() {
      S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
      S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
      S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
      S.view = "addRepo"; DV.render();
    } } }, "+ Add Repo"));
  }
  if (S.view === "preview") {
    right.appendChild(el("button", { c: "bg bs", on: { click: function() { S.compareMode = !S.compareMode; S.compareBranch = ""; DV.render(); } } }, S.compareMode ? "Single" : "Compare"));
    right.appendChild(el("button", { c: "bg bs", on: { click: function() { S.refreshKey++; DV.render(); } } }, "\u21bb Refresh"));
    right.appendChild(el("button", { c: "bp bs", on: { click: function() {
      window.open("/test/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/" + S.activeBranch, "_blank");
    } } }, "\u26a1 Run Test"));
  }
  if (S.view !== "setup" && S.view !== "loading") {
    right.appendChild(el("button", { c: "bg bs", on: { click: function() {
      api("POST", "/api/token", { token: "" }).then(function() { S.hasToken = false; S.view = "setup"; DV.render(); });
    } } }, "Logout"));
  }
  app.appendChild(el("div", { c: "topbar" }, [left, right]));
};
})();
