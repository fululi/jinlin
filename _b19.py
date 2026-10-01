#!/usr/bin/env python3
# _b19.py — 温度换骨架(v0.82.3 组成部分, 与_b18同批推送)
# 根因(实测): 东财clist翻页全A采样在风控下必败——56页3并发连发全量空返, IP封禁数小时(沙盒实证);
#   用户手机端"一直都是失败"=同一风控。全A翻页方案在他网络下结构性不可靠, 必须换源。
# 方案: 快通道(3个轻量单发, 不同风控域):
#   ①指数快照 ulist secids=1.000001,0.399001 fields=f48,f104,f105,f106 → 涨/跌/平家数+沪深成交额(push2→push2delay互备)
#   ②③涨/跌停池 push2ex getTopicZTPool/getTopicDTPool data.tc(date=今日) → 官方口径涨跌停数
#   增强通道(原clist翻页, PZ=100): 仅补分桶/主力净额/钻取明细/cov, 失败静默不弹"采样失败"
#   mtDrillJL: 明细二次仍空→明示"东财限流"并清等待, 不再死循环重采
import io, sys

F = "index.html"
s = io.open(F, encoding="utf-8").read()

A = "  function loadMTempJL(force) {"
B = "  function mtDrillJL(kind) {"
ia = s.index(A)
ib = s.index(B)
assert ia < ib, "anchor order broken"

