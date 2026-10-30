// jl-abn1 回归: 跌中吸筹 / 尾盘打压 判定 + 记账(每天一次/快照/对照) + 次日结算
const fs = require('fs'), path = require('path');
const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } };
let NOW = new Date('2026-10-30T10:30:00+08:00');
const RD = Date;
global.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW.getTime(); } };
const EV = []; let BARS = {};
global.window = { dispatchEvent: e => EV.push(e), jlDailyBarsJL: c => BARS[c] || [] }; global.CustomEvent = function (t, o) { this.type = t; this.detail = o.detail; };
eval(fs.readFileSync(path.join(__dirname, '..', 'jl_fundabn.js'), 'utf8'));
const J = window.JLAbn;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const X = (o, ff) => Object.assign({ code: '600105', name: '永鼎', hold: true, base: 22.6, prev: 23.63, pct: -4.36, high: 23.41, low: 22.02, qd: '20261030', ff: Object.assign({ rt: 3e7, big: 5e7, mid: -1e7, sml: -2e7, hasB: true, ltsz: 3e10 }, ff || {}) }, o);
// 吸筹判定
ok(J.isAbsorb(X()) && J.isAbsorb(X()).k === 'absorb', '1 跌+主力进+大单进小单出');
ok(!J.isAbsorb(X({ pct: -0.5 })), '2 跌幅不够');
ok(!J.isAbsorb(X({}, { rt: -1e7 })), '3 主力出不算');
ok(!J.isAbsorb(X({}, { sml: 1e7 })), '4 散户也在买不算');
ok(!!J.isAbsorb(X({}, { hasB: false, big: 0, sml: 0 })), '5 无大中小单只看主力');
ok(!J.isAbsorb(X({ ff: null })), '6 无资金数据');
// 打压判定
const S = [[1432, 22.80, 1e7, 2e7, -1e7], [1440, 22.70, 5e6, 1e7, -5e6], [1443, 22.55, -2e7, -1e7, 1e7]];
let d = J.isDump(X({ low: 22.55 }), S, 1443);
ok(d && d.k === 'dump' && /11分钟跌/.test(d.why), '7 打压: 11分钟跌1.1% 主力减 大单减 小单增 贴最低 ' + (d && d.why));
ok(!J.isDump(X({ low: 22.0 }), S, 1443), '8 不贴最低不算');
ok(!J.isDump(X({ low: 22.55 }), [[1432, 22.80, 1e7, 2e7, -1e7], [1443, 22.70, -2e7, -1e7, 1e7]], 1443), '9 跌幅不够');
ok(!J.isDump(X({ low: 22.55 }), [[1432, 22.80, 1e7, 2e7, -1e7], [1443, 22.55, -2e7, 3e7, 1e7]], 1443), '10 大单在增加不算');
ok(!J.isDump(X({ low: 22.55 }), [[1440, 22.80, 1e7, 2e7, -1e7], [1443, 22.55, -2e7, -1e7, 1e7]], 1443), '11 不足8分钟没参照');
// 记账
const L = () => JSON.parse(store.jl_abn_log_v1 || '{}')['2026-10-30'] || {};
NOW = new Date('2026-10-30T09:50:00+08:00'); J.tick([X()], 950);
ok(!(L().ev || []).length, '12 10:00 前不记吸筹');
NOW = new Date('2026-10-30T10:30:00+08:00'); J.tick([X()], 1030);
ok(L().ev.length === 1 && EV.length === 1, '13 记吸筹+发事件');
J.tick([X()], 1035);
ok(L().ev.length === 1, '14 每天每类只一次');
J.tick([X({ qd: '20261029', code: '600176' })], 1040);
ok(L().ev.length === 1, '15 报价不是今天不记');
J.tick([X({ low: 22.55, base: 22.80 }, { rt: 1e7, big: 2e7, sml: -1e7 })], 1432);
J.tick([X({ low: 22.55, base: 22.55 }, { rt: -2e7, big: -1e7, sml: 1e7 })], 1443);
ok(L().ev.some(e => e.k === 'dump') && L().snaps['600105'].length === 2, '16 尾盘快照+打压');
J.tick([X({ low: 22.55, base: 22.94 })], 1506);
ok(L().base['600105'] === 22.94, '17 收盘记对照基准');
ok(J.state('600105').k === 'dump', '18 资金灯取打压优先');
// 次日结算
BARS['600105'] = [{ t: '2026-10-30', o: 22.6, c: 22.94 }, { t: '2026-11-02', o: 23.2, c: 23.5 }, { t: '2026-11-03', o: 23.5, c: 23.0 }, { t: '2026-11-04', o: 23, c: 24 }];
NOW = new Date('2026-11-02T10:00:00+08:00'); J.tick([], 1000);
const Y = JSON.parse(store.jl_abn_log_v1)['2026-10-30'];
const ab = Y.ev.find(e => e.k === 'absorb');
ok(Math.abs(ab.r1o - (23.2 / ab.px - 1) * 100) < 1e-3 && Math.abs(ab.r3c - (24 / ab.px - 1) * 100) < 1e-3 && ab.done === 1, '19 次日开/收/3日结算');
ok(Math.abs(Y.ctrl - (23.5 / 22.94 - 1) * 100) < 1e-3, '20 对照=全部票收盘到次日收盘');
ok(Object.keys(Y.snaps).length === 0, '21 过日清快照');
console.log('fundabn', pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
