/* jl_t6_probe.js — jl-1128 v0.84.73 T6 信号环境探针（独立文件 · 零侵入观察者）
 * 职责: 龙池主推(jl_pool_picks_v1)落库时刻, 留档当时各环境存储的当场读数——
 *       回答 T6 验证问题 "信号出现时, 市场环境是什么"。与 picks 的 r1/r2/r3 回填配套。
 * 红线: ①零业务侵入——不代理不覆写产品钩子, 不改任何既有存储, 只读既有 localStorage 键;
 *       ②零自有计算——环境值一律取各存储"已存原值", 不重算不派生(计数仅取存储内已有聚合值);
 *       ③各环境源带"自身时间锚点"(at/date/d0), 与探针捕获时间(at)显式分离——口径五;
 *       ④缺源记 {ok:0}——区分"未采样"与"采样为空"(类型3);
 *       ⑤全程 try/catch 静默, 任何失败不影响页面; 定时器仅 setInterval(循 evidence 层惯例);
 *       ⑥写入走 jlSafeSetJL 配额守卫(有则用, 无则裸 setItem)。
 * 证据性口径注记: 《T7-0 字段证据性原则登记 2026-10-11》正文约束 T7-0 snapshot schema;
 *   本探针为 T6 观察者日志, 循 jl_event_log 先例(记录信号时刻各存储当场读数+各自时间锚点+来源ok位),
 *   不预计算、不派生、不留未来预留字段。
 * 触发: 轮询 jl_pool_picks_v1(30s); 指纹 fp = d0|ts|票数|code串(不含 r1/r2/r3/dead, 免回填误触发);
 *   指纹变化(新扫描/实盘重扫定稿)即捕获一条 cap; 同指纹去重(页面刷新不重复记); 每日上限6条。
 * 存储: localStorage jl_t6_env_v1 = { [d0]: { caps: [{at, fp, n, env:{...}}] } }; 保留120日(对齐 jl_zt_hist_v1)。
 * 环境源(当场读数, 各自锚点):
 *   mtemp  jinlin_mtemp_v1  {ok, at, t, up, down, flat, amt}      主模块温度采样(纯涨跌比映射, at=采样毫秒)
 *   t2snap jlv2_snap_v1     {ok, date, at, t, up, down, flat, amt} 温度v2快照(date闸+at=HH:MM)
 *   t2idx  jlv2_idx_v1      {ok, date, at, idx:[{secid,name,pct}]} 指数读数(结构判断输入)
 *   t2pool jlv2_pool_v1     {ok, date, zt:{n,lb,zbc}, zb:{n}, dt:{n}} 池聚合计数(温度v2九因子输入, 只取计数不取明细行)
 *   pool   jl_pool_v1       {ok, d0, ts, src, uni}                 龙池扫描本体(src=live/offline, uni=宇宙数)
 *   gjd    jl_gjd_hist_v1   {ok, lastD, lastV}                     国家队ETF主力净额史最后一条(d=日期)
 * 回滚: 删除本文件挂载行即完全移除; jl_t6_env_v1 可整体删除, 无残留。
 * 调试钩: window.__JLT6P__ = {v, st, tick} (只读状态+手动触发, 仅供验证)。 */
(function () {
  "use strict";
  if (window.__JLT6P__) return; /* 双重加载保护 */
  var KEY = "jl_t6_env_v1", TICK = 30e3, CAP_MAX = 6, KEEP_D = 120, VER = "t6p1";
  var st = { ticks: 0, caps: 0, lastFp: "", lastAt: "", err: 0 };
  function jparse(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function save(db) {
    try {
      var s = JSON.stringify(db);
      if (typeof jlSafeSetJL === "function") { jlSafeSetJL(KEY, s); } else { localStorage.setItem(KEY, s); }
    } catch (e) { st.err++; }
  }
  function iso() { return new Date().toISOString(); }
  function num(v) { return Number.isFinite(+v) ? +v : null; }

  /* 主推读取: 取日期最大键的条目; fp 只用稳定字段 */
  function picksNow() {
    var x = jparse("jl_pool_picks_v1");
    if (!x) return null;
    var ks = Object.keys(x).sort();
    if (!ks.length) return null;
    var e = x[ks[ks.length - 1]];
    if (!e || !e.picks || !e.picks.length) return null;
    var d0 = String(e.d0 || ks[ks.length - 1]);
    var codes = e.picks.map(function (p) { return String(p.code || ""); }).join(",");
    return { d0: d0, ts: String(e.ts || ""), n: e.picks.length, fp: d0 + "|" + String(e.ts || "") + "|" + e.picks.length + "|" + codes };
  }

  /* 环境源读数——全部为存储内已存原值, 无重算 */
  function envRead() {
    var m = jparse("jinlin_mtemp_v1"), s2 = jparse("jlv2_snap_v1"), ix = jparse("jlv2_idx_v1"),
        pp = jparse("jlv2_pool_v1"), pl = jparse("jl_pool_v1"), g = jparse("jl_gjd_hist_v1");
    var env = {};
    env.mtemp = !m || !m.data ? { ok: 0 } : {
      ok: 1, at: m.at || null,
      t: num(m.data.t), up: num(m.data.up), down: num(m.data.down), flat: num(m.data.flat), amt: num(m.data.amt)
    };
    env.t2snap = !s2 ? { ok: 0 } : {
      ok: 1, date: s2.date || null, at: s2.at || null,
      t: num(s2.t), up: num(s2.up), down: num(s2.down), flat: num(s2.flat), amt: num(s2.amt)
    };
    env.t2idx = !ix || !ix.idx ? { ok: 0 } : { ok: 1, date: ix.date || null, at: ix.at || null, idx: ix.idx };
    env.t2pool = !pp ? { ok: 0 } : {
      ok: 1, date: pp.date || null,
      zt: pp.zt ? { n: num(pp.zt.n), lb: num(pp.zt.lb), zbc: num(pp.zt.zbc) } : null,
      zb: pp.zb ? { n: num(pp.zb.n) } : null,
      dt: pp.dt ? { n: num(pp.dt.n) } : null
    };
    env.pool = !pl ? { ok: 0 } : { ok: 1, d0: pl.d0 || null, ts: pl.ts || null, src: pl.src || null, uni: num(pl.uni) };
    if (!g) { env.gjd = { ok: 0 }; }
    else {
      var gk = Object.keys(g).sort();
      env.gjd = gk.length ? { ok: 1, lastD: gk[gk.length - 1], lastV: num(g[gk[gk.length - 1]]) } : { ok: 1, lastD: null, lastV: null };
    }
    return env;
  }

  function tick() {
    st.ticks++;
    try {
      var pk = picksNow();
      if (!pk) return;
      if (pk.fp === st.lastFp) return;
      var db = jparse(KEY) || {};
      var day = db[pk.d0];
      if (day && day.caps && day.caps.some(function (c) { return c && c.fp === pk.fp; })) { st.lastFp = pk.fp; return; }
      if (!day) day = db[pk.d0] = { caps: [] };
      if (!day.caps) day.caps = [];
      day.caps.push({ at: iso(), fp: pk.fp, n: pk.n, env: envRead() });
      while (day.caps.length > CAP_MAX) day.caps.shift();
      var ks = Object.keys(db).sort();
      while (ks.length > KEEP_D) { delete db[ks.shift()]; ks = Object.keys(db).sort(); }
      save(db);
      st.caps++; st.lastAt = iso(); st.lastFp = pk.fp;
    } catch (e) { st.err++; }
  }

  window.__JLT6P__ = { v: VER, st: st, tick: function () { tick(); } };
  tick();
  setInterval(tick, TICK);
})();
