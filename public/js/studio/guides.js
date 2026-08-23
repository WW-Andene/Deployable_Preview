(function () {
  "use strict";
  window.Studio = window.Studio || {};

  var iframeEl = null;

  Studio.guides = {
    bindIframe: function (iframe) { iframeEl = iframe; },
    send: function (cmd, extra) {
      if (!iframeEl || !iframeEl.contentWindow) return;
      var msg = Object.assign({ __studioCmd: true, cmd: cmd }, extra || {});
      iframeEl.contentWindow.postMessage(msg, "*");
    },
    setEnabled: function (on) { Studio.guides.send("setEnabled", { value: on }); },
    deselect: function () { Studio.guides.send("deselect"); },
    setStyle: function (property, value) { Studio.guides.send("setStyle", { property: property, value: value }); },
    showBoxModel: function () { Studio.guides.send("showBoxModel"); },
    hideBoxModel: function () { Studio.guides.send("hideBoxModel"); },
    requestSelectedStyle: function () { Studio.guides.send("getSelectedStyle"); },
    align: function (mode) { Studio.guides.send("align", { mode: mode }); },
    setMultiSelectMode: function (on) { Studio.guides.send("setMultiSelectMode", { value: on }); },
    applyValue: function (selector, property, value) { Studio.guides.send("applyValue", { selector: selector, property: property, value: value }); }
  };

  // Listen for messages coming FROM the injected overlay inside the iframe.
  window.addEventListener("message", function (e) {
    var msg = e.data;
    if (!msg || !msg.__studio) return;
    if (msg.type === "select") {
      Studio.S.selected = msg.el ? { selector: msg.el.selector, tag: msg.el.tag, classes: msg.el.classes, text: msg.el.text, attrs: msg.el.attrs, rect: msg.rect, computed: msg.computed } : null;
      Studio.S.selection = msg.multi || [];
      Studio.S.locateCandidates = [];
      if (Studio.onSelectionChanged) Studio.onSelectionChanged();
    } else if (msg.type === "change") {
      Studio.recordChange({
        selector: msg.selector,
        el: msg.el || null,
        property: msg.property,
        from: msg.from,
        to: msg.to
      });
      if (Studio.S.selected && Studio.S.selected.selector === msg.selector) {
        if (msg.property === "position-offset") {
          Studio.S.selected.leftFlow = !!msg.leftFlow;
          Studio.S.selected.parentLayout = msg.parentLayout;
        }
        Studio.guides.requestSelectedStyle();
      }
    } else if (msg.type === "selectedStyle") {
      if (Studio.S.selected) {
        Studio.S.selected.computed = msg.computed;
        Studio.S.selected.rect = msg.rect;
        if (Studio.onSelectionChanged) Studio.onSelectionChanged();
      }
    } else if (msg.type === "ready") {
      if (Studio.onOverlayReady) Studio.onOverlayReady();
    } else if (msg.type === "undo") {
      Studio.undo();
    } else if (msg.type === "redo") {
      Studio.redo();
    }
  });
})();
