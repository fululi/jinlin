/* jl_sector_ff_snap.js — jl-1129 v0.84.74 T7-0 板块资金日快照层（独立文件 · 零侵入）
 * 依《② T7-0 schema v1 冻结书 2026-10-12》实施, 字段/通道/闸门/保留策略一律以冻结书为准, 本文件不得自行扩展字段。
 * 修正登记(均非schema级, 记录结构零改动): ①clist补ut参数(主应用同端点均携带, 模块原遗漏) ②zth锚点比对补YYYYMMDD格式
 *   ③(jl-1129热修, 2026-10-13晨盘前实测复现)回补盘前闸反转——原"9999-99-99"上限恒含当日, 盘中回补把当日累计值当终值写库并挡住盘后clist; 改为盘前仅允许d<今日。
 * 职责: 板块资金历史留档(当前站内仅当日缓存 jl_sector_ff_v1, 无任何历史)——供 T7 轮动/主线/资金迁移回看。
 * 存储: IndexedDB jinlin_secff / daily(主键d, 250交易日) + meta(板块代码表, 来自首次clist成功)。
 * 红线: ①零业务侵入——不代理不覆写产品钩子, 不改任何既有存储/显示, 只写自家IDB;
 *       ②字段冻结——rows 仅 {f12,f14,f62,f66,f84} 原始值, 接口自然序, 不预计算不派生不留预留;
 *       ③时间口径(口径五)——d=数据自身交易日, savedAt=保存时间, 二者显式分离, 请求时间不落库;
 *       ④成败位图——ok/err/nRows, 缺行=接口未返回(可重试), tc 缺=null;
 *       ⑤全程 try/catch 静默, IDB 不可用则整体休眠; 定时器仅 setInterval。
 * 主路闸(防qdate陷阱): 当日锚点(yd.date/pool.d0/zt_hist尾键/jlv2_snap.date==今天) 且 ≥15:05 且 当日无记录。
 *   无锚点不触发(假日/周末clist返上一交易日终值, 无锚点即无错挂); 隔日锚点过期不触发, 交回补路。
 * 回补路: 日历=单板块daykline f51序列(响应自带); 按板块86请求(每请求覆盖全部缺口日, 200ms节流);
 *   tc按日补拉getTopicZBPool(data.tc原值+qdate交叉校验); 板块表未建前回补不启用。
 * 修复条件: 记录缺失 / ok=0 / (src=dkbf且nRows<80) → 下次启动重试。
 * 调试钩: window.__JLT7__ = {v, st, get(d), days(), probeFetch()}(probeFetch越闸单次执行, 仅供验证)。
 * 回滚: 删除本文件挂载行即完全移除; jinlin_secff 库可整体删除, 无残留。 */
