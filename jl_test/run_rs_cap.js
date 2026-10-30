// jl-rscap 回归：直接抽取 index.html 的 rsRiskJL，验证资金族封顶4.5与结构因子另加。
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = src.indexOf('  function rsRiskJL(r)');
const b = src.indexOf('  function rsBubbleHTMLJL', a);
if (a < 0 || b < 0) throw new Error('rsRiskJL 抽取锚点缺失');
eval(src.slice(a, b));

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log('FAIL', msg, 'actual=', actual, 'expected=', expected); }
}
const R = o => rsRiskJL(Object.assign({ dO: NaN, dS: NaN, dM: NaN, ffStreak: 0, pos60: null, fibRisk: 0 }, o));

// 纯资金不得越过减仓线。
eq(R({ dO: -1, dS: -1, dM: -1, ffStreak: -7 }), { cls: 'am', bub: '资金预警 · 提高警惕', sc: 4.5 }, '三线流出+连出7天封顶4.5');
eq(R({ dO: -1, dS: -1, dM: -1, ffStreak: -5 }), { cls: 'am', bub: '资金预警 · 提高警惕', sc: 4.5 }, '三线流出+连出5天封顶4.5');
// 结构因子在资金封顶之后另加。
eq(R({ dO: -1, dS: -1, dM: -1, ffStreak: -7, pos60: .9 }), { cls: 'o', bub: '结构风险 · 考虑减仓', sc: 6 }, '60日高位另加1.5');
eq(R({ dO: -1, dS: -1, dM: -1, ffStreak: -7, fibRisk: 2 }), { cls: 'r', bub: '风险确认 · 离场参考', sc: 6.5 }, '斐波结构确认后到6.5');
// 流入抵扣、低位减分、修复观察与缺数据分支保持原口径。
eq(R({ dO: 1, dS: 1, dM: 1, ffStreak: 5, pos60: .2 }), { cls: 'g', bub: '正常 · 持有观察', sc: 0 }, '强流入抵扣不变');
eq(R({ dO: 1, dS: -1, dM: -1, ffStreak: -2 }), { cls: 'b', bub: '修复观察 · 资金回流', sc: 1.5 }, '修复观察优先序不变');
eq(R({}), { cls: 'am', bub: '数据不全 · 谨慎观望', sc: 0 }, '缺数据分支不变');
console.log(`rs_cap ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
