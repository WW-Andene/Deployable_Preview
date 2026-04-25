const fs = require("fs");
const fsp = fs.promises;
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

// F-NEW-B001: per-key write queue. saveLog() returns immediately; the
// actual disk write happens async, serialized per file. Bursty builds
// no longer stall the event loop with sync writes.
const _writeQueues = new Map(); // key → Promise (chain)

function _writeQueued(file, log) {
  return (async () => {
    try {
      const bytes = Buffer.byteLength(log, "utf8");
      if (bytes > MAX_LOG_BYTES) {
        const tail = Buffer.from(log, "utf8").slice(-MAX_LOG_BYTES + 200).toString("utf8");
        const trimmed = "[log truncated to last " + Math.round(MAX_LOG_BYTES / 1024 / 1024) + " MiB]\n" + tail;
        try { await fsp.rename(file, file + ".1"); } catch (_) {}
        await fsp.writeFile(file, trimmed);
      } else {
        await fsp.writeFile(file, log);
      }
    } catch (_) { /* swallow — best-effort logging */ }
  })();
}

function saveLog(key, log) {
  const file = path.join(LOG_DIR, logFileName(key));
  // Chain on the previous queued write so two saveLog() in quick
  // succession don't race; tail of the chain is what's on disk.
  const prev = _writeQueues.get(key) || Promise.resolve();
  const next = prev.then(() => _writeQueued(file, log));
  _writeQueues.set(key, next);
  // Drop the queue entry once it settles so the map doesn't leak.
  next.finally(() => { if (_writeQueues.get(key) === next) _writeQueues.delete(key); });
}

function loadLog(key) {
  // Synchronous because callers (HTTP route handlers) expect a string return.
  // Reads are O(few KB) and cached at the OS level — tolerable.
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
