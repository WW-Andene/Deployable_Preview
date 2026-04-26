// modals/apk.js — extracted from monolith via R5.
// Renders into the supplied app element when S.apkModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.apk = function render(app) {
  /* ═══════════════ APK build modal ═══════════════ */
  if (S.apkModal) {
    var am = S.apkModal;
    var apkBg = el("div", { c: "modal-bg", on: { click: function(e) {
      if (e.target === apkBg) { S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render(); }
    } } });
    var apkBox = el("div", { c: "modal", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-apk-title" } });

    /* Header */
    apkBox.appendChild(el("div", { c: "apk-header" }, [
      el("span", { c: "apk-icon", attr: { "aria-hidden": "true" } }, "\uD83D\uDCE6"),
      el("h3", { c: "apk-title flex-1", attr: { id: "modal-apk-title" } }, "Build Android APK"),
      el("span", { c: "apk-meta" }, am.slug)
    ]));

    /* Info box */
    apkBox.appendChild(el("div", { c: "apk-info-box" }, [
      el("div", { c: "apk-info-label" }, "Builds in GitHub Actions \u2014 no SDK needed here"),
      el("div", {}, "1. Pushes a workflow to your repo"),
      el("div", {}, "2. GitHub\u2019s cloud runners build the APK (~4\u20138 min)"),
      el("div", {}, "3. Downloads the .apk back here when done"),
      el("div", { c: "apk-info-hint" }, "Requires your token to have the \u2018workflow\u2019 scope.")
    ]));

    /* Status area */
    var apkStatusDiv = el("div", { c: "apk-log-container" });
    var apkLogDiv = el("div", { c: "live-log hidden" });

    function refreshApkStatus() {
      fetch("/api/apk/" + am.owner + "/" + am.repo + "/status?slug=" + encodeURIComponent(am.slug))
        .then(function(r) { return r.json(); })
        .then(function(st) {
          apkStatusDiv.innerHTML = "";
          var statusColor = st.status === "ready" ? "var(--ok)" : st.status === "building" ? "var(--accent)" : st.status === "error" ? "var(--err)" : "var(--tx3)";
          var statusLabel = { idle: "Not built yet", building: "Building\u2026", ready: "Ready to download", error: "Build failed" }[st.status] || st.status;
          apkStatusDiv.appendChild(el("div", { c: "status-row" }, [
            el("span", { c: "dot " + (st.status === "ready" ? "ok" : st.status === "building" ? "building" : st.status === "error" ? "err" : "idle") }),
            el("span", { c: "status-label", attr: { style: "color:" + statusColor } }, statusLabel +
              (st.status === "ready" && st.sizeKb ? " (" + st.sizeKb + " KB)" : "") +
              (st.startedAt ? " \xB7 " + new Date(st.startedAt).toLocaleTimeString() : ""))
          ]));
          if (st.status === "ready") {
            apkStatusDiv.appendChild(el("a", {
              c: "download-link",
              attr: { href: "/api/apk/" + am.owner + "/" + am.repo + "/download?slug=" + encodeURIComponent(am.slug), download: "" }
            }, [
              el("button", { c: "download-btn bp" }, "\u2B07  Download APK")
            ]));
          }
          if (st.log) {
            apkLogDiv.classList.remove("hidden");
            apkLogDiv.textContent = st.log;
            apkLogDiv.scrollTop = apkLogDiv.scrollHeight;
          }
        });
    }

    refreshApkStatus();

    apkBox.appendChild(apkStatusDiv);
    apkBox.appendChild(apkLogDiv);

    /* Actions */
    var apkBtnRow = el("div", { c: "btn-row" });

    /* Working directory input — shown above the button row */
    var wdRow = el("div", { c: "apk-wd-row" });
    wdRow.appendChild(el("label", { c: "apk-wd-label", attr: { "for": "apk-wd-input" } }, "Working directory"));
    var wdInput = el("input", { c: "apk-wd-input", attr: {
      id: "apk-wd-input",
      type: "text",
      placeholder: ". (repo root)",
      title: "Subdirectory containing package.json, e.g. \"app\" or \"frontend\". Leave blank for repo root."
    } });
    if (am.workingDir) wdInput.value = am.workingDir;
    wdRow.appendChild(wdInput);
    wdRow.appendChild(el("span", { c: "apk-wd-hint" }, "Subdirectory with package.json — leave blank if it\u2019s in the repo root"));
    apkBox.appendChild(wdRow);

    apkBtnRow.appendChild(el("button", { c: "bg", on: { click: function() {
      S.apkModal = null; if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; } DV.render();
    } } }, "Close"));
    apkBtnRow.appendChild(el("button", { c: "bp flex-1", on: { click: function(e) {
      var wd = wdInput.value.trim() || ".";
      am.workingDir = wd; // remember for re-renders
      e.target.disabled = true; e.target.textContent = "Starting\u2026";
      apkLogDiv.classList.remove("hidden"); apkLogDiv.textContent = "";
      fetch("/api/apk/" + am.owner + "/" + am.repo + "?slug=" + encodeURIComponent(am.slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDir: wd })
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          if (S._apkSSE) S._apkSSE.close();
          S._apkSSE = new EventSource("/api/apk/" + am.owner + "/" + am.repo + "/log-stream?slug=" + encodeURIComponent(am.slug));
          S._apkSSE.onmessage = function(ev) {
            try {
              var data = JSON.parse(ev.data);
              if (data.log) { apkLogDiv.textContent = data.log; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
              if (data.msg) { apkLogDiv.textContent += data.msg + "\n"; apkLogDiv.scrollTop = apkLogDiv.scrollHeight; }
            } catch (err) {}
          };
          var pollId = setInterval(function() {
            if (!S.apkModal) { clearInterval(pollId); return; }
            refreshApkStatus();
            fetch("/api/apk/" + am.owner + "/" + am.repo + "/status?slug=" + encodeURIComponent(am.slug))
              .then(function(r) { return r.json(); })
              .then(function(st) {
                if (st.status !== "building") {
                  clearInterval(pollId);
                  if (S._apkSSE) { S._apkSSE.close(); S._apkSSE = null; }
                  refreshApkStatus();
                }
              })
              .catch(function() { /* ignore transient poll errors */ });
          }, 3000);
        })
        .catch(function(err) { apkLogDiv.textContent = "Failed to start: " + err.message; e.target.disabled = false; e.target.textContent = "Build APK"; });
    } } }, "Build APK"));
    apkBox.appendChild(apkBtnRow);

    apkBg.appendChild(apkBox);
    app.appendChild(apkBg);
    focusTrap(apkBg, "apk");
  }

};
})();
