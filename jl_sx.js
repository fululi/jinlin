/* jl_sx.js v1.1 (11-24) 筹码穿越+三线金坑 双副图 —— 可独立 mount, 也可嵌入 jl_huo v6(指标切换)。
   公式 = 11-24 修正版(原通达信公式修语法, 已与 Python 复现逐字段对拍):
     副图①筹码穿越: 穿越=|WINNER(C)−WINNER(O)|×100; 换手=V/流通股本×100; 地量换手=MIN(100/换手,100);
       JIU1=获利/平换手×50, JIU2=EMA(JIU1,34), JIU3=DMA(获利,V/流通股本)/平换手×50, JIU4=获利/(V/流通股本);
       平换手=DMA(V,V/流通股本)/流通股本×100(原公式缺×100已修, 否则 JIU 线放大100倍);
       穿透率=100×ΔWINNER/换手%(停牌日除零保护);
       信号柱: 白=|穿透率|>30且换手≤3 | 粉=RPY<75且MYP<30且ASR>60且穿越≥24且换手≤3且阳线 | 青=同粉但阴线 | 蓝=穿透率>10且涨幅≥5%且换手≤3。
     副图②三线金坑(不依赖流通股本): WANn=(C−LLV(L,n))/(HHV(H,n)−LLV(L,n))×100 (n=21/37/55, 除零0.001);
       短=SMA(SMA(WAN1,3,1),3,1)+3×STD(C,21), 中=SMA(WAN2,5,1)+2×STD(C,37), 长=SMA(WAN3,5,1);
       紫底=中<15; 黄金坑=三线同<20(橙柱); 看顶=中>80(天蓝); 文字: 升=LONGCROSS(中,20,15) | 筑底中=(CROSS(短,长)且长<18且长上行)或CROSS(长,5) | *=|中−长|<2且中上行 | 底=WR40(取负)上穿−90且(长<中上行或三线<20) | ▲=长上穿15。
   WINNER=筹码分布近似(换手率衰减+三角分布600档), 与通达信内置有出入但形态一致。
   v 口径=手(腾讯); 流通股本实时取 qt.gtimg.cn(流通市值/现价, localStorage 缓存12h), opts.cap 可直传(股)。
   周期语义: 参数按"根数"算 —— 240 根在 1分=1天/5分=5天/15分=15天; 21/37/55 在15分≈2.6/4.6/6.9天。
   分钟级实测(600105/603986, 11-24): 1分黄金坑/白信号泛滥, 15分可用 —— 建议分钟级只看15分。
   接口: JLSx.mount(beforeEl,{code}) 独立挂载; JLSx.embedNode({code}) → 嵌入节点(给 jl_huo v6);
         JLSx.feed(st, bars[{t,o,c,h,l,v}手], lv'日|15分|5分|1分', which'穿越|三线', code) 喂数据重绘。 */
