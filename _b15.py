#!/usr/bin/env python3
# _b15.py — jinlin v0.82.0 / sw v96「快讯页签 + 资金去重」批
# ① 新闻面板加"快讯"页签: 东财7×24直连(np-weblist, ACAO:* 已实测) 30秒轮询, 关联持仓/龙池标注, 财联社电报外跳
#    (财联社 www.cls.cn 无CORS无JSONP、手机UA iframe 302到App页 —— 纯前端直连封死, 只能外跳/后续hq管道, 见交接说明)
# ② 持仓详情资金区去重缩字号: ffHero 23px→15px / 四档 16px→12px / 共振格"资金方向"改连续性口径(不再重复报金额)
# ③ 复盘证据区 sumH 删"近N日主力净流入/流出"(与下方 DDX 明细重复)
# ④ 资金流展开体 fundTxtJL 删"主力/超大"金额前缀(与标题栏 fundNetJL 四档重复), 留 DDX+口径
# ⑤ sw.js 修 v93 遗留: C 与 KEEP 脱节(活跃缓存自建自删), 统一 v96
import sys, io

F = "/tmp/jlrepo/index.html"
SW = "/tmp/jlrepo/sw.js"

s = io.open(F, encoding="utf-8").read()

KX_CSS = "#newsKxJL{padding:0 10px 10px}.kxSrcJL{display:flex;justify-content:space-between;align-items:center;padding:6px 2px;font-size:9px;color:#8fb2bd;letter-spacing:.04em}.kxSrcJL a{color:#81e6d9;text-decoration:none;font-size:9.5px}.kxSrcJL b{color:#eef9fc;font-weight:600}#kxListJL{max-height:62vh;overflow-y:auto;-webkit-overflow-scrolling:touch}.kxItemJL{padding:7px 2px;border-top:1px solid #ffffff0c;display:flex;gap:8px;align-items:flex-start}.kxItemJL:first-child{border-top:0}.kxT{color:#81e6d9;font-size:10px;font-variant-numeric:tabular-nums;flex:0 0 34px;padding-top:1px}.kxB{flex:1;min-width:0}.kxTxt{font-size:11.5px;line-height:1.55;color:#dcebef;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.kxItemJL.hot .kxTxt{color:#ffd2d3}.kxChips{margin-top:3px;display:flex;gap:5px;flex-wrap:wrap}.kxChip{font-size:9px;padding:1px 6px;border-radius:6px;border:1px solid #8bd7e233;color:#bcefeb}.kxChip.hold{border-color:#ff545966;color:#ff8f93}.kxChip.pool{border-color:#ffd21f66;color:#ffd21f}.kxLoadingJL{padding:20px;text-align:center;font-size:10.5px;color:#8fb2bd}"

KX_HTML = '<div id="newsKxJL" hidden=""><div class="kxSrcJL"><span>东财 7×24 快讯 · <b id="kxTimeJL">--:--</b> 更新 · 30秒轮询</span><a href="https://www.cls.cn/telegraph" target="_blank" rel="noopener">财联社电报 ↗</a></div><div id="kxListJL"><div class="kxLoadingJL">快讯加载中…</div></div></div>'

KX_BRANCH = '''if (!panel || !fr) return;
    if (mode === "kx") {
      panel.hidden = false;
      shade.hidden = false;
      fr.hidden = true;
      empty.hidden = true;
      const _kxOn = $("newsKxJL");
      if (_kxOn) _kxOn.hidden = false;
      full.href = "https://www.cls.cn/telegraph";
      try {
        if (!openNewsJL._ps) {
          history.pushState({ jlNews: 1 }, "", "#news");
          openNewsJL._ps = 1;
        }
      } catch (e0) {
      }
      qa("[data-news]").forEach((b) => b.classList.toggle("active", b.dataset.news === mode));
      try {
        kxStartJL();
      } catch (e1) {
      }
      return;
    }
    const _kxOff = $("newsKxJL");
    if (_kxOff) _kxOff.hidden = true;
    try {
      kxStopJL();
    } catch (e1) {
    }
    const rel = "https://fululi.github.io/hq-mobile/"'''

