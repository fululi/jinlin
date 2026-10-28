/* jl_gapiv.js v2 (2026-10-28, jl-1180 缺口区改版) —— 持仓卡「缺口 / iv」行: 未补/今日新增/今日已补三段分类、限高可见滚动条、竞价与回补率紧凑小格、同价周期合并; 计算与取数同 v1 零改动。
   数据: 只用腾讯(日K fqkline / 分钟K mkline 30·15·5·1 / 当日分时 minute)。每只票 60 秒最多取一次。
   口径与 App unfilledVIJL 一致: VI = 相邻两根K线, 后一根开盘离前一根收盘 > 0.05%, 分钟级还须影线重叠; 补回 = 之后碰到前一根收盘(远沿)。
   开盘缺口: 昨收→今开, 补回价 = 昨收; 补完后又回到缺口里待满 5 分钟的每一段写「再次回补」。
   只负责持仓卡这一行的显示, 不改分时图、台账(collectGapsJL)和任何计算。回滚: index.html 删 jl_gapiv.js 引用即回到原缺口行。 */
(function () {
  "use strict";
  const RT = {"600105":{"1分":[[[66,78],[74,83]],[[59,73],[66,80]],[[53,69],[63,78]],[[53,69],[60,77]]],"5分":[[[79,87],[80,88]],[[68,82],[67,82]],[[62,77],[63,80]],[[61,77],[63,81]]],"15分":[[[86,87],[82,88]],[[67,78],[68,82]],[[63,76],[63,79]],[[63,76],[61,81]]],"日":[[24,41,43],[35,65,73]]},"603986":{"1分":[[[70,77],[78,87]],[[63,71],[70,82]],[[57,67],[66,80]],[[52,65],[62,77]]],"5分":[[[61,69],[72,82]],[[53,65],[68,79]],[[50,64],[64,76]],[[43,59],[59,73]]],"15分":[[[76,81],[69,78]],[[68,78],[71,80]],[[57,70],[64,74]],[[58,70],[54,64]]],"日":[[22,54,59],[29,54,59]]}}; /* 同 index.html jl-1165 回补率表 */
  const LV = ["日", "30分", "15分", "5分", "1分"], LVN = { "日": "日线", "30分": "30分钟", "15分": "15分钟", "5分": "5分钟", "1分": "1分钟" }, ORD = { "1分": 1, "5分": 5, "15分": 15, "30分": 30, "日": 99 };
  const pf = (c) => (/^[569]/.test(c) ? "sh" : "sz") + c;
  const dg = (t) => String(t).replace(/\D/g, "");
  const hm = (t) => { const d = dg(t); return d.length >= 12 ? d.slice(8, 10) + ":" + d.slice(10, 12) : ""; };
  const md = (t) => { const d = dg(t); return d.slice(4, 6) + "-" + d.slice(6, 8); };
  const f2 = (x) => (+x).toFixed(2), sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
  const gC = (b) => (b ? "#00f0ff" : "#ffe600");   /* 青蓝↓ = 要跌下来补, 黄↑ = 要涨上去补 */

  const CSS = ".gvJL{font:600 11.5px/1.35 -apple-system,'PingFang SC',sans-serif;color:#fff;text-shadow:none;margin-top:5px;cursor:default}"
    + ".gvJL *{box-sizing:border-box}.gvJL .mono{font-family:ui-monospace,Menlo,monospace}"
    + ".gvJL .aucL{display:grid;grid-template-columns:1fr auto;gap:1px 8px;align-items:center;border:1px solid;border-radius:8px;padding:4px 7px}"
    + ".gvJL .ln1{font-size:12px;font-weight:800}.gvJL .ln1 .big{font:800 15px ui-monospace,Menlo,monospace}"
    + ".gvJL .ln2{font:800 12.5px ui-monospace,Menlo,monospace;text-align:right}.gvJL .ln2 .sz{font-size:10.5px;color:#fff;margin-left:4px}"
    + ".gvJL .ln3{grid-column:1/3;font:700 11px ui-monospace,Menlo,monospace;margin-top:1px}.gvJL .okc{color:#4dffbf;font-size:13px}"
    + ".gvJL .ln4{grid-column:1/3;font:700 10.5px ui-monospace,Menlo,monospace}"
    + ".gvJL .gScroll{max-height:252px;overflow-y:scroll;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#ffe600 rgba(255,255,255,.12);scrollbar-gutter:stable;padding-right:3px;margin-top:5px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(0,0,0,.12)}"
    + ".gvJL .gScroll::-webkit-scrollbar{width:7px}.gvJL .gScroll::-webkit-scrollbar-track{background:rgba(255,255,255,.12);border-radius:7px}"
    + ".gvJL .gScroll::-webkit-scrollbar-thumb{background:#ffe600;border-radius:7px;min-height:32px}"
    + ".gvJL .gSec{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:4px 7px;background:rgba(20,35,65,.98);border-bottom:1px solid rgba(255,255,255,.18);font-size:11px}"
    + ".gvJL .gSec span{font-size:10px;color:rgba(255,255,255,.65)}.gvJL .gSec.new{color:#ffe600}.gvJL .gSec.doneH{color:#4dffbf}"
    + ".gvJL .g{display:grid;grid-template-columns:16px 1fr auto;gap:2px 5px;align-items:center;padding:4px 6px;border-radius:7px;margin:3px 4px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.13)}"
    + ".gvJL .g.in{border-color:#fff;background:rgba(255,255,255,.11)}"
    + ".gvJL .ar{font:900 13px/1 -apple-system;text-align:center}.gvJL .z{font:800 12.5px ui-monospace,Menlo,monospace}"
    + ".gvJL .r{text-align:right;font-size:10.5px;white-space:nowrap}"
    + ".gvJL .n,.gvJL .tm{grid-column:2/4;display:flex;flex-wrap:wrap;gap:1px 7px;font-size:10.5px}.gvJL .tm{font:700 10.5px ui-monospace,Menlo,monospace}"
    + ".gvJL .tag{display:inline-block;border-radius:6px;padding:0 4px;font-size:10px;font-weight:800;margin-left:3px;vertical-align:1px}"
    + ".gvJL .tN{background:#fff;color:#1a0508}.gvJL .tIn{border:1px solid #fff}"
    + ".gvJL .done{display:flex;justify-content:space-between;gap:6px;padding:4px 7px;font-size:11px;border-bottom:1px dashed rgba(255,255,255,.2)}"
    + ".gvJL .gEmpty{padding:5px 8px;font-size:11px;color:rgba(255,255,255,.55)}"
    + ".gvJL .rateH{display:flex;justify-content:space-between;margin:5px 2px 2px;font-size:10.5px}.gvJL .rateH b{font-size:11px}"
    + ".gvJL .rate{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;text-align:center;font-size:9.5px}"
    + ".gvJL .rate div{border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:2px 0;white-space:nowrap}.gvJL .rate b{display:inline;font:800 11px ui-monospace,Menlo,monospace;margin:0 2px}"
    + ".gvJL .aucL{position:relative}" /* jl-1183 */
    + ".gvJL .ln4w{grid-column:1/3;display:flex;flex-wrap:wrap;gap:1px 10px}"
    + ".gvJL .ln4w .ln4{white-space:nowrap}"
    + ".gvJL .gvFoldJL{position:absolute;top:1px;right:3px;background:transparent;border:0;color:#8fb4d8;font-size:11px;line-height:1;padding:3px 6px;cursor:pointer;opacity:.7}"
    + ".gvJL .gvFoldJL:active{opacity:1}"
    + ".gvJL .aucL.gvFolded .ln3,.gvJL .aucL.gvFolded .ln4w{display:none}"
    + ".gvJL .wait{font-size:11px;padding:4px 2px}"
    + ".gvJL .tgL{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:4px 8px;margin-bottom:5px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);font:800 12px ui-monospace,Menlo,monospace}"
    + ".gvJL .tgL .tgH{font:800 11px -apple-system,'PingFang SC',sans-serif;color:#fff}.gvJL .tgL .tgI{white-space:nowrap}.gvJL .tgL .tgI i{font-style:normal;color:#fff;opacity:.75;font-size:10.5px;margin-left:3px}"
    + ".gvJL .tgL .tgI em{font-style:normal;color:#ffd84a;border:1px solid rgba(255,216,74,.6);border-radius:6px;padding:0 4px;margin-left:4px;font-size:10.5px}";   /* jl-1201 日线未补目标行 */
  function ensureCss() { if (!document.getElementById("gvCssJL")) { const s = document.createElement("style"); s.id = "gvCssJL"; s.textContent = CSS; document.head.appendChild(s); } }

  async function J(u) { const r = await fetch(u + (u.includes("?") ? "&" : "?") + "_t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }
  async function mk(c, k, end, n) { const d = await J("https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=" + c + ",m" + k + "," + (end || "") + "," + (n || 320)); return (d.data[c]["m" + k] || []).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }
  /* 1分钟一次只给320根(约1.3天), 按结束时刻往前再补一页800根, 凑满近5个交易日 */
  async function mk1(c) { const a = await mk(c, 1); if (!a.length) return a; let b = []; try { b = await mk(c, 1, a[0].t, 800); } catch (e) { } const s = a[0].t; return b.filter((x) => x.t < s).concat(a); }
  async function dk(c) { const d = await J("https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?param=" + c + ",day,,,80,qfq"); const n = d.data[c]; return (n.qfqday || n.day).map((r) => ({ t: r[0], o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] })); }
  async function mn(c) { const d = await J("https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + c); const x = d.data[c]; let pv = 0; return { date: x.data.date, pts: x.data.data.map((s) => { const a = s.split(" "), cv = +a[2], v = cv - pv; pv = cv; return { t: a[0], p: +a[1], v: v }; }) }; }

  /* ===== jl-1197: 东财备选——腾讯失败先原地重试一次, 仍失败才走东财; 每只票各自判断, 不设全局标记 ===== */
  const EM = (u) => new Promise((ok, no) => { const cb = "gvEM" + Date.now() + Math.floor(Math.random() * 1e6), sc = document.createElement("script"); const done = () => { try { delete window[cb]; } catch (e) { } sc.remove(); }; const tm = setTimeout(() => { done(); no(Error("东财超时")); }, 10000); window[cb] = (d) => { clearTimeout(tm); done(); ok(d); }; sc.onerror = () => { clearTimeout(tm); done(); no(Error("东财连不上")); }; sc.src = u + "&cb=" + cb + "&_=" + Date.now(); document.head.appendChild(sc); });
  const emId = (c) => (/^sh/i.test(c) ? "1." : "0.") + String(c).replace(/\D/g, "");
  async function emK(c, klt, lmt) { const d = await EM("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + emId(c) + "&klt=" + klt + "&fqt=1&lmt=" + lmt + "&end=20500101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56"); const k = d && d.data && d.data.klines; if (!k || !k.length) throw Error("东财无数据"); return k.map((r) => { const a = r.split(","); return { t: klt === 101 ? a[0] : a[0].replace(/\D/g, ""), o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; }); }
  /* 1分钟线聚合成 k 分钟线, 时刻标在K线结束(与腾讯 mkline 同口径: 09:30 撮合根并入第一根) */
  function agg(m1, k) { const out = []; let cur = null; m1.forEach((x) => { const d = x.t.slice(0, 8), mm = +x.t.slice(8, 10) * 60 + +x.t.slice(10, 12); let i = mm <= 690 ? mm - 570 : 120 + mm - 780; if (i < 1) i = 1; const e = Math.ceil(i / k) * k, em = e <= 120 ? 570 + e : 780 + e - 120, key = d + em, t = d + String(Math.floor(em / 60)).padStart(2, "0") + String(em % 60).padStart(2, "0"); if (!cur || cur.key !== key) { cur = { key, t, o: x.o, c: x.c, h: x.h, l: x.l, v: x.v }; out.push(cur); } else { cur.c = x.c; cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.v += x.v; } }); return out.map((b) => ({ t: b.t, o: b.o, c: b.c, h: b.h, l: b.l, v: b.v })); }
  function mnFrom(m1) { const d = m1[m1.length - 1].t.slice(0, 8); return { date: d, pts: m1.filter((x) => x.t.slice(0, 8) === d && x.t.slice(8, 12) >= "0930").map((x) => ({ t: x.t.slice(8, 12), p: x.c, v: x.v })) }; }
  async function getAll(c) {
    const tx = () => Promise.all([dk(c), mk(c, 30), mk(c, 15), mk(c, 5), mk1(c), mn(c)]);
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
    all = all.filter((g) => Math.abs((g.lo + g.hi) / 2 / last - 1) <= 0.08);
    all = all.filter((g) => !(g.lv === "1分" && (g.hi - g.lo) / ref < 0.002));   /* 1分钟 <0.2% 不显示 */
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
      const L = g.lvs[0], r = rt && rt[L] ? (L === "日" ? rt["日"][g.bull ? 0 : 1] : (rt[L][ck] || [])[g.bull ? 0 : 1]) : null;
      g.rt = r ? (r.length === 3 ? "1日 " + r[0] + "% · 3日 " + r[1] + "% · 5日 " + r[2] + "%" : "次日 " + r[0] + "% · 3日 " + r[1] + "%") : "";
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
    dgp.sort((a, b) => b.N - a.N || dg(b.ft) - dg(a.ft));
    const tr = {}; LV.forEach((L) => { const t = all.filter((g) => g.lv === L && g.d === today); tr[L] = { n: t.length, k: t.filter((g) => g.ft).length }; });
    return { today, pre, op, opg, grp, dgp, tr, tgt, code, last };
  }

  /* jl-1201: 日线未补目标行 + 中波段斐波(同持仓卡中波段条)落在缺口内=双向验证 */
  function tgtHtml(R) {
    if (!R.tgt) return "";
    let F = null; try { F = window.jlFibLvJL ? window.jlFibLvJL(R.code) : null; } catch (e) { }
    const it = (g, up) => {
      if (!g) return '<span class="tgI" style="opacity:.6">' + (up ? "↑ 上方无" : "↓ 下方无") + "</span>";
      const z = Math.abs(g.hi - g.lo) / g.hi < 0.0015 ? f2((g.lo + g.hi) / 2) : f2(g.lo) + "–" + f2(g.hi);
      let fb = null; if (F && F.lv) F.lv.forEach((l) => { if (l.v >= g.lo * 0.997 && l.v <= g.hi * 1.003 && (!fb || Math.abs(l.v - (g.lo + g.hi) / 2) < Math.abs(fb.v - (g.lo + g.hi) / 2))) fb = l; });
      return '<span class="tgI" style="color:' + gC(!up) + '">' + (up ? "↑ " : "↓ ") + z + " <b>" + (g.inZ ? "回补中" : sg(g.dist)) + "</b><i>" + g.d + "</i>" + (fb ? "<em>≈" + (fb.r === 0 || fb.r === 1 ? ((fb.r === 0) === (F.dir < 0) ? "段低" : "段高") : "斐波" + fb.r) + " " + f2(fb.v) + "</em>" : "") + "</span>";
    };
    return '<div class="tgL"><span class="tgH">日线未补</span>' + it(R.tgt.up, true) + it(R.tgt.dn, false) + "</div>";
  }
  function html(R, openDone) {
    let h = tgtHtml(R);
    if (R.op) {
      const o = R.opg, col = o ? gC(o.up) : "#fff";
      if (o) {
        const rem = Math.abs(o.ext - R.pre);
        h += '<div class="aucL" style="border-color:' + col + '"><div class="ln1">竞 ' + (o.up ? "高开" : "低开") + ' <span class="big" style="color:' + col + '">' + sg(o.pct) + "</span></div>"
          + '<div class="ln2" style="color:' + col + '">' + (o.up ? "↓" : "↑") + " iv " + f2(R.op) + "–" + f2(R.pre) + ' <span class="sz">' + f2(o.size) + "元</span></div>"
          + '<div class="ln3">' + (o.st === "done" ? '<span class="okc">✓</span> ' + o.ft : "还差 " + f2(rem) + "元 · 已补 " + Math.round(o.prog * 100) + "%") + "</div>"
          + (o.back && o.back.length ? '<div class="ln4w">' + o.back.map((b) => '<span class="ln4">再次回补 ' + b + "</span>").join("") + "</div>" : "") /* jl-1183: 回补记录横排 */
          + '<button class="gvFoldJL" type="button" aria-label="收起或展开回补记录">▾</button>' + "</div>";
      } else h += '<div class="aucL" style="border-color:#fff"><div class="ln1">竞 平开 <span class="big">0.00%</span></div></div>';
    }
    const gapRow = (g) => {
      const z = (g.hi - g.lo) / g.mid < 0.0015 ? f2(g.mid) : f2(g.lo) + "–" + f2(g.hi);
      return '<div class="g' + (g.inG ? " in" : "") + '"><span class="ar" style="color:' + gC(g.bull) + '">' + (g.bull ? "↓" : "↑") + '</span><span><span class="z" style="color:' + gC(g.bull) + '">iv ' + z + "</span>"
        + (g.N >= 2 ? '<span class="tag tN">×' + g.N + "</span>" : "") + (g.inG ? '<span class="tag tIn">回补中·已回' + Math.round(g.prog * 100) + "%</span>" : "") + "</span>"
        + '<span class="r">' + (g.vsOp != null ? "距开盘 <b>" + sg(g.vsOp) + "</b>" : "") + "<br>距现价 <b>" + sg(g.dist) + "</b></span>"
        + (g.rt ? '<span class="n"><span>' + g.rt + "</span></span>" : "")
        + '<span class="tm">' + g.born.map((b) => "<span>" + LVN[b.lv] + " " + b.t.slice(4, 6) + "-" + b.t.slice(6, 8) + (b.t.length >= 12 ? " " + b.t.slice(8, 10) + ":" + b.t.slice(10, 12) : "") + "</span>").join("")
        + (g.touch.length ? g.touch.slice(-4).map((t) => "<span>" + t.slice(4, 6) + "-" + t.slice(6, 8) + " " + t.slice(8, 10) + ":" + t.slice(10, 12) + " 碰过</span>").join("") + (g.touch.length > 4 ? "<span>共碰 " + g.touch.length + " 次</span>" : "") : "") + "</span></div>";
    };
    const doneRow = (g) => '<div class="done"><span><span style="color:' + gC(g.bull) + '">' + (g.bull ? "↓" : "↑") + " iv " + f2(g.lo) + "–" + f2(g.hi) + "</span>" + (g.N >= 2 ? '<span class="tag tN">×' + g.N + "</span>" : "") + " " + g.lvs.map((l) => LVN[l]).join("+") + (g.old.length ? " <b>" + g.old.join(" ") + "形成</b>" : "") + '</span><span class="mono" style="white-space:nowrap">已补 ' + hm(g.ft) + " @" + f2(g.fp) + "</span></div>";
    const isNew = (g) => g.born.some((b) => b.t.slice(0, 8) === R.today);
    const fresh = R.grp.filter(isNew), old = R.grp.filter((g) => !isNew(g));
    h += '<div class="gScroll" tabindex="0" aria-label="缺口列表，上下滑动查看">'
      + '<div class="gSec"><b>未补 ' + old.length + '</b><span>同价周期已合并</span></div>'
      + (old.length ? old.map(gapRow).join("") : '<div class="gEmpty">无</div>')
      + '<div class="gSec new"><b>今日新增 ' + fresh.length + '</b><span>未补目标</span></div>'
      + (fresh.length ? fresh.map(gapRow).join("") : '<div class="gEmpty">无</div>')
      + '<div class="gSec doneH"><b>今日已补 ' + R.dgp.length + '</b><span>补回时间 / 价格</span></div>'
      + (R.dgp.length ? R.dgp.map(doneRow).join("") : '<div class="gEmpty">无</div>') + '</div>';
    h += '<div class="rateH"><b>今日回补率</b><span>已补/出现 · 盘中实时</span></div><div class="rate">'
      + LV.map((L) => "<div>" + LVN[L] + "<b>" + (R.tr[L].n ? Math.round(R.tr[L].k / R.tr[L].n * 100) + "%" : "—") + "</b>" + R.tr[L].k + "/" + R.tr[L].n + "</div>").join("") + "</div>";
    return h;
  }

  const ST = {};   /* code → {at, fly, R, err} */
  function paint(host, code) {
    let box = host.querySelector(":scope > .gvJL");
    if (!box) { host.innerHTML = ""; box = document.createElement("div"); box.className = "gvJL"; host.appendChild(box); }
    const s = ST[code], det = box.querySelector("details"), openDone = det ? det.open : !!(s && s.openDone);
    if (s) s.openDone = openDone;
    const h = s && s.R ? html(s.R, openDone) + (s.src === "em" ? '<div class="wait">数据源：东财备选（腾讯暂不可用）</div>' : "") :'<div class="wait">' + (s && s.err ? "缺口数据取不到：" + s.err + "（稍后自动重试）" : "缺口数据加载中…") + "</div>";
    if (box._h !== h) { box.innerHTML = h; box._h = h; const d2 = box.querySelector("details"); if (d2) d2.addEventListener("toggle", () => { if (ST[code]) ST[code].openDone = d2.open; });
      const a2 = box.querySelector(".aucL"), fb = box.querySelector(".gvFoldJL"); /* jl-1183: 折叠态记忆(会话级, ST[code].foldAuc)+点击切换 */
      if (a2 && fb) { if (s && s.foldAuc) { a2.classList.add("gvFolded"); fb.textContent = "▸"; }
        fb.addEventListener("click", (ev) => { ev.stopPropagation(); const f = a2.classList.toggle("gvFolded"); fb.textContent = f ? "▸" : "▾"; if (ST[code]) ST[code].foldAuc = f; }); } }
  }
  function render(host, code) {
    ensureCss();
    code = String(code).replace(/\D/g, "");
    host.onclick = (e) => e.stopPropagation();   /* 点这一块不翻卡、不触发原缺口行的展开 */
    host.setAttribute("data-gv", code);
    const s = ST[code] = ST[code] || { at: 0 };
    paint(host, code);
    if (s.fly || Date.now() - s.at < 60000) return;
    s.fly = 1;
    const c = pf(code);
    getAll(c).then((g) => {
      s.R = compute(code, ...g.r); s.src = g.src; s.err = ""; s.at = Date.now(); s.fly = 0;
      document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code));
    }).catch((e) => { s.err = e && e.message || "网络"; s.at = Date.now() - 45000; s.fly = 0; document.querySelectorAll('.hldGapRowJL[data-gv="' + code + '"]').forEach((el) => paint(el, code)); });
  }
  window.JLGapIV = { render, compute, _st: ST };
})();
