/**
 * run_osnap.js — jl_open_snap.js 开盘快照采样器桩测试 (jl-1141)
 *
 * 用法: node jl_test/run_osnap.js
 * 覆盖: 窗口判定边界 / 有效快照三条件 / 每窗每日≤1请求+失败记miss不重试 /
 *       手动不占固定时点 / 同天共存 / 开关关闭零写入 / 写失败内存计数(补充9) /
 *       写隔离(源码级: 只写自有键, 零禁用函数) / 导出可区分 / 状态四分法 /
 *       每字段src+asOf / 手动纯度(零网络零已有键写入) / 上限裁剪
 */

"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const MOD = path.join(__dirname, "..", "jl_open_snap.js");
const SRC = fs.readFileSync(MOD, "utf8");

/* ── 桩: localStorage / document / 时间 ─────────────────────────── */

function makeLS(seed) {
  const m = new Map(Object.entries(seed || {}));
  const calls = [];
  const ls = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { calls.push([k, String(v)]); if (ls.throwOn === k) throw new Error("QuotaExceededError (stub)"); m.set(k, String(v)); },
    removeItem: (k) => { calls.push(["::remove", k]); },
    throwOn: null,
    _m: m, _calls: calls,
  };
  return ls;
}

function makeDoc(opts) {
  const scripts = [];
  const els = {};
  const iso = !!(opts && opts.iso); /* 13:44审查件: iso=iframe.contentWindow独立对象(模拟真实iframe隔离命名空间), 专测并发归属 */
  const doc = {
    _scripts: scripts, _els: els, _iframes: [],
    readyState: "complete",
    createElement(tag) {
      if (tag === "iframe") { /* 13:44审查件: 报价脚本隔离载入的iframe桩(默认contentWindow=global——模块请求时清键, 既有用例tick后设v_零改动) */
        const fr = { _tag: "iframe", style: { cssText: "" }, contentWindow: iso ? {} : global,
          contentDocument: null, remove() {}, setAttribute() {} };
        fr.contentDocument = { createElement: doc.createElement, body: { appendChild() {} }, documentElement: { appendChild() {} } };
        doc._iframes.push(fr);
        return fr;
      }
      const el = { _tag: tag, charset: "", src: "", onload: null, onerror: null, style: { cssText: "" },
        remove() {}, click() {}, focus() {}, select() {},
        appendChild() {}, addEventListener() {} };
      if (tag === "script") scripts.push(el);
      return el;
    },
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    getElementById: (id) => els[id] || null,
  };
  return doc;
}

function qstr(name, cur, prev, open, at, hi, lo) { /* 腾讯 v_ 报价串桩(a[1]/3/4/5/30/33/34) */
  const a = new Array(36).fill("");
  a[1] = name; a[3] = String(cur); a[4] = String(prev); a[5] = String(open);
  a[30] = at; a[32] = "0"; a[33] = String(hi); a[34] = String(lo);
  return a.join("~");
}

function freshMod(seed, doc) {
  delete require.cache[require.resolve(MOD)];
  Object.keys(global).filter((k) => /^v_/.test(k)).forEach((k) => { delete global[k]; }); /* 清腾讯桩全局, 防跨块污染 */
  global.localStorage = makeLS(seed);
  global.document = doc || makeDoc();
  delete global.__JLOSNAP__;
  const mod = require(MOD);
  return global.__JLOSNAP__;
}

function reloadMod(doc) { /* 真重载(12:33审查件): 保留当前global.localStorage(持久化状态)与页面, 仅重建模块实例 */
  delete require.cache[require.resolve(MOD)];
  Object.keys(global).filter((k) => /^v_/.test(k)).forEach((k) => { delete global[k]; });
  global.document = doc;
  delete global.__JLOSNAP__;
  require(MOD);
  return global.__JLOSNAP__;
}

function local(h, m, s) { return new Date(2026, 9, 23, h, m, s).getTime(); }
/* 时区口径(按 11:26 验收要求修正): local() 用运行环境本地时区构造日期; 模块 ymd()/getHours()
   同样读本地钟, 两侧同一时钟基准 → 测试在任意时区下自洽(见文末 TZ 三时区验证).
   2026-10-23 在任何时区按本地日历构造均为周五(周末预筛分支可复现). */

function seedDay(extra) {
  const D = "2026-10-23";
  const s = {
    jinlin_stocks_v2: JSON.stringify([{ code: "600105", name: "永鼎股份" }, { code: "515880", name: "通信ETF" }]),
    jinlin_tier_memo_v1: JSON.stringify({ d: D, "600105": { dk: D, r: { planNext: false, sells: [30.46, 31.2], buys: [28.9, 28.0], anchor: 29.5 } }, "515880": { dk: D, r: { planNext: true, sells: [0.545], buys: [0.526], anchor: 0.53 } } }),
    jinlin_strong_day_v1: JSON.stringify({ d: D, m: { "600105": { s: 78, gap: 2 } } }),
    jinlin_mtemp_v1: JSON.stringify({ at: Date.now(), data: { t: 34, up: 2300, down: 2900, amt: 1.8e12 } }),
    jl_sector_ff_v1: JSON.stringify({ "通信设备": { amt: 8e9, pct: 2.1, d: D } }),
    jl_ff_v1: JSON.stringify({ "600105": { rows: [{ d: D, main: -1.2e8, mainPct: -4.1 }], t: Date.now(), src: "em-min" } }),
    jl_mf_hist_v1: JSON.stringify({ d: D, hist: { 上证: [{ d: "2026-10-22", main: 1e9 }, { d: D, main: 2e9 }] } }),
    jlv2_snap_v1: JSON.stringify({ date: D, ok: 1, t: 34 }),
    jl_dk_600105: JSON.stringify([["2026-10-22", 29.54, 29.2, 29.8, 29.0, 1e5], [D, 29.53, 28.5, 29.6, 28.4, 2e5]]),
  };
  return Object.assign(s, extra || {});
}

/* ── 基础设施(同 run.js 风格) ────────────────────────────────────── */

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
    console.log(`    ${e.message.split("\n")[0]}`);
  }
}

/* ── A. 纯函数: 窗口判定边界 ────────────────────────────────────── */
{
  const api = freshMod(seedDay());
  const P = api.pure;
  test("winOf: 09:25:59 窗口外→null", () => assert.strictEqual(P.winOf("092559"), null));
  test("winOf: 09:26:00 起点入窗", () => assert.strictEqual(P.winOf("092600"), "09:26"));
  test("winOf: 09:29:59 止点入窗", () => assert.strictEqual(P.winOf("092959"), "09:26"));
  test("winOf: 09:30:00 出窗→null", () => assert.strictEqual(P.winOf("093000"), null));
  test("winOf: 09:34:59 出窗→null", () => assert.strictEqual(P.winOf("093459"), null));
  test("winOf: 09:35:00 入窗", () => assert.strictEqual(P.winOf("093500"), "09:35"));
  test("winOf: 09:39:59 止点入窗", () => assert.strictEqual(P.winOf("093959"), "09:35"));
  test("winOf: 09:40:00 出窗→null", () => assert.strictEqual(P.winOf("094000"), null));
  test("winOf: 09:59:59 出窗→null", () => assert.strictEqual(P.winOf("095959"), null));
  test("winOf: 10:00:00 入窗", () => assert.strictEqual(P.winOf("100000"), "10:00"));
  test("winOf: 10:04:59 止点入窗", () => assert.strictEqual(P.winOf("100459"), "10:00"));
  test("winOf: 10:05:00 出窗→null", () => assert.strictEqual(P.winOf("100500"), null));
  test("winOf: 15:00 盘尾→null", () => assert.strictEqual(P.winOf("150000"), null));
  test("winOf: 非法输入(空/5位/非数字)→null", () => {
    assert.strictEqual(P.winOf(""), null); assert.strictEqual(P.winOf("0926"), null); assert.strictEqual(P.winOf("09a631"), null);
  });
  test("validQuote: 三条件通过", () => {
    const v = P.validQuote("20261023092631", "20261023");
    assert.ok(v.ok); assert.strictEqual(v.hms, "092631");
  });
  test("validQuote: 报价日期≠今天→date", () => {
    assert.strictEqual(P.validQuote("20261022092631", "20261023").why, "date");
  });
  test("validQuote: 时间<09:25:00→pre0925", () => {
    assert.strictEqual(P.validQuote("20261023092459", "20261023").why, "pre0925");
  });
  test("validQuote: 09:25:00 整点放行", () => {
    assert.ok(P.validQuote("20261023092500", "20261023").ok);
  });
  test("validQuote: 非14位→malformed", () => {
    assert.strictEqual(P.validQuote("2026102309263", "20261023").why, "malformed");
    assert.strictEqual(P.validQuote("", "20261023").why, "malformed");
  });
  test("quoteSym: 5/6开头补sh, 其余补sz, 已带前缀原样", () => {
    assert.strictEqual(P.quoteSym("600105"), "sh600105");
    assert.strictEqual(P.quoteSym("515880"), "sh515880");
    assert.strictEqual(P.quoteSym("300750"), "sz300750");
    assert.strictEqual(P.quoteSym("sh000001"), "sh000001");
  });
  test("armZone: 窗口±2分钟(09:24:00 起武装)", () => {
    assert.ok(P.armZone(0, 9 * 60 + 24));
    assert.ok(!P.armZone(0, 9 * 60 + 23.9));
    assert.ok(P.armZone(0, 9 * 60 + 31.9)); /* 09:29:59+2min */
    assert.ok(!P.armZone(0, 9 * 60 + 32.1));
  });
  test("fireable: 手机钟进入[窗起, 窗止+2分]才发请求", () => {
    assert.ok(!P.fireable(0, 9 * 60 + 25.9)); /* 09:25:59 未到窗起(只武装不发) */
    assert.ok(P.fireable(0, 9 * 60 + 26));
    assert.ok(P.fireable(0, 9 * 60 + 31.9));
    assert.ok(!P.fireable(0, 9 * 60 + 32.1));
  });
}

