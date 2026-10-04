/**
 * run.js — 纯函数回归测试
 *
 * 用法: node jl_test/run.js
 * 前置: node jl_test/extract.js（已生成 harness.js）
 */

"use strict";

const assert = require("node:assert");
const {
  luLimJL,
  decTierJL,
  rmaAtrSeriesJL,
  zzThJL,
  zzMergeSmallLegsJL,
  zzPivotsJL,
  jlDayClosedJL,
  swingStateJL,
} = require("./harness");

// ── 测试基础设施 ────────────────────────────────────────────────────

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: "FAIL", error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function approxEq(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// ── luLimJL 测试 ────────────────────────────────────────────────────

console.log("\n[luLimJL]");

test("ST股 → 4.8", () => {
  assert.strictEqual(luLimJL("600001", "*ST测试"), 4.8);
});

test("ST大小写不敏感", () => {
  assert.strictEqual(luLimJL("600001", "st某某"), 4.8);
});

test("30开头(创业板) → 19.8", () => {
  assert.strictEqual(luLimJL("300001", ""), 19.8);
});

test("68开头(科创板) → 19.8", () => {
  assert.strictEqual(luLimJL("688001", ""), 19.8);
});

test("sh30前缀剥离后 → 19.8", () => {
  assert.strictEqual(luLimJL("sh300001", ""), 19.8);
});

test("sz68前缀剥离后 → 19.8", () => {
  assert.strictEqual(luLimJL("sz688001", ""), 19.8);
});

test("8开头(北交所) → 29.8", () => {
  assert.strictEqual(luLimJL("830001", ""), 29.8);
});

test("4开头 → 29.8", () => {
  assert.strictEqual(luLimJL("430001", ""), 29.8);
});

test("92开头 → 29.8", () => {
  assert.strictEqual(luLimJL("920001", ""), 29.8);
});

test("普通主板 → 9.8", () => {
  assert.strictEqual(luLimJL("600001", ""), 9.8);
});

test("sh前缀+普通 → 9.8", () => {
  assert.strictEqual(luLimJL("sh600001", ""), 9.8);
});

test("空参数 → 9.8", () => {
  assert.strictEqual(luLimJL("", ""), 9.8);
});

// ── decTierJL 测试 ──────────────────────────────────────────────────

console.log("\n[decTierJL]");

test("价格<1元 → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 0.5, code: "600001" }), 3);
});

test("价格=0.001 → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 0.001, code: "600001" }), 3);
});

test("51开头ETF → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 2.5, code: "510300" }), 3);
});

test("15开头ETF → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 1.2, code: "159915" }), 3);
});

test("16开头基金 → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 1.5, code: "161725" }), 3);
});

test("56开头ETF → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 3.0, code: "562800" }), 3);
});

test("58开头ETF → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 2.0, code: "588000" }), 3);
});

test("sh51前缀剥离 → 3位小数", () => {
  assert.strictEqual(decTierJL({ base: 2.5, code: "sh510300" }), 3);
});

test("bj前缀剥离 → 正常判断", () => {
  assert.strictEqual(decTierJL({ base: 5.0, code: "bj830001" }), 2);
});

test("普通股票≥1元 → 2位小数", () => {
  assert.strictEqual(decTierJL({ base: 10.5, code: "600001" }), 2);
});

test("base=0 → 按code判断", () => {
  assert.strictEqual(decTierJL({ base: 0, code: "510300" }), 3);
});

test("null安全 → 2位", () => {
  assert.strictEqual(decTierJL(null), 2);
});

// ── rmaAtrSeriesJL 测试 ─────────────────────────────────────────────

console.log("\n[rmaAtrSeriesJL]");

// 构造一组简单K线用于ATR测试
function makeBars(n, basePrice, volatility) {
  const bars = [];
  let p = basePrice;
  for (let i = 0; i < n; i++) {
    const h = p + volatility * (0.5 + Math.random() * 0.5);
    const l = p - volatility * (0.5 + Math.random() * 0.5);
    const c = l + Math.random() * (h - l);
    bars.push({ t: `2026-01-${String(i + 1).padStart(2, "0")}`, h, l, c });
    p = c;
  }
  return bars;
}

test("<15根返回全零数组", () => {
  const bars = makeBars(10, 10, 0.5);
  const result = rmaAtrSeriesJL(bars);
  assert.strictEqual(result.length, 10);
  assert.ok(result.every((v) => v === 0));
});

test("≥15根返回非零ATR", () => {
  const bars = makeBars(30, 10, 0.5);
  const result = rmaAtrSeriesJL(bars);
  assert.strictEqual(result.length, 30);
  // 前14个应为0
  for (let i = 0; i < 14; i++) assert.strictEqual(result[i], 0);
  // 第14个起应有正值
  assert.ok(result[14] > 0, "ATR[14] should be positive");
  assert.ok(result[29] > 0, "ATR[29] should be positive");
});

