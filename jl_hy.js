/* jl_hy.js v1 (11-24) 公式C-1 HUO/YIN 柱线副图 —— 挂 jl_huo v6.5 指标钮【阴阳】, 架构同 jl_sx/jl_zd。
   公式 = 11-24 评审版(scripts/tdx_extra_review.py 公式C-1, 修复阈值):
     HUO =(C−LLV(L,60))/(HHV(H,60)−LLV(L,60))×100;  YIN1=SMA(SMA(HUO,3,1),4,1)−10  (红线, 60根位置·10);
     YIN4=(HHV(H,60)−C)/(HHV(H,60)−LLV(L,60))×100;  YIN2=SMA(SMA(YIN4,3,1),4,1)−90 (绿线, 与YIN1对称);
     火焰红块=涨幅%上穿8.8或9.8(原版18/20在主板340根0次, 评审修复为8.8/9.8);
     跌停蓝块=涨幅%<−9.9。y轴固定±100, 评审图口径逐值一致。
   阈值口径: 8.8/9.8/−9.9 是日线标定 —— 分钟级单根涨幅到8.8%≈封板开板瞬间才触发, 看火焰/跌停请切日K;
     60根窗口语义: 日=季度 / 15分≈15天 / 5分≈5天 / 1分=1天, 参数按根数平移。
   公式不用成交量/流通股本 → 喂什么周期算什么周期, 柱线与K线同 bars 逐根对齐(同 cw 同时间刻度)。
   周期/十字线/放大缩小: 与 jl_huo/sx/zd 同一套(zpPerOf 联动, zpSubXH 广播, zp_huo_big_v1)。
   独立用法: JLHy.mount(beforeEl,{code}) 自拉数据; 嵌入: st=JLHy.embedNode({code}), JLHy.feed(st,bars,lv,which,code) */