/* ── B. 源码级写隔离断言(约束3/补充3) ──────────────────────────── */
test("写隔离: setItem 调用点仅2处(writeStore唯一记录入口+toggle开关), 且只绑 KEY/KEY_ON", () => {
  const vars = [...SRC.matchAll(/\.setItem\(\s*([A-Za-z_$][\w$]*)\s*,/g)].map((m) => m[1]);
  assert.strictEqual(vars.length, 2, "写点=writeStore(KEY)+toggle(KEY_ON), 实得 " + vars.length + ": " + vars.join(","));
  vars.forEach((v) => assert.ok(v === "KEY" || v === "KEY_ON", "出现非自有键变量: " + v));
  assert.ok(/var VER = "os1", KEY = "jl_osnap_v1", KEY_ON = "jl_osnap_on_v1";/.test(SRC), "KEY/KEY_ON 常量绑定必须唯一且为自有键");
  const literals = [...SRC.matchAll(/setItem\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
  literals.forEach((k) => assert.ok(k === "jl_osnap_v1" || k === "jl_osnap_on_v1", "出现字面量键: " + k));
});
test("写隔离: 零禁用函数调用(档位四函数+jlSafeSetJL)", () => {
  assert.strictEqual(SRC.match(/\b(tiersViewJL|computeTierJL|tierLevelsJL|ratchetJL|jlSafeSetJL)\s*\(/g), null);
});
test("写隔离: 零 removeItem/清缓存/SW注销调用", () => {
  assert.strictEqual(SRC.match(/removeItem\s*\(/g), null);
  assert.strictEqual(SRC.match(/\.clear\s*\(\s*\)/g), null);
  assert.strictEqual(SRC.match(/serviceWorker/g), null);
});
test("写隔离: 报价端点只有 qt.gtimg.cn, 零东财域名(em-min仅为缓存字段名注释)", () => {
  assert.ok(SRC.includes("https://qt.gtimg.cn/q="));
  assert.strictEqual(SRC.match(/https?:\/\/[^"'\s]*(eastmoney|push2)/i), null, "不出现东财域名");
});

/* ── C. 每窗每日≤2请求(首次+重试1次) + 失败记miss + 用尽封顶(约束1/放宽件) ── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  let r1 = api.tick();
  test("tick: 09:26:31 触发该窗首次请求(att:1, 脚本标签1个)", () => {
    assert.deepStrictEqual(r1, { fired: "09:26", att: 1 });
    assert.strictEqual(doc._scripts.length, 1);
    assert.ok(doc._scripts[0].src.includes("qt.gtimg.cn/q=sh000001,sh600105,sh515880"), "一次带全部持仓代码(带交易所前缀): " + doc._scripts[0].src);
  });
  doc._scripts[0].onerror(); /* 首次拉取失败 */
  test("首次失败: 落 type:miss(reason:fetch-failed-1, att:1), 不写win记录", () => {
    const store = api.readStore();
    const miss = store.recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss.length, 1);
    assert.strictEqual(miss[0].win, "09:26");
    assert.strictEqual(miss[0].reason, "fetch-failed-1");
    assert.strictEqual(miss[0].att, 1);
    assert.strictEqual(miss[0].hist, undefined);
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 0);
  });
  let r1b = api.tick(); /* 同一时刻立即再tick: 间隔<20秒 → 不得重试 */
  test("间隔不足(<20s): 同窗立即第二tick零新请求", () => {
    assert.strictEqual(r1b.fired, undefined);
    assert.strictEqual(doc._scripts.length, 1, "不得再建script");
  });
  api._clockSet(local(9, 26, 53)); /* +22秒 */
  let r2 = api.tick();
  test("间隔≥20s: 重试触发(att:2, 第2个script, 同端点)", () => {
    assert.deepStrictEqual(r2, { fired: "09:26", att: 2 });
    assert.strictEqual(doc._scripts.length, 2);
    assert.ok(doc._scripts[1].src.includes("qt.gtimg.cn/q=sh000001"), "重试同端点一次带全部代码");
  });
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092540", 3720, 3660);
  doc._scripts[1].onload(); /* 重试仍失败: 报价 09:25:40 仍未入窗(手机偏快场景) */
  test("重试仍失败: miss 原位更新为 -2/att:2, hist 保留首次尝试的时间与原因", () => {
    const store = api.readStore();
    const miss = store.recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss.length, 1, "miss 每窗每日仍只一条(原位更新)");
    assert.strictEqual(miss[0].reason.startsWith("quote-hms-outside"), true);
    assert.ok(miss[0].reason.endsWith("-2"), "reason 区分重试: " + miss[0].reason);
    assert.strictEqual(miss[0].att, 2);
    assert.strictEqual(miss[0].t, "20261023092540");
    assert.ok(Array.isArray(miss[0].hist) && miss[0].hist.length === 1, "hist 保留首次尝试");
    assert.strictEqual(miss[0].hist[0].reason, "fetch-failed-1");
    assert.strictEqual(miss[0].hist[0].att, 1);
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 0);
  });
  api._clockSet(local(9, 27, 40));
  api.tick();
  test("请求用尽封顶: 第三tick零新请求(每窗≤2)", () => {
    assert.strictEqual(doc._scripts.length, 2, "两请求用尽后不得再发");
  });
}
/* ── C2. 负例单次失败(首次尝试, reason 带 -1) ───────────────────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261022092641", 3720, 3660); /* 昨日报价 */
  doc._scripts[0].onload();
  test("过期报价: idx a[30]=昨日→miss(quote-date-1), 不误记当日有效快照", () => {
    const store = api.readStore();
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 0);
    const miss = store.recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss[0].reason, "quote-date-1");
    assert.strictEqual(miss[0].att, 1);
  });
}
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 0, "20261023092641", 3720, 3660); /* 开盘价0 */
  doc._scripts[0].onload();
  test("开盘价0: →miss(open<=0-1)", () => {
    assert.strictEqual(api.readStore().recs.filter((r) => r.type === "miss")[0].reason, "open<=0-1");
  });
}
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092420", 3720, 3660); /* 09:24:20 未过09:25 */
  doc._scripts[0].onload();
  test("报价时间未过09:25:00→miss(quote-pre0925-1)", () => {
    assert.strictEqual(api.readStore().recs.filter((r) => r.type === "miss")[0].reason, "quote-pre0925-1");
  });
}
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023103000", 3720, 3660); /* 窗口外时刻 */
  doc._scripts[0].onload();
  test("报价时刻窗口外(10:30): →miss(quote-hms-outside-1), 窗口外跳过", () => {
    assert.ok(api.readStore().recs.filter((r) => r.type === "miss")[0].reason.startsWith("quote-hms-outside(103000)-1"));
  });
}

