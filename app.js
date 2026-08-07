/* ===== Base (header, menú móvil, coordenadas, contadores, quiz, formulario) ===== */
/* Supabase es OPCIONAL: si su SDK (CDN externo) no carga, la web debe seguir
   funcionando al 100% y el formulario envía igualmente por email. Nunca debe
   abortar app.js. */
/* El lead se envía a la Edge Function `submit-lead`, no a la tabla. Antes esto
   era un POST directo contra /rest/v1/leads, lo que obligaba a dar privilegio
   de INSERT al rol anónimo: con la clave publicable a la vista aquí abajo,
   cualquiera podía inundar la tabla hasta agotar el almacenamiento.

   Ahora el INSERT lo hace la service_role dentro de la función, que nunca sale
   del servidor, y cada petición pasa antes por lista blanca de origen, límite
   de tamaño, honeypot, validación y rate limiting por IP (5/hora, 15/día).
   El rol anónimo ya no puede escribir en `leads` por ningún camino.

   No usamos el SDK de Supabase: pesaba 210 KB en todas las visitas para un
   insert ocasional. Un `fetch` hace lo mismo sin la dependencia. */
const SUPA_URL = 'https://lryyubgldnrrxokkeeef.supabase.co';
const SUPA_KEY = 'sb_publishable_LnAfjL6RQRdoPnOw5ZSEkA_jlCcbNBZ';

/* ===== Atribución de origen =====================================================
   Sin esto es imposible saber si un lead vino de LinkedIn, de Google o del boca
   a boca, y sin saberlo no se puede decidir dónde invertir las horas.

   Dos capas, porque ninguna funciona sola:
     1. UTM automático. Se captura al aterrizar y se guarda en sessionStorage con
        semántica de PRIMER contacto: si el visitante llega por LinkedIn, navega a
        tarifas y vuelve, la fuente sigue siendo LinkedIn. Sobrevive al salto de
        página, no a cerrar el navegador (que es justo lo que queremos: otra visita
        es otra sesión de atribución).
     2. Respuesta declarada en el formulario, para cuando la UTM se pierde: alguien
        que teclea la URL, que la recibe por WhatsApp o que abre desde una app.

   El resultado viaja en `origen`, que ya está en la lista blanca de la Edge
   Function `submit-lead`. Añadir un campo nuevo exigiría migración de la tabla y
   redespliegue de la función; esto funciona hoy sin tocar el backend. Ojo al
   límite: la columna `origen` corta a 160 caracteres. */
const ATRIB_CLAVE = 'mag-atribucion';

/* Nombres compactos para no agotar los 160 caracteres de `origen`. */
const FUENTES_CORTAS = { linkedin:'li', google:'goog', facebook:'fb', instagram:'ig', bing:'bing' };

function capturarAtribucion(){
  try{
    if(sessionStorage.getItem(ATRIB_CLAVE)) return; // primer contacto manda
    const p = new URLSearchParams(location.search);
    const src = p.get('utm_source');
    let valor = '';
    if(src){
      const s = FUENTES_CORTAS[src.toLowerCase()] || src.slice(0,16);
      valor = [s, p.get('utm_medium')||'', p.get('utm_campaign')||''].filter(Boolean).join('/');
    }else if(document.referrer){
      /* Sin UTM, el dominio de procedencia ya distingue orgánico de directo. */
      try{
        const h = new URL(document.referrer).hostname.replace(/^www\./,'');
        if(h && h !== location.hostname.replace(/^www\./,'')) valor = 'ref:' + h;
      }catch(e){}
    }
    if(valor) sessionStorage.setItem(ATRIB_CLAVE, valor.slice(0,60));
  }catch(e){ /* modo privado: se pierde la atribución, nunca el lead */ }
}
capturarAtribucion();

function leerAtribucion(){
  try{ return sessionStorage.getItem(ATRIB_CLAVE) || ''; }catch(e){ return ''; }
}

