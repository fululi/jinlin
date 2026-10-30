/* jl_sector_strength.js — jl-1094 v0.84.39 T4a第一阶段: 可解释板块强度基础层(独立新文件)
   外部JS视觉批 jl-B(2026-10-11, 只动浏览器层渲染, CORE计算/IDB/口径零触碰):
   ①根卡墨绿(rgba(10,26,34,.72)+#81e6d9绿描边)退场→持仓页白玻璃同族(145°白渐变+blur(2px)saturate(160%)brightness(1.08)+白.5描边+inset白高光/外投影族) ②开发术语人话化: "mtemp rows缺失"→"暂无强度数据", "无mtemp"→"暂无数据", 无涨幅数据的板块多卡"数据缺失"小块→合并一行 ③小灰字→白亮两色(数值.95/元信息.78), 红色逻辑#ff8b8f→亮红#ff5459, 卡标题#81e6d9→白 ④大K线图表背景: 评估结论=不属本文件(ks.html体系, v0.84.54已改深蓝香槟金), 本文件无图表对象
   jl-C批次(2026-10-11, 用户四点要求, 依旧只动渲染/交互层, CORE计算/IDB/口径/数据零触碰):
     ①挂载根修: body尾部(被甩到页面最底·导航之下·浏览器栏遮半截)→挂进.phone玻璃抽屉, absolute bottom=54对齐底部tab新高度(index.html jl-1114同步改), z=33(nav30之上/picker·news遮罩面板35/36之下, 弹层仍可盖抽屉)
     ②交互: 底部玻璃抽屉——手柄(拖条+标题+数据时点)常驻tab上方32px, 点按开合/上拉下滑手势(位移>28px或速度>0.45px/ms判向, 小抖动回弹), 开合=max-height裁剪动画(32px↔min(58vh,520px)), 内容区内滚+滚动位置跨刷新保留
     ③文字: 灰字rgba(255,255,255,.78)全→亮白.95+加粗(600-700), 红维持亮红#ff5459(A股红涨), 标题去"v0(T4a)"开发后缀
     ④prefers-reduced-motion: 过渡关闭; 老浏览器无PointerEvent回落click
   基准: jinlin_clone@7ba89e8 (v0.84.38已推送)
   红线遵守: 零新增网络请求(纯消费现有缓存与既有IDB); 不改jlv2聚簇/不改T3任何语义(只读jinlin_evlog); 不接龙池/不改资格排序资金universe扫描频率假期规则
   口径(钉死, B组键序): 主概念mc(__JL_CONCEPTS__.map.mc) → 二级行业sec(__JL_SECTORS__.map) → hy(hybk剥ⅠⅡⅢ)兜底; "其他"剔除; 三级全缺=无归属(不进板块表, 计入tierStat.unattr)
   四因子(公式照抄, 只换分组键):
     ①涨幅 avg = Σpct/n  ②上涨率 upR = up/n  —— jl-1080原式(mtemp rows + n<8不参评, mc粒度下滤掉更多小板块=预期)
     ③涨停数 = jinlin_yd_v1.zt.pool × 口径链归属计数(候选数据: c/n/lbc/fund, 不评分)
     ④事件扩散 = T3 IDB(jinlin_evlog/ev)当日记录聚合【定义: 成分股并集codeN为主口径, recN记录条数+memPeak峰值同时保存; bk记录按r.mc归属, sp记录无mc按mcDist主导概念归属】——只消费T3已确认结果, 零重算jlv2聚簇
   硬状态: 成交额变化=数据不足(禁止市场级/涨停股额替代) · 龙头强度=待定义(仅候选, 定义留T4b)
   快照: 独立IDB jinlin_secstr/snap, 主键 k=day|atBucket(30分钟桶)|sector——重复时间点不重复写; 保留策略=90天对齐温度史+12000条上限保护(boot时按day前缀清理, 失败静默)
   挂载: body尾部独立卡(jlv2页板块卡同区域); 调试钩 window.__JLSEC__={CORE,S,compute,exportJSON,diag} (金粲惯例) */