/* ── R. 重试批(2026-10-22 11:04 放宽件): 首次未入窗→重试入窗→成功 ── */
{
  /* R1: 手机钟偏快约15秒: 首拉报价 09:25:50(未入窗)→miss-1; +22秒重试报价 09:26:12 已入窗→成功 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 5));
  let r1 = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092550", 3720, 3660); /* 报价在窗前(手机快15s) */
  doc._scripts[0].onload();
  test("R1 预筛提前触发: 首拉报价未入窗→miss(quote-hms-outside(092550)-1)", () => {
    assert.deepStrictEqual(r1, { fired: "09:26", att: 1 });
    const miss = api.readStore().recs.filter((x) => x.type === "miss");
    assert.strictEqual(miss.length, 1);
    assert.ok(miss[0].reason.startsWith("quote-hms-outside(092550)-1"));
    assert.strictEqual(miss[0].t, "20261023092550");
  });
  api._clockSet(local(9, 26, 27)); /* +22秒 */
  let r2 = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092612", 3720, 3660); /* 重试报价已入窗 */
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092612", 29.8, 28.4);
  doc._scripts[1].onload();
  test("R1 重试落入窗内→记成功(rec.att=2), miss 保留为历史(att:1), 不重复写窗", () => {
    assert.deepStrictEqual(r2, { fired: "09:26", att: 2 });
    const store = api.readStore();
    const wins = store.recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].win, "09:26");
    assert.strictEqual(wins[0].t, "20261023092612");
    assert.strictEqual(wins[0].att, 2, "记录带所用请求次数");
    const miss = store.recs.filter((x) => x.type === "miss");
    assert.strictEqual(miss.length, 1, "首次失败 miss 保留为历史");
    assert.strictEqual(miss[0].att, 1);
    assert.ok(miss[0].reason.startsWith("quote-hms-outside(092550)-1"));
  });
  api._clockSet(local(9, 27, 20));
  api.tick();
  test("R1 成功后再tick零新请求(不得重复写固定窗口记录)", () => {
    assert.strictEqual(doc._scripts.length, 2);
    assert.strictEqual(api.readStore().recs.filter((r) => r.type === "win").length, 1);
  });
}
{
  /* R2: 网络失败一次→重试成功 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  doc._scripts[0].onerror();
  api._clockSet(local(9, 26, 55));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092715", 3720, 3660);
  doc._scripts[1].onload();
  test("R2 首次网络失败→重试成功: 1条win(att:2) + miss-1留史", () => {
    const store = api.readStore();
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 1);
    assert.strictEqual(store.recs.filter((r) => r.type === "win")[0].att, 2);
    const miss = store.recs.filter((x) => x.type === "miss");
    assert.strictEqual(miss.length, 1);
    assert.strictEqual(miss[0].reason, "fetch-failed-1");
    assert.strictEqual(miss[0].att, 1);
  });
}
{
  /* R3: 不得跨窗口重试——09:26 用尽两请求后, 09:35 走自己的首次请求(att:1) */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick(); doc._scripts[0].onerror();
  api._clockSet(local(9, 26, 55));
  api.tick(); doc._scripts[1].onerror(); /* 09:26 两请求用尽 */
  api._clockSet(local(9, 35, 10));
  let r35 = api.tick();
  test("R3 不跨窗口重试: 09:35 窗触发自己的首次请求(att:1, 第3个script)", () => {
    assert.deepStrictEqual(r35, { fired: "09:35", att: 1 });
    assert.strictEqual(doc._scripts.length, 3);
    const req = api.readStore().req["2026-10-23"];
    assert.strictEqual(req["09:26"], 2, "09:26 恰好2次");
    assert.strictEqual(req["09:35"], 1, "09:35 首次");
  });
}

/* ── D. 成功路径: 固定窗口记录全字段 ────────────────────────────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4);
  doc._scripts[0].onload(); /* 515880 无响应行 → ps 缺行记 missing */
  let rec = null;
  test("成功: 落 type:win 记录, d/t 取自 a[30](dSrc:quote)", () => {
    const store = api.readStore();
    const wins = store.recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1);
    rec = wins[0];
    assert.strictEqual(rec.win, "09:26");
    assert.strictEqual(rec.manual, false);
    assert.strictEqual(rec.d, "2026-10-23");
    assert.strictEqual(rec.t, "20261023092641");
    assert.strictEqual(rec.dSrc, "quote");
    assert.strictEqual(rec.idx.state, "ok");
    assert.strictEqual(rec.idx.op, 3714);
  });
  test("成功: 持仓行按清单组装, 有行ok/无行missing(不伪造)", () => {
    assert.strictEqual(rec.ps.length, 2);
    assert.strictEqual(rec.ps[0].code, "600105");
    assert.strictEqual(rec.ps[0].q.state, "ok");
    assert.strictEqual(rec.ps[0].q.op, 29.53);
    assert.strictEqual(rec.ps[1].code, "515880");
    assert.strictEqual(rec.ps[1].q.state, "missing");
    assert.strictEqual(rec.ps[1].q.why, "no-row");
  });
  test("成功: S1/B1/dk/planNext 原样来自 memo, 固定记录不标lastComputed", () => {
    assert.strictEqual(rec.ps[0].m.S1, 30.46);
    assert.strictEqual(rec.ps[0].m.B1, 28.9);
    assert.strictEqual(rec.ps[0].m.dk, "2026-10-23");
    assert.strictEqual(rec.ps[0].m.planNext, false);
    assert.strictEqual(rec.ps[0].m.lastComputed, undefined);
    assert.strictEqual(rec.ps[1].m.planNext, true);
  });
  test("成功: 每字段带 source+asOf(约束2)", () => {
    [rec.mt, rec.tv2, rec.sf, rec.mf, rec.idx].forEach((b) => {
      assert.ok(b && typeof b.src === "string" && "asOf" in b, "env块缺src/asOf");
    });
    rec.ps.forEach((p) => {
      ["q"].forEach((k) => assert.ok(p[k] && typeof p[k].src === "string" && "asOf" in p[k], "ps." + k + " 缺src/asOf"));
      if (p.m) assert.ok(typeof p.m.src === "string" && "asOf" in p.m, "ps.m 缺src/asOf");
      if (p.g) assert.ok(typeof p.g.src === "string" && "asOf" in p.g, "ps.g 缺src/asOf");
      if (p.f) assert.ok(typeof p.f.src === "string" && "asOf" in p.f, "ps.f 缺src/asOf");
    });
  });
  test("成功: 同窗第二tick不再请求不重复记", () => {
    const n = doc._scripts.length;
    api._clockSet(local(9, 28, 0));
    api.tick();
    assert.strictEqual(doc._scripts.length, n);
    assert.strictEqual(api.readStore().recs.filter((r) => r.type === "win").length, 1);
  });
}

/* ── E. 手动不占固定时点 + 同天共存(测试补充4) ─────────────────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 25, 10));
  const mr = api.manual();
  test("手动: 先记一条(manual:true, win:null, 零网络)", () => {
    assert.ok(mr.ok);
    assert.strictEqual(mr.rec.type, "manual");
    assert.strictEqual(mr.rec.manual, true);
    assert.strictEqual(mr.rec.win, null);
    assert.strictEqual(mr.rec.dSrc, "phone");
    assert.strictEqual(doc._scripts.length, 0, "手动零script=零网络");
  });
  test("手动: 档位标'上次计算值' lastComputed:true, 价取jl_dk缓存", () => {
    const p0 = mr.rec.ps[0];
    assert.strictEqual(p0.m.lastComputed, true);
    assert.strictEqual(p0.m.S1, 30.46);
    assert.strictEqual(p0.k.state, "ok");
    assert.strictEqual(p0.k.src, "jl_dk_600105");
    assert.strictEqual(p0.k.o, 29.53);
    assert.strictEqual(p0.k.c, 28.5);
    assert.strictEqual(p0.k.pc, 29.2);
    assert.strictEqual(mr.rec.ps[1].m.planNext, true);
    assert.strictEqual(mr.rec.ps[1].k.state, "missing"); /* 515880 无K缓存→missing不伪造 */
  });
  test("手动: memo缺的代码 m=null(null/missing不伪造)", () => {
    const doc2 = makeDoc();
    const s = seedDay(); delete s["jl_dk_600105"];
    s.jinlin_tier_memo_v1 = JSON.stringify({ d: "2026-10-23", "600105": { dk: "2026-10-23", r: { sells: [30.46], buys: [28.9] } } });
    const api2 = freshMod(s, doc2);
    api2._clockSet(local(9, 25, 10));
    const r2 = api2.manual();
    assert.strictEqual(r2.rec.ps[0].m.S1, 30.46);
    assert.strictEqual(r2.rec.ps[1].m, null);
  });
  api._clockSet(local(9, 26, 31));
  const tr = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4);
  doc._scripts[0].onload();
  test("手动不占固定: 手动后固定窗口照常请求+照常落记录", () => {
    assert.deepStrictEqual(tr, { fired: "09:26", att: 1 });
    assert.strictEqual(doc._scripts.length, 1);
    const store = api.readStore();
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 1);
    assert.strictEqual(store.recs.filter((r) => r.type === "manual").length, 1);
  });
  /* 同天 3 固定 + 2 手动 共存 */
  api._clockSet(local(9, 35, 12)); api.tick();
  global["v_sh000001"] = qstr("上证指数", 3660, 3713, 3714, "20261023093521", 3720, 3660);
  doc._scripts[1].onload();
  api._clockSet(local(10, 0, 8)); api.tick();
  global["v_sh000001"] = qstr("上证指数", 3655, 3713, 3714, "20261023100015", 3720, 3660);
  doc._scripts[2].onload();
  api._clockSet(local(10, 6, 0)); api.manual();
  test("同天共存: 3固定+2手动, 互不覆盖互不挤占", () => {
    const store = api.readStore();
    const wins = store.recs.filter((r) => r.type === "win" && !r.manual);
    const mans = store.recs.filter((r) => r.manual);
    assert.deepStrictEqual(wins.map((r) => r.win), ["09:26", "09:35", "10:00"]);
    assert.strictEqual(mans.length, 2);
    wins.forEach((r) => assert.strictEqual(r.manual, false));
    mans.forEach((r) => { assert.strictEqual(r.manual, true); assert.strictEqual(r.win, null); });
  });
  test("窗口外(10:06): tick零请求(窗口外跳过, 不记入固定时点)", () => {
    const n = doc._scripts.length;
    api._clockSet(local(10, 6, 30)); api.tick();
    assert.strictEqual(doc._scripts.length, n);
  });
}

