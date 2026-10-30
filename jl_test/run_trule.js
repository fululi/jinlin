/* jl_trule v2.1 + jl_reso upTo 回归: node jl_test/run_trule.js (只测逻辑, 构造K线场景, 不进页面) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
let fail = 0, n = 0;
function ok(c, m) { n++; if (!c) { fail++; console.log('✗ ' + m); } else console.log('✓ ' + m); }

function env() {
  const store = {};
  const w = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() { } } },
    setTimeout() { }, setInterval() { }, console, Date, JSON, Math, Number, String, Object, isFinite, CustomEvent: function () { }
  };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(fs.readFileSync(path.join(root, 'jl_reso.js'), 'utf8'), w);
  vm.runInContext(fs.readFileSync(path.join(root, 'jl_trule.js'), 'utf8'), w);
  return w;
}
const W = env(), T = W.JLTRule._t;
const plan = { sellPrice: 10.3, buyPrice: 9.9, sellQty: 100, stopPrice: 10.5, stopDist: 0.2, tick: 0.01, costRate: 0.0015 };
function bar(t, o, h, l, c) { return { t: '2026-10-29 ' + t, o, h, l, c }; }
function day16(o) { /* 完整一天16根, 全部在 10.0~10.1 之间 */
  const hs = ['09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00'];
  return hs.map(h => bar(h, 10, 10.1, 10, 10.05));
}

/* 问题4: 卖出那根最高价已到止损 → 止损(原来会被跳过, 之后回落买回记成赚) */
{
  const b = day16(); b[2] = bar('10:15', 10.1, 10.6, 10.05, 10.4); b[5] = bar('11:00', 10.0, 10.0, 9.8, 9.85);
  const r = T.sim15(plan, b, true);
  ok(r.st === 'stop' && r.sp === 10.3 && r.bp === 10.5, '卖出那根冲过止损 → 止损 (得 ' + r.st + ' ' + r.sp + '→' + r.bp + ')');
}
/* 问题5: 跳空高开卖在开盘价, 止损跟着上移 */
{
  const b = day16(); b[0] = bar('09:45', 10.6, 10.65, 10.55, 10.6); b[1] = bar('10:00', 10.6, 10.75, 10.5, 10.7); b[3] = bar('10:30', 10.2, 10.2, 9.85, 9.9);
  const r = T.sim15(plan, b, true);
  ok(r.st === 'done' && r.sp === 10.6 && r.stop === 10.8 && r.bp === 9.9, '高开10.6卖, 止损=10.8, 10.75没触发, 回落9.9买回 (得 ' + r.st + ' stop=' + r.stop + ')');
  const b2 = day16(); b2[0] = bar('09:45', 10.6, 10.85, 10.55, 10.8);
  const r2 = T.sim15(plan, b2, true);
  ok(r2.st === 'stop' && r2.bp === 10.8 && r2.net < 0, '高开10.6卖, 同根冲到10.85 → 止损10.8且亏 (net=' + r2.net + ')');
}
/* 原有规则不变: 卖出那根不买回 / 同根双碰按止损 */
{
  const b = day16(); b[2] = bar('10:15', 10.1, 10.35, 9.8, 9.9);
  ok(T.sim15(plan, b, true).st === 'open', '卖出那根又跌到买回价 → 不买回, 收盘结算');
  const b2 = day16(); b2[2] = bar('10:15', 10.1, 10.35, 10.1, 10.3); b2[4] = bar('10:45', 10.3, 10.6, 9.8, 10);
  ok(T.sim15(plan, b2, true).st === 'stop', '之后同根既碰买回又碰止损 → 保守止损');
}
/* 日线: 最低没到买回 + 最高到止损 → 确定止损; 最低到买回 → 顺序不明 */
{
  ok(T.simDaily(plan, { o: 10, h: 10.55, l: 9.95, c: 10.4 }, true).st === 'stop', '日线 卖后冲过止损、没到买回 → 止损(原来记顺序不明)');
  ok(T.simDaily(plan, { o: 10, h: 10.4, l: 9.95, c: 10.2 }, true).st === 'open', '日线 卖后没止损没买回 → 收盘结算');
  ok(T.simDaily(plan, { o: 10, h: 10.4, l: 9.85, c: 10.2 }, true).st === 'unclear', '日线 同日到过买回价 → 顺序不明');
  const r = T.simDaily(plan, { o: 10.6, h: 10.75, l: 10.4, c: 10.5 }, true);
  ok(r.st === 'open' && r.stop === 10.8, '日线 高开10.6卖, 最高10.75 < 新止损10.8 → 不算止损');
}
/* 问题7: 完整日=16根且09:45起15:00止 */
{
  ok(T.fullDay(day16()), '16根完整日 → 完整');
  ok(!T.fullDay(day16().slice(5)), '缓存最早一天被截断(11根, 末根15:00) → 不完整(原来算完整)');
  ok(!T.fullDay(day16().slice(0, 12)), '盘中未走完 → 不完整');
  { const d = day16(); d[5] = d[4]; ok(!T.fullDay(d), '16根但有一根重复(缺11:00) → 不完整'); }
  { const d = day16(); d.splice(8, 1); d.push(bar('15:15', 10, 10.1, 10, 10)); ok(!T.fullDay(d), '16根但缺13:15、多15:15 → 不完整'); }
  { const d = day16(); d[3] = bar('10:30', 10, 9.9, 10, 10); ok(!T.fullDay(d), '最高<最低 → 不完整'); }
  { const d = day16(); d[3] = bar('10:30', 0, 10.1, 0, 10); ok(!T.fullDay(d), 'OHLC 为0 → 不完整'); }
  { const d = day16(); d[0] = bar('09:45', 0.623, 0.638, 0.624, 0.637); ok(T.fullDay(d), '首根开盘含竞价略低于最低(589420 10-21真实值) → 仍算完整'); }
  { const d = day16(); d[3] = bar('10:30', 10, 10.1, 10, 10.2); ok(!T.fullDay(d), '收盘高于最高 → 不完整'); }
}

