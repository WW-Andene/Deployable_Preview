// DeployView — App Core
// Shared state, utilities, API helper, and render orchestrator
(function(){
"use strict";

// View presets
var VIEW_PRESETS = {
  "13t":    { w: 412,  h: 915,  label: "Xiaomi 13T",      res: "412 \u00d7 915", scale: 0.9 },
  "ip15":   { w: 393,  h: 852,  label: "iPhone 15",       res: "393 \u00d7 852", scale: 0.9 },
  "s24":    { w: 360,  h: 780,  label: "Galaxy S24",      res: "360 \u00d7 780", scale: 0.9 },
  "ipad":   { w: 820,  h: 1180, label: "iPad Air",        res: "820 \u00d7 1180", scale: 0.5 },
  "9:16":   { w: 393,  h: 873,  label: "9:16 Portrait",   res: "393 \u00d7 873" },
  "16:9":   { w: 1920, h: 1080, label: "16:9 Landscape",  res: "1920 \u00d7 1080" }
};

// Global state
var S = {
  view: "loading",
  repos: [],
  hasToken: false,
  repoUrl: "", repoError: "", repoLoading: false,
  fetchedBranches: [], selectedBranches: [], repoInfo: null,
  buildCommand: "npm run build", outputDir: "dist", baseDir: "", mode: "static", startCommand: "npm start", envVars: "",
  activeRepo: null, activeBranch: "", compareBranch: "", compareMode: false,
  activeViews: ["13t"],
  refreshKey: 0,
  pollTimer: null,
  showBranchDropdown: false,
  availableBranches: [],
  branchFilter: "",
  addBranchBaseDir: "",
  editModal: null,
  logModal: null,
  apkModal: null,
  mcpTools: [],
  mcpAction: null,
  mcpResult: null
};

var _dropdownCloseHandler = null;

// DOM helper
function el(tag, props, kids) {
  var e = document.createElement(tag);
  if (props) {
    if (props.s) Object.assign(e.style, props.s);
    if (props.c) e.className = props.c;
    if (props.on) for (var ev in props.on) e.addEventListener(ev, props.on[ev]);
    if (props.attr) for (var a in props.attr) e.setAttribute(a, props.attr[a]);
  }
  if (kids != null) {
    if (!Array.isArray(kids)) kids = [kids];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] == null) continue;
      e.appendChild(typeof kids[i] === "string" || typeof kids[i] === "number" ? document.createTextNode("" + kids[i]) : kids[i]);
    }
  }
  return e;
}

// API helper
function api(method, path, body) {
  var opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(path, opts).then(function(r) { return r.json(); });
}

function statusClass(s) { return "status-dot status-" + (s || "idle"); }

// Data loading
function loadRepos() {
  api("GET", "/api/repos").then(function(repos) {
    S.repos = repos;
    if (S.activeRepo) {
      var updated = S.repos.find(function(r) { return r.id === S.activeRepo.id; });
      if (updated) S.activeRepo = updated;
    }
    render();
  });
}

function startStatusPoll() {
  if (S.pollTimer) clearInterval(S.pollTimer);
  S.pollTimer = setInterval(function() {
    api("GET", "/api/repos").then(function(repos) {
      var changed = false;
      for (var i = 0; i < repos.length; i++) {
        var old = S.repos.find(function(r) { return r.id === repos[i].id; });
        if (old) {
          var bs = repos[i].branchStatuses;
          for (var b in bs) {
            var oldS = old.branchStatuses && old.branchStatuses[b];
            if (oldS && oldS.status === "building" && bs[b].status !== "building") changed = true;
          }
        }
      }
      S.repos = repos;
      if (S.activeRepo) {
        var updated = S.repos.find(function(r) { return r.id === S.activeRepo.id; });
        if (updated) S.activeRepo = updated;
      }
      if (changed) { S.refreshKey++; render(); }
    });
  }, 5000);
}

function fetchAvailableBranches() {
  if (!S.activeRepo) return;
  S.availableBranches = [];
  render();
  api("GET", "/api/github/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/branches").then(function(r) {
    if (r.branches) { S.availableBranches = r.branches; render(); }
  }).catch(function() {});
}

function addBranchToRepo(branch, baseDir, mode, startCommand) {
  if (!S.activeRepo) return;
  var body = { branch: branch, baseDir: baseDir || "", mode: mode || "static", startCommand: startCommand || "" };
  fetch("/api/repos/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) { return res.json(); }).then(function(r) {
    if (r.error) { alert("Error: " + r.error); return; }
    if (r.ok) {
      S.activeRepo.activeBranches = r.activeBranches;
      S.showBranchDropdown = false;
      S.branchFilter = "";
      S.addBranchBaseDir = "";
      S.addBranchMode = "static";
      S.addBranchStartCmd = "";
      loadRepos();
    }
  }).catch(function(e) { alert("Failed to add branch: " + e.message); });
}

// View registry — populated by view files
var views = {};

// Main render
function render() {
  if (_dropdownCloseHandler) {
    document.removeEventListener("click", _dropdownCloseHandler, true);
    _dropdownCloseHandler = null;
  }
  var app = document.getElementById("app"); app.innerHTML = "";

  // Topbar
  if (views.topbar) views.topbar(app);

  if (S.view === "loading") {
    app.appendChild(el("div", { s: { textAlign: "center", padding: "120px 20px" } }, [
      el("div", { s: { width: "28px", height: "28px", margin: "0 auto 16px", border: "2px solid var(--sf3)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.6s linear infinite" } }),
      el("div", { s: { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--tx3)", letterSpacing: "0.05em" } }, "INITIALIZING...")
    ]));
    return;
  }

  if (S.view === "setup" && views.setup) { views.setup(app); return; }

  startStatusPoll();

  if (S.view === "dashboard" && views.dashboard) { views.dashboard(app); if (views.modals) views.modals(app); return; }
  if (S.view === "addRepo" && views.addRepo) { views.addRepo(app); return; }
  if (S.view === "mcp" && views.mcp) { views.mcp(app); return; }
  if (S.view === "preview" && views.preview) { views.preview(app); if (views.modals) views.modals(app); }
}

// Init
api("GET", "/api/token").then(function(r) {
  S.hasToken = r.hasToken;
  S.view = r.hasToken ? "dashboard" : "setup";
  if (r.hasToken) loadRepos();
  else render();
});

function loadMcpTools() {
  api("GET", "/api/mcp/tools").then(function(r) {
    if (r.tools) { S.mcpTools = r.tools; render(); }
  }).catch(function() {});
}

// Expose globals for view modules
window.DV = {
  S: S, el: el, api: api, statusClass: statusClass, render: render,
  loadRepos: loadRepos, startStatusPoll: startStatusPoll,
  fetchAvailableBranches: fetchAvailableBranches, addBranchToRepo: addBranchToRepo,
  loadMcpTools: loadMcpTools,
  views: views, VIEW_PRESETS: VIEW_PRESETS,
  getDropdownHandler: function() { return _dropdownCloseHandler; },
  setDropdownHandler: function(h) { _dropdownCloseHandler = h; }
};

})();
