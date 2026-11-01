// 做T作战屏(jl_zp_war.html) Node 载入器: 假 DOM + 可控时钟, 把页面脚本跑在 vm 里, 返回其全局(LIVE/runEngine/liveKeys...)
const fs = require('fs'), path = require('path'), vm = require('vm');
function fakeEl(id) {
  const e = {
    id, children: [], style: {}, dataset: {}, attrs: {}, _cls: new Set(), innerHTML: '', textContent: '', value: '', hidden: false, className: '',
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, querySelector() { return fakeEl('q'); }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  return e;
}
function load(opts) {
  opts = opts || {};
  const els = {}, store = {};
  let NOW = new Date(opts.now || '2026-11-02T10:00:00+08:00').getTime();
  const RD = Date;
  class D2 extends RD { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const doc = {
    getElementById: id => els[id] || (els[id] = fakeEl(id)), createElementNS: (ns, n) => fakeEl(n), createElement: n => fakeEl(n),
    addEventListener() {}, head: fakeEl('head'), body: fakeEl('body'), documentElement: fakeEl('html'), querySelector: () => null
  };
  const win = {
    document: doc, Date: D2, Math, JSON, Promise, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    navigator: {}, console, Number, String, Object, Array, isFinite, parseFloat, RegExp, Error,
    fetch: opts.fetch || (() => new Promise(() => {}))
  };
  win.window = win; win.self = win;
  win.parent = opts.parent || win;
  const ctx = vm.createContext(win);
  const html = fs.readFileSync(path.join(__dirname, '..', opts.file || 'jl_zp_war.html'), 'utf8');
  const js = html.split('<script>')[1].split('</script>')[0];
  vm.runInContext(js + '\n;this.__G={LIVE:LIVE,runEngine:runEngine,liveKeys:liveKeys,liveCompute:liveCompute,zonesForLive:zonesForLive,applyStockJL:typeof applyStockJL!=="undefined"?applyStockJL:null};', ctx, { filename: 'zp' });
  ctx.__els = els; ctx.__store = store; ctx.__setNow = t => { NOW = new Date(t).getTime(); };
  return ctx;
}
// 5分K: [hm, o, h, l, c] → {t, o, h, l, c}
function bars(day, rows) { return rows.map(r => ({ t: day + r[0], o: r[1], h: r[2], l: r[3], c: r[4] })); }
module.exports = { load, bars };
