/* jl_gapiv.js v4 (2026-11-17) 持仓卡/首页「IV 缺口」块: 重点跟进 + 今日iv宫格 + ↑iv / 现价 / ↓iv。版本史见 git log 和 ~/jinlin-zpw1104/HANDOFF.md。
   index.html 引用 jl_gapiv.js?v=12 —— 改本文件必须同时升这个号 (zpw_check.py pre 会查)。
   字段名(11-17 统一):
     gapUp   = 向上跳空(开在前收上方), 要往下跌才补; 显示成 ↓青。旧名 bull。
     fillPx  = 补满价 = 前收(缺口远沿)。所有"距离"只用一种: toFill = |补满价/现价−1|×100。
     origLo/origHi = 形成时的原始缺口区间;  remLo/remHi = 现在还没补的那段(未补才有)。
   回补率表 RTD / MT: 写死数据, 截至 TAB_ASOF, 超过 TAB_TTL_D 天在百分比后面标「旧表」(口径表 V2)。 */
(function () {
  "use strict";
  /* 口径表 V2: 日线缺口按"已挂几天没补"分档的回补率(逐票400根前复权日K, 截至11-03; 补=碰前收)。
     u=上缺口/高开(要跌下来补) d=下缺口/低开。第0行=开盘时[样本,当天补%,次日前补%,3日内补%]; 第1+a行=形成后已挂a个交易日仍未补(第6行=挂≥5天)[样本,下一交易日补%,之后3个交易日内补%]。 */
  const RTD = {"600105":{"u":[[161,62,70,76],[61,20,36],[49,12,20],[43,9,12],[39,0,15],[39,3,18],[38,13,24]],"d":[[193,77,83,89],[45,29,51],[31,19,39],[25,16,32],[21,10,19],[18,11,17],[16,0,12]]},"603986":{"u":[[184,61,71,81],[71,24,51],[54,28,43],[39,10,26],[35,11,23],[31,6,16],[29,7,10]],"d":[[182,62,72,79],[69,26,45],[50,20,30],[40,8,22],[37,5,19],[35,11,17],[31,3,6]]},"600176":{"u":[[169,64,72,76],[60,20,33],[48,12,21],[42,5,14],[40,5,10],[38,5,11],[36,0,6]],"d":[[194,81,87,90],[36,31,47],[24,17,33],[20,10,25],[18,11,28],[15,7,27],[14,14,21]]},"600489":{"u":[[180,56,64,73],[79,18,38],[65,18,34],[53,8,21],[49,12,27],[43,2,21],[42,14,19]],"d":[[201,61,72,81],[78,27,50],[57,21,40],[45,13,31],[39,13,28],[34,9,21],[31,10,19]]}};
  /* 口径表 V2: 分钟缺口回补率(本地真实K线重算, 截至11-04)。1分约12~23天/5分24天/15分70天/30分140天; 同日形成、到检查点(10:30/13:30/14:30/收盘)仍未补。
     MT[code][周期][检查点][0上缺口/1下缺口] = [样本, 当天补%, 次日收盘前补%, 3日内补%]; 样本<5 不显示百分比。 */
  const MT = {"600105":{"1分":[[[10,60,80,90],[28,46,46,46]],[[14,43,86,93],[26,23,27,27]],[[15,33,87,93],[24,4,17,17]],[[16,0,81,94],[28,0,21,21]]],"5分":[[[1,100,100,100],[6,67,67,67]],[[4,50,75,100],[4,25,50,50]],[[4,25,50,100],[5,20,40,40]],[[5,0,60,100],[5,0,20,20]]],"15分":[[[2,50,50,50],[8,38,50,62]],[[8,50,62,75],[11,27,36,64]],[[7,14,43,71],[13,0,31,62]],[[7,0,43,71],[16,0,38,62]]],"30分":[[[0,null,null,null],[4,25,50,50]],[[14,36,57,71],[6,33,50,67]],[[12,17,50,67],[6,0,33,67]],[[13,0,54,69],[7,0,43,71]]]},"603986":{"1分":[[[8,88,88,100],[11,55,64,73]],[[11,36,82,100],[13,23,54,62]],[[9,0,67,100],[17,6,53,65]],[[13,0,69,100],[17,0,53,65]]],"5分":[[[3,67,67,100],[1,0,0,0]],[[3,33,67,100],[3,0,67,67]],[[2,0,50,100],[9,11,67,67]],[[4,0,75,100],[10,0,50,50]]],"15分":[[[3,67,100,100],[4,75,75,75]],[[7,43,100,100],[8,38,88,88]],[[5,0,100,100],[11,36,91,91]],[[6,0,83,100],[8,0,75,75]]],"30分":[[[1,0,100,100],[5,60,80,80]],[[13,38,69,85],[14,36,86,86]],[[8,0,50,75],[10,10,80,80]],[[9,0,56,78],[9,0,78,78]]]},"600176":{"1分":[[[3,67,100,100],[10,70,70,70]],[[4,75,100,100],[6,33,33,33]],[[7,43,71,100],[5,0,20,20]],[[4,0,50,100],[7,0,29,29]]],"5分":[[[1,100,100,100],[5,80,80,80]],[[2,0,50,100],[3,33,33,33]],[[3,0,67,100],[3,0,0,0]],[[3,0,67,100],[4,0,25,25]]],"15分":[[[5,60,80,80],[4,50,75,75]],[[8,25,62,75],[7,57,86,86]],[[11,18,64,82],[7,14,86,86]],[[9,0,56,78],[6,0,83,83]]],"30分":[[[1,100,100,100],[2,100,100,100]],[[11,55,73,91],[7,43,71,86]],[[8,25,62,88],[8,0,50,75]],[[9,0,33,56],[8,0,50,75]]]},"600489":{"1分":[[[5,40,100,100],[4,50,50,50]],[[7,43,100,100],[5,20,20,20]],[[6,0,67,100],[8,12,12,25]],[[6,0,67,100],[9,0,11,33]]],"5分":[[[3,67,100,100],[4,50,75,75]],[[5,60,100,100],[6,0,33,33]],[[2,0,100,100],[8,0,25,25]],[[3,0,67,67],[8,0,25,25]]],"15分":[[[2,0,50,50],[2,0,0,50]],[[8,25,62,75],[9,11,44,56]],[[6,0,50,67],[9,0,33,44]],[[6,0,50,67],[10,0,40,50]]],"30分":[[[1,0,0,0],[3,67,67,67]],[[10,30,60,60],[13,31,62,62]],[[8,0,38,38],[9,0,44,44]],[[9,0,33,33],[9,0,44,44]]]}};
  const TAB_ASOF = "2026-11-04", TAB_TTL_D = 30;   /* 截至 11-04 (口径表 V2); 过了 30 天百分比后标「旧表」, 该重跑了 */
  const tabOld = () => Date.now() - new Date(TAB_ASOF + "T15:00:00+08:00").getTime() > TAB_TTL_D * 864e5;

  const LV = ["日", "30分", "15分", "5分", "1分"], ORD = { "1分": 1, "5分": 5, "15分": 15, "30分": 30, "日": 99 };
  const pf = (c) => (/^[569]/.test(c) ? "sh" : "sz") + c;
  const dg = (t) => String(t).replace(/\D/g, "");
  const hm = (t) => { const d = dg(t); return d.length >= 12 ? d.slice(8, 10) + ":" + d.slice(10, 12) : ""; };
  const md = (t) => { const d = dg(t); return d.slice(4, 6) + "-" + d.slice(6, 8); };
  const f2 = (x) => (+x).toFixed(2);
  const toFill = (fillPx, last) => Math.abs(fillPx / last - 1) * 100;   /* 唯一的"距离": 现价到补满价 % (口径表 V1) */
  const CSS = ".gvJL{font:600 11px/1.42 -apple-system,'PingFang SC',sans-serif;color:#fff;margin-top:4px;cursor:default}"
    + ".gvJL *{box-sizing:border-box}"
    + ".gvJL .u{color:#ffe600}.gvJL .d{color:#00f0ff}"   /* ↑黄=要涨上去补, ↓青=要跌下来补 */
    + ".gvJL .fcs{border:1px solid #ff5252;border-radius:10px;padding:6px 9px 7px;margin:3px 0 2px;background:rgba(255,82,82,.08);animation:gvFcsJL 2.2s ease-in-out infinite}"   /* 重点跟进红框(脉冲) */
    + "@keyframes gvFcsJL{50%{border-color:rgba(255,82,82,.4)}}"
    + ".gvJL .fcs .ft{display:flex;align-items:center;gap:5px;font:800 10.5px -apple-system,'PingFang SC',sans-serif;color:#ff8a8a;margin-bottom:3px}"
    + ".gvJL .fcs .ft::before{content:'';width:6px;height:6px;border-radius:50%;background:#ff5252;box-shadow:0 0 6px #ff5252;animation:gvDotJL 1.6s ease-in-out infinite}"
    + "@keyframes gvDotJL{50%{opacity:.3}}"
    + ".gvJL .fx{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 7px;padding:2px 0;font:700 11.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.92)}"
    + ".gvJL .fx .px{font-size:13px;font-weight:800}"
    + ".gvJL .fxd{font:800 11px ui-monospace,Menlo,monospace;color:#fff}"
    + ".gvJL .lvTxt{font:600 10.5px -apple-system,'PingFang SC',sans-serif;color:rgba(255,255,255,.85)}"
    + ".gvJL .fx .pb{margin-left:auto;font:700 10px -apple-system,sans-serif;white-space:nowrap;color:rgba(255,255,255,.78)}"
    + ".gvJL .gsec{display:flex;align-items:center;gap:6px;font:800 11px -apple-system,'PingFang SC',sans-serif;margin:8px 0 3px;padding:0 3px}"
    + ".gvJL .gsec .sum{font:600 10px -apple-system,sans-serif;color:rgba(255,255,255,.62)}"
    + ".gvJL .gsec .fb{margin-left:auto;font:600 9.5px -apple-system,sans-serif;border:1px solid #fff;border-radius:5px;padding:0 5px;line-height:15px;background:none;color:#fff;cursor:pointer}"
    + ".gvJL .tday{display:grid;grid-template-columns:1fr 1fr;gap:2px 6px;padding:2px 3px;font:700 10px ui-monospace,Menlo,monospace}"
    + ".gvJL .ti{color:rgba(255,255,255,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".gvJL .ti b{font-weight:800}"
    + ".gvJL .ti.op{background:rgba(255,150,60,.16);border:1px solid rgba(255,150,60,.55);border-radius:6px;padding:1px 5px;color:#ffb46a}"   /* 未补事件橙底 */
    + ".gvJL .gr{padding:4px 7px;border-radius:7px;margin:1px 0}"
    + ".gvJL .gr.hot{background:rgba(255,82,82,.14);border:1px solid rgba(255,82,82,.6)}"   /* 重点跟进行/回补中 */
    + ".gvJL .gr.warm{background:rgba(255,150,60,.1);border:1px solid rgba(255,150,60,.4)}"   /* 还差≤7% */
    + ".gvJL .gr .a{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}"
    + ".gvJL .gr .px{font:800 12.5px ui-monospace,Menlo,monospace}"
    + ".gvJL .lv{display:inline-flex;gap:2px}"
    + ".gvJL .lv i{font-style:normal;font:700 9px/14px -apple-system,sans-serif;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.22);border-radius:4px;padding:0 3px;min-width:15px;text-align:center}"
    + ".gvJL .lv i.on{color:#000;font-weight:800}"
    + ".gvJL .lv i.on.u{background:#ffe600;border-color:#ffe600}.gvJL .lv i.on.d{background:#00f0ff;border-color:#00f0ff}"
    + ".gvJL .gr .pb{margin-left:auto;font:700 9.5px -apple-system,sans-serif;white-space:nowrap;color:rgba(255,255,255,.75)}"
    + ".gvJL .pb b{color:#fff;font-weight:800}"
    + ".gvJL .pb i.old{font:600 9px -apple-system,sans-serif;font-style:normal;color:#ffb46a;margin-left:3px}"   /* 回补率表过期 */
    + ".gvJL .gr .b{font:600 9.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.6);margin-top:1px;padding-left:1px}"
    + ".gvJL .gr .b b{color:#fff;font-weight:800}"
    + ".gvJL .now{display:flex;align-items:center;gap:8px;color:#fff;font:800 10.5px ui-monospace,Menlo,monospace;margin:7px 0 5px;white-space:nowrap}"
    + ".gvJL .now::before,.gvJL .now::after{content:'';flex:1;border-top:1px dashed rgba(255,255,255,.32)}"
    + ".gvJL .gfold{font:600 9.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);border:1px dashed rgba(255,255,255,.24);border-radius:6px;padding:3px 6px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".gvJL .gEmpty{padding:4px 8px;font-size:10.5px;color:rgba(255,255,255,.5)}"
    + ".gvJL .wait{font-size:10.5px;padding:4px 2px}"
    + ".gvJL .stale{font:600 9.5px -apple-system,sans-serif;color:#ffb46a;padding:3px 2px 1px}"   /* 断流/缓存: 块顶上一行说明 */
    + ".gvJL .stale.top{padding:2px 2px 4px}";
  function ensureCss() { if (!document.getElementById("gvCssJL")) { const s = document.createElement("style"); s.id = "gvCssJL"; s.textContent = CSS + ".gvTogJL{display:flex;align-items:baseline;gap:5px;width:100%;text-align:left;border:0;background:none;color:#fff;font:700 11.5px -apple-system,sans-serif;padding:4px 2px;min-height:0}.gvTogJL .gvPxJL{margin-left:auto;font:700 10.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.85)}.gvTogJL .gvPxJL em{font-style:normal;color:#ffb46a}.gvFoldAllJL>.gvJL{display:none!important}"; document.head.appendChild(s); } }

  async function J(u) { const r = await fetch(u + (u.includes("?") ? "&" : "?") + "_t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }
  async function mk(c, k, end, n) { const d = await J("https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=" + c + ",m" + k + "," + (end || "") + "," + (n || 320)); return (d.data[c]["m" + k] || []).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }
  /* 1分钟一次只给320根(约1.3天), 往前再补一页800根凑满近5个交易日。
     11-17: 往前那页是历史, 不会变 —— 每只票当天只取一次, 之后每分钟只取最新320根拼上去(每只票每分钟少1个请求)。 */
  const M1C = {};
  async function mk1(c) {
    const a = await mk(c, 1); if (!a.length) return a;
    const s = a[0].t, C = M1C[c], day = dg(s).slice(0, 8);
    if (C && C.day === day && C.bars.length && C.bars[C.bars.length - 1].t >= s && C.bars[0].t < s) {
      const old = C.bars.filter((x) => x.t < s), out = old.slice(-Math.min(C.keep, old.length)).concat(a);   /* 整取时往前那页有几根(通常799)就留几根 */
      M1C[c] = { day, bars: out, keep: C.keep }; return out;
    }
    let b = []; try { b = await mk(c, 1, s, 800); } catch (e) { }
    const pre = b.filter((x) => x.t < s), out = pre.concat(a);
    if (pre.length) M1C[c] = { day, bars: out, keep: pre.length };
    return out;
  }
  async function dk(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" + c + ",day,,,400,qfq"); const n = d.data[c]; return (n.qfqday || n.day).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }   /* 400根日K, 远端历史缺口进「远的」折叠; 台账仍只喂最后80根(原口径) */
  async function mn(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + c); const x = d.data[c]; let pv = 0; return { date: x.data.date, pts: x.data.data.map((s) => { const a = s.split(" "), cv = +a[2], v = cv - pv; pv = cv; return { t: a[0], p: +a[1]