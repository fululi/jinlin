/* jl_fundabn.js v1 — 资金异常提醒 (jl-1224b): 跌中吸筹 + 尾盘大单打压
 * 只读 window.jlAbnInputJL()(实时主力/大中小单, 每60秒刷新 + 报价) 与 jlDailyBarsJL(日K, 用于次日结算), 不新发请求
 * 规则全部是初值, 未回测(界面写明):
 *   跌中吸筹: 10:00 后, 当日跌幅 ≤ -1%, 主力净额 > 0; 有大中小单时还要 大单>0 且 小单<0 (主力买、散户卖)
 *   尾盘大单打压: 14:30–15:00, 和约10分钟前(8–15分钟)的快照比: 价格跌 ≥0.8%, 主力净额在减少; 有大中小单时还要 大单减少 且 小单增加;
 *                 且现价贴着当日最低(≤最低×1.003)
 *   每只票每类每天只记第一次
 * 快照: 14:25 起每只票每分钟一条(只在 App 打开时有, 关着就没有, 不补)
 * 台账 jl_abn_log_v1(按日, 留90天): 事件 + 当天所有票的收盘(对照组); 之后的交易日用日K结算 次日开盘/次日收盘/3日后收盘 收益,
 *   对照 = 同一天全部票(不论有没有事件)收盘到次日收盘的平均收益
 * 回滚: 删 index.html 里引用本文件的一行 + jlAbnInputJL/jlDailyBarsJL
 */
