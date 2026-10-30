/* jl_glance.js v1 — 首页「今日一眼」卡 (jl-1224a)
 * 只读 window.jlGlanceInputJL()(买入闸/ATR5开盘参数/报价) + jlLinkInputJL()(上证/预判带/异动) + jl_reso_log_v1(共振位), 不新发请求
 * 三段: ①大字灯=买入闸结论+两条主因(09:25前标"昨收数据") ②大盘位置条(预判低→高)+抄底灯 ③09:25 每只持仓/自选一行: 可买/等回踩某价/不碰
 * 规则全部是初值, 未回测(界面写明):
 *   9:25 判断: 闸红→不碰; 闸黄→等回踩T; 闸绿且|开盘缺口|<0.6×ATR5→可买, 高开≥0.6→不追等回踩T, 低开≤-0.6→等回踩T
 *     T = 开盘价下方最近的(非过时)共振位, 且不低于 ATR5 开盘区下沿; 没有就用下沿
 *   抄底灯: 上证 ≤ 预判低×1.003 且 近15分钟无快跳水 且 温度非冰点 → 金"可低吸"; 到了但在跳水/冰点 → 红"别接"
 * 台账 jl_glance_log_v1(按日, 留90天): 9:25 判断(只在09:25–10:00锁定, 之后不补)、抄底触发、上证每10分钟快照(随机对照用); 15:05后用当日收盘/高低定稿
 * 回滚: 删 index.html 里引用本文件的一行 + jlGlanceInputJL
 */