/* ── F. 开关: 关闭后定时采样零写入; 手动不受限(关系明确) ────────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  const before = api.readStore().recs.length;
  const onState = api.toggle(); /* 默认开→关 */
  test("开关: toggle 写自有键 jl_osnap_on_v1, 只闸定时采样", () => {
    assert.strictEqual(onState, false);
    const onCalls = global.localStorage._calls.filter((c) => c[0] === "jl_osnap_on_v1");
    assert.strictEqual(onCalls.length, 1);
    assert.strictEqual(onCalls[0][1], "0");
  });
  api._clockSet(local(9, 26, 31));
  const r = api.tick();
  test("开关关闭: tick 直接 skip, 零请求零写入", () => {
    assert.deepStrictEqual(r, { skip: "switch-off" });
    assert.strictEqual(doc._scripts.length, 0);
    assert.strictEqual(api.readStore().recs.length, before);
  });
  test("开关关闭: 手动入口照常可用(与开关无关, 明确记录的关系)", () => {
    const m = api.manual();
    assert.ok(m.ok);
    assert.strictEqual(api.readStore().recs.filter((x) => x.type === "manual").length, 1);
  });
  api.toggle(); /* 恢复开 */
  test("开关恢复: 下一tick正常触发请求", () => {
    api._clockSet(local(9, 27, 0));
    assert.deepStrictEqual(api.tick(), { fired: "09:26", att: 1 });
    assert.strictEqual(doc._scripts.length, 1);
  });
}

/* ── G. 写失败内存计数(补充9+11:50新规则: 标记写失败→不发请求) ──── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  global.localStorage.throwOn = "jl_osnap_v1"; /* 记录键写爆 */
  api._clockSet(local(9, 26, 31));
  const r = api.tick();
  test("写失败: 标记写失败→不发请求(11:50规则), 静默 wFail=1", () => {
    assert.strictEqual(r.skip, "store-write-fail");
    assert.strictEqual(doc._scripts.length, 0, "零请求");
    assert.strictEqual(api.st.wFail, 1);
  });
  test("写失败: 键内容不残留半写", () => {
    assert.strictEqual(global.localStorage.getItem("jl_osnap_v1"), null);
  });
  /* 标记写恢复→发请求; 响应落库时写爆 */
  global.localStorage.throwOn = null;
  api._clockSet(local(9, 26, 52));
  const r2 = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092702", 3720, 3660);
  global.localStorage.throwOn = "jl_osnap_v1"; /* 响应落库写爆 */
  doc._scripts[0].onload();
  global.localStorage.throwOn = null;
  const txt = api.exportText();
  test("写失败: 请求已发但响应写爆→wFail=2, 预算已持久化", () => {
    assert.strictEqual(r2.fired, "09:26");
    assert.strictEqual(api.st.wFail, 2, "标记1+响应1");
    assert.strictEqual(api.readStore().req["2026-10-23"]["09:26"], 1, "请求预算不丢");
  });
  test("写失败: 记录未持久化(不残留半写)", () => {
    assert.strictEqual(api.readStore().recs.filter((x) => x.type === "win").length, 0);
  });
  test("写失败: 导出带上 wFailSession(补充9)", () => {
    const ex = JSON.parse(txt);
    assert.strictEqual(ex.wFailSession, 2);
  });
  api._clockSet(local(9, 27, 30)); api.tick(); /* 重试入窗 */
  global["v_sh000001"] = qstr("上证指数", 3660, 3713, 3714, "20261023092740", 3720, 3660);
  doc._scripts[1].onload();
  test("写恢复: 后续成功写入, wFailSession 保持累计(会话口径)", () => {
    const store = api.readStore();
    assert.strictEqual(store.recs.filter((x) => x.type === "win" && x.win === "09:26").length, 1);
    assert.strictEqual(api.st.wFail, 2, "成功不重置会话计数");
  });
}

/* ── H. 手动纯度: 零网络 + 只写自有键 ──────────────────────────── */
{
  const doc = makeDoc();
  const seed = seedDay();
  seed["jinlin_mtemp_v1"] = "{bad json"; /* unreadable 样本 */
  delete seed["jlv2_snap_v1"];            /* missing 样本 */
  const api = freshMod(seed, doc);
  api._clockSet(local(11, 0, 0));
  const lsCalls = global.localStorage._calls;
  const before = lsCalls.length;
  const m = api.manual();
  test("手动纯度: 零网络(无script), 写入仅 jl_osnap_v1 一键一次", () => {
    assert.strictEqual(doc._scripts.length, 0);
    const news = lsCalls.slice(before);
    assert.strictEqual(news.length, 1);
    assert.strictEqual(news[0][0], "jl_osnap_v1");
  });
  test("状态四分法: unreadable(坏JSON)≠missing(键缺), 各归其位", () => {
    assert.strictEqual(m.rec.mt.state, "unreadable");
    assert.strictEqual(m.rec.tv2.state, "missing");
    assert.strictEqual(m.rec.sf.state, "ok");
    assert.strictEqual(m.rec.mt.src, "jinlin_mtemp_v1");
  });
  test("stale 保留原值: memo 顶层d=昨日→stale 且 S1 原样", () => {
    const doc2 = makeDoc();
    const s2 = seedDay();
    s2.jinlin_tier_memo_v1 = JSON.stringify({ d: "2026-10-22", "600105": { dk: "2026-10-22", r: { sells: [30.46], buys: [28.9] } } });
    const api2 = freshMod(s2, doc2);
    api2._clockSet(local(11, 0, 0));
    const r2 = api2.manual();
    const memoB = r2.rec.ps[0].m;
    assert.strictEqual(memoB.d, "2026-10-22");
    assert.strictEqual(memoB.dk, "2026-10-22");
    assert.strictEqual(memoB.S1, 30.46);
  });
}

/* ── I. 导出: 固定+手动+miss 可区分, 结构完整(测试补充4) ───────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 25, 0)); api.manual();
  api._clockSet(local(9, 26, 31)); api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4);
  doc._scripts[0].onload();
  api._clockSet(local(9, 35, 12)); api.tick();
  doc._scripts[1].onerror(); /* 09:35 miss */
  const ex = JSON.parse(api.exportText());
  test("导出: 含 wFailSession/wFailPersist/fixedToday/manualToday/recCount", () => {
    assert.strictEqual(ex.wFailSession, 0);
    assert.strictEqual(ex.wFailPersist, 0);
    assert.strictEqual(ex.manualToday, 1);
    assert.ok(ex.fixedToday.find((x) => x.win === "09:26" && x.state === "ok"));
    assert.ok(ex.fixedToday.find((x) => x.win === "09:35" && x.state === "missing"));
    assert.ok(ex.fixedToday.find((x) => x.win === "10:00" && x.state === "pending"));
  });
  test("导出: 固定(manual:false+win标签)与手动(manual:true+win:null)可区分", () => {
    const wins = ex.recs.filter((r) => !r.manual && r.type === "win");
    const mans = ex.recs.filter((r) => r.manual);
    assert.strictEqual(wins.length, 1); assert.strictEqual(wins[0].win, "09:26");
    assert.strictEqual(mans.length, 1); assert.strictEqual(mans[0].win, null);
    const miss = ex.recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss.length, 1); assert.strictEqual(miss[0].win, "09:35");
  });
}

/* ── J. 上限与裁剪(只裁自己) ───────────────────────────────────── */
{
  const api = freshMod(seedDay());
  const P = api.pure;
  test("裁剪: 记录上限120(超裁最旧)", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    for (let i = 0; i < 130; i++) s.recs.push({ type: "manual", manual: true, d: "2026-10-23", i: i });
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 120);
    assert.strictEqual(s.recs[0].i, 10, "裁掉最旧10条");
  });
  test("裁剪: 保留最近10个自然日", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    for (let i = 1; i <= 15; i++) s.recs.push({ type: "manual", manual: true, d: "2026-10-" + String(i).padStart(2, "0") });
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 10);
    assert.strictEqual(s.recs[0].d, "2026-10-06");
  });
  test("裁剪(12:04审查件): 13个有记录日带周末空档→保留10个有记录日, 非10个日历日", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    ["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09",   /* 周一~五 */
     "2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16",   /* 下周一~五(10/10-11 周末无记录) */
     "2026-10-19","2026-10-20","2026-10-21"].forEach((d) => s.recs.push({ type: "manual", manual: true, d })); /* 再下周一~三(10/17-18 周末) */
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 10, "按有记录日计=10条");
    assert.strictEqual(s.recs[0].d, "2026-10-08", "从第11旧记录日起裁");
    assert.ok(s.recs.some((r) => r.d === "2026-10-08"), "10-08 在保留内");
    assert.ok(!s.recs.some((r) => r.d === "2026-10-07"), "10-07 已裁");
    assert.ok(s.recs.some((r) => r.d === "2026-10-12"), "周末空档不按日历回数(若按10日历日只剩8条)");
  });
  test("裁剪(12:23审查件): 同日多条——恰10个有记录日时全保留(不按第10新条截断)", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    for (let i = 1; i <= 9; i++) s.recs.push({ type: "manual", manual: true, d: "2026-10-" + String(i).padStart(2, "0") });
    for (let i = 0; i < 5; i++) s.recs.push({ type: "win", win: "09:26", d: "2026-10-10" });
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 14, "10个有记录日(末日内5条)全保留=14条(旧按条实现只剩10条)");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-01").length, 1, "最旧日仍在");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-10").length, 5, "末日5条全在");
  });
  test("裁剪(12:23审查件): 11个有记录日且末日多条→仅整日裁最旧1条记录的那天", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    for (let i = 1; i <= 10; i++) s.recs.push({ type: "manual", manual: true, d: "2026-10-" + String(i).padStart(2, "0") });
    for (let i = 0; i < 5; i++) s.recs.push({ type: "win", win: "09:26", d: "2026-10-11" });
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 14, "只裁最旧日(1条), 其余14条全在");
    assert.ok(!s.recs.some((r) => r.d === "2026-10-01"), "最旧日整日消失");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-02").length, 1, "次旧日不受牵连");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-11").length, 5, "末日5条全保留");
  });
  test("裁剪(12:23审查件): 混合现实量(11日×每日3固定+2手动)→整日粒度裁最旧", () => {
    const s = { recs: [], req: {}, wFails: 0 };
    for (let i = 1; i <= 11; i++) {
      const d = "2026-10-" + String(i).padStart(2, "0");
      ["09:26", "09:35", "10:00"].forEach((w) => s.recs.push({ type: "win", win: w, d }));
      s.recs.push({ type: "manual", manual: true, d });
      s.recs.push({ type: "manual", manual: true, d });
    }
    P.trimStore(s);
    assert.strictEqual(s.recs.length, 50, "55条整日裁最旧1日5条→50条(旧按条实现只剩10条)");
    assert.ok(!s.recs.some((r) => r.d === "2026-10-01"), "最旧整日消失");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-02").length, 5, "次旧日整日5条全在");
    assert.strictEqual(s.recs.filter((r) => r.d === "2026-10-11").length, 5);
  });
  test("手动单日上限30: 第31条拒绝且不删旧", () => {
    const doc = makeDoc();
    const api2 = freshMod(seedDay(), doc);
    api2._clockSet(local(11, 0, 0));
    let last = null;
    for (let i = 0; i < 31; i++) last = api2.manual();
    assert.strictEqual(last.ok, false);
    assert.ok(last.reason.includes("manual-day-cap"));
    assert.strictEqual(api2.readStore().recs.filter((r) => r.manual).length, 30);
  });
}

