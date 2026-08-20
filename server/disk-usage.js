/**
 * disk-usage.js — filesystem free-space check for the build workspace.
 *
 * Nothing in this codebase watched disk space before this. Each branch
 * gets its own full build output + node_modules under WORKSPACE (see
 * build/pipeline.js) with no cap and no shared cache across branches, so
 * a host running many active branches can fill its disk with no warning
 * until a build just starts failing with a raw ENOSPC.
 *
 * Prefers fs.statfsSync (Node 18.15+ / 19.6+, no subprocess) and falls
 * back to `df -Pk` on POSIX systems where statfs isn't available. No
 * equivalent fallback is attempted on Windows — reports unavailable there
 * instead of guessing at a wmic/PowerShell invocation.
 */

"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");

function getDiskUsage(dir) {
  try {
    if (typeof fs.statfsSync === "function") {
      const s = fs.statfsSync(dir);
      const totalBytes = s.blocks * s.bsize;
      const freeBytes = s.bavail * s.bsize; // available to unprivileged users, not raw free
      const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10 : null;
      return { available: true, path: dir, totalBytes, freeBytes, usedPercent, method: "statfs" };
    }
  } catch (_) { /* fall through to df */ }

  if (process.platform !== "win32") {
    try {
      const r = spawnSync("df", ["-Pk", dir], { encoding: "utf8", timeout: 3000 });
      if (r.status === 0 && r.stdout) {
        const lines = r.stdout.trim().split("\n");
        const cols = lines[lines.length - 1].trim().split(/\s+/);
        // Filesystem 1024-blocks Used Available Capacity Mounted-on
        const totalBytes = parseInt(cols[1], 10) * 1024;
        const freeBytes = parseInt(cols[3], 10) * 1024;
        const usedPercent = parseInt(cols[4], 10) || null;
        if (Number.isFinite(totalBytes) && Number.isFinite(freeBytes)) {
          return { available: true, path: dir, totalBytes, freeBytes, usedPercent, method: "df" };
        }
      }
    } catch (_) { /* fall through to unavailable */ }
  }

  return { available: false, path: dir, reason: "no statfs support and df unavailable/failed on this platform" };
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1024) return n + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(1) + " " + units[i];
}

module.exports = { getDiskUsage, fmtBytes };
