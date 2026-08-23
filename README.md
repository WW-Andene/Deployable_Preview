# DeployView

> Self-hosted preview platform + MCP toolbox for Claude.
> Vercel + Netlify + Lighthouse + Sentry, in one Node process you can run on your phone.

```bash
git clone https://github.com/WW-Andene/Deployable_Preview && cd Deployable_Preview
npm install && npm start            # → http://localhost:3000
```

That's it. Open the dashboard, paste a GitHub PAT, pick a repo, click Install.
60 seconds later you have a live preview at `/preview/owner/repo/main/`.

---

## Why DeployView

| | Vercel | Netlify | **DeployView** |
|---|:---:|:---:|:---:|
| Self-hosted | ❌ | ❌ | ✅ |
| Runs on a phone (Termux) | ❌ | ❌ | ✅ |
| Per-build bundle-size delta | $$ | $ | ✅ free |
| Build-time secret scanning | $$$ | ❌ | ✅ free |
| Performance budgets (auto-fail) | $$$ | ❌ | ✅ free |
| Time-travel preview routing | ❌ | ❌ | ✅ |
| Snapshot tagging (`v1.0-launch`) | ❌ | ❌ | ✅ |
| `bisect_builds` to find regressions | ❌ | ❌ | ✅ |
| MCP toolbox for Claude.ai | ❌ | ❌ | **86+ tools** |
| Audit log of every action | $$ | ❌ | ✅ free |
| Custom domains | ✅ | ✅ | ✅ self-DNS |
| Auto PR previews | ✅ | ✅ | ✅ |
| Outgoing webhooks (Slack/Discord) | ✅ | ✅ | ✅ + HMAC |
| QR-code share for mobile testing | ❌ | ❌ | ✅ |
| Visual diff slider | ❌ | ❌ | ✅ |
| Inline runtime-error capture | $$ | $ | ✅ free |
| Cost / month | $20+ team | $19+ team | $0 forever |

## What's in the box

- **Dashboard** — live SSE updates, deployment history, rollback, share-via-QR, pull-to-refresh, PWA install
- **MCP Server** — 86+ tools for Claude (screenshot / DOM / interact / audit / build / deploy / rollback / bisect …)
- **Preview routing** — `/preview/owner/repo/<slug>/`, with custom slugs, password protection, custom domains, time-travel `__snapshot/<id>/`
- **Edge middleware** — per-branch redirects + custom headers (Vercel `_redirects` + `_headers` parity)
- **Image optimization** — sharp resize + WebP/AVIF negotiation at the proxy layer
- **APK Builder** — Android APKs via GitHub Actions, no local Android SDK
- **Self-monitoring** — pings every preview every 60 s, red-tints broken ones live
- **Build cache** — skips `npm install` when lockfile SHA hasn't changed (30–120 s saved per rebuild)

## Quick links

- [docs/DOCS.md](docs/DOCS.md) — full reference (every route, every config field, every env var)
- [docs/MCP-COOKBOOK.md](docs/MCP-COOKBOOK.md) — concrete Claude usage patterns
- [docs/SETUP.md](docs/SETUP.md) — production deployment guide (systemd, Docker, env vars)
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — what changed and when

## Requirements

- Node.js **20+**
- `git` on PATH
- Whatever your project needs to build (`npm`, `yarn`, `pnpm`)
- Playwright (optional — install with `npm install playwright && npx playwright install chromium` for the screenshot/audit tools)

## Deploy DeployView from a one-click button

Drop this in any README to one-click-install your repo into someone else's DV:

```markdown
[![Deploy with DV](https://YOUR-DV.example.com/badge/owner/repo/main)](https://YOUR-DV.example.com/deploy?repo=https://github.com/owner/repo)
```

## License

MIT
