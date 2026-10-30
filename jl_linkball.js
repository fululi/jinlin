/* jl_linkball.js v1 — 持仓联动浮球 (jl-link1)
 * 只读页面已有数据: window.jlLinkInputJL()(买入闸输入+大盘预判带+个股主力缓存+板块涨幅) + jl_reso_log_v1(共振位), 不新发请求
 * 浮球(只在持仓页显示, 可拖, 松手吸边, 位置存 jl_lkball_pos): 外圈=大盘温度, 内圈=上证在预判带里的位置(左低右高), 角点=闸灯色/金色闪=有新提醒
 * 面板: ①大盘·预判带 ②联动链(大盘→板块→个股, 点持仓切换) ③持仓一览(含原「主力」浮条的大中小单, jl-dedup1) ④今日提醒
 * 提醒(阈值均为初值, 未回测): 上证距预判高/低≤0.3%或冲出; 持仓板块10分钟内涨幅变化≥1个百分点; 共振位临近(jlreso:near); 大盘快拉/快跳水(jlv2)
 * 提醒落 jl_link_alert_v1(按日, 留60天) 供复盘
 * 回滚: 删 index.html 里引用本文件的一行 + jlLinkInputJL
 */
(function () {
  var POS = 'jl_lkball_pos', AK = 'jl_link_alert_v1', NEAR = 0.003, SURGE = 1.0, SWIN = 10, KEEP = 60;
  var UP = '#ff5459', DN = '#1fdc93', MID = '#8fa8b3', GOLD = '#e8c37a';
  var st = { open: false, pick: 0, unread: 0, last: null, samp: {}, pos: null };

  function $(id) { return document.getElementById(id); }
  function ok(v) { return v != null && isFinite(v); }
  function col(v) { return !ok(v) || v === 0 ? MID : v > 0 ? UP : DN; }
  function pc(v, d) { return ok(v) ? (v > 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%' : '—'; }
  function yi(v) { return ok(v) ? (v > 0 ? '+' : '') + (Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : (v / 1e4).toFixed(0) + '万') : '—'; }
  function f2(v) { return ok(v) ? Number(v).toFixed(2) : '—'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function hm(t) { var d = t ? new Date(t) : new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function inSess() { var d = new Date(), w = d.getDay(), m = d.getHours() * 60 + d.getMinutes(); return w >= 1 && w <= 5 && ((m >= 570 && m <= 690) || (m >= 780 && m <= 900)); }
  function arc(cx, cy, r, a0, a1) {
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (Math.abs(a1 - a0) > Math.PI ? 1 : 0) + ' ' + (a1 > a0 ? 1 : 0) + ' ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }
  function tempLv(t) { return t >= 80 ? ['过热', '#ff5459'] : t >= 65 ? ['微热', '#ff8f6b'] : t >= 35 ? ['平', '#c9d2de'] : t >= 20 ? ['微冷', '#6fc6ff'] : t >= 10 ? ['过冷', '#4f8dff'] : ['冰点', '#3b6bff']; }
  var GATE = { green: ['可以买', DN], yellow: ['只低吸', '#ffd21f'], red: ['不宜买', UP], nodata: ['数据不足', '#5b6a82'] };

  /* ---------- 提醒 ---------- */
  function loadA() { try { return JSON.parse(localStorage.getItem(AK) || '{}') || {}; } catch (e) { return {}; } }
  function todayA() { return loadA()[today()] || []; }
  function alert1(key, txt, kind) {
    var A = loadA(), t = today(), L = A[t] = A[t] || [];
    if (L.some(function (x) { return x.k === key; })) return;
    L.push({ k: key, at: hm(), txt: txt, kind: kind });
    try { var ks = Object.keys(A).sort(); while (ks.length > KEEP) delete A[ks.shift()]; localStorage.setItem(AK, JSON.stringify(A)); } catch (e) { }
    st.unread++;
    var b = $('jlLkBall'); if (b) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
    try { navigator.vibrate && navigator.vibrate([90, 70, 90]); } catch (e) { }
    try { if (window.Notification && Notification.permission === 'granted') new Notification('联动提醒', { body: txt }); } catch (e) { }
  }

  function checkAlerts(D) {
    if (!D || !inSess()) return;
    var td = today().replace(/-/g, ''), sh = D.sh, P = D.pred;
    /* 上证 vs 预判带 */
    if (sh && sh.qd === td && ok(sh.base) && P && ok(P.hi) && ok(P.lo)) {
      var dh = (P.hi - sh.base) / P.hi, dl = (sh.base - P.lo) / P.lo;
      if (sh.base >= P.hi) alert1('ph-x', '上证 ' + f2(sh.base) + ' 冲过预判高 ' + f2(P.hi) + ' —— 留意回撤', 'hi');
      else if (dh <= NEAR) alert1('ph-n', '上证 ' + f2(sh.base) + ' 接近预判高 ' + f2(P.hi) + '（差' + (dh * 100).toFixed(2) + '%）', 'hi');
      if (sh.base <= P.lo) alert1('pl-x', '上证 ' + f2(sh.base) + ' 跌破预判低 ' + f2(P.lo), 'lo');
      else if (dl <= NEAR) alert1('pl-n', '上证 ' + f2(sh.base) + ' 接近预判低 ' + f2(P.lo) + '（差' + (dl * 100).toFixed(2) + '%）', 'lo');
    }
    /* 大盘快拉/快跳水 */
    (D.ev || []).forEach(function (e) {
      if (!(e.ago <= 2)) return;
      alert1('ev-' + e.name + e.dir + '-' + Math.floor((Date.now() / 6e4 - e.ago) / 15), e.name + (e.dir > 0 ? ' 快拉' : ' 快跳水'), e.dir > 0 ? 'hi' : 'lo');
    });
    /* 持仓板块急拉/跳水: 10分钟内涨幅变化≥1个百分点(同板块同方向30分钟内只提一次) */
    if (D.secStale) return;
    var now = Date.now(), seen = {};
    (D.holds || []).forEach(function (h) {
      if (!h.sec || seen[h.sec] || !ok(h.secPct)) return;
      seen[h.sec] = 1;
      var s = st.samp[h.sec] = (st.samp[h.sec] || []).filter(function (x) { return now - x.t <= SWIN * 6e4; });
      s.push({ t: now, p: h.secPct });
      var lo = Math.min.apply(null, s.map(function (x) { return x.p; })), hi = Math.max.apply(null, s.map(function (x) { return x.p; }));
      var slot = Math.floor(now / 18e5);
      if (h.secPct - lo >= SURGE) alert1('su-' + h.sec + slot, h.sec + ' ' + SWIN + '分钟内拉升 ' + (h.secPct - lo).toFixed(1) + '个点（现' + pc(h.secPct, 1) + '）', 'hi');
      if (hi - h.secPct >= SURGE) alert1('sd-' + h.sec + slot, h.sec + ' ' + SWIN + '分钟内回落 ' + (hi - h.secPct).toFixed(1) + '个点（现' + pc(h.secPct, 1) + '）', 'lo');
    });
  }
  window.addEventListener('jlreso:near', function (e) {
    var d = e.detail || {}, nm = d.code === 'sh000001' ? '上证' : d.code;
    try { var D = st.last; (D && D.holds || []).forEach(function (h) { if (h.code === d.code) nm = h.name; }); } catch (er) { }
    alert1('rs-' + d.code + d.p, nm + ' 接近共振位 ' + f2(d.p) + ' ×' + d.n + '（' + (d.srcs || []).join('·') + '）', 'rs');
  });

  /* ---------- 共振位(读台账, 不重算) ---------- */
  function resoOf(code) {
    try {
      var e = (JSON.parse(localStorage.getItem('jl_reso_log_v1') || '{}')[today()] || {})[code];
      return e && !e.stale && e.levels ? e.levels : [];
    } catch (er) { return []; }
  }

  /* ---------- 样式 ---------- */
  var CSS = '#jlLkBall{position:fixed;z-index:56;width:54px;height:54px;border-radius:50%;cursor:pointer;touch-action:none;' +
    'background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.18),rgba(15,24,40,.62) 60%);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 18px rgba(0,0,0,.45)}' +
    '#jlLkBall svg{position:absolute;inset:0}#jlLkBall .bt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;pointer-events:none}' +
    '#jlLkBall .bt b{font-size:12px}#jlLkBall .bt span{font-size:8.5px;color:#dfe7f2}' +
    '#jlLkBall i{position:absolute;right:1px;top:1px;min-width:13px;height:13px;border-radius:7px;border:2px solid #0f1828;font:700 8px/9px -apple-system,sans-serif;color:#10202a;text-align:center;font-style:normal}' +
    '#jlLkBall.ring{animation:jlLkRing 1s ease-in-out 3}@keyframes jlLkRing{50%{box-shadow:0 0 0 7px rgba(232,195,122,.45),0 4px 18px rgba(0,0,0,.45)}}' +
    '#jlLkSheet{position:fixed;z-index:70;max-height:74vh;overflow:auto;background:rgba(10,17,30,.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
    'border:1px solid #2a3a55;border-radius:16px;padding:10px 10px 12px;color:#e9eef5;font:12px/1.4 -apple-system,"PingFang SC",sans-serif}' +
    '#jlLkSheet[hidden]{display:none}#jlLkSheet .sh{display:flex;align-items:center;gap:8px;margin-bottom:4px}#jlLkSheet .sh b{color:' + GOLD + ';font-size:13px;flex:1}' +
    '#jlLkSheet .x{color:#9fb0c6;font-size:20px;line-height:1;padding:0 4px;cursor:pointer}' +
    '#jlLkSheet .sec{border-top:1px solid #1e2a3d;padding-top:7px;margin-top:7px}#jlLkSheet h4{margin:0 0 4px;font-size:11px;color:#9fb0c6;font-weight:500;display:flex;justify-content:space-between;gap:6px}' +
    '#jlLkSheet .chips{display:flex;gap:5px;overflow-x:auto;padding:2px 0 4px}#jlLkSheet .chip{flex:0 0 auto;border:1px solid #2a3a55;border-radius:12px;padding:2px 9px;font-size:11px;cursor:pointer;color:#cfd8e6}' +
    '#jlLkSheet .chip.on{border-color:' + GOLD + ';color:' + GOLD + ';background:rgba(232,195,122,.1)}' +
    '#jlLkSheet .hr{cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:1px 8px;padding:5px 2px;border-bottom:1px dashed #1e2a3d}#jlLkSheet .hr:last-child{border-bottom:0}' +
    '#jlLkSheet .hr .n{font-weight:600}#jlLkSheet .hr .s{font-size:10.5px;color:#aab6c8}#jlLkSheet .hr .tg{grid-column:1/3;font-size:10.5px}' +
    '#jlLkSheet .al{display:flex;gap:6px;font-size:11px;padding:2px 0}#jlLkSheet .al span{color:#9fb0c6;font-variant-numeric:tabular-nums}' +
    '#jlLkSheet .ft{margin-top:8px;font-size:10px;color:#7d8aa0}#jlLkSheet .warn{color:#ffb35c;font-size:11px}';

  /* ---------- 浮球 ---------- */
  function ballHTML(D) {
    var T = D && D.temp, sh = D && D.sh, P = D && D.pred, ta = -Math.PI / 2, g = '';
    g += '<circle cx="27" cy="27" r="24" fill="none" stroke="#1e2a3d" stroke-width="3.5"/>';
    if (T && ok(T.t)) g += '<path d="' + arc(27, 27, 24, ta, ta + Math.max(0.02, T.t / 100) * 2 * Math.PI * 0.999) + '" fill="none" stroke="' + tempLv(T.t)[1] + '" stroke-width="3.5" stroke-linecap="round"/>';
    g += '<circle cx="27" cy="27" r="18.5" fill="none" stroke="#1e2a3d" stroke-width="3"/>';
    var fr = sh && P && ok(sh.base) && P.hi > P.lo ? (sh.base - P.lo) / (P.hi - P.lo) : NaN;
    if (ok(fr)) {
      var f = Math.max(0.02, Math.min(1, fr)), c = fr >= 0.85 ? UP : fr <= 0.15 ? '#4f8dff' : '#cfd8e6';
      g += '<path d="' + arc(27, 27, 18.5, ta, ta + f * 2 * Math.PI * 0.999) + '" fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>';
    }
    var gl = GATE[D && D.gate && D.gate.lvl] || GATE.nodata;
    var dot = st.unread ? '<i style="background:' + GOLD + '">' + (st.unread > 9 ? '9+' : st.unread) + '</i>' : '<i style="background:' + gl[1] + '"></i>';
    return '<svg viewBox="0 0 54 54">' + g + '</svg><div class="bt"><b style="color:' + col(sh && sh.pct) + '">' + (sh && ok(sh.pct) ? (sh.pct > 0 ? '+' : '') + sh.pct.toFixed(2) : '—') + '</b><span>联动</span></div>' + dot;
  }

  /* ---------- ① 大盘·预判带 ---------- */
  function predSVG(D) {
    var sh = D.sh, P = D.pred;
    if (!P || !ok(P.lo) || !ok(P.hi)) return '<div class="warn">大盘预判带还没算出（首页「大盘预判」加载后自动出现）</div>';
    var td = today().replace(/-/g, ''), live = sh && sh.qd === td, cur = sh && ok(sh.base) ? sh.base : NaN;
    var lv = resoOf('sh000001'), vals = [P.lo, P.hi].concat(ok(cur) ? [cur] : []).concat(live && ok(sh.high) ? [sh.high, sh.low] : []).concat(lv.map(function (x) { return x.p; }));
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var W = 390, L = 8, R = 382, X = function (p) { return L + (p - lo) / (hi - lo) * (R - L); }, y = 40, g = '';
    g += '<line x1="' + L + '" y1="' + y + '" x2="' + R + '" y2="' + y + '" stroke="#2a3850" stroke-width="2"/>';
    g += '<rect x="' + X(P.lo) + '" y="' + (y - 7) + '" width="' + (X(P.hi) - X(P.lo)) + '" height="14" rx="4" fill="rgba(159,179,255,.13)" stroke="rgba(159,179,255,.45)"/>';
    if (live && ok(sh.high) && ok(sh.low) && sh.high > sh.low) g += '<rect x="' + X(sh.low) + '" y="' + (y - 2) + '" width="' + (X(sh.high) - X(sh.low)) + '" height="4" rx="2" fill="rgba(255,255,255,.35)"/>';
    lv.forEach(function (x) { g += '<line x1="' + X(x.p) + '" y1="' + (y - 11) + '" x2="' + X(x.p) + '" y2="' + (y + 11) + '" stroke="' + (x.n >= 3 ? '#ffd21f' : '#8a96a8') + '" stroke-width="' + (x.n >= 3 ? 2 : 1.4) + '"/>'; });
    /* 价签: 低/高在下方, 现价在上方, 共振位在最下排 —— 底半透明+亮白字, 互不重叠 */
    function tag(x, yy, txt, c) { var w = txt.length * 6.1 + 10, xx = Math.max(2, Math.min(W - w - 2, x - w / 2)); return '<rect x="' + xx + '" y="' + (yy - 10) + '" width="' + w + '" height="14" rx="4" fill="rgba(7,13,24,.62)"/><text x="' + (xx + 5) + '" y="' + (yy + 1) + '" font-size="10" fill="' + c + '">' + txt + '</text>'; }
    var bl = [{ x: X(P.lo), t: '预判低 ' + f2(P.lo), c: '#9fd0ff' }, { x: X(P.hi), t: '预判高 ' + f2(P.hi), c: '#ffb0a8' }];
    if (bl[1].x - bl[0].x < 92) { bl[0].x -= 46; bl[1].x += 46; }
    bl.forEach(function (b) { g += tag(b.x, y + 24, b.t, b.c); });
    var rl = lv.slice().sort(function (a, b) { return a.p - b.p; }), lastR = -1e9;
    rl.forEach(function (x) { var t = f2(x.p) + '×' + x.n, w = t.length * 6.1 + 10; if (X(x.p) - w / 2 < lastR + 4) return; lastR = X(x.p) + w / 2; g += tag(X(x.p), y + 42, t, x.n >= 3 ? '#ffd21f' : '#c9d2de'); });
    if (ok(cur)) g += '<circle cx="' + X(cur) + '" cy="' + y + '" r="5.5" fill="#fff" stroke="#0f1828" stroke-width="2"/>' + tag(X(cur), y - 18, (live ? '现 ' : '收 ') + f2(cur), '#ffffff');
    var st2 = '';
    if (ok(cur)) {
      var dh = (P.hi - cur) / cur * 100, dl = (cur - P.lo) / cur * 100;
      st2 = cur >= P.hi ? '<b style="color:' + UP + '">已冲过预判高，留意回撤</b>' : cur <= P.lo ? '<b style="color:#6fc6ff">已跌破预判低</b>' :
        '距预判高 <b style="color:' + UP + '">' + dh.toFixed(2) + '%</b> · 距预判低 <b style="color:#6fc6ff">' + dl.toFixed(2) + '%</b>';
      if (live && ok(sh.high) && sh.high >= P.hi && cur < P.hi) st2 += ' · 今日已碰过高点';
      if (live && ok(sh.low) && sh.low <= P.lo && cur > P.lo) st2 += ' · 今日已碰过低点';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + (lv.length ? 96 : 76) + '" width="100%">' + g + '</svg><div style="font-size:11px">' + st2 + '</div>';
  }

  /* ---------- ② 联动链 ---------- */
  function chainSVG(D, h) {
    var sh = D.sh, M = D.mf;
    var nodes = [['大盘', sh && sh.pct, M && ok(M.ratio) ? M.ratio : NaN, M && ok(M.ratio) ? '主力占成交 ' + pc(M.ratio) : '主力 —'],
      [h.sec && h.sec !== '-' ? h.sec : '板块未知', h.secPct, ok(h.ratio) ? h.ratio : h.secV, ok(h.ratio) ? '主力占成交 ' + pc(h.ratio) + (h.streak ? ' · 连' + (h.streak > 0 ? '进' : '出') + Math.abs(h.streak) : '') : ok(h.secV) ? '主力 ' + yi(h.secV) + (h.secVStale ? '(旧)' : '') : '主力 —'],
      [h.name, h.pct, h.main, ok(h.main) ? '主力 ' + yi(h.main) : '主力 —']];
    var xs = [62, 195, 328], g = '';
    nodes.forEach(function (n, i) {
      var p = n[1], f = ok(p) ? Math.min(1, Math.abs(p) / (i ? 6 : 3)) : 0, c = col(p);
      g += '<circle cx="' + xs[i] + '" cy="36" r="27" fill="' + c + '" fill-opacity="' + (0.12 + 0.35 * f).toFixed(2) + '" stroke="' + c + '" stroke-width="' + (i === 2 ? 2.4 : 1.4) + '"/>' +
        '<text x="' + xs[i] + '" y="41" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + pc(p) + '</text>' +
        '<text x="' + xs[i] + '" y="78" text-anchor="middle" font-size="11" fill="#e9eef5">' + esc(String(n[0]).slice(0, 6)) + '</text>' +
        '<text x="' + xs[i] + '" y="92" text-anchor="middle" font-size="9.5" fill="' + col(n[2]) + '">' + esc(n[3]) + '</text>';
      if (i < 2) {
        var a = n[2], b = nodes[i + 1][2], kn = ok(a) && ok(b), same = kn && Math.sign(a) === Math.sign(b), c2 = !kn ? '#5b6a82' : same ? DN : '#ffd21f', x0 = xs[i] + 33, x1 = xs[i + 1] - 33;
        g += '<line x1="' + x0 + '" y1="36" x2="' + (x1 - 6) + '" y2="36" stroke="' + c2 + '" stroke-width="2"' + (same ? '' : ' stroke-dasharray="4 3"') + '/><path d="M' + (x1 - 7) + ' 31L' + x1 + ' 36L' + (x1 - 7) + ' 41Z" fill="' + c2 + '"/>' +
          '<rect x="' + ((x0 + x1) / 2 - 24) + '" y="14" width="48" height="15" rx="7.5" fill="rgba(7,13,24,.62)"/><text x="' + ((x0 + x1) / 2) + '" y="25" text-anchor="middle" font-size="10" fill="' + c2 + '">' + (!kn ? '待数据' : same ? '资金同向' : '资金背离') + '</text>';
      }
    });
    return '<svg viewBox="0 0 390 98" width="100%">' + g + '</svg>';
  }

  /* ---------- ③ 持仓一览 ---------- */
  function tagCol(t) { return /不加仓|不追/.test(t) ? UP : /可持有/.test(t) ? DN : /观察/.test(t) ? '#ffd21f' : '#9fb0c6'; }
  function holdRow(h) {
    var lv = resoOf(h.code), near = '';
    if (lv.length) {
      var q = null; try { q = window.jlResoInputJL && window.jlResoInputJL(h.code); } catch (e) { }
      var px = q && Number(q.cur);
      if (px > 0) {
        var up = lv.filter(function (x) { return x.p > px; })[0], dn = lv.filter(function (x) { return x.p <= px; }).pop();
        near = '共振位 ' + (dn ? '↓' + f2(dn.p) + '×' + dn.n : '') + (dn && up ? ' / ' : '') + (up ? '↑' + f2(up.p) + '×' + up.n : '');
      }
    }
    var bk = h.bkt && (ok(h.bkt.big) || ok(h.bkt.mid) || ok(h.bkt.small)) ? '大 ' + yi(h.bkt.big) + ' · 中 ' + yi(h.bkt.mid) + ' · 小 ' + yi(h.bkt.small) : '';
    return '<div class="hr" data-jump="' + esc(h.code) + '"><span class="n">' + esc(h.name) + ' <span style="color:' + col(h.pct) + '">' + pc(h.pct) + '</span></span>' +
      '<span class="s" style="color:' + col(h.main) + '">主力 ' + yi(h.main) + (ok(h.main) && !h.mainRt ? '<small style="color:#9fb0c6">(日)</small>' : '') + '</span>' +
      '<span class="s">' + esc(h.sec && h.sec !== '-' ? h.sec : '板块未知') + ' <span style="color:' + col(h.secPct) + '">' + pc(h.secPct) + '</span>' + (ok(h.ratio) ? ' · 占成交 <span style="color:' + col(h.ratio) + '">' + pc(h.ratio) + '</span>' : ok(h.secV) ? ' · 主力 <span style="color:' + col(h.secV) + '">' + yi(h.secV) + '</span>' + (h.secVStale ? '<small style="color:#ffd21f">旧</small>' : '') : '') + (h.streak ? ' · 连' + (h.streak > 0 ? '进' : '出') + Math.abs(h.streak) + '天' : '') + '</span>' +
      '<span class="s">' + near + '</span>' + (bk ? '<span class="s" style="grid-column:1/3">' + bk + '</span>' : '') +
      '<span class="tg"><b style="color:' + (h.vc === 'r' ? '#ff6b70' : h.vc === 'g' ? '#2ee6a0' : '#ffd21f') + '">' + esc(h.short && h.short.indexOf('暂缺') < 0 ? h.short : '') + '</b> <span style="color:' + tagCol(h.tag) + '">' + esc(h.tag && h.tag !== '板块数据未到' ? h.tag : '') + '</span></span></div>';
  }

  function sheetHTML(D) {
    if (!D) return '<div class="sh"><b>持仓联动</b><span class="x" data-x>×</span></div><div class="warn">页面数据还没到，稍后自动刷新</div>';
    var T = D.temp, gl = GATE[D.gate && D.gate.lvl] || GATE.nodata, H = D.holds || [], sh = D.sh;
    if (st.pick >= H.length) st.pick = 0;
    var head = '<div class="sh"><b>持仓联动</b><span style="font-size:11px">闸 <b style="color:' + gl[1] + '">' + gl[0] + '</b>' +
      (T && ok(T.t) ? ' · 温度 <b style="color:' + tempLv(T.t)[1] + '">' + Math.round(T.t) + (T.state ? ' ' + esc(T.state) : '') + '</b>' : ' · 温度 —') + '</span><span class="x" data-x>×</span></div>';
    var s1 = '<div class="sec"><h4><span>① 大盘 · 预判带（首页温度计高低点）</span><span>上证 <b style="color:' + col(sh && sh.pct) + '">' + f2(sh && sh.base) + ' ' + pc(sh && sh.pct) + '</b></span></h4>' + predSVG(D) + '</div>';
    var s2 = '<div class="sec"><h4><span>② 联动链 · 大盘 → 板块 → 个股</span><span>点名字切换</span></h4>' +
      (H.length ? '<div class="chips">' + H.map(function (h, i) { return '<span class="chip' + (i === st.pick ? ' on' : '') + '" data-pick="' + i + '">' + esc(h.name) + '</span>'; }).join('') + '</div>' + chainSVG(D, H[st.pick]) : '<div class="warn">没有持仓（数量&gt;0）</div>') + '</div>';
    var sum = 0, has = false; H.forEach(function (h) { if (ok(h.main)) { sum += h.main; has = true; } });
    var s3 = '<div class="sec"><h4><span>③ 持仓一览 · 主力合计 <b style="color:' + col(has ? sum : NaN) + '">' + (has ? yi(sum) : '—') + '</b></span><span>' + (D.secStale ? '<span class="warn">板块数据过龄·待刷新</span>' : '点行跳持仓卡') + '</span></h4>' + H.map(holdRow).join('') + '</div>';
    var A = todayA().slice().reverse();
    var s4 = '<div class="sec"><h4><span>④ 今日提醒</span><span>' + A.length + ' 条</span></h4>' +
      (A.length ? A.slice(0, 12).map(function (x) { return '<div class="al"><span>' + x.at + '</span><b style="color:' + (x.kind === 'hi' ? '#ffb0a8' : x.kind === 'lo' ? '#9fd0ff' : '#ffd21f') + ';font-weight:500">' + esc(x.txt) + '</b></div>'; }).join('') :
        '<div class="ft" style="margin:0">盘中触发：上证接近/冲出预判高低（0.3%内）、持仓板块10分钟内拉升或回落1个点、接近共振位、大盘快拉快跳水</div>') + '</div>';
    return head + s1 + s2 + s3 + s4 + '<div class="ft">' + hm(D.at) + ' 刷新 · 只读页面已有数据，不另发请求 · 提醒阈值是初值，未回测</div>';
  }

  /* ---------- 挂载 / 刷新 ---------- */
  function phone() { return document.querySelector('.phone'); }
  function onHolds() { var v = $('holds'); return !!(v && !v.hidden); }
  function mount() {
    var ph = phone();
    if (!ph) return false;
    if (!$('jlLkCss')) { var s = document.createElement('style'); s.id = 'jlLkCss'; s.textContent = CSS; document.head.appendChild(s); }
    if ($('jlLkBall')) return true;
    /* 挂 body(fixed): .phone 是 isolation 层, 放里面永远压不过 B/S 球(body 上 fixed z55); 坐标仍按 .phone 相对存 */
    var b = document.createElement('div'); b.id = 'jlLkBall'; b.title = '持仓联动'; document.body.appendChild(b);
    var sh = document.createElement('div'); sh.id = 'jlLkSheet'; sh.hidden = true; document.body.appendChild(sh);
    try { st.pos = JSON.parse(localStorage.getItem(POS) || 'null'); } catch (e) { }
    var s0 = null, moved = false;
    b.addEventListener('pointerdown', function (e) { s0 = { x: e.clientX, y: e.clientY, l: st.pos ? st.pos.l : 6, t: st.pos ? st.pos.t : 0 }; moved = false; try { b.setPointerCapture(e.pointerId); } catch (er) { } });
    b.addEventListener('pointermove', function (e) {
      if (!s0) return; var dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      if (!moved && Math.hypot(dx, dy) < 6) return; moved = true;
      var P = phone(); st.pos = { l: Math.max(0, Math.min(P.clientWidth - 54, s0.l + dx)), t: Math.max(50, Math.min(P.clientHeight - 120, s0.t + dy)) }; place();
    });
    b.addEventListener('pointerup', function () {
      if (!s0) return; s0 = null;
      if (!moved) { st.open = !st.open; if (st.open) st.unread = 0; tick(); return; }
      var P = phone(); st.pos.l = st.pos.l + 27 < P.clientWidth / 2 ? 6 : P.clientWidth - 60;
      b.style.transition = 'left .15s'; place(); setTimeout(function () { b.style.transition = ''; }, 200);
      try { localStorage.setItem(POS, JSON.stringify(st.pos)); } catch (e) { }
    });
    window.addEventListener('resize', place);
    sh.addEventListener('click', function (e) {
      var t = e.target.closest('[data-x],[data-pick],[data-jump]'); if (!t) return;
      if (t.hasAttribute('data-x')) { st.open = false; tick(); return; }
      if (t.hasAttribute('data-jump')) { st.open = false; tick(); try { window.jlLinkJumpJL && window.jlLinkJumpJL(t.getAttribute('data-jump')); } catch (er) { } return; }
      st.pick = +t.getAttribute('data-pick') || 0; tick();
    });
    return true;
  }
  function place() { /* 按 .phone 的屏幕位置摆浮球和面板; 挂载时版面未排好(高度0)或换屏后越界 → 回到左侧中部 */
    var P = phone(), b = $('jlLkBall'), sh = $('jlLkSheet');
    if (!P || !b) return;
    var r = P.getBoundingClientRect();
    if (r.height < 200) return;
    if (!st.pos || st.pos.t < 50 || st.pos.t > r.height - 120 || st.pos.l > r.width - 54) st.pos = { l: st.pos && st.pos.l <= r.width - 54 ? st.pos.l : 6, t: Math.round(r.height * 0.52) };
    b.style.left = (r.left + st.pos.l) + 'px'; b.style.top = (r.top + st.pos.t) + 'px';
    sh.style.left = (r.left + 8) + 'px'; sh.style.width = (r.width - 16) + 'px'; sh.style.bottom = (window.innerHeight - r.bottom + 66) + 'px';
  }
  function tick() {
    if (!mount()) return;
    var D = null; try { D = window.jlLinkInputJL ? window.jlLinkInputJL() : null; } catch (e) { }
    st.last = D;
    checkAlerts(D);
    var b = $('jlLkBall'), sh = $('jlLkSheet'), show = onHolds();
    b.style.display = show ? '' : 'none';
    place();
    b.innerHTML = ballHTML(D);
    sh.hidden = !(show && st.open);
    if (!sh.hidden) { var y = sh.scrollTop; sh.innerHTML = sheetHTML(D); sh.scrollTop = y; }
  }
  window.JLLink = { tick: tick, input: function () { return st.last; }, alerts: todayA, _check: checkAlerts, _st: st };
  function boot() { tick(); setInterval(tick, 20000); document.addEventListener('click', function () { setTimeout(function () { var b = $('jlLkBall'); if (b) b.style.display = onHolds() ? '' : 'none'; if (!onHolds() && st.open) { st.open = false; var s = $('jlLkSheet'); if (s) s.hidden = true; } }, 50); }, true); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
