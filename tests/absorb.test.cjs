const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../jl_absorb.js');
const source=fs.readFileSync(path.join(__dirname,'../jl_absorb.js'),'utf8');
const ks=fs.readFileSync(path.join(__dirname,'../ks.html'),'utf8');
function fixture(n=150){const b=[],f=[];for(let i=0;i<n;i++){const d=new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),c=10+Math.sin(i*Math.PI/10)*.12;b.push({d,o:c-.01,c,h:c+.03,l:c-.03,v:i%20===1?200:100});f.push({d,mainPct:1});}return {b,f};}
function browser(){const saved={},events=[];const c={Date,Promise,AbortController,console,setTimeout,clearTimeout,document:{},localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v},CustomEvent:function(type){this.type=type;}};c.window=c;c.dispatchEvent=e=>events.push(e.type);vm.createContext(c);vm.runInContext(source,c);return {c,A:c.JLAbsorb,saved,events};}
test('blank funding stays missing; official zero and negative percentages are preserved',()=>{
 const {b}=fixture(6);const f=b.map(x=>({d:x.d,mainPct:''}));let r=A.compute(b,f);assert.equal(r.last.flow5,null);assert.equal(r.state,'资金暂缺');
 f.forEach(x=>x.mainPct=0);r=A.compute(b,f);assert.equal(r.last.pct,0);assert.equal(r.last.flow5,0);assert.equal(r.last.estimated,false);
 f[5].mainPct=-2;assert.equal(A.compute(b,f).last.flow5,-2);
});
test('F-EXP2 uses hands times 100 and OHLC mean; actual turnover wins and estimates are marked',()=>{
 const {b}=fixture(6);const f=b.map(x=>({d:x.d,main:100}));let r=A.compute(b,f);assert.equal(r.last.pct,100/(b[5].v*100*(b[5].o+b[5].c+b[5].h+b[5].l)/4)*100);assert.equal(r.last.estimated,true);
 b[5].a=50000;assert.equal(A.compute(b,f).last.pct,.2);f[5].mainPct=2;assert.equal(A.compute(b,f).last.pct,2);assert.equal(A.compute(b,f).last.estimated,false);
});
test('daily flows align by date, never by input position; missing one of five does not turn into zero',()=>{
 const {b,f}=fixture(80);const shuffled=f.slice().reverse();assert.equal(A.compute(b,shuffled).last.flow5,5);shuffled.splice(2,1);assert.equal(A.compute(b,shuffled).last.flow5,null);
});
test('array layouts normalize Tencent and K-STATION identically; malformed bars are excluded',()=>{
 assert.deepEqual(A.bars([['2026-01-02',10,11,12,9,100]]),A.bars([['2026-01-02',10,12,9,11,100]],'ks'));
 assert.equal(A.bars([['2026-01-02',10,11,9,12,100]]).length,0);
});
test('absorption reuses cross/MA/MACD/volume/FILTER15; signals need 60 bars and five complete funding days',()=>{
 const {b,f}=fixture();let r=A.compute(b,f);assert.deepEqual(r.trades.map(t=>t.signal),[61,81,101,121,141]);assert.ok(r.rows.slice(0,60).every(x=>!x.signal));
 assert.ok(A.compute(b,f.map(x=>({...x,mainPct:-1}))).rows.every(x=>!x.signal));
 assert.ok(A.compute(b.map(x=>({...x,v:100})),f).rows.every(x=>!x.signal));
});
test('prefix calculations are causal: future rows cannot change accepted signals, MA or funding',()=>{
 const {b,f}=fixture(),full=A.compute(b,f);for(const n of [61,62,64,80,102]){const p=A.compute(b.slice(0,n),f.slice(0,n));p.rows.forEach((x,i)=>{for(const k of ['signal','m20','flow5','dif','dea'])assert.equal(x[k],full.rows[i][k]);});}
});
test('entry and E7 exit triangles wait for the next real trading-day open',()=>{
 const {b,f}=fixture(68);for(let i=63;i<b.length;i++){b[i]={...b[i],o:9,c:9,h:9.1,l:8.9};f[i].mainPct=-10;}
 let r=A.compute(b.slice(0,62),f);assert.equal(r.trades[0].entry,null);assert.equal(r.rows[61].entry.length,0);
 r=A.compute(b.slice(0,64),f);assert.equal(r.trades[0].entry,62);assert.equal(r.trades[0].exitSignal,63);assert.equal(r.trades[0].exit,null);assert.equal(r.rows[63].exit.length,0);
 r=A.compute(b,f);assert.equal(r.trades[0].exit,64);assert.equal(r.rows[64].o,9);assert.equal(r.rows[64].exit[0].signal,63);
});
test('E7 requires both weaknesses; missing funding never triggers an E7 exit',()=>{
 const {b,f}=fixture(72);for(let i=63;i<b.length;i++)b[i]={...b[i],o:9,c:9,h:9.1,l:8.9};let r=A.compute(b,f);assert.equal(r.trades[0].exitSignal,null);
 for(let i=63;i<f.length;i++)f[i].mainPct=null;r=A.compute(b,f);assert.equal(r.trades[0].exitSignal,null);
});
test('20-day tracking expiry uses day-20 close, and does not invent a day-21 open exit',()=>{
 const {b,f}=fixture(84),r=A.compute(b,f),t=r.trades[0];assert.equal(t.entry,62);assert.equal(t.expiry,81);assert.equal(t.exit,81);assert.equal(t.exitSignal,null);assert.equal(r.rows[81].exit[0].at,'close');assert.equal(r.rows[81].exit[0].price,b[81].c);assert.equal(r.rows[82].exit.length,0);
});
test('signals confirm at China 15:05, independent of host time zone; future candles are excluded',()=>{
 const {b,f}=fixture(62);const d=b[61].d;let r=A.compute(b,f,{now:Date.parse(d+'T15:04:59+08:00')});assert.equal(r.last.d,b[60].d);assert.equal(r.rows[61].signal,false);
 r=A.compute(b,f,{now:Date.parse(d+'T15:05:00+08:00')});assert.equal(r.rows[61].signal,true);assert.equal(A.eventOf(r).kind,'吸筹候选');
 assert.equal(A.compute(b,f,{now:Date.parse(b[58].d+'T16:00:00+08:00')}).rows.length,59);
 assert.equal(A.closed('2026-11-21',Date.parse('2026-11-21T16:00:00+08:00')),false);
});
test('stock favorites share canonical symbols, preserve other groups, and survive malformed storage',()=>{
 const x=browser();assert.equal(x.A.toggleFavorite('600105','永鼎股份'),true);assert.equal(x.A.isFavorite('sh600105'),true);assert.equal(JSON.parse(x.saved.jl_stock_favorites_v1)[0].code,'sh600105');assert.equal(x.A.toggleFavorite('sh600105','永鼎'),false);assert.equal(x.events.length,2);assert.equal(x.A.toggleFavorite('undefined','bad'),false);
 x.saved.jl_stock_favorites_v1='{}';assert.equal(x.A.favorites().length,0);assert.equal(x.saved.jinlin_stocks_v2,undefined);
});
function exporter(){const els={},saved={};function el(){return {style:{},attrs:{},children:[],classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},appendChild(x){this.children.push(x);if(x.id)els[x.id]=x;},insertBefore(x,b){this.children=this.children.filter(v=>v!==x);this.children.splice(this.children.indexOf(b),0,x);},querySelector(sel){return this.children.find(x=>Object.hasOwn(x.attrs,sel.slice(1,-1)));}};}const c={window:{},FFEXP_VERSION:'test',FFEXP:{panelHidden:false,loaded:true,task:{status:'running',jobs:[1],day:'today'},rows:{a:{ff:['x']}}},document:{getElementById:k=>els[k],createElement:el,body:el()},sessionStorage:{setItem:(k,v)=>saved[k]=v},ffDayJL:()=> 'today',ffSaveJL(){},ffNewJL(){},ffBatchJL(){throw Error('should not restart task');}};vm.createContext(c);
 vm.runInContext(ks.slice(ks.indexOf('function ffBtnJL'),ks.indexOf('function ffSaveJL')),c);
 vm.runInContext(ks.slice(ks.indexOf('function ffNoticeJL'),ks.indexOf('function ffFilesJL')),c);return {c,els,saved};}
