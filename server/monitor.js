/**
 * monitor.js — periodic health checks against every deployed preview.
 *
 * Every DV_HEALTH_INTERVAL_MS (default 60s) we hit the root URL of each
 * ready/running preview. If we get a non-2xx (or hard timeout / network
 * error), we mark buildStatus[key].health = "broken" with a reason.
 * 2xx flips it back to "ok". Surfaced via the SSE status stream so the
 * dashboard can red-tint broken rows in real time.
 *
 * Runs in-process; uses a tight 5s per-check timeout. Skipped entirely
 * when DV_DISABLE_HEALTH=1 (useful for dev / CI).
 *
 * I5: also drives the scheduled-rebuild loop. branchConfig.schedule is
 * a "every N seconds" interval (number) — we're keeping the syntax
 * trivial; cron expressions are overkill for periodic rebuilds.
 */

"use strict";

const http  = require("http");
const https = require("https");
const url   = require("url");

const HEALTH_INTERVAL_MS = parseInt(process.env.DV_HEALTH_INTERVAL_MS, 10) || 60000;
const HEALTH_TIMEOUT_MS  = parseInt(process.env.DV_HEALTH_TIMEOUT_MS,  10) || 5000;
const DISABLED = process.env.DV_DISABLE_HEALTH === "1";

let _started = false;
let _timer   = null;

function _ping(targetUrl) {
  return new Promise(function(resolve) {
    let parsed;
    try { parsed = url.parse(targetUrl); } catch (_) { return resolve({ ok: false, error: "url parse" }); }
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request({
      method: "GET",
      hostname: parsed.hostname || "127.0.0.1",
      port: parsed.port,
      path: parsed.path || "/",
      headers: { "User-Agent": "DeployView-Monitor/1.0" },
      timeout: HEALTH_TIMEOUT_MS
    }, function(res) {
      res.resume();
      res.on("end", function() { resolve({ ok: res.statusCode < 400, statusCode: res.statusCode }); });
    });
    req.on("error", function(err) { resolve({ ok: false, error: err.message }); });
    req.on("timeout", function() { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.end();
  });
}

async function _runOnce() {
  let buildState, config;
  try {
    buildState = require("./build");
    config = require("./config").getConfig();
  } catch (_) { return; }

  const { buildStatus, branchSlug, deployBranch, broadcastStatus } = buildState;
  const now = Date.now();

  // ── Health checks for every ready/running preview ───────────────────
  // Local pings only — we hit the loopback port so cloudflared/ngrok
  // bandwidth isn't burned on health probes.
  const port = parseInt(process.env.PORT, 10) || 3000;
  const targets = [];
  for (const r of (config.repos || [])) {
    for (const bc of (r.activeBranches || [])) {
      const slug = branchSlug(bc);
      const key = r.owner + "/" + r.repo + ":" + slug;
      const slot = buildStatus[key];
      if (!slot) continue;
      if (slot.status !== "ready" && slot.status !== "running") continue;
      targets.push({ key, url: "http://127.0.0.1:" + port + "/preview/" + r.owner + "/" + r.repo + "/" + slug + "/" });
    }
  }

  await Promise.all(targets.map(async function(t) {
    const r = await _ping(t.url);
    const slot = buildStatus[t.key];
    if (!slot) return;
    const previousHealth = slot.health || "unknown";
    const nextHealth = r.ok ? "ok" : "broken";
    const reason = r.ok ? "" : (r.error || ("HTTP " + r.statusCode));
    if (previousHealth === nextHealth && (slot.healthReason || "") === reason) return;
    slot.health = nextHealth;
    slot.healthReason = reason;
    slot.healthCheckedAt = now;
    try { broadcastStatus(t.key, slot); } catch (_) {}
    if (previousHealth === "ok" && nextHealth === "broken") {
      console.warn("[monitor] " + t.key + " went broken: " + reason);
      try {
        require("./webhooks").emit("build.error", {
          repo: t.key.split(":")[0],
          slug: t.key.split(":")[1],
          error: "Health check failed: " + reason,
          previewUrl: "/preview/" + t.key.split(":")[0] + "/" + t.key.split(":")[1] + "/"
        });
      } catch (_) {}
    }
  }));

  // ── Scheduled rebuilds (I5) ───────────────────────────────────────
  // bc.schedule = number of seconds between auto-rebuilds. Last fire
  // tracked on buildStatus[key].lastScheduledAt so we don't double-fire
  // on tight tick intervals.
  for (const r of (config.repos || [])) {
    for (const bc of (r.activeBranches || [])) {
      const periodSec = Number(bc.schedule);
      if (!Number.isFinite(periodSec) || periodSec < 30) continue; // 30s floor
      const key = r.owner + "/" + r.repo + ":" + branchSlug(bc);
      const slot = buildStatus[key] || {};
      const last = slot.lastScheduledAt || 0;
      if (now - last < periodSec * 1000) continue;
      // Don't pile on if a build is already in flight or the slot was
      // most recently built within the interval.
      if (slot.status === "building" || slot.status === "queued") continue;
      if (slot.lastBuild && now - slot.lastBuild < periodSec * 1000) continue;
      console.log("[monitor] scheduled rebuild: " + key + " (every " + periodSec + "s)");
      slot.lastScheduledAt = now;
      try { deployBranch(r, bc); } catch (e) { console.error("[monitor] scheduled rebuild failed: " + e.message); }
    }
  }
}

function start() {
  if (_started || DISABLED) return;
  _started = true;
  _timer = setInterval(function() {
    _runOnce().catch(function(e) { console.error("[monitor] loop error:", e.message); });
  }, HEALTH_INTERVAL_MS);
  if (typeof _timer.unref === "function") _timer.unref();
  // First run kicked off shortly after boot so the user sees something
  // within seconds, not minutes.
  setTimeout(function() { _runOnce().catch(function(){}); }, 8000).unref();
}
function stop() { if (_timer) clearInterval(_timer); _timer = null; _started = false; }

module.exports = { start, stop, runOnce: _runOnce };
