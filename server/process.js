const { exec } = require("child_process");
const net = require("net");

function runCmd(cmd, cwd, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 600000, env: { ...process.env, CI: "true", ...(extraEnv || {}) } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error("Exit " + code + "\n" + (stderr || "").slice(-2000)));
    });
    child.on("error", reject);
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => { const port = srv.address().port; srv.close(() => resolve(port)); });
    srv.on("error", reject);
  });
}

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => { sock.destroy(); retry(); });
      sock.once("timeout", () => { sock.destroy(); retry(); });
      sock.connect(port, "127.0.0.1");
    }
    function retry() {
      if (Date.now() - start > timeout) reject(new Error("Server did not start within " + (timeout / 1000) + "s"));
      else setTimeout(check, 500);
    }
    check();
  });
}

// Running server process tracking
const runningServers = {};

function killServer(key) {
  const srv = runningServers[key];
  if (!srv || !srv.proc) return;
  try { process.kill(-srv.proc.pid, "SIGTERM"); } catch (e) {
    try { srv.proc.kill("SIGTERM"); } catch (e2) {}
  }
  // SIGKILL fallback after 5s if process is still alive
  const pid = srv.proc.pid;
  setTimeout(() => {
    try { process.kill(pid, 0); /* check if alive */ process.kill(-pid, "SIGKILL"); } catch (_) {}
    try { process.kill(pid, 0); process.kill(pid, "SIGKILL"); } catch (_) {}
  }, 5000);
  delete runningServers[key];
}

module.exports = { runCmd, findFreePort, waitForPort, runningServers, killServer };
