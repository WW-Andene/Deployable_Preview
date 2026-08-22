// browser/state.js – emulation, storage, clipboard, and canvas data helpers
const session = require("../dv/session");

/**
 * Apply environment emulation to a persistent preview session.
 * Resets are sticky for that session (cleared on session reset / close).
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   deviceScaleFactor?, colorScheme?, reducedMotion?, touch?, geolocation?,
 *   offline?, downloadThroughput?, uploadThroughput?, latency?, userAgent?
 * }
 */
async function emulate(opts) {
  const { owner, repo, slug } = opts;
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const applied = {};

  // devicePixelRatio / deviceScaleFactor
  if (opts.deviceScaleFactor != null) {
    const dpr = Math.max(0.5, Math.min(Number(opts.deviceScaleFactor), 4));
    if (typeof page.setViewport === "function") {
      // Puppeteer
      const vp = session.getViewport(page) || { width: 1280, height: 720 };
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: dpr });
      applied.deviceScaleFactor = dpr;
    } else {
      // Playwright can't change DPR after context creation — emulate via CDP
      try {
        const client = await page.createCDPSession();
        const vp = session.getViewport(page) || { width: 1280, height: 720 };
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: vp.width, height: vp.height, deviceScaleFactor: dpr, mobile: false
        });
        applied.deviceScaleFactor = dpr;
        await client.detach().catch(() => {});
      } catch (e) {
        applied.deviceScaleFactorError = e.message;
      }
    }
  }

  // Color scheme (dark / light / no-preference)
  if (opts.colorScheme) {
    try {
      if (typeof page.emulateMediaFeatures === "function") {
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: opts.colorScheme }]);
      } else if (typeof page.emulateMedia === "function") {
        await page.emulateMedia({ colorScheme: opts.colorScheme });
      }
      applied.colorScheme = opts.colorScheme;
    } catch (e) {
      applied.colorSchemeError = e.message;
    }
  }

  // Reduced motion
  if (opts.reducedMotion) {
    try {
      if (typeof page.emulateMediaFeatures === "function") {
        await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: opts.reducedMotion }]);
      } else if (typeof page.emulateMedia === "function") {
        await page.emulateMedia({ reducedMotion: opts.reducedMotion });
      }
      applied.reducedMotion = opts.reducedMotion;
    } catch (e) {
      applied.reducedMotionError = e.message;
    }
  }

  // Touch
  if (opts.touch != null) {
    try {
      if (typeof page.setViewport === "function") {
        const vp = session.getViewport(page) || { width: 1280, height: 720 };
        await page.setViewport({ ...vp, hasTouch: !!opts.touch, isMobile: !!opts.touch });
      }
      applied.touch = !!opts.touch;
    } catch (e) {
      applied.touchError = e.message;
    }
  }

  // Geolocation (Puppeteer: page.setGeolocation; Playwright: context.setGeolocation)
  if (opts.geolocation && typeof opts.geolocation === "object") {
    try {
      const geo = {
        latitude:  Number(opts.geolocation.latitude),
        longitude: Number(opts.geolocation.longitude),
        accuracy:  Number(opts.geolocation.accuracy) || 50
      };
      if (typeof page.setGeolocation === "function") {
        await page.setGeolocation(geo);
      } else if (page.context && typeof page.context === "function") {
        const ctx = page.context();
        if (ctx && typeof ctx.setGeolocation === "function") {
          await ctx.setGeolocation(geo);
          await ctx.grantPermissions(["geolocation"]).catch(() => {});
        }
      }
      applied.geolocation = geo;
    } catch (e) {
      applied.geolocationError = e.message;
    }
  }

  // Network throttling / offline mode (via CDP)
  if (opts.offline != null || opts.downloadThroughput != null || opts.latency != null) {
    try {
      const client = typeof page.createCDPSession === "function"
        ? await page.createCDPSession()
        : null;
      if (client) {
        await client.send("Network.enable");
        await client.send("Network.emulateNetworkConditions", {
          offline: !!opts.offline,
          latency: opts.latency != null ? Number(opts.latency) : 0,
          downloadThroughput: opts.downloadThroughput != null ? Number(opts.downloadThroughput) : -1,
          uploadThroughput:   opts.uploadThroughput   != null ? Number(opts.uploadThroughput)   : -1
        });
        applied.network = {
          offline: !!opts.offline,
          latency: opts.latency != null ? Number(opts.latency) : 0,
          downloadThroughput: opts.downloadThroughput != null ? Number(opts.downloadThroughput) : -1,
          uploadThroughput: opts.uploadThroughput != null ? Number(opts.uploadThroughput) : -1
        };
        await client.detach().catch(() => {});
      }
    } catch (e) {
      applied.networkError = e.message;
    }
  }

  // Custom User-Agent
  if (opts.userAgent) {
    try {
      if (typeof page.setUserAgent === "function") {
        await page.setUserAgent(opts.userAgent);
      } else if (typeof page.setExtraHTTPHeaders === "function") {
        await page.setExtraHTTPHeaders({ "User-Agent": opts.userAgent });
      }
      applied.userAgent = opts.userAgent;
    } catch (e) {
      applied.userAgentError = e.message;
    }
  }

  return { applied, url };
}

