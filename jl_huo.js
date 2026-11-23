/* 11-23b 用户贴原公式核对: 补 蓝带(HUO6 对 辅线)、去 0 线(底线 NODRAW)、…升 字放 0.35 处蓝字; TP=(1.2C+H+L)/3 照原文(常态 HUO1≈−6, 原指标就这样)
   11-23 用户「今天删掉了一个副图 可以把这个线搬上去吧 我这种小白还得需要看图」: 通达信「HUO 乖离」副图(日线) 搬上作战屏
   公式照用户贴的原文: HUO1=EMA((C−MA(TP,20))/MA(TP,20)×100,3) TP=(1.2C+H+L)/3; HUO6=(HHV(H,30)−C)/(HHV(H,30)−LLV(L,30))×HUO1;
   辅线=EMA(HUO6,3); 底撑=REF(LLV(HUO1,25),1); 二撑=REF(LLV(HUO1,13),1); 中=−2 强线=−5; 红柱 HUO1>HUO6; 红/蓝带 HUO6 对 中;
   DZJ「…升」= JIU1<REF(JIU2,1) 且放量收涨, 30天内第一次(JIU=100−3×SMA(RSV75,20,1)+2×SMA(SMA(..),15,1))
   头部「线下·卖后多等≈x%」: 昨收在20日线下 → 0.5×前20日最大(高−低)/高 —— 依据 tools/bt/huo2_adaptive_1123.js + 1114总账 11-23c(线下前后两段都不比现行差), 只当参考, 不改尺子/小球/提醒
   用法: JLHuo.mount(beforeEl) 返回 host; JLHuo.render(host, dayBars[{t,o,c,h,l,v}], sessDate'YYYYMMDD'); JLHuo.calc(bars) 纯计算(回测/比对用) */
