/* jl_gapiv.js v3 (2026-11-14, 缺口重点跟进版式——1:1 复刻用户效果图「缺口重点跟进_效果图.html」)
   持仓卡「缺口/iv」整版重排: 重点跟进(红框脉冲, 上/下各取距现价最近的未补) + 今日iv宫格(分钟级当日事件: 出现/已补/未补+补回时刻) + ↑iv(现价上方·按补满价降序·最近4行+远的折叠) + 现价分割线 + ↓iv(镜像)。
   =S2/=S1/=B1/=B2 白标: 链作战屏 jl_zp_war.html 的固定价位表 ATRB_TAB(台账口径: 中心=当日收盘, S2=带上沿, S1=中心与上沿中间, B1=中心与下沿中间, B2=带下沿);
   取法=同源 fetch 作战屏页抽出 var ATRB_TAB={...}, localStorage jl_atrb_v1 缓存12h, 失败静默不标(不影响主功能); 作战屏表一更新这里自动跟。原 v2 的 jlTierPxJL(持仓卡动态档)口径不再使用(11-14 用户指正: 必须链作战屏真值)。
   相对 v2 的全部差异(数据层/扫描口径/VI/补回判定零改动, 仅渲染层+以下4处):
   ① dk 80→400根日K(远端历史缺口进「远的」折叠; 台账喂的仍是最后80根, 与线上一致) ② 未补缺口距现价窗口 8%→40%(远的折叠显示而非整段消失)
   ③ compute 追加输出 R.ev(当日分钟级事件)与 g.pr(回补率数值), 原字段一个不动 ④ 取数失败时回退显示 localStorage 缓存的上次成功结果(带⚠角标, 3.5天内)——手机弱网也能看到内容。
   竞价卡/今日回补率格/日线未补目标行被新版式替换(信息并入宫格与分组行)。每只票60秒最多取一次。
   回滚: git revert 本文件, index.html 引用 jl_gapiv.js?v=11→10。 */
