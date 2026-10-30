#!/usr/bin/env node
/* jl_test/run_swgfix.js — jl-1225 分时中段摆动戳补全 回归测试
 * 用法: node jl_test/run_swgfix.js
 * 覆盖:
 *   S1 名额: 旧参数(maxCount=4, 默认邻域n/14)丢中段次高/回落低, 新参数(8+n/30)全保
 *   S2 同向邻域滤除: 旧mg(n/14)把距极值12格的次峰当视觉重复滤掉, 新mg(n/30)保留
 *   S3 护栏: ±8格内贴极值同向摆动戳仍被滤(视觉重复保护不丢)
 *   S4 极值恒占: 新旧参数下日高/日低极值恒在(score=Infinity)
 *   S5 结构: marks按idx升序/字段齐全/数量受maxCount约束
 *   S6 源码守卫: index.html+ks.html两处调用侧(名额8+邻域n/30+同口径滤除);
 *              data-ver=0.90.3; 壳v306→v307成对(KEEP头插/最旧退役); iframe戳p2e→p2f; 验收钩子__cardTrendDbgJL; 1030晚jl-1226批: 版本断言随v0.90.4/v308升号(dkKeeper日K无前缀键补写)
 *   S7 语法: 两文件含createCardIntraday的script块new Function可编译(只编译不执行)
 * 纯本地, 零网络。回滚本批时删除本文件即可。 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const IDX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const KS = fs.readFileSync(path.join(ROOT, "ks.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name); }
}

/* ── 引擎函数抽取(花括号配对, 机制同extract.js) ── */
function grabFn(src, name) {
  const key = "function " + name + "(";
  const i = src.indexOf(key);
  if (i < 0) throw new Error("找不到函数: " + name);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") { depth++; started = true; }
    else if (ch === "}") depth--;
    if (started && depth === 0) return src.slice(i, j + 1);
  }
  throw new Error("花括号不配对: " + name);
}
const ENGINE = ["_phvlArm2", "_phvlScan2", "_phvlAlt2", "_phvlSwing2", "_phvlCompute"].map(n => grabFn(IDX, n)).join("\n");
const vctx = { Math, isFinite, Infinity, Number, parseFloat, parseInt };
vm.createContext(vctx);
vm.runInContext(ENGINE + "\n;__SWG = { compute: _phvlCompute };", vctx);
const compute = vctx.__SWG.compute;

/* ── 调用侧复刻: 与 index.html createCardIntraday 两版逐字同口径 ── */
function marksOld(p) { return compute(p, p, { maxCount: 4 }); }
function marksNew(p) { return compute(p, p, { maxCount: 8, minGap: Math.max(3, Math.round(p.length / 30)) }); }
function filt(marks, n, div) { /* jl-1142b 同向极值邻域滤除复刻 */
  const mg = Math.max(3, Math.round(n / div));
  return marks.filter(mk => {
    if (mk.extreme) return true;
    return !marks.some(q => q.extreme && q.type === mk.type && Math.abs(q.idx - mk.idx) < mg);
  });
}

/* ── 数据构造: 分段线性日线(241点) ── */
function buildDay(pieces) { /* [[末idx, 价格], ...从0起] */
  const p = [];
  let prevI = 0, prevV = pieces[0][1];
  for (const [ni, nv] of pieces) {
    const steps = ni - prevI;
    for (let k = 0; k <= steps; k++) p.push(+(prevV + (nv - prevV) * k / steps).toFixed(4));
    prevI = ni; prevV = nv;
  }
  return p;
}
/* S1 场景: 低开→两次推升(日高)→中段次高→尾段回落, 5个合格摆动 */
const dayA = buildDay([[0, 22.0], [25, 23.1], [70, 22.2], [110, 23.55], [150, 22.85], [185, 23.18], [215, 22.6], [240, 22.9]]);
const hasMark = (ms, type, idx) => ms.some(m => m.type === type && m.idx === idx);
const byIdx = ms => ms.map(m => m.idx);

