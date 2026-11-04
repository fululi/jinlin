/*! jl_pitchfork.js — 作T作战屏 SVG 干草叉（复用页面已有的 window.__SWJL 转折点，不另找枢轴）
 *
 * Pitchfork.drawSVG(svg, swings, opt)
 *   swings : window.__SWJL = [{p:价格, h:1高/0低, hm:'0945'}, ...] 高低交替，取最后三个当 A/B/C
 *   opt.X  : hm -> 横坐标（传 xOfHmJL）
 *   opt.Y  : 价格 -> 纵坐标（传页面的 Y）
 *   opt.xEnd  : 线延长到的右边界（页面是 LX-6）
 *   opt.clip  : [x1,y1,x2,y2] 绘图区，线超出会被裁掉
 *   opt.before: 插到哪个元素之前（传 #pline，让干草叉在走势线下面）
 * 返回 {A,B,C,slope,medAt(x)}；不足三个转折点返回 null
 */
(function (g) {
  var NS = 'http://www.w3.org/2000/svg';
  function E(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }

  function drawSVG(svg, S, o) {
    var old = svg.querySelector('#pfk'); if (old) old.parentNode.removeChild(old);
    if (!S || S.length < 3) return null;
    var P = S.slice(-3).map(function (m) { return { x: m.x != null ? m.x : o.X(m.hm), p: m.p }; });
    for (var i = 0; i < 3; i++) if (P[i].x == null || !isFinite(P[i].x)) return null;
    var A = P[0], B = P[1], C = P[2];
    var mx = (B.x + C.x) / 2, my = (B.p + C.p) / 2;
    if (mx <= A.x) return null;
    var s = (my - A.p) / (mx - A.x);                       // 每像素的价格变化
    var med = function (x) { return A.p + s * (x - A.x); };
    var dB = B.p - med(B.x), dC = C.p - med(C.x);
    var offs = [dC, dC / 2, 0, dB / 2, dB].sort(function (a, b) { return a - b; });

    var x0 = A.x, x1 = o.xEnd, c = o.clip || [0, 0, 1e4, 1e4];
    var VIO = '#b695ff';                                    // 紫色：避开页面里 红=卖 / 绿=买 的语义
    var gp = E('g', { id: 'pfk', 'pointer-events': 'none' });
    var cid = 'pfclip';
    var cp = E('clipPath', { id: cid });
    cp.appendChild(E('rect', { x: c[0], y: c[1], width: c[2] - c[0], height: c[3] - c[1] }));
    gp.appendChild(cp);
    var inner = E('g', { 'clip-path': 'url(#' + cid + ')' });
    var Yl = function (off, x) { return o.Y(med(x) + off); };
    var line = function (off, w, op, dash) {
      var a = { x1: x0, y1: Yl(off, x0), x2: x1, y2: Yl(off, x1), stroke: VIO, 'stroke-width': w, opacity: op };
      if (dash) a['stroke-dasharray'] = dash;
      inner.appendChild(E('line', a));
    };
    // 外轨之间极淡的底色
    inner.appendChild(E('polygon', {
      points: [x0, Yl(offs[0], x0), x1, Yl(offs[0], x1), x1, Yl(offs[4], x1), x0, Yl(offs[4], x0)].join(','),
      fill: VIO, opacity: 0.06
    }));
    line(offs[0], 0.8, 0.55); line(offs[4], 0.8, 0.55);     // 外轨
    line(offs[1], 0.8, 0.5, '3 3'); line(offs[3], 0.8, 0.5, '3 3'); // 0.5 线
    line(0, 1.2, 0.95);                                     // 中线
    gp.appendChild(inner);
    [A, B, C].forEach(function (q) { gp.appendChild(E('circle', { cx: q.x, cy: o.Y(q.p), r: 2.2, fill: VIO, opacity: 0.9 })); });

    if (o.before && o.before.parentNode === svg) svg.insertBefore(gp, o.before); else svg.appendChild(gp);
    return { A: A, B: B, C: C, slope: s, medAt: med };
  }

  g.Pitchfork = { drawSVG: drawSVG };
})(window);

