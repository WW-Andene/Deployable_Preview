# MCP Cookbook

How to actually use DeployView from Claude. Concrete patterns, real
tool calls, the workflow each pattern replaces.

For the full reference of all 95 tools see [DOCS.md §5](DOCS.md#5--mcp-tools-reference-95-tools).

---

## Setup

### Claude Desktop

```jsonc
// ~/.config/Claude/claude_desktop_config.json  (Linux)
// ~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)
{
  "mcpServers": {
    "deployview": {
      "command": "node",
      "args": ["server/mcp.js"],
      "cwd": "/path/to/Deployable_Preview"
    }
  }
}
```

### Claude.ai web

DV exposes MCP Streamable HTTP at `POST /mcp`. claude.ai requires HTTPS.

```bash
# 1. Get a public HTTPS URL (cloudflared bundles this)
HTTPS_CERT=cert.pem HTTPS_KEY=key.pem npm start
cloudflared tunnel --url https://localhost:3443

# 2. claude.ai → Settings → Integrations → Add MCP server
#    URL: https://<your-tunnel>.trycloudflare.com/mcp
```

For non-localhost access claude.ai will need DV's auth token.
Pass it in the integration config as a header:

```
X-DV-Token: <value of config.apiSecret>
```

(Get the token: open `deployview.json` or call `GET /api/health` from
localhost — the `apiSecret` is auto-generated on first save.)

---

## Recipe 1 · Deploy a repo end-to-end (one tool call)

> **You**: "Deploy github.com/foo/bar"

```jsonc
// Claude calls:
deploy_repo({ url: "https://github.com/foo/bar" })

// Returns:
{
  owner: "foo",
  repo:  "bar",
  defaultBranch: "main",
  detectedFramework: "vite",
  mode: "static",
  triggered: [
    { branch: "main", slug: "main", previewUrl: "/preview/foo/bar/main/" }
  ],
  hint: "Poll build_status for each slug to watch the build, …"
}
```

That's it. Repo added, framework auto-detected, build queued.

**To wait + verify**: chain with `deploy_and_verify` instead, or
poll `build_status` until `status === "ready"`:

```jsonc
deploy_and_verify({ owner: "foo", repo: "bar", slug: "main", wait: 120 })
// → returns { screenshot, commitSha, duration, log: "...", … }
```

---

## Recipe 2 · Debug a failed build

> **You**: "Why did the last build of foo/bar:main fail?"

```jsonc
// Step 1: classify the failure
analyze_build_failure({ owner: "foo", repo: "bar", slug: "main" })

// Returns:
{
  cause:      "MISSING_DEP",
  suggestion: "Install missing dependency: lodash — add it to package.json or run `npm install lodash`.",
  allMatches: [{ code: "MISSING_DEP", matchedAt: 142, context: "..." }],
  hint:       "Apply the suggestion, then trigger_build to retry."
}

// Step 2 (only if classification is uninformative): grep the log
get_build_log({ owner: "foo", repo: "bar", slug: "main" })
```

**Why this is better than reading the raw log**: the analyzer matches
11 known categories (`MISSING_DEP`, `OOM`, `PORT_IN_USE`, `SYNTAX_ERROR`,
`TYPESCRIPT_ERROR`, `PERMISSION`, `NETWORK`, `TOKEN_EXPIRED`,
`BUILD_TIMEOUT`, `DISK_FULL`, `MISSING_OUTPUT`) and returns concrete
fixes, not "here's 5 MB of npm output, good luck".

---

## Recipe 3 · Find the commit that broke prod (bisect)

> **You**: "The site's been broken since this morning. Find the commit."

```jsonc
// Step 1: get the IDs of a known-good and known-bad build
deployment_history({ owner: "foo", repo: "bar", slug: "main" })
// → array of { id, commitShort, timestamp, by, … }

// Pick goodId (yesterday's working build) + badId ("latest" alias)

// Step 2: ask DV for the next probe
bisect_builds({ owner: "foo", repo: "bar", slug: "main", goodId: "lkj4...", badId: "latest" })

// Returns:
{
  done: false,
  probeId:    "kj9a...",
  probeCommit:"a1b2c3d",
  timeTravelUrl: "/preview/foo/bar/main/__snapshot/kj9a.../",
  remainingSteps: 3,
  hint: "Visit timeTravelUrl. If it works, call bisect_builds again with goodId='kj9a...', badId='latest'. If broken, with goodId='lkj4...', badId='kj9a...'."
}

// Step 3: visit the time-travel URL, decide good/bad, recurse with narrowed range
// O(log N) probes. When done:true → firstBadId is the introducer.
```

The time-travel URL serves the snapshot byte-for-byte. **No rebuild.
No git checkout. No risk to the live preview.**

---

## Recipe 4 · Rollback a broken deploy

```jsonc
deployment_history({ owner: "foo", repo: "bar", slug: "main" })
// pick the previous good entry's id

rollback({ owner: "foo", repo: "bar", slug: "main", id: "<prev-build-id>" })
// → { message: "Rolled back to a1b2c3d", entry: {...},
//     previewUrl: "/preview/foo/bar/main/" }
```

Static-mode previews flip instantly — `outputPath` repoints at the
snapshot dir. Server-mode previews refuse with `BAD_MODE` (no daemon
to repoint at — re-run `trigger_build` against the target SHA instead).

The rollback itself is recorded as an audit entry in history, so the
trail of "we shipped X, rolled back to Y, then forward to Z" survives.

---

## Recipe 5 · "What shipped between two builds?"

```jsonc
// File-level diff
compare_deployments({
  owner: "foo", repo: "bar", slug: "main",
  base: "<older-id-or-'latest'>",
  head: "<newer-id-or-'current'>"
})

// Returns:
{
  base: { ref: "...", files: 124, totalBytes: 580_320 },
  head: { ref: "...", files: 127, totalBytes: 612_840 },
  delta: { files: 3, bytes: 32_520, bytesPct: 5.6 },
  added:   { count: 3, items: [{ path: "assets/new.png", bytes: 12200 }, …] },
  removed: { count: 0, items: [] },
  changed: { count: 8, items: [{ path: "app.js", before: 80_000, after: 92_000, delta: 12_000 }, …] }
}

// Plus the git side
commit_changelog({
  owner: "foo", repo: "bar",
  base: "<base-sha>", head: "<head-sha>"
})
// → list of commits with author + first-line message + sha
```

Pair both calls and you have a complete "release notes" picture
without leaving the chat.

---

## Recipe 6 · Inspect what's actually deployed

> **You**: "What's in the index.html that's currently being served?"

```jsonc
read_deployed_file({
  owner: "foo", repo: "bar", slug: "main",
  path: "index.html"
})

// Returns:
{
  path:    "index.html",
  bytes:   2480,
  binary:  false,
  content: "<!DOCTYPE html>\n<html>..."
}
```

Path traversal is rejected (`../` resolves outside the outputDir → error).
Binary files come back base64-encoded with `binary: true`.

Use case: Claude inspects post-build artifacts (generated HTML, source
maps, optimized bundles) without spending a tool call on `git clone`.

---

## Recipe 7 · Visual regression catch

```jsonc
// 1. Take a screenshot now
const before = await screenshot({ owner: "foo", repo: "bar", slug: "main", width: 1280, height: 800 })
// → { base64: "...", width, height }

// 2. Trigger a build
await trigger_build({ owner: "foo", repo: "bar", slug: "main" })
// poll build_status until "ready"

// 3. Take another
const after = await screenshot({ owner: "foo", repo: "bar", slug: "main", width: 1280, height: 800 })

// 4. Diff
screenshot_diff({ a: before.base64, b: after.base64 })
// → { pixelsDifferent, percent, boundingBox, heatmapBase64 }
```

For perceptual / anti-alias-tolerant diff use `tolerance_diff` instead.
For "what visually changed" in plain English use `visual_diff` (Groq).

---

## Recipe 8 · Find a button you can describe but can't selector

```jsonc
// Old way: dom_query with 6 selector attempts
// New way:
find_element({
  owner: "foo", repo: "bar", slug: "main",
  description: "the orange 'Sign up' button in the hero section"
})

// Returns:
{
  bbox: { x: 540, y: 280, width: 120, height: 44 },
  confidence: 0.92,
  text: "Sign up"
}

// Then click it by coordinates
interact({
  owner: "foo", repo: "bar", slug: "main",
  action: "click", x: 600, y: 302
})
```

Requires `GROQ_API_KEY`.

---

## Recipe 9 · Audit accessibility on every PR

```jsonc
// (a) After build.ready webhook fires, run:
accessibility({ owner: "foo", repo: "bar", slug: "pr-42" })
// → axe-core report grouped by impact: critical / serious / moderate / minor

// (b) Lighthouse for perf budget
lighthouse({ owner: "foo", repo: "bar", slug: "pr-42",
             categories: ["performance", "accessibility", "seo"] })
// → { performance: 0.92, accessibility: 1.0, … }

// (c) Annotate the deployment with a one-liner summary
annotate_deployment({
  owner: "foo", repo: "bar", slug: "pr-42",
  id: "<latest-history-id>",
  note: "PR #42 — Lighthouse perf 92/100, axe: 0 violations"
})
```

---

## Recipe 10 · Tag a release & let users CNAME a domain at it

```jsonc
// 1. Tag the latest build
deployment_history({ owner: "foo", repo: "bar", slug: "main" })
// pick the entry → tag it

// (HTTP, since there's no MCP tool for tagging right now — use
// /api/dv/call to wrap the route)
// or POST /api/history/foo/bar/tag { slug:"main", historyId:"...", tag:"v1.0-launch" }

// 2. Anyone visiting /preview/foo/bar/main/__snapshot/v1.0-launch/
//    gets the byte-for-byte content of that build.

// 3. Optionally map a custom domain at the live or tagged URL via
//    Settings → Custom Domains, or:
// POST /api/domains { host:"v1.example.com", owner:"foo", repo:"bar", slug:"main" }
```

---

## Recipe 11 · Bulk dump assets from a deployed app (page_eval + writeFilesTo)

> **You**: "Pull every webp portrait from the running preview and save them to disk."

```jsonc
page_eval({
  owner: "foo", repo: "bar", slug: "main",
  writeFilesTo: "/home/me/dump",
  await: true,
  code: `
    const out = {};
    for (const img of document.querySelectorAll('img.portrait')) {
      const r = await fetch(img.src);
      const buf = new Uint8Array(await (await r.blob()).arrayBuffer());
      let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
      out[img.dataset.relpath] = btoa(bin);
    }
    out;
  `
})

// Returns ONLY a small manifest — no base64 burns the chat context:
{
  files: {
    dir: "/home/me/dump",
    written: [{ path: "linnai/Portraits_Linnai_3.webp", bytes: 24576 }, …],
    skipped: [{ path: "missing.webp", reason: "ERR_NOT_FOUND" }],
    totalBytes: 1_234_567
  }
}
```

`writeFilesTo` rejects path traversal and `ERR_*` sentinel values.

---

## Recipe 12 · Long-running tools without hitting the 60s MCP client timeout

The MCP client (Claude Desktop / claude.ai) times out tool calls at ~60 s.
DV emits `notifications/progress` while a long tool runs — claude.ai
resets its per-request timer each time one arrives.

You don't have to do anything for this to work — `download` and other
slow tools heartbeat automatically. But you can also pass
`_meta.progressToken` on any `tools/call` if you want the server to
emit progress for that call.

---

## Recipe 13 · Watch a build live without polling

The dashboard does this via SSE. From a script:

```bash
# All status changes
curl -N https://<dv>/api/status/stream
# data: { connected: true }
# data: { key: "foo/bar:main", slot: { status: "building", … } }
# data: { key: "foo/bar:main", slot: { status: "ready",    … } }

# Per-build log lines
curl -N "https://<dv>/api/logs/stream?key=foo/bar:main"
```

---

## Tool composition cheatsheet

What to call when:

| Goal | Tool chain |
|---|---|
| Spin up a new repo from scratch | `deploy_repo` |
| Wait + verify a build | `deploy_and_verify` |
| Find a regression | `deployment_history` → `bisect_builds` (loop) |
| Roll back fast | `deployment_history` → `rollback` |
| Diagnose a failed build | `analyze_build_failure` (then `get_build_log` if needed) |
| What shipped? | `commit_changelog` + `compare_deployments` |
| Audit a preview | `accessibility` + `lighthouse` + `vitals` |
| Inspect a deployed file | `read_deployed_file` |
| Bulk-extract data from a preview | `page_eval` with `writeFilesTo` |
| Visual regression | `screenshot` × 2 + `screenshot_diff` (or `visual_diff` for Groq prose) |
| Click a button I can describe | `find_element` (Groq) → `interact` |
| Watch a slow build | use the dashboard, OR `curl /api/logs/stream` |

---

## Patterns that work well with Claude

1. **Always start with `dv_state`** when you don't know what's deployed.
   It's a single call that gives you previews + browser + tunnel + last-build state.

2. **Cache-aware**: `list_previews` and `dv_status` cache for 1–2 s.
   Repeated calls in the same chat turn are essentially free.

3. **Prefer composite tools over chains**: `deploy_and_verify`
   replaces `trigger_build` + `build_status` × 5 + `screenshot`.
   `dv_workflow` and `dv_toolbox` are higher-level still.

4. **Annotate your work**: after a non-trivial deploy / rollback,
   call `annotate_deployment` with a one-liner. Future Claude sessions
   (and human teammates) get instant context.

5. **Use `_meta.progressToken`** on calls you expect to take >30 s
   so claude.ai shows a progress bar instead of looking frozen.
