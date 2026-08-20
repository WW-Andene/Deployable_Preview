const session = require("../dv/session");
const fs = require("fs");
const path = require("path");
const { isBlockedHost } = require("../web-fetch");
const enrich = require("../mcp-enrichments");

// ── Per-host politeness throttle for arbitrary-URL navigation ──────────────
// browseUrl has no built-in pacing, and the new dv_workflow `parallel` batch
// mode makes it trivial to fire several concurrent navigations at the same
// third-party host — the kind of burst that gets an IP rate-limited or WAF-
// flagged for reasons that then look identical to a real block. This is a
// minimum spacing between navigations to the same hostname, tracked
// in-process. Off by default (existing single-call behavior is unaffected);
// callers pass minRequestIntervalMs to opt in.
const _hostLastNav = new Map();
async function throttleHost(hostname, minIntervalMs) {
  const ms = Number(minIntervalMs);
  if (!Number.isFinite(ms) || ms <= 0 || !hostname) return;
  const last = _hostLastNav.get(hostname) || 0;
  const wait = last + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _hostLastNav.set(hostname, Date.now());
}

// ── Network request capture for a preview ─────────────────────────────────

/**
 * Attach network capture to the preview session and collect requests for a duration.
 * Useful for spotting lazy-loaded assets or XHR calls without using web_fetch.
 */