(function (W) {
  "use strict";
  var GRIDN = 600, DAYN = 640, MINN = 320;
  var CSS = '#zpSxJL{margin:0 0 3px;padding:4px 6px 2px;color:#fff;font:400 11px/1.35 -apple-system,"PingFang SC",ui-rounded,sans-serif;font-variant-numeric:tabular-nums}' +
    '#zpSxJL .hh{display:flex;align-items:center;gap:7px;height:19px;white-space:nowrap;overflow:hidden}#zpSxJL .ht{font-weight:500}' +
    '#zpSxJL .hs{margin-left:auto;font-size:10.5px}#zpSxJL .hf{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center}' +
    '#zpSxJL .ssl{display:flex;gap:8px;font-size:10px;white-space:nowrap;overflow:hidden}' +
    '#zpSxJL svg{display:block;width:100%;height:auto;touch-action:pan-y}#zpSxJL.fold .ssx{display:none}' +
    '#zpSxJL .hps{display:inline-flex;gap:3px;flex:none}#zpSxJL .hp{background:none;border:1px solid rgba(255,255,255,.25);border-radius:6px;color:rgba(255,255,255,.7);font:400 9.5px/1.5 -apple-system,sans-serif;padding:0 5px;cursor:pointer}#zpSxJL .hp.on{border-color:#2fd17a;color:#2fd17a}' +
    '.sxIn .ssx{background:rgba(255,255,255,.03);border-radius:6px;padding:3px 4px 2px;margin:0 0 3px}' +
    '.sxIn .ssl{display:flex;gap:8px;font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;font:400 10px/1.5 -apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}' +
    '.sxIn svg{display:block;width:100%;height:auto;touch-action:pan-y}';

  /* ---------- 通用 ---------- */
  function tdc(c6) { return '#' + c6.slice(4, 6) + c6.slice(2, 4) + c6.slice(0, 2); }   /* 通达信 BBGGRR → #RRGGBB */
  function labels(B, lv) {
    var out = [], pd = '';
    for (var i = 0; i < B.length; i++) {
      var d = String(B[i].t).replace(/\D/g, '');   /* 兼容 '2026-10-23 13:22' 与 '202610231322' 两种 t */
      if (lv === '日') out.push(d.slice(4, 6) + '-' + d.slice(6, 8));
      else { var day = d.slice(0, 8); out.push(day !== pd ? d.slice(4, 6) + '-' + d.slice(6, 8) : d.slice(8, 10) + ':' + d.slice(10, 12)); pd = day; }
    }
    return out;
  }
  function injectCSS() {
    if (document.getElementById('zpSxCss')) return;
    var st = document.createElement('style'); st.id = 'zpSxCss'; st.textContent = CSS; document.head.appendChild(st);
  }
  function pct95(a) { var b = a.filter(function (v) { return isFinite(v); }).sort(function (x, y) { return x - y; }); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * 0.95))] : 10; }
  function symOf(code) { code = String(code || '').replace(/\D/g, ''); if (!/^\d{6}$/.test(code)) return ''; return /^[569]/.test(code) ? 'sh' + code : 'sz' + code; }

  /* ---------- TDX 函数复刻 ---------- */
  function sma(x, n, m) { var r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? (m * x[i] + (n - m) * y) / n : x[0]; r.push(y); } return r; }
  function ema(x, n) { var a = 2 / (n + 1), r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? a * x[i] + (1 - a) * y : x[0]; r.push(y); } return r; }
  function dma(x, a) { var r = [], y = x[0]; for (var i = 0; i < x.length; i++) { var q = Math.min(Math.max(a[i], 1e-4), 1); y = i ? q * x[i] + (1 - q) * y : x[0]; r.push(y); } return r; }
  function std(x, n) { var r = []; for (var i = 0; i < x.length; i++) { if (i < n - 1) { r.push(NaN); continue; } var s = 0, j; for (j = i - n + 1; j <= i; j++) s += x[j]; var m = s / n; s = 0; for (j = i - n + 1; j <= i; j++) s += (x[j] - m) * (x[j] - m); r.push(Math.sqrt(s / (n - 1))); } return r; }
  function hhv(x, n, i) { var v = -1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.max(v, x[j]); return v; }
  function llv(x, n, i) { var v = 1e18; for (var j = Math.max(0, i - n + 1); j <= i; j++) v = Math.min(v, x[j]); return v; }
  function ref(x, n) { return x.map(function (v, i) { return i >= n ? x[i - n] : NaN; }); }
  function cross(a, b) { return a.map(function (v, i) { var pb = (typeof b === 'number') ? b : b[i - 1 < 0 ? 0 : i - 1], pv = i > 0 ? a[i - 1] : v; return i > 0 && v > (typeof b === 'number' ? b : b[i]) && pv <= (typeof b === 'number' ? b : pb); }); }
  function longcross(a, b, n) { return a.map(function (v, i) { if (i <= n) return false; if (!(v > b && a[i - 1] <= b)) return false; for (var j = i - n; j < i - 1 + 1 && j <= i; j++) { if (j >= i - n && j < i && a[j] >= b) return false; } return true; }); }

  /* ---------- 筹码模型: 换手率衰减 + 三角分布 (WINNER 近似) ---------- */
  function chipModel(bars, cap) {
    var n = bars.length, C = [], O = [], H = [], L = [], V = [], i;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); O.push(+bars[i].o); H.push(+bars[i].h); L.push(+bars[i].l); V.push(+bars[i].v || 0); }
    var lo = Math.min.apply(null, L) * 0.92, hi = Math.max.apply(null, H) * 1.08;
    if (!(hi > lo)) hi = lo + 0.01;
    var G = [], dist = new Float64Array(GRIDN), step = (hi - lo) / (GRIDN - 1);
    for (i = 0; i < GRIDN; i++) G.push(lo + step * i);
    function cdf(p) { var k = 0; while (k < GRIDN && G[k] <= p) k++; return k; }
    function addTri(p0, p1, pk, w) {
      var i0 = cdf(p0), i1 = cdf(p1), ik = cdf(pk);
      if (i1 <= i0) { dist[Math.min(Math.max(i0, 0), GRIDN - 1)] += w; return; }   /* 单点K线(集合竞价 o=h=l=c)退化为单档堆积 */
      var s = 0, wgt = new Float64Array(i1 - i0 + 1), j;
      for (j = i0; j <= i1; j++) { var t = G[j] <= pk ? (G[j] - p0) / Math.max(pk - p0, 1e-9) : (p1 - G[j]) / Math.max(p1 - pk, 1e-9); wgt[j - i0] = Math.max(0, Math.min(1, t)); s += wgt[j - i0]; }
      if (s > 0) for (j = i0; j <= i1; j++) dist[j] += w / s * wgt[j - i0];
    }
    var wc = [], wo = [], w11 = [], w09 = [];
    addTri(L[0], H[0], C[0], 1.0);
    for (i = 0; i < n; i++) {
      var t = Math.min(Math.max(V[i] * 100 / cap, 0), 0.999);   /* v手→股; 换手率(小数) */
      var k1 = cdf(C[i]), k2 = cdf(O[i]), k3 = cdf(C[i] * 1.1), k4 = cdf(C[i] * 0.9), s0 = 0, j;
      for (j = 0; j < GRIDN; j++) s0 += dist[j];
      if (s0 > 0) for (j = 0; j < GRIDN; j++) dist[j] *= 1 / s0;
      wc.push(s0 > 0 ? dist.slice(0, k1 + 1).reduce(function (a, b) { return a + b; }, 0) : 0);
      wo.push(s0 > 0 ? dist.slice(0, k2 + 1).reduce(function (a, b) { return a + b; }, 0) : 0);
      w11.push(dist.slice(0, k3 + 1).reduce(function (a, b) { return a + b; }, 0));
      w09.push(dist.slice(0, k4 + 1).reduce(function (a, b) { return a + b; }, 0));
      dist = dist.map(function (d) { return d * (1 - t); });
      addTri(L[i], H[i], C[i], t);
    }
    return { wc: wc, wo: wo, w11: w11, w09: w09 };
  }

  /* ---------- 公式主计算 ---------- */
  function calc(bars, cap) {
    var n = bars.length, C = [], O = [], H = [], L = [], V = [], i;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); O.push(+bars[i].o); H.push(+bars[i].h); L.push(+bars[i].l); V.push((+bars[i].v || 0) * 100); }   /* →股 */
    cap = cap || 1e10;
    var CM = chipModel(bars, cap), 获利 = CM.wc, winO = CM.wo;
    var 换手 = V.map(function (v) { return v / cap * 100; });
    var 穿越 = [], 穿透率 = [], 平换手 = dma(V, V.map(function (v) { return v / cap; })).map(function (v) { return v / cap * 100; });
    for (i = 0; i < n; i++) {
      穿越.push(Math.abs(获利[i] - winO[i]) * 100);
      穿透率.push(换手[i] > 0 ? 100 * (获利[i] - (i > 0 ? 获利[i - 1] : 获利[i])) / 换手[i] : 0);
    }
    var J1 = 获利.map(function (w, k) { return w / 平换手[k] * 50; });
    var J2 = ema(J1, 34);
    var J3 = dma(获利, V.map(function (v) { return v / cap; })).map(function (w, k) { return w / 平换手[k] * 50; });
    var J4 = 获利.map(function (w, k) { return w / (V[k] / cap); });
    var H低 = [], C高 = [], C低 = [], MYP = [], RPY = [], ASR = [];
    for (i = 0; i < n; i++) {
      H低.push(llv(H, 240, i)); MYP.push(100 * (C[i] - H低[i]) / H低[i]);
      C高.push(i >= 1 ? hhv(C, 240, i - 1) : NaN); C低.push(i >= 1 ? llv(C, 240, i - 1) : NaN);
      RPY.push(i >= 1 && C高[i] > C低[i] ? 100 * (C[i] - C低[i]) / (C高[i] - C低[i]) : NaN);
      ASR.push(100 * (CM.w11[i] - CM.w09[i]));
    }
    var sigW = [], sigP = [], sigY = [], sigB = [];
    for (i = 0; i < n; i++) {
      sigW.push(Math.abs(穿透率[i]) > 30 && 换手[i] <= 3);
      sigP.push(isFinite(RPY[i]) && RPY[i] < 75 && MYP[i] < 30 && ASR[i] > 60 && 穿越[i] >= 24 && 换手[i] <= 3 && C[i] >= O[i]);
      sigY.push(isFinite(RPY[i]) && RPY[i] < 75 && MYP[i] < 30 && ASR[i] > 60 && 穿越[i] >= 24 && 换手[i] <= 3 && C[i] < O[i]);
      sigB.push(穿透率[i] > 10 && i > 0 && C[i] / C[i - 1] >= 1.05 && 换手[i] <= 3);
    }
    var 地量 = 换手.map(function (t2) { return t2 > 0 ? Math.min(100 / t2, 100) : 100; });   /* 封顶100, 停牌日=100 */
    /* ---- 三线金坑 ---- */
    function stoch(nn) { var r = []; for (i = 0; i < n; i++) { var hh = hhv(H, nn, i), ll = llv(L, nn, i); r.push(100 * (C[i] - ll) / Math.max(hh - ll, 0.001)); } return r; }
    var W1 = stoch(21), W2 = stoch(37), W3 = stoch(55), s1 = std(C, 21), s2 = std(C, 37);
    function smaN(x, nn, m) { var y = x[0], r = []; for (i = 0; i < n; i++) { y = i ? (m * x[i] + (nn - m) * y) / nn : x[0]; r.push(y); } return r; }
    var 短 = smaN(smaN(W1, 3, 1), 3, 1).map(function (v, k) { return v + 3 * (s1[k] || 0); });
    var 中 = smaN(W2, 5, 1).map(function (v, k) { return v + 2 * (s2[k] || 0); });
    var 长 = smaN(W3, 5, 1);
    var 中2 = [], keng = [], ding = [], diA = [], sheng = [], zd = [], star = [], icon = [], upl = [];
    for (i = 0; i < n; i++) {
      var hh40 = hhv(H, 40, i), ll40 = llv(L, 40, i);
      中2.push(-100 * (hh40 - C[i]) / Math.max(hh40 - ll40, 0.001));
      keng.push(短[i] < 20 && 中[i] < 20 && 长[i] < 20);
      ding.push(中[i] > 80);
      var cShortLong = i > 0 && 短[i] > 长[i] && 短[i - 1] <= 长[i - 1] && 长[i] < 18 && 长[i] > 长[i - 1];
      var cLong5 = i > 0 && 长[i] > 5 && 长[i - 1] <= 5;
      zd.push(cShortLong || cLong5);
      star.push(i > 0 && Math.abs(中[i] - 长[i]) < 2 && 中[i] > 中[i - 1]);
      var wrUp = i > 0 && 中2[i] > -90 && 中2[i - 1] <= -90;
      diA.push(wrUp && ((长[i] < 中[i] && 长[i] > 长[i - 1]) || (短[i] < 20 && 中[i] < 20 && 长[i] < 20)));
      icon.push(i > 0 && 长[i] > 15 && 长[i - 1] <= 15);
    }
    sheng = longcross(中, 20, 15);
    return { n: n, 穿越: 穿越, 换手: 换手, 穿透率: 穿透率, 地量: 地量, J1: J1, J2: J2, J3: J3, J4: J4,
      短: 短, 中: 中, 长: 长, sigW: sigW, sigP: sigP, sigY: sigY, sigB: sigB,
      keng: keng, ding: ding, di: diA, sheng: sheng, zd: zd, star: star, icon: icon };
  }

  /* ---------- SVG 绘制 ---------- */
  var WD = 380, PL = 24, PR = 3;
  /* 11-24 用户「1/5/15/日各自对齐…十字线打通」: 嵌在作战屏时 jl_huo 把主图横轴(同一批K)挂 W.__zpSubAx —— 有就按主图x画(viewBox 360宽, 刻度挪右边), 没有=原来自己排90根 */
  function AXg(bars) { var A = W.__zpSubAx; A = A && A.bars === bars && A.N > 0 ? A : null; WD = A ? 360 : 380; PL = A ? A.PL : 24; PR = A ? 360 - A.PR : 3; return A; }
  function LX4() { return WD === 360 ? 359 : PL - 4; }
  function axOfSt(st) { var a = ['s1', 's2', 's3']; for (var j = 0; j < 3; j++) { var e = st && st[a[j]]; if (e && e.__ax && e.__ax.on) return e.__ax; } return null; }
  function ckOf(B) { var n = B.length, a = B[0] || {}, z = B[n - 1] || {}; return n + '|' + a.t + '|' + z.t + '|' + z.o + '|' + z.h + '|' + z.l + '|' + z.c + '|' + z.v; }
  function gridLines(g, T, Bt, yv, lv, D, i0, N, xF) {
    for (var k = 0; k < N; k += Math.ceil(N / 5)) g.push('<text x="' + xF(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
  }
    function bigOn() { try { return localStorage.getItem('zp_huo_big_v1') === '1'; } catch (e) { return false; } }
  function drawSec1(el, R, bars, lv, cap) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(W.__zpHuoN || 90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var peak = Math.max(12, pct95(R.J2.concat(R.J1)) * 1.25);
    var T = 5, Bt = AX ? AX.H - 3 : (bigOn() ? 148 : 88), Hh = AX ? AX.H : (bigOn() ? 160 : 100), cw = AX ? AX.cw : (WD - PL - PR) / N;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var Y = function (v) { return T + (peak - Math.min(v, peak)) / peak * (Bt - T); };
    var g = [];
    [[peak * 0.5, (peak * 0.5).toFixed(0)], [peak, peak.toFixed(0)]].forEach(function (a) {
      g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="rgba(255,255,255,.14)" stroke-width=".8"/><text x="' + LX4() + '" y="' + (Y(a[0]) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#fff">' + a[1] + '</text>');
    });
    for (var k = 0; k < N; k++) { var i = i0 + k; g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + Y(R.穿越[i]).toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (Bt - Y(R.穿越[i])).toFixed(1) + '" fill="' + tdc('DDDDFF') + '" opacity=".5"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + Y(R.换手[i]).toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (Bt - Y(R.换手[i])).toFixed(1) + '" fill="' + tdc('FF0099') + '" opacity=".75"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.J4[i] <= peak) g.push('<rect x="' + (X(k) - cw * 0.18).toFixed(1) + '" y="' + Y(R.J4[i]).toFixed(1) + '" width="' + (cw * 0.36).toFixed(2) + '" height="' + (Bt - Y(R.J4[i])).toFixed(1) + '" fill="rgba(255,220,0,.55)"/>'); }
    var pt = function (a, col, w2) { var s = []; for (k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return '<polyline fill="none" stroke="' + col + '" stroke-width="' + w2 + '" points="' + s.join(' ') + '"/>'; };
    g.push(pt(R.J1, tdc('00FF00'), 1.1));
    g.push(pt(R.J2, tdc('FF00FF'), 1.5));
    g.push(pt(R.J3, tdc('FFFF99'), 1.0));
    var dlpt = []; for (k = 0; k < N; k++) dlpt.push(X(k).toFixed(1) + ',' + Y(R.地量[i0 + k]).toFixed(1));
    g.push('<polyline fill="none" stroke="' + tdc('FF0000') + '" stroke-width="1.3" opacity=".55" points="' + dlpt.join(' ') + '"/>');
    [[R.sigW, 'rgba(255,255,255,.95)', 0.42], [R.sigP, tdc('FF00FF'), 0.92], [R.sigY, tdc('FFFF33'), 0.36], [R.sigB, '#3b7bff', 0.78]].forEach(function (sg) {
      for (k = 0; k < N; k++) { i = i0 + k; if (sg[0][i]) g.push('<rect x="' + (X(k) - cw * 0.7).toFixed(1) + '" y="' + (Bt - sg[2] * (Bt - T)).toFixed(1) + '" width="' + (cw * 1.4).toFixed(2) + '" height="' + (sg[2] * (Bt - T)).toFixed(1) + '" fill="' + sg[1] + '" stroke="#111" stroke-width=".4"/>'); }
    });
    if (!AX) gridLines(g, T, Bt, null, lv, D, i0, N, X);
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: 0, hi: peak, pv: function (i) { return R.J2[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    el.innerHTML = '<div class="ssl"><span style="color:' + tdc('00FF00') + '">JIU1 ' + R.J1[R.n - 1].toFixed(1) + '</span><span style="color:' + tdc('FF00FF') + '">JIU2 ' + R.J2[R.n - 1].toFixed(1) + '</span><span style="color:' + tdc('FFFF99') + '">JIU3</span><span style="color:#ffdc00">JIU4</span><span style="color:#ddd">穿越 ' + R.穿越[R.n - 1].toFixed(1) + '</span><span style="color:#ddd">换手 ' + R.换手[R.n - 1].toFixed(2) + '%</span><span style="color:#fff">穿透 ' + R.穿透率[R.n - 1].toFixed(1) + '</span></div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
    el.__g = { N: N, i0: i0, cw: cw, PL: PL, W: WD, T: T, Bt: Bt, R: R, D: D, sec: 1 };
  }
  function drawSec2(el, R, bars, lv) {
    var AX = AXg(bars), N = AX ? AX.N : Math.min(W.__zpHuoN || 90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(bars, lv);
    var T = 5, Bt = AX ? AX.H - 3 : (bigOn() ? 148 : 88), Hh = AX ? AX.H : (bigOn() ? 160 : 100), cw = AX ? AX.cw : (WD - PL - PR) / N, vmax = 135, vmin = -5;
    var X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var Y = function (v) { return T + (vmax - Math.min(Math.max(v, vmin), vmax)) / (vmax - vmin) * (Bt - T); };
    var g = [];
    [[20, '20'], [50, '50'], [80, '80']].forEach(function (a) {
      g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="rgba(255,255,255,.14)" stroke-width=".8"/><text x="' + LX4() + '" y="' + (Y(a[0]) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#fff">' + a[1] + '</text>');
    });
    for (var k = 0; k < N; k++) { var i = i0 + k; if (R.中[i] < 15) g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + Y(R.中[i]).toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (Y(15) - Y(R.中[i])).toFixed(1) + '" fill="' + tdc('FF00FF') + '" opacity=".45"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.中[i] > 80) g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + Y(80).toFixed(1) + '" width="' + cw.toFixed(2) + '" height="' + (Y(Math.min(R.中[i], 130)) - Y(80)).toFixed(1) + '" fill="' + tdc('FFF000') + '" opacity=".6"/>'); }
    for (k = 0; k < N; k++) { i = i0 + k; if (R.keng[i]) { var top = Math.max(R.长[i], Math.max(R.短[i], R.中[i])); g.push('<rect x="' + (X(k) - cw * 0.65).toFixed(1) + '" y="' + Y(20).toFixed(1) + '" width="' + (cw * 1.3).toFixed(2) + '" height="' + Math.max(1, Y(top) - Y(20)).toFixed(1) + '" fill="' + tdc('00CCFF') + '" opacity=".9"/>'); } }
    var pt = function (a, col, w2) { var s = []; for (k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return '<polyline fill="none" stroke="' + col + '" stroke-width="' + w2 + '" points="' + s.join(' ') + '"/>'; };
    g.push(pt(R.短, '#00ff00', 1.1));
    g.push(pt(R.中, '#ff4444', 1.2));
    g.push(pt(R.长, tdc('FF00FF'), 1.4));
    var occ = {};   /* 11-24t: 连着只写第一根 + 同一行不压字 + 字×0.7 (只改显示) */
    function tx(mask, y, s, col, fs) { fs = Math.round((fs || 10) * 7) / 10; var wd = fs * s.length + 2, L = occ[y] || (occ[y] = []); for (var k2 = 0; k2 < N; k2++) { var i2 = i0 + k2; if (!mask[i2] || mask[i2 - 1]) continue; var xa = X(k2) - wd / 2, xb = X(k2) + wd / 2; if (L.some(function (r) { return xa < r[1] && xb > r[0]; })) continue; L.push([xa, xb]); g.push('<text x="' + X(k2).toFixed(1) + '" y="' + (Y(y) - 2).toFixed(1) + '" text-anchor="middle" font-size="' + (fs || 10) + '" fill="' + col + '" stroke="#000" stroke-width=".5" paint-order="stroke">' + s + '</text>'); } }
    tx(R.sheng, 20, '升', '#ffdd44'); tx(R.zd, 20, '筑底中', '#66ddff'); tx(R.star, 90, '＊', '#fff', 11); tx(R.di, 0, '底', tdc('FF00FF'), 10);
    for (k = 0; k < N; k++) { i = i0 + k; if (R.icon[i]) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Y(R.中[i]) - 2).toFixed(1) + '" text-anchor="middle" font-size="10" fill="#ffdd44">▲</text>'); }
    if (!AX) gridLines(g, T, Bt, null, lv, D, i0, N, X);
    g.push('<g class="hx"></g>'); el.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: vmin, hi: vmax, pv: function (i) { return R.中[i]; } };   /* 11-24: 给 jl_huo 画十字横线/✎横线用 */
    var stTxt = R.keng[R.n - 1] ? '<span style="color:#ffcc00">黄金坑中</span>' : (R.中[R.n - 1] > 80 ? '<span style="color:#00f0ff">看顶区</span>' : '');
    el.innerHTML = '<div class="ssl"><span style="color:#00ff00">短 ' + R.短[R.n - 1].toFixed(1) + '</span><span style="color:#ff4444">中 ' + R.中[R.n - 1].toFixed(1) + '</span><span style="color:' + tdc('FF00FF') + '">长 ' + R.长[R.n - 1].toFixed(1) + '</span>' + stTxt + '</div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
    el.__g = { N: N, i0: i0, cw: cw, PL: PL, W: WD, T: T, Bt: Bt, R: R, D: D, sec: 2 };
  }

  /* ---------- 流通股本 ---------- */
  function fetchCap(code, cb) {
    try { var o = JSON.parse(localStorage.getItem('zp_sx_cap_' + code) || 'null'); if (o && Date.now() - o.at < 12 * 3600e3 && o.cap > 0) return cb(o.cap); } catch (e) { }
    var sym = symOf(code); if (!sym) return cb(0);
    var x = new XMLHttpRequest(); x.timeout = 8000;
    x.open('GET', 'https://qt.gtimg.cn/q=' + sym + '&_t=' + Date.now());
    x.onload = function () {
      try { var f = x.responseText.split(';')[0].split('~'); var cap = parseFloat(f[44]) * 1e8 / parseFloat(f[3]);   /* 流通市值(亿)/现价 → 股 */
        if (cap > 0) { try { localStorage.setItem('zp_sx_cap_' + code, JSON.stringify({ at: Date.now(), cap: cap })); } catch (e2) { } }
        cb(cap > 0 ? cap : 0);
      } catch (e) { cb(0); }
    };
    x.onerror = function () { cb(0); };
    try { x.send(); } catch (e) { cb(0); }
  }

  /* ---------- 嵌入模式 (jl_huo v6 调用) ---------- */
  
  /* ---------- v1.2: 十字线 —— 主图拖动广播 zpSubXH(key) 跟随 + 本图按住拖动, 8秒自动收 ---------- */
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
    /* v1.5: 完整十字线 —— 竖线 + 各窗指标值高度横线 + 右缘值标签 */
    var pk1 = Math.max(12, pct95(st.R.J2.concat(st.R.J1)) * 1.25);
    var y1 = 5 + (pk1 - Math.min(st.R.J2[i0 + k], pk1)) / pk1 * (88 - 5);
    var y2v = 5 + (135 - Math.min(Math.max(st.R.中[i0 + k], -5), 135)) / 140 * (88 - 5);
    var lab1 = st.R.J2[i0 + k].toFixed(1), lab2 = st.R.中[i0 + k].toFixed(1);
    var ln = '<line x1="' + x + '" x2="' + x + '" y1="3" y2="' + (GA ? GA.Bt + 2 : (bigOn() ? 155 : 93)) + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/>'
      + '<line x1="24" x2="356" y1="' + y1.toFixed(1) + '" y2="' + y1.toFixed(1) + '" stroke="rgba(0,255,0,.45)" stroke-width=".7"/>'
      + '<text x="354" y="' + (y1 - 2).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#7dff7d">' + lab1 + '</text>'
      + '<line x1="24" x2="356" y1="' + y2v.toFixed(1) + '" y2="' + y2v.toFixed(1) + '" stroke="rgba(255,204,0,.45)" stroke-width=".7"/>'
      + '<text x="354" y="' + (y2v + 8).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#ffd66e">' + lab2 + '</text>';
    if (GA) ln = ln.slice(0, ln.indexOf('/>') + 2);   /* 11-24: 嵌在作战屏时横线由 jl_huo 画(按手指高度/各窗自己的刻度) */
    ['s1', 's2'].forEach(function (sk) {
      var sv = st[sk] && st[sk].querySelector('svg'); if (!sv) return;
      var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ln;
    });
    var j = i0 + k;
    if (st.s1 && st.s1.style.display !== 'none' && st.s1.querySelector('.ssl')) {
      st.s1.querySelector('.ssl').innerHTML = '<span style="color:' + tdc('00FF00') + '">JIU1 ' + st.R.J1[j].toFixed(1) + '</span><span style="color:' + tdc('FF00FF') + '">JIU2 ' + st.R.J2[j].toFixed(1) + '</span><span style="color:#ddd">穿越 ' + st.R.穿越[j].toFixed(1) + '</span><span style="color:#ddd">换手 ' + st.R.换手[j].toFixed(2) + '%</span><span style="color:#fff">穿透 ' + st.R.穿透率[j].toFixed(1) + '</span>';
    }
    if (st.s2 && st.s2.style.display !== 'none' && st.s2.querySelector('.ssl')) {
      var stTxt = st.R.keng[j] ? '<span style="color:#ffcc00">黄金坑中</span>' : (st.R.中[j] > 80 ? '<span style="color:#00f0ff">看顶区</span>' : '');
      st.s2.querySelector('.ssl').innerHTML = '<span style="color:#00ff00">短 ' + st.R.短[j].toFixed(1) + '</span><span style="color:#ff4444">中 ' + st.R.中[j].toFixed(1) + '</span><span style="color:' + tdc('FF00FF') + '">长 ' + st.R.长[j].toFixed(1) + '</span>' + stTxt;
    }
    clearTimeout(st.__xhT); st.__xhT = setTimeout(function () { xhClear(st); }, 8000);
  }
  function xhClear(st) {
    ['s1', 's2'].forEach(function (sk) { var sv = st[sk] && st[sk].querySelector('svg'); if (sv) { var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ''; } });
  }
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
    [['s1', st.s1], ['s2', st.s2]].forEach(function (p) {
      var el = p[1]; if (!el) return;
      el.style.touchAction = 'pan-y';
      var hit = function (e) { if (axOfSt(st)) return;   /* 11-24: 嵌在作战屏时由 jl_huo 统一接手指(并驱动主图十字线) */
        if (!st.R) return;
        var sv = el.querySelector('svg'); if (!sv) return;
        var r = sv.getBoundingClientRect(); if (!r.width) return;
        var N = Math.min(W.__zpHuoN || 90, st.R.n), i0 = st.R.n - N, cw = (380 - 24 - 3) / N;
        var x = (e.clientX - r.left) / r.width * 380;
        var k = Math.max(0, Math.min(N - 1, Math.floor((x - 24) / cw)));
        xhDraw(st, i0 + k);
      };
      el.addEventListener('pointerdown', hit);
      el.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') hit(e); });
    });
  }
  function embedNode(opts) {
    injectCSS();
    var node = document.createElement('div'); node.className = 'sxIn';
    node.innerHTML = '<div class="ssx sec1"></div><div class="ssx sec2"></div>';
    var st = { node: node, s1: node.querySelector('.sec1'), s2: node.querySelector('.sec2'),
      opt: opts || {}, code: (opts && opts.code) || '', cap: (opts && opts.cap) || 0, bars: null, lv: null, which: '穿越', at: 0 };
    return st;
  }
  function feed(st, bars, lv, which, code) {
    if (!st) return;
    st.bars = bars; st.lv = lv; if (which) st.which = which; if (code) st.code = code;
    if (st.code && symOf(st.code)) st.code = symOf(st.code).slice(2);   /* 统一 6 位码 */
    function draw() {
      if (!st.bars || st.bars.length < 40) { st.s1.innerHTML = st.s2.innerHTML = '<div class="ssl"><span style="color:#8fb8ff">K线还没到（≥40根）</span></div>'; return; }
      try {
        var ck0 = ckOf(st.bars) + '|' + (st.cap || 0); if (!st.R || st.__ck !== ck0) { st.R = calc(st.bars, st.cap); st.__ck = ck0; }   /* 11-24: 同一批K不重算(主图拖动时每帧重画) */
        drawSec1(st.s1, st.R, st.bars, st.lv, st.cap);
        drawSec2(st.s2, st.R, st.bars, st.lv);
      } catch (e) { st.s1.innerHTML = '<div class="ssl"><span style="color:#ff8888">计算出错: ' + e.message + '</span></div>'; }
    }
    if (which === '穿越' && !st.cap && st.code && !(st.__capAt && st.__capCode === st.code && Date.now() - st.__capAt < 60000)) { st.__capAt = Date.now(); st.__capCode = st.code; fetchCap(st.code, function (c) { if (c > 0) st.cap = c; draw(); }); }   /* 11-24: 取股本在路上/失败后60秒内不重发(原来每重画一次发一个) */
    draw();
    showWhich(st);
    st.at = Date.now();
    if (ACT.indexOf(st) < 0) ACT.push(st);
    bindCross(st);
  }
  function showWhich(st) {
    st.s1.style.display = st.which === '穿越' ? '' : 'none';
    st.s2.style.display = st.which === '三线' ? '' : 'none';
  }

  /* ---------- 独立 mount (不经过 jl_huo) ---------- */
  var LVSX = ['日', '15分', '5分', '1分'], MKX = { '15分': 'm15', '5分': 'm5', '1分': 'm1' };
  function fetchMinJ(code, lv, cb) {
    var sym = symOf(code); if (!sym) return cb(null, '拿不到代码');
    var hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) return cb(null, '三个域名都没通');
      var h = hosts[i++];
      var x = new XMLHttpRequest(); x.timeout = 8000;
      x.open('GET', 'https://' + h + '/appstock/app/kline/mkline?param=' + sym + ',' + MKX[lv] + ',,320&_t=' + Date.now());
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
  function mount(before, opts) {
    if (!before || !before.parentNode) return null;
    injectCSS();
    opts = opts || {};
    var host = document.createElement('section'); host.id = 'zpSxJL'; host.setAttribute('aria-label', '筹码穿越·三线金坑副图');
    host.innerHTML = '<div class="hh"><span class="ht">筹码穿越 · 三线金坑</span><span class="hps">' + LVSX.map(function (l) { return '<button class="hp' + (l === '日' ? ' on' : '') + '" data-lv="' + l + '" type="button">' + (l === '日' ? '日' : l.replace('分', '')) + '</button>'; }).join('') + '</span><span class="hs">WINNER≈换手衰减模型 · 分钟级建议只看15分</span><button class="hf" type="button" aria-label="折叠">−</button></div>';
    before.parentNode.insertBefore(host, before);
    var st = embedNode({ code: opts.code || '' });
    st.node.style.display = ''; host.appendChild(st.node);
    var lv = '日';
    function load() {
      if (lv === '日') fetchDayJ(st.code, function (b) { if (b) feed(st, b, '日', '穿越', st.code); else host.querySelector('.hs').textContent = '日K拉不到'; });
      else fetchMinJ(st.code, lv, function (b) { if (b) feed(st, b, lv, '穿越', st.code); else host.querySelector('.hs').textContent = lv + 'K拉不到(自动重试)'; });
    }
    host.addEventListener('click', function (e) {
      var p = e.target && e.target.closest && e.target.closest('.hp');
      if (p) { lv = p.getAttribute('data-lv'); host.querySelectorAll('.hp').forEach(function (b2) { b2.classList.toggle('on', b2 === p); }); load(); return; }
      var f = e.target && e.target.closest && e.target.closest('.hf');
      if (f) host.classList.toggle('fold');
    });
    if (opts.bars) feed(st, opts.bars, '日', '穿越', st.code); else load();
    host.__st = st; host.__load = load;
    return host;
  }

  W.JLSx = { version: 'v1.5', calc: calc, mount: mount, embedNode: embedNode, feed: feed, labels: labels, xhKey: xhKey };
})(window);
