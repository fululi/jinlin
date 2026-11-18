const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const five=fs.readFileSync(path.join(__dirname,'../jl_card5d.js'),'utf8');
function loader(){
 const pending=[],els={info:{},base:{},ov:{}};
 const c=vm.createContext({code:'600105',loadTicket:0,loading:false,retryAt:0,S:null,view:{a:0,b:0},FIB:[],Date,Number,Map,
  pf:c=>'sh'+c,TX:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),em5:async()=>{throw Error('offline');},
  idx:t=>Number(t),autoCalc:()=>null,bollGet:()=>{},fibLoad:()=>{},fibRemap:()=>{},head:()=>{},size:()=>{},drawBase:()=>{},drawOv:()=>{},seqRender:()=>{},$:k=>els[k]});
 const start=five.indexOf('    async function load(keep)'),end=five.indexOf('\n    function head()',start);
 vm.runInContext(five.slice(start,end),c);
 return {c,pending,els};
}
const day=(price=10,date='20261118')=>({date,prec:'9',data:['0930 '+price+' 100 100000','0931 '+price+' 200 200000']});
const payload=(code,days)=>({data:{['sh'+code]:{data:days}}});
test('five-day late response cannot overwrite a newly selected stock',async()=>{
 const {c,pending}=loader();const a=c.load();
 c.code='600176';c.loadTicket++;c.loading=false;const b=c.load();
 pending[1].resolve(payload('600176',[day(20)]));await b;
 pending[0].resolve(payload('600105',[day(10)]));await a;
 assert.equal(c.S.code,'sh600176');assert.equal(c.S.P[0].p,20);assert.equal(c.loading,false);
});
test('A-B-A selection rejects first A even though stock code matches again',async()=>{
 const {c,pending}=loader();const old=c.load();
 c.code='600176';c.loadTicket++;c.loading=false;const b=c.load();
 c.code='600105';c.loadTicket++;c.loading=false;const fresh=c.load();
 pending[2].resolve(payload('600105',[day(30)]));await fresh;
 pending[0].resolve(payload('600105',[day(10)]));await old;
 pending[1].resolve(payload('600176',[day(20)]));await b;
 assert.equal(c.S.P[0].p,30);
});
test('five-day polling cannot overlap; failure releases lock and preserves prior valid chart',async()=>{
 const {c,pending}=loader();const a=c.load();await c.load(true);assert.equal(pending.length,1);
 pending[0].resolve(payload('600105',[day()]));await a;const good=c.S;
 const b=c.load(true);pending[1].reject(Error('offline'));await b;
 assert.equal(c.S,good);assert.equal(c.loading,false);assert.ok(c.retryAt>Date.now());
});
test('data prep stays as originally: only >1500 dropped, 09:25 auction and lunch-hour points kept, source order kept',async()=>{
 const {c,pending}=loader();const a=c.load();
 const d=day();d.data=['1501 88 2 2','0925 88 2 2','0930 10 100 100000','1200 11 200 240000'];
 pending[0].resolve(payload('600105',[d]));await a;
 assert.equal(c.S.days.length,1);assert.equal(c.S.P.map(p=>p.t).join(','),'0925,0930,1200');assert.ok(c.S.P.every(p=>p.di===0));
});
test('no valid prices results in an explicit retryable failure, not empty chart state',async()=>{
 const {c,pending,els}=loader();const a=c.load();pending[0].resolve(payload('600105',[{date:'20261118',prec:9,data:[]}]));await a;
 assert.equal(c.S,null);assert.equal(c.loading,false);assert.match(els.info.textContent,/有效交易时段/);
});
test('internal scrolling invalidates cached pointer coordinates in capture phase',()=>{
 let listener,options;const start=five.indexOf('    addEventListener("scroll"'),end=five.indexOf('\n',start);
 const c=vm.createContext({BR:{top:100},addEventListener:(type,fn,opt)=>{listener=fn;options=opt;}});
 vm.runInContext(five.slice(start,end),c);assert.equal(options.capture,true);listener();assert.equal(c.BR,null);
});
test('intraday atomic update redraws once and updates yesterday close and quote together',()=>{
 let draws=0;const c=vm.createContext({o:{preClose:10},prices:[],avgs:[],times:[],align:()=>{},draw:()=>++draws});
 const start=html.indexOf('setSeries: function (p, a, t, context)'),end=html.indexOf('\n        push:',start);
 vm.runInContext('var api={'+html.slice(start,end)+'};',c);
 c.api.setSeries([20,21],[20,20.5],['09:30','09:31'],{preClose:19,openQ:{text:'new'}});
 assert.equal(draws,1);assert.equal(c.o.preClose,19);assert.equal(c.o._oqData.text,'new');assert.equal(c.prices[1],21);
});
test('card replacement releases overlays and subscriptions before losing the old instance',()=>{
 const calls=[],old={};for(const k of ['cross','regr','tools'])old[k]={destroy:()=>calls.push(k)};
 old.inst={setVisible:v=>calls.push(v)};const c=vm.createContext({_cardTrendJL:{'600105':old}});
 const start=html.indexOf('  function disposeCardTrendJL('),end=html.indexOf('\n  function renderCardTrendJL',start);
 vm.runInContext(html.slice(start,end),c);c.disposeCardTrendJL('600105');
 assert.deepEqual(calls,['cross','regr','tools',false]);assert.equal(c._cardTrendJL['600105'],undefined);
});
test('retired card-only displays are removed while shared price-band calculations remain',()=>{
 assert.ok(!html.includes('JLCardSubJL'));assert.ok(!html.includes('posRulerHTMLJL'));
 assert.ok(html.includes('function posRulerJL(s)'));assert.ok(html.includes('function legFibJL'));
 new vm.Script(five);
});

test('five-day retains native 3x resolution and its published revision matches the shell annotation',()=>{
 const dpr=five.match(/dpr = (Math\.(?:min|max)\(2, devicePixelRatio \|\| 1\))/)[1];
 assert.equal(vm.runInNewContext(dpr,{devicePixelRatio:3}),3);
 const version=html.match(/jl_card5d\.js\?v=(\d+)/)[1];
 const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 assert.ok(sw.includes('当前五日图 jl_card5d.js?v='+version+'：'));
 assert.ok(!html.includes('jlcardsub'));assert.ok(!html.includes('subOn'));
});
