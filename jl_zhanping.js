/* jl_zhanping.js v4 — 做T作战屏 · 浮球壳 (2026-11-01)
 * 11-12 用户: 首页全局 *{animation:none!important} 省电规则把浮球触发闪也误杀了
 *   → 四条事件动画(等买回脉冲/触发弹跳/首现脉冲/提醒金环)加!important白名单; 平时全站动画照旧关闭省电。
 * v4.2 (jl-zp4, 本地未推): ①任何取数异常球都显示"断链·已停算" ②首次定基线时, 战屏90秒内真响过的提醒照样弹 ③面板改载 jl_zp_war.html(原中文文件名改英文, 部署/编码不出岔)。
 * v4.1: ①真弹跳(卖出红/买回绿/共振金, 球面闪字20秒) ②第一次触发(0→1)也弹跳(旧版只在已有提醒时才响应) ③到共振位接jlreso:near ④三轮即收工(原写死4轮) ⑤5分K断链/滞后球显示"断链"。
 * v4: ①球面直接反映"是否触发"(未触发/已触发·等买回/已买回/收工, 边框灰/红脉冲/绿/橙) ②z-index拉到最高+每3秒自检, 球或面板被页面重绘移除就补回 ③file://打开时iframe跨域读不到持仓, 面板底部明确提示改用http(s)打开。
 * v3: 股票动态跟持仓——面板内可切换持仓股票(战屏自带切换条), 球面 title/数量跟着 iframe 当前票走; 原 v2 写死永鼎600105 作废。
 * 原则(用户口径): 原来做好的 做T作战屏.html 原样搬进 jinlin, 零改动零重写。
 * 本文件只做"壳": ①可拖浮球(松手停原地, 位置存 jl_zp_ball_v1, 点按开/关面板) ②面板=iframe 原样加载根目录 做T作战屏.html(整页布局/引擎/计划/回放/提醒/样式全部原样, 本文件零触碰其内部)。
 * 联动: iframe 同源, 球每2秒只读其 LIVE(引擎状态/现价/已触发提醒数) 刷新球面; 球 title 挂页面持仓(jlHoldQtyJL); 战屏数据链(腾讯/东财双源)与持仓页同市场同数, 分时高低/收盘数字天然一致。
 * 提醒: 战屏自己的蜂鸣/震动/横幅在 iframe 内照常(面板关着 iframe 也活着, 盯盘不停); 球上角标=未读提醒数(点开清零), 有新提醒球金环闪。
 * 联动球(jl_linkball)互不干扰, 两球并存持仓页。
 * 回滚: 删 index.html 里引用本文件的一段 script + 删根目录 做T作战屏.html(即恢复原样)。
 */
