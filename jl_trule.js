/* jl_trule.js v2.1 — 做T闭环: 盘后生成次日计划 → 次日跟踪 → 收盘结算 → 随机对照复盘 (只记账, 不下单)
 * 规则: 只做"先卖后买回", 只用现有持仓, 每只票每天最多1次, 不融资不加仓
 * 计划: 信号日(收盘后或次日开盘前)用共振表冻结 → 卖出价=昨收上方最近共振位, 买回价=昨收下方最近共振位,
 *       止损=实际卖出价+stopAtr×ATR(跳空高开按开盘价卖, 止损跟着上移), 股数=持仓×frac 取整到手; 价差<minSpread 或持仓不足一手 → 写明原因, 不做
 * 防未来数据: 盘中(09:15~15:15)一律不生成计划; 计划按 code|信号日 存一次, 重复刷新不重复; 共振表标"过时"(日K没更新)时不生成, 下次刷新再试
 * 次日: tradeDate = 信号日之后第一个有日K的交易日(自动跳过周末/节假日)
 * 模拟: 15分K逐根; 同根K线不卖又买; 卖出那根若最高价已到止损 → 必然先卖后止损, 记止损; 开盘价先于盘中高低处理; 同根同时碰买回价与止损价 → 保守按止损
 * 完整日: 15分K须恰好16个时段(09:45…11:30, 13:15…15:00)逐个对上、无重复、OHLC有效; 且这份数据是该日15:00:15之后拉的(东财盘中末根=正在走的K线, 14:45起就标15:00)
 * 结算: 只有"完整日"才用15分K定稿, 今天没收盘绝不定稿; 过去交易日的15分K是旧快照(该日收盘前拉的)或还没拉 → 强制重拉并等待(最多 WAIT 次刷新), 仍不行才用日线;
 *       快照是收盘后拉的但这一天缺根(缓存最早一天被截断) → 直接日线; 日线判不出先后 → "顺序不明", 不计入统计
 * 费用: 单边 costRate(默认0.15%, 保守估算, 未含佣金起收价), 买卖两边各按成交金额算
 * 对照: 同股票同日同股数同费用同止损规则, 价位在昨收±1.5ATR内随机(种子=信号日+代码), 按报价单位取整且满足同样价差门槛
 * 依赖: jl_reso.js(compute(code, upTo)); index.html: jlResoInputJL / jlResoCodesJL / jlHoldQtyJL / jlTBarsJL(code)=15分K[{t,o,h,l,c}, t为K线结束时刻]
 * 持仓变化: 计划冻结不重算; 跟踪中当前持仓 < 计划卖出股数(减仓到不够卖) → 作废, 不进统计
 * 存储: jl_trule_log_v2; 参数 jl_trule_cfg_v1
 * 回滚: 删 index.html 里本文件的 script 引用
 */
