(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass, VIEW_PRESETS = DV.VIEW_PRESETS;

DV.views.preview = function(app) {
  if (!S.activeRepo) return;
  var repo = S.activeRepo;
  var baseUrl = "/preview/" + repo.owner + "/" + repo.repo + "/";
  var url = baseUrl + S.activeBranch + "/";
  var cmpUrl = S.compareBranch ? baseUrl + S.compareBranch + "/" : "";

  var ctrls = el("div", { s: { padding: "10px 16px", borderBottom: "1.5px solid var(--border)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "var(--sf1)" } });

  var slugs = Object.keys(repo.branchStatuses || {});
  var sel = document.createElement("select");
  sel.style.cssText = "width:auto;min-width:150px;padding:8px;font-size:13px;font-family:monospace;background:var(--bg);border:1.5px solid var(--border);color:var(--tx1);border-radius:6px";
  for (var i = 0; i < slugs.length; i++) {
    var bsInfo = repo.branchStatuses[slugs[i]] || {};
    var label = bsInfo.branch + (bsInfo.baseDir ? " \u2192 " + bsInfo.baseDir : "");
    var o = document.createElement("option"); o.value = slugs[i]; o.textContent = label;
    if (slugs[i] === S.activeBranch) o.selected = true; sel.appendChild(o);
  }
  sel.addEventListener("change", function(e) { S.activeBranch = e.target.value; DV.render(); });
  ctrls.appendChild(sel);

  if (S.compareMode) {
    ctrls.appendChild(el("span", { s: { color: "var(--tx3)", fontFamily: "monospace", fontSize: "12px" } }, "vs"));
    var s2 = document.createElement("select"); s2.style.cssText = sel.style.cssText;
    s2.appendChild(el("option", { attr: { value: "" } }, "Select\u2026"));
    for (var i = 0; i < slugs.length; i++) {
      if (slugs[i] === S.activeBranch) continue;
      var bsInfo2 = repo.branchStatuses[slugs[i]] || {};
      var label2 = bsInfo2.branch + (bsInfo2.baseDir ? " \u2192 " + bsInfo2.baseDir : "");
      var o = document.createElement("option"); o.value = slugs[i]; o.textContent = label2;
      if (slugs[i] === S.compareBranch) o.selected = true; s2.appendChild(o);
    }
    s2.addEventListener("change", function(e) { S.compareBranch = e.target.value; DV.render(); });
    ctrls.appendChild(s2);
  }

  // Add Branch dropdown
  var addBtnWrap = el("div", { s: { position: "relative" } });
  var addBtn = el("button", { c: "bg bs", attr: { "data-dd-toggle": "1" }, on: { click: function(evt) {
    evt.stopPropagation();
    S.showBranchDropdown = !S.showBranchDropdown;
    S.branchFilter = ""; S.addBranchBaseDir = ""; S.addBranchMode = "static"; S.addBranchStartCmd = "";
    if (S.showBranchDropdown && S.availableBranches.length === 0) DV.fetchAvailableBranches();
    DV.render();
  } } }, "+ Branch");
  addBtnWrap.appendChild(addBtn);

  if (S.showBranchDropdown) {
    var dd = el("div", { c: "add-branch-dropdown" });

    var ddModeRow = el("div", { s: { display: "flex", gap: "4px", margin: "4px 6px" } });
    ddModeRow.appendChild(el("div", { c: "chip" + ((S.addBranchMode || "static") === "static" ? " on" : ""), s: { fontSize: "10px", padding: "4px 10px" }, on: { click: function(e) { e.stopPropagation(); S.addBranchMode = "static"; DV.render(); } } }, "Static"));
    ddModeRow.appendChild(el("div", { c: "chip" + ((S.addBranchMode || "static") === "server" ? " on" : ""), s: { fontSize: "10px", padding: "4px 10px" }, on: { click: function(e) { e.stopPropagation(); S.addBranchMode = "server"; DV.render(); } } }, "Server"));
    dd.appendChild(ddModeRow);

    if ((S.addBranchMode || "static") === "server") {
      var startCmdInput = document.createElement("input");
      startCmdInput.style.cssText = "padding:6px 10px;margin:4px 6px;font-size:12px;width:calc(100% - 12px);border-radius:4px;background:var(--bg);border:1.5px solid var(--run-dim);color:var(--tx1);font-family:monospace;outline:none";
      startCmdInput.placeholder = "Start command (npm start)";
      startCmdInput.value = S.addBranchStartCmd || "";
      startCmdInput.addEventListener("input", function(e) { S.addBranchStartCmd = e.target.value; });
      startCmdInput.addEventListener("click", function(e) { e.stopPropagation(); });
      dd.appendChild(startCmdInput);
    }

    var rootDirInput = document.createElement("input");
    rootDirInput.style.cssText = "padding:6px 10px;margin:4px 6px;font-size:12px;width:calc(100% - 12px);border-radius:4px;background:var(--bg);border:1.5px solid var(--accent-mid);color:var(--tx1);font-family:monospace;outline:none";
    rootDirInput.placeholder = "Root dir (empty = repo root)";
    rootDirInput.value = S.addBranchBaseDir || "";
    rootDirInput.addEventListener("input", function(e) { S.addBranchBaseDir = e.target.value; });
    rootDirInput.addEventListener("click", function(e) { e.stopPropagation(); });
    dd.appendChild(rootDirInput);

    var searchInput = document.createElement("input");
    searchInput.style.cssText = "padding:6px 10px;margin:4px 6px;font-size:12px;width:calc(100% - 12px);border-radius:4px;background:var(--bg);border:1.5px solid var(--border);color:var(--tx1);font-family:monospace;outline:none";
    searchInput.placeholder = "Filter branches...";
    searchInput.value = S.branchFilter;
    searchInput.addEventListener("input", function(e) { S.branchFilter = e.target.value; DV.render(); });
    searchInput.addEventListener("click", function(e) { e.stopPropagation(); });
    dd.appendChild(searchInput);

    if (S.availableBranches.length === 0) {
      dd.appendChild(el("div", { s: { padding: "12px 14px", textAlign: "center" } }, [el("span", { c: "spin" })]));
    } else {
      var activeSet = {};
      var activeBranches = repo.activeBranches || [];
      for (var ai = 0; ai < activeBranches.length; ai++) {
        var abc = activeBranches[ai];
        activeSet[(abc.branch || abc) + ":" + (abc.baseDir || "")] = true;
      }
      var filtered = S.availableBranches.filter(function(b) {
        if (S.branchFilter) return b.toLowerCase().indexOf(S.branchFilter.toLowerCase()) !== -1;
        return true;
      });
      for (var i = 0; i < filtered.length; i++) {
        (function(b) {
          var pendingBaseDir = S.addBranchBaseDir || "";
          var isDuplicate = activeSet[b + ":" + pendingBaseDir];
          dd.appendChild(el("div", { c: "dd-item" + (isDuplicate ? " already" : ""), on: { click: function(e) {
            e.stopPropagation();
            if (!isDuplicate) DV.addBranchToRepo(b, S.addBranchBaseDir || "", S.addBranchMode || "static", S.addBranchStartCmd || "");
          } } }, [
            el("span", { s: { color: isDuplicate ? "var(--tx3)" : "var(--accent)", fontSize: "10px", flexShrink: "0" } }, isDuplicate ? "ok" : "+"),
            document.createTextNode(b),
            pendingBaseDir ? el("span", { s: { color: "var(--tx3)", fontSize: "10px", marginLeft: "6px" } }, "\u2192 " + pendingBaseDir) : null
          ]));
        })(filtered[i]);
      }
      if (!filtered.length) dd.appendChild(el("div", { s: { padding: "10px 14px", color: "var(--tx3)", fontFamily: "monospace", fontSize: "12px" } }, "No matching branches"));
    }
    addBtnWrap.appendChild(dd);

    setTimeout(function() {
      var handler = function(e) {
        var liveDropdown = document.querySelector('.add-branch-dropdown');
        var liveBtn = e.target.closest && e.target.closest('[data-dd-toggle]');
        if ((liveDropdown && liveDropdown.contains(e.target)) || liveBtn) return;
        S.showBranchDropdown = false;
        document.removeEventListener("click", handler, true);
        DV.setDropdownHandler(null);
        DV.render();
      };
      DV.setDropdownHandler(handler);
      document.addEventListener("click", handler, true);
    }, 10);
  }
  ctrls.appendChild(addBtnWrap);

  var bs = (repo.branchStatuses || {})[S.activeBranch] || {};
  ctrls.appendChild(el("div", { s: { flex: "1", display: "flex", alignItems: "center", gap: "6px" } }, [
    el("span", { c: statusClass(bs.status) }),
    el("span", { s: { fontFamily: "monospace", fontSize: "11px", color: (bs.status === "ready" || bs.status === "running") ? "var(--ok)" : "var(--tx3)" } }, (bs.status === "ready" || bs.status === "running") ? url : (bs.status || "idle"))
  ]));
  app.appendChild(ctrls);

  // View toggles
  var ratioBar = el("div", { s: { padding: "8px 16px", borderBottom: "1.5px solid var(--border)", display: "flex", gap: "6px", flexWrap: "wrap" } });
  var presetKeys = Object.keys(VIEW_PRESETS);
  for (var pi = 0; pi < presetKeys.length; pi++) {
    (function(key) {
      var preset = VIEW_PRESETS[key];
      var isOn = S.activeViews.indexOf(key) !== -1;
      ratioBar.appendChild(el("div", { c: "chip" + (isOn ? " on" : ""), on: { click: function() {
        var idx = S.activeViews.indexOf(key);
        if (idx !== -1 && S.activeViews.length > 1) S.activeViews.splice(idx, 1);
        else if (idx === -1) S.activeViews.push(key);
        DV.render();
      } } }, preset.label));
    })(presetKeys[pi]);
  }
  app.appendChild(ratioBar);

  // Frames
  var container = el("div", { s: { padding: "16px", display: "flex", flexDirection: "column", gap: "20px" } });
  var activePresets = presetKeys.filter(function(k) { return S.activeViews.indexOf(k) !== -1; });

  function makeFrame(presetKey, src, label, color) {
    var preset = VIEW_PRESETS[presetKey];
    var pixelW = preset.w, pixelH = preset.h, sc = preset.scale || 1;
    var f = el("div", { c: "preview-frame" });
    f.appendChild(el("div", { c: "frame-label" }, [
      el("span", { c: statusClass(src ? "ready" : "idle") }),
      el("span", { s: color ? { color: color } : {} }, label),
      el("span", { s: { marginLeft: "auto", fontSize: "10px", color: "var(--tx3)" } }, preset.res)
    ]));
    var body = el("div", { c: "frame-body", s: { width: pixelW + "px", height: pixelH + "px", transform: sc !== 1 ? "scale(" + sc + ")" : "none", transformOrigin: "top left" } });
    if (src && (bs.status === "ready" || bs.status === "running")) {
      var iframe = document.createElement("iframe");
      iframe.src = src + "?_r=" + S.refreshKey; iframe.title = label;
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
      iframe.style.cssText = "border:none;width:" + pixelW + "px;height:" + pixelH + "px;display:block;";
      var loader = el("div", { s: { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", zIndex: "2", transition: "opacity .3s" } }, [el("span", { c: "spin" })]);
      iframe.onload = function() { loader.style.opacity = "0"; setTimeout(function() { if (loader.parentNode) loader.remove(); }, 300); };
      body.appendChild(iframe); body.appendChild(loader);
    } else {
      var stateWrap = el("div", { s: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px" } });
      if (bs.status === "building") {
        var loadWrap = el("div", { s: { width: "120px" } });
        loadWrap.appendChild(el("div", { c: "dv-loading" }));
        stateWrap.appendChild(loadWrap);
        stateWrap.appendChild(el("div", { s: { color: "var(--tx3)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em" } }, "BUILDING..."));
      } else {
        stateWrap.appendChild(el("div", { s: { width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--border-h)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx3)", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: "600" } }, "DV"));
        stateWrap.appendChild(el("div", { s: { color: "var(--tx3)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em" } }, "AWAITING BUILD"));
      }
      body.appendChild(stateWrap);
    }
    if (sc !== 1) {
      var wrapper = el("div", { s: { width: Math.floor(pixelW * sc) + "px", height: Math.floor(pixelH * sc) + "px", overflow: "hidden" } });
      wrapper.appendChild(body); f.appendChild(wrapper);
    } else { f.appendChild(body); }
    return f;
  }

  if (S.compareMode) {
    activePresets.forEach(function(key) {
      var scrollWrap = el("div", { s: { overflowX: "auto", overflowY: "hidden", paddingBottom: "8px" } });
      var row = el("div", { s: { display: "inline-flex", gap: "16px", flexWrap: "nowrap" } });
            row.appendChild(makeFrame(key, url, S.activeBranch + " \u2014 " + VIEW_PRESETS[key].label, "var(--accent)"));
      row.appendChild(makeFrame(key, S.compareBranch ? cmpUrl : "", S.compareBranch || "Select branch", "var(--run)"));
      scrollWrap.appendChild(row); container.appendChild(scrollWrap);
    });
  } else {
    activePresets.forEach(function(key) {
      var scrollWrap = el("div", { s: { overflowX: "auto", overflowY: "hidden", paddingBottom: "8px" } });
      scrollWrap.appendChild(makeFrame(key, url, VIEW_PRESETS[key].label, null));
      container.appendChild(scrollWrap);
    });
  }
  app.appendChild(container);
};
})();
