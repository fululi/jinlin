const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const source=scripts.find(s=>s.includes('function zpDdxCalcJL'));
assert.ok(source,'DDX functions must be executable JavaScript, not CSS');
const ctx={};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function zpDdxCalcJL'),source.indexOf('/* jl-zpsub (11-04): 作战屏副图')),ctx);
function sample(ds){let cum=0;return {rows:ds.map((d,i)=>({hm:String(930+i).padStart(4,'0'),main:cum+=d})),pts:ds.map((_,i)=>({hm:String(930+i).padStart(4,'0'),a:1000}))};}
test('DDX uses cumulative differences and the same 20 actual amounts; early values are explicit warmup',()=>{
  const x=sample(Array.from({length:25},(_,i)=>i%2?-20:100));
  const r=ctx.zpDdxCalcJL(x.rows,x.pts);
  assert.equal(r[0].v,10);assert.equal(r[0].n,1);
  assert.equal(r[19].n,20);assert.equal(r[19].v,4);assert.equal(r[24].v,4);
  assert.equal(r[0].ma,null);assert.ok(Number.isFinite(r[9].ma));
});
test('missing real amount is never replaced by volume times price, and zero total is not divided',()=>{
  const x=sample([10,20,30]);delete x.pts[1].a;x.pts[1].v=999;x.pts[1].p=100;
  const r=ctx.zpDdxCalcJL(x.rows,x.pts);assert.equal(r[1].a,1000);assert.equal(r[1].est,true);assert.equal(r[2].est,true);assert.equal(r[0].est,false);   // 11-19晚2批: 缺分钟额用当日中位数补并标est(不用量×价)
  assert.equal(ctx.zpDdxCalcJL([{hm:'0930',main:10}],[{hm:'0930',a:0}])[0].v,null);
});
test('missing flow minutes do not become one-minute flow; late first cumulative value is rejected',()=>{
  const x=sample([10,20,30,40]);x.rows.splice(1,1);
  const r=ctx.zpDdxCalcJL(x.rows,x.pts);assert.equal(r[1].d,null);assert.equal(r[1].v,null);
  assert.equal(ctx.zpDdxCalcJL([{hm:'1000',main:999}],[{hm:'1000',a:1000}])[0].v,null);
});
test('DDX ignores minute noise and confirms sustained reversals at the original extreme minute',()=>{
  const rows=[0,3,4,4,3.8,4,1,0,1,0,0,-1,-4,-4.2,-4,-1,0,-1].map((v,i)=>({hm:String(1000+i),v,n:20}));
  const t=ctx.zpDdxTurnsJL(rows);
  assert.deepEqual(JSON.parse(JSON.stringify(t)),[
    {hm:'1005',v:4,h:true,n:20,confirmedHm:'1008'},
    {hm:'1013',v:-4.2,h:false,n:20,confirmedHm:'1017'}
  ]);
  for(let k=1;k<rows.length;k++) assert.deepEqual(JSON.parse(JSON.stringify(ctx.zpDdxTurnsJL(rows.slice(0,k)))),JSON.parse(JSON.stringify(t.filter(x=>x.confirmedHm<rows[k].hm))));
});
test('DDX warmup and missing data cannot create turning points across a gap',()=>{
  const rows=[0,20,0,-20,0,20,null,0,3,0,0,0].map((v,i)=>({hm:String(1000+i),v,n:i<6?i+1:20}));
  assert.equal(ctx.zpDdxTurnsJL(rows).length,0);
});
test('DDX scale keeps small moves readable without stretching them and leaves room for real extremes',()=>{
  assert.equal(ctx.zpDdxScaleJL([{v:.5},{v:-1},{v:null}]),10);assert.equal(ctx.zpDdxScaleJL([{v:80,n:3},{v:12,n:20}]),15);   // 11-19: 预热段不进刻度
  assert.equal(ctx.zpDdxScaleJL([{v:18.06},{v:-23.35}]),30);
  assert.ok(ctx.zpDdxScaleJL([{v:70}])>70);
});
test('5-minute main markers and the pane use the same last-minute samples, without hidden intrabar extrema',()=>{
  const rows=[1,9,1,5,4,2,3,6].map((v,i)=>({hm:String(930+i).padStart(4,'0'),v,d:10,n:i+1}));
  const series=ctx.zpDdxSeriesJL(rows,h=>'20261118'+(h<'0933'?'0935':h<'0936'?'0940':'0945'));
  assert.deepEqual(Array.from(series,r=>r.v),[1,2,6]);
  assert.deepEqual(Array.from(series,r=>r.d),[30,30,20]);
  assert.equal(ctx.zpDdxTurnsJL(series).length,0);
});
test('main chart DDX markers use the exact confirmed extreme candle and existing icon preference',()=>{
  const x=sample(Array(30).fill(0));
  function E(type,attrs={},text){return {type,attrs,text,children:[],appendChild(n){this.children.push(n);}};}
  const ch=E('svg');ch.style={};ch.querySelector=()=>null;
  const c={...ctx,$:()=>ch,mode:'ddx',localStorage:{getItem:()=>null},FF:{sym:'sh600105',rows:x.rows,d:'20261118'},LIVE:{sym:'sh600105',pts:x.pts,sessDate:'20261118'},window:{},E,X0:()=>0,X1:()=>100,PY0:0,PH:200,YRES:20,Y:p=>p};
  c.zpDdxCalcJL=()=>[0,3,4,4,3.8,4,1,0,1].map((v,i)=>({hm:String(1000+i),v,n:20}));
  vm.createContext(c);const start=html.indexOf('  function ddxMarks(P)');vm.runInContext(html.slice(start,html.indexOf('  function ptsNow()',start)),c);
  const points=Array.from({length:9},(_,i)=>({hm:String(1000+i),x:10+i*10,p:40,h:50+i,l:30+i}));
  c.ddxMarks(points);const triangles=ch.children[0].children.filter(n=>n.type==='path');
  assert.equal(triangles.length,1);assert.equal(triangles[0].attrs.d,'M57.8,46.3 L62.2,46.3 L60,50 Z');
  assert.equal(ch.children[0].children.some(n=>n.type==='circle'),false);
  c.localStorage.getItem=()=> '0';ch.children=[];c.ddxMarks(points);assert.equal(ch.children.length,0);
});
test('DDX pane renders one data curve plus a horizontal mean and independent net-amount bars, correct units and reversible alert coordinates',()=>{
  function E(type,attrs={},text){return {type,attrs,text,children:[],appendChild(n){this.children.push(n);},setAttribute(k,v){this.attrs[k]=v;}};}
  const x=sample(Array.from({length:25},(_,i)=>i%2?-20:100)),s=E('svg');
  const c={...ctx,fundingLagJL:()=>0,pSvg:s,loadFF(){},legend(){},FF:{sym:'sh600105',rows:x.rows,d:'20261118'},LIVE:{sym:'sh600105',pts:x.pts,sessDate:'20261118'},window:{},D:{},E,PH2:104,TXT:'#fff',UP:'red',DN:'green',X0:()=>0,X1:()=>360,xOfHmJL:h=>(+h-930)*10,barW:()=>1,fM:v=>v+'元',fundingStatusJL:()=> '东财 09:54',ddxLines:()=>[5]};
  vm.createContext(c);const start=html.indexOf('  function ddxZoomOf()');vm.runInContext(html.slice(start,html.indexOf('  /* ── jl-zpmix',start)),c);c.drawDdx([]);
  const curves=s.children.filter(n=>n.attrs['data-series']==='ratio20');assert.equal(curves.length,1);
  assert.equal(curves[0].children.length,5);assert.ok(curves[0].children.every(n=>['red','green'].includes(n.attrs.stroke)));   // 11-19: 预热不画; 11-19 f9da538 起涨跌改用 UP/DN
  assert.equal(s.children.some(n=>n.type==='polyline'),false);
  const bars=s.children.find(n=>n.attrs['data-series']==='main-net');assert.equal(bars.children.length,25);
  const ref=s.children.find(n=>n.attrs['data-series']==='ma10');assert.ok(ref && /^M/.test(ref.attrs.d));   // 11-19: MA10 跟着走
  const snap=c.D.pane.snaps(24);assert.equal(snap.length,1);assert.equal(snap[0][0],'净额比20');assert.ok(Math.abs(c.D.pane.vy(snap[0][2])-4)<1e-9);
  assert.ok(c.D.pane.lg(24).some(x=>/MA10 /.test(x[0])));   // 11-23 用户「删掉没用的」: 图内MA10字删了, 只在图例
  assert.ok(s.children.some(n=>n.type==='title' && /自算/.test(n.text)));   // 11-23 用户「删掉没用的」: 图例不再写「自算」, 说明挪到 title
  assert.ok(c.D.pane.lg(24).some(x=>x[0].includes('净额')));
  assert.deepEqual(s.children.filter(n=>n.type==='text' && /%$/.test(n.text) && !n.attrs['data-ddx-line'] && !/MA10/.test(n.text)).map(n=>n.text),['+10%','0%','-10%']);
});
