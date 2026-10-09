#!/usr/bin/env python3
# _b17.py — v0.82.2/sw v98 六修批(反馈逐项修)
# ①财联社外跳 www.cls.cn(手机UA 302到App下载页) → m.cls.cn/telegraph(实测手机UA 200真电报页)
# ②共振chip金额取绝对值+剥加号——方向只由箭头+红绿色表达(原▼与−号重叠=多此一举)
# ③共振板块资金补别名+jl_sector_ff_v1缓存兜底(与详情面板同口径),非当日打"旧"(原只查内存致"通信板块暂缺")
# ④持仓小图fib标签删"接回·半/接回·深/冲刺·主"中文字,只留 0.5/0.618/1.618 + 价格
# ⑤画线键统一:hldKeyJL去"HLD|"前缀与大图同键(两页画线互通),加载时旧HLD|键迁移合并(老数据不丢)
# ⑥ETF资金流开闸:noFundJL只排指数——东财fflow日K/分钟对ETF有覆盖(已实测515880通信ETF),
#   "通信ETF资金直接断"根因=jl-0917闸门把ETF和指数一起闸死,盘中ffTodayLiveJL直接return→jl_ff_v1无今日行→共振个股chip恒"暂缺"
import io, sys

F = "index.html"
s = io.open(F, encoding="utf-8").read()

PATCHES = [
    # ① 财联社两处外跳 → m.cls.cn
    ("cls-link-html",
     'href="https://www.cls.cn/telegraph"',
     'href="https://m.cls.cn/telegraph"', 1),
    ("cls-link-js",
     'full.href = "https://www.cls.cn/telegraph";',
     'full.href = "https://m.cls.cn/telegraph";', 1),

    # ② 共振chip:金额取绝对值并剥加号(方向交给箭头+颜色)
    ("chip-abs",
     r'''(v == null ? "\u6682\u7F3A" : fmtFundJL(v)) + "</b>"''',
     r'''(v == null ? "\u6682\u7F3A" : fmtFundJL(Math.abs(v)).replace(/^\+/, "")) + "</b>"''', 1),

    # ③ resoDataJL 板块资金:别名+缓存兜底+stale
    ("reso-sector-fallback",
     '    const sf = sec ? sectorFundsJL[sec] : null, mt = mtempJL.data, ownV = ff && !ffStale0 ? ff.main : null, secV = sf && Number.isFinite(sf.amt) ? sf.amt : null, mtV = mt && Number.isFinite(mt.fund) ? mt.fund : null, dir = (v) => v == null || !Number.isFinite(v) ? NaN : v > 0 ? 1 : v < 0 ? -1 : 0, dO = dir(ownV), dS = dir(secV), dM = dir(mtV);',
     '''    /* v0.82.2: 板块资金补别名+jl_sector_ff_v1缓存兜底(与详情面板同口径)——原只查内存sectorFundsJL,
       全行业列表没拉到就"暂缺"("通信板块资金又暂缺"根因); 缓存非当日数据打"旧"徽标 */
    let sf = sec ? sectorFundsJL[sec] || sectorFundsJL[sectorAliasJL(sec)] : null, secStale = false;
    if (sec && !(sf && Number.isFinite(sf.amt))) {
      try {
        const _c3 = (JSON.parse(localStorage.getItem("jl_sector_ff_v1") || "{}") || {})[sec];
        if (_c3 && Number.isFinite(+_c3.amt)) { sf = { amt: +_c3.amt, pct: +_c3.pct, name: sec, _d: _c3.d }; secStale = String(_c3.d || "") !== jlLastTradeDay(); }
      } catch (e3) {}
    }
    const mt = mtempJL.data, ownV = ff && !ffStale0 ? ff.main : null, secV = sf && Number.isFinite(sf.amt) ? sf.amt : null, mtV = mt && Number.isFinite(mt.fund) ? mt.fund : null, dir = (v) => v == null || !Number.isFinite(v) ? NaN : v > 0 ? 1 : v < 0 ? -1 : 0, dO = dir(ownV), dS = dir(secV), dM = dir(mtV);''', 1),
    ("reso-return-stale",
     'return { sec, ownV, secV, mtV, mtT: mt ? mt.t : null, dO, dS, dM, verdict, vc, short, ffD, ffStale, mtLb, ffStreak, pos60 };',
     'return { sec, ownV, secV, secStale, mtV, mtT: mt ? mt.t : null, dO, dS, dM, verdict, vc, short, ffD, ffStale, mtLb, ffStreak, pos60 };', 1),
    ("reso-chip-stale",
     r'''chip(r.sec || "\u677F\u5757", r.secV, "", r.dS, false)''',
     r'''chip(r.sec || "\u677F\u5757", r.secV, "", r.dS, r.secStale)''', 1),

    # ④ 持仓小图 fib 标签删中文字
    ("fib-label-pull",
     'if (_pull9) _fl3.push(["接回·半 0.5", _hh3 - _rg3 * 0.5, "#c792ea"], ["接回·深 0.618", _hh3 - _rg3 * 0.618, "#ffd21f"]);',
     'if (_pull9) _fl3.push(["0.5", _hh3 - _rg3 * 0.5, "#c792ea"], ["0.618", _hh3 - _rg3 * 0.618, "#ffd21f"]);', 1),
    ("fib-label-brk",
     'if (_brk9) _fl3.push(["冲刺·主 1.618", _lg2.L1 + _rg3 * 1.618, "#e8c568"]);',
     'if (_brk9) _fl3.push(["1.618", _lg2.L1 + _rg3 * 1.618, "#e8c568"]);', 1),

    # ⑤ 画线键统一(持仓页与大图同键) + 旧数据迁移
    ("hldkey-unify",
     'const hldKeyJL = (pane) => "HLD|" + (stocks[active] ? stocks[active].code : "") + "|" + period + "|" + pane;',
     'const hldKeyJL = (pane) => (stocks[active] ? stocks[active].code : "") + "|" + period + "|" + pane; /* v0.82.2: 与大图同键——大图画线持仓小图可见,反之亦然(原HLD|前缀两页各存一份互不可见="持仓小k图画线没搞好"根因) */', 1),
    ("lines-migrate",
     '''    lines = JSON.parse(localStorage.getItem("jinlin_preview_lines_v1") || "{}");
    alerts = JSON.parse(localStorage.getItem("jinlin_preview_alerts_v1") || "[]");''',
     '''    lines = JSON.parse(localStorage.getItem("jinlin_preview_lines_v1") || "{}");
    /* v0.82.2: 画线键统一迁移——旧HLD|code|period|pane并入code|period|pane(与hldKeyJL去前缀配套,老线不丢) */
    try {
      let _lmig = 0;
      for (const _lk of Object.keys(lines)) {
        if (typeof _lk !== "string" || _lk.indexOf("HLD|") !== 0) continue;
        const _lt = _lk.slice(4), _la = Array.isArray(lines[_lk]) ? lines[_lk] : [];
        lines[_lt] = (Array.isArray(lines[_lt]) ? lines[_lt] : []).concat(_la);
        delete lines[_lk];
        _lmig += _la.length;
      }
      if (_lmig) localStorage.setItem("jinlin_preview_lines_v1", JSON.stringify(lines));
    } catch (eLm) {}
    alerts = JSON.parse(localStorage.getItem("jinlin_preview_alerts_v1") || "[]");''', 1),

    # ⑥ ETF 资金流开闸:noFundJL 只排指数
    ("etf-fund-open",
     '''  function noFundJL(code) {
    const b = String(code).replace(/^(sh|sz)/, "");
    return indices.some((ix) => ix.code === code) || /^(51|56|58|15|16)/.test(b);
  }''',
     '''  function noFundJL(code) {
    /* v0.82.2: ETF(51/56/58/15/16段)不再排除资金流——东财fflow日K/分钟对ETF有覆盖(已实测515880通信ETF日K+分钟均返回数据),
       "通信ETF资金直接断"根因=旧闸门把ETF与指数一起闸死,盘中ffTodayLiveJL直接return→jl_ff_v1无今日行→共振个股chip恒"暂缺"。指数仍无资金流,继续排除 */
    return indices.some((ix) => ix.code === code);
  }''', 1),

    # 版本号三处
    ("ver-tag",
     '<script id="jlVerJL" data-ver="0.82.1" data-sw="jinlin-shell-v97">',
     '<script id="jlVerJL" data-ver="0.82.2" data-sw="jinlin-shell-v98">', 1),
    ("ver-title",
     '<title>金粼 · 联动工作台 v0.82.1</title>',
     '<title>金粼 · 联动工作台 v0.82.2</title>', 1),
    ("changelog",
     '<!-- v0.82.1 0930 档位对称批',
     '''<!-- v0.82.2 0930 六修批: ①财联社外跳www→m.cls.cn/telegraph(手机UA原302到App下载页) ②共振chip金额取绝对值剥符号,方向只由箭头+颜色表达 ③共振板块资金补别名+jl_sector_ff_v1缓存兜底,非当日打"旧"(治"通信板块暂缺") ④持仓小图fib标签删接回/冲刺中文字只留比例+价 ⑤画线键统一:HLD|前缀并入大图同键+旧数据迁移,两页画线互通 ⑥ETF资金流开闸:noFundJL只排指数(东财fflow实测覆盖515880,治"通信ETF资金直接断") -->
<!-- v0.82.1 0930 档位对称批''', 1),
]

