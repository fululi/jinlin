/* jl_tintra.js v3 (2026-10-30, 本地稿未推送) —— 盘中做T · 分时高低点(含IV缺口核对), 只记账不下单
 * 规则与影子第三版 ~/jl_shadow/multi.js 一字不差(simulate/openIV/liveGaps/nearTag/control/idealNet 原样搬), 周一影子结算可直接对账:
 *   1分K逐根, 每根走完才判断, 按该根收盘价成交(不偷看)
 *   卖(持仓满时): 09:35 后、14:50 前; 从"上次接回(或开盘)以来最低价"反弹 ≥ 0.4×ATR5, 且现价在当日已走区间的上 30%
 *   接回(已卖时): 从卖出后最高价回落 ≥ 1.5% / 或跌回当日区间下 30% / 或涨过 卖价+0.5×ATR5(止损) / 14:57 起强制接回
 *   每天最多3轮, 每轮 持仓×25% 取整到手(自设股数优先, 不超过持仓); 费用=佣金万2.5(最低5元)+过户费0.001%两边+印花税0.05%卖出;
 *   对照=同轮数同持有分钟, 卖出时刻在 09:35~14:50 内随机、接回不晚于 14:57
 *   IV核对只记录不参与决策: 成交价离未回补的1分钟IV(跳空>0.05%且影线重叠, 补=碰前收)或日线/开盘缺口 ≤0.3% → 记"贴IV/贴缺口"
 * 和影子版唯一差别: 盘中数据最后一根不当收盘(影子只在收盘后算整天, 结果相同); 正在走的那根1分K不用。
 * 数据: window.jlM1RowsJL(code)=1分K拷贝 / jlResoInputJL(code).bars=日K / jlHoldQtyJL / localStorage jl_gaplog_v1; 零新增请求(只调原 ensureM1JL, 它自带60秒节流)
 * v2: 卡片只留 卖/接 价·股数·每轮差价·今天合计(小字全删); 右下浮球=最该看的那只(先等接回的, 再离卖点最近的), 离价0.4%内闪, 点了跳到卡片
 * v3(用户10-30): 要实时+看得到依据 → 加小分时图(高低点/段幅/IV带/卖接点/下一步价位线)+依据两行+今天波段+最近未补IV; 报价10秒一看, 到价浮球变红震动(成交仍按该分钟收盘记); 股数每只可设(兆易默认100)
 * 10-30b: 浮球到价时的实时价记进 hits(每轮卖/接各第一次), 卡上和分钟收盘价记账并排, 另给"按提醒价算"合计
 * 存储: jl_tintra_log_v1 (code|日期 一条, 收盘后定稿不再改)。回滚: 删 index.html 里本文件的 script 引用 + 两行 window.jlM1RowsJL/jlEnsureM1JL。 */
