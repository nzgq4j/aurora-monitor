// Polar Lights service worker: keeps the app usable on weak or no signal (common at dark-sky spots).
// - Pages: network first, falling back to the last copy viewed, then to /offline.
// - Live data (/api/*): network first, falling back to the last response, marked x-pl-offline so the
//   page can say it's showing saved data.
// - Build assets, map geometry, globe images and icons: cache first (versioned or rarely change).
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
    if (hit && request.mode !== 'navigate') {
      const headers = new Headers(hit.headers);
      headers.set('x-pl-offline', '1');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    }
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
  else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/geo/') || url.pathname.startsWith('/globe/') || url.pathname.startsWith('/icons/')) event.respondWith(cacheFirst(request));
});

// Push alerts from the alert engine: { title, body, url, tag }.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Polar Lights', {
    body: data.body || '',
    tag: data.tag || 'aurora',
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-monochrome-512.png',
    data: { url: data.url || '/' },
  }));
});

// Tapping a notification focuses an open Polar Lights window, or opens one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) { await client.focus(); if ('navigate' in client) await client.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
