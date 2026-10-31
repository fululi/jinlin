/* jl_jitu.js v1 — jl-1227 (2026-10-31): 积/突信号覆盖层, 独立模块
 * 引擎 = jitu_engine.py v0.1.0 的 JS 移植(与「积突实时分时」交付版 engine.js 同源, 已经 Python 逐字段校验+三场景回放验证;
 *        配置键名与该版 data.js 完全一致, 回归测试直接复用三场景期望信号);
 * 数据 = 纯只读复用站内既有缓存, 零新增请求: 分钟行 window.jlM1RowsJL(东财1分通道, 含 f57 真成交额) + localStorage jl_ff_v1
 *        的分钟主力净额(东财 fflow kline klt=1 累计值, 相邻微分=每分钟净额; 缺失时该 bar 净额记 0 → 门控自然不过, 不出假信号);
 * 语义 = 积: 早盘资金持续流入+价格回撤承接(VWAP 未破容差); 突: 有资金铺垫的区间突破(量额+主动买同步放大+收盘越上沿);
 *        触发后 horizon 内跌回区间/资金转流出 → 记失效(灰显✕), 不删原信号;
 * 画法 = createCardIntraday 钩子行(index.html 唯一插入) → window.jlJituHookJL(canvas, api, o):
 *        api.on() 订阅重画 + api.geom() 只读坐标快照, 引擎每次重画(画布已重置)通知后把标记补绘在同一画布上
 *        (PHVLCross/JLRegrCh 同款只读原则: 不改任何价格/坐标/信号计算, geo 失效时自动跳过);
 * 单位 = volume(手)×100=股, vwap=Σ额/Σ股; 主买/主卖 由 (额±净)/2 分解(与引擎数据契约 buy+sell=amount 严格自洽);
 * 开关 = 持仓页 boardTools [积·标] 钮, 状态存 localStorage jl_jitu_marks_v1(默认开); [积突] 钮开独立监控页 jitu/;
 * 回滚 = 删 index.html: script 引用行 + 两个按钮 + createCardIntraday 钩子行 + jlM1RowsJL 取数行, 即整批消失。 */
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
        f.close_to_vwap >= -ac.vwap_tolerance_pct) {
      this.signals.push({ type: "积", start: i, ts: bar.ts, time: hhmm(bar.ts), price: bar.close, level: fin(f.prior_low) ? f.prior_low : bar.low,
        reason: "近" + ac.window + "分钟资金持续净流入+价格自高点回撤" + (f.drawdown * 100).toFixed(1) + "%且未破VWAP容差" });
      this._last["积"] = i;
    }
    /* ---- 突 ---- */
    var prev = i > 0 ? this.bars[i - 1] : null, prevF = i > 0 ? this.f[i - 1] : null;
    var crossed = prev && prevF && fin(f.prior_high) && fin(prevF.prior_high) && fin(prev.close) &&
      bar.close > f.prior_high && prev.close <= prevF.prior_high;
    if (i >= bk.min_history && (i - this._last["突"]) >= bk.cooldown_bars && crossed &&
        fin(f.prior_range_pct) && f.prior_range_pct <= bk.max_prior_range_pct &&
        fin(f.amount_ratio) && fin(f.buy_ratio) && fin(f.current_net_amount_ratio) && fin(f.setup_positive_ratio) && fin(f.setup_net_ratio) && fin(f.close_to_vwap) &&
        f.amount_ratio >= bk.min_amount_ratio && f.buy_ratio >= bk.min_buy_ratio && f.current_net_amount_ratio >= bk.min_current_net_amount_ratio &&
        f.setup_positive_ratio >= bk.min_setup_positive_ratio && f.setup_net_ratio >= bk.min_setup_net_amount_ratio &&
        f.close_to_vwap > 0 && f.close_to_vwap <= bk.max_vwap_extension_pct) {
      this.signals.push({ type: "突", start: i, ts: bar.ts, time: hhmm(bar.ts), price: bar.close, level: f.prior_high,
        reason: "前" + bk.range_window + "柱振幅" + (f.prior_range_pct * 100).toFixed(2) + "%；成交额放大" + f.amount_ratio.toFixed(2) + "倍、主动大买放大" + f.buy_ratio.toFixed(2) + "倍；收盘越过区间上沿" + f.prior_high });
      this._last["突"] = i;
    }
    /* ---- 失效(增量: 本 bar 判结 horizon 内的既有信号; 与事后扫描等价) ---- */
    var h = this.cfg.invalidation.horizon_bars, mx = this.cfg.invalidation.max_forward_net_amount_ratio, s, k, j, ns, as, fv, hit;
    for (k = 0; k < this.signals.length; k += 1) {
      s = this.signals[k];
      if (s.invalidatedAt != null || i <= s.start || i > s.start + h) continue;
      hit = null;
      if (fin(bar.close) && fin(s.level) && bar.close < s.level) hit = "跌回突破区间";
      else {
        ns = 0; as = 0;
        for (j = s.start + 1; j <= i; j += 1) { ns += (this.f[j] && fin(this.f[j].main_net)) ? this.f[j].main_net : 0; as += (this.bars[j] && fin(this.bars[j].amount)) ? this.bars[j].amount : 0; }
        fv = safeDiv(ns, as);
        if (fin(fv) && fv <= mx) hit = "信号后资金转为流出";
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
    var net = readFFMinuteNet(code, day);
    if (!net) return null; /* 无分钟资金流 → 不出信号(宁缺勿假) */
    var bars = [], idx = [], i, r, cl, am, mn, tN;
    for (i = 0; i < rows.length; i += 1) {
      r = rows[i];
      tN = jituNormT(r.t);
      if (tN.slice(0, 10) !== day) continue;
      cl = Number(r.c);
      am = (fin(r.a) && r.a > 0) ? Number(r.a) : ((fin(r.v) && fin(r.c)) ? Number(r.v) * 100 * Number(r.c) : NaN); /* f57真额优先; 腾讯备口无额→量×100×价近似(与站内分钟DDX同口径) */
      if (!fin(cl) || !fin(am) || am <= 0) continue;
      mn = fin(net[tN.slice(11, 16)]) ? net[tN.slice(11, 16)] : 0;
      bars.push({ ts: tN.slice(11, 16), close: cl, high: Number(r.h) || cl, low: Number(r.l) || cl, volume: Number(r.v) || 0, amount: am, main_buy: (am + mn) / 2, main_sell: (am - mn) / 2 });
      idx.push(i);
    }
    if (bars.length < 24) return null;
    var res = runSession(bars);
    var mk = [], s, k;
    for (k = 0; k < res.signals.length; k += 1) {
      s = res.signals[k];
      mk.push({ type: s.type, time: s.time, price: s.price, level: s.level, rowIdx: idx[s.start], dead: s.invalidatedAt != null, why: s.invalidatedWhy || s.reason });
    }
    return { marks: mk, day: day, n: rows.length };
  }

  /* ============ 覆盖层(挂 createCardIntraday) ============ */
  var _insts = [], _cache = {};
  function marksOn() { try { return (global.localStorage.getItem("jl_jitu_marks_v1") || "1") !== "0"; } catch (e) { return true; } }

  function drawOverlay(inst) {
    try {
      var cv = inst.cv, api = inst.api;
      var g = cv.getContext("2d");
      var geo = api.geom();
      if (!geo || !geo.n) { return; } /* 数据不足/隐藏: 引擎已清画布, 不补画 */
      if (!marksOn()) { return; }
      var code = inst.code, comp = _cache[code];
      var bars = inst.o && inst.o.bars ? inst.o.bars() : null;
      var nk = (bars ? bars.length : 0);
      if (!comp || comp.nk !== nk) {
        comp = jituCardCompute(code);
        if (!comp) comp = { marks: [], day: "", n: 0, nk: nk };
        comp.nk = nk;
        _cache[code] = comp;
      }
      var mks = comp.marks || [];
      if (!mks.length) return;
      /* time → 图上下标(容忍竞价前缀与缺行) */
      var tmap = {}, i2, tt;
      for (i2 = 0; i2 < geo.n; i2 += 1) { tt = geo.clockAt(i2); if (tt && tmap[tt] == null) tmap[tt] = i2; }
      var TEAL = "#81e6d9", AMBER = "#ffc24d", DEAD = "#7c8894";
      for (var q = 0; q < mks.length; q += 1) {
        var mk = mks[q], ii = tmap[mk.time];
        if (ii == null) continue;
        var x = geo.xOfIdx(ii), y, yv = geo.yOfPrice(mk.price);
        g.textAlign = "center"; g.textBaseline = "middle";
        if (mk.type === "积") {
          y = yv + 13;
          g.beginPath(); g.arc(x, y, 3.4, 0, 6.2832);
          g.fillStyle = mk.dead ? DEAD : TEAL; g.fill();
        } else {
          y = yv - 13;
          g.beginPath();
          g.moveTo(x, y - 4.2); g.lineTo(x + 4.6, y + 3.4); g.lineTo(x - 4.6, y + 3.4); g.closePath();
          if (mk.dead) { g.strokeStyle = DEAD; g.lineWidth = 1.2; g.stroke(); }
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
      drawOverlay(inst);
      _insts.push(inst);
    } catch (e) { }
  };

  function redrawAll() { for (var k = 0; k < _insts.length; k += 1) { try { _insts[k].api.redraw(); } catch (e) { } } }

  /* ============ 按钮(持仓页 boardTools) ============ */
  function bindBtns() {
    try {
      var bOpen = document.getElementById("jituOpenJL"), bMark = document.getElementById("jituMarkJL");
      if (bOpen && !bOpen.__jitu) {
        bOpen.__jitu = 1;
        bOpen.addEventListener("click", function () { global.open("jitu/", "_blank"); });
      }
      if (bMark && !bMark.__jitu) {
        bMark.__jitu = 1;
        var sync = function () { bMark.classList.toggle("on", marksOn()); bMark.setAttribute("aria-pressed", marksOn() ? "true" : "false"); };
        bMark.addEventListener("click", function () {
          var nv = marksOn() ? "0" : "1";
          try { global.localStorage.setItem("jl_jitu_marks_v1", nv); } catch (e) { }
          _cache = {}; sync(); redrawAll();
        });
        sync();
      }
    } catch (e) { }
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { bindBtns(); setTimeout(bindBtns, 1500); });
    else { bindBtns(); setTimeout(bindBtns, 1500); }
  }

  /* ============ 导出(测试) ============ */
  var ex = { JituEngine: JituEngine, DEFAULT_CONFIG: DEFAULT_CONFIG, runSession: runSession, readFFMinuteNet: readFFMinuteNet, jituCardCompute: jituCardCompute, marksOn: marksOn };
  global.jlJituJL = ex;
  if (typeof module !== "undefined" && module.exports) module.exports = ex;
})(typeof window !== "undefined" ? window : globalThis);
