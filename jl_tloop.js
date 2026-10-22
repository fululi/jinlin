/* jl-1143 做T闭环决策卡 tloop v2 (2026-10-23, 独立文件·零侵入·localStorage/DOM只读·自有键)
 * 定位: 闭环规则引擎 v1 —— "先卖还是持有"由风险证据评分决定(非单一跌幅), "何时买回"由回补条件清单决定。
 * 数据通道(主脚本IIFE封装, 一律不碰其函数/内存):
 *   持仓=portfolio_v2.holds | 选中股=#holdingName DOM | 现价=持仓卡DOM hero价, 兜底 jl_dk_<code> 末根收盘(标"收")
 *   温度=jinlin_mtemp_v1.data.t | 板块=__JL_CONCEPTS__[code].l1 → jl_sector_ff_v1[板块].amt
 *   个股主力=jl_ff_v1[code].rows 末行 m 及连续方向 | 档位=jinlin_tier_memo_v1 直读 | 台账=tlog_v2 配对
 * 输出: 持仓详情底部一张决策卡 + 五快照时点(09:26/09:35/09:55/10:00/14:45, 与 jl_open_snap v5 对齐)证据落盘 jl_tloop_log_v1。
 * 边界(2026-10-23 房主定): 本规则组是【未经验证的假设】, 卡面明示"规则未验证·证据积累中";
 *   档位是可达性地图不是扳机; 本卡零网络、不写任何非自有键、不改任何算法。
 * 回滚=删 index.html 中本行 script 标签 + 删 jl_tloop_log_v1 键, 无其它残留。 */