NEW_FN = r'''  function loadMTempJL(force) {
    /* v0.82.3: 温度换骨架——东财clist翻页全A采样在风控下必败("一直失败"根因, 实测连发全量空返+IP封禁)。
       快通道(本函数): ①指数快照f104/105/106涨跌平家数+f48成交额(1发双主机互备) ②③涨/跌停池tc官方口径(2发)
       = 3个轻量单发出全主指标; 增强通道(loadMTempDeepJL, 原clist翻页): 只补分桶/主力净额/钻取明细, 失败静默。 */
    const now = Date.now();
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem("jinlin_mtemp_v1") || "null");
    } catch (e) {
    }
    if (cached && cached.data && !mtempJL.data) {
      mtempJL.data = cached.data;
      mtempJL.at = cached.at || 0;
      renderMTempJL();
    }
    if (mtempJL.loading) return;
    if (!force && cached && now - cached.at < 9e5) return;
    mtempJL.loading = true;
    const u = $("mtUpdatedJL");
    if (u) u.textContent = "采样中…";
    const acc = { up: -1, down: 0, flat: 0, lu: -1, ld: -1, amt: 0 };
    let left = 3, bad = 0;
    const finFast = () => {
      if (--left > 0) return;
      mtempJL.loading = false;
      if (bad || !(acc.up >= 0) || acc.lu < 0 || acc.ld < 0) {
        if (u) u.textContent = "采样失败 · 点我重试";
        return;
      }
      const old = mtempJL.data || {}, sampledN = Math.max(1, acc.up + acc.down + acc.flat), upR = acc.up / Math.max(1, acc.up + acc.down);
      const t = Math.max(0, Math.min(100, Math.round(50 + (upR - 0.5) * 100 + (acc.lu - acc.ld) / sampledN * 100)));
      let prevAmt = null;
      try {
        const h = JSON.parse(localStorage.getItem("jinlin_mtemp_amt_v1") || "{}"), today = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE"), keys = Object.keys(h).filter((k) => k < today && h[k] > 1e11).sort();
        if (keys.length) prevAmt = h[keys[keys.length - 1]];
        h[today] = Math.round(acc.amt);
        localStorage.setItem("jinlin_mtemp_amt_v1", JSON.stringify(h));
      } catch (e) {
      }
      const data = { t, up: acc.up, down: acc.down, flat: acc.flat, lu: acc.lu, ld: acc.ld, amt: acc.amt, amtDiff: prevAmt != null ? acc.amt - prevAmt : null, bu: old.bu || [0, 0, 0, 0], bd: old.bd || [0, 0, 0, 0], fund: null, verdict: old.verdict || "—", cov: null, time: (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) };
      mtempJL.data = data;
      mtempJL.at = now;
      try {
        localStorage.setItem("jinlin_mtemp_v1", JSON.stringify({ at: now, data }));
      } catch (e) {
      }
      renderMTempJL();
      renderMarketFundsJL();
      loadMTempDeepJL();
    };
    const eatSnap = (d) => {
      const arr = d && d.data && d.data.diff || [];
      let up = 0, dn = 0, fl = 0, am = 0;
      arr.forEach((q) => {
        up += Number(q.f104) || 0;
        dn += Number(q.f105) || 0;
        fl += Number(q.f106) || 0;
        am += Number(q.f48) || 0;
      });
      if (!(up + dn + fl > 0)) { bad++; return; }
      acc.up = up;
      acc.down = dn;
      acc.flat = fl;
      acc.amt = am;
    };
    const snapUrl = (h) => h + "/api/qt/ulist.np/get?fltt=2&invt=2&secids=1.000001,0.399001&fields=f12,f48,f104,f105,f106&ut=" + JL_UT;
    emJsonp(snapUrl("https://push2.eastmoney.com"), (e, d) => {
      if (!e && d && d.data && (d.data.diff || []).length) {
        eatSnap(d);
        finFast();
      } else emJsonp(snapUrl("https://push2delay.eastmoney.com"), (e2, d2) => {
        if (!e2) eatSnap(d2); else bad++;
        finFast();
      }, 8e3);
    }, 8e3);
    const _dt8 = jlYMD(/* @__PURE__ */ new Date()).replace(/-/g, "");
    emJsonp("https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=1&sort=fbt:asc&date=" + _dt8, (e, d) => {
      if (!e && d && d.data && Number.isFinite(+d.data.tc)) acc.lu = +d.data.tc; else bad++;
      finFast();
    }, 8e3);
    emJsonp("https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=1&sort=fbt:asc&date=" + _dt8, (e, d) => {
      if (!e && d && d.data && Number.isFinite(+d.data.tc)) acc.ld = +d.data.tc; else bad++;
      finFast();
    }, 8e3);
  }
  function loadMTempDeepJL() {
    /* v0.82.3: 增强通道(原clist全A翻页)——只补分桶bu/bd、主力净额fund、钻取明细rows、覆盖率cov。
       东财风控下常失败, 一律静默(主指标已由快通道出数, 不再弹"采样失败"不自动重试)。 */
    if (mtempJL._deepLoading) return;
    mtempJL._deepLoading = true;
    const PZ = 100, acc = { up: 0, down: 0, flat: 0, amt: 0, rows: [], bu: [0, 0, 0, 0], bd: [0, 0, 0, 0] };
    let total = 0, sentPages = 0, donePages = 0, maxPn = 56;
    const luLimJL = (c, n2) => /ST/i.test(n2 || "") ? 4.8 : /^(30|68)/.test(String(c || "").replace(/^(sh|sz)/, "")) ? 19.8 : /^(8|4|92)/.test(String(c || "").replace(/^(sh|sz)/, "")) ? 29.8 : 9.8;
    const eat = (p, amtW, q) => {
      acc.amt += amtW || 0;
      if (q && q.name) acc.rows.push({ c: String(q.code || "").replace(/^(sh|sz)/, ""), n: String(q.name), p, amt: Number(q.zljlr || 0) * 1e4 });
      if (p > 0) acc.up++;
      else if (p < 0) acc.down++;
      else acc.flat++;
      if (p > 7) acc.bu[0]++;
      else if (p > 5) acc.bu[1]++;
      else if (p > 2) acc.bu[2]++;
      else if (p > 0) acc.bu[3]++;
      if (p < -7) acc.bd[3]++;
      else if (p < -5) acc.bd[2]++;
      else if (p < -2) acc.bd[1]++;
      else if (p < 0) acc.bd[0]++;
    };
    const fin = () => {
      mtempJL._deepLoading = false;
      const sampled = acc.up + acc.down + acc.flat;
      if (!sampled) {
        /* 静默尽端: 钻取等待者给明示并清pend, 不再死循环 */
        if (window.__mtdPendJL) {
          window.__mtdPendJL = null;
          const box = $("mtDrillJL");
          if (box) box.innerHTML = '<div class="mtDh">全A明细暂不可用(东财限流) · 温度主指标不受影响</div>';
        }
        return;
      }
      const d0 = mtempJL.data;
      if (!d0) return;
      var _ix2 = byCode(index);
      const fund = acc.rows.reduce((a, r) => a + (r.amt || 0), 0), ip = Number(_ix2 == null ? void 0 : _ix2.pct), verdict = fund < 0 && ip > 0 ? "⚠ 拉涨出货 · 资金逆流" : fund < 0 ? ip < 0 ? "与指数同向出逃" : "资金净流出" : fund > 0 && ip < 0 ? "跌中吸筹 · 资金逆入" : fund > 0 ? "与指数同向流入" : "—";
      d0.bu = acc.bu;
      d0.bd = acc.bd;
      d0.fund = fund;
      d0.verdict = verdict;
      d0.cov = total ? Math.round(sampled / total * 100) : null;
      mtempJL.rows = acc.rows;
      try {
        localStorage.setItem("jinlin_mtemp_v1", JSON.stringify({ at: mtempJL.at, data: d0 }));
      } catch (e) {
      }
      renderMTempJL();
      if (window.__mtdPendJL) {
        const k2 = window.__mtdPendJL;
        window.__mtdPendJL = null;
        mtDrillJL(k2);
      }
    };
    const target = () => Math.min(maxPn, total ? Math.ceil(total / PZ) : maxPn);
    const fetchPg = (off, retry) => new Promise((resolve) => {
      const cb = "jmt" + off + "_" + Date.now();
      let sc;
      const tm = setTimeout(() => {
        try {
          resolve(null);
        } finally {
          delete window[cb];
          if (sc) sc.remove();
        }
      }, 12e3);
      window[cb] = (dd) => {
        clearTimeout(tm);
        try {
          resolve(dd);
        } finally {
          delete window[cb];
          if (sc) sc.remove();
        }
      };
      sc = document.createElement("script");
      sc.src = (retry ? "https://push2.eastmoney.com" : "https://push2delay.eastmoney.com") + "/api/qt/clist/get?fltt=2&invt=2&po=1&pz=" + PZ + "&pn=" + (Math.floor(off / PZ) + 1) + "&np=1&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f3,f6,f62,f2,f15,f16&cb=" + cb + "&_=" + Date.now();
      sc.onerror = () => {
        clearTimeout(tm);
        try {
          resolve(null);
        } finally {
          delete window[cb];
          sc.remove();
        }
      };
      document.head.appendChild(sc);
    }).then((dd) => {
      if (dd && dd.data && dd.data.total) total = dd.data.total;
      (dd && dd.data && dd.data.diff || []).forEach((q) => {
        const p = Number(q.f3);
        if (Number.isFinite(p)) eat(p, Number(q.f6 || 0), { code: q.f12, name: q.f14, zljlr: Number(q.f62 || 0) / 1e4, px: Number(q.f2 || 0), hi: Number(q.f15 || 0), lo: Number(q.f16 || 0) });
      });
    }).catch(() => {
      if (!retry) return fetchPg(off, true);
    });
    const pump = () => {
      while (sentPages < target() && sentPages - donePages < 3) {
        sentPages++;
        const off = (sentPages - 1) * PZ;
        fetchPg(off, false).finally(() => {
          donePages++;
          pump();
        });
      }
      if (sentPages > 0 && donePages >= sentPages && sentPages >= target()) setTimeout(fin, 1200);
    };
    pump();
  }
'''

