#!/usr/bin/env node
/* tdt2.js —— 做T分时助手 v2（多周期IV版 · 口径对齐生产 jl_gapiv.js）
 * IV: 五周期(日/30分/15分/5分/1分)扫未回补缺口区(相邻两根K, 后开离前收>0.05%, 分钟级须影线重叠),
 *     同价重叠区合并(×N=多周期共振); 补回=碰到前收(远沿); 分钟级只看近5个交易日; 1分K仅近几日(腾讯, 同生产范围)
 * 打法: 低开先卖 → 买回=跌进下方IV区远沿(前收) 或 分时低点反弹确认(runLow+bounce) →
 *       涨进上方IV区远沿(前收)卖 → 再跌再买, 最多 rounds 轮(默认3), 每轮 sh 股, 当日必平
 *       低开的开缺: 补回价=昨收(上方磁铁); 高开的开缺: 补回价=昨收(下方磁铁)
 * 费用: 真三费 fee(amt,sell)=max(5,amt*0.00025)+amt*0.00001+(sell?amt*0.0005:0)  (引擎/jl_tintra 2026-10-30口径)
 * 数据: 新浪(日/5分/15分/30分) + 腾讯(1分K 320+800两页); 免费源=个人辅助, 不进A/B实验判定
 * 用法: node scripts/tdt2.js [--sym sh600105] [--qty 1900] [--cost 50.2] [--frac 0.25] [--rounds 3]
 *       [--days 20] [--lowopen 0.003] [--bounce 0.15] [--chase 0] [--show 2026-10-29] [--fetch]
 * 假设: 触价按远沿限价成交; 低开卖=集合竞价价; 同根K先判不利(追回止损/低点反弹)再判有利(IV远沿), 保守
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tmp', 'tdt_cache');
const NAMES = { sh600105: '永鼎股份', sh603986: '兆易创新', sh600176: '中国巨石' };
const F = { sym: 'sh600105', qty: 1900, cost: 0, frac: 0.25, rounds: 3, days: 20, lowopen: 0.003, bounce: 0.15, chase: 0, show: '', fetch: false, m1walk: false };
const NUM = new Set(['qty', 'cost', 'frac', 'rounds', 'days', 'lowopen', 'bounce', 'chase']);
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--fetch') { F.fetch = true; continue; }
  if (a === '--m1walk') { F.m1walk = true; continue; }   /* 有1分K的日子按1分钟逐根重演(成交级精度) */
  if (!a.startsWith('--')) { console.error('未知参数: ' + a); process.exit(1); }
  const k = a.slice(2), v = process.argv[i + 1];
  if (v === undefined) { console.error('缺参数值: ' + a); process.exit(1); }
  if (k === 'sym') { F.sym = v; i++; continue; }
  if (k === 'show') { F.show = v; i++; continue; }
  if (!NUM.has(k)) { console.error('未知参数: ' + a); process.exit(1); }
  const n = +v; if (!isFinite(n)) { console.error('参数须为数字: ' + a); process.exit(1); }
  F[k] = n; i++;
}
const r2 = x => Math.round(x * 100) / 100;
const LOT = 100;
F.sh = Math.max(LOT, Math.floor(F.qty * F.frac / LOT) * LOT);
if (F.sh * F.rounds > Math.floor(F.qty / LOT) * LOT) { console.error(`每轮${F.sh}×${F.rounds}轮 > 持仓${F.qty}, 减轮数或frac`); process.exit(1); }
const bePX = px => r2((fee(px * F.sh, true) + fee(px * F.sh, false)) / F.sh);   /* 双边保本价差(元/股), 模块级供预演展示用 */

const dg = t => String(t).replace(/\D/g, '');
let XFER = 0.00001;                                                   /* 过户费: 仅沪市(深市不计) */
const fee = (amt, sell) => Math.max(5, amt * 0.00025) + amt * XFER + (sell ? amt * 0.0005 : 0);
const LV = ['日', '30分', '15分', '5分', '1分'], ORD = { '1分': 1, '5分': 5, '15分': 15, '30分': 30, '日': 99 };

