/* jl_evidence.js — T4c/T7r 证据链改造 · 第一增量(ev1)
 * 依《T4c_T7r_stage2_implementation_plan.md》冻结单(2026-10-10)实施; append-only 证据留存, 不参与业务计算。
 * 边界: 零依赖/零网络/零UI; 只读 window.__JLSEC__ 内存态; 不开 jinlin_secstr / jinlin_evlog 事务; 不代理不覆写产品钩子。
 * 定时器: 仅 setInterval(冻结单§2); 延迟动作用 setInterval 一次性自清模式实现, 不用 setTimeout。
 * 回滚: 删除本文件挂载行即完全移除; jinlin_evidence 库可整体删除, 无残留。 */
(function () {
  "use strict";
  if (window.__JLEV__) return; /* 双重加载保护(同产品 __JLEVLOG_INSTALLED__ 惯例) */

  var DB_NAME = "jinlin_evidence", DB_VER = 1, OBS_MS = 60e3, EV_VER = "ev1"; /* 冻结常量, 不得改(§9.2) */
  var db = null, open_ = false, metaCache = null, covN = 0, provN = 0, framesN = 0;
  var tickCount = 0, lastTickAt = 0, seqDay = "", seqNext = 0, prevKeys = null, pending = {}, putFail = false;

  function later(fn, ms) { /* 仅用 setInterval 的一次性延迟(遵守§9.8 定时器限制) */
    var t = setInterval(function () { clearInterval(t); try { fn(); } catch (e) {} }, ms);
  }
  function bjDay(t) { return new Date(t + 8 * 3600e3).toISOString().slice(0, 10); } /* 北京日期, 与时区无关 */
  function ruleOf(S) { try { return (S && S.last && S.last.recs && S.last.recs[0] && S.last.recs[0].rule) || "unknown"; } catch (e) { return "unknown"; } }
  function fnv1a32(s) { /* 冻结单§4规格: FNV-1a 32位, UTF-8逐字节, 输出8位hex小写(验收端离线可复算) */
    var h = 0x811c9dc5, b = unescape(encodeURIComponent(String(s))), i;
    for (i = 0; i < b.length; i++) { h ^= b.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function add(store, rec, done) {
    try {
      var rq = db.transaction(store, "readwrite").objectStore(store).add(rec);
      rq.onsuccess = function () { done && done(true); };
      rq.onerror = function () { done && done(false); };
    } catch (e) { done && done(false); }
  }

  /* E0: meta 幂等首写——meta空则写initAt, 之后永不覆写(写后停查) */
  function ensureMeta(S) {
    if (metaCache || !open_) return;
    try {
      var g = db.transaction("meta", "readonly").objectStore("meta").get(1);
      g.onsuccess = function () {
        if (g.result) { metaCache = g.result; return; }
        var m = { id: 1, initAt: new Date().toISOString(), evidenceVersion: EV_VER, productRule: ruleOf(S), note: "append-only 证据留存；不参与业务计算" };
        try {
          var w = db.transaction("meta", "readwrite").objectStore("meta").put(m);
          w.onsuccess = function () { metaCache = m; };
        } catch (e) {}
      };
    } catch (e) {}
  }

  /* 观察周期: E1心跳每周期必写; E2仅产品态就绪时写(冻结单§5时序表) */
  function tick() {
    var now = Date.now(), day = bjDay(now), J = null, S = null;
    try { J = window.__JLSEC__ || null; S = J ? J.S : null; } catch (e) {}
    tickCount++; lastTickAt = now;
    ensureMeta(S);
    var t3 = (S && S.lastT3) || [];
    var visible = (typeof document !== "undefined" && document.visibilityState === "visible");
    var active = !!(visible && J && S && S.day === day && S.last); /* 三条件(冻结单§4 E1) */
    var reason = "";
    if (putFail) reason = "db_error"; /* 冻结单§5: put失败→下一tick记db_error, 不静默 */
    else if (!active) reason = !visible ? "page_hidden" : (!J ? "hook_missing" : "no_data"); /* 优先级 hidden>no_data>hook_missing */
    var t3max = 0;
    try { for (var i = 0; i < t3.length; i++) { var p = Date.parse((t3[i] && t3[i].at) || "") || 0; if (p > t3max) t3max = p; } } catch (e) {}
    var e1 = { day: day, seq: 0, at: now, active: active, reason: reason,
      t3recN: (t3 && t3.length) || 0, t3AtMax: t3max,
      snapKeysN: (S && S.keys && S.keys.size) || 0, sourceVersion: ruleOf(S) };
    if (seqDay !== day) { /* 跨日/会话首tick: 自DB续接当日seq, 保持同日单调(刷新不重位, B6/C3) */
      seqDay = day; seqNext = 1;
      try {
        var rq = db.transaction("cov", "readonly").objectStore("cov").index("by-day").getAll(day);
        rq.onsuccess = function () { var mx = 0, a = rq.result || []; for (var j = 0; j < a.length; j++) if (a[j].seq > mx) mx = a[j].seq; seqNext = mx + 1; commit(); };
        rq.onerror = function () { commit(); };
        return;
      } catch (e) {}
    }
    commit();

    function commit() {
      e1.seq = seqNext++;
      add("cov", e1, function (ok) { putFail = !ok; if (ok) covN++; });
      if (J && S && S.db && S.keys && S.day && J.CORE) { /* E2写入门(冻结单§5; 门控字段按v1.1: S.open系UI折叠开关, 就绪契约=S.db&&S.keys 同persistAsync L225) */
        var mn = 0, mx = 0, im = 0, ids = [];
        try {
          for (var i = 0; i < t3.length; i++) {
            var p = Date.parse((t3[i] && t3[i].at) || "") || 0;
            if (p) { if (!mn || p < mn) mn = p; if (p > mx) mx = p; }
            if (t3[i] && +t3[i].id > im) im = +t3[i].id;
            if (t3[i] && t3[i].id != null) ids.push(t3[i].id);
          }
        } catch (e) {}
        ids.sort(function (a, b) { return a - b; });
        var bid = S.day + "|" + J.CORE.bucket(S.at); /* 与snap主键k前缀一致, 30分钟网格(§4 E2) */
        var cur = [];
        try { if (S.keys) cur = Array.from(S.keys); } catch (e) {}
        if (prevKeys) { /* 与上一观察基线diff, 按桶前缀分桶; 跨桶新增留待各自桶下一条prov(不丢帧) */
          cur.forEach(function (k) { if (prevKeys.indexOf(k) < 0) { var b = String(k).split("|").slice(0, 2).join("|"); pending[b] = (pending[b] || 0) + 1; } });
        }
        var fw = pending[bid] || 0; if (pending[bid] != null) delete pending[bid];
        var e2 = { day: day, bucketId: bid, at: now, productAt: +S.at || 0, inputDay: S.day, inputCount: (t3 && t3.length) || 0,
          sourceRange: { t3AtMin: mn, t3AtMax: mx, t3IdMax: im, t3Fingerprint: fnv1a32(ids.join(",")) },
          framesWritten: fw, bucketState: fw > 0 ? "first" : "locked", sourceVersion: ruleOf(S) };
        add("prov", e2, function (ok) { if (ok) provN++; });
        prevKeys = cur;
      }
    }
  }

  /* 导出: 四store原样倾倒, 零聚合/零过滤/零排序(冻结单§6); frames恒为留存原状(第一版空) */
  function exportJSON() {
    if (!open_) { console.warn("[JLEV] db not open"); return; }
    var got = { meta: [], cov: [], prov: [], frames: [] }, left = 4;
    Object.keys(got).forEach(function (n) {
      try {
        var rq = db.transaction(n, "readonly").objectStore(n).getAll();
        rq.onsuccess = function () { got[n] = rq.result || []; if (--left === 0) ship(); };
        rq.onerror = function () { if (--left === 0) ship(); };
      } catch (e) { if (--left === 0) ship(); }
    });
    function ship() {
      var env = { app: "jinlin", db: DB_NAME, schema: 1, evidenceVersion: EV_VER, exportedAt: new Date().toISOString(),
        meta: (got.meta && got.meta[0]) || null, coverage: got.cov, compute: got.prov, frames: got.frames };
      var txt = JSON.stringify(env), day = bjDay(Date.now()), b = new Blob([txt]);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "evidence_export_" + day + ".json";
      a.click(); /* 不挂DOM, 触发下载即弃 */
      later(function () { URL.revokeObjectURL(a.href); }, 0);
      console.log("[JLEV] evidence_export_" + day + ".json | " + b.size + " bytes"); /* v1.1变更3: 真实字节数 */
    }
  }

  function diag() { /* 键集恰九枚(冻结单§7 B3) */
    return { db: DB_NAME, open: open_, evidenceVersion: EV_VER, initAt: metaCache ? metaCache.initAt : null,
      covCount: covN, provCount: provN, framesCount: framesN, lastTickAt: lastTickAt, tickCount: tickCount };
  }

  /* 启动: open成功→立即首tick→setInterval; 失败→warn+60s重试, 断口如实呈现不补录(冻结单§5) */
  function boot() {
    try {
      var rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function (e) { /* 4 store一次建齐; 升级须走冻结单v1.1 */
        var d = e.target.result;
        d.createObjectStore("meta", { keyPath: "id" });
        d.createObjectStore("cov", { autoIncrement: true }).createIndex("by-day", "day");
        d.createObjectStore("prov", { autoIncrement: true }).createIndex("by-bucket", ["day", "bucketId"]);
        d.createObjectStore("frames", { keyPath: ["k", "seq"] });
      };
      rq.onsuccess = function () {
        db = rq.result; open_ = true;
        db.onclose = function () { open_ = false; };
        [["cov", "covN"], ["prov", "provN"], ["frames", "framesN"]].forEach(function (p) { /* 会话启动自DB取计数, 刷新不清零(diag如实) */
          try { var c = db.transaction(p[0], "readonly").objectStore(p[0]).count(); c.onsuccess = function () { if (p[0] === "cov") covN = c.result || 0; else if (p[0] === "prov") provN = c.result || 0; else framesN = c.result || 0; }; } catch (e) {}
        });
        tick(); setInterval(tick, OBS_MS);
      };
      rq.onerror = function () { console.warn("[JLEV] open fail, retry in 60s"); later(boot, OBS_MS); };
    } catch (e) { console.warn("[JLEV] open threw, retry in 60s"); later(boot, OBS_MS); }
  }

  window.__JLEV__ = { diag: diag, export: exportJSON }; /* 调试钩, 键集恰两枚(冻结单§2) */
  boot();
})();
