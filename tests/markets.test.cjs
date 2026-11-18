const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,normalize,merge,parseBars,aggregate,usTicker}=require('../jl_markets.js');
test('popular US stocks use exchange suffix for complete history',()=>{
  for(const q of ['GLW','NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','AVGO','TSM'])assert.equal(merge(q,[])[0].kind,'us');
  assert.equal(usTicker(merge('GLW',[])[0]),'usGLW.N');
  assert.equal(usTicker(merge('NVDA',[])[0]),'usNVDA.OQ');
  assert.equal(usTicker(merge('TSLA',[])[0]),'usTSLA.OQ');
});
test('weekly aggregation preserves opening, final close and OHLC extrema',()=>{
  const rows=parseBars({klines:['2026-11-16,10,12,14,9,100','2026-11-17,12,11,13,8,200','2026-11-23,11,15,16,10,150']});
  const weeks=aggregate(rows,'102');assert.equal(weeks.length,2);assert.deepEqual(weeks[0],{time:'2026-11-17',open:10,close:11,high:14,low:8,volume:300});
});
test('commodity aliases distinguish spot, futures and crude benchmarks',()=>{
  assert.equal(merge('CL1!',[])[0].id,'102.CL00Y');
  assert.equal(merge('UKOIL',[])[0].id,'112.B00Y');
  assert.equal(merge('SILVER',[])[0].id,'122.XAG');
  assert.equal(merge('GC1!',[])[0].id,'101.GC00Y');
  assert.equal(merge('特斯拉',[])[0].id,'105.TSLA');
  assert.equal(merge('TSLA',[])[0].name,'特斯拉');
  assert.equal(merge('黄金',[]).length,2);
  assert.equal(merge('白银',[]).length,2);
  assert.equal(new Set(catalog.map(x=>x.id)).size,catalog.length);
});
test('exact GLW ticker wins over A-share pinyin without dropping either result',()=>{
  const rows=[{Code:'301095',Name:'广立微',Classify:'AStock',QuoteID:'0.301095'},
    {Code:'GLW',Name:'康宁',Classify:'UsStock',JYS:'NYSE',QuoteID:'106.GLW'}];
  const result=merge('GLW',rows);
  assert.equal(result[0].id,'106.GLW');assert.equal(result.length,2);
  assert.equal(merge('GLW',rows,'us').length,1);
});
test('board and ETF retain their real provider identity',()=>{
  assert.equal(normalize({Code:'BK1036',QuoteID:'90.BK1036',Classify:'BK'}).kind,'board');
  assert.equal(normalize({Code:'515880',QuoteID:'1.515880',Classify:'ETF'}).id,'1.515880');
  assert.equal(normalize({Code:'NVDA',QuoteID:'105.OTHER',Classify:'UsStock'}),null);
  assert.equal(normalize({Code:'x',QuoteID:'javascript:alert(1)',Classify:'UsStock'}),null);
  assert.equal(normalize({Code:'003670',QuoteID:'150.003670',Classify:'OTCFUND'}),null);
});
test('candles preserve OHLC order, dates and negative commodity prices',()=>{
  const bars=parseBars({klines:['2026-11-18,11,12,13,10,200','2026-11-17,9,10,11,8,100','2020-04-20,-10,-30,-5,-40,100']});
  assert.equal(bars[0].close,-30);assert.equal(bars[2].high,13);assert.equal(bars[2].low,10);assert.equal(bars[2].volume,200);
});
test('invalid bars never become fabricated zeros or malformed candles',()=>{
  assert.deepEqual(parseBars({klines:['2026-11-18,,12,13,10,2','2026-11-18,11,12,10,9,2','2026-11-18,11,12,13,10,-2','2026-11-18,11,12','bad,1,2,3,0,1']}),[]);
  assert.equal(parseBars({klines:['2026-11-18,11,12,13,10,2','2026-11-18,11,13,14,10,3']}).length,1);
});
