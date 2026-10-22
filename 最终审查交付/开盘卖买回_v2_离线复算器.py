#!/usr/bin/env python3
# 开盘卖买回·v2.2.1 离线复算器(固定窗口·不复权真实价·快照哈希校验)
# 用法: python3 开盘卖买回_v2_离线复算器.py [快照.json] | --selftest | --test-writefail
#   缺省读取脚本同目录的 行情快照_2023-07-04_2026-10-21_不复权.json
#   快照缺失时联网拉取腾讯不复权数据(每标的一次请求, 锚点同响应派生)
# 正式口径: 不复权真实价(腾讯qfq为减法复权, 改变日内比值, 不适用本策略, 仅留作对照)
#
# ── 固定哈希的绑定对象与算法(v2.2 单一化) ─────────────────────────────
#   对象: 规范序列化字节串 canon = json.dumps(snap, sort_keys=True,
#         ensure_ascii=True, separators=(",", ":")) 的 UTF-8 字节
#   算法: SHA-256, 固定值见 SNAP_SHA256
#   文件路径依次执行: JSON解析 → 文件原始字节==canon(重排版即拒) →
#         完整性门检 → sha256(文件字节)==SNAP_SHA256
#   交付快照由 final_deliver.py 以 canon 原样落盘, 两口径恒等(已实测)
#
# ── 联网回退(v2.2 重设计, 不再以旧固定哈希验收新数据) ──────────────────
#   完整性门检(通用规则, 与固定哈希无关)通过后与固定哈希比对:
#   一致(=线上历史未变) → 进入统计;
#   不一致 → 仅落盘 候选快照_待审核_XXXXXXXX.json 并退出码4, 不输出任何统计,
#   待人工审核后作为新基准快照交付
#
# ── 退出码 ────────────────────────────────────────────────────────────
#   0=通过  1=哈希/口径不匹配  2=完整性门检失败(含非法JSON/类型/非有限值)
#   3=自检存在FAIL  4=联网数据与固定快照不一致(已生成候选快照)  5=IO/网络错误
#
# v2.2 修正(响应第二轮终审, 仅改校验与测试, 公式/策略/行情/统计零改动):
#   阻断1 哈希口径单一化, 文件路径强制 文件字节==规范字节, 两口径恒等已实测
#   阻断2 联网回退改为"候选快照生成器", 不复用旧固定哈希作新数据的验收门
#   阻断3 锚点三重校验: 键名绑定2023-07-03 + 四值正有限 + OHLC包络;
#         另查 meta.anchor_prev_close 一致、锚点日未混入窗口
#   防御  NaN/Infinity/字符串价格/bars非列表/节点非对象/非法JSON/读写与网络失败
#         → 明确退出码拒绝, 不以异常栈崩溃
#   自检  15场景全部以子进程实际执行校验入口, 记录原始输出+退出码,
#         并断言失败场景无任何统计输出
#
# v2.2.1 修正(响应第三轮终审, 2026-10-22, 仅定点修复):
#   候选快照写入 open(cand,"w") 未捕获 OSError → 已修: 提取为共用函数 write_candidate(),
#   捕获 OSError → 明确错误信息 + 退出码5(与退出码表"5=IO/网络错误"一致);
#   新增 --test-writefail 定点测试(子进程级): 断言退出码=5、错误信息、无任何统计输出;
#   追加(第四轮审查意见): 定点测试临时目录改为 mkdtemp 全新独占子目录, rmtree 仅删自建目录,
#   WRITEFAIL_TMP 指向已有目录时不会误删其中其他文件;
#   未改动: 交易公式/统计代码/联网取数逻辑/15项自检/行情快照(本轮未重跑自检, 未重新抓取行情)
import json, sys, os, hashlib, statistics, urllib.request, datetime, math
from decimal import Decimal, ROUND_HALF_UP