(function () {
  var KEY = 'jl_abn_log_v1', KEEP = 90, ABS_PCT = -1.0, DUMP_PCT = -0.8, NEARLOW = 0.003;

  function ok(v) { return v != null && isFinite(v); }
  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function hm() { var d = new Date(); return d.getHours() * 100 + d.getMinutes(); }
  function mins(h) { return Math.floor(h / 100) * 60 + h % 100; }
  function wk() { var w = new Date().getDay(); return w >= 1 && w <= 5; }
  function yi(v) { return ok(v) ? (v > 0 ? '+' : '') + (Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : (v / 1e4).toFixed(0) + '万') : '—'; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(L) { try { var ks = Object.keys(L).sort(); while (ks.length > KEEP) delete L[ks.shift()]; localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { } }

  /* ---------- 纯函数 ---------- */
  function isAbsorb(x) {
    if (!x || !x.ff || !ok(x.pct) || !(x.base > 0)) return null;
    if (x.pct > ABS_PCT || !(x.ff.rt > 0)) return null;
    if (x.ff.hasB && !(x.ff.big > 0 && x.ff.sml < 0)) return null;
    return { k: 'absorb', txt: '跌中吸筹', why: '跌' + x.pct.toFixed(2) + '% · 主力' + yi(x.ff.rt) + (x.ff.hasB ? ' · 大单' + yi(x.ff.big) + ' · 小单' + yi(x.ff.sml) : ''), px: x.base, rt: x.ff.rt, rel: x.ff.ltsz > 0 ? +(x.ff.rt / x.ff.ltsz * 1e4).toFixed(2) : null };
  }
  /* snaps: [[hhmm, px, rt, big, sml], ...] 升序 */
  function isDump(x, snaps, nowHm) {
    if (!x || !x.ff || !(x.base > 0) || !snaps || snaps.length < 2) return null;
    var nm = mins(nowHm), cur = snaps[snaps.length - 1], ref = null;
    for (var i = snaps.length - 2; i >= 0; i--) { var dm = nm - mins(snaps[i][0]); if (dm >= 8 && dm <= 15) { ref = snaps[i]; break; } }
    if (!ref) return null;
    var dp = (cur[1] / ref[1] - 1) * 100, drt = cur[2] - ref[2];
    if (!(dp <= DUMP_PCT) || !(drt < 0)) return null;
    var hasB = ok(cur[3]) && ok(ref[3]) && ok(cur[4]) && ok(ref[4]) && x.ff.hasB;
    if (hasB && !(cur[3] - ref[3] < 0 && cur[4] - ref[4] > 0)) return null;
    if (ok(x.low) && x.low > 0 && cur[1] > x.low * (1 + NEARLOW)) return null;
    return { k: 'dump', txt: '尾盘打压', why: (mins(cur[0]) - mins(ref[0])) + '分钟跌' + dp.toFixed(2) + '% · 主力' + yi(drt) + (hasB ? ' · 大单' + yi(cur[3] - ref[3]) + ' · 小单' + yi(cur[4] - ref[4]) : '') + ' · 贴着日内最低', px: cur[1], rt: drt };
  }
  /* 次日结算: bars 升序 {t,o,c} */
  function settle(ev, date, bars) {
    var i = bars.findIndex(function (b) { return String(b.t).slice(0, 10) > date; });
    if (i < 0) return false;
    var b1 = bars[i], b3 = bars[i + 2];
    ev.r1o = +((b1.o / ev.px - 1) * 100).toFixed(3); ev.r1c = +((b1.c / ev.px - 1) * 100).toFixed(3);
    if (b3) ev.r3c = +((b3.c / ev.px - 1) * 100).toFixed(3);
    ev.done = b3 ? 1 : 0;
    return true;
  }

  /* ---------- 记账 ---------- */
  function tick(list, nowHm) {
    var t = today(), L = load(), d = L[t] = L[t] || { ev: [], snaps: {}, base: {} }, m = nowHm == null ? hm() : nowHm, dirty = false;
    var live = (list || []).filter(function (x) { return x.qd === t.replace(/-/g, ''); });
    if (wk() && live.length) {
      var sess = (m >= 930 && m <= 1130) || (m >= 1300 && m <= 1500);
      live.forEach(function (x) {
        var has = function (k) { return d.ev.some(function (e) { return e.code === x.code && e.k === k; }); };
        if (sess && m >= 1000 && !has('absorb')) {
          var a = isAbsorb(x);
          if (a) { a.code = x.code; a.name = x.name; a.at = m; d.ev.push(a); dirty = true; fire(a); }
        }
        if (m >= 1425 && m <= 1500 && x.ff && x.base > 0) {
          var S = d.snaps[x.code] = d.snaps[x.code] || [], last = S[S.length - 1];
          if (!last || last[0] !== m) { S.push([m, x.base, x.ff.rt, x.ff.hasB ? x.ff.big : null, x.ff.hasB ? x.ff.sml : null]); dirty = true; }
          if (m >= 1430 && !has('dump')) {
            var u = isDump(x, S, m);
            if (u) { u.code = x.code; u.name = x.name; u.at = m; d.ev.push(u); dirty = true; fire(u); }
          }
        }
        if (m >= 1505 && !(x.code in d.base) && x.base > 0) { d.base[x.code] = x.base; dirty = true; }
      });
    }
    /* 往日结算(含对照组) */
    Object.keys(L).forEach(function (day) {
      if (day >= t) return;
      var D = L[day];
      (D.ev || []).forEach(function (e) { if (!e.done) { var bars = window.jlDailyBarsJL ? window.jlDailyBarsJL(e.code) : []; if (bars.length && settle(e, day, bars)) dirty = true; } });
      if (D.base && D.ctrl == null) {
        var rs = [];
        Object.keys(D.base).forEach(function (c) { var bars = window.jlDailyBarsJL ? window.jlDailyBarsJL(c) : [], i = bars.findIndex(function (b) { return String(b.t).slice(0, 10) > day; }); if (i >= 0) rs.push((bars[i].c / D.base[c] - 1) * 100); });
        if (rs.length && rs.length === Object.keys(D.base).length) { D.ctrl = +(rs.reduce(function (a, b) { return a + b; }, 0) / rs.length).toFixed(3); dirty = true; }
      }
      if (D.snaps && Object.keys(D.snaps).length) { D.snaps = {}; dirty = true; } /* 快照只当天用, 过日清掉省空间 */
    });
    if (dirty) save(L);
    return d;
  }
  function fire(e) { try { window.dispatchEvent(new CustomEvent('jlabn', { detail: e })); } catch (er) { } }

  /* 资金灯读: 今天这只票的异常(打压优先, 时间更近) */
  function state(code) {
    var d = load()[today()]; if (!d) return null;
    var es = (d.ev || []).filter(function (e) { return e.code === code; });
    return es.filter(function (e) { return e.k === 'dump'; })[0] || es[0] || null;
  }
  function times(code, k) { var L = load(), n = 0; Object.keys(L).forEach(function (day) { (L[day].ev || []).forEach(function (e) { if (e.code === code && e.k === k) n++; }); }); return n; }

  window.JLAbn = { isAbsorb: isAbsorb, isDump: isDump, settle: settle, tick: tick, state: state, times: times, _key: KEY };
  if (typeof document === 'undefined' || !document.addEventListener) return;
  function run() { try { if (!document.hidden && window.jlAbnInputJL) tick(window.jlAbnInputJL()); } catch (e) { } }
  function boot() { run(); setInterval(run, 20000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 2000); }); else setTimeout(boot, 2000);
})();
