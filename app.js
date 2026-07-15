/* ===== Base (header, menú móvil, coordenadas, contadores, quiz, formulario) ===== */
/* Supabase es OPCIONAL: si su SDK (CDN externo) no carga, la web debe seguir
   funcionando al 100% y el formulario envía igualmente por email. Nunca debe
   abortar app.js. */
/* OJO: NO llamar a esta variable `supabase`. El SDK por CDN crea un global
   `window.supabase`; declarar `let/const supabase` en el top-level de este
   script clásico colisiona con ese global y lanza un SyntaxError que aborta
   app.js ENTERO (toggle, quiz, formularios y raster dejan de funcionar). */
let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(
      'https://bisioblvzoegaqokamel.supabase.co',
      'sb_publishable_7__8eQRRx5RD09DRgnZQBw_Trn7Fqde'
    );
  }
} catch (e) { console.warn('Supabase no disponible; el formulario usará solo el envío por email.', e); }

const header=document.getElementById('site-header');
const onScroll=()=>{ if(window.scrollY>20){header.classList.add('bg-night/90','backdrop-blur-md','border-night-line','shadow-lg');}else{header.classList.remove('bg-night/90','backdrop-blur-md','border-night-line','shadow-lg');} };
window.addEventListener('scroll',onScroll); onScroll();

const menuBtn=document.getElementById('menu-btn'),mobileMenu=document.getElementById('mobile-menu');
menuBtn.addEventListener('click',()=>mobileMenu.classList.toggle('hidden'));
document.querySelectorAll('.mobile-link').forEach(a=>a.addEventListener('click',()=>mobileMenu.classList.add('hidden')));

/* Toggle de tema claro / oscuro */
(function(){
  const btn=document.getElementById('theme-btn');
  if(!btn)return;
  const root=document.documentElement;
  btn.addEventListener('click',()=>{
    const next=root.getAttribute('data-theme')==='light'?'dark':'light';
    root.setAttribute('data-theme',next);
    try{localStorage.setItem('mag-theme',next);}catch(e){}
    if(window.ScrollTrigger)setTimeout(()=>ScrollTrigger.refresh(),120);
  });
})();

/* ===== Simulación de mecanizado CNC en Canvas 2D (panel del hero) =====
   Canvas 2D puro, sin dependencias de CDN. Bucle infinito automático.
   - Cajera isométrica con islas y planificación de velocidad tipo CNC:
     pases backward/forward de look-ahead (desacelera en curvas, acelera en rectas)
   - Rastro incandescente que se dibuja tras la punta y se desvanece al cerrar el ciclo
   - Virutas: micro-partículas despedidas en dirección contraria al avance
   - Micro-vibración de husillo y banda de brillo que simula el giro a altas RPM
   - Rendimiento: escena estática pre-renderizada, RAF pausado si el panel no está
     visible, DPR limitado a 2. Las coordenadas del HUD salen de la posición real. */