fails = []
for name, old, new, want in PATCHES:
    cnt = s.count(old)
    if cnt != want:
        fails.append((name, cnt, want))
        continue
    s = s.replace(old, new)

if fails:
    print("ABORT — count mismatch:")
    for name, cnt, want in fails:
        print(f"  {name}: found {cnt}, want {want}")
    sys.exit(1)

io.open(F, "w", encoding="utf-8").write(s)
print(f"index.html OK — {len(PATCHES)} patches applied")

# sw.js → v98
F2 = "sw.js"
s2 = io.open(F2, encoding="utf-8").read()
SW = [
    ("sw-c", "const C = 'jinlin-shell-v97';", "const C = 'jinlin-shell-v98';", 1),
    ("sw-keep", "const KEEP = ['jinlin-shell-v97', 'jinlin-shell-v96'];", "const KEEP = ['jinlin-shell-v98', 'jinlin-shell-v97'];", 1),
    ("sw-note", "/* jinlin sw v.68", "/* jinlin sw v.69 — 2026-09-30: 缓存名 →v98, 配合六修批(index v0.82.2: 财联社m站/共振chip去重符号/板块资金兜底/fib删字/画线键统一/ETF资金开闸)。\n   jinlin sw v.68", 1),
]
fails2 = []
for name, old, new, want in SW:
    cnt = s2.count(old)
    if cnt != want:
        fails2.append((name, cnt, want))
        continue
    s2 = s2.replace(old, new)
if fails2:
    print("ABORT sw.js — count mismatch:")
    for name, cnt, want in fails2:
        print(f"  {name}: found {cnt}, want {want}")
    sys.exit(1)
io.open(F2, "w", encoding="utf-8").write(s2)
print(f"sw.js OK — {len(SW)} patches applied")
