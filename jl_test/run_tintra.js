/* jl_tintra 回归: ①整天数据与影子 ~/jl_shadow/multi.js 逐笔一致 ②盘中只用前k根时, 已完成的轮次与整天结果的前缀一致(不偷看) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'jl_tintra.js'), 'utf8');
const win = {}; const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout() {}, setInterval() {}, Math, Date, JSON, String, Number, Infinity, isFinite };
vm.createContext(ctx); vm.runInContext(src, ctx);
const A = win.JLTIntra._t;
const shadowSrc = fs.readFileSync(path.join(process.env.HOME, 'jl_shadow', 'multi.js'), 'utf8');
const m = { exports: {} }; new Function('module', 'exports', 'require', shadowSrc + '\nmodule.exports._t={simulate,openIV,liveGaps,control,idealNet};')(m, m.exports, require);
const S = m.exports._t;
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function rnd(seed) { let h = seed >>> 0; return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }; }
function day(seed, base) {
  const g = rnd(seed), b = []; let p = base;
  const mins = [];
  for (let t = 9 * 60 + 31; t <= 11 * 60 + 30; t++) mins.push(t);
  for (let t = 13 * 60 + 1; t <= 15 * 60; t++) mins.push(t);
  mins.forEach((t, i) => {
    const o = i && g() < 0.04 ? p * (1 + (g() - 0.5) * 0.006) : p;
    const c = o * (1 + (g() - 0.5) * 0.006 + Math.sin(i / 40) * 0.0012);
    const h = Math.max(o, c) * (1 + g() * 0.002), l = Math.min(o, c) * (1 - g() * 0.002);
    b.push({ t: '2026-10-30 ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), o: +o.toFixed(3), h: +h.toFixed(3), l: +l.toFixed(3), c: +c.toFixed(3) });
    p = c;
  });
  return b;
}
const C = A.DEF, td = '2026-10-30';
const daily = [{ t: '2026-10-20', l: 9, h: 11 }, { t: '2026-10-29', l: 9.5, h: 10.4 }];
const strip = (rs) => JSON.stringify(rs.map((r) => [r.sellT, r.sp, r.buyT, r.bp, r.why, r.hold, r.sellNear, r.buyNear]));
let totalRounds = 0;
for (let s = 1; s <= 300; s++) {
  const b = day(s, 10 + (s % 7)), atr = 0.08 + (s % 5) * 0.05;
  const gaps = [{ lv: '日', dr: -1, lo: 10.4, hi: 10.9, ct: '2026-10-21' }, { lv: '开', dr: 1, lo: 9.6, hi: 9.9, ct: '2026-10-29' }];
  const a = A.simulate(b, atr, C, gaps, daily, td, false), z = S.simulate(b, atr, C, gaps, daily, td);
  totalRounds += z.length;
  ok(strip(a) === strip(z), 'seed ' + s + ' 整天结果与影子不一致');
  ok(JSON.stringify(A.control(b, a, td + 'x' + 'm')) === JSON.stringify(S.control(b, z, td + 'x' + 'm')), 'seed ' + s + ' 对照不一致');
  ok(A.idealNet(b, 300, C) === S.idealNet(b, 300, C), 'seed ' + s + ' 事后最好不一致');
  for (const k of [40, 90, 150, 200]) {
    const p = A.simulate(b.slice(0, k), atr, C, gaps, daily, td, true);
    const done = z.filter((r) => r.bk < k - 0 && r.why !== '收盘');
    const pd = p.filter((r) => r.why !== '收盘');
    ok(strip(pd.map((r) => Object.assign({}, r, { sellNear: 0, buyNear: 0 }))) === strip(done.map((r) => Object.assign({}, r, { sellNear: 0, buyNear: 0 }))), 'seed ' + s + ' 前' + k + '根盘中结果与整天前缀不一致');
    ok(!p.some((r) => r.why === '收盘'), 'seed ' + s + ' 盘中把最后一根当收盘');
  }
}
console.log('样本 300 天, 影子共成交 ' + totalRounds + ' 轮');
console.log('tintra ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
