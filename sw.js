/* 서비스 워커
 * - 화면 파일(html·js·css): 네트워크 먼저 → 새 버전을 올리면 다음에 열 때 바로 적용. 오프라인일 때만 캐시 사용
 * - 로고·아이콘 이미지: 한 번 받으면 캐시 재사용 (거의 안 바뀜)
 * - 일정 데이터(/data/)·외부 API: 건드리지 않음 (브라우저 HTTP 캐시 304 로 처리) */
const V = 'sh-v7', IMG = 'sh-img-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'assets/icon.svg', 'assets/watch/naver.svg',
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
  if (r.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async (c) => (await c.match(r)) || fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  e.respondWith(fetch(r, { cache: 'no-cache' }).then((res) => {   // 바뀐 게 없으면 304 라 전송량은 거의 없음
    if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then((hit) => hit || caches.match('index.html'))));
});
