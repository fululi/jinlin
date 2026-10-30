/* jl_tintra.js v1 (2026-10-30, 本地稿未推送) —— 盘中做T · 分时高低点(含IV缺口核对), 只记账不下单
 * 规则与影子第三版 ~/jl_shadow/multi.js 一字不差(simulate/openIV/liveGaps/nearTag/control/idealNet 原样搬), 周一影子结算可直接对账:
 *   1分K逐根, 每根走完才判断, 按该根收盘价成交(不偷看)
 *   卖(持仓满时): 09:35 后、14:50 前; 从"上次接回(或开盘)以来最低价"反弹 ≥ 0.4×ATR5, 且现价在当日已走区间的上 30%
 *   接回(已卖时): 从卖出后最高价回落 ≥ 1.5% / 或跌回当日区间下 30% / 或涨过 卖价+0.5×ATR5(止损) / 14:57 起强制接回
 *   每天最多3轮, 每轮 持仓×25% 取整到手, 费用单边0.15%两边计; 对照=同轮数同持有分钟, 卖出时刻随机
 *   IV核对只记录不参与决策: 成交价离未回补的1分钟IV(跳空>0.05%且影线重叠, 补=碰前收)或日线/开盘缺口 ≤0.3% → 记"贴IV/贴缺口"
 * 和影子版唯一差别: 盘中数据最后一根不当收盘(影子只在收盘后算整天, 结果相同); 正在走的那根1分K不用。
 * 数据: window.jlM1RowsJL(code)=1分K拷贝 / jlResoInputJL(code).bars=日K / jlHoldQtyJL / localStorage jl_gaplog_v1; 零新增请求(只调原 ensureM1JL, 它自带60秒节流)
 * 存储: jl_tintra_log_v1 (code|日期 一条, 收盘后定稿不再改)。回滚: 删 index.html 里本文件的 script 引用 + 两行 window.jlM1RowsJL/jlEnsureM1JL。 */