(function () {
  "use strict";
  var KEY = "jl_tintra_log_v1", KEEP_DAYS = 60;
  var DEF = { up: 0.4, back: 0.015, zone: 0.3, stopAtr: 0.5, maxRounds: 3, frac: 0.25, lot: 100, comm: 0.00025, commMin: 5, stamp: 0.0005, xfer: 0.00001, near: 0.003 };

  /* ===== 以下与 ~/jl_shadow/multi.js 相同 ===== */
  /* 费用(10-30改): 佣金万2.5每笔最低5元 + 过户费十万分之一(两边) + 印花税万5(只卖出收) */
  function fee(amt, sell, c) { return Math.max(c.commMin, amt * c.comm) + amt * c.xfer + (sell ? amt * c.stamp : 0); }
  function rtFee(sp, bp, sh, c) { return fee(sp * sh, true, c) + fee(bp * sh, false, c); }
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
    rounds.end = { st: st, sp: sp, sellT: sellT, sellK: sellK, hiSince: hiSince, lowSince: lowSince, hiDay: hiDay, loDay: loDay }; /* App 加: 只给卡面显示"现在等什么", 不影响成交 */
    return rounds;
  }
  function control(b, rounds, seed) {
    /* 对照守同样时间规则(10-30改): 卖出只在 09:35~14:50 之前, 接回不晚于 14:57 那根(不进尾盘集合竞价) */
    var g = rng(seed), out = [], S = [], eMax = -1;
    b.forEach(function (x, i) { var t = hm(x.t); if (t <= "14:57") eMax = i; if (t >= "09:35" && t < "14:50") S.push(i); });
    rounds.forEach(function (r) {
      var cand = S.filter(function (s) { return s + r.hold <= eMax; });
      if (!cand.length) return;
      for (var i = 0; i < 50; i++) {
        var s = cand[Math.floor(g() * cand.length)], e = s + r.hold;
        if (out.some(function (o) { return !(e < o.sk || s > o.bk); })) continue;
        out.push({ sellT: hm(b[s].t), sp: b[s].c, buyT: hm(b[e].t), bp: b[e].c, sk: s, bk: e });
        break;
      }
    });
    return out;
  }
  function net(rs, sh, c) { return +rs.reduce(function (a, r) { return a + (r.sp - r.bp) * sh - rtFee(r.sp, r.bp, sh, c); }, 0).toFixed(2); }
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
    for (var j = 0; j + 1 < piv.length; j++) if (piv[j].k === "H" && piv[j + 1].k === "L") legs.push((piv[j].p - piv[j + 1].p) * sh - rtFee(piv[j].p, piv[j + 1].p, sh, c));
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
  var QK = "jl_tintra_qty_v1", LIVE = {};
  /* 做T股数: 自己设的优先; 没设=持仓25%取整到手(不足一手但有一手以上=一手); 用户10-30口述兆易持有100股 → 默认100 */
  function qtyCfg() { try { return JSON.parse(localStorage.getItem(QK) || "null") || { "603986": 100 }; } catch (e) { return {}; } }
  function shOf(code, qty) {
    var q = qtyCfg()[code], cap = Math.floor(qty / DEF.lot) * DEF.lot; /* 10-30: 自设股数也不超过现有持仓 */
    if (q != null && q !== "") return Math.max(0, Math.min(cap, Math.floor(Number(q) / DEF.lot) * DEF.lot));
    var sh = Math.floor(qty * DEF.frac / DEF.lot) * DEF.lot;
    return sh || (qty >= DEF.lot ? DEF.lot : 0);
  }
  function calc(code, name, td) {
    var c = DEF, rows = window.jlM1RowsJL ? window.jlM1RowsJL(code) : [], now = nowHM(), closed = now >= "15:01";
    var b = rows.filter(function (x) { return d10(x.t) === td && (closed || hm(x.t) < now); })
      .map(function (x) { return { t: x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c }; })
      .filter(function (x) { return x.o > 0 && x.h > 0 && x.l > 0 && x.c > 0; });
    var inp = window.jlResoInputJL ? window.jlResoInputJL(code) : null;
    var daily = ((inp && inp.bars) || []).map(function (x) { return { t: d10(x.t), o: +x.o, h: +x.h, l: +x.l, c: +x.c }; }).filter(function (x) { return x.t < td; });
    var qty = window.jlHoldQtyJL ? Number(window.jlHoldQtyJL(code)) || 0 : 0;
    var sh = shOf(code, qty), atr = atr5(daily);
    var r = { code: code, name: name, tradeDate: td, sh: sh, qty: qty, atr: +atr.toFixed(4), bars: b.length, lastT: b.length ? hm(b[b.length - 1].t) : "", final: 0 };
    r.cur = inp && Number(inp.prev) > 0 && Number(inp.cur) > 0 ? Number(inp.cur) : 0; /* 实时报价(只认今天的报价), 只用来提示到价, 不进成交 */
    if (!sh) { r.none = qty < DEF.lot ? "持仓不足一手" : "没设做T股数"; return r; }
    if (!(atr > 0)) { r.none = "日K不够算ATR5"; return r; }
    if (b.length < 10) { r.none = b.length ? "分时才走了" + b.length + "分钟" : "等今天的分时数据"; return r; }
    var gaps = gapsOf(code, td), full = closed && r.lastT >= "15:00";
    var rs = simulate(b, atr, c, gaps, daily, td, !full);
    r.rounds = rs.map(function (x) { return { sellT: x.sellT, sp: x.sp, buyT: x.buyT, bp: x.bp, why: x.why, hold: x.hold, sk: x.sk, bk: x.bk, sellNear: x.sellNear, buyNear: x.buyNear }; });
    r.end = rs.end;
    r.px = b[b.length - 1].c;
    var nm0 = +now.slice(0, 2) * 60 + +now.slice(3), lm0 = +r.lastT.slice(0, 2) * 60 + +r.lastT.slice(3);
    if (!closed && nm0 - lm0 > 3 && !(lm0 >= 690 && nm0 < 781)) r.cur = 0; /* 1分K落后现在3分钟以上(午休除外) → 报价和K线对不上, 不拿报价判到价 */
    r.ctrl = control(b, r.rounds, td + code + "m");
    r.net = net(r.rounds, sh, c); r.cnet = net(r.ctrl, sh, c); r.ideal = idealNet(b, sh, c);
    var k = b.length - 1, ivs = openIV(b, k, r.px), lg = liveGaps(gaps, daily, b, k, td);
    r.zones = ivs.map(function (g) { return { tag: "IV" + g.t, lo: g.lo, hi: g.hi }; }).concat(lg.map(function (g) { return { tag: g.lv + "缺口" + g.ct.slice(5), lo: g.lo, hi: g.hi }; }));
    r.final = full ? 1 : 0;
    LIVE[code] = { b: b, ivs: ivs, td: td }; /* 只放内存给小分时图用, 不写存储 */
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
      /* 10-30: 浮球到价那一刻的实时价记下来(每轮卖/接各记第一次), 和按分钟收盘价记的账并排显示 */
      r.hits = (L[k] && L[k].hits) || {};
      var a = nextAct(r);
      if (a.hit && !r.final) { var hk = (a.k === "sell" ? "s" : "b") + r.rounds.length; if (!r.hits[hk]) r.hits[hk] = { t: nowHM(), px: a.cur, line: +a.price.toFixed(3) }; }
      L[k] = r;
    });
    save(L);
    return L;
  }

  function activeCode() {
    try { var sm = document.querySelector("#deck .stock.active .rail small"); return sm ? String(sm.textContent).split(" ")[0] : ""; } catch (e) { return ""; }
  }
  /* 现在等什么 + 依据: 卡片和浮球共用 */
  function nextAct(r) {
    var c = DEF;
    if (!r || r.none || !r.end) return { k: "off", txt: r && r.none ? r.none : "等数据" };
    var e = r.end, n = r.rounds.length, rg = e.hiDay - e.loDay, now = r.lastT, cur = r.cur || r.px;
    if (r.final) return { k: "off", txt: "已收盘" };
    if (e.st === 1) {
      var back = e.hiSince * (1 - c.back), low = e.loDay + c.zone * rg, stop = e.sp + c.stopAtr * r.atr, line = Math.max(back, low);
      return { k: "buy", price: line, stop: stop, sp: e.sp, sellT: e.sellT, sh: r.sh, txt: "等接回", cur: cur,
        hit: cur > 0 && (cur <= line || cur >= stop) ? (cur >= stop ? "到止损" : "到接回价") : "",
        why: back >= low ? "卖出后最高 " + f2(e.hiSince) + " 回落1.5% → " + f2(back) : "跌回当日区间下30% → " + f2(low),
        why2: "涨到 " + f2(stop) + " 止损接回 · 14:57 前一定接回" };
    }
    if (n >= c.maxRounds) return { k: "off", txt: "今天3轮已满" };
    if (now >= "14:50") return { k: "off", txt: "14:50后不开新轮" };
    if (now < "09:35") return { k: "off", txt: "09:35开始" };
    var n1 = e.lowSince + c.up * r.atr, n2 = e.loDay + (1 - c.zone) * rg, trig = Math.max(n1, n2);
    return { k: "sell", price: trig, sh: r.sh, txt: "等卖出", cur: cur, hit: cur > 0 && cur >= trig ? "到卖出价" : "",
      why: (n ? "上次接回后" : "开盘后") + "最低 " + f2(e.lowSince) + " 反弹 0.4×ATR5(" + f2(c.up * r.atr) + ") → " + f2(n1),
      why2: "且站上当日区间上30% → " + f2(n2) };
  }
  function pnl(r, x) { return (x.sp - x.bp) * r.sh - rtFee(x.sp, x.bp, r.sh, DEF); }
  function pct(a, b) { var v = (a / b - 1) * 100; return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }
  /* 分时高低点: 和"事后最好"同一把 1.5% 尺子, 反向走够1.5%才确认(不偷看) */
  function swings(b) {
    var th = 0.015, piv = [], dir = 0, H = b[0], Lo = b[0], Hi = 0, Li = 0;
    for (var i = 1; i < b.length; i++) {
      var x = b[i];
      if (dir >= 0 && x.h > H.h) { H = x; Hi = i; }
      if (dir <= 0 && x.l < Lo.l) { Lo = x; Li = i; }
      if (dir >= 0 && x.l <= H.h * (1 - th) && H !== x) { piv.push({ k: "H", p: H.h, i: Hi, t: hm(H.t) }); dir = -1; Lo = x; Li = i; }
      else if (dir <= 0 && x.h >= Lo.l * (1 + th) && Lo !== x) { piv.push({ k: "L", p: Lo.l, i: Li, t: hm(Lo.t) }); dir = 1; H = x; Hi = i; }
    }
    return piv;
  }
  var CSS = "#tintraJL{margin:10px 0;padding:12px 13px}#tintraJL .tiHdJL{display:flex;align-items:center;gap:7px;margin-bottom:8px}#tintraJL .tiHdJL b{font-size:16px;color:#fff}#tintraJL .tiHdJL span{font-size:15px;color:#fff;font-weight:700}" +
    "#tintraJL .tiPillJL{margin-left:auto;font:800 12px -apple-system,'PingFang SC',sans-serif;border-radius:10px;padding:2px 9px;color:#1a0508;background:#81e6d9}#tintraJL .tiPillJL.buy{background:#ffd84a}#tintraJL .tiPillJL.off{background:rgba(255,255,255,.18);color:#fff}#tintraJL .tiPillJL.hit{background:#ff5459;color:#fff;animation:tiBlinkJL 1s steps(2) infinite}@keyframes tiBlinkJL{50%{opacity:.45}}" +
    "#tintraJL .tiBigJL{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;font:800 15px -apple-system,'PingFang SC',sans-serif;color:#fff;margin:0 0 4px}#tintraJL .tiBigJL em{font-style:normal;font:800 30px ui-monospace,Menlo,monospace}#tintraJL .tiBigJL .sell{color:#ff5459}#tintraJL .tiBigJL .buy{color:#1fdc93}" +
    "#tintraJL .tiBigJL small{font-size:13.5px;font-weight:700;color:#fff}#tintraJL .tiBigJL button{margin-left:auto;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:11px;padding:2px 9px;font:700 12.5px -apple-system,sans-serif}" +
    "#tintraJL .tiWhyJL{font:600 13px/1.65 -apple-system,'PingFang SC',sans-serif;color:#fff;margin:0 0 6px}#tintraJL .tiWhyJL b{font-family:ui-monospace,Menlo,monospace}" +
    "#tintraJL canvas{display:block;width:100%;height:132px;margin:4px 0 6px}#tintraJL .tiSecJL{font:800 12.5px -apple-system,'PingFang SC',sans-serif;color:#81e6d9;margin:8px 0 3px}" +
    "#tintraJL .tiChipsJL{display:flex;flex-wrap:wrap;gap:5px}#tintraJL .tiChipsJL span{font:700 12.5px ui-monospace,Menlo,monospace;color:#fff;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.22);border-radius:9px;padding:2px 7px}#tintraJL .tiChipsJL span.iv{border-color:#81e6d9aa;background:rgba(129,230,217,.14)}" +
    "#tintraJL .tiRdJL{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.12);font:700 14px ui-monospace,Menlo,monospace;color:#fff}#tintraJL .tiRdJL span small{font:600 12px -apple-system,sans-serif;margin-left:4px}" +
    "#tintraJL .tiRdJL i{font-style:normal;font:800 12px -apple-system,sans-serif;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}" +
    "#tintraJL .tiRdJL u{text-decoration:none;font:800 10.5px -apple-system,sans-serif;color:#1a0508;background:#81e6d9;border-radius:5px;padding:0 4px;margin-left:4px;vertical-align:2px}" +
    "#tintraJL .up{color:#ff5459}#tintraJL .dn{color:#1fdc93}#tintraJL .tiSumJL{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(255,255,255,.25);padding-top:8px;margin-top:2px;font:800 14px -apple-system,'PingFang SC',sans-serif;color:#fff}#tintraJL .tiSumJL b{font:800 20px ui-monospace,Menlo,monospace}" +
    "#tintraBallJL{position:fixed;right:10px;bottom:150px;z-index:56;width:62px;height:62px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;" +
    "background:radial-gradient(circle at 35% 30%,#2a3a52,#0c1524 70%);border:2px solid #81e6d9;box-shadow:0 4px 16px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25);color:#fff;font-family:-apple-system,'PingFang SC',sans-serif}" +
    "#tintraBallJL.buy{border-color:#ffd84a}#tintraBallJL[hidden]{display:none}" +
    "#tintraBallJL s{text-decoration:none;font:800 10px/1 -apple-system,sans-serif}#tintraBallJL b{font:800 14px/1.15 ui-monospace,Menlo,monospace;margin:2px 0 1px}#tintraBallJL.sell b{color:#ff7a80}#tintraBallJL.buy b{color:#3ff0a8}" +
    "#tintraBallJL small{font:700 9px/1 -apple-system,sans-serif;max-width:56px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
    "#tintraBallJL.near{animation:tiPulseJL 1.2s ease-in-out infinite}#tintraBallJL.hit{background:radial-gradient(circle at 35% 30%,#ff6b70,#8a1018 75%);border-color:#fff;animation:tiPulseJL .8s ease-in-out infinite}#tintraBallJL.hit b{color:#fff}" +
    "@keyframes tiPulseJL{0%,100%{box-shadow:0 4px 16px rgba(0,0,0,.45),0 0 0 0 rgba(255,216,74,.7)}50%{box-shadow:0 4px 16px rgba(0,0,0,.45),0 0 0 10px rgba(255,216,74,0)}}";
  /* 小分时图: 价格线 + 未补IV带 + 分时高低点(标跌/涨幅) + 每轮卖▼接▲ + 下一步价位虚线 */
  function drawMini(cv, r, a) {
    var L0 = LIVE[r.code]; if (!L0 || !L0.b.length) return;
    var b = L0.b, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, Hh = 132;
    cv.width = W * dpr; cv.height = Hh * dpr;
    var x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, Hh);
    var hi = -Infinity, lo = Infinity;
    b.forEach(function (k) { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); });
    if (a && a.price) { hi = Math.max(hi, a.price); lo = Math.min(lo, a.price); }
    var pad = (hi - lo) * 0.08 || hi * 0.002; hi += pad; lo -= pad;
    var N = 241, X = function (i) { return 4 + (W - 8) * i / (N - 1); }, Y = function (p) { return 14 + (Hh - 28) * (hi - p) / (hi - lo); };
    (L0.ivs || []).forEach(function (g) { x.fillStyle = "rgba(129,230,217,.16)"; var y1 = Y(g.hi), y2 = Y(g.lo); x.fillRect(4, y1, W - 8, Math.max(1.5, y2 - y1)); });
    x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1; x.beginPath(); x.moveTo(X(120), 8); x.lineTo(X(120), Hh - 8); x.stroke();
    x.strokeStyle = "#fff"; x.lineWidth = 1.3; x.beginPath();
    b.forEach(function (k, i) { if (i) x.lineTo(X(i), Y(k.c)); else x.moveTo(X(i), Y(k.c)); }); x.stroke();
    x.font = "700 10.5px ui-monospace,Menlo,monospace"; x.textAlign = "center";
    var pv = swings(b);
    pv.forEach(function (p, j) {
      var px = X(p.i), py = Y(p.p), prev = pv[j - 1], lab = f2(p.p) + (prev ? " " + pct(p.p, prev.p) : "");
      x.fillStyle = p.k === "H" ? "#ff5459" : "#1fdc93"; x.beginPath(); x.arc(px, py, 2.6, 0, 7); x.fill();
      x.fillStyle = "#fff"; var tw = x.measureText(lab).width, lx = Math.max(4 + tw / 2, Math.min(W - 4 - tw / 2, px));
      x.fillText(lab, lx, p.k === "H" ? py - 5 : py + 13);
    });
    (r.rounds || []).forEach(function (q) {
      x.fillStyle = "#ff5459"; tri(x, X(q.sk), Y(q.sp) - 3, -1);
      x.fillStyle = "#1fdc93"; tri(x, X(q.bk), Y(q.bp) + 3, 1);
    });
    if (r.end && r.end.st === 1 && !r.final) { x.fillStyle = "#ff5459"; tri(x, X(r.end.sellK), Y(r.end.sp) - 3, -1); } /* 已卖还没接 */
    if (a && a.price) {
      x.setLineDash([4, 3]); x.strokeStyle = a.k === "sell" ? "#ff7a80" : "#3ff0a8"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(4, Y(a.price)); x.lineTo(W - 4, Y(a.price)); x.stroke(); x.setLineDash([]);
      x.textAlign = "right"; x.fillStyle = a.k === "sell" ? "#ff7a80" : "#3ff0a8"; x.fillText((a.k === "sell" ? "卖 " : "接 ") + f2(a.price), W - 6, Y(a.price) - 3);
    }
  }
  function tri(x, cx, cy, d) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - 4.5, cy + 7 * d); x.lineTo(cx + 4.5, cy + 7 * d); x.closePath(); x.fill(); }
  function cardHTML(r, a) {
    var h = '<div class="tiHdJL"><b>盘中做T</b><span>' + (r ? r.name : "") + '</span><i class="tiPillJL ' + (a.hit ? "hit" : a.k) + '">' + (a.hit || a.txt) + "</i></div>";
    var edit = r ? '<button type="button" data-tiq="' + r.code + '">' + (r.sh ? r.sh + "股 ✎" : "设股数") + "</button>" : "";
    if (a.k === "sell") h += '<div class="tiBigJL">卖 <em class="sell">' + f2(a.price) + "</em><small>现价 " + f2(a.cur) + " · 差 " + pct(a.price, a.cur) + "</small>" + edit + "</div>";
    else if (a.k === "buy") h += '<div class="tiBigJL">接 <em class="buy">' + f2(a.price) + "</em><small>已卖 " + f2(a.sp) + " " + a.sellT + " · 现价 " + f2(a.cur) + "</small>" + edit + "</div>";
    else h += '<div class="tiBigJL"><small style="font-size:16px">' + a.txt + "</small>" + edit + "</div>";
    if (a.why) h += '<div class="tiWhyJL">' + a.why + "<br>" + a.why2 + "</div>";
    if (r && LIVE[r.code]) {
      h += "<canvas></canvas>";
      var pv = swings(LIVE[r.code].b), sw = [];
      for (var j = 1; j < pv.length; j++) sw.push("<span>" + pv[j - 1].t + (pv[j - 1].k === "H" ? "高" : "低") + "→" + pv[j].t + (pv[j].k === "H" ? "高 " : "低 ") + pct(pv[j].p, pv[j - 1].p) + "</span>");
      if (sw.length) h += '<div class="tiSecJL">今天分时高低点（来回超1.5%才算一段）</div><div class="tiChipsJL">' + sw.join("") + "</div>";
      var px = r.cur || r.px, up = null, dn = null;
      (r.zones || []).forEach(function (z) { if (z.lo > px) { if (!up || z.lo < up.lo) up = z; } else if (z.hi < px) { if (!dn || z.hi > dn.hi) dn = z; } else up = dn = z; });
      var zs = [];
      if (up) zs.push('<span class="iv">' + (up === dn ? "在 " : "上 ") + up.tag + " " + f2(up.lo) + "–" + f2(up.hi) + (up === dn ? "" : " " + pct(up.lo, px)) + "</span>");
      if (dn && dn !== up) zs.push('<span class="iv">下 ' + dn.tag + " " + f2(dn.lo) + "–" + f2(dn.hi) + " " + pct(dn.hi, px) + "</span>");
      if (zs.length) h += '<div class="tiSecJL">未补IV/缺口（离现价最近）</div><div class="tiChipsJL">' + zs.join("") + "</div>";
    }
    if (r && r.rounds && r.rounds.length) {
      h += '<div class="tiSecJL">今天做了 ' + r.rounds.length + " 轮 · 每轮 " + r.sh + "股</div>";
      var H = r.hits || {}, anyHit = 0, hitNet = 0;
      r.rounds.forEach(function (q, i) {
        var p = pnl(r, q), iv = (q.sellNear && q.sellNear.length) || (q.buyNear && q.buyNear.length), hs = H["s" + i], hb = H["b" + i];
        var al = hs || hb ? '<br><small style="margin-left:0">提醒价 ' + (hs ? f2(hs.px) + " " + hs.t : "—") + " → " + (hb ? f2(hb.px) + " " + hb.t : "—") + "</small>" : "";
        if (hs || hb) anyHit = 1;
        hitNet += pnl(r, { sp: hs ? hs.px : q.sp, bp: hb ? hb.px : q.bp });
        h += '<div class="tiRdJL"><i>' + (i + 1) + "</i><span>" + f2(q.sp) + "<small>" + q.sellT + "</small> → " + f2(q.bp) + "<small>" + q.buyT + " " + q.why + "</small>" + (iv ? "<u>贴IV</u>" : "") + al + '</span><span class="' + (p >= 0 ? "up" : "dn") + '">' + money(p) + "</span></div>";
      });
      h += '<div class="tiSumJL"><span>今天差价（已扣费·按分钟收盘价记）</span><b class="' + (r.net >= 0 ? "up" : "dn") + '">' + money(r.net) + "</b></div>";
      if (anyHit) h += '<div class="tiSumJL" style="border-top:0;padding-top:2px"><span>按浮球提醒那一刻的价算</span><b class="' + (hitNet >= 0 ? "up" : "dn") + '">' + money(hitNet) + "</b></div>";
    }
    return h;
  }
  /* 浮球挑哪只: 先挑已到价的, 再挑"等接回"的(手里少了股要接), 再挑离卖点最近的 */
  function pickBall(L, td) {
    var best = null, bd = Infinity;
    holdCodes().forEach(function (x) {
      var r = L[x.code + "|" + td], a = nextAct(r);
      if (a.k === "off") return;
      var d = Math.abs(a.price / (a.cur || r.px) - 1), sc = (a.hit ? -2 : a.k === "buy" ? -1 : 0) + d;
      if (sc < bd) { bd = sc; best = { r: r, a: a, d: d }; }
    });
    return best;
  }
  var lastHit = {};
  function ballRender(L, td) {
    var el = document.getElementById("tintraBallJL");
    if (!el) {
      el = document.createElement("div"); el.id = "tintraBallJL"; el.setAttribute("role", "button"); el.setAttribute("aria-label", "盘中做T");
      try { var ps = JSON.parse(localStorage.getItem("jl_tintra_ball_v1") || "null"); if (ps) { el.style.left = ps.x + "px"; el.style.top = ps.y + "px"; el.style.right = "auto"; el.style.bottom = "auto"; } } catch (eP) { }
      var drag = null, moved = false; /* 按住拖动换位置(位置记在本机), 轻点=跳到卡片 */
      el.addEventListener("pointerdown", function (ev) { var r0 = el.getBoundingClientRect(); drag = { dx: ev.clientX - r0.left, dy: ev.clientY - r0.top, x0: ev.clientX, y0: ev.clientY }; moved = false; try { el.setPointerCapture(ev.pointerId); } catch (eC) { } ev.stopPropagation(); });
      el.addEventListener("pointermove", function (ev) {
        if (!drag) return;
        if (!moved && Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) < 8) return;
        moved = true;
        var nx = Math.max(4, Math.min(innerWidth - el.offsetWidth - 4, ev.clientX - drag.dx)), ny = Math.max(60, Math.min(innerHeight - el.offsetHeight - 70, ev.clientY - drag.dy));
        el.style.left = nx + "px"; el.style.top = ny + "px"; el.style.right = "auto"; el.style.bottom = "auto";
      });
      el.addEventListener("pointerup", function (ev) { if (drag && moved) { try { localStorage.setItem("jl_tintra_ball_v1", JSON.stringify({ x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) })); } catch (eS) { } } drag = null; ev.stopPropagation(); });
      el.onclick = function () {
        if (moved) { moved = false; return; }
        try {
          var code = el.dataset.code, tab = [].slice.call(document.querySelectorAll("#deck .rail")).find(function (rr) { var sm = rr.querySelector("small"); return sm && String(sm.textContent).indexOf(code) === 0; });
          var nav = [].slice.call(document.querySelectorAll("nav *, .tabbar *, button")).find(function (e2) { return e2.textContent.trim() === "持仓"; });
          if (nav) nav.click();
          setTimeout(function () { if (tab && tab.getAttribute("aria-expanded") !== "true") tab.click(); setTimeout(function () { render(); var c = document.getElementById("tintraJL"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 350); }, 120);
        } catch (e3) { }
      };
      document.body.appendChild(el);
    }
    var t = nowHM(), b = pickBall(L, td);
    if (!b || t < "09:30" || t >= "15:01") { el.hidden = true; return; }
    el.hidden = false;
    el.className = b.a.k + (b.a.hit ? " hit" : b.d < 0.004 ? " near" : "");
    el.dataset.code = b.r.code;
    el.innerHTML = "<s>" + (b.a.hit || (b.a.k === "buy" ? "等接回" : "等卖出")) + "</s><b>" + f2(b.a.price) + "</b><small>" + b.r.name.slice(0, 4) + "</small>";
    var hk = b.r.code + b.a.k + Math.round(b.a.price * 100);
    if (b.a.hit && !lastHit[hk]) { lastHit[hk] = 1; try { navigator.vibrate && navigator.vibrate([180, 80, 180]); } catch (eV) { } } /* 到价震一下(每个价位一次) */
  }
  function render() {
    try {
      var L = updateAll(), td = today();
      ballRender(L, td);
      var dw = document.querySelector("#holds .deckWrap");
      if (!dw) return;
      var card = document.getElementById("tintraJL");
      if (!card) {
        card = document.createElement("section"); card.className = "glass"; card.id = "tintraJL"; dw.parentNode.insertBefore(card, dw.nextSibling);
        card.addEventListener("click", function (ev) {
          var bt = ev.target.closest && ev.target.closest("[data-tiq]"); if (!bt) return;
          var code = bt.getAttribute("data-tiq"), cfg = qtyCfg(), v = window.prompt("每轮做T多少股（100的整数倍，0=不做）", cfg[code] != null ? cfg[code] : "");
          if (v == null) return;
          if (String(v).trim() === "") delete cfg[code]; else cfg[code] = Math.max(0, Math.floor(Number(v) / 100) * 100) || 0;
          try { localStorage.setItem(QK, JSON.stringify(cfg)); var LL = load(); delete LL[code + "|" + today()]; save(LL); } catch (eQ) { }
          render();
        });
      }
      var r = L[activeCode() + "|" + td], a = nextAct(r);
      card.innerHTML = cardHTML(r, a);
      var cv = card.querySelector("canvas"); if (cv && r) drawMini(cv, r, a.k === "off" ? null : a);
    } catch (e) { }
  }
  try { var st0 = document.createElement("style"); st0.id = "tintraCssJL"; st0.textContent = CSS; (document.head || document.documentElement).appendChild(st0); } catch (e) { }
  setTimeout(render, 4000); setTimeout(render, 9000); setInterval(render, 10000); /* 10秒看一次报价提示到价; 1分K由原 ensureM1JL 每60秒更新 */
  document.addEventListener("click", function (ev) { try { if (ev.target.closest && ev.target.closest("#deck .rail, #htabsDeckJL button, #htabs5dJL button")) setTimeout(render, 300); } catch (e) { } }, true);
  window.JLTIntra = { render: render, updateAll: updateAll, calc: calc, _t: { simulate: simulate, openIV: openIV, liveGaps: liveGaps, nearTag: nearTag, control: control, net: net, idealNet: idealNet, atr5: atr5, rtFee: rtFee, shOf: shOf, DEF: DEF } };
})();