(function () {
  var SRC = 'jl_zp_war.html';
  /* 当前票: iframe 战屏切换后以其 window.STK 为准; 未加载时取持仓第一只(jlResoCodesJL 同源顺序) */
  function curStk() {
    try { var w = st.win; if (w && w.STK && w.STK.code) return w.STK; } catch (e) { }
    try {
      var cs = window.jlResoCodesJL && window.jlResoCodesJL();
      if (cs && cs.length) return cs[0];
    } catch (e) { }
    return { code: '', name: '' };
  }
  var BP = 'jl_zp_ball_v1';
  var UP = '#ff5459', DN = '#1fdc93', MID = '#8fa8b3', GOLD = '#e8c37a';
  var st = { open: false, ball: null, pos: null, badge: 0, keysN: 0, live: null, err: '' };

  function $(id) { return document.getElementById(id); }
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  /* ---------- 样式 ---------- */
  var CSS = '#jlZpBallJL{position:fixed;z-index:2147483000;width:58px;height:58px;border-radius:50%;cursor:pointer;touch-action:none;' +
    'background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.20),rgba(15,24,40,.72) 60%);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
    'border:1.5px solid rgba(232,195,122,.55);box-shadow:0 0 0 3px rgba(232,195,122,.16),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL .bt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;pointer-events:none}' +
    '#jlZpBallJL .bt b{font-size:13px;font-weight:800;color:#f4ead2}#jlZpBallJL .bt span{font-size:8.5px;color:#c3d0e2}' +
    /* 11-13 用户: 球上提示字太小看不清、也不说哪只票 → 提醒时球横向撑成胶囊: 第一行 票名·卖出!/RSO, 第二行 价/内容, 字放大 */
    '#jlZpBallJL.wide{width:auto;min-width:58px;max-width:min(78vw,280px);padding:0 16px;border-radius:29px}' +
    '#jlZpBallJL.wide .bt{position:static;height:100%;white-space:nowrap}#jlZpBallJL.wide .bt b{font-size:14px}#jlZpBallJL.wide .bt span{font-size:12px;font-weight:500;color:#fff;overflow:hidden;max-width:100%;white-space:normal;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}#jlZpBallJL.wide{height:auto;min-height:58px;padding:6px 16px}' +
    '#jlZpBallJL i{position:absolute;right:1px;top:1px;min-width:13px;height:13px;border-radius:7px;border:2px solid #0f1828;font:700 8px/9px -apple-system,sans-serif;color:#10202a;text-align:center;font-style:normal;display:none}' +
    '#jlZpBallJL.badge i{display:block;background:' + GOLD + '}' +
    '#jlZpBallJL[data-k=idle]{border-color:rgba(143,168,179,.75)}' +
    '#jlZpBallJL[data-k=done]{border-color:#1fdc93;box-shadow:0 0 0 3px rgba(31,220,147,.22),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL[data-k=warn]{border-color:#ffb84d;box-shadow:0 0 0 3px rgba(255,184,77,.22),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL[data-k=trig]{border-color:#ff5459;box-shadow:0 0 0 3px rgba(255,84,89,.28),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL[data-k=trig]:not(.ring):not(.attn){animation:jlZpTrig 1.4s ease-in-out infinite!important}@keyframes jlZpTrig{50%{box-shadow:0 0 0 9px rgba(255,84,89,.30),0 5px 20px rgba(0,0,0,.5)}}' +
    '#jlZpSheetJL[data-err=file]::after{content:"当前是 file:// 打开, 战屏与持仓页被浏览器隔离, 读不到持仓。请用 http(s) 地址打开 index.html";position:absolute;left:10px;right:10px;bottom:10px;z-index:3;padding:9px 11px;border-radius:10px;background:#3a2a10;border:1px solid #ffb84d;color:#ffe2b0;font:600 12px/1.45 -apple-system,sans-serif}' +
    '#jlZpBallJL.bnc{animation:jlZpBnc .9s cubic-bezier(.3,.7,.4,1) 4!important}@keyframes jlZpBnc{0%,100%{transform:translateY(0) scale(1)}30%{transform:translateY(-22px) scale(1.12)}55%{transform:translateY(0) scale(.94)}75%{transform:translateY(-9px) scale(1.04)}}' +
    '#jlZpBallJL[data-k=sell]{border-color:#ff5459;box-shadow:0 0 0 5px rgba(255,84,89,.35),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL[data-k=buy]{border-color:#1fdc93;box-shadow:0 0 0 5px rgba(31,220,147,.35),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL[data-k=reso]{border-color:#e8c37a;box-shadow:0 0 0 5px rgba(232,195,122,.38),0 5px 20px rgba(0,0,0,.5)}' +
    '#jlZpBallJL.attn{animation:jlZpAttn 1.6s ease-in-out 4!important}@keyframes jlZpAttn{50%{transform:scale(1.22);box-shadow:0 0 0 8px rgba(232,195,122,.30),0 5px 20px rgba(0,0,0,.5)}}' +
    '#jlZpBallJL.ring{animation:jlZpRing 1s ease-in-out 3!important}@keyframes jlZpRing{50%{box-shadow:0 0 0 6px rgba(232,195,122,.35),0 4px 18px rgba(0,0,0,.45)}}' +
    /* 11-08 用户: 浮动球页面卡面别死黑 → 半透明轻磨砂(同持仓卡), 战屏页面本身透明(jl_zp_war.html body.injlin) */
    /* 11-09晚 用户: 作战屏背景灰蒙蒙 → 恢复用户03:00在线上自己改的深蓝实底 #0d1730→#091024, 不透明不磨砂(半透明会把首页透成灰) */
    '#jlZpSheetJL{position:fixed;z-index:2147482999;top:52px;right:8px;width:min(96vw,430px);height:min(86vh,720px);background:linear-gradient(160deg,#0d1730,#091024);-webkit-backdrop-filter:none;backdrop-filter:none;border:1px solid rgba(120,160,255,.22);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden}' +
    '#jlZpSheetJL iframe{width:100%;height:100%;border:0;display:block;background:transparent;color-scheme:dark}' +
    '#jlZpSheetJL .zx{position:absolute;right:7px;top:7px;z-index:2;width:26px;height:26px;border-radius:50%;background:rgba(15,24,42,.85);border:1px solid #2a3a55;color:#cfd8e6;font:700 13px/24px -apple-system,sans-serif;text-align:center;cursor:pointer;touch-action:manipulation}' +
    '#jlZpSheetJL .zx:active{background:rgba(42,58,85,.9)}' +
    /* 11-13夜 用户: 作战屏能放大缩小、放大要清楚 → ✕ 左边两个小圆标 − / +; 整个 iframe 按比例矢量放大(布局不变, 字/图不糊) */
    '#jlZpSheetJL .zz{position:absolute;top:9px;z-index:2;width:22px;height:22px;border-radius:50%;background:rgba(15,24,42,.55);border:1px solid rgba(255,255,255,.45);color:#fff;font:500 14px/20px ui-rounded,-apple-system,sans-serif;text-align:center;cursor:pointer;user-select:none;touch-action:manipulation}' +
    '#jlZpSheetJL .zz:active{background:rgba(42,58,85,.9)}' +
    '#jlZpSheetJL .zzT{position:absolute;top:12px;z-index:2;font:500 10px/16px ui-rounded,-apple-system,sans-serif;color:#fff;pointer-events:none;opacity:0;transition:opacity .3s}' +
    '#jlZpSheetJL .zzT.on{opacity:1}' +
    '#jlZpSheetJL iframe{transform-origin:0 0}' +
    /* 11-16 用户: 今日提醒 —— 每条都记(本机, 刷新不丢), 合并重复; 只闪要动手的(⚙ 每类可改) */
    '#jlZpSheetJL .tdB{position:absolute;top:9px;right:126px;z-index:4;height:22px;padding:0 9px;border-radius:11px;background:rgba(15,24,42,.55);border:1px solid rgba(255,255,255,.45);color:#fff;font:500 11.5px/20px -apple-system,sans-serif;cursor:pointer;user-select:none;touch-action:manipulation}' +
    '#jlZpSheetJL .tdB.on{background:rgba(232,195,122,.25);border-color:#e8c37a}' +
    '#jlZpTdJL{position:absolute;left:0;right:0;top:38px;bottom:0;z-index:3;overflow:auto;-webkit-overflow-scrolling:touch;padding:6px 12px 16px;background:linear-gradient(160deg,rgba(13,23,48,.98),rgba(9,16,36,.98));color:#fff;font:12.5px/1.5 -apple-system,"PingFang SC",sans-serif}' +
    '#jlZpTdJL .hd{display:flex;justify-content:space-between;align-items:center;margin:2px 0 7px}#jlZpTdJL .hd b{font-weight:500;font-size:13.5px}#jlZpTdJL .hd span{font-size:11px;opacity:.85}' +
    '#jlZpTdJL .ch{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}#jlZpTdJL .ch span{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);cursor:pointer}#jlZpTdJL .ch span.on{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.45)}#jlZpTdJL .ch span.mu{opacity:.6}' +
    '#jlZpTdJL .r{display:grid;grid-template-columns:42px 1fr auto;gap:6px;align-items:start;padding:5px 0;border-top:1px solid rgba(255,255,255,.08);cursor:pointer}#jlZpTdJL .r .t{font-size:11.5px;opacity:.85}#jlZpTdJL .r .x{font-size:11px;background:rgba(255,255,255,.12);border-radius:6px;padding:0 5px}' +
    '#jlZpTdJL .r .d{grid-column:2/4;font-size:11.5px;opacity:.85;display:none}#jlZpTdJL .r.op .d{display:block}' +
    '#jlZpTdJL .k-买卖{color:#ff7a80}#jlZpTdJL .k-买卖.b{color:#2fe39b}#jlZpTdJL .k-日级,#jlZpTdJL .k-资金{color:#ffd21f}#jlZpTdJL .k-共振位{color:#4ff0ff}#jlZpTdJL .k-共振{color:#e870e8}' +
    '#jlZpTdJL .st{display:grid;grid-template-columns:1fr auto;gap:5px 10px;font-size:12px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.15)}#jlZpTdJL .st i{font-style:normal;font-size:11px;padding:1px 8px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.08)}#jlZpTdJL .st i.on{background:rgba(47,227,155,.22);color:#2fe39b}' +
    '#jlZpTdJL .em{opacity:.8;font-size:12px;padding:14px 0}' +
    '#jlZpTdJL .tb{display:flex;gap:6px;margin:0 0 8px}#jlZpTdJL .tb button{flex:1;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;font:500 12.5px -apple-system,sans-serif}#jlZpTdJL .tb button.on{background:rgba(232,195,122,.22);border-color:#e8c37a}';
  function styleOnce() { if (!$('jlZpCssJL')) { var s = document.createElement('style'); s.id = 'jlZpCssJL'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ---------- 浮球 ---------- */
  function place() {
    var b = st.ball; if (!b) return;
    /* 11-07 用户: 球找不到了(拖出屏/换屏宽后卡在可视区外) → 位置钳进当前屏幕, 至少露出整个球 */
    var vw = window.innerWidth || 375, vh = window.innerHeight || 667, bw = b.offsetWidth || 60, bh = b.offsetHeight || 60;
    if (st.pos && st.pos.l != null) { st.pos.l = Math.min(Math.max(0, +st.pos.l || 0), vw - bw); st.pos.t = Math.min(Math.max(0, +st.pos.t || 0), vh - bh); }
    else if (st.pos) { st.pos.b = Math.min(Math.max(0, Number(st.pos.b) || 150), vh - bh); }
    if (st.pos && st.pos.l != null) { b.style.left = st.pos.l + 'px'; b.style.top = st.pos.t + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto'; }
    else { b.style.left = 'auto'; b.style.top = 'auto'; b.style.right = '8px'; b.style.bottom = ((st.pos && Number(st.pos.b)) || 150) + 'px'; }
  }
  function ballState() {
    var L = st.live;
    if (st.err === 'file') return { b: '做T', t: '需http', p: '', k: 'warn' };
    if (st.err) return { b: '做T', t: '加载中', p: '', k: 'warn' };
    if (L && L.sh === 0) return { b: '不做T', t: '不足一手', p: '', k: 'idle' };
    if (!L) return { b: '做T', t: '启动', p: '', k: 'idle' };
    try {
      var p = L.last > 0 ? f2(L.last) : '', RM = L.roundsMax || 3;
      if (L.err) return { b: '断链', t: '已停算', p: '', k: 'warn' };   /* jl-zp4: 任何取数异常都停算(原来只认"断链/滞后"字样, "行情接口无数据"时球还显示旧状态) */
      var d = new Date(), ds = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      var today = L.sessDate === ds, pre = today ? '' : '自检·';
      if (!L.bars || !L.bars.length) return { b: '未触发', t: today ? '待开盘' : '拉数据', p: p, k: 'idle' };
      /* 11-13晚 用户: 浮球状态跟现行 尺子/小球(作战屏「下一步」那排 __RDJL.mk), 不再读旧引擎 LIVE.eng */
      try {
        var W = st.win, R = W && W.__RDJL, cs0 = curStk(), mk = R && (R.mk || (R.rd && R.rd.mk));
        if (mk && mk.length && (!R.code || !cs0.code || R.code === cs0.code)) {
          var lb0 = L.bars[L.bars.length - 1], hm0 = lb0 ? +String(lb0.t).slice(-4) : 0;
          var okL = mk.filter(function (m) { return m.ok && !m.proj && m.p > 0; }), nx = mk.filter(function (m) { return !m.ok && !m.proj && m.p > 0; })[0], la = okL[okL.length - 1];
          var nxs = nx ? (nx.n || '') + (nx.t === 's' ? '卖' : '接') + f2(nx.p) : '';
          if (hm0 >= 1500) return { b: '收工', t: pre + '今日收工', p: p, k: 'done' };
          if (!la) return { b: '未触发', t: pre + (nxs || '盯盘中'), p: '', k: 'idle' };
          if (la.t === 's') return { b: '已卖', t: pre + (nxs ? '等' + nxs : '等接'), p: '', k: 'trig' };
          return { b: '已接', t: pre + (nxs ? '等' + nxs : '等卖'), p: '', k: 'done' };
        }
      } catch (eR) { }
      /* 11-17 旧引擎删: 原 if (e) {...} 读 LIVE.eng 的分支去掉 */
      return { b: '未触发', t: pre + '盯盘中', p: p, k: 'idle' };
    } catch (er) { return { b: '做T', t: '—', p: '', k: 'idle' }; }
  }
  function ballPaint() {
    var b = st.ball; if (!b) return;
    var s = ballState(), fl = st.flash && Date.now() < st.flash.until ? st.flash : null;
    if (fl) s = { b: (fl.nm ? fl.nm + ' · ' : '') + fl.b, t: fl.t, p: '', k: fl.k };
    b.className = (fl ? 'wide ' : '') + (fl && fl.bnc ? 'bnc ' : '') + (st.badge ? 'badge ' : '') + (b.dataset.ring === '1' ? 'ring ' : '') + (Date.now() < (st.attnT || 0) ? 'attn' : '');
    b.setAttribute('data-k', s.k || 'idle');
    b.innerHTML = '<div class="bt"><b>' + (s.b || '做T') + '</b><span>' + s.t + (s.p ? ' ' + s.p : '') + '</span></div><i>' + (st.badge > 9 ? '9+' : st.badge) + '</i>';
    try {
      var cs = curStk();
      b.title = '做T作战屏·' + s.b + (s.t ? '·' + s.t : '') + '(' + (cs.name || cs.code || '未加载') + ') · 持仓' + (Number(window.jlHoldQtyJL && window.jlHoldQtyJL(cs.code)) || 0) + '股(可切换)';
    } catch (e) { }
  }
  function ring() {
    var b = st.ball; if (!b) return;
    b.dataset.ring = '1'; ballPaint();
    setTimeout(function () { b.dataset.ring = ''; ballPaint(); }, 3200);
  }

  /* ---------- 面板(iframe 原样) ---------- */
  function toggleSheet() {
    st.open = !st.open;
    var sh = $('jlZpSheetJL'); if (!sh) return;
    sh.hidden = !st.open;
    if (st.open) { st.badge = 0; if (st.flash && st.flash.until === Infinity) st.flash = null; ballPaint(); }
  }

  /* ---------- 提醒: 弹跳 + 闪字(20秒) ---------- */
  function flash(kind, b, t) {
    /* 11-12夜 用户: 卖出!/买回! 一直亮到点开浮球(原20秒); 共振位/RSO等其它提醒仍20秒 */
    var keep = kind === 'sell' || kind === 'buy';
    if (!keep && st.flash && st.flash.until === Infinity) { ring(); return; }   /* 卖/买还没点开时, 别的提醒不盖掉它 */
    st.flash = { k: kind, b: b, t: t, nm: arguments[3] || '', until: keep ? Infinity : Date.now() + 20000, bnc: 1 };
    ballPaint(); try { place(); } catch (eP) { }
    try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { }
    var fo = st.flash; setTimeout(function () { if (fo) fo.bnc = 0; ballPaint(); }, 3800);   /* 弹跳4次后停, 闪字留到20秒 */
    setTimeout(function () { if (st.flash && Date.now() >= st.flash.until) { st.flash = null; ballPaint(); } }, 20100);
  }
  function kindOf(id, L) {
    if (/^(sell|stouch)/.test(id)) return 'sell';
    if (/^(buy|touch|eod)/.test(id)) return 'buy';
    if (id === 'open') return null;   /* 11-17 旧引擎删, 开盘条只记不闪 */
    return null;
  }
  /* ---------- 11-16 今日提醒: 记 + 合并 + 只闪要动手的 ---------- */
  var TK = 'jl_zp_today_v1', FK = 'jl_zp_flash_v1', CATS = ['买卖', '振幅', '日级', '共振位', '共振', 'RSO', '资金', '画线', '其他'];
  var FDEF = { '买卖': 1, '振幅': 1, '日级': 1, '共振位': 1 };   /* 默认会闪的(11-16 用户: 小球买卖和振幅照旧要出); 其余只记数 */
  function dsNow() { var d = new Date(); return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function hmNow() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function catOf(lbl, kd) {
    if (kd === 'sell' || kd === 'buy') return '买卖'; lbl = String(lbl || '');
    return /^振幅/.test(lbl) ? '振幅' : /^日级/.test(lbl) ? '日级' : /^共振位/.test(lbl) ? '共振位' : /^共振/.test(lbl) ? '共振' : /^RSO/.test(lbl) ? 'RSO' : /资金/.test(lbl) ? '资金' : /^画线/.test(lbl) ? '画线' : '其他';
  }
  function tdLoad() { try { var o = JSON.parse(localStorage.getItem(TK) || 'null'); if (o && o.d === dsNow() && o.L) return o; } catch (e) { } return { d: dsNow(), L: [] }; }
  function tdAdd(cat, lbl, txt, nm, side) {
    try {
      var o = tdLoad(); txt = String(txt || ''); if (nm && txt.indexOf(nm) === 0) txt = txt.slice(nm.length).replace(/^ · /, '');
      o.L.push({ t: hmNow(), ms: Date.now(), c: cat, l: lbl || cat, x: txt, nm: nm || '', s: side || '' }); if (o.L.length > 500) o.L = o.L.slice(-500);
      localStorage.setItem(TK, JSON.stringify(o)); tdBtn(); if (st.tdOpen && st.tdTab !== 's') tdPaint();
    } catch (e) { }
  }
  function flOn(cat) { try { var o = JSON.parse(localStorage.getItem(FK) || 'null'); if (o && o[cat] != null) return !!o[cat]; } catch (e) { } return !!FDEF[cat]; }
  function flSet(cat, v) { try { var o = JSON.parse(localStorage.getItem(FK) || 'null') || {}; o[cat] = v ? 1 : 0; localStorage.setItem(FK, JSON.stringify(o)); } catch (e) { } }
  /* 合并: 同一只票 + 同一类 + 同一句话(去掉数字/周期) + 30分钟内 → 一行 ×n; 5分/15分同一件事合成一行. 买卖不合并 */
  function tdGroups(L) {
    var G = [];
    L.forEach(function (r) {
      var head = r.x.split(' · ')[0], core = r.c === '买卖' ? r.ms : r.c === '画线' || r.c === '日级' ? head : head.replace(/[\d.:%+−\-×\/≤≥]+/g, '').trim();
      var key = r.nm + '|' + r.c + '|' + r.l.replace(/\s*(\d+分|日线.*|周.*)$/, '') + '|' + core, g = null;
      for (var i = G.length - 1; i >= 0; i--) if (G[i].key === key && r.ms - G[i].last <= 30 * 60000) { g = G[i]; break; }
      if (g) { g.n++; g.last = r.ms; g.it.push(r); var pr = (r.l.match(/(\d+分|日线|周)/) || [])[1]; if (pr && g.per.indexOf(pr) < 0) g.per.push(pr); }
      else { var p0 = (r.l.match(/(\d+分|日线|周)/) || [])[1]; G.push({ key: key, r: r, n: 1, last: r.ms, it: [r], per: p0 ? [p0] : [] }); }
    });
    return G;
  }
  function esc(t) { return String(t).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function tdBtn() { var b = $('jlZpTdBJL'); if (b) { var n = tdLoad().L.length; b.textContent = '提醒' + (n ? ' ' + n : ''); b.classList.toggle('on', !!st.tdOpen); } }
  /* 11-16 用户「提醒每天自动看哪个对哪个不对」: 第二页「成绩」= 作战屏本机台账(jl_ledger.js, 每条提醒30分钟内先往提醒方向走0.8%=对, 先反向=错), 直接借它的成绩表 */
  function tdTabs() { return '<div class="tb"><button data-tb="t" class="' + (st.tdTab !== 's' ? 'on' : '') + '">今天提醒</button><button data-tb="s" class="' + (st.tdTab === 's' ? 'on' : '') + '">成绩 · 对不对</button></div>'; }
  function tdScore(P) {
    P.innerHTML = tdTabs() + '<div id="jlZpLdJL"><div class="em">读台账…</div></div>';
    var w = st.win, box = $('jlZpLdJL'), cs = curStk();
    try {
      if (!w || !w.JLLedger) { box.innerHTML = '<div class="em">作战屏还没加载好，过几秒再点</div>'; return; }
      w.JLLedger.render(box, cs.code || '', 's');
      var c0 = w.document.getElementById('ldCssJL'); if (c0 && !$('ldCssJL')) { var c1 = document.createElement('style'); c1.id = 'ldCssJL'; c1.textContent = c0.textContent; document.head.appendChild(c1); }   /* 台账样式在 iframe 里, 抄一份到首页 */
    } catch (e) { box.innerHTML = '<div class="em">台账打不开</div>'; }
  }
  function tdPaint() {
    var P = $('jlZpTdJL'); if (!P) return;
    if (st.tdTab === 's') { tdScore(P); return; }
    var o = tdLoad(), f = st.tdF || '全部', G = tdGroups(o.L), cnt = {};
    G.forEach(function (g) { cnt[g.r.c] = (cnt[g.r.c] || 0) + 1; });
    var V = G.filter(function (g) { return f === '全部' || g.r.c === f; }).reverse();
    var h = tdTabs() + '<div class="hd"><b>今日提醒</b><span>' + o.d.slice(4, 6) + '-' + o.d.slice(6) + ' · ' + o.L.length + ' 条 → 合并 ' + G.length + ' 行</span></div>';
    h += '<div class="ch"><span data-f="全部" class="' + (f === '全部' ? 'on' : '') + '">全部 ' + G.length + '</span>' + CATS.filter(function (c) { return cnt[c]; }).map(function (c) { return '<span data-f="' + c + '" class="' + (f === c ? 'on ' : '') + (flOn(c) ? '' : 'mu') + '">' + c + ' ' + cnt[c] + (flOn(c) ? '' : ' 🔕') + '</span>'; }).join('') + '</div>';
    h += V.length ? V.map(function (g) {
      var r = g.r, lab = r.l.replace(/\s*(\d+分|日线.*|周.*)$/, '') + (g.per.length ? ' ' + g.per.join('·') : '');
      var d = g.n > 1 ? g.it.map(function (q) { return q.t + ' ' + esc(q.l) + ' ' + esc(q.x); }).join('<br>') : '';
      return '<div class="r"><span class="t">' + r.t + '</span><span><span class="k-' + r.c + (r.s === 'b' ? ' b' : '') + '">' + esc((r.nm && r.nm !== (curStk().name || '') ? r.nm + ' · ' : '') + lab + ' · ' + r.x) + '</span></span><span>' + (g.n > 1 ? '<span class="x">×' + g.n + '</span>' : '') + '</span>' + (d ? '<span class="d">' + d + '</span>' : '') + '</div>';
    }).join('') : '<div class="em">今天还没有提醒</div>';
    h += '<div class="st">' + CATS.map(function (c) { return '<span>' + c + '</span><i data-c="' + c + '" class="' + (flOn(c) ? 'on' : '') + '">' + (flOn(c) ? '闪' : '只记') + '</i>'; }).join('') + '</div>';
    P.innerHTML = h;
  }
  function tdToggle() {
    st.tdOpen = !st.tdOpen; var P = $('jlZpTdJL'); if (!P) return;
    P.hidden = !st.tdOpen; if (st.tdOpen) tdPaint(); tdBtn();
  }
  window.addEventListener('jlreso:near', function (ev) {       /* jl_reso 在价格贴近共振位(0.3%)时派发, 每位每天一次 */
    try {
      var d = ev.detail || {}, cs = curStk();
      if (cs.code && d.code && String(d.code).replace(/\D/g, '') !== String(cs.code).replace(/\D/g, '')) return;   /* 只提醒当前票 */
      st.badge += 1; tdAdd('共振位', '共振位', f2(d.p) + '×' + (d.n || ''), cs.name || cs.code || ''); if (flOn('共振位')) flash('reso', '共振位', f2(d.p) + '×' + (d.n || ''), cs.name || cs.code || ''); st.attnT = 0;
    } catch (e) { }
  });

  /* ---------- 球状态轮询: 同源只读 iframe 内 LIVE ---------- */
  function pollStatus() {
    var fr = $('jlZpFrameJL');
    try {
      var w = fr && fr.contentWindow;
      if (w && w.LIVE) {
        st.win = w; st.live = w.LIVE; st.err = '';
        var sym = w.LIVE.sym || '', ks = w.LIVE.keys || {}, ready = w.LIVE.lastOk > 0;
        if (st.lastSym && sym && sym !== st.lastSym) { st.seen = {}; st.ready = false; st.badge = 0; st.flash = null; }   /* 切票: 重置基线(战屏切票时 lastOk 归零, 新票首轮数据到了才重新定基线) */
        st.lastSym = sym;
        if (!st.ready) { if (ready) { st.ready = true; st.seen = {}; for (var k0 in ks) if (!(ks[k0] && ks[k0].a && Date.now() - ks[k0].t < 90000)) st.seen[k0] = 1; } }   /* 首次拿到行情: 已有的当基线; jl-zp4: 但战屏刚刚真响过的(90秒内)不算基线, 照样弹 */
        if (st.ready) {   /* jl-zp4: 定完基线同一轮就检查(原来要等下一秒) */
          var fresh = [];
          for (var k in ks) if (!st.seen[k]) { st.seen[k] = 1; fresh.push(k); }
          if (fresh.length) {                                       /* 含第一次(0→1)触发 */
            st.badge += fresh.length;
            var last = null, i, kd, rsoTxt = null, rsoLbl = 'RSO', tdTxt = '';
            var px = w.LIVE.last > 0 ? f2(w.LIVE.last) : '', nmS = (w.STK && (w.STK.name || w.STK.code)) || '';
            for (i = 0; i < fresh.length; i++) {
              var kv = ks[fresh[i]] || {}; kd = kindOf(fresh[i], w.LIVE);
              var isSig = fresh[i].indexOf('rso|') === 0 || fresh[i].indexOf('sig|') === 0, cat = catOf(kv.lbl, kd);
              if (kd || isSig) tdAdd(cat, kd ? (kd === 'sell' ? '卖出' : '买回') : (kv.lbl || 'RSO'), kv.txt || px, nmS, kd === 'buy' ? 'b' : '');   /* 11-16: 每条都记进今日提醒 */
              if (kd && flOn('买卖')) { last = kd; tdTxt = kv.txt || ''; } else if (isSig && kv.txt && flOn(cat)) { rsoTxt = kv.txt; rsoLbl = kv.lbl || 'RSO'; }
            }
            /* 11-13 用户: 球的买卖提醒要说哪只票 → 「永鼎股份 · 卖出!」+「②卖 24.01」 */
            if (last === 'sell') flash('sell', '卖出!', tdTxt || px, nmS);
            else if (last === 'buy') flash('buy', '买回!', tdTxt || px, nmS);
            else if (rsoTxt) flash('reso', rsoLbl, rsoTxt.indexOf(nmS) === 0 ? rsoTxt.slice(nmS.length).replace(/^ · /, '') : rsoTxt, nmS);   /* 11-12: RSO信号金环闪字, 不冒充卖/买指令; 票名放第一行 */
            /* 11-16: 只记不闪的类 → 只加角标, 不响 */
          }
        }
        st.keysN = Object.keys(ks).length;
      } else if (!fr || !fr.contentWindow) { st.err = 'x'; }
      var sh = $('jlZpSheetJL'); if (sh) sh.removeAttribute('data-err');
    } catch (e) {
      st.err = (e && e.name === 'SecurityError') ? 'file' : 'x';
      var sh2 = $('jlZpSheetJL'); if (sh2 && st.err === 'file') sh2.setAttribute('data-err', 'file');
    }
    ballPaint();
  }

  /* ---------- 启动 ---------- */
  function boot() {
    /* ①球先上屏(防任何后续异常导致无球): 纯DOM, 无依赖 */
    try { styleOnce(); } catch (e) { }
    var b = document.createElement('div'); b.id = 'jlZpBallJL';
    var sh = document.createElement('div'); sh.id = 'jlZpSheetJL'; sh.hidden = true;
    try {
      sh.innerHTML = '<span class="zx" id="jlZpXJL">✕</span><span class="zz" data-z="1" style="right:38px" title="放大(双击复原)">+</span><span class="zz" data-z="-1" style="right:64px" title="缩小(双击复原)">−</span><span class="zzT" style="right:92px"></span><span class="tdB" id="jlZpTdBJL" title="今日提醒">提醒</span><div id="jlZpTdJL" hidden></div><iframe id="jlZpFrameJL" src="' + SRC + '" referrerpolicy="no-referrer"></iframe>';
    } catch (e) { }
    document.body.appendChild(sh); document.body.appendChild(b);
    st.ball = b; st.attnT = Date.now() + 8000; /* 首次出现脉冲8秒引人注意 */
    try { st.pos = JSON.parse(localStorage.getItem(BP) || 'null'); } catch (e) { }
    if (!st.pos) st.pos = { r: 1, b: 170 };
    try { place(); } catch (e) { }
    ballPaint();
    try { setInterval(pollStatus, 1000); setInterval(ballPaint, 20000); } catch (e) { }
    /* 球/面板被页面重绘移除 → 补回(面板iframe重挂会重载, 仅在确实丢失时才补) */
    setInterval(function () {
      try {
        if (!document.body.contains(sh)) document.body.appendChild(sh);
        if (!document.body.contains(b)) { document.body.appendChild(b); place(); ballPaint(); }
      } catch (e) { }
    }, 3000);
    try { window.addEventListener('resize', function () { try { place(); } catch (e) { } }); setInterval(function () { try { var r = b.getBoundingClientRect(); if (r.right < 20 || r.bottom < 20 || r.left > (window.innerWidth || 375) - 20 || r.top > (window.innerHeight || 667) - 20) place(); } catch (e) { } }, 3000); } catch (e) { }
    try { console.log('[JLZp v4] 浮球已挂载'); } catch (e) { }
    /* ②b 11-13夜 放大缩小: 面板按比例变大, iframe 内部仍按 430 宽排版, 用 transform 整体放大(矢量重绘, 清楚); 存 jl_zp_zoom_v1 */
    try {
      var ZS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2], zk = 'jl_zp_zoom_v1', zt = 0;
      var zNow = function () { var v = +localStorage.getItem(zk); return ZS.indexOf(v) >= 0 ? v : 1; };
      var zApply = function (z, say) {
        var fr = $('jlZpFrameJL'); if (!fr) return;
        if (z === 1) { sh.style.width = sh.style.height = ''; fr.style.width = fr.style.height = fr.style.transform = ''; }
        else {
          var W = Math.min((window.innerWidth || 400) * 0.96, 430 * z), H = Math.min((window.innerHeight || 700) - 60, Math.min((window.innerHeight || 700) * 0.86, 720) * z);
          sh.style.width = W + 'px'; sh.style.height = H + 'px';
          fr.style.width = (W / z) + 'px'; fr.style.height = (H / z) + 'px'; fr.style.transform = 'scale(' + z + ')';
        }
        if (say) { var T = sh.querySelector('.zzT'); if (T) { T.textContent = Math.round(z * 100) + '%'; T.classList.add('on'); clearTimeout(zt); zt = setTimeout(function () { T.classList.remove('on'); }, 1200); } }
        try { fr.contentWindow && fr.contentWindow.dispatchEvent(new Event('resize')); } catch (eR) { }
      };
      sh.querySelectorAll('.zz').forEach(function (k) {
        k.addEventListener('click', function (e) { e.stopPropagation(); var i = ZS.indexOf(zNow()) + (+k.getAttribute('data-z')); i = Math.max(0, Math.min(ZS.length - 1, i)); localStorage.setItem(zk, String(ZS[i])); zApply(ZS[i], 1); });
        k.addEventListener('dblclick', function (e) { e.stopPropagation(); localStorage.setItem(zk, '1'); zApply(1, 1); });
      });
      zApply(zNow());
      window.addEventListener('resize', function () { try { zApply(zNow()); } catch (eZ) { } });
    } catch (e) { }
    /* ②交互绑定 */
    try {
      var s0 = null, moved = false;
      b.addEventListener('pointerdown', function (e) {
        s0 = { x: e.clientX, y: e.clientY, p: JSON.parse(JSON.stringify(st.pos)) };
        if (s0.p.l == null) { var rc = b.getBoundingClientRect(); s0.p = { l: rc.left, t: rc.top }; st.pos = { l: rc.left, t: rc.top }; place(); }
        moved = false;
        try { b.setPointerCapture(e.pointerId); } catch (er) { }
      });
      b.addEventListener('pointermove', function (e) {
        if (!s0) return;
        var dx = e.clientX - s0.x, dy = e.clientY - s0.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        if (!moved) return;
        var w = window.innerWidth, h = window.innerHeight;
        st.pos = { l: Math.max(4, Math.min(w - 58, s0.p.l + dx)), t: Math.max(4, Math.min(h - 58, s0.p.t + dy)) };
        place();
      });
      b.addEventListener('pointerup', function () {
        if (s0 && moved) { try { localStorage.setItem(BP, JSON.stringify(st.pos)); } catch (e) { } }
        else toggleSheet();
        s0 = null; moved = false;
      });
      b.addEventListener('click', function () { if (window.PointerEvent) return; toggleSheet(); }); /* 老浏览器无pointer事件兜底 */
      var tb = $('jlZpTdBJL'); if (tb) tb.addEventListener('click', function (e) { e.stopPropagation(); tdToggle(); });
      var tp = $('jlZpTdJL'); if (tp) tp.addEventListener('click', function (e) {
        e.stopPropagation(); var t = e.target;
        var tbb = t.closest && t.closest('.tb button'); if (tbb) { st.tdTab = tbb.getAttribute('data-tb'); tdPaint(); return; }
        var fc = t.closest && t.closest('.ch span'); if (fc) { st.tdF = fc.getAttribute('data-f'); tdPaint(); return; }
        var sc = t.closest && t.closest('.st i'); if (sc) { var c = sc.getAttribute('data-c'); flSet(c, !flOn(c)); tdPaint(); return; }
        var rw = t.closest && t.closest('.r'); if (rw) rw.classList.toggle('op');
      });
      tdBtn();
      var x = $('jlZpXJL');
      if (x) x.addEventListener('click', function (e) { e.stopPropagation(); st.open = false; var s = $('jlZpSheetJL'); if (s) s.hidden = true; });
    } catch (e) { }
  }
  window.JLZp = { _st: st, toggle: toggleSheet, _t: { ballState: ballState, pollStatus: pollStatus, kindOf: kindOf } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();

/* 11-07 用户: 复盘页最底下加标签「尺子A/B」「我的T·历史对照」(从作战屏挪过来)。
   只读: 我的T = 读 localStorage jl_myT_v1_<代码>_<日期>(作战屏里填的)。11-09 用户: 引擎那一列/引擎对照删掉, 我自己的逐日记录保留。
   复盘页被重绘移除就补回; 回滚=删本段。 */
(function () {
  var TAB = 'jl_revtab_v1';
  function fee(a, s) { return Math.max(5, a * 0.00025) + a * 0.00001 + (s ? a * 0.0005 : 0); }
  function sg(v) { return (v >= 0 ? '+' : '') + v.toFixed(2); }
  function col(v) { return v >= 0 ? '#ff5459' : '#1fdc93'; }
  function myT() {
    var by = {}, i, k, m;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if ((m = /^jl_myT_v1_(\w+)_(\d{8})$/.exec(k))) {
          var n = 0, c = 0; JSON.parse(localStorage.getItem(k) || '[]').forEach(function (t) { var s = +t.s || 0, b = +t.b || 0, q = +t.q || 100; if (s > 0 && b > 0) { n += (s - b) * q - fee(s * q, 1) - fee(b * q, 0); c++; } });
          (by[m[1]] = by[m[1]] || {})[m[2]] = Object.assign((by[m[1]] || {})[m[2]] || {}, { my: c ? n : null });
        }
      }
    } catch (e) { }
    var codes = Object.keys(by); if (!codes.length) return '<div style="padding:10px;color:#9aa8b8;font-size:12px">还没有记录。在做T作战屏「我的T（实盘对照）」里填了成交，这里就会按天汇总。</div>';
    var nm = function (c) { try { var L = JSON.parse(localStorage.getItem('jinlin_stocks_v2') || '[]'); for (var j = 0; j < L.length; j++) if (String(L[j].code).slice(-6) === c) return L[j].name || c; } catch (e) { } return c === '600105' ? '永鼎股份' : c; };
    return codes.map(function (c) {
      var D = by[c], ds = Object.keys(D).sort().reverse().slice(0, 60), tot = 0, h = '';
      ds.forEach(function (d) {
        var my = D[d].my; if (my == null) return; tot += my;
        h += '<div style="display:flex;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,.08)"><span style="width:44px;color:#9aa8b8">' + d.slice(4, 6) + '-' + d.slice(6) + '</span><span style="flex:1">我 <b style="color:' + col(my) + '">' + sg(my) + '</b></span></div>';
      });
      return '<div style="margin:4px 0 10px"><div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:3px"><span>' + nm(c) + '</span><span>累计 <b style="color:' + col(tot) + '">' + sg(tot) + '</b></span></div>' +
        h + '</div>';
    }).join('');
  }
  function paint(box) {
    var t = 'mt';   /* 11-08 用户: 尺子A/B回测不准, 删掉, 只留我的T */
    box.querySelectorAll('.rvTabJL button').forEach(function (b) { b.className = b.getAttribute('data-t') === t ? 'on' : ''; });
    var ab = box.querySelector('.rvAbJL'), mt = box.querySelector('.rvMtJL');
    if (ab) ab.hidden = true; mt.hidden = false;
        if (t === 'mt') mt.innerHTML = myT();
  }
  function ensure() {
    try {
      var pg = document.getElementById('reviewPage'); if (!pg) return;
      var box = document.getElementById('jlRevTabsJL');
      if (box && box.parentNode === pg && !box.nextElementSibling) { if (!box.querySelector('.rvMtJL').hidden) box.querySelector('.rvMtJL').innerHTML = myT(); return; }
      if (!box) {
        box = document.createElement('article'); box.id = 'jlRevTabsJL'; box.className = 'glass reviewCard';
        box.style.cssText = 'margin-top:12px;font-size:12px;line-height:1.5';
        box.innerHTML = '<style>#jlRevTabsJL .rvTabJL{display:flex;gap:6px;margin:0 0 8px}#jlRevTabsJL .rvTabJL button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;border-radius:14px;padding:6px 8px;font:600 12px/1.2 -apple-system,"PingFang SC",sans-serif}#jlRevTabsJL .rvTabJL button.on{background:#ffe14d;color:#111;border-color:#ffe14d}#jlRevTabsJL iframe{display:block;width:100%;min-height:600px;border:0;background:transparent;border-radius:10px}</style>' +
          '<div class="rvTabJL"><button type="button" data-t="mt" class="on">我的T · 逐日记录</button></div>' +
          '<div class="rvMtJL"></div>';
        box.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.rvTabJL button'); if (!b) return; try { localStorage.setItem(TAB, b.getAttribute('data-t')); } catch (er) { } paint(box); });
      }
      pg.appendChild(box); paint(box);
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure); else setTimeout(ensure, 0);
  setInterval(ensure, 3000);
})();
