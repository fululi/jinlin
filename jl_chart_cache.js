/* Cache only successful, validated candle responses; keep source and timestamp together. */
(function(root){
  'use strict';
  function create(storage, now){
    now=now||Date.now;
    const prefix='jl_candles_v1:', memory=new Map(), pending=new Map(), ttl=30000;
    function valid(v){return v && Number.isFinite(v.at) && v.at<=now()+60000 && v.data && Array.isArray(v.data.rows) && v.data.rows.length>0;}
    function peek(key){
      let v=memory.get(key);
      if(!v)try{v=JSON.parse(storage.getItem(prefix+key));if(valid(v))memory.set(key,v);}catch(e){}
      return valid(v)?{...v.data,at:v.at,cached:true,stale:now()-v.at>=ttl}:null;
    }
    function put(key,data){
      const value={at:now(),data};if(!valid(value))throw new Error('无有效K线');
      memory.delete(key);memory.set(key,value);
      while(memory.size>24)memory.delete(memory.keys().next().value);
      try{
        const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith(prefix))keys.push(k);}
        keys.sort((a,b)=>{try{return JSON.parse(storage.getItem(a)).at-JSON.parse(storage.getItem(b)).at;}catch(e){return 0;}});
        while(keys.length>=24){const k=keys.shift();if(k!==prefix+key)storage.removeItem(k);}
        storage.setItem(prefix+key,JSON.stringify(value));
      }catch(e){}
      return {...data,at:value.at,cached:false,stale:false};
    }
    function refresh(key,loader){
      if(pending.has(key))return pending.get(key);
      const p=Promise.resolve().then(loader).then(data=>put(key,data)).finally(()=>pending.delete(key));
      pending.set(key,p);return p;
    }
    function get(key,loader){const hit=peek(key);return hit&&!hit.stale?Promise.resolve(hit):refresh(key,loader);}
    return {peek,get,refresh};
  }
  function hedge(primary,fallback,delay){
    return new Promise((resolve,reject)=>{
      let done=false,started=false,failed=0,last,timer;
      function run(fn){Promise.resolve().then(fn).then(v=>{if(!v)throw new Error('无K线数据');return v;}).then(v=>{if(!done){done=true;clearTimeout(timer);resolve(v);}},e=>{last=e;failed++;if(!started)start();if(failed===2&&!done){done=true;reject(last);}});}
      function start(){if(started||done)return;started=true;clearTimeout(timer);run(fallback);}
      timer=setTimeout(start,delay);run(primary);
    });
  }
  if(typeof module==='object'&&module.exports)module.exports={create,hedge};
  if(root.document){
    try{if(root.parent!==root&&root.parent.JLChartCache){root.JLChartCache=root.parent.JLChartCache;return;}}catch(e){}
    let storage;try{storage=root.localStorage;}catch(e){}
    root.JLChartCache=create(storage);root.JLChartCache.hedge=hedge;
  }
})(typeof window==='object'?window:globalThis);
