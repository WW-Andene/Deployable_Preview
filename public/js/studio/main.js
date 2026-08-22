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

    var previewWrap = h("div", { class: "st-preview-wrap" });
    iframe = document.createElement("iframe");
    iframe.className = "st-preview-iframe";
    iframe.src = S.previewUrl;
    previewWrap.appendChild(iframe);
    body.appendChild(previewWrap);
    Studio.guides.bindIframe(iframe);

    iframe.addEventListener("load", function () {
      injectOverlay();
    });

    // Right dock: tabs (Inspect / Code) + changelog below
    var dock = h("div", { class: "st-dock" });
    var tabs = h("div", { class: "st-tabs" });
    var tabInspect = h("button", { class: "st-tab", text: "Inspect" });
    var tabCode = h("button", { class: "st-tab", text: "Code" });
    tabInspect.addEventListener("click", function () { setPanel("inspect"); });
    tabCode.addEventListener("click", function () { setPanel("code"); });
    tabs.appendChild(tabInspect); tabs.appendChild(tabCode);
    dock.appendChild(tabs);

    var panelBody = h("div", { class: "st-panel-body" });
    inspectorRoot = h("div", { class: "st-panel st-panel-inspect" });
    codeRoot = h("div", { class: "st-panel st-panel-code" });
    panelBody.appendChild(inspectorRoot);
    panelBody.appendChild(codeRoot);
    dock.appendChild(panelBody);

    changelogRoot = h("div", { class: "st-changelog" });
    dock.appendChild(changelogRoot);

    body.appendChild(dock);
    root.appendChild(body);

    toastEl = h("div", { class: "st-toast" });
    root.appendChild(toastEl);

    appRoot.appendChild(root);

    function setPanel(name) {
      S.activePanel = name;
      tabInspect.classList.toggle("on", name === "inspect");
      tabCode.classList.toggle("on", name === "code");
      inspectorRoot.style.display = name === "inspect" ? "block" : "none";
      codeRoot.style.display = name === "code" ? "block" : "none";
      if (name === "code") Studio.renderCodePanel(codeRoot);
    }
    Studio.onPanelChanged = function () { setPanel(S.activePanel); };
    setPanel("inspect");

    Studio.onSelectionChanged = function () { Studio.renderInspector(inspectorRoot); };
    Studio.onCodeFileChanged = function () { if (S.activePanel === "code") Studio.renderCodePanel(codeRoot); };
    Studio.onChangesUpdated = function () { Studio.renderChangeLog(changelogRoot); };
    Studio.renderInspector(inspectorRoot);
    Studio.renderChangeLog(changelogRoot);
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