(function(){
  const cv=document.getElementById('sim-canvas');
  const rxEl=document.getElementById('rx'),ryEl=document.getElementById('ry'),rzEl=document.getElementById('rz');
  function fallbackCoords(){ if(!rxEl)return; let t=0;
    setInterval(()=>{t+=0.18;rxEl.textContent=(180+Math.sin(t)*110).toFixed(3);ryEl.textContent=(-40+Math.cos(t*0.8)*90).toFixed(3);rzEl.textContent=(-12+Math.sin(t*1.3)*3).toFixed(3);},220); }
  if(!cv||!cv.getContext){ fallbackCoords(); return; }
  try{
  const ctx=cv.getContext('2d');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Proyección isométrica: coords del bloque (0..190) -> pantalla lógica 600x420 --- */
  const VW=600,VH=420,CA=1.02,SA=0.53,OX=300,OY=78,BS=190,WALL=62,P0=30,P1=160,ZF=-30,ZI=-12;
  const isoX=(x,y)=>OX+(x-y)*CA;
  const isoY=(x,y,z)=>OY+(x+y)*SA-z;

  /* --- Trayectoria (coords locales de la cajera 0..130; +30 = coords del bloque).
     Contorneado exterior (2 pases), acabado alrededor de la isla rectangular,
     órbita de la isla cilíndrica y planeado del fondo. [x, y, radio de empalme] --- */
  const RAW=[[50,8,0],[122,8,10],[122,122,12],[8,122,12],[8,8,10],[46,8,4],
    [46,20,6],[110,20,8],[110,110,10],[20,110,10],[20,20,8],[40,20,4],
    [30,34,6],[25,48,5],[25,89,8],[67,89,8],[67,43,8],[29,43,4],
    [24,36,4],[48,30,6],[66,30,4]];
  for(let a=160;a>=-165;a-=13){const t=a*Math.PI/180;RAW.push([88+18*Math.cos(t),44+18*Math.sin(t),2]);}
  RAW.push([68.5,50,5],[70,74,6],[80,90,8],[100,94,6],[106,99,4],[102,104,5],[30,104,6],[26,110,4],[102,112,0]);

  /* Empalme de esquinas con bezier cuadrática y densificado del recorrido */
  function densify(raw){
    const P=raw.map(p=>({x:p[0]+P0,y:p[1]+P0,r:p[2]})),pts=[{x:P[0].x,y:P[0].y}];
    for(let i=1;i<P.length-1;i++){
      const a=P[i-1],v=P[i],b=P[i+1];
      const d1=Math.hypot(v.x-a.x,v.y-a.y),d2=Math.hypot(b.x-v.x,b.y-v.y);
      const t=Math.min(v.r,d1*0.45,d2*0.45);
      if(t<0.3){pts.push({x:v.x,y:v.y});continue;}
      const p1={x:v.x+(a.x-v.x)/d1*t,y:v.y+(a.y-v.y)/d1*t};
      const p2={x:v.x+(b.x-v.x)/d2*t,y:v.y+(b.y-v.y)/d2*t};
      const n=Math.max(3,Math.ceil(t*1.4));
      for(let k=0;k<=n;k++){const u=k/n,w=1-u;
        pts.push({x:w*w*p1.x+2*w*u*v.x+u*u*p2.x,y:w*w*p1.y+2*w*u*v.y+u*u*p2.y});}
    }
    pts.push({x:P[P.length-1].x,y:P[P.length-1].y});
    return pts;
  }
  const STEP=1.25;
  function resample(pts){
    const xs=[pts[0].x],ys=[pts[0].y];let need=STEP;
    for(let i=1;i<pts.length;i++){
      let ax=pts[i-1].x,ay=pts[i-1].y;
      const bx=pts[i].x,by=pts[i].y;
      let seg=Math.hypot(bx-ax,by-ay);
      while(seg>=need){
        const u=need/seg;
        ax+=(bx-ax)*u;ay+=(by-ay)*u;
        xs.push(ax);ys.push(ay);
        seg=Math.hypot(bx-ax,by-ay);need=STEP;
      }
      need-=seg;
    }
    return{xs,ys};
  }
  const {xs,ys}=resample(densify(RAW));
  const N=xs.length,TOTAL=(N-1)*STEP;

  /* Planificación de velocidad (look-ahead): límite por curvatura + rampas de acel/decel */
  const VMAX=64,VMIN=9,ALAT=110,AACC=150;
  const vel=new Float32Array(N);
  for(let i=0;i<N;i++){
    if(i===0||i===N-1){vel[i]=VMIN;continue;}
    const a1=Math.atan2(ys[i]-ys[i-1],xs[i]-xs[i-1]),a2=Math.atan2(ys[i+1]-ys[i],xs[i+1]-xs[i]);
    let d=Math.abs(a2-a1);if(d>Math.PI)d=2*Math.PI-d;
    const k=d/STEP;
    vel[i]=Math.max(VMIN,Math.min(VMAX,k>1e-4?Math.sqrt(ALAT/k):VMAX));
  }
  for(let i=N-2;i>=0;i--)vel[i]=Math.min(vel[i],Math.sqrt(vel[i+1]*vel[i+1]+2*AACC*STEP));
  for(let i=1;i<N;i++)vel[i]=Math.min(vel[i],Math.sqrt(vel[i-1]*vel[i-1]+2*AACC*STEP));
  function pathPos(d){
    const f=Math.min(d/STEP,N-1.001),i=f|0,u=f-i;
    return[xs[i]+(xs[i+1]-xs[i])*u,ys[i]+(ys[i+1]-ys[i])*u,vel[i]];
  }

  /* Islas (coords del bloque) */
  const IA={x0:64,y0:82,x1:88,y1:110};
  const IB={cx:118,cy:74,r:9};

  /* --- Lienzos auxiliares: escena estática y rastro persistente --- */
  const trailC=document.createElement('canvas'),staticC=document.createElement('canvas');
  const tctx=trailC.getContext('2d'),sctx=staticC.getContext('2d');
  let dpr=1,scl=1,ofx=0,ofy=0;
  function applyT(c){c.setTransform(dpr*scl,0,0,dpr*scl,dpr*ofx,dpr*ofy);}
  function openingPath(c){
    c.beginPath();
    c.moveTo(isoX(P0,P0),isoY(P0,P0,0));c.lineTo(isoX(P1,P0),isoY(P1,P0,0));
    c.lineTo(isoX(P1,P1),isoY(P1,P1,0));c.lineTo(isoX(P0,P1),isoY(P0,P1,0));
    c.closePath();
  }
  function quad(c,p,fill,stroke){
    c.beginPath();c.moveTo(p[0][0],p[0][1]);
    for(let i=1;i<p.length;i++)c.lineTo(p[i][0],p[i][1]);
    c.closePath();c.fillStyle=fill;c.fill();
    if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}
  }

  function buildStatic(){
    staticC.width=cv.width;staticC.height=cv.height;
    const c=sctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,staticC.width,staticC.height);
    applyT(c);
    /* caras laterales exteriores del bloque */
    let g=c.createLinearGradient(0,isoY(0,BS,0),0,isoY(0,BS,-WALL));
    g.addColorStop(0,'#233140');g.addColorStop(1,'#131C26');
    quad(c,[[isoX(0,BS),isoY(0,BS,0)],[isoX(BS,BS),isoY(BS,BS,0)],[isoX(BS,BS),isoY(BS,BS,-WALL)],[isoX(0,BS),isoY(0,BS,-WALL)]],g,'#2C3B4C');
    g=c.createLinearGradient(0,isoY(BS,0,0),0,isoY(BS,0,-WALL));
    g.addColorStop(0,'#18222E');g.addColorStop(1,'#0C131B');
    quad(c,[[isoX(BS,BS),isoY(BS,BS,0)],[isoX(BS,0),isoY(BS,0,0)],[isoX(BS,0),isoY(BS,0,-WALL)],[isoX(BS,BS),isoY(BS,BS,-WALL)]],g,'#2C3B4C');
    /* suelo de la cajera */
    g=c.createLinearGradient(0,isoY(P0,P0,ZF),0,isoY(P1,P1,ZF));
    g.addColorStop(0,'#0B1017');g.addColorStop(1,'#0E1620');
    quad(c,[[isoX(P0,P0),isoY(P0,P0,ZF)],[isoX(P1,P0),isoY(P1,P0,ZF)],[isoX(P1,P1),isoY(P1,P1,ZF)],[isoX(P0,P1),isoY(P0,P1,ZF)]],g,'#2C3B4C');
    /* paredes interiores visibles (las lejanas) */
    quad(c,[[isoX(P0,P0),isoY(P0,P0,0)],[isoX(P1,P0),isoY(P1,P0,0)],[isoX(P1,P0),isoY(P1,P0,ZF)],[isoX(P0,P0),isoY(P0,P0,ZF)]],'#111B26');
    quad(c,[[isoX(P0,P0),isoY(P0,P0,0)],[isoX(P0,P1),isoY(P0,P1,0)],[isoX(P0,P1),isoY(P0,P1,ZF)],[isoX(P0,P0),isoY(P0,P0,ZF)]],'#0B141D');
    /* cara superior con el hueco de la cajera (evenodd) */
    g=c.createLinearGradient(0,isoY(0,0,0),0,isoY(BS,BS,0));
    g.addColorStop(0,'#32414F');g.addColorStop(1,'#1C2734');
    c.beginPath();
    c.moveTo(isoX(0,0),isoY(0,0,0));c.lineTo(isoX(BS,0),isoY(BS,0,0));
    c.lineTo(isoX(BS,BS),isoY(BS,BS,0));c.lineTo(isoX(0,BS),isoY(0,BS,0));c.closePath();
    c.moveTo(isoX(P0,P0),isoY(P0,P0,0));c.lineTo(isoX(P1,P0),isoY(P1,P0,0));
    c.lineTo(isoX(P1,P1),isoY(P1,P1,0));c.lineTo(isoX(P0,P1),isoY(P0,P1,0));c.closePath();
    c.fillStyle=g;c.fill('evenodd');
    c.beginPath();
    c.moveTo(isoX(0,0),isoY(0,0,0));c.lineTo(isoX(BS,0),isoY(BS,0,0));
    c.lineTo(isoX(BS,BS),isoY(BS,BS,0));c.lineTo(isoX(0,BS),isoY(0,BS,0));c.closePath();
    c.strokeStyle='#3A4B5E';c.lineWidth=1;c.stroke();
    openingPath(c);c.strokeStyle='#4A5B6E';c.lineWidth=1.2;c.stroke();
    /* aristas wireframe verdes */
    c.strokeStyle='rgba(18,247,160,0.35)';c.lineWidth=0.9;
    c.beginPath();
    c.moveTo(isoX(0,0),isoY(0,0,0));c.lineTo(isoX(0,BS),isoY(0,BS,0));c.lineTo(isoX(BS,BS),isoY(BS,BS,0));c.lineTo(isoX(BS,0),isoY(BS,0,0));c.lineTo(isoX(0,0),isoY(0,0,0));
    c.moveTo(isoX(0,BS),isoY(0,BS,0));c.lineTo(isoX(0,BS),isoY(0,BS,-WALL));
    c.moveTo(isoX(BS,BS),isoY(BS,BS,0));c.lineTo(isoX(BS,BS),isoY(BS,BS,-WALL));
    c.moveTo(isoX(BS,0),isoY(BS,0,0));c.lineTo(isoX(BS,0),isoY(BS,0,-WALL));
    c.stroke();
    /* trayectoria programada (discontinua, bajo el rastro real) */
    c.save();openingPath(c);c.clip();
    c.setLineDash([3,5]);c.strokeStyle='#33465e';c.lineWidth=1;
    c.beginPath();c.moveTo(isoX(xs[0],ys[0]),isoY(xs[0],ys[0],ZF));
    for(let i=2;i<N;i+=2)c.lineTo(isoX(xs[i],ys[i]),isoY(xs[i],ys[i],ZF));
    c.stroke();c.setLineDash([]);c.restore();
    /* cota y triada de ejes */
    c.setLineDash([2,3]);c.strokeStyle='#33465e';c.lineWidth=0.7;
    c.beginPath();c.moveTo(300,82);c.lineTo(475,172);c.stroke();c.setLineDash([]);
    c.fillStyle='#8592A3';c.font='600 9px Barlow,sans-serif';
    c.fillText('Ø12 · z-30',392,118);
    c.save();c.translate(66,360);c.lineWidth=1.4;c.font='600 10px Barlow,sans-serif';
    c.strokeStyle='#FF5A3C';c.beginPath();c.moveTo(0,0);c.lineTo(34,17);c.stroke();
    c.fillStyle='#FF5A3C';c.fillText('X',38,20);
    c.strokeStyle='#12F7A0';c.beginPath();c.moveTo(0,0);c.lineTo(-30,16);c.stroke();
    c.fillStyle='#12F7A0';c.fillText('Y',-42,19);
    c.strokeStyle='#FFC400';c.beginPath();c.moveTo(0,0);c.lineTo(0,-34);c.stroke();
    c.fillStyle='#FFC400';c.fillText('Z',-4,-38);
    c.restore();
  }

  function drawIslandA(c){
    quad(c,[[isoX(IA.x0,IA.y1),isoY(IA.x0,IA.y1,ZI)],[isoX(IA.x1,IA.y1),isoY(IA.x1,IA.y1,ZI)],[isoX(IA.x1,IA.y1),isoY(IA.x1,IA.y1,ZF)],[isoX(IA.x0,IA.y1),isoY(IA.x0,IA.y1,ZF)]],'#15222F');
    quad(c,[[isoX(IA.x1,IA.y1),isoY(IA.x1,IA.y1,ZI)],[isoX(IA.x1,IA.y0),isoY(IA.x1,IA.y0,ZI)],[isoX(IA.x1,IA.y0),isoY(IA.x1,IA.y0,ZF)],[isoX(IA.x1,IA.y1),isoY(IA.x1,IA.y1,ZF)]],'#0E1721');
    quad(c,[[isoX(IA.x0,IA.y0),isoY(IA.x0,IA.y0,ZI)],[isoX(IA.x1,IA.y0),isoY(IA.x1,IA.y0,ZI)],[isoX(IA.x1,IA.y1),isoY(IA.x1,IA.y1,ZI)],[isoX(IA.x0,IA.y1),isoY(IA.x0,IA.y1,ZI)]],'#24333F','#3A4B5E');
  }
  function drawIslandB(c){
    const rx=IB.r*1.24,ry=IB.r*0.64;
    const sx=isoX(IB.cx,IB.cy),yT=isoY(IB.cx,IB.cy,ZI),yB=isoY(IB.cx,IB.cy,ZF);
    c.beginPath();
    c.moveTo(sx-rx,yT);c.lineTo(sx-rx,yB);
    c.ellipse(sx,yB,rx,ry,0,Math.PI,0,true);
    c.lineTo(sx+rx,yT);
    c.ellipse(sx,yT,rx,ry,0,0,Math.PI,false);
    c.closePath();
    const g=c.createLinearGradient(sx-rx,0,sx+rx,0);
    g.addColorStop(0,'#101B27');g.addColorStop(0.55,'#1B2A38');g.addColorStop(1,'#0C141D');
    c.fillStyle=g;c.fill();
    c.beginPath();c.ellipse(sx,yT,rx,ry,0,0,Math.PI*2);
    c.fillStyle='#24333F';c.fill();c.strokeStyle='#3A4B5E';c.lineWidth=1;c.stroke();
  }

  /* Herramienta: parte de corte (recortada dentro de la cajera) y cuerpo superior */
  function drawCutterLower(c,sx,sy,time){
    c.save();c.translate(sx,sy);
    const g=c.createLinearGradient(-8,0,8,0);
    g.addColorStop(0,'#3C4757');g.addColorStop(0.5,'#CDD8E4');g.addColorStop(1,'#3C4757');
    c.fillStyle=g;c.fillRect(-8,-30,16,26);
    c.strokeStyle='#26323F';c.lineWidth=0.6;c.strokeRect(-8,-30,16,26);
    c.lineWidth=1;c.beginPath();c.moveTo(-4,-4);c.lineTo(2,-30);c.moveTo(3,-4);c.lineTo(7,-30);c.stroke();
    /* banda de brillo que barre el cuerpo: giro a altas RPM */
    const band=(time*7.5)%1;
    c.globalAlpha=0.18+0.62*Math.abs(Math.sin(time*40));
    c.fillStyle='#FFFFFF';c.fillRect(-8+band*13.4,-30,2.4,26);
    c.globalAlpha=0.03+0.05*(0.5+0.5*Math.sin(time*93));
    c.fillRect(-8,-30,16,26);
    c.globalAlpha=1;
    c.fillStyle='#E4ECF4';c.beginPath();c.moveTo(-8,-4);c.lineTo(8,-4);c.lineTo(0,9);c.closePath();c.fill();
    c.restore();
  }
  function drawToolUpper(c,sx,sy,time){
    c.save();c.translate(sx,sy);
    const g=c.createLinearGradient(-10,0,10,0);
    g.addColorStop(0,'#3C4757');g.addColorStop(0.5,'#CDD8E4');g.addColorStop(1,'#3C4757');
    c.fillStyle=g;c.fillRect(-10,-96,20,66);
    c.strokeStyle='#26323F';c.lineWidth=0.6;c.strokeRect(-10,-96,20,66);
    const band=(time*7.5+0.4)%1;
    c.globalAlpha=0.10+0.25*Math.abs(Math.sin(time*40+1.2));
    c.fillStyle='#FFFFFF';c.fillRect(-10+band*17,-96,3,66);
    c.globalAlpha=1;
    c.fillStyle='#7C8A9B';c.beginPath();c.ellipse(0,-96,10,3.4,0,0,Math.PI*2);c.fill();
    c.fillStyle='#556475';c.fillRect(-12,-34,24,5);
    c.strokeStyle='rgba(18,247,160,0.6)';c.lineWidth=0.8;c.setLineDash([3,3]);
    c.beginPath();c.moveTo(0,-96);c.lineTo(0,-118);c.stroke();c.setLineDash([]);
    c.restore();
  }

  /* --- Virutas: pool de micro-partículas metálicas --- */
  const POOL=90,parts=[];
  const CHIP_COLS=['#5A6675','#7C8A9B','#B4C1D0','#CDD8E4'];
  function spawnChip(sx,sy,tx,ty){
    if(parts.length>=POOL)parts.shift();
    const spark=Math.random()<0.16;
    const back=40+Math.random()*70,up=30+Math.random()*70,side=(Math.random()-0.5)*60;
    parts.push({x:sx,y:sy-2,vx:-tx*back-ty*side,vy:-ty*back+tx*side-up,
      life:0.28+Math.random()*0.45,t:0,spark,
      col:spark?(Math.random()<0.5?'#FFC400':'#EFFFF7'):CHIP_COLS[Math.random()*4|0]});
  }
  function drawParts(c,dt){
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i];p.t+=dt;
      if(p.t>=p.life){parts.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;
      const a=1-p.t/p.life;
      c.globalAlpha=p.spark?a:a*0.9;
      c.globalCompositeOperation=p.spark?'lighter':'source-over';
      c.strokeStyle=p.col;c.lineWidth=p.spark?1.1:1.4;
      c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*0.018,p.y-p.vy*0.018);c.stroke();
    }
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }

  /* --- Máquina de estados del ciclo: plunge -> cut -> retract -> rapid --- */
  const SX0=xs[0],SY0=ys[0],EX0=xs[N-1],EY0=ys[N-1];
  const easeIO=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  let phase='plunge',ph=0,dist=0,time=0,lastTs=0,frame=0;
  let running=false,inView=true;
  let lastGX=null,lastGY=null,tanX=1,tanY=0,emitAcc=0,hudAcc=0;
  const recent=[];

  function tick(ts){
    if(!running)return;
    requestAnimationFrame(tick);
    const dt=Math.min(0.05,(ts-lastTs)/1000||0.016);lastTs=ts;time+=dt;frame++;
    let px,py,lift=0,spd=0,cutting=false;
    if(phase==='plunge'){ph+=dt/0.7;const u=Math.min(ph,1);px=SX0;py=SY0;lift=26*(1-u*u);
      if(ph>=1){phase='cut';ph=0;dist=0;}}
    else if(phase==='cut'){
      const p=pathPos(dist);px=p[0];py=p[1];spd=p[2];cutting=true;
      dist+=spd*dt;
      if(dist>=TOTAL){phase='retract';ph=0;}}
    else if(phase==='retract'){ph+=dt/0.45;const u=Math.min(ph,1);px=EX0;py=EY0;lift=26*u*u;
      if(ph>=1){phase='rapid';ph=0;}}
    else{ph+=dt/0.9;const u=easeIO(Math.min(ph,1));
      px=EX0+(SX0-EX0)*u;py=EY0+(SY0-EY0)*u;lift=26;
      if(ph>=1){phase='plunge';ph=0;recent.length=0;}}
    const tipZ=ZF+lift;
    /* micro-vibración de alta frecuencia, proporcional al avance */
    let vibx=0,viby=0;
    if(cutting){const amp=0.7*(0.4+0.6*spd/VMAX);
      vibx=(Math.random()-0.5)*amp;viby=(Math.random()-0.5)*amp;}
    const sx=isoX(px,py)+vibx,sy=isoY(px,py,tipZ)+viby;
    const gx=isoX(px,py),gy=isoY(px,py,ZF);
    if(cutting&&lastGX!==null){
      const dxs=gx-lastGX,dys=gy-lastGY,m=Math.hypot(dxs,dys);
      if(m>0.15){tanX=dxs/m;tanY=dys/m;}
      /* rastro persistente: núcleo caliente + halo, en su propio lienzo */
      if(m>0.01){
        applyT(tctx);tctx.lineCap='round';tctx.lineJoin='round';
        tctx.beginPath();tctx.moveTo(lastGX,lastGY);tctx.lineTo(gx,gy);
        tctx.strokeStyle='rgba(18,247,160,0.10)';tctx.lineWidth=7;tctx.stroke();
        tctx.strokeStyle='rgba(18,247,160,0.32)';tctx.lineWidth=3.4;tctx.stroke();
        tctx.strokeStyle='rgba(184,255,227,0.95)';tctx.lineWidth=1.5;tctx.stroke();
        recent.push({x:gx,y:gy});if(recent.length>26)recent.shift();
      }
    }
    /* desvanecimiento: lento durante el corte, rápido al cerrar el ciclo */
    tctx.setTransform(1,0,0,1,0,0);
    tctx.globalCompositeOperation='destination-out';
    if(!cutting){tctx.fillStyle='rgba(0,0,0,0.055)';tctx.fillRect(0,0,trailC.width,trailC.height);}
    else if(frame%10===0){tctx.fillStyle='rgba(0,0,0,0.022)';tctx.fillRect(0,0,trailC.width,trailC.height);}
    tctx.globalCompositeOperation='source-over';
    /* emisión de virutas contraria al avance */
    if(cutting){emitAcc+=dt*(18+spd*0.85);
      while(emitAcc>=1){emitAcc-=1;spawnChip(gx,gy,tanX,tanY);}}

    /* ---- composición del fotograma ---- */
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);
    ctx.drawImage(staticC,0,0);
    applyT(ctx);
    ctx.save();openingPath(ctx);ctx.clip();
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(trailC,0,0);applyT(ctx);
    if(recent.length>1){
      ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
      for(let i=1;i<recent.length;i++){
        ctx.strokeStyle='rgba(150,255,215,'+((i/recent.length)*0.55).toFixed(3)+')';
        ctx.lineWidth=2.4;
        ctx.beginPath();ctx.moveTo(recent[i-1].x,recent[i-1].y);ctx.lineTo(recent[i].x,recent[i].y);ctx.stroke();
      }
      ctx.globalCompositeOperation='source-over';
    }
    if(cutting){
      ctx.globalCompositeOperation='lighter';
      const gg=ctx.createRadialGradient(gx,gy,0,gx,gy,11);
      gg.addColorStop(0,'rgba(190,255,225,0.85)');
      gg.addColorStop(0.35,'rgba(18,247,160,0.35)');
      gg.addColorStop(1,'rgba(18,247,160,0)');
      ctx.fillStyle=gg;ctx.beginPath();ctx.arc(gx,gy,11,0,Math.PI*2);ctx.fill();
      ctx.globalCompositeOperation='source-over';
    }
    drawParts(ctx,dt);
    /* orden pintor: islas y fresa según profundidad isométrica (x+y) */
    const items=[
      {d:(IA.x0+IA.y0+IA.x1+IA.y1)/2,f:drawIslandA},
      {d:IB.cx+IB.cy,f:drawIslandB},
      {d:px+py,f:function(c){drawCutterLower(c,sx,sy,time);}}
    ];
    items.sort(function(a,b){return a.d-b.d;});
    for(let i=0;i<items.length;i++)items[i].f(ctx);
    ctx.restore();
    drawToolUpper(ctx,sx,sy,time);
    /* HUD con la posición real */
    hudAcc+=dt;
    if(hudAcc>0.15&&rxEl){hudAcc=0;
      rxEl.textContent=(px*1.35+18.4).toFixed(3);
      ryEl.textContent=(py*1.1-148.6).toFixed(3);
      rzEl.textContent=((tipZ+30)*0.86-12.744+(cutting?Math.sin(time*9)*0.02:0)).toFixed(3);
    }
    if(cutting){lastGX=gx;lastGY=gy;}else{lastGX=null;}
  }

  /* Escena fija para prefers-reduced-motion: pieza + trayectoria completa + fresa parada */
  function renderStaticScene(){
    tctx.setTransform(1,0,0,1,0,0);tctx.clearRect(0,0,trailC.width,trailC.height);
    applyT(tctx);tctx.lineCap='round';tctx.lineJoin='round';
    tctx.beginPath();tctx.moveTo(isoX(xs[0],ys[0]),isoY(xs[0],ys[0],ZF));
    for(let i=1;i<N;i++)tctx.lineTo(isoX(xs[i],ys[i]),isoY(xs[i],ys[i],ZF));
    tctx.strokeStyle='rgba(18,247,160,0.12)';tctx.lineWidth=6;tctx.stroke();
    tctx.strokeStyle='rgba(18,247,160,0.55)';tctx.lineWidth=1.6;tctx.stroke();
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);
    ctx.drawImage(staticC,0,0);
    applyT(ctx);ctx.save();openingPath(ctx);ctx.clip();
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(trailC,0,0);applyT(ctx);
    const mid=(N*0.55)|0,msx=isoX(xs[mid],ys[mid]),msy=isoY(xs[mid],ys[mid],ZF);
    drawIslandA(ctx);drawIslandB(ctx);drawCutterLower(ctx,msx,msy,0.3);
    ctx.restore();drawToolUpper(ctx,msx,msy,0.3);
  }

  function resize(){
    const r=cv.parentElement.getBoundingClientRect();
    if(r.width<10||r.height<10)return;
    dpr=Math.min(window.devicePixelRatio||1,2);
    cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
    scl=Math.min(r.width/VW,r.height/VH);
    ofx=(r.width-VW*scl)/2;ofy=(r.height-VH*scl)/2;
    trailC.width=cv.width;trailC.height=cv.height;
    buildStatic();
    if(reduced)renderStaticScene();
  }
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(cv.parentElement);
  else window.addEventListener('resize',resize);
  resize();

  if(reduced){renderStaticScene();return;}

  /* RAF solo cuando el panel está en pantalla y la pestaña visible */
  function updRun(){
    const want=inView&&!document.hidden;
    if(want&&!running){running=true;lastTs=performance.now();requestAnimationFrame(tick);}
    else if(!want){running=false;}
  }
  if('IntersectionObserver'in window){
    new IntersectionObserver(function(es){inView=es[0].isIntersecting;updRun();},{threshold:0.02}).observe(cv);
  }
  document.addEventListener('visibilitychange',updRun);
  updRun();
  }catch(err){
    console.warn('Simulación de mecanizado no disponible; HUD en modo básico.',err);
    fallbackCoords();
  }
})();