async function capturePreviewRequests(opts) {
  const { owner, repo, slug } = opts;
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  const duration = Math.max(1, Number(opts.duration) || 5) * 1000;
  // F-NEW-S001: raised default 500 → 1000 and lifted upper cap (was 2000).
  // Heavily-instrumented SPAs (analytics + ads + fonts + tracking) easily
  // hit 2000 in 30s of capture.
  const maxRequests = Math.max(10, Number(opts.maxRequests) || 1000);
  const requests = [];
  let truncated = false;
  let droppedCount = 0;     // F-NEW-A002: report how many were dropped

  const onResponse = (resp) => {
    try {
      if (requests.length >= maxRequests) { truncated = true; droppedCount++; return; }
      const req = resp.request ? resp.request() : null;
      const rurl = typeof resp.url === "function" ? resp.url() : "";
      if (!rurl) return;
      const rtype = (req && typeof req.resourceType === "function") ? req.resourceType() : "other";
      const headers = typeof resp.headers === "function" ? (resp.headers() || {}) : {};
      requests.push({
        url: rurl,
        method: (req && typeof req.method === "function") ? req.method() : "GET",
        resourceType: rtype,
        status: typeof resp.status === "function" ? resp.status() : 0,
        contentType: (headers["content-type"] || "").split(";")[0].trim(),
        size: headers["content-length"] ? parseInt(headers["content-length"], 10) : null
      });
    } catch (_) {}
  };
  page.on("response", onResponse);

  if (opts.reload) {
    try { await page.reload(Object.assign({ waitUntil: session.waitUntilIdle() }, session.navTimeout(opts) != null ? { timeout: session.navTimeout(opts) } : {})); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("response", onResponse); } catch (_) {}

  const byType = {};
  for (const r of requests) byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;

  return {
    url, duration: duration / 1000,
    requestCount: requests.length,
    truncated,
    droppedCount,                               // F-NEW-A002: visible to caller
    requestsByType: byType,
    requests
  };
}

// ── File download capture ──────────────────────────────────────────────────

/**
 * Trigger a download (via click or evaluate) and return the downloaded file
 * as base64. Works by subscribing to the browser's download events.
 *
 * @param {object} opts - {
 *   owner, repo, slug,
 *   trigger: "click" | "evaluate",
 *   selector?, code?, timeout?
 * }
 */
async function captureDownload(opts) {
  const { owner, repo, slug } = opts;
  if (!session.hasPlaywright()) return { error: "No browser available." };

  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, owner, repo, slug, opts.width, opts.height);

  // No upper cap — let the caller decide how long to wait. Pass 0 to wait
  // forever (clamped to 24h to avoid genuinely-stuck Playwright handles).
  const rawTimeout = Number(opts.timeout);
  const timeout = (Number.isFinite(rawTimeout) && rawTimeout > 0)
    ? rawTimeout
    : (rawTimeout === 0 ? 24 * 60 * 60 * 1000 : 30000);

  // Heartbeat: emit a progress notification every 5s so the MCP client
  // doesn't 60-second-timeout the call. No-op if onProgress wasn't supplied.
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  let _heartbeat = null;
  let _ticks = 0;
  if (onProgress) {
    onProgress(0, null, "download: waiting");
    _heartbeat = setInterval(() => {
      _ticks++;
      try { onProgress(_ticks, null, "download: waiting (" + (_ticks * 5) + "s)"); } catch (_) {}
    }, 5000);
  }
  function stopHeartbeat() {
    if (_heartbeat) { clearInterval(_heartbeat); _heartbeat = null; }
  }

  // ── Playwright path ──
  if (typeof page.waitForEvent === "function") {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout });
      if (opts.trigger === "evaluate" && opts.code) {
        await page.evaluate("(async () => { " + opts.code + " })()");
      } else if (opts.selector) {
        await page.click(opts.selector).catch(() => {});
      } else {
        stopHeartbeat();
        throw new Error("trigger requires selector or code");
      }
      const download = await downloadPromise;
      const fsp = fs.promises;
      const os = require("os");
      const crypto = require("crypto");
      const tmp = path.join(os.tmpdir(), "dv-download-" + crypto.randomBytes(6).toString("hex"));
      if (onProgress) onProgress(_ticks, null, "download: saving");
      await download.saveAs(tmp);
      const buf = await fsp.readFile(tmp);
      await fsp.unlink(tmp).catch(() => {});
      stopHeartbeat();
      if (onProgress) onProgress(_ticks, _ticks, "download: complete (" + buf.length + " B)");
      return {
        suggestedFilename: download.suggestedFilename ? download.suggestedFilename() : null,
        byteLength: buf.length,
        base64: buf.toString("base64"),
        url
      };
    } catch (e) {
      stopHeartbeat();
      return { error: "download capture failed: " + e.message, url };
    }
  }

  // ── Puppeteer path ──
  // Set download behaviour to a temp dir via CDP
  try {
    const os = require("os");
    const crypto = require("crypto");
    const downloadDir = path.join(os.tmpdir(), "dv-download-" + crypto.randomBytes(6).toString("hex"));
    fs.mkdirSync(downloadDir, { recursive: true });
    const client = await page._client().send
      ? page._client()
      : (typeof page.target === "function" ? await page.target().createCDPSession() : null);
    if (client) {
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadDir
      });
    }
    if (opts.trigger === "evaluate" && opts.code) {
      await page.evaluate("(async () => { " + opts.code + " })()");
    } else if (opts.selector) {
      await page.click(opts.selector).catch(() => {});
    } else {
      stopHeartbeat();
      return { error: "trigger requires selector or code", url };
    }
    // Poll downloadDir for a non-crdownload file
    const deadline = Date.now() + timeout;
    let fileName = null;
    while (Date.now() < deadline) {
      const files = fs.readdirSync(downloadDir).filter((f) => !f.endsWith(".crdownload"));
      if (files.length) { fileName = files[0]; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!fileName) { stopHeartbeat(); return { error: "download timed out", url }; }
    const full = path.join(downloadDir, fileName);
    const buf = fs.readFileSync(full);
    try { fs.unlinkSync(full); fs.rmdirSync(downloadDir); } catch (_) {}
    stopHeartbeat();
    if (onProgress) onProgress(_ticks, _ticks, "download: complete (" + buf.length + " B)");
    return {
      suggestedFilename: fileName,
      byteLength: buf.length,
      base64: buf.toString("base64"),
      url
    };
  } catch (e) {
    stopHeartbeat();
    return { error: "download capture failed: " + e.message, url };
  }
}

// ── Basic anti-detection init script ────────────────────────────────────────
// No external service or dependency — just patches the handful of headless
// "tells" that trip naive bot checks (navigator.webdriver, empty plugins
// list, a missing chrome object). Does nothing against real fingerprinting
// or WAF/IP-level blocks — see browseUrl's doc comment.
const STEALTH_INIT_SCRIPT = `(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (_) {}
  try {
    if (!window.chrome) window.chrome = { runtime: {} };
  } catch (_) {}
  try {
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  } catch (_) {}
  try {
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }
  } catch (_) {}
})();`;

async function applyStealth(page) {
  try {
    if (typeof page.addInitScript === "function") {
      await page.addInitScript(STEALTH_INIT_SCRIPT);       // Playwright
    } else if (typeof page.evaluateOnNewDocument === "function") {
      await page.evaluateOnNewDocument(STEALTH_INIT_SCRIPT); // Puppeteer
    }
  } catch (_) { /* best-effort — never block navigation on this */ }
}

// ── Minimal action runner for arbitrary-URL interaction sequences ──────────

