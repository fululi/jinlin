/* v4 2026-10-25: jl-1164 highModel扩展档负价防御过滤(配对index.html ?v=4)——数学上仅锚无效才可达, 顺手加上; 其余零改动(样例锚/跨日尺规则不动, 真锚接入属Mac侧正式批) */
(function (root) {
  "use strict";

  function model(high, low, price, lowTime) {
    high = Number(high); low = Number(low); price = Number(price);
    if (!(high > low && low > 0)) return null;
    const range = high - low;
    return {
      high, low, price, lowTime: lowTime || "",
      levels: [0.382, 0.618, 0.786].map(function (ratio) {
        return { ratio: ratio, price: low + range * ratio };
      }),
      position: (price - low) / range
    };
  }

  function afterNewLow(previous, newLow, newLowTime, price) {
    if (!previous || !(Number(newLow) < previous.low)) return previous;
    return model(previous.high, newLow, price, newLowTime);
  }

  function zone(m) {
    if (!m || !Number.isFinite(m.position)) return "";
    if (m.position < 0) return "现价低于当日低";
    if (m.position > 1) return "现价高于昨日高";
    if (m.position >= 0.382 && m.position <= 0.618) return "当前 0.382–0.618";
    return "当前回抽 " + m.position.toFixed(3);
  }

  const api = { model, afterNewLow, zone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LowOpenRebound = api;

  if (typeof document !== "undefined") {
    const f = function (v) { return Number(v).toFixed(2); };
    function activeLevel(m) {
      return m.levels.find(function (x) { return m.position < x.ratio && x.ratio - m.position <= 0.05; }) || m.levels.filter(function (x) { return m.position >= x.ratio; }).pop();
    }
    function levelsHTML(m) {
      const active = activeLevel(m);
      return '<div class="lowOpenLevelsJL">' + m.levels.map(function (x) {
        const marked = active && Math.abs(active.ratio - x.ratio) < 1e-9;
        return '<span>' + (marked ? '<i class="lowOpenArrowJL" aria-label="当前接近或已到">➤</i>' : '') + '<small>' + x.ratio.toFixed(3) + '</small><b>' + f(x.price) + '</b></span>';
      }).join("") + '</div>';
    }
    function highModel(d, price) {
      const m = model(d.high, d.low, price, d.lowTime);
      m.levels = [1.272, 1.618, 2.618].map(function (ratio) { return { ratio: ratio, price: d.low + (d.high - d.low) * ratio }; }).filter(function (x) { return Number.isFinite(x.price) && x.price > 0; }); /* jl-1164: 负价档不显示 */
      return m;
    }
    function highPanelHTML(mode, d, priceClass, hidden, price) {
      const m = highModel(d, price);
      return '<div class="highPanelJL" data-fib-panel="' + mode + '"' + (hidden ? ' hidden' : '') + '>' +
        '<div class="fibAnchorsJL"><span class="lowHighJL">1＝<b>' + f(m.high) + '</b><small>' + d.highTime + '</small></span><span class="lowLowJL">0＝<b>' + f(m.low) + '</b><small>' + d.lowTime + '</small></span></div>' +
        '<div class="lowOpenCurrentJL">现价 <b class="' + priceClass + '">' + f(m.price) + '</b></div>' + levelsHTML(m) +
        '<div class="lowOpenStateJL confirmed">' + d.state + '</div></div>';
    }
    root.lowOpenReboundHTMLJL = function (stock) {
      const code = stock && String(stock.code).replace(/^(sh|sz)/, "");
      const lows = { "600105": [29.88, 25.24, 27.92, "10:27"], "603986": [294.80, 268.30, 285.80, "10:13"] };
      const highs = {
        "600105": {
          day: { low: 28.55, high: 29.44, highTime: "09:35", lowTime: "09:50", state: "高低点确认" },
          cross: { low: 27.11, high: 28.34, highTime: "昨日", lowTime: "昨日", state: "跨日尺有效" }
        },
        "603986": {
          day: { low: 268.30, high: 279.50, highTime: "09:35", lowTime: "09:50", state: "高低点确认" },
          cross: { low: 268.30, high: 294.80, highTime: "昨日", lowTime: "昨日", state: "跨日尺有效" }
        }
      };
      const sample = lows[code], high = highs[code];
      if (!sample || !high) return "";
      const m = model(sample[0], sample[1], sample[2], sample[3]);
      const priceClass = Number(stock.pct) > 0 ? "up" : Number(stock.pct) < 0 ? "down" : "flat";
      const active = activeLevel(m), lowConfirmed = sample[4] === true;
      const stateText = stock.lowOpenApplicable === false ? "今日不适用" : lowConfirmed ? (active ? "低点确认" : "低点确认 · 今日未到档") : (active ? "低点未确认" : "低点未确认 · 今日不动");
      return '<details class="lowOpenJL dualFibJL foldJL" data-lowopen="' + code + '" open>' +
        '<summary><span><b>盘中 Fib 尺</b><small>验收样例 · 非实时</small></span><span class="lowOpenNowJL">低开 / 高开<i>双尺</i></span></summary>' +
        '<div class="lowOpenBodyJL"><div class="fibDualGridJL">' +
        '<section class="fibStackJL"><h4>低开回抽</h4>' +
        '<div class="fibAnchorsJL"><span class="lowHighJL">1＝<b>' + f(m.high) + '</b><small>昨日</small></span><span class="lowLowJL">0＝<b>' + f(m.low) + '</b><small>' + m.lowTime + '</small></span></div>' +
        '<div class="lowOpenCurrentJL">现价 <b class="' + priceClass + '">' + f(m.price) + '</b></div>' + levelsHTML(m) +
        '<div class="lowOpenStateJL ' + (stock.lowOpenApplicable === false ? "na" : lowConfirmed ? "confirmed" : "pending") + '">' + stateText + '</div></section>' +
        '<section class="fibStackJL highStackJL"><div class="highHeadJL"><h4>高开延伸</h4><span><button type="button" data-fib-mode="day" class="on">日内</button><button type="button" data-fib-mode="cross">跨日</button></span></div>' +
        highPanelHTML("day", high.day, priceClass, false, m.price) + highPanelHTML("cross", high.cross, priceClass, true, m.price) +
        '</section></div></div></details>';
    };
    if (!root.__fibDualModeBound) {
      document.addEventListener("click", function (event) {
        const button = event.target.closest && event.target.closest("[data-fib-mode]");
        if (!button) return;
        event.preventDefault(); event.stopPropagation();
        const card = button.closest("[data-lowopen]"), mode = button.dataset.fibMode;
        card.querySelectorAll("[data-fib-mode]").forEach(function (b) { b.classList.toggle("on", b === button); });
        card.querySelectorAll("[data-fib-panel]").forEach(function (p) { p.hidden = p.dataset.fibPanel !== mode; });
      });
      root.__fibDualModeBound = true;
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
