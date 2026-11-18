const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
function loader() {
  let now = 0, seq = 0, embedded = true, painted = 0;
  const timers = new Map(), chip = {style:{display:'flex'}};
  const fr = {style:{visibility:'hidden'}, contentDocument:null};
  const ctx = {fr, code:'600105', lines2:'', URL, window:{},
    Date:{now:()=>now}, $:()=>chip, byCode:()=>({name:'test'}),
    ksCvJL:d=>d.canvas, encodeURIComponent,
    setTimeout:fn=>{timers.set(++seq, fn);return seq;}, clearTimeout:id=>timers.delete(id),
    document:{body:{classList:{contains:()=>embedded, remove:()=>{embedded=false;}}}},
    paint:()=>painted++, toast:()=>{}};
  const start=html.indexOf('        // Poll independently of iframe load:');
  const end=html.indexOf('\n      }\n      const cr', start);
  assert.ok(start>0 && end>start);
  vm.runInNewContext(html.slice(start,end),ctx);
  return {fr,chip,timers,ctx, get painted(){return painted;},
    ready(url='https://example.com/ks.html?code=600105'){fr.contentDocument={location:{href:url},readyState:'loading',canvas:{width:800}};},
    step(ms=400){now+=ms; const [id, fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
test('canvas is revealed without iframe load, even while document is loading',()=>{
  const l=loader();l.ready();l.step();
  assert.equal(l.fr.style.visibility,'visible');assert.equal(l.chip.style.display,'none');assert.equal(l.timers.size,0);
  l.fr.onload();assert.equal(l.timers.size,0);
});
test('homepage or previous stock canvas cannot satisfy readiness',()=>{
  for(const url of ['https://example.com/index.html','https://example.com/ks.html?code=000001']){
    const l=loader();l.ready(url);l.step();assert.equal(l.fr.style.visibility,'hidden');
    l.step(132000);assert.equal(l.painted,1);assert.equal(l.chip.style.display,'none');assert.equal(l.timers.size,0);
  }
});
test('late callbacks from a superseded navigation do not change the new chart',()=>{
  const l=loader();l.ready();l.fr.__ksLoadTicket={};l.step();l.fr.onerror();
  assert.equal(l.fr.style.visibility,'hidden');assert.equal(l.painted,0);
});
test('onload does not cancel the bounded fallback when canvas is missing',()=>{
  const l=loader();l.fr.onload();assert.equal(l.timers.size,1);l.step(132000);assert.equal(l.painted,1);
});
async function requestShell(file, entries, online=false) {
  const handlers={};let response;
  const ctx={URL,location:{origin:'https://example.com'},
    self:{addEventListener:(name,fn)=>handlers[name]=fn},
    fetch:()=>online ? Promise.resolve({ok:true,clone(){return this;},body:'NETWORK'}) : Promise.reject(new Error('offline')),
    setTimeout:()=>0,
    caches:{keys:async()=>Object.keys(entries),open:async(name)=>({
      match:async(url)=>entries[name]?.[new URL(typeof url==='string'?url:url.url).pathname],put:async()=>{}
    })}};
  vm.runInNewContext(sw,ctx);
  handlers.fetch({request:{method:'GET',url:'https://example.com/jinlin/'+file},respondWith:p=>response=p});
  return response;
}
test('offline chart gets the newest matching chart cache, never home HTML',async()=>{
  const entries={'jinlin-shell-v419':{'/jinlin/ks.html':'OLD'},'jinlin-shell-v420':{'/jinlin/index.html':'HOME','/jinlin/ks.html':'CHART','/jinlin/ks2.html':'DUAL'}};
  assert.equal(await requestShell('ks.html?code=600105',entries),'CHART');
  assert.equal(await requestShell('ks2.html?code=600105',entries),'DUAL');
  assert.equal(await requestShell('',entries),'HOME');
});
test('missing chart cache fails rather than returning home HTML',async()=>{
  await assert.rejects(requestShell('ks.html',{'jinlin-shell-v420':{'/jinlin/index.html':'HOME'}}),/no-shell/);
});
test('successful network response is used on a current-cache miss',async()=>{
  assert.equal((await requestShell('ks.html',{},true)).body,'NETWORK');
});
