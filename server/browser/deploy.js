// browser/deploy.js – list previews, run tests, deploy-and-verify
const session = require("../dv/session");
const { buildStatus, branchSlug, deployBranch } = require("../build");
const { runningServers } = require("../process");
const { getConfig } = require("../config");
const screenshot = require("./screenshot");

// ── List deployed previews ───────────────────────────────────────────────────

function listPreviews() {
  const previews = [];
  for (const key in buildStatus) {
    const st = buildStatus[key];
    if (st.status === "ready" || st.status === "running") {
      const [ownerRepo, slug] = key.split(":");
      const [owner, repo] = ownerRepo.split("/");
      const srv = runningServers[key];
      previews.push({
        key,
        owner,
        repo,
        slug,
        status: st.status,
        mode: st.mode || "static",
        serverPort: srv ? srv.port : null,
        previewUrl: "/preview/" + owner + "/" + repo + "/" + slug + "/",
        lastBuild: st.lastBuild,
        commitSha: st.commitSha
      });
    }
  }
  return previews;
}

// ── Run Test Harness ─────────────────────────────────────────────────────────

/**
 * Load the test harness page and run the full or quick test suite.
 * Waits for completion and returns structured results.
 * @param {object} opts - { owner, repo, slug, mode }
 * mode: "full" (default) | "quick"
 */
async function runTest(opts) {
  const { owner, repo, slug, mode } = opts;

  if (!session.hasPlaywright()) {
    return { error: "No browser available." };
  }

  // Build the test harness URL
  const safeOwner = (owner || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRepo  = (repo || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeSlug  = (slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeOwner || !safeRepo || !safeSlug) {
    throw new Error("Invalid owner, repo, or slug");
  }

  let baseUrl = "http://127.0.0.1:" + (process.env.PORT || 3000);
  if (session.getRemoteWSEndpoint()) {
    try {
      const tunnelStatus = require("../tunnel").status();
      if (tunnelStatus && tunnelStatus.url) baseUrl = tunnelStatus.url;
      else throw new Error("No tunnel URL for remote browser");
    } catch (e) {
      throw new Error("Remote browser needs tunnel URL: " + e.message);
    }
  }
  const testUrl = baseUrl + "/test/" + safeOwner + "/" + safeRepo + "/" + safeSlug;

  const browser = await session.getBrowser();
  const page = await session.newPage(browser);
  try {
    await session.setViewport(page, 1280, 900);
    console.log("[mcp-browser] Loading test harness: " + testUrl);
    await page.goto(testUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Click the appropriate test button
    const btnText = (mode === "quick") ? "Quick Test" : "Run Full Test";
    await page.evaluate((text) => {
      const btns = [...document.querySelectorAll("button")];
      const btn = btns.find(b => b.textContent.trim() === text);
      if (btn) btn.click();
      else throw new Error("Button '" + text + "' not found");
    }, btnText);

    console.log("[mcp-browser] Test started: " + btnText);

    // Poll for completion (check status element for "Done!" text)
    const maxWaitMs = (mode === "quick") ? 120000 : 300000;
    const pollInterval = 2000;
    let elapsed = 0;
    let done = false;

    while (elapsed < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollInterval));
      elapsed += pollInterval;
      const statusText = await page.evaluate(() => {
        const s = document.getElementById("status");
        return s ? s.textContent : "";
      });
      if (statusText === "Done!") { done = true; break; }
    }

    if (!done) {
      return { error: "Test timed out after " + (maxWaitMs / 1000) + "s" };
    }

    // Extract results
    const results = await page.evaluate(() => {
      const logEl = document.getElementById("log");
      const sumEl = document.getElementById("sum");
      return {
        summary: sumEl ? sumEl.textContent : "",
        passed: sumEl ? sumEl.classList.contains("pass") : false,
        fullLog: logEl ? logEl.textContent : "",
        // Extract stats from stats row
        stats: [...document.querySelectorAll(".stat-box")].map(box => ({
          label: box.querySelector(".lbl")?.textContent || "",
          value: parseInt(box.querySelector(".num")?.textContent || "0")
        }))
      };
    });

    // Take screenshot of the results
    const screenshotBuf = await page.screenshot({ type: "png" });
    results.screenshot = {
      base64: screenshotBuf.toString("base64"),
      mimeType: "image/png"
    };
    results.testUrl = testUrl;
    results.mode = mode || "full";

    return results;
  } finally {
    await page.close();
  }
}

// ── Deploy + verify one-shot ───────────────────────────────────────────────

/**
 * One-call build-and-verify. Triggers a deploy, waits for it to become ready,
 * then returns a screenshot, console capture, and brief page metadata.
 * Replaces the common 5-call flow: trigger_build → build_status (x3) → screenshot.
 *
 * @param {object} opts - { owner, repo, slug, wait?, width?, height?, duration? }
 */
async function deployAndVerify(opts) {
  const { owner, repo, slug } = opts;
  if (!owner || !repo || !slug) return { error: "owner, repo, slug required" };

  const config = getConfig();
  const repoConfig = config.repos.find((r) => r.owner === owner && r.repo === repo);
  if (!repoConfig) return { error: "Repository not found: " + owner + "/" + repo };
  const bc = repoConfig.activeBranches.find((b) => branchSlug(b) === slug);
  if (!bc) return { error: "Branch config not found for slug: " + slug };

  const key = owner + "/" + repo + ":" + slug;
  const startTs = Date.now();

  // Close the existing session so we get a fresh page on the new build
  try { session.closeSession(owner, repo, slug); } catch (_) {}

  // Kick off the deploy
  deployBranch(repoConfig, bc);

  // Wait for ready (or running). Polls buildStatus.
  const waitMs = Math.max(5000, Math.min(Number(opts.wait) || 180000, 600000));
  const pollInterval = 1000;
  let status;
  while (Date.now() - startTs < waitMs) {
    status = buildStatus[key];
    if (status && (status.status === "ready" || status.status === "running")) break;
    if (status && status.status === "failed") break;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  const deployDuration = Date.now() - startTs;

  if (!status || (status.status !== "ready" && status.status !== "running")) {
    return {
      error: "deploy did not become ready within " + (waitMs / 1000) + "s",
      status: status ? status.status : "unknown",
      log: status && status.log ? String(status.log).slice(-4000) : null,
      duration: deployDuration
    };
  }

  // Give the server a moment to settle, then screenshot + capture logs briefly
  await new Promise((r) => setTimeout(r, 800));

  let screenshotResult = null;
  let screenshotError = null;
  try {
    const shot = await screenshot.takeScreenshot({
      owner, repo, slug,
      width: opts.width, height: opts.height,
      fullPage: !!opts.fullPage
    });
    if (shot.error) screenshotError = shot.error;
    else screenshotResult = shot;
  } catch (e) {
    screenshotError = e.message;
  }

  // Capture console for a short duration (default 2s)
  let consoleResult = null;
  try {
    const duration = opts.duration != null ? Number(opts.duration) : 2;
    consoleResult = await screenshot.captureConsole({ owner, repo, slug, duration });
  } catch (e) {
    consoleResult = { error: e.message };
  }

  return {
    key,
    status: status.status,
    commitSha: status.commitSha,
    deployDuration,
    screenshot: screenshotResult,
    screenshotError,
    console: consoleResult,
    previewUrl: "/preview/" + owner + "/" + repo + "/" + slug + "/"
  };
}

module.exports = { listPreviews, runTest, deployAndVerify };
