/**
 * apply-code.js — turns a recorded VISUAL change (drag/resize/style edit
 * made live in the iframe, tracked as inline-style overrides on the real
 * DOM node) into an actual source-file write, so it can go through the
 * existing "Commit & push" flow (which only ever commits changes carrying
 * a `sourceFile`).
 *
 * This is deliberately best-effort, not magic: there is no reliable DOM→
 * source line mapping post-build (see server/routes/api/studio.js header
 * comment). The flow is:
 *   1. Re-locate the element in the source tree via the same best-guess
 *      /locate endpoint the Inspect tab's "Find in source files" uses,
 *      using the element snapshot captured at change time (classes/text/
 *      attrs), not whatever happens to be selected right now.
 *   2. Show the candidate lines and require the user to pick one — never
 *      write blind.
 *   3. Patch just that line: merge the change's CSS property/value into
 *      the tag's existing inline `style="..."` (HTML/Vue) or
 *      `style={{...}}` (JSX) attribute, adding one if there isn't one.
 *   4. Show the before/after line and require explicit confirmation
 *      before writing.
 *   5. Mark the change as applied (sourceFile/sourceLine) so the change
 *      log and the commit dialog treat it like any Code-tab edit.
 */
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

  function toKebab(prop) {
    return String(prop).replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  }

  // Normalizes any recorded change into a flat list of [cssProp, value]
  // pairs (kebab-case), dropping empty/undefined values.
  function changeToStyleEntries(change) {
    var out = [];
    if (change.property === "position-offset") {
      var to = change.to || {};
      if (to.position) out.push(["position", to.position]);
      if (to.left) out.push(["left", to.left]);
      if (to.top) out.push(["top", to.top]);
    } else if (change.property === "size") {
      var to2 = change.to || {};
      if (to2.width) out.push(["width", to2.width]);
      if (to2.height) out.push(["height", to2.height]);
    } else if (change.property && change.to !== undefined && change.to !== null && change.to !== "") {
      out.push([toKebab(change.property), String(change.to)]);
    }
    return out;
  }

  // ── Inline-style patching ────────────────────────────────────────────
  function isJsxFile(path) { return /\.(jsx|tsx)$/i.test(path); }

  // Splits on `delimiter` only at nesting depth 0 (outside quotes and
  // parens) — a naive .split(delimiter) shreds any value that itself
  // contains one, e.g. `rgba(0, 0, 0, .5)` or `"Arial, sans-serif"`.
  function splitTopLevel(str, delimiter) {
    var parts = [];
    var depth = 0, quote = null, start = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (quote) {
        if (ch === quote && str[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      } else if (ch === delimiter && depth === 0) {
        parts.push(str.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(str.slice(start));
    return parts;
  }

  function parseHtmlStyleAttr(str) {
    var pairs = [];
    splitTopLevel(str || "", ";").forEach(function (decl) {
      var idx = decl.indexOf(":");
      if (idx === -1) return;
      var k = decl.slice(0, idx).trim();
      var v = decl.slice(idx + 1).trim();
      if (k) pairs.push([k, v]);
    });
    return pairs;
  }
  function stringifyHtmlStyleAttr(pairs) {
    return pairs.map(function (p) { return p[0] + ": " + p[1] + ";"; }).join(" ");
  }
  function upsert(pairs, key, value) {
    var found = false;
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === key) { pairs[i][1] = value; found = true; break; }
    }
    if (!found) pairs.push([key, value]);
    return pairs;
  }
  function camelCase(prop) {
    return prop.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }
  function parseJsxStyleObj(str) {
    var pairs = [];
    splitTopLevel(str || "", ",").forEach(function (decl) {
      var idx = decl.indexOf(":");
      if (idx === -1) return;
      var k = decl.slice(0, idx).trim();
      var v = decl.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (k) pairs.push([k, v]);
    });
    return pairs;
  }
  function stringifyJsxStyleObj(pairs) {
    return pairs.map(function (p) { return p[0] + ": " + JSON.stringify(String(p[1])); }).join(", ");
  }

  // Patches ONE line of source text, merging styleEntries into that line's
  // tag. Returns the new line, or null if no recognizable opening tag was
  // found (caller should refuse to write in that case).
  function patchLine(line, styleEntries, jsx) {
    if (!/<[A-Za-z][\w.-]*/.test(line)) return null;

    if (jsx) {
      var m = /style=\{\{([^}]*)\}\}/.exec(line);
      if (m) {
        var pairs = parseJsxStyleObj(m[1]);
        styleEntries.forEach(function (e) { upsert(pairs, camelCase(e[0]), e[1]); });
        return line.slice(0, m.index) + "style={{ " + stringifyJsxStyleObj(pairs) + " }}" + line.slice(m.index + m[0].length);
      }
      var tagM = /<([A-Za-z][\w.-]*)/.exec(line);
      if (!tagM) return null;
      var jsxPairs = [];
      styleEntries.forEach(function (e) { upsert(jsxPairs, camelCase(e[0]), e[1]); });
      var insertAt = tagM.index + tagM[0].length;
      return line.slice(0, insertAt) + " style={{ " + stringifyJsxStyleObj(jsxPairs) + " }}" + line.slice(insertAt);
    }

    var hm = /style="([^"]*)"/.exec(line);
    if (hm) {
      var hpairs = parseHtmlStyleAttr(hm[1]);
      styleEntries.forEach(function (e) { upsert(hpairs, e[0], e[1]); });
      return line.slice(0, hm.index) + 'style="' + stringifyHtmlStyleAttr(hpairs) + '"' + line.slice(hm.index + hm[0].length);
    }
    var htagM = /<([A-Za-z][\w.-]*)/.exec(line);
    if (!htagM) return null;
    var newPairs = [];
    styleEntries.forEach(function (e) { upsert(newPairs, e[0], e[1]); });
    var hInsertAt = htagM.index + htagM[0].length;
    return line.slice(0, hInsertAt) + ' style="' + stringifyHtmlStyleAttr(newPairs) + '"' + line.slice(hInsertAt);
  }

  // ── Orchestration ────────────────────────────────────────────────────
  // Renders an inline candidate picker under `mountEl`. Calls back into
  // the change-log render once the change is applied (or the user cancels).
  Studio.applyChangeToCode = function (change, mountEl, onDone) {
    mountEl.innerHTML = "";
    var el = change.el;
    if (!el) {
      mountEl.appendChild(h("div", { class: "st-hint", text: "No element info recorded for this change — cannot locate it in source." }));
      return;
    }
    var styleEntries = changeToStyleEntries(change);
    if (!styleEntries.length) {
      mountEl.appendChild(h("div", { class: "st-hint", text: "Nothing to apply for this change." }));
      return;
    }
    mountEl.appendChild(h("div", { class: "st-hint", text: "Searching source files…" }));
    Studio.api.locate({ classes: el.classes, text: el.text, attrs: el.attrs }).then(function (res) {
      mountEl.innerHTML = "";
      var candidates = res.candidates || [];
      if (!candidates.length) {
        mountEl.appendChild(h("div", { class: "st-hint", text: "No matching source location found. Try “Find in source files” from Inspect after selecting this element, or use Export JSON." }));
        return;
      }
      mountEl.appendChild(h("div", { class: "st-hint", text: "Pick the matching line to patch (adds/updates its inline style):" }));
      var list = h("div", { class: "st-locate-list" });
      candidates.slice(0, 5).forEach(function (cand) {
        var row = h("div", { class: "st-locate-row" });
        row.appendChild(h("span", { class: "st-locate-path", text: cand.path + ":" + cand.line }));
        row.appendChild(h("span", { class: "st-locate-preview", text: cand.preview }));
        var applyBtn = h("button", { class: "st-btn-xs st-btn-primary", text: "Apply here" });
        applyBtn.addEventListener("click", function () { confirmAndApply(cand); });
        row.appendChild(applyBtn);
        list.appendChild(row);
      });
      mountEl.appendChild(list);
      var cancelBtn = h("button", { class: "st-btn-xs", text: "Cancel" });
      cancelBtn.addEventListener("click", function () { mountEl.innerHTML = ""; });
      mountEl.appendChild(cancelBtn);
    });

    function confirmAndApply(cand) {
      Studio.api.readFile(cand.path).then(function (fileRes) {
        if (fileRes.error) { Studio.toast(fileRes.error, true); return; }
        var lines = fileRes.content.split("\n");
        var idx = cand.line - 1;
        if (idx < 0 || idx >= lines.length) { Studio.toast("Line out of range — file may have changed.", true); return; }
        var before = lines[idx];
        var patched = patchLine(before, styleEntries, isJsxFile(cand.path));
        if (patched === null) {
          Studio.toast("Could not find a tag to patch on that line.", true);
          return;
        }
        var ok = window.confirm(
          "Apply to " + cand.path + ":" + cand.line + "?\n\n" +
          "Before:\n" + before.trim() + "\n\n" +
          "After:\n" + patched.trim()
        );
        if (!ok) return;
        lines[idx] = patched;
        var newContent = lines.join("\n");
        Studio.api.writeFile(cand.path, newContent, fileRes.sha256).then(function (writeRes) {
          if (writeRes.error) { Studio.toast(writeRes.error, true); return; }
          change.sourceFile = cand.path;
          change.sourceLine = cand.line;
          change.appliedAt = Date.now();
          Studio.S.codeFile = { path: cand.path, content: newContent, sha256: writeRes.sha256 };
          Studio.toast("Applied to " + cand.path + ":" + cand.line + ". Rebuild to see it live.");
          mountEl.innerHTML = "";
          if (onDone) onDone();
          if (Studio.onChangesUpdated) Studio.onChangesUpdated();
        });
      });
    }
  };
})();
