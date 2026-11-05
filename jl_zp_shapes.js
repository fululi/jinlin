/*! jl_zp_shapes.js — 作T作战屏 形态层(11-05)
 * 头肩顶/底、三角(上升/下降/对称)、谐波(Gartley/Bat/Butterfly/Crab)、杯柄(含倒杯柄)。
 * 输入全是已算好横坐标的点: S=[{p,h(1高0低),x,k(唯一键)}] 转折点(高低交替), Q=[{p,x,k}] 收盘序列。
 * 5/15分页 = 跨天蜡烛; 分时页 = 今天; 周视图 = 周蜡烛。画法: 细实线 + 里面淡阴影, 图上不写字(悬停 title 才有名字)。
 * 最新一个(收在最后一个转折点上的)=实时形态, 一直显示; 更早的=历史形态, 可用 hist:false 整体隐藏。
 * 谐波比例: XA→AB / AB→BC / BC→CD / A→D(占XA), 取常见值 ±容差:
 *   Gartley AB .618 D .786 | Bat AB .382–.5 D .886 | Butterfly AB .786 D 1.272 | Crab AB .382–.618 D 1.618; BC .382–.886
 * 杯柄: 左缘H→杯底L→右缘H(与左缘差≤杯深15%)→柄低L(柄回撤≤杯深1/3, 且在杯上半部, 柄宽≤杯宽1/2), 杯底居中段、不是V。倒杯柄镜像。
 */
