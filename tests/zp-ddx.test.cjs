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
  const r=ctx.zpDdxCalcJL(x.rows,x.pts);assert.equal(r[1].v,null);assert.equal(r[2].v,null);assert.equal(r[2].ca,null);
  assert.equal(ctx.zpDdxCalcJL([{hm:'0930',main:10}],[{hm:'0930',a:0}])[0].v,null);
});
test('missing flow minutes do not become one-minute flow; late first cumulative value is rejected',()=>{
  const x=sample([10,20,30,40]);x.rows.splice(1,1);
  const r=ctx.zpDdxCalcJL(x.rows,x.pts);assert.equal(r[1].d,null);assert.equal(r[1].v,null);
  assert.equal(ctx.zpDdxCalcJL([{hm:'1000',main:999}],[{hm:'1000',a:1000}])[0].v,null);
});
test('DDX extrema keep their exact minute, confirm on reversal, reset at missing values',()=>{
  const rows=[1,3,3,2,1,2,null,7,6].map((v,i)=>({hm:String(930+i).padStart(4,'0'),v,n:i+1}));
  const t=ctx.zpDdxTurnsJL(rows);
  assert.deepEqual(JSON.parse(JSON.stringify(t)),[
    {hm:'0932',v:3,h:true,n:3,confirmedHm:'0933'},
    {hm:'0934',v:1,h:false,n:5,confirmedHm:'0935'}
  ]);
});
test('5-minute main markers and the pane use the same last-minute samples, without hidden intrabar extrema',()=>{
  const rows=[1,9,1,5,4,2,3,6].map((v,i)=>({hm:String(930+i).padStart(4,'0'),v,d:10,n:i+1}));
  const series=ctx.zpDdxSeriesJL(rows,h=>'20261118'+(h<'0933'?'0935':h<'0936'?'0940':'0945'));
  assert.deepEqual(Array.from(series,r=>r.v),[1,2,6]);
  assert.deepEqual(Array.from(series,r=>r.d),[30,30,20]);
  assert.equal(ctx.zpDdxTurnsJL(series).length,0);
});
test('main chart DDX markers use the exact matching candle and existing icon preference',()=>{
  const x=sample([10,30,-40,40,-60]);x.pts.forEach(p=>p.a=100);
  function E(type,attrs={},text){return {type,attrs,text,children:[],appendChild(n){this.children.push(n);}};}
  const ch=E('svg');ch.style={};ch.querySelector=()=>null;
  const c={...ctx,$:()=>ch,mode:'ddx',localStorage:{getItem:()=>null},FF:{rows:x.rows,d:'20261118'},LIVE:{pts:x.pts,sessDate:'20261118'},window:{},E,X0:()=>0,X1:()=>100,PY0:0,PH:200,YRES:20,Y:p=>p};
  vm.createContext(c);const start=html.indexOf('  function ddxMarks(P)');vm.runInContext(html.slice(start,html.indexOf('  function ptsNow()',start)),c);
  const points=x.pts.map((p,i)=>({hm:p.hm,x:10+i*10,p:40,h:50+i,l:30+i}));
  c.ddxMarks(points);const circles=ch.children[0].children.filter(n=>n.type==='circle');
  assert.deepEqual(circles.map(n=>n.attrs.cx),[20,30,40]);
  assert.deepEqual(circles.map(n=>n.attrs.cy),[44,39,46]);
  c.localStorage.getItem=()=> '0';ch.children=[];c.ddxMarks(points);assert.equal(ch.children.length,0);
});
