#!/usr/bin/env python3
# _b8.py — jinlin v0.81.5 补丁（2026-09-28）
# A. 搜索重码根治：ks 候选列表点选(不再首条即入) + jinlin 过滤指数/基金类型
# B. 复盘/持仓共振面板放出来：删 .resonancePanel{display:none!important}
# C. 做T触档 toast 熔断：同票当日满3条后汇总一条然后静默
# D. 死代码：删 loadOneFFJL_sina(已neutered) + L45 两段空选择器死CSS
# E. ks "S TOUCH xx" 标签数字 pe→pv（延伸假想值→最后一根轨值）
# F. 60分资金流附图覆盖：isMin 列表补 "60分"
# 附带：版本 0.81.5 / sw v91 / embed 戳 v=0928d / ddxReopen 文案诚实化
# 明确不动：sbOrbJL B/S悬浮球
import sys

def patch(path, pairs):
    with open(path, encoding="utf-8") as f:
        t = f.read()
    for i, (old, new) in enumerate(pairs):
        c = t.count(old)
        assert c == 1, f"{path} 补丁#{i+1} 期望1处实得{c}处: {old[:80]!r}"
        t = t.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(t)
    print(f"{path}: {len(pairs)} 处替换全部命中")

# ============ ks.html ============
ks_pairs = []

# A1. searchCode：首条即收 → 收集全候选+排序（精确6位>GP-A>ETF>ZS>FJ>US），多条交给调用方弹列表
ks_pairs.append((r'''  sc.onload = function () {
    var txt = window.v_hint || "";
    var items = String(txt).split("^");
    for (var i = 0; i < items.length; i++) {
      var f = items[i].split("~");
      if (f.length < 5) continue;
      if (f[0] === "us") { fin({ code: "us" + f[1].toUpperCase(), name: unesc(f[2]), type: "US" }); return; }
      if ((f[0] === "sh" || f[0] === "sz") && (f[4] === "GP-A" || f[4] === "ZS" || f[4] === "ETF" || f[4] === "FJ")) {
        fin({ code: f[0] + f[1], name: unesc(f[2]), type: f[4] }); return;
      }
    }
    fin(null);
  };''',
r'''  sc.onload = function () {
    var txt = window.v_hint || "";
    var items = String(txt).split("^");
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var f = items[i].split("~");
      if (f.length < 5) continue;
      if (f[0] === "us") { out.push({ code: "us" + f[1].toUpperCase(), name: unesc(f[2]), type: "US" }); continue; }
      if ((f[0] === "sh" || f[0] === "sz") && (f[4] === "GP-A" || f[4] === "ZS" || f[4] === "ETF" || f[4] === "FJ")) {
        out.push({ code: f[0] + f[1], name: unesc(f[2]), type: f[4] });
      }
    }
    // ks-0928-1: 重码治理(000001=上证指数sh/平安银行sz/华夏成长jj同码)——不再首条即收开盲盒,
    // 全候选按 个股GP-A>ETF>指数ZS>基金FJ>美股 排序返回, 多条时由调用方弹列表用户点选
    var rk = function (r) { return r.type === "GP-A" ? 0 : r.type === "ETF" ? 1 : r.type === "ZS" ? 2 : r.type === "FJ" ? 3 : 4; };
    out.sort(function (a, b) { return rk(a) - rk(b); });
    fin(out.length ? out : null);
  };'''))