/* ---- 取数 ---- */
function httpGet(u) { return new Promise((res, rej) => https.get(u, { headers: { Referer: 'https://finance.sina.com.cn' } }, r => { if (r.statusCode !== 200) { rej(Error('HTTP ' + r.statusCode)); return; } let s = ''; r.on('data', c => s += c); r.on('end', () => res(s)); }).on('error', rej)); }
const sinaK = (sym, scale, n) => httpGet(`https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${sym}&scale=${scale}&ma=no&datalen=${n}`).then(s => JSON.parse(s));
async function txM1(sym) {
  const j1 = JSON.parse(await httpGet(`https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=${sym},m1,,320&_t=${Date.now()}`));
  const a = (j1.data[sym] || {}).m1 || [];
  let b = [];
  try { const j2 = JSON.parse(await httpGet(`https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=${sym},m1,${a[0][0]},800&_t=${Date.now()}`)); b = (j2.data[sym] || {}).m1 || []; } catch (e) { }
  return b.filter(x => x[0] < a[0][0]).concat(a).map(x => ({ t: x[0], o: +x[1], c: +x[2], h: +x[3], l: +x[4] }));
}
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const N5 = x => ({ t: x.day, o: +x.open, h: +x.high, l: +x.low, c: +x.close });
const normM1 = rows => (rows || []).map(x => Array.isArray(x) ? { t: x[0], o: +x[1], c: +x[2], h: +x[3], l: +x[4] } : x);

/* ---- 生产口径 scan (jl_gapiv.js 逐字移植) ---- */
function scan(b, lv, today) {
  const out = [], daily = lv === '日', days = [...new Set(b.map(x => dg(x.t).slice(0, 8)))], keep = daily ? null : days.slice(-5);
  for (let i = 1; i < b.length; i++) {
    const p0 = b[i - 1], c0 = b[i], d0 = dg(c0.t).slice(0, 8);
    if (!daily && (dg(p0.t).slice(0, 8) !== d0 || keep.indexOf(d0) < 0)) continue;
    const vm = p0.c * 0.0005, bull = c0.o - p0.c > vm && (daily || c0.l <= p0.h), bear = p0.c - c0.o > vm && (daily || c0.h >= p0.l);
    if (!bull && !bear) continue;
    let ft = '', ext = c0.o;
    if (bull ? c0.l <= p0.c : c0.h >= p0.c) ft = (daily && d0 === today) ? '今日' : c0.t;
    else ext = bull ? c0.l : c0.h;
    for (let j = ft ? b.length : i + 1; j < b.length; j++) {
      ext = bull ? Math.min(ext, b[j].l) : Math.max(ext, b[j].h);
      if (bull ? b[j].l <= p0.c : b[j].h >= p0.c) { ft = b[j].t; break; }
    }
    if (ft && ft !== '今日' && dg(ft).slice(0, 8) !== today) continue;  /* 以前就补掉的不要 */
    const lo = bull ? p0.c : c0.o, hi = bull ? c0.o : p0.c;
    const rem = ft ? null : (bull ? [p0.c, Math.min(c0.o, ext)] : [Math.max(c0.o, ext), p0.c]);
    out.push({ lv, bull, lo, hi, rem, t: c0.t, ft, d: d0 });
  }
  return out;
}

