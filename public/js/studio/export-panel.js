(function () {
  "use strict";
  window.Studio = window.Studio || {};

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

  Studio.renderChangeLog = function (root) {
    root.innerHTML = "";
    var changes = Studio.S.changes;

    var header = h("div", { class: "st-changelog-header" }, [
      h("span", { text: changes.length + " change" + (changes.length === 1 ? "" : "s") }),
      (function () {
        var clearBtn = h("button", { class: "st-btn-xs", text: "Clear" });
        clearBtn.addEventListener("click", function () {
          Studio.S.changes = [];
          if (Studio.onChangesUpdated) Studio.onChangesUpdated();
        });
        return clearBtn;
      })()
    ]);
    root.appendChild(header);

    var scrollArea = h("div", { class: "st-changelog-scroll" });
    if (!changes.length) {
      scrollArea.appendChild(h("div", { class: "st-empty", text: "No changes yet. Edits you make in the Inspect or Code tabs appear here." }));
    } else {
      var list = h("div", { class: "st-changelog-list" });
      changes.slice().reverse().forEach(function (c) {
        var row = h("div", { class: "st-changelog-row" });
        var label = c.sourceFile ? c.sourceFile : (c.selector || "(unknown)");
        row.appendChild(h("div", { class: "st-cl-label", text: label }));
        row.appendChild(h("div", { class: "st-cl-detail", text: c.property + (c.to !== undefined ? (": " + JSON.stringify(c.to)) : "") }));
        list.appendChild(row);
      });
      scrollArea.appendChild(list);
    }
    root.appendChild(scrollArea);

    var actions = h("div", { class: "st-changelog-actions" });

    var exportBtn = h("button", { class: "st-btn-sm", text: "Export JSON" });
    exportBtn.addEventListener("click", function () {
      Studio.api.exportChanges(changes).then(function (payload) {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "studio-changes.json";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      });
    });
    actions.appendChild(exportBtn);

    var commitBtn = h("button", { class: "st-btn-sm st-btn-primary", text: "Commit & push…" });
    commitBtn.addEventListener("click", function () { Studio.openCommitDialog(); });
    actions.appendChild(commitBtn);

    root.appendChild(actions);

    root.appendChild(h("div", { class: "st-hint" }, [
      document.createTextNode("Commit & push only sends changes that came from the Code tab (real source-file edits). Visual-only tweaks made in Inspect need \u201cFind in source files\u201d first, or export the JSON and hand it to Claude to apply.")
    ]));
  };

  Studio.openCommitDialog = function () {
    var sourceChanges = Studio.S.changes.filter(function (c) { return c.sourceFile; });
    if (!sourceChanges.length) {
      Studio.toast("No source-file changes to commit yet. Edit code in the Code tab first.", true);
      return;
    }
    var msg = prompt("Commit message:", "Studio: UI adjustments");
    if (!msg) return;
    if (!Studio.S.codeFile) {
      Studio.toast("No file currently loaded to commit.", true);
      return;
    }
    Studio.api.commit(msg, [{ path: Studio.S.codeFile.path, content: Studio.S.codeFile.content }]).then(function (res) {
      if (res.error) { Studio.toast(res.error, true); return; }
      if (res.committed) Studio.toast("Pushed " + res.sha.slice(0, 7) + " to the branch.");
      else Studio.toast(res.message || "Nothing to commit.");
    });
  };
})();
