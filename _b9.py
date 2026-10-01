#!/usr/bin/env python3
# _b9.py — jinlin v0.81.5 增补补丁（2026-09-28，用户盘中反馈五连）
# G. S3之后没价格: tiersViewJL 延伸档上限 3→6 + 涨停/跌停夹紧(cap/flr由computeTierJL暴露)
#    ——原 buys 延伸只查 nv>0, 可延到跌停价之下("buy一直往下没有限制"根因)
# H. 破位/跌停刹车提示: ladderHTMLJL 加警示行——跌停附近="买档失效别接飞刀·只能反T先卖后买";
#    跌破fib波段低点="暂停低吸·只能反T先卖后买" (治"顾前不顾后")
# I. ETF精度: 新增decTierJL(51/15/16/58段或<1元→3位), ladderHTMLJL全部档位显示+tiersViewJL延伸档舍入
#    ——原toFixed(2)把0.763压成0.76, 延伸档甚至因舍入撞档延不出来
# J. 板块资金TTL: renderResonanceJL触发条件加5分钟陈旧判定+成功回调打_at时间戳
#    ——原"内存有值永不重拉", 盘中开一天都是开盘那一刻的数据("资金没有更新"根因)
import re

with open("index.html", encoding="utf-8") as f:
    t = f.read()

pairs = []

# --- I0. 新增 decTierJL（插在 tiersViewJL 前）---
pairs.append(('  function tiersViewJL(s) {',
'''  function decTierJL(s) { // jl-0928-6: 档位精度——ETF/基金(51/15/16/58段)或1元以下票用3位小数, 与ks端dec()同口径
    const p2 = Number(s && s.base) || 0, b2 = String(s && s.code || "").replace(/^(sh|sz|bj)/, "");
    return p2 > 0 && p2 < 1 || /^(51|15|16|58)/.test(b2) ? 3 : 2;
  }
  function tiersViewJL(s) {'''))

# --- G1. computeTierJL 暴露 cap/flr ---
pairs.append(('    return { atr: a, base, anchor, sells: rk.sells, buys: rk.buys, planNext, profile: calibJL(stock.code) };',
'    return { atr: a, base, anchor, sells: rk.sells, buys: rk.buys, planNext, cap, flr, profile: calibJL(stock.code) }; // jl-0928-6: 暴露涨跌停边界, 给tiersViewJL延伸档夹紧用'))

# --- G2/I1. tiersViewJL 延伸档：上限6 + cap/flr夹紧 + 品种精度 ---
pairs.append((r'''    let g = 0;
    while (g < 3 && p >= sells[sells.length - 1]) {
      const nv = +(sells[sells.length - 1] + Math.max(stepS, p * 0.003)).toFixed(2);
      if (!(nv > sells[sells.length - 1])) break;
      sells.push(nv);
      g++;
    }
    g = 0;
    while (g < 3 && p <= buys[buys.length - 1]) {
      const nv = +(buys[buys.length - 1] - Math.max(stepB, p * 0.003)).toFixed(2);
      if (!(nv > 0 && nv < buys[buys.length - 1])) break;
      buys.push(nv);
      g++;
    }''',
'''    // jl-0928-6: 延伸档三修——①精度跟品种(原toFixed(2)把0.763的ETF延伸档舍没/压歪)
    //   ②涨跌停夹紧(原buys只查nv>0, 可延到跌停价之下="一直往下没限制"; 涨停之上有价无市不延)
    //   ③上限3→6档(大涨大跌穿S3/B3之后仍有价位可迭代)
    const tk = decTierJL(s) === 3 ? 1e-3 : 0.01, cap2 = Number(t.cap) || 0, flr2 = Number(t.flr) || 0;
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
    }'''))

# --- I2. ladderHTMLJL：头部引入精度变量 ---
pairs.append(('    const p = Number(s.base), prev = Number(s.prevClose) || p, hi = Number(s.high), lo = Number(s.low), cal = t.profile || calibJL(s.code);',
'''    const p = Number(s.base), prev = Number(s.prevClose) || p, hi = Number(s.high), lo = Number(s.low), cal = t.profile || calibJL(s.code);
    const _dc2 = decTierJL(s); // jl-0928-6: ETF/低价票3位小数'''))

