// modals/_base.js — escape-key handler + focus-trap shared by every modal.
//
// Exposes DV._modal = { focusTrap, reconcile }. Each modal file calls
// focusTrap(root, slot) after appending its DOM, where slot is one of
// "edit"/"log"/"apk"/"share"/"history"/"diff"/"errors". The slot key is
// used to distinguish a fresh modal open from a within-modal re-render
// so we don't re-seed focus (and steal it from whatever input the user
// just touched) on every keystroke.
//
// reconcile() is called by the modals dispatcher AFTER all modal
// renderers have run; if no S.*Modal slot is open but a trap was active,
// it restores focus to the element that had it before the modal opened.

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

// Single-slot trap state. Holds the slot key currently trapped and the
// element that had focus before the modal was opened, so we can restore
// it on close.
var _activeSlot = null;
var _restoreFocus = null;

function focusables(root) {
  return Array.prototype.slice.call(root.querySelectorAll(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  ));
}

function focusTrap(root, slot) {
  // Tab cycles within the modal so keyboard users can't escape into the
  // background. Bound on every render — root is fresh DOM each time.
  root.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var fs = focusables(root);
    if (!fs.length) return;
    var first = fs[0], last = fs[fs.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // If this is a re-render of the modal that's already trapped, do NOT
  // re-seed focus — that would steal focus from whatever input/chip the
  // user just interacted with on this very render.
  if (slot && _activeSlot === slot) return;

  // Fresh open — capture the previously-focused element so we can
  // restore it when the modal closes, then move focus to the modal.
  _restoreFocus = document.activeElement;
  _activeSlot = slot || "_anon";
  setTimeout(function () {
    var fs = focusables(root);
    if (fs.length) fs[0].focus();
  }, 0);
}

// Map of slot → "is this modal open right now?" predicate.
var _slotOpen = {
  edit:    function () { return !!S.editModal; },
  log:     function () { return !!S.logModal; },
  apk:     function () { return !!S.apkModal; },
  share:   function () { return !!S.shareModal; },
  history: function () { return !!S.historyModal; },
  diff:    function () { return !!S.diffModal; },
  errors:  function () { return !!S.errorsModal; }
};

// Called by the modals dispatcher after all modal renderers have run.
// If the previously-trapped slot is no longer open, restore the
// pre-modal focus and clear trap state.
function reconcile() {
  if (!_activeSlot) return;
  var stillOpen = _slotOpen[_activeSlot] && _slotOpen[_activeSlot]();
  if (stillOpen) return;
  var fn = _restoreFocus;
  _restoreFocus = null;
  _activeSlot = null;
  if (fn && typeof fn.focus === "function") {
    try { fn.focus(); } catch (_) {}
  }
}

DV._modal = { focusTrap: focusTrap, reconcile: reconcile };
})();
