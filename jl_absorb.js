/* 东财波段走势。
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
      // 观察台修复：逐项解释原规则，不改变原信号阈值或回填历史买卖点。
      var spread=mm.length===5?Math.max.apply(null,mm)/Math.min.apply(null,mm)-1:null;
      r.criteria=[
        {key:'history',label:'日线预热',ok:i>=60,value:(i+1)+' / 61根'},
        {key:'cross',label:'收盘上穿20或60日线',ok:p&&p.m20!=null?!!cross:null,value:cross?'当日上穿':'未上穿'},
        {key:'macd',label:'MACD柱 ≥ 0',ok:dif>=prev9,value:(dif-prev9).toFixed(4)},
        {key:'compact',label:'五条均线间距 < 5%',ok:spread==null?null:spread<.05,value:spread==null?'均线不足':(spread*100).toFixed(2)+'%'},
        {key:'volume',label:'成交量 > 昨日1.5倍',ok:p?b.v>p.v*1.5:null,value:p?(b.v/p.v).toFixed(2)+'倍':'无前值'},
        {key:'slope',label:'5日均线向上',ok:p&&p.m5!=null?r.m5>p.m5:null,value:p&&p.m5!=null?(r.m5-p.m5).toFixed(4):'均线不足'},
        {key:'fund',label:'近5日主力占比之和 > 0',ok:r.flow5==null?null:r.flow5>0,value:r.flow5==null?'资金不完整':r.flow5.toFixed(2)+'个百分点'+(r.flowEstimated?' · 含估算':'')},
        {key:'cooldown',label:'距上次原始触发 > 15日',ok:i-lastSignal>15,value:lastSignal<0?'无前次触发':(i-lastSignal)+'个交易日'}
      ];
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
    var state=!last?'日线暂缺':last.flow5==null?'资金暂缺':last.signal?'波段候选':latestTrade && latestTrade.expiry===rows.indexOf(last)?'跟踪到期':latestTrade && latestTrade.exitSignal===rows.indexOf(last)?'退出观察':last.flowWeak && last.priceWeak?'双项转弱':last.flowWeak || last.priceWeak?'注意':latestTrade && latestTrade.exit==null?'跟踪中':'观察';
    return {version:VERSION,source:'东财',rows:rows,trades:trades,last:last,state:state};
  }
  function eventOf(result) {
    var r=result.last;if(!r || r.flow5==null)return null;
    if(r.signal)return {d:r.d,kind:'波段候选',estimated:r.flowEstimated};
    var i=result.rows.indexOf(r),p=result.rows[i-1];
    if(result.trades.some(function(t){return t.expiry===i;}))return {d:r.d,kind:'跟踪到期',estimated:r.flowEstimated};
    if(result.trades.some(function(t){return t.exitSignal===i;}))return {d:r.d,kind:'退出观察',estimated:r.flowEstimated};
    if(r.flowWeak && r.priceWeak && p && p.flow5!=null && !(p.flowWeak && p.priceWeak))return {d:r.d,kind:'双项转弱',estimated:r.flowEstimated};
    return null;
  }
  // 任一历史日只读取当日已知的信号和开盘参考价，已结束轮次保留身份。
  function at(result,index){
    var R=result&&result.rows||[],i=index==null?R.length-1:Math.min(R.length-1,Math.max(0,index)),r=R[i];
    if(!r)return {key:'missing',label:'日线暂缺',color:'#ffffff',attention:false,row:null,trade:null};
    var all=(result.trades||[]).filter(function(t){return t.signal<=i;}),t=all[all.length-1]||null;
    var bi=t&&t.entry!=null&&t.entry<=i?t.entry:null,ex=t&&t.exitSignal!=null&&t.exitSignal<=i?t.exitSignal:null,ei=t&&t.exit!=null&&t.exit<=i?t.exit:null;
    var expired=!!(t&&t.expiry!=null&&t.expiry<=i),key,label,reason,color='#ffffff';
    if(!r.confirmed){key='pending';label='盘中待确认';reason='当天日级条件尚未收盘确认。';}
    else if(i<60){key='warmup';label='日线预热';reason='原规则要求至少61根日线，当前不足，不能判断是否触发。';}
    else if(r.flow5==null&&ei==null){key='missing';label='资金暂缺';reason='近5个交易日资金未齐，无法判断资金条件；未标记不等于没有波段。';}
    else if(r.signal){key='new';label='波段候选';color=YELLOW;reason='原选股规则当日触发；下一交易日开盘出现后才有进价参考。候选不等于已证实有波段。';}
    else if(ei!=null){key=expired?'expired':'closed';label=expired?'跟踪到期':'已退场';color=CYAN;reason=expired?'这一轮满20个交易日结束，记录到期收盘参考价。':R[ex].d+' 资金与价格两项转弱，下一交易日开盘记录出价参考；不代表用户实际成交。';}
    else if(ex!=null){key='exit';label='退出观察';color=CYAN;reason='这一轮近5日资金指标 ≤ 0 且收盘低于20日线，退出条件触发，尚无下一交易日开盘参考价。';}
    else if(bi!=null){key=r.flowWeak||r.priceWeak?'watch':'tracking';label=key==='watch'?'注意':'跟踪中';color=key==='watch'?YELLOW:RED;reason=key==='watch'?'这一轮资金或价格有一项转弱，尚未同时满足退出条件。':'这一轮近5日资金指标为正且收盘在20日线上。';}
    else{key='before';label='未触发';reason='当日未触发原选股规则。未触发不等于没有波段。';}
    if(key==='before'||key==='missing'||key==='warmup'){
      var failed=(r.criteria||[]).filter(function(c){return c.ok===false;});
      if(failed.length)reason+=' 未满足：'+failed.map(function(c){return c.label+'（'+c.value+'）';}).join('；')+'。';
    }
    var five=R.slice(Math.max(0,i-4),i+1),main5=five.length===5&&five.every(function(x){return x.main!=null;})?five.reduce(function(s,x){return s+x.main;},0):null;
    var entry=bi!=null?R[bi].o:null,exit=ei!=null?(expired?R[ei].c:R[ei].o):null;
    return {key:key,label:label,reason:reason,color:color,attention:key==='watch'||key==='exit',row:r,index:i,trade:t?{signal:t.signal,entry:bi,exitSignal:ex,exit:ei,expiry:expired?t.expiry:null}:null,
      signal:t?t.signal:null,bi:bi,ex:ex,ei:ei,expired:expired,entry:entry,exit:exit,main5:main5,
      pnl:entry>0?((exit!=null?exit:r.c)/entry-1)*100:null,
      criteria:r.criteria||[],fundDays:five.filter(function(x){return x.pct!=null;}).length};
  }
  var api={version:VERSION,num:num,day:day,clock:clock,closed:closed,symbol:symbol,bars:bars,flows:flows,compute:compute,eventOf:eventOf,at:at};
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
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function signed(v,d){return v==null?'—':(v>0?'+':'')+v.toFixed(d==null?2:d);}
  function money(v){return v==null?'—':signed(v/1e8)+'亿';}
  function tone(v){return v==null?'#ffffff':v>0?RED:v<0?GREEN:'#ffffff';}
  function css(){if(document.getElementById('jlAbsCss'))return;var s=document.createElement('style');s.id='jlAbsCss';s.textContent=
    '.jlAbsView,.jlAbsList{box-sizing:border-box;color:#fff;background:radial-gradient(ellipse at 0 0,#183b7844,transparent 70%),#0a122c;border:1px solid #ffffff38;border-radius:12px;font:12px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums}.jlAbsView{position:relative;overflow:hidden}.jlAbsView[hidden]{display:none!important}.jlAbsView *,.jlAbsList *{box-sizing:border-box}.jlAbsView button,.jlAbsList button{font:inherit;color:#fff;background:#ffffff09;border:1px solid #ffffff38;border-radius:7px;min-width:30px;min-height:30px;cursor:pointer}.jlAbsView button:focus-visible,.jlAbsList button:focus-visible{outline:2px solid #8ec5ff;outline-offset:2px}.jlAbsHead{display:flex;align-items:center;gap:6px;padding:10px 12px 6px}.jlAbsHead b{flex:1;min-width:0;font-size:13px;font-weight:500;overflow-wrap:anywhere}.jlAbsHead button{flex-shrink:0}.jlAbsTime{display:flex;justify-content:space-between;gap:6px;margin:0 12px 8px;padding:5px 8px;border:1px solid #ffffff30;border-radius:8px;background:#1c375b;flex-wrap:wrap}.jlAbsTime.history{background:#363850;border-color:#ffd84a66}.jlAbsFacts{display:grid;grid-template-columns:1fr 1.06fr 1fr;margin:0 0 8px;padding:9px 0;background:#ffffff03}.jlAbsFact{padding:0 10px;min-width:0}.jlAbsFact+.jlAbsFact{border-left:1px solid #ffffff30}.jlAbsFact span,.jlAbsFact small{display:block;font-size:11px;color:#fff;line-height:1.7}.jlAbsFact b{display:block;font-size:16px;font-weight:500;line-height:1.8;white-space:nowrap}.jlAbsFact b.state{font-size:13px}.jlAbsView canvas{position:relative!important;inset:auto!important;width:100%!important;height:270px!important;display:block;touch-action:pan-y}.jlAbsRead{padding:0 12px 4px;font-size:11px;overflow-wrap:anywhere}.jlAbsFoot{display:flex;gap:7px;align-items:center;padding:2px 12px 7px}.jlAbsFoot input{min-width:0;width:100%;flex:1;accent-color:#8ec5ff;height:30px;margin:0}.jlAbsFoot button{font-size:11px;white-space:nowrap}.jlAbsEvidence{margin:0 11px 10px;padding:10px;border:1px solid #ffffff30;border-radius:10px;background:#12234280}.jlAbsEvidence p{margin:6px 0;font-size:12px;line-height:1.7}.jlAbsEvidence h4{font-size:12px;font-weight:500;margin:0}.jlAbsBadge{display:inline-block;border:1px solid currentColor;border-radius:5px;padding:1px 5px;font-size:11px;white-space:nowrap}.jlAbsConditions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.jlAbsConditions>div{border:1px solid #ffffff20;border-radius:7px;background:#1d375b;padding:6px 8px;min-width:0}.jlAbsConditions b{display:block;font-size:12px;font-weight:400}.jlAbsTimeline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;border-top:1px solid #ffffff30;margin-top:8px;padding-top:8px}.jlAbsTimeline span,.jlAbsTimeline b,.jlAbsTimeline small{display:block;font-size:11px;font-weight:400;overflow-wrap:anywhere}.jlAbsReturn{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #ffffff30;padding-top:7px;margin-top:8px}.jlAbsView details{margin:8px 12px;font-size:11px}.jlAbsView summary{cursor:pointer;min-height:30px;display:flex;align-items:center}.jlAbsCriteria{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px}.jlAbsCriteria span{padding:3px 0;border-bottom:1px solid #ffffff18;overflow-wrap:anywhere}.jlAbsStatus{padding:0 12px 8px;color:#ffe16b;font-size:11px}.jlAbsTrades{overflow-x:auto}.jlAbsTrades table{width:100%;border-collapse:collapse;font:10px/1.6 -apple-system,sans-serif;white-space:nowrap}.jlAbsTrades td,.jlAbsTrades th{text-align:left;padding:4px;border-bottom:1px solid #ffffff25;font-weight:400}.jlAbsList{padding:10px}.jlAbsListHead{display:flex;justify-content:space-between;gap:10px;margin-bottom:7px}.jlAbsTabs{display:flex;gap:3px;padding:3px;border:1px solid #ffffff26;border-radius:9px;background:#152d4e}.jlAbsTabs button{flex:1;min-width:0;border-color:transparent;background:none;font-size:12px;padding:3px}.jlAbsTabs button[aria-pressed=true]{background:#2d4d76;border-color:#ffffff55}.jlAbsRow{display:grid!important;grid-template-columns:72px minmax(28px,1fr) 32px 76px;gap:6px;align-items:center;width:100%;text-align:left;padding:10px 4px!important;border:0!important;border-top:1px solid #ffffff20!important;border-radius:0!important;background:transparent!important;color:#fff!important}.jlAbsRow.on{background:#2b4b75!important;border-radius:8px!important}.jlAbsRow strong{font-size:12px;font-weight:500}.jlAbsRow small{display:block;font-size:10px;font-weight:400}.jlAbsRow svg{width:100%;height:32px}.jlAbsLamp{display:block;font-size:10px;white-space:nowrap}.jlAbsRowRight{text-align:right;min-width:0;font-size:10px}.jlAbsListFoot{font-size:11px;margin:5px 2px}.jlAbsToast{position:fixed;top:15%;left:10%;right:10%;z-index:2147483600;padding:12px;background:#142a3af5;color:#fff;border:1px solid #7fb7cf;border-radius:8px}.jlAbsEmpty{padding:18px 6px;text-align:center;font-size:12px}';document.head.appendChild(s);}
  function mount(host,config){
    css();config=config||{};host.classList.add('jlAbsView');host.innerHTML='<div class="jlAbsHead"><b></b><button type="button" data-fav aria-label="收藏股票">☆</button><button type="button" data-reload aria-label="刷新日级资金">↻</button><button type="button" data-close aria-label="关闭波段走势图">×</button></div><div class="jlAbsTime"></div><div class="jlAbsFacts"></div><div class="jlAbsRead"></div><canvas aria-label="日级价格和资金历史，按住拖动查看"></canvas><div class="jlAbsFoot"><button type="button" data-prev aria-label="前一交易日">‹</button><input type="range" min="0" max="0" value="0" aria-label="查看交易日"><button type="button" data-next aria-label="后一交易日">›</button><button type="button" data-latest>最新</button></div><section class="jlAbsEvidence"></section><details data-criteria><summary>查看波段候选的逐项条件</summary><div class="jlAbsCriteria"></div></details><details data-trades><summary>历史进出记录 · 规则参考</summary><div class="jlAbsTrades"></div></details><div class="jlAbsStatus"></div>';
    var cv=host.querySelector('canvas'),facts=host.querySelector('.jlAbsFacts'),readout=host.querySelector('.jlAbsRead'),slider=host.querySelector('input'),code='',name='',data=null,index=null,cursor=null,token=0,raw=null,drawBounds=null,optsSaved={};
    function paint(){
      if(!data)return;var R=data.rows,n=R.length;if(!n){facts.textContent='日线暂缺 · 点击 ↻ 重试';return;}
      var windowEnd=index==null?n-1:Math.max(0,Math.min(n-1,index)),start=Math.max(0,windowEnd-99),end=cursor==null?windowEnd:Math.max(start,Math.min(windowEnd,cursor)),state=at(data,end),r=state.row,visible=R.slice(start,end+1);
      var w=cv.clientWidth||340,h=270,dpr=Math.min(window.devicePixelRatio||1,2);cv.width=w*dpr;cv.height=h*dpr;var g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
      var L=9,right=w-44,T=43,B=171,Ftop=204,Fbot=248,X=function(i){return L+(right-L)*(i-start)/Math.max(1,windowEnd-start);};
      var vals=[];visible.forEach(function(x){vals.push(x.c);if(x.m20!=null)vals.push(x.m20);});
      [state.bi,state.ei].forEach(function(j){if(j!=null&&j>=start)vals.push(j===state.ei&&state.expired?R[j].c:R[j].o);});
      var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),pad=(hi-lo)*.14||hi*.01;lo-=pad;hi+=pad;var Y=function(v){return B-(v-lo)/(hi-lo)*(B-T);};drawBounds={start:start,end:windowEnd,left:L,right:right};
      g.font='10px -apple-system,sans-serif';g.textAlign='left';g.fillStyle='#fff';
      var entryEnd=state.ei==null?end:state.ei;
      if(state.bi!=null&&entryEnd>=start){g.fillStyle='#ffd84a0c';g.fillRect(X(Math.max(start,state.bi)),T,Math.max(1,X(entryEnd)-X(Math.max(start,state.bi))),B-T);}
      for(var k=0;k<3;k++){var v=lo+(hi-lo)*k/2,y=Y(v);g.strokeStyle='#ffffff22';g.lineWidth=.5;g.beginPath();g.moveTo(L,y);g.lineTo(right,y);g.stroke();g.fillStyle='#fff';g.fillText(v.toFixed(2),right+4,y+3);}
      function line(a,b,color,width,ka,kb){if(a==null||b==null)return;g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(X(ka),Y(a));g.lineTo(X(kb),Y(b));g.stroke();}
      for(var j=start+1;j<=end;j++){line(R[j-1].c,R[j].c,tone(R[j].c-R[j-1].c),1,j-1,j);line(R[j-1].m20,R[j].m20,'#ffffff',.65,j-1,j);}
      if(state.entry!=null&&entryEnd>=start){g.setLineDash([4,4]);g.strokeStyle=YELLOW;g.lineWidth=.65;g.beginPath();g.moveTo(X(Math.max(start,state.bi)),Y(state.entry));g.lineTo(X(entryEnd),Y(state.entry));g.stroke();g.setLineDash([]);}
      function marker(j,price,up){if(j==null||j<start||j>end)return;var x=X(j),y=Y(price);g.fillStyle=up?YELLOW:CYAN;g.beginPath();g.moveTo(x,y);g.lineTo(x-4,y+(up?7:-7));g.lineTo(x+4,y+(up?7:-7));g.closePath();g.fill();g.strokeStyle=up?YELLOW:CYAN;g.lineWidth=.6;g.beginPath();g.moveTo(x,y+(up?8:-8));g.lineTo(x,y+(up?14:-14));g.stroke();}
      marker(state.bi,state.entry,true);marker(state.ei,state.exit,false);
      // 价签各占一行，日期和真实开盘／到期收盘价均在绘图区外，避免压走势线。
      g.font='10px -apple-system,sans-serif';g.fillStyle=YELLOW;g.fillText(state.entry!=null?'▲进 '+R[state.bi].d+' · 开盘 '+state.entry.toFixed(2)+'元':'本轮尚无进价参考',L,12);
      if(state.exit!=null){g.fillStyle=CYAN;g.fillText('▼'+(state.expired?'期 ':'出 ')+R[state.ei].d+(state.expired?' · 收盘 ':' · 开盘 ')+state.exit.toFixed(2)+'元',L,28);}
      g.fillStyle='#fff';g.font='9px -apple-system,sans-serif';g.fillText(R[start].d.slice(5),L,187);g.textAlign='right';g.fillText(r.d.slice(5),X(end),187);g.textAlign='left';
      // 柱：当日净占比；线：五日占比之和。各自归一，仅共用零线。
      var maxP=Math.max(1,...visible.map(function(x){return Math.abs(x.pct||0);})),maxF=Math.max(1,...visible.map(function(x){return Math.abs(x.flow5||0);})),mid=(Ftop+Fbot)/2,half=(Fbot-Ftop)/2;
      g.strokeStyle='#ffffff44';g.lineWidth=.5;g.beginPath();g.moveTo(L,mid);g.lineTo(right,mid);g.stroke();
      var bw=Math.max(.8,Math.min(4,(right-L)/Math.max(1,windowEnd-start)*.62));
      visible.forEach(function(x,z){if(x.pct==null)return;var bh=x.pct/maxP*half;g.fillStyle=x.pct>0?RED:GREEN;g.fillRect(X(start+z)-bw/2,mid-bh,bw,bh||.7);});
      for(j=start+1;j<=end;j++){if(R[j-1].flow5==null||R[j].flow5==null)continue;g.strokeStyle=YELLOW;g.lineWidth=.8;g.beginPath();g.moveTo(X(j-1),mid-R[j-1].flow5/maxF*half);g.lineTo(X(j),mid-R[j].flow5/maxF*half);g.stroke();}
      g.font='9px -apple-system,sans-serif';g.fillStyle='#fff';g.fillText('柱：当日占比 ±'+maxP.toFixed(1)+'%',L,201);g.textAlign='right';g.fillStyle=YELLOW;g.fillText('线：5日之和 ±'+maxF.toFixed(1)+'pp',right,201);g.textAlign='left';
      g.fillStyle='#fff';g.fillText('独立缩放 · 不能比较柱线高度 · 空缺为缺数',L,263);
      if(cursor!=null){g.strokeStyle='#ffffffcc';g.lineWidth=.6;g.setLineDash([3,3]);g.beginPath();g.moveTo(X(end),T);g.lineTo(X(end),Fbot);g.stroke();var cy=Y(R[end].c);g.beginPath();g.moveTo(L,cy);g.lineTo(right,cy);g.stroke();g.setLineDash([]);g.fillStyle='#1a2540';g.fillRect(right+1,cy-7,43,14);g.fillStyle='#fff';g.font='9px -apple-system,sans-serif';g.textAlign='left';g.fillText(R[end].c.toFixed(2),right+3,cy+3);}
      var hist=end<n-1,time=host.querySelector('.jlAbsTime');time.classList.toggle('history',hist);time.innerHTML='<span style="color:'+(hist?YELLOW:'#8ec5ff')+'">'+(hist?'历史查看':'最新日线')+'</span><span>'+esc(r.d)+' · '+(r.confirmed?'收盘':'盘中未确认')+'</span>';
      var gap=r.m20?(r.c/r.m20-1)*100:null;
      function fact(label,value,sub,color,cls){return '<div class="jlAbsFact"><span>'+label+'</span><b class="'+(cls||'')+'" style="color:'+color+'">'+esc(value)+'</b><small>'+esc(sub)+'</small></div>';}
      facts.innerHTML=fact('距20日线',gap==null?'—':signed(gap)+'%',r.m20?'MA20 '+r.m20.toFixed(2):'均线不足',tone(gap))+fact('近5日主力',money(state.main5),r.flow5==null?'占比数据 '+state.fundDays+'/5天':'占比之和 '+signed(r.flow5)+'pp'+(r.flowEstimated?' · 估':''),tone(state.main5))+fact('波段规则状态',state.label,state.bi!=null?'本轮第'+(Math.min(end,state.ei==null?end:state.ei)-state.bi+1)+'日':'未触发≠没有波段',state.color,'state');
      readout.textContent='收盘 '+r.c.toFixed(2)+' · 当日主力占比 '+(r.pct==null?'缺数':signed(r.pct)+'%')+' · 价格红涨绿跌／白线MA20';
      var flow=r.flow5==null?'待数据':r.flowWeak?'已转弱':'未转弱',price=r.m20==null?'待数据':r.priceWeak?'已破线':'未破线';
      function item(label,value,sub){return '<div><span>'+label+'</span><b>'+esc(value)+'</b><small>'+esc(sub)+'</small></div>';}
      var ev=host.querySelector('.jlAbsEvidence');ev.innerHTML='<div style="display:flex;justify-content:space-between;gap:6px"><h4>为什么是这个状态</h4><span class="jlAbsBadge" style="color:'+state.color+'">'+state.label+'</span></div><p>'+esc(state.reason)+'</p><div class="jlAbsConditions"><div>资金 · 5日占比之和 ≤ 0<b>'+flow+' · '+(r.flow5==null?'—':signed(r.flow5)+'pp')+'</b></div><div>价格 · 收盘 &lt; 20日线<b>'+price+' · '+(r.m20==null?'—':r.m20.toFixed(2))+'</b></div></div><div class="jlAbsTimeline">'+item('原始信号日',state.signal==null?'尚未触发':R[state.signal].d,'收盘确认')+item('进 · 开盘参考',state.bi==null?'尚未形成':R[state.bi].d,state.entry==null?'—':state.entry.toFixed(2)+'元')+item(state.expired?'到期 · 收盘参考':'出 · 开盘参考',state.ei!=null?R[state.ei].d:state.ex!=null?'待下一交易日':'尚未触发',state.exit==null?'—':state.exit.toFixed(2)+'元')+'</div><div class="jlAbsReturn"><span>'+(state.ei!=null?'这一轮':'本轮至今')+'参考涨跌 · 未计费用</span><span style="color:'+tone(state.pnl)+'">'+(state.pnl==null?'尚未形成':signed(state.pnl)+'%')+'</span></div>';
      host.querySelector('.jlAbsCriteria').innerHTML=state.criteria.map(function(c){return '<span>'+esc(c.label)+'</span><span style="color:'+(c.ok==null?'#fff':c.ok?RED:YELLOW)+'">'+(c.ok==null?'待数据':c.ok?'✓':'未满足')+' · '+esc(c.value)+'</span>';}).join('');
      var ts=data.trades.filter(function(t){return t.signal<=end;});host.querySelector('[data-trades] summary').textContent='历史进出记录 · '+ts.length+'轮规则参考';
      host.querySelector('.jlAbsTrades').innerHTML=ts.length?'<table><thead><tr><th>信号</th><th>进 · 开盘</th><th>出／到期</th><th>涨跌</th></tr></thead><tbody>'+ts.slice().reverse().map(function(t){var s=at({rows:R,trades:[t]},end);return '<tr><td>'+esc(R[t.signal].d)+'</td><td>'+esc(s.bi==null?'待开盘':R[s.bi].d+' '+s.entry.toFixed(2))+'</td><td>'+esc(s.ei==null?'未结束':R[s.ei].d+' '+s.exit.toFixed(2)+(s.expired?' 收':' 开'))+'</td><td style="color:'+tone(s.pnl)+'">'+(s.pnl==null?'—':signed(s.pnl)+'%')+'</td></tr>';}).join('')+'</tbody></table>':'截至所选日期没有原规则信号。';
      var fundsDate=raw&&raw.funds&&raw.funds.length?flows(raw.funds).slice(-1)[0].d:'无';
      host.querySelector('.jlAbsStatus').textContent='东财资金截至 '+fundsDate+' · '+(r.flowEstimated?'当前5日含估算；':'')+'此模块为价量／资金规则观察，未接入筹码分布；进出为参考，未验证交易优势。'+(raw&&raw.error?' '+raw.error+'，已有日期可查看。':'');
      slider.max=n-1;slider.value=end;slider.setAttribute('aria-valuetext',r.d+' '+state.label);host.querySelector('[data-prev]').disabled=end===0;host.querySelector('[data-next]').disabled=end===n-1;host.querySelector('[data-latest]').disabled=!hist;host.querySelector('[data-fav]').textContent=isFavorite(code)?'★':'☆';
      if(config.onDate)config.onDate(r.d);
    }
    async function show(c,n,opts){var id=++token;code=symbol(c);name=n||c;index=null;cursor=null;data=null;raw=null;optsSaved=opts||{};host.querySelector('.jlAbsHead b').textContent=name+' '+code.slice(-6)+' · 波段走势';host.querySelector('[data-fav]').textContent=isFavorite(code)?'★':'☆';facts.textContent='读取东财日级资金…';readout.textContent='';host.querySelector('.jlAbsTime').textContent='读取中';host.querySelector('.jlAbsEvidence').textContent='';host.querySelector('.jlAbsStatus').textContent='';host.querySelector('.jlAbsCriteria').textContent='';host.querySelector('.jlAbsTrades').textContent='';var g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
      try{var d=await load(code,optsSaved);if(id!==token)return;raw=d;data=compute(d.bars,d.funds);paint();}catch(e){if(id===token){facts.textContent='数据暂缺';host.querySelector('.jlAbsStatus').textContent=e.message||'读取失败，请重试';}}
    }
    host.querySelector('[data-fav]').onclick=function(){toggleFavorite(code,name);paint();};
    host.querySelector('[data-close]').onclick=function(){if(config.onClose)config.onClose();else host.hidden=true;};
    host.querySelector('[data-reload]').onclick=function(){show(code,name,Object.assign({},optsSaved,{force:true}));};
    function select(i){if(!data||!data.rows.length)return;index=Math.max(0,Math.min(data.rows.length-1,i));cursor=null;paint();}
    host.querySelector('[data-latest]').onclick=function(){index=null;cursor=null;paint();};slider.oninput=function(){select(+slider.value);};
    host.querySelector('[data-prev]').onclick=function(){select(+(slider.value||0)-1);};host.querySelector('[data-next]').onclick=function(){select(+(slider.value||0)+1);};
    function point(e){if(!data||!drawBounds)return;var rc=cv.getBoundingClientRect(),b=drawBounds;cursor=Math.max(b.start,Math.min(b.end,Math.round(b.start+(e.clientX-rc.left-b.left)/Math.max(1,b.right-b.left)*(b.end-b.start))));paint();}
    cv.onpointerdown=function(e){cv.setPointerCapture(e.pointerId);point(e);};cv.onpointermove=function(e){if(e.buttons||e.pointerType==='mouse')point(e);};
    var ro=window.ResizeObserver?new ResizeObserver(function(){if(!host.hidden)paint();}):null;if(ro)ro.observe(host);
    return {show:show,paint:paint,host:host,select:select,destroy:function(){token++;if(ro)ro.disconnect();}};
  }
  function mini(res,date){
    var R=res&&res.rows||[],v=R.filter(function(r){return !date||r.d<=date;}).slice(-30);if(!v.length)return '<svg viewBox="0 0 100 32" aria-label="走势待数据"></svg>';
    var lo=Math.min.apply(null,v.map(function(r){return r.c;})),hi=Math.max.apply(null,v.map(function(r){return r.c;})),Y=function(c){return 27-(c-lo)/Math.max(.01,hi-lo)*22;},a='';
    for(var i=1;i<v.length;i++)a+='<path d="M'+((i-1)/Math.max(1,v.length-1)*96+2).toFixed(1)+' '+Y(v[i-1].c).toFixed(1)+'L'+(i/Math.max(1,v.length-1)*96+2).toFixed(1)+' '+Y(v[i].c).toFixed(1)+'" stroke="'+tone(v[i].c-v[i-1].c)+'" fill="none" stroke-width=".9"/>';
    return '<svg viewBox="0 0 100 32" role="img" aria-label="近30日价格走势">'+a+'</svg>';
  }
  function mountList(host,config){
    css();config=config||{};host.classList.add('jlAbsList');var filter='all',date=null,selected='',alive=true,records=[],seq=0,queue=[];
    host.innerHTML='<div class="jlAbsListHead"><span>观察清单</span><span data-date>最新日级数据</span></div><div class="jlAbsTabs" role="group" aria-label="按规则状态筛选"></div><div data-rows></div><div class="jlAbsListFoot">资＝5日资金方向　线＝20日线位置<br>红入／线上，绿出／线下；灰色待数据。按各股最新可用日显示，缺数不等于安全。</div>';
    function snapshot(rec){var res=rec.res;if(!res)return at(null);var i=res.rows.length-1;if(date)while(i>=0&&res.rows[i].d>date)i--;return i<0?at(null):at(res,i);}
    function render(){if(!alive)return;var entries=records.map(function(rec){return {rec:rec,s:snapshot(rec)};}),counts={all:entries.length,attention:entries.filter(function(e){return e.s.attention;}).length,closed:entries.filter(function(e){return e.s.key==='closed'||e.s.key==='expired';}).length};
      host.querySelector('[data-date]').textContent=date?date+' · 历史同步':'各股最新数据';
      host.querySelector('.jlAbsTabs').innerHTML=[['all','全部'],['attention','需留意'],['closed','已退场']].map(function(a){return '<button type="button" data-filter="'+a[0]+'" aria-pressed="'+(filter===a[0])+'">'+a[1]+' '+counts[a[0]]+'</button>';}).join('');
      host.querySelectorAll('[data-filter]').forEach(function(b){b.onclick=function(){filter=b.getAttribute('data-filter');render();};});
      var ranks={exit:0,watch:1,missing:2,warmup:2,pending:2,new:3,tracking:4,before:5,closed:6,expired:6};
      var shown=entries.filter(function(e){return filter==='all'||filter==='attention'&&e.s.attention||filter==='closed'&&(e.s.key==='closed'||e.s.key==='expired');}).sort(function(a,b){return ranks[a.s.key]-ranks[b.s.key]||a.rec.order-b.rec.order;});
      var rows=host.querySelector('[data-rows]');rows.innerHTML='';
      if(!shown.length){rows.innerHTML='<div class="jlAbsEmpty">'+(records.length?'此筛选下暂无股票':'在K线或作战屏点☆收藏，即可加入观察清单。')+'</div>';return;}
      shown.forEach(function(e){var x=e.rec.x,s=e.s,r=s.row,row=document.createElement('button');row.type='button';row.className='jlAbsRow'+(selected===symbol(x.code)?' on':'');row.setAttribute('data-code',symbol(x.code));row.innerHTML='<strong>'+esc(x.name||x.code)+'<small>'+esc(x.code.slice(-6))+'</small></strong>'+mini(e.rec.res,date)+'<span>'+lamps({last:r})+'</span><span class="jlAbsRowRight"><span class="jlAbsBadge" style="color:'+s.color+'">'+s.label+'</span><small>'+(r?r.d:'待数据')+'</small><small>'+((r&&r.flowEstimated)?'含估算':'')+'</small></span>';row.onclick=function(){selected=symbol(x.code);render();if(config.onOpen)config.onOpen(x);};rows.appendChild(row);});
    }
    function update(list){var id=++seq;records=(list||[]).map(function(x,i){return {x:x,order:i,res:result(x.code)};});queue=records.slice();render();
      async function worker(){while(alive&&id===seq&&queue.length){var rec=queue.shift();try{var d=await load(rec.x.code,{bars:config.bars?config.bars(rec.x.code):null});if(!alive||id!==seq)return;rec.res=compute(d.bars,d.funds);render();}catch(e){if(alive&&id===seq)render();}}}
      worker();worker();
    }
    return {update:update,setDate:function(d){if(d===date)return;date=d||null;render();},destroy:function(){alive=false;seq++;queue=[];},host:host};
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
  Object.assign(api,{favorites:favorites,isFavorite:isFavorite,toggleFavorite:toggleFavorite,load:load,result:result,mount:mount,mountList:mountList,lamps:lamps,checkClose:checkClose,message:message,css:css});return api;
});