/**
 * Read or write cookies, localStorage, or sessionStorage on a preview session.
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   store: "cookies" | "localStorage" | "sessionStorage",
 *   op: "get" | "set" | "delete" | "list" | "clear",
 *   key?, value?, cookie?: { name, value, domain?, path?, expires? }
 * }
 */
async function storage(opts) {
  const { owner, repo, slug } = opts;
  const store = opts.store || "localStorage";
  const op = opts.op || "list";

  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  if (store === "cookies") {
    if (op === "list" || op === "get") {
      let cookies = [];
      try {
        if (typeof page.cookies === "function") {
          cookies = await page.cookies();
        } else if (page.context && typeof page.context === "function") {
          cookies = await page.context().cookies();
        }
      } catch (e) { return { error: "cookies read failed: " + e.message, url }; }
      if (op === "get" && opts.key) {
        return { cookie: cookies.find((c) => c.name === opts.key) || null, url };
      }
      return { cookies, url };
    }
    if (op === "set") {
      const c = opts.cookie || { name: opts.key, value: opts.value };
      if (!c.name) return { error: "cookie name required", url };
      try {
        if (typeof page.setCookie === "function") {
          await page.setCookie(c);
        } else if (page.context && typeof page.context === "function") {
          await page.context().addCookies([{
            name: c.name, value: String(c.value || ""),
            domain: c.domain, path: c.path || "/",
            expires: c.expires, url: (!c.domain ? url : undefined)
          }]);
        }
      } catch (e) { return { error: "cookie set failed: " + e.message, url }; }
      return { set: c.name, url };
    }
    if (op === "delete") {
      try {
        if (typeof page.deleteCookie === "function") {
          await page.deleteCookie({ name: opts.key });
        } else if (page.context && typeof page.context === "function") {
          const ctx = page.context();
          const cookies = await ctx.cookies();
          await ctx.clearCookies();
          // Re-add everything except the deleted one
          const keep = cookies.filter((c) => c.name !== opts.key);
          if (keep.length) await ctx.addCookies(keep);
        }
      } catch (e) { return { error: "cookie delete failed: " + e.message, url }; }
      return { deleted: opts.key, url };
    }
    if (op === "clear") {
      try {
        if (page.context && typeof page.context === "function") {
          await page.context().clearCookies();
        } else if (typeof page.deleteCookie === "function") {
          const cookies = await page.cookies();
          for (const c of cookies) await page.deleteCookie({ name: c.name });
        }
      } catch (e) { return { error: "cookie clear failed: " + e.message, url }; }
      return { cleared: true, url };
    }
  }

  // localStorage / sessionStorage via page.evaluate
  if (store === "localStorage" || store === "sessionStorage") {
    const result = await page.evaluate((args) => {
      const s = args.store === "sessionStorage" ? window.sessionStorage : window.localStorage;
      switch (args.op) {
        case "list": {
          const out = {};
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            out[k] = s.getItem(k);
          }
          return { items: out, count: s.length };
        }
        case "get":
          return { key: args.key, value: s.getItem(args.key) };
        case "set":
          s.setItem(args.key, args.value == null ? "" : String(args.value));
          return { set: args.key };
        case "delete":
          s.removeItem(args.key);
          return { deleted: args.key };
        case "clear":
          s.clear();
          return { cleared: true };
        default:
          return { error: "unknown op: " + args.op };
      }
    }, { store, op, key: opts.key, value: opts.value });
    return { store, ...result, url };
  }

  return { error: "unknown store: " + store };
}

