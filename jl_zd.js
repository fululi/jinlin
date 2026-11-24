/* jl_zd.js v1 (11-24) 趋势+入场/准备中 + 庄控 双副图 —— 挂 jl_huo v6.4 指标钮【趋势|庄控】, 架构同 jl_sx。
   公式(公众号"靠谱版"评审后精选, 原 B 公式砍掉泛滥的启明星):
     sec1 趋势: SHEN3=3×SMA((C−LLV55)/(HHV55−LLV55)×100,5,1)−2×SMA(SMA(..),3,1), 趋势=EMA(SHEN3,3)−10;
       入场=FILTER(趋势<=13 且 (趋势−REF)/REF×100>13, 10根内首次), 蓝柱0-50+文字;
       准备中=FILTER(趋势<=13, 15根内首次) 文字; 抄底黄柱 SHUI7=IF(SHUI6>0 且 上行 且 C/HHV120≤88, SHUI6,0),
       SHUI6=DMA(日内位置, V/流通股本)×60 (原 DYNAINFO(7) 现价 → 当日收盘近似, 盘中最后一根略偏);
       顶部灰柱: 趋势>=90 且 上行。
     sec2 庄控: W=DMA(WINNER(C), V/流通股本)×100 (WINNER=换手衰减三角分布筹码模型600档, 与 jl_sx 同源),
       庄控=(W−EMA(W,6))×10 COLORSTICK: 红=控盘增强, 绿=出货衰减。
     流通股本实时取 qt.gtimg.cn(缓存12h), opts.cap 可直传(股); v 口径=手。
   周期/十字线/放大缩小: 与 jl_huo/sx 同一套(zpPerOf 联动, zpSubXH 广播, zp_huo_big_v1)。
   独立用法: JLZd.mount(beforeEl, {code}) 自拉数据; 嵌入: st=JLZd.embedNode({code}), JLZd.feed(st, bars, lv, which, code) */
