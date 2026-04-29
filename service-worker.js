/* Lakes Surf — service worker
   Caches the app shell so the PWA opens offline.
   Forecast API responses are NOT cached here so users always see fresh data when online.
*/
const CACHE = 'lakes-surf-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL).catch((err) => {
        // Don't fail install if a CDN asset is temporarily unreachable
        console.warn('Shell precache partial:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // NOAA API: network-first, never serve stale forecast from cache
  if (url.hostname === 'api.weather.gov') {
    event.respondWith(fetch(req));
    return;
  }

  // Map tiles: cache-first to save data on the road
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE + '-tiles').then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          return hit || new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // App shell + Leaflet CDN: cache-first, fall back to network
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Cache the new asset
      if (res.ok && (url.origin === location.origin || url.hostname === 'unpkg.com')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
