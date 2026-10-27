/* jl_card5d.js v1 (2026-10-27, 本地稿未推送) —— 持仓页五日图, 由验收页 ~/jinlin-accept/5day.html 定稿生成
   (生成脚本 ~/jinlin-accept/tools/build_card5d.py, 画法/手势/斐波与验收页一字不差, 只换外壳; 验收用的核对表不带)。
   数据: 腾讯五日分时 day/query, 只画 09:30–15:00。交易时段每 30 秒刷新, 不在看/正在拖/在画斐波时跳过。
   挂载: JLCard5D.show(code, name) —— 首次调用时把卡片插到持仓页小K线那块(#holdingChart 所在 section)前面并把那块藏起来;
   回滚: index.html 删 jl_card5d.js 引用即恢复原小K线, 其代码一行没删。 */
(function () {
  "use strict";
  const CSS = '#c5JL.card{background:transparent;border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:10px 8px;margin-bottom:10px}#c5JL .hd{display:flex;align-items:baseline;gap:8px;padding:0 3px}#c5JL .hd b{font-size:18px}#c5JL .hd .px{font:800 20px ui-monospace,Menlo,monospace;margin-left:auto}#c5JL .hd .pc{font:800 13px ui-monospace,Menlo,monospace}#c5JL .up{color:#ff5459}#c5JL .dn{color:#1fdc93}#c5JL .hd,#c5JL .info{position:relative;z-index:2;pointer-events:none}#c5JL .hd{text-shadow:0 1px 3px rgba(0,0,0,.6)}#c5JL .info{text-shadow:0 1px 3px rgba(0,0,0,.7)}#c5JL .info{height:18px;margin:6px 3px 2px;font:700 11.5px ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;display:flex;gap:8px}#c5JL .info span{opacity:1}#c5JL .box{margin-top:-62px;z-index:1;position:relative;touch-action:none;user-select:none;-webkit-user-select:none}#c5JL .box canvas{position:absolute;left:0;top:0;width:100%}#c5JL .tools{display:flex;justify-content:space-between;align-items:center;margin:6px 3px 0;font-size:11.5px}#c5JL .tools .tb{display:flex;gap:5px}#c5JL .tools button.on{background:#ffd84a;color:#1a0508;border-color:#ffd84a}#c5JL .tools button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:12px;padding:2px 10px;font:700 12px inherit}#c5JL .hd .px{font-size:28px!important}#c5JL .bad{color:#ff7a85}#c5JL .mono{font-family:ui-monospace,Menlo,monospace}';
  let ROOT = null, api = null, timer = 0;
  function mount() {
    if (ROOT) return true;
    const hc = document.getElementById("holdingChart"), sec = hc && hc.closest("section");
    if (!sec) return false;
    if (!document.getElementById("c5CssJL")) { const s = document.createElement("style"); s.id = "c5CssJL"; s.textContent = CSS; document.head.appendChild(s); }
    ROOT = document.createElement("section"); ROOT.id = "c5JL"; ROOT.className = "card"; ROOT.innerHTML = '<div class="hd"><b data-c5="nm">—</b><span class="mono" data-c5="cd"></span><span class="px" data-c5="px">—</span><span class="pc" data-c5="pc"></span></div><div class="info" data-c5="info"></div><div class="box" data-c5="box"><canvas data-c5="base"></canvas><canvas data-c5="ov"></canvas></div><div class="tools"><span class="tb"><button type="button" data-c5="auto">自动尺</button><button type="button" data-c5="fib">斐波</button><button type="button" data-c5="del">删除</button><button type="button" data-c5="clr">清空</button></span><button type="button" data-c5="rst">看全5天</button></div>';
    sec.parentNode.insertBefore(ROOT, sec);   /* 10-27 用户要求: 原小K线(分时实时走势+周期按钮)保留显示, 不再隐藏 */
    api = boot(ROOT);
    timer = setInterval(() => {
      try {
        const d = new Date(), m = d.getHours() * 60 + d.getMinutes(), w = d.getDay();
        if (w === 0 || w === 6 || m < 565 || m > 905 || document.hidden || !ROOT.offsetParent) return;
        api.tick();
      } catch (e) { }
    }, 30000);
    return true;
  }
  function boot(ROOT) {
    const $ = (k) => ROOT.querySelector('[data-c5="' + k + '"]');
    /* 数据: 腾讯五日分时 day/query(每天 prec=昨收) + 日K fqkline 做核对。只画 09:30–15:00, 15:00 后盘后固定价不画。 */
    let code = "", NAME = "";
    const pf = (c) => (/^[569]/.test(c) ? "sh" : "sz") + c;
    const f2 = (x) => (+x).toFixed(2), sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
    const WK = "日一二三四五六";
    const idx = (t) => { const mm = +t.slice(0, 2) * 60 + +t.slice(2, 4); return mm <= 690 ? Math.max(0, mm - 570) : Math.min(240, 120 + (mm - 780)); };
    const tOf = (k) => { const mm = k <= 120 ? 570 + k : 780 + (k - 120); return String(Math.floor(mm / 60)).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0"); };
    async function J(u) { const r = await fetch(u + (u.includes("?") ? "&" : "?") + "_t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }

    let S = null;   /* {days:[{date,prec,pts:[{k,p,v,avg}]}], P:[全部点], gaps:[...]} */
    let view = { a: 0, b: 0 };   /* 可见点区间 [a,b) */
    let cross = null;

    async function load(keep) {
      const c = pf(code);
      const [d5, dkr] = await Promise.all([J("https://web.ifzq.gtimg.cn/appstock/app/day/query?code=" + c), J("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" + c + ",day,,,10,qfq").catch(() => J("https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?param=" + c + ",day,,,10,qfq"))]);
      const raw = d5.data[c].data.slice().reverse(), dk = (dkr.data[c].qfqday || dkr.data[c].day).map((r) => ({ t: r[0].replace(/-/g, ""), o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] }));
      const days = [], P = [];
      raw.forEach((d, di) => {
        let pv = 0, pa = 0, tot = 0; const pts = [];
        d.data.forEach((s) => {
          const a = s.split(" "); if (a[0] > "1500") return; tot = Math.max(tot, +a[2]);   /* 15:00 后是盘后数据, 日K不含 */
          const cv = +a[1 + 1], ca = +a[3], v = cv - pv; pv = cv; pa = ca;
          pts.push({ di, k: idx(a[0]), t: a[0], p: +a[1], v: Math.max(0, v), avg: cv > 0 ? ca / cv / 100 : +a[1] });
        });
        days.push({ date: d.date, prec: +d.prec, pts, open: pts.length ? pts[0].p : null, av: pts.length ? pts[0].v : 0, tot });
        pts.forEach((p) => { p.g = P.length; P.push(p); });
      });
      /* 开盘跳空(昨收→今开): 往后找第一次碰到昨收的那一分钟 = 补回; 没碰到 = 未补, 一直往右 */
      const gaps = [];
      days.forEach((d, di) => {
        if (!d.open || Math.abs(d.open / d.prec - 1) < 0.001) return;
        const up = d.open > d.prec, st = d.pts[0].g; let fi = -1;
        for (let g = st; g < P.length; g++) if (up ? P[g].p <= d.prec : P[g].p >= d.prec) { fi = g; break; }
        gaps.push({ di, up, lo: Math.min(d.prec, d.open), hi: Math.max(d.prec, d.open), st, fi, pct: (d.open / d.prec - 1) * 100 });
      });
      const LD = days[days.length - 1]; if (LD) LD._auto = LD.pts.length ? autoCalc(LD.pts.map((p) => p.p)) : null;   /* 自动尺: 首点 09:30 = 开盘竞价价 */
      if (autoOn) bollGet(c);
      const old = S, oldN = old ? old.P.length : 0;
      S = { days, P, gaps, dk, qt: d5.data[c].qt && d5.data[c].qt[c], code: c };
      /* 定时刷新: 同一只票保持当前缩放; 原来贴着最右(看最新)就继续贴着最右 */
      if (keep && old && old.code === c && view.b > view.a) { const n = view.b - view.a; view = view.b >= oldN ? { a: Math.max(0, P.length - n), b: P.length } : { a: Math.min(view.a, Math.max(0, P.length - n)), b: Math.min(view.b, P.length) }; }
      else { view = { a: 0, b: P.length }; fibLoad(); }
      head._k = "";
      head(); size(); drawBase(); drawOv();
    }

    function head() {
      if (!S) return;
      if (head._k === code + view.a + "|" + (S && S.P.length) && !cross) return; head._k = cross ? "" : code + view.a + "|" + (S && S.P.length);
      const L = S.days[S.days.length - 1], last = L.pts[L.pts.length - 1].p, ch = (last / L.prec - 1) * 100, cl = ch >= 0 ? "up" : "dn";
      $("nm").textContent = NAME; $("cd").textContent = code;
      $("px").textContent = f2(last); $("px").className = "px " + cl; $("pc").textContent = sg(ch); $("pc").className = "pc " + cl;
      $("info").innerHTML = (autoOn && L._auto ? '<span style="color:' + L._auto.st.col + '">' + L._auto.st.txt + "</span>" : "") + "<span>%以 " + L.date.slice(4, 6) + "-" + L.date.slice(6) + " 昨收 " + f2(L.prec) + " 为 0</span>";
    }

    /* 布局: 主图 + 量 + 日期轴; 右价格 左% */
    let G = {};
    function size() {
      const box = $("box"), W = box.clientWidth || 330, H = 362, dpr = Math.max(2, devicePixelRatio || 1);
      box.style.height = H + "px";
      ["base", "ov"].forEach((id) => { const c = $(id); c.width = W * dpr; c.height = H * dpr; c.style.height = H + "px"; c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0); });
      G = { W, H, l: 2, r: 2, t: 68, mainB: 276, volT: 284, volB: 340, axB: 358 };   /* 顶上 62px 是透明标题层: 价格数据从 68 开始, 斐波超出数据范围的档位可以画到标题底下 */   /* 刻度放图内(左%右价, 半透明小底), 不占宽度 */
      G.pw = W - G.l - G.r;
    }
    function scale() {
      const { a, b } = view, vis = S.P.slice(a, b), base = S.days[S.days.length - 1].prec;
      let lo = Infinity, hi = -Infinity, vmax = 1;
      vis.forEach((p) => { lo = Math.min(lo, p.p, p.avg); hi = Math.max(hi, p.p, p.avg); vmax = Math.max(vmax, p.v); });
      S.days.forEach((d, i) => { if (d.pts.length && d.pts[0].g >= a && d.pts[0].g < b) { lo = Math.min(lo, d.prec); hi = Math.max(hi, d.prec); } });
      const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
      const n = b - a;
      return { base, lo, hi, vmax, n,
        X: (g) => G.l + (g - a + 0.5) / n * G.pw,
        Y: (v) => G.t + (hi - v) / (hi - lo) * (G.mainB - G.t),
        V: (v) => G.volB - v / vmax * (G.volB - G.volT) };
    }

    let SC = null, LB = [];   /* SC=当前视图坐标(底图算一次, 十字线直接用); LB=已放置的文字框, 防重叠 */
    /* 放文字: 撞到已放的就上下挪一行, 挪不开就不画 */
    function put(x, t, X, Y, al, col) {
      const w = x.measureText(t).width, h = 11;
      for (const d of [0, 12, -12, 24, -24, 36]) {
        const y = Y + d, L = al === "right" ? X - w : al === "center" ? X - w / 2 : X, r = { L: L - 2, R: L + w + 2, T: y - h, B: y + 2 };
        if (r.T < G.t || r.B > G.mainB) continue;
        if (LB.some((q) => r.L < q.R && r.R > q.L && r.T < q.B && r.B > q.T)) continue;
        LB.push(r); x.fillStyle = col; x.textAlign = "left"; x.fillText(t, L, y); return true;
      }
      return false;
    }
    function drawBase() {
      const x = $("base").getContext("2d"), s = SC = scale(), { a, b } = view;
      LB = [];
      x.clearRect(0, 0, G.W, G.H);
      /* 横线: 只画 昨收(0%) 一条 + 上下各两条淡白点线; 不用灰色 */
      x.lineWidth = 1;
      const step = niceStep((s.hi - s.lo) / 4);
      for (let v = Math.ceil(s.lo / step) * step; v <= s.hi; v += step) { const y = s.Y(v); if (y < G.t + 8 || y > G.mainB - 6) continue; LB.push({ L: G.l + G.pw - 48, R: G.l + G.pw, T: y - 9, B: y + 9 }, { L: G.l, R: G.l + 56, T: y - 9, B: y + 9 }); }
      for (let v = Math.ceil(s.lo / step) * step; v <= s.hi; v += step) { const y = Math.round(s.Y(v)) + 0.5; x.strokeStyle = "rgba(255,255,255,.08)"; x.setLineDash([1, 3]); line(x, G.l, y, G.l + G.pw, y); }
      x.setLineDash([]);
      /* 日界竖线 + 日期 */
      S.days.forEach((d, i) => {
        if (!d.pts.length) return; const g0 = d.pts[0].g, g1 = d.pts[d.pts.length - 1].g;
        if (g1 < a || g0 >= b) return;
        if (i && g0 >= a) { const xx = Math.round(s.X(g0) - 0.5 * G.pw / s.n) + 0.5; x.strokeStyle = "rgba(255,255,255,.35)"; x.setLineDash([3, 3]); line(x, xx, G.t, xx, G.volB); x.setLineDash([]); }
        const xm = (s.X(Math.max(a, g0)) + s.X(Math.min(b - 1, g1))) / 2, dt = new Date(+d.date.slice(0, 4), +d.date.slice(4, 6) - 1, +d.date.slice(6));
        x.font = "700 10.5px -apple-system,PingFang SC"; x.fillStyle = "#fff"; x.textAlign = "center";
        x.fillText(d.date.slice(4, 6) + "-" + d.date.slice(6) + " 周" + WK[dt.getDay()], xm, G.axB - 4);
      });
      /* 跳空带: 未补=延伸到最右, 已补=停在补回那一分钟 + ✓签 */
      S.gaps.forEach((gp) => {
        const e = gp.fi < 0 ? b - 1 : gp.fi; if (e < a || gp.st >= b) return;
        const c = gp.up ? "0,240,255" : "255,230,0", x0 = s.X(Math.max(a, gp.st)), x1 = s.X(Math.min(b - 1, e)), y1 = s.Y(gp.hi), y2 = s.Y(gp.lo);
        x.fillStyle = "rgba(" + c + "," + (gp.fi < 0 ? 0.20 : 0.10) + ")"; x.fillRect(x0, y1, Math.max(1, x1 - x0), y2 - y1);
        gp._lab = { c: "rgb(" + c + ")", x1, y1, y2 };
      });
      /* 量: 真实每分钟量, 跟着价格涨跌着色 */
      const bw = Math.max(1, G.pw / s.n * 0.8);
      for (let g = a; g < b; g++) { const p = S.P[g], pp = S.P[g - 1], up = !pp || pp.di !== p.di ? p.p >= S.days[p.di].prec : p.p >= pp.p; x.fillStyle = up ? "rgba(255,84,89,.55)" : "rgba(31,220,147,.55)"; const y = s.V(p.v); x.fillRect(s.X(g) - bw / 2, y, bw, G.volB - y); }
      tag(x, wan(s.vmax) + "手", G.l + 1, G.volT + 6, "left", "#fff", 1);
      /* 每天: 昨收短虚线 + 均价线(黄) + 价格线(白) + 竞价点 + 跳空竖线 */
      S.days.forEach((d) => {
        const vis = d.pts.filter((p) => p.g >= a && p.g < b); if (!vis.length) return;
        const xa = s.X(vis[0].g), xb = s.X(vis[vis.length - 1].g);
        x.strokeStyle = "rgba(255,255,255,.55)"; x.setLineDash([2, 3]); line(x, xa, s.Y(d.prec), xb, s.Y(d.prec)); x.setLineDash([]);
        x.lineWidth = 1; x.strokeStyle = "#ffd84a"; path(x, vis, (p) => s.X(p.g), (p) => s.Y(p.avg));
        x.lineWidth = 1.4; x.strokeStyle = "#fff"; path(x, vis, (p) => s.X(p.g), (p) => s.Y(p.p));
        const p0 = d.pts[0]; if (p0.g >= a && p0.g < b) {
          const xx = s.X(p0.g), up = p0.p >= d.prec, col = up ? "#ff5459" : "#1fdc93";
          x.strokeStyle = col; x.lineWidth = 2; line(x, xx, s.Y(d.prec), xx, s.Y(p0.p)); x.lineWidth = 1;
          x.fillStyle = col; x.beginPath(); x.arc(xx, s.Y(p0.p), 3, 0, 7); x.fill(); x.strokeStyle = "#fff"; x.stroke();
          d._lab = { t: "竞" + sg((p0.p / d.prec - 1) * 100), x: xx + 5, y: s.Y(p0.p) + (up ? -5 : 12), c: col };
        }
      });
      /* 右价格 / 左%(图内, 半透明底): %颜色跟着正负变 */
      for (let v = Math.ceil(s.lo / step) * step; v <= s.hi; v += step) {
        const y = s.Y(v); if (y < G.t + 8 || y > G.mainB - 6) continue; const pc = (v / s.base - 1) * 100;
        tag(x, f2(v), G.l + G.pw - 1, y, "right", "#fff", 1);
        tag(x, sg(pc), G.l + 1, y, "left", Math.abs(pc) < 0.005 ? "#fff" : pc > 0 ? "#ff5459" : "#1fdc93", 1);
      }
      /* 文字最后统一放, 互相避让: 竞价% → 已补✓ → 未补日期 */
      x.font = "800 9.5px -apple-system";
      S.days.forEach((d) => { if (d._lab && d.pts[0].g >= a && d.pts[0].g < b) put(x, d._lab.t, d._lab.x, d._lab.y, "left", d._lab.c); d._lab = null; });
      S.gaps.forEach((gp) => {
        const L = gp._lab; gp._lab = null; if (!L) return;
        if (gp.fi >= 0 && gp.fi >= a && gp.fi < b) { const P = S.P[gp.fi], d = S.days[P.di]; put(x, "✓" + (P.di !== gp.di ? d.date.slice(4, 6) + "-" + d.date.slice(6) + " " : "") + tOf(P.k) + " " + f2(S.days[gp.di].prec), L.x1 + 3, (gp.up ? L.y2 + 11 : L.y1 - 3), "left", L.c); }
        if (gp.fi < 0) { const d = S.days[gp.di]; put(x, d.date.slice(4, 6) + "-" + d.date.slice(6) + " 未补", G.l + G.pw - 52, L.y1 - 3, "right", L.c); }
      });
      drawAuto(x, s);
      drawFibs(x, s);
    }
    /* ===== 斐波那契画线: 两点(按下=0, 松开=1), 存在 localStorage, 按分钟序号+价格记, 缩放平移都跟着走 ===== */
    const FL = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
    const FC = { 0: "#ffffff", 0.236: "#ff5459", 0.382: "#ffb347", 0.5: "#4dffbf", 0.618: "#00f0ff", 0.786: "#7aa8ff", 1: "#ffffff", 1.272: "#ffd84a", 1.618: "#ff7ad9" };
    let FIB = [], fibMode = false, fibDraft = null, fibSel = -1;
    const fibKey = () => "jl5d_fib_" + code;
    function fibLoad() { try { FIB = JSON.parse(localStorage.getItem(fibKey()) || "[]"); } catch (e) { FIB = []; } fibSel = -1; }
    function fibSave() { try { localStorage.setItem(fibKey(), JSON.stringify(FIB)); } catch (e) { } }
    function drawFibs(x, s) { FIB.forEach((f, i) => drawFib(x, s, f, i === fibSel)); if (fibDraft && fibDraft.b) drawFib(x, s, fibDraft, true); }
    function drawFib(x, s, f, sel) {
      const xa = s.X(f.a.g), xb = s.X(f.b.g), xL = Math.min(xa, xb), xR = G.l + G.pw, d = f.b.v - f.a.v;
      if (xR < G.l) return;
      x.save(); x.beginPath(); x.rect(G.l, 0, G.pw, G.mainB); x.clip();
      /* 档与档之间淡色带 */
      for (let i = 0; i < FL.length - 1; i++) { const y1 = s.Y(f.b.v - d * FL[i]), y2 = s.Y(f.b.v - d * FL[i + 1]); x.fillStyle = FC[FL[i + 1]]; x.globalAlpha = sel ? 0.10 : 0.06; x.fillRect(xL, Math.min(y1, y2), xR - xL, Math.abs(y2 - y1)); }
      x.globalAlpha = 1;
      /* 两锚点斜虚线 */
      x.strokeStyle = "rgba(255,255,255,.7)"; x.setLineDash([4, 3]); line(x, xa, s.Y(f.a.v), xb, s.Y(f.b.v)); x.setLineDash([]);
      x.font = "700 9.5px ui-monospace,Menlo"; x.textAlign = "left";
      FL.forEach((r) => {
        const v = f.b.v - d * r, y = Math.round(s.Y(v)) + 0.5; if (y < 2 || y > G.mainB) return;
        x.strokeStyle = FC[r]; x.lineWidth = sel ? 1.4 : 1; line(x, xL, y, xR, y);
        x.fillStyle = FC[r]; x.fillText(r + " (" + f2(v) + ")", xL + 3, y - 2);
      });
      [f.a, f.b].forEach((p) => { x.fillStyle = "#fff"; x.strokeStyle = "#2962ff"; x.lineWidth = 2; x.beginPath(); x.arc(s.X(p.g), s.Y(p.v), sel ? 4.5 : 3.5, 0, 7); x.fill(); x.stroke(); });
      x.restore(); x.lineWidth = 1;
    }
    /* ===== 自动尺(10-27 用户确认): 分时口径, 规则同 jl_fibchain.js tsCompute, 只给最后一个交易日放 =====
       尺A: 1 = 当天到目前最高(开盘价起算, 冲过开盘 0.4% 以上才换新高); 最高之后的最低比最高之前的低 → 0 = 最高之后的最低(看反弹),
            否则 0 = 最高之前的最低(看回撤); 1、0 相差不到 0.4% 不放。
       尺B: 0 = 当天最低, 1 = 最低之后第一个小高点(高出最低 0.3% 以上、比前后都高、之后回落 0.15% 前没被突破), 往上推 1.272~4.618。
       下拉尺: 尺A 是反弹尺、反弹到过 0.382 以上、现价又跌回 0.236 下方 → 0 = 最高, 1 = 最低, 往下看 1.272/1.618/2.618。
       15/30分 BOLL(20,2) 上下沿一起算: 0.2% 内不同来源 ≥2 = 金色共振带 ×N; 跟今日高/低 0.1% 内的档不画。
       五日数据只有分钟价, 没有影线: 反弹到哪一档按分钟价最高算(tsCompute 用的是影线最高)。 */
    const AR = [0.236, 0.382, 0.5, 0.618, 0.786, 0.886], AB = [1.272, 1.618, 2.618, 3.618, 4.618], AD = [1.272, 1.618, 2.618];
    const ACOL = { 0.786: "#ffd84a", 0.618: "#ffb347", 0.382: "#6fb6ff", 0.5: "#d7a8ff" };
    let autoOn = localStorage.getItem("jl5d_auto") !== "0";
    const BC = {};
    function autoCalc(Pr) {
      const N = Pr.length; if (N < 4) return null;
      const op = Pr[0];
      let iH = 0; for (let k = 1; k < N; k++) if (Pr[k] > Pr[iH] && (iH !== 0 || Pr[k] >= op * 1.004)) iH = k;
      let iLa = -1, iLb = -1;
      for (let k = iH + 1; k < N; k++) if (iLa < 0 || Pr[k] < Pr[iLa]) iLa = k;
      for (let k = 0; k < iH; k++) if (iLb < 0 || Pr[k] < Pr[iLb]) iLb = k;
      let i0, kind;
      if (iLa >= 0 && (iLb < 0 || Pr[iLa] < Pr[iLb])) { i0 = iLa; kind = "反弹"; } else if (iLb >= 0) { i0 = iLb; kind = "回撤"; } else return null;
      const H = Pr[iH], L0 = Pr[i0], g = H - L0;
      if (!(g > H * 0.004)) return null;
      const A = { a: { k: i0, p: L0 }, b: { k: iH, p: H }, at: (r) => L0 + g * r };
      let iL = 0; for (let k = 1; k < N; k++) if (Pr[k] < Pr[iL]) iL = k;
      let B = null;
      for (let k = iL + 1; k < N - 1; k++) {
        if (!(Pr[k] > Pr[k - 1] && Pr[k] >= Pr[k + 1])) continue;
        if (Pr[k] < Pr[iL] * 1.003) continue;
        let ok = false;
        for (let j = k + 1; j < N; j++) { if (Pr[j] > Pr[k]) break; if (Pr[j] <= Pr[k] * 0.9985) { ok = true; break; } }
        if (ok) { const lo = Pr[iL], gb = Pr[k] - lo; B = { a: { k: iL, p: lo }, b: { k, p: Pr[k] }, at: (r) => lo + gb * r }; break; }
      }
      const P = Pr[N - 1];
      let reb = -Infinity; if (kind === "反弹") for (let k = Math.max(1, i0); k < N; k++) reb = Math.max(reb, Pr[k]);
      const rebR = kind === "反弹" ? (reb - L0) / g : null;
      let D = null;
      if (kind === "反弹" && rebR >= 0.382 && P < A.at(0.236)) D = { a: { k: iH, p: H }, b: { k: i0, p: L0 }, at: (r) => H - g * r };
      const hitR = rebR == null ? null : [0.886, 0.786, 0.618, 0.5, 0.382].find((r) => rebR >= r - 0.015);
      let st;
      if (D) st = { txt: "反弹到 " + hitR + " 后回落 → 看下拉尺", col: "#3fe6ab" };
      else if (kind === "反弹") st = hitR ? { txt: "反弹到过 " + hitR + (P < A.at(hitR) ? " · 回落中" : ""), col: hitR >= 0.786 ? "#ffd84a" : "#fff" } : { txt: "反弹未到 0.382", col: "#fff" };
      else st = { txt: "冲过开盘 · 回撤看 0.382 / 0.618", col: "#fff" };
      return { P, A, B, D, kind, st };
    }
    function bb(cl) { if (cl.length < 20) return null; const c = cl.slice(-20), m = c.reduce((a, b) => a + b, 0) / 20, sd = Math.sqrt(c.reduce((a, b) => a + (b - m) * (b - m), 0) / 20); return { up: m + 2 * sd, dn: m - 2 * sd }; }
    /* 15/30分K: 腾讯 mkline 行 = [时间, 开, 收, 高, 低, 量]; 每只票 60 秒内不重取 */
    function bollGet(c) {
      const o = BC[c] || (BC[c] = { at: 0, fly: 0 }); if (o.fly || Date.now() - o.at < 6e4) return;
      o.fly = 1;
      Promise.all(["m15", "m30"].map((k) => J("https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=" + c + "," + k + ",,40").then((j) => { o[k] = bb((j.data[c][k] || []).map((r) => +r[2])); }).catch(() => { })))
        .then(() => { o.fly = 0; o.at = Date.now(); if (S && S.code === c && autoOn) reqB(); });
    }
    function drawAuto(x, s) {
      if (!autoOn || !S) return;
      const d = S.days[S.days.length - 1], r = d && d._auto; if (!r) return;
      const g0 = d.pts[0].g, X = (k) => s.X(g0 + k), xR = G.l + G.pw, bc = BC[S.code] || {}, lv = [];
      AR.forEach((q) => lv.push({ v: r.A.at(q), t: String(q), c: ACOL[q] || "#c9dfe8", src: "A", xs: X(Math.min(r.A.a.k, r.A.b.k)) }));
      if (r.B) AB.forEach((q) => lv.push({ v: r.B.at(q), t: "小" + q, c: "#7ff2e0", src: "B", xs: X(r.B.b.k) }));
      if (r.D) AD.forEach((q) => lv.push({ v: r.D.at(q), t: "↓" + q, c: "#3fe6ab", src: "D", xs: X(r.A.a.k), dash: [6, 4] }));
      [["m15", "15分"], ["m30", "30分"]].forEach(([k, nm]) => { const b = bc[k]; if (!b) return; lv.push({ v: b.up, t: nm + "上沿", c: "#ff8f8f", src: k, xs: X(0), dash: [2, 3] }, { v: b.dn, t: nm + "下沿", c: "#8fe9c4", src: k, xs: X(0), dash: [2, 3] }); });
      let dHi = -Infinity, dLo = Infinity; d.pts.forEach((p) => { dHi = Math.max(dHi, p.p); dLo = Math.min(dLo, p.p); });
      const use = lv.filter((l) => l.v > 0 && !(Math.abs(l.v / dHi - 1) < 0.001 || Math.abs(l.v / dLo - 1) < 0.001));
      /* 共振: 0.2% 内不同来源 ≥2 */
      const Z = [];
      use.slice().sort((a, b) => a.v - b.v).forEach((l) => { const z = Z[Z.length - 1]; if (z && l.v <= z.v0 * 1.002) z.m.push(l); else Z.push({ v0: l.v, m: [l] }); });
      const zones = Z.map((z) => ({ lo: Math.min(...z.m.map((m) => m.v)), hi: Math.max(...z.m.map((m) => m.v)), n: new Set(z.m.map((m) => m.src)).size, m: z.m, xs: Math.min(...z.m.map((m) => m.xs)) })).filter((z) => z.n >= 2);
      x.save(); x.beginPath(); x.rect(G.l, 0, G.pw, G.mainB); x.clip();
      zones.forEach((z) => { const ya = s.Y(z.hi) - 3, yb = s.Y(z.lo) + 3; x.save(); x.shadowColor = "rgba(255,216,74,.9)"; x.shadowBlur = 10; x.fillStyle = "rgba(255,216,74,.22)"; x.fillRect(z.xs, ya, xR - z.xs, Math.max(4, yb - ya)); x.restore(); });
      /* 尺A 两个锚点: 虚线连起来, 0 / 1 各一个小圈 */
      x.strokeStyle = "rgba(255,255,255,.5)"; x.setLineDash([2, 3]); line(x, X(r.A.a.k), s.Y(r.A.a.p), X(r.A.b.k), s.Y(r.A.b.p)); x.setLineDash([]);
      [r.A.a, r.A.b].forEach((p) => { x.strokeStyle = "#ffd84a"; x.lineWidth = 1.5; x.beginPath(); x.arc(X(p.k), s.Y(p.p), 3, 0, 7); x.stroke(); });
      x.lineWidth = 1;
      use.forEach((l) => { const y = Math.round(s.Y(l.v)) + 0.5; if (y < 2 || y > G.mainB) return; x.strokeStyle = l.c; x.globalAlpha = l.dash && l.src !== "D" ? 0.75 : 0.85; x.setLineDash(l.dash || []); line(x, Math.max(G.l, l.xs), y, xR, y); x.setLineDash([]); x.globalAlpha = 1; });
      x.restore();
      /* 文字: 共振处只出一个金色「×N 价 来源」, 其余各自一个, 用 put 互相避让 */
      x.font = "800 9.5px ui-monospace,Menlo";
      zones.forEach((z) => { const vm = (z.lo + z.hi) / 2; put(x, "×" + z.n + " " + f2(vm) + " " + z.m.map((m) => m.t).join("+"), Math.max(G.l + 2, z.xs + 3), s.Y(vm) - 4, "left", "#ffd84a"); });
      use.forEach((l) => { if (zones.some((z) => l.v >= z.lo - 1e-9 && l.v <= z.hi + 1e-9)) return; put(x, l.t + " " + f2(l.v), Math.max(G.l + 2, l.xs + 3), s.Y(l.v) - 2, "left", l.c); });
    }
    /* 屏幕点 → {g, v}; 靠近价格线 12px 内吸附到当分钟价格 */
    function toPt(p) {
      const s = SC, g = Math.max(view.a, Math.min(view.b - 1, Math.round(view.a + (p.x - G.l) / G.pw * s.n - 0.5)));
      let v = s.hi - (p.y - G.t) / (G.mainB - G.t) * (s.hi - s.lo);   /* p.y 在标题层里(<G.t)时照样换算成高于数据范围的价格 */ const pv = S.P[g].p;
      if (Math.abs(s.Y(pv) - p.y) < 12) v = pv;
      return { g, v: +v.toFixed(3) };
    }
    /* 按到画线: 两端圆点 12px 内 = 拖这个点; 线身 8px 内 = 整条平移 */
    function fibGrab(p) {
      const s = SC;
      for (let i = FIB.length - 1; i >= 0; i--) { const f = FIB[i]; for (const k of ["a", "b"]) if (Math.hypot(s.X(f[k].g) - p.x, s.Y(f[k].v) - p.y) < 12) return { i, k }; }
      const h = fibHit(p); return h >= 0 ? { i: h, k: "all" } : null;
    }
    function fibHit(p) {
      const s = SC;
      for (let i = FIB.length - 1; i >= 0; i--) { const f = FIB[i], d = f.b.v - f.a.v, xL = Math.min(s.X(f.a.g), s.X(f.b.g)); if (p.x < xL - 6) continue; if (FL.some((r) => Math.abs(s.Y(f.b.v - d * r) - p.y) < 8)) return i; }
      return -1;
    }
    function drawOv() {
      if (!S || !SC) return;
      const x = $("ov").getContext("2d"); x.clearRect(0, 0, G.W, G.H);
      if (fibDraft && fibDraft.b) { drawFib(x, SC, fibDraft, true); }
      if (!cross || !SC) { head(); return; }
      head._k = "";
      const s = SC, g = Math.max(view.a, Math.min(view.b - 1, Math.round(view.a + (cross.x - G.l) / G.pw * s.n - 0.5))), p = S.P[g], d = S.days[p.di];
      const xx = Math.round(s.X(g)) + 0.5, cy = Math.max(G.t, Math.min(G.mainB, cross.y)), yy = Math.round(cy) + 0.5, vy = s.hi - (cy - G.t) / (G.mainB - G.t) * (s.hi - s.lo);
      /* 竖线对齐到分钟, 横线跟着手指走(像 TradingView), 价格线上那一分钟打白点 */
      x.strokeStyle = "rgba(255,255,255,.8)"; x.setLineDash([3, 3]); line(x, xx, G.t, xx, G.volB); line(x, G.l, yy, G.l + G.pw, yy); x.setLineDash([]);
      x.fillStyle = "#fff"; x.beginPath(); x.arc(xx, s.Y(p.p), 3, 0, 7); x.fill();
      { const bw = Math.max(2, G.pw / s.n * 0.8), vy = s.V(p.v); x.fillStyle = "#fff"; x.fillRect(xx - bw / 2, vy, bw, G.volB - vy); tag(x, p.v + "手", Math.min(G.l + G.pw - 30, xx + 4), Math.max(G.volT + 6, vy - 7), "left", "#fff", 1); }
      const pc = (vy / s.base - 1) * 100, pcD = (p.p / d.prec - 1) * 100, col = pc >= 0 ? "#ff5459" : "#1fdc93";
      tag(x, f2(vy), G.l + G.pw - 1, yy, "right", "#fff");
      tag(x, sg(pc), G.l + 1, yy, "left", col);
      tag(x, d.date.slice(4, 6) + "-" + d.date.slice(6) + " " + tOf(p.k), Math.max(G.l + 34, Math.min(G.l + G.pw - 34, xx)), G.axB - 8, "center", "#fff");
      $("info").innerHTML = '<span>' + d.date.slice(4, 6) + "-" + d.date.slice(6) + " " + tOf(p.k) + '</span><span>价 ' + f2(p.p) + '</span><span class="' + (pcD >= 0 ? "up" : "dn") + '">当日' + sg(pcD) + '</span><span style="color:#ffd84a">均 ' + f2(p.avg) + "</span><span>量 " + p.v + "手</span>";
    }
    function tag(x, t, X, Y, al, col, soft) {
      x.font = (soft ? "700 9.5px" : "800 10px") + " ui-monospace,Menlo"; const w = x.measureText(t).width + (soft ? 6 : 8), h = soft ? 13 : 15;
      const L = al === "left" ? X : al === "right" ? X - w : X - w / 2;
      x.fillStyle = soft ? "rgba(30,12,24,.45)" : "rgba(20,10,20,.62)"; rr(x, L, Y - h / 2, w, h, 4); x.fill(); if (!soft) { x.strokeStyle = col; x.lineWidth = 1; x.stroke(); }
      x.fillStyle = col; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(t, L + w / 2, Y + 0.5); x.textBaseline = "alphabetic";
    }
    function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
    function line(x, a, b, c, d) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); }
    function path(x, arr, fx, fy) { x.beginPath(); arr.forEach((p, i) => (i ? x.lineTo(fx(p), fy(p)) : x.moveTo(fx(p), fy(p)))); x.stroke(); }
    function wan(v) { return v >= 1e4 ? (v / 1e4).toFixed(2) + "万" : String(Math.round(v)); }
    function niceStep(r) { const e = Math.pow(10, Math.floor(Math.log10(r))), m = r / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }

    /* 手势(手机): 一指按下十字线立刻跟手; 两指=缩放+平移。电脑: 鼠标悬停=十字线, 按住拖=平移, 滚轮=缩放。
       斐波模式: 按下=0点, 拖到松开=1点。不在斐波模式时轻点画线=选中, 再点「删除」删掉它。十字线只重画上层, 底图不动 */
    const box = $("box"); let pd = null, pts = new Map(), pinch = null, rafO = 0, rafB = 0;
    const reqO = () => { if (!rafO) rafO = requestAnimationFrame(() => { rafO = 0; drawOv(); }); };
    const reqB = () => { if (!rafB) rafB = requestAnimationFrame(() => { rafB = 0; drawBase(); drawOv(); }); };
    let BR = null; const loc = (e) => { const r = BR || box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    box.addEventListener("pointerdown", (e) => {
      if (!S || !SC) return;
      BR = box.getBoundingClientRect(); try { box.setPointerCapture(e.pointerId); } catch (er) { } const p = loc(e); pts.set(e.pointerId, p);
      if (pts.size === 2) { const [u, v] = [...pts.values()]; pinch = { d: Math.abs(u.x - v.x) || 1, a: view.a, b: view.b, cx: (u.x + v.x) / 2 }; pd = null; fibDraft = null; cross = null; reqO(); return; }
      const mouse = e.pointerType === "mouse";
      pd = { x: p.x, y: p.y, a: view.a, b: view.b, moved: false, t: performance.now(), mouse };
      if (fibMode) { fibDraft = { a: toPt(p), b: null }; cross = p; reqO(); return; }
      const gr = fibGrab(p);
      if (gr) { const f = FIB[gr.i]; pd.grab = Object.assign(gr, { a0: Object.assign({}, f.a), b0: Object.assign({}, f.b), p0: toPt(p) }); fibSel = gr.i; cross = null; reqB(); return; }
      if (!mouse) { cross = p; reqO(); }
    });
    box.addEventListener("pointermove", (e) => {
      if (!S || !SC) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null, last = evs && evs.length ? evs[evs.length - 1] : e, p = loc(last);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) { const [u, v] = [...pts.values()], k = pinch.d / (Math.abs(u.x - v.x) || 1), cx = (u.x + v.x) / 2, n = pinch.b - pinch.a, sh = Math.round(-(cx - pinch.cx) / G.pw * n); zoomTo(pinch.a + sh, pinch.b + sh, k, pinch.cx); return; }
      if (Math.abs(p.x - (pd ? pd.x : p.x)) > 5 || Math.abs(p.y - (pd ? pd.y : p.y)) > 5) pd && (pd.moved = true);
      if (fibDraft) { fibDraft.b = toPt(p); cross = p; reqO(); return; }
      if (pd && pd.grab) {
        const G2 = pd.grab, f = FIB[G2.i], q = toPt(p);
        if (G2.k === "all") { const dg = q.g - G2.p0.g, dv = q.v - G2.p0.v, cl = (g) => Math.max(0, Math.min(S.P.length - 1, g));
          f.a = { g: cl(G2.a0.g + dg), v: +(G2.a0.v + dv).toFixed(3) }; f.b = { g: cl(G2.b0.g + dg), v: +(G2.b0.v + dv).toFixed(3) }; }
        else f[G2.k] = q;
        reqB(); return;
      }
      if (pd && pd.mouse) { if (pd.moved) { const n = pd.b - pd.a, sh = Math.round(-(p.x - pd.x) / G.pw * n); setView(pd.a + sh, pd.b + sh); } return; }
      cross = p; reqO();
    });
    const up = (e) => {
      if (!S || !SC) { pd = null; return; }
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (fibDraft) { if (fibDraft.b && Math.abs(SC.Y(fibDraft.b.v) - SC.Y(fibDraft.a.v)) > 6) { FIB.push(fibDraft); fibSel = FIB.length - 1; fibSave(); setFib(false); } fibDraft = null; reqB(); }
      else if (pd && pd.grab) { fibSave(); reqB(); }
      else if (pd && !pd.moved && performance.now() - pd.t < 300) { const h = fibHit(loc(e)); if (h !== fibSel) { fibSel = h; reqB(); } }
      if (pd && !pd.mouse) { cross = null; reqO(); }
      pd = null;
    };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    box.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !pd) { cross = null; reqO(); } });
    box.addEventListener("pointerenter", () => { BR = box.getBoundingClientRect(); });
    addEventListener("scroll", () => { BR = null; }, { passive: true });
    box.addEventListener("wheel", (e) => { if (!(e.metaKey)) return; /* 10-27: 普通滚动放行给页面, 只有 Ctrl/Cmd+滚轮或触控板捏合才缩放 */ e.preventDefault(); zoomTo(view.a, view.b, e.deltaY > 0 ? 1.15 : 1 / 1.15, loc(e).x); }, { passive: false });
    function setFib(on) { fibMode = on; $("fib").classList.toggle("on", on); }
    $("fib").onclick = () => setFib(!fibMode);
    $("auto").classList.toggle("on", autoOn);
    $("auto").onclick = () => { autoOn = !autoOn; try { localStorage.setItem("jl5d_auto", autoOn ? "1" : "0"); } catch (e) { } $("auto").classList.toggle("on", autoOn); if (S) { if (autoOn) bollGet(S.code); head._k = ""; head(); reqB(); } };
    $("del").onclick = () => { if (!FIB.length) return; FIB.splice(fibSel >= 0 ? fibSel : FIB.length - 1, 1); fibSel = -1; fibSave(); reqB(); };
    $("clr").onclick = () => { if (!FIB.length || !confirm("清空这只股票的全部斐波画线？")) return; FIB = []; fibSel = -1; fibSave(); reqB(); };
    function zoomTo(a, b, k, cx) { const n = b - a, m = Math.max(60, Math.min(S.P.length, Math.round(n * k))), f = Math.max(0, Math.min(1, (cx - G.l) / G.pw)), c = a + n * f; setView(Math.round(c - m * f), Math.round(c - m * f) + m); }
    function setView(a, b) { const n = b - a; if (a < 0) { a = 0; b = n; } if (b > S.P.length) { b = S.P.length; a = b - n; } if (a === view.a && b === view.b) return; view = { a: Math.max(0, a), b }; reqB(); }
    $("rst").onclick = () => { if (S) { view = { a: 0, b: S.P.length }; reqB(); } };
    addEventListener("resize", () => { if (S && ROOT.offsetParent) { size(); drawBase(); drawOv(); } });
    return {
      set(c, n) { if (c === code) { if (n) { NAME = n; head._k = ""; head(); } return; } code = c; NAME = n || c; S = null; SC = null; cross = null; fibDraft = null; setFib(false); $("info").innerHTML = "<span>五日分时加载中…</span>"; load().catch((e) => { $("info").innerHTML = "<span>五日分时取不到：" + (e && e.message || "网络") + "</span>"; }); },
      tick() { if (!code || pd || fibMode || fibDraft) return; load(true).catch(() => { }); }
    };
  }
  window.JLCard5D = {
    show(code, name) { try { code = String(code || "").replace(/\D/g, ""); if (!code || !mount()) return; api.set(code, name); } catch (e) { if (window.console) console.warn("[card5d]", e); } }
  };
})();