/* ── V. 重复挂载/回调重复执行不超限(11:26 验收要求) ─────────────── */
{
  /* V1: 双重挂载 → 同一实例, 不重置状态不重复启动 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api.st.reqs = 7; api.st.lastErr = "mark"; /* 打标记 */
  const api2 = (delete require.cache[require.resolve(MOD)], require(MOD), global.__JLOSNAP__);
  test("V1 双重挂载: __JLOSNAP__ 同一实例(防护生效), 状态不重置", () => {
    assert.strictEqual(api2, api, "二次 require 必须命中双重加载防护, 返回同一实例");
    assert.strictEqual(api2.st.reqs, 7, "状态不得被二次加载重置");
    assert.strictEqual(api2.st.lastErr, "mark");
  });
}
{
  /* V2: 同一请求回调重复执行(onload×2 / onerror×2) → 不突破上限不重复记录 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4);
  doc._scripts[0].onload();
  doc._scripts[0].onload(); /* 重复触发: done 防护必须拦截 */
  test("V2 onload 重复执行: done 防护拦截, 仍只有 1 条 win 记录", () => {
    assert.strictEqual(api.readStore().recs.filter((r) => r.type === "win").length, 1);
  });
}
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  doc._scripts[0].onerror();
  doc._scripts[0].onerror(); /* 重复触发 */
  test("V2 onerror 重复执行: 仍只有 1 条 miss 且 att 不变", () => {
    const miss = api.readStore().recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss.length, 1);
    assert.strictEqual(miss[0].att, 1);
    assert.strictEqual(miss[0].reason, "fetch-failed-1");
  });
}
{
  /* V3: 持仓报价部分缺失(仅部分股票有行) → 有行ok/无行missing, 记录照常成立 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092641", 29.8, 28.4); /* 515880 无行 */
  doc._scripts[0].onload();
  test("V3 持仓报价部分缺失: 600105 ok / 515880 missing(不伪造), win 记录照常成立", () => {
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "idx 有效 → 记录成立(部分缺失不整条丢弃)");
    const p1 = rec.ps.find((x) => x.code === "600105"), p2 = rec.ps.find((x) => x.code === "515880");
    assert.strictEqual(p1.q.state, "ok");
    assert.strictEqual(p2.q.state, "missing");
    assert.strictEqual(p2.q.why, "no-row");
    assert.ok(p2.m && p2.m.S1 > 0, "档位照常来自 memo(不因报价缺行丢档位)");
  });
}

/* ── W. 11:50 审查件四组: 错窗/写失败不发/三态保真/前缀匹配 ──────── */
{
  /* W1: 请求 09:35, 报价落在 09:26 → 错窗不记账 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 35, 10));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  doc._scripts[0].onload();
  test("W1 错窗不记账: 09:35 请求+报价落 09:26→只落 miss(cross-window), 两窗均无 win 记录", () => {
    const store = api.readStore();
    assert.strictEqual(store.recs.filter((r) => r.type === "win").length, 0, "不写入 09:26 也不写入 09:35");
    const miss = store.recs.filter((r) => r.type === "miss");
    assert.strictEqual(miss.length, 1);
    assert.strictEqual(miss[0].win, "09:35", "miss 记在请求窗口");
    assert.ok(miss[0].reason.startsWith("cross-window(quote→09:26)-1"), miss[0].reason);
  });
  api._clockSet(local(9, 35, 35));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093555", 3720, 3660);
  doc._scripts[1].onload();
  test("W1 错窗后重试回到本窗→正常记账(att:2)", () => {
    const store = api.readStore();
    const wins = store.recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].win, "09:35");
    assert.strictEqual(wins[0].t, "20261023093555");
    assert.strictEqual(wins[0].att, 2);
  });
  {
    /* 对照: 09:26 自己的请求照常可记账 */
    const doc2 = makeDoc();
    const api2 = freshMod(seedDay(), doc2);
    api2._clockSet(local(9, 26, 31));
    api2.tick();
    global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
    doc2._scripts[0].onload();
    test("W1 对照: 本窗请求+本窗报价→正常记账", () => {
      const wins = api2.readStore().recs.filter((r) => r.type === "win");
      assert.strictEqual(wins.length, 1);
      assert.strictEqual(wins[0].win, "09:26");
    });
  }
}
{
  /* W2: 请求消耗标记写入失败 → 绝不发请求; 重载后仍 ≤2 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  const ls = global.localStorage; /* 注意: 须在 freshMod 之后捕获(其重建了 localStorage) */
  ls.throwOn = "jl_osnap_v1";
  api._clockSet(local(9, 26, 31));
  let rFail = api.tick();
  test("W2 标记写失败: tick 返回 skip:store-write-fail, 零 script 零请求", () => {
    assert.strictEqual(rFail.skip, "store-write-fail");
    assert.ok(rFail.wFail >= 1);
    assert.strictEqual(doc._scripts.length, 0, "绝不发行情请求");
  });
  /* 模拟重载: 写恢复后再 tick——请求计数从 0 起(失败未持久化也未发请求) */
  ls.throwOn = null;
  api._clockSet(local(9, 26, 52));
  let rOk = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092702", 3720, 3660);
  doc._scripts[0].onload();
  test("W2 写恢复后: 正常记账且 att=1(失败未消耗请求预算)", () => {
    assert.deepStrictEqual(rOk, { fired: "09:26", att: 1 });
    const wins = api.readStore().recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].att, 1);
    assert.strictEqual(api.readStore().req["2026-10-23"]["09:26"], 1, "该窗恰 1 次已发请求");
  });
  /* 记录写失败场景(请求已发出): 预算仍正确落账 */
  const doc3 = makeDoc();
  const api3 = freshMod(seedDay(), doc3);
  const ls3 = global.localStorage;
  api3._clockSet(local(9, 35, 10));
  api3.tick(); /* att=1 标记写入成功, 请求已发 */
  ls3.throwOn = "jl_osnap_v1"; /* 响应落库时写失败 */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093520", 3720, 3660);
  doc3._scripts[0].onload();
  ls3.throwOn = null;
  test("W2 响应写失败: 请求预算已持久化(att=1), 同实例续跑最多再 1 次(合计≤2)", () => {
    assert.strictEqual(api3.readStore().req["2026-10-23"]["09:35"], 1, "标记在前, 预算不丢");
    assert.ok(api3.st.wFail >= 1, "wFail 计数");
    api3._clockSet(local(9, 35, 55));
    let rr = api3.tick();
    assert.strictEqual(rr.att, 2, "只能重试 1 次");
    global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093605", 3720, 3660);
    doc3._scripts[1].onload();
    api3._clockSet(local(9, 36, 30));
    assert.strictEqual(api3.tick().fired, undefined, "两请求用尽后零新请求");
    assert.strictEqual(doc3._scripts.length, 2, "该窗合计恰好 2 次请求");
  });
}
{
  /* W3: planNext/S1/B1 三态保真 */
  const D = "2026-10-23";
  const memo = { d: D,
    "600105": { dk: D, r: { sells: [28.2, 27.8], buys: [30.1], planNext: true, anchor: 27.5 } },
    "515880": { dk: D, r: { sells: [], buys: [], planNext: false } },              /* 空档位数组+明确false */
    "600519": { dk: D, r: { sells: [1660.0], buys: [1750.0] } } };                  /* planNext 缺失 */
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), {
    jinlin_stocks_v2: JSON.stringify([{ code: "600105", name: "永鼎股份" }, { code: "515880", name: "通信ETF" }, { code: "600519", name: "贵州茅台" }]),
    jinlin_tier_memo_v1: JSON.stringify(memo) }), doc);
  let m = api.manual();
  test("W3 三态保真: planNext true/false/null 各归其位(缺失≠false), 空数组S1/B1=null 不丢字段", () => {
    assert.ok(m.ok);
    const store = api.readStore(); /* 经 JSON 序列化往返后断言 */
    const rec = store.recs.filter((r) => r.type === "manual")[0];
    const by = {}; rec.ps.forEach((p) => by[p.code] = p.m);
    assert.strictEqual(by["600105"].planNext, true);
    assert.strictEqual(by["515880"].planNext, false, "明确 false 不得变 true");
    assert.strictEqual(by["600519"].planNext, null, "缺失必须是 null 不得伪造 false");
    assert.strictEqual(by["515880"].S1, null, "空 sells → S1=null(字段在, 不消失)");
    assert.strictEqual(by["515880"].B1, null, "空 buys → B1=null");
    assert.strictEqual("S1" in by["515880"], true, "字段必须存在(JSON 往返后仍保留)");
    assert.strictEqual(by["600105"].S1, 28.2);
    assert.strictEqual(by["600105"].B1, 30.1);
  });
}
{
  /* W4: 持仓代码带 sh 前缀 → 报价按归一码匹配, 不误记 missing */
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), { jinlin_stocks_v2: JSON.stringify([
    { code: "sh600105", name: "永鼎股份" }, { code: "515880", name: "通信ETF" }]) }), doc);
  api._clockSet(local(9, 26, 31));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092641", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4);
  global["v_sh515880"] = qstr("通信ETF", 0.675, 0.676, 0.674, "20261023092641", 0.68, 0.67);
  doc._scripts[0].onload();
  test("W4 前缀持仓: sh600105(带前缀)与 515880(裸码)都正确匹配报价 q.state=ok", () => {
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec);
    assert.ok(doc._scripts[0].src.includes("sh600105") && doc._scripts[0].src.includes("sh515880"), "请求侧带前缀原样");
    const p1 = rec.ps.find((x) => x.code === "sh600105"), p2 = rec.ps.find((x) => x.code === "515880");
    assert.strictEqual(p1.q.state, "ok", "带前缀持仓不得误记 missing");
    assert.strictEqual(p1.q.p, 28.44);
    assert.strictEqual(p2.q.state, "ok");
  });
}

