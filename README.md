# DeployView ⚡

Build, serve, and preview your app from GitHub — replaces Vercel, Netlify, and Screenfly.

## What it does

1. You connect your GitHub repo
2. You pick branches to monitor
3. DeployView **clones, installs, and builds** each branch
4. Serves the built output (static) or runs your server (server mode)
5. Shows interactive previews across 6 device presets (iPhone, Galaxy S24, iPad, Xiaomi 13T, 16:9, 9:16)
6. Polls GitHub every 5s — auto-rebuilds on new commits
7. **MCP Server** — lets AI assistants (Claude) see and interact with your deployed apps
8. **APK Builder** — build Android APKs via GitHub Actions, no local SDK needed

## Quick Start

```bash
git clone https://github.com/WW-Andene/Deployable_Preview.git
cd Deployable_Preview
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## Requirements

- Node.js 18+
- Git installed
- The build tools your project needs (npm, yarn, pnpm)
- Playwright (optional — for MCP screenshot and interaction tools)

## How it works

| Feature | Description |
|---------|-------------|
| **Dashboard** | Add repos, see build status per branch, trigger rebuilds |
| **Build** | Clones the repo, runs `npm install` + your build command |
| **Serve** | Built output served at `/preview/{owner}/{repo}/{branch}/` |
| **Server Mode** | Runs persistent Node servers with auto-restart on crash (up to 3×) |
| **Preview** | Interactive iframes across 6 device presets, side-by-side compare |
| **Auto-rebuild** | Polls GitHub for new commits and rebuilds automatically |
| **Webhooks** | Push events from GitHub trigger instant rebuilds |
| **Serverless** | Vercel-style `api/` directory scanning for API routes |
| **APK Builder** | Build Android APKs via GitHub Actions cloud runners |
| **Test Harness** | Built-in E2E test runner at `/test/{owner}/{repo}/{branch}` |
| **MCP Server** | AI assistants can screenshot, inspect, and interact with previews |

## MCP Server (Model Context Protocol)

DeployView includes a built-in MCP server that lets AI assistants like Claude interact with your deployed app previews. This enables:

- **Taking Screenshots** — Claude can see your live UI and provide visual feedback
- **DOM Inspection** — Get the accessibility tree, element details, and page metadata
- **Live Interaction** — Click buttons, fill forms, scroll, hover, and navigate
- **Console Log Capture** — Capture JavaScript errors, warnings, and network failures
- **Build Control** — Trigger rebuilds and check build status

### MCP Setup: Claude Desktop

Add to your `claude_desktop_config.json`:

```json
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

### MCP Setup: Claude Web (claude.ai)

DeployView exposes an MCP Streamable HTTP endpoint at `/mcp` so Claude's web
interface can connect directly. Claude web **requires HTTPS**.

**Option A — Built-in HTTPS (recommended for local development):**

Generate a self-signed certificate and start with HTTPS enabled:

```bash
# Generate self-signed cert (one-time)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'

# Start with HTTPS on port 3443
HTTPS_CERT=cert.pem HTTPS_KEY=key.pem npm start
```

Then expose port 3443 via a tunnel so Claude web can reach it:

```bash
# Using cloudflared (recommended — gives you a public HTTPS URL)
cloudflared tunnel --url https://localhost:3443

# Or using ngrok
ngrok http https://localhost:3443
```

**Option B — Reverse proxy / deploy to a server:**

