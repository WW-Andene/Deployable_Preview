/**
 * undo.js — Ctrl/Cmd+Z undo/redo over Studio.S.changes.
 *
 * Treats the change log itself as the undo stack: undo pops the most
 * recent change and re-applies its `from` value to the live element;
 * redo pushes it back and re-applies `to`. This keeps a single source of
 * truth (S.changes) instead of a parallel history structure, matching
 * how the change log/commit/apply-to-code flow already reads it.
 *
 * A single user action can produce several change entries at once — align/
 * distribute moves every selected element, duplicating a multi-selection
 * clones each of them. Those entries carry a shared `groupId` (set by
 * injected-overlay.js), and popGroup() below pops/pushes every consecutive
 * entry sharing it as one atomic undo/redo step, so Ctrl/Cmd+Z reverts the
 * whole action rather than just the last element it touched.
 *
 * A change already applied to source (change.sourceFile set) can still be
 * undone — the live preview reverts, but the on-disk file it was written
 * to does not automatically change back, since that's a separate,
 * deliberate write. The user is warned when that happens.
 */
(function () {
  "use strict";
  window.Studio = window.Studio || {};

  function valueFor(change, key) {
    var v = change[key];
    if (change.property === "position-offset" || change.property === "size") return v || {};
    return v;
  }

  // Pops the most recent entry off `stack`, plus every entry immediately
  // below it that shares its groupId (entries without a groupId are
  // always solo). Returns them most-recent-first.
  function popGroup(stack) {
    if (!stack.length) return [];
    var last = stack.pop();
    var batch = [last];
    while (last.groupId && stack.length && stack[stack.length - 1].groupId === last.groupId) {
      batch.push(stack.pop());
    }
    return batch;
  }

  function applyOne(c, key) {
    if (c.property === "duplicate") {
      if (key === "from") {
        // Undoing a duplication removes the clone it created — there's
        // no style value to revert.
        Studio.guides.removeElement(c.to.selector);
      } else {
        // Recreates the clone from the original element rather than
        // reverting a style — see redoDuplicate in injected-overlay.js.
        Studio.guides.redoDuplicate(c.from.selector);
      }
    } else {
      Studio.guides.applyValue(c.selector, c.property, valueFor(c, key));
    }
  }

  Studio.undo = function () {
    var batch = popGroup(Studio.S.changes);
    if (!batch.length) { Studio.toast("Nothing to undo."); return; }
    // Push onto undoneStack in chronological order (reverse of pop order)
    // so a later redo() can popGroup() it back off in this same shape.
    batch.slice().reverse().forEach(function (c) { Studio.S.undoneStack.push(c); });
    batch.forEach(function (c) { applyOne(c, "from"); });
    var appliedToSource = batch.some(function (c) { return c.sourceFile; });
    if (appliedToSource) Studio.toast("Reverted in preview only — the on-disk file(s) still have this change.", true);
    else Studio.toast(batch.length > 1 ? "Undid " + batch.length + " changes." : "Undid: " + batch[0].property);
    var last = batch[0];
    if (Studio.S.selected && Studio.S.selected.selector === last.selector) Studio.guides.requestSelectedStyle();
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };

  Studio.redo = function () {
    var batch = popGroup(Studio.S.undoneStack);
    if (!batch.length) { Studio.toast("Nothing to redo."); return; }
    batch.slice().reverse().forEach(function (c) { Studio.S.changes.push(c); });
    batch.forEach(function (c) { applyOne(c, "to"); });
    Studio.toast(batch.length > 1 ? "Redid " + batch.length + " changes." : "Redid: " + batch[0].property);
    var last = batch[0];
    if (Studio.S.selected && Studio.S.selected.selector === last.selector) Studio.guides.requestSelectedStyle();
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };
})();
