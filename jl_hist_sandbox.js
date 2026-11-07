/* 金粼·持仓卡历史对照与做T情景沙盘 v1.1 (1107修: 开盘首段%改为可选默认不用/接回不高于卖价/尾盘不强制接回/印花税过户费单位/到位比例)
 * 只读历史分钟，不请求网络、不写localStorage、不改持仓。
 * 依赖：先加载 jl_600105_m1.js，再加载本文件。
 * 调用：JLHistSandbox.mount(容器元素, {code:'600105'}); */
(function (w) {
  'use strict';
  var DATA = w.JL_YD_M1 || [];
  var BASE = 46.72, START = '2026-09-22', END = '2026-11-06';
  function day(s) { return String(s).slice(0, 10); }
  function hm(s) { return String(s).slice(11, 16); }
  function n(v, d) { return Number(v).toFixed(d == null ? 2 : d); }
  function money(v) { return (v < 0 ? '−¥' : '¥') + Math.abs(v).toFixed(2); }
  function fee(amt, sell, o) {
    return Math.max(o.minFee, amt * o.comm / 10000) + amt * o.xfer / 10000 + (sell ? amt * o.stamp / 10000 : 0);
  }
  function rowsFor(d) { return DATA.filter(function (r) { return day(r[0]) === d; }); }
  function legs(rows, cut) {
    var p = rows.map(function (r) { return +r[2]; }), out = [];
    if (!p.length) return out;
    var dir = 0, ch = 0, cl = 0, hp = p[0], lp = p[0], lastI = 0, lastP = p[0], r = cut / 100;
    function add(type, a, b, ai, bi, ci) {
      out.push({ type: type, from: a, to: b, start: hm(rows[ai][0]), end: hm(rows[bi][0]), confirm: hm(rows[ci][0]), amp: (b - a) / a * 100 });
    }
    for (var i = 1; i < p.length; i++) {
      var x = p[i];
      if (dir === 0) {
        if (x > hp) { ch = i; hp = x; }
        if (x < lp) { cl = i; lp = x; }
        if (ch < cl && lp <= hp * (1 - r)) { add('up', lastP, hp, lastI, ch, i); lastI = ch; lastP = hp; dir = -1; cl = i; lp = x; }
        else if (cl < ch && hp >= lp * (1 + r)) { add('down', lastP, lp, lastI, cl, i); lastI = cl; lastP = lp; dir = 1; ch = i; hp = x; }
      } else if (dir === 1) {
        if (x > hp) { ch = i; hp = x; }
        else if (x <= hp * (1 - r)) { add('up', lastP, hp, lastI, ch, i); lastI = ch; lastP = hp; dir = -1; cl = i; lp = x; }
      } else {
        if (x < lp) { cl = i; lp = x; }
        else if (x >= lp * (1 + r)) { add('down', lastP, lp, lastI, cl, i); lastI = cl; lastP = lp; dir = 1; ch = i; hp = x; }
      }
    }
    return out;
  }
  function historyAverage(date, cut, type) {
    var dates = [], vals = [];
    DATA.forEach(function (r) { var d = day(r[0]); if (d < date && dates.indexOf(d) < 0) dates.push(d); });
    dates = dates.slice(-20);
    dates.forEach(function (d) { legs(rowsFor(d), cut).forEach(function (z) { if (z.type === type) vals.push(Math.abs(z.amp)); }); });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  }
  function prevClose(date) {
    var prev = '';
    DATA.forEach(function (r) { var d = day(r[0]); if (d < date && d >= prev) prev = d; });
    return prev ? +rowsFor(prev).slice(-1)[0][2] : BASE;
  }
  function simulate(o) {
    var rows = rowsFor(o.date), pre = prevClose(o.date), pc = pre;
    if (!rows.length) return { error: '这一天没有分钟数据' };
    var open = +rows[0][1], close = +rows[rows.length - 1][2], gap = (open - pre) / pre * 100;
    var autoMode = gap <= -.5 ? '低开' : gap >= .5 ? '高开' : '平开';
    var mode = o.mode === 'auto' ? autoMode : o.mode;
    var autoUp = historyAverage(o.date, o.cut, 'up'), autoDown = historyAverage(o.date, o.cut, 'down');
    var upTarget = o.upTarget > 0 ? o.upTarget : autoUp, downTarget = o.downTarget > 0 ? o.downTarget : autoDown;
    if (!(upTarget > 0 && downTarget > 0)) return { error: '历史均值不足，请手填上涨与下跌目标振幅' };
    var state = 'sell', ext = +rows[0][2], lastSell = 0, round = 0, net = 0, trades = [], shares = 2000, cash = 0, stopped = false;
    for (var i = 0; i < rows.length; i++) {
      var px = +rows[i][2], tm = hm(rows[i][0]);
      if (stopped) continue;
      if (state === 'sell' && round < o.rounds) {
        ext = Math.min(ext, px);
        var amp = (px - ext) / ext * 100, ampOpen = (px - open) / open * 100, tol = o.tol > 0 ? o.tol : 1;
        /* jl-hist1107: 开盘首段%默认不用(用户: 高开有时会冲3个点, 1.3%不是固定卖点); 填了才按开盘价算首段先卖; 其余按段振幅目标×到位比例 */
        var first = round === 0 && o.firstHigh > 0 && ampOpen >= o.firstHigh, target = first ? o.firstHigh : upTarget * tol;
        if (first) amp = ampOpen;
        if (first || amp >= upTarget * tol) {
          var sf = fee(px * o.qty, true, o), proceeds = px * o.qty - sf;
          net += proceeds; cash += proceeds; shares -= o.qty; round++;
          trades.push({ round: round, action: '卖出', time: tm, price: px, qty: o.qty, amp: amp, target: target, fee: sf });
          state = 'buy'; ext = px; lastSell = px;
        }
      } else if (state === 'buy') {
        ext = Math.max(ext, px);
        /* 修正②: 接回价必须低于卖价(留0.3%费用空间), 不高价追回; 修正③: 尾盘只在低于卖价时才接, 否则不接回按收盘对照 */
        var down = (ext - px) / ext * 100, tail = tm >= o.tailTime, below = px <= lastSell * (1 - 0.003), dT = downTarget * (o.tol > 0 ? o.tol : 1);
        if (below && (down >= dT || (tail && o.tailAction === 'buy'))) {
          var bf = fee(px * o.qty, false, o), cost = px * o.qty + bf;
          net -= cost; cash -= cost; shares += o.qty;
          trades.push({ round: round, action: tail && down < dT ? '尾盘接回(低于卖价)' : '接回', time: tm, price: px, qty: o.qty, amp: -down, target: -dT, fee: bf });
          state = 'sell'; ext = px;
        } else if (tail) {
          stopped = true;
        }
      }
    }
    var hold = (close - pre) * 2000;
    /* 未接回时用收盘市值补记机会差，保证与2000股不动同口径；同时单列现金和剩余股数。 */
    var total = shares === 2000 ? hold + net : hold + net + shares * 0 + (2000 - shares) * 0;
    if (shares !== 2000) total = hold + net - close * (2000 - shares);
    return { date: o.date, mode: mode, autoMode: autoMode, gap: gap, pre: pre, open: open, close: close, upTarget: upTarget, downTarget: downTarget,
      autoUp: autoUp, autoDown: autoDown, hold: hold, net: net, total: total, shares: shares, cash: cash, round: round, trades: trades,
      restored: shares === 2000, legs: legs(rows, o.cut), rows: rows };
  }
  function downloadCSV(date) {
    var text = '日期,时间,开盘,收盘,最高,最低,成交量股,成交额元\n' + rowsFor(date).map(function (r) {
      return [day(r[0]), hm(r[0]), r[1], r[2], r[3], r[4], r[5], r[6]].join(',');
    }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = '永鼎股份_' + date + '_1分钟.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function draw(cv, result) {
    var dpr = w.devicePixelRatio || 1, width = cv.clientWidth || 600, height = 230;
    cv.width = width * dpr; cv.height = height * dpr; var c = cv.getContext('2d'); c.scale(dpr, dpr);
    c.fillStyle = '#101b24'; c.fillRect(0, 0, width, height);
    var rows = result.rows, vals = rows.map(function (r) { return +r[2]; }), axisVals = vals.concat([result.pre]);
    var lo = Math.min.apply(Math, axisVals), hi = Math.max.apply(Math, axisVals), pad = (hi - lo || 1) * .1; lo -= pad; hi += pad;
    function x(i) { return 38 + i / Math.max(1, rows.length - 1) * (width - 54); }
    function y(v) { return 12 + (hi - v) / (hi - lo) * (height - 40); }
    c.strokeStyle = '#31424d'; c.lineWidth = 1; [lo, (lo + hi) / 2, hi].forEach(function (v) { c.beginPath(); c.moveTo(38, y(v)); c.lineTo(width - 8, y(v)); c.stroke(); c.fillStyle = '#9aabb5'; c.font = '10px sans-serif'; c.fillText(n(v), 2, y(v) + 3); });
    c.strokeStyle = '#83949f'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(38, y(result.pre)); c.lineTo(width - 8, y(result.pre)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#eef6f9'; c.lineWidth = 1.5; c.beginPath(); vals.forEach(function (v, i) { if (i) c.lineTo(x(i), y(v)); else c.moveTo(x(i), y(v)); }); c.stroke();
    result.trades.forEach(function (t) { var i = rows.findIndex(function (r) { return hm(r[0]) === t.time; }); if (i < 0) return; var sell = t.action === '卖出'; c.fillStyle = sell ? '#e89b43' : '#35b8c8'; c.beginPath(); c.arc(x(i), y(t.price), 4, 0, Math.PI * 2); c.fill(); c.fillText(sell ? '卖' : '买', x(i) - 5, y(t.price) + (sell ? -10 : 16)); });
  }
  function mount(el, opts) {
    if (!el) return;
    if (el.__jlHistSandbox) return; el.__jlHistSandbox = true; el.classList.add('jhs');
    var dates = []; DATA.forEach(function (r) { var d = day(r[0]); if (d >= START && d <= END && dates.indexOf(d) < 0) dates.push(d); });
    el.innerHTML = '<style>.jhs{color:#eaf2f4;background:#111f29;border:1px solid #2a3d49;border-radius:12px;padding:12px;font:12px/1.45 sans-serif}.jhs h3{margin:0 0 4px;font-size:16px}.jhs small{color:#8fa3ae}.jhs .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:10px 0}.jhs label{color:#a9bac3}.jhs input,.jhs select,.jhs button{box-sizing:border-box;width:100%;padding:7px;border:1px solid #3b505c;border-radius:7px;background:#172b36;color:#fff}.jhs button{cursor:pointer;background:#1f7a8c;border:0;font-weight:700}.jhs .alt{background:#425663}.jhs canvas{width:100%;height:230px;display:block;border-radius:8px}.jhs .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.jhs .m{background:#172b36;padding:8px;border-radius:8px}.jhs .m b{display:block;font-size:16px}.jhs table{width:100%;border-collapse:collapse;margin-top:8px}.jhs td,.jhs th{padding:5px;border-bottom:1px solid #2a3d49;text-align:right}.jhs th:first-child,.jhs td:first-child{text-align:left}.jhs .warn{color:#f2c14e}.jhs .scroll{max-height:210px;overflow:auto}@media(max-width:600px){.jhs .grid{grid-template-columns:repeat(2,1fr)}.jhs .metrics{grid-template-columns:1fr 1fr}}</style>' +
      '<h3>历史分钟对照 · 做T情景沙盘</h3><small>永鼎600105｜切段阀只切波段，不是成交条件｜固定规则样例只作参考，资金/小球/共振位没进回测｜不碰实盘持仓</small>' +
      '<div class="grid"><label>日期<select data-k="date">' + dates.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></label>' +
      '<label>开盘情形<select data-k="mode"><option value="auto">仅显示自动参考</option><option>低开</option><option>平开</option><option>高开</option></select></label>' +
      '<label>切段阀%<select data-k="cut"><option>1.2</option><option selected>1.5</option><option>1.6</option><option>1.8</option><option>2.0</option></select></label>' +
      '<label>每轮股数<input data-k="qty" type="number" value="1000" min="100" max="2000" step="100"></label>' +
      '<label>上涨目标%<input data-k="upTarget" type="number" placeholder="留空=20日均值" step="0.1"></label>' +
      '<label>下跌目标%<input data-k="downTarget" type="number" placeholder="留空=20日均值" step="0.1"></label>' +
      '<label>开盘首段%<input data-k="firstHigh" type="number" placeholder="留空=不用" step="0.1"></label>' +
      '<label>每日最多轮数<select data-k="rounds"><option>1</option><option selected>2</option></select></label>' +
      '<label>尾盘时间<input data-k="tailTime" value="14:55" pattern="[0-9]{2}:[0-9]{2}"></label>' +
      '<label>尾盘未达接回目标<select data-k="tailAction"><option value="hold">不接回(默认)</option><option value="buy">低于卖价才接</option></select></label>' +
      '<label>到位比例<input data-k="tol" type="number" value="0.9" step="0.05" min="0.5" max="1"></label>' +
      '<label>佣金万<input data-k="comm" type="number" value="2.5" step="0.1"></label>' +
      '<label>最低佣金元<input data-k="minFee" type="number" value="5" step="1"></label>' +
      '</div><div class="grid"><button data-act="run">运行情景</button><button class="alt" data-act="csv">下载当天1分钟CSV</button></div>' +
      '<div data-k="out"></div><canvas></canvas><div class="scroll" data-k="legs"></div>';
    var out = el.querySelector('[data-k="out"]'), cv = el.querySelector('canvas');
    function val(k) { return el.querySelector('[data-k="' + k + '"]').value; }
    function run() {
      var o = { date: val('date'), mode: val('mode'), cut: +val('cut'), qty: +val('qty'), upTarget: +val('upTarget'), downTarget: +val('downTarget'),
        firstHigh: +val('firstHigh'), rounds: +val('rounds'), tailTime: val('tailTime'), tailAction: val('tailAction'), comm: +val('comm'), minFee: +val('minFee'), xfer: .1, stamp: 5, tol: +val('tol') };  /* 修正④: 过户费万0.1、印花税万5(原写成万0.001/万0.05, 每轮少算约11元) */
      var r = simulate(o); if (r.error) { out.innerHTML = '<p class="warn">' + r.error + '</p>'; return; }
      out.innerHTML = '<div class="metrics"><div class="m">不动当日盈亏<b>' + money(r.hold) + '</b></div><div class="m">做T后同日对照<b>' + money(r.total) + '</b></div><div class="m">相对不动改善<b>' + money(r.total - r.hold) + '</b></div>' +
        '<div class="m">完成轮数<b>' + r.round + '</b></div><div class="m">上涨/下跌目标<b>' + n(r.upTarget) + '% / ' + n(r.downTarget) + '%</b></div><div class="m">情形<b>' + r.mode + '（自动参考：' + r.autoMode + '）</b></div></div>' +
        (r.restored ? '<small>收盘已恢复2000股；做T后总盈亏＝不动盈亏＋净差价。</small>' : '<p class="warn">尾盘未接回：收盘剩' + r.shares + '股，净现金' + money(r.cash) + '。对照已按收盘价计算少持股票的机会差；不代表次日结果。</p>') +
        '<table><tr><th>轮次/动作</th><th>时间</th><th>价格</th><th>段振幅</th><th>费用</th></tr>' + (r.trades.length ? r.trades.map(function (t) { return '<tr><td>' + t.round + ' ' + t.action + '</td><td>' + t.time + '</td><td>' + n(t.price) + '</td><td>' + n(t.amp) + '%</td><td>' + money(t.fee) + '</td></tr>'; }).join('') : '<tr><td colspan="5">未触发交易</td></tr>') + '</table>';
      draw(cv, r);
      el.querySelector('[data-k="legs"]').innerHTML = '<table><tr><th>方向</th><th>起点→终点</th><th>价格</th><th>段振幅</th><th>确认时间</th></tr>' + r.legs.map(function (z) {
        return '<tr><td style="color:' + (z.type === 'up' ? '#e89b43' : '#35b8c8') + '">' + (z.type === 'up' ? '▲涨' : '▼跌') + '</td><td>' + z.start + '→' + z.end + '</td><td>' + n(z.from) + '→' + n(z.to) + '</td><td>' + n(z.amp) + '%</td><td>' + z.confirm + '</td></tr>';
      }).join('') + '</table><small>段终点是事后确认的描述点，不是成交价；成交只发生在右侧逐分钟触发记录里。</small>';
    }
    el.querySelector('[data-act="run"]').onclick = run;
    el.querySelector('[data-act="csv"]').onclick = function () { downloadCSV(val('date')); };
    el.querySelector('[data-k="date"]').value = END; run();
  }
  w.JLHistSandbox = { mount: mount, simulate: simulate, legs: legs, version: '1.0' };
})(window);
