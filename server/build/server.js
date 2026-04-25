/**
 * build/server.js — server-mode lifecycle (startServer + deployBranch + cancel).
 *
 * deployBranch is the dispatcher: routes to buildBranch (executor.js) for
 * static / pygame projects, otherwise startServer.
 *
 * Auto-restart on crash up to MAX_RESTARTS, with the same cancel-aware
 * setTimeout pattern as the executor.
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { runCmd, findFreePort, waitForPort, runningServers, killServer } = require("../process");
const { saveLog, broadcastLog } = require("../logs");
const { parseEnvVars } = require("../config");

const {
  buildStatus,
  buildLocks,
  countActiveBuilds,
  MAX_CONCURRENT_BUILDS,
  buildKey,
  branchSlug,
  getBranchDir,
  createLogger
} = require("./state");

const { detectLanguage, detectPygame, defaultStartCommand } = require("./detect");
const { updateRepo, resolveWorkDir, installDeps } = require("./pipeline");
const { captureThumbAsync } = require("./thumb");
const { buildBranch } = require("./executor");

const AUTO_RESTART_DELAY = 5000;
const MAX_RESTARTS = 3;

async function startServer(repoConfig, branchConfig, isRestart) {
  const { owner, repo } = repoConfig;
  const key = buildKey(owner, repo, branchConfig);

  // Prevent concurrent starts for the same key (allow restarts to proceed)
  if (buildLocks[key] && !isRestart) {
    console.log("[" + key + "] Server start already in progress, skipping");
    return;
  }
  // Enforce max concurrent builds (restarts skip the queue)
  if (!isRestart && countActiveBuilds() >= MAX_CONCURRENT_BUILDS) {
    console.log("[" + key + "] Max concurrent builds (" + MAX_CONCURRENT_BUILDS + ") reached, queuing...");
    buildStatus[key] = { status: "queued", log: "Waiting for build slot...\n", lastBuild: null, commitSha: "", mode: "server" };
    setTimeout(() => {
      const slot = buildStatus[key];
      if (!slot || slot.status !== "queued") return;
      Promise.resolve(startServer(repoConfig, branchConfig, false)).catch((e) => {
        console.error("[" + key + "] Server-queue retry failed: " + e.message);
        if (buildStatus[key]) { buildStatus[key].status = "error"; buildStatus[key].lastBuild = Date.now(); }
      });
    }, 5000);
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);
  killServer(key);

  const restarts = isRestart ? ((buildStatus[key] && buildStatus[key].restarts) || 0) : 0;
  buildStatus[key] = { status: "building", log: isRestart ? (buildStatus[key].log || "") : "", lastBuild: null, commitSha: "", mode: "server", restarts, startedAt: Date.now() };
  const addLog = createLogger(key);
  if (isRestart) addLog.setLog(buildStatus[key].log);

  try {
    if (!isRestart) {
      const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
      buildStatus[key].commitSha = sha;
    }

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);
    const language = detectLanguage(workDir, branchConfig);
    addLog("Language: " + language);
    if (!isRestart) await installDeps(workDir, addLog, language);

    const port = await findFreePort();
    const startCmd = branchConfig.startCommand || (language === "nodejs" ? repoConfig.startCommand : "") || defaultStartCommand(language);
    const userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");
    addLog((isRestart ? "Restarting" : "Starting") + " server: " + startCmd + " (port " + port + ")");

    const child = spawn("sh", ["-c", startCmd], {
      cwd: workDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production", ...userEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    });

    runningServers[key] = { proc: child, port, status: "starting", restarts };
    child.stdout.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); if (buildStatus[key]) buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.stderr.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); if (buildStatus[key]) buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.on("exit", (code) => {
      addLog("Server exited with code " + code);
      saveLog(key, addLog.getLog());
      if (runningServers[key] && runningServers[key].proc === child) {
        runningServers[key].status = "stopped";
        buildStatus[key].status = "error";
        if (restarts < MAX_RESTARTS && !runningServers[key].manualStop) {
          addLog("Auto-restarting in " + (AUTO_RESTART_DELAY / 1000) + "s (" + (restarts + 1) + "/" + MAX_RESTARTS + ")...");
          buildStatus[key].restarts = restarts + 1;
          setTimeout(() => {
            if (!buildStatus[key] || buildStatus[key].status !== "error") return;
            Promise.resolve(startServer(repoConfig, branchConfig, true)).catch((e) => {
              console.error("[" + key + "] Auto-restart failed: " + e.message);
            });
          }, AUTO_RESTART_DELAY);
        } else if (restarts >= MAX_RESTARTS) { addLog("Max restarts reached."); }
      }
    });

    addLog("Waiting for port " + port + "...");
    await waitForPort(port, 60000);

    let duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
    addLog("Server running on port " + port + " (started in " + duration + "s)");
    runningServers[key].status = "running";
    buildStatus[key].status = "running";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].duration = parseFloat(duration);
    buildStatus[key].serverPort = port;
    buildStatus[key].restarts = 0;
    saveLog(key, addLog.getLog());
    // Give the app a moment to finish rendering before grabbing a thumb
    captureThumbAsync(repoConfig.owner, repoConfig.repo, branchSlug(branchConfig), 3000);
  } catch (e) {
    addLog("SERVER FAILED: " + e.message);
    killServer(key);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
    saveLog(key, addLog.getLog());
  } finally {
    delete buildLocks[key];
  }
}

function deployBranch(repoConfig, branchConfig) {
  // Pygame projects always use static build (pygbag produces HTML/WASM)
  if (branchConfig.mode === "server") {
    // Quick-check: if language is python, peek for pygame and reroute to static
    let baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
    let branchDir = getBranchDir(repoConfig.owner, repoConfig.repo, branchConfig);
    let checkDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
    if ((branchConfig.language === "python" || branchConfig.language === "auto") && fs.existsSync(checkDir) && detectPygame(checkDir)) {
      console.log("[" + repoConfig.owner + "/" + repoConfig.repo + "] Pygame detected — using static build with pygbag instead of server mode");
      buildBranch(repoConfig, branchConfig);
      return;
    }
    startServer(repoConfig, branchConfig);
  } else {
    buildBranch(repoConfig, branchConfig);
  }
}

function cancelBuild(key) {
  if (buildLocks[key]) {
    delete buildLocks[key];
    if (buildStatus[key]) {
      buildStatus[key].status = "cancelled";
      buildStatus[key].lastBuild = Date.now();
    }
    killServer(key);
    return true;
  }
  return false;
}

module.exports = { startServer, deployBranch, cancelBuild };
