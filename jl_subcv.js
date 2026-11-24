/* jl_subcv.js v1 (11-24) K线表(ks.html)画布副图「指标」: 乖离/穿越/三线/趋势/庄控/阴阳/DK
   11-24 用户「把这个也在K线表里都加上这个副图指标，一定要对齐成交量还有时间」(选: 画进K线画布, 和 VOL/DDX/RSO 排一排)
   公式不在这里: 直接调 jl_huo.js(JLHuo.calc) / jl_sx.js(JLSx.calc) / jl_zd.js(JLZd.calc) / jl_hy.js(JLHy.calc) / jl_dk.js(JLDk.calc),
   和作战屏同一份文件; 这里只是把作战屏那版 SVG 的画法照搬成 canvas(颜色/线宽/信号位置一样), 横坐标用 K线表的 v.X(i) —— 和 VOL 同一根K同一个x。
   用法: JLSubCv.draw(ctx, {ind, kl:[[t,o,h,l,c,v手],...], code, X(i), i0, i1(不含), x0, x1, y, h, li(读数那根), onCap()}) → {leg:[{t,c,b}], name}
   只显示不进算法, 没有提醒。 */
(function (W) {
  "use strict";
  function tdc(c6) { return '#' + c6.slice(4, 6) + c6.slice(2, 4) + c6.slice(0, 2); }
  var GRP = { '乖离': 'huo', '穿越': 'sx', '三线': 'sx', '趋势': 'zd', '庄控': 'zd', '阴阳': 'hy', 'DK': 'dk' };
  var BC = { k: '', b: null }, RC = {};
  function barsOf(kl) {
    var n = kl.length, z = kl[n - 1], k = n + '|' + kl[0][0] + '|' + z[0] + '|' + z[1] + '|' + z[2] + '|' + z[3] + '|' + z[4] + '|' + z[5];
    if (BC.k !== k) { BC.k = k; BC.b = kl.map(function (r) { return { t: String(r[0]).replace(/\D/g, '').slice(0, 12), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] || 0 }; }); }
    return BC.b;
  }
  /* 流通股本(穿越/庄控要): 和 jl_sx/jl_zd 同一个本机缓存键 zp_sx_cap_<6位码>(两种字段都写); 失败60秒内不重取 */
  var CAPF = {};
  function capOf(code, onCap) {
    code = String(code || '').replace(/\D/g, ''); if (!/^\d{6}$/.test(code)) return -1;
    try { var o = JSON.parse(localStorage.getItem('zp_sx_cap_' + code) || 'null'); var c = o && (o.cap || o.s); if (c > 0 && Date.now() - o.at < 12 * 3600e3) return c; } catch (e) { }
    var f = CAPF[code]; if (f && (f.busy || Date.now() - f.at < 60000)) return 0;
    f = CAPF[code] = { busy: 1, at: Date.now() };
    try {
      var x = new XMLHttpRequest(); x.timeout = 8000; x.open('GET', 'https://qt.gtimg.cn/q=' + (/^[569]/.test(code) ? 'sh' : 'sz') + code + '&_t=' + Date.now());
      x.onload = function () { f.busy = 0; f.at = Date.now(); try { var q = x.responseText.split(';')[0].split('~'), cap = parseFloat(q[44]) * 1e8 / parseFloat(q[3]); if (cap > 0) { localStorage.setItem('zp_sx_cap_' + code, JSON.stringify({ at: Date.now(), cap: cap, s: cap })); if (onCap) onCap(); } } catch (e2) { } };
      x.onerror = x.ontimeout = function () { f.busy = 0; f.at = Date.now(); };
      x.send();
    } catch (e3) { f.busy = 0; }
    return 0;
  }
  function calcOf(g, B, cap) {
    var k = g + '|' + BC.k + '|' + (cap || 0), c = RC[g];
    if (c && c.k === k) return c.R;
    var R = g === 'huo' ? W.JLHuo.calc(B) : g === 'sx' ? W.JLSx.calc(B, cap) : g === 'zd' ? W.JLZd.calc(B, cap) : g === 'hy' ? W.JLHy.calc(B) : W.JLDk.calc(B);
    RC[g] = { k: k, R: R }; return R;
  }
  function pct95(a) { var b = a.filter(function (v) { return isFinite(v); }).sort(function (x, y) { return x - y; }); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * 0.95))] : 10; }
  function f1(v) { return isFinite(v) ? v.toFixed(1) : '—'; }

  function draw(ctx, o) {
    var ind = o.ind, g = GRP[ind]; if (!g) return { leg: [], name: ind };
    var mod = { huo: 'JLHuo', sx: 'JLSx', zd: 'JLZd', hy: 'JLHy', dk: 'JLDk' }[g];
    if (!W[mod] || !W[mod].calc) return { leg: [{ t: mod + ' 没加载(检查 jl_' + g + '.js)', c: '#ff8888' }], name: ind };
    var kl = o.kl || []; if (kl.length < 40) return { leg: [{ t: 'K线不够(≥40根)', c: 'rgba(238,243,240,.9)' }], name: ind };
    var cap = 0;
    if (g === 'sx' || g === 'zd') { cap = capOf(o.code, o.onCap); if (cap < 0) return { leg: [{ t: '要流通股本, 只算A股', c: 'rgba(238,243,240,.9)' }], name: ind }; if (!cap) return { leg: [{ t: '取流通股本中…', c: 'rgba(238,243,240,.9)' }], name: ind }; }
    var B = barsOf(kl), R = calcOf(g, B, cap), i0 = Math.max(0, o.i0), i1 = Math.min(R.n, o.i1), X = o.X;
    if (i1 - i0 < 1) return { leg: [], name: ind };
    var cw = i1 - i0 > 1 ? Math.abs(X(i0 + 1) - X(i0)) : 4, li = Math.max(i0, Math.min(i1 - 1, o.li == null ? i1 - 1 : o.li));
    var x0 = o.x0, x1 = o.x1;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, o.y, x1 - x0 + 2, o.h); ctx.clip();
    var i, out;
    function mkY(T, Bt, lo, hi, clamp) { return function (v) { if (clamp) v = Math.min(Math.max(v, lo), hi); return T + (hi - v) / (hi - lo) * (Bt - T); }; }
    function line(arr, Y, col, w, dash, mul, op) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; if (op) ctx.globalAlpha = op; if (dash) ctx.setLineDash(dash); ctx.beginPath(); var on = false;
      for (var j = i0; j < i1; j++) { var v = arr[j] * (mul || 1); if (!isFinite(v)) { on = false; continue; } var xx = X(j), yy = Y(v); if (on) ctx.lineTo(xx, yy); else { ctx.moveTo(xx, yy); on = true; } }
      ctx.stroke(); ctx.restore();
    }
    function rect(j, ya, yb, col, wf, op, stroke) { var w = cw * (wf || 1), y1 = Math.min(ya, yb), hh = Math.max(Math.abs(yb - ya), 0.6); ctx.save(); if (op) ctx.globalAlpha = op; ctx.fillStyle = col; ctx.fillRect(X(j) - w / 2, y1, w, hh); if (stroke) { ctx.globalAlpha = 1; ctx.strokeStyle = stroke; ctx.lineWidth = 0.4; ctx.strokeRect(X(j) - w / 2, y1, w, hh); } ctx.restore(); }
    function hline(y, col, w, dash) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore(); }
    function lab(y, s, col) { ctx.save(); ctx.font = '8px Menlo,monospace'; ctx.fillStyle = col || 'rgba(255,255,255,.55)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x0 + 2, y); ctx.restore(); }
    function txt(j, y, s, col, fs, al) { ctx.save(); ctx.font = (fs || 9) + 'px -apple-system,"PingFang SC",sans-serif'; ctx.textAlign = al || 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(s, X(j), y); ctx.fillStyle = col; ctx.fillText(s, X(j), y); ctx.restore(); }
    var T = o.y + 13, Bt = o.y + o.h - 3, leg = [];
    if (ind === '乖离') {
      var vs = [3, -5]; for (i = i0; i < i1; i++) vs.push(R.H1[i], R.H6[i], R.FU[i], R.D4[i], R.ER[i]);
      var vmax = Math.max.apply(null, vs), vmin = Math.min.apply(null, vs), Y = mkY(T, Bt, vmin, vmax);
      for (i = i0; i < i1; i++) if (i > 0 && R.C[i - 1] < R.M20[i - 1]) rect(i, T, Bt, 'rgba(80,140,255,.09)');   /* 蓝底 = 那根开盘前在20均线下 */
      hline(Y(-2), '#3d7bff', 1.3); hline(Y(-5), '#8a8a8a', 0.8); lab(Y(-2), '−2', '#8fb8ff'); lab(Y(-5), '−5');
      for (i = i0; i < i1; i++) {
        var a = R.H6[i]; rect(i, Y(a), Y(-2), a > -2 ? 'rgba(255,60,60,.2)' : 'rgba(0,128,255,.22)');
        rect(i, Y(a), Y(R.FU[i]), a > R.FU[i] ? 'rgba(255,60,60,.35)' : 'rgba(0,128,255,.38)');
        if (R.H1[i] > R.H6[i]) rect(i, Y(R.H1[i]), Y(R.H6[i]), '#ff5459', Math.max(1, cw * 0.45) / cw);
      }
      line(R.FU, Y, '#ffcc17', 1); line(R.H6, Y, '#99eeee', 1); line(R.ER, Y, '#ffff3a', 1, [2, 3]); line(R.D4, Y, '#ff5cff', 1.4); line(R.H1, Y, '#2fd17a', 1.5);
      for (i = i0; i < i1; i++) if (R.DZ[i]) { ctx.save(); ctx.strokeStyle = '#ff80ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(i), Y(3)); ctx.lineTo(X(i), Y(-2)); ctx.stroke(); ctx.restore(); txt(i, Y(0.35) - 2, '…升', '#3d8bff', 9.5, 'left'); }
      lab(T + 3, vmax.toFixed(0)); lab(Bt - 3, vmin.toFixed(0));
      leg = [{ t: '时针 ' + f1(R.H1[li]), c: '#2fd17a', b: true }, { t: '分针 ' + f1(R.H6[li]), c: '#99eeee' }, { t: '辅线 ' + f1(R.FU[li]), c: '#ffcc17' }, { t: '底撑 ' + f1(R.D4[li]), c: '#ff5cff' }, { t: '二撑 ' + f1(R.ER[li]), c: '#ffff3a' }];
    } else if (ind === '穿越') {
      var peak = Math.max(12, pct95(R.J2.concat(R.J1)) * 1.25), Yp = mkY(T, Bt, 0, peak, true);
      hline(Yp(peak * 0.5), 'rgba(255,255,255,.14)', 0.8); hline(Yp(peak), 'rgba(255,255,255,.14)', 0.8); lab(Yp(peak * 0.5), (peak * 0.5).toFixed(0)); lab(Yp(peak) + 4, peak.toFixed(0));
      for (i = i0; i < i1; i++) { rect(i, Yp(R.穿越[i]), Bt, tdc('DDDDFF'), 1, 0.5); rect(i, Yp(R.换手[i]), Bt, tdc('FF0099'), 1, 0.75); if (R.J4[i] <= peak) rect(i, Yp(R.J4[i]), Bt, 'rgba(255,220,0,.55)', 0.36); }
      line(R.J1, Yp, tdc('00FF00'), 1.1); line(R.J2, Yp, tdc('FF00FF'), 1.5); line(R.J3, Yp, tdc('FFFF99'), 1.0); line(R.地量, Yp, tdc('FF0000'), 1.3, null, 1, 0.55);
      [[R.sigW, 'rgba(255,255,255,.95)', 0.42], [R.sigP, tdc('FF00FF'), 0.92], [R.sigY, tdc('FFFF33'), 0.36], [R.sigB, '#3b7bff', 0.78]].forEach(function (sg) { for (var j = i0; j < i1; j++) if (sg[0][j]) rect(j, Bt - sg[2] * (Bt - T), Bt, sg[1], 1.4, 0, '#111'); });
      leg = [{ t: 'JIU1 ' + f1(R.J1[li]), c: tdc('00FF00'), b: true }, { t: 'JIU2 ' + f1(R.J2[li]), c: tdc('FF00FF') }, { t: '穿越 ' + f1(R.穿越[li]), c: '#ddd' }, { t: '换手 ' + (isFinite(R.换手[li]) ? R.换手[li].toFixed(2) : '—') + '%', c: '#ddd' }, { t: '穿透 ' + f1(R.穿透率[li]), c: '#fff' }];
    } else if (ind === '三线') {
      var Ys = mkY(T, Bt, -5, 135, true);
      [20, 50, 80].forEach(function (v) { hline(Ys(v), 'rgba(255,255,255,.14)', 0.8); lab(Ys(v), String(v)); });
      for (i = i0; i < i1; i++) {
        if (R.中[i] < 15) rect(i, Ys(R.中[i]), Ys(15), tdc('FF00FF'), 1, 0.45);
        if (R.中[i] > 80) rect(i, Ys(80), Ys(Math.min(R.中[i], 130)), tdc('FFF000'), 1, 0.6);
        if (R.keng[i]) rect(i, Ys(20), Ys(Math.max(R.长[i], R.短[i], R.中[i])), tdc('00CCFF'), 1.3, 0.9);
      }
      line(R.短, Ys, '#00ff00', 1.1); line(R.中, Ys, '#ff4444', 1.2); line(R.长, Ys, tdc('FF00FF'), 1.4);
      for (i = i0; i < i1; i++) {
        if (R.sheng[i]) txt(i, Ys(20) - 2, '升', '#ffdd44', 10); if (R.zd[i]) txt(i, Ys(20) - 2, '筑底中', '#66ddff', 10);
        if (R.star[i]) txt(i, Ys(90) - 2, '＊', '#fff', 11); if (R.di[i]) txt(i, Ys(0) - 2, '底', tdc('FF00FF'), 10); if (R.icon[i]) txt(i, Ys(R.中[i]) - 2, '▲', '#ffdd44', 10);
      }
      leg = [{ t: '短 ' + f1(R.短[li]), c: '#00ff00', b: true }, { t: '中 ' + f1(R.中[li]), c: '#ff4444' }, { t: '长 ' + f1(R.长[li]), c: tdc('FF00FF') }];
      if (R.keng[li]) leg.push({ t: '黄金坑中', c: '#ffcc00' }); else if (R.中[li] > 80) leg.push({ t: '看顶区', c: '#00f0ff' });
    } else if (ind === '趋势') {
      /* 作战屏这里是两个窗(趋势 + 多空), K线表一格里上下分: 上58%趋势 下42%多空 */
      var Bm = T + (Bt - T) * 0.58, Yq = mkY(T, Bm - 2, -18, 115, true);
      [0, 50, 90].forEach(function (v) { hline(Yq(v), 'rgba(255,255,255,.14)', 0.8); lab(Yq(v), String(v), '#8aa'); });
      for (i = i0; i < i1; i++) {
        if (R.SHUI7[i] > 0) rect(i, Yq(0), Yq(R.SHUI7[i]), 'rgba(255,221,0,.8)', 1.2);
        if (R.入场柱[i]) rect(i, Yq(50), Yq(0), tdc('0099FF'), 1.4);
        if (R.顶柱[i]) rect(i, Yq(30), Yq(0), '#777', 1.4);
      }
      line(R.趋势, Yq, tdc('FF0000'), 1.4);
      for (i = i0; i < i1; i++) { if (R.准备[i]) txt(i, Yq(30) - 2, '准备中', '#c90', 9.5); if (R.入场[i]) txt(i, Yq(60) - 2, '入场', '#09f', 9.5); }
      var pk = 10; for (i = i0; i < i1; i++) pk = Math.max(pk, Math.abs(R.多[i]), Math.abs(R.空[i]), Math.abs(R.多均[i]), Math.abs(R.空均[i]));
      pk *= 1.15; var T2 = Bm + 2, Yd = mkY(T2, Bt, -pk, pk, true);
      hline(Bm, 'rgba(255,255,255,.10)', 0.6); hline(Yd(0), 'rgba(255,255,255,.35)', 0.8, [3, 3]);
      for (i = i0; i < i1; i++) { if (R.穿[i] || R.穿空[i]) { ctx.save(); ctx.strokeStyle = R.穿[i] ? 'rgba(255,60,60,.75)' : 'rgba(40,220,110,.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(i), T2); ctx.lineTo(X(i), Bt); ctx.stroke(); ctx.restore(); } }
      line(R.空均, Yd, '#cc88ff', 1.3); line(R.多均, Yd, '#ffcc00', 1.3); line(R.空, Yd, tdc('00FF00'), 1.5); line(R.多, Yd, '#ff4444', 1.5);
      leg = [{ t: '趋势 ' + f1(R.趋势[li]), c: '#ff5c5c', b: true }, { t: '入场' + (R.入场[li] ? '●' : ''), c: '#09f' }, { t: '抄底' + (R.SHUI7[li] > 0 ? '●' : ''), c: '#dd0' }, { t: '多 ' + f1(R.多[li]), c: '#ff4444' }, { t: '空 ' + f1(R.空[li]), c: '#33ff77' }, { t: R.多[li] > R.空均[li] ? '多方控场' : '空方控场', c: R.多[li] > R.空均[li] ? '#ff4444' : '#33ff77' }];
    } else if (ind === '庄控') {
      var pz = 1; for (i = i0; i < i1; i++) pz = Math.max(pz, Math.abs(R.庄控[i])); pz = Math.max(10, pz * 1.15);
      var Yz = mkY(T, Bt, -pz, pz, true); hline(Yz(0), 'rgba(255,255,255,.2)', 0.8);
      for (i = i0; i < i1; i++) { var zv = R.庄控[i]; rect(i, Yz(zv), Yz(0), zv > 0 ? tdc('FF4444') : tdc('44FF77'), 1, 0.85); }
      lab(T + 3, pz.toFixed(0)); lab(Bt - 3, '−' + pz.toFixed(0));
      leg = [{ t: '庄控 ' + f1(R.庄控[li]), c: '#ff4444', b: true }, { t: '红=控盘增强 绿=出货', c: '#8aa' }];
    } else if (ind === '阴阳') {
      var Yy = mkY(T, Bt, -100, 100, true);
      [[0, 'rgba(255,255,255,.3)', [3, 3]], [50, 'rgba(255,255,255,.12)'], [-50, 'rgba(255,255,255,.12)'], [100, 'rgba(255,255,255,.12)'], [-100, 'rgba(255,255,255,.12)']].forEach(function (a2) { hline(Yy(a2[0]), a2[1], 0.8, a2[2]); });
      lab(Yy(50), '50'); lab(Yy(-50), '−50');
      for (i = i0; i < i1; i++) { if (R.hy[i]) rect(i, Yy(100), Yy(0), '#ff2222', 1.2, 0.38); if (R.dt[i]) rect(i, Yy(-15), Yy(-95), '#3b7bff', 0.64, 0.85); }
      line(R.YIN1, Yy, '#ff4444', 1.0); line(R.YIN2, Yy, '#00cc66', 1.0);
      leg = [{ t: 'YIN1 ' + f1(R.YIN1[li]), c: '#ff4444', b: true }, { t: 'YIN2 ' + f1(R.YIN2[li]), c: '#00cc66' }, { t: '涨幅 ' + f1(R.qp[li]) + '%', c: '#ddd' }];
      if (R.hy[li]) leg.push({ t: '火焰↑', c: '#ff6666' }); if (R.dt[li]) leg.push({ t: '跌停▍', c: '#6688ff' });
    } else if (ind === 'DK') {
      var mid = 0, mDK = 1e-9; for (i = i0; i < i1; i++) { mid += R.RC[i]; if (Math.abs(R.DK[i]) > mDK) mDK = Math.abs(R.DK[i]); }
      mid /= (i1 - i0); var ym = mDK * 1.35, Yk = mkY(T, Bt, mid - ym, mid + ym, true);
      hline(Yk(mid), 'rgba(207,216,230,.45)', 0.7); lab(T + 3, (mid + ym).toFixed(2)); lab(Bt - 3, (mid - ym).toFixed(2));
      var bw = Math.max(1.1, Math.min(2, cw * 0.55));
      for (i = i0; i < i1; i++) {
        var y1 = Yk(R.RC[i]), y2 = Yk(R.RC[i] + R.DK[i]); if (Math.abs(y2 - y1) < 0.6) y2 = y1 - (R.DK[i] >= 0 ? 0.6 : -0.6);
        ctx.save(); ctx.strokeStyle = R.col[i]; ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(X(i), y1); ctx.lineTo(X(i), y2); ctx.stroke(); ctx.restore();
        if (R.xd[i]) txt(i, T + 8, '多↑', '#ffff00', 9); if (R.xk[i]) txt(i, Bt - 1, '空↓', '#00cc00', 9);
      }
      line(R.SK, Yk, '#ff4444', 0.8, null, 400); line(R.SD, Yk, '#00e080', 0.8, null, 400); line(R.SJ, Yk, 'rgba(255,255,0,.65)', 0.7, null, 400);
      leg = [{ t: 'DK ' + R.DK[li].toFixed(2), c: '#ffd24a', b: true }, { t: 'SKK ' + R.SKK[li].toFixed(2), c: R.SKK[li] > R.SDD[li] ? '#ff5459' : '#00cc66' }, { t: 'SDD ' + R.SDD[li].toFixed(2), c: '#00e080' }, { t: R.duo[li] ? '多' : '空', c: R.duo[li] ? '#ff5459' : '#00cc66' }];
    }
    ctx.restore();
    return { leg: leg, name: ind };
  }
  W.JLSubCv = { version: 'v1', draw: draw, IND: ['乖离', '穿越', '三线', '趋势', '庄控', '阴阳', 'DK'], _bars: barsOf };
})(window);