/**
 * Run a small pre-capture interaction sequence on an arbitrary page.
 * Deliberately narrower than browser/interact.js (which is preview-session
 * scoped) — covers the handful of actions needed to reveal lazy content on
 * a third-party site (dropdown selection, "load more" clicks, scrolling
 * into view) before we screenshot/scrape it.
 * @param {object} act - { action, selector, value, timeout }
 */
async function runSimpleAction(page, act) {
  const selector = act && act.selector;
  const value = act && act.value;
  const timeout = Number.isFinite(Number(act && act.timeout)) ? Number(act.timeout) : 10000;
  switch (act && act.action) {
    case "click":
      await page.click(selector, { timeout });
      break;
    case "hover":
      await page.hover(selector, { timeout });
      break;
    case "type":
      await page.fill(selector, String(value == null ? "" : value), { timeout });
      break;
    case "select":
      await page.selectOption(selector, String(value == null ? "" : value), { timeout });
      break;
    case "scroll":
      await page.evaluate((y) => window.scrollBy(0, y || 0), Number(value) || 0);
      break;
    case "key":
      if (selector) await page.focus(selector, { timeout }).catch(() => {});
      await page.keyboard.press(String(value || "Enter"));
      break;
    case "wait":
      await new Promise((r) => setTimeout(r, Math.max(0, Math.min(Number(value) || 0, 30000))));
      break;
    case "waitForSelector":
      await page.waitForSelector(selector, { timeout });
      break;
    case "downloadAsset": {
      // Fetches an asset's bytes from *inside* the page's JS realm, not the
      // server. That's the only place a blob: URL (createObjectURL output —
      // no server-side fetch can ever reach it) or a <canvas> element's
      // rendered pixels (no URL exists at all) can be read. Also handles a
      // plain <img>/<video>/<audio>/<a> selector by resolving its src/href,
      // or a literal blob:/data:/http(s) URL passed directly as `value`.
      const literalUrl = (value != null && /^(blob:|data:|https?:)/i.test(String(value))) ? String(value) : null;
      const asset = await page.evaluate(async (args) => {
        const { sel, literal } = args;
        function toBase64(buf) {
          let binary = "";
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          return btoa(binary);
        }
        let url = literal;
        if (!url && sel) {
          const el = document.querySelector(sel);
          if (!el) return { error: "element not found: " + sel };
          if (el.tagName === "CANVAS") {
            try {
              const dataUrl = el.toDataURL();
              const res = await fetch(dataUrl);
              const buf = await res.arrayBuffer();
              if (buf.byteLength > 15 * 1024 * 1024) return { error: "asset too large (" + buf.byteLength + " bytes) — downloadAsset caps at 15MB to stay within MCP response limits" };
              return { source: sel + " (canvas.toDataURL)", mimeType: "image/png", byteLength: buf.byteLength, base64: toBase64(buf) };
            } catch (e) {
              return { error: "canvas.toDataURL failed (likely tainted by cross-origin content): " + (e && e.message) };
            }
          }
          url = el.currentSrc || el.src || el.href || null;
        }
        if (!url) return { error: "no URL resolved — selector had no src/href/currentSrc, and no literal blob:/data:/http(s) value given" };
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 15 * 1024 * 1024) return { error: "asset too large (" + buf.byteLength + " bytes) — downloadAsset caps at 15MB to stay within MCP response limits", source: url };
          return { source: url, mimeType: res.headers.get("content-type") || "", byteLength: buf.byteLength, base64: toBase64(buf) };
        } catch (e) {
          return { error: "fetch failed: " + (e && e.message) };
        }
      }, { sel: selector || null, literal: literalUrl });
      if (asset && asset.error) throw new Error(asset.error);
      return asset;
    }
    default:
      throw new Error("Unsupported action: " + (act && act.action));
  }
}

// ── Arbitrary URL browsing with network request capture ─────────────────────

