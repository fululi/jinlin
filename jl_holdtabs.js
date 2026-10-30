/* jl_holdtabs.js v2 (2026-10-30, 本地稿未推送) —— 持仓切换条
 * 用户10-30: 左右滑卡不方便, 在分时上画趋势线还会被当成滑卡跳走; 五日图也要切换方便。
 * 做法: 持仓一览上方 + 五日图顶部各一排股票名, 点哪个就切到哪只(直接点 #deck 里对应的 .rail, 走原来的选股流程, 五日图本来就跟着当前持仓走)。
 * 只读 DOM, 零网络, 不写存储。回滚: 删 index.html 里本文件的 script 引用。 */
(function () {
  "use strict";
  var CSS = '.htabsJL{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:2px 2px 8px;touch-action:pan-x}' +
    '.htabsJL::-webkit-scrollbar{display:none}' +
    '.htabsJL button{flex:0 0 auto;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:5px 11px;font:700 12.5px -apple-system,"PingFang SC",sans-serif;white-space:nowrap}' +
    '.htabsJL button small{opacity:.75;font-weight:600;margin-left:3px;font-size:10px}' +
    '.htabsJL button.on{background:#ffd84a;color:#1a0508;border-color:#ffd84a}' +
    '#c5JL .htabsJL{position:relative;z-index:3;padding:0 3px 6px}' +
    /* 10-30: 选中靠后的票时前面几根竖条把卡片右半截挤出屏幕 → 选中卡=可视宽度整宽, 竖条移到屏外(换股用切换条或图外左右滑) */
    '#holds .deck .stock.active{flex:0 0 100%!important;max-width:100%}';
  function rails() { return Array.prototype.slice.call(document.querySelectorAll('#deck .rail')); }
  function items() {
    return rails().map(function (r) {
      var n = r.querySelector('.name'), sm = n && n.querySelector('small');
      var name = n ? (n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.nodeValue : n.textContent) : r.textContent;
      return { rail: r, name: String(name || '').trim(), code: sm ? String(sm.textContent).split(' ')[0] : '', on: r.getAttribute('aria-expanded') === 'true' };
    });
  }
  function sig(L) { return L.map(function (x) { return x.code + (x.on ? '*' : ''); }).join(','); }
  function fill(bar, L) {
    var s = sig(L);
    if (bar._sig === s) return;
    bar._sig = s;
    bar.innerHTML = '';
    L.forEach(function (x, k) {
      var b = document.createElement('button');
      b.type = 'button';
      if (x.on) b.className = 'on';
      b.setAttribute('aria-label', '切换到' + x.name);
      b.innerHTML = x.name.replace(/[<>&]/g, '') + '<small>' + String(k + 1).padStart(2, '0') + '</small>';
      b.onclick = function () {
        var cur = items()[k];
        if (cur && !cur.on) cur.rail.click();
        setTimeout(sync, 60);
      };
      bar.appendChild(b);
      if (x.on) setTimeout(function () { try { bar.scrollLeft = Math.max(0, b.offsetLeft - bar.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2); } catch (e) { } }, 0); /* 只滚切换条自己(scrollIntoView会连带把整页横移) */
    });
  }
  function ensure(id, parent, before) {
    var bar = document.getElementById(id);
    if (!bar && parent) {
      bar = document.createElement('div');
      bar.id = id; bar.className = 'htabsJL';
      parent.insertBefore(bar, before || parent.firstChild);
    }
    return bar;
  }
  function fit() { /* 把选中卡对齐到可视区左缘, 竖条留在屏外 */
    var d = document.getElementById('deck'), a = d && d.querySelector('.stock.active');
    if (!a) return;
    var x = a.offsetLeft - d.offsetLeft;
    if (a.offsetParent !== d.offsetParent) x = a.getBoundingClientRect().left - d.getBoundingClientRect().left + d.scrollLeft;
    if (Math.abs(d.scrollLeft - x) > 1) d.scrollLeft = x;
  }
  function sync() {
    try {
      if (!document.getElementById('htabsCssJL')) { var st = document.createElement('style'); st.id = 'htabsCssJL'; st.textContent = CSS; document.head.appendChild(st); }
      var L = items();
      var dw = document.querySelector('#holds .deckWrap');
      var a = dw && ensure('htabsDeckJL', dw.parentNode, dw);
      var c5 = document.getElementById('c5JL');
      var b = c5 && ensure('htabs5dJL', c5, c5.firstChild);
      [a, b].forEach(function (bar) { if (bar) { bar.hidden = L.length < 2; fill(bar, L); } });
      fit();
    } catch (e) { }
  }
  var t = 0;
  function later() { clearTimeout(t); t = setTimeout(sync, 120); }
  function watch() {
    var d = document.getElementById('deck');
    if (!d) return setTimeout(watch, 1000);
    new MutationObserver(later).observe(d, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] });
    sync();
  }
  watch();
  setInterval(sync, 3000);
  addEventListener('resize', later);
  window.JLHoldTabs = { sync: sync, fit: fit };
})();
