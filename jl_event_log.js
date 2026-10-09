/* jl_event_log.js — jl-1087 v0.84.33 T3竞态根修: 首会话快速双paint写入竞态(在途键pending占位+fin三路清除); 原jl-1086 v0.84.32 任务B 事件日志器（独立新文件, 零改现有模块; jlv2.js 仅3处被动接入: 2处tap+1键位行）
   B1 写入 IndexedDB(jinlin_evlog/ev), 全程 try/catch 失败静默——不影响任何现有展示; 禁止 localStorage
   B2 只在事件状态转换时记一条: 新触发/升级/衰竭(观察者对照 jlv2 既有判定, 见下); 禁止逐分钟重复记
   B3 字段: {schema, rule, at, day, type, cat, prev, cur, tm, n, codes[], mc, mcDist{}, conc, temp, ztN, dtN, key}
   B4 备份: 大盘异动卡尾行注入「导出日志JSON/导入恢复」(MutationObserver 幂等重注入, 只新增不动现有DOM结构)
   ---- 状态机设计(T3定稿) ----
   ① 权威状态源 = IndexedDB 当日记录: 启动异步读回重建, 页面刷新不失忆(10:30新触发→10:35刷新→10:36同事件不再重复记)
   ② 初始化未就绪先缓冲(上限300条, 就绪后按序回放)——开盘早期事件不漏记
   ③ 写成功才推进内存状态——杜绝"内存认为已写、库里实际没有"的状态裂缝; 写失败不推进(静默, 下次tap自然重试)
   ④ DB 完全不可用(隐私模式/配额): 完全静默, 不落库不报错
   ⑤ 跨日自动清零(事件为日内口径, 与休市冻结原则一致); 当日已衰竭后重现 = 新周期记新触发
   ---- 纯观察者红线(硬约束) ----
   日志器零自造业务规则: 状态/只数/个股/事件名全部取自 jlv2 tap 的既有计算输出(per 与 B组495行/C组517行同式同源同CFG);
   "15分钟无跟进→衰竭"=jlv2 现有 CFG.persistMin 口径(只读不重算); "升级"仅指 C组现有"≥M只升级扩散"判定;
   覆盖: B组板块异动簇 + C组个股扩散事件; A组涨跌停结构以 ztN/dtN 快照字段入每条日志(不逐条入日志) */
