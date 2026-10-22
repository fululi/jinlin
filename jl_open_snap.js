(function (global) {
  "use strict";
  if (global.__JLOSNAP__) return; /* 双重加载保护 */
  /* =====================================================================
   * jl_open_snap.js — 开盘快照采样器 os1 (jl-1141, 独立文件·零侵入·方案a)
   * 依 2026-10-22 用户确认件实施; 回滚 = 删 index.html 挂载行 + 删两个自有键。
   *
   * 【固定时点采样(补充6)】窗口 09:26:00-09:29:59 / 09:35:00-09:39:59 /
   *   10:00:00-10:04:59; 时点一律以腾讯报价 a[30] 时分秒判定, 不用手机墙钟。
   *   手机墙钟仅做预筛: 工作日 + 窗口±2分钟区间内才考虑发请求(补充约束1)。
   *   每窗口每日最多2次请求(2026-10-22 11:04 放宽件: 首次+重试1次, 间隔
   *   ≥20秒, 同端点一次带全部持仓代码+上证指数); 请求消耗标记写入失败
   *   (localStorage 不可写)时绝不发请求(11:50 审查件, 防刷新后超发)。
   *   错窗不记账(11:50 审查件): 报价窗口归属 winHit 必须等于请求窗口 win,
   *   不一致只落 miss(reason: cross-window), 不写入别的窗口。
   *   个股错窗(12:04 审查件): 记录内个股 a[30] 落在别窗→该行 q.state=stale
   *   +why:cross-window(hms), 数值/asOf 照记不伪造不丢弃; 指数错窗则整窗拒绝。
   *   重试用尽仍无有效快照→miss 条目(reason 带 -1/-2 区分首次/重试,
   *   原位更新+hist 保留两次尝试时间原因), 不占固定时点槽位;
   *   重试命中后 miss 保留为历史(仅 att:1), fixedToday 以 win 记录优先。
   *   有效快照三条件(同时满足): 报价日期==今天(a[30]前8位与手机日历日交叉
   *   校验, 防过期报价), 报价时间>=09:25:00, 开盘价>0。窗口外跳过。
   *
   * 【档位只读(补充7)】S1/B1 只直读 localStorage 的 jinlin_tier_memo_v1
   *   (tierLevelsJL 落盘的 computeTierJL 冻结算法输出, 含dk/d/planNext),
   *   绝不调用 tiersViewJL/computeTierJL/tierLevelsJL/ratchetJL——它们写
   *   jinlin_tier_day_v1/jinlin_tier_memo_v1/jinlin_calib_v1。缓存缺→null/missing。
   *
   * 【手动记录】manual:true, type:"manual", win:null, 不占不挡固定时点;
   *   只读内存态与既有缓存, 零网络/零已有键写入/零档位重算; 价格取
   *   jl_dk_<code> 日K缓存末根(页面60s刷新, 滞后如实标 stale); 档位取
   *   memo 值并标 lastComputed:true(上次计算值); 数据缺失记 null/missing。
   *   手动与采样开关无关(开关只闸定时采样), 单日上限30条(超限拒绝不删旧)。
   *
   * 【存储与写隔离(补充3/约束3)】只写自有键: jl_osnap_v1(记录) +
   *   jl_osnap_on_v1(开关); 请求标记写失败→不发请求(11:50, 防刷新超发);
   *   manual() 记录写失败→返回 ok:false reason:store-write-fail(12:04, 不假报成功);
   *   记录键坏 JSON→空壳继续跑且原文片段(前8192字符)装进 _rawTxt 随键保全(12:04不空壳
 *   覆盖; 12:33口径: 上限8192, 超长保全片段而非全文);其余
   *   写失败静默跳过并在内存累计 wFail(补充9,
   *   导出带上; 持久累计 wFails 尽力随成功写入落盘)。不调用通用写入辅助
   *   jlSafeSetJL——其配额驱逐会清别的键; 不 removeItem 不清缓存不注销SW不腾空间;
   *   记录上限120条/保留最近10个有记录的自然日(周末空档不按日历回数, 12:04), 裁剪只裁自己的数组。
   *
   * 【时钟基准(12:33审查件)】模块时间单入口 _now()(测试注入钟或真实钟); tick(now)
 *   显式入参优先, 同一次采样全流程共用该dt: 窗口判定/预算与归属日d/报价日基准today8/
 *   miss归属日均取自dt, 不混第二基准; 记录字段d/t以报价a[30]为准(外部数据时间)。
 *   lastAt与行情URL防缓存参数同走_now。唯一有意例外: 外部键jinlin_mtemp_v1的at
 *   由主包真实钟写入, 新鲜度读侧用真实钟对齐写入方(注入钟不伪造外部缓存新鲜度)。
 *
 * 【多标签页与离线口径(12:44审查件)】请求预算=每页面实例+持久化累计: 同实例续跑/真
 *   重载受限≤2/窗/日; 多标签页错峰tick(先读后写串行落盘)下跨标签合计仍≤2(标记在请求
 *   前同步写盘); 同瞬读-写竞态(两标签同毫秒读零再各自写)最坏合计≤2×标签数——
 *   localStorage无原子CAS无法根除, 属已知边界(预算设计目标=单页面防刷新超发)。
 *   离线口径: 本模块与既有jl_*.js子资源一致不进SW壳缓存(SW只预缓存并拦截壳HTML:
 *   ./+index.html+ks.html, 其余子资源直连网络); 断网时壳由SW兜底可开页面, 本模块
 *   不挂载(记录查看/导出离线不可用), 恢复联网刷新即回; 采样本身依赖腾讯行情接口,
 *   离线必然无新快照——"页面可离线打开"与"离线采样"是两回事, 本模块只承诺前者之外的
 *   在线路径完整。
 *
 * 【13:26定点复核三修复】①报价新鲜度(13:26快照比对→13:44升级iframe隔离): 报价
 *   脚本载入一次性隐藏iframe, 响应v_*只写iframe自有全局——主包(顶层window)并发
 *   写入物理不可达, 来源归属结构性成立; 每请求全新iframe(自身上轮响应亦不残留)
 *   +请求时防御性清键双保险; iframe创建失败→按miss重试, 不回退顶层window(回退
 *   会重开污染口)。②基准穿透: buildWinRec的today8改由tick(now)流程日传入(原来
 *   重取ymd8()=_now(), 注入钟/响应异步时刻会与流程日分裂→同记录状态误标stale),
 *   无指数时d回退同基准; savedAt/lastAt仍走_now(12:33既定"落库时刻"口径, 与
 *   采样基准分离); env块stale判定仍按读取时刻(12:33外部键对齐写入方规则)。③
 *   异常防护: 持仓数组条目null/非对象/无code→跳过该条目不中断(全部异常→清单
 *   missing不伪造), jl_sector_ff_v1合法JSON但值null→空表missing; 修复前两处
 *   都会抛错中断采样且无miss可追踪。
 *
 * 【残余边界(13:42审查件)——13:44已闭合】13:42指认: 快照比对只能拦"零改写",
 *   不能区分写入方(主包60s并发恰落请求前后之间→该行被当本次结果, 风险=来源归
 *   属被冒名)。13:44闭合: 报价脚本改载一次性隔离iframe(见上文①), 写入方物理
 *   区分, 该边界消除, 来源证明自此成立。③口径补充: 过滤后全异常→missing与"空
 *   清单"同口径(记录ps:[]="无可用持仓行"; holdList().state不进记录——既有行
 *   为, 非新增"持仓为零"标记; 修复前空数组同样走missing+ps:[])。
 *   桩测试口径: makeDoc默认iframe桩contentWindow=global(既有用例零改动——模块
 *   请求时清键, 用例tick后设值不受影响); iso隔离模式专测并发归属(C1-C3)。
 *
 * 【14:59 UI热修(用户截图圈定"丑死")】迷你面板改双态: 默认收起成左下角小药丸
 *   ("快照os1 ✓✗· 手N"单行, 圆角999, 点击展开); 展开态=紧凑三行(标题+✕收起/
 *   状态行/短按钮[采样:开|记一次|导出|复制]一行), 修前常驻全展开+4个长文字按钮
 *   (导出开盘快照JSON/现在记录一次…)换行堆成~150px深色大块压在账户区上——截图
 *   判丑的根因; 展开面板高度约减半, 药丸态~22px; st.uiRoot/uiOpen/uiToggle供
 *   桩测试; boot/initUI的interval在Node下unref(防桩测试进程挂起)。
 *
 * 【导出(补充8)】"导出开盘快照JSON": 页面内生成文件, 文件名带日期
   *   jl_open_snap_YYYYMMDD.json; 失败(或用户点"复制模式")弹文本框供复制;
   *   导出失败不影响页面(全程try/catch静默)。
   *
   * 【状态四分法(用户确认)】每字段独立 {state, src, asOf}:
   *   ok=来源在且有当日值 / stale=来源在但过期(值保留) /
   *   missing=来源存在但无值 / unreadable=模块读不到(保留原因)。
   *   unreadable 永不记成 missing。stale 口径以手机日历日为参考线;
   *   记录归属日 d 以 a[30] 报价日期为准(dSrc:"quote"), 手动无报价
   *   时 dSrc:"phone" 如实标注。T7 板块资金史不进开盘快照(开盘窗恒空,
   *   收盘后可用手动入口留档, 见交付说明)。
   * ===================================================================== */
  var VER = "os1", KEY = "jl_osnap_v1", KEY_ON = "jl_osnap_on_v1";
  var WINS = [["09:26", "092600", "092959"], ["09:35", "093500", "093959"], ["10:00", "100000", "100459"]];
  var ARM_MIN = 2;            /* 预筛放宽±2分钟(手机钟, 只决定是否考虑发请求) */
  var TICK_MS = 20e3, REQ_MS = 8e3, CAP_RECS = 120, CAP_MAN_DAY = 30, KEEP_DAYS = 10;
  var MAX_ATT = 2, RETRY_MS = 20e3; /* 放宽件(2026-10-22 11:04): 同窗首次+重试1次, 重试间隔≥20秒 */
  var LS = (typeof localStorage !== "undefined") ? localStorage : null;
  var DOC = (typeof document !== "undefined") ? document : null;
  var BROWSER = !!(DOC && typeof location !== "undefined"); /* Node桩测试: 有document无location→不启定时器/UI */
  var st = { wFail: 0, wOk: 0, reqs: 0, lastAt: 0, lastErr: "" }; /* 补充9: wFail 内存累计, 不落盘(导出带) */
  var _clock = 0;             /* 测试钩: 非零时 _now() 用它 */

  function _now() { return _clock ? new Date(_clock) : new Date(); }
  function ymd(d) { return (d || _now()).toLocaleDateString("sv-SE"); }
  function ymd8(d) { return ymd(d).replace(/-/g, ""); }
  function iso() { try { return _now().toISOString(); } catch (e) { return String(_clock || ""); } }

  /* ---------- 纯函数(供Node桩测试, 零DOM零存储) ---------- */
  function winOf(hms6) { /* "092631"→"09:26"; 窗口外→null */
    var s = String(hms6 || "");
    if (!/^\d{6}$/.test(s)) return null;
    for (var i = 0; i < WINS.length; i++) if (s >= WINS[i][1] && s <= WINS[i][2]) return WINS[i][0];
    return null;
  }
  function validQuote(q14, today8) { /* 三条件前两条(开盘价>0由调用方对每行单判) */
    var s = String(q14 || "");
    if (!/^\d{14}$/.test(s)) return { ok: false, why: "malformed", d: "", hms: "" };
    var d = s.slice(0, 8), h = s.slice(8);
    if (String(today8 || "") !== d) return { ok: false, why: "date", d: d, hms: h };
    if (h < "092500") return { ok: false, why: "pre0925", d: d, hms: h };
    return { ok: true, d: d, hms: h };
  }
  function hms2min(hms6) { return (+String(hms6).slice(0, 2)) * 60 + (+String(hms6).slice(2, 4)) + (+String(hms6).slice(4, 6)) / 60; }
  function armZone(winIdx, minOfDay) { /* 预筛: 手机钟是否落在该窗±ARM_MIN分钟(约束1) */
    var w = WINS[winIdx], a = hms2min(w[1]) - ARM_MIN, b = hms2min(w[2]) + ARM_MIN;
    return minOfDay >= a && minOfDay <= b;
  }
  function fireable(winIdx, minOfDay) { /* 发请求条件: 手机钟进入[窗口起点, 窗止+2分钟], 且该窗未消耗请求 */
    var w = WINS[winIdx];
    return minOfDay >= hms2min(w[1]) && minOfDay <= hms2min(w[2]) + ARM_MIN;
  }

  /* ---------- 只读读取器(状态四分法; 读写均 try/catch 静默) ---------- */
  function lsRaw(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return "@@unreadable"; } }
  function readJ(k) { /* → {state:"ok"|"missing"|"unreadable", v, raw} ; v=解析值或null; raw=坏JSON原文(仅unreadable, 供原键保全) */
    var raw = lsRaw(k);
    if (raw === "@@unreadable") return { state: "unreadable", v: null, raw: "" };
    if (raw === null || raw === "") return { state: "missing", v: null };
    try { return { state: "ok", v: JSON.parse(raw) }; } catch (e) { return { state: "unreadable", v: null, raw: String(raw).slice(0, 8192) }; }
  }
  function stOk(r) { return r && r.state === "ok"; }

  function readStore() { /* 自有记录键; unreadable→空壳继续跑且原文片段随键保全(_rawTxt, ≤8192字符, 12:04审查件+12:33口径): 首写把坏JSON原文片段装进新键内容, 不空壳覆盖丢原文 */
    var r = readJ(KEY);
    if (stOk(r) && r.v && typeof r.v === "object") {
      if (!Array.isArray(r.v.recs)) r.v.recs = [];
      if (!r.v.req || typeof r.v.req !== "object") r.v.req = {};
      if (typeof r.v.wFails !== "number") r.v.wFails = 0;
      r.v.v = r.v.v || VER;
      return r.v;
    }
    var shell = { v: VER, wFails: 0, req: {}, recs: [], _raw: r.state };
    if (r.raw) shell._rawTxt = r.raw; /* 原文随键携带(≤8192), 后续读取解析成功照常携带, 导出storeState仍报unreadable */
    return shell;
  }
  function writeStore(s) { /* 唯一写入口(自有键); 失败→内存计数+对象内累计, 静默(补充9); 返回是否持久化成功 */
    try {
      LS.setItem(KEY, JSON.stringify(s));
      st.wOk++; st.lastAt = _now().getTime(); /* 12:33: 成功戳同走单入口_now(原裸Date.now()与注入钟分裂) */
      return true;
    } catch (e) {
      st.wFail++; s.wFails = (s.wFails || 0) + 1; st.lastErr = String(e && e.message || e).slice(0, 120);
    }
  }
  function on() { try { var v = lsRaw(KEY_ON); return v === "0" ? false : true; } catch (e) { return true; } } /* 默认开 */
  function toggle() { try { LS.setItem(KEY_ON, on() ? "0" : "1"); } catch (e) { st.wFail++; } return on(); }
  function recorded(store, win, d) { /* 该窗该日是否已有固定记录(按报价日d); 只认type:"win"——miss条目不算(否则失败后无法重试) */
    for (var i = 0; i < store.recs.length; i++) { var r = store.recs[i]; if (r.type === "win" && r.win === win && r.d === d) return true; }
    return false;
  }
  function manCount(store, d) { var n = 0; for (var i = 0; i < store.recs.length; i++) { var r = store.recs[i]; if (r.manual && r.d === d) n++; } return n; }

  function normCode(c) { /* 归一(11:50审查件): 去sh/sz前缀统一大写, 持仓带前缀与报价裸码两侧同归一后匹配 */
    return String(c == null ? "" : c).replace(/^(sh|sz)/i, "").toUpperCase();
  }
  function quoteSym(code) { /* 与主包 quoteSymbol 同规则: 已带交易所前缀原样, 5/6开头补sh, 其余补sz */
    var c = String(code || "");
    if (/^(sh|sz)/.test(c)) return c;
    return (/^[56]/.test(c) ? "sh" : "sz") + c;
  }
  function holdList() { /* 持仓清单(只读 jinlin_stocks_v2); 13:26审查件: 条目null/非对象/无code→跳过不中断(其余合法条目照常, 全部异常→missing不伪造), 修复前null条目直接抛错中断整次采样且无miss */
    var r = readJ("jinlin_stocks_v2");
    if (stOk(r) && Array.isArray(r.v) && r.v.length) {
      var list = r.v.filter(function (x) { return x && typeof x === "object" && String(x.code || "").length > 0; })
        .map(function (x) { return { code: String(x.code || ""), name: String(x.name || "") }; });
      return { state: list.length ? "ok" : "missing", list: list };
    }
    return { state: r.state === "ok" ? "missing" : r.state, list: [] };
  }

  /* ---------- 快照各块采集(全部只读; 每块带 src+asOf+state) ---------- */
  function capMtemp() { /* 市场温度 jinlin_mtemp_v1 {at, data:{t,up,down,flat,amt,fund}} */
    var r = readJ("jinlin_mtemp_v1");
    if (!stOk(r)) return { state: r.state, src: "jinlin_mtemp_v1", asOf: null };
    var v = r.v || {}, d = v.data || {};
    var age = v.at ? Date.now() - v.at : Infinity; /* 12:33定则: 外部键at由主包真实钟写入, 读侧用真实钟对齐写入方(有意区分——注入钟不伪造外部缓存新鲜度) */
    return { state: (v.at && d && d.t !== undefined) ? (age > 15 * 60e3 ? "stale" : "ok") : "missing",
      src: "jinlin_mtemp_v1", asOf: v.at || null, t: d.t, up: d.up, down: d.down, flat: d.flat, amt: d.amt, fund: d.fund };
  }
  function capTv2() { /* 温度v2 jlv2_snap_v1 {date, ok, t, up, down} */
    var r = readJ("jlv2_snap_v1");
    if (!stOk(r)) return { state: r.state, src: "jlv2_snap_v1", asOf: null };
    var v = r.v || {};
    return { state: v.date ? (v.date === ymd() ? "ok" : "stale") : "missing", src: "jlv2_snap_v1",
      asOf: v.date || null, ok: v.ok, t: v.t, up: v.up, down: v.down };
  }
  function capSecF() { /* 板块资金 jl_sector_ff_v1 {板块:{amt,pct,d}} 全表; 13:26审查件: 合法JSON但值非对象(如null)→按空表missing不中断, 修复前Object.keys(null)抛错吞掉整次响应 */
    var r = readJ("jl_sector_ff_v1");
    if (!stOk(r)) return { state: r.state, src: "jl_sector_ff_v1", asOf: null, n: 0, rows: [] };
    var rows = [], maxD = "", n = 0;
    var src = (r.v && typeof r.v === "object") ? r.v : {};
    Object.keys(src).forEach(function (k) {
      var e = src[k]; n++;
      var dd = String(e && e.d || "");
      if (dd > maxD) maxD = dd;
      rows.push({ k: k, amt: e && e.amt, pct: e && e.pct, d: dd });
    });
    return { state: n ? (maxD === ymd() ? "ok" : "stale") : "missing", src: "jl_sector_ff_v1", asOf: maxD || null, n: n, rows: rows };
  }
  function capMf() { /* 4指数主力净额 jl_mf_hist_v1 {d, hist:{指数:[{d,main}]}} 取各指数末行 */
    var r = readJ("jl_mf_hist_v1");
    if (!stOk(r)) return { state: r.state, src: "jl_mf_hist_v1", asOf: null, rows: [] };
    var v = r.v || {}, rows = [];
    Object.keys(v.hist || {}).forEach(function (k) {
      var a = v.hist[k];
      if (Array.isArray(a) && a.length) { var la = a[a.length - 1]; rows.push({ k: k, d: la && la.d, main: la && la.main }); }
    });
    return { state: rows.length ? (v.d === ymd() ? "ok" : "stale") : "missing", src: "jl_mf_hist_v1", asOf: v.d || null, rows: rows };
  }
  function capMemo(manualMode) { /* 档位 jinlin_tier_memo_v1 原样记 dk/顶层d/planNext/S1/B1(补充约束2/4); 三态保真(11:50审查件): 缺失=undefined|null→null, 明确false→false, true→true, 空档位数组→null 不伪造不丢字段 */
    var r = readJ("jinlin_tier_memo_v1");
    if (!stOk(r) || !r.v || typeof r.v !== "object") return { state: stOk(r) ? "missing" : r.state, src: "jinlin_tier_memo_v1", asOf: null, codes: null };
    var v = r.v, codes = {};
    Object.keys(v).forEach(function (k) {
      if (k === "d") return;
      var e = v[k]; if (!e || !e.r) return;
      var rr = e.r;
      var s1 = (Array.isArray(rr.sells) && rr.sells.length && rr.sells[0] != null) ? rr.sells[0] : null;
      var b1 = (Array.isArray(rr.buys) && rr.buys.length && rr.buys[0] != null) ? rr.buys[0] : null;
      codes[k] = { d: v.d, dk: e.dk,
        planNext: rr.planNext === true ? true : rr.planNext === false ? false : null,
        S1: s1, B1: b1, sells: rr.sells || null, buys: rr.buys || null,
        anchor: rr.anchor === undefined ? null : rr.anchor,
        lastComputed: manualMode ? true : undefined }; /* 手动=上次计算值(标注) */
    });
    return { state: Object.keys(codes).length ? (v.d === ymd() ? "ok" : "stale") : "missing", src: "jinlin_tier_memo_v1", asOf: v.d || null, codes: codes };
  }
  function capStrong() { /* 强势评分 jinlin_strong_day_v1 {d, m:{code:{...}}} 原样取 m[code] */
    var r = readJ("jinlin_strong_day_v1");
    if (!stOk(r)) return { state: r.state, src: "jinlin_strong_day_v1", asOf: null, codes: null };
    var v = r.v || {};
    return { state: v.m && Object.keys(v.m).length ? (v.d === ymd() ? "ok" : "stale") : "missing", src: "jinlin_strong_day_v1", asOf: v.d || null, codes: v.m || {} };
  }
  function capFf() { /* 个股资金 jl_ff_v1 {code:{rows:[{d,main,mainPct}],t,src}} 取末行; ch=数据子通道(em-min等) */
    var r = readJ("jl_ff_v1");
    if (!stOk(r)) return { state: r.state, src: "jl_ff_v1", asOf: null, codes: null };
    var v = r.v || {}, codes = {};
    Object.keys(v).forEach(function (k) {
      var e = v[k], rows = e && Array.isArray(e.rows) ? e.rows : [];
      if (!rows.length) return;
      var la = rows[rows.length - 1];
      codes[k] = { d: la.d, main: la.main, mainPct: la.mainPct, ch: e.src || null, asOf: e.t || null,
        state: String(la.d || "") === ymd() ? "ok" : "stale", src: "jl_ff_v1" };
    });
    return { state: Object.keys(codes).length ? "ok" : "missing", src: "jl_ff_v1", asOf: null, codes: codes };
  }
  function capK(code) { /* 手动价格源: jl_dk_<code> 日K缓存末根 [t,o,c,h,l,v](零网络) */
    var r = readJ("jl_dk_" + code);
    if (!stOk(r) || !Array.isArray(r.v) || !r.v.length) return { state: stOk(r) ? "missing" : r.state, src: "jl_dk_" + code, asOf: null };
    var a = r.v, lb = a[a.length - 1], pb = a.length > 1 ? a[a.length - 2] : null;
    var lt = String(lb[0] || "").slice(0, 10);
    return { state: lt === ymd() ? "ok" : "stale", src: "jl_dk_" + code, asOf: lt,
      o: +lb[1] || null, c: +lb[2] || null, hi: +lb[3] || null, lo: +lb[4] || null, pc: pb ? (+pb[2] || null) : null };
  }

  /* ---------- 报价拉取(固定窗口专用; 与主包 importTencentQuotes 同端点同技术) ---------- */
  function fetchQuotes(codes, cb) { /* codes=["sh000001","sh600105",...]; cb(rows|null); 超时8s; 13:44审查件(闭合①残余边界): 报价脚本载入一次性隐藏iframe——响应v_*只写iframe自有全局对象, 主包(顶层window)并发写入物理不可达, 来源归属结构性成立(替代13:26的前后值比对); 每请求全新iframe=自身上轮响应亦不残留; iframe创建失败→cb(null)按miss重试(不回退顶层window——回退路径会重开污染口) */
    if (!DOC || !DOC.createElement) { cb(null); return; }
    try {
      var syms = codes.map(quoteSym), uniq = [];
      var seen = {};
      syms.forEach(function (s) { if (!seen[s]) { seen[s] = 1; uniq.push(s); } });
      var win = null, idoc = null, fr = null;
      try {
        fr = DOC.createElement("iframe");
        if (fr && fr.style) fr.style.display = "none";
        if (fr && fr.setAttribute) fr.setAttribute("aria-hidden", "true");
        (DOC.body || DOC.documentElement).appendChild(fr);
        win = fr.contentWindow || null;
        idoc = fr.contentDocument || (win && win.document) || null;
        if (!win || !idoc || !idoc.createElement) win = null;
      } catch (eF) { win = null; }
      if (!win) { try { if (fr && fr.remove) fr.remove(); } catch (eR) {} st.lastErr = "iframe-unavailable"; cb(null); return; }
      uniq.forEach(function (s) { try { delete win["v_" + s]; } catch (eD) {} }); /* 防御性清键双保险: 全新窗内目标键本不存在, 确保读到的值必来自本次响应(桩测试路径下=清测试全局, 兼容既有用例) */
      var sc = idoc.createElement("script");
      var done = false, tm = 0;
      function fin(ok) {
        if (done) return; done = true;
        clearTimeout(tm);
        try { sc.remove(); } catch (e) {}
        try { if (fr && fr.remove) fr.remove(); } catch (eR) {} /* 一次性iframe随请求移除, 零残留 */
        var rows = null;
        if (ok) {
          rows = [];
          uniq.forEach(function (s) {
            try {
              var a = String(win["v_" + s] || "").split("~");
              if (a.length < 35) return;
              var p = +a[3], pv = +a[4];
              if (!(p > 0) || !(pv > 0)) return;
              rows.push({ sym: s, code: s.replace(/^(sh|sz)/, ""), name: a[1], p: p, pv: pv, op: +a[5] || 0,
                pct: pv > 0 ? +(p / pv * 100 - 100).toFixed(2) : null, hi: +a[33] || null, lo: +a[34] || null, qAt: String(a[30] || "") });
            } catch (e) {}
          });
          if (!rows.length) rows = null;
        }
        cb(rows);
      }
      sc.charset = "GBK";
      sc.onerror = function () { fin(false); };
      sc.onload = function () { fin(true); };
      tm = setTimeout(function () { fin(false); }, REQ_MS);
      sc.src = "https://qt.gtimg.cn/q=" + uniq.join(",") + "&_=" + _now().getTime() + "&jlosnap=1"; /* 12:33: 防缓存参数同走_now(仅唯一性, 不参与判定) */
      (idoc.body || idoc.documentElement).appendChild(sc);
      st.reqs++;
    } catch (e) { st.lastErr = String(e && e.message || e).slice(0, 120); cb(null); }
  }

  /* ---------- 记录组装 ---------- */
  function envBlocks() { return { mt: capMtemp(), tv2: capTv2(), sf: capSecF(), mf: capMf() }; }
  function attBlk(blk, entry, asOf) { /* 约束2: 每字段下沉 src+asOf; entry为null→null(缺不伪造) */
    return entry ? Object.assign({ src: blk.src, asOf: asOf === undefined ? blk.asOf : asOf }, entry) : null;
  }
  function memoEntry(memo, code) { var e = memo.codes && memo.codes[code]; return e ? Object.assign({ src: memo.src, asOf: e.dk || memo.asOf }, e) : null; }
  function strongEntry(strong, code) { return attBlk(strong, strong.codes && strong.codes[code], strong.asOf); }
  function ffEntry(ff, code) { return (ff.codes && ff.codes[code]) || null; }
  function perStockBlocks(list, memo, strong, ff, manualMode) {
    return list.map(function (h) {
      return { code: h.code, name: h.name, m: memoEntry(memo, h.code), g: strongEntry(strong, h.code),
        f: ffEntry(ff, h.code), k: manualMode ? capK(h.code) : null };
    });
  }
  function trimStore(store) { /* 只裁自己的数组: 上限120条 + 保留最近10个有记录的自然日(12:04定案: 按有记录日计, 周末/停牌空档不按日历回数; 12:23审查件: 天数按"去重日期"算——第10新有记录日的当日全部记录整日保留, 不把同日多条当多条天数, 也不按第10新"条"截断) */
    var recs = store.recs;
    if (recs.length > CAP_RECS) recs = recs.slice(recs.length - CAP_RECS);
    if (recs.length) {
      var seen = {}, days = [], i, d;
      for (i = 0; i < recs.length; i++) { d = recs[i].d || ""; if (d && !seen[d]) { seen[d] = 1; days.push(d); } }
      days.sort();
      var cut = days.length > KEEP_DAYS ? days[days.length - KEEP_DAYS] : "";
      if (cut) recs = recs.filter(function (r) { return (r.d || "") >= cut; });
    }
    store.recs = recs;
  }

  function buildWinRec(win, rows, att, today8) { /* 固定窗口记录: 全部字段取自本次报价 + 只读缓存; 缺行按持仓清单记missing; att=该窗所用请求次数; 13:26审查件: today8由tick(now)流程日穿透传入(原ymd8()重取_now, 注入钟/异步响应时刻与流程日分裂→同记录状态误标stale), 缺省回退ymd8()兼容直接调用 */
    today8 = today8 || ymd8();
    var list = holdList(), memo = capMemo(false), strong = capStrong(), ff = capFf(), env = envBlocks();
    var idx = null, i, rowsByCode = {}, wLo = null, wHi = null;
    for (i = 0; i < WINS.length; i++) { if (WINS[i][0] === win) { wLo = WINS[i][1]; wHi = WINS[i][2]; } } /* 个股入窗判定边界 */
    for (i = 0; i < rows.length; i++) { if (rows[i].sym === "sh000001") { idx = rows[i]; } else rowsByCode[normCode(rows[i].code)] = rows[i]; }
    var idxBlk = null;
    if (idx) {
      var vq = validQuote(idx.qAt, today8);
      var okI = vq.ok && idx.op > 0;
      idxBlk = { state: okI ? "ok" : (vq.why === "date" ? "stale" : "missing"), src: "qt.gtimg.cn", asOf: idx.qAt,
        p: idx.p, pv: idx.pv, op: idx.op, pct: idx.pct };
    }
    var ps = list.list.map(function (h) {
      var r = rowsByCode[normCode(h.code)], qs;
      if (r) {
        var v = validQuote(r.qAt, today8), okS = v.ok && r.op > 0;
        var hms = String(r.qAt || "").slice(8, 14); /* 个股自身错窗(12:04审查件): 指数在本窗才落记录, 但个股a[30]可能来自别窗——同窗才标ok, 跨窗标stale+why, 数值照记不伪造不丢弃 */
        var inWin = wLo && hms >= wLo && hms <= wHi;
        qs = { state: okS ? (inWin ? "ok" : "stale") : (v.why === "date" ? "stale" : "missing"), src: "qt.gtimg.cn", asOf: r.qAt,
          p: r.p, pv: r.pv, op: r.op, pct: r.pct, hi: r.hi, lo: r.lo };
        if (okS && !inWin) qs.why = "cross-window(" + hms + ")";
      } else qs = { state: "missing", src: "qt.gtimg.cn", asOf: null, why: "no-row" };
      return { code: h.code, name: h.name, q: qs, m: memoEntry(memo, h.code), g: strongEntry(strong, h.code),
        f: ffEntry(ff, h.code), k: null };
    });
    var d = idx ? String(idx.qAt).slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : today8.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"); /* 13:26: 无指数回退同基准(原ymd()重取_now) */
    return { type: "win", win: win, manual: false, dSrc: "quote", d: d, t: idx ? String(idx.qAt) : null, att: att || 1,
      savedAt: iso(), idx: idxBlk, ps: ps, mt: env.mt, tv2: env.tv2, sf: env.sf, mf: env.mf };
  }

  function buildManualRec() { /* 手动记录: 零网络, 价格=jl_dk_*缓存, 档位=memo(上次计算值) */
    var list = holdList(), memo = capMemo(true), strong = capStrong(), ff = capFf(), env = envBlocks();
    return { type: "manual", win: null, manual: true, dSrc: "phone", d: ymd(), t: null, savedAt: iso(), idx: null,
      ps: perStockBlocks(list.list, memo, strong, ff, true), mt: env.mt, tv2: env.tv2, sf: env.sf, mf: env.mf };
  }

  /* ---------- 固定时点主循环 ---------- */
  function addRec(store, rec) { store.recs.push(rec); trimStore(store); writeStore(store); paintUI(); }
  function addMiss(store, win, reason, qAt, att, dFlow) { /* 每窗每日一条miss; 重试失败原位更新, hist 保留两次尝试的时间与原因; 命中后miss保留为历史, fixedToday以win记录优先; 12:33: 归属日d取流程日dFlow(=tick的dt), 不再独立走本机钟 */
    var d = dFlow || ymd(), i, r;
    for (i = 0; i < store.recs.length; i++) {
      r = store.recs[i];
      if (r.type === "miss" && r.win === win && r.d === d) {
        r.hist = r.hist || [];
        r.hist.push({ att: r.att || 1, reason: r.reason, t: r.t, savedAt: r.savedAt }); /* 保留上一轮尝试 */
        r.reason = reason; r.att = att || r.att || 1; r.t = qAt || r.t || null; r.savedAt = iso();
        trimStore(store); writeStore(store); paintUI(); return;
      }
    }
    store.recs.push({ type: "miss", win: win, manual: false, dSrc: "phone", d: d, t: qAt || null, reason: reason, att: att || 1, savedAt: iso() });
    trimStore(store); writeStore(store); paintUI();
  }
  function tick(now) { /* 每20s: 开关关→直接返回(零请求零写入); 预筛外→零请求; 同窗≤MAX_ATT次(首次+重试1次, 间隔≥RETRY_MS) */
    try {
      if (!on()) return { skip: "switch-off" };
      var dt = now ? new Date(now) : _now(), dow = dt.getDay();
      if (dow === 0 || dow === 6) return { skip: "weekend" };
      var min = dt.getHours() * 60 + dt.getMinutes() + dt.getSeconds() / 60;
      var d = ymd(dt), store = readStore(), today8 = ymd8(dt), nowMs = dt.getTime(); /* 12:33: 报价日基准today8随流程dt走, 不再独立走本机钟(修复tick(now)跨日分裂) */
      var armed = false, fireIdx = -1, i;
      for (i = 0; i < WINS.length; i++) {
        if (!armZone(i, min)) continue;
        armed = true;
        var attN = (store.req[d] && store.req[d][WINS[i][0]]) || 0;
        if (attN >= MAX_ATT) continue;                                              /* 该窗请求已用尽(首次+重试) */
        if (attN > 0 && nowMs - ((store.reat && store.reat[d] && store.reat[d][WINS[i][0]]) || 0) < RETRY_MS) continue; /* 重试间隔≥20s */
        if (recorded(store, WINS[i][0], d)) continue;                               /* 已有固定记录 */
        if (fireable(i, min)) { fireIdx = i; break; }
      }
      if (fireIdx < 0) return { armed: armed };
      var win = WINS[fireIdx][0];
      var att = ((store.req[d] && store.req[d][win]) || 0) + 1;
      store.req[d] = store.req[d] || {}; store.req[d][win] = att;
      store.reat = store.reat || {}; store.reat[d] = store.reat[d] || {}; store.reat[d][win] = nowMs;
      if (!writeStore(store)) { /* 请求消耗标记未持久化→绝不发请求(11:50审查件): 防刷新后丢失计数突破每窗≤2 */
        return { skip: "store-write-fail", wFail: st.wFail };
      }
      var codes = ["sh000001"].concat(holdList().list.map(function (h) { return h.code; }));
      fetchQuotes(codes, function (rows) {
        try {
          var s2 = readStore(); s2.req[d] = s2.req[d] || {}; s2.req[d][win] = Math.max(s2.req[d][win] || 0, att);
          if (!rows) { addMiss(s2, win, "fetch-failed-" + att, null, att, d); return; }
          var idx = null, j;
          for (j = 0; j < rows.length; j++) if (rows[j].sym === "sh000001") { idx = rows[j]; break; }
          if (!idx) { addMiss(s2, win, "no-index-row-" + att, null, att, d); return; }
          var vq = validQuote(idx.qAt, today8);
          if (!vq.ok) { addMiss(s2, win, "quote-" + vq.why + "-" + att, idx.qAt, att, d); return; }
          if (!(idx.op > 0)) { addMiss(s2, win, "open<=0-" + att, idx.qAt, att, d); return; }
          var winHit = winOf(vq.hms);
          if (!winHit) { addMiss(s2, win, "quote-hms-outside(" + vq.hms + ")-" + att, idx.qAt, att, d); return; }
          if (winHit !== win) { addMiss(s2, win, "cross-window(quote→" + winHit + ")-" + att, idx.qAt, att, d); return; } /* 错窗不记账(11:50审查件): 请求窗口=记账窗口, 报价落在别窗只落miss不写入 */
          if (recorded(s2, win, vq.d.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"))) { return; }
          addRec(s2, buildWinRec(winHit, rows, att, today8)); /* 13:26: 流程日today8穿透(单基准) */
        } catch (eT2) { st.lastErr = "tick-resp:" + String(eT2 && eT2.message || eT2).slice(0, 100); }
      });
      return { fired: win, att: att };
    } catch (eT) { st.lastErr = "tick:" + String(eT && eT.message || eT).slice(0, 100); return { err: st.lastErr }; }
  }

  /* ---------- 手动入口 ---------- */
  function manual() { /* 与开关无关; 只读; 写入仅自有键追加一条; 持久化失败→返回失败(12:04审查件), 不假报成功 */
    try {
      var store = readStore(), d = ymd();
      if (manCount(store, d) >= CAP_MAN_DAY) return { ok: false, reason: "manual-day-cap(" + CAP_MAN_DAY + ")" };
      var rec = buildManualRec();
      store.recs.push(rec); trimStore(store);
      if (!writeStore(store)) return { ok: false, reason: "store-write-fail", wFail: st.wFail };
      paintUI();
      return { ok: true, rec: rec };
    } catch (eM) { st.lastErr = "manual:" + String(eM && eM.message || eM).slice(0, 100); return { ok: false, reason: st.lastErr }; }
  }

  /* ---------- 导出(补充8/9) ---------- */
  function buildExport() {
    var store = readStore();
    return { v: VER, exportedAt: iso(), todayPhone: ymd(), wFailSession: st.wFail, wFailPersist: store.wFails || 0,
      reqCount: st.reqs, recCount: store.recs.length, storeState: store._raw || "ok",
      fixedToday: WINS.map(function (w) {
        var hit = store.recs.filter(function (r) { return !r.manual && r.type === "win" && r.d === ymd() && r.win === w[0]; });
        var miss = store.recs.filter(function (r) { return r.type === "miss" && r.d === ymd() && r.win === w[0]; });
        return { win: w[0], state: hit.length ? "ok" : (miss.length ? "missing" : "pending") };
      }), manualToday: manCount(store, ymd()), recs: store.recs };
  }
  function exportText() { try { return JSON.stringify(buildExport(), null, 1); } catch (e) { return "{}"; } }
  function fileDated() { return "jl_open_snap_" + ymd().replace(/-/g, "") + ".json"; }
  function tryDownload() { /* 页面内生成文件, 文件名带日期; 失败→false(调方弹文本框) */
    try {
      var blob = new Blob([exportText()], { type: "application/json" });
      var url = URL.createObjectURL(blob), a = DOC.createElement("a");
      a.href = url; a.download = fileDated();
      (DOC.body || DOC.documentElement).appendChild(a);
      a.click();
      setTimeout(function () { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 1500);
      return true;
    } catch (e) { return false; }
  }
  function copyModal() { /* 备选: 弹文本框供复制(补充8) */
    try {
      var old = DOC.getElementById("jlOsnapModal"); if (old) old.remove();
      var m = DOC.createElement("div");
      m.id = "jlOsnapModal";
      m.style.cssText = "position:fixed;inset:0;z-index:2147483100;background:#000c;display:flex;align-items:center;justify-content:center;padding:12px";
      var box = DOC.createElement("div");
      box.style.cssText = "background:#0d1b23;color:#dfeef6;border:1px solid #2a5a6a;border-radius:10px;max-width:640px;width:100%;max-height:86vh;display:flex;flex-direction:column";
      var hd = DOC.createElement("div");
      hd.style.cssText = "padding:8px 12px;font:600 12px/1.4 -apple-system,sans-serif;color:#9fd7e8;border-bottom:1px solid #2a5a6a;display:flex;justify-content:space-between;align-items:center";
      hd.textContent = "开盘快照JSON(" + fileDated() + ")——长按/全选复制";
      var x = DOC.createElement("button");
      x.type = "button"; x.textContent = "关闭"; x.style.cssText = "padding:3px 10px;border:1px solid #2a5a6a;border-radius:6px;background:#123243;color:#cfeaf4;font-size:11px";
      x.onclick = function () { m.remove(); };
      hd.appendChild(x);
      var ta = DOC.createElement("textarea");
      ta.readOnly = true;
      ta.style.cssText = "flex:1;min-height:40vh;margin:8px;padding:8px;border:1px solid #2a5a6a;border-radius:6px;background:#08131a;color:#cfeaf4;font:11px/1.5 monospace;white-space:pre";
      ta.value = exportText();
      var ft = DOC.createElement("div");
      ft.style.cssText = "padding:0 12px 10px;text-align:right";
      var cp = DOC.createElement("button");
      cp.type = "button"; cp.textContent = "全选";
      cp.style.cssText = "padding:4px 14px;border:1px solid #2a5a6a;border-radius:6px;background:#123243;color:#cfeaf4;font-size:11px";
      cp.onclick = function () { try { ta.focus(); ta.select(); DOC.execCommand("copy"); } catch (e) {} };
      ft.appendChild(cp);
      box.appendChild(hd); box.appendChild(ta); box.appendChild(ft);
      m.appendChild(box);
      (DOC.body || DOC.documentElement).appendChild(m);
    } catch (e) {}
  }
  function doExport() { /* 主路=下载; 失败回退文本框; 全程静默不影响页面 */
    try { if (!tryDownload()) copyModal(); } catch (e) {}
  }

  /* ---------- 迷你面板(14:59热修: 双态——默认收起小药丸, 点开紧凑面板; 自注入, 全内联样式, id唯一前缀) ---------- */
  var uiTimer = 0, uiRoot = null, uiOpen = false;
  function winMarks(d) { /* 三窗状态紧凑标记 ✓✗· */
    var store = readStore(), s = "";
    WINS.forEach(function (w) {
      var ok = store.recs.some(function (r) { return r.type === "win" && !r.manual && r.d === d && r.win === w[0]; });
      var miss = store.recs.some(function (r) { return r.type === "miss" && r.d === d && r.win === w[0]; });
      s += ok ? "✓" : (miss ? "✗" : "·");
    });
    return s;
  }
  function renderUI() { /* 双态重绘: 药丸=单行圆角999点击展开; 展开=紧凑三行+✕收起(按钮短文案一行不换行) */
    try {
      if (!uiRoot || !BROWSER) return;
      try { while (uiRoot.firstChild) uiRoot.removeChild(uiRoot.firstChild); } catch (e0) {}
      uiRoot.onclick = null;
      if (!uiOpen) {
        uiRoot.style.cssText = "position:fixed;left:8px;bottom:60px;z-index:34;background:#0d1b23d9;border:1px solid #2a5a6acc;border-radius:999px;padding:4px 10px;font:600 10.5px/1.3 -apple-system,sans-serif;color:#9fd7e8;cursor:pointer;user-select:none;max-width:62vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        uiRoot.textContent = "快照os1 " + winMarks(ymd()) + " 手" + manCount(readStore(), ymd());
        uiRoot.onclick = function () { uiOpen = true; renderUI(); };
        return;
      }
      uiRoot.style.cssText = "position:fixed;left:8px;bottom:60px;z-index:34;background:#0d1b23ee;border:1px solid #2a5a6a;border-radius:9px;padding:6px 8px;font:11px/1.5 -apple-system,sans-serif;color:#cfeaf4;max-width:238px";
      var hd = DOC.createElement("div");
      hd.style.cssText = "font-weight:600;color:#9fd7e8;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center";
      var tt = DOC.createElement("span"); tt.textContent = "开盘快照 os1"; hd.appendChild(tt);
      var x = DOC.createElement("button"); x.type = "button"; x.textContent = "✕"; x.title = "收起";
      x.style.cssText = "border:0;background:none;color:#7fa9b9;font:600 12px/1 -apple-system,sans-serif;cursor:pointer;padding:0 2px";
      x.onclick = function () { uiOpen = false; renderUI(); };
      hd.appendChild(x);
      var stat = DOC.createElement("div");
      stat.id = "jlOsnapStat";
      stat.style.cssText = "color:#8fb9c9;margin-bottom:5px;white-space:nowrap";
      var store = readStore(), d = ymd(), s = "";
      WINS.forEach(function (w) {
        var ok = store.recs.some(function (r) { return r.type === "win" && !r.manual && r.d === d && r.win === w[0]; });
        var miss = store.recs.some(function (r) { return r.type === "miss" && r.d === d && r.win === w[0]; });
        s += w[0] + (ok ? "✓" : (miss ? "✗" : "·")) + " ";
      });
      stat.textContent = s + "| 手" + manCount(store, d) + " 失" + st.wFail;
      var row = DOC.createElement("div");
      row.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
      function btn(id, txt, fn) {
        var b = DOC.createElement("button");
        b.type = "button"; b.id = id; b.textContent = txt;
        b.style.cssText = "padding:2px 7px;border:1px solid #2a5a6a;border-radius:6px;background:#123243;color:#cfeaf4;font-size:10px;cursor:pointer;white-space:nowrap";
        b.onclick = function () { try { fn(); } catch (e) {} };
        return b;
      }
      row.appendChild(btn("jlOsnapOnBtn", "采样:" + (on() ? "开" : "关"), function () { toast("采样开关→" + (toggle() ? "开" : "关") + "(只闸定时采样, 手动不受限)"); renderUI(); }));
      row.appendChild(btn("", "记一次", function () {
        var r = manual();
        toast(r.ok ? "已记手动快照 manual:true(不占固定时点)" : "未记:" + r.reason);
      }));
      row.appendChild(btn("", "导出", function () { doExport(); }));
      row.appendChild(btn("", "复制", function () { copyModal(); }));
      uiRoot.appendChild(hd); uiRoot.appendChild(stat); uiRoot.appendChild(row);
    } catch (e) {}
  }
  function paintUI() { renderUI(); }
  function toast(msg) {
    try {
      if (!BROWSER) return;
      var t = DOC.getElementById("jlOsnapToast");
      if (t) t.remove();
      t = DOC.createElement("div");
      t.id = "jlOsnapToast";
      t.style.cssText = "position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:2147483100;background:#0d3040f2;color:#eafcff;font:600 12px/1.4 -apple-system,sans-serif;padding:8px 14px;border-radius:8px;pointer-events:none";
      t.textContent = msg;
      (DOC.body || DOC.documentElement).appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 2600);
    } catch (e) {}
  }
  function initUI() {
    try {
      if (!BROWSER) return;
      if (DOC.getElementById("jlOsnapRoot")) return;
      var root = DOC.createElement("div");
      root.id = "jlOsnapRoot";
      uiRoot = root; uiOpen = false; /* 14:59热修: 默认收起药丸 */
      st.uiRoot = root; /* 桩测试钩子(只读) */
      st.uiOpen = function () { return uiOpen; };
      st.uiToggle = function (v) { uiOpen = (arguments.length ? !!v : !uiOpen); renderUI(); };
      (DOC.body || DOC.documentElement).appendChild(root);
      renderUI();
      if (uiTimer) clearInterval(uiTimer);
      uiTimer = setInterval(paintUI, 30e3); /* 状态低频刷新, 只读 */
      if (uiTimer && uiTimer.unref) uiTimer.unref(); /* Node桩: 防进程挂起 */
    } catch (e) {}
  }

  /* ---------- 启动(浏览器: 挂面板+20s定时; Node桩: 仅暴露API不启定时) ---------- */
  function boot() {
    try {
      if (BROWSER) {
        if (DOC.readyState === "loading") DOC.addEventListener("DOMContentLoaded", function () { initUI(); }, { once: true });
        else initUI();
        var ti = setInterval(function () { tick(); }, TICK_MS);
        if (ti && ti.unref) ti.unref(); /* Node桩(伪location测UI): 防进程挂起 */
      }
    } catch (e) {}
  }

  global.__JLOSNAP__ = {
    VER: VER, KEY: KEY, KEY_ON: KEY_ON, WINS: WINS, st: st,
    pure: { winOf: winOf, validQuote: validQuote, hms2min: hms2min, armZone: armZone, fireable: fireable, quoteSym: quoteSym, normCode: normCode, trimStore: trimStore, recorded: recorded, manCount: manCount },
    tick: tick, manual: manual, toggle: toggle, on: on,
    readStore: readStore, buildWinRec: buildWinRec, buildManualRec: buildManualRec,
    buildExport: buildExport, exportText: exportText, doExport: doExport, copyModal: copyModal,
    _fetchQuotes: fetchQuotes, _clockSet: function (ms) { _clock = ms; }, _paintUI: paintUI, _boot: boot
  };
  boot();
})(typeof window !== "undefined" ? window : globalThis);
