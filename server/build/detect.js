/**
 * build/detect.js — language + project-shape detection + per-language defaults.
 *
 * Pure functions (filesystem reads only). No mutable state, no subprocess,
 * no network. Anyone in the build pipeline can call into here freely.
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ── Language detection ─────────────────────────────────────────────────────

// Native Android app (Kotlin/Java + Gradle + Android SDK, Activities/Compose
// UI) — not a web app. There's no browser-servable output for this, so it's
// kept distinct from "java" (which covers plain JVM/Gradle/Maven services
// whose build output can still be run/served like a web server).
function isNativeAndroid(workDir) {
  try {
    if (fs.existsSync(path.join(workDir, "app", "src", "main", "AndroidManifest.xml"))) return true;
    if (fs.existsSync(path.join(workDir, "src", "main", "AndroidManifest.xml"))) return true;
    const hasSettings = fs.existsSync(path.join(workDir, "settings.gradle")) || fs.existsSync(path.join(workDir, "settings.gradle.kts"));
    if (!hasSettings) return false;
    const candidates = ["build.gradle", "build.gradle.kts", path.join("app", "build.gradle"), path.join("app", "build.gradle.kts")];
    for (const c of candidates) {
      const p = path.join(workDir, c);
      if (fs.existsSync(p) && /com\.android\.application/.test(fs.readFileSync(p, "utf8"))) return true;
    }
  } catch (e) {}
  return false;
}

function isGradleProject(workDir) {
  return fs.existsSync(path.join(workDir, "build.gradle")) || fs.existsSync(path.join(workDir, "build.gradle.kts")) ||
    fs.existsSync(path.join(workDir, "settings.gradle")) || fs.existsSync(path.join(workDir, "settings.gradle.kts"));
}

function detectLanguage(workDir, branchConfig) {
  // Explicit config takes priority
  if (branchConfig && branchConfig.language && branchConfig.language !== "auto") return branchConfig.language;
  // Auto-detect from project files
  if (isNativeAndroid(workDir)) return "android";
  if (fs.existsSync(path.join(workDir, "pom.xml")) || isGradleProject(workDir)) return "java";
  if (fs.existsSync(path.join(workDir, "requirements.txt")) || fs.existsSync(path.join(workDir, "pyproject.toml")) || fs.existsSync(path.join(workDir, "setup.py")) || fs.existsSync(path.join(workDir, "Pipfile"))) return "python";
  // Check for .py files (no manifest but still a Python project)
  try { const entries = fs.readdirSync(workDir); if (entries.some(function(f) { return f.endsWith(".py"); })) return "python"; } catch (e) {}
  return "nodejs";
}

// ── Pygame helpers (used by both static + server modes) ────────────────────

function detectPygame(workDir) {
  try {
    let files = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py"); });
    for (let i = 0; i < files.length; i++) {
      let content = fs.readFileSync(path.join(workDir, files[i]), "utf8");
      if (/^\s*(import\s+pygame|from\s+pygame)/m.test(content)) return files[i];
    }
  } catch (e) {}
  return null;
}

function findMainPyFile(workDir) {
  if (fs.existsSync(path.join(workDir, "main.py"))) return "main.py";
  try {
    let pyFiles = fs.readdirSync(workDir).filter(function(f) { return f.endsWith(".py") && f !== "__init__.py" && f !== "setup.py"; });
    if (pyFiles.length === 1) return pyFiles[0];
    // Look for if __name__ == "__main__" pattern
    for (let i = 0; i < pyFiles.length; i++) {
      let content = fs.readFileSync(path.join(workDir, pyFiles[i]), "utf8");
      if (/__name__\s*==\s*['"]__main__['"]/.test(content)) return pyFiles[i];
    }
    return pyFiles[0] || "main.py";
  } catch (e) { return "main.py"; }
}

/**
 * Patch a pygame game for browser execution under pygbag (which requires
 * the main loop be a top-level coroutine yielding to asyncio so the browser
 * can repaint). Best-effort source rewrite — preserves module-level setup,
 * indents the loop into _game_loop(), and inserts await asyncio.sleep(0)
 * after each pygame.display flip/update or clock.tick call.
 */
function patchPygameForAsync(filePath, addLog) {
  let code = fs.readFileSync(filePath, "utf8");
  if (/async\s+def/.test(code) && /await\s+asyncio/.test(code)) {
    addLog("Game already uses async — no patching needed");
    return;
  }
  let lines = code.split("\n");
  let loopStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^while\s/.test(lines[i])) { loopStart = i; break; }
    if (/^if\s+__name__\s*==/.test(lines[i])) { loopStart = i; break; }
  }
  if (loopStart < 0) {
    addLog("WARNING: No main game loop found — cannot auto-patch for async");
    return;
  }
  let globals = [], seen = {};
  for (let i = 0; i < loopStart; i++) {
    let m = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=[^=]/);
    if (m && !seen[m[1]]) { globals.push(m[1]); seen[m[1]] = true; }
  }
  let moduleLines = lines.slice(0, loopStart);
  let gameLines = lines.slice(loopStart);
  let hasAsyncio = /^\s*import\s+asyncio/m.test(code);
  let newLines = [];
  if (!hasAsyncio) newLines.push("import asyncio");
  newLines = newLines.concat(moduleLines);
  newLines.push("");
  newLines.push("async def _game_loop():");
  if (globals.length > 0) newLines.push("    global " + globals.join(", "));
  let hasContent = false;
  for (let i = 0; i < gameLines.length; i++) {
    let line = gameLines[i];
    if (line.trim() === "") {
      newLines.push("");
    } else {
      hasContent = true;
      newLines.push("    " + line);
    }
    if (/pygame\.display\.(flip|update)\s*\(/.test(line) || /\.tick\s*\(/.test(line)) {
      let indent = line.match(/^(\s*)/)[1];
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

// ── Per-language defaults ──────────────────────────────────────────────────

function defaultBuildCommand(language, workDir) {
  if (language === "java") {
    if (workDir && fs.existsSync(path.join(workDir, "gradlew"))) return "./gradlew build -x test";
    if (workDir && isGradleProject(workDir)) return "gradle build -x test";
    return "mvn package -DskipTests";
  }
  if (language === "android") return null; // built via the GitHub Actions APK flow, not the local pipeline
  if (language === "python") return "python -m py_compile *.py || true";
  return "npm run build";
}

function defaultStartCommand(language, workDir) {
  if (language === "java") {
    if (workDir && (fs.existsSync(path.join(workDir, "gradlew")) || isGradleProject(workDir))) return "java -jar build/libs/*.jar";
    return "java -jar target/*.jar";
  }
  if (language === "python") return "python app.py";
  return "npm start";
}

function defaultOutputDir(language, workDir) {
  if (language === "java") {
    if (workDir && (fs.existsSync(path.join(workDir, "gradlew")) || isGradleProject(workDir))) return "build/libs";
    return "target";
  }
  if (language === "python") return ".";
  return "dist";
}

function outputSearchPaths(language) {
  if (language === "java")   return ["target", "build/libs", "build", "dist"];
  if (language === "python") return ["build/web", "dist", "build", "static", "public", "."];
  return ["dist", "build", "out", "web-build", ".next/static", "public"];
}

module.exports = {
  detectLanguage,
  isNativeAndroid,
  isGradleProject,
  detectPygame,
  findMainPyFile,
  patchPygameForAsync,
  defaultBuildCommand,
  defaultStartCommand,
  defaultOutputDir,
  outputSearchPaths
};
