// DeployView — App Core
// Shared state, utilities, API helper, and render orchestrator
(function(){
"use strict";

// View presets
var VIEW_PRESETS = {
  "13t":    { w: 439,  h: 976,  label: "Xiaomi 13T",      res: "439 \u00d7 976 @2.78x", scale: 0.9 },
  "user":   { w: 443,  h: 986,  label: "User (DPR 2.75)", res: "443 \u00d7 986 @2.75x", scale: 0.9 },
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
  buildCommand: "", outputDir: "", baseDir: "", mode: "static", startCommand: "", envVars: "", language: "auto",
  activeRepo: null, activeBranch: "", compareBranch: "", compareMode: false,
  activeViews: ["13t"],
  refreshKey: 0,
  showBranchDropdown: false,
  availableBranches: [],
  branchFilter: "",
  addBranchBaseDir: "",
  addBranchMode: "static",
  addBranchStartCmd: "",
  editModal: null,
  logModal: null,
  apkModal: null,
  mcpTools: [],
  mcpAction: null,
  mcpResult: null,
  dashboardFilter: "",
  preferences: {},
  selectedRows: {},   // key: "owner/repo:slug" → true
  paletteOpen: false,
  paletteQuery: "",
  paletteIndex: 0,
  shortcutsOpen: false,

  // GitHub repo picker (addRepo view)
  ghRepos: null,             // null = not fetched, [] = empty, [{...}] = loaded
  ghReposError: "",
  ghReposLoading: false,
  ghReposFilter: "",
  ghReposType: "all",        // all | owner | member

  // Share modal — { url, title } when open, null otherwise.
  shareModal: null,

  // Deployment history modal — { owner, repo, slug, loading, history[], error }
  historyModal: null,

  // Visual diff modal — { owner, repo, slug, thumbAt, diff } when open.
  diffModal: null,

  // Runtime-errors modal — { owner, repo, slug, loading, errors[] } when open.
  errorsModal: null,

  // Open action-overflow menu key (C2). The dashboard uses this to decide
  // which row's "•••" menu is currently open; clicking another row's menu
  // (or clicking outside) closes it. Format: "owner/repo:slug".
  openActionMenu: null,

  // Active Settings tab (D1). One of: keys / browser / tunnel / workspace
  // / webhooks / envgroups / domains / actions / about. Defaults to keys.
  settingsTab: "keys"
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
  // a11y fallback: interactive elements whose visible label is just an
  // icon or glyph (e.g. "x", "•••", an SVG) often have a title attribute
  // for tooltips but no aria-label. Promote title → aria-label so screen
  // readers announce something meaningful. Explicit aria-label wins.
  if (e.hasAttribute("title") && !e.hasAttribute("aria-label")) {
    var role = e.getAttribute("role");
    var interactive = tag === "button" || tag === "a" ||
      role === "button" || role === "menuitem" || role === "tab" ||
      role === "checkbox" || role === "switch";
    if (interactive) e.setAttribute("aria-label", e.getAttribute("title"));
  }
  return e;
}

// API helper. Always resolves with an object: either the parsed JSON
// response, or a synthetic { error } so existing `if (r.error)` /
// toast(r.error) call sites keep working when the server returns a
// non-JSON response (HTML proxy error page, empty body, etc.).
// Network-level failures still propagate as rejections.
// Default timeout for API calls. SSE / artifact / log endpoints aren't
// routed through here; this is for plain JSON round-trips. A 30s ceiling
// is generous enough for a slow GitHub round-trip but keeps a hung
// server from turning the dashboard into a permanent spinner.
var _API_TIMEOUT_MS = 30000;

function api(method, path, body) {
  var opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  // AbortController is widely supported (everything since 2019). Fall
  // back to a plain fetch if the runtime somehow doesn't have it.
  var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  if (ctrl) opts.signal = ctrl.signal;
  var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, _API_TIMEOUT_MS) : null;
  return fetch(path, opts)
    .then(function(r) {
      return r.text().then(function(text) {
        try { return text ? JSON.parse(text) : {}; }
        catch (_) {
          return { error: r.status >= 400 ? ("HTTP " + r.status) : "Unexpected response" };
        }
      });
    })
    .catch(function(e) {
      if (e && e.name === "AbortError") {
        return { error: "Request timed out after " + Math.round(_API_TIMEOUT_MS / 1000) + "s" };
      }
      throw e;
    })
    .finally(function() { if (timer) clearTimeout(timer); });
}

function statusClass(s) { return "status-dot status-" + (s || "idle"); }

// Data loading — uses ETag/If-None-Match so the server can 304 unchanged polls.
var _reposEtag = null;
var _reposLoadFailures = 0;
function loadRepos() {
  var headers = { "Content-Type": "application/json" };
  if (_reposEtag) headers["If-None-Match"] = _reposEtag;
  fetch("/api/repos", { method: "GET", headers: headers }).then(function(res) {
    if (res.status === 304) return null; // unchanged — keep current state
    if (!res.ok) throw new Error("HTTP " + res.status);
    _reposEtag = res.headers.get("ETag") || _reposEtag;
    return res.json();
  }).then(function(repos) {
    _reposLoadFailures = 0;
    if (!repos) return; // nothing changed
    S.repos = repos;
    if (S.activeRepo) {
      var updated = S.repos.find(function(r) { return r.id === S.activeRepo.id; });
      if (updated) S.activeRepo = updated;
    }
    render();
  }).catch(function(e) {
    // Quiet on transient blips; complain after 3 in a row so the user
    // knows the dashboard is stale instead of silently showing an
    // outdated repo list.
    _reposLoadFailures++;
    if (_reposLoadFailures === 3) {
      showToast("Could not refresh repos (" + ((e && e.message) || "network") + "). Reconnect and the next poll will recover.", "error");
    }
  });
}

function fetchAvailableBranches() {
  if (!S.activeRepo) return;
  S.availableBranches = [];
  render();
  api("GET", "/api/github/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/branches").then(function(r) {
    if (r && r.error) {
      // Without surfacing this, the +Branch dropdown sits on its
      // spinner forever and the user never finds out the GitHub
      // token expired or the repo is gone.
      showToast("Couldn't load branches: " + r.error, "error");
      return;
    }
    if (r && r.branches) { S.availableBranches = r.branches; render(); }
  }).catch(function(e) {
    showToast("Couldn't load branches: " + ((e && e.message) || "network"), "error");
  });
}

// Fetch the user's GitHub repositories. Cached server-side for 5 min;
// pass force=true to bust the cache.
function fetchGhRepos(force) {
  if (S.ghReposLoading) return;
  S.ghReposLoading = true; S.ghReposError = "";
  if (force) S.ghRepos = null;
  render();
  var url = "/api/github/repos?type=" + encodeURIComponent(S.ghReposType || "all") + (force ? "&refresh=1" : "");
  api("GET", url).then(function(r) {
    S.ghReposLoading = false;
    if (r.error) { S.ghReposError = r.error; S.ghRepos = []; render(); return; }
    S.ghRepos = Array.isArray(r.repos) ? r.repos : [];
    render();
  }).catch(function(e) {
    S.ghReposLoading = false;
    S.ghReposError = e.message || "Failed to load repositories";
    S.ghRepos = [];
    render();
  });
}

function addBranchToRepo(branch, baseDir, mode, startCommand, language) {
  if (!S.activeRepo) return;
  var body = { branch: branch, baseDir: baseDir || "", mode: mode || "static", startCommand: startCommand || "", language: language || "auto" };
  fetch("/api/repos/" + S.activeRepo.owner + "/" + S.activeRepo.repo + "/branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) { return res.json(); }).then(function(r) {
    if (r.error) { showToast(r.error, "error"); return; }
    if (r.ok) {
      S.activeRepo.activeBranches = r.activeBranches;
      S.showBranchDropdown = false;
      S.branchFilter = "";
      S.addBranchBaseDir = "";
      S.addBranchMode = "static";
      S.addBranchStartCmd = "";
      showToast("Branch " + branch + " added", "success");
      loadRepos();
    }
  }).catch(function(e) { showToast("Failed to add branch: " + (e && e.message ? e.message : "network error"), "error"); });
}

