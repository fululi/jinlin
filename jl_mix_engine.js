/* 11-09夜 混合做T 共用计算(作战屏振幅卡 jl_zp_war.html 和 振幅复盘 jl_amp_review.html 都调这一份, 改规则只改这里)
   高开(≥1%) → 尺子一二三轮 JLMIX.r3;  平开/低开 → 阈值小球+振幅 JLMIX.ball
   输入 P = 当天到现在为止的分钟 [{h,l,p,hm}], 只用当时已知的高低; 成交价 = 规则价(不按分钟开盘价改)
   参数 小球"振幅走到几成"(ba) / "卖接至少差"(bm) 两边共用 localStorage jl_mix_p_v1; 小球确认阈值 = 作战屏顶部"回落" */
(function (W) {
  var up = function (v) { return Math.ceil(Math.round(v * 1e6) / 1e4) / 100; }, dn = function (v) { return Math.floor(Math.round(v * 1e6) / 1e4) / 100; };
  var CN = ['①', '②', '③'], KEY = 'jl_mix_p_v1';
  function par() { var o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { } return { ba: o && +o.ba > 0 ? +o.ba : 0.8, bm: o && +o.bm > 0 ? +o.bm : 0.25 }; }
  function setPar(ba, bm) { try { localStorage.setItem(KEY, JSON.stringify({ ba: ba, bm: bm, t: Date.now() })); } catch (e) { } }

  /* 尺子一二三轮: o0 开盘 pc 昨收 avg 日均振幅% ku/kd ▼最高/最低系数 */
  function r3(I) {
    var P = I.P || [], o0 = I.o0, pc = I.pc, avg = I.avg; if (!(o0 > 0) || !(pc > 0) || !(avg > 0)) return null;
    var av = avg / 100 * pc, rh = up(o0 + I.ku * av), rl = dn(o0 - I.kd * av), gap = o0 / pc - 1, ty = gap >= 0.01 ? 'hi' : gap <= -0.01 ? 'lo' : 'fl';
    var RBA = Math.max(0.012, Math.min(0.035, 0.27 * avg / 100)), CAP = Math.max(0.003, 0.25 * avg / 100);
    var lu = false, lw = o0;
    if (ty === 'lo') { var l0 = o0, h0 = o0; for (var z = 0; z < P.length; z++) { var hz = P[z].h || P[z].p, lz = P[z].l || P[z].p; if (hz >= up(l0 + 0.9 * av)) { lu = true; break; } if (lz <= dn(h0 * (1 - 0.032))) break; h0 = Math.max(h0, hz); l0 = Math.min(l0, lz); } }
    var mk = [], T = [], R = 0, st, cur = null, lo = o0, hi = o0, sh = 0, s = 0, si = 0, b = 0, bi = 0, h1 = 0, plo = 0, MAXR = 3, swB = false, k0 = 0, hh0 = o0, why = '';
    var add = function (t, p, hm) { mk.push({ n: CN[R], t: t, p: p, ok: 1, hm: hm || '' }); };
    if (ty !== 'lo' || lu) {
      st = 'S';
      if (gap >= 0.02) { s = o0; si = 0; sh = o0; add('s', s, '0930'); st = 'B'; why = '①高开先卖'; }
      for (var i = 0; i < P.length && st !== 'X'; i++) {
        var h = P[i].h || P[i].p, l = P[i].l || P[i].p;
        if (st === 'S' && R === 0 && ty === 'hi' && l <= rl) { swB = true; k0 = i; hh0 = hi; break; }   /* 高开还没卖到先破▼最低 → 改先接 */
        if (st === 'S') {
          var t = R === 0 ? (lu ? up(lo + 0.9 * av) : Math.min(rh, up(lo + 0.9 * av))) : up(plo + 1.3 * (h1 - plo));
          if (h >= t) { s = t; si = i; sh = Math.max(t, h); add('s', s, P[i].hm); st = 'B'; why = CN[R] + '卖'; lo = Math.min(lo, l); hi = Math.max(hi, h); continue; }
        } else if (st === 'B') {
          var tb = dn(Math.min(sh * (1 - RBA), s * (1 - CAP)));   /* 接 = 卖后最高回落 且 至少比卖价低 0.25×日均 */
          if (l <= tb) { b = tb; add('b', b, P[i].hm); T.push({ n: CN[R], why: why, si: si, s: s, bi: i, b: b }); h1 = sh; plo = Math.min(b, l); R++; st = R >= MAXR ? 'X' : 'S'; lo = Math.min(lo, l); hi = Math.max(hi, h); continue; }
          sh = Math.max(sh, h);
        }
        if (st === 'S' && R > 0) plo = Math.min(plo, l);
        lo = Math.min(lo, l); hi = Math.max(hi, h);
      }
      if (swB) { } else if (st === 'S') cur = { t: 's', p: R === 0 ? (lu ? up(lo + 0.9 * av) : Math.min(rh, up(lo + 0.9 * av))) : up(plo + 1.3 * (h1 - plo)) };
      else if (st === 'B') cur = { t: 'b', p: dn(Math.min(sh * (1 - RBA), s * (1 - CAP))) };
    }
    var open = null;
    if (!swB && st === 'B') open = { t: 'B', n: CN[R], why: why, si: si, s: s };
    if (swB || !(ty !== 'lo' || lu)) {
      st = 'B'; var hh = swB ? hh0 : o0;
      for (var k = swB ? k0 : 0; k < P.length && st !== 'X'; k++) {
        var h2 = P[k].h || P[k].p, l2 = P[k].l || P[k].p;
        if (st === 'B') {
          var tb2 = dn(hh * (1 - 0.032));
          if (l2 <= tb2) { b = tb2; bi = k; add('b', b, P[k].hm); st = 'S'; hh = Math.max(hh, h2); continue; }
        } else {
          var ts = rh > b * 1.005 ? up(Math.min(rh, b * 1.027)) : up(b * 1.027);
          if (h2 >= ts) { s = ts; add('s', s, P[k].hm); T.push({ n: CN[R], why: CN[R] + '先接', si: k, s: s, bi: bi, b: b }); R++; st = R >= MAXR ? 'X' : 'B'; hh = Math.max(s, h2); continue; }
        }
        hh = Math.max(hh, h2); lw = Math.min(lw, l2);
      }
      if (st === 'B') cur = { t: 'b', p: dn(hh * (1 - 0.032)) };
      else if (st === 'S') { cur = { t: 's', p: rh > b * 1.005 ? up(Math.min(rh, b * 1.027)) : up(b * 1.027) }; open = { t: 'S', n: CN[R], why: CN[R] + '先接', bi: bi, b: b }; }
    }
    if (cur) { cur.n = CN[R]; cur.wait = 1; mk.push(cur); }
    var lw0 = ty === 'lo' && !lu && R === 0 && st === 'B' && !mk.some(function (m) { return m.ok; });
    if (lw0) mk.push({ n: '①', t: 's', p: up(lw + 0.9 * av), wait: 1 });   /* 低开还没动: 接价和冲高先卖价都挂着 */
    try {   /* 还没轮到的卖价往后推(淡色), 只在今天走得到的范围里 */
      var capP = Math.max(hi, lo + av), pj = function (n, p) { if (p <= capP) mk.push({ n: CN[n], t: 's', p: p, proj: 1 }); };
      if (st !== 'X') {
        var hfl = (ty !== 'lo' || lu || lw0) && !swB, ps = 0, rr = R;
        if (hfl) {
          if (lw0) { ps = up(lw + 0.9 * av); rr = 0; }
          else if (st === 'S') ps = cur.p;
          else if (st === 'B') { ps = up(cur.p + 1.3 * (Math.max(sh, s) - cur.p)); rr = R + 1; if (rr < MAXR) pj(rr, ps); }
          for (var r9 = rr + 1; r9 < MAXR && ps > 0; r9++) { var pb = dn(ps * (1 - RBA)); ps = up(pb + 1.3 * (ps - pb)); pj(r9, ps); }
        } else {
          var bb9 = st === 'B' ? cur.p : 0; ps = st === 'S' ? cur.p : 0; rr = R;
          if (st === 'B') { ps = rh > bb9 * 1.005 ? up(Math.min(rh, bb9 * 1.027)) : up(bb9 * 1.027); pj(rr, ps); }
          for (var r8 = rr + 1; r8 < MAXR && ps > 0; r8++) { var b8 = dn(ps * (1 - 0.032)); ps = up(b8 * 1.027); pj(r8, ps); }
        }
      }
    } catch (ePj) { }
    var rn = ['第一轮', '第二轮', '第三轮'][Math.min(R, 2)], lab = { hi: '高开', fl: '平开', lo: '低开' }[ty];
    if (lu) lab = '低开·先冲高';
    if (swB) lab = '高开·破低改先接';
    var tr = lw0 ? '低开 · 等接 或 冲高先卖' : st === 'X' ? lab + ' · 三轮做完' : lab + ' · ' + rn + (cur && cur.t === 's' ? ' 等卖' : ' 等接');
    return { mode: 'r3', ty: ty, rh: rh, rl: rl, mk: mk, tr: tr, R: R, trades: T, open: open };
  }

  /* 阈值小球+振幅: th 确认阈值 a 振幅几成 m 卖接至少差(×日均) cur 现价 */
  function ball(I) {
    var P = I.P || [], o0 = I.o0, pc = I.pc, avg = I.avg; if (!(o0 > 0) || !(pc > 0) || !(avg > 0)) return null;
    var th = I.th || 0.015, a = I.a || 0.8, m = I.m || 0.25, av = avg / 100 * pc, Z = 0.5, MR = 2;
    var st = 'N', dl = o0, dh = o0, rh = o0, rl = o0, p = 0, pi = 0, n = 0, done = [], T = [], mk = [], seen = 0;
    for (var i = 0; i < P.length; i++) {
      var h = P[i].h || P[i].p, l = P[i].l || P[i].p; dh = Math.max(dh, h); dl = Math.min(dl, l); rh = Math.max(rh, h); rl = Math.min(rl, l); var amp = dh - dl;
      if (l <= rh * (1 - th)) { var px = dn(rh * (1 - th));
        if (st === 'N' && n < MR) { if (amp >= a * av) { seen = 1; if (px - dl >= Z * amp) { p = px; pi = i; st = 'S'; } } }
        else if (st === 'B' && px >= p + m * av) { done.push({ n: CN[n], b: p, s: px, f: 'b' }); T.push({ n: CN[n], why: CN[n] + '先接', si: i, s: px, bi: pi, b: p }); n++; st = 'N'; }
        rl = px; rh = px;
      } else if (h >= rl * (1 + th)) { var py = up(rl * (1 + th));
        if (st === 'N' && n < MR) { if (amp >= a * av) { seen = 1; if (dh - py >= Z * amp) { p = py; pi = i; st = 'B'; } } }
        else if (st === 'S' && py <= p - m * av) { done.push({ n: CN[n], s: p, b: py, f: 's' }); T.push({ n: CN[n], why: CN[n] + '卖', si: pi, s: p, bi: i, b: py }); n++; st = 'N'; }
        rh = py; rl = py;
      }
    }
    done.forEach(function (d) { mk.push({ n: d.n, t: 's', p: d.s, ok: 1 }); mk.push({ n: d.n, t: 'b', p: d.b, ok: 1 }); });
    var cur = I.cur || (P.length && P[P.length - 1].p) || o0, ampN = dh - dl, need = a * av, ok = ampN >= need, cs = dn(rh * (1 - th)), cb = up(rl * (1 + th)), nx = null, open = null;
    var gap = o0 / pc - 1, ty = gap >= 0.01 ? 'hi' : gap <= -0.01 ? 'lo' : 'fl', lab = { hi: '高开', fl: '平开', lo: '低开' }[ty];
    if (st === 'S') { var tb = dn(p - m * av); mk.push({ n: CN[n], t: 's', p: p, ok: 1 }); mk.push({ n: CN[n], t: 'b', p: tb, wait: 1, l: '接≤' }); nx = { n: CN[n], t: 'b', p: tb, le: '≤', sub: '低点反弹' + (th * 100).toFixed(1) + '%确认 · 现' + Math.min(cb, cur).toFixed(2), pos: p }; open = { t: 'B', n: CN[n], why: CN[n] + '卖', si: pi, s: p }; }
    else if (st === 'B') { var ts = up(p + m * av); mk.push({ n: CN[n], t: 'b', p: p, ok: 1 }); mk.push({ n: CN[n], t: 's', p: ts, wait: 1, l: '卖≥' }); nx = { n: CN[n], t: 's', p: ts, le: '≥', sub: '高点回落' + (th * 100).toFixed(1) + '%确认 · 现' + Math.max(cs, cur).toFixed(2), pos: p }; open = { t: 'S', n: CN[n], why: CN[n] + '先接', bi: pi, b: p }; }
    else if (n < MR) {
      var hiZ = cur - dl >= Z * ampN;
      mk.push({ n: CN[n], t: 's', p: cs, f: !(ok && hiZ), wait: ok && hiZ ? 1 : 0, l: '确认卖' });
      mk.push({ n: CN[n], t: 'b', p: cb, f: !(ok && !hiZ), wait: ok && !hiZ ? 1 : 0, l: '确认接' });
      nx = ok ? { n: CN[n], t: hiZ ? 's' : 'b', p: hiZ ? cs : cb, sub: (hiZ ? '最高' + rh.toFixed(2) + '回落' : '最低' + rl.toFixed(2) + '反弹') + (th * 100).toFixed(1) + '%' } : { n: CN[n], idle: 1, need: (need - ampN) / pc * 100, cs: cs, cb: cb };
    }
    var tr = '小球 · ' + lab + ' · ' + (n >= MR && st === 'N' ? '两轮做完' : (CN[n] || '') + (st === 'S' ? ' 等接' : st === 'B' ? ' 等卖' : ok ? ' 等确认' : ' 等振幅'));
    return { mode: 'ball', ty: ty, mk: mk, tr: tr, R: n, nx: nx, done: done, need: need / pc * 100, th: th, trades: T, open: open, seen: seen, amp: ampN / pc * 100 };
  }
  W.JLMIX = { r3: r3, ball: ball, par: par, setPar: setPar, up: up, dn: dn };
})(window);
