/* jl_sector_strength.js — jl-1094 v0.84.39 T4a第一阶段: 可解释板块强度基础层(独立新文件)
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
    SCHEMA: "t4a_v1", RULE: "r2", CAL: "mc>sec>hy", MIN_N: 8, UNATTR: "（未归属·个股扩散）",
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
        o.cand.push({ c: String(r.c), n: String(r.n || ""), lbc: +r.lbc || 0, fund: +r.fund || 0 });
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
                     : { raw: null, state: "miss", note: hasRows ? "板块样本不在mtemp口径覆盖" : "mtemp rows缺失" };
        var fUpR = a ? (a.n < minN ? { raw: null, state: "smallN", note: "样本" + a.n + "<" + minN }
                                    : { raw: Math.round((a.up / a.n) * 1e4) / 1e4, state: "ok", note: "up=" + a.up + "/n=" + a.n })
                     : { raw: null, state: "miss", note: hasRows ? "板块样本不在mtemp口径覆盖" : "mtemp rows缺失" };
        var fZt = z ? { raw: z.ztN, state: "ok", note: "lb=" + z.lb } : { raw: null, state: "none", note: "当日涨停池无该板块成员" };
        var fEv = e ? { raw: (e.mcDistRaw ? { codeN: e.codeN, recN: e.recN, memPeak: e.memPeak, mcDistRaw: e.mcDistRaw } : { codeN: e.codeN, recN: e.recN, memPeak: e.memPeak }), state: "ok", note: e.mcDistRaw ? "sp未归属" + e.recN + "条·mcDist原文保留" : "T3记录" + e.recN + "条·并集" + e.codeN + "股" }
                    : { raw: null, state: "none", note: "当日T3无该板块记录" };
        var cand = z ? z.cand.slice().sort(function (x, y) { return (y.lbc - x.lbc) || (y.fund - x.fund); }).slice(0, 3) : [];
        var rec = {
          schema: CORE.SCHEMA, rule: CORE.RULE, day: inp.day, at: inp.at, kb: CORE.bucket(inp.at),
          cal: CORE.CAL, sector: sy, sectorTier: tier, fallback: fb,
          factors: {
            avgPct: { raw: fAvg.raw, std: null, dir: 1, state: fAvg.state, note: fAvg.note, src: "mtemp" },
            upR: { raw: fUpR.raw, std: null, dir: 1, state: fUpR.state, note: fUpR.note, src: "mtemp" },
            ztN: { raw: fZt.raw, std: null, dir: 1, state: fZt.state, note: fZt.note, src: "yd.zt" },
            evN: { raw: fEv.raw, std: null, dir: 1, state: fEv.state, note: fEv.note, src: "t3_idb" },
            amt: { raw: null, std: null, dir: 0, state: "insufficient", note: "现有通道无板块级成交额(禁市场级/涨停股替代)", src: "-" },
            leader: { raw: cand.length ? { cand: cand } : null, std: null, dir: 0, state: "pending", note: "龙头定义留T4b, 仅候选", src: "yd.zt.pool" }
          },
          mid: { rank: null, scoreParts: null }, /* 综合中间值槽位: v0不产出总分(缺失因子不偷分不偷权重) */
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
      var cut = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
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
      var rows = mt && mt.data && mt.data.rows || null;
      var at = (mt && +mt.at) || 0;
      var day = (yd && yd.date) || (at ? new Date(at).toISOString().slice(0, 10) : null);
      if (!day) { S.last = null; paint(); return; }
      var ztPool = (yd && yd.zt && yd.zt.pool) || [];
      var ctx = {
        con: (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {},
        sec: (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {}
      };
      readT3(day, function (t3recs) {
        S.lastT3 = t3recs;
        if (!at && t3recs.length) {
          for (var i = 0; i < t3recs.length; i++) at = Math.max(at, Date.parse(t3recs[i].at || "") || 0);
        }
        var out = CORE.buildSnap({ day: day, at: at, rows: rows, ztPool: ztPool, t3recs: t3recs, ctx: ctx, ydDate: yd && yd.date });
        S.day = day; S.at = at; S.last = out; S.stat = out.tierStat;
        persistAsync(out.recs);
        paint();
      });
    } catch (e) { S.last = null; paint(); }
  }

  /* ============ 渲染: 透明卡(body尾部, jlv2板块卡同区域) ============ */
  var ROOT = null;
  function ensureRoot() {
    if (ROOT) return ROOT;
    ROOT = document.createElement("div");
    ROOT.id = "jlsectroot";
    document.body.appendChild(ROOT);
    return ROOT;
  }
  function chip(label, val, dir, state) {
    var col = state === "ok" ? (dir > 0 ? "#ff8b8f" : dir < 0 ? "#5ae8ab" : "rgba(255,255,255,.85)") : "rgba(255,255,255,.62)";
    var bg = state === "ok" ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)";
    var arrow = state === "ok" ? (dir > 0 ? " ↑" : dir < 0 ? " ↓" : "") : "";
    return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:8px;background:' + bg + ';border:1px solid rgba(255,255,255,.10);font-size:10.5px;color:' + col + ';white-space:nowrap"><b style="color:rgba(255,255,255,.55);font-weight:500">' + label + '</b> ' + esc(val) + arrow + '</span>';
  }
  function secRow(rec) {
    var f = rec.factors;
    var a = f.avgPct, u = f.upR, z = f.ztN, e = f.evN, L = f.leader;
    var dirA = a.state === "ok" ? (a.raw > 0 ? 1 : a.raw < 0 ? -1 : 0) : 0;
    var dirU = u.state === "ok" ? (u.raw >= 0.5 ? 1 : u.raw < 0.5 ? -1 : 0) : 0;
    var evTxt = e.state === "ok" ? ("股" + e.raw.codeN + "·录" + e.raw.recN + "·峰" + e.raw.memPeak) : "无当日记录";
    var candTxt = "";
    if (L.raw && L.raw.cand && L.raw.cand.length) {
      candTxt = '<div style="font-size:9.5px;color:rgba(255,255,255,.55);margin:1px 0 2px 2px">龙头候选(未评分): ' + L.raw.cand.map(function (c) { return esc(c.n) + "(连" + c.lbc + "·封" + fmtYi(c.fund) + ")"; }).join(" / ") + "</div>";
    }
    return '<div style="padding:7px 9px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:12.5px;color:#ffd21f">' + esc(rec.sector) + '</b><small style="font-size:9px;color:rgba(255,255,255,.5)">' + rec.sectorTier + "级 · 样本" + (a.note.indexOf("n=") === 0 ? a.note.slice(2) : "?") + " · 排名#" + (rec.mid.rank || "—") + "</small></div>" +
      chip("涨幅", a.state === "ok" ? fmtPct(a.raw) : stateTxt(a.state), dirA, a.state) +
      chip("上涨率", u.state === "ok" ? Math.round(u.raw * 100) + "%" : stateTxt(u.state), dirU, u.state) +
      chip("涨停数", z.state === "ok" ? z.raw : stateTxt(z.state), z.state === "ok" ? 1 : 0, z.state) +
      chip("事件扩散", evTxt, e.state === "ok" ? 1 : 0, e.state) +
      chip("成交额变化", "数据不足", 0, "insufficient") +
      chip("龙头强度", L.raw && L.raw.cand && L.raw.cand.length ? "待定义(候选" + L.raw.cand.length + ")" : "待定义", 0, "pending") +
      candTxt + "</div>";
  }
  function stateTxt(st) { return st === "smallN" ? "样本<8" : st === "miss" ? "数据缺失" : st === "none" ? "无" : st; }
  function paint() {
    var R = ensureRoot();
    var has = !!(S.last && S.day);
    var head = "板块强度 · v0(T4a)";
    var sub = has ? (S.day + " · " + (S.at ? "数据时点 " + new Date(+S.at).toTimeString().slice(0, 5) : "无mtemp") + " · 口径 " + CORE.CAL) : "数据未到/无当日缓存";
    var body = "";
    if (has) {
      var o = S.last, rk = o.ranked.slice(0, 8);
      var rest = o.recs.filter(function (r) { return r.factors.avgPct.state !== "ok" && r.sector !== CORE.UNATTR; }).slice(0, 4);
      var unr = o.recs.filter(function (r) { return r.sector === CORE.UNATTR; })[0] || null;
      body += rk.length ? rk.map(secRow).join("") : '<div style="font-size:10.5px;color:rgba(255,255,255,.6);padding:6px 2px">当日无n≥8板块样本(mtemp rows缺失或全被口径滤除)</div>';
      if (rest.length) body += '<div style="font-size:9px;color:rgba(255,255,255,.4);margin:6px 0 2px">— 样本<8或无涨幅数据的板块(事件/涨停侧仍跟踪) —</div>' + rest.map(secRow).join("");
      if (unr) body += '<div style="font-size:9px;color:rgba(255,255,255,.5);margin:5px 0 0">· 个股扩散未归属 ' + unr.factors.evN.raw.recN + " 条(成分股" + unr.factors.evN.raw.codeN + ", sp无mc不猜测) · mcDist 原文留存快照</div>";
      var st = S.stat || { mc: 0, sec: 0, hy: 0, unattr: 0 };
      body += '<div style="font-size:9px;color:rgba(255,255,255,.45);margin-top:7px;line-height:1.6">公式: 涨幅=Σpct/n · 上涨率=up/n(jl-1080原式, n&lt;8不参评) | 涨停=ZT池×口径 | 扩散=T3 IDB当日记录(定义=成分股并集, 辅存记录数/峰值) | 成交额=数据不足 · 龙头=待定义<br>口径回退: mc ' + st.mc + " / sec " + st.sec + " / hy " + st.hy + (st.unattr ? " / 无归属" + st.unattr : "") + " | 快照=独立IDB(jinlin_secstr) 30分钟桶·90天保留 | T3只读零改</div>";
      body += '<div style="margin-top:6px"><button id="jlSecExp" style="font-size:9.5px;padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#ffd21f;cursor:pointer">导出快照JSON</button></div>';
    } else {
      body = '<div style="font-size:10.5px;color:rgba(255,255,255,.55);padding:6px 2px">等待数据: mtemp/yd 缓存到达后自动计算(60s自检)</div>';
    }
    R.innerHTML = '<div style="margin:10px 0 26px;border-radius:11px;background:rgba(10,26,34,.72);border:1px solid rgba(129,230,217,.16);padding:9px 11px;backdrop-filter:blur(4px)">' +
      '<div id="jlSecHead" style="display:flex;justify-content:space-between;align-items:baseline;cursor:pointer;user-select:none"><b style="font-size:12px;color:#81e6d9">' + head + '</b><small style="font-size:9px;color:rgba(255,255,255,.5)">' + esc(sub) + (S.open ? " ▾" : " ▸") + "</small></div>" +
      '<div id="jlSecBody" style="display:' + (S.open ? "block" : "none") + ';padding-top:6px">' + body + "</div></div>";
    var h = document.getElementById("jlSecHead");
    if (h) h.onclick = function () { S.open = !S.open; paint(); };
    var b = document.getElementById("jlSecExp");
    if (b) b.onclick = function (ev) { ev.stopPropagation(); exportJSON(); };
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

  function diag() { return { day: S.day, at: S.at, stat: S.stat, sectors: S.last ? S.last.recs.length : 0, t3: S.lastT3 ? S.lastT3.length : 0, snapKeys: S.keys ? S.keys.size : -1 }; }

  openDB();
  setTimeout(compute, 1800);
  setInterval(function () { if (!document.hidden) compute(); }, 60e3);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(compute, 500); });
  window.__JLSEC__ = { CORE: CORE, S: S, compute: compute, exportJSON: exportJSON, diag: diag };
})(typeof window !== "undefined" ? window : globalThis);
