// Polar Lights service worker: keeps the app usable on weak or no signal (common at dark-sky spots).
// - Pages: network first, falling back to the last copy viewed, then to /offline.
// - Live data (/api/*): network first, falling back to the last response.
// - Build assets, map geometry and icons: cache first (they are versioned or rarely change).
const VERSION = 'polarlights-v1'; // changing this clears older caches (including the pre-rebrand oval-v1-*)
const PAGES = `${VERSION}-pages`, DATA = `${VERSION}-data`, STATIC = `${VERSION}-static`;
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/geo/countries-50m.json', '/geo/lakes-50m.geo.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, DATA, STATIC]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      // Redirect rather than answer in place, so the URL matches the page the app router renders.
      const url = new URL(request.url);
      if (url.pathname === '/offline') return (await caches.match('/offline')) ?? Response.error();
      return Response.redirect(`/offline?from=${encodeURIComponent(url.pathname + url.search)}`, 302);
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Cloud tiles are large and short-lived; leave them to the HTTP cache.
  if (url.pathname.startsWith('/api/clouds')) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, PAGES));
  else if (url.pathname.startsWith('/api/')) event.respondWith(networkFirst(request, DATA));
  else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/geo/') || url.pathname.startsWith('/icons/')) event.respondWith(cacheFirst(request));
});
