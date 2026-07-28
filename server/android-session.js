/**
 * android-session.js — live Android emulator sessions via GitHub Actions
 *
 * Unlike apk.js (compile-and-download), this keeps an emulator running on
 * an Actions runner for an interactive debug session: it builds the debug
 * APK, boots a KVM-backed emulator, installs + launches the app, then
 * starts a tiny bearer-token-gated HTTP bridge (screenshot / tap / swipe /
 * text / key) and exposes it via a cloudflared quick tunnel — the same
 * tunnel technology server/tunnel.js uses for DV itself, just run as a
 * workflow step on the runner instead of in-process, since the emulator
 * lives on a different machine.
 *
 * DV polls the run's job log for the DV_BRIDGE_URL=/DV_BRIDGE_TOKEN=
 * markers the workflow prints once the bridge is up, then proxies MCP
 * tool calls (see dv/tools/android.js) straight through to that URL.
 *
 * Session lifetime = the Actions job's lifetime (cancelled via the Actions
 * API when the user hits Stop, or times out at job-timeout-minutes).
 */

"use strict";

const https = require("https");
const http  = require("http");
const crypto = require("crypto");

const { getConfig } = require("./config");
const { broadcastLog } = require("./logs");

// key → { status, log, tunnelUrl, bridgeToken, runId, runUrl, startedAt, jobId }
const sessionStatus = {};

// ─── tiny GitHub REST helper (mirrors apk.js) ─────────────────────────────────