{
  /* W5: 个股自身报价错窗——指数在本窗, 个股 a[30] 落在别窗 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 35, 10));
  api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093520", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092643", 29.8, 28.4); /* 个股落在 09:26 窗 */
  global["v_sh515880"] = qstr("通信ETF", 0.675, 0.676, 0.674, "20261023093525", 0.68, 0.67); /* 个股在本窗(5开头补sh) */
  doc._scripts[0].onload();
  test("W5 个股错窗: 指数本窗→记录成立; 个股09:26→stale+why(cross-window), 数值照记; 个股09:35→ok", () => {
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "指数在本窗, 记录照常成立");
    assert.strictEqual(rec.win, "09:35");
    const p1 = rec.ps.find((x) => x.code === "600105"), p2 = rec.ps.find((x) => x.code === "515880");
    assert.strictEqual(rec.idx.state, "ok");
    assert.strictEqual(p1.q.state, "stale", "别窗个股不得标 ok");
    assert.strictEqual(p1.q.why, "cross-window(092643)");
    assert.strictEqual(p1.q.p, 28.44, "错窗个股数值仍照记(不丢弃)");
    assert.strictEqual(p1.q.asOf, "20261023092643", "asOf 如实标注真实时刻");
    assert.strictEqual(p2.q.state, "ok");
    assert.strictEqual(p2.q.why, undefined, "本窗个股无 why 字段");
  });
}
{
  /* W6: 记录键坏 JSON——空壳不覆盖, 原文随键保全 */
  const doc = makeDoc();
  const seed = seedDay();
  seed["jl_osnap_v1"] = '{"v":"os1","req":{"2026-10-23":{"09:26":1}},"recs":[{"type":"miss","win":"09:26","d":"2026-10-23"'; /* 半截 JSON */
  const api = freshMod(seed, doc);
  test("W6 坏JSON: 首次写入后原键含 _rawTxt 原文(非空壳覆盖), 功能继续", () => {
    const r1 = api.manual(); /* 触发首次写入 */
    assert.strictEqual(r1.ok, true, "空壳继续跑, 手动可用");
    const raw = global.localStorage.getItem("jl_osnap_v1");
    const parsed = JSON.parse(raw); /* 键已是合法 JSON */
    assert.ok(parsed._rawTxt && parsed._rawTxt.includes('"type":"miss"'), "原文被装进新键内容(半截前缀仍在)");
    assert.strictEqual(parsed._raw, "unreadable");
    assert.strictEqual(parsed.storeState === undefined, true);
  });
  test("W6 坏JSON: storeState 导出口径=unreadable, 新记录可累积", () => {
    const ex = JSON.parse(api.exportText());
    assert.strictEqual(ex.storeState, "unreadable");
    const r2 = api.manual();
    assert.strictEqual(r2.ok, true);
    const parsed2 = JSON.parse(global.localStorage.getItem("jl_osnap_v1"));
    assert.strictEqual(parsed2.recs.filter((r) => r.manual).length, 2, "新记录累积");
    assert.ok(parsed2._rawTxt, "原文持续随键携带(历次写入不丢)");
  });
  test("W6 坏JSON: 键内原文直读可恢复(历次写入后仍在)", () => {
    const raw = global.localStorage.getItem("jl_osnap_v1");
    assert.ok(raw, "键有内容");
    const parsed = JSON.parse(raw);
    assert.ok(parsed._rawTxt && parsed._rawTxt.includes('"type":"miss"'), "原文随键存活(可手工恢复)");
    assert.strictEqual(parsed.recs.filter((r) => r.manual).length, 2, "历次新记录都在");
  });
}
{
  /* W7: manual 持久化失败→返回失败状态 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  global.localStorage.throwOn = "jl_osnap_v1";
  const r1 = api.manual();
  test("W7 手动写失败: manual 返回 ok:false + reason:store-write-fail(不假报成功)", () => {
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.reason, "store-write-fail");
    assert.ok(r1.wFail >= 1);
  });
  test("W7 手动写失败: 键无残留(未持久化), 计数在导出", () => {
    assert.strictEqual(global.localStorage.getItem("jl_osnap_v1"), null);
    assert.ok(JSON.parse(api.exportText()).wFailSession >= 1);
  });
  global.localStorage.throwOn = null;
  const r2 = api.manual();
  test("W7 写恢复后: 手动正常成功且只落 1 条(失败那次未占用)", () => {
    assert.strictEqual(r2.ok, true);
    const recs = api.readStore().recs.filter((r) => r.manual);
    assert.strictEqual(recs.length, 1, "写失败那条未持久化, 不重复");
  });
}

/* ── W2R. 真重载(12:33审查件): 保留同一localStorage重建模块实例 ──── */
{
  const docR = makeDoc();
  const apiR = freshMod(seedDay(), docR);
  const lsR = global.localStorage;
  apiR._clockSet(local(9, 35, 10));
  const t1 = apiR.tick(); /* att=1 标记写入成功并已持久化, 请求已发 */
  lsR.throwOn = "jl_osnap_v1"; /* 响应落库时写失败(记录未持久化, 预算已落盘) */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093520", 3720, 3660);
  docR._scripts[0].onload();
  lsR.throwOn = null;
  test("W2 真重载: 重建实例读同一localStorage→预算受限(新实例最多再1次, 合计≤2)", () => {
    assert.strictEqual(t1.att, 1);
    const before = JSON.parse(lsR._m.get("jl_osnap_v1"));
    assert.strictEqual(before.req["2026-10-23"]["09:35"], 1, "重载前预算已在盘上");
    const api2 = reloadMod(docR); /* 真重载: 新实例, 同一存储同一页面 */
    assert.notStrictEqual(api2, apiR, "确为新实例(非同实例续跑)");
    api2._clockSet(local(9, 35, 55));
    const t2 = api2.tick();
    assert.deepStrictEqual(t2, { fired: "09:35", att: 2 }, "新实例从持久化预算1起步→只能第2次");
    global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023093605", 3720, 3660);
    docR._scripts[1].onload(); /* 本次响应写成功 */
    api2._clockSet(local(9, 36, 30));
    assert.strictEqual(api2.tick().fired, undefined, "两请求用尽→零新请求");
    assert.strictEqual(docR._scripts.length, 2, "重载前后合计恰好2次(预算跨重载受限)");
    assert.strictEqual(api2.readStore().req["2026-10-23"]["09:35"], 2);
    const wins = api2.readStore().recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1, "重试成功落win");
    assert.strictEqual(wins[0].att, 2);
  });
}

