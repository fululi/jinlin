/* jinlin sw v.57 — 网络优先 3.5s 封顶回缓存。三连环修复(2026-09-16):
   (a) 缓存写入挂回 fetch 本体,晚到响应照常入缓存,弱网不再永远写不进
   (b) 缓存全 miss 时回退等待原始 fetch,不再 respondWith(undefined) 抛 TypeError
   (c) 预缓存失败不 skipWaiting;activate 保留前一版缓存,消灭"空缓存窗口"
   (d) 2026-09-20: 网络返回 HTTP 错误(4xx/5xx)也视为失败回退缓存,不再把错误响应直接端给用户 */
const C = 'jinlin-shell-v70';
const KEEP = ['jinlin-shell-v70', 'jinlin-shell-v69'];
const SHELL = ['./', 'index.html', 'ks.html'];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C)
      .then(c => Promise.all(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
      .catch(() => {})                    // 预缓存任何一项失败 → 不激活,旧版继续服役
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => KEEP.indexOf(k) < 0).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;                 // 只管本站的壳,行情接口一律直连
  if (!/(\/|index\.html|ks\.html)$/.test(u.pathname)) return;
  const net = fetch(e.request).then(r => {                  // 缓存写入挂在 fetch 本体上:
    if (r && r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }
    throw new Error('bad-net');                             // HTTP 错误(404/500)同样回退缓存,不把错误页端给用户
  });
  e.respondWith(
    Promise.race([
      net,
      new Promise((_, rj) => setTimeout(() => rj(new Error('slow-net')), 3500))
    ]).catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(m => m || caches.match('index.html'))
        .then(m => m || net))        // 缓存全空 → 等原始请求跑完,绝不 resolve undefined
  );
});
