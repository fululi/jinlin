/* jl_dk.js v1 (11-24) 公式D DK能量柱副图 —— 挂 jl_huo v6.5 指标钮【DK】, 架构同 jl_sx/jl_zd/jl_hy。
   公式 = 11-24 评审版(scripts/tdx_dk_review.py, 原通达信公式修死代码后口径):
     WW=(2C+H+L)/4;  SKK=(EMA(WW,13)−EMA(WW,21))×180 (原式×1e-9数值失效只剩符号, 评审修复×180);
     SDD=EMA(SKK,2);  多=SKK>SDD;  多↑/空↓=SKK 上/下穿 SDD;
     SK通道: em2=EMA(WW,2), slope=em2 最近7点线性回归斜率(i<6为0), SK=(slope×15+WW)×0.8×0.0001
             (原式×0.0001数值压没仅剩交叉, ×400显示), SD=EMA(SK,2), SJ=2.8SK−1.8SD;
     DK=2×(SMA(C,3,1)−SMA(C,5,1))×180, 锚=昨收 RC=REF(C,1)(原式 DYNAINFO(3) 现价→昨收可回测);
     柱色三重染色(通达信后画覆盖先画, 优先级从低到高): 灰#888 | 红=SK>SD且DK≤RC | 紫=DK>0且SK>SD |
       橙=DK>0且SK<SD | 绿=DK>0且空头 | 黄=多↑ | 绿=空↓ | 绿=DK<0且空头且SK<SD。
     SK/SD/SJ×400 叠加显示(评审图同款), 线宽0.8/0.8/0.7 —— 比评审图(lw2.6柱)细, 柱宽随cw≈1.1~2px。
   y轴=价格锚: mean(RC)±1.35×max|DK|(评审图口径), 柱从昨收出发向上/下=当日动量能量。
   公式不用成交量/流通股本 → 喂什么周期算什么周期, 柱与K线同 bars 逐根对齐(同 cw 同时间刻度)。
   周期语义: SMA3/5、EMA13/21 按根数平移 —— 日=约一周动量 / 5分≈1天 / 1分≈半小时。
   周期/十字线/放大缩小: 与 jl_huo/sx/zd 同一套(zpPerOf 联动, zpSubXH 广播, zp_huo_big_v1)。
   独立用法: JLDk.mount(beforeEl,{code}) 自拉数据; 嵌入: st=JLDk.embedNode({code}), JLDk.feed(st,bars,lv,which,code) */
