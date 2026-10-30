// jl-req1 回归: 统一请求层 限速/并发/熔断/备口/半开探路/放弃丢弃/非目标主机直通。纯逻辑模拟, 不发真实请求
const fs = require('fs'), path = require('path');
let OFF = 0; const RN = Date.now; Date.now = () => RN() + OFF;
global.location = { href: 'https://fululi.github.io/jinlin/' };
global.localStorage = { s: {}, getItem(k) { return this.s[k] || null; }, setItem(k, v) { this.s[k] = String(v); } };
class Ev { constructor(t) { this.type = t; } }
global.Event = Ev;
class N { appendChild(el) { el.parentNode = this; (global.APPENDED = global.APPENDED || []).push(el); return el; } insertBefore(el) { return this.appendChild(el); } removeChild(el) { el.parentNode = null; return el; } }
global.Node = N;
class El extends N { constructor(t) { super(); this.tagName = t; this.L = {}; } addEventListener(k, f) { (this.L[k] = this.L[k] || []).push(f); } removeEventListener(k, f) { this.L[k] = (this.L[k] || []).filter(x => x !== f); }
  dispatchEvent(e) { (this.L[e.type] || []).slice().forEach(f => f(e)); if (this['on' + e.type]) this['on' + e.type](e); } }
const head = new N();
global.document = { head, createElement: t => new El(t.toUpperCase()) };
let MODE = {}; const CALLS = [];
global.window = global;
window.fetch = (u) => { const host = new URL(u).hostname; CALLS.push({ u, t: Date.now(), host }); const m = MODE[host] || 'ok';
  return new Promise((res, rej) => setTimeout(() => m === 'ok' ? res({ ok: true, status: 200, json: async () => ({ u }) }) : m === '501' ? res({ ok: false, status: 501 }) : rej(new TypeError('Failed to fetch')), 30)); };
global.setInterval = () => 0;
eval(fs.readFileSync(path.join(__dirname, '..', 'jl_req.js'), 'utf8'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // 1 限速: 同主机间隔≥100ms
  CALLS.length = 0;
  await Promise.all([1, 2, 3, 4, 5].map(i => fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?i=' + i)));
  const gaps = CALLS.slice(1).map((c, i) => c.t - CALLS[i].t);
  ok(gaps.every(g => g >= 95), '1 东财间隔≥100ms ' + gaps);
  // 2 非目标主机直通不排队
  CALLS.length = 0; await fetch('https://fululi.github.io/x.json'); ok(CALLS.length === 1, '2 直通');
  // 3 熔断: push2his 连续4次失败 → 第5个 资金流请求改走 push2delay, 非资金流请求立即失败
  MODE['push2his.eastmoney.com'] = 'fail';
  for (let i = 0; i < 4; i++) await fetch('https://push2his.eastmoney.com/api/qt/stock/kline/get?n=' + i).catch(() => 0);
  ok(jlReq.isOpen('push2his.eastmoney.com'), '3a 熔断打开');
  ok(!jlReq.isOpen('https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get'), '3a2 同主机别的接口不受连累');
  for (let i = 0; i < 4; i++) await fetch('https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?f=' + i).catch(() => 0);
  CALLS.length = 0;
  const r = await fetch('https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?secid=1.600105');
  ok(CALLS.length === 1 && CALLS[0].host === 'push2delay.eastmoney.com' && r.ok, '3b 资金流改走备口');
  CALLS.length = 0; const t0 = Date.now(); let e3 = null;
  await fetch('https://push2his.eastmoney.com/api/qt/stock/kline/get?x=1').catch(e => e3 = e);
  ok(e3 && /熔断/.test(e3.message) && CALLS.length === 0 && Date.now() - t0 < 200, '3c 无备口立即失败不发请求');
  // 4 HTTP 501 也算失败
  MODE['web.ifzq.gtimg.cn'] = '501';
  for (let i = 0; i < 4; i++) await fetch('https://web.ifzq.gtimg.cn/a?i=' + i);
  ok(jlReq.isOpen('web.ifzq.gtimg.cn'), '4 HTTP501计失败并熔断');
  // 5 冷却到点只放一个探路; 探路成功即恢复
  MODE['push2his.eastmoney.com'] = 'ok'; OFF += 61000; CALLS.length = 0;
  const ps = [1, 2, 3].map(i => fetch('https://push2his.eastmoney.com/api/qt/stock/kline/get?p=' + i).then(() => 'ok', () => 'fast'));
  const out = await Promise.all(ps);
  ok(CALLS.filter(c => c.host === 'push2his.eastmoney.com').length >= 1 && out[0] === 'ok', '5a 探路放行 ' + out);
  ok(!jlReq.isOpen('push2his.eastmoney.com'), '5b 探路成功后恢复');
  // 6 探路失败 → 再冷却
  MODE['push2.eastmoney.com'] = 'fail';
  for (let i = 0; i < 4; i++) await fetch('https://push2.eastmoney.com/z?i=' + i).catch(() => 0);
  MODE['push2delay.eastmoney.com'] = 'fail';
  for (let i = 0; i < 4; i++) await fetch('https://push2delay.eastmoney.com/z?i=' + i).catch(() => 0);
  OFF += 61000; await fetch('https://push2.eastmoney.com/z?probe').catch(() => 0);
  ok(jlReq.isOpen('push2.eastmoney.com'), '6 探路失败重新熔断');
  // 7 JSONP: 调用方已删回调 → 不发; 熔断主机 → 立即触发 onerror
  global.APPENDED = [];
  OFF += 61000; MODE = {};
  window.cbGone = undefined;
  const s1 = document.createElement('script'); s1.src = 'https://push2.eastmoney.com/api?cb=cbGone'; head.appendChild(s1);
  await sleep(250);
  ok(!APPENDED.includes(s1), '7a 回调已删不再发');
  for (let i = 0; i < 4; i++) { const s = document.createElement('script'); window['cbx' + i] = () => 0; s.src = 'https://push2.eastmoney.com/api?cb=cbx' + i; head.appendChild(s); await sleep(130); s.dispatchEvent(new Ev('error')); }
  ok(jlReq.isOpen('push2.eastmoney.com'), '7b 脚本错误计入熔断');
  let fired = false; window.cby = () => 0;
  const s2 = document.createElement('script'); s2.src = 'https://push2.eastmoney.com/api?cb=cby&x=2'; s2.onerror = () => { fired = true; };
  head.appendChild(s2); await sleep(250);
  ok(APPENDED.includes(s2) && /push2delay/.test(s2.src) && !fired, '7c 主口熔断→脚本改走备口');
  s2.dispatchEvent(new Ev('error'));
  for (let i = 0; i < 3; i++) { const s = document.createElement('script'); window['cbd' + i] = () => 0; s.src = 'https://push2delay.eastmoney.com/api?cb=cbd' + i; head.appendChild(s); await sleep(130); s.dispatchEvent(new Ev('error')); }
  let fired2 = false; window.cbz = () => 0; APPENDED = [];
  const s3 = document.createElement('script'); s3.src = 'https://push2.eastmoney.com/api?cb=cbz'; s3.onerror = () => { fired2 = true; };
  head.appendChild(s3); await sleep(250);
  ok(fired2 && !APPENDED.includes(s3), '7d 主备都熔断→不发且立即onerror(调用方马上走腾讯兜底)');
  // 8 统计
  const st = jlReq.stats();
  ok(st['push2his.eastmoney.com'].alt >= 1 && st['push2his.eastmoney.com'].fast >= 1 && st['push2.eastmoney.com'].drop >= 1, '8 统计');
  console.log('req', pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