test("输出长度等于输入长度", () => {
  const bars = makeBars(50, 20, 1);
  assert.strictEqual(rmaAtrSeriesJL(bars).length, 50);
});

// ── zzThJL 测试 ─────────────────────────────────────────────────────

console.log("\n[zzThJL]");

test("输出长度等于输入长度", () => {
  const bars = makeBars(30, 10, 0.5);
  const th = zzThJL(bars);
  assert.strictEqual(th.length, 30);
});

test("阈值在 [0.08, 0.25] 范围内", () => {
  const bars = makeBars(30, 10, 0.5);
  const th = zzThJL(bars);
  for (let i = 0; i < th.length; i++) {
    if (th[i] !== 0.12) { // 0.12 is fallback when ATR=0
      assert.ok(th[i] >= 0.08 && th[i] <= 0.25, `th[${i}]=${th[i]} out of range`);
    }
  }
});

test("短数据(<15)全部回退到0.12", () => {
  const bars = makeBars(10, 10, 0.5);
  const th = zzThJL(bars);
  assert.ok(th.every((v) => v === 0.12));
});

// ── zzPivotsJL 测试 ─────────────────────────────────────────────────

console.log("\n[zzPivotsJL]");

// 构造明确的V形走势：先跌后涨
function makeVShape() {
  const bars = [];
  // 下跌段: 20根
  for (let i = 0; i < 20; i++) {
    const p = 100 - i * 2;
    bars.push({ t: `2026-01-${String(i + 1).padStart(2, "0")}`, h: p + 1, l: p - 1, c: p });
  }
  // 上涨段: 20根
  for (let i = 0; i < 20; i++) {
    const p = 62 + i * 2;
    bars.push({ t: `2026-02-${String(i + 1).padStart(2, "0")}`, h: p + 1, l: p - 1, c: p });
  }
  return bars;
}

test("V形走势能识别出低点枢轴", () => {
  const bars = makeVShape();
  const piv = zzPivotsJL(bars, 0.12);
  const lows = piv.filter((p) => p.t === "L");
  assert.ok(lows.length >= 1, "Should find at least one L pivot");
});

test("V形走势能识别出高点枢轴", () => {
  const bars = makeVShape();
  const piv = zzPivotsJL(bars, 0.12);
  const highs = piv.filter((p) => p.t === "H");
  assert.ok(highs.length >= 1, "Should find at least one H pivot");
});

test("返回最多6个枢轴", () => {
  const bars = makeVShape();
  const piv = zzPivotsJL(bars, 0.05); // 低门槛产生更多枢轴
  assert.ok(piv.length <= 6, `Expected ≤6, got ${piv.length}`);
});

test("<3根K线返回空", () => {
  const bars = [{ t: "2026-01-01", h: 10, l: 9, c: 9.5 }];
  assert.deepStrictEqual(zzPivotsJL(bars, 0.12), []);
});

// ── zzMergeSmallLegsJL 测试 ─────────────────────────────────────────

console.log("\n[zzMergeSmallLegsJL]");

test("合并后枢轴数≤原始", () => {
  const bars = makeVShape();
  const piv = zzPivotsJL(bars, 0.05);
  const merged = zzMergeSmallLegsJL(piv, bars);
  assert.ok(merged.length <= piv.length);
});

test("短枢轴(<4)原样返回", () => {
  const zz = [{ d: "2026-01-01", p: 10, t: "H" }, { d: "2026-01-02", p: 8, t: "L" }];
  const bars = makeBars(20, 10, 0.5);
  const result = zzMergeSmallLegsJL(zz, bars);
  assert.strictEqual(result.length, 2);
});

test("null输入返回null", () => {
  assert.strictEqual(zzMergeSmallLegsJL(null, []), null);
});

// ── jlDayClosedJL 测试 ──────────────────────────────────────────────

console.log("\n[jlDayClosedJL]");

test("最后一根K线日期≠今天 → 已定盘", () => {
  const bars = [{ t: "2020-01-01", h: 10, l: 9, c: 9.5 }];
  assert.strictEqual(jlDayClosedJL(bars), true);
});

test("空bars → 已定盘(无今日数据)", () => {
  // lt="" → lt && ... 为 false → 继续检查 dow/time
  // 无论结果如何，函数不应崩溃
  const result = jlDayClosedJL([]);
  assert.strictEqual(typeof result, "boolean");
});

test("null bars → 不崩溃", () => {
  const result = jlDayClosedJL(null);
  assert.strictEqual(typeof result, "boolean");
});

// ── swingStateJL 测试 ───────────────────────────────────────────────

console.log("\n[swingStateJL]");