(function (W) {
  "use strict";
  var DAYN = 640, MINN = 320;
  var CSS = '.sxIn .ssx{background:rgba(255,255,255,.03);border-radius:6px;padding:3px 4px 2px;margin:0 0 3px}' +
    '.sxIn .ssl{display:flex;gap:8px;font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;font:400 10px/1.5 -apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}' +
    '.sxIn svg{display:block;width:100%;height:auto;touch-action:pan-y}';
  function injectCSS() { if (document.getElementById('zpHyCss')) return; var st = document.createElement('style'); st.id = 'zpHyCss'; st.textContent = CSS; document.head.appendChild(st); }
  function labels(B, lv) {
    var out = [], pd = '';
    for (var i = 0; i < B.length; i++) {
      var d = String(B[i].t).replace(/\D/g, '');
      if (lv === '日') out.push(d.slice(4, 6) + '-' + d.slice(6, 8));
      else { var day = d.slice(0, 8); out.push(day !== pd ? d.slice(4, 6) + '-' + d.slice(6, 8) : d.slice(8, 10) + ':' + d.slice(10, 12)); pd = day; }
    }
    return out;
  }
  function symOf(code) { code = String(code || '').replace(/\D/g, ''); if (!/^\d{6}$/.test(code)) return ''; return /^[569]/.test(code) ? 'sh' + code : 'sz' + code; }
  function bigOn() { try { return localStorage.getItem('zp_huo_big_v1') === '1'; } catch (e) { return false; } }

  /* ---------- TDX 函数 ---------- */
  function sma(x, n, m) { var r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? (m * x[i] + (n - m) * y) / n : x[0]; r.push(y); } return r; }
  function hhv(x, n, i) { var v = -1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.max(v, x[j]); return v; }
  function llv(x, n, i) { var v = 1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.min(v, x[j]); return v; }

  /* ---------- 公式主计算 (只依赖 C/H/L, 与评审脚本逐值一致) ---------- */
  function calc(bars) {
    var n = bars.length, C = [], H = [], L = [], i;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); H.push(+bars[i].h); L.push(+bars[i].l); }
    var HUO = [], YIN4 = [], qp = [];
    for (i = 0; i < n; i++) {
      var hh = hhv(H, 60, i), ll = llv(L, 60, i), dd = Math.max(hh - ll, 1e-9);
      HUO.push((C[i] - ll) / dd * 100);
      YIN4.push((hh - C[i]) / dd * 100);
      qp.push(i > 0 ? (C[i] - C[i - 1]) / C[i - 1] * 100 : 0);
    }
    var YIN1 = sma(sma(HUO, 3, 1), 4, 1).map(function (v) { return v - 10; });
    var YIN2 = sma(sma(YIN4, 3, 1), 4, 1).map(function (v) { return v - 90; });
    var hy = [], dt = [];
    for (i = 0; i < n; i++) {
      hy.push(i > 0 && ((qp[i] > 8.8 && qp[i - 1] <= 8.8) || (qp[i] > 9.8 && qp[i - 1] <= 9.8)));   /* 火焰=涨幅上穿8.8/9.8 */
      dt.push(qp[i] < -9.9);                                                                        /* 跌停日 */
    }
    return { n: n, YIN1: YIN1, YIN2: YIN2, qp: qp, hy: hy, dt: dt };
  }

  /* ---------- SVG 绘制 ---------- */
  var WD = 380, PL = 24, PR = 3;
  /* 11-24 用户「1/5/15/日各自对齐…十字线打通」: 嵌在作战屏时 jl_huo 把主图横轴(同一批K)挂 W.__zpSubAx —— 有就按主图x画(viewBox 360宽, 刻度挪右边), 没有=原来自己排90根 */
  function AXg(bars) { var A = W.__zpSubAx; A = A && A.bars === bars && A.N > 0 ? A : null; WD = A ? 360 : 380; PL = A ? A.PL : 24; PR = A ? 360 - A.PR : 3; return A; }
  function LX4() { return WD === 360 ? 359 : PL - 4; }
  function axOfSt(st) { var a = ['s1', 's2', 's3']; for (var j = 0; j < 3; j++) { var e = st && st[a[j]]; if (e && e.__ax && e.__ax.on) return e.__ax; } return null; }
  function ckOf(B) { var n = B.length, a = B[0] || {}, z = B[n - 1] || {}; return n + '|' + a.t + '|' + z.t + '|' + z.o + '|' + z.h + '|' + z.l + '|' + z.c + '|' + z.v; }
  function gridLines(g, T, Bt, lv, D, i0, N, X) {
    for (var k = 0; k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
  }
  function drawSec(el, R, bars, lv) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var T = 5, Bt = AX ? AX.H - 3 : (bigOn() ? 148 : 88), Hh = AX ? AX.H : (bigOn() ? 160 : 100), cw = AX ? AX.cw : (WD - PL - PR) / N;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var vmax = 100, vmin = -100;
    var Y = function (v) { return T + (vmax - Math.min(Math.max(v, vmin), vmax)) / (vmax - vmin) * (Bt - T); };
    var g = [], k, i;
    [[0, '0', 'rgba(255,255,255,.3)', 'dash'], [50, '50', 'rgba(255,255,255,.12)', ''], [-50, '-50', 'rgba(255,255,255,.12)', ''], [100, '100', 'rgba(255,255,255,.12)', ''], [-100, '-100', 'rgba(255,255,255,.12)', '']].forEach(function (a) {
      g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="' + a[2] + '" stroke-width=".8"' + (a[3] === 'dash' ? ' stroke-dasharray="3 3"' : '') + '/><text x="' + LX4() + '" y="' + (Y(a[0]) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#fff">' + a[1] + '</text>');
    });
    for (k = 0; k < N; k++) { i = i0 + k;
      if (R.hy[i]) g.push('<rect x="' + (X(k) - cw * 0.6).toFixed(1) + '" y="' + Y(100).toFixed(1) + '" width="' + (cw * 1.2).toFixed(2) + '" height="' + (Y(0) - Y(100)).toFixed(1) + '" fill="#ff2222" opacity=".38"/>');
      if (R.dt[i]) g.push('<rect x="' + (X(k) - cw * 0.32).toFixed(1) + '" y="' + Y(-15).toFixed(1) + '" width="' + (cw * 0.64).toFixed(2) + '" height="' + (Y(-95) - Y(-15)).toFixed(1) + '" fill="#3b7bff" opacity=".85"/>');
    }
    var pt = function (a, col, w2, op) { var s = []; for (k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return '<polyline fill="none" stroke="' + col + '" stroke-width="' + w2 + '"' + (op ? ' opacity="' + op + '"' : '') + ' points="' + s.join(' ') + '"/>'; };
    g.push(pt(R.YIN1, '#ff4444', 1.0));
    g.push(pt(R.YIN2, '#00cc66', 1.0));
    if (!AX) gridLines(g, T, Bt, lv, D, i0, N, X);
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: vmin, hi: vmax, pv: function (i) { return R.YIN1[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    var tag = (R.hy[R.n - 1] ? '<span style="color:#ff6666">火焰↑</span>' : '') + (R.dt[R.n - 1] ? '<span style="color:#6688ff">跌停▍</span>' : '');
    el.innerHTML = '<div class="ssl"><span style="color:#ff4444">YIN1 ' + R.YIN1[R.n - 1].toFixed(1) + '</span><span style="color:#00cc66">YIN2 ' + R.YIN2[R.n - 1].toFixed(1) + '</span><span style="color:#ddd">涨幅 ' + R.qp[R.n - 1].toFixed(2) + '%</span><span style="color:#8fb8ff">火焰=涨>8.8/9.8·日口径</span>' + tag + '</div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
    el.__g = { N: N, i0: i0, cw: cw, PL: PL, W: WD, T: T, Bt: Bt, R: R, D: D };
  }

  /* ---------- 十字线: 主图拖动广播 zpSubXH(key) 跟随 + 本图按住拖动, 8秒自动收 ---------- */
  var ACT = [];
  function tnOf(bars) { return bars.map(function (b) { return String(b && b.t || '').replace(/\D/g, ''); }); }
  function idxFromKey(bars, key, cache) {
    var kk = String(key || '').replace(/\D/g, ''); if (!kk) return -1;
    var tn = (cache && cache.tn) || tnOf(bars); if (cache) cache.tn = tn;
    var i;
    for (i = tn.length - 1; i >= 0; i--) if (tn[i] === kk) return i;
    if (kk.length >= 10) { for (i = tn.length - 1; i >= 0; i--) if (tn[i] && tn[i] <= kk) return i; return -1; }
    if (kk.length === 8) { for (i = tn.length - 1; i >= 0; i--) if (tn[i].slice(0, 8) === kk) return i; return -1; }
    var ld = tn.length ? tn[tn.length - 1].slice(0, 8) : '';
    for (i = tn.length - 1; i >= 0; i--) if (tn[i].slice(0, 8) === ld && tn[i].slice(8, 12) <= kk) return i;
    return tn.length - 1;
  }
  function xhDraw(st, i) {
    if (!st || !st.R || i < 0 || i >= st.R.n) return;
    var GA = axOfSt(st), N = GA ? GA.N : Math.min(90, st.R.n), i0 = GA ? GA.i0 : st.R.n - N, k = Math.max(0, Math.min(N - 1, i - i0));
    if (GA && (i < i0 || i >= i0 + N)) { xhClear(st); return; }   /* 11-24: 主图十字线在副图视窗外 → 不画 */
    var cw = (380 - 24 - 3) / N, x = (GA ? GA.X(k) : 24 + cw * (k + 0.5)).toFixed(1);
    var ln = '<line x1="' + x + '" x2="' + x + '" y1="3" y2="' + (GA ? GA.Bt + 2 : (bigOn() ? 155 : 93)) + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/>';
    var sv = st.s1 && st.s1.querySelector('svg'); if (!sv) return;
    var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ln;
    var j = i0 + k;
    if (st.s1.querySelector('.ssl')) {
      var tag = (st.R.hy[j] ? '<span style="color:#ff6666">火焰↑</span>' : '') + (st.R.dt[j] ? '<span style="color:#6688ff">跌停▍</span>' : '');
      st.s1.querySelector('.ssl').innerHTML = '<span style="color:#ff4444">YIN1 ' + st.R.YIN1[j].toFixed(1) + '</span><span style="color:#00cc66">YIN2 ' + st.R.YIN2[j].toFixed(1) + '</span><span style="color:#ddd">涨幅 ' + st.R.qp[j].toFixed(2) + '%</span>' + tag;
    }
    clearTimeout(st.__xhT); st.__xhT = setTimeout(function () { xhClear(st); }, 8000);
  }
  function xhClear(st) { var sv = st.s1 && st.s1.querySelector('svg'); if (sv) { var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ''; } }
  function xhKey(key) {
    ACT = ACT.filter(function (st) { return st.node && st.node.isConnected; });
    ACT.forEach(function (st) {
      if (!st.R || !st.bars) return;
      var i = idxFromKey(st.bars, key, st.__tnC || (st.__tnC = {}));
      if (i >= 0) xhDraw(st, i);
    });
  }
  function bindCross(st) {
    if (st.__bound) return; st.__bound = 1;
    var el = st.s1; if (!el) return;
    el.style.touchAction = 'pan-y';
    var hit = function (e) { if (axOfSt(st)) return;   /* 11-24: 嵌在作战屏时由 jl_huo 统一接手指(并驱动主图十字线) */
      if (!st.R) return;
      var sv = el.querySelector('svg'); if (!sv) return;
      var r = sv.getBoundingClientRect(); if (!r.width) return;
      var N = Math.min(90, st.R.n), i0 = st.R.n - N, cw = (380 - 24 - 3) / N;
      var x = (e.clientX - r.left) / r.width * 380;
      var k = Math.max(0, Math.min(N - 1, Math.floor((x - 24) / cw)));
      xhDraw(st, i0 + k);
    };
    el.addEventListener('pointerdown', hit);
    el.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') hit(e); });
  }

  /* ---------- 数据拉取 (同 jl_sx, 三域名轮询) ---------- */
  function fetchMinJ(code, lv, cb) {
    var sym = symOf(code); if (!sym) return cb(null, '拿不到代码');
    var MKX = { '30分': 'm30', '15分': 'm15', '5分': 'm5', '1分': 'm1' };
    var hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) return cb(null, '三个域名都没通');
      var h = hosts[i++];
      var x = new XMLHttpRequest(); x.timeout = 8000;
      x.open('GET', 'https://' + h + '/appstock/app/kline/mkline?param=' + sym + ',' + MKX[lv] + ',,' + MINN + '&_t=' + Date.now());
      x.onload = function () {
        try { var nn = JSON.parse(x.responseText).data[sym]; var rows = nn && (nn[MKX[lv]] || nn[MKX[lv] + 'qfq']);
          if (rows && rows.length) return cb(rows.map(function (r) { return { t: String(r[0]), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] || 0 }; }));
        } catch (e) { }
        nx();
      };
      x.onerror = function () { nx(); };
      try { x.send(); } catch (e) { nx(); }
    })();
  }
  function fetchDayJ(code, cb) {
    var sym = symOf(code); if (!sym) return cb(null, '拿不到代码');
    var hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) return cb(null, '三个域名都没通');
      var h = hosts[i++];
      var x = new XMLHttpRequest(); x.timeout = 8000;
      x.open('GET', 'https://' + h + '/appstock/app/fqkline/get?param=' + sym + ',day,,,' + DAYN + ',qfq&_t=' + Date.now());
      x.onload = function () {
        try { var nn = JSON.parse(x.responseText).data[sym]; var rows = nn && (nn.qfqday || nn.day);
          if (rows && rows.length) return cb(rows.map(function (r) { return { t: String(r[0]).replace(/\D/g, '').slice(0, 12), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] || 0 }; }));
        } catch (e) { }
        nx();
      };
      x.onerror = function () { nx(); };
      try { x.send(); } catch (e) { nx(); }
    })();
  }

  /* ---------- 嵌入模式 (jl_huo v6.5 调用) ---------- */
  function embedNode(opts) {
    injectCSS();
    var node = document.createElement('div'); node.className = 'sxIn';
    node.innerHTML = '<div class="ssx"></div>';
    var st = { node: node, s1: node.querySelector('.ssx'), opt: opts || {}, code: (opts && opts.code) || '', bars: null, lv: null, which: '阴阳', at: 0 };
    return st;
  }
  function feed(st, bars, lv, which, code) {
    if (!st) return;
    st.bars = bars; st.lv = lv; if (which) st.which = which; if (code) st.code = code;
    if (st.code && symOf(st.code)) st.code = symOf(st.code).slice(2);
    function draw() {
      if (!st.bars || st.bars.length < 40) { st.s1.innerHTML = '<div class="ssl"><span style="color:#8fb8ff">K线还没到（≥40根）</span></div>'; return; }
      try { var ck0 = ckOf(st.bars) + '|' + (st.cap || 0); if (!st.R || st.__ck !== ck0) { st.R = calc(st.bars); st.__ck = ck0; }   /* 11-24: 同一批K不重算(主图拖动时每帧重画) */ drawSec(st.s1, st.R, st.bars, st.lv); }
      catch (e) { st.s1.innerHTML = '<div class="ssl"><span style="color:#ff8888">计算出错: ' + e.message + '</span></div>'; }
    }
    draw();
    st.at = Date.now();
    if (ACT.indexOf(st) < 0) ACT.push(st);
    bindCross(st);
  }

  /* ---------- 独立 mount ---------- */
  var LVHY = ['日', '30分', '15分', '5分', '1分'];
  function mount(before, opts) {
    if (!before || !before.parentNode) return null;
    injectCSS();
    opts = opts || {};
    var host = document.createElement('section'); host.id = 'zpHyJL'; host.setAttribute('aria-label', 'HUO/YIN阴阳柱线副图');
    host.innerHTML = '<div class="hh" style="display:flex;align-items:center;gap:7px;height:19px;white-space:nowrap;overflow:hidden;color:#fff;font:400 11px/1.35 -apple-system,sans-serif"><span style="font-weight:500">阴阳柱线 · 火焰/跌停</span><span class="hps" style="display:inline-flex;gap:3px;flex:none">' + LVHY.map(function (l) { return '<button class="hp' + (l === '日' ? ' on' : '') + '" data-lv="' + l + '" type="button" style="background:none;border:1px solid rgba(255,255,255,.25);border-radius:6px;color:rgba(255,255,255,.7);font:400 9.5px/1.5 -apple-system,sans-serif;padding:0 5px;cursor:pointer' + (l === '日' ? ';border-color:#2fd17a;color:#2fd17a' : '') + '">' + (l === '日' ? '日' : l.replace('分', '')) + '</button>'; }).join('') + '</span><span class="hs" style="margin-left:auto;font-size:10.5px">火焰/跌停=日口径 · 分钟级参考</span><button class="hf" type="button" aria-label="折叠" style="flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center">−</button></div>';
    before.parentNode.insertBefore(host, before);
    var st = embedNode({ code: opts.code || '' });
    st.node.style.display = ''; host.appendChild(st.node);
    var lv = '日';
    function load() {
      if (lv === '日') fetchDayJ(st.code, function (b) { if (b) feed(st, b, '日', '阴阳', st.code); else host.querySelector('.hs').textContent = '日K拉不到'; });
      else fetchMinJ(st.code, lv, function (b) { if (b) feed(st, b, lv, '阴阳', st.code); else host.querySelector('.hs').textContent = lv + 'K拉不到(自动重试)'; });
    }
    host.addEventListener('click', function (e) {
      var p = e.target && e.target.closest && e.target.closest('.hp');
      if (p) { lv = p.getAttribute('data-lv'); host.querySelectorAll('.hp').forEach(function (b2) { b2.classList.toggle('on', b2 === p); }); load(); return; }
      var f = e.target && e.target.closest && e.target.closest('.hf');
      if (f) host.classList.toggle('fold');
    });
    if (opts.bars) feed(st, opts.bars, '日', '阴阳', st.code); else load();
    host.__st = st; host.__load = load;
    return host;
  }

  W.JLHy = { version: 'v1', calc: calc, mount: mount, embedNode: embedNode, feed: feed, labels: labels, xhKey: xhKey };
})(window);
