const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logStreams = []; // SSE connections

// F-M020: cap each per-key log file. When the existing file would exceed
// the cap, rotate to .log.1 (overwriting any prior .log.1) before writing
// the fresh contents. Single rotation depth keeps disk usage bounded
// without needing a full rotation chain.
const MAX_LOG_BYTES = parseInt(process.env.DV_MAX_LOG_BYTES, 10) || (5 * 1024 * 1024);

function logFileName(key) { return key.replace(/[\/\:]/g, "__") + ".log"; }

function saveLog(key, log) {
  try {
    const file = path.join(LOG_DIR, logFileName(key));
    const bytes = Buffer.byteLength(log, "utf8");
    if (bytes > MAX_LOG_BYTES) {
      // Truncate log to last MAX_LOG_BYTES bytes plus a notice.
      const tail = Buffer.from(log, "utf8").slice(-MAX_LOG_BYTES + 200).toString("utf8");
      const trimmed = "[log truncated to last " + Math.round(MAX_LOG_BYTES / 1024 / 1024) + " MiB]\n" + tail;
      // Rotate previous file once
      try { if (fs.existsSync(file)) fs.renameSync(file, file + ".1"); } catch (_) {}
      fs.writeFileSync(file, trimmed);
    } else {
      fs.writeFileSync(file, log);
    }
  } catch (e) {}
}

function loadLog(key) {
  try { return fs.readFileSync(path.join(LOG_DIR, logFileName(key)), "utf8"); } catch (e) { return ""; }
}

function broadcastLog(key, msg) {
  for (let i = logStreams.length - 1; i >= 0; i--) {
    const s = logStreams[i];
    if (s.closed) { logStreams.splice(i, 1); continue; }
    if (s.key === key) {
      try { s.res.write("data: " + JSON.stringify({ key, msg }) + "\n\n"); } catch (e) { logStreams.splice(i, 1); }
    }
  }
}

// Auto-cleanup stale SSE connections every 60 seconds
setInterval(function() {
  for (let i = logStreams.length - 1; i >= 0; i--) {
    if (logStreams[i].closed) logStreams.splice(i, 1);
  }
}, 60000);

module.exports = { saveLog, loadLog, broadcastLog, logStreams };
