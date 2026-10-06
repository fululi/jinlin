/* jlv2.js — jl-1053 v0.84.0 首页尾部三张折叠卡（独立模块，零侵入）
   ① 大资金 · 国家队：4只宽基ETF主力净额 + 市场结构判断（权重托底≠全面进攻）
   ② 市场温度 · v2：温度 + 冰点/冷点状态机（规则组判定，非阈值）+ 九因子 + 场景提示
   ③ 大盘异动 · 分组：事件流六组聚合（涨跌停结构/板块异动/个股扩散/风险事件/指数·量能二期）
   原则：现有模块一律不动；本模块自建抓取(JSONP)+自建缓存(jlv2_*)；卡样=透亮玻璃
   （底 ≤rgba(255,255,255,.04)、无深色渐变遮罩、无backdrop模糊、细青边#81e6d92e、文字亮白#eef9fc）
   阈值全部集中在 CFG，便于回测校准；仅为状态描述，不构成操作建议。 */
(function () {
  "use strict";
  if (window.__JLV2__) return;
  window.__JLV2__ = 1;

  var UT = "7eea3edcaed734bea9cbfc24409ed989";
  var CFG = {
    etfs: [["1.510300", "沪深300ETF", "510300"], ["1.510500", "中证500ETF", "510500"], ["1.512100", "中证1000ETF", "512100"], ["1.510880", "红利ETF", "510880"]],
    idx: [["1.000300", "沪深300"], ["1.000001", "上证指数"], ["0.399006", "创业板指"]],
    ice: { dtBig: 50, zbRate: 40, lb: 2, prem: -2 },        // 冰点规则组阈值
    coldT: 30,                                              // 温度低于此直接判冷点
    hot: { zt: 100, lb: 6, prem: 4 },                       // 高潮（对偶状态）
    bounce: { dtJump: 8, zbFail: 35 },                      // 温度快升但涨停扩散失败
    persistMin: 15,                                         // 异动持续性：N分钟无跟进→已衰竭
    refrLive: 60e3, refrEtf: 120e3
  };

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function today() { return new Date().toLocaleDateString("sv-SE"); }
  function ymd() { return today().replace(/-/g, ""); }
  function hhmm(v) { var s = String(v == null ? 0 : v).replace(/[^0-9]/g, ""); if (s.length > 4) s = s.slice(-4); while (s.length < 4) s = "0" + s; return s.slice(0, 2) + ":" + s.slice(2, 4); } /* 入参为HHMM(如1040/941) */
  function nowMin() { var d = new Date(); return d.getHours() * 100 + d.getMinutes(); }
  function mktLive() { var d = new Date(), w = d.getDay(), m = d.getHours() * 100 + d.getMinutes(); return w >= 1 && w <= 5 && m >= 915 && m <= 1505; }
  function fmtYi(v) { if (!isFinite(v)) return "—"; var a = v / 1e8; return (a >= 0 ? "+" : "") + a.toFixed(1) + "亿"; }
  function pct(v) { return isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) + "%" : "—"; }

  /* ---------- JSONP（自建，不碰 emJsonpJL） ---------- */
  var cbN = 0;
  function jsonp(hosts, path, cb, tmo) {
    var i = 0, done = false, mycb = "jlv2cb" + (++cbN), tm;
    function fin() { if (done) return; done = true; clearTimeout(tm); try { delete window[mycb]; } catch (e) { } }
    function tryHost() {
      if (done) return;
      if (i >= hosts.length) { fin(); cb(new Error("all-hosts-fail"), null); return; }
      var h = hosts[i++];
      var s = document.createElement("script");
      var sep = path.indexOf("?") >= 0 ? "&" : "?";
      s.src = h + path + sep + "cb=" + mycb + "&_=" + Date.now();
      tm = setTimeout(function () { s.remove(); tryHost(); }, tmo || 8000);
      window[mycb] = function (d) { fin(); s.remove(); cb(null, d); };
      s.onerror = function () { if (!done) { clearTimeout(tm); s.remove(); tryHost(); } };
      document.body.appendChild(s);
    }
    tryHost();
  }
  var P2 = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];
  var P2H = ["https://push2his.eastmoney.com", "https://push2delay.eastmoney.com"];
  var P2X = ["https://push2ex.eastmoney.com"];

  /* ---------- 样式（透亮玻璃，房主定稿口径） ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#jlv2root{margin-top:14px}" +
    ".jlv2{background:rgba(255,255,255,0.04);border:1px solid #81e6d92e;border-radius:18px;padding:15px;margin-top:14px;color:#eef9fc}" +
    "body.day .jlv2{background:rgba(0,0,0,0.03);border-color:#0a7d6b3d;color:#12262b}" +
    ".jlv2 h3{font-size:12px;font-weight:500;margin:0;display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer}" +
    ".jlv2 h3 small{font-size:9px;color:#8fa8b3;font-weight:400;text-align:right}" +
    ".jlv2 .jsum{font-size:10.5px;color:#eef9fc;margin-top:8px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}" +
    ".jlv2 .jsum .dot{width:7px;height:7px;border-radius:50%;flex:none;box-shadow:0 0 7px currentColor}" +
    ".jlv2 .jbody{display:none;margin-top:11px;border-top:1px solid #81e6d91c;padding-top:11px}" +
    ".jlv2.open .jbody{display:block}" +
    ".jlv2 .jchev{flex:none;width:17px;height:17px;border-radius:50%;border:1px solid #81e6d94d;color:#81e6d9;font-size:9px;display:flex;align-items:center;justify-content:center;transition:transform .18s}" +
    ".jlv2.open .jchev{transform:rotate(90deg)}" +
    ".jlv2 .jh{font-size:9px;color:#81e6d9;letter-spacing:.24em;margin:12px 0 7px;display:flex;align-items:center;gap:8px}" +
    ".jlv2 .jh::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#81e6d93d,transparent)}" +
    ".jlv2 .row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #81e6d914;font-size:10px}" +
    ".jlv2 .row:last-child{border-bottom:none}" +
    ".jlv2 .row small{color:#8fa8b3;font-size:8.5px}" +
    ".jlv2 .mono{font-family:ui-monospace,'SF Mono',monospace}" +
    ".up{color:#ff5459}.dn{color:#1fdc93}.mu{color:#c9dfe8}.hl{color:#ffd21f}" +
    /* 温度计v2 */
    ".jlv2 .tnow{display:flex;align-items:baseline;gap:9px}" +
    ".jlv2 .tnow b{font-size:26px;font-family:ui-monospace,monospace}" +
    ".jlv2 .zpill{font-size:11px;color:#81e6d9;border:1px solid #81e6d9;border-radius:9px;padding:2px 9px;font-weight:600}" +
    ".jlv2 .zpill.ice{color:#5ad0ff;border-color:#5ad0ff}.jlv2 .zpill.hot{color:#ff5459;border-color:#ff5459}" +
    ".jlv2 .fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}" +
    ".jlv2 .ft{border:1px solid #ffffff10;border-radius:10px;padding:7px 8px;background:rgba(255,255,255,0.02)}" +
    ".jlv2 .ft span{font-size:8.5px;color:#8fa8b3;display:block}" +
    ".jlv2 .ft b{font-size:13px;font-family:ui-monospace,monospace;display:block;margin-top:2px}" +
    ".jlv2 .ft small{font-size:7.5px;color:#7e8798;display:block;margin-top:2px;line-height:1.4}" +
    ".jlv2 .rule{display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #81e6d914;font-size:9.5px;line-height:1.6}" +
    ".jlv2 .rule:last-of-type{border-bottom:none}" +
    ".jlv2 .rst{flex:none;width:15px;height:15px;border-radius:50%;font-size:9px;display:flex;align-items:center;justify-content:center;margin-top:1px}" +
    ".jlv2 .rst.ok{color:#0a1a14;background:#1fdc93;font-weight:700}" +
    ".jlv2 .rst.no{color:#3a1c1e;background:rgba(255,255,255,0.08);border:1px solid #ffffff26}" +
    ".jlv2 .scn{border:1px solid #ffffff12;border-radius:11px;padding:8px 10px;margin-top:7px;font-size:9.5px;color:#8fa8b3;background:rgba(255,255,255,0.02)}" +
    ".jlv2 .scn b{color:#c9dfe8;display:block;font-size:10px;margin-bottom:2px;font-weight:600}" +
    ".jlv2 .scn.on{border-color:#81e6d98c;color:#eef9fc;background:#81e6d90d}" +
    ".jlv2 .scn.on b{color:#81e6d9}" +
    /* 国家队 */
    ".jlv2 .erow{display:grid;grid-template-columns:112px 1fr 58px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #81e6d914;font-size:10px}" +
    ".jlv2 .erow:last-of-type{border-bottom:none}" +
    ".jlv2 .erow .nm b{display:block;font-size:10.5px;font-weight:600}" +
    ".jlv2 .erow .nm small{color:#7e8798;font-size:8px;letter-spacing:.05em}" +
    ".jlv2 .ebar{position:relative;height:15px;border-radius:4px;background:rgba(255,255,255,0.03);overflow:hidden}" +
    ".jlv2 .ebar::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:#ffffff26}" +
    ".jlv2 .ebar i{position:absolute;top:2px;bottom:2px;border-radius:2px}" +
    ".jlv2 .ebar em{position:absolute;top:0;bottom:0;font-style:normal;font-size:9px;line-height:15px;font-family:ui-monospace,monospace;white-space:nowrap}" +
    ".jlv2 .bigState{font-size:17px;font-weight:600;color:#ffd21f;letter-spacing:.03em}" +
    ".jlv2 .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}" +
    ".jlv2 .chip{font-size:8.5px;border:1px solid #ffffff1f;border-radius:8px;padding:4px 8px;color:#8fa8b3}" +
    ".jlv2 .chip.on{border-color:#81e6d9;color:#81e6d9;background:#81e6d914;font-weight:600}" +
    /* 大盘异动 */
    ".jlv2 .grp{margin-top:4px}" +
    ".jlv2 .grpH{display:flex;justify-content:space-between;font-size:9.5px;color:#81e6d9;padding:6px 0;border-bottom:1px dashed #81e6d92e}" +
    ".jlv2 .grpH small{color:#7e8798}" +
    ".jlv2 .ev{display:grid;grid-template-columns:34px 1fr auto;gap:8px;padding:7px 0;border-bottom:1px solid #81e6d90f;font-size:9.5px;align-items:start}" +
    ".jlv2 .ev:last-child{border-bottom:none}" +
    ".jlv2 .ev .tm{font-family:ui-monospace,monospace;color:#8fa8b3;font-size:9px;padding-top:1px}" +
    ".jlv2 .ev .tt b{display:block;font-size:10px;font-weight:600}" +
    ".jlv2 .ev .tt small{color:#8fa8b3;font-size:8.5px;display:block;margin-top:2px;line-height:1.5}" +
    ".jlv2 .tags{display:flex;flex-direction:column;gap:3px;align-items:flex-end}" +
    ".jlv2 .tg{font-size:8px;border-radius:5px;padding:2px 6px;border:1px solid #ffffff26;color:#c9dfe8;white-space:nowrap}" +
    ".jlv2 .tg.up{border-color:#ff54598c;color:#ff8b8f}" +
    ".jlv2 .tg.dn{border-color:#1fdc938c;color:#1fdc93}" +
    ".jlv2 .tg.warn{border-color:#ffd21f8c;color:#ffd21f}" +
    ".jlv2 .tg.live{border-color:#81e6d9;color:#81e6d9;background:#81e6d914}" +
    ".jlv2 .tg.dead{border-color:#ffffff1f;color:#7e8798}" +
    ".jlv2 .hold{color:#ffd21f}.jlv2 .watch{color:#8fa8b3}" +
    ".jlv2 .foot{font-size:8px;color:#7e8798;margin-top:10px;line-height:1.6}" +
    ".jlv2 .g2{font-size:9px;color:#7e8798;padding:6px 0}";
  document.head.appendChild(css);

  /* ---------- 状态 ---------- */
  var S = {
    snap: null,   // {t,up,down,flat,amt,at}
    hist: {},     // {date:{t,zt,dt,zbr,state}}
    idx: null,    // [{secid,name,pct}]
    pool: null,   // {zt:{n,lb,zbc},zb:{n},dt:{n},date}
    prem: null,   // {avg,n}
    atr: null,    // {vol,atr,close,prevDate}
    etf: null,    // [{secid,name,code,today,d5,arr}]
    hot: null,    // {name,streak}
    grp: null,    // {groups:[],count,latest}
    open: lsGet("jlv2_open_v1", { t: 0, g: 0, y: 0 })
  };
  // 载入今日已有缓存
  (function loadCache() {
    var d = today();
    var sn = lsGet("jlv2_snap_v1", null); if (sn && sn.date === d) S.snap = sn;
    S.hist = lsGet("jlv2_temp_hist_v1", {});
    var po = lsGet("jlv2_pool_v1", null); if (po && po.date === d) S.pool = po;
    var pr = lsGet("jlv2_prem_v1", null); if (pr && pr.date === d) S.prem = pr;
    var at = lsGet("jlv2_atr_v1", null); if (at && at.date === d) S.atr = at;
    var et = lsGet("jlv2_etf_v1", null); if (et && et.date === d) S.etf = et;
    var ho = lsGet("jlv2_hot_v1", null); if (ho) S.hot = ho;
  })();

  function prevTradeDay() {
    if (S.atr && S.atr.prevDate) return S.atr.prevDate;
    var h = lsGet("jlv2_prevday_v1", null);
    return h && h.date === today() ? h.prev : null;
  }

  /* ---------- 抓取 ---------- */
  function fetchSnap(cb) {
    jsonp(P2, "/api/qt/ulist.np/get?fltt=2&invt=2&secids=1.000001,0.399001&fields=f6,f12,f48,f104,f105,f106&ut=" + UT, function (e, d) {
      if (e || !d || !d.data || !d.data.diff || !d.data.diff.length) { cb(e || new Error("snap")); return; }
      var up = 0, dn = 0, fl = 0, amt = 0;
      d.data.diff.forEach(function (r) { up += +r.f104 || 0; dn += +r.f105 || 0; fl += +r.f106 || 0; amt += +r.f6 || 0; });
      if (!(up > 0)) { cb(new Error("snap-empty")); return; }
      var upR = up / Math.max(1, up + dn);
      var t = Math.max(0, Math.min(100, Math.round(50 + (upR - 0.5) * 100)));
      S.snap = { date: today(), t: t, up: up, down: dn, flat: fl, amt: amt, at: hhmm(String(nowMin()).padStart(4, "0")) };
      lsSet("jlv2_snap_v1", S.snap);
      var h = lsGet("jlv2_temp_hist_v1", {});
      var y = h[today()] || {};
      h[today()] = { t: t, zt: y.zt, dt: y.dt, zbr: y.zbr, state: y.state, amt: Math.round(amt) };
      var ks = Object.keys(h).sort(); if (ks.length > 90) ks.slice(0, ks.length - 90).forEach(function (k) { delete h[k]; });
      lsSet("jlv2_temp_hist_v1", h); S.hist = h;
      cb(null, S.snap);
    });
  }
  function fetchIdx(cb) {
    jsonp(P2, "/api/qt/ulist.np/get?fltt=2&invt=2&secids=" + CFG.idx.map(function (x) { return x[0]; }).join(",") + "&fields=f12,f14,f3&ut=" + UT, function (e, d) {
      if (e || !d || !d.data || !d.data.diff || !d.data.diff.length) { cb(e || new Error("idx")); return; }
      S.idx = d.data.diff.map(function (r, i) { return { secid: CFG.idx[i] ? CFG.idx[i][0] : r.f12, name: r.f14, pct: +r.f3 }; });
      lsSet("jlv2_idx_v1", { date: today(), idx: S.idx, at: hhmm(String(nowMin()).padStart(4, "0")) });
      cb(null, S.idx);
    });
  }
  function fetchPoolOne(kind, date, cb) {
    jsonp(P2X, "/getTopic" + kind + "Pool?ut=" + UT + "&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date=" + date, function (e, d) {
      if (e || !d || !d.data || !d.data.pool) { cb(e || new Error(kind)); return; }
      cb(null, d.data.pool);
    });
  }
  function fetchPools(cb) {
    var out = { zt: null, zb: null, dt: null, date: today() }, left = 3, bad = 0;
    function fin() { if (--left > 0) return; if (bad >= 3) { cb(new Error("pools")); return; } S.pool = out; lsSet("jlv2_pool_v1", out); cb(null, out); }
    fetchPoolOne("ZT", ymd(), function (e, p) { if (e) { bad++; } else { var lb = 0, zb = 0; p.forEach(function (r) { lb = Math.max(lb, +r.lbc || 0); zb += +r.zbc || 0; }); out.zt = { n: p.length, lb: lb, zbc: zb }; } fin(); });
    fetchPoolOne("ZB", ymd(), function (e, p) { if (e) { bad++; } else { out.zb = { n: p.length }; } fin(); });
    fetchPoolOne("DT", ymd(), function (e, p) { if (e) { bad++; } else { out.dt = { n: p.length }; } fin(); });
  }
  function fetchPremium(cb) {
    var pd = prevTradeDay();
    if (!pd) { cb(new Error("no-prevday")); return; }
    fetchPoolOne("ZT", pd, function (e, p) {
      if (e || !p || !p.length) { cb(e || new Error("zt-prev")); return; }
      var ids = p.slice(0, 80).map(function (r) { return (r.m === 1 ? "1." : "0.") + r.c; });
      jsonp(P2, "/api/qt/ulist.np/get?fltt=2&invt=2&secids=" + ids.join(",") + "&fields=f12,f3&ut=" + UT, function (e2, d2) {
        if (e2 || !d2 || !d2.data || !d2.data.diff || !d2.data.diff.length) { cb(e2 || new Error("prem-q")); return; }
        var s = 0, n = 0;
        d2.data.diff.forEach(function (r) { var v = +r.f3; if (isFinite(v)) { s += v; n++; } });
        if (!n) { cb(new Error("prem-empty")); return; }
        S.prem = { date: today(), avg: s / n, n: n };
        lsSet("jlv2_prem_v1", S.prem);
        cb(null, S.prem);
      });
    });
  }
  function fetchAtr(cb) {
    jsonp(P2H, "/api/qt/stock/kline/get?secid=1.000001&klt=101&fqt=1&lmt=25&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&ut=" + UT, function (e, d) {
      if (e || !d || !d.data || !d.data.klines || d.data.klines.length < 16) { cb(e || new Error("atr")); return; }
      var rows = d.data.klines.map(function (r) { var p = r.split(","); return { d: p[0].replace(/-/g, ""), o: +p[1], c: +p[2], h: +p[3], l: +p[4] }; });
      var n = rows.length, trs = [];
      for (var i = n - 14; i < n; i++) {
        var pc = rows[i - 1].c;
        trs.push(Math.max(rows[i].h - rows[i].l, Math.abs(rows[i].h - pc), Math.abs(rows[i].l - pc)));
      }
      var atr = trs.reduce(function (a, b) { return a + b; }, 0) / trs.length;
      var close = rows[n - 1].c, prevD = rows[n - 2].d, lastD = rows[n - 1].d;
      S.atr = { date: today(), vol: close ? atr / close * 100 : null, atr: atr, close: close, kdate: lastD };
      lsSet("jlv2_atr_v1", S.atr);
      lsSet("jlv2_prevday_v1", { date: today(), prev: lastD === ymd() ? prevD : lastD });
      cb(null, S.atr);
    });
  }
  function fetchOneEtf(i, cb) {
    var e0 = CFG.etfs[i];
    jsonp(P2H, "/api/qt/stock/fflow/daykline/get?secid=" + e0[0] + "&lmt=10&end=20500101&fields1=f1,f2,f3,f7&fields2=f51,f52&ut=" + UT, function (e, d) {
      if (e || !d || !d.data || !d.data.klines || !d.data.klines.length) { cb(e || new Error("etf" + i)); return; }
      var arr = d.data.klines.map(function (r) { var p = r.split(","); return { d: p[0], v: +p[1] }; });
      var todayRow = arr[arr.length - 1];
      var d5 = arr.slice(-5).reduce(function (a, b) { return a + b.v; }, 0);
      cb(null, { secid: e0[0], name: e0[1], code: e0[2], today: todayRow && todayRow.d === today() ? todayRow.v : (arr[arr.length - 1] || { v: NaN }).v, d5: d5, arr: arr });
    });
  }
  function fetchEtfs(cb) {
    var out = [], left = CFG.etfs.length, bad = 0;
    CFG.etfs.forEach(function (e0, i) {
      setTimeout(function () {
        fetchOneEtf(i, function (e, r) { if (e) { bad++; } else { out[i] = r; } if (--left <= 0) { if (bad >= CFG.etfs.length) { cb(new Error("etf-all")); return; } S.etf = out; lsSet("jlv2_etf_v1", { date: today(), rows: out, at: hhmm(String(nowMin()).padStart(4, "0")) }); cb(null, out); } });
      }, i * 350);
    });
  }
  function fetchHot(cb) {
    jsonp(P2, "/api/qt/clist/get?pn=1&pz=3&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f3,f12,f14&ut=" + UT, function (e, d) {
      if (e || !d || !d.data || !d.data.diff || !d.data.diff.length) { cb(e || new Error("hot")); return; }
      var name = String(d.data.diff[0].f14 || "—").replace(/[ⅠⅡⅢ]+$/, "");
      var h = lsGet("jlv2_hot_v1", {});
      var streak = (h.name === name && h.date === today()) ? (h.streak || 1) : (h.date === yesterdayStr() && h.name === name ? (h.streak || 1) + 1 : 1);
      S.hot = { date: today(), name: name, streak: streak };
      lsSet("jlv2_hot_v1", S.hot);
      cb(null, S.hot);
    });
  }
  function yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("sv-SE"); }

  /* ---------- P2 异动分组（读 jinlin_yd_v1 缓存 + 自补 8205/8218/8202） ---------- */
  var YD_UP = { 8201: 1, 8202: 1, 8203: 1, 8204: 1, 8206: 1 };
  var YD_NAME = { 8201: "火箭发射", 8202: "快速反弹", 8203: "大笔买入", 8204: "封涨停", 8205: "打开涨停", 8206: "有大买盘", 8207: "有大卖盘", 8218: "加速下跌", 8219: "高台跳水", 8220: "大笔卖出", 8221: "封跌停", 8222: "打开跌停" };
  S.ownYd = S.ownYd || []; /* 本模块补抓的异动事件（8205/8218/8202）*/
  function fetchOwnYd(cb) {
    var tys = ["8205", "8218", "8202"], left = tys.length;
    tys.forEach(function (ty) {
      jsonp(P2X, "/getAllStockChanges?type=" + ty + "&pageindex=0&pagesize=200&ut=" + UT + "&dpt=wzchanges", function (e, d) {
        if (!e && d && d.data && d.data.allstock) {
          d.data.allstock.forEach(function (x) { S.ownYd.push({ c: String(x.c), m: +x.m, n: String(x.n), t: +x.t, tm: +x.tm }); });
        }
        if (--left <= 0) cb(null, S.ownYd);
      });
    });
  }
  function holdingsMap() {
    var st = lsGet("jinlin_stocks_v2", []), mh = {}, mw = {};
    (Array.isArray(st) ? st : []).forEach(function (h) {
      if (!h || !h.code) return;
      if (+h.qty > 0) mh[String(h.code)] = (h.name || h.code);
      else mw[String(h.code)] = (h.name || h.code);
    });
    return { mh: mh, mw: mw };
  }
  function buildGroups() {
    var cc = lsGet("jinlin_yd_v1", null);
    var evs = [];
    if (cc && cc.date === today() && cc.ev && cc.ev.length) evs = cc.ev.slice(0, 800);
    (S.ownYd || []).forEach(function (x) {
      if (!evs.some(function (e) { return e.c === x.c && e.t === x.t && e.tm === x.tm; })) evs.push(x);
    });
    evs = evs.filter(function (e) { return e && e.tm >= 930 && e.tm <= 1500; });
    var H = holdingsMap();
    var nm = nowMin(), nReal = hhmm2min(nm); /* 跨小时修正：HHMM→真实分钟差 */
    function hhmm2min(v) { v = +v; return Math.floor(v / 100) * 60 + v % 100; }
    function persist(e) { var d = nReal - hhmm2min(e.tm); return d <= CFG.persistMin ? (d >= 3 ? "已持续" + d + "分" : "待确认") : "已衰竭"; }
    function tags(dir, per) {
      var a = dir > 0 ? '<i class="tg up">影响：偏多</i>' : dir < 0 ? '<i class="tg dn">影响：偏空</i>' : '<i class="tg">影响：中性</i>';
      var b = per === "dead" ? '<i class="tg dead">已衰竭</i>' : per === "live" ? '<i class="tg live">跟进中</i>' : '<i class="tg warn">待确认</i>';
      return a + b;
    }
    var groups = [];
    // A 涨跌停结构
    (function () {
      var zt4 = evs.filter(function (e) { return e.t === 8204 || e.t === 8205 || e.t === 8221 || e.t === 8222; });
      if (!zt4.length) return;
      var bk = {};
      zt4.forEach(function (e) { var k = Math.floor(e.tm / 15) * 15; (bk[k] = bk[k] || []).push(e); });
      var keys = Object.keys(bk).sort(function (a, b) { return b - a; }).slice(0, 2);
      var rows = "";
      keys.forEach(function (k) {
        var arr = bk[k], up = arr.filter(function (e) { return e.t === 8204 || e.t === 8202; }).length;
        var zb = arr.filter(function (e) { return e.t === 8205; }).length;
        var dn = arr.filter(function (e) { return e.t === 8221 || e.t === 8222; }).length;
        var ttl = zb >= Math.max(3, up) ? "炸板潮" : dn > up ? "跌停潮" : up >= 3 ? "封板潮" : "涨跌停波动";
        var dir = ttl === "炸板潮" || ttl === "跌停潮" ? -1 : ttl === "封板潮" ? 1 : 0;
        var per = arr.some(function (e) { return nReal - hhmm2min(e.tm) <= 10; }) ? "live" : "dead";
        var hold = arr.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : (H.mw[e.c] ? "○" + esc(H.mw[e.c]) : ""); }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(k) + '</span><span class="tt"><b>' + ttl + ' · ' + arr.length + '只</b><small>封' + up + ' / 炸' + zb + ' / 跌向' + dn + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(dir, per) + '</span></div>';
      });
      groups.push({ t: "涨跌停结构", n: zt4.length, html: rows });
    })();
    // B 板块异动（行业×10分钟聚簇）
    (function () {
      var upCls = evs.filter(function (e) { return YD_UP[e.t] && e.hy; });
      var bk = {};
      upCls.forEach(function (e) { var k = Math.floor(e.tm / 10) * 10; bk[k + "|" + e.hy] = (bk[k + "|" + e.hy] || 0) + 1; });
      var top = Object.keys(bk).map(function (k) { return { k: k.split("|")[0], hy: k.split("|")[1], n: bk[k] }; }).filter(function (x) { return x.n >= 4; }).sort(function (a, b) { return b.k - a.k || b.n - a.n; }).slice(0, 2);
      var rows = "";
      top.forEach(function (x) {
        var mem = upCls.filter(function (e) { return e.hy === x.hy && Math.floor(e.tm / 10) * 10 === +x.k; });
        var hold = mem.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : (H.mw[e.c] ? "○" + esc(H.mw[e.c]) : ""); }).filter(Boolean).slice(0, 2).join(" ");
        var per = nReal - hhmm2min(+x.k) <= 10 ? "live" : (nReal - hhmm2min(+x.k) <= CFG.persistMin ? "warn" : "dead");
        rows += '<div class="ev"><span class="tm">' + hhmm(x.k) + '</span><span class="tt"><b>' + esc(x.hy) + '快速拉升 · ' + mem.length + '只↑</b><small>' + mem.slice(0, 3).map(function (e) { return esc(e.n); }).join(" · ") + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(1, per) + '</span></div>';
      });
      if (rows) groups.push({ t: "板块异动", n: top.length, html: rows });
    })();
    // C 个股扩散（15分钟环比）
    (function () {
      var w = {}, w15 = Math.floor(nm / 15) * 15;
      evs.filter(function (e) { return YD_UP[e.t]; }).forEach(function (e) { var k = Math.floor(e.tm / 15) * 15; w[k] = (w[k] || 0) + 1; });
      var cur = w[w15] || 0, prev = w[w15 - 15] || 0;
      if (!cur && !prev) return;
      var env = prev ? Math.round((cur - prev) / Math.max(1, prev) * 100) : (cur ? 100 : 0);
      var dir = env >= 25 ? 1 : env <= -25 ? -1 : 0;
      var ttl = dir > 0 ? "上涨类异动扩散 · 赚钱效应回暖" : dir < 0 ? "上涨类异动收敛 · 情绪退潮" : "异动密度平稳";
      var rows = '<div class="ev"><span class="tm">' + hhmm(w15) + '</span><span class="tt"><b>' + ttl + '</b><small>本15分钟 ' + cur + ' 只 · 上15分钟 ' + prev + ' 只 · 环比 ' + (env >= 0 ? "+" : "") + env + '%</small></span><span class="tags">' + tags(dir, "warn") + '</span></div>';
      groups.push({ t: "个股扩散", n: 1, html: rows });
    })();
    // D 风险事件
    (function () {
      var rk = evs.filter(function (e) { return e.t === 8218 || e.t === 8219 || e.t === 8220 || e.t === 8221; });
      if (!rk.length) return;
      var bk = {};
      rk.forEach(function (e) { var k = Math.floor(e.tm / 15) * 15; (bk[k] = bk[k] || []).push(e); });
      var keys = Object.keys(bk).sort(function (a, b) { return b - a; }).slice(0, 2);
      var rows = "";
      keys.forEach(function (k) {
        var arr = bk[k];
        var jp = arr.filter(function (e) { return e.t === 8219; }).length, js = arr.filter(function (e) { return e.t === 8218; }).length;
        var per = nReal - hhmm2min(+k) <= 10 ? "live" : "dead";
        var hold = arr.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : ""; }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(k) + '</span><span class="tt"><b>风险事件聚集 · ' + arr.length + '只</b><small>高台跳水' + jp + ' · 加速下跌' + js + ' · 大笔卖出' + (arr.length - jp - js) + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(-1, per) + '</span></div>';
      });
      groups.push({ t: "风险事件", n: rk.length, html: rows });
    })();
    var latest = evs.length ? hhmm(evs[0].tm) + " " + esc(evs[0].n) + " " + (YD_NAME[evs[0].t] || evs[0].t) : "";
    S.grp = { groups: groups, count: groups.reduce(function (a, g) { return a + g.n; }, 0), latest: latest };
  }

  /* ---------- 派生：温度状态机 / 结构判断 ---------- */
  function deriveState() {
    var sn = S.snap, po = S.pool, pr = S.prem;
    if (!sn) return null;
    var zt = po && po.zt ? po.zt.n : null, lb = po && po.zt ? po.zt.lb : null;
    var zb = po && po.zb ? po.zb.n : null, dt = po && po.dt ? po.dt.n : null;
    var zbr = (zb != null && zt != null && (zt + zb) > 0) ? Math.round(zb / (zt + zb) * 100) : null;
    var prem = pr ? pr.avg : null;
    var r1 = dt != null && zt != null ? (dt >= CFG.ice.dtBig || dt >= zt * 2) : null;
    var r2 = zbr != null ? (zbr >= CFG.ice.zbRate) : null;
    var r3 = lb != null ? (lb <= CFG.ice.lb) : null;
    var r4 = prem != null ? (prem <= CFG.ice.prem) : null;
    var met = [r1, r2, r3, r4].filter(function (x) { return x === true; }).length;
    var known = [r1, r2, r3, r4].filter(function (x) { return x != null; }).length;
    var state;
    if (zt != null && zt >= CFG.hot.zt && lb != null && lb >= CFG.hot.lb && prem != null && prem >= CFG.hot.prem) state = "高潮";
    else if (known >= 3 && met >= 3) state = "冰点";
    else if (sn.t <= CFG.coldT || (known >= 2 && met >= 2)) state = "冷点";
    else state = "正常";
    // 写入日史（供 冰点后第N天 / Δ温度）
    var h = lsGet("jlv2_temp_hist_v1", {}), y0 = h[today()] || {};
    h[today()] = { t: sn.t, zt: zt, dt: dt, zbr: zbr, state: state, amt: y0.amt };
    var ks = Object.keys(h).sort(); if (ks.length > 90) ks.slice(0, ks.length - 90).forEach(function (k) { delete h[k]; });
    lsSet("jlv2_temp_hist_v1", h); S.hist = h;
    return { zt: zt, lb: lb, zb: zb, dt: dt, zbr: zbr, prem: prem, r: [r1, r2, r3, r4], met: met, state: state };
  }
  function iceDaysAgo(st) {
    var ks = Object.keys(S.hist).sort();
    var n = 0;
    for (var i = ks.length - 1; i >= 0; i--) {
      if (ks[i] === today()) continue;
      if (S.hist[ks[i]].state === "冰点") return n + 1;
      n++;
      if (n > 5) break;
    }
    return -1;
  }
  function deriveStruct() {
    if (!S.idx || !S.snap) return null;
    var p300 = null, psh = null, pcy = null;
    S.idx.forEach(function (x) { if (x.secid === "1.000300") p300 = x.pct; if (x.secid === "1.000001") psh = x.pct; if (x.secid === "0.399006") pcy = x.pct; });
    if (p300 == null || !S.snap.up) return null;
    var upR = S.snap.up / Math.max(1, S.snap.up + S.snap.down) * 100;
    var v;
    /* 阈值：涨跌比偏离带 40~55；300 涨跌分界 0.25%（0.3 实测漏判 +0.29 类弱托底日） */
    if (upR < 40 && p300 >= 0.25) v = 1;
    else if (upR < 40 && p300 <= -0.25) v = 3;
    else if (upR >= 55 && p300 >= 0.2) v = 0;
    else if (upR >= 55 && p300 <= -0.2) v = 2;
    else v = 4;
    return { v: v, p300: p300, psh: psh, pcy: pcy, upR: upR };
  }

  /* ---------- 渲染 ---------- */
  var ROOT = null;
  function ensureRoot() {
    if (!ROOT) ROOT = $("jlv2root");
    if (!ROOT) { ROOT = document.createElement("div"); ROOT.id = "jlv2root"; document.body.appendChild(ROOT); }
    return ROOT;
  }
  function statePill(st) { return st === "冰点" ? "zpill ice" : st === "高潮" ? "zpill hot" : "zpill"; }
  function renderTemp() {
    var st = deriveState(), sn = S.snap;
    var yk = Object.keys(S.hist).filter(function (k) { return k < today(); }).pop();
    var yv = yk ? S.hist[yk] : null;
    var dt2 = yv && yv.t != null ? sn.t - yv.t : null;
    var head = '<b>市场温度 · v2</b><small>采样 ' + (sn ? sn.at : "—") + ' · 东财沪深快照 · 自建通道</small>';
    if (!sn) { return { head: head, sum: '<span class="jsum">采样中… 点标题展开</span>', body: "" }; }
    var zbr = st ? st.zbr : null;
    var sumParts = [];
    sumParts.push('<span class="mono">' + sn.t + '</span> ' + (st && st.state !== "正常" ? '<span class="' + statePill(st.state) + '" style="font-size:9px;padding:1px 7px">' + st.state + '</span>' : '<span class="mu">平</span>'));
    if (dt2 != null && dt2 !== 0) sumParts.push('<span class="' + (dt2 > 0 ? "up" : "dn") + ' mono">' + (dt2 > 0 ? "▲" : "▼") + Math.abs(dt2) + '</span>');
    if (st && st.zt != null) sumParts.push('<span class="mono">涨停' + st.zt + '/跌停' + (st.dt == null ? "—" : st.dt) + '</span>');
    if (zbr != null) sumParts.push('<span class="mono">炸板' + zbr + '%</span>');
    var alertDot = st && (st.state === "冰点" || st.state === "高潮") ? '<span class="dot" style="color:#ff5459"></span>' : (st && st.state === "冷点" ? '<span class="dot" style="color:#ffd21f"></span>' : "");
    var scale = '<div class="row" style="border-bottom:none;gap:0;display:flex;justify-content:space-between;font-size:8px;color:#7e8798"><span>100 沸</span><span>热</span><span>温</span><span>50 平</span><span>冷</span><span>过冷</span><span>0 冰</span></div>';
    function tile(lb, val, cls, sub) { return '<div class="ft"><span>' + lb + '</span><b class="' + cls + '">' + val + '</b><small>' + sub + '</small></div>'; }
    var upR = Math.round(sn.up / Math.max(1, sn.up + sn.down) * 100);
    var yzbr = yv && yv.zbr != null ? yv.zbr : null;
    var grid =
      tile("上涨占比", upR + "%", upR >= 55 ? "up" : upR <= 45 ? "dn" : "mu", esc(sn.up) + "/" + esc(sn.down) + " 家") +
      tile("涨停", st && st.zt != null ? st.zt : "—", (st && st.zt != null && st.zt >= 60) ? "up" : (st && st.zt != null && st.zt <= 25) ? "dn" : "mu", "涨停池口径") +
      tile("跌停", st && st.dt != null ? st.dt : "—", (st && st.dt != null && st.dt >= 40) ? "dn" : "mu", "跌停池 · 本模块自建") +
      tile("炸板率", zbr != null ? zbr + "%" : "—", zbr != null && zbr >= 40 ? "dn" : "mu", "盘中暂态 · 收盘定版") +
      tile("连板高度", st && st.lb != null ? st.lb + "板" : "—", (st && st.lb != null && st.lb >= 6) ? "up" : (st && st.lb != null && st.lb <= 2) ? "dn" : "mu", "最高连板") +
      tile("昨涨停溢价", st && st.prem != null ? pct(st.prem) : "—", (st && st.prem != null && st.prem >= 3) ? "up" : (st && st.prem != null && st.prem <= -1) ? "dn" : "mu", "T-1 · 强势股次日") +
      tile("成交额变化", amtDiffHtml(), amtDiffCls(), "较上一交易日") +
      tile("ATR波动率", S.atr && S.atr.vol != null ? S.atr.vol.toFixed(2) + "%" : "—", "mu", "上证 ATR14/价") +
      tile("热点板块持续", S.hot ? S.hot.streak + "天" : "—", "mu", esc(S.hot ? S.hot.name : "行业涨幅榜首"));
    var rules = "";
    if (st) {
      var rtxt = [
        ["跌停≥" + CFG.ice.dtBig + " 或 跌停>涨停×2", st.dt != null && st.zt != null ? st.dt + " vs " + st.zt : "缺数"],
        ["炸板率≥" + CFG.ice.zbRate + "%", zbr != null ? zbr + "%" : "缺数"],
        ["连板高度≤" + CFG.ice.lb, st.lb != null ? st.lb + "板" : "缺数"],
        ["昨涨停溢价≤" + CFG.ice.prem + "%", st.prem != null ? pct(st.prem) : "缺数"]
      ];
      rules = rtxt.map(function (r, i) {
        var v = st.r[i];
        return '<div class="rule"><span class="rst ' + (v === true ? "ok" : v === false ? "no" : "no") + '">' + (v === true ? "✓" : v === false ? "✗" : "?") + '</span><span class="rl">' + r[0] + '<small>当前 ' + r[1] + '</small></span></div>';
      }).join("");
      rules += '<div class="row" style="border-bottom:none"><span>判定 <b class="mono">' + st.met + '/' + st.r.filter(function (x) { return x != null; }).length + '</b> 达标</span><span class="' + (st.state === "冰点" ? "hl" : "mu") + '">→ ' + st.state + (st.state === "冷点" ? "（未触发冰点）" : "") + '</span></div>';
    }
    var scn = "";
    if (st) {
      var iceD = iceDaysAgo(st.state);
      var items = [
        [st.state === "冰点", "冰点当日", "风险释放接近极端 · 次日重点观察止跌与强势股修复"],
        [st.state === "冰点" && iceD === 1, "冰点后第1天", "观察是否止跌、强势股是否修复"],
        [st.state === "冰点" && iceD >= 2, "冰点后第2天", "确认修复是否扩散"],
        [st.state === "冷点", "冷点阶段", "减少追高 · 优先关注低位启动"],
        [dt2 != null && dt2 >= CFG.bounce.dtJump && (st.zbr != null && yzbr != null && st.zbr >= CFG.bounce.zbFail), "温度快升 + 涨停扩散失败", "警惕冲高回落"]
      ].filter(function (x) { return x[0]; });
      if (!items.length) items = [[true, "状态正常", "无特别提示 · 按计划执行"]];
      scn = items.map(function (x) { return '<div class="scn on"><b>' + x[1] + '</b>' + x[2] + '</div>'; }).join("");
    }
    var body =
      scale +
      '<div class="tnow" style="margin-top:8px"><b>' + sn.t + '</b><span class="' + statePill(st ? st.state : "正常") + '">' + (st ? st.state : "—") + '</span><span style="font-size:8.5px;color:#8fa8b3">' + (dt2 != null ? "昨 " + yv.t + " · " + (dt2 > 0 ? "▲" : dt2 < 0 ? "▼" : "—") + Math.abs(dt2) : "昨日无记录") + '</span></div>' +
      '<div class="fgrid">' + grid + '</div>' +
      '<div class="jh">冰点判定 · 规则组（非阈值）</div>' + rules +
      '<div class="jh">场景提示 · 状态驱动</div>' + scn +
      '<div class="foot">状态描述，不构成操作建议 · 温度=50+(涨跌比-0.5)×100 与旧卡同源 · 冰点=规则组判定（≥3项）· 阈值集中在 CFG 待回测校准 · 涨跌停池为本模块自建口径</div>';
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:#7e8798">·</span>') + '</span>', body: body };
  }
  function amtDiff() {
    if (!S.snap || !isFinite(S.snap.amt)) return null;
    var ks = Object.keys(S.hist).filter(function (k) { return k < today() && S.hist[k].amt > 1e11; }).sort();
    if (!ks.length) return null;
    var pv = S.hist[ks[ks.length - 1]].amt;
    return (S.snap.amt - pv) / pv * 100;
  }
  function amtDiffHtml() {
    var d = amtDiff();
    if (d != null) return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
    if (S.snap && isFinite(S.snap.amt)) return (S.snap.amt / 1e12).toFixed(2) + "万亿";
    return "—";
  }
  function amtDiffCls() { var d = amtDiff(); return d == null ? "mu" : (d >= 0 ? "up" : "dn"); }
  function renderGjd() {
    var stx = deriveStruct();
    var etfOk = S.etf && S.etf.length && S.etf.some(Boolean);
    var head = '<b>大资金 · 国家队</b><small>ETF主力净额口径' + (S.etf && S.etf.at ? ' · ' + S.etf.at : '') + '</small>';
    if (!stx && !etfOk) { return { head: head, sum: '<span class="jsum">采样中… 点标题展开</span>', body: "" }; }
    var VN = ["普涨 · 全面进攻", "权重强 · 个股弱", "权重弱 · 个股强", "普跌 · 防御", "结构均衡"];
    var v = stx ? stx.v : 4;
    var e300 = etfOk ? S.etf[0] : null;
    var sumParts = [];
    if (stx) sumParts.push('<b class="' + (v === 1 || v === 2 ? "hl" : v === 3 ? "dn" : v === 0 ? "up" : "mu") + '" style="font-size:10.5px">' + VN[v] + '</b>');
    if (e300 && isFinite(e300.today)) sumParts.push('<span class="mono">300ETF ' + fmtYi(e300.today) + '</span>');
    var alertDot = v === 1 ? '<span class="dot" style="color:#ffd21f"></span>' : "";
    var rows = "";
    if (etfOk) {
      var mx = Math.max.apply(null, S.etf.map(function (r) { return r && isFinite(r.today) ? Math.abs(r.today) : 0; }).concat([1]));
      rows = '<div class="row" style="font-size:8px;color:#7e8798;border-bottom:none;padding-bottom:2px"><span>品种</span><span>当日主力净额（红入绿出）</span><span style="text-align:right">近5日</span></div>';
      rows += S.etf.map(function (r) {
        if (!r) return "";
        var w = isFinite(r.today) ? Math.max(3, Math.abs(r.today) / mx * 46) : 0;
        var bar = isFinite(r.today) ? (r.today >= 0
          ? '<i style="left:50%;width:' + w + '%;background:linear-gradient(90deg,#ff5459cc,#ff5459)"></i><em style="left:50%;padding-left:5px;color:#ff8b8f">' + fmtYi(r.today) + '</em>'
          : '<i style="right:50%;width:' + w + '%;background:linear-gradient(270deg,#1fdc93cc,#1fdc93)"></i><em style="right:50%;padding-right:5px;color:#1fdc93">' + fmtYi(r.today) + '</em>') : '<em style="left:50%;padding-left:5px;color:#7e8798">—</em>';
        return '<div class="erow"><span class="nm"><b>' + r.name + '</b><small>' + r.code + '</small></span><span class="ebar">' + bar + '</span><span class="d5 mono" style="text-align:right;font-size:9.5px" >' + (isFinite(r.d5) ? (r.d5 >= 0 ? "+" : "") + (r.d5 / 1e8).toFixed(1) + "亿" : "—") + '</span></div>';
      }).join("");
    } else rows = '<div class="g2">ETF 净额通道未到 · 稍后自动重试</div>';
    var struct = "";
    if (stx) {
      var e1000 = etfOk && S.etf[2] && isFinite(S.etf[2].today) ? S.etf[2].today : null;
      var sync = e300 && e1000 != null
        ? (e300.today >= 3e8 && e1000 < 1e8 ? "托底集中于权重 · 中小盘未同步" : (e1000 >= 1e8 ? "中小盘有同步承接" : "承接一般"))
        : "ETF数据未到";
      struct =
        '<div class="jh">市场结构判断</div>' +
        '<div class="row" style="border-bottom:none"><span class="bigState">' + VN[v] + '</span></div>' +
        '<div class="row" style="border-bottom:none"><small>沪深300 ' + pct(stx.p300) + ' × 上涨占比 ' + Math.round(stx.upR) + '%</small><small>' + (stx.pcy != null ? "创业板 " + pct(stx.pcy) : "") + '</small></div>' +
        '<div class="chips">' + VN.map(function (n, i) { return '<span class="chip' + (i === v ? " on" : "") + '">' + n + '</span>'; }).join("") + '</div>' +
        '<div class="row" style="margin-top:8px"><span>中小盘同步性</span><span class="' + (sync.indexOf("未同步") >= 0 ? "hl" : "mu") + '" style="font-size:9.5px">' + sync + '</span></div>';
    }
    var body = rows + struct +
      '<div class="foot">ETF主力净额≠真实净流入（份额变动×净值）· push2his fflow 日K · 近5日=近5根日K合计 · 结构判断=沪深300涨跌×上涨占比交叉派生 · 托底不等于全面进攻</div>';
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:#7e8798">·</span>') + '</span>', body: body };
  }
  function renderYd() {
    buildGroups();
    var g = S.grp || { groups: [], count: 0, latest: "" };
    var head = '<b>大盘异动 · 分组</b><small>事件流聚合 · ' + hhmm(String(nowMin()).padStart(4, "0")) + '</small>';
    var sumParts = [];
    sumParts.push('<span class="mono">' + g.groups.length + '</span> 组');
    if (g.latest) sumParts.push('最新 <span class="mu">' + g.latest + '</span>');
    var riskOn = g.groups.some(function (x) { return x.t === "风险事件"; });
    var alertDot = riskOn ? '<span class="dot" style="color:#ff5459"></span>' : "";
    var body = "";
    if (!g.groups.length) body = '<div class="g2">今日暂无聚合事件（异动 Tab 打开过才有事件缓存 · 本模块会自行补抓 8205/8218/8202）</div>';
    var ORDER = ["指数异动", "涨跌停结构", "成交额异动", "板块异动", "个股扩散", "风险事件"];
    var map = {}; g.groups.forEach(function (x) { map[x.t] = x; });
    body += ORDER.map(function (t) {
      if (t === "指数异动" || t === "成交额异动") return '<div class="grp"><div class="grpH"><span>' + t + '</span><small>二期 · 本版仅聚合个股事件流</small></div></div>';
      var x = map[t];
      if (!x) return '<div class="grp"><div class="grpH"><span>' + t + '</span><small>0</small></div></div>';
      return '<div class="grp"><div class="grpH"><span>' + t + '</span><small>' + x.n + '</small></div>' + x.html + '</div>';
    }).join("");
    body += '<div class="foot">持续性只跟踪不预测：待确认 → 已持续N分 → 15分钟无跟进自动置已衰竭 · 关联持仓读 jinlin_stocks_v2（●持仓 ○观察）· 事件源东财异动流+本模块补抓 · 指数/成交额异动二期自算</div>';
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:#7e8798">·</span>') + '</span>', body: body };
  }

  /* 调试钩子（金粲惯例 window 挂钩）：__JLV2S__=状态 __JLV2P__=手动重绘 __JLV2C__=配置 */
  window.__JLV2S__ = S;
  window.__JLV2P__ = function () { try { paint(); } catch (e) {} };
  window.__JLV2C__ = CFG;

  function paint() {
    var root = ensureRoot();
    var t = renderTemp(), g = renderGjd(), y = renderYd();
    var defs = [
      { k: "t", h: t.head, s: t.sum, b: t.body, tip: "点标题展开/收起" },
      { k: "g", h: g.head, s: g.sum, b: g.body, tip: "点标题展开/收起" },
      { k: "y", h: y.head, s: y.sum, b: y.body, tip: "点标题展开/收起" }
    ];
    root.innerHTML = defs.map(function (d0) {
      var on = S.open[d0.k] ? " open" : "";
      return '<section class="jlv2' + on + '" data-k="' + d0.k + '"><h3>' + d0.h + '<span class="jchev">▸</span></h3>' + d0.s + '<div class="jbody">' + d0.b + '</div></section>';
    }).join("");
    Array.prototype.forEach.call(root.querySelectorAll("h3"), function (h) {
      h.onclick = function () {
        var sec = h.parentElement, k = sec.getAttribute("data-k");
        sec.classList.toggle("open");
        S.open[k] = sec.classList.contains("open") ? 1 : 0;
        lsSet("jlv2_open_v1", S.open);
      };
    });
  }

  /* ---------- 调度 ---------- */
  function onceDaily(fn) { fn(function () { }); }
  function boot() {
    paint();
    fetchSnap(function () { paint(); });
    setTimeout(function () { fetchIdx(function () { paint(); }); }, 400);
    setTimeout(function () { fetchAtr(function () { paint(); fetchPremium(function () { paint(); }); }); }, 900);
    setTimeout(function () { fetchPools(function () { paint(); }); }, 1500);
    setTimeout(function () { fetchEtfs(function () { paint(); }); }, 2200);
    setTimeout(function () { fetchHot(function () { paint(); }); }, 3000);
    setTimeout(function () { fetchOwnYd(function () { paint(); }); }, 3600);
  }
  var lastTick = 0;
  setInterval(function () {
    if (!mktLive()) return;
    var n = Date.now();
    fetchSnap(function () { paint(); });
    if (n - lastTick > CFG.refrEtf) { lastTick = n; fetchIdx(function () { paint(); }); fetchEtfs(function () { paint(); }); }
    fetchPools(function () { paint(); });
    paint();
  }, CFG.refrLive);
  var visAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { visAt = Date.now(); return; }
    if (Date.now() - visAt > 2 * 60e3) boot(); // 回前台>2分钟全量补拉（沿用金粲节奏）
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