/**
 * Navigate to an arbitrary URL, wait for JS to execute, and capture all
 * network requests the page makes. Useful for finding dynamically-loaded
 * assets (Spine skeletons, video, lazy-loaded images, XHR/fetch calls)
 * that a plain HTTP fetch cannot see.
 *
 * @param {object} opts
 * @param {string}  opts.url             - URL to load (http/https, public hosts only)
 * @param {number}  [opts.waitMs]        - Extra wait after navigation completes (default: 2000, max: 30000)
 * @param {string}  [opts.waitUntil]     - Navigation completion signal ("load", "domcontentloaded", "networkidle", "networkidle2")
 * @param {number}  [opts.width]         - Viewport width (default: 1280)
 * @param {number}  [opts.height]        - Viewport height (default: 720)
 * @param {object}  [opts.filter]        - { resourceTypes?: [...], urlPattern?: "regex", extensions?: [...] }
 * @param {boolean} [opts.returnHtml]    - Include rendered HTML content in response
 * @param {boolean} [opts.captureConsole]- Capture console logs + page errors (default: true)
 * @param {number}  [opts.maxRequests]   - Cap on stored requests (default: 500, max: 2000)
 * @param {string}  [opts.userAgent]     - Override User-Agent header
 * @param {object}  [opts.headers]       - Extra HTTP headers to send with every request
 * @returns {Promise<object>} { url, finalUrl, title, requestCount, requestsByType, requests, consoleLogs, errors, duration, truncated, html? }
 */