KX_FUNCS = '''function closeNewsJL() {
    try {
      kxStopJL();
    } catch (e) {
    }
    if ($("newsPanel")) $("newsPanel").hidden = true;
    if ($("newsShade")) $("newsShade").hidden = true;
  }
  function kxStateJL() {
    return window.__kxJL || (window.__kxJL = { tm: 0, loading: false, n: 0 });
  }
  function kxStopJL() {
    const st = kxStateJL();
    if (st.tm) {
      clearInterval(st.tm);
      st.tm = 0;
    }
  }
  function kxStartJL() {
    kxStopJL();
    kxLoadJL();
    kxStateJL().tm = setInterval(kxLoadJL, 3e4);
  }
  async function kxLoadJL() {
    const st = kxStateJL(), panel = $("newsPanel"), list = $("kxListJL");
    if (!list) return;
    if (!panel || panel.hidden) {
      kxStopJL();
      return;
    }
    if (document.hidden || st.loading) return;
    st.loading = true;
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 9e3);
      const rid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
      const r = await fetch("https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=30&req_trace=" + rid + "&_r=" + Date.now(), { cache: "no-store", signal: ac.signal });
      clearTimeout(to);
      const j = await r.json(), arr = j && j.data && j.data.fastNewsList || [];
      if (arr.length) {
        renderKxJL(arr);
        st.n = arr.length;
      } else if (!st.n) list.innerHTML = '<div class="kxLoadingJL">快讯暂无数据 · 可点右上角财联社电报↗</div>';
      const tm = $("kxTimeJL");
      if (tm) tm.textContent = (/* @__PURE__ */ new Date()).toTimeString().slice(0, 5);
    } catch (e) {
      if (!st.n) list.innerHTML = '<div class="kxLoadingJL">快讯加载失败(网络/接口) · 点上方财联社电报↗看官报</div>';
    } finally {
      st.loading = false;
    }
  }
  function renderKxJL(arr) {
    const list = $("kxListJL");
    if (!list) return;
    const held = {}, pool = {};
    try {
      (typeof stocks !== "undefined" ? stocks : []).forEach((s2) => {
        if (s2 && s2.code) held[String(s2.code).replace(/^(sh|sz)/i, "")] = s2.name || 1;
      });
    } catch (e) {
    }
    try {
      const P = typeof JLPOOL !== "undefined" ? JLPOOL : null;
      if (P) {
        const grab = (x) => {
          if (x && x.code) pool[String(x.code).replace(/^(sh|sz)/i, "")] = x.name || x.nm || 1;
        };
        ["start", "zs", "eb", "trend", "top"].forEach((k) => (P.L && P.L[k] || []).forEach(grab));
        (P.OBS || []).forEach(grab);
        (P.RISK || []).forEach(grab);
        (P.picks || []).forEach(grab);
      }
    } catch (e) {
    }
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    list.innerHTML = arr.map((it) => {
      const tm = String(it.showTime || "").slice(11, 16), hot = Number(it.titleColor) !== 0;
      const chips = (it.stockList || []).map((sc) => {
        const cd = String(sc).split(".")[1] || "";
        if (!cd || /^BK/.test(cd)) return "";
        const nm = held[cd] && held[cd] !== 1 ? held[cd] : pool[cd] && pool[cd] !== 1 ? pool[cd] : cd;
        const cl = held[cd] ? "hold" : pool[cd] ? "pool" : "", tg = held[cd] ? "·持仓" : pool[cd] ? "·龙池" : "";
        return '<span class="kxChip ' + cl + '">' + esc(nm) + tg + "</span>";
      }).join("");
      return '<div class="kxItemJL' + (hot ? " hot" : "") + '"><span class="kxT">' + tm + '</span><div class="kxB"><div class="kxTxt">' + esc(it.summary || it.title || "") + "</div>" + (chips ? '<div class="kxChips">' + chips + "</div>" : "") + "</div></div>";
    }).join("");
  }'''

A2_NEW = '''if (sf) {
      let _sgn = 0, _stk = 0;
      if (dd && dd.length) {
        for (let _i = dd.length - 1; _i >= 0 && _i >= dd.length - 30; _i--) {
          const _m = Number(dd[_i] && dd[_i].main);
          if (!Number.isFinite(_m)) break;
          if (_m === 0) {
            if (_stk === 0) continue;
            break;
          }
          const _s2 = _m > 0 ? 1 : -1;
          if (_sgn === 0) _sgn = _s2;
          else if (_s2 !== _sgn) break;
          _stk++;
        }
      }
      sf.classList.toggle("dimPendJL", !_sgn);
      sf.textContent = _sgn ? (_sgn > 0 ? "连续流入 " : "连续流出 ") + _stk + " 天" + (_stk >= 3 ? (_sgn > 0 ? " · 堆量承接" : " · 持续派发") : "") + (dr && String(dr.d || "") ? " · " + String(dr.d).slice(5) : "") : "\\u4E2A\\u80A1\\u8D44\\u91D1\\u6570\\u636E\\u6682\\u7F3A";
    }'''

A2_OLD = r'''if (sf) { sf.classList.toggle("dimPendJL", !(dr && Number.isFinite(Number(dr.main)))); sf.textContent = dr && Number.isFinite(Number(dr.main)) ? `主力净额 ${Number(dr.main) >= 0 ? "+" : ""}${Number(dr.main).toFixed(2)} \xB7 ${Number(dr.main) >= 0 ? "\u4E3B\u529B\u51C0\u6D41\u5165" : "\u4E3B\u529B\u51C0\u6D41\u51FA"} \xB7 ${String(dr.d || "").slice(5)}${String(dr.d || "").slice(0, 10) !== jlLastTradeDay() ? "\xB7\u6700\u8FD1\u4EA4\u6613\u65E5" : ""}` : "\u4E2A\u80A1\u8D44\u91D1\u6570\u636E\u6682\u7F3A"; }'''