test('CSV hide survives progress updates; the chip can reopen it without stopping or restarting a task',()=>{
 const x=exporter();x.c.ffRenderJL();let p=x.els.ffProgressJL;assert.equal(p.hidden,false);p.children.find(x=>x.textContent==='收起 ×').onclick();assert.equal(p.hidden,true);assert.equal(x.saved.ks_ff_panel_hidden_v1,'1');x.c.ffRenderJL('next batch');assert.equal(p.hidden,true);assert.equal(p.querySelector('[data-ff-status]').textContent,'next batch');
 x.els.ffToggleJL.onclick();assert.equal(p.hidden,false);x.c.ffHideJL(true);x.c.ffOpenJL();assert.equal(p.hidden,false);assert.equal(x.c.FFEXP.task.status,'running');
 assert.match(p.style.cssText,/top:min\(118px,20vh\);bottom:auto/);
});
test('DDX export action dispatches before other canvas actions and reserves legend space',()=>{
 let opened=0;const c={ffOpenJL:()=>opened++};const a=ks.indexOf('function rollerDo(id)'),b=ks.indexOf('\nfunction ',a+10);vm.runInNewContext(ks.slice(a,b),c);assert.equal(c.rollerDo('ff:ddx'),true);assert.equal(opened,1);assert.match(ks,/indexOf\("DDX"\) === 0\) xMax -= 68/);
});
function networkBrowser(b,f){const x=browser(),c=x.c;let requests=0;
 c.fetch=async(url)=>{requests++;assert.match(url,/gtimg|qq\.com/);assert.doesNotMatch(url,/callback=/);return {ok:true,json:async()=>({data:{sh600105:{qfqday:b.map(r=>[r.d,r.o,r.c,r.h,r.l,r.v])}}})};};
 c.document.createElement=()=>({remove(){}});c.document.head={appendChild(s){const url=new URL(s.src),cb=url.searchParams.get('cb');queueMicrotask(()=>c[cb]({data:{klines:f.map(r=>[r.d,100,0,0,0,0,url.pathname.includes('daykline')?r.mainPct:''].join(','))}}));}};
 return {...x,requests:()=>requests};}
