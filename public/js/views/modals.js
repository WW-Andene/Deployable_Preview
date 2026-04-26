// views/modals.js — thin dispatcher (R5).
//
// The 7 modals (edit, log, APK, share, history, diff, errors) each
// live in their own file under modals/ and register themselves on
// DV._modal.<name>. This file just calls each render(app) in order;
// each one is a no-op when its S.*Modal slot is null.
//
// Index.html loads modals/_base.js + 7 individual modal files BEFORE
// this dispatcher.

(function () {
"use strict";

DV.views.modals = function (app) {
  if (!DV._modal) return; // base helpers not loaded — should never happen
  if (DV._modal.edit)    DV._modal.edit(app);
  if (DV._modal.log)     DV._modal.log(app);
  if (DV._modal.apk)     DV._modal.apk(app);
  if (DV._modal.share)   DV._modal.share(app);
  if (DV._modal.history) DV._modal.history(app);
  if (DV._modal.diff)    DV._modal.diff(app);
  if (DV._modal.errors)  DV._modal.errors(app);
  // Restore pre-modal focus when the active modal has just closed.
  if (DV._modal.reconcile) DV._modal.reconcile();
};

})();