FEE = 0.001; START = "2023-07-04"; EXCL = "2026-10-22"
FIRST = "2023-07-04"; LAST = "2026-10-21"; ANCHOR_DATE = "2023-07-03"; EXPECTED_N = 799
SNAP_SHA256 = "8b1defe07d9f116c7ca3c42c7f7c5d662819e7966dad0f426209f33c533fdf19"
DEFAULT_SNAP = "行情快照_2023-07-04_2026-10-21_不复权.json"
CODES = [("sh600105", "永鼎股份"), ("sh603986", "兆易创新")]
AKEY = "anchor_" + ANCHOR_DATE.replace("-", "_")

def die(msg, code=1):
    print(f"[中止] {msg}"); sys.exit(code)

def canon_of(snap):
    return json.dumps(snap, sort_keys=True, ensure_ascii=True, separators=(",", ":"))

def hash_of(snap):
    """固定哈希的唯一定义: SHA-256(规范序列化字节串)"""
    return hashlib.sha256(canon_of(snap).encode("utf-8")).hexdigest()

def write_candidate(snap, target=None):
    """候选快照落盘(v2.2.1): 写入失败(OSError) → 明确错误信息+退出码5, 不输出任何统计。
    联网不一致分支与 --write-candidate-dry 定点测试共用本函数: 被测代码即生产代码。"""
    if target is None:
        target = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              f"候选快照_待审核_{hash_of(snap)[:8]}.json")
    try:
        with open(target, "w", encoding="utf-8") as f:
            f.write(canon_of(snap))
    except OSError as e:
        die(f"候选快照写入失败({target}): {e} —— IO错误", 5)
    return target

def fetch_unadj(code):
    """每标的一次请求(900根), 锚点与窗口行情同响应派生, 不二次请求"""
    url = f"https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?param={code},day,,,900,"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    d = json.load(urllib.request.urlopen(req, timeout=20))
    return [{"d": r[0], "o": float(r[1]), "c": float(r[2]), "h": float(r[3]), "l": float(r[4])} for r in d["data"][code]["day"]]

def _num(x):
    """合法价格: int/float(排除bool), 有限, >0"""
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and x > 0

def validate(snap):
    """完整性门检(通用规则, 与固定哈希无关), 返回错误清单(空=通过)"""
    errs = []
    if not isinstance(snap, dict):
        return [f"快照顶层结构非法({type(snap).__name__}), 应为JSON对象"]
    meta = snap.get("meta")
    if not isinstance(meta, dict):
        errs.append("缺meta或meta非对象")
    elif meta.get("anchor_prev_close") != ANCHOR_DATE:
        errs.append(f"meta.anchor_prev_close={meta.get('anchor_prev_close')!r} ≠ 锚点日 {ANCHOR_DATE}")
    for c, _ in CODES:
        if c not in snap: errs.append(f"缺标的 {c}")
    for code, name in CODES:
        if code not in snap: continue
        node = snap[code]
        if not isinstance(node, dict):
            errs.append(f"{name}: 标的节点非对象({type(node).__name__})"); continue
        # 锚点三重校验: 键名绑定锚点日 / 数值合法 / OHLC包络
        if AKEY not in node:
            errs.append(f"{name}: 缺锚点键 {AKEY} (锚点须与 {ANCHOR_DATE} 结构绑定)")
        else:
            a = node[AKEY]
            if not isinstance(a, list) or len(a) != 4:
                errs.append(f"{name}: 锚点非长度4数组")
            elif not all(_num(x) for x in a):
                errs.append(f"{name}: 锚点含非正值/非有限数/类型非法")
            elif a[2] < max(a[0], a[1]) or a[3] > min(a[0], a[1]):
                errs.append(f"{name}: 锚点OHLC不包络开收")
        bars = node.get("bars")
        if not isinstance(bars, list):
            errs.append(f"{name}: bars非列表({type(bars).__name__})"); continue
        dates, bad = [], 0
        for i, b in enumerate(bars):
            e = None
            if not isinstance(b, (list, tuple)) or len(b) != 5:
                e = f"bar#{i} 非数组或字段数≠5"
            else:
                d, o, c, h, l = b
                if not isinstance(d, str):
                    e = f"bar#{i} 日期非字符串"
                else:
                    try:
                        if datetime.date.fromisoformat(d).weekday() >= 5: e = f"bar#{i} 周末(非交易日)"
                    except ValueError:
                        e = f"bar#{i} 非法日期{d!r}"
                    if not e and not (START <= d < EXCL): e = f"bar#{i} 日期越窗"
                    if not e: dates.append(d)
                if not e and not all(_num(x) for x in (o, c, h, l)):
                    e = f"bar#{i} 价格非正值/非有限/类型非法"
                if not e and (h < max(o, c) or l > min(o, c)):
                    e = f"bar#{i} 高低价不包络开收"
            if e:
                errs.append(f"{name}: {e}"); bad += 1
                if bad >= 5: errs.append(f"{name}: ...(逐日问题仅列前5项)"); break
        if len(bars) != EXPECTED_N: errs.append(f"{name}: 样本数 {len(bars)} ≠ {EXPECTED_N} (窗口漂移或截断)")
        if not dates or dates[0] != FIRST or dates[-1] != LAST:
            errs.append(f"{name}: 首尾日期 {dates[0] if dates else '无'}→{dates[-1] if dates else '无'} ≠ {FIRST}→{LAST}")
        if len(set(dates)) != len(dates): errs.append(f"{name}: 存在重复日期")
        if dates != sorted(dates): errs.append(f"{name}: 日期非单调递增")
        if ANCHOR_DATE in dates: errs.append(f"{name}: 锚点日 {ANCHOR_DATE} 混入窗口bar")
    return errs

