/**
 * dv/helpers.js — pure page/frame/coordinate helpers.
 *
 * No browser-instance state, no session pool — just utilities that
 * operate on a Playwright/Puppeteer page or frame and are reused by
 * interact/measure/screenshot tools.
 *
 * Extracted from dv/session.js (R6.5).
 */

"use strict";

// ── Asset categories (used by browseUrl / network tools) ────────────────────

const ASSET_CATEGORIES = {
  document:    "documents",
  stylesheet:  "stylesheets",
  script:      "scripts",
  image:       "images",
  media:       "media",
  font:        "fonts",
  xhr:         "xhr",
  fetch:       "xhr",
  websocket:   "websockets",
  manifest:    "other",
  texttrack:   "media",
  eventsource: "other",
  other:       "other"
};

function categorizeResourceType(t) {
  return ASSET_CATEGORIES[t] || "other";
}

// ── Frame & coordinate helpers ──────────────────────────────────────────────

/**
 * Resolve an iframe target from a frame descriptor. Accepts a CSS selector
 * pointing to an <iframe> element, a URL substring, or a frame name.
 * Returns the frame-like target (has .click / .type / .evaluate).
 */
async function resolveFrame(page, frameDesc) {
  if (!frameDesc) return page;

  // 1. Try as a CSS selector (iframe element)
  try {
    const el = await page.$(frameDesc);
    if (el && typeof el.contentFrame === "function") {
      const frame = await el.contentFrame();
      if (frame) return frame;
    }
  } catch (_) {}

  // 2. Try matching frames() by URL substring or name
  if (typeof page.frames === "function") {
    const frames = page.frames();
    for (const f of frames) {
      try {
        if (typeof page.mainFrame === "function" && f === page.mainFrame()) continue;
      } catch (_) {}
      let fUrl = "";
      let fName = "";
      try { fUrl  = typeof f.url === "function" ? f.url() : ""; } catch (_) {}
      try { fName = typeof f.name === "function" ? f.name() : ""; } catch (_) {}
      if ((fUrl && fUrl.includes(frameDesc)) || (fName && fName === frameDesc)) {
        return f;
      }
    }
  }

  throw new Error("iframe not found: " + frameDesc);
}

/**
 * Resolve a point on the page from either a selector (center of bounding box)
 * or explicit {x, y} coordinates. Used by drag/swipe/tap/long_press.
 */
async function resolvePoint(page, { selector, x, y }) {
  if (selector) {
    const el = await page.$(selector);
    if (!el) throw new Error("Element not found: " + selector);
    let box = null;
    if (typeof el.boundingBox === "function") {
      box = await el.boundingBox();
    }
    if (!box) {
      box = await page.evaluate((sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, selector);
    }
    if (!box) throw new Error("Could not compute bounding box for: " + selector);
    return [box.x + box.width / 2, box.y + box.height / 2];
  }
  if (x != null && y != null) return [Number(x), Number(y)];
  throw new Error("Either selector or {x,y} required");
}

// ── Touch simulation ────────────────────────────────────────────────────────

/**
 * Simulate a touch tap via the CDP touchscreen (Puppeteer/Playwright both expose it).
 * Falls back to a mouse click if touch isn't available.
 */
async function simulateTouchTap(page, x, y) {
  if (page.touchscreen && typeof page.touchscreen.tap === "function") {
    try { await page.touchscreen.tap(x, y); return; } catch (_) {}
  }
  await page.mouse.click(x, y);
}

/**
 * Simulate a touch swipe. Uses CDP touchscreen if available.
 */
async function simulateTouchSwipe(page, sx, sy, ex, ey, steps) {
  const client = (typeof page.createCDPSession === "function")
    ? await page.createCDPSession().catch(() => null)
    : (page._client && typeof page._client === "function" ? page._client() : null);
  if (client) {
    try {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t }]
        });
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      if (typeof client.detach === "function") await client.detach().catch(() => {});
      return;
    } catch (_) {
      if (typeof client.detach === "function") client.detach().catch(() => {});
    }
  }
  // Fallback: mouse drag
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
  }
  await page.mouse.up();
}

/**
 * Simulate a two-finger pinch gesture via CDP touch events. Moves two touch
 * points horizontally centred on (cx, cy) from startDistance to endDistance.
 * Used to trigger pinch-zoom in apps that listen for touch events.
 */
async function simulateTouchPinch(page, cx, cy, startDist, endDist, steps) {
  const getClient = async () => {
    if (typeof page.createCDPSession === "function") {
      try { return await page.createCDPSession(); } catch (_) { return null; }
    }
    if (page._client && typeof page._client === "function") {
      try { return page._client(); } catch (_) { return null; }
    }
    return null;
  };
  const client = await getClient();
  if (!client) return { error: "CDP session unavailable for pinch" };
  try {
    const pointsAt = (dist) => ([
      { x: cx - dist / 2, y: cy, id: 0 },
      { x: cx + dist / 2, y: cy, id: 1 }
    ]);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pointsAt(startDist) });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const dist = startDist + (endDist - startDist) * t;
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pointsAt(dist) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (typeof client.detach === "function") await client.detach().catch(() => {});
    return { ok: true };
  } catch (e) {
    if (typeof client.detach === "function") client.detach().catch(() => {});
    return { error: e.message };
  }
}

module.exports = {
  ASSET_CATEGORIES,
  categorizeResourceType,
  resolveFrame,
  resolvePoint,
  simulateTouchTap,
  simulateTouchSwipe,
  simulateTouchPinch
};
