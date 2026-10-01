#!/usr/bin/env python3
# _b18.py — v0.82.3/sw v99 温度/国家队修复批
# 根因(全部实测确认):
# ①东财clist单页上限实为100条——温度与宇宙扫描名义pz=200, 每页只回100但页偏移按200跳 → 全A只采到一半
#   (实测pn=1尾688667/pn=2首688665, 688666被跳过)。温度PZ改100(56页全覆盖), 扫描pz改100同步修
# ②温度fields只有f12,f14,f3,f6,f62——没拉f2/f15/f16, 封板确认(sealed/sealedDn)恒true → 涨跌停计数失真
# ③温度写死push2delay单主机, 该主机间歇限流/超时即"采样失败"; 重试切push2双主机互备
# ④国家队(510300)走fflow日K, 日K收盘后才出今日行(东财口径, skill pitfalls早有记载) → 盘中恒"显示昨天";
#   补: 盘中用分钟fflow末行(今日累计主力净额, 个股ffTodayLiveJL同口径)写今日行进hist+rows, 收盘后日K终版覆盖
import io, sys

F = "index.html"
s = io.open(F, encoding="utf-8").read()

PATCHES = [
    # ①温度 PZ 200→100 + 页数上限
    ("mtemp-pz",
     "const PZ = 200,",
     "const PZ = 100, /* v0.82.3: 东财clist单页上限实为100——名义200每页只回100且偏移按200跳, 全A采一半(涨跌停漏计根因) */", 1),
    ("mtemp-maxpn",
     "maxPn = 29",
     "maxPn = 56 /* v0.82.3: 随PZ=100 */", 1),

    # ②+③温度 fields补封板三字段 + 重试切主机
    ("mtemp-fetch",
     'sc.src = "https://push2delay.eastmoney.com/api/qt/clist/get?fltt=2&invt=2&po=1&pz=" + PZ + "&pn=" + (Math.floor(off / PZ) + 1) + "&np=1&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f3,f6,f62&cb=" + cb + "&_=" + Date.now();',
     'sc.src = (retry ? "https://push2.eastmoney.com" : "https://push2delay.eastmoney.com") + "/api/qt/clist/get?fltt=2&invt=2&po=1&pz=" + PZ + "&pn=" + (Math.floor(off / PZ) + 1) + "&np=1&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f3,f6,f62,f2,f15,f16&cb=" + cb + "&_=" + Date.now(); /* v0.82.3: fields补f2/f15/f16恢复封板确认(v.36口径), 页失败重试切push2双主机互备(治"采样一直失败") */', 1),

    # ②温度 eat 调用补 lo(跌停封板判定)
    ("mtemp-eat-lo",
     "px: Number(q.f2 || 0), hi: Number(q.f15 || 0)",
     "px: Number(q.f2 || 0), hi: Number(q.f15 || 0), lo: Number(q.f16 || 0)", 1),

    # ①'宇宙扫描同根修复: pz200→100 + 页数推算 + 进度文案
    ("uni-pz",
     'sc.src = "https://push2delay.eastmoney.com/api/qt/clist/get?fltt=2&invt=2&po=1&pz=200&pn=" + pn + "&np=1&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14&cb=" + cb + "&_=" + Date.now();',
     'sc.src = "https://push2delay.eastmoney.com/api/qt/clist/get?fltt=2&invt=2&po=1&pz=100&pn=" + pn + "&np=1&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14&cb=" + cb + "&_=" + Date.now(); /* v0.82.3: 同温度——pz上限100, 名义200扫一半股票 */', 1),
    ("uni-tp",
     "const tp = total ? Math.ceil(total / 200) : 30;",
     "const tp = total ? Math.ceil(total / 100) : 56; /* v0.82.3: 随pz=100 */", 1),
    ("uni-prog",
     r'\u8D70\u4E1C\u8D22\u5206\u9875(\u7EA630\u9875)',
     r'\u8D70\u4E1C\u8D22\u5206\u9875(\u7EA656\u9875)', 1),

    # ④国家队盘中今日行
    ("gjd-live",
     """    } catch (e) {
    }
    S.loading = false;
    try {
      renderGjdJL();
    } catch (e) {
    }
  }""",
     """    } catch (e) {
    }
    /* v0.82.3: 国家队盘中今日行——东财fflow日K收盘后才出今日行("国家队还显示昨天"根因)。
       盘中(周一~五9:25-15:05)用分钟fflow末行(今日累计主力净额, 个股ffTodayLiveJL同口径)补一行进hist+rows,
       收盘后日K终版自然覆盖同一日期键, 不留半路快照 */
    try {
      const _nd2 = /* @__PURE__ */ new Date(), _mn2 = _nd2.getHours() * 60 + _nd2.getMinutes();
      if (_nd2.getDay() >= 1 && _nd2.getDay() <= 5 && _mn2 >= 555 && _mn2 <= 905) {
        const _tdy2 = jlYMD(_nd2), _p2 = "/api/qt/stock/fflow/kline/get?secid=1.510300&ut=" + JL_UT + "&lmt=0&klt=1&fields1=f1,f2,f3,f7&fields2=f51,f52";
        let _dn2 = false;
        const _tk2 = (dd) => {
          if (_dn2) return;
          const _kl = dd && dd.data && dd.data.klines;
          if (!(_kl && _kl.length)) return;
          const _la = String(_kl[_kl.length - 1]).split(",");
          if (String(_la[0]).slice(0, 10) !== _tdy2) return;
          const _m3 = +_la[1] / 1e8;
          if (!Number.isFinite(_m3)) return;
          _dn2 = true;
          try {
            const _h2 = JSON.parse(localStorage.getItem("jl_gjd_hist_v1") || "{}") || {};
            _h2[_tdy2] = _m3;
            jlSafeSetJL("jl_gjd_hist_v1", JSON.stringify(_h2));
            S.rows = Object.keys(_h2).sort().slice(-60).map((d3) => ({ d: d3, m: _h2[d3] }));
            jlSafeSetJL("jl_gjd_rows_v1", JSON.stringify(S.rows));
          } catch (e5) {}
          try {
            renderGjdJL();
          } catch (e6) {}
        };
        ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com", "https://push2his.eastmoney.com"].forEach((h2) => {
          try {
            emJsonp(h2 + _p2, (e4, dd) => { if (!e4) _tk2(dd); }, 8e3);
          } catch (e7) {}
        });
      }
    } catch (e8) {}
    S.loading = false;
    try {
      renderGjdJL();
    } catch (e) {
    }
  }""", 1),

    # 版本号三处
    ("ver-tag",
     '<script id="jlVerJL" data-ver="0.82.2" data-sw="jinlin-shell-v98">',
     '<script id="jlVerJL" data-ver="0.82.3" data-sw="jinlin-shell-v99">', 1),
    ("ver-title",
     '<title>金粼 · 联动工作台 v0.82.2</title>',
     '<title>金粼 · 联动工作台 v0.82.3</title>', 1),
    ("changelog",
     '<!-- v0.82.2 0930 六修批',
     '''<!-- v0.82.3 0930 温度/国家队修复批: 温度[东财clist单页上限实为100,名义pz200每页丢一半股票→PZ100全覆盖; fields补f2/f15/f16恢复封板确认涨跌停回归准确; 页失败重试切push2双主机治"采样一直失败"] 宇宙扫描[同根pz200扫一半→pz100全量] 国家队[盘中分钟fflow末行补今日行进hist,收盘后日K终版覆盖,治"还显示昨天"] -->
<!-- v0.82.2 0930 六修批''', 1),
]

