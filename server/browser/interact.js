const session = require("../dv/session");
const fs = require("fs");
const path = require("path");

// ── Click / Interact ─────────────────────────────────────────────────────────

/**
 * Perform an action on a deployed preview.
 * @param {object} opts - { owner, repo, slug, action, selector, value, x, y, ... }
 * action: "click" | "type" | "select" | "scroll" | "hover" | "navigate" |
 *         "evaluate" | "drag" | "file_upload" | "back" | "forward" | "reload" |
 *         "key" | "tap" | "swipe" | "long_press" | "toggle" | "dialog"
 * @returns {{ success: boolean, screenshot?: string }}
 */
async function interact(opts) {
  const { owner, repo, slug, action, selector, value, x, y, width, height } = opts;

  if (!session.hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, width, height);

  // Resolve iframe target if requested. Selector-based actions (click/type/
  // select/hover/evaluate/toggle) operate on `target`. Coordinate-based
  // actions (mouse, keyboard, tap, swipe, drag) stay on `page`.
  const target = opts.frame ? await session.resolveFrame(page, opts.frame) : page;

  let result = { success: true, action, url };
  if (opts.frame) result.frame = opts.frame;

  switch (action) {
    case "click":
      if (selector) {
        await target.click(selector);
      } else if (x !== undefined && y !== undefined) {
        await page.mouse.click(x, y);
      }
      result.clicked = selector || (x + "," + y);
      break;

    case "drag": {
      const [sx, sy] = await session.resolvePoint(page, { selector: opts.selector || opts.fromSelector, x: opts.fromX, y: opts.fromY });
      const [ex, ey] = await session.resolvePoint(page, { selector: opts.toSelector, x: opts.toX, y: opts.toY });
      const steps = Math.max(1, Math.min(parseInt(opts.steps, 10) || 20, 200));
      const stepDelay = Math.max(0, Math.min(parseInt(opts.stepDelay, 10) || 8, 100));
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
        if (stepDelay) await new Promise((r) => setTimeout(r, stepDelay));
      }
      await page.mouse.up();
      result.draggedFrom = { x: sx, y: sy };
      result.draggedTo = { x: ex, y: ey };
      break;
    }

    case "file_upload": {
      if (!selector) throw new Error("selector required for file_upload action");
      const files = Array.isArray(opts.files) ? opts.files : [];
      if (!files.length) throw new Error("files array required for file_upload action");
      const el = await page.$(selector);
      if (!el) throw new Error("file input not found: " + selector);

      if (typeof el.setInputFiles === "function") {
        // Playwright
        const payload = files.map((f) => ({
          name: f.name || "upload.bin",
          mimeType: f.mimeType || "application/octet-stream",
          buffer: Buffer.from(f.base64 || "", "base64")
        }));
        await el.setInputFiles(payload);
      } else if (typeof el.uploadFile === "function") {
        // Puppeteer — needs filesystem paths
        const os = require("os");
        const crypto = require("crypto");
        const tmpPaths = [];
        for (const f of files) {
          const base = (f.name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
          const tmp = path.join(os.tmpdir(), "dv-upload-" + crypto.randomBytes(6).toString("hex") + "-" + base);
          fs.writeFileSync(tmp, Buffer.from(f.base64 || "", "base64"));
          tmpPaths.push(tmp);
        }
        await el.uploadFile(...tmpPaths);
        // Cleanup after a short delay so the page has time to read them
        setTimeout(() => { for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch (_) {} } }, 15000);
      } else {
        throw new Error("File upload not supported by this browser driver");
      }
      result.uploaded = files.map((f) => f.name || "upload.bin");
      result.into = selector;
      break;
    }

    case "back":
      if (typeof page.goBack === "function") {
        await page.goBack({ waitUntil: session.waitUntilIdle(), timeout: 30000 }).catch(() => {});
      }
      result.navigated = "back";
      break;

    case "forward":
      if (typeof page.goForward === "function") {
        await page.goForward({ waitUntil: session.waitUntilIdle(), timeout: 30000 }).catch(() => {});
      }
      result.navigated = "forward";
      break;

    case "reload":
      if (typeof page.reload === "function") {
        await page.reload({ waitUntil: session.waitUntilIdle(), timeout: 30000 });
      }
      result.reloaded = true;
      break;

    case "key": {
      if (!value) throw new Error("value required for key action (e.g. 'Enter', 'Escape', 'Tab')");
      if (selector) {
        try { await page.focus(selector); } catch (_) {}
      }
      if (page.keyboard && typeof page.keyboard.press === "function") {
        await page.keyboard.press(value);
      }
      result.keyPressed = value;
      if (selector) result.focused = selector;
      break;
    }

    case "tap": {
      const [tx, ty] = await session.resolvePoint(page, { selector, x, y });
      if (typeof page.tap === "function" && selector) {
        try { await page.tap(selector); break; } catch (_) { /* fall through */ }
      }
      // Emulate a touch tap via CDP touch events if available, otherwise click
      await session.simulateTouchTap(page, tx, ty);
      result.tappedAt = { x: tx, y: ty };
      break;
    }

    case "swipe": {
      const [sx, sy] = await session.resolvePoint(page, { selector: opts.fromSelector, x: opts.fromX, y: opts.fromY });
      const [ex, ey] = await session.resolvePoint(page, { selector: opts.toSelector, x: opts.toX, y: opts.toY });
      const steps = Math.max(2, Math.min(parseInt(opts.steps, 10) || 20, 200));
      await session.simulateTouchSwipe(page, sx, sy, ex, ey, steps);
      result.swipedFrom = { x: sx, y: sy };
      result.swipedTo = { x: ex, y: ey };
      break;
    }

    case "long_press": {
      const [px, py] = await session.resolvePoint(page, { selector, x, y });
      const duration = Math.max(100, Math.min(parseInt(value, 10) || 800, 10000));
      await page.mouse.move(px, py);
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, duration));
      await page.mouse.up();
      result.longPressedAt = { x: px, y: py };
      result.holdMs = duration;
      break;
    }

    case "toggle": {
      if (!selector) throw new Error("selector required for toggle action");
      // Toggles display:none on the matching element(s). Useful for A/B visual comparison.
      const mode = value || "toggle"; // "hide" | "show" | "toggle"
      const state = await page.evaluate((args) => {
        const els = Array.from(document.querySelectorAll(args.sel));
        if (!els.length) return { count: 0, visible: null };
        let nowVisible;
        for (const el of els) {
          const currentlyHidden = el.style.display === "none" || getComputedStyle(el).display === "none";
          if (args.mode === "hide") {
            el.dataset.__dvPrevDisplay = el.dataset.__dvPrevDisplay || el.style.display || "";
            el.style.display = "none";
            nowVisible = false;
          } else if (args.mode === "show") {
            el.style.display = el.dataset.__dvPrevDisplay != null ? el.dataset.__dvPrevDisplay : "";
            nowVisible = true;
          } else {
            if (currentlyHidden) {
              el.style.display = el.dataset.__dvPrevDisplay != null ? el.dataset.__dvPrevDisplay : "";
              nowVisible = true;
            } else {
              el.dataset.__dvPrevDisplay = el.dataset.__dvPrevDisplay || el.style.display || "";
              el.style.display = "none";
              nowVisible = false;
            }
          }
        }
        return { count: els.length, visible: nowVisible };
      }, { sel: selector, mode });
      result.toggled = selector;
      result.count = state.count;
      result.nowVisible = state.visible;
      if (!state.count) throw new Error("toggle: no elements match " + selector);
      break;
    }

    case "dialog": {
      // Install a one-shot handler for the next dialog (alert / confirm / prompt / beforeunload)
      if (typeof page.once !== "function") {
        result.warning = "Dialog handling not supported by this browser driver";
        break;
      }
      const accept = opts.accept !== false;
      const promptText = typeof value === "string" ? value : undefined;
      page.once("dialog", async (dialog) => {
        try {
          if (accept) {
            if (promptText != null && typeof dialog.accept === "function") {
              await dialog.accept(promptText);
            } else {
              await dialog.accept();
            }
          } else {
            await dialog.dismiss();
          }
        } catch (_) {}
      });
      result.dialogHandlerInstalled = true;
      result.accept = accept;
      if (promptText != null) result.promptText = promptText;
      break;
    }

    case "type":
      if (!selector) throw new Error("selector required for type action");
      await target.click(selector);
      if (typeof target.fill === "function") {
        await target.fill(selector, value || "");
      } else {
        await target.evaluate(function(sel) { document.querySelector(sel).value = ""; }, selector);
        await target.type(selector, value || "");
      }
      result.typed = value;
      result.into = selector;
      break;

    case "select":
      if (!selector) throw new Error("selector required for select action");
      if (typeof target.selectOption === "function") {
        await target.selectOption(selector, value || "");
      } else {
        await target.select(selector, value || "");
      }
      result.selected = value;
      result.from = selector;
      break;

    case "scroll":
      await page.evaluate((scrollY) => {
        window.scrollBy(0, scrollY);
      }, parseInt(value) || 500);
      result.scrolledBy = parseInt(value) || 500;
      break;

    case "hover":
      if (selector) {
        await target.hover(selector);
      } else if (x !== undefined && y !== undefined) {
        await page.mouse.move(x, y);
      }
      result.hoveredOn = selector || (x + "," + y);
      break;

    case "navigate":
      if (value) {
        var navUrl;
        if (value.startsWith("/") && !value.startsWith("//")) {
          navUrl = url.replace(/\/preview\/.*$/, "") + value;
        } else {
          navUrl = url + value;
        }
        try {
          var parsed = new URL(navUrl);
          var baseUrl = new URL(url);
          if (parsed.origin !== baseUrl.origin) {
            throw new Error("Navigation restricted to preview origin only");
          }
        } catch (parseErr) {
          if (parseErr.message.includes("restricted")) throw parseErr;
          throw new Error("Navigation restricted to preview origin only");
        }
        await page.goto(navUrl, { waitUntil: session.waitUntilIdle(), timeout: 30000 });
      }
      result.navigatedTo = value;
      break;

    case "evaluate":
      if (!value) throw new Error("value required for evaluate action (JavaScript code to run)");
      try {
        // Wrap in async IIFE so user code can use await and statements
        var wrappedCode = "(async () => { " + value + " })()";
        var evalResult = await target.evaluate(wrappedCode);
        result.evaluated = true;
        result.returnValue = evalResult !== undefined ? JSON.stringify(evalResult) : undefined;
      } catch (evalErr) {
        result.evaluated = false;
        result.evalError = evalErr.message;
      }
      break;

    case "pinch": {
      // Two-finger pinch gesture. Moves two touch points from startDistance
      // to endDistance along a horizontal axis centred at (cx, cy).
      const [cx, cy] = await session.resolvePoint(page, {
        selector, x: opts.centerX != null ? opts.centerX : x, y: opts.centerY != null ? opts.centerY : y
      });
      const startDist = Math.max(2, Number(opts.startDistance) || 200);
      const endDist   = Math.max(2, Number(opts.endDistance)   || 50);
      const steps     = Math.max(2, Math.min(Number(opts.steps) || 20, 200));
      const out = await session.simulateTouchPinch(page, cx, cy, startDist, endDist, steps);
      result.pinched = { centerX: cx, centerY: cy, startDistance: startDist, endDistance: endDist, steps };
      if (out && out.error) result.warning = out.error;
      break;
    }

    default:
      throw new Error("Unknown action: " + action + ". Supported: click, type, select, scroll, hover, navigate, evaluate");
  }

  // Wait a moment for any animations/updates
  await new Promise((r) => setTimeout(r, 500));

  // Take a screenshot after the action
  const screenshotBuf = await page.screenshot({ type: "png" });
  result.screenshot = {
    base64: screenshotBuf.toString("base64"),
    mimeType: "image/png"
  };
  result.pageTitle = await page.title();
  result.currentUrl = page.url();

  return result;
}

module.exports = { interact };
