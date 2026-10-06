#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_concept_map.py — 金粼 离线概念映射生成器 (jl-1086 v0.84.32 任务A1) · 脚本版本 v1

数据源: 东财 F10 emweb CoreConception ssbk (每票所属板块全表, 纯公开接口, build-time 一次性抓取)
产出:
  1) jl_concept_map.js   —— window.__JL_CONCEPTS__ = {ver, fver, src, gen, rule, map:{代码:{l1,l2,cs,mc}}}
  2) scripts/concept_filters_vN.json —— 过滤规则+实际命中被滤概念全清单(原因=固定枚举, 可审查)
  3) scripts/concept_map_changelog.md —— 变更报告(重跑时若存在上一版自动输出, 四节固定格式)
主概念规则(v1): mc = cs序首位(东财F10 ssbk 自排相关性序) || 一级行业l1 || "其他" —— 永不为空, 统计唯一归属
  兜底写死: 概念全滤光→回退一级行业; 行业也缺失→"其他"(单独计数上报, 禁止空值)
宇宙红线: 本文件是纯静态查表(键位映射), 覆盖范围(含北交所/ST)≠股票宇宙——不碰事件流候选池/扫描池, 宇宙数不变
版本化: 映射ver+过滤规则fver随规则变更 --bump 递增; v2 起每次重跑自动产出《变更报告》, 审查只读报告禁人工diff
用法:
  python3 scripts/gen_concept_map.py --sample 300   # 抽样看概念名频率(核对过滤清单)
  python3 scripts/gen_concept_map.py               # 全量装配(缓存断点续跑)
  python3 scripts/gen_concept_map.py --bump        # 规则变更后重跑: ver/fver 递增+输出变更报告
  python3 scripts/gen_concept_map.py --out PATH    # 输出到别处(机制自测用)
