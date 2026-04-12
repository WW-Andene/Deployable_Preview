const session = require("../dv/session");

/**
 * Parse HTML (page source or remote HTML) with cheerio and return matches.
 */
async function domQueryTool(opts) {
  const enrich = require("../mcp-enrichments");
  if (!opts) return { error: "opts required" };

  let html = opts.html || null;
  let url = null;
  if (!html) {
    if (!session.hasPlaywright()) return { error: "No browser available and no html provided" };
    const browser = await session.getBrowser();
    const sess = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
    html = await sess.page.content();
    url = sess.url;
  }
  if (!opts.selector) return { error: "selector required" };
  const result = enrich.domQuery(html, opts.selector, { limit: opts.limit });
  return { ...result, url };
}

/**
 * Find all elements matching a selector on the live page and return their
 * bounding boxes and a short text preview. Live version of domQuery that
 * returns layout info the parser can't see.
 */
async function findAll(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  if (!opts.selector) return { error: "selector required" };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 500);
  const results = await page.evaluate((args) => {
    const out = [];
    const els = document.querySelectorAll(args.sel);
    for (let i = 0; i < Math.min(els.length, args.limit); i++) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: (el.textContent || "").slice(0, 200).trim(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        visible: !!(r.width && r.height) && s.visibility !== "hidden" && s.display !== "none"
      });
    }
    return { total: els.length, items: out };
  }, { sel: opts.selector, limit });
  return { selector: opts.selector, url, ...results };
}

/**
 * List all service workers active in the current context.
 */
async function listServiceWorkers(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const workers = [];
  if (typeof page.workers === "function") {
    for (const w of page.workers()) {
      try {
        workers.push({ url: typeof w.url === "function" ? w.url() : null });
      } catch (_) {}
    }
  }

  // Ask the page itself for service worker registrations
  const registrations = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return [];
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.map((r) => ({
        scope: r.scope,
        active: r.active ? { scriptURL: r.active.scriptURL, state: r.active.state } : null,
        installing: r.installing ? { scriptURL: r.installing.scriptURL, state: r.installing.state } : null,
        waiting: r.waiting ? { scriptURL: r.waiting.scriptURL, state: r.waiting.state } : null,
        updateViaCache: r.updateViaCache
      }));
    } catch (e) {
      return [{ error: e.message }];
    }
  });

  return { workers, registrations, url };
}

/**
 * Return performance.getEntries() for every loaded resource. Includes
 * TCP / request / response / decoded timings for each URL.
 */
async function getResourceTiming(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const entries = await page.evaluate(() => {
    const items = performance.getEntriesByType ? performance.getEntriesByType("resource") : [];
    return items.map((r) => ({
      name: r.name,
      initiatorType: r.initiatorType,
      duration: Math.round(r.duration),
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
      startTime: Math.round(r.startTime),
      responseEnd: Math.round(r.responseEnd),
      dns: Math.round(r.domainLookupEnd - r.domainLookupStart),
      tcp: Math.round(r.connectEnd - r.connectStart),
      ssl: r.secureConnectionStart ? Math.round(r.connectEnd - r.secureConnectionStart) : 0,
      ttfb: Math.round(r.responseStart - r.requestStart)
    }));
  });
  entries.sort((a, b) => b.duration - a.duration);
  return { url, count: entries.length, slowest: entries.slice(0, 50), all: entries };
}

/**
 * Feature-detect which Web APIs are available on the page.
 */
async function getBrowserApis(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const apis = await page.evaluate(() => {
    const has = (path) => {
      try {
        const parts = path.split(".");
        let cur = window;
        for (const p of parts) { if (!cur || !(p in cur)) return false; cur = cur[p]; }
        return true;
      } catch (_) { return false; }
    };
    const list = [
      "navigator.serviceWorker", "navigator.clipboard", "navigator.share",
      "navigator.geolocation", "navigator.mediaDevices", "navigator.bluetooth",
      "navigator.usb", "navigator.hid", "navigator.serial", "navigator.wakeLock",
      "navigator.storage", "navigator.permissions", "navigator.credentials",
      "navigator.xr", "navigator.gpu",
      "window.WebGLRenderingContext", "window.WebGL2RenderingContext",
      "window.AudioContext", "window.SpeechSynthesis", "window.SpeechRecognition",
      "window.webkitSpeechRecognition", "window.IntersectionObserver",
      "window.ResizeObserver", "window.MutationObserver", "window.PerformanceObserver",
      "window.Worker", "window.SharedWorker", "window.BroadcastChannel",
      "window.indexedDB", "window.caches", "window.crypto", "window.crypto.subtle",
      "window.FileSystemHandle", "window.showOpenFilePicker",
      "window.customElements", "window.Notification",
      "window.BarcodeDetector", "window.EyeDropper"
    ];
    const out = {};
    for (const p of list) out[p] = has(p);
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      online: navigator.onLine,
      maxTouchPoints: navigator.maxTouchPoints,
      features: out
    };
  });
  return { ...apis, url };
}