// View registry — populated by view files
var views = {};

// Close any open EventSource the previous view set up. Modals only clean up
// when explicitly closed; navigating away (Esc, back-arrow, palette) was
// leaving streams open against the server.
function closeStaleStreams() {
  // If the log modal is gone, drop its SSE.
  if (!S.logModal && S._logSSE) { try { S._logSSE.close(); } catch (_) {} S._logSSE = null; }
  // Same for APK modal.
  if (!S.apkModal && S._apkSSE) { try { S._apkSSE.close(); } catch (_) {} S._apkSSE = null; }
}

// Main render
function render() {
  if (_dropdownCloseHandler) {
    document.removeEventListener("click", _dropdownCloseHandler, true);
    _dropdownCloseHandler = null;
  }
  closeStaleStreams();
  // Preserve focus + selection on inputs across the full innerHTML wipe.
  // Any <input>/<textarea> with a stable id gets refocused after render.
  // Without this, every keystroke that triggers DV.render() (filters,
  // search bars) drops the cursor and the user has to click back in.
  var ae = document.activeElement;
  var preserved = null;
  if (ae && ae.id && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
    preserved = { id: ae.id, start: ae.selectionStart, end: ae.selectionEnd, value: ae.value };
  }
  var app = document.getElementById("app"); app.innerHTML = "";

  // Topbar
  if (views.topbar) views.topbar(app);

  if (S.view === "loading") {
    // role=status + aria-live=polite so screen readers announce
    // "Initializing" when the page first loads instead of staying
    // silent until a real view renders.
    app.appendChild(el("div", { c: "loading-view", attr: { role: "status", "aria-live": "polite" } }, [
      el("div", { c: "loading-spinner", attr: { "aria-hidden": "true" } }),
      el("div", { c: "loading-text" }, "INITIALIZING...")
    ]));
  } else if (S.view === "setup" && views.setup) {
    views.setup(app);
  } else if (S.view === "dashboard" && views.dashboard) {
    views.dashboard(app); if (views.modals) views.modals(app);
  } else if (S.view === "addRepo" && views.addRepo) {
    views.addRepo(app);
  } else if (S.view === "mcp" && views.mcp) {
    views.mcp(app);
  } else if (S.view === "settings" && views.settings) {
    views.settings(app);
  } else if (S.view === "analytics" && views.analytics) {
    views.analytics(app);
  } else if (S.view === "preview" && views.preview) {
    views.preview(app); if (views.modals) views.modals(app);
  }

  // Global overlays — rendered on top of every view when open
  if (DV.renderPalette) DV.renderPalette(app);
  if (DV.renderShortcuts) DV.renderShortcuts(app);

  // I7: Floating Action Button — mobile-only via CSS @media. Shortcut
  // to the command palette. Hidden on the loading + setup views since
  // there's nothing to do until auth's done.
  if (S.view !== "loading" && S.view !== "setup" && !S.paletteOpen) {
    var fab = el("button", {
      c: "dv-fab",
      attr: { title: "Open command palette", "aria-label": "Open command palette" },
      on: { click: function() { DV.openPalette(); } }
    }, [
      el("span", { c: "dv-fab-glyph" }, "⌘"),
      el("span", { c: "dv-fab-label" }, "Actions")
    ]);
    app.appendChild(fab);
  }

  if (preserved) {
    var fresh = document.getElementById(preserved.id);
    if (fresh && (fresh.tagName === "INPUT" || fresh.tagName === "TEXTAREA")) {
      try {
        fresh.focus();
        // Only restore selection if the new element has the same value;
        // a different value means a state-driven change should keep its
        // own caret behavior (e.g. type="password" reveal toggles).
        if (fresh.value === preserved.value && typeof fresh.setSelectionRange === "function") {
          fresh.setSelectionRange(preserved.start, preserved.end);
        }
      } catch (_) {}
    }
  }

  // Keep the browser tab title in sync with the current view. Useful when
  // the user has multiple DV tabs open + makes the back/forward history
  // entries scannable instead of all reading "DeployView".
  try {
    var title = "DeployView";
    if (S.view === "preview" && S.activeRepo) {
      title = "DeployView · " + S.activeRepo.owner + "/" + S.activeRepo.repo + (S.activeBranch ? " · " + S.activeBranch : "");
    } else if (S.view === "settings")  title = "DeployView · Settings";
    else if (S.view === "analytics")   title = "DeployView · Analytics";
    else if (S.view === "mcp")         title = "DeployView · MCP";
    else if (S.view === "addRepo")     title = "DeployView · Add Repo";
    else if (S.view === "setup")       title = "DeployView · Setup";
    else if (S.view === "dashboard")   title = "DeployView · " + (S.repos ? S.repos.length : 0) + " repo" + ((S.repos && S.repos.length === 1) ? "" : "s");
    if (document.title !== title) document.title = title;
  } catch (_) {}
}

