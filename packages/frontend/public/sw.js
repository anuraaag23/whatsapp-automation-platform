// Minimal service worker for installability (Add to Home Screen / desktop
// install), not for offline-first behavior. This is a live dashboard with
// real business data (contacts, campaigns, messages) — aggressively caching
// API responses or page HTML here would risk showing stale data after a
// reconnect, which is worse than no offline support at all. So:
//   - /api/* and page navigations: always network, never cached.
//   - static build assets (_next/static, icons): cache-first, since those
//     are content-hashed by Next.js and safe to cache indefinitely.
const STATIC_CACHE = 'wa-platform-static-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API calls or the page shell — always hit the network so
  // the dashboard never shows stale campaign/contact/message data.
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate') {
    return;
  }

  // Static, content-hashed build output — safe to cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