console.log("S1 名额复现(旧4丢中段次高/回落低, 新8全保):");
{
  const o = filt(marksOld(dayA), dayA.length, 14), n = filt(marksNew(dayA), dayA.length, 30);
  ok(o.length <= 4, "旧参数marks≤4个(极值2+摆动≤2), 实得" + o.length);
  ok(!hasMark(o, "H", 190), "旧参数丢中段次高峰(次高idx190无签)——复现bug");
  ok(!hasMark(o, "L", 221), "旧参数丢中段回落低(idx221无签)——复现bug");
  ok(hasMark(n, "H", 190), "新参数保住中段次高峰(idx190有签)");
  ok(hasMark(n, "L", 154) && hasMark(n, "L", 221), "新参数保住中段回落低(idx154/221有签)");
  ok(n.length >= 6, "新参数中段摆动全覆盖(≥6签), 实得" + n.length);
}
console.log("S2 贴极值邻域(距极值12格, 旧17格滤掉/新8格保留):");
{
  const ext = [{ idx: 80, type: "H", price: 23.6, extreme: true, confirmed: true }, { idx: 0, type: "L", price: 22.0, extreme: true, confirmed: true }];
  const sub = [{ idx: 92, type: "H", price: 23.45, extreme: false, confirmed: true }, { idx: 140, type: "L", price: 22.4, extreme: false, confirmed: true }];
  const marks = ext.concat(sub).sort((a, b) => a.idx - b.idx);
  ok(filt(marks, 241, 14).length === 3, "旧mg(n/14): 距日高12格的次峰被当视觉重复滤掉");
  ok(hasMark(filt(marks, 241, 30), "H", 92), "新mg(n/30): 距日高12格的次峰保留");
}
console.log("S3 视觉重复护栏(±8格内仍滤):");
{
  const marks = [{ idx: 0, type: "L", price: 22.0, extreme: true }, { idx: 80, type: "H", price: 23.6, extreme: true }, { idx: 85, type: "H", price: 23.5, extreme: false, confirmed: true }, { idx: 140, type: "L", price: 22.4, extreme: false, confirmed: true }].sort((a, b) => a.idx - b.idx);
  ok(!hasMark(filt(marks, 241, 30), "H", 85), "距日高5格的次峰仍被滤(护栏保留)");
}
console.log("S4 极值恒占:");
{
  const o = marksOld(dayA), n = marksNew(dayA);
  const exO = o.filter(m => m.extreme), exN = n.filter(m => m.extreme);
  ok(exO.length === 2 && exN.length === 2, "新旧参数下日高+日低极值各恒2个");
  ok(exN.some(m => m.type === "H" && m.price === 23.55) && exN.some(m => m.type === "L" && m.price === 22.0), "极值取值=日线真实高低(23.55/22.0)");
}
console.log("S5 marks结构:");
{
  const n = marksNew(dayA);
  const ids = byIdx(n);
  ok(ids.every((v, i) => i === 0 || v > ids[i - 1]), "按idx升序");
  ok(n.every(m => typeof m.idx === "number" && (m.type === "H" || m.type === "L") && typeof m.price === "number" && typeof m.extreme === "boolean"), "字段齐全(idx/type/price/extreme)");
  ok(n.length <= 8, "数量受maxCount=8约束, 实得" + n.length);
  for (let i = 1; i < n.length; i++) ok2(n[i].idx - n[i - 1].idx >= 8, "相邻标记间距≥新minGap(8)");
}
function ok2(cond, name) { if (cond) pass++; else { fail++; console.log("  ✗ " + name); } }
console.log("S6 源码守卫(防回退):");
{
  for (const [tag, src] of [["index.html", IDX], ["ks.html", KS]]) {
    ok(src.includes("num(o.swingCount, 8, 3)"), tag + " 摆动名额默认4→8");
    const c30 = src.split("Math.round(p.length / 30)").length - 1;
    ok(c30 >= 2, tag + " 引擎邻域+同向滤除均n/30(≥2处), 实得" + c30);
    ok(!src.includes("Math.round(p.length / 14)"), tag + " 旧n/14口径清零");
    ok(src.includes("jl-1225"), tag + " 批注在位");
  }
  ok(IDX.includes('data-ver="0.90.4"'), "index data-ver=0.90.4");
  ok(IDX.includes('data-sw="jinlin-shell-v308"'), "index data-sw=v308(壳号成对)");
  ok(IDX.includes("v=p2f&code="), "index iframe戳p2e→p2f");
  ok(IDX.includes("__cardTrendDbgJL"), "index 验收钩子__cardTrendDbgJL在位");
  ok(SW.includes("const C = 'jinlin-shell-v308'"), "sw.js 缓存名v308");
  const keep = /const KEEP = \[([^\]]+)\]/.exec(SW)[1];
  ok(keep.startsWith("'jinlin-shell-v308','jinlin-shell-v307'"), "sw.js KEEP头插v308");
  ok(!keep.includes("jinlin-shell-v266"), "sw.js KEEP最旧v266退役(37项不变)");
}
console.log("S7 script块语法可编译:");
{
  for (const [tag, src] of [["index.html", IDX], ["ks.html", KS]]) {
    const i = src.indexOf("function createCardIntraday");
    const s0 = src.lastIndexOf("<script", i), s1 = src.indexOf("</script", i);
    const body = src.slice(s0 + 8, s1);
    let okc = true;
    try { new Function(body); } catch (e) { okc = false; console.log("    " + e.message); }
    ok(okc, tag + " 含createCardIntraday的script块编译通过");
  }
}
console.log("");
console.log(fail === 0 ? "swgfix " + pass + "/" + pass + " 全过" : "swgfix " + pass + " 通过 / " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