/* 问题6 + 集成: 计划生成 → 过去交易日先等15分K, 不立刻用日线定稿 */
function dbars(lastDay) {
  const out = [], d0 = new Date('2026-09-01T12:00:00');
  for (let i = 0; ; i++) {
    const d = new Date(d0.getTime() + i * 864e5), wd = d.getDay(), s = d.toLocaleDateString('sv-SE');
    if (s > lastDay) break;
    if (wd === 0 || wd === 6) continue;
    out.push({ t: s, o: 10, h: 10.3, l: 9.7, c: 10 });
  }
  return out.slice(-25);
}
const ms = s => new Date(s).getTime();
function mk(bars0) { /* 造一个页面环境: m15/at/refresh 都可控 */
  const w = env(), st = { bars: bars0, m15: null, refresh: 0, onRefresh: null };
  w.jlResoCodesJL = () => [{ code: '600000', name: '测试' }];
  w.jlHoldQtyJL = () => 1000;
  w.jlResoInputJL = () => ({ bars: st.bars, cur: 10, prev: 0, gaps: [] });
  w.jlTBarsJL = () => st.m15;
  w.jlTBarsJL.info = {}; w.jlTBarsJL.at = {};
  w.jlTBarsJL.refresh = () => { st.refresh++; if (st.onRefresh) st.onRefresh(); };
  w.jlFibLvJL = () => null;
  return { w, st };
}
const on = (d, b) => b.map(x => ({ ...x, t: d + x.t.slice(10) }));
{
  const { w, st } = mk(dbars('2026-10-28'));
  const sig = '2026-10-28', k = '600000|' + sig;
  /* 14:50 拉的快照: 16根齐了(末根标15:00, 其实还在走) → 15:20 不能当收盘确认, 要重拉 */
  st.m15 = on(sig, day16()); w.jlTBarsJL.at['600000'] = ms('2026-10-28T14:50:00');
  w.__jlNow = '2026-10-28T15:20:00';
  let L = w.JLTRule.updateAll();
  ok(!L[k] && st.refresh === 1, '信号日快照是14:50拉的 → 不生成计划并请求重拉 (refresh=' + st.refresh + ')');
  w.jlTBarsJL.at['600000'] = ms('2026-10-28T15:01:00');
  L = w.JLTRule.updateAll();
  const rec = L[k];
  ok(rec && rec.signalDate === sig && !rec.final && rec.plan.sellPrice, '15:01 重拉后 → 生成次日计划 (plan=' + JSON.stringify(rec && rec.plan).slice(0, 60) + ')');
  const S = rec.plan.sellPrice, B = rec.plan.buyPrice, td = '2026-10-29';
  st.bars = dbars(td); st.bars[st.bars.length - 1] = { t: td, o: 10, h: S + 0.05, l: B - 0.05, c: 10 };
  const run = on(td, day16()); run[2] = bar('10:15', 10, S + 0.01, 10, S); run[6] = bar('11:15', S, S, B - 0.01, B);
  /* 交易日当天 14:50: 东财末根已标15:00, 16根齐 → 只跟踪不定稿 */
  st.m15 = run; w.jlTBarsJL.at['600000'] = ms('2026-10-29T14:50:00'); w.__jlNow = '2026-10-29T14:50:00';
  L = w.JLTRule.updateAll();
  ok(!L[k].final && L[k].status === 'done' && L[k].src === '15分', '当天14:50 已买回但不定稿 (final=' + L[k].final + ' st=' + L[k].status + ')');
  /* 当天 15:10, 快照仍是14:50的 → 不定稿, 请求重拉; 即使等很多次也不会用日线定稿 */
  w.__jlNow = '2026-10-29T15:10:00'; const r0 = st.refresh;
  for (let i = 0; i < 15; i++) L = w.JLTRule.updateAll();
  ok(!L[k].final && L[k].src === '15分' && st.refresh > r0, '当天收盘后快照还是旧的 → 刷新15次也不定稿、不用日线, 请求重拉');
  w.jlTBarsJL.at['600000'] = ms('2026-10-29T15:00:30');
  L = w.JLTRule.updateAll();
  ok(L[k].final && L[k].src === '15分' && L[k].status === 'done', '15:00:30 拉到定型数据 → 用15分定稿为买回');
}
{
  /* 过去交易日 + 旧快照(交易日14:30拉的, 后台挂到晚上): 不能直接日线定稿, 先重拉 */
  const td = '2026-10-29', { w, st } = mk(dbars(td));
  const rec = { code: '600000', name: '测试', signalDate: '2026-10-28', tradeDate: td, status: 'pending', final: 0, plan: { sellPrice: 10.2, buyPrice: 9.8, sellQty: 200, stopPrice: 10.5, stopDist: 0.3, tick: 0.01, costRate: 0.0015 } };
  rec.ctrl = { ...rec.plan };
  st.bars[st.bars.length - 1] = { t: td, o: 10, h: 10.25, l: 9.75, c: 10 };
  const k = '600000|2026-10-28';
  w.localStorage.setItem('jl_trule_log_v2', JSON.stringify({ [k]: rec }));
  const half = on(td, day16()).slice(0, 12); half[3] = bar('10:30', 10, 10.25, 10, 10.2); half[8] = bar('13:15', 10.1, 10.1, 9.75, 9.8);
  st.m15 = on(td, half); w.jlTBarsJL.at['600000'] = ms('2026-10-29T14:30:00'); w.jlTBarsJL.info['600000'] = 'end';
  w.__jlNow = '2026-10-30T08:00:00';
  let L = w.JLTRule.updateAll();
  ok(!L[k].final && L[k].wait === 1 && st.refresh === 1, '次日早上看到交易日14:30的旧快照(12根) → 等待+重拉, 不日线定稿 (final=' + L[k].final + ' wait=' + L[k].wait + ' refresh=' + st.refresh + ')');
  st.onRefresh = () => { st.m15 = on(td, day16()).map((x, i) => i === 3 ? bar('10:30', 10, 10.25, 10, 10.2) : i === 8 ? bar('13:15', 10.1, 10.1, 9.75, 9.8) : x); w.jlTBarsJL.at['600000'] = ms('2026-10-30T08:02:05'); };
  w.__jlNow = '2026-10-30T08:02:01'; /* 过了2分钟节流 */
  L = w.JLTRule.updateAll(); L = w.JLTRule.updateAll();
  ok(L[k].final && L[k].src === '15分' && L[k].status === 'done', '重拉到完整16根 → 15分定稿买回 (src=' + L[k].src + ' st=' + L[k].status + ')');
}
{
  /* 收盘后拉的快照里这一天就是缺根(缓存最早一天被截断) → 不等, 直接日线 */
  const td = '2026-10-29', { w, st } = mk(dbars(td));
  const rec = { code: '600000', name: '测试', signalDate: '2026-10-28', tradeDate: td, status: 'pending', final: 0, plan: { sellPrice: 10.2, buyPrice: 9.8, sellQty: 200, stopPrice: 10.5, stopDist: 0.3, tick: 0.01, costRate: 0.0015 } };
  st.bars[st.bars.length - 1] = { t: td, o: 10, h: 10.25, l: 9.85, c: 10.1 };
  w.localStorage.setItem('jl_trule_log_v2', JSON.stringify({ '600000|2026-10-28': rec }));
  st.m15 = on(td, day16().slice(8)); w.jlTBarsJL.at['600000'] = ms('2026-10-30T09:00:00');
  w.__jlNow = '2026-10-30T09:00:00';
  const L = w.JLTRule.updateAll(), r = L['600000|2026-10-28'];
  ok(r.final && r.src === '日线' && r.status === 'open' && st.refresh === 0, '收盘后拉的快照里该日只有8根 → 直接日线定稿(收盘结算), 不重拉');
}
{
  /* 15分K一直拉不到: 等满10次后用日线 */
  const td = '2026-10-29', { w, st } = mk(dbars(td));
  const rec = { code: '600000', name: '测试', signalDate: '2026-10-28', tradeDate: td, status: 'pending', final: 0, plan: { sellPrice: 10.2, buyPrice: 9.8, sellQty: 200, stopPrice: 10.5, stopDist: 0.3, tick: 0.01, costRate: 0.0015 } };
  st.bars[st.bars.length - 1] = { t: td, o: 10, h: 10.25, l: 9.75, c: 10 };
  w.localStorage.setItem('jl_trule_log_v2', JSON.stringify({ '600000|2026-10-28': rec }));
  w.__jlNow = '2026-10-30T08:00:00';
  let L;
  for (let i = 0; i < 10; i++) { L = w.JLTRule.updateAll(); }
  ok(!L['600000|2026-10-28'].final, '没拉到时前10次都在等');
  L = w.JLTRule.updateAll();
  ok(L['600000|2026-10-28'].final && L['600000|2026-10-28'].src === '日线' && L['600000|2026-10-28'].status === 'unclear', '等满10次仍没有15分K → 日线定稿(顺序不明)');
}

