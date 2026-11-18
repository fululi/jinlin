const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
function resize(){
  const events={},saved={};let now=1000,paints=0;
  const c={PH:316,YRES:56,Date:{now:()=>now},localStorage:{setItem:(k,v)=>saved[k]=v},window:{PointerEvent:function(){},addEventListener:(k,f)=>events[k]=f}};
  c.zpRedrawSoon=c.zpRedrawFull=()=>paints++;
  c.window.zpRedrawSoon=c.zpRedrawSoon;c.window.zpRedrawFull=c.zpRedrawFull;
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('function zpVolHeightJL'),html.indexOf('var YRES = 56')),c);
  const start=html.indexOf('/* 成交量分隔条：');vm.runInContext(html.slice(start,html.indexOf('function toSvg(cx,cy)',start)),c);
  const grip={ownerSVGElement:{getScreenCTM:()=>({d:2})}};
  return {c,saved,events,get paints(){return paints;},step:()=>now+=100,
    fire(type,y=300,x=100){const e={type,pointerId:1,clientY:y,clientX:x,cancelable:true,preventDefault(){},stopImmediatePropagation(){},target:{closest:()=>grip}};events[type](e);}};
}
test('volume separator drags in SVG units, clamps height, saves, and releases ownership on cancellation',()=>{
  const r=resize();r.fire('pointerdown');r.fire('pointermove',100);assert.equal(r.c.YRES,156);assert.equal(r.c.window.__xhOwnJL.vg,1);
  r.fire('pointermove',-1000);assert.equal(r.c.YRES,190);r.fire('pointercancel');
  assert.equal(r.saved.zp_yres_v1,'190');assert.equal(r.c.window.__xhOwnJL.vg,undefined);
  r.step();r.fire('pointerdown');r.fire('pointermove',2000);r.fire('pointerup');assert.equal(r.c.YRES,30);assert.equal(r.saved.zp_yres_v1,'30');
});
test('double taps enlarge and restore volume; completing a drag cannot trigger a reset on the next touch',()=>{
  const r=resize();r.fire('pointerdown');r.fire('pointerup');r.step();r.fire('pointerdown');assert.equal(r.c.YRES,142);
  r.step();r.fire('pointerdown');r.fire('pointermove',250);r.fire('pointerup');const height=r.c.YRES;
  r.step();r.fire('pointerdown');assert.equal(r.c.YRES,height);r.fire('pointerup');
  r.step();r.fire('pointerdown');assert.equal(r.c.YRES,56);
});
test('reopening restores valid saved candles immediately, including histories older than eight days',()=>{
  const start=html.indexOf('  if (!(LIVE.hist.day && LIVE.hist.day.length)) try { var dkc0');
  const source=html.slice(start,html.indexOf('\n',start));let painted=0;
  const rows=[['2026-01-01',10,11,12,9,100]];
  const c={LIVE:{hist:{day:[]}},sym:'sh600105',localStorage:{getItem:()=>JSON.stringify(rows)},dg:t=>String(t).replace(/\D/g,''),mrow:r=>({t:r[0],c:r[2]}),window:{zpPerOf:()=>101},zpPerOf:()=>101,liveRender:()=>painted++};
  vm.runInNewContext(source,c);assert.equal(c.LIVE.hist.day[0].c,11);assert.equal(c.LIVE.dayCached,true);assert.equal(painted,1);
});
test('daily data applies while the other slow requests remain pending',async()=>{
  const start=html.indexOf('    var pendingSlow = 3;');const source=html.slice(start,html.indexOf('\n  }\n  LIVE.slowN++',start));
  let applied=[],painted=0;const c={LIVE:{gen:1,slowBusy:true},gen:1,sym:'sh600105',Pm15:new Promise(()=>{}),Pm30:new Promise(()=>{}),Pday:Promise.resolve(['day']),liveSlowApply:(got)=>applied.push(got),liveSlowAfter:()=>painted++};
  vm.runInNewContext(source,c);await new Promise(resolve=>setImmediate(resolve));assert.equal(applied[0].day[0],'day');assert.equal(painted,1);assert.equal(c.LIVE.slowBusy,true);
});
