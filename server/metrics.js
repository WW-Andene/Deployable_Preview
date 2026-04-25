/**
 * metrics.js — lightweight in-process metrics.
 *
 * No external deps. Counters, gauges, and a tiny histogram for latencies.
 * Exposed via GET /api/metrics.
 */

"use strict";

const counters = Object.create(null);
const gauges   = Object.create(null);
const hists    = Object.create(null);

function inc(name, delta) { counters[name] = (counters[name] || 0) + (delta == null ? 1 : delta); }
function set(name, value) { gauges[name] = value; }

// Fixed-bucket histogram. Bucket boundaries in ms.
const BUCKETS = [5, 25, 100, 250, 500, 1000, 2500, 10000, 30000];
function observe(name, ms) {
  if (!hists[name]) hists[name] = { count: 0, sum: 0, min: Infinity, max: -Infinity, buckets: new Array(BUCKETS.length + 1).fill(0) };
  const h = hists[name];
  h.count++;
  h.sum += ms;
  if (ms < h.min) h.min = ms;
  if (ms > h.max) h.max = ms;
  let bi = BUCKETS.findIndex(function(b){ return ms <= b; });
  if (bi < 0) bi = BUCKETS.length;
  h.buckets[bi]++;
}

function snapshot() {
  const out = {
    uptimeSec: Math.round(process.uptime()),
    timestamp: Date.now(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    counters: Object.assign({}, counters),
    gauges: Object.assign({}, gauges),
    histograms: {}
  };
  for (const k of Object.keys(hists)) {
    const h = hists[k];
    out.histograms[k] = {
      count: h.count,
      mean: h.count ? Math.round(h.sum / h.count) : 0,
      min:  h.count ? Math.round(h.min) : 0,
      max:  h.count ? Math.round(h.max) : 0,
      buckets: BUCKETS.map(function(b, i){ return { leMs: b, count: h.buckets[i] }; }).concat([{ leMs: "+inf", count: h.buckets[BUCKETS.length] }])
    };
  }
  return out;
}

module.exports = { inc, set, observe, snapshot };