fails = []
for name, old, new, want in PATCHES:
    cnt = s.count(old)
    if cnt != want:
        fails.append((name, cnt, want))
        continue
    s = s.replace(old, new)

if fails:
    print("ABORT — count mismatch:")
    for name, cnt, want in fails:
        print(f"  {name}: found {cnt}, want {want}")
    sys.exit(1)

io.open(F, "w", encoding="utf-8").write(s)
print(f"index.html OK — {len(PATCHES)} patches applied")

# sw.js → v99
F2 = "sw.js"
s2 = io.open(F2, encoding="utf-8").read()
SW = [
    ("sw-c", "const C = 'jinlin-shell-v98';", "const C = 'jinlin-shell-v99';", 1),
    ("sw-keep", "const KEEP = ['jinlin-shell-v98', 'jinlin-shell-v97'];", "const KEEP = ['jinlin-shell-v99', 'jinlin-shell-v98'];", 1),
    ("sw-note", "/* jinlin sw v.69", "/* jinlin sw v.70 — 2026-09-29: 缓存名 →v99, 配合温度/国家队修复批(index v0.82.3: 温度pz100全覆盖+封板确认+双主机/宇宙扫描同根修/国家队盘中今日行)。\n   jinlin sw v.69", 1),
]
fails2 = []
for name, old, new, want in SW:
    cnt = s2.count(old)
    if cnt != want:
        fails2.append((name, cnt, want))
        continue
    s2 = s2.replace(old, new)
if fails2:
    print("ABORT sw.js — count mismatch:")
    for name, cnt, want in fails2:
        print(f"  {name}: found {cnt}, want {want}")
    sys.exit(1)
io.open(F2, "w", encoding="utf-8").write(s2)
print(f"sw.js OK — {len(SW)} patches applied")
