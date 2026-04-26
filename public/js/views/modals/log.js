// modals/log.js — extracted from monolith via R5.
// Renders into the supplied app element when S.logModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.log = function render(app) {
  /* ═══════════════ Live-log modal ═══════════════ */
  if (S.logModal) {
    var lm = S.logModal;
    // Strip ANSI escape sequences so colour codes don't leak into the text.
    var ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
    function stripAnsi(s) { return String(s).replace(ANSI_RE, ""); }
    // Collapse runs of \r (carriage-return progress bars from npm/pip) — keep only the last line of each burst.
    function collapseCR(s) { return String(s).replace(/\r([^\n])/g, "\n$1"); }

    // Auto-scroll is re-enabled only when the user scrolls to the bottom.
    // Disengaged as soon as they scroll up — prevents fighting the reader.
    var autoScroll = true;
    var userDisengaged = false;

    var bg2 = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === bg2) { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } } });
    var box2 = el("div", { c: "modal modal-log", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-log-title" } });
    box2.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-log-title" } }, "Log: " + lm.slug));

    var logDiv = el("div", { c: "live-log", attr: { id: "live-log-content" } }, "Loading...");
    // Track scroll engagement so SSE doesn't yank the view out from under the user.
    logDiv.addEventListener("scroll", function() {
      var atBottom = (logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight) < 24;
      if (atBottom) { userDisengaged = false; autoScrollCb.checked = true; autoScroll = true; }
      else { userDisengaged = true; autoScroll = false; autoScrollCb.checked = false; }
    });

    // Filter input — hide lines that don't match
    var filterInp = document.createElement("input");
    filterInp.placeholder = "Filter (substring)";
    filterInp.addEventListener("input", function() { applyFilter(); });
    function applyFilter() {
      var q = (filterInp.value || "").toLowerCase();
      // Work from full cache, not the rendered DOM
      var lines = logDiv._full ? logDiv._full.split("\n") : logDiv.textContent.split("\n");
      logDiv.textContent = q ? lines.filter(function(l){ return l.toLowerCase().indexOf(q) !== -1; }).join("\n") : lines.join("\n");
      if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight;
    }

    var autoScrollCb = document.createElement("input");
    autoScrollCb.type = "checkbox"; autoScrollCb.checked = true;
    autoScrollCb.addEventListener("change", function() { autoScroll = autoScrollCb.checked; userDisengaged = !autoScroll; if (autoScroll) logDiv.scrollTop = logDiv.scrollHeight; });

    var wrapCb = document.createElement("input");
    wrapCb.type = "checkbox"; wrapCb.checked = true;
    wrapCb.addEventListener("change", function() {
      if (wrapCb.checked) logDiv.classList.remove("no-wrap");
      else logDiv.classList.add("no-wrap");
    });

    var ansiCb = document.createElement("input");
    ansiCb.type = "checkbox"; ansiCb.checked = true;
    ansiCb.addEventListener("change", function() {
      // Re-render from raw cache with new setting
      if (logDiv._raw != null) {
        logDiv._full = ansiCb.checked ? stripAnsi(logDiv._raw) : logDiv._raw;
        applyFilter();
      }
    });

    var toolbar = el("div", { c: "log-toolbar" }, [
      filterInp,
      el("button", { c: "bg", on: { click: function() { logDiv._raw = ""; logDiv._full = ""; logDiv.textContent = ""; } } }, "Clear"),
      el("label", {}, [autoScrollCb, "Auto-scroll"]),
      el("label", {}, [wrapCb, "Wrap"]),
      el("label", {}, [ansiCb, "Strip ANSI"])
    ]);
    box2.appendChild(toolbar);
    box2.appendChild(logDiv);

    box2.appendChild(el("div", { c: "btn-row-sm" }, [
      el("button", { c: "bg", on: { click: function() { S.logModal = null; if (S._logSSE) { S._logSSE.close(); S._logSSE = null; } DV.render(); } } }, "Close"),
      el("button", { c: "bg", on: { click: function() {
        var text = logDiv.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(function() { DV.showToast && DV.showToast("Log copied", "info"); })
            .catch(function() { DV.showToast && DV.showToast("Copy failed", "error"); });
        } else {
          DV.showToast && DV.showToast("Clipboard unavailable", "error");
        }
      } } }, "Copy")
    ]));
    bg2.appendChild(box2);
    app.appendChild(bg2);
    focusTrap(bg2, "log");

    function appendChunk(chunk) {
      var processed = collapseCR(chunk);
      logDiv._raw = (logDiv._raw || "") + processed;
      // Cap retained size at 2 MB — drop oldest if exceeded
      if (logDiv._raw.length > 2 * 1024 * 1024) logDiv._raw = logDiv._raw.slice(-2 * 1024 * 1024);
      logDiv._full = ansiCb.checked ? stripAnsi(logDiv._raw) : logDiv._raw;
      // Cheap incremental render: append, then re-filter only if a filter is set
      if (!filterInp.value) {
        // Fast path: just append the processed chunk to DOM text
        logDiv.textContent = logDiv._full;
      } else {
        applyFilter();
      }
      if (autoScroll && !userDisengaged) logDiv.scrollTop = logDiv.scrollHeight;
    }

    fetch("/api/log/" + lm.owner + "/" + lm.repo + "?slug=" + encodeURIComponent(lm.slug))
      .then(function(r) { return r.text(); })
      .then(function(t) {
        logDiv._raw = ""; logDiv._full = "";
        if (t && t !== "No build log.") {
          appendChunk(t);
        } else {
          // Empty-state — clearer guidance than the bare "No log yet."
          logDiv.innerHTML =
            '<div class="modal-empty">' +
              '<div class="modal-empty-title">No build log for this branch yet</div>' +
              '<div class="modal-empty-body">Trigger a build from the dashboard rebuild button. Live output will stream in here as it runs.</div>' +
            '</div>';
        }
      });
    if (S._logSSE) { S._logSSE.close(); S._logSSE = null; }
    S._logSSE = new EventSource("/api/logs/stream?key=" + encodeURIComponent(lm.key));
    S._logSSE.onmessage = function(e) {
      try { var data = JSON.parse(e.data); if (data.msg) appendChunk(data.msg + "\n"); } catch (err) {}
    };
    S._logSSE.onerror = function() {
      if (S._logSSE) { S._logSSE.close(); S._logSSE = null; }
    };
  }

};
})();