// Init
api("GET", "/api/preferences").then(function(p) { S.preferences = p || {}; }).catch(function() {});
api("GET", "/api/token").then(function(r) {
  S.hasToken = r.hasToken;
  S.view = r.hasToken ? "dashboard" : "setup";
  if (r.hasToken) {
    loadRepos();
    installStatusStream();
    installErrorCountSync();
    // K2: pick up /deploy?repo=… template invites delivered as URL hash.
    var m = (location.hash || "").match(/^#deploy=(.+)$/);
    if (m) {
      try {
        var qp = new URLSearchParams(decodeURIComponent(m[1]));
        S.repoUrl = qp.get("repo") || "";
        S.view = "addRepo";
        location.hash = "";
      } catch (_) {}
    }
  }
  else render();
}).catch(function() {
  // Network failure on the first /api/token round-trip — without this
  // catch the SPA sits on the INITIALIZING spinner forever and the user
  // has no idea why nothing is happening. Surface a toast and render
  // the (still-empty) view so the toast is visible.
  showToast("Could not reach server — refresh to retry.", "error");
  S.view = "loading";
  render();
});

// J3: pull the per-branch runtime-error summary every 15s. Cheap call
// (just a Map.size + sum). Stops once the user logs out / leaves.
function installErrorCountSync() {
  if (S._errorSyncTimer) return;
  function tick() {
    if (!S.hasToken) { clearInterval(S._errorSyncTimer); S._errorSyncTimer = null; return; }
    var counts = {};
    var pending = 0, done = 0;
    for (var i = 0; i < (S.repos || []).length; i++) {
      var r = S.repos[i];
      var slugs = Object.keys(r.branchStatuses || {});
      for (var j = 0; j < slugs.length; j++) {
        (function(rr, slug) {
          pending++;
          api("GET", "/api/preview-errors/" + rr.owner + "/" + rr.repo + "/" + encodeURIComponent(slug)).then(function(res) {
            if (res && res.summary && res.summary.uniqueErrors) {
              counts[rr.owner + "/" + rr.repo + ":" + slug] = res.summary;
            }
          }).catch(function(){}).then(function() {
            done++;
            if (done >= pending) { S._previewErrorCounts = counts; render(); }
          });
        })(r, slugs[j]);
      }
    }
    if (pending === 0) { S._previewErrorCounts = counts; }
  }
  tick();
  S._errorSyncTimer = setInterval(tick, 15000);
}

// H1: open the SSE status stream once and keep it open. Every push
// patches S.repos[*].branchStatuses[slug] in-place and re-renders.
// Auto-reconnects with a 5s back-off if the connection drops.
function installStatusStream() {
  if (S._statusES) return;
  // Exponential backoff: start at 5s, double each consecutive failure
  // up to 60s. Reset to 5s on every successful connect (open event).
  // Without this, a long outage produces a 5s reconnect storm against
  // a server that's already broken or unreachable.
  var _backoff = 5000;
  function open() {
    var es = new EventSource("/api/status/stream");
    S._statusES = es;
    es.addEventListener("open", function() { _backoff = 5000; });
    es.addEventListener("message", function(ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.key || !msg.slot) return;
      var parts = msg.key.split(":");
      if (parts.length < 2) return;
      var ownerRepo = parts[0];           // owner/repo
      var slug = parts.slice(1).join(":"); // re-join in case slug had a colon
      var or = ownerRepo.split("/");
      var repo = (S.repos || []).find(function(r) { return r.owner === or[0] && r.repo === or[1]; });
      if (!repo) return;
      if (!repo.branchStatuses) repo.branchStatuses = {};
      // Merge — server already stripped heavy fields (thumb/log/diffThumb).
      repo.branchStatuses[slug] = Object.assign({}, repo.branchStatuses[slug] || {}, msg.slot);
      render();
    });
    es.addEventListener("error", function() {
      try { es.close(); } catch (_) {}
      S._statusES = null;
      var delay = Math.min(_backoff, 60000);
      _backoff = Math.min(_backoff * 2, 60000);
      setTimeout(open, delay);
    });
  }
  open();
}

