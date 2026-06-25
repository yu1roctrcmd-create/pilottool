const CACHE_NAME = 'circuit-planner-v197';
const TILE_CACHE = 'map-tiles-v1';
const OFFLINE_URL = './index.html';

// アプリ本体をキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([
      './',
      './index.html',
      './css/style.css',
      './js/airports.js',
      './js/geometry.js',
      './js/circuit.js',
      './js/app.js',
      './js/papi.js',
      './js/aimpoint.js',
      './js/dev.js',
      './manifest.json',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    ]).catch(() => {}))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// リクエストの処理（キャッシュ優先：オフラインモード）
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 地図タイルはキャッシュ優先
  if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('tile')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // GETリクエスト：キャッシュ優先（オフラインで完全動作）
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // その他のリクエスト
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL)
    )
  );
});
