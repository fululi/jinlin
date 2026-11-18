const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
const start=html.indexOf('  function pmin(pr)'),end=html.indexOf('  /* 11-12 用户(设计稿v5)',start);
function engine(settings={}) {
  const c={S:{min:10,step:5,n:6,sig:7,ma:'sma',cr:100,f:8,gapm:20,cfm:15,al:1,...settings},memo:{key:'',R:null},per:()=>0};
  vm.createContext(c);vm.runInContext(html.slice(start,end),c);return c;
}
function series(n=300){return Array.from({length:n},(_,i)=>({k:String(i),c:30*Math.exp(.0004*i+.02*Math.sin(i/12)+.008*Math.cos(i/7))}));}
// Independent ordinary least squares: oldest observation first, centered coordinates.
function reference(B,period,S){
  const k=S.al?5/period:1,min=Math.max(S.al&&period>=15?4:2,Math.round(S.min*k)),step=Math.max(S.al&&period>=15?2:1,Math.round(S.step*k)),count=S.n,signal=Math.max(2,Math.round(S.sig*k));
  const osc=B.map((_,i)=>{
    const slopes=[];
    for(let j=0;j<count;j++){
      const length=min+step*j;if(i+1<length)return null;
      const log=B.slice(i+1-length,i+1).map(b=>Number.isFinite(+b.c)&&b.c>0?Math.log(b.c):null);
      if(log.some(v=>v==null))return null;
      const cx=(length-1)/2,cy=log.reduce((a,b)=>a+b,0)/length;
      let cov=0,variance=0;for(let x=0;x<length;x++){cov+=(x-cx)*(log[x]-cy);variance+=(x-cx)**2;}
      slopes.push(cov/variance);
    }
    return slopes.reduce((a,b)=>a+b,0)/count;
  });
  const sig=[];osc.forEach((v,i)=>{
    if(v==null){sig[i]=null;return;}
    if(S.ma==='ema')sig[i]=i&&sig[i-1]!=null?sig[i-1]+2/(signal+1)*(v-sig[i-1]):v;
    else{const a=osc.slice(Math.max(0,i+1-signal),i+1);sig[i]=a.length===signal&&a.every(x=>x!=null)?a.reduce((a,b)=>a+b,0)/signal:null;}
  });return {osc,sig};
}
function close(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((v,i)=>{if(expected[i]==null)assert.equal(v,null,'warmup/gap at '+i);else assert.ok(Math.abs(v-expected[i])<1e-12,`${i}: ${v} != ${expected[i]}`);});}
test('RSO agrees with independent forward-time OLS and SMA/EMA, including exact warmup',()=>{
  for(const ma of ['sma','ema'])for(const period of [1,5,15]){
    const c=engine({ma}),B=series(),r=c.calc(B,period),expected=reference(B,period,c.S);
    close(r.osc,expected.osc);close(r.sig,expected.sig);
    if(period===1){assert.equal(r.osc.findIndex(v=>v!=null),174);assert.equal(r.sig.findIndex(v=>v!=null),ma==='sma'?208:174);}
  }
});
test('constant prices have zero slope, constant compounded growth returns log growth, and price scale does not matter',()=>{
  const c=engine(),B=series();
  for(const v of c.calc(B.map(b=>({...b,c:50})),1).osc.filter(v=>v!=null))assert.ok(Math.abs(v)<1e-12);
  for(const v of c.calc(B.map((b,i)=>({...b,c:50*Math.exp(.001*i)})),1).osc.filter(v=>v!=null))assert.ok(Math.abs(v-.001)<1e-12);
  const original=Array.from(c.calc(B,1).osc);close(c.calc(B.map(b=>({...b,c:b.c*10})),1).osc,original);
});
test('corrected earlier closes invalidate cache even with identical last minute, length and last price',()=>{
  const c=engine(),B=series(),before=c.calc(B,1);B[270].c*=1.2;
  const corrected=c.calc(B,1);assert.notStrictEqual(corrected,before);
  close(corrected.osc,reference(B,1,c.S).osc);assert.notEqual(corrected.osc.at(-1),before.osc.at(-1));
  assert.strictEqual(c.calc(B,1),corrected,'unchanged data should reuse calculation');
});
test('invalid closes break the regression window instead of becoming an invented tiny price',()=>{
  for(const invalid of [0,-1,null,NaN,Infinity]){
    const c=engine({al:0,min:5,step:3,n:3,sig:4}),B=series(80);B[45].c=invalid;
    const r=c.calc(B,1),expected=reference(B,1,c.S);close(r.osc,expected.osc);close(r.sig,expected.sig);
    assert.equal(r.osc[45],null);assert.equal(r.osc[55],null);assert.ok(Number.isFinite(r.osc[56]));
  }
});
test('oscillator, signal and confirmation-minute events are causal for every prefix',()=>{
  const c=engine({al:0,min:5,step:3,n:3,sig:4,cfm:3,gapm:4,f:0}),B=series(180),full=c.calc(B,1);
  assert.ok(full.cu.filter(Boolean).length+full.cd.filter(Boolean).length>3);
  for(let n=15;n<=B.length;n++){
    const r=c.calc(B.slice(0,n),1);close(r.osc,full.osc.slice(0,n));close(r.sig,full.sig.slice(0,n));
    for(const name of ['cu','cd'])for(let i=0;i<n;i++)assert.equal(!!r[name][i],!!full[name][i],`${name} confirmation at ${i}, prefix ${n}`);
  }
});
test('a valid flat-price RSO renders its zero line with a finite, reversible value scale',()=>{
  function E(type,attrs={},text){return {type,attrs,text,children:[],appendChild(n){this.children.push(n);},setAttribute(k,v){this.attrs[k]=v;}};}
  const c=engine(),B=series().map((b,i)=>({...b,c:1,x:6+i,vis:true})),svg=E('svg');
  Object.assign(c,{wrap:{style:{},querySelectorAll:()=>[]},svg,bars:()=>B,mount(){},btn(){},document:{getElementById:()=>({style:{}})},window:{},lines:()=>[],E,PX0:6,LX:336,ORG:[],AQA:[],mix:()=> '#fff',Yv(v){return c.view.top+(c.view.hi-v)/(c.view.hi-c.view.lo)*(c.view.bot-c.view.top);},vOf(y){return c.view.hi-(y-c.view.top)/(c.view.bot-c.view.top)*(c.view.hi-c.view.lo);},check(){},paintXH(){}});
  c.S.on=true;c.S.h=100;const a=html.indexOf('  function draw() {',html.indexOf('/* jl-zprso'));
  vm.runInContext(html.slice(a,html.indexOf('  function toS(e)',a)),c);c.draw();
  assert.ok(c.view);assert.ok(Number.isFinite(c.Yv(0)));assert.ok(Math.abs(c.vOf(c.Yv(0)))<1e-15);
  const plot=svg.children.find(n=>n.type==='g');assert.ok(plot.children.some(n=>n.type==='line'&&n.attrs['stroke-dasharray']));
});
