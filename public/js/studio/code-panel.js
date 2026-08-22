(function () {
  "use strict";
  window.Studio = window.Studio || {};

  var treeCache = null;

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

  Studio.openInCodePanel = function (relPath, line) {
    Studio.S.activePanel = "code";
    if (Studio.onPanelChanged) Studio.onPanelChanged();
    Studio.api.readFile(relPath).then(function (res) {
      if (res.error) { Studio.toast(res.error, true); return; }
      Studio.S.codeFile = { path: res.path, content: res.content, sha256: res.sha256, gotoLine: line || null };
      if (Studio.onCodeFileChanged) Studio.onCodeFileChanged();
    });
  };

  Studio.renderCodePanel = function (root) {
    root.innerHTML = "";
    var top = h("div", { class: "st-code-top" });

    var fileSelect = document.createElement("select");
    fileSelect.className = "st-file-select";
    fileSelect.appendChild(h("option", { value: "", text: "Choose a file…" }));
    if (treeCache) fillFileSelect(fileSelect);
    else {
      Studio.api.tree().then(function (res) {
        treeCache = res.files || [];
        fillFileSelect(fileSelect);
      });
    }
    fileSelect.addEventListener("change", function () {
      if (fileSelect.value) Studio.openInCodePanel(fileSelect.value);
    });
    top.appendChild(fileSelect);

    var saveBtn = h("button", { class: "st-btn-sm", text: "Save & rebuild" });
    saveBtn.addEventListener("click", saveAndRebuild);
    top.appendChild(saveBtn);
    root.appendChild(top);

    if (!Studio.S.codeFile) {
      root.appendChild(h("div", { class: "st-empty", text: "Pick a file above, or click \u201cFind in source files\u201d in the Inspect tab." }));
      return;
    }

    var editorWrap = h("div", { class: "st-editor-wrap" });
    var textarea = document.createElement("textarea");
    textarea.className = "st-editor";
    textarea.spellcheck = false;
    textarea.value = Studio.S.codeFile.content;
    textarea.addEventListener("input", function () { Studio.S.codeFile.dirty = true; });
    editorWrap.appendChild(textarea);
    root.appendChild(editorWrap);

    if (Studio.S.codeFile.gotoLine) {
      requestAnimationFrame(function () {
        var lines = textarea.value.split("\n");
        var pos = 0;
        for (var i = 0; i < Studio.S.codeFile.gotoLine - 1 && i < lines.length; i++) pos += lines[i].length + 1;
        textarea.focus();
        textarea.setSelectionRange(pos, pos + (lines[Studio.S.codeFile.gotoLine - 1] || "").length);
        var lineHeight = 20;
        textarea.scrollTop = Math.max(0, (Studio.S.codeFile.gotoLine - 5) * lineHeight);
      });
    }

    var hint = h("div", { class: "st-hint" }, [
      document.createTextNode("Editing " + Studio.S.codeFile.path + ". Saving writes the file and triggers a rebuild — the preview reloads automatically when the rebuild finishes.")
    ]);
    root.appendChild(hint);

    function saveAndRebuild() {
      var newContent = textarea.value;
      saveBtn.textContent = "Saving…";
      saveBtn.disabled = true;
      Studio.api.writeFile(Studio.S.codeFile.path, newContent, Studio.S.codeFile.sha256).then(function (res) {
        if (res.error) {
          Studio.toast(res.error, true);
          saveBtn.textContent = "Save & rebuild"; saveBtn.disabled = false;
          return;
        }
        Studio.S.codeFile.sha256 = res.sha256;
        Studio.S.codeFile.content = newContent;
        Studio.S.codeFile.dirty = false;
        Studio.recordChange({ sourceFile: Studio.S.codeFile.path, property: "source-edit", note: "Manual code edit" });
        saveBtn.textContent = "Rebuilding…";
        Studio.api.rebuild().then(function () {
          Studio.toast("Rebuild started — preview will refresh shortly.");
          Studio.pollRebuildThenReload();
          saveBtn.textContent = "Save & rebuild"; saveBtn.disabled = false;
        });
      });
    }
  };

  function fillFileSelect(select) {
    treeCache.forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f; opt.textContent = f;
      if (Studio.S.codeFile && Studio.S.codeFile.path === f) opt.selected = true;
      select.appendChild(opt);
    });
  }
})();
