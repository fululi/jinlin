/* jl-1143 (v0.84.92-dkkeeper) 桩测试 —— 中波段卡自持日K管家端到端验证
   场景=用户现场复刻: realCache 里 sh600105|日K 冻在 2026-08-27,
   东财 loadKlineJSONP 恒拒(家庭WiFi实证), 腾讯 fqkline 通(带真实形态数据)。
   断言:
   1 一轮 round 后 日K缓存末日=2026-10-21(最近交易日), dkSaveJL 落盘
   2 渲染四件套被调(renderDeck/renderWatch/renderResonanceJL/renderTierFibDetail)
   3 源序正确: 东财先尝, 拒了才走腾讯
   4 紧接第二轮: 数据已新鲜 → 零请求(稳态不发)
   5 新鲜bars喂 swingStateJL → dkStale=false(陈旧徽标退场), 波段锚用新数据 */
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
// 管家 IIFE 整段抽出(从批注标记到 IIFE 收尾)
const m0 = html.indexOf("/* jl-1143: keep daily-K caches fresh");
if (m0 < 0) throw new Error("keeper block not found");
const m1 = html.indexOf("})();", m0);
if (m1 < 0) throw new Error("keeper block end not found");
const keeperSrc = html.slice(m0, m1 + 5);
eval([extract("normRealRows"), extract("barTime"), extract("jlBarsSaneJL"), extract("jlDkStalenessJL"), extract("rmaAtrSeriesJL"), extract("zzThJL"), extract("zzPivotsJL"), extract("zzMergeSmallLegsJL"), extract("swingStateJL")].join("\n;\n"));

// —— 桩环境 ——
const calls = { em: 0, tx: 0, saved: [], deck: 0, watch: 0, reso: 0, detail: 0 };
// 冻结缓存: 30根合成日K, 末根 2026-08-27 收 41.10(复刻用户现场)
const frozenBars = (() => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ t: "", o: 35, c: 35, h: 35.2, l: 34.8, v: 1e5 });
  rows[28] = { t: "", o: 43.2, c: 42.0, h: 43.3, l: 41.5, v: 1e5 };
  rows[29] = { t: "", o: 40.0, c: 41.1, h: 41.2, l: 39.7, v: 1e5 };
  let d = new Date("2026-08-27T00:00:00");
  for (let i = rows.length - 1; i >= 0; i--) { rows[i].t = d.toLocaleDateString("sv-SE"); d.setDate(d.getDate() - 1); }
  return rows;
})();
// 腾讯兜底返回: [date, open, close, high, low, volume] 70根,
// 形态=平台35→砸出29.11底→拉43.36→回落→近月单边跌到29.38(复刻永鼎真实走势), 末根 2026-10-21
function txBars() {
  const P = []; // [o,c,h,l]
  for (let i = 0; i < 20; i++) P.push([35, 35, 35.2, 34.8]);
  for (let i = 0; i < 10; i++) { const c = 35 - (35 - 29.26) * (i + 1) / 10; P.push([c + 0.3, c, c + 0.3, c - 0.15]); }
  for (let i = 0; i < 12; i++) { const c = 29.26 + (43.21 - 29.26) * (i + 1) / 12; P.push([c - 0.2, c, c + 0.15, c - 0.3]); }
  P.push([43.2, 42.0, 43.3, 41.5]); P.push([41.8, 40.2, 41.9, 39.8]); P.push([40.0, 41.1, 41.2, 39.7]);
  const closes = [39.5, 38.8, 39.2, 38.1, 37.4, 36.8, 37.9, 38.5, 37.6, 36.9, 36.2, 35.8, 36.5, 35.2, 34.6, 35.4, 34.8, 34.1, 33.7, 34.3, 33.0, 32.4, 33.1, 32.5, 31.8, 31.2, 31.9, 31.0, 30.4, 31.2, 30.6, 29.9, 29.3, 30.0, 29.4, 28.7, 28.1, 28.8, 29.2, 28.6, 27.9, 28.4, 29.0, 28.4, 27.6, 28.1, 28.7];
  for (let i = 0; i < closes.length; i++) { const c = closes[i], o = i ? closes[i - 1] : 41.1; P.push([o, c, Math.max(o, c) + 0.55, Math.min(o, c) - 0.5]); }
  P[P.length - 1] = [28.77, 29.38, 30.07, 28.45];
  const rows = [];
  let d = new Date("2026-07-15T00:00:00");
  for (const [o, c, h, l] of P) {
    rows.push([d.toLocaleDateString("sv-SE"), String(o), String(c), String(h), String(l), "900000"]);
    d.setDate(d.getDate() + 1);
  }
  rows[rows.length - 1][0] = "2026-10-21";
  return rows;
}
const realCache = new Map([["sh600105|日K", frozenBars]]);
globalThis.realCache = realCache;
globalThis.__OFF = () => false;
globalThis.allMarketSymbolsJL = () => [{ code: "600105" }];
globalThis.jlLastTradeDay = () => "2026-10-21";
globalThis.loadKlineJSONP = async () => { calls.em++; throw new Error("push2his blocked (家庭WiFi实证)"); };
globalThis.fetch = async () => { calls.tx++; return { json: async () => ({ code: 0, data: { sh600105: { qfqday: txBars() } } }) }; };
globalThis.dkSaveJL = (code, rows) => { calls.saved.push([code, rows[rows.length - 1].t]); };
globalThis.jlObserveTradeDayJL = () => {};
globalThis.renderDeck = () => { calls.deck++; };
globalThis.renderWatch = () => { calls.watch++; };
globalThis.renderResonanceJL = () => { calls.reso++; };
globalThis.renderTierFibDetail = () => { calls.detail++; };
globalThis.stocks = [{ code: "600105" }];
globalThis.active = 0;
globalThis.document = { hidden: false, addEventListener() {}, body: { classList: { contains: () => false } } };
globalThis.window = globalThis;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
eval(keeperSrc);
const round = globalThis.__dkKeeperRoundJL;
if (typeof round !== "function") throw new Error("round not exposed");

