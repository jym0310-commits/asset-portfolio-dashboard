const CACHE_NAME = 'portfolionote-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/login.html',
  '/css/style.css',
  '/js/main.js',
  '/js/auth.js',
  '/js/vendor/chart.umd.js',
  '/assets/logo.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 로그인 세션/자산 데이터(API)는 오프라인 캐시 대상이 아닙니다 - 항상 최신 상태로만 보여줘야 해서
  // 서비스워커가 아예 관여하지 않고 그대로 네트워크로 흘려보냅니다.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 정적 파일(html/css/js/이미지)만, 네트워크 우선 + 실패시(오프라인) 캐시로 대체합니다.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
