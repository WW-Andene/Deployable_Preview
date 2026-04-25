const session = require("../dv/session");
const fs = require("fs");
const path = require("path");
const { isBlockedHost } = require("../web-fetch");

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
  const maxRequests = Math.max(10, Math.min(Number(opts.maxRequests) || 500, 2000));
  const requests = [];
  let truncated = false;

  const onResponse = (resp) => {
    try {
      if (requests.length >= maxRequests) { truncated = true; return; }
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
    try { await page.reload({ waitUntil: session.waitUntilIdle(), timeout: 30000 }); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("response", onResponse); } catch (_) {}

  const byType = {};
  for (const r of requests) byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;

  return {
    url, duration: duration / 1000,
    requestCount: requests.length,
    truncated,
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

  const timeout = Math.max(1000, Math.min(Number(opts.timeout) || 30000, 120000));

  // ── Playwright path ──
  if (typeof page.waitForEvent === "function") {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout });
      if (opts.trigger === "evaluate" && opts.code) {
        await page.evaluate("(async () => { " + opts.code + " })()");
      } else if (opts.selector) {
        await page.click(opts.selector).catch(() => {});
      } else {
        throw new Error("trigger requires selector or code");
      }
      const download = await downloadPromise;
      const fsp = fs.promises;
      const os = require("os");
      const crypto = require("crypto");
      const tmp = path.join(os.tmpdir(), "dv-download-" + crypto.randomBytes(6).toString("hex"));
      await download.saveAs(tmp);
      const buf = await fsp.readFile(tmp);
      await fsp.unlink(tmp).catch(() => {});
      return {
        suggestedFilename: download.suggestedFilename ? download.suggestedFilename() : null,
        byteLength: buf.length,
        base64: buf.toString("base64"),
        url
      };
    } catch (e) {
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
    if (!fileName) return { error: "download timed out", url };
    const full = path.join(downloadDir, fileName);
    const buf = fs.readFileSync(full);
    try { fs.unlinkSync(full); fs.rmdirSync(downloadDir); } catch (_) {}
    return {
      suggestedFilename: fileName,
      byteLength: buf.length,
      base64: buf.toString("base64"),
      url
    };
  } catch (e) {
    return { error: "download capture failed: " + e.message, url };
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
  const maxReq = Math.min(Math.max(parseInt(opts.maxRequests, 10) || 500, 1), 2000);

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
    page.on("response", (resp) => {
      try {
        if (requests.length >= maxReq) { truncated = true; return; }
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
    const navWaitUntil = opts.waitUntil || (session.waitUntilIdle() === "networkidle2" ? "networkidle2" : "networkidle");
    const navStart = Date.now();
    try {
      await page.goto(parsed.href, { waitUntil: navWaitUntil, timeout: 45000 });
    } catch (navErr) {
      // Navigation errors (timeouts) are common on heavy pages — keep whatever we captured
      errors.push({ type: "navigation", message: navErr.message });
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
      truncated
    };

    if (opts.returnHtml) {
      try {
        result.html = await page.content();
      } catch (e) {
        result.html = "";
        result.htmlError = e.message;
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
  const maxEntries = Math.max(10, Math.min(Number(opts.maxEntries) || 500, 2000));
  const entries = [];
  let truncated = false;

  const onRequest = (req) => {
    try {
      if (entries.length >= maxEntries) { truncated = true; return; }
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
    try { await page.reload({ waitUntil: session.waitUntilIdle(), timeout: 30000 }); } catch (_) {}
  }
  await new Promise((r) => setTimeout(r, duration));
  try { page.off("request", onRequest); } catch (_) {}
  try { page.off("response", onResponse); } catch (_) {}

  return { url, duration: duration / 1000, count: entries.length, truncated, entries };
}

module.exports = { capturePreviewRequests, captureDownload, browseUrl, captureHar };
