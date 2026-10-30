// jl-memo2 回归: 共振位日K停在旧日子要标过时、数据追上后重算、过时不进统计。数据=腾讯永鼎真实日K(fixture_reso_600105.json, 10-30抓)
const fs = require('fs'), path = require('path');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_reso_600105.json'), 'utf8')).data.sh600105.qfqday;
const ALL = raw.map(r => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4] }));
const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } };
let NOW = new Date('2026-10-30T10:00:00+08:00');
const RD = Date;
global.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW.getTime(); } };
let INP = null;
global.window = { jlResoInputJL: () => INP, dispatchEvent() {} };
global.document = { getElementById: () => null, addEventListener() {} };
global.CustomEvent = function () {};
global.setInterval = () => 0; global.setTimeout = () => 0;
eval(fs.readFileSync(path.join(__dirname, '..', 'jl_reso.js'), 'utf8'));
const R = window.JLReso;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }
const upTo = d => ALL.filter(b => b.t <= d);
const L = () => JSON.parse(store.jl_reso_log_v1 || '{}');

// 1 日K停在10-28, 今日报价反推昨收=10-29收盘 → 过时
INP = { bars: upTo('2026-10-28'), cur: 22.94, prev: 23.63, gaps: [] };
let e = R.ensure('600105');
ok(e && e.stale && /10-28/.test(e.stale) && e.chk === 1, '1 过时标记 ' + (e && e.stale));
// 2 收盘定稿后过时行不进统计
NOW = new Date('2026-10-30T15:20:00+08:00');
INP.bars = upTo('2026-10-28').concat([{ t: '2026-10-30', o: 22.62, c: 22.94, h: 23.18, l: 22.02 }]);
R.settle('600105');
ok(L()['2026-10-30']['600105'].final === 1 && R.stats().cards === 0, '2 过时不计入 cards=' + R.stats().cards);
// 3 新的一天: 报价还没到今日(prev=0) → 能算但 chk=0, 不标过时
delete store.jl_reso_log_v1; NOW = new Date('2026-10-30T09:05:00+08:00');
INP = { bars: upTo('2026-10-29'), cur: 23.63, prev: 0, gaps: [] };
e = R.ensure('600105');
ok(e && e.chk === 0 && !e.stale, '3 无报价先算不判');
// 4 报价到了且对得上 → 重算成正式(chk=1, 不过时), 昨收=10-29
NOW = new Date('2026-10-30T09:31:00+08:00');
INP.prev = 23.63; INP.cur = 22.7;
e = R.ensure('600105');
ok(e.chk === 1 && !e.stale && e.pd === '2026-10-29' && e.pc === 23.63, '4 正式 pd=' + e.pd);
// 5 正式之后不再重算(at 不变)
const at = e.at; NOW = new Date('2026-10-30T11:00:00+08:00');
ok(R.ensure('600105').at === at, '5 正式后锁定');
// 6 过时 → 日K追上后自动换成正式
delete store.jl_reso_log_v1;
INP = { bars: upTo('2026-10-28'), cur: 22.94, prev: 23.63, gaps: [] };
ok(R.ensure('600105').stale, '6a 先过时');
INP.bars = upTo('2026-10-29');
e = R.ensure('600105');
ok(!e.stale && e.pd === '2026-10-29', '6b 追上后正式');
// 7 旧版条目(无chk字段, 用10-28算的) → 今日报价到了会被重核
const o = L(); o['2026-10-30']['600105'] = { at: '08:00', pc: 25.75, pd: '2026-10-28', atr: 1.8, levels: [], ctrl: [], final: 0 };
store.jl_reso_log_v1 = JSON.stringify(o);
e = R.ensure('600105');
ok(e.pd === '2026-10-29' && e.chk === 1, '7 旧条目重核');
// 8 过时期间日内已碰的价位, 重算后用当日高低重判
NOW = new Date('2026-10-30T15:20:00+08:00');
INP.bars = upTo('2026-10-29').concat([{ t: '2026-10-30', o: 22.62, c: 22.94, h: 23.18, l: 22.02 }]);
e = R.settle('600105');
const exp = e.levels.filter(x => 23.18 >= x.p - 0.05 * e.atr && 22.02 <= x.p + 0.05 * e.atr).length;
ok(e.levels.filter(x => x.hit).length === exp && e.final === 1 && R.stats().cards === 1, '8 重判命中+计入');
console.log('reso_stale', pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
