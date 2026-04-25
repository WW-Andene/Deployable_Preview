const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { getConfig } = require("./config");
const { parseEnvVars } = require("./config");
const { runCmd, findFreePort, waitForPort, runningServers, killServer } = require("./process");
const { saveLog, broadcastLog } = require("./logs");
const { scanApiRoutes } = require("./serverless");

const WORKSPACE = path.join(__dirname, "..", "workspace");
const AUTO_RESTART_DELAY = 5000;
const MAX_RESTARTS = 3;

if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });

const buildStatus = {};
const buildLocks = {};   // prevents concurrent builds for the same key
const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS, 10) || 4;

// ── Thumb LRU ────────────────────────────────────────────────────────────
// Keep at most MAX_THUMBS thumbs resident at any time. When a new thumb is
// stored, drop the oldest-thumbAt thumbs until we're under budget.
const MAX_THUMBS = parseInt(process.env.DV_MAX_THUMBS, 10) || 40;
function evictThumbsIfNeeded() {
  const withThumbs = [];
  for (const k in buildStatus) { if (buildStatus[k] && buildStatus[k].thumb) withThumbs.push({ k, at: buildStatus[k].thumbAt || 0 }); }
  if (withThumbs.length <= MAX_THUMBS) return;
  withThumbs.sort(function(a, b) { return a.at - b.at; }); // oldest first
  const evict = withThumbs.length - MAX_THUMBS;
  for (let i = 0; i < evict; i++) {
    const slot = buildStatus[withThumbs[i].k];
    if (!slot) continue;
    delete slot.thumb;
    delete slot.diffThumb;
  }
}

// ── Thumbnail capture + auto-diff ────────────────────────────────────────
// Fire-and-forget screenshot of the preview after a successful build.
// Stored as base64 on buildStatus[key].thumb (≈30–60 KB per branch).
// Also diffs the new thumb against the previous one (if pixelmatch is
// available) and stores a summary on buildStatus[key].diff so the dashboard
// can show 'this build changed X% of pixels vs. the previous build'.
// Silent when the browser is unavailable.
function captureThumbAsync(owner, repo, slug, delayMs) {
  setTimeout(async () => {
    try {
      const browser = require("./browser");
      if (!browser.hasPlaywright || !browser.hasPlaywright()) return;
      const shot = await browser.takeScreenshot({
        owner, repo, slug, width: 1024, height: 640, fullPage: false
      });
      if (!shot || !shot.base64 || shot.error) return;

      const key = owner + "/" + repo + ":" + slug;
      if (!buildStatus[key]) return;

      const previous = buildStatus[key].thumb;
      buildStatus[key].thumb = shot.base64;
      buildStatus[key].thumbAt = Date.now();
      evictThumbsIfNeeded();

      // Run a quick pixel diff against the previous thumb, best-effort.
      if (previous && typeof browser.screenshotDiff === "function") {
        try {
          const diff = await browser.screenshotDiff({
            before: previous,
            after: shot.base64,
            threshold: 10
          });
          if (diff && !diff.error) {
            buildStatus[key].diff = {
              diffCount: diff.diffCount,
              percent: diff.percent,
              bbox: diff.bbox,
              engine: diff.engine || null,
              previousThumbAt: buildStatus[key].previousThumbAt || null,
              at: Date.now()
            };
            // Store the diff heatmap alongside the thumb for later retrieval
            if (diff.base64) buildStatus[key].diffThumb = diff.base64;
          }
        } catch (_) { /* diffing is best-effort */ }
      }
      buildStatus[key].previousThumbAt = buildStatus[key].thumbAt;
    } catch (_) { /* silent — thumbs are nice-to-have */ }
  }, delayMs || 1500);
}

function countActiveBuilds() {
  let count = 0;
  for (const k in buildLocks) { if (buildLocks[k]) count++; }
  return count;
}