/* ---- 全局数据 ---- */
let D, M5, BY = {}, M1days = 0, M1D = {}, STEP = 5;       /* STEP=当前重演的K线粒度(分), 决定1分K截断提前量 */
function zonesFor(E, upto12, lastOv) {  /* E=执行日: 只用 date < E 的数据(零偷看); upto12=盘中当前5分K的结束时刻; lastOv=现价基准(缺省昨收) */
  const E8 = E.replace(/-/g, '');
  const cut = arr => arr.filter(b => { const d = dg(b.t).slice(0, 8); if (d < E8) return true; if (d > E8) return false; return !!upto12 && dg(b.t).slice(0, 12) < upto12; });
  /* 1分K也是"结束时刻"标注(已实测): 当前5分K窗口[T-5,T]内的1分K(标签∈(T-5,T])必须排除, 截到标签≤T-5 */
  const cutM1 = arr => arr.filter(b => { const g = dg(b.t).slice(0, 12), d = g.slice(0, 8); if (d < E8) return true; if (d > E8) return false; if (!upto12) return false; const hm = Number(g.slice(8, 12)); let h = Math.floor(hm / 100), m = hm % 100 - STEP; if (m < 0) { m += 60; h -= 1; } return g <= d + String(h * 100 + m).padStart(4, '0'); });
  const dc = D.filter(b => dg(b.t).slice(0, 8) < E8), last = lastOv || (dc.length ? dc[dc.length - 1].c : 0);  /* 日线只用昨日及以前(当日bar含收盘信息, 盘中禁用=零偷看) */
  const src = { '日': dc, '30分': cut(BY['30分']), '15分': cut(BY['15分']), '5分': cut(BY['5分']), '1分': cutM1(BY['1分']) };
  let all = [];
  LV.forEach(L => { if (src[L] && src[L].length > 2) all = all.concat(scan(src[L], L, E8)); });
  const raw = all.filter(g => !g.ft);                                     /* 未回补(截至信号时点) */
  const tgd = (up) => {
    const c = raw.filter(g => g.lv === '日' && g.bull !== up).map(g => {
      const lo = g.rem[0], hi = g.rem[1], inZ = last >= lo && last <= hi, near = up ? lo : hi;
      return { lo, hi, inZ, near, far: up ? g.hi : g.lo, dist: inZ ? 0 : (near / last - 1) * 100 };
    }).filter(g => up ? g.hi >= last : g.lo <= last);
    c.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
    return c[0] || null;
  };
  const tgt = { up: tgd(true), dn: tgd(false) };
  let near = raw.filter(g => Math.abs((g.lo + g.hi) / 2 / last - 1) <= 0.08);
  near = near.filter(g => !(g.lv === '1分' && (g.hi - g.lo) / last < 0.002));
  const grp = [];
  near.forEach(g => {
    const z = g.rem, m = grp.find(x => x.bull === g.bull && z[0] <= x.hi * 1.0005 && z[1] >= x.lo * 0.9995);
    if (!m) grp.push({ bull: g.bull, lo: z[0], hi: z[1], mem: [g] });
    else { m.mem.push(g); m.lo = Math.min(m.lo, z[0]); m.hi = Math.max(m.hi, z[1]); }
  });
  grp.forEach(g => { g.lvs = [...new Set(g.mem.map(x => x.lv))].sort((a, b) => ORD[b] - ORD[a]); g.N = g.lvs.length; g.mid = (g.lo + g.hi) / 2; g.dist = (g.mid / last - 1) * 100; });
  grp.sort((a, b) => b.N - a.N || Math.abs(a.dist) - Math.abs(b.dist));
  return { raw, near, grp, tgt, last };
}

