const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
const parseSource=html.slice(html.indexOf('function zpFundingParseJL'),html.indexOf('function zpDdxCalcJL'));
const fundingSource=html.slice(html.indexOf('  function fundingStatusJL()'),html.indexOf('  function drawFlow(P)'));
function payload(code='600105',day='2026-11-18',hm='09:31',main='100'){
  return {data:{code,klines:[`${day} ${hm},${main},-100,0,40,60`]}};
}
function harness(){
  let now=100000,paints=0;const requests=[];
  const c={Date:{now:()=>now},FF:{sym:'',request:0},LIVE:{sym:'sh600105',sessDate:'20261118',pts:[{hm:'0935'}]},window:{},RPL:false,mode:'ddx',yyOn:()=>true,render:()=>paints++,emId:s=>s,fM:v=>v,jlSigCum(){},
    emJ:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))};
  vm.createContext(c);vm.runInContext(parseSource+fundingSource,c);
  return {c,requests,tick(ms=15000){now+=ms;},get paints(){return paints;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('funding parser rejects a different symbol/day and retains null fields, sorted and deduplicated',()=>{
  const {c}=harness();const d=payload();
  d.data.klines.push('2026-11-17 15:00,999,0,0,0,0','2026-11-18 09:32, ,-,0,0,0','2026-11-18 09:31,200,0,0,80,120','2026-11-18 12:00,900,0,0,0,0');
  const r=c.zpFundingParseJL(d,'20261118','600105');
  assert.deepEqual(Array.from(r.rows,x=>x.hm),['0931','0932']);assert.equal(r.rows[0].main,200);assert.equal(r.rows[1].main,null);assert.equal(r.rows[1].s,null);
  assert.throws(()=>c.zpFundingParseJL(payload('000892'),'20261118','600105'),/代码/);
  assert.throws(()=>c.zpFundingParseJL(payload(),'20261119','600105'),/交易日/);
});
test('switching A to B to A discards earlier responses without releasing the new request',async()=>{
  const h=harness(),c=h.c;c.loadFF();c.LIVE.sym='sz000892';c.loadFF();c.LIVE.sym='sh600105';c.loadFF();
  assert.equal(h.requests.length,3);
  h.requests[0].resolve(payload());h.requests[1].resolve(payload('000892'));await settle();
  assert.equal(c.FF.rows,null);assert.equal(c.FF.busy,true);assert.equal(c.window.__FFCUMJL,null);
  h.requests[2].resolve(payload());await settle();
  assert.equal(c.FF.busy,false);assert.equal(c.window.__FFCUMJL.code,'600105');assert.equal(c.window.__FFCUMJL.date,'20261118');assert.equal(c.window.__FFCUMJL.sourceHm,'0931');assert.equal(h.paints,1);
});
test('wrong-date primary tries backup, preserves source time, and reports lag against latest price',async()=>{
  const h=harness(),c=h.c;c.loadFF();h.requests[0].resolve(payload('600105','2026-11-17'));await settle();
  assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/push2his/);
  h.requests[1].resolve(payload());await settle();
  assert.match(c.fundingStatusJL(),/09:31.*落后行情4分/);assert.equal(c.FF.d,'20261118');
  h.tick();c.loadFF();h.requests[2].reject(Error('offline'));await settle();h.requests[3].reject(Error('offline'));await settle();
  assert.match(c.fundingStatusJL(),/09:31.*更新失败/);assert.equal(c.FF.rows[0].main,100);
});
test('failed requests are throttled even with no rows; session advance clears old-day funds',async()=>{
  const h=harness(),c=h.c;c.loadFF();h.requests[0].reject(Error('offline'));await settle();h.requests[1].reject(Error('offline'));await settle();
  for(let i=0;i<20;i++) c.loadFF();assert.equal(h.requests.length,2);assert.equal(c.FF.busy,false);
  h.tick();c.loadFF();h.requests[2].resolve(payload());await settle();assert.equal(c.FF.d,'20261118');
  c.LIVE.sessDate='20261119';c.loadFF();assert.equal(c.FF.rows,null);assert.equal(c.window.__FFCUMJL,null);assert.equal(h.requests.length,4);
});
test('main funds pane leaves unsupplied minutes blank rather than extending stale cumulative values',()=>{
  function E(type,attrs={},text){return {type,attrs,text,children:[],appendChild(n){this.children.push(n);},setAttribute(){},classList:{add(){},remove(){}}};}
  const svg=E('svg');svg.parentNode={style:{}};
  const c={...harness().c,$:()=>null,box:null,ySvg:svg,yyOn:()=>true,yySplit:()=>false,loadFF(){},YYS:[['main','主力','#fff']],hm4:h=>h,UP:'red',DN:'green',TXT:'#fff',X0:()=>0,X1:()=>100,YH:74,E,D:{},legend(){}};
  c.LIVE.pts=[{hm:'0933'}];c.FF={rows:[{hm:'0931',main:100}],d:'20261118'};
  vm.createContext(c);vm.runInContext(fundingSource,c);c.loadFF=()=>{};
  const start=html.indexOf('  function drawYy(P)');vm.runInContext(html.slice(start,html.indexOf('  window.zpYyTurns',start)),c);
  c.drawYy(['0931','0932','0933'].map((hm,i)=>({hm,x:i*10})));
  assert.deepEqual(Array.from(c.D.yy.V),[100,null,null]);assert.match(c.D.yy.base.at(-1)[0],/09:31.*落后行情2分/);
});
