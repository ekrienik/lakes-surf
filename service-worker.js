/* Lakes Surf — service worker
   Caches the app shell so the PWA opens offline.
   Forecast API responses pass through to the network.
   Cross-origin requests (api.weather.gov, weather.gov iframe, etc.) are NOT
   intercepted at all — they go straight to the browser's network stack.
*/
const CACHE = 'lakes-surf-v5_17_2';
const SHELL = [
  './',
  './index.html',
  './great-lakes.json',
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
      // 'lakes-surf-data' holds the page's hourly forecast grids; keep it across versions
      Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE + '-tiles' && k !== 'lakes-surf-data').map((k) => caches.delete(k)))
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

  // The page itself (navigations / index.html): network-first so a new
  // version shows up on the very next open, with the cached copy as the
  // offline fallback. Everything else same-origin: cache-first.
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
  if (isPage) {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    const cached = () => caches.match(req).then((hit) => hit || caches.match('./index.html'));
    // On a weak signal (beach parking lot), don't hang the launch: after 3 s
    // fall back to the cached page while the network copy still refreshes the cache.
    const slow = new Promise((resolve) => setTimeout(resolve, 3000))
      .then(() => cached().then((hit) => hit || network));
    event.respondWith(
      Promise.race([network.catch(() => cached()), slow])
    );
    event.waitUntil(network.catch(() => {}));
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => new Response('', { status: 504 }));
    })
  );
});
