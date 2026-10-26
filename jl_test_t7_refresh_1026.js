const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const cases = [];
function ok(name, cond) { assert(cond, name); cases.push(name); }
function fnSource(name, isAsync) {
  const prefix = (isAsync ? 'async function ' : 'function ') + name + '(', start = html.indexOf(prefix);
  assert(start >= 0, 'missing ' + name);
  const b = html.indexOf('{', start); let depth = 0, quote = '', esc = false;
  for (let i = b; i < html.length; i++) {
    const c = html[i];
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw Error('unclosed ' + name);
}
function fixedDate(text) {
  const RealDate = Date, at = new RealDate(text);
  return class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [at.getTime()])); }
    static now() { return at.getTime(); }
  };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }
async function flushAll() { for (let i = 0; i < 20; i++) await flush(); }

function makeArchive({ total = 250, failPage = 0, seed = [], anchor = false } = {}) {
  const stores = { daily: new Map(seed.map((r) => [r.d, r])), meta: new Map() }, requests = [];
  const FakeDate = fixedDate('2026-10-26T15:10:00');
  const local = new Map();
  if (anchor) local.set('jinlin_yd_v1', JSON.stringify({ date: '2026-10-26' }));
  const indexedDB = { open() {
    const rq = {};
    queueMicrotask(() => {
      rq.result = { transaction(store) {
        const tx = {};
        tx.objectStore = () => ({
          put(rec) { stores[store].set(store === 'daily' ? rec.d : rec.id, rec); return { result: store === 'daily' ? rec.d : rec.id }; },
          get(key) { return { result: stores[store].get(key) }; },
          getAll() { return { result: Array.from(stores[store].values()) }; },
          getAllKeys() { return { result: Array.from(stores[store].keys()) }; },
          delete(key) { stores[store].delete(key); return { result: undefined }; }
        });
        queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
        return tx;
      } };
      if (rq.onsuccess) rq.onsuccess();
    });
    return rq;
  } };
  const window = {}, document = {
    head: { appendChild(s) {
      const u = new URL(s.src), cb = u.searchParams.get('cb'); requests.push(s.src);
      queueMicrotask(() => {
        let payload = null;
        if (u.hostname === 'push2ex.eastmoney.com') payload = { data: { tc: 7, qdate: '20261026' } };
        else if (u.pathname === '/api/qt/clist/get') {
          const pn = Number(u.searchParams.get('pn'));
          if (pn !== failPage) {
            const begin = (pn - 1) * 100, n = Math.max(0, Math.min(100, total - begin));
            payload = { data: { total, diff: Array.from({ length: n }, (_, i) => {
              const k = begin + i;
              return { f12: 'BK' + String(k + 1).padStart(4, '0'), f14: '板块' + (k + 1), f62: k < 100 ? 1000 + k : -2000 - k, f66: k + 1, f84: k + 2 };
            }) } };
          }
        }
        if (payload && typeof window[cb] === 'function') window[cb](payload);
        else if (s.onerror) s.onerror();
      });
    } },
    documentElement: { appendChild(s) { document.head.appendChild(s); } },
    createElement() { return { remove() {} }; }
  };
  const ctx = { window, document, indexedDB, Date: FakeDate, console, Promise, Number, String, Object, Array, JSON, Math,
    localStorage: { getItem: (k) => local.has(k) ? local.get(k) : null },
    setInterval(fn, ms) { if (ms === 200) queueMicrotask(fn); return 1; }, clearInterval() {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('jl_sector_ff_snap.js', 'utf8'), ctx);
  return { ctx, window, stores, requests };
}

(async () => {
  const full = makeArchive(); await flushAll();
  const rec = await full.window.__JLT7__.probeFetch(); await flushAll();
  const pages = full.requests.filter((u) => u.includes('/api/qt/clist/get')).map((u) => Number(new URL(u).searchParams.get('pn')));
  ok('250 boards archive from all three ordered pages', rec.ok === 1 && rec.nRows === 250 && pages.join(',') === '1,2,3');
  ok('net-outflow boards beyond first page are retained', rec.rows.length === 250 && rec.rows[120].f62 < 0 && rec.rows[249].f62 < 0);
  ok('full archive refreshes metadata board universe', full.stores.meta.get(1).boards.length === 250);

  const partial = makeArchive({ failPage: 3 }); await flushAll();
  const bad = await partial.window.__JLT7__.probeFetch();
  ok('missing page fails closed instead of archiving partial data', bad.ok === 0 && bad.nRows === 0 && bad.rows.length === 0 && /clist:incomplete/.test(bad.err));

  const legacy = makeArchive({ anchor: true, seed: [{ d: '2026-10-26', src: 'clist', ok: 1, nRows: 100, rows: [] }] });
  await flushAll();
  const healed = legacy.stores.daily.get('2026-10-26');
  ok('legacy Top100 snapshot is automatically re-fetched', healed && healed.ok === 1 && healed.nRows === 250 && legacy.window.__JLT7__.st.clistTried === 1);

  let now = new Date('2026-10-26T09:44:00').getTime(), fetches = 0, tencentCalls = 0, renders = 0, empty = false;
  const RealDate = Date;
  class M15Date extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const oldRows = Array.from({ length: 10 }, (_, i) => ({ t: '2026-10-26 09:' + String(30 + i).padStart(2, '0'), o: 10, c: 10.1, h: 10.2, l: 9.9, v: 100 }));
  const mctx = { Date: M15Date, console, Number, String, Object, Array, JSON, Math,
    m15CacheJL: { '603986': { rows: oldRows, at: now - 9e5, nextAt: 0 } },
    emFetchJL: async () => { fetches++; if (empty) return null; return { data: { klines: oldRows.map((r) => [r.t, r.o, r.c, r.h, r.l, r.v].join(',')) } }; },
    loadTencentKline: async () => { tencentCalls++; return empty ? [] : oldRows; },
    jlSecidJL: (code) => '1.' + code, jlPfxJL: (code) => 'sh' + code, renderDeck: () => { renders++; }
  };
  vm.createContext(mctx);
  for (const n of ['m15LiveNowJL', 'm15NextRefreshJL']) vm.runInContext(fnSource(n), mctx);
  vm.runInContext(fnSource('ensureM15JL', true), mctx);
  await mctx.ensureM15JL('603986');
  ok('15m success aligns next pull to closed bar plus 20 seconds', fetches === 1 && mctx.m15CacheJL['603986'].nextAt === new RealDate('2026-10-26T09:45:20').getTime() && renders === 1);
  now = new RealDate('2026-10-26T09:45:00').getTime(); await mctx.ensureM15JL('603986');
  ok('15m cache does not refetch before its scheduled boundary', fetches === 1);
  now = new RealDate('2026-10-26T09:45:20').getTime(); empty = true; await mctx.ensureM15JL('603986');
  ok('empty 15m response preserves previous bars and backs off two minutes', fetches === 2 && tencentCalls === 1 && JSON.stringify(mctx.m15CacheJL['603986'].rows) === JSON.stringify(oldRows) && mctx.m15CacheJL['603986'].nextAt === now + 120000);
  const lunchNext = mctx.m15NextRefreshJL(new RealDate('2026-10-26T11:30:20').getTime());
  ok('15m schedule skips lunch and resumes at 13:15:20', lunchNext === new RealDate('2026-10-26T13:15:20').getTime());
  ok('15m live gate is closed on weekends', !mctx.m15LiveNowJL(new RealDate('2026-10-25T10:00:00').getTime()));

  let loads = 0, age = 0;
  const rctx = { Date: { now: () => 1000000 }, console, Number, String, Object, Array, JSON, Math,
    sectorFundsJL: { _at: 0 }, loadSectorFundsJL: () => { loads++; }, localStorage: { getItem: () => '{}' },
    _ffMJL: { t: 0, d: {} }, jlLastTradeDay: () => '2026-10-26', mtempJL: { data: {} }
  };
  Object.defineProperty(rctx.sectorFundsJL, '_at', { get: () => 1000000 - age, configurable: true });
  vm.createContext(rctx); vm.runInContext('const _ffMJL = {t:0,d:{}};' + fnSource('resoDataJL'), rctx);
  function resoAttempt(code) { try { rctx.resoDataJL({ code, pct: 1 }); } catch (e) {} }
  age = 299999; resoAttempt('603986');
  ok('missing sector key respects five-minute TTL before expiry', loads === 0);
  age = 300001; resoAttempt('603986');
  ok('missing sector key retries after five-minute TTL', loads === 1);
  rctx.loadSectorFundsJL.loading = true; age = 400000; resoAttempt('603986');
  ok('missing sector key does not duplicate an in-flight load', loads === 1);

  const records = {
    a: { key: 'a', kind: 'ATR', code: '603986', name: '兆易创新', finalized: true, high: 105, low: 95, inside: true, upperHit: true, lowerHit: true },
    b: { key: 'b', kind: 'ATR', code: '603986', name: '兆易创新', finalized: true, high: 120, low: 90, inside: false, upperHit: true, lowerHit: false },
    c: { key: 'c', kind: 'ATR', code: '603986', name: '兆易创新', finalized: true, high: 0, low: 0, inside: null, upperHit: null, lowerHit: null }
  };
  const reviewCtx = { console, Date: fixedDate('2026-10-26T15:10:00'), Number, String, Object, Array, JSON, Math,
    localStorage: { getItem: () => JSON.stringify({ version: 1, records }), setItem() {} } };
  reviewCtx.window = reviewCtx; vm.createContext(reviewCtx);
  vm.runInContext(fs.readFileSync('jl_review_stats.js', 'utf8'), reviewCtx);
  const sum = reviewCtx.JLReviewStats.summary().find((r) => r.kind === 'ATR' && r.code === '603986');
  ok('ATR review excludes records without full-day high/low from denominator', sum.samples === 2 && sum.inside === '50.0%' && sum.upper === '100.0%' && sum.lower === '50.0%');
  vm.runInContext(fnSource('atrReviewHTMLJL'), reviewCtx);
  const reviewHTML = reviewCtx.atrReviewHTMLJL('sh603986');
  ok('ATR card labels close review without calling it trading win rate', reviewHTML.includes('收盘复盘 2日') && reviewHTML.includes('全日在区内 50.0%') && reviewHTML.includes('不代表交易胜率'));

  console.log('PASS', cases.length + '/' + cases.length);
  cases.forEach((name, i) => console.log(String(i + 1).padStart(2, '0'), name));
})().catch((e) => { console.error(e && e.stack || e); process.exitCode = 1; });