/* ===== LinkedIn Insight Tag =====================================================
   INACTIVO hasta que se rellene LI_PARTNER_ID. Se obtiene en Campaign Manager →
   Data → Signals manager → Insight Tag. No hace falta gastar un euro en anuncios
   para tenerlo: el tag empieza a acumular audiencia de retargeting desde el primer
   día, y esa audiencia tarda semanas en ser utilizable. Instalarlo tarde es el
   error más caro y más silencioso de una campaña de LinkedIn.

   AVISO LEGAL: el tag instala cookies publicitarias. En España y la UE eso exige
   consentimiento previo e informado (RGPD y LSSI). Por eso se dispara solo si
   `hayConsentimientoPublicidad()` devuelve true, lo que ocurre únicamente cuando
   el visitante lo ha aceptado en el banner de cookies (ver más abajo). */
const LI_PARTNER_ID = ''; // ← pegar aquí el Partner ID numérico de Campaign Manager

function hayConsentimientoPublicidad(){
  try{ return localStorage.getItem('mag-consent-ads') === 'si'; }catch(e){ return false; }
}

function cargarInsightTag(){
  if(!LI_PARTNER_ID || !hayConsentimientoPublicidad()) return;
  if(window.__magLiCargado) return;
  window.__magLiCargado = true;
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(LI_PARTNER_ID);
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = 'https://snap.licdn.com/li_lms/js/li_lms_analytics.js';
  document.head.appendChild(s);
}
cargarInsightTag();
/* Permite activarlo en el momento en que el visitante acepte, sin recargar. */
window.MAG_activarInsightTag = cargarInsightTag;

/* ===== Banner de cookies =======================================================
   Requisitos que condicionan el diseño, no son adorno:

   · Nada no esencial antes del consentimiento. El Insight Tag ya está detrás de
     `hayConsentimientoPublicidad()`, que solo devuelve true si se aceptó aquí.
   · Aceptar y rechazar con el mismo peso visual. La AEPD considera que un
     "rechazar" discreto junto a un "aceptar" destacado no es elección libre.
     Por eso ambos botones comparten tamaño, tipografía y jerarquía.
   · Sin muro. La barra es inferior y no bloquea: se puede seguir leyendo sin
     decidir. Un cookie wall en un sitio comercial no es consentimiento libre.
   · Granularidad. Se puede aceptar la medición y rechazar la publicidad.
   · Revocable en cualquier momento, desde el enlace "Cookies" del pie.
   · Caducidad. El consentimiento expira a los 12 meses y se vuelve a preguntar.
   · Sin casillas premarcadas para publicidad.

   Nota sobre el calendario de Google de la landing de auditoría: no se carga
   hasta que el visitante pulsa el botón. Ese clic explícito es la consentimiento
   granular para ese contenido concreto, que es el patrón habitual de
   "clic para cargar" en incrustaciones de terceros. No se toca aquí.

   Esto es una implementación técnica razonable de los criterios publicados por la
   AEPD; no es asesoramiento jurídico. Si la exposición legal preocupa, conviene
   que lo revise un abogado. */
