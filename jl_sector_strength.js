/* jl_sector_strength.js — jl-1094 v0.84.39 T4a第一阶段: 可解释板块强度基础层(独立新文件)
   外部JS视觉批 jl-B(2026-10-11, 只动浏览器层渲染, CORE计算/IDB/口径零触碰):
   ①根卡墨绿(rgba(10,26,34,.72)+#81e6d9绿描边)退场→持仓页白玻璃同族(145°白渐变+blur(2px)saturate(160%)brightness(1.08)+白.5描边+inset白高光/外投影族) ②开发术语人话化: "mtemp rows缺失"→"暂无强度数据", "无mtemp"→"暂无数据", 无涨幅数据的板块多卡"数据缺失"小块→合并一行 ③小灰字→白亮两色(数值.95/元信息.78), 红色逻辑#ff8b8f→亮红#ff5459, 卡标题#81e6d9→白 ④大K线图表背景: 评估结论=不属本文件(ks.html体系, v0.84.54已改深蓝香槟金), 本文件无图表对象
   jl-C批次(2026-10-11, 用户四点要求, 依旧只动渲染/交互层, CORE计算/IDB/口径/数据零触碰):
     ①挂载根修: body尾部(被甩到页面最底·导航之下·浏览器栏遮半截)→挂进.phone玻璃抽屉, absolute bottom=54对齐底部tab新高度(index.html jl-1114同步改), z=33(nav30之上/picker·news遮罩面板35/36之下, 弹层仍可盖抽屉)
     ②交互: 底部玻璃抽屉——手柄(拖条+标题+数据时点)常驻tab上方22px, 点按开合/上拉下滑手势(位移>28px或速度>0.45px/ms判向, 小抖动回弹), 开合=max-height裁剪动画(22px↔min(58vh,520px)), 内容区内滚+滚动位置跨刷新保留
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
    /* jl-fund(1104): 用户: 永臻股份(光伏设备)主概念记成"反内卷概念"太泛——这几类泛概念不当板块, 改用东财二级行业l2; 名字太怪的板块起显示名 */
    GENERIC: { "养老金": 1, "反内卷概念": 1, "参股新三板": 1, "并购重组概念": 1, "中特估": 1, "中字头": 1, "股权转让": 1 },
    ALIAS: { "高带宽内存": "HBM存储" },
    alias: function (n) { return CORE.ALIAS[n] || n; },
    unalias: function (n) { for (var k in CORE.ALIAS) if (CORE.ALIAS[k] === n) return k; return n; },
    sectorOf: function (code, ctx, hy) {
      code = String(code == null ? "" : code);
      var m = ctx && ctx.con && ctx.con[code];
      if (m && m.mc && CORE.GENERIC[m.mc] && m.l2) return { name: CORE.alias(String(m.l2)), tier: "sec" };
      if (m && m.mc) return { name: CORE.alias(m.mc), tier: "mc" };
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
    /* ===== RRG式相对轮动: x=近5日均涨幅-全板块中位, y=今日强度-前几日均(无历史则用上涨率估) ===== */
    avgWin: function (days, i, sec, n) {
      var sm = 0, c = 0;
      for (var j = i; j >= 0 && c < n; j--) { var e = days[j].m && days[j].m[sec]; if (!e || e.avg == null) break; sm += e.avg; c++; }
      return c ? sm / c : null;
    },
    medianAt: function (days, i) {
      var a = [];
      Object.keys(days[i].m || {}).forEach(function (k) { var v = CORE.avgWin(days, i, k, 5); if (v != null) a.push(v); });
      a.sort(function (x, y) { return x - y; });
      return a.length ? a[Math.floor(a.length / 2)] : 0;
    },
    rrgPt: function (days, i, sec, med) {
      var e = days[i] && days[i].m && days[i].m[sec];
      if (!e || e.avg == null) return null;
      var rs = CORE.avgWin(days, i, sec, 5), prev = i > 0 ? CORE.avgWin(days, i - 1, sec, 4) : null;
      var y = prev == null ? ((e.up == null ? 0.5 : e.up) - 0.5) * 10 : e.avg - prev;
      return { x: rs - med, y: y, est: prev == null };
    },
    bucket: function (at) { return Math.floor((+at || 0) / CORE.BUCKET_MS) * CORE.BUCKET_MS; },
    /* ===== jl-fund(1104): 板块主力资金信号(东财概念板块 f3涨幅/f62主力净额/f184主力净占比%) =====
       用户11-04: 小金属9:45主力已净流入13.76亿(占成交9.3%)而板块才+0.7%, 下午才拉——要能提前埋伏; 反过来科技股常急拉但大资金在出, 也要标出来 */
    FUND: { IN_FR: 6, IN_F: 3e8, IN_PMAX: 1.5, IN_PMIN: -1.5, OUT_P: 2, OUT_FR: -2, DRAIN_P: -1, DRAIN_FR: -3 }, /* 初值, 未回测 */
    fundSig: function (q, ourAvg, th) {
      th = th || CORE.FUND;
      if (!q || !isFinite(q.p) || !isFinite(q.f)) return null;
      var fr = isFinite(q.fr) ? q.fr : 0, up = Math.max(q.p, ourAvg != null && isFinite(ourAvg) ? ourAvg : -99); /* 11-12: isFinite(null)为真, 显式排除 */
      if (fr >= th.IN_FR && q.f >= th.IN_F && q.p <= th.IN_PMAX && q.p >= th.IN_PMIN) return { k: "in", txt: "资金先进" };
      if (up >= th.OUT_P && q.f < 0 && fr <= th.OUT_FR) return { k: "out", txt: "拉高在出", tier: 1 }; /* 11-13 白话三档: 1拉高在出/2不涨在出/3跌着在出 (只改文案, 条件不动) */
      /* 11-11 用户: 原来只有"涨着钱在出"才报, 板块跌着钱也在走这种正常退潮形态全漏——补一条纯流出
         11-12 用户: 通信技术+1.04%而主力净占比-3.41%(光通信CPO占仓6成)整个下午没报——0~2%微涨出货两头不沾(拉升出要涨够2%, 跌着出要真跌), 并进本条: 涨不够2%也算, 门槛从严一档(净占比≤-3%) */
      if (up < th.OUT_P && q.f < 0 && fr <= th.DRAIN_FR) return { k: "out", txt: q.p < 0 ? "跌着在出" : "不涨在出", tier: q.p < 0 ? 3 : 2, drain: q.p < 0 ? 1 : 0 }; /* drain按板块实际涨跌定文案(不按up: ourAvg=null时isFinite(null)为真被当0, 跌着的板块up会被抬到0) */
      return null;
    },
    /* jl-scope(1104 第二版): 用户: 不是1000多个板块都报, 也不是固定的科技名单——当天实际火的板块(强度强/主力真在进)才提醒; 前几天火的板块在跑路也要提醒 */
    TOPN: 20,
    alertScope: function (sec, rank, picks, fundRank, recentTop, heldSecs) {
      if (heldSecs && heldSecs[sec]) return "我的持仓"; /* 11-11 用户: 手里有的板块无条件进提醒范围——原来撞不在名单里, 出逃不响 */
      if (picks && picks.indexOf(sec) >= 0) return "我盯的";
      if (rank != null && rank <= CORE.TOPN) return "今天强度前" + CORE.TOPN;
      if (fundRank != null && fundRank <= CORE.TOPN) return "今天主力流入前" + CORE.TOPN;
      if (recentTop) return "近3天强势";
      return null;
    },
    /* 11-11: 持仓所在板块(只读 jinlin_stocks_v2 + 归属表, 零新增请求) → {板块名: [票名]} */
    heldSecMap: function () {
      var st = null; try { st = (typeof lsGet === "function" ? lsGet("jinlin_stocks_v2") : null); } catch (e) {}
      if (!Array.isArray(st)) return {};
      var ctx = { con: (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {}, sec: (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {} }, G = {};
      st.forEach(function (x) {
        if (!x || !(x.qty > 0) || !/^\d{6}$/.test(String(x.code))) return;
        var o = CORE.sectorOf(x.code, ctx);
        if (!o || !o.name || o.name === CORE.UNATTR) return;
        (G[CORE.alias(o.name)] = G[CORE.alias(o.name)] || []).push(x.name || x.code);
      });
      return G;
    },
    /* 当前阶段持续期间的累计涨幅(按每日板块平均涨幅连乘) */
    runGain: function (days, i, sec, n) {
      var c = 1, used = 0;
      for (var j = i; j > i - n && j >= 0; j--) { var e = days[j].m && days[j].m[sec]; if (!e || e.avg == null) break; c *= 1 + e.avg / 100; used++; }
      return used ? Math.round((c - 1) * 1e4) / 100 : null;
    },
    /* ===== 11-11 退潮领先 =====
       原来只有 stageAt 的⑤退潮=事后(掉出前10/转跌算完), 这里改成盘中就能看出"在走弱"。
       === 11-12 回测结论(东财涨停池11个交易日×61个板块×554只日K, 用"次日超额=板块涨幅-当日全板块均值"做被解释量) ===
       对照=当天强度排前20的板块, 次日超额 +0.12%, 次日下跌占 47.6%
       ① 涨停腰斩(昨≥3只→今天≤一半):   n=10  次日超额 -1.41%  跌占比 70.0%  ← 唯一站得住, 保留
       ② 涨>1.5%但上涨面<55%:          n=17  次日超额 -0.26%  跌占比 64.7%  ← 方向对但幅度小, 保留当辅助
       ③ 累计5日≥8%:                   n=59  次日超额 -0.34%  跌占比 52.5%  ← 弱, 降为"提示"权重1
       ①+② 组合:                       n=26  次日超额 -0.71%  跌占比 65.4%  ← 组合比单条好
       全部差值 t≈1.5(不显著), 原因是样本只有11天。方向可用, 幅度不能当承诺——所以文案写"在走弱"不写"必跌"。
       资金那条(主力连出/高位派发)没回测: 板块资金日线接口在本机不通, 只能用App里逐日攒的 jl_secfund_day_v1,
       攒够样本前保留但不计入"高"档, 避免没验证过的东西把人吓跑。 */
    DECAY: { ZT_PREV: 3, ZT_R: 0.5, UPR_FAKE: 0.55, AVG_FAKE: 1.5, FUND_OUT_DAYS: 2, HOT_CUM: 8, BACKTESTED: 1 }, /* 阈值按11-12回测定 */
    /* days: S.days; i: 末位; sec; q: 今日板块资金; fundHist: {day: 主力净额(万元)} */
    decayOf: function (days, i, sec, q, fundHist) {
      var T = CORE.DECAY, d = days[i] && days[i].m && days[i].m[sec];
      if (!d) return null;
      var pv = i > 0 && days[i - 1] && days[i - 1].m ? days[i - 1].m[sec] : null;
      var st = CORE.stageAt(days, i, sec), cum5 = st ? st.cum5 : 0, items = [];
      /* ① 涨停家数腰斩 —— 回测里唯一站得住的(n=10, 次日超额-1.41%, 七成下跌), 权重给足 */
      if (pv && pv.zt >= T.ZT_PREV && d.zt <= pv.zt * T.ZT_R) items.push({ k: "zt", t: "涨停 " + pv.zt + "→" + d.zt + " 只（腰斩）", w: 3 });
      /* ② 涨幅与上涨面背离 = 少数几只拉的(用户说的"假涨"). 回测 n=17, 六成半次日下跌, 方向对幅度小 */
      if (d.up != null && d.avg != null && d.avg >= T.AVG_FAKE && d.up < T.UPR_FAKE) items.push({ k: "div", t: "涨 " + d.avg.toFixed(1) + "% 但只有 " + Math.round(d.up * 100) + "% 在涨", w: 2 });
      /* ③ 这一波涨太多 —— 回测弱(跌占比只52%), 只当提示, 权重1 */
      if (cum5 >= T.HOT_CUM && st && st.k >= 2 && st.k <= 3) items.push({ k: "hot", t: "这段已累计 +" + cum5.toFixed(1) + "%", w: 1 });
      /* ④ 主力连出 / 高位派发 —— 没回测(资金日线接口不通), 保留但只算1分, 不靠它单独判"高" */
      var fh = fundHist || {}, ds = Object.keys(fh).sort().filter(function (x) { return x <= days[i].day; }), outN = 0;
      for (var k = ds.length - 1; k >= 0 && outN < T.FUND_OUT_DAYS; k--) { if (fh[ds[k]] < 0) outN++; else break; }
      if (outN >= T.FUND_OUT_DAYS) items.push({ k: "fund", t: "主力连出 " + outN + " 天（未回测）", w: 1 });
      if (q && isFinite(q.f) && q.f < 0 && d.rank != null && d.rank <= 5) items.push({ k: "dump", t: "强度第" + d.rank + " 但主力净流出（未回测）", w: 1 });
      if (!items.length) return null;
      var sc = items.reduce(function (a, b) { return a + b.w; }, 0);
      /* 高=5分以上, 而5分现在只有"涨停腰斩(3)+假涨(2)"才够 —— 对应回测里那条-0.71%/65%下跌的组合 */
      return { items: items, score: sc, lv: sc >= 5 ? "高" : sc >= 3 ? "中" : "低" };
    },
    /* ===== jl-surge(1104): 盘中急拉——板块平均涨幅在最近30个交易分钟里抬了多少(午休不算时间) ===== */
    SURGE: { WIN: 30, MIN_AGE: 12, D: 1.5, AVG: 1.0, UPR: 0.6, MIN_N: 8 }, /* 初值, 未回测: 30分钟内+1.5个点·现平均≥+1%·上涨率≥60%·样本≥8只 */
    tradeMin: function (at) { var d = new Date(+at), m = d.getHours() * 60 + d.getMinutes(); return m <= 690 ? m - 570 : Math.max(120, m - 660); }, /* 9:30=0, 11:30=120, 13:00=120 */
    /* hist: [{t, m:{sec:{a,u,n,z}}}] 时间升序(不含当前); cur: {t, m}; 返回 [{sec, d, base, a, u, n, z, age}] 按d降序 */
    surgeScan: function (hist, cur, th) {
      th = th || CORE.SURGE;
      var tn = CORE.tradeMin(cur.t), out = [];
      Object.keys(cur.m || {}).forEach(function (sec) {
        var c = cur.m[sec]; if (!c || c.a == null || (c.n || 0) < th.MIN_N) return;
        if (c.a < th.AVG || (c.u != null && c.u < th.UPR)) return;
        var base = null, age = 0;
        for (var i = 0; i < (hist || []).length; i++) {
          var h = hist[i], e = h.m && h.m[sec], dt = tn - CORE.tradeMin(h.t);
          if (!e || e.a == null || dt <= 0 || dt > th.WIN) continue;
          age = Math.max(age, dt); if (base == null || e.a < base) base = e.a;
        }
        if (base == null || age < th.MIN_AGE) return; /* 窗口里没有足够早的点=不判, 防刚打开App误报 */
        var d = c.a - base;
        if (d >= th.D) out.push({ sec: sec, d: Math.round(d * 100) / 100, base: base, a: c.a, u: c.u, n: c.n, z: c.z || 0, age: age });
      });
      return out.sort(function (x, y) { return y.d - x.d; });
    },
    /* 当前阶段(①–③活跃段)从哪天开始: 往回数连续处于萌芽/启动/加速的天数 */
    stageRun: function (days, i, sec) {
      var st = CORE.stageAt(days, i, sec); if (!st || !st.k) return null;
      var act = st.k <= 3, j = i, n = 0;
      for (; j >= 0; j--) { var s = CORE.stageAt(days, j, sec); if (!s || !s.k || (act ? s.k > 3 : s.k !== st.k)) break; n++; }
      return { k: st.k, from: days[j + 1].day, n: n };
    },
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

  var S = { db: null, keys: null, day: null, at: null, last: null, stat: null, open: false, lastT3: null, tl: null, tlDay: "", live: false, hc: {}, flow: {}, flowP: {}, mem: {}, memP: {}, bk: null, bkP: null, flowT: 0, ana: null, lead: null, leadN: 0 };
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
        tlUpdate(function () { histUpdate(function () { surgeCheck(); ensureBkq(); paint(); popCheck(); decayCheck(); }); });
      });
    } catch (e) { S.last = null; paint(); }
  }

  /* ============ 渲染: 底部玻璃抽屉(jl-C: body尾卡→挂.phone, bottom对齐底部tab54px; CSS自注入) ============ */
  var ROOT = null;
  var DRAG = { on: false, y0: 0, dy: 0, t0: 0, h0: 0 }; /* jl-C: 手柄拖拽态, paint()拖拽中跳过防DOM重建丢监听 */
  var JSEC_CSS = "#jlsectroot{position:absolute;left:8px;right:8px;bottom:54px;z-index:33;overflow:hidden;pointer-events:none;max-height:22px;transition:max-height .34s cubic-bezier(.32,.72,.28,1);border-radius:12px 12px 0 0;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.4);border-bottom:0;backdrop-filter:blur(2px) saturate(160%) brightness(1.08);-webkit-backdrop-filter:blur(2px) saturate(160%) brightness(1.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.55)}#jlsectroot.open{background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.045))}" /* 11-11 用户: 开态原来 .38 深蓝半透会透底图、也不搭持仓页; 改持仓卡同款白玻璃家族(只加密一档保证长文字可读, 仍走 blur2 saturate160 brightness1.08 那套) */ /* 根=裁剪容器: max-height 22(只露手柄)↔min(58vh,520px)开; 遮罩裁剪=隐藏体不压导航不吞点击 */
    + "#jlsectroot.open{max-height:min(58vh,520px)}"
    + "body.ksFullJL #jlsectroot{display:none!important}" /* K线全屏模式nav隐藏, 抽屉同退场 */
    + "#jlsectHandle{height:22px;display:flex;align-items:center;gap:6px;padding:0 10px;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}" /* touch-action:none=拖拽不被页面滚动抢占 */
    + "#jlsectHandle .jlsecGrab{display:none;flex:0 0 auto;width:30px;height:4px;border-radius:10px;background:rgba(255,255,255,.55);box-shadow:0 1px 2px rgba(0,0,0,.4)}"
    + "#jlsectHandle b{font-size:11px;color:#fff;font-weight:700;letter-spacing:.5px;flex:0 0 auto}"
    + "#jlsectHandle small{font-size:10px;color:#FFFFFF;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" /* jl-C: 灰.78→亮白.95加粗 */
    + "#jlsectHandle small.jlsecNo{color:#ffd84a;font-size:9.5px;font-weight:700}"
    + "#jlsectHandle .jlsecRd{flex:0 0 auto;font-size:9.5px;font-weight:800;color:#10131a;background:#ff5459;border-radius:8px;padding:1px 6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35)}" /* 11-12 未读角标 */
    + "#jlsectHandle .jlsecArr{margin-left:auto;flex:0 0 auto;font-size:10px;color:#FFFFFF;font-weight:700;transition:transform .3s}"
    + "#jlsectroot.open .jlsecArr{transform:rotate(180deg)}"
    + "#jlsectBody{overflow-y:auto;max-height:calc(min(58vh,520px) - 34px);pointer-events:auto;overscroll-behavior:contain;padding:2px 11px 12px}" /* 内容区内滚, 关态被根裁剪自然无事件 */
    + "#jlsecPop{position:absolute;left:12px;right:12px;bottom:84px;z-index:34;padding:9px 12px 8px;border-radius:12px;background:linear-gradient(145deg,rgba(20,30,44,.72),rgba(10,16,28,.62));-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%);border:1px solid rgba(255,210,31,.45);box-shadow:0 8px 26px rgba(0,0,0,.45);color:#fff;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .3s,transform .3s;cursor:pointer}"
    + "#jlsecPop.on{opacity:1;transform:none;pointer-events:auto}"
    + "#jlsecPop .jlspT{font-size:10.5px;font-weight:700;color:#ffd21f;display:flex;align-items:center}#jlsecPop .jlspX{margin-left:auto;padding:0 2px 0 12px;font-size:12px;color:#fff}"
    + "#jlsecPop .jlspH{font-size:13px;font-weight:700;margin-top:4px}#jlsecPop .jlspB{font-size:11px;font-weight:600;margin-top:3px}#jlsecPop .jlspF{font-size:10px;font-weight:600;margin-top:4px;opacity:.85}"
    + "body.ksFullJL #jlsecPop{display:none!important}"
    /* jl-surge: 急拉弹窗——比换龙头提醒醒目: 实底+红边脉冲+大字, 90秒或点✕才收 */
    + "#jlsecSurge{position:fixed;box-sizing:border-box;left:10px;right:10px;bottom:84px;z-index:2147483100;max-height:62vh;overflow-y:auto;padding:10px 12px 9px;border-radius:14px;background:linear-gradient(150deg,rgba(58,14,20,.94),rgba(18,12,22,.94));border:2px solid #ff5459;color:#fff;opacity:0;transform:translateY(14px);pointer-events:none;transition:opacity .3s,transform .3s}"
    + "#jlsecSurge.on{opacity:1;transform:none;pointer-events:auto;animation:jlsgPulse 1.4s ease-out 4!important /* 11-12: 全局animation:none省电规则误杀提醒闪→白名单 */}"
    + "@keyframes jlsgPulse{0%{box-shadow:0 0 0 0 rgba(255,84,89,.75),0 10px 30px rgba(0,0,0,.5)}80%{box-shadow:0 0 0 14px rgba(255,84,89,0),0 10px 30px rgba(0,0,0,.5)}100%{box-shadow:0 0 0 0 rgba(255,84,89,0),0 10px 30px rgba(0,0,0,.5)}}"
    + "#jlsecSurge .jlsgT{display:flex;align-items:center;font-size:12px;font-weight:800;color:#ff7a7e}#jlsecSurge .jlsgX{margin-left:auto;padding:0 2px 0 14px;font-size:14px;color:#fff;cursor:pointer}"
    + "#jlsecSurge .jlsgH{font-size:19px;font-weight:800;color:#ffd21f;margin-top:3px;letter-spacing:.5px}#jlsecSurge .jlsgB{font-size:11.5px;font-weight:600;margin-top:2px;line-height:1.55}#jlsecSurge .jlsgB b{color:#ff5459}"
    + "#jlsecSurge .jlsgL{margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,.15)}#jlsecSurge .jlsgGo{font-size:10.5px;font-weight:700;margin-top:5px;color:#ffd21f;cursor:pointer}"
    + "#jlsecSurge .jlsgPg{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin:0 -2px}#jlsecSurge .jlsgPg::-webkit-scrollbar{display:none}"
    + "#jlsecSurge .jlsgP{flex:0 0 100%;box-sizing:border-box;padding:0 2px;scroll-snap-align:start}#jlsecSurge .jlsgK{font-size:11px;font-weight:800;margin-top:4px;opacity:.95}"
    + "#jlsecSurge .jlsgD{display:inline-block;min-width:22px;text-align:center;font-size:17px;line-height:1;cursor:pointer;color:#fff}"
    + "#jlsecSurge .jlsgDots{text-align:center;margin-top:4px}#jlsecSurge .jlsgDots i{display:inline-block;width:6px;height:5px;margin:0 2px;border-radius:3px;background:rgba(255,255,255,.35)}#jlsecSurge .jlsgDots i.on{width:14px;background:#fff}"
    + "#jlsecSurge.view{border-color:rgba(255,255,255,.7);background:linear-gradient(150deg,rgba(22,30,44,.96),rgba(12,16,26,.95));animation:none!important}#jlsecSurge.view .jlsgT{color:#fff}"
    + "#jlsecSurge.out.on{animation-name:jlsgPulseO}"
    + "#jlsecSurge.decay{border-color:#2fd18b;background:linear-gradient(150deg,rgba(6,40,28,.96),rgba(10,18,14,.95))}#jlsecSurge.decay.on{animation-name:jlsgPulseO}" /* 11-11 退潮前兆窗: 绿=在走弱 */
    + "@keyframes jlsgPulseO{0%{box-shadow:0 0 0 0 rgba(47,209,139,.75),0 10px 30px rgba(0,0,0,.5)}80%{box-shadow:0 0 0 14px rgba(47,209,139,0),0 10px 30px rgba(0,0,0,.5)}100%{box-shadow:0 0 0 0 rgba(47,209,139,0),0 10px 30px rgba(0,0,0,.5)}}"
    + "#jlsecSurge.fund{border-color:#ffd21f;background:linear-gradient(150deg,rgba(52,40,8,.95),rgba(18,14,10,.94))}#jlsecSurge.fund .jlsgT{color:#ffd21f}#jlsecSurge.fund.on{animation-name:jlsgPulseG}#jlsecSurge.out{border-color:#2fd18b;background:linear-gradient(150deg,rgba(8,46,32,.95),rgba(10,18,14,.94))}#jlsecSurge.out .jlsgT{color:#2fd18b}" /* 11-12: 此处为 .out 生效样式; 上方同名旧定义已删 */
    + "@keyframes jlsgPulseG{0%{box-shadow:0 0 0 0 rgba(255,210,31,.75),0 10px 30px rgba(0,0,0,.5)}80%{box-shadow:0 0 0 14px rgba(255,210,31,0),0 10px 30px rgba(0,0,0,.5)}100%{box-shadow:0 0 0 0 rgba(255,210,31,0),0 10px 30px rgba(0,0,0,.5)}}"
    + "#jlsectroot.surge{border-color:#ff5459;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 0 12px rgba(255,84,89,.65)}#jlsectroot.surge #jlsectHandle small{color:#ffd21f}"
    /* 11-12 热力图改版: 表头+日期列+等宽数字, 缺数据那天=斜纹 */
    + ".jlhmCard{padding:0;margin:2px 0 0;border-radius:0;background:none;border:0}" + ".jlsc>.jlhmCard{padding:0;margin:0}"
    + ".jlhmCard .num{font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\"}"
    + ".jlhmX{background:repeating-linear-gradient(45deg,rgba(255,255,255,.075) 0 3px,transparent 3px 6px);border:1px solid rgba(255,255,255,.06)}"
    /* ===== 11-12 用户: 整个抽屉统一排版(配色保留, 只改排版) =====
       规则: 卡片=一张, 内部用分区标题; 文字字重<=600; 所有数字等宽; 可点数值带下划点线提示 */
    + ".jlsc{margin:0 0 8px;padding:9px 10px 7px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.16)}"
    + ".jlsc>.jlscT{display:flex;align-items:baseline;gap:6px;margin-bottom:2px}"
    + ".jlsc>.jlscT b{font-size:12px;font-weight:600;color:#fff;letter-spacing:.2px}"
    + ".jlsc>.jlscT i{font-style:normal;font-size:9.5px;font-weight:400;color:#fff;opacity:.66}"
    + ".jlsc>.jlscT u{margin-left:auto;text-decoration:none;font-size:10px;font-weight:500;color:#cfe4ff}"
    + ".jlsc .jlsh{display:flex;align-items:baseline;gap:6px;margin:7px 0 3px}"
    + ".jlsc .jlsh b{font-size:10.5px;font-weight:600;color:#fff}"
    + ".jlsc .jlsh i{font-style:normal;font-size:9.5px;font-weight:400;color:#fff;opacity:.6}"
    + ".jlsc .jlsh u{margin-left:auto;text-decoration:none;font-size:9.5px;font-weight:400;color:#fff;opacity:.6}"
    + ".jlsc .jlst{display:flex;align-items:baseline;gap:6px;padding:0 0 3px;border-bottom:1px solid rgba(255,255,255,.18);font-size:9.5px;font-weight:400;color:#fff;opacity:.72;letter-spacing:.3px}"
    + ".jlsc .jlst span{flex:0 0 auto}"
    + ".jlsc .jlrow{display:flex;align-items:baseline;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.055);font-size:11.5px;font-weight:500;color:#fff}"
    + ".jlsc .jlrow:last-child{border-bottom:0}"
    + ".jlsc .jlrow>em{font-style:normal;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".jlsc .jlrow s,.jlsc .jlrow em s{text-decoration:none;flex:0 0 auto;font-size:10px;font-weight:400;opacity:.7}"
    + ".jlsc .jlrow>b{flex:0 0 auto;font-weight:600}"
    + ".jlsc .jn{font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\";text-align:right}"
    + ".jlsc .jf{font-size:9.5px;font-weight:400;color:#fff;opacity:.66;line-height:1.55;margin-top:4px}"
    + ".jlsc .jtag{font-style:normal;flex:0 0 auto;font-size:9px;font-weight:500;line-height:1.5;padding:0 4px;border-radius:4px;border:1px solid currentColor;opacity:.9}"
    + "@media (prefers-reduced-motion:reduce){#jlsectroot{transition:none}#jlsectHandle .jlsecArr{transition:none}#jlsecPop{transition:none}#jlsecSurge{transition:none;animation:none!important}}";

  /* ============ jl-rot(2026-11-03): 板块生命周期圆环——在原抽屉上加, 原内容不动。历史=既有IDB快照(零新请求), 阶段=CORE.stageAt ============ */
  /* 11-12: 原此处 STC 数组被下方同名对象覆盖, 已删 */ /* 单色系: 白=冷/暖金=热/灰=退, 红绿只留给涨跌与资金 */
  function dayMapOf(recs) {
    var m = {};
    (recs || []).forEach(function (r) {
      if (!r || r.sector === CORE.UNATTR || !r.factors) return;
      var a = r.factors.avgPct, u = r.factors.upR, z = r.factors.ztN, L = r.leaderCand;
      var okA = a && a.state === "ok";
      var zt = z && z.state === "ok" ? +z.raw || 0 : 0, early = L && L.early ? +L.early.n || 0 : 0;
      if (!okA && !zt) return;
      m[CORE.alias(r.sector)] = { avg: okA ? a.raw : null, up: u && u.state === "ok" ? u.raw : null, zt: zt, early: early, rank: r.mid && r.mid.rank != null ? r.mid.rank : null };
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
    var c = A.cur, D = S.days || [], run = D.length ? CORE.stageRun(D, D.length - 1, sec) : null, when = "";
    if (run) { /* jl-surge: 写清从哪天起、第几天; 历史不够时写"≥" */
      var cap = run.n >= D.length ? "≥" : "", g = CORE.runGain(D, D.length - 1, sec, run.n);
      when = run.n <= 1 ? (S.review ? " · 当天" : " · 今天起") : " · 第" + cap + run.n + "天 " + String(run.from).slice(5) + "起";
      if (g != null && run.n >= 2) when += " 累计" + (g >= 0 ? "+" : "") + g.toFixed(1) + "%"; /* 这段阶段里板块一共涨了多少 */
    }
    /* 11-09 用户: 阶段/天数/累计字太暗看不到 → 亮白加粗加底 */
    return ' <span style="font-size:10.5px;font-weight:800;padding:0 6px;margin-left:5px;border-radius:7px;white-space:nowrap;color:' + (c.k === 3 ? "#ffd21f" : "#fff") + ';background:rgba(255,255,255,.12);border:1px solid ' + (c.k === 3 ? "#ffd21f" : "rgba(255,255,255,.85)") + '">' + CORE.STAGES[c.k] + when + "</span>";
  }
  /* 11-11 退潮前兆行: 命中≥1条就显示(原来只有阶段⑤退潮=事后才知道)。放在板块行的"涨停N只"下面 */
  function decayHtml(sec) {
    var D = S.days; if (!D || !D.length) return "";
    var i = D.length - 1, dk;
    try { dk = CORE.decayOf(D, i, sec, bkqOf(sec), fundHistOf(sec)); } catch (e) { return ""; }
    if (!dk) return "";
    var col = dk.lv === "高" ? "#ff5459" : dk.lv === "中" ? "#ffd21f" : "rgba(255,255,255,.95)";
    var bg = dk.lv === "高" ? "rgba(255,84,89,.16)" : dk.lv === "中" ? "rgba(255,210,31,.14)" : "rgba(255,255,255,.06)";
    return '<div style="margin-top:4px;padding:4px 7px;border-radius:8px;background:' + bg + ';border:1px solid ' + (dk.lv === "高" ? "rgba(255,84,89,.55)" : "rgba(255,255,255,.14)") + '">' +
      '<div style="font-size:10.5px;font-weight:800;color:' + col + '">⚠ 退潮前兆 · ' + dk.lv + "</div>" +
      '<div style="font-size:10px;font-weight:600;color:#fff;margin-top:1px;line-height:1.55">' + dk.items.map(function (x) { return esc(x.t); }).join(" · ") + "</div></div>";
  }
  /* 11-11 退潮前兆汇总卡: 把所有命中前兆的板块按分数排, 一格一行; 抽屉里"现在最强"之后就能看到谁在走弱 */
  function decayBoardHtml() {
    var D = S.days; if (!D || !D.length) return "";
    var i = D.length - 1, rows = [];
    Object.keys(S.ana || {}).forEach(function (sec) {
      var dk; try { dk = CORE.decayOf(D, i, sec, bkqOf(sec), fundHistOf(sec)); } catch (e) { return; }
      if (!dk) return;
      var held = S.heldSecs && S.heldSecs[sec];
      rows.push({ sec: sec, dk: dk, held: held });
    });
    if (!rows.length) return "";
    rows.sort(function (a, b) { return (b.dk.score - a.dk.score) || (b.held ? 1 : 0) - (a.held ? 1 : 0); });

    var LC = { "高": "#ff5459", "中": "#ffd21f", "低": "rgba(255,255,255,.85)" };
    var body = rows.slice(0, 8).map(function (r) {
      var c = LC[r.dk.lv];
      return '<div class="jlrow" data-jlsec="' + esc(r.sec) + '" style="align-items:flex-start">' +
        '<em><span style="display:block;font-weight:500">' + esc(r.sec) + (r.held ? '<i class="jtag" style="color:#ffd21f;margin-left:5px">我的持仓</i>' : "") + "</span>" +
        '<span style="display:block;font-size:9.5px;font-weight:400;opacity:.72;line-height:1.5;margin-top:1px">' + r.dk.items.map(function (x) { return esc(x.t); }).join(" · ") + "</span></em>" +
        '<b class="jn" style="flex:0 0 18px;color:' + c + '">' + r.dk.lv + "</b></div>";
    }).join("");
    return '<div class="jlsh"><b style="color:#5ae8ab">退潮前兆</b><i>现在就在走弱，不是等跌下来才说</i></div>' + body +
      '<div class="jf">看四条：涨停是不是在少、涨了但多数票没涨（少数几只拉的）、主力连着几天在出、排在前面但钱在走。回测（11天·61板块）只有「涨停腰斩」明确有效（次日跌的占七成），样本短，方向可用别当保证。</div>';
  }
  /* 11-09 用户: 3D轮动看不出待了几天涨了多少 → 换热力图: 一行一个板块, 一格一天(颜色=当天板块平均涨跌, 底条=阶段), 右边大字=当前阶段第几天+这段累计。数据同 S.days, 零新增请求。旧 rotHtml 留着不挂 */
  var STC = { 1: "#b9c6d8", 2: "#cfe4ff", 3: "#9cc8ff", 4: "#a7b6cc", 5: "#8b97a8" }; /* 11-12: 热力图阶段文字改柔和单色 */
  /* 11-12 用户: 热力图照《板块抽屉改版示意》重做——去蓝底黄字/字重800→500-600/表头+等宽数字/日期列/格子写平均涨跌%/缺数据斜纹 */
  function heatHtml() {
    var A = S.ana, D = S.days; if (!A || !D || !D.length) return "";
    var last = D.length - 1, ord = { 3: 0, 2: 1, 1: 2, 4: 3, 5: 4 }, ld = S.lead && A[S.lead] ? S.lead : null, tr = lsGet("jl_secrec_v1") || {};
    var list = Object.keys(A).filter(function (k) { return A[k].cur.k; }).sort(function (x, y) { var a = A[x].cur, b = A[y].cur; return (ord[a.k] - ord[b.k]) || ((a.rank == null ? 99 : a.rank) - (b.rank == null ? 99 : b.rank)); });
    curPicks().concat(Object.keys(tr)).forEach(function (k) { if (list.indexOf(k) < 0 && A[k]) list.unshift(k); });
    list = list.slice(0, 14);
    if (!list.length) return "";
    var nd = Math.min(7, D.length), d0 = D.length - nd, cols = D.slice(d0);
    var grid = "display:grid;align-items:center;gap:2px;grid-template-columns:84px " + cols.map(function () { return "1fr"; }).join(" ") + " 76px";
    var bg = function (v) { if (v == null) return ""; var a = Math.min(Math.abs(v) / 3, 1) * 0.78 + 0.1; return v >= 0 ? "rgba(226,72,76," + a.toFixed(2) + ")" : "rgba(20,160,110," + a.toFixed(2) + ")"; };
    var head = '<div style="' + grid + ';border-bottom:1px solid rgba(255,255,255,.18);padding-bottom:4px;margin-bottom:2px">' +
      '<span></span>' + cols.map(function (d) { return '<span class="num" style="font-size:9.5px;font-weight:400;color:#fff;text-align:center;letter-spacing:.3px">' + esc(String(d.day).slice(5)) + "</span>"; }).join("") +
      '<span class="num" style="font-size:9.5px;font-weight:400;color:#fff;text-align:right">阶段 · 区间</span></div>';
    var rows = list.map(function (sec) {
      var c = A[sec].cur, run = c.k ? CORE.stageRun(D, last, sec) : null, g = run ? CORE.runGain(D, last, sec, run.n) : null, cap = run && run.n >= D.length ? "≥" : "";
      var isLead = sec === ld, isTrk = !!tr[sec];
      var cells = cols.map(function (d, j) {
        var e = d.m[sec], v = e && e.avg != null ? e.avg : null;
        if (v == null) return '<span class="jlhmX" style="height:22px;border-radius:4px"></span>';
        return '<span class="num" style="height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;background:' + bg(v) + ';font-size:10px;font-weight:500;color:#fff">' + (v >= 0 ? "+" : "") + v.toFixed(1) + "</span>";
      }).join("");
      var right = c.k ? '<span style="font-size:10.5px;font-weight:600;color:' + STC[c.k] + '">' + CORE.STAGES[c.k] + " " + cap + (run ? run.n : 1) + "日</span>" +
        (g != null && run && run.n >= 2 ? '<span class="num" style="display:block;font-size:10.5px;font-weight:600;color:' + (g >= 0 ? "#ff6b6f" : "#2fe0a0") + '">' + (g >= 0 ? "+" : "") + g.toFixed(1) + "%</span>" : '') : '<span style="font-size:10px;font-weight:400;color:#fff;opacity:.6">—</span>';
      return '<div data-jlsec="' + esc(sec) + '" style="' + grid + ';padding:2px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
        '<span style="display:flex;align-items:center;gap:4px;min-width:0">' +
        '<b style="font-size:11.5px;font-weight:500;color:' + (isLead ? "#cfe4ff" : isTrk ? "#9cc8ff" : "#fff") + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(String(sec).replace(/概念$/, "")) + "</b>" +
        (isLead ? '<i style="flex:0 0 auto;font-style:normal;font-size:8.5px;font-weight:500;color:#cfe4ff;border:1px solid rgba(207,228,255,.5);border-radius:3px;padding:0 2px;line-height:1.4">主</i>' : "") +
        "</span>" + cells +
        '<span class="num" style="text-align:right;line-height:1.3">' + right + "</span></div>";
    }).join("");
    return '<div class="jlhmCard">' +
      '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px"><span style="font-size:12px;font-weight:600;color:#fff">板块轮动</span>' +
      '<span style="font-size:9.5px;font-weight:400;color:#fff;opacity:.7">近 ' + nd + ' 个交易日 · 板块平均涨跌</span>' +
      "</div>" +
      head + rows +
      '<div style="display:flex;align-items:center;gap:5px;margin-top:6px;font-size:9.5px;font-weight:400;color:#fff">' +
      '<span class="num">−3%</span><span style="flex:0 0 96px;height:5px;border-radius:3px;background:linear-gradient(90deg,#14a06e,#2a3555,#e2484c)"></span><span class="num">+3%</span>' +
      '<span style="margin-left:auto;opacity:.75">斜纹 = 那天没数据</span></div></div>';
  }
  function rotHtml() {
    var A = S.ana, D = S.days; if (!A || !D || !D.length) return "";
    var last = D.length - 1, ord = { 3: 0, 2: 1, 1: 2, 4: 3, 5: 4 }, ld = S.lead && A[S.lead] ? S.lead : null;
    var list = Object.keys(A).filter(function (k) { return A[k].cur.k; }).sort(function (x, y) { var a = A[x].cur, b = A[y].cur; return (ord[a.k] - ord[b.k]) || ((a.rank == null ? 99 : a.rank) - (b.rank == null ? 99 : b.rank)); }).slice(0, 4);
    curPicks().concat((S.surges || []).map(function (x) { return x.sec; })).forEach(function (k) { if (list.indexOf(k) < 0 && A[k]) list.push(k); }); /* jl-surge: 今天急拉的板块即使没有阶段也上图 */
    /* 11-04 用户: 图上只有火的, 没有资金在流出的——主力在出的板块 + 我们板块里今天主力净流出最多的3个也上图, 绿圈标出 */
    var outs = Object.keys(A).filter(function (k) { var q = bkqOf(k); return q && isFinite(q.f) && q.f < 0; }).sort(function (x, y) { return bkqOf(x).f - bkqOf(y).f; });
    var outSet = {}; outs.forEach(function (k, i) { var sg = CORE.fundSig(bkqOf(k), A[k].cur.avg); if (i < 3 || (sg && sg.k === "out")) outSet[k] = 1; });
    Object.keys(outSet).forEach(function (k) { if (list.indexOf(k) < 0) list.push(k); });
    var meds = {}, medOf = function (i) { return meds[i] != null ? meds[i] : (meds[i] = CORE.medianAt(D, i)); };
    var pts = list.map(function (sec) {
      var tail = [], t0 = Math.max(0, last - 4);
      for (var i = t0; i <= last; i++) { var q = CORE.rrgPt(D, i, sec, medOf(i)); if (q) tail.push(q); }
      return { sec: sec, tail: tail, cur: tail[tail.length - 1] };
    }).filter(function (o) { return o.cur; });
    if (!pts.length) return "";
    var mx = 2, my = 1.5;
    pts.forEach(function (o) { o.tail.forEach(function (q) { mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, Math.abs(q.y)); }); });
    var X = function (x) { return 150 + x / mx * 126; }, Y = function (y) { return 95 - y / my * 76; }, svg = "";
    svg += '<line x1="14" x2="286" y1="95" y2="95" stroke="#fff" stroke-opacity=".18"/><line x1="150" x2="150" y1="12" y2="178" stroke="#fff" stroke-opacity=".18"/>';
    svg += '<g font-size="9" font-weight="700" fill="#fff" fill-opacity=".38"><text x="284" y="22" text-anchor="end">领先</text><text x="284" y="176" text-anchor="end">转弱</text><text x="16" y="176">落后</text><text x="16" y="22">改善</text></g>';
    /* jl-surge(1104): 用户说1-9编号看着晕——去编号; 只给≤5个要紧的点(主攻/我盯的/今天急拉/最强)直接写名字, 名字互不重叠、不压点, 其余点淡化不写字 */
    var picks0 = curPicks(), sgs = (S.surges || []).map(function (x) { return x.sec; }), want = [];
    [ld].concat(picks0, sgs, pts.slice().sort(function (a, b) { return (A[b.sec].cur.avg || 0) - (A[a.sec].cur.avg || 0); }).map(function (o) { return o.sec; })).forEach(function (k) { if (k && want.indexOf(k) < 0 && want.length < 5 && pts.some(function (o) { return o.sec === k; })) want.push(k); });
    var short = function (s) { s = String(s).replace(/概念$/, ""); return s.length > 5 ? s.slice(0, 5) : s; };
    var dots = pts.map(function (o) { var c = A[o.sec].cur; return { x: X(o.cur.x), y: Y(o.cur.y), r: want.indexOf(o.sec) >= 0 ? 6.5 + Math.min(c.zt, 8) * 0.45 : 4.2 }; });
    dots.forEach(function (d) { d.x0 = d.x; d.y0 = d.y; });
    for (var it = 0; it < 60; it++) { var moved = false; /* 点挤在一起时互相推开(只为看得清, 位置偏一点; 尾巴跟着平移) */
      for (var i1 = 0; i1 < dots.length; i1++) for (var i2 = i1 + 1; i2 < dots.length; i2++) {
        var p1 = dots[i1], p2 = dots[i2], dx = p2.x - p1.x, dy = p2.y - p1.y, dd = Math.hypot(dx, dy) || 0.01, need = p1.r + p2.r + 2;
        if (dd < need) { var push = (need - dd) / 2, ux = dd > 0.02 ? dx / dd : Math.cos(i2), uy = dd > 0.02 ? dy / dd : Math.sin(i2); p1.x -= ux * push; p1.y -= uy * push; p2.x += ux * push; p2.y += uy * push; moved = true; }
      }
      dots.forEach(function (d) { d.x = Math.max(d.r + 3, Math.min(297 - d.r, d.x)); d.y = Math.max(d.r + 4, Math.min(186 - d.r, d.y)); });
      if (!moved) break; }
    var boxes = dots.map(function (d) { return [d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r]; }).concat([[254, 12, 287, 25], [254, 166, 287, 179], [14, 166, 46, 179], [14, 12, 46, 25]]), labs = ""; /* 四角象限字也避让 */
    var hit = function (b) { if (b[0] < 3 || b[2] > 297 || b[1] < 4 || b[3] > 186) return true; for (var q = 0; q < boxes.length; q++) { var o = boxes[q]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true; } return false; };
    want.forEach(function (k) {
      var i = -1; pts.forEach(function (o, j) { if (o.sec === k) i = j; }); if (i < 0) return;
      var d = dots[i], t = short(k), w = t.length * 9.4 + 6, h = 13, g = d.r + 3, cand = [[d.x + g, d.y - h / 2], [d.x - g - w, d.y - h / 2], [d.x - w / 2, d.y - g - h], [d.x - w / 2, d.y + g], [d.x + g, d.y - h - 2], [d.x - g - w, d.y + 2], [d.x - g - w, d.y + g], [d.x + 2, d.y + g + 2], [d.x - w - 2, d.y + g + 2], [d.x - w / 2, d.y + g + h + 2], [d.x - g - w, d.y + g + h + 2]];
      var mand = k === ld; /* 主攻必须有名字: 普通位置都被占时, 退一步只避开别的名字和边界(可以压到小淡点) */
      for (var pass = 0; pass < (mand ? 2 : 1); pass++) {
        var done = false;
        for (var m = 0; m < cand.length; m++) {
          var b = [cand[m][0], cand[m][1], cand[m][0] + w, cand[m][1] + h];
          if (pass === 0 ? hit(b) : (b[0] < 3 || b[2] > 297 || b[1] < 4 || b[3] > 186 || boxes.slice(dots.length).some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }))) continue;
          boxes.push(b);
          var col = k === ld ? "#ffd21f" : sgs.indexOf(k) >= 0 ? "#ff7a7e" : "#fff";
          var nx = Math.max(b[0], Math.min(d.x, b[2])), ny = Math.max(b[1], Math.min(d.y, b[3])), far = Math.hypot(nx - d.x, ny - d.y) > d.r + 4; /* 名字离点远时拉一根细引线 */
          labs += '<g pointer-events="none">' + (far ? '<line x1="' + d.x.toFixed(1) + '" y1="' + d.y.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="' + col + '" stroke-opacity=".8" stroke-width=".9"/>' : "") + '<rect x="' + b[0].toFixed(1) + '" y="' + b[1].toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" rx="3" fill="rgba(10,14,22,.62)"/><text x="' + (b[0] + 3).toFixed(1) + '" y="' + (b[1] + 10).toFixed(1) + '" font-size="9.4" font-weight="800" fill="' + col + '">' + esc(t) + "</text></g>";
          done = true; break;
        }
        if (done) break;
      }
    });
    pts.forEach(function (o, i) { var ox = dots[i].x - dots[i].x0, oy = dots[i].y - dots[i].y0; if (o.tail.length > 1) svg += '<polyline points="' + o.tail.map(function (q) { return (X(q.x) + ox).toFixed(1) + "," + (Y(q.y) + oy).toFixed(1); }).join(" ") + '" fill="none" stroke="#fff" stroke-opacity="' + (want.indexOf(o.sec) >= 0 ? ".45" : ".14") + '" stroke-width="1.2" stroke-linejoin="round"/>'; });
    pts.forEach(function (o, i) {
      var c = A[o.sec].cur, d = dots[i], fill = c.avg == null ? "#8b93a3" : c.avg >= 0 ? "#ff5459" : "#2fd18b", isL = o.sec === ld, key = want.indexOf(o.sec) >= 0;
      svg += '<g data-jlsec="' + esc(o.sec) + '"><circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="' + (d.r + 6) + '" fill="transparent"/><circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="' + d.r.toFixed(1) + '" fill="' + fill + '" fill-opacity="' + (key ? 1 : .55) + '" stroke="' + (isL ? "#ffd21f" : outSet[o.sec] ? "#2fd18b" : "#fff") + '" stroke-opacity="' + (key || outSet[o.sec] ? 1 : .5) + '" stroke-width="' + (isL || outSet[o.sec] ? 2.4 : 1.1) + '"/></g>';
    });
    svg += labs;
    var rows = pts.map(function (o) {
      var c = A[o.sec].cur, fill = c.avg == null ? "#8b93a3" : c.avg >= 0 ? "#ff5459" : "#2fd18b", key = want.indexOf(o.sec) >= 0;
      return '<div data-jlsec="' + esc(o.sec) + '" style="display:flex;align-items:center;gap:7px;font-size:10.5px;color:#fff;font-weight:600;line-height:1.95;opacity:' + (key ? 1 : .8) + '"><span style="flex:0 0 9px;height:9px;border-radius:50%;background:' + fill + ';border:1px solid #fff"></span><b style="color:' + (o.sec === ld ? "#ffd21f" : sgs.indexOf(o.sec) >= 0 ? "#ff7a7e" : "#fff") + '">' + esc(o.sec) + "</b>" + (sgs.indexOf(o.sec) >= 0 ? '<span style="font-size:9.5px;color:#ff7a7e">⚡</span>' : "") + (outSet[o.sec] ? '<span style="font-size:9.5px;font-weight:800;color:#2fd18b">资金流出</span>' : "") + stTag(o.sec) + '<span style="margin-left:auto;color:' + fill + '">' + (c.avg == null ? "" : fmtPct(c.avg)) + "</span></div>" + (function () { var fc = fundChip(o.sec); return fc ? '<div data-jlsec="' + esc(o.sec) + '" style="display:flex;align-items:center;gap:6px;padding-left:16px;margin:-3px 0 2px;line-height:1.5">' + fc + "</div>" : ""; })();
    }).join("");
    return '<div style="padding:7px 9px 6px;margin:2px 0 6px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14)"><div style="display:flex;align-items:baseline;font-size:11px;color:#fff;font-weight:700">板块轮动' + (S.review ? '<span style="font-weight:600;opacity:.7;font-size:9.5px"> · 复盘 ' + esc(S.dispDay) + "</span>" : "") + (ld ? '<span style="margin-left:auto;font-size:10px;color:#ffd21f">主攻 ' + esc(ld) + "</span>" : "") + "</div>" +
      '<div style="font-size:9.5px;color:rgba(255,255,255,.75);font-weight:600">' + (S.review ? esc(S.dispDay) + " 收盘" : esc(String(S.day || "").slice(5)) + " " + (S.at ? hhmm(S.at) : "") + " 的位置") + " · 尾巴=" + (D.length > 1 ? "前 " + Math.min(4, D.length - 1) + " 天怎么走过来的" : "要攒几天才有（现在只有今天）") + (S.bkq ? " · 绿圈=主力在流出" : " · 资金还没取到，流出的暂时标不了") + "</div>" +
      '<svg viewBox="0 0 300 190" width="100%" style="display:block;margin:2px auto 0">' + svg + "</svg>" + rows +
      '<div style="font-size:9.5px;color:rgba(255,255,255,.6);font-weight:600;margin-top:3px;line-height:1.55">右=近5天比所有板块中位数强　上=今天比前几天更强' + (S.nHist < 2 ? "　历史 " + S.nHist + " 天，势头先按涨跌家数估" : "") +
      "<br>阶段：萌芽=没进前5但早盘≥2只封板 → 启动=进前5且七成在涨 → 加速=连续2天前5 → 分歧=累计涨多或涨停变少 → 退潮=掉出前10/转跌</div></div>";
  }
  /* ---- 板块5日资金(东财概念板块fflow, 只拉"我盯的"几个; 走jlReq限速熔断; 无匹配/失败=不显示) ---- */
  var UT_ = "7eea3edcaed734bea9cbfc24409ed989";
  function emGet(u, ttl) { return window.jlReq ? window.jlReq.jsonp(u, { ttl: ttl || 0, timeout: 9000 }) : Promise.reject(new Error("noreq")); }
  function bkTable() {
    if (S.bk) return Promise.resolve(S.bk);
    var c = lsGet("jl_secbk_v2");
    if (c && c.d === localDay(Date.now()) && c.m) { S.bk = c.m; return Promise.resolve(S.bk); }
    if (S.bkP) return S.bkP;
    var m = {};
    var page = function (pn) {
      return emGet("https://push2.eastmoney.com/api/qt/clist/get?fid=f12&po=0&pz=100&pn=" + pn + "&np=1&fltt=2&invt=2&fs=m:90+t:2,m:90+t:3&fields=f12,f14&ut=" + UT_, 600000).then(function (d) {
        var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [];
        arr.forEach(function (r) { if (r && r.f12 && r.f14) m[String(r.f14)] = String(r.f12); });
        var tot = d && d.data && +d.data.total || 0;
        return arr.length >= 100 && pn * 100 < tot && pn < 11 ? page(pn + 1) : null;
      });
    };
    S.bkP = page(1).then(function () {
      S.bkP = null;
      if (Object.keys(m).length > 50) { S.bk = m; try { localStorage.setItem("jl_secbk_v2", JSON.stringify({ d: localDay(Date.now()), m: m })); } catch (e) {} }
      return S.bk || {};
    }, function () { S.bkP = null; return {}; });
    return S.bkP;
  }
  /* ---- jl-fund: 全部概念板块的今日涨幅+主力净额+净占比(6页×100, 交易时段3分钟一次, 走jlReq限速) ---- */
  function hmNow() { var d = new Date(); return d.getHours() * 100 + d.getMinutes(); }
  function bkqDue() {
    var q = S.bkq, wd = new Date().getDay(), hm = hmNow(), trading = wd >= 1 && wd <= 5 && hm >= 915 && hm <= 1505;
    if (S.bkqP) return false;
    if (!q) return true;
    return trading ? Date.now() - q.t > 170e3 : localDay(q.t) !== localDay(Date.now()) || (hmNow() > 1505 && new Date(q.t).getHours() * 100 + new Date(q.t).getMinutes() < 1500);
  }
  function ensureBkq() {
    if (!bkqDue()) return;
    var m = {}, codes = {};
    /* 11-04: 1027个板块全量要11页/3分钟, 东财会限流——只取主力流入前100(po=1)+流出前100(po=0)两页; 能触发提醒的板块都在这两页里 */
    /* 11-08 jl-bkshare: 走首页共用一路(window.jlBkShareJL, 同地址去重+170秒共用); 排名仍用自己算的(用户不要东财口径) */
    var share = window.jlBkShareJL || function () { return Promise.reject(new Error("noshare")); };
    var eat = function (d, up) {
      var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [];
      arr.forEach(function (r) { if (!r || !r.f14) return; codes[String(r.f14)] = String(r.f12); m[String(r.f14)] = { p: +r.f3, f: +r.f62, fr: +r.f184, a: +r.f6, c: String(r.f12), hi: +r.f15, lo: +r.f16, pc0: +r.f18, nu: +r.f104 || 0, nd: +r.f105 || 0, nf: +r.f106 || 0, ld: r.f128 && r.f128 !== "-" ? String(r.f128) : "" }; });
      return arr;
    };
    S.bkqP = share("allIn").then(function (d) { eat(d); return share("allOut"); }).then(function (d) { eat(d); }).then(function () {
      S.bkqP = null;
      if (Object.keys(m).length > 50) { S.bkq = { t: Date.now(), m: m }; fundTopRec(); fundSnapSave(); fundDaySave(); bkStrongCheck(); outTrack(); fundCheck(); paint(); } /* 11-12: 先判强势/急拉, 再判资金——出逃提醒最后弹、在最上面 */
    }, function () { S.bkqP = null; });
  }
  /* jl-fsnap(1104): 用户: 别让电脑每天跑数据——App开着时把每3分钟的板块资金顺手存手机里(零新增请求), 复盘台账⑨里一键导出, 以后拿来回测
     IDB jinlin_secfund/s, 主键 k=日期|HH:MM; 东财板块 b:{名:[涨幅,主力净额(万元),净占比]} + 我们自己的板块强度 o:{名:[平均涨幅,上涨率,只数]}; 只存交易时段, 保留40个交易日 */
  /* 11-11 退潮领先用: 每个板块每天最后取到的"收盘前"主力净额落一行(零新增请求, 复用同一次采样)。跟 fundSnapSave 的3分钟流水分开存, 只留日粒度 */
  /* 11-12 覆盖度可查(只改落存, 不动算法/阈值/提醒): ①起点 930→915(用户: 9:15竞价起资金就有方向, 原来这15分钟白采) ②每次落盘记当日元信息 first/last/n,
     存独立键 jl_secfund_day_meta_v1——回测取数前先看 n 和 last: last<1500=当天没收盘(值不是收盘值), n 明显偏少=当天大部分板块没进过流入/流出前100。
     取值口径不变(同一板块仍以当日最后一次采样为准, 已是"最接近收盘"的那次); 不做"取绝对值最大", 那会把中途 -8000万、收盘只 -100万的板块记成 -8000万。
     合并式写入(cur 从 H[day] 起)保证只会累积不会缩水, 单次抓取失败不会把整天抹掉。 */
  function fundDaySave() {
    try {
      var hm = hmNow(), wd = new Date().getDay();
      if (wd < 1 || wd > 5 || hm < 915 || hm > 1505) return;
      var day = localDay(Date.now()), H = lsGet("jl_secfund_day_v1") || {}, cur = H[day] || {};
      var q = S.bkq && S.bkq.m; if (!q) return;
      Object.keys(q).forEach(function (n) { if (isFinite(q[n].f)) cur[n] = Math.round(q[n].f / 1e4); }); /* 万元 */
      H[day] = cur;
      Object.keys(H).sort().slice(0, -30).forEach(function (d) { delete H[d]; }); /* 留30个交易日 */
      localStorage.setItem("jl_secfund_day_v1", JSON.stringify(H)); FDH.H = null; /* 写后缓存作废 */
      var M = lsGet("jl_secfund_day_meta_v1") || {}, mm = M[day] || { first: hm, last: hm, n: 0 };
      mm.last = hm; mm.n = Object.keys(cur).length; M[day] = mm;
      Object.keys(M).sort().slice(0, -30).forEach(function (d) { delete M[d]; });
      localStorage.setItem("jl_secfund_day_meta_v1", JSON.stringify(M));
    } catch (e) {}
  }
  function fundDayMeta() { /* 覆盖度自查: {天数, 有收盘采样的天数, 每天 n/last} —— 回测取数前用它判断样本能不能用 */
    var H = lsGet("jl_secfund_day_v1") || {}, M = lsGet("jl_secfund_day_meta_v1") || {}, days = Object.keys(H).sort();
    return { days: days.length, closed: days.filter(function (d) { return M[d] && M[d].last >= 1500; }).length,
      list: days.map(function (d) { return { day: d, n: Object.keys(H[d] || {}).length, last: (M[d] && M[d].last) || 0 }; }) };
  }
  var FDH = { t: 0, H: null }; /* 11-12: 日归档解析缓存——原来每个板块各解析一遍, 一次刷新几百次 */
  function fundDayAll() { if (!FDH.H || Date.now() - FDH.t > 5000) { FDH.H = lsGet("jl_secfund_day_v1") || {}; FDH.t = Date.now(); } return FDH.H; }
  function fundHistOf(sec) { /* → {day: 主力净额(万元)}, 只取这一个板块 */
    var H = fundDayAll(), o = {}, n = CORE.unalias(sec);
    Object.keys(H).forEach(function (d) {
      var m = H[d]; if (!m) return;
      var v = m[n]; if (v == null) v = m[String(n).replace(/概念$/, "")]; if (v == null) v = m[n + "概念"];
      if (v != null && isFinite(v)) o[d] = v;
    });
    return o;
  }
  function fundSnapSave() {
    try {
      var hm = hmNow(), wd = new Date().getDay(); if (wd < 1 || wd > 5 || hm < 915 || hm > 1505) return;
      var day = localDay(Date.now()), t = new Date(), k = day + "|" + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      var b = {}, q = S.bkq.m; Object.keys(q).forEach(function (n) { var v = q[n]; if (isFinite(v.f)) b[n] = [Math.round(v.p * 100) / 100, Math.round(v.f / 1e4), Math.round(v.fr * 100) / 100]; });
      var o = {}; (S.last && S.last.recs || []).forEach(function (r) { var a = r.factors && r.factors.avgPct, u = r.factors && r.factors.upR; if (a && a.state === "ok") o[CORE.alias(r.sector)] = [a.raw, u && u.state === "ok" ? u.raw : null, a.note.indexOf("n=") === 0 ? +a.note.slice(2) : 0]; });
      var rec = { k: k, day: day, t: Date.now(), b: b, o: o };
      var rq = indexedDB.open("jinlin_secfund", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("s", { keyPath: "k" }); } catch (e) {} };
      rq.onsuccess = function () {
        var db = rq.result;
        try {
          var st = db.transaction("s", "readwrite").objectStore("s"); st.put(rec);
          var g = st.getAllKeys(); g.onsuccess = function () { var ds = {}; (g.result || []).forEach(function (x) { ds[String(x).slice(0, 10)] = 1; }); var keep = Object.keys(ds).sort().slice(-40); (g.result || []).forEach(function (x) { if (keep.indexOf(String(x).slice(0, 10)) < 0) try { st.delete(x); } catch (e) {} }); };
          st.transaction.oncomplete = function () { try { db.close(); } catch (e) {} };
        } catch (e) { try { db.close(); } catch (e2) {} }
      };
    } catch (e) {}
  }
  function bkqOf(sec) { var q = S.bkq && S.bkq.m; sec = CORE.unalias(sec); return q ? q[sec] || q[String(sec).replace(/概念$/, "")] || q[sec + "概念"] || null : null; }
  function ourAvg(sec) { var A = S.ana && S.ana[sec]; return A && A.cur ? A.cur.avg : null; }
  function fundChip(sec) {
    var q = bkqOf(sec); if (!q || !isFinite(q.f)) return "";
    var sg = CORE.fundSig(q, ourAvg(sec)), v = q.f, txt = (v >= 0 ? "+" : "") + (Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(1) + "亿" : (v / 1e4).toFixed(0) + "万");
    var chip = '<span style="font-size:9.5px;font-weight:700;color:' + (v >= 0 ? "#ff5459" : "#2fd18b") + ';white-space:nowrap">主力' + txt + "</span>";
    if (sg && sg.k === "in") chip += '<span style="font-size:9.5px;font-weight:800;padding:0 5px;border-radius:6px;color:#10131a;background:#ffd21f;white-space:nowrap">' + sg.txt + "</span>";
    if (sg && sg.k === "out") chip += '<span style="font-size:9.5px;font-weight:800;padding:0 5px;border-radius:6px;color:#10131a;background:#2fd18b;white-space:nowrap">' + sg.txt + "</span>";
    return chip;
  }
  /* ===== 11-12 用户: "早上某个板块涨得好肯定要弹出来" + "都要实时, 又怕被封" =====
     原来急拉只看自己算的板块涨幅(全A翻页15分钟一次), 一早就强、之后不再冲的板块永远不弹, 盘中急拉也常漏。
     这里只用 S.bkq(东财板块资金, 本来就3分钟一取, 带 f3涨幅/f104上涨家数/f105下跌家数) —— 零新增请求, 被封风险不变。
     东财口径只用来"弹不弹", 抽屉排名仍是自己算的(用户不要东财口径排名)。门槛初值, 未回测。
     覆盖面: bkq 只有主力流入前100+流出前100, 资金不进不出的中间板块看不到。 */
  /* ===== 11-13 用户:「涨了但主力在出」重点优化 → 改名「钱在走」, 白话三档 + 危险度排序 + 持续多久 + 流出加速/放缓 =====
     全部用 S.bkq(3分钟一取的板块资金)现成字段, 零新增请求。
     持续: 每个板块连续被判"在出"的起点存 jl_secout_v1 {d, m:{东财名:{t0, t1}}}; 中间断档>10分钟(没被判在出/没进流出前100)=重新起算。
     趋势: 本次主力净额 vs 12~20个交易分钟前那次; 流出又多了 ≥10%且≥2000万=加速, 少了同样幅度=放缓, 否则持平。S.bh 只在内存, 刚开App约15分钟内显示"—"。
     危险度: (涨幅+2, 跌超2%按0算) × |净占比| —— 涨得越多、出得越狠越靠前, 拉高在出自然排最上。权重初值, 未回测。 */
  var OUTN = ["", "拉高在出", "不涨在出", "跌着在出"];
  function outTierOf(x) { if (x.tier) return x.tier; var p = +x.bp; return p >= CORE.FUND.OUT_P ? 1 : p >= 0 ? 2 : 3; } /* 旧记录没存档位, 按涨幅补 */
  function outDanger(b) { return Math.max(0, (+b.p || 0) + 2) * Math.abs(+b.fr || 0); }
  function outKeyOf(sec) { var q = S.bkq && S.bkq.m; if (!q) return null; var n = CORE.unalias(sec); return q[n] ? n : q[String(n).replace(/概念$/, "")] ? String(n).replace(/概念$/, "") : q[n + "概念"] ? n + "概念" : null; }
  function outTrack() {
    try {
      if (!S.bkq || !S.bkq.m) return;
      var now = S.bkq.t, day = localDay(now), O = lsGet("jl_secout_v1");
      if (!O || O.d !== day) O = { d: day, m: {} };
      var q = S.bkq.m, seen = {};
      Object.keys(q).forEach(function (k) {
        if (FJ_.test(k)) return;
        var sg = CORE.fundSig(q[k], ourAvg(CORE.alias(k)));
        if (!sg || sg.k !== "out") return;
        seen[k] = 1; var e = O.m[k];
        if (!e || now - e.t1 > 10 * 60e3) O.m[k] = { t0: now, t1: now }; else e.t1 = now;
      });
      Object.keys(O.m).forEach(function (k) { if (!seen[k] && now - O.m[k].t1 > 10 * 60e3) delete O.m[k]; });
      S.outT = O; localStorage.setItem("jl_secout_v1", JSON.stringify(O));
    } catch (e) {}
  }
  function outInfo(k) { /* k=东财名 → {min 持续分钟, tr: "加速"/"放缓"/"持平"/""} */
    var O = S.outT || lsGet("jl_secout_v1"), e = O && O.m && O.m[k], r = { min: null, tr: "" };
    if (e) r.min = Math.max(0, Math.round((CORE.tradeMin(e.t1) - CORE.tradeMin(e.t0))));
    var q = S.bkq && S.bkq.m && S.bkq.m[k], H = S.bh || [];
    if (q && isFinite(q.f) && H.length > 1) {
      var tn = CORE.tradeMin(S.bkq.t), ref = null;
      for (var i = H.length - 1; i >= 0; i--) { var dt = tn - CORE.tradeMin(H[i].t); if (dt >= 12 && dt <= 20 && H[i].f && isFinite(H[i].f[k])) { ref = H[i].f[k]; break; } }
      if (ref != null) { var d = q.f - ref, gate = Math.max(2e7, Math.abs(ref) * 0.1); r.tr = d <= -gate ? "加速" : d >= gate ? "放缓" : "持平"; }
    }
    return r;
  }
  function outDurTxt(m) { return m == null ? "" : m < 3 ? "刚出现" : m >= 60 ? "已" + Math.floor(m / 60) + "时" + (m % 60 ? m % 60 + "分" : "") : "已" + m + "分"; }
  var BKS = { P: 2, UR: 0.7, MIN_N: 8, PTOP: 10 };
  function bkStrongCheck() {
    try {
      if (!S.bkq || !S.bkq.m) return;
      var now = S.bkq.t, wd = new Date(now).getDay(), hm = new Date(now).getHours() * 100 + new Date(now).getMinutes();
      if (wd < 1 || wd > 5 || hm < 935 || hm > 1500 || (hm > 1130 && hm < 1300) || localDay(now) !== S.day) return;
      var q = S.bkq.m, names = Object.keys(q).filter(function (k) { return !FJ_.test(k) && q[k] && isFinite(q[k].p); });
      var cur = { t: now, m: {}, f: {} }; names.forEach(function (k) { cur.m[k] = q[k].p; if (isFinite(q[k].f)) cur.f[k] = q[k].f; }); /* 11-13: 顺带记主力净额, 给「钱在走」算加速/放缓 */
      if (!S.bh || S.bhDay !== S.day) { S.bh = []; S.bhDay = S.day; }
      var pRank = {}; names.slice().sort(function (a, b) { return q[b].p - q[a].p; }).forEach(function (k, i) { pRank[k] = i + 1; });
      var st = sgStore(), fresh = [], tn = CORE.tradeMin(now), TH = CORE.SURGE;
      names.forEach(function (k) {
        var b = q[k], n = (b.nu || 0) + (b.nd || 0), ur = n ? b.nu / n : null, sec = CORE.alias(k);
        if (n < BKS.MIN_N) return;
        var why = scopeOf(sec) || (pRank[k] <= BKS.PTOP ? "今天涨幅前" + BKS.PTOP : null); if (!why) return;
        var has = function (kd) { return st.list.some(function (x) { return x.sec === sec && (x.kind || "") === kd; }); };
        /* ① 板块强势: 涨≥2% 且 七成以上在涨, 一天一次 */
        if (b.p >= BKS.P && ur >= BKS.UR && !has("strong")) {
          var x1 = { kind: "strong", t: now, sec: sec, a: b.p, bp: b.p, u: ur, n: n, z: 0, f: b.f, fr: b.fr, why: why };
          st.list.push(x1); fresh.push(x1);
        }
        /* ② 急拉(东财涨幅版): 30个交易分钟内抬≥1.5点, 同自己那版门槛; 已经报过急拉的不重报 */
        if (b.p >= TH.AVG && (ur == null || ur >= TH.UPR) && !has("")) {
          var base = null, age = 0;
          S.bh.forEach(function (h) { var v = h.m[k], dt = tn - CORE.tradeMin(h.t); if (v == null || dt <= 0 || dt > TH.WIN) return; age = Math.max(age, dt); if (base == null || v < base) base = v; });
          if (base != null && age >= TH.MIN_AGE && b.p - base >= TH.D) {
            var x2 = { t: now, sec: sec, d: Math.round((b.p - base) * 100) / 100, a: b.p, u: ur, n: n, z: 0, age: age, why: why, src: "em" };
            st.list.push(x2); fresh.push(x2);
          }
        }
      });
      S.bh.push(cur); if (S.bh.length > 40) S.bh.shift();
      if (!fresh.length) return;
      try { localStorage.setItem("jl_secsurge_v1", JSON.stringify(st)); } catch (e) {} histSave(st.d, st.list);
      S.surges = st.list; S.sgOpen = fresh[0].sec;
      memOf(fresh[0].sec).then(function () { paint(); });
      if (!document.hidden) showSurge(fresh[0], fresh.length - 1);
    } catch (e) {}
  }
  /* 资金先进 / 主力在出: 每个板块每种一天提醒一次(9:30–15:00), 都会弹(旧注释说"主力在出不单独弹"已过时) */
  function fundCheck(force) { /* force=调试钩(预览验收用), 跳过交易时段判断 */
    try {
      if (!S.bkq || !S.ana) return;
      var hm = hmNow(), wd = new Date().getDay();
      if (!force && (wd < 1 || wd > 5 || hm < 930 || hm > 1500 || localDay(Date.now()) !== S.day)) return; /* 11-11 用户: 原来卡在1430, 尾盘出货整段不报; 放宽到收盘 */
      var st = sgStore(), fresh = [];
      if (!S.heldSecs || S.heldSecsDay !== S.day) { try { S.heldSecs = CORE.heldSecMap(); } catch (e) { S.heldSecs = {}; } S.heldSecsDay = S.day; } /* 11-12修: 首轮 scopeOf 还没跑, 持仓板块漏查 */
      var cand = Object.keys(S.ana), seen = {}; cand.forEach(function (k) { seen[CORE.unalias(k)] = 1; });
      fundRankOf(cand[0] || ""); Object.keys(S.bkqRank || {}).forEach(function (k) { if (S.bkqRank[k] <= CORE.TOPN && !seen[k] && !seen[k + "概念"] && !seen[k.replace(/概念$/, "")]) cand.push(CORE.alias(k)); }); /* 东财板块里主力流入前20但不在我们归属表里的(如贵金属)也看 */
      Object.keys(S.heldSecs || {}).forEach(function (k) { if (!seen[k]) { seen[k] = 1; cand.push(k); } }); /* 11-11: 持仓板块即使没有任何排名数据也要逐个查资金 */
      cand.forEach(function (sec) {
        var q = bkqOf(sec), sg = CORE.fundSig(q, ourAvg(sec));
        if (!sg) return;
        var why = scopeOf(sec); if (!why) return;
        var kind = sg.k === "in" ? "fund" : "out";
        if (st.list.some(function (x) { return x.sec === sec && x.kind === kind; })) return;
        var a = S.ana[sec] ? S.ana[sec].cur : { avg: q.p, zt: 0 }, x = { kind: kind, t: S.bkq.t, sec: sec, a: a.avg, bp: q.p, f: q.f, fr: q.fr, z: a.zt || 0, why: why, drain: sg.drain || 0, tier: sg.tier || 0 }; /* 11-12: 补drain字段——原来漏带, 跌着流出的板块弹窗文案错走"小心假拉"那版 */
        st.list.push(x); fresh.push(x);
      });
      if (!fresh.length) return;
      fresh.sort(function (x, y) { return (x.kind === "fund" ? 0 : 1) - (y.kind === "fund" ? 0 : 1) || Math.abs(y.fr) - Math.abs(x.fr); });
      try { localStorage.setItem("jl_secsurge_v1", JSON.stringify(st)); } catch (e) {} histSave(st.d, st.list);
      S.surges = st.list; S.sgOpen = fresh[0].sec;
      memOf(fresh[0].sec).then(function () { paint(); if (POPS && POPS.classList.contains("on") && POPS.getAttribute("data-sec") === fresh[0].sec) showSurge(fresh[0], fresh.length - 1, true); });
      if (!document.hidden) showSurge(fresh[0], fresh.length - 1);
    } catch (e) {}
  }
  function flowOf(sec) {
    var f = S.flow[sec]; if (f && Date.now() - f.t < 600000) return Promise.resolve(f);
    if (S.flowP[sec]) return S.flowP[sec];
    var p = bkTable().then(function (m) {
      var bk = m[CORE.unalias(sec)];
      if (!bk) return (S.flow[sec] = { t: Date.now() - 300000, none: true });
      return emGet("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=6&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52&secid=90." + bk + "&ut=" + UT_, 120000).then(function (d) {
        var ks = d && d.data && d.data.klines || [];
        var arr = ks.map(function (x) { var a = String(x).split(","); return { d: a[0], v: +a[1] }; }).filter(function (x) { return isFinite(x.v); }).slice(-5);
        return (S.flow[sec] = { t: Date.now(), days: arr, none: !arr.length });
      });
    }).catch(function () { return (S.flow[sec] = { t: Date.now() - 540000, none: true, err: 1 }); }).then(function (r) { delete S.flowP[sec]; return r; });
    return (S.flowP[sec] = p);
  }
  function membersOf(sec) {
    var mt = lsGet("jinlin_mtemp_v1"), rows = mt && mt.data && mt.data.rows, out = [];
    if (!rows) return out;
    var ctx = { con: (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {}, sec: (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {} };
    for (var i = 0; i < rows.length; i++) { var r = rows[i], o = CORE.sectorOf(r[0], ctx); if (o.name === sec) out.push([String(r[0]), +r[1] || 0]); }
    return out.sort(function (a, b) { return b[1] - a[1]; });
  }
  function memPack(sec, arr) {
      var all = arr.map(function (r) { var pr = +r.f2, up = +r.f350; return { c: String(r.f12), n: String(r.f14 || r.f12), p: +r.f3, f: +r.f62, vr: +r.f10, pr: pr, hi: +r.f15, lo: +r.f16, pc0: +r.f18, zt: up > 0 && pr > 0 ? pr >= up - 0.001 : +r.f3 >= 9.8 }; }).filter(function (x) { return isFinite(x.p) && !/ST|退/i.test(x.n); }).sort(function (a, b) { return b.p - a.p; }); /* 11-08 用户: 成分股里剔 ST/*ST/退市 */
      /* 用户11-04: 没封板、买得进的排前面(最多5只), 涨停的放后面(最多3只); 涨停按东财f350涨停价判, 20%板也对 */
      var list = all.filter(function (x) { return !x.zt; }).slice(0, 5).concat(all.filter(function (x) { return x.zt; }).slice(0, 6)) /* 11-08 用户: 涨停太少→最多6只 */;
      return (S.mem[sec] = { t: Date.now(), list: list, none: !list.length });
  }
  function memOf(sec) { /* 成分股: 按我们自己的归属取涨幅前10只, 再向东财取名称/涨幅/主力净额 */
    var m = S.mem[sec]; if (m && Date.now() - m.t < 120000) return Promise.resolve(m);
    if (S.memP[sec]) return S.memP[sec];
    var ms = membersOf(sec).slice(0, 20); /* jl-surge: 多取几只, 前10全涨停时也能列出买得进的 */
    if (!ms.length) { /* 我们归属表里没有(如东财的贵金属/行业板块): 直接取东财该板块成分股, 按涨幅前16 */
      var bq = bkqOf(sec) || (S.bk && S.bk[CORE.unalias(sec)] ? { c: S.bk[CORE.unalias(sec)] } : null);
      if (!bq || !bq.c) return Promise.resolve((S.mem[sec] = { t: Date.now(), list: [], none: true }));
      var p0 = emGet("https://push2.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=20&pn=1&np=1&fltt=2&invt=2&fs=b:" + bq.c + "&fields=f2,f3,f10,f12,f14,f62,f350,f15,f16,f18&ut=" + UT_, 60000).then(function (d) {
        var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [];
        return memPack(sec, arr);
      }).catch(function () { return (S.mem[sec] = { t: Date.now() - 100000, list: [], none: true, err: 1 }); }).then(function (r) { delete S.memP[sec]; return r; });
      return (S.memP[sec] = p0);
    }
    var ids = ms.map(function (x) { return (/^[69]/.test(x[0]) ? "1." : "0.") + x[0]; }).join(",");
    var p = emGet("https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f10,f12,f14,f62,f350,f15,f16,f18&secids=" + ids + "&ut=bd1d9ddb04089700cf9c27f6f7426281", 60000).then(function (d) {
      var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [];
      return memPack(sec, arr);
    }).catch(function () { return (S.mem[sec] = { t: Date.now() - 100000, list: [], none: true, err: 1 }); }).then(function (r) { delete S.memP[sec]; return r; });
    return (S.memP[sec] = p);
  }
  function memHtml(sec) {
    var m = S.mem[sec]; if (!m || m.none || !m.list.length) return "";
    return '<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,.12);padding-top:4px">' + stkRows(m.list) + "</div>"; /* jl-surge: 名字/看=进K线, +自选/+持仓 */
  }
  function ensureFlows() {
    try {
      var want = curPicks().slice(); if (S.lead && want.indexOf(S.lead) < 0) want.push(S.lead);
      if (S.sgOpen && S.sgOpen !== "-" && S.surges && S.surges.length) memOf(S.sgOpen).then(function () { if (!S.flowT) S.flowT = setTimeout(function () { S.flowT = 0; paint(); }, 400); });
      want.forEach(function (sec) { memOf(sec).then(function () { if (!S.flowT) S.flowT = setTimeout(function () { S.flowT = 0; paint(); }, 400); }); flowOf(sec).then(function () { if (S.flowT) return; S.flowT = setTimeout(function () { S.flowT = 0; paint(); }, 400); }); });
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
  function pickSet(a) { try { localStorage.setItem("jl_secpick_v1", JSON.stringify(a.slice(0, 2))); localStorage.setItem("jl_secpick_off_v1", a.length ? "0" : "1"); } catch (e) {} } /* 11-09 用户: 盯的能全部×掉; 全取消后不再自动补主攻 */
  function curPicks() {
    var A = S.ana || {}, p = pickGet().filter(function (x) { return A[x]; });
    if (!p.length && lsGet("jl_secpick_off_v1") !== 1) { if (S.lead && A[S.lead]) p.push(S.lead); var alt = (S.pool || []).filter(function (x) { return x !== S.lead; })[0]; if (alt) p.push(alt); }
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
    return '<div class="jlpgC" style="flex:0 0 100%;scroll-snap-align:start;box-sizing:border-box;padding:6px 8px 4px"><div style="display:flex;align-items:center;gap:2px">' + secRingOf(sec) + '<b data-jlsec="' + esc(sec) + '" style="font-size:13px;color:#ffd21f;text-decoration:underline;text-underline-offset:3px">' + esc(sec) + " ›</b>" + stTag(sec) + '<span style="margin-left:6px">' + bd + '</span><b style="margin-left:auto;font-size:12px;color:' + fill + '">' + (c.avg == null ? "" : fmtPct(c.avg)) + '</b><span data-jlunpick="' + esc(sec) + '" style="flex:0 0 auto;margin-left:8px;width:22px;height:22px;line-height:20px;text-align:center;border-radius:50%;border:1px solid rgba(255,255,255,.7);color:#fff;font-size:13px;font-weight:800">×</span></div>' +
      trackSvg(sec) + fundRow(f, fv) + memHtml(sec) + "</div>";
  }
  function revRank() { /* 夜间/休市: 原"现在最强的板块"用最近交易日快照补上 */
    var d = S.days && S.days[S.days.length - 1]; if (!d) return "";
    var ks = Object.keys(d.m).filter(function (k) { return d.m[k].rank != null; }).sort(function (a, b) { return d.m[a].rank - d.m[b].rank; }).slice(0, 8);
    if (!ks.length) return "";
    return '<div style="font-size:11px;color:#fff;font-weight:700;margin:2px 0 0">' + esc(d.day) + " 最强的板块（复盘）</div>" + ks.map(function (k, i) {
      var e = d.m[k], col = e.avg > 0 ? "#ff5459" : e.avg < 0 ? "#5ae8ab" : "#fff", bits = [];
      if (e.up != null) bits.push("上涨率 " + Math.round(e.up * 100) + "%"); if (e.zt) bits.push("涨停 " + e.zt + "只");
      return '<div data-jlsec="' + esc(k) + '" style="padding:7px 9px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)"><div style="display:flex;justify-content:space-between;align-items:baseline"><span><b style="font-size:12.5px;color:#ffd21f">' + (i + 1) + ". " + esc(k) + "</b>" + stTag(k) + '</span><b style="font-size:12px;color:' + col + '">平均' + (e.avg >= 0 ? "涨 " : "跌 ") + Math.abs(e.avg).toFixed(2) + "%</b></div>" + (bits.length ? '<div style="font-size:10.5px;color:#fff;font-weight:600;margin-top:3px">' + bits.join(" · ") + "</div>" : "") + "</div>";
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
      if (stkAct(ev)) return;
      var wx = ev.target && ev.target.closest ? ev.target.closest("[data-jlwx]") : null;
      if (wx) { var k0 = wx.getAttribute("data-jlwx"); S.wx = S.wx === k0 ? "" : k0; paint(); return; }
      var sg = ev.target && ev.target.closest ? ev.target.closest("[data-jlsg]") : null;
      if (sg) { var s0 = sg.getAttribute("data-jlsg"); S.sgOpen = S.sgOpen === s0 ? "-" : s0; if (S.sgOpen !== "-") memOf(s0).then(function () { paint(); }); paint(); return; }
      var un = ev.target && ev.target.closest ? ev.target.closest("[data-jlunpick]") : null;
      if (un) { var ku = un.getAttribute("data-jlunpick"), pu = curPicks().filter(function (x) { return x !== ku; }); pickSet(pu); S.pickTouched = 1; ensureFlows(); paint(); return; }
      var sv = ev.target && ev.target.closest ? ev.target.closest("[data-jlsec]") : null;
      if (sv) { openSec(sv.getAttribute("data-jlsec")); return; }
      if (ev.target && ev.target.closest && ev.target.closest("[data-jlrev]")) { openReview(); return; }
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-jlpick]") : null;
      if (!t) return;
      var k = t.getAttribute("data-jlpick"), p = curPicks(), i = p.indexOf(k);
      if (i >= 0) { p.splice(i, 1); } else { p.push(k); if (p.length > 2) p.shift(); }
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
    var dk = decayHtml(rec.sector);
    return '<div class="jlrow" data-jlsec="' + esc(rec.sector) + '" style="align-items:flex-start">' +
      '<em><span style="display:block;font-weight:500">' +
      (i != null ? '<span style="opacity:.55;margin-right:4px" class="jn">' + (i + 1) + "</span>" : "") + esc(rec.sector) +
      (dk ? '<i class="jtag" style="color:#5ae8ab;margin-left:5px">走弱</i>' : "") + "</span>" +
      (bits.length || lead ? '<span style="display:block;font-size:9.5px;font-weight:400;opacity:.7;margin-top:1px">' + bits.concat(lead ? ["带头 " + lead] : []).join(" · ") + "</span>" : "") + "</em>" +
      (a.state === "ok" ? '<b class="jn" style="flex:0 0 58px;color:' + col + '">' + (a.raw >= 0 ? "+" : "") + (Math.round(a.raw * 100) / 100).toFixed(2) + "%</b>" : '<b class="jn" style="flex:0 0 58px;opacity:.5">—</b>') + "</div>";
  }
  /* ============ jl-secpop: 今日领涨时间线(30分钟一段) + 换龙头自动弹提醒 ============ */
  function segTxt(kb) { var t0 = new Date(+kb), t1 = new Date(+kb + CORE.BUCKET_MS); return t0.toTimeString().slice(0, 5) + "–" + t1.toTimeString().slice(0, 5); }
  function topOf(recs) { var b = null; (recs || []).forEach(function (r) { if (r.sector !== CORE.UNATTR && r.factors && r.factors.avgPct && r.factors.avgPct.state === "ok" && (!b || r.factors.avgPct.raw > b.factors.avgPct.raw)) b = r; }); return b; }
  function tlRow(r) { var a = r.factors.avgPct, u = r.factors.upR, z = r.factors.ztN, n = a.note.indexOf("n=") === 0 ? +a.note.slice(2) : 0; return { s: CORE.alias(r.sector), a: a.raw, n: n, up: u.state === "ok" && n ? Math.round(u.raw * n) : null, zt: z.state === "ok" ? z.raw : 0 }; }
  /* 时间线来源: 本库已落的当日30分桶快照(只读) + 本轮实时数据覆盖当前段; 零新增网络请求 */
  function tlUpdate(cb) {
    var day = S.day, done = function () { try { if (S.live && S.last && S.at) { var t = topOf(S.last.recs); if (t) S.tl[String(CORE.bucket(S.at))] = tlRow(t); ihPush(S.at, S.last.recs); } } catch (e) {} cb(); };
    if (S.tlDay === day && S.tl) return done();
    S.tl = {}; S.tlDay = day; S.tlShow = ""; S.ih = [];
    if (!S.db || !day) return done();
    try {
      var g = S.db.transaction("snap", "readonly").objectStore("snap").getAll(IDBKeyRange.bound(day + "|", day + "|￿"));
      g.onsuccess = function () {
        var by = {}, d2 = day, byAt = {};
        (g.result || []).forEach(function (r) { if (r && r.day === day) { (by[r.kb] = by[r.kb] || []).push(r); if (+r.at) (byAt[r.at] = byAt[r.at] || []).push(r); } });
        Object.keys(byAt).map(Number).sort(function (x, y) { return x - y; }).forEach(function (t) { ihPush(t, byAt[t]); }); /* jl-surge: 当日已落库的半小时快照先垫进盘中序列, 中途打开App也能比30分钟前 */
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
      sg.map(function (g) { var t0 = new Date(g.k0).toTimeString().slice(0, 5), t1 = new Date(g.k1 + CORE.BUCKET_MS).toTimeString().slice(0, 5); return '<div style="display:flex;gap:8px;font-size:10.5px;color:#fff;font-weight:600;line-height:1.75"><span style="flex:0 0 76px;opacity:.95">' + t0 + "–" + t1 + '</span><b style="color:' + (g.v.a >= 0 ? "#ffd21f" : "rgba(255,255,255,.75)") + '">' + esc(g.s) + (g.v.a >= 0 ? "" : "（全线跌·最抗跌）") + '</b><span style="margin-left:auto;color:' + (g.v.a >= 0 ? "#ff5459" : "#5ae8ab") + '">' + fmtPct(g.v.a) + "</span></div>"; }).join("") + "</div>"; /* 11-12: 跌日"领涨"是负数看着像坏了——标明这是最抗跌而非真领涨 */
  }
  /* ============ jl-surge(1104): 盘中板块急拉提醒 + 个股(看/+自选/+持仓) ============
     用户11-04: 小金属13:00后半小时拉起来(东财小金属指数 13:15 +0.19% → 13:45 +3.22%), 湖南白银13:40才+7%、14:23封板——提醒要醒目、要带个股、点了能进K线和加自选/持仓 */
  function ihRow(recs) {
    var m = {};
    (recs || []).forEach(function (r) {
      if (!r || r.sector === CORE.UNATTR || !r.factors) return;
      var a = r.factors.avgPct, u = r.factors.upR, z = r.factors.ztN;
      if (!a || a.state !== "ok") return;
      m[r.sector] = { a: a.raw, u: u && u.state === "ok" ? u.raw : null, n: a.note.indexOf("n=") === 0 ? +a.note.slice(2) : 0, z: z && z.state === "ok" ? +z.raw || 0 : 0 };
    });
    return m;
  }
  function ihPush(t, recs) {
    t = +t; if (!t) return; S.ih = S.ih || [];
    var last = S.ih[S.ih.length - 1], row = { t: t, m: ihRow(recs) };
    if (!Object.keys(row.m).length) return;
    if (last && last.t === t) S.ih[S.ih.length - 1] = row; else if (!last || t > last.t) S.ih.push(row);
    if (S.ih.length > 400) S.ih.splice(0, S.ih.length - 400);
  }
  function fundRankOf(sec) { /* 今天主力净额在全部板块里的名次(按东财原名) */
    var q = S.bkq && S.bkq.m; if (!q) return null;
    if (S.bkqRankT !== S.bkq.t) { S.bkqRankT = S.bkq.t; S.bkqRank = {}; Object.keys(q).filter(function (k) { return isFinite(q[k].f); }).sort(function (a, b) { return q[b].f - q[a].f; }).forEach(function (k, i) { S.bkqRank[k] = i + 1; }); }
    var n = CORE.unalias(sec); return S.bkqRank[n] || S.bkqRank[n.replace(/概念$/, "")] || S.bkqRank[n + "概念"] || null;
  }
  function recentTopOf(sec) { /* 前3个交易日里有一天进过强度前20 */
    var D = S.days || [], last = D.length - 1;
    for (var j = last - 1; j >= Math.max(0, last - 3); j--) { var e = D[j].m && D[j].m[sec]; if (e && e.rank != null && e.rank <= CORE.TOPN) return true; }
    return false;
  }
  function scopeOf(sec) {
    var A = S.ana && S.ana[sec];
    if (!S.heldSecs || S.heldSecsDay !== S.day) { try { S.heldSecs = CORE.heldSecMap(); } catch (e) { S.heldSecs = {}; } S.heldSecsDay = S.day; } /* 11-11: 每日算一次持仓板块表 */
    return CORE.alertScope(sec, A && A.cur ? A.cur.rank : null, curPicks(), fundRankOf(sec), recentTopOf(sec), S.heldSecs);
  }
  function sgStore() {
    var s = lsGet("jl_secsurge_v1");
    if (s && s.d === S.day && Array.isArray(s.list) && s.list.length) return s;
    /* 11-12 用户: 下午主存被清/写失败后"今天的板块提醒"只剩最新一批, 上午15条全丢、预制菜14:02报过14:16又重报——主存读不到时从历史存恢复(两把钥匙分开存, 一把丢另一把还在) */
    var hb = histAll()[S.day];
    if (hb && hb.length) { var r = { d: S.day, list: hb }; try { localStorage.setItem("jl_secsurge_v1", JSON.stringify(r)); } catch (e) {} return r; }
    return { d: S.day, list: [] };
  }
  /* 11-12 用户: "弹窗只在触发那一下弹, 人不在就错过了, 发生的事情我得知道" —— 加未读水位: showSurge/openReview 让用户看到即清零; 手柄红角标常驻提示今天还有几条没看(含刚弹过没看到的) */
  function rdStamp() { try { var st = sgStore(); localStorage.setItem("jl_secrd_v1", JSON.stringify({ d: st.d, n: st.list.length })); } catch (e) {} }
  function rdUnread() { try { var st = sgStore(), r = lsGet("jl_secrd_v1"); return Math.max(0, st.list.length - (r && r.d === st.d ? r.n : 0)); } catch (e) { return 0; } }
  function hhmm(t) { return new Date(+t).toTimeString().slice(0, 5); }
  function surgeCheck() {
    try {
      var st = sgStore(); S.surges = st.list;
      if (st.list.length && (!S.sgOpen || (S.sgOpen !== "-" && !st.list.some(function (x) { return x.sec === S.sgOpen; })))) S.sgOpen = st.list.slice().sort(function (x, y) { return (y.t2 || y.t) - (x.t2 || x.t); })[0].sec;
      if (S.sgOpen && S.sgOpen !== "-" && st.list.length && !S.mem[S.sgOpen] && !S.memP[S.sgOpen]) memOf(S.sgOpen).then(function () { paint(); });
      if (!S.live || !S.at || !S.ih || S.ih.length < 2) return;
      var cur = S.ih[S.ih.length - 1]; if (cur.t !== +S.at) return;
      var res = CORE.surgeScan(S.ih.slice(0, -1), cur), fresh = [];
      res.forEach(function (r) {
        var why = scopeOf(r.sec); if (!why) return;
        var ex = st.list.filter(function (x) { return x.sec === r.sec && !x.kind; })[0];
        if (!ex) { ex = { t: cur.t, sec: r.sec, d: r.d, a: r.a, u: r.u, n: r.n, z: r.z, age: r.age, why: why }; st.list.push(ex); fresh.push(ex); }
        else if (r.a >= ex.a + CORE.SURGE.D && cur.t - ex.t >= 20 * 60e3) { ex.t2 = cur.t; ex.a2 = r.a; ex.d2 = r.d; fresh.push(ex); } /* 同板块二次加速才再提醒 */
      });
      if (!fresh.length) return;
      try { localStorage.setItem("jl_secsurge_v1", JSON.stringify(st)); } catch (e) {} histSave(st.d, st.list);
      S.surges = st.list; S.sgOpen = fresh[0].sec;
      fresh.slice(0, 2).forEach(function (x) { memOf(x.sec).then(function () { paint(); if (POPS && POPS.classList.contains("on") && POPS.getAttribute("data-sec") === x.sec) showSurge(x, fresh.length - 1, true); }); });
      var hm = new Date(cur.t).getHours() * 100 + new Date(cur.t).getMinutes();
      if (!document.hidden && localDay(Date.now()) === S.day && Date.now() - cur.t < 40 * 60e3 && hm >= 930 && hm <= 1500) showSurge(fresh[0], fresh.length - 1);
    } catch (e) {}
  }
  /* 11-11 退潮前兆盘中提醒: 只有"高"才弹(避免一天弹几十次), 同一板块同一等级一天一次; 走急拉弹窗同款卡(kind=decay) */
  function decayCheck() {
    try {
      if (!S.live || !S.days || !S.days.length || document.hidden) return;
      var wd = new Date().getDay(), hm = hmNow();
      if (wd < 1 || wd > 5 || hm < 935 || hm > 1455 || localDay(Date.now()) !== S.day) return;
      var st = sgStore(), i = S.days.length - 1, seen = lsGet("jl_decay_seen_v1") || {};
      if (seen.d !== S.day) seen = { d: S.day, k: {} };
      var put = [], ch = false;
      /* 11-12 用户: 持仓板块必须一起判退潮——原来只扫 S.ana(快照里本来就有的板块), 持仓所在板块不在里面就永远不判 */
      var scanSecs = Object.keys(S.ana || {});
      try {
        if (!S.heldSecs || S.heldSecsDay !== S.day) { S.heldSecs = CORE.heldSecMap(); S.heldSecsDay = S.day; }
        Object.keys(S.heldSecs || {}).forEach(function (k) { if (scanSecs.indexOf(k) < 0) scanSecs.push(k); });
      } catch (eH) {}
      scanSecs.forEach(function (sec) {
        var dk; try { dk = CORE.decayOf(S.days, i, sec, bkqOf(sec), fundHistOf(sec)); } catch (e) { return; }
        if (!dk || dk.lv === "低") return; /* 11-12 用户: 都报——中(≥3分, 单条涨停腰斩就是3分)也弹, 不再只认5分以上的"高" */
        if (seen.k[sec]) return;
        var why = scopeOf(sec); if (!why) return;
        var q = bkqOf(sec), a = S.ana[sec] && S.ana[sec].cur ? S.ana[sec].cur.avg : (q ? q.p : 0);
        var x = { kind: "decay", t: Date.now(), sec: sec, a: a, bp: q ? q.p : a, f: q ? q.f : NaN, fr: q ? q.fr : NaN, why: why, dk: dk.items.map(function (y) { return y.t; }) };
        seen.k[sec] = 1; ch = true; put.push(x);
      });
      if (!ch) return;
      try { localStorage.setItem("jl_decay_seen_v1", JSON.stringify(seen)); } catch (e) {}
      if (put.length) { S.decayPop = put; try { showDecay(put); } catch (e) {} }
      paint();
    } catch (e) {}
  }
  function fmtFund(f) { return isFinite(f) ? (f >= 0 ? "+" : "") + (Math.abs(f) >= 1e8 ? (f / 1e8).toFixed(1) + "亿" : (f / 1e4).toFixed(0) + "万") : ""; }
  /* 11-08 用户: 板块里每只股票和板块名前加振幅小圈(同作战屏/自选页: 今振幅÷前20日日均振幅; 淡蓝=没到均/黄=到均/橙红>=1.4倍), 圈里写数字=到日均的百分之几(72=七成二)
     日均振幅=东财日K前20根(不含今天)的(高-低)/昨收, 每只每天只取一次, 存 jl_ampavg_v1; 今天高低用现成报价(f15/f16/f18), 不另请求 */
  var AMPQ = {}, AMPT = 0;
  function ampAvgOf(secid) {
    var C = S.ampC || (S.ampC = lsGet("jl_ampavg_v1") || {}), day = localDay(Date.now()), e = C[secid];
    if (e && e.d === day) return e.v;
    if (AMPQ[secid] || Object.keys(AMPQ).length > 6) return null;
    AMPQ[secid] = 1;
    emGet("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + secid + "&klt=101&fqt=1&lmt=22&end=20500101&fields1=f1&fields2=f51,f53,f54,f55&ut=" + UT_, 6 * 3600e3).then(function (d) {
      var ks = (d && d.data && d.data.klines || []).map(function (x) { var a = String(x).split(","); return { d: a[0], c: +a[1], h: +a[2], l: +a[3] }; });
      var td = String(S.day || ""); if (ks.length && (ks[ks.length - 1].d === td || ks[ks.length - 1].d === day)) ks.pop();
      var v = []; for (var k = Math.max(1, ks.length - 20); k < ks.length; k++) { var pc = ks[k - 1].c; if (pc > 0 && ks[k].h >= ks[k].l) v.push((ks[k].h - ks[k].l) / pc * 100); }
      C[secid] = { d: day, v: v.length >= 5 ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0 };
      var ks2 = Object.keys(C); if (ks2.length > 600) ks2.forEach(function (k) { if (C[k].d !== day) delete C[k]; });
      try { localStorage.setItem("jl_ampavg_v1", JSON.stringify(C)); } catch (er) {}
    }).catch(function () {}).then(function () { delete AMPQ[secid]; if (!AMPT) AMPT = setTimeout(function () { AMPT = 0; paint(); }, 600); });
    return null;
  }
  function ampRing(secid, hi, lo, pc0) {
    var av = ampAvgOf(secid), am = pc0 > 0 && hi > 0 && lo > 0 && hi >= lo ? (hi - lo) / pc0 * 100 : 0;
    var r = 8.6, L = 2 * Math.PI * r, f = av > 0 ? Math.min(1, am / av) : 0, rc = !(av > 0) ? "rgba(255,255,255,.25)" : am >= av * 1.4 ? "#ff7a2e" : am >= av ? "#ffe14d" : "#cfe0ff";
    var num = av > 0 ? String(Math.round(am / av * 100)) : "", fs = num.length >= 3 ? 6.6 : 7.8;
    return '<svg viewBox="0 0 22 22" width="22" height="22" style="flex:0 0 22px;display:inline-block;vertical-align:middle" aria-label="振幅' + am.toFixed(1) + "/均" + (av || 0).toFixed(1) + '"><circle cx="11" cy="11" r="' + r + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2.2"/>' + (f > 0 ? '<circle cx="11" cy="11" r="' + r + '" fill="none" stroke="' + rc + '" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="' + (L * f).toFixed(1) + " " + L.toFixed(1) + '" transform="rotate(-90 11 11)"/>' : "") + (num ? '<text x="11" y="11" dy=".36em" text-anchor="middle" font-size="' + fs + '" font-weight="800" fill="' + rc + '">' + num + "</text>" : "") + "</svg>";
  }
  function stkRingOf(x) { return x && x.c ? ampRing((/^[69]/.test(x.c) ? "1." : "0.") + x.c, x.hi, x.lo, x.pc0) : ""; }
  function secRingOf(sec) { var q = bkqOf(sec); return q && q.c && q.hi > 0 ? ampRing("90." + q.c, q.hi, q.lo, q.pc0) : ""; }
  function stkRow(x) {
    var col = x.p >= 0 ? "#ff5459" : "#2fd18b", zt = x.zt != null ? x.zt : x.p >= 9.8, b = "flex:0 0 auto;font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.55);color:#fff;background:rgba(255,255,255,.06)";
    var dat = ' data-c="' + esc(x.c) + '" data-n="' + esc(x.n) + '" data-p="' + (isFinite(x.pr) ? x.pr : "") + '" data-pc="' + (isFinite(x.p) ? x.p : "") + '"';
    return '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#fff;line-height:2">' + stkRingOf(x) +
      '<span data-jlstk="open"' + dat + ' style="text-decoration:underline;text-decoration-color:rgba(255,255,255,.35);text-underline-offset:3px">' + esc(x.n) + "</span>" +
      (zt ? '<span style="font-size:9px;font-weight:800;color:#10131a;background:#ffd21f;border-radius:5px;padding:0 4px">板</span>' : "") +
      '<b style="margin-left:auto;color:' + col + '">' + (x.p >= 0 ? "+" : "") + x.p.toFixed(2) + "%</b>" +
      '<span style="flex:0 0 46px;text-align:right;font-size:10px;color:' + (x.f >= 0 ? "#ff5459" : "#2fd18b") + '">' + fmtFund(x.f) + "</span>" +
      '<span data-jlstk="open"' + dat + ' style="' + b + '">看</span><span data-jlstk="watch"' + dat + ' style="' + b + '">+自选</span><span data-jlstk="hold"' + dat + ' style="' + b + ';border-color:#ffd21f;color:#ffd21f">+持仓</span></div>';
  }
  function stkList(sec) {
    var m = S.mem[sec];
    if (!m) return '<div style="font-size:10px;color:rgba(255,255,255,.6);font-weight:600">成分股加载中…</div>';
    if (m.none || !m.list.length) return '<div style="font-size:10px;color:rgba(255,255,255,.6);font-weight:600">' + (m.err ? "成分股没取到(东财限流)，过一会再点" : "这个板块暂时没有成分股数据") + "</div>";
    return stkRows(m.list);
  }
  function stkRows(list) { /* 没封板的在前; 涨停组前加一行分隔 */
    var h = "", seen = false;
    list.forEach(function (x, i) { if (x.zt && !seen) { seen = true; if (i > 0) h += '<div style="font-size:9.5px;font-weight:700;color:rgba(255,210,31,.85);margin:3px 0 0;border-top:1px dashed rgba(255,210,31,.35);padding-top:2px">已涨停（排队难买进）</div>'; } h += stkRow(x); });
    return h;
  }
  function stkAct(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest("[data-jlstk]") : null;
    if (!t) return false;
    ev.stopPropagation();
    var c = t.getAttribute("data-c"), n = t.getAttribute("data-n"), p = +t.getAttribute("data-p") || 0, pc = +t.getAttribute("data-pc") || 0, a = t.getAttribute("data-jlstk");
    if (a === "open") { if (typeof window.ydOpenStockJL === "function") { if (POPS) POPS.classList.remove("on"); S.open = false; if (ROOT) ROOT.classList.remove("open"); window.ydOpenStockJL(c, n, pc); } }
    else if (typeof window.jlSecAddStockJL === "function") window.jlSecAddStockJL(c, n, p, a === "watch" ? "watch" : "hold");
    return true;
  }
  var POPS = null, POPS_T = 0;
  /* 11-05 用户: 成分股"有时点不进去"——3分钟刷新/重绘正好落在按下与抬起之间, 原按钮被换掉, click 丢了。改成 pointerup 当场执行(位移<10px 才算点), 随后的 click 吃掉 */
  (function () {
    var dn = null, eat = 0;
    document.addEventListener("pointerdown", function (e) { var t = e.target && e.target.closest ? e.target.closest("[data-jlstk]") : null; dn = t ? { x: e.clientX, y: e.clientY, c: t.getAttribute("data-c"), a: t.getAttribute("data-jlstk") } : null; }, true);
    document.addEventListener("pointerup", function (e) {
      var d = dn; dn = null; if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      var t = e.target && e.target.closest ? e.target.closest("[data-jlstk]") : null;
      if (!t || t.getAttribute("data-c") !== d.c || t.getAttribute("data-jlstk") !== d.a) { t = null; var el = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : []; for (var i = 0; i < el.length; i++) if (el[i].getAttribute && el[i].getAttribute("data-jlstk") === d.a && el[i].getAttribute("data-c") === d.c) { t = el[i]; break; } }
      if (!t) return; eat = Date.now(); stkAct({ target: t, stopPropagation: function () {} });
    }, true);
    document.addEventListener("click", function (e) { if (Date.now() - eat < 600 && e.target && e.target.closest && e.target.closest("[data-jlstk]")) { e.stopPropagation(); e.preventDefault(); } }, true);
  })();
  /* jl-sheet(1104): 弹窗=左右滑的卡片(当天每条提醒一张) + 顶部日期 ‹ › 翻看往日复盘; 也用来"点板块看成分股"
     往日记录存 jl_secsurge_hist_v1 {day:[提醒…]}, 每条带提醒时的成分股快照 stk, 保留20个交易日 */
  function histAll() { var h = lsGet("jl_secsurge_hist_v1"); return h && typeof h === "object" ? h : {}; }
  function histSave(day, list) {
    try {
      var h = histAll(), old = h[day] || [], key = function (x) { return x.sec + "|" + (x.kind || ""); };
      /* 11-12: 历史存改合并(同板块+同类型以新数据覆盖, 旧独有条目保留)——原来整体替换, 主存一旦重置, 历史也被5条新提醒覆盖成只剩5条, 上午全天的记录跟着陪葬 */
      var by = {}; old.forEach(function (x) { by[key(x)] = x; });
      (list || []).forEach(function (x) { by[key(x)] = { kind: x.kind, t: x.t, t2: x.t2, sec: x.sec, d: x.d, a: x.a, a2: x.a2, u: x.u, n: x.n, z: x.z, bp: x.bp, f: x.f, fr: x.fr, why: x.why, drain: x.drain, stk: x.stk, stkT: x.stkT }; });
      h[day] = Object.keys(by).map(function (k) { return by[k]; });
      Object.keys(h).sort().slice(0, -20).forEach(function (d) { delete h[d]; });
      localStorage.setItem("jl_secsurge_hist_v1", JSON.stringify(h));
    } catch (e) {}
  }
  function snapStk(x) { /* 第一次拿到成分股时存一份当时的价, 复盘看"提醒那会儿"是什么样 */
    var m = S.mem[x.sec]; if (x.stk || !m || !m.list || !m.list.length) return;
    x.stk = m.list.map(function (o) { return { c: o.c, n: o.n, p: o.p, f: o.f, pr: o.pr, zt: o.zt }; }); x.stkT = m.t;
    var st = sgStore(); st.list.forEach(function (y) { if (y.sec === x.sec && y.kind === x.kind) { y.stk = x.stk; y.stkT = x.stkT; } });
    try { localStorage.setItem("jl_secsurge_v1", JSON.stringify(st)); } catch (e) {} histSave(st.d, st.list);
  }
  function kindTitle(x) { return x.kind === "strong" ? "🔥 板块强势" : x.kind === "view" ? "板块详情" : x.kind === "fund" ? "💰 资金先进" : x.kind === "out" ? "⚠ " + OUTN[outTierOf(x)] : "⚡ 板块急拉"; }
  function sheetCard(x, review) {
    var tt = x.t2 || x.t, d = x.d2 || x.d, a = x.a2 != null ? x.a2 : x.a, bits = [];
    if (x.u != null && x.n) bits.push(x.n + "只里 " + Math.round(x.u * x.n) + "只在涨");
    if (x.z > 0) bits.push("涨停 " + x.z + "只");
    var body;
    if (x.kind === "fund") body = "主力已净流入 <b>" + fmtFund(x.f) + "</b>（占成交 " + (+x.fr).toFixed(1) + "%），板块才 " + fmtPct(x.bp) + "，资金先到、价格还没动";
    else if (x.kind === "out") { /* 11-13 白话三档: 一行数字 + 一句话结论 */
      var oT = outTierOf(x), oK = outKeyOf(x.sec), oI = oK && !review ? outInfo(oK) : { min: null, tr: "" };
      body = "板块 <b>" + fmtPct(x.bp) + "</b> · 主力净流出 <b style=\"color:#2fd18b\">" + fmtFund(Math.abs(x.f)).replace("+", "") + "</b>（占成交 " + (+x.fr).toFixed(1) + "%）" +
        (oI.min != null || oI.tr ? "<br>" + [outDurTxt(oI.min), oI.tr ? "流出" + oI.tr : ""].filter(Boolean).join(" · ") : "") +
        "<br><b>" + ["", "涨着但大资金在卖，手里有的考虑先走", "价格不动、大资金在卖，别当横盘蓄力", "跌着大资金还在卖，不是回踩，别急着抄"][oT] + "</b>";
    }
    else if (x.kind === "view") { var A = S.ana && S.ana[x.sec], c = A && A.cur, q = bkqOf(x.sec); body = '<span data-jlpin="' + esc(x.sec) + '" style="float:right;font-size:10.5px;font-weight:800;padding:1px 8px;border-radius:7px;border:1px solid #ffd21f;color:#ffd21f">' + (curPicks().indexOf(x.sec) >= 0 ? "已在我盯的" : "+盯这个板块") + "</span>" + (c && c.avg != null ? "今天平均 <b>" + fmtPct(c.avg) + "</b>" : q ? "今天 <b>" + fmtPct(q.p) + "</b>" : "") + (c && c.rank ? " · 强度第" + c.rank : "") + stTag(x.sec) + (q && isFinite(q.f) ? "<br>主力今天 <b style=\"color:" + (q.f >= 0 ? "#ff5459" : "#2fd18b") + "\">" + fmtFund(q.f) + "</b>（占成交 " + (isFinite(q.fr) ? q.fr.toFixed(1) : "—") + "%）" : ""); }
    else if (x.kind === "strong") body = "板块涨 <b>" + fmtPct(x.bp) + "</b>，" + (x.n ? x.n + "只里 " + Math.round(x.u * x.n) + "只在涨" : "") + (isFinite(x.f) ? "，主力 <b style=\"color:" + (x.f >= 0 ? "#ff5459" : "#2fd18b") + "\">" + fmtFund(x.f) + "</b>" : "") + "<br><span style=\"opacity:.8\">东财板块涨幅口径 · 普涨不是一两只拉的</span>";
    else body = x.age + "分钟内平均涨幅 <b>+" + (+d).toFixed(2) + "个点</b>，那时平均 <b>" + fmtPct(a) + "</b>";
    if (bits.length && x.kind !== "view") body += "<br>" + bits.join(" · ");
    if ((x.kind === "surge" || x.kind === "fund" || x.kind === "strong" || !x.kind) && outToday(x.sec) && outToday(x.sec) !== x) body += "<br><b style=\"color:#ff9a9d\">⚠ 冲突：" + hhmm(outToday(x.sec).t2 || outToday(x.sec).t) + " 这个板块主力出逃过，别当成干净的买点</b>";
    var stk = review ? (x.stk ? '<div style="font-size:9.5px;opacity:.7;font-weight:700">提醒那会儿的价（' + hhmm(x.stkT || tt) + "）</div>" + stkRows(x.stk) : '<div style="font-size:10px;opacity:.6;font-weight:600">当时没存成分股</div>') : stkList(x.sec);
    return '<div class="jlsgP" data-sec="' + esc(x.sec) + '" data-kind="' + (x.kind || "surge") + '"><div class="jlsgK">' + kindTitle(x) + (x.kind !== "view" ? " · " + hhmm(tt) : "") + (x.t2 ? " · 二次加速" : "") + (x.why ? " · " + esc(x.why) : "") + '</div><div class="jlsgH" style="display:flex;align-items:center;gap:6px">' + secRingOf(x.sec) + "<span>" + esc(x.sec) + "</span>" + '</div><div class="jlsgB">' + body + '</div><div class="jlsgL">' + stk + "</div></div>";
  }
  var SH = { day: "", items: [], i: 0 };
  function sheetDays() { var h = histAll(), ds = Object.keys(h).filter(function (d) { return h[d] && h[d].length; }); if (S.day && ds.indexOf(S.day) < 0 && (S.surges || []).length) ds.push(S.day); return ds.sort(); }
  function sheetItems(day) {
    var L = day === S.day ? (S.surges || []) : (histAll()[day] || []);
    return L.slice().sort(function (x, y) { return (y.t2 || y.t) - (x.t2 || x.t); });
  }
  function sheetRender() {
    var review = SH.day !== S.day, ds = sheetDays(), di = ds.indexOf(SH.day), n = SH.items.length, x = SH.items[SH.i] || {};
    POPS.className = "on " + (x.kind === "fund" ? "fund" : x.kind === "out" ? "out" : x.kind === "view" ? "view" : "");
    var nav = '<div class="jlsgT"><span class="jlsgD" data-d="' + (di > 0 ? ds[di - 1] : "") + '" style="opacity:' + (di > 0 ? 1 : .25) + '">‹</span><b style="margin:0 6px">' + (review ? esc(SH.day.slice(5)) + " 复盘" : x.kind === "view" ? "板块" : "今天") + '</b><span class="jlsgD" data-d="' + (di >= 0 && di < ds.length - 1 ? ds[di + 1] : "") + '" style="opacity:' + (di >= 0 && di < ds.length - 1 ? 1 : .25) + '">›</span>' +
      (n > 1 ? '<span style="margin-left:10px;opacity:.85">' + (SH.i + 1) + " / " + n + " · 左右滑</span>" : "") + '<span class="jlsgX">✕</span></div>';
    POPS.innerHTML = nav + '<div class="jlsgPg">' + (n ? SH.items.map(function (it) { return sheetCard(it, review); }).join("") : '<div class="jlsgP"><div class="jlsgB">这天没有板块提醒</div></div>') + "</div>" +
      (n > 1 ? '<div class="jlsgDots">' + SH.items.map(function (_, j) { return "<i" + (j === SH.i ? ' class="on"' : "") + "></i>"; }).join("") + "</div>" : "") +
      '<div class="jlsgGo">打开板块强度看全部 ›</div>';
    var pg = POPS.querySelector(".jlsgPg");
    if (pg) {
      pg.scrollLeft = SH.i * pg.clientWidth;
      pg.addEventListener("scroll", function () {
        clearTimeout(pg._t); pg._t = setTimeout(function () {
          var i = Math.round(pg.scrollLeft / Math.max(1, pg.clientWidth)); if (i === SH.i) return; SH.i = i;
          var dots = POPS.querySelectorAll(".jlsgDots i"); Array.prototype.forEach.call(dots, function (d, j) { d.className = j === i ? "on" : ""; });
          var it = SH.items[i]; if (!it) return;
          POPS.className = "on " + (it.kind === "fund" ? "fund" : it.kind === "out" ? "out" : it.kind === "view" ? "view" : "");
          var cnt = POPS.querySelector(".jlsgT span:nth-of-type(3)"); if (cnt && n > 1) cnt.textContent = (i + 1) + " / " + n + " · 左右滑";
          if (SH.day === S.day && !S.mem[it.sec]) memOf(it.sec).then(function () { if (SH.items[SH.i] === it) sheetRefresh(); });
        }, 120);
      }, { passive: true });
    }
  }
  function sheetRefresh() { if (!POPS || !POPS.classList.contains("on")) return; var pg = POPS.querySelector(".jlsgPg"), sl = pg ? pg.scrollLeft : 0; SH.items.forEach(function (it) { if (SH.day === S.day && it.kind !== "view") snapStk(it); }); sheetRender(); var pg2 = POPS.querySelector(".jlsgPg"); if (pg2) pg2.scrollLeft = sl; }
  function ensurePops() {
    if (POPS) return;
    POPS = document.createElement("div"); POPS.id = "jlsecSurge"; document.body.appendChild(POPS); /* 挂body+fixed最高层: 做T作战屏/K线全屏打开时也看得到 */
    POPS.addEventListener("click", function (ev) {
      if (stkAct(ev)) return;
      var t = ev.target;
      if (t && t.className === "jlsgX") { POPS.classList.remove("on"); return; }
      var pin = t && t.closest && t.closest("[data-jlpin]");
      if (pin) { var k = pin.getAttribute("data-jlpin"), pp = curPicks(); if (pp.indexOf(k) < 0) { pp.push(k); if (pp.length > 2) pp.shift(); pickSet(pp); ensureFlows(); paint(); } sheetRefresh(); return; }
      var dd = t && t.closest && t.closest(".jlsgD");
      if (dd) { var d = dd.getAttribute("data-d"); if (d) { clearTimeout(POPS_T); SH.day = d; SH.items = sheetItems(d); SH.i = 0; sheetRender(); } return; }
      if (t && t.closest && t.closest(".jlsgGo")) { POPS.classList.remove("on"); S.open = true; if (ROOT) { ROOT.style.display = ""; ROOT.classList.add("open"); } paint(); }
    });
  }
  function sheetPlace() { try { var ph = document.querySelector(".phone"), rc = ph ? ph.getBoundingClientRect() : null; if (rc && rc.width) { POPS.style.left = (rc.left + 10) + "px"; POPS.style.right = "auto"; POPS.style.width = (rc.width - 20) + "px"; POPS.style.bottom = Math.max(0, window.innerHeight - rc.bottom) + 84 + "px"; } } catch (e) {} }
  /* 11-11 退潮前兆弹窗: 复用急拉弹窗同一个壳(#jlsecSurge), 只换 class=decay 走绿边框, 内容自己拼 */
  function showDecay(list) {
    ensurePops();
    var x0 = list[0]; if (!x0) return;
    SH.decay = list; SH.day = S.day;
    var card = function (x) {
      return '<div class="jlsgP" data-sec="' + esc(x.sec) + '">' +
        '<div class="jlsgK">⚠ 退潮前兆 · ' + hhmm(x.t) + (x.why ? " · " + esc(x.why) : "") + "</div>" +
        '<div class="jlsgH"><span>' + esc(x.sec) + "</span></div>" +
        '<div class="jlsgB">' + (x.dk || []).map(function (t) { return "· " + esc(t); }).join("<br>") +
        "<br><b>这一波可能到尾声了，别再追高；手里有的看要不要先减。</b></div></div>";
    };
    POPS.className = "decay on";
    POPS.innerHTML = '<div style="display:flex;align-items:center;font-size:12px;font-weight:800;color:#5ae8ab"><span>板块 · 退潮前兆</span><span class="jlsgX" style="margin-left:auto;padding:0 2px 0 14px;font-size:14px;color:#fff;cursor:pointer">✕</span></div>' +
      (list.length > 1 ? '<div style="font-size:10px;font-weight:600;opacity:.9;margin-top:2px">今天共 ' + list.length + " 个板块命中，下面按分数排</div>" : "") +
      '<div class="jlsgPg" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none">' + list.map(card).join("") + "</div>" +
      '<div class="jlsgGo" style="font-size:10.5px;font-weight:700;margin-top:5px;color:#ffd21f;cursor:pointer">点这里看板块强度 ›</div>';
    sheetPlace();
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 120]); } catch (e) {}
    clearTimeout(POPS_T); POPS_T = setTimeout(function () { if (POPS) POPS.classList.remove("on"); }, 90e3);
  }
  function showSurge(x, more, refresh) {
    ensurePops();
    if (!document.hidden) rdStamp(); /* 11-12: 窗真弹到屏幕上了=看过, 未读清零; 后台静默记录的不清 */
    if (POPS && POPS.className.indexOf("decay") >= 0) POPS.className = ""; /* 退潮窗占着就先让位给新的急拉/资金提醒 */
    if (refresh) { if (SH.day === S.day) { snapStk(x); sheetRefresh(); } return; }
    SH.day = S.day; SH.items = sheetItems(S.day);
    var at = -1; SH.items.forEach(function (y, j) { if (at < 0 && y.sec === x.sec && (y.kind || "") === (x.kind || "") && y.t === x.t) at = j; }); /* 存储里重读出来是新对象, 按 板块+类型+时间 找 */
    if (at < 0) { SH.items.unshift(x); at = 0; } SH.i = at;
    snapStk(x); sheetPlace(); sheetRender();
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) {}
    clearTimeout(POPS_T); POPS_T = setTimeout(function () { if (POPS) POPS.classList.remove("on"); }, 90e3);
  }
  /* 11-09 首页「今天主线」: 给 jlv2 温度卡用——主攻/资金最强/推荐卡板块, 只读现成数据 */
  function mainLineJL() {
    var out = [], A = S.ana || {}, D = S.days || [], seen = {};
    var stg = function (sec) { var a = A[sec]; if (!a || !a.cur.k) return null; var run = D.length ? CORE.stageRun(D, D.length - 1, sec) : null, g = run ? CORE.runGain(D, D.length - 1, sec, run.n) : null; return { st: CORE.STAGES[a.cur.k], n: run ? run.n : 1, g: run && run.n >= 2 ? g : null, avg: a.cur.avg }; };
    if (S.lead && A[S.lead]) { out.push({ sec: S.lead, kind: "主攻", s: stg(S.lead) }); seen[S.lead] = 1; }
    var q = S.bkq && S.bkq.m, H = lsGet("jl_fundtop_v1") || {}, td = H[localDay(Date.now())] || {};
    if (q) { var t = fundTopOf(q)[0]; if (t && !seen[t]) { out.push({ sec: t, kind: "资金最强", f: q[t].f, fr: q[t].fr, p: q[t].p, at: td.s && td.s[t] ? td.s[t].a : "", s: stg(t) }); seen[t] = 1; } }
    var pg = document.getElementById("jlrecPg"); if (pg) Array.prototype.slice.call(pg.querySelectorAll("[data-jlrec]"), 0, 3).forEach(function (el) { var k = el.getAttribute("data-jlrec"); if (k && !seen[k] && out.length < 3) { out.push({ sec: k, kind: "埋伏候选", s: stg(k) }); seen[k] = 1; } });
    return { list: out, day: S.dispDay || S.day, review: !!S.review };
  }
  function openRecJL(sec) { /* 打开抽屉并滑到这个板块的埋伏候选卡; 没有卡就打开板块详情 */
    S.open = true; if (ROOT) { ROOT.style.display = ""; ROOT.classList.add("open"); } paint();
    setTimeout(function () {
      var pg = document.getElementById("jlrecPg"), el = null;
      if (pg) Array.prototype.forEach.call(pg.querySelectorAll("[data-jlrec]"), function (x) { if (!el && x.getAttribute("data-jlrec") === sec) el = x; });
      if (!el) { openSec(sec); return; }
      try { pg.scrollLeft = el.offsetLeft - pg.offsetLeft; el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
      el.style.boxShadow = "0 0 0 2px #ffe14d"; setTimeout(function () { el.style.boxShadow = ""; }, 2400);
    }, 350);
  }
  window.jlMainLineJL = mainLineJL; window.jlOpenRecJL = openRecJL;
  function openSec(sec) { /* 点任何板块名 → 看这个板块的成分股(看/+自选/+持仓), 不自动收 */
    ensurePops(); clearTimeout(POPS_T);
    var x = { kind: "view", sec: sec, t: Date.now() };
    SH.day = S.day; SH.items = [x]; SH.i = 0; sheetPlace(); sheetRender();
    memOf(sec).then(function () { if (SH.items[0] === x) sheetRefresh(); });
  }
  function openReview() { ensurePops(); clearTimeout(POPS_T); rdStamp(); /* 11-12: 打开提醒列表=看过 */ var ds = sheetDays(); SH.day = ds.indexOf(S.day) >= 0 ? S.day : ds[ds.length - 1] || S.day; SH.items = sheetItems(SH.day); SH.i = 0; sheetPlace(); sheetRender(); }
  /* 11-05 用户: 要"当天可埋伏的股票", 按板块给, 标理由和风险。只用现成数据(强度排名/急拉/资金/成分股), 零新增请求(成分股沿用点板块时的取法, 每板块只取一次)
     规则(初值, 未回测): 板块=急拉/资金先进/强度前3/我盯的, 且主力没在出、板块主力净额不为负; 个股=没涨停、涨幅<7%、主力净流入>0, 取净流入最大2只 */
  function outToday(sec) { var r = null; (S.surges || []).forEach(function (x) { if (x.sec === sec && x.kind === "out" && (!r || (x.t2 || x.t) < (r.t2 || r.t))) r = x; }); return r; } /* 11-05: 当天出逃过的板块, 推荐/急拉处标冲突 */
  /* 11-05 清单④: 推荐后跟踪——候选卡里的个股第一次出现时记下当时价, 之后每次打开显示"推荐后累计涨幅·第N天"; 存 jl_rec_v1 (最多60天/300只), 以后拿来回测这套规则 */
  function recTrack(x, sec) {
    if (!(x.pr > 0) || !S.day) return null;
    var R = lsGet("jl_rec_v1") || {}, e = R[x.c];
    if (!e) e = null;
    if (!e) { R[x.c] = { day: S.day, pr: x.pr, n: x.n, sec: sec }; var ks = Object.keys(R); if (ks.length > 300) ks.sort(function (a, b) { return R[a].day < R[b].day ? -1 : 1; }).slice(0, ks.length - 300).forEach(function (k) { delete R[k]; }); try { localStorage.setItem("jl_rec_v1", JSON.stringify(R)); } catch (er) {} return null; }
    if (e.day >= S.day) return null;
    var dd = S.days ? S.days.filter(function (d) { return d.day > e.day && d.day <= S.day; }).length : 1;
    return { g: (x.pr / e.pr - 1) * 100, d: Math.max(1, dd) };
  }
  /* 11-11 用户: 重点推荐有没有复查——原来只在候选卡上挂"推荐后+X%·第N天", 票一掉出候选卡就没人管了。
     这里单独一张表: 每只推荐过的票, 用日K结算推荐后表现(掉出候选卡也继续结), 出胜率/平均/最大回撤。
     数据: jl_rec_v1(首次推荐日+价) + window.jlDailyBarsJL(现成日K缓存, 零新增请求) + 现价兜底。 */
  function pickStatsJL(code, e) {
    var bk = null; try { bk = window.jlDailyBarsJL ? window.jlDailyBarsJL(code) : null; } catch (er) { bk = null; }
    var after = (bk || []).filter(function (r) { return r && r.t && String(r.t).slice(0, 10) > e.day; }).map(function (r) { return +r.c; }).filter(function (v) { return v > 0; });
    var px = null; try { var q = (typeof byCode === "function") ? byCode(code) : null; if (q && +q.base > 0) px = +q.base; } catch (er) {}
    if (px == null && after.length) px = after[after.length - 1];
    if (!px || !(e.pr > 0)) return null;
    var g = (px / e.pr - 1) * 100;
    var hi = after.length ? Math.max.apply(null, after.concat([px])) : px, lo = after.length ? Math.min.apply(null, after.concat([px])) : px;
    var mdd = (lo / e.pr - 1) * 100, mfe = (hi / e.pr - 1) * 100;
    var dd = S.days ? S.days.filter(function (d) { return d.day > e.day && d.day <= S.day; }).length : (after.length || 1);
    return { g: g, mfe: mfe, mdd: mdd, d: Math.max(1, dd), px: px, n: after.length };
  }
  function pickTableHtml() {
    var R = lsGet("jl_rec_v1") || {}, ks = Object.keys(R);
    if (!ks.length) return "";
    var rows = [], win = 0, sum = 0, worst = 0, cnt = 0;
    ks.forEach(function (code) {
      var e = R[code]; if (!e || !e.day || !(e.pr > 0)) return;
      var s; try { s = pickStatsJL(code, e); } catch (er) { s = null; }
      if (!s) return;
      cnt++; sum += s.g; if (s.g > 0) win++; if (s.mdd < worst) worst = s.mdd;
      rows.push({ c: code, n: e.n || code, sec: e.sec || "", d0: e.day, pr: e.pr, s: s });
    });
    if (!cnt) return "";
    rows.sort(function (a, b) { return b.s.g - a.s.g; });
    var wr = Math.round(win / cnt * 100), avg = sum / cnt;
    var show = rows.slice(0, 12).map(function (r) {
      var c = r.s.g >= 0 ? "#ff5459" : "#2fd18b", f = function (v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; };
      return '<div class="jlrow" data-jlstk="open" data-c="' + esc(r.c) + '" data-n="' + esc(r.n) + '" data-p="' + r.s.px.toFixed(2) + '" data-pc="" style="cursor:pointer;align-items:flex-start">' +
        '<em><span style="display:flex;align-items:baseline;gap:5px"><b style="font-weight:500;white-space:nowrap">' + esc(r.n) + '</b>' + (r.sec ? '<s>' + esc(r.sec) + "</s>" : "") +
        '<s class="jn" style="margin-left:auto">' + String(r.d0).slice(5) + " · " + r.pr.toFixed(2) + " · 第" + r.s.d + "天</s></span></em>" +
        '<b class="jn" style="flex:0 0 58px;color:' + c + '">' + f(r.s.g) + "</b>" +
        '<b class="jn" style="flex:0 0 52px;font-size:9.5px;font-weight:400;opacity:.72">' + f(r.s.mfe) + "</b>" +
        '<b class="jn" style="flex:0 0 48px;font-size:9.5px;font-weight:400;opacity:.72">' + f(r.s.mdd) + "</b></div>";
    }).join("");
    var kpi = function (v, l, c) { return '<span style="flex:1;text-align:center"><b class="jn" style="display:block;font-size:15px;font-weight:600;color:' + (c || "#fff") + '">' + v + '</b><i style="font-style:normal;font-size:9.5px;font-weight:400;opacity:.66">' + l + "</i></span>"; };
    var th = '<div class="jlst"><span style="flex:1 1 auto">名称 · 推荐日 · 天数</span><span class="jn" style="flex:0 0 58px">收益</span><span class="jn" style="flex:0 0 52px">最高</span><span class="jn" style="flex:0 0 48px">最深</span></div>';
    return '<div class="jlsh"><b>推荐过的个股 · 复查</b><i>掉出候选卡也照结算</i></div>' +
      '<div style="display:flex;gap:4px;margin:4px 0 5px">' + kpi(cnt + " 只", "样本") + kpi(wr + "%", "胜率", wr >= 50 ? "#ff5459" : "#2fd18b") + kpi((avg >= 0 ? "+" : "") + avg.toFixed(1) + "%", "平均", avg >= 0 ? "#ff5459" : "#2fd18b") + kpi(worst.toFixed(1) + "%", "最深", "#2fd18b") + "</div>" +
      th + show +
      (rows.length > 12 ? '<div class="jf">还有 ' + (rows.length - 12) + " 只没列</div>" : "") +
      '<div class="jf">涨幅=首次推荐到现在；最高/最深=期间最好和最差。样本少别当结论。</div>';
  }
  /* 11-09 用户: 推荐过的板块从推荐那天起记——待了几天、涨了多少才退潮。只用自己算的板块日均涨幅(S.days), 零新增请求。
     存 jl_secrec_v1 {sec:{d0, g:{day:avg}, k:{day:阶段}}}; 推荐日收盘起算涨幅(当天什么时候推的不知道, 当天涨幅单列); 推荐后出现"退潮"或连续3天掉出快照=结束, 挪进 jl_secrec_done_v1(留100条) */
  function trkAdd(sec) {
    if (S.review || !S.day) return;
    var R = lsGet("jl_secrec_v1") || {};
    if (R[sec]) return;
    R[sec] = { d0: S.day, g: {}, k: {} }; try { localStorage.setItem("jl_secrec_v1", JSON.stringify(R)); } catch (e) {}
  }
  function trkStat(r) { /* → {n, g0:推荐当天, cum:推荐日收盘至今, pk:期间最高, days:[{d,a,k}]} */
    var ds = Object.keys(r.g).filter(function (d) { return d >= r.d0; }).sort(), c = 1, pk = 0;
    ds.forEach(function (d) { if (d > r.d0 && r.g[d] != null) { c *= 1 + r.g[d] / 100; pk = Math.max(pk, (c - 1) * 100); } });
    return { n: ds.length || 1, g0: r.g[r.d0], cum: (c - 1) * 100, pk: pk, days: ds.map(function (d) { return { d: d, a: r.g[d], k: r.k[d] }; }) };
  }
  function trkUpdate() {
    var D = S.days || []; if (!D.length) return;
    var R = lsGet("jl_secrec_v1") || {}, done = lsGet("jl_secrec_done_v1") || [], ch = false;
    if (lsGet("jl_secrec_seed_v1") !== 1) { /* 第一次: 用 11-05 起埋伏候选个股记录(jl_rec_v1 带板块和首次日期)补出之前推荐过的板块 */
      var RC = lsGet("jl_rec_v1") || {}, f = {};
      Object.keys(RC).forEach(function (c) { var e = RC[c]; if (e && e.sec && e.day && (!f[e.sec] || e.day < f[e.sec])) f[e.sec] = e.day; });
      Object.keys(f).forEach(function (sec) { if (!R[sec]) R[sec] = { d0: f[sec], g: {}, k: {} }; });
      try { localStorage.setItem("jl_secrec_seed_v1", "1"); } catch (e) {} ch = true;
    }
    Object.keys(R).forEach(function (sec) {
      var r = R[sec], miss = 0, end = null, why = "";
      D.forEach(function (d, i) {
        if (d.day < r.d0 || end) return;
        var e = d.m[sec];
        var st = e ? CORE.stageAt(D, i, sec) : null, k = st ? st.k : 0, closed = !(d.day === S.day && hmNow() < 1505); /* 今天盘中先不结案, 收盘才算 */
        if (e && (r.g[d.day] !== e.avg || r.k[d.day] !== k)) { r.g[d.day] = e.avg; r.k[d.day] = k; ch = true; }
        if (d.day <= r.d0 || !closed) return;
        if (k === 5) { end = d.day; why = "退潮"; return; }
        if (!e || k === 0) { if (++miss >= 3) { end = d.day; why = "降温"; } } else miss = 0; /* 连续3天没阶段(没进强势)=降温结束 */
      });
      if (end) { var t = trkStat(r); done.unshift({ sec: sec, d0: r.d0, end: end, why: why, n: t.n, g0: t.g0, cum: t.cum, pk: t.pk }); delete R[sec]; ch = true; }
      else if (Object.keys(r.g).length === 0 && D[D.length - 1].day > r.d0 && D.every(function (d) { return d.day !== r.d0; })) { delete R[sec]; ch = true; } /* 推荐日的快照不在了(太久没打开) */
    });
    if (ch) { try { localStorage.setItem("jl_secrec_v1", JSON.stringify(R)); localStorage.setItem("jl_secrec_done_v1", JSON.stringify(done.slice(0, 100))); } catch (e) {} }
  }
  function trkHtml() {
    try { trkUpdate(); } catch (e) {}
    var R = lsGet("jl_secrec_v1") || {}, done = lsGet("jl_secrec_done_v1") || [], ks = Object.keys(R);
    if (!ks.length && !done.length) return "";
    var pc = function (v) { return v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }, cl = function (v) { return v == null ? "#fff" : v >= 0 ? "#ff5459" : "#2fd18b"; };
    var md = function (d) { return String(d).slice(5); };
    var open = ks.map(function (k) { var t = trkStat(R[k]); t.sec = k; t.d0 = R[k].d0; var a = S.ana && S.ana[k]; t.st = a && a.cur.k ? CORE.STAGES[a.cur.k] : ""; return t; }).sort(function (a, b) { return b.cum - a.cum; });
    var row = function (o, fin) {
      return '<div class="jlrow" data-jlsec="' + esc(o.sec) + '">' +
        '<em>' + esc(o.sec) + '<s style="margin-left:5px">' + md(o.d0) + (fin ? "→" + md(o.end) : "起") + " · 第" + o.n + "天</s></em>" +
        '<b class="jn" style="flex:0 0 56px;color:' + cl(o.cum) + '">' + (o.n <= 1 ? "当天" + pc(o.g0) : pc(o.cum)) + "</b>" +
        '<b class="jn" style="flex:0 0 50px;font-size:9.5px;font-weight:400;color:#ffd21f">' + (fin ? o.why : o.st || "—") + "</b></div>";
    };
    var sum = "";
    if (done.length) {
      var av = function (f) { var a = done.map(f).filter(function (v) { return v != null && isFinite(v); }); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
      var kpi = function (v, l) { return '<span style="flex:1;text-align:center"><b class="jn" style="display:block;font-size:15px;font-weight:600;color:#fff">' + v + '</b><i style="font-style:normal;font-size:9.5px;font-weight:400;opacity:.66">' + l + "</i></span>"; };
      sum = '<div style="display:flex;gap:4px;margin:3px 0 5px">' + kpi(done.length + " 个", "已结束") + kpi((av(function (o) { return o.n; }) || 0).toFixed(1) + " 天", "平均待") + kpi(pc(av(function (o) { return o.pk; })), "平均最高") + kpi(pc(av(function (o) { return o.cum; })), "结束时平均") + "</div>";
    }
    return '<div class="jlsh"><b>推荐过的板块 · 待了几天、涨了多少</b></div>' + sum +
      (open.length ? '<div class="jlsh"><b style="color:#ffd21f">还在跟</b></div>' + open.map(function (o) { return row(o, false); }).join("") : "") +
      (done.length ? '<div class="jlsh"><b style="color:#ffd21f">已结束</b><i>最近 8 个</i></div>' + done.slice(0, 8).map(function (o) { return row(o, true); }).join("") : "") +
      '<div class="jf">从埋伏候选第一次出现那天记；涨幅=推荐日收盘起累计。出现退潮、或连续3天没进任何阶段=结束。只记这台手机打开过的日子。</div>';
  }
  function pickRecHtml() {
    /* 11-05 用户: 别做成PDF/小字, 要像App——左右滑大卡: 大数字(轮动第N天/累计涨幅/今日涨幅)+大按钮行; 涨停(连板)也列, 标"排队难买"
       板块=昨日收盘阶段为萌芽/启动/加速(没退潮)且主力没出逃; 盘前(无今日数据)就是"昨日收盘段"的早盘候选。规则是初值, 未回测 */
    var A = S.ana; if (!A || S.review) return "";
    var lb = {}; try { var yd = lsGet("jinlin_yd_v1"), pl = yd && yd.zt && yd.zt.pool || []; pl.forEach(function (r) { if (r && r.c) lb[String(r.c)] = +r.lbc || 0; }); } catch (e) {}
    var inRank = {}; ((S.last && S.last.ranked) || []).forEach(function (r, i) { inRank[r.sector] = i; });
    /* 11-05 打法总纲②(依据回测): 板块内涨停>=2只+龙头没断板加分; 龙头(昨日>=3连板)今天断板→不推(回测板块次日-1.63%); 连续强势>=3天标"后面偏回落"并扣分(回测后3日超额-0.55%) */
    var zh = lsGet("jl_zt_hist_v1") || {}, zk = Object.keys(zh).sort(), zT = zh[zk[zk.length - 1]], zY = zh[zk[zk.length - 2]], todayCodes = {};
    if (zT && zT.r) zT.r.forEach(function (r) { todayCodes[String(r[0])] = 1; });
    var leaderOf = function (sec) {
      if (!zY || !zY.r || !zT) return null; var ms = {}; membersOf(sec).forEach(function (x) { ms[x[0]] = 1; });
      var best = null; zY.r.forEach(function (r) { var l = +r[2] || 0; if (l >= 3 && ms[String(r[0])] && (!best || l > best.l)) best = { c: String(r[0]), n: String(r[1]), l: l }; });
      return best ? { c: best.c, n: best.n, l: best.l, broke: !todayCodes[best.c] } : null;
    };
    var brokeL = [];
    /* 11-08 用户: 9:15起资金就有方向——有今天板块资金(bkq, 竞价起3分钟一刷)时: 资金只看今天实时, 主力净额<0或查不到都不推;
       板块=阶段(萌芽/启动/加速) ∪ 今天主力净流入前20(剔融资融券/股通等非题材板块), 综合分=今天主力流入排名为主+阶段为辅; 前5板块×每板块前3只; 涨停不进推荐; ST在memPack已剔。权重初值, 未回测 */
    var fundOn = !!(S.bkq && S.bkq.m), JUNK = /融资融券|股通|昨日|MSCI|富时|标普|证金|重仓|QFII|次新|高送转|创业板综|央视|红利|小盘|大盘|中盘|低价|高价|破净|摘帽|壳资源|预增|预亏|预盈|扭亏|减亏|亏损|热股|ST股|AB股|含H股|含GDR|转债|百元股|微盘|基金|社保|养老金|上证|深证|中证|沪深|HS300/;
    var finRank = {}, cand = {}, covered = {};
    if (fundOn) Object.keys(S.bkq.m).filter(function (k) { var q = S.bkq.m[k]; return q && q.f > 0 && !JUNK.test(k); }).sort(function (a, b) { return (S.bkq.m[b].fr || 0) - (S.bkq.m[a].fr || 0); }).forEach(function (k, i) { finRank[S.bkq.m[k].c] = i; }); /* 11-08 回测: 按主力净额排(大票板块占便宜)次日超额-0.09%, 按净占比排+阶段为主 +0.27% → 用占比 */
    Object.keys(A).forEach(function (k) { var c = A[k].cur; if (c && c.k >= 1 && c.k <= 3) { cand[k] = 1; var q = bkqOf(k); if (q) covered[q.c] = 1; } });
    if (fundOn) Object.keys(S.bkq.m).forEach(function (k) { var q = S.bkq.m[k], r = finRank[q.c]; if (r != null && r < 20 && !covered[q.c] && !cand[k]) { cand[k] = 1; covered[q.c] = 1; } });
    var secs = Object.keys(cand).map(function (k) {
      var c = A[k] && A[k].cur || null, q = bkqOf(k), sg = q ? CORE.fundSig(q, c ? c.avg : q.p) : null, ot = outToday(k), ld = c ? leaderOf(k) : null;
      var bad = !!(ot || (sg && sg.k === "out") || (q && isFinite(q.f) && q.f < 0) || (fundOn && !(q && q.f > 0)));
      if (ld && ld.broke) { bad = true; brokeL.push(k + "(" + ld.n + ld.l + "板断)"); }
      var stg = c ? (c.k === 3 ? 3 : c.k === 2 ? 2 : 1) * 10 - (c.rank == null ? 20 : c.rank) * 0.3 + (c.zt >= 2 ? 8 : 0) + (ld && !ld.broke ? 6 : 0) - ((c.streak || 0) >= 3 ? 8 : 0) : 0;
      var fr = q ? finRank[q.c] : null, fs = fundOn ? (fr != null ? 10 * (1 - Math.min(fr, 40) / 40) : 0) : (q && q.f > 0 ? 5 : 0); /* 11-08 回测(东财587板块·120天): 资金权重10最好, 40反而跑输 */
      return { k: k, c: c, q: q, bad: bad, ot: ot, ld: ld, sc: stg + fs, fr: fr };
    }).filter(function (o) { return !o.bad; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 5);
    var conflict = Object.keys(A).filter(function (k) { return outToday(k) && A[k].cur && A[k].cur.k >= 1 && A[k].cur.k <= 3; }).slice(0, 3);
    var cards = "", n = 0;
    secs.forEach(function (o) {
      var m = S.mem[o.k];
      if (!m) { if (!S.recAsk) S.recAsk = {}; if (!S.recAsk[o.k]) { S.recAsk[o.k] = 1; memOf(o.k).then(function () { paint(); }); } return; }
      var early = hmNow() >= 915 && hmNow() < 930; /* 竞价段个股主力净额多为0, 放宽成>=0, 再按涨幅 */
      var all = (m.list || []), buy = all.filter(function (x) { return !x.zt && x.p < 7 && (early ? x.f >= 0 : x.f > 0); }).sort(function (a, b) { return (b.f - a.f) || (b.p - a.p); }).slice(0, 3), zts = o.c && o.c.k >= 2 && o.c.k <= 3 ? all.filter(function (x) { return x.zt; }).slice(0, 5) : []; /* 11-08 用户: 真启动的好板块(阶段启动/加速+今天资金在进)才带涨停股, 标排队难买, 看一下也行 */
      if (!buy.length && !zts.length) return; n++;
      trkAdd(o.k);
      var lead = all.slice().sort(function (x, y) { return ((lb[y.c] || 0) - (lb[x.c] || 0)) || (y.p - x.p); })[0]; /* 11-05 用户: 老龙不一定要连板, 开启轮动的领涨股也算: 先看连板最高, 没有连板就看今天涨幅最大 */
      var c = o.c || { name: "资金进", streak: 0, cum5: null, avg: o.q ? o.q.p : null, zt: 0 }, tile = function (v, l, col) { return '<div style="flex:1;text-align:center"><div style="font-size:19px;font-weight:800;color:' + (col || "#fff") + ';line-height:1.15">' + v + '</div><div style="font-size:10px;font-weight:600;opacity:.8">' + l + "</div></div>"; };
      var runN = c.streak || 0, up = c.cum5 >= 0, risk = runN >= 3 ? "已强势" + runN + "天，后面偏回落" : c.cum5 >= 10 ? "近5天已涨多，别追高" : o.ld ? o.ld.n + o.ld.l + "板龙头在" : c.zt >= 2 ? "板块内涨停" + c.zt + "只" : o.q && o.q.f > 0 ? "资金在进" : "资金还没明显进";
      if (o.fr != null && o.q) risk = "主力占比第" + (o.fr + 1) + " " + fmtFund(o.q.f) + (runN >= 3 || c.cum5 >= 10 ? " · " + (runN >= 3 ? "已强" + runN + "天" : "已涨多") : "");
      var row = function (x, isZt) {
        var dat = ' data-c="' + esc(x.c) + '" data-n="' + esc(x.n) + '" data-p="' + (isFinite(x.pr) ? x.pr : "") + '" data-pc="' + (isFinite(x.p) ? x.p : "") + '"', b = "flex:0 0 auto;font-size:11px;font-weight:800;padding:3px 9px;border-radius:12px;border:1px solid rgba(255,255,255,.6);color:#fff";
        var l = lb[x.c] > 1 ? lb[x.c] + "连板" : "";
        /* 11-05 用户: 不一定连板, 涨势不错、开启轮动的也要标。回测(启动股回测.py): 涨幅>=5非涨停+量比>=1.5(+突破20日高)次日开盘买, 3日内冲高>=10%约15~18%(基准5%), 但3日收益为负的占54%、2025年后均值无优势→只当"关注"不是买点 */
        var start = !isZt && x.p >= 5 && x.vr >= 1.5 && x.f > 0;
        var rec = recTrack(x, o.k), role0 = start ? "启动" : "";
        var role = role0 || lead && x.c === lead.c ? (lb[x.c] > 1 ? "老龙" : "领涨") : (lead && lead.p - x.p >= 2 ? "补涨" : "");
        return '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-top:1px solid rgba(255,255,255,.1)">' + stkRingOf(x) + '<span data-jlstk="open"' + dat + ' style="font-size:14px;font-weight:800;color:#fff">' + esc(x.n) + '</span>' +
          (isZt ? '<span style="font-size:10px;font-weight:800;color:#10131a;background:#ffd21f;border-radius:6px;padding:1px 6px">' + (l || "涨停") + ' · 排队难买</span>' : (l ? '<span style="font-size:10px;font-weight:800;color:#ffd21f">' + l + "</span>" : "")) +
          (rec ? '<span style="margin-left:auto;font-size:10px;font-weight:700;color:' + (rec.g >= 0 ? "#ff9a9d" : "#7ee0b8") + '">推荐后' + (rec.g >= 0 ? "+" : "") + rec.g.toFixed(1) + '%·第' + rec.d + '天</span>' : '') + '<b style="' + (rec ? "" : "margin-left:auto;") + 'font-size:14px;color:' + (x.p >= 0 ? "#ff5459" : "#2fd18b") + '">' + (x.p >= 0 ? "+" : "") + x.p.toFixed(1) + '%</b><span data-jlstk="watch"' + dat + ' style="' + b + '">+自选</span></div>';
      };
      cards += '<div data-jlrec="' + esc(o.k) + '" style="flex:0 0 84%;scroll-snap-align:start;box-sizing:border-box;padding:10px 12px;margin-right:8px;border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.25)">' +
        '<div style="display:flex;align-items:center;gap:6px">' + secRingOf(o.k) + '<span data-jlsec="' + esc(o.k) + '" style="font-size:16px;font-weight:800;color:#fff">' + esc(o.k) + '</span><span style="font-size:11px;font-weight:800;color:#ffd21f">' + esc(c.name) + '</span><span style="margin-left:auto;font-size:10.5px;font-weight:700;opacity:.8">' + esc(risk) + '</span></div>' +
        '<div style="display:flex;margin:8px 0 4px">' + tile(runN ? "第" + runN + "天" : "新", "强势轮动", "#ffd21f") + tile(c.cum5 == null ? "—" : (up ? "+" : "") + c.cum5.toFixed(1) + "%", "近5天累计", up ? "#ff5459" : "#2fd18b") + tile((c.avg >= 0 ? "+" : "") + (c.avg || 0).toFixed(1) + "%", "最近一天", c.avg >= 0 ? "#ff5459" : "#2fd18b") + "</div>" +
        buy.map(function (x) { return row(x, false); }).join("") + zts.map(function (x) { return row(x, true); }).join("") + "</div>";
    });
    if (!cards) return "";
    return '<div style="font-size:12px;color:#fff;font-weight:800;margin:8px 0 4px">埋伏候选 <span style="font-size:10px;font-weight:600;opacity:.75">' + (fundOn ? "阶段为主+今天主力占比加分 · 已剔ST/资金流出" : "盘前=昨天收盘阶段") + ' · 左右滑 · 未回测</span></div><div id="jlrecPg" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none">' + cards + "</div>" +
      (conflict.length || brokeL.length ? '<div style="font-size:10.5px;font-weight:700;color:#ff9a9d;margin-top:3px">' + (brokeL.length ? "龙头断板、不推：" + brokeL.map(esc).join("、") + "　" : "") + (conflict.length ? "主力出逃过、不推：" + conflict.map(esc).join("、") : "") + "</div>" : "");
  }
  /* 11-05 打法总纲①: 抽屉顶部"天气"——涨停数/最高板/晋级率/炸板回封, 判情绪阶段。数据=jl_zt_hist_v1(首页涨停池每日存档), 零新增请求; 阶段阈值是二手初值, 未回测 */
  function weatherHtml(kOv) {
    var h = lsGet("jl_zt_hist_v1"); if (!h || typeof h !== "object") return "";
    var ks = Object.keys(h).sort(); if (!ks.length) return "";
    var T = h[ks[ks.length - 1]], Y = ks.length > 1 ? h[ks[ks.length - 2]] : null; if (!T || !T.r) return "";
    var n = T.n || T.r.length, mx = 0, lb = 0, zb = 0; T.r.forEach(function (r) { var l = +r[2] || 0; if (l > mx) mx = l; if (l >= 2) lb++; if ((+r[4] || 0) > 0) zb++; });
    var yn = Y ? (Y.n || (Y.r || []).length) : 0, ymx = 0; if (Y && Y.r) Y.r.forEach(function (r) { var l = +r[2] || 0; if (l > ymx) ymx = l; });
    if (Y && Y.r) { var ym0 = {}; Y.r.forEach(function (r) { ym0[r[0]] = 1; }); lb = T.r.filter(function (r) { return (+r[2] || 0) >= 2 && ym0[r[0]]; }).length; } /* 11-06: 晋级=昨天在涨停池且今天继续涨停, 与名单同口径 */
    var adv = yn ? Math.round(lb / yn * 100) : null, st, col;
    if (n < 25 || mx <= 2) { st = "冰点"; col = "#2fd18b"; }
    else if (Y && mx < ymx && (adv != null && adv < 20)) { st = "退潮"; col = "#2fd18b"; }
    else if (n >= 80 && mx >= 5) { st = "高潮"; col = "#ff5459"; }
    else if (Y && mx < ymx) { st = "分歧"; col = "#ffd21f"; }
    else if (n >= 45) { st = "发酵"; col = "#ff5459"; }
    else { st = "启动"; col = "#ffd21f"; }
    var tip = { "冰点": "没赚钱效应，以观察为主", "退潮": "高位在亏钱，空仓/少动", "高潮": "最热，别追一致加速", "分歧": "高低切，买承接强的", "发酵": "赚钱效应在，可跟主线", "启动": "试错小仓" }[st];
    /* 11-06 用户: 光给数字不知道是哪些板块哪些票——四格可点, 点开下方出名单(再点收起); 数据同一份 jl_zt_hist_v1, 零新增请求 */
    WXST = { st: st, col: col, tip: tip, n: n, mx: mx, adv: adv, zb: zb, day: ks[ks.length - 1] };
    var wk = kOv != null ? kOv : (S.wx || ""), tile = function (v, l, k) { var on = wk === k; return '<div data-jlwx="' + k + '" style="flex:1;text-align:center;cursor:pointer;border-radius:8px;padding:2px 0;' + (on ? "background:rgba(255,210,31,.16);box-shadow:inset 0 0 0 1px rgba(255,210,31,.55)" : "") + '"><div class="jn" style="font-size:16px;font-weight:600;color:#fff;line-height:1.2">' + v + '</div><div style="font-size:9.5px;font-weight:400;opacity:.75">' + l + (on ? " ▴" : " ▾") + "</div></div>"; };
    return '<div style="display:flex;align-items:center;gap:6px;padding:8px 6px;margin:2px 0 6px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18)">' +
      '<div data-jlwx="rule" style="flex:0 0 auto;text-align:center;padding:2px 6px 2px 4px;border-radius:9px;cursor:pointer;' + (wk === "rule" ? "background:rgba(255,210,31,.16);box-shadow:inset 0 0 0 1px rgba(255,210,31,.55)" : "") + '"><div style="font-size:18px;font-weight:600;color:' + col + '">' + st + (wk === "rule" ? " ▴" : " ▾") + '</div><div style="font-size:9.5px;font-weight:400;opacity:.72">' + esc((function (k) { return /^\d{8}$/.test(k) ? k.slice(4, 6) + "-" + k.slice(6) : k.slice(5); })(ks[ks.length - 1])) + "</div></div>" +
      tile(n, "涨停", "zt") + tile(mx + "板", "最高板" + (Y ? (mx > ymx ? "↑" : mx < ymx ? "↓" : "") : ""), "lb") + tile(adv == null ? "-" : adv + "%", "连板晋级", "adv") + tile(zb, "回封", "hf") +
      '</div><div style="font-size:10px;font-weight:500;color:' + col + ';margin:-2px 2px 6px">' + tip + ' <span style="opacity:.55;font-weight:400;color:#fff">· 点「' + st + '」看判定 · 点数字看名单</span></div>' + wxList(wk, T, Y);
  }
  var WXST = null;
  /* 11-06: 首页「市场情绪」总卡(jlv2)复用同一份天气条+名单, 不另算 */
  window.jlZtWeatherJL = { html: function (k) { try { return weatherHtml(k || ""); } catch (e) { return ""; } }, stage: function () { try { weatherHtml(""); } catch (e) { } return WXST; } };
  /* 天气条名单: r=[code,name,lbc,fund,zbc,fbt,hs,amount,ltsz,hy,days,ct,price,pct] */
  function wxList(k, T, Y) {
    if (!k || !T || !T.r) return "";
    if (k === "rule" && WXST) { /* 11-09 用户: 冰点怎么对照的——把判定表摆出来, 今天命中的那条高亮; 从上往下先满足哪条算哪条 */
      var W = WXST, rows = [["冰点", "涨停 < 25 只，或 最高板 ≤ 2 板"], ["退潮", "最高板比昨天低，且 连板晋级 < 20%"], ["高潮", "涨停 ≥ 80 只，且 最高板 ≥ 5 板"], ["分歧", "最高板比昨天低"], ["发酵", "涨停 ≥ 45 只"], ["启动", "上面都不满足"]];
      return '<div style="padding:4px 2px 6px"><div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:3px">今天：涨停 ' + W.n + ' 只 · 最高 ' + W.mx + ' 板 · 连板晋级 ' + (W.adv == null ? "-" : W.adv + "%") + '</div>' +
        rows.map(function (r) { var on = r[0] === W.st; return '<div style="display:flex;gap:8px;padding:4px 6px;border-radius:7px;font-size:12px;font-weight:700;color:#fff;' + (on ? "background:rgba(255,210,31,.18);box-shadow:inset 0 0 0 1px rgba(255,210,31,.6)" : "") + '"><b style="flex:0 0 36px;color:' + (on ? "#ffd21f" : "#fff") + '">' + r[0] + '</b><span>' + r[1] + (on ? " ← 今天" : "") + "</span></div>"; }).join("") +
        '<div style="font-size:11px;font-weight:600;color:#fff;margin-top:4px;line-height:1.5">从上往下，先满足哪条就是哪个。连板晋级 = 昨天涨停、今天还涨停的只数 ÷ 昨天涨停只数。门槛是参考值，没回测过。</div></div>';
    }
    var chip = function (r, ext) { return '<span data-jlstk="open" data-c="' + esc(r[0]) + '" data-n="' + esc(r[1]) + '" data-p="' + (+r[12] || "") + '" data-pc="' + (+r[13] || "") + '" style="display:inline-block;margin:2px 6px 2px 0;font-size:12px;font-weight:700;color:#fff;white-space:nowrap">' + esc(r[1]) + (ext ? '<small style="font-weight:600;color:#ffd21f;margin-left:2px">' + ext + "</small>" : "") + "</span>"; };
    var lbTxt = function (r) { return (+r[2] || 0) >= 2 ? (+r[2]) + "板" : ""; };
    var line = function (head, body, hc) { return '<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.1)"><b style="flex:0 0 auto;min-width:64px;font-size:12px;font-weight:800;color:' + (hc || "#ffd21f") + '">' + head + '</b><div style="flex:1;min-width:0;line-height:1.5">' + body + "</div></div>"; };
    var byLb = function (a, b) { return (+b[2] || 0) - (+a[2] || 0) || String(a[5] || "").localeCompare(String(b[5] || "")); };
    var R = T.r.slice(), h = "", cut = function (L, m, f) { return L.slice(0, m).map(f).join("") + (L.length > m ? '<span style="font-size:11px;opacity:.7">等' + L.length + "只</span>" : ""); };
    if (k === "zt") {
      var G = {}; R.forEach(function (r) { var g = String(r[9] || "").trim() || "其他"; (G[g] = G[g] || []).push(r); });
      var gs = Object.keys(G).sort(function (a, b) { return G[b].length - G[a].length || Math.max.apply(null, G[b].map(function (r) { return +r[2] || 0; })) - Math.max.apply(null, G[a].map(function (r) { return +r[2] || 0; })); });
      h = gs.slice(0, 12).map(function (g) { var L = G[g].sort(byLb); return line(esc(g) + ' <span style="color:#fff">' + L.length + "</span>", cut(L, 8, function (r) { return chip(r, lbTxt(r)); })); }).join("") +
        (gs.length > 12 ? '<div style="font-size:10.5px;opacity:.7;padding-top:3px">另有 ' + (gs.length - 12) + " 个行业各1~2只</div>" : "");
      h = '<div style="font-size:10.5px;font-weight:700;opacity:.8;padding-bottom:2px">按行业分 · 家数多的在前（东财行业口径）</div>' + h;
    } else if (k === "lb") {
      var M = {}; R.forEach(function (r) { var l = +r[2] || 1; (M[l] = M[l] || []).push(r); });
      h = Object.keys(M).map(Number).sort(function (a, b) { return b - a; }).map(function (l) { var L = M[l].sort(byLb); return line(l >= 2 ? l + "板 · " + L.length : "首板 · " + L.length, cut(L, l >= 2 ? 20 : 10, function (r) { return chip(r, String(r[9] || "")); }), l >= 4 ? "#ff5459" : l >= 2 ? "#ffd21f" : "#c9d2de"); }).join("");
      h = '<div style="font-size:10.5px;font-weight:700;opacity:.8;padding-bottom:2px">连板梯队 · 名字后小字=行业</div>' + h;
    } else if (k === "adv") {
      if (!Y || !Y.r) return '<div style="font-size:11px;opacity:.75;padding:4px 2px 8px">没有上一交易日的涨停存档，晋级算不了</div>';
      var tm = {}; R.forEach(function (r) { tm[r[0]] = r; });
      var ym = {}; Y.r.forEach(function (r) { ym[r[0]] = 1; });
      var up = R.filter(function (r) { return (+r[2] || 0) >= 2 && ym[r[0]]; }).sort(byLb), drop = Y.r.filter(function (r) { return !tm[r[0]]; }).sort(byLb);
      h = line("晋级 " + up.length, up.length ? cut(up, 20, function (r) { return chip(r, lbTxt(r)); }) : '<span style="opacity:.7">没有</span>', "#ff5459") +
        line("掉队 " + drop.length, drop.length ? cut(drop, 16, function (r) { return chip(r, (+r[2] || 1) >= 2 ? "昨" + (+r[2]) + "板" : ""); }) : '<span style="opacity:.7">没有</span>', "#2fd18b");
      h = '<div style="font-size:10.5px;font-weight:700;opacity:.8;padding-bottom:2px">昨天涨停 ' + (Y.n || Y.r.length) + " 只 → 今天继续涨停的=晋级，没在今天涨停池的=掉队</div>" + h;
    } else if (k === "hf") {
      var L = R.filter(function (r) { return (+r[4] || 0) > 0; }).sort(function (a, b) { return (+b[4] || 0) - (+a[4] || 0) || byLb(a, b); });
      h = L.length ? line("回封 " + L.length, cut(L, 30, function (r) { return chip(r, "开" + (+r[4]) + "次" + (lbTxt(r) ? "·" + lbTxt(r) : "")); })) : '<div style="font-size:11px;opacity:.75;padding:4px 0">今天涨停的票都没开过板</div>';
      h = '<div style="font-size:10.5px;font-weight:700;opacity:.8;padding-bottom:2px">开过板又封回去的（现在仍封板）；炸了没封回的不在涨停池里，这里不列</div>' + h;
    }
    return '<div style="padding:6px 10px 6px;margin:-2px 0 8px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,210,31,.35)">' + h + "</div>";
  }
  /* 11-05 清单⑤: 我的持仓所属细分(东财二级行业/概念口径同板块抽屉)的资金流向——出逃的排前并标红绿醒目; 数据=板块资金(bkq)+持仓(jinlin_stocks_v2), 零新增请求 */
  function holdFundHtml() {
    var st = lsGet("jinlin_stocks_v2"); if (!Array.isArray(st) || !S.bkq || !S.bkq.m) return "";
    var ctx = { con: (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {}, sec: (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {} }, G = {};
    st.forEach(function (x) { if (!x || !(x.qty > 0) || !/^\d{6}$/.test(String(x.code))) return; var o = CORE.sectorOf(x.code, ctx); if (!o.name || o.name === "其他") return; (G[o.name] = G[o.name] || []).push(x.name || x.code); });
    var L = Object.keys(G).map(function (k) { var q = bkqOf(k), sg = q ? CORE.fundSig(q, ourAvg(k)) : null, A0 = S.ana && S.ana[k]; return { k: k, q: q, sg: sg, names: G[k], avg: A0 && A0.cur ? A0.cur.avg : (q ? q.p : null) }; });
    if (!L.length) return "";
    L.sort(function (a, b) { return ((a.q && isFinite(a.q.f) ? a.q.f : 0) > 0 ? 1 : 0) - ((b.q && isFinite(b.q.f) ? b.q.f : 0) > 0 ? 1 : 0) || ((a.q ? a.q.f : 0) - (b.q ? b.q.f : 0)); });
    var rows = L.map(function (o) {
      var f = o.q && isFinite(o.q.f) ? o.q.f : null, out = f != null && f < 0, bad = o.sg && o.sg.k === "out";
      return '<div data-jlsec="' + esc(o.k) + '" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.1)"><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800;color:#fff">' + esc(o.k) + (bad ? ' <span style="font-size:10px;font-weight:800;color:#10131a;background:#2fd18b;border-radius:6px;padding:0 5px">' + esc(o.sg.txt) + '</span>' : "") + '</div><div style="font-size:10.5px;font-weight:600;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + o.names.map(esc).join("、") + "</div></div>" +
        '<div style="text-align:right"><div style="font-size:15px;font-weight:800;color:' + (f == null ? "#8b93a3" : out ? "#2fd18b" : "#ff5459") + '">' + (f == null ? "无资金数据" : (out ? "出 " : "进 ") + fmtFund(Math.abs(f)).replace("+", "")) + '</div><div style="font-size:10px;font-weight:600;opacity:.8">板块' + (o.avg == null ? "" : " " + fmtPct(o.avg)) + "</div></div></div>";
    }).join("");
    return '<div style="padding:8px 10px;margin:2px 0 6px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16)"><div style="font-size:12px;font-weight:800;color:#fff">我的持仓所在细分 · 资金 <span style="font-size:10px;font-weight:600;opacity:.7">绿=主力净流出，红=净流入</span></div>' + rows + "</div>";
  }
  /* 11-05 用户: 加进持仓/自选的票也要简洁看到"启动信号"。一次请求取全部(东财 f10量比/f15高/f16低/f109五日/f160十日), 缓存2分钟
     依据 启动股特征分析: 收在高位(>=0.85)、前10日涨幅别>15%、量比别>=3 相对更好; 高开确认只能次日开盘后看 */
  /* 11-05 用户: 手机上"我的票"没出来——东财被限流时整块为空。兜底改腾讯(script标签加载, 不走jlReq): 实时 qt.gtimg.cn(价/涨幅/高/低/量比) + 日K ifzq(算5/10日涨幅) */
  function tcLoad(url, name) {
    return new Promise(function (ok, no) {
      var sc = document.createElement("script"); if (/qt\.gtimg/.test(url)) sc.charset = "gbk"; sc.src = url; var done = false;
      var end = function (f) { if (done) return; done = true; try { sc.remove(); } catch (e) {} f(window[name]); };
      sc.onload = function () { end(ok); }; sc.onerror = function () { end(no); }; setTimeout(function () { end(no); }, 9000); document.head.appendChild(sc);
    });
  }
  function tcMy(L) {
    var pre = function (c) { return (/^[569]/.test(c) ? "sh" : "sz") + c; }, m = {}, tag = "q" + Date.now();
    var qn = "v_" + L.map(function (x) { return pre(x.code); })[0];
    return tcLoad("https://qt.gtimg.cn/q=" + L.map(function (x) { return pre(x.code); }).join(",") + "&_=" + Date.now(), qn).then(function () {
      L.forEach(function (x) { var f = String(window["v_" + pre(x.code)] || "").split("~"); if (f.length < 50) return; m[x.code] = { f2: +f[3], f3: +f[32], f15: +f[33], f16: +f[34], f10: +f[49], f12: x.code, f350: 0 }; });
      return Promise.all(L.map(function (x, i) {
        if (!m[x.code]) return null; var nm = "kl_" + tag + "_" + i;
        return tcLoad("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=" + nm + "&param=" + pre(x.code) + ",day,,,15,qfq&_=" + Date.now(), nm).then(function (d) {
          var k = d && d.data && d.data[pre(x.code)], a = k && (k.qfqday || k.day); try { delete window[nm]; } catch (e) { window[nm] = null; }
          if (a && a.length > 11) { var c = a.map(function (r) { return +r[2]; }), n = c.length; m[x.code].f109 = (c[n - 1] / c[n - 6] - 1) * 100; m[x.code].f160 = (c[n - 1] / c[n - 11] - 1) * 100; }
        }).catch(function () {});
      })).then(function () { return Object.keys(m).length ? m : null; });
    }).catch(function () { return null; });
  }
  function myStkHtml() {
    var st = lsGet("jinlin_stocks_v2"); if (!Array.isArray(st)) return "";
    var L = st.filter(function (x) { return x && /^\d{6}$/.test(String(x.code)) && (x.qty > 0 || x.watch); }).slice(0, 30);
    if (!L.length) return "";
    var C = S.myq;
    myqLoad(L, S.open);
    var rows = myRows(L, C);
    if (!rows) return "";
    return '<div style="padding:8px 10px;margin:2px 0 6px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16)"><div style="font-size:12px;font-weight:800;color:#fff">我的票 <span style="font-size:10px;font-weight:600;opacity:.75">历史统计参考，不是买卖点</span></div>' + rows + "</div>";
  }
  function myqLoad(L, go) {
    var C = S.myq;
    if ((!C || Date.now() - C.t > 120000) && Date.now() - (S.myAsk || 0) > 30000 && go) {
      S.myAsk = Date.now();
      var ids = L.map(function (x) { return (/^[69]/.test(x.code) ? "1." : "0.") + x.code; }).join(",");
      emGet("https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f10,f12,f14,f15,f16,f109,f160,f350&secids=" + ids + "&ut=bd1d9ddb04089700cf9c27f6f7426281", 60000).then(function (d) {
        var df = d && d.data && d.data.diff, arr = Array.isArray(df) ? df : df ? Object.keys(df).map(function (k) { return df[k]; }) : [], m = {};
        arr.forEach(function (r) { m[String(r.f12)] = r; }); if (arr.length) { S.myq = { t: Date.now(), m: m }; paint(); }
      }).catch(function () { return null; }).then(function () {
        if (S.myq && Date.now() - S.myq.t < 5000) return;
        tcMy(L).then(function (m) { if (m) { S.myq = { t: Date.now(), m: m, src: "tc" }; paint(); } });
      });
    }
  }
  /* 11-06: 「我的票」短语给联动球用——tags(收在高位/冲高回落/前10天±x%/放量)+结论(符合启动/偏追高/涨停), 无数据返回"" */
  function myTag(x, r) {
    var p = +r.f3, pr = +r.f2, hi = +r.f15, lo = +r.f16, vr = +r.f10, p10 = +r.f160, up = +r.f350, zt = up > 0 && pr >= up - 0.001;
    var pos = hi > lo ? (pr - lo) / (hi - lo) : 1, tags = [], good = 0, bad = 0;
    if (pos >= 0.85) { tags.push("收在高位"); good++; } else if (pos < 0.6) { tags.push("冲高回落"); bad++; }
    if (isFinite(p10)) { if (p10 > 15) { tags.push("前10天+" + p10.toFixed(0) + "% 已涨多"); bad++; } else if (p10 >= 8) { tags.push("前10天+" + p10.toFixed(0) + "%"); good++; } else if (p10 <= -10) tags.push("前10天" + p10.toFixed(0) + "% 低位"); else tags.push("前10天" + (p10 > 0 ? "+" : "") + p10.toFixed(0) + "%"); }
    if (isFinite(vr)) { if (vr >= 3) { tags.push("放量大"); bad++; } else if (vr >= 1.5) { tags.push("放量"); good++; } }
    var verdict = zt ? "涨停" : (p >= 5 && good >= 2 && bad === 0) ? "符合启动" : (bad >= 2 || (isFinite(p10) && p10 > 15 && p > 3)) ? "偏追高" : "";
    return { tags: tags, verdict: verdict };
  }
  window.jlMyStkTagJL = function (code) {
    try {
      var st = lsGet("jinlin_stocks_v2"); if (!Array.isArray(st)) return null;
      var L = st.filter(function (x) { return x && /^\d{6}$/.test(String(x.code)) && (x.qty > 0 || x.watch); }).slice(0, 30);
      if (!L.length) return null;
      myqLoad(L, true);
      var r = S.myq && S.myq.m[String(code)]; return r ? myTag({ code: code }, r) : null;
    } catch (e) { return null; }
  };
  function myRows(L, C) {
    return L.map(function (x) {
      var r = C && C.m[x.code];
      if (!r) return '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.1);display:flex;align-items:center;gap:6px"><span style="font-size:14px;font-weight:800;color:#fff">' + esc(x.name || x.code) + '</span><span style="font-size:9.5px;font-weight:800;color:#ffd21f;border:1px solid #ffd21f;border-radius:6px;padding:0 4px">' + (x.qty > 0 ? "持仓" : "自选") + '</span><span style="margin-left:auto;font-size:11px;font-weight:600;color:#fff">行情取数中…</span></div>';
      var p = +r.f3, pr = +r.f2, hi = +r.f15, lo = +r.f16, vr = +r.f10, p10 = +r.f160, p5 = +r.f109, up = +r.f350, zt = up > 0 && pr >= up - 0.001;
      var pos = hi > lo ? (pr - lo) / (hi - lo) : 1, tags = [], good = 0, bad = 0;
      /* 11-05 用户: 别写得像PDF, 亮白白话、少而精; 不写概率: 300只池化的统计对单票没意义(用户11-05指出), 永鼎自己样本<50天 */
      if (pos >= 0.85) { tags.push("收在高位"); good++; } else if (pos < 0.6) { tags.push("冲高回落"); bad++; }
      if (isFinite(p10)) { if (p10 > 15) { tags.push("前10天+" + p10.toFixed(0) + "% 已涨多"); bad++; } else if (p10 >= 8) { tags.push("前10天+" + p10.toFixed(0) + "%"); good++; } else if (p10 <= -10) tags.push("前10天" + p10.toFixed(0) + "% 低位"); }
      if (isFinite(vr)) { if (vr >= 3) { tags.push("放量大"); bad++; } else if (vr >= 1.5) { tags.push("放量"); good++; } }
      var verdict = zt ? "涨停" : (p >= 5 && good >= 2 && bad === 0) ? "符合启动" : (bad >= 2 || (isFinite(p10) && p10 > 15 && p > 3)) ? "偏追高" : "";
      var vc = verdict === "符合启动" ? "#7dffb0" : verdict === "偏追高" ? "#ff9a9d" : "#fff";
      var dat = ' data-c="' + esc(x.code) + '" data-n="' + esc(x.name || x.code) + '" data-p="' + (isFinite(pr) ? pr : "") + '" data-pc="' + (isFinite(p) ? p : "") + '"';
      return '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.1)"><div style="display:flex;align-items:center;gap:6px"><span data-jlstk="open"' + dat + ' style="font-size:14px;font-weight:800;color:#fff">' + esc(x.name || x.code) + "</span>" + (x.qty > 0 ? '<span style="font-size:9.5px;font-weight:800;color:#ffd21f;border:1px solid #ffd21f;border-radius:6px;padding:0 4px">持仓</span>' : '<span style="font-size:9.5px;font-weight:700;opacity:.7;border:1px solid rgba(255,255,255,.5);border-radius:6px;padding:0 4px">自选</span>') + (verdict ? '<span style="font-size:11px;font-weight:800;color:' + vc + '">' + verdict + "</span>" : "") + '<b style="margin-left:auto;font-size:14px;color:' + (p >= 0 ? "#ff5459" : "#2fd18b") + '">' + (p >= 0 ? "+" : "") + (isFinite(p) ? p.toFixed(1) : "-") + "%</b></div>" +
        '<div style="margin-top:3px;font-size:11.5px;font-weight:600;color:#fff;line-height:1.5">' + tags.map(esc).join(" · ") + "</div></div>";
    }).join("");
  }
  function surgeHtml() {
    var L = (S.surges || []).slice().sort(function (x, y) { return (y.t2 || y.t) - (x.t2 || x.t); });
    if (!L.length) return sheetDays().length ? '<div data-jlrev="1" style="font-size:10.5px;color:#fff;font-weight:700;padding:4px 2px 6px;text-decoration:underline">今天还没有板块提醒 · 往日提醒复盘 ›</div>' : "";
    var curA = {}; (S.last && S.last.recs || []).forEach(function (r) { if (r.factors && r.factors.avgPct && r.factors.avgPct.state === "ok") curA[r.sector] = r.factors.avgPct.raw; });
    var open = S.sgOpen || L[0].sec;
    return '<div style="padding:7px 9px 5px;margin:2px 0 6px;border-radius:9px;background:rgba(255,84,89,.1);border:1px solid rgba(255,84,89,.55)"><div style="display:flex;font-size:11.5px;color:#ff7a7e;font-weight:800;margin-bottom:2px">⚡ 今天的板块提醒<span data-jlrev="1" style="margin-left:auto;font-size:10.5px;color:#fff;text-decoration:underline">按日期复盘 ›</span></div>' +
      L.map(function (x) {
        var on = x.sec === open && x === L.filter(function (y) { return y.sec === open; })[0], now = curA[x.sec], fund = x.kind === "fund";
        return '<div data-jlsg="' + esc(x.sec) + '" style="display:flex;align-items:center;gap:7px;font-size:11px;color:#fff;font-weight:600;line-height:2"><span style="flex:0 0 40px;opacity:.9">' + hhmm(x.t2 || x.t) + '</span><b style="color:#ffd21f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%">' + esc(x.sec) + '</b><span style="font-size:10px;white-space:nowrap;color:' + (fund ? "#ffd21f" : x.kind === "out" ? "#2fd18b" : "#ff7a7e") + '">' + (x.kind === "strong" ? "🔥强势" + fmtPct(x.bp) : fund ? "💰资金先进 " + fmtFund(x.f) : x.kind === "out" ? "⚠" + OUTN[outTierOf(x)] + " " + fmtFund(x.f) : "⚡急拉+" + (x.d2 || x.d).toFixed(1) + "点") + '</span><span style="margin-left:auto;color:' + ((now != null ? now : x.a || 0) >= 0 ? "#ff5459" : "#2fd18b") + '">' + (now != null ? "现" + fmtPct(now) : x.a != null ? fmtPct(x.a) : "") + '</span><span style="font-size:10px;opacity:.8">' + (on ? "▾" : "▸") + "</span></div>" +
          (on ? '<div style="padding:0 0 4px 6px;border-left:2px solid rgba(255,84,89,.5);margin-left:4px">' + stkList(x.sec) + "</div>" : "");
      }).join("") + '<div style="font-size:9.5px;color:rgba(255,255,255,.6);font-weight:600;line-height:1.5">⚡急拉＝30个交易分钟里板块平均涨幅抬≥1.5个点、现平均≥+1%、六成以上在涨<br>💰资金先进＝主力净流入≥3亿且占成交≥6%，板块涨幅在−1.5%～+1.5%<br>⚠钱在走＝拉高在出（涨≥2%、主力净流出占成交≤−2%）／不涨在出（涨0～2%、≤−3%）／跌着在出（下跌、≤−3%）<br>只提醒当天真火的：我盯的 + 今天强度前20 + 今天主力流入前20 + 近3天强势的（跑路也报）。都是初值，未回测</div></div>'; /* 11-12: 图例补上微涨/跌着出货两条新路径 */
  }
  /* jl-fund: 资金看板——9:15竞价起就有; 埋伏候选=资金在进但还没怎么涨, 假拉=涨了但主力在出 */
  /* 11-09 用户: 资金最强榜按时间记下来——几点进榜、在榜多久、连续上榜几天。每次板块资金刷新(3分钟, 同一份数据, 零新增请求)记一笔前8; 存 jl_fundtop_v1 {day:{lt, ns, s:{板块:{a首次,z最近,n次数,b最好名次}}}} 留30天 */
  var FJ_ = /融资融券|股通|昨日|MSCI|富时|标普|证金|重仓|QFII|次新|高送转|创业板综|央视|红利|小盘|大盘|中盘|低价|高价|破净|摘帽|壳资源|预增|预亏|预盈|扭亏|减亏|亏损|热股|ST股|AB股|含H股|含GDR|转债|百元股|微盘|基金|社保|养老金|上证|深证|中证|沪深|HS300|指数|AH股|B股|权重|茅指数|宁组合|同花顺|东方财富|参股|新股|注册制|北交所|深成|科创|机构/;
  function fundTopOf(q) { return Object.keys(q || {}).filter(function (k) { return !FJ_.test(k) && q[k] && isFinite(q[k].f) && q[k].f > 0; }).sort(function (x, y) { return (q[y].fr || 0) - (q[x].fr || 0); }).slice(0, 8); }
  function fundTopRec() {
    try {
      var b = S.bkq; if (!b || !b.m) return;
      var d = new Date(b.t), wd = d.getDay(), hm = d.getHours() * 100 + d.getMinutes();
      if (wd < 1 || wd > 5 || hm < 915 || hm > 1500 || (hm > 1130 && hm < 1300)) return; /* 午休数据不动, 不算在榜时间 */
      var day = localDay(b.t), H = lsGet("jl_fundtop_v1") || {}, D = H[day] || (H[day] = { lt: 0, ns: 0, s: {} });
      if (b.t <= D.lt) return;
      var t = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      D.lt = b.t; D.ns++; D.now = fundTopOf(b.m); D.nowT = t;
      D.now.forEach(function (sec, i) { var e = D.s[sec] || (D.s[sec] = { a: t, z: t, n: 0, b: i + 1 }); e.z = t; e.n++; if (i + 1 < e.b) e.b = i + 1; });
      Object.keys(H).sort().slice(0, -30).forEach(function (k) { delete H[k]; });
      localStorage.setItem("jl_fundtop_v1", JSON.stringify(H));
    } catch (e) {}
  }
  function fundTopHtml() {
    var H = lsGet("jl_fundtop_v1") || {}, ks = Object.keys(H).sort(), day = ks[ks.length - 1]; if (!day) return "";
    var D = H[day], secs = Object.keys(D.s || {}); if (!secs.length) return "";
    var streak = function (sec) { var n = 0; for (var i = ks.length - 1; i >= 0; i--) { if (H[ks[i]].s && H[ks[i]].s[sec]) n++; else break; } return n; };
    var now = D.now || [], dur = function (n) { var m = n * 3; return m >= 60 ? Math.floor(m / 60) + "时" + (m % 60 ? m % 60 + "分" : "") : m + "分"; };
    secs.sort(function (x, y) { return D.s[y].n - D.s[x].n || (D.s[x].a < D.s[y].a ? -1 : 1); });
    var rows = secs.slice(0, 10).map(function (sec) {
      var e = D.s[sec], st = streak(sec), on = now.indexOf(sec);
      return '<div data-jlsec="' + esc(sec) + '" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#fff;font-weight:500;line-height:2">' + '<span style="flex:0 0 30%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ffe14d">' + esc(sec) + "</span>" +
        '<span style="flex:0 0 auto">' + e.a + " 进</span>" + '<span style="flex:0 0 auto">在榜约' + dur(e.n) + "</span>" +
        '<span style="margin-left:auto;flex:0 0 auto">' + (on >= 0 ? '<b style="color:#ff5459;font-weight:600">现第' + (on + 1) + "</b>" : e.z + " 掉出") + "</span>" +
        '<span style="flex:0 0 42px;text-align:right;color:' + (st >= 2 ? "#ff5459" : "#fff") + '">' + (st >= 2 ? "连" + st + "天" : "首日") + "</span></div>";
    }).join("");
    return '<div style="margin-top:5px;padding-top:4px;border-top:1px solid rgba(255,255,255,.15)"><div style="font-size:10.5px;color:#fff;font-weight:600">' + (day === localDay(Date.now()) ? "今天" : String(day).slice(5)) + "进过资金最强榜的（几点进 · 在榜多久 · 连续几天）</div>" + rows +
      '<div style="font-size:10px;color:#fff;font-weight:500">只记App开着的时段，每3分钟一笔' + (ks.length < 3 ? " · 已记 " + ks.length + " 天，连续天数要多攒几天" : "") + "</div></div>";
  }
  function fundBoardHtml() {
    if (!S.bkq) return "";
    var q = S.bkq.m || {}; /* 11-12修: 原 S.bkq.q 不存在, 整块恒空 */
    var rows = Object.keys(q).filter(function (k) { return !FJ_.test(k) && q[k] && isFinite(q[k].f); }).map(function (k) { return { sec: k, b: q[k] }; });
    if (!rows.length) return "";
    var hm = hmNow(), early = hm >= 915 && hm < 930;
    var top = rows.filter(function (o) { return o.b.f > 0; }).sort(function (x, y) { return (y.b.fr || 0) - (x.b.fr || 0); }).slice(0, 8);
    var topSet = {}; top.forEach(function (o) { topSet[o.sec] = 1; });
    var inn = rows.filter(function (o) { return !topSet[o.sec] && o.b.f > 0 && o.b.p <= CORE.FUND.IN_PMAX + 1.5; }).sort(function (x, y) { return y.b.fr - x.b.fr; }).slice(0, 4);
    var out = rows.filter(function (o) { var sg = CORE.fundSig(o.b, ourAvg(o.sec)); if (sg && sg.k === "out") { o.sg = sg; return true; } return false; }).sort(function (x, y) { return outDanger(y.b) - outDanger(x.b); }).slice(0, 6); /* 11-13: 按危险度排, 4→6条 */
    /* 11-12 统一排版: 表头一行(名称/涨幅/主力/占比), 数字等宽右对齐, 字重 500/600 */
    var line = function (o, warn) {
      var sg = CORE.fundSig(o.b, ourAvg(o.sec));
      return '<div class="jlrow" data-jlsec="' + esc(o.sec) + '">' +
        '<em style="color:' + (warn ? "#5ae8ab" : "#fff") + '">' + esc(o.sec) +
        (sg && sg.k === "in" ? '<i class="jtag" style="color:#ffd21f;margin-left:5px">资金先进</i>' : "") + "</em>" +
        '<b class="jn" style="flex:0 0 52px;color:' + (o.b.p >= 0 ? "#ff5459" : "#2fd18b") + '">' + fmtPct(o.b.p) + "</b>" +
        '<b class="jn" style="flex:0 0 56px;color:' + (o.b.f >= 0 ? "#ff5459" : "#2fd18b") + '">' + fmtFund(o.b.f) + "</b>" +
        '<b class="jn" style="flex:0 0 40px;opacity:.85;font-weight:400">' + (isFinite(o.b.fr) ? o.b.fr.toFixed(1) + "%" : "—") + "</b></div>";
    };
    var th = '<div class="jlst"><span style="flex:1 1 auto">板块</span><span class="jn" style="flex:0 0 52px">涨幅</span><span class="jn" style="flex:0 0 56px">主力</span><span class="jn" style="flex:0 0 40px">占比</span></div>';
    return '<div class="jlsh"><b>板块资金</b><i>' + (early ? "竞价中 · " : "") + "3分钟一更 · " + hhmm(S.bkq.t) + "</i></div>" +
      (top.length ? th + top.map(function (o) { return line(o); }).join("") + fundTopHtml() : "") +
      (inn.length ? '<div class="jlsh"><b>资金在进、还没怎么涨</b><i>埋伏候选</i></div>' + inn.map(function (o) { return line(o); }).join("") : "") +
      (out.length ? '<div class="jlsh"><b style="color:#5ae8ab">钱在走</b><i>主力净流出 · 越危险越靠前</i></div>' +
        '<div class="jlst"><span style="flex:1 1 auto">板块 · 持续</span><span class="jn" style="flex:0 0 52px">涨幅</span><span class="jn" style="flex:0 0 56px">主力</span><span class="jn" style="flex:0 0 40px">占比</span><span class="jn" style="flex:0 0 30px">趋势</span></div>' +
        out.map(function (o) {
          var t = o.sg.tier || 1, I = outInfo(o.sec), tc = t === 1 ? "#ff5459" : t === 2 ? "#ffd21f" : "#5ae8ab";
          return '<div class="jlrow" data-jlsec="' + esc(o.sec) + '" style="align-items:flex-start">' +
            '<em><span style="display:block;font-weight:500">' + esc(o.sec) + '<i class="jtag" style="color:' + tc + ';margin-left:5px">' + OUTN[t] + "</i></span>" +
            (I.min != null ? '<span style="display:block;font-size:9.5px;font-weight:400;opacity:.7;margin-top:1px">' + outDurTxt(I.min) + "</span>" : "") + "</em>" +
            '<b class="jn" style="flex:0 0 52px;color:' + (o.b.p >= 0 ? "#ff5459" : "#2fd18b") + '">' + fmtPct(o.b.p) + "</b>" +
            '<b class="jn" style="flex:0 0 56px;color:#2fd18b">' + fmtFund(o.b.f) + "</b>" +
            '<b class="jn" style="flex:0 0 40px;opacity:.85;font-weight:400">' + (isFinite(o.b.fr) ? o.b.fr.toFixed(1) + "%" : "—") + "</b>" +
            '<b class="jn" style="flex:0 0 30px;font-size:10px;font-weight:500;color:' + (I.tr === "加速" ? "#2fd18b" : "#fff") + ';opacity:' + (I.tr ? 1 : .5) + '">' + (I.tr === "加速" ? "▼加速" : I.tr === "放缓" ? "放缓" : I.tr === "持平" ? "持平" : "—") + "</b></div>";
        }).join("") +
        '<div class="jf">拉高在出最危险；持续越久越不是偶然；趋势比的是 15 分钟前的主力净额。</div>' : "") +
      (early ? '<div class="jf">竞价段主力数据还很少，9:30 后会越来越准</div>' : "");
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
  /* 11-12 用户: 6-7张卡一屏放不下 → 合并成 3 张, 每张内部用 .jlsh 分区; 配色不动只改排版 */
  function card(t, sub, right, inner) { return '<div class="jlsc"><div class="jlscT"><b>' + t + "</b>" + (sub ? "<i>" + sub + "</i>" : "") + (right ? "<u>" + right + "</u>" : "") + "</div>" + inner + "</div>"; }
  function paint() {
    if (DRAG.on) return; /* jl-C: 拖拽中不重建DOM(手柄监听会丢), 60s下一轮补刷 */
    var R = ensureRoot();
    var has = !!(S.last && S.day);
    var sub = has ? (S.day + " · 强度样本 · " + (S.at ? "数据时点 " + new Date(+S.at).toTimeString().slice(0, 5) : "暂无数据")) : "暂无强度数据"; /* jl-1166c: 明确这是强度样本，不是板块资金状态 */
    if (has && S.last.ranked && S.last.ranked.length) { /* jl-1208: 有排名时手柄直接报最强两个板块——抽屉不打开也看得到有没有内容、谁最强 */
      var _rr = S.last.ranked, _r0 = _rr[0], _r1 = _rr[1], _a0 = _r0.factors && _r0.factors.avgPct, _tt = S.at;
      sub = "最强" + (_a0 && _a0.state === "ok" && _a0.raw < 0 ? "（全线跌·最抗跌）" : "") + " " + _r0.sector + (_a0 && _a0.state === "ok" ? " " + fmtPct(_a0.raw) : "") + (_r1 ? " · " + _r1.sector : "") + (_tt ? " · " + new Date(+_tt).toTimeString().slice(0, 5) : ""); /* 11-12: 榜一是负数时标注这是最抗跌, 不然像显示错了 */
    }
    var hasAna = !!(S.ana && Object.keys(S.ana).length);
    if (hasAna && S.review) sub = "复盘 " + S.dispDay + (S.lead ? " · 主攻 " + S.lead : "");
    var sgL = (S.surges || []).slice().sort(function (x, y) { return (y.t2 || y.t) - (x.t2 || x.t); }), sg0 = sgL[0];
    var sgHot = !!(sg0 && S.live && Date.now() - (sg0.t2 || sg0.t) < 40 * 60e3);
    if (sg0 && S.live) sub = (sg0.kind === "strong" ? "🔥" + sg0.sec + " 强势 " : sg0.kind === "fund" ? "💰" + sg0.sec + " 资金先进 " : sg0.kind === "out" ? "⚠" + sg0.sec + " " + OUTN[outTierOf(sg0)] + " " : "⚡" + sg0.sec + " 急拉 ") + hhmm(sg0.t2 || sg0.t) + (sgL.length > 1 ? " 等" + sgL.length + "个" : ""); /* 11-12: 有提醒时手柄只显示提醒(不再拼"最强"尾巴, 两条拼一起必截断成省略号) */
    /* ===== 11-12 用户: 抽屉重排成 3 张卡 =====
       ① 今天实时: 资金榜 → 情绪天气 → 领涨时间线 → 现在最强板块
       ② 复盘: 退潮前兆 → 板块轮动热力图
       ③ 推荐跟踪: 埋伏候选 → 推荐过的板块 → 个股复查
       配色不动, 只剩卡内分区 .jlsh; 急拉弹窗 surgeHtml 仍独立(它是浮层不是卡) */
    var surge = surgeHtml();
    var ld = (S.lead && S.ana && S.ana[S.lead]) ? S.lead : null; /* 11-12: paint 里要用主攻名(卡片右上) */
    var c1 = "", c2 = "", c3 = "";
    var c1head = "", c2head = "", c3head = "";
    if (has) {
      var o = S.last, rk = o.ranked.slice(0, 8);
      var restAll = o.recs.filter(function (r) { return r.factors.avgPct.state !== "ok" && r.sector !== CORE.UNATTR; });
      var rest = restAll.filter(function (r) { return r.factors.avgPct.state !== "miss" && r.factors.avgPct.state !== "stale"; }).slice(0, 4);
      var sl = S.stale || {}, slTxt = [sl.rows ? "个股涨跌" : "", sl.zt ? "涨停名单" : ""].filter(Boolean);

      /* ---------- ① 今天实时 ---------- */
      c1 = fundBoardHtml() + weatherHtml() + tlHtml();
      if (slTxt.length) c1 += '<div class="jf" style="color:#ffd84a">⚠ ' + esc(slTxt.join("、")) + "还是旧日子的数据，没算进来</div>";
      if (rk.length) {
        c1 += '<div class="jlsh"><b>现在最强的板块</b><i>按强度排名</i></div>' + rk.map(function (r, i) { return secRow(r, i); }).join("");
      } else if (hasAna && S.review) {
        c1 += revRank();
      } else {
        c1 += '<div class="jf">现在股票太少，还排不出强弱（等数据多一些会自动出来）</div>';
      }
      if (rest.length) c1 += '<div class="jf">股票太少暂不排名：' + rest.map(function (r) { return esc(r.sector); }).join(" · ") + "</div>";
      c1head = has ? (S.at ? "数据时点 " + new Date(+S.at).toTimeString().slice(0, 5) : "") : "";

      /* ---------- ② 复盘 ---------- */
      c2 = decayBoardHtml() + heatHtml();
      c2head = S.review ? "复盘 " + S.dispDay : "";

      /* ---------- ③ 推荐跟踪 ---------- */
      c3 = pickRecHtml() + trkHtml() + pickTableHtml() + pickerHtml();
      c3head = "";
    } else if (hasAna) {
      c1 = tlHtml() + (S.review ? revRank() : "");
      c2 = heatHtml();
      c3 = pickerHtml();
    }
    var body;
    var any = (c1 + c2 + c3).trim();
    if (!any) body = '<div class="jf">还没有数据，开盘后会自动算出来</div>';
    else body = (c1 ? card("今天实时", c1head, ld && !S.review ? "主攻 " + esc(ld) : "", c1) : "")
      + (c2 ? card("复盘", c2head, ld ? "主攻 " + esc(ld) : "", c2) : "")
      + (c3 ? card("推荐跟踪", "", "", c3) : "");
    body = surge + body;
    /* jl-C: 白玻璃抽屉结构——手柄(拖条+标题+时点+箭头) + 内容区; 开合由ROOT.open类驱动max-height动画 */
    var _pg0 = document.getElementById("jlpgPager"), _ch0 = document.getElementById("jlpgChips"), pgL = _pg0 ? _pg0.scrollLeft : 0, chL = _ch0 ? _ch0.scrollLeft : 0;
    var _rp0 = document.getElementById("jlrecPg"), recL = _rp0 ? _rp0.scrollLeft : 0;
    var prevB = document.getElementById("jlsectBody"), sc = prevB ? prevB.scrollTop : 0; /* 刷新保留滚动位置 */
    var _rdN = rdUnread(); /* 11-12: 手柄未读角标——今天有几条提醒没看过, 红字常驻直到点开提醒列表 */
    R.innerHTML = '<div id="jlsectHandle"><span class="jlsecGrab"></span><b>板块强度</b>' + (_rdN > 0 ? '<span class="jlsecRd">' + _rdN + '条未读</span>' : '') + '<small' + (has ? '' : ' class="jlsecNo"') + '>' + esc(sub) + '</small><span class="jlsecArr">⌄</span></div>' +
      '<div id="jlsectBody">' + body + "</div>";
    R.classList.toggle("open", !!S.open);
    R.classList.toggle("surge", sgHot);
    R.style.display = ""; /* 本地修复：无数据也保留抽屉入口，内容区显示现有空状态；全屏隐藏仍由 CSS 控制。 */
    var nb = document.getElementById("jlsectBody");
    if (nb) nb.scrollTop = sc;
    var _pg1 = document.getElementById("jlpgPager"), _ch1 = document.getElementById("jlpgChips");
    var _rp1 = document.getElementById("jlrecPg"); if (_rp1) _rp1.scrollLeft = recL;
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
      DRAG.on = true; DRAG.y0 = e.clientY; DRAG.dy = 0; DRAG.t0 = Date.now(); DRAG.h0 = R.getBoundingClientRect().height; /* 11-12修: 按下时记一次起始高度 */
      R.style.transition = "none";
      try { h.setPointerCapture(e.pointerId); } catch (ec) {}
      e.preventDefault();
    });
    h.addEventListener("pointermove", function (e) {
      if (!DRAG.on) return;
      DRAG.dy = e.clientY - DRAG.y0;
      R.style.maxHeight = Math.max(22, Math.min(capH(), DRAG.h0 - DRAG.dy)) + "px"; /* 11-12修: 原每帧用当前高度再减总位移=重复扣, 越拖越快 */ /* 上拉(dy<0)抽屉变高, 下滑收矮, 32~capH夹紧 */
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

  function diag() { return { day: S.day, at: S.at, ztSrc: S.ztSrc, stat: S.stat, sectors: S.last ? S.last.recs.length : 0, t3: S.lastT3 ? S.lastT3.length : 0, snapKeys: S.keys ? S.keys.size : -1, fundDay: fundDayMeta() }; } /* 11-12: 带板块资金日归档覆盖度(天数/收盘采样天数/每天条数) */

  openDB();
  setTimeout(compute, 1800);
  setInterval(function () { if (!document.hidden) compute(); }, 60e3);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(compute, 500); });
  window.__JLSEC__ = { CORE: CORE, S: S, rotHtml: rotHtml, heatHtml: heatHtml, trkHtml: trkHtml, fundTopRec: fundTopRec, fundTopHtml: fundTopHtml, pickerHtml: pickerHtml, pickLead: pickLead, compute: compute, exportJSON: exportJSON, diag: diag, surgeCheck: surgeCheck, showSurge: showSurge, fundCheck: fundCheck, fundSnapSave: fundSnapSave, openSec: openSec, openReview: openReview, paint: paint, decayCheck: decayCheck, decayHtml: decayHtml, decayBoardHtml: decayBoardHtml, pickTableHtml: pickTableHtml, pickStatsJL: pickStatsJL };
})(typeof window !== "undefined" ? window : globalThis);
