# DeployView — Reference

Complete reference for every module, route, configuration field, and
environment variable. For higher-level pitch see [README.md](README.md);
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
| `BROWSERLESS_API_KEY` / `BROWSERLESS_WS_ENDPOINT` | unset | Remote browser instead of local Playwright |
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