(function (global) {
  "use strict";

  /* ============ 纯核心(Node测试可达, 零DOM/IDB依赖) ============ */
  var CORE = {
    SCHEMA: "t4a_v2", RULE: "r2", CAL: "mc>sec>hy", MIN_N: 8, UNATTR: "（未归属·个股扩散）",
    BUCKET_MS: 1800e3, /* 快照写入门限: 30分钟桶 */

    /* 口径归属: 一票一板块; 返回 {name, tier}: tier∈mc|sec|hy|""(无归属) */
    sectorOf: function (code, ctx, hy) {
      code = String(code == null ? "" : code);
      var m = ctx && ctx.con && ctx.con[code];
      if (m && m.mc) return { name: m.mc, tier: "mc" };
      var s = ctx && ctx.sec && ctx.sec[code];
      if (s) return { name: String(s), tier: "sec" };
      if (hy != null && hy !== "") {
        var h = String(hy).replace(/[ⅠⅡⅢ]+$/, "");
        if (h) return { name: h, tier: "hy" };
      }
      return { name: "", tier: "" };
    },

    /* 涨幅/上涨率聚合——公式照抄 jl-1080 calcHotSector(n/up/s三员组+n<8外层过滤), 分组键=T4a口径链 */
    aggRows: function (rows, ctx) {
      var agg = {};
      for (var i = 0; i < (rows || []).length; i++) {
        var r = rows[i];
        var o0 = CORE.sectorOf(r[0], ctx);
        if (!o0.name || o0.name === "其他") continue;
        var o = agg[o0.name] || (agg[o0.name] = { n: 0, up: 0, s: 0, fb: { mc: 0, sec: 0, hy: 0 } });
        var p = +r[1] || 0;
        o.n++; if (p > 0) o.up++; o.s += p; o.fb[o0.tier]++;
      }
      return agg;
    },

    /* 涨停池聚合: jinlin_yd_v1.zt.pool rows × 口径链(行自带hy兜底) */
    aggZt: function (pool, ctx) {
      var agg = {};
      (pool || []).forEach(function (r) {
        if (!r) return;
        var o0 = CORE.sectorOf(r.c, ctx, r.hy);
        if (!o0.name || o0.name === "其他") return;
        var o = agg[o0.name] || (agg[o0.name] = { ztN: 0, lb: 0, cand: [], fb: { mc: 0, sec: 0, hy: 0 } });
        o.ztN++; o.lb = Math.max(o.lb, +r.lbc || 0); o.fb[o0.tier]++;
        o.cand.push({ c: String(r.c), n: String(r.n || ""), lbc: +r.lbc || 0, fund: +r.fund || 0, zbc: +r.zbc || 0, fbt: r.fbt });
      });
      return agg;
    },

    /* T3记录归属: bk记录按r.mc; sp记录(无mc)按mcDist主导概念——确定性规则, 同输入同输出 */
    sectorOfT3: function (r) { return r && r.mc ? String(r.mc) : ""; }, /* v0保守: 仅bk记录r.mc归属; sp无mc=未归属(不推归属, mcDist原文保留) */

    /* 事件扩散=T3 IDB当日记录聚合(零重算): {板块: {recN条数, codeN成分股并集, memPeak峰值n}}; sp无mc→(未归属·个股扩散)桶+mcDist原文, 不猜测 */
    evFromT3: function (recs, day) {
      var out = {}, un = { recN: 0, codeN: 0, memPeak: 0, mcDistRaw: [], _c: {} };
      (recs || []).forEach(function (r) {
        if (!r || (day != null && String(r.day) !== String(day))) return;
        var sy = CORE.sectorOfT3(r);
        if (!sy) {
          un.recN++; un.memPeak = Math.max(un.memPeak, +r.n || 0);
          if (r.mcDist && typeof r.mcDist === "object") un.mcDistRaw.push(r.mcDist); /* 原文保留, 上限50 */
          (r.codes || []).forEach(function (c) { un._c[c] = 1; });
          return;
        }
        var o = out[sy] || (out[sy] = { recN: 0, codeN: 0, memPeak: 0, _c: {} });
        o.recN++; o.memPeak = Math.max(o.memPeak, +r.n || 0);
        (r.codes || []).forEach(function (c) { o._c[c] = 1; });
      });
      Object.keys(out).forEach(function (k) { out[k].codeN = Object.keys(out[k]._c).length; delete out[k]._c; });
      if (un.recN > 0) { un.codeN = Object.keys(un._c).length; delete un._c; if (un.mcDistRaw.length > 50) un.mcDistRaw = un.mcDistRaw.slice(0, 50); out[CORE.UNATTR] = un; }
      return out;
    },

    /* 快照装配: 输入全部来自数据源(day/at为数据时间, 非墙钟) → {recs, ranked, tierStat} */
    buildSnap: function (inp) {
      var ctx = inp.ctx, minN = inp.minN || CORE.MIN_N;
      var agg = CORE.aggRows(inp.rows, ctx);
      var zt = CORE.aggZt(inp.ztPool, ctx);
      var ev = CORE.evFromT3(inp.t3recs, inp.day);
      var tierStat = { mc: 0, sec: 0, hy: 0, unattr: 0 };
      (inp.rows || []).forEach(function (r) { var t = CORE.sectorOf(r[0], ctx).tier; if (t) tierStat[t]++; else tierStat.unattr++; });
      (inp.ztPool || []).forEach(function (r) { if (!r) return; var t = CORE.sectorOf(r.c, ctx, r.hy).tier; if (t) tierStat[t]++; else tierStat.unattr++; });

      var sectors = {};
      Object.keys(agg).forEach(function (k) { sectors[k] = 1; });
      Object.keys(zt).forEach(function (k) { sectors[k] = 1; });
      Object.keys(ev).forEach(function (k) { sectors[k] = 1; });

      var recs = [], ranked = [];
      Object.keys(sectors).sort().forEach(function (sy) {
        var a = agg[sy] || null, z = zt[sy] || null, e = ev[sy] || null;
        var fb = { mc: (a ? a.fb.mc : 0) + (z ? z.fb.mc : 0), sec: (a ? a.fb.sec : 0) + (z ? z.fb.sec : 0), hy: (a ? a.fb.hy : 0) + (z ? z.fb.hy : 0) };
        var tier = sy === CORE.UNATTR ? "—" : (fb.mc >= fb.sec && fb.mc >= fb.hy ? "mc" : (fb.sec >= fb.hy ? "sec" : "hy"));
        var hasRows = !!inp.rows;
        var fAvg = a ? (a.n < minN ? { raw: null, state: "smallN", note: "样本" + a.n + "<" + minN + "(n<8不参评)" }
                                  : { raw: Math.round((a.s / a.n) * 1e4) / 1e4, state: "ok", note: "n=" + a.n })
                     : (inp.rowsStale ? { raw: null, state: "stale", note: "逐股rows非当日(" + inp.rowsStale + ")" } : { raw: null, state: "miss", note: hasRows ? "板块样本不在mtemp口径覆盖" : "mtemp rows缺失" });
        var fUpR = a ? (a.n < minN ? { raw: null, state: "smallN", note: "样本" + a.n + "<" + minN }
                                    : { raw: Math.round((a.up / a.n) * 1e4) / 1e4, state: "ok", note: "up=" + a.up + "/n=" + a.n })
                     : (inp.rowsStale ? { raw: null, state: "stale", note: "逐股rows非当日(" + inp.rowsStale + ")" } : { raw: null, state: "miss", note: hasRows ? "板块样本不在mtemp口径覆盖" : "mtemp rows缺失" });
        var fZt = z ? { raw: z.ztN, state: "ok", note: "lb=" + z.lb } : (inp.ztStale ? { raw: null, state: "stale", note: "涨停池非当日(" + inp.ztStale + ")" } : { raw: null, state: "none", note: "当日涨停池无该板块成员" }); /* jl-B1-S3: 非当日源=stale, 不冒充"无" */
        var fEv = e ? { raw: (e.mcDistRaw ? { codeN: e.codeN, recN: e.recN, memPeak: e.memPeak, mcDistRaw: e.mcDistRaw } : { codeN: e.codeN, recN: e.recN, memPeak: e.memPeak }), state: "ok", note: e.mcDistRaw ? "sp未归属" + e.recN + "条·mcDist原文保留" : "T3记录" + e.recN + "条·并集" + e.codeN + "股" }
                    : { raw: null, state: "none", note: "当日T3无该板块记录" };
        var cand = z ? z.cand.slice().sort(function (x, y) { return (y.lbc - x.lbc) || (y.fund - x.fund); }).slice(0, 3) : [];
        var rec = {
          schema: CORE.SCHEMA, rule: CORE.RULE, day: inp.day, at: inp.at, kb: CORE.bucket(inp.at),
          cal: CORE.CAL, sector: sy, sectorTier: tier, fallback: fb,
          factors: { /* 仅四因子, 各含 raw原始值/state数据状态/note缺失原因/src来源(均有当前实际语义); 无std(标准化未定)无dir(存储层无方向计算逻辑, 展示层箭头由raw符号现算) */
            avgPct: { raw: fAvg.raw, state: fAvg.state, note: fAvg.note, src: "mtemp" },
            upR: { raw: fUpR.raw, state: fUpR.state, note: fUpR.note, src: "mtemp" },
            ztN: { raw: fZt.raw, state: fZt.state, note: fZt.note, src: "yd.zt" },
            evN: { raw: fEv.raw, state: fEv.state, note: fEv.note, src: "t3_idb" }
          },
          /* leaderCand=已整理候选数据, 非当前评分因子(定义留T4b): 通道现有c/n/lbc/fund/zbc/fbt六字段(hs/amount不在yd.zt.pool通道, 不伪装); C组成员留存于T3记录/未归属桶 */
          leaderCand: { cand: cand, src: "yd.zt.pool", nonFactor: true, note: "非因子·候选数据(龙头定义留T4b)" },
          mid: { rank: null, rankBy: "avgPct:desc" }, /* rank: 按涨幅原始值avgPct降序名次(排序键=avgPct原始值, 方向=降序, 理由=强度直觉且透明可解释); scoreParts已删(无当前内容) */
          srcVer: { mtempAt: inp.at, ydDate: inp.ydDate || null, jlv2: "v10", t3: "v0.84.32", cal: CORE.CAL }
        };
        rec.k = CORE.snapKey(rec);
        recs.push(rec);
        if (fAvg.state === "ok") ranked.push(rec);
      });
      ranked.sort(function (x, y) { return y.factors.avgPct.raw - x.factors.avgPct.raw; });
      ranked.forEach(function (r, i) { r.mid.rank = i + 1; });
      return { recs: recs, ranked: ranked, tierStat: tierStat };
    },

    bucket: function (at) { return Math.floor((+at || 0) / CORE.BUCKET_MS) * CORE.BUCKET_MS; },
    snapKey: function (r) { return r.day + "|" + r.kb + "|" + r.sector; },

    /* 快照落库(store契约: has(k)同步/add(rec)同步或排队) → {added, skipped}: 重复时间点不重复写 */
    persist: function (recs, store) {
      var added = 0, skipped = 0;
      (recs || []).forEach(function (r) {
        try {
          if (store.has(r.k)) { skipped++; return; }
          store.add(r); added++;
        } catch (e) { skipped++; }
      });
      return { added: added, skipped: skipped };
    }
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = CORE; }

  /* ============ 浏览器层(独立IDB/只读T3/透明卡) ============ */
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var S = { db: null, keys: null, day: null, at: null, last: null, stat: null, open: false, lastT3: null };
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmtPct(v) { return (v >= 0 ? "+" : "") + (Math.round(v * 100) / 100).toFixed(2) + "%"; }
  function fmtYi(v) { return (v / 1e8).toFixed(2) + "亿"; }
  function localDay(ms) { return new Date(ms).toLocaleDateString("sv-SE"); } /* jl-B1-S4: 本地(北京)日期, 不用UTC */
  function normDay(v) { var x = String(v || "").slice(0, 10); return /^\d{8}$/.test(x) ? x.slice(0, 4) + "-" + x.slice(4, 6) + "-" + x.slice(6, 8) : (/^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ""); }

  function openDB() {
    try {
      var rq = indexedDB.open("jinlin_secstr", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("snap", { keyPath: "k" }); } catch (e) {} };
      rq.onsuccess = function () {
        S.db = rq.result;
        S.db.onversionchange = function () { try { S.db.close(); } catch (e) {} S.db = null; };
        try {
          var tx = S.db.transaction("snap", "readonly");
          var g = tx.objectStore("snap").getAllKeys();
          g.onsuccess = function () { S.keys = new Set(g.result || []); prune90(); };
          g.onerror = function () { S.keys = new Set(); };
        } catch (e) { S.keys = new Set(); }
      };
      rq.onerror = function () { S.db = null; };
    } catch (e) { S.db = null; }
  }

  /* 保留策略: 90天(对齐jlv2_temp_hist_v1温度史语义) + 12000条上限保护; day字符串字典序=主键前缀, 按前缀范围清理 */
  function prune90() {
    try {
      if (!S.db || !S.keys) return;
      var cut = localDay(Date.now() - 90 * 864e5); /* jl-B1-S4 */
      var del = [], cap = 12000;
      S.keys.forEach(function (k) { if (String(k).slice(0, 10) < cut) del.push(k); });
      var overflow = S.keys.size - del.length - cap;
      if (overflow > 0) {
        var rest = Array.from(S.keys).filter(function (k) { return String(k).slice(0, 10) >= cut; }).sort();
        del = del.concat(rest.slice(0, overflow));
      }
      if (!del.length) return;
      var tx = S.db.transaction("snap", "readwrite");
      var st = tx.objectStore("snap");
      del.forEach(function (k) { try { st.delete(k); S.keys.delete(k); } catch (e) {} });
    } catch (e) {}
  }

  /* 只读T3 IDB(jinlin_evlog): 零改T3, 仅当日记录 */
  function readT3(day, cb) {
    var fin = function (recs) { try { cb(recs || []); } catch (e) { cb([]); } };
    try {
      var rq = indexedDB.open("jinlin_evlog");
      rq.onsuccess = function () {
        var db = rq.result;
        try {
          var g = db.transaction("ev", "readonly").objectStore("ev").getAll();
          g.onsuccess = function () {
            var recs = (g.result || []).filter(function (r) { return r && String(r.day) === String(day); });
            try { db.close(); } catch (e) {}
            fin(recs);
          };
          g.onerror = function () { try { db.close(); } catch (e) {} fin([]); };
        } catch (e) { try { db.close(); } catch (e2) {} fin([]); }
      };
      rq.onerror = function () { fin([]); };
    } catch (e) { fin([]); }
  }

  function persistAsync(recs) {
    if (!S.db || !S.keys) return;
    CORE.persist(recs, {
      has: function (k) { return S.keys.has(k); },
      add: function (r) {
        S.keys.add(r.k);
        try {
          var tx = S.db.transaction("snap", "readwrite");
          var rq = tx.objectStore("snap").add(r);
          rq.onerror = function () { try { S.keys.delete(r.k); } catch (e) {} }; /* 写失败回滚键集, 下轮重试 */
        } catch (e) { try { S.keys.delete(r.k); } catch (e2) {} }
      }
    });
  }

  /* ============ 计算 ============ */
  function compute() {
    try {
      var mt = lsGet("jinlin_mtemp_v1");
      var yd = lsGet("jinlin_yd_v1");
      /* jl-B1-S3/S4/S5 (2026-10-29): 按数据所属交易日逐源核日期——原 day=yd.date(异动缓存日, 不开首页异动视图就停旧日)把整屉钉在旧日,
         且兜底用 toISOString(UTC, 北京08:00前少一天)。现: day=快照交易日(mtemp.data.td, f124口径, 周末=上周五)→jlv2 curTd→本地日期;
         rows/涨停池/T3 各自核对, 非当日不计入并在抽屉标明; 任一源非当日本轮不写快照(防旧日+今天30分桶污染快照库) */
      var md = mt && mt.data || null;
      var _pv0 = lsGet("jlv2_pool_v1"), _pvD0 = normDay(_pv0 && _pv0.qd || ""); /* jl-B2-G2: 快照没采到(风控/夜间)时, 以涨停池自报交易日为次选, 再退墙钟 */
      var day = (md && /^\d{4}-\d{2}-\d{2}$/.test(String(md.td || "")) && md.td) || _pvD0 || (typeof window.__JLV2TD__ === "function" ? (function () { try { return window.__JLV2TD__(); } catch (e) { return ""; } })() : "") || localDay(Date.now());
      var dayFromData = !!(md && md.td === day);
      var rowsTd = md && md.rowsTd || "";
      var rows = md && md.rows && rowsTd === day ? md.rows : null;
      var rowsStale = !!(md && md.rows && rowsTd !== day) ? (rowsTd || "未标日") : "";
      var at = 0;
      var _dtt = md && md.time;
      if (md && md.td === day && _dtt && /^\d{1,2}:\d{2}$/.test(String(_dtt))) { var _hp = String(_dtt).split(":"); at = new Date(day + "T00:00:00").setHours(+_hp[0], +_hp[1], 0, 0); } /* 时分拼在数据交易日上, 不再拼到墙钟今天(原跨天错位) */
      else if (mt && +mt.at && localDay(+mt.at) === day) at = +mt.at;
      /* jl-B2-G2: 涨停池优先读温度v2自建池(jlv2_pool_v1: 当日查询·200只·已剔ST), 与温度卡"涨停数量"同一份; 没有或非当日再退回异动卡池(50只·含ST) */
      var pv = lsGet("jlv2_pool_v1"), pvD = normDay(pv && pv.qd || ""), pvRows = pv && pv.zt && pv.zt.rows;
      var ztSrc = "", ztD = "", ztPool = [], ztStale = "";
      if (pvRows && pvD === day) { ztSrc = "v2"; ztD = pvD; ztPool = pvRows; }
      else {
        var ydD = normDay(yd && yd.zt && yd.zt.date || "");
        if (yd && yd.zt && yd.zt.pool && ydD === day) { ztSrc = "yd"; ztD = ydD; ztPool = yd.zt.pool; }
        else if (yd && yd.zt && yd.zt.pool) ztStale = ydD || "未标日";
        else if (pvRows) ztStale = pvD || "未标日";
      }
      var ctx = {
        con: (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {},
        sec: (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {}
      };
      readT3(day, function (t3recs) {
        S.lastT3 = t3recs;
        if (!at && t3recs.length) {
          for (var i = 0; i < t3recs.length; i++) at = Math.max(at, Date.parse(t3recs[i].at || "") || 0);
        }
        var out = CORE.buildSnap({ day: day, at: at, rows: rows, ztPool: ztPool, t3recs: t3recs, ctx: ctx, ydDate: yd && yd.date, rowsStale: rowsStale, ztStale: ztStale });
        S.day = day; S.at = at; S.last = out; S.stat = out.tierStat; S.stale = { rows: rowsStale, zt: ztStale }; S.ztSrc = ztSrc;
        if (dayFromData && !rowsStale && !ztStale && (rows || ztPool.length || t3recs.length)) persistAsync(out.recs); /* S5: 混日不落库; 交易日来自兜底(无快照td)也不落库——夜间墙钟日≠数据交易日 */
        paint();
      });
    } catch (e) { S.last = null; paint(); }
  }

  /* ============ 渲染: 底部玻璃抽屉(jl-C: body尾卡→挂.phone, bottom对齐底部tab54px; CSS自注入) ============ */
  var ROOT = null;
  var DRAG = { on: false, y0: 0, dy: 0, t0: 0 }; /* jl-C: 手柄拖拽态, paint()拖拽中跳过防DOM重建丢监听 */
  var JSEC_CSS = "#jlsectroot{position:absolute;left:8px;right:8px;bottom:54px;z-index:33;overflow:hidden;pointer-events:none;max-height:22px;transition:max-height .34s cubic-bezier(.32,.72,.28,1);border-radius:12px 12px 0 0;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.4);border-bottom:0;backdrop-filter:blur(2px) saturate(160%) brightness(1.08);-webkit-backdrop-filter:blur(2px) saturate(160%) brightness(1.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.55)}#jlsectroot.open{background:linear-gradient(145deg,rgba(14,20,30,.38),rgba(14,20,30,.3))}" /* 根=裁剪容器: max-height 32(只露手柄)↔min(58vh,520px)开; 遮罩裁剪=隐藏体不压导航不吞点击 */
    + "#jlsectroot.open{max-height:min(58vh,520px)}"
    + "body.ksFullJL #jlsectroot{display:none!important}" /* K线全屏模式nav隐藏, 抽屉同退场 */
    + "#jlsectHandle{height:22px;display:flex;align-items:center;gap:6px;padding:0 10px;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}" /* touch-action:none=拖拽不被页面滚动抢占 */
    + "#jlsectHandle .jlsecGrab{display:none;flex:0 0 auto;width:30px;height:4px;border-radius:10px;background:rgba(255,255,255,.55);box-shadow:0 1px 2px rgba(0,0,0,.4)}"
    + "#jlsectHandle b{font-size:11px;color:#fff;font-weight:700;letter-spacing:.5px;flex:0 0 auto}"
    + "#jlsectHandle small{font-size:10px;color:#FFFFFF;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" /* jl-C: 灰.78→亮白.95加粗 */
    + "#jlsectHandle small.jlsecNo{color:#ffd84a;font-size:9.5px;font-weight:700}"
    + "#jlsectHandle .jlsecArr{margin-left:auto;flex:0 0 auto;font-size:10px;color:#FFFFFF;font-weight:700;transition:transform .3s}"
    + "#jlsectroot.open .jlsecArr{transform:rotate(180deg)}"
    + "#jlsectBody{overflow-y:auto;max-height:calc(min(58vh,520px) - 34px);pointer-events:auto;overscroll-behavior:contain;padding:2px 11px 12px}" /* 内容区内滚, 关态被根裁剪自然无事件 */
    + "@media (prefers-reduced-motion:reduce){#jlsectroot{transition:none}#jlsectHandle .jlsecArr{transition:none}}";
  function ensureRoot() {
    if (ROOT) return ROOT;
    ROOT = document.createElement("div");
    ROOT.id = "jlsectroot";
    var st = document.createElement("style");
    st.setAttribute("data-jlsec", "1");
    st.textContent = JSEC_CSS;
    document.head.appendChild(st);
    var host = document.querySelector(".phone") || document.body; /* jl-C: 挂.phone(原body尾=甩到页面最底根修); 兜底body时改fixed定位 */
    if (!document.querySelector(".phone")) ROOT.style.position = "fixed";
    host.appendChild(ROOT);
    return ROOT;
  }
  function chip(label, val, dir, state) {
    var col = state === "ok" ? (dir > 0 ? "#ff5459" : dir < 0 ? "#5ae8ab" : "rgba(255,255,255,.95)") : "rgba(255,255,255,.95)"; /* jl-C: 非ok态灰.78→亮白.95(用户:灰字加粗亮白); 红维持亮红#ff5459(A股红涨) */
    var bg = state === "ok" ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)";
    var arrow = state === "ok" ? (dir > 0 ? " ↑" : dir < 0 ? " ↓" : "") : "";
    return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:8px;background:' + bg + ';border:1px solid rgba(255,255,255,.10);font-size:10.5px;font-weight:600;color:' + col + ';white-space:nowrap"><b style="color:rgba(255,255,255,.95);font-weight:700">' + label + '</b> ' + esc(val) + arrow + '</span>';
  }
  function secRow(rec) {
    var f = rec.factors;
    var a = f.avgPct, u = f.upR, z = f.ztN, e = f.evN, L = rec.leaderCand; /* 候选数据已移出factors, 独立字段(非因子) */
    var dirA = a.state === "ok" ? (a.raw > 0 ? 1 : a.raw < 0 ? -1 : 0) : 0;
    var dirU = u.state === "ok" ? (u.raw >= 0.5 ? 1 : u.raw < 0.5 ? -1 : 0) : 0;
    var evTxt = e.state === "ok" ? ("股" + e.raw.codeN + "·录" + e.raw.recN + "·峰" + e.raw.memPeak) : "无当日记录";
    var candTxt = "";
    if (L && L.cand && L.cand.length) {
      candTxt = '<div style="font-size:9.5px;color:rgba(255,255,255,.95);font-weight:600;margin:1px 0 2px 2px">龙头候选(未评分·非因子): ' + L.cand.map(function (c) { return esc(c.n) + "(连" + c.lbc + "·封" + fmtYi(c.fund) + (c.zbc ? "·炸" + c.zbc : "") + ")"; }).join(" / ") + "</div>"; /* jl-C: 灰.78→亮白.95加粗 */
    }
    return '<div style="padding:7px 9px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:12.5px;color:#ffd21f">' + esc(rec.sector) + '</b><small style="font-size:9px;color:rgba(255,255,255,.95);font-weight:600">' + rec.sectorTier + "级 · 样本" + (a.note.indexOf("n=") === 0 ? a.note.slice(2) : "?") + " · 排名#" + (rec.mid.rank || "—") + "</small></div>" + /* jl-C: 元信息灰.78→亮白.95加粗 */
      chip("涨幅", a.state === "ok" ? fmtPct(a.raw) : stateTxt(a.state), dirA, a.state) +
      chip("上涨率", u.state === "ok" ? Math.round(u.raw * 100) + "%" : stateTxt(u.state), dirU, u.state) +
      chip("涨停数", z.state === "ok" ? z.raw : stateTxt(z.state), z.state === "ok" ? 1 : 0, z.state) +
      chip("事件扩散", evTxt, e.state === "ok" ? 1 : 0, e.state) +
      chip("成交额变化", "数据不足", 0, "insufficient") +
      chip("龙头强度", L && L.cand && L.cand.length ? "待定义(候选" + L.cand.length + ")" : "待定义", 0, "pending") +
      candTxt + "</div>";
  }
  function stateTxt(st) { return st === "smallN" ? "样本<8" : st === "miss" ? "暂无数据" : st === "stale" ? "非当日" : st === "none" ? "无" : st; }
  function paint() {
    if (DRAG.on) return; /* jl-C: 拖拽中不重建DOM(手柄监听会丢), 60s下一轮补刷 */
    var R = ensureRoot();
    var has = !!(S.last && S.day);
    var sub = has ? (S.day + " · 强度样本 · " + (S.at ? "数据时点 " + new Date(+S.at).toTimeString().slice(0, 5) : "暂无数据")) : "暂无强度数据"; /* jl-1166c: 明确这是强度样本，不是板块资金状态 */
    if (has && S.last.ranked && S.last.ranked.length) { /* jl-1208: 有排名时手柄直接报最强两个板块——抽屉不打开也看得到有没有内容、谁最强 */
      var _r0 = S.last.ranked[0], _r1 = S.last.ranked[1], _a0 = _r0.factors && _r0.factors.avgPct;
      sub = "最强 " + _r0.sector + (_a0 && _a0.state === "ok" ? " " + fmtPct(_a0.raw) : "") + (_r1 ? " · " + _r1.sector : "") + (S.at ? " · " + new Date(+S.at).toTimeString().slice(0, 5) : "");
    }
    var body = "";
    if (has) {
      var o = S.last, rk = o.ranked.slice(0, 8);
      var restAll = o.recs.filter(function (r) { return r.factors.avgPct.state !== "ok" && r.sector !== CORE.UNATTR; });
      var restMiss = restAll.filter(function (r) { return r.factors.avgPct.state === "miss" || r.factors.avgPct.state === "stale"; }); /* jl-B: 无涨幅数据的板块→合并一行, 不再逐卡铺"数据缺失"小块 */
      var rest = restAll.filter(function (r) { return r.factors.avgPct.state !== "miss" && r.factors.avgPct.state !== "stale"; }).slice(0, 4);
      var unr = o.recs.filter(function (r) { return r.sector === CORE.UNATTR; })[0] || null;
      var sl = S.stale || {}, slTxt = [sl.rows ? "逐股涨跌停在 " + String(sl.rows).slice(5) : "", sl.zt ? "涨停池停在 " + String(sl.zt).slice(5) : ""].filter(Boolean);
      if (slTxt.length) body += '<div style="font-size:10px;color:#ffd84a;font-weight:700;padding:5px 2px 3px">⚠ ' + esc(slTxt.join(" · ")) + "（非 " + esc(S.day.slice(5)) + " 数据, 未计入, 本轮不写快照）</div>"; /* jl-B1-S3 */
      body += rk.length ? rk.map(secRow).join("") : '<div style="font-size:10.5px;color:rgba(255,255,255,.95);font-weight:600;padding:6px 2px">暂无强度排名 · 当日有效样本不足（板块资金不受影响）</div>';
      if (rest.length) body += '<div style="font-size:9px;color:rgba(255,255,255,.95);font-weight:600;margin:6px 0 2px">— 样本不足的板块（事件/涨停侧仍跟踪）—</div>' + rest.map(secRow).join("");
      if (restMiss.length) {
        var names = restMiss.map(function (r) { return esc(r.sector); });
        var cap = names.slice(0, 8).join(" · ") + (names.length > 8 ? " 等" + names.length + "个" : "");
        body += '<div style="font-size:9.5px;color:rgba(255,255,255,.95);font-weight:600;margin:4px 0 2px;line-height:1.7">暂无强度数据: <span style="color:rgba(255,255,255,.95);font-weight:700">' + cap + '</span>（事件/涨停侧仍跟踪）</div>';
      }
      if (unr) body += '<div style="font-size:9px;color:rgba(255,255,255,.95);font-weight:600;margin:5px 0 0">· 个股扩散未归属 ' + unr.factors.evN.raw.recN + " 条（成分股" + unr.factors.evN.raw.codeN + " · 不作归属猜测）</div>";
      var st = S.stat || { mc: 0, sec: 0, hy: 0, unattr: 0 };
      /* jl-1207: 撤公式/口径回退说明行, 用户定: 计算口径不上卡面 */
      body += '<div style="margin-top:6px"><button id="jlSecExp" style="font-size:9.5px;font-weight:600;padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#ffd21f;cursor:pointer">导出快照JSON</button></div>';
    } else {
      body = '<div style="font-size:10.5px;color:rgba(255,255,255,.95);font-weight:600;padding:6px 2px">暂无强度数据 · 数据到达后自动计算（板块资金不受影响）</div>';
    }
    /* jl-C: 白玻璃抽屉结构——手柄(拖条+标题+时点+箭头) + 内容区; 开合由ROOT.open类驱动max-height动画 */
    var prevB = document.getElementById("jlsectBody"), sc = prevB ? prevB.scrollTop : 0; /* 刷新保留滚动位置 */
    R.innerHTML = '<div id="jlsectHandle"><span class="jlsecGrab"></span><b>板块强度</b><small' + (has ? '' : ' class="jlsecNo"') + '>' + esc(sub) + '</small><span class="jlsecArr">⌄</span></div>' +
      '<div id="jlsectBody">' + body + "</div>";
    R.classList.toggle("open", !!S.open);
    R.style.display = has && S.last.ranked && S.last.ranked.length ? "" : "none"; /* jl-1208: 无强度排名(样本不足/无数据)整卡收起不占位, 有排名自动出现 */
    var nb = document.getElementById("jlsectBody");
    if (nb) nb.scrollTop = sc;
    var h = document.getElementById("jlsectHandle");
    if (h) bindHandleJL(h);
    var b = document.getElementById("jlSecExp");
    if (b) b.onclick = function (ev) { ev.stopPropagation(); exportJSON(); };
  }
  /* jl-C: 手柄手势——点按开合(位移<6px且<350ms=tap)/上拉下滑(位移>28px或速度>0.45px/ms判向), 小抖动回弹; 拖拽中高度跟手(max-height裁剪), 无PointerEvent老浏览器回落click */
  function bindHandleJL(h) {
    var R = ROOT;
    if (!R) return;
    function capH() { return Math.min(window.innerHeight * 0.58, 520); }
    h.addEventListener("pointerdown", function (e) {
      DRAG.on = true; DRAG.y0 = e.clientY; DRAG.dy = 0; DRAG.t0 = Date.now();
      R.style.transition = "none";
      try { h.setPointerCapture(e.pointerId); } catch (ec) {}
      e.preventDefault();
    });
    h.addEventListener("pointermove", function (e) {
      if (!DRAG.on) return;
      DRAG.dy = e.clientY - DRAG.y0;
      var base = Math.max(22, Math.min(capH(), R.getBoundingClientRect().height - DRAG.dy));
      R.style.maxHeight = Math.max(22, Math.min(capH(), base)) + "px"; /* 上拉(dy<0)抽屉变高, 下滑收矮, 32~capH夹紧 */
    });
    function up() {
      if (!DRAG.on) return;
      var dt = Math.max(1, Date.now() - DRAG.t0), v = DRAG.dy / dt;
      DRAG.on = false;
      var want = S.open;
      if (Math.abs(DRAG.dy) < 6 && dt < 350) want = !S.open; /* tap=开合 */
      else if (DRAG.dy < -28 || v < -0.45) want = true; /* 上拉=开 */
      else if (DRAG.dy > 28 || v > 0.45) want = false; /* 下滑=关 */
      R.style.transition = "";
      R.style.maxHeight = "";
      S.open = want;
      R.classList.toggle("open", !!S.open);
    }
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
    if (!window.PointerEvent) h.addEventListener("click", function () { S.open = !S.open; R.classList.toggle("open", !!S.open); });
  }

  function exportJSON() {
    if (!S.db) return;
    try {
      var g = S.db.transaction("snap", "readonly").objectStore("snap").getAll();
      g.onsuccess = function () {
        try {
          var blob = new Blob([JSON.stringify(g.result || [], null, 1)], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "jl_sector_strength_" + (S.day || "export") + ".json";
          a.click();
          setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 800);
        } catch (e) {}
      };
      g.onerror = function () {};
    } catch (e) {}
  }

  function diag() { return { day: S.day, at: S.at, ztSrc: S.ztSrc, stat: S.stat, sectors: S.last ? S.last.recs.length : 0, t3: S.lastT3 ? S.lastT3.length : 0, snapKeys: S.keys ? S.keys.size : -1 }; }

  openDB();
  setTimeout(compute, 1800);
  setInterval(function () { if (!document.hidden) compute(); }, 60e3);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(compute, 500); });
  window.__JLSEC__ = { CORE: CORE, S: S, compute: compute, exportJSON: exportJSON, diag: diag };
})(typeof window !== "undefined" ? window : globalThis);