/* ── W2T. 多标签错峰(12:44审查件): 两实例共享同一localStorage(模拟两标签页) ── */
{
  const docA = makeDoc();
  const apiA = freshMod(seedDay(), docA); /* 标签A */
  const docB = makeDoc();
  const apiB = reloadMod(docB); /* 标签B: 同一存储, 各自页面 */
  apiA._clockSet(local(9, 26, 31));
  const tA = apiA.tick();  /* A先读零写1发请求(标记+reat落共享盘) */
  apiB._clockSet(local(9, 26, 33));
  const tBearly = apiB.tick(); /* B错峰2秒: 被持久化reat的20秒间隔拦住 */
  const scriptsAfterEarly = docB._scripts.length; /* 早tick后立即快照(此时tB未跑) */
  apiB._clockSet(local(9, 26, 53));
  const tB = apiB.tick();  /* B间隔≥20秒: 读盘见req=1→只能att=2 */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092655", 3720, 3660);
  docA._scripts[0].onload(); /* A的响应先到: 落win */
  docB._scripts[0].onload(); /* B的响应到: 见win已记→不重复落账 */
  apiA._clockSet(local(9, 27, 0));
  apiB._clockSet(local(9, 27, 5));
  test("多标签(12:44): 错峰tick两实例共享localStorage→跨标签合计恰2请求, 单win不重复", () => {
    assert.deepStrictEqual(tA, { fired: "09:26", att: 1 });
    assert.strictEqual(tBearly.fired, undefined, "B早到2秒: 20秒重试间隔跨标签同样生效(reat持久化)");
    assert.strictEqual(scriptsAfterEarly, 0, "间隔内B零请求");
    assert.deepStrictEqual(tB, { fired: "09:26", att: 2 }, "B间隔后读共享盘req=1→att=2(不读零)");
    assert.strictEqual(apiA.tick().fired, undefined, "A预算用尽");
    assert.strictEqual(apiB.tick().fired, undefined, "B预算用尽");
    assert.strictEqual(docA._scripts.length + docB._scripts.length, 2, "两页合计恰2次请求");
    const s = apiA.readStore();
    assert.strictEqual(s.req["2026-10-23"]["09:26"], 2, "共享盘预算=2");
    const wins = s.recs.filter((r) => r.type === "win");
    assert.strictEqual(wins.length, 1, "错峰下不重复记账");
    assert.strictEqual(wins[0].att, 1, "成功落自A的首次尝试");
  });
}

/* ── T. 时钟基准(12:33审查件): 单入口_now + tick(now)全流程同基准 + 外部键对齐写入方 ── */
{
  /* T1: writeStore成功戳跟随注入钟(修复前裸Date.now()与注入钟分裂) */
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), {
    jinlin_mtemp_v1: JSON.stringify({ at: Date.now(), data: { t: 34, up: 2300, down: 2900, amt: 1.8e12 } }) }), doc);
  api._clockSet(local(11, 0, 0));
  const m = api.manual();
  test("时钟(12:33): writeStore成功戳lastAt跟随注入钟(单入口_now)", () => {
    assert.strictEqual(m.ok, true);
    assert.strictEqual(api.st.lastAt, local(11, 0, 0), "lastAt=_now()而非裸Date.now()");
  });
  test("时钟(12:33): 外部键mtemp新鲜度按写入方真实钟——注入钟(10-23)不伪造新鲜", () => {
    assert.strictEqual(m.rec.mt.state, "ok", "at=真实钟刚写→ok, 与注入钟无关");
  });
  /* T2: 外部键过期按真实钟判, 注入钟再'新'也不翻新 */
  const doc2 = makeDoc();
  const api2 = freshMod(Object.assign(seedDay(), {
    jinlin_mtemp_v1: JSON.stringify({ at: Date.now() - 20 * 60e3, data: { t: 34, up: 2300, down: 2900, amt: 1.8e12 } }) }), doc2);
  api2._clockSet(local(9, 26, 31));
  test("时钟(12:33): mtemp真实钟20分钟前→stale, 注入钟不参与外部键年龄", () => {
    assert.strictEqual(api2.manual().rec.mt.state, "stale");
  });
  /* T3: tick(now)显式入参跨日——today8/预算日/miss归属日均随now走(修复前today8走本机钟, 昨日报价会被放行) */
  const doc3 = makeDoc();
  const api3 = freshMod(seedDay(), doc3);
  api3._clockSet(new Date(2026, 9, 22, 23, 59, 0).getTime()); /* 注入钟=10-22 23:59(周四) */
  const rT = api3.tick(new Date(2026, 9, 23, 9, 27, 0).getTime()); /* 显式now=10-23 09:27(周五) */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261022092630", 3720, 3660); /* 昨日报价 */
  doc3._scripts[0].onload();
  test("时钟(12:33): tick(now)跨日——昨日报价仍拒(quote-date), miss归属now当日", () => {
    assert.deepStrictEqual(rT, { fired: "09:26", att: 1 }, "窗口/预算按now=10-23");
    const s = api3.readStore();
    assert.strictEqual(s.req["2026-10-23"]["09:26"], 1, "预算记在now日(10-23), 不记本机钟日(10-22)");
    const misses = s.recs.filter((x) => x.type === "miss");
    assert.strictEqual(misses.length, 1);
    assert.strictEqual(misses[0].reason, "quote-date-1", "昨日报价按now当日基准拒收(修复前误放行)");
    assert.strictEqual(misses[0].d, "2026-10-23", "miss归属流程日now(修复前走本机钟10-22)");
    assert.ok(!s.recs.some((x) => x.type === "win"), "昨日报价不得落win");
  });
  const rT2 = api3.tick(new Date(2026, 9, 23, 9, 27, 21).getTime()); /* 同基准重试, 报价换今日 */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092655", 3720, 3660);
  doc3._scripts[1].onload();
  test("时钟(12:33): 同基准重试——今日报价正常记账(att:2, win d=now当日)", () => {
    assert.deepStrictEqual(rT2, { fired: "09:26", att: 2 });
    const s = api3.readStore();
    assert.strictEqual(s.req["2026-10-23"]["09:26"], 2);
    const wins = s.recs.filter((x) => x.type === "win");
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].d, "2026-10-23", "win归属报价日=流程日(基准一致)");
    assert.strictEqual(wins[0].att, 2);
  });
  /* T4: 跨日边界——昨日23:59手动与今日09:26固定窗各自归属, 手动日计数按日清零 */
  const doc4 = makeDoc();
  const api4 = freshMod(seedDay(), doc4);
  api4._clockSet(new Date(2026, 9, 22, 23, 59, 0).getTime());
  const mY = api4.manual(); /* 昨日手动 */
  api4._clockSet(local(9, 27, 0)); /* 次日10-23 09:27 */
  const rD = api4.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092630", 3720, 3660);
  doc4._scripts[0].onload();
  test("时钟(12:33): 跨日边界——手动记昨日/固定窗记今日, 互不挤占", () => {
    assert.strictEqual(mY.ok, true);
    assert.deepStrictEqual(rD, { fired: "09:26", att: 1 });
    const s = api4.readStore();
    const mans = s.recs.filter((x) => x.manual);
    assert.strictEqual(mans.length, 1);
    assert.strictEqual(mans[0].d, "2026-10-22", "手动归属昨日23:59");
    const wins = s.recs.filter((x) => x.type === "win");
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].d, "2026-10-23", "固定窗归属今日(报价日)");
  });
  const mN = api4.manual(); /* 今日手动 */
  test("时钟(12:33): 跨日后手动日计数按日清零(昨日计数不占今日30上限)", () => {
    assert.strictEqual(mN.ok, true);
    const s = api4.readStore();
    assert.strictEqual(s.recs.filter((x) => x.manual && x.d === "2026-10-23").length, 1, "今日手动照常可记");
  });
}

/* ── F. 报价新鲜度(13:26审查件): v_*预存旧值不得冒充本次响应 ────── */
{
  /* F1: 旧指数报价预先存在(窗内合法), 本次onload零改写→旧值不得当本次结果记win */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092610", 3720, 3660); /* 旧值预存 */
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  const sc = doc._scripts[0];
  if (sc) sc.onload(); /* 本次响应到达但不改写任何 v_* */
  test("新鲜度(13:26): 旧报价预存+本次响应零改写→旧值不冒充本次结果(有miss无win)", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 }, "请求照发");
    const s = api.readStore();
    assert.strictEqual(s.recs.filter((r) => r.type === "win").length, 0, "旧值不得当本次结果记win");
    const miss = s.recs.find((r) => r.type === "miss");
    assert.ok(miss, "留可追踪miss");
    assert.strictEqual(miss.reason, "fetch-failed-1");
  });
}
{
  /* F2: 指数被本次响应改写, 个股旧值未被改写→该行missing, 旧数值不得出现在本次行 */
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092610", 29.8, 28.4); /* 个股旧值预存(窗内) */
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092640", 3720, 3660); /* 仅指数被本次改写 */
  doc._scripts[0].onload();
  test("新鲜度(13:26): 持仓旧报价未被本次响应改写→该行missing(旧值不冒充)", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 });
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "指数为本次新报价→记录成立");
    const p1 = rec.ps.find((x) => x.code === "600105");
    assert.strictEqual(p1.q.state, "missing", "未被改写的旧值不得作为本次行");
    assert.strictEqual(p1.q.p, undefined, "旧数值不得出现在本次行里");
    assert.strictEqual(p1.q.why, "no-row");
  });
}

