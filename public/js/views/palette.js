// DeployView — Command Palette (Cmd/Ctrl+K or "/")
// Fuzzy-searchable launcher for every repo, branch, and common action.
(function(){
var S = DV.S, el = DV.el, api = DV.api;

// ── MRU (most recently used) ──────────────────────────────────────────
// Persisted in localStorage. Stores {id: ts} of the last ~30 commands
// invoked from the palette; used to boost matching scores.
var MRU_KEY = "dv.palette.mru";
var MRU_MAX = 30;
function mruLoad() {
  try { return JSON.parse(localStorage.getItem(MRU_KEY) || "{}") || {}; }
  catch (_) { return {}; }
}
function mruTouch(id) {
  try {
    var m = mruLoad();
    m[id] = Date.now();
    // Trim oldest entries if over cap
    var entries = Object.entries(m);
    if (entries.length >= MRU_MAX) {
      // Sort by recency (newest first) and keep up to MRU_MAX entries.
      entries.sort(function(a,b){ return b[1]-a[1]; });
      m = {};
      for (var i = 0; i < MRU_MAX && i < entries.length; i++) m[entries[i][0]] = entries[i][1];
    }
    localStorage.setItem(MRU_KEY, JSON.stringify(m));
  } catch (_) {}
}
function mruBoost(id) {
  var m = mruLoad();
  var ts = m[id];
  if (!ts) return 0;
  var ageMin = (Date.now() - ts) / 60000;
  // Recent < 5 min: +4. < 1 h: +2. Older within 24 h: +1.
  if (ageMin < 5) return 4;
  if (ageMin < 60) return 2;
  if (ageMin < 1440) return 1;
  return 0;
}

// ── Fuzzy scoring ──────────────────────────────────────────────────────
// Cheap subsequence match + bonus for consecutive hits + prefix bonus.
function score(query, text) {
  if (!query) return 1; // no filter
  var q = query.toLowerCase(), t = text.toLowerCase();
  var qi = 0, ti = 0, s = 0, streak = 0, prev = -2;
  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      s += 1;
      if (ti === prev + 1) { streak++; s += streak; }
      else { streak = 0; }
      if (ti === 0) s += 3;                // prefix bonus
      prev = ti; qi++;
    }
    ti++;
  }
  if (qi < q.length) return 0; // incomplete match
  // Shorter matches rank higher
  return s + Math.max(0, 20 - t.length) * 0.1;
}