/**
 * Dump IndexedDB databases and their object stores (keys only).
 */
async function inspectIndexedDB(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const result = await page.evaluate(async () => {
    if (!window.indexedDB || !indexedDB.databases) {
      return { error: "IndexedDB not supported or databases() missing" };
    }
    try {
      const dbs = await indexedDB.databases();
      const out = [];
      for (const info of dbs) {
        const dbInfo = { name: info.name, version: info.version, stores: [] };
        try {
          await new Promise((resolve, reject) => {
            const req = indexedDB.open(info.name);
            req.onsuccess = () => {
              const db = req.result;
              dbInfo.stores = Array.from(db.objectStoreNames || []);
              db.close();
              resolve();
            };
            req.onerror = () => reject(req.error);
          });
        } catch (e) { dbInfo.error = e.message; }
        out.push(dbInfo);
      }
      return { databases: out };
    } catch (e) { return { error: e.message }; }
  });
  return { ...result, url };
}

/**
 * Dump framework state: Next.js __NEXT_DATA__, Nuxt __NUXT__, Sveltekit, etc.
 */
async function getFrameworkData(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const frameworks = await page.evaluate(() => {
    const out = {};
    try {
      const nextScript = document.getElementById("__NEXT_DATA__");
      if (nextScript) out.next = JSON.parse(nextScript.textContent);
    } catch (_) {}
    if (window.__NUXT__) out.nuxt = window.__NUXT__;
    if (window.__NUXT_DATA__) out.nuxtData = window.__NUXT_DATA__;
    if (window.__SVELTEKIT_DATA__) out.sveltekit = window.__SVELTEKIT_DATA__;
    if (window.__remixContext) out.remix = window.__remixContext;
    if (window.__INITIAL_STATE__) out.initialState = window.__INITIAL_STATE__;
    if (window.__REDUX_DEVTOOLS_EXTENSION__) out.hasReduxDevtools = true;
    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) out.hasVueDevtools = true;
    return out;
  });
  return { ...frameworks, url };
}

/**
 * Extract every `[data-*]` attribute on the live page — useful for finding
 * hidden IDs, config blocks, and analytics targets.
 */
async function getDataAttrs(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const attrs = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll("*");
    for (const el of els) {
      if (!el.attributes) continue;
      const data = {};
      let has = false;
      for (const a of el.attributes) {
        if (a.name.startsWith("data-")) { data[a.name] = a.value; has = true; }
      }
      if (has) {
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          data
        });
        if (out.length >= 500) break;
      }
    }
    return out;
  });
  return { url, count: attrs.length, items: attrs };
}

/**
 * Collect every meta tag, Open Graph / Twitter card, canonical URL, and
 * JSON-LD structured-data block on the page.
 */
async function getMeta(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const info = await page.evaluate(() => {
    const meta = {};
    const og = {};
    const twitter = {};
    for (const m of document.querySelectorAll("meta")) {
      const name = m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("itemprop");
      if (!name) continue;
      const value = m.getAttribute("content") || "";
      if (name.startsWith("og:")) og[name] = value;
      else if (name.startsWith("twitter:")) twitter[name] = value;
      else meta[name] = value;
    }
    const canonical = document.querySelector("link[rel=canonical]");
    const title = document.title;
    const jsonLd = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { jsonLd.push(JSON.parse(s.textContent)); }
      catch (_) { jsonLd.push({ __parseError: true, raw: (s.textContent || "").slice(0, 500) }); }
    }
    const favicons = Array.from(document.querySelectorAll("link[rel*=icon]")).map((l) => ({
      rel: l.getAttribute("rel"),
      href: l.href,
      sizes: l.getAttribute("sizes"),
      type: l.getAttribute("type")
    }));
    const hreflangs = Array.from(document.querySelectorAll("link[rel=alternate][hreflang]")).map((l) => ({
      hreflang: l.getAttribute("hreflang"),
      href: l.href
    }));
    return { title, canonical: canonical ? canonical.href : null, meta, og, twitter, jsonLd, favicons, hreflangs };
  });
  return { ...info, url };
}

/**
 * Fetch + parse robots.txt for the preview origin using robots-parser.
 */
async function getRobots(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);
  const target = opts.url || url;
  const enrich = require("../mcp-enrichments");
  return enrich.parseRobots(target, opts.userAgent);
}

module.exports = { domQueryTool, findAll, listServiceWorkers, getResourceTiming, getBrowserApis, inspectIndexedDB, getFrameworkData, getDataAttrs, getMeta, getRobots };
