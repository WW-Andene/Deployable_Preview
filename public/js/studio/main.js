(function () {
  "use strict";
  var S = Studio.S;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  var root, iframe, inspectorRoot, codeRoot, changelogRoot, toastEl;

  function build() {
    var parsed = Studio.parseHash();
    S.owner = parsed.owner; S.repo = parsed.repo; S.slug = parsed.slug;
    if (!S.owner || !S.repo || !S.slug) {
      document.getElementById("studio-root").textContent = "No repo/branch specified. Open Studio from a preview tab.";
      return;
    }
    S.previewUrl = "/preview/" + S.owner + "/" + S.repo + "/" + S.slug + "/";

    var appRoot = document.getElementById("studio-root");
    appRoot.innerHTML = "";
    root = h("div", { class: "st-shell" });

    // Top bar
    var topbar = h("div", { class: "st-topbar" }, [
      h("div", { class: "st-topbar-title" }, [
        h("span", { class: "st-brand", text: "Studio" }),
        h("span", { class: "st-repo-label", text: S.owner + "/" + S.repo + " \u00b7 " + S.slug })
      ]),
      h("div", { class: "st-topbar-actions" }, [
        (function () {
          var reloadBtn = h("button", { class: "st-btn-sm", text: "\u21bb Reload preview" });
          reloadBtn.addEventListener("click", function () { reloadIframe(); });
          return reloadBtn;
        })(),
        (function () {
          var closeBtn = h("button", { class: "st-btn-sm", text: "Close" });
          closeBtn.addEventListener("click", function () { window.close(); });
          return closeBtn;
        })()
      ])
    ]);
    root.appendChild(topbar);

    // Body: preview iframe + right dock
    var body = h("div", { class: "st-body" });

    var previewWrap = h("div", { class: "st-preview-wrap st-framed" });
    var deviceFrame = h("div", { class: "st-device-frame" });
    iframe = document.createElement("iframe");
    iframe.className = "st-preview-iframe";
    iframe.src = S.previewUrl;
    deviceFrame.appendChild(iframe);
    previewWrap.appendChild(deviceFrame);
    body.appendChild(previewWrap);
    Studio.guides.bindIframe(iframe);
    applyDeviceFrame();

    iframe.addEventListener("load", function () {
      injectOverlay();
    });

    // Right dock: tabs (Inspect / Code / Log / View)
    var dock = h("div", { class: "st-dock" });
    var tabs = h("div", { class: "st-tabs" });
    var tabInspect = h("button", { class: "st-tab", text: "Inspect" });
    var tabCode = h("button", { class: "st-tab", text: "Code" });
    var tabLog = h("button", { class: "st-tab", text: "Log" });
    var tabView = h("button", { class: "st-tab", text: "View" });
    tabInspect.addEventListener("click", function () { setPanel("inspect"); });
    tabCode.addEventListener("click", function () { setPanel("code"); });
    tabLog.addEventListener("click", function () { setPanel("log"); });
    tabView.addEventListener("click", function () { setPanel("view"); });
    tabs.appendChild(tabInspect); tabs.appendChild(tabCode); tabs.appendChild(tabLog); tabs.appendChild(tabView);
    dock.appendChild(tabs);

    var panelBody = h("div", { class: "st-panel-body" });
    inspectorRoot = h("div", { class: "st-panel st-panel-inspect" });
    codeRoot = h("div", { class: "st-panel st-panel-code" });
    changelogRoot = h("div", { class: "st-panel st-panel-log" });
    var viewRoot = h("div", { class: "st-panel st-panel-view" });
    panelBody.appendChild(inspectorRoot);
    panelBody.appendChild(codeRoot);
    panelBody.appendChild(changelogRoot);
    panelBody.appendChild(viewRoot);
    dock.appendChild(panelBody);

    // View panel: pick any device preset from the classic Preview mode
    // (window.DV.VIEW_PRESETS), or switch to full-bleed. Keeps Studio's
    // windowed frame in sync with whatever format the user is actually
    // targeting, instead of being locked to the Xiaomi 13T default.
    var presets = (window.DV && window.DV.VIEW_PRESETS) || {};
    var viewPanelInner = h("div", { class: "st-view-panel" });
    var presetGrid = h("div", { class: "st-preset-grid" });
    var presetButtons = {};

    function selectPreset(key) {
      S.devicePreset = key;
      S.isFullView = (key === "full");
      Object.keys(presetButtons).forEach(function (k) { presetButtons[k].classList.toggle("on", k === key); });
      applyDeviceFrame();
    }

    Object.keys(presets).forEach(function (key) {
      var p = presets[key];
      var btn = h("button", { class: "st-btn-sm st-preset-btn", text: p.label + " (" + p.w + "\u00d7" + p.h + ")" });
      btn.addEventListener("click", function () { selectPreset(key); });
      presetButtons[key] = btn;
      presetGrid.appendChild(btn);
    });
    var fullBtn = h("button", { class: "st-btn-sm st-preset-btn", text: "Vue compl\u00e8te (plein \u00e9cran)" });
    fullBtn.addEventListener("click", function () { selectPreset("full"); });
    presetButtons["full"] = fullBtn;
    presetGrid.appendChild(fullBtn);

    viewPanelInner.appendChild(h("div", { class: "st-view-hint", text: "Choisissez le format d'\u00e9cran affich\u00e9 dans Studio \u2014 les m\u00eames presets que le mode preview classique (Xiaomi 13T, iPhone 15, Galaxy S24, iPad Air, etc.), ou la vue plein \u00e9cran." }));
    viewPanelInner.appendChild(presetGrid);
    viewRoot.appendChild(viewPanelInner);
    selectPreset(S.devicePreset);

    body.appendChild(dock);
    root.appendChild(body);

    toastEl = h("div", { class: "st-toast" });
    root.appendChild(toastEl);

    appRoot.appendChild(root);

    var changeBadge = h("span", { class: "st-tab-badge" });
    tabLog.appendChild(changeBadge);

    function setPanel(name) {
      S.activePanel = name;
      tabInspect.classList.toggle("on", name === "inspect");
      tabCode.classList.toggle("on", name === "code");
      tabLog.classList.toggle("on", name === "log");
      tabView.classList.toggle("on", name === "view");
      inspectorRoot.style.display = name === "inspect" ? "block" : "none";
      codeRoot.style.display = name === "code" ? "block" : "none";
      changelogRoot.style.display = name === "log" ? "flex" : "none";
      viewRoot.style.display = name === "view" ? "block" : "none";
      if (name === "code") Studio.renderCodePanel(codeRoot);
      if (name === "log") Studio.renderChangeLog(changelogRoot);
    }
    Studio.onPanelChanged = function () { setPanel(S.activePanel); };
    setPanel("inspect");

    Studio.onSelectionChanged = function () { Studio.renderInspector(inspectorRoot); };
    Studio.onCodeFileChanged = function () { if (S.activePanel === "code") Studio.renderCodePanel(codeRoot); };
    Studio.onChangesUpdated = function () {
      changeBadge.textContent = S.changes.length ? String(S.changes.length) : "";
      changeBadge.style.display = S.changes.length ? "inline-block" : "none";
      if (S.activePanel === "log") Studio.renderChangeLog(changelogRoot);
    };
    Studio.renderInspector(inspectorRoot);
    Studio.onChangesUpdated();

    function applyDeviceFrame() {
      var key = S.devicePreset;
      var presetsNow = (window.DV && window.DV.VIEW_PRESETS) || {};
      var p = presetsNow[key];
      previewWrap.classList.toggle("st-full", S.isFullView);
      previewWrap.classList.toggle("st-framed", !S.isFullView);
      if (!S.isFullView && p) {
        var scale = p.scale || 1;
        iframe.style.width = Math.round(p.w * scale) + "px";
        iframe.style.height = Math.round(p.h * scale) + "px";
      } else {
        iframe.style.width = "";
        iframe.style.height = "";
      }
    }
    Studio.applyDeviceFrame = applyDeviceFrame;
  }

  function injectOverlay() {
    try {
      var doc = iframe.contentDocument;
      if (!doc) return; // cross-origin — shouldn't happen for same-origin /preview/ URLs
      if (doc.querySelector('script[data-studio-overlay]')) return;
      var s = doc.createElement("script");
      s.setAttribute("data-studio-overlay", "1");
      s.src = "/js/studio/injected-overlay.js";
      (doc.body || doc.documentElement).appendChild(s);
    } catch (e) {
      Studio.toast("Could not attach editor to preview (cross-origin?): " + e.message, true);
    }
  }

  function reloadIframe() {
    iframe.src = iframe.src;
    S.selected = null;
    if (Studio.onSelectionChanged) Studio.onSelectionChanged();
  }

  Studio.pollRebuildThenReload = function () {
    // Simple bounded poll — good enough without wiring the SSE log stream
    // into this standalone page. Reloads the iframe once, a few seconds
    // after a rebuild was kicked off, then again shortly after in case the
    // first reload raced the build.
    setTimeout(reloadIframe, 2500);
    setTimeout(reloadIframe, 6000);
  };

  Studio.toast = function (msg, isError) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "st-toast show" + (isError ? " err" : "");
    setTimeout(function () { toastEl.className = "st-toast"; }, 4000);
  };

  window.addEventListener("hashchange", build);
  document.addEventListener("DOMContentLoaded", build);
  if (document.readyState !== "loading") build();
})();
