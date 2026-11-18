const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n  }', start) + 4);
}
function context(extra={}) {
  const ctx = vm.createContext({Date, console, ...extra});
  ['reviewClosedBarsJL','reviewPriceSummaryJL','reviewLineOutcomeJL','reviewHTMLJL','reviewReadJL','reviewVisibleJL','scheduleReviewJL'].forEach(n=>vm.runInContext(source(n),ctx));
  return ctx;
}
const bar=(t,o=10,c=11,v=100)=>({t,o,c,v,h:Math.max(o,c)+1,l:Math.min(o,c)-1});
test('settlement boundary is China 15:10 regardless of host timezone; future bars excluded',()=>{
  const c=context(), bars=[bar('2026-11-17'),bar('2026-11-18 15:00'),bar('2026-11-19')];
  assert.equal(c.reviewClosedBarsJL(bars, Date.parse('2026-11-18T07:09:59Z')).length,1);
  assert.equal(c.reviewClosedBarsJL(bars, Date.parse('2026-11-18T07:10:00Z')).length,2);
  assert.equal(bars.length,3);
});
test('five-day return includes first-day overnight gap; short sample labels actual days',()=>{
  const c=context(), bars=Array.from({length:6},(_,i)=>bar('2026-11-'+(10+i),i?20:9,i?22:10));
  assert.ok(Math.abs(c.reviewPriceSummaryJL(bars).change-120)<1e-9);
  assert.equal(c.reviewPriceSummaryJL(bars).days,5);
  assert.equal(c.reviewPriceSummaryJL(bars.slice(-2)).days,2);
  assert.equal(c.reviewPriceSummaryJL([]).change,null);
});
test('missing volume cannot be called shrinking volume; measured zero remains valid',()=>{
  const c=context(), bars=[bar('2026-11-17'),bar('2026-11-18',12,10,null)];
  assert.match(c.reviewPriceSummaryJL(bars).conclusion,/暂缺/);
  bars[1].v=0;
  assert.equal(c.reviewPriceSummaryJL(bars).conclusion,'价格回落 · 缩量');
});
test('line date with time does not count drawing day as T+1',()=>{
  const c=context(), L={d:'2026-11-17',pane:'price',aV:10,bV:10};
  let r=c.reviewLineOutcomeJL(L,[bar('2026-11-17 15:00')]);
  assert.equal(r.n,0);assert.equal(r.st,'观察中');
  r=c.reviewLineOutcomeJL(L,[bar('2026-11-17 15:00'),bar('2026-11-18 15:00')]);
  assert.equal(r.n,1);assert.equal(r.st,'已触及/回踩');
});
test('reversed anchors describe the same diagonal; ambiguous intraday and volume lines are not scored',()=>{
  const c=context(), bars=[bar('2026-11-16'),bar('2026-11-17'),bar('2026-11-18',13,14)];
  const L={d:'2026-11-17',pane:'price',aD:'2026-11-16',bD:'2026-11-17',aV:10,bV:12};
  const a=c.reviewLineOutcomeJL(L,bars), b=c.reviewLineOutcomeJL({...L,aD:L.bD,bD:L.aD,aV:L.bV,bV:L.aV},bars);
  assert.equal(a.st,'已触及/回踩');assert.deepEqual(a,b);
  assert.match(c.reviewLineOutcomeJL({...L,aD:L.bD},bars).st,/暂不评估/);
  assert.match(c.reviewLineOutcomeJL({...L,pane:'vol'},bars).st,/不按价格/);
});
test('line evaluation has linear work without repeated indexOf scans',()=>{
  const c=context(), bars=Array.from({length:320},(_,i)=>bar(new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10)));
  bars.indexOf=()=>{throw Error('quadratic lookup');};
  const r=c.reviewLineOutcomeJL({d:bars[1].t,pane:'price',aD:bars[0].t,bD:bars[1].t,aV:10,bV:11},bars);
  assert.equal(r.n,318);
});
test('hidden review does no work; bursts coalesce; navigation away cancels pending display; re-entry uses new data',()=>{
  const queue=[], calls=[];
  const c=context({page:'holds',document:{hidden:false},requestAnimationFrame:fn=>queue.push(fn)});
  const renderers=['renderReviewSummaryJL','renderPoolPicksJL','renderFundReviewJL','judgeRender99','lineReviewScanJL'];
  c.version=1;
  renderers.forEach(n=>c[n]=()=>calls.push([n,c.version]));
  c.scheduleReviewJL();assert.equal(queue.length,0);
  c.page='reviewPage';for(let i=0;i<100;i++)c.scheduleReviewJL();assert.equal(queue.length,1);
  c.page='holds';queue.shift()();assert.equal(calls.length,0);
  c.page='reviewPage';c.version=2;c.scheduleReviewJL();queue.shift()();
  assert.equal(calls.length,5);assert.ok(calls.every(x=>x[1]===2));
  c.document.hidden=true;c.scheduleReviewJL();assert.equal(queue.length,0);
});
test('unchanged HTML preserves DOM nodes and handlers; changed content updates',()=>{
  const c=context();let writes=0;const el={set innerHTML(v){writes++;this.value=v;}};
  c.reviewHTMLJL(el,'first');c.reviewHTMLJL(el,'first');assert.equal(writes,1);
  c.reviewHTMLJL(el,'second');assert.equal(writes,2);
});
test('all review display functions skip storage and DOM while hidden',()=>{
  const c=context({page:'holds',document:{hidden:false},localStorage:{getItem(){throw Error('hidden read');}}});
  for(const n of ['renderReviewSummaryJL','renderReviewEvJL','renderReviewAllJL','renderPoolPicksJL','renderFundReviewJL','judgeRender99','lineReviewScanJL']) {
    vm.runInContext(source(n),c);assert.doesNotThrow(()=>c[n]());
  }
});
test('all inline JavaScript parses and shell versions match',()=>{
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/src=|application\/ld\+json/.test(m[1]))new vm.Script(m[2]);
  }
  const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  assert.equal(html.match(/data-sw="([^"]+)"/)[1],sw.match(/const C = '([^']+)'/)[1]);
});

test('review read cache observes same-tab changes immediately, including clearing and bad JSON',()=>{
  let raw='{"count":1}';const c=context({localStorage:{getItem:()=>raw}});
  const first=c.reviewReadJL('log',{});assert.equal(c.reviewReadJL('log',{}),first);
  raw='{"count":2}';assert.equal(c.reviewReadJL('log',{}).count,2);
  raw=null;assert.equal(Object.keys(c.reviewReadJL('log',{})).length,0);
  raw='{broken';assert.equal(Object.keys(c.reviewReadJL('log',{})).length,0);
});