// ── Command provider ───────────────────────────────────────────────────
// Returns a flat list of { id, label, hint, run } where `run` does the action.
function buildCommands() {
  var cmds = [];

  // Navigation
  cmds.push({ id: "nav.dashboard", label: "Go to Dashboard",   hint: "navigation", section: "Nav",
              run: function() { S.view = "dashboard"; DV.render(); } });
  cmds.push({ id: "nav.settings",  label: "Go to Settings",    hint: "navigation · ,", section: "Nav",
              run: function() { S.view = "settings"; DV.render(); } });
  cmds.push({ id: "nav.mcp",       label: "Open MCP Tools",    hint: "navigation", section: "Nav",
              run: function() { S.mcpAction = null; S.mcpResult = null; DV.loadMcpTools(); S.view = "mcp"; DV.render(); } });
  cmds.push({ id: "nav.addRepo",   label: "Add Repository",    hint: "navigation · n", section: "Nav",
              run: function() {
                S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
                S.repoInfo = null; S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
                S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
                S.view = "addRepo"; DV.render();
              } });

  // Global actions
  cmds.push({ id: "action.refresh", label: "Refresh repo list", hint: "action · r", section: "Actions",
              run: function() { DV.loadRepos(); } });
  cmds.push({ id: "action.rebuildAll", label: "Rebuild ALL branches", hint: "action · destructive", section: "Actions",
              run: function() {
                if (!confirm("Rebuild every branch across every repo?")) return;
                for (var i = 0; i < S.repos.length; i++) {
                  var r = S.repos[i], slugs = Object.keys(r.branchStatuses || {});
                  for (var j = 0; j < slugs.length; j++) {
                    api("POST", "/api/build/" + r.owner + "/" + r.repo + "?slug=" + encodeURIComponent(slugs[j]));
                  }
                }
                DV.showToast("Rebuilding all…", "info");
              } });
  cmds.push({ id: "action.shortcuts", label: "Show keyboard shortcuts", hint: "help · ?", section: "Actions",
              run: function() { S.shortcutsOpen = true; DV.render(); } });

  // Per-repo / per-branch commands
  for (var i = 0; i < (S.repos || []).length; i++) {
    var r = S.repos[i];
    var slugs = Object.keys(r.branchStatuses || {});
    if (!slugs.length) {
      cmds.push({
        id: "repo." + r.owner + "/" + r.repo,
        label: "Open " + r.owner + "/" + r.repo,
        hint: "repo · no branches",
        section: "Repos",
        run: (function(rr){ return function(){ S.activeRepo = rr; S.activeBranch = ""; S.view = "dashboard"; DV.render(); }; })(r)
      });
    }
    for (var j = 0; j < slugs.length; j++) {
      (function(rr, slug) {
        var bs = rr.branchStatuses[slug] || {};
        var label = rr.owner + "/" + rr.repo + " · " + (bs.branch || slug);
        var hint = "branch · " + (bs.status || "idle");
        cmds.push({
          id: "preview." + rr.owner + "/" + rr.repo + "/" + slug,
          label: "Open preview — " + label,
          hint: hint,
          section: "Previews",
          run: function() {
            S.activeRepo = rr; S.activeBranch = slug;
            S.view = "preview"; DV.render();
          }
        });
        cmds.push({
          id: "rebuild." + rr.owner + "/" + rr.repo + "/" + slug,
          label: "Rebuild — " + label,
          hint: "action",
          section: "Previews",
          run: function() {
            api("POST", "/api/build/" + rr.owner + "/" + rr.repo + "?slug=" + encodeURIComponent(slug));
            DV.showToast("Rebuild queued: " + label, "info");
            DV.loadRepos();
          }
        });
        cmds.push({
          id: "logs." + rr.owner + "/" + rr.repo + "/" + slug,
          label: "View logs — " + label,
          hint: "logs",
          section: "Previews",
          run: function() {
            S.logModal = { owner: rr.owner, repo: rr.repo, slug: slug, key: rr.owner + "/" + rr.repo + ":" + slug };
            DV.render();
          }
        });
        if (bs.status === "running" || bs.status === "ready") {
          cmds.push({
            id: "stop." + rr.owner + "/" + rr.repo + "/" + slug,
            label: "Stop server — " + label,
            hint: "destructive",
            section: "Previews",
            run: function() {
              api("POST", "/api/stop/" + rr.owner + "/" + rr.repo + "?slug=" + encodeURIComponent(slug));
              DV.showToast("Stopping " + label + "…", "info");
              DV.loadRepos();
            }
          });
        }
      })(r, slugs[j]);
    }
  }
  return cmds;
}

// ── Palette view ───────────────────────────────────────────────────────
DV.openPalette = function() {
  S.paletteOpen = true; S.paletteQuery = ""; S.paletteIndex = 0;
  DV.render();
};
DV.closePalette = function() {
  S.paletteOpen = false; S.paletteQuery = ""; S.paletteIndex = 0;
  DV.render();
};

