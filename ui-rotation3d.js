/* Local preview: read-only 3D projection of the original rotation coordinates.
   X/Y retain CORE.rrgPt semantics; Z is observed trading-day index, never fund flow. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = n => n != null && Number.isFinite(+n) ? `${n > 0 ? '+' : ''}${(+n).toFixed(2)}%` : '—';
  const hm = n => n > 0 ? new Date(n).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}) : '—';
  const cash = n => n != null && Number.isFinite(+n) ? `${n > 0 ? '+' : ''}${(n/1e8).toFixed(2)}亿` : '—';
  let yaw = -.38, pitch = .30, selected = '', flat = false, current = null;
  function collect(api, svg) {
    const {S, CORE:C} = api, days = S.days || [], end = days.length-1;
    if(end < 0) return [];
    return [...svg.querySelectorAll('g[data-jlsec]')].map(g => {
      const sec = g.getAttribute('data-jlsec'), tail = [];
      for(let i=Math.max(0,end-4);i<=end;i++) {
        const q=C.rrgPt(days,i,sec,C.medianAt(days,i));
        if(q && Number.isFinite(q.x) && Number.isFinite(q.y)) tail.push({x:q.x,y:q.y,z:(i-end)*32,day:days[i].day});
      }
      return {sec,tail,avg:S.ana?.[sec]?.cur?.avg};
    }).filter(p=>p.tail.length);
  }
  function mount(block, svg) {
    const api=window.__JLSEC__; if(!api) return;
    const pts=collect(api,svg); if(!pts.length) return;
    const host=document.createElement('section'); host.className='r3d';
    host.innerHTML='<div class="r3dBar"><b>轮动 · 三维轨迹</b><span class="r3dTools"><button data-r3="left" aria-label="向左转动">↶</button><button data-r3="right" aria-label="向右转动">↷</button><button data-r3="reset">复位</button><button data-r3="flat" aria-pressed="false">原图</button></span></div><div class="r3dViewport"><canvas role="img" aria-label="三维板块轮动轨迹，可拖动旋转；下方按钮可选择板块"></canvas><span class="r3dHint">拖动视角 · 点选板块</span></div><div class="r3dLegend">左右＝相对强弱　上下＝动量　纵深＝交易日</div><div class="r3dPicks" aria-label="选择板块"></div><div class="r3dDetail" aria-live="polite"></div>';
    svg.insertAdjacentElement('beforebegin',host);
    const canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d');
    if(!ctx) {host.remove();return;}
    const detail=host.querySelector('.r3dDetail'),viewport=host.querySelector('.r3dViewport');
    let hits=[], width=300, height=246, dragging=null, moved=false;
    const maxX=Math.max(2,...pts.flatMap(p=>p.tail.map(q=>Math.abs(q.x)))) , maxY=Math.max(1.5,...pts.flatMap(p=>p.tail.map(q=>Math.abs(q.y))));
    if(!pts.some(p=>p.sec===selected))selected=pts.some(p=>p.sec===api.S.lead)?api.S.lead:pts[0].sec;
    function project(x,y,z) {
      const xx=x*Math.cos(yaw)+z*Math.sin(yaw), zz=-x*Math.sin(yaw)+z*Math.cos(yaw);
      const yy=y*Math.cos(pitch)-zz*Math.sin(pitch), depth=y*Math.sin(pitch)+zz*Math.cos(pitch);
      const scale=470/(470-depth), fit=Math.min(width/385,1.55);
      return {x:width/2+xx*scale*fit,y:height/2+yy*scale*fit+5,s:scale*fit,depth};
    }
    const coord=q=>project(q.x/maxX*120,-q.y/maxY*68,q.z);
    function line(points,color,lw=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.stroke();}
    function label(text,p,color='#f8f1e2',align='left'){ctx.font='12px -apple-system,"PingFang SC",sans-serif';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(text,p.x,p.y);}
    function draw(){
      if(!host.isConnected||flat)return;
      const rect=viewport.getBoundingClientRect();width=Math.max(240,rect.width||300);height=246;
      const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const back=-Math.min(4,api.S.days.length-1)*32;
      for(const z of [...new Set([back,0])]) {
        line([[-134,-80],[134,-80],[134,80],[-134,80],[-134,-80]].map(([x,y])=>project(x,y,z)),z===0?'#f5dba966':'#f5dba92e');
        line([project(-134,0,z),project(134,0,z)],'#ffffff24');line([project(0,-80,z),project(0,80,z)],'#ffffff24');
      }
      for(const [x,y] of [[-134,-80],[134,-80],[-134,80],[134,80]])line([project(x,y,back),project(x,y,0)],'#f5dba92e');
      label('改善',project(-128,-85,0));label('领先',project(128,-85,0),'#f3d69a','right');
      label('落后',project(-128,94,0));label('转弱',project(128,94,0),'#f8f1e2','right');
      if(back)label(String(api.S.days[Math.max(0,api.S.days.length-5)].day).slice(5),project(-138,64,back),'#d5ddff','right');
      label(String(api.S.days.at(-1).day).slice(5),project(-138,64,0),'#f3d69a','right');
      const dots=[];
      for(const p of pts){
        const color=p.sec===selected?'#ffe0a0':p.avg<0?'#8eafff':'#ff929a';
        line(p.tail.map(coord),p.sec===selected?'#ffe0a0dc':'#ffffff38',p.sec===selected?2:1);
        p.tail.forEach((q,i)=>dots.push({p,q,v:coord(q),end:i===p.tail.length-1,color}));
      }
      hits=[];dots.sort((a,b)=>a.v.depth-b.v.depth).forEach(({p,v,end,color})=>{
        const active=p.sec===selected,r=(end?(active?8:5):2)*v.s;
        if(end&&active){ctx.beginPath();ctx.arc(v.x,v.y,r+5,0,Math.PI*2);ctx.strokeStyle='#ffe0a080';ctx.stroke();}
        const grad=ctx.createRadialGradient(v.x-r*.35,v.y-r*.4,r*.08,v.x,v.y,r);
        grad.addColorStop(0,'#ffffff');grad.addColorStop(.32,color);grad.addColorStop(1,end?'#3b3444':'#55515a');
        ctx.beginPath();ctx.arc(v.x,v.y,r,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();
        if(end)hits.push({sec:p.sec,x:v.x,y:v.y,r:Math.max(13,r+5),depth:v.depth});
      });
      const labels=hits.filter(p=>p.sec===selected||p.sec===api.S.lead).sort((a,b)=>a.sec===selected?1:-1);
      labels.forEach(p=>{ctx.font='12px -apple-system,"PingFang SC",sans-serif';const w=ctx.measureText(p.sec).width;label(p.sec,{x:Math.max(w/2+4,Math.min(width-w/2-4,p.x)),y:Math.max(15,p.y-16)},p.sec===selected?'#ffe0a0':'#fff','center');});
    }
    function updateDetail(){
      const S=api.S,C=api.CORE,n=C.unalias(selected),m=S.bkq?.m||{},q=m[n]||m[n.replace(/概念$/,'')]||m[n+'概念'];
      const sig=q?C.fundSig(q,S.ana?.[selected]?.cur?.avg):null;
      const events=(S.surges||[]).filter(e=>e.sec===selected&&e.t>0).sort((a,b)=>a.t-b.t);
      const p=pts.find(p=>p.sec===selected),tag=sig?.k==='in'?'资金先进':sig?.k==='out'?'拉升 · 资金在出':'';
      detail.innerHTML='<div><b>'+esc(selected)+'</b><span>'+pct(p?.avg)+'</span><button data-r3="open">看股票 ›</button></div><p>'+(tag?'<em>'+esc(tag)+'</em>　':'')+'主力 '+cash(q?.f)+' · 快照 '+(S.bkq?.t?esc(new Date(S.bkq.t).toLocaleDateString('zh-CN'))+' '+hm(S.bkq.t):'未到')+(events.length?' · 首报 '+esc(new Date(events[0].t).toLocaleDateString('zh-CN'))+' '+hm(events[0].t):'')+'</p>';
      host.querySelectorAll('[data-r3-sector]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.r3Sector===selected)));
    }
    const picks=host.querySelector('.r3dPicks');pts.forEach(p=>{const b=document.createElement('button');b.textContent=p.sec;b.dataset.r3Sector=p.sec;b.type='button';picks.append(b);});
    function mode(){svg.classList.toggle('r3dOriginalHidden',!flat);viewport.hidden=flat;host.querySelector('.r3dLegend').hidden=flat;const b=host.querySelector('[data-r3="flat"]');b.textContent=flat?'回到 3D':'原图';b.setAttribute('aria-pressed',String(flat));draw();}
    host.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.r3Sector){selected=b.dataset.r3Sector;updateDetail();draw();return;}
      switch(b.dataset.r3){case 'left':yaw-=.18;break;case 'right':yaw+=.18;break;case 'reset':yaw=-.38;pitch=.30;break;case 'flat':flat=!flat;mode();return;case 'open':api.openSec(selected);return;}draw();
    });
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging={x:e.clientX,y:e.clientY,yaw,pitch,id:e.pointerId};moved=false;canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==dragging.id)return;const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){yaw=dragging.yaw+dx*.008;pitch=Math.max(-.8,Math.min(.8,dragging.pitch+dy*.006));draw();}});
    canvas.addEventListener('pointerup',e=>{if(!dragging||e.pointerId!==dragging.id)return;if(!moved){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const h=hits.filter(p=>Math.hypot(x-p.x,y-p.y)<p.r).sort((a,b)=>b.depth-a.depth)[0];if(h){selected=h.sec;updateDetail();draw();}}dragging=null;});
    canvas.addEventListener('pointercancel',()=>{dragging=null;});
    const ro=new ResizeObserver(draw);ro.observe(viewport);
    current?.dispose();current={host,dispose:()=>ro.disconnect()};mode();updateDetail();draw();
  }
  let queued=false;
  function scan(){queued=false;if(current&&!current.host.isConnected){current.dispose();current=null;}const body=document.getElementById('jlsectBody');if(!body)return;for(const block of body.children){const svg=[...block.children].find(e=>e.tagName.toLowerCase()==='svg'&&(e.getAttribute('viewBox')||e.getAttribute('viewbox'))==='0 0 300 190');if(svg&&!block.querySelector('.r3d'))mount(block,svg);}}
  function boot(){const root=document.querySelector('.phone')||document.body;new MutationObserver(changes=>{if(changes.some(c=>!c.target.closest?.('.r3d'))&&!queued){queued=true;requestAnimationFrame(scan);}}).observe(root,{subtree:true,childList:true});scan();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
