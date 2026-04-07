(function(){
var S = DV.S, el = DV.el, api = DV.api;

/* ── Global keyboard shortcuts ── */
if (!DV._kbBound) {
  DV._kbBound = true;
  document.addEventListener("keydown", function(e) {
    // Don't trigger shortcuts when typing in inputs
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case "Escape":
        if (S.editModal || S.logModal || S.apkModal) return; // modals handle their own Esc
        if (S.view !== "dashboard" && S.view !== "setup" && S.view !== "loading") {
          S.view = "dashboard"; S.showBranchDropdown = false; DV.render();
          e.preventDefault();
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
      case "?":
        DV.showToast("Shortcuts: R=Reload, N=New Repo, C=Compare, T=Test, Esc=Back", "info");
        e.preventDefault();
        break;
    }
  });
}

DV.views.topbar = function(app) {
  var viewLabels = { preview: "Preview", addRepo: "Add Repo", mcp: "MCP Tools" };
  var left = el("div", { c: "topbar-left" });
  if (S.view !== "setup" && S.view !== "dashboard" && S.view !== "loading") {
    left.appendChild(el("button", { c: "bg bs", attr: { title: "Back (Esc)" }, on: { click: function() { S.view = "dashboard"; S.showBranchDropdown = false; DV.render(); } } }, "< Back"));
    if (viewLabels[S.view]) left.appendChild(el("span", { c: "breadcrumb" }, viewLabels[S.view]));
  }
  left.appendChild(el("span", { c: "dv-badge" }, "DeployView"));

  // Tunnel status indicator (fetched once)
  if (S.view !== "setup" && S.view !== "loading" && !S._tunnelChecked) {
    S._tunnelChecked = true;
    fetch("/api/tunnel/status").then(function(r) { return r.json(); }).then(function(t) {
      S._tunnelStatus = t;
    }).catch(function() {});
  }
  if (S._tunnelStatus && S._tunnelStatus.url) {
    left.appendChild(el("span", { c: "chip on", attr: { title: S._tunnelStatus.url } }, "HTTPS \u2714"));
  }

  var right = el("div", { c: "topbar-right" });
  if (S.view === "dashboard") {
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Rebuild all branches" }, on: { click: function() {
      if (!confirm("Rebuild all branches?")) return;
      for (var ri = 0; ri < S.repos.length; ri++) {
        var r = S.repos[ri];
        var slugs = Object.keys(r.branchStatuses || {});
        for (var si = 0; si < slugs.length; si++) {
          api("POST", "/api/build/" + r.owner + "/" + r.repo + "?slug=" + encodeURIComponent(slugs[si]));
        }
      }
      DV.showToast("Rebuilding all branches...", "info");
      setTimeout(DV.loadRepos, 1000);
    } } }, "Rebuild All"));
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Reload repos (R)" }, on: { click: function() { DV.loadRepos(); } } }, "Reload"));
    right.appendChild(el("button", { c: "bg bs btn-accent-highlight", attr: { title: "MCP Tools" }, on: { click: function() {
      S.mcpAction = null; S.mcpResult = null;
      DV.loadMcpTools();
      S.view = "mcp"; DV.render();
    } } }, "🔌 MCP"));
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Start HTTPS tunnel for Claude web" }, on: { click: function() {
      var btn = this;
      btn.disabled = true; btn.textContent = "Starting...";
      fetch("/api/tunnel/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then(function(r) { return r.json(); })
        .then(function(r) {
          if (r.ok && r.url) {
            S._tunnelStatus = { url: r.url, provider: r.provider };
            DV.showToast("Tunnel active: " + r.url, "success");
            if (navigator.clipboard) navigator.clipboard.writeText(r.url + "/mcp").catch(function(){});
          } else {
            DV.showToast("Tunnel failed: " + (r.error || "unknown error"), "error");
          }
          DV.render();
        })
        .catch(function(e) { DV.showToast("Tunnel error: " + e.message, "error"); DV.render(); });
    } } }, "Tunnel"));
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
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Keyboard shortcuts (?)" }, on: { click: function() {
      DV.showToast("Shortcuts: R=Reload, N=New Repo, C=Compare, T=Test, Esc=Back", "info");
    } } }, "?"));
    right.appendChild(el("button", { c: "bg bs", attr: { title: "Logout" }, on: { click: function() {
      api("POST", "/api/token", { token: "" }).then(function() { S.hasToken = false; S.view = "setup"; DV.render(); });
    } } }, "Logout"));
  }
  app.appendChild(el("div", { c: "topbar" }, [left, right]));
};
})();
