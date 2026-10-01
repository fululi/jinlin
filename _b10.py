#!/usr/bin/env python3
# _b10.py — jinlin v0.81.5 增补②（2026-09-28，用户报"永鼎等都没有资金更新+龙池股老问题"）
# 根因三连：
#  K1 请求风暴限流：refreshFFlowJL2(true) 每分钟对全票强制重拉(每票2个JSONP)+ffTodayLiveJL(每票3域名)
#     ——10+只票=每分钟50+请求打东财同组域名, 触发限流后全灭="资金不更新"
#  K2 盘后不补终版：盘后判定 lastD===jlLastTradeDay() 即跳过——盘中快照(em-min)写的今日行
#     盘后永远不会被日K终版覆盖, 用户看到的是15:0x半路快照
#  K3 缓存挤压：jl_ff_v1超40只按写入时间淘汰最旧——龙池懒补拉一次几十只,
#     把持仓票资金挤出缓存, 持仓卡资金变旧/消失
# 修法：降频(1→3分钟/节流2分钟)+错峰(每票间隔600ms)+失败冷却(三连败停10分钟)+盘后终版补拉+持仓票驱逐白名单
with open("index.html", encoding="utf-8") as f:
    t = f.read()

pairs = []

# K1a. ffTodayLiveJL 单票节流 50s → 120s
pairs.append(('if (_cf && _cf.rows && _cf.rows.length && String(_cf.rows.at(-1).d) === _tdy && Date.now() - (_cf.t || 0) < 5e4) return;',
'if (_cf && _cf.rows && _cf.rows.length && String(_cf.rows.at(-1).d) === _tdy && Date.now() - (_cf.t || 0) < 12e4) return; // jl-0928-8: 50s→120s, 配合降频治东财限流'))

# K1b. refreshFFlowJL2 非force节流 30s → 60s
pairs.append(('        if (!force && Date.now() - (refreshFFlowJL2._at || 0) < 3e4) return;',
'        if (!force && Date.now() - (refreshFFlowJL2._at || 0) < 6e4) return; // jl-0928-8: 降频'))

# K1c+K2. 循环体：错峰 + 盘中跳过窗口2分钟 + 盘后em-min快照补终版
pairs.append(('''        stocks.forEach((st2) => {
          try {
            ffTodayLiveJL(st2);
          } catch (eF) {
          }
          const cf = (JSON.parse(localStorage.getItem("jl_ff_v1") || "{}") || {})[st2.code];
          if (!force && cf && cf.rows && cf.rows.length) {
            const lastD = String(cf.rows.at(-1).d || "");
            if (_inTrd ? lastD === _tdy && Date.now() - (cf.t || 0) < 6e4 : lastD === jlLastTradeDay()) return;
          }
          loadOneFFJL(st2);
        });''',
'''        stocks.forEach((st2, _si) => {
          // jl-0928-8: 错峰600ms/票——原全票同一毫秒齐发, 东财同IP限流直接团灭
          setTimeout(() => {
            try {
              ffTodayLiveJL(st2);
            } catch (eF) {
            }
            const cf = (JSON.parse(localStorage.getItem("jl_ff_v1") || "{}") || {})[st2.code];
            if (cf && cf.rows && cf.rows.length) {
              const lastD = String(cf.rows.at(-1).d || "");
              if (_inTrd) {
                if (lastD === _tdy && Date.now() - (cf.t || 0) < 12e4) return; // jl-0928-8: 盘中60s→120s
              } else if (lastD === jlLastTradeDay() && cf.src !== "em-min") return;
              // jl-0928-8: 盘后今日行若还是盘中快照(em-min), 放行重拉一次日K终版覆盖——
              // 原逻辑盘后只看日期不看来源, 15:0x的半路快照会留到明天
            } else if (!force) return;
            loadOneFFJL(st2);
          }, _si * 600);
        });'''))

# K1d. 定时器 60s → 180s
pairs.append(('    setInterval(() => refreshFFlowJL2(true), 6e4);',
'    setInterval(() => refreshFFlowJL2(true), 18e4); // jl-0928-8: 资金流全量刷新1→3分钟(每分钟全票重拉=限流团灭根因)'))