(function (g) {
  var NS = 'http://www.w3.org/2000/svg';
  function E(n, a, t) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; }
  var NAME = { hst: '头肩顶', hsb: '头肩底', tra: '上升三角', trd: '下降三角', trs: '对称三角', gar: 'Gartley', bat: 'Bat', bfl: 'Butterfly', crb: 'Crab', cup: '杯柄', icp: '倒杯柄', rwg: '上升楔形', fwg: '下降楔形', chu: '上升通道', chd: '下降通道', dtp: '双顶', dbm: '双底' };
  var UP = '#ff4757', DN = '#1ee3a0', NE = '#ffe58f';   /* 红=预期往上(涨) 绿=预期往下 黄=中性 */

  function within(v, a, b, tol) { return v >= a - tol && v <= b + tol; }
  function harmonic(P5) {   /* P5=[X,A,B,C,D] */
    var X = P5[0], A = P5[1], B = P5[2], C = P5[3], D = P5[4];
    var xa = Math.abs(A.p - X.p); if (!(xa > 0)) return null;
    var ab = Math.abs(B.p - A.p) / xa, bc = Math.abs(C.p - B.p) / Math.abs(B.p - A.p), ad = Math.abs(D.p - A.p) / xa;
    if (!(bc >= 0.382 - 0.05 && bc <= 0.886 + 0.05)) return null;
    var bull = X.h === 0;   /* X是低点: 看涨(D是低点) */
    /* B必须在XA内回撤, C在AB内 */
    if (bull ? !(B.p > X.p && B.p < A.p && C.p > B.p && C.p <= A.p * 1.0005 && D.p < C.p) : !(B.p < X.p && B.p > A.p && C.p < B.p && C.p >= A.p * 0.9995 && D.p > C.p)) return null;
    var tol = 0.06, k = null;
    if (within(ab, 0.618, 0.618, tol) && within(ad, 0.786, 0.786, tol)) k = 'gar';
    else if (within(ab, 0.382, 0.5, tol) && within(ad, 0.886, 0.886, tol)) k = 'bat';
    else if (within(ab, 0.786, 0.786, tol) && within(ad, 1.272, 1.272, tol * 1.5)) k = 'bfl';
    else if (within(ab, 0.382, 0.618, tol) && within(ad, 1.618, 1.618, tol * 2)) k = 'crb';
    if (!k) return null;
    return { k: k, pts: P5, dir: bull ? 1 : -1 };
  }
  function cup(P4, Q) {   /* P4=[L,C,R,H] 高低高低(杯) 或 低高低高(倒杯) */
    var L = P4[0], C = P4[1], R = P4[2], H = P4[3], inv = L.h === 0, sg = inv ? -1 : 1;   /* sg=1: 正杯(杯底在下) */
    var d = sg * (L.p - C.p); if (!(d > 0)) return null;
    if (d / L.p < 0.004) return null;                                         /* 杯太浅(噪声) */
    if (Math.abs(R.p - L.p) > 0.15 * d) return null;                           /* 右缘和左缘差不多高 */
    var cw = R.x - L.x, hw = H.x - R.x; if (!(cw > 0 && hw > 0 && hw <= cw * 0.5)) return null;
    var hr = sg * (R.p - H.p); if (!(hr > 0 && hr <= d / 3)) return null;      /* 柄回撤 ≤ 杯深1/3, 且往杯里回 */
    if (sg * (H.p - C.p) < d * 0.5) return null;                               /* 柄在杯上半部 */
    var mid = (C.x - L.x) / cw; if (!(mid > 0.25 && mid < 0.75)) return null;  /* 杯底居中, 不偏 */
    var q1 = null, q3 = null;
    Q.forEach(function (q) { if (q.x >= L.x && q.x <= R.x) { var f = (q.x - L.x) / cw; if (q1 === null || Math.abs(f - 0.25) < Math.abs(q1.f - 0.25)) q1 = { f: f, p: q.p }; if (q3 === null || Math.abs(f - 0.75) < Math.abs(q3.f - 0.75)) q3 = { f: f, p: q.p }; } });
    if (!q1 || !q3) return null;
    if (!(sg * (L.p - q1.p) > d * 0.6 && sg * (R.p - q3.p) > d * 0.6)) return null;   /* 圆底(U), 不是V: 1/4、3/4处都已明显离开边沿 */
    return { k: inv ? 'icp' : 'cup', pts: P4, dir: inv ? -1 : 1, d: d };
  }

  function lnAt(a, b) { var k = (b.p - a.p) / ((b.x - a.x) || 1e-9); return function (x) { return a.p + k * (x - a.x); }; }
  /* 楔形/通道: 最近4个转折点=2高2低, 两条线同向; 收敛=楔形(上升楔看跌/下降楔看涨), 平行=通道; 两线之间的收盘不许穿线 */
  function twoLine(R, Q) {
    var H = R.filter(function (m) { return m.h === 1; }), L = R.filter(function (m) { return m.h === 0; });
    if (H.length !== 2 || L.length !== 2) return null;
    var up = lnAt(H[0], H[1]), dn = lnAt(L[0], L[1]), x0 = Math.min(H[0].x, L[0].x), x1 = Math.max(H[1].x, L[1].x), ref = R[3].p;
    var w0 = up(x0) - dn(x0), w1 = up(x1) - dn(x1); if (!(w0 > 0 && w1 > 0) || w0 / ref < 0.004) return null;
    var dH = (H[1].p - H[0].p) / ref, dL = (L[1].p - L[0].p) / ref, fl = 0.002, k = null, tol = ref * 0.0015, bad = 0, tot = 0;
    var rise = dH > fl && dL > fl, fall = dH < -fl && dL < -fl; if (!rise && !fall) return null;
    if (w1 < w0 * 0.8) k = rise ? 'rwg' : 'fwg'; else if (w1 > w0 * 0.8 && w1 < w0 * 1.25 && Math.abs(dH - dL) < 0.012) k = rise ? 'chu' : 'chd'; else return null;
    Q.forEach(function (q) { if (q.x >= x0 && q.x <= x1) { tot++; if (q.p > up(q.x) + tol || q.p < dn(q.x) - tol) bad++; } });
    if (bad > 0.1 * tot) return null;
    return { k: k, H: H, L: L, up: up, dn: dn };
  }
  /* 双顶/双底: 高-低-高(低-高-低), 两顶差 ≤0.5%, 中间回撤 ≥1%; 颈线=中间低点 */
  function dbl(P3) {
    var a = P3[0], m = P3[1], c = P3[2], top = a.h === 1, sg = top ? 1 : -1;
    if (!(a.h === c.h && a.h !== m.h)) return null;
    if (Math.abs(a.p - c.p) > a.p * 0.005) return null;
    if (!(sg * (Math.min(sg * a.p, sg * c.p) * sg - m.p) / a.p >= 0.01)) return null;
    return { k: top ? 'dtp' : 'dbm', pts: P3, nk: m.p };
  }
  /* 给定转折点序列, 用现有 ZpPattern.detect(头肩/三角, 需 x 映射)+谐波+杯柄, 扫"收在第n个转折点上"的所有形态 */
  function scan(S, Q, opt) {
    opt = opt || {}; var out = [], seen = {};
    if (!S || S.length < 4) return out;
    var XM = {}; S.forEach(function (m) { XM[m.k] = m.x; }); Q.forEach(function (q) { XM[q.k] = q.x; });
    var Xf = function (k) { return XM[k]; };
    var Qd = Q.map(function (q) { return { p: q.p, hm: q.k }; });
    var lo = Math.max(4, S.length - (opt.depth || 400));
    var bpd = (function () { var D = {}, n = 0; Q.forEach(function (q) { var d = String(q.k).slice(0, 8); if (/^\d{8}$/.test(d) && !D[d]) { D[d] = 1; n++; } }); return n >= 2 ? Math.max(4, Q.length / n) : 16; })();
    var slot = (function () { var d = []; for (var i = 1; i < Q.length; i++) { var w = Q[i].x - Q[i - 1].x; if (w > 0) d.push(w); } d.sort(function (u, v) { return u - v; }); return d.length ? d[d.length >> 1] : 1; })();
    for (var n = S.length; n >= lo; n--) {
      var sub = S.slice(0, n), last = n === S.length, got = [];
      try {
        var r = window.ZpPattern && ZpPattern.detect(sub.map(function (m) { return { p: m.p, h: m.h, hm: m.k }; }), Qd, Xf);
        if (r) got.push(r);
      } catch (e) { }
      if (n >= 5) { var hr = harmonic(sub.slice(-5)); if (hr) got.push(hr); }
      if (n >= 4) { var cr = cup(sub.slice(-4), Q); if (cr) got.push(cr); }
      if (n >= 4) { var tl = twoLine(sub.slice(-4), Q); if (tl) got.push(tl); }
      if (n >= 3) { var db = dbl(sub.slice(-3)); if (db) got.push(db); }
      got.forEach(function (r) {
        var xs = (r.pts ? r.pts.map(function (m) { return m.x; }) : r.H.concat(r.L).map(function (m) { return m.x; }));
        var span = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / slot / bpd, cap = { gar: 8, bat: 8, bfl: 8, crb: 8, cup: 10, icp: 10, rwg: 8, fwg: 8, chu: 8, chd: 8, dtp: 8, dbm: 8 }[r.k];
        if (cap && span > cap) return;
        var multiD = (function () { var D = {}, n = 0; Q.forEach(function (q) { var d = String(q.k).slice(0, 8); if (/^\d{8}$/.test(d) && !D[d]) { D[d] = 1; n++; } }); return n >= 2; })();
        if (span * bpd < ((window.__ZPO && window.__ZPO.bpd) ? 12 : (multiD ? Math.min(3 * bpd, 48) : 12))) return;   /* 11-05 太短(<12根且<0.4天)不画, 要框进更多蜡烛 */   /* 11-05 跨度上限(天), 防止几天~几个月凑一个形态 */
        var key = r.k + '@' + (r.pts ? r.pts[0].x : (r.H ? Math.min(r.H[0].x, r.L[0].x) : 0)).toFixed(0) + '@' + n;
        var sk = r.k + '@' + (r.pts ? r.pts[0].x : (r.H ? Math.min(r.H[0].x, r.L[0].x) : 0)).toFixed(0);
        if (seen[sk]) return; seen[sk] = 1;
        r.live = last; r.n = n; out.push(r);
      });
    }
    return out;
  }

  function dirCol(r) {
    if (r.k === 'hst') return DN; if (r.k === 'hsb') return UP; if (r.k === 'rwg' || r.k === 'chd' || r.k === 'dtp') return DN; if (r.k === 'fwg' || r.k === 'chu' || r.k === 'dbm') return UP;
    if (r.k === 'cup' || r.dir > 0) return r.dir ? UP : NE; if (r.dir < 0) return DN;
    if (r.brk) return r.brk.d > 0 ? UP : DN;
    return NE;
  }
  function drawOne(g, r, o) {
    var Y = o.Y, xe = o.xEnd, col = dirCol(r), op = r.live ? 1 : 0.55, grp = E('g', { opacity: op });
    var T = E('title', {}, NAME[r.k] || r.k); grp.appendChild(T);
    var poly = function (pts, fill, fo) { grp.appendChild(E('polygon', { points: pts.map(function (m) { return m[0].toFixed(1) + ',' + m[1].toFixed(1); }).join(' '), fill: fill, 'fill-opacity': fo, stroke: 'none' })); };
    var line = function (x1, y1, x2, y2, w, o2) { grp.appendChild(E('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, 'stroke-width': w, opacity: o2 == null ? 1 : o2 })); };
    var path = function (pts, w) { grp.appendChild(E('polyline', { points: pts.map(function (m) { return m[0].toFixed(1) + ',' + m[1].toFixed(1); }).join(' '), fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round', opacity: 1 })); };
    if (r.k === 'hst' || r.k === 'hsb') {
      var p = r.pts, nx1 = r.brk ? r.brk.x : xe;
      poly([[p[1].x, Y(p[1].p)], [p[2].x, Y(p[2].p)], [p[3].x, Y(p[3].p)], [p[3].x, Y(r.nk(p[3].x))], [p[1].x, Y(r.nk(p[1].x))]], col, .16);
      path(p.map(function (m) { return [m.x, Y(m.p)]; }), .8);
      line(p[1].x, Y(r.nk(p[1].x)), nx1, Y(r.nk(nx1)), .6, .8);
      if (r.brk) line(r.brk.x, Y(r.tgt), xe, Y(r.tgt), .6, .7);
    } else if (r.k === 'dtp' || r.k === 'dbm') {
      var D = r.pts, ny = Y(r.nk);
      poly([[D[0].x, Y(D[0].p)], [D[1].x, Y(D[1].p)], [D[2].x, Y(D[2].p)], [D[2].x, ny], [D[0].x, ny]], col, .16);
      path(D.map(function (m) { return [m.x, Y(m.p)]; }), .8);
      line(D[0].x, ny, xe, ny, .6, .8);
    } else if (r.k === 'tra' || r.k === 'trd' || r.k === 'trs' || r.k === 'rwg' || r.k === 'fwg' || r.k === 'chu' || r.k === 'chd') {
      var xEnd = r.brk ? r.brk.x : xe, xs = Math.min(r.H[0].x, r.L[0].x);
      poly([[xs, Y(r.up(xs))], [xEnd, Y(r.up(xEnd))], [xEnd, Y(r.dn(xEnd))], [xs, Y(r.dn(xs))]], col, .16);
      line(xs, Y(r.up(xs)), xEnd, Y(r.up(xEnd)), .7); line(xs, Y(r.dn(xs)), xEnd, Y(r.dn(xEnd)), .7);
      if (r.brk) line(r.brk.x, Y(r.tgt), xe, Y(r.tgt), .6, .7);
    } else if (r.k === 'gar' || r.k === 'bat' || r.k === 'bfl' || r.k === 'crb') {
      var P = r.pts.map(function (m) { return [m.x, Y(m.p)]; });
      poly([P[0], P[1], P[2]], col, .16); poly([P[2], P[3], P[4]], col, .16);
      path(P, .8);
      line(P[0][0], P[0][1], P[2][0], P[2][1], .5, .6); line(P[1][0], P[1][1], P[3][0], P[3][1], .5, .6); line(P[1][0], P[1][1], P[4][0], P[4][1], .5, .6);
    } else if (r.k === 'cup' || r.k === 'icp') {
      var L = r.pts[0], C = r.pts[1], R = r.pts[2], H = r.pts[3];
      var cy = 2 * Y(C.p) - (Y(L.p) + Y(R.p)) / 2;   /* 二次曲线控制点: 曲线正好过杯底 */
      grp.appendChild(E('path', { d: 'M' + L.x.toFixed(1) + ',' + Y(L.p).toFixed(1) + ' Q' + C.x.toFixed(1) + ',' + cy.toFixed(1) + ' ' + R.x.toFixed(1) + ',' + Y(R.p).toFixed(1) + ' Z', fill: col, 'fill-opacity': .16, stroke: col, 'stroke-width': .8, opacity: 1 }));
      path([[R.x, Y(R.p)], [H.x, Y(H.p)]], .8);
      line(R.x, Y(R.p), xe, Y(R.p), .5, .6);
    }
    g.appendChild(grp);
  }

  /* draw(svg, list, o): o={Y, xEnd, clip, before, hist(bool)} */
  function draw(svg, list, o) {
    var old = svg.querySelector('#zpShp'); if (old) old.remove();
    if (!list || !list.length) return null;
    var g = E('g', { id: 'zpShp', 'pointer-events': 'none' }), C = o.clip, cid = 'zpShpClip' + (svg.id || '');
    var cp = E('clipPath', { id: cid }); cp.appendChild(E('rect', { x: C[0], y: C[1], width: C[2] - C[0], height: C[3] - C[1] })); g.appendChild(cp);
    var inner = E('g', { 'clip-path': 'url(#' + cid + ')' });
    /* 11-05 用户: 15分画得乱 → 跨度不超过图宽的45%(太宽的不画)、已走完的左端要在图内、历史形态最多留最近3个、同类重叠只留最新 */
    var W = C[2] - C[0], spanOf = function (r) { var xs = (r.pts ? r.pts : r.H.concat(r.L)).map(function (m) { return m.x; }); return [Math.min.apply(null, xs), Math.max.apply(null, xs)]; };
    var keep = [], hist = 0;
    list.slice().sort(function (a, b) { return (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.n - a.n; }).forEach(function (r) {
      var sp = spanOf(r); if (sp[1] - sp[0] > W * 0.45) return;
      if (sp[1] < C[0]) return;
      if (!r.live) { if (o.hist === false || hist >= 3) return; if (keep.some(function (q) { var s2 = spanOf(q); return q.k === r.k && Math.min(sp[1], s2[1]) - Math.max(sp[0], s2[0]) > 0.5 * (sp[1] - sp[0]); })) return; hist++; }
      keep.push(r);
    });
    keep.forEach(function (r) { drawOne(inner, r, o); });
    g.appendChild(inner);
    if (o.before && o.before.parentNode === svg) svg.insertBefore(g, o.before); else svg.appendChild(g);
    return list;
  }
  g.ZpShapes = { scan: scan, draw: draw, NAME: NAME, harmonic: harmonic, cup: cup };
})(window);
