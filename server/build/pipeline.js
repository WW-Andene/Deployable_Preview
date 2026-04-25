/**
 * build/pipeline.js — shared pipeline steps used by both static + server modes.
 *
 *   updateRepo(...)     — clone or fetch+reset, scrub the token from the remote
 *   resolveWorkDir(...) — apply branchConfig.baseDir on top of branchDir
 *   installDeps(...)    — language-specific dependency install
 *
 * Pure with respect to buildStatus — uses addLog (closure over buildStatus)
 * provided by the caller.
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const { runCmd } = require("../process");
const { getConfig } = require("../config");
const { detectPygame } = require("./detect");

async function updateRepo(owner, repo, branch, branchDir, addLog) {
  const config = getConfig();
  if (!fs.existsSync(path.join(branchDir, ".git"))) {
    // Clean up if dir exists but has no .git (corrupt/partial clone)
    if (fs.existsSync(branchDir)) {
      addLog("Cleaning stale directory...");
      await runCmd("rm -rf " + JSON.stringify(branchDir));
    }
    addLog("Cloning " + owner + "/" + repo + " (branch: " + branch + ")...");
    fs.mkdirSync(branchDir, { recursive: true });
    await runCmd("git clone --branch " + JSON.stringify(branch) + " --single-branch --depth 1 https://" + config.token + "@github.com/" + owner + "/" + repo + ".git .", branchDir);
  } else {
    addLog("Updating branch: " + branch);
    await runCmd("git fetch origin " + JSON.stringify(branch), branchDir);
    await runCmd("git reset --hard origin/" + JSON.stringify(branch), branchDir);
  }
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
  } catch (e) {
    addLog("WARNING: Could not read commit SHA: " + e.message);
  }
  // Remove token from git remote to avoid credential leakage in workspace
  try {
    execSync("git remote set-url origin https://github.com/" + owner + "/" + repo + ".git", { cwd: branchDir, stdio: "ignore" });
  } catch (_) {}
  addLog("Commit: " + sha.slice(0, 7));
  return sha;
}

function resolveWorkDir(branchDir, branchConfig, repoConfig, addLog) {
  const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
  const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
  if (baseDir) {
    addLog("Base directory: " + baseDir);
    if (!fs.existsSync(workDir)) throw new Error("Base directory '" + baseDir + "' not found in repo");
  }
  return workDir;
}

async function installDeps(workDir, addLog, language) {
  if (language === "java") {
    addLog("Java project detected — skipping npm install");
    return;
  }
  if (language === "python") {
    addLog("Installing Python dependencies...");
    let pip = "python -m pip install --break-system-packages";
    if (fs.existsSync(path.join(workDir, "Pipfile"))) {
      await runCmd(pip + " pipenv && pipenv install --deploy --system", workDir);
    } else if (fs.existsSync(path.join(workDir, "pyproject.toml"))) {
      await runCmd(pip + " .", workDir);
    } else if (fs.existsSync(path.join(workDir, "requirements.txt"))) {
      await runCmd(pip + " -r requirements.txt", workDir);
    } else {
      addLog("No Python dependency file found — skipping install");
    }
    // Auto-detect pygame and install pygbag for web builds
    let pygameFile = detectPygame(workDir);
    if (pygameFile) {
      addLog("Pygame detected in " + pygameFile + " — installing pygbag for web build...");
      await runCmd(pip + " pygbag", workDir);
    }
    return;
  }
  // Node.js (default)
  const hasNodeModules = fs.existsSync(path.join(workDir, "node_modules"));
  addLog(hasNodeModules ? "Checking dependencies..." : "Installing dependencies...");
  const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
  if (hasPnpmLock) await runCmd("pnpm install", workDir);
  else if (hasYarnLock) await runCmd("yarn install", workDir);
  else await runCmd("npm install", workDir);
}

module.exports = { updateRepo, resolveWorkDir, installDeps };
