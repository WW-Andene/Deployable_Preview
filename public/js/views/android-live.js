// views/android-live.js — live Android emulator session panel.
// Rendered by preview.js in place of the device-frame iframes when the
// active branch is a native Android project (bs.isNativeAndroid).

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;

var SCREENSHOT_POLL_MS = 900;

function statusApi(owner, repo, slug) {
  return "/api/android-session/" + owner + "/" + repo + "/status?slug=" + encodeURIComponent(slug);
}
function actionApi(owner, repo, slug, suffix) {
  return "/api/android-session/" + owner + "/" + repo + (suffix || "") + "?slug=" + encodeURIComponent(slug);
}

DV.renderAndroidLive = function (container, owner, repo, slug) {
  // Kill any previous poll/SSE from a prior render of this panel before
  // building a new one — without this, switching branches or any full
  // re-render would stack up duplicate intervals.
  if (S._androidPollTimer) { clearInterval(S._androidPollTimer); S._androidPollTimer = null; }
  if (S._androidStatusTimer) { clearTimeout(S._androidStatusTimer); S._androidStatusTimer = null; }
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
          poll();
        })
        .catch(function (e) { DV.showToast("Failed to start: " + e.message, "error"); btn.disabled = false; btn.textContent = "Start Live Session"; });
    } } }, "Start Live Session");
    body.appendChild(btn);
  }

  function renderStarting(st) {
    body.innerHTML = "";
    body.appendChild(el("div", { c: "flex-row items-center gap-6" }, [
      el("span", { c: "spin" }),
      el("span", {}, "Booting emulator + building app… (usually 3–6 min)")
    ]));
    var logDiv = el("div", { c: "live-log" }, st.log || "");
    body.appendChild(logDiv);

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
        api("POST", actionApi(owner, repo, slug, "/input"), { action: "text", text: textInput.value })
          .then(function () { textInput.value = ""; refreshScreenshot(); });
      }
    });
    toolbar.appendChild(textInput);

    function keyBtn(label, keycode) {
      return el("button", { c: "bg bs", on: { click: function () {
        api("POST", actionApi(owner, repo, slug, "/input"), { action: "key", keycode: keycode })
          .then(refreshScreenshot);
      } } }, label);
    }
    toolbar.appendChild(keyBtn("◀ Back", 4));
    toolbar.appendChild(keyBtn("⌂ Home", 3));
    toolbar.appendChild(keyBtn("↩ Enter", 66));

    toolbar.appendChild(el("button", { c: "bg bs", on: { click: function () {
      if (S._androidPollTimer) { clearInterval(S._androidPollTimer); S._androidPollTimer = null; }
      api("POST", actionApi(owner, repo, slug, "/stop")).then(poll);
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
      api("POST", actionApi(owner, repo, slug, "/input"), { action: "tap", x: x, y: y })
        .then(refreshScreenshot);
    });

    var firstLoad = true;
    function refreshScreenshot() {
      var next = new Image();
      next.onload = function () {
        img.src = next.src;
        if (firstLoad) { loader.style.display = "none"; firstLoad = false; }
      };
      next.onerror = function () { /* transient — next poll will retry */ };
      next.src = "/api/android-session/" + owner + "/" + repo + "/screenshot?slug=" + encodeURIComponent(slug) + "&_t=" + Date.now();
    }
    refreshScreenshot();
    S._androidPollTimer = setInterval(refreshScreenshot, SCREENSHOT_POLL_MS);
  }

  function renderStoppedOrError(st) {
    body.innerHTML = "";
    var label = st.status === "stopped" ? "Session stopped." : "Session error.";
    body.appendChild(el("div", { c: "text-12", s: { marginBottom: "8px" } }, label));
    var logDiv = el("div", { c: "live-log" + (st.log ? "" : " hidden") }, st.log || "");
    body.appendChild(logDiv);
    renderIdle(st);
  }

  function poll() {
    api("GET", statusApi(owner, repo, slug)).then(function (st) {
      st = st || { status: "idle" };
      if (st.status === "starting") renderStarting(st);
      else if (st.status === "ready") renderReady(st);
      else if (st.status === "error" || st.status === "stopped") renderStoppedOrError(st);
      else renderIdle(st);

      // Keep polling status while a session is starting or ready — a
      // ready session can flip to error/stopped server-side (job
      // finished/cancelled) without any client action.
      if (st.status === "starting" || st.status === "ready") {
        if (S._androidStatusTimer) clearTimeout(S._androidStatusTimer);
        S._androidStatusTimer = setTimeout(poll, 4000);
      }
    }).catch(function () { /* transient — leave current view up */ });
  }

  poll();
};
})();
