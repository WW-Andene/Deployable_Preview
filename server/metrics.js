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

/**
 * Increment a counter. Default delta is 1.
 * @param {string} name
 * @param {number} [delta]
 */
function inc(name, delta) { counters[name] = (counters[name] || 0) + (delta == null ? 1 : delta); }

/**
 * Set a gauge to an absolute value.
 * @param {string} name
 * @param {number} value
 */
function set(name, value) { gauges[name] = value; }

// Fixed-bucket histogram. Bucket boundaries in ms.
const BUCKETS = [5, 25, 100, 250, 500, 1000, 2500, 10000, 30000];

/**
 * Record an observation in milliseconds against a histogram.
 * Buckets: 5/25/100/250/500/1000/2500/10000/30000 (+inf).
 * @param {string} name
 * @param {number} ms
 */
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

/**
 * Snapshot the current metrics as a JSON-serializable object.
 * @returns {{
 *   uptimeSec: number,
 *   timestamp: number,
 *   memoryMB: number,
 *   counters: Record<string, number>,
 *   gauges: Record<string, number>,
 *   histograms: Record<string, {count:number, mean:number, min:number, max:number, buckets: Array<{leMs:number|"+inf", count:number}>}>
 * }}
 */
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

// F-M005: Prometheus text-format exporter. Names are sanitised to
// [a-zA-Z_:][a-zA-Z0-9_:]*. Counters become _total; histograms expand to
// _bucket / _sum / _count.
function safeName(n) { return String(n).replace(/[^a-zA-Z0-9_:]/g, "_"); }
function prometheus() {
  const lines = [];
  lines.push("# HELP dv_uptime_seconds Process uptime");
  lines.push("# TYPE dv_uptime_seconds gauge");
  lines.push("dv_uptime_seconds " + Math.round(process.uptime()));
  lines.push("# HELP dv_memory_heap_bytes Resident heap size");
  lines.push("# TYPE dv_memory_heap_bytes gauge");
  lines.push("dv_memory_heap_bytes " + process.memoryUsage().heapUsed);
  for (const k of Object.keys(counters)) {
    const n = "dv_" + safeName(k) + "_total";
    lines.push("# TYPE " + n + " counter");
    lines.push(n + " " + counters[k]);
  }
  for (const k of Object.keys(gauges)) {
    const n = "dv_" + safeName(k);
    lines.push("# TYPE " + n + " gauge");
    lines.push(n + " " + gauges[k]);
  }
  for (const k of Object.keys(hists)) {
    const h = hists[k];
    const n = "dv_" + safeName(k) + "_ms";
    lines.push("# TYPE " + n + " histogram");
    let cumulative = 0;
    for (let i = 0; i < BUCKETS.length; i++) {
      cumulative += h.buckets[i];
      lines.push(n + '_bucket{le="' + BUCKETS[i] + '"} ' + cumulative);
    }
    cumulative += h.buckets[BUCKETS.length];
    lines.push(n + '_bucket{le="+Inf"} ' + cumulative);
    lines.push(n + "_sum " + h.sum);
    lines.push(n + "_count " + h.count);
  }
  return lines.join("\n") + "\n";
}

module.exports = { inc, set, observe, snapshot, prometheus };