/* ---- 单日多轮模拟 ---- */
function simDay(E, iE, cfg) {
  const prev = D[iE - 1], barsM1 = cfg.m1walk ? M1D[E] : null;
  const useM1 = barsM1 && (barsM1.length >= 230 || (iE === D.length - 1 && barsM1.length >= 30));  /* 历史日须全天(≈241根, 腾讯回填可能只到半日); 当日盘中允许部分 */
  const bars = useM1 ? barsM1 : M5[E];
  if (!prev || !bars) return null;
  STEP = useM1 ? 1 : 5;                                  /* m1walk: 该日有1分K→逐分钟重演, 否则回退5分K */
  const full = useM1 ? 241 : 48;
  const partial = iE === D.length - 1 && bars.length >= 2 && bars.length < full; /* 当日盘中 */
  if ((useM1 ? bars.length < 30 : bars.length !== 48) && !partial) return null;
  const sellStop = useM1 ? bars.length - 10 : bars.length - 1;   /* m1: 尾盘留约10分钟只买回/兜底, 不再新开卖 */
  const pc = prev.c, open = bars[0].o;
  const preZ = zonesFor(E);          /* 前盘口径(统计用) */
  const lowOpen = open <= r2(pc * (1 - cfg.lowopen)) - 1e-9;
  /* 开盘缺口: 补回价=昨收. 低开(开<收)→价格在缺口下方→上方磁铁(卖); 高开→下方磁铁(买) */
  let openGap = null;
  if (Math.abs(open / pc - 1) >= 0.001) openGap = { bull: open > pc, lo: Math.min(pc, open), hi: Math.max(pc, open), N: 1, lvs: ['开缺'], mid: (pc + open) / 2 };
  const dLow = Math.min(...bars.map(b => b.l)), dHigh = Math.max(...bars.map(b => b.h));
  /* 逐根走: 每根用"这根之前"的全部K线重算IV区(含盘中新形成的), 分时高低+IV磁铁 */
  const rounds = [];
  let r = 0, ref = open, sp = null, sWhy = '', iS = 0, runLow = 0, lastTp = 0, gapDead = false, preH = -Infinity, preL = Infinity;
  for (let i = 0; i < bars.length && r < cfg.rounds; i++) {
    const b = bars[i];
    if (i > 0) { preH = Math.max(preH, bars[i - 1].h); preL = Math.min(preL, bars[i - 1].l); }   /* 决策时已走完的根 */
    if (openGap && !gapDead && i > 0 && (!openGap.bull ? preH >= openGap.hi - 1e-9 : preL <= openGap.lo + 1e-9)) gapDead = true;  /* 开缺被之前的根补掉→失效(补回即消失) */
    const Z = zonesFor(E, dg(b.t).slice(0, 12), b.o);     /* 8%基准=本根开盘价(现价口径·因果; 1分K截到本根窗口开始之前) */
    const aboves = [...(openGap && !gapDead && !openGap.bull ? [openGap] : []), ...Z.grp.filter(g => !g.bull)];  /* 涨上去补(卖区), 远沿=hi */
    const belows = [...(openGap && !gapDead && openGap.bull ? [openGap] : []), ...Z.grp.filter(g => g.bull)];     /* 跌下来补(买区), 远沿=lo */
    const be = px => r2((fee(px * cfg.sh, true) + fee(px * cfg.sh, false)) / cfg.sh);           /* 双边保本价差(元/股) */
    if (sp === null) {                                    /* ---- 等卖出 ---- */
      if (r === 0 && lowOpen) { sp = open; sWhy = '低开卖'; iS = 0; runLow = sp; continue; }
      if (i >= sellStop) break;                           /* 留尾盘给买回 */
      const az = aboves.filter(z => z.hi >= ref + Math.max(0.05, be(ref))).sort((x, y) => x.hi - y.hi)[0] || null;
      const tp = az ? az.hi : r2(ref + Math.max(0.06, be(ref) + 0.01));           /* 无区→保本价差+1分 */
      lastTp = tp;
      if (process.env.TDBG) console.error(`DBG ${E} ${dg(b.t).slice(8, 10)}:${dg(b.t).slice(10, 12)} h=${b.h.toFixed(2)} c=${b.c.toFixed(2)} ref=${ref.toFixed(2)} tp=${tp.toFixed(2)} az=${az ? az.hi.toFixed(2) + '(×' + az.N + (az.mem ? ':' + az.mem.map(m => m.lv).join('/') : '') + ')' : '无'}`);
      if (b.h >= tp - 1e-9) { sp = tp; sWhy = az ? `IV↑${az.N > 1 ? '×' + az.N : ''}` : '冲高'; iS = i; runLow = sp; }
    } else {                                              /* ---- 已卖出, 等买回 ---- */
      const bz = belows.filter(z => z.lo <= sp - Math.max(0.05, be(sp))).sort((x, y) => y.lo - x.lo)[0] || null;
      const far = bz ? bz.lo : null;
      let bp = null, bWhy = '';
      if (cfg.chase > 0 && b.h >= r2(sp + cfg.chase) - 1e-9) { bp = r2(sp + cfg.chase); bWhy = '追回止损'; }
      else {
        const tf = process.env.TFILL || 'bar';            /* bar=动态下移触发价(盯盘); cross=仅此前低点触发·当根最高够到(挂单); close=前低触发+收回确认(理论) */
        const ms = Math.max(0.05, be(sp)), priorLv = r2(runLow + cfg.bounce);
        if (tf === 'bar' && priorLv <= sp - ms && b.o >= priorLv - 1e-9) { bp = b.o; bWhy = '低点反弹'; }  /* 此前触发价被开盘向上跳过→按开盘价, 不用当根新低重写历史 */
        else {
          if (tf === 'bar') runLow = Math.min(runLow, b.l); /* bar: 当根新低形成后动态下移; 收盘≥lv ⇒ 当根内已从低点回升穿越lv(算术保证, 非偷看) */
          const lv = r2(runLow + cfg.bounce);
          const ok = tf === 'bar' ? b.c >= lv : tf === 'close' ? b.c >= lv && (b.o >= lv || b.l <= lv) : b.h >= lv;
          if (lv <= sp - ms && ok) { bp = tf === 'bar' ? lv : Math.max(lv, b.o); bWhy = '低点反弹'; }   /* cross/close: 触发价被跳空越过按开盘成交(保守) */
          else if (far !== null && b.l <= far + 1e-9) { bp = r2(Math.min(far, b.o)); bWhy = `IV↓${bz.N > 1 ? '×' + bz.N : ''}`; }
          else if (i === bars.length - 1) { bp = b.c; bWhy = partial ? '现价兜底' : '收盘兜底'; }
        }
      }
      if (bp !== null) {
        const f = fee(sp * cfg.sh, true) + fee(bp * cfg.sh, false);
        rounds.push({ r: r + 1, sp, sWhy, bp, bWhy, q: cfg.sh, net: r2((sp - bp) * cfg.sh - f), fee: f });
        r++; ref = bp; sp = null;
      }
      runLow = Math.min(runLow, b.l);                     /* 当根低点走完才计入(供后续根用) */
    }
  }
  /* 回补统计: 前盘未补且距收±8%内的区, 当日是否碰到远沿(前收) — 主流程按区去重, 同一区只计首次出现那天 */
  const roster = preZ.near.map(g => ({ key: `${g.lv}|${g.lo}|${g.hi}|${g.rem[0]}|${g.rem[1]}|${g.t}`, lv: g.lv, fill: g.bull ? dLow <= g.lo + 1e-9 : dHigh >= g.hi - 1e-9 }));
  const pend = partial ? (sp !== null ? `已卖${sp.toFixed(2)}(${sWhy}) 等买回: 低点反弹${cfg.bounce}/买区远沿/14:55兜底` : (r < cfg.rounds && lastTp ? `等卖出: 涨到${lastTp.toFixed(2)}(IV区/参考)` : '今日已收工')) : '';
  return { E, pc, open, lowOpen, ivN: preZ.grp.length + (openGap ? 1 : 0), rounds, partial, pend, roster, net: r2(rounds.reduce((a, x) => a + x.net, 0)) };
}

