// views/branch-row.js — DOM helpers for dashboard branch rows.
//
// Two responsibilities currently:
//   1. computeStatusSignal(bs, errCount) — reduce 6+ competing pills
//      (build status, broken health, secret-scan, budget, runtime
//      errors, ready) to a single canonical pill via worst-of cascade.
//   2. formatBytes(n) — used in 3 places already (status row, history
//      label, diff modal), de-duplicate.
//
// Phase C2 will add buildActionMenu() here too — the inline "•••"
// overflow that hides 8+ secondary actions behind one entry point.
//
// Loaded via index.html before views/dashboard.js. Exposes everything
// on DV.branchRow.

(function () {
"use strict";

// Severity ladder, highest first. The first matching condition wins —
// keeps the row from showing 6 pills shouting for attention. Text and
// hint surface on hover; class controls colour.
//
// Returns { level, text, title, className } or null when status is
// idle / unknown.
function computeStatusSignal(bs, runtimeErrCount) {
  if (!bs) return null;

  // Collect *all* current issues so the worst-of pill's tooltip can name
  // the secondary ones. Without this the user sees one pill and never
  // learns that, say, a budget violation also fired.
  var alsoLines = [];
  if (bs.status !== "error" && bs.health === "broken") alsoLines.push("· broken: " + (bs.healthReason || "health check failed"));
  if (Array.isArray(bs.secretFindings) && bs.secretFindings.length) alsoLines.push("· " + bs.secretFindings.length + " possible leaked secret(s)");
  if (Array.isArray(bs.budgetViolations) && bs.budgetViolations.length) alsoLines.push("· over budget: " + bs.budgetViolations.map(function(v){ return v.message; }).join("; "));
  if (runtimeErrCount && runtimeErrCount.uniqueErrors) alsoLines.push("· " + runtimeErrCount.uniqueErrors + " runtime error(s)");
  function withAlso(primary, title) {
    var rest = alsoLines.filter(function(_, i) { return i !== primary; });
    if (!rest.length) return title;
    return title + "\nAlso:\n" + rest.join("\n");
  }

  // Hard error / build failure
  if (bs.status === "error") {
    return {
      level: "error",
      text: "Failed",
      title: withAlso(-1, "Build or server failed — open the log for details"),
      className: "pill pill-err"
    };
  }
  // Self-monitor said the live preview isn't responding
  if (bs.health === "broken") {
    return {
      level: "broken",
      text: "Broken",
      title: withAlso(0, "Health check failed: " + (bs.healthReason || "unknown")),
      className: "pill pill-err"
    };
  }
  // Secret scan tripped
  if (Array.isArray(bs.secretFindings) && bs.secretFindings.length) {
    return {
      level: "secret",
      text: bs.secretFindings.length + " leak" + (bs.secretFindings.length === 1 ? "" : "s"),
      title: withAlso(1, bs.secretFindings.length + " possible leaked secret(s) — open log for details"),
      className: "pill pill-err"
    };
  }
  // Budget violation
  if (Array.isArray(bs.budgetViolations) && bs.budgetViolations.length) {
    return {
      level: "budget",
      text: "Over budget",
      title: withAlso(2, bs.budgetViolations.map(function (v) { return v.message; }).join("\n")),
      className: "pill pill-warn"
    };
  }
  // Runtime errors collected from the deployed app
  if (runtimeErrCount && runtimeErrCount.uniqueErrors) {
    return {
      level: "runtime",
      text: runtimeErrCount.uniqueErrors + " runtime",
      title: withAlso(3, runtimeErrCount.totalEvents + " runtime event(s) across " +
             runtimeErrCount.uniqueErrors + " unique error(s) — click the row's runtime pill to inspect"),
      className: "pill pill-warn"
    };
  }
  // In-flight states
  if (bs.status === "queued") {
    return { level: "queued", text: "Queued", title: "Waiting for a build slot", className: "pill" };
  }
  if (bs.status === "building") {
    return { level: "building", text: "Building", title: "Build in progress", className: "pill pill-info" };
  }
  if (bs.status === "running") {
    return { level: "running", text: "Running", title: "Server-mode preview running", className: "pill pill-ok" };
  }
  if (bs.status === "ready") {
    return { level: "ready", text: "Ready", title: "Build succeeded", className: "pill pill-ok" };
  }
  return { level: "idle", text: "Idle", title: "Never built", className: "pill" };
}

// Standard byte formatter. < 1 KiB → "342 B", < 1 MiB → "12.3 KB",
// otherwise "4.21 MB". Tabular-nums-friendly.
function formatBytes(n) {
  if (n == null || isNaN(n)) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

window.DV = window.DV || {};
window.DV.branchRow = { computeStatusSignal: computeStatusSignal, formatBytes: formatBytes };
})();
