/* jl_holdclean.js v1 (2026-10-27, 本地稿未推送) —— 持仓页清理(用户 10-27 要求删的几块), 只隐藏不删代码, 背后计算照跑:
   ① ATR · Fib 里的「下跌情景」「上行情景」两段(和它们的「锚点未确认」状态行), 「开盘参考区」保留
   ② 「盘中 Fib 尺 · 验收样例 · 非实时」整块(假数字)
   ③ 「做T挂单 · 买卖记录」整块
   ④ 持仓页最下面「账户概览」单列卡 + 灰色小字说明
   ⑤ 每张持仓卡右上角「S1 / B1」两个小框(档位在下面日波段尺上已有)
   ⑥ 「我的持仓」标题右边的 PORTFOLIO 换成上证指数实时价(全页只这一处): 腾讯行情, 交易时段 5 秒一次, 其余 60 秒, 页面在后台不取
   回滚: index.html 删 jl_holdclean.js 引用。 */
(function () {
  "use strict";
  const CSS = ".stock .atrFibSectionJL:not(.atrFibOpenJL),.stock .atrFibStatusJL{display:none!important}"
    + ".stock .lowOpenJL.dualFibJL{display:none!important}"
    + ".stock .trJL{display:none!important}"
    + "#holds>.smallPrint,#holds>.jlAcctHideJL{display:none!important}"
    + ".stock .jlStWrapJL .sbTopJL{display:none!important}"
    + "#holds>.pageTitle .shIdxJL{font:800 13px/1.25 ui-monospace,Menlo,monospace;letter-spacing:0;text-align:right;color:#fff}"
    + "#holds>.pageTitle .shIdxJL small{display:block;font:700 10px -apple-system,'PingFang SC',sans-serif;letter-spacing:1px;color:#fff}"
    + "#holds>.pageTitle .shIdxJL .up{color:#ff6b6b}#holds>.pageTitle .shIdxJL .dn{color:#1fdc93}";
  /* 上证指数: 用腾讯 qt 接口(和 App 报价同源), script 注入读 window.v_sh000001 */
  let shBusy = 0, shLast = "";
  function shFetch() {
    if (shBusy || document.hidden) return; shBusy = 1;
    const sc = document.createElement("script"); sc.charset = "GBK";
    const done = () => { shBusy = 0; sc.remove(); };
    sc.onload = () => { try { shPaint(String(window.v_sh000001 || "").split("~")); } catch (e) { } done(); };
    sc.onerror = done; setTimeout(done, 8000);
    sc.src = "https://qt.gtimg.cn/q=sh000001&_t=" + Date.now(); document.head.appendChild(sc);
  }
  function shPaint(a) {
    const p = Number(a[3]), pc = Number(a[32]), ch = Number(a[31]); if (!(p > 0) || !Number.isFinite(pc)) return;
    const host = document.querySelector("#holds > .pageTitle"); if (!host) return;
    let el = host.querySelector(".shIdxJL");
    if (!el) { el = document.createElement("span"); el.className = "shIdxJL"; const old = host.querySelector(":scope > span"); if (old) old.replaceWith(el); else host.appendChild(el); }
    const cl = pc > 0 ? "up" : pc < 0 ? "dn" : "", t = String(a[30] || ""), hm = t.length >= 12 ? t.slice(8, 10) + ":" + t.slice(10, 12) : "";
    const h = "<small>上证指数" + (hm ? " " + hm : "") + "</small><b class=" + cl + ">" + p.toFixed(2) + "</b> <span class=" + cl + ">" + (pc >= 0 ? "+" : "") + pc.toFixed(2) + "%</span>";
    if (h !== shLast) { el.innerHTML = h; shLast = h; }
  }
  function shLoop() {
    shFetch();
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), w = d.getDay(), live = w > 0 && w < 6 && ((m >= 555 && m <= 690) || (m >= 780 && m <= 905));
    setTimeout(shLoop, live ? 5000 : 60000);
  }
  function hideAcct() {
    document.querySelectorAll("#holds > section.glass").forEach((s) => { const h = s.querySelector(":scope > h3"); if (h && /账户概览/.test(h.textContent)) s.classList.add("jlAcctHideJL"); });
  }
  function start() {
    if (!document.getElementById("hcCssJL")) { const s = document.createElement("style"); s.id = "hcCssJL"; s.textContent = CSS; document.head.appendChild(s); }
    hideAcct();
    shLoop();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) shFetch(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
