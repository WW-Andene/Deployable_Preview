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

// Reports the bridge URL/token/package to a Check Run once the tunnel is
// up, so DV can read it via the Checks API — which updates live — instead
// of the job-logs-download endpoint, which 404s until the job completes
// (and this job is meant to stay running for the session's lifetime).
function reportScript() {
  return [
    "import os, json, urllib.request",
    "payload = {",
    "    'name': 'deployview-bridge',",
    "    'head_sha': os.environ['GITHUB_SHA'],",
    "    'status': 'completed',",
    "    'conclusion': 'success',",
    "    'output': {",
    "        'title': 'DV Bridge',",
    "        'summary': json.dumps({",
    "            'url': os.environ['DV_URL'],",
    "            'token': os.environ['DV_BRIDGE_TOKEN'],",
    "            'package': os.environ.get('DV_PKG', '')",
    "        })",
    "    }",
    "}",
    "req = urllib.request.Request(",
    "    'https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY'] + '/check-runs',",
    "    data=json.dumps(payload).encode(),",
    "    headers={",
    "        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],",
    "        'Accept': 'application/vnd.github+json',",
    "        'Content-Type': 'application/json'",
    "    },",
    "    method='POST'",
    ")",
    "urllib.request.urlopen(req)"
  ].join("\n");
}

