# -*- coding: utf-8 -*-
# _b7.py — 金粼 v0.81.4 (2026-09-28)
# ① SR 三套撑压(SR/SR带/反应位)默认只留 RLM：dsup/lsr/ovOn.sr 默认全关，指标行可手动开回
#    根因链：ks_dsupoff_v1 迁移已把 SR 关掉过一次，但 embed preset 每次内嵌打开都 S.ind.dsup=true
#    重新写回 ksm_v1 存档 → 全屏 ks 又显示 SR。本次连 embed/simple preset 一起改 + 一次性迁移
# ② 修复 index.html 350 行两个孤立 "-->" 渲染成页面左上角可见文字（注释配平 52开/53闭）
# ③ 版本递进 v0.81.3→v0.81.4，sw 缓存 v89→v90，ks embed 戳 v=0928b→v=0928c
import io, sys

def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        c = s.count(old)
        assert c == 1, f"{path}: anchor count={c} != 1 :: {old[:60]}"
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print(f"OK {path} ({len(pairs)} 处)")

# ============ ks.html ============
patch('ks.html', [
    # 1) 新鲜安装默认值：dsup/lsr 默认关
    ("dsup: true, hma: false, lsr: true, ctrl: false",
     "dsup: false, hma: false, lsr: false, ctrl: false"),
    # 2) 老存档缺键时的合并默认值
    ("if (S.ind.dsup == null) S.ind.dsup = true;",
     "if (S.ind.dsup == null) S.ind.dsup = false;"),
    ("if (S.ind.lsr == null) S.ind.lsr = true;",
     "if (S.ind.lsr == null) S.ind.lsr = false;"),
    # 3) 旧版(v!=4)存档整体重置的默认值
    ("dsup: true, hma: false, lsr: true, zz: true }",
     "dsup: false, hma: false, lsr: false, zz: true }"),
    # 4) 内嵌 preset 不再每次强开 SR（这是 ks_dsupoff_v1 迁移被反噬的根因）
    ('if (typeof S !== "undefined" && S.ind) { S.ind.atri = true; S.ind.dsup = true; S.ind.ob = true;',
     'if (typeof S !== "undefined" && S.ind) { S.ind.atri = true; S.ind.dsup = false; /* ks-0928: SR默认关,与RLM重复 */ S.ind.ob = true;'),
    # 5) simple(持仓卡打开) preset 不再强开 SR带
    ("      S.ind.lsr = true;",
     "      S.ind.lsr = false; // ks-0928: SR带默认关(与RLM反应位重复),指标行可手动开回"),
    # 6) 一次性迁移：把已存成 true 的老用户也翻成默认关（手动开过的不受影响——翻一次后存档即 false）
    ('try { if (!localStorage.getItem("ks_dsupoff_v1")) { S.ind.dsup = false; localStorage.setItem("ks_dsupoff_v1", "1"); } } catch (e) {}',
     'try { if (!localStorage.getItem("ks_dsupoff_v1")) { S.ind.dsup = false; localStorage.setItem("ks_dsupoff_v1", "1"); } } catch (e) {}\n'
     'try { if (!localStorage.getItem("ks_sroff_v1")) { S.ind.dsup = false; S.ind.lsr = false; localStorage.setItem("ks_sroff_v1", "1"); } } catch (e) {} // ks-0928: SR/SR带默认关——与RLM反应位矩阵重复(RLM=加权+衰减+分数+信号,严格超集),要用指标行手动开回'),
])

# ============ index.html ============
patch('index.html', [
    # 7) 原生大图 SR 叠加默认关
    ("sr: true, rlm: true, vp: false",
     "sr: false, rlm: true, vp: false"),
    # 8) 迁移键换 mig2：老用户存档里的 sr:true 也翻成默认关一次
    ('    if (!localStorage.getItem("jinlin_ov_sr_mig")) {\n      ovOn.sr = true;\n      localStorage.setItem("jinlin_ov_sr_mig", "1");\n    }',
     '    if (!localStorage.getItem("jinlin_ov_sr_mig2")) { // jl-0928: SR默认关(与RLM反应位重复),要用指标条手动开回\n      ovOn.sr = false;\n      localStorage.setItem("jinlin_ov_sr_mig2", "1");\n    }'),
    # 9) 350 行两个孤立 "-->"（可见文字 bug）
    ("③首页K线明暗脉冲动画关停 --> -->",
     "③首页K线明暗脉冲动画关停 -->"),
    ("不再依赖手动关标签) --> -->",
     "不再依赖手动关标签) -->"),
    # 10) 版本号三处
    ('data-ver="0.81.3" data-sw="jinlin-shell-v89"',
     'data-ver="0.81.4" data-sw="jinlin-shell-v90"'),
    ("<title>金粼 · 联动工作台 v0.81.3</title>",
     "<title>金粼 · 联动工作台 v0.81.4</title>"),
    # 11) ks 内嵌缓存戳
    ("ks.html?embed=1&v=0928b",
     "ks.html?embed=1&v=0928c"),
    # 12) 顶部版本注释（严格配平：一个 <!-- 对一个 -->）
    ("</head><body><!-- v0.81.3 ",
     "</head><body><!-- v0.81.4 0928深夜: ①SR三套(SR/SR带/反应位)默认只留RLM反应位——dsup/lsr/ovOn.sr默认全关(指标行/指标条可手动开回),内嵌preset不再每次强开SR,一次性迁移翻老存档 ②修350行两个孤立闭合符渲染成页面左上角可见文字 --><!-- v0.81.3 "),
])

# ============ sw.js ============
patch('sw.js', [
    ("const C = 'jinlin-shell-v89';",
     "const C = 'jinlin-shell-v90';"),
    ("const KEEP = ['jinlin-shell-v89', 'jinlin-shell-v88'];",
     "const KEEP = ['jinlin-shell-v90', 'jinlin-shell-v89'];"),
    ("/* jinlin sw v.60 — 2026-09-28: 缓存名 →v89，配合空头信号口径修正(index v0.81.3 / ks v=0928b)。",
     "/* jinlin sw v.61 — 2026-09-28: 缓存名 →v90，配合SR/SR带默认关+孤立注释符修复(index v0.81.4 / ks v=0928c)。\n   --- 近期 ---\n   jinlin sw v.60 — 2026-09-28: 缓存名 →v89，配合空头信号口径修正(index v0.81.3 / ks v=0928b)。"),
])

print("=== _b7 全部补丁落地 ===")
