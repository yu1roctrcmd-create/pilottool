const CACHE = 'nca-tools-v3';
const ASSETS = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './circuit-planner/index.html',
  './circuit-planner/manifest.json',
  './circuit-planner/css/style.css',
  './circuit-planner/js/airports.js',
  './circuit-planner/js/geometry.js',
  './circuit-planner/js/circuit.js',
  './circuit-planner/js/app.js',
  './circuit-planner/js/papi.js',
  './circuit-planner/js/aimpoint.js',
  './circuit-planner/js/dev.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// cache-first: キャッシュを優先して返し、バックグラウンドで再取得
// opaque response（no-cors imgタイルなど）も保存する
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const net = fetch(e.request).then(res => {
          if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    )
  );
});

// 📥 ボタンから FORCE_CACHE メッセージを受け取り全アセットを再キャッシュ
self.addEventListener('message', e => {
  if (e.data !== 'FORCE_CACHE') return;
  const port = e.ports[0];
  caches.open(CACHE).then(cache =>
    Promise.allSettled(ASSETS.map(url =>
      fetch(url, { cache: 'reload' }).then(res => { if (res.ok) cache.put(url, res); })
    ))
  ).then(() => port && port.postMessage('done'))
    .catch(() => port && port.postMessage('error'));
});
