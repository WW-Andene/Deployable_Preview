/**
 * webhooks.js — outgoing build-event webhooks (Slack / Discord / custom).
 *
 * Users register webhook URLs in config.webhooks[]. Each entry:
 *   { id, url, events: ["build.ready", "build.error", ...], format,
 *     enabled: true, secret? }
 *
 * On every build state transition, emit() is called with the event name
 * and a payload. Subscribers whose `events` includes that name (or "*")
 * get a fire-and-forget POST. Failures are logged but never thrown.
 *
 * Format options: "json" (default), "slack", "discord". Slack/Discord
 * shape the body to fit their incoming-webhook contract.
 *
 * If `secret` is set, an HMAC-SHA256 signature is sent as the
 * `X-DV-Signature` header so the receiver can verify authenticity.
 */

"use strict";

const https = require("https");
const http  = require("http");
const url   = require("url");
const crypto = require("crypto");

const { getConfig, saveConfig } = require("./config");

const VALID_EVENTS = [
  "build.queued",
  "build.started",
  "build.ready",
  "build.error",
  "build.cancelled",
  "deploy.rolledback"
];

// ── Subscriber CRUD (used by /api/webhooks/* routes + MCP tool) ─────────────

function listWebhooks() {
  const cfg = getConfig();
  return Array.isArray(cfg.webhooks) ? cfg.webhooks : [];
}

function addWebhook(entry) {
  if (!entry || !entry.url) throw new Error("url required");
  // Reject obviously broken URLs early.
  let parsed;
  try { parsed = new URL(entry.url); } catch (e) { throw new Error("invalid url: " + e.message); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("only http(s) URLs accepted");
  const cfg = getConfig();
  if (!Array.isArray(cfg.webhooks)) cfg.webhooks = [];
  const id = "wh_" + crypto.randomBytes(6).toString("base64url");
  const events = Array.isArray(entry.events) && entry.events.length ? entry.events : ["*"];
  // Validate event names if not wildcard
  for (const e of events) {
    if (e !== "*" && VALID_EVENTS.indexOf(e) === -1) {
      throw new Error("unknown event: " + e + " (valid: " + VALID_EVENTS.join(", ") + ")");
    }
  }
  const wh = {
    id,
    url: entry.url,
    events,
    format: entry.format || "json",
    enabled: entry.enabled !== false,
    secret: entry.secret || "",
    label: entry.label || ""
  };
  cfg.webhooks.push(wh);
  saveConfig();
  return wh;
}

function removeWebhook(id) {
  const cfg = getConfig();
  if (!Array.isArray(cfg.webhooks)) return false;
  const before = cfg.webhooks.length;
  cfg.webhooks = cfg.webhooks.filter((w) => w.id !== id);
  if (cfg.webhooks.length === before) return false;
  saveConfig();
  return true;
}

function updateWebhook(id, patch) {
  const cfg = getConfig();
  if (!Array.isArray(cfg.webhooks)) return null;
  const wh = cfg.webhooks.find((w) => w.id === id);
  if (!wh) return null;
  patch = patch || {};
  // Validate the same way addWebhook does — without this an update can
  // smuggle in an invalid URL, an unknown event name, or an unsupported
  // format, and emit() will silently never fire the subscriber.
  if (Object.prototype.hasOwnProperty.call(patch, "url")) {
    let parsed;
    try { parsed = new URL(patch.url); } catch (e) { throw new Error("invalid url: " + e.message); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("only http(s) URLs accepted");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "events")) {
    if (!Array.isArray(patch.events) || !patch.events.length) throw new Error("events must be a non-empty array");
    for (const e of patch.events) {
      if (e !== "*" && VALID_EVENTS.indexOf(e) === -1) {
        throw new Error("unknown event: " + e + " (valid: " + VALID_EVENTS.join(", ") + ")");
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "format")) {
    if (["json", "slack", "discord"].indexOf(patch.format) === -1) {
      throw new Error("unknown format: " + patch.format + " (valid: json, slack, discord)");
    }
  }
  for (const k of ["url", "events", "format", "enabled", "secret", "label"]) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) wh[k] = patch[k];
  }
  saveConfig();
  return wh;
}