/**
 * 构造一组有明确波段结构的K线：
 *   阶段1 (bar 0-9):   从10涨到20（形成上升段）
 *   阶段2 (bar 10-19): 从20跌到12（回调，形成L枢轴）
 *   阶段3 (bar 20-29): 从12涨到25（突破新高，形成H枢轴）
 *   阶段4 (bar 30-39): 从25回落至当前价
 */
function makeSwingBars(opts) {
  const { lastClose, livePrice } = opts || {};
  const bars = [];
  let idx = 0;
  const addBar = (d, h, l, c) => {
    bars.push({ t: d, h, l, c });
    idx++;
  };

  // 阶段1: 上涨 10→20
  for (let i = 0; i < 10; i++) {
    const base = 10 + i;
    addBar(`2026-01-${String(i + 1).padStart(2, "0")}`, base + 0.5, base - 0.5, base);
  }
  // 阶段2: 回调 20→12
  for (let i = 0; i < 10; i++) {
    const base = 20 - i * 0.8;
    addBar(`2026-01-${String(i + 11).padStart(2, "0")}`, base + 0.5, base - 0.5, base);
  }
  // 阶段3: 再涨 12→25
  for (let i = 0; i < 10; i++) {
    const base = 12 + i * 1.3;
    addBar(`2026-02-${String(i + 1).padStart(2, "0")}`, base + 0.5, base - 0.5, base);
  }
  // 阶段4: 小幅回落
  for (let i = 0; i < 10; i++) {
    const base = 25 - i * 0.3;
    const c = lastClose !== undefined && i === 9 ? lastClose : base;
    addBar(`2026-02-${String(i + 11).padStart(2, "0")}`, base + 0.5, base - 0.5, c);
  }
  return bars;
}

test("bars<10 → ok=false", () => {
  const st = swingStateJL([{ t: "2026-01-01", h: 10, l: 9, c: 9.5 }], 10);
  assert.strictEqual(st.ok, false);
  assert.ok(st.why.includes("bars<10"));
});

test("正常波段 → ok=true", () => {
  const bars = makeSwingBars({ lastClose: 22, livePrice: 22 });
  const st = swingStateJL(bars, 22, { closed: true });
  assert.strictEqual(st.ok, true, st.why);
  assert.strictEqual(st.layerName, "中波段");
});

test("未破前低 → broke=false", () => {
  const bars = makeSwingBars({ lastClose: 22, livePrice: 22 });
  const st = swingStateJL(bars, 22, { closed: true });
  if (st.ok) {
    assert.strictEqual(st.broke, false);
    assert.strictEqual(st.brokeMode, "none");
    assert.ok(st.back.length > 0, "未破位应有回吐档");
  }
});

test("收盘破前低 → broke=true, brokeMode=closed", () => {
  // 构造收盘价远低于前低的场景
  const bars = makeSwingBars({ lastClose: 5, livePrice: 5 });
  const st = swingStateJL(bars, 5, { closed: true });
  if (st.ok) {
    assert.strictEqual(st.broke, true);
    assert.strictEqual(st.brokeMode, "closed");
    assert.strictEqual(st.back.length, 0, "破位后接回档应作废");
    assert.ok(st.bounce.length > 0 || st.downLow !== null, "破位应有反弹档或downLow");
  }
});

test("盘中破前低(closed=false) → brokeMode=intraday", () => {
  const bars = makeSwingBars({ lastClose: 5, livePrice: 5 });
  const st = swingStateJL(bars, 5, { closed: false });
  if (st.ok) {
    assert.strictEqual(st.broke, false, "intraday不算正式破位");
    assert.strictEqual(st.brokeMode, "intraday");
  }
});

test("返回值结构完整性", () => {
  const bars = makeSwingBars({ lastClose: 22, livePrice: 22 });
  const st = swingStateJL(bars, 22, { closed: true });
  if (st.ok) {
    assert.ok("L1" in st, "missing L1");
    assert.ok("H1" in st, "missing H1");
    assert.ok("rng" in st, "missing rng");
    assert.ok("retrace" in st, "missing retrace");
    assert.ok("anchorKind" in st, "missing anchorKind");
    assert.ok(Array.isArray(st.back), "back should be array");
    assert.ok(Array.isArray(st.bounce), "bounce should be array");
    assert.ok(Array.isArray(st.ext), "ext should be array");
    assert.ok(typeof st.msg === "string" && st.msg.length > 0, "msg should be non-empty string");
  }
});

test("provisional vs confirmed anchor", () => {
  // 正常波段应该有某种anchor
  const bars = makeSwingBars({ lastClose: 22, livePrice: 22 });
  const st = swingStateJL(bars, 22, { closed: true });
  if (st.ok) {
    assert.ok(
      ["none", "provisional", "confirmed"].includes(st.anchorKind),
      `Unexpected anchorKind: ${st.anchorKind}`
    );
  }
});

// ── 汇总 ────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log("\nFailed tests:");
  results.filter((r) => r.status === "FAIL").forEach((r) => {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
