/* jl_rso.js v1 (11-25) RSO(回归斜率摆动) 纯计算 —— 函数体从 ks.html rsoPminJL/rsoCalcJL 原样拷出(ks.html 第 8100 行起, 11-25), 给 ftj.html 副图体检用。
   一致性: tools/bt/ftj_1125/rso_parity.js 比对 ks.html 原函数 0 差异才算数; ks.html 以后改 RSO 要两边一起改(或 ks 改成引这份)。
   用法: JLRso.calc(kl[[t,o,h,l,c,...]], klt'101|1|5|15|30') → {osc,sig,up,dn,n} | null; 只用 kl[i][4]=收盘 */
(function (W) {
function rsoPminJL(klt) { return klt === "101" ? 101 : (klt === "TS" || klt === "1") ? 1 : klt === "5D" ? 5 : (+klt || 5); }
function rsoCalcJL(kl, klt) {
  var m = rsoPminJL(klt) || 1, k = 5 / m;
  var mn = Math.max(m >= 15 ? 4 : 2, Math.round(10 * k)), sp = m >= 15 ? Math.max(2, Math.max(1, Math.round(5 * k))) : Math.max(1, Math.round(5 * k)), sg = Math.max(2, Math.round(7 * k)), N = 6;
  var n = kl.length;
  if (n < mn + sp * (N - 1) + sg + 3) return null;
  var lp = [], i, s2;
  for (i = 0; i < n; i++) { var c0 = kl[i][4]; lp.push(c0 > 0 ? Math.log(c0) : null); }
  function slope(end, L) { var sy = 0, sx = 0, sxy = 0, sx2 = 0, cc = 0, j; for (j = end - L + 1; j <= end; j++) { if (lp[j] == null) return null; var x = j - (end - L + 1); sy += lp[j]; sx += x; sxy += x * lp[j]; sx2 += x * x; cc++; } var den = L * sx2 - sx * sx; return cc === L && den ? (L * sxy - sx * sy) / den : null; }
  var osc = new Array(n).fill(null), sig = new Array(n).fill(null), up = new Array(n).fill(false), dn = new Array(n).fill(false);
  var buf = [], pO = null, pS = null;
  for (i = 0; i < n; i++) {
    if (lp[i] == null) { buf = []; pO = pS = null; continue; }
    if (i < mn + sp * (N - 1)) continue;
    var acc = 0, c2 = 0;
    for (s2 = 0; s2 < N; s2++) { var sv = slope(i, mn + sp * s2); if (sv == null) { c2 = -1; break; } acc += sv; c2++; }
    if (c2 < N) continue;
    osc[i] = acc / N;
    buf.push(osc[i]); if (buf.length > sg) buf.shift();
    if (buf.length === sg) sig[i] = buf.reduce(function (a, b) { return a + b; }, 0) / sg;
    if (pO != null && pS != null && sig[i] != null && pS != null) { if (pO <= pS && osc[i] > sig[i]) up[i] = true; else if (pO >= pS && osc[i] < sig[i]) dn[i] = true; }
    pO = osc[i]; pS = sig[i] != null ? sig[i] : pS;
  }
  return { osc: osc, sig: sig, up: up, dn: dn, n: n };
}
W.JLRso = { calc: rsoCalcJL, pmin: rsoPminJL, version: 'v1' };
})(window);