(function () {
  var KEY = 'jl_glance_log_v1', KEEP = 90, GAP = 0.6, NEAR = 0.003, EVWIN = 15;

  function ok(v) { return v != null && isFinite(v); }
  function f2(v, d) { return ok(v) ? Number(v).toFixed(d == null ? 2 : d) : '—'; }
  function pc(v) { return ok(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function hm() { var d = new Date(); return d.getHours() * 100 + d.getMinutes(); }
  function hhmm() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function wk() { var w = new Date().getDay(); return w >= 1 && w <= 5; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(L) { try { var ks = Object.keys(L).sort(); while (ks.length > KEEP) delete L[ks.shift()]; localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { } }

  function resoLv(code) {
    try { var e = (JSON.parse(localStorage.getItem('jl_reso_log_v1') || '{}')[today()] || {})[code]; return e && !e.stale && e.levels ? e.levels : []; } catch (er) { return []; }
  }

  /* ---------- 纯函数: 9:25 单票判断 ---------- */
  function decide(x, lvl, lv) {
    if (!x.atr || !ok(x.atr.atr) || !(x.atr.atr > 0)) return { act: 'na', txt: '数据不足', why: x.atr && x.atr.why || '' };
    if (!x.fresh || !(x.open > 0) || !(x.prev > 0)) return { act: 'na', txt: '开盘价未到', why: '报价还不是今天09:25后的' };
    var A = x.atr.atr, gapA = (x.open - x.prev) / A, lower = x.open - A * x.atr.kDown;
    var cand = (lv || []).filter(function (l) { return l.p < x.open && l.p >= lower; }).sort(function (a, b) { return b.p - a.p; })[0];
    var T = cand ? cand.p : lower, tSrc = cand ? '共振位×' + cand.n : 'ATR5下沿';
    var gTxt = (gapA >= 0 ? '高开' : '低开') + ' ' + Math.abs(gapA).toFixed(2) + '×ATR5';
    if (lvl === 'red') return { act: 'skip', txt: '不碰', why: '买入闸红灯 · ' + gTxt, gapA: gapA };
    if (lvl === 'nodata') return { act: 'na', txt: '闸数据不足', why: gTxt, gapA: gapA };
    if (lvl === 'green' && Math.abs(gapA) < GAP) return { act: 'buy', txt: '可买', why: '开盘价附近 · ' + gTxt, ref: x.open, gapA: gapA };
    var why = lvl === 'yellow' ? '闸黄只低吸' : gapA >= GAP ? '高开不追' : '低开先看下方';
    return { act: 'wait', txt: '等回踩 ' + f2(T, x.base < 1 ? 3 : 2), why: why + ' · ' + tSrc + ' · ' + gTxt, ref: T, gapA: gapA };
  }

  /* ---------- 纯函数: 抄底灯 ---------- */
  function dipState(sh, pred, ev, temp) {
    if (!sh || !ok(sh.base) || !pred || !ok(pred.lo) || !ok(pred.hi)) return { k: 'na', txt: '预判带未到' };
    var near = sh.base <= pred.lo * (1 + NEAR);
    if (!near) return { k: 'off', txt: '离预判低 ' + ((sh.base / pred.lo - 1) * 100).toFixed(2) + '%' };
    var dive = (ev || []).some(function (e) { return e.dir < 0 && e.ago <= EVWIN; }), ice = temp && temp.state === '冰点';
    if (dive || ice) return { k: 'avoid', txt: '别接', why: dive ? '近' + EVWIN + '分钟快跳水' : '温度冰点' };
    return { k: 'buy', txt: '可低吸', why: sh.base <= pred.lo ? '已到预判低下方' : '贴近预判低' };
  }

  /* ---------- 台账 ---------- */
  function record(G, sh) { /* sh = jlLinkInputJL() 的结果 */
    var t = today(), L = load(), d = L[t] = L[t] || { picks: null, gate: null, dips: [], snaps: [] }, m = hm(), dirty = false;
    var live = sh && sh.sh && sh.sh.qd === t.replace(/-/g, '');
    /* 9:25 判断: 只在 09:25–10:00 锁; 闸有数且有ATR参数的票全拿到今天开盘价就锁, 09:58 起照现有数据锁(没到开盘价的记"开盘价未到") */
    if (!d.picks && wk() && m >= 925 && m < 1000 && G && G.list && G.list.some(function (x) { return x.fresh; })) {
      var allIn = G.gate.lvl !== 'nodata' && G.list.every(function (x) { return x.fresh || !(x.atr && x.atr.atr); });
      if (allIn || m >= 958) {
        d.gate = { lvl: G.gate.lvl, sum: G.gate.sum, at: hhmm() };
        d.picks = G.list.map(function (x) { var r = decide(x, G.gate.lvl, resoLv(x.code)); return { code: x.code, name: x.name, hold: x.hold, act: r.act, txt: r.txt, why: r.why, ref: r.ref, open: x.open, prev: x.prev, at: hhmm() }; });
        dirty = true;
      }
    }
    /* 抄底触发: 每类每30分钟最多一条 */
    if (live && m >= 930 && m <= 1500 && !(m > 1130 && m < 1300) && G && G.gate && G.gate.lvl !== 'nodata') { /* 闸数据没到不记, 免得台账里闸色是空的 */
      var st = dipState(sh.sh, sh.pred, sh.ev, sh.temp), slot = Math.floor((Math.floor(m / 100) * 60 + m % 100) / 30);
      if ((st.k === 'buy' || st.k === 'avoid') && !d.dips.some(function (x) { return x.k === st.k && x.slot === slot; })) {
        d.dips.push({ k: st.k, at: hhmm(), slot: slot, px: sh.sh.base, lo: sh.pred.lo, why: st.why, gate: G && G.gate ? G.gate.lvl : '' }); dirty = true;
        try { window.dispatchEvent(new CustomEvent('jlglance:dip', { detail: { k: st.k, px: sh.sh.base, why: st.why } })); } catch (e) { }
      }
      /* 上证每10分钟一个快照(随机对照: 同一天任意时刻买到收盘的平均收益) */
      var key = Math.floor(m / 10);
      if (!d.snaps.some(function (x) { return x[0] === key; })) { d.snaps.push([key, sh.sh.base]); dirty = true; }
    }
    /* 定稿: 15:05 后, 报价是今天 */
    if (!d.final && m >= 1505 && live && G) {
      var close = sh.sh.base;
      (d.dips || []).forEach(function (x) { x.ret = +((close / x.px - 1) * 100).toFixed(3); });
      d.ctrl = d.snaps.length ? +(d.snaps.reduce(function (a, x) { return a + (close / x[1] - 1) * 100; }, 0) / d.snaps.length).toFixed(3) : null;
      var by = {}; G.list.forEach(function (x) { by[x.code] = x; });
      (d.picks || []).forEach(function (p) {
        var q = by[p.code]; if (!q || q.qd !== t.replace(/-/g, '') || !(q.base > 0)) return;
        p.close = q.base; p.low = q.low; p.high = q.high;
        if (p.act === 'buy') p.ret = +((q.base / p.ref - 1) * 100).toFixed(3);
        else if (p.act === 'wait') { p.touched = q.low <= p.ref ? 1 : 0; p.ret = p.touched ? +((q.base / p.ref - 1) * 100).toFixed(3) : null; }
        else if (p.act === 'skip') p.ret = +((q.base / p.open - 1) * 100).toFixed(3);
      });
      d.shClose = close; d.final = 1; dirty = true;
    }
    if (dirty) save(L);
    return d;
  }

  /* ---------- 渲染 ---------- */
  var LV = { green: ['可以买', '#ff5459'], yellow: ['只低吸不追高', '#e0a800'], red: ['今天不宜买入', '#16b47a'], nodata: ['数据不足', '#5b6a82'] };
  var CSS = '#jlGlance{margin:0 0 10px;padding:12px 12px 10px}#jlGlance .gh{display:flex;flex-direction:column;align-items:flex-start;gap:7px}' +
    '#jlGlance .lamp{font-size:20px;font-weight:800;color:#fff;border-radius:12px;padding:6px 14px;letter-spacing:1px;box-shadow:0 0 14px rgba(0,0,0,.35)}' +
    '#jlGlance .gs{font-size:11.5px;color:#dfe9f2;line-height:1.55}#jlGlance .gs b{color:#fff}' +
    '#jlGlance .sec{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.1)}#jlGlance h4{margin:0 0 6px;font-size:11.5px;color:#9fd8e6;font-weight:600;display:flex;justify-content:space-between}' +
    '#jlGlance .bar{position:relative;height:30px;margin:4px 6px 18px}#jlGlance .bar .ln{position:absolute;left:0;right:0;top:14px;height:2px;background:#2a3850}' +
    '#jlGlance .bar .bd{position:absolute;top:8px;height:14px;border-radius:5px;background:rgba(159,179,255,.15);border:1px solid rgba(159,179,255,.45)}' +
    '#jlGlance .bar .dr{position:absolute;top:13px;height:4px;border-radius:2px;background:rgba(255,255,255,.35)}' +
    '#jlGlance .bar .cur{position:absolute;top:9px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff;border:2px solid #0f1828}' +
    '#jlGlance .bar .tg{position:absolute;top:30px;font-size:10px;white-space:nowrap;transform:translateX(-50%);background:rgba(7,13,24,.62);border-radius:4px;padding:0 4px}' +
    '#jlGlance .dip{display:flex;align-items:center;gap:8px;font-size:12px}#jlGlance .dip .dl{font-weight:800;border-radius:9px;padding:3px 10px;color:#fff}' +
    '#jlGlance .dip.buy .dl{background:#d9a514;animation:jlGlBlink 1s ease-in-out infinite}#jlGlance .dip.avoid .dl{background:#e0383e}#jlGlance .dip.off .dl,#jlGlance .dip.na .dl{background:#3a4a64}' +
    '@keyframes jlGlBlink{50%{box-shadow:0 0 0 6px rgba(217,165,20,.35)}}' +
    '#jlGlance .pk{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:baseline;padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.08);font-size:12px}#jlGlance .pk:last-child{border-bottom:0}' +
    '#jlGlance .pk .a{font-weight:800;border-radius:8px;padding:1px 8px;font-size:12px;white-space:nowrap}#jlGlance .pk .a.buy{background:#e0383e;color:#fff}#jlGlance .pk .a.wait{background:#e0a800;color:#10202a}#jlGlance .pk .a.skip{background:#16b47a;color:#fff}#jlGlance .pk .a.na{background:#3a4a64;color:#dfe9f2}' +
    '#jlGlance .pk small{grid-column:2/4;color:#aab6c8;font-size:10.5px}#jlGlance .ft{margin-top:8px;font-size:10px;color:#8b98ad;display:flex;justify-content:space-between;gap:8px}#jlGlance .ft a{color:#9fd8e6}';

  function barHTML(sh, pred) {
    if (!pred || !ok(pred.lo) || !ok(pred.hi)) return '<div style="font-size:11px;color:#ffb35c">大盘预判带还没算出（首页「大盘预判」加载后出现）</div>';
    var live = sh && sh.qd === today().replace(/-/g, ''), cur = sh && ok(sh.base) ? sh.base : NaN;
    var vals = [pred.lo, pred.hi].concat(ok(cur) ? [cur] : []).concat(live && ok(sh.high) && ok(sh.low) ? [sh.high, sh.low] : []);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (p) { return ((p - lo) / (hi - lo) * 100).toFixed(2) + '%'; };
    var h = '<div class="bar"><div class="ln"></div><div class="bd" style="left:' + X(pred.lo) + ';width:calc(' + X(pred.hi) + ' - ' + X(pred.lo) + ')"></div>';
    if (live && ok(sh.high) && ok(sh.low) && sh.high > sh.low) h += '<div class="dr" style="left:' + X(sh.low) + ';width:calc(' + X(sh.high) + ' - ' + X(sh.low) + ')"></div>';
    if (ok(cur)) h += '<div class="cur" style="left:' + X(cur) + '"></div>';
    h += '<span class="tg" style="left:' + X(pred.lo) + ';color:#9fd0ff">低 ' + f2(pred.lo) + '</span><span class="tg" style="left:' + X(pred.hi) + ';color:#ffb0a8">高 ' + f2(pred.hi) + '</span></div>';
    return h;
  }

  function render() {
    var home = document.getElementById('home'); if (!home) return;
    var g = document.getElementById('jlGlance');
    if (!g) {
      if (!document.getElementById('jlGlanceCss')) { var s = document.createElement('style'); s.id = 'jlGlanceCss'; s.textContent = CSS; document.head.appendChild(s); }
      g = document.createElement('section'); g.id = 'jlGlance'; g.className = 'glass';
      var pm = document.getElementById('premarketJL'), ix = document.getElementById('indexList');
      if (pm) home.insertBefore(g, pm); else if (ix) home.insertBefore(g, ix.nextSibling); else home.insertBefore(g, home.firstChild);
    }
    var G = null, K = null; try { G = window.jlGlanceInputJL && window.jlGlanceInputJL(); K = window.jlLinkInputJL && window.jlLinkInputJL(); } catch (e) { }
    if (!G) { g.innerHTML = '<div style="font-size:12px;color:#dfe9f2">今日一眼 · 数据加载中…</div>'; return; }
    var d = record(G, K), m = hm(), pre = wk() && m < 925, gl = LV[G.gate.lvl] || LV.nodata;
    var dg = d.gate && d.gate.lvl ? d.gate : null;
    /* ① 大字灯 */
    var why = (G.gate.why || []).join(' · ');
    var h = '<div class="gh"><span class="lamp" style="background:' + gl[1] + '">' + gl[0] + '</span><div class="gs">' +
      (pre ? '<b>开盘前 · 用昨收数据</b>，09:25 竞价后重判<br>' : '') +
      (G.gate.veto ? '一票否决：<b>' + esc(G.gate.veto) + '</b>' : G.gate.soft ? '降档：<b>' + esc(G.gate.soft) + '</b>' : why ? '主因：<b>' + esc(why) + '</b>' : '多空都不强') +
      '<br>总分 ' + (G.gate.sum > 0 ? '+' : '') + G.gate.sum + ' · ' + G.gate.okN + '/7 项有数' + (dg ? ' · 09:25 锁定为「' + (LV[dg.lvl] || LV.nodata)[0] + '」' : '') + '</div></div>';
    /* ② 大盘位置 + 抄底灯 */
    var sh = K && K.sh, pred = K && K.pred, ds = dipState(sh, pred, K && K.ev, K && K.temp);
    var live = sh && sh.qd === today().replace(/-/g, '');
    h += '<div class="sec"><h4><span>大盘位置 · 预判低 → 预判高</span><span>上证 ' + f2(sh && sh.base) + ' ' + pc(sh && sh.pct) + '</span></h4>' + barHTML(sh, pred) +
      '<div class="dip ' + (live ? ds.k : 'na') + '"><span class="dl">' + (live ? ds.txt : '未开盘') + '</span><span>' + (live ? esc(ds.why || '盘中贴近预判低时提醒：金=可低吸 · 红=别接') + (ds.k === 'buy' && G.gate.lvl === 'red' ? ' · <b style="color:#ffb35c">闸红：只当观察信号</b>' : '') : '盘中贴近预判低时提醒') + '</span></div></div>';
    /* ③ 09:25 判断 */
    h += '<div class="sec"><h4><span>09:25 买入判断 · 持仓+自选</span><span>' + (d.picks ? d.gate.at + ' 锁定' : '') + '</span></h4>';
    if (!d.picks) h += '<div style="font-size:11.5px;color:#dfe9f2">' + (pre || !wk() ? '09:25 竞价出来后给出：每只一行「可买 / 等回踩某价 / 不碰」' : m >= 1000 ? '今天 09:25–10:00 没打开过 App，没有锁定的判断（不事后补，免得用盘中价冒充开盘判断）' : '等开盘价和买入闸数据…') + '</div>';
    else h += d.picks.map(function (p) {
      var res = d.final ? (p.act === 'buy' ? ' · 收盘 ' + pc(p.ret) : p.act === 'wait' ? (p.touched ? ' · 碰到了，收盘 ' + pc(p.ret) : ' · 没回踩到') : p.act === 'skip' ? ' · 开盘到收盘 ' + pc(p.ret) : '') : '';
      return '<div class="pk"><span class="a ' + p.act + '">' + esc(p.txt) + '</span><b>' + esc(p.name) + (p.hold ? '' : ' <small style="display:inline;color:#8b98ad">自选</small>') + '</b><span style="color:#aab6c8;font-size:11px">开 ' + f2(p.open, p.open < 1 ? 3 : 2) + '</span><small>' + esc(p.why) + res + '</small></div>';
    }).join('');
    h += '</div><div class="ft"><span>规则是初值，未回测 · 每天自动记账，攒够二三十天看准不准</span><a href="./jl_tlog.html#glance">台账 ›</a></div>';
    g.innerHTML = h;
  }

  window.JLGlance = { decide: decide, dipState: dipState, record: record, render: render, _key: KEY };
  if (typeof document === 'undefined' || !document.getElementById) return;
  function boot() { render(); setInterval(function () { if (!document.hidden) render(); }, 20000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1500); }); else setTimeout(boot, 1500);
})();
