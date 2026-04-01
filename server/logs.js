const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logStreams = []; // SSE connections

function saveLog(key, log) {
  try { fs.writeFileSync(path.join(LOG_DIR, key.replace(/[\/\:]/g, "__") + ".log"), log); } catch (e) {}
}

function loadLog(key) {
  try { return fs.readFileSync(path.join(LOG_DIR, key.replace(/[\/\:]/g, "__") + ".log"), "utf8"); } catch (e) { return ""; }
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

module.exports = { saveLog, loadLog, broadcastLog, logStreams };
