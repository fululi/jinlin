const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,hedge}=require('../jl_chart_cache.js');
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const data={rows:[['2026-11-18',10,12,9,11,5]],source:'test'};
test('simultaneous reads share one request; fresh revisit uses cache',async()=>{let n=0;const c=create(storage());const load=async()=>{n++;return data};await Promise.all([c.get('A|101',load),c.get('A|101',load)]);assert.equal(n,1);assert.equal((await c.get('A|101',load)).cached,true);assert.equal(n,1)});
test('persistent cache survives frame recreation with symbol and period isolation',async()=>{const s=storage(),a=create(s);await a.get('A|101',async()=>data);const b=create(s);assert.equal(b.peek('A|101').rows[0][4],11);assert.equal(b.peek('A|102'),null);assert.equal(b.peek('B|101'),null)});
test('stale candles remain readable when refresh fails',async()=>{let now=1;const c=create(storage(),()=>now);await c.get('A',async()=>data);now+=31000;assert.equal(c.peek('A').stale,true);await assert.rejects(c.refresh('A',async()=>{throw Error('offline')}));assert.deepEqual(c.peek('A').rows,data.rows)});
test('empty response cannot overwrite good candles and storage stays bounded',async()=>{const s=storage(),c=create(s);await c.get('A',async()=>data);await assert.rejects(c.refresh('A',async()=>({rows:[]})));assert.deepEqual(c.peek('A').rows,data.rows);for(let i=0;i<30;i++)await c.get(String(i),async()=>data);assert.ok(s.length<=24)});
test('slow primary does not block the successful backup',async()=>{const got=await hedge(()=>new Promise(()=>{}),async()=>data,5);assert.equal(got,data)});
test('fast primary avoids duplicate fallback; empty primary triggers backup',async()=>{let n=0;assert.equal(await hedge(async()=>data,async()=>{n++;return data},50),data);assert.equal(n,0);assert.equal(await hedge(async()=>null,async()=>{n++;return data},50),data);assert.equal(n,1)});
test('both source failures reject instead of inventing candles',async()=>{await assert.rejects(hedge(async()=>{throw Error('one')},async()=>{throw Error('two')},5))});
