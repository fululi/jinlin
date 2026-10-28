/**
 * run_memofix.js — jl-memo1 回归: 开盘快照不再把"开盘前算的旧梯子"当真 (10-23 九只锚点=10-22开盘价事故)
 *
 * 用法: node jl_test/run_memofix.js
 * A. jl_open_snap.js memoCheck 纯函数: 10-23真实数字 / 正常锚 / 跳空锚 / 开盘前戳 / fo=0 / 盘后计划 / 跨窗报价
 * B. buildWinRec 整条: 10-23 永鼎场景落记录 m.state=stale, 数值照记不改
 * C. index.html tierLevelsJL: 写记录带 at/fo/qa; 开盘价到位(fo 0→1)即便档位相同也重写
 */
"use strict";
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const MOD = path.join(__dirname, "..", "jl_open_snap.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message.split("\n")[0]}`); }
}
function makeLS(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function makeDoc() {
  const el = () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {} } });
  return { readyState: "complete", createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el(), head: el(), documentElement: el() };
}
function freshMod(seed) {
  delete require.cache[require.resolve(MOD)];
  global.localStorage = makeLS(seed);
  global.document = global.document || makeDoc();
  delete global.__JLOSNAP__;
  require(MOD);
  return global.__JLOSNAP__;
}
const T8 = "20261023", at = (h, m) => new Date(2026, 9, 23, h, m, 0).getTime();
const q = (o) => Object.assign({ state: "ok", src: "qt.gtimg.cn", asOf: "20261023093514", p: 27.02, pv: 27.88, op: 27, pct: -3.08 }, o || {});
const memo = (o) => Object.assign({ src: "jinlin_tier_memo_v1", asOf: "2026-10-22", d: "2026-10-23", dk: "2026-10-22", planNext: false, S1: 30.45, B1: 28.91, sells: [30.45, 30.67], buys: [28.91, 28.48, 28.01, 27.54, 27.07], anchor: 29.53, at: null, fo: null }, o || {});

console.log("A. memoCheck 纯函数");
const api = freshMod({});
const C = api.pure.memoCheck;
test("10-23 真实: 锚29.53 ≠ 昨收27.88 也 ≠ 开盘27.00 → stale anchor-mismatch, 数值不改", () => {
  const r = C(memo(), q(), T8);
  assert.strictEqual(r.state, "stale");
  assert.match(r.why, /anchor-mismatch\(29\.53 vs 昨收27\.88\/开27\)/);
  assert.strictEqual(r.S1, 30.45); assert.deepStrictEqual(r.buys, [28.91, 28.48, 28.01, 27.54, 27.07]);
});
test("正常: 锚=昨收27.88、09:31算、fo=1 → 原样返回(无state字段)", () => {
  const m = memo({ anchor: 27.88, at: at(9, 31), fo: 1 }), r = C(m, q(), T8);
  assert.strictEqual(r, m); assert.strictEqual(r.state, undefined);
});
test("跳空: 锚=今日开盘27.00 → 合法, 不标", () => {
  assert.strictEqual(C(memo({ anchor: 27, at: at(9, 40), fo: 1 }), q(), T8).state, undefined);
});
test("开盘前戳: 09:10算的(哪怕锚恰好=昨收) → stale memo-pre-open(1023 0910)", () => {
  const r = C(memo({ anchor: 27.88, at: at(9, 10), fo: 1 }), q(), T8);
  assert.strictEqual(r.state, "stale"); assert.match(r.why, /memo-pre-open\(1023 0910\)/);
});
test("隔日戳: 10-22 算的 → stale memo-pre-open(1022 …)", () => {
  const r = C(memo({ anchor: 27.88, at: new Date(2026, 9, 22, 14, 50).getTime(), fo: 1 }), q(), T8);
  assert.match(r.why, /memo-pre-open\(1022 1450\)/);
});
test("fo=0(算时还没今日开盘价) → stale memo-pre-open", () => {
  const r = C(memo({ anchor: 27.88, at: at(9, 30), fo: 0 }), q(), T8);
  assert.strictEqual(r.state, "stale"); assert.match(r.why, /^memo-pre-open/);
});
test("planNext=true(盘后给次日的计划) → 不核对", () => {
  const m = memo({ planNext: true, anchor: 25.75 }); assert.strictEqual(C(m, q(), T8), m);
});
test("跨窗报价(stale+cross-window)仍用今日昨收/开盘核对", () => {
  assert.strictEqual(C(memo(), q({ state: "stale", why: "cross-window(092500)" }), T8).state, "stale");
});
test("报价缺失/日期不对 → 不拿报价判锚, 无戳旧记录原样返回", () => {
  const m = memo(); assert.strictEqual(C(m, q({ state: "missing" }), T8), m);
});
test("档位价相同的小数容差: 锚27.885 vs 昨收27.88 → 不算错", () => {
  assert.strictEqual(C(memo({ anchor: 27.885, at: at(9, 31), fo: 1 }), q(), T8).state, undefined);
});