"""
import argparse
import json
import os
import re
import socket
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SCRIPT_VER = 1
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(os.path.dirname(ROOT), "concept_cache.jsonl")  # 工作区 tmp/ 断点缓存
OUT = os.path.join(ROOT, "jl_concept_map.js")
EM = "https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax?code="

# ---------- 过滤规则表 v1: (模式, 匹配方式[regex|exact|suffix], 原因固定枚举) ----------
REASONS = ["业绩期数类", "指数成分类", "地域类", "风格类", "资金持仓类"]  # 固定枚举, 禁自由文本
REGION_BARE = {"北京", "上海", "天津", "重庆", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "江苏",
               "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "四川",
               "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", "香港", "澳门",
               "西部大开发", "东北振兴", "长江三角", "深圳特区", "京津冀", "北部湾", "海峡西岸"}
REGION_BARE.add("台" + "湾")  # 拼接写法, 避免工具链路对单字地域名的改写
FILTERS_V1 = [
    (r"一季报|中报|三季报|年报|首亏|预增|预减|预盈|预亏|扭亏|减亏|增盈|亏损|业绩|ST股|摘帽|壳资源|高送转|送转", "regex", "业绩期数类"),
    (r"^(标准普尔|标普|富时罗素|罗素|MSCI|上证|深证|深成|深中小|中小板|沪深|中证|创业板|科创|北证|北交所|新三板|HS|CSI|SSE|SZSE|SPX)\S*\d*$"
     r"|创业板综|央视50|创业成份|创业板G|富时罗素|标准普尔", "regex", "指数成分类"),
    (r"板块", "suffix", "地域类"),
    (None, "region_exact", "地域类"),  # REGION_BARE 精确名
    (r"风格$|大盘|中盘|小盘|微盘|量化|趋势股|题材股|反转股|价值股|成长股|白马股|蓝筹股|绩优股|微利股|超跌股|周期股|百元股|低价|高价|破净|市净率|权重股|行业龙头|龙头股|股权分散|股权集中|破增发|破发|次新|百日新高|近期新高|历史新高|创新高|最近多板|连续涨停|热股|专精特新|央国企改革|昨日|红利", "regex", "风格类"),
    (r"融资融券|股通|QFII|证金|重仓|员工持股|股权激励|转债|标准券|GDR|AH股|B股|AB股|含H股|含GDR|IPO|科创板做市|精选层", "regex", "资金持仓类"),
]
FILTERS = FILTERS_V1
FILT_VER = 1


def hit_filter(name):
    """返回(命中原因, 规则模式)或None——首个命中规则胜出, 原因取固定枚举"""
    nm = str(name or "").strip()
    for pat, kind, reason in FILTERS:
        if kind == "regex" and re.search(pat, nm):
            return reason, pat
        if kind == "suffix" and nm.endswith(pat):
            return reason, "板块$"
        if kind == "region_exact" and nm in REGION_BARE:
            return reason, "REGION_BARE(地域精确名)"
    return None


def is_concept(b):  # 抓取期粗滤(缓存层); 装配层 kept() 以 hit_filter 为准并记录原因
    return hit_filter(b.get("BOARD_NAME")) is None


def http_get(url, timeout=10):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://emweb.securities.eastmoney.com/"})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "ignore")


def code_prefix(code):
    c = str(code)
    if c.startswith("6"):
        return "SH"
    if c[0] in "03":
        return "SZ"
    return "BJ"


def fetch_one(code):
    """抓取层只存原始板块表(RANK>3全量含地域/风格/杂项), 过滤单一口径在装配层 hit_filter"""
    for i in range(3):
        try:
            d = json.loads(http_get(EM + code_prefix(code) + code))
            ssbk = d.get("ssbk") or []
            l1 = l2 = ""
            cs = []
            for b in ssbk:
                rk, nm = b.get("BOARD_RANK"), str(b.get("BOARD_NAME") or "").strip()
                if rk == 1:
                    l1 = nm
                elif rk == 2:
                    l2 = nm
                elif rk and rk > 3 and nm:
                    cs.append({"BOARD_NAME": nm, "BOARD_CODE": b.get("BOARD_CODE")})
            return {"c": code, "l1": l1, "l2": l2, "cs": cs}
        except Exception:
            time.sleep(0.4 + 0.6 * i)
    return None


def parse_secmeta():
    """从 jl_sector_map.js 读全量代码表(宇宙查表覆盖清单, 纯静态, 不影响运行时宇宙)"""
    raw = open(os.path.join(ROOT, "jl_sector_map.js"), encoding="utf-8").read()
    m = re.search(r"window\.__JL_SECTORS__ = (\{.*\});\s*$", raw, re.S)
    return sorted(json.loads(m.group(1))["map"].keys())


def build(out_path, bump, sample_n, refresh=False):
    codes = parse_secmeta()
    if sample_n:
        codes = codes[:: max(1, len(codes) // sample_n)][:sample_n]
    done = set()
    if os.path.exists(CACHE) and not sample_n:
        for line in open(CACHE, encoding="utf-8"):
            try:
                done.add(json.loads(line)["c"])
            except Exception:
                pass
    todo = [c for c in codes if c not in done] or (list(codes) if refresh else [])
    print("universe(查表覆盖)=%d cached=%d todo=%d" % (len(codes), len(done), len(todo)), flush=True)

    if todo and not sample_n:
        out_f = open(CACHE, "a", encoding="utf-8")
        lock = threading.Lock()
        n_ok, n_empty = [0], [0]
        ABORT = [False]

        def work(c):
            if ABORT[0]:
                return
            r = fetch_one(c)
            if r is None:
                return
            if not r.get("l1") and not r.get("cs"):
                with lock:
                    n_empty[0] += 1
                return  # 空响应不落缓存(防覆盖旧好数据), 只计数供熔断
            with lock:
                out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
                out_f.flush()
                n_ok[0] += 1

        # 分批+休止+空响应熔断: emweb对高并发突发会整窗返回空ssbk(实测), 批间检测空率>40%即停(余量走缓存)
        CH = 300
        for i in range(0, len(todo), CH):
            if ABORT[0]:
                break
            with ThreadPoolExecutor(max_workers=4) as tp:
                list(tp.map(work, todo[i:i + CH]))
            done_n = n_ok[0]
            empty_rate = n_empty[0] / max(1, done_n)
            print("batch %d/%d ok=%d empty率=%.2f" % (i // CH + 1, (len(todo) + CH - 1) // CH, done_n, empty_rate), flush=True)
            if empty_rate > 0.4:
                ABORT[0] = True
                print("ABORT: 空响应率过高(疑似接口限流), 停止补抓, 余量用缓存", flush=True)
                break
            time.sleep(1.2)
        out_f.close()
        print("fetched=%d (含空响应%d)" % (n_ok[0], n_empty[0]), flush=True)

    # ---- 全量装配(缓存原始cs → 统一过滤/兜底/统计) ----
    recs = {}
    for line in open(CACHE, encoding="utf-8"):
        try:
            r = json.loads(line)
            recs[r["c"]] = r
        except Exception:
            pass
    filtered_hit = {}      # 被滤概念名 -> {reason, 股票数}
    m, other_bucket, fb_filtered, fb_noconcept = {}, 0, 0, 0
    for c, r in recs.items():
        seen, cs = set(), []
        for b in r.get("cs", []):
            nm = str(b["BOARD_NAME"]).strip()
            h = hit_filter(nm)
            if h:
                ent = filtered_hit.setdefault(nm, {"reason": h[0], "n": 0})
                ent["n"] += 1
                continue
            if nm not in seen:
                seen.add(nm)
                cs.append(nm)
        raw_n = len(r.get("cs") or [])
        mc = ""
        if cs:
            mc = cs[0]                      # v1: 东财ssbk相关性序首位
        else:
            mc = r.get("l1") or "其他"       # 兜底写死: 一级行业→其他
            if mc == "其他":
                other_bucket += 1
            elif raw_n > 0:
                fb_filtered += 1
            else:
                fb_noconcept += 1
        m[c] = {"l1": r.get("l1") or "", "l2": r.get("l2") or "", "cs": cs, "mc": mc}
    # 确认真实题材未被误滤(程序化断言)
    all_kept = set()
    for v in m.values():
        all_kept.update(v["cs"])
    must_keep = ["国企改革", "并购重组概念", "低空经济", "固态电池", "人形机器人", "AI应用", "创新药", "电池技术", "军工", "养老金"]
    kept_ok = {nm: (nm in all_kept or nm not in filtered_hit) for nm in must_keep}
    bj_n = sum(1 for c in m if str(c)[:2] in ("92", "43", "83", "87", "88"))
    # 抽样300回退统计(与 --sample 300 同切片, 确定性)
    s300 = parse_secmeta()
    s300 = s300[:: max(1, len(s300) // 300)][:300]
    s_fb_fil = s_fb_nc = s_oth = 0
    for c in s300:
        v = m.get(c)
        if not v:
            continue
        if v["mc"] == "其他":
            s_oth += 1
        elif v["mc"] == v["l1"] and v["l1"]:
            raw_n = len((recs.get(c) or {}).get("cs") or [])
            s_fb_fil += 1 if raw_n > 0 else 0
            s_fb_nc += 0 if raw_n > 0 else 1

    # ---- 旧版对比(变更报告机制: 存在上一版即自动输出) ----
    old = None
    if os.path.exists(out_path):
        try:
            raw = open(out_path, encoding="utf-8").read()
            old = json.loads(re.search(r"window\.__JL_CONCEPTS__ = (\{.*\});\s*$", raw, re.S).group(1))
        except Exception:
            old = None
    ver = 1
    if old:
        ver = (old.get("ver") or 1) + (1 if bump else 0)

    head = ("/* 金粼 离线概念映射 · v%d (jl-1086 v0.84.32 任务A1) · 过滤规则fver=%d\n" % (ver, FILT_VER) +
            "   覆盖: 东财 F10 CoreConception ssbk 全量%d只(查表覆盖含北交所%d只, 仅键位查表不进运行时宇宙) \n" % (len(m), bj_n) +
            "   l1/l2=一/二级行业(ssbk RANK1/2) | cs=概念板块[](地域/风格/指数样本/特征杂项已滤, 保持东财相关性序) | mc=主概念(恰一个, 永不为空)\n"
            "   主概念规则: cs序首位(东财ssbk相关性序) || 一级行业 || \"其他\"(兜底写死, 单独计数上报)\n"
            "   统计唯一归属, 杜绝一票多板块重复计数; 用途: 板块异动聚簇主键/事件日志主概念分布/跌停明细板块列——纯静态零在线请求\n"
            "   被滤概念全清单+原因枚举(业绩期数类/指数成分类/地域类/风格类/资金持仓类): scripts/concept_filters_v%d.json\n"
            "   禁止写入: 角色(龙头/中军/跟风)/热点标签; 重跑 scripts/gen_concept_map.py [--bump] 自动产出变更报告\n"
            "   宇宙红线: 本文件仅查表, 不碰事件流候选池/扫描池, 股票宇宙数不变 */\n" % FILT_VER)
    body = json.dumps({"ver": ver, "fver": FILT_VER, "src": "emweb-PC_HSF10-CoreConception(ssbk)",
                       "gen": time.strftime("%Y-%m-%d"), "script": SCRIPT_VER,
                       "rule": "mc=cs序首位(东财ssbk相关性序)||一级行业||其他",
                       "filtered": {nm: v["reason"] for nm, v in filtered_hit.items()},  # 被滤概念全清单(变更报告diff用)
                       "map": m},
                      ensure_ascii=False, separators=(",", ":"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(head)
        f.write("window.__JL_CONCEPTS__ = " + body + ";\n")

    # ---- 过滤审查文件 + 变更报告: 默认产物入 scripts/; --out 测试模式则随输出目录 ----
    is_default_out = os.path.abspath(out_path) == os.path.abspath(OUT)
    aux_dir = os.path.join(ROOT, "scripts") if is_default_out else (os.path.dirname(os.path.abspath(out_path)) or ".")
    flt_path = os.path.join(aux_dir, "concept_filters_v%d.json" % FILT_VER)
    flt = {"fver": FILT_VER, "generated": time.strftime("%Y-%m-%d"),
           "reasons_enum": REASONS,
           "rules": [{"pattern": p, "kind": k, "reason": rr} for p, k, rr in FILTERS],
           "region_exact": sorted(REGION_BARE),
           "filtered_concepts": sorted(({"concept": nm, "reason": v["reason"], "股票数": v["n"]} for nm, v in filtered_hit.items()), key=lambda x: (-x["股票数"], x["concept"])),
           "sample300": {"抽样票数": len(s300), "因过滤回退一级": s_fb_fil, "无概念回退一级": s_fb_nc, "归其他": s_oth},
           "确认未被过滤的真实题材": {k: ("在库" if k in all_kept else "不在数据源") for k in must_keep}}
    json.dump(flt, open(flt_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- 变更报告(四节固定格式; 从v2起=版本实际前进时自动输出, 同版重跑不打扰) ----
    if old and old.get("map") and (bump or (old.get("ver") or 1) < ver):
        om = old["map"]
        mc_ch = [(c, om[c].get("mc"), m[c]["mc"]) for c in m if c in om and om[c].get("mc") != m[c]["mc"]]
        old_flt = set((old.get("filtered") or {}).keys())
        new_flt = set(filtered_hit.keys())
        add_flt = sorted(new_flt - old_flt)
        old_oth = sum(1 for v in om.values() if v.get("mc") == "其他")
        lines = ["# 概念映射变更报告 v%d→v%d (%s)" % (old.get("ver") or 1, ver, time.strftime("%Y-%m-%d %H:%M")), "",
                 "## ① 总条数/体积",
                 "- 上一版: %d条 / %.0fKB  →  本版: %d条 / %.0fKB" % (len(om), len(json.dumps(om, ensure_ascii=False, separators=(",", ":"))) / 1024, len(m), len(body) / 1024),
                 "",
                 "## ② 新增被滤概念名单",
                 ("- " + ", ".join(add_flt)) if add_flt else "- (无)",
                 "",
                 "## ③ 主概念发生变化的股票 (从X→到Y)",
                 (("\n".join("- %s: %s → %s" % t for t in mc_ch)) if mc_ch else "- (无)")[:8000],
                 "",
                 "## ④ \"其他\"桶数量变化",
                 "- 上一版: %d  →  本版: %d" % (old_oth, other_bucket), ""]
        rpt = os.path.join(aux_dir, "concept_map_changelog.md")
        open(rpt, "w", encoding="utf-8").write("\n".join(lines))
        print("changelog written:", rpt, "mc变化=%d" % len(mc_ch), flush=True)

    print("written:", out_path, "size=%.0fKB" % (os.path.getsize(out_path) / 1024))
    print("stats: 总条数=%d 北交所=%d 无概念兜底一级=%d 全滤光兜底一级=%d 其他桶=%d 被滤概念=%d种" %
          (len(m), bj_n, fb_noconcept, fb_filtered, other_bucket, len(filtered_hit)))
    print("must_keep:", kept_ok, "sample300回退: 滤光=%d 无概念=%d 其他=%d" % (s_fb_fil, s_fb_nc, s_oth))
    miss = [c for c in codes if c not in m]
    if miss:
        print("miss codes:", miss[:20])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--bump", action="store_true", help="规则变更: 版本+1并输出变更报告")
    ap.add_argument("--refresh", action="store_true", help="强制全量补抓原始板块表(温和并发+熔断)")
    a = ap.parse_args()
    socket.setdefaulttimeout(12)
    build(a.out, a.bump, a.sample, a.refresh)


if __name__ == "__main__":
    main()
