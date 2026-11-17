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
  async function mn(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + c); const x = d.data[c]; let pv = 0; return { date: x.data.date, pts: x.data.data.map((s) => { const a = s.split(" "), cv = +a[2], v = cv - pv; pv = cv; return { t: a[0], p: +a[1], v: v }; }) }; }

  /* ===== jl-1197: 东财备选——腾讯失败先原地重试一次, 仍失败才走东财; 每只票各自判断 ===== */
  const EM = (u) => new Promise((ok, no) => { const cb = "gvEM" + Date.now() + Math.floor(Math.random() * 1e6), sc = document.createElement("script"); const done = () => { try { delete window[cb]; } catch (e) { } sc.remove(); }; const tm = setTimeout(() => { done(); no(Error("东财超时")); }, 10000); window[cb] = (d) => { clearTimeout(tm); done(); ok(d); }; sc.onerror = () => { clearTimeout(tm); done(); no(Error("东财连不上")); }; sc.src = u + "&cb=" + cb + "&_=" + Date.now(); document.head.appendChild(sc); });
  const emId = (c) => (/^sh/i.test(c) ? "1." : "0.") + String(c).replace(/\D/g, "");
  async function emK(c, klt, lmt) { const d = await EM("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + emId(c) + "&klt=" + klt + "&fqt=1&lmt=" + lmt + "&end=20500101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56"); const k = d && d.data && d.data.klines; if (!k || !k.length) throw Error("东财无数据"); return k.map((r) => { const a = r.split(","); return { t: klt === 101 ? a[0] : a[0].replace(/\D/g, ""), o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; }); }
  /* 1分钟线聚合成 k 分钟线, 时刻标在K线结束(与腾讯 mkline 同口径: 09:30 撮合根并入第一根) */
  function agg(m1, k) { const out = []; let cur = null; m1.forEach((x) => { const d = x.t.slice(0, 8), mm = +x.t.slice(8, 10) * 60 + +x.t.slice(10, 12); let i = mm <= 690 ? mm - 570 : 120 + mm - 780; if (i < 1) i = 1; const e = Math.ceil(i / k) * k, em = e <= 120 ? 570 + e : 780 + e - 120, key = d + em, t = d + String(Math.floor(em / 60)).padStart(2, "0") + String(em % 60).padStart(2, "0"); if (!cur || cur.key !== key) { cur = { key, t, o: x.o, c: x.c, h: x.h, l: x.l, v: x.v }; out.push(cur); } else { cur.c = x.c; cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.v += x.v; } }); return out.map((b) => ({ t: b.t, o: b.o, c: b.c, h: b.h, l: b.l, v: b.v })); }
  function mnFrom(m1) { const d = m1[m1.length - 1].t.slice(0, 8); return { date: d, pts: m1.filter((x) => x.t.slice(0, 8) === d && x.t.slice(8, 12) >= "0930").map((x) => ({ t: x.t.slice(8, 12), p: x.c, v: x.v })) }; }
  async function getAll(c) {
    const tx = () => Promise.all([dk(c), mk(c, 30), mk(c, 15), mk(c, 5), mk1(c), mn(c).catch(() => null)]).then((r) => { if (!r[5] || !r[5].pts || !r[5].pts.length) r[5] = mnFrom(r[4]); return r; });   /* 分时接口单独被风控501时用1分K拼当日分时 */
    let e1;
    try { return { r: await tx(), src: "tx" }; } catch (e) { e1 = e; }
    try { return { r: await tx(), src: "tx" }; } catch (e) { e1 = e; }
    try { const r = await Promise.all([emK(c, 101, 80), emK(c, 1, 1200)]), m1 = r[1]; return { r: [r[0], agg(m1, 30), agg(m1, 15), agg(m1, 5), m1, mnFrom(m1)], src: "em" }; }
    catch (e2) { throw Error("腾讯" + (e1 && e1.message ? "(" + e1.message + ")" : "失败") + "，东财" + (e2 && e2.message ? "(" + e2.message + ")" : "失败")); }
  }

  /* ===== 计算 ===== */
  /* 扫一个周期的缺口(含今天已补的)。输出: gapUp, origLo/origHi, remLo/remHi(未补才有), fillPx(=前收), t, ft(补上的时刻), d(形成日) */
  function scan(b, lv, today) {
    const out = [], daily = lv === "日", days = [...new Set(b.map((x) => dg(x.t).slice(0, 8)))], keep = daily ? null : days.slice(-5);
    for (let i = 1; i < b.length; i++) {
      const p0 = b[i - 1], c0 = b[i], d0 = dg(c0.t).slice(0, 8);
      if (!daily && (dg(p0.t).slice(0, 8) !== d0 || keep.indexOf(d0) < 0)) continue;   /* 分钟级只看同一天内、近5个交易日 */
      const vm = p0.c * 0.0005, gapUp = c0.o - p0.c > vm && (daily || c0.l <= p0.h), gapDn = p0.c - c0.o > vm && (daily || c0.h >= p0.l);
      if (!gapUp && !gapDn) continue;
      let ft = "", ext = c0.o;
      if (gapUp ? c0.l <= p0.c : c0.h >= p0.c) ft = daily && d0 === today ? "今日" : c0.t;   /* 形成那根自己影线碰前收 = 当根已补; 今天的日K碰了 = 今天补了(时刻取开盘缺口的) */
      else ext = gapUp ? c0.l : c0.h;   /* jl-1201: 剩余带从形成那根自己的影线算起(与台账同口径) */
      for (let j = ft ? b.length : i + 1; j < b.length; j++) {
        ext = gapUp ? Math.min(ext, b[j].l) : Math.max(ext, b[j].h);
        if (gapUp ? b[j].l <= p0.c : b[j].h >= p0.c) { ft = b[j].t; break; }
      }
      if (ft && ft !== "今日" && dg(ft).slice(0, 8) !== today) continue;   /* 以前就补掉的不要 */
      const g = { lv, gapUp, origLo: gapUp ? p0.c : c0.o, origHi: gapUp ? c0.o : p0.c, fillPx: p0.c, remLo: null, remHi: null, t: c0.t, ft, d: d0 };
      if (!ft) { g.remLo = gapUp ? p0.c : Math.max(c0.o, ext); g.remHi = gapUp ? Math.min(c0.o, ext) : p0.c; }
      out.push(g);
    }
    return out;
  }
  /* 今天开盘缺口(偏离≥0.1%)碰前收的时刻 "HHMM", 没碰返回 "" —— 给今天日K"今日已补"打时间戳 */
  function openFillHM(today, op, pre, m1) {
    if (!op || Math.abs(op / pre - 1) < 0.001) return "";
    const up = op > pre, hit = m1.find((x) => dg(x.t).slice(0, 8) === today && (up ? x.l <= pre : x.h >= pre));
    return hit ? dg(hit.t).slice(8, 12) : "";
  }
  /* 未补缺口按方向+剩余带重叠合并成组 */
  function groupOpen(open, last) {
    const grp = [];
    open.forEach((g) => {
      const m = grp.find((x) => x.gapUp === g.gapUp && g.remLo <= x.remHi * 1.0005 && g.remHi >= x.remLo * 0.9995);
      if (!m) grp.push({ gapUp: g.gapUp, remLo: g.remLo, remHi: g.remHi, mem: [g] });
      else { m.mem.push(g); m.remLo = Math.min(m.remLo, g.remLo); m.remHi = Math.max(m.remHi, g.remHi); }
    });
    grp.forEach((g) => {
      g.lvs = [...new Set(g.mem.map((x) => x.lv))].sort((a, b) => ORD[b] - ORD[a]);
      g.N = g.lvs.length;
      g.fillPx = g.gapUp ? g.remLo : g.remHi;
      g.toFill = toFill(g.fillPx, last);
      g.origLo = Math.min.apply(null, g.mem.map((m) => m.origLo)); g.origHi = Math.max.apply(null, g.mem.map((m) => m.origHi));
      g.inG = last >= g.remLo * 0.998 && last <= g.remHi * 1.002;
      g.born = g.mem.slice().sort((a, b) => dg(a.t) - dg(b.t)).map((m) => ({ lv: m.lv, t: dg(m.t) }));
    });
    return grp.sort((a, b) => b.N - a.N || (b.inG - a.inG) || a.toFill - b.toFill);
  }
  /* 回补率(口径表 V2): 日线按"已挂几天"; 今天形成的分钟缺口按检查点; 往天的分钟缺口没统计 → 不给 */
  function fillProb(g, code, D, isToday, today) {
    const L = g.lvs[0], bd = g.mem.map((m) => m.d).sort()[0], k = g.gapUp ? "u" : "d";
    if (L === "日") {
      const td = RTD[code]; if (!td) return;
      const fi = D.findIndex((x) => dg(x.t).slice(0, 8) === bd), nowM = new Date().getHours() * 60 + new Date().getMinutes();
      const lastDone = isToday && nowM < 900 ? D.length - 2 : D.length - 1, age = fi >= 0 ? lastDone - fi : -1;
      if (age >= 0) { const r = td[k][1 + Math.min(age, 5)]; g.pr = [null, r[1], r[2]]; }
      else { const r = td[k][0]; g.pr = [r[1], r[2], r[3]]; }
    } else if (bd === today) {
      const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), w = d.getDay();
      const ck = (w === 0 || w === 6 || m < 570 || m >= 900) ? 3 : m < 630 ? 0 : m < 810 ? 1 : m < 870 ? 2 : 3;   /* 检查点 10:30/13:30/14:30/收盘 */
      const r = MT[code] && MT[code][L] ? (MT[code][L][ck] || [])[g.gapUp ? 0 : 1] : null;
      g.pr = !r || r[0] < 5 ? null : (ck < 3 ? [r[1], r[2], r[3]] : [null, r[2], r[3]]);
    }
  }
  function compute(code, D, m30, m15, m5, m1, M) {
    const today = M.date, bt = D[D.length - 1], bp = D[D.length - 2];
    const isToday = dg(bt.t).slice(0, 8) === today;
    const pre = isToday ? bp.c : bt.c, op = isToday ? bt.o : null;
    const last = M.pts.length ? M.pts[M.pts.length - 1].p : bt.c;
    const BY = { "日": D, "30分": m30, "15分": m15, "5分": m5, "1分": m1 };
    let all = []; LV.forEach((L) => { if (BY[L] && BY[L].length > 2) all = all.concat(scan(BY[L], L, today)); });
    const ofh = openFillHM(today, op, pre, m1);
    all.forEach((g) => { if (g.ft === "今日") g.ft = today + (ofh || "1500"); });
    const ev = all.filter((g) => g.lv !== "日" && g.d === today).sort((a, b) => dg(a.t) - dg(b.t));   /* 今日分钟级事件→宫格(在距离窗/小缺口过滤之前取) */
    const ref = op || last;
    all = all.filter((g) => toFill(g.fillPx, last) <= 40);   /* 距补满价 40% 以内; 远的在渲染时折叠 */
    all = all.filter((g) => !(g.lv === "1分" && g.ft && (g.origHi - g.origLo) / ref < 0.002));   /* 1分钟 <0.2% 的已补缺口不显示 */
    const grp = groupOpen(all.filter((g) => !g.ft), last);
    grp.forEach((g) => fillProb(g, code, D, isToday, today));
    return { today, code, last, grp, ev };
  }

  /* ===== 渲染: 重点跟进 + 今日iv宫格 + ↑iv/现价/↓iv 对称梯 + 远的折叠 ===== */
  const dtxt = (ms) => { const d = new Date(ms); return String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function html(R, sf) {
    sf = sf || {};
    const last = R.last, yr = String(R.today).slice(0, 4), old = tabOld();
    const side = (g) => ((g.remLo + g.remHi) / 2 >= last ? "u" : "d");      /* 缺口带在现价上方→↑黄, 下方→↓青; 现价在带内按中点归侧 */
    const has = (g, lv) => g.lvs.indexOf(lv) >= 0;
    const kai = (g) => has(g, "日") && g.mem.some((m) => m.lv === "日" && (m.origHi - m.origLo) / m.origLo >= 0.001);   /* 开盘缺口(≥0.1%的开盘偏离) */
    const lvTxt = (g) => {
      const ms = g.lvs.filter((l) => l !== "日").sort((a, b) => ORD[b] - ORD[a]);
      const out = [];
      if (has(g, "日")) out.push(kai(g) ? "日线+开盘" : "日线");
      if (ms.length) out.push((ms.length >= 2 ? ms.map((x) => x.replace("分", "")).join("/") : ms[0].replace("分", "")) + "分" + (ms.length >= 2 ? "重合" : ""));
      return out.join(" · ");
    };
    const pills = (g, s) => '<span class="lv">' + [["日", "日"], ["开", "开"], ["30分", "30"], ["15分", "15"], ["5分", "5"], ["1分", "1"]].map((p) => {
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
      g.pr.forEach((v, i) => { if (v != null && isFinite(v)) out.push(L[i] + "<b>" + Math.round(v) + "%</b>"); });
      return out.length ? '<span class="pb">' + out.join(" ") + (old ? '<i class="old">旧表' + TAB_ASOF.slice(5) + "</i>" : "") + "</span>" : "";
    };

    const ups = R.grp.filter((g) => side(g) === "u").sort((a, b) => a.toFill - b.toFill);
    const dns = R.grp.filter((g) => side(g) === "d").sort((a, b) => a.toFill - b.toFill);
    const row = (g, fu, fd) => {
      const s = side(g), hot = g === fu || g === fd || g.inG, warm = !hot && g.toFill <= 7;
      const oz = (g.origHi - g.origLo) / g.origLo < 0.0015 ? f2((g.origLo + g.origHi) / 2) : f2(g.origLo) + "–" + f2(g.origHi);
      return '<div class="gr' + (hot ? " hot" : warm ? " warm" : "") + '"><div class="a">'
        + '<b class="px ' + s + '">' + (s === "u" ? "↑" : "↓") + f2(g.fillPx) + "</b>" + pills(g, s)
        + (g.inG ? '<span class="fxd">回补中</span>' : "") + pb(g) + "</div>"
        + '<div class="b">' + born(g) + " · " + oz + " · 当时缺口 " + ((g.origHi - g.origLo) / g.origLo * 100).toFixed(1) + "% → " + (g.inG ? "回补中" : "现在还差 <b>" + g.toFill.toFixed(1) + "%</b>") + "</div></div>";
    };
    const fold = (list) => (!list.length ? "" : '<div class="gfold">▸ 远的 ' + list.length + " 个：" + list.slice(0, 4).map((g) => f2(g.fillPx)).join(" · ") + (list.length > 4 ? " …" : "") + "</div>");
    const fx = (g) => {
      const s = side(g);
      return '<div class="fx"><b class="px ' + s + '">' + (s === "u" ? "↑" : "↓") + f2(g.fillPx) + "</b>"
        + '<span class="fxd">' + (g.inG ? "回补中" : "还差 " + g.toFill.toFixed(1) + "%") + "</span>"
        + '<span class="lvTxt">' + lvTxt(g) + "</span>" + pb(g) + "</div>";
    };
    const sec = (title, sum, key) => '<div class="gsec">' + title + (sum ? '<span class="sum">' + sum + "</span>" : "")
      + '<button class="fb" type="button" data-fbs="' + key + '">' + (sf[key] ? "展开 ▸" : "收起 ▴") + "</button></div>";

    let h = '<div class="fcs"><div class="ft">重点跟进</div>' + (ups.length || dns.length ? [ups[0], dns[0]].filter(Boolean).map(fx).join("") : '<div class="fx"><span class="lvTxt">无未补缺口</span></div>') + "</div>";

    const evs = R.ev || [];
    const k = evs.filter((e) => e.ft).length;
    h += sec('<span>今日 iv · ' + md(R.today) + "</span>", "出现 " + evs.length + " · 已补 " + k + " · 未补 " + (evs.length - k), "t")
      + (sf.t ? "" : (evs.length ? '<div class="tday">' + evs.map((e) => {
        const s = e.gapUp ? "d" : "u";
        return '<div class="ti' + (e.ft ? "" : " op") + '">' + hm(e.t) + " " + e.lv + ' <b class="' + s + '">' + (e.gapUp ? "↓" : "↑") + f2(e.fillPx) + "</b> " + (e.ft ? "✓" + hm(e.ft) : "未补") + "</div>";
      }).join("") + "</div>" : '<div class="gEmpty">今日无分钟级缺口</div>'));

    h += sec('<b class="u">↑ iv</b>', ups.length + " 个", "u")
      + (sf.u ? "" : fold(ups.slice(4)) + ups.slice(0, 4).sort((a, b) => b.fillPx - a.fillPx).map((g) => row(g, ups[0], dns[0])).join(""));
    h += '<div class="now">现价 ' + f2(last) + "</div>";
    h += sec('<b class="d">↓ iv</b>', dns.length + " 个", "d")
      + (sf.d ? "" : dns.slice(0, 4).map((g) => row(g, ups[0], dns[0])).join("") + fold(dns.slice(4)));
    return h;
  }

  /* ===== 挂载 ===== */
  const ST = {};   /* code → {at(上次尝试), okAt(上次成功), fly, R, src, err, cache(缓存回退时刻)} */
  const CK = "jl_gapR2_";   /* 11-17 字段改名后换缓存键; 旧 jl_gapR_* / jl_atrb_v1 清掉 */
  try { Object.keys(localStorage).forEach((k) => { if (k.indexOf("jl_gapR_") === 0 || k === "jl_atrb_v1") localStorage.removeItem(k); }); } catch (e) { }
  /* 分节折叠(今日iv/↑iv/↓iv) 所有票共用, 记 jl_gapsf_v1 —— 和整块折叠 jl_gapfold_v1 一样刷新不丢 */
  let SF = {}; try { SF = JSON.parse(localStorage.getItem("jl_gapsf_v1") || "{}") || {}; } catch (e) { }
  const STALE_MS = 180000;   /* 上次成功超过 3 分钟还取不到 = 断流, 按缓存显示 */
  function staleOf(s) {
    if (!s || !s.R) return null;
    if (s.cache) return { md: s.cache };
    if (s.err && s.okAt && Date.now() - s.okAt > STALE_MS) return { md: dtxt(s.okAt) };
    return null;
  }
  function paint(host, code) {
    let box = host.querySelector(":scope > .gvJL");
    if (!box) { host.innerHTML = ""; box = document.createElement("div"); box.className = "gvJL"; host.appendChild(box); }
    if (host.id !== "homeGapJL" && !host.querySelector(":scope > .gvTogJL")) { /* 11-10: 持仓卡 IV 缺口可收起/展开(所有票共用一个开关, 记 jl_gapfold_v1) */
      let f = false; try { f = localStorage.getItem("jl_gapfold_v1") === "1"; } catch (e) { }
      const tg = document.createElement("button"); tg.type = "button"; tg.className = "gvTogJL"; tg.innerHTML = "IV 缺口 <i>" + (f ? "▸" : "▾") + '</i><span class="gvPxJL"></span>'; tg.setAttribute("aria-label", "展开或收起缺口"); host.classList.toggle("gvFoldAllJL", f); host.insertBefore(tg, box);
      tg.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); const nf = !host.classList.contains("gvFoldAllJL"); try { localStorage.setItem("jl_gapfold_v1", nf ? "1" : "0"); } catch (e) { }
        document.querySelectorAll(".hldGapRowJL").forEach((h) => { if (h.id === "homeGapJL") return; h.classList.toggle("gvFoldAllJL", nf); const b = h.querySelector(":scope > .gvTogJL > i"); if (b) b.textContent = nf ? "▸" : "▾"; }); });
    }
    const s = ST[code], st = staleOf(s), pxEl = host.querySelector(":scope > .gvTogJL > .gvPxJL");
    if (pxEl) {
      pxEl.innerHTML = s && s.R ? "现价 " + f2(s.R.last) + (st ? " <em>⚠断流</em>" : "") : "";   /* 收起时也看得到断流 */
    }
    const h = s && s.R
      ? (st ? '<div class="stale top">⚠ 断流：下面是 ' + st.md + ' 的数据，自动重试中</div>' : "") + html(s.R, SF) + (s.src === "em" ? '<div class="wait">数据源：东财备选（腾讯暂不可用）</div>' : "")
      : '<div class="wait">' + (s && s.err ? (/熔断/.test(s.err) ? "行情接口拥挤，十几秒后自动重试" : "缺口数据取不到：" + s.err + "（稍后自动重试）") : "缺口数据加载中…") + "</div>";
    if (box._h !== h) {
      box.innerHTML = h; box._h = h;
      box.querySelectorAll(".fb").forEach((b) => b.addEventListener("click", (ev) => {
        ev.stopPropagation(); ev.preventDefault(); const k = b.getAttribute("data-fbs"); SF[k] = !SF[k];
        try { localStorage.setItem("jl_gapsf_v1", JSON.stringify(SF)); } catch (e) { }
        document.querySelectorAll(".hldGapRowJL[data-gv]").forEach((el) => paint(el, el.getAttribute("data-gv")));
      }));
    }
  }
  function render(host, code) {
    ensureCss();
    const px = /^(sh|sz)\d{6}$/i.test(String(code)) && /^(sh000|sz399|sh880)/i.test(String(code)) ? String(code).toLowerCase() : ""; /* 指数带前缀(sh000001≠平安银行000001), 个股只留数字 */
    code = px || String(code).replace(/\D/g, "");
    host.onclick = (e) => e.stopPropagation();   /* 点这一块不翻卡 */
    host.setAttribute("data-gv", code);
    const s = ST[code] = ST[code] || { at: 0 };
    paint(host, code);
    if (s.fly || Date.now() - s.at < 60000) return;   /* 每只票 60 秒最多取一次 */
    s.fly = 1;
    const c = px || pf(code);
    getAll(c).then((g) => {
      s.R = compute(code, ...g.r); s.src = g.src; s.cache = ""; s.err = ""; s.at = s.okAt = Date.now(); s.fly = 0;
      try { localStorage.setItem(CK + code, JSON.stringify({ at: Date.now(), R: s.R })); } catch (e) { }   /* 弱网回退缓存 */
      if (!px && g.src === "tx" && window.jlCollectGapsJL) { try { window.jlCollectGapsJL(code, [["日", g.r[0].slice(-80)], ["30分", g.r[1]], ["15分", g.r[2]], ["5分", g.r[3]], ["1分", g.r[4]]]); } catch (eL) { } }   /* 台账与卡片同源同口径; 日线只喂最后80根=原口径 */
      document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code));
    }).catch((e) => {
      s.err = e && e.message || "网络"; s.at = Date.now() - 45000; s.fly = 0;
      if (!s.R) {   /* 取不到 → 回退上次成功缓存(3.5天内), 块顶上说一声断流+数据时刻 */
        try {
          const c2 = JSON.parse(localStorage.getItem(CK + code) || "null");
          if (c2 && c2.R && c2.R.last && Date.now() - c2.at < 302400000) { s.R = c2.R; s.src = ""; s.cache = dtxt(c2.at); }
        } catch (e2) { }
      }
      document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code));
    });
  }
  window.JLGapIV = { render, compute, _st: ST };
})();
