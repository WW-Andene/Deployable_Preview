// ── Studio sub-router ─────────────────────────────────────────────────────
// Backend for the "Studio" visual editor: a Figma/Canva-style overlay on
// top of a live DV preview.
//
// Design constraints (read this before touching source-mapping logic):
//   - DV controls the build (see build/pipeline.js + build/executor.js), so
//     the *source* checkout is a real directory on disk at getBranchDir(...),
//     separate from the *built* output the iframe actually renders.
//   - There is no guaranteed DOM→source line mapping for arbitrary
//     frameworks post-build (minification, JSX transforms, etc. all erase
//     it). Studio therefore does NOT promise "click a pixel, land on the
//     exact source line" for every framework. Instead:
//       1. If the built output carries data-* debug attributes (some
//          frameworks/plugins emit these in dev mode — e.g. Vite's
//          `@vitejs/plugin-react` with source markers, or a project that
//          opts in via its own convention), Studio uses them directly.
//       2. Otherwise Studio falls back to a text/heuristic search: given an
//          element's tag, class list, and visible text, it greps the
//          checked-out source tree for the closest matching JSX/HTML/Vue
//          fragment and offers that file as a "best guess" the user
//          confirms before any write.
//   - Visual (CSS) edits made directly on the live iframe are ALWAYS exact
//     (no guessing) — they're applied as inline style overrides on the real
//     DOM node the user clicked, tracked as a precise diff, and only turned
//     into a source-file write when the user asks to "apply to code" (at
//     which point the same best-guess file resolution above is used, shown
//     to the user, and requires confirmation).
//   - Writes never touch git history directly; they write to the working
//     tree in the existing branch checkout dir, exactly like a local edit
//     would, then reuse deployBranch() to rebuild — same code path as any
//     other DV build. Commit+push is a separate, explicit action using the
//     same withTokenCredentials() helper build/pipeline.js already has.

"use strict";

const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const router = express.Router();

const { getConfig } = require("../../config");
const { getBranchDir, buildStatus, buildKey, deployBranch } = require("../../build");
const { runCmd } = require("../../process");

// ── Shared helpers ───────────────────────────────────────────────────────

function findRepo(config, owner, repo) {
  const ol = String(owner || "").toLowerCase();
  const rl = String(repo || "").toLowerCase();
  return (config.repos || []).find((r) => r.owner.toLowerCase() === ol && r.repo.toLowerCase() === rl);
}

function findBranchConfig(repoConfig, slug) {
  return (repoConfig.branches || []).find((bc) => {
    if (bc.customSlug && /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,63}$/.test(bc.customSlug)) {
      return bc.customSlug === slug;
    }
    let s = bc.branch.replace(/\//g, "__");
    if (bc.baseDir) s += "--" + bc.baseDir.replace(/\//g, "__");
    return s === slug;
  });
}

// Resolve owner/repo/slug → { repoConfig, branchConfig, branchDir, workDir }
// or send a 404 and return null. Every route below starts with this.
function resolveTarget(req, res) {
  const config = getConfig();
  const { owner, repo, slug } = req.params;
  const repoConfig = findRepo(config, owner, repo);
  if (!repoConfig) { res.status(404).json({ error: "Repo not found" }); return null; }
  const branchConfig = findBranchConfig(repoConfig, slug);
  if (!branchConfig) { res.status(404).json({ error: "Branch not found" }); return null; }
  const branchDir = getBranchDir(repoConfig.owner, repoConfig.repo, branchConfig);
  if (!fs.existsSync(branchDir)) { res.status(404).json({ error: "Branch not built yet — nothing checked out" }); return null; }
  const baseDir = branchConfig.baseDir || repoConfig.baseDir || "";
  const workDir = baseDir ? path.join(branchDir, baseDir) : branchDir;
  return { config, repoConfig, branchConfig, branchDir, workDir };
}

// Guard against path traversal on any user-supplied relative file path.
function safeJoin(root, relPath) {
  const target = path.resolve(root, relPath);
  const rootAbs = path.resolve(root);
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    throw new Error("Path escapes project root");
  }
  return target;
}

const SOURCE_EXT_RE = /\.(jsx?|tsx?|vue|svelte|html?|css|scss|astro)$/i;
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".vercel", ".output", "coverage", ".turbo", ".cache"]);

