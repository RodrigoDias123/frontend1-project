/**
 * Dev Tasks — Service Worker
 * Strategy: Cache First for static assets, pass-through for API (json-server).
 */

const CACHE_NAME = 'devtasks-v4';

// Only pre-cache the app shell — CDN resources have their own cache headers
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// ── Install: pre-cache all static assets ─────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Cache First for static, network-only for json-server API ─────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Pass through API calls — json-server handles /tasks directly
  if (url.pathname.startsWith('/tasks')) return;

  // Always fetch local JS/CSS fresh from network (no-cache headers on server)
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Return a basic offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