(function () {
  "use strict";
  if (window.__JLT7__) return; /* 双重加载保护 */
  var VER = "t7s2", DB_NAME = "jinlin_secff", DB_VER = 1, KEEP_D = 250, TICK_MS = 30 * 60e3;
  var P2 = "https://push2.eastmoney.com", P2D = "https://push2delay.eastmoney.com", P2X = "https://push2ex.eastmoney.com";
  var UT = "7eea3edcaed734bea9cbfc24409ed989";
  var CLIST_FIELDS = "f12,f14,f62,f66,f84"; /* 冻结书字段集(f3已裁决移除) */
  var DK_FIELDS2 = "f51,f52,f53,f56"; /* 冻结书对译: f51→d, f52→f62, f53→f84, f56→f66 */
  var st = { db: false, booted: false, clistTried: 0, clistOk: 0, bfTried: 0, bfOk: 0, lastErr: "", lastAt: "" };
  var db = null, busyClist = false, busyBf = false, _cbSeq = 0;

  function ymd() { return new Date().toLocaleDateString("sv-SE"); }
  function iso() { return new Date().toISOString(); }
  function hhmmNow() { var d = new Date(); return d.getHours() * 100 + d.getMinutes(); }
  function sleep(ms) { return new Promise(function (r) { var t = setInterval(function () { clearInterval(t); r(); }, ms); }); } /* 循evidence层惯例: 不用setTimeout */

  /* 自建JSONP(emJsonp同款思路, 不依赖页面内部函数) */
  function jsonp(url, timeout) {
    return new Promise(function (res) {
      var cb = "__jl_t7cb_" + (++_cbSeq) + "_" + Date.now();
      var s = document.createElement("script"), done = false;
      var fin = function (v) { if (done) return; done = true; try { delete window[cb]; } catch (e) {} try { s.remove(); } catch (e2) {} res(v); };
      window[cb] = function (d) { fin(d || null); };
      s.onerror = function () { fin(null); };
      var t = setInterval(function () { clearInterval(t); fin(null); }, timeout || 9e3);
      s.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + cb + "&_=" + Date.now();
      (document.head || document.documentElement).appendChild(s);
    });
  }

  /* ---------- IDB ---------- */
  function openDB() {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open(DB_NAME, DB_VER);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains("daily")) d.createObjectStore("daily", { keyPath: "d" });
          if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
        };
        rq.onsuccess = function () { db = rq.result; st.db = true; res(true); };
        rq.onerror = function () { res(false); };
        rq.onblocked = function () { res(false); };
      } catch (e) { res(false); }
    });
  }
  function idbRun(store, mode, fn) {
    return new Promise(function (res) {
      if (!db) { res(null); return; }
      try {
        var tx = db.transaction(store, mode), os = tx.objectStore(store), out = null;
        var rq = fn(os);
        tx.oncomplete = function () { res(rq && rq.result !== undefined ? rq.result : out); };
        tx.onerror = function () { res(null); };
        tx.onabort = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function put(rec) { return idbRun("daily", "readwrite", function (os) { return os.put(rec); }); }
  function getRec(d) { return idbRun("daily", "readonly", function (os) { return os.get(d); }); }
  function allRecs() { return idbRun("daily", "readonly", function (os) { return os.getAll(); }); }
  function allKeys() { return idbRun("daily", "readonly", function (os) { return os.getAllKeys(); }); }
  function getMeta() { return idbRun("meta", "readonly", function (os) { return os.get(1); }); }
  function putMeta(m) { return idbRun("meta", "readwrite", function (os) { return os.put(m); }); }
  function prune() {
    allKeys().then(function (ks) {
      try {
        if (!ks || ks.length <= KEEP_D) return;
        var del = ks.sort().slice(0, ks.length - KEEP_D);
        del.forEach(function (d) { idbRun("daily", "readwrite", function (os) { return os["delete"](d); }); });
      } catch (e) {}
    });
  }

  /* ---------- 当日锚点闸(冻结书§三.2) ---------- */
  function lsJ(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function anchorToday() {
    var t = ymd(), a = null;
    try { var y = lsJ("jinlin_yd_v1"); if (y && y.date === t) a = "yd"; } catch (e) {}
    if (!a) { try { var p = lsJ("jl_pool_v1"); if (p && (p.d0 === t || p.date === t)) a = "pool"; } catch (e2) {} }
    if (!a) { try { var z = lsJ("jl_zt_hist_v1"); var zk = z && Object.keys(z).sort(); if (zk && zk.length && (zk[zk.length - 1] === t || zk[zk.length - 1] === t.replace(/-/g, ""))) a = "zth"; } catch (e3) {} } /* 修正2(2026-10-12深夜): zt_hist键=POOLZT.date即qdate原值YYYYMMDD无连字符, 原仅比带连字符格式恒不匹配 */
    if (!a) { try { var s2 = lsJ("jlv2_snap_v1"); if (s2 && s2.date === t) a = "snap"; } catch (e4) {} }
    return a;
  }

  /* ---------- 抓取 ---------- */
  async function fetchClist() {
    var hosts = [P2, P2D], q = "/api/qt/clist/get?fid=f62&po=1&pz=100&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=" + CLIST_FIELDS + "&ut=" + UT; /* 修正1(2026-10-12深夜): 补ut——主应用全部clist均携带ut, 本模块原遗漏 */
    for (var i = 0; i < hosts.length; i++) {
      var d = await jsonp(hosts[i] + q);
      if (d && d.data && d.data.diff && d.data.diff.length) return d;
    }
    return null;
  }
  async function fetchZb(d8) {
    var d = await jsonp(P2X + "/getTopicZBPool?ut=" + UT + "&dpt=wz.ztzt&Pageindex=0&pagesize=10&sort=fbt%3Aasc&date=" + d8);
    if (!d || !d.data) return null;
    return { tc: (d.data.tc != null ? d.data.tc : null), qdate: d.data.qdate != null ? String(d.data.qdate) : null };
  }
  async function fetchDk(secid, lmt) {
    var d = await jsonp("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=" + secid + "&lmt=" + (lmt || 120) + "&klt=101&end=20500101&fields1=f1,f2,f3,f7&fields2=" + DK_FIELDS2);
    if (!d || !d.data || !d.data.klines) return null;
    return d.data;
  }

  /* ---------- 主路: 当日clist+tc ---------- */
  async function runDaily(force) {
    if (busyClist) return;
    var d0 = ymd();
    var gated = force || (hhmmNow() >= 1505);
    var anchor = anchorToday();
    if (!force && (!gated || !anchor)) return;
    if (!force) { var ex = await getRec(d0); if (ex && ex.ok) return; }
    busyClist = true; st.clistTried++;
    try {
      var rec = { d: d0, src: "clist", anchor: anchor, savedAt: iso(), ok: 0, err: null, nRows: 0, tc: null, rows: [] };
      var zb = await fetchZb(d0.replace(/-/g, ""));
      if (zb) {
        rec.tc = zb.tc;
        if (zb.qdate && zb.qdate !== d0.replace(/-/g, "")) rec.err = "zbqdate:" + zb.qdate; /* qdate交叉校验(冻结书§二) */
      }
      var c = await fetchClist();
      if (c && c.data.diff && c.data.diff.length) {
        rec.rows = c.data.diff.map(function (r) { return { f12: r.f12, f14: r.f14, f62: r.f62, f66: r.f66, f84: r.f84 }; });
        rec.nRows = rec.rows.length; rec.ok = 1; st.clistOk++;
        var m = await getMeta();
        if (!m || !m.boards || !m.boards.length || (m.boardsAt !== d0)) {
          /* 板块代码表: 仅在当日首次成功时刷新(冻结书§三.4: 来自clist成功响应) */
          await putMeta({ id: 1, initAt: (m && m.initAt) || iso(), ver: VER, boardsAt: d0, boards: rec.rows.map(function (r) { return { f12: r.f12, f14: r.f14 }; }) });
        }
      } else {
        rec.err = rec.err ? rec.err + "+clist:null" : "clist:null";
      }
      await put(rec);
      st.lastAt = iso(); st.lastErr = rec.err || "";
      busyClist = false;
      return rec;
    } catch (e) { st.lastErr = String(e && e.message || e); busyClist = false; return null; }
  }

  /* ---------- 回补路: daykline ---------- */
  function needHeal(rec, nBoards) {
    if (!rec) return true;
    if (!rec.ok) return true;
    if (rec.src === "dkbf" && rec.nRows < Math.max(40, nBoards - 6)) return true;
    return false;
  }
  async function runBackfill() {
    if (busyBf || !db) return;
    var meta = await getMeta();
    var boards = meta && meta.boards || [];
    if (!boards.length) return; /* 板块表未建前回补不启用(冻结书§三.4) */
    busyBf = true; st.bfTried++;
    try {
      var cal = await fetchDk("90." + boards[0].f12, 120); /* 日历基准=单板块f51序列 */
      if (!cal || !cal.klines || !cal.klines.length) { busyBf = false; return; }
      var calDates = cal.klines.map(function (k) { return String(k).split(",")[0]; });
      var t0 = ymd(), afterClose = hhmmNow() >= 1505; /* 修正3(jl-1129, 2026-10-13晨盘前实测复现): 原上限"9999-99-99"按字典序恒大于任何真实日期→盘前/盘中运行时当日入回补集, 把当日累计中值当终值写库(ok:1)并挡住盘后clist主路; 修正为盘前仅允许d<今日, 收盘后(≥15:05)方允许当日 */
      var recs = await allRecs();
      var byD = {}; (recs || []).forEach(function (r) { byD[r.d] = r; });
      var missing = calDates.filter(function (d) { return (d < t0 || (afterClose && d === t0)) && needHeal(byD[d], boards.length); });
      if (!missing.length) { busyBf = false; return; }
      var missSet = {}; missing.forEach(function (d) { missSet[d] = true; });
      var perD = {}; missing.forEach(function (d) { perD[d] = { rows: [], tc: null }; });
      for (var i = 0; i < boards.length; i++) {
        var b = boards[i];
        var data = (i === 0) ? cal : await fetchDk("90." + b.f12, 120); /* 首板块复用日历请求 */
        try {
          if (data && data.klines) data.klines.forEach(function (k) {
            var a = String(k).split(","), dd = a[0];
            if (!missSet[dd]) return;
            perD[dd].rows.push({ f12: b.f12, f14: data.name || b.f14, f62: +a[1] || null, f84: +a[2] || null, f66: +a[3] || null }); /* 冻结书对译 */
          });
        } catch (eK) {}
        await sleep(200); /* 86请求节流(冻结书§三.4) */
      }
      for (var j = 0; j < missing.length; j++) {
        var dd2 = missing[j], pd = perD[dd2];
        var zb = await fetchZb(dd2.replace(/-/g, ""));
        var err = null, tc = null;
        if (zb) { tc = zb.tc; if (zb.qdate && zb.qdate !== dd2.replace(/-/g, "")) err = "zbqdate:" + zb.qdate; }
        else err = "zb:null";
        var ok = pd.rows.length >= Math.max(40, boards.length - 6) ? 1 : 0;
        if (!ok) err = (err ? err + "+" : "") + "rows:" + pd.rows.length;
        await put({ d: dd2, src: "dkbf", anchor: null, savedAt: iso(), ok: ok, err: err, nRows: pd.rows.length, tc: tc, rows: pd.rows });
        if (ok) st.bfOk++;
      }
      st.lastAt = iso();
    } catch (e) { st.lastErr = String(e && e.message || e); }
    busyBf = false;
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    if (st.booted) return; st.booted = true;
    var ok = await openDB();
    if (!ok) return; /* IDB不可用整体休眠(文件头红线⑤) */
    prune();
    try { await runDaily(false); } catch (e) {}
    try { await runBackfill(); } catch (e) {}
    setInterval(function () { try { runDaily(false); } catch (e) {} try { runBackfill(); } catch (e2) {} }, TICK_MS);
  }

  /* ---------- API(只读+调试) ---------- */
  window.__JLT7__ = {
    v: VER, st: st,
    get: function (d) { return getRec(d); },
    days: function () { return allKeys(); },
    probeFetch: function () { return runDaily(true); } /* 越闸单次执行, 仅供验证 */
  };
  boot();
})();
