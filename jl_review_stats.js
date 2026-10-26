/* 金粼 ATR / 盘中 Fib 真实复盘台账 v1
 * 只读现有报价、日K、1/5/15分K；无网络请求，不读验收样例。
 * localStorage 本地持久化；锚点形成后的行情才计首次触及，跨日尺持续跟踪。
 */
(function (root) {
  "use strict";
  const KEY = "jl_atr_fib_review_v1", CAP = 4000;
  const LOW_LEVELS = [0.382, 0.618, 0.786], HIGH_LEVELS = [1.272, 1.618, 2.618];
  const MODE = { low: "低开回抽", highDay: "高开日内", highCross: "高开跨日" };
  let mem = null;

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function codeOf(v) { return String(v || "").replace(/^(sh|sz|bj)/i, ""); }
  function dayOf(v) {
    if (typeof v === "number" && v > 1e12) return localDay(new Date(v));
    const s = String(v == null ? "" : v), m = s.match(/^(20\d{2})-?(\d{2})-?(\d{2})/);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
  }
  function timeOf(v) {
    const s = String(v == null ? "" : v);
    if (/^\d{12,14}$/.test(s)) return s.slice(8, 10) + ":" + s.slice(10, 12);
    const m = s.match(/[T ](\d{2}):(\d{2})/);
    return m ? m[1] + ":" + m[2] : "";
  }
  function localDay(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function finalDay(day) {
    const today = localDay(), nw = new Date();
    return !!day && (day < today || day === today && nw.getHours() * 60 + nw.getMinutes() >= 905);
  }
  function sane(r) {
    return r && [r.o, r.c, r.h, r.l].every((x) => Number.isFinite(Number(x)) && Number(x) > 0) && Number(r.h) >= Math.max(Number(r.o), Number(r.c), Number(r.l)) && Number(r.l) <= Math.min(Number(r.o), Number(r.c), Number(r.h));
  }
  function bars(rows) {
    return (Array.isArray(rows) ? rows : []).map((r) => ({ t: r.t || "", day: dayOf(r.t), time: timeOf(r.t), o: num(r.o), c: num(r.c), h: num(r.h), l: num(r.l) })).filter((r) => r.day && sane(r)).sort((a, b) => String(a.t) < String(b.t) ? -1 : String(a.t) > String(b.t) ? 1 : 0);
  }
  function blank() { return { version: 1, records: {} }; }
  function load() {
    if (mem) return mem;
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      mem = v && v.version === 1 && v.records ? v : blank();
    } catch (e) { mem = blank(); }
    return mem;
  }
  function save() {
    const db = load(), rows = Object.keys(db.records).map((k) => db.records[k]);
    if (rows.length > CAP) {
      rows.sort((a, b) => String(a.updatedAt) < String(b.updatedAt) ? -1 : 1);
      const remove = rows.slice(0, rows.length - CAP).filter((r) => r.status !== "active");
      remove.forEach((r) => delete db.records[r.key]);
    }
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }
  function put(rec) {
    if (!rec || !rec.key) return;
    const db = load(), old = db.records[rec.key] || {};
    rec.createdAt = old.createdAt || rec.createdAt || new Date().toISOString();
    rec.updatedAt = new Date().toISOString();
    db.records[rec.key] = Object.assign({}, old, rec);
    save();
  }
  function quoteDay(stock) {
    const q = stock && stock.quoteAt;
    if (/^\d{13}$/.test(String(q))) return localDay(new Date(Number(q)));
    if (/^\d{10}$/.test(String(q))) return localDay(new Date(Number(q) * 1000));
    return dayOf(q || stock && stock.quoteDate);
  }
  function actualFor(stock, day, daily) {
    const row = daily.filter((r) => r.day === day).pop(), qok = stock && stock.quoteReady === true && quoteDay(stock) === day;
    const out = { open: row ? row.o : 0, high: row ? row.h : 0, low: row ? row.l : 0, close: row ? row.c : 0 };
    if (qok) {
      out.open = num(stock.open) || out.open;
      out.high = Math.max(out.high, num(stock.high));
      out.low = out.low > 0 && num(stock.low) > 0 ? Math.min(out.low, num(stock.low)) : num(stock.low) || out.low;
      out.close = num(stock.base) || out.close;
    }
    return out;
  }
  function observeATR(stock, model, dailyRows) {
    try {
      if (!stock || !model || !model.params || !model.params.ok || !model.anchor) return;
      const a = model.anchor, p = model.params, day = dayOf(a.date || model.sessionDay), code = codeOf(model.code || stock.code);
      if (!day || !code || !(a.open > 0 && a.upper > 0 && a.lower > 0)) return;
      const daily = bars(dailyRows), actual = actualFor(stock, day, daily), done = finalDay(day);
      const key = ["ATR", day, code, p.paramDate, Number(a.open).toFixed(4)].join("|"), old = load().records[key] || {};
      actual.high = Math.max(num(old.high), actual.high);
      actual.low = num(old.low) > 0 && actual.low > 0 ? Math.min(num(old.low), actual.low) : actual.low || num(old.low);
      actual.close = actual.close || num(old.close);
      put({ key, kind: "ATR", date: day, code, name: stock.name || code, paramDate: p.paramDate || "", atr: num(p.atr), kUp: num(p.kUp), kDown: num(p.kDown), stale: !!p.stale,
        open: num(a.open), actualOpen: actual.open || num(old.actualOpen), upper: num(a.upper), lower: num(a.lower), high: actual.high, low: actual.low, close: actual.close,
        upperHit: actual.high > 0 ? actual.high >= a.upper : null, lowerHit: actual.low > 0 ? actual.low <= a.lower : null,
        inside: done && actual.high > 0 && actual.low > 0 ? actual.high <= a.upper && actual.low >= a.lower : null,
        status: done ? "closed" : "active", finalized: done });
    } catch (e) {}
  }
  function levels(kind, high, low) {
    const ratios = kind === "low" ? LOW_LEVELS : HIGH_LEVELS;
    return ratios.map((r) => ({ ratio: r, price: low + (high - low) * r }));
  }
  function fibKey(mode, day, code, high, low, version) {
    return ["FIB", mode, day, code, Number(high).toFixed(4), Number(low).toFixed(4), version || 1].join("|");
  }
  function baseFib(mode, day, stock, high, low, at, version, source) {
    const code = codeOf(stock.code);
    return { key: fibKey(mode, day, code, high, low, version), kind: "FIB", mode, modeName: MODE[mode], date: day, code, name: stock.name || code,
      anchorVersion: version || 1, anchorHigh: high, anchorLow: low, anchorTime: at || "", anchorSource: source || "15分K",
      levels: levels(mode === "low" ? "low" : "high", high, low), firstHit: {}, invalidAt: "", invalidReason: "", status: "active", finalized: false };
  }
  function touch(rec, bar) {
    if (!bar || rec.status === "invalid" || rec.status === "expired") return;
    rec.levels.forEach((lv) => {
      const k = String(lv.ratio);
      if (!rec.firstHit[k] && bar.h >= lv.price && bar.l <= lv.price) rec.firstHit[k] = bar.t || (bar.day + " " + bar.time);
    });
  }
  function finish(rec, day) {
    if (rec.status === "active" && finalDay(day)) { rec.status = "closed"; rec.finalized = true; }
    else rec.finalized = rec.status !== "active";
    return rec;
  }
  function runningLow(mode, day, stock, prevHigh, dayBars) {
    const out = []; let rec = null;
    dayBars.forEach((b) => {
      if (!rec || b.l < rec.anchorLow) {
        if (rec) { rec.status = "invalid"; rec.finalized = true; rec.invalidAt = b.t; rec.invalidReason = "低点下移，旧尺作废"; put(rec); }
        rec = baseFib(mode, day, stock, prevHigh, b.l, b.t, out.length + 1, "15分K");
        out.push(rec);
        return; // 新低所在K线同时包含此前走势，不倒算触档。
      }
      touch(rec, b);
    });
    out.forEach((r) => { if (r.status !== "invalid") finish(r, day); put(r); });
    return rec;
  }
  function updateCrossRecords(stock, daily, m15) {
    const code = codeOf(stock.code);
    Object.keys(load().records).forEach((k) => {
      const old = load().records[k];
      if (!old || old.kind !== "FIB" || old.mode !== "highCross" || old.code !== code || old.status !== "active") return;
      const rec = JSON.parse(JSON.stringify(old));
      daily.filter((b) => b.day > rec.date).forEach((b) => {
        if (rec.status !== "active") return;
        if (b.l < rec.anchorLow) { rec.status = "invalid"; rec.finalized = true; rec.invalidAt = b.t; rec.invalidReason = "后续交易日跌破锚点低"; return; }
        touch(rec, b);
      });
      if (rec.status === "active") {
        const lastDaily = daily.length ? daily[daily.length - 1].day : "";
        m15.filter((b) => b.day > rec.date && b.day >= lastDaily).forEach((b) => {
          if (rec.status !== "active") return;
          if (b.l < rec.anchorLow) { rec.status = "invalid"; rec.finalized = true; rec.invalidAt = b.t; rec.invalidReason = "后续交易日跌破锚点低"; return; }
          touch(rec, b);
        });
      }
      put(rec);
    });
  }
  function observeHighDay(stock, day, m1, m5, m15, done) {
    const exact = m1.length ? m1 : m5;
    const src = m1.length ? "1分K" : m5.length ? "5分K" : "";
    if (!src) return; // 没有开盘精细K线时不拿15分K冒充前5分钟。
    const today = exact.filter((b) => b.day === day), opening = today.filter((b) => b.time >= "09:30" && b.time <= "09:35"), pullback = today.filter((b) => b.time >= "09:45" && b.time <= "09:50");
    if (!opening.length || !pullback.length) return;
    const high = Math.max.apply(null, opening.map((b) => b.h)), low = Math.min.apply(null, pullback.map((b) => b.l));
    if (!(high > low && low > 0)) return;
    const rec = baseFib("highDay", day, stock, high, low, day + " 09:50", 1, src + "开盘5分钟高/09:45–09:50低");
    const after = (m1.length ? m1 : m15).filter((b) => b.day === day && b.time > "09:50");
    after.forEach((b) => {
      if (rec.status !== "active") return;
      if (b.l < rec.anchorLow) { rec.status = "invalid"; rec.finalized = true; rec.invalidAt = b.t; rec.invalidReason = "跌破09:45–09:50锚点低"; return; }
      touch(rec, b);
    });
    if (done && rec.status === "active") { rec.status = "closed"; rec.finalized = true; }
    put(rec);
  }
  function observeFib(stock, dailyRows, minuteRows) {
    try {
      if (!stock || !stock.code) return;
      const daily = bars(dailyRows), data = minuteRows || {}, m15 = bars(data.m15), m1 = bars(data.m1), m5 = bars(data.m5);
      updateCrossRecords(stock, daily, m15);
      const qd = quoteDay(stock), lastDay = daily.length ? daily[daily.length - 1].day : "", day = stock.quoteReady === true && qd ? qd : lastDay;
      if (!day) return;
      const today = daily.filter((b) => b.day === day).pop(), open = stock.quoteReady === true && qd === day && num(stock.open) > 0 ? num(stock.open) : today ? today.o : 0;
      const prev = daily.filter((b) => b.day < day).pop();
      if (!(open > 0 && prev && prev.c > 0 && prev.h > 0)) return;
      const dayBars = m15.filter((b) => b.day === day);
      if (open < prev.c && dayBars.length) runningLow("low", day, stock, prev.h, dayBars);
      if (open > prev.c) {
        if (dayBars.length) {
          const cross = runningLow("highCross", day, stock, prev.h, dayBars);
          if (cross && cross.status === "closed") { cross.status = "active"; cross.finalized = false; put(cross); }
        }
        observeHighDay(stock, day, m1, m5, m15, finalDay(day));
      }
    } catch (e) {}
  }
  function rows() { return Object.keys(load().records).map((k) => load().records[k]); }
  function ratio(n, d) { return d ? (n / d * 100).toFixed(1) + "%" : ""; }
  function count(list, fn) { return list.filter(fn).length; }
  function summary() {
    const out = [], all = rows(), codes = Array.from(new Set(all.map((r) => r.code))).sort();
    codes.forEach((code) => {
      const own = all.filter((r) => r.code === code), name = own.length ? own[0].name : code;
      /* 缺少当日高低价的定稿记录不进入分母，避免把“无样本”算成未触及/区外。 */
      const atr = own.filter((r) => r.kind === "ATR" && r.finalized && Number(r.high) > 0 && Number(r.low) > 0 && r.inside !== null && r.upperHit !== null && r.lowerHit !== null);
      if (atr.length) out.push({ kind: "ATR", code, name, mode: "ATR5开盘参考区", samples: atr.length, finalized: atr.length,
        inside: ratio(count(atr, (r) => r.inside === true), atr.length), upper: ratio(count(atr, (r) => r.upperHit === true), atr.length), lower: ratio(count(atr, (r) => r.lowerHit === true), atr.length) });
      Object.keys(MODE).forEach((mode) => {
        const fib = own.filter((r) => r.kind === "FIB" && r.mode === mode && r.finalized);
        if (!fib.length) return;
        const row = { kind: "Fib", code, name, mode: MODE[mode], samples: fib.length, finalized: fib.length,
          invalid: ratio(count(fib, (r) => r.status === "invalid"), fib.length), noHit: ratio(count(fib, (r) => !Object.keys(r.firstHit || {}).length), fib.length) };
        (mode === "low" ? LOW_LEVELS : HIGH_LEVELS).forEach((lv) => { row["r" + lv] = ratio(count(fib, (r) => r.firstHit && r.firstHit[String(lv)]), fib.length); });
        out.push(row);
      });
    });
    if (!out.length) out.push({ kind: "ATR/Fib", code: "", name: "", mode: "暂无真实定稿样本", samples: 0 });
    return out;
  }
  function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
  function line(a) { return a.map(q).join(","); }
  function csv() {
    const L = ["\ufeff[汇总]"], H = ["类型", "代码", "名称", "模式", "定稿样本数", "全日在区内率", "触上沿率", "触下沿率", "失效率", "未到任何档率", "0.382到档率", "0.618到档率", "0.786到档率", "1.272到档率", "1.618到档率", "2.618到档率"];
    L.push(line(H));
    summary().forEach((r) => L.push(line([r.kind, r.code, r.name, r.mode, r.samples, r.inside || "", r.upper || "", r.lower || "", r.invalid || "", r.noHit || "", r["r0.382"] || "", r["r0.618"] || "", r["r0.786"] || "", r["r1.272"] || "", r["r1.618"] || "", r["r2.618"] || ""])));
    L.push("", "[ATR明细]", line(["日期", "代码", "名称", "参数日", "ATR5", "kUp", "kDown", "预测开盘", "预测上沿", "预测下沿", "实际开盘", "实际最高", "实际最低", "实际收盘/现价", "最高-上沿", "下沿-最低", "触上沿", "触下沿", "全日在区内", "参数陈旧", "状态", "更新时间"]));
    rows().filter((r) => r.kind === "ATR").sort((a, b) => a.date < b.date ? -1 : 1).forEach((r) => L.push(line([r.date, r.code, r.name, r.paramDate, r.atr, r.kUp, r.kDown, r.open, r.upper, r.lower, r.actualOpen, r.high, r.low, r.close, r.high ? r.high - r.upper : "", r.low ? r.lower - r.low : "", r.upperHit == null ? "" : r.upperHit ? "是" : "否", r.lowerHit == null ? "" : r.lowerHit ? "是" : "否", r.inside == null ? "" : r.inside ? "是" : "否", r.stale ? "是" : "否", r.status, r.updatedAt])));
    L.push("", "[Fib明细]", line(["锚定日期", "代码", "名称", "模式", "锚点版本", "锚点高1", "锚点低0", "锚点时间", "锚点来源", "档位", "档位价", "首次触及时间", "失效时间", "失效原因", "状态", "更新时间"]));
    rows().filter((r) => r.kind === "FIB").sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach((r) => (r.levels || []).forEach((lv) => L.push(line([r.date, r.code, r.name, r.modeName, r.anchorVersion, r.anchorHigh, r.anchorLow, r.anchorTime, r.anchorSource, lv.ratio, lv.price, r.firstHit && r.firstHit[String(lv.ratio)] || "", r.invalidAt || "", r.invalidReason || "", r.status, r.updatedAt]))));
    return L.join("\r\n");
  }
  function exportCSV() {
    const n = rows().length, a = document.createElement("a"), d = localDay().replace(/-/g, "");
    a.href = URL.createObjectURL(new Blob([csv()], { type: "text/csv;charset=utf-8" }));
    a.download = "金粼_ATR_Fib复盘_" + d + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return n;
  }
  root.JLReviewStats = { observeATR, observeFib, summary, csv, exportCSV, storageKey: KEY };
  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-review-export]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    try { const n = exportCSV(); if (typeof root.toast === "function") root.toast("已导出 ATR／Fib 复盘 CSV（" + n + " 条真实记录）"); } catch (err) { if (typeof root.toast === "function") root.toast("导出失败"); }
  });
})(typeof window !== "undefined" ? window : globalThis);
