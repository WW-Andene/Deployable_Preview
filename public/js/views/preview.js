(function(){
var S = DV.S, el = DV.el, api = DV.api, statusClass = DV.statusClass, VIEW_PRESETS = DV.VIEW_PRESETS;

DV.views.preview = function(app) {
  if (!S.activeRepo) return;
  var repo = S.activeRepo;
  var baseUrl = "/preview/" + repo.owner + "/" + repo.repo + "/";
  var url = baseUrl + S.activeBranch + "/";
  var cmpUrl = S.compareBranch ? baseUrl + S.compareBranch + "/" : "";

  var ctrls = el("div", { c: "preview-controls" });

  var slugs = Object.keys(repo.branchStatuses || {});
  var sel = document.createElement("select");
  sel.className = "select-inline";
  for (var i = 0; i < slugs.length; i++) {
    var bsInfo = repo.branchStatuses[slugs[i]] || {};
    var label = bsInfo.branch + (bsInfo.baseDir ? " \u2192 " + bsInfo.baseDir : "");
    var o = document.createElement("option"); o.value = slugs[i]; o.textContent = label;
    if (slugs[i] === S.activeBranch) o.selected = true; sel.appendChild(o);
  }
  sel.addEventListener("change", function(e) { S.activeBranch = e.target.value; DV.render(); });
  ctrls.appendChild(sel);

  if (S.compareMode) {
    ctrls.appendChild(el("span", { c: "font-mono text-12 color-tx3" }, "vs"));
    var s2 = document.createElement("select");
    s2.className = "select-inline";
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
  var addBtnWrap = el("div", { c: "relative" });
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

    var ddModeRow = el("div", { c: "preview-chip-bar" });
    ddModeRow.appendChild(el("div", { c: "chip preview-chip-sm" + ((S.addBranchMode || "static") === "static" ? " on" : ""), on: { click: function(e) { e.stopPropagation(); S.addBranchMode = "static"; DV.render(); } } }, "Static"));
    ddModeRow.appendChild(el("div", { c: "chip preview-chip-sm" + ((S.addBranchMode || "static") === "server" ? " on" : ""), on: { click: function(e) { e.stopPropagation(); S.addBranchMode = "server"; DV.render(); } } }, "Server"));
    dd.appendChild(ddModeRow);

    if ((S.addBranchMode || "static") === "server") {
      var startCmdInput = document.createElement("input");
      startCmdInput.className = "dd-input run-border";
      startCmdInput.placeholder = "Start command (npm start)";
      startCmdInput.value = S.addBranchStartCmd || "";
      startCmdInput.addEventListener("input", function(e) { S.addBranchStartCmd = e.target.value; });
      startCmdInput.addEventListener("click", function(e) { e.stopPropagation(); });
      dd.appendChild(startCmdInput);
    }

    var rootDirInput = document.createElement("input");
    rootDirInput.className = "dd-input accent-border";
    rootDirInput.placeholder = "Root dir (empty = repo root)";
    rootDirInput.value = S.addBranchBaseDir || "";
    rootDirInput.addEventListener("input", function(e) { S.addBranchBaseDir = e.target.value; });
    rootDirInput.addEventListener("click", function(e) { e.stopPropagation(); });
    dd.appendChild(rootDirInput);

    var searchInput = document.createElement("input");
    searchInput.className = "dd-input";
    searchInput.placeholder = "Filter branches...";
    searchInput.value = S.branchFilter;
    searchInput.addEventListener("input", function(e) {
      S.branchFilter = e.target.value;
      var items = dd.querySelectorAll('.dd-item');
      var val = e.target.value.toLowerCase();
      for (var fi = 0; fi < items.length; fi++) {
        var txt = items[fi].textContent.toLowerCase();
        items[fi].style.display = (!val || txt.indexOf(val) !== -1) ? '' : 'none';
      }
    });
    searchInput.addEventListener("click", function(e) { e.stopPropagation(); });
    dd.appendChild(searchInput);

    if (S.availableBranches.length === 0) {
      dd.appendChild(el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));
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
            el("span", { c: isDuplicate ? "frame-label-dup" : "frame-label-accent" }, isDuplicate ? "ok" : "+"),
            document.createTextNode(b),
            pendingBaseDir ? el("span", { c: "frame-info-badge" }, "\u2192 " + pendingBaseDir) : null
          ]));
        })(filtered[i]);
      }
      if (!filtered.length) dd.appendChild(el("div", { c: "preview-empty-text pad-md" }, "No matching branches"));
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
  var isReady = bs.status === "ready" || bs.status === "running";
  ctrls.appendChild(el("div", { c: "flex-1 flex-row items-center gap-6" }, [
    el("span", { c: statusClass(bs.status) }),
    el("span", { c: "frame-branch-status " + (isReady ? "frame-branch-status-ok" : "frame-branch-status-dim") }, isReady ? url : (bs.status || "idle"))
  ]));
  app.appendChild(ctrls);

  // URL bar with copy and open-in-tab
  var urlBar = el("div", { c: "preview-url-bar flex-row gap-6 items-center" });
  urlBar.appendChild(el("span", { c: "flex-1 truncate" }, url));
  urlBar.appendChild(el("button", { c: "bg bs", attr: { title: "Copy URL" }, on: { click: function() {
    var fullUrl = window.location.origin + url;
    navigator.clipboard && navigator.clipboard.writeText(fullUrl);
    DV.showToast("URL copied", "info");
  } } }, "Copy"));
  urlBar.appendChild(el("button", { c: "bg bs", attr: { title: "Open in new tab" }, on: { click: function() {
    window.open(url, "_blank");
  } } }, "\u2197"));
  app.appendChild(urlBar);

  // View toggles
  var ratioBar = el("div", { c: "preview-branch-bar" });
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

  ratioBar.appendChild(el("div", { c: "chip" + (S.isFullscreen ? " on" : ""), on: { click: function() {
    S.isFullscreen = !S.isFullscreen;
    DV.render();
  } } }, "Fullscreen"));

  ratioBar.appendChild(el("div", { c: "chip" + (S.rotated ? " on" : ""), on: { click: function() {
    S.rotated = !S.rotated;
    DV.render();
  } } }, "Rotate"));

  app.appendChild(ratioBar);

  // Frames
  var container = el("div", { c: "preview-body" });
  var activePresets = presetKeys.filter(function(k) { return S.activeViews.indexOf(k) !== -1; });

  function makeFrame(presetKey, src, label, colorClass) {
    var preset = VIEW_PRESETS[presetKey];
    var pixelW = S.rotated ? preset.h : preset.w;
    var pixelH = S.rotated ? preset.w : preset.h;
    var sc = preset.scale || 1;
    var f = el("div", { c: "preview-frame" + (S.isFullscreen ? " fullscreen" : "") });
    f.appendChild(el("div", { c: "frame-label" }, [
      el("span", { c: statusClass(src ? "ready" : "idle") }),
      el("span", { c: colorClass || "" }, label),
      el("span", { c: "frame-info-badge ml-auto" }, preset.res)
    ]));
    var body = el("div", { c: "frame-body", s: { width: pixelW + "px", height: pixelH + "px", transform: sc !== 1 ? "scale(" + sc + ")" : "none", transformOrigin: "top left" } });
    if (src && (bs.status === "ready" || bs.status === "running")) {
      var iframe = document.createElement("iframe");
      iframe.src = src + "?_r=" + S.refreshKey; iframe.title = label;
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
      iframe.style.cssText = "width:" + pixelW + "px;height:" + pixelH + "px;";
      var loader = el("div", { c: "frame-loader" }, [el("span", { c: "spin" })]);
      iframe.onload = function() { loader.style.opacity = "0"; setTimeout(function() { if (loader.parentNode) loader.remove(); }, 300); };
      body.appendChild(iframe); body.appendChild(loader);
    } else {
      var stateWrap = el("div", { c: "frame-state" });
      if (bs.status === "building") {
        var loadWrap = el("div", { c: "preview-loading-bar" });
        loadWrap.appendChild(el("div", { c: "dv-loading" }));
        stateWrap.appendChild(loadWrap);
        stateWrap.appendChild(el("div", { c: "frame-status-text" }, "BUILDING..."));
      } else {
        stateWrap.appendChild(el("div", { c: "frame-status-circle" }, "DV"));
        stateWrap.appendChild(el("div", { c: "frame-status-text" }, "AWAITING BUILD"));
      }
      body.appendChild(stateWrap);
    }
    if (sc !== 1) {
      var wrapper = el("div", { c: "overflow-hidden", s: { width: Math.floor(pixelW * sc) + "px", height: Math.floor(pixelH * sc) + "px" } });
      wrapper.appendChild(body); f.appendChild(wrapper);
    } else { f.appendChild(body); }
    return f;
  }

  if (S.compareMode) {
    activePresets.forEach(function(key) {
      var scrollWrap = el("div", { c: "device-scroll" });
      var row = el("div", { c: "compare-row" });
      row.appendChild(makeFrame(key, url, S.activeBranch + " \u2014 " + VIEW_PRESETS[key].label, "color-accent"));
      row.appendChild(makeFrame(key, S.compareBranch ? cmpUrl : "", S.compareBranch || "Select branch", "color-run"));
      scrollWrap.appendChild(row); container.appendChild(scrollWrap);
    });
  } else {
    activePresets.forEach(function(key) {
      var scrollWrap = el("div", { c: "device-scroll" });
      scrollWrap.appendChild(makeFrame(key, url, VIEW_PRESETS[key].label, null));
      container.appendChild(scrollWrap);
    });
  }
  app.appendChild(container);
};
})();
