# DeployView ⚡

Build, serve, and preview your app from GitHub — replaces Vercel, Netlify, and Screenfly.

## What it does

1. You connect your GitHub repo
2. You pick branches to monitor
3. DeployView **clones, installs, and builds** each branch
4. Serves the built output
5. Shows interactive 16:9 and 9:16 previews
6. Polls GitHub every 30s — auto-rebuilds on new commits

## Setup

```bash
# Clone this repo
git clone https://github.com/WW-Andene/Deployable_Preview.git
cd Deployable_Preview

# Install
npm install

# Run
npm start

cd ~/Deployable_Preview && node server/index.js
```

Open **http://localhost:3000** in your browser.

## Requirements

- Node.js 18+
- Git installed
- The build tools your project needs (npm, yarn, pnpm)

## How it works

- **Dashboard** → Add repos, see build status per branch
- **Build** → Clones the repo, runs `npm install` + your build command
- **Serve** → Built output served at `/preview/{owner}/{repo}/{branch}/`
- **Preview** → Interactive iframes in 16:9 and 9:16, compare branches side by side
- **Auto-rebuild** → Polls GitHub for new commits, rebuilds automatically

## Config

When adding a repo you set:
- **Build command**: defaults to `npm run build` (change to `npx expo export:web`, `yarn build`, etc.)
- **Output directory**: defaults to `dist` (auto-detects `build`, `out`, `web-build` if wrong)

Config saved to `deployview.json` in the project root.
