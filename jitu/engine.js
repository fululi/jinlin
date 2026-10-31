/* engine.js — 积／突外部信号引擎 JS 移植 v0.1.0
 *
 * 与 jitu_engine.py（Python v0.1.0）逐条对齐：
 * - compute_features：全部滚动窗口均要求满窗（min_periods=window），
 *   突破区间、基准中位数、setup 窗口均显式 shift(1)，杜绝未来数据；
 * - detect_signals：积／突状态机与冷却期逻辑一致；
 * - apply_invalidations：改为逐 bar 增量判定，与事后扫描结果等价
 *   （对每个信号只看 start..start+horizon-1，首个命中的 bar 即失效时间）。
 *
 * 用法（浏览器）：new JituEngine(config); engine.onBar(bar) 每分钟喂一根。
 * 用法（Node）：const { JituEngine } = require("./engine.js");
 */

(function (global) {
  "use strict";

  function safeDiv(num, den) {
    if (den === undefined || den === null || Math.abs(den) <= 1e-12) return NaN;
    return num / den;
  }

  function sum(arr) {
    let s = 0;
    for (let k = 0; k < arr.length; k += 1) s += arr[k];
    return s;
  }

  function mean(arr) { return arr.length ? sum(arr) / arr.length : NaN; }

  function maxOf(arr) {
    let m = -Infinity;
    for (let k = 0; k < arr.length; k += 1) if (arr[k] > m) m = arr[k];
    return m;
  }

  function minOf(arr) {
    let m = Infinity;
    for (let k = 0; k < arr.length; k += 1) if (arr[k] < m) m = arr[k];
    return m;
  }

  function median(arr) {
    if (!arr.length) return NaN;
    const sorted = arr.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // ── Python 格式化对齐 ──
  function pct0(x) { return (x * 100).toFixed(0) + "%"; }
  function pct2(x) { return (x * 100).toFixed(2) + "%"; }
  function f2(x) { return x.toFixed(2); }
  function f4(x) { return x.toFixed(4); }

  function hhmmss(tsIso) { return tsIso.slice(11, 19); }
  function hhmm(tsIso) { return tsIso.slice(11, 16); }
  function minutesOfDay(tsIso) {
    return Number(tsIso.slice(11, 13)) * 60 + Number(tsIso.slice(14, 16));
  }

  function JituEngine(config) {
    this.cfg = config;
    this.reset();
  }

  JituEngine.prototype.reset = function () {
    this.bars = [];
    this.features = [];
    this.signals = [];
    this.lastSignalBar = { "积": -1e9, "突": -1e9 };
    this.cumAmount = 0;
    this.cumVolume = 0;
    this.cumNet = 0;
    // 滚动窗口源数组
    this.sMainNet = [];
    this.sAmount = [];
    this.sHigh = [];
    this.sLow = [];
    this.sClose = [];
    this.sMainBuy = [];
    this.sMainNetPos = [];
  };

  // 窗口：大小 w，结束于 i（含）。不满窗返回 null（对应 pandas min_periods）。
  JituEngine.prototype._win = function (arr, i, w) {
    if (i - w + 1 < 0) return null;
    return arr.slice(i - w + 1, i + 1);
  };

  // 窗口：大小 w，结束于 i-1（对应 shift(1)）。
  JituEngine.prototype._winPrev = function (arr, i, w) {
    if (i - w < 0) return null;
    return arr.slice(i - w, i);
  };

  JituEngine.prototype._computeFeatures = function (i, bar) {
    const acc = this.cfg.accumulation;
    const brk = this.cfg.breakout;
    const multiplier = Number(this.cfg.volume_multiplier || 1);

    const mainNet = bar.main_buy - bar.main_sell;
    const adjustedVolume = bar.volume * multiplier;
    this.cumAmount += bar.amount;
    this.cumVolume += adjustedVolume;
    this.cumNet += mainNet;

    this.sMainNet.push(mainNet);
    this.sAmount.push(bar.amount);
    this.sHigh.push(bar.high);
    this.sLow.push(bar.low);
    this.sClose.push(bar.close);
    this.sMainBuy.push(bar.main_buy);
    this.sMainNetPos.push(mainNet > 0 ? 1 : 0);

    const accW = acc.window;
    const pullW = acc.pullback_lookback;
    const rngW = brk.range_window;
    const setW = brk.setup_window;

    const vwap = safeDiv(this.cumAmount, this.cumVolume);

    const winNet = this._win(this.sMainNet, i, accW);
    const winAmount = this._win(this.sAmount, i, accW);
    const winPos = this._win(this.sMainNetPos, i, accW);
    const accPositiveRatio = winPos ? mean(winPos) : NaN;
    const accNetAmountRatio = (winNet && winAmount)
      ? safeDiv(sum(winNet), sum(winAmount)) : NaN;
    let accCumNetSlope = NaN;
    if (i >= accW && winAmount) {
      // cumsum.diff(accW)：cum[i] - cum[i-accW] = 最近 accW 根 mainNet 之和
      const diffWindow = this.sMainNet.slice(i - accW + 1, i + 1);
      accCumNetSlope = safeDiv(sum(diffWindow), sum(winAmount));
    }

    const winHigh = this._win(this.sHigh, i, pullW);
    const recentHigh = winHigh ? maxOf(winHigh) : NaN;
    const drawdown = winHigh ? 1 - safeDiv(bar.close, recentHigh) : NaN;
    const closeToVwap = safeDiv(bar.close, vwap) - 1;

    const prevHighWin = this._winPrev(this.sHigh, i, rngW);
    const prevLowWin = this._winPrev(this.sLow, i, rngW);
    const prevAmountWin = this._winPrev(this.sAmount, i, rngW);
    const prevBuyWin = this._winPrev(this.sMainBuy, i, rngW);
    const priorHigh = prevHighWin ? maxOf(prevHighWin) : NaN;
    const priorLow = prevLowWin ? minOf(prevLowWin) : NaN;
    const priorRangePct = prevHighWin
      ? safeDiv(priorHigh - priorLow, this.sClose[i - 1]) : NaN;
    const amountRatio = prevAmountWin ? safeDiv(bar.amount, median(prevAmountWin)) : NaN;
    const buyRatio = prevBuyWin ? safeDiv(bar.main_buy, median(prevBuyWin)) : NaN;
    const currentNetAmountRatio = safeDiv(mainNet, bar.amount);

    const setupNetWin = this._winPrev(this.sMainNet, i, setW);
    const setupAmountWin = this._winPrev(this.sAmount, i, setW);
    const setupPosWin = this._winPrev(this.sMainNetPos, i, setW);
    const setupNetAmountRatio = (setupNetWin && setupAmountWin)
      ? safeDiv(sum(setupNetWin), sum(setupAmountWin)) : NaN;
    const setupPositiveRatio = setupPosWin ? mean(setupPosWin) : NaN;

    return {
      ts: bar.ts, symbol: bar.symbol, session: bar.session,
      close: bar.close, low: bar.low, mainNet: mainNet,
      vwap: vwap, cumMainNet: this.cumNet,
      accPositiveRatio: accPositiveRatio,
      accNetAmountRatio: accNetAmountRatio,
      accCumNetSlope: accCumNetSlope,
      drawdownFromRecentHigh: drawdown,
      closeToVwap: closeToVwap,
      priorHigh: priorHigh, priorLow: priorLow,
      priorRangePct: priorRangePct,
      amountRatio: amountRatio, buyRatio: buyRatio,
      currentNetAmountRatio: currentNetAmountRatio,
      setupPositiveRatio: setupPositiveRatio,
      setupNetAmountRatio: setupNetAmountRatio,
      state: "", signal: "", signalReason: "",
    };
  };

  JituEngine.prototype._finite = function (f, fields) {
    for (let k = 0; k < fields.length; k += 1) {
      const v = f[fields[k]];
      if (v === undefined || v === null || !isFinite(v)) return false;
    }
    return true;
  };

  JituEngine.prototype._detect = function (i, f, bar) {
    const acc = this.cfg.accumulation;
    const brk = this.cfg.breakout;
    const fired = [];
    const cutoffMinutes = minutesOfDay("2000-01-01T" + acc.before + ":00");

    if (i < acc.min_history) return fired;

    // ── 积：持续流入后的价格承接 ──
    if (minutesOfDay(f.ts) <= cutoffMinutes
        && i - this.lastSignalBar["积"] >= acc.cooldown_bars) {
      const required = ["accPositiveRatio", "accNetAmountRatio", "accCumNetSlope",
        "drawdownFromRecentHigh", "closeToVwap", "vwap"];
      if (this._finite(f, required)) {
        const dd = f.drawdownFromRecentHigh;
        const accConditions = (
          f.accPositiveRatio >= acc.min_positive_ratio
          && f.accNetAmountRatio >= acc.min_net_amount_ratio
          && f.accCumNetSlope > 0
          && f.mainNet > 0
          && acc.min_drawdown_pct <= dd && dd <= acc.max_drawdown_pct
          && f.closeToVwap >= -acc.vwap_tolerance_pct
        );
        if (accConditions) {
          const level = isFinite(f.priorLow) ? f.priorLow : bar.low;
          const reason = (
            acc.window + "柱资金阳性占比" + pct0(f.accPositiveRatio) + "，"
            + "净流入/成交额" + pct2(f.accNetAmountRatio) + "；"
            + "价格回撤" + pct2(dd) + "，仍在VWAP容差内"
          );
          const sig = this._makeSignal(f, bar, i, "积", f.close, level, reason);
          fired.push(sig);
          this.lastSignalBar["积"] = i;
          f.signal = "积";
          f.signalReason = reason;
          f.state = "承接";
        }
      }
    }

    // ── 突：有资金铺垫的区间突破 ──
    if (i < brk.min_history) return fired;
    if (i - this.lastSignalBar["突"] < brk.cooldown_bars) return fired;
    const required = ["priorHigh", "priorRangePct", "amountRatio", "buyRatio",
      "currentNetAmountRatio", "setupPositiveRatio", "setupNetAmountRatio",
      "closeToVwap", "vwap"];
    if (!this._finite(f, required)) return fired;

    const prevClose = this.sClose[i - 1];
    const prevPriorHigh = this.features[i - 1].priorHigh;
    const crossed = (
      f.close > f.priorHigh
      && isFinite(prevPriorHigh)
      && prevClose <= prevPriorHigh
    );
    const breakoutConditions = (
      crossed
      && f.priorRangePct <= brk.max_prior_range_pct
      && f.amountRatio >= brk.min_amount_ratio
      && f.buyRatio >= brk.min_buy_ratio
      && f.currentNetAmountRatio >= brk.min_current_net_amount_ratio
      && f.setupPositiveRatio >= brk.min_setup_positive_ratio
      && f.setupNetAmountRatio >= brk.min_setup_net_amount_ratio
      && f.close > f.vwap
      && f.closeToVwap <= brk.max_vwap_extension_pct
    );
    if (breakoutConditions) {
      const level = f.priorHigh;
      const reason = (
        "前" + brk.range_window + "柱振幅" + pct2(f.priorRangePct) + "；"
        + "成交额放大" + f2(f.amountRatio) + "倍、主动大买放大" + f2(f.buyRatio) + "倍；"
        + "收盘越过区间上沿" + f4(level)
      );
      const sig = this._makeSignal(f, bar, i, "突", f.close, level, reason);
      fired.push(sig);
      this.lastSignalBar["突"] = i;
      f.signal = f.signal ? f.signal + "+突" : "突";
      f.signalReason = reason;
      f.state = "突破";
    } else if (
      f.priorRangePct <= brk.max_prior_range_pct
      && f.setupNetAmountRatio >= brk.min_setup_net_amount_ratio
      && f.setupPositiveRatio >= brk.min_setup_positive_ratio
      && !f.state
    ) {
      f.state = "蓄势";
    }
    return fired;
  };

  JituEngine.prototype._makeSignal = function (f, bar, i, kind, price, level, reason) {
    const sig = {
      signalId: f.symbol + "_" + f.session + "_" + kind + "_" + hhmmss(f.ts).replace(/:/g, ""),
      symbol: f.symbol, session: f.session, ts: f.ts,
      type: kind, price: price, level: level, reason: reason,
      barIndex: i, invalidated: false,
      invalidatedAt: null, invalidationReason: "",
    };
    this.signals.push(sig);
    return sig;
  };

  // 逐 bar 增量失效判定：与 Python 事后扫描等价。
  JituEngine.prototype._checkInvalidations = function (j) {
    const inv = this.cfg.invalidation;
    const horizon = inv.horizon_bars;
    const threshold = inv.max_forward_net_amount_ratio;
    const results = [];
    for (let s = 0; s < this.signals.length; s += 1) {
      const sig = this.signals[s];
      if (sig.invalidated) continue;
      const start = sig.barIndex + 1;
      if (j < start || j >= start + horizon) continue;
      const bar = this.bars[j];
      let reason = "";
      if (bar.close < sig.level) {
        reason = sig.type === "突" ? "跌回突破区间" : "跌破承接区";
      } else {
        let netSum = 0;
        let amountSum = 0;
        for (let k = start; k <= j; k += 1) {
          netSum += this.sMainNet[k];
          amountSum += this.sAmount[k];
        }
        if (amountSum > 0) {
          const forwardNetRatio = netSum / amountSum;
          if (forwardNetRatio <= threshold) reason = "信号后资金转为流出";
        }
      }
      if (reason) {
        sig.invalidated = true;
        sig.invalidatedAt = bar.ts;
        sig.invalidationReason = reason;
        results.push(sig);
      }
    }
    return results;
  };

  // 喂入一根分钟 bar；返回本 bar 的特征、触发的信号与失效事件。
  JituEngine.prototype.onBar = function (bar) {
    const i = this.bars.length;
    this.bars.push(bar);
    const f = this._computeFeatures(i, bar);
    this.features.push(f);
    const signals = this._detect(i, f, bar);
    const invalidations = this._checkInvalidations(i);
    return { index: i, features: f, signals: signals, invalidations: invalidations };
  };

  JituEngine.prototype.hhmm = function (ts) { return hhmm(ts); };

  const exportsObj = { JituEngine: JituEngine, hhmm: hhmm, safeDiv: safeDiv };
  global.JituEngine = JituEngine;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObj;
  }
})(typeof window !== "undefined" ? window : globalThis);
