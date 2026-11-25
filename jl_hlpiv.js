/* jl_hlpiv.js ?v=1  分时/5分/15分 高低点（方向变化 DC 法）· 11-25 用户「分时上5分15分非常清晰的高低点，大波段里看小波段要对得上，要准，不能老是断」
 * 共用：hl.html（单独页）、ks.html（K线表）、index.html（首页持仓卡分时）——三处都 <script src="jl_hlpiv.js?v=1">，口径只在这里（口径表 HL1/HL2）
 * 口径表 HL1：门槛 θ = f × 前14日日线ATR%（分时0.3 / 5分0.5 / 15分0.9）；三层都在同一串 1分(老的用5分) 最高/最低上跑，所以小波段一定嵌在大波段里
 *   上行段跟踪最高价=空心候选（只会往更高挪）；从候选回落 ≥θ → 变实心锁定，不再改；低点对称；跨午休跨日连续
 * 口径表 HL2：回头进度 = 现价离候选的回头幅度 / θ；守住率查表 HOLD（tools/bt/yd_pivot_acc_1125.py，16票 04-01~11-06，2026-11-25 跑）
 *   顺=候选高遇大一级下行 / 候选低遇大一级上行。只是统计，不是买卖建议
 * 锁定点存 localStorage jl_hlpiv_lock_v1（按 票+层），刷新不丢；取数失败返回 err，宿主屏上一行「⚠ 断流」
 */
