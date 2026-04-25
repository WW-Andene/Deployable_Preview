// analytics.js — DV server-side metrics dashboard.
//
// Consumes GET /api/metrics every 3s and shows:
//   - process gauges (uptime, heap, etc.)
//   - top counters (request totals, build totals, ok/fail per tool)
//   - histograms as a tiny SVG bar chart per series + p50/p95/max line
//
// Pure SVG — no chart library, no extra deps. The rendering recomputes
// from scratch on every poll so the view is always fresh; tradeoff is
// fine for a low-traffic operator dashboard.
(function(){
var S = DV.S, el = DV.el, api = DV.api;

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "G";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return String(n);
}

function fmtMs(n) {
  if (n == null) return "—";
  if (n < 1) return "<1ms";
  if (n < 1000) return Math.round(n) + "ms";
  return (n / 1000).toFixed(2) + "s";
}

function fmtUptime(s) {
  if (!s) return "0s";
  var d = Math.floor(s / 86400); s -= d * 86400;
  var h = Math.floor(s / 3600);  s -= h * 3600;
  var m = Math.floor(s / 60);    s -= m * 60;
  return (d ? d + "d " : "") + (h ? h + "h " : "") + (m ? m + "m " : "") + Math.floor(s) + "s";
}

function statTile(label, value, sub) {
  return el("div", { c: "stat-tile" }, [
    el("div", { c: "stat-tile-value" }, value),
    el("div", { c: "stat-tile-label" }, label),
    sub ? el("div", { c: "stat-tile-sub" }, sub) : null
  ].filter(Boolean));
}

function histChart(name, h) {
  // Bar chart over buckets. Heights are bucket counts normalised by max.
  var buckets = h.buckets || [];
  var max = 0;
  for (var i = 0; i < buckets.length; i++) if (buckets[i].count > max) max = buckets[i].count;
  if (max === 0) return el("div", { c: "color-tx3 text-12" }, "no samples yet");
  var W = 280, H = 60, n = buckets.length, bw = W / n;
  var bars = "";
  for (var b = 0; b < n; b++) {
    var bh = max ? (buckets[b].count / max) * (H - 4) : 0;
    var x = b * bw + 1;
    var y = H - bh;
    bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 2) + '" height="' + bh + '" fill="var(--accent)"/>';
  }
  var labelStrip = el("div", { c: "hist-label-strip" });
  for (var bi = 0; bi < buckets.length; bi++) {
    labelStrip.appendChild(el("span", { c: "hist-label-cell" }, String(buckets[bi].leMs)));
  }
  var svgWrap = document.createElement("div");
  svgWrap.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" class="hist-svg">' + bars + '</svg>';
  return el("div", { c: "hist-row" }, [
    el("div", { c: "hist-meta" }, [
      el("div", { c: "hist-name" }, name),
      el("div", { c: "color-tx3 text-11" }, "n=" + h.count + " · mean " + fmtMs(h.mean) + " · min " + fmtMs(h.min) + " · max " + fmtMs(h.max))
    ]),
    svgWrap.firstChild,
    labelStrip
  ]);
}

DV.views.analytics = function(app) {
  var page = el("div", { c: "settings-page" });
  page.appendChild(el("h2", { c: "page-title" }, "Analytics"));

  var live = el("div", { c: "color-tx3 text-12 mb-12" }, "Auto-refreshing every 3s · " + (S._metricsLastAt ? "last " + Math.round((Date.now() - S._metricsLastAt) / 1000) + "s ago" : "loading…"));
  page.appendChild(live);

  var grid = el("div", { c: "stat-tile-grid" });
  page.appendChild(grid);

  var countersWrap = el("div", { c: "settings-section" });
  countersWrap.appendChild(el("h3", { c: "settings-section-title" }, "Counters"));
  var countersBody = el("div", {});
  countersWrap.appendChild(countersBody);
  page.appendChild(countersWrap);

  var histWrap = el("div", { c: "settings-section" });
  histWrap.appendChild(el("h3", { c: "settings-section-title" }, "Histograms (latency, ms)"));
  var histBody = el("div", {});
  histWrap.appendChild(histBody);
  page.appendChild(histWrap);

  function paint(snap) {
    if (!snap) { grid.textContent = "Could not load metrics."; return; }
    grid.innerHTML = "";
    grid.appendChild(statTile("Uptime", fmtUptime(snap.uptimeSec)));
    grid.appendChild(statTile("Heap", snap.memoryMB + " MB"));
    grid.appendChild(statTile("Tools defined", String(snap.gauges && snap.gauges["tools.count"] != null ? snap.gauges["tools.count"] : "—")));
    grid.appendChild(statTile("Counters", String(Object.keys(snap.counters || {}).length)));
    grid.appendChild(statTile("Histograms", String(Object.keys(snap.histograms || {}).length)));

    countersBody.innerHTML = "";
    var ctrs = snap.counters || {};
    var entries = Object.keys(ctrs).map(function(k){ return [k, ctrs[k]]; }).sort(function(a, b){ return b[1] - a[1]; });
    if (!entries.length) {
      countersBody.appendChild(el("div", { c: "color-tx3 text-12" }, "No counters recorded yet."));
    } else {
      for (var i = 0; i < entries.length; i++) {
        countersBody.appendChild(el("div", { c: "counter-row" }, [
          el("span", { c: "counter-name" }, entries[i][0]),
          el("span", { c: "counter-value" }, fmt(entries[i][1]))
        ]));
      }
    }

    histBody.innerHTML = "";
    var hists = snap.histograms || {};
    var hkeys = Object.keys(hists).sort();
    if (!hkeys.length) {
      histBody.appendChild(el("div", { c: "color-tx3 text-12" }, "No histograms recorded yet."));
    } else {
      for (var hi = 0; hi < hkeys.length; hi++) {
        histBody.appendChild(histChart(hkeys[hi], hists[hkeys[hi]]));
      }
    }
  }

  function refresh() {
    api("GET", "/api/metrics").then(function(snap) {
      S._metricsLastAt = Date.now();
      live.textContent = "Auto-refreshing every 3s · last just now";
      paint(snap);
    }).catch(function() { paint(null); });
  }
  refresh();
  if (S._metricsTimer) clearInterval(S._metricsTimer);
  S._metricsTimer = setInterval(function() {
    if (S.view !== "analytics") { clearInterval(S._metricsTimer); S._metricsTimer = null; return; }
    refresh();
  }, 3000);

  app.appendChild(page);
};
})();