async function browseUrl(opts) {
  if (!opts || !opts.url) return { error: "url parameter is required" };

  let parsed;
  try {
    parsed = new URL(opts.url);
  } catch (e) {
    return { error: "Invalid URL: " + e.message };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { error: "Requests to private/internal network addresses are not allowed" };
  }

  if (!session.hasPlaywright()) {
    return { error: "No browser available — server is still setting one up, try again in a moment." };
  }

  const width  = Math.min(Math.max(parseInt(opts.width, 10)  || 1280, 200), 3840);
  const height = Math.min(Math.max(parseInt(opts.height, 10) || 720,  200), 2160);
  const waitMs = Math.min(Math.max(parseInt(opts.waitMs, 10) || 2000, 0), 30000);
  // F-NEW-S001: lifted upper cap (was 2000); raised default to 1000.
  const maxReq = Math.max(parseInt(opts.maxRequests, 10) || 1000, 1);

  // Parse filter options
  const resourceTypesFilter = (opts.filter && Array.isArray(opts.filter.resourceTypes) && opts.filter.resourceTypes.length)
    ? new Set(opts.filter.resourceTypes.map((t) => String(t).toLowerCase()))
    : null;
  const extensionsFilter = (opts.filter && Array.isArray(opts.filter.extensions) && opts.filter.extensions.length)
    ? new Set(opts.filter.extensions.map((e) => String(e).toLowerCase().replace(/^\./, "")))
    : null;
  let urlPatternRe = null;
  if (opts.filter && opts.filter.urlPattern) {
    try { urlPatternRe = new RegExp(opts.filter.urlPattern); }
    catch (e) { return { error: "Invalid urlPattern regex: " + e.message }; }
  }

  const browser = await session.getBrowser();
  const page = await session.newPage(browser);

  const requests = [];
  const seenUrls = new Set();
  const consoleLogs = [];
  const errors = [];
  let truncated = false;

  try {
    await session.setViewport(page, width, height);

    // On by default — cheap, no external dependency, strictly reduces
    // false-positive bot flags. Pass stealth:false to skip it.
    if (opts.stealth !== false) await applyStealth(page);

    // Set custom user-agent if provided
    if (opts.userAgent) {
      if (typeof page.setUserAgent === "function") {
        await page.setUserAgent(opts.userAgent);
      } else if (typeof page.setExtraHTTPHeaders === "function") {
        await page.setExtraHTTPHeaders({ "User-Agent": opts.userAgent });
      }
    }
    // Set extra headers if provided
    if (opts.headers && typeof opts.headers === "object" && typeof page.setExtraHTTPHeaders === "function") {
      // Strip any unsafe header names
      const safeHeaders = {};
      for (const k in opts.headers) {
        if (/^[a-zA-Z0-9_-]+$/.test(k) && typeof opts.headers[k] === "string") {
          safeHeaders[k] = opts.headers[k];
        }
      }
      if (Object.keys(safeHeaders).length) await page.setExtraHTTPHeaders(safeHeaders);
    }

    // Response listener — capture every network response
    let _droppedBrowse = 0;
    page.on("response", (resp) => {
      try {
        if (requests.length >= maxReq) { truncated = true; _droppedBrowse++; return; }
        const req = resp.request ? resp.request() : null;
        const rurl = typeof resp.url === "function" ? resp.url() : "";
        if (!rurl || seenUrls.has(rurl)) return;

        const rtype = (req && typeof req.resourceType === "function") ? req.resourceType() : "other";
        if (resourceTypesFilter && !resourceTypesFilter.has(rtype)) return;
        if (urlPatternRe && !urlPatternRe.test(rurl)) return;
        if (extensionsFilter) {
          // Match against the URL path extension
          let pathname = "";
          try { pathname = new URL(rurl).pathname; } catch (_) { pathname = rurl; }
          const dot = pathname.lastIndexOf(".");
          const ext = dot >= 0 ? pathname.slice(dot + 1).toLowerCase() : "";
          if (!extensionsFilter.has(ext)) return;
        }

        const headers = typeof resp.headers === "function" ? (resp.headers() || {}) : {};
        const clHeader = headers["content-length"];
        const size = clHeader ? parseInt(clHeader, 10) : null;

        seenUrls.add(rurl);
        requests.push({
          url: rurl,
          method: (req && typeof req.method === "function") ? req.method() : "GET",
          resourceType: rtype,
          category: session.categorizeResourceType(rtype),
          status: typeof resp.status === "function" ? resp.status() : 0,
          contentType: (headers["content-type"] || "").split(";")[0].trim(),
          size: Number.isFinite(size) ? size : null,
          fromCache: typeof resp.fromCache === "function" ? !!resp.fromCache() : false
        });
      } catch (_) { /* ignore individual response errors */ }
    });

    if (opts.captureConsole !== false) {
      page.on("console", (msg) => {
        if (consoleLogs.length >= 200) return;
        try { consoleLogs.push({ type: msg.type(), text: msg.text() }); } catch (_) {}
      });
      page.on("pageerror", (err) => {
        if (errors.length >= 100) return;
        errors.push({ type: "pageerror", message: err.message });
      });
      page.on("requestfailed", (req) => {
        if (errors.length >= 100) return;
        try {
          const failure = typeof req.failure === "function" ? req.failure() : null;
          errors.push({
            type: "requestfailed",
            url: req.url(),
            failure: failure ? (failure.errorText || String(failure)) : null
          });
        } catch (_) {}
      });
    }

    // Navigate
    if (opts.minRequestIntervalMs) await throttleHost(parsed.hostname, opts.minRequestIntervalMs);
    const navWaitUntil = opts.waitUntil || (session.waitUntilIdle() === "networkidle2" ? "networkidle2" : "networkidle");
    const navStart = Date.now();
    try {
      // F-NEW-T001: 45s default lifted; caller can pass navTimeout (0 = none).
      const _t = session.navTimeout(opts);
      const _go = { waitUntil: navWaitUntil };
      if (_t != null) _go.timeout = _t;
      await page.goto(parsed.href, _go);
    } catch (navErr) {
      // Navigation errors (timeouts) are common on heavy pages — keep whatever we captured
      errors.push({ type: "navigation", message: navErr.message });
    }

    // Conditional wait: block until a selector actually appears instead of
    // guessing a fixed timeout. Runs before the interaction sequence so
    // actions can target content that loads in after initial navigation.
    if (opts.waitForSelector) {
      const wfsTimeout = Math.min(Math.max(parseInt(opts.waitForSelectorTimeout, 10) || 10000, 0), 60000);
      try {
        await page.waitForSelector(opts.waitForSelector, { timeout: wfsTimeout });
      } catch (e) {
        errors.push({ type: "waitForSelector", message: "Timed out waiting for " + opts.waitForSelector + ": " + e.message });
      }
    }

    // Optional interaction sequence (click a dropdown, scroll a lazy list,
    // dismiss a cookie banner, etc.) before we capture HTML/screenshot.
    const downloads = [];
    if (Array.isArray(opts.actions) && opts.actions.length) {
      for (const act of opts.actions.slice(0, 25)) {
        try {
          const ret = await runSimpleAction(page, act);
          if (ret && act.action === "downloadAsset") downloads.push(ret);
        } catch (e) {
          errors.push({ type: "action", action: act && act.action, selector: act && act.selector, message: e.message });
        }
      }
    }

    // Extra wait for delayed loads (animations, lazy-loaded media, Spine init, etc.)
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const duration = Date.now() - navStart;
    const finalUrl = typeof page.url === "function" ? page.url() : parsed.href;
    let title = "";
    try { title = await page.title(); } catch (_) {}

    // Group requests by category for quick overview
    const requestsByType = {};
    for (const r of requests) {
      const cat = r.category;
      requestsByType[cat] = (requestsByType[cat] || 0) + 1;
    }

    const result = {
      url: parsed.href,
      finalUrl,
      title,
      duration,
      requestCount: requests.length,
      requestsByType,
      requests,
      consoleLogs,
      errors,
      truncated,
      droppedCount: _droppedBrowse,                   // F-NEW-A002
      downloads: downloads.length ? downloads : undefined
    };

    if (opts.returnHtml) {
      try {
        result.html = await page.content();
      } catch (e) {
        result.html = "";
        result.htmlError = e.message;
      }
    }

    if (opts.screenshot || opts.ocrText) {
      try {
        let buf;
        if (opts.screenshotSelector) {
          const el = await page.$(opts.screenshotSelector);
          buf = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png", fullPage: !!opts.fullPageScreenshot });
        } else {
          buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPageScreenshot });
        }
        if (opts.screenshot) {
          result.screenshotBase64 = buf.toString("base64");
          result.screenshotMimeType = "image/png";
        }
        if (opts.ocrText) {
          // Reads text baked into canvas/WebGL/image content that has no
          // DOM representation — extractText/getRawHtml can't see it because
          // there's nothing in the markup to select. No external service:
          // runs through the already-installed tesseract.js library.
          if (!enrich.have("tesseract.js")) {
            result.ocrError = "tesseract.js not installed. Run: npm install tesseract.js";
          } else {
            const ocr = await enrich.runOCR(buf, { lang: opts.ocrLang });
            if (ocr && ocr.error) result.ocrError = ocr.error;
            else result.ocrText = ocr && ocr.text;
          }
        }
      } catch (e) {
        if (opts.screenshot) result.screenshotError = e.message;
        if (opts.ocrText) result.ocrError = e.message;
      }
    }

    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Capture every request/response for a duration and return a HAR-like array.
 * Richer than capture_requests — includes headers, timings, post data.
 */