(function () {
  "use strict";
  var LOGK = "jl_tloop_log_v1";
  var RULES = { cold: 35, hot: 65, deepLoss: -10, sellScore: 3 }; /* 冷/热温度线, 深套线(%), 先卖所需证据分 */
  var SNAP_WINS = [["09:26", "09:28"], ["09:35", "09:37"], ["09:55", "09:57"], ["10:00", "10:02"], ["14:45", "14:47"]];

  function $(s, r) { return (r || document).querySelector(s); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
  function readJ(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function todayStr() { try { return new Date().toLocaleDateString("sv-SE"); } catch (e) { return ""; } }
  function nowHM() { var d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function bare(code) { return String(code || "").replace(/^(sh|sz)/, ""); }

  /* —— 持仓与选中股 —— */
  /* jl-1143c: 持仓源修正——主程序真实持仓在 jinlin_stocks_v2(qty>0), portfolio_v2 仅为旧成本回退键, 先主后备 */
  function holds() {
    var s2 = readJ("jinlin_stocks_v2");
    if (Array.isArray(s2)) {
      var h = s2.filter(function (x) { return x && Number(x.qty) > 0; });
      if (h.length) return h;
    }
    var pf = readJ("portfolio_v2"); return pf && Array.isArray(pf.holds) ? pf.holds : [];
  }
  function curStock() {
    var list = holds(); if (!list.length) return null;
    var nm = (($("#holdingName") || {}).textContent || "").replace(/\s+/g, "");
    if (nm) for (var i = 0; i < list.length; i++) if (String(list[i].name || "").replace(/\s+/g, "") === nm) return list[i];
    for (i = 0; i < list.length; i++) if (Number(list[i].qty) > 0) return list[i];
    return list[0];
  }

  /* —— 价格: DOM hero(持仓卡激活页) → jl_dk_ 末根收盘 —— */
  function priceOf(code) {
    try {
      var act = $("article.stock.active .dqHeroJL b") || $(".dqHeroJL b");
      if (act) { var v = num(String(act.textContent).replace(/,/g, "")); if (v > 0) return { p: v, src: "live" }; }
    } catch (e) {}
    try {
      var dk = readJ("jl_dk_" + bare(code));
      var a = dk && (Array.isArray(dk) ? dk : dk.v);
      if (a && a.length) {
        var lb = a[a.length - 1], pb = a.length > 1 ? a[a.length - 2] : null;
        return { p: +lb[2] || null, pc: pb ? +pb[2] : null, o: +lb[1] || null, src: "close", asOf: String(lb[0] || "").slice(0, 10) };
      }
    } catch (e) {}
    return { p: null, pc: null, o: null, src: "none" };
  }

  /* —— 温度 / 板块 / 个股资金 / 档位 / 台账 —— */
  function tempOf() {
    var c = readJ("jinlin_mtemp_v1");
    var t = c && c.data && num(c.data.t);
    return { t: t, at: c && c.at || 0 };
  }
  function sectorOf(st) {
    var sec = null;
    try { var cm = window.__JL_CONCEPTS__; var rec = cm && cm[bare(st.code)]; if (rec) sec = rec.l1 || null; } catch (e) {}
    if (!sec && st.industry) sec = st.industry;
    if (!sec) return { sec: null, amt: null, d: null };
    var sf = readJ("jl_sector_ff_v1") || {};
    var r = sf[sec];
    if (r && num(r.amt) != null) return { sec: sec, amt: num(r.amt), d: r.d || null };
    for (var k in sf) if (k.indexOf(sec) >= 0 || sec.indexOf(k) >= 0) { r = sf[k]; if (r && num(r.amt) != null) return { sec: k, amt: num(r.amt), d: r.d || null }; }
    return { sec: sec, amt: null, d: null };
  }
  function ffOf(code) {
    /* jl-1143d: 行结构对齐真实写入方 jl_ff_v1[code].rows=[{t,main(元),sup}] (旧读 .m/.d 恒空) */
    var c = readJ("jl_ff_v1"); c = c && c[bare(code)];
    var rows = c && c.rows;
    if (!rows || !rows.length) return { m: null, streak: 0, d: null };
    var last = rows[rows.length - 1], m = num(last.main != null ? last.main : last.m), sgn = m == null ? 0 : (m > 0 ? 1 : m < 0 ? -1 : 0), stk = 0;
    for (var i = rows.length - 1; i >= 0; i--) { var v = num(rows[i].main != null ? rows[i].main : rows[i].m); if (v == null || (v > 0 ? 1 : v < 0 ? -1 : 0) !== sgn) break; stk++; }
    return { m: m, streak: sgn * stk, d: last.t || last.d || null };
  }
  function tierOf(code) {
    var all = readJ("jinlin_tier_memo_v1") || {};
    var r = all[bare(code)] && all[bare(code)].r;
    if (r && r.sells && r.sells.length) return { s1: num(r.sells[0]), b1: num(r.buys && r.buys[0]), dk: all[bare(code)].dk || all.d || null };
    return { s1: null, b1: null, dk: null };
  }
  function lastOpenSell(code) { /* tlog_v2 最近一笔未配对卖出; 结构对不上即降级 null */
    try {
      var t = readJ("tlog_v2"); if (!Array.isArray(t)) return null;
      var sells = [], buys = 0;
      for (var i = 0; i < t.length; i++) {
        var r = t[i] || {};
        if (bare(r.code) !== bare(code)) continue;
        /* jl-1143d: 真实行 {code,d,t,sell,buy}(画线标记同口径); 兼容旧 {side,price} 结构 */
        if (r.sell != null) { sells.push({ price: num(r.sell), d: r.d || null, t: r.t || null }); continue; }
        if (r.buy != null) { buys++; continue; }
        var side = String(r.side || r.dir || r.type || "");
        if (/卖|sell/i.test(side) || /^S/i.test(side)) sells.push(r);
        else if (/买|buy/i.test(side) || /^B/i.test(side)) buys++;
      }
      if (sells.length > buys) { var s = sells[sells.length - 1]; return { price: num(s.price || s.p), d: s.d || s.t || null }; }
    } catch (e) {}
    return null;
  }

  /* —— 规则引擎(全部规则在此, 无隐藏分支) —— */
  function evaluate(st) {
    var pr = priceOf(st.code), tp = tempOf(), sc = sectorOf(st), ff = ffOf(st.code), tr = tierOf(st.code);
    var p = pr.p, pc = pr.pc, pnl = (p > 0 && num(st.cost) > 0) ? (p / num(st.cost) - 1) * 100 : null;
    var ev = [], score = 0;
    function E(ok, label) { ev.push({ ok: ok, label: label }); if (ok === true) score += 1; }
    E(tp.t == null ? null : tp.t <= RULES.cold, "大盘温度 " + (tp.t == null ? "暂缺" : Math.round(tp.t) + (tp.t <= RULES.cold ? " ≤" + RULES.cold + " 冷·证据+1" : tp.t >= RULES.hot ? " ≥" + RULES.hot + " 热·反向-1" : " 中性")));
    if (tp.t != null && tp.t >= RULES.hot) score -= 1;
    E(sc.amt == null ? null : sc.amt < 0, "板块资金 " + (sc.sec || "未知") + (sc.amt == null ? " 暂缺" : sc.amt < 0 ? " 净流出·证据+1" : " 净流入"));
    E(ff.m == null ? null : ff.m < 0, "个股主力 " + (ff.m == null ? "暂缺" : ff.m < 0 ? "净流出" + (ff.streak <= -2 ? "·连出" + -ff.streak + "日·证据+2" : "·证据+1") : "净流入"));
    if (ff.streak <= -2) score += 1;
    E(tr.b1 == null || p == null ? null : p < tr.b1, tr.b1 == null ? "档位 缺(无地图)" : p < tr.b1 ? "价格已破B1(" + tr.b1 + ")·证据+1" : "价格在B1(" + tr.b1 + ")上方");
    E(pr.o == null || pc == null || p == null ? null : (pr.o > pc && p < pr.o), "高开低走 " + (pr.o != null && pc != null && pr.o > pc && p != null && p < pr.o ? "成立·证据+1" : "不成立/无法判"));
    var note = "";
    if (pnl != null && pnl <= RULES.deepLoss) { score -= 1; note = "深套" + pnl.toFixed(1) + "%·卖出实亏意义降级, 以回补位管理为主"; }
    var verdict = tr.s1 == null ? "无档位·不参与闭环" : score >= RULES.sellScore ? "先卖 · S1(" + tr.s1 + ")附近挂出" : score === RULES.sellScore - 1 ? "减仓观察" : "持有";
    var os = lastOpenSell(st.code);
    var ck = [
      { ok: tr.b1 == null || p == null ? null : p <= tr.b1, label: "回到B1(" + (tr.b1 == null ? "缺" : tr.b1) + ")及以下" },
      { ok: tp.t == null ? null : tp.t > RULES.cold, label: "大盘温度回到" + RULES.cold + "以上" },
      { ok: sc.amt == null ? null : sc.amt >= 0, label: "板块资金转正" },
      { ok: ff.m == null ? null : ff.m >= 0, label: "个股主力净额转正" },
      { ok: os == null || os.price == null || p == null ? null : p < os.price, label: os && os.price != null ? "低于卖出价(" + os.price + ")才接回" : "无未配对卖出·此项不适用" }
    ];
    return { pr: pr, tp: tp, sc: sc, ff: ff, tr: tr, pnl: pnl, ev: ev, score: score, note: note, verdict: verdict, ck: ck, p: p };
  }

  /* —— 证据落盘(五窗, 每窗每票每日一条, 上限2000) —— */
  function winOfNow() {
    var hm = nowHM();
    for (var i = 0; i < SNAP_WINS.length; i++) if (hm >= SNAP_WINS[i][0] && hm <= SNAP_WINS[i][1]) return SNAP_WINS[i][0];
    return null;
  }
  function logIfWindow(st, r) {
    var w = winOfNow(); if (!w) return;
    var td = todayStr(); if (!td) return;
    try {
      var log = readJ(LOGK) || [];
      for (var i = 0; i < log.length; i++) if (log[i].d === td && log[i].w === w && log[i].code === bare(st.code)) return;
      log.push({ d: td, w: w, code: bare(st.code), p: r.p, temp: r.tp.t, sec: r.sc.sec, secAmt: r.sc.amt, ffM: r.ff.m, ffStreak: r.ff.streak, s1: r.tr.s1, b1: r.tr.b1, score: r.score, verdict: r.verdict, pnl: r.pnl });
      while (log.length > 2000) log.shift();
      localStorage.setItem(LOGK, JSON.stringify(log));
    } catch (e) {}
  }

  /* —— 渲染 —— */
  function mark(ok) { return ok === true ? '<b style="color:#ff6b6b">●</b>' : ok === false ? '<b style="color:#eef9fc">○</b>' : '<b style="color:#eef9fc">?</b>'; }
  function markCk(ok) { return ok === true ? '<b style="color:#1fdc93">✓</b>' : ok === false ? '<b style="color:#eef9fc">✗</b>' : '<b style="color:#eef9fc">?</b>'; }
  function render() {
    var host = $("#detail > div");
    if (!host) return;
    var card = $("section#tloopCardJL");
    if (!card) {
      card = document.createElement("section");
      card.className = "glass"; card.id = "tloopCardJL";
      card.style.cssText = "margin-top:10px";
      host.appendChild(card);
    }
    var st = curStock();
    if (!st) { card.innerHTML = '<h3>做T闭环 <small>portfolio_v2 无持仓记录</small></h3>'; return; }
    var r = evaluate(st);
    logIfWindow(st, r);
    var vCol = r.verdict.indexOf("先卖") === 0 ? "#ff6b6b" : r.verdict.indexOf("持有") === 0 ? "#1fdc93" : "#e8c36a";
    card.innerHTML = '<h3>做T闭环 <small>' + (st.name || st.code) + " · 规则未验证·证据积累中</small></h3>" +
      '<div style="font-size:13px;margin:4px 0 8px"><b style="color:' + vCol + '">' + r.verdict + "</b>" +
      '<small style="color:#eef9fc">　证据分 ' + r.score + "/" + RULES.sellScore + (r.pnl != null ? " · 浮动盈亏 " + (r.pnl >= 0 ? "+" : "") + r.pnl.toFixed(1) + "%" : "") + "</small></div>" +
      '<div style="font-size:11.5px;line-height:1.9;color:#eef9fc">' +
      r.ev.map(function (e) { return mark(e.ok) + " " + e.label; }).join("<br>") +
      (r.note ? '<br><span style="color:#e8c36a">⚠ ' + r.note + "</span>" : "") +
      '</div><div style="font-size:11.5px;line-height:1.9;color:#eef9fc;margin-top:6px;border-top:1px solid #81e6d922;padding-top:6px"><b style="color:#81e6d9">回补条件(全部满足才接回):</b><br>' +
      r.ck.map(function (c) { return markCk(c.ok) + " " + c.label; }).join("<br>") + "</div>" +
      '<div style="font-size:10px;color:#eef9fc;margin-top:6px">' + nowHM() + " · 价源:" + (r.pr.src === "live" ? "实时" : r.pr.src === "close" ? "最近收盘" + (r.pr.asOf || "") : "缺") + " · 全缓存直读零网络 · 档位为地图非扳机</div>";
  }

  var timer = null;
  function boot() {
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(render, 30000);
    window.addEventListener("hashchange", function () { setTimeout(render, 400); });
    document.addEventListener("click", function (e) { /* 切换持仓/展开详情后重评 */
      var t = e.target;
    if (t && (t.closest && (t.closest("[data-detail]") || t.closest("[data-stock]") || t.closest(".rail")))) setTimeout(render, 500);
    });
    /* jl-1143b: 主程序重渲 #detail 会整体重写 innerHTML 把本卡抹掉——用 MutationObserver 盯宿主子树,
       卡不见了立即补挂(300ms 防抖), 不再傻等 30s 轮询或被点击事件碰巧触发 */
    var _moT = null;
    try {
      var host0 = $("#detail > div");
      if (host0 && window.MutationObserver) {
        new MutationObserver(function () {
          if ($("section#tloopCardJL")) return;
          if (_moT) return;
          _moT = setTimeout(function () { _moT = null; render(); }, 300);
        }).observe(host0, { childList: true, subtree: false });
      }
    } catch (eMO) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 1500); });
  else setTimeout(boot, 1500);
  window.tloopEvalJL = function (code) { /* 控制台自检: tloopEvalJL("600105") */
    var list = holds();
    for (var i = 0; i < list.length; i++) if (bare(list[i].code) === bare(code)) return evaluate(list[i]);
    return null;
  };
})();