# K4a. loadOneFFJL 入口失败冷却
pairs.append(('''    const loadOneFFJL = (st2, tryN) => {
      tryN = tryN || 0;''',
'''    const loadOneFFJL = (st2, tryN) => {
      tryN = tryN || 0;
      try { // jl-0928-8: 三连败冷却10分钟——限流时每分钟重拉只会越限越死, 停一停反而能活
        const _f0 = (loadOneFFJL._fails || {})[st2.code];
        if (!tryN && _f0 && Date.now() - _f0.t < 6e5) return;
      } catch (eC) {
      }'''))

# K4b. 重试耗尽(tryN=2)处记冷却
pairs.append(('''        if (!ffDone || _short) {
          ffDone = true;
          setTimeout(() => {
            try {
              const c2 = (JSON.parse(localStorage.getItem("jl_ff_v1") || "{}") || {})[st2.code];
              if (!(c2 && c2.rows && c2.rows.length) && tryN < 2) loadOneFFJL(st2, tryN + 1);
            } catch (e3) {
            }
          }, 2e4);
        }''',
'''        if (!ffDone || _short) {
          ffDone = true;
          setTimeout(() => {
            try {
              const c2 = (JSON.parse(localStorage.getItem("jl_ff_v1") || "{}") || {})[st2.code];
              if (!(c2 && c2.rows && c2.rows.length)) {
                if (tryN < 2) loadOneFFJL(st2, tryN + 1);
                else { // jl-0928-8: 0/1/2三次全败 → 记冷却
                  (loadOneFFJL._fails = loadOneFFJL._fails || {})[st2.code] = { t: Date.now() };
                }
              }
            } catch (e3) {
            }
          }, 2e4);
        }'''))

# K3. jlFfEvictJL 持仓/观察票驱逐白名单
pairs.append(('''  function jlFfEvictJL(all) { // jl-0920-39: 资金流缓存超40只按写入时间淘汰最旧,防localStorage胀爆
  try {
    const ks2 = Object.keys(all || {});
    if (ks2.length <= 40) return all;
    ks2.sort((a, b) => (all[a] && all[a].t || 0) - (all[b] && all[b].t || 0));
    for (let i2 = 0; i2 < ks2.length - 40; i2++) delete all[ks2[i2]];
  } catch (e) {
  }
  return all;
}''',
'''  function jlFfEvictJL(all) { // jl-0920-39: 资金流缓存超40只按写入时间淘汰最旧,防localStorage胀爆
  try {
    const ks2 = Object.keys(all || {});
    if (ks2.length <= 40) return all;
    // jl-0928-8: 持仓/观察票永不驱逐——龙池懒补拉一次几十只, 原策略会把持仓票资金挤出缓存
    // (用户报"永鼎等资金不更新"帮凶之一: 缓存被挤掉后显示旧值, 又要等下一轮重拉)
    const keep = {};
    try { (typeof stocks !== "undefined" ? stocks : []).forEach((s) => { if (s && s.code) keep[String(s.code).replace(/^(sh|sz|bj)/, "")] = 1; }); } catch (eK) {
    }
    const sac = ks2.filter((k2) => !keep[String(k2).replace(/^(sh|sz|bj)/, "")]);
    sac.sort((a, b) => (all[a] && all[a].t || 0) - (all[b] && all[b].t || 0));
    let need = ks2.length - 40;
    for (let i2 = 0; i2 < sac.length && need > 0; i2++, need--) delete all[sac[i2]];
    // 极端情况: 持仓+观察本身超40只——不再动, 交给配额守卫(jlSafeSetJL)处理
  } catch (e) {
  }
  return all;
}'''))

for i, (old, new) in enumerate(pairs):
    c = t.count(old)
    assert c == 1, f"补丁#{i+1} 期望1处实得{c}处: {old[:70]!r}"
    t = t.replace(old, new)

# K4c. ffSave 成功时清冷却记录（插在 ffSave 函数体开头）
old_save = '''      const ffSave = (rows) => {
        try {
          const all = JSON.parse(localStorage.getItem("jl_ff_v1") || "{}"), _cur0 = all[st2.code];'''
new_save = '''      const ffSave = (rows) => {
        try {
          if (loadOneFFJL._fails) delete loadOneFFJL._fails[st2.code]; // jl-0928-8: 成功即解除冷却
        } catch (eF2) {
        }
        try {
          const all = JSON.parse(localStorage.getItem("jl_ff_v1") || "{}"), _cur0 = all[st2.code];'''
assert t.count(old_save) == 1, "ffSave 锚点不唯一"
t = t.replace(old_save, new_save)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(t)
print(f"index.html: {len(pairs) + 1} 处替换全部命中")