Deploy DeployView to a server with a proper TLS certificate (e.g. via
Let's Encrypt, Caddy, or nginx):

```bash
npm start          # listens on http://localhost:3000
```

Then in **claude.ai → Settings → Integrations**, add a new MCP server with
the public HTTPS URL of your DeployView instance:

```
https://your-server.example.com/mcp
```

Claude will connect over Streamable HTTP and discover all available tools
(screenshots, DOM inspection, interaction, build control, etc.).

### MCP Modes

```bash
# Standalone MCP server (stdio only, for Claude Desktop)
npm run mcp

# HTTP server + MCP stdio combined
npm run start:mcp

# HTTP server only (MCP tools available via HTTP API + Streamable HTTP)
npm start
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_previews` | List all deployed app previews with status and URLs |
| `screenshot` | Take a PNG screenshot of a deployed preview |
| `inspect` | Get accessibility tree, DOM structure, and element details |
| `interact` | Click, type, select, scroll, hover, or navigate in a preview |
| `console_logs` | Capture console output and errors for a duration |
| `build_status` | Get build/server status for a deployment |
| `trigger_build` | Trigger a rebuild or server restart |
| `get_build_log` | Retrieve the full build log |

### MCP HTTP API

When the HTTP server is running, MCP tools are also available via REST:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP Streamable HTTP (for Claude web) |
| `/api/mcp/tools` | GET | List available MCP tools |
| `/api/mcp/call` | POST | Invoke any tool: `{ tool, args }` |
| `/api/mcp/screenshot/:owner/:repo/:slug` | GET | Take a screenshot |
| `/api/mcp/inspect/:owner/:repo/:slug` | GET | Inspect DOM / a11y tree |
| `/api/mcp/console/:owner/:repo/:slug` | GET | Capture console logs |
| `/api/mcp/interact/:owner/:repo/:slug` | POST | Click, type, scroll, etc. |
| `/api/mcp/previews` | GET | List active previews |
| `/api/health` | GET | Health check / uptime |

## Server Modes

### Static Build (default)

For SPAs and static sites (React, Vue, Next.js export, etc.):
- Set **build command** (default: `npm run build`)
- Set **output directory** (default: `dist`, auto-detects `build`, `out`, `web-build`)
- DeployView serves the built files directly

### Running Server

For Express, Fastify, or any Node.js server:
- Set **start command** (default: `npm start`)
- DeployView assigns a random port via `PORT` env var
- Proxies requests to your running server
- Auto-restarts on crash (up to 3 times, 5s delay)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token` | POST/GET | Set/check GitHub token |
| `/api/repos` | GET/POST | List/add repositories |
| `/api/repos/:owner/:repo` | DELETE | Remove repository |
| `/api/repos/:owner/:repo/branch` | POST/PUT/DELETE | Add/edit/remove branch |
| `/api/build/:owner/:repo?slug=...` | POST | Trigger build/restart |
| `/api/stop/:owner/:repo?slug=...` | POST | Stop running server |
| `/api/status/:owner/:repo?slug=...` | GET | Build status |
| `/api/log/:owner/:repo?slug=...` | GET | Build log |
| `/api/logs/stream?key=...` | GET | SSE real-time log stream |
| `/api/webhook` | POST | GitHub push webhook |
| `/api/health` | GET | Server health check |

## Config

When adding a repo you set:
- **Build command**: defaults to `npm run build` (change to `npx expo export:web`, `yarn build`, etc.)
- **Output directory**: defaults to `dist` (auto-detects `build`, `out`, `web-build` if wrong)
- **Base directory**: for monorepos where the app is in a subfolder
- **Environment variables**: `KEY=value` format, one per line
- **Mode**: static build or running server

Config saved to `deployview.json` in the project root (git-ignored).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `git pull` fails with "local changes would be overwritten" | If the conflict is in `package.json` (caused by `npm install` rewriting versions), run `git checkout -- package.json && git pull origin main`. For other files, run `git stash && git pull && git stash pop` to preserve your changes, or `git checkout -- <file>` to discard them |
| Build fails with "npm not found" | Ensure your build tools (npm/yarn/pnpm) are in PATH |
| Server mode times out | Your app must listen on the port from `process.env.PORT` within 60s |
| Playwright not working | Run `npm install playwright` (it's optional) |
| APK build fails | Ensure your GitHub token has the `workflow` scope |
| Preview shows blank page | Check that the output directory is correct (try `build` instead of `dist`) |

## License

MIT
