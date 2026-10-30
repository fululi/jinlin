/* jl_req.js v1 — 统一请求层 (jl-req1)
 * 必须是页面第一个脚本: 在入口处拦截所有发往 东财/腾讯 的 JSONP(<script src>) 与 fetch, 现有调用点一行不改:
 *   ① 按主机限速排队(最小间隔+并发上限)
 *   ② 熔断: 同主机连续失败 FAILN 次 → 打开 COOL 毫秒, 期间有备口就改走备口(push2↔push2delay, push2his 资金流→push2delay), 没备口就立刻判失败(调用方马上走自己的兜底, 不再干等超时/不再狂打)
 *      冷却到点放 1 个探路请求(半开), 成功即恢复
 *   ③ 排队期间调用方已放弃(JSONP 回调函数已删) → 不再发
 *   ④ 统计: window.jlReq.stats(), 每日汇总落 jl_req_day_v1(留30天)
 * 新代码用 jlReq.jsonp(url,{ttl,timeout}) / jlReq.json(url,{ttl}): 带同 URL 并发去重 + 短缓存
 * 回滚: 删 index.html <head> 里引用本文件的一行即可(拦截全部失效, 行为回到原样)
 */
(function () {
  if (window.jlReq) return;
  var FAILN = 4, COOL = 60000, STALL = 12000, DAYK = 'jl_req_day_v1';
  var RULES = [
    { re: /(^|\.)eastmoney\.com$/, gap: 100, conc: 4 },
    { re: /(^|\.)(gtimg\.cn|qq\.com)$/, gap: 40, conc: 6 }
  ];
  var H = {}; /* host → 限速队列 {gap,conc,act,last,q:[]} */
  var B = {}; /* 主机+接口路径 → 熔断 {fail,openUntil,probe,lastErr,st:{ok,err,fast,alt,drop}} —— 同主机不同接口分开熔断(腾讯 fqkline 坏不连累 mkline) */
  function hostOf(u) { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } }
  function ruleOf(h) { for (var i = 0; i < RULES.length; i++) if (RULES[i].re.test(h)) return RULES[i]; return null; }
  function S(h) {
    var r = ruleOf(h); if (!r) return null;
    return H[h] || (H[h] = { h: h, gap: r.gap, conc: r.conc, act: 0, last: 0, q: [] });
  }
  function keyOf(u) { try { var x = new URL(u, location.href); return x.hostname + x.pathname; } catch (e) { return ''; } }
  function K(u) {
    var k = keyOf(u); if (!k || !ruleOf(k.split('/')[0])) return null;
    return B[k] || (B[k] = { k: k, h: k.split('/')[0], fail: 0, openUntil: 0, probe: false, lastErr: '', st: { ok: 0, err: 0, fast: 0, alt: 0, drop: 0 } });
  }
  function altOf(u) {
    var x; try { x = new URL(u, location.href); } catch (e) { return null; }
    if (x.hostname === 'push2.eastmoney.com') x.hostname = 'push2delay.eastmoney.com';
    else if (x.hostname === 'push2delay.eastmoney.com') x.hostname = 'push2.eastmoney.com';
    else if (x.hostname === 'push2his.eastmoney.com' && /\/api\/qt\/stock\/fflow\//.test(x.pathname)) x.hostname = 'push2delay.eastmoney.com';
    else return null;
    return x.href;
  }
  function isOpen(s) { return s.openUntil > Date.now(); }
  function result(s, ok, why) {
    if (!s) return;
    if (ok) { s.st.ok++; s.fail = 0; s.openUntil = 0; s.probe = false; }
    else {
      s.st.err++; s.fail++; s.lastErr = why || 'err';
      if (s.fail >= FAILN || s.probe || s.openUntil) { s.openUntil = Date.now() + COOL; s.fail = 0; s.probe = false; } /* 探路失败或熔断期间(备口/放行前已在途)失败 → 重新冷却 */
    }
    bump(s.h, ok ? 'ok' : 'err');
  }
  /* 决定一个请求怎么走: {go:url} 放行(可能是备口) / {fail:true} 熔断无备口 */
  function route(url) {
    var s = K(url);
    if (!s) return { go: url, s: null };
    if (!s.openUntil) return { go: url, s: s };
    if (!isOpen(s) && !s.probe) { s.probe = true; return { go: url, s: s }; } /* 冷却到点: 只放这一个探路, 其余照熔断处理直到它回来 */
    var a = altOf(url), sa = a && K(a);
    if (sa && !isOpen(sa)) { s.st.alt++; bump(s.h, 'alt'); return { go: a, s: sa }; }
    s.st.fast++; bump(s.h, 'fast');
    return { fail: true, s: s };
  }
  /* 按主机排队 */
  function enqueue(host, job) {
    var s = S(host);
    if (!s) { job(function () { }); return; }
    s.q.push(job); pump(s);
  }
  function pump(s) {
    while (s.q.length && s.act < s.conc) {
      var wait = s.last + s.gap - Date.now();
      if (wait > 0) { if (!s.tm) s.tm = setTimeout(function () { s.tm = 0; pump(s); }, wait); return; }
      var job = s.q.shift(); s.act++; s.last = Date.now();
      var done = false, rel = function () { if (done) return; done = true; s.act--; pump(s); };
      setTimeout(rel, STALL); /* 卡死保护 */
      try { job(rel); } catch (e) { rel(); }
    }
  }

  /* ---------- 拦截 <script src> ---------- */
  var oAppend = Node.prototype.appendChild, oInsert = Node.prototype.insertBefore;
  function cbName(src) { var m = /[?&](?:cb|callback|jsonp)=([A-Za-z_$][\w$]*)/.exec(src); return m ? m[1] : ''; }
  function fireErr(el) { setTimeout(function () { try { el.dispatchEvent(new Event('error')); } catch (e) { } }, 0); }
  function manage(parent, el, ref) {
    var src = el.src, host = hostOf(src);
    el._jlq = 1;
    enqueue(host, function (rel) {
      var cb = cbName(src);
      if (cb && typeof window[cb] !== 'function') { var s0 = K(src); s0.st.drop++; bump(host, 'drop'); rel(); return; } /* 调用方已放弃 */
      var r = route(src);
      if (r.fail) { rel(); fireErr(el); return; }
      if (r.go !== src) el.src = r.go;
      var fin = function (ok, why) { el.removeEventListener('load', onL); el.removeEventListener('error', onE); result(r.s, ok, why); rel(); };
      var onL = function () { fin(true); }, onE = function () { fin(false, 'script error'); };
      el.addEventListener('load', onL); el.addEventListener('error', onE);
      try { ref ? oInsert.call(parent, el, ref) : oAppend.call(parent, el); } catch (e) { fin(false, 'append'); }
    });
    return el;
  }
  function want(el) { return el && el.tagName === 'SCRIPT' && !el._jlq && el.src && S(hostOf(el.src)); }
  Node.prototype.appendChild = function (el) { return want(el) ? manage(this, el, null) : oAppend.call(this, el); };
  Node.prototype.insertBefore = function (el, ref) { return want(el) ? manage(this, el, ref || null) : oInsert.call(this, el, ref); };

  /* ---------- 拦截 fetch ---------- */
  var oFetch = window.fetch && window.fetch.bind(window);
  if (oFetch) window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    if (!url || !S(hostOf(url))) return oFetch(input, init);
    return new Promise(function (res, rej) {
      enqueue(hostOf(url), function (rel) {
        var r = route(url);
        if (r.fail) { rel(); rej(new TypeError('jlReq熔断: ' + hostOf(url) + ' 暂停到 ' + new Date(r.s.openUntil).toTimeString().slice(0, 8))); return; }
        var arg = r.go !== url ? r.go : input;
        oFetch(arg, init).then(function (resp) { result(r.s, resp.ok, resp.ok ? '' : 'HTTP ' + resp.status); rel(); res(resp); },
          function (e) { result(r.s, false, String(e && e.message || e)); rel(); rej(e); });
      });
    });
  };

  /* ---------- 每日统计 ---------- */
  var day = null, dirty = false;
  function td() { return new Date().toLocaleDateString('sv-SE'); }
  function bump(h, k) {
    try {
      if (!day) { day = JSON.parse(localStorage.getItem(DAYK) || '{}') || {}; }
      var d = day[td()] = day[td()] || {}, x = d[h] = d[h] || {};
      x[k] = (x[k] || 0) + 1; dirty = true;
    } catch (e) { }
  }
  setInterval(function () {
    if (!dirty) return; dirty = false;
    try { var ks = Object.keys(day).sort(); while (ks.length > 30) delete day[ks.shift()]; localStorage.setItem(DAYK, JSON.stringify(day)); } catch (e) { }
  }, 30000);

  /* ---------- 给新代码用的接口 ---------- */
  var cache = {}, inflight = {}, seq = 0;
  function cached(key, ttl) { var c = cache[key]; return c && Date.now() - c.t < ttl ? c.v : undefined; }
  function jsonp(url, o) {
    o = o || {};
    var ttl = o.ttl || 0, key = url, hit = ttl ? cached(key, ttl) : undefined;
    if (hit !== undefined) return Promise.resolve(hit);
    if (inflight[key]) return inflight[key];
    var p = new Promise(function (res, rej) {
      var cb = 'jlq' + Date.now().toString(36) + (++seq), el = document.createElement('script'), t;
      function clean() { clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (el.parentNode) el.parentNode.removeChild(el); }
      window[cb] = function (d) { clean(); res(d); };
      el.onerror = function () { clean(); rej(new Error('neterr')); };
      t = setTimeout(function () { clean(); rej(new Error('timeout')); }, o.timeout || 9000);
      el.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + (o.cbKey || 'cb') + '=' + cb;
      document.head.appendChild(el);
    }).then(function (v) { delete inflight[key]; if (ttl) cache[key] = { t: Date.now(), v: v }; return v; }, function (e) { delete inflight[key]; throw e; });
    return (inflight[key] = p);
  }
  function json(url, o) {
    o = o || {};
    var ttl = o.ttl || 0, hit = ttl ? cached(url, ttl) : undefined;
    if (hit !== undefined) return Promise.resolve(hit);
    if (inflight[url]) return inflight[url];
    var p = window.fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (v) { delete inflight[url]; if (ttl) cache[url] = { t: Date.now(), v: v }; return v; }, function (e) { delete inflight[url]; throw e; });
    return (inflight[url] = p);
  }
  function stats() { /* 按主机汇总; open=该主机下正在熔断的接口数, opened=[接口路径] */
    var o = {};
    Object.keys(H).forEach(function (h) { o[h] = { queue: H[h].q.length, act: H[h].act, ok: 0, err: 0, fast: 0, alt: 0, drop: 0, open: 0, opened: [], lastErr: '' }; });
    Object.keys(B).forEach(function (k) {
      var b = B[k], x = o[b.h] = o[b.h] || { queue: 0, act: 0, ok: 0, err: 0, fast: 0, alt: 0, drop: 0, open: 0, opened: [], lastErr: '' };
      ['ok', 'err', 'fast', 'alt', 'drop'].forEach(function (n) { x[n] += b.st[n]; });
      if (isOpen(b)) { x.open++; x.opened.push(k.slice(b.h.length)); }
      if (b.lastErr) x.lastErr = b.lastErr;
    });
    return o;
  }
  /* isOpen(主机) = 该主机下有任一接口在熔断; isOpen(完整URL) = 这个接口在熔断 */
  function anyOpen(q) { if (/^https?:/.test(q)) { var b = B[keyOf(q)]; return !!(b && isOpen(b)); } return Object.keys(B).some(function (k) { return B[k].h === q && isOpen(B[k]); }); }
  window.jlReq = { jsonp: jsonp, json: json, stats: stats, isOpen: anyOpen, _cfg: { FAILN: FAILN, COOL: COOL } };
})();