(function () {
  "use strict";
  if (window.__JLEVLOG_INSTALLED__) return;
  window.__JLEVLOG_INSTALLED__ = 1;

  var DB_NAME = "jinlin_evlog", STORE = "ev", DB_VER = 1, SCHEMA = 1, RULE = "v0.84.33";
  var BUF_CAP = 300;
  var CON = (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {}; /* A1 概念映射: 主概念分布用, 纯静态 */
  var db = null, ready = false, dead = false, buf = [], state = {}, stateDay = "";
  var wq = [], writing = false, pend = {}; /* jl-1087: 键写入在途占位(纯内存: 不入IndexedDB, 不作业务状态)——治首会话快速双paint同key双写 */
  var stat = { today: 0, total: 0 };

  function today() { return new Date().toLocaleDateString("sv-SE"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtTm(mn) { var m = +mn || 0; return (m / 60 < 10 ? "0" : "") + Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60); }
  function mcOf(code) { var v = CON[code]; return (v && (v.mc || v.l2)) || ""; }
  function cfgYd() { try { return (window.__JLV2C__ && window.__JLV2C__.yd) || { bkWin: 30, spWin: 30 }; } catch (e) { return { bkWin: 30, spWin: 30 }; } }

  /* ---------- IDB ---------- */
  function openDB() {
    try {
      var rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function (ev) { try { var d = ev.target.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id", autoIncrement: true }); } catch (eU) {} };
      rq.onsuccess = function () { db = rq.result; try { db.onversionchange = function () { try { db.close(); } catch (eV) {} db = null; dead = true; }; } catch (eW) {} init(); };
      rq.onerror = function () { dead = true; }; /* 静默 */
      rq.onblocked = function () { dead = true; };
    } catch (eO) { dead = true; }
  }
  function readAll(cb) {
    if (!db || dead) { cb([]); return; }
    try {
      var rq = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      rq.onsuccess = function () { cb(rq.result || []); };
      rq.onerror = function () { cb(null); };
    } catch (eR) { cb(null); }
  }
  function init() {
    readAll(function (recs) {
      var d = today();
      if (recs == null) recs = []; /* 读失败降级: 本会话内去重(写大概率同败→无落库, 静默) */
      stat.total = recs.length;
      state = {}; stat.today = 0;
      recs.forEach(function (r) { if (r && r.day === d && r.key) { state[r.key] = { cur: r.cur, n: r.n || 0 }; stat.today++; } });
      stateDay = d;
      ready = true;
      var q = buf; buf = [];
      q.forEach(handle);
      refreshUI();
    });
  }

  /* ---------- 观察者主流程 ---------- */
  window.__JLEVLOG__ = function (payload) {
    try {
      if (!ready) { if (buf.length < BUF_CAP) buf.push(payload); return; }
      handle(payload);
    } catch (eH) {} /* B1: 静默 */
  };

  function handle(p) {
    if (!p || !p.day) return;
    if (p.day !== stateDay) { state = {}; stateDay = p.day; stat.today = 0; } /* 跨日清零 */
    var S = null; try { S = window.__JLV2S__; } catch (eS) {}
    var temp = S && S.snap && isFinite(S.snap.t) ? S.snap.t : null;
    var ztN = S && S.pool && S.pool.zt && S.pool.zt.n != null ? S.pool.zt.n : null;
    var dtN = S && S.pool && S.pool.dt && S.pool.dt.n != null ? S.pool.dt.n : null;
    var isSp = p.k === "sp", arr = isSp ? (p.sp || []) : (p.top || []);
    if (!arr.length) return;
    var win = isSp ? cfgYd().spWin : cfgYd().bkWin;
    /* 窗内同类事件去重只数(集中度分母, 机械统计非业务规则) */
    var denom = {};
    (p.evs || []).forEach(function (e) {
      if (!e || e.t == null || e.mn == null) return;
      var d = p.base - e.mn;
      if (d < 0 || d > win) return;
      var k = e.t;
      (denom[k] || (denom[k] = {}))[e.c] = 1;
    });
    var denN = {};
    Object.keys(denom).forEach(function (k) { denN[k] = Object.keys(denom[k]).length; });
    arr.forEach(function (c) {
      if (!c || !c.t) return;
      var key = (isSp ? "sp|" : "bk|") + (c.hy || "") + "|" + c.t;
      var type = (isSp ? "个股扩散·" : "板块异动·") + (c.nm || String(c.t));
      var st = state[key];
      if (!st) { emit(key, type, isSp ? "升级" : "新触发", null, c, isSp, temp, ztN, dtN, denN); return; } /* C组事件本身即jlv2"升级"判定 */
      if (c.per !== st.cur) {
        if (c.per === "dead") emit(key, type, "衰竭", st.cur, c, isSp, temp, ztN, dtN, denN);          /* 现有15分钟无跟进口径, 只读 */
        else if (st.cur === "dead") emit(key, type, isSp ? "升级" : "新触发", st.cur, c, isSp, temp, ztN, dtN, denN); /* 衰竭后重现=新周期 */
        else emit(key, type, "转换", st.cur, c, isSp, temp, ztN, dtN, denN);                            /* prev/cur 原样存 jlv2 状态名 */
      } /* 状态未变: 不记——禁止逐分钟重复 */
    });
  }

  function emit(key, type, cat, prev, c, isSp, temp, ztN, dtN, denN) {
    if (pend[key]) return; /* jl-1087: 在途抑制≠吞转换——写完成推进state后, 下次paint对该key按已推进state重评, 合法转换仍可补记 */
    var dist = {}, codes = c.codes || [];
    codes.forEach(function (cd) { var k = mcOf(cd) || "其他"; dist[k] = (dist[k] || 0) + 1; });
    var den = denN[c.t] || 0;
    var rec = {
      schema: SCHEMA, rule: RULE, at: new Date().toISOString(), day: stateDay,
      type: type, cat: cat, prev: prev == null ? null : prev, cur: c.per,
      tm: fmtTm(c.at), n: c.n || codes.length, codes: codes,
      mc: isSp ? "" : (c.hy || ""), mcDist: dist,
      conc: den > 0 ? Math.round((c.n / den) * 100) / 100 : null,
      temp: temp, ztN: ztN, dtN: dtN, key: key
    };
    wq.push({ rec: rec, key: key, cur: c.per, n: rec.n });
    pend[key] = 1; /* jl-1087: 决策通过即占位(进队列), 写回调统一清除 */
    pump();
  }

  /* ---------- 写队列: 写成功才推进状态 ---------- */
  function pump() {
    if (writing || !wq.length) return;
    if (!db || dead) { wq = []; pend = {}; return; } /* 无法落库: 丢弃待写(不推进状态→不产生半记录), 连带清占位防泄漏, 静默 */
    writing = true;
    var job = wq[0], done = false;
    function fin(ok) {
      if (done) return;
      done = true; writing = false; wq.shift();
      delete pend[job.key]; /* jl-1087: 四路统一清占位——add成功/失败/abort/try-catch异常全经fin, 缺一不可(泄漏=该key永久静默, 比双写更糟) */
      if (ok) { state[job.key] = { cur: job.cur, n: job.n }; stat.today++; stat.total++; refreshUI(); }
      pump();
    }
    try {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(job.rec);
      tx.oncomplete = function () { fin(true); };
      tx.onerror = function () { fin(false); };
      tx.onabort = function () { fin(false); };
    } catch (eT) { fin(false); }
  }

  /* ---------- B4 备份: 卡尾行注入(只新增, 不动现有DOM) ---------- */
  function ensureCss() {
    try {
      if (document.getElementById("jlelCss")) return;
      var st = document.createElement("style");
      st.id = "jlelCss";
      st.textContent = ".jlelBar{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0 2px;font-size:8.5px;color:rgba(255,255,255,.72);border-top:1px dashed #81e6d92e;flex-wrap:wrap}" +
        ".jlelB{font-size:8.5px;color:#81e6d9;border:1px solid #81e6d966;background:transparent;border-radius:6px;padding:2px 9px;cursor:pointer;font-family:inherit}" +
        ".jlelB:hover{background:#81e6d91a}";
      document.head.appendChild(st);
    } catch (eC) {}
  }
  function cntText() { return dead ? "事件日志 · 不可用" : "事件日志 · 今日" + stat.today + "条 · 共" + stat.total + "条(IndexedDB)"; }
  function refreshUI() {
    try {
      var el = document.querySelector(".jlelCnt");
      if (el) { var t = cntText(); if (el.textContent !== t) el.textContent = t; } /* 值变才写——textContent赋值必触发childList突变, 观察器在 subtree 上, 无条件重写=自激死循环(实测页面卡死根因) */
    } catch (eU2) {}
  }
  function injectUI() {
    try {
      var root = document.getElementById("jlv2root");
      if (!root) return;
      var sec = root.querySelector('section.jlv2[data-k="y"]');
      if (!sec) return;
      var body = sec.querySelector(".jbody");
      if (!body) return;
      if (body.querySelector(".jlelBar")) return; /* 已在(paint重绘被清则走下面重建); 计数刷新只由init/写成功/导入调refreshUI, 观察器路径不再触碰DOM */
      ensureCss();
      var bar = document.createElement("div");
      bar.className = "jlelBar";
      bar.innerHTML = '<span class="jlelCnt">' + esc(cntText()) + '</span><span style="display:flex;gap:6px"><button type="button" class="jlelB" data-a="exp">导出日志</button><button type="button" class="jlelB" data-a="imp">导入恢复</button></span>';
      var bE = bar.querySelector('[data-a="exp"]'), bI = bar.querySelector('[data-a="imp"]');
      bE.onclick = doExport; bI.onclick = doImport;
      body.appendChild(bar);
    } catch (eI) {}
  }
  function watchRoot() {
    try {
      var root = document.getElementById("jlv2root");
      if (!root) { setTimeout(watchRoot, 1500); return; }
      if (window.MutationObserver) { var mo = new MutationObserver(function () { injectUI(); }); mo.observe(root, { childList: true, subtree: true }); }
      injectUI();
    } catch (eW) {}
  }
  function doExport() { /* 导出全部日志为 JSON */
    try {
      readAll(function (recs) {
        if (recs == null) recs = [];
        var payload = { app: "jinlin", db: DB_NAME, schema: SCHEMA, rule: RULE, exportedAt: new Date().toISOString(), count: recs.length, records: recs };
        var blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "jinlin_evlog_" + today().replace(/-/g, "") + ".json";
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (eA) {} }, 1200);
      });
    } catch (eX) {}
  }
  function doImport() { /* 导入恢复: 按 key+at 去重, 逐条补录后重建状态 */
    try {
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json,application/json";
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var d = JSON.parse(fr.result);
            var recs = Array.isArray(d) ? d : (d && Array.isArray(d.records) ? d.records : []);
            if (!recs.length) return;
            readAll(function (exist) {
              var seen = {};
              (exist || []).forEach(function (r) { if (r && r.key != null) seen[r.key + "|" + r.at] = 1; });
              var adds = recs.filter(function (r) { return r && r.key != null && r.day && !seen[r.key + "|" + r.at]; });
              if (!adds.length) { init(); return; }
              var left = adds.length;
              function one() {
                if (!db || dead) { init(); return; }
                try {
                  var tx = db.transaction(STORE, "readwrite");
                  tx.objectStore(STORE).add(adds[adds.length - left]);
                  tx.oncomplete = tx.onerror = tx.onabort = function () { if (--left <= 0) init(); };
                } catch (eP2) { if (--left <= 0) init(); }
              }
              for (var i = 0; i < adds.length; i++) one(); /* 各自独立事务, 失败静默跳过 */
            });
          } catch (eJ) {}
        };
        fr.readAsText(f);
      };
      inp.click();
    } catch (eK) {}
  }

  openDB();
  watchRoot();
})();
