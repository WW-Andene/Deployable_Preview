// sw.js — DeployView service worker.
//
// Strategy:
// - App shell (HTML, CSS, JS, icon) is cache-first so the dashboard
//   loads instantly + works offline. Updated in the background; user
//   sees fresh assets on next navigation.
// - Everything else (API, /preview/*, screenshots, MCP, tunnel) is
//   network-only. We never want to serve stale repo lists, build
//   statuses, or preview content.
// - On activate, old caches are nuked.
//
// Bump CACHE_VERSION to force clients to refresh the shell.

"use strict";

const CACHE_VERSION = "dv-shell-v11";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/css/style.css",
  "/js/app.js",
  "/js/icons.js",
  "/js/qr.js",
  "/js/md.js",
  "/js/views/topbar.js",
  "/js/views/setup.js",
  "/js/views/branch-row.js",
  "/js/views/dashboard.js",
  "/js/views/addRepo.js",
  "/js/views/preview.js",
  "/js/views/mcp.js",
  "/js/views/settings.js",
  "/js/views/analytics.js",
  "/js/views/modals/_base.js",
  "/js/views/modals/edit.js",
  "/js/views/modals/log.js",
  "/js/views/modals/apk.js",
  "/js/views/modals/share.js",
  "/js/views/modals/history.js",
  "/js/views/modals/diff.js",
  "/js/views/modals/errors.js",
  "/js/views/modals.js",
  "/js/views/palette.js"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      // addAll is atomic — any failure aborts the install.
      return cache.addAll(SHELL).catch(function(err) {
        // Be resilient: if a single file 404s during dev, install
        // anyway with whatever did cache. Keeps SW from getting stuck.
        console.warn("[sw] addAll partial failure:", err.message);
        return Promise.all(SHELL.map(function(u) {
          return cache.add(u).catch(function(){});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // never touch CDN/CORS

  // Network-only paths: API, previews, MCP, tunnel, file browser, test
  // harness, SSE log streams, dynamic thumbnails. Anything that returns
  // live data must NOT be cached.
  const path = url.pathname;
  if (
    path.startsWith("/api/") ||
    path.startsWith("/preview/") ||
    path.startsWith("/mcp") ||
    path.startsWith("/test/") ||
    path.startsWith("/browser/")
  ) {
    return; // let the browser fetch normally
  }

  // App shell: cache-first with background revalidation.
  event.respondWith(
    caches.match(req).then(function(cached) {
      const network = fetch(req).then(function(resp) {
        if (resp && resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(function(c) { c.put(req, copy).catch(function(){}); });
        }
        return resp;
      }).catch(function() { return cached; });
      return cached || network;
    })
  );
});

// Allow the page to ping us to skip waiting after a successful update —
// avoids leaving the user on an old shell after a deploy.
self.addEventListener("message", function(event) {
  if (event.data === "skipWaiting") self.skipWaiting();
});
