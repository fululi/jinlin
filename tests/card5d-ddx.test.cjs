const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const five=fs.readFileSync(path.join(__dirname,'../jl_card5d.js'),'utf8');
const zp=fs.readFileSync(path.join(__dirname,'../jl_zp_war.html'),'utf8');
const c=vm.createContext({});
vm.runInContext(five.slice(five.indexOf('  function card5DdxCalcJL'),five.indexOf('  function tool(')),c);
vm.runInContext(zp.slice(zp.indexOf('function zpDdxCalcJL'),zp.indexOf('/* DDX副图与主图')),c);
const plain=x=>JSON.parse(JSON.stringify(x));
function sample(n){let ca=0,main=0;const data=[],rows=[];for(let i=0;i<n;i++){const hm=String(930+i).padStart(4,'0');ca+=1000;main+=i%2?-20:100;data.push(hm+' 20 100 '+ca);rows.push({hm,main});}return {data,rows};}
test('DDX and MA10 match the existing war-screen calculation, including warmup and gaps',()=>{
 const x=sample(28),pts=c.card5DdxAmounts([{date:'20261118',data:x.data}])['20261118'];
 for(const rows of [x.rows,x.rows.filter((_,i)=>i!==5),x.rows.slice(3)]){
  assert.deepEqual(plain(c.card5DdxCalcJL(rows,pts)),plain(c.zpDdxCalcJL(rows,pts)));
 }
 const r=c.card5DdxCalcJL(x.rows,pts);assert.equal(r[19].v,4);assert.equal(r[9].ma!=null,true);assert.equal(r[0].n,1);
});
test('real cumulative amounts are differenced per day without changing source rows',()=>{
 const x=sample(3),raw=[{date:'20261118',data:x.data},{date:'20261119',data:['0930 20 1 50','0931 20 2 80']}],before=JSON.stringify(raw);
 const r=plain(c.card5DdxAmounts(raw));assert.deepEqual(r['20261118'].map(p=>p.a),[1000,1000,1000]);assert.deepEqual(r['20261119'].map(p=>p.a),[50,30]);assert.equal(JSON.stringify(raw),before);
});
test('missing amounts, missing minutes, late starts and counter rollback remain unavailable',()=>{
 const rows=['0930 20 1 100','0931 20 2','0932 20 3 300','0933 20 4 400','0935 20 5 600','0936 20 6 10'];
 assert.deepEqual(plain(c.card5DdxAmounts([{date:'x',data:rows}])).x.map(p=>p.a),[100,null,null,100,null,null]);
 assert.equal(c.card5DdxAmounts([{date:'x',data:['1000 20 1 9999']}]).x[0].a,null);
});
function updater(){
 const pending=[],L={date:'20261118'},D={ticket:0,key:'',rows:[],series:[],at:0,busy:false,message:''};
 const ctx=vm.createContext({ddxOn:true,S:{code:'sh600105',days:[L],ddxPts:{}},DD:D,EMUT:'',Date,Number,Error,
  ddxReset(){ctx.DD={...D,ticket:ctx.DD.ticket+1};},ddxPrepare(){ctx.DD.prepared=true;},ddxDraw(){},emSec:()=> '1.600105',emJP:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 const a=five.indexOf('    async function ddxUpdate()'),b=five.indexOf('    function ddxDraw()',a);vm.runInContext(five.slice(a,b),ctx);return {ctx,pending};
}
const flow=(date,value)=>({data:{klines:[date+' 09:30,'+value+',0,0,0,0']}});
test('DDX rejects superseded same-stock responses and releases only its own busy state',async()=>{
 const {ctx,pending}=updater(),a=ctx.ddxUpdate();ctx.ddxReset();ctx.DD.key='';const b=ctx.ddxUpdate();
 pending[0].resolve(flow('2026-11-18',10));await a;assert.equal(ctx.DD.busy,true);assert.equal(ctx.DD.rows.length,0);
 pending[1].resolve(flow('2026-11-18',20));await b;assert.equal(ctx.DD.rows[0].main,20);assert.equal(ctx.DD.busy,false);
});
test('DDX mismatched dates try the backup, then leave an explicit empty pane',async()=>{
 const {ctx,pending}=updater(),p=ctx.ddxUpdate();pending[0].resolve(flow('2026-11-19',10));await new Promise(r=>setImmediate(r));
 pending[1].resolve(flow('2026-11-19',20));await p;assert.equal(ctx.DD.rows.length,0);assert.match(ctx.DD.message,/日期/);assert.equal(ctx.DD.busy,false);
});
test('DDX repeated updates within the refresh window share one request',async()=>{
 const {ctx,pending}=updater(),p=ctx.ddxUpdate();await ctx.ddxUpdate();assert.equal(pending.length,1);
 pending[0].resolve(flow('2026-11-18',10));await p;await ctx.ddxUpdate();assert.equal(pending.length,1);assert.equal(ctx.DD.prepared,true);
});
