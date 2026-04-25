/**
 * build/executor.js — static-build path (buildBranch).
 *
 * Clones / fetches the branch, installs deps, runs the build command,
 * resolves the output dir, scans for serverless API routes, and updates
 * buildStatus[key]. Pygame projects route through pygbag here.
 *
 * Also contains the long ARM-Android Next.js SWC fix-up — preserved
 * verbatim from the original build.js (don't touch unless you've tested
 * on Termux).
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const { runCmd } = require("../process");
const { saveLog } = require("../logs");
const { scanApiRoutes } = require("../serverless");
const { parseEnvVars, resolveBranchEnv } = require("../config");

const {
  WORKSPACE,
  MAX_CONCURRENT_BUILDS,
  buildStatus,
  buildLocks,
  countActiveBuilds,
  branchSlug,
  getBranchDir,
  buildKey,
  createLogger,
  appendHistory,
  snapshotBuildOutput,
  broadcastStatus,
  getHistory,
  getDirectorySize
} = require("./state");

const {
  detectLanguage,
  detectPygame,
  patchPygameForAsync,
  findMainPyFile,
  defaultBuildCommand,
  defaultOutputDir,
  outputSearchPaths
} = require("./detect");

const { updateRepo, resolveWorkDir, installDeps } = require("./pipeline");
const { captureThumbAsync } = require("./thumb");

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
    broadcastStatus(key, buildStatus[key]);
    setTimeout(() => {
      const slot = buildStatus[key];
      if (!slot || slot.status !== "queued") return;
      buildBranch(repoConfig, branchConfig).catch((e) => {
        console.error("[" + key + "] Queue retry failed: " + e.message);
        if (buildStatus[key]) { buildStatus[key].status = "error"; buildStatus[key].lastBuild = Date.now(); }
      });
    }, 5000);
    return;
  }
  buildLocks[key] = true;

  const branchDir = getBranchDir(owner, repo, branchConfig);
  buildStatus[key] = { status: "building", log: "", lastBuild: null, commitSha: "", mode: "static", startedAt: Date.now() };
  broadcastStatus(key, buildStatus[key]);
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
    let pygameFile = (language === "python") ? detectPygame(workDir) : null;
    let cmd, outName;
    // E1+E2: layered env — secrets (opt-in) + env-var groups + free-text fields.
    let userEnv = resolveBranchEnv(repoConfig, branchConfig);

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

      if (fs.existsSync(wasmDir)) {
        addLog("ARM Android: removing broken @next/swc-wasm-nodejs");
        try { execSync("rm -rf " + JSON.stringify(wasmDir)); } catch (_) {}
      }

      const androidNodeFile = path.join(androidSwcDir, "next-swc.android-arm64.node");
      if (fs.existsSync(androidSwcDir) && !fs.existsSync(androidNodeFile)) {
        addLog("ARM Android: cleaning broken swc-android-arm64 from previous attempt");
        try { execSync("rm -rf " + JSON.stringify(androidSwcDir)); } catch (_) {}
      }
      if (!fs.existsSync(androidNodeFile)) {
        if (!fs.existsSync(muslSwcDir)) {
          addLog("ARM Android: installing @next/swc-linux-arm64-musl (static binary)");
          try {
            await runCmd("npm install @next/swc-linux-arm64-musl --no-save --no-audit --force", workDir);
          } catch (e) {
            addLog("WARNING: musl SWC install failed: " + (e.message || "").split("\n")[0]);
          }
        }
        if (fs.existsSync(muslSwcDir)) {
          addLog("ARM Android: creating swc-android-arm64 from musl binary");
          try {
            const muslFiles = fs.readdirSync(muslSwcDir);
            const nodeFile = muslFiles.find(f => f.endsWith(".node"));
            if (nodeFile) {
              fs.mkdirSync(androidSwcDir, { recursive: true });
              const targetName = "next-swc.android-arm64.node";
              fs.copyFileSync(
                path.join(muslSwcDir, nodeFile),
                path.join(androidSwcDir, targetName)
              );
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
        const PREFIX = process.env.PREFIX || "/data/data/com.termux/files/usr";
        const libgccPath = path.join(PREFIX, "lib", "libgcc_s.so.1");
        if (!fs.existsSync(libgccPath)) {
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
      let mainFile = findMainPyFile(workDir);
      if (mainFile !== "main.py") {
        addLog("Copying " + mainFile + " -> main.py for pygbag...");
        fs.copyFileSync(path.join(workDir, mainFile), path.join(workDir, "main.py"));
      }
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
    const userEnvForRuntime = resolveBranchEnv(repoConfig, branchConfig);

    let duration = ((Date.now() - buildStatus[key].startedAt) / 1000).toFixed(1);
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
    broadcastStatus(key, buildStatus[key]);

    // I1: bundle-size insights. Walk the output dir, compare to the
    // previous build's bytes, derive a delta + percentage so users see
    // "+128 KB (4%)" or "−1.2 MB (-31%)" instead of guessing.
    let bytes = 0, prevBytes = 0, delta = 0, deltaPct = null;
    try {
      bytes = getDirectorySize(finalOut);
      const hist = getHistory(key);
      // Skip rollback audit entries — only compare to real builds.
      const prev = (hist || []).find((h) => h && h.by === "build" && typeof h.bytes === "number");
      if (prev) {
        prevBytes = prev.bytes;
        delta = bytes - prevBytes;
        if (prevBytes > 0) deltaPct = +((delta / prevBytes) * 100).toFixed(2);
      }
      buildStatus[key].outputBytes = bytes;
      buildStatus[key].outputBytesDelta = delta;
      buildStatus[key].outputBytesDeltaPct = deltaPct;
      if (bytes) {
        addLog("Output size: " + (bytes / 1024).toFixed(1) + " KB" +
          (delta ? " (" + (delta > 0 ? "+" : "") + (delta / 1024).toFixed(1) + " KB" +
            (deltaPct != null ? " · " + (deltaPct > 0 ? "+" : "") + deltaPct + "%" : "") + " vs previous)" : ""));
      }
    } catch (_) {}

    // Deployment history: snapshot the just-built output so future
    // rollbacks can restore it byte-for-byte. Best-effort — failure
    // doesn't break the build.
    try {
      const snap = snapshotBuildOutput(key, finalOut);
      appendHistory(key, {
        commitSha: buildStatus[key].commitSha || "",
        timestamp: Date.now(),
        duration: parseFloat(duration),
        outputPath: finalOut,
        snapshotDir: snap,
        mode: "static",
        by: "build",
        bytes: bytes,
        bytesDelta: delta,
        bytesDeltaPct: deltaPct
      });
    } catch (e) { addLog("WARNING: history append failed: " + e.message); }

    // K1 + K6: secret scan + perf-budget check, post-build, best effort.
    let secretFindings = [], budgetCheck = { violations: [], action: "warn" };
    try {
      const scanner = require("./scanner");
      secretFindings = scanner.scanForSecrets(finalOut);
      if (secretFindings.length) {
        addLog("⚠ SECURITY: " + secretFindings.length + " possible leaked secret(s) detected in output:");
        for (const f of secretFindings.slice(0, 5)) addLog("    [" + f.label + "] " + f.file + " — " + f.preview);
        if (secretFindings.length > 5) addLog("    … " + (secretFindings.length - 5) + " more (see full list in build_status)");
        buildStatus[key].secretFindings = secretFindings;
        try {
          require("../webhooks").emit("build.error", {
            repo: repoConfig.owner + "/" + repoConfig.repo,
            branch: branchConfig.branch,
            slug: branchSlug(branchConfig),
            error: "Secret scan found " + secretFindings.length + " possible leak(s)",
            findings: secretFindings.slice(0, 20)
          });
        } catch (_) {}
      }
      const budgets = branchConfig.budgets || repoConfig.budgets;
      if (budgets) {
        budgetCheck = scanner.checkBudgets({ outputBytes: bytes, duration: parseFloat(duration) }, budgets);
        if (budgetCheck.violations.length) {
          addLog("⚠ BUDGET: " + budgetCheck.violations.length + " violation(s):");
          for (const v of budgetCheck.violations) addLog("    " + v.message);
          buildStatus[key].budgetViolations = budgetCheck.violations;
          if (budgetCheck.action === "fail") {
            buildStatus[key].status = "error";
            addLog("BUILD FAILED: budgets.action='fail' — output rejected");
            broadcastStatus(key, buildStatus[key]);
            return;
          }
        }
      }
    } catch (e) { addLog("WARNING: scanner/budget pass failed: " + e.message); }

    // Outgoing webhooks: fire on build success.
    try {
      require("../webhooks").emit("build.ready", {
        repo: repoConfig.owner + "/" + repoConfig.repo,
        branch: branchConfig.branch,
        slug: branchSlug(branchConfig),
        commitSha: buildStatus[key].commitSha || "",
        duration: parseFloat(duration),
        bytes: bytes,
        bytesDelta: delta,
        bytesDeltaPct: deltaPct,
        previewUrl: "/preview/" + repoConfig.owner + "/" + repoConfig.repo + "/" + branchSlug(branchConfig) + "/"
      });
    } catch (_) {}
  } catch (e) {
    addLog("BUILD FAILED: " + e.message);
    buildStatus[key].status = "error";
    buildStatus[key].lastBuild = Date.now();
    saveLog(key, addLog.getLog());
    broadcastStatus(key, buildStatus[key]);
    try {
      require("../webhooks").emit("build.error", {
        repo: repoConfig.owner + "/" + repoConfig.repo,
        branch: branchConfig.branch,
        slug: branchSlug(branchConfig),
        commitSha: buildStatus[key].commitSha || "",
        error: e.message
      });
    } catch (_) {}
  } finally {
    delete buildLocks[key];
  }
}

module.exports = { buildBranch };