test('Tencent loader uses JSON fetch; concurrent callers retain newly arrived bars/funds and prefer official pct',async()=>{
 const {b,f}=fixture(100),x=networkBrowser(b,f);const first=x.A.load('600105');const newer={...b[99],d:'2025-04-11'};const second=x.A.load('sh600105',{bars:[newer],funds:[{d:b[99].d,mainPct:99,estimated:true}]});await first;const data=await second;assert.equal(x.requests(),1);assert.equal(data.bars.at(-1).d,newer.d);assert.equal(data.funds.at(-1).mainPct,1);assert.equal(data.funds.at(-1).estimated,false);
 const changed={...newer,c:newer.c+.001,h:newer.h+.001};const cached=await x.A.load('600105',{bars:[changed]});assert.equal(cached.bars.at(-1).c,changed.c);assert.equal(x.requests(),1);
});
test('close reminders wait for same-day confirmed funding and deduplicate across reloaded contexts',async()=>{
 const {b,f}=fixture(62),end=Date.parse('2026-11-19T00:00:00Z');for(let i=0;i<b.length;i++){b[i].d=new Date(end-(b.length-1-i)*86400000).toISOString().slice(0,10);f[i].d=b[i].d;}
 const x=networkBrowser(b,f),list=[{code:'600105',name:'永鼎'}],alerts=[],now=Date.parse('2026-11-19T15:05:00+08:00');x.c.Date=class extends Date {static now(){return now;}};let r=await x.A.checkClose(list,a=>alerts.push(a),Date.parse('2026-11-19T15:04:59+08:00'));assert.equal(r.length,0);assert.equal(x.requests(),0);
 r=await x.A.checkClose(list,a=>alerts.push(a),Date.parse('2026-11-19T15:05:00+08:00'));assert.equal(r.length,1);assert.equal(r[0].kind,'吸筹候选');assert.equal(alerts.length,1);
 assert.equal((await x.A.checkClose(list,a=>alerts.push(a),Date.parse('2026-11-19T16:00:00+08:00'))).length,0);
 const reload=networkBrowser(b,f);reload.c.Date=x.c.Date;Object.assign(reload.saved,x.saved);assert.equal((await reload.A.checkClose(list,a=>alerts.push(a),Date.parse('2026-11-19T16:00:00+08:00'))).length,0);assert.equal(alerts.length,1);
});
test('close alerts reject intraday cache after a funding or price fetch failure, then recover after a full close refresh',async()=>{
 const {b,f}=fixture(62),end=Date.parse('2026-11-19T00:00:00Z');for(let i=0;i<b.length;i++){b[i].d=new Date(end-(b.length-1-i)*86400000).toISOString().slice(0,10);f[i].d=b[i].d;}
 const x=networkBrowser(b,f),alerts=[],list=[{code:'600105',name:'永鼎'}];let now=Date.parse('2026-11-19T14:59:00+08:00');x.c.Date=class extends Date {static now(){return now;}};await x.A.load('600105');
 const head=x.c.document.head;x.c.document.head={appendChild(s){queueMicrotask(()=>s.onerror());}};now=Date.parse('2026-11-19T15:05:00+08:00');assert.equal((await x.A.checkClose(list,a=>alerts.push(a),now)).length,0);assert.equal(alerts.length,0);
 x.c.document.head=head;const todayFund=f.pop();assert.equal((await x.A.checkClose(list,a=>alerts.push(a),now)).length,0);assert.equal(alerts.length,0);f.push(todayFund);
 const y=networkBrowser(b,f);y.c.Date=x.c.Date;now=Date.parse('2026-11-19T14:59:00+08:00');await y.A.load('600105');const fetch=y.c.fetch;y.c.fetch=async()=>{throw Error('offline price feed');};now=Date.parse('2026-11-19T15:05:00+08:00');assert.equal((await y.A.checkClose(list,a=>alerts.push(a),now)).length,0);assert.equal(alerts.length,0);
 y.c.fetch=fetch;assert.equal((await y.A.checkClose(list,a=>alerts.push(a),now)).length,1);assert.equal(alerts.length,1);assert.equal(alerts[0].kind,'吸筹候选');
});
test('home favorites render one stock per row, open its own chart, and cap parallel loads at two',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf('  function renderAbsorbFavoritesJL()'),end=html.indexOf('  window.addEventListener(\'jlabsorb:favorites\'',start);
 function el(){return {children:[],style:{},isConnected:true,appendChild(x){this.children.push(x);},append(...a){this.children.push(...a);},replaceChildren(){this.children=[];}};}
 const host=el(),pending=[];let active=0,max=0,destroyed=0,opened='';const c={absorbFavoriteViewJL:{destroy(){destroyed++;}},absorbFavoriteRequestJL:0,watchMode:'favorites',window:{JLAbsorb:true},document:{createElement:el},$:()=>host,localStorage:{getItem:()=>null},dailyBarsOf:()=>[],JLAbsorb:{css(){},favorites:()=>[{code:'sh600105',name:'永鼎'},{code:'sz000001',name:'平安'},{code:'sh600000',name:'浦发'}],lamps:()=>'<span>资／线</span>',result:()=>null,load(){active++;max=Math.max(max,active);return new Promise(r=>pending.push(()=>{active--;r();}));},mount:(chart)=>({host:chart,show:(code)=>opened=code})}};vm.createContext(c);vm.runInContext(html.slice(start,end),c);c.renderAbsorbFavoritesJL();assert.equal(destroyed,1);assert.equal(max,2);assert.equal(host.children.filter(x=>x.className==='jlAbsRow').length,3);host.children[1].onclick();assert.equal(opened,'sh600105');assert.equal(c.absorbFavoriteViewJL.host.hidden,false);while(pending.length){pending.shift()();await new Promise(r=>setImmediate(r));}assert.equal(max,2);
});
test('home market observation follows the selected index and closes without changing its period',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf("  (function(){\n    const tools=document.querySelector('.homeToolsJL')"),end=html.indexOf('  window.jlDailyBarsJL',start);let button,panel,interval,shown=[];
 const tools={appendChild:b=>button=b},wrap={parentNode:{insertBefore:p=>panel=p},nextSibling:null};const c={index:'sh000001',absorbHomeCodeJL:'',absorbHomeViewJL:null,window:{JLAbsorb:true},setInterval:fn=>interval=fn,byCode:c=>({name:c}),dailyBarsOf:()=>[],document:{querySelector:s=>s.includes('homeTools')?tools:wrap,createElement:()=>({setAttribute(){},classList:{add(){},remove(){}},hidden:false})},JLAbsorb:{mount:(host,opts)=>{host.close=opts.onClose;return {show:code=>shown.push(code)};}}};vm.runInNewContext(html.slice(start,end),c);button.onclick();assert.equal(panel.hidden,false);assert.deepEqual(shown,['sh000001']);c.index='sz399006';interval();assert.deepEqual(shown,['sh000001','sz399006']);panel.close();assert.equal(panel.hidden,true);assert.equal(c.index,'sz399006');
});

