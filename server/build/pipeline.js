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
const crypto = require("crypto");
const fs   = require("fs");
const os   = require("os");
const path = require("path");

const { runCmd } = require("../process");
const { getConfig } = require("../config");
const { detectPygame } = require("./detect");

// Build cache: skip the install step when (a) node_modules exists and
// (b) the lockfile SHA hasn't changed since the previous successful
// install. The cache marker is a single file inside node_modules so it
// gets blown away naturally when the user nukes the dir.
function _lockfileFor(workDir) {
  const candidates = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "npm-shrinkwrap.json"];
  for (const f of candidates) {
    const p = path.join(workDir, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function _hashFile(file) {
  try {
    const h = crypto.createHash("sha256");
    h.update(fs.readFileSync(file));
    return h.digest("hex");
  } catch (_) { return null; }
}
function _markerPath(workDir) { return path.join(workDir, "node_modules", ".dv-install-marker"); }
function shouldSkipInstall(workDir) {
  const lock = _lockfileFor(workDir);
  if (!lock) return false;
  if (!fs.existsSync(path.join(workDir, "node_modules"))) return false;
  const marker = _markerPath(workDir);
  if (!fs.existsSync(marker)) return false;
  const newHash = _hashFile(lock);
  let prev = "";
  try { prev = fs.readFileSync(marker, "utf8").trim(); } catch (_) {}
  return !!(newHash && newHash === prev);
}
function recordInstall(workDir) {
  const lock = _lockfileFor(workDir);
  if (!lock) return;
  const newHash = _hashFile(lock);
  if (!newHash) return;
  try { fs.writeFileSync(_markerPath(workDir), newHash + "\n"); } catch (_) {}
}

// F-C007: write token to a 0600 temp file and load it via git's
// credential.helper=store --file=… Token never appears in argv (so `ps`
// can't see it) and the file is unlinked synchronously on success or
// failure. The remote URL itself stays clean.
function withTokenCredentials(token, fn) {
  const tmpFile = path.join(os.tmpdir(), "dv-git-cred-" + process.pid + "-" + Date.now() + ".txt");
  const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
  try {
    fs.writeFileSync(tmpFile, "https://x-access-token:" + token + "@github.com\n", { mode: 0o600 });
    const helper = "store --file=" + tmpFile;
    return Promise.resolve(fn(helper)).finally(cleanup);
  } catch (e) {
    cleanup();
    return Promise.reject(e);
  }
}

async function updateRepo(owner, repo, branch, branchDir, addLog) {
  const config = getConfig();
  const remoteUrl = "https://github.com/" + owner + "/" + repo + ".git";
  if (!fs.existsSync(path.join(branchDir, ".git"))) {
    // Clean up if dir exists but has no .git (corrupt/partial clone)
    if (fs.existsSync(branchDir)) {
      addLog("Cleaning stale directory...");
      await runCmd("rm -rf " + JSON.stringify(branchDir));
    }
    addLog("Cloning " + owner + "/" + repo + " (branch: " + branch + ")...");
    fs.mkdirSync(branchDir, { recursive: true });
    await withTokenCredentials(config.token, (helper) =>
      runCmd("git -c credential.helper= -c credential.helper=" + JSON.stringify(helper) + " clone --branch " + JSON.stringify(branch) + " --single-branch --depth 1 " + JSON.stringify(remoteUrl) + " .", branchDir)
    );
  } else {
    addLog("Updating branch: " + branch);
    await withTokenCredentials(config.token, (helper) =>
      runCmd("git -c credential.helper= -c credential.helper=" + JSON.stringify(helper) + " fetch origin " + JSON.stringify(branch), branchDir)
    );
    await runCmd("git reset --hard origin/" + JSON.stringify(branch), branchDir);
  }
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse HEAD", { cwd: branchDir }).toString().trim();
  } catch (e) {
    addLog("WARNING: Could not read commit SHA: " + e.message);
  }
  // Belt-and-braces: ensure remote URL has no token even if a previous
  // pre-fix clone left one embedded. Safe to run on a fresh clone too.
  try {
    execSync("git remote set-url origin " + JSON.stringify(remoteUrl), { cwd: branchDir, stdio: "ignore" });
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
  // Build cache: if the lockfile hash matches the marker stored in
  // node_modules/.dv-install-marker, skip install entirely. Saves
  // 30–120s on every rebuild of the same commit (or any rebuild where
  // dependencies didn't change).
  if (shouldSkipInstall(workDir)) {
    addLog("✓ Dependencies cached — lockfile unchanged, skipping install");
    return;
  }
  const hasNodeModules = fs.existsSync(path.join(workDir, "node_modules"));
  addLog(hasNodeModules ? "Reinstalling dependencies (lockfile changed)..." : "Installing dependencies...");
  const hasPnpmLock = fs.existsSync(path.join(workDir, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(workDir, "yarn.lock"));
  if (hasPnpmLock) await runCmd("pnpm install", workDir);
  else if (hasYarnLock) await runCmd("yarn install", workDir);
  else await runCmd("npm install", workDir);
  recordInstall(workDir);
}

module.exports = { updateRepo, resolveWorkDir, installDeps, shouldSkipInstall, recordInstall };