/* ── F3. 基准穿透(13:26审查件): buildWinRec日期判定随tick(now)流程日, 不再重取_now ── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  const clockMs = new Date(2026, 9, 22, 23, 59, 0).getTime(); /* 注入钟=10-22(与流程日不同) */
  api._clockSet(clockMs);
  const r = api.tick(new Date(2026, 9, 23, 9, 26, 31).getTime()); /* 流程日=10-23 */
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092640", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092641", 29.8, 28.4);
  doc._scripts[0].onload();
  test("基准(13:26): buildWinRec日期判定穿透tick(now)流程日——同记录日期/报价日/时间字段一致", () => {
    assert.deepStrictEqual(r, { fired: "09:26", att: 1 });
    const rec = api.readStore().recs.filter((x) => x.type === "win")[0];
    assert.ok(rec);
    assert.strictEqual(rec.d, "2026-10-23", "日期=报价日");
    assert.strictEqual(rec.t, "20261023092640", "时间=报价a[30]");
    assert.strictEqual(rec.idx.state, "ok", "指数判定按流程日today8(修复前重取_now→10-22误标stale)");
    assert.strictEqual(rec.ps.find((x) => x.code === "600105").q.state, "ok", "个股判定同基准");
    assert.strictEqual(api.st.lastAt, clockMs, "lastAt=落库时刻走_now(12:33既定口径, 与采样基准分离)");
  });
}

/* ── C. 并发写入隔离(13:44审查件·闭合①残余边界): 报价脚本载入一次性隔离iframe, 主包顶层写入物理不可达 ── */
{
  /* C1: 主包并发更新顶层v_落在请求后、onload前——隔离窗读不到, 不得冒充本次响应 */
  const doc = makeDoc({ iso: true });
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  global["v_sh000001"] = qstr("上证指数", 9999, 10000, 10000, "20261023092640", 10001, 9998); /* 主包并发写顶层(值合法且在窗内——若读顶层必被接受) */
  const sc = doc._scripts[0];
  if (sc) sc.onload(); /* 本次响应到达但未在隔离窗写入任何值 */
  test("隔离(13:44): 主包并发写顶层v_不得进入本次结果(隔离窗读不到)", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 });
    const s = api.readStore();
    assert.strictEqual(s.recs.filter((r) => r.type === "win").length, 0, "顶层并发值不得冒充本次响应");
    const miss = s.recs.find((r) => r.type === "miss");
    assert.ok(miss, "留可追踪miss");
    assert.strictEqual(miss.reason, "fetch-failed-1");
    assert.ok(String(global["v_sh000001"]).indexOf("9999") >= 0, "主包顶层值原样保留(模块零侵入, 只动自己的隔离窗)");
  });
}
{
  /* C2: 主包顶层并发值与本次隔离窗响应值并存——记录必须取隔离窗值(来源归属可证) */
  const doc = makeDoc({ iso: true });
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  global["v_sh000001"] = qstr("上证指数", 9999, 10000, 10000, "20261023092640", 10001, 9998); /* 主包并发(价9999) */
  const fr = doc._iframes[0];
  if (fr) { /* 守卫: 闭合前模块不建iframe→走断言失败而非文件崩溃 */
    fr.contentWindow["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092640", 3720, 3660); /* 本次响应(价3670) */
    fr.contentWindow["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092641", 29.8, 28.4);
  }
  doc._scripts[0].onload();
  test("隔离(13:44): 并发下记录取隔离窗响应值(顶层值不冒充)——来源归属可证", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 });
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "本次响应在隔离窗→记录成立");
    assert.strictEqual(rec.idx.p, 3670, "取隔离窗值(若读顶层会是9999)");
    assert.strictEqual(rec.idx.state, "ok");
    assert.strictEqual(rec.ps.find((x) => x.code === "600105").q.p, 28.44);
  });
}
{
  /* C3: 每请求全新iframe——自身上轮响应值不残留冒充本次 */
  const doc = makeDoc({ iso: true });
  const api = freshMod(seedDay(), doc);
  api._clockSet(local(9, 26, 31));
  const t1 = api.tick();
  const fr1 = doc._iframes[0];
  if (fr1) fr1.contentWindow["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261022092640", 3720, 3660); /* 上轮响应: 昨日报价(合法结构, 落miss) */
  doc._scripts[0].onload();
  api._clockSet(local(9, 26, 53));
  const t2 = api.tick();
  const sc2 = doc._scripts[1];
  if (sc2) sc2.onload(); /* 本次响应未交付任何值 */
  test("隔离(13:44): 每请求全新iframe——自身上轮响应值不残留冒充本次", () => {
    assert.deepStrictEqual(t1, { fired: "09:26", att: 1 });
    assert.deepStrictEqual(t2, { fired: "09:26", att: 2 });
    assert.strictEqual(doc._iframes.length, 2, "两请求两个独立窗(复用窗=残留口)");
    const s = api.readStore();
    assert.strictEqual(s.recs.filter((r) => r.type === "win").length, 0, "上轮窗内旧值不得残留进本次");
    const miss = s.recs.find((r) => r.type === "miss");
    assert.strictEqual(miss.reason, "fetch-failed-2", "二连败精确归因(若残留会复现quote-date)");
  });
}

/* ── N. 异常防护(13:26审查件): 合法JSON结构异常/持仓条目异常不中断 ── */
{
  /* N1: 持仓数组含 null/数字/字符串/无码对象→跳过异常条目, 合法条目照常记账 */
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), {
    jinlin_stocks_v2: JSON.stringify([null, 123, "junk", { name: "无码" }, { code: "600105", name: "永鼎股份" }]) }), doc);
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  const sc = doc._scripts[0];
  if (sc) {
    global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092640", 3720, 3660);
    global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092641", 29.8, 28.4);
    sc.onload();
  }
  test("防护(13:26): 持仓含异常条目(null/非对象/无码)→跳过不中断, 合法行照常记账", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 }, "tick不因异常条目中断(修复前holdList抛错→{err}无miss)");
    assert.strictEqual(doc._scripts.length, 1);
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "win照常成立");
    assert.strictEqual(rec.ps.length, 1, "只组装合法条目(异常条目跳过, 修复前整次采样中断)");
    assert.strictEqual(rec.ps[0].code, "600105");
    assert.strictEqual(rec.ps[0].q.state, "ok");
  });
}
{
  /* N2: 合法JSON但值为null(板块表/memo)→空表missing, 响应不中断 */
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), {
    jl_sector_ff_v1: "null", jinlin_tier_memo_v1: "null" }), doc);
  api._clockSet(local(9, 26, 31));
  const t = api.tick();
  global["v_sh000001"] = qstr("上证指数", 3670, 3713, 3714, "20261023092640", 3720, 3660);
  global["v_sh600105"] = qstr("永鼎股份", 28.44, 29.54, 29.53, "20261023092641", 29.8, 28.4);
  doc._scripts[0].onload();
  test("防护(13:26): 合法JSON但null值(板块表/memo)→missing不崩溃, win照常成立", () => {
    assert.deepStrictEqual(t, { fired: "09:26", att: 1 });
    const rec = api.readStore().recs.filter((r) => r.type === "win")[0];
    assert.ok(rec, "响应组装不因null表中断(修复前capSecF抛错→既无win也无miss)");
    assert.strictEqual(rec.sf.state, "missing", "板块表null→missing(不伪造空表ok)");
    assert.strictEqual(rec.sf.n, 0);
    assert.strictEqual(rec.ps[0].m, null, "memo null→m=null(capMemo既有守卫路径实证)");
  });
}

/* ── W6L. 超长坏JSON(12:33审查件): _rawTxt=前8192字符片段, 口径=片段保全非全文 ── */
{
  const longBad = "{bad json " + "x".repeat(20000);
  const doc = makeDoc();
  const api = freshMod(Object.assign(seedDay(), { jl_osnap_v1: longBad }), doc);
  test("W6(12:33): 超长坏JSON(20000字符)→_rawTxt保全前8192字符片段, 状态unreadable, 功能继续", () => {
    const s = api.readStore();
    assert.ok(s && s._rawTxt, "空壳带原文片段");
    assert.strictEqual(s._rawTxt.length, 8192, "上限8192");
    assert.strictEqual(s._rawTxt, longBad.slice(0, 8192), "片段=原文前8192字符");
    assert.strictEqual(JSON.parse(api.exportText()).storeState, "unreadable", "导出口径=unreadable(不冒充ok)");
    assert.strictEqual(api.manual().ok, true, "功能继续(空壳起跑)");
    assert.ok(api.readStore().recs.length >= 1, "新记录可累积");
    assert.strictEqual(api.readStore()._rawTxt, longBad.slice(0, 8192), "首写后片段随键保全(仍≤8192)");
  });
}

/* ── K. 周末预筛(补充6外延: 窗口外跳过的另一面) ────────────────── */
{
  const doc = makeDoc();
  const api = freshMod(seedDay(), doc);
  api._clockSet(new Date(2026, 9, 24, 9, 26, 31).getTime()); /* 2026-10-24 周六 */
  const r = api.tick();
  test("周末: tick skip=weekend, 零请求零写入", () => {
    assert.deepStrictEqual(r, { skip: "weekend" });
    assert.strictEqual(doc._scripts.length, 0);
  });
}

/* ── 汇总 ──────────────────────────────────────────────────────── */
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log("\nFailed tests:");
  results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ✗ ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
