/*! jl_macd.js — 分时 MACD 副图（MACDFS 12,26,9），仿同花顺：红绿柱 + DIF(白) + DEA(橙)
 * 做成独立的一块 SVG，插在走势图下面，不画在图上，所以不会压住任何字。
 * 横坐标与上面的分时图对齐（用同一个 X 函数）。
 *
 * MacdFS.draw(svg, pts, {X: hm->x, x0: 绘图区左, x1: 绘图区右})
 *   svg = 走势图的 svg；pts = LIVE.pts = [{hm,p},...]
 * MacdFS.calc(prices, 12, 26, 9) -> {dif, dea, hist}   hist = (DIF-DEA)*2（同花顺口径）
 */
(function (g) {
  var NS = 'http://www.w3.org/2000/svg';
  function E(n, a, t) {
    var e = document.createElementNS(NS, n);
    for (var k in a) e.setAttribute(k, a[k]);
    if (t != null) e.textContent = t;
    return e;
  }
  function ema(arr, n) {
    var k = 2 / (n + 1), o = [], v;
    arr.forEach(function (x, i) { v = i ? x * k + v * (1 - k) : x; o.push(v); });
    return o;
  }
  function calc(prices, S, L, M) {
    var a = ema(prices, S || 12), b = ema(prices, L || 26);
    var dif = a.map(function (x, i) { return x - b[i]; });
    var dea = ema(dif, M || 9);
    var hist = dif.map(function (x, i) { return (x - dea[i]) * 2; });
    return { dif: dif, dea: dea, hist: hist };
  }

  function draw(svg, pts, o) {
    var par = svg && svg.parentNode;
    if (!par || !pts || pts.length < 2) return null;
    var host = par.querySelector('#macdfs');
    if (!host) {
      host = document.createElement('div');
      host.id = 'macdfs';
      host.style.cssText = 'margin-top:4px;pointer-events:none';
      par.insertBefore(host, svg.nextSibling);
    }
    var vb = svg.viewBox && svg.viewBox.baseVal;
    var W = (vb && vb.width) || 342, H = 92, top = 17, bot = H - 6;
    var xs = [], ps = [];
    pts.forEach(function (q) {
      var x = o.X(q.hm);
      if (q.p > 0 && x != null && isFinite(x)) { xs.push(x); ps.push(q.p); }
    });
    if (ps.length < 2) return null;

    var R = calc(ps, 12, 26, 9), m = 1e-9, i;
    for (i = 0; i < ps.length; i++) m = Math.max(m, Math.abs(R.dif[i]), Math.abs(R.dea[i]), Math.abs(R.hist[i]));
    var mid = (top + bot) / 2, half = (bot - top) / 2 - 1;
    var Y = function (v) { return mid - v / m * half; };

    var sv = E('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: 'display:block' });
    var RED = '#ef5350', GRN = '#34d399', DIF = '#e6ebf2', DEA = '#ffb84d';
    sv.appendChild(E('line', { x1: o.x0, y1: mid, x2: o.x1, y2: mid, stroke: '#8a96a6', 'stroke-width': 0.6, 'stroke-dasharray': '3 3', opacity: 0.6 }));

    var bw = Math.max(0.5, (o.x1 - o.x0) / 240 * 0.7);       // 一天约 240 个点
    for (i = 0; i < ps.length; i++) {
      var h = R.hist[i], y = Y(h), y0 = mid;
      sv.appendChild(E('rect', {
        x: (xs[i] - bw / 2).toFixed(2), y: Math.min(y, y0).toFixed(2),
        width: bw.toFixed(2), height: Math.max(0.4, Math.abs(y - y0)).toFixed(2),
        fill: h >= 0 ? RED : GRN, opacity: 0.9
      }));
    }
    var line = function (arr, c, w) {
      sv.appendChild(E('polyline', {
        points: arr.map(function (v, k) { return xs[k].toFixed(1) + ',' + Y(v).toFixed(1); }).join(' '),
        fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round'
      }));
    };
    line(R.dif, DIF, 1); line(R.dea, DEA, 1);

    var n = ps.length - 1, d = Math.abs(R.dif[n]) >= 1 ? 2 : 3, f = function (v) { return v.toFixed(d); };
    sv.appendChild(E('text', { x: o.x0, y: 11, fill: '#8a96a6', 'font-size': 9 }, 'MACDFS (12,26,9)'));
    var t = E('text', { x: o.x1, y: 11, 'font-size': 9, 'text-anchor': 'end' });
    t.appendChild(E('tspan', { fill: DIF }, 'DIF ' + f(R.dif[n]) + '  '));
    t.appendChild(E('tspan', { fill: DEA }, 'DEA ' + f(R.dea[n]) + '  '));
    t.appendChild(E('tspan', { fill: R.hist[n] >= 0 ? RED : GRN }, 'MACD ' + f(R.hist[n])));
    sv.appendChild(t);

    host.innerHTML = '';
    host.appendChild(sv);
    return { dif: R.dif[n], dea: R.dea[n], hist: R.hist[n] };
  }

  g.MacdFS = { calc: calc, draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