function loadMcpTools() {
  api("GET", "/api/mcp/tools").then(function(r) {
    if (r.tools) { S.mcpTools = r.tools; render(); }
  }).catch(function() {});
}

// ── Toast notification system ──
// G1-007: errors get role=alert (announced immediately by screen readers);
// info/success get role=status (polite). Errors don't auto-dismiss; the
// user has to close them so a low-vision reader doesn't miss the message.
//
// We dedupe by (type, message) so the same error message firing every
// 15s from a polling loop during an outage doesn't grow the container
// indefinitely.
var _toastContainer = null;
var _activeToasts = Object.create(null); // key -> element
function showToast(message, type) {
  if (!_toastContainer) {
    _toastContainer = document.createElement("div");
    _toastContainer.className = "toast-container";
    _toastContainer.setAttribute("aria-live", "polite");
    document.body.appendChild(_toastContainer);
  }
  var key = (type || "info") + "\x00" + message;
  if (_activeToasts[key]) return; // already showing this exact toast
  var role = type === "error" ? "alert" : "status";
  var toast = el("div", { c: "toast toast-" + (type || "info"), attr: { role: role, "aria-atomic": "true" } });
  toast.appendChild(document.createTextNode(message));
  function dispose() {
    if (toast.parentNode) toast.remove();
    delete _activeToasts[key];
  }
  var close = el("button", { c: "toast-close", attr: { "aria-label": "Dismiss notification", title: "Dismiss" }, on: { click: dispose } }, "×");
  toast.appendChild(close);
  _toastContainer.appendChild(toast);
  _activeToasts[key] = toast;
  if (type !== "error") {
    setTimeout(function() { toast.classList.add("toast-exit"); }, 3500);
    setTimeout(dispose, 4000);
  }
}

