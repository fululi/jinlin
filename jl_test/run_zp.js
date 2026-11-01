// jl-zp4 回归: 做T作战屏盘中引擎(分时实际高低进决策/反弹线只用卖后低点/提醒与引擎同源/断链停算/切票隔离/三轮收工/不足一手/回放重跑引擎) + 浮球(断链/首条弹跳)
const { load, bars } = require('./zp_harness.js');
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const r2 = x => Math.round(x * 100) / 100;
const DAY = '20261102';

function setup(now, o) {
  const G = load({ now: '2026-11-02T' + now + ':00+08:00' });
  const L = G.LIVE;
  Object.assign(L, { sym: 'sh600105', sh: 400, pc: 10, open: 10, sessDate: DAY, ts: DAY + now.replace(':', '') + '00', last: 0, hi: 0, lo: 0, err: null, base: false });
  L.hist.day = [{ t: '2026-10-30', o: 10, h: 10.2, l: 9.9, c: 10 }];
  Object.assign(L, o || {});
  return G;
}
const mins = rows => rows.map(r => ({ hm: r[0], p: r[3], h: r[1], l: r[2] }));   // [hm, h, l, c]

// ---------- P0-01 正在走的那根触发卖出(原版末根一律不卖) ----------
{
  const G = setup('09:47');
  const L = G.LIVE;
  L.bars = bars(DAY, [['0935', 10, 10.02, 9.95, 10.0], ['0940', 10, 10.03, 9.98, 10.01], ['0945', 10.01, 10.02, 9.99, 10.0], ['0950', 10.0, 10.08, 10.0, 10.07]]);
  L.hist.m5 = L.bars; L.last = 10.07; L.hi = 10.08; L.lo = 9.95;
  L.pts = mins([['0946', 10.03, 10.0, 10.02], ['0947', 10.08, 10.02, 10.07]]);
  G.liveCompute();
  const e = L.eng;
  ok(e && e.sp === 10.06, 'P0-01 当前根冲到10.08≥卖目标10.06 → 引擎卖出 (got ' + (e && e.sp) + ')');
  ok(e && e.tS === '0947', 'P0-01 卖出时刻=真正碰到的那一分钟 09:47 (got ' + (e && e.tS) + ')');
  ok(e && e.partial, 'P0-01 引擎输入含正在走的那根');
  ok(L.keys.sell1, 'P0-01 卖出提醒键 sell1 由引擎发出');
}
// ---------- P0-02 快照日高高出所有已走完K线 → 并进正在走的那根(接口没给未完成根也能触发) ----------
{
  const G = setup('09:47');
  const L = G.LIVE;
  L.bars = bars(DAY, [['0935', 10, 10.02, 9.95, 10.0], ['0940', 10, 10.03, 9.98, 10.01], ['0945', 10.01, 10.02, 9.99, 10.0]]);
  L.hist.m5 = L.bars; L.last = 10.04; L.hi = 10.09; L.lo = 9.95;
  G.liveCompute();
  ok(L.eng && L.eng.sp === 10.06, 'P0-02 快照日高10.09并入当前根 → 卖出 (got ' + (L.eng && L.eng.sp) + ')');
  ok(L.dhi === 10.09, 'P0-02 页面日高=10.09 实时');
  // 下一轮: 日高再涨 → 跟着变
  L.hi = 10.12; L.last = 10.11; G.__setNow('2026-11-02T09:48:00+08:00'); L.ts = DAY + '094800';
  G.liveCompute();
  ok(L.dhi === 10.12, 'P0-02 日高随行情更新到10.12');
}
// ---------- P0-03 / P0-04 反弹线只用卖后低点, 卖后创新低线下移 ----------
{
  const G = setup('10:12');
  const L = G.LIVE;
  // 09:35 先探 9.80(卖出前), 09:40 冲 10.10 卖在 9.99+0.06=… 用无IV区: ref=开盘10.00 → 卖目标 10.06
  L.bars = bars(DAY, [['0935', 10, 10.0, 9.80, 9.85], ['0940', 9.85, 10.10, 9.85, 10.06], ['0945', 10.06, 10.06, 9.95, 9.97], ['0950', 9.97, 9.99, 9.96, 9.98],
    ['0955', 9.98, 9.98, 9.90, 9.92], ['1000', 9.92, 9.95, 9.91, 9.93], ['1005', 9.93, 9.94, 9.88, 9.90], ['1010', 9.90, 9.95, 9.89, 9.94]]);
  L.hist.m5 = L.bars; L.last = 9.95; L.hi = 10.10; L.lo = 9.80;
  L.pts = mins([['0936', 9.9, 9.85, 9.86], ['0937', 10.0, 9.86, 9.99], ['0938', 10.10, 9.99, 10.08], ['0939', 10.08, 9.93, 9.94], ['0940', 10.06, 9.94, 10.06]]);
  G.liveCompute();
  const e = L.eng;
  ok(e && e.sp === 10.06 && e.tS === '0940', 'P0-03 0940根卖出10.06');
  ok(e && e.sp !== null && e.runLow === 9.88, 'P0-04 卖后最低=9.88(不含卖出前全天最低9.80) (got ' + (e && e.runLow) + ')');
  ok(G.rebLineJL(e) === 10.03, 'P0-04 反弹线=9.88+0.15=10.03 (got ' + G.rebLineJL(e) + ')');
  // 卖出那一分钟之后的低点也算: 只看到0940之前的数据时(0939 低9.93)
  const G2 = setup('09:39'); const L2 = G2.LIVE;
  L2.bars = bars(DAY, [['0935', 10, 10.0, 9.80, 9.85]]); L2.hist.m5 = L2.bars; L2.last = 9.94; L2.hi = 10.10; L2.lo = 9.80;
  L2.pts = mins([['0936', 9.9, 9.85, 9.86], ['0937', 10.0, 9.86, 9.99], ['0938', 10.10, 9.99, 10.08], ['0939', 10.08, 9.93, 9.94]]);
  G2.liveCompute();
  ok(L2.eng && L2.eng.sp === 10.06 && L2.eng.tS === '0938', 'P0-04 盘中09:38碰到卖目标 → 当即卖出 (got ' + (L2.eng && L2.eng.sp) + '@' + (L2.eng && L2.eng.tS) + ')');
  ok(L2.eng && L2.eng.runLow === 9.93, 'P0-04 卖出那一分钟之后的低点9.93立刻进反弹线 (got ' + (L2.eng && L2.eng.runLow) + ')');
}
// ---------- P0-05 买回提醒=引擎买回, 不另算; 触发后不收回 ----------
{
  const G = setup('10:12');
  const L = G.LIVE;
  // 反弹线须比卖价低 0.05(保本) 才生效: 卖10.06 → 卖后低要到 9.86 以下
  L.bars = bars(DAY, [['0935', 10, 10.0, 9.80, 9.85], ['0940', 9.85, 10.10, 9.85, 10.06], ['0945', 10.06, 10.06, 9.95, 9.97], ['0950', 9.97, 9.99, 9.96, 9.98],
    ['0955', 9.98, 9.98, 9.90, 9.92], ['1000', 9.92, 9.95, 9.91, 9.93], ['1005', 9.93, 9.94, 9.78, 9.80], ['1010', 9.80, 9.85, 9.79, 9.84]]);
  L.hist.m5 = L.bars; L.hi = 10.10; L.lo = 9.78;
  L.pts = mins([['1011', 9.88, 9.84, 9.88], ['1012', 9.95, 9.88, 9.95]]);
  L.last = 9.95;
  G.liveCompute();
  const e = L.eng;
  ok(e && e.rounds.length === 1 && e.rounds[0].bp === 9.93 && e.rounds[0].bWhy === '低点反弹', 'P0-05 现价9.95≥反弹线9.93 → 引擎买回9.93 (got ' + JSON.stringify(e && e.rounds[0]) + ')');
  ok(L.keys.buy1 && !Object.keys(L.keys).some(k => /^(touch|stouch)/.test(k)), 'P0-05 只有引擎的 buy1, 没有另算的 touch/stouch');
  ok(L.latch.B1 && L.latch.B1.px === 9.93, 'P0-05 正在走那根的买回已记住');
  // 下一轮同一根内价格掉回 9.85(还创了新低): 已发出的买回不收回
  L.last = 9.85; L.pts.push({ hm: '1013', p: 9.85, h: 9.95, l: 9.76 }); G.__setNow('2026-11-02T10:13:00+08:00'); L.ts = DAY + '101300';
  G.liveCompute();
  ok(L.eng.rounds.length === 1 && L.eng.rounds[0].bp === 9.93, 'P0-05 同一根回落后仍按已买回 (got ' + L.eng.rounds.length + ')');
  const src = fs.readFileSync(path.join(__dirname, '..', 'jl_zp_war.html'), 'utf8');
  ok(!/runLowF/.test(src) && !/id: 'touch'/.test(src) && !/id: 'stouch'/.test(src), 'P0-05 源码里另一套预触口径已删');
}
// ---------- P0-06 断链/滞后: 不拿旧K线算, 不发提醒 ----------
{
  const G = setup('10:30');
  const L = G.LIVE;
  L.bars = bars(DAY, [['0935', 10, 10.08, 9.95, 10.0]]); L.hist.m5 = L.bars; L.last = 10.0; L.hi = 10.08; L.lo = 9.95;
  L.err = '5分K断链 · 已暂停计算(旧K线不参与决策)'; L.eng = null;
  G.liveCompute();
  ok(L.eng === null && Object.keys(L.keys).length === 0, 'P0-06 断链时不计算不提醒');
  const src = fs.readFileSync(path.join(__dirname, '..', 'jl_zp_war.html'), 'utf8');
  ok(/if \(!qtOk\) \{/.test(src), 'P0-06 本轮快照缺席就按K线重推现价(不再停在旧值)');
  ok(/got\.pts\.date !== LIVE\.sessDate/.test(src), 'P0-06 不是本交易日的分时不用');
}
// ---------- P0-07 切票: 代次+票代码隔离 ----------
{
  let resolveA;
  const G = load({ now: '2026-11-02T10:00:00+08:00', fetch: (u) => /sh600105/.test(u) && /m5/.test(u) ? new Promise(r => { resolveA = r; }) : new Promise(() => { }) });
  const L = G.LIVE;
  Object.assign(L, { sym: 'sh600105', sh: 400, on: true, fetching: false, gen: 1 });
  vm.runInContext('livePoll()', G);
  const genA = L.gen;
  vm.runInContext("LIVE.gen++; LIVE.sym='sz000001'; LIVE.pc=0;", G);   // 模拟切到新票
  resolveA({ json: () => ({ data: { sh600105: { m5: [['202611020935', '10', '10', '10.1', '9.9']], qt: { sh600105: ['', '', '', '10.5', '10.2', '10.3'] } } } }) });
  setTimeout(() => {
    ok(L.pc === 0, 'P0-07 旧票回包不写进新票的昨收/现价 (pc=' + L.pc + ')');
    const src = fs.readFileSync(path.join(__dirname, '..', 'jl_zp_war.html'), 'utf8');
    const poll = src.slice(src.indexOf('function livePoll()'), src.indexOf('LIVE.start = function'));
    ok((poll.match(/LIVE\.sym/g) || []).length === 1, 'P0-07 轮询里只在发起时读一次 LIVE.sym, 回包全用这个 sym');
    rest();
  }, 20);
}
function rest() {
  // ---------- P1-01 / P1-02 三轮: 每轮买回后下一轮参考价=买回价, 三轮后收工 ----------
  {
    const G = setup('15:10');
    const L = G.LIVE;
    G.__setNow('2026-11-02T15:10:00+08:00');
    // 平开10.00; 每轮: 冲高+0.06卖 → 跌0.25 → 反弹0.15买回
    const rows = []; let p = 10.0, t = 935;
    const nx = () => { const m = Math.floor(t / 100) * 60 + t % 100 + 5; t = Math.floor(m / 60) * 100 + m % 60; if (t > 1130 && t < 1305) t = 1305; };
    for (let k = 0; k < 4; k++) {
      rows.push([String(t).padStart(4, '0'), p, r2(p + 0.07), p, r2(p + 0.06)]); nx();          // 卖 ref+0.06
      rows.push([String(t).padStart(4, '0'), r2(p + 0.06), r2(p + 0.06), r2(p - 0.20), r2(p - 0.18)]); nx();   // 跌
      rows.push([String(t).padStart(4, '0'), r2(p - 0.18), r2(p - 0.02), r2(p - 0.19), r2(p - 0.03)]); nx();  // 反弹 → 买回 low+0.15
      p = r2(p - 0.05 + 0.0); rows.push([String(t).padStart(4, '0'), p, p, p, p]); nx();
    }
    L.bars = bars(DAY, rows); L.hist.m5 = L.bars; L.last = p; L.ts = DAY + '151000';
    G.liveCompute();
    const e = L.eng;
    ok(e.rounds.length === 3, 'P1-02 最多三轮 (got ' + e.rounds.length + ')');
    ok(e.rounds[1].sp === r2(e.rounds[0].bp + 0.06), 'P1-01 第二轮卖目标=第一轮买回价+0.06 (' + e.rounds[1].sp + ' vs ' + e.rounds[0].bp + ')');
    ok(e.sp === null, 'P1-02 三轮后不再开新卖');
    vm.runInContext('MODE="live"; renderBandLive();', G);
    ok(/今日收工/.test(G.__els.bMain.textContent), 'P1-02 状态带显示今日收工 (got ' + G.__els.bMain.textContent + ')');
    // 浮球
    const Z = loadBall();
    Z.st.live = { sh: 400, last: 10, roundsMax: 3, sessDate: DAY, bars: [1], eng: { sp: null, rounds: [1, 2, 3] } };
    ok(Z.t.ballState().b === '收工', 'BALL-09 三轮→球显示收工');
    Z.st.live.eng.rounds = [1, 2];
    ok(Z.t.ballState().b === '已买回', 'BALL-09 两轮→还没收工');
    Z.st.live.err = '行情接口无数据';
    ok(Z.t.ballState().b === '断链', 'BALL/P0-06 任何取数异常→球显示断链');
  }
  // ---------- P1-03 不足一手 ----------
  {
    const G = setup('10:00');
    ok(vm.runInContext("roundQtyJL('600105', 50)", G) === 0, 'P1-03 持仓50股→每轮0股');
    ok(vm.runInContext("roundQtyJL('600105', 1900)", G) === 400, 'P1-03 持仓1900股→每轮400(25%取整到手)');
    ok(vm.runInContext("roundQtyJL('603986', 100)", G) === 100, 'P1-03 兆易100股→100');
  }
  // ---------- 当天最后一根(15:00)不开新卖 ----------
  {
    const G = setup('15:10'); const L = G.LIVE;
    L.bars = bars(DAY, [['1455', 10, 10.0, 9.99, 10.0], ['1500', 10, 10.2, 10.0, 10.1]]); L.hist.m5 = L.bars; L.last = 10.1; L.open = 10;
    L.bars[0].o = 10;
    G.liveCompute();
    ok(L.eng.sp === null && !L.eng.rounds.length, '15:00 那根冲高不开新卖');
  }
  // ---------- 切票重置 ----------
  {
    const G = setup('10:00'); const L = G.LIVE;
    L.latch = { B1: { t: '1005' } }; L.keys = { sell1: { t: 1 } }; L.lastOk = 123;
    vm.runInContext("applyStockJL({ code: '603986', rc: 'sh603986', name: '兆易创新', qty: 100 })", G);
    ok(!Object.keys(L.latch).length && !Object.keys(L.keys).length && L.lastOk === 0, 'BALL-08/P0-07 切票清 latch/提醒/lastOk (浮球据 lastOk 重定基线)');
    ok(L.sym === 'sz603986' || L.sym === 'sh603986', '切票 sym=' + L.sym);
    ok(L.sh === 100, '兆易 100 股可做100');
  }
  // ---------- REPLAY 回放重跑同一套引擎 ----------
  {
    const G = setup('10:00'); const L = G.LIVE;
    G.__setNow('2026-11-01T12:00:00+08:00');   // 周日: 自检=上一交易日整天
    L.bars = bars(DAY, [['0935', 10, 10.0, 9.80, 9.85], ['0940', 9.85, 10.10, 9.85, 10.06], ['0945', 10.06, 10.06, 9.95, 9.97], ['0950', 9.97, 9.99, 9.90, 9.92],
      ['0955', 9.92, 9.93, 9.88, 9.90], ['1000', 9.90, 10.06, 9.89, 10.05]]);
    L.hist.m5 = L.bars; L.last = 10.05; L.hi = 10.10; L.lo = 9.80;
    vm.runInContext('MODE="live"; INJL=true;', G);
    G.liveCompute();
    const full = JSON.stringify(L.eng.rounds);
    vm.runInContext('rplEnterJL();', G);
    const R = vm.runInContext('RPL', G);
    ok(R && R.bars.length === 6, 'REPLAY-03 回放拿到6根真实5分K');
    vm.runInContext('rplShowJL(1)', G);
    ok(R.eng.sp === 10.06 && R.eng.runLow === 10.06, 'REPLAY-05 第2根: 刚卖出, 反弹线未动 (runLow=' + R.eng.runLow + ')');
    vm.runInContext('rplShowJL(3)', G);
    ok(R.eng.runLow === 9.90 && R.eng.dl === 9.80 && R.eng.dh === 10.10, 'REPLAY-04/05 第4根: 卖后低9.90, 日低9.80日高10.10');
    vm.runInContext('rplShowJL(4)', G);
    ok(R.eng.runLow === 9.88, 'REPLAY-05 第5根: 再创新低 → 反弹线下移到 ' + r2(R.eng.runLow + 0.15));
    vm.runInContext('rplShowJL(5)', G);
    ok(JSON.stringify(R.eng.rounds) === full, 'REPLAY-03 回放到最后=实盘引擎同结果');
    ok(L.eng && JSON.stringify(L.eng.rounds) === full && L.bars.length === 6, 'REPLAY 回放不改实盘状态');
    vm.runInContext("applyStockJL({ code: '603986', rc: 'sh603986', name: '兆易创新', qty: 100 })", G);
    ok(vm.runInContext('RPL', G) === null, 'REPLAY-06 切票退出回放');
  }
  // ---------- 缺口台账 ↔ 作战屏 ----------
  {
    let fed = null;
    const parent = { jlResoCodesJL: () => [], jlCollectGapsJL: (c, lv) => { fed = { c, lv: lv.map(x => x[0]) }; } };
    const G = load({ now: '2026-11-02T10:30:00+08:00', parent });
    const L = G.LIVE;
    vm.runInContext("INJL=true; STK={code:'600105',name:'永鼎股份',qty:1900};", G);
    Object.assign(L, { sessDate: DAY, last: 22.0, pc: 21.75, hi: 22.3, lo: 21.6, dhi: 22.3, dlo: 21.6 });
    G.localStorage.setItem('jl_gaplog_v1', JSON.stringify({
      a: { c: '600105', lv: '日', dr: -1, lo: 22.62, hi: 23.63, ct: '2026-10-30', ft: '' },          // 上方需涨补, 未补
      b: { c: '600105', lv: '30分', dr: -1, lo: 22.9, hi: 23.1, ct: '2026-10-30 10:30', ft: '' },    // 与 a 重叠 → 合并
      c: { c: '600105', lv: '5分', dr: 1, lo: 21.5, hi: 21.7, ct: '2026-10-30 14:00', ft: '' },      // 下方需跌补, 今天日低21.6未到21.5 → 留
      d: { c: '600105', lv: '1分', dr: -1, lo: 22.1, hi: 22.2, ct: '2026-10-30 14:10', ft: '' },     // 需涨补到22.2, 今天日高22.3已碰 → 划掉
      e: { c: '600105', lv: '日', dr: 1, lo: 21.0, hi: 21.2, ct: '2026-10-29', ft: '2026-10-30 10:00' }, // 已补
      f: { c: '603986', lv: '日', dr: 1, lo: 21.9, hi: 22.1, ct: '2026-10-29', ft: '' }                // 别的票
    }));
    const g = vm.runInContext('ledgerGapsJL(22.0)', G);
    ok(g.length === 2, '台账: 只留本票未补且今天没碰到远沿的缺口 (got ' + g.length + ')');
    ok(g.some(x => x.lo === 22.62 && x.hi === 23.63 && x.lvs.join() === '日,30分'), '台账: 重叠的日/30分缺口并成一条');
    L.err = null; vm.runInContext('ledgerFeedJL()', G);
    ok(fed && fed.c === '600105' && fed.lv.join() === '日,30分,15分,5分,1分', '台账: 作战屏把实时日/30/15/5/1分K交给台账写入器');
  }
  // ---------- 浮球: 首条提醒也弹 ----------
  {
    const Z = loadBall();
    const now = Date.now();
    const W = { LIVE: { sym: 'sh600105', lastOk: 1, keys: { open: { t: now - 3600e3, a: 0 }, sell1: { t: now - 5000, a: 1 } }, last: 10.06, eng: { lowOpen: false, sp: 10.06, rounds: [] }, sh: 400, bars: [1], sessDate: DAY } };
    Z.frame.contentWindow = W;
    Z.t.pollStatus();
    ok(Z.st.flash && Z.st.flash.k === 'sell', 'BALL-10 球首次定基线时, 战屏刚响过的第一条卖出照样弹 (flash=' + JSON.stringify(Z.st.flash && Z.st.flash.k) + ')');
    W.LIVE.keys.buy1 = { t: Date.now(), a: 1 };
    Z.t.pollStatus();
    ok(Z.st.flash && Z.st.flash.k === 'buy' && Z.st.flash.bnc === 1, 'BALL-05/07 买回=绿色弹跳, 与卖出分开');
  }
  console.log('zp: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' 全过'));
  process.exit(fail ? 1 : 0);
}
function loadBall() {
  const els = {};
  const frame = { contentWindow: null };
  const mk = id => ({ id, style: {}, dataset: {}, attrs: {}, className: '', innerHTML: '', setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute() { }, addEventListener() { }, appendChild() { } });
  const doc = { readyState: 'loading', addEventListener() { }, getElementById: id => id === 'jlZpFrameJL' ? frame : (els[id] || null), head: mk('h'), body: mk('b'), createElement: mk };
  const win = { document: doc, Date, Math, JSON, setTimeout: () => 0, setInterval: () => 0, localStorage: { getItem: () => null, setItem() { } }, navigator: {}, console, addEventListener() { }, String, Number, Object };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'jl_zhanping.js'), 'utf8'), ctx);
  const st = ctx.JLZp._st; st.ball = mk('ball'); st.ready = false;
  return { st, t: ctx.JLZp._t, frame };
}