(function (W) {
  function ema(x, n) { var a = 2 / (n + 1), r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? a * x[i] + (1 - a) * y : x[0]; r.push(y); } return r; }
  function sma(x, n, m) { var r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? (m * x[i] + (n - m) * y) / n : x[0]; r.push(y); } return r; }
  function ma(x, n) { var r = [], s = 0; for (var i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; r.push(s / Math.min(n, i + 1)); } return r; }
  function hhv(x, n, i) { var v = -1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.max(v, x[j]); return v; }
  function llv(x, n, i) { var v = 1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.min(v, x[j]); return v; }
  function calc(B) {
    var n = B.length, C = [], O = [], H = [], L = [], V = [], i;
    for (i = 0; i < n; i++) { C.push(+B[i].c); O.push(+B[i].o); H.push(+B[i].h); L.push(+B[i].l); V.push(+B[i].v || 0); }
    var TP = C.map(function (c, k) { return (1.2 * c + H[k] + L[k]) / 3; }), mt = ma(TP, 20);
    var H1 = ema(C.map(function (c, k) { return (c - mt[k]) / mt[k] * 100; }), 3);
    var H6 = C.map(function (c, k) { var hh = hhv(H, 30, k), ll = llv(L, 30, k); return hh > ll ? (hh - c) / (hh - ll) * H1[k] : 0; });
    var FU = ema(H6, 3), D4 = [], ER = [];
    for (i = 0; i < n; i++) { D4.push(llv(H1, 25, Math.max(0, i - 1))); ER.push(llv(H1, 13, Math.max(0, i - 1))); }
    function jiu(P) { var R = P.map(function (p, k) { var hh = hhv(H, 75, k), ll = llv(L, 75, k); return hh > ll ? (p - ll) / (hh - ll) * 100 : 50; }); var a = sma(R, 20, 1), b = sma(a, 15, 1); return a.map(function (v, k) { return 100 - 3 * v + 2 * b[k]; }); }
    var J1 = jiu(C), J2 = jiu(O), J3 = [], DZ = [], M20 = ma(C, 20);
    for (i = 0; i < n; i++) J3.push(i > 0 && J1[i] < J2[i - 1] && V[i] > V[i - 1] && C[i] > C[i - 1]);
    for (i = 0; i < n; i++) { var c30 = 0; for (var j = Math.max(0, i - 29); j <= i; j++) if (J3[j]) c30++; DZ.push(J3[i] && c30 === 1); }
    return { n: n, C: C, H1: H1, H6: H6, FU: FU, D4: D4, ER: ER, DZ: DZ, M20: M20, H: H, L: L };
  }
  /* 昨收 vs 20日线(含昨收在内的前20根) + 等多深(前20根 最大(高−低)/高 ×0.5), 和回测 huo2_adaptive_1123.js 同口径 */
  function state(B, sess) {
    var k = B.length; if (sess && k && String(B[k - 1].t).replace(/\D/g, '').slice(0, 8) >= sess) k--;
    if (k < 20) return null;
    var s = 0, dr = 0; for (var j = k - 20; j < k; j++) { s += +B[j].c; dr = Math.max(dr, (B[j].h - B[j].l) / B[j].h); }
    var m = s / 20, pc = +B[k - 1].c; return { below: pc < m, pc: pc, m20: m, wait: 0.5 * dr * 100 };
  }
  var CSS = '#zpHuoJL{margin:0 0 3px;padding:4px 6px 2px;color:#fff;font:400 11px/1.35 -apple-system,"PingFang SC",ui-rounded,sans-serif;font-variant-numeric:tabular-nums}' +
    '#zpHuoJL .hh{display:flex;align-items:center;gap:7px;height:19px;white-space:nowrap;overflow:hidden}#zpHuoJL .ht{font-weight:500}' +
    '#zpHuoJL .hs{margin-left:auto;font-size:10.5px}#zpHuoJL .hf{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center}' +
    '#zpHuoJL .hl{display:flex;gap:8px;font-size:10px;white-space:nowrap;overflow:hidden}#zpHuoJL svg{display:block;width:100%;height:auto;touch-action:pan-y}' +
    '#zpHuoJL.fold .hb,#zpHuoJL.fold .hl{display:none}body.injlin .chartbox>#zpHuoJL{order:1}';
  var FK = 'zp_huo_fold_v1';
  function mount(before) {
    if (!before || !before.parentNode) return null;
    var host = document.getElementById('zpHuoJL');
    if (!host) {
      if (!document.getElementById('zpHuoCss')) { var st = document.createElement('style'); st.id = 'zpHuoCss'; st.textContent = CSS; document.head.appendChild(st); }
      host = document.createElement('section'); host.id = 'zpHuoJL'; host.setAttribute('aria-label', '日线乖离副图');
      try { if (localStorage.getItem(FK) === '1') host.classList.add('fold'); } catch (e) { }
      host.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('.hf'); if (!b) return; host.classList.toggle('fold'); try { localStorage.setItem(FK, host.classList.contains('fold') ? '1' : '0'); } catch (e2) { } b.textContent = host.classList.contains('fold') ? '+' : '−'; });
      var mv = function (e) { var G = host.__g; if (!G) return; var sv = host.querySelector('svg'); if (!sv) return; var r = sv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e, x = (t.clientX - r.left) / r.width * G.W; host.__hov = Math.max(0, Math.min(G.N - 1, Math.floor((x - G.PL) / G.cw))); legend(host); };
      host.addEventListener('mousemove', mv); host.addEventListener('touchstart', mv, { passive: true }); host.addEventListener('touchmove', mv, { passive: true });
      host.addEventListener('mouseleave', function () { host.__hov = -1; legend(host); }); host.addEventListener('touchend', function () { setTimeout(function () { host.__hov = -1; legend(host); }, 1500); });
    }
    if (host.parentNode !== before.parentNode || host.nextSibling !== before) before.parentNode.insertBefore(host, before);
    return host;
  }
  function f2(v) { return (v >= 0 ? '' : '−') + Math.abs(v).toFixed(2); }
  function legend(host) {
    var G = host.__g, el = host.querySelector('.hl'); if (!G || !el) return;
    var k = host.__hov >= 0 ? host.__hov : G.N - 1, i = G.i0 + k, R = G.R;
    el.innerHTML = '<span>' + G.D[i] + '</span><span style="color:#2fd17a">时针 ' + f2(R.H1[i]) + '</span><span style="color:#99eeee">分针 ' + f2(R.H6[i]) + '</span><span style="color:#ffcc17">辅线 ' + f2(R.FU[i]) + '</span><span style="color:#ff5cff">底撑 ' + f2(R.D4[i]) + '</span><span style="color:#ffff3a">二撑 ' + f2(R.ER[i]) + '</span>';
  }
  function render(host, B, sess) {
    if (!host) return;
    var key = (B && B.length ? B.length + '@' + B[B.length - 1].t + '@' + B[B.length - 1].c : '0') + '|' + sess;
    if (host.__key === key) return; host.__key = key;
    var fd = host.classList.contains('fold');
    if (!B || B.length < 40) { host.__g = null; host.innerHTML = '<div class="hh"><span class="ht">日线乖离</span><span class="hs">日K还没到（一直这样=日K拉不到）</span></div>'; return; }
    var R = calc(B), S = state(B, sess), N = Math.min(90, R.n), i0 = R.n - N, D = B.map(function (b) { var d = String(b.t).replace(/\D/g, ''); return d.slice(4, 6) + '-' + d.slice(6, 8); });
    var Wd = 380, PL = 24, PR = 3, T = 6, Bt = 100, Hh = 114, cw = (Wd - PL - PR) / N,   /* viewBox 宽380≈手机屏宽, 字不被缩小 */
        X = function (k) { return PL + cw * (k + 0.5); };
    var vs = [3, -5]; for (var k = 0; k < N; k++) { var i = i0 + k; vs.push(R.H1[i], R.H6[i], R.FU[i], R.D4[i], R.ER[i]); }
    var vmax = Math.max.apply(null, vs), vmin = Math.min.apply(null, vs), Y = function (v) { return T + (vmax - v) / (vmax - vmin) * (Bt - T); };
    var g = [], pt = function (a) { var s = []; for (var k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return s.join(' '); };
    for (k = 0; k < N; k++) { i = i0 + k; if (i > 0 && R.C[i - 1] < R.M20[i - 1]) g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + T + '" width="' + cw.toFixed(2) + '" height="' + (Bt - T) + '" fill="rgba(80,140,255,.09)"/>'); }   /* 蓝底 = 那天开盘前(昨收)在20日线下 */
    [[-2, '−2', '#3d7bff', 1.3, ''], [-5, '−5', '#8a8a8a', .8, '']].forEach(function (a) { g.push('<line x1="' + PL + '" x2="' + (Wd - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="' + a[2] + '" stroke-width="' + a[3] + '"' + (a[4] ? ' stroke-dasharray="' + a[4] + '"' : '') + '/><text x="' + (PL - 4) + '" y="' + (Y(a[0]) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#fff">' + a[1] + '</text>'); });
    g.push('<text x="' + (PL - 4) + '" y="' + (Y(vmax) + 8) + '" text-anchor="end" font-size="10" fill="#fff">' + vmax.toFixed(0) + '</text><text x="' + (PL - 4) + '" y="' + (Y(vmin) - 1) + '" text-anchor="end" font-size="10" fill="#fff">' + vmin.toFixed(0) + '</text>');
    for (k = 0; k < N; k++) {
      i = i0 + k; var a = R.H6[i], y1 = Math.min(Y(a), Y(-2)), y2 = Math.max(Y(a), Y(-2));
      g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (y2 - y1).toFixed(1) + '" fill="' + (a > -2 ? 'rgba(255,60,60,.2)' : 'rgba(0,128,255,.22)') + '"/>');
      var f = R.FU[i], z1 = Math.min(Y(a), Y(f)), z2 = Math.max(Y(a), Y(f));   /* 蓝带: DRAWBAND(HUO6,红,辅线,蓝) */
      g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + z1.toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (z2 - z1).toFixed(1) + '" fill="' + (a > f ? 'rgba(255,60,60,.35)' : 'rgba(0,128,255,.38)') + '"/>');
      if (R.H1[i] > R.H6[i]) g.push('<line x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + Y(R.H1[i]).toFixed(1) + '" y2="' + Y(R.H6[i]).toFixed(1) + '" stroke="#ff5459" stroke-width="' + Math.max(1, cw * .45).toFixed(1) + '"/>');
    }
    g.push('<polyline fill="none" stroke="#ffcc17" stroke-width="1" points="' + pt(R.FU) + '"/><polyline fill="none" stroke="#99eeee" stroke-width="1" points="' + pt(R.H6) + '"/>');
    g.push('<polyline fill="none" stroke="#ffff3a" stroke-width="1" stroke-dasharray="2 3" points="' + pt(R.ER) + '"/><polyline fill="none" stroke="#ff5cff" stroke-width="1.4" points="' + pt(R.D4) + '"/><polyline fill="none" stroke="#2fd17a" stroke-width="1.5" points="' + pt(R.H1) + '"/>');
    for (k = 0; k < N; k++) { i = i0 + k; if (R.DZ[i]) g.push('<line x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + Y(3).toFixed(1) + '" y2="' + Y(-2).toFixed(1) + '" stroke="#ff80ff" stroke-width="3"/><text x="' + X(k).toFixed(1) + '" y="' + (Y(0.35) - 2).toFixed(1) + '" text-anchor="start" font-size="10" fill="#3d8bff" stroke="#000" stroke-width=".6" paint-order="stroke">...升</text>'); }
    for (k = 0; k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Hh - 3) + '" text-anchor="middle" font-size="10" fill="#fff">' + D[i0 + k] + '</text>');
    var st = !S ? '' : S.below ? '<span style="color:#8fb8ff">线下 · 卖后多等≈' + S.wait.toFixed(1) + '%</span>' : '<span>线上 · 照常接</span>';   /* 依据 tools/bt/huo2_adaptive_1123.js / 1114总账 11-23c; 参考, 不改尺子 */
    host.innerHTML = '<div class="hh"><span class="ht">日线乖离</span>' + (S ? '<span>20日线 ' + S.m20.toFixed(2) + '</span>' : '') + '<span class="hs">' + st + '</span><button class="hf" type="button" aria-label="折叠">' + (fd ? '+' : '−') + '</button></div><div class="hl"></div><div class="hb"><svg viewBox="0 0 ' + Wd + ' ' + Hh + '">' + g.join('') + '</svg></div>';
    host.__g = { W: Wd, PL: PL, cw: cw, N: N, i0: i0, R: R, D: D }; if (!(host.__hov >= 0)) host.__hov = -1; legend(host);
  }
  W.JLHuo = { calc: calc, state: state, mount: mount, render: render };
})(window);