/**
 * Read or write the system clipboard inside a preview session. Grants
 * clipboard permissions on the browser context first so navigator.clipboard
 * calls succeed without a user gesture.
 *
 * @param {object} opts - { owner, repo, slug, op: "read" | "write", value? }
 */
async function clipboard(opts) {
  const { owner, repo, slug } = opts;
  const op = opts.op || "read";
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  // Try to grant clipboard permissions. Silently ignore if the API isn't there.
  try {
    const origin = new URL(url).origin;
    if (page.context && typeof page.context === "function") {
      const ctx = page.context();
      if (ctx && typeof ctx.grantPermissions === "function") {
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin }).catch(() => {});
      }
    } else if (browser.defaultBrowserContext) {
      const bctx = browser.defaultBrowserContext();
      if (bctx && typeof bctx.overridePermissions === "function") {
        await bctx.overridePermissions(origin, ["clipboard-read", "clipboard-write"]).catch(() => {});
      }
    }
  } catch (_) {}

  if (op === "read") {
    try {
      const text = await page.evaluate(async () => {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          return { __error: "navigator.clipboard.readText unavailable" };
        }
        try { return await navigator.clipboard.readText(); }
        catch (e) { return { __error: e.message }; }
      });
      if (text && typeof text === "object" && text.__error) {
        return { error: text.__error, url };
      }
      return { text, url };
    } catch (e) {
      return { error: "clipboard read failed: " + e.message, url };
    }
  }

  if (op === "write") {
    const value = opts.value != null ? String(opts.value) : "";
    try {
      const out = await page.evaluate(async (v) => {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          return { __error: "navigator.clipboard.writeText unavailable" };
        }
        try { await navigator.clipboard.writeText(v); return { ok: true }; }
        catch (e) { return { __error: e.message }; }
      }, value);
      if (out && out.__error) return { error: out.__error, url };
      return { wrote: value.length + " chars", url };
    } catch (e) {
      return { error: "clipboard write failed: " + e.message, url };
    }
  }

  return { error: "unknown op: " + op };
}

/**
 * Extract pixel data from a <canvas> element. Can return either the full
 * canvas as a base64 PNG (dataUrl=true) or an ImageData region as raw
 * RGBA bytes. Useful for verifying WebGL / 2D canvas output without
 * screenshotting the whole page.
 */
async function canvasData(opts) {
  const { owner, repo, slug, selector } = opts;
  if (!selector) return { error: "selector required (must point to a <canvas>)" };
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug);

  const result = await page.evaluate((args) => {
    const el = document.querySelector(args.sel);
    if (!el) return { __error: "canvas not found" };
    if (el.tagName !== "CANVAS") return { __error: "not a <canvas> element: " + el.tagName };
    const canvas = el;
    const canvasWidth  = canvas.width;
    const canvasHeight = canvas.height;

    if (args.dataUrl) {
      try {
        return { width: canvasWidth, height: canvasHeight, dataUrl: canvas.toDataURL("image/png") };
      } catch (e) {
        return { __error: "toDataURL failed: " + e.message + " (canvas may be tainted)" };
      }
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // WebGL canvas — fall back to dataUrl
      try {
        return {
          width: canvasWidth, height: canvasHeight,
          dataUrl: canvas.toDataURL("image/png"),
          note: "WebGL canvas — returning dataUrl (no 2D context for getImageData)"
        };
      } catch (e) {
        return { __error: "WebGL canvas read failed: " + e.message };
      }
    }

    const sx = Number.isFinite(args.x) ? args.x : 0;
    const sy = Number.isFinite(args.y) ? args.y : 0;
    const sw = Number.isFinite(args.w) && args.w > 0 ? args.w : canvasWidth - sx;
    const sh = Number.isFinite(args.h) && args.h > 0 ? args.h : canvasHeight - sy;

    try {
      const img = ctx.getImageData(sx, sy, sw, sh);
      const bytes = new Uint8Array(img.data.buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return {
        width: sw, height: sh,
        canvasWidth, canvasHeight,
        region: { x: sx, y: sy, width: sw, height: sh },
        base64: btoa(bin)
      };
    } catch (e) {
      return { __error: "getImageData failed: " + e.message };
    }
  }, { sel: selector, x: opts.x, y: opts.y, w: opts.width, h: opts.height, dataUrl: !!opts.dataUrl });

  if (result && result.__error) return { error: result.__error, url };
  return { ...result, url };
}

module.exports = { emulate, storage, clipboard, canvasData };
