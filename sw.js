/* jinlin sw v.23 — 通达信式秒开：网络优先 3.5s 封顶，超时/断网回缓存，弱网不再黑屏干等 */
const C = 'jinlin-shell-v23';
const SHELL = ['./', 'index.html', 'ks.html'];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting(), () => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;                 // 只管本站的壳,行情接口一律直连
  if (!/(\/|index\.html|ks\.html)$/.test(u.pathname)) return;
  e.respondWith(
    Promise.race([
      fetch(e.request),
      new Promise((_, rj) => setTimeout(() => rj(new Error('slow-net')), 3500))
    ])
      .then(r => {
        if (r && r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(m => m || caches.match('index.html')))
  );
});