(function(){
  const CLAVE = 'mag-cookies-v1';
  const MESES_VALIDEZ = 12;

  function leerConsentimiento(){
    try{
      const c = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if(!c || !c.fecha) return null;
      const meses = (Date.now() - c.fecha) / (1000 * 60 * 60 * 24 * 30.44);
      return meses > MESES_VALIDEZ ? null : c;   // caducado: se vuelve a preguntar
    }catch(e){ return null; }
  }

  function guardarConsentimiento(medicion, publicidad){
    const c = { medicion: !!medicion, publicidad: !!publicidad, fecha: Date.now() };
    try{
      localStorage.setItem(CLAVE, JSON.stringify(c));
      /* Clave espejo que lee `hayConsentimientoPublicidad()`. */
      localStorage.setItem('mag-consent-ads', c.publicidad ? 'si' : 'no');
    }catch(e){ /* modo privado: la decisión vale para esta visita */ }
    aplicar(c);
  }

  function aplicar(c){
    if(c.publicidad && typeof window.MAG_activarInsightTag === 'function'){
      window.MAG_activarInsightTag();
    }
    /* La medición de audiencia de Vercel es sin cookies y agregada, así que no
       hay nada que desactivar en el navegador; el interruptor queda registrado
       para poder honrarlo si algún día se añade analítica que sí identifique. */
  }

  const guardado = leerConsentimiento();
  if(guardado){ aplicar(guardado); }

  let barra = null;

  function construir(previo){
    const med = previo ? previo.medicion : true;    // preseleccionada: sin cookies
    const pub = previo ? previo.publicidad : false; // nunca preseleccionada

    const el = document.createElement('div');
    el.id = 'mag-cookies';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'mag-ck-t');
    el.setAttribute('aria-describedby', 'mag-ck-d');
    el.innerHTML =
      '<div class="mag-ck-inner">' +
        '<div class="mag-ck-fila">' +
          '<div>' +
            '<p class="mag-ck-titulo" id="mag-ck-t">Cookies y medición</p>' +
            '<p class="mag-ck-texto" id="mag-ck-d">Usamos almacenamiento propio para que la web funcione y medición de audiencia agregada, que no te identifica. Si lo aceptas, activaremos también cookies de LinkedIn para medir nuestras campañas. Puedes rechazarlas sin perder ninguna funcionalidad y cambiar de opinión cuando quieras. Más detalle en la <a href="privacidad.html">política de privacidad</a>.</p>' +
          '</div>' +
          '<div class="mag-ck-botones">' +
            '<button type="button" class="mag-ck-btn mag-ck-btn-cfg" data-ck="config" aria-expanded="false" aria-controls="mag-ck-panel">Configurar</button>' +
            '<button type="button" class="mag-ck-btn mag-ck-btn-no" data-ck="rechazar">Rechazar</button>' +
            '<button type="button" class="mag-ck-btn mag-ck-btn-si" data-ck="aceptar">Aceptar</button>' +
          '</div>' +
        '</div>' +
        '<div class="mag-ck-panel" id="mag-ck-panel" hidden>' +
          cat('Necesarias', 'Preferencia de tema claro u oscuro y protección del formulario frente a envíos automáticos. Sin ellas la web no funciona correctamente, así que no se pueden desactivar.', 'nec', true, true) +
          cat('Medición de audiencia', 'Analítica propia y agregada para saber qué páginas se visitan y desde dónde se llega. No usa cookies ni identifica a personas concretas.', 'med', med, false) +
          cat('Publicidad y remarketing', 'LinkedIn Insight Tag. Permite medir si nuestras publicaciones traen visitas y mostrar anuncios a quien ya nos conoce. Instala cookies de LinkedIn.', 'pub', pub, false) +
          '<div class="mag-ck-botones" style="margin-top:18px">' +
            '<button type="button" class="mag-ck-btn mag-ck-btn-si" data-ck="guardar">Guardar mi elección</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return el;
  }

  function cat(titulo, texto, id, activa, fija){
    return '<div class="mag-ck-cat">' +
        '<div class="mag-ck-cat-txt"><h4>' + titulo + '</h4><p>' + texto + '</p></div>' +
        '<label class="mag-ck-sw">' +
          '<input type="checkbox" id="mag-ck-' + id + '"' + (activa ? ' checked' : '') +
            (fija ? ' disabled' : '') + ' aria-label="' + titulo + '">' +
          '<span></span>' +
        '</label>' +
      '</div>';
  }

  function abrir(){
    const previo = leerConsentimiento();
    if(barra) barra.remove();
    barra = construir(previo);
    document.body.appendChild(barra);
    requestAnimationFrame(() => barra.classList.add('visible'));

    barra.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ck]');
      if(!b) return;
      const accion = b.dataset.ck;
      if(accion === 'config'){
        const panel = barra.querySelector('#mag-ck-panel');
        const abierto = !panel.hidden;
        panel.hidden = abierto;
        b.setAttribute('aria-expanded', String(!abierto));
        if(!abierto) panel.querySelector('input:not(:disabled)').focus();
        return;
      }
      if(accion === 'aceptar')  return cerrar(true,  true);
      if(accion === 'rechazar') return cerrar(false, false);
      if(accion === 'guardar'){
        return cerrar(barra.querySelector('#mag-ck-med').checked,
                      barra.querySelector('#mag-ck-pub').checked);
      }
    });
  }

  function cerrar(medicion, publicidad){
    guardarConsentimiento(medicion, publicidad);
    if(!barra) return;
    barra.classList.remove('visible');
    const ref = barra;
    barra = null;
    setTimeout(() => ref.remove(), 420);
  }

  /* Enlace permanente en el pie para revocar o cambiar la decisión. Se inyecta
     junto al de privacidad, que existe en todas las páginas: así no hay que
     tocar los siete HTML ni recordar añadirlo en la próxima landing. */
  function enlacePie(){
    const ref = document.querySelector('footer a[href*="privacidad"]');
    if(!ref || document.getElementById('mag-ck-link')) return;
    const sep = document.createTextNode(' · ');
    const a = document.createElement('button');
    a.type = 'button';
    a.id = 'mag-ck-link';
    a.className = 'mag-ck-enlace';
    a.textContent = 'Cookies';
    a.addEventListener('click', abrir);
    ref.parentNode.insertBefore(sep, ref.nextSibling);
    ref.parentNode.insertBefore(a, sep.nextSibling);
  }

  const arrancar = () => {
    enlacePie();
    if(!leerConsentimiento()) abrir();
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', arrancar);
  }else{
    arrancar();
  }

  window.MAG_abrirCookies = abrir;
})();

