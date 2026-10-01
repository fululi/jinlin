#!/usr/bin/env python3
# _b8b.py — v0.81.5 补丁 index.html 剩余部分（_b8.py 的 ks.html 已落盘，本脚本不再碰 ks.html）
# 上一脚本在 index.html 补丁#9 断言失败（原文是 \uXXXX 转义，old 串写成了中文），
# index.html 未写盘、无污染。本脚本对转义区一律动态切片取原文。
import re

with open("index.html", encoding="utf-8") as f:
    t = f.read()

pairs = []

# 版本号
pairs.append(('data-ver="0.81.4" data-sw="jinlin-shell-v90"', 'data-ver="0.81.5" data-sw="jinlin-shell-v91"'))
pairs.append(('<b id="jlVerB" style="color:#81e6d9">v0.81.3</b>', '<b id="jlVerB" style="color:#81e6d9">v0.81.5</b>'))

# embed 戳
pairs.append(('fr.src = "ks.html?embed=1&v=0928c&code="', 'fr.src = "ks.html?embed=1&v=0928d&code="'))

# B. 共振面板放出来
pairs.append(('.resonancePanel{display:none!important}', ''))

# D2. 两段空选择器死CSS
pairs.append(('.{font-size:9px;color:#b8e6e1;border:1px solid #81e6d929;background:#081923aa;padding:5px 9px;border-radius:30px;transition:background .35s,border-color .35s,box-shadow .35s}', ''))
pairs.append(('.:hover{background:#81e6d91c;border-color:#81e6d96b;box-shadow:0 0 18px #81e6d929}', ''))

# F2. ddxReopen 文案诚实化
pairs.append(('<button id="ddxReopenJL" type="button">主力净额附图已隐藏（资金未到位/已手动关闭）· 点我展开</button>',
              '<button id="ddxReopenJL" type="button">主力净额附图已隐藏（该周期未覆盖/资金未到位/已手动关闭）· 点我展开</button>'))

# A3. searchStock 腾讯通道类型过滤（此段无转义，可直接匹配）
pairs.append((r'''          rows = String(window.v_hint || "").split("^").map((seg) => {
            const a = seg.split("~");
            return a.length >= 3 && /^\d{6}$/.test(a[1]) ? { Code: a[1], Name: a[2] } : null;
          }).filter(Boolean);''',
r'''          rows = String(window.v_hint || "").split("^").map((seg) => {
            const a = seg.split("~");
            // jl-0928-3: 000001重码根治——只收沪深个股(GP-A)/ETF。指数(ZS)/基金(KJ/FJ)丢弃:
            // 它们剥前缀存成6位后会被jlPfxJL拼错市场(上证指数000001→sz000001平安银行)。
            // 持仓/观察本就是个股工具, 指数请去K线站加(那边保留前缀+候选点选)。
            return a.length >= 5 && /^\d{6}$/.test(a[1]) && (a[0] === "sh" || a[0] === "sz") && (a[4] === "GP-A" || a[4] === "ETF") ? { Code: a[1], Name: a[2] } : null;
          }).filter(Boolean);'''))

# C. checkTierTouchJL 熔断 —— 原文含 \u 转义，动态切片
hit_start = t.index('      const hit = (side, v, lb) => {')
hit_end = t.index('      t.sells.forEach', hit_start)
hit_old = t[hit_start:hit_end]
assert hit_old.count('st[key] = 1;') == 2 and 'toast(' in hit_old, "hit 函数切片异常"
hit_new = '''      const hit = (side, v, lb) => {
        const key = s.code + side + lb;
        if (st[key]) return;
        if (!(side === "S" && p >= v) && !(side === "B" && p <= v)) return;
        st[key] = 1;
        // jl-0928-4: 连环触档熔断——同票今日逐档toast满3条后, 再触档只发一次汇总然后当天静默
        // (st.d按天重置, "今日"口径天然成立; 档位key照常记录, 不会因静默隔天补播)
        const ck = "_tz" + s.code, n0 = st[ck] || 0;
        if (n0 >= 3) {
          if (n0 === 3) {
            st[ck] = 4;
            toast(s.name + " 今日连触多档 · 后续触档不再逐条提醒（明日起恢复）");
          }
          return;
        }
        st[ck] = n0 + 1;
        toast(s.name + " 触及 " + lb + " " + v.toFixed(2) + (side === "S" ? " 高抛位" : " 低吸位") + " · 已顺延下一档");
      };
'''
pairs.append((hit_old, hit_new))

# F1. isMin 补 60分 —— 原文 \u 转义，3处文本完全相同，不走 pairs 唯一性机制，直接全局替换：
#   L8705 ensureDDXData(取数闸门) / L10133 ddxAvailJL(可用性判定) / L10224 drawDDXPane(绘制闸门)
ismin_old = r'isMin = ["1\u5206", "5\u5206", "15\u5206", "30\u5206"].includes(period)'
assert t.count(ismin_old) == 3, f"isMin 期望3处实得{t.count(ismin_old)}处"
t = t.replace(ismin_old, r'isMin = ["1\u5206", "5\u5206", "15\u5206", "30\u5206", "60\u5206"].includes(period) /* jl-0928-5: 补60分——分钟资金流端点klt=60有数据, 之前漏进isMin导致60分K线永远"资金未到位" */')
print("isMin 3处已补60分")

# D1a. 删僵尸函数 loadOneFFJL_sina
_s = t.index('    const loadOneFFJL_sina = (st2) => {')
_e = t.index('\n    };', _s) + len('\n    };')
pairs.append((t[_s:_e], ''))

# D1b. 删其唯一调用点
pairs.append((r'''        if (!ffDone || _short) {
          ffDone = true;
          loadOneFFJL_sina(st2);
          setTimeout(() => {''',
r'''        if (!ffDone || _short) {
          ffDone = true;
          setTimeout(() => {'''))

for i, (old, new) in enumerate(pairs):
    c = t.count(old)
    assert c == 1, f"补丁#{i+1} 期望1处实得{c}处: {old[:80]!r}"
    t = t.replace(old, new)
with open("index.html", "w", encoding="utf-8") as f:
    f.write(t)
print(f"index.html: {len(pairs)} 处替换全部命中")

# sw.js
with open("sw.js", encoding="utf-8") as f:
    sw = f.read()
sw_pairs = [
    ("const C = 'jinlin-shell-v90';", "const C = 'jinlin-shell-v91';"),
    ("const KEEP = ['jinlin-shell-v90', 'jinlin-shell-v89'];", "const KEEP = ['jinlin-shell-v91', 'jinlin-shell-v90'];"),
    ("/* jinlin sw v.61 — 2026-09-28: 缓存名 →v90，配合SR/SR带默认关+孤立注释符修复(index v0.81.4 / ks v=0928c)。",
     "/* jinlin sw v.62 — 2026-09-28: 缓存名 →v91，配合搜索重码治理+共振面板放出+60分资金解锁(index v0.81.5 / ks v=0928d)。"),
]
for i, (old, new) in enumerate(sw_pairs):
    c = sw.count(old)
    assert c == 1, f"sw.js 补丁#{i+1} 期望1处实得{c}处"
    sw = sw.replace(old, new)
with open("sw.js", "w", encoding="utf-8") as f:
    f.write(sw)
print(f"sw.js: {len(sw_pairs)} 处替换全部命中")
print("全部完成")
