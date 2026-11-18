/* QuoteIDs verified with Eastmoney suggest on 2026-11-19.
   TV aliases identify related instruments, not identical CFD/continuous series. */
(function (root) {
  'use strict';
  const KEY = 'jinlin_markets_v1';
  const item = (id,name,kind,aliases,tv,note) => ({id,code:id.slice(id.indexOf('.')+1),name,kind,aliases,tv:tv||'',note:note||''});
  const catalog = [
    item('122.XAU','黄金 / 美元 · 现货','commodity','黄金 伦敦金 GOLD XAUUSD XAU','OANDA:XAUUSD','美元/盎司 · 现货报价商之间可能有价差'),
    item('122.XAG','白银 / 美元 · 现货','commodity','白银 伦敦银 SILVER XAGUSD XAG','OANDA:XAGUSD','美元/盎司 · SILVER 为搜索别名，不代表特定报价商'),
    item('101.GC00Y','COMEX 黄金 · 连续','commodity','黄金 纽约金 GC1! COMEX:GC1! GC00Y','COMEX:GC1!','美元/盎司 · 东财连续合约，换月规则可能与 GC1! 不同'),
    item('101.SI00Y','COMEX 白银 · 连续','commodity','白银 纽约银 SI1! COMEX:SI1! SI00Y','COMEX:SI1!','美元/盎司 · 东财连续合约，换月规则可能与 SI1! 不同'),
    item('102.CL00Y','WTI 原油 · NYMEX 连续','commodity','石油 原油 美油 WTI CL1! NYMEX:CL1! USOIL CL00Y','NYMEX:CL1!','美元/桶 · CL1! 是 WTI；USOIL CFD 与本期货并非同一合约'),
    item('112.B00Y','布伦特原油 · 当月连续','commodity','石油 原油 布油 布伦特 BRENT UKOIL BRN1! B00Y','TVC:UKOIL','美元/桶 · 东财期货；UKOIL 是 CFD 搜索别名，并非同一合约'),
    item('102.PL00Y','NYMEX 铂金 · 连续','commodity','铂金 白金 PL1! PL00Y','NYMEX:PL1!','美元/盎司 · 连续合约口径以数据源为准'),
    item('105.NVDA','英伟达','us','英伟达 NVDA NVIDIA','NASDAQ:NVDA','美股 · 美元'),
    item('106.GLW','康宁','us','康宁 GLW CORNING','NYSE:GLW','美股 · 美元'),
    item('105.TSLA','特斯拉','us','特斯拉 TSLA TESLA TSL','NASDAQ:TSLA','美股 · 美元'),
    item('105.AAPL','苹果','us','苹果 AAPL APPLE PG','NASDAQ:AAPL','美股 · 美元'),
    item('105.MSFT','微软','us','微软 MSFT MICROSOFT WR','NASDAQ:MSFT','美股 · 美元'),
    item('105.GOOGL','谷歌 / Alphabet A类','us','谷歌 GOOGL GOOGLE ALPHABET GG','NASDAQ:GOOGL','美股 A类股 · 美元'),
    item('105.AMZN','亚马逊','us','亚马逊 AMZN AMAZON YMX','NASDAQ:AMZN','美股 · 美元'),
    item('105.META','Meta / 脸书','us','META 脸书 FACEBOOK 元宇宙','NASDAQ:META','美股 · 美元'),
    item('105.AMD','AMD / 超威半导体','us','AMD 超威半导体 超微半导体','NASDAQ:AMD','美股 · 美元'),
    item('105.AVGO','博通','us','博通 AVGO BROADCOM BT','NASDAQ:AVGO','美股 · 美元'),
    item('106.TSM','台积电 · 美股 ADR','us','台积电 TSM TSMC TJD','NYSE:TSM','美股 ADR · 美元；不是台股 2330'),
    item('90.BK1036','半导体','board','半导体 BDT BK1036','','东财板块指数 · 点'),
    item('90.BK0448','通信设备','board','通信设备 TXSB BK0448','','东财板块指数 · 点')
  ];
  const labels={commodity:'商品',us:'美股',board:'A股板块',cn:'A股 / ETF',index:'指数'};
  function normalize(r) {
    if(!r || typeof r.QuoteID!=='string' || !/^\d{1,3}\.[A-Za-z0-9_.-]+$/.test(r.QuoteID))return null;
    const code=String(r.Code||''), cls=r.Classify;
    const kind=cls==='BK'?'board':cls==='UsStock'?'us':['UniversalFutures','FORPM'].includes(cls)?'commodity':cls==='AStock'||(['ETF','Fund'].includes(cls)&&/^[01]\./.test(r.QuoteID))?'cn':cls==='Index'&&/^[01]\./.test(r.QuoteID)?'index':'';
    if(!kind || !code || r.QuoteID.slice(r.QuoteID.indexOf('.')+1)!==code)return null;
    let tv=kind==='us' && /^(NASDAQ|NYSE|AMEX)$/.test(r.JYS)?r.JYS+':'+code:'';
    if(kind==='cn')tv=(r.QuoteID.startsWith('1.')?'SSE:':'SZSE:')+code;
    return item(r.QuoteID,String(r.Name||code),kind,String(r.PinYin||''),tv,kind==='board'?'东财板块指数 · 点':kind==='us'?'美股 · 美元':'行情口径以数据源为准');
  }
  function merge(query,rows,kind) {
    const q=query.trim().toUpperCase(),out=new Map();
    catalog.filter(r=>!q||(r.name+' '+r.code+' '+r.aliases).toUpperCase().includes(q)).concat(rows.map(normalize).filter(Boolean)).forEach(r=>{if(!out.has(r.id))out.set(r.id,r);});
    return [...out.values()].filter(r=>!kind||r.kind===kind).sort((a,b)=>Number(b.code.toUpperCase()===q)-Number(a.code.toUpperCase()===q));
  }
  function parseBars(data) {
    const seen=new Map();
    for(const row of (data && data.klines || [])) {
      const p=String(row).split(','),n=p.slice(1,7).map(Number);
      if(p.length<6 || !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(p[0]) || p.slice(1,6).some(x=>x.trim()==='') || n.slice(0,5).some(x=>!Number.isFinite(x)) || n[2]<Math.max(n[0],n[1],n[3]) || n[3]>Math.min(n[0],n[1],n[2]) || n[4]<0)continue;
      seen.set(p[0],{time:p[0],open:n[0],close:n[1],high:n[2],low:n[3],volume:n[4]});
    }
    return [...seen.values()].sort((a,b)=>a.time.localeCompare(b.time));
  }
  function usTicker(target){const market=target.id.split('.')[0];return 'us'+target.code+({'105':'.OQ','106':'.N','107':'.A'}[market]||'');}
  const api={catalog,normalize,merge,parseBars,aggregate,usTicker};
  if(typeof module==='object' && module.exports)module.exports=api;
  if(!root.document)return;
  root.JLMarkets=api;
  const doc=root.document;
  let seq=0;
  function jsonp(url,timeout=10000) {
    return new Promise((resolve,reject)=>{
      const name='__jlMarket_'+Date.now()+'_'+(++seq),script=doc.createElement('script');
      let ended=false;
      const finish=(err,data)=>{if(ended)return;ended=true;clearTimeout(timer);script.remove();root[name]=()=>{};setTimeout(()=>{delete root[name];},60000);err?reject(err):resolve(data);};
      root[name]=data=>finish(null,data);script.onerror=()=>finish(new Error('行情源连接失败'));
      const timer=setTimeout(()=>finish(new Error('行情源连接超时')),timeout);
      script.src=url.includes('{callback}')?url.replace('{callback}',name):url+'&cb='+name;doc.head.append(script);
    });
  }
  let saved=[];
  try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(v))saved=v.filter(r=>r&&/^\d{1,3}\.[A-Za-z0-9_.-]+$/.test(r.id)&&labels[r.kind]&&typeof r.name==='string').slice(0,200);}catch(e){}
  const selectedMarkets=new Map(),nativeModels=new Map();
  api.saved=()=>saved.slice();
  api.resolve=code=>selectedMarkets.get(code)||saved.find(r=>r.id===code)||catalog.find(r=>r.id===code)||(root.parent!==root&&root.parent.JLMarkets?root.parent.JLMarkets.resolve(code):null);
  api.model=code=>{const r=api.resolve(code);if(!r)return null;if(!nativeModels.has(code))nativeModels.set(code,{code,name:r.name,base:null,pct:null,quoteReady:false,market:true});return nativeModels.get(code);};
  api.fetchBars=(code,p)=>{
    try{if(root.parent!==root&&root.parent.JLMarkets)return root.parent.JLMarkets.fetchBars(code,p);}catch(e){}
    return root.JLChartCache.get('market|'+code+'|'+p,()=>fetchMarket(code,p));
  };
  async function fetchMarket(code,p){
    const target=api.resolve(code);if(!target)throw new Error('未识别的市场代码');
    p=String(p);
    if(!['5','15','30','60','101','102','103'].includes(p))throw new Error('此品种请使用日/周/月或可用分钟周期');
    const query='/api/qt/stock/kline/get?secid='+encodeURIComponent(target.id)+'&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt='+p+'&fqt=0&end=20500101&lmt=320';
    const em=async(host)=>{
      const d=await jsonp(host+query,6500);
      if(d&&d.data&&d.data.code===target.code&&Number(d.data.market)===Number(target.id.split('.')[0])){const rows=parseBars(d.data);if(rows.length)return {rows,source:'东财 · 不复权 · '+target.note};}
      throw new Error('该周期数据暂不可用');
    };
    const fallback=()=>root.JLChartCache.hedge(()=>em('https://push2his.eastmoney.com'),()=>em('https://61.push2his.eastmoney.com'),900);
    return root.JLChartCache.hedge(()=>international(target,p),fallback,1200);
  }
  let panel,input,list,status,filter='',results=[],ticket=0,searchTicket=0,timer=null,previousFocus;
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  function renderSaved(){if(root.jlRefreshMarketPicker)root.jlRefreshMarketPicker();}
  function save(r){const old=saved.slice(),i=saved.findIndex(v=>v.id===r.id);if(i<0)saved.push(r);else saved.splice(i,1);try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(e){saved=old;status.textContent='存储不可用，自选未保存';}render();renderSaved();}
  function render(){
    const q=input.value.trim().toUpperCase(),rows=filter==='tech'?catalog.filter(r=>r.kind==='us'):filter==='saved'?saved.filter(r=>!q||(r.name+' '+r.code).toUpperCase().includes(q)):results.filter(r=>!filter||r.kind===filter);
    list.replaceChildren();
    rows.forEach(r=>{const row=el('div',null,'jlmk-row'),b=el('button',null,'jlmk-result'),added=saved.some(v=>v.id===r.id),add=el('button',added?'✓':'＋','jlmk-add');b.type=add.type='button';b.append(el('b',r.name),el('small',r.code+' · '+labels[r.kind]));b.onclick=()=>select(r);add.setAttribute('aria-label',(added?'移除自选：':'加入自选：')+r.name);add.onclick=()=>save(r);row.append(b,add);list.append(row);});
  }
  async function search(){
    const q=input.value.trim(),id=++searchTicket;results=merge(q,[]);render();
    if(!q){status.textContent='常用品种 · 可按名称、拼音、代码搜索';return;}status.textContent='正在搜索…';
    try{const d=await jsonp('https://searchapi.eastmoney.com/api/suggest/get?input='+encodeURIComponent(q)+'&type=14&count=50&token=');if(id!==searchTicket||panel.hidden)return;results=merge(q,d&&d.QuotationCodeTable&&d.QuotationCodeTable.Data||[]);status.textContent='搜索完成 · 名称下显示市场与行情代码';render();}
    catch(e){if(id===searchTicket&&!panel.hidden){status.textContent='在线搜索暂不可用 · 仍可选择常用品种和已存自选';render();}}
  }
  function aggregate(rows,p){
    if(p==='101')return rows;
    const groups=new Map();
    rows.forEach(b=>{let key=b.time.slice(0,7);if(p==='102'){const d=new Date(b.time.slice(0,10)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=d.toISOString().slice(0,10);}const prev=groups.get(key);if(prev){prev.high=Math.max(prev.high,b.high);prev.low=Math.min(prev.low,b.low);prev.close=b.close;prev.volume+=b.volume;prev.time=b.time;}else groups.set(key,{...b});});
    return [...groups.values()];
  }
  async function international(target,p){
    if(!['101','102','103'].includes(p))return null;
    if(target.kind==='us'){
      const per={'101':'day','102':'week','103':'month'}[p],ticker=usTicker(target);
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
      try{const res=await fetch('https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param='+encodeURIComponent(ticker+','+per+',,,320,qfq'),{signal:controller.signal});if(!res.ok)return null;const d=await res.json(),s=d&&d.data&&d.data[ticker],raw=s&&(s['qfq'+per]||s[per]);if(!Array.isArray(raw))return null;const rows=parseBars({klines:raw.map(r=>r.slice(0,6).join(','))});return rows.length?{rows,source:'腾讯美股 · '+(s['qfq'+per]?'前复权':'不复权')+' · 美元'}:null;}finally{clearTimeout(timeout);}
    }
    const symbols={'122.XAU':'XAU','122.XAG':'XAG','101.GC00Y':'GC','101.SI00Y':'SI','102.CL00Y':'CL','112.B00Y':'OIL','102.PL00Y':'PL'},symbol=symbols[target.id];
    if(symbol){const raw=await jsonp('https://stock2.finance.sina.com.cn/futures/api/jsonp.php/{callback}/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol='+symbol);if(!Array.isArray(raw))return null;const rows=parseBars({klines:raw.map(r=>[r.date,r.open,r.close,r.high,r.low,r.volume].join(','))});return rows.length?{rows:aggregate(rows,p).slice(-320),source:'新浪国际行情 · '+symbol+' · '+(p==='101'?'日线':'日线聚合')+' · '+(symbol==='XAU'||symbol==='XAG'?'现货':'连续期货，换月规则以新浪为准')+' · 成交量可能未提供'}:null;}
    return null;
  }
  function select(r){selectedMarkets.set(r.id,r);if(root.jlOpenMarketChart){close();root.jlOpenMarketChart(r.id);}else status.textContent='K线工作区尚未就绪';}
  function close(){panel.hidden=true;++ticket;++searchTicket;clearTimeout(timer);if(previousFocus)previousFocus.focus();}
  function create(){
    const style=el('style');style.textContent='#jlMarketPanel[hidden],#jlMarketPanel [hidden]{display:none!important}#jlMarketPanel{position:fixed;inset:0;z-index:100100;background:rgba(6,18,26,.98);color:#e9f5f6;padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom));box-sizing:border-box;overflow:auto;font:14px/1.5 -apple-system,sans-serif}#jlMarketPanel *{box-sizing:border-box}#jlMarketPanel .jlmk-wrap{max-width:1100px;margin:auto}#jlMarketPanel header,#jlMarketPanel form,.jlmk-tabs,.jlmk-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#jlMarketPanel header{justify-content:space-between;margin-bottom:12px}#jlMarketPanel h2{font-size:20px;margin:0}#jlMarketPanel button,#jlMarketPanel a{background:#ffffff0c;color:#e9f5f6;border:1px solid #81e6d944;padding:8px 12px;border-radius:9px;font:inherit;cursor:pointer;text-decoration:none}#jlMarketPanel button.active{background:#81e6d92a;border-color:#81e6d9}#jlMarketPanel input{flex:1;min-width:150px;background:#ffffff0c;border:1px solid #81e6d955;border-radius:9px;padding:11px;color:white;font:inherit}.jlmk-tabs{margin:10px 0}.jlmk-status,.jlmk-source{color:#a8c6ce;font-size:12px;margin:8px 0}.jlmk-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;max-height:240px;overflow:auto}.jlmk-result{text-align:left}.jlmk-result b,.jlmk-result small{display:block}.jlmk-result small{color:#aac7ce;font-size:11px}.jlmk-chart{margin-top:16px;border-top:1px solid #ffffff24;padding-top:12px}.jlmk-chart canvas{display:block;width:100%;height:380px;touch-action:pan-y}.jlmk-info{min-height:40px;font-size:13px;color:#e9dca9;margin:10px 0}.jlmk-entry{padding:5px 9px;border:1px solid #81e6d966;border-radius:8px;background:#81e6d91a;color:inherit;font:inherit;cursor:pointer}@media(max-width:600px){.jlmk-results{grid-template-columns:1fr;max-height:185px}.jlmk-chart canvas{height:330px}#jlMarketPanel{padding-left:10px;padding-right:10px}.jlmk-toolbar{gap:5px}#jlMarketPanel button,#jlMarketPanel a{padding:7px 9px;font-size:12px}}';doc.head.append(style);
    panel=el('section');panel.id='jlMarketPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','全市场行情搜索');const wrap=el('div',null,'jlmk-wrap'),head=el('header'),x=el('button','关闭 ×');x.onclick=close;head.append(el('h2','全市场 · K线自选'),x);wrap.append(head);
    const form=el('form');input=el('input');input.type='search';input.placeholder='黄金 / 白银 / 原油 / NVDA / 板块名称';input.setAttribute('aria-label','搜索品种名称或代码');const submit=el('button','搜索');submit.type='submit';form.append(input,submit);form.onsubmit=e=>{e.preventDefault();clearTimeout(timer);search();};input.oninput=()=>{++searchTicket;clearTimeout(timer);timer=setTimeout(search,350);};wrap.append(form);
    const tabs=el('div',null,'jlmk-tabs');[['','全部'],['commodity','商品'],['us','美股'],['board','A股板块'],['cn','A股/ETF'],['saved','★ 自选']].forEach(([key,name])=>{const b=el('button',name);b.type='button';b.dataset.kind=key;b.onclick=()=>{filter=key;tabs.querySelectorAll('button').forEach(v=>v.classList.toggle('active',v===b));render();};b.classList.toggle('active',key===filter);tabs.append(b);});wrap.append(tabs);
    const tech=el('button','热门科技股');tech.type='button';tech.dataset.kind='tech';tech.onclick=()=>{filter='tech';tabs.querySelectorAll('button').forEach(v=>v.classList.toggle('active',v===tech));render();};tabs.append(tech);
    status=el('p',null,'jlmk-status');status.setAttribute('role','status');list=el('div',null,'jlmk-results');wrap.append(status,list);panel.append(wrap);doc.body.append(panel);
    panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,input,a[href]')].filter(n=>!n.hidden&&n.getClientRects().length);if(e.shiftKey&&doc.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus();}else if(!e.shiftKey&&doc.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus();}}};
  }
  function open(query){if(!panel)create();previousFocus=doc.activeElement;panel.hidden=false;if(typeof query==='string')input.value=query;input.focus();search();}
  api.open=open;
  function mount(){
    if(root.S&&root.buildTabs)return;
    const compact=el("style");compact.textContent=".jlmk-row{display:flex;gap:4px}.jlmk-result{flex:1}#jlMarketPanel .jlmk-add{width:28px;padding:0;font-size:16px;border:0}body #jlMarketPanel{font-size:12px}body #jlMarketPanel h2{font-size:14px}.jlmk-entry{font-size:12px!important;padding:3px!important}";doc.head.append(compact);const style=el('style');style.textContent='.jlmk-entry{padding:5px 9px;border:1px solid #81e6d966;border-radius:8px;background:#81e6d91a;color:inherit;font:inherit;cursor:pointer}';doc.head.append(style);['#watchPage .watchTabs','#chartPage .chartHeading','#picker .pickerTabs'].forEach(selector=>{const parent=doc.querySelector(selector);if(!parent||parent.querySelector('[data-jl-markets]'))return;const b=el('button','⌕','jlmk-entry');b.type='button';b.dataset.jlMarkets='1';b.setAttribute('aria-label','搜索黄金白银原油美股与A股板块');b.onclick=()=>open('');parent.append(b);});renderSaved();}
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount);else mount();
})(typeof window==='object'?window:globalThis);