function guardarLead(datos){
  return fetch(SUPA_URL + '/functions/v1/submit-lead', {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(datos)
  });
}

/* Diagnóstico del quiz, si el visitante lo completó en esta sesión. Vive en
   sessionStorage para sobrevivir al salto de la home a la landing. Devuelve
   null en modo privado o si nunca lo hizo: quien lo llame debe contar con eso. */
function leerQuiz(){
  try{
    const crudo=sessionStorage.getItem('mag-quiz');
    return crudo?JSON.parse(crudo):null;
  }catch(e){ return window.MAG_QUIZ||null; }
}

/* Todos los bloques comprueban que sus elementos existan: este mismo archivo se
   carga en index.html y en las landings, que no tienen todas las secciones.
   Un getElementById que devuelva null y no esté guardado aborta el script entero. */
const header=document.getElementById('site-header');
if(header){
  const onScroll=()=>{ if(window.scrollY>20){header.classList.add('bg-night/90','backdrop-blur-md','border-night-line','shadow-lg');}else{header.classList.remove('bg-night/90','backdrop-blur-md','border-night-line','shadow-lg');} };
  window.addEventListener('scroll',onScroll); onScroll();
}

const menuBtn=document.getElementById('menu-btn'),mobileMenu=document.getElementById('mobile-menu');
if(menuBtn&&mobileMenu){
  menuBtn.addEventListener('click',()=>mobileMenu.classList.toggle('hidden'));
  document.querySelectorAll('.mobile-link').forEach(a=>a.addEventListener('click',()=>mobileMenu.classList.add('hidden')));
}

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

