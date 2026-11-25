const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
const source=html.slice(html.indexOf('  function ddxLineKey()'),html.indexOf('  function drawDdx(P)'));
function setup(){
  const saved={},events={},alerts=[];let seq=[],day=true,phase='am',per=0,paints=0;
  const c={STK:{code:'600105'},LIVE:{sym:'sh600105',sessDate:'20261119',pts:[]},FF:{sym:'sh600105',d:'20261119',rows:[{hm:'1003',main:0}]},window:{addEventListener:(k,f)=>events[k]=f,zpPerOf:()=>per},mode:'ddx',D:{pane:{vy:y=>(65-y)*30/31}},PH2:104,pSvg:{getBoundingClientRect:()=>({top:100,height:208})},
    localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v},liveToday:()=>day,phaseNow:()=>phase,perNmJL:p=>p?p+'分':'分时',zpDdxCalcJL:()=>seq,fundingLagJL:()=>0,zpDdxSeriesJL:s=>s,jlSigPush:(...args)=>alerts.push(args),render:()=>paints++,requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
  c.zpPerOf=c.window.zpPerOf;vm.createContext(c);vm.runInContext(source,c);
  return {c,saved,alerts,setSeq(x){seq=x;},setDay(x){day=x;},setPhase(x){phase=x;},setPer(x){per=x;},get paints(){return paints;},events};
}
const point=(hm,v,n=20)=>({hm,sourceHm:hm,v,n});
test('DDX horizontal lines and alert switch persist by symbol and period',()=>{
  const h=setup(),c=h.c;c.ddxLines([1,5]);c.ddxAlertConfig({on:true,last:'cursor'});
  h.setPer(5);assert.equal(c.ddxLines().length,0);assert.equal(c.ddxAlertConfig().on,false);c.ddxLines([-2]);
  c.STK.code='000892';assert.equal(c.ddxLines().length,0);h.setPer(0);assert.equal(c.ddxLines().length,0);
  c.STK.code='600105';assert.deepEqual(Array.from(c.ddxLines()),[1,5]);assert.equal(c.ddxAlertConfig().last,'cursor');
});
test('DDX alerts use completed samples, seed silently, cross once, and do not backfill after disconnection',()=>{
  const h=setup(),c=h.c;c.ddxLines([0]);c.ddxAlertConfig({on:true,last:''});
  h.setSeq([point('1000',-2),point('1001',-1),point('1002',2)]);c.ddxAlertCheck();assert.equal(h.alerts.length,0);
  h.setSeq([point('1000',-2),point('1001',-1),point('1002',2),point('1003',3)]);c.ddxAlertCheck();assert.equal(h.alerts.length,1);assert.match(h.alerts[0][1],/上穿.*10:02/);
  c.ddxAlertCheck();assert.equal(h.alerts.length,1);
  h.setSeq([point('1001',-1),point('1002',2),point('1003',-1),point('1004',-2)]);c.ddxAlertCheck();assert.equal(h.alerts.length,2);assert.match(h.alerts[1][1],/下穿/);
  h.setSeq([point('1010',-1),point('1011',2),point('1012',3)]);c.ddxAlertCheck();assert.equal(h.alerts.length,2);
});
test('DDX alerts reject another symbol, historical/replay/closed sessions, warmup, and missing values',()=>{
  for(const kind of ['symbol','date','history','replay','closed','warmup','missing']){
    const h=setup(),c=h.c;c.ddxLines([0]);c.ddxAlertConfig({on:true,last:'20261119|1001'});
    h.setSeq([point('1001',-1),point('1002',2),point('1003',3)]);
    if(kind==='symbol') c.FF.sym='sz000892';if(kind==='date') c.FF.d='20261118';if(kind==='history') h.setDay(false);if(kind==='replay') c.window.RPL=true;if(kind==='closed') h.setPhase('closed');
    if(kind==='warmup') h.setSeq([point('1001',-1,18),point('1002',2,19),point('1003',3)]);
    if(kind==='missing') h.setSeq([point('1001',null),point('1002',2),point('1003',3)]);
    c.ddxAlertCheck();assert.equal(h.alerts.length,0,kind);
  }
});
test('DDX line drag tracks percentage coordinates, clamps to the visible plot, and reseeds alerts',()=>{
  const h=setup(),c=h.c;c.ddxLines([5]);c.ddxAlertConfig({on:true,last:'old'});
  const event=(y,id=7)=>({button:0,pointerId:id,clientY:y,cancelable:true,preventDefault(){},stopImmediatePropagation(){},target:{closest:()=>({getAttribute:()=> '0'})}});
  c.ddxDragStart(event(230));assert.equal(c.window.__xhOwnJL.ddx,1);
  c.ddxDragMove(event(208));assert.equal(c.ddxLines()[0],15.65);assert.equal(c.ddxAlertConfig().last,'');
  const before=c.ddxLines()[0];c.ddxDragMove(event(999,8));assert.equal(c.ddxLines()[0],before);
  c.ddxDragEnd();assert.equal(c.window.__xhOwnJL.ddx,undefined);assert.equal(h.paints,1);
  c.ddxLines([0]);c.ddxDragStart(event(230));c.ddxDragMove(event(-100));assert.ok(Math.abs(c.ddxLines()[0])<=31);
  c.STK.code='000892';c.ddxDragMove(event(200));assert.equal(c.ddxDrag,null);assert.equal(c.ddxLines().length,0);
});
