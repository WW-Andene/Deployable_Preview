# DeployView — Reference

Complete reference for every module, route, configuration field, and
environment variable. For higher-level pitch see [README.md](../README.md);
for AI-first usage patterns see [MCP-COOKBOOK.md](MCP-COOKBOOK.md).

---

## §1 · Architecture

```
Deployable_Preview/
├── server/
│   ├── index.js              ← bootstrap: dotenv → loadConfig → routes → app.listen
│   ├── config.js             ← deployview.json read/write, secrets, resolveBranchEnv
│   ├── audit.js              ← append-only operator audit log
│   ├── monitor.js            ← health checks + scheduled rebuilds (cron + interval)
│   ├── webhooks.js           ← outgoing webhook subscribers (Slack/Discord/custom)
│   ├── preview-auth.js       ← per-branch password gate
│   ├── preview-errors.js     ← runtime-error collector for previews
│   ├── edge.js               ← per-branch redirects + custom headers
│   ├── image-opt.js          ← sharp-backed WebP/AVIF transcoder
│   ├── zip-stream.js         ← STORED-only ZIP writer for artifact downloads
│   ├── custom-domains.js     ← Host header → preview routing
│   ├── cron.js               ← 5-field cron parser
│   ├── proxy.js              ← preview HTTP proxy + HTML injection
│   ├── tunnel.js             ← cloudflared / ngrok / localtunnel manager
│   ├── apk.js                ← APK builds via GitHub Actions
│   ├── github.js             ← thin GitHub REST helper
│   ├── metrics.js            ← in-process metrics + Prometheus export
│   ├── logs.js               ← per-build log files + SSE broadcast
│   ├── process.js            ← runCmd / spawn helpers
│   ├── serverless.js         ← Vercel-style api/ scanning
│   ├── browser-setup.js      ← Playwright bootstrap
│   ├── mcp.js                ← MCP JSON-RPC adapter (stdio + dispatcher)
│   ├── mcp-streamable-http.js ← MCP over Streamable HTTP for claude.ai
│   ├── mcp-enrichments.js    ← lazy-loaded npm-library wrappers
│   ├── mcp-groq.js           ← Groq client + auth gate
│   ├── build/                ← split build pipeline
│   │   ├── state.js          ← buildStatus, history, snapshots, status broadcast
│   │   ├── detect.js         ← language + pygame detection, defaults
│   │   ├── pipeline.js       ← updateRepo, installDeps + build cache
│   │   ├── thumb.js          ← post-build screenshot + diff heatmap
│   │   ├── executor.js       ← static-build path (buildBranch)
│   │   ├── server.js         ← server-mode lifecycle (startServer)
│   │   └── scanner.js        ← post-build secret scan + perf budgets
│   ├── dv/                   ← MCP tool engine (single source of truth)
│   │   ├── core.js           ← defineTool / callTool / cache / progress
│   │   ├── lifecycle.js      ← browser library + page factory
│   │   ├── pool.js           ← persistent page session pool
│   │   ├── helpers.js        ← frame/coordinate helpers
│   │   ├── session.js        ← shim re-exporting lifecycle + pool + helpers
│   │   └── tools/
│   │       ├── deploy.js     ← list_previews, build_status, deploy_repo, rollback, …
│   │       ├── browse.js     ← screenshot, inspect, dom_query, find_all, meta
│   │       ├── interact.js   ← click/type/scroll/key/dialog/etc. (single tool)
│   │       ├── visual.js     ← pixel_color, screenshot_diff, palette, SSIM, …
│   │       ├── audit.js      ← accessibility, lighthouse, vitals, coverage, …
│   │       ├── network.js    ← capture_requests, har_capture, download, web_fetch
│   │       ├── content.js    ← ocr, text_diff, broken_links, stack_trace, unminify
│   │       ├── devtools.js   ← page_eval, page_errors
│   │       ├── ai.js         ← visual_query, find_element, visual_diff, verify_loop
│   │       ├── sandbox.js    ← isolated-context primitives
│   │       ├── live.js       ← live_burst (filmstrip)
│   │       ├── workflow.js   ← high-level orchestration
│   │       ├── aggregate.js  ← multi-tool composites
│   │       ├── pages.js      ← list_pages, close_page
│   │       ├── security.js   ← csp_check, vuln_scan
│   │       └── engine.js     ← dv_status, dv_tools (self-introspection)
│   ├── routes/
│   │   ├── preview.js        ← /preview/* + /test/* + /__snapshot/*
│   │   └── api/
│   │       ├── index.js      ← auth middleware + rate limit + sub-router mount
│   │       ├── config.js     ← repos / secrets / preferences / domains / env-groups
│   │       ├── build.js      ← build / rollback / history / artifact / webhooks
│   │       ├── infra.js      ← tunnel / browser / live MJPEG
│   │       ├── apk.js        ← APK build orchestration
│   │       ├── dv.js         ← MCP REST surface
│   │       └── fetch.js      ← /api/fetch/*
│   ├── services/
│   │   └── deployment.js     ← business logic between routes and core
│   ├── fetch/                ← split web_fetch implementation
│   │   ├── constants.js      ← limits, SSRF blocklist
│   │   ├── parser.js, transform.js, rss.js, client.js
│   ├── enrichments/          ← split optional-library wrappers
│   │   ├── lib.js, visual.js, audit.js, parsing.js
│   ├── browser/              ← Playwright primitives
│   │   ├── lifecycle.js, screenshot.js, interact.js, audit.js, network.js,
│   │   │   visual.js, deploy.js, eval.js, probe.js, state.js
│   │   └── index.js          ← lazy Proxy shim — only loads on first use
│   └── workspace/            ← per-branch clones, .snapshots/, .history/, .audit.jsonl
├── public/
│   ├── index.html
│   ├── manifest.webmanifest, sw.js, icon.svg
│   ├── css/style.css
│   └── js/
│       ├── app.js            ← state + render orchestrator + DV global
│       ├── icons.js, qr.js, md.js
│       └── views/
│           ├── topbar.js, dashboard.js, addRepo.js, preview.js,
│           │   mcp.js, settings.js, modals.js, palette.js, analytics.js,
│           │   setup.js
└── deployview.json           ← runtime config (git-ignored, atomic-write + .bak recovery)
```

**Hot reload semantics**: every server module is hot-replaceable in dev
via `nodemon`. Tools are registered once at boot via side-effects of
`require("./dv/tools/*")`; deleting `require.cache` for a tool file +
re-requiring re-registers cleanly.

---

## §2 · Configuration (`deployview.json`)

Single JSON file at the project root. Atomic-written via `.tmp` +
rename, with a `.bak` recovery pass on next boot if parse fails.
Validated + auto-repaired on every load (see `validateAndRepairConfig`
in `server/config.js`). Schema:

