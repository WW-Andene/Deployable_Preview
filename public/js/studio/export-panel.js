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
      h("div", { class: "st-cl-header-actions" }, [
        (function () {
          var undoBtn = h("button", { class: "st-btn-xs", text: "↶ Undo" });
          undoBtn.disabled = !changes.length;
          undoBtn.title = "Ctrl/Cmd+Z";
          undoBtn.addEventListener("click", function () { Studio.undo(); });
          return undoBtn;
        })(),
        (function () {
          var redoBtn = h("button", { class: "st-btn-xs", text: "↷ Redo" });
          redoBtn.disabled = !Studio.S.undoneStack.length;
          redoBtn.title = "Ctrl/Cmd+Shift+Z";
          redoBtn.addEventListener("click", function () { Studio.redo(); });
          return redoBtn;
        })(),
        (function () {
          var clearBtn = h("button", { class: "st-btn-xs", text: "Clear" });
          clearBtn.addEventListener("click", function () {
            Studio.S.changes = [];
            Studio.S.undoneStack = [];
            if (Studio.onChangesUpdated) Studio.onChangesUpdated();
          });
          return clearBtn;
        })()
      ])
    ]);
    root.appendChild(header);

    var scrollArea = h("div", { class: "st-changelog-scroll" });
    if (!changes.length) {
      scrollArea.appendChild(h("div", { class: "st-empty", text: "No changes yet. Edits you make in the Inspect or Code tabs appear here." }));
    } else {
      var list = h("div", { class: "st-changelog-list" });
      changes.slice().reverse().forEach(function (c) {
        var row = h("div", { class: "st-changelog-row" });
        var label = c.sourceFile ? (c.sourceFile + ":" + c.sourceLine) : (c.selector || "(unknown)");
        row.appendChild(h("div", { class: "st-cl-label", text: label }));
        var detail = c.property === "duplicate"
          ? "Duplicated from " + (c.from && c.from.selector || "?")
          : c.property + (c.to !== undefined ? (": " + JSON.stringify(c.to)) : "");
        row.appendChild(h("div", { class: "st-cl-detail", text: detail }));
        if (c.property === "duplicate") {
          row.appendChild(h("div", { class: "st-hint", text: "Duplication is a visual-only change for now — apply it to code by hand, or export JSON." }));
        } else if (!c.sourceFile && c.el) {
          var applyRow = h("div", { class: "st-cl-apply" });
          var applyBtn = h("button", { class: "st-btn-xs", text: "Apply to code…" });
          var mount = h("div", { class: "st-cl-apply-mount" });
          applyBtn.addEventListener("click", function () {
            Studio.applyChangeToCode(c, mount, function () { Studio.renderChangeLog(root); });
          });
          applyRow.appendChild(applyBtn);
          row.appendChild(applyRow);
          row.appendChild(mount);
        } else if (c.sourceFile) {
          row.appendChild(h("div", { class: "st-hint", text: "✓ Applied to source — will be included in Commit & push." }));
        }
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
      document.createTextNode("Commit & push sends real source-file edits: Code-tab saves, and visual changes you\u2019ve applied via \u201cApply to code\u2026\u201d below. Anything still unapplied is visual-only and won\u2019t be included \u2014 export the JSON and hand it to Claude if you\u2019d rather apply it that way.")
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
