/* jl_cardfold.js v1 (2026-10-27, 本地稿未推送) —— 持仓卡右上角透明折叠按钮。
   折起来: 只留卡片顶上的股票名一行 + 现价/涨跌那一行, 分时图/缺口/下面各块都收起, 牌组高度跟着变矮, 下面的五日图跟着上移。
   每只票单独记住(localStorage jl_cardfold_v1), 刷新/重开 App 保持。只加 class 和一个按钮, 卡片里的内容和计算一行不改。
   卡片每 30 秒会被重建, 这里用 MutationObserver 每次重建后补回按钮和折叠状态。回滚: index.html 删 jl_cardfold.js 引用。 */
(function () {
  "use strict";
  const KEY = "jl_cardfold_v1";
  const CSS = ".cfBtnJL{position:absolute;top:5px;right:8px;z-index:6;width:24px;height:24px;padding:0;border-radius:50%;background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;font:800 12px/22px -apple-system,'PingFang SC',sans-serif;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}"
    + ".stock:not(.active) .cfBtnJL{display:none}"
    + ".stock.cfJL .stockContent>:not(.jlStWrapJL){display:none!important}"
    + ".stock.cfJL .jlStWrapJL .tvQuoteJL,.stock.cfJL .jlStWrapJL .sbTopJL{display:none!important}"
    + ".stock.cfJL .stockContent{overflow:hidden!important}"
    + "#deck.cfDeckJL{height:108px!important}";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } };
  const codeOf = (card) => { const m = (card.querySelector(".rail .name") || card).textContent.match(/\d{6}/); return m ? m[0] : ""; };
  function apply() {
    const deck = document.getElementById("deck"); if (!deck) return;
    const st = load();
    deck.querySelectorAll(":scope > .stock").forEach((card) => {
      const code = codeOf(card); if (!code) return;
      let b = card.querySelector(":scope > .cfBtnJL");
      if (!b) {
        b = document.createElement("button"); b.type = "button"; b.className = "cfBtnJL";
        const stop = (e) => e.stopPropagation();
        b.addEventListener("pointerdown", stop); b.addEventListener("touchstart", stop, { passive: true }); b.addEventListener("mousedown", stop);
        b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const o = load(), c = codeOf(card); if (o[c]) delete o[c]; else o[c] = 1; save(o); apply(); });
        card.appendChild(b);
      }
      const on = !!st[code];
      if (card.classList.contains("cfJL") !== on) card.classList.toggle("cfJL", on);
      const t = on ? "▾" : "▴", lb = on ? "展开这张持仓卡" : "折叠这张持仓卡";
      if (b.textContent !== t) b.textContent = t;
      if (b.getAttribute("aria-label") !== lb) b.setAttribute("aria-label", lb);
    });
    const act = deck.querySelector(":scope > .stock.active"), fold = !!(act && act.classList.contains("cfJL"));
    if (deck.classList.contains("cfDeckJL") !== fold) deck.classList.toggle("cfDeckJL", fold);
  }
  let raf = 0;
  const req = () => { if (!raf) raf = setTimeout(() => { raf = 0; try { apply(); } catch (e) { if (window.console) console.warn("[cardfold]", e); } }, 0); };   /* 不用 rAF: 页面在后台时 rAF 不跑, 按钮会补不上 */
  function start() {
    const deck = document.getElementById("deck"); if (!deck) { setTimeout(start, 500); return; }
    if (!document.getElementById("cfCssJL")) { const s = document.createElement("style"); s.id = "cfCssJL"; s.textContent = CSS; document.head.appendChild(s); }
    new MutationObserver(req).observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    req();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