(function (W) {
  "use strict";
  var DAYN = 640, MINN = 320;
  var CSS = '.sxIn .ssx{background:rgba(255,255,255,.03);border-radius:6px;padding:3px 4px 2px;margin:0 0 3px}' +
    '.sxIn .ssl{display:flex;gap:8px;font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;font:400 10px/1.5 -apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}' +
    '.sxIn svg{display:block;width:100%;height:auto;touch-action:pan-y}';
  function injectCSS() { if (document.getElementById('zpDkCss')) return; var st = document.createElement('style'); st.id = 'zpDkCss'; st.textContent = CSS; document.head.appendChild(st); }
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
  function ema(x, n) { var a = 2 / (n + 1), r = [], y = x[0]; for (var i = 0; i < x.length; i++) { y = i ? a * x[i] + (1 - a) * y : x[0]; r.push(y); } return r; }

  /* ---------- 公式主计算 (只依赖 C/H/L, 与评审脚本逐值一致) ---------- */
  function calc(bars) {
    var n = bars.length, C = [], H = [], L = [], i, j;
    for (i = 0; i < n; i++) { C.push(+bars[i].c); H.push(+bars[i].h); L.push(+bars[i].l); }
    var WW = [], RC = [];
    for (i = 0; i < n; i++) { WW.push((2 * C[i] + H[i] + L[i]) / 4); RC.push(i > 0 ? C[i - 1] : C[0]); }
    /* SKK/SDD 多空 */
    var SKK = [], SDD = [], duo = [], xd = [], xk = [];
    (function () {
      var e13 = ema(WW, 13), e21 = ema(WW, 21);
      for (i = 0; i < n; i++) SKK.push((e13[i] - e21[i]) * 180);
      var eS = ema(SKK, 2);
      for (i = 0; i < n; i++) {
        SDD.push(eS[i]); duo.push(SKK[i] > SDD[i]);
        xd.push(i > 0 && SKK[i] > SDD[i] && SKK[i - 1] <= SDD[i - 1]);
        xk.push(i > 0 && SKK[i] < SDD[i] && SKK[i - 1] >= SDD[i - 1]);
      }
    })();
    /* SK/SD 通道 (7点回归斜率) */
    var em2 = ema(WW, 2), SK = [], SD = [], SJ = [];
    for (i = 0; i < n; i++) {
      var sl = 0;
      if (i >= 6) { var sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (j = 0; j < 7; j++) { var yv = em2[i - 6 + j]; sx += j; sy += yv; sxy += j * yv; sxx += j * j; }
        sl = (7 * sxy - sx * sy) / (7 * sxx - sx * sx);
      }
      SK.push((sl * 15 + WW[i]) * 0.8 * 0.0001);
    }
    var eSD = ema(SK, 2);
    for (i = 0; i < n; i++) { SD.push(eSD[i]); SJ.push(2.8 * SK[i] - 1.8 * eSD[i]); }
    /* DK 主柱 + 三重染色 (覆盖顺序=评审图 matplotlib 先后) */
    var s3 = sma(C, 3, 1), s5 = sma(C, 5, 1), DK = [], col = [];
    for (i = 0; i < n; i++) {
      DK.push(2 * (s3[i] - s5[i]) * 180);
      var c = '#888888';
      if (SK[i] > SD[i] && DK[i] <= RC[i]) c = '#ff0000';
      if (DK[i] > 0 && SK[i] > SD[i]) c = '#6633cc';
      if (DK[i] > 0 && SK[i] < SD[i]) c = '#ffaa66';
      if (DK[i] > 0 && !duo[i]) c = '#00cc00';
      if (xd[i]) c = '#ffff00';
      if (xk[i]) c = '#00cc00';
      if (DK[i] < 0 && !duo[i] && SK[i] < SD[i]) c = '#00cc00';
      col.push(c);
    }
    return { n: n, WW: WW, SKK: SKK, SDD: SDD, duo: duo, xd: xd, xk: xk, SK: SK, SD: SD, SJ: SJ, DK: DK, RC: RC, col: col };
  }

  /* ---------- SVG 绘制 ---------- */
  var WD = 380, PL = 24, PR = 3;
  function gridLines(g, T, Bt, lv, D, i0, N, X) {
    for (var k = 0; k < N; k += Math.ceil(N / 5)) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Bt + 11) + '" text-anchor="middle" font-size="9.5" fill="#fff">' + D[i0 + k] + '</text>');
  }
  function drawSec(el, R, bars, lv) {
    var N = Math.min(90, R.n), i0 = R.n - N, D = labels(bars, lv);
    var T = 5, Bt = bigOn() ? 148 : 88, Hh = bigOn() ? 160 : 100, cw = (WD - PL - PR) / N;
    var X = function (k) { return PL + cw * (k + 0.5); };
    var mid = 0, mDK = 1e-9, k, i;
    for (k = 0; k < N; k++) { i = i0 + k; mid += R.RC[i]; if (Math.abs(R.DK[i]) > mDK) mDK = Math.abs(R.DK[i]); }
    mid /= N; var ym = mDK * 1.35, vmax = mid + ym, vmin = mid - ym;
    var Y = function (v) { return T + (vmax - Math.min(Math.max(v, vmin), vmax)) / (vmax - vmin) * (Bt - T); };
    var g = [];
    g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(mid).toFixed(1) + '" y2="' + Y(mid).toFixed(1) + '" stroke="rgba(207,216,230,.45)" stroke-width=".7"/>');
    g.push('<text x="' + (PL - 4) + '" y="' + (Y(vmax) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#fff">' + vmax.toFixed(2) + '</text>');
    g.push('<text x="' + (PL - 4) + '" y="' + (Y(vmin) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#fff">' + vmin.toFixed(2) + '</text>');
    /* DK 柱: 细于评审图(lw2.6), 宽随 cw */
    var bw = Math.max(1.1, Math.min(2, cw * 0.55)).toFixed(2);
    for (k = 0; k < N; k++) { i = i0 + k;
      var y1 = Y(R.RC[i]), y2 = Y(R.RC[i] + R.DK[i]);
      if (Math.abs(y2 - y1) < 0.6) y2 = y1 - (R.DK[i] >= 0 ? 0.6 : -0.6);
      g.push('<line x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + y1.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + R.col[i] + '" stroke-width="' + bw + '"/>');
      if (R.xd[i]) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (T + 8).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#ffff00" stroke="#000" stroke-width=".4" paint-order="stroke">多↑</text>');
      if (R.xk[i]) g.push('<text x="' + X(k).toFixed(1) + '" y="' + (Bt - 1).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#00cc00" stroke="#000" stroke-width=".4" paint-order="stroke">空↓</text>');
    }
    /* SK/SD/SJ ×400 显示 (细线, 越界部分由 viewBox 裁掉) */
    var pt = function (a, col2, w2, op) { var s = []; for (k = 0; k < N; k++) s.push(X(k).toFixed(1) + ',' + Y(a[i0 + k] * 400).toFixed(1)); return '<polyline fill="none" stroke="' + col2 + '" stroke-width="' + w2 + '"' + (op ? ' opacity="' + op + '"' : '') + ' points="' + s.join(' ') + '"/>'; };
    g.push(pt(R.SK, '#ff4444', 0.8));
    g.push(pt(R.SD, '#00e080', 0.8));
    g.push(pt(R.SJ, 'rgba(255,255,0,.65)', 0.7));
    gridLines(g, T, Bt, lv, D, i0, N, X);
    g.push('<g class="hx"></g>');
    var last = R.n - 1;
    var duoTxt = '<span style="color:' + (R.duo[last] ? '#ff5459' : '#00cc66') + '">' + (R.duo[last] ? '多' : '空') + '</span>';
    el.innerHTML = '<div class="ssl"><span style="color:#ffd24a">DK ' + R.DK[last].toFixed(2) + '</span><span style="color:' + (R.SKK[last] > R.SDD[last] ? '#ff5459' : '#00cc66') + '">SKK ' + R.SKK[last].toFixed(2) + '</span><span style="color:#00e080">SDD ' + R.SDD[last].toFixed(2) + '</span>' + duoTxt + '<span style="color:#8fb8ff">红=通道上·紫/橙=动能>0·绿=空·黄=多↑</span></div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
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
    var N = Math.min(90, st.R.n), i0 = st.R.n - N, k = Math.max(0, Math.min(N - 1, i - i0));
    var cw = (380 - 24 - 3) / N, x = (24 + cw * (k + 0.5)).toFixed(1);
    var ln = '<line x1="' + x + '" x2="' + x + '" y1="3" y2="' + (bigOn() ? 155 : 93) + '" stroke="rgba(255,255,255,.55)" stroke-width=".8" stroke-dasharray="2 2"/>';
    var sv = st.s1 && st.s1.querySelector('svg'); if (!sv) return;
    var hx = sv.querySelector('.hx'); if (hx) hx.innerHTML = ln;
    var j = i0 + k, last = j;
    if (st.s1.querySelector('.ssl')) {
      var duoTxt = '<span style="color:' + (st.R.duo[last] ? '#ff5459' : '#00cc66') + '">' + (st.R.duo[last] ? '多' : '空') + '</span>';
      st.s1.querySelector('.ssl').innerHTML = '<span style="color:#ffd24a">DK ' + st.R.DK[last].toFixed(2) + '</span><span style="color:' + (st.R.SKK[last] > st.R.SDD[last] ? '#ff5459' : '#00cc66') + '">SKK ' + st.R.SKK[last].toFixed(2) + '</span><span style="color:#00e080">SDD ' + st.R.SDD[last].toFixed(2) + '</span>' + duoTxt + (st.R.xd[j] ? '<span style="color:#ffff00">多↑</span>' : '') + (st.R.xk[j] ? '<span style="color:#00cc00">空↓</span>' : '');
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
    var hit = function (e) {
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
    var st = { node: node, s1: node.querySelector('.ssx'), opt: opts || {}, code: (opts && opts.code) || '', bars: null, lv: null, which: 'DK', at: 0 };
    return st;
  }
  function feed(st, bars, lv, which, code) {
    if (!st) return;
    st.bars = bars; st.lv = lv; if (which) st.which = which; if (code) st.code = code;
    if (st.code && symOf(st.code)) st.code = symOf(st.code).slice(2);
    function draw() {
      if (!st.bars || st.bars.length < 40) { st.s1.innerHTML = '<div class="ssl"><span style="color:#8fb8ff">K线还没到（≥40根）</span></div>'; return; }
      try { st.R = calc(st.bars); drawSec(st.s1, st.R, st.bars, st.lv); }
      catch (e) { st.s1.innerHTML = '<div class="ssl"><span style="color:#ff8888">计算出错: ' + e.message + '</span></div>'; }
    }
    draw();
    st.at = Date.now();
    if (ACT.indexOf(st) < 0) ACT.push(st);
    bindCross(st);
  }

  /* ---------- 独立 mount ---------- */
  var LVDK = ['日', '30分', '15分', '5分', '1分'];
  function mount(before, opts) {
    if (!before || !before.parentNode) return null;
    injectCSS();
    opts = opts || {};
    var host = document.createElement('section'); host.id = 'zpDkJL'; host.setAttribute('aria-label', 'DK能量柱副图');
    host.innerHTML = '<div class="hh" style="display:flex;align-items:center;gap:7px;height:19px;white-space:nowrap;overflow:hidden;color:#fff;font:400 11px/1.35 -apple-system,sans-serif"><span style="font-weight:500">DK能量柱</span><span class="hps" style="display:inline-flex;gap:3px;flex:none">' + LVDK.map(function (l) { return '<button class="hp' + (l === '日' ? ' on' : '') + '" data-lv="' + l + '" type="button" style="background:none;border:1px solid rgba(255,255,255,.25);border-radius:6px;color:rgba(255,255,255,.7);font:400 9.5px/1.5 -apple-system,sans-serif;padding:0 5px;cursor:pointer' + (l === '日' ? ';border-color:#2fd17a;color:#2fd17a' : '') + '">' + (l === '日' ? '日' : l.replace('分', '')) + '</button>'; }).join('') + '</span><span class="hs" style="margin-left:auto;font-size:10.5px">柱=2×(SMA3−SMA5)×180锚昨收 · SK/SD×400</span><button class="hf" type="button" aria-label="折叠" style="flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;font-size:9px;line-height:14px;padding:0;text-align:center">−</button></div>';
    before.parentNode.insertBefore(host, before);
    var st = embedNode({ code: opts.code || '' });
    st.node.style.display = ''; host.appendChild(st.node);
    var lv = '日';
    function load() {
      if (lv === '日') fetchDayJ(st.code, function (b) { if (b) feed(st, b, '日', 'DK', st.code); else host.querySelector('.hs').textContent = '日K拉不到'; });
      else fetchMinJ(st.code, lv, function (b) { if (b) feed(st, b, lv, 'DK', st.code); else host.querySelector('.hs').textContent = lv + 'K拉不到(自动重试)'; });
    }
    host.addEventListener('click', function (e) {
      var p = e.target && e.target.closest && e.target.closest('.hp');
      if (p) { lv = p.getAttribute('data-lv'); host.querySelectorAll('.hp').forEach(function (b2) { b2.classList.toggle('on', b2 === p); }); load(); return; }
      var f = e.target && e.target.closest && e.target.closest('.hf');
      if (f) host.classList.toggle('fold');
    });
    if (opts.bars) feed(st, opts.bars, '日', 'DK', st.code); else load();
    host.__st = st; host.__load = load;
    return host;
  }

  W.JLDk = { version: 'v1', calc: calc, mount: mount, embedNode: embedNode, feed: feed, labels: labels, xhKey: xhKey };
})(window);