```jsonc
{
  // Auto-generated bearer for /api/* over tunnel. Auto-rotates only
  // when explicitly cleared. Redacted from /api/config/export.
  "apiSecret": "base64url-32-byte",

  // GitHub PAT (kept here AND in secrets.GITHUB_TOKEN). repo + workflow scopes.
  "token": "ghp_...",

  // Free-form K=V store. Read via getSecret(name, envFallback).
  // Surfaced in Settings → Secrets, masked last-4 only via /api/secrets.
  "secrets": {
    "GITHUB_TOKEN": "...", "WEBHOOK_SECRET": "...", "NGROK_AUTHTOKEN": "...",
    "GROQ_API_KEY": "...", "BROWSERLESS_API_KEY": "..."
  },

  // Anything that doesn't fit elsewhere. UI toggles, browser engine choice, etc.
  "preferences": {
    "browser":  "playwright",         // "playwright" | "browserless" | "auto"
    "tunnel":   "cloudflared",        // "cloudflared" | "ngrok" | "localtunnel"
    "claudeGroqAccess": true          // false revokes all Groq tools
  },

  // Reusable env-var bundles, referenced by branchConfig.envGroupIds.
  "envGroups": [
    { "id": "staging", "name": "Staging", "vars": { "DATABASE_URL": "...", "REDIS_URL": "..." } }
  ],

  // Outbound webhook subscribers. Signed by HMAC if `secret` is set.
  "webhooks": [
    {
      "id": "wh_a1b2c3",
      "url": "https://hooks.slack.com/...",
      "events": ["build.ready", "build.error"],   // or ["*"]
      "format": "slack",                          // "json" | "slack" | "discord"
      "enabled": true,
      "secret": "shared-secret-for-X-DV-Signature",
      "label": "#builds"
    }
  ],

  // Custom-domain mapping. Host header → preview triple.
  "domains": {
    "preview.example.com": { "owner": "foo", "repo": "bar", "slug": "main" }
  },

  // The repos list. Each repo has many activeBranches.
  "repos": [{
    "id":           "foo/bar",
    "owner":        "foo",
    "repo":         "bar",
    "description":  "...",                  // shown in dashboard cards
    "baseDir":      "",                     // monorepo subfolder default for this repo
    "buildCommand": "npm run build",        // repo-level fallback
    "outputDir":    "dist",                 // repo-level fallback
    "mode":         "static",               // "static" | "server"
    "startCommand": "npm start",            // server-mode only
    "envVars":      "KEY=value\n...",       // repo-level fallback (free text)
    "autoPRPreviews": false,                // I2 — webhook auto-adds pr-<N> branches

    "activeBranches": [{
      "branch":          "main",            // git branch name (required)
      "customSlug":      "v2",              // K4 — overrides slug in URL/files (optional)
      "baseDir":         "apps/web",        // overrides repo.baseDir
      "buildCommand":    "pnpm build",      // overrides repo.buildCommand
      "outputDir":       "dist",            // overrides repo.outputDir
      "mode":            "static",          // overrides repo.mode
      "startCommand":    "node server.js",  // server-mode only
      "envVars":         "PORT=3001",       // highest-priority env layer
      "language":        "auto",            // "auto" | "nodejs" | "java" | "python"

      "envGroupIds":     ["staging"],       // E1 — referenced env groups, in order
      "injectSecrets":   false,             // E2 — export ALL config.secrets to build env
      "previewPassword": "",                // D2 — gate preview behind a password
      "schedule":        3600,              // K9 — seconds OR cron string (e.g. "30 9 * * 1-5")

      "edge": {                             // G1 — per-branch proxy rules
        "redirects": [{ "from": "/old", "to": "/new", "status": 301 }],
        "headers":   [{ "pathPattern": "/api/*", "headers": { "X-Foo": "bar" } }]
      },

      "budgets": {                          // K6 — auto-fail on budget breach
        "maxBundleBytes":  524288,          // bytes
        "maxBuildSeconds": 90,
        "action":          "warn"           // "warn" | "fail"
      }
    }]
  }]
}
```

**Patchable repo fields** (via `PATCH /api/repos/:owner/:repo`):
`autoPRPreviews`, `description`, `buildCommand`, `outputDir`, `baseDir`,
`startCommand`, `mode`. Anything else requires a `POST /api/repos` (add)
or branch-level `PUT /api/repos/:owner/:repo/branch`.

---

## §3 · Environment variables

Loaded from `.env` and `.env.local` at boot via the built-in dotenv
fallback (no external dep). `process.env` always wins over file values.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `HTTPS_CERT` / `HTTPS_KEY` / `HTTPS_PORT` | unset | Local HTTPS so claude.ai can connect without a tunnel |
| `NODE_ENV` | unset | Treated as production for log verbosity / error-stack hiding |
| `LOG_REQUESTS` | unset | Log every HTTP request (`true` to enable) |
| `MAX_CONCURRENT_BUILDS` | `4` | Build queue width |
| `WEBHOOK_SECRET` | unset | **Required** — `POST /api/webhook` returns 403 if unset (fail-secure) |
| `NGROK_AUTHTOKEN` | unset | Used by `tunnel.js` ngrok provider |
| `BROWSERLESS_API_KEY` / `BROWSER_WS_ENDPOINT` | unset | Remote browser instead of local Playwright |
| `GROQ_API_KEY` | unset | Auth grant for Groq-backed MCP tools |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | unset | `1` skips Chromium download in `npm install` |
| `DEPLOYVIEW_SKIP_ENRICHMENTS` | unset | `1` disables lazy enrichment loading |
| `DV_NAV_TIMEOUT_MS` | `30000` | Default `page.goto` timeout (per-tool override via `navTimeout` opt) |
| `DV_SESSION_TTL_MS` | `300000` | Browser-pool idle eviction |
| `DV_MAX_SESSIONS` | `100` | Browser-pool ceiling |
| `DV_MAX_THUMBS` | `40` | LRU cap on thumbnail cache |
| `DV_MAX_LOG_BYTES` | `5242880` | Per-key log file rotates past this (5 MiB default) |
| `DV_MAX_HISTORY_PER_KEY` | `10` | Snapshot eviction depth — older snapshots `rm -rf`'d |
| `DV_HEALTH_INTERVAL_MS` | `60000` | Self-monitor poll interval |
| `DV_HEALTH_TIMEOUT_MS` | `5000` | Per-preview health check timeout |
| `DV_DISABLE_HEALTH` | unset | `1` opts out of self-monitoring + scheduled rebuilds |

**Secret resolution order** (highest priority wins):
`branchConfig.envVars` → `repoConfig.envVars` → `envGroupIds[]` (last
group wins on collision) → `config.secrets[*]` *if and only if*
`branchConfig.injectSecrets === true`.