{
  /* 持仓变化: 生成后减仓到不够卖 → 作废不进统计; 减掉的正好是计划卖出量 → 照常 */
  const td = '2026-10-29', { w, st } = mk(dbars(td));
  const plan = { sellPrice: 10.2, buyPrice: 9.8, sellQty: 200, stopPrice: 10.5, stopDist: 0.3, tick: 0.01, costRate: 0.0015 };
  const mkRec = () => ({ code: '600000', name: '测试', signalDate: '2026-10-28', tradeDate: td, status: 'pending', final: 0, plan, ctrl: { ...plan } });
  st.bars[st.bars.length - 1] = { t: td, o: 10, h: 10.25, l: 9.85, c: 10.1 };
  w.localStorage.setItem('jl_trule_log_v2', JSON.stringify({ '600000|2026-10-28': mkRec() }));
  w.jlHoldQtyJL = () => 100; w.__jlNow = '2026-10-29T10:00:00';
  let L = w.JLTRule.updateAll(), r = L['600000|2026-10-28'];
  ok(r.final && r.status === 'void' && w.JLTRule.stats().void === 1 && w.JLTRule.stats().rec === 0, '减仓到100股 < 计划卖200股 → 作废, 不进统计 (' + (r.res && r.res.why) + ')');
  w.localStorage.setItem('jl_trule_log_v2', JSON.stringify({ '600000|2026-10-28': mkRec() }));
  w.jlHoldQtyJL = () => 800;
  L = w.JLTRule.updateAll(); r = L['600000|2026-10-28'];
  ok(r.status !== 'void', '实际做T卖掉200股后剩800股 → 不作废');
}

