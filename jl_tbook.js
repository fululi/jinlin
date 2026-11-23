/* jl_tbook.js v1 (2026-11-21) —— 做T算账（交接_1121 第五节第1步；主稿 docs/设计稿_1121/做T面板_设计稿_1121.html 的「算账/挂账/已配/统计」四页）
   用户 11-21 拍板：
   · 一轮＝一卖一接配上的部分；新的一笔先配「手动指定的那笔」，再配没超5个交易日的反向挂账：日子越近越先，同一天按时间先后
   · 超5个交易日的不自动配，挂账页标「超5天」，点「手动配这笔」；能撤销最近一笔(配对全部重算)
   · 某做法不满10轮标「样本不足」不排名；挂账「现在接回」写明按哪个价、几点算的
   · 默认价先不接尺子/小球，手填；记录存 localStorage 新键 zp_tbook_v1（只在本机，可导出/导入）
   · 设计以后再定：这一版只求算得对，样式先用最简白字
   已知没做：「挂了N个交易日」只跳周末，节假日没算
   用法（宿主页）：JLTBook.mount(el, function(){ return {code, name, qty, px, at}; }); 价格变了调 JLTBook.refresh()
   纯函数 JLTBook.fee/calc/tdays/pair 可单独测：node tools/bt/panel_1121/tbook_test.js */