s = s[:ia] + NEW_FN + s[ib:]

# mtDrillJL: 明细二次仍空 → 明示限流并清pend(不再死循环)
OLD_DRILL = r'''      } else box.innerHTML = '<div class="mtDh">\u660E\u7EC6\u91C7\u6837\u4E2D\u2026\u8BF7\u7A0D\u5019</div>';
      return;'''
NEW_DRILL = r'''      } else {
        /* v0.82.3: 明细二次仍空=东财限流, 清等待不再死循环重采 */
        window.__mtdPendJL = null;
        box.innerHTML = '<div class="mtDh">\u5168A\u660E\u7EC6\u6682\u4E0D\u53EF\u7528(\u4E1C\u8D22\u9650\u6D41) \xB7 \u6E29\u5EA6\u4E3B\u6307\u6807\u4E0D\u53D7\u5F71\u54CD</div>';
      }
      return;'''
assert s.count(OLD_DRILL) == 1, f"drill anchor count={s.count(OLD_DRILL)}"
s = s.replace(OLD_DRILL, NEW_DRILL)

# changelog 文案更新(温度段改为换骨架口径)
OLD_CL = '<!-- v0.82.3 0930 温度/国家队修复批: 温度[东财clist单页上限实为100,名义pz200每页丢一半股票→PZ100全覆盖; fields补f2/f15/f16恢复封板确认涨跌停回归准确; 页失败重试切push2双主机治"采样一直失败"]'
NEW_CL = '<!-- v0.82.3 0930 温度/国家队修复批: 温度[换骨架——clist翻页全A采样在东财风控下必败(实测连发空返+IP封禁="一直失败"根因); 快通道=指数快照f104/105/106涨跌平+f48成交额+涨/跌停池tc官方口径3个轻量单发出全主指标, 原clist翻页降为增强通道只补分桶/资金/明细且失败静默, 钻取明细限流时明示不再死循环]'
assert s.count(OLD_CL) == 1, f"cl anchor count={s.count(OLD_CL)}"
s = s.replace(OLD_CL, NEW_CL)

io.open(F, "w", encoding="utf-8").write(s)
print("index.html OK — 温度换骨架 + 钻取兜底 + changelog")

import re
blocks = [m.group(1) for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S)]
io.open('/tmp/_inline_all.js', 'w', encoding='utf-8').write('\n;\n'.join(blocks))
print("inline blocks:", len(blocks))