/* jl_reso upTo: 不传=原行为; 传过去的日期=hist; 传今天=不做昨收核对 */
{
  const w = env();
  const bars = dbars('2026-10-29');
  w.jlResoInputJL = () => ({ bars, cur: 10, prev: 10.5, gaps: [11], atrBand: { up: 11, dn: 9 } });
  w.jlFibLvJL = () => ({ lv: [{ v: 10.3 }] });
  w.__jlNow = undefined;
  const a = w.JLReso.compute('600000');
  ok(a && a.pd === '2026-10-29' && !a.hist && a.chk === 1 && !!a.stale, '不传 upTo: 原行为, 昨收核对照常(差5% → stale)');
  const h = w.JLReso.compute('600000', '2026-10-27');
  ok(h && h.pd === '2026-10-27' && h.hist === true && h.chk === 0 && !h.stale, '传过去日期: hist=true, 不做昨收核对');
  ok(h && !h.levels.some(l => l.srcs.indexOf('fib') >= 0 || l.srcs.indexOf('gap') >= 0), '传过去日期: 不用斐波/缺口');
  const t = new Date().toLocaleDateString('sv-SE');
  const bars2 = dbars('2026-10-29').concat([{ t, o: 10, h: 10.3, l: 9.7, c: 10 }]);
  w.jlResoInputJL = () => ({ bars: bars2, cur: 10, prev: 10.5, gaps: [] });
  const td = w.JLReso.compute('600000', t);
  ok(td && td.pd === t && !td.hist && td.chk === 0 && !td.stale, '传今天(盘后): 不拿今日昨收去核对今天收盘');
}

console.log('\n' + (n - fail) + '/' + n + ' 通过');
process.exit(fail ? 1 : 0);
