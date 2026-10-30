/* 서비스 워커: 화면 파일·로고만 캐시. 일정 데이터(/data/)와 라인업(ESPN)은 항상 네트워크(HTTP 304 캐시)로. */
const V = 'sh-v5', IMG = 'sh-img-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'assets/icon.svg', 'assets/watch/naver.svg',
  'assets/watch/coupang.png', 'assets/watch/spotv.png', 'assets/watch/chzzk.png', 'assets/watch/soop.png', 'assets/watch/youtube.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== IMG).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.includes('/data/')) return;
  if (u.pathname.includes('/assets/logos/')) {            // 로고: 한 번 받으면 계속 재사용
    e.respondWith(caches.open(IMG).then(async (c) => (await c.match(r)) || fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => {          // 화면 파일: 캐시 먼저, 뒤에서 조용히 갱신
    const net = fetch(r).then((res) => { if (res.ok) caches.open(V).then((c) => c.put(r, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  }));
});
