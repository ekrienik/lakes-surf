/* Lakes Surf — service worker
   Caches the app shell so the PWA opens offline.
   Forecast API responses pass through to the network.
   Cross-origin requests (api.weather.gov, weather.gov iframe, etc.) are NOT
   intercepted at all — they go straight to the browser's network stack.
*/
const CACHE = 'lakes-surf-v5_1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL).catch((err) => {
        console.warn('Shell precache partial:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE + '-tiles').map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // Cross-origin requests: don't intercept. Browser handles them normally.
  // This prevents the SW from returning index.html as a fallback for
  // legitimate cross-origin failures (CORS errors, etc.).
  if (!sameOrigin) return;

  // Same-origin: cache-first (with network update), fall back to index.html
  // ONLY for navigation requests (when the user is opening the app offline).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504 });
      });
    })
  );
});
