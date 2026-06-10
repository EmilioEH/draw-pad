const CACHE = 'draw-pad-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
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

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