---

## §4 · HTTP API reference

Every route is auth-gated by the `/api` middleware described in §7
**unless explicitly marked public**. The middleware is a no-op for
loopback IPs, so localhost calls always succeed without a token.

### §4.1 Identity / GitHub

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `GET`    | `/api/token` | — | `{ hasToken }` |
| `POST`   | `/api/token` | `{ token }` | `{ ok }` (rate-limited 10/min) |
| `GET`    | `/api/github/repos?type=all\|owner\|member&refresh=1` | — | `{ repos[], cached, count }` (5-min cache) |
| `GET`    | `/api/github/:owner/:repo/branches` | — | `{ branches[], defaultBranch, description }` |
| `GET`    | `/api/github/:owner/:repo/detect?branch=&baseDir=` | — | `{ framework, confidence, buildCommand, outputDir, mode, … }` |
| `GET`    | `/api/github/:owner/:repo/readme` | — | `{ md, cached, ageMs }` (10-min cache) |

### §4.2 Secrets / preferences

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/secrets` | — | List of `{ key, label, hasValue, masked, source }` (mask = last-4 only) |
| `GET`    | `/api/secrets/suggestions` | — | Built-in list of well-known secret keys |
| `POST`   | `/api/secrets` | `{ key, value }` | `{ ok }` (audit-logged · 200-secret cap) |
| `DELETE` | `/api/secrets/:key` | — | `{ ok }` (audit-logged) |
| `GET`    | `/api/preferences` | — | `config.preferences` object |
| `POST`   | `/api/preferences` | partial preferences | `{ ok }` |

### §4.3 Repositories / branches

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/repos` | — | `{ repos[] }` with branch statuses + thumbs (lean shape) |
| `POST`   | `/api/repos` | `{ owner, repo, activeBranches, mode, … }` | Created repo (rate-limited 20/min) |
| `PATCH`  | `/api/repos/:owner/:repo` | whitelisted top-level keys | `{ ok, repo }` |
| `DELETE` | `/api/repos/:owner/:repo` | — | `{ ok }` |
| `POST`   | `/api/repos/:owner/:repo/branch` | `{ branch, baseDir?, mode?, language?, startCommand? }` | `{ ok, activeBranches }` |
| `PUT`    | `/api/repos/:owner/:repo/branch` | `{ slug, baseDir?, buildCommand?, outputDir?, mode?, startCommand?, envVars?, language?, customSlug?, previewPassword?, injectSecrets?, envGroupIds?, edge?, schedule?, budgets? }` | `{ ok, branch }` |
| `DELETE` | `/api/repos/:owner/:repo/branch?slug=` | — | `{ ok }` |

### §4.4 Build lifecycle

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST`   | `/api/build/:owner/:repo?slug=` | — | `{ ok, message, mode }` (audit-logged · rate-limited 5/30s) |
| `POST`   | `/api/cancel/:owner/:repo?slug=` | — | `{ ok, cancelled }` |
| `POST`   | `/api/stop/:owner/:repo?slug=` | — | `{ ok }` (server-mode only) |
| `GET`    | `/api/status/:owner/:repo?slug=` | — | Lean buildStatus slot |
| `GET`    | `/api/log/:owner/:repo?slug=` | — | Plain-text log |
| `GET`    | `/api/logs/stream?key=` | SSE | `data: { connected: true, key }` then per-line log events |
| `GET`    | `/api/status/stream` | SSE | `data: { connected: true }` then `data: { key, slot }` per state change |
| `GET`    | `/api/thumb/:owner/:repo?slug=` | — | PNG (ETag + 30s cache) |
| `GET`    | `/api/thumb-diff/:owner/:repo?slug=` | — | PNG diff heatmap |
| `GET`    | `/api/artifact/:owner/:repo?slug=` | — | ZIP stream of the current outputDir |

### §4.5 History / rollback / annotations

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/history/:owner/:repo?slug=` | — | `{ history[], currentOutput }` newest-first |
| `POST`   | `/api/rollback/:owner/:repo` | `{ slug, historyId }` | `{ ok, message, entry }` (audit-logged) |
| `POST`   | `/api/history/:owner/:repo/note` | `{ slug, historyId, note }` | `{ ok, entry }` (note ≤ 2000 chars; "" clears) |
| `POST`   | `/api/history/:owner/:repo/tag` | `{ slug, historyId, tag }` | `{ ok, entry }` (tag a-z0-9_-/.; transfers off prior holder) |
| `POST`   | `/api/history/:owner/:repo/comment` | `{ slug, historyId, by, text }` | `{ ok, comment }` |
| `DELETE` | `/api/history/:owner/:repo/comment/:commentId?slug=&historyId=` | — | `{ ok }` |

### §4.6 Webhooks (incoming + outgoing)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST`   | `/api/webhook` | GitHub `push` or `pull_request` payload | `{ ok, triggered, … }` — public, HMAC-verified via `WEBHOOK_SECRET` |
| `GET`    | `/api/webhooks` | — | `{ webhooks[], validEvents }` (secrets stripped) |
| `POST`   | `/api/webhooks` | `{ url, label?, events[]?, format?, secret?, enabled? }` | `{ ok, webhook }` |
| `PUT`    | `/api/webhooks/:id` | partial | `{ ok, webhook }` |
| `DELETE` | `/api/webhooks/:id` | — | `{ ok }` |
| `POST`   | `/api/webhooks/:id/test` | — | `{ ok, message }` (fires synthetic event) |

### §4.7 Env-var groups

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/env-groups` | — | `{ groups: [{ id, name, keys[], keyCount }] }` |
| `GET`    | `/api/env-groups/:id` | — | `{ id, name, vars }` (values masked last-4) |
| `POST`   | `/api/env-groups` | `{ id, name?, vars }` | `{ ok, id }` |
| `PUT`    | `/api/env-groups/:id` | `{ name?, vars? }` | `{ ok, id }` |
| `DELETE` | `/api/env-groups/:id` | — | `{ ok }` |

### §4.8 Custom domains

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/domains` | — | `{ domains: [{ host, owner, repo, slug }] }` |
| `POST`   | `/api/domains` | `{ host, owner, repo, slug }` | `{ ok, host, target, hint }` (audit-logged) |
| `DELETE` | `/api/domains/:host` | — | `{ ok }` (audit-logged) |

### §4.9 Preview-app callbacks (public, no auth)

These are called from the user's deployed JS, not from operators.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/preview-errors/:owner/:repo/:slug` | `{ msg, file?, line?, col?, stack?, url?, userAgent? }` | `204` (deduped server-side, capped 50/branch) |
| `GET`  | `/api/preview-errors/:owner/:repo/:slug` | — | `{ errors[], summary }` |
| `DELETE` | `/api/preview-errors/:owner/:repo/:slug` | — | `{ ok }` |

