#!/usr/bin/env python3
# _b11.py — jinlin v0.81.6（2026-09-29，用户报"不止中金黄金，所有持仓股板块资金都没有"）
# 根因：loadSectorFundsJL 成功回调对【空响应也走成功路径】——
#   data:null / 解析异常 / f62全缺 → 零板块写入，但 _at 照打、failAt 清零、_alt 归零，
#   降级链永远轮不到，页面死卡"板块资金暂缺"。叠加 clist 缺 ut 公开令牌（akshare/东财前端
#   所有可用 clist 调用都带 ut，缺失时部分网络环境返空 data），主路一旦返空即全灭。
# 修法四连：
#   ① 回调统计实际写入板块数 _n，_n===0（含异常）视同失败 → bail 走 _alt 降级链
#   ② clist/ulist 请求补 ut=bd1d9ddb04089700cf9c27f6f7426281（clist 验证过的公开令牌）
#   ③ _alt=2 兜底补 90.BK0732 贵金属（中金黄金所在板块，东财官网核实的板块码）
#   ④ sectorOfJL 硬编码兜底补 600489→贵金属；板块行在持续失败时如实显示"接口暂连不上·自动重试中"
with open("index.html", encoding="utf-8") as f:
    t = f.read()

pairs = []

# ① 成功回调重排：零写入=失败走降级链（切片替换，见下方 block 替换逻辑）
i0 = t.index('    window[cb] = (res) => {\n      var _a2;\n      try {\n        let a = ((_a2 = res == null ? void 0 : res.data) == null ? void 0 : _a2.diff) || (res == null ? void 0 : res.data) || [];')
i1 = t.index('    const sc = document.createElement("script");', i0)
old_cb = t[i0:i1]
assert "_legacyNames" in old_cb and 'sectorFundsJL._at = Date.now()' in old_cb, "回调块锚点漂移"

new_cb = '''    window[cb] = (res) => {
      var _a2, _n = 0;
      try {
        let a = ((_a2 = res == null ? void 0 : res.data) == null ? void 0 : _a2.diff) || (res == null ? void 0 : res.data) || [];
        if (!Array.isArray(a)) a = Object.values(a);
        /* jl-0924-fix34b: 以响应里的 f14(行业名) 为准建表；硬编码 names 只作 _alt=2 兜底路径的补名。
           行业名两侧都做 Ⅰ/Ⅱ/Ⅲ 后缀归一(与第2241行既有口径一致)，否则"半导体Ⅱ"匹配不上"半导体"。 */
        const _legacyNames = { "BK0448": "\\u901A\\u4FE1\\u8BBE\\u5907", "BK1036": "\\u534A\\u5BFC\\u4F53", "BK0546": "\\u73BB\\u7483\\u73BB\\u7EA4", "BK0732": "\\u8D35\\u91D1\\u5C5E" };
        a.forEach((r) => {
          const k = String(r.f12 || r.code || "");
          const nm = sectorNameNormJL(r.f14) || _legacyNames[k] || "";
          if (!nm) return;
          const _amt = Number(r.f62);
          if (!Number.isFinite(_amt)) return;
          sectorFundsJL[nm] = { amt: _amt, pct: Number(r.f3), name: nm, bk: k };
          _n++;
        });
        /* jl-0929-11: 零写入视同失败——原代码空响应(data:null/解析异常/f62全缺)也走成功路径:
           _at照打、failAt清零、_alt归零, 降级链永远轮不到, 页面死卡"板块资金暂缺"
           (0929用户报"所有持仓股板块资金都没有"的根因)。现在 _n===0 直接 bail 走 _alt 降级。 */
        if (_n > 0) {
          try { window.__jlSectorN = Object.keys(sectorFundsJL).length; } catch (eSn) {}
          sectorFundsJL._at = Date.now(); // jl-0928-7: TTL时间戳
          loadSectorFundsJL.failAt = 0;
          loadSectorFundsJL._alt = 0;
          try {
            const _sf = JSON.parse(localStorage.getItem("jl_sector_ff_v1") || "{}") || {};
            Object.keys(sectorFundsJL).forEach((k2) => {
              const v2 = sectorFundsJL[k2];
              if (v2 && Number.isFinite(v2.amt)) _sf[k2] = { amt: v2.amt, pct: v2.pct, d: typeof jlYMD === "function" ? jlYMD(new Date()) : "" };
            });
            jlSafeSetJL("jl_sector_ff_v1", JSON.stringify(_sf));
          } catch (e2) {}
        }
      } catch (eCb) {
        _n = 0; // 解析异常同样视同失败
      }
      clearTimeout(timer);
      loadSectorFundsJL.loading = false;
      delete window[cb];
      sc.remove();
      if (_n > 0) renderResonanceJL();
      else bail(); // 空响应/异常=失败, 走 _alt 降级链(push2→push2delay→ulist四板块兜底), 尽端才置60s失败冷却
    };
'''
t = t[:i0] + new_cb + t[i1:]

