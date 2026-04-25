// modals/errors.js — extracted from monolith via R5.
// Renders into the supplied app element when S.errorsModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.errors = function render(app) {
  /* ═══════════════ Runtime-errors modal (J3) ═══════════════ */
  if (S.errorsModal) {
    var em = S.errorsModal;
    var ebg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === ebg) { S.errorsModal = null; DV.render(); } } } });
    var ebox = el("div", { c: "modal modal-errors", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-errors-title" } });
    ebox.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-errors-title" } }, "Runtime errors — " + em.owner + "/" + em.repo + " · " + em.slug));
    if (em.loading) {
      ebox.appendChild(DV.skeleton ? DV.skeleton.rows(3) : el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));
    } else if (!em.errors.length) {
      ebox.appendChild(DV.emptyState({
        icon: "✓",
        title: "No runtime errors captured",
        sub: "DV's preview proxy injects an error collector into every HTML response. Open the preview and trigger an error to see it here."
      }));
    } else {
      var elist = el("div", { c: "errors-list" });
      for (var ei = 0; ei < em.errors.length; ei++) {
        (function(err) {
          var card = el("div", { c: "errors-row" });
          card.appendChild(el("div", { c: "errors-msg" }, err.msg || "<no message>"));
          var meta = [];
          if (err.file) meta.push(el("span", { c: "color-tx3 text-11 font-mono" }, err.file + (err.line ? ":" + err.line + (err.col ? ":" + err.col : "") : "")));
          meta.push(el("span", { c: "pill pill-warn" }, err.count + "×"));
          meta.push(el("span", { c: "color-tx3 text-11" }, "first " + new Date(err.firstAt).toLocaleString() + " · last " + new Date(err.lastAt).toLocaleString()));
          card.appendChild(el("div", { c: "errors-meta" }, meta));
          if (err.stack) {
            var det = document.createElement("details");
            var sum = document.createElement("summary");
            sum.textContent = "Stack trace";
            sum.className = "color-tx2 text-11";
            det.appendChild(sum);
            var pre = document.createElement("pre");
            pre.className = "errors-stack font-mono text-11";
            pre.textContent = err.stack;
            det.appendChild(pre);
            card.appendChild(det);
          }
          elist.appendChild(card);
        })(em.errors[ei]);
      }
      ebox.appendChild(elist);
    }
    ebox.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bd flex-1", on: { click: function() {
        if (!confirm("Clear all errors for this branch?")) return;
        fetch("/api/preview-errors/" + em.owner + "/" + em.repo + "/" + encodeURIComponent(em.slug), { method: "DELETE" })
          .then(function(){ S.errorsModal = null; if (S._previewErrorCounts) delete S._previewErrorCounts[em.owner+"/"+em.repo+":"+em.slug]; DV.render(); });
      } } }, "Clear all"),
      el("button", { c: "bg flex-1", on: { click: function() { S.errorsModal = null; DV.render(); } } }, "Close")
    ]));
    ebg.appendChild(ebox);
    app.appendChild(ebg);
    focusTrap(ebox);
  }
};
})();