# A4 old 行内含大写 \uXXXX 字面转义, 直接从文件按行提取保真
_i4 = s.index('fundTxtJL").innerHTML = bars ?')
A4_OLD = s[_i4:s.index('\n', _i4)]

A4_NEW = '''fundTxtJL").innerHTML = bars ? (dLast != null ? '<b style="color:#ffd21f">DDX ' + (dLast >= 0 ? "+" : "") + dLast.toFixed(2) + "</b> · " : "") + "<i>" + mode + " · 东财 · 主力/超大金额见上方标题栏</i>" : '<span style="color:#c9dfe8">资金流暂无(ETF或东财限流) · 价格走势为腾讯实时</span>';'''

PATCHES = [
    ("ver", 'data-ver="0.81.9" data-sw="jinlin-shell-v95"', 'data-ver="0.82.0" data-sw="jinlin-shell-v96"', 1),
    ("title", '<title>金粼 · 联动工作台 v0.81.9</title>', '<title>金粼 · 联动工作台 v0.82.0</title>', 1),
    ("changelog", '<!-- v0.81.9 0930 追加批:',
     '<!-- v0.82.0 0930 快讯+资金去重批: 新闻面板[加快讯页签·东财7×24直连(np-weblist ACAO:*实测)30秒轮询·关联持仓/龙池股票chip标注·财联社电报外跳(cls.cn无CORS无JSONP+手机UA iframe302到App页,纯前端直连封死)] 持仓详情[主力净额23px→15px/四档16px→12px/共振资金方向格改连续性口径(连入/连出N天+堆量承接/持续派发)不再与今日资金块重复报金额] 复盘证据[小结删近N日主力净流入与DDX明细重复段] 资金流展开体[删主力/超大重复前缀留DDX+口径注记] -->\n<!-- v0.81.9 0930 追加批:', 1),
    ("ffrows", '.ffRows strong{display:block;font-size:16px;margin-top:3px;font-weight:550}',
     '.ffRows strong{display:block;font-size:12px;margin-top:3px;font-weight:550}', 1),
    ("ffhero-a", '.ffRows .ffHero strong{font-size:23px;letter-spacing:-.3px;margin-top:4px}',
     '.ffRows .ffHero strong{font-size:15px;letter-spacing:-.01em;margin-top:4px}', 1),
    ("kx-css", '.fundModeJL{display:flex;gap:6px;margin:2px 0 4px}',
     '.fundModeJL{display:flex;gap:6px;margin:2px 0 4px}' + KX_CSS, 1),
    ("kx-tab", '<button type="button" data-news="wan">晚报</button><a id="newsFullJL"',
     '<button type="button" data-news="wan">晚报</button><button type="button" data-news="kx">快讯</button><a id="newsFullJL"', 1),
    ("kx-box", '<div id="newsEmptyJL" hidden="">新闻暂未生成，点击右上角可打开存档。</div>',
     '<div id="newsEmptyJL" hidden="">新闻暂未生成，点击右上角可打开存档。</div>' + KX_HTML, 1),
    ("kx-branch", 'if (!panel || !fr) return;\n    const rel = "https://fululi.github.io/hq-mobile/"', KX_BRANCH, 1),
    ("kx-funcs", '''function closeNewsJL() {
    if ($("newsPanel")) $("newsPanel").hidden = true;
    if ($("newsShade")) $("newsShade").hidden = true;
  }''', KX_FUNCS, 1),
    ("a2-label", '资金方向<b data-stock-fund-resonance="">', '资金连续性<b data-stock-fund-resonance="">', 1),
    ("a2-fill", A2_OLD, A2_NEW, 1),
    ("sumh", ' + (ddL.length ? " · 近" + ddL.length + "日主力 " + (_ds >= 0 ? "净流入 " : "净流出 ") + fmtFundJL(Math.abs(_ds)) : "") + "</div>";',
     ' + "</div>";', 1),
    ("fundtxt", A4_OLD, A4_NEW, 1),
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
    ("sw-c", "const C = 'jinlin-shell-v93';", "const C = 'jinlin-shell-v96';", 1),
    ("sw-keep", "const KEEP = ['jinlin-shell-v95', 'jinlin-shell-v94'];", "const KEEP = ['jinlin-shell-v96', 'jinlin-shell-v95'];", 1),
    ("sw-hdr", "/* jinlin sw v.66 — 2026-09-30:",
     "/* jinlin sw v.67 — 2026-09-30: 缓存名 →v96(顺带修 v93 遗留: C 活跃缓存名与 KEEP 脱节致自建自删), 配合快讯页签+资金去重批(index v0.82.0)。\n   jinlin sw v.66 — 2026-09-30:", 1),
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
