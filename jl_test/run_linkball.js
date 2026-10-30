// jl-link1 回归: 浮球提醒逻辑(预判带临近/冲出、板块10分钟急拉回落、共振位、大盘快拉), 盘外不提醒, 同键不重复
const fs = require('fs'), path = require('path');
const store = {};
global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } };
let NOW = new Date('2026-10-30T10:00:00+08:00');
const RD = Date;
global.Date = class extends RD { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW.getTime(); } };
const L = {};
global.window = { addEventListener: (k, f) => { L[k] = f; }, jlLinkInputJL: () => null };
global.document = { readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelector: () => null };
global.navigator = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'jl_linkball.js'), 'utf8'));
const J = window.JLLink;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const A = () => (JSON.parse(store.jl_link_alert_v1 || '{}')['2026-10-30'] || []);
const D = (base, holds, ev) => ({ sh: { base, qd: '20261030', pct: 0 }, pred: { lo: 3615.7, hi: 3687.16 }, holds: holds || [], ev: ev || [] });

J._check(D(3640));
ok(A().length === 0, '1 带中间不提醒');
J._check(D(3677));                       // 距高 0.27%
ok(A().some(x => x.k === 'ph-n'), '2 接近预判高');
J._check(D(3678));
ok(A().filter(x => x.k === 'ph-n').length === 1, '3 同键不重复');
J._check(D(3690));
ok(A().some(x => x.k === 'ph-x' && /回撤/.test(x.txt)), '4 冲过预判高');
J._check(D(3612));
ok(A().some(x => x.k === 'pl-x'), '5 跌破预判低');
// 板块: 0分钟 +0.5, 6分钟 +1.6 → 急拉
const h = p => [{ name: '永鼎股份', code: '600105', sec: '通信设备', secPct: p }];
J._check(D(3640, h(0.5)));
NOW = new Date('2026-10-30T10:06:00+08:00');
J._check(D(3640, h(1.6)));
ok(A().some(x => /^su-通信设备/.test(x.k) && /拉升 1.1/.test(x.txt)), '6 板块10分钟拉升≥1点');
// 超过10分钟的旧样本不算: 10:20 降到 1.0, 10:06 的 1.6 已过窗 → 只和 10:20 自己比, 不提回落
NOW = new Date('2026-10-30T10:20:00+08:00');
J._check(D(3640, h(1.0)));
ok(!A().some(x => /^sd-/.test(x.k)), '7 窗外样本不算');
NOW = new Date('2026-10-30T10:25:00+08:00');
J._check(D(3640, h(-0.1)));
ok(A().some(x => /^sd-通信设备/.test(x.k)), '8 板块回落≥1点');
// 板块数据过龄不判
const n0 = A().length; J._check(Object.assign(D(3640, h(3)), { secStale: true }));
ok(A().length === n0, '9 板块过龄不判');
// 大盘快拉(2分钟内)
J._check(D(3640, [], [{ name: '上证', dir: 1, ago: 1 }]));
ok(A().some(x => /上证 快拉/.test(x.txt)), '10 大盘快拉');
// 共振位事件
L['jlreso:near']({ detail: { code: 'sh000001', p: 3705.73, n: 2, srcs: ['atr', 'fib'] } });
ok(A().some(x => /上证 接近共振位 3705.73 ×2/.test(x.txt)), '11 共振位临近');
// 午休不提醒
store.jl_link_alert_v1 = '{}'; NOW = new Date('2026-10-30T12:10:00+08:00');
J._check(D(3690));
ok(A().length === 0, '12 午休不提醒');
// 报价不是今天的不提醒
NOW = new Date('2026-10-30T10:00:00+08:00');
J._check({ sh: { base: 3690, qd: '20261029' }, pred: { lo: 3615.7, hi: 3687.16 }, holds: [] });
ok(A().length === 0, '13 旧报价不提醒');
console.log('linkball', pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