# --- H. 破位/跌停警示 + 延伸档"延"标签：row 加 ext 参数 ---
pairs.append(('    const row = (v, lb, side, hit, next) => {',
'''    let warn = ""; // jl-0928-7: 顾前不顾后根治——跌停/破位的票, 低吸档不但不顺延还要亮刹车
    try {
      const _lpw2 = /^(30|68)/.test(String(s.code)) ? 0.2 : /^(8|4|92)/.test(String(s.code)) ? 0.3 : /ST/i.test(s.name || "") ? 0.05 : 0.1, _flr2 = prev * (1 - _lpw2);
      const _leg2 = legFibJL(s.code, p);
      if (_fq && lo > 0 && lo <= _flr2 * 1.002) warn = `<div class="ladAlert s" ${dAttr}>⚑ 已砸到跌停价 ${_flr2.toFixed(_dc2)} 附近 · 买档今日全部失效, 别接飞刀 · 要做只能反T(先卖后买)</div>`;
      else if (_fq && _leg2 && Number(_leg2.lo) > 0 && p < Number(_leg2.lo)) warn = `<div class="ladAlert s" ${dAttr}>⚑ 已破波段低点 ${Number(_leg2.lo).toFixed(_dc2)} · 低吸暂停, 破位票不接 · 要做只能反T(先卖后买)</div>`;
    } catch (eW) {}
    const row = (v, lb, side, hit, next, ext) => {'''))

pairs.append(('<b>${lb}</b>', '<b>${lb}${ext ? \'<i style="font-size:7px;color:#f5b76e;font-style:normal">延</i>\' : ""}</b>'))

# 延伸档标记：extS/extB 之后入的档位标"延"
pairs.append(('    const sRows = t.sells.map((v, k) => row(v, "S" + (k + 1), "s", sHit[k], k === nS)).reverse().join(""), bRows = t.buys.map((v, k) => row(v, "B" + (k + 1), "b", bHit[k], k === nB)).join(""), s1 = t.sells[0], b1 = t.buys[0];',
'    const sRows = t.sells.map((v, k) => row(v, "S" + (k + 1), "s", sHit[k], k === nS, t.extS != null && k >= t.extS)).reverse().join(""), bRows = t.buys.map((v, k) => row(v, "B" + (k + 1), "b", bHit[k], k === nB, t.extB != null && k >= t.extB)).join(""), s1 = t.sells[0], b1 = t.buys[0];'))

# --- I3. ladderHTMLJL 显示精度替换 ---
pairs.append(('<strong>${v.toFixed(2)}</strong>', '<strong>${v.toFixed(_dc2)}</strong>'))
pairs.append(('${t.sells[nS].toFixed(2)}', '${t.sells[nS].toFixed(_dc2)}'))
pairs.append(('${t.sells[k].toFixed(2)}', '${t.sells[k].toFixed(_dc2)}'))
pairs.append(('${t.buys[nB].toFixed(2)}', '${t.buys[nB].toFixed(_dc2)}'))
pairs.append(('${t.buys[k].toFixed(2)}', '${t.buys[k].toFixed(_dc2)}'))
pairs.append(('<b>${_fq ? "\\u73B0\\u4EF7" : "\\u6628\\u6536"} ${p.toFixed(2)}</b>', '<b>${_fq ? "\\u73B0\\u4EF7" : "\\u6628\\u6536"} ${p.toFixed(_dc2)}</b>'))
pairs.append(('${(s1 - b1).toFixed(2)}', '${(s1 - b1).toFixed(_dc2)}'))
pairs.append(('${t.anchor.toFixed(2)} \\xB1 k\\xD7${t.base.toFixed(2)} \\xB7 RMA ${t.atr.toFixed(2)}', '${t.anchor.toFixed(_dc2)} \\xB1 k\\xD7${t.base.toFixed(_dc2)} \\xB7 RMA ${t.atr.toFixed(_dc2)}'))

# --- H2. warn 接入渲染 ---
pairs.append(('return `<div class="ladJL">${alert}${sRows}', 'return `<div class="ladJL">${warn}${alert}${sRows}'))

# --- J. 板块资金 TTL ---
pairs.append(('    if (st && sector && !sectorFundsJL[sector] && !loadSectorFundsJL.loading) loadSectorFundsJL();',
'    if (st && sector && (!sectorFundsJL[sector] || Date.now() - (sectorFundsJL._at || 0) > 3e5) && !loadSectorFundsJL.loading) loadSectorFundsJL(); // jl-0928-7: 板块资金5分钟TTL——原"内存有值就永不重拉", 页面开一天都是开盘那一刻的数据("资金没更新"根因)'))
pairs.append(('        loadSectorFundsJL.failAt = 0;\n        loadSectorFundsJL._alt = 0;',
'        sectorFundsJL._at = Date.now(); // jl-0928-7: TTL时间戳\n        loadSectorFundsJL.failAt = 0;\n        loadSectorFundsJL._alt = 0;'))

for i, (old, new) in enumerate(pairs):
    c = t.count(old)
    assert c == 1, f"补丁#{i+1} 期望1处实得{c}处: {old[:70]!r}"
    t = t.replace(old, new)
with open("index.html", "w", encoding="utf-8") as f:
    f.write(t)
print(f"index.html: {len(pairs)} 处替换全部命中")
