/* jl_huo.js v6.6 (11-24 晚) 用户「1/5/15/日各自对齐 能展开折叠… 十字线图里和副图没打通… 上拖下展… 横线在副图上体现」(选: 跟主图走/一次一个/横线两种都要):
   在作战屏里 = 跟主图同一横轴(分时→1分K画在9:30–15:00; K线页1/5/15/日→zpPerAll()同一批K逐根对齐, 跟主图一起拖/缩), 去 日/30/15/5/1 钮;
   头部指标钮一行放不下左右滑; 下沿拖条改高(zp_huo_h_v1, 双击还原); 手指点/长按拖副图 → 主图十字线跟着走(zpMainXH) + 副图十字横线右侧读数;
   ✎水平线工具开着时点副图 = 放一条横线(zp_huo_hl_v1, 按指标数值存, 只在画它的周期显示; 点已有那条=删)。公式 calc 一个数没改(tools/bt/sub_1124/calc_check.js cmp 0差异)
   独立打开(没有主图)时照旧: 周期钮 + 自己排90根。
   以下为 v6.5 原注释 ——
   jl_huo.js v6.5 (11-24) 乖离+筹码穿越+三线金坑 三合一副图: 头部指标切换【乖离|穿越|三线】+ 多周期(日/30分/15分/5分/1分)切换 + 十字线。
   v6.5 新增: 指标钮再扩【阴阳|DK】 —— 阴阳=jl_hy.js v1(公式C-1 HUO/YIN柱线: YIN1±100红线+YIN2绿线+火焰红块8.8/9.8+跌停蓝块, 11-24评审版), DK=jl_dk.js v1(公式D DK能量柱: 锚昨收三重染色+SK/SD/SJ×400细线), 动态加载同目录; 两公式只依赖C/H/L不用量/股本, 喂什么周期算什么周期, 与主图K线逐根对齐(同cw同时间刻度);
   v6.4 新增: 指标钮扩展【乖离|穿越|三线|趋势|庄控】, 趋势/庄控=jl_zd.js(v1) 动态加载同目录, 公式=B公式精选(趋势+入场/准备中+庄控, 砍泛滥启明星); v6.3 ⤢放大缩小整排副图; v6.2 十字线跨图联动 —— 主图拖十字线时广播 zpSubXH(key), 本模块接住: 乖离画竖线+读数, 并转发给 jl_sx(穿越/三线跟随); v6.1 跟随作战屏分时/K线页 —— 读 window.zpPerOf()(1/5/15/30分钟), K线页自动切对应周期(含新增30分), 分时页用头部手选;
   手点头部周期钮后30秒内以手选为准。周期/指标一份存储, 切一次全联动。
   v6 改动(不动乖离公式 calc/state/画法一个数): ①头部加指标切换, 选「穿越/三线」时显示 jl_sx.js 的副图(动态加载同目录 jl_sx.js);
   ②周期/指标一份存储(zp_huo_lv_v1/zp_huo_ind_v1) —— 切一次, 乖离和 sx 全联动(修复"切周期乖离不跟"的体验);
   ③「穿越/三线」标签下分钟级阈值说明见 jl_sx.js 头注释(−2/−5 是日线标定, 分钟级参考意义有限)。
   公式 calc/state 与 v4/v5.1 逐字一致, 一个数没改。
   v5.1 修复(不动公式/画法/结构): ①分钟K拉取全失败时死循环 —— 原来没拉到数据时每次render都立刻重拉, 失败回调又触发redraw,
           三个域名全不通时无限循环刷请求; 改为: 失败后15秒节流 + 16秒兜底自动重试一次(与「自动重试」文案相符)。
           ②悬停后切周期, 残留的越界 hover 索引让图例显示 undefined/−NaN —— legend 里钳位, 越界按未悬停处理。
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
  var LVS = ['日', '30分', '15分', '5分', '1分'], LVK = 'zp_huo_lv_v1', MK = { '30分': 'm30', '15分': 'm15', '5分': 'm5', '1分': 'm1' };
  /* v6.1: 跟随作战屏分时/K线页 —— window.zpPerOf() 返回当前K线页周期分钟数(1/5/15/30), 分时页=0(跟'日'或手选);
     K线页时自动覆盖本地周期选择, 头部周期钮在分时页仍可手选 */
  function autoLvOf(host) {
    try {
      if (typeof W.zpPerOf !== 'function') return null;
      var p = +W.zpPerOf();
      if (!(p > 0)) return null;                       /* 分时页: 不自动切, 尊重头部手选 */
      var map = { 1: '1分', 5: '5分', 15: '15分', 30: '30分' };
      return map[p] || null;
    } catch (e) { return null; }
  }
  /* 11-24: 主图横轴 —— 返回 {lv, AX}; AX={bars,n,i0,N,x(i),cw,PL,PR,H,mode}; 取不到(主图藏着/开盘前没有今天的K)=null */
  var HK2 = 'zp_huo_h_v1', HV = 0;
  function hOf() { if (HV) return HV; try { var v = +localStorage.getItem(HK2); if (v >= 60 && v <= 320) return v; return localStorage.getItem('zp_huo_big_v1') === '1' ? 164 : 100; } catch (e) { return 100; } }
  function p4(h) { return ('0000' + String(h).replace(/\D/g, '')).slice(-4); }
  function mainAxis(host) {
    try {
      var ch = document.getElementById('ch'); if (!ch || ch.style.display === 'none' || typeof W.zpPerOf !== 'function') return null;
      var p = +W.zpPerOf() || 0, c = host.__axc || (host.__axc = {}), H = hOf(), i, A, z, sig;
      if (p > 0 && typeof W.zpPerAll === 'function') {
        A = W.zpPerAll(); if (!A || A.length < 2) return null;
        z = A[A.length - 1]; sig = p + '|' + A.length + '|' + A[0].key + '|' + z.key + '|' + z.o + '|' + z.h + '|' + z.l + '|' + z.c + '|' + z.v;
        if (c.sig !== sig) { c.sig = sig; c.bars = A.map(function (k) { return { t: String(k.key), o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v || 0 }; }); }
        var i0 = -1, i1 = -1, xs = []; for (i = 0; i < A.length; i++) { xs.push(A[i].cx); if (A[i].vis) { if (i0 < 0) i0 = i; i1 = i; } }
        if (i0 < 0) return null;
        return { lv: p >= 101 ? '日' : p + '分', AX: { bars: c.bars, n: c.bars.length, i0: i0, N: i1 - i0 + 1, x: function (j) { return xs[j]; }, cw: Math.max(0.6, Math.abs(xs[1] - xs[0])), PL: 6, PR: 336, H: H, mode: 'k' } };
      }
      if (typeof W.xOfHmJL !== 'function' || !W.LIVE) return null;
      var L = W.LIVE, d0 = String(L.sessDate || ''), M = (L.hist && L.hist.m1) || [], P = L.pts || [], zm = M[M.length - 1], zp = P[P.length - 1];
      sig = '0|' + d0 + '|' + M.length + '|' + (zm ? zm.t + '#' + zm.c : '') + '|' + P.length + '|' + (zp ? zp.hm + '#' + zp.p : '');
      if (c.sig !== sig) {
        c.sig = sig; var B = [];
        M.slice(-1400).forEach(function (b) { if (+b.c > 0) B.push({ t: String(b.t).replace(/\D/g, '').slice(0, 12), o: +b.o, h: +b.h, l: +b.l, c: +b.c, v: +b.v || 0 }); });
        var lt = B.length && B[B.length - 1].t.slice(0, 8) === d0 ? B[B.length - 1].t.slice(8, 12) : '';
        P.forEach(function (q) { var hm = p4(q.hm); if (+hm < 930 || !(q.p > 0) || (lt && hm <= lt)) return; var pv = B.length ? B[B.length - 1].c : q.p; B.push({ t: d0 + hm, o: pv, h: Math.max(q.h || q.p, pv), l: Math.min(q.l || q.p, pv), c: +q.p, v: +q.v || 0 }); lt = hm; });   /* 1分K接口还没回到的那几分钟用分时点补 */
        c.bars = B;
      }
      var Bs = c.bars, j0 = -1; for (i = 0; i < Bs.length; i++) if (Bs[i].t.slice(0, 8) === d0) { j0 = i; break; }
      if (j0 < 0 || Bs.length - j0 < 2) return null;
      var xf = function (j) { var x = W.xOfHmJL(Bs[j].t.slice(8, 12)); return x == null ? NaN : x; };
      var j1 = Bs.length - 1; while (j1 > j0 && !isFinite(xf(j1))) j1--;   /* 15:00 后的盘后K 主图不画, 副图也不画 */
      if (j1 - j0 < 1) return null;
      return { lv: '1分', AX: { bars: Bs, n: Bs.length, i0: j0, N: j1 - j0 + 1, x: xf, cw: 330 / 255, PL: 6, PR: 336, H: H, mode: 'fs' } };
    } catch (e) { return null; }
  }
  function fbLv() { try { var p = +W.zpPerOf() || 0; return p >= 101 ? '日' : p === 5 || p === 15 || p === 30 ? p + '分' : '1分'; } catch (e) { return '1分'; } }
  /* 底下时间刻度(和主图同位置) */
  function taxSVG(AX, CB, lv) {
    var g = [], i;
    if (AX.mode === 'fs') [['0930', '09:30', 'start'], ['1030', '10:30', 'middle'], ['1130', '11:30/13:00', 'middle'], ['1400', '14:00', 'middle'], ['1500', '15:00', 'end']].forEach(function (a) { var x = W.xOfHmJL(a[0]); if (x != null) g.push('<text x="' + x.toFixed(1) + '" y="9.5" text-anchor="' + a[2] + '">' + a[1] + '</text>'); });
    else { var st = Math.max(1, Math.ceil(AX.N / 5)), pd = ''; for (i = AX.i0; i < AX.i0 + AX.N; i += st) { var t = String(CB[i].t), d = t.slice(4, 6) + '-' + t.slice(6, 8); g.push('<text x="' + AX.x(i).toFixed(1) + '" y="9.5" text-anchor="middle">' + (lv === '日' || t.slice(0, 8) !== pd ? d : t.slice(8, 10) + ':' + t.slice(10, 12)) + '</text>'); pd = t.slice(0, 8); } }
    return '<svg class="hta" viewBox="0 0 360 12" font-size="9.5" fill="#cfd8e6">' + g.join('') + '</svg>';
  }
  function soon(host) { if (host.__raf) return; host.__raf = (W.requestAnimationFrame || setTimeout)(function () { host.__raf = 0; redraw(host); });   /* 11-24d: 不强制清key, 横轴/数据/高度没变就不重建 */ }
  function own(on) { var o = W.__xhOwnJL = W.__xhOwnJL || {}; if (on) o.huo = 1; else delete o.huo; }
  /* 副图各窗(乖离 .hb / 各模块 section) —— 每窗 el.__ax={on,X,Y,T,Bt,i0,N,lo,hi,pv} */
  function secs(host) { var r = []; [].forEach.call(host.querySelectorAll('.hb, .sxbox .ssx, .sxbox .sec'), function (el) { var nd = el.closest('.sxIn'); if (el.__ax && el.__ax.on && el.style.display !== 'none' && (!nd || nd.style.display !== 'none') && el.querySelector('svg')) r.push(el); }); return r; }
  function secOf(t) { var s = t && t.closest && t.closest('svg'); if (!s || s.classList.contains('hta')) return null; var el = s.parentNode; while (el && el.nodeType === 1 && !el.__ax) el = el.parentNode; return el && el.__ax && el.__ax.on ? { el: el, svg: s } : null; }
  function ptOf(S, cx, cy) { var r = S.svg.getBoundingClientRect(), v = S.svg.viewBox && S.svg.viewBox.baseVal, vw = v && v.width || 360, vh = v && v.height || 100; return { x: (cx - r.left) / (r.width || 1) * vw, y: (cy - r.top) / (r.height || 1) * vh }; }
  function nearK(G, x) { var lo = 0, hi = G.N - 1; if (hi < 0) return -1; while (lo < hi) { var m = (lo + hi) >> 1; if (G.X(m) < x) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(G.X(lo - 1) - x) < Math.abs(G.X(lo) - x)) lo--; return lo; }
  function vOfY(G, y) { return G.hi - (y - G.T) / (G.Bt - G.T) * (G.hi - G.lo); }
  function fmtV(v) { var a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function layer(svg, cls) { var g = svg.querySelector('g.' + cls); if (!g) { g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', cls); g.setAttribute('pointer-events', 'none'); svg.appendChild(g); } return g; }
  function tagSVG(y, txt, col, dash) { var w = Math.max(18, txt.length * 5.4 + 6); return '<line x1="6" x2="336" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + col + '" stroke-width=".7"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/><rect x="' + (359 - w).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" width="' + w.toFixed(1) + '" height="12" rx="3" fill="rgba(14,20,28,.88)" stroke="' + col + '" stroke-width=".5"/><text x="356" y="' + (y + 3.3).toFixed(1) + '" text-anchor="end" font-size="9" fill="#fff">' + txt + '</text>'; }
  /* 十字横线: 手指按在哪个窗 = 跟手指高度; 主图拖过来 = 各窗主线那一根的值 */
  function paintHx(host, i) {
    secs(host).forEach(function (el) {
      var G = el.__ax, g = layer(el.querySelector('svg'), 'hxh'), T = host.__touch, y, v;
      if (i == null || i < G.i0 || i >= G.i0 + G.N) { g.innerHTML = ''; return; }
      if (T && T.el === el) { y = T.y; v = vOfY(G, y); } else { v = G.pv(i); if (!isFinite(v)) { g.innerHTML = ''; return; } y = G.Y(v); }
      g.innerHTML = tagSVG(y, fmtV(v), 'rgba(255,255,255,.6)', '2 2');
    });
    clearTimeout(host.__hxT); if (i != null) host.__hxT = setTimeout(function () { host.__touch = null; paintHx(host, null); }, 8000);
  }
  /* ✎ 水平线(副图): {code:[{id:'指标|窗', lv, v}]} */
  var HLK = 'zp_huo_hl_v1';
  function hlOn() { return !!document.querySelector('.zd-bar button[data-t="hl"].on'); }
  function hlAll() { try { return JSON.parse(localStorage.getItem(HLK) || '{}') || {}; } catch (e) { return {}; } }
  function hlId(host, el) { return (host.__ind || indOf()) + '|' + (el.classList.contains('hb') ? 'hb' : el.className); }
  function paintHL(host) {
    var A = hlAll(), L = A[codeOf()] || [];
    secs(host).forEach(function (el) {
      var G = el.__ax, id = hlId(host, el), g = layer(el.querySelector('svg'), 'hhl'), o = [];
      L.forEach(function (h) { if (h.id !== id || h.lv !== host.__lv) return; var y = G.Y(h.v); if (y < G.T - 1 || y > G.Bt + 1) return; o.push(tagSVG(y, fmtV(h.v), '#7ab8ff', '7 3')); });
      g.innerHTML = o.join('');
    });
  }
  function hlTap(host, S, cx, cy) {
    var G = S.el.__ax, q = ptOf(S, cx, cy), A = hlAll(), c = codeOf(), L = A[c] = A[c] || [], id = hlId(host, S.el), j;
    for (j = L.length - 1; j >= 0; j--) if (L[j].id === id && L[j].lv === host.__lv && Math.abs(G.Y(L[j].v) - q.y) <= 7) { L.splice(j, 1); break; }   /* 点在已有那条上 = 删 */
    if (j < 0) L.push({ id: id, lv: host.__lv, v: +vOfY(G, Math.max(G.T, Math.min(G.Bt, q.y))).toPrecision(6) });
    try { localStorage.setItem(HLK, JSON.stringify(A)); } catch (e) { }
    paintHL(host); try { navigator.vibrate && navigator.vibrate(8); } catch (_) { }
  }
  /* 手指在副图上 → 主图十字线(主图再广播 zpSubXH 回来画副图竖线/读数) */
  function drive(host, S, cx, cy) {
    var G = S.el.__ax, q = ptOf(S, cx, cy), k = nearK(G, q.x); if (k < 0) return;
    var i = G.i0 + k, CB = host.__CB, b = CB && CB[i]; if (!b) return;
    host.__touch = { el: S.el, y: Math.max(G.T, Math.min(G.Bt, q.y)) };
    var ch = document.getElementById('ch'), m = ch && ch.getScreenCTM && ch.getScreenCTM();
    if (m && W.zpMainXH && typeof W.Y === 'function') { var p = ch.createSVGPoint(); p.x = G.X(k); p.y = W.Y(+b.c); p = p.matrixTransform(m); W.zpMainXH.draw(p.x, p.y); }
    else if (W.zpSubXH) W.zpSubXH(host.__ax && host.__ax.mode === 'fs' ? String(b.t).slice(8, 12) : b.t);
  }
  function bindAx(host) {
    host.addEventListener('touchstart', function (e) {
      var S = secOf(e.target); if (!S || !host.__ax) return; var t = e.touches[0];
      if (hlOn()) { if (e.cancelable) e.preventDefault(); hlTap(host, S, t.clientX, t.clientY); return; }
      var T0 = host.__tg = { S: S, x: t.clientX, y: t.clientY, act: false, mv: false };
      clearTimeout(host.__tgT); host.__tgT = setTimeout(function () { if (host.__tg === T0 && !T0.mv) { T0.act = true; own(true); drive(host, S, T0.x, T0.y); try { navigator.vibrate && navigator.vibrate(8); } catch (_) { } } }, 200);
    }, { passive: false });
    host.addEventListener('touchmove', function (e) {   /* iOS: touch-action 只在 touchstart 读, 长按后要在 touchmove 里 preventDefault 才不滚页面 */
      var T0 = host.__tg; if (!T0) return; var t = e.touches[0];
      if (T0.act) { if (e.cancelable) e.preventDefault(); drive(host, T0.S, t.clientX, t.clientY); return; }
      if (Math.abs(t.clientX - T0.x) > 8 || Math.abs(t.clientY - T0.y) > 8) { T0.mv = true; clearTimeout(host.__tgT); }
    }, { passive: false });
    var te = function () { var T0 = host.__tg; host.__tg = null; clearTimeout(host.__tgT); if (!T0) return; if (!T0.act && !T0.mv) drive(host, T0.S, T0.x, T0.y); own(false); if (host.__pend) { host.__pend = 0; soon(host); } };
    host.addEventListener('touchend', te); host.addEventListener('touchcancel', te);
    host.addEventListener('mousemove', function (e) { if (host.__tg || !host.__ax || hlOn()) return; var S = secOf(e.target); if (S) drive(host, S, e.clientX, e.clientY); });
    host.addEventListener('mousedown', function (e) { if (host.__tg || !host.__ax || !hlOn()) return; var S = secOf(e.target); if (S) { e.preventDefault(); hlTap(host, S, e.clientX, e.clientY); } });
    host.addEventListener('mouseleave', function () { if (host.__ax && W.zpMainXH && !host.__tg) { host.__touch = null; W.zpMainXH.hide(); } });
  }
  /* 下沿拖条: 上下拖改高, 双击还原 (同主图副图 zp_ph2_v1 的手势写法) */
  var GR = null, grTap = 0;
  function grBegin(e) {
    var t = e.target && e.target.closest && e.target.closest('[data-zphgrip]'); if (!t || GR) return;
    if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation();
    var host = t.closest('#zpHuoJL'), q = e.touches ? e.touches[0] : e, now = Date.now(); if (!host) return;
    if (grTap && now - grTap < 320) { grTap = 0; HV = 0; try { localStorage.removeItem(HK2); } catch (eS) { } soon(host); return; }
    GR = { host: host, y: q.clientY, h: hOf(), k: (host.getBoundingClientRect().width || 360) / 360, mv: false }; own(true);
  }
  function grMove(e) {
    if (!GR) return; if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation();
    var q = e.touches ? e.touches[0] : e; if (Math.abs(q.clientY - GR.y) > 3) GR.mv = true;
    var h = Math.max(60, Math.min(320, Math.round(GR.h + (q.clientY - GR.y) / GR.k))); if (h !== hOf()) { HV = h; soon(GR.host); }
  }
  function grEnd(e) { if (!GR) return; grTap = GR.mv ? 0 : Date.now(); if (GR.mv) try { localStorage.setItem(HK2, String(hOf())); } catch (eS) { } GR = null; own(false); }
  if (W.addEventListener && !W.__zpHuoGrip) {
    W.__zpHuoGrip = 1;
    W.addEventListener('touchstart', grBegin, { capture: true, passive: false }); W.addEventListener('mousedown', grBegin, true);
    W.addEventListener('touchmove', grMove, { capture: true, passive: false }); W.addEventListener('mousemove', grMove, true);
    W.addEventListener('touchend', grEnd, true); W.addEventListener('touchcancel', grEnd, true); W.addEventListener('mouseup', grEnd, true);
  }
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
      if (i >= hosts.length) { e.fly = 0; e.err = '几个域名都没通'; e.at = Date.now(); redraw(host);
        if (!e.tmr) e.tmr = setTimeout(function () { e.tmr = 0; if (!e.bars && !e.fly && host.isConnected && e.code === code) redraw(host); }, 16000);   /* 兜底自动重试: 一轮失败后16秒再试一次, 不叠发 */
        return; }
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
    var due = e.bars ? 55000 : 15000;   /* 有数据55秒刷新; 没拉到时15秒一档重试 —— 修复: 原来没数据时每次render都立刻重拉, 全失败会无限循环 */
    if (Date.now() - (e.at || 0) > due) fetchMin(host, code, lv);
    if (e.bars) return { bars: e.bars };
    return { bars: null, msg: e.err ? lv + 'K取不到：' + e.err + '（自动重试）' : '正在取' + lv + 'K…' };
  }
  /* 横轴标签: 日K=月-日; 分钟=时:分, 每天第一根标月-日 (纯函数, 可单测) */
  function labels(B, lv) {
    var out = [], pd = '';
    for (var i = 0; i < B.length; i++) {
      var d = String(B[i].t).replace(/\D/g, '');
      if (lv === '日') out.push(d.slice(4, 6) + '-' + d.slice(6, 8));
      else { var day = d.slice(0, 8); out.push(day !== pd ? d.slice(4, 6) + '-' + d.slice(6, 8) : d.slice(8, 10) + ':' + d.slice(10, 12)); pd = day; }
    }
    return out;
  }
  /* 十字线覆盖层: 竖线+时针横线+取值点+数值 (纯函数, 可单测); k<0 返回空 */
  function hxSVG(G, k) {
    if (!G || !(k >= 0) || k >= G.N) return '';
    var i = G.i0 + k, x = G.X ? G.X(k) : G.PL + G.cw * (k + 0.5), y = G.T + (G.vmax - G.R.H1[i]) / (G.vmax - G.vmin) * (G.Bt - G.T);
    if (G.ax) return '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + G.T + '" y2="' + G.Bt + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="#0b131d" stroke="#2fd17a" stroke-width="1.2"/>';   /* 11-24: 横线由 paintHx 画 */
    return '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + G.T + '" y2="' + G.Bt + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/>'
      + '<line x1="' + G.PL + '" x2="' + (G.W - G.PR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="rgba(47,209,122,.7)" stroke-width=".8" stroke-dasharray="2 2"/>'
      + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="#0b131d" stroke="#2fd17a" stroke-width="1.2"/>'
      + '<text x="' + (G.W - G.PR - 2) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#2fd17a" stroke="#000" stroke-width=".5" paint-order="stroke">' + f2(G.R.H1[i]) + '</text>';
  }
  function chips(lv) { return '<span class="hps">' + LVS.map(function (l) { return '<button class="hp' + (l === lv ? ' on' : '') + '" data-lv="' + l + '" type="button">' + (l === '日' ? '日' : l.replace('分', '')) + '</button>'; }).join('') + '</span>'; }
  /* v6: 指标切换 【乖离|穿越|三线】 */
  var INDS = ['乖离', '穿越', '三线', '趋势', '庄控', '阴阳', 'DK'], INDK = 'zp_huo_ind_v1', SXV = '?v=13', ZDV = '?v=16', HYV = '?v=2', DKV = '?v=2';
  function indOf() { try { var v = localStorage.getItem(INDK); if (INDS.indexOf(v) >= 0) return v; } catch (e) { } return '乖离'; }
  function GRPOF(x) { return x === '穿越' || x === '三线' ? { m: 'JLSx', k: '__sxSt', f: 'jl_sx.js' } : x === '趋势' || x === '庄控' ? { m: 'JLZd', k: '__zdSt', f: 'jl_zd.js' } : x === '阴阳' ? { m: 'JLHy', k: '__hySt', f: 'jl_hy.js' } : { m: 'JLDk', k: '__dkSt', f: 'jl_dk.js' }; }   /* v6.5: 指标→副图模块查表 */
  function indChips(ind) { return '<span class="hps">' + INDS.map(function (t) { return '<button class="hp hi' + (t === ind ? ' on' : '') + '" data-ind="' + t + '" type="button">' + t + '</button>'; }).join('') + '</span>'; }
  var CSS = '#zpHuoJL{margin:0 0 3px;padding:4px 6px 2px;color:#fff;font:400 11px/1.35 -apple-system,"PingFang SC",ui-rounded,sans-serif;font-variant-numeric:tabular-nums}' +
    '#zpHuoJL .hh{display:flex;align-items:center;gap:7px;height:19px;white-space:nowrap;overflow:hidden}#zpHuoJL .ht{font-weight:500}' +
    '#zpHuoJL .hs{margin-left:auto;font-size:10.5px}#zpHuoJL .hf{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center}' +
    '#zpHuoJL .hl{display:flex;gap:8px;font-size:10px;white-space:nowrap;overflow:hidden}#zpHuoJL svg{display:block;width:100%;height:auto;touch-action:pan-y}' +
    '#zpHuoJL.fold .hb,#zpHuoJL.fold .hl{display:none}body.injlin .chartbox>#zpHuoJL{order:1}' +
    '#zpHuoJL .hps{display:inline-flex;gap:3px;flex:none}' +
    /* 11-24: 指标钮放进可左右滑的格子, 不再把右边挤出去; 下沿拖条; 时间刻度 */
    '#zpHuoJL .hcs{flex:1 1 auto;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}#zpHuoJL .hcs::-webkit-scrollbar{display:none}#zpHuoJL .hs{flex:none;margin-left:0}' +
    '#zpHuoJL .hta{display:block;width:100%;height:auto}#zpHuoJL .hgr{position:relative;height:12px;margin:-2px 0 -4px;cursor:ns-resize;touch-action:none}#zpHuoJL .hgr:after{content:"";position:absolute;left:50%;top:5px;width:24px;height:2.2px;margin-left:-12px;border-radius:2px;background:rgba(255,255,255,.45)}' +
    '#zpHuoJL.fold .hta,#zpHuoJL.fold .hgr{display:none}' +
    '#zpHuoJL .hp{background:none;border:1px solid rgba(255,255,255,.25);border-radius:6px;color:rgba(255,255,255,.7);font:400 9.5px/1.5 -apple-system,sans-serif;padding:0 3px;cursor:pointer}' +
    /* v6.5: 7个指标钮+5个周期钮, padding 5→3px 防头部溢出 */
    '#zpHuoJL .hp.on{border-color:#2fd17a;color:#2fd17a}' +
    /* v6: 指标钮 + sx 容器 */
    '#zpHuoJL .hi{border-color:rgba(120,200,255,.45)}#zpHuoJL .hi.on{border-color:#3d8bff;color:#7ab8ff}' +
    '#zpHuoJL .sxbox{display:block}#zpHuoJL.fold .sxbox{display:none}#zpHuoJL .sxbox .ssx{background:rgba(255,255,255,.03);border-radius:6px;padding:3px 4px 2px;margin:0 0 3px}';
  var FK = 'zp_huo_fold_v1';
  function mount(before) {
    if (!before || !before.parentNode) return null;
    var host = document.getElementById('zpHuoJL');
    if (!host) {
      if (!document.getElementById('zpHuoCss')) { var st = document.createElement('style'); st.id = 'zpHuoCss'; st.textContent = CSS; document.head.appendChild(st); }
      host = document.createElement('section'); host.id = 'zpHuoJL'; host.setAttribute('aria-label', '乖离副图');
      try { if (localStorage.getItem(FK) === '1') host.classList.add('fold'); } catch (e) { }
      host.addEventListener('click', function (e) {
        var xzb = e.target && e.target.closest && e.target.closest('.xz');
        if (xzb) { var big = !(function () { try { return localStorage.getItem('zp_huo_big_v1') === '1'; } catch (eB2) { return false; } })(); try { localStorage.setItem('zp_huo_big_v1', big ? '1' : '0'); localStorage.removeItem(HK2); } catch (eB3) { } HV = 0; xzb.textContent = big ? '⤡' : '⤢'; host.__key = ''; redraw(host); if (W.JLSx && host.__sxSt && host.__sxSt.bars) { try { W.JLSx.feed(host.__sxSt, host.__sxSt.bars, host.__sxSt.lv, host.__sxSt.which, host.__sxSt.code); } catch (eS) { } } return; }
        var b = e.target && e.target.closest && e.target.closest('.hf');
        if (b) { host.classList.toggle('fold'); try { localStorage.setItem(FK, host.classList.contains('fold') ? '1' : '0'); } catch (e2) { } b.textContent = host.classList.contains('fold') ? '+' : '−'; return; }
        var p = e.target && e.target.closest && e.target.closest('.hp');
        if (p && p.getAttribute('data-ind')) { var ind = p.getAttribute('data-ind'); if (INDS.indexOf(ind) < 0) return; host.__ind = ind; try { localStorage.setItem(INDK, ind); } catch (e4) { } host.__key = ''; redraw(host); return; }   /* v6 指标切换 */
        if (p) { var lv = p.getAttribute('data-lv'); if (LVS.indexOf(lv) < 0) return; host.__lv = lv; host.__manualUntil = Date.now() + 30000; try { localStorage.setItem(LVK, lv); } catch (e3) { } host.__key = ''; redraw(host); }
      });
      var mv = function (e) { var G = host.__g; if (!G || G.ax) return; var sv = host.querySelector('svg'); if (!sv) return; var r = sv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e, x = (t.clientX - r.left) / r.width * G.W; host.__hov = Math.max(0, Math.min(G.N - 1, Math.floor((x - G.PL) / G.cw))); legend(host); };
      host.addEventListener('mousemove', mv); host.addEventListener('touchstart', mv, { passive: true }); host.addEventListener('touchmove', mv, { passive: true });
      bindAx(host);   /* 11-24 */
      host.addEventListener('mouseleave', function () { host.__hov = -1; legend(host); }); host.addEventListener('touchend', function () { setTimeout(function () { host.__hov = -1; legend(host); }, 1500); });
    }
    if (host.parentNode !== before.parentNode || host.nextSibling !== before) before.parentNode.insertBefore(host, before);
    /* 11-24: 主图每次重画(拖动/缩放/换周期)都走 MacdFS.draw → 副图下一帧跟着重画, 不等2秒 */
    if (W.MacdFS && W.MacdFS.draw && !W.MacdFS.__huoH) { var md0 = W.MacdFS.draw; W.MacdFS.draw = function () { var r; try { r = md0.apply(this, arguments); } catch (eM) { } var hh = document.getElementById('zpHuoJL'); if (hh && hh.__args) soon(hh); return r; }; W.MacdFS.__huoH = 1; }
    /* v6.2: 接住主图十字线广播 —— 主图/量MACD副图已有 zpSubXH 链(参数可能是 k.key 或 4位hm), 这里**链式追加**不覆盖: 乖离竖线+读数 → 转发 jl_sx */
    if (!W.__zpHuoXhHooked && W.zpSubXH) {   /* 11-24: 等主图的 zpSubXH 先挂好再接(不然链断) */
      W.__zpHuoXhHooked = true;
      var z0JL = W.zpSubXH;
      W.zpSubXH = function (key) {
        try { if (z0JL) z0JL(key); } catch (e0) { }
        try {
          var h = document.getElementById('zpHuoJL');
          if (h && h.__g && h.__CB) {
            var kk = String(key || '').replace(/\D/g, '');
            if (h.__tnBars !== h.__CB) { h.__tn = h.__CB.map(function (b) { return String(b && b.t || '').replace(/\D/g, ''); }); h.__tnBars = h.__CB; }
            var tn = h.__tn || [], i = -1, j;
            for (j = tn.length - 1; j >= 0; j--) if (tn[j] === kk) { i = j; break; }
            if (i < 0 && kk.length >= 10) for (j = tn.length - 1; j >= 0; j--) if (tn[j] && tn[j] <= kk) { i = j; break; }
            if (i < 0 && kk.length === 8) for (j = tn.length - 1; j >= 0; j--) if (tn[j].slice(0, 8) === kk) { i = j; break; }
            if (i < 0 && kk.length === 4) { var ld = tn.length ? tn[tn.length - 1].slice(0, 8) : ''; for (j = tn.length - 1; j >= 0; j--) if (tn[j].slice(0, 8) === ld && tn[j].slice(8, 12) <= kk) { i = j; break; } }
            var G = h.__g;
            if (i >= 0 && G && G.ax && (i < G.i0 || i >= G.i0 + G.N)) i = -1;   /* 11-24: 在副图视窗外 */
            if (i >= 0 && G) { h.__hov = Math.max(0, Math.min(G.N - 1, i - G.i0)); legend(h); clearTimeout(h.__xhT); h.__xhT = setTimeout(function () { h.__hov = -1; legend(h); }, 8000); }
            else if (G && G.ax) { h.__hov = -1; legend(h); }
            h.__xi = i;
          }
          if (W.JLSx && W.JLSx.xhKey) W.JLSx.xhKey(key);
          if (W.JLZd && W.JLZd.xhKey) W.JLZd.xhKey(key);   /* v6.4: 竖线也转发给趋势/庄控 */
          if (W.JLHy && W.JLHy.xhKey) W.JLHy.xhKey(key);   /* v6.5: 阴阳/DK 副图跟随十字线 */
          if (W.JLDk && W.JLDk.xhKey) W.JLDk.xhKey(key);
          if (h && h.__ax) { if (key == null) h.__touch = null; paintHx(h, key == null || !(h.__xi >= 0) ? null : h.__xi); }   /* 11-24: 十字横线+读数 */
        } catch (e) { }
      };
    }
    /* v6: 动态加载 jl_sx.js(同目录), 建常驻 sx 节点 —— 失败时指标钮点了会提示 */
    if (!host.__sxSt) {
      host.__sxSt = { node: null, s1: null, s2: null, ready: false, code: '', cap: 0, which: '穿越', bars: null, lv: null };
      host.__zdSt = { node: null, s1: null, s2: null, ready: false, code: '', cap: 0, which: '趋势', bars: null, lv: null };
      host.__hySt = { node: null, s1: null, s2: null, ready: false, code: '', cap: 0, which: '阴阳', bars: null, lv: null };   /* v6.5 */
      host.__dkSt = { node: null, s1: null, s2: null, ready: false, code: '', cap: 0, which: 'DK', bars: null, lv: null };    /* v6.5 */
      host.__ind = indOf();
      var sx = document.createElement('script');
      sx.src = 'jl_sx.js' + SXV;
      sx.onload = function () {
        try { if (!W.JLSx) return; var nd = W.JLSx.embedNode({ code: codeOf(host) });
          host.__sxSt.node = nd.node; host.__sxSt.s1 = nd.s1; host.__sxSt.s2 = nd.s2; host.__sxSt.ready = true; host.__sxSt.code = nd.code;
        } catch (e) { }
      };
      sx.onerror = function () { host.__sxSt = { node: null, ready: false }; };
      document.head.appendChild(sx);
      var zd = document.createElement('script');
      zd.src = 'jl_zd.js' + ZDV;
      zd.onload = function () {
        try { if (!W.JLZd) return; var nd = W.JLZd.embedNode({ code: codeOf() });
          host.__zdSt.node = nd.node; host.__zdSt.s1 = nd.s1; host.__zdSt.s2 = nd.s2; host.__zdSt.s3 = nd.s3; host.__zdSt.ready = true; host.__zdSt.code = nd.code;   /* v1.2: +s3 多空窗 */
        } catch (ez) { }
      };
      zd.onerror = function () { host.__zdSt = { node: null, ready: false }; };
      document.head.appendChild(zd);
      var hy = document.createElement('script');   /* v6.5: 阴阳(jl_hy.js 公式C-1 HUO/YIN柱线) */
      hy.src = 'jl_hy.js' + HYV;
      hy.onload = function () {
        try { if (!W.JLHy) return; var nd = W.JLHy.embedNode({ code: codeOf() });
          host.__hySt.node = nd.node; host.__hySt.s1 = nd.s1; host.__hySt.s2 = nd.s2; host.__hySt.ready = true; host.__hySt.code = nd.code;
        } catch (eh) { }
      };
      hy.onerror = function () { host.__hySt = { node: null, ready: false }; };
      document.head.appendChild(hy);
      var dk = document.createElement('script');   /* v6.5: DK能量柱(jl_dk.js 公式D) */
      dk.src = 'jl_dk.js' + DKV;
      dk.onload = function () {
        try { if (!W.JLDk) return; var nd = W.JLDk.embedNode({ code: codeOf() });
          host.__dkSt.node = nd.node; host.__dkSt.s1 = nd.s1; host.__dkSt.s2 = nd.s2; host.__dkSt.ready = true; host.__dkSt.code = nd.code;
        } catch (ed) { }
      };
      dk.onerror = function () { host.__dkSt = { node: null, ready: false }; };
      document.head.appendChild(dk);
    }
    return host;
  }
  function f2(v) { return (v >= 0 ? '' : '−') + Math.abs(v).toFixed(2); }
  function legend(host) {
    var G = host.__g, el = host.querySelector('.hl'); if (!G || !el) return;
    var hv = (host.__hov >= 0 && host.__hov < G.N) ? host.__hov : -1, k = hv >= 0 ? hv : G.N - 1, i = G.i0 + k, R = G.R;   /* 钳位: 切周期后残留越界hover按未悬停处理 */
    el.innerHTML = '<span>' + G.D[i] + '</span>' + (G.m20 ? '<span>20日线 ' + G.m20.toFixed(2) + '</span>' : '') + '<span style="color:#2fd17a">时针 ' + f2(R.H1[i]) + '</span><span style="color:#99eeee">分针 ' + f2(R.H6[i]) + '</span><span style="color:#ffcc17">辅线 ' + f2(R.FU[i]) + '</span><span style="color:#ff5cff">底撑 ' + f2(R.D4[i]) + '</span><span style="color:#ffff3a">二撑 ' + f2(R.ER[i]) + '</span>';
    var hx = host.querySelector('.hx'); if (hx) hx.innerHTML = hxSVG(G, hv);   /* 十字线只在悬停/触摸时画 */
  }
  function render(host, B, sess, opt) {
    if (!host) return;
    opt = opt || {};
    host.__args = { B: B, sess: sess, opt: opt };
    /* v6.1: 作战屏K线页周期联动 —— 手点头部周期钮后30秒内以手选为准, 其余时候跟随 zpPerOf() */
    if (host.__tg && host.__tg.act) { host.__pend = 1; return; }   /* 11-24: 手指正按着拖十字线时不重建(否则手势断) */
    var MA = mainAxis(host), AX = MA ? MA.AX : null, inMain = typeof W.zpPerOf === 'function';   /* 11-24: 跟主图走 */
    var lv = MA ? MA.lv : inMain ? fbLv() : ((Date.now() < (host.__manualUntil || 0)) ? (host.__lv || loadLv()) : (autoLvOf(host) || host.__lv || loadLv()));
    host.__lv = lv; host.__ax = AX; W.__zpSubAx = AX;
    var CHP = inMain ? '' : chips(lv), scl = host.querySelector('.hcs'), scl0 = scl ? scl.scrollLeft : 0;
    var fd = host.classList.contains('fold');
    var S = (B && B.length >= 20) ? state(B, sess) : null;   /* 头部永远日K口径 */
    var CB = AX ? AX.bars : B;
    if (!AX && lv !== '日') {
      var mb = minBars(host, lv, opt);
      if (!mb.bars || mb.bars.length < 40) {
        host.__key = ''; host.__g = null;
        var indM = host.__ind || indOf(); host.__ind = indM;
        host.innerHTML = '<div class="hh"><span class="ht">' + (indM === '乖离' ? '乖离 · ' + lv : indM + ' · ' + lv) + '</span>' + '<span class="hcs">' + indChips(indM) + CHP + '</span>' + '<button class="hf xz" type="button" aria-label="放大缩小">⤢</button><button class="hf" type="button" aria-label="折叠">' + (fd ? '+' : '−') + '</button></div><div class="hh"><span class="hs">' + mb.msg + '</span></div><div class="sxbox"></div>';
        var sxbM = host.querySelector('.sxbox');
        ['sxSt', 'zdSt', 'hySt', 'dkSt'].forEach(function (kn) { if (host['__' + kn] && host['__' + kn].node) sxbM.appendChild(host['__' + kn].node); });
        if (indM !== '乖离') { var gm = GRPOF(indM), modM = W[gm.m], sttM = host[gm.k]; if (modM && sttM && sttM.ready) { try { modM.feed(sttM, mb.bars || sttM.bars, lv, indM, codeOf()); } catch (e6) { } } }
        return;
      }
      CB = mb.bars;
    }
    var key = (AX ? AX.i0 + ',' + AX.N + ',' + AX.x(AX.i0).toFixed(1) + ',' + AX.x(AX.i0 + AX.N - 1).toFixed(1) + ',' + AX.H + '|' : 'H' + hOf() + '|') + (host.__ind || indOf()) + '|' + lv + '|' + (CB && CB.length ? CB.length + '@' + CB[CB.length - 1].t + '@' + CB[CB.length - 1].c : '0') + '|' + sess + '|' + (B && B.length ? B.length + '@' + B[B.length - 1].c : '');
    if (host.__key === key) return; host.__key = key;
    if (!CB || CB.length < 40) { host.__g = null; host.innerHTML = '<div class="hh"><span class="ht">' + ((host.__ind || indOf()) === '乖离' ? '日线乖离' : (host.__ind || indOf()) + ' · ' + lv) + '</span>' + '<span class="hcs">' + indChips(host.__ind || indOf()) + CHP + '</span>' + '<span class="hs">日K还没到（一直这样=日K拉不到）</span></div><div class="sxbox"></div>'; var sxbK = host.querySelector('.sxbox'); ['sxSt', 'zdSt', 'hySt', 'dkSt'].forEach(function (kn) { if (host['__' + kn] && host['__' + kn].node) sxbK.appendChild(host['__' + kn].node); }); return; }
    host.__CB = CB;   /* v6.2: 供 zpSubXH 十字线匹配 */
    var zb = CB[CB.length - 1], rk = CB.length + '|' + CB[0].t + '|' + zb.t + '|' + zb.c + '|' + zb.h + '|' + zb.l, R = host.__rk === rk && host.__R ? host.__R : (host.__R = calc(CB)); host.__rk = rk;   /* 11-24: 同一批K不重算 */
    var N = AX ? AX.N : Math.min(90, R.n), i0 = AX ? AX.i0 : R.n - N, D = labels(CB, lv);
    var bigJL = (function () { try { return localStorage.getItem('zp_huo_big_v1') === '1'; } catch (eB) { return false; } })();
    var Wd = AX ? 360 : 380, PL = AX ? AX.PL : 24, PR = AX ? 360 - AX.PR : 3, T = 6, Bt = AX ? AX.H - 3 : (bigJL ? 164 : 100), Hh = AX ? AX.H : (bigJL ? 178 : 114), cw = AX ? AX.cw : (Wd - PL - PR) / N,   /* viewBox 宽380≈手机屏宽, 字不被缩小; 11-24 嵌主图=360同主图 */
        X = AX ? function (k) { return AX.x(i0 + k); } : function (k) { return PL + cw * (k + 0.5); };
    var vs = [3, -5]; for (var k = 0; k < N; k++) { var i = i0 + k; vs.push(R.H1[i], R.H6[i], R.FU[i], R.D4[i], R.ER[i]); }
    var vmax = Math.max.apply(null, vs), vmin = Math.min.apply(null, vs), Y = function (v) { return T + (vmax - v) / (vmax - vmin) * (Bt - T); };
    var g = [], pt = function (a) { var s = []; for (var k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k]).toFixed(1)); return s.join(' '); };
    for (k = 0; k < N; k++) { i = i0 + k; if (i > 0 && R.C[i - 1] < R.M20[i - 1]) g.push('<rect x="' + (X(k) - cw / 2).toFixed(1) + '" y="' + T + '" width="' + cw.toFixed(2) + '" height="' + (Bt - T) + '" fill="rgba(80,140,255,.09)"/>'); }   /* 蓝底 = 那根开盘前(上一根收盘)在20均线下 */
    [[-2, '−2', '#3d7bff', 1.3, ''], [-5, '−5', '#8a8a8a', .8, '']].forEach(function (a) { g.push('<line x1="' + PL + '" x2="' + (Wd - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="' + a[2] + '" stroke-width="' + a[3] + '"' + (a[4] ? ' stroke-dasharray="' + a[4] + '"' : '') + '/><text x="' + (AX ? 359 : PL - 4) + '" y="' + (Y(a[0]) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#fff">' + a[1] + '</text>'); });
    g.push('<text x="' + (AX ? 359 : PL - 4) + '" y="' + (Y(vmax) + 8) + '" text-anchor="end" font-size="10" fill="#fff">' + vmax.toFixed(0) + '</text><text x="' + (AX ? 359 : PL - 4) + '" y="' + (Y(vmin) - 1) + '" text-anchor="end" font-size="10" fill="#fff">' + vmin.toFixed(0) + '</text>');
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
    for (k = 0; !AX && k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Hh - 3) + '" text-anchor="middle" font-size="10" fill="#fff">' + D[i0 + k] + '</text>');
    g.push('<g class="hx"></g>');   /* 十字线覆盖层, legend() 里填 */
    var st = !S ? '' : S.below ? '<span style="color:#8fb8ff">线下 · 卖后多等≈' + S.wait.toFixed(1) + '%</span>' : '<span>线上 · 照常接</span>';   /* 依据 tools/bt/huo2_adaptive_1123.js / 1114总账 11-23c; 参考, 不改尺子 */
    var ind = host.__ind || indOf(); host.__ind = ind;
    var indIsHu = ind === '乖离';
    host.innerHTML = '<div class="hh"><span class="ht">' + (indIsHu ? (lv === '日' ? '日线乖离' : '乖离 · ' + lv) : (ind + ' · ' + lv)) + '</span>' + (indIsHu && S && !inMain ? '<span>20日线 ' + S.m20.toFixed(2) + '</span>' : '') + '<span class="hcs">' + indChips(ind) + CHP + '</span><span class="hs">' + st + '</span><button class="hf xz" type="button" aria-label="放大缩小">' + (bigJL ? '⤡' : '⤢') + '</button><button class="hf" type="button" aria-label="折叠">' + (fd ? '+' : '−') + '</button></div><div class="hl" style="display:' + (indIsHu ? '' : 'none') + '"></div><div class="hb" style="display:' + (indIsHu ? '' : 'none') + '"><svg viewBox="0 0 ' + Wd + ' ' + Hh + '">' + g.join('') + '</svg></div><div class="sxbox"></div>' + (AX ? taxSVG(AX, CB, lv) : '') + (inMain ? '<div class="hgr" data-zphgrip="1" title="上下拖动改高度; 双击还原"></div>' : '');
    scl = host.querySelector('.hcs'); if (scl && scl0) scl.scrollLeft = scl0;   /* 11-24: 重画不把指标钮滚回最左 */
    /* v6: 指标切换 —— 穿越/三线 显示 sx 区域, 与周期联动; sx 节点常驻内存, 每次重绘挪回 */
    var sxb = host.querySelector('.sxbox');
    var grp = GRPOF(ind);   /* v6.5: 查表 {m:模块全局名, k:st键名, f:文件名} —— sx/zd/hy/dk 四组常驻节点, 选中组显示其余隐藏 */
    ['sxSt', 'zdSt', 'hySt', 'dkSt'].forEach(function (kn) {
      if (host['__' + kn] && host['__' + kn].node) { sxb.appendChild(host['__' + kn].node); host['__' + kn].node.style.display = (kn === grp.k.slice(2)) ? '' : 'none'; }
    });
    if (!indIsHu) {
      var modJL = W[grp.m], sttJL = host[grp.k];
      if (!modJL || !sttJL || !sttJL.ready) sxb.innerHTML += '<div style="color:#8fb8ff;font-size:10.5px;padding:2px 2px">' + grp.f + ' 还没加载好…（检查同目录文件）</div>';
      else if (CB && CB.length >= 40) { try { modJL.feed(sttJL, CB, lv, ind, codeOf()); } catch (e5) { } }
    }
    host.__g = { W: Wd, PL: PL, PR: PR, cw: cw, N: N, i0: i0, R: R, D: D, vmax: vmax, vmin: vmin, T: T, Bt: Bt, X: X, ax: !!AX, m20: S && inMain ? S.m20 : 0 }; if (!(host.__hov >= 0)) host.__hov = -1; legend(host);
    var hbE = host.querySelector('.hb'); if (hbE) hbE.__ax = { on: !!AX, X: X, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: vmin, hi: vmax, pv: function (ii) { return R.H1[ii]; } };
    if (AX) paintHL(host);   /* 11-24: ✎ 横线 */
  }
  W.JLHuo = { calc: calc, state: state, mount: mount, render: render, _labels: labels, _hx: hxSVG };
})(window);
