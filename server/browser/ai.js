const session = require("../dv/session");
const groq = require("../mcp-groq");
const { interact } = require("./interact");

/**
 * Take a screenshot of a preview and ask Groq a natural-language question
 * about it. Claude gets the text answer — no pixels in its context.
 */
async function visualQuery(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  const result = await groq.visualQuery({
    pngBase64: buf.toString("base64"),
    question: opts.question,
    model: opts.model,
    maxTokens: opts.maxTokens
  });
  return { ...result, url };
}

/**
 * Use Groq to find an element visually (no CSS selector required) and
 * return its bounding box and a confidence score.
 */
async function findElementVisually(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const buf = await page.screenshot({ type: "png" });
  const result = await groq.findElement({
    pngBase64: buf.toString("base64"),
    description: opts.description,
    model: opts.model
  });
  return { ...result, url };
}

/**
 * Take two screenshots around an action and ask Groq to describe what changed.
 * Useful for "did my change break anything" checks.
 *
 * @param {object} opts - { owner, repo, slug, action?: { ...interactOpts }, waitMs? }
 */
async function visualDiffWithAction(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const beforeBuf = await page.screenshot({ type: "png" });

  if (opts.action) {
    try {
      await interact({ owner: opts.owner, repo: opts.repo, slug: opts.slug, ...opts.action });
    } catch (e) {
      return { error: "action failed: " + e.message, url };
    }
  }
  if (opts.waitMs) await new Promise((r) => setTimeout(r, Math.min(Number(opts.waitMs) || 0, 30000)));

  const afterBuf = await page.screenshot({ type: "png" });

  const result = await groq.visualDiff({
    beforeBase64: beforeBuf.toString("base64"),
    afterBase64:  afterBuf.toString("base64"),
    model: opts.model
  });
  return { ...result, url };
}

/**
 * Verify loop: run an action, take a screenshot, ask Groq whether the
 * success condition is met, repeat until pass or maxAttempts. Returns a
 * text summary so Claude doesn't see the intermediate pixels.
 */
async function runVerifyLoop(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!groq.isClaudeGroqAuthorized()) return { error: "Groq access not authorized (GROQ_API_KEY missing or claudeGroqAccess=false)" };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const actAndCapture = async (attempt) => {
    // Optional per-attempt evaluate step so the page advances
    if (opts.evaluate) {
      try {
        const code = typeof opts.evaluate === "string"
          ? opts.evaluate
          : (typeof opts.evaluate === "function" ? opts.evaluate(attempt) : null);
        if (code) {
          await page.evaluate("(async () => { " + code + " })()");
        }
      } catch (e) {
        return { pngBase64: null, note: "evaluate threw: " + e.message };
      }
    }
    // Optional structured interact action
    if (opts.action) {
      try {
        await interact({ owner: opts.owner, repo: opts.repo, slug: opts.slug, ...opts.action });
      } catch (e) {
        return { pngBase64: null, note: "action threw: " + e.message };
      }
    }
    await new Promise((r) => setTimeout(r, Math.min(Number(opts.settleMs) || 300, 5000)));
    const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
    return { pngBase64: buf.toString("base64"), note: "attempt " + (attempt + 1) };
  };

  const result = await groq.verifyLoop({
    condition: opts.condition,
    actAndCapture,
    maxAttempts: opts.maxAttempts,
    delayMs: opts.delayMs,
    model: opts.model
  });
  // Don't return the final screenshot bytes back to Claude unless asked
  if (!opts.returnScreenshot && result.finalScreenshot) {
    delete result.finalScreenshot;
  }
  return { ...result, url };
}

module.exports = { visualQuery, findElementVisually, visualDiffWithAction, runVerifyLoop };
