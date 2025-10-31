const CACHE_NAME = 'habit-app-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  // Try to cache assets, but don't fail installation if some resources (e.g. CDN)
  // cannot be fetched. This avoids the "addAll Request failed" error.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urlsToCache) {
      try {
        // For cross-origin resources, use no-cors to allow opaque responses
        const response = await fetch(url, { mode: 'no-cors' });
        // Some fetches may return opaque responses; still store them if possible
        await cache.put(url, response.clone());
      } catch (err) {
        // Log and continue; we don't want install to fail because of one resource
        console.warn('ServiceWorker: failed to cache', url, err);
      }
    }
  })());
});

// ネットワークが使えないときはキャッシュから取得
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// 古いキャッシュの削除
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (!cacheWhitelist.includes(key)) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});