# A2. addbox：6位代码也走联想候选（000001歧义弹列表），多条弹浮层点选；联想为空才回退报价直加
ks_pairs.append((r'''  add.addEventListener("click", function () {
    var kw = (inp.value || "").trim();
    if (!kw) return;
    function addOne(code, name, ty) {
      for (var i = 0; i < S.codes.length; i++) if (S.codes[i][0] === code) { hint("已在列表里"); return; }
      S.codes.push([code, name || code, ty || ""]);
      inp.value = "";
      store(); buildTabs();
      hint("已加入 " + (name || code) + " · 长按标签可删除");
    }
    if (/^[0-9]{6}$/.test(kw)) {
      if (!/^[56903]/.test(kw)) { hint("6位代码暂支持沪深；或直接输名称，如 中金黄金 / 英伟达 / 上证指数"); return; }
      fetchQuote(kw, function (err, q) {
        if (err) { hint("代码无效或暂无数据"); return; }
        addOne(kw, q.name || kw, "");
      });
      return;
    }
    hint("搜索「" + kw + "」…");
    searchCode(kw, function (r) {
      if (!r) { hint("没找到「" + kw + "」· 换关键词或输6位代码"); return; }
      addOne(r.code, r.name, r.type);
    });
  });''',
r'''  add.addEventListener("click", function () {
    var kw = (inp.value || "").trim();
    if (!kw) return;
    function addOne(code, name, ty) {
      for (var i = 0; i < S.codes.length; i++) if (S.codes[i][0] === code) { hint("已在列表里"); return; }
      S.codes.push([code, name || code, ty || ""]);
      inp.value = "";
      store(); buildTabs();
      hint("已加入 " + (name || code) + " · 长按标签可删除");
    }
    // ks-0928-1: 候选浮层——搜索结果多条时列出来点选(治000001式重码), 单条直接入
    function pickList(rows) {
      var old = document.getElementById("ksCandJL");
      if (old) old.remove();
      if (rows.length === 1) { addOne(rows[0].code, rows[0].name, rows[0].type); return; }
      var tyName = { "GP-A": "A股", "ETF": "ETF", "ZS": "指数", "FJ": "基金", "US": "美股" };
      var menu = document.createElement("div");
      menu.id = "ksCandJL";
      menu.style.cssText = "position:fixed;z-index:9999;background:#0e1a16f5;border:1px solid #2e5a4e;border-radius:10px;padding:6px;min-width:210px;max-width:84vw;box-shadow:0 8px 30px #000c";
      rows.slice(0, 8).forEach(function (r) {
        var b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "display:flex;justify-content:space-between;gap:12px;width:100%;padding:9px 10px;background:transparent;border:0;border-bottom:1px solid #ffffff10;color:#d8efe8;font-size:13px;text-align:left;cursor:pointer";
        var nm = document.createElement("span"); nm.textContent = r.name;
        var cd = document.createElement("small"); cd.style.color = "#7fa89d"; cd.textContent = r.code + " · " + (tyName[r.type] || r.type);
        b.appendChild(nm); b.appendChild(cd);
        b.addEventListener("click", function () { menu.remove(); addOne(r.code, r.name, r.type); });
        menu.appendChild(b);
      });
      document.body.appendChild(menu);
      var rc = inp.getBoundingClientRect();
      menu.style.left = Math.max(6, Math.min(rc.left, window.innerWidth - menu.offsetWidth - 6)) + "px";
      menu.style.top = (rc.bottom + 6) + "px";
      setTimeout(function () {
        document.addEventListener("pointerdown", function cl(e) {
          if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", cl); }
        });
      }, 0);
    }
    if (/^[0-9]{6}$/.test(kw)) {
      if (!/^[56903]/.test(kw)) { hint("6位代码暂支持沪深；或直接输名称，如 中金黄金 / 英伟达 / 上证指数"); return; }
      // ks-0928-1: 6位代码先走联想——000001这类重码会出多条(指数/个股/基金), 弹列表点选;
      // 联想接口没收到(冷门股/断网)才回退老的报价直加路径
      hint("搜索「" + kw + "」…");
      searchCode(kw, function (rows) {
        if (rows && rows.length) { pickList(rows); return; }
        fetchQuote(kw, function (err, q) {
          if (err) { hint("代码无效或暂无数据"); return; }
          addOne(kw, q.name || kw, "");
        });
      });
      return;
    }
    hint("搜索「" + kw + "」…");
    searchCode(kw, function (rows) {
      if (!rows || !rows.length) { hint("没找到「" + kw + "」· 换关键词或输6位代码"); return; }
      pickList(rows);
    });
  });'''))

# E. "S TOUCH 38.29" 标签：pe(右缘延伸假想值) → pv(最后一根K线轨值=触碰判定依据)
ks_pairs.append((r'''    var pv = mm * last2 + bb2, pe = mm * iEnd + bb2, yE = v.Y(pe);
    // Touch status is informational only.''',
r'''    var pv = mm * last2 + bb2, pe = mm * iEnd + bb2, yE = v.Y(pe);
    // ks-0928-2: pv=最后一根K线处的轨值(touching判定用的就是它), pe=轨道延伸到右缘空白的假想值。
    // 标签数字必须用pv——陡轨上pe能比pv差出10%, "S TOUCH 38.29"标的是根本没碰到的价, 误导操作。
    // Touch status is informational only.'''))
ks_pairs.append((r'''        ctx.fillText((touching ? (isHigh ? "S TOUCH " : "B WATCH ") : (isHigh ? "S " : "B ")) + pe.toFixed(dec()), right2 - 4, rlabReg(v, pe, yE + (isHigh ? -8 : 11)));''',
r'''        ctx.fillText((touching ? (isHigh ? "S TOUCH " : "B WATCH ") : (isHigh ? "S " : "B ")) + pv.toFixed(dec()), right2 - 4, rlabReg(v, pe, yE + (isHigh ? -8 : 11)));'''))

patch("ks.html", ks_pairs)

# ============ index.html ============
idx_pairs = []

# 版本号
idx_pairs.append(('data-ver="0.81.4" data-sw="jinlin-shell-v90"', 'data-ver="0.81.5" data-sw="jinlin-shell-v91"'))
idx_pairs.append(('<b id="jlVerB" style="color:#81e6d9">v0.81.3</b>', '<b id="jlVerB" style="color:#81e6d9">v0.81.5</b>'))

# embed 戳（ks.html 变了，换戳防缓存喂旧版）
idx_pairs.append(('fr.src = "ks.html?embed=1&v=0928c&code="', 'fr.src = "ks.html?embed=1&v=0928d&code="'))

# B. 复盘/持仓共振面板放出来（删隐藏规则，函数与渲染全保留）
idx_pairs.append(('.resonancePanel{display:none!important}', ''))

