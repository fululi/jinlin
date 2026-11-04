/*! jl_elliott.js — 艾略特波浪指标（推动浪 Impulse 1-5 + 锯齿浪 Zigzag a-b-c），SVG 叠加版
 * 规则按 TradingView 官方说明：
 *  推动浪：2浪回撤≤1浪100%；3浪超过1浪终点；3浪不是1/3/5中最短；4浪不进入1浪区域
 *  锯齿浪：b浪短于a浪；c浪超过a浪终点
 *
 * Elliott.swingsFrom(pts, thr)  pts=[{hm,p}] 分时点（周视图可直接传 {x,p}，x=已算好的横坐标，此时 opt.X 可不传）；thr=反向幅度(0.008=0.8%) → 高低交替的转折点
 * Elliott.detect(swings)        → {type:'impulse'|'zigzag', s:+1/-1, P:[转折点...]} 或 null
 * Elliott.drawSVG(svg, swings, opt)  opt:{X:hm->x, Y:price->y, clip:[x1,y1,x2,y2], xEnd, before}
 */
(function (g) {
  var NS = 'http://www.w3.org/2000/svg';
  function E(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }

  // 转折点：反向走出 thr 才确认（与作战屏 __SWJL 同一算法，阈值可单独调）
  function swingsFrom(pts, thr) {
    var SW = [], dir = 0, ext = null;
    pts.forEach(function (q, ix) {
      if (!(q.p > 0)) return;
      if (!ext) { ext = { ix: ix, p: q.p }; return; }
      if (dir >= 0 && q.p > ext.p) { ext = { ix: ix, p: q.p }; dir = 1; }
      else if (dir <= 0 && q.p < ext.p) { ext = { ix: ix, p: q.p }; dir = -1; }
      else if (dir === 1 && q.p < ext.p * (1 - thr)) { SW.push({ p: ext.p, h: 1, hm: pts[ext.ix].hm, x: pts[ext.ix].x }); ext = { ix: ix, p: q.p }; dir = -1; }
      else if (dir === -1 && q.p > ext.p * (1 + thr)) { SW.push({ p: ext.p, h: 0, hm: pts[ext.ix].hm, x: pts[ext.ix].x }); ext = { ix: ix, p: q.p }; dir = 1; }
    });
    return SW;
  }

  // s=+1 上行形态（起点是低点）；s=-1 下行形态（价格取反后用同一套规则）
  function isImpulse(P, s) {
    if (P[0].h !== (s > 0 ? 0 : 1)) return false;
    var v = P.map(function (q) { return s * q.p; });
    if (!(v[1] > v[0] && v[2] > v[0] && v[3] > v[1] && v[4] > v[1] && v[4] < v[3] && v[5] > v[4])) return false;
    var w1 = v[1] - v[0], w3 = v[3] - v[2], w5 = v[5] - v[4];
    return !(w3 < w1 && w3 < w5);
  }
  function isZigzag(P, s) {
    if (P[0].h !== (s > 0 ? 0 : 1)) return false;
    var v = P.map(function (q) { return s * q.p; });
    return v[1] > v[0] && v[2] < v[1] && v[2] > v[0] && v[3] > v[1] && v[3] > v[2];
  }

  // 只看以最近两个转折点结尾的形态，取振幅最大的；同等振幅优先推动浪
  function detect(S) {
    var n = S.length, best = null;
    for (var e = n - 1; e >= Math.max(0, n - 2); e--) {
      [[6, 'impulse', isImpulse], [4, 'zigzag', isZigzag]].forEach(function (c) {
        var st = e - c[0] + 1; if (st < 0) return;
        var P = S.slice(st, e + 1);
        [1, -1].forEach(function (s) {
          if (!c[2](P, s)) return;
          var amp = Math.abs(P[P.length - 1].p - P[0].p) / P[0].p;
          if (!best || amp > best.amp + 1e-9 || (Math.abs(amp - best.amp) <= 1e-9 && c[1] === 'impulse'))
            best = { type: c[1], s: s, P: P, amp: amp };
        });
      });
    }
    return best;
  }

  function drawSVG(svg, S, o) {
    var old = svg.querySelector('#ell'); if (old) old.parentNode.removeChild(old);
    var R = detect(S || []); if (!R) return null;
    var pt = R.P.map(function (q) { return { x: q.x != null ? q.x : o.X(q.hm), p: q.p, h: q.h }; });
    for (var i = 0; i < pt.length; i++) if (pt[i].x == null || !isFinite(pt[i].x)) return null;
    var ORG = '#ff7a00', BLU = '#4d7cff', c = o.clip || [0, 0, 1e4, 1e4];
    var gp = E('g', { id: 'ell', 'pointer-events': 'none' });
    var cp = E('clipPath', { id: 'ellclip' });
    cp.appendChild(E('rect', { x: c[0], y: c[1], width: c[2] - c[0], height: c[3] - c[1] }));
    gp.appendChild(cp);
    var inner = E('g', { 'clip-path': 'url(#ellclip)' });

    // 蓝色通道：推动浪 = 过2、4浪低点连线 + 过3浪的平行线；锯齿浪 = 过起点与b浪连线 + 过a浪的平行线
    var L = pt.length - 1, a1, a2, b;
    if (R.type === 'impulse') { a1 = pt[2]; a2 = pt[4]; b = pt[3]; } else { a1 = pt[0]; a2 = pt[2]; b = pt[1]; }
    if (a2.x > a1.x) {
      var m = (a2.p - a1.p) / (a2.x - a1.x), x0 = a1.x;
      var x1 = Math.min(o.xEnd || 1e4, pt[L].x + (pt[L].x - pt[0].x) * 0.2);
      var pr = function (x, ref) { return ref.p + m * (x - ref.x); };
      [[a1, x0], [b, Math.min(b.x, x0)]].forEach(function (d) {
        inner.appendChild(E('line', { x1: d[1], y1: o.Y(pr(d[1], d[0])), x2: x1, y2: o.Y(pr(x1, d[0])), stroke: BLU, 'stroke-width': 1.1, opacity: 0.85 }));
      });
    }
    // 橙色波浪折线
    inner.appendChild(E('polyline', {
      points: pt.map(function (q) { return q.x.toFixed(1) + ',' + o.Y(q.p).toFixed(1); }).join(' '),
      fill: 'none', stroke: ORG, 'stroke-width': 1.7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.92
    }));
    gp.appendChild(inner);

    var names = R.type === 'impulse' ? ['', '1', '2', '3', '4', '5'] : ['', 'a', 'b', 'c'];
    pt.forEach(function (q, k) {
      if (!names[k]) return;
      var t = E('text', {
        x: q.x, y: o.Y(q.p) + (q.h ? -6 : 13), fill: ORG, 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle',
        stroke: 'rgba(5,10,16,.9)', 'stroke-width': 2.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round'
      });
      t.textContent = names[k]; gp.appendChild(t);
    });

    if (o.before && o.before.parentNode === svg) svg.insertBefore(gp, o.before); else svg.appendChild(gp);
    return { type: R.type, dir: R.s > 0 ? '上行' : '下行', pivots: R.P };
  }

  g.Elliott = { swingsFrom: swingsFrom, detect: detect, drawSVG: drawSVG };
})(typeof window !== 'undefined' ? window : globalThis);
