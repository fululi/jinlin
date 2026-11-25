/* jl_bw.js ?v=1 (11-25) 作战屏副图「波段位置」· 用户「做T屏 我没看到 图上的高低 和副图你画到哪里去了？」
   由 jl_huo.js 指标钮动态加载(和 DK/三线 同一排, 同一套 embedNode/feed 接口); 横轴跟主图 W.__zpSubAx(同一批K同一个x)
   数值/点 全部来自 jl_hlpiv.js(口径表 HL1/HL3), 和 K线表/持仓卡/hl.html 同一份; 这里只画
   0~100: 100=贴着这段高点 0=贴着这段低点; 锁定一次会跳一下(换新一段); 红绿点=锁定高/低(画在100/0), 空心=候选
   80/20 虚线只是位置, 11-25 回测(tools/bt/hlpos_bt_1125.py)进80卖→20接 卖接差价≈0, 不是买卖信号。只显示, 不进算法, 没有提醒 */
(function (W) {
  'use strict';
  var HLV = 'jl_hlpiv.js?v=2', CACHE = {}, ACT = [];
  function lib(cb) {
    if (W.JLHL) return cb();
    if (!lib.q) { lib.q = []; var s = document.createElement('script'); s.src = HLV; s.onload = function () { var q = lib.q; lib.q = null; q.forEach(function (f) { try { f(); } catch (e) { } }); }; s.onerror = function () { lib.q = null; lib.err = 1; }; document.head.appendChild(s); }
    if (lib.q) lib.q.push(cb);
  }
  function live() { var d = new Date(), w = d.getDay(), m = d.getHours() * 60 + d.getMinutes(); return w >= 1 && w <= 5 && (m >= 555 && m <= 692 || m >= 778 && m <= 902); }
  function get(code, done) {
    var c = CACHE[code] || (CACHE[code] = { res: null, at: 0, ok: 0, err: '', busy: 0 });
    var gap = c.err ? 8e3 : live() ? 15e3 : 6e4;
    if (!c.busy && Date.now() - c.at > gap) {
      c.busy = 1; c.at = Date.now();
      lib(function () {
        W.JLHL.fetchAll(code).then(function (D) { c.res = W.JLHL.compute(D.code, D.bars, D.days); c.ok = Date.now(); c.err = ''; })
          .catch(function (e) { c.err = (e && e.message) || '取数失败'; }).then(function () { c.busy = 0; done(); });
      });
      if (lib.err) { c.busy = 0; c.err = 'jl_hlpiv.js 没加载到'; }
    }
    return c;
  }
  function lvOf(lv) { lv = String(lv || ''); return /^(5分|5)$/.test(lv) ? 'm5' : /^(15分|30分|60分|15|30|60)$/.test(lv) ? 'm15' : /^(1分|分时|1|0)$/.test(lv) ? 'm1' : null; }
  function tOf(b) { return String((b && (b.key || b.t)) || '').replace(/\D/g, '').slice(0, 12); }
  var CSS = '.bwIn .ssl{display:flex;gap:8px;font:400 10px -apple-system,"PingFang SC",sans-serif;color:#fff;white-space:nowrap;overflow:hidden;padding:0 2px}.bwIn svg{display:block;width:100%;height:auto;touch-action:pan-y}';
  function embedNode(opts) {
    if (!document.getElementById('bwCss')) { var st0 = document.createElement('style'); st0.id = 'bwCss'; st0.textContent = CSS; document.head.appendChild(st0); }
    var node = document.createElement('div'); node.className = 'sxIn bwIn'; node.innerHTML = '<div class="ssx"></div>';
    return { node: node, s1: node.querySelector('.ssx'), code: (opts && opts.code) || '', bars: null, lv: null, which: '波段位置' };
  }
  function draw(st) {
    var el = st.s1, bars = st.bars, own = lvOf(st.lv), code = String(st.code || '').replace(/\D/g, '');
    if (!own) { el.innerHTML = '<div class="ssl"><span>波段位置 只在 分时/1分/5分/15分</span></div>'; return; }
    if (!/^\d{6}$/.test(code)) { el.innerHTML = '<div class="ssl"><span>拿不到代码</span></div>'; return; }
    var c = get(code, function () { if (st.node && st.node.isConnected) draw(st); }), res = c.res;
    var A = W.__zpSubAx; A = A && A.bars === bars && A.N > 0 ? A : null;
    var WD = A ? 360 : 380, PL = A ? A.PL : 24, PR = A ? 360 - A.PR : 3, Hh = A ? A.H : 90, T = 5, Bt = Hh - 4;
    var N = A ? A.N : Math.min(90, bars.length), i0 = A ? A.i0 : bars.length - N, cw = A ? A.cw : (WD - PL - PR) / N;
    var X = A ? function (i) { return A.x(i); } : function (i) { return PL + cw * (i - i0 + 0.5); };
    var Y = function (p) { return T + (100 - p) / 100 * (Bt - T); };
    var warn = c.err && (!c.ok || Date.now() - c.ok > 30e3) ? '⚠ 断流' + (c.ok ? ' ' + Math.round((Date.now() - c.ok) / 1e3) + '秒' : '') + ' · ' + c.err : '';
    if (!res) { el.innerHTML = '<div class="ssl"><span' + (warn ? ' style="color:#ffb3b3"' : '') + '>' + (warn || '波段位置 加载中…') + '</span></div>'; return; }
    var ts = bars.map(tOf), pos = W.JLHL.posOf(res, own, ts), g = [], i;
    [[80, 'rgba(255,92,92,.6)'], [20, 'rgba(61,220,132,.6)']].forEach(function (a) { g.push('<line x1="' + PL + '" x2="' + (WD - PR) + '" y1="' + Y(a[0]).toFixed(1) + '" y2="' + Y(a[0]).toFixed(1) + '" stroke="' + a[1] + '" stroke-width=".7" stroke-dasharray="3 3"/>'); });
    var bw = Math.max(0.8, cw).toFixed(2);
    for (i = i0; i < i0 + N; i++) { var p = pos[i]; if (p == null) continue;
      if (p >= 80) g.push('<rect x="' + (X(i) - cw / 2).toFixed(1) + '" y="' + Y(p).toFixed(1) + '" width="' + bw + '" height="' + (Y(80) - Y(p)).toFixed(1) + '" fill="rgba(255,92,92,.22)"/>');
      else if (p <= 20) g.push('<rect x="' + (X(i) - cw / 2).toFixed(1) + '" y="' + Y(20).toFixed(1) + '" width="' + bw + '" height="' + (Y(p) - Y(20)).toFixed(1) + '" fill="rgba(61,220,132,.22)"/>'); }
    var s = [], seg = [];
    for (i = i0; i < i0 + N; i++) { if (pos[i] == null) { if (s.length > 1) seg.push(s); s = []; continue; } s.push(X(i).toFixed(1) + ',' + Y(pos[i]).toFixed(1)); }
    if (s.length > 1) seg.push(s);
    seg.forEach(function (a) { g.push('<polyline fill="none" stroke="#8ab4ff" stroke-width=".9" points="' + a.join(' ') + '"/>'); });
    var R = res.lv[own], from = ts[i0] || '', pts = R.piv.filter(function (q) { return q.t >= from; });
    if (R.cand && R.cand.t >= from) pts = pts.concat([{ t: R.cand.t, k: R.cand.k, cand: 1 }]);
    pts.forEach(function (q) {   /* 点落在包含这一分钟的那根K上; 画在 100(高)/0(低) —— 那根K的最高/最低就是这段的端点 */
      var lo = i0, hi = i0 + N - 1; if (!ts[hi] || q.t > ts[hi]) { if (!(q.cand && ts[hi] && q.t.slice(0, 8) === ts[hi].slice(0, 8))) return; }
      while (lo < hi) { var md = (lo + hi) >> 1; if (ts[md] < q.t) lo = md + 1; else hi = md; }
      if (ts[lo].slice(0, 8) !== q.t.slice(0, 8)) return;
      var x = X(lo).toFixed(1), y = Y(q.k === 'H' ? 100 : 0).toFixed(1), col = q.k === 'H' ? '#ff5c5c' : '#3ddc84';
      g.push(q.cand ? '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="none" stroke="' + col + '" stroke-width="1"/>' : '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="' + col + '"/>');
    });
    g.push('<g class="hx"></g>');
    var lv = pos[i0 + N - 1];
    el.innerHTML = '<div class="ssl"><span style="color:#8ab4ff">波段位置·' + W.JLHL.NAME[own] + ' ' + (lv == null ? '—' : lv.toFixed(0)) + '</span>' + (warn ? '<span style="color:#ffb3b3">' + warn + '</span>' : '') + '</div><svg viewBox="0 0 ' + WD + ' ' + Hh + '">' + g.join('') + '</svg>';
    el.__ax = { on: !!A, X: function (k) { return X(i0 + k); }, Y: Y, T: T, Bt: Bt, i0: i0, N: N, lo: 0, hi: 100, pv: function (ii) { return pos[ii] == null ? 50 : pos[ii]; } };
  }
  function feed(st, bars, lv, which, code) {
    if (!st) return;
    st.bars = bars; st.lv = lv; if (code) st.code = code;
    try { draw(st); } catch (e) { st.s1.innerHTML = '<div class="ssl"><span style="color:#ff8888">波段位置出错: ' + e.message + '</span></div>'; }
    if (ACT.indexOf(st) < 0) ACT.push(st);
  }
  function xhKey() { }
  W.JLBw = { version: 'v1', embedNode: embedNode, feed: feed, xhKey: xhKey };
})(window);