/* ---- 主流程 ---- */
(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  let srcNote = '本地+缓存(新浪/腾讯, 拉于本轮)';
  const loadOr = (p, fb) => { try { return rd(p); } catch (e) { return fb; } };
  let dailyRows = loadOr(path.join(ROOT, 'tmp', 'data_ivtest', F.sym + '_240.json'), null);
  let m5Rows = loadOr(path.join(ROOT, 'tmp', 'data_ivtest', F.sym + '_5.json'), null);
  let m30 = loadOr(path.join(CACHE, F.sym + '_30.json'), null), m15 = loadOr(path.join(CACHE, F.sym + '_15.json'), null), m1 = loadOr(path.join(CACHE, F.sym + '_m1.json'), null);
  if (F.fetch) {
    try {
      dailyRows = await sinaK(F.sym, 240, 240); m5Rows = await sinaK(F.sym, 5, 1970);   /* 新浪5分K上限实测1970(传5200返回null) */
      m30 = await sinaK(F.sym, 30, 850); m15 = await sinaK(F.sym, 15, 1700); m1 = await txM1(F.sym);
      fs.writeFileSync(path.join(CACHE, F.sym + '_30.json'), JSON.stringify(m30));
      fs.writeFileSync(path.join(CACHE, F.sym + '_15.json'), JSON.stringify(m15));
      fs.writeFileSync(path.join(CACHE, F.sym + '_m1.json'), JSON.stringify(m1));
      srcNote = '实时拉取(新浪+腾讯)';
    } catch (e) { console.log('拉取失败(' + e.message + '), 用本地缓存'); }
  }
  if (!dailyRows || !m5Rows) { console.error('缺日线/5分K数据'); process.exit(1); }
  D = dailyRows.map(N5);
  M5 = {}; const m5n = m5Rows.map(N5); m5n.forEach(b => { const d = String(b.t).slice(0, 10); (M5[d] = M5[d] || []).push(b); });
  const m1o = normM1(m1);
  BY = { '日': D, '30分': (m30 || []).map(N5), '15分': (m15 || []).map(N5), '5分': m5n, '1分': m1o };
  M1days = [...new Set(m1o.map(x => dg(x.t).slice(0, 8)))].length;
  M1D = {}; m1o.forEach(b => { const g = dg(b.t), k = `${g.slice(0, 4)}-${g.slice(4, 6)}-${g.slice(6, 8)}`; (M1D[k] = M1D[k] || []).push(b); });
  Object.values(M1D).forEach(a => a.sort((x, y) => dg(x.t) - dg(y.t)));
  const idx = {}; D.forEach((b, i) => idx[b.t] = i);
  const lastM5 = Object.keys(M5).sort().pop();
  if (lastM5 && !idx[lastM5] && lastM5 > D[D.length - 1].t) {
    const bs = M5[lastM5];
    D.push({ t: lastM5, o: bs[0].o, h: Math.max(...bs.map(b => b.h)), l: Math.min(...bs.map(b => b.l)), c: bs[bs.length - 1].c });
    idx[lastM5] = D.length - 1;
  }
  if (D.length < 40) { console.error('日线不足40根'); process.exit(1); }
  const last = D[D.length - 1], pc = last.c, name = NAMES[F.sym] || F.sym;
  XFER = F.sym.startsWith('sh') ? 0.00001 : 0;           /* 过户费: 仅沪市 */

  if (F.show) {  /* --show 日期 或 日期T时刻(如 2026-10-30T13:10): 只看该时点的IV区(核对用) */
    const parts = String(F.show).split('T');
    const Z = parts[1] ? zonesFor(parts[0], parts[0].replace(/\D/g, '') + parts[1].replace(/\D/g, '')) : zonesFor(parts[0]);
    console.log(`IV区(${parts[1] ? '盘中截至 ' + parts[1] + ' (只用此前K线)' : '截至 ' + parts[0] + ' 前一收盘'}, 现价基准=${Z.last}):`);
    Z.grp.forEach(g => {
      console.log(`  ${g.bull ? '↓买区' : '↑卖区'} ${g.lo.toFixed(2)}–${g.hi.toFixed(2)} ×${g.N}(${g.lvs.join('+')}) 距${g.dist >= 0 ? '+' : ''}${g.dist.toFixed(1)}%`);
      g.mem.forEach(m => console.log(`    · ${m.lv}K ${m.bull ? '↓' : '↑'} rem${m.rem[0].toFixed(2)}–${m.rem[1].toFixed(2)}(前收=${(m.bull ? m.rem[0] : m.rem[1]).toFixed(2)}) 形成于 ${m.t}`));
    });
    if (Z.tgt.up) console.log(`日线未补·上方: ${Z.tgt.up.lo.toFixed(2)}–${Z.tgt.up.hi.toFixed(2)} 补到${Z.tgt.up.far.toFixed(2)} 距${Z.tgt.up.dist.toFixed(1)}%`);
    if (Z.tgt.dn) console.log(`日线未补·下方: ${Z.tgt.dn.lo.toFixed(2)}–${Z.tgt.dn.hi.toFixed(2)} 补到${Z.tgt.dn.far.toFixed(2)} 距${Z.tgt.dn.dist.toFixed(1)}%`);
    return;
  }

  console.log(`======= 做T分时助手 v2(多周期IV) · ${name} ${F.sym} =======`);
  console.log(`持仓 ${F.qty} 股${F.cost > 0 ? ` · 成本 ${F.cost}(浮亏 ${((pc / F.cost - 1) * 100).toFixed(1)}%)` : ''} · 每轮 ${F.sh} 股 × 最多${F.rounds}轮 · 数据: ${srcNote} 至 ${last.t}${M1days ? ` · 1分K仅覆盖近${M1days}个交易日(更早交易日无1分区, 复盘口径差异)` : ' · 无1分K'}`);
  {   /* 数据源截止一致性: 免费源本地缓存可能不同日, 不一致时提醒先 --fetch */
    const endOf = a => a && a.length ? String(a[a.length - 1].t).replace(/\D/g, '').slice(0, 8) : '-';
    const mism = [['1分', endOf(BY['1分'])], ['15分', endOf(BY['15分'])], ['30分', endOf(BY['30分'])]].filter(([, v]) => v !== last.t.replace(/\D/g, ''));
    if (mism.length) console.log(`⚠ 数据截止不一致: ${mism.map(([k, v]) => k + 'K至' + v).join(' · ')} — 以5分K(${last.t})为准, 建议先 --fetch 统一`);
  }
  console.log(`打法: 低开(≤${(F.lowopen * 100).toFixed(1)}%)先卖 → 买回=跌到下方区远沿(前收)或分时低点反弹${cfgb()} → 卖=涨到上方区远沿(前收)${F.chase > 0 ? ` · 追回止损${F.chase}元` : ''} · 当日必平`);
  if (F.m1walk) console.log(`※ m1walk模式: 有1分K的交易日按1分钟逐根重演(成交级精度), 无1分K的日子自动回退5分K · 当前1分K覆盖近${M1days}日`);
  function cfgb() { return `(低点+${F.bounce.toFixed(2)}确认)`; }

  const days = Math.min(F.days, D.length - 1);
  const rows = [];
  for (let i = D.length - days; i < D.length; i++) { const r = simDay(D[i].t, i, F); if (r) rows.push(r); }
  console.log(`\n---- 近${rows.length}个交易日复盘（五分K逐根·远沿限价·费后净额）----`);
  for (const r of rows) {
    const head = `${r.E.slice(5)}${r.partial ? '*' : ' '} ${r.lowOpen ? 'Y' : 'n'} 开${r.open.toFixed(2).padStart(6)} IV区${String(r.ivN).padStart(2)}`;
    if (!r.rounds.length) { console.log(head + '  —(无触发)'); continue; }
    r.rounds.forEach((x, j) => console.log(`${j ? '              ' : head + '  '}R${x.r} 卖${x.sp.toFixed(2)}[${x.sWhy}]→买${x.bp.toFixed(2)}[${x.bWhy}] 差价${((x.sp - x.bp) / x.sp * 100).toFixed(2)}% 净${x.net >= 0 ? '+' : ''}${x.net.toFixed(1)}`));
    const gross = r.rounds.reduce((a, x) => a + (x.sp - x.bp) * x.q, 0), sold = r.rounds.reduce((a, x) => a + x.sp * x.q, 0);
    console.log(`              日净 ${r.net >= 0 ? '+' : ''}${r.net.toFixed(2)} · 毛差价${gross.toFixed(0)}元(${sold ? (gross / sold * 100).toFixed(2) : '0.00'}%加权) · 降成本${(r.net / F.qty).toFixed(3)}元/股${r.pend ? `\n              ▶ ${r.pend}` : ''}`);
  }
  console.log(`(* = 当日盘中, 数据到当前时刻)`);
  const allR = rows.flatMap(r => r.rounds);
  const fillAgg = {}, seenZ = new Set();
  rows.forEach(r => r.roster.forEach(g => { if (seenZ.has(g.key)) return; seenZ.add(g.key); fillAgg[g.lv] = fillAgg[g.lv] || { n: 0, k: 0 }; fillAgg[g.lv].n++; if (g.fill) fillAgg[g.lv].k++; }));
  console.log(`\n---- 合计 ----`);
  const totNet = r2(allR.reduce((a, x) => a + x.net, 0)), totFee = r2(allR.reduce((a, x) => a + x.fee, 0));
  const totGross = allR.reduce((a, x) => a + (x.sp - x.bp) * x.q, 0), totSold = allR.reduce((a, x) => a + x.sp * x.q, 0);
  console.log(`低开日 ${rows.filter(r => r.lowOpen).length}/${rows.length} · 轮次 ${allR.length}(胜${allR.filter(x => x.net > 0).length} 负${allR.filter(x => x.net < 0).length}) · 总净额 ${totNet} 元 · 总费用 ${totFee} 元`);
  console.log(`毛差价合计 ${totGross.toFixed(0)}元(${totSold ? (totGross / totSold * 100).toFixed(2) : '0'}%加权) · 降成本累计 ${(totNet / F.qty).toFixed(3)}元/股${F.cost > 0 ? ` → 成本 ${F.cost}→${(F.cost - totNet / F.qty).toFixed(2)}` : ''} · 日均 ${(totNet / rows.length).toFixed(1)}元`);
  console.log(`IV区新出现区当日回补率(同一区只计首日 · 开盘未补且距收±8% → 当日碰到远沿前收): ` + LV.filter(l => fillAgg[l] && fillAgg[l].n).map(l => `${l} ${fillAgg[l].k}/${fillAgg[l].n}=${fillAgg[l].n ? Math.round(fillAgg[l].k / fillAgg[l].n * 100) : 0}%`).join(' · '));

  const nextWd = ds => { const dt = new Date(ds + 'T00:00:00+08:00'); do { dt.setDate(dt.getDate() + 1); } while (dt.getDay() === 0 || dt.getDay() === 6); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
  const nxt = nextWd(last.t);                             /* 下一工作日(遇法定节假日自行顺延; 区表按"此前数据"算, 与标签日期无关) */
  const Z = zonesFor(nxt);
  console.log(`\n---- 下一交易日计划（信号日 ${last.t} 收盘 ${pc} · 预 ${nxt}）----`);
  const zRow = g => `  ${g.bull ? `↓买区(跌到${g.lo.toFixed(2)}买回)` : `↑卖区(涨到${g.hi.toFixed(2)}卖出)`} ${g.lo.toFixed(2)}–${g.hi.toFixed(2)} ×${g.N}(${g.lvs.join('+')}) 距收${g.dist >= 0 ? '+' : ''}${g.dist.toFixed(1)}%`;
  const up = Z.grp.filter(g => !g.bull), dn = Z.grp.filter(g => g.bull);
  console.log(`上方卖区(涨上去补, 卖到前收):`); console.log(up.slice(0, 6).map(zRow).join('\n') || '  无');
  console.log(`下方买区(跌下来补, 买到前收):`); console.log(dn.slice(0, 6).map(zRow).join('\n') || '  无');
  if (Z.tgt.up) console.log(`日线未补·上方: ${Z.tgt.up.lo.toFixed(2)}–${Z.tgt.up.hi.toFixed(2)} 补到${Z.tgt.up.hi.toFixed(2)} 距${Z.tgt.up.dist.toFixed(1)}%(不限8%)`);
  if (Z.tgt.dn) console.log(`日线未补·下方: ${Z.tgt.dn.lo.toFixed(2)}–${Z.tgt.dn.hi.toFixed(2)} 补到${Z.tgt.dn.lo.toFixed(2)} 距${Z.tgt.dn.dist.toFixed(1)}%(不限8%)`);
  const lo = r2(pc * (1 - F.lowopen));
  console.log(`规则: 开<${lo.toFixed(2)}=低开 → R1开盘卖${F.sh}股 → 买回=跌到最近买区底 或 低点反弹${F.bounce.toFixed(2)}确认, 无→收盘兜底;`);
  console.log(`      R2/R3=涨到最近卖区顶(前收)卖${F.sh}股(无区→参考价+保本价差+1分) → 跌到买区底或低点反弹买回; 14:55未回=收盘兜底; 当日必平`);
  /* 开盘方向参考: 历史条件频率(读数非预测) */
  const n20 = Math.min(20, D.length - 1);
  let lo20 = 0, gs20 = 0;
  for (let i = D.length - n20; i < D.length; i++) { const g = D[i].o / D[i - 1].c - 1; if (g < 0) lo20++; gs20 += g; }
  let cn = 0, clo = 0, cup = 0, cg = 0;
  for (let i = 1; i < D.length - 1; i++) {
    const a = D[i - 1], b = D[i], nx = D[i + 1];
    if (b.c / a.c - 1 <= -0.05 && b.c <= b.l * 1.005) { cn++; const g = nx.o / b.c - 1; if (g < 0) clo++; cg += g; if (nx.c > b.c) cup++; }
  }
  console.log(`开盘方向参考(历史读数·非预测): 近${n20}日低开${lo20}/${n20}=${Math.round(lo20 / n20 * 100)}% · 平均开盘gap${(gs20 / n20 * 100).toFixed(2)}%`);
  if (cn) console.log(`  信号日特征=跌>5%且贴最低收盘(本次信号日即满足) → 历史样本${cn}: 次日低开${clo}次 · 平均开盘${(cg / cn * 100).toFixed(2)}% · 次日收高${cup}/${cn}`);
  console.log(`情景预演(近似·与模拟同口径: ±5分门槛+含开缺):`);
  for (const f of [0.98, 0.99, 1.0, 1.01, 1.02]) {
    const O = r2(pc * f);
    const gapU = O < pc - 0.001 ? [{ hi: pc, lo: O, N: 1, lvs: ['开缺'] }] : [];   /* 低开→上方开缺(卖到昨收) */
    const gapD = O > pc + 0.001 ? [{ lo: pc, hi: O, N: 1, lvs: ['开缺'] }] : [];   /* 高开→下方开缺(接回昨收) */
    const az = [...gapU, ...up].filter(z => z.hi >= O + 0.05).sort((a, b) => a.hi - b.hi)[0] || null;
    const bz = [...gapD, ...dn].filter(z => z.lo <= O - 0.05).sort((a, b) => b.lo - a.lo)[0] || null;
    const isLo = O <= lo - 1e-9, isHi = O >= r2(pc * 1.001);
    const tag = isLo ? '低开' : isHi ? '高开' : '平开';
    const zs = z => z.lvs && z.lvs[0] === '开缺' ? '开缺' : `IV↑${z.N > 1 ? '×' + z.N : ''}`;
    const bs = z => z.lvs && z.lvs[0] === '开缺' ? '开缺=昨收' : `IV↓${z.N > 1 ? '×' + z.N : ''}`;
    console.log(`  开${O.toFixed(2)}(${tag}${((O / pc - 1) * 100).toFixed(1)}%): ${isLo ? `R1卖${F.sh}@开 → 买回@${bz ? bz.lo.toFixed(2) + '(' + bs(bz) + ')' : '低点反弹/收盘'}` : `R1等涨到卖区`} · 冲高卖@${az ? az.hi.toFixed(2) + `(${zs(az)})` : r2(O + Math.max(0.06, bePX(O) + 0.01)).toFixed(2) + '(保本+1分)'}${isHi ? ` · 回落接@${bz ? bz.lo.toFixed(2) + '(' + bs(bz) + ')' : '昨收' + pc.toFixed(2) + '(开缺)'}` : ''}`);
  }
  console.log(`\n注: 新浪/腾讯免费源·个人辅助口径·与A/B实验判定无关; 回补率为近${rows.length}日复盘读数非概率承诺; ×N合并区按最外沿(全补完才算, 共振区触发偏晚为设计口径); 下一交易日按工作日推算(遇法定节假日自行顺延); 反弹成交模型TFILL=bar(默认,盯盘)/cross(挂单)/close(死等), --m1walk有1分K的日子按分钟重演。盘中实时: node scripts/tdt2.js --fetch --cost 50.2`);
})();
