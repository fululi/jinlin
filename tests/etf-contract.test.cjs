// Run: node --test tests/etf-contract.test.cjs (no network, no browser storage writes).
process.env.TZ = 'Asia/Shanghai';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const etf = fs.readFileSync(path.join(root, 'jlv2.js'), 'utf8');
function between(src, a, b) {
  const start = src.indexOf(a), end = src.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, 'source anchors must exist');
  return src.slice(start, end);
}
const gateSource = between(html, '  const GATE_CFG =', '  function closedStreakJL()');
const oneSource = between(etf, '  function fetchOneEtf(', '  /* jl-VR ');
const batchSource = between(etf, '  function fetchEtfs(', '  /* jl-P2:');
const time = (s) => Date.parse('2026-11-18T' + s + '+08:00');
const clockDate = (ms) => class extends Date { constructor(...args) { super(...(args.length ? args : [ms])); } static now() { return ms; } };
function gate(ms = time('10:00:00')) {
  const ctx = vm.createContext({ Date: clockDate(ms), window: {}, marketFundsJL: { rows: [], allSectors: [] }, loadMarketFundsJL: {}, sectorFundsJL: {}, stocks: [], closedStreakJL: () => ({up: 0, dn: 0}), jlLastTradeDay: () => '2026-11-18' });
  vm.runInContext(gateSource, ctx);
  return ctx;
}
const row = (overrides = {}) => ({ asOf: '2026-11-18', today: 2e8, rel: 2, fetchedAt: time('09:59:00'), quoteAt: time('09:58:00'), isToday: true, ...overrides });
function quality(ctx, r) { return ctx.gateEtfQualityJL(r, ctx.gateClockJL()); }
test('source scripts parse', () => {
  new vm.Script(etf);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|application\/(?:ld\+)?json/i.test(m[1])) continue;
    new vm.Script(m[2]);
  }
});
test('10-minute boundary checks source and receipt ages independently', () => {
  const ctx = gate();
  assert.equal(quality(ctx, row()).ok, true);
  for (const overrides of [{quoteAt: time('09:50:00')}, {fetchedAt: time('09:50:00')}, {quoteAt: time('10:01:00')}, {quoteAt: null}, {fetchedAt: undefined}, {asOf: '2026-11-17', isToday: true}, {rel: NaN}]) {
    assert.equal(quality(ctx, row(overrides)).ok, false);
  }
  assert.equal(quality(ctx, row({quoteAt: time('09:50:01')})).ok, true);
});
test('lunch freezes freshness at 11:30, reopening uses actual time', () => {
  const r = row({ fetchedAt: time('11:29:00'), quoteAt: time('11:28:00') });
  assert.equal(quality(gate(time('12:59:00')), r).ok, true);
  assert.equal(quality(gate(time('12:30:00')), row({fetchedAt: time('12:29:00'), quoteAt: time('11:19:00')})).ok, false);
  assert.equal(quality(gate(time('13:00:00')), r).ok, false);
});
test('after close requires same-day source quote at or after 15:00', () => {
  const ctx = gate(time('20:00:00'));
  assert.equal(quality(ctx, row({fetchedAt: time('15:01:00'), quoteAt: time('15:00:00')})).ok, true);
  assert.equal(quality(ctx, row({fetchedAt: time('19:59:00'), quoteAt: time('14:59:00')})).ok, false);
  assert.equal(quality(ctx, row({fetchedAt: time('19:59:00'), quoteAt: null, flowSource: 'daykline'})).ok, false);
});
test('lunch snapshot retains morning tail but rejects old morning data', () => {
  const ctx = gate(time('12:40:00')), c = ctx.gateClockJL();
  const s = {td: c.day, ms: time('11:29:00'), at: '11:29'};
  assert.equal(ctx.gateSnapFreshJL(s, c, false, c.day), true);
  assert.equal(ctx.gateSnapFreshJL({...s, ms: time('12:39:00'), at: '10:59'}, c, false, c.day), false);
  assert.equal(ctx.gateSnapFreshJL({...s, td: '2026-11-17'}, c, false, c.day), false);
});
function supply(ctx, r, snapMs, snapAt = '09:59') {
  ctx.window.__JLV2S__ = {snap: {td: '2026-11-18', ms: snapMs, at: snapAt, t: 55}, etf: r ? [r] : []};
  ctx.window.__JLV2T__ = {deriveState: () => ({state:'正常'}), deriveStruct: () => ({v: 0, p300: 1, upR: 60})};
}
test('real input preserves temperature dependency and rejects cross-day ETF boolean', () => {
  const ctx = gate();
  supply(ctx, row(), time('09:59:00'));
  assert.ok(ctx.gateInputJL().gjd);
  supply(ctx, row({asOf:'2026-11-17', isToday:true}), time('09:59:00'));
  assert.equal(ctx.gateInputJL().gjd, undefined);
  supply(ctx, row(), time('09:29:00'));
  assert.equal(ctx.gateInputJL().gjd, undefined);
  supply(ctx, row({fetchedAt:undefined, quoteAt:undefined}), time('09:59:00'));
  assert.equal(ctx.gateInputJL().gjd, undefined);
});
test('real input retains temperature, structure and ETF throughout lunch', () => {
  const ctx = gate(time('12:45:00'));
  supply(ctx, row({fetchedAt:time('11:29:00'), quoteAt:time('11:28:00')}), time('11:29:00'), '11:29');
  const inp = ctx.gateInputJL();
  assert.ok(inp.temp && inp.struct && inp.gjd);
});
const base = () => ({temp:{t:55,state:'正常'}, struct:{v:0}, ev:[], trend:{up:0,dn:0}, holds:[]});
test('removing negative or positive ETF cannot produce green; insufficient stays nodata', () => {
  const ctx = gate();
  const score = (rel, ok) => ctx.gateScoreJL({...base(), gjd:{isToday:true,rel}, gjdQuality:{ok,reason: ok ? '' : 'ETF已过期·待刷新'}});
  assert.equal(score(-2,true).sum,2);
  assert.equal(score(-2,false).sum,3);
  assert.equal(score(-2,false).lvl,'yellow');
  assert.equal(score(2,true).sum,4);
  assert.equal(score(2,true).lvl,'green');
  assert.equal(score(2,false).sum,3);
  assert.equal(score(2,false).lvl,'yellow');
  const n = ctx.gateScoreJL({temp:{t:55},struct:{v:0},trend:{up:0,dn:0},gjdQuality:{ok:false,reason:'ETF过期'}});
  assert.equal(n.okN,3); assert.equal(n.lvl,'nodata');
  assert.equal(ctx.gateScoreJL({...base(),temp:{t:10,state:'冰点'},gjdQuality:{ok:false}}).lvl,'red');
});
function fetchContext(opts = {}) {
  let ms = time('10:00:00');
  const sids = ['1.510300','1.510310','1.510330','0.159919'];
  const ctx = vm.createContext({Date: class extends Date {constructor(...a){super(...(a.length?a:[ms]));} static now(){return ms;}}, CFG:{etfs:[[sids[0],'300x4','codes',sids]]}, P2H:[],P2:[],UT:'test',today:()=> '2026-11-18',nowMin:()=>1000, fetchVolRatio:(ids,cb)=>{ms += 60000;cb(null);}, jsonp:(hosts,url,cb)=>{
    if (url.includes('daykline')) {
      if (opts.failDay) return cb(new Error('fail'));
      ms += 1000;
      return cb(null,{data:{klines:['2026-11-17,10', ...(opts.todayLine ? ['2026-11-18,12'] : [])]}});
    }
    if(opts.failQuote) return cb(new Error('fail'));
    cb(null,{data:{diff:sids.map((sid,i)=>({f12:sid.slice(2),f62:20,f124:time(i ? '09:59:00':'09:58:00')/1000}))}});
  }});
  vm.runInContext(oneSource,ctx); return ctx;
}
test('fetch tracks source quote and receipt before slow volume callback, replaces today row', () => {
  for (const todayLine of [false,true]) {
    const ctx=fetchContext({todayLine}); let result; ctx.fetchOneEtf(0,(e,r)=>{assert.equal(e,null);result=r;});
    assert.equal(result.today,80); assert.equal(result.arr.length,2);
    assert.equal(result.quoteAt,time('09:58:00')); assert.equal(result.fetchedAt,time('10:00:04'));
    assert.equal(result.flowSource,'ulist');
  }
});
test('day-only fallback keeps quote time unknown; failed group returns no row', () => {
  let result; fetchContext({todayLine:true,failQuote:true}).fetchOneEtf(0,(e,r)=>{result=r;});
  assert.equal(result.quoteAt,null); assert.equal(result.flowSource,'daykline');
  assert.equal(result.fetchedAt,time('10:00:01'));
  assert.equal(quality(gate(time('10:02:00')),result).ok,false);
  fetchContext({failDay:true}).fetchOneEtf(0,(e,r)=>{assert.ok(e);assert.equal(r,undefined);});
});
test('whole batch failure retains old object; partial failure removes failed group', () => {
  for(const allFail of [true,false]) {
    const old=[row()]; const state={etf:old};
    const ctx=vm.createContext({S:state,CFG:{etfs:[[],[]]},window:{},setTimeout:fn=>fn(),fetchOneEtf:(i,cb)=>i===0||allFail?cb(new Error('fail')):cb(null,row()),lsSet:()=>{},hhmm:()=> '10:00',nowMin:()=>1000,today:()=> '2026-11-18',document:{dispatchEvent:()=>{}},CustomEvent:class{}});
    vm.runInContext(batchSource,ctx); ctx.fetchEtfs(()=>{});
    if(allFail) assert.equal(state.etf,old); else {assert.equal(state.etf[0],undefined);assert.ok(state.etf[1]);}
  }
});
test('same-day cache round-trip retains row timestamps, never fabricates legacy timestamps', () => {
  const cacheCode=between(etf,'    var et = lsGet("jlv2_etf_v1"','    var ho =');
  for (const r of [row(), {asOf:'2026-11-18',today:1,rel:2,isToday:true}]) {
    const ctx=vm.createContext({S:{},d:'2026-11-18',lsGet:()=>JSON.parse(JSON.stringify({date:'2026-11-18',rows:[r],at:'09:59'}))});
    vm.runInContext(cacheCode,ctx);
    assert.equal(ctx.S.etf[0].fetchedAt,r.fetchedAt);
    assert.equal(ctx.S.etf[0].quoteAt,r.quoteAt);
    assert.equal(quality(gate(),ctx.S.etf[0]).ok,!!r.fetchedAt);
  }
});
