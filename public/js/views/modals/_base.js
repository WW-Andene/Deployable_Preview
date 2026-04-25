// modals/_base.js — escape-key handler + focus-trap shared by every modal.
//
// Exposes DV._modal = { focusTrap }. Each modal file calls focusTrap(root)
// after appending its DOM. The Escape handler is wired once on first load
// and clears whichever S.*Modal is open (in priority order).

(function () {
"use strict";

var S = DV.S;

// Escape closes whichever modal is open, in priority order. Multiple
// modals shouldn't be open at once, but if they are we close all so
// nothing is left dangling.
if (!DV._modal_escape_bound) {
  DV._modal_escape_bound = true;
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var changed = false;
    if (S.apkModal)     { S.apkModal     = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } changed = true; }
    if (S.logModal)     { S.logModal     = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } changed = true; }
    if (S.editModal)    { S.editModal    = null; changed = true; }
    if (S.shareModal)   { S.shareModal   = null; changed = true; }
    if (S.historyModal) { S.historyModal = null; changed = true; }
    if (S.diffModal)    { S.diffModal    = null; changed = true; }
    if (S.errorsModal)  { S.errorsModal  = null; changed = true; }
    if (changed) DV.render();
  });
}

// G1-004 / G3-002: real focus trap. Records the element that had focus
// before the modal opened, focuses the first interactive child, and on
// Tab cycles within the modal so keyboard users can't escape into the
// background. Returns a cleanup function that restores prior focus.
var _modalRestoreStack = [];
function focusTrap(root) {
  var prevFocus = document.activeElement;
  function focusables() {
    return Array.prototype.slice.call(root.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ));
  }
  setTimeout(function () {
    var fs = focusables();
    if (fs.length) fs[0].focus();
  }, 0);
  function trap(e) {
    if (e.key !== "Tab") return;
    var fs = focusables();
    if (!fs.length) return;
    var first = fs[0], last = fs[fs.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  root.addEventListener("keydown", trap);
  _modalRestoreStack.push(function () {
    root.removeEventListener("keydown", trap);
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus(); } catch (_) {}
    }
  });
}

function flushModalRestores() {
  while (_modalRestoreStack.length) {
    var fn = _modalRestoreStack.pop();
    try { fn(); } catch (_) {}
  }
}

DV._modal = { focusTrap: focusTrap, flushRestores: flushModalRestores };
DV._flushModalRestores = flushModalRestores; // backward-compat
})();
