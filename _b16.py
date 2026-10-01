#!/usr/bin/env python3
# _b16.py — jinlin v0.82.1 / sw v97「计划态档位前瞻铺满」批
# 房主原话: "上涨你给了S3之后就没有了…不能只顾前不顾后"
# 真相: 盘中涨穿 S3 已有自动延伸(上限6档夹紧涨停, jl-0928-6), 但 planNext 计划态(盘后~次日盘前)早退不延伸,
#       且盘中未突破前也看不到上方档 —— 跌停次日晚上做计划时 S3→涨停之间是真空带。
# 改法: tiersViewJL 计划态按同步长把 S/B 两侧铺满到涨跌停边界(各上限6档), 延伸档沿用 extS/extB "延"标注与弱化样式。
#       盘中突破触发逻辑一行不动。B 侧对称铺满到跌停 —— 前后都顾。
import sys, io

F = "/tmp/jlrepo/index.html"
SW = "/tmp/jlrepo/sw.js"
s = io.open(F, encoding="utf-8").read()

_i = s.index('function tiersViewJL(s) {')
_j = s.index('const m15CacheJL', _i)
TV_OLD = s[_i:_j].rstrip()

TV_NEW = '''function tiersViewJL(s) {
    const t = tierLevelsJL(s);
    if (!t || !t.sells || !t.sells.length || !t.buys || !t.buys.length) return t;
    const p = Number(s.base);
    if (!(p > 0) || !t.planNext && !freshQuoteJL(s)) return t;
    const sells = t.sells.slice(), buys = t.buys.slice();
    const stepS = sells.length >= 2 ? sells[sells.length - 1] - sells[sells.length - 2] : sells[0] - Number(t.anchor) || p * 0.005;
    const stepB = buys.length >= 2 ? buys[buys.length - 2] - buys[buys.length - 1] : Number(t.anchor) - buys[0] || p * 0.005;
    // jl-0928-6: 延伸档三修——①精度跟品种(原toFixed(2)把0.763的ETF延伸档舍没/压歪)
    //   ②涨跌停夹紧(原buys只查nv>0, 可延到跌停价之下="一直往下没限制"; 涨停之上有价无市不延)
    //   ③上限3→6档(大涨大跌穿S3/B3之后仍有价位可迭代)
    // jl-0930-7: 计划态(planNext)前瞻铺满——不再"只顾前不顾后"。原计划态早退,S3/B3到涨跌停之间是真空带;
    //   现按同步长把S→cap/B→flr两侧补齐(各上限6档), 延伸档沿用extS/extB"延"标注与弱化样式。
    //   盘中(非planNext)维持原"突破才延伸"触发逻辑, 一行未动。
    const tk = decTierJL(s) === 3 ? 1e-3 : 0.01, cap2 = Number(t.cap) || 0, flr2 = Number(t.flr) || 0;
    if (t.planNext) {
      let g = 0;
      while (g < 6 && sells.length < 6 && cap2 > 0 && sells[sells.length - 1] < cap2 - 1e-9) {
        let nv = +(Math.round((sells[sells.length - 1] + Math.max(stepS, p * 0.003)) / tk) * tk).toFixed(3);
        if (nv > cap2) nv = cap2;
        if (!(nv > sells[sells.length - 1])) break;
        sells.push(nv);
        g++;
        if (nv >= cap2) break;
      }
      g = 0;
      while (g < 6 && buys.length < 6 && flr2 > 0 && buys[buys.length - 1] > flr2 + 1e-9) {
        let nv = +(Math.round((buys[buys.length - 1] - Math.max(stepB, p * 0.003)) / tk) * tk).toFixed(3);
        if (nv < flr2) nv = flr2;
        if (!(nv > 0 && nv < buys[buys.length - 1])) break;
        buys.push(nv);
        g++;
        if (nv <= flr2) break;
      }
    } else {
      let g = 0;
      while (g < 6 && p >= sells[sells.length - 1]) {
        let nv = +(Math.round((sells[sells.length - 1] + Math.max(stepS, p * 0.003)) / tk) * tk).toFixed(3);
        if (cap2 > 0 && nv > cap2) nv = cap2;
        if (!(nv > sells[sells.length - 1])) break;
        sells.push(nv);
        g++;
        if (cap2 > 0 && nv >= cap2) break;
      }
      g = 0;
      while (g < 6 && p <= buys[buys.length - 1]) {
        let nv = +(Math.round((buys[buys.length - 1] - Math.max(stepB, p * 0.003)) / tk) * tk).toFixed(3);
        if (flr2 > 0 && nv < flr2) nv = flr2;
        if (!(nv > 0 && nv < buys[buys.length - 1])) break;
        buys.push(nv);
        g++;
        if (flr2 > 0 && nv <= flr2) break;
      }
    }
    if (sells.length === t.sells.length && buys.length === t.buys.length) return t;
    return Object.assign({}, t, { sells, buys, extS: t.sells.length, extB: t.buys.length });
  }'''

PATCHES = [
    ("ver", 'data-ver="0.82.0" data-sw="jinlin-shell-v96"', 'data-ver="0.82.1" data-sw="jinlin-shell-v97"', 1),
    ("title", '<title>金粼 · 联动工作台 v0.82.0</title>', '<title>金粼 · 联动工作台 v0.82.1</title>', 1),
    ("changelog", '<!-- v0.82.0 0930 快讯+资金去重批:',
     '<!-- v0.82.1 0930 档位对称批: 计划态(planNext)S/B档前瞻铺满——原S3/B3到涨跌停真空带(房主:不能只顾前不顾后), 按同步长两侧补齐到cap/flr(各上限6档,延档沿用弱化样式), 盘中突破延伸逻辑不动 -->\n<!-- v0.82.0 0930 快讯+资金去重批:', 1),
    ("tiersview", TV_OLD, TV_NEW, 1),
]

ok = True
for name, old, new, want in PATCHES:
    cnt = s.count(old)
    if cnt != want:
        print("FAIL", name, "count=", cnt, "want=", want)
        ok = False
        break
    s = s.replace(old, new)
    print("ok  ", name)

if not ok:
    print("ABORT — 未写盘")
    sys.exit(1)
io.open(F, "w", encoding="utf-8").write(s)
print("index.html written:", len(s))

w = io.open(SW, encoding="utf-8").read()
SWP = [
    ("sw-c", "const C = 'jinlin-shell-v96';", "const C = 'jinlin-shell-v97';", 1),
    ("sw-keep", "const KEEP = ['jinlin-shell-v96', 'jinlin-shell-v95'];", "const KEEP = ['jinlin-shell-v97', 'jinlin-shell-v96'];", 1),
    ("sw-hdr", "/* jinlin sw v.67 — 2026-09-30:",
     "/* jinlin sw v.68 — 2026-09-30: 缓存名 →v97, 配合计划态档位前瞻铺满批(index v0.82.1)。\n   jinlin sw v.67 — 2026-09-30:", 1),
]
for name, old, new, want in SWP:
    cnt = w.count(old)
    if cnt != want:
        print("FAIL sw", name, "count=", cnt)
        sys.exit(1)
    w = w.replace(old, new)
    print("ok  ", name)
io.open(SW, "w", encoding="utf-8").write(w)
print("sw.js written:", len(w))
print("ALL DONE")
