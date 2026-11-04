/* jl-surge(1104) 回归: 盘中急拉判定 + 阶段起始天数。数据=2026-11-04 小金属概念15只成分股东财1分钟真实等权平均 */
var C = require("../jl_sector_strength.js"), ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; console.log("  ok  " + name); } else { bad++; console.log("  FAIL " + name); } }
var at = function (h, m) { return new Date(2026, 10, 4, h, m).getTime(); };
var real = [["10:30", 1.33, .80], ["11:00", 0.87, .53], ["11:30", 0.98, .67], ["13:15", 1.68, .73], ["13:30", 3.89, .87], ["14:00", 6.23, 1]];
var hist = [], first = null;
real.forEach(function (r) {
  var hm = r[0].split(":"), cur = { t: at(+hm[0], +hm[1]), m: { "小金属概念": { a: r[1], u: r[2], n: 15, z: 0 } } };
  var s = C.surgeScan(hist, cur); if (s.length && !first) first = { at: r[0], s: s[0] };
  hist.push(cur);
});
t("真实小金属: 13:30首次报急拉", first && first.at === "13:30");
t("13:30 急拉幅度≈+2.9个点(基准11:30 +0.98)", first && Math.abs(first.s.d - 2.91) < 0.02);
t("午休不算时间: 11:30与13:00同为120", C.tradeMin(at(11, 30)) === 120 && C.tradeMin(at(13, 0)) === 120);
t("刚打开App只有1分钟前的点: 不报", C.surgeScan([{ t: at(13, 29), m: { x: { a: 0, u: .5, n: 10 } } }], { t: at(13, 30), m: { x: { a: 3, u: .9, n: 10 } } }).length === 0);
t("样本<8只: 不报", C.surgeScan([{ t: at(13, 0), m: { x: { a: 0, u: .5, n: 6 } } }], { t: at(13, 30), m: { x: { a: 3, u: .9, n: 6 } } }).length === 0);
t("上涨率<60%: 不报", C.surgeScan([{ t: at(13, 0), m: { x: { a: 0, u: .5, n: 10 } } }], { t: at(13, 30), m: { x: { a: 3, u: .5, n: 10 } } }).length === 0);
var mk = function (rank, up) { return { avg: 1.5, up: up, zt: 1, early: 0, rank: rank }; };
var days = [{ day: "2026-10-30", m: { A: mk(12, .5) } }, { day: "2026-11-02", m: { A: mk(3, .8) } }, { day: "2026-11-03", m: { A: mk(2, .9) } }, { day: "2026-11-04", m: { A: mk(1, .9) } }];
var run = C.stageRun(days, 3, "A");
t("阶段起始: 11-02起 第3天", run && run.from === "2026-11-02" && run.n === 3);
t("阶段累计: 3天各+1.5% ≈ +4.57%", Math.abs(C.runGain(days, 3, "A", 3) - 4.57) < 0.01);
/* 资金信号: 东财小金属概念 11-04 真实值 */
t("小金属9:45 主力+13.76亿 占成交9.3% 板块+0.72% → 资金先进", (C.fundSig({ p: 0.72, f: 13.76e8, fr: 9.3 }, 0.9) || {}).k === "in");
t("小金属收盘 已涨4.69% → 不再算埋伏", C.fundSig({ p: 4.69, f: 68.5e8, fr: 7.5 }, 7.16) === null);
t("涨3%但主力-5亿 占比-3.2% → 拉升主力在出", (C.fundSig({ p: 3.1, f: -5e8, fr: -3.2 }, 3) || {}).k === "out");
/* 提醒范围(用户11-04第二版): 当天实际火的板块, 不用固定名单 */
t("我盯的(排名50)也提醒", C.alertScope("小金属概念", 50, ["小金属概念"]) === "我盯的");
t("强度第20名提醒", C.alertScope("煤炭", 20, []) === "今天强度前20");
t("强度第40名但主力流入第5 提醒(贵金属这种)", C.alertScope("贵金属", 40, [], 5) === "今天主力流入前20");
t("今天不强, 但前3天进过前20 → 跑路要提醒", C.alertScope("CPO概念", 80, [], 300, true) === "近3天强势");
t("今天、近几天都不强、资金也不靠前 → 不提醒", C.alertScope("CPO概念", 80, [], 300, false) === null);
console.log("\nsurge: " + ok + " 通过 / " + bad + " 失败");
process.exit(bad ? 1 : 0);
