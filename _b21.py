from pathlib import Path

root = Path(__file__).resolve().parent
p = root / "index.html"
s = p.read_text()

old = '''  function rsRiskJL(r) { /* jl-1052: 风险分0-10+五状态——4资金转弱线/5减仓线(g正常/am资金预警/o结构风险/r风险确认/b修复观察) */
    const na = isNaN(r.dO) && isNaN(r.dS) && isNaN(r.dM);
    let sc = 0;
    if (!isNaN(r.dO)) sc += r.dO < 0 ? 1.5 : -1;
    if (!isNaN(r.dS)) sc += r.dS < 0 ? 1 : -0.5;
    if (!isNaN(r.dM)) sc += r.dM < 0 ? 0.5 : -0.5;
    if (r.ffStreak < 0) sc += Math.min(3.5, -r.ffStreak * 0.5);
    else if (r.ffStreak >= 3) sc -= Math.min(2, r.ffStreak * 0.3);
'''
new = '''  function rsRiskJL(r) { /* jl-1052: 风险分0-10+五状态——4资金转弱线/5减仓线(g正常/am资金预警/o结构风险/r风险确认/b修复观察) */
    const na = isNaN(r.dO) && isNaN(r.dS) && isNaN(r.dM);
    let sc = 0, _money = 0;
    if (!isNaN(r.dO)) _money += r.dO < 0 ? 1.5 : -1;
    if (!isNaN(r.dS)) _money += r.dS < 0 ? 1 : -0.5;
    if (!isNaN(r.dM)) _money += r.dM < 0 ? 0.5 : -0.5;
    if (r.ffStreak < 0) _money += Math.min(3.5, -r.ffStreak * 0.5);
    else if (r.ffStreak >= 3) _money -= Math.min(2, r.ffStreak * 0.3);
    sc += Math.min(4.5, _money); /* jl-rscap: 落实资金族封顶4.5；流入抵扣负值照旧透传，结构因子另加 */
'''
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

old = '<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/><title>金粼 · 联动工作台 v0.89.8</title>'
new = '<!-- v0.90.6 1031 jl-rscap: 资金共振风险分落实资金族封顶4.5；纯资金最高4.5只到资金预警，pos60/fibRisk结构因子另加；K线共振追涨公式零改动。壳v309→v310成对 -->\n<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/><title>金粼 · 联动工作台 v0.90.6</title>'
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

old = '<script id="jlVerJL" data-ver="0.90.5" data-sw="jinlin-shell-v309"></script>'
new = '<script id="jlVerJL" data-ver="0.90.6" data-sw="jinlin-shell-v310"></script>'
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
p.write_text(s)

p = root / "sw.js"
s = p.read_text()
old = "const C = 'jinlin-shell-v309';"
new = "const C = 'jinlin-shell-v310'; /* 2026-10-31: v310=资金共振风险分资金族封顶4.5配对，缓存策略零变化 */"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
old = "const KEEP = ['jinlin-shell-v309',"
new = "const KEEP = ['jinlin-shell-v310','jinlin-shell-v309',"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
s = "/* jinlin sw v310 — 2026-10-31: 资金共振风险分资金族封顶4.5配对(缓存策略零变化，仅C/KEEP升号) */\n" + s
p.write_text(s)

print("patched: index.html + sw.js -> v0.90.6 / shell v310")