// jl-glance1 回归: 9:25 判断规则 / 抄底灯 / 台账锁定·抄底触发·快照·定稿
const fs = require('fs'), path = require('path');
const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } };
let NOW = new Date('2026-10-30T09:20:00+08:00');
const RD = Date;
global.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW.getTime(); } };
const EV = [];
global.window = { dispatchEvent: e => EV.push(e) }; global.CustomEvent = function (t, o) { this.type = t; this.detail = o.detail; };
eval(fs.readFileSync(path.join(__dirname, '..', 'jl_glance.js'), 'utf8'));
const J = window.JLGlance;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const A = { atr: 1.0, kUp: 1.2, kDown: 1.2 };
const X = (o) => Object.assign({ code: '600105', name: '永鼎', hold: true, fresh: true, prev: 23.63, open: 23.7, base: 23.7, atr: A }, o);
// 判断
ok(J.decide(X(), 'red', []).act === 'skip', '1 闸红不碰');
ok(J.decide(X(), 'green', []).act === 'buy', '2 闸绿小缺口可买');
let r = J.decide(X({ open: 24.5 }), 'green', []);
ok(r.act === 'wait' && /高开不追/.test(r.why) && Math.abs(r.ref - (24.5 - 1.2)) < 1e-9, '3 高开≥0.6不追, 无共振位用下沿 ' + r.ref);
r = J.decide(X({ open: 24.5 }), 'green', [{ p: 24.0, n: 3 }, { p: 23.0, n: 2 }, { p: 25, n: 2 }]);
ok(r.ref === 24.0 && /共振位×3/.test(r.why), '4 回踩价=开盘下方最近共振位');
r = J.decide(X({ open: 24.5 }), 'green', [{ p: 22.9, n: 3 }]);
ok(Math.abs(r.ref - 23.3) < 1e-9, '5 共振位低于下沿不用');
ok(J.decide(X(), 'yellow', []).act === 'wait', '6 闸黄等回踩');
ok(J.decide(X({ fresh: false }), 'green', []).act === 'na', '7 开盘价不是今天的不判');
ok(J.decide(X({ atr: { why: '有效日K不足126根' } }), 'green', []).act === 'na', '8 ATR不足不判');
ok(J.decide(X({ open: 22.9 }), 'green', []).act === 'wait', '9 低开≤-0.6等回踩');
// 抄底灯
const P = { lo: 3615.7, hi: 3687.16 };
ok(J.dipState({ base: 3650 }, P, [], {}).k === 'off', '10 离得远不亮');
ok(J.dipState({ base: 3620 }, P, [], {}).k === 'buy', '11 贴近预判低可低吸');
ok(J.dipState({ base: 3620 }, P, [{ dir: -1, ago: 5 }], {}).k === 'avoid', '12 跳水别接');
ok(J.dipState({ base: 3610 }, P, [{ dir: -1, ago: 30 }], { state: '冰点' }).k === 'avoid', '13 冰点别接');
ok(J.dipState({ base: 3620 }, null, [], {}).k === 'na', '14 无预判带');
// 台账
const G = (list, lvl) => ({ gate: { lvl: lvl || 'green', sum: 3 }, list });
const K = (base, ev) => ({ sh: { base, qd: '20261030' }, pred: P, ev: ev || [], temp: {} });
const L = () => JSON.parse(store.jl_glance_log_v1 || '{}')['2026-10-30'] || {};
J.record(G([X({ fresh: false })]), K(3650));
ok(!L().picks, '15 9:20 不锁');
NOW = new Date('2026-10-30T09:26:00+08:00');
J.record(G([X(), X({ code: '600176', name: '巨石', fresh: false })]), K(3650));
ok(!L().picks, '16 还有票没开盘价不锁');
NOW = new Date('2026-10-30T09:27:00+08:00');
J.record(G([X(), X({ code: '600176', name: '巨石', open: 30, prev: 29.32, base: 30 })], 'green'), K(3650));
ok(L().picks && L().picks.length === 2 && L().gate.lvl === 'green', '17 全到就锁');
NOW = new Date('2026-10-30T10:00:00+08:00');
J.record(G([X()], 'red'), K(3650));
ok(L().gate.lvl === 'green' && L().picks.length === 2, '18 锁定后不改');
NOW = new Date('2026-10-30T10:05:00+08:00');
J.record(G([X()]), K(3620));
ok(L().dips.length === 1 && L().dips[0].k === 'buy' && EV.length === 1, '19 抄底触发+发事件');
NOW = new Date('2026-10-30T10:15:00+08:00');
J.record(G([X()]), K(3619));
ok(L().dips.length === 1, '20 同30分钟不重复');
NOW = new Date('2026-10-30T12:00:00+08:00');
J.record(G([X()]), K(3600));
ok(L().dips.length === 1, '21 午休不触发');
ok(L().snaps.length === 2, '22 每10分钟一个快照(10:00与10:05同槽) ' + L().snaps.length);
NOW = new Date('2026-10-30T15:06:00+08:00');
J.record(G([X({ base: 23.9, low: 23.5, high: 24.2, qd: '20261030' }), X({ code: '600176', name: '巨石', base: 29.0, low: 28.5, high: 30.2, qd: '20261030', open: 30, prev: 29.32 })]), K(3640.54));
const d = L();
ok(d.final === 1 && Math.abs(d.dips[0].ret - (3640.54 / 3620 - 1) * 100) < 1e-3, '23 抄底定稿收益');
ok(d.ctrl != null && typeof d.ctrl === 'number', '24 随机对照');
ok(d.picks[0].act === 'buy' && Math.abs(d.picks[0].ret - (23.9 / 23.7 - 1) * 100) < 1e-3, '25 可买收益=收盘/开盘');
ok(d.picks[1].act === 'wait' && d.picks[1].touched === 1, '26 等回踩碰到判定');
// 闸无数据不记抄底
store.jl_glance_log_v1 = '{}'; NOW = new Date('2026-10-30T10:35:00+08:00');
J.record(G([X()], 'nodata'), K(3620));
ok(!(L().dips || []).length, '31 闸无数据不记抄底');
// 10:00 后第一次打开不锁
store.jl_glance_log_v1 = '{}'; NOW = new Date('2026-10-30T10:01:00+08:00');
J.record(G([X()]), K(3650));
ok(!L().picks, '28 10:00后不补锁');
// 闸没数据时等, 09:58 起照锁
store.jl_glance_log_v1 = '{}'; NOW = new Date('2026-10-30T09:40:00+08:00');
J.record(G([X()], 'nodata'), K(3650));
ok(!L().picks, '29 闸无数据先不锁');
NOW = new Date('2026-10-30T09:58:00+08:00');
J.record(G([X()], 'nodata'), K(3650));
ok(L().picks && L().picks[0].act === 'na', '30 09:58 照现有数据锁');
// 周末不锁
delete store.jl_glance_log_v1; NOW = new Date('2026-10-31T10:00:00+08:00');
J.record(G([X()]), K(3650));
ok(!(JSON.parse(store.jl_glance_log_v1 || '{}')['2026-10-31'] || {}).picks, '27 周末不锁');
console.log('glance', pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
