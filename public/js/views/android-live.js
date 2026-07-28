// views/android-live.js — live Android emulator session panel.
// Rendered by preview.js in place of the device-frame iframes when the
// active branch is a native Android project (bs.isNativeAndroid).
//
// Fully manual — no auto-polling. The screenshot bridge (server/android-
// session.js's Python HTTP server) handles one request at a time; every
// automatic timer here was a request competing with Claude's own MCP
// tool calls (android_screenshot/tap/etc.) for the same single-threaded
// server. Status and screenshot both only refresh on explicit user action
// (a click) now.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;

function statusApi(owner, repo, slug) {
  return "/api/android-session/" + owner + "/" + repo + "/status?slug=" + encodeURIComponent(slug);
}
function actionApi(owner, repo, slug, suffix) {
  return "/api/android-session/" + owner + "/" + repo + (suffix || "") + "?slug=" + encodeURIComponent(slug);
}

DV.renderAndroidLive = function (container, owner, repo, slug) {
  // Kill any leftover SSE from a prior mount of this panel.
  if (S._androidSSE) { try { S._androidSSE.close(); } catch (_) {} S._androidSSE = null; }

  var panel = el("div", { c: "android-live-panel" });
  container.appendChild(panel);

  var header = el("div", { c: "android-live-header" }, [
    el("span", { c: "android-live-icon", attr: { "aria-hidden": "true" } }, "🤖"),
    el("span", { c: "flex-1" }, "Native Android — live session"),
  ]);
  panel.appendChild(header);

  var body = el("div", { c: "android-live-body" });
  panel.appendChild(body);

  function renderIdle(st) {
    body.innerHTML = "";
    var info = el("div", { c: "apk-info-box" }, [
      el("div", { c: "apk-info-label" }, "Boots a real emulator on GitHub Actions — no SDK needed here"),
      el("div", {}, "1. Builds the debug APK and boots a KVM emulator (~3–6 min)"),
      el("div", {}, "2. Installs + launches the app, opens a live view + tap/swipe/type controls"),
      el("div", { c: "apk-info-hint" }, "Requires your token to have the ‘workflow’ scope.")
    ]);
    body.appendChild(info);

    if (st && st.status === "error") {
      body.appendChild(el("div", { c: "color-err text-12", s: { marginTop: "8px" } }, "Last session failed — see log below."));
    }

    var wdInput = document.createElement("input");
    wdInput.className = "apk-wd-input";
    wdInput.placeholder = ". (repo root)";
    wdInput.value = S._androidWorkingDir || "";
    wdInput.addEventListener("input", function (e) { S._androidWorkingDir = e.target.value; });
    body.appendChild(el("div", { c: "apk-wd-row" }, [
      el("label", { c: "apk-wd-label" }, "Working directory"),
      wdInput
    ]));

    var logDiv = el("div", { c: "live-log" + (st && st.log ? "" : " hidden") }, st && st.log ? st.log : "");
    body.appendChild(logDiv);

    var btn = el("button", { c: "bp", on: { click: function () {
      btn.disabled = true; btn.textContent = "Starting…";
      var wd = (wdInput.value || "").trim() || ".";
      S._androidWorkingDir = wd;
      api("POST", actionApi(owner, repo, slug), { workingDir: wd })
        .then(function (res) {
          if (res && res.error) { DV.showToast(res.error, "error"); btn.disabled = false; btn.textContent = "Start Live Session"; return; }
          checkStatus();
        })
        .catch(function (e) { DV.showToast("Failed to start: " + e.message, "error"); btn.disabled = false; btn.textContent = "Start Live Session"; });
    } } }, "Start Live Session");
    body.appendChild(btn);
  }

  function renderStarting(st) {
    body.innerHTML = "";
    body.appendChild(el("div", { c: "flex-row items-center gap-6" }, [
      el("span", { c: "spin" }),
      el("span", { c: "flex-1" }, "Booting emulator + building app… (usually 3–6 min)"),
      el("button", { c: "bg bs", on: { click: checkStatus } }, "Check now")
    ]));
    var logDiv = el("div", { c: "live-log" }, st.log || "");
    body.appendChild(logDiv);

    // The log stream is server-push (SSE), not a client poll loop — it's
    // fine to leave connected while starting. It carries no traffic
    // unless the server has something new to say.
    if (S._androidSSE) { try { S._androidSSE.close(); } catch (_) {} }
    S._androidSSE = new EventSource("/api/android-session/" + owner + "/" + repo + "/log-stream?slug=" + encodeURIComponent(slug));
    S._androidSSE.onmessage = function (ev) {
      try {
        var data = JSON.parse(ev.data);
        if (data.log) { logDiv.textContent = data.log; logDiv.scrollTop = logDiv.scrollHeight; }
        if (data.msg) { logDiv.textContent += data.msg + "\n"; logDiv.scrollTop = logDiv.scrollHeight; }
      } catch (_) {}
    };
  }

  function renderReady(st) {
    body.innerHTML = "";
    if (S._androidSSE) { try { S._androidSSE.close(); } catch (_) {} S._androidSSE = null; }

    var toolbar = el("div", { c: "android-live-toolbar" });
    var pkgLabel = el("span", { c: "frame-info-badge" }, st.packageName || "");
    toolbar.appendChild(pkgLabel);

    var textInput = document.createElement("input");
    textInput.className = "dd-input android-live-text-input";
    textInput.placeholder = "Type text into focused field…";
    textInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && textInput.value) {
        postInput({ action: "text", text: textInput.value });
        textInput.value = "";
      }
    });
    toolbar.appendChild(textInput);

    function keyBtn(label, keycode) {
      return el("button", { c: "bg bs", on: { click: function () {
        postInput({ action: "key", keycode: keycode });
      } } }, label);
    }
    toolbar.appendChild(keyBtn("◀ Back", 4));
    toolbar.appendChild(keyBtn("⌂ Home", 3));
    toolbar.appendChild(keyBtn("↩ Enter", 66));
    toolbar.appendChild(el("button", { c: "bg bs", on: { click: refreshScreenshot } }, "↻ Refresh"));

    toolbar.appendChild(el("button", { c: "bg bs", on: { click: function () {
      api("POST", actionApi(owner, repo, slug, "/stop")).then(checkStatus);
    } } }, "Stop Session"));
    body.appendChild(toolbar);

    var screenWrap = el("div", { c: "android-live-screen-wrap" });
    var img = document.createElement("img");
    img.className = "android-live-screen";
    img.alt = "Live Android app screen";
    var loader = el("div", { c: "frame-loader" }, [el("span", { c: "spin" })]);
    screenWrap.appendChild(loader);
    screenWrap.appendChild(img);
    body.appendChild(screenWrap);

    img.addEventListener("click", function (e) {
      var rect = img.getBoundingClientRect();
      if (!img.naturalWidth || !img.naturalHeight) return;
      var x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
      var y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
      postInput({ action: "tap", x: x, y: y });
    });

    var firstLoad = true;
    function showBlob(blob) {
      var url = URL.createObjectURL(blob);
      var prevUrl = img.dataset.blobUrl;
      img.onload = function () {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        if (firstLoad) { loader.style.display = "none"; firstLoad = false; }
      };
      img.dataset.blobUrl = url;
      img.src = url;
    }

    // The bridge now returns the resulting screenshot directly from the
    // /input POST itself (see server/android-session.js) instead of the
    // caller needing a *separate* GET /screenshot afterward — halves the
    // round-trips per tap/swipe/key/text, each of which pays full tunnel
    // + GitHub Actions runner latency. Raw fetch, not DV.api(), since
    // that helper JSON-parses response text and would corrupt binary PNG
    // bytes.
    function postInput(payload) {
      fetch(actionApi(owner, repo, slug, "/input"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then(showBlob)
        .catch(function (e) { DV.showToast("Action failed: " + e.message, "error"); });
    }

    function refreshScreenshot() {
      fetch("/api/android-session/" + owner + "/" + repo + "/screenshot?slug=" + encodeURIComponent(slug) + "&_t=" + Date.now())
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then(showBlob)
        .catch(function () { DV.showToast("Screenshot fetch failed", "error"); });
    }
    refreshScreenshot();
  }

  function renderStoppedOrError(st) {
    body.innerHTML = "";
    var label = st.status === "stopped" ? "Session stopped." : "Session error.";
    body.appendChild(el("div", { c: "text-12", s: { marginBottom: "8px" } }, label));
    var logDiv = el("div", { c: "live-log" + (st.log ? "" : " hidden") }, st.log || "");
    body.appendChild(logDiv);
    renderIdle(st);
  }

  // One-shot status check — called on mount, after Start/Stop, and via
  // the manual "Check now" button while a session is booting. No timer
  // ever calls this on its own.
  function checkStatus() {
    api("GET", statusApi(owner, repo, slug)).then(function (st) {
      st = st || { status: "idle" };
      if (st.status === "starting") renderStarting(st);
      else if (st.status === "ready") renderReady(st);
      else if (st.status === "error" || st.status === "stopped") renderStoppedOrError(st);
      else renderIdle(st);
    }).catch(function () { /* transient — leave current view up */ });
  }

  checkStatus();
};
})();
