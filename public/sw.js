/* Swaply service worker — makes the app installable and lets the shell load offline.
   API calls always go to the network; the app shell is cached for instant/offline start. */
const CACHE = 'swaply-shell-v1';
const SHELL = ['/', '/index.html', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // never cache API
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok && url.origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