console.log("B. buildWinRec 整条(10-23 永鼎 09:35 窗)");
{
  const D = "2026-10-23";
  const api2 = freshMod({
    jinlin_stocks_v2: JSON.stringify([{ code: "600105", name: "永鼎股份" }]),
    jinlin_tier_memo_v1: JSON.stringify({ d: D, "600105": { dk: "2026-10-22", r: { planNext: false, sells: [30.45, 30.67], buys: [28.91, 28.48, 28.01, 27.54, 27.07], anchor: 29.53 } } }),
  });
  const rows = [
    { sym: "sh000001", code: "000001", qAt: "20261023093515", p: 3613.54, pv: 3658.03, op: 3623.57, pct: -1.22 },
    { sym: "sh600105", code: "600105", qAt: "20261023093514", p: 27.02, pv: 27.88, op: 27, pct: -3.08, hi: 27.4, lo: 26.84 },
  ];
  test("旧记录(无戳)+错锚 → ps[0].m.state=stale, S1/B1 照记", () => {
    const rec = api2.buildWinRec("09:35", rows, 1, "20261023");
    const m = rec.ps[0].m;
    assert.strictEqual(m.state, "stale"); assert.match(m.why, /anchor-mismatch/);
    assert.strictEqual(m.S1, 30.45); assert.strictEqual(m.B1, 28.91); assert.strictEqual(m.anchor, 29.53);
  });
  test("新记录(09:31算,fo=1,锚=昨收) → 不标", () => {
    localStorage.setItem("jinlin_tier_memo_v1", JSON.stringify({ d: D, "600105": { dk: "2026-10-22", at: at(9, 31), fo: 1, r: { planNext: false, sells: [29.6], buys: [26.6], anchor: 27.88 } } }));
    const m = api2.buildWinRec("09:35", rows, 1, "20261023").ps[0].m;
    assert.strictEqual(m.state, undefined); assert.strictEqual(m.at, at(9, 31)); assert.strictEqual(m.fo, 1);
  });
}

console.log("C. index.html tierLevelsJL 记录戳与重写");
{
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const i0 = html.indexOf("  function tierLevelsJL(stock) {"), i1 = html.indexOf("  function computeTierJL(stock) {");
  assert.ok(i0 > 0 && i1 > i0, "找不到 tierLevelsJL");
  const src = html.slice(i0, i1).replace(/  setInterval\(\(\) => \{ \/\* jl-memo1[\s\S]*?\}, 2e4\);\n/, "");
  const ls = makeLS({});
  let fresh = false, rr = { anchor: 27.88, planNext: false, sells: [29.6], buys: [26.6] };
  const f = new Function("localStorage", "dailyBarsOf", "computeTierJL", "freshOpenJL", "jlSafeSetJL", src + "\nreturn tierLevelsJL;")(
    ls, () => [{ t: "2026-10-22", c: 27.88 }], () => rr, () => fresh, undefined);
  const S = { code: "600105", quoteAt: "20261023091200" };
  test("开盘前算: 记录 fo=0 + at + qa", () => {
    f(S); const e = JSON.parse(ls.getItem("jinlin_tier_memo_v1"))["600105"];
    assert.strictEqual(e.fo, 0); assert.ok(e.at > 0); assert.strictEqual(e.qa, "20261023091200"); assert.strictEqual(e.r.anchor, 27.88);
  });
  test("开盘价到位(fo 0→1)、档位完全一样 → 照样重写(原逻辑只看档位变没变, 会漏写)", () => {
    const at0 = JSON.parse(ls.getItem("jinlin_tier_memo_v1"))["600105"].at;
    fresh = true; S.quoteAt = "20261023092630";
    const t0 = Date.now(); while (Date.now() === t0) {} /* 保证 at 变 */
    f(S); const e = JSON.parse(ls.getItem("jinlin_tier_memo_v1"))["600105"];
    assert.strictEqual(e.fo, 1); assert.ok(e.at > at0); assert.strictEqual(e.qa, "20261023092630");
  });
  test("fo 不变且档位不变 → 不重复写(at 不动)", () => {
    const at1 = JSON.parse(ls.getItem("jinlin_tier_memo_v1"))["600105"].at;
    f(S); assert.strictEqual(JSON.parse(ls.getItem("jinlin_tier_memo_v1"))["600105"].at, at1);
  });
  test("后台补算定时器存在, 且只在 freshOpenJL 为真、记录非今日 fo=1 时调用", () => {
    const m = html.match(/setInterval\(\(\) => \{ \/\* jl-memo1[\s\S]*?\}, 2e4\);/);
    assert.ok(m, "缺后台补算");
    assert.match(m[0], /!freshOpenJL\(s\)\) return/); assert.match(m[0], /e\.fo === 1\) return/); assert.match(m[0], /tierLevelsJL\(s\)/);
  });
}
console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
