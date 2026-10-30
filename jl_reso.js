/* jl_reso.js v1 — 今日共振位
 * 来源(按"种类"数, 同种类多个价位只算一种): atr=ATR带上下沿 / prevHL=昨高低 / hl5=昨天之前4日高低 / gap=未补缺口边 / fib=斐波档
 * 合并: 相差<=0.2×ATR 并成一簇, 取均价; 只显示>=2种来源, >=3种=强共振
 * 台账: localStorage jl_reso_log_v1, 每天每票一条, 含同数量随机对照组; 留60天
 * 依赖: index.html 里提供 window.jlResoInputJL(code) → {bars:[{t,o,h,l,c}], cur, atrBand?:{up,dn}, gaps?:[价格,...]}
 * 回滚: 删 index.html 里引用本文件的一行 + jlResoInputJL 接口
 * upTo: compute(code, 'YYYY-MM-DD') 只用该日及之前日K(给 jl_trule); 截面早于最新日K时 hist=1, 不用斐波/缺口/ATR带
 * jl-memo2: 日K末根收盘与今日报价反推昨收不符(>0.3%) → 标 stale 写原因, 每次刷新重算, 对上了才换成正式; stale 不进命中统计
 */
(function () {
  var KEY = 'jl_reso_log_v1', KEEP = 60, MERGE = 0.2, NEAR = 0.003, TOUCH = 0.05;
  var NAME = { atr: 'ATR', prevHL: '昨高低', hl5: '五日高低', gap: '缺口', fib: '斐波' };
  var alerted = {};

  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function mins() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function day(t) { return String(t).slice(0, 10); }
  function f2(v) { return Number(v).toFixed(2); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(L) {
    try {
      var ks = Object.keys(L).sort();
      while (ks.length > KEEP) delete L[ks.shift()];
      localStorage.setItem(KEY, JSON.stringify(L));
    } catch (e) { }
  }

  function atr5(bars) {
    if (bars.length < 6) return 0;
    var tr = [];
    for (var i = 1; i < bars.length; i++) {
      var b = bars[i], pc = bars[i - 1].c;
      tr.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    }
    var a = 0, k;
    for (k = 0; k < 5; k++) a += tr[k];
    a /= 5;
    for (k = 5; k < tr.length; k++) a = (a * 4 + tr[k]) / 5;
    return a;
  }

  function cluster(cands, atr, minSrc) {
    var gap = MERGE * atr, s = cands.slice().sort(function (a, b) { return a.p - b.p; }), gs = [];
    s.forEach(function (c) {
      var g = gs[gs.length - 1];
      if (g && c.p - g.mean <= gap) {
        g.items.push(c);
        g.mean = g.items.reduce(function (t, x) { return t + x.p; }, 0) / g.items.length;
      } else gs.push({ items: [c], mean: c.p });
    });
    return gs.map(function (g) {
      var seen = {}, srcs = [];
      g.items.forEach(function (x) { if (!seen[x.src]) { seen[x.src] = 1; srcs.push(x.src); } });
      return { p: +g.mean.toFixed(2), n: srcs.length, srcs: srcs, hit: 0 };
    }).filter(function (x) { return x.n >= minSrc; });
  }

  function rng(seed) {
    var h = 0, i;
    for (i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return function () { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  }

  function touched(p, hi, lo, atr) { return lo <= p + TOUCH * atr && hi >= p - TOUCH * atr; }

  function build(code, upTo) { /* upTo='YYYY-MM-DD': 只用该日(含)及之前的日K, 给 jl_trule 盘后生成次日计划用; 不传=原行为(今天之前) */
    var inp = window.jlResoInputJL && window.jlResoInputJL(code);
    if (!inp || !inp.bars) return null;
    var t = upTo || today(), bars = inp.bars.filter(function (b) { return upTo ? day(b.t) <= upTo : day(b.t) < t; });
    if (bars.length < 8) return null;
    var last = bars[bars.length - 1], atr = atr5(bars);
    if (!(atr > 0)) return null;
    var lastAll = day(inp.bars[inp.bars.length - 1].t), hist = !!upTo && lastAll > upTo; /* hist=过去某天的截面: 斐波/缺口/ATR带只有当前值, 不能当历史真值, 一律不用 */
    var ck = inp.prev > 0 && !hist && day(last.t) < today(); /* 今日报价反推的昨收只能核对"今天之前最后一根" */
    var c = [];
    var band = (!hist && inp.atrBand) || { up: last.c + atr, dn: last.c - atr };
    c.push({ p: band.up, src: 'atr' }, { p: band.dn, src: 'atr' });
    c.push({ p: last.h, src: 'prevHL' }, { p: last.l, src: 'prevHL' });
    var w = bars.slice(-5, -1); /* 昨天之前4日: 否则昨天恰是五日高时会自己凑出"两重" */
    if (w.length) {
      c.push({ p: Math.max.apply(null, w.map(function (b) { return b.h; })), src: 'hl5' });
      c.push({ p: Math.min.apply(null, w.map(function (b) { return b.l; })), src: 'hl5' });
    }
    (hist ? [] : (inp.gaps || [])).forEach(function (p) { if (p > 0) c.push({ p: p, src: 'gap' }); });
    if (!hist) try {
      var F = window.jlFibLvJL ? window.jlFibLvJL(code) : null;
      if (F && F.lv) F.lv.forEach(function (l) { if (l.v > 0) c.push({ p: l.v, src: 'fib' }); });
    } catch (e) { }
    c = c.filter(function (x) { return x.p > 0 && isFinite(x.p); });
    var levels = cluster(c, atr, 2);
    var r = rng(t + code), lo = last.c - 1.5 * atr, hi = last.c + 1.5 * atr;
    var ctrl = levels.map(function () { return { p: +(lo + r() * (hi - lo)).toFixed(2), hit: 0 }; });
    return {
      at: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
      pc: last.c, pd: day(last.t), atr: +atr.toFixed(3), levels: levels, ctrl: ctrl, final: 0,
      chk: ck ? 1 : 0, hist: hist,
      stale: ck && Math.abs(last.c - inp.prev) / inp.prev > 0.003 ? '日K停在' + day(last.t).slice(5) + '(收' + f2(last.c) + ')，今日昨收' + f2(inp.prev) : ''
    };
  }

  function ensure(code) {
    var d = new Date().getDay();
    if (d === 0 || d === 6) return null;
    var L = load(), t = today();
    var old = L[t] && L[t][code];
    if (old && (old.final || (old.chk && !old.stale))) return old;
    var e = build(code);
    if (!e) return old || null;
    if (old && !e.chk) return old; /* 还核对不了(报价未到今日), 先留旧的 */
    L[t] = L[t] || {};
    L[t][code] = e;
    save(L);
    return e;
  }

  /* 用今天日K的高低更新"是否碰到"(碰到只增不减); 15:10后定稿 */
  function settle(code) {
    var L = load(), t = today(), e = L[t] && L[t][code];
    if (!e || e.final) return e;
    var inp = window.jlResoInputJL && window.jlResoInputJL(code);
    var tb = inp && inp.bars && inp.bars.filter(function (b) { return day(b.t) === t; }).pop();
    if (!tb) return e;
    e.levels.forEach(function (x) { if (!x.hit && touched(x.p, tb.h, tb.l, e.atr)) x.hit = 1; });
    e.ctrl.forEach(function (x) { if (!x.hit && touched(x.p, tb.h, tb.l, e.atr)) x.hit = 1; });
    if (mins() >= 910) e.final = 1;
    save(L);
    return e;
  }

  function stats() {
    var L = load(), n = 0, a = 0, ah = 0, b = 0, bh = 0, days = {};
    Object.keys(L).forEach(function (d) {
      Object.keys(L[d]).forEach(function (c) {
        var e = L[d][c];
        if (!e.final || e.stale) return;
        days[d] = 1;
        e.levels.forEach(function (x) { a++; ah += x.hit; });
        e.ctrl.forEach(function (x) { b++; bh += x.hit; });
        n++;
      });
    });
    return {
      days: Object.keys(days).length, cards: n,
      real: a ? ah / a : null, ctrl: b ? bh / b : null, realN: a, ctrlN: b
    };
  }

  var CSS = '.jlReso{padding:6px 2px;font-size:12px;color:#eef9fc}.jlReso h4{margin:0 0 6px;font-size:12px;font-weight:700}' +
    '.jlReso .rw{display:flex;align-items:baseline;gap:8px;padding:3px 6px;border-left:3px solid #8a96a8;margin:2px 0;border-radius:4px}' +
    '.jlReso .rw.s{border-color:#ffd21f}.jlReso .rw b{font-size:14px;font-variant-numeric:tabular-nums}.jlReso .rw.s b{color:#ffd21f}' +
    '.jlReso .rw small{opacity:.75;font-size:10.5px}.jlReso .rw.hit{opacity:.55}' +
    '.jlReso .cur{display:flex;align-items:center;gap:6px;margin:4px 0}.jlReso .cur i{width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 6px #fff}' +
    '.jlReso .cur span{flex:1;height:1px;background:#ffffff40}.jlReso .rw.near{animation:jlResoBlink 1s ease-in-out infinite}' +
    '@keyframes jlResoBlink{50%{background:#ffd21f33}}.jlReso .ft{opacity:.6;font-size:10px;margin-top:4px}';

  function render(host, code) {
    if (!host) return;
    if (!document.getElementById('jlResoCss')) {
      var st = document.createElement('style'); st.id = 'jlResoCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    var e = ensure(code) && settle(code);
    var inp = window.jlResoInputJL && window.jlResoInputJL(code);
    var cur = inp && Number(inp.cur) || 0;
    if (!e || !e.levels.length) {
      host.innerHTML = '<div class="jlReso"><h4>今日共振位</h4><div class="ft">' + (e ? '今天没有两种以上来源重合的价位' : '数据不足或休市') + '</div></div>';
      return;
    }
    var up = e.levels.filter(function (x) { return x.p > cur; }).slice(0, 3).reverse();
    var dn = e.levels.filter(function (x) { return x.p <= cur; }).slice(-3).reverse();
    var t = today();
    function row(x) {
      var near = cur > 0 && Math.abs(cur - x.p) / x.p < NEAR;
      if (near) {
        var k = t + code + x.p;
        if (!alerted[k]) {
          alerted[k] = 1;
          try { window.dispatchEvent(new CustomEvent('jlreso:near', { detail: { code: code, p: x.p, n: x.n, srcs: x.srcs } })); } catch (er) { }
        }
      }
      return '<div class="rw' + (x.n >= 3 ? ' s' : '') + (x.hit ? ' hit' : '') + (near ? ' near' : '') + '"><b>' + f2(x.p) + ' ×' + x.n + '</b><small>' +
        x.srcs.map(function (s) { return NAME[s]; }).join('·') + (x.hit ? ' · 已碰' : '') + '</small></div>';
    }
    host.innerHTML = '<div class="jlReso"><h4>今日共振位</h4>' + up.map(row).join('') +
      '<div class="cur"><i></i><span></span><b>' + (cur ? f2(cur) : '—') + '</b></div>' + dn.map(row).join('') +
      '<div class="ft">昨收 ' + f2(e.pc) + ' · ATR5 ' + f2(e.atr) + ' · ' + e.at + ' 算' + (e.stale ? '<br><span style="color:#ff9f43">⚠ 过时：' + e.stale + '，等日K更新后自动重算，不进台账统计</span>' : '') + '</div></div>';
  }

  window.JLReso = { compute: build, ensure: ensure, settle: settle, render: render, stats: stats, _load: load };
})();

/* 独立卡片: 持仓页底部"今日共振位", 每只持仓一个折叠块, 30秒刷新 */
(function () {
  function list() { try { return window.jlResoCodesJL ? window.jlResoCodesJL() : []; } catch (e) { return []; } }
  function mount() {
    var holds = document.getElementById('holds');
    if (!holds || !window.JLReso) return;
    var card = document.getElementById('jlResoCardJL');
    if (!card) {
      card = document.createElement('section');
      card.className = 'glass'; card.id = 'jlResoCardJL';
      var sp = holds.querySelector('.smallPrint');
      if (sp) holds.insertBefore(card, sp); else holds.appendChild(card);
    }
    var ls = list();
    if (!ls.length) { card.innerHTML = '<h3>今日共振位</h3><div style="opacity:.6;font-size:12px">暂无持仓数据</div>'; card._sig = ''; return; }
    var sig = ls.map(function (x) { return x.code; }).join();
    if (card._sig !== sig) {
      card._sig = sig;
      card.innerHTML = '<h3>今日共振位<small>ATR·昨高低·五日·缺口·斐波</small></h3>' + ls.map(function (x, i) {
        return '<details' + (i === 0 ? ' open' : '') + '><summary style="font-weight:700;font-size:13px;margin:6px 0">' + x.name + '</summary><div data-jr="' + x.code + '"></div></details>';
      }).join('');
    }
    card.querySelectorAll('[data-jr]').forEach(function (h) { try { window.JLReso.render(h, h.getAttribute('data-jr')); } catch (e) { } });
  }
  setTimeout(mount, 3000); setTimeout(mount, 10000); setInterval(mount, 30000);
})();
