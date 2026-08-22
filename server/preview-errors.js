/**
 * preview-errors.js — collector for runtime errors from deployed previews.
 *
 * The proxy injects a tiny window.onerror + unhandledrejection handler
 * into every HTML response. When the user's app throws, the handler
 * POSTs to /api/preview-errors with { msg, file, line, col, stack,
 * userAgent, url }. We dedupe by signature, cap at MAX per branch,
 * and surface counts on the dashboard so users see "5 runtime errors
 * since last build" without opening DevTools on the preview.
 *
 * No source-map upload — the existing /api/artifact ZIP includes the
 * map files alongside, and the dashboard links the user to the
 * deployed file via read_deployed_file. Keeps this server-side
 * surface tiny.
 */

"use strict";

const crypto = require("crypto");

const MAX_ERRORS_PER_KEY = 50;
const errorsByKey = new Map(); // key -> [{ id, sig, msg, file, line, col, stack, count, firstAt, lastAt, userAgent, url }]

function _sig(e) {
  return crypto.createHash("sha1")
    .update(String(e.msg || "") + "|" + String(e.file || "") + "|" + String(e.line || "") + "|" + String(e.col || ""))
    .digest("hex").slice(0, 16);
}

function record(key, e) {
  if (!key) return null;
  const sig = _sig(e);
  let arr = errorsByKey.get(key);
  if (!arr) { arr = []; errorsByKey.set(key, arr); }
  const existing = arr.find((x) => x.sig === sig);
  if (existing) {
    existing.count++;
    existing.lastAt = Date.now();
    existing.url = e.url || existing.url;
    return existing;
  }
  const entry = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
    sig,
    msg:       String(e.msg || "").slice(0, 500),
    file:      String(e.file || "").slice(0, 500),
    line:      Number(e.line) || 0,
    col:       Number(e.col)  || 0,
    stack:     String(e.stack || "").slice(0, 4000),
    url:       String(e.url   || "").slice(0, 500),
    userAgent: String(e.userAgent || "").slice(0, 200),
    count:     1,
    firstAt:   Date.now(),
    lastAt:    Date.now()
  };
  arr.unshift(entry);
  while (arr.length > MAX_ERRORS_PER_KEY) arr.pop();
  return entry;
}

function list(key)  { return errorsByKey.get(key) || []; }
function clear(key) { errorsByKey.delete(key); }
function summary(key) {
  const arr = list(key);
  let totalEvents = 0;
  for (const e of arr) totalEvents += e.count;
  return { uniqueErrors: arr.length, totalEvents };
}

// The injected client-side collector. Tiny on purpose; runs in the
// user's app context. Posts via fetch() with keepalive so an error in
// onbeforeunload still reaches us.
function collectorScript(postUrl) {
  return "<script>(function(){"
    + "function send(p){try{fetch(" + JSON.stringify(postUrl) + ",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(function(){});}catch(_){}}"
    + "window.addEventListener('error',function(e){send({msg:e.message||String(e),file:e.filename,line:e.lineno,col:e.colno,stack:e.error&&e.error.stack||'',url:location.href,userAgent:navigator.userAgent});},true);"
    + "window.addEventListener('unhandledrejection',function(e){var r=e.reason;send({msg:'unhandledrejection: '+(r&&r.message||String(r)),stack:r&&r.stack||'',url:location.href,userAgent:navigator.userAgent});});"
    + "})();<\/script>";
}

module.exports = { record, list, clear, summary, collectorScript };
