/* jl-hist1107 (2026-11-07): 永鼎持仓卡「历史对照沙盘」入口(Kimi 交付的 jl_hist_sandbox.js + jl_600105_m1.js).
   - 只在 600105 持仓卡的按钮行(.actions)加一个「历史沙盘」钮; 点了才懒加载两个文件(1分钟数据约0.9MB, 不拖慢开页).
   - 沙盘本身只读历史分钟: 不请求行情、不写持仓、不写 localStorage; 结果是固定规则样例, 只作参考.
   - 卡片重画后面板会收起, 再点一次即可. 回滚 = 删 index.html 里本文件那一行引用. */
(function () {
  'use strict';
  var CODE = '600105', loading = null;
  function load(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function ready() {
    if (window.JLHistSandbox && window.JL_YD_M1) return Promise.resolve();
    if (!loading) loading = (window.JL_YD_M1 ? Promise.resolve() : load('jl_600105_m1.js?v=1'))
      .then(function () { return window.JLHistSandbox ? null : load('jl_hist_sandbox.js?v=1'); })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function toggle(btn, card) {
    var box = card.querySelector('.jhsBoxJL');
    if (box) { var open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); return; }
    box = document.createElement('div'); box.className = 'jhsBoxJL'; box.style.cssText = 'margin:8px 0 4px';
    box.textContent = '历史分钟数据加载中…';
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    var acts = card.querySelector('.actions'); acts.parentNode.insertBefore(box, acts.nextSibling);
    btn.setAttribute('aria-expanded', 'true');
    ready().then(function () { box.textContent = ''; window.JLHistSandbox.mount(box, { code: CODE }); })
      .catch(function () { box.textContent = '历史数据没加载上, 稍后再点一次'; });
  }
  function scan() {
    var deck = document.getElementById('deck'); if (!deck) return;
    deck.querySelectorAll('article.stock[data-stock]').forEach(function (card) {
      var acts = card.querySelector('.actions'); if (!acts || acts.querySelector('[data-hist-sandbox]')) return;
      if (!acts.querySelector('[data-expand="' + CODE + '"]')) return;
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-hist-sandbox', CODE); b.setAttribute('aria-expanded', 'false');
      b.textContent = '历史沙盘';
      b.style.cssText = 'border:1px solid #f5c46b66;border-radius:9px;background:#f5c46b1f;color:#fff3d6';
      b.addEventListener('click', function (e) { e.stopPropagation(); toggle(b, card); });
      acts.appendChild(b);
    });
  }
  var q = false;
  function boot() {
    var deck = document.getElementById('deck'); if (!deck) return;
    new MutationObserver(function () { if (!q) { q = true; requestAnimationFrame(function () { q = false; scan(); }); } }).observe(deck, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