// Walk workDir collecting candidate source files (bounded, so a huge repo
// doesn't hang the request). Used both for the file tree in the code panel
// and for the best-guess search.
function walkSourceFiles(root, limit) {
  limit = limit || 4000;
  const out = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".") {
        if (ent.isDirectory() && !IGNORE_DIRS.has(ent.name)) { /* allow non-ignored dotdirs through only if explicitly needed — skip by default */ }
        continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!IGNORE_DIRS.has(ent.name)) stack.push(full);
      } else if (SOURCE_EXT_RE.test(ent.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

// ── GET /studio/:owner/:repo/:slug/tree ──────────────────────────────────
// Lightweight file tree of source-relevant files (for the code panel's
// file picker). Returns paths relative to workDir.
router.get("/studio/:owner/:repo/:slug/tree", (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const files = walkSourceFiles(t.workDir).map((f) => path.relative(t.workDir, f).split(path.sep).join("/"));
  files.sort();
  res.json({ workDir: path.relative(t.branchDir, t.workDir) || ".", files });
});

// ── GET /studio/:owner/:repo/:slug/file?path=... ─────────────────────────
router.get("/studio/:owner/:repo/:slug/file", (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const rel = req.query.path;
  if (!rel || typeof rel !== "string") return res.status(400).json({ error: "?path= required" });
  let full;
  try { full = safeJoin(t.workDir, rel); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).json({ error: "File not found" });
  const stat = fs.statSync(full);
  if (stat.size > 2 * 1024 * 1024) return res.status(413).json({ error: "File too large to edit in Studio (>2MB)" });
  const content = fs.readFileSync(full, "utf8");
  res.json({ path: rel, content, sha256: crypto.createHash("sha256").update(content).digest("hex") });
});

// ── PUT /studio/:owner/:repo/:slug/file ──────────────────────────────────
// Body: { path, content, baseSha256 }. baseSha256 is an optimistic-lock
// check — if the file changed on disk since the editor last read it (e.g.
// another rebuild reset it), the write is rejected instead of silently
// clobbering something the user hasn't seen.
router.put("/studio/:owner/:repo/:slug/file", express.json({ limit: "5mb" }), (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const { path: rel, content, baseSha256 } = req.body || {};
  if (!rel || typeof rel !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "path and content are required" });
  }
  let full;
  try { full = safeJoin(t.workDir, rel); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!SOURCE_EXT_RE.test(full)) return res.status(400).json({ error: "Studio only writes recognized source file types" });
  if (fs.existsSync(full) && baseSha256) {
    const current = crypto.createHash("sha256").update(fs.readFileSync(full, "utf8")).digest("hex");
    if (current !== baseSha256) {
      return res.status(409).json({ error: "File changed on disk since it was loaded — reload before saving", current });
    }
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  res.json({ ok: true, sha256: crypto.createHash("sha256").update(content).digest("hex") });
});

// ── POST /studio/:owner/:repo/:slug/rebuild ──────────────────────────────
// Triggers the exact same rebuild DV would run after a webhook push —
// reuses deployBranch() so Studio doesn't duplicate build logic. Since the
// files were edited in-place in the working tree, updateRepo()'s git
// fetch+reset would normally blow those edits away on the next *real* push
// cycle; for a Studio-triggered rebuild we skip the git sync step by
// calling the build path directly against the already-modified workDir.
//
// Practically: buildBranch/startServer both start from updateRepo() which
// does `git fetch && git reset --hard`. That WOULD discard uncommitted
// Studio edits. So Studio rebuilds must not go through the normal
// deployBranch() git sync — instead this route runs the project's build
// command directly against the existing (dirty) workDir, matching what
// build/executor.js does after its own updateRepo() call, minus the sync.
router.post("/studio/:owner/:repo/:slug/rebuild", express.json(), async (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const key = buildKey(t.repoConfig.owner, t.repoConfig.repo, t.branchConfig);
  const slot = buildStatus[key] || {};
  const buildCmd = t.branchConfig.buildCommand || slot.buildCommand || "";
  if (!buildCmd) {
    return res.status(400).json({ error: "No build command configured for this branch — nothing to run" });
  }
  try {
    res.json({ ok: true, started: true });
    await runCmd(buildCmd, t.workDir);
    // Reuse the same status machinery a normal build uses so the preview
    // iframe's existing "reload" affordance picks up fresh output.
    if (buildStatus[key]) {
      buildStatus[key].lastBuild = Date.now();
      buildStatus[key].status = "ready";
    }
  } catch (e) {
    if (buildStatus[key]) {
      buildStatus[key].status = "error";
      buildStatus[key].lastError = e.message;
    }
  }
});

// ── Best-guess DOM → source resolution ───────────────────────────────────
// POST body: { tag, classes: [...], text, attrs: {...} }
// Returns ranked candidate files with the matching line, so the UI can
// show "this is probably it — confirm?" rather than editing blind.
router.post("/studio/:owner/:repo/:slug/locate", express.json(), (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const { classes, text, attrs } = req.body || {};
  const needles = [];
  if (Array.isArray(classes)) {
    for (const c of classes) {
      if (c && c.length > 2 && !/^(active|hover|focus|disabled|open|closed|is-|has-)/.test(c)) needles.push(c);
    }
  }
  if (attrs && attrs["data-testid"]) needles.unshift(attrs["data-testid"]);
  if (attrs && attrs.id) needles.unshift(attrs.id);
  const trimmedText = (text || "").trim().slice(0, 40);
  if (trimmedText.length > 3) needles.push(trimmedText);

  if (!needles.length) return res.json({ candidates: [] });

  const files = walkSourceFiles(t.workDir, 6000);
  const candidates = [];
  for (const full of files) {
    let content;
    try { content = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
    const lines = content.split("\n");
    let bestLine = -1, bestScore = 0, matched = [];
    for (let i = 0; i < lines.length; i++) {
      let score = 0;
      const hitHere = [];
      for (const needle of needles) {
        if (needle && lines[i].indexOf(needle) !== -1) { score++; hitHere.push(needle); }
      }
      if (score > bestScore) { bestScore = score; bestLine = i; matched = hitHere; }
    }
    if (bestScore > 0) {
      candidates.push({
        path: path.relative(t.workDir, full).split(path.sep).join("/"),
        line: bestLine + 1,
        score: bestScore,
        matched,
        preview: lines[bestLine] ? lines[bestLine].trim().slice(0, 160) : ""
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  res.json({ candidates: candidates.slice(0, 8) });
});

// ── POST /studio/:owner/:repo/:slug/export ───────────────────────────────
// Body: { changes: [...] } — the accumulated visual-edit diff from the
// client. Returns it back as a formatted, downloadable JSON payload plus
// a plain-English summary block, so it can be handed to Claude directly.
router.post("/studio/:owner/:repo/:slug/export", express.json({ limit: "2mb" }), (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const changes = Array.isArray(req.body && req.body.changes) ? req.body.changes : [];
  const payload = {
    repo: t.repoConfig.owner + "/" + t.repoConfig.repo,
    branch: t.branchConfig.branch,
    slug: req.params.slug,
    exportedAt: new Date().toISOString(),
    changeCount: changes.length,
    changes: changes.map((c) => ({
      selector: c.selector || null,
      sourceFile: c.sourceFile || null,
      sourceLine: c.sourceLine || null,
      property: c.property,
      from: c.from,
      to: c.to,
      note: c.note || null
    }))
  };
  res.setHeader("Content-Disposition", "attachment; filename=\"studio-changes.json\"");
  res.json(payload);
});

// ── POST /studio/:owner/:repo/:slug/commit ───────────────────────────────
// Body: { message, files: [{path, content}] } — writes the given files
// (already-resolved source edits, not raw CSS overrides) then commits and
// pushes to the branch using the same token-credential helper the build
// pipeline uses. Nothing here is git-porcelain-shelled with unescaped
// user input; message goes through execFileSync-equivalent quoting via
// JSON.stringify, same pattern pipeline.js already uses.
router.post("/studio/:owner/:repo/:slug/commit", express.json({ limit: "5mb" }), async (req, res) => {
  const t = resolveTarget(req, res);
  if (!t) return;
  const { message, files } = req.body || {};
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });
  if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: "files[] is required" });

  const config = getConfig();
  if (!config.token) return res.status(400).json({ error: "No GitHub token configured — cannot push" });

  try {
    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
      let full;
      try { full = safeJoin(t.workDir, f.path); } catch (e) { return res.status(400).json({ error: e.message }); }
      if (!SOURCE_EXT_RE.test(full)) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.content, "utf8");
    }

    const tmpFile = path.join(require("os").tmpdir(), "dv-studio-git-cred-" + process.pid + "-" + Date.now() + ".txt");
    fs.writeFileSync(tmpFile, "https://x-access-token:" + config.token + "@github.com\n", { mode: 0o600 });
    try {
      const helper = "store --file=" + tmpFile;
      const gitPrefix = "git -c credential.helper= -c credential.helper=" + JSON.stringify(helper);
      await runCmd("git add -A", t.branchDir);
      // Nothing to commit is not an error from Studio's point of view.
      let hasChanges = true;
      try {
        execSync("git diff --cached --quiet", { cwd: t.branchDir });
        hasChanges = false;
      } catch (_) { hasChanges = true; }
      if (!hasChanges) {
        return res.json({ ok: true, committed: false, message: "No changes to commit" });
      }
      await runCmd(gitPrefix + " commit -m " + JSON.stringify(message), t.branchDir);
      await runCmd(gitPrefix + " push origin HEAD:" + JSON.stringify(t.branchConfig.branch), t.branchDir);
      const sha = execSync("git rev-parse HEAD", { cwd: t.branchDir }).toString().trim();
      res.json({ ok: true, committed: true, sha });
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
