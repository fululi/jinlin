/* 10-30 做T五处修正回归: ①兆易100股能出次日计划 ②真实费用 ③对照守 09:35~14:50 卖/14:57 前接 ④提醒价落账 ⑤自设股数不超过持仓 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } }
const near = (a, b) => Math.abs(a - b) < 0.005;
function ctx(extra) {
  const st = {}, w = Object.assign({ document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement: () => ({}), head: { appendChild() {} } },
    localStorage: { getItem: (k) => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); } }, setTimeout() {}, setInterval() {}, Math, Date, JSON, String, Number, Object, Infinity, isFinite, console, CustomEvent: function () {} }, extra || {});
  w.window = w; vm.createContext(w); return { w, st };
}
const { w: TW, st: TS } = ctx();
vm.runInContext(fs.readFileSync(path.join(root, 'jl_tintra.js'), 'utf8'), TW);
const A = TW.JLTIntra._t, C = A.DEF;
const m = { exports: {} }; new Function('module', 'exports', 'require', fs.readFileSync(path.join(process.env.HOME, 'jl_shadow', 'multi.js'), 'utf8') + '\nmodule.exports._t={control,net,rtFee,DEF};')(m, m.exports, require);
const S = m.exports._t;

/* ② 费用: 兆易100股 271.50卖/269.98接; 小额单走5元最低佣金 */
const f1 = A.rtFee(271.5, 269.98, 100, C);
ok(near(f1, 6.7875 + 0.2715 + 13.575 + 6.7495 + 0.26998), '兆易一轮费用=佣金两边+过户费两边+卖出印花税 ≈ ' + f1.toFixed(2) + '元(旧口径81.15元)');
ok(near(A.rtFee(10, 9.8, 100, C), 5 + 0.01 + 0.5 + 5 + 0.0098), '1000元小单: 佣金按最低5元收');
ok(A.rtFee(271.5, 269.98, 100, C) === S.rtFee(271.5, 269.98, 100, S.DEF), '盘中版与影子版费用一致');
ok(A.net([{ sp: 271.5, bp: 269.98 }], 100, C) === +(152 - f1).toFixed(2), 'net = 差价 − 真实费用');

