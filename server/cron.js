/**
 * cron.js — minimal 5-field cron parser + matcher.
 *
 * Supports the standard fields:  min hour day-of-month month day-of-week
 *   - "*"      — any
 *   - "5"      — exact value
 *   - "*\/N"   — every N steps (mod-zero on the field's value)
 *   - "1-5"    — inclusive range
 *   - "1,3,5"  — explicit list
 * Combinations like "1-5/2" or "*\/3,9" work too.
 *
 * No second-field, no L/W/# specials, no @yearly aliases — keep the
 * surface tight. Suitable for "rebuild every 3 hours", "rebuild
 * weekdays at 9am", etc.
 *
 * isCronTrigger(expr, date) → true if `date` matches the cron pattern
 * to-the-minute. Caller is responsible for not double-firing within a
 * minute (we record lastScheduledAt elsewhere).
 */

"use strict";

function _parseField(spec, lo, hi) {
  if (spec === "*" || spec === "?") return null; // null = wildcard match
  const out = new Set();
  for (const part of String(spec).split(",")) {
    let step = 1;
    let body = part;
    const slashIdx = body.indexOf("/");
    if (slashIdx >= 0) {
      step = parseInt(body.slice(slashIdx + 1), 10) || 1;
      body = body.slice(0, slashIdx);
    }
    let from = lo, to = hi;
    if (body !== "*" && body !== "") {
      const dashIdx = body.indexOf("-");
      if (dashIdx >= 0) {
        from = parseInt(body.slice(0, dashIdx), 10);
        to   = parseInt(body.slice(dashIdx + 1), 10);
      } else {
        from = to = parseInt(body, 10);
      }
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron must have 5 fields, got " + parts.length);
  return {
    min:  _parseField(parts[0], 0, 59),
    hour: _parseField(parts[1], 0, 23),
    dom:  _parseField(parts[2], 1, 31),
    mon:  _parseField(parts[3], 1, 12),
    dow:  _parseField(parts[4], 0, 6)   // Sun=0 … Sat=6
  };
}

function isCronTrigger(expr, date) {
  const d = date || new Date();
  let parsed;
  try { parsed = parseCron(expr); }
  catch (_) { return false; }
  if (parsed.min  && !parsed.min.has(d.getMinutes())) return false;
  if (parsed.hour && !parsed.hour.has(d.getHours())) return false;
  if (parsed.mon  && !parsed.mon.has(d.getMonth() + 1)) return false;
  // Per cron tradition: if BOTH dom and dow are restricted, an OR is
  // applied (match either). If only one is restricted, AND is fine.
  const domSet = parsed.dom, dowSet = parsed.dow;
  const domMatch = !domSet || domSet.has(d.getDate());
  const dowMatch = !dowSet || dowSet.has(d.getDay());
  if (domSet && dowSet) {
    if (!(domMatch || dowMatch)) return false;
  } else {
    if (!domMatch || !dowMatch) return false;
  }
  return true;
}

// Heuristic: does this look like a cron expression (vs a number of seconds)?
function looksLikeCron(s) { return typeof s === "string" && /\s/.test(s.trim()); }

module.exports = { parseCron, isCronTrigger, looksLikeCron };
