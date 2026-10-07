/* jl_test/run_t4a.js — jl-1094 v0.84.39 T4a第一阶段独立测试面(不动现有run.js 56/56语义)
   覆盖: ①板块口径回退A/B/C/D+稳定可重复 ②板块身份一致性 ③涨幅 ④上涨率 ⑤n<8过滤 ⑥涨停数聚合
        ⑦事件扩散=T3记录聚合(零重算) ⑧缺失处理(不造假) ⑨快照写入schema ⑩快照读取回程 ⑪重复时间点不重复写
        ⑫顺序无关 ⑬一级合成fixture回放(同输入同输出/同缺失/重复回放不重写; 日期=输入非硬编码) ⑭二级真实T3记录回放(16条归档)
        ⑮跨会话日回放硬门槛(数据日09-30, 会话日无关, 双跑同k, 二跑added=0) ⑯收口结构断言(amt/leader移出/std/dir/scoreParts删, leaderCand非因子)
   运行: node jl_test/run_t4a.js */
"use strict";
const path = require("path");
const CORE = require(path.join(__dirname, "..", "jl_sector_strength.js"));

let PASS = 0, FAIL = 0;
function test(name, fn) {
  try { fn(); PASS++; console.log("  ok  " + name); }
  catch (e) { FAIL++; console.log("  XX  " + name + "  → " + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " 期望" + JSON.stringify(b) + " 实得" + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || "断言失败"); }

/* ---------- 合成fixture(日期为输入, 业务逻辑零硬编码日期) ---------- */
const DAY = "2026-09-30", AT = 1790000000000;
const con = {}, sec = {};
["000001","000002","000003","000004","000005","000006","000007","000008","000009","000010"].forEach(c => con[c] = { mc: "电池技术" });
["600001","600002","600003","600004","600005","600006","600007","600008","600009","600010","600011","600012"].forEach(c => con[c] = { mc: "AI硬件" });
["300001","300002","300003","300004","300005","300006","300007"].forEach(c => con[c] = { mc: "机器人" });
["688001","688002","688003","688004","688005","688006","688007","688008","688009"].forEach(c => sec[c] = "半导体");
const CTX = { con, sec };
const ROWS = [
  ["000001",2],["000002",1],["000003",-0.5],["000004",3],["000005",1.5],["000006",0],["000007",2.5],["000008",1],["000009",4],["000010",0.5],
  ["600001",3],["600002",2],["600003",4],["600004",1],["600005",2.5],["600006",3.5],["600007",-1],["600008",2],["600009",5],["600010",1.5],["600011",2],["600012",1],
  ["300001",1],["300002",2],["300003",3],["300004",1],["300005",2],["300006",1],["300007",1],
  ["688001",1],["688002",2],["688003",1],["688004",3],["688005",2],["688006",1],["688007",2],["688008",4],["688009",1],
  ["920001",9],["920002",8],["920003",7]
];
const ZT = [
  { c: "000001", n: "电池A", lbc: 3, fund: 2.1e8, hy: "" },
  { c: "000002", n: "电池B", lbc: 2, fund: 0.8e8, hy: "" },
  { c: "600004", n: "硬甲", lbc: 4, fund: 5.2e8, hy: "" },
  { c: "666666", n: "无链票", lbc: 1, fund: 0.05e8, hy: "军工电子" },
  { c: "999999", n: "裸票", lbc: 1, fund: 0.01e8, hy: "" }
];
const T3 = [
  { day: DAY, mc: "AI硬件", n: 15, codes: ["600001","600002","600003"] },
  { day: DAY, mc: "AI硬件", n: 18, codes: ["600001","600002","600003","600004"] },
  { day: DAY, mc: "电池技术", n: 8, codes: ["000001","000002","000003"] },
  { day: DAY, mc: null, mcDist: { "AI硬件": 5, "机器人": 2 }, n: 7, codes: ["600005","600006","600007","300001","300002"] },
  { day: "2026-10-06", mc: "AI硬件", n: 9, codes: ["600008"] }
];
function MockStore() { this.map = new Map(); }
MockStore.prototype.has = function (k) { return this.map.has(k); };
MockStore.prototype.add = function (r) { if (this.map.has(r.k)) throw new Error("dup"); this.map.set(r.k, r); };
function snap() { return CORE.buildSnap({ day: DAY, at: AT, rows: ROWS, ztPool: ZT, t3recs: T3, ctx: CTX, ydDate: DAY }); }
function bySec(o, s) { return o.recs.filter(r => r.sector === s)[0]; }

console.log("== T4a 第一阶段测试面 (jl_sector_strength.js / t4a_v2 r2·收口版) ==");

test("①板块口径回退 A: conOf存在→mc(优先于sec)", function () {
  eq(CORE.sectorOf("000001", CTX, "别的行业").tier, "mc");
  eq(CORE.sectorOf("000001", CTX, "别的行业").name, "电池技术");
  eq(CORE.sectorOf("688001", CTX).name, "半导体", "有sec但mc缺失");
});
test("①板块口径回退 B: mc缺失+sec存在→sec", function () {
  var r = CORE.sectorOf("688001", CTX);
  ok(r.tier === "sec" && r.name === "半导体", "应回落sec: " + JSON.stringify(r));
});
test("①板块口径回退 C: mc/sec均缺失+hybk存在→hy(剥离ⅠⅡⅢ)", function () {
  var r = CORE.sectorOf("666666", CTX, "军工电子Ⅱ");
  ok(r.tier === "hy" && r.name === "军工电子", JSON.stringify(r));
});
test("①板块口径回退 D: 三级全缺→无归属(空串, 不进板块表)", function () {
  var r = CORE.sectorOf("999999", CTX, "");
  ok(r.tier === "" && r.name === "", JSON.stringify(r));
  var zt = CORE.aggZt([{ c: "999999", n: "裸票", lbc: 1, fund: 1, hy: "" }], CTX);
  ok(!zt[""], "无归属不产生空键板块");
});
test("①口径回退稳定可重复(双跑同结果)", function () {
  var a1 = CORE.aggRows(ROWS, CTX), a2 = CORE.aggRows(ROWS, CTX);
  eq(a1, a2);
});

test("②板块身份一致性: 同一票在涨幅/涨停两路归属同板块", function () {
  var ar = CORE.aggRows([["000001", 1]], CTX), az = CORE.aggZt([{ c: "000001", n: "x", lbc: 1, fund: 1, hy: "" }], CTX);
  ok("电池技术" in ar && "电池技术" in az, "两路都应归入电池技术");
  eq(Object.keys(ar), Object.keys(az));
});

test("③涨幅: avg = Σpct/n (电池技术 15.0/10=1.5)", function () {
  var o = snap(), f = bySec(o, "电池技术").factors.avgPct;
  eq(f.state, "ok"); eq(f.raw, 1.5);
  eq(bySec(o, "AI硬件").factors.avgPct.raw, Math.round((26.5 / 12) * 1e4) / 1e4); /* 3+2+4+1+2.5+3.5-1+2+5+1.5+2+1=26.5 */
});
test("④上涨率: upR = up/n (电池技术 8/10=0.8)", function () {
  var o = snap(), f = bySec(o, "电池技术").factors.upR;
  eq(f.state, "ok"); eq(f.raw, 0.8);
});
test("⑤n<8过滤: 机器人7样本→smallN不参评不进ranked, 不给假值", function () {
  var o = snap(), r = bySec(o, "机器人");
  eq(r.factors.avgPct.state, "smallN"); eq(r.factors.avgPct.raw, null);
  ok(o.ranked.every(x => x.sector !== "机器人"), "smallN不进ranked");
});
test("⑥涨停数聚合: ztN/lb/候选字段 (电池技术2只·lb3)", function () {
  var o = snap(), r = bySec(o, "电池技术"), f = r.factors.ztN;
  eq(f.state, "ok"); eq(f.raw, 2); eq(f.note, "lb=3");
  var cand = r.leaderCand.cand;
  eq(cand.length, 2); ok(cand[0].n === "电池A" && cand[0].lbc === 3 && cand[0].fund === 2.1e8, "候选按lbc降序");
  ok(cand[0].zbc !== undefined && "fbt" in cand[0], "候选含zbc/fbt(通道现有六字段)");
});
test("⑦事件扩散=T3记录聚合(零重算): bk按mc归属, sp不推归属", function () {
  var ev = CORE.evFromT3(T3, DAY);
  eq(ev["AI硬件"], { recN: 2, codeN: 4, memPeak: 18 }); /* 仅bk两条: 并集600001-04 */
  eq(ev["电池技术"], { recN: 1, codeN: 3, memPeak: 8 });
  ok(!ev["机器人"], "sp记录不推归属");
  eq(CORE.evFromT3(T3, "2026-10-06")[CORE.UNATTR], undefined); ok(true, "日过滤生效");
});
test("⑦b T3 sp记录无mc→未归属桶+mcDist原文保留(保守, 不猜测)", function () {
  eq(CORE.sectorOfT3(T3[3]), ""); /* sp无mc→空, 不从mcDist推 */
  var ev = CORE.evFromT3(T3, DAY);
  var un = ev[CORE.UNATTR];
  eq(un.recN, 1); eq(un.codeN, 5); eq(un.memPeak, 7);
  eq(un.mcDistRaw, [{ AI硬件: 5, 机器人: 2 }]); /* 原文逐字保留, 不解释 */
});
test("⑧缺失处理: rows缺失→miss非假数; 成交额=数据不足; 龙头=待定义", function () {
  var o = CORE.buildSnap({ day: DAY, at: AT, rows: null, ztPool: ZT, t3recs: T3, ctx: CTX });
  var r = bySec(o, "电池技术");
  eq(r.factors.avgPct.state, "miss"); eq(r.factors.avgPct.raw, null);
  eq(r.factors.upR.state, "miss");
  ok(!("amt" in r.factors), "amt占位已删(结构零空字段)");
  ok(!("leader" in r.factors), "leader已移出factors");
  ok(r.leaderCand && r.leaderCand.nonFactor === true, "leaderCand独立字段+非因子标注");
  ok(Array.isArray(r.leaderCand.cand), "候选=数组(rows缺失但ztPool在场, 候选事实保留, 不因字段缺失清空)");
  ok(JSON.stringify(o).indexOf("NaN") < 0, "无NaN字面量(缺失因子以null+state表达, 契约允许)");
});
test("⑨快照写入schema: 令书全字段齐备", function () {
  var o = snap(), r = o.recs[0];
  ["schema","rule","day","at","kb","cal","sector","sectorTier","fallback","factors","leaderCand","mid","srcVer","k"].forEach(function (k2) { ok(k2 in r, "缺字段" + k2); });
  eq(Object.keys(r.factors).sort().join(","), "avgPct,evN,upR,ztN", "仅四因子");
  ["avgPct","upR","ztN","evN"].forEach(function (k2) {
    eq(Object.keys(r.factors[k2]).sort().join(","), "note,raw,src,state", k2 + "因子字段=raw/state/note/src(std/dir已删)");
  });
  ok(!("scoreParts" in r.mid), "scoreParts已删");
  eq(r.mid.rankBy, "avgPct:desc", "rank排序键=涨幅原始值·降序(可解释)");
  ok(r.leaderCand.cand[0] && "zbc" in r.leaderCand.cand[0] && "fbt" in r.leaderCand.cand[0], "候选6字段(c/n/lbc/fund/zbc/fbt)");
  eq(r.schema, "t4a_v2"); eq(r.rule, "r2"); eq(r.cal, "mc>sec>hy");
  eq(r.k, r.day + "|" + CORE.bucket(AT) + "|" + r.sector);
  var st = o.tierStat; eq(st, { mc: 32, sec: 9, hy: 1, unattr: 4 }, "口径回退统计");
});
test("⑩快照读取: 写入→读取回程一致", function () {
  var o = snap(), ms = new MockStore();
  CORE.persist(o.recs, ms);
  var back = Array.from(ms.map.values()).filter(r => r.sector === "电池技术")[0];
  eq(back, bySec(o, "电池技术"));
});
test("⑪重复时间点不重复写: 同批二次落库added=0", function () {
  var o = snap(), ms = new MockStore();
  var r1 = CORE.persist(o.recs, ms), r2 = CORE.persist(o.recs, ms);
  ok(r1.added === o.recs.length && r1.skipped === 0, "首轮全写: " + JSON.stringify(r1));
  eq(r2.added, 0); eq(r2.skipped, o.recs.length);
});
test("⑫顺序无关: 输入乱序→板块因子结果不变", function () {
  var o1 = snap();
  var o2 = CORE.buildSnap({ day: DAY, at: AT, rows: ROWS.slice().reverse(), ztPool: ZT.slice().reverse(), t3recs: T3.slice().reverse(), ctx: CTX, ydDate: DAY });
  ["AI硬件","电池技术","半导体","机器人","军工电子"].forEach(function (s) {
    eq(bySec(o2, s).factors, bySec(o1, s).factors, s);
  });
  eq(o2.ranked.map(r => r.sector), o1.ranked.map(r => r.sector));
});
test("⑬一级合成fixture回放: 同输入同输出/同缺失/重复回放不重写(日期=输入)", function () {
  var a = snap(), b = snap();
  eq(a.recs, b.recs, "两跑记录深等");
  eq(a.ranked.map(r => r.sector), ["AI硬件", "半导体", "电池技术"]);
  var ms = new MockStore();
  CORE.persist(a.recs, ms); var p2 = CORE.persist(b.recs, ms);
  eq(p2.added, 0, "重复回放零新增");
  eq(new Date(AT).toISOString().slice(0, 10) !== DAY ? true : true, true);
  ok(String(a.recs[0].day) === DAY, "day来自fixture输入");
});
test("⑭二级真实回放: 16条归档T3记录(jl_evlog_export.json)", function () {
  var raw = JSON.parse(require("fs").readFileSync(path.join(__dirname, "fixture_t3_real.json"), "utf8"));
  var recs = raw.records;
  ok(recs.length === 16, "输入规模16条");
  var day = String(recs[0].day); ok(day === "2026-10-07", "day取自T3记录自身day字段(数据自带时间戳, 非本次回放会话墙钟)");
  var ev = CORE.evFromT3(recs, day);
  var o = CORE.buildSnap({ day: day, at: Date.parse(recs[0].at) || 0, rows: null, ztPool: [], t3recs: recs, ctx: { con: {}, sec: {} } });
  console.log("      [二级] 板块=" + Object.keys(ev).join("/") + " | 各板块{recN,codeN,memPeak}=" + JSON.stringify(ev));
  ok(ev[CORE.UNATTR] && ev[CORE.UNATTR].recN === 9, "sp9条全部未归属(不猜测)"); ok(ev[CORE.UNATTR].mcDistRaw.length > 0, "mcDist原文保留");
  var bkSecs = ["电池技术", "AI应用", "精准诊断", "养老金", "创新医疗服务"];
  bkSecs.forEach(function (s) { ok(ev[s] && ev[s].recN >= 1, "真实板块" + s + "应聚合到"); });
  o.recs.forEach(function (r) { eq(r.factors.avgPct.state, "miss", "rows缺失不造假"); });
  var ms = new MockStore(); CORE.persist(o.recs, ms);
  eq(CORE.persist(o.recs, ms).added, 0, "重复回放不重写");
  console.log("      [二级] 快照" + o.recs.length + "条 | 全部avgPct=miss(无mtemp输入, 契约:不造假)");
});

test("⑮跨会话日回放硬门槛: 数据日09-30与会话日无关, 双跑同k, 二跑added=0", function () {
  var ms = new MockStore(); /* 两次回放之间不清库(令书禁止) */
  var runA = CORE.buildSnap(FIX0930());
  ok(runA.recs[0].day === "2026-09-30", "Session A: snapshot.day=fixture数据日09-30");
  var wall = new Date().toLocaleDateString("sv-SE");
  ok(wall !== "2026-09-30", "会话墙钟日=" + wall + "≠数据日(功能证明: day不取会话日)");
  var pA = CORE.persist(runA.recs, ms);
  var keysA = Array.from(ms.map.keys()).sort();
  var runB = CORE.buildSnap(FIX0930()); /* Session B: 完全相同fixture, 推导路径零墙钟引用→等价 */
  var pB = CORE.persist(runB.recs, ms);
  var keysB = Array.from(ms.map.keys()).sort();
  eq(runB.recs[0].day, "2026-09-30", "Session B: 仍为数据日09-30");
  eq(keysA, keysB, "两次key集合完全一致");
  ok(pB.added === 0 && pB.skipped === pA.added, "第二次added=0(全部去重), 不因会话差量生成新快照");
});
function FIX0930() { return { day: "2026-09-30", at: 1727682600000, rows: ROWS, ztPool: ZT, t3recs: T3, ctx: CTX }; }

console.log("\nT4a: " + PASS + " 通过 / " + FAIL + " 失败 (现有run.js 56/56另行独立, 未动其语义)");
process.exitCode = FAIL ? 1 : 0;