def load_snapshot(path=None):
    if path is None:
        path = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else os.path.join(os.path.dirname(os.path.abspath(__file__)), DEFAULT_SNAP)
    if os.path.exists(path):
        try:
            raw = open(path, "rb").read()
        except OSError as e:
            die(f"快照文件读取失败: {e}", 5)
        try:
            snap = json.loads(raw)
        except Exception as e:
            die(f"快照文件非合法JSON: {e}", 2)
        if canon_of(snap).encode("utf-8") != raw:
            die(f"文件字节与规范序列化不一致(重排版/编码差异, {len(raw)} vs {len(canon_of(snap).encode('utf-8'))} 字节) —— 固定哈希绑定规范字节串, 拒绝计算", 1)
        errs = validate(snap)
        if errs:
            print("[完整性门检] 未通过:"); [print("  -", e) for e in errs]
            die("数据完整性校验失败 —— 拒绝计算", 2)
        if hashlib.sha256(raw).hexdigest() != SNAP_SHA256:
            die(f"哈希不匹配: sha256(文件字节)={hashlib.sha256(raw).hexdigest()} ≠ {SNAP_SHA256} —— 拒绝计算", 1)
        print(f"[快照] {os.path.basename(path)} sha256 校验通过")
        print(f"[门检通过] 规范哈希=文件字节哈希={SNAP_SHA256[:16]}… · 两股 n={EXPECTED_N} · {FIRST}→{LAST} · 单调无重复/非周末/不越窗/OHLC包络 · 锚点三重校验(键名绑{ANCHOR_DATE}+数值+包络)")
        return snap
    # ── 联网路径: 候选快照生成器(不复用旧固定哈希验收新数据) ──
    print(f"[快照缺失] {path} → 联网拉取腾讯不复权数据(每标的一次请求, 锚点同响应派生)...")
    snap = {"meta": {"source": "tencent newfqkline fq='' (不复权真实价)", "window": f"{START} <= d < {EXCL}", "anchor_prev_close": ANCHOR_DATE, "codes": {}}}
    for code, name in CODES:
        try:
            rows = fetch_unadj(code)
        except Exception as e:
            die(f"联网取数失败({code}): {e} —— 中止, 未产生任何统计", 5)
        win = [r for r in rows if START <= r["d"] < EXCL]
        ai = [i for i, r in enumerate(rows) if r["d"] == ANCHOR_DATE]
        if not ai or ai[0] + 1 >= len(rows) or rows[ai[0] + 1]["d"] != FIRST:
            die(f"{name}: 线上取数左端已漂移(最早bar {rows[0]['d']}), 无法锚定 {ANCHOR_DATE} 前收 —— 请改用快照离线运行", 2)
        a = rows[ai[0]]
        snap[code] = {"name": name, AKEY: [a["o"], a["c"], a["h"], a["l"]],
                      "bars": [[r["d"], r["o"], r["c"], r["h"], r["l"]] for r in win]}
    errs = validate(snap)
    if errs:
        print("[完整性门检] 未通过:"); [print("  -", e) for e in errs]
        die("联网数据完整性校验失败 —— 拒绝计算", 2)
    ch = hash_of(snap)
    if ch != SNAP_SHA256:
        cand = write_candidate(snap)  # v2.2.1: 写入失败(OSError)→退出码5, 不输出统计
        print(f"[联网数据] 完整性门检通过, 但 sha256={ch} ≠ 固定快照 {SNAP_SHA256}")
        print(f"[候选快照] 已写入 {os.path.basename(cand)} —— 仅生成待审核快照, 不进入固定快照统计")
        die("联网数据与固定快照不一致: 请人工审核候选快照后, 再作为新基准快照交付", 4)
    print(f"[联网数据] 完整性门检通过, sha256 与固定快照逐字节一致({ch[:16]}…) → 进入统计")
    return snap

