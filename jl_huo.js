/* jl_huo.js v5 (11-24) 乖离副图: 多周期(日/15分/5分/1分)切换 + 十字线。公式 calc/state 与 v4 逐字一致, 一个数没改。
   多周期: 周期按钮存 zp_huo_lv_v1; 分钟K优先读作战屏 LIVE.hist.m15/m5/m1(慢通道已载入, 不另拉);
           独立打开/慢通道没有时自拉腾讯 mkline 320根(55秒节流, 三域名轮询)。
   头部「20日线 / 线下·卖后多等」永远用日K口径(调用方喂的B), 不随周期变 —— 该口径按日线回测标定(tools/bt/huo2_adaptive_1123.js)。
   十字线: 鼠标悬停/触摸显示 竖线+时针横线+取值点+数值, 触摸松手1.5秒后收起。
   暖机(11-24回测, 5票×400根日K): 喂<200根时「…升」信号和时针可能失真(喂40根时显示窗内最多11根信号不一致、时针最大差12.9);
           分钟自拉320根够用; 调用方日K请保持≥200根(作战屏400根满足)。
   分钟级语义变化: 「…升」=30根内首次(15分≈2个交易日/5分≈半天/1分≈半小时); −2/−5 阈值是日线标定,
           11-24回测: 15分时针95.5%低于−2、5分/1分100%低于−2 —— 分钟级这两条线参考意义有限, 阈值要按周期自己重标。
   原公式(照用户贴的原文): HUO1=EMA((C−MA(TP,20))/MA(TP,20)×100,3) TP=(1.2C+H+L)/3; HUO6=(HHV(H,30)−C)/(HHV(H,30)−LLV(L,30))×HUO1;
   辅线=EMA(HUO6,3); 底撑=REF(LLV(HUO1,25),1); 二撑=REF(LLV(HUO1,13),1); 中=−2 强线=−5; 红柱 HUO1>HUO6; 红/蓝带 HUO6 对 中;
   DZJ「…升」= JIU1<REF(JIU2,1) 且放量收涨, 30天内第一次(JIU=100−3×SMA(RSV75,20,1)+2×SMA(SMA(..),15,1))
   头部「线下·卖后多等≈x%」: 昨收在20日线下 → 0.5×前20日最大(高−低)/高 —— 只当参考, 不改尺子/小球/提醒
   用法: JLHuo.mount(beforeEl) 返回 host; JLHuo.render(host, dayBars[{t,o,c,h,l,v}], sessDate'YYYYMMDD'[, opt{code,bars}]); JLHuo.calc(bars) 纯计算(回测/比对用) */
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
  /* ---- 11-24 新增: 周期切换 / 分钟K来源 / 十字线 (不动上面的公式) ---- */
  var LVS = ['日', '15分', '5分', '1分'], LVK = 'zp_huo_lv_v1', MK = { '15分': 'm15', '5分': 'm5', '1分': 'm1' };
  function loadLv() { try { var v = localStorage.getItem(LVK); if (LVS.indexOf(v) >= 0) return v; } catch (e) { } return '日'; }
  function codeOf() { try { if (W.LIVE && W.LIVE.sym) return String(W.LIVE.sym); if (W.STK && W.STK.code) return String(W.STK.code); } catch (e) { } return ''; }
  function redraw(host) { var a = host.__args; if (a) render(host, a.B, a.sess, a.opt); }
  function fetchMin(host, code, lv) {
    var C = host.__min = host.__min || {}, e = C[lv] = C[lv] || {};
    if (e.fly) return;
    e.fly = 1; e.code = code;
    var sym = /^(sh|sz)\d{6}$/i.test(code) ? code.toLowerCase() : (/^[569]/.test(String(code).replace(/\D/g, '')) ? 'sh' : 'sz') + String(code).replace(/\D/g, '');
    var k = MK[lv], hosts = ['proxy.finance.qq.com/ifzqgtimg', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn'], i = 0;
    (function nx() {
      if (i >= hosts.length) { e.fly = 0; e.err = '几个域名都没通'; e.at = Date.now() - 40000; redraw(host); return; }
      var h = hosts[i++];
      fetch('https://' + h + '/appstock/app/kline/mkline?param=' + sym + ',' + k + ',,320&_t=' + Date.now(), { cache: 'no-store', signal: W.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
        .then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          var rows = d && d.data && d.data[sym] && d.data[sym][k];
          if (!rows || !rows.length) throw Error('空');
          e.bars = rows.map(function (r) { return { t: String(r[0]), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] || 0 }; });
          e.at = Date.now(); e.err = ''; e.fly = 0; host.__key = ''; redraw(host);
        })
        .catch(function () { nx(); });
    })();
  }
  function minBars(host, lv, opt) {
    if (opt.bars && opt.bars.length >= 40) return { bars: opt.bars };
    try { var H = W.LIVE && W.LIVE.hist, k = MK[lv]; if (H && H[k] && H[k].length >= 40) return { bars: H[k] }; } catch (e) { }
    var code = opt.code || codeOf();
    if (!code) return { bars: null, msg: lv + 'K：拿不到股票代码（从作战屏打开或传opt.code）' };
    var C = host.__min = host.__min || {}, e = C[lv] = C[lv] || {};
    if (e.code !== code) { e.bars = null; e.err = ''; e.at = 0; }
    if (!e.bars || Date.now() - (e.at || 0) > 55000) fetchMin(host, code, lv);
    if (e.bars) return { bars: e.bars };
    return { bars: null, msg: e.err ? lv + 'K取不到：' + e.err + '（自动重试）' : '正在取' + lv + 'K…' };
  }
  /* 横轴标签: 日K=月-日; 分钟=时:分, 每天第一根标月-日 (纯函数, �