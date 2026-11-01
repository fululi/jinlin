/* jl_jitu.js v12 — jl-1227 (2026-11-01): 积/突信号覆盖层, 独立模块 (v12: 持仓卡状态签挪出画布——改为分时图下方、「日线未补」行上方单独一行 HTML(.jituChipJL), 不压走势线/轴价/K·B·控振按钮排(预览实测画布内左下角签被按钮排压住右半截+盖住左下轴价); 非持仓卡实例(盘中做T卡等)仍画布内; v11: 卡组重建后已脱离页面的旧画布实例清出 _insts——预览实测7个实例4个是死画布, 每次 redrawAll 仍白算一遍; v10: 状态签加「已确认至HH:MM」, 资金落后行情时加「资金滞后N分钟」(N=已收盘却没资金的根数, 午休不计); 签太宽时先省观察/失效计数(列表里有); v9: ①未收盘末根不参与计算(后面有更晚一根才算收盘, 末根≥15:00或=11:30视为已收, 不看手机时钟) ②缺资金分钟记NaN不记0(窗口含缺失→特征NaN→不触发; 资金滞后行情的分钟同样不出信号) ③突crossed追加close>prevF.prior_high ④失效原因分型: 积=跌破前12根低点/突=跌回区间上沿/资金转流出另列 ⑤三态: 观察中/6根内已失效/6根满未失效; v8: 分钟净额命中缓存也按60s后台刷新——v4起 getMinuteNet 有缓存即返回, 首次取数后当日再不拉, 之后分钟净额全记0, 首拉后不再出新信号; 收盘(含15:00行)后停刷; v7: 展开卡左下角常驻状态签「积N 突N / 今日无信号 / 取资金中 / 取数失败·点此重试」, 点签弹全部信号列表——不再静默无标, 不跳页; v5: mn限幅/命中去dpr换算/缓存键含末根t, 外部评审落修; v6: 折叠窄卡不画标记——开关图标在窄卡本就隐藏, 且窄卡geom坐标系与可视区错位, 画了也是飘点; 开关toast区分无信号/资金未取到)
 * 引擎 = jitu_engine.py v0.1.0 的 JS 移植(与「积突实时分时」交付版 engine.js 同源, 已经 Python 逐字段校验+三场景回放验证;
 *        配置键名与该版 data.js 完全一致, 回归测试直接复用三场景期望信号);
 * 数据 = 分钟行 window.jlM1RowsJL(东财1分通道, 含 f57 真成交额) + 分钟主力净额(v4 起自取: 东财 fflow kline klt=1
 *        累计值相邻微分, 双主机竞速, 60s/票缓存+失败5分钟退避; v3 前读 jl_ff_v1 分钟行——该键全站只写日级行, 恒 null,
 *        覆盖层 10-31 上线起因此从未出标, "开关没反应/点标不弹"根因); 缺失时该 bar 净额记 NaN(v9 起; v8 前记 0) → 含该分钟的窗口特征全 NaN, 不出信号);
 * 语义 = 积: 早盘资金持续流入+价格回撤承接(VWAP 未破容差); 突: 有资金铺垫的区间突破(量额+主动买同步放大+收盘越上沿);
 *        触发后 horizon 内跌回区间/资金转流出 → 记失效(灰显✕), 不删原信号;
 * 画法 = createCardIntraday 钩子行(index.html 唯一插入) → window.jlJituHookJL(canvas, api, o):
 *        api.on() 订阅重画 + api.geom() 只读坐标快照, 引擎每次重画(画布已重置)通知后把标记补绘在同一画布上
 *        (PHVLCross/JLRegrCh 同款只读原则: 不改任何价格/坐标/信号计算, geo 失效时自动跳过);
 * 单位 = volume(手)×100=股, vwap=Σ额/Σ股; 主买/主卖 由 (额±净)/2 分解(与引擎数据契约 buy+sell=amount 严格自洽);
 * 开关 = 卡头标题行「连出N」旁 16px 小图标(.jituTogJL, v3 起; boardTools 两大按钮已撤), 状态存 localStorage jl_jitu_marks_v1(默认开);
 * 点标 = 点图上的 ●/▲ 弹小提示(类型/时间/触发价/reason), 信号直接标在页内分时走势线上, 不跳任何页面;
 * 回滚 = 删 index.html: script 引用行 + 卡头 .jituTogJL 图标 + createCardIntraday 钩子行 + jlM1RowsJL 取数行, 即整批消失。 */
(function (global) {
  "use strict";

  /* ============ 引擎核心(移植自 jitu_engine.py v0.1.0 / engine.js, 勿改口径; 键名同 data.js) ============ */
  var DEFAULT_CONFIG = {
    volume_multiplier: 100, /* jinlin 站内 v 为手; 合成数据为股(测试时传 1) */
    accumulation: { window: 8, min_history: 12, before: "10:30", pullback_lookback: 6, min_positive_ratio: 0.6, min_net_amount_ratio: 0.02, min_drawdown_pct: 0.002, max_drawdown_pct: 0.04, vwap_tolerance_pct: 0.015, cooldown_bars: 8 },
    breakout: { range_window: 12, setup_window: 8, min_history: 20, max_prior_range_pct: 0.018, min_amount_ratio: 1.3, min_buy_ratio: 1.5, min_current_net_amount_ratio: 0.03, min_setup_positive_ratio: 0.5, min_setup_net_amount_ratio: 0.0, max_vwap_extension_pct: 0.05, cooldown_bars: 12 },
    invalidation: { horizon_bars: 6, max_forward_net_amount_ratio: -0.02 }
  };

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function safeDiv(a, b) { return (fin(a) && fin(b) && Math.abs(b) > 1e-12) ? a / b : NaN; }
  function medianOf(arr) {
    var a = [], k;
    for (k = 0; k < arr.length; k += 1) if (fin(arr[k])) a.push(arr[k]);
    if (!a.length) return NaN;
    a.sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return (a.length % 2) ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function hhmm(ts) { var s = String(ts || ""), cut = s.indexOf("T"), sp = s.indexOf(" "); if (cut < 0) cut = sp; if (cut >= 0) s = s.slice(cut + 1); return s.slice(0, 5); }
  function mergeCfg(c) {
    var out = { volume_multiplier: (c && fin(c.volume_multiplier)) ? c.volume_multiplier : DEFAULT_CONFIG.volume_multiplier, accumulation: {}, breakout: {}, invalidation: {} }, k;
    for (k in DEFAULT_CONFIG.accumulation) out.accumulation[k] = (c && c.accumulation && c.accumulation[k] !== undefined) ? c.accumulation[k] : DEFAULT_CONFIG.accumulation[k];
    for (k in DEFAULT_CONFIG.breakout) out.breakout[k] = (c && c.breakout && c.breakout[k] !== undefined) ? c.breakout[k] : DEFAULT_CONFIG.breakout[k];
    for (k in DEFAULT_CONFIG.invalidation) out.invalidation[k] = (c && c.invalidation && c.invalidation[k] !== undefined) ? c.invalidation[k] : DEFAULT_CONFIG.invalidation[k];
    return out;
  }

  function JituEngine(config) {
    this.cfg = mergeCfg(config);
    this.bars = []; this.f = []; this.signals = []; this.invalidations = [];
    this._last = { "积": -9999, "突": -9999 };
  }

  JituEngine.prototype.onBar = function (bar) {
    var i = this.bars.length;
    this.bars.push(bar);
    var f = this._feat(i, bar);
    this.f.push(f);
    var ac = this.cfg.accumulation, bk = this.cfg.breakout;
    /* ---- 积 ---- */
    if (i >= ac.min_history && hhmm(bar.ts) <= ac.before && (i - this._last["积"]) >= ac.cooldown_bars &&
        fin(f.positive_ratio) && fin(f.net_amount_ratio) && fin(f.cum_net_slope) && fin(f.drawdown) && fin(f.close_to_vwap) && fin(f.main_net) &&
        f.positive_ratio >= ac.min_positive_ratio && f.net_amount_ratio >= ac.min_net_amount_ratio &&
        f.cum_net_slope > 0 && f.main_net > 0 &&
        f.drawdown >= ac.min_drawdown_pct && f.drawdown <= ac.max_drawdown_pct &&
       f.close_to_vwap >= -ac.vwap_tolerance_pct && f.close_to_vwap <= 0.015)  {
      this.signals.push({ type: "积", start: i, ts: bar.ts, time: hhmm(bar.ts), price: bar.close, level: fin(f.prior_low) ? f.prior_low : bar.low, levelWhy: fin(f.prior_low) ? "跌破前" + bk.range_window + "根低点" : "跌破触发根低点",
        reason: "近" + ac.window + "分钟资金持续净流入+价格自高点回撤" + (f.drawdown * 100).toFixed(1) + "%且未破VWAP容差" });
      this._last["积"] = i;
    }
    /* ---- 突 ---- */
    var prev = i > 0 ? this.bars[i - 1] : null, prevF = i > 0 ? this.f[i - 1] : null;
    var crossed = prev && prevF && fin(f.prior_high) && fin(prevF.prior_high) && fin(prev.close) &&
      bar.close > f.prior_high && bar.close > prevF.prior_high && prev.close <= prevF.prior_high; /* v9(批3): 追加越过上一根口径的上沿——旧区间高点刚滑出窗口时 f.prior_high 下移, 收盘没过原上沿也会判突破 */
    if (i >= bk.min_history && (i - this._last["突"]) >= bk.cooldown_bars && crossed &&
        fin(f.prior_range_pct) && f.prior_range_pct <= bk.max_prior_range_pct &&
        fin(f.amount_ratio) && fin(f.buy_ratio) && fin(f.current_net_amount_ratio) && fin(f.setup_positive_ratio) && fin(f.setup_net_ratio) && fin(f.close_to_vwap) &&
        f.amount_ratio >= bk.min_amount_ratio && f.buy_ratio >= bk.min_buy_ratio && f.current_net_amount_ratio >= bk.min_current_net_amount_ratio &&
        f.setup_positive_ratio >= bk.min_setup_positive_ratio && f.setup_net_ratio >= bk.min_setup_net_amount_ratio &&
        f.close_to_vwap > 0 && f.close_to_vwap <= bk.max_vwap_extension_pct) {
      this.signals.push({ type: "突", start: i, ts: bar.ts, time: hhmm(bar.ts), price: bar.close, level: f.prior_high, levelWhy: "跌回区间上沿",
        reason: "前" + bk.range_window + "柱振幅" + (f.prior_range_pct * 100).toFixed(2) + "%；成交额放大" + f.amount_ratio.toFixed(2) + "倍、主动大买放大" + f.buy_ratio.toFixed(2) + "倍；收盘越过区间上沿" + f.prior_high });
      this._last["突"] = i;
    }
    /* ---- 失效(增量: 本 bar 判结 horizon 内的既有信号; 与事后扫描等价) ---- */
    var h = this.cfg.invalidation.horizon_bars, mx = this.cfg.invalidation.max_forward_net_amount_ratio, s, k, j, ns, as, fv, hit;
    for (k = 0; k < this.signals.length; k += 1) {
      s = this.signals[k];
      if (s.invalidatedAt != null || i <= s.start || i > s.start + h) continue;
      hit = null;
      if (fin(bar.close) && fin(s.level) && bar.close < s.level * 0.997)  { hit = s.levelWhy || "跌回突破区间"; s.invalidatedKind = "price"; } /* v9(批4): 积/突价格失效分开写 */
      else {
        ns = 0; as = 0;
        for (j = s.start + 1; j <= i; j += 1) { ns += (this.f[j] && fin(this.f[j].main_net)) ? this.f[j].main_net : 0; as += (this.bars[j] && fin(this.bars[j].amount)) ? this.bars[j].amount : 0; }
        fv = safeDiv(ns, as);
        if (fin(fv) && fv <= mx) { hit = "信号后资金转为流出"; s.invalidatedKind = "fund"; } /* 资金失效另列 */
      }
      if (hit) { s.invalidatedAt = i; s.invalidatedTs = bar.ts; s.invalidatedWhy = hit; this.invalidations.push({ type: s.type, start: s.start, invalidatedAt: i, ts: bar.ts, reason: hit }); }
    }
    return f;
  };

  JituEngine.prototype._feat = function (i, bar) {
    var b = this.bars, w = this.cfg.accumulation.window, bw = this.cfg.breakout.range_window, sw = this.cfg.breakout.setup_window;
    var am = bar.amount, mb = bar.main_buy, ms = bar.main_sell;
    var mn = (fin(mb) && fin(ms)) ? (mb - ms) : NaN;
    var f = { main_net: mn };
    f._cumA = (i > 0 && this.f[i - 1] && fin(this.f[i - 1]._cumA)) ? this.f[i - 1]._cumA : 0;
    f._cumV = (i > 0 && this.f[i - 1] && fin(this.f[i - 1]._cumV)) ? this.f[i - 1]._cumV : 0;
    f._cumN = (i > 0 && this.f[i - 1] && fin(this.f[i - 1]._cumN)) ? this.f[i - 1]._cumN : 0;
    if (fin(am)) f._cumA += am; if (fin(bar.volume)) f._cumV += bar.volume * this.cfg.volume_multiplier;
    if (fin(mn)) f._cumN += mn;
    f.vwap = safeDiv(f._cumA, f._cumV);
    f.close_to_vwap = (fin(f.vwap) && f.vwap > 0 && fin(bar.close)) ? bar.close / f.vwap - 1 : NaN;
    /* 积窗(含当前bar, 满窗才出数) */
    var i0 = i - w + 1, netSum = 0, amtSum = 0, posN = 0, full = i0 >= 0;
    if (full) {
      for (var k = i0; k <= i; k += 1) {
        var n = (k === i) ? mn : (this.f[k] ? this.f[k].main_net : NaN), av = this.bars[k].amount;
        if (!fin(n) || !fin(av)) { full = false; break; }
        netSum += n; amtSum += av; if (n > 0) posN += 1;
      }
    }
    f.positive_ratio = full ? posN / w : NaN;
    f.net_amount_ratio = full ? safeDiv(netSum, amtSum) : NaN;
    f.cum_net_slope = (i - w >= 0 && full) ? safeDiv(f._cumN - (this.f[i - w] ? this.f[i - w]._cumN : 0), amtSum) : NaN;
    /* setup 窗(shift(1): i-sw..i-1, 不含当前bar) */
    var s0 = i - sw, ok = s0 >= 0, sPos = 0, sNet = 0, sAmt = 0;
    if (ok) {
      for (k = s0; k <= i - 1; k += 1) {
        var n2 = this.f[k] ? this.f[k].main_net : NaN, av2 = this.bars[k].amount;
        if (!fin(n2) || !fin(av2)) { ok = false; break; }
        sNet += n2; sAmt += av2; if (n2 > 0) sPos += 1;
      }
    }
    f.setup_positive_ratio = ok ? sPos / sw : NaN;
    f.setup_net_ratio = ok ? safeDiv(sNet, sAmt) : NaN;
    /* 回撤(近 pullback_lookback 根高, 含当前) */
    var lb = this.cfg.accumulation.pullback_lookback || 6, hi6 = -Infinity;
    if (i - lb + 1 >= 0) { for (k = i - lb + 1; k <= i; k += 1) { if (!fin(this.bars[k].high)) { hi6 = NaN; break; } if (this.bars[k].high > hi6) hi6 = this.bars[k].high; } } else hi6 = NaN;
    f.drawdown = (fin(hi6) && hi6 > 0 && fin(bar.close)) ? 1 - bar.close / hi6 : NaN;
    /* 先行区间(shift(1) 后 bw 根 = i-bw..i-1) */
    var ph = -Infinity, pl = Infinity;
    if (i - bw >= 0) {
      for (k = i - bw; k <= i - 1; k += 1) { if (!fin(this.bars[k].high) || !fin(this.bars[k].low)) { ph = NaN; pl = NaN; break; } if (this.bars[k].high > ph) ph = this.bars[k].high; if (this.bars[k].low < pl) pl = this.bars[k].low; }
    } else { ph = NaN; pl = NaN; }
    f.prior_high = ph; f.prior_low = pl;
    var pclose = i > 0 ? this.bars[i - 1].close : NaN;
    f.prior_range_pct = (fin(ph) && fin(pl) && fin(pclose) && pclose > 0) ? (ph - pl) / pclose : NaN;
    /* 中位数量比(shift(1) 后 12 根; 量额中位数窗口=12, 与引擎同口径) */
    var mw = 12, aArr = [], bArr = [];
    if (i - mw >= 0) { for (k = i - mw; k <= i - 1; k += 1) { aArr.push(this.bars[k].amount); bArr.push(this.bars[k].main_buy); } }
    f.amount_ratio = (aArr.length === mw) ? safeDiv(am, medianOf(aArr)) : NaN;
    f.buy_ratio = (bArr.length === mw) ? safeDiv(mb, medianOf(bArr)) : NaN;
    f.current_net_amount_ratio = safeDiv(mn, am);
    return f;
  };

  function runSession(bars, config) {
    var eng = new JituEngine(config), i;
    for (i = 0; i < bars.length; i += 1) eng.onBar(bars[i]);
    return { signals: eng.signals, invalidations: eng.invalidations };
  }

  /* ============ jinlin 适配层(只读取数, 零新增请求) ============ */
  function readFFMinuteNet(code, dayStr) {
    /* jl_ff_v1[code].rows 里 d 形如 "2026-10-31 10:31"(分钟, 累计净额) → 相邻微分=每分钟净额(元); 当日首行=自身(累计起点) */
    var out = null, m;
    try { m = JSON.parse((global.localStorage && global.localStorage.getItem("jl_ff_v1")) || "{}") || {}; } catch (e) { m = {}; }
    var rows = (m && m[code] && m[code].rows) || [];
    var prevDay = null, prevV = 0, k, d, v, t;
    for (k = 0; k < rows.length; k += 1) {
      d = String((rows[k] && rows[k].d) || "");
      if (d.indexOf(" ") < 0) continue; /* 日级行不算 */
      if (dayStr && d.slice(0, 10) !== dayStr) { prevDay = null; continue; }
      v = Number(rows[k].main);
      if (!fin(v)) continue;
      if (!out) out = {};
      t = d.slice(11, 16);
      out[t] = (prevDay === d.slice(0, 10)) ? (v - prevV) : v;
      prevDay = d.slice(0, 10); prevV = v;
    }
    return out;
  }

  /* ============ v4: 分钟主力净额自取数(东财 fflow klt=1 累计值微分) ============ */
  var _netCache = {}; /* code -> {day, net, t, loading, fail} */
  function _jituSecid(code) {
    var b = String(code || "").replace(/^(sh|sz)/i, "");
    return (/^(6|9)/.test(b) ? "1." : "0.") + b;
  }
  function fetchMinuteNet(code, day) {
    var now = Date.now(), c = _netCache[code];
    if (c && c.day === day && c.net && now - c.t < 6e4) return; /* 60s 新鲜 */
    if (c && c.loading) return;
    if (c && c.fail && now - c.fail < 3e5 && c.day === day) return; /* 失败退避 5 分钟, 防限流 */
    c = _netCache[code] = { day: day, net: (c && c.day === day ? c.net : null), t: (c && c.t) || 0, loading: true };
    var done = false;
    var take = function (d) {
      if (done) return;
      try {
        var kl = d && d.data && d.data.klines;
        if (!(kl && kl.length)) return;
        var net = {}, prev = 0, prevDay = null, i2, p2, dd, v;
        for (i2 = 0; i2 < kl.length; i2 += 1) {
          p2 = String(kl[i2]).split(",");
          dd = String(p2[0] || "");
          if (dd.slice(0, 10) !== day) { prevDay = null; continue; }
          v = Number(p2[1]);
          if (!fin(v)) continue;
          net[dd.slice(11, 16)] = (prevDay === day) ? (v - prev) : v;
          prevDay = day; prev = v;
        }
        if (!Object.keys(net).length) return;
        done = true;
        c.net = net; c.t = Date.now(); c.loading = false; c.fail = 0;
        _cache = {}; /* 信号缓存作废重算 */
        redrawAll();
      } catch (e) { }
    };
    var path = "/api/qt/stock/fflow/kline/get?secid=" + _jituSecid(code) + "&lmt=0&klt=1&fields1=f1,f2,f3&fields2=f51,f52&ut=fa5fd1943c7b386f172d6893dbfba10b";
    var hosts = ["https://push2.eastmoney.com", "https://push2his.eastmoney.com"];
    var left = hosts.length;
    hosts.forEach(function (h) {
      try {
        var cb = "__jituFfCb" + Math.random().toString(36).slice(2, 9);
        var sc = document.createElement("script");
        var kill = setTimeout(function () { try { delete global[cb]; } catch (e2) { } sc.remove(); }, 9000);
        global[cb] = function (d) { clearTimeout(kill); try { delete global[cb]; } catch (e2) { } sc.remove(); take(d); };
        sc.onerror = function () { clearTimeout(kill); fin0(); };
        sc.src = h + path + "&cb=" + cb + "&_=" + Date.now();
        document.body.appendChild(sc);
      } catch (e) { fin0(); }
    });
    function fin0() { if (--left <= 0 && !done) { c.loading = false; c.fail = Date.now(); } }
    setTimeout(function () { if (!done) { c.loading = false; c.fail = Date.now(); } }, 9500);
  }
  function getMinuteNet(code, day) {
    var c = _netCache[code];
    if (c && c.day === day && c.net) {
      /* v8: 命中缓存也要刷新(盘中每分钟新增净额); 节流/在途/失败退避仍由 fetchMinuteNet 自身三道闸把守; 已含15:00=收盘数据齐, 不再拉 */
      if (!c.net["15:00"] && Date.now() - c.t >= 6e4 && typeof document !== "undefined") { try { fetchMinuteNet(code, day); } catch (e) { } }
      return c.net;
    }
    if (typeof document !== "undefined") { try { fetchMinuteNet(code, day); } catch (e) { } }
    return null;
  }

  /* m1 行时间两种格式归一: 东财 "YYYY-MM-DD HH:MM" / 腾讯备口 "YYYYMMDDHHMM" → 统一前者 */
  function jituNormT(t) {
    var s = String(t || "");
    if (/^\d{12}$/.test(s)) return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + " " + s.slice(8, 10) + ":" + s.slice(10, 12);
    if (s.indexOf("T") > 0) s = s.replace("T", " ");
    return s;
  }
  function jituCardCompute(code) {
    if (!code || !global.jlM1RowsJL) return null;
    var rows = global.jlM1RowsJL(code) || [];
    if (rows.length < 24) return null;
    var day = jituNormT(rows[rows.length - 1].t).slice(0, 10);
    if (!day) return null;
    var net = getMinuteNet(code, day); /* v4: jl_ff_v1 无分钟行(死源), 改自取; null=未取到→触发拉取, 到数自动重画 */
    if (!net) return null; /* 无分钟资金流 → 不出信号(宁缺勿假) */
    var bars = [], idx = [], i, r, cl, am, mn, tN;
    /* v9(批2): 末根有更晚一根跟着才算收盘; 末根≥15:00(收盘/非今日)或=11:30(午休)视为已收. 未收盘末根不进引擎, 不出信号也不判失效 */
    var lastT = jituNormT(rows[rows.length - 1].t).slice(11, 16), iEnd = rows.length;
    if (!(lastT >= "15:00" || lastT === "11:30")) iEnd = rows.length - 1;
    for (i = 0; i < iEnd; i += 1) {
      r = rows[i];
      tN = jituNormT(r.t);
      if (tN.slice(0, 10) !== day) continue;
      cl = Number(r.c);
      am = (fin(r.a) && r.a > 0) ? Number(r.a) : ((fin(r.v) && fin(r.c)) ? Number(r.v) * 100 * Number(r.c) : NaN); /* f57真额优先; 腾讯备口无额→量×100×价近似(与站内分钟DDX同口径) */
      if (!fin(cl) || !fin(am) || am <= 0) continue;
      mn = fin(net[tN.slice(11, 16)]) ? net[tN.slice(11, 16)] : NaN; /* v9(批1): 缺失记NaN不记0(资金未到/该分钟无数); 0 会被当成"没流入"参与比例, 7/8 正仍能过 0.6 门 */
      if (fin(mn)) mn = Math.max(-am, Math.min(am, mn)); /* 净额限幅: |mn|>am 时 (am-mn)/2 变负, main_sell 失真(评审) */
      bars.push({ ts: tN.slice(11, 16), close: cl, high: Number(r.h) || cl, low: Number(r.l) || cl, volume: Number(r.v) || 0, amount: am, main_buy: (am + mn) / 2, main_sell: (am - mn) / 2 });
      idx.push(i);
    }
    if (bars.length < 24) return null;
    var res = runSession(bars);
    var mk = [], s, k, hz = DEFAULT_CONFIG.invalidation.horizon_bars, last = bars.length - 1, left;
    for (k = 0; k < res.signals.length; k += 1) {
      s = res.signals[k];
      left = s.start + hz - last; /* v9(批4)三态: 失效=dead / 已过 horizon 根未失效=done / 其余=watch(还剩 left 根) */
      mk.push({
  type: s.type,
  time: s.time,
  price: s.price,
  level: s.level,
  rowIdx: idx[s.start],
  barIdx: s.start,
  fullTs: jituNormT(rows[idx[s.start]].t),
  dead: s.invalidatedAt != null,
        st: s.invalidatedAt != null ? "dead" : (left <= 0 ? "done" : "watch"), left: left > 0 ? left : 0,
        why: s.invalidatedWhy ? (s.invalidatedWhy + " · " + s.invalidatedTs) : s.reason, reason: s.reason });
    }
    /* v10(批2): 已确认至 = min(行情最后已收盘分钟, 资金最后分钟); 滞后按根数数(跨午休不虚增) */
    var netLast = "", nkey, lag = 0;
    for (nkey in net) if (fin(net[nkey]) && nkey > netLast) netLast = nkey;
    for (k = last; k >= 0 && bars[k].ts > netLast; k -= 1) lag += 1;
    return { marks: mk, day: day, n: rows.length, upTo: lag ? (lag > last ? "" : bars[last - lag].ts) : bars[last].ts, lag: lag };
  }

  /* ============ 覆盖层(挂 createCardIntraday) ============ */
  var _insts = [], _cache = {};
  function marksOn() { try { return (global.localStorage.getItem("jl_jitu_marks_v1") || "1") !== "0"; } catch (e) { return true; } }

  /* ============ v7: 状态签(左下角, 点开信号列表) ============ */
  function chipState(code, comp) {
    var k, m, nj = 0, nt = 0, nd = 0, nw = 0;
    if (comp) {
      var ms = comp.marks || [];
      var tail = upToTxt(comp);
      if (!ms.length) return { txt: "积突 · 今日无信号" + tail, col: "#9fb3b8", kind: "none" };
      for (k = 0; k < ms.length; k += 1) { m = ms[k]; if (m.type === "积") nj += 1; else nt += 1; if (m.dead) nd += 1; else if (m.st === "watch") nw += 1; }
      return { txt: "积" + nj + " 突" + nt + (nw ? " · 观察" + nw : "") + (nd ? " · 失效" + nd : "") + tail + " ▸",
        alt: "积" + nj + " 突" + nt + tail + " ▸", col: comp.lag ? "#ffc24d" : "#81e6d9", kind: "list" };
    }
    var rows = [], nc = _netCache[code];
    try { rows = global.jlM1RowsJL ? (global.jlM1RowsJL(code) || []) : []; } catch (e) { }
    if (rows.length < 24) return { txt: "积突 · 分钟数据不足", col: "#9fb3b8", kind: "short" };
    if (nc && nc.fail && !nc.net && !nc.loading) return { txt: "积突 · 资金取数失败 · 点此重试", col: "#ffc24d", kind: "retry" };
    return { txt: "积突 · 取资金中…", col: "#9fb3b8", kind: "load" };
  }
  /* v10: 「· 已确认至HH:MM」/ 资金落后时再加「· 资金滞后N分钟」 */
  function upToTxt(comp) {
    if (!comp || !comp.upTo) return comp && comp.lag ? " · 资金滞后" + comp.lag + "分钟" : "";
    return " · 已确认至" + comp.upTo + (comp.lag ? " · 资金滞后" + comp.lag + "分钟" : "");
  }
  function drawChip(g, cv, inst, st) {
    try {
      var W = cv.clientWidth || 0, H = cv.clientHeight || 0;
      if (W < 160 || H < 90) { inst._chip = null; return; }
      g.save();
      g.font = "600 10px -apple-system,'PingFang SC',sans-serif";
      g.textAlign = "left"; g.textBaseline = "middle";
      var txt = st.txt;
      if (st.alt && Math.ceil(g.measureText(txt).width) + 14 > W - 12) txt = st.alt; /* v10: 太宽先省观察/失效计数 */
      var w = Math.ceil(g.measureText(txt).width) + 14, h = 16, x0 = 6, y0 = H - h - 6, r = 8;
      g.beginPath();
      g.moveTo(x0 + r, y0); g.lineTo(x0 + w - r, y0); g.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
      g.lineTo(x0 + w, y0 + h - r); g.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
      g.lineTo(x0 + r, y0 + h); g.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
      g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath();
      g.fillStyle = "rgba(8,20,28,.72)"; g.fill();
      g.globalAlpha = 0.85; g.strokeStyle = st.col; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
      g.fillStyle = st.col; g.fillText(txt, x0 + 7, y0 + h / 2 + 0.5);
      g.restore();
      inst._chip = { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h, kind: st.kind };
    } catch (e) { inst._chip = null; }
  }
  /* v12: 持仓卡(.hldCardTrendJL 内)状态签 = 画布下方单独一行, 插在「日线未补」行(.hldGapRowJL)之前; 卡组重建丢了就重建 */
  function htmlChip(inst, st) {
    try {
      var cv = inst.cv, host = cv.parentNode;
      if (!host || !host.classList || !host.classList.contains("hldCardTrendJL")) return false;
      chipCss();
      var el = inst._chipEl;
      if (!el || el.parentNode !== host) {
        el = host.querySelector(":scope > .jituChipJL");
        if (!el) {
          el = document.createElement("div"); el.className = "jituChipJL"; el.setAttribute("role", "button");
          var gap = host.querySelector(":scope > .hldGapRowJL");
          host.insertBefore(el, gap || cv.nextSibling);
        }
        el.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); onChip(inst, ev); };
        inst._chipEl = el;
      }
      el.textContent = st.txt;
      el.style.setProperty("--jtc", st.col);
      el.style.display = "";
      inst._chip = { kind: st.kind, html: 1 }; /* 无坐标: 画布点击不再命中签 */
      return true;
    } catch (e) { return false; }
  }
  function chipCss() {
    if (document.getElementById("jituChipCssJL")) return;
    var st = document.createElement("style"); st.id = "jituChipCssJL";
    st.textContent = ".jituChipJL{display:block;width:max-content;max-width:calc(100% - 8px);box-sizing:border-box;margin:3px 0 3px 4px;padding:2px 9px;border-radius:9px;"
      + "border:1px solid var(--jtc,#81e6d9);background:rgba(8,20,28,.45);color:#fff;font:600 10.5px/14px -apple-system,'PingFang SC',sans-serif;"
      + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;-webkit-tap-highlight-color:transparent}"
      + "body.jituOffJL .jituChipJL{display:none!important}";
    (document.head || document.documentElement).appendChild(st);
  }
  function onChip(inst, ev) {
    var comp = _cache[inst.code], ch = inst._chip || {};
    if (comp && comp.marks && comp.marks.length) { showList(comp.marks, ev.clientX, ev.clientY, upToTxt(comp).replace(/^ · /, "")); return; }
    if (ch.kind === "retry") {
      var nc = _netCache[inst.code];
      if (nc) { nc.fail = 0; try { fetchMinuteNet(inst.code, nc.day); } catch (e) { } }
      jituToast("重新取分钟资金…"); return;
    }
    if (ch.kind === "none") jituToast("暂无信号" + upToTxt(comp) + " · 积仅10:30前, 突需窄幅蓄势后放量越上沿");
    else if (ch.kind === "short") jituToast("分钟数据不足24根, 暂不判定");
    else jituToast("分钟资金取数中, 到数自动补画");
  }

  function drawOverlay(inst) {
    try {
      var cv = inst.cv, api = inst.api;
      var g = cv.getContext("2d");
      var geo = api.geom();
      inst._hits = [];
      inst._chip = null;
      if (inst._chipEl) inst._chipEl.style.display = "none";
      
      if (!geo || !geo.n) { return; }

      if (!marksOn()) { return; }
      var hostSt = cv.closest ? cv.closest(".stock") : null;
      if (hostSt && !hostSt.classList.contains("active")) { return; } /* v6: 折叠窄卡不画标记(开关图标在窄卡隐藏, 显隐规则对齐; 窄卡geom与可视区错位, 画了也是飘点) */
      var code = inst.code, comp = _cache[code];
      var bars = inst.o && inst.o.bars ? inst.o.bars() : null;
      var nk = (bars ? bars.length : 0) + "|" + (bars && bars.length ? String(bars[bars.length - 1].t) : ""); /* 含末根t: 同根数末根更新也重算(评审#4) */
      if (!comp || comp.nk !== nk) {
        var c2 = jituCardCompute(code);
        if (c2) { c2.nk = nk; _cache[code] = comp = c2; } else comp = null; /* v4: 净额未到不缓存空壳, 取数到达经 redrawAll 重算 */
      }
      var mks = comp ? (comp.marks || []) : [];
      var stC = chipState(code, comp);
      if (!htmlChip(inst, stC)) drawChip(g, cv, inst, stC); /* v7: 常驻状态签, 无标/取数中/失败都看得见; v12: 持仓卡走图外 HTML 行 */
      if (!mks.length) return;
      /* time → 图上下标(容忍竞价前缀与缺行) */
      var tmap = {}, i2, tt;
      for (i2 = 0; i2 < geo.n; i2 += 1) { tt = geo.clockAt(i2); if (tt && tmap[tt] == null) tmap[tt] = i2; }
      var hits = inst._hits;
      var TEAL = "#81e6d9", AMBER = "#ffc24d", DEAD = "#7c8894";
      for (var q = 0; q < mks.length; q += 1) {
        var mk = mks[q], ii = tmap[mk.time];
        if (ii == null) continue;
        var x = geo.xOfIdx(ii), y, yv = geo.yOfPrice(mk.price);try { if (geo.prices && fin(geo.prices[ii])) yv = geo.yOfPrice(geo.prices[ii]); } catch (eY) { }

        g.textAlign = "center"; g.textBaseline = "middle";
        hits.push({ x: x, y: (mk.type === "积" ? yv + 7 : yv - 7), mk: mk });
        if (mk.type === "积") {
          y = yv + 7;
          g.beginPath(); g.arc(x, y, 3.4, 0, 6.2832);
          if (mk.dead) { g.fillStyle = DEAD; g.fill(); }
          else if (mk.st === "watch") { g.strokeStyle = TEAL; g.lineWidth = 1.4; g.stroke(); }
          else { g.fillStyle = TEAL; g.fill(); }
        } else {
          y = yv - 7;
          g.beginPath();
          g.moveTo(x, y - 4.2); g.lineTo(x + 4.6, y + 3.4); g.lineTo(x - 4.6, y + 3.4); g.closePath();
          if (mk.dead) { g.strokeStyle = DEAD; g.lineWidth = 1.2; g.stroke(); }
          else if (mk.st === "watch") { g.strokeStyle = AMBER; g.lineWidth = 1.2; g.stroke(); }
          else { g.fillStyle = AMBER; g.fill(); }
          if (mk.dead) { /* ✕ */
            g.strokeStyle = DEAD; g.lineWidth = 1.1;
            g.beginPath(); g.moveTo(x - 2.2, y - 2.2); g.lineTo(x + 2.2, y + 2.2); g.moveTo(x + 2.2, y - 2.2); g.lineTo(x - 2.2, y + 2.2); g.stroke();
          } else if (fin(mk.level)) { /* 区间上沿短虚线 */
            var yL = geo.yOfPrice(mk.level);
            if (fin(yL)) { g.save(); g.strokeStyle = "rgba(255,194,77,0.55)"; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(x - 26, yL); g.lineTo(x + 26, yL); g.stroke(); g.restore(); }
          }
        }
      }

    } catch (e) { }
  }

  global.jlJituHookJL = function (canvas, api, o) {
    try {
      if (!canvas || !api || !api.geom || !api.on) return;
      var code = null;
      if (o && typeof o.swingCode === "string") code = o.swingCode;
      if (!code) { var host = canvas.closest ? canvas.closest("[data-cardtrend]") : null; if (host) code = host.getAttribute("data-cardtrend"); }
      if (!code) return; /* 首页大盘分时等无分钟资金流的实例: 不挂 */
      var inst = { cv: canvas, api: api, o: o, code: code };
      inst.off = api.on(function () { drawOverlay(inst); });
      try { /* v3: 点 ●/▲ 弹触发价+原因小提示(命中才拦截, 不挡图上其他手势) */
        canvas.addEventListener("click", function (ev) {
          try {
            var hs = inst._hits || [], ch = inst._chip;
            if (!hs.length && !ch) return;
            var rc = canvas.getBoundingClientRect(); if (!rc || !rc.width || !rc.height) return;
            /* 引擎 g.scale(dpr,dpr): geom()/覆盖层绘图坐标已是 CSS px, 不再除 dpr(评审#3: dpr=3 手机命中偏 3 倍) */
            var cx = ev.clientX - rc.left, cy = ev.clientY - rc.top;
            if (ch && cx >= ch.x0 - 4 && cx <= ch.x1 + 4 && cy >= ch.y0 - 8 && cy <= ch.y1 + 8) { ev.preventDefault(); ev.stopPropagation(); onChip(inst, ev); return; } /* v7: 点状态签 */
            var best = null, bd = 1e9, i3;
            for (i3 = 0; i3 < hs.length; i3 += 1) {
              var dx = hs[i3].x - cx, dy = hs[i3].y - cy, d2 = dx * dx + dy * dy;
              if (d2 < bd) { bd = d2; best = hs[i3]; }
            }
            if (best && bd <= 15 * 15) { ev.preventDefault(); ev.stopPropagation(); showTip(best.mk, ev.clientX, ev.clientY); }
          } catch (eH) { }
        }, true);
      } catch (eB) { }
      drawOverlay(inst);
      pruneInsts(); _insts.push(inst);
    } catch (e) { }
  };

  function pruneInsts() { /* v11: 卡组重建后旧 canvas 已脱离页面, 清掉其实例(isConnected 不支持的老内核不清) */
    for (var k = _insts.length - 1; k >= 0; k -= 1) {
      var c = _insts[k].cv;
      if (c && c.isConnected === false) { try { if (typeof _insts[k].off === "function") _insts[k].off(); } catch (e) { } _insts.splice(k, 1); }
    }
  }
  function redrawAll() { pruneInsts(); for (var k = 0; k < _insts.length; k += 1) { try { _insts[k].api.redraw(); } catch (e) { } } }

  /* ============ v3: 点标小提示(类型/时间/触发价/reason) ============ */
  var _tipEl = null, _tipTm = 0;
  var _tToast = null, _tToastTm = 0;
  function toastCount() {
    var n = 0, k, c;
    for (k in _cache) { c = _cache[k]; if (c && c.marks) n += c.marks.length; }
    if (n > 0) return " · 当前 " + n + " 个信号";
    /* v6: 无信号再分两种——展开卡净额未取到(资金暂缺) vs 真没信号 */
    var act = document.querySelector ? document.querySelector(".stock.active [data-cardtrend]") : null;
    var acode = act ? act.getAttribute("data-cardtrend") : "";
    if (acode) { var nc = _netCache[acode]; if (!nc || !nc.net) return " · 分钟资金未取到, 取到自动补画"; }
    return " · 当前无信号";
  }
  function jituToast(txt) {
    try {
      if (_tToast) { clearTimeout(_tToastTm); _tToast.remove(); _tToast = null; }
      var d = document.createElement("div");
      d.textContent = txt;
      d.style.cssText = "position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:99999;background:rgba(8,20,28,.95);border:1px solid #81e6d955;border-radius:18px;padding:7px 16px;font:600 12px/1.2 -apple-system,'PingFang SC',sans-serif;color:#dffbf7;box-shadow:0 6px 18px #000a;pointer-events:none;white-space:nowrap";
      (document.body || document.documentElement).appendChild(d);
      _tToast = d; _tToastTm = setTimeout(function () { try { d.remove(); } catch (e) { } _tToast = null; }, 2400);
    } catch (e) { }
  }

  function hideTip() {
    if (_tipEl) { try { _tipEl.parentNode.removeChild(_tipEl); } catch (e) { } _tipEl = null; }
    if (_tipTm) { clearTimeout(_tipTm); _tipTm = 0; }
  }
  function tipCss() {
    if (document.getElementById("jituTipCssJL")) return;
    var st = document.createElement("style"); st.id = "jituTipCssJL";
    st.textContent = ".jituTipJL b{font:700 12px/1.5 -apple-system,'PingFang SC',sans-serif}"
      + ".jituTipJL span{display:block;font:600 11px/1.5 ui-monospace,Menlo,monospace;color:#eaf6f8}"
      + ".jituTipJL i{display:block;font:400 10px/1.55 -apple-system,'PingFang SC',sans-serif;color:#c8d8dc;font-style:normal;margin-top:2px}";
    (document.head || document.documentElement).appendChild(st);
  }
  /* v9(批4): 三态文案 */
  function stTxt(m) {
    if (m.st === "dead" || m.dead) return " · 已失效";
    if (m.st === "watch") return " · 观察中(还剩" + m.left + "根)";
    if (m.st === "done") return " · " + DEFAULT_CONFIG.invalidation.horizon_bars + "根满未失效";
    return "";
  }
  function showTip(mk, cx, cy) {
    try {
      hideTip(); tipCss();
      var col = mk.type === "积" ? "#81e6d9" : "#ffc24d";
      var d = document.createElement("div");
      d.className = "jituTipJL";
      d.innerHTML = '<b style="color:' + col + '">' + (mk.type === "积" ? "\u25CF" : "\u25B2") + " " + mk.type + "</b>"
        + "<span>" + (mk.time || "") + " · 触发 " + (fin(mk.price) ? mk.price.toFixed(2) : "—") + stTxt(mk) + "</span>"
        + "<i>" + String(mk.why || "").replace(/</g, "&lt;") + "</i>";
      d.style.cssText = "position:fixed;z-index:99998;max-width:240px;background:rgba(8,20,28,.96);border:1px solid " + col + "66;border-radius:9px;padding:7px 9px;box-shadow:0 6px 18px #000a;pointer-events:none";
      (document.body || document.documentElement).appendChild(d);
      var tw = d.offsetWidth, th = d.offsetHeight;
      d.style.left = Math.max(6, Math.min(cx - tw / 2, (global.innerWidth || 360) - tw - 6)) + "px";
      var y = cy - th - 14; if (y < 6) y = cy + 16;
      d.style.top = y + "px";
      _tipEl = d; _tipTm = setTimeout(hideTip, 6000);
    } catch (e) { }
  }

  /* v7: 全部信号列表(点状态签弹出; 点空白处收起, 复用 .jituTipJL 样式) */
  function showList(mks, cx, cy, sub) {
    try {
      hideTip(); tipCss();
      var esc = function (t) { return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
      var h = '<b style="color:#dffbf7">积/突信号 · 共 ' + mks.length + ' 个</b>' + (sub ? '<i>' + esc(sub) + '</i>' : ''), k, m, col; /* v10: 列表头注明确认至/资金滞后 */
      for (k = 0; k < mks.length; k += 1) {
        m = mks[k]; col = m.dead ? "#7c8894" : (m.type === "积" ? "#81e6d9" : "#ffc24d");
        h += '<span style="color:' + col + ';margin-top:5px">' + (m.type === "积" ? "\u25CF " : "\u25B2 ") + m.type + " " + (m.time || "") + " · 触发 " + (fin(m.price) ? m.price.toFixed(2) : "—") + stTxt(m) + "</span><i>" + esc(m.why) + "</i>";
      }
      var d = document.createElement("div");
      d.className = "jituTipJL"; d.innerHTML = h;
      d.style.cssText = "position:fixed;z-index:99998;max-width:260px;max-height:52vh;overflow:auto;background:rgba(8,20,28,.97);border:1px solid #81e6d966;border-radius:9px;padding:8px 10px;box-shadow:0 6px 18px #000a";
      (document.body || document.documentElement).appendChild(d);
      var tw = d.offsetWidth, th = d.offsetHeight;
      d.style.left = Math.max(6, Math.min(cx - tw / 2, (global.innerWidth || 360) - tw - 6)) + "px";
      var y = cy - th - 14; if (y < 6) y = Math.min(cy + 16, (global.innerHeight || 640) - th - 6);
      d.style.top = Math.max(6, y) + "px";
      _tipEl = d; _tipTm = setTimeout(hideTip, 12000);
    } catch (e) { }
  }

  /* ============ v3: 开关=卡头 16px 小图标(document 捕获委托; body.jituOffJL=关态, 卡组重建不丢态) ============ */
  function syncTogDom() {
    try {
      var b = document.body; if (!b) return;
      if (marksOn()) b.classList.remove("jituOffJL"); else b.classList.add("jituOffJL");
    } catch (e) { }
  }
  function bindTog() {
    try {
      if (document.__jituTogJL) return; document.__jituTogJL = 1;
      document.addEventListener("click", function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-jitutog]") : null;
        if (!t) { if (_tipEl && !(ev.target && ev.target.closest && ev.target.closest(".jituTipJL"))) hideTip(); return; }
        ev.preventDefault(); ev.stopPropagation();
        var nv = marksOn() ? "0" : "1";
        try { global.localStorage.setItem("jl_jitu_marks_v1", nv); } catch (e) { }
        _cache = {}; syncTogDom(); redrawAll();
        if (nv === "1") { jituToast("积/突标注 已开启" + toastCount()); } else { jituToast("积/突标注 已关闭"); }
      }, true);
      syncTogDom();
    } catch (e) { }
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { bindTog(); setTimeout(syncTogDom, 1500); });
    else { bindTog(); setTimeout(syncTogDom, 1500); }
  }

  /* ============ 导出(测试) ============ */
  var ex = { JituEngine: JituEngine, DEFAULT_CONFIG: DEFAULT_CONFIG, runSession: runSession, readFFMinuteNet: readFFMinuteNet, jituCardCompute: jituCardCompute, marksOn: marksOn, fetchMinuteNet: fetchMinuteNet, _insts: _insts, _netCache: _netCache };
  global.jlJituJL = ex;
  if (typeof module !== "undefined" && module.exports) module.exports = ex;
})(typeof window !== "undefined" ? window : globalThis);