### §4.10 Tunnel / browser / live stream

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`    | `/api/tunnel/status` | — | `{ running, url, provider, error }` |
| `POST`   | `/api/tunnel/start` | — | `{ ok, url }` |
| `POST`   | `/api/tunnel/stop` | — | `{ ok }` |
| `GET`    | `/api/browser/status` | — | `{ available, mode, … }` |
| `GET`    | `/api/browser/test` | — | `{ ok, steps[] }` |
| `POST`   | `/api/browser/setup` | — | `{ ok }` |
| `POST`   | `/api/browser/disable` | — | `{ ok }` |
| `POST`   | `/api/live/token` | `{ owner, repo, slug }` | `{ token, expiresInMs, scope }` (10-min, scoped to triple) |
| `GET`    | `/api/live/:owner/:repo/:slug?token=&fps=&seconds=&width=&height=` | — | MJPEG `multipart/x-mixed-replace` stream |

### §4.11 APK builder (GitHub Actions)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/apk/:owner/:repo` | `{ slug, appName? }` | `{ ok, key }` (kicks off the workflow push + dispatch) |
| `GET`  | `/api/apk/:owner/:repo/status` | — | `{ status, log, apkUrl?, runUrl? }` |
| `GET`  | `/api/apk/:owner/:repo/log-stream` | SSE | `data: { line }` for each new log line |
| `GET`  | `/api/apk/:owner/:repo/download` | — | Binary APK download |

### §4.12 Web fetch (universal scraper)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/api/fetch` | `{ url, ...opts }` | `{ ok, statusCode, body, headers, html?, json?, … }` |
| `GET`  | `/api/fetch?url=&...` | — | same as POST |

### §4.13 MCP REST surface (`/api/dv/*` + `/api/mcp/*` aliases)

Every MCP tool is reachable via REST (CORS-open) for non-MCP clients:

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `GET`  | `/api/dv/status` | — | DV engine status (tool count, browser, libraries) |
| `GET`  | `/api/dv/tools` | — | Full tool registry (schemas, categories, requires) |
| `POST` | `/api/dv/call` | `{ name, args }` | Tool result (MCP shape) |
| `POST` | `/api/dv/call/:name` | `args` (raw) | Same |
| `GET`  | `/api/mcp/tools` | — | Legacy alias |
| `POST` | `/api/mcp/call` | `{ tool, args }` | Legacy alias |
| `GET`  | `/api/mcp/screenshot/:owner/:repo/:slug?width=&height=&fullPage=` | — | PNG |
| `GET`  | `/api/mcp/inspect/:owner/:repo/:slug?selector=` | — | A11y tree / DOM |
| `GET`  | `/api/mcp/console/:owner/:repo/:slug?duration=` | — | Console capture |
| `POST` | `/api/mcp/interact/:owner/:repo/:slug` | tool args | Interaction result |
| `GET`  | `/api/mcp/pixel/:owner/:repo/:slug?x=&y=` | — | RGB(A) of one pixel |
| `GET`  | `/api/mcp/rect/:owner/:repo/:slug?selector=` | — | Bounding box + computed styles |
| `POST` | `/api/mcp/measure/:owner/:repo/:slug` | distance args | Distance result |
| `POST` | `/api/mcp/screenshot-diff` | two base64 PNGs | Diff result |
| `POST` | `/api/mcp/emulate/:owner/:repo/:slug` | DPR / dark / geo / throttle | `{ ok }` |
| `POST` | `/api/mcp/storage/:owner/:repo/:slug` | cookies / localStorage / sessionStorage CRUD | `{ ok, value? }` |
| `GET`  | `/api/mcp/perf/:owner/:repo/:slug` | — | Navigation + paint timing |
| `GET`  | `/api/mcp/requests/:owner/:repo/:slug?duration=&maxRequests=` | — | Network capture |
| `POST` | `/api/mcp/deploy-and-verify/:owner/:repo/:slug` | — | Build → wait → screenshot |
| `GET`  | `/api/mcp/previews` | — | Active previews list |

### §4.14 Workspace / config import-export

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/api/workspace/stats` | — | Per-dir size + active flag |
| `POST` | `/api/workspace/cleanup` | — | `{ removed, freedBytes }` |
| `GET`  | `/api/config/export` | — | JSON (token redacted, secrets stripped, apiSecret stripped) |
| `POST` | `/api/config/import` | exported JSON | `{ ok, added }` |

### §4.15 Observability + meta

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ ok, uptimeSec, memoryMB, toolsLoaded, browser, config }` (public) |
| `GET` | `/api/metrics` | `{ uptimeSec, counters, gauges, histograms }` (public) |
| `GET` | `/api/metrics/prometheus` | Prometheus text format (public) |
| `GET` | `/api/audit?n=200` | `{ entries[], max }` newest-first |

### §4.16 Top-level (not under `/api`)

| Method | Path | Returns |
|---|---|---|
| `GET`  | `/`                                    | SPA shell (`public/index.html`) |
| `GET`  | `/preview/:owner/:repo/:slug/*`        | Live preview (proxied or static) |
| `GET`  | `/preview/:owner/:repo/:slug/__snapshot/:id/*` | Time-travel preview from history snapshot or tag (`X-DV-Snapshot` header) |
| `POST` | `/preview/:owner/:repo/:slug/__auth`   | Password-protected preview login |
| `GET`  | `/test/:owner/:repo/:slug`             | Built-in test harness page |
| `GET`  | `/deploy?repo=&branches=`              | One-click deploy template — bounces to addRepo |
| `GET`  | `/badge/:owner/:repo/:slug`            | Shields-shaped status badge SVG |
| `*`    | `/mcp` (`POST`/`GET`/`DELETE`/`OPTIONS`) | MCP Streamable HTTP transport for claude.ai |
| `GET`  | `/sw.js`, `/manifest.webmanifest`, `/icon.svg` | PWA shell |

---

## §5 · MCP tools reference (95 tools)

Every tool is registered once in `server/dv/tools/*.js` via
`dv.defineTool({ name, category, description, requires, schema, handler })`
and reachable via:

- **MCP stdio** (`server/mcp.js`) — for Claude Desktop
- **MCP Streamable HTTP** (`/mcp` endpoint) — for claude.ai web
- **REST aliases** (`POST /api/dv/call/<name>` or legacy `/api/mcp/*`) — for curl/scripts

Capability gates: tools declare `requires: [{kind: "browser"}, {kind: "library", name: "..."}]`.
A missing capability returns a structured `MISSING_BROWSER` / `MISSING_LIBRARY` error
with the exact `npm install` hint, never a stack trace.

Every tool result is one of:

```ts
{ content: [{ type: "image"|"text", data?: base64, text?: string }], isError?: boolean }
```

