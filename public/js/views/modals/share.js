// modals/share.js — extracted from monolith via R5.
// Renders into the supplied app element when S.shareModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.share = function render(app) {
  /* ═══════════════ Share modal ═══════════════ */
  // Renders a QR code + URL + copy button. Triggered by DV.openShare(url).
  // On mobile DV.openShare prefers navigator.share() first; this modal is
  // the desktop fallback (and also the mobile fallback if the user
  // cancels the system sheet).
  if (S.shareModal) {
    var sm = S.shareModal;
    var sg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === sg) { S.shareModal = null; DV.render(); } } } });
    var sb = el("div", { c: "modal modal-share", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-share-title" } });
    sb.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-share-title" } }, "Share preview"));
    if (sm.title) sb.appendChild(el("div", { c: "color-tx2 text-13 mb-12" }, sm.title));

    // QR code (best-effort — only if DV.qr loaded)
    var qrWrap = el("div", { c: "share-qr-wrap" });
    if (window.DV && DV.qr) {
      try {
        qrWrap.innerHTML = DV.qr.renderSVG(sm.url, { cell: 5, margin: 2, dark: "#e6e1d5", light: "#0f1117", attrs: 'class="share-qr"' });
      } catch (e) {
        qrWrap.appendChild(el("div", { c: "color-err text-12" }, "QR generation failed: " + e.message));
      }
    } else {
      qrWrap.appendChild(el("div", { c: "color-tx3 text-12" }, "QR library not loaded"));
    }
    sb.appendChild(qrWrap);

    // URL input (selectable)
    var urlInp = document.createElement("input");
    urlInp.className = "share-url-input";
    urlInp.value = sm.url;
    urlInp.readOnly = true;
    urlInp.setAttribute("aria-label", "Share URL");
    urlInp.addEventListener("focus", function() { this.select(); });
    sb.appendChild(urlInp);

    // Action row
    var copyBtn = el("button", { c: "bp", on: { click: function() {
      function done() { copyBtn.textContent = "Copied ✓"; setTimeout(function(){ copyBtn.textContent = "Copy URL"; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sm.url).then(done, function(){
          urlInp.select(); document.execCommand && document.execCommand("copy"); done();
        });
      } else {
        urlInp.select(); document.execCommand && document.execCommand("copy"); done();
      }
    } } }, "Copy URL");

    var openBtn = el("a", { c: "bg", attr: { href: sm.url, target: "_blank", rel: "noopener" } }, "Open ↗");

    var nativeShareBtn = null;
    if (navigator.share) {
      nativeShareBtn = el("button", { c: "bg", on: { click: function() {
        navigator.share({ title: sm.title || "DeployView preview", url: sm.url }).catch(function(){});
      } } }, "Share via…");
    }

    var closeBtn = el("button", { c: "bg", on: { click: function() { S.shareModal = null; DV.render(); } } }, "Close");

    var btnRow = el("div", { c: "btn-row share-btn-row" });
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(openBtn);
    if (nativeShareBtn) btnRow.appendChild(nativeShareBtn);
    btnRow.appendChild(closeBtn);
    sb.appendChild(btnRow);

    sg.appendChild(sb);
    app.appendChild(sg);
    focusTrap(sb);
  }

};
})();
