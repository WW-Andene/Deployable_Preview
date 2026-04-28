# DeployView Setup

## Quick start (local)

```bash
git clone https://github.com/WW-Andene/Deployable_Preview.git
cd Deployable_Preview
npm install
npm start
# open http://localhost:3000
```

The first browser visit walks through:

1. Paste a GitHub PAT (needs `repo` and optionally `workflow` scope).
2. Add a repo + branches.
3. DeployView builds them and serves previews under `/preview/owner/repo/branch/...`.

## Environment variables

Copy `.env.example` to `.env` and edit. Loaded automatically at startup.
Values from `.env.local` override `.env`.

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `HTTPS_CERT` / `HTTPS_KEY` / `HTTPS_PORT` | Local HTTPS (lets claude.ai connect without a tunnel) | unset |
| `NGROK_AUTHTOKEN` | Required for the ngrok tunnel provider | unset |
| `BROWSERLESS_API_KEY` / `BROWSER_WS_ENDPOINT` | Remote browser instead of local Playwright | unset |
| `WEBHOOK_SECRET` | Required to accept GitHub webhooks (server fail-secures with 403 otherwise) | unset |
| `MAX_CONCURRENT_BUILDS` | Build queue width | `4` |
| `DV_MAX_THUMBS` | LRU cap for thumbnails kept in RAM | `40` |
| `DV_SESSION_TTL_MS` | Browser session idle timeout | `300000` |
| `DV_MAX_LOG_BYTES` | Rotate build log when it grows past this | `5 MiB` |

## Auth model

DeployView trusts whoever is on `localhost`. When you start a tunnel, the
`/api/*` surface gates non-localhost requests behind a bearer token:

- The token is auto-generated and stored in `deployview.json` (`apiSecret`).
- It's redacted from `/api/config/export`.
- Pass it on tunnel calls via `X-DV-Token: <token>` header, `?dv_token=<token>`
  query, or `dv_token=<token>` cookie.
- `/api/health`, `/api/metrics`, `/api/webhook` (HMAC-protected),
  and `/api/live/...` (own scoped token) are exempt.

## Webhooks

GitHub-side: set the **Secret** to the same value as `WEBHOOK_SECRET`.
Set Content-Type to `application/json`. Trigger on `push` events.

If `WEBHOOK_SECRET` is unset, the server returns **403** rather than
accepting unsigned events from anyone who learns the tunnel URL.

## Production deployment

A minimal systemd unit:

```ini
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

[Install]
WantedBy=multi-user.target
```

Or Docker — see the `Dockerfile`. For Browserless instead of bundling
Playwright, set `BROWSERLESS_API_KEY` and skip the browser binary.

## Backups

`deployview.json` holds your config + secrets. Copy it (and `.bak` if
present) to a safe place. The workspace tree under `workspace/` is
disposable — DeployView will re-clone whatever it needs.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `spawn sh ENOENT` on Windows | Now handled (uses `cmd.exe /c`). Update to the latest commit. |
| `Playwright browser not found` | `npm install playwright && npx playwright install chromium`, or use `BROWSERLESS_API_KEY`. |
| Webhook returns 403 | `WEBHOOK_SECRET` is required (intentional — see Auth model). |
| Tunnel URL doesn't appear in logs | Intentional. Read it from `Settings → Tunnel` in the UI. |
| `/api/...` returns 401 over tunnel | Add the `X-DV-Token` header. Token is in `deployview.json`. |
