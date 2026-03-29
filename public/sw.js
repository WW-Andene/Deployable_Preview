// ═══════════════════════════════════════════════════════════════════════════════
// WHISPERING WISHES — Service Worker
// P14-FIX: HIGH-6 — Moved from inline blob URL to proper static file.
// Blob URL SWs bypass CSP, are invisible to security scanners, and prevent
// proper SW update lifecycle. A static file fixes all three issues.
// ═══════════════════════════════════════════════════════════════════════════════

let APP_VERSION = '3.2.3'; // Fallback — can be overridden by app via message
let APP_CACHE = `ww-app-v${APP_VERSION}`;
let IMG_CACHE = `ww-images-v${APP_VERSION}`;
let CDN_CACHE = `ww-cdn-v${APP_VERSION}`;
const MAX_IMG_ENTRIES = 250;

// Core app shell to precache
// NOTE: Vite hashed assets are cache-busted automatically via networkFirst strategy.
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

// CDN domains — cache-first (these rarely change)
const CDN_DOMAINS = ['cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Image domains — stale-while-revalidate
const IMG_DOMAINS = ['i.ibb.co', 'i.imgur.com', 'ibb.co', 'cdn.discordapp.com', 'media.discordapp.net', 'pbs.twimg.com', 'raw.githubusercontent.com', 'i.postimg.cc', 'wuwa.gg', 'wuwatracker.com'];

// Install — precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [APP_CACHE, IMG_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => !currentCaches.includes(n)).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Trim image cache to MAX_IMG_ENTRIES (LRU by insertion order)
let _trimPending = false;
async function trimCache(cacheName, maxEntries) {
  if (_trimPending) return;
  _trimPending = true;
  await new Promise(r => setTimeout(r, 2000));
  _trimPending = false;
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
    }
  } catch {}
}

// Strategy: Cache-first (for CDN assets)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

// Strategy: Stale-while-revalidate (for images)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cacheName, MAX_IMG_ENTRIES);
    }
    return response;
  }).catch(() => {
    if (cached) return cached;
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  });

  return cached || fetchPromise;
}

// Strategy: Network-first with cache fallback (for app/API)
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html') || await caches.match('/');
      if (fallback) return fallback;
      // Last resort — styled offline message
      return new Response(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Offline — Whispering Wishes</title>
        <style>body{background:#080c14;color:#e2e8f0;font-family:'Rajdhani',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
        .box{max-width:400px;padding:2rem}h1{font-size:1.5rem;margin-bottom:1rem}p{opacity:0.7;line-height:1.6}
        button{margin-top:1.5rem;padding:0.75rem 1.5rem;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-family:inherit}
        button:hover{background:#3b82f6}</style></head>
        <body><div class="box"><h1>You're Offline</h1><p>Whispering Wishes needs an internet connection to load. Please check your connection and try again.</p>
        <button onclick="location.reload()">Retry</button></div></body></html>`,
        { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return new Response('Offline', { status: 503 });
  }
}

// Fetch router — pick strategy by domain/type
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // CDN assets → cache-first
  if (CDN_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(cacheFirst(event.request, CDN_CACHE));
    return;
  }

  // Images → stale-while-revalidate
  if (IMG_DOMAINS.some(d => url.hostname.includes(d)) || /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request, IMG_CACHE));
    return;
  }

  // Everything else → network-first
  event.respondWith(networkFirst(event.request, APP_CACHE));
});

// Handle messages
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearImageCache') {
    caches.delete(IMG_CACHE).then(() => {
      event.source?.postMessage('imageCacheCleared');
    });
  }
  // Version sync from app — keeps cache names aligned with app version
  if (event.data?.type === 'SET_VERSION' && event.data.version) {
    APP_VERSION = event.data.version;
    APP_CACHE = `ww-app-v${APP_VERSION}`;
    IMG_CACHE = `ww-images-v${APP_VERSION}`;
    CDN_CACHE = `ww-cdn-v${APP_VERSION}`;
  }
});