(function (W) {
  var LV = { m1: 0.3, m5: 0.5, m15: 0.9 };
  var NAME = { m1: "分时", m5: "5分", m15: "15分" };
  var BIG = { m1: "m5", m5: "m15", m15: null };
  // 守住率表 [q=0.25,0.5,0.75]，截至 2026-11-06 数据
  var HOLD = { asOf: "2026-11-06", m1: { shun: [43, 66, 86], ni: [33, 54, 78] }, m5: { shun: [40, 65, 85], ni: [31, 56, 78] }, m15: { all: [31, 57, 80] } };
  var LKEY = "jl_hlpiv_lock_v1";

  function atrMap(days) { // days: [{d:'2026-11-06',h,l,c}] 升序 → {d: 前14日ATR%}
    var tr = [], m = {};
    for (var i = 0; i < days.length; i++) {
      var x = days[i], pc = i ? days[i - 1].c : 0;
      var v = pc > 0 ? Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)) / pc : NaN;
      var s = 0, n = 0;
      for (var j = Math.max(0, i - 14); j < i; j++) if (tr[j] === tr[j]) { s += tr[j]; n++; }
      m[x.d] = n >= 5 ? s / n : NaN;
      tr.push(v);
    }
    return m;
  }

  // 方向变化状态机。bars: [{t:'202611061459',d:'2026-11-06',h,l,c}]，thr[i] 为小数
  function dc(bars, thr) {
    var P = [], d = 0, hi = null, lo = null, ih = 0, il = 0, i, j;
    for (i = 0; i < bars.length; i++) {
      var t = thr[i], H = bars[i].h, L = bars[i].l;
      if (!(t > 0)) continue;
      if (hi === null) { hi = H; lo = L; ih = il = i; continue; }
      if (d >= 0 && H > hi) { hi = H; ih = i; }
      if (d <= 0 && L < lo) { lo = L; il = i; }
      if (d >= 0 && L <= hi * (1 - t)) {
        if (d === 0 && il < ih && lo <= hi * (1 - t)) P.push({ i: il, k: "L", p: lo, ic: ih });
        P.push({ i: ih, k: "H", p: hi, ic: i }); d = -1;
        lo = Infinity; for (j = ih; j <= i; j++) if (bars[j].l < lo) { lo = bars[j].l; il = j; }
        continue;
      }
      if (d <= 0 && H >= lo * (1 + t)) {
        if (d === 0 && ih < il && hi >= lo * (1 + t)) P.push({ i: ih, k: "H", p: hi, ic: il });
        P.push({ i: il, k: "L", p: lo, ic: i }); d = 1;
        hi = -Infinity; for (j = il; j <= i; j++) if (bars[j].h > hi) { hi = bars[j].h; ih = j; }
      }
    }
    var cand = d === 1 ? { i: ih, k: "H", p: hi } : d === -1 ? { i: il, k: "L", p: lo } : null;
    return { piv: P, cand: cand, dir: d };
  }

  function loadLock() { try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { return {}; } }
  function saveLock(o) { try { localStorage.setItem(LKEY, JSON.stringify(o)); } catch (e) {} }

  // 主入口：bars 升序（老的可以是5分K，近的1分K；都要有 h/l/c/t/d），days 日K（含今天也行）
  function compute(code, bars, days) {
    var am = atrMap(days), out = { code: code, bars: bars, lv: {} }, lock = loadLock(), dirty = false;
    var keepDays = {}; // 锁定点只留近 30 个交易日
    days.slice(-30).forEach(function (x) { keepDays[x.d] = 1; });
    for (var k in LV) {
      var thr = bars.map(function (b) { return (am[b.d] || NaN) * LV[k]; });
      var r = dc(bars, thr), th = thr[thr.length - 1];
      r.th = th; r.name = NAME[k];
      r.piv.forEach(function (p) { p.t = bars[p.i].t; p.tc = bars[p.ic].t; });
      if (r.cand) r.cand.t = bars[r.cand.i].t;
      // 锁定：已实心的写进本地；本地有、这次窗口里却没算出来的（窗口起点变了）补回去，保证"实心不改不消失"
      var key = code + "|" + k, old = (lock[key] || []).filter(function (p) { return keepDays[p.t.slice(0, 4) + "-" + p.t.slice(4, 6) + "-" + p.t.slice(6, 8)]; });
      var seen = {}; r.piv.forEach(function (p) { seen[p.t + p.k] = 1; });
      var t0 = bars.length ? bars[0].t : "";
      old.forEach(function (p) { if (!seen[p.t + p.k] && p.t >= t0) { r.piv.push({ t: p.t, k: p.k, p: p.p, tc: p.tc, i: idxOf(bars, p.t), fromLock: 1 }); } });
      r.piv.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      var nl = r.piv.map(function (p) { return { t: p.t, k: p.k, p: p.p, tc: p.tc }; });
      if (JSON.stringify(nl) !== JSON.stringify(lock[key] || [])) { lock[key] = nl; dirty = true; }
      out.lv[k] = r;
    }
    if (dirty) saveLock(lock);
    // 回头进度 + 顺逆 + 查表
    var last = bars.length ? bars[bars.length - 1].c : NaN;
    for (k in LV) {
      var R = out.lv[k], c = R.cand;
      if (!c || !(R.th > 0)) { R.prog = null; continue; }
      var pb = c.k === "H" ? (1 - last / c.p) : (last / c.p - 1);
      var q = Math.max(0, pb / R.th);
      var bd = BIG[k] ? out.lv[BIG[k]].dir : 0;
      var shun = BIG[k] ? ((c.k === "H" && bd === -1) || (c.k === "L" && bd === 1)) : null;
      R.prog = { q: q, pb: pb, shun: shun, big: bd, hold: holdAt(k, q, shun) };
    }
    return out;
  }
  function idxOf(bars, t) { for (var i = bars.length - 1; i >= 0; i--) if (bars[i].t <= t) return i; return 0; }
  function holdAt(k, q, shun) { // 线性插值，q<0.25 / >0.75 只给端点（没统计到的不外推）
    var row = k === "m15" ? HOLD.m15.all : (shun ? HOLD[k].shun : HOLD[k].ni), xs = [0.25, 0.5, 0.75];
    if (q < 0.25) return null;
    if (q >= 0.75) return row[2];
    var j = q < 0.5 ? 0 : 1, f = (q - xs[j]) / 0.25;
    return Math.round(row[j] + (row[j + 1] - row[j]) * f);
  }

  // ---------- 取数：腾讯 1分/5分/日K，三个域名轮换；失败给 err（宿主显示 ⚠ 断流） ----------
  var BASES = ["https://web.ifzq.gtimg.cn", "https://ifzq.gtimg.cn", "https://proxy.finance.qq.com/ifzqgtimg"], bi = 0;
  function pfx(code) { code = String(code).replace(/^(sh|sz|bj)/, ""); return (/^[69]/.test(code) ? "sh" : /^[48]/.test(code) ? "bj" : "sz") + code; }
  function getJ(path) {
    var n = 0;
    function go() {
      var b = BASES[(bi + n) % BASES.length], ac = W.AbortController ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 8000) : 0;
      return fetch(b + path + (path.indexOf("?") > 0 ? "&" : "?") + "_r=" + Date.now(), { cache: "no-store", signal: ac ? ac.signal : undefined })
        .then(function (r) { clearTimeout(tm); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); })
        .then(function (j) { bi = (bi + n) % BASES.length; return j; })
        .catch(function (e) { clearTimeout(tm); n++; if (n < BASES.length * 2) return go(); throw e; });
    }
    return go();
  }
  function rowsM(j, p, key) { var d = j && j.data && j.data[p]; return (d && d[key]) || []; }
  function toBar(r) { var t = String(r[0]); return { t: t, d: t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6, 8), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] }; }
  function fetchAll(code) {
    var p = pfx(code);
    return Promise.all([
      getJ("/appstock/app/kline/mkline?param=" + p + ",m1,,800"),
      getJ("/appstock/app/kline/mkline?param=" + p + ",m5,,800"),
      getJ("/appstock/app/fqkline/get?param=" + p + ",day,,,40,qfq")
    ]).then(function (a) {
      var m1 = rowsM(a[0], p, "m1").map(toBar), m5 = rowsM(a[1], p, "m5").map(toBar);
      var dd = (a[2].data && a[2].data[p] && (a[2].data[p].qfqday || a[2].data[p].day)) || [];
      var days = dd.map(function (r) { return { d: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4] }; });
      if (!m1.length || !days.length) throw Error("没取到分钟K");
      var t0 = m1[0].t, bars = m5.filter(function (b) { return b.t < t0; }).concat(m1); // 老的用5分，近3天用1分
      return { code: p, bars: bars, m1: m1, days: days, at: Date.now() };
    });
  }

  // ---------- 画：宿主给 x(t字符串)->px / y(价)->px，画实心/空心/连线/价签 ----------
  // opt: {levels:['m1'], from:'202611060930', font:11, lw:1, label:true}
  var COL = { H: "#ff5c5c", L: "#3ddc84", line: "rgba(159,180,255,.75)" };
  function draw(ctx, res, X, Y, opt) {
    opt = opt || {}; var lv = opt.levels || ["m1"], from = opt.from || "", fs = opt.font || 11;
    lv.forEach(function (k, li) {
      var R = res && res.lv[k]; if (!R) return;
      var pts = R.piv.filter(function (p) { return p.t >= from; });
      if (R.cand && R.cand.t >= from) pts = pts.concat([{ t: R.cand.t, k: R.cand.k, p: R.cand.p, cand: 1 }]);
      if (!pts.length) return;
      var big = opt.big != null ? opt.big : (lv.length > 1 && li > 0); // 大一级的层：黄线更粗
      ctx.save(); ctx.lineWidth = (opt.lw || 1) * (big ? 1.6 : 1); ctx.strokeStyle = big ? "rgba(255,214,102,.7)" : COL.line;
      ctx.beginPath(); pts.forEach(function (p, n) { var x = X(p.t), y = Y(p.p); if (x == null) return; n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.font = "400 " + fs + "px -apple-system,PingFang SC,sans-serif"; ctx.textAlign = "center";
      pts.forEach(function (p) {
        var x = X(p.t), y = Y(p.p); if (x == null) return;
        var r = (big ? 4 : 3) * (opt.lw || 1), up = p.k === "H";
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
        if (p.cand) { ctx.lineWidth = 1.2; ctx.strokeStyle = COL[p.k]; ctx.stroke(); } else { ctx.fillStyle = COL[p.k]; ctx.fill(); }
        if (opt.label !== false) {
          ctx.fillStyle = p.cand ? COL[p.k] : "#fff"; ctx.globalAlpha = p.cand ? 0.85 : 0.95;
          ctx.fillText((p.cand ? "候" : "") + p.p.toFixed(2), x, up ? y - r - 3 : y + r + fs);
          ctx.globalAlpha = 1;
        }
      });
      ctx.restore();
    });
  }
  // 副图文字：回头进度一行
  function progText(res, k) {
    var R = res && res.lv[k]; if (!R || !R.prog) return "";
    var g = R.prog, c = R.cand;
    return R.name + (c.k === "H" ? " 离候选高回落" : " 离候选低反弹") + (g.pb * 100).toFixed(1) + "%·门槛" + (R.th * 100).toFixed(1) + "% → " + Math.round(Math.min(g.q, 9.99) * 100) + "%"
      + (g.shun == null ? "" : g.shun ? "·顺大级" : "·逆大级") + (g.hold != null ? "·守住≈" + g.hold + "%" : "");
  }
  W.JLHL = { LV: LV, NAME: NAME, HOLD: HOLD, compute: compute, fetchAll: fetchAll, draw: draw, progText: progText, dc: dc, atrMap: atrMap, pfx: pfx, V: 1 };
})(window);