(function () {
  "use strict";
  const RT = {"600105":{"1分":[[[66,78],[74,83]],[[59,73],[66,80]],[[53,69],[63,78]],[[53,69],[60,77]]],"5分":[[[79,87],[80,88]],[[68,82],[67,82]],[[62,77],[63,80]],[[61,77],[63,81]]],"15分":[[[86,87],[82,88]],[[67,78],[68,82]],[[63,76],[63,79]],[[63,76],[61,81]]],"30分":[[[92,95],[88,93]],[[78,84],[65,80]],[[67,75],[70,83]],[[66,76],[70,85]]],"日":[[20,36,38],[30,53,63]]},"603986":{"1分":[[[70,77],[78,87]],[[63,71],[70,82]],[[57,67],[66,80]],[[52,65],[62,77]]],"5分":[[[61,69],[72,82]],[[53,65],[68,79]],[[50,64],[64,76]],[[43,59],[59,73]]],"15分":[[[76,81],[69,78]],[[68,78],[71,80]],[[57,70],[64,74]],[[58,70],[54,64]]],"30分":[[[83,83],[95,95]],[[81,85],[85,87]],[[70,77],[75,78]],[[62,74],[68,73]]],"日":[[24,50,59],[26,44,53]]}}; /* 同 index.html jl-1165 回补率表; jl-zp7(11-01): +30分(同243日1分钟数据同口径重跑, 每格样本29~92) · 日线换成400根日K同口径重跑(原243日内样本偏少, 下缺口偏高5~12点) */
  /* jl-gapfix 1104: 日线缺口按"已经挂了几天没补"分档的回补率(逐票400根前复权日K, 截至11-03; 补=碰前收)。
     u=上缺口/高开(要跌下来补) d=下缺口/低开。第0行=开盘时[样本,当天补%,次日前补%,3日内补%]; 第1+a行=形成后已挂a个交易日仍未补(a=0即形成当天收盘没补, 第6行=挂≥5天)[样本,下一交易日补%,之后3个交易日内补%]。
     原表只有"当天没补"这一档, 挂了几天的老缺口照样显示新缺口的概率, 偏高(永鼎10-30下缺口挂3天: 原显示1日30%/3日53%, 实测10%/19%)。 */
  const RTD = {"600105":{"u":[[161,62,70,76],[61,20,36],[49,12,20],[43,9,12],[39,0,15],[39,3,18],[38,13,24]],"d":[[193,77,83,89],[45,29,51],[31,19,39],[25,16,32],[21,10,19],[18,11,17],[16,0,12]]},"603986":{"u":[[184,61,71,81],[71,24,51],[54,28,43],[39,10,26],[35,11,23],[31,6,16],[29,7,10]],"d":[[182,62,72,79],[69,26,45],[50,20,30],[40,8,22],[37,5,19],[35,11,17],[31,3,6]]},"600176":{"u":[[169,64,72,76],[60,20,33],[48,12,21],[42,5,14],[40,5,10],[38,5,11],[36,0,6]],"d":[[194,81,87,90],[36,31,47],[24,17,33],[20,10,25],[18,11,28],[15,7,27],[14,14,21]]},"600489":{"u":[[180,56,64,73],[79,18,38],[65,18,34],[53,8,21],[49,12,27],[43,2,21],[42,14,19]],"d":[[201,61,72,81],[78,27,50],[57,21,40],[45,13,31],[39,13,28],[34,9,21],[31,10,19]]}};
  /* jl-gapfix 1104b: 开盘缺口按缺口大小分档(逐票400根前复权日K, 截至11-03; 开盘价=当天第一笔, 日K低/高碰昨收即当天补, 精确)。
     每档 [下限%,上限%,样本,当天补%,次日收盘前补%,3日内补%,开盘卖(低开=买)·碰昨收买回(卖出)·没碰收盘买回 平均%(已扣0.1%费), 没补那些天平均%] */
  const OGT = {"600105":{"u":[[0.1,1,55,75,80,85,-0.58,-3.29],[1,2,52,69,79,85,-0.54,-4.81],[2,4,41,39,49,54,-0.88,-2.89],[4,99,9,33,33,56,1.42,-0.57]],"d":[[0.1,1,74,84,89,91,-0.2,-2.99],[1,2,55,76,84,91,0.21,-3.64],[2,4,47,77,85,91,1.53,-2.23],[4,99,14,43,50,64,1.26,-2.01]]},"603986":{"u":[[0.1,1,62,84,89,92,-0.27,-3.6],[1,2,48,62,73,85,-0.22,-2.8],[2,4,54,46,59,74,0.15,-1.93],[4,99,15,13,27,47,-0.64,-1.32]],"d":[[0.1,1,79,81,86,90,-0.23,-2.75],[1,2,42,67,76,81,-0.15,-3.21],[2,4,34,38,56,74,0.04,-1.47],[4,99,22,14,32,41,-0.61,-1.46]]},"600176":{"u":[[0.1,1,76,70,78,83,-0.56,-2.57],[1,2,41,68,76,76,0.36,-1.85],[2,4,26,35,42,58,-0.38,-1.86],[4,99,9,22,33,33,0.54,-0.41]],"d":[[0.1,1,115,90,94,95,-0.01,-2.99],[1,2,34,65,71,79,-0.58,-3.76],[2,4,25,84,92,100,1.59,-3.3],[4,99,8,0,25,25,-0.92,-0.82]]},"600489":{"u":[[0.1,1,70,77,81,86,-0.23,-2.29],[1,2,51,53,61,76,-0.09,-1.64],[2,4,40,40,52,60,-0.09,-1.67],[4,99,16,6,19,31,-0.78,-1.07]],"d":[[0.1,1,83,83,88,90,-0.09,-2.32],[1,2,53,57,72,89,0.23,-1.06],[2,4,42,38,57,67,0.64,-0.6],[4,99,17,12,18,35,1.29,0.54]]}};
  /* jl-gapfix 1104c: 分钟缺口回补率改用本地真实K线重算(原 RT 表来源脚本已不在, 本地数据复算对不上: 永鼎30分13:30上缺口 原78% 实测57%)。
     数据: 1分=本地1分CSV+腾讯近12日(永鼎/兆易约23天, 另两只12天); 5分约24天; 15分70天; 30分140天。口径同 scan: 同日形成、到检查点(10:30/13:30/14:30/收盘)仍未补。
     MT[code][周期][检查点][0上缺口/1下缺口] = [样本, 当天补%, 次日收盘前补%, 3日内补%]; 样本<5 不显示百分比。 {"600105":{"1分":"20260928~20261104 23天","5分":"20260924~20261104 24天","15分":"20260722~20261104 70天","30分":"20260409~20261104 140天"},"603986":{"1分":"20260928~20261104 23天","5分":"20260924~20261104 24天","15分":"20260722~20261104 70天","30分":"20260409~20261104 140天"},"600176":{"1分":"20261020~20261104 12天","5分":"20260924~20261104 24天","15分":"20260722~20261104 70天","30分":"20260409~20261104 140天"},"600489":{"1分":"20261020~20261104 12天","5分":"20260924~20261104 24天","15分":"20260722~20261104 70天","30分":"20260409~20261104 140天"}} */
  const MT = {"600105":{"1\u5206":[[[10,60,80,90],[28,46,46,46]],[[14,43,86,93],[26,23,27,27]],[[15,33,87,93],[24,4,17,17]],[[16,0,81,94],[28,0,21,21]]],"5\u5206":[[[1,100,100,100],[6,67,67,67]],[[4,50,75,100],[4,25,50,50]],[[4,25,50,100],[5,20,40,40]],[[5,0,60,100],[5,0,20,20]]],"15\u5206":[[[2,50,50,50],[8,38,50,62]],[[8,50,62,75],[11,27,36,64]],[[7,14,43,71],[13,0,31,62]],[[7,0,43,71],[16,0,38,62]]],"30\u5206":[[[0,null,null,null],[4,25,50,50]],[[14,36,57,71],[6,33,50,67]],[[12,17,50,67],[6,0,33,67]],[[13,0,54,69],[7,0,43,71]]]},"603986":{"1\u5206":[[[8,88,88,100],[11,55,64,73]],[[11,36,82,100],[13,23,54,62]],[[9,0,67,100],[17,6,53,65]],[[13,0,69,100],[17,0,53,65]]],"5\u5206":[[[3,67,67,100],[1,0,0,0]],[[3,33,67,100],[3,0,67,67]],[[2,0,50,100],[9,11,67,67]],[[4,0,75,100],[10,0,50,50]]],"15\u5206":[[[3,67,100,100],[4,75,75,75]],[[7,43,100,100],[8,38,88,88]],[[5,0,100,100],[11,36,91,91]],[[6,0,83,100],[8,0,75,75]]],"30\u5206":[[[1,0,100,100],[5,60,80,80]],[[13,38,69,85],[14,36,86,86]],[[8,0,50,75],[10,10,80,80]],[[9,0,56,78],[9,0,78,78]]]},"600176":{"1\u5206":[[[3,67,100,100],[10,70,70,70]],[[4,75,100,100],[6,33,33,33]],[[7,43,71,100],[5,0,20,20]],[[4,0,50,100],[7,0,29,29]]],"5\u5206":[[[1,100,100,100],[5,80,80,80]],[[2,0,50,100],[3,33,33,33]],[[3,0,67,100],[3,0,0,0]],[[3,0,67,100],[4,0,25,25]]],"15\u5206":[[[5,60,80,80],[4,50,75,75]],[[8,25,62,75],[7,57,86,86]],[[11,18,64,82],[7,14,86,86]],[[9,0,56,78],[6,0,83,83]]],"30\u5206":[[[1,100,100,100],[2,100,100,100]],[[11,55,73,91],[7,43,71,86]],[[8,25,62,88],[8,0,50,75]],[[9,0,33,56],[8,0,50,75]]]},"600489":{"1\u5206":[[[5,40,100,100],[4,50,50,50]],[[7,43,100,100],[5,20,20,20]],[[6,0,67,100],[8,12,12,25]],[[6,0,67,100],[9,0,11,33]]],"5\u5206":[[[3,67,100,100],[4,50,75,75]],[[5,60,100,100],[6,0,33,33]],[[2,0,100,100],[8,0,25,25]],[[3,0,67,67],[8,0,25,25]]],"15\u5206":[[[2,0,50,50],[2,0,0,50]],[[8,25,62,75],[9,11,44,56]],[[6,0,50,67],[9,0,33,44]],[[6,0,50,67],[10,0,40,50]]],"30\u5206":[[[1,0,0,0],[3,67,67,67]],[[10,30,60,60],[13,31,62,62]],[[8,0,38,38],[9,0,44,44]],[[9,0,33,33],[9,0,44,44]]]}};
  const LV = ["日", "30分", "15分", "5分", "1分"], LVN = { "日": "日线", "30分": "30分钟", "15分": "15分钟", "5分": "5分钟", "1分": "1分钟" }, ORD = { "1分": 1, "5分": 5, "15分": 15, "30分": 30, "日": 99 };
  const pf = (c) => (/^[569]/.test(c) ? "sh" : "sz") + c;
  const dg = (t) => String(t).replace(/\D/g, "");
  const hm = (t) => { const d = dg(t); return d.length >= 12 ? d.slice(8, 10) + ":" + d.slice(10, 12) : ""; };
  const md = (t) => { const d = dg(t); return d.slice(4, 6) + "-" + d.slice(6, 8); };
  const PMN = { "5分": 5, "15分": 15, "30分": 30 };
const bst = (m) => { const d = dg(m.t); if (!PMN[m.lv] || d.length < 12) return m.t; const x = +d.slice(8, 10) * 60 + +d.slice(10, 12) - PMN[m.lv]; return d.slice(0, 8) + String(Math.floor(x / 60)).padStart(2, "0") + String(x % 60).padStart(2, "0"); };
const fmt = (m) => { const s = bst(m); return md(s) + (hm(s) ? " " + hm(s) : ""); };

  const f2 = (x) => (+x).toFixed(2), sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
  const gC = (b) => (b ? "#00f0ff" : "#ffe600");   /* 青蓝↓ = 要跌下来补, 黄↑ = 要涨上去补 */
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
    + ".gvJL .gr .b{font:600 9.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.6);margin-top:1px;padding-left:1px}"
    + ".gvJL .gr .b b{color:#fff;font-weight:800}"
    + ".gvJL .now{display:flex;align-items:center;gap:8px;color:#fff;font:800 10.5px ui-monospace,Menlo,monospace;margin:7px 0 5px;white-space:nowrap}"
    + ".gvJL .now::before,.gvJL .now::after{content:'';flex:1;border-top:1px dashed rgba(255,255,255,.32)}"
    + ".gvJL .gfold{font:600 9.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);border:1px dashed rgba(255,255,255,.24);border-radius:6px;padding:3px 6px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    + ".gvJL .gEmpty{padding:4px 8px;font-size:10.5px;color:rgba(255,255,255,.5)}"
    + ".gvJL .wait{font-size:10.5px;padding:4px 2px}"
    + ".gvJL .stale{font:600 9.5px -apple-system,sans-serif;color:#ffb46a;padding:3px 2px 1px}"
    + ".gvJL i.tgT{font:700 9px/13px -apple-system,sans-serif;font-style:normal;background:#fff;color:#000;border-radius:3px;padding:0 4px;margin-left:4px}";
  function ensureCss() { if (!document.getElementById("gvCssJL")) { const s = document.createElement("style"); s.id = "gvCssJL"; s.textContent = CSS + ".gvTogJL{display:flex;align-items:baseline;gap:5px;width:100%;text-align:left;border:0;background:none;color:#fff;font:700 11.5px -apple-system,sans-serif;padding:4px 2px;min-height:0}.gvTogJL .gvPxJL{margin-left:auto;font:700 10.5px ui-monospace,Menlo,monospace;color:rgba(255,255,255,.85)}.gvFoldAllJL>.gvJL{display:none!important}"; document.head.appendChild(s); } }

  async function J(u) { const r = await fetch(u + (u.includes("?") ? "&" : "?") + "_t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }
  async function mk(c, k, end, n) { const d = await J("https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=" + c + ",m" + k + "," + (end || "") + "," + (n || 320)); return (d.data[c]["m" + k] || []).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }
  /* 1分钟一次只给320根(约1.3天), 按结束时刻往前再补一页800根, 凑满近5个交易日 */
  async function mk1(c) { const a = await mk(c, 1); if (!a.length) return a; let b = []; try { b = await mk(c, 1, a[0].t, 800); } catch (e) { } const s = a[0].t; return b.filter((x) => x.t < s).concat(a); }
  async function dk(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" + c + ",day,,,400,qfq"); const n = d.data[c]; return (n.qfqday || n.day).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }   /* v3: 80→400根日K, 远端历史缺口进「远的」折叠; 台账在render里仍喂最后80根=原口径 */
  async function mn(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + c); const x = d.data[c]; let pv = 0; return { date: x.data.date, pts: x.data.data.map((s) => { const a = s.split(" "), cv = +a[2], v = cv - pv; pv = cv; return { t: a[0], p: +a[1], v: v }; }) }; }

  /* ===== jl-1197: 东财备选——腾讯失败先原地重试一次, 仍失败才走东财; 每只票各自判断, 不设全局标记 ===== */
  const EM = (u) => new Promise((ok, no) => { const cb = "gvEM" + Date.now() + Math.floor(Math.random() * 1e6), sc = document.createElement("script"); const done = () => { try { delete window[cb]; } catch (e) { } sc.remove(); }; const tm = setTimeout(() => { done(); no(Error("东财超时")); }, 10000); window[cb] = (d) => { clearTimeout(tm); done(); ok(d); }; sc.onerror = () => { clearTimeout(tm); done(); no(Error("东财连不上")); }; sc.src = u + "&cb=" + cb + "&_=" + Date.now(); document.head.appendChild(sc); });
  const emId = (c) => (/^sh/i.test(c) ? "1." : "0.") + String(c).replace(/\D/g, "");
  async function emK(c, klt, lmt) { const d = await EM("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + emId(c) + "&klt=" + klt + "&fqt=1&lmt=" + lmt + "&end=20500101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56"); const k = d && d.data && d.data.klines; if (!k || !k.length) throw Error("东财无数据"); return k.map((r) => { const a = r.split(","); return { t: klt === 101 ? a[0] : a[0].replace(/\D/g, ""), o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; }); }
  /* 1分钟线聚合成 k 分钟线, 时刻标在K线结束(与腾讯 mkline 同口径: 09:30 撮合根并入第一根) */
  function agg(m1, k) { const out = []; let cur = null; m1.forEach((x) => { const d = x.t.slice(0, 8), mm = +x.t.slice(8, 10) * 60 + +x.t.slice(10, 12); let i = mm <= 690 ? mm - 570 : 120 + mm - 780; if (i < 1) i = 1; const e = Math.ceil(i / k) * k, em = e <= 120 ? 570 + e : 780 + e - 120, key = d + em, t = d + String(Math.floor(em / 60)).padStart(2, "0") + String(em % 60).padStart(2, "0"); if (!cur || cur.key !== key) { cur = { key, t, o: x.o, c: x.c, h: x.h, l: x.l, v: x.v }; out.push(cur); } else { cur.c = x.c; cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.v += x.v; } }); return out.map((b) => ({ t: b.t, o: b.o, c: b.c, h: b.h, l: b.l, v: b.v })); }
  function mnFrom(m1) { const d = m1[m1.length - 1].t.slice(0, 8); return { date: d, pts: m1.filter((x) => x.t.slice(0, 8) === d && x.t.slice(8, 12) >= "0930").map((x) => ({ t: x.t.slice(8, 12), p: x.c, v: x.v })) }; }
  async function getAll(c) {
    const tx = () => Promise.all([dk(c), mk(c, 30), mk(c, 15), mk(c, 5), mk1(c), mn(c).catch(() => null)]).then((r) => { if (!r[5] || !r[5].pts || !r[5].pts.length) r[5] = mnFrom(r[4]); return r; });   /* jl-gapfix: 分时接口(web.ifzq)单独被风控501时用1分K拼当日分时, 不再整块"取不到" */
    let e1;
    try { return { r: await tx(), src: "tx" }; } catch (e) { e1 = e; }
    try { return { r: await tx(), src: "tx" }; } catch (e) { e1 = e; }
    try { const r = await Promise.all([emK(c, 101, 80), emK(c, 1, 1200)]), m1 = r[1]; return { r: [r[0], agg(m1, 30), agg(m1, 15), agg(m1, 5), m1, mnFrom(m1)], src: "em" }; }
    catch (e2) { throw Error("腾讯" + (e1 && e1.message ? "(" + e1.message + ")" : "失败") + "，东财" + (e2 && e2.message ? "(" + e2.message + ")" : "失败")); }
  }

  /* 扫一个周期的 VI(含今天已补的) */
  function scan(b, lv, today) {
    const out = [], daily = lv === "日", days = [...new Set(b.map((x) => dg(x.t).slice(0, 8)))], keep = daily ? null : days.slice(-5);
    for (let i = 1; i < b.length; i++) {
      const p0 = b[i - 1], c0 = b[i], d0 = dg(c0.t).slice(0, 8);
      if (!daily && (dg(p0.t).slice(0, 8) !== d0 || keep.indexOf(d0) < 0)) continue;   /* 分钟级只看同一天内、近5个交易日 */
      const vm = p0.c * 0.0005, bull = c0.o - p0.c > vm && (daily || c0.l <= p0.h), bear = p0.c - c0.o > vm && (daily || c0.h >= p0.l);
      if (!bull && !bear) continue;
      let ft = "", ext = c0.o;
      if (bull ? c0.l <= p0.c : c0.h >= p0.c) ft = daily && d0 === today ? "今日" : c0.t;   /* 今天这根日K已碰昨收 = 今天补了(时刻取开盘缺口的); jl-1199: 分钟级/往日同理, 形成那根自己影线碰前收 = 当根已补 */
      else ext = bull ? c0.l : c0.h;   /* jl-1201: 剩余带从形成那根自己的影线算起(与台账日线回放同口径), 原只今日日K才算 */
      for (let j = ft ? b.length : i + 1; j < b.length; j++) {
        ext = bull ? Math.min(ext, b[j].l) : Math.max(ext, b[j].h);
        if (bull ? b[j].l <= p0.c : b[j].h >= p0.c) { ft = b[j].t; break; }
      }
      const lo = bull ? p0.c : c0.o, hi = bull ? c0.o : p0.c;
      if (ft && ft !== "今日" && dg(ft).slice(0, 8) !== today) continue;   /* 以前就补掉的不要 */
      const rem = ft ? null : (bull ? [p0.c, Math.min(c0.o, ext)] : [Math.max(c0.o, ext), p0.c]);
      out.push({ lv, bull, lo, hi, rem, t: c0.t, ft, d: daily ? dg(c0.t).slice(0, 8) : d0 });
    }
    return out;
  }

  function compute(code, D, m30, m15, m5, m1, M) {
    const today = M.date, bt = D[D.length - 1], bp = D[D.length - 2];
    const isToday = dg(bt.t).slice(0, 8) === today;
    const day = isToday ? bt : null, pre = isToday ? bp.c : bt.c, op = day ? day.o : null;
    const last = M.pts.length ? M.pts[M.pts.length - 1].p : bt.c;
    let opg = null;
    if (op && Math.abs(op / pre - 1) >= 0.001) {
      const up = op > pre, m1t = m1.filter((x) => dg(x.t).slice(0, 8) === today);
      const hit = m1t.find((x) => (up ? x.l <= pre : x.h >= pre));
      let ext = op; for (const x of m1t) { if (hit && x === hit) break; ext = up ? Math.min(ext, x.l) : Math.max(ext, x.h); }
      opg = { up, pct: (op / pre - 1) * 100, size: Math.abs(op - pre), ft: hit ? hm(hit.t) : "", ext, prog: hit ? 1 : Math.abs(op - ext) / Math.abs(op - pre) };
      const lo0 = Math.min(pre, op), hi0 = Math.max(pre, op), inB = (p) => p > lo0 && p < hi0;
      opg.st = hit ? "done" : inB(last) ? "in" : "none";
      if (hit) {
        const fk = dg(hit.t).slice(8, 12), seg = []; let cur = null;
        M.pts.forEach((p) => { if (p.t <= fk || p.t > "1500") return; if (inB(p.p)) { if (!cur) { cur = { a: p.t, b: p.t, n: 0 }; seg.push(cur); } cur.b = p.t; cur.n++; } else cur = null; });
        const tt = (t) => t.slice(0, 2) + ":" + t.slice(2), lastT = M.pts.length ? M.pts[M.pts.length - 1].t : "";
        opg.back = seg.filter((s) => s.n >= 5).map((s) => tt(s.a) + "–" + (s.b === lastT && inB(last) ? "进行中" : tt(s.b)));
      }
    }
    const BY = { "日": D, "30分": m30, "15分": m15, "5分": m5, "1分": m1 };
    let all = []; LV.forEach((L) => { if (BY[L] && BY[L].length > 2) all = all.concat(scan(BY[L], L, today)); });
    all.forEach((g) => { if (g.ft === "今日") g.ft = today + (opg && opg.ft ? opg.ft.replace(":", "") : "1500"); });
    /* jl-1201: 日线级未补目标——不受下面8%距离限制, 上方/下方各取最近一个; 距现价%算到缺口近沿(碰到), 远沿=前收(补满) */
    const tg = (up) => {
      const c = all.filter((g) => g.lv === "日" && !g.ft && g.rem && g.bull !== up).map((g) => {
        const lo = g.rem[0], hi = g.rem[1], inZ = last >= lo && last <= hi, near = up ? lo : hi;
        return { lo, hi, inZ, near, far: up ? g.hi : g.lo, dist: inZ ? 0 : (near / last - 1) * 100, d: md(g.t) };
      }).filter((g) => (up ? g.hi >= last : g.lo <= last));
      c.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
      return c[0] || null;
    };
    const tgt = { up: tg(true), dn: tg(false) };
    const ref = op || last;
    window._gvAll = all.map(g => g.lv + " " + g.lo + "-" + g.hi + (g.ft ? " 已补" : " 未补"));
    const ev = all.filter((g) => g.lv !== "日" && g.d === today).slice().sort((a, b) => dg(a.t) - dg(b.t));   /* v3: 今日分钟级事件→宫格(在距离窗/小缺口过滤之前取, 与效果图计数口径一致) */

    all = all.filter((g) => Math.abs((g.lo + g.hi) / 2 / last - 1) <= 0.40);   /* v3: 8%→40%, 远的折叠显示而非整段消失 */
    all = all.filter((g) => !(g.lv === "1分" && g.ft && (g.hi - g.lo) / ref < 0.002));   /* 1分钟 <0.2% 的已补缺口不显示, 未补的照常显示 */

    const open = all.filter((g) => !g.ft), done = all.filter((g) => g.ft);
    const grp = [];
    open.forEach((g) => {
      const z = g.rem, m = grp.find((x) => x.bull === g.bull && z[0] <= x.hi * 1.0005 && z[1] >= x.lo * 0.9995);
      if (!m) grp.push({ bull: g.bull, lo: z[0], hi: z[1], mem: [g] });
      else { m.mem.push(g); m.lo = Math.min(m.lo, z[0]); m.hi = Math.max(m.hi, z[1]); }
    });
    const ck = (() => { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), w = d.getDay(); return (w === 0 || w === 6 || m < 570 || m >= 900) ? 3 : m < 630 ? 0 : m < 810 ? 1 : m < 870 ? 2 : 3; })();
    const rt = RT[code];
    const m1d = m1.map((x) => ({ t: dg(x.t), h: x.h, l: x.l }));
    grp.forEach((g) => {
      g.lvs = [...new Set(g.mem.map((x) => x.lv))].sort((a, b) => ORD[b] - ORD[a]);
      g.N = g.lvs.length;
      g.mid = (g.lo + g.hi) / 2; g.dist = (g.mid / last - 1) * 100; g.vsOp = op ? (g.mid / op - 1) * 100 : null;
      g.inG = last >= g.lo * 0.998 && last <= g.hi * 1.002;
      g.prog = g.inG ? Math.max(0, Math.min(1, g.bull ? (g.hi - last) / (g.hi - g.lo) : (last - g.lo) / (g.hi - g.lo))) : 0;
      const L = g.lvs[0], bd = g.mem.map((m) => m.d).sort()[0];
      g.rt = "";
      if (L === "日") {   /* jl-gapfix: 日线缺口用"已挂几天"那一档 */
        const td = RTD[code], fi = D.findIndex((x) => dg(x.t).slice(0, 8) === bd), nowM = new Date().getHours() * 60 + new Date().getMinutes();
        const lastDone = isToday && nowM < 900 ? D.length - 2 : D.length - 1, age = fi >= 0 ? lastDone - fi : -1;
        if (td && age >= 0) { const r = td[g.bull ? "u" : "d"][1 + Math.min(age, 5)]; g.rt = md(bd) + "起·已挂" + (age + 1) + "天 · 下一交易日补 " + r[1] + "% · 3日内补 " + r[2] + "%（样本" + r[0] + "）"; g.pr = [null, r[1], r[2]]; }
        else if (td && age < 0) { const r = td[g.bull ? "u" : "d"][0]; g.rt = "今日形成 · 当天补 " + r[1] + "% · 次日前补 " + r[2] + "% · 3日内补 " + r[3] + "%"; g.pr = [r[1], r[2], r[3]]; }
      } else if (bd === today) {   /* 今天形成的分钟缺口: 本地重算表(该时点仍未补) */
        const r = MT[code] && MT[code][L] ? (MT[code][L][ck] || [])[g.bull ? 0 : 1] : null;
        g.rt = !r ? "" : r[0] < 5 ? "样本不足（" + r[0] + "个）" : (ck < 3 ? "当天补 " + r[1] + "% · " : "") + "次日前 " + r[2] + "% · 3日内 " + r[3] + "%（" + r[0] + "个）"; g.pr = !r || r[0] < 5 ? null : (ck < 3 ? [r[1], r[2], r[3]] : [null, r[2], r[3]]);
      } else g.rt = md(bd) + "起的分钟缺口 · 隔日无统计";   /* jl-gapfix: 原拿"今天形成"的概率套到往天缺口上, 偏高, 不再显示 */
      g.born = g.mem.slice().sort((a, b) => dg(a.t) - dg(b.t)).map((m) => ({ lv: m.lv, t: dg(m.t) }));
      const t0 = g.born[0].t.padEnd(12, "9").slice(0, 12), segs = []; let on = false;
      m1d.forEach((x) => { if (x.t <= t0) return; const hit = x.l < g.hi - 0.005 && x.h > g.lo + 0.005; if (hit && !on) segs.push(x.t); on = hit; });   /* 真进到缺口里才算碰过 */
      g.touch = segs;
    });
    grp.sort((a, b) => b.N - a.N || (b.inG - a.inG) || Math.abs(a.dist) - Math.abs(b.dist));
    const dgp = [];
    done.slice().sort((a, b) => ORD[b.lv] - ORD[a.lv]).forEach((g) => {
      const m = dgp.find((x) => x.bull === g.bull && g.lo <= x.hi * 1.0005 && g.hi >= x.lo * 0.9995);
      if (!m) dgp.push({ bull: g.bull, lo: g.lo, hi: g.hi, mem: [g], ft: g.ft, fp: g.bull ? g.lo : g.hi });
      else { m.mem.push(g); m.lo = Math.min(m.lo, g.lo); m.hi = Math.max(m.hi, g.hi); if (dg(g.ft) > dg(m.ft)) { m.ft = g.ft; m.fp = g.bull ? g.lo : g.hi; } }
    });
    dgp.forEach((g) => { g.lvs = [...new Set(g.mem.map((x) => x.lv))].sort((a, b) => ORD[b] - ORD[a]); g.N = g.lvs.length; g.old = [...new Set(g.mem.filter((x) => x.d !== today).map((x) => md(x.d)))]; });
    const PM = { "1分": 1, "5分": 5, "15分": 15, "30分": 30 }, subm = (t, k) => { const d = dg(t), m = +d.slice(8, 10) * 60 + +d.slice(10, 12) - k; return d.slice(0, 8) + String(Math.floor(m / 60)).padStart(2, "0") + String(m % 60).padStart(2, "0"); };
dgp.forEach((g) => {
  const st = g.mem.map((x) => (PM[x.lv] && dg(x.t).length >= 12 ? subm(x.t, PM[x.lv]) : today + "0929")).sort()[0];
  const fp = g.bull ? g.lo : g.hi;
  const hit = m1.find((x) => dg(x.t) > st && dg(x.t).slice(0, 8) === today && (g.bull ? x.l <= fp : x.h >= fp));
  if (hit) g.ft = dg(hit.t);
});

    dgp.sort((a, b) => b.N - a.N || dg(b.ft) - dg(a.ft));
    const tr = {}; LV.forEach((L) => { const t = all.filter((g) => g.lv === L && g.d === today); tr[L] = { n: t.length, k: t.filter((g) => g.ft).length }; });
    const b5 = D[D.length - (isToday ? 6 : 5)], t5 = b5 && b5.c > 0 ? (last / b5.c - 1) * 100 : null;   /* jl-gapfix: 近5个交易日涨跌, 提示回补率在单边行情里会偏 */
    return { today, pre, op, opg, grp, dgp, tr, tgt, code, last, t5, ev };
  }


  /* ===== =S2/=S1/=B1/=B2 白标数据源: 作战屏固定价位表 ATRB_TAB (11-14 用户定: 必须链作战屏真值, 不再用持仓卡动态档) =====
     同源 fetch jl_zp_war.html 抽出 var ATRB_TAB={...}; localStorage jl_atrb_v1 缓存12h; 失败静默(不标, 不影响缺口主功能); 拿到后重刷已画的卡。
     撞标规则(沿用 v2 的0.15%容差): 档价落在缺口区间[lo,hi]±0.15%内 → 档价压在缺口沿上、或补缺口途中必过档价, 都算撞上。 */
  let ATRB = null, ATRBfly = 0;
  function atrbKick() {
    if (ATRB || ATRBfly) return;
    try { const c = JSON.parse(localStorage.getItem("jl_atrb_v1") || "null"); if (c && c.at && Date.now() - c.at < 43200000 && c.t) { ATRB = c.t; return; } } catch (e) { }
    ATRBfly = 1;
    fetch("jl_zp_war.html", { cache: "no-store" }).then((r) => (r.ok ? r.text() : Promise.reject())).then((txt) => {
      let t = null;
      const m = txt.match(/var\s+ATRB_TAB\s*=\s*\{[\s\S]*?\};/);
      if (m) { try { t = (new Function("return (" + m[0].replace(/^var\s+ATRB_TAB\s*=\s*/, "").replace(/;\s*$/, "") + ")"))(); } catch (e) { } }
      ATRB = t || {}; ATRBfly = 0;
      try { if (t && Object.keys(t).length) localStorage.setItem("jl_atrb_v1", JSON.stringify({ at: Date.now(), t: t })); } catch (e) { }
      document.querySelectorAll(".hldGapRowJL[data-gv]").forEach((h) => paint(h, h.getAttribute("data-gv")));
    }).catch(() => { ATRBfly = 0; });
  }
  function tierTag(code, lo, hi) {
    const T = ATRB && ATRB[String(code).replace(/\D/g, "")]; if (!T) return "";
    const hits = [];
    [["S2", T.S2], ["S1", T.S1], ["B1", T.B1], ["B2", T.B2]].forEach(function (p) {
      const v = Number(p[1]);
      if (!isFinite(v) || v <= 0) return;
      if (lo - v * 0.0015 <= v && v <= hi + v * 0.0015) hits.push(p[0]);
    });
    return hits.length ? " " + hits.map(function (n) { return '<i class="tgT">=' + n + "</i>"; }).join("") : "";
  }

  /* ===== 效果图版式: 重点跟进 + 今日iv宫格 + ↑iv/现价/↓iv 对称梯 + 远的折叠 ===== */
  const dtxt = (ms) => { const d = new Date(ms); return String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function html(R, sf) {
    sf = sf || {};
    const last = R.last, yr = String(R.today).slice(0, 4);
    const side = (g) => ((g.lo + g.hi) / 2 >= last ? "u" : "d");      /* 缺口带在现价上方→↑黄, 下方→↓青; 现价在带内按中点归侧 */
    const fe = (g) => (g.bull ? g.lo : g.hi);                          /* 补满价 = 前收(远沿) */
    const dd = (g) => Math.abs(fe(g) / last - 1) * 100;                /* 还差% = 现价到补满价 */
    const zone = (g) => ((g.hi - g.lo) / g.lo < 0.0015 ? f2((g.lo + g.hi) / 2) : f2(g.lo) + "–" + f2(g.hi));
    const has = (g, lv) => g.lvs.indexOf(lv) >= 0;
    const kai = (g) => g.lvs.indexOf("日") >= 0 && g.mem.some(function (m) { return m.lv === "日" && (m.hi - m.lo) / m.lo >= 0.001; });   /* 开盘缺口(≥0.1%的开盘偏离) */
    const lvTxt = (g) => {
      const ms = g.lvs.filter(function (l) { return l !== "日"; }).sort(function (a, b) { return ORD[b] - ORD[a]; });
      const out = [];
      if (has(g, "日")) out.push(kai(g) ? "日线+开盘" : "日线");
      if (ms.length) out.push((ms.length >= 2 ? ms.map(function (x) { return x.replace("分", ""); }).join("/") : ms[0].replace("分", "")) + "分" + (ms.length >= 2 ? "重合" : ""));
      return out.join(" · ");
    };
    const pills = (g, s) => '<span class="lv">' + [["日", "日"], ["开", "开"], ["30分", "30"], ["15分", "15"], ["5分", "5"], ["1分", "1"]].map(function (p) {
      const on = p[0] === "开" ? kai(g) : has(g, p[0]);
      return '<i class="' + (on ? "on " + s : "") + '">' + p[1] + "</i>";
    }).join("") + "</span>";
    const born = (g) => {
      const b = g.born[0], d = String(b.t).slice(0, 8);
      const ds = d.slice(0, 4) === yr ? d.slice(4, 6) + "-" + d.slice(6, 8) : d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
      return b.lv === "日" ? ds + " 开盘" : ds + " " + String(b.t).slice(8, 10) + ":" + String(b.t).slice(10, 12);
    };
    const pb = (g) => {
      if (!g.pr) return "";
      const L = ["当天", "次日", "3日"], out = [];
      g.pr.forEach(function (v, i) { if (v != null && isFinite(v)) out.push(L[i] + "<b>" + Math.round(v) + "%</b>"); });
      return out.length ? '<span class="pb">' + out.join(" ") + "</span>" : "";
    };

    const ups = R.grp.filter(function (g) { return side(g) === "u"; }).sort(function (a, b) { return dd(a) - dd(b); });
    const dns = R.grp.filter(function (g) { return side(g) === "d"; }).sort(function (a, b) { return dd(a) - dd(b); });
    const row = (g, fu, fd) => {
      const s = side(g), hot = g === fu || g === fd || g.inG, warm = !hot && dd(g) <= 7;
      const olo = Math.min.apply(null, g.mem.map(function (m) { return m.lo; })), ohi = Math.max.apply(null, g.mem.map(function (m) { return m.hi; }));   /* 形成时的原始缺口区间(与剩余带区分) */
      const oz = (ohi - olo) / olo < 0.0015 ? f2((olo + ohi) / 2) : f2(olo) + "–" + f2(ohi);
      return '<div class="gr' + (hot ? " hot" : warm ? " warm" : "") + '"><div class="a">'
        + '<b class="px ' + s + '">' + (s === "u" ? "↑" : "↓") + f2(fe(g)) + "</b>" + tierTag(R.code, g.lo, g.hi) + pills(g, s)
        + (g.inG ? '<span class="fxd">回补中</span>' : "") + pb(g) + "</div>"
        + '<div class="b">' + born(g) + " · " + oz + " · 当时缺口 " + ((ohi - olo) / olo * 100).toFixed(1) + "% → " + (g.inG ? "回补中" : "现在还差 <b>" + dd(g).toFixed(1) + "%</b>") + "</div></div>";
    };
    const fold = (list) => (!list.length ? "" : '<div class="gfold">▸ 远的 ' + list.length + " 个：" + list.slice(0, 4).map(function (g) { return f2(fe(g)); }).join(" · ") + (list.length > 4 ? " …" : "") + "</div>");
    const fx = (g) => {
      const s = side(g);
      return '<div class="fx"><b class="px ' + s + '">' + (s === "u" ? "↑" : "↓") + f2(fe(g)) + "</b>"
        + '<span class="fxd">' + (g.inG ? "回补中" : "还差 " + dd(g).toFixed(1) + "%") + "</span>"
        + '<span class="lvTxt">' + lvTxt(g) + "</span>" + tierTag(R.code, g.lo, g.hi) + pb(g) + "</div>";
    };
    const sec = (title, sum, key) => '<div class="gsec">' + title + (sum ? '<span class="sum">' + sum + "</span>" : "")
      + '<button class="fb" type="button" data-fbs="' + key + '">' + (sf[key] ? "展开 ▸" : "收起 ▴") + "</button></div>";

    let h = '<div class="fcs"><div class="ft">重点跟进</div>' + (ups.length || dns.length ? [ups[0], dns[0]].filter(Boolean).map(fx).join("") : '<div class="fx"><span class="lvTxt">无未补缺口</span></div>') + "</div>";

    const evs = R.ev || [];
    const k = evs.filter(function (e) { return e.ft; }).length;
    h += sec('<span>今日 iv · ' + md(R.today) + "</span>", "出现 " + evs.length + " · 已补 " + k + " · 未补 " + (evs.length - k), "t")
      + (sf.t ? "" : (evs.length ? '<div class="tday">' + evs.map(function (e) {
        const s = e.bull ? "d" : "u";
        return '<div class="ti' + (e.ft ? "" : " op") + '">' + hm(e.t) + " " + e.lv + ' <b class="' + s + '">' + (e.bull ? "↓" : "↑") + f2(e.bull ? e.lo : e.hi) + "</b> " + (e.ft ? "✓" + hm(e.ft) : "未补") + "</div>";
      }).join("") + "</div>" : '<div class="gEmpty">今日无分钟级缺口</div>'));

    h += sec('<b class="u">↑ iv</b>', ups.length + " 个", "u")
      + (sf.u ? "" : fold(ups.slice(4)) + ups.slice(0, 4).sort(function (a, b) { return fe(b) - fe(a); }).map(function (g) { return row(g, ups[0], dns[0]); }).join(""));
    h += '<div class="now">现价 ' + f2(last) + "</div>";
    h += sec('<b class="d">↓ iv</b>', dns.length + " 个", "d")
      + (sf.d ? "" : dns.slice(0, 4).map(function (g) { return row(g, ups[0], dns[0]); }).join("") + fold(dns.slice(4)));
    return h;
  }

  const ST = {};   /* code → {at, fly, R, src, err, sf(分节折叠), stale(缓存回退角标)} */
  function paint(host, code) {
    let box = host.querySelector(":scope > .gvJL");
    if (!box) { host.innerHTML = ""; box = document.createElement("div"); box.className = "gvJL"; host.appendChild(box); }
    if (host.id !== "homeGapJL" && !host.querySelector(":scope > .gvTogJL")) { /* 11-10 用户: 持仓卡 IV 缺口可收起/展开(所有票共用一个开关, 记 jl_gapfold_v1) */
      let f = false; try { f = localStorage.getItem("jl_gapfold_v1") === "1"; } catch (e) { }
      const tg = document.createElement("button"); tg.type = "button"; tg.className = "gvTogJL"; tg.innerHTML = "IV 缺口 <i>" + (f ? "▸" : "▾") + '</i><span class="gvPxJL"></span>'; tg.setAttribute("aria-label", "展开或收起缺口"); host.classList.toggle("gvFoldAllJL", f); host.insertBefore(tg, box);
      tg.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); const nf = !host.classList.contains("gvFoldAllJL"); try { localStorage.setItem("jl_gapfold_v1", nf ? "1" : "0"); } catch (e) { }
        document.querySelectorAll(".hldGapRowJL").forEach((h) => { if (h.id === "homeGapJL") return; h.classList.toggle("gvFoldAllJL", nf); const b = h.querySelector(":scope > .gvTogJL > i"); if (b) b.textContent = nf ? "▸" : "▾"; }); });
    }
    const s = ST[code], pxEl = host.querySelector(":scope > .gvTogJL > .gvPxJL");
    if (pxEl) pxEl.textContent = s && s.R ? "现价 " + f2(s.R.last) : "";
    const h = s && s.R
      ? html(s.R, s.sf) + (s.src === "em" ? '<div class="wait">数据源：东财备选（腾讯暂不可用）</div>' : "") + (s.stale ? '<div class="stale">⚠ 接口失败，暂显缓存（' + s.stale.md + '），稍后自动重试</div>' : "")
      : '<div class="wait">' + (s && s.err ? (/熔断/.test(s.err) ? "行情接口拥挤，十几秒后自动重试" : "缺口数据取不到：" + s.err + "（稍后自动重试）") : "缺口数据加载中…") + "</div>";
    if (box._h !== h) {
      box.innerHTML = h; box._h = h;
      box.querySelectorAll(".fb").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); const k = b.getAttribute("data-fbs"); if (s) { s.sf = s.sf || {}; s.sf[k] = !s.sf[k]; paint(host, code); } }));
    }
  }
  function render(host, code) {
    ensureCss();
    const px = /^(sh|sz)\d{6}$/i.test(String(code)) && /^(sh000|sz399|sh880)/i.test(String(code)) ? String(code).toLowerCase() : ""; /* jl-homeintra 1030: 指数带前缀走(sh000001≠平安银行000001), 个股照旧只留数字 */
    code = px || String(code).replace(/\D/g, "");
    host.onclick = (e) => e.stopPropagation();   /* 点这一块不翻卡、不触发原缺口行的展开 */
    host.setAttribute("data-gv", code);
    atrbKick();   /* =S/B 标要作战屏 ATRB_TAB(同源抓取, 12h缓存) */
    const s = ST[code] = ST[code] || { at: 0 };
    paint(host, code);
    if (s.fly || Date.now() - s.at < 60000) return;
    s.fly = 1;
    const c = px || pf(code);
    getAll(c).then((g) => {
      s.R = compute(code, ...g.r); s.src = g.src; s.stale = null; s.err = ""; s.at = Date.now(); s.fly = 0;
      try { localStorage.setItem("jl_gapR_" + code, JSON.stringify({ at: Date.now(), R: s.R })); } catch (e) { }   /* v3: 弱网回退缓存 */
      if (!px && g.src === "tx" && window.jlCollectGapsJL) { try { window.jlCollectGapsJL(code, [["日", g.r[0].slice(-80)], ["30分", g.r[1]], ["15分", g.r[2]], ["5分", g.r[3]], ["1分", g.r[4]]]); } catch (eL) { } }   /* jl-gapfix: 台账与卡片同源同口径; v3: 日线400根仅供显示, 台账仍喂最后80根=原口径 */
      document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code));
    }).catch((e) => {
      s.err = e && e.message || "网络"; s.at = Date.now() - 45000; s.fly = 0;
      if (!s.R) {   /* v3: 取不到→回退上次成功缓存(3.5天内), 带⚠角标 */
        try {
          const c2 = JSON.parse(localStorage.getItem("jl_gapR_" + code) || "null");
          if (c2 && c2.R && c2.R.last && Date.now() - c2.at < 302400000) { s.R = c2.R; s.src = ""; s.stale = { md: dtxt(c2.at) }; }
        } catch (e2) { }
      }
      document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code));
    });
  }
  window.JLGapIV = { render, compute, _st: ST };
})();
