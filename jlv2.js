/* jlv2.js — jl-1053 v0.84.0 首页尾部三张折叠卡（独立模块，零侵入）
   ① 大资金 · 国家队：4只宽基ETF主力净额 + 市场结构判断（权重托底≠全面进攻）
   ② 市场温度 · v2：温度 + 冰点/冷点状态机（规则组判定，非阈值）+ 九因子 + 场景提示
   ③ 大盘异动 · 分组：事件流六组聚合（涨跌停结构/板块异动/个股扩散/风险事件/指数异动/成交额异动）
   jl-1077 v0.84.25 二期并批：板块异动(同板块N只·T分钟同类聚簇)+个股扩散(≥M只升级+顶部醒目横幅) 复用事件流判定零新源；
   指数异动+成交额异动 腾讯分钟源自算(东财整族被拒不碰)；休市/断档=冻结不报错，通道死走降级卡
   jl-1078 v0.84.26: 聚合剔除ST(5%涨跌停口径≠主板, CFG.yd.exst可关)，六组/代表个股/横幅/最新全口径生效
   jl-1079 v0.84.27: ST剔除推广全站——主模块异动Tab(事件流全tab/涨停池/密度图/气泡)+本模块涨跌停池(温度v2九因子/连板/炸板/溢价)同口径
   jl-1080 v0.84.28: 内置离线板块映射(jl_sector_map.js 东财EM2016二级5929只·纯静态零在线)——①板块异动聚簇键=映射优先(治"恒0组"根因: hy富化常败)
   ②热点板块持续=主模块温度逐股涨跌×映射聚合→行业涨幅榜首(无数据显"板块映射未覆盖") ③跌停明细可点展开+DT池sort根修(fbt:asc恒空行→fund:desc)+事件流口径交叉校验
   jl-1084 v0.84.30: 跨零点崩溃根修(编号让位: 另会话 jl-1081~1083 三合一已占)——dt2=sn.t-yv.t在if(!sn)保护之前对null取.t(零点后快照按日期闸不恢复+温度史留昨日条目→必炸)→paint死→boot首句崩→
   9个抓取全不调度→三卡永久消失(休市无mktLive轮询自愈, 交易日9:15后被60s轮询掩盖两周边界雷); 两行修: ①dt2补sn判空走既有"采样中"降级 ②boot()paint加防爆盾(渲染异常不再杀抓取链)
   jl-1086 v0.84.32: 离线板块地基(任务A)+事件日志器(任务B)同批——A1新文件jl_concept_map.js(东财F10 ssbk全量: l1/l2/概念[]/主概念mc, 统计唯一归属杜绝一票多板块重复计数)
   A2 板块异动聚簇键=主概念mc优先(conOf)·jl-1080二级映射次之·hy兜底; A4跌停明细板块列同键位; B新文件jl_event_log.js(IndexedDB权威状态源+写成功才推进+纯观察者tap)——
   本模块仅3处接入: secOf旁加conOf只读/485聚簇键位/495与517行同式per的两处被动tap(失败静默); 判定逻辑/参数/样式零改
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
    yd: { bkN: 3, bkWin: 30, spM: 5, spWin: 30, exst: 1 },   // jl-1077 二期①: 板块异动=同板块≥bkN只·bkWin分钟同类 | 个股扩散=spWin分钟同类≥spM只不同股; jl-1078 exst=剔ST/*ST(5%涨跌停口径≠主板, 0=关)
    tx: {                                                    // jl-1077 二期②: 指数/成交额异动（腾讯分钟源自算）
      hosts: ["https://proxy.finance.qq.com/ifzqgtimg", "https://web.ifzq.gtimg.cn", "https://ifzq.gtimg.cn"],
      idx: [["sh000001", "沪指"], ["sz399001", "深成指"], ["sz399006", "创业板指"]],
      amt: [["sh000001", "沪市"], ["sz399106", "深市"]],      // 全市场分钟成交额=沪000001+深综399106（399001为成分指口径偏小）
      idx1m: 0.5, idx5m: 1.0, idxCool: 10,                   // 指数: 1分钟±% / 5分钟同向累计±% 触发, 同向冷却合并
      amtWin: 5, amtUp: 2.0, amtDn: 0.5, amtBasis: 5          // 成交额: 5分钟窗 vs 历史同期均值, ≥2倍放量 ≤0.5倍缩量, 基准天数
    },
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
    ".jlv2{position:relative;overflow:hidden;background:rgba(255,255,255,0.055);border:1px solid rgba(255,215,130,0.22);border-radius:20px;padding:15px;margin-top:14px;color:#eef9fc;backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5)}"+".jlv2::after{content:\"\";position:absolute;inset:0;background:linear-gradient(105deg,transparent 40%,rgba(255,220,150,.30) 50%,transparent 60%);transform:translateX(-100%);pointer-events:none;border-radius:inherit}"+".jlv2:active::after{animation:jlShine2 .6s ease}"+".jlv2>*{position:relative;z-index:1}"+"@keyframes jlShine2{to{transform:translateX(100%)}}" +
    "body.day .jlv2{background:rgba(0,0,0,0.03);border-color:#0a7d6b3d;color:#12262b}" +
    ".jlv2 h3{font-size:12px;font-weight:500;margin:0;display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer}" +
    ".jlv2 h3 small{font-size:9px;color:rgba(255,255,255,.72);font-weight:400;text-align:right}" +
    ".jlv2 .jsum{font-size:10.5px;color:#eef9fc;margin-top:8px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}" +
    ".jlv2 .jsum .dot{width:7px;height:7px;border-radius:50%;flex:none;box-shadow:0 0 7px currentColor}" +
    ".jlv2 .jbody{display:none;margin-top:11px;border-top:1px solid #81e6d91c;padding-top:11px}" +
    ".jlv2.open .jbody{display:block}" +
    ".jlv2 .jchev{flex:none;width:17px;height:17px;border-radius:50%;border:1px solid #81e6d94d;color:#81e6d9;font-size:9px;display:flex;align-items:center;justify-content:center;transition:transform .18s}" +
    ".jlv2.open .jchev{transform:rotate(90deg)}" +
    ".jlv2 .jh{font-size:9px;color:#81e6d9;letter-spacing:.24em;margin:12px 0 7px;display:flex;align-items:center;gap:8px}" +
    ".jlv2 .jh::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#81e6d93d,transparent)}" +
    ".jlv2 .row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 0;flex-wrap:wrap;border-bottom:1px solid #81e6d914;font-size:10px}" +
    ".jlv2 .row:last-child{border-bottom:none}" +
    ".jlv2 .row small{color:rgba(255,255,255,.72);font-size:8.5px}" +
    ".jlv2 .mono{font-family:ui-monospace,'SF Mono',monospace}" +
    ".up{color:#ff5459}.dn{color:#1fdc93}.mu{color:rgba(255,255,255,.88)}.hl{color:#ffd21f}" +
    /* 温度计v2 */
    ".jlv2 .tnow{display:flex;align-items:baseline;gap:9px}" +
    ".jlv2 .tnow b{font-size:26px;font-family:ui-monospace,monospace}" +
    ".jlv2 .zpill{font-size:11px;color:#81e6d9;border:1px solid #81e6d9;border-radius:9px;padding:2px 9px;font-weight:600}" +
    ".jlv2 .zpill.ice{color:#5ad0ff;border-color:#5ad0ff}.jlv2 .zpill.hot{color:#ff5459;border-color:#ff5459}" +
    ".jlv2 .fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}" +
    ".jlv2 .ft{border:1px solid #ffffff10;border-radius:10px;padding:7px 8px;background:rgba(255,255,255,0.045)}" +
    ".jlv2 .ft span{font-size:8.5px;color:rgba(255,255,255,.72);display:block}" +
    ".jlv2 .ft b{font-size:13px;font-family:ui-monospace,monospace;display:block;margin-top:2px}" +
    ".jlv2 .ft small{font-size:7.5px;color:rgba(255,255,255,.86);display:block;margin-top:2px;line-height:1.4}" +
    ".jlv2 .rule{display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #81e6d914;font-size:9.5px;line-height:1.6}" +
    ".jlv2 .rule:last-of-type{border-bottom:none}" +
    ".jlv2 .rst{flex:none;width:15px;height:15px;border-radius:50%;font-size:9px;display:flex;align-items:center;justify-content:center;margin-top:1px}" +
    ".jlv2 .rst.ok{color:#0a1a14;background:#1fdc93;font-weight:700}" +
    ".jlv2 .rst.no{color:#3a1c1e;background:rgba(255,255,255,0.08);border:1px solid #ffffff26}" +
    ".jlv2 .scn{border:1px solid #ffffff12;border-radius:11px;padding:8px 10px;margin-top:7px;font-size:9.5px;color:rgba(255,255,255,.72);background:rgba(255,255,255,0.045)}" +
    ".jlv2 .scn b{color:rgba(255,255,255,.88);display:block;font-size:10px;margin-bottom:2px;font-weight:600}" +
    ".jlv2 .scn.on{border-color:#81e6d98c;color:#eef9fc;background:#81e6d90d}" +
    ".jlv2 .scn.on b{color:#81e6d9}" +
    /* 国家队 */
    ".jlv2 .erow{display:grid;grid-template-columns:112px 1fr 58px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #81e6d914;font-size:10px}" +
    ".jlv2 .erow:last-of-type{border-bottom:none}" +
    ".jlv2 .erow .nm b{display:block;font-size:10.5px;font-weight:600}" +
    ".jlv2 .erow .nm small{color:rgba(255,255,255,.86);font-size:8px;letter-spacing:.05em}" +
    ".jlv2 .ebar{position:relative;height:15px;border-radius:4px;background:rgba(255,255,255,0.045);overflow:hidden}" +
    ".jlv2 .ebar::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:#ffffff26}" +
    ".jlv2 .ebar i{position:absolute;top:2px;bottom:2px;border-radius:2px}" +
    ".jlv2 .ebar em{position:absolute;top:0;bottom:0;font-style:normal;font-size:9px;line-height:15px;font-family:ui-monospace,monospace;white-space:nowrap}" +
    ".jlv2 .bigState{font-size:17px;font-weight:600;color:#ffd21f;letter-spacing:.03em}" +
    ".jlv2 .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}" +
    ".jlv2 .chip{font-size:8.5px;border:1px solid #ffffff1f;border-radius:8px;padding:4px 8px;color:rgba(255,255,255,.72)}" +
    ".jlv2 .chip.on{border-color:#81e6d9;color:#81e6d9;background:#81e6d914;font-weight:600}" +
    /* 大盘异动 */
    ".jlv2 .grp{margin-top:4px}" +
    ".jlv2 .grpH{display:flex;justify-content:space-between;font-size:9.5px;color:#81e6d9;padding:6px 0;border-bottom:1px dashed #81e6d92e}" +
    ".jlv2 .grpH small{color:rgba(255,255,255,.86)}" +
    ".jlv2 .ev{display:grid;grid-template-columns:34px 1fr auto;gap:8px;padding:7px 0;border-bottom:1px solid #81e6d90f;font-size:9.5px;align-items:start}" +
    ".jlv2 .ev:last-child{border-bottom:none}" +
    ".jlv2 .ev .tm{font-family:ui-monospace,monospace;color:rgba(255,255,255,.72);font-size:9px;padding-top:1px}" +
    ".jlv2 .ev .tt b{display:block;font-size:10px;font-weight:600}" +
    ".jlv2 .ev .tt small{color:rgba(255,255,255,.72);font-size:8.5px;display:block;margin-top:2px;line-height:1.5}" +
    ".jlv2 .tags{display:flex;flex-direction:column;gap:3px;align-items:flex-end}" +
    ".jlv2 .tg{font-size:8px;border-radius:5px;padding:2px 6px;border:1px solid #ffffff26;color:rgba(255,255,255,.88);white-space:nowrap}" +
    ".jlv2 .tg.up{border-color:#ff54598c;color:#ffa4a8}" +
    ".jlv2 .tg.dn{border-color:#1fdc938c;color:#1fdc93}" +
    ".jlv2 .tg.warn{border-color:#ffd21f8c;color:#ffd21f}" +
    ".jlv2 .tg.live{border-color:#81e6d9;color:#81e6d9;background:#81e6d914}" +
    ".jlv2 .tg.dead{border-color:#ffffff1f;color:rgba(255,255,255,.86)}" +
    ".jlv2 .hold{color:#ffd21f}.jlv2 .watch{color:rgba(255,255,255,.72)}" +
    ".jlv2 .foot{font-size:8px;color:rgba(255,255,255,.86);margin-top:10px;line-height:1.6}" +
    ".jlv2 .g2{font-size:9px;color:rgba(255,255,255,.86);padding:6px 0}";
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
    grp: null,    // {groups:[],count,latest,banner}
    tx: null,     // jl-1077 腾讯分钟源: {ok,date,today,pts:{code:[[mn,价]]},slots:{"HHMM":全市场分钟额}} 断档保留旧值=冻结
    txOk: 0,      // jl-1077 通道存活(返回过有效数据)与数据有无分离
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
    var et = lsGet("jlv2_etf_v1", null); if (et && et.date === d) { S.etf = et.rows && et.rows.length ? et.rows : null; S.etfAt = et.at || ""; } /* jl-1075: 修缓存形状bug——原S.etf=整个对象而renderGjd期望数组, 重载后今日缓存永不生效恒"未到" */
    var ho = lsGet("jlv2_hot_v1", null); if (ho) S.hot = ho;
  })();
  function dgText(k, fb) { try { if (window.__jlDg) return window.__jlDg.text(k, fb); } catch (e) {} return fb; } /* jl-1075: 降级卡文本桥(index.html jl-1074模块), 未就绪时回退原文案 */

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
    var srt = kind === "DT" ? "fund:desc" : "fbt:asc"; /* jl-1080: DT池fbt:asc恒返空行(实测tc=21而pool=[]), fund:desc才出明细——跌停计数自上线恒0的根修 */
    jsonp(P2X, "/getTopic" + kind + "Pool?ut=" + UT + "&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=" + srt + "&date=" + date, function (e, d) {
      if (e || !d || !d.data || !d.data.pool) { cb(e || new Error(kind)); return; }
      var pool = d.data.pool;
      if (CFG.yd.exst) pool = pool.filter(function (r) { return !/ST/.test(String(r.n || "")); }); /* jl-1079: 涨跌停池家族剔ST——温度v2九因子/连板高度/炸板率/溢价/涨跌停结构组判定全口径对齐主模块 */
      cb(null, pool);
    });
  }
  function fetchPools(cb) {
    var out = { zt: null, zb: null, dt: null, date: today() }, left = 3, bad = 0;
    function fin() { if (--left > 0) return; if (bad >= 3) { cb(new Error("pools")); return; } S.pool = out; lsSet("jlv2_pool_v1", out); cb(null, out); }
    fetchPoolOne("ZT", ymd(), function (e, p) { if (e) { bad++; } else { var lb = 0, zb = 0; p.forEach(function (r) { lb = Math.max(lb, +r.lbc || 0); zb += +r.zbc || 0; }); out.zt = { n: p.length, lb: lb, zbc: zb }; } fin(); });
    fetchPoolOne("ZB", ymd(), function (e, p) { if (e) { bad++; } else { out.zb = { n: p.length }; } fin(); });
    fetchPoolOne("DT", ymd(), function (e, p) { if (e) { bad++; } else { out.dt = { n: p.length, rows: p.map(function (r) { return { c: String(r.c), n: String(r.n), zdp: +r.zdp || 0, days: +r.days || 1, fund: +r.fund || 0 }; }) }; } fin(); }); /* jl-1080: 跌停明细落存(zdp跌幅/days连跌天数/fund封单), 温度卡点数字弹出 */
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
        fetchOneEtf(i, function (e, r) { if (e) { bad++; } else { out[i] = r; } if (--left <= 0) { if (bad >= CFG.etfs.length) { try { window.__jlDg && window.__jlDg.fail("jlv2:etf", function () { return new Promise(function (res) { fetchEtfs(function (e2) { paint(); res(!e2); }); }); }, "东财ETF净额通道受阻(网络/IP或风控)", function () { return !!(S.etf && S.etf.some(Boolean)); }); } catch (eD) {} cb(new Error("etf-all")); return; } S.etf = out; S.etfAt = hhmm(String(nowMin()).padStart(4, "0")); try { window.__jlDg && window.__jlDg.ok("jlv2:etf"); } catch (eO) {} lsSet("jlv2_etf_v1", { date: today(), rows: out, at: S.etfAt }); cb(null, out); } });
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
  var YD_DIR = { 8201: 1, 8202: 1, 8203: 1, 8204: 1, 8206: 1, 8222: 1, 8205: -1, 8207: -1, 8218: -1, 8219: -1, 8220: -1, 8221: -1 }; /* jl-1077: 事件类型→影响方向(1偏多/-1偏空), 板块异动/个股扩散共用; 打开跌停=翘板偏多 */
  /* jl-1080: 离线板块映射(jl_sector_map.js 静态引入, 东财EM2016二级行业5929只)——
     板块异动聚簇/热点板块持续/跌停明细所在板块三处共用; 纯静态零在线请求; 通达信导出整文件替换+?v=升位即换源 */
  var SEC_MAP = (window.__JL_SECTORS__ && window.__JL_SECTORS__.map) || {};
  function secOf(code) { return SEC_MAP[code] || ""; }
  /* jl-1086: 离线概念映射(jl_concept_map.js 静态引入, 东财F10 ssbk: l1/l2/概念[]/主概念mc)——
     板块异动聚簇主键(A2)/事件日志主概念分布(B3)/跌停明细板块列(A4)共用; 纯静态零在线; 重跑gen_concept_map.py整文件替换+?v=升位即换源 */
  var CON_MAP = (window.__JL_CONCEPTS__ && window.__JL_CONCEPTS__.map) || {};
  function conOf(code) { var v = CON_MAP[code]; return (v && v.mc) || ""; } /* 主概念: 每票恰一个, 统计唯一归属 */
  S.ownYd = S.ownYd || []; /* 本模块补抓的异动事件（8205/8218/8202）*/
  function fetchOwnYd(cb) {
    var tys = ["8205", "8218", "8202"], left = tys.length, okN = 0; /* jl-1076: 通道存活(返回过有效数据)与事件有无分离——区分"真无事件"和"取不到" */
    tys.forEach(function (ty) {
      jsonp(P2X, "/getAllStockChanges?type=" + ty + "&pageindex=0&pagesize=200&ut=" + UT + "&dpt=wzchanges", function (e, d) {
        if (!e && d && d.data && d.data.allstock) {
          okN++;
          d.data.allstock.forEach(function (x) { S.ownYd.push({ c: String(x.c), m: +x.m, n: String(x.n), t: +x.t, tm: +x.tm }); });
        }
        if (--left <= 0) { S.ydFetchOk = okN > 0; cb(null, S.ownYd); }
      });
    });
  }
  /* ---------- jl-1077 腾讯分钟源（指数异动/成交额异动自算; 东财整族被拒不碰） ----------
     通道: /appstock/app/minute/query?code=XX → {"data":{code:{"data":{"data":["HHMM 价 累计手 累计额"],"date":"20260930"}}}}
     休市冻结: 响应自带date, ≠今日=假期/未开盘→不产新事件只显冻结行; 断档保留S.tx旧值=冻结; 全败走降级卡 */
  var txHostI = 0; /* 记忆当前可用host, 失败逐个轮换 */
  function txMin(v) { v = +v; return Math.floor(v / 100) * 60 + v % 100; }
  function txGet(path, cb) {
    var tried = 0;
    (function go() {
      var h = CFG.tx.hosts[txHostI % CFG.tx.hosts.length];
      var ac = null, tm = 0;
      try { ac = new AbortController(); } catch (eC) {}
      if (ac) tm = setTimeout(function () { try { ac.abort(); } catch (eA) {} }, 9e3);
      fetch(h + path, { cache: "no-store", signal: ac ? ac.signal : undefined }).then(function (r) {
        if (tm) clearTimeout(tm);
        return r && r.ok ? r.json() : Promise.reject(new Error("http" + (r && r.status)));
      }).then(function (j) { cb(null, j); }).catch(function (e) {
        if (tm) clearTimeout(tm);
        txHostI++; tried++;
        if (tried < CFG.tx.hosts.length) go(); else cb(e || new Error("tx"));
      });
    })();
  }
  function fetchTxMin(cb) {
    var seen = {}, codes = [];
    CFG.tx.idx.concat(CFG.tx.amt).forEach(function (x) { if (!seen[x[0]]) { seen[x[0]] = 1; codes.push(x[0]); } });
    var left = codes.length, okN = 0, acc = {};
    codes.forEach(function (code) {
      txGet("/appstock/app/minute/query?code=" + code, function (e, j) {
        try {
          var node = !e && j && j.data && j.data[code] && j.data[code].data;
          if (node && node.data && node.data.length) { okN++; acc[code] = { date: String(node.date || ""), rows: node.data }; }
        } catch (eP) {}
        if (--left <= 0) {
          S.txOk = okN > 0 ? 1 : 0;
          if (okN) { parseTx(acc); try { window.__jlDg && window.__jlDg.ok("jlv2:tx"); } catch (eD) {} }
          else { try { window.__jlDg && window.__jlDg.fail("jlv2:tx", function () { return new Promise(function (res) { fetchTxMin(function () { paint(); res(true); }); }); }, "腾讯分钟源受阻(指数/成交额自算未返回 · 网络/IP)", function () { return !!S.txOk; }); } catch (eD) {} }
          if (cb) cb(null);
        }
      });
    });
  }
  function parseTx(acc) {
    var dtx = "", pts = {}, cumKeys = {};
    Object.keys(acc).forEach(function (code) {
      var a = acc[code], arr = [], byKey = {};
      if (!dtx || a.date > dtx) dtx = a.date;
      (a.rows || []).forEach(function (r) {
        var p = String(r).split(" ");
        if (p.length < 4) return;
        var mn = txMin(p[0]);
        if (mn >= 570 && mn <= 901) { arr.push([mn, +p[1]]); byKey[p[0]] = +p[3]; } /* 竞价异常行(如925)剔除 */
      });
      if (arr.length) { pts[code] = arr; cumKeys[code] = byKey; }
    });
    /* 全市场每分钟成交额 = 沪000001+深综399106 累计额差分（399001为成分指口径偏小不用） */
    var slots = {}, allK = {}, prev = 0;
    CFG.tx.amt.forEach(function (x) { Object.keys(cumKeys[x[0]] || {}).forEach(function (k) { allK[k] = 1; }); });
    Object.keys(allK).sort().forEach(function (k) {
      var tot = 0, full = true;
      CFG.tx.amt.forEach(function (x) { var v = (cumKeys[x[0]] || {})[k]; if (v == null) { full = false; return; } tot += v; });
      if (!full) return; /* 午休边界某源缺该分钟→跳过, 不串位 */
      slots[k] = Math.max(0, tot - prev); prev = tot;
    });
    S.tx = { ok: true, date: dtx, today: !!dtx && (dtx.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") === today()), pts: pts, slots: slots };
    /* 量能基准入库: 完整日曲线幂等入库, 保留 amtBasis+1 天（休市补看上一交易日也能入, 部分曲线>100分钟才收防污染） */
    if (dtx && Object.keys(slots).length > 100) {
      var st = lsGet("jlv2_amt_v1", {}) || {}; st.days = st.days || {};
      var day = {}; Object.keys(slots).forEach(function (k) { day[k] = Math.round(slots[k]); });
      st.days[dtx] = day;
      var dk = Object.keys(st.days).sort();
      for (var q = 0; q < dk.length - (CFG.tx.amtBasis + 1); q++) delete st.days[dk[q]];
      lsSet("jlv2_amt_v1", st);
    }
  }
  /* 指数事件: 1分钟|环比|≥idx1m 或 5分钟净幅≥idx5m → 快拉/快跳水; 同向idxCool分钟内合并(时间滚最新, 幅度取更强) */
  function calcIdxEv(pts, cf) {
    var raw = [], i;
    for (i = 1; i < pts.length; i++) {
      var m1 = (pts[i][1] - pts[i - 1][1]) / pts[i - 1][1] * 100;
      if (Math.abs(m1) >= cf.idx1m) { raw.push({ start: pts[i][0], mn: pts[i][0], dir: m1 > 0 ? 1 : -1, m1: m1, m5: null }); continue; }
      if (i >= 5) {
        var m5 = (pts[i][1] - pts[i - 5][1]) / pts[i - 5][1] * 100;
        if (Math.abs(m5) >= cf.idx5m) raw.push({ start: pts[i][0], mn: pts[i][0], dir: m5 > 0 ? 1 : -1, m1: m1, m5: m5 });
      }
    }
    var out = [];
    raw.forEach(function (e) {
      var last = out[out.length - 1];
      if (last && last.dir === e.dir && e.mn - last.mn <= cf.idxCool) {
        last.mn = e.mn;
        if (e.m5 != null && (last.m5 == null || Math.abs(e.m5) > Math.abs(last.m5))) { last.m5 = e.m5; last.m1 = e.m1; }
        else if (e.m5 == null && last.m5 == null && Math.abs(e.m1) > Math.abs(last.m1)) last.m1 = e.m1;
      } else out.push(e);
    });
    return out;
  }
  /* 量能事件: amtWin分钟窗合计 vs 历史同期窗均值 → ≥amtUp放量 ≤amtDn缩量; 每类只保最新一条(天然防每分钟刷屏) */
  function calcAmtEv(slots, basis, cf) {
    var ks = Object.keys(slots).sort(), up = null, dn = null, i, j;
    for (i = cf.amtWin - 1; i < ks.length; i++) {
      var sum = 0, bsum = 0, bn = 0;
      for (j = i - cf.amtWin + 1; j <= i; j++) { sum += slots[ks[j]] || 0; var b = basis[ks[j]]; if (b != null && b > 0) { bsum += b; bn++; } }
      if (bn < cf.amtWin || bsum <= 0) continue; /* 基准窗不满(首日/尾段)不判定 */
      var r = sum / bsum;
      if (r >= cf.amtUp) up = { mn: txMin(ks[i]), r: r, amt: sum, avg: bsum };
      else if (r <= cf.amtDn) dn = { mn: txMin(ks[i]), r: r, amt: sum, avg: bsum };
    }
    return { up: up, dn: dn };
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
    if (cc && cc.date === today() && cc.ev && cc.ev.length) evs = cc.ev.slice(0, 1200); /* jl-1080: 800→1200对齐主模块写入上限——主模块按类型分块append, 800截掉尾部类型(8205/8218/8219/8220/8221/8222恒丢失)=板块异动恒0第二根因 */
    (S.ownYd || []).forEach(function (x) {
      if (!evs.some(function (e) { return e.c === x.c && e.t === x.t && e.tm === x.tm; })) evs.push(x);
    });
    if (CFG.yd.exst) evs = evs.filter(function (e) { return e && !/ST/.test(String(e.n || "")); }); /* jl-1078: 剔除ST/*ST(S*ST同名命中)——5%涨跌停口径≠主板, 六组聚合/代表个股/扩散横幅/最新全不掺入; 原始缓存不动, 只滤聚合入口 */
    /* jl-1076: tm实为HHMMSS(如144506=14:45:06), 原闸按HHMM(930~1500)比对=全量误筛——"大盘异动恒0组"自上线即如此的根源。统一换算真实分钟再过滤/分桶(原HHMM直接除以15跨整点还会出9:90伪时刻) */
    var toMin = function (v) { v = +v; return v > 2359 ? Math.floor(v / 10000) * 60 + Math.floor(v % 10000 / 100) : Math.floor(v / 100) * 60 + v % 100; };
    var fromMin = function (m) { return Math.floor(m / 60) * 100 + m % 60; };
    evs.forEach(function (e) { if (e) e.mn = toMin(e.tm); });
    evs = evs.filter(function (e) { return e && e.mn >= 570 && e.mn <= 900; });
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
    var banner = ""; /* jl-1077: 个股扩散升级事件的顶部醒目横幅(C组赋值) */
    // A 涨跌停结构
    (function () {
      var zt4 = evs.filter(function (e) { return e.t === 8204 || e.t === 8205 || e.t === 8221 || e.t === 8222; });
      if (!zt4.length) return;
      var _dts = {}; zt4.forEach(function (e) { if (e.t === 8221) _dts[e.c] = 1; });
      S.evDtN = Object.keys(_dts).length; /* jl-1080: 事件流封跌停去重股数——与跌停池家数交叉校验用(口径差异标注) */
      var bk = {};
      zt4.forEach(function (e) { var k = Math.floor(e.mn / 15) * 15; (bk[k] = bk[k] || []).push(e); });
      var keys = Object.keys(bk).sort(function (a, b) { return b - a; }).slice(0, 2);
      var rows = "";
      keys.forEach(function (k) {
        var arr = bk[k], up = arr.filter(function (e) { return e.t === 8204 || e.t === 8202; }).length;
        var zb = arr.filter(function (e) { return e.t === 8205; }).length;
        var dn = arr.filter(function (e) { return e.t === 8221 || e.t === 8222; }).length;
        var ttl = zb >= Math.max(3, up) ? "炸板潮" : dn > up ? "跌停潮" : up >= 3 ? "封板潮" : "涨跌停波动";
        var dir = ttl === "炸板潮" || ttl === "跌停潮" ? -1 : ttl === "封板潮" ? 1 : 0;
        var per = arr.some(function (e) { return nReal - e.mn <= 10; }) ? "live" : "dead";
        var hold = arr.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : (H.mw[e.c] ? "○" + esc(H.mw[e.c]) : ""); }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(fromMin(+k)) + '</span><span class="tt"><b>' + ttl + ' · ' + arr.length + '只</b><small>封' + up + ' / 炸' + zb + ' / 跌向' + dn + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(dir, per) + '</span></div>';
      });
      groups.push({ t: "涨跌停结构", n: zt4.length, html: rows });
    })();
    // B 板块异动（jl-1077 二期: 同板块≥N只·T分钟内触发同类事件→聚合成板块级事件, 复用事件流判定零新源）
    (function () {
      var p = CFG.yd, base = evs.reduce(function (m, e) { return Math.max(m, e.mn); }, 0); /* 基准=最新事件分钟: 休市缓存日不随墙钟误判衰竭 */
      if (!base) return;
      var cls = {};
      evs.forEach(function (e) {
        if (e.mn == null || base - e.mn < 0 || base - e.mn > p.bkWin) return;
        var sy = conOf(e.c) || secOf(e.c) || e.hy; /* jl-1086: 主概念mc优先(任务A2——每票恰一个, 统计唯一归属杜绝一票多板块重复计数) · jl-1080二级映射次之(治"恒0组"根因: hy富化常败) · 事件流hy兜底(东财口径) */
        if (!sy || sy === "其他") return; /* 未映射不参簇——防伪板块事件 */
        var k = sy + "|" + e.t, c = cls[k] || (cls[k] = { hy: sy, t: +e.t, mp: {}, list: [] });
        if (!c.mp[e.c]) { c.mp[e.c] = 1; c.list.push(e); } /* 同股同类只计一只 */
      });
      var top = Object.keys(cls).map(function (k) { return cls[k]; }).filter(function (c) { return c.list.length >= p.bkN; });
      top.forEach(function (c) { c.list.sort(function (a, b) { return b.mn - a.mn; }); c.at = c.list[0].mn; });
      top.sort(function (a, b) { return b.at - a.at || b.list.length - a.list.length; });
      var rows = "", live = 0;
      top.slice(0, 3).forEach(function (c) {
        var dir = YD_DIR[c.t] || 0, per = base - c.at <= 10 ? "live" : (base - c.at <= CFG.persistMin ? "warn" : "dead");
        if (per !== "dead") live++;
        var hold = c.list.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : (H.mw[e.c] ? "○" + esc(H.mw[e.c]) : ""); }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(fromMin(c.at)) + '</span><span class="tt"><b>' + esc(c.hy) + ' · ' + (YD_NAME[c.t] || c.t) + ' ' + c.list.length + '只</b><small>代表 ' + c.list.slice(0, 3).map(function (e) { return esc(e.n); }).join(" · ") + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(dir, per) + '</span></div>';
      });
      if (rows) groups.push({ t: "板块异动", n: live, html: rows }); /* 右侧计数=进行中(未衰竭)板块事件数 */
      try { if (window.__JLEVLOG__) window.__JLEVLOG__({ k: "bk", day: today(), base: base, evs: evs, top: top.map(function (c) { return { hy: c.hy, t: c.t, nm: YD_NAME[c.t] || String(c.t), n: c.list.length, at: c.at, per: base - c.at <= 10 ? "live" : (base - c.at <= CFG.persistMin ? "warn" : "dead"), codes: c.list.map(function (e) { return e.c; }) }; }) }); } catch (eL) {} /* jl-1086: 任务B事件日志器被动tap(纯观察者: per=上方渲染行同式同CFG, 结构化输出喂jl_event_log.js; 失败静默不影响展示) */
    })();
    // C 个股扩散（jl-1077 二期: 同类事件T分钟内扩散至≥M只不同股票→升级扩散事件, 卡片顶部醒目横幅; 15分钟环比降为辅助行）
    (function () {
      var p = CFG.yd, base = evs.reduce(function (m, e) { return Math.max(m, e.mn); }, 0);
      if (!base) return;
      var w = {};
      evs.forEach(function (e) {
        if (base - e.mn < 0 || base - e.mn > p.spWin) return;
        var c = w[e.t] || (w[e.t] = { t: +e.t, mp: {}, list: [] });
        if (!c.mp[e.c]) { c.mp[e.c] = 1; c.list.push(e); } /* 不同股票去重计数 */
      });
      var sp = Object.keys(w).map(function (k) { return w[k]; }).filter(function (c) { return c.list.length >= p.spM; });
      sp.forEach(function (c) { c.list.sort(function (a, b) { return b.mn - a.mn; }); c.at = c.list[0].mn; });
      sp.sort(function (a, b) { return b.list.length - a.list.length; });
      var rows = "", live = 0;
      sp.slice(0, 3).forEach(function (c, i) {
        var dir = YD_DIR[c.t] || 0, per = base - c.at <= 10 ? "live" : (base - c.at <= CFG.persistMin ? "warn" : "dead");
        if (per !== "dead") live++;
        var hold = c.list.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : (H.mw[e.c] ? "○" + esc(H.mw[e.c]) : ""); }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(fromMin(c.at)) + '</span><span class="tt"><b>' + (YD_NAME[c.t] || c.t) + '扩散 · ' + c.list.length + '只</b><small>近' + p.spWin + '分钟 · 代表 ' + c.list.slice(0, 3).map(function (e) { return esc(e.n); }).join(" · ") + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(dir, per) + '</span></div>';
        if (i === 0 && per !== "dead") { /* 顶部醒目横幅: 偏空红系/偏多金系, 跟进中/待确认 */
          banner = '<div class="grp" style="margin:3px 0;border:1px solid ' + (dir < 0 ? "#ff5459" : "#ffd21f") + '55;background:' + (dir < 0 ? "rgba(255,84,89,.10)" : "rgba(255,210,31,.08)") + ';border-radius:10px;padding:7px 9px;font-size:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<b style="font-size:10.5px;color:#fff;font-weight:650;text-shadow:0 1px 2px rgba(0,0,0,.35)">⚠ ' + (YD_NAME[c.t] || "异动") + '扩散 · ' + c.list.length + '只</b>' +
            '<small style="color:rgba(255,255,255,.86);font-size:8.5px">近' + p.spWin + '分钟 ≥' + p.spM + '只 · 影响' + (dir > 0 ? "偏多" : dir < 0 ? "偏空" : "中性") + ' · ' + (per === "live" ? "跟进中" : "待确认") + '</small></div>';
        }
      });
      var w15 = Math.floor(base / 15) * 15, upN = {};
      evs.forEach(function (e) { if (YD_UP[e.t] && Math.floor(e.mn / 15) * 15 === w15) upN[e.c] = 1; });
      var cur = Object.keys(upN).length;
      if (rows) groups.push({ t: "个股扩散", n: live, html: rows + '<div class="g2">本15分钟上涨类 ' + cur + ' 只 · N=' + p.bkN + ' T=' + p.bkWin + '分 M=' + p.spM + '（CFG.yd 可调）</div>' });
      try { if (window.__JLEVLOG__) window.__JLEVLOG__({ k: "sp", day: today(), base: base, evs: evs, sp: sp.map(function (c) { return { t: c.t, nm: YD_NAME[c.t] || String(c.t), n: c.list.length, at: c.at, per: base - c.at <= 10 ? "live" : (base - c.at <= CFG.persistMin ? "warn" : "dead"), codes: c.list.map(function (e) { return e.c; }) }; }) }); } catch (eL) {} /* jl-1086: 任务B事件日志器被动tap(C组=现有"≥M只升级"事件, 升级类日志唯一来源; per=上方渲染行同式; 失败静默) */
    })();
    // D 风险事件
    (function () {
      var rk = evs.filter(function (e) { return e.t === 8218 || e.t === 8219 || e.t === 8220 || e.t === 8221; });
      if (!rk.length) return;
      var bk = {};
      rk.forEach(function (e) { var k = Math.floor(e.mn / 15) * 15; (bk[k] = bk[k] || []).push(e); });
      var keys = Object.keys(bk).sort(function (a, b) { return b - a; }).slice(0, 2);
      var rows = "";
      keys.forEach(function (k) {
        var arr = bk[k];
        var jp = arr.filter(function (e) { return e.t === 8219; }).length, js = arr.filter(function (e) { return e.t === 8218; }).length;
        var per = nReal - +k <= 10 ? "live" : "dead";
        var hold = arr.map(function (e) { return H.mh[e.c] ? "●" + esc(H.mh[e.c]) : ""; }).filter(Boolean).slice(0, 2).join(" ");
        rows += '<div class="ev"><span class="tm">' + hhmm(fromMin(+k)) + '</span><span class="tt"><b>风险事件聚集 · ' + arr.length + '只</b><small>高台跳水' + jp + ' · 加速下跌' + js + ' · 大笔卖出' + (arr.length - jp - js) + (hold ? '<br><span class="hold">' + hold + '</span>' : '') + '</small></span><span class="tags">' + tags(-1, per) + '</span></div>';
      });
      groups.push({ t: "风险事件", n: rk.length, html: rows });
    })();
    // E 指数异动 + F 成交额异动（jl-1077 二期: 腾讯分钟源自算; 休市date≠今日→冻结行, 通道死→降级卡, 均不报错）
    (function () {
      var tx = S.tx;
      if (!tx || !tx.ok) { groups.push({ t: "指数异动", n: 0, html: dgText("jlv2:tx", "腾讯分钟源未到 · 稍后自动重试") }); return; }
      if (!tx.today) { /* 休市/未开盘: 冻结显示, 不随墙钟产新事件 */
        var mmdd = tx.date ? tx.date.slice(4, 6) + "-" + tx.date.slice(6, 8) : "";
        groups.push({ t: "指数异动", n: 0, html: '<div class="g2">休市冻结 · 分钟数据停在 ' + mmdd + '（不报错 · 开盘自动恢复）</div>' });
        groups.push({ t: "成交额异动", n: 0, html: '<div class="g2">休市冻结 · 量能基准 ' + mmdd + '</div>' });
        return;
      }
      var cf = CFG.tx, rowsI = "", nI = 0;
      cf.idx.forEach(function (ix) {
        var pts = tx.pts[ix[0]];
        if (!pts || pts.length < 2) return;
        var evs2 = calcIdxEv(pts, cf), last = evs2[evs2.length - 1]; /* 每指数只显示最近一条 */
        if (!last) return;
        var end = pts[pts.length - 1][0]; /* 数据尾=状态基准, 非墙钟 */
        var per = end - last.mn <= 10 ? "live" : (end - last.mn <= CFG.persistMin ? "warn" : "dead");
        if (per !== "dead") nI++;
        var amp = last.m5 != null ? "5分钟" + (last.m5 >= 0 ? "+" : "") + last.m5.toFixed(2) + "%" : "1分钟" + (last.m1 >= 0 ? "+" : "") + last.m1.toFixed(2) + "%";
        var sub = "自 " + hhmm(fromMin(last.start)) + " 起" + (last.m5 != null ? " · 近1分钟" + (last.m1 >= 0 ? "+" : "") + last.m1.toFixed(2) + "%" : "") + " · 1分" + cf.idx1m + "%/5分" + cf.idx5m + "%触发";
        rowsI += '<div class="ev"><span class="tm">' + hhmm(fromMin(last.mn)) + '</span><span class="tt"><b>' + ix[1] + (last.dir > 0 ? " 快拉" : " 快跳水") + ' · ' + amp + '</b><small>' + sub + '</small></span><span class="tags">' + tags(last.dir, per) + '</span></div>';
      });
      if (rowsI) groups.push({ t: "指数异动", n: nI, html: rowsI });
      /* F 成交额: 基准=历史同期分钟均值(数据日除外, ≤amtBasis天) */
      var st = lsGet("jlv2_amt_v1", null), days = st && st.days ? st.days : {};
      var bd = Object.keys(days).filter(function (d) { return d !== tx.date; }).sort().slice(-cf.amtBasis);
      if (!bd.length) { groups.push({ t: "成交额异动", n: 0, html: '<div class="g2">量能基准积累中 · 已入 ' + Object.keys(days).length + ' 日（需历史交易日分钟曲线做同期均值）</div>' }); return; }
      var basis = {};
      bd.forEach(function (d) { Object.keys(days[d]).forEach(function (k) { (basis[k] = basis[k] || []).push(days[d][k]); }); });
      Object.keys(basis).forEach(function (k) { var a = basis[k]; basis[k] = a.reduce(function (x, y) { return x + y; }, 0) / a.length; });
      var ra = calcAmtEv(tx.slots, basis, cf), rowsA = "", nA = 0;
      var ks = Object.keys(tx.slots).sort(), endA = ks.length ? txMin(ks[ks.length - 1]) : 0;
      [[ra.up, "全市场放量", 1], [ra.dn, "全市场缩量", 0]].forEach(function (it) { /* 缩量=中性 */
        var e = it[0];
        if (!e) return;
        var per = endA - e.mn <= 10 ? "live" : (endA - e.mn <= CFG.persistMin ? "warn" : "dead");
        if (per !== "dead") nA++;
        rowsA += '<div class="ev"><span class="tm">' + hhmm(fromMin(e.mn)) + '</span><span class="tt"><b>' + it[1] + ' · 同期' + e.r.toFixed(1) + '倍</b><small>近' + cf.amtWin + '分钟 ' + (e.amt / 1e8).toFixed(0) + '亿 vs 均值' + (e.avg / 1e8).toFixed(0) + '亿 · 基准' + bd.length + '日 · ≥' + cf.amtUp + '倍放量/≤' + cf.amtDn + '倍缩量</small></span><span class="tags">' + tags(it[2], per) + '</span></div>';
      });
      if (rowsA) groups.push({ t: "成交额异动", n: nA, html: rowsA });
      else groups.push({ t: "成交额异动", n: 0, html: '<div class="g2">量能平稳 · 近' + cf.amtWin + '分钟在同期均值' + cf.amtDn + '~' + cf.amtUp + '倍区间内</div>' });
    })();
    var latest = evs.length ? hhmm(fromMin(evs[0].mn)) + " " + esc(evs[0].n) + " " + (YD_NAME[evs[0].t] || evs[0].t) : "";
    S.grp = { groups: groups, count: groups.reduce(function (a, g) { return a + g.n; }, 0), latest: latest, banner: banner };
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
  /* jl-1080: 热点板块持续——离线板块映射聚合主模块温度逐股涨跌(jinlin_mtemp_v1.data.rows, 增强通道顺手持久化) → 行业涨幅榜首
     板块上涨占比+平均涨幅; 样本<8不参榜(防小板块霸榜); 连日数独立键jlv2_hotoff_v1(与在线jlv2_hot_v1互不污染); 无数据=映射未覆盖 */
  function calcHotSector() {
    var rows = null;
    try { var mc = lsGet("jinlin_mtemp_v1", null); rows = mc && mc.data && mc.data.rows; } catch (e) { rows = null; } /* lsGet已parse, 勿再JSON.parse */
    if (!rows || !rows.length) return null;
    var agg = {};
    for (var i = 0; i < rows.length; i++) {
      var hy = SEC_MAP[rows[i][0]];
      if (!hy) continue;
      var o = agg[hy] || (agg[hy] = { n: 0, up: 0, s: 0 }), p = +rows[i][1] || 0;
      o.n++; if (p > 0) o.up++; o.s += p;
    }
    var best = null;
    Object.keys(agg).forEach(function (k) {
      var o = agg[k];
      if (o.n < 8) return;
      var a = o.s / o.n;
      if (!best || a > best.avg) best = { name: k, avg: a, upR: o.up / o.n, n: o.n };
    });
    if (!best) return null;
    var h = lsGet("jlv2_hotoff_v1", {});
    if (h.name === best.name && h.date === today()) best.streak = h.streak || 1;
    else {
      best.streak = (h.date === yesterdayStr() && h.name === best.name) ? (h.streak || 1) + 1 : 1;
      lsSet("jlv2_hotoff_v1", { date: today(), name: best.name, streak: best.streak });
    }
    return best;
  }
  /* jl-1080: 跌停明细弹层——温度卡"跌停"数字可点开; 与涨跌停结构组"封跌停"事件流计数交叉校验, 不一致以跌停池为准并标注口径差异 */
  function dtDetailHtml(dtr) {
    var rs = dtr.rows.slice(0, 30).map(function (r) {
      return '<div class="ev"><span class="tt"><b>' + esc(r.n) + '</b><small>' + r.c + " · " + esc(conOf(r.c) || secOf(r.c) || "未映射") + (r.days > 1 ? " · 连" + r.days + "天" : "") + '</small></span><span class="mono dn">' + r.zdp.toFixed(2) + '%</span></div>';
    }).join("");
    var diff = S.evDtN != null && S.evDtN !== dtr.n ? ' · <span class="dn">⚠口径差异 事件流' + S.evDtN + '家</span>' : "";
    return '<div style="margin:6px 0 2px;padding:7px 9px;border:1px solid #81e6d92e;border-radius:8px;background:rgba(255,255,255,.04)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:10px">当日跌停明细 · ' + dtr.n + '家</b><span style="font-size:9px;color:rgba(255,255,255,.72)">跌停池为准' + diff + '</span></div>' + rs + '<div class="g2" style="margin-top:4px">按封单额降序 · 剔除ST · 跌幅为现价对昨收</div></div>';
  }
  window.__JLDtDetailJL = function () { S.dtOpen = !S.dtOpen; paint(); };
  function renderTemp() {
    var st = deriveState(), sn = S.snap;
    var yk = Object.keys(S.hist).filter(function (k) { return k < today(); }).pop();
    var yv = yk ? S.hist[yk] : null;
    var dt2 = sn && yv && yv.t != null ? sn.t - yv.t : null; /* jl-1084: 补sn判空——跨零点重载snap按日期闸不恢复(null)+温度史留昨日条目(有t)→原式对null取.t抛TypeError→paint死→boot()首句崩→9个抓取全不调度→三卡永久消失(休市无mktLive轮询自愈); 判空后走699行既有"采样中…"降级路径 */
    var head = '<b>市场温度 · v2</b><small>采样 ' + (sn ? sn.at : "—") + ' · 东财沪深快照 · 自建通道</small>';
    if (!sn) { return { head: head, sum: '<span class="jsum">采样中… 点标题展开</span>', body: "" }; }
    var zbr = st ? st.zbr : null;
    var sumParts = [];
    sumParts.push('<span class="mono">' + sn.t + '</span> ' + (st && st.state !== "正常" ? '<span class="' + statePill(st.state) + '" style="font-size:9px;padding:1px 7px">' + st.state + '</span>' : '<span class="mu">平</span>'));
    if (dt2 != null && dt2 !== 0) sumParts.push('<span class="' + (dt2 > 0 ? "up" : "dn") + ' mono">' + (dt2 > 0 ? "▲" : "▼") + Math.abs(dt2) + '</span>');
    if (st && st.zt != null) sumParts.push('<span class="mono">涨停' + st.zt + '/跌停' + (st.dt == null ? "—" : st.dt) + '</span>');
    if (zbr != null) sumParts.push('<span class="mono">炸板' + zbr + '%</span>');
    var alertDot = st && (st.state === "冰点" || st.state === "高潮") ? '<span class="dot" style="color:#ff5459"></span>' : (st && st.state === "冷点" ? '<span class="dot" style="color:#ffd21f"></span>' : "");
    var scale = '<div class="row" style="border-bottom:none;gap:0;display:flex;justify-content:space-between;font-size:8px;color:rgba(255,255,255,.86)"><span>100 沸</span><span>热</span><span>温</span><span>50 平</span><span>冷</span><span>过冷</span><span>0 冰</span></div>';
    function tile(lb, val, cls, sub) { return '<div class="ft"><span>' + lb + '</span><b class="' + cls + '">' + val + '</b><small>' + sub + '</small></div>'; }
    var upR = Math.round(sn.up / Math.max(1, sn.up + sn.down) * 100);
    var yzbr = yv && yv.zbr != null ? yv.zbr : null;
    var hotSec = calcHotSector(); /* jl-1080: 离线板块映射聚合→行业涨幅榜首 */
    var dtr = S.pool && S.pool.dt && S.pool.dt.rows && S.pool.dt.rows.length ? S.pool.dt : null;
    var dtDiff = dtr && S.evDtN != null && S.evDtN !== dtr.n ? " · ⚠口径差" : "";
    var grid =
      tile("上涨占比", upR + "%", upR >= 55 ? "up" : upR <= 45 ? "dn" : "mu", esc(sn.up) + "/" + esc(sn.down) + " 家") +
      tile("涨停", st && st.zt != null ? st.zt : "—", (st && st.zt != null && st.zt >= 60) ? "up" : (st && st.zt != null && st.zt <= 25) ? "dn" : "mu", "涨停池口径") +
      (dtr
        ? '<div class="ft" role="button" tabindex="0" style="cursor:pointer" onclick="__JLDtDetailJL()" title="点击展开/收起当日跌停明细"><span>跌停</span><b class="' + ((st && st.dt != null && st.dt >= 40) ? "dn" : "mu") + '">' + (st && st.dt != null ? st.dt : "—") + '</b><small>跌停池 · 点看明细' + dtDiff + '</small></div>'
        : tile("跌停", st && st.dt != null ? st.dt : "—", (st && st.dt != null && st.dt >= 40) ? "dn" : "mu", "跌停池 · 本模块自建")) +
      tile("炸板率", zbr != null ? zbr + "%" : "—", zbr != null && zbr >= 40 ? "dn" : "mu", "盘中暂态 · 收盘定版") +
      tile("连板高度", st && st.lb != null ? st.lb + "板" : "—", (st && st.lb != null && st.lb >= 6) ? "up" : (st && st.lb != null && st.lb <= 2) ? "dn" : "mu", "最高连板") +
      tile("昨涨停溢价", st && st.prem != null ? pct(st.prem) : "—", (st && st.prem != null && st.prem >= 3) ? "up" : (st && st.prem != null && st.prem <= -1) ? "dn" : "mu", "T-1 · 强势股次日") +
      tile("成交额变化", amtDiffHtml(), amtDiffCls(), amtDiffSub()) + /* jl-1076 */
      tile("ATR波动率", S.atr && S.atr.vol != null ? S.atr.vol.toFixed(2) + "%" : "—", "mu", "上证 ATR14/价") +
      tile("热点板块持续", hotSec ? esc(hotSec.name) + " " + (hotSec.avg >= 0 ? "+" : "") + hotSec.avg.toFixed(1) + "%" : (S.hot ? S.hot.streak + "天" : "板块映射未覆盖"), hotSec ? (hotSec.avg > 0 ? "up" : "dn") : "mu", hotSec ? "上涨占比" + Math.round(hotSec.upR * 100) + "% · 连" + hotSec.streak + "天" : (S.hot ? "行业涨幅榜首 · 在线兜底" : "离线板块映射聚合")); /* jl-1080 */
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
      '<div class="tnow" style="margin-top:8px"><b>' + sn.t + '</b><span class="' + statePill(st ? st.state : "正常") + '">' + (st ? st.state : "—") + '</span><span style="font-size:8.5px;color:rgba(255,255,255,.72)">' + (dt2 != null ? "昨 " + yv.t + " · " + (dt2 > 0 ? "▲" : dt2 < 0 ? "▼" : "—") + Math.abs(dt2) : "昨日无记录") + '</span></div>' +
      '<div class="fgrid">' + grid + '</div>' +
      (S.dtOpen && dtr ? dtDetailHtml(dtr) : "") + /* jl-1080: 跌停明细展开层(点"跌停"数字切换) */
      '<div class="jh">冰点判定 · 规则组（非阈值）</div>' + rules +
      '<div class="jh">场景提示 · 状态驱动</div>' + scn +
      '<div class="foot">状态描述，不构成操作建议 · 温度=50+(涨跌比-0.5)×100 与旧卡同源 · 冰点=规则组判定（≥3项）· 阈值集中在 CFG 待回测校准 · 涨跌停池为本模块自建口径</div>';
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:rgba(255,255,255,.86)">·</span>') + '</span>', body: body };
  }
  function amtDiffBase() { /* jl-1076: 返回{diff(元),prev(元)}——房主质疑"1.44万亿是多了还是少了", 额度差才是人话 */
    if (!S.snap || !isFinite(S.snap.amt)) return null;
    var ks = Object.keys(S.hist).filter(function (k) { return k < today() && S.hist[k].amt > 1e11; }).sort();
    if (!ks.length) return null;
    var pv = S.hist[ks[ks.length - 1]].amt;
    return { diff: S.snap.amt - pv, prev: pv };
  }
  function amtDiff() { var a = amtDiffBase(); return a && a.prev ? a.diff / a.prev * 100 : null; }
  function fmtAmtDiff(v) { /* ±额度差: 元→万亿/亿 */
    var y = v / 1e8;
    return (y >= 0 ? "+" : "") + (Math.abs(y) >= 1e4 ? (y / 1e4).toFixed(2) + "万亿" : Math.abs(y) >= 100 ? y.toFixed(0) + "亿" : y.toFixed(1) + "亿");
  }
  function amtDiffHtml() { /* jl-1076: 有昨日基准→±额度差; 无基准→今日总额+明示基准缺失(原裸挂总额被当变化值=误导) */
    var a = amtDiffBase();
    if (a) return fmtAmtDiff(a.diff);
    if (S.snap && isFinite(S.snap.amt)) return (S.snap.amt / 1e12).toFixed(2) + "万亿";
    return "—";
  }
  function amtDiffSub() { var d = amtDiff(); return d != null ? "较昨日 · " + (d >= 0 ? "+" : "") + d.toFixed(1) + "%" : "今日总额 · 昨日基准缺失(历史采样一天后自动补上)"; }
  function amtDiffCls() { var d = amtDiff(); return d == null ? "mu" : (d >= 0 ? "up" : "dn"); }
  function renderGjd() {
    var stx = deriveStruct();
    var etfOk = S.etf && S.etf.length && S.etf.some(Boolean);
    var head = '<b>大资金 · 国家队</b><small>ETF主力净额口径' + (S.etfAt ? ' · ' + S.etfAt : '') + '</small>'; /* jl-1075: at改独立S.etfAt(数组态无.at) */
    if (!stx && !etfOk) { return { head: head, sum: '<span class="jsum">采样中… 点标题展开</span>', body: '<div class="g2" data-dg-key="jlv2:etf">' + dgText("jlv2:etf", "ETF 净额通道未到 · 稍后自动重试") + '</div>' }; } /* jl-1075: 结构+ETF双缺时ETF降级卡也要露面(原body空=卡内什么都不显) */
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
      rows = '<div class="row" style="font-size:8px;color:rgba(255,255,255,.86);border-bottom:none;padding-bottom:2px"><span>品种</span><span>当日主力净额（红入绿出）</span><span style="text-align:right">近5日</span></div>';
      rows += S.etf.map(function (r) {
        if (!r) return "";
        var w = isFinite(r.today) ? Math.max(3, Math.abs(r.today) / mx * 46) : 0;
        var bar = isFinite(r.today) ? (r.today >= 0
          ? '<i style="left:50%;width:' + w + '%;background:linear-gradient(90deg,#ff5459cc,#ff5459)"></i><em style="left:50%;padding:1px 4px 1px 6px;background:rgba(224,32,32,.92);color:#fff;font-weight:650;border-radius:8px;text-shadow:0 1px 2px rgba(0,0,0,.35);font-variant-numeric:tabular-nums">' + fmtYi(r.today) + '</em>'
          : '<i style="right:50%;width:' + w + '%;background:linear-gradient(270deg,#1fdc93cc,#1fdc93)"></i><em style="right:50%;padding:1px 6px 1px 4px;background:rgba(0,150,90,.92);color:#fff;font-weight:650;border-radius:8px;text-shadow:0 1px 2px rgba(0,0,0,.35);font-variant-numeric:tabular-nums">' + fmtYi(r.today) + '</em>') : '<em style="left:50%;padding-left:5px;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.35)">—</em>';
        return '<div class="erow"><span class="nm"><b>' + r.name + '</b><small>' + r.code + '</small></span><span class="ebar">' + bar + '</span><span class="d5 mono" style="text-align:right;font-size:9.5px" >' + (isFinite(r.d5) ? (r.d5 >= 0 ? "+" : "") + (r.d5 / 1e8).toFixed(1) + "亿" : "—") + '</span></div>';
      }).join("");
    } else rows = '<div class="g2" data-dg-key="jlv2:etf">' + dgText("jlv2:etf", "ETF 净额通道未到 · 稍后自动重试") + "</div>"; /* jl-1075: 裸"未到"→降级卡(最后成功HH:MM+手动立即重试+指数退避上限5次; 收盘后mktLive停轮询也能自愈) */
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
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:rgba(255,255,255,.86)">·</span>') + '</span>', body: body };
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
    if (!g.groups.length) { /* jl-1076: 房主问"大盘异动是画不出来还是?"——通道全败=降级卡(数据源不可用+重试), 通道活但真无事件=原文案 */
      if (S.ydFetchOk) { body = '<div class="g2">今日暂无聚合事件（异动 Tab 打开过才有事件缓存 · 本模块会自行补抓 8205/8218/8202）</div>'; try { window.__jlDg && window.__jlDg.ok("jlv2:yd"); } catch (eOy) {} }
      else {
        body = '<div class="g2" data-dg-key="jlv2:yd">' + dgText("jlv2:yd", "今日暂无聚合事件（异动 Tab 打开过才有事件缓存 · 本模块会自行补抓 8205/8218/8202）") + "</div>";
        try { window.__jlDg && window.__jlDg.fail("jlv2:yd", function () { return new Promise(function (res) { fetchOwnYd(function () { paint(); res(true); }); }); }, "异动事件通道受阻(自抓8205/8218/8202未返回 · 网络/IP)", function () { return !!(S.ydFetchOk || S.ownYd.length); }); } catch (eDy) {}
      }
    } else { try { window.__jlDg && window.__jlDg.ok("jlv2:yd"); } catch (eOy2) {} }
    var ORDER = ["指数异动", "涨跌停结构", "成交额异动", "板块异动", "个股扩散", "风险事件"];
    var map = {}; g.groups.forEach(function (x) { map[x.t] = x; });
    body += (g.banner || "") + ORDER.map(function (t) { /* jl-1077: 二期占位行已由真实功能替换(指数/成交额自算), 扩散横幅置顶 */
      var x = map[t];
      if (!x) return '<div class="grp"><div class="grpH"><span>' + t + '</span><small>0</small></div></div>';
      return '<div class="grp"><div class="grpH"><span>' + t + '</span><small>' + x.n + '</small></div>' + x.html + '</div>';
    }).join("");
    body += '<div class="foot">持续性只跟踪不预测：待确认 → 已持续N分 → 15分钟无跟进自动置已衰竭 · 关联持仓读 jinlin_stocks_v2（●持仓 ○观察）· 事件源东财异动流+本模块补抓 · 剔除ST · 指数/成交额自算（腾讯分钟源 · 休市冻结）</div>';
    return { head: head, sum: '<span class="jsum">' + alertDot + sumParts.join('<span style="color:rgba(255,255,255,.86)">·</span>') + '</span>', body: body };
  }

  /* 调试钩子（金粲惯例 window 挂钩）：__JLV2S__=状态 __JLV2P__=手动重绘 __JLV2C__=配置 */
  window.__JLV2S__ = S;
  window.__JLV2P__ = function () { try { paint(); } catch (e) {} };
  window.__JLV2C__ = CFG;
  window.__JLV2T__ = { calcIdxEv: calcIdxEv, calcAmtEv: calcAmtEv, fetchTxMin: fetchTxMin }; /* jl-1077: 纯函数暴露, 便于回测校准 */

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
    try { paint(); } catch (eB0) {} /* jl-1084: 防爆盾——渲染任何异常不再杀死boot后续9个抓取调度(单卡bug不再放大成整模块消失) */
    fetchSnap(function () { paint(); });
    setTimeout(function () { fetchIdx(function () { paint(); }); }, 400);
    setTimeout(function () { fetchAtr(function () { paint(); fetchPremium(function () { paint(); }); }); }, 900);
    setTimeout(function () { fetchPools(function () { paint(); }); }, 1500);
    setTimeout(function () { fetchEtfs(function () { paint(); }); }, 2200);
    setTimeout(function () { fetchHot(function () { paint(); }); }, 3000);
    setTimeout(function () { fetchOwnYd(function () { paint(); }); }, 3600);
    setTimeout(function () { fetchTxMin(function () { paint(); }); }, 4200); /* jl-1077: 指数/成交额自算 */
  }
  var lastTick = 0;
  setInterval(function () {
    if (!mktLive()) return;
    var n = Date.now();
    fetchSnap(function () { paint(); });
    if (n - lastTick > CFG.refrEtf) { lastTick = n; fetchIdx(function () { paint(); }); fetchEtfs(function () { paint(); }); }
    fetchPools(function () { paint(); });
    fetchTxMin(function () { paint(); }); /* jl-1077: 分钟级自算(60s), 休市时mktLive闸住=冻结 */
    paint();
  }, CFG.refrLive);
  var visAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { visAt = Date.now(); return; }
    if (Date.now() - visAt > 2 * 60e3) boot(); // 回前台>2分钟全量补拉（沿用金粲节奏）
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
