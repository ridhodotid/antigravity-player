const CACHE_NAME = 'antigravity-player-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/silence.mp3',
];

// Install Event: Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup ALL old caches, then take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event:
//   - HTML/JS/CSS: Network-first so updates are always reflected immediately
//   - API & WS: Always bypass cache
//   - Other assets (images etc): Stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for API and WebSocket requests entirely
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) {
    return;
  }

  // Network-first for core app shell (HTML, JS, CSS) so updates are instant
  const isCoreAsset = ['/index.html', '/js/app.js', '/css/style.css', '/'].some(
    (p) => url.pathname === p || url.pathname === p + 'index.html'
  );

  if (isCoreAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request)) // Fallback to cache if offline
    );
    return;
  }

  // Stale-while-revalidate for everything else (icons, manifest, silence.mp3 etc.)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(() => {});

      return cachedResponse || networkFetch;
    })
  );
});