(function () {
  var CFGK = 'jl_trule_cfg_v1', LOGK = 'jl_trule_log_v2', KEEP = 240, WAIT = 10, REFRESH_MS = 120000;
  var SLOTS = ['09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00'];
  var asked = {};
  var DEF = { frac: 0.25, lot: 100, minSpread: 0.01, stopAtr: 0.5, cost: 0.0015, minSrc: 2, minSamples: 30 };
  var NAME = { atr: 'ATR', prevHL: '昨高低', hl5: '五日高低', gap: '缺口', fib: '斐波' };
  var LAB = { pending: '待执行', wait: '等待卖出', sold: '已卖出·等买回', done: '已买回', stop: '止损买回', open: '收盘结算(没买回)', idle: '未触发', unclear: '顺序不明', void: '持仓变化·作废', nodata: '数据不足', noplan: '不操作', none: '不操作' };

  function nowD() { return window.__jlNow ? new Date(window.__jlNow) : new Date(); }
  function today() { return nowD().toLocaleDateString('sv-SE'); }
  function mins() { var d = nowD(); return d.getHours() * 60 + d.getMinutes(); }
  function hhmm() { return nowD().toTimeString().slice(0, 5); }
  function day(t) { return String(t).slice(0, 10); }
  function hm(t) { return String(t).slice(11, 16); }
  function f2(v) { return Number(v).toFixed(2); }
  function money(v) { return (v > 0 ? '+' : '') + Math.round(v) + '元'; }
  function cfg() {
    var o = {}, c = {};
    try { c = JSON.parse(localStorage.getItem(CFGK) || '{}') || {}; } catch (e) { }
    for (var k in DEF) o[k] = typeof c[k] === 'number' ? c[k] : DEF[k];
    return o;
  }
  function setCfg(p) {
    var c = cfg();
    for (var k in p) if (k in DEF && typeof p[k] === 'number') c[k] = p[k];
    try { localStorage.setItem(CFGK, JSON.stringify(c)); } catch (e) { }
    return c;
  }
  function load() { try { return JSON.parse(localStorage.getItem(LOGK) || '{}') || {}; } catch (e) { return {}; } }
  function save(L) {
    try {
      var ks = Object.keys(L).sort(function (a, b) { var x = a.split('|')[1], y = b.split('|')[1]; return x < y ? -1 : x > y ? 1 : 0; });
      while (ks.length > KEEP) delete L[ks.shift()];
      localStorage.setItem(LOGK, JSON.stringify(L));
    } catch (e) { }
  }
  function tick(code) { return /^(5\d{5}|15\d{4}|16\d{4})$/.test(String(code).replace(/\D/g, '')) ? 0.001 : 0.01; }
  function rt(v, t) { return +(Math.round(v / t) * t).toFixed(3); }
  function rng(seed) {
    var h = 0, i;
    for (i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return function () { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  }

  function bars15(code, td) {
    try {
      var bs = window.jlTBarsJL && window.jlTBarsJL(code);
      if (!bs || !bs.length) return null;
      bs = bs.filter(function (b) { return day(b.t) === td; }).sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      return bs.length ? bs : null;
    } catch (e) { return null; }
  }
  /* 完整一天: 恰好16个时段逐个对上(顺带排除重复/缺段/乱序), OHLC 有效 */
  function fullDay(b) {
    if (!b || b.length !== SLOTS.length) return false;
    for (var i = 0; i < b.length; i++) {
      var x = b[i];
      if (hm(x.t) !== SLOTS[i]) return false;
      if (![x.o, x.h, x.l, x.c].every(function (v) { return typeof v === 'number' && isFinite(v) && v > 0; })) return false;
      if (x.h < x.l || x.c > x.h || x.c < x.l) return false; /* 开盘价不卡高低: 首根开盘含集合竞价, 实测589420 10-21 首根 o=0.623 < l=0.624 */
    }
    return true;
  }
  /* 这份15分K的拉取时刻(ms), 0=不知道/没拉到 */
  function fetchedAt(code) { var A = window.jlTBarsJL && window.jlTBarsJL.at; return (A && Number(A[code])) || 0; }
  function closeMs(d) { return new Date(d + 'T15:00:15').getTime(); }
  /* 快照是该日收盘后拉的 → 15:00那根已定型 */
  function freshFor(code, d) { return fetchedAt(code) >= closeMs(d); }
  /* 该日15分K已收盘且完整 */
  function dayClosed(code, d, b) { return fullDay(b) && freshFor(code, d) && nowD().getTime() >= closeMs(d); }
  /* 请求重拉(每只票2分钟最多一次) */
  function askRefresh(code) {
    var n = nowD().getTime();
    if (asked[code] && n - asked[code] < REFRESH_MS) return;
    asked[code] = n;
    try { if (window.jlTBarsJL && window.jlTBarsJL.refresh) window.jlTBarsJL.refresh(code); } catch (e) { }
  }

  /* 信号日: 只有"今日已收盘且日K已出"或"今日还没开盘/周末"才允许, 盘中一律不生成(防未来数据) */
  function closeConfirmed(code, d) { return dayClosed(code, d, bars15(code, d)); } /* 收盘确认: 该日15分K完整且收盘后拉取; 没有=未确认=不生成 */
  function signalCand(bars) {
    if (!bars || !bars.length) return null;
    var t = today(), m = mins(), wd = nowD().getDay(), ld = day(bars[bars.length - 1].t);
    if (ld === t) return (wd >= 1 && wd <= 5 && m >= 915) ? t : null;
    if (ld < t) return (wd === 0 || wd === 6 || m < 555) ? ld : null; /* 09:15起有集合竞价报价, 不再生成 */
    return null;
  }
  function signalDateFor(bars, code) {
    var sig = signalCand(bars);
    if (!sig) return null;
    if (closeConfirmed(code, sig)) return sig;
    if (!freshFor(code, sig)) askRefresh(code); /* 旧快照/没拉到: 重拉, 下次刷新再判 */
    return null;
  }

  function mkPlan(S, B, sh, atr, c, sS, sB, code) {
    var tk = tick(code);
    if (!sh) return { none: '持仓不足一手可动' };
    if (!S || !B) return { none: '昨收上方或下方没有共振位' };
    S = rt(S, tk); B = rt(B, tk); /* 先按报价单位取整, 再算价差, 页面显示=真实执行价差 */
    var sp = (S - B) / S;
    if (sp < c.minSpread) return { none: '取整后卖买价差' + (sp * 100).toFixed(2) + '%, 不足' + (c.minSpread * 100) + '%' };
    return {
      sellPrice: S, buyPrice: B, sellQty: sh, stopPrice: rt(S + c.stopAtr * atr, tk), stopDist: +(c.stopAtr * atr).toFixed(4), tick: tk,
      expectedSpread: +sp.toFixed(4), minSource: c.minSrc, costRate: c.cost, sellSrcs: sS || [], buySrcs: sB || []
    };
  }
  function genCtrl(code, sig, pc, atr, sh, c) {
    var r = rng(sig + code + 'c'), tk = tick(code), i, S, B;
    for (i = 0; i < 80; i++) {
      S = rt(pc + (0.1 + 0.9 * r()) * 1.5 * atr, tk);
      B = rt(pc - (0.1 + 0.9 * r()) * 1.5 * atr, tk);
      if (S > pc && B < pc && B > 0 && (S - B) / S >= c.minSpread) return mkPlan(S, B, sh, atr, c, [], [], code);
    }
    return { none: '对照组抽不到满足价差门槛的价位' };
  }

  function genRecord(code, name, sig, c, qty) {
    var R = window.JLReso, e = R && R.compute(code, sig);
    if (e && e.stale) return null; /* 日K没更新到位, 这次不生成, 下次刷新再试 */
    var rec = { code: code, name: name, signalDate: sig, tradeDate: null, at: hhmm(), qty: qty, status: 'pending', final: 0 };
    if (!e || e.pd !== sig) { rec.plan = { none: '数据不足(日线不够或缺信号日收盘)' }; rec.status = 'nodata'; rec.final = 1; return rec; }
    if (e.hist) { rec.plan = { none: '历史截面不完整(斐波/缺口只有当前值), 不生成' }; rec.status = 'nodata'; rec.final = 1; return rec; }
    rec.prevClose = e.pc; rec.atr = e.atr;
    var sh = Math.floor(qty * c.frac / c.lot) * c.lot;
    var lv = e.levels.filter(function (l) { return l.n >= c.minSrc; });
    var up = lv.filter(function (l) { return l.p > e.pc; }).sort(function (a, b) { return a.p - b.p; })[0];
    var dn = lv.filter(function (l) { return l.p < e.pc; }).sort(function (a, b) { return b.p - a.p; })[0];
    rec.plan = mkPlan(up && up.p, dn && dn.p, sh, e.atr, c, up && up.srcs, dn && dn.srcs, code);
    if (rec.plan.sellPrice) rec.ctrl = genCtrl(code, sig, e.pc, e.atr, sh, c);
    else { rec.status = 'noplan'; rec.final = 1; }
    return rec;
  }

  function codeList() {
    var ls = [];
    try { ls = window.jlResoCodesJL ? window.jlResoCodesJL() : []; } catch (e) { }
    return ls.filter(function (x) { return x.code !== 'sh000001' && window.jlHoldQtyJL && Number(window.jlHoldQtyJL(x.code)) > 0; });
  }
  function ensureAll() {
    var ls = codeList(), L = load(), chg = 0, c = cfg();
    ls.forEach(function (x) {
      var inp = window.jlResoInputJL && window.jlResoInputJL(x.code);
      if (!inp || !inp.bars) return;
      var sig = signalDateFor(inp.bars, x.code);
      if (!sig) return;
      var k = x.code + '|' + sig;
      if (L[k]) return;
      var rec = genRecord(x.code, x.name, sig, c, Number(window.jlHoldQtyJL(x.code)) || 0);
      if (!rec) return;
      L[k] = rec;
      chg = 1;
    });
    if (chg) save(L);
    return L;
  }

  function netOf(p, sp, bp) { var sh = p.sellQty; return +(((sp - bp) * sh) - p.costRate * (sp + bp) * sh).toFixed(2); }
  /* 实际卖出价对应的止损: 按实际卖价上移, 不低于计划止损 */
  function stopOf(p, sp) {
    var d = p.stopDist != null ? p.stopDist : p.stopPrice - p.sellPrice;
    return Math.max(p.stopPrice, rt(sp + d, p.tick || 0.01));
  }

  /* 15分K逐根模拟(p 是冻结的计划) */
  function sim15(p, bars, final) {
    if (!p || !p.sellPrice) return { st: 'none' };
    var S = p.sellPrice, B = p.buyPrice, stop = 0, state = 0, sp = 0, bp = 0, i, b;
    for (i = 0; i < bars.length; i++) {
      b = bars[i];
      if (state === 0) {
        if (b.h < S) continue;
        sp = b.o >= S ? b.o : S; state = 1; stop = stopOf(p, sp);
        /* 卖出这根: 不许买回; 但最高价已到止损 → 卖出后价格必然再涨到止损(开盘<卖价时须先过卖价, 开盘≥卖价时最高价在开盘之后) */
        if (b.h >= stop) { bp = stop; state = 3; break; }
        continue;
      }
      if (b.o <= B) { bp = b.o; state = 2; break; }                        /* 开盘已越过买回价 */
      if (b.o >= stop) { bp = b.o; state = 3; break; }                     /* 开盘已越过止损价 */
      if (b.l <= B && b.h >= stop) { bp = stop; state = 3; break; }        /* 同根都碰到, 顺序未知: 保守按止损 */
      if (b.l <= B) { bp = B; state = 2; break; }
      if (b.h >= stop) { bp = stop; state = 3; break; }
    }
    if (state === 0) return { st: final ? 'idle' : 'wait', net: 0 };
    if (state === 1) {
      if (!final) return { st: 'sold', sp: sp, stop: stop };
      bp = bars[bars.length - 1].c;
      return { st: 'open', sp: sp, bp: bp, stop: stop, net: netOf(p, sp, bp) };
    }
    return { st: state === 2 ? 'done' : 'stop', sp: sp, bp: bp, stop: stop, net: netOf(p, sp, bp) };
  }

  /* 只有日线: 卖出后最高价到止损且最低价没到买回价 → 必然止损; 最低价到了买回价 → 低点在卖出前还是后判不出 → 顺序不明 */
  function simDaily(p, d, final) {
    if (!p || !p.sellPrice) return { st: 'none' };
    if (d.h < p.sellPrice) return { st: final ? 'idle' : 'wait', net: 0 };
    var sp = d.o >= p.sellPrice ? d.o : p.sellPrice, stop = stopOf(p, sp);
    if (!final) return { st: 'sold', sp: sp, stop: stop };
    if (d.l > p.buyPrice) {
      if (d.h >= stop) return { st: 'stop', sp: sp, bp: stop, stop: stop, net: netOf(p, sp, stop) };
      return { st: 'open', sp: sp, bp: d.c, stop: stop, net: netOf(p, sp, d.c) };
    }
    return { st: 'unclear', why: '同日既卖出又触及买回价, 日线还原不出先后' };
  }

  function update(rec) {
    if (rec.final) return false;
    var p0 = rec.plan, q0 = window.jlHoldQtyJL ? Number(window.jlHoldQtyJL(rec.code)) : NaN;
    if (p0 && p0.sellPrice && isFinite(q0) && q0 < p0.sellQty) { /* 减仓到不够计划卖出的股数: 这张计划已不可执行 */
      rec.status = 'void'; rec.final = 1; rec.res = { st: 'void', why: '当前持仓' + q0 + '股 < 计划卖出' + p0.sellQty + '股' }; rec.cres = { st: 'void' };
      return true;
    }
    var inp = window.jlResoInputJL && window.jlResoInputJL(rec.code);
    if (!inp || !inp.bars) return false;
    var t = today(), m = mins(), i, dd;
    if (!rec.tradeDate) {
      for (i = 0; i < inp.bars.length; i++) {
        dd = day(inp.bars[i].t);
        if (dd > rec.signalDate && dd <= t && (dd < t || m >= 570)) { rec.tradeDate = dd; break; } /* 今天的日K开盘(09:30)前不算, 防占位K */
      }
      if (!rec.tradeDate) return false;
    }
    var td = rec.tradeDate, d = null;
    inp.bars.forEach(function (b) { if (day(b.t) === td) d = b; });
    if (!d) { rec.status = 'nodata'; rec.final = 1; rec.res = { st: 'nodata' }; rec.cres = { st: 'nodata' }; return true; }
    var isT = td === t, b15 = bars15(rec.code, td), closed = dayClosed(rec.code, td, b15), use15, fin;
    if (closed) { use15 = true; fin = true; }
    else if (isT) { /* 今天没收盘(或收盘后还没拉到定型数据): 只跟踪, 绝不定稿, 也绝不用日线定稿 */
      use15 = !!b15; fin = false;
      if (nowD().getTime() >= closeMs(td) && !freshFor(rec.code, td)) askRefresh(rec.code);
    }
    else if (!freshFor(rec.code, td) && (rec.wait || 0) < WAIT) { rec.wait = (rec.wait || 0) + 1; askRefresh(rec.code); return true; } /* 旧快照或没拉到: 重拉并等待, 先别用日线定稿 */
    else { use15 = false; fin = true; } /* 收盘后拉过仍缺根(缓存截断), 或等满次数: 用日线 */
    function run(p) { return use15 ? sim15(p, b15, fin) : simDaily(p, d, fin); }
    rec.res = run(rec.plan);
    rec.cres = rec.ctrl && rec.ctrl.sellPrice ? run(rec.ctrl) : { st: 'none' };
    rec.src = use15 ? '15分' : '日线';
    rec.status = rec.res.st;
    if (fin) rec.final = 1;
    return true;
  }
  function updateAll() {
    var L = ensureAll(), chg = 0;
    Object.keys(L).forEach(function (k) { if (update(L[k])) chg = 1; });
    if (chg) save(L);
    return L;
  }

  function stats() {
    var L = load(), s = { pending: 0, void: 0, noPlan: 0, nodata: 0, rec: 0, idle: 0, trig: 0, done: 0, stop: 0, open: 0, unclear: 0, net: 0, paired: 0, pnet: 0, pcnet: 0, ctrig: 0, cnet: 0 };
    Object.keys(L).forEach(function (k) {
      var m = L[k];
      if (!m.final) { s.pending++; return; }
      if (!m.plan || !m.plan.sellPrice) { if (m.status === 'nodata') s.nodata++; else s.noPlan++; return; }
      var r = m.res || {}, cr = m.cres || {};
      var okR = r.st && r.st !== 'unclear' && r.st !== 'nodata' && r.st !== 'none';
      var okC = m.ctrl && m.ctrl.sellPrice && cr.st && cr.st !== 'unclear' && cr.st !== 'nodata' && cr.st !== 'none';
      if (r.st === 'void') { s.void++; return; }
      if (r.st === 'unclear') s.unclear++;
      else if (r.st === 'nodata') s.nodata++;
      else if (okR) {
        s.rec++;
        if (r.st === 'idle') s.idle++; else { s.trig++; s[r.st]++; }
        s.net += r.net || 0;
      }
      if (okC) { if (cr.st !== 'idle') s.ctrig++; s.cnet += cr.net || 0; }
      if (okR && okC) { s.paired++; s.pnet += r.net || 0; s.pcnet += cr.net || 0; }
    });
    ['net', 'cnet', 'pnet', 'pcnet'].forEach(function (k) { s[k] = +s[k].toFixed(2); });
    return s;
  }

  function srcTxt(a) { return (a || []).map(function (x) { return NAME[x] || x; }).join('·'); }
  function latest(code, L) {
    var best = null;
    Object.keys(L).forEach(function (k) { var m = L[k]; if (m.code === code && (!best || m.signalDate > best.signalDate)) best = m; });
    return best;
  }

  function render(host) {
    var L = updateAll(), c = cfg(), s = stats(), A = '', Bz = '';
    codeList().forEach(function (x) {
      var m = latest(x.code, L);
      if (!m) { A += '<div style="margin:5px 0;font-size:12px"><b>' + x.name + '</b> <span style="opacity:.7">收盘后(15:15起)或开盘前生成次日计划</span></div>'; return; }
      var p = m.plan, td = m.tradeDate || '下一交易日';
      if (!p.sellPrice) {
        A += '<div style="margin:5px 0;font-size:12px"><b>' + x.name + '</b> <span style="opacity:.75">' + td + ' 不操作 · ' + p.none + '</span></div>';
        return;
      }
      A += '<div style="margin:6px 0;font-size:12px"><b>' + x.name + '</b> <small style="opacity:.7">' + td + ' · 据' + m.signalDate + '收盘 ' + f2(m.prevClose) + '</small><br>卖 <b>' + f2(p.sellPrice) + '</b> ×' + p.sellQty + '股 <small style="opacity:.7">(' + srcTxt(p.sellSrcs) + ')</small> → 买回 <b>' + f2(p.buyPrice) + '</b> <small style="opacity:.7">(' + srcTxt(p.buySrcs) + ')</small><br><small style="opacity:.85">价差' + (p.expectedSpread * 100).toFixed(1) + '% · 止损 ' + f2(p.stopPrice) + '(高开卖出则=卖价+' + f2(p.stopDist != null ? p.stopDist : p.stopPrice - p.sellPrice) + ') · 理由: 昨收上下最近的' + p.minSource + '种以上来源共振位</small></div>';
      var r = m.res, line = LAB[m.status] || m.status;
      if (r) {
        if (r.st === 'sold') line += ' · 卖出价 ' + f2(r.sp) + ' · 止损 ' + f2(r.stop);
        if (r.st === 'done' || r.st === 'stop') line += ' · ' + f2(r.sp) + '卖→' + f2(r.bp) + '买 · ' + money(r.net) + '(相对持有不动)';
        if (r.st === 'open') line += ' · 按收盘' + f2(r.bp) + '算 ' + money(r.net) + '(相对持有不动) · 仍少持仓' + p.sellQty + '股';
        if (r.st === 'unclear' || r.st === 'void') line += ' · ' + r.why;
      }
      Bz += '<div style="margin:4px 0;font-size:12px"><b>' + x.name + '</b> ' + line + (m.src ? ' <small style="opacity:.6">[' + m.src + (m.final ? '·定稿' : '·盘中') + ']</small>' : '') + '</div>';
    });
    var C;
    var base = '已记 ' + (s.rec + s.unclear + s.nodata + s.noPlan + s.void) + ' 张(不操作' + s.noPlan + ' · 数据不足' + s.nodata + ' · 顺序不明' + s.unclear + ' · 持仓变化作废' + s.void + ') · 触发 ' + s.trig + ' 次: 买回' + s.done + ' / 止损' + s.stop + ' / 收盘没买回' + s.open;
    if (s.trig < c.minSamples) C = base + '<br><b>样本不足，暂不评价</b>(触发 ' + s.trig + '/' + c.minSamples + ' 笔)';
    else C = base + '<br>买回完成率 ' + Math.round((s.done + s.stop) / s.trig * 100) + '% · 止损率 ' + Math.round(s.stop / s.trig * 100) + '%<br>配对样本 ' + s.paired + ' 张 · 策略 ' + money(s.pnet) + ' vs 随机对照 ' + money(s.pcnet) + '<br>(策略可用样本 ' + s.rec + ' / 对照可用样本 ' + s.ctrig + '+未触发; 只看累计收益不能判断优劣)';
    host.innerHTML = '<h3 style="margin-top:14px">次日做T计划<small>只记账不下单</small></h3>' + (A || '<div style="opacity:.6;font-size:12px">暂无持仓可算</div>') +
      '<h3 style="margin-top:12px">次日执行状态</h3>' + (Bz || '<div style="opacity:.6;font-size:12px">还没有计划进入执行</div>') +
      '<h3 style="margin-top:12px">历史复盘</h3><div style="font-size:11.5px;opacity:.9">' + C +
      '<br><span style="opacity:.65">规则: 只先卖后买回 · 动持仓' + Math.round(c.frac * 100) + '% · 每天最多1次 · 费用单边' + (c.cost * 100).toFixed(2) + '%估算(未含佣金起收价与实际税费差异) · 数字=相对一直持有不动的差额</span></div>';
  }

  function mount() {
    try {
      var card = document.getElementById('jlResoCardJL');
      if (!card || !window.JLReso) return;
      var h = document.getElementById('jlTRuleJL');
      if (!h) { h = document.createElement('div'); h.id = 'jlTRuleJL'; card.appendChild(h); }
      render(h);
    } catch (e) { }
  }
  setTimeout(mount, 5000); setTimeout(mount, 13000); setInterval(mount, 30000);

  window.JLTRule = {
    cfg: cfg, setCfg: setCfg, ensureAll: ensureAll, updateAll: updateAll, stats: stats, render: render, _load: load,
    _t: { closeConfirmed: closeConfirmed, fullDay: fullDay, dayClosed: dayClosed, sim15: sim15, simDaily: simDaily, signalDateFor: signalDateFor, genCtrl: genCtrl, mkPlan: mkPlan, update: update, genRecord: genRecord, stopOf: stopOf }
  };
})();
