/* jl_ledger.js v1 (2026-11-13) —— 信号台账: 作战屏每弹一次提醒自动记 时间·价格·信号, 之后按当天1分钟价补「30分内先走0.8%算对 / 30分后 / 收盘」.
   另存每天1分钟主力净额(东财 f52 当日累计), 攒样本测资金掉头.
   存 IndexedDB(库 jl_ledger_v1, 和 localStorage 分开, 不会挤爆首页缓存); 台账留 400 天、资金留 160 天, 超了自动删最旧.
   只记录, 不碰买卖算法和提醒本身. 作战屏(jl_zp_war.html)写, 复盘页(jl_amp_review.html)「台账」页签读. */
(function () {
  "use strict";
  if (window.JLLedger) return;
  var DBN = "jl_ledger_v1", TH = 0.008, WIN = 30, KEEP_SIG = 400, KEEP_FF = 160, dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      try {
        var q = indexedDB.open(DBN, 1);
        q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains("sig")) d.createObjectStore("sig", { keyPath: "id" }); if (!d.objectStoreNames.contains("ff")) d.createObjectStore("ff", { keyPath: "id" }); };
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      } catch (e) { rej(e); }
    });
    return dbP;
  }
  function tx(st, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(st, mode), s = t.objectStore(st), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
  function all(st) { return db().then(function (d) { return new Promise(function (res) { var o = [], c = d.transaction(st).objectStore(st).openCursor(); c.onsuccess = function () { var r = c.result; if (r) { o.push(r.value); r.continue(); } else res(o); }; c.onerror = function () { res(o); }; }); }); }
  function hm4(h) { return String(h).replace(/\D/g, "").padStart(4, "0").slice(-4); }
  function mins(h) { h = hm4(h); return +h.slice(0, 2) * 60 + +h.slice(2); }
  function tmin(h) { var m = mins(h); return m >= 780 ? m - 90 : m; }   /* 交易分钟(午休压掉), 30分钟窗口跨午休照算 */
  /* 方向: 卖/向下类 -1, 买/向上类 +1, 其它 0(只记不判对错) */
  function dirOf(lbl, txt) {
    var s = (lbl || "") + " " + (txt || "");
    if (/卖|下穿|到顶|跌破|流出|掉头↓|高抛|▼|转弱|冲高回落/.test(s)) return -1;
    if (/买|接|上穿|见底|突破|流入|掉头↑|低吸|▲|转强|探底回升/.test(s)) return 1;
    return 0;
  }
  /* 归类: 台账「成绩」按这个分组 */
  function kindOf(lbl, txt) {
    var s = (lbl || "") + " " + (txt || "");
    if (/RSO/.test(s)) return /上穿/.test(s) ? "RSO 上穿" : /下穿/.test(s) ? "RSO 下穿" : "RSO";
    if (/共振/.test(s)) return /到顶|▼/.test(s) ? "共振到顶▼" : /见底|▲/.test(s) ? "共振见底▲" : /上穿/.test(s) ? "共振 M1上穿" : /下穿/.test(s) ? "共振 M1下穿" : "共振紫";
    if (/意愿/.test(s)) return /↓|转弱|下/.test(s) ? "意愿掉头↓" : "意愿掉头↑";
    if (/画线/.test(lbl || "")) return /跌破/.test(s) ? "画线 跌破" : "画线 上穿";
    if (lbl === "卖" || lbl === "买") return (/[①②③]/.test(txt || "") ? "尺子 " : "小球 ") + (lbl === "卖" ? "卖" : "接");
    return (lbl || "其它") + (dirOf(lbl, txt) < 0 ? "↓" : dirOf(lbl, txt) > 0 ? "↑" : "");
  }
  var seen = {};
  function add(o) {   /* o={code,name,date(YYYYMMDD),hm,lbl,txt,p} */
    try {
      if (!o || !o.code || !o.date || !(o.p > 0)) return;
      var h = hm4(o.hm), id = o.code + "|" + o.date + "|" + h + "|" + (o.lbl || "") + "|" + (o.txt || "");
      if (seen[id]) return; seen[id] = 1;
      var r = { id: id, code: o.code, name: o.name || "", date: o.date, hm: h, lbl: o.lbl || "", txt: o.txt || "", p: +o.p, dir: dirOf(o.lbl, o.txt), kind: kindOf(o.lbl, o.txt), at: Date.now(), ok: null, r30: null, rc: null, done: 0 };
      tx("sig", "readwrite", function (s) { s.put(r); }).catch(function () { });
    } catch (e) { }
  }
  /* 用当天1分钟价 pts=[{hm,p}] 给当天记录补结果; fin=已收盘(补收盘涨跌并定稿) */
  function evalDay(code, date, pts, fin) {
    if (!code || !date || !pts || pts.length < 2) return Promise.resolve(0);
    var P = pts.filter(function (q) { return q && q.p > 0; }).map(function (q) { return { t: tmin(q.hm), p: +q.p }; }).filter(function (q) { return q.t >= 570 && q.t <= 810; });
    if (!P.length) return Promise.resolve(0);
    var lastT = P[P.length - 1].t, close = P[P.length - 1].p;
    return all("sig").then(function (L) {
      var ch = L.filter(function (r) { return r.code === code && r.date === date && !r.done; });
      ch.forEach(function (r) {
        var t0 = tmin(r.hm), up = 0, dn = 0, first = 0, at30 = null;
        P.forEach(function (q) {
          if (q.t <= t0 || q.t > t0 + WIN) return;
          var g = q.p / r.p - 1;
          if (!first) { if (g >= TH) first = 1; else if (g <= -TH) first = -1; }
          at30 = q.p;
        });
        if (lastT >= t0 + WIN || fin) {
          r.r30 = at30 != null ? at30 / r.p - 1 : null;
          r.ok = r.dir === 0 ? null : first === 0 ? 0 : first === r.dir ? 1 : -1;   /* 1 对 · -1 反向 · 0 30分钟内两边都没走够 */
        }
        if (fin) { r.rc = close / r.p - 1; r.done = 1; }
      });
      if (!ch.length) return 0;
      return tx("sig", "readwrite", function (s) { ch.forEach(function (r) { s.put(r); }); }).then(function () { return ch.length; });
    }).catch(function () { return 0; });
  }
  function saveFF(code, date, rows) {   /* rows=[{hm, main(当日累计元)}] */
    if (!code || !date || !rows || !rows.length) return;
    var v = rows.map(function (r) { return [hm4(r.hm), Math.round(+r.main || 0), Math.round(+r.x || 0), Math.round(+r.l || 0), Math.round(+r.m || 0), Math.round(+r.s || 0)]; });   /* [时刻, 主力, 超大, 大, 中, 小] */
    tx("ff", "readwrite", function (s) { s.put({ id: code + "|" + date, code: code, date: date, n: v.length, rows: v, at: Date.now() }); }).catch(function () { });
  }
  function prune() {
    Promise.all([all("sig"), all("ff")]).then(function (A) {
      var cut = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("sv-SE").replace(/-/g, ""); };
      var cs = cut(KEEP_SIG), cf = cut(KEEP_FF), ds = A[0].filter(function (r) { return r.date < cs; }), df = A[1].filter(function (r) { return r.date < cf; });
      if (ds.length) tx("sig", "readwrite", function (s) { ds.forEach(function (r) { s.delete(r.id); }); });
      if (df.length) tx("ff", "readwrite", function (s) { df.forEach(function (r) { s.delete(r.id); }); });
    }).catch(function () { });
  }
  setTimeout(prune, 20000);

  /* ===== 台账界面(复盘页用) ===== */
  var CSS = ".ldW{color:#fff;font-size:12px}.ldSeg{display:flex;border:1px solid #ffffff26;border-radius:9px;overflow:hidden;margin:0 0 8px}.ldSeg button{flex:1;background:transparent;border:0;color:#fff;font-size:11.5px;padding:5px}.ldSeg button.on{background:#81e6d933}" +
    ".ldT{width:100%;border-collapse:collapse;font-size:11px}.ldT th{font-weight:600;text-align:right;padding:4px 3px;border-bottom:1px solid #ffffff22;white-space:nowrap}.ldT th:first-child,.ldT td:first-child{text-align:left}" +
    ".ldT td{padding:6px 3px;border-bottom:1px solid #ffffff10;text-align:right;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}.ldT td:first-child{font-family:-apple-system,'PingFang SC'}.ldT tr.mu td{opacity:.5}" +
    ".ldB{display:inline-block;width:40px;height:6px;border-radius:3px;background:#ffffff1a;vertical-align:1px;margin-left:4px;overflow:hidden}.ldB i{display:block;height:100%}" +
    ".ldUp{color:#ff5459}.ldDn{color:#1fdc93}.ldPd{color:#ffd21f}.ldN{font-size:10.5px;margin-top:6px;line-height:1.6}";
  function pc(v) { return v == null ? "—" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"; }
  function cls(v) { return v == null ? "" : v >= 0 ? "ldUp" : "ldDn"; }
  function render(el, code, tab) {
    if (!el) return;
    if (!document.getElementById("ldCssJL")) { var c = document.createElement("style"); c.id = "ldCssJL"; c.textContent = CSS; document.head.appendChild(c); }
    tab = tab || "s";
    all("sig").then(function (L) {
      L = L.filter(function (r) { return !code || r.code === code; }).sort(function (a, b) { return a.date === b.date ? (a.hm < b.hm ? -1 : 1) : a.date < b.date ? -1 : 1; });
      var days = {}; L.forEach(function (r) { days[r.date] = 1; });
      var nd = Object.keys(days).length, td = new Date().toLocaleDateString("sv-SE").replace(/-/g, ""), lastD = Object.keys(days).sort().pop() || td;
      var h = '<div class="ldW"><div class="ldSeg">' + [["s", "成绩"], ["t", "今天"], ["a", "逐条"]].map(function (x) { return '<button data-ldt="' + x[0] + '"' + (tab === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>";
      if (!L.length) h += '<div class="ldN">还没有记录。作战屏开着、盘中有提醒弹出时会自动记。</div>';
      else if (tab === "s") {
        var G = {}; L.forEach(function (r) { var g = G[r.kind] || (G[r.kind] = { n: 0, ok: 0, j: 0, s30: 0, n30: 0, sc: 0, nc: 0, dir: r.dir }); g.n++; if (r.ok != null) { g.j++; if (r.ok === 1) g.ok++; } if (r.r30 != null) { g.s30 += r.r30; g.n30++; } if (r.rc != null) { g.sc += r.rc; g.nc++; } });
        var ks = Object.keys(G).sort(function (a, b) { return G[b].n - G[a].n; });
        h += '<table class="ldT"><tr><th>信号</th><th>次数</th><th>对了</th><th>30分后</th><th>收盘</th></tr>' + ks.map(function (k) {
          var g = G[k], rt = g.j ? g.ok / g.j : null, col = rt == null ? "#ffffff40" : rt >= 0.6 ? "#1fdc93" : rt >= 0.45 ? "#ffd21f" : "#ff5459", a30 = g.n30 ? g.s30 / g.n30 : null, ac = g.nc ? g.sc / g.nc : null;
          return '<tr' + (g.n < 10 ? ' class="mu"' : "") + "><td>" + k + "</td><td>" + g.n + "</td><td>" + (g.j ? g.ok + "/" + g.j + '<span class="ldB"><i style="width:' + Math.round(rt * 100) + "%;background:" + col + '"></i></span>' : "—") + '</td><td class="' + cls(a30) + '">' + pc(a30) + '</td><td class="' + cls(ac) + '">' + pc(ac) + "</td></tr>";
        }).join("") + "</table>";
        h += '<div class="ldN">共 ' + nd + " 天 · 对 = 30分钟内先往信号方向走 " + (TH * 100).toFixed(1) + "% · 不到10次的行灰着，样本少只看不信</div>";
      } else {
        var R = tab === "t" ? L.filter(function (r) { return r.date === lastD; }) : L.slice().reverse();
        h += '<table class="ldT"><tr><th>时间</th><th>信号</th><th>当时价</th><th>30分后</th><th>收盘</th></tr>' + R.slice(0, 300).map(function (r) {
          var m30 = r.r30 == null ? '<span class="ldPd">等</span>' : '<span class="' + cls(r.r30) + '">' + pc(r.r30) + "</span>" + (r.ok === 1 ? " ✓" : r.ok === -1 ? " ✗" : r.ok === 0 ? " ·" : "");
          var mc = r.rc == null ? '<span class="ldPd">' + (r.date === td ? "等收盘" : "无数据") + "</span>" : '<span class="' + cls(r.rc) + '">' + pc(r.rc) + "</span>";
          return "<tr><td>" + (tab === "a" ? r.date.slice(4, 6) + "-" + r.date.slice(6) + " " : "") + r.hm.slice(0, 2) + ":" + r.hm.slice(2) + "</td><td style=\"text-align:left;font-family:-apple-system\">" + r.kind + "</td><td>" + r.p.toFixed(2) + "</td><td>" + m30 + "</td><td>" + mc + "</td></tr>";
        }).join("") + "</table>";
        if (tab === "t") h += '<div class="ldN">' + lastD.slice(4, 6) + "-" + lastD.slice(6) + " · " + R.length + " 条 · ✓对 ✗反向 ·没走够</div>";
      }
      el.innerHTML = h + "</div>";
      Array.prototype.forEach.call(el.querySelectorAll("[data-ldt]"), function (b) { b.onclick = function () { render(el, code, b.getAttribute("data-ldt")); }; });
    }).catch(function () { el.innerHTML = '<div class="ldN">这个浏览器打不开本机台账(IndexedDB 不可用)</div>'; });
  }
  window.JLLedger = { add: add, evalDay: evalDay, saveFF: saveFF, render: render, all: function () { return all("sig"); }, ff: function () { return all("ff"); }, dirOf: dirOf, kindOf: kindOf };
})();