const contactForm=document.getElementById('contact-form');
if(contactForm) contactForm.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const f=e.target,msg=document.getElementById('form-msg');
  if(f._gotcha&&f._gotcha.value){return;}
  /* Campo opcional: cada formulario (home, landing de auditoría) tiene los suyos. */
  const v=(n)=>(f[n]&&typeof f[n].value==='string')?f[n].value:'';
  if(!v('name')||!v('email')||!v('company')){f.reportValidity();return;}
  const btn=f.querySelector('button[type="submit"]');
  btn.disabled=true;
  msg.classList.remove('hidden','text-alert');msg.classList.add('text-cyber');
  msg.textContent='Enviando tu solicitud...';
  /* Origen del lead: para medir qué página trae cada contacto. */
  let origen=f.dataset.origen||document.title||location.pathname;
  let detalles=v('description');
  /* Atribución de canal. Prioridad al dato automático (UTM o referente), que no
     depende de que el visitante recuerde ni acierte; el desplegable es el
     respaldo para cuando ese dato no existe. */
  const canal=leerAtribucion()||v('conocimiento');
  /* La columna `origen` corta a 160. Se recorta la parte de página, no el canal:
     saber de dónde vino importa más que el título exacto de la landing. */
  if(canal) origen=origen.slice(0,100)+' · '+canal.slice(0,50);
  /* Si además lo declaró, se guarda literal en detalles: el desplegable dice
     "recomendación de un cliente", cosa que ninguna UTM puede saber. */
  if(v('conocimiento')) detalles=(detalles?detalles+'\n\n':'')+'Cómo nos conoció: '+v('conocimiento');
  /* Si antes pasó por el quiz, su diagnóstico viaja con el lead: llega un
     contacto cualificado en vez de un nombre suelto. Se lee de sessionStorage
     y no de la variable del quiz, para que sobreviva a un cambio de página. */
  const quiz=leerQuiz();
  if(quiz&&quiz.resumen){
    detalles=(detalles?detalles+'\n\n':'')+quiz.resumen;
    if(quiz.vip)origen=(origen+' · quiz VIP').slice(0,160);
  }
  /* El formulario manda sobre el quiz: si el visitante rellenó el desplegable,
     esa respuesta es más reciente y más deliberada que la del test. */
  const maquinas=v('machines')||(quiz&&quiz.machines)||'';
  const inactividad=v('downtime')||(quiz&&quiz.hours)||'';
  try{
    /* El guardado en base de datos no bloquea el envío: si Supabase falla, el
       aviso por email sale igualmente y el contacto no se pierde. */
    /* No esperamos a Supabase: si falla, el aviso por email sale igualmente. */
    guardarLead({
      nombre:v('name'),
      empresa:v('company'),
      email:v('email'),
      telefono:v('phone'),
      maquinas:maquinas,
      inactividad:inactividad,
      detalles:detalles,
      origen:origen
    }).then(r=>{ if(!r.ok) console.warn('Supabase no registró el lead:', r.status); })
      .catch(err=>console.warn('Supabase inaccesible; el lead va solo por email.', err));
    const r=await fetch('https://formsubmit.co/ajax/info@magindustries.es',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        nombre:v('name'),
        empresa:v('company'),
        email:v('email'),
        telefono:v('phone'),
        detalles:detalles,
        inactividad:inactividad,
        maquinas:maquinas,
        origen:origen,
        _subject:'Nuevo lead — '+origen,
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

/* ===== Quiz de diagnóstico =====
   Antes, las respuestas morían aquí dentro: se pintaba el resultado y se perdían.
   Quien se autocalificaba como VIP y no bajaba a rellenar el formulario era un
   lead perdido en silencio — el que más nos interesaba, además.

   Ahora hacen tres cosas:
     1. Se publican en window.MAG_QUIZ y en sessionStorage, para que el
        formulario de contacto las adjunte aunque el visitante navegue.
     2. El resultado pide nombre y correo ahí mismo: dos campos, sin bajar.
     3. Ese envío va por los dos caminos de siempre (Edge Function + FormSubmit),
        con el diagnóstico ya redactado en `detalles`.
   Ver PROJECT_STATE.md · hueco OP-030 «Seguimiento del quiz». */
(function(){
  const questions=[
    {id:'machines',text:'¿Cuántos centros de mecanizado o tornos CNC avanzados tienes en planta?',options:['1-3 máquinas','4-10 máquinas','Más de 10 máquinas']},
    {id:'reason',text:'¿Cuál es el motivo principal por el que se detienen tus máquinas?',options:['Escasez de programadores cualificados','Retrasos en diseño de utillajes','Tiempos de preparación excesivos']},
    {id:'hours',text:'¿Cuántas horas semanales estimas que tus máquinas están inactivas?',options:['Menos de 5 horas','5-20 horas','Más de 20 horas']}
  ];
  const answers={};let step=0;
  const body=document.getElementById('quiz-body'),stage=document.getElementById('quiz-stage'),back=document.getElementById('quiz-back'),steps=document.querySelectorAll('.quiz-step');
  if(!body||!stage||!back)return;

  /* Resumen en texto plano: es lo que se guarda en `detalles` y lo que se lee
     en el aviso por email. Que se entienda sin abrir la base de datos. */
  function resumen(){
    return ['Diagnóstico del quiz:',
      '· Máquinas en planta: '+(answers.machines||'sin responder'),
      '· Cuello de botella: '+(answers.reason||'sin responder'),
      '· Inactividad semanal: '+(answers.hours||'sin responder')].join('\n');
  }
  function publicar(){
    const datos={machines:answers.machines||'',reason:answers.reason||'',hours:answers.hours||'',vip:esVip(),resumen:resumen()};
    window.MAG_QUIZ=datos;
    try{sessionStorage.setItem('mag-quiz',JSON.stringify(datos));}catch(e){/* modo privado: seguimos sin persistencia */}
  }
  function esVip(){return answers.machines==='Más de 10 máquinas'&&answers.hours==='Más de 20 horas';}

  function progress(){steps.forEach((el,i)=>{el.classList.toggle('bg-safety',i<=step);el.classList.toggle('bg-night-line',i>step);});}
  function render(){const q=questions[step];stage.textContent=`Etapa ${step+1} / ${questions.length}`;back.classList.toggle('hidden',step===0);progress();
    body.innerHTML=`<h3 class="text-xl sm:text-2xl font-bold mb-6">${q.text}</h3><div class="grid sm:grid-cols-3 gap-3" role="radiogroup">${q.options.map(o=>`<button type="button" data-v="${o}" class="quiz-opt text-left px-5 py-4 border border-night-line bg-night-soft text-steel-200 text-sm font-medium rounded-sm hover:border-safety/60">${o}</button>`).join('')}</div>`;
    body.querySelectorAll('.quiz-opt').forEach(btn=>{btn.addEventListener('click',()=>{body.querySelectorAll('.quiz-opt').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');answers[q.id]=btn.dataset.v;publicar();setTimeout(()=>{if(step<questions.length-1){step++;render();}else{result();}},280);});});
  }

  /* Captura de dos campos dentro del propio resultado. El honeypot va aquí
     también: la Edge Function lo valida en servidor y sin él este camino sería
     el más fácil de automatizar de toda la web. */
  /* Las clases van literales en las dos ramas y NO concatenadas (`bg-${x}`):
     Tailwind compila escaneando texto, así que una clase construida en tiempo
     de ejecución no llega nunca a la hoja de estilos y el botón saldría sin
     color. Se duplica el markup a cambio de que esto no pueda romperse. */
  function capturaHTML(vip){
    const campo='w-full bg-night-soft border border-night-line px-3.5 py-2.5 text-sm rounded-sm focus:outline-none '+(vip?'focus:border-cyber':'focus:border-safety');
    const boton='mt-4 w-full inline-flex items-center justify-center gap-3 text-night font-bold px-7 py-3.5 clip-tab hover:brightness-110 transition '+(vip?'bg-cyber':'bg-safety');
    const enlace='font-bold hover:brightness-110 transition '+(vip?'text-cyber':'text-safety');
    return `<form id="quiz-lead" class="mt-8 max-w-md mx-auto text-left" novalidate>
      <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" class="hp-field" aria-hidden="true">
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="block"><span class="text-xs text-steel-400 block mb-1.5">Tu nombre *</span><input name="name" required maxlength="120" autocomplete="name" class="${campo}"></label>
        <label class="block"><span class="text-xs text-steel-400 block mb-1.5">Correo profesional *</span><input name="email" type="email" required maxlength="254" autocomplete="email" class="${campo}"></label>
      </div>
      <button type="submit" class="${boton}"><i aria-hidden="true" class="fa-solid fa-calendar-check"></i> ${vip?'Reservar mi auditoría prioritaria':'Recibir mi diagnóstico'}</button>
      <p id="quiz-msg" role="status" aria-live="polite" class="text-sm text-center mt-3 hidden"></p>
      <p class="text-xs text-steel-500 text-center mt-3">Te escribo yo, en persona. Sin listas de correo. <a href="privacidad.html" class="underline hover:text-safety transition">Privacidad</a>.</p>
      <p class="text-sm text-steel-400 text-center mt-4 pt-4 border-t border-night-line">¿Prefieres darme más detalle? <a href="#contact" class="${enlace}">Formulario completo</a></p>
    </form>`;
  }

  function conectarCaptura(vip){
    const f=document.getElementById('quiz-lead');
    if(!f)return;
    f.addEventListener('submit',async(e)=>{
      e.preventDefault();
      /* f.elements.X y no f.X: `name` colisiona con la propiedad nativa
         HTMLFormElement.name y la resolución depende de reglas heredadas que no
         merece la pena tentar. */
      const campos=f.elements;
      if(campos._gotcha&&campos._gotcha.value)return;
      const msg=document.getElementById('quiz-msg');
      const nombre=campos.name.value.trim(),email=campos.email.value.trim();
      if(!nombre||!email){f.reportValidity();return;}
      const btn=f.querySelector('button[type="submit"]');
      btn.disabled=true;
      msg.classList.remove('hidden','text-alert');msg.classList.add('text-cyber');
      msg.textContent='Enviando tu diagnóstico...';
      const origen=vip?'Quiz home · perfil VIP':'Quiz home';
      const carga={nombre:nombre,email:email,maquinas:answers.machines||'',inactividad:answers.hours||'',detalles:resumen(),origen:origen};
      try{
        /* Mismo patrón que el formulario grande: la base de datos no bloquea el
           aviso por email, porque son dos caminos independientes a propósito. */
        guardarLead(carga).then(r=>{if(!r.ok)console.warn('Supabase no registró el lead del quiz:',r.status);})
          .catch(err=>console.warn('Supabase inaccesible; el lead del quiz va solo por email.',err));
        const r=await fetch('https://formsubmit.co/ajax/info@magindustries.es',{
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify({...carga,_subject:'Nuevo lead — '+origen,_template:'table'})
        });
        if(!r.ok)throw new Error('HTTP '+r.status);
        msg.classList.remove('text-cyber');msg.classList.add('text-safety');
        msg.textContent=vip?'Recibido. Te escribo hoy mismo con dos o tres huecos.':'Recibido. Te escribo en menos de 24 h laborables.';
        f.querySelectorAll('input,button').forEach(el=>el.disabled=true);
      }catch(err){
        msg.classList.remove('text-cyber');msg.classList.add('text-alert');
        msg.innerHTML='No se pudo enviar. Escríbeme por <a class="underline font-bold" target="_blank" rel="noopener" href="https://wa.me/34635013953">WhatsApp</a> o al +34 635 013 953.';
        btn.disabled=false;
      }
    });
  }

  function result(){back.classList.add('hidden');stage.textContent='Resultado';steps.forEach(el=>el.classList.add('bg-safety'));
    publicar();
    const vip=esVip();
    if(vip){body.innerHTML=`<div class="text-center"><span class="inline-flex items-center gap-2 tag text-xs uppercase text-night bg-cyber px-3 py-1.5 mb-5 clip-tab"><i class="fa-solid fa-bolt"></i> Perfil de alta capacidad detectado</span><h3 class="text-2xl sm:text-3xl font-extrabold mb-4">Tu perfil califica para una Auditoría Prioritaria VIP</h3><p class="text-steel-400 max-w-md mx-auto">Con más de 10 máquinas y más de 20 h semanales de inactividad, el coste de oportunidad acumulado justifica una revisión técnica directa sobre una de tus piezas, no un presupuesto genérico.</p>${capturaHTML(true)}</div>`;}
    else{body.innerHTML=`<div class="text-center"><span class="inline-flex items-center gap-2 tag text-xs uppercase text-night bg-safety px-3 py-1.5 mb-5 clip-tab"><i class="fa-solid fa-circle-check"></i> Diagnóstico completado</span><h3 class="text-2xl sm:text-3xl font-extrabold mb-4">Tienes capacidad oculta recuperable</h3><p class="text-steel-400 max-w-md mx-auto">Con "${(answers.reason||'').toLowerCase()}" como cuello de botella y un rango de ${(answers.hours||'').toLowerCase()} de inactividad, una intervención de programación CNC externa puede recuperar horas de producción esta misma semana.</p>${capturaHTML(false)}</div>`;}
    conectarCaptura(vip);
  }
  back.addEventListener('click',()=>{if(step>0){step--;render();}});
  render();
})();

/* Enlaces sociales sin destino todavía: se retiran en vez de dejar un icono
   que no lleva a ninguna parte. En cuanto el href tenga una URL real, aparecen
   solos sin tocar este archivo. */
document.querySelectorAll('.social-link').forEach(a=>{
  const href=(a.getAttribute('href')||'').trim();
  if(!href||href==='#')a.classList.add('hidden');
});

/* ===== Agenda de la auditoría (Google Calendar) =====
   El calendario de citas de Google se carga BAJO DEMANDA, no al abrir la
   página. El iframe pesa cientos de KB y esta landing se diseñó sin GSAP a
   propósito para que cargue rápido: meterle a Google en el primer pintado
   deshace justo eso. Hasta que alguien pulsa, la página no habla con Google.

   Las dos URL salen del mismo sitio (Calendar → Horario de citas → Compartir):
     data-cal-embed → la larga, .../appointments/schedules/...?gv=true
     data-cal-link  → la corta, https://calendar.app.google/xxxx
   Sin ninguna de las dos, el bloque se oculta entero y el formulario sigue
   siendo el camino: nunca se muestra un botón que no lleva a ningún sitio. */
(function(){
  const wrap=document.getElementById('cal-wrap');
  if(!wrap)return;
  const urlEmbed=(wrap.dataset.calEmbed||'').trim();
  const urlLink=(wrap.dataset.calLink||'').trim();
  const seccion=document.getElementById('agenda');
  const btn=document.getElementById('cal-open');
  const slot=document.getElementById('cal-slot');

  /* Sin calendario configurado se retira también todo lo que apunta a él: un
     enlace «ver mi calendario» que baja a una sección oculta es peor que no
     ofrecerlo. */
  if(!urlEmbed&&!urlLink){
    if(seccion)seccion.classList.add('hidden');
    document.querySelectorAll('.cal-cta').forEach(el=>el.classList.add('hidden'));
    return;
  }
  if(!btn||!slot)return;

  /* Sin URL de incrustación pero con enlace: el botón abre pestaña nueva. */
  if(!urlEmbed){
    btn.textContent='Ver huecos disponibles';
    btn.addEventListener('click',()=>window.open(urlLink,'_blank','noopener'));
    return;
  }

  let cargado=false;
  btn.addEventListener('click',()=>{
    if(cargado)return;
    cargado=true;
    const marco=document.createElement('iframe');
    marco.src=urlEmbed;
    marco.title='Calendario de reserva de la auditoría técnica';
    marco.loading='lazy';
    marco.className='w-full border-0';
    marco.style.height='640px';
    slot.textContent='';
    slot.appendChild(marco);
    slot.classList.remove('hidden');
    btn.parentElement.classList.add('hidden');
    /* Red de seguridad: si Google se negara a incrustarse, el iframe queda en
       blanco sin lanzar ningún error que podamos capturar desde aquí. El
       enlace de escape de abajo está siempre visible por ese motivo. */
    slot.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
})();

/* ===== Calculadora de coste de máquina parada =====
   Convierte «pierdo horas» en una cifra en euros justo antes del CTA. El
   cálculo es deliberadamente conservador y se explica debajo: una cifra que el
   visitante no puede reproducir mentalmente no convence a un técnico. */
(function(){
  const horas=document.getElementById('calc-horas');
  const coste=document.getElementById('calc-coste');
  if(!horas||!coste)return;
  const salSem=document.getElementById('calc-semana');
  const salAnio=document.getElementById('calc-anio');
  const salHoras=document.getElementById('calc-horas-val');
  const salCoste=document.getElementById('calc-coste-val');
  if(!salSem||!salAnio)return;

  const eur=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});
  /* 46 semanas y no 52: descuenta vacaciones y paradas de planta. Inflar esto
     haría la cifra más golosa y menos creíble, que es lo contrario de lo que
     buscamos. */
  const SEMANAS=46;

  function pintar(){
    const h=Number(horas.value)||0, c=Number(coste.value)||0;
    const semana=h*c;
    salSem.textContent=eur.format(semana);
    salAnio.textContent=eur.format(semana*SEMANAS);
    if(salHoras)salHoras.textContent=h+' h';
    if(salCoste)salCoste.textContent=eur.format(c);
  }
  horas.addEventListener('input',pintar);
  coste.addEventListener('input',pintar);
  pintar();
})();

/* ===== Sistema de capas + animaciones GSAP ===== */
(function(){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections=Array.from(document.querySelectorAll('section.layer'));

  /* Navegación por puntos + contador (funciona incluso sin GSAP).
     Las landings no llevan navegación de capas: si falta, se salta este bloque
     pero se conserva el revelado de contenido más abajo. */
  const nav=document.getElementById('layer-nav');
  const counter=document.getElementById('sec-counter');
  if(nav&&counter&&sections.length){
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
  }

  /* A partir de aquí ya controlamos el revelado, así que cancelamos el
     temporizador de seguridad del <head>. Si nunca llegamos hasta aquí —CDN
     colgado, error arriba— ese temporizador salta y muestra el contenido. */
  if(window.__magFailsafe){ clearTimeout(window.__magFailsafe); window.__magFailsafe=null; }

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