DV.renderPalette = function(root) {
  if (!S.paletteOpen) return;

  var all = buildCommands();
  var q = S.paletteQuery || "";
  var ranked = all
    .map(function(c){
      var base = score(q, c.label) + (q ? score(q, c.hint || "") * 0.3 : 0);
      // MRU boost matters most when the query is empty (fresh palette open)
      var boost = mruBoost(c.id);
      var s = base + (q ? boost * 0.5 : boost);
      return { c: c, s: s };
    })
    .filter(function(x){ return x.s > 0 || !q; }) // show MRU even without a query
    .sort(function(a, b){ return b.s - a.s; })
    .slice(0, 40);

  if (S.paletteIndex >= ranked.length) S.paletteIndex = 0;
  if (S.paletteIndex < 0) S.paletteIndex = ranked.length - 1;

  var bg = el("div", { c: "modal-bg palette-bg", on: { click: function(e){ if (e.target === bg) DV.closePalette(); } } });
  var modal = el("div", { c: "modal palette-modal" });

  var input = document.createElement("input");
  input.className = "palette-input";
  input.placeholder = "Search repos, branches, actions…";
  input.value = S.paletteQuery;
  input.autocomplete = "off"; input.spellcheck = false;

  input.addEventListener("input", function() {
    S.paletteQuery = input.value;
    S.paletteIndex = 0;
    DV.render();
    // refocus after re-render
    var n = document.querySelector(".palette-input");
    if (n) { n.focus(); n.setSelectionRange(input.value.length, input.value.length); }
  });
  input.addEventListener("keydown", function(e) {
    if (e.key === "Escape") { e.preventDefault(); DV.closePalette(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); S.paletteIndex = Math.min(ranked.length - 1, S.paletteIndex + 1); DV.render(); var n = document.querySelector(".palette-input"); if (n) n.focus(); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); S.paletteIndex = Math.max(0, S.paletteIndex - 1);                  DV.render(); var n2 = document.querySelector(".palette-input"); if (n2) n2.focus(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      var hit = ranked[S.paletteIndex];
      if (hit) { mruTouch(hit.c.id); DV.closePalette(); try { hit.c.run(); } catch (err) { console.error(err); } }
    }
  });
  modal.appendChild(input);

  var list = el("div", { c: "palette-list" });
  if (!ranked.length) {
    list.appendChild(el("div", { c: "palette-empty" }, q ? "No commands match “" + q + "”" : "No commands available"));
  } else {
    var lastSection = null;
    for (var i = 0; i < ranked.length; i++) {
      (function(hit, idx) {
        if (hit.c.section && hit.c.section !== lastSection) {
          list.appendChild(el("div", { c: "palette-section" }, hit.c.section));
          lastSection = hit.c.section;
        }
        var row = el("div", {
          c: "palette-row" + (idx === S.paletteIndex ? " palette-row-active" : ""),
          on: {
            click: function() { mruTouch(hit.c.id); DV.closePalette(); try { hit.c.run(); } catch (e) { console.error(e); } },
            mouseenter: function() { S.paletteIndex = idx; DV.render(); var n = document.querySelector(".palette-input"); if (n) n.focus(); }
          }
        }, [
          el("div", { c: "palette-row-label" }, hit.c.label),
          el("div", { c: "palette-row-hint"  }, hit.c.hint || "")
        ]);
        list.appendChild(row);
      })(ranked[i], i);
    }
  }
  modal.appendChild(list);

  var footer = el("div", { c: "palette-footer" }, "↑↓ navigate · ⏎ open · Esc close · " + ranked.length + " result" + (ranked.length === 1 ? "" : "s"));
  modal.appendChild(footer);

  bg.appendChild(modal);
  root.appendChild(bg);

  // Focus the input after mounting
  setTimeout(function() { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 10);
};

// ── Shortcuts overlay ──────────────────────────────────────────────────
var SHORTCUTS = [
  ["Cmd/Ctrl+K  or  /",  "Open command palette"],
  ["?",                   "Show this shortcuts list"],
  ["Esc",                 "Back to dashboard · close modals"],
  [",",                   "Open Settings"],
  ["n",                   "Add a new repository"],
  ["r",                   "Refresh (dashboard) · reload iframes (preview)"],
  ["c",                   "Toggle Compare mode (preview)"],
  ["t",                   "Open test harness (preview)"],
  ["a",                   "Select all branches (dashboard)"],
  ["b",                   "Rebuild selected (dashboard)"]
];

DV.renderShortcuts = function(root) {
  if (!S.shortcutsOpen) return;
  var bg = el("div", { c: "modal-bg", on: { click: function(e){ if (e.target === bg) { S.shortcutsOpen = false; DV.render(); } } } });
  var modal = el("div", { c: "modal" });
  modal.appendChild(el("h3", { c: "modal-title" }, "Keyboard Shortcuts"));
  var table = el("div", { c: "shortcuts-grid" });
  for (var i = 0; i < SHORTCUTS.length; i++) {
    table.appendChild(el("kbd", { c: "shortcut-key" }, SHORTCUTS[i][0]));
    table.appendChild(el("div", { c: "shortcut-desc" }, SHORTCUTS[i][1]));
  }
  modal.appendChild(table);
  modal.appendChild(el("div", { c: "flex-row gap-8 mt-16" }, [
    el("button", { c: "bg bs", on: { click: function(){ S.shortcutsOpen = false; DV.render(); } } }, "Close")
  ]));
  bg.appendChild(modal);
  root.appendChild(bg);
};
})();