const cIO=new IntersectionObserver((es)=>{es.forEach(e=>{if(!e.isIntersecting)return;const el=e.target,tgt=+el.dataset.target,sfx=el.dataset.suffix||'';let s=null;const d=1800;
const step=(ts)=>{if(!s)s=ts;const p=Math.min((ts-s)/d,1),ez=1-Math.pow(1-p,4);el.textContent=Math.floor(ez*tgt)+sfx;if(p<1)requestAnimationFrame(step);else el.textContent=tgt+sfx;};
requestAnimationFrame(step);cIO.unobserve(el);});},{threshold:0.5});
document.querySelectorAll('.counter').forEach(el=>cIO.observe(el));

document.getElementById('contact-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const f=e.target,msg=document.getElementById('form-msg');
  if(f._gotcha&&f._gotcha.value){return;}
  if(!f.name.value||!f.email.value||!f.company.value){f.reportValidity();return;}
  const btn=f.querySelector('button[type="submit"]');
  btn.disabled=true;
  msg.classList.remove('hidden','text-alert');msg.classList.add('text-cyber');
  msg.textContent='Enviando tu solicitud...';
  try{
    if(supabaseClient){
      supabaseClient.from('leads').insert({
        nombre:f.name.value,
        empresa:f.company.value,
        email:f.email.value,
        telefono:f.phone.value,
        detalles:f.description.value,
        inactividad:f.downtime.value
      }).then(({error})=>{ if(error) console.error('Supabase insert error:', error); }).catch(()=>{});
    }
    const r=await fetch('https://formsubmit.co/ajax/chapy9716@gmail.com',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        nombre:f.name.value,
        empresa:f.company.value,
        email:f.email.value,
        telefono:f.phone.value,
        detalles:f.description.value,
        inactividad:f.downtime.value,
        _subject:'Nuevo lead — web MAG INDUSTRIES',
        _template:'table'
      })
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    msg.innerHTML='<i aria-hidden="true" class="fa-solid fa-circle-check mr-1"></i> Solicitud enviada. Te contactaremos en menos de 24 h.';
    f.reset();
  }catch(err){
    msg.classList.remove('text-cyber');msg.classList.add('text-alert');
    msg.innerHTML='No se pudo enviar el formulario. Escríbenos por <a class="underline font-bold" target="_blank" rel="noopener" href="https://wa.me/34635013953">WhatsApp</a> o llama al +34 635 013 953.';
  }finally{
    btn.disabled=false;
  }
});