// G1-001: helper for icon-only buttons. Always emits aria-label so screen
// readers announce a name (the inner SVG is aria-hidden). Use this instead
// of bare el("button", {attr:{title:…}}, DV.iconEl(...)).
function iconBtn(label, opts, icon) {
  opts = opts || {};
  opts.attr = Object.assign({ "aria-label": label, title: label }, opts.attr || {});
  if (icon == null && opts.icon) { icon = opts.icon; delete opts.icon; }
  return el("button", opts, typeof icon === "string" ? (window.DV && DV.iconEl ? DV.iconEl(icon) : icon) : icon);
}

// D2: skeleton placeholder factory. Renders N "row" placeholders inside
// a container so async lists show structure while loading instead of
// blank space → pop-in. Use:
//   container.appendChild(DV.skeleton.rows(3))   // 3 list-rows
//   container.appendChild(DV.skeleton.lines(4))  // 4 text-only lines
function skeletonRows(n) {
  var wrap = el("div", { c: "skeleton-list", attr: { "aria-label": "Loading", role: "status" } });
  for (var i = 0; i < (n || 3); i++) {
    var row = el("div", { c: "skeleton-row" }, [
      el("div", { c: "skeleton skeleton-circle" }),
      el("div", { c: "skeleton-flex" }, [
        el("div", { c: "skeleton skeleton-text" }),
        el("div", { c: "skeleton skeleton-text" })
      ]),
      el("div", { c: "skeleton skeleton-pill" })
    ]);
    wrap.appendChild(row);
  }
  return wrap;
}
function skeletonLines(n) {
  var wrap = el("div", { c: "skeleton-list", attr: { "aria-label": "Loading", role: "status" } });
  for (var i = 0; i < (n || 4); i++) wrap.appendChild(el("div", { c: "skeleton skeleton-text" }));
  return wrap;
}

