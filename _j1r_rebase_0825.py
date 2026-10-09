#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# _j1r_rebase_0825.py — 金粼 v0.82.5 六信号层批（重定基线版）
# 基线：线上 v0.82.4 / sw v100（2026-09-29 18:40 curl 核对，commit 55fd5884）
# 撞号记录：v0.82.3/sw v99 已被并行会话"温度换骨架"占用（7717c357），本号作废未发；0930b 同作废
# 本版 = ①P0热修：v0.82.4c 把 JS 块注释写进持仓卡模板字符串(4142 行)，注释残文整屏渲染（截图实证）
#        ②六信号层（口径与回测同作废版 v0.82.3 交付包，引擎用 _j2/_j3 后定稿 sixsig_engine.js）
# 输入：/tmp/jlbase/{index.html, ks.html, sw.js}；输出：/tmp/jlpush/；每处替换 assert count==1，可重放
import pathlib

engine = pathlib.Path('/mnt/agents/output/金粼v0.82.3六信号层/sixsig_engine.js').read_text(encoding='utf-8').rstrip() + '\n'
outdir = pathlib.Path('/tmp/jlpush'); outdir.mkdir(exist_ok=True)

def patch(text, pairs, fname):
    for old, new in pairs:
        cnt = text.count(old)
        assert cnt == 1, f'{fname}: 锚点命中 {cnt} 次（应==1）: {old[:70]!r}'
        text = text.replace(old, new)
    return text

# ============ ks.html（v0.82.2→v0.82.4 零 diff，K1-K9 锚点原样有效） ============
ks = pathlib.Path('/tmp/jlbase/ks.html').read_text(encoding='utf-8')
ks = patch(ks, [
    ('content="ks-0916-52: 实时主力线零上红/零下绿细线化',
     'content="ks-0929-53: 六信号层(转/仓/加/顶/清/离·日线本地算·指标条开关默认开); 实时主力线零上红/零下绿细线化'),
    ('["rlm", "反应位"], ["fvg", "FVG"]',
     '["rlm", "反应位"], ["sixsig", "六信号"], ["fvg", "FVG"]'),
    ('zz: true, rlm: false }, /* ks-0930: 反应位横线组默认关',
     'zz: true, rlm: false, sixsig: true }, /* ks-0930: 反应位横线组默认关'),
    ('if (S.ind.rlm == null) S.ind.rlm = false; /* ks-0930: 默认关, 老存档同口径 */',
     'if (S.ind.rlm == null) S.ind.rlm = false; /* ks-0930: 默认关, 老存档同口径 */ if (S.ind.sixsig == null) S.ind.sixsig = true; /* ks-0929-53: 六信号默认开, 老存档同口径 */'),
    ('dsup: false, hma: false, lsr: false, zz: true };',
     'dsup: false, hma: false, lsr: false, zz: true, sixsig: true };'),
    ('  renderFundStamps(ctx, v); // ks-0906-27: 只留低位"吸"单字戳(回测唯一正超额)',
     '  renderFundStamps(ctx, v); // ks-0906-27: 只留低位"吸"单字戳(回测唯一正超额)\n  renderSixSigJL(ctx, v); // ks-0929-53: 六信号戳(买侧转/仓/加在K线下方, 卖侧顶/清/离在上方)'),
    ('/* ================= 主力净额副图（东财日级真实口径：超大单+大单净额，一条线看方向） ================= */',
     engine + '/* ================= 主力净额副图（东财日级真实口径：超大单+大单净额，一条线看方向） ================= */'),
    ('S.ind.rlm = false; /* ks-0930: 金粼内嵌默认不画反应位 */ }',
     'S.ind.rlm = false; /* ks-0930: 金粼内嵌默认不画反应位 */ S.ind.sixsig = true; /* ks-0929-53: 内嵌默认开六信号 */ }'),
    ('    if (t[0] === "rlm") {',
     '''    if (t[0] === "sixsig") {
      b.addEventListener("click", function () {
        if (S.favPick) { toggleFav("ind:sixsig"); return; }
        S.ind.sixsig = !S.ind.sixsig;
        store(); buildInds(); draw();
        hint("六信号·日线本地算: 转/仓/加=买侧 顶/清/离=卖侧 ｜ 顶=高位放量分歧(常先回踩非趋势终点) ｜ 45只年回测: 转/加正超额 清/离后走弱 · 提醒非指令");
      });
      el.appendChild(b);
      return;
    }
    if (t[0] === "rlm") {'''),
], 'ks.html')
(outdir / 'ks.html').write_text(ks, encoding='utf-8')