function sectorGroups(){
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf('  window.jlSecAddStockJL = function'),end=html.indexOf('  window.ydBubbleTapJL',start);
 const listeners=new Set(),favorites=new Set(),messages=[],counts={persist:0,deck:0,watch:0};let toggles=0;
 const doc={activeElement:null,createElement(){return {style:{},dataset:{},children:[],isConnected:true,setAttribute(k,v){this[k]=v;},appendChild(el){el.parent=this;this.children.push(el);},remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},focus(){doc.activeElement=this;}};},getElementById(id){return doc.body.children.find(x=>x.id===id)||null;},addEventListener(type,fn){assert.equal(type,'keydown');listeners.add(fn);},removeEventListener(type,fn){assert.equal(type,'keydown');listeners.delete(fn);}};
 doc.body=doc.createElement('body');const trigger=doc.createElement('button');trigger.focus();
 const c={stocks:[],document:doc,toast:x=>messages.push(x),persistStocks:()=>counts.persist++,renderDeck:()=>counts.deck++,renderWatch:()=>counts.watch++,JLAbsorb:{isFavorite:code=>favorites.has(code),toggleFavorite(code){toggles++;if(favorites.has(code)){favorites.delete(code);return false;}favorites.add(code);return true;}}};c.window=c;vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 return {c,doc,trigger,listeners,favorites,messages,counts,toggles:()=>toggles,panel:()=>doc.getElementById('secStockGroupJL'),buttons:()=>doc.getElementById('secStockGroupJL').children[0].children.slice(1)};
}
test('sector favorite addition is idempotent and independent of watch/hold records',()=>{
 const x=sectorGroups();x.c.stocks.push({code:'600105',qty:100,cost:8.5,watch:1});const before=JSON.stringify(x.c.stocks);
 x.c.jlSecAddStockJL('sh600105','永鼎',9,'favorite');x.c.jlSecAddStockJL('600105','永鼎',9,'favorite');assert.equal(x.toggles(),1);assert.ok(x.favorites.has('600105'));assert.equal(JSON.stringify(x.c.stocks),before);assert.equal(x.counts.persist,0);
 x.c.jlSecAddStockJL('bad','bad',9,'hold');x.c.jlSecAddStockJL('600105','永鼎',9,'bogus');assert.equal(JSON.stringify(x.c.stocks),before);assert.equal(x.counts.persist,0);
});
test('sector watch/hold transitions preserve real quantity and cost; pending holdings join close monitoring',()=>{
 const x=sectorGroups();x.c.jlSecAddStockJL('sz000001','平安',10,'watch');let stock=x.c.stocks[0];assert.equal(stock.watch,1);assert.equal(stock.qty,0);assert.equal(stock.absorbWatch,0);
 x.c.jlSecAddStockJL('000001','平安',11,'hold');assert.equal(stock.watch,0);assert.equal(stock.qty,0);assert.equal(stock.cost,null);assert.equal(stock.absorbWatch,1);assert.equal(stock.base,10);
 x.c.jlSecAddStockJL('000001','平安',11,'watch');assert.equal(stock.watch,1);assert.equal(stock.absorbWatch,0);
 stock.qty=500;stock.cost=9;x.c.jlSecAddStockJL('000001','平安',11,'hold');assert.equal(stock.qty,500);assert.equal(stock.cost,9);
 x.c.jlSecAddStockJL('600105','永鼎',9,'hold');stock=x.c.stocks[1];assert.equal(stock.qty,0);assert.equal(stock.absorbWatch,1);assert.equal(stock.watch,0);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.match(html,/stocks\.filter\(s=>s\.qty>0\|\|s\.absorbWatch===1\)/);
});
test('sector group chooser dispatches exact groups, keeps names as text, and releases handlers on every close',()=>{
 const x=sectorGroups(),calls=[];x.c.jlSecAddStockJL=(...args)=>calls.push(args);
 for(const mode of ['watch','favorite','hold']){x.c.jlSecChooseStockJL('sh600105','<img onerror=bad>',9);assert.equal(x.listeners.size,1);const panel=x.panel();assert.equal(panel.children[0].children[0].textContent,'<img onerror=bad> · 加入分组');x.buttons().find(b=>b.dataset.stockGroup===mode).onclick({stopPropagation(){}});assert.equal(x.panel(),null);assert.equal(x.listeners.size,0);assert.equal(x.doc.activeElement,x.trigger);assert.deepEqual(calls.at(-1),['600105','<img onerror=bad>',9,mode]);}
 const count=calls.length;x.c.jlSecChooseStockJL('600105','永鼎',9);x.buttons().at(-1).onclick({stopPropagation(){}});assert.equal(calls.length,count);assert.equal(x.listeners.size,0);
 x.c.jlSecChooseStockJL('600105','永鼎',9);const old=x.panel();x.c.jlSecChooseStockJL('000001','平安',10);assert.equal(old.isConnected,false);assert.equal(x.listeners.size,1);assert.equal(x.doc.body.children.length,1);
 let prevented=0;Array.from(x.listeners)[0]({key:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(x.doc.activeElement,x.buttons().at(-1));Array.from(x.listeners)[0]({key:'Escape',preventDefault(){prevented++;}});assert.equal(prevented,2);assert.equal(x.panel(),null);assert.equal(x.listeners.size,0);
 x.c.jlSecChooseStockJL('600105','永鼎',9);const shade=x.panel();shade.onclick({target:shade});assert.equal(x.listeners.size,0);assert.equal(x.panel(),null);assert.equal(calls.length,count);
});
test('sector stock actions open the chooser for adding, preserve direct hold/open, and never treat unknown actions as holdings',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../jl_sector_strength.js'),'utf8'),start=js.indexOf('  function stkAct(ev)'),end=js.indexOf('  var POPS =',start),calls=[];
 const c={POPS:null,ROOT:null,S:{open:true},window:{jlSecChooseStockJL:(...a)=>calls.push(['choose',...a]),jlSecAddStockJL:(...a)=>calls.push(['add',...a]),ydOpenStockJL:(...a)=>calls.push(['open',...a])}};vm.createContext(c);vm.runInContext(js.slice(start,end),c);
 function act(mode){const attrs={'data-jlstk':mode,'data-c':'600105','data-n':'永鼎','data-p':'9.5','data-pc':'2'};return c.stkAct({target:{closest:()=>({getAttribute:k=>attrs[k]})},stopPropagation(){}});}
 act('watch');act('add');act('hold');act('open');act('bogus');assert.deepEqual(calls,[['choose','600105','永鼎',9.5],['choose','600105','永鼎',9.5],['add','600105','永鼎',9.5,'hold'],['open','600105','永鼎',2]]);assert.equal(c.S.open,false);
 delete c.window.jlSecChooseStockJL;act('watch');assert.deepEqual(calls.at(-1),['add','600105','永鼎',9.5,'watch']);
});