function ghReq(method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.github.com",
      path: endpoint,
      method,
      headers: {
        "User-Agent":           "deployview-android-session/1.0",
        "Authorization":        "Bearer " + token,
        "Accept":               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let buf = "";
      res.on("data", (d) => { buf += d; });
      res.on("end", () => {
        if (res.statusCode === 204) return resolve({});
        if (res.statusCode >= 400) return reject(new Error("GitHub " + res.statusCode + " " + method + " " + endpoint + ": " + buf.slice(0, 300)));
        try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { resolve(buf); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function ghRawGet(url, token) {
  return new Promise((resolve, reject) => {
    function follow(u) {
      https.get({
        hostname: new URL(u).hostname,
        path: new URL(u).pathname + new URL(u).search,
        headers: {
          "User-Agent":    "deployview-android-session/1.0",
          "Authorization": "Bearer " + token,
          "Accept":        "application/vnd.github+json"
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return follow(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error("GET " + res.statusCode + " " + u));
        let buf = "";
        res.on("data", (d) => { buf += d; });
        res.on("end", () => resolve(buf));
      }).on("error", reject);
    }
    follow(url);
  });
}

// ─── workflow YAML ────────────────────────────────────────────────────────────
//
// The bridge is a stdlib-only Python HTTP server (Android runner images
// ship python3) so nothing extra needs installing. It's gated by a random
// bearer token generated at job start — without it, no one who finds the
// cloudflared URL can touch the device.

function bridgeScript() {
  return [
    "import http.server, subprocess, json, os, urllib.parse",
    "TOKEN = os.environ['DV_BRIDGE_TOKEN']",
    "class H(http.server.BaseHTTPRequestHandler):",
    "    def _auth(self):",
    "        return self.headers.get('Authorization') == 'Bearer ' + TOKEN",
    "    def _adb(self, *args):",
    "        return subprocess.run(['adb', *args], capture_output=True)",
    "    def do_GET(self):",
    "        if not self._auth():",
    "            self.send_response(401); self.end_headers(); return",
    "        if self.path == '/screenshot':",
    "            r = self._adb('exec-out', 'screencap', '-p')",
    "            self.send_response(200); self.send_header('Content-Type', 'image/png'); self.end_headers()",
    "            self.wfile.write(r.stdout)",
    "        elif self.path == '/ui':",
    "            self._adb('shell', 'uiautomator', 'dump', '/sdcard/dv_ui.xml')",
    "            r = self._adb('shell', 'cat', '/sdcard/dv_ui.xml')",
    "            self.send_response(200); self.send_header('Content-Type', 'application/xml'); self.end_headers()",
    "            self.wfile.write(r.stdout)",
    "        else:",
    "            self.send_response(404); self.end_headers()",
    "    def do_POST(self):",
    "        if not self._auth():",
    "            self.send_response(401); self.end_headers(); return",
    "        length = int(self.headers.get('Content-Length', 0))",
    "        body = json.loads(self.rfile.read(length) or b'{}')",
    "        if self.path == '/tap':",
    "            self._adb('shell', 'input', 'tap', str(body['x']), str(body['y']))",
    "        elif self.path == '/swipe':",
    "            self._adb('shell', 'input', 'swipe', str(body['x1']), str(body['y1']), str(body['x2']), str(body['y2']), str(body.get('durationMs', 300)))",
    "        elif self.path == '/text':",
    "            self._adb('shell', 'input', 'text', urllib.parse.quote(body['text']).replace('%20', '%s'))",
    "        elif self.path == '/key':",
    "            self._adb('shell', 'input', 'keyevent', str(body['keycode']))",
    "        else:",
    "            self.send_response(404); self.end_headers(); return",
    "        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()",
    "        self.wfile.write(b'{\"ok\":true}')",
    "    def log_message(self, *a): pass",
    "http.server.HTTPServer(('127.0.0.1', 8283), H).serve_forever()"
  ].join("\n");
}

function makeSessionWorkflow(workingDir, timeoutMinutes) {
  const wd = (workingDir || ".").replace(/\/$/, "") || ".";
  function yq(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  return [
    "# Auto-generated by DeployView — safe to delete after use",
    "name: DeployView Android Live Session",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      working_directory:",
    "        description: Subdirectory containing settings.gradle (leave blank for repo root)",
    "        default: " + yq(wd),
    "",
    "jobs:",
    "  session:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: " + (timeoutMinutes || 90),
    "    defaults:",
    "      run:",
    "        working-directory: ${{ github.event.inputs.working_directory }}",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "",
    "      - uses: actions/setup-java@v4",
    "        with:",
    "          distribution: temurin",
    "          java-version: '17'",
    "",
    "      - uses: android-actions/setup-android@v3",
    "",
    "      - name: Enable KVM",
    "        run: |",
    "          echo 'KERNEL==\"kvm\", GROUP=\"kvm\", MODE=\"0666\", OPTIONS+=\"static_node=kvm\"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules",
    "          sudo udevadm control --reload-rules",
    "          sudo udevadm trigger --name-match=kvm",
    "",
    "      - name: Build debug APK",
    "        run: |",
    "          chmod +x gradlew",
    "          ./gradlew assembleDebug --no-daemon",
    "",
    "      - name: Download cloudflared",
    "        run: |",
    "          curl -sL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
    "          chmod +x /usr/local/bin/cloudflared",
    "",
    "      - name: Boot emulator, install app, start bridge + tunnel",
    "        uses: reactivecircus/android-emulator-runner@v2",
    "        with:",
    "          api-level: 34",
    "          arch: x86_64",
    "          profile: pixel_6",
    "          script: |",
    "            APK=$(find . -path '*/outputs/apk/debug/*.apk' | head -n1)",
    "            PKG=$(${ANDROID_SDK_ROOT}/build-tools/*/aapt dump badging \"$APK\" | grep package: | sed -e \"s/.*name='//\" -e \"s/'.*//\")",
    "            ACT=$(${ANDROID_SDK_ROOT}/build-tools/*/aapt dump badging \"$APK\" | grep launchable-activity | sed -e \"s/.*name='//\" -e \"s/'.*//\")",
    "            adb install -r \"$APK\"",
    "            adb shell am start -n \"$PKG/$ACT\"",
    "            export DV_BRIDGE_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(24))')",
    "            cat > /tmp/dv_bridge.py <<'PYEOF'",
    bridgeScript(),
    "            PYEOF",
    "            python3 /tmp/dv_bridge.py &",
    "            sleep 2",
    "            /usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8283 > /tmp/cf.log 2>&1 &",
    "            for i in $(seq 1 30); do",
    "              URL=$(grep -o 'https://[a-zA-Z0-9-]*\\.trycloudflare\\.com' /tmp/cf.log | head -n1)",
    "              [ -n \"$URL\" ] && break",
    "              sleep 2",
    "            done",
    "            echo \"DV_BRIDGE_URL=$URL\"",
    "            echo \"DV_BRIDGE_TOKEN=$DV_BRIDGE_TOKEN\"",
    "            echo \"DV_BRIDGE_PACKAGE=$PKG\"",
    "            echo \"Session live — waiting for cancellation or timeout.\"",
    "            while true; do sleep 60; done",
    ""
  ].join("\n");
}

// ─── logging ──────────────────────────────────────────────────────────────────

function addLog(key, msg) {
  if (!sessionStatus[key]) return;
  sessionStatus[key].log += msg + "\n";
  broadcastLog("android:" + key, msg);
  console.log("[ANDROID:" + key + "] " + msg);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── main ─────────────────────────────────────────────────────────────────────

async function startSession(owner, repo, slug, workingDir, timeoutMinutes) {
  const key = owner + "/" + repo + ":" + slug;
  const token = getConfig().token;

  sessionStatus[key] = { status: "starting", log: "", tunnelUrl: null, bridgeToken: null, startedAt: Date.now(), runUrl: null, runId: null, packageName: null };

  if (!token) {
    addLog(key, "ERROR: No GitHub token. Add one in the DeployView settings first (needs repo + workflow scope).");
    sessionStatus[key].status = "error"; return;
  }

  const workDir = (workingDir || ".").replace(/\/$/, "") || ".";
  const WORKFLOW_FILE = ".github/workflows/deployview-android-session.yml";

  addLog(key, "Fetching repo info...");
  let defaultBranch;
  try {
    const info = await ghReq("GET", "/repos/" + owner + "/" + repo, null, token);
    defaultBranch = info.default_branch || "main";
  } catch (e) {
    addLog(key, "ERROR: " + e.message); sessionStatus[key].status = "error"; return;
  }

  addLog(key, "Checking session workflow in repo...");
  const newContent = makeSessionWorkflow(workDir, timeoutMinutes);
  const newContentB64 = Buffer.from(newContent).toString("base64");
  let existingSha = null, existingContent = "";
  try {
    const f = await ghReq("GET", "/repos/" + owner + "/" + repo + "/contents/" + WORKFLOW_FILE + "?ref=" + defaultBranch, null, token);
    existingSha = f.sha;
    if (f.content) existingContent = Buffer.from(f.content, "base64").toString("utf8");
  } catch (e) { /* new file */ }

  if (existingContent !== newContent) {
    try {
      await ghReq("PUT", "/repos/" + owner + "/" + repo + "/contents/" + WORKFLOW_FILE, {
        message: "chore: DeployView Android session workflow [skip ci]",
        content: newContentB64,
        branch: defaultBranch,
        ...(existingSha ? { sha: existingSha } : {})
      }, token);
      addLog(key, existingSha ? "Workflow updated." : "Workflow file added.");
    } catch (e) {
      addLog(key, "ERROR pushing workflow: " + e.message);
      addLog(key, "Tip: token needs the 'workflow' scope.");
      sessionStatus[key].status = "error"; return;
    }
  } else {
    addLog(key, "Workflow already up-to-date.");
  }

  await sleep(4000);

  addLog(key, "Triggering GitHub Actions run...");
  const triggerTime = Date.now();
  try {
    await ghReq("POST", "/repos/" + owner + "/" + repo + "/actions/workflows/deployview-android-session.yml/dispatches", {
      ref: defaultBranch,
      inputs: { working_directory: workDir }
    }, token);
  } catch (e) {
    addLog(key, "ERROR triggering workflow: " + e.message);
    sessionStatus[key].status = "error"; return;
  }

  addLog(key, "Waiting for run to appear...");
  let runId = null, runUrl = null;
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    try {
      const runs = await ghReq("GET", "/repos/" + owner + "/" + repo + "/actions/workflows/deployview-android-session.yml/runs?per_page=5", null, token);
      for (const r of (runs.workflow_runs || [])) {
        if (new Date(r.created_at).getTime() >= triggerTime - 60000) { runId = r.id; runUrl = r.html_url; break; }
      }
    } catch (e) { /* retry */ }
    if (runId) break;
  }
  if (!runId) {
    addLog(key, "ERROR: Run did not appear after 2 minutes. Check https://github.com/" + owner + "/" + repo + "/actions");
    sessionStatus[key].status = "error"; return;
  }
  sessionStatus[key].runId = runId;
  sessionStatus[key].runUrl = runUrl;
  addLog(key, "Run started → " + runUrl);
  addLog(key, "Booting emulator + building app (usually 3–6 min)...");

  // Poll the job log for the bridge markers. The job stays running after
  // this (deliberately — that's the live session), so we can't wait for
  // "completed" like apk.js does; we watch the log for the markers, or bail
  // if the run finishes early (build/boot failure).
  let bridgeUrl = null, bridgeToken = null, pkg = null;
  for (let i = 0; i < 90; i++) {
    await sleep(10000);
    let run;
    try { run = await ghReq("GET", "/repos/" + owner + "/" + repo + "/actions/runs/" + runId, null, token); } catch (e) { continue; }
    if (run.status === "completed") {
      addLog(key, "ERROR: Run ended (" + run.conclusion + ") before the bridge came up. Details: " + runUrl);
      sessionStatus[key].status = "error"; return;
    }
    try {
      const jobs = await ghReq("GET", "/repos/" + owner + "/" + repo + "/actions/runs/" + runId + "/jobs", null, token);
      const job = (jobs.jobs || [])[0];
      if (!job) continue;
      sessionStatus[key].jobId = job.id;
      const logText = await ghRawGet("https://api.github.com/repos/" + owner + "/" + repo + "/actions/jobs/" + job.id + "/logs", token);
      const mUrl = logText.match(/DV_BRIDGE_URL=(\S+)/);
      const mTok = logText.match(/DV_BRIDGE_TOKEN=(\S+)/);
      const mPkg = logText.match(/DV_BRIDGE_PACKAGE=(\S+)/);
      if (mUrl && mUrl[1] && mTok && mTok[1]) {
        bridgeUrl = mUrl[1]; bridgeToken = mTok[1]; pkg = mPkg ? mPkg[1] : null;
        break;
      }
    } catch (e) { /* logs not ready yet */ }
  }

  if (!bridgeUrl) {
    addLog(key, "ERROR: Bridge never came up after 15 minutes. Details: " + runUrl);
    sessionStatus[key].status = "error"; return;
  }

  sessionStatus[key].status = "ready";
  sessionStatus[key].tunnelUrl = bridgeUrl;
  sessionStatus[key].bridgeToken = bridgeToken;
  sessionStatus[key].packageName = pkg;
  addLog(key, "✓ Live session ready — app: " + (pkg || "?"));
}

async function stopSession(owner, repo, slug) {
  const key = owner + "/" + repo + ":" + slug;
  const st = sessionStatus[key];
  const token = getConfig().token;
  if (!st || !st.runId || !token) return;
  try {
    await ghReq("POST", "/repos/" + owner + "/" + repo + "/actions/runs/" + st.runId + "/cancel", null, token);
    addLog(key, "Session stop requested.");
  } catch (e) {
    addLog(key, "ERROR stopping session: " + e.message);
  }
  st.status = "stopped";
}

// ─── bridge proxy (called by MCP tools + REST routes) ─────────────────────────

function bridgeRequest(key, method, path, body) {
  const st = sessionStatus[key];
  if (!st || st.status !== "ready" || !st.tunnelUrl) {
    return Promise.reject(new Error("No live Android session for " + key + " — start one first."));
  }
  return new Promise((resolve, reject) => {
    const url = new URL(st.tunnelUrl + path);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method,
      headers: {
        "Authorization": "Bearer " + st.bridgeToken,
        ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error("Bridge " + res.statusCode + " " + method + " " + path));
        resolve({ buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { sessionStatus, startSession, stopSession, bridgeRequest };