# ②③ URL 补 ut + 兜底补贵金属
pairs.append(('''        sc.src = (loadSectorFundsJL._alt === 1 ? "https://push2delay.eastmoney.com" : "https://push2.eastmoney.com")
          + (loadSectorFundsJL._alt >= 2
              ? "/api/qt/ulist.np/get?fltt=2&invt=2&fields=f3,f12,f14,f62&secids=90.BK0448,90.BK1036,90.BK0546&cb=" + cb + "&_=" + Date.now()
              : "/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f62&fs=m:90+t:2&fields=f12,f14,f3,f62&cb=" + cb + "&_=" + Date.now());''',
'''        // jl-0929-11: ①补 ut 公开令牌(akshare与东财前端所有可用 clist 调用都带, 缺失时部分网络返空 data)
        //             ②_alt=2 兜底补 90.BK0732 贵金属(中金黄金所在板块, 东财官网核实板块码)
        sc.src = (loadSectorFundsJL._alt === 1 ? "https://push2delay.eastmoney.com" : "https://push2.eastmoney.com")
          + (loadSectorFundsJL._alt >= 2
              ? "/api/qt/ulist.np/get?fltt=2&invt=2&fields=f3,f12,f14,f62&secids=90.BK0448,90.BK1036,90.BK0546,90.BK0732&ut=bd1d9ddb04089700cf9c27f6f7426281&cb=" + cb + "&_=" + Date.now()
              : "/api/qt/clist/get?pn=1&pz=300&po=1&np=1&fltt=2&invt=2&fid=f62&fs=m:90+t:2&fields=f12,f14,f3,f62&ut=bd1d9ddb04089700cf9c27f6f7426281&cb=" + cb + "&_=" + Date.now());'''))

# ④a sectorOfJL 硬编码兜底补 600489 中金黄金→贵金属
pairs.append(('const _legacy = { "600105": "\\u901A\\u4FE1\\u8BBE\\u5907", "600176": "\\u73BB\\u7483\\u73BB\\u7EA4", "603986": "\\u534A\\u5BFC\\u4F53", "515880": "\\u901A\\u4FE1\\u8BBE\\u5907" };',
'const _legacy = { "600105": "\\u901A\\u4FE1\\u8BBE\\u5907", "600176": "\\u73BB\\u7483\\u73BB\\u7EA4", "603986": "\\u534A\\u5BFC\\u4F53", "515880": "\\u901A\\u4FE1\\u8BBE\\u5907", "600489": "\\u8D35\\u91D1\\u5C5E" }; // jl-0929-11: 补中金黄金→贵金属'))

# ④b 板块行持续失败时如实显示"接口暂连不上·自动重试中"（替代笼统"暂缺"）
pairs.append(('loadSectorFundsJL.loading ? "\\u52A0\\u8F7D\\u4E2D\\u2026" : "\\u6682\\u7F3A"',
'loadSectorFundsJL.loading ? "\\u52A0\\u8F7D\\u4E2D\\u2026" : loadSectorFundsJL.failAt && Date.now() - loadSectorFundsJL.failAt < 3e5 ? "\\u63A5\\u53E3\\u6682\\u8FDE\\u4E0D\\u4E0A\\xB7\\u81EA\\u52A8\\u91CD\\u8BD5\\u4E2D" : "\\u6682\\u7F3A"'))  // jl-0929-11: 失败状态如实亮出(注释不得写进${}内, 会吞掉模板尾巴)

# 诊断：降级链尽端记录失败时刻（控制台 __jlSectorFail 可查）
pairs.append(('''      loadSectorFundsJL._alt = 0;
      loadSectorFundsJL.failAt = Date.now();
      delete window[cb];
      sc.remove();
      renderResonanceJL();
    };''',
'''      loadSectorFundsJL._alt = 0;
      loadSectorFundsJL.failAt = Date.now();
      try { window.__jlSectorFail = Date.now(); } catch (eF2) {} // jl-0929-11: 失败留痕
      delete window[cb];
      sc.remove();
      renderResonanceJL();
    };'''))

# 版本号 → v0.81.6
pairs.append(('data-ver="0.81.6"', 'data-ver="0.81.6"'))  # 占位防呆, 下面单独处理
pairs.pop()
pairs.append(('data-ver="0.81.5"', 'data-ver="0.81.6"'))
pairs.append(('<b id="jlVerB" style="color:#81e6d9">v0.81.5</b>', '<b id="jlVerB" style="color:#81e6d9">v0.81.6</b>'))

for old, new in pairs:
    c = t.count(old)
    assert c == 1, f"锚点非唯一({c}): {old[:60]}..."
    t = t.replace(old, new)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(t)

# sw.js 缓存名 v91→v92
with open("sw.js", encoding="utf-8") as f:
    s = f.read()
sp = [
    ("/* jinlin sw v.62 — 2026-09-28: 缓存名 →v91，配合搜索重码治理+共振面板放出+60分资金解锁(index v0.81.5 / ks v=0928d)。",
     "/* jinlin sw v.63 — 2026-09-29: 缓存名 →v92，配合板块资金拉取根治——零写入视同失败走降级链+clist补ut令牌+兜底补贵金属(index v0.81.6)。\n   jinlin sw v.62 — 2026-09-28: 缓存名 →v91，配合搜索重码治理+共振面板放出+60分资金解锁(index v0.81.5 / ks v=0928d)。"),
    ("const C = 'jinlin-shell-v91';", "const C = 'jinlin-shell-v92';"),
    ("const KEEP = ['jinlin-shell-v91', 'jinlin-shell-v90'];", "const KEEP = ['jinlin-shell-v92', 'jinlin-shell-v91'];"),
]
for old, new in sp:
    c = s.count(old)
    assert c == 1, f"sw锚点非唯一({c}): {old[:50]}"
    s = s.replace(old, new)
with open("sw.js", "w", encoding="utf-8") as f:
    f.write(s)

print("OK: _b11 全部替换完成")