# D2. L45 两段空选择器死CSS（浏览器本就不应用，纯死字节）
idx_pairs.append(('.{font-size:9px;color:#b8e6e1;border:1px solid #81e6d929;background:#081923aa;padding:5px 9px;border-radius:30px;transition:background .35s,border-color .35s,box-shadow .35s}', ''))
idx_pairs.append(('.:hover{background:#81e6d91c;border-color:#81e6d96b;box-shadow:0 0 18px #81e6d929}', ''))

# F2. ddxReopen 文案诚实化（周期未覆盖是主因之一，别只甩锅"资金未到位"）
idx_pairs.append(('<button id="ddxReopenJL" type="button">主力净额附图已隐藏（资金未到位/已手动关闭）· 点我展开</button>',
                  '<button id="ddxReopenJL" type="button">主力净额附图已隐藏（该周期未覆盖/资金未到位/已手动关闭）· 点我展开</button>'))

# A3. jinlin searchStock 腾讯通道：只收沪深个股(GP-A)/ETF，指数(ZS)/基金(KJ/FJ)丢弃
#     ——000001重码根治：否则"上证指数"剥前缀存成000001，jlPfxJL拼成sz000001平安银行
idx_pairs.append((r'''          rows = String(window.v_hint || "").split("^").map((seg) => {
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

# C. 做T触档 toast 熔断：同票当日逐档提醒满3条后，第4档起发一条汇总然后当天静默
idx_pairs.append((r'''      const hit = (side, v, lb) => {
        const key = s.code + side + lb;
        if (st[key]) return;
        if (side === "S" && p >= v) {
          st[key] = 1;
          toast(s.name + " 触及 " + lb + " " + v.toFixed(2) + " 高抛位 · 已顺延下一档");
        } else if (side === "B" && p <= v) {
          st[key] = 1;
          toast(s.name + " 触及 " + lb + " " + v.toFixed(2) + " 低吸位 · 已顺延下一档");
        }
      };''',
'''      const hit = (side, v, lb) => {
        const key = s.code + side + lb;
        if (st[key]) return;
        if (!(side === "S" && p >= v) && !(side === "B" && p <= v)) return;
        st[key] = 1;
        // jl-0928-4: 连环触档熔断——同票今日逐档toast满3条后, 再触档只发一次汇总然后当天静默
        // (st.d按天重置, "今日"口径天然成立; 档位key照常记录, 不会因为静默隔天补播)
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
      };'''))

# F1a. ensureDDXData isMin 补 60分（分钟分支走 fflow/kline?klt=60，东财该端点支持60分）
idx_pairs.append((r'''    const klt = ksKltOf(), isDay = period === "日K", isMin = ["1分", "5分", "15分", "30分"].includes(period);''',
r'''    const klt = ksKltOf(), isDay = period === "日K", isMin = ["1分", "5分", "15分", "30分", "60分"].includes(period); // jl-0928-5: 补60分——分钟资金流端点klt=60有数据, 之前漏进isMin导致60分K线永远"资金未到位"'''))

# F1b. ddxAvailJL isMin 同步补 60分（否则数据到了也被判定不可用）
idx_pairs.append((r'''      const isDay = period === "日K", isMin = ["1分", "5分", "15分", "30分"].includes(period);''',
r'''      const isDay = period === "日K", isMin = ["1分", "5分", "15分", "30分", "60分"].includes(period); // jl-0928-5: 同上, 60分资金流解锁'''))

# D1a. 删僵尸函数 loadOneFFJL_sina（新浪资金流已永久排除，函数体只剩kill自己）
sina_fn = None
with open("index.html", encoding="utf-8") as f:
    _t = f.read()
_s = _t.index("    const loadOneFFJL_sina = (st2) => {")
_e = _t.index("\n    };", _s) + len("\n    };")
sina_fn = _t[_s:_e]
idx_pairs.append((sina_fn, ""))

# D1b. 删其唯一调用点
idx_pairs.append((r'''        if (!ffDone || _short) {
          ffDone = true;
          loadOneFFJL_sina(st2);
          setTimeout(() => {''',
r'''        if (!ffDone || _short) {
          ffDone = true;
          setTimeout(() => {'''))

patch("index.html", idx_pairs)

# ============ sw.js ============
sw_pairs = [
    ("const C = 'jinlin-shell-v90';", "const C = 'jinlin-shell-v91';"),
    ("const KEEP = ['jinlin-shell-v90', 'jinlin-shell-v89'];", "const KEEP = ['jinlin-shell-v91', 'jinlin-shell-v90'];"),
]
with open("sw.js", encoding="utf-8") as f:
    sw_head = f.readline()
assert "v90" in sw_head, "sw.js 头部注释不含 v90"
sw_pairs.append((sw_head, "/* jinlin sw v.62 — 2026-09-28: 缓存名 →v91，配合搜索重码治理+共振面板放出+60分资金解锁(index v0.81.5 / ks v=0928d)。\n"))
patch("sw.js", sw_pairs)

print("全部补丁完成")
