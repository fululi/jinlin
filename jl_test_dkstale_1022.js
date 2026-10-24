/* jl-1142 (v0.84.91-dkstale) 桩测试 —— 日K陈旧三态验证
   从 index.html 原样抽取相关函数（不复制实现），合成K线穷举：
   A 新鲜 bars + 现价破前低(收盘未破) → 行为与旧版一致(不破) 且 无徽标
   B 陈旧 bars(56天前) + 现价破前低 → broke=true 按现价口径 + 徽标字段齐
   C 陈旧 bars + 现价未破前低 → 不破 + 徽标 + msg含"陈旧"
   负向对照: 三态各自去掉补丁关键行应恰败（结构判别力自证） */
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf-8");
function extract(name) {
  const i = html.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  let d = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") d++;
    else if (html[k] === "}") { d--; if (!d) return html.slice(i, k + 1); }
  }
  throw new Error("unbalanced: " + name);
}
const names = ["jlDkStalenessJL", "rmaAtrSeriesJL", "zzThJL", "zzPivotsJL", "zzMergeSmallLegsJL", "swingStateJL"];
const src = names.map(extract).join("\n;\n");
// swingStateJL 体内的 /* @__PURE__ */ 注释无碍；eval 进本作用域
eval(src);

// —— 合成K线：35平台 → 砸出29.11底 → 拉到43.36 → 回落(确认H) → 尾收41.10 ——
// 价格序列先生成, 日期从lastDateStr倒填, 保证末日精确落在指定日
function mkBars(lastDateStr) {
  const rows = [];
  const add = (o, c, h, l) => rows.push({ o, c, h, l, v: 1e5 });
  for (let i = 0; i < 30; i++) add(35, 35, 35.2, 34.8);                    // 平台
  for (let i = 0; i < 10; i++) { const p = 35 - (35 - 29.26) * (i + 1) / 10; add(p + 0.3, p, p + 0.3, p - 0.15); } // 末根收29.26/低29.11
  for (let i = 0; i < 12; i++) { const p = 29.26 + (43.21 - 29.26) * (i + 1) / 12; add(p - 0.2, p, p + 0.15, p - 0.3); } // 末根收43.21/高43.36
  // 从43.36回落≥8%(确认H=43.36), 尾盘收到41.10(>前低29.11)
  add(43.2, 42.0, 43.3, 41.5); add(41.8, 40.2, 41.9, 39.8); add(40.0, 41.1, 41.2, 39.7);
  let d = new Date(lastDateStr + "T00:00:00");
  for (let i = rows.length - 1; i >= 0; i--) { rows[i].t = d.toLocaleDateString("sv-SE"); d.setDate(d.getDate() - 1); }
  return rows;
}
const todayStr = new Date().toLocaleDateString("sv-SE");
const fmt = (st) => ({ ok: st.ok, L1: st.L1, H1: st.H1, broke: st.broke, mode: st.brokeMode, refC: +st.refC.toFixed(2), stale: st.dkStale, age: st.dkAgeD, lastD: st.dkLastD, backN: st.back.length, extN: st.ext.length, msg: st.msg });

// A 新鲜(末日=今天): 旧口径, 收盘41.10>29.11 → 不破; liveP=27.88 低于前低但 bars 新鲜 → 仍按收盘判
const a = swingStateJL(mkBars(todayStr), 27.88, { closed: true });
// B 陈旧(末日=56天前, 近似10-22看08-25): 同一份 bars, liveP=27.88<29.11 → 补丁应判破
const oldD = new Date(); oldD.setDate(oldD.getDate() - 56);
const b = swingStateJL(mkBars(oldD.toLocaleDateString("sv-SE")), 27.88, { closed: true });
// C 陈旧 + liveP=42(未破): 不破 + 徽标
const c = swingStateJL(mkBars(oldD.toLocaleDateString("sv-SE")), 42, { closed: true });

let pass = 0, fail = 0;
const T = (cond, nm) => { if (cond) { pass++; } else { fail++; console.log("FAIL:", nm, JSON.stringify({ a: fmt(a), b: fmt(b), c: fmt(c) }, null, 1)[nm === "A" ? 0 : 0]); } };
T(Math.abs(a.L1 - 29.11) < 1e-9 && Math.abs(a.H1 - 43.36) < 1e-9, "合成腿锚 29.11→43.36");
T(a.dkStale === false && a.broke === false, "A 新鲜: 不破+无徽标(旧行为)");
T(a.dkAgeD <= 4, "A 新鲜: age<=4");
T(b.dkStale === true && b.dkAgeD === 56, "B 陈旧: stale+age=56");
T(b.refC === 27.88, "B 陈旧: refC=现价27.88(按现价口径)");
T(b.broke === true && b.back.length === 0 && b.bounce.length === 4, "B 陈旧+现价破前低: 翻转+接回档作废+反弹档4档");
T(b.msg.indexOf("陈旧") >= 0 && b.msg.indexOf("按现价口径") >= 0, "B msg 标注陈旧+现价口径");
T(b.ext.length === 3 && b.ext.every((x) => x.nonSwing), "B 外推3档带nonSwing");
T(c.dkStale === true && c.broke === false, "C 陈旧+现价未破: 不破");
T(c.msg.indexOf("截至") >= 0, "C msg 带截至日期");
console.log(`\nA=${JSON.stringify(fmt(a))}\nB=${JSON.stringify(fmt(b))}\nC=${JSON.stringify(fmt(c))}`);
console.log(`\n结果: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