async function captureHar(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  const { page, url } = await session.getSessionPage(browser, opts.owner, opts.repo, opts.slug, opts.width, opts.height);

  const duration = Math.max(1, Number(opts.duration) || 5) * 1000;
  // F-NEW-S001: lifted upper cap; default 1000.
  const maxEntries = Math.max(10, Number(opts.maxEntries) || 1000);
  const entries = [];
  let truncated = false;
  let droppedCount = 0;

  const onRequest = (req) => {
    try {
      if (entries.length >= maxEntries) { truncated = true; droppedCount++; return; }
      const entry = {
        startedDateTime: new Date().toISOString(),
        request: {
          method: typeof req.method === "function" ? req.method() : "GET",
          url: typeof req.url === "function" ? req.url() : "",
          headers: typeof req.headers === "function" ? req.headers() : {},
          postData: typeof req.postData === "function" ? req.postData() : null,
          resourceType: typeof req.resourceType === "function" ? req.resourceType() : "other"
        },
        response: null
      };
      entries.push(entry);
      req.__dvEntry = entry;
    } catch (_) {}
  };
  const onResponse = async (resp) => {
    try {
      const req = resp.request ? resp.request() : null;
      const entry = req && req.__dvEntry;
      if (!entry) return;
      const headers = typeof resp.headers === "function" ? resp.headers() : {};
      entry.response = {
        status: typeof resp.status === "function" ? resp.status() : 0,
        statusText: typeof resp.statusText === "function" ? resp.statusText() : "",
        headers,
        contentType: (headers["content-type"] || "").split(";")[0].trim(),
        size: headers["content-length"] ? parseInt(headers["content-length"], 10) : null,
        fromCache: typeof resp.fromCache === "function" ? !!resp.fromCache() : false,
        fromServiceWorker: typeof resp.fromServiceWorker === "function" ? !!resp.fromServiceWorker() : false
      };
      // Capture security info when available
      if (typeof resp.securityDetails === "function") {
        try {
          const sec = await resp.securityDetails();
          if (sec) {
            entry.response.security = {
              protocol: sec.protocol && sec.protocol(),
              issuer: sec.issuer && sec.issuer(),
              subjectName: sec.subjectName && sec.subjectName(),
              validFrom: sec.validFrom && sec.validFrom(),
              validTo: sec.validTo && sec.validTo()
            };
          }
        } catch (_) {}
      }
    } catch (_) {}
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  if (opts.reload) {
    try { await page.reload(Object.assign({ waitUntil: session.waitUntilIdle() }, session.navTimeout(opts) != null ? { timeout: session.navTimeout(opts) } : {})); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("request", onRequest); } catch (_) {}
  try { page.off("response", onResponse); } catch (_) {}

  return { url, duration: duration / 1000, count: entries.length, truncated, droppedCount, entries };
}

module.exports = { capturePreviewRequests, captureDownload, browseUrl, captureHar };
