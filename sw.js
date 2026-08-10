const CACHE = 'draw-pad-v7';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/sound.js',
  '/js/stencils.js',
  '/js/canvas.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(k => Promise.all(k.filter(k => k !== CACHE).map(k => caches.delete(k)))),
      clients.claim(),
    ])
  );
});

/*
 * Cache-first: this is an offline-first toy that must open instantly, even on a
 * bad connection. Updates are picked up in the background on the next launch.
 * Only successful same-origin GETs are cached, so error pages can't poison it.
 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      const network = fetch(e.request).then(r => {
        if (r && r.ok && r.type === 'basic') {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