(function(){
  const questions=[
    {id:'machines',text:'¿Cuántos centros de mecanizado o tornos CNC avanzados tienes en planta?',options:['1-3 máquinas','4-10 máquinas','Más de 10 máquinas']},
    {id:'reason',text:'¿Cuál es el motivo principal por el que se detienen tus máquinas?',options:['Escasez de programadores cualificados','Retrasos en diseño de utillajes','Tiempos de preparación excesivos']},
    {id:'hours',text:'¿Cuántas horas semanales estimas que tus máquinas están inactivas?',options:['Menos de 5 horas','5-20 horas','Más de 20 horas']}
  ];
  const answers={};let step=0;
  const body=document.getElementById('quiz-body'),stage=document.getElementById('quiz-stage'),back=document.getElementById('quiz-back'),steps=document.querySelectorAll('.quiz-step');
  function progress(){steps.forEach((el,i)=>{el.classList.toggle('bg-safety',i<=step);el.classList.toggle('bg-night-line',i>step);});}
  function render(){const q=questions[step];stage.textContent=`Etapa ${step+1} / ${questions.length}`;back.classList.toggle('hidden',step===0);progress();
    body.innerHTML=`<h3 class="text-xl sm:text-2xl font-bold mb-6">${q.text}</h3><div class="grid sm:grid-cols-3 gap-3" role="radiogroup">${q.options.map(o=>`<button type="button" data-v="${o}" class="quiz-opt text-left px-5 py-4 border border-night-line bg-night-soft text-steel-200 text-sm font-medium rounded-sm hover:border-safety/60">${o}</button>`).join('')}</div>`;
    body.querySelectorAll('.quiz-opt').forEach(btn=>{btn.addEventListener('click',()=>{body.querySelectorAll('.quiz-opt').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');answers[q.id]=btn.dataset.v;setTimeout(()=>{if(step<questions.length-1){step++;render();}else{result();}},280);});});
  }
  function result(){back.classList.add('hidden');stage.textContent='Resultado';steps.forEach(el=>el.classList.add('bg-safety'));
    const vip=answers.machines==='Más de 10 máquinas'&&answers.hours==='Más de 20 horas';
    if(vip){body.innerHTML=`<div class="text-center"><span class="inline-flex items-center gap-2 tag text-xs uppercase text-night bg-cyber px-3 py-1.5 mb-5 clip-tab"><i class="fa-solid fa-bolt"></i> Perfil de alta capacidad detectado</span><h3 class="text-2xl sm:text-3xl font-extrabold mb-4">Tu perfil califica para una Auditoría Prioritaria VIP</h3><p class="text-steel-400 max-w-md mx-auto mb-8">Con más de 10 máquinas y más de 20 h semanales de inactividad, el coste de oportunidad acumulado justifica una revisión técnica directa con un ingeniero senior, no un presupuesto genérico.</p><a href="#contact" class="inline-flex items-center gap-3 bg-cyber text-night font-bold px-7 py-4 clip-tab hover:brightness-110 transition"><i class="fa-solid fa-calendar-check"></i> Reservar Auditoría VIP ahora</a></div>`;}
    else{body.innerHTML=`<div class="text-center"><span class="inline-flex items-center gap-2 tag text-xs uppercase text-night bg-safety px-3 py-1.5 mb-5 clip-tab"><i class="fa-solid fa-circle-check"></i> Diagnóstico completado</span><h3 class="text-2xl sm:text-3xl font-extrabold mb-4">Tienes capacidad oculta recuperable</h3><p class="text-steel-400 max-w-md mx-auto mb-8">Con "${(answers.reason||'').toLowerCase()}" como cuello de botella y un rango de ${(answers.hours||'').toLowerCase()} de inactividad, una intervención de programación CNC externa puede recuperar horas de producción esta misma semana.</p><a href="#contact" class="inline-flex items-center gap-3 bg-safety text-night font-bold px-7 py-4 clip-tab hover:brightness-110 transition"><i class="fa-solid fa-user-gear"></i> Hablar con un ingeniero</a></div>`;}
  }
  back.addEventListener('click',()=>{if(step>0){step--;render();}});
  render();
})();

/* ===== Sistema de capas + animaciones GSAP ===== */
(function(){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections=Array.from(document.querySelectorAll('section.layer'));

  /* Navegación por puntos + contador (funciona incluso sin GSAP) */
  const nav=document.getElementById('layer-nav');
  const counter=document.getElementById('sec-counter');
  const curEl=counter.querySelector('.cur'),totEl=counter.querySelector('.tot'),lblEl=counter.querySelector('.lbl'),barEl=counter.querySelector('.bar i');
  totEl.textContent=String(sections.length).padStart(2,'0');
  const dots=sections.map((sec,i)=>{
    const b=document.createElement('button');
    b.className='lnav'; b.setAttribute('aria-label','Ir a '+sec.dataset.label);
    b.innerHTML=`<span class="lbl">${sec.dataset.label}</span><span class="dot"></span>`;
    b.addEventListener('click',()=>sec.scrollIntoView({behavior:reduced?'auto':'smooth'}));
    nav.appendChild(b); return b;
  });
  let activeIdx=0;
  function setActive(i){
    activeIdx=i;
    dots.forEach((d,j)=>d.classList.toggle('active',j===i));
    curEl.textContent=String(i+1).padStart(2,'0');
    lblEl.textContent=sections[i].dataset.label;
    barEl.style.transform=`scaleX(${(i+1)/sections.length})`;
  }
  const secIO=new IntersectionObserver(es=>{
    es.forEach(e=>{ if(e.isIntersecting){ setActive(sections.indexOf(e.target)); } });
  },{rootMargin:'-45% 0px -45% 0px'});
  sections.forEach(s=>secIO.observe(s));
  setActive(0);

  /* Navegación con teclado entre capas */
  window.addEventListener('keydown',(e)=>{
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
    let go=null;
    if(e.key==='ArrowDown'||e.key==='PageDown') go=Math.min(activeIdx+1,sections.length-1);
    else if(e.key==='ArrowUp'||e.key==='PageUp') go=Math.max(activeIdx-1,0);
    else if(e.key==='Home') go=0;
    else if(e.key==='End') go=sections.length-1;
    if(go===null)return;
    e.preventDefault();
    sections[go].scrollIntoView({behavior:reduced?'auto':'smooth'});
  });

  /* Sin GSAP/ScrollTrigger (CDN bloqueado o red inestable) o con movimiento reducido: fallback simple.
     El contenido se revela con IntersectionObserver, sin depender de ningún CDN. */
  if(!window.gsap||!window.ScrollTrigger||reduced){
    document.documentElement.classList.add('no-gsap');
    if(reduced){ document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in')); return; }
    const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:0.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
    return;
  }

  try{
  document.documentElement.classList.add('gsap-on');
  gsap.registerPlugin(ScrollTrigger);
  if(window.MotionPathPlugin) gsap.registerPlugin(MotionPathPlugin);

  /* Revelado por lotes */
  ScrollTrigger.batch('.reveal',{
    start:'top 88%',
    once:true,
    onEnter:batch=>gsap.to(batch,{opacity:1,y:0,duration:1,stagger:0.1,ease:'power3.out',overwrite:true})
  });

  /* Titulares con revelado palabra a palabra */
  document.querySelectorAll('.split-h').forEach(h=>{
    const words=h.textContent.trim().split(/\s+/);
    h.innerHTML=words.map(w=>`<span class="w-mask"><span class="w-in">${w}</span></span>`).join(' ');
    gsap.to(h.querySelectorAll('.w-in'),{
      y:0,duration:0.9,stagger:0.045,ease:'power4.out',
      scrollTrigger:{trigger:h,start:'top 88%',once:true}
    });
  });

  /* Parallax de fondos y números de capa */
  gsap.utils.toArray('[data-speed]').forEach(el=>{
    gsap.to(el,{
      yPercent:parseFloat(el.dataset.speed),ease:'none',
      scrollTrigger:{trigger:el.closest('.layer')||el,start:'top bottom',end:'bottom top',scrub:true}
    });
  });

  /* Mecanizado guiado por scroll: la fresa recorre las pasadas paralelas */
  const run=document.getElementById('raster-run'),tool=document.getElementById('raster-tool');
  if(run&&tool&&window.MotionPathPlugin){
    const len=run.getTotalLength();
    gsap.set(run,{strokeDasharray:len,strokeDashoffset:len});
    const st={trigger:'#raster-svg',start:'top 85%',end:'bottom 25%',scrub:0.6};
    gsap.to(run,{strokeDashoffset:0,ease:'none',scrollTrigger:st});
    gsap.to(tool,{
      ease:'none',
      motionPath:{path:'#raster-run',align:'#raster-run',alignOrigin:[0.5,0.5]},
      scrollTrigger:st
    });
  }

  /* Tilt 3D del panel del hero con el ratón (solo escritorio) */
  const panel=document.getElementById('hero-panel');
  if(panel&&window.matchMedia('(min-width:1024px)').matches){
    const hero=document.getElementById('home');
    hero.addEventListener('mousemove',(e)=>{
      const r=panel.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-0.5, y=(e.clientY-r.top)/r.height-0.5;
      gsap.to(panel,{rotateY:x*7,rotateX:-y*7,transformPerspective:900,duration:0.6,ease:'power2.out'});
    });
    hero.addEventListener('mouseleave',()=>gsap.to(panel,{rotateY:0,rotateX:0,duration:0.8,ease:'power3.out'}));
  }

  /* Barra de progreso global */
  gsap.to('#progress',{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:0.3}});

  /* Recalcular posiciones cuando cargan las imágenes */
  window.addEventListener('load',()=>ScrollTrigger.refresh());
  }catch(err){
    console.warn('Fallo en animaciones GSAP; se muestra el contenido igualmente.', err);
    document.querySelectorAll('.reveal').forEach(el=>{el.style.opacity='1';el.style.transform='none';});
  }
})();