Tools that need a deployment take the (`owner`, `repo`, `slug`) triple.
Tools that produce screenshots accept `{ width, height, fullPage }`.

### §5.1 Engine introspection

| Tool | What it does |
|---|---|
| `dv_status` | Engine state: tool count, browser availability, library status, Groq auth |
| `dv_tools` | Full tool registry with descriptions + categories |
| `dv_state` | Cross-cutting snapshot: previews + browser + tunnel + last build |
| `dv_toolbox` | Curated "what tool should I use for X" guide |
| `dv_workflow` | Multi-step orchestrator (deploy → verify → audit chain) |

### §5.2 Deploy / lifecycle

| Tool | What it does |
|---|---|
| `list_previews` | All deployed previews with status, URLs, ports (2s cache) |
| `build_status` | Status for one (owner, repo, slug) — sha, port, last build |
| `trigger_build` | Kick off a rebuild or server restart |
| `get_build_log` | Full build log text |
| `deploy_and_verify` | One-shot: trigger → wait until ready → screenshot + console |
| `deploy_repo` | End-to-end: add repo → detect framework → build default branch |
| `run_test` | Built-in test harness — clicks every interactive element, captures errors |
| `read_deployed_file` | Read any file from a built outputDir without re-cloning |

### §5.3 History / rollback / annotation

| Tool | What it does |
|---|---|
| `deployment_history` | Newest-first list of past builds with stable IDs |
| `rollback` | Point the live URL at a prior snapshot — instant, no rebuild |
| `compare_deployments` | File-level diff between two history entries |
| `bisect_builds` | Binary-search history for a regression (returns time-travel URL) |
| `annotate_deployment` | Attach a free-text note to a history entry |
| `analyze_build_failure` | Regex-classify a failed log into one of 11 known causes + fix suggestion |
| `commit_changelog` | GitHub commit list between two refs |
| `compare_branches` | Diff two branches (commits + files) |

### §5.4 Observation / browse

| Tool | What it does |
|---|---|
| `screenshot` | PNG of a deployed preview (sized, full-page optional) |
| `screenshot_multi` | Many screenshots in parallel — different viewports / paths |
| `inspect` | Accessibility tree + DOM structure + computed roles |
| `dom_query` | CSS-selector query, returns matched elements |
| `find_all` | Find all elements matching a description |
| `meta` | Title, OG tags, link tags, viewport, lang, favicon |
| `framework_data` | Detect React/Vue/Svelte/etc. + version + dev-tools state |
| `data_attrs` | All `data-*` attributes on the page |
| `cross_viewport` | Render at multiple breakpoints, detect responsive issues |
| `structure_analyze` | Heading outline + landmark regions for accessibility |

### §5.5 Interaction (single tool, many actions)

| Tool | What it does |
|---|---|
| `interact` | One tool, sub-actions: `click`, `type`, `fill`, `select`, `hover`, `focus`, `blur`, `back`, `forward`, `reload`, `key`, `tap`, `swipe`, `drag`, `scroll`, `pinch`, `dialog`, `evaluate`, `toggle`, `file-upload` |

Iframe-scoped via `frame: <selector|url-substring|name>`. `actionTimeout`
opt fails fast on missing selectors.

### §5.6 Visual / pixel

| Tool | What it does |
|---|---|
| `get_pixel_color` | RGB(A) at a single (x, y) — exact colour verification |
| `get_element_rect` | Bounding box + computed styles (structured, not screenshot) |
| `measure` | Distance / delta between two points or selectors |
| `screenshot_diff` | Pixel-compare two PNGs, returns count + heatmap |
| `tolerance_diff` | Anti-alias-tolerant diff via `looks-same` |
| `visual_similarity` | SSIM index — better than pixel diff for perceptual change |
| `palette` | Dominant colour palette (colorthief) |
| `color_stats` | Vibrancy + luminance distribution |
| `render_overlay` | Draw rectangles / labels on a screenshot for debug |
| `image_info` | Dimensions + EXIF metadata |

### §5.7 Audit / quality

| Tool | What it does |
|---|---|
| `accessibility` | Full axe-core WCAG 2.1 audit |
| `lighthouse` | Lighthouse perf / SEO / best-practices / a11y scores |
| `vitals` | Core Web Vitals (CLS, LCP, INP, FCP, TTFB) live collection |
| `performance` | Navigation timing, paint timings, resource counts, heap |
| `code_coverage` | V8 coverage data for executed JS |
| `validate_html` | W3C Nu HTML validator |
| `computed_styles` | Computed style map; optional structural diff (css-tree) |
| `css_specificity` | Specificity (A, B, C, D) for a selector |
| `csp_check` | Content-Security-Policy parser + issue report |
| `vuln_scan` | Known-vuln scan for shipped JS libs (retire) |
| `security_audit` | Composite: CSP + headers + cookies + mixed content |

### §5.8 Network / fetch

| Tool | What it does |
|---|---|
| `capture_requests` | Record every network request the preview makes for N seconds |
| `har_capture` | Same but in HAR format |
| `download` | Trigger + capture a file download as base64 |
| `web_fetch` | Universal URL fetcher (HTML, JSON, RSS, binaries, JS-rendered) |
| `robots` | robots.txt fetch + parse |
| `service_workers` | List + state of service workers in the page |
| `resource_timing` | PerformanceResourceTiming entries (start, ttfb, duration) |
| `cookies_full` | All cookies with full flag set (httpOnly, secure, sameSite) |

### §5.9 Content / parsing

| Tool | What it does |
|---|---|
| `ocr` | Read text from a screenshot (Tesseract or Groq vision) |
| `text_diff` | Structured diff (chars / words / sentences / lines) |
| `text_analysis` | Tokenize + sentiment + readability |
| `lang_detect` | Detect language of a text snippet |
| `broken_links` | Crawl-based broken-link scan (linkinator) |
| `stack_trace` | Parse raw JS stack trace into structured frames |
| `unminify` | Resolve minified positions back to original via source maps |
| `convert_format` | JSON ⇄ YAML ⇄ XML ⇄ CSV |
| `decode` | Base64 / URL / HTML-entity / JWT decoders |
| `file_sniff` | Detect file type from magic bytes |

### §5.10 Devtools / runtime

| Tool | What it does |
|---|---|
| `page_eval` | Run arbitrary JS in the page (DevTools console equivalent), with `writeFilesTo` for bulk binary dumps |
| `page_errors` | Always-on runtime error log (uncaught + console.error + requestfailed) |
| `console_logs` | Capture console output for N seconds |
| `get_last_error` | Last unhandled exception in the preview session |
| `clipboard` | Read/write the browser clipboard |
| `canvas_data` | Extract `<canvas>` pixels (2D `getImageData` / WebGL `toDataURL`) |
| `idb_inspect` | Read all IndexedDB databases / object stores |
| `browser_apis` | Detect which Web APIs the page is actually using |

