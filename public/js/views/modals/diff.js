// modals/diff.js — extracted from monolith via R5.
// Renders into the supplied app element when S.diffModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.diff = function render(app) {
  /* ═══════════════ Visual diff slider ═══════════════ */
  // Two thumbnails stacked: "before" full-width, "after" clipped to a
  // user-controlled width via inset(). Slider drags the clip edge.
  // Plus a toggle to overlay the pixel-diff heatmap.
  if (S.diffModal) {
    var dm = S.diffModal;
    var dbg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === dbg) { S.diffModal = null; DV.render(); } } } });
    var dbox = el("div", { c: "modal modal-diff", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-diff-title" } });
    dbox.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-diff-title" } }, "Visual diff — " + dm.owner + "/" + dm.repo + " · " + dm.slug));

    var pct = (dm.diff && typeof dm.diff.percent === "number") ? dm.diff.percent : 0;
    dbox.appendChild(el("div", { c: "color-tx2 text-12 mb-12" }, "Pixel change: " + pct.toFixed(2) + "%"));

    var thumbBase = "/api/thumb/" + dm.owner + "/" + dm.repo + "?slug=" + encodeURIComponent(dm.slug);
    var diffBase  = "/api/thumb-diff/" + dm.owner + "/" + dm.repo + "?slug=" + encodeURIComponent(dm.slug);
    var t = encodeURIComponent(dm.thumbAt || Date.now());
    // The "after" image is the current thumb. We don't have a stored
    // "before" — so we composite the diff heatmap as the second layer
    // (which reveals only the changed regions). It's a richer signal
    // than a stale before-thumb anyway.
    var stage = el("div", { c: "diff-stage" });
    var imgAfter = document.createElement("img");
    imgAfter.src = thumbBase + "&t=" + t;
    imgAfter.alt = "After build";
    imgAfter.className = "diff-img diff-img-after";
    stage.appendChild(imgAfter);

    var imgDiff = document.createElement("img");
    imgDiff.src = diffBase + "&t=" + t;
    imgDiff.alt = "Pixel-diff heatmap";
    imgDiff.className = "diff-img diff-img-overlay";
    imgDiff.style.clipPath = "inset(0 50% 0 0)";  // initial: half-half
    stage.appendChild(imgDiff);

    var handle = el("div", { c: "diff-handle", attr: { role: "slider", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50", tabindex: "0", "aria-label": "Diff slider" } });
    handle.style.left = "50%";
    stage.appendChild(handle);
    dbox.appendChild(stage);

    function setSlider(pct01) {
      var p = Math.max(0, Math.min(1, pct01));
      imgDiff.style.clipPath = "inset(0 " + Math.round((1 - p) * 100) + "% 0 0)";
      handle.style.left = Math.round(p * 100) + "%";
      handle.setAttribute("aria-valuenow", Math.round(p * 100));
    }
    function onPointer(ev) {
      var rect = stage.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      setSlider(x / rect.width);
    }
    var dragging = false;
    stage.addEventListener("pointerdown", function(ev) { dragging = true; onPointer(ev); });
    document.addEventListener("pointermove", function(ev) { if (dragging) onPointer(ev); });
    document.addEventListener("pointerup", function() { dragging = false; });
    handle.addEventListener("keydown", function(ev) {
      var step = ev.shiftKey ? 0.10 : 0.02;
      if (ev.key === "ArrowLeft")  { ev.preventDefault(); setSlider(parseFloat(handle.style.left) / 100 - step); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); setSlider(parseFloat(handle.style.left) / 100 + step); }
      if (ev.key === "Home")       { ev.preventDefault(); setSlider(0); }
      if (ev.key === "End")        { ev.preventDefault(); setSlider(1); }
    });

    dbox.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg flex-1", on: { click: function() { S.diffModal = null; DV.render(); } } }, "Close")
    ]));
    dbg.appendChild(dbox);
    app.appendChild(dbg);
    focusTrap(dbox, "diff");
  }

};
})();