(function () {
  "use strict";
  var KEY = "jl_tintra_log_v1", KEEP_DAYS = 60;
  var DEF = { up: 0.4, back: 0.015, zone: 0.3, stopAtr: 0.5, maxRounds: 3, frac: 0.25, lot: 100, cost: 0.0015, near: 0.003 };

  /* ===== 以下与 ~/jl_shadow/multi.js 相同 ===== */
  function atr5(d) {
    if (d.length < 6) return 0;
    var tr = [];
    for (var i = 1; i < d.length; i++) tr.push(Math.max(d[i].h - d[i].l, Math.abs(d[i].h - d[i - 1].c), Math.abs(d[i].l - d[i - 1].c)));
    var a = (tr[0] + tr[1] + tr[2] + tr[3] + tr[4]) / 5;
    for (var k = 5; k < tr.length; k++) a = (a * 4 + tr[k]) / 5;
    return a;
  }
  function rng(seed) { var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; return function () { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }; }
  function hm(t) { var s = String(t).replace(/\D/g, ""); return s.slice(8, 10) + ":" + s.slice(10, 12); }
  function openIV(b, k, price) {
    var out = [], vm = price * 0.0005;
    for (var i = 1; i <= k; i++) {
      var p0 = b[i - 1], c0 = b[i];
      var bull = c0.o - p0.c > vm && c0.l <= p0.h, bear = p0.c - c0.o > vm && c0.h >= p0.l;
      if (!bull && !bear) continue;
      var ext = c0.o, done = false;
      for (var j = i + 1; j <= k; j++) { ext = bull ? Math.min(ext, b[j].l) : Math.max(ext, b[j].h); if (bull ? b[j].l <= p0.c : b[j].h >= p0.c) { done = true; break; } }
      if (!done) out.push({ t: hm(c0.t), lo: Math.min(p0.c, bull ? Math.min(c0.o, ext) : Math.max(c0.o, ext)), hi: Math.max(p0.c, bull ? Math.min(c0.o, ext) : Math.max(c0.o, ext)) });
    }
    return out;
  }
  function liveGaps(gaps, daily, b, k, td) {
    return gaps.filter(function (g) {
      var dr = g.dr || 0;
      if (!dr) return true;
      var hit = function (x) { return dr > 0 ? x.l <= g.lo : x.h >= g.hi; };
      if (daily.some(function (x) { return x.t > g.ct && x.t < td && hit(x); })) return false;
      for (var i = 0; i <= k; i++) if (hit(b[i])) return false;
      return true;
    });
  }
  function nearTag(px, ivs, gaps, near) {
    var hit = function (lo, hi) { return px >= lo * (1 - near) && px <= hi * (1 + near); };
    var iv = ivs.filter(function (g) { return hit(g.lo, g.hi); }).map(function (g) { return "IV" + g.t + " " + g.lo.toFixed(2) + "–" + g.hi.toFixed(2); });
    var gp = gaps.filter(function (g) { return hit(g.lo, g.hi); }).map(function (g) { return g.lv + "缺口" + g.ct.slice(5) + " " + g.lo + "–" + g.hi; });
    return iv.concat(gp);
  }
  function simulate(b, atr, c, gaps, daily, td, live) {
    var rounds = [];
    var st = 0, lowSince = Infinity, hiDay = -Infinity, loDay = Infinity, sp = 0, sellT = "", sellK = 0, hiSince = 0;
    for (var k = 0; k < b.length; k++) {
      var x = b[k], t = hm(x.t), last = (!live && k === b.length - 1) || t >= "14:57";
      hiDay = Math.max(hiDay, x.h); loDay = Math.min(loDay, x.l);
      var rg = hiDay - loDay, px = x.c;
      if (st === 0) {
        lowSince = Math.min(lowSince, x.l);
        if (rounds.length >= c.maxRounds || t < "09:35" || t >= "14:50") continue;
        if (px - lowSince >= c.up * atr && rg > 0 && px >= loDay + (1 - c.zone) * rg) {
          st = 1; sp = px; sellT = t; sellK = k; hiSince = px;
        }
      } else {
        hiSince = Math.max(hiSince, x.h);
        var why = "";
        if (px >= sp + c.stopAtr * atr) why = "止损";
        else if (px <= hiSince * (1 - c.back)) why = "回落" + (c.back * 100) + "%";
        else if (rg > 0 && px <= loDay + c.zone * rg) why = "低位区";
        else if (last) why = "收盘";
        if (why) {
          rounds.push({ sellT: sellT, sp: sp, buyT: t, bp: px, why: why, hold: k - sellK, sk: sellK, bk: k });
          st = 0; lowSince = x.l;
        }
      }
      if (last && st === 1) { rounds.push({ sellT: sellT, sp: sp, buyT: t, bp: px, why: "收盘", hold: k - sellK, sk: sellK, bk: k }); st = 0; }
      if (last) break;
    }
    rounds.forEach(function (r) {
      r.sellNear = nearTag(r.sp, openIV(b, r.sk, r.sp), liveGaps(gaps, daily, b, r.sk, td), c.near);
      r.buyNear = nearTag(r.bp, openIV(b, r.bk, r.bp), liveGaps(gaps, daily, b, r.bk, td), c.near);
    });
    rounds.end = { st: st, sp: sp, sellT: sellT, hiSince: hiSince, lowSince: lowSince, hiDay: hiDay, loDay: loDay }; /* App 加: 只给卡面显示"现在等什么", 不影响成交 */
    return rounds;
  }
  function control(b, rounds, seed) {
    var g = rng(seed), out = [], n = b.length;
    rounds.forEach(function (r) {
      for (var i = 0; i < 50; i++) {
        var s = 5 + Math.floor(g() * Math.max(1, n - 6 - r.hold)), e = Math.min(n - 1, s + r.hold);
        if (out.some(function (o) { return !(e < o.sk || s > o.bk); })) continue;
        out.push({ sellT: hm(b[s].t), sp: b[s].c, buyT: hm(b[e].t), bp: b[e].c, sk: s, bk: e });
        break;
      }
    });
    return out;
  }
  function net(rs, sh, cost) { return +rs.reduce(function (a, r) { return a + (r.sp - r.bp) * sh - cost * (r.sp + r.bp) * sh; }, 0).toFixed(2); }
  function idealNet(b, sh, c) {
    var th = 0.015, piv = [], dir = 0, H = b[0], Lo = b[0];
    for (var i = 1; i < b.length; i++) {
      var x = b[i];
      if (dir >= 0 && x.h > H.h) H = x;
      if (dir <= 0 && x.l < Lo.l) Lo = x;
      if (dir >= 0 && x.l <= H.h * (1 - th) && H !== x) { piv.push({ k: "H", p: H.h }); dir = -1; Lo = x; }
      else if (dir <= 0 && x.h >= Lo.l * (1 + th) && Lo !== x) { piv.push({ k: "L", p: Lo.l }); dir = 1; H = x; }
    }
    var legs = [];
    for (var j = 0; j + 1 < piv.length; j++) if (piv[j].k === "H" && piv[j + 1].k === "L") legs.push((piv[j].p - piv[j + 1].p) * sh - c.cost * (piv[j].p + piv[j + 1].p) * sh);
    legs.sort(function (a, z) { return z - a; });
    return +legs.slice(0, c.maxRounds).reduce(function (a, v) { return a + v; }, 0).toFixed(2);
  }
  /* ===== 以上与影子版相同 ===== */

  function pad(n) { return ("0" + n).slice(-2); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function d10(t) { var s = String(t).replace(/\D/g, ""); return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8); }
  function f2(v) { return v >= 100 ? v.toFixed(2) : v >= 10 ? v.toFixed(2) : v.toFixed(3); }
  function money(v) { return (v >= 0 ? "+" : "") + v.toFixed(0) + "元"; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(L) {
    try {
      var cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
      Object.keys(L).forEach(function (k) { if (String(L[k].tradeDate) < cut) delete L[k]; });
      localStorage.setItem(KEY, JSON.stringify(L));
    } catch (e) { }
  }
  function gapsOf(code, td) {
    var out = [];
    try {
      var lim = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), log = JSON.parse(localStorage.getItem("jl_gaplog_v1") || "{}") || {};
      Object.keys(log).forEach(function (k) {
        var g = log[k];
        if (g && g.c === code && (g.lv === "日" || g.lv === "开") && !g.ft && String(g.ct) >= lim && g.lo > 0 && (g.hi - g.lo) / g.lo >= 0.01) out.push({ lv: g.lv, dr: g.dr, lo: g.lo, hi: g.hi, ct: String(g.ct).slice(0, 10) });
      });
    } catch (e) { }
    return out.filter(function (g) { return g.ct < td; });
  }
  function holdCodes() {
    try { return (window.jlResoCodesJL ? window.jlResoCodesJL() : []).filter(function (x) { return x.code && !/^s[hz]000/.test(x.code); }); } catch (e) { return []; }
  }

  /* 算一只票今天: 只用已走完的1分K */
  function calc(code, name, td) {
    var c = DEF, rows = window.jlM1RowsJL ? window.jlM1RowsJL(code) : [], now = nowHM(), closed = now >= "15:01";
    var b = rows.filter(function (x) { return d10(x.t) === td && (closed || hm(x.t) < now); })
      .map(function (x) { return { t: x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c }; })
      .filter(function (x) { return x.o > 0 && x.h > 0 && x.l > 0 && x.c > 0; });
    var inp = window.jlResoInputJL ? window.jlResoInputJL(code) : null;
    var daily = ((inp && inp.bars) || []).map(function (x) { return { t: d10(x.t), o: +x.o, h: +x.h, l: +x.l, c: +x.c }; }).filter(function (x) { return x.t < td; });
    var qty = window.jlHoldQtyJL ? Number(window.jlHoldQtyJL(code)) || 0 : 0;
    var sh = Math.floor(qty * c.frac / c.lot) * c.lot, atr = atr5(daily);
    var r = { code: code, name: name, tradeDate: td, sh: sh, qty: qty, atr: +atr.toFixed(4), bars: b.length, lastT: b.length ? hm(b[b.length - 1].t) : "", final: 0 };
    if (!sh) { r.none = qty > 0 ? "持仓不足一手可动(25%不够100股)" : "没有持仓"; return r; }
    if (!(atr > 0)) { r.none = "日K不够算ATR5"; return r; }
    if (b.length < 10) { r.none = b.length ? "分时才走了" + b.length + "分钟" : "等今天的分时数据"; return r; }
    var gaps = gapsOf(code, td), full = closed && r.lastT >= "15:00";
    var rs = simulate(b, atr, c, gaps, daily, td, !full);
    r.rounds = rs.map(function (x) { return { sellT: x.sellT, sp: x.sp, buyT: x.buyT, bp: x.bp, why: x.why, hold: x.hold, sk: x.sk, bk: x.bk, sellNear: x.sellNear, buyNear: x.buyNear }; });
    r.end = rs.end;
    r.px = b[b.length - 1].c;
    r.ctrl = control(b, r.rounds, td + code + "m");
    r.net = net(r.rounds, sh, c.cost); r.cnet = net(r.ctrl, sh, c.cost); r.ideal = idealNet(b, sh, c);
    var k = b.length - 1, ivs = openIV(b, k, r.px), lg = liveGaps(gaps, daily, b, k, td);
    r.zones = ivs.map(function (g) { return { tag: "IV" + g.t, lo: g.lo, hi: g.hi }; }).concat(lg.map(function (g) { return { tag: g.lv + "缺口" + g.ct.slice(5), lo: g.lo, hi: g.hi }; }));
    r.final = full ? 1 : 0;
    return r;
  }
  function updateAll() {
    var L = load(), td = today();
    holdCodes().forEach(function (x) {
      var k = x.code + "|" + td;
      if (L[k] && L[k].final) return;
      try { if (window.jlEnsureM1JL && !(window.jlM1RowsJL(x.code) || []).length) window.jlEnsureM1JL(x.code); } catch (e) { }
      var r = calc(x.code, x.name, td);
      if (r.none && L[k] && !L[k].none) return; /* 数据一时拿不到, 保留上次算出的 */
      L[k] = r;
    });
    save(L);
    return L;
  }

  function activeCode() {
    try { var sm = document.querySelector("#deck .stock.active .rail small"); return sm ? String(sm.textContent).split(" ")[0] : ""; } catch (e) { return ""; }
  }
  function tag(arr, label) { return arr && arr.length ? ' <span class="tiTagJL">' + label + arr[0] + (arr.length > 1 ? " 等" + arr.length + "处" : "") + "</span>" : ""; }
  function nearest(r) {
    var up = null, dn = null, px = r.px;
    (r.zones || []).forEach(function (z) {
      if (z.lo > px) { if (!up || z.lo < up.lo) up = z; }
      else if (z.hi < px) { if (!dn || z.hi > dn.hi) dn = z; }
      else { up = dn = z; }
    });
    function s(z, side) {
      if (!z) return side + "：无";
      if (z.lo <= px && z.hi >= px) return "现价在 " + z.tag + " " + f2(z.lo) + "–" + f2(z.hi) + " 里";
      var e = side === "上方" ? z.lo : z.hi;
      return side + "：" + z.tag + " " + f2(z.lo) + "–" + f2(z.hi) + "（" + ((e / px - 1) * 100 >= 0 ? "+" : "") + ((e / px - 1) * 100).toFixed(1) + "%）";
    }
    if (up && up === dn) return s(up);
    return s(up, "上方") + "　" + s(dn, "下方");
  }
  function statusHTML(r) {
    var c = DEF, e = r.end, now = r.lastT, n = r.rounds.length, rg = e.hiDay - e.loDay;
    if (r.final) return '<div class="tiStJL">今天已收盘定稿 · ' + n + " 轮</div>";
    if (e.st === 1) {
      var back = e.hiSince * (1 - c.back), low = e.loDay + c.zone * rg, stop = e.sp + c.stopAtr * r.atr, line = Math.max(back, low);
      return '<div class="tiStJL sold">已卖出 ' + f2(e.sp) + " @" + e.sellT + " · 等接回</div>" +
        '<div class="tiLnJL">跌到 <b>' + f2(line) + "</b> 接回（" + (back >= low ? "卖出后最高 " + f2(e.hiSince) + " 回落1.5%" : "当日区间下30%") + "）　涨到 <b>" + f2(stop) + "</b> 止损接回　14:57 前一定接回</div>";
    }
    if (n >= c.maxRounds) return '<div class="tiStJL">今天 ' + c.maxRounds + " 轮已满，不再卖</div>";
    if (now >= "14:50") return '<div class="tiStJL">14:50 以后不再开新的一轮</div>';
    if (now < "09:35") return '<div class="tiStJL">09:35 以后才开始判断</div>';
    var need1 = e.lowSince + c.up * r.atr, need2 = e.loDay + (1 - c.zone) * rg, trig = Math.max(need1, need2);
    return '<div class="tiStJL wait">等待卖出 · 现价 ' + f2(r.px) + "</div>" +
      '<div class="tiLnJL">涨到 <b>' + f2(trig) + "</b> 左右卖：要比" + (n ? "上次接回后" : "开盘后") + "最低 " + f2(e.lowSince) + " 高出 0.4×ATR5=" + f2(c.up * r.atr) + "（" + f2(need1) + "），且在当日区间上30%（" + f2(need2) + "）；区间变了这个价会跟着变</div>";
  }
  function stats(L) {
    var s = { days: 0, rounds: 0, net: 0, cnet: 0, ideal: 0, nearS: 0, nearB: 0 };
    Object.keys(L).forEach(function (k) {
      var r = L[k];
      if (!r.final || !r.rounds) return;
      s.days++; s.rounds += r.rounds.length; s.net += r.net; s.cnet += r.cnet; s.ideal += r.ideal;
      r.rounds.forEach(function (x) { if (x.sellNear && x.sellNear.length) s.nearS++; if (x.buyNear && x.buyNear.length) s.nearB++; });
    });
    return s;
  }
  var CSS = "#tintraJL{margin:10px 0}#tintraJL h3{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px;font-size:15px}#tintraJL h3 small{font-size:11px;opacity:.8;font-weight:600}" +
    "#tintraJL .tiStJL{font:800 15px -apple-system,'PingFang SC',sans-serif;color:#fff;margin:2px 0 4px}#tintraJL .tiStJL.sold{color:#ffd84a}#tintraJL .tiStJL.wait{color:#81e6d9}" +
    "#tintraJL .tiLnJL{font-size:12px;line-height:1.7;color:#eef9fc}#tintraJL .tiLnJL b{color:#fff;font-size:13px}#tintraJL .tiRowJL{font-size:12px;line-height:1.8;color:#eef9fc;border-top:1px dashed #81e6d92e;padding-top:4px;margin-top:4px}" +
    "#tintraJL .tiTagJL{display:inline-block;font-size:10.5px;font-weight:700;color:#1a0508;background:#81e6d9;border-radius:6px;padding:0 5px;margin-left:3px}#tintraJL .up{color:#ff5459}#tintraJL .dn{color:#1fdc93}#tintraJL .tiDimJL{font-size:11px;color:#eef9fc;opacity:.8;line-height:1.7}";
  function render() {
    try {
      var dw = document.querySelector("#holds .deckWrap");
      if (!dw) return;
      if (!document.getElementById("tintraCssJL")) { var st = document.createElement("style"); st.id = "tintraCssJL"; st.textContent = CSS; document.head.appendChild(st); }
      var card = document.getElementById("tintraJL");
      if (!card) { card = document.createElement("section"); card.className = "glass"; card.id = "tintraJL"; dw.parentNode.insertBefore(card, dw.nextSibling); }
      var L = updateAll(), code = activeCode(), td = today(), r = L[code + "|" + td];
      var nm = r ? r.name : "", h = "";
      if (!r) h = '<div class="tiDimJL">这只不在持仓里，或还没拿到数据</div>';
      else if (r.none) h = '<div class="tiStJL">' + r.none + "</div>";
      else {
        h = statusHTML(r) + '<div class="tiLnJL">未补IV/缺口　' + nearest(r) + "</div>";
        var rows = r.rounds.map(function (x, i) {
          var p = (x.sp - x.bp) * r.sh - DEF.cost * (x.sp + x.bp) * r.sh;
          return '<div class="tiRowJL">第' + (i + 1) + "轮　卖 <b>" + f2(x.sp) + "</b> " + x.sellT + tag(x.sellNear, "贴") + "　→ 接 <b>" + f2(x.bp) + "</b> " + x.buyT + tag(x.buyNear, "贴") + "<br>" + x.why + "接回 · 拿出 " + x.hold + " 分钟 · <b class=\"" + (p >= 0 ? "up" : "dn") + "\">" + money(p) + "</b>（扣费, 相对一直拿着）</div>";
        });
        if (e1(r)) rows.push('<div class="tiRowJL">第' + (r.rounds.length + 1) + "轮　卖 <b>" + f2(r.end.sp) + "</b> " + r.end.sellT + "　→ 还没接回</div>");
        h += rows.join("") + (r.rounds.length ? '<div class="tiDimJL">今天合计 ' + money(r.net) + " · 随机挑时间做同样轮数 " + money(r.cnet) + " · 事后看最好能做到 " + money(r.ideal) + "</div>" : "");
      }
      var s = stats(L);
      var hist = s.days ? "已定稿 " + s.days + " 只·天，" + s.rounds + " 轮：合计 " + money(s.net) + " vs 随机 " + money(s.cnet) + " · 卖点贴IV/缺口 " + s.nearS + " 次 · 接回贴IV/缺口 " + s.nearB + " 次" : "还没有收盘定稿的记录（今天收盘后第一条）";
      card.innerHTML = "<h3>盘中做T · 分时高低点" + (nm ? "　" + nm : "") + "<small>只记账不下单</small></h3>" + h +
        '<div class="tiDimJL" style="margin-top:6px">' + hist + "<br>每天最多3轮 · 每轮动持仓25%" + (r && r.sh ? "（" + r.sh + "股）" : "") + " · ATR5 " + (r && r.atr ? f2(r.atr) : "—") + " · 用走完的1分K" + (r && r.lastT ? "到 " + r.lastT : "") + " · 贴=成交价离未补IV/缺口0.3%内(只记录不影响买卖)</div>";
    } catch (e) { }
  }
  function e1(r) { return r.end && r.end.st === 1 && !r.final; }
  setTimeout(render, 4000); setTimeout(render, 9000); setInterval(render, 30000);
  document.addEventListener("click", function (ev) { try { if (ev.target.closest && ev.target.closest("#deck .rail, #htabsDeckJL button, #htabs5dJL button")) setTimeout(render, 300); } catch (e) { } }, true);
  window.JLTIntra = { render: render, updateAll: updateAll, calc: calc, _t: { simulate: simulate, openIV: openIV, liveGaps: liveGaps, nearTag: nearTag, control: control, net: net, idealNet: idealNet, atr5: atr5, DEF: DEF } };
})();
