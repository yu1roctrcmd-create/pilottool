const CACHE_NAME = 'circuit-planner-v199';
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
      './js/pilotview.js',
      './manifest.json',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    ]).catch(() => {}))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
// 注意: caches はオリジン全体で共有されるため、自分のプレフィックスのみ削除する
// （NCA Tools 側の nca-tools-* キャッシュを消さないこと）
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('circuit-planner-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isTileUrl(url) {
  return url.hostname.includes('arcgisonline.com') || url.hostname.includes('tile');
}

// リクエストの処理（キャッシュ優先：オフラインモード）
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const url = new URL(event.request.url);

  // cache:'reload'（📥タイルキャッシュ等）はSWキャッシュをバイパスして
  // ネットワークから強制取得し、キャッシュを更新する
  if (event.request.cache === 'reload') {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(isTileUrl(url) ? TILE_CACHE : CACHE_NAME)
            .then(c => c.put(event.request.url, copy));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 地図タイルはキャッシュ優先
  if (isTileUrl(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok || response.type === 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // GETリクエスト：キャッシュ優先（オフラインで完全動作）
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
});
