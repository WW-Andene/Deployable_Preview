/**
 * undo.js — Ctrl/Cmd+Z undo/redo over Studio.S.changes.
 *
 * Treats the change log itself as the undo stack: undo pops the most
 * recent change and re-applies its `from` value to the live element;
 * redo pushes it back and re-applies `to`. This keeps a single source of
 * truth (S.changes) instead of a parallel history structure, matching
 * how the change log/commit/apply-to-code flow already reads it.
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

  Studio.undo = function () {
    var changes = Studio.S.changes;
    if (!changes.length) { Studio.toast("Nothing to undo."); return; }
    var c = changes.pop();
    Studio.S.undoneStack.push(c);
    if (c.property === "duplicate") {
      // Undoing a duplication removes the clone it created — there's no
      // style value to revert.
      Studio.guides.removeElement(c.to.selector);
    } else {
      Studio.guides.applyValue(c.selector, c.property, valueFor(c, "from"));
    }
    if (c.sourceFile) Studio.toast("Reverted in preview only — " + c.sourceFile + " on disk still has this change.", true);
    else Studio.toast("Undid: " + c.property);
    if (Studio.S.selected && Studio.S.selected.selector === c.selector) Studio.guides.requestSelectedStyle();
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };

  Studio.redo = function () {
    var stack = Studio.S.undoneStack;
    if (!stack.length) { Studio.toast("Nothing to redo."); return; }
    var c = stack.pop();
    Studio.S.changes.push(c);
    if (c.property === "duplicate") {
      // Recreates the clone from the original element rather than
      // reverting a style — see redoDuplicate in injected-overlay.js.
      Studio.guides.redoDuplicate(c.from.selector);
    } else {
      Studio.guides.applyValue(c.selector, c.property, valueFor(c, "to"));
    }
    Studio.toast("Redid: " + c.property);
    if (Studio.S.selected && Studio.S.selected.selector === c.selector) Studio.guides.requestSelectedStyle();
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };
})();