// ── Outbound dispatch ───────────────────────────────────────────────────────

function _shapePayload(format, event, payload) {
  if (format === "slack") {
    const lines = [];
    lines.push("*DeployView · " + event + "*");
    if (payload.repo)      lines.push("repo: `" + payload.repo + "`");
    if (payload.branch)    lines.push("branch: `" + payload.branch + "`");
    if (payload.commitSha) lines.push("sha: `" + String(payload.commitSha).slice(0, 7) + "`");
    if (payload.duration != null) lines.push("duration: " + payload.duration + "s");
    if (payload.previewUrl) lines.push("preview: " + payload.previewUrl);
    if (payload.error)     lines.push("error: " + payload.error);
    return { text: lines.join("\n") };
  }
  if (format === "discord") {
    const colorMap = {
      "build.ready": 0x4ade80, "build.error": 0xef4444,
      "build.started": 0x60a5fa, "build.queued": 0xa78bfa,
      "build.cancelled": 0x9ca3af, "deploy.rolledback": 0xfbbf24
    };
    return {
      embeds: [{
        title: "DeployView · " + event,
        color: colorMap[event] || 0xd4a030,
        fields: [
          payload.repo      && { name: "Repo",   value: "`" + payload.repo + "`",   inline: true },
          payload.branch    && { name: "Branch", value: "`" + payload.branch + "`", inline: true },
          payload.commitSha && { name: "SHA",    value: "`" + String(payload.commitSha).slice(0, 7) + "`", inline: true },
          payload.duration != null && { name: "Duration", value: payload.duration + "s", inline: true },
          payload.previewUrl && { name: "Preview", value: payload.previewUrl, inline: false },
          payload.error      && { name: "Error", value: "```" + String(payload.error).slice(0, 800) + "```", inline: false }
        ].filter(Boolean),
        timestamp: new Date().toISOString()
      }]
    };
  }
  // default: raw JSON envelope
  return { event, timestamp: Date.now(), ...payload };
}

function _post(targetUrl, body, secret, format) {
  return new Promise(function(resolve) {
    let parsed;
    try { parsed = url.parse(targetUrl); } catch (_) { return resolve({ ok: false, error: "url parse" }); }
    const lib = parsed.protocol === "http:" ? http : https;
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": data.length,
      "User-Agent": "DeployView-Webhook/1.0"
    };
    if (secret) {
      const sig = crypto.createHmac("sha256", secret).update(data).digest("hex");
      headers["X-DV-Signature"] = "sha256=" + sig;
    }
    const req = lib.request({
      method: "POST",
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      headers,
      timeout: 10000
    }, function(res) {
      // Drain so the socket can be reused
      res.resume();
      res.on("end", function() {
        resolve({ ok: res.statusCode < 400, statusCode: res.statusCode });
      });
    });
    req.on("error", function(err) { resolve({ ok: false, error: err.message }); });
    req.on("timeout", function() { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.write(data);
    req.end();
  });
}

// emit(eventName, payload) — fire-and-forget. Errors logged, never thrown.
function emit(event, payload) {
  if (VALID_EVENTS.indexOf(event) === -1) return;
  const subs = listWebhooks().filter((w) => w.enabled && (w.events.indexOf("*") !== -1 || w.events.indexOf(event) !== -1));
  if (!subs.length) return;
  for (const wh of subs) {
    const body = _shapePayload(wh.format, event, payload);
    _post(wh.url, body, wh.secret, wh.format).then(function(r) {
      if (!r.ok) console.warn("[webhook] " + wh.id + " " + event + " failed: " + (r.error || r.statusCode));
    });
  }
}

module.exports = {
  VALID_EVENTS,
  listWebhooks,
  addWebhook,
  removeWebhook,
  updateWebhook,
  emit
};