### §5.11 State / emulation / sessions

| Tool | What it does |
|---|---|
| `emulate` | DPR, dark/light, reduced-motion, touch, geolocation, throttling, UA |
| `storage` | Read/write cookies, localStorage, sessionStorage |
| `reset_session` | Reset persistent browser session (clear all state) |
| `list_pages` | All open pages/tabs in the current browser context |
| `close_page` | Close a specific page by URL match |

### §5.12 Sandbox (isolated session)

| Tool | What it does |
|---|---|
| `sandbox_start` | Spin up an isolated browser context for a preview |
| `sandbox_exec` | Run a step (interact / eval / screenshot) inside the sandbox |
| `sandbox_state` | Inspect a sandbox's current state |
| `sandbox_log` | Console + network log for a sandbox |
| `sandbox_list` | List all active sandboxes |
| `sandbox_close` | Tear down a sandbox |

### §5.13 Live + composite

| Tool | What it does |
|---|---|
| `live_burst` | Capture a burst of frames as a filmstrip (closest MCP equivalent of live video) |

### §5.14 AI-augmented (Groq, requires `GROQ_API_KEY`)

| Tool | What it does |
|---|---|
| `visual_query` | Ask Groq a natural-language question about a screenshot |
| `find_element` | Groq locates an element by description, returns bounding box |
| `visual_diff` | Two screenshots → Groq describes what changed in words |
| `verify_loop` | Iterate evaluate → screenshot → Groq check until a condition is met |

**Authorization model**: setting `GROQ_API_KEY` IS the permission grant.
To revoke: set `preferences.claudeGroqAccess = false` in `deployview.json`.
Single source of truth: `isClaudeGroqAuthorized()` in `mcp-groq.js`.

---

## §6 · Preview routing

The `/preview/*` URL space layered top-down:

```
GET /preview/:owner/:repo/:slug/[*]
        │
        ├─► customDomainsMiddleware  (host → triple rewrite, runs at top of app)
        ├─► previewAuthMiddleware    (password gate, no-op if branch.previewPassword unset)
        ├─► edgeMiddleware           (per-branch redirects + custom headers)
        │
        ├─► /preview/.../api/*        ─► serverless API (Vercel-style /api scan) OR proxy
        ├─► /preview/.../__snapshot/<id-or-tag>/*  ─► time-travel from history snapshot
        ├─► /preview/.../__auth        ─► password POST handler
        │
        └─► main handler
              │
              ├─► server-mode running?  ─► proxy to localhost:<port>
              ├─► static outputDir?     ─► serveIndex (HTML w/ fetch + error shims)
              │                           OR express.static (other files)
              │                           OR image-opt transcode (?w=&fmt=…)
              └─► nothing built yet?    ─► notBuiltPage with auto-refresh meta
```

**Slug resolution**: `branchSlug(bc)` honors `bc.customSlug` first, then
falls back to `<branch.replace("/", "__")>` + optional `--<baseDir>` suffix.
The same slug is used for the URL, the workspace dir, the history file,
and the build key.

**HTML injection** (in `proxy.js`): every text/html response gets two
inline `<script>` shims injected into `<head>`:

1. **Fetch/XHR rewrite** — turns app-relative `fetch("/api/foo")` into
   `fetch("/preview/<owner>/<repo>/<slug>/api/foo")` so apps work
   transparently under the prefix.
2. **Error collector** — `window.onerror` + `unhandledrejection` →
   `POST /api/preview-errors/<owner>/<repo>/<slug>` with `keepalive`.

