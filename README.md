# DeployView ⚡

Build, serve, and preview your app from GitHub — replaces Vercel, Netlify, and Screenfly.

## What it does

1. You connect your GitHub repo
2. You pick branches to monitor
3. DeployView **clones, installs, and builds** each branch
4. Serves the built output
5. Shows interactive 16:9 and 9:16 previews
6. Polls GitHub every 5s — auto-rebuilds on new commits
7. **MCP Server** — lets AI assistants (Claude) see and interact with your deployed apps

## Setup

```bash
# Clone this repo
git clone https://github.com/WW-Andene/Deployable_Preview.git
cd Deployable_Preview

# Install
npm install

# Optional: install Puppeteer for MCP screenshot/interaction features
npm install puppeteer

# Run
npm start

cd ~/Deployable_Preview && node server/index.js
```

Open **http://localhost:3000** in your browser.

## Requirements

- Node.js 18+
- Git installed
- The build tools your project needs (npm, yarn, pnpm)
- Puppeteer (optional, for MCP screenshot and interaction tools)

## How it works

- **Dashboard** → Add repos, see build status per branch
- **Build** → Clones the repo, runs `npm install` + your build command
- **Serve** → Built output served at `/preview/{owner}/{repo}/{branch}/`
- **Preview** → Interactive iframes in 16:9 and 9:16, compare branches side by side
- **Auto-rebuild** → Polls GitHub for new commits, rebuilds automatically
- **MCP Server** → AI assistants can screenshot, inspect, and interact with previews

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
interface can connect directly.

1. Start DeployView and make it reachable from the internet (e.g. via a tunnel
   or by deploying to a server):

   ```bash
   npm start          # listens on http://localhost:3000
   ```

2. In **claude.ai → Settings → Integrations**, add a new MCP server with the
   URL of your DeployView instance:

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

# HTTP server only (MCP tools still available via HTTP API)
npm start
```

### MCP HTTP API

When the HTTP server is running, MCP tools are also available via REST:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/tools` | GET | List available MCP tools |
| `/api/mcp/call` | POST | Invoke any tool: `{ tool, args }` |
| `/api/mcp/screenshot/:owner/:repo/:slug` | GET | Take a screenshot |
| `/api/mcp/inspect/:owner/:repo/:slug` | GET | Inspect DOM / a11y tree |
| `/api/mcp/console/:owner/:repo/:slug` | GET | Capture console logs |
| `/api/mcp/interact/:owner/:repo/:slug` | POST | Click, type, scroll, etc. |
| `/api/mcp/previews` | GET | List active previews |

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

## Config

When adding a repo you set:
- **Build command**: defaults to `npm run build` (change to `npx expo export:web`, `yarn build`, etc.)
- **Output directory**: defaults to `dist` (auto-detects `build`, `out`, `web-build` if wrong)

Config saved to `deployview.json` in the project root.