/* ③ 对照组时间窗 */
function rnd(seed) { let h = seed >>> 0; return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }; }
function day(seed) {
  const g = rnd(seed), b = []; let p = 10;
  const mins = []; for (let t = 9 * 60 + 30; t <= 11 * 60 + 30; t++) mins.push(t); for (let t = 13 * 60 + 1; t <= 15 * 60; t++) mins.push(t);
  mins.forEach((t) => { const o = p, c = o * (1 + (g() - 0.5) * 0.008), h = Math.max(o, c) * (1 + g() * 0.002), l = Math.min(o, c) * (1 - g() * 0.002);
    b.push({ t: '2026-10-30 ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), o, h, l, c }); p = c; });
  return b;
}
let bad = 0, overlap = 0, total = 0, same = 0, miss = 0;
for (let s = 1; s <= 300; s++) {
  const b = day(s), rs = A.simulate(b, 0.12, C, [], [], '2026-10-30', false), cs = A.control(b, rs, 's' + s);
  total += cs.length; miss += rs.length - cs.length;
  cs.forEach((o, i) => { if (o.sellT < '09:35' || o.sellT >= '14:50' || o.buyT > '14:57') bad++; cs.forEach((p, j) => { if (i < j && !(o.bk < p.sk || o.sk > p.bk)) overlap++; }); });
  if (JSON.stringify(cs) === JSON.stringify(S.control(b, rs, 's' + s))) same++;
}
ok(total > 0 && bad === 0, '对照 ' + total + ' 笔: 卖出全在 09:35~14:50 前, 接回全不晚于 14:57');
ok(overlap === 0, '对照各轮不重叠');
ok(miss === 0, '每一轮策略都配到了对照');
ok(same === 300, '盘中版与影子版对照逐笔一致');

/* ⑤ 股数 */
ok(A.shOf('603986', 100) === 100, '兆易持仓100股, 默认做T 100股');
ok(A.shOf('603986', 0) === 0, '兆易清仓后 → 0股(不再模拟)');
TS.jl_tintra_qty_v1 = JSON.stringify({ '600105': 500 });
ok(A.shOf('600105', 300) === 300, '自设500股但只持有300股 → 300股');
ok(A.shOf('600105', 1900) === 500, '自设500股, 持有1900股 → 500股');
delete TS.jl_tintra_qty_v1;
ok(A.shOf('600105', 1900) === 400 && A.shOf('600000', 200) === 100 && A.shOf('600000', 50) === 0, '没设: 1900股→400, 200股→100, 50股→0');

/* ① 次日计划: 兆易100股能出计划, 费用按真实口径 */
const { w: RW, st: RS } = ctx();
vm.runInContext(fs.readFileSync(path.join(root, 'jl_reso.js'), 'utf8'), RW);
vm.runInContext(fs.readFileSync(path.join(root, 'jl_trule.js'), 'utf8'), RW);
const T = RW.JLTRule._t, c = T.cfg();
ok(T.shOf('603986', 100, c) === 100, '次日计划: 兆易100股 → 卖100股(原来是0, 永远出不了计划)');
ok(T.shOf('603986', 0, c) === 0, '次日计划: 兆易清仓 → 0');
ok(T.shOf('600105', 1900, c) === 400, '次日计划: 永鼎1900股 → 400股(和原来一样)');
const plan = T.mkPlan(275, 265, 100, 17.6, c, [], [], '603986');
ok(plan.sellQty === 100 && plan.fee && plan.fee.stamp === 0.0005 && !('costRate' in plan), '冻结的计划带真实费率');
ok(near(T.netOf(plan, 275, 265), 1000 - A.rtFee(275, 265, 100, C)), '次日计划净额与盘中版同一套费用');
ok(near(T.netOf({ sellQty: 200, costRate: 0.0015 }, 10.2, 9.8), 80 - A.rtFee(10.2, 9.8, 200, C)), '旧计划(只有costRate)也按真实费用算');

/* ④ 提醒价落账: 浮球到价那刻的实时价记下, 不改按分钟收盘价的账 */
{
  const b = day(7).map((x) => Object.assign({}, x)); let hit = null;
  const bars = b.slice(0, 60);
  const cur = { v: 0 };
  const { w: HW, st: HS } = ctx({});
  HW.jlM1RowsJL = () => bars.map((x) => ({ t: x.t.replace(/[- :]/g, '').slice(0, 12), o: x.o, h: x.h, l: x.l, c: x.c }));
  HW.jlResoInputJL = () => ({ prev: 10, cur: cur.v, bars: Array.from({ length: 12 }, (_, i) => ({ t: '2026-10-' + String(10 + i).padStart(2, '0'), o: 10, h: 10.3, l: 9.8, c: 10 })) });
  HW.jlHoldQtyJL = () => 1000; HW.jlResoCodesJL = () => [{ code: '600000', name: '测试' }];
  const RealDate = Date; HW.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-10-30T10:31:00'])); } static now() { return new RealDate('2026-10-30T10:31:00').getTime(); } };
  vm.runInContext(fs.readFileSync(path.join(root, 'jl_tintra.js'), 'utf8'), HW);
  let L = HW.JLTIntra.updateAll(), r = L['600000|2026-10-30'];
  ok(r && !r.none && r.end, '盘中卡能算(1分K ' + (r && r.bars) + ' 根)');
  if (r && r.end) {
    const e = r.end, wantSell = e.st === 0;
    cur.v = wantSell ? 99 : 0.01; /* 实时价远超卖点/远低于接回线 → 必然到价 */
    L = HW.JLTIntra.updateAll(); r = L['600000|2026-10-30'];
    const key = (wantSell ? 's' : 'b') + r.rounds.length;
    ok(r.hits && r.hits[key] && r.hits[key].px === cur.v && r.hits[key].t === '10:31', '到价那一刻记下提醒价 ' + key + '=' + (r.hits[key] && r.hits[key].px));
    const net0 = r.net; cur.v = wantSell ? 120 : 0.02;
    L = HW.JLTIntra.updateAll(); r = L['600000|2026-10-30'];
    ok(r.hits[key].px === (wantSell ? 99 : 0.01), '同一轮只记第一次到价, 后面刷新不覆盖');
    ok(r.net === net0, '提醒价不改按分钟收盘价记的账');
    /* 卡片: 把 cardHTML 借出来渲染一张"已做一轮且有提醒价"的卡 */
    const { w: VW } = ctx({});
    vm.runInContext(fs.readFileSync(path.join(root, 'jl_tintra.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'window.__card = cardHTML; })();'), VW);
    const rr = { code: '603986', name: '兆易创新', sh: 100, net: 875.7, rounds: [{ sp: 271.5, sellT: '09:35', bp: 269.98, buyT: '09:47', why: '回落1.5%' }], hits: { s0: { t: '09:35', px: 271.8 }, b0: { t: '09:46', px: 270.1 } } };
    const html = VW.__card(rr, { k: 'off', txt: '已收盘' });
    const want = 100 * (271.8 - 270.1) - A.rtFee(271.8, 270.1, 100, C);
    ok(/提醒价 271\.80 09:35 → 270\.10 09:46/.test(html), '卡片每轮显示提醒价');
    ok(html.indexOf('按浮球提醒那一刻的价算') > 0 && html.indexOf((want >= 0 ? '+' : '') + want.toFixed(0) + '元') > 0, '卡片给出按提醒价算的合计 ' + want.toFixed(0) + '元');
    ok(html.indexOf('+124元') > 0, '每轮差价按真实费用: 152−27.65 ≈ +124元');
  }
}
console.log('\ntfix ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
