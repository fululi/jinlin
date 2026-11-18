/* 东财筹码·资金观察。
 * 价量条件逐项移植 ~/金粼量化工具/脚本/吸筹资金名单.py (V0 / FILTER15)。
 * 退出: absorb_exit_1118.py E7 (5日净占比<=0 且 收盘<MA20)，跟踪最多20交易日。
 * 原回测是新浪 ratioamount；这里仅用东财 mainPct，禁止引用原回测收益。
 * 缺占比: 实际成交额优先，否则 F-EXP2 量(手)*100*OHLC/4，显式标估。
 * 日级信号仅收盘后确认；进/出三角用下一交易日已出现的开盘价，绝不前移。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JLAbsorb = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var VERSION = 'em-v0-e7-1', RED = '#ff666e', GREEN = '#38d5a3', YELLOW = '#ffe16b', CYAN = '#54d9ee';
  function num(v) { return v == null || String(v).trim() === '' || v === '-' ? null : Number.isFinite(+v) ? +v : null; }
  function day(v) { var s = String(v || '').replace(/\D/g, '').slice(0, 8); return s.length === 8 ? s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6) : ''; }
  function clock(now) { var d = new Date((now == null ? Date.now() : +now) + 8 * 3600000); return { d: d.toISOString().slice(0,10), m: d.getUTCHours()*60+d.getUTCMinutes(), w:d.getUTCDay() }; }
  function closed(d, now) { var t = clock(now); return d < t.d || d === t.d && t.m >= 905 && t.w > 0 && t.w < 6; }
  function symbol(code) { code=String(code||''); return /^(sh|sz|bj)\d{6}$/.test(code) ? code : (/^[569]/.test(code)?'sh':/^[48]/.test(code)?'bj':'sz')+code; }
  function bars(rows, layout) {
    var m={}; (rows||[]).forEach(function (r) {
      var b=Array.isArray(r) ? {d:day(r[0]),o:num(r[1]),c:num(r[layout==='ks'?4:2]),h:num(r[layout==='ks'?2:3]),l:num(r[layout==='ks'?3:4]),v:num(r[5]),a:num(r[6])} : {d:day(r.d||r.t),o:num(r.o),c:num(r.c),h:num(r.h),l:num(r.l),v:num(r.v),a:num(r.a||r.amount)};
      if (b.d && b.o>0 && b.c>0 && b.h>=Math.max(b.o,b.c) && b.l<=Math.min(b.o,b.c) && b.l>0 && b.v>0) m[b.d]=b;
    }); return Object.keys(m).sort().map(function(k){return m[k];});
  }
  function flows(rows) {
    var m={}; (rows||[]).forEach(function(r){
      var a=typeof r==='string'?r.split(','):null;
      var f=a?{d:day(a[0]),main:num(a[1]),mainPct:num(a[6]),estimated:a[7]==='估'}:{d:day(r.d),main:num(r.main),mainPct:num(r.mainPct),estimated:!!r.estimated};
      if(f.d && (f.main!=null || f.mainPct!=null)) m[f.d]=f;
    });return Object.keys(m).sort().map(function(k){return m[k];});
  }
  function compute(input, funds, options) {
    options=options||{}; var today=clock(options.now).d, B=bars(input,options.layout).filter(function(b){return b.d<=today;}), F={}, prev12=null,prev26=null,prev9=null,lastSignal=-1e9, rows=[],trades=[];
    flows(funds).forEach(function(f){F[f.d]=f;});
    var cs=[];
    function ma(n,i){ if(i+1<n)return null; var s=0;for(var j=i-n+1;j<=i;j++)s+=cs[j];return s/n; }
    B.forEach(function(b,i){
      cs.push(b.c);var f=F[b.d], pct=f?f.mainPct:null, est=!!(f&&f.estimated), via=est?'估':'东财原值';
      if(pct==null && f && f.main!=null){var amount=b.a>0?b.a:b.v*100*(b.o+b.c+b.h+b.l)/4;if(amount>0){pct=f.main/amount*100;est=true;via=b.a>0?'成交额算':'F-EXP2估';}}
      prev12=prev12==null?b.c:prev12+(b.c-prev12)*2/13;
      prev26=prev26==null?b.c:prev26+(b.c-prev26)*2/27;
      var dif=prev12-prev26; prev9=prev9==null?dif:prev9+(dif-prev9)*2/10;
      var r=Object.assign({},b,{pct:pct,estimated:est,via:via,main:f?f.main:null,m5:ma(5,i),m10:ma(10,i),m20:ma(20,i),m30:ma(30,i),m60:ma(60,i),dif:dif,dea:prev9,flow5:null,flowEstimated:false,confirmed:closed(b.d,options.now),signal:false,entry:[],exit:[]});
      rows.push(r);
      if(i>=4){var five=rows.slice(i-4,i+1);if(five.every(function(x){return x.pct!=null;})){r.flow5=five.reduce(function(a,x){return a+x.pct;},0);r.flowEstimated=five.some(function(x){return x.estimated;});}}
      r.flowWeak=r.flow5==null?null:r.flow5<=0;r.priceWeak=r.m20==null?null:r.c<r.m20;
      var p=rows[i-1], mm=[r.m5,r.m10,r.m20,r.m30,r.m60];
      var cross=p && ((p.m20!=null && r.c>r.m20 && p.c<=p.m20)||(p.m60!=null && r.c>r.m60 && p.c<=p.m60));
      mm=mm.filter(function(x){return x!=null;});
      var base=cross && dif>=prev9 && Math.max.apply(null,mm)/Math.min.apply(null,mm)-1<.05 && b.v>p.v*1.5 && r.m5>p.m5;
      if(r.confirmed && base && r.flow5>0 && i-lastSignal>15){lastSignal=i;if(i>=60){r.signal=true;trades.push({signal:i,entry:null,exitSignal:null,exit:null,expiry:null,reason:''});}}
      trades.forEach(function(t){
        if(t.signal+1===i){t.entry=i;r.entry.push(t.signal);}
        if(t.entry==null || t.exit!=null)return;
        if(t.exitSignal!=null){if(t.exitSignal+1===i){t.exit=i;r.exit.push({signal:t.exitSignal,reason:t.reason});}return;}
        if(r.confirmed && i>=t.entry){
          if(r.flowWeak===true && r.priceWeak===true){t.exitSignal=i;t.reason='资金转出且破20日线';}
          else if(i-t.entry+1>=20){t.expiry=i;t.exit=i;t.reason='跟踪满20日';r.exit.push({signal:i,reason:t.reason,price:r.c,at:'close'});}
        }
      });
    });
    var confirmed=rows.filter(function(r){return r.confirmed;}), last=confirmed[confirmed.length-1]||null, latestTrade=trades.length?trades[trades.length-1]:null;
    var state=!last?'日线暂缺':last.flow5==null?'资金暂缺':last.signal?'吸筹候选':latestTrade && latestTrade.expiry===rows.indexOf(last)?'跟踪到期':latestTrade && latestTrade.exitSignal===rows.indexOf(last)?'退出观察':last.flowWeak && last.priceWeak?'双项转弱':last.flowWeak || last.priceWeak?'注意':latestTrade && latestTrade.exit==null?'跟踪中':'观察';
    return {version:VERSION,source:'东财',rows:rows,trades:trades,last:last,state:state};
  }
  function eventOf(result) {
    var r=result.last;if(!r || r.flow5==null)return null;
    if(r.signal)return {d:r.d,kind:'吸筹候选',estimated:r.flowEstimated};
    var i=result.rows.indexOf(r),p=result.rows[i-1];
    if(result.trades.some(function(t){return t.expiry===i;}))return {d:r.d,kind:'跟踪到期',estimated:r.flowEstimated};
    if(result.trades.some(function(t){return t.exitSignal===i;}))return {d:r.d,kind:'退出观察',estimated:r.flowEstimated};
    if(r.flowWeak && r.priceWeak && p && p.flow5!=null && !(p.flowWeak && p.priceWeak))return {d:r.d,kind:'双项转弱',estimated:r.flowEstimated};
    return null;
  }
  var api={version:VERSION,num:num,day:day,clock:clock,closed:closed,symbol:symbol,bars:bars,flows:flows,compute:compute,eventOf:eventOf};
  if(typeof window==='undefined' || typeof document==='undefined')return api;
  var memory={},pending={},attempt={},KEY='jl_stock_favorites_v1';
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(e){return fallback;}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function favorites(){var a=read(KEY,[]);return (Array.isArray(a)?a:[]).filter(function(x){return x&&/^(sh|sz|bj)\d{6}$/.test(symbol(x.code));});}
  function isFavorite(code){return favorites().some(function(x){return symbol(x.code)===symbol(code);});}
  function toggleFavorite(code,name){
    var c=symbol(code);if(!/^(sh|sz|bj)\d{6}$/.test(c))return false;var a=favorites(),on=!isFavorite(c);a=a.filter(function(x){return symbol(x.code)!==c;});if(on)a.push({code:c,name:name||code});
    try{write(KEY,a);}catch(e){message('收藏未保存：本机存储已满');return false;}
    window.dispatchEvent(new CustomEvent('jlabsorb:favorites'));return on;
  }
  function message(text){if(window.toast){window.toast(text);return;}var n=document.createElement('div');n.className='jlAbsToast';n.textContent=text;document.body.appendChild(n);setTimeout(function(){n.remove();},4500);}
  function db(name,store,fn){return new Promise(function(resolve){
    if(!window.indexedDB)return resolve(null);var done=false,timer=setTimeout(function(){finish(null);},4000);
    function finish(x){if(done)return;done=true;clearTimeout(timer);resolve(x);}
    try{var q=indexedDB.open(name,1);q.onupgradeneeded=function(){if(!q.result.objectStoreNames.contains(store))q.result.createObjectStore(store);};q.onsuccess=function(){var d=q.result;if(done){d.close();return;}try{fn(d,function(x){d.close();finish(x);});}catch(e){d.close();finish(null);}};q.onerror=q.onblocked=function(){finish(null);};}catch(e){finish(null);}
  });}
  function stored(code){return db('jl_absorb_v1','r',function(d,cb){var q=d.transaction('r').objectStore('r').get(code);q.onsuccess=function(){cb(q.result||null);};q.onerror=function(){cb(null);};});}
  function persist(code,data){return db('jl_absorb_v1','r',function(d,cb){var t=d.transaction('r','readwrite');t.objectStore('r').put(data,code);t.oncomplete=function(){cb(true);};t.onerror=t.onabort=function(){cb(false);};});}
  function exported(code){return db('ks_ffexp','r',function(d,cb){var q=d.transaction('r').objectStore('r').get(code.slice(-6));q.onsuccess=function(){var v=q.result;cb(v&&v.ff?v.ff.map(function(s){return s.split(',').slice(2).join(',');}):[]);};q.onerror=function(){cb([]);};});}
  var seq=0;
  function jsonp(url,param){return new Promise(function(resolve,reject){
    var done=false,name='__jlAbs'+Date.now()+'_'+(++seq),s=document.createElement('script'),t=setTimeout(function(){end(new Error('数据接口超时'));},8500);
    function end(e,data){if(done)return;done=true;clearTimeout(t);s.remove();delete window[name];e?reject(e):resolve(data);}
    window[name]=function(data){end(null,data);};s.onerror=function(){end(new Error('数据接口未连接'));};s.src=url+(url.indexOf('?')<0?'?':'&')+(param||'cb')+'='+name;document.head.appendChild(s);
  });}
  function firstGood(jobs){return new Promise(function(resolve,reject){var n=jobs.length,last; jobs.forEach(function(p){p.then(resolve,function(e){last=e;if(!--n)reject(last);});});});}
  async function fetchBars(code){
    var hosts=['https://web.ifzq.gtimg.cn','https://ifzq.gtimg.cn','https://proxy.finance.qq.com/ifzqgtimg'],deadline=Date.now()+12000,last;
    for(var i=0;i<hosts.length && Date.now()<deadline;i++){
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},Math.min(4500,deadline-Date.now()));
      try{var res=await fetch(hosts[i]+'/appstock/app/fqkline/get?param='+encodeURIComponent(code+',day,,,640,qfq'),{signal:controller.signal});if(!res.ok)throw Error('日线接口未连接');var d=await res.json(),q=d&&d.data&&d.data[code],b=bars(q&&(q.qfqday||q.day)||[]);if(!b.length)throw Error('日线暂缺');return b;}catch(e){last=e;}finally{clearTimeout(timer);}
    }throw Error('日线暂缺：'+(last&&last.message||'请求超时'));
  }
  function fetchFunds(code){var sec=(code.slice(0,2)==='sh'?'1.':code.slice(0,2)==='bj'?'0.':'0.')+code.slice(-6),q='?secid='+sec+'&ut=7eea3edcaed734bea9cbfc24409ed989&lmt=320&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57';
    function parse(d){var a=d&&d.data&&d.data.klines;if(!a||!a.length)throw Error('东财日级资金暂缺');return flows(a);}
    return firstGood([jsonp('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get'+q+'&end=20500101').then(parse),jsonp('https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get'+q+'&klt=101').then(function(d){var a=d&&d.data&&d.data.klines;if(!a||!a.length)throw Error('东财日级资金暂缺');return flows(a.map(function(s){return s.split(',').slice(0,6).join(',');}));})]);
  }
  function mergeFunds(a,b){var m={};flows(a).concat(flows(b)).forEach(function(f){var old=m[f.d];if(old && old.mainPct!=null && (f.mainPct==null || !old.estimated && f.estimated))f=Object.assign({},f,{mainPct:old.mainPct,estimated:old.estimated});if(old && f.main==null)f=Object.assign({},f,{main:old.main});m[f.d]=f;});return Object.keys(m).sort().map(function(k){return m[k];});}
  function supplement(data,options){
    var b=bars(options.bars||[]);if(b.length){var old=data.bars||[],last=old[old.length-1],recent=b[b.length-1];if(!last || recent.d>=last.d){
      var om={};old.forEach(function(r){om[r.d]=r;});var changed=b.some(function(r){var p=om[r.d];return p && Math.abs(p.c/r.c-1)>.003;});
      if(changed){if(b.length>=old.length)data.bars=b;}else{b.forEach(function(r){om[r.d]=r;});data.bars=Object.keys(om).sort().map(function(k){return om[k];});}
    }}if(options.funds)data.funds=mergeFunds(data.funds,options.funds);return data;
  }
  async function load(code,options){
    code=symbol(code); options=options||{};if(pending[code])return pending[code].then(function(d){return supplement(d,options);});
    if(memory[code]&&!options.force&&Date.now()-(attempt[code]||0)<60000)return supplement(memory[code],options);
    attempt[code]=Date.now();
    pending[code]=(async function(){
      var saved=memory[code]||await stored(code)||{bars:[],funds:[]},cache=read('ks_ff_v1',{}),cf=cache[code]||cache[code.slice(-6)],f=mergeFunds(saved.funds,cf&&cf.rows||[]);
      f=mergeFunds(f,await exported(code));var b=bars(options.bars||[]);if(!b.length)b=saved.bars||[];
      if(options.funds)f=mergeFunds(f,options.funds);
      var requestedAt=Date.now(),values=await Promise.allSettled([options.bars&&b.length>=300&&b[b.length-1].d===clock().d?Promise.resolve(b):fetchBars(code),fetchFunds(code)]);
      if(values[0].status==='fulfilled')b=values[0].value;
      if(values[1].status==='fulfilled')f=mergeFunds(f,values[1].value);
      var requestedDay=clock(requestedAt).d;
      function hasRequestedDay(v){return v.status==='fulfilled' && v.value.some(function(r){return r.d===requestedDay;});}
      var data=supplement({bars:b,funds:f,at:Date.now(),barsAt:hasRequestedDay(values[0])?requestedAt:saved.barsAt,fundsAt:hasRequestedDay(values[1])?requestedAt:saved.fundsAt,error:values.filter(function(v){return v.status==='rejected';}).map(function(v){return v.reason.message;}).join('；')},options);
      memory[code]=data;await persist(code,data);return data;
    })().finally(function(){delete pending[code];});return pending[code];
  }
  function result(code){var d=memory[symbol(code)];return d?compute(d.bars,d.funds):null;}
  function css(){if(document.getElementById('jlAbsCss'))return;var s=document.createElement('style');s.id='jlAbsCss';s.textContent=
    '.jlAbsView{position:relative;box-sizing:border-box;min-height:230px;color:#f2fbff;background:linear-gradient(145deg,#101c2bed,#07101aed);border:1px solid #79a9cf44;border-radius:9px;overflow:hidden;font:11px/1.45 -apple-system,sans-serif}.jlAbsView[hidden]{display:none!important}.jlAbsHead{display:flex;align-items:center;gap:6px;padding:6px 8px;min-height:25px}.jlAbsHead b{font-size:12px;font-weight:500;flex:1}.jlAbsView button{color:#edfaff;background:#ffffff0a;border:1px solid #ffffff33;border-radius:6px;min-width:28px;min-height:28px;font-size:12px;cursor:pointer}.jlAbsFacts{padding:0 9px;color:#fff;min-height:30px}.jlAbsView canvas{position:relative!important;inset:auto!important;width:100%!important;height:184px!important;display:block;touch-action:pan-y}.jlAbsFoot{display:flex;gap:6px;align-items:center;padding:3px 9px 6px;font-size:10px}.jlAbsFoot input{min-width:40px;flex:1;accent-color:#ffe16b}.jlAbsRow{width:100%;display:flex;align-items:center;gap:8px;text-align:left;padding:10px;border:0;border-bottom:1px solid #ffffff24;background:transparent;color:#fff}.jlAbsRow strong{flex:1}.jlAbsLamp{font-size:10px;white-space:nowrap}.jlAbsToast{position:fixed;top:15%;left:10%;right:10%;z-index:2147483600;padding:12px;background:#142a3af5;color:#fff;border:1px solid #7fb7cf;border-radius:8px}.jlAbsRead{padding:0 9px 4px;min-height:15px;color:#e5f3ff;font-variant-numeric:tabular-nums}';document.head.appendChild(s);}
  function mount(host,config){
    css();config=config||{};host.classList.add('jlAbsView');host.innerHTML='<div class="jlAbsHead"><b></b><button type="button" data-fav aria-label="收藏股票">☆</button><button type="button" data-reload aria-label="刷新日级资金">↻</button><button type="button" data-close aria-label="关闭资金观察图">×</button></div><div class="jlAbsFacts"></div><canvas aria-label="东财日级资金观察图，按住或拖动查看历史"></canvas><div class="jlAbsRead"></div><div class="jlAbsFoot"><span>日级·东财</span><input type="range" min="0" max="0" value="0" aria-label="查看交易日"><button type="button" data-latest>最新</button></div>';
    var cv=host.querySelector('canvas'),facts=host.querySelector('.jlAbsFacts'),readout=host.querySelector('.jlAbsRead'),slider=host.querySelector('input'),code='',name='',data=null,index=null,cursor=null,token=0;
    function paint(){
      if(!data)return;var R=data.rows,n=R.length;if(!n){facts.textContent='日线暂缺 · 点击 ↻ 重试';return;}
      var end=index==null?n-1:Math.max(0,Math.min(n-1,index)),start=Math.max(0,end-99),visible=R.slice(start,end+1),r=R[cursor==null?end:cursor],w=cv.clientWidth||340,h=cv.clientHeight||184,dpr=Math.min(window.devicePixelRatio||1,2);cv.width=w*dpr;cv.height=h*dpr;var g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
      var vals=[];visible.forEach(function(x){vals.push(x.c,x.o);if(x.m20!=null)vals.push(x.m20);});var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),pad=(hi-lo)*.13||hi*.01;lo-=pad;hi+=pad;
      var L=8,T=16,B=h-23,right=w-43,X=function(i){return L+(right-L)*(i-start)/Math.max(1,end-start);},Y=function(v){return B-(v-lo)/(hi-lo)*(B-T);};
      g.font='10px -apple-system,sans-serif';g.lineWidth=.5;for(var k=0;k<3;k++){var v=lo+(hi-lo)*k/2,y=Y(v);g.strokeStyle='#9ac5dd25';g.beginPath();g.moveTo(L,y);g.lineTo(right,y);g.stroke();g.fillStyle='#eefaff';g.fillText(v.toFixed(2),right+4,y+3);}
      function line(a,b,color,width,ka,kb){if(a==null||b==null)return;g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(X(ka),Y(a));g.lineTo(X(kb),Y(b));g.stroke();}
      for(var i=start+1;i<=end;i++){line(R[i-1].c,R[i].c,R[i].flow5==null?'#c5ced6':R[i].flow5>=0?RED:GREEN,1,i-1,i);line(R[i-1].m20,R[i].m20,'#f0cf7888',.8,i-1,i);}
      for(i=start;i<=end;i++){var rr=R[i];if(rr.entry.length){g.fillStyle=YELLOW;g.textAlign='center';g.font='11px sans-serif';g.fillText('▲进',X(i),Math.max(T+10,Math.min(B-2,Y(rr.o)+15)));}if(rr.exit.length){var marker=rr.exit[0];g.fillStyle=CYAN;g.textAlign='center';g.font='11px sans-serif';g.fillText(marker.at==='close'?'▼期':'▼出',X(i),Math.max(T+10,Math.min(B-2,Y(marker.price||rr.o)-8)));}}
      if(cursor!=null){g.strokeStyle='#ffffff66';g.lineWidth=.5;g.beginPath();g.moveTo(X(cursor),T);g.lineTo(X(cursor),B);g.stroke();}
      g.textAlign='left';g.fillStyle='#edfaff';g.font='10px sans-serif';g.fillText(R[start].d.slice(5),L,h-6);g.textAlign='right';g.fillText(R[end].d.slice(5),right,h-6);g.textAlign='left';
      var f=r.flow5==null?'资金暂缺':(r.flow5>=0?'+':'')+r.flow5.toFixed(2)+'%'+(r.flowEstimated?'·含估算':'');
      facts.textContent=(index==null&&cursor==null?data.state:'历史查看')+' · 近5日主力 '+f+' · '+(r.m20==null?'20日线预热':r.priceWeak?'20日线下':'20日线上');
      readout.textContent=r.d+' '+(r.confirmed?'收盘':'盘中·未确认')+' · 收 '+r.c.toFixed(2)+' · MA20 '+(r.m20==null?'—':r.m20.toFixed(2))+' · ▲/▼次日开盘，▼期为20日收盘到期';
      slider.max=n-1;slider.value=end;host.querySelector('[data-fav]').textContent=isFavorite(code)?'★':'☆';
    }
    async function show(c,n,opts){var id=++token;code=symbol(c);name=n||c;index=null;cursor=null;data=null;host.querySelector('b').textContent=name+' · 筹码／资金观察';host.querySelector('[data-fav]').textContent=isFavorite(code)?'★':'☆';facts.textContent='读取东财日级资金…';readout.textContent='红入绿出 · 20日线 · ▲进／▼出为下一交易日开盘参考';var g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
      var d=await load(code,opts);if(id!==token)return;data=compute(d.bars,d.funds);paint();if(d.error)readout.textContent+=' · '+d.error+'（已有日期可查看）';}
    host.querySelector('[data-fav]').onclick=function(){toggleFavorite(code,name);paint();host.querySelector('[data-fav]').textContent=isFavorite(code)?'★':'☆';};
    host.querySelector('[data-close]').onclick=function(){if(config.onClose)config.onClose();else host.hidden=true;};
    host.querySelector('[data-reload]').onclick=function(){show(code,name,{force:true});};host.querySelector('[data-latest]').onclick=function(){index=null;cursor=null;paint();};slider.oninput=function(){index=+slider.value;cursor=null;paint();};
    function point(e){if(!data||!data.rows.length)return;var rc=cv.getBoundingClientRect(),n=data.rows.length,end=index==null?n-1:index,start=Math.max(0,end-99);cursor=Math.max(start,Math.min(end,Math.round(start+(e.clientX-rc.left-8)/Math.max(1,rc.width-51)*(end-start))));paint();}
    cv.onpointerdown=function(e){cv.setPointerCapture(e.pointerId);point(e);};cv.onpointermove=function(e){if(e.buttons)point(e);};
    var ro=window.ResizeObserver?new ResizeObserver(paint):null;if(ro)ro.observe(host);
    return {show:show,paint:paint,host:host,destroy:function(){token++;if(ro)ro.disconnect();}};
  }
  function lamps(res){var r=res&&res.last;return ['flowWeak','priceWeak'].map(function(k,i){var v=r?r[k]:null;return '<span class="jlAbsLamp" style="color:'+(v==null?'#c5ced6':v?GREEN:RED)+'">● '+(i?'线':'资')+(v==null?'待':v?'弱':'强')+'</span>';}).join(' ');}
  // 只在应用可运行时检查。记录日期与规则版本去重；旧数据不追报。
  async function checkClose(list,notify,now){
    var t=clock(now);if(t.w===0||t.w===6||t.m<905)return [];
    var sent=[],seen=read('jl_absorb_alert_seen_v1',{});
    for(var i=0;i<list.length;i++){
      var x=list[i],c=symbol(x.code),d=await load(c,{force:true});
      if(![d.barsAt,d.fundsAt].every(function(at){return at && clock(at).d===t.d && closed(t.d,at);}))continue;
      var res=compute(d.bars,d.funds,{now:now}),ev=eventOf(res);
      if(!ev||ev.d!==t.d)continue;var key=VERSION+'|'+c+'|'+ev.d+'|'+ev.kind;if(seen[key])continue;
      seen[key]=true;try{write('jl_absorb_alert_seen_v1',seen);}catch(e){continue;}
      var alert={id:key,code:c,name:x.name||c,d:ev.d,kind:ev.kind,estimated:ev.estimated};sent.push(alert);
      var log=read('jl_absorb_alerts_v1',[]);log.push(alert);try{write('jl_absorb_alerts_v1',log.slice(-200));}catch(e){}
      if(notify)notify(alert);
    }return sent;
  }
  Object.assign(api,{favorites:favorites,isFavorite:isFavorite,toggleFavorite:toggleFavorite,load:load,result:result,mount:mount,lamps:lamps,checkClose:checkClose,message:message,css:css});return api;
});
