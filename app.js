/* ===== Base (header, menú móvil, coordenadas, contadores, quiz, formulario) ===== */
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

(function(){const rx=document.getElementById('rx'),ry=document.getElementById('ry'),rz=document.getElementById('rz');if(!rx)return;let t=0;
setInterval(()=>{t+=0.18;rx.textContent=(180+Math.sin(t)*110).toFixed(3);ry.textContent=(-40+Math.cos(t*0.8)*90).toFixed(3);rz.textContent=(-12+Math.sin(t*1.3)*3).toFixed(3);},220);})();

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

  /* Sin GSAP (CDN bloqueado) o con movimiento reducido: fallback simple */
  if(!window.gsap||reduced){
    document.documentElement.classList.add('no-gsap');
    if(reduced){ document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in')); return; }
    const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:0.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
    return;
  }

  document.documentElement.classList.add('gsap-on');
  gsap.registerPlugin(ScrollTrigger,MotionPathPlugin);

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
  if(run&&tool){
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
})();