(function (W) {
  "use strict";
  var GRIDN = 600;
  function tdc(c6) { return "#" + c6.slice(4, 6) + c6.slice(2, 4) + c6.slice(0, 2); }
  function labels(bars, lv) {
    var out = [], pd = '';
    for (var i = 0; i < bars.length; i++) {
      var d = String(bars[i] && bars[i].t || '').replace(/\D/g, '');
      if (lv === '日') out.push(d.slice(4, 6) + '-' + d.slice(6, 8));
      else { var day = d.slice(0, 8); out.push(day !== pd ? d.slice(4, 6) + '-' + d.slice(6, 8) : d.slice(8, 10) + ':' + d.slice(10, 12)); pd = day; }
    }
    return out;
  }
  function sma(x, n, m) { var r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? (m * x[i] + (n - m) * y) / n : x[0]; r.push(y); } return r; }
  function ema(x, n) { var a = 2 / (n + 1), r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? a * x[i] + (1 - a) * y : x[0]; r.push(y); } return r; }
  function dma(x, a) { var r = [], y; for (var i = 0; i < x.length; i++) { var q = Math.max(1e-4, Math.min(1, a[i])); y = i ? q * x[i] + (1 - q) * y : x[0]; r.push(y); } return r; }
  function hhv(x, n, i) { var v = -1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.max(v, x[j]); return v; }
  function llv(x, n, i) { var v = 1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.min(v, x[j]); return v; }
  function filterSig(x, n) { var out = [], last = -999; for (var i = 0; i < x.length; i++) { if (x[i] && i - last >= n) { out.push(true); last = i; } else out.push(false); } return out; }
  function chipModel(bars, cap) {
    var n = bars.length, C = [], O = [], H = [], L = [], V = [], i;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); O.push(+bars[i].o); H.push(+bars[i].h); L.push(+bars[i].l); V.push(+bars[i].v || 0); }
    var lo = Math.min.apply(null, L) * 0.92, hi = Math.max.apply(null, H) * 1.08;
    if (!(hi > lo)) hi = lo + 0.01;
    var G = [], dist = new Float64Array(GRIDN), step = (hi - lo) / (GRIDN - 1);
    for (i = 0; i < GRIDN; i++) G.push(lo + step * i);
    function cdf(p) { var k = 0; while (k < GRIDN && G[k] <= p) k++; return k; }
    function addTri(p0, p1, pk, w) {
      var i0 = cdf(p0), i1 = cdf(p1);
      if (i1 <= i0) { dist[Math.min(Math.max(i0, 0), GRIDN - 1)] += w; return; }
      var s = 0, wgt = new Float64Array(i1 - i0 + 1), j;
      for (j = i0; j <= i1; j++) { var t = G[j] <= pk ? (G[j] - p0) / Math.max(pk - p0, 1e-9) : (p1 - G[j]) / Math.max(p1 - pk, 1e-9); wgt[j - i0] = Math.max(0, Math.min(1, t)); s += wgt[j - i0]; }
      if (s > 0) for (j = i0; j <= i1; j++) dist[j] += w / s * wgt[j - i0];
    }
    var wc = [];
    addTri(L[0], H[0], C[0], 1.0);
    for (i = 0; i < n; i++) {
      var t = Math.min(Math.max(V[i] * 100 / cap, 0), 0.999);
      var k1 = cdf(C[i]), s0 = 0, j;
      for (j = 0; j < GRIDN; j++) s0 += dist[j];
      if (s0 > 0) for (j = 0; j < GRIDN; j++) dist[j] *= 1 / s0;
      wc.push(s0 > 0 ? dist.slice(0, k1 + 1).reduce(function (a, b) { return a + b; }, 0) : 0);
      dist = dist.map(function (d) { return d * (1 - t); });
      addTri(L[i], H[i], C[i], t);
    }
    return { wc: wc };
  }
  /* ---------- 主计算 ---------- */
  function calc(bars, cap) {
    var n = bars.length, C = [], H = [], L = [], V = [], i;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); H.push(+bars[i].h); L.push(+bars[i].l); V.push((+bars[i].v || 0) * 100); }
    cap = cap || 1e10;
    var CM = chipModel(bars, cap), wc = CM.wc;
    var Wd = dma(wc, V.map(function (v) { return v / cap; })).map(function (v) { return v * 100; });
    var 庄控 = ema(Wd, 6).map(function (e, k) { return (Wd[k] - e) * 10; });
    /* 趋势(55周期KDJ型) */
    var w55 = [];
    for (i = 0; i < n; i++) w55.push(100 * (C[i] - llv(L, 55, i)) / Math.max(hhv(H, 55, i) - llv(L, 55, i), 0.001));
    var s1 = sma(w55, 5, 1), s2 = sma(s1, 3, 1);
    var SHEN3 = s1.map(function (v, k) { return 3 * v - 2 * s2[k]; });
    var 趋势 = ema(SHEN3, 3).map(function (v) { return v - 10; });
    var SHEN4 = [0];
    for (i = 1; i < n; i++) SHEN4.push(趋势[i - 1] !== 0 ? (趋势[i] - 趋势[i - 1]) / Math.abs(趋势[i - 1]) * 100 : 0);
    var 入场X = [], 准备X = [];
    for (i = 0; i < n; i++) { 准备X.push(趋势[i] <= 13); 入场X.push(趋势[i] <= 13 && SHEN4[i] > 13); }
    var 入场 = filterSig(入场X, 10), 准备 = filterSig(准备X, 15);
    var 入场柱 = [], 顶柱 = [];
    for (i = 0; i < n; i++) { 入场柱.push(入场X[i]); 顶柱.push(趋势[i] >= 90 && SHEN4[i] > 0); }
    /* 抄底黄柱 SHUI7 (DYNAINFO(7)现价 → 当日收盘近似) */
    var sh3 = [], sh5 = [];
    for (i = 0; i < n; i++) {
      var hv120 = hhv(H, 120, i);
      sh3.push(C[i] / Math.max(hv120, 1e-9));
      sh5.push(L[i] > C[i] ? 0 : (H[i] < C[i] ? 1 : (C[i] - L[i] + 0.009) / Math.max(H[i] - L[i] + 0.009, 1e-9)));
    }
    sh3 = sma(sh3, 3, 1).map(function (v) { return v * 100; });
    var sh6 = dma(sh5, V.map(function (v) { return v / cap; })).map(function (v) { return v * 60; });
    var SHUI7 = [];
    for (i = 0; i < n; i++) SHUI7.push(sh6[i] > 0 && i > 0 && sh6[i] > sh6[i - 1] && sh3[i] <= 88 ? sh6[i] : 0);
    /* v1.2: 多空四线 (B公式 JIU体系: 多=JIU12 空=JIU13 多均/空均=EMA4) */
    function maN(x, nn) { var r = [], s = 0; for (var k = 0; k < x.length; k++) { s += x[k]; if (k >= nn) s -= x[k - nn]; r.push(s / Math.min(nn, k + 1)); } return r; }
    var m34 = maN(C, 34), m42 = maN(C, 42), m67 = maN(C, 67), J3b = [];
    for (i = 0; i < n; i++) J3b.push(((C[i] - m34[i]) / m34[i] * 500 + (C[i] - m42[i]) / m42[i] * 500) / 2 - (C[i] - m67[i]) / m67[i] * 500);
    function wrN(nn) { var r = []; for (var k = 0; k < n; k++) { var hh = -1e18, ll = 1e18; for (var j = Math.max(0, k - nn + 1); j <= k; j++) { hh = Math.max(hh, H[j]); ll = Math.min(ll, L[j]); } r.push(hh > ll ? -100 * (hh - C[k]) / (hh - ll) : 0); } return r; }
    var w34 = wrN(34), w42 = wrN(42), w72 = wrN(72), J7raw = [];
    for (i = 0; i < n; i++) J7raw.push((w34[i] + w42[i]) / 2 - w72[i]);
    var J7e = ema(J7raw, 6);
    var up = [0], ab = [0];
    for (i = 1; i < n; i++) { var d0 = C[i] - C[i - 1]; up.push(Math.max(d0, 0)); ab.push(Math.abs(d0)); }
    var r9 = sma(up, 19, 1), a9 = sma(ab, 19, 1), r34b = sma(up, 34, 1), a34b = sma(ab, 34, 1), r72 = sma(up, 72, 1), a72 = sma(ab, 72, 1);
    var duoRaw5 = [];
    for (i = 0; i < n; i++) {
      var j9 = (r9[i] / Math.max(a9[i], 1e-9) * 100 - 50) * 1.25, j10 = (r34b[i] / Math.max(a34b[i], 1e-9) * 100 - 50) * 1.25, j11 = (r72[i] / Math.max(a72[i], 1e-9) * 100 - 50) * 1.25;
      duoRaw5.push(((j9 + j10) / 2 - j11) * 5);
    }
    var duo = ema(duoRaw5, 6), kong = [], duoAvg, kongAvg, 穿 = [false], 穿空 = [false];
    for (i = 0; i < n; i++) kong.push(-((J7e[i] + J3b[i] + duo[i]) / 3) * 1.5);
    duoAvg = ema(duo, 4); kongAvg = ema(kong, 4);
    for (i = 1; i < n; i++) {
      穿.push(duo[i] > kongAvg[i] && duo[i - 1] <= kongAvg[i - 1]);            /* 多上穿空均=多方攻击(红) */
      穿空.push(kong[i] > duoAvg[i] && kong[i - 1] <= duoAvg[i - 1]);          /* 空上穿多均=空头攻击(绿) */
    }
    return { n: n, 趋势: 趋势, 庄控: 庄控, 入场: 入场, 入场柱: 入场柱, 准备: 准备, SHUI7: SHUI7, 顶柱: 顶柱, W: Wd,
      多: duo, 空: kong, 多均: duoAvg, 空均: kongAvg, 穿: 穿, 穿空: 穿空 };
  }

  /* ---------- 绘制 ---------- */
  var WD = 380, PL = 24, PR = 3;
  /* 11-24 用户「1/5/15/日各自对齐…十字线打通」: 嵌在作战屏时 jl_huo 把主图横轴(同一批K)挂 W.__zpSubAx —— 有就按主图x画(viewBox 360宽, 刻度挪右边), 没有=原来自己排90根 */
  function AXg(bars) { var A = W.__zpSubAx; A = A && A.bars === bars && A.N > 0 ? A : null; WD = A ? 360 : 380; PL = A ? A.PL : 24; PR = A ? 360 - A.PR : 3; return A; }
  function LX4() { return WD === 360 ? 359 : PL - 4; }
  function axOfSt(st) { var a = ['s1', 's2', 's3']; for (var j = 0; j < 3; j++) { var e = st && st[a[j]]; if (e && e.__ax && e.__ax.on) return e.__ax; } return null; }
  function ckOf(B) { var n = B.length, a = B[0] || {}, z = B[n - 1] || {}; return n + '|' + a.t + '|' + z.t + '|' + z.o + '|' + z.h + '|' + z.l + '|' + z.c + '|' + z.v; }
  function bigOn() { try { return localStorage.getItem('zp_huo_big_v1') === '1'; } catch (e) { return false; } }
  function gridLines(g, T, Bt, yv, lv, D, i0, N, xF) {
    for (var k = 0; k < N; k += Math.ceil(N / 5)) g.push('<text x="' + xF(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
  }
  function drawSec1(el, R, bars, lv) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(W.__zpHuoN || 90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var big = bigOn(), T = 5, Bt = AX ? AX.H - 3 : (big ? 148 : 88), Hh = AX ? AX.H : (big ? 160 : 100), cw = AX ? AX.cw : (WD - PL - PR) / N;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var vmax = 115, vmin = -18;
    var Y = function (v) { return T + (vmax - Math.min(Math.max(v, vmin), vmax)) / (vmax - vmin) * (Bt - T); };
    var g = [];
    [[0, '0'], [50, '50'], [90, '90']].forEach(function (a) {
      g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="rgba(255,255,255,.14)" stroke-width=".8"/>');
      g.push('<text x="' + LX4() + '" y="' + (Y(a[0]) + 3).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#8aa">' + a[1] + '</text>');
    });
    for (var k = 0; k < N; k++) { var i = i0 + k; if (R.SHUI7[i] > 0) g.push('<rect x="' + (X(k) - cw * 0.6).toFixed(1) + '" y="' + Y(0).toFixed(1) + '" width="' + (cw * 1.2).toFixed(2) + '" height="' + Math.max(1, Y(0) - Y(R.SHUI7[i])).toFixed(1) + '" fill="rgba(255,221,0,.8)"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.入场柱[i]) g.push('<rect x="' + (X(k) - cw * 0.7).toFixed(1) + '" y="' + Y(50).toFixed(1) + '" width="' + (cw * 1.4).toFixed(2) + '" height="' + (Y(0) - Y(50)).toFixed(1) + '" fill="' + tdc('0099FF') + '"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.顶柱[i]) g.push('<rect x="' + (X(k) - cw * 0.7).toFixed(1) + '" y="' + Y(30).toFixed(1) + '" width="' + (cw * 1.4).toFixed(2) + '" height="' + (Y(0) - Y(30)).toFixed(1) + '" fill="#777"/>'); }
    var pt = function (a, col, w2) { var s = []; for (k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return '<polyline fill="none" stroke="' + col + '" stroke-width="' + w2 + '" points="' + s.join(' ') + '"/>'; };
    g.push(pt(R.趋势, tdc('FF0000'), 1.4));
    for (k = 0; k < N; k++) { i = i0 + k; if (R.准备[i]) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Y(30) - 2).toFixed(1) + '" text-anchor="middle" font-size="9.5" fill="#c90" stroke="#000" stroke-width=".5" paint-order="stroke">准备中</text>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.入场[i]) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Y(60) - 2).toFixed(1) + '" text-anchor="middle" font-size="9.5" fill="#09f" stroke="#000" stroke-width=".5" paint-order="stroke">入场</text>'); }
    for (k = 0; !AX && k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: vmin, hi: vmax, pv: function (i) { return R.趋势[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    el.innerHTML = '<div class="ssl"><span style="color:#ff5c5c">趋势 ' + R.趋势[R.n - 1].toFixed(1) + '</span><span style="color:#09f">入场' + (R.入场[R.n - 1] ? '●' : '') + '</span><span style="color:#dd0">抄底' + (R.SHUI7[R.n - 1] > 0 ? '●' : '') + '</span></div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
  }
  function drawSec2(el, R, bars, lv) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(W.__zpHuoN || 90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var big = bigOn(), T = 5, Bt = AX ? AX.H - 3 : (big ? 148 : 88), Hh = AX ? AX.H : (big ? 160 : 100), cw = AX ? AX.cw : (WD - PL - PR) / N;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var pk = 1;
    for (var k = 0; k < N; k++) pk = Math.max(pk, Math.abs(R.庄控[i0 + k]));
    pk = Math.max(10, pk * 1.15);
    var Y = function (v) { return T + (pk - Math.min(Math.max(v, -pk), pk)) / (2 * pk) * (Bt - T); };
    var g = [];
    g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="rgba(255,255,255,.2)" stroke-width=".8"/>');
    for (k = 0; k < N; k++) { var i = i0 + k; var v = R.庄控[i]; var yv = Y(v), y0 = Y(0); g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + Math.min(yv, y0).toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + Math.max(.8, Math.abs(y0 - yv)).toFixed(1) + '" fill="' + (v > 0 ? tdc('FF4444') : tdc('44FF77')) + '" opacity=".85"/>'); }
    for (k = 0; !AX && k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: -pk, hi: pk, pv: function (i) { return R.庄控[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    el.innerHTML = '<div class="ssl"><span style="color:#ff4444">庄控 ' + R.庄控[R.n - 1].toFixed(1) + '</span><span style="color:#8aa">红=控盘增强 绿=出货</span></div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
  }

  /* ---------- 数据 ---------- */
  function symOf(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 6) return '';
    return (/^[569]/.test(code) ? 'sh' : 'sz') + code;
  }
  function symFull(code) { var s = symOf(code); return s || (/^(sh|sz)\d{6}$/i.test(String(code)) ? String(code).toLowerCase() : ''); }
  function fetchDayJ(code, cb) {
    var sym = symFull(code); if (!sym) return cb(null, '拿不到代码');
    var hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) return cb(null, '三域名都没通');
      var h = hosts[i++];
      var x = new XMLHttpRequest(); x.timeout = 8000;
      x.open('GET', 'https://' + h + '/appstock/app/fqkline/get?param=' + sym + ',day,,,640,qfq&_t=' + Date.now());
      x.onload = function () { try { var j = JSON.parse(x.responseText), d = j.data && j.data[sym], rows = d && (d.qfqday || d.day); if (rows && rows.length) return cb(rows.map(function (r) { return { t: String(r[0]), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] || 0 }; })); } catch (e) { } nx(); };
      x.onerror = function () { nx(); };
      x.send();
    })();
  }
  function fetchMinJ(code, lv, cb) {
    var sym = symFull(code); if (!sym) return cb(null, '拿不到代码');
    var MK = { '30分': 'm30', '15分': 'm15', '5分': 'm5', '1分': 'm1' }, k = MK[lv] || 'm15';
    var hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) return cb(null, '三域名都没通');
      var h = hosts[i++];
      var x = new XMLHttpRequest(); x.timeout = 8000;
      x.open('GET', 'https://' + h + '/appstock/app/kline/mkline?param=' + sym + ',' + k + ',,320&_t=' + Date.now());
      x.onload = function () { try { var j = JSON.parse(x.responseText), d = j.data && j.data[sym], rows = d && d[k]; if (rows && rows.length) return cb(rows.map(function (r) { return { t: String(r[0]), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] || 0 }; })); } catch (e) { } nx(); };
      x.onerror = function () { nx(); };
      x.send();
    })();
  }
  function fetchCap(code, cb) {
    try { var o = JSON.parse(localStorage.getItem('zp_sx_cap_' + code) || 'null'); if (o && o.s && Date.now() - o.at < 432e5) return cb(o.s); } catch (e) { }
    var sym = symFull(code); if (!sym) return cb(0);
    var x = new XMLHttpRequest(); x.timeout = 8000;
    x.open('GET', 'https://qt.gtimg.cn/q=' + sym + '&_t=' + Date.now());
    x.onload = function () {
      try {
        var m = x.responseText.split('~');
        if (m.length > 44 && +m[3] > 0) { var cap = (+m[44]) * 1e8 / +m[3]; try { localStorage.setItem('zp_sx_cap_' + code, JSON.stringify({ s: cap, at: Date.now() })); } catch (e2) { } return cb(cap); }
      } catch (e3) { }
      cb(0);
    };
    x.onerror = function () { cb(0); };
    x.send();
  }

  /* ---------- 嵌入 + feed (jl_huo v6.4 用) ---------- */
    function drawSec3(el, R, bars, lv) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(W.__zpHuoN || 90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var T = 5, Bt = AX ? AX.H - 3 : (bigOn() ? 148 : 88), Hh = AX ? AX.H : (bigOn() ? 160 : 100), cw = AX ? AX.cw : (380 - 24 - 3) / N;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return 24 + cw * (k + 0.5); };
    var pk = 10;
    for (var k2 = 0; k2 < N; k2++) { var i2 = i0 + k2; pk = Math.max(pk, Math.abs(R.多[i2]), Math.abs(R.空[i2]), Math.abs(R.多均[i2]), Math.abs(R.空均[i2])); }
    pk *= 1.15;
    var Y = function (v) { return T + (pk - Math.min(Math.max(v, -pk), pk)) / (2 * pk) * (Bt - T); };
    var g = ['<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-dasharray="3 3"/>'];
    for (var k = 0; k < N; k++) {
      var i = i0 + k;
      if (R.穿[i]) g.push('<line x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + T + '" y2="' + Bt + '" stroke="rgba(255,60,60,.75)" stroke-width="1.2"/>');
      if (R.穿空[i]) g.push('<line x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + T + '" y2="' + Bt + '" stroke="rgba(40,220,110,.75)" stroke-width="1.2"/>');
    }
    function pt(a, col, w2) { var s2 = []; for (var k3 = 0; k3 < N; k3++) s2.push(X(k3).toFixed(1) + ',' + Y(a[i0 + k3]).toFixed(1)); return '<polyline fill="none" stroke="' + col + '" stroke-width="' + w2 + '" points="' + s2.join(' ') + '"/>'; }
    g.push(pt(R.空均, '#cc88ff', 1.3)); g.push(pt(R.多均, '#ffcc00', 1.3)); g.push(pt(R.空, tdc('00FF00'), 1.5)); g.push(pt(R.多, '#ff4444', 1.5));
    if (!AX) gridLines(g, T, Bt, null, lv, D, i0, N, X);
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: -pk, hi: pk, pv: function (i) { return R.多[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    var stTxt = R.多[R.n - 1] > R.空均[R.n - 1] ? '<span style="color:#ff4444">多方控场</span>' : '<span style="color:#33ff77">空方控场</span>';
    el.innerHTML = '<div class="ssl"><span style="color:#ff4444">多 ' + R.多[R.n - 1].toFixed(1) + '</span><span style="color:#33ff77">空 ' + R.空[R.n - 1].toFixed(1) + '</span><span style="color:#ffcc00">多均 ' + R.多均[R.n - 1].toFixed(1) + '</span><span style="color:#cc88ff">空均 ' + R.空均[R.n - 1].toFixed(1) + '</span>' + stTxt + '</div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
  }
  function embedNode(opts) {
    var node = document.createElement('div'); node.className = 'sxIn';
    node.innerHTML = '<div class="sec sec3" style="display:none"></div><div class="sec sec4" style="display:none"></div><div class="sec sec5" style="display:none"></div>';
    var st = { node: node, s1: node.querySelector('.sec3'), s2: node.querySelector('.sec4'), s3: node.querySelector('.sec5'), opt: opts || {}, code: (opts && opts.code) || '', cap: (opts && opts.cap) || 0, bars: null, lv: null, which: '趋势', R: null, at: 0 };
    return st;
  }
  function showWhich(st) { st.s1.style.display = (st.which === '趋势' || st.which === '庄控') ? (st.which === '趋势' ? '' : 'none') : (st.which === '多空' ? 'none' : 'none'); st.s2.style.display = st.which === '庄控' ? '' : 'none'; st.s3.style.display = (st.which === '趋势' || st.which === '多空') ? '' : 'none'; }
  function feed(st, bars, lv, which, code) {
    if (!st) return;
    st.bars = bars; st.lv = lv; if (which) st.which = which; if (code) st.code = code;
    if (st.code && symOf(st.code)) st.code = symOf(st.code).slice(2);
    function draw() {
      if (!st.bars || st.bars.length < 60) { st.s1.innerHTML = st.s2.innerHTML = '<div class="ssl"><span style="color:#8fb8ff">K线还没到（≥60根，55窗预热）</span></div>'; return; }
      try {
        var ck0 = ckOf(st.bars) + '|' + (st.cap || 0); if (!st.R || st.__ck !== ck0) { st.R = calc(st.bars, st.cap); st.__ck = ck0; }   /* 11-24: 同一批K不重算(主图拖动时每帧重画) */
        drawSec1(st.s1, st.R, st.bars, st.lv);
        drawSec2(st.s2, st.R, st.bars, st.lv);
        drawSec3(st.s3, st.R, st.bars, st.lv);
      } catch (e) { st.s1.innerHTML = '<div class="ssl"><span style="color:#ff8888">计算出错: ' + e.message + '</span></div>'; }
    }
    if (!st.cap && st.code && !(st.__capAt && st.__capCode === st.code && Date.now() - st.__capAt < 60000)) { st.__capAt = Date.now(); st.__capCode = st.code; fetchCap(st.code, function (c) { if (c > 0) st.cap = c; draw(); }); }   /* 11-24: 取股本在路上/失败后60秒内不重发(原来每重画一次发一个) */
    draw();
    showWhich(st);
    st.at = Date.now();
    if (ACT.indexOf(st) < 0) ACT.push(st);
    bindCross(st);
  }

  /* ---------- 十字线 (同 jl_sx v1.2 体系) ---------- */
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
    var GA = axOfSt(st), N = GA ? GA.N : Math.min(W.__zpHuoN || 90, st.R.n), i0 = GA ? GA.i0 : st.R.n - N, k = Math.max(0, Math.min(N - 1, i - i0));
    if (GA && (i < i0 || i >= i0 + N)) { xhClear(st); return; }   /* 11-24: 主图十字线在副图视窗外 → 不画 */
    var cw = (380 - 24 - 3) / N, x = (GA ? GA.X(k) : 24 + cw * (k + 0.5)).toFixed(1);
    /* v1.3: 完整十字线 —— 趋势窗/庄控窗 各自值高度横线 + 右缘标签 */
    var qv = Math.min(Math.max(st.R.趋势[i0 + k], -20), 110), yq = 5 + (110 - qv) / 130 * (88 - 5);
    var zv = st.R.庄控[i0 + k], zc = Math.max(-50, Math.min(50, zv)), yz = 46.5 - zc / 50 * 40;
    var ln = '<line x1="' + x + '" x2="' + x + '" y1="3" y2="' + (GA ? GA.Bt + 2 : (bigOn() ? 155 : 93)) + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/>'
      + '<line x1="24" x2="356" y1="' + yq.toFixed(1) + '" y2="' + yq.toFixed(1) + '" stroke="rgba(255,92,92,.45)" stroke-width=".7"/>'
      + '<text x="354" y="' + (yq - 2).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#ffb3b3">' + st.R.趋势[i0 + k].toFixed(1) + '</text>'
      + '<line x1="24" x2="356" y1="' + yz.toFixed(1) + '" y2="' + yz.toFixed(1) + '" stroke="rgba(51,255,119,.45)" stroke-width=".7"/>'
      + '<text x="354" y="' + (yz + 8).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#aaffcc">' + zv.toFixed(1) + '</text>';
    if (GA) ln = ln.slice(0, ln.indexOf('/>') + 2);   /* 11-24: 嵌在作战屏时横线由 jl_huo 画(按手指高度/各窗自己的刻度) */
    ['s1', 's2', 's3'].forEach(function (sk) { var sv = st[sk] && st[sk].querySelector('svg'); if (sv) { var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ln; } });
    var j = i0 + k;
    if (st.s1 && st.s1.style.display !== 'none' && st.s1.querySelector('.ssl')) st.s1.querySelector('.ssl').innerHTML = '<span style="color:#ff5c5c">趋势 ' + st.R.趋势[j].toFixed(1) + '</span><span style="color:#09f">入场' + (st.R.入场[j] ? '●' : '') + '</span><span style="color:#dd0">抄底' + (st.R.SHUI7[j] > 0 ? '●' : '') + '</span>';
    if (st.s2 && st.s2.style.display !== 'none' && st.s2.querySelector('.ssl')) st.s2.querySelector('.ssl').innerHTML = '<span style="color:#ff4444">庄控 ' + st.R.庄控[j].toFixed(1) + '</span><span style="color:#8aa">红=控盘 绿=出货</span>';
    if (st.s3 && st.s3.style.display !== 'none' && st.s3.querySelector('.ssl')) st.s3.querySelector('.ssl').innerHTML = '<span style="color:#ff4444">多 ' + st.R.多[j].toFixed(1) + '</span><span style="color:#33ff77">空 ' + st.R.空[j].toFixed(1) + '</span>' + (st.R.多[j] > st.R.空均[j] ? '<span style="color:#ff4444">多方控场</span>' : '<span style="color:#33ff77">空方控场</span>');
    clearTimeout(st.__xhT); st.__xhT = setTimeout(function () { xhClear(st); }, 8000);
  }
  function xhClear(st) { ['s1', 's2', 's3'].forEach(function (sk) { var sv = st[sk] && st[sk].querySelector('svg'); if (sv) { var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ''; } }); }
  function xhKey(key) {
    ACT = ACT.filter(function (st) { return st.node && st.node.isConnected; });
    ACT.forEach(function (st) { if (!st.R || !st.bars) return; var i = idxFromKey(st.bars, key, st.__tnC || (st.__tnC = {})); if (i >= 0) xhDraw(st, i); });
  }
  function bindCross(st) {
    if (st.__bound) return; st.__bound = 1;
    [['s1', st.s1], ['s2', st.s2]].forEach(function (p) {
      var el = p[1]; if (!el) return;
      el.style.touchAction = 'pan-y';
      var hit = function (e) { if (axOfSt(st)) return;   /* 11-24: 嵌在作战屏时由 jl_huo 统一接手指(并驱动主图十字线) */
        if (!st.R) return;
        var sv = el.querySelector('svg'); if (!sv) return;
        var r = sv.getBoundingClientRect(); if (!r.width) return;
        var N = Math.min(W.__zpHuoN || 90, st.R.n), i0 = st.R.n - N, cw = (380 - 24 - 3) / N;
        var xx = (e.clientX - r.left) / r.width * 380;
        var k = Math.max(0, Math.min(N - 1, Math.floor((xx - 24) / cw)));
        xhDraw(st, i0 + k);
      };
      el.addEventListener('pointerdown', hit);
      el.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') hit(e); });
    });
  }

  /* ---------- 独立 mount ---------- */
  var LVSZ = ['日', '30分', '15分', '5分', '1分'];
  function mount(before, opts) {
    opts = opts || {};
    injectCSS();
    var host = document.getElementById('zpZdJL');
    if (!host) {
      host = document.createElement('section'); host.id = 'zpZdJL'; host.setAttribute('aria-label', '趋势庄控副图');
      host.innerHTML = '<div class="sxh"><b>趋势 · 庄控</b><span class="hzlv"></span><button class="hzf" type="button" aria-label="折叠">−</button></div><div class="sxIn"></div>';
      var stl = document.createElement('style'); stl.textContent = '#zpZdJL{margin:0 0 3px;padding:4px 6px 2px;color:#fff;font:400 11px/1.35 -apple-system,"PingFang SC",sans-serif}#zpZdJL .sxh{display:flex;gap:7px;align-items:center;height:19px}#zpZdJL .hzf{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center}#zpZdJL.fold .sxIn{display:none}';
      document.head.appendChild(stl);
      host.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('.hzf')) host.classList.toggle('fold'); });
    }
    if (before && before.parentNode && (host.parentNode !== before.parentNode || host.nextSibling !== before)) before.parentNode.insertBefore(host, before);
    var box = host.querySelector('.sxIn');
    var st = embedNode({ code: opts.code || '' });
    box.appendChild(st.node);
    var lv = opts.lv || '日';
    host.__st = st;
    function load() {
      if (lv === '日') fetchDayJ(host.__sym || st.code, function (b) { if (b) feed(st, b, '日', '趋势', st.code); });
      else fetchMinJ(host.__sym || st.code, lv, function (b) { if (b) feed(st, b, lv, '趋势', st.code); });
    }
    load();
    host.__load = load; host.__lvGet = function () { return lv; }; host.__lvSet = function (v) { lv = v; load(); };
    return host;
  }
  function injectCSS() {
    if (document.getElementById('zpZdCss')) return;
    var st = document.createElement('style'); st.id = 'zpZdCss';
    st.textContent = '.sxIn .sec{background:rgba(255,255,255,.03);border-radius:6px;padding:3px 4px 2px;margin:0 0 3px}' +
      '.sxIn .ssl{display:flex;gap:8px;font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;font:400 10px/1.5 -apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}' +
      '.sxIn svg{display:block;width:100%;height:auto;touch-action:pan-y}';
    document.head.appendChild(st);
  }

  W.JLZd = { version: 'v1.4', calc: calc, mount: mount, embedNode: embedNode, feed: feed, labels: labels, xhKey: xhKey };
})(window);