# ============ index.html ============
idx = pathlib.Path('/tmp/jlbase/index.html').read_text(encoding='utf-8')
idx = patch(idx, [
    # H0 P0 热修：模板字符串内的 JS 块注释摘出（4142 行持仓卡，注释残文整屏渲染）
    ('</strong>/* v0.82.4c: 报价未就绪不亮硬编码兜底值(别家复查坐实) */${sig ? ',
     '</strong>${sig ? '),
    # 版本戳三连
    ('<script id="jlVerJL" data-ver="0.82.4" data-sw="jinlin-shell-v100">',
     '<script id="jlVerJL" data-ver="0.82.5" data-sw="jinlin-shell-v101">'),
    ('<title>金粼 · 联动工作台 v0.82.4</title>',
     '<title>金粼 · 联动工作台 v0.82.5</title>'),
    ('ks.html?embed=1&v=0930a /* v0.81.9: ks 反应位默认关, 戳同步 */',
     'ks.html?embed=1&v=0930c /* v0.82.5: ks 六信号层, 戳同步(0930b 随作废版未发) */'),
    # 头部变更注释（v0.82.4 把 </head><body> 之间插了注释块，锚 </head><!-- v0.82.4d）
    ('</head><!-- v0.82.4d',
     '''</head><!-- v0.82.5 0929深夜: ①P0热修——v0.82.4c 把 /* 报价未就绪不亮硬编码兜底值 */ 块注释写进持仓卡模板字符串(4142行), JS 不生效直接当文字渲染上屏(截图实证: 卡面飘"绪不亮硬编码兜底值(别家复查坐实) */"), 摘出模板外 ②K线六信号层(借鉴同花顺"量化AI掘金"六信号思路的自研口径: 转=跌势转折/仓=机构重仓/加=回踩加仓/顶=高位分歧/清=反弹清仓/离=二次离场, 日线形态+量能+资金流本地算零新增接口, ks 指标条[六信号]默认开, 戳0930c, sw v101; 45只年回测: 转/加正超额 清/离后走弱 顶=高抛等回踩警示; 定位=提醒非指令) --><!-- v0.82.4d'''),
], 'index.html')
(outdir / 'index.html').write_text(idx, encoding='utf-8')

# ============ sw.js ============
sw = pathlib.Path('/tmp/jlbase/sw.js').read_text(encoding='utf-8')
sw = patch(sw, [
    ("/* jinlin sw v.70 — 2026-09-29:",
     "/* jinlin sw v.71 — 2026-09-29: 缓存名 →v101, 配合六信号层批+P0注释泄漏热修(index v0.82.5 / ks-0929-53)。\n   jinlin sw v.70 — 2026-09-29:"),
    ("const C = 'jinlin-shell-v100';",
     "const C = 'jinlin-shell-v101';"),
    ("const KEEP = ['jinlin-shell-v100', 'jinlin-shell-v99'];",
     "const KEEP = ['jinlin-shell-v101', 'jinlin-shell-v100'];"),
], 'sw.js')
(outdir / 'sw.js').write_text(sw, encoding='utf-8')

print('OK: /tmp/jlpush/{index.html, ks.html, sw.js}')
