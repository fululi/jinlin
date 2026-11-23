/* jl_tri.js v1 (2026-11-21) —— 平底/平顶三角识别（口径B），K线表(ks.html triDetect)用；以后首页/作战屏同口径也读这里。
   来源 tools/bt/tri_1121/det2.js（回测/小图同一套），用户 11-21 定：
   · 口径B：影线刺出平底不到容差(日3%，分钟按幅度缩放)、收盘收回的不算破
   · 突破/跌破(BOS)只当「位置提醒」，不是买卖信号（回测：比随便一根K线没优势，结果_1121.txt）
   用法 JLTri(kl, W, {minBars}) → {kind:'none'} 或 {kind,dir,a,j,e,touch,ign,tol,top,top2,slope,flat,flatMin,brkDir,at,height,target} */
(function () {
  "use strict";
function triV2(kl,W,opt){
    opt=opt||{}; const n=kl.length, s0=Math.max(0,n-W), H=i=>kl[i][2], L=i=>kl[i][3], C=i=>kl[i][4];
    const rg=[]; for(let i=s0;i<n;i++) rg.push((H(i)-L(i))/C(i)); rg.sort((a,b)=>a-b);
    const tol=opt.tol!=null?opt.tol:Math.min(0.03,Math.max(0.003,0.45*rg[rg.length>>1]));
    const FLAT=opt.flat||0.006;
    const out=[];
    // 找「突破那根」之前形成的形态：e = 形态最后一根，往回试几根
    for(let e=n-1;e>=Math.max(s0+8,n-12);e--){
      for(const dir of [-1,1]){ // -1 下降三角(平底)  1 上升三角(平顶)
        const P=i=>dir<0?H(i):-L(i), Q=i=>dir<0?L(i):-H(i), CC=i=>dir<0?C(i):-C(i); // 镜像后都按「下降三角」算
        // 起点 a：从最近往前试每个「左右各2根都比它低」的高点，且它是 a..e 里最高的；先要碰 ≥3 次的，没有再要 2 次
        const MINB=opt.minBars||8; const cands=[]; for(let i=e-MINB;i>=s0+2;i--){ if(!(P(i)>P(i-1)&&P(i)>P(i-2)&&P(i)>=P(i+1)&&P(i)>=P(i+2))) continue;
          let top=true; for(let k=i+1;k<=e;k++) if(P(k)>P(i)){top=false;break;} if(top) cands.push(i); }
        const tryA=function(a){
        let m=-Infinity, j=-1; for(let i=a+2;i<=e;i++){ const k=(P(i)-P(a))/(i-a); if(k>m){m=k;j=i;} }
        if(j<0||!(m<0)) return null;
        const U=i=>P(a)+m*(i-a);
        // 平底：a 之后的低点挨在一起的一组
        let best=null;
        for(let i=a+1;i<=e;i++){ const v=Q(i); const tc=[], ig=[]; let bad=false;
          for(let k=a+1;k<=e;k++){ const q=Q(k);
            if(q>=v&&q<=v*(1+FLAT)) tc.push(k);
            else if(q<v){ if(q>=v*(1-tol)&&CC(k)>=v) ig.push(k); else {bad=true;break;} } }
          if(bad||tc.length<2||tc[tc.length-1]-tc[0]<2) continue;
          if(!best||tc.length>best.tc.length||(tc.length===best.tc.length&&v<best.v)) best={v,tc,ig}; }
        if(!best) return null;
        const lv0=best.tc.map(Q).sort((x,y)=>x-y); if(!(U(e)>lv0[lv0.length>>1])) return null;
        return {a,m,j,U,best}; };
        let pick=null;
        for(const need of [3,2]){ for(const a of cands){ const r=tryA(a); if(r&&r.best.tc.length>=need){pick=r;break;} } if(pick) break; }
        if(!pick) continue;
        const {a,m,j,U,best}=pick;
  
        const lv=best.tc.map(Q).sort((x,y)=>x-y), med=lv[lv.length>>1], vmin=lv[0];
        if(!(U(e)>med)) continue;                       // 收敛：上沿在末端还在平底上方
        const apex=a+(P(a)-med)/(-m); if(apex<e) continue;
        // 突破：e 之后第一根收盘出线
        let brk=0, at=-1;
        for(let i=e+1;i<n;i++){ if(CC(i)<vmin*0.999){brk=-1;at=i;break;} if(CC(i)>U(i)*1.001){brk=1;at=i;break;} }
        // e 本身要是形态里最后一根（e+1 已经开始出线或者 e 就是最新一根）
        if(e<n-1&&brk===0) continue;
        if(e<n-1&&at!==e+1) continue;
        const height=P(a)-med;
        const un=v=>dir<0?v:-v;
        out.push({kind:dir<0?'下降三角':'上升三角',dir,a,j,e,touch:best.tc,ign:best.ig,tol,
          top:[a,un(P(a))],top2:[j,un(P(j))],slope:dir<0?m:-m,flat:un(med),flatMin:un(vmin),
          brk:brk*(dir<0?1:-1)*(dir<0?1:1), brkDir:brk===0?0:(dir<0?(brk<0?-1:1):(brk<0?1:-1)), at,
          height, target:brk===-1?un(med-height):brk===1?un(U(at)+height):null});
      }
      if(out.length) break;
    }
    if(!out.length) return {kind:'none',tol};
    return out.sort((x,y)=>y.a-x.a)[0];
  }
  
  window.JLTri = triV2;
  if (typeof module !== "undefined") module.exports = triV2;
})();
