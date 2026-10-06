/* sw.js — service worker BacaSaku.
   Menyimpan aset inti di Cache Storage supaya aplikasi tetap terbuka
   walau offline dan bisa di-install ke layar utama HP (PWA). */

const CACHE = 'bacasaku-core-v1';
const CORE = [
  './',
  'index.html',
  'css/style.css',
  'js/storage.js',
  'js/parse.js',
  'js/script.js',
  'lib/jszip.min.js',
  'manifest.webmanifest',
  'img/icon.svg',
  'img/icon-192.png',
  'img/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // satu aset gagal tidak boleh menggagalkan instalasi seluruhnya
      Promise.all(CORE.map(url =>
        cache.add(new Request(url, { cache: 'no-cache' })).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Strategi stale-while-revalidate:
   sajikan dari cache secepat mungkin, sambil unduh versi terbaru
   di latar belakang untuk kunjungan berikutnya. Offline → cache saja. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