def selftest():
    """故障注入自检(v2.2): 每项以子进程实际执行本校验入口, 记录原始输出与退出码,
    并断言失败场景无任何统计输出。可用 SELFTEST_TMP 指定临时目录(缺省脚本旁 .selftest_tmp)"""
    import subprocess, shutil
    script = os.path.abspath(__file__); base = os.path.dirname(script)
    snap_path = os.path.join(base, DEFAULT_SNAP)
    if not os.path.exists(snap_path): die(f"自检需要快照文件: {snap_path}", 2)
    raw = open(snap_path, "rb").read()
    if hashlib.sha256(raw).hexdigest() != SNAP_SHA256: die("自检需有效快照(哈希不符)", 1)
    good = json.loads(raw)
    work = os.environ.get("SELFTEST_TMP") or os.path.join(base, ".selftest_tmp")
    os.makedirs(work, exist_ok=True)

    def write_canon(p, s): open(p, "w", encoding="utf-8").write(canon_of(s))

    def mut_price(s):
        b = s["sh600105"]["bars"][10]
        b[2] = b[1] if b[2] != b[1] else b[3]  # 包络安全的收盘价篡改

    SC = [
        ("正常路径(交付快照)", None, 0, None),
        ("哈希门·篡改价格(保持OHLC包络)", mut_price, 1, None),
        ("口径门·重排版(语义不变)", None, 1, lambda p: open(p, "w", encoding="utf-8").write(json.dumps(good, indent=2, ensure_ascii=False))),
        ("完整性·样本截断", lambda s: s["sh600105"]["bars"].pop(), 2, None),
        ("完整性·首日漂移", lambda s: s["sh600105"]["bars"][0].__setitem__(0, "2023-07-05"), 2, None),
        ("完整性·重复日期", lambda s: s["sh600105"]["bars"][7].__setitem__(0, s["sh600105"]["bars"][6][0]), 2, None),
        ("完整性·OHLC破损", lambda s: s["sh600105"]["bars"][5].__setitem__(3, 0.0), 2, None),
        ("完整性·缺标的", lambda s: s.pop("sh603986"), 2, None),
        ("完整性·锚点OHLC不包络", lambda s: s["sh600105"].__setitem__(AKEY, [3.54, 3.45, 3.40, 3.60]), 2, None),
        ("完整性·锚点键名错绑日期", lambda s: s["sh600105"].__setitem__("anchor_2023_07_02", s["sh600105"].pop(AKEY)), 2, None),
        ("防御·NaN价格", lambda s: s["sh600105"]["bars"][10].__setitem__(2, float("nan")), 2, None),
        ("防御·Infinity价格", lambda s: s["sh600105"]["bars"][10].__setitem__(2, float("inf")), 2, None),
        ("防御·字符串价格", lambda s: s["sh600105"]["bars"][10].__setitem__(2, "6.5"), 2, None),
        ("防御·bars非列表", lambda s: s["sh600105"].__setitem__("bars", {"oops": 1}), 2, None),
        ("防御·非法JSON", None, 2, lambda p: open(p, "wb").write(b"{oops")),
    ]
    npass = 0
    try:
        for idx, (name, fn, want, writer) in enumerate(SC):
            p = os.path.join(work, f"{idx:02d}_{name[:12]}.json")
            if writer: writer(p)
            elif fn:
                s = json.loads(json.dumps(good)); fn(s); write_canon(p, s)
            else: open(p, "wb").write(raw)
            r = subprocess.run([sys.executable, script, p], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
            out = (r.stdout + ("\n[stderr] " + r.stderr if r.stderr.strip() else "")).strip()
            has_stats = "胜率" in out
            ok = (r.returncode == want) and (has_stats == (want == 0))
            npass += ok
            print(f"### [{idx+1:02d}/{len(SC)}] {name} → 退出码={r.returncode}(期望{want}) 统计输出={'有' if has_stats else '无'} [{'PASS' if ok else 'FAIL'}]")
            for ln in out.splitlines(): print("    " + ln)
            print()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(f"[自检] {npass}/{len(SC)} 项通过 (全部为子进程实际执行校验入口; 失败场景已断言无任何统计输出)")
    sys.exit(0 if npass == len(SC) else 3)

def test_writefail():
    """定点测试(v2.2.1, 响应第三轮终审): 候选快照写入失败(OSError) → 退出码5且无任何统计输出。
    以子进程实际执行 --write-candidate-dry(本地有效快照 + 不可写目标路径), 不联网、不重跑15项自检。
    不可写路径构造: 目标路径的父组件为普通文件 → open() 必然抛 OSError(Linux/Windows均可复现)。
    清理安全性(第四轮审查修正): 临时目录为 WRITEFAIL_TMP(缺省=脚本目录)内 mkdtemp 全新独占子目录,
    结束时 rmtree 仅删除该自建子目录 —— WRITEFAIL_TMP 指向已有目录时不会误删其中其他文件。"""
    import subprocess, shutil, tempfile
    script = os.path.abspath(__file__); base = os.path.dirname(script)
    snap_path = os.path.join(base, DEFAULT_SNAP)
    if not os.path.exists(snap_path):
        die(f"定点测试需要快照文件: {snap_path}", 2)
    parent = os.environ.get("WRITEFAIL_TMP") or base
    if not os.path.isdir(parent):
        die(f"WRITEFAIL_TMP 须为已存在目录: {parent} —— 请指定有效父目录", 5)
    try:
        work = tempfile.mkdtemp(prefix="writefail_test_", dir=parent)  # 全新独占子目录
    except OSError as e:
        die(f"定点测试独占子目录创建失败({parent}): {e} —— IO错误", 5)
    try:
        blocker = os.path.join(work, "blocker_file_as_parent")
        with open(blocker, "w") as f:
            f.write("x")  # 占位普通文件: 其子路径不可作为写入目标
        bad = os.path.join(blocker, "candidate_should_fail.json")
        r = subprocess.run([sys.executable, script, "--write-candidate-dry", snap_path, bad],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        out = (r.stdout + ("\n[stderr] " + r.stderr if r.stderr.strip() else "")).strip()
        has_stats = any(k in out for k in ("胜率", "均值", "累计", "== "))
        checks = [("退出码=5(IO错误, 与退出码表一致)", r.returncode == 5),
                  ("错误信息含'候选快照写入失败'", "候选快照写入失败" in out),
                  ("无任何统计输出", not has_stats)]
        allok = all(ok for _, ok in checks)
        print(f"### [定点] 候选快照写入失败(OSError) → 退出码={r.returncode}(期望5) 统计输出={'有' if has_stats else '无'} [{'PASS' if allok else 'FAIL'}]")
        for ln in out.splitlines():
            print("    " + ln)
        print()
        for label, ok in checks:
            print(f"  断言·{label}: {'PASS' if ok else 'FAIL'}")
        sys.exit(0 if allok else 3)
    finally:
        shutil.rmtree(work, ignore_errors=True)

if __name__ == "__main__" and "--selftest" in sys.argv:
    selftest()

if __name__ == "__main__" and "--test-writefail" in sys.argv:
    test_writefail()

if __name__ == "__main__" and sys.argv[1:2] == ["--write-candidate-dry"]:
    # 定点测试辅助入口(内部): 本地有效快照走完整校验链后调用 write_candidate(指定目标路径),
    # 不联网、不进入统计; 与联网不一致分支共用 write_candidate(), 被测代码即生产代码
    if len(sys.argv) != 4:
        die("用法: --write-candidate-dry <快照.json> <目标路径>", 2)
    _snap = load_snapshot(sys.argv[2])
    _p = write_candidate(_snap, sys.argv[3])
    print(f"[dry] 候选快照写入成功: {_p} (定点测试辅助入口, 未进入统计)")
    sys.exit(0)

def bt(pairs, X=None, cond=None):
    out = []
    for r, pc in pairs:
        if cond and not cond(r, pc): continue
        sell = r["o"]
        buy = r["c"] if X is None else (r["o"] * (1 - X) if r["l"] <= r["o"] * (1 - X) else r["c"])
        out.append((sell - buy) / sell - FEE)
    return out

def st(v):
    return f"n={len(v)} 胜率{sum(x>0 for x in v)/len(v)*100:.2f}% 均值{sum(v)/len(v)*100:.4f}% 中位{statistics.median(v)*100:.4f}% 累计{sum(v)*100:.2f}%"

snap = load_snapshot()
CONDS = [("全样本", None), ("高开>=0.5%", lambda r,pc: r["o"] >= pc*1.005), ("低开", lambda r,pc: r["o"] < pc)]
print(f"[窗口] {START} <= d < {EXCL} (两端钉死) · 费用FEE={FEE} · 口径: 不复权真实价")
for code in ["sh600105", "sh603986"]:
    node = snap[code]; name = node["name"]
    bars = [{"d": b[0], "o": b[1], "c": b[2], "h": b[3], "l": b[4]} for b in node["bars"]]
    pairs = [(bars[0], node["anchor_2023_07_03"][1])] + [(bars[i], bars[i-1]["c"]) for i in range(1, len(bars))]
    print(f"\n== {name} {code} (n={len(pairs)}, {pairs[0][0]['d']}→{pairs[-1][0]['d']}) ==")
    for tag, X in [("A(开盘卖·收盘买回)", None), ("B1(跌1%买回,未触收盘买)", 0.01), ("B2(跌2%买回,未触收盘买)", 0.02)]:
        for gname, cond in CONDS:
            print(f" {tag}·{gname}: {st(bt(pairs, X, cond))}")
    print(" 分年·A(毛/含费/含费胜率):")
    for yr in ["2023", "2024", "2025", "2026"]:
        sub = [(r, pc) for r, pc in pairs if r["d"].startswith(yr)]
        if not sub: continue
        gross = [(r["o"] - r["c"]) / r["o"] for r, pc in sub]
        nets = [g - FEE for g in gross]
        print(f"  {yr}: n={len(sub)} 毛{sum(gross)/len(gross)*100:+.4f}% 含费{sum(nets)/len(nets)*100:+.4f}% 含费胜率{sum(x>0 for x in nets)/len(nets)*100:.2f}%")
    for tag, X in [("B1", 0.01), ("B2", 0.02)]:
        t = sum(1 for r, pc in pairs if r["l"] > r["o"] * (1 - X))
        print(f" {tag} 未触{int(X*100)}%阈值天数: {t} ({t/len(pairs)*100:.1f}%)")
    lu, yizi, ld = 0, 0, 0
    for r, pc in pairs:
        lim_u = float((Decimal(str(pc)) * Decimal("1.1")).quantize(Decimal("0.01"), ROUND_HALF_UP))
        lim_d = float((Decimal(str(pc)) * Decimal("0.9")).quantize(Decimal("0.01"), ROUND_HALF_UP))
        if abs(r["c"] - lim_u) < 0.001:
            lu += 1; yizi += (r["o"] == r["c"] == r["h"] == r["l"])
        if abs(r["o"] - lim_d) < 0.001: ld += 1
    print(f" 可成交性风险日(真实价): 涨停收盘{lu}天(一字{yizi}) 跌停开盘{ld}天 → 详见 不可成交日与标签敏感日清单.csv")
