/**
 * audit.js — append-only operator audit log.
 *
 * Captures every mutating action against DV: deploys, rollbacks, env
 * changes, secret writes, webhook CRUD, env-group CRUD, etc. Each
 * entry: { ts, actor, action, target, ip, ...details }.
 *
 * Stored on disk under workspace/.audit.jsonl (one entry per line so
 * tailing is trivial). Rotated when it grows past 5MB — the previous
 * log moves to .audit.1.jsonl, single-depth so we don't accumulate
 * forever. Reading is ad-hoc via `tail` style: the GET endpoint
 * returns the last N entries.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const AUDIT_FILE = path.join(__dirname, "..", "workspace", ".audit.jsonl");
const MAX_BYTES  = 5 * 1024 * 1024;

let _writeChain = Promise.resolve();

function record(entry) {
  if (!entry || typeof entry !== "object") return;
  const line = JSON.stringify(Object.assign({ ts: Date.now() }, entry)) + "\n";
  _writeChain = _writeChain.then(async function() {
    try {
      // Rotate first if needed.
      try {
        const stat = fs.statSync(AUDIT_FILE);
        if (stat.size > MAX_BYTES) {
          await fs.promises.rename(AUDIT_FILE, AUDIT_FILE + ".1").catch(function(){});
        }
      } catch (_) { /* file doesn't exist yet — fine */ }
      await fs.promises.appendFile(AUDIT_FILE, line);
    } catch (e) {
      console.warn("[audit] write failed:", e.message);
    }
  });
  return _writeChain;
}

// tail(n) → last N entries (newest first), parsed.
function tail(n) {
  let raw = "";
  try { raw = fs.readFileSync(AUDIT_FILE, "utf8"); } catch (_) {}
  if (!raw) return [];
  const lines = raw.split("\n").filter(Boolean);
  const slice = lines.slice(-Math.max(1, Math.min(n || 200, 5000))).reverse();
  return slice.map(function(l){ try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

// Express middleware factory: records the request as an audit entry
// using an action label and a plucked subset of req.body / req.params.
function logAction(action, opts) {
  opts = opts || {};
  return function(req, res, next) {
    const targetParts = (opts.target || []).map(function(p){
      // "params.foo" / "body.foo"
      if (p.indexOf("params.") === 0) return req.params[p.slice(7)];
      if (p.indexOf("body.")   === 0) return (req.body || {})[p.slice(5)];
      return p;
    }).filter(Boolean).join(":");
    const detail = {};
    for (const k of (opts.bodyKeys || [])) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
        const v = req.body[k];
        // Don't log values of fields that look secret-y.
        if (/secret|password|token|key/i.test(k)) detail[k] = "[redacted]";
        else if (typeof v === "string" && v.length > 200) detail[k] = v.slice(0, 200) + "…";
        else detail[k] = v;
      }
    }
    record({
      action,
      target: targetParts,
      ip: req.ip || (req.connection && req.connection.remoteAddress) || "",
      ua: (req.headers["user-agent"] || "").slice(0, 120),
      method: req.method,
      path: req.path,
      detail
    });
    next();
  };
}

module.exports = { record, tail, logAction };