**CSP handling**: `frame-ancestors` directive is stripped (so the
preview can be iframe'd in the dashboard); other directives preserved.
`X-Frame-Options` is removed.

**Time-travel**: `/__snapshot/<id-or-tag>/` serves byte-for-byte from
`<branchDir>/.snapshots/<id>/`. The `<id-or-tag>` arg accepts either a
raw history ID **or** a snapshot tag (`v1.0-launch`); tag wins. Sets
`X-DV-Snapshot: <id>` response header so tooling can tell time-travel
responses apart from live ones.

---

## §7 · Authentication & authorization

Three independent layers:

### §7.1 Operator auth on `/api/*`

Middleware at the top of `routes/api/index.js`:

```
if (PUBLIC_PATHS.test(req.path)) → next();    // health/metrics/webhook/live/preview-errors
if (isLocalIp(req.ip))           → next();    // localhost trusted
if (constantTimeEq(supplied, expected)) → next();
else 401 { error: "Auth required for non-localhost access. …" };
```

**Token sources** (any of):

- `X-DV-Token: <token>` header
- `?dv_token=<token>` query
- `dv_token=<token>` cookie

**Token storage**: auto-generated 24-byte base64url string in
`config.apiSecret`. Created on first call to `getApiSecret()`. Redacted
from `/api/config/export`. Operators can rotate by clearing the field
and restarting.

### §7.2 Per-branch preview password

When `branchConfig.previewPassword` is set, `previewAuthMiddleware`
gates every `/preview/<owner>/<repo>/<slug>/*` request:

- **Cookie name**: `dv_pp_<sha256(key).slice(0,16)>` — doesn't reveal
  which branch a user has logged into.
- **Cookie value**: `HMAC-SHA256(password, apiSecret)` — leaked cookie
  can't recover the password.
- `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 12-hour `Max-Age`.
- Login form on miss; `POST /preview/.../__auth` validates + sets cookie.

### §7.3 Webhook HMAC

**Incoming GitHub** webhooks at `POST /api/webhook` require:

- `WEBHOOK_SECRET` env var or secret set (else 403 fail-secure).
- `X-Hub-Signature-256: sha256=<hmac>` header matching the body.
- Verified with `crypto.timingSafeEqual` to defeat timing attacks.

**Outgoing webhooks**: each subscriber may set its own `secret`. When
set, every POST includes `X-DV-Signature: sha256=<hmac>` over the body.

### §7.4 Live-stream tokens

`POST /api/live/token` takes `{ owner, repo, slug }` and returns a
10-minute scoped token. The token is bound to the triple — leaked
tokens can't be replayed against a different preview.

### §7.5 Groq access (Claude visual tools)

`isClaudeGroqAuthorized()` returns true iff:

- `config.secrets.GROQ_API_KEY` is set, AND
- `config.preferences.claudeGroqAccess !== false`.

Setting `GROQ_API_KEY` IS the grant. To revoke without deleting the
key, set `preferences.claudeGroqAccess = false`.

---

## §8 · Build pipeline

Static-mode (`server/build/executor.js`):

```
1. queued                     buildStatus[key] = { status: "queued", … }
2. building                   ─► broadcastStatus
   ├─ updateRepo()            git clone OR git fetch + reset --hard
   │                          token via credential.helper file (never in argv)
   ├─ resolveWorkDir()        cd into baseDir if set
   ├─ detectLanguage()        nodejs / java / python (or branch override)
   ├─ resolveBranchEnv()      secrets + envGroups + repo+branch envVars (layered)
   ├─ installDeps()           pnpm/yarn/npm install (skipped if lockfile SHA matches)
   │                          marker stored in node_modules/.dv-install-marker
   ├─ runCmd(buildCommand)    user's build script with the resolved env
   ├─ resolve outputDir       branchConfig.outputDir → repoConfig.outputDir → defaults
   ├─ scanApiRoutes()         Vercel-style api/ subfolder scan
   ├─ getDirectorySize()      bytes → bytesDelta vs prior history entry
   ├─ scanForSecrets()        12 patterns (ghp_/sk-/AKIA/PEM/…) + masked previews
   ├─ checkBudgets()          maxBundleBytes / maxBuildSeconds → action: warn|fail
   ├─ snapshotBuildOutput()   fs.cpSync to <branchDir>/.snapshots/<id>/
   ├─ appendHistory()         append entry to <branchDir>/../.history/<key>.json
   ├─ captureThumbAsync()     post-build screenshot + diff heatmap
   └─ webhooks.emit("build.ready")
3. ready                      ─► broadcastStatus, captureThumbAsync, monitor pings
```

Server-mode (`server/build/server.js`):

```
Same 1-3 plus:
4. spawn(startCommand)        with PORT env, detached process
5. waitForPort(port, 60s)
6. running                    auto-restart up to MAX_RESTARTS=3 on crash
   ├─ AUTO_RESTART_DELAY=5s
   └─ broadcasts on every state change
```

**Cancellation**: `cancelBuild(key)` flips `buildStatus[key].status =
"cancelled"`, deletes `buildLocks[key]`, `killServer(key)`. The
queued-restart `setTimeout` checks `slot.status !== "queued"` before
firing so cancellations are honoured.

**Concurrency**: bounded by `MAX_CONCURRENT_BUILDS` (default 4). Builds
beyond the cap are `queued` — the slot's `setTimeout(check, 5000)` keeps
them in line.

---

## §9 · Storage layout

```
workspace/
├── owner__repo__slug/                       per-branch git clone
│   ├── .git/                                 git history
│   ├── ... user's source ...
│   ├── node_modules/
│   │   └── .dv-install-marker                lockfile SHA for build cache
│   └── .snapshots/
│       ├── <id1>/                            byte-for-byte copy of one build's outputDir
│       ├── <id2>/
│       └── <id3>/                            evicted past DV_MAX_HISTORY_PER_KEY (default 10)
│
├── .history/
│   └── owner__repo__slug.json                per-key history array (newest-first)
│       [
│         { id, commitSha, timestamp, duration, snapshotDir,
│           bytes, bytesDelta, bytesDeltaPct,
│           by: "build"|"rollback",
│           note?, noteAt?, tag?, comments?: [{id, by, text, at}] }
│       ]
│
└── .audit.jsonl                              append-only audit log
                                              rotated past 5 MiB → .audit.1.jsonl

logs/
└── owner__repo__slug.log                     per-key build log
                                              rotated past DV_MAX_LOG_BYTES (default 5 MiB) → .log.1

deployview.json                               root config (atomic + .bak recovery)
deployview.json.bak                           previous good config
deployview.json.tmp                           transient during write
```

All paths under `workspace/` are guarded by `path.startsWith(WORKSPACE)`
checks before any `rm -rf` to prevent traversal.


---

## §10 · Webhooks

### §10.1 Incoming (GitHub → DV)

`POST /api/webhook` accepts GitHub webhook events.
**Required**: `WEBHOOK_SECRET` set in DV (else 403 fail-secure) AND
configured as the secret on the GitHub webhook side.

| Event | Action |
|---|---|
| `push` | If the ref matches a configured branch, kick off `deployBranch` |
| `pull_request` (opened / reopened / synchronize) | If `repoConfig.autoPRPreviews=true`, ensure a `pr-<N>` branch (with `head.ref` as branch + `pr-N` as customSlug) exists and build it |
| `pull_request` (closed) | If `autoPRPreviews=true`, remove the `pr-<N>` branch from `activeBranches` |
| Anything else | `{ ok: true, skipped: true }` |

**Setup on GitHub side**: Repo → Settings → Webhooks → Add:

```
Payload URL:  https://YOUR-DV-HOST/api/webhook
Content type: application/json
Secret:       <same as WEBHOOK_SECRET>
Events:       Pushes + Pull requests
```

### §10.2 Outgoing (DV → Slack/Discord/custom)

Subscribers in `config.webhooks[]`. Fired by `webhooks.emit(event, payload)`
on every state transition.

**Events** (any of these, or `["*"]` for all):

- `build.queued` — slot enters queue
- `build.started` — first time the slot flips to "building"
- `build.ready` — successful static build / running server
- `build.error` — failure OR self-monitor went broken OR secret-scan finding
- `build.cancelled` — user-initiated cancel
- `deploy.rolledback` — rollback applied

**Formats**:

| `format` | Body shape |
|---|---|
| `json` (default) | `{ event, timestamp, ...payload }` raw envelope |
| `slack` | `{ text: "*DeployView · build.ready*\nrepo: …\nbranch: …\n…" }` |
| `discord` | `{ embeds: [{ title, color, fields[…], timestamp }] }` (color per event type) |

**HMAC**: when `secret` is set, `X-DV-Signature: sha256=<hex>` is sent
over the JSON body. Receivers verify with their own HMAC.

**Test**: `POST /api/webhooks/<id>/test` fires a synthetic
`build.ready` event — useful for verifying receiver wiring without
waiting for a real build.

---

## §11 · Security model

DV is a **single-user, single-developer** preview platform by design.
Multi-tenant is out of scope.

### §11.1 Threat model

| Adversary | Mitigation |
|---|---|
| Random internet via tunnel URL | Bearer-token auth on `/api/*`, per-branch password gate, `WEBHOOK_SECRET` mandatory |
| Local user reading `ps` for the GitHub token | Token never appears in `git` argv — uses `credential.helper=store --file=` against a 0600 temp file |
| Tunnel URL leaking via logs | Tunnel URL is **not printed** to console — only a SHA-prefix is. Operators see the URL in Settings |
| Stack traces exposing $HOME / module layout | Never returned to clients; logged server-side only |
| Bundle leaking secrets | Post-build `scanForSecrets` — 12 patterns, masked previews, optional auto-fail via `budgets.action: "fail"` |
| SSRF via `web_fetch` | Blocklist covers RFC1918 + loopback + IPv6 ULA + link-local; DNS rebinding guard via custom `lookup` callback |
| Path traversal in `read_deployed_file` | `path.resolve` + `startsWith(rootDir + sep)` check |
| Path traversal in `customSlug` | Restricted to `^[a-zA-Z0-9_-]{1,64}$` |
| Audit log tampering | Append-only JSONL with single rotation depth — historical entries rotated to `.audit.1.jsonl`, never modified in place |
| CSP-stripping XSS in injected previews | Only `frame-ancestors` is stripped; `script-src` and friends preserved |
| MCP tool runaway / OOM | Per-key result LRU (configurable cap), histogram caps, per-tool timeouts, recursion depth caps |

### §11.2 Audit log

Every mutating operator action is recorded to `workspace/.audit.jsonl`.
Each entry:

```jsonc
{
  "ts":     1714060800000,
  "action": "secret.write",          // rollback, build.trigger, secret.write/delete, domain.add/remove, …
  "target": "GITHUB_TOKEN",
  "ip":     "127.0.0.1",
  "ua":     "Mozilla/5.0 …",
  "method": "POST",
  "path":   "/secrets",
  "detail": { "key": "GITHUB_TOKEN" } // /secret|password|token|key/i values auto-redacted
}
```

Tail via `GET /api/audit?n=200` (newest-first). Rotated past 5 MiB to
`.audit.1.jsonl`.

### §11.3 Secret handling rules

- Secrets are **never** echoed in API responses (only `hasValue: bool` + last-4 mask).
- Secrets are **never** included in `/api/config/export` (stripped).
- Secrets are exported to a build's environment **only if** `branchConfig.injectSecrets === true`.
- Webhook subscribers' `secret` field is stripped from `GET /api/webhooks` (replaced with `hasSecret: bool`).
- The audit log auto-redacts any field name matching `/secret|password|token|key/i`.

---

## §12 · Monitoring & observability

### §12.1 Self-monitoring

`server/monitor.js` runs every `DV_HEALTH_INTERVAL_MS` (default 60 s):

1. **Health pings** — for every `ready`/`running` preview, GET its
   loopback `/preview/.../` with a 5 s tight timeout. Update
   `buildStatus[key].health` to `"ok"` / `"broken"` + `healthReason`.
   Going `ok → broken` fires a `build.error` outgoing webhook.
2. **Scheduled rebuilds** — for every branch with `bc.schedule` set,
   either an integer (seconds between rebuilds) or a 5-field cron
   expression, kick off `deployBranch` if the schedule says so.

Dashboard SSE relays the health flips in real time so red-tinted
"broken" pills appear without a page reload.

Disable globally with `DV_DISABLE_HEALTH=1`.

### §12.2 Metrics

`server/metrics.js` records:

- **Counters** — `tool.ok.<name>`, `tool.fail.<name>`, `tool.cachehit.<name>`
- **Gauges** — `tools.count`, plus heap + uptime via `/api/metrics`
- **Histograms** — `tool.latencyMs.<name>` with bucket counts

Exposed at:

- `GET /api/metrics` — JSON snapshot (used by the Analytics dashboard)
- `GET /api/metrics/prometheus` — Prometheus text format for scraping

### §12.3 Runtime errors

Every preview HTML response gets a tiny inline collector injected by
`proxy.js`. It captures `window.onerror` + `unhandledrejection` and
POSTs to `/api/preview-errors/:owner/:repo/:slug` with `keepalive`
(survives `beforeunload`).

Server-side dedupe by SHA1(`msg|file|line|col`), capped 50 unique per
branch. Dashboard polls `/api/preview-errors/.../summary` every 15 s
and shows a `⚠ N` pill on rows with errors.

### §12.4 Logs

- **Build logs** — per-key file at `logs/<key>.log`, rotated past
  `DV_MAX_LOG_BYTES` (5 MiB) to `<key>.log.1`. Live-streamed via SSE
  at `/api/logs/stream?key=...`.
- **Server logs** — stdout. The dashboard's Analytics view shows
  in-process metrics; for long-term retention pipe stdout to a file
  rotator (`pm2`, `systemd-journald`, etc.).

---

## §13 · Deployment

### §13.1 Local dev

```bash
git clone https://github.com/WW-Andene/Deployable_Preview && cd Deployable_Preview
npm install
npm start                       # http://localhost:3000
```

### §13.2 With HTTPS (so claude.ai can connect without a tunnel)

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'
HTTPS_CERT=cert.pem HTTPS_KEY=key.pem npm start
```

### §13.3 Public tunnel

```bash
# cloudflared (preferred — no auth needed, auto-installed)
# ngrok      (set NGROK_AUTHTOKEN)
# localtunnel (always works as fallback)

# In the dashboard: Settings → HTTPS Tunnel → Start
# OR via API: POST /api/tunnel/start
```

### §13.4 systemd

```ini
# /etc/systemd/system/deployview.service
[Unit]
Description=DeployView
After=network.target

[Service]
Type=simple
User=deployview
WorkingDirectory=/opt/deployview
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/deployview/.env
StandardOutput=append:/var/log/deployview.log
StandardError=append:/var/log/deployview.err

[Install]
WantedBy=multi-user.target
```

### §13.5 Docker

```bash
docker build -t deployview .
docker run -d \
  --name deployview \
  -p 3000:3000 \
  -v $(pwd)/deployview.json:/app/deployview.json \
  -v $(pwd)/workspace:/app/workspace \
  -v $(pwd)/logs:/app/logs \
  -e WEBHOOK_SECRET=... \
  deployview
```

### §13.6 Termux (Android)

Works out of the box on ARM64 Android with Termux:

```bash
pkg install nodejs git
git clone https://github.com/WW-Andene/Deployable_Preview && cd Deployable_Preview
npm install --omit=optional   # skip Playwright + native libs that need Android NDK
npm start
```

Browser-backed MCP tools degrade to "no browser available" cleanly;
everything else works. Use `BROWSERLESS_API_KEY` for remote browser
without local Playwright.

### §13.7 Backups

`deployview.json` is the only file that holds operator data (config,
secrets, history pointer). Back it up regularly:

```bash
cp deployview.json ~/Dropbox/deployview-$(date +%F).json
```

Workspace + logs + snapshots are disposable — DV will re-clone and
rebuild from GitHub on demand.

---

## §14 · See also

- [README.md](../README.md) — 30-second pitch + competitor comparison
- [MCP-COOKBOOK.md](MCP-COOKBOOK.md) — concrete Claude usage patterns
- [SETUP.md](SETUP.md) — production deployment guide
- [CHANGELOG.md](CHANGELOG.md) — what changed and when
- [AUDIT-app-2026-04-25.md](AUDIT-app-2026-04-25.md) — most recent full security + UX audit