// D3: consistent empty-state component. Use:
//   container.appendChild(DV.emptyState({
//     icon: "📭", title: "No webhooks yet",
//     sub:  "Wire DV into Slack/Discord with a single POST URL.",
//     cta:  { label: "Add webhook", run: function(){…} }   // optional
//   }))
// `cta` may also be {label, href} for an anchor.
function emptyState(opts) {
  opts = opts || {};
  var wrap = el("div", { c: "empty-state", attr: { role: "status", "aria-live": "polite" } });
  if (opts.icon) wrap.appendChild(el("div", { c: "empty-state-icon", attr: { "aria-hidden": "true" } }, opts.icon));
  if (opts.title) wrap.appendChild(el("div", { c: "empty-state-title" }, opts.title));
  if (opts.sub)   wrap.appendChild(el("div", { c: "empty-state-sub" },   opts.sub));
  if (opts.cta) {
    var c = opts.cta;
    var node;
    if (c.href) node = el("a", { c: "btn-primary btn-sm empty-state-cta", attr: { href: c.href, target: c.target || "_self" } }, c.label);
    else        node = el("button", { c: "btn-primary btn-sm empty-state-cta", on: { click: c.run || function(){} } }, c.label);
    wrap.appendChild(node);
  }
  return wrap;
}

// copyToClipboard(text, opts?) — single source of truth for copy actions.
// Tries the modern async API, then falls back to a hidden textarea +
// document.execCommand("copy") for insecure-context (http://localhost in
// some browsers, in particular Termux Firefox). Returns a Promise<boolean>.
// opts: { successMessage, errorMessage } — both optional. Pass null/false to
// suppress toasts; default shows them.
function copyToClipboard(text, opts) {
  opts = opts || {};
  var successMsg = opts.successMessage === undefined ? "Copied" : opts.successMessage;
  var errorMsg   = opts.errorMessage   === undefined ? "Couldn't copy — long-press the value and copy manually" : opts.errorMessage;
  function ok() { if (successMsg) showToast(successMsg, "info"); return true; }
  function fail() { if (errorMsg) showToast(errorMsg, "error"); return false; }
  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, ta.value.length);
      var done = document.execCommand && document.execCommand("copy");
      document.body.removeChild(ta);
      return done ? Promise.resolve(ok()) : Promise.resolve(fail());
    } catch (e) { return Promise.resolve(fail()); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      return navigator.clipboard.writeText(text).then(ok, function() { return fallback(); });
    } catch (_) { return fallback(); }
  }
  return fallback();
}

