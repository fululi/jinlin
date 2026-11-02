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
        var o = agg[o0.name] || (agg[o0.name] = { ztN: 0, lb: 0, cand: [], earlyN: 0, firstFbt: 0, fb: { mc: 0, sec: 0, hy: 0 } });
        var _ft = +r.fbt || 0; if (_ft > 0) { if (_ft <= 100000) o.earlyN++; if (!o.firstFbt || _ft < o.firstFbt) o.firstFbt = _ft; } /* 早盘封板(10:00前)数+最早封板时间(HHMMSS) */
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
          leaderCand: { cand: cand, early: z ? { n: z.earlyN || 0, first: z.firstFbt || 0 } : null, src: "yd.zt.pool", nonFactor: true, note: "非因子·候选数据(龙头定义留T4b)" },
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

    /* ===== 板块生命周期(只读快照, 纯函数): ①萌芽 ②启动 ③加速 ④分歧 ⑤退潮; 阈值为初值, 待用户复盘调 ===== */
    TH: { TOP: 5, UPR_START: 0.7, UPR_OUT: 0.5, EARLY_N: 2, HIGH_CUM: 12, ZT_DROP: 0.6, MIN_N_DAYS: 2 },
    STAGES: ["", "萌芽", "启动", "加速", "分歧", "退潮"],
    /* days: [{day, m:{sector:{avg,up,zt,early,rank}}}] 升序, 末位=今日; 返回某板块在第i天的阶段与多日统计 */
    stageAt: function (days, i, sec) {
      var T = CORE.TH, d = days[i] && days[i].m && days[i].m[sec];
      if (!d) return null;
      var streak = 0, j;
      for (j = i; j >= 0; j--) { var e = days[j].m && days[j].m[sec]; if (e && e.rank != null && e.rank <= T.TOP) streak++; else break; }
      var cum = 1, used = 0;
      for (j = i; j >= 0 && used < 5; j--, used++) { var g = days[j].m && days[j].m[sec]; if (!g || g.avg == null) break; cum *= 1 + g.avg / 100; }
      var cum5 = (cum - 1) * 100;
      var pv = i > 0 && days[i - 1].m ? days[i - 1].m[sec] : null;
      var wasStrong = !!(pv && pv.rank != null && pv.rank <= T.TOP);
      var top = d.rank != null && d.rank <= T.TOP, up = d.up == null ? 0 : d.up, k = 0;
      if (wasStrong && (d.avg < 0 || up < T.UPR_OUT || (d.rank != null && d.rank > 10))) k = 5;
      else if (streak >= 2 && (cum5 >= T.HIGH_CUM || (pv && pv.zt > 0 && d.zt < pv.zt * T.ZT_DROP))) k = 4;
      else if (top && streak >= 2) k = 3;
      else if (top && up >= T.UPR_START) k = 2;
      else if (!top && (d.early || 0) >= T.EARLY_N) k = 1;
      return { k: k, name: CORE.STAGES[k], streak: streak, cum5: Math.round(cum5 * 100) / 100, rank: d.rank, avg: d.avg, zt: d.zt || 0, early: d.early || 0 };
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

  var S = { db: null, keys: null, day: null, at: null, last: null, stat: null, open: false, lastT3: null, tl: null, tlDay: "", live: false, hc: {}, flow: {}, flowP: {}, bk: null, bkP: null, flowT: 0, ana: null, lead: null, leadN: 0 };
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
        S.live = !!(dayFromData && !rowsStale && at); /* jl-secpop: 本轮是当日有效数据才进时间线/弹提醒 */
        tlUpdate(function () { histUpdate(function () { paint(); popCheck(); }); });
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
    + "#jlsecPop{position:absolute;left:12px;right:12px;bottom:84px;z-index:34;padding:9px 12px 8px;border-radius:12px;background:linear-gradient(145deg,rgba(20,30,44,.72),rgba(10,16,28,.62));-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%);border:1px solid rgba(255,210,31,.45);box-shadow:0 8px 26px rgba(0,0,0,.45);color:#fff;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .3s,transform .3s;cursor:pointer}"
    + "#jlsecPop.on{opacity:1;transform:none;pointer-events:auto}"
    + "#jlsecPop .jlspT{font-size:10.5px;font-weight:700;color:#ffd21f;display:flex;align-items:center}#jlsecPop .jlspX{margin-left:auto;padding:0 2px 0 12px;font-size:12px;color:#fff}"
    + "#jlsecPop .jlspH{font-size:13px;font-weight:700;margin-top:4px}#jlsecPop .jlspB{font-size:11px;font-weight:600;margin-top:3px}#jlsecPop .jlspF{font-size:10px;font-weight:600;margin-top:4px;opacity:.85}"
    + "body.ksFullJL #jlsecPop{display:none!important}"
    + "@media (prefers-reduced-motion:reduce){#jlsectroot{transition:none}#jlsectHandle .jlsecArr{transition:none}#jlsecPop{transition:none}}";

  /* ============ jl-rot(2026-11-03): 板块生命周期圆环——在原抽屉上加, 原内容不动。历史=既有IDB快照(零新请求), 阶段=CORE.stageAt ============ */
  var STC = ["", "rgba(255,255,255,.6)", "#ffffff", "#ffd21f", "rgba(255,255,255,.45)", "rgba(255,255,255,.3)"]; /* 单色系: 白=冷/暖金=热/灰=退, 红绿只留给涨跌与资金 */
  function dayMapOf(recs) {
    var m = {};
    (recs || []).forEach(function (r) {
      if (!r || r.sector === CORE.UNATTR || !r.factors) return;
      var a = r.factors.avgPct, u = r.factors.upR, z = r.factors.ztN, L = r.leaderCand;
      var okA = a && a.state === "ok";
      var zt = z && z.state === "ok" ? +z.raw || 0 : 0, early = L && L.early ? +L.early.n || 0 : 0;
      if (!okA && !zt) return;
      m[r.sector] = { avg: okA ? a.raw : null, up: u && u.state === "ok" ? u.raw : null, zt: zt, early: early, rank: r.mid && r.mid.rank != null ? r.mid.rank : null };
    });
    return m;
  }
  function loadDay(db, day, cb) {
    if (S.hc[day]) return cb();
    try {
      var g = db.transaction("snap", "readonly").objectStore("snap").getAll(IDBKeyRange.bound(day + "|", day + "|￿"));
      g.onsuccess = function () {
        var rs = g.result || [], mx = 0;
        rs.forEach(function (r) { if (r && +r.kb > mx) mx = +r.kb; });
        S.hc[day] = dayMapOf(rs.filter(function (r) { return r && +r.kb === mx; })); /* 取当日最后一个30分桶=收盘附近 */
        cb();
      };
      g.onerror = function () { S.hc[day] = {}; cb(); };
    } catch (e) { S.hc[day] = {}; cb(); }
  }
  function histUpdate(cb) {
    var fin = function (pastDays) {
      try {
        var days = pastDays.map(function (d) { return { day: d, m: S.hc[d] || {} }; }).filter(function (d) { return Object.keys(d.m).length; });
        var tm = dayMapOf(S.last && S.last.recs), hasRank = Object.keys(tm).some(function (k) { return tm[k].rank != null; });
        S.review = !hasRank && days.length > 0; /* 当日无强度排名(休市/夜间/数据旧): 不隐藏, 退到最近一个有快照的交易日复盘 */
        if (!S.review) days.push({ day: S.day, m: tm });
        if (!days.length) { S.ana = null; S.days = []; return cb(); }
        S.days = days; S.dispDay = days[days.length - 1].day;
        S.nHist = days.length - 1;
        var i = days.length - 1, ana = {};
        Object.keys(days[i].m).forEach(function (sec) {
          var cur = CORE.stageAt(days, i, sec);
          if (!cur) return;
          ana[sec] = { cur: cur, prev: i > 0 ? CORE.stageAt(days, i - 1, sec) : null, path: days.slice(Math.max(0, i - 3), i + 1).map(function (d, j, arr) { var st = CORE.stageAt(days, i - (arr.length - 1 - j), sec); return st ? st.k : 0; }) };
        });
        S.ana = ana;
        pickLead();
        ensureFlows();
      } catch (e) { S.ana = null; }
      cb();
    };
    try {
      if (!S.db || !S.keys || !S.day) return fin([]);
      var set = {};
      S.keys.forEach(function (k) { var d = String(k).slice(0, 10); if (d < S.day) set[d] = 1; });
      var past = Object.keys(set).sort().slice(-9), idx = 0;
      (function next() { if (idx >= past.length) return fin(past); loadDay(S.db, past[idx++], next); })();
    } catch (e) { fin([]); }
  }
  /* 主攻防抖: 新主攻要连续2轮都是第一才换, 否则保持原主攻——圆环不乱跳 */
  function pickLead() {
    if (S.leadDay !== S.day) { S.leadDay = S.day; S.lead = null; S.leadCand = null; S.leadN = 0; }
    var pool = Object.keys(S.ana || {}).filter(function (k) { var c = S.ana[k].cur.k; return c >= 1 && c <= 3; }).sort(function (x, y) {
      var a = S.ana[x].cur, b = S.ana[y].cur, fa = a.k === 1 ? 1 : 0, fb = b.k === 1 ? 1 : 0;
      if (fa !== fb) return fa - fb;
      var ra = a.rank == null ? 99 : a.rank, rb = b.rank == null ? 99 : b.rank;
      return (ra - rb) || (b.zt - a.zt);
    });
    S.pool = pool;
    var cand = pool[0] || null;
    if (!S.lead || !S.ana[S.lead] || S.ana[S.lead].cur.k < 1 || S.ana[S.lead].cur.k > 3) { S.lead = cand; S.leadCand = null; S.leadN = 0; return; }
    if (cand && cand !== S.lead) {
      if (S.leadCand === cand) S.leadN++; else { S.leadCand = cand; S.leadN = 1; }
      if (S.leadN >= 2) { S.lead = cand; S.leadCand = null; S.leadN = 0; }
    } else { S.leadCand = null; S.leadN = 0; }
  }
  function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcPath(cx, cy, r, d0, d1) { var p0 = polar(cx, cy, r, d0), p1 = polar(cx, cy, r, d1); return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1); }
  function stTag(sec) {
    var A = S.ana && S.ana[sec]; if (!A || !A.cur.k) return "";
    var c = A.cur;
    return ' <span style="font-size:9.5px;font-weight:700;padding:0 6px;margin-left:5px;border-radius:7px;color:' + (c.k === 3 ? "#ffd21f" : "#fff") + ';border:1px solid ' + (c.k === 3 ? "#ffd21f" : "rgba(255,255,255,.45)") + '">' + CORE.STAGES[c.k] + (c.streak >= 2 ? " " + c.streak + "天" : "") + "</span>";
  }
  function rotHtml() {
    var A = S.ana; if (!A) return "";
    var cx = 150, cy = 94, R = 70, placed = [], byK = {};
    Object.keys(A).forEach(function (sec) { var k = A[sec].cur.k; if (k) (byK[k] = byK[k] || []).push(sec); });
    var ld = S.lead && A[S.lead] ? S.lead : null, ldc = ld ? A[ld].cur : null, svg = "";
    for (var k = 1; k <= 5; k++) {
      var d0 = -90 + (k - 1) * 72 + 2, d1 = -90 + k * 72 - 2, mid = -90 + (k - 0.5) * 72, act = ldc && ldc.k === k;
      svg += '<path d="' + arcPath(cx, cy, R, d0, d1) + '" fill="none" stroke="#fff" stroke-opacity="' + (act ? ".6" : ".14") + '" stroke-width="' + (act ? 6 : 3) + '" stroke-linecap="round"/>';
      var lp = polar(cx, cy, 47, mid);
      svg += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="' + (act ? 800 : 600) + '" fill="#fff" fill-opacity="' + (act ? 1 : .55) + '">' + CORE.STAGES[k] + "</text>";
      var arr = (byK[k] || []).sort(function (x, y) { var a = A[x].cur, b = A[y].cur, ra = a.rank == null ? 99 : a.rank, rb = b.rank == null ? 99 : b.rank; return (ra - rb) || (b.zt - a.zt); }).slice(0, 3);
      var offs = arr.length === 1 ? [0] : arr.length === 2 ? [-18, 18] : [-24, 0, 24];
      arr.forEach(function (sec, j) { placed.push({ sec: sec, k: k, ang: mid + offs[j] }); });
    }
    placed.forEach(function (o, i) {
      var c = A[o.sec].cur, p = polar(cx, cy, R, o.ang), rr = 6 + Math.min(c.zt, 8) * 0.5;
      var pk = A[o.sec].prev && A[o.sec].prev.k;
      if (pk && pk !== o.k) { var pm = polar(cx, cy, R, -90 + (pk - 0.5) * 72 + (o.ang - (-90 + (o.k - 0.5) * 72))); svg += '<circle cx="' + pm[0].toFixed(1) + '" cy="' + pm[1].toFixed(1) + '" r="3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-dasharray="2 2"/>'; }
      var fill = c.avg == null ? "#8b93a3" : c.avg >= 0 ? "#ff5459" : "#2fd18b";
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + fill + '" stroke="#fff" stroke-width="1.3"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3.2).toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">' + (i + 1) + "</text>";
    });
    var nm = ld ? (ld.length > 5 ? ld.slice(0, 5) + "…" : ld) : "";
    svg += ld ? '<text x="150" y="93" text-anchor="middle" font-size="12.5" font-weight="800" fill="#ffd21f">' + esc(nm) + '</text><text x="150" y="107" text-anchor="middle" font-size="9" font-weight="600" fill="#fff" fill-opacity=".7">主攻' + (ldc.streak >= 2 ? " · " + ldc.streak + "天" : "") + "</text>"
      : '<text x="150" y="98" text-anchor="middle" font-size="10" font-weight="600" fill="#fff" fill-opacity=".7">暂无主攻</text>';
    var rows = placed.map(function (o, i) {
      var c = A[o.sec].cur, fill = c.avg == null ? "#8b93a3" : c.avg >= 0 ? "#ff5459" : "#2fd18b";
      return '<div style="display:flex;align-items:center;gap:7px;font-size:10.5px;color:#fff;font-weight:600;line-height:1.9"><span style="flex:0 0 15px;height:15px;border-radius:50%;background:' + fill + ';border:1px solid #fff;text-align:center;font-size:9px;line-height:14px;font-weight:800">' + (i + 1) + '</span><b style="color:#ffd21f">' + esc(o.sec) + "</b>" + stTag(o.sec) + '<span style="margin-left:auto;color:' + fill + '">' + (c.avg == null ? "" : fmtPct(c.avg)) + "</span></div>";
    }).join("");
    return '<div style="padding:7px 9px 6px;margin:2px 0 6px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14)"><div style="font-size:11px;color:#fff;font-weight:700">板块轮动' + (S.review ? '<span style="font-weight:600;opacity:.7;font-size:9.5px"> · 复盘 ' + esc(S.dispDay) + "</span>" : "") + "</div>" +
      '<svg viewBox="0 0 300 188" width="100%" style="max-width:300px;display:block;margin:0 auto">' + svg + "</svg>" + rows +
      (S.nHist < 3 ? '<div style="font-size:9.5px;color:rgba(255,255,255,.7);font-weight:600;margin-top:2px">历史 ' + S.nHist + " 天，天数会逐日累积</div>" : "") + "</div>";
  }
  /* ---- 板块5日资金(东财概念板块fflow, 只拉"我盯的"几个; 走jlReq限速熔断; 无匹配/失败=不显示) ---- */
  var UT_ = "7eea3edcaed734bea9cbfc24409ed989";
  function emGet(u, ttl) { return window.jlReq ? window.jlReq.jsonp(u, { ttl: ttl || 0, timeout: 9000 }) : Promise.reject(new Error("noreq")); }
  function bkTable() {
    if (S.bk) return Promise.resolve(S.bk);
    var c = lsGet("jl_secbk_v1");
    if (c && c.d === localDay(Date.now()) && c.m) { S.bk = c.m; return Promise.resolve(S.bk); }
    if (S.bkP) return S.bkP;
    var m = {};
    var page = function (pn) {
      return emGet("https://push2.eastmoney.com/api/qt/clist/get?fid=f12&po=0&pz=100&pn=" + pn + "&np=1&fltt=2&invt=2&fs=m:90+t:3&fields=f12,f14&ut=" + UT_, 600000).then(function (d) {
        var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [];
        arr.forEach(function (r) { if (r && r.f12 && r.f14) m[String(r.f14)] = String(r.f12); });
        var tot = d && d.data && +d.data.total || 0;
        return arr.length >= 100 && pn * 100 < tot && pn < 8 ? page(pn + 1) : null;
      });
    };
    S.bkP = page(1).then(function () {
      S.bkP = null;
      if (Object.keys(m).length > 50) { S.bk = m; try { localStorage.setItem("jl_secbk_v1", JSON.stringify({ d: localDay(Date.now()), m: m })); } catch (e) {} }
      return S.bk || {};
    }, function () { S.bkP = null; return {}; });
    return S.bkP;
  }
  function flowOf(sec) {
    var f = S.flow[sec]; if (f && Date.now() - f.t < 600000) return Promise.resolve(f);
    if (S.flowP[sec]) return S.flowP[sec];
    var p = bkTable().then(function (m) {
      var bk = m[sec];
      if (!bk) return (S.flow[sec] = { t: Date.now() - 300000, none: true });
      return emGet("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=6&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52&secid=90." + bk + "&ut=" + UT_, 120000).then(function (d) {
        var ks = d && d.data && d.data.klines || [];
        var arr = ks.map(function (x) { var a = String(x).split(","); return { d: a[0], v: +a[1] }; }).filter(function (x) { return isFinite(x.v); }).slice(-5);
        return (S.flow[sec] = { t: Date.now(), days: arr, none: !arr.length });
      });
    }).catch(function () { return (S.flow[sec] = { t: Date.now() - 540000, none: true, err: 1 }); }).then(function (r) { delete S.flowP[sec]; return r; });
    return (S.flowP[sec] = p);
  }
  function ensureFlows() {
    try {
      var want = curPicks().slice(); if (S.lead && want.indexOf(S.lead) < 0) want.push(S.lead);
      want.forEach(function (sec) { flowOf(sec).then(function () { if (S.flowT) return; S.flowT = setTimeout(function () { S.flowT = 0; paint(); }, 400); }); });
    } catch (e) {}
  }
  function flowVerdict(f) {
    if (!f || f.none || !f.days || f.days.length < 2) return null;
    var v = f.days.map(function (x) { return x.v; }), n = v.length, t = v[n - 1], y = v[n - 2];
    var sum = v.reduce(function (a, b) { return a + b; }, 0), peak = Math.max.apply(null, v.slice(0, n - 1).concat([0])), w;
    if (t > 0) w = t >= peak ? "加速" : (t < peak * 0.5 ? "转弱" : "流入"); else w = y > 0 ? "转出" : "已撤";
    return { w: w, sum: sum, v: v, out: w === "转出" || w === "已撤", weak: w === "转弱" };
  }
  function fundRow(f, fv) {
    if (!fv) return '<div style="font-size:10px;color:rgba(255,255,255,.5);font-weight:600;margin-top:5px">资金 —</div>';
    var mx = Math.max.apply(null, fv.v.map(Math.abs)) || 1, bars = fv.v.map(function (x, i) {
      var h = Math.max(1.5, Math.abs(x) / mx * 15), last = i === fv.v.length - 1, X = 6 + i * 22;
      return '<rect x="' + X + '" y="' + (x >= 0 ? 18 - h : 18).toFixed(1) + '" width="14" height="' + h.toFixed(1) + '" rx="2" fill="' + (x >= 0 ? "#ff5459" : "#2fd18b") + '" fill-opacity="' + (last ? 1 : .5) + '"/>';
    }).join("");
    return '<div style="display:flex;align-items:center;gap:10px;margin-top:5px"><span style="font-size:10px;color:rgba(255,255,255,.6);font-weight:600">资金</span><svg viewBox="0 0 120 36" width="104" height="31" style="flex:0 0 auto"><line x1="0" x2="120" y1="18" y2="18" stroke="rgba(255,255,255,.25)"/>' + bars + '</svg><b style="font-size:12px;color:' + (fv.out ? "#2fd18b" : "#ff5459") + '">' + fv.w + '</b><span style="margin-left:auto;font-size:11px;font-weight:700;color:' + (fv.sum >= 0 ? "#ff5459" : "#2fd18b") + '">' + (fv.sum >= 0 ? "+" : "") + (fv.sum / 1e8).toFixed(1) + "亿</span></div>";
  }
  function pickGet() { var a = lsGet("jl_secpick_v1"); return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string"; }).slice(0, 2) : []; }
  function pickSet(a) { try { localStorage.setItem("jl_secpick_v1", JSON.stringify(a.slice(0, 2))); } catch (e) {} }
  function curPicks() {
    var A = S.ana || {}, p = pickGet().filter(function (x) { return A[x]; });
    if (!p.length) { if (S.lead && A[S.lead]) p.push(S.lead); var alt = (S.pool || []).filter(function (x) { return x !== S.lead; })[0]; if (alt) p.push(alt); }
    return p.slice(0, 2);
  }
  function trackSvg(sec) {
    var days = (S.days || []).slice(-10), off = (S.days || []).length - days.length, n = days.length;
    if (!n) return "";
    var x0 = 34, x1 = 290, dx = n > 1 ? (x1 - x0) / (n - 1) : 0, pts = [], bars = "", labs = "", rails = "";
    for (var k = 1; k <= 5; k++) rails += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + (14 + (k - 1) * 15) + '" y2="' + (14 + (k - 1) * 15) + '" stroke="' + STC[k] + '" stroke-opacity=".18"/><text x="2" y="' + (17 + (k - 1) * 15) + '" font-size="8.5" font-weight="700" fill="' + STC[k] + '">' + CORE.STAGES[k] + "</text>";
    days.forEach(function (d, j) {
      var x = n > 1 ? x0 + dx * j : (x0 + x1) / 2, st = CORE.stageAt(S.days, off + j, sec), e = d.m && d.m[sec];
      if (st && st.k) pts.push({ x: x, y: 14 + (st.k - 1) * 15, k: st.k, last: j === n - 1 });
      else pts.push(null);
      if (e && e.avg != null) { var h = Math.min(22, Math.abs(e.avg) * 2.2 + 1.5); bars += '<rect x="' + (x - 5).toFixed(1) + '" y="' + (e.avg >= 0 ? 118 - h : 118).toFixed(1) + '" width="10" height="' + h.toFixed(1) + '" rx="2" fill="' + (e.avg >= 0 ? "#ff5459" : "#2fd18b") + '" fill-opacity=".85"/><text x="' + x.toFixed(1) + '" y="' + (e.avg >= 0 ? 116 - h : 128 + h).toFixed(1) + '" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff">' + (e.avg >= 0 ? "+" : "") + e.avg.toFixed(1) + "</text>"; }
      if (n <= 6 || j % 2 === (n - 1) % 2) labs += '<text x="' + x.toFixed(1) + '" y="158" text-anchor="middle" font-size="8" font-weight="600" fill="rgba(255,255,255,.85)">' + String(d.day).slice(5) + "</text>";
    });
    var line = "", prev = null;
    pts.forEach(function (p) { if (p && prev) line += '<line x1="' + prev.x.toFixed(1) + '" y1="' + prev.y + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y + '" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>'; prev = p || null; });
    var dots = pts.map(function (p) { return p ? '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y + '" r="' + (p.last ? 5 : 3.4) + '" fill="' + STC[p.k] + '" stroke="#fff" stroke-width="' + (p.last ? 1.6 : 0.8) + '"/>' : ""; }).join("");
    return '<svg viewBox="0 0 300 164" width="100%" style="display:block">' + rails + line + dots + '<line x1="' + x0 + '" x2="' + x1 + '" y1="118" y2="118" stroke="rgba(255,255,255,.25)"/>' + bars + labs + "</svg>";
  }
  function cardOf(sec) {
    var c = S.ana[sec].cur, fill = c.avg == null ? "#8b93a3" : c.avg >= 0 ? "#ff5459" : "#2fd18b", f = S.flow[sec], fv = flowVerdict(f);
    var gone = (c.k >= 4 && (!fv || fv.out || fv.weak)) || (fv && fv.out && c.streak >= 2), still = !gone && c.k >= 1 && c.k <= 3 && !(fv && fv.out);
    var bd = gone ? '<span style="font-size:10px;font-weight:800;padding:0 7px;border-radius:7px;color:#10131a;background:rgba(255,255,255,.7)">已过</span>' : still ? '<span style="font-size:10px;font-weight:800;padding:0 7px;border-radius:7px;color:#10131a;background:#ffd21f">还在</span>' : "";
    return '<div class="jlpgC" style="flex:0 0 100%;scroll-snap-align:start;box-sizing:border-box;padding:6px 8px 4px"><div style="display:flex;align-items:center;gap:2px"><b style="font-size:13px;color:#ffd21f">' + esc(sec) + "</b>" + stTag(sec) + '<span style="margin-left:6px">' + bd + '</span><b style="margin-left:auto;font-size:12px;color:' + fill + '">' + (c.avg == null ? "" : fmtPct(c.avg)) + "</b></div>" +
      trackSvg(sec) + fundRow(f, fv) + "</div>";
  }
  function revRank() { /* 夜间/休市: 原"现在最强的板块"用最近交易日快照补上 */
    var d = S.days && S.days[S.days.length - 1]; if (!d) return "";
    var ks = Object.keys(d.m).filter(function (k) { return d.m[k].rank != null; }).sort(function (a, b) { return d.m[a].rank - d.m[b].rank; }).slice(0, 8);
    if (!ks.length) return "";
    return '<div style="font-size:11px;color:#fff;font-weight:700;margin:2px 0 0">' + esc(d.day) + " 最强的板块（复盘）</div>" + ks.map(function (k, i) {
      var e = d.m[k], col = e.avg > 0 ? "#ff5459" : e.avg < 0 ? "#5ae8ab" : "#fff", bits = [];
      if (e.up != null) bits.push("上涨率 " + Math.round(e.up * 100) + "%"); if (e.zt) bits.push("涨停 " + e.zt + "只");
      return '<div style="padding:7px 9px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)"><div style="display:flex;justify-content:space-between;align-items:baseline"><span><b style="font-size:12.5px;color:#ffd21f">' + (i + 1) + ". " + esc(k) + "</b>" + stTag(k) + '</span><b style="font-size:12px;color:' + col + '">平均' + (e.avg >= 0 ? "涨 " : "跌 ") + Math.abs(e.avg).toFixed(2) + "%</b></div>" + (bits.length ? '<div style="font-size:10.5px;color:#fff;font-weight:600;margin-top:3px">' + bits.join(" · ") + "</div>" : "") + "</div>";
    }).join("");
  }
  function pickerHtml() {
    var A = S.ana; if (!A) return "";
    var picks = curPicks(), ord = { 3: 0, 2: 1, 1: 2, 4: 3, 5: 4 };
    var names = Object.keys(A).filter(function (k) { return A[k].cur.k || picks.indexOf(k) >= 0; }).sort(function (x, y) { var a = A[x].cur, b = A[y].cur; return ((ord[a.k] == null ? 9 : ord[a.k]) - (ord[b.k] == null ? 9 : ord[b.k])) || ((a.rank == null ? 99 : a.rank) - (b.rank == null ? 99 : b.rank)); }).slice(0, 16);
    var chips = names.map(function (k) { var on = picks.indexOf(k) >= 0; return '<span data-jlpick="' + esc(k) + '" style="flex:0 0 auto;padding:3px 10px;border-radius:12px;font-size:10.5px;font-weight:700;white-space:nowrap;border:1px solid rgba(255,255,255,' + (on ? "1" : ".3") + ');' + (on ? "background:#fff;color:#10131a" : "background:transparent;color:#fff") + '">' + esc(k) + "</span>"; }).join("");
    if (!picks.length) return "";
    var cards = picks.map(cardOf).join("");
    var dots = picks.length > 1 ? '<div id="jlpgDots" style="text-align:center;margin-top:2px">' + picks.map(function (_, i) { return '<span style="display:inline-block;width:' + (i ? 6 : 14) + 'px;height:5px;margin:0 2px;border-radius:3px;background:' + (i ? "rgba(255,255,255,.35)" : "#fff") + '"></span>'; }).join("") + "</div>" : "";
    return '<div style="padding:6px 6px 5px;margin:2px 0 6px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14)"><div style="font-size:11px;color:#fff;font-weight:700;padding:0 3px">我盯的</div>' +
      '<div id="jlpgChips" style="display:flex;gap:6px;overflow-x:auto;padding:5px 3px;-webkit-overflow-scrolling:touch;scrollbar-width:none">' + chips + "</div>" +
      '<div id="jlpgPager" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-radius:8px;background:rgba(0,0,0,.16)">' + cards + "</div>" + dots + "</div>";
  }
  function bindPicker() {
    var pg = document.getElementById("jlpgPager"), dots = document.getElementById("jlpgDots");
    if (pg && dots) pg.addEventListener("scroll", function () { var i = Math.round(pg.scrollLeft / Math.max(1, pg.clientWidth)); Array.prototype.forEach.call(dots.children, function (d, j) { d.style.width = j === i ? "14px" : "6px"; d.style.background = j === i ? "#fff" : "rgba(255,255,255,.35)"; }); }, { passive: true });
  }

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
    ROOT.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-jlpick]") : null;
      if (!t) return;
      var k = t.getAttribute("data-jlpick"), p = curPicks(), i = p.indexOf(k);
      if (i >= 0) { if (p.length > 1) p.splice(i, 1); } else { p.push(k); if (p.length > 2) p.shift(); }
      pickSet(p); S.pickTouched = 1; ensureFlows(); paint();
    });
    host.appendChild(ROOT);
    return ROOT;
  }
  function chip(label, val, dir, state) {
    var col = state === "ok" ? (dir > 0 ? "#ff5459" : dir < 0 ? "#5ae8ab" : "rgba(255,255,255,.95)") : "rgba(255,255,255,.95)"; /* jl-C: 非ok态灰.78→亮白.95(用户:灰字加粗亮白); 红维持亮红#ff5459(A股红涨) */
    var bg = state === "ok" ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)";
    var arrow = state === "ok" ? (dir > 0 ? " ↑" : dir < 0 ? " ↓" : "") : "";
    return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:8px;background:' + bg + ';border:1px solid rgba(255,255,255,.10);font-size:10.5px;font-weight:600;color:' + col + ';white-space:nowrap"><b style="color:rgba(255,255,255,.95);font-weight:700">' + label + '</b> ' + esc(val) + arrow + '</span>';
  }
  /* jl-secpop(1030): 卡面改白话——用户: "对小白不友善, 读起来费劲, 公式放后台"。只改显示层, 四因子/快照/口径零改动; 级别/样本数/待定义/数据不足/事件扩散术语不上卡面 */
  function secRow(rec, i) {
    var f = rec.factors, a = f.avgPct, u = f.upR, z = f.ztN, e = f.evN, L = rec.leaderCand;
    var n = a.state === "ok" && a.note.indexOf("n=") === 0 ? +a.note.slice(2) : 0;
    var col = a.state === "ok" ? (a.raw > 0 ? "#ff5459" : a.raw < 0 ? "#5ae8ab" : "#fff") : "#fff";
    var bits = [];
    if (u.state === "ok" && n) bits.push(n + "只里 " + Math.round(u.raw * n) + "只在涨");
    if (z.state === "ok" && z.raw > 0) bits.push("涨停 " + z.raw + "只");
    if (e.state === "ok" && e.raw && e.raw.codeN) bits.push("盘中异动 " + e.raw.codeN + "只");
    var lead = L && L.cand && L.cand.length ? L.cand.slice(0, 2).map(function (c) { return esc(c.n) + (c.lbc > 1 ? "(" + c.lbc + "连板)" : "(涨停)"); }).join("、") : "";
    return '<div style="padding:7px 9px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline"><span><b style="font-size:12.5px;color:#ffd21f">' + (i != null ? (i + 1) + ". " : "") + esc(rec.sector) + '</b>' + stTag(rec.sector) + '</span>' +
      (a.state === "ok" ? '<b style="font-size:12px;color:' + col + '">平均' + (a.raw >= 0 ? "涨 " : "跌 ") + Math.abs(Math.round(a.raw * 100) / 100).toFixed(2) + "%</b>" : "") + "</div>" +
      (bits.length ? '<div style="font-size:10.5px;color:#fff;font-weight:600;margin-top:3px">' + bits.join(" · ") + "</div>" : "") +
      (lead ? '<div style="font-size:10px;color:rgba(255,255,255,.95);font-weight:600;margin-top:2px">带头的：' + lead + "</div>" : "") + "</div>";
  }
  /* ============ jl-secpop: 今日领涨时间线(30分钟一段) + 换龙头自动弹提醒 ============ */
  function segTxt(kb) { var t0 = new Date(+kb), t1 = new Date(+kb + CORE.BUCKET_MS); return t0.toTimeString().slice(0, 5) + "–" + t1.toTimeString().slice(0, 5); }
  function topOf(recs) { var b = null; (recs || []).forEach(function (r) { if (r.sector !== CORE.UNATTR && r.factors && r.factors.avgPct && r.factors.avgPct.state === "ok" && (!b || r.factors.avgPct.raw > b.factors.avgPct.raw)) b = r; }); return b; }
  function tlRow(r) { var a = r.factors.avgPct, u = r.factors.upR, z = r.factors.ztN, n = a.note.indexOf("n=") === 0 ? +a.note.slice(2) : 0; return { s: r.sector, a: a.raw, n: n, up: u.state === "ok" && n ? Math.round(u.raw * n) : null, zt: z.state === "ok" ? z.raw : 0 }; }
  /* 时间线来源: 本库已落的当日30分桶快照(只读) + 本轮实时数据覆盖当前段; 零新增网络请求 */
  function tlUpdate(cb) {
    var day = S.day, done = function () { try { if (S.live && S.last && S.at) { var t = topOf(S.last.recs); if (t) S.tl[String(CORE.bucket(S.at))] = tlRow(t); } } catch (e) {} cb(); };
    if (S.tlDay === day && S.tl) return done();
    S.tl = {}; S.tlDay = day; S.tlShow = "";
    if (!S.db || !day) return done();
    try {
      var g = S.db.transaction("snap", "readonly").objectStore("snap").getAll(IDBKeyRange.bound(day + "|", day + "|￿"));
      g.onsuccess = function () {
        var by = {}, d2 = day;
        (g.result || []).forEach(function (r) { if (r && r.day === day) (by[r.kb] = by[r.kb] || []).push(r); });
        var fillTl = function () { Object.keys(by).forEach(function (kb) { var t = topOf(by[kb]); if (t) S.tl[String(kb)] = tlRow(t); }); done(); };
        if (Object.keys(by).length || !S.keys) return fillTl();
        var prevD = ""; S.keys.forEach(function (k) { var x = String(k).slice(0, 10); if (x < day && x > prevD) prevD = x; });
        if (!prevD) return fillTl();
        var g2 = S.db.transaction("snap", "readonly").objectStore("snap").getAll(IDBKeyRange.bound(prevD + "|", prevD + "|￿")); /* 当日无快照(夜间/休市)→时间线显示最近有快照的交易日 */
        g2.onsuccess = function () { (g2.result || []).forEach(function (r) { if (r && r.day === prevD) (by[r.kb] = by[r.kb] || []).push(r); }); S.tlShow = prevD; fillTl(); };
        g2.onerror = function () { done(); };
      };
      g.onerror = function () { done(); };
    } catch (e) { done(); }
  }
  function tlSegs() { /* 相邻同一板块合并成一段 */
    var ks = Object.keys(S.tl || {}).map(Number).sort(function (x, y) { return x - y; }), out = [];
    ks.forEach(function (kb) { var v = S.tl[String(kb)], p = out[out.length - 1]; if (p && p.s === v.s && kb - p.k1 <= CORE.BUCKET_MS * 4) { p.k1 = kb; p.v = v; } else out.push({ s: v.s, k0: kb, k1: kb, v: v }); });
    return out;
  }
  function tlHtml() {
    var sg = tlSegs();
    if (!sg.length) return "";
    return '<div style="padding:7px 9px 5px;margin:2px 0 6px;border-radius:9px;background:rgba(255,210,31,.07);border:1px solid rgba(255,210,31,.22)"><div style="font-size:11px;color:#ffd21f;font-weight:700;margin-bottom:3px">' + (S.tlShow && S.tlShow !== S.day ? esc(S.tlShow) + ' 谁在领涨（按时间段·复盘）' : '今天谁在领涨（按时间段）') + '</div>' +
      sg.map(function (g) { var t0 = new Date(g.k0).toTimeString().slice(0, 5), t1 = new Date(g.k1 + CORE.BUCKET_MS).toTimeString().slice(0, 5); return '<div style="display:flex;gap:8px;font-size:10.5px;color:#fff;font-weight:600;line-height:1.75"><span style="flex:0 0 76px;opacity:.95">' + t0 + "–" + t1 + '</span><b style="color:#ffd21f">' + esc(g.s) + '</b><span style="margin-left:auto;color:' + (g.v.a >= 0 ? "#ff5459" : "#5ae8ab") + '">' + fmtPct(g.v.a) + "</span></div>"; }).join("") + "</div>";
  }
  var POP = null, POP_T = 0;
  function popCheck() {
    try {
      if (!S.live || !S.at || document.hidden) return;
      if (localDay(Date.now()) !== S.day || Date.now() - S.at > 40 * 60e3) return; /* 只在当天、数据新鲜时弹; 夜间/周末翻旧数据不弹 */
      var hm = new Date(S.at).getHours() * 100 + new Date(S.at).getMinutes();
      if (hm < 930 || hm > 1500) return;
      var kb = CORE.bucket(S.at), cur = S.tl && S.tl[String(kb)];
      if (!cur) return;
      var prevK = Object.keys(S.tl).map(Number).filter(function (k) { return k < kb; }).sort(function (x, y) { return y - x; })[0], prev = prevK != null ? S.tl[String(prevK)] : null;
      if (prev && prev.s === cur.s) return; /* 龙头没换不打扰 */
      var key = S.day + "|" + kb + "|" + cur.s, seen = lsGet("jl_secpop_seen_v1") || {};
      if (seen.d !== S.day) seen = { d: S.day, k: {} };
      if (seen.k[key]) return;
      seen.k[key] = 1;
      try { localStorage.setItem("jl_secpop_seen_v1", JSON.stringify(seen)); } catch (e) {}
      showPop(segTxt(kb), cur, prev);
    } catch (e) {}
  }
  function showPop(seg, cur, prev) {
    var host = document.querySelector(".phone") || document.body;
    if (!POP) { POP = document.createElement("div"); POP.id = "jlsecPop"; host.appendChild(POP); if (host === document.body) POP.style.position = "fixed"; }
    var up = cur.a >= 0;
    var head = prev ? ("领涨换成了 <b style=\"color:#ffd21f\">" + esc(cur.s) + "</b>（之前是 " + esc(prev.s) + "）") : ((up ? "今天目前最强：" : "今天普遍在跌，最抗跌：") + "<b style=\"color:#ffd21f\">" + esc(cur.s) + "</b>");
    var bits = ["平均" + (up ? "涨 " : "跌 ") + Math.abs(cur.a).toFixed(2) + "%"];
    if (cur.up != null && cur.n) bits.push(cur.n + "只里 " + cur.up + "只在涨");
    if (cur.zt > 0) bits.push("涨停 " + cur.zt + "只");
    POP.innerHTML = '<div class="jlspT">板块提醒 · ' + seg + '<span class="jlspX">✕</span></div><div class="jlspH">' + head + '</div><div class="jlspB">' + bits.join(" · ") + '</div><div class="jlspF">点这里看今天全部时间段 ›</div>';
    POP.classList.add("on");
    POP.onclick = function (ev) { POP.classList.remove("on"); if (ev.target && ev.target.className === "jlspX") return; S.open = true; if (ROOT) { ROOT.style.display = ""; ROOT.classList.add("open"); } };
    clearTimeout(POP_T); POP_T = setTimeout(function () { if (POP) POP.classList.remove("on"); }, 12e3);
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
    var hasAna = !!(S.ana && Object.keys(S.ana).length);
    if (hasAna && S.review) sub = "复盘 " + S.dispDay + (S.lead ? " · 主攻 " + S.lead : "");
    var body = "";
    if (has) {
      var o = S.last, rk = o.ranked.slice(0, 8);
      var restAll = o.recs.filter(function (r) { return r.factors.avgPct.state !== "ok" && r.sector !== CORE.UNATTR; });
      var restMiss = restAll.filter(function (r) { return r.factors.avgPct.state === "miss" || r.factors.avgPct.state === "stale"; }); /* jl-B: 无涨幅数据的板块→合并一行, 不再逐卡铺"数据缺失"小块 */
      var rest = restAll.filter(function (r) { return r.factors.avgPct.state !== "miss" && r.factors.avgPct.state !== "stale"; }).slice(0, 4);
      var unr = o.recs.filter(function (r) { return r.sector === CORE.UNATTR; })[0] || null;
      var sl = S.stale || {}, slTxt = [sl.rows ? "个股涨跌" : "", sl.zt ? "涨停名单" : ""].filter(Boolean);
      if (slTxt.length) body += '<div style="font-size:10px;color:#ffd84a;font-weight:700;padding:5px 2px 3px">⚠ ' + esc(slTxt.join("、")) + "还是旧日子的数据，没算进来</div>"; /* jl-secpop: 白话 */
      body += tlHtml();
      body += rk.length ? '<div style="font-size:11px;color:#fff;font-weight:700;margin:2px 0 0">现在最强的板块</div>' + rk.map(function (r, i) { return secRow(r, i); }).join("") : (hasAna && S.review ? revRank() : '<div style="font-size:10.5px;color:#fff;font-weight:600;padding:6px 2px">现在股票太少，还排不出强弱（等数据多一些会自动出来）</div>');
      if (rest.length) body += '<div style="font-size:9.5px;color:rgba(255,255,255,.95);font-weight:600;margin:6px 0 2px;line-height:1.6">股票太少暂不排名：' + rest.map(function (r) { return esc(r.sector); }).join(" · ") + "</div>";
      body += rotHtml() + pickerHtml(); /* 新增: 放在原有"领涨时间线/现在最强"之后, 原内容不动 */
      /* jl-1207/secpop: 公式、口径、未归属条数、导出按钮都不上卡面(导出仍可 __JLSEC__.exportJSON()) */
    } else if (hasAna) {
      body = tlHtml() + (S.review ? revRank() : "") + rotHtml() + pickerHtml();
    } else {
      body = '<div style="font-size:10.5px;color:#fff;font-weight:600;padding:6px 2px">还没有数据，开盘后会自动算出来</div>';
    }
    /* jl-C: 白玻璃抽屉结构——手柄(拖条+标题+时点+箭头) + 内容区; 开合由ROOT.open类驱动max-height动画 */
    var _pg0 = document.getElementById("jlpgPager"), _ch0 = document.getElementById("jlpgChips"), pgL = _pg0 ? _pg0.scrollLeft : 0, chL = _ch0 ? _ch0.scrollLeft : 0;
    var prevB = document.getElementById("jlsectBody"), sc = prevB ? prevB.scrollTop : 0; /* 刷新保留滚动位置 */
    R.innerHTML = '<div id="jlsectHandle"><span class="jlsecGrab"></span><b>板块强度</b><small' + (has ? '' : ' class="jlsecNo"') + '>' + esc(sub) + '</small><span class="jlsecArr">⌄</span></div>' +
      '<div id="jlsectBody">' + body + "</div>";
    R.classList.toggle("open", !!S.open);
    R.style.display = (has && S.last.ranked && S.last.ranked.length) || hasAna ? "" : "none"; /* jl-1208: 无强度排名(样本不足/无数据)整卡收起不占位, 有排名自动出现 */
    var nb = document.getElementById("jlsectBody");
    if (nb) nb.scrollTop = sc;
    var _pg1 = document.getElementById("jlpgPager"), _ch1 = document.getElementById("jlpgChips");
    if (_pg1) _pg1.scrollLeft = pgL; if (_ch1) _ch1.scrollLeft = chL;
    bindPicker();
    var h = document.getElementById("jlsectHandle");
    if (h) bindHandleJL(h);
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
  window.__JLSEC__ = { CORE: CORE, S: S, rotHtml: rotHtml, pickerHtml: pickerHtml, pickLead: pickLead, compute: compute, exportJSON: exportJSON, diag: diag };
})(typeof window !== "undefined" ? window : globalThis);
