/* jl_homelayout.js v1 (2026-11-10) — 首页卡片自己排版(学东财「自定义」)
 * 首页标题右边「⚙ 排版」→ 弹出列表: 按住 ≡ 上下拖(或点 ↑↓)换位置; 每块选 正常 / 紧凑 / 收起; 点「确定」生效, 「恢复默认」回原样。
 * 实现: #home 改成竖排 flex, 只改 CSS order, 不搬 DOM(别的代码按 indexList 后插卡照常工作)。
 * 存 jl_homelay_v1 = {ord:[key...], sz:{key:'n'|'s'|'c'}}。收起的块只剩一条「▸ 名字」, 点它展开。
 * 回滚: index.html 删引用本文件那一行。
 */
(function () {
  var KEY = 'jl_homelay_v1';
  var BLK = [
    { k: 'sw', n: '今日一眼 / 盘前决策', q: ['#jlHomeSwJL', '#jlGlance', '#premarketJL'] },
    { k: 'mood', n: '市场情绪', q: ['#jlv2root'] },
    { k: 'funds', n: '市场资金', q: ['#marketFundsEntry', '#marketFundsPanel'] },
    { k: 'chart', n: '上证图 + IV缺口 + 异动', q: ['.homeQuote', '.homeViewSw', '.homeChartWrap', '.times', '[data-period-bar]', '.previewActions', '#homeGapTogJL', '#homeGapJL', '#yiDongJL'], noC: 1 }
  ];
  var DEF = BLK.map(function (b) { return b.k; });
  function load() { var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { } s = s || {}; var o = (s.ord || []).filter(function (k) { return DEF.indexOf(k) >= 0; }); DEF.forEach(function (k) { if (o.indexOf(k) < 0) o.push(k); }); return { ord: o, sz: s.sz || {} }; }
  function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function byK(k) { for (var i = 0; i < BLK.length; i++) if (BLK[i].k === k) return BLK[i]; }
  var CSS = '#home:not([hidden]){display:flex;flex-direction:column}#home>.pageTitle{order:-20}#home>#indexList{order:-19}#home>*{order:900}' +
    '#home .hlCmpJL{zoom:.86}#home .hlHidJL{display:none!important}' +
    '.hlBarJL{display:flex;align-items:center;gap:6px;width:100%;margin:0 0 8px;padding:8px 12px;border:1px solid rgba(255,255,255,.35);border-radius:14px;background:rgba(8,15,26,.52);color:#fff;font-size:12.5px;font-weight:700;text-align:left;min-height:0}' +
    '#hlBtnJL{margin-left:auto;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.06);color:#fff;border-radius:9px;padding:3px 9px;font-size:11.5px;font-weight:700;min-height:0;min-width:0}' +
    '#hlSheetJL{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end}#hlSheetJL .bx{width:100%;max-height:80vh;overflow:auto;background:#0d1730;border-radius:18px 18px 0 0;border-top:1px solid rgba(255,255,255,.3);padding:14px 14px calc(14px + env(safe-area-inset-bottom));color:#fff}' +
    '#hlSheetJL h4{margin:0 0 10px;font-size:15px;display:flex;justify-content:space-between;align-items:center}#hlSheetJL h4 button{border:0;background:none;color:#9fd8e6;font-size:12px;min-height:0}' +
    '#hlSheetJL .it{display:flex;align-items:center;gap:8px;padding:9px 8px;margin-bottom:6px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);touch-action:none;user-select:none;-webkit-user-select:none}#hlSheetJL .it.drag{background:rgba(255,255,255,.16);box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
    '#hlSheetJL .hd{font-size:18px;padding:0 4px;cursor:grab}#hlSheetJL .nm{flex:1;font-size:13px;font-weight:700}#hlSheetJL .ar{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:7px;width:28px;height:26px;padding:0;min-height:0;min-width:0}' +
    '#hlSheetJL .sg{display:flex;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.2)}#hlSheetJL .sg button{border:0;background:none;color:#fff;opacity:.55;font-size:11px;padding:4px 7px;min-height:0;min-width:0}#hlSheetJL .sg button.on{background:rgba(255,255,255,.18);opacity:1}' +
    '#hlSheetJL .ok{display:block;width:100%;margin-top:10px;border:0;border-radius:12px;padding:11px;background:#2a7de1;color:#fff;font-size:14px;font-weight:800}';
  function els(b) { var h = document.getElementById('home'), r = []; if (!h) return r; b.q.forEach(function (q) { Array.prototype.forEach.call(h.querySelectorAll(':scope > ' + q), function (e) { if (r.indexOf(e) < 0) r.push(e); }); }); return r; }
  function apply() {
    var h = document.getElementById('home'); if (!h) return;
    if (!document.getElementById('hlCssJL')) { var s = document.createElement('style'); s.id = 'hlCssJL'; s.textContent = CSS; document.head.appendChild(s); }
    var S = load();
    S.ord.forEach(function (k, i) {
      var b = byK(k), o = (i + 1) * 10, sz = S.sz[k] || 'n', E = els(b);
      E.forEach(function (e) { e.style.order = o + 1; e.classList.toggle('hlCmpJL', sz === 's' && !b.noC); e.classList.toggle('hlHidJL', sz === 'c'); });
      var bar = h.querySelector(':scope > .hlBarJL[data-k="' + k + '"]');
      if (sz === 'c') {
        if (!bar) { bar = document.createElement('button'); bar.type = 'button'; bar.className = 'hlBarJL'; bar.setAttribute('data-k', k); bar.innerHTML = '▸ ' + b.n; bar.onclick = function () { var S2 = load(); S2.sz[k] = 'n'; save(S2); apply(); }; h.appendChild(bar); }
        bar.style.order = o;
      } else if (bar) bar.remove();
    });
    var t = h.querySelector(':scope > .pageTitle');
    if (t && !document.getElementById('hlBtnJL')) { t.style.display = 'flex'; t.style.alignItems = 'center'; var bt = document.createElement('button'); bt.type = 'button'; bt.id = 'hlBtnJL'; bt.textContent = '⚙ 排版'; bt.onclick = openSheet; t.appendChild(bt); }
  }
  function openSheet() {
    var S = load(), W = { ord: S.ord.slice(), sz: JSON.parse(JSON.stringify(S.sz)) };
    var sh = document.createElement('div'); sh.id = 'hlSheetJL';
    sh.innerHTML = '<div class="bx"><h4><span>首页排版</span><button type="button" data-a="reset">恢复默认</button></h4><div class="ls"></div><button type="button" class="ok" data-a="ok">确定</button></div>';
    document.body.appendChild(sh);
    var ls = sh.querySelector('.ls');
    function row(k) {
      var b = byK(k), sz = W.sz[k] || 'n', opt = [['n', '正常']].concat(b.noC ? [] : [['s', '紧凑']]).concat([['c', '收起']]);
      return '<div class="it" data-k="' + k + '"><span class="hd">≡</span><span class="nm">' + b.n + '</span><span class="sg">' + opt.map(function (o) { return '<button type="button" data-sz="' + o[0] + '" class="' + (sz === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</span><button type="button" class="ar" data-mv="-1">↑</button><button type="button" class="ar" data-mv="1">↓</button></div>';
    }
    function paint() { ls.innerHTML = W.ord.map(row).join(''); }
    paint();
    sh.addEventListener('click', function (e) {
      var t = e.target; if (t === sh) { sh.remove(); return; }
      var a = t.getAttribute && t.getAttribute('data-a'), it = t.closest && t.closest('.it'), k = it && it.getAttribute('data-k');
      if (a === 'ok') { save(W); sh.remove(); apply(); return; }
      if (a === 'reset') { W = { ord: DEF.slice(), sz: {} }; paint(); return; }
      if (t.hasAttribute && t.hasAttribute('data-sz') && k) { W.sz[k] = t.getAttribute('data-sz'); paint(); return; }
      if (t.hasAttribute && t.hasAttribute('data-mv') && k) { var i = W.ord.indexOf(k), j = i + +t.getAttribute('data-mv'); if (j >= 0 && j < W.ord.length) { W.ord.splice(i, 1); W.ord.splice(j, 0, k); paint(); } }
    });
    /* 按住 ≡ 拖动换位 */
    var drag = null;
    ls.addEventListener('pointerdown', function (e) {
      var hd = e.target.closest && e.target.closest('.hd'); if (!hd) return;
      var it = hd.closest('.it'); drag = { it: it, k: it.getAttribute('data-k'), y: e.clientY }; it.classList.add('drag'); try { ls.setPointerCapture(e.pointerId); } catch (er) { } e.preventDefault();
    });
    ls.addEventListener('pointermove', function (e) {
      if (!drag) return; var dy = e.clientY - drag.y; drag.it.style.transform = 'translateY(' + dy + 'px)';
      var i = W.ord.indexOf(drag.k), hgt = drag.it.offsetHeight + 6;
      if (dy > hgt * 0.6 && i < W.ord.length - 1) { W.ord.splice(i, 1); W.ord.splice(i + 1, 0, drag.k); drag.y += hgt; re(); }
      else if (dy < -hgt * 0.6 && i > 0) { W.ord.splice(i, 1); W.ord.splice(i - 1, 0, drag.k); drag.y -= hgt; re(); }
      function re() { paint(); var n = ls.querySelector('.it[data-k="' + drag.k + '"]'); n.classList.add('drag'); drag.it = n; n.style.transform = 'translateY(' + (e.clientY - drag.y) + 'px)'; }
    });
    function end() { if (!drag) return; drag.it.classList.remove('drag'); drag.it.style.transform = ''; drag = null; }
    ls.addEventListener('pointerup', end); ls.addEventListener('pointercancel', end);
  }
  window.JLHomeLayout = { apply: apply, open: openSheet, _key: KEY };
  function boot() { apply(); var n = 0, t = setInterval(function () { apply(); if (++n > 30) clearInterval(t); }, 2000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
