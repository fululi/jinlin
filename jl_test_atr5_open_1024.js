const fs = require('fs'), vm = require('vm'), assert = require('assert'), cp = require('child_process');
const html = fs.readFileSync('index.html', 'utf8');
function fnSource(name) {
  const start = html.indexOf('function ' + name + '(');
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
const store = new Map();
const ctx = {
  console, Date, Math, Number, String, Array, Object, JSON, RegExp,
  rows: [],
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
  dailyBarsOf: () => ctx.rows,
  jlLastTradeDay: () => ctx.observed || ''
};
vm.createContext(ctx);
vm.runInContext('const ATR5_OPEN_CODES_JL = {"603986":{"highGap":"27/46=58.7%","fridayPreview":{"open":271.09,"lower":261.0942,"upper":282.5493}},"600105":{"highGap":"16/26=61.5%","fridayPreview":{"open":27,"lower":25.5167,"upper":28.4719}}};', ctx);
for (const n of ['jlDayClosedJL','atrLocalDayJL','atrQuoteDayJL','atr5ExpectedParamDateJL','atr5PercentileJL','atr5OpenParamsJL','atr5CacheKeyJL','atr5ReadCacheJL','atr5WriteCacheJL','atr5ParamsForJL','atrOpenModelJL','atrOpenHTMLJL']) vm.runInContext(fnSource(n), ctx);
function bars(n = 140) {
  const out = [], d = new Date('2026-03-01T00:00:00');
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      const i = out.length, c = 100 + (i % 7) * .2, o = c - .1;
      out.push({ t: d.toLocaleDateString('sv-SE'), o, c, h: c + 1 + (i % 3) * .1, l: o - .8, v: 1000 });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const cases = []; function ok(name, cond) { assert(cond, name); cases.push(name); }
const boot = { console, Date, Math, Number, String, Array, Object, JSON, RegExp }; vm.createContext(boot);
vm.runInContext('var ATR5_OPEN_CODES_JL;' + fnSource('atrOpenModelJL') + ';bootResult=atrOpenModelJL({code:"603986"});', boot);
ok('first render before config assignment degrades without startup error', boot.bootResult === null);
ctx.rows = bars();
const sat = new Date('2026-10-24T12:00:00');
// Align fixture final session with the frozen test clock.
const dates = ctx.rows.map(x => x.t); ctx.rows = bars(); const shift = Math.round((new Date('2026-10-23') - new Date(dates[dates.length - 1])) / 864e5);
ctx.rows.forEach(x => { const d = new Date(x.t); d.setDate(d.getDate() + shift); x.t = d.toLocaleDateString('sv-SE'); });
const baseParams = vm.runInContext('atr5OpenParamsJL(rows, new Date("2026-10-24T12:00:00"))', ctx);
ok('120 completed sessions and Wilder ATR5 available', baseParams.ok && baseParams.sample === 120 && baseParams.atr > 0);
const savedRows = ctx.rows;
ctx.rows = savedRows.slice(0, -1).concat([Object.assign({}, savedRows[savedRows.length - 1], { h: 999, l: .1 })]);
const mutated = vm.runInContext('atr5OpenParamsJL(rows, new Date("2026-10-24T12:00:00"))', ctx);
ok('day i TR excluded from day i ATR', Math.abs(mutated.atr - baseParams.atr) < 1e-12);
ctx.rows = savedRows;
ok('p80 uses linear (n-1) interpolation', Math.abs(vm.runInContext('atr5PercentileJL(Array.from({length:120},(_,i)=>i+1),.8)', ctx) - 96.2) < 1e-12);
function stock(code, open, tm, prevClose) { return { code, open, base: open + 1, prevClose, quoteReady: true, quoteAt: tm, quoteDate: tm.slice(0,4)+'-'+tm.slice(4,6)+'-'+tm.slice(6,8) }; }
let model = vm.runInContext(`(function(){rows=${JSON.stringify(ctx.rows)};return atrOpenModelJL(${JSON.stringify(stock('603986',100,'20261026092400',100))},new Date('2026-10-26T09:24:00'));})()`, ctx);
ok('before 09:25 waits without pseudo anchor', model.beforeOpen && !model.anchor && atrText(model.beforeOpen));
function atrText(v){return v===true}
model = vm.runInContext(`(function(){return atrOpenModelJL(${JSON.stringify(stock('603986',100,'20261026092500',100))},new Date('2026-10-26T09:25:00'));})()`, ctx);
ok('09:25 valid actual open latches both edges', model.anchor && model.anchor.open === 100 && Math.abs(model.anchor.upper - (100 + model.params.atr * model.params.kUp)) < 1e-10 && Math.abs(model.anchor.lower - (100 - model.params.atr * model.params.kDown)) < 1e-10);
const firstOpen = model.anchor.open, firstAtr = model.params.atr, firstKu = model.params.kUp, firstKd = model.params.kDown;
model = vm.runInContext(`(function(){return atrOpenModelJL(${JSON.stringify(stock('603986',99,'20261026093000',100))},new Date('2026-10-26T09:30:00'));})()`, ctx);
ok('later quote open changes never re-anchor', model.anchor.open === firstOpen);
store.clear();
model = vm.runInContext(`(function(){return atrOpenModelJL(${JSON.stringify(stock('603986',0,'20261026092600',100))},new Date('2026-10-26T09:26:00'));})()`, ctx);
ok('invalid open remains explicitly unanchored', !model.anchor && !model.beforeOpen && vm.runInContext(`atrOpenHTMLJL(${JSON.stringify(stock('603986',0,'20261026092600',100))})`, ctx).includes('未锚定'));
store.clear();
vm.runInContext(`(function(){rows=${JSON.stringify(ctx.rows)};return atrOpenModelJL(${JSON.stringify(stock('603986',100,'20261026092500',100))},new Date('2026-10-26T09:25:00'));})()`, ctx);
const other = vm.runInContext(`(function(){return atrOpenModelJL(${JSON.stringify(stock('600105',50,'20261026092500',100))},new Date('2026-10-26T09:25:00'));})()`, ctx);
ok('stock-specific anchors and cache keys cannot cross', other.anchor.open === 50 && [...store.keys()].some(k => k.includes(':603986:2026-10-26')) && [...store.keys()].some(k => k.includes(':600105:2026-10-26')));
store.clear(); // independent high-open fixture: do not reuse the 50 anchor above
const highOpen = baseParams.prevClose * 1.04;
const high = vm.runInContext(`(function(){return atrOpenModelJL(${JSON.stringify(stock('600105',highOpen,'20261026092500',100))},new Date('2026-10-26T09:25:00'));})()`, ctx);
ok('high-open notice never adjusts parameters', high.notices.some(x => x.includes('16/26=61.5%')) && high.params.atr === firstAtr && high.params.kUp === firstKu && high.params.kDown === firstKd);
store.clear();
const baseRows = ctx.rows.slice(), limitRows = ctx.rows.slice();
limitRows[limitRows.length - 2] = Object.assign({}, limitRows[limitRows.length - 2], {c:100,l:99.5});
limitRows[limitRows.length - 1] = Object.assign({}, limitRows[limitRows.length - 1], {o:109.8,c:110,h:111,l:109});
const limitModel = vm.runInContext(`(function(){rows=${JSON.stringify(limitRows)};return atrOpenModelJL(${JSON.stringify(stock('603986',110,'20261026092500',110))},new Date('2026-10-26T09:25:00'));})()`, ctx);
ok('previous-day >=9.7% is only an overlapping notice', limitModel.notices.some(x => x.includes('涨停近似态')) && limitModel.notices.some(x => x.includes('参数不调整')) && Math.abs(limitModel.anchor.upper - (110 + limitModel.params.atr * limitModel.params.kUp)) < 1e-10 && Math.abs(limitModel.anchor.lower - (110 - limitModel.params.atr * limitModel.params.kDown)) < 1e-10);
ctx.rows = baseRows; store.clear();
const nextRows = ctx.rows.concat([{t:'2026-10-26',o:100,c:101,h:102,l:99,v:1000}]);
const next = vm.runInContext(`(function(){rows=${JSON.stringify(nextRows)};return atrOpenModelJL(${JSON.stringify(stock('603986',0,'20261027092500',101))},new Date('2026-10-27T09:25:00'));})()`, ctx);
ok('next session never reuses prior-day anchor', next.sessionDay === '2026-10-27' && !next.anchor);
const staleRows = baseRows.slice(0, -1); ctx.rows = staleRows;
const stale = vm.runInContext(`(function(){rows=${JSON.stringify(staleRows)};return atrOpenModelJL(${JSON.stringify(stock('603986',100,'20261026092500',100))},new Date('2026-10-26T09:25:00'));})()`, ctx);
ok('stale parameter date is explicit', stale.params.stale && vm.runInContext(`(function(){rows=${JSON.stringify(staleRows)};return atrOpenHTMLJL(${JSON.stringify(stock('603986',100,'20261026092500',100))});})()`, ctx).includes('参数数据陈旧'));
const bad = ctx.rows.slice(); bad[bad.length - 1] = Object.assign({}, bad[bad.length - 1], {h:.01});
ok('OHLC anomaly fails closed', !vm.runInContext(`atr5OpenParamsJL(${JSON.stringify(bad)},new Date('2026-10-24T12:00:00')).ok`, ctx));
const ui = vm.runInContext(`(function(){rows=${JSON.stringify(ctx.rows)};return atrOpenHTMLJL(${JSON.stringify(stock('603986',100,'20261026092500',100))});})()`, ctx);
ok('page copy has date, edges and Friday preview', ui.includes('<b>ATR</b>') && ui.includes('参数日') && ui.includes('下沿') && ui.includes('上沿') && ui.includes('周五回推'));
const head = cp.execFileSync('git',['show','HEAD:index.html'],{encoding:'utf8',maxBuffer:16*1024*1024});
for (const name of ['computeTierJL','magnetsJL','snapLvJL','zzThJL','zzPivotsJL','zzMergeSmallLegsJL']) {
  const current = fnSource(name), oldHtml = html; // fnSource reads current html; extract HEAD independently below.
  const re = new RegExp('function ' + name + '\\('); assert(re.test(head));
  const start = head.search(re), b = head.indexOf('{', start); let depth=0,quote='',esc=false,end=-1;
  for(let i=b;i<head.length;i++){const c=head[i];if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}}
  ok(name + ' source and behavior inputs unchanged', current === head.slice(start,end));
}
console.log('PASS', cases.length + '/' + cases.length); cases.forEach((x,i)=>console.log(String(i+1).padStart(2,'0'),x));