function makeSessionWorkflow(workingDir, timeoutMinutes, branchName) {
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
    "      branch:",
    "        description: Branch to check out and build",
    "        default: " + yq(branchName || "main"),
    "",
    // The bridge-ready signal is posted via the Checks API instead of
    // grepped from job logs — GitHub's job-logs-download endpoint 404s
    // for a job that's still in_progress (confirmed against a live run),
    // and this job is *meant* to stay in_progress for the session's
    // whole lifetime. Checks update live regardless of job completion.
    "permissions:",
    "  checks: write",
    "  contents: read",
    "",
    "jobs:",
    "  session:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: " + (timeoutMinutes || 90),
    "    defaults:",
    "      run:",
    "        working-directory: ${{ github.event.inputs.working_directory }}",
    "    steps:",
    // Dispatch runs against the default branch (so the workflow file is
    // always discoverable there) but the code we actually want to build
    // usually lives on a feature branch — check that out explicitly
    // rather than relying on checkout's default (which follows the
    // dispatch ref, i.e. the default branch, and silently builds the
    // wrong code).
    "      - uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.event.inputs.branch }}",
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
    // Resolve the built APK's absolute path in a normal step (runs in the
    // correct working-directory, as one shell invocation) and hand it
    // downstream via $GITHUB_ENV — the emulator-runner step below can't be
    // trusted to inherit either the cwd or any variable a prior line in
    // its own `script:` set (see the dv_session.sh step for why).
    "      - name: Locate built APK",
    "        run: |",
    "          APK_PATH=\"$(pwd)/$(find . -path '*/outputs/apk/debug/*.apk' | head -n1)\"",
    "          echo \"APK_PATH=$APK_PATH\" >> \"$GITHUB_ENV\"",
    // Read applicationId straight out of build.gradle(.kts) — declared
    // literally in the overwhelming majority of projects. Every SDK-tool
    // route tried so far has been unreliable on this runner image (aapt
    // errored "Unknown command", apkanalyzer returned "15" — some
    // unrelated numeric value, not a package name) — this has zero
    // dependency on which SDK components happen to be installed.
    "          GRADLE_PKG_GUESS=$(grep -rhoE 'applicationId[[:space:]]*=?[[:space:]]*\"[^\"]+\"' --include='build.gradle*' . | head -n1 | sed -E 's/.*\"([^\"]+)\".*/\\1/')",
    "          echo \"GRADLE_PKG_GUESS=$GRADLE_PKG_GUESS\" >> \"$GITHUB_ENV\"",
    "",
    "      - name: Download cloudflared",
    "        run: |",
    "          curl -sL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
    "          chmod +x /usr/local/bin/cloudflared",
    "",
    // reactivecircus/android-emulator-runner@v2 runs each line of `script:`
    // as its own separate `sh -c` — variables set on one line are gone by
    // the next (confirmed: "APK=$(find …)" then a fresh shell for the
    // very next line sees an empty $APK). Write the real logic to a file
    // via a normal run step (single shell invocation, so it behaves) and
    // have `script:` be one line that just executes that file — sidesteps
    // the per-line isolation entirely.
    "      - name: Write session script",
    "        run: |",
    "          cat > /tmp/dv_session.sh <<'DVEOF'",
    // ${{ secrets.GITHUB_TOKEN }} is substituted by the runner into this
    // step's literal text *before* bash ever sees it (workflow-level
    // templating, independent of the heredoc's quoting) — baking it in
    // here sidesteps any doubt about whether env: set on the emulator-
    // runner step would actually reach its internal script execution.
    "          GH_TOKEN='${{ secrets.GITHUB_TOKEN }}'",
    "          APK=\"$APK_PATH\"",
    // Every SDK-tool route has proven unreliable on this runner image:
    // aapt errored "Unknown command", apkanalyzer returned "15" — a
    // garbage value, not a package name. A validation guard against a
    // Java-package-shaped string stops garbage like that from ever being
    // accepted, regardless of which source produced it.
    "          is_valid_pkg() { echo \"$1\" | grep -qE '^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$'; }",
    "          PKG=\"\"",
    "          is_valid_pkg \"$GRADLE_PKG_GUESS\" && PKG=\"$GRADLE_PKG_GUESS\"",
    "          if [ -z \"$PKG\" ]; then",
    "            AAPT2=$(find \"$ANDROID_SDK_ROOT\" -type f -name aapt2 2>/dev/null | head -n1)",
    "            if [ -n \"$AAPT2\" ]; then",
    "              CAND=$(\"$AAPT2\" dump badging \"$APK\" 2>/dev/null | grep package: | sed -e \"s/.*name='//\" -e \"s/'.*//\")",
    "              is_valid_pkg \"$CAND\" && PKG=\"$CAND\"",
    "            fi",
    "          fi",
    "          if [ -z \"$PKG\" ]; then",
    "            APKANALYZER=$(find \"$ANDROID_SDK_ROOT/cmdline-tools\" -type f -name apkanalyzer 2>/dev/null | head -n1)",
    "            if [ -n \"$APKANALYZER\" ]; then",
    "              CAND=$(\"$APKANALYZER\" manifest application-id \"$APK\" 2>/dev/null)",
    "              is_valid_pkg \"$CAND\" && PKG=\"$CAND\"",
    "            fi",
    "          fi",
    "          adb install -r \"$APK\"",
    // monkey only needs the package name (launches its default LAUNCHER
    // activity) — skips the second point of failure of resolving the
    // exact launchable-activity class name for `am start -n pkg/activity`.
    "          if [ -n \"$PKG\" ]; then",
    "            adb shell monkey -p \"$PKG\" -c android.intent.category.LAUNCHER 1",
    "          else",
    "            echo \"WARNING: could not determine package name — app installed but not auto-launched\"",
    "          fi",
    "          export DV_BRIDGE_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(24))')",
    // Base64, not a heredoc: python needs zero leading indentation on
    // top-level statements, but the outer heredoc body still has to carry
    // this block's own indentation to stay valid YAML — one line sidesteps
    // the conflict entirely.
    "          echo " + Buffer.from(bridgeScript()).toString("base64") + " | base64 -d > /tmp/dv_bridge.py",
    "          python3 /tmp/dv_bridge.py &",
    "          sleep 2",
    "          /usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8283 > /tmp/cf.log 2>&1 &",
    "          for i in $(seq 1 30); do",
    "            URL=$(grep -o 'https://[a-zA-Z0-9-]*\\.trycloudflare\\.com' /tmp/cf.log | head -n1)",
    "            [ -n \"$URL\" ] && break",
    "            sleep 2",
    "          done",
    "          echo \"DV_BRIDGE_URL=$URL\"",
    "          echo \"DV_BRIDGE_TOKEN=$DV_BRIDGE_TOKEN\"",
    "          echo \"DV_BRIDGE_PACKAGE=$PKG\"",
    "          export DV_URL=\"$URL\" DV_PKG=\"$PKG\" GH_TOKEN",
    "          echo " + Buffer.from(reportScript()).toString("base64") + " | base64 -d | python3",
    "          echo \"Session live — waiting for cancellation or timeout.\"",
    "          while true; do sleep 60; done",
    "          DVEOF",
    "          chmod +x /tmp/dv_session.sh",
    "",
    "      - name: Boot emulator, install app, start bridge + tunnel",
    "        uses: reactivecircus/android-emulator-runner@v2",
    "        with:",
    "          api-level: 34",
    "          arch: x86_64",
    "          profile: pixel_6",
    "          script: bash /tmp/dv_session.sh",
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

  const { findBranchConfig } = require("./build/state");
  const bc = findBranchConfig(owner, repo, slug);
  if (!bc || !bc.branch) {
    addLog(key, "ERROR: Could not resolve the git branch for " + key + " — re-add the branch and try again.");
    sessionStatus[key].status = "error"; return;
  }
  const targetBranch = bc.branch;
  addLog(key, "Target branch: " + targetBranch);

  addLog(key, "Fetching repo info...");
  let defaultBranch;
  try {
    const info = await ghReq("GET", "/repos/" + owner + "/" + repo, null, token);
    defaultBranch = info.default_branch || "main";
  } catch (e) {
    addLog(key, "ERROR: " + e.message); sessionStatus[key].status = "error"; return;
  }

  addLog(key, "Checking session workflow in repo...");
  const newContent = makeSessionWorkflow(workDir, timeoutMinutes, targetBranch);
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
  // GitHub needs a beat to index a workflow file that was just pushed —
  // dispatching too soon 422s with "does not have 'workflow_dispatch'
  // trigger" even though the file is already committed and valid. Retry
  // with backoff instead of failing the whole session on that transient.
  const dispatchDelays = [3000, 6000, 10000, 15000, 20000];
  let dispatched = false, lastErr = null;
  for (let attempt = 0; attempt <= dispatchDelays.length; attempt++) {
    try {
      await ghReq("POST", "/repos/" + owner + "/" + repo + "/actions/workflows/deployview-android-session.yml/dispatches", {
        ref: defaultBranch,
        inputs: { working_directory: workDir, branch: targetBranch }
      }, token);
      dispatched = true;
      break;
    } catch (e) {
      lastErr = e;
      const notYetRegistered = /workflow_dispatch/.test(e.message) && /422/.test(e.message);
      if (!notYetRegistered || attempt === dispatchDelays.length) break;
      addLog(key, "Workflow not indexed by GitHub yet — retrying in " + (dispatchDelays[attempt] / 1000) + "s...");
      await sleep(dispatchDelays[attempt]);
    }
  }
  if (!dispatched) {
    addLog(key, "ERROR triggering workflow: " + lastErr.message);
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

  // Poll the Checks API for the "deployview-bridge" check run the workflow
  // posts once the tunnel is up. NOT the job-logs-download endpoint — that
  // 404s until the job reaches "completed", and this job is meant to stay
  // in_progress for the session's entire lifetime (confirmed against a
  // live run: the endpoint 404'd outright while the emulator step was
  // still running). Checks update live regardless of job completion.
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
      if (job) sessionStatus[key].jobId = job.id;
      const checks = await ghReq("GET", "/repos/" + owner + "/" + repo + "/commits/" + run.head_sha + "/check-runs", null, token);
      const cr = (checks.check_runs || []).find((c) => c.name === "deployview-bridge");
      if (cr && cr.output && cr.output.summary) {
        const info = JSON.parse(cr.output.summary);
        if (info && info.url && info.token) {
          bridgeUrl = info.url; bridgeToken = info.token; pkg = info.package || null;
          break;
        }
      }
    } catch (e) { /* check run not posted yet */ }
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
