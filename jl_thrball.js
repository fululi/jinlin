/* jl_thrball.js v2 (11-17) —— 持仓页分时大图的「阈值球」: 快到确认点的虚线圈 + 圈旁振幅(x%/每手 价) + 现价右边那行「↑1.3/1.5 20.36」。只给持仓页用。
   11-17 用户「作战屏和持仓页本来就不一样, 不要搞一样的算法」: 按持仓页自己的口径算, 不用作战屏小球那套(分钟高低 / 强档2.5%):
     · 参照点 = 持仓页自己标出来的最后一个高/低点(createCardIntraday 的 lastMarks, 经 geom().marks 读)
     · 待确认点 = 那个点之后的反向极值(收盘价序列, 同持仓页画线用的价)
     · 圈旁振幅 = 待确认点相对参照点的 %/每手(100股)钱, 同持仓页段振幅写法(去掉 ▲▼, 涨棕黄/跌青蓝)
     · 确认价 = 待确认点 ×(1±阈值), 阈值 = 作战屏「回落」给这只票分时设的那档(zp_thr_v1[代码]), 没设 1.5%
   只显示, 不进任何算法。引用: index.html renderHldIntradayJL → JLThrBall.attach(canvas, chart, get)。 */
(function () {
  if (window.JLThrBall && window.JLThrBall.v >= 2) return;
  function thrOf(code) { try { var v = +JSON.parse(localStorage.getItem('zp_thr_v1') || '{}')[code]; if (v >= 0.005 && v <= 0.05) return v; } catch (e) { } return 0.015; }
  /* p = 收盘价序列(geom().prices), marks = 持仓页高低点 [{idx, type:'H'|'L', price}], i0 = 09:30 起的下标 */
  function pending(p, marks, th, i0) {
    var n = p.length; if (n < 2 || !(th > 0)) return null;
    var M = null; (marks || []).forEach(function (m) { if (m && m.idx >= (i0 || 0) && m.idx < n && (!M || m.idx > M.idx)) M = m; });
    if (!M || M.idx >= n - 1) return null;
    var isH = M.type === 'H', ei = -1, e = isH ? Infinity : -Infinity;
    for (var i = M.idx + 1; i < n; i++) { var v = p[i]; if (!(v > 0)) continue; if (isH ? v <= e : v >= e) { e = v; ei = i; } }
    if (ei < 0) return null;
    var cur = p[n - 1], dir = isH ? 1 : -1;   /* 参照是高 → 待确认点是低 → 等反弹(↑); 参照是低 → 等回落(↓) */
    var rt = isH ? Math.max(0, (cur - e) / e) : Math.max(0, (e - cur) / e);
    var tg = Math.round(e * (isH ? 1 + th : 1 - th) * 1e6) / 1e4; tg = isH ? (Math.floor(tg) + 1) / 100 : (Math.ceil(tg) - 1) / 100;   /* 同作战屏收盘价口径: 严格越过才算 */
    var d = (e / M.price - 1) * 100;
    return { i: ei, p: e, ref: M.price, up: d >= 0, amp: Math.abs(d).toFixed(1) + '%/' + Math.round(Math.abs(e - M.price) * 100), tg: tg, pr: rt / th, th: th, dir: dir,
      txt: (isH ? '↑' : '↓') + (rt * 100).toFixed(1) + '/' + (th * 100).toFixed(1) + ' ' + tg.toFixed(2) };
  }
  function style(pr) { return pr >= 0.8 ? { c: '#ff8a3e', w: 1.4 } : pr >= 0.4 ? { c: '#ffe07a', w: 1.2 } : { c: '#ffc4c4', w: 1.1 }; }   /* <40% 淡粉 / 40~80% 黄 / ≥80% 橙红闪 */

  function attach(canvas, chart, get) {
    var doc = canvas.ownerDocument || document, parent = canvas.parentNode;
    if (!parent || !chart || typeof chart.geom !== 'function' || typeof chart.on !== 'function') return null;
    try { if (canvas.__jlThrBall) canvas.__jlThrBall.destroy(); } catch (e0) { }   /* 同一块画布只留一层 */
    var ov = doc.createElement('canvas'); ov.style.position = 'absolute'; ov.style.pointerEvents = 'none'; ov.className = 'jlThrBallOv';
    if ((getComputedStyle(parent).position || 'static') === 'static') parent.style.position = 'relative';
    parent.appendChild(ov);
    var dead = false, flashOn = false, tm = 0, ph = 0, H;
    function render() {
      if (dead) return;
      var g = chart.geom(), ctx = ov.getContext('2d');
      ov.width = canvas.width; ov.height = canvas.height;
      ov.style.width = canvas.style.width || (g ? g.w + 'px' : ''); ov.style.height = canvas.style.height || (g ? g.h + 'px' : '');
      ov.style.left = (canvas.offsetLeft || 0) + 'px'; ov.style.top = (canvas.offsetTop || 0) + 'px';
      flashOn = false;
      if (!g || !g.prices || (chart.isVisible && !chart.isVisible())) return;
      var D = null; try { D = get(); } catch (e) { } if (D === null) { H.destroy(); return; } if (!D) return;   /* get() 返回 null = 这张图已被换掉 → 撤层 */
      var i0 = 0; if (D.T) for (var k0 = 0; k0 < D.T.length; k0++) if (D.T[k0] && D.T[k0] >= '09:30') { i0 = k0; break; }
      var R = pending(g.prices, g.marks, thrOf(D.code), i0); if (!R) return;
      var k = canvas.width / g.w || 1; ctx.scale(k, k);
      var S = style(R.pr), cx = g.xOfIdx(R.i), cy = g.yOfPrice(R.p) + (R.dir === 1 ? 4 : -4), right = g.w - (g.r || 0) - 2;
      if (R.pr >= 0.8) { flashOn = true; ctx.save(); ctx.globalAlpha = 0.85 * (0.55 + 0.45 * Math.cos(ph)); ctx.strokeStyle = '#ff7a2e'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, 6.5 + 1.5 * Math.sin(ph), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = S.c; ctx.lineWidth = S.w; ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.font = '400 10px -apple-system,"SF Pro Text","PingFang SC",sans-serif'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      var T = function (s, x, y, c) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(5,10,16,.85)'; ctx.strokeText(s, x, y); ctx.fillStyle = c; ctx.fillText(s, x, y); };
      /* 圈旁: 振幅 + 价 (低点写在圈下, 高点写在圈上), 放不下往里挪 */
      var a1 = R.amp + ' ', a2 = R.p.toFixed(2), w1 = ctx.measureText(a1).width, w2 = ctx.measureText(a2).width, ax = Math.max((g.l || 0) + 2, Math.min(cx - (w1 + w2) / 2, right - w1 - w2)), ay = cy + (R.dir === 1 ? 11 : -11);
      T(a1, ax, ay, R.up ? '#ffc080' : '#9ffaff'); T(a2, ax + w1, ay, '#ffffff');
      /* 现价右边、确认价那个高度: 阈值进度 + 确认价, 虚线连到现价 */
      var n = g.prices.length, lx = g.xOfIdx(n - 1), ty = g.yOfPrice(R.tg), tw = ctx.measureText(R.txt).width, tx = Math.min(lx + 8, right - tw);
      if (tx - lx > 3) { ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = S.c; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(lx, ty); ctx.lineTo(tx - 2, ty); ctx.stroke(); ctx.restore(); }
      T(R.txt, tx, ty, S.c);
    }
    var off = chart.on(function () { render(); });
    H = { destroy: function () { if (dead) return; dead = true; clearInterval(tm); try { off && off(); } catch (e) { } try { ov.remove(); } catch (e2) { } if (canvas.__jlThrBall === H) canvas.__jlThrBall = null; }, redraw: render, chart: chart };
    canvas.__jlThrBall = H;
    tm = setInterval(function () { if (dead) return; if (!canvas.isConnected) { H.destroy(); return; } var D = null; try { D = get(); } catch (e) { } if (D === null) { H.destroy(); return; } if (flashOn) { ph += 0.9; render(); } }, 150);
    render();
    return H;
  }
  window.JLThrBall = { v: 2, thrOf: thrOf, pending: pending, style: style, attach: attach };
})();