(function () {
  "use strict";
  if (window.JLTBook) return;
  var KEY = 'zp_tbook_v1', STALE = 5, MIN_RANK = 10;
  var METHODS = ['尺子', '小球', '今日共振', '五日图斐波', '15分斐波', '三角', '自己判断'];

  /* ===== 算法（纯函数，和设计稿逐字同口径；改了要跑 tbook_test.js） ===== */
  function fee(amt, sell) { return Math.max(5, amt * 0.00025) + amt * 0.00001 + (sell ? amt * 0.0005 : 0); }
  function calc(sp, bp, sq, bq) { var n = Math.min(sq, bq), fs = fee(sp * sq, 1) / sq, fb = fee(bp * bq, 0) / bq, f = (fs + fb) * n; return { n: n, gross: (sp - bp) * n, fee: f, net: (sp - bp) * n - f }; }
  function tdays(d1, d2) { var a = new Date(d1.slice(0, 10) + 'T00:00'), b = new Date(d2.slice(0, 10) + 'T00:00'), n = 0; while (a < b) { a.setDate(a.getDate() + 1); var w = a.getDay(); if (w && w !== 6) n++; } return n; }
  function cmpTs(a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id - b.id; }
  function pair(log) {
    var L = log.slice().sort(cmpTs), open = [], rounds = [];
    L.forEach(function (e) {
      var left = e.q, fu = fee(e.p * e.q, e.side === 's') / e.q;
      function take(o, manual) {
        var n = Math.min(o.left, left); if (n <= 0) return;
        var S = e.side === 's' ? { p: e.p, fu: fu } : o, B = e.side === 's' ? o : { p: e.p, fu: fu };
        rounds.push({ manual: manual, meth: o.meth, openId: o.id, openTs: o.ts, openSide: o.side, openP: o.p, openQ: o.q, closeId: e.id, closeTs: e.ts, closeP: e.p, n: n, net: (S.p - B.p) * n - (S.fu + B.fu) * n });
        o.left -= n; left -= n;
      }
      if (e.target) { var o = open.filter(function (x) { return x.id === e.target && x.left > 0 && x.side !== e.side; })[0]; if (o) take(o, true); }
      open.filter(function (o) { return o.left > 0 && o.side !== e.side && tdays(o.ts, e.ts) <= STALE; })
        .sort(function (a, b) { var da = a.ts.slice(0, 10), db = b.ts.slice(0, 10); return da !== db ? (da < db ? 1 : -1) : cmpTs(a, b); })
        .forEach(function (o) { if (left > 0) take(o, false); });
      if (left > 0) open.push({ id: e.id, side: e.side, p: e.p, q: e.q, ts: e.ts, meth: e.meth, left: left, fu: fu });
    });
    return { open: open.filter(function (o) { return o.left > 0; }), rounds: rounds };
  }

  /* ===== 存取 ===== */
  var st = null, saveErr = '';
  function load() { try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; } if (!st || !st.s) st = { v: 1, tab: 0, s: {} }; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); saveErr = ''; }
    catch (e) { saveErr = '本机存不进去（空间满？）——刚记的这笔刷新后会丢，先点「导出」留一份'; }
  }

  /* ===== 页面 ===== */
  var EL = null, GET = null, $ = function (id) { return EL && EL.querySelector('#' + id); };
  function f2(v) { return (+v).toFixed(2); }
  function yuan(v, u) { return (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString() + (u === 0 ? '' : ' 元'); }
  function hm(ts) { return ts.slice(5, 10) + ' ' + ts.slice(11, 16); }
  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function H() { var h = {}; try { h = GET() || {}; } catch (e) { } return h; }
  function S() {
    var h = H(), c = h.code || '—';
    if (!st.s[c]) { var p = Math.round((+h.px || 0) * 100) / 100; st.s[c] = { mode: 's', sp: p, bp: p, sq: 0, bq: 0, meth: '自己判断', log: [], seq: 0, target: 0 }; }
    var s = st.s[c], q = HOLD();
    if (!s.sq) s.sq = Math.min(1000, q); if (!s.bq) s.bq = Math.min(1000, q);
    return s;
  }
  function HOLD() { var q = Math.round(+H().qty || 0); return q >= 100 ? q : 1000; }   /* 没持仓(已割/观察票)时按1000股给滑条, 只是算账用 */

  var CSS = '.tbk{color:#fff;font-size:13px;line-height:1.5}.tbk .tb{display:flex;gap:6px;margin:0 0 8px}.tbk .tb button,.tbk .chip,.tbk .rb,.tbk .mini,.tbk .act button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:3px 10px;font:inherit}'
    + '.tbk .tb button.on,.tbk .chip.on{background:rgba(111,182,255,.28);border-color:#6fb6ff}.tbk .rb{padding:0;width:28px;height:28px}.tbk input,.tbk select{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;font:inherit;padding:3px 6px}'
    + '.tbk .pin{width:76px;text-align:center;font-size:16px}.tbk .row{display:flex;align-items:center;gap:6px;margin:6px 0;flex-wrap:wrap}.tbk input[type=range]{width:100%;padding:0;border:0;accent-color:#6fb6ff}.tbk .s{color:#ff8a80}.tbk .b{color:#4fd79b}'
    + '.tbk .u{color:#ff8a80}.tbk .d{color:#4fd79b}.tbk .big{font-size:24px}.tbk .it{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.1)}.tbk .it .r{text-align:right;white-space:nowrap}.tbk .sm{display:block;font-size:11.5px}'
    + '.tbk .old{border-left:2px dashed #ffb347;padding-left:6px}.tbk .bd{margin-left:6px;font-size:11px;border:1px solid #ffb347;color:#ffb347;border-radius:4px;padding:0 4px}.tbk table{width:100%;border-collapse:collapse;font-size:12px}.tbk td,.tbk th{padding:4px 2px;text-align:right;font-weight:400}.tbk td:first-child,.tbk th:first-child{text-align:left}'
    + '.tbk .lh,.tbk .lr{display:grid;grid-template-columns:1fr 92px 84px;align-items:center;gap:6px;font-variant-numeric:tabular-nums}.tbk .lh{font-size:11px;padding:0 2px 4px;border-bottom:1px solid rgba(255,255,255,.14)}.tbk .lh span:last-child,.tbk .pl{text-align:right}'
    + '.tbk .lr{padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.07)}.tbk .lr b{font-weight:500;font-size:15px}.tbk .lr em{font-style:normal;margin:0 4px;font-size:12px}.tbk .lr u{text-decoration:none;font-size:11px}.tbk .tm{font-size:12px;line-height:1.25}.tbk small{display:block;font-size:10.5px}'
    + '.tbk .sg{font-style:normal;font-size:10.5px;border-radius:3px;padding:0 3px;margin-right:4px;vertical-align:2px}.tbk .sS{background:rgba(255,138,128,.22);color:#ff8a80}.tbk .sB{background:rgba(79,215,155,.2);color:#4fd79b}'
    + '.tbk .lr.old{box-shadow:inset 2px 0 0 #ffb347}.tbk .pk{margin-left:6px;width:24px;height:24px;border-radius:50%;border:1px solid #ffb347;background:transparent;color:#ffb347;font-size:11px;padding:0}.tbk .nil{padding:14px 0;text-align:center}'
    + '.tbk .act{display:flex;gap:8px;margin-top:8px}.tbk .act .sb{border-color:#ff8a80;color:#ff8a80}.tbk .act .bb{border-color:#4fd79b;color:#4fd79b}.tbk .warn{color:#ffb347}.tbk .pg{display:none}.tbk .pg.on{display:block}';

  function mount(el, get) {
    EL = el; GET = get; load();
    if (!document.getElementById('tbkCss')) { var c = document.createElement('style'); c.id = 'tbkCss'; c.textContent = CSS; document.head.appendChild(c); }
    el.classList.add('tbk');
    el.innerHTML = '<div class="tb" id="tbTabs">' + ['算账', '挂账', '已配', '统计'].map(function (n, i) { return '<button data-tab="' + i + '">' + n + '</button>'; }).join('') + '</div>'
      + '<div class="pg" id="tbP0"></div><div class="pg" id="tbP1"></div><div class="pg" id="tbP2"></div><div class="pg" id="tbP3"></div><div class="warn" id="tbErr"></div>';
    el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onChange);
    lastCode = null; refresh();
    /* 自己5秒刷一次(换票/现价/持仓变了跟着变); 手正在框里填或下拉时不重画 */
    if (!mount.t) mount.t = setInterval(function () { try { if (document.hidden || (EL && EL.contains(document.activeElement))) return; refresh(); } catch (e) { } }, 5000);
  }
  var lastCode = null;
  function refresh() {
    if (!EL) return;
    var c = H().code; if (c !== lastCode) { lastCode = c; buildCalc(); }
    drawCalc(); drawLog();
  }
  function buildCalc() {
    var s = S(), order = s.mode === 's' ? ['s', 'b'] : ['b', 's'], d = new Date();
    $('tbP0').innerHTML = '<div class="row"><span id="tbHold"></span><span style="margin-left:auto"></span><button class="chip" data-mode="s">先卖后接</button><button class="chip" data-mode="b">先接后卖</button></div>' /* 只记录自己的成交, 不给买卖建议; 依据 tools/bt/panel_1121/tbook_test.js */
      + order.map(function (sd) {
        return '<div class="row"><span class="' + sd + '">' + (sd === 's' ? '卖出' : '买回') + '</span><button class="rb" data-a="' + sd + '-">−</button><input class="pin" data-p="' + sd + '" inputmode="decimal"><button class="rb" data-a="' + sd + '+">+</button><span data-qn="' + sd + '"></span></div>'
          + '<input type="range" data-q="' + sd + '" min="100" max="' + HOLD() + '" step="100">';
      }).join('')
      + '<div class="row"><span class="big" id="tbNet"></span><span id="tbHow"></span></div><div id="tbPos"></div>'
      + '<div class="row" id="tbMeth"></div>'
      + '<div class="row">成交时间 <input type="date" id="tbD" value="' + d.toLocaleDateString('sv-SE') + '"><input type="time" id="tbT" value="' + d.toTimeString().slice(0, 5) + '"></div>'
      + '<div class="row">配给 <select id="tbTg"></select></div>'
      + '<div class="act"><button class="sb" id="tbDS">卖出成交了</button><button class="bb" id="tbDB">买回成交了</button></div>'
      + '<div id="tbMsg"></div><div class="act"><span id="tbLast" style="flex:1"></span><button id="tbUndo">撤销最近一笔</button></div>';
  }
  function drawCalc(skip) {
    var s = S(), h = H();
    $('tbHold').textContent = (h.name || h.code || '') + ' · 持仓 ' + (Math.round(+h.qty || 0)) + ' 股';
    EL.querySelectorAll('[data-mode]').forEach(function (b) { b.className = 'chip' + (b.dataset.mode === s.mode ? ' on' : ''); });
    ['s', 'b'].forEach(function (sd) {
      var pi = EL.querySelector('[data-p="' + sd + '"]'); if (pi !== document.activeElement) pi.value = f2(s[sd + 'p']);
      EL.querySelector('[data-qn="' + sd + '"]').textContent = s[sd + 'q'] + ' 股';
      if (skip !== sd) EL.querySelector('[data-q="' + sd + '"]').value = s[sd + 'q'];
    });
    var r = calc(s.sp, s.bp, s.sq, s.bq), rest = Math.abs(s.sq - s.bq), q0 = Math.round(+h.qty || 0);
    $('tbNet').textContent = yuan(r.net); $('tbNet').className = 'big ' + (r.net >= 0 ? 'u' : 'd');
    $('tbHow').innerHTML = '差 ' + (s.sp - s.bp).toFixed(2) + ' × ' + r.n + ' 股 ＝ ' + yuan(r.gross) + ' · 费用 −' + Math.round(r.fee) + ' 元';
    $('tbPos').textContent = !rest ? '做完持仓还是 ' + q0 + ' 股' : (s.sq > s.bq ? r.n + ' 股成一轮，剩 ' + rest + ' 股卖了没接回（挂账）· 持仓变 ' + (q0 - rest) + ' 股' : r.n + ' 股成一轮，多买的 ' + rest + ' 股算加仓（挂账）· 持仓变 ' + (q0 + rest) + ' 股');
    save();
  }
  function drawLog() {
    var s = S(), h = H(), N = +h.px || 0, P = pair(s.log), T0 = today();
    $('tbMeth').innerHTML = '做法 ' + METHODS.map(function (m) { return '<button class="chip' + (s.meth === m ? ' on' : '') + '" data-m="' + m + '">' + m + '</button>'; }).join('');
    if (s.target && !P.open.some(function (o) { return o.id === s.target; })) s.target = 0;
    $('tbTg').innerHTML = '<option value="0">自动：最近几天的挂账</option>' + P.open.map(function (o) {
      return '<option value="' + o.id + '"' + (s.target === o.id ? ' selected' : '') + '>' + hm(o.ts) + ' ' + (o.side === 's' ? '卖' : '买') + ' ' + o.left + '股 @' + f2(o.p) + (tdays(o.ts, T0) > STALE ? ' · 超5天' : '') + '</option>';
    }).join('');
    var last = s.log.slice().sort(function (a, b) { return b.id - a.id; })[0];
    $('tbLast').textContent = last ? '最近一笔 ' + hm(last.ts) + ' ' + (last.side === 's' ? '卖' : '买') + ' ' + last.q + '股 @' + f2(last.p) + (last.target ? ' · 手动配' : '') : '还没记过';
    /* 11-21 用户「太啰嗦…价格买卖配对要看着专业而不是流水账文字」: 挂账/已配改成对齐的账本行(方向签·价×股·时间·浮盈), 不写句子 */
    function sd2(x) { return '<i class="sg ' + (x === 's' ? 'sS">卖' : 'sB">买') + '</i>'; }
    function mm(ts) { return ts.slice(5, 10).replace('-', '/') + ' ' + ts.slice(11, 16); }
    var OP = P.open.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    $('tbP1').innerHTML = !OP.length ? '<div class="nil">无挂账</div>'
      : '<div class="lh"><span>挂单</span><span>时间</span><span>按 ' + f2(N) + (h.at ? ' · ' + h.at : '') + '</span></div>'
      + OP.map(function (o) {
        var sd = o.side === 's', old = tdays(o.ts, T0) > STALE;
        var v = sd ? (o.p - N) * o.left - (o.fu + fee(N * o.left, 0) / o.left) * o.left : (N - o.p) * o.left - (o.fu + fee(N * o.left, 1) / o.left) * o.left;
        return '<div class="lr' + (old ? ' old' : '') + '"><span>' + sd2(o.side) + '<b>' + f2(o.p) + '</b><em>×' + o.left + (o.left < o.q ? '<u>/' + o.q + '</u>' : '') + '</em></span>'
          + '<span class="tm">' + mm(o.ts) + '<small>' + o.meth + '</small></span>'
          + '<span class="pl">' + (N > 0 ? '<b class="' + (v >= 0 ? 'u' : 'd') + '">' + yuan(v, 0) + '</b>' : '—') + (old ? '<button class="pk" data-pick="' + o.id + '" title="超5个交易日，手动配">配</button>' : '') + '</span></div>';
      }).join('');
    var R = P.rounds.slice().sort(function (a, b) { return a.closeTs < b.closeTs ? 1 : -1; }).slice(0, 30);
    $('tbP2').innerHTML = !R.length ? '<div class="nil">还没有配成的轮</div>'
      : '<div class="lh"><span>开 → 平</span><span>时间</span><span>净赚</span></div>'
      + R.map(function (x) {
        return '<div class="lr"><span>' + sd2(x.openSide) + '<b>' + f2(x.openP) + '</b><em>→</em>' + sd2(x.openSide === 's' ? 'b' : 's') + '<b>' + f2(x.closeP) + '</b><em>×' + x.n + '</em></span>'
          + '<span class="tm">' + mm(x.openTs) + '<small>→ ' + (x.closeTs.slice(0, 10) === x.openTs.slice(0, 10) ? x.closeTs.slice(11, 16) : mm(x.closeTs)) + (x.manual ? ' · 手配' : '') + '</small></span>'
          + '<span class="pl"><b class="' + (x.net >= 0 ? 'u' : 'd') + '">' + yuan(x.net, 0) + '</b><small>' + x.meth + '</small></span></div>';
      }).join('');
    /* 统计 */
    var G = {}; function g0(k) { return G[k] || (G[k] = { n: 0, w: 0, sum: 0, op: 0 }); }
    P.rounds.forEach(function (x) { var g = g0(x.meth); g.n++; if (x.net > 0) g.w++; g.sum += x.net; });
    P.open.forEach(function (o) { g0(o.meth).op++; });
    var head = '<tr><th>做法</th><th>轮数</th><th>赚的</th><th>平均每轮</th><th>合计</th><th>挂账</th></tr>';
    function row(k) { var g = G[k]; return '<tr><td>' + k + '</td><td>' + g.n + '</td><td>' + (g.n ? g.w + '/' + g.n : '—') + '</td><td class="' + (g.sum >= 0 ? 'u' : 'd') + '">' + (g.n ? yuan(g.sum / g.n, 0) : '—') + '</td><td class="' + (g.sum >= 0 ? 'u' : 'd') + '">' + (g.n ? yuan(g.sum, 0) : '—') + '</td><td>' + g.op + '</td></tr>'; }
    var ks = Object.keys(G), big = ks.filter(function (k) { return G[k].n >= MIN_RANK; }).sort(function (a, b) { return G[b].sum / G[b].n - G[a].sum / G[a].n; }), small = ks.filter(function (k) { return G[k].n < MIN_RANK; });
    $('tbP3').innerHTML = (!ks.length ? '<div>还没有记录。</div>'
      : (big.length ? '<table>' + head + big.map(row).join('') + '</table>' : '<div>还没有哪种做法满 10 轮，暂不排名。</div>')
      + (small.length ? '<div style="margin-top:8px">样本不足（不排名）</div><table>' + head + small.map(row).join('') + '</table>' : ''))
      + '<div class="act"><button id="tbExp">导出</button><label><input type="file" id="tbImp" accept=".json" style="display:none"><span class="mini" style="display:inline-block">导入</span></label><button id="tbClr">清空这只票</button></div>';
    EL.querySelectorAll('[data-tab]').forEach(function (b, i) { b.className = i === (st.tab || 0) ? 'on' : ''; if (i === 1) b.textContent = '挂账 ' + P.open.length; });
    for (var i = 0; i < 4; i++) $('tbP' + i).className = 'pg' + (i === (st.tab || 0) ? ' on' : '');
    save(); $('tbErr').textContent = saveErr;
  }
  function msg(t) { $('tbMsg').textContent = t; }
  function add(sd) {
    var s = S(), sell = sd === 's'; s.seq++;
    var e = { id: s.seq, side: sd, p: sell ? s.sp : s.bp, q: sell ? s.sq : s.bq, ts: ($('tbD').value || today()) + ' ' + ($('tbT').value || '00:00'), meth: s.meth };
    if (s.target) e.target = s.target; s.log.push(e); s.target = 0;
    msg('已记：' + hm(e.ts) + ' ' + (sell ? '卖 ' : '买 ') + e.q + ' 股 @' + f2(e.p) + (e.target ? '（手动配）' : '')); drawLog();
  }
  function onInput(ev) { var t = ev.target; if (t.dataset.q) { var k = t.dataset.q + 'q', v = Math.max(100, Math.round(+t.value / 100) * 100); if (v !== S()[k]) { S()[k] = v; drawCalc(t.dataset.q); } } }
  function onChange(ev) {
    var t = ev.target, s = S();
    if (t.id === 'tbTg') { s.target = +t.value; save(); return; }
    if (t.dataset.p) { var v = +t.value; if (v > 0) s[t.dataset.p + 'p'] = Math.round(v * 100) / 100; drawCalc(); return; }
    if (t.id === 'tbImp' && t.files[0]) {
      var rd = new FileReader(); rd.onload = function () {
        try { var o = JSON.parse(rd.result); if (!o || !o.s) throw 0; if (!confirm('用文件里的记录覆盖本机的做T算账？')) return; st = o; save(); lastCode = null; refresh(); msg('已导入'); } catch (e) { msg('文件不对，没导入'); }
      }; rd.readAsText(t.files[0]); t.value = '';
    }
  }
  function onClick(ev) {
    var t = ev.target.closest('button'); if (!t) return; var s = S();
    if (t.dataset.tab) { st.tab = +t.dataset.tab; drawLog(); return; }
    if (t.dataset.mode) { s.mode = t.dataset.mode; buildCalc(); drawCalc(); drawLog(); return; }
    if (t.id === 'tbDS') { add('s'); return; } if (t.id === 'tbDB') { add('b'); return; }
    if (t.id === 'tbUndo') {
      if (!s.log.length) return; var mx = Math.max.apply(null, s.log.map(function (x) { return x.id; })), x = s.log.filter(function (y) { return y.id === mx; })[0];
      if (!confirm('撤销 ' + hm(x.ts) + ' ' + (x.side === 's' ? '卖 ' : '买 ') + x.q + ' 股 @' + f2(x.p) + '？')) return;
      s.log = s.log.filter(function (y) { return y.id !== mx; }); msg('已撤销，配对已重算'); drawLog(); return;
    }
    if (t.id === 'tbClr') { if (confirm('清空 ' + (H().name || H().code) + ' 的全部做T记录？（建议先导出）')) { s.log = []; s.target = 0; drawLog(); } return; }
    if (t.id === 'tbExp') {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' }));
      a.download = '做T算账_' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if (t.dataset.pick) {
      var id = +t.dataset.pick, o = pair(s.log).open.filter(function (x) { return x.id === id; })[0]; if (!o) return;
      s.target = id; s.mode = o.side; st.tab = 0; buildCalc(); drawCalc(); drawLog(); msg('下一笔' + (o.side === 's' ? '买回' : '卖出') + '会先配给 ' + hm(o.ts) + ' 那笔'); return;
    }
    if (t.dataset.m) { s.meth = t.dataset.m; drawLog(); return; }
    if (t.dataset.a) { var k = t.dataset.a[0] + 'p'; s[k] = Math.round((s[k] + (t.dataset.a[1] === '+' ? 0.01 : -0.01)) * 100) / 100; drawCalc(); return; }
  }

  window.JLTBook = { v: 1, KEY: KEY, fee: fee, calc: calc, tdays: tdays, pair: pair, mount: mount, refresh: refresh };
})();