let pass = 0, fail = 0;
const T = (cond, nm) => { if (cond) pass++; else { fail++; console.log("FAIL:", nm); } };

(async () => {
  await round();
  const fresh = realCache.get("sh600105|日K");
  T(fresh && fresh.length === 92 && fresh[fresh.length - 1].t === "2026-10-21", "1a 缓存已更新到 2026-10-21");
  T(fresh && Math.abs(fresh[fresh.length - 1].c - 29.38) < 1e-9, "1b 末根收盘=29.38(腾讯真实数据)");
  T(calls.saved.length === 1 && calls.saved[0][0] === "sh600105" && calls.saved[0][1] === "2026-10-21", "1c dkSaveJL 落盘");
  T(calls.deck === 1 && calls.watch === 1 && calls.reso === 1 && calls.detail === 1, "2 渲染四件套各调一次");
  T(calls.em === 1 && calls.tx === 1, "3 东财先尝1次→拒→腾讯1次");
  const emBefore = calls.em, txBefore = calls.tx;
  await round();
  T(calls.em === emBefore && calls.tx === txBefore, "4 稳态零请求(数据新鲜不再发)");
  // 5 新鲜 bars 喂 swingStateJL: 徽标退场
  const st = swingStateJL(fresh, 27.88, { closed: false });
  T(st.dkStale === false, "5a dkStale=false");
  T(st.dkAgeD <= 4, "5b age<=4");
  T(st.refC === 27.88, "5c refC=现价(陈旧时才有的双口径已消");
  T(st.msg.indexOf("陈旧") < 0, "5d msg 无陈旧字样");
  console.log(`\n新鲜bars末根: ${JSON.stringify(fresh[fresh.length - 1])}`);
  console.log(`swingStateJL: ${JSON.stringify({ L1: st.L1, H1: st.H1, broke: st.broke, stale: st.dkStale, msg: st.msg })}`);
  console.log(`\n结果: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