// ── Slug & path helpers ──
function branchSlug(bc) {
  if (typeof bc === "string") return bc.replace(/\//g, "__");
  var slug = bc.branch.replace(/\//g, "__");
  if (bc.baseDir) slug += "--" + bc.baseDir.replace(/\//g, "__");
  return slug;
}

function getBranchDir(owner, repo, bc) {
  return path.join(WORKSPACE, owner + "__" + repo + "__" + branchSlug(bc));
}

function buildKey(owner, repo, bc) {
  return owner + "/" + repo + ":" + branchSlug(bc);
}

// ── Shared: clone/update repo ──
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

// ── Shared: resolve work directory ──
function resolveWorkDir(branchDir, branchConfig, repoConfig, addLog) {
  const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
  const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
  if (baseDir) {
    addLog("Base directory: " + baseDir);
    if (!fs.existsSync(workDir)) throw new Error("Base directory '" + baseDir + "' not found in repo");
  }
  return workDir;
}

// ── Language detection ──
function detectLanguage(workDir, branchConfig) {
  // Explicit config takes priority
  if (branchConfig && branchConfig.language && branchConfig.language !== "auto") return branchConfig.language;
  // Auto-detect from project files
  if (fs.existsSync(path.join(workDir, "pom.xml")) || fs.existsSync(path.join(workDir, "build.gradle")) || fs.existsSync(path.join(workDir, "build.gradle.kts"))) return "java";
  if (fs.existsSync(path.join(workDir, "requirements.txt")) || fs.existsSync(path.join(workDir, "pyproject.toml")) || fs.existsSync(path.join(workDir, "setup.py")) || fs.existsSync(path.join(workDir, "Pipfile"))) return "python";
  // Check for .py files (no manifest but still a Python project)
  try { var entries = fs.readdirSync(workDir); if (entries.some(function(f) { return f.endsWith(".py"); })) return "python"; } catch (e) {}
  return "nodejs";
}

// ── Detect pygame in Python files ──
function detectPygame(workDir) {
  try {
    var files = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py"); });
    for (var i = 0; i < files.length; i++) {
      var content = fs.readFileSync(path.join(workDir, files[i]), "utf8");
      if (/^\s*(import\s+pygame|from\s+pygame)/m.test(content)) return files[i];
    }
  } catch (e) {}
  return null;
}

// ── Patch pygame game for async (required by pygbag/browser) ──
function patchPygameForAsync(filePath, addLog) {
  var code = fs.readFileSync(filePath, "utf8");
  // Already uses async — no patching needed
  if (/async\s+def/.test(code) && /await\s+asyncio/.test(code)) {
    addLog("Game already uses async — no patching needed");
    return;
  }

  var lines = code.split("\n");

  // Find the main game loop: top-level "while" or "if __name__" containing a while
  var loopStart = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^while\s/.test(lines[i])) { loopStart = i; break; }
    if (/^if\s+__name__\s*==/.test(lines[i])) { loopStart = i; break; }
  }

  if (loopStart < 0) {
    addLog("WARNING: No main game loop found — cannot auto-patch for async");
    return;
  }

  // Collect all top-level variable names assigned before the loop
  var globals = [];
  var seen = {};
  for (var i = 0; i < loopStart; i++) {
    var m = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=[^=]/);
    if (m && !seen[m[1]]) { globals.push(m[1]); seen[m[1]] = true; }
  }

  var moduleLines = lines.slice(0, loopStart);
  var gameLines = lines.slice(loopStart);

  var hasAsyncio = /^\s*import\s+asyncio/m.test(code);

  var newLines = [];
  if (!hasAsyncio) newLines.push("import asyncio");
  // Keep all module-level code (imports, defs, setup) as-is
  newLines = newLines.concat(moduleLines);
  newLines.push("");
  newLines.push("async def _game_loop():");

  // Add global declarations so the loop can modify module-level vars
  if (globals.length > 0) {
    newLines.push("    global " + globals.join(", "));
  }

  // Indent game loop code and inject await asyncio.sleep(0)
  var hasContent = false;
  for (var i = 0; i < gameLines.length; i++) {
    var line = gameLines[i];
    if (line.trim() === "") {
      newLines.push("");
    } else {
      hasContent = true;
      newLines.push("    " + line);
    }
    // Yield to browser after display update or clock tick
    if (/pygame\.display\.(flip|update)\s*\(/.test(line) || /\.tick\s*\(/.test(line)) {
      var indent = line.match(/^(\s*)/)[1];
      newLines.push("    " + indent + "await asyncio.sleep(0)");
    }
  }
  if (!hasContent) newLines.push("    pass");

  newLines.push("");
  newLines.push("asyncio.run(_game_loop())");
  newLines.push("");

  fs.writeFileSync(filePath, newLines.join("\n"));
  addLog("Patched game for async: kept " + loopStart + " lines at module level, " + globals.length + " global vars");
}

// ── Find main Python file ──
function findMainPyFile(workDir) {
  if (fs.existsSync(path.join(workDir, "main.py"))) return "main.py";
  try {
    var pyFiles = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py") && f !== "__init__.py" && f !== "setup.py"; });
    if (pyFiles.length === 1) return pyFiles[0];
    // Look for if __name__ == "__main__" pattern
    for (var i = 0; i < pyFiles.length; i++) {
      var content = fs.readFileSync(path.join(workDir, pyFiles[i]), "utf8");
      if (/__name__\s*==\s*['"]__main__['"]/.test(content)) return pyFiles[i];
    }
    return pyFiles[0] || "main.py";
  } catch (e) { return "main.py"; }
}

// ── Shared: install dependencies ──
async function installDeps(workDir, addLog, language) {
  if (language === "java") {
    addLog("Java project detected — skipping npm install");
    return;
  }
  if (language === "python") {
    addLog("Installing Python dependencies...");
    var pip = "python -m pip install --break-system-packages";
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
    var pygameFile = detectPygame(workDir);
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

// ── Default build commands per language ──
function defaultBuildCommand(language) {
  if (language === "java") {
    return "mvn package -DskipTests";
  }
  if (language === "python") {
    return "python -m py_compile *.py || true";
  }
  return "npm run build";
}

// ── Default start commands per language ──
function defaultStartCommand(language) {
  if (language === "java") return "java -jar target/*.jar";
  if (language === "python") return "python app.py";
  return "npm start";
}

// ── Default output dirs per language ──
function defaultOutputDir(language) {
  if (language === "java") return "target";
  if (language === "python") return ".";
  return "dist";
}

// ── Output dir search paths per language ──
function outputSearchPaths(language) {
  if (language === "java") return ["target", "build/libs", "build", "dist"];
  if (language === "python") return ["build/web", "dist", "build", "static", "public", "."];
  return ["dist", "build", "out", "web-build", ".next/static", "public"];
}

// ── Shared: create addLog function ──
function createLogger(key) {
  let log = "";
  function addLog(msg) {
    log += msg + "\n";
    buildStatus[key].log = log;
    broadcastLog(key, msg);
    console.log("[" + key + "] " + msg);
  }
  addLog.getLog = () => log;
  addLog.setLog = (l) => { log = l; };
  return addLog;
}

// ── Static build ──
async function buildBranch(repoConfig, branchConfig) {
  const { owner, repo } = repoConfig;
  const key = buildKey(owner, repo, branchConfig);

  // Prevent concurrent builds for the same key
  if (buildLocks[key]) {
    console.log("[" + key + "] Build already in progress, skipping");
    return;
  }
  // Enforce max concurrent builds
  if (countActiveBuilds() >= MAX_CONCURRENT_BUILDS) {
    console.log("[" + key + "] Max concurrent builds (" + MAX_CONCURRENT_BUILDS + ") reached, queuing...");
    buildStatus[key] = { status: "queued", log: "Waiting for build slot...\n", lastBuild: null, commitSha: "", mode: "static" };
    // Retry after 5 seconds
    setTimeout(() => buildBranch(repoConfig, branchConfig), 5000);
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);

  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "", mode: "static", startedAt: Date.now() };
  const addLog = createLogger(key);

  try {
    const sha = await updateRepo(owner, repo, branchConfig.branch, branchDir, addLog);
    buildStatus[key].commitSha = sha;

    const workDir = resolveWorkDir(branchDir, branchConfig, repoConfig, addLog);
    const language = detectLanguage(workDir, branchConfig);
    addLog("Language: " + language);

    addLog("Cleaning...");
    await runCmd("rm -rf dist build out web-build", workDir).catch(() => {});

    await installDeps(workDir, addLog, language);

    // Pygame auto-build: use pygbag to compile to WebAssembly
    var pygameFile = (language === "python") ? detectPygame(workDir) : null;
    var cmd, outName;
    var userEnv = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");

    // Fix Next.js SWC on ARM Android (Termux): Next.js detects the platform
    // as "android-arm64" and tries to download @next/swc-android-arm64 — but
    // that package doesn't exist for most Next.js versions (404 error).
    // The WASM fallback also crashes on ARM ("Reflect.get called on non-object").
    //
    // Fix: install the musl binary (@next/swc-linux-arm64-musl) which is
    // statically linked (no libc dependency) and works on Android because
    // the kernel is Linux-compatible. Then symlink it as the android-arm64
    // variant so Next.js finds and loads it.
    const _isARM = process.arch === "arm64" || process.arch === "arm";
    const _isAndroid = !!process.env.TERMUX_VERSION || (process.env.PREFIX || "").includes("com.termux") || process.platform === "android";
    const _nextDir = path.join(workDir, "node_modules", "next");
    if (_isARM && _isAndroid && fs.existsSync(_nextDir)) {
      const nextAtDir = path.join(workDir, "node_modules", "@next");
      const androidSwcDir = path.join(nextAtDir, "swc-android-arm64");
      const muslSwcDir = path.join(nextAtDir, "swc-linux-arm64-musl");
      const wasmDir = path.join(nextAtDir, "swc-wasm-nodejs");

      // Remove the broken WASM module
      if (fs.existsSync(wasmDir)) {
        addLog("ARM Android: removing broken @next/swc-wasm-nodejs");
        try { execSync("rm -rf " + JSON.stringify(wasmDir)); } catch (_) {}
      }

      // Always clean up any previous attempt (broken symlinks, wrong structure)
      // and verify we have a working .node binary. Can't just check existence
      // because a prior symlink or empty dir passes existsSync but fails require().
      const androidNodeFile = path.join(androidSwcDir, "next-swc.android-arm64.node");
      if (fs.existsSync(androidSwcDir) && !fs.existsSync(androidNodeFile)) {
        addLog("ARM Android: cleaning broken swc-android-arm64 from previous attempt");
        try { execSync("rm -rf " + JSON.stringify(androidSwcDir)); } catch (_) {}
      }
      if (!fs.existsSync(androidNodeFile)) {
        if (!fs.existsSync(muslSwcDir)) {
          addLog("ARM Android: installing @next/swc-linux-arm64-musl (static binary)");
          try {
            // --force bypasses npm's os/cpu platform check (rejects "android" for "linux" packages)
            await runCmd("npm install @next/swc-linux-arm64-musl --no-save --no-audit --force", workDir);
          } catch (e) {
            addLog("WARNING: musl SWC install failed: " + (e.message || "").split("\n")[0]);
          }
        }
        if (fs.existsSync(muslSwcDir)) {
          addLog("ARM Android: creating swc-android-arm64 from musl binary");
          try {
            // Find the .node binary in the musl package
            const muslFiles = fs.readdirSync(muslSwcDir);
            const nodeFile = muslFiles.find(f => f.endsWith(".node"));
            if (nodeFile) {
              // Create the android-arm64 package directory
              fs.mkdirSync(androidSwcDir, { recursive: true });
              // Copy the binary with the android-arm64 name
              const targetName = "next-swc.android-arm64.node";
              fs.copyFileSync(
                path.join(muslSwcDir, nodeFile),
                path.join(androidSwcDir, targetName)
              );
              // Create a package.json so require() finds it
              const muslPkg = JSON.parse(fs.readFileSync(path.join(muslSwcDir, "package.json"), "utf8"));
              const androidPkg = {
                name: "@next/swc-android-arm64",
                version: muslPkg.version,
                main: targetName,
                os: ["android"],
                cpu: ["arm64"]
              };
              fs.writeFileSync(
                path.join(androidSwcDir, "package.json"),
                JSON.stringify(androidPkg, null, 2)
              );
              addLog("ARM Android: created swc-android-arm64 v" + muslPkg.version);
            } else {
              addLog("WARNING: no .node file found in musl package");
            }
          } catch (e) {
            addLog("WARNING: could not create android-arm64 package: " + e.message);
          }
        }
      }

      if (fs.existsSync(androidSwcDir)) {
        addLog("ARM Android: SWC android-arm64 binary ready");
        // The musl binary needs libgcc_s.so.1 for stack unwinding. Termux
        // uses LLVM (not GCC) so libgcc_s doesn't exist — but the symbols
        // it needs (_Unwind_*) are in Termux's libunwind.so. Create a
        // symlink so dlopen finds it.
        const PREFIX = process.env.PREFIX || "/data/data/com.termux/files/usr";
        const libgccPath = path.join(PREFIX, "lib", "libgcc_s.so.1");
        if (!fs.existsSync(libgccPath)) {
          // Termux uses LLVM/clang — no libgcc_s.so.1 exists anywhere.
          // The musl SWC binary references it (for _Unwind_* symbols) but
          // Rust binaries compiled with panic=abort never actually call the
          // unwinder. Compile a minimal stub .so so dlopen succeeds.
          addLog("ARM Android: compiling libgcc_s.so.1 stub (Termux has no GCC runtime)");
          try {
            const stubSrc = [
              "void _Unwind_Resume(void) {}",
              "void _Unwind_Backtrace(void) {}",
              "void _Unwind_GetIP(void) {}",
              "void _Unwind_GetRegionStart(void) {}",
              "void _Unwind_GetLanguageSpecificData(void) {}",
              "void _Unwind_RaiseException(void) {}",
              "void _Unwind_DeleteException(void) {}",
              "void _Unwind_SetGR(void) {}",
              "void _Unwind_SetIP(void) {}",
              "void __register_frame(void) {}",
              "void __deregister_frame(void) {}",
              "void __register_frame_info(void) {}",
              "void __deregister_frame_info(void) {}"
            ].join("\n");
            const stubC = path.join(PREFIX, "tmp", "gcc_s_stub.c");
            fs.mkdirSync(path.dirname(stubC), { recursive: true });
            fs.writeFileSync(stubC, stubSrc);
            execSync("clang -shared -o " + JSON.stringify(libgccPath) + " " + JSON.stringify(stubC), { timeout: 30000 });
            fs.unlinkSync(stubC);
            addLog("ARM Android: libgcc_s.so.1 stub compiled and installed");
          } catch (e) {
            addLog("WARNING: could not compile libgcc_s.so.1 stub: " + e.message);
          }
        }
        if (!userEnv.LD_LIBRARY_PATH) {
          userEnv.LD_LIBRARY_PATH = PREFIX + "/lib" + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
        }
      } else {
        addLog("WARNING: no SWC binary available — Next.js build may fail");
      }
    }

    if (pygameFile) {
      var mainFile = findMainPyFile(workDir);
      // pygbag expects main.py — copy if needed
      if (mainFile !== "main.py") {
        addLog("Copying " + mainFile + " -> main.py for pygbag...");
        fs.copyFileSync(path.join(workDir, mainFile), path.join(workDir, "main.py"));
      }
      // Patch game for async (pygbag requires async main loop to run in browser)
      patchPygameForAsync(path.join(workDir, "main.py"), addLog);
      addLog("Building Pygame for web with pygbag...");
      await runCmd("pygbag --build .", workDir, userEnv);
      outName = "build/web";
    } else {
      cmd = branchConfig.buildCommand || (language === "nodejs" ? repoConfig.buildCommand : "") || defaultBuildCommand(language);
      addLog("Building: " + cmd);
      await runCmd(cmd, workDir, userEnv);
      outName = branchConfig.outputDir || (language === "nodejs" ? repoConfig.outputDir : "") || defaultOutputDir(language);
    }

    const outPath = path.join(workDir, outName);
    const altPaths = outputSearchPaths(language);
    let finalOut = null;
    if (fs.existsSync(outPath)) finalOut = outPath;
    else { for (const alt of altPaths) { const p = path.join(workDir, alt); if (fs.existsSync(p)) { finalOut = p; break; } } }
    if (!finalOut) { addLog("WARNING: No output dir found. Serving workDir."); finalOut = workDir; }

    // Scan for serverless API functions in the workDir (not output dir)
    const apiRoutes = scanApiRoutes(workDir, addLog);
    const userEnvForRuntime = parseEnvVars(branchConfig.envVars || repoConfig.envVars || "");

    var duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
    addLog("Build complete in " + duration + "s! Output: " + path.relative(WORKSPACE, finalOut));
    buildStatus[key].status = "ready";
    buildStatus[key].lastBuild = Date.now();
    buildStatus[key].duration = parseFloat(duration);
    buildStatus[key].outputPath = finalOut;
    buildStatus[key].apiRoutes = apiRoutes;
    buildStatus[key].workDir = workDir;
    buildStatus[key].envVars = userEnvForRuntime;
    buildStatus[key].buildCommand = cmd;
    buildStatus[key].outputDir = outName;
    saveLog(key, addLog.getLog());
    captureThumbAsync(repoConfig.owner, repoConfig.repo, branchSlug(branchConfig));
  } catch (e) {
    addLog("BUILD FAILED: " + e.message);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
    saveLog(key, addLog.getLog());
  } finally {
    delete buildLocks[key];
  }
}

// ── Server mode ──
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
    setTimeout(() => startServer(repoConfig, branchConfig, false), 5000);
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
    child.stdout.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.stderr.on("data", (d) => { addLog.setLog(addLog.getLog() + d.toString()); buildStatus[key].log = addLog.getLog(); broadcastLog(key, d.toString()); });
    child.on("exit", (code) => {
      addLog("Server exited with code " + code);
      saveLog(key, addLog.getLog());
      if (runningServers[key] && runningServers[key].proc === child) {
        runningServers[key].status = "stopped";
        buildStatus[key].status = "error";
        if (restarts < MAX_RESTARTS && !runningServers[key].manualStop) {
          addLog("Auto-restarting in " + (AUTO_RESTART_DELAY / 1000) + "s (" + (restarts + 1) + "/" + MAX_RESTARTS + ")...");
          buildStatus[key].restarts = restarts + 1;
          setTimeout(() => { if (buildStatus[key] && buildStatus[key].status === "error") startServer(repoConfig, branchConfig, true); }, AUTO_RESTART_DELAY);
        } else if (restarts >= MAX_RESTARTS) { addLog("Max restarts reached."); }
      }
    });

    addLog("Waiting for port " + port + "...");
    await waitForPort(port, 60000);

    var duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
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
    var baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
    var branchDir = getBranchDir(repoConfig.owner, repoConfig.repo, branchConfig);
    var checkDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
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

module.exports = { buildStatus, branchSlug, getBranchDir, buildKey, buildBranch, startServer, deployBranch, cancelBuild, WORKSPACE, detectLanguage, defaultBuildCommand, defaultStartCommand, defaultOutputDir };