// Expose globals for view modules
window.DV = {
  S: S, el: el, api: api, statusClass: statusClass, render: render,
  loadRepos: loadRepos,
  copyToClipboard: copyToClipboard,
  fetchAvailableBranches: fetchAvailableBranches, addBranchToRepo: addBranchToRepo,
  fetchGhRepos: fetchGhRepos,
  // installPullToRefresh(rootEl, onRefresh) — wires touch handlers so the
  // user can drag down from the top of `rootEl` to trigger onRefresh().
  // Idempotent: if already installed on the same element, no-op. Returns
  // the cleanup function.
  installPullToRefresh: function(rootEl, onRefresh) {
    if (!rootEl || rootEl._dvPTR) return rootEl && rootEl._dvPTR;
    var startY = 0, dy = 0, dragging = false, indicator = null, threshold = 70;
    function ensureIndicator() {
      if (indicator) return indicator;
      indicator = document.createElement("div");
      indicator.className = "ptr-indicator";
      indicator.textContent = "Pull to refresh";
      rootEl.insertBefore(indicator, rootEl.firstChild);
      return indicator;
    }
    function onStart(e) {
      // Only engage when scrolled to the top — otherwise the user is
      // scrolling the content normally.
      if (window.scrollY > 4) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      startY = t.clientY; dy = 0; dragging = true;
    }
    function onMove(e) {
      if (!dragging) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      dy = t.clientY - startY;
      if (dy <= 0) { dragging = false; if (indicator) indicator.style.height = "0"; return; }
      // Only swallow scroll once we've actually moved enough that this is
      // intentional — keeps short flicks from blocking normal scroll.
      if (dy > 6 && e.cancelable) e.preventDefault();
      var ind = ensureIndicator();
      var pulled = Math.min(dy, threshold * 1.4);
      ind.style.height = pulled + "px";
      ind.textContent = dy >= threshold ? "Release to refresh" : "Pull to refresh";
      ind.classList.toggle("ptr-armed", dy >= threshold);
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      var fired = dy >= threshold;
      if (indicator) {
        indicator.style.height = "0";
        indicator.classList.remove("ptr-armed");
      }
      if (fired) try { onRefresh(); } catch (_) {}
    }
    rootEl.addEventListener("touchstart", onStart, { passive: true });
    rootEl.addEventListener("touchmove",  onMove,  { passive: false });
    rootEl.addEventListener("touchend",   onEnd,   { passive: true });
    rootEl.addEventListener("touchcancel", onEnd,  { passive: true });
    var cleanup = function() {
      rootEl.removeEventListener("touchstart", onStart);
      rootEl.removeEventListener("touchmove", onMove);
      rootEl.removeEventListener("touchend", onEnd);
      rootEl.removeEventListener("touchcancel", onEnd);
      if (indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
      delete rootEl._dvPTR;
    };
    rootEl._dvPTR = cleanup;
    return cleanup;
  },
  // openAddRepo() — single entry point for navigating to the Add-Repo
  // form. Resets the inputs to known defaults so a stale half-filled
  // form from a previous session doesn't bleed in. Three callsites
  // duplicated this verbatim before this helper.
  openAddRepo: function() {
    S.repoUrl = ""; S.repoError = ""; S.fetchedBranches = []; S.selectedBranches = [];
    S.repoInfo = null; S.detectedFramework = null; S.detectError = "";
    S.buildCommand = "npm run build"; S.outputDir = "dist"; S.baseDir = "";
    S.mode = "static"; S.startCommand = "npm start"; S.envVars = "";
    S.language = "auto";
    S.view = "addRepo"; render();
  },
  // openShare(url, title?) — preferred entry point. Uses native share sheet
  // on supported devices (Android/iOS/macOS Safari), falls back to the QR
  // modal on desktop / unsupported browsers. Always also offers clipboard.
  openShare: function(url, title) {
    if (!url) return;
    var fullUrl = /^https?:\/\//i.test(url) ? url : (location.origin + url);
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ title: title || "DeployView preview", url: fullUrl })
        .catch(function(){ S.shareModal = { url: fullUrl, title: title || "" }; render(); });
      return;
    }
    S.shareModal = { url: fullUrl, title: title || "" };
    render();
  },
  loadMcpTools: loadMcpTools, showToast: showToast, iconBtn: iconBtn,
  skeleton: { rows: skeletonRows, lines: skeletonLines },
  emptyState: emptyState,
  views: views, VIEW_PRESETS: VIEW_PRESETS,
  getDropdownHandler: function() { return _dropdownCloseHandler; },
  setDropdownHandler: function(h) { _dropdownCloseHandler = h; }
};

})();
