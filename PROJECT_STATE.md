# PROJECT_STATE — MAG INDUSTRIES

**Última sesión:** 29 julio 2026 (Sesión 4)
**Estado:** En producción. Arquitectura multipágina, embudo montado, web sin afirmaciones falsas.
**Siguiente sesión esperada:** Desbloquear FormSubmit, dominio + email, primeros testimonios reales

---

## ⚠️ BLOQUEADORES ACTIVOS (leer primero)

| # | Bloqueador | Impacto | Acción del usuario |
|---|-----------|---------|--------------------|
| 1 | **FormSubmit sin activar** | La landing capta leads pero el email de aviso NO llega. El lead sí queda en Supabase, pero el visitante ve mensaje de error. | Enviar el formulario una vez y pulsar «Activate» en el correo de FormSubmit |
| 2 | **Precios publicados sin confirmar** | Las tarifas (280/190/60 €) y las igualas (590/990/1.690 €) son la recomendación del plan, no cifras validadas por el usuario. Están **en vivo**. | Revisar `servicios.html` y ajustar o confirmar |
| 3 | **Referencias ofrecidas sin permiso** | La web ofrece poner en contacto a prospectos con los 2 talleres actuales. | Pedir permiso a JPARENTE y Gil-bo antes de que alguien lo solicite |
| 4 | Sin dominio ni email corporativo | Se retiró `proyectos@magindustries.com` (no existía y los leads rebotaban). Hoy solo hay teléfono, WhatsApp y formulario. | Comprar dominio y configurar Zoho Mail |
| 5 | Analytics de Vercel sin activar | No hay medición de tráfico ni de conversión de la landing. | Activar en el dashboard de Vercel |

---

## 📊 Resumen ejecutivo

| Métrica | Valor | Estado |
|---------|-------|--------|
| Sitio web | Live en Vercel | ✅ |
| Bugs críticos JS | Resuelto (supabase naming) | ✅ |
| Simulación Canvas | Funcional + optimizada | ✅ |
| Email corporativo | Pendiente | ⏳ |
| Leads en DB | 0 (formulario activo) | 📝 |
| Analytics activadas | No | ⏳ |
| Dominio propio | No (Vercel domain) | ⏳ |
| SEO básico | Completo | ✅ |
| Git + Vercel integration | Activa | ✅ |

---

## 🔄 Sesiones completadas

### Sesión 1 (13-14 julio 2026)
**Objetivo:** Diagnosticar y fijar bug de ejecución JS.

**Hecho:**
- Identificado: `SyntaxError: Identifier 'supabase' has already been declared`
- Causa: colisión entre global UMD del SDK y `let supabase` top-level
- Fix: renombrada variable a `supabaseClient`
- Commit: `bd0351d` — desplegado y verificado por curl
- Resultado: toggle, quiz, formularios y raster funcionan nuevamente

**Archivos modificados:**
- `app.js` (+8 líneas comentario + renaming)

**Decisiones:**
- Regla: nunca `let/const supabase` en top-level con SDK CDN cargado
- Siempre try/catch alrededor de dependencias externas

**Bloqueadores resueltos:**
- ✅ JS executing  
- ✅ Toggle claro/oscuro  
- ✅ Quiz interactivo  
- ✅ Formulario + Supabase insert  
- ✅ Animación raster (ruta en scroll)

---

### Sesión 2 (15 julio 2026)
**Objetivo:** Mejorar estética + rendimiento panel hero con simulación realista de mecanizado.

**Hecho:**

1. **Simulación Canvas 2D** (404 líneas en app.js)
   - Sustituye SVG estático por motor interactivo
   - Proyección isométrica de cajera con 2 islas (rectangular + cilíndrica)
   - Planificación de velocidad tipo CNC (look-ahead, 2 pasadas aceleración/desaceleración)
   - 1104 muestras de trayectoria, 28.2 s de corte sin colisiones
   - Rastro incandescente (3 capas: halo ancho + núcleo brillante) en modo aditivo
   - Sistema de virutas (90 partículas, pool dinámico, gravedad, despido en dirección contraria)
   - Micro-vibración (±0.7 px proporcional a velocidad) + banda de brillo (simulación RPM)
   - HUD X/Y/Z con posición real de herramienta (no valores inventados)
   - Oclusión por profundidad (orden pintor) + recorte al hueco (clip eventod)
   - Renderizado de fondo pre-calculado (1 sola vez)
   - RAF pausado automáticamente fuera de pantalla + cambio de pestaña
   - DPR limitado a 2 para evitar oversampling
   - Respeta `prefers-reduced-motion` (escena estática)
   - Zero deps nuevas (Canvas 2D nativo + GSAP ya presente)

2. **Cache busting**
   - `app.js?v=3` → `app.js?v=4`
   - `tailwind.css` no necesita actualización

3. **Deploy + verificación**
   - Compilación OK: `npm run build` exitoso (293 ms)
   - Commit: `34bd64a` — "feat(hero): simulación de mecanizado en Canvas 2D..."
   - Push a main → Vercel deploy automático (~2 min)
   - Verificado en producción: `curl https://mag-industries.vercel.app/app.js | grep sim-canvas`
   - HTML contiene `<canvas id="sim-canvas">` ✅

**Archivos modificados:**
- `index.html` (reemplazada sección SVG hero por `<canvas>`)
- `app.js` (+404 líneas, motor Canvas 2D)
- `.git` (2 commits nuevos)

**Decisiones:**
- Canvas 2D > SVG animado (control, rendimiento, sin deps)
- Escena estática pre-renderizada (lienzo separado) = 60 fps garantizado
- Pool de virutas (90 max) = gestión de memoria determinista
- Try/catch alrededor de Canvas (fallback a coordenadas estáticas si no hay contexto)

**Verificación numérica:**
```
Muestras: 1104
Longitud total: 1379 u
Velocidad min/max: 9.0 / 64.0 u/s
Duración estimada del corte: 28.2 s (+ ~2s de retract/rapid/plunge)
Puntos fuera de cajera (margen fresa): 0 ✅
Colisiones con isla A: 0 | distancia mínima al muro A: 8.98 u (fresa r=6) ✅
Colisiones con isla B: 0 | distancia mínima al muro B: 8.88 u ✅
BBox en pantalla del rastro: x 190 .. 411  y 151 .. 266  (lienzo 600x420) ✅
```

### Sesión 3 (28 julio 2026)
**Objetivo:** Ejecutar la Semana 1 del plan — limpiar afirmaciones falsas y montar el embudo de captación.

**Commits:** `82c10c9` · `2b5eaaa` · `04c477c`

**1. Limpieza de contenido no verificable (`82c10c9`)**

Lo que había en producción y se ha retirado:
- Cifras infladas: «15+ años», «500+ proyectos certificados», «99,8 % garantía», «soporte 24/7», «100 % multi-plataforma»
- 4 testimonios completamente inventados con nombres y empresas ficticias (Roberto F. / Mecanizados AeroSur, Carmen L. / TechParts Auto, David M. / Hidráulica Industrial CNC, Elena G. / Mecánica de Precisión G&S), incluidos «50.000 €/año ahorrados» y «45 % reducción de setup»
- 3 casos de éxito inventados con métricas falsas (40 % reducción de ciclo, 25 % menos consumo de herramienta)
- Oficina ficticia: «Polígono Industrial Tecnológico, Barcelona»
- `proyectos@magindustries.com` — **dominio inexistente**: cualquier lead que escribiera ahí rebotaba sin que nadie se enterara. Retirado del contacto y del JSON-LD
- FAQ: «experiencia certificada», «revisión por ingeniero senior» (es fundador único), «verificación dimensional certificada» (no ofrece metrología)

Con qué se ha sustituido — compromisos verificables en lugar de historial:
- 0 colisiones · 48 h de plazo · 7 años reales de ingeniería CAD/CAM · 5 plataformas CAM · 0 extras
- Testimonios → sección «Prefiero que se lo preguntes a mis clientes»: ofrece contacto directo con los talleres actuales, garantía por escrito y primera pieza al 50 %
- Casos de éxito → familias de pieza reales con precios de partida y plazos
- Nuevo posicionamiento: «No vendemos antigüedad. Vendemos compromisos.»

**2. Blindaje de `app.js` (`2b5eaaa`)**

`app.js` accedía a `#site-header`, `#menu-btn`, `#contact-form`, el quiz y la navegación de capas sin comprobar que existieran. Cualquier página sin esas secciones habría provocado un TypeError que aborta el script entero — exactamente la misma clase de fallo que el bug de `supabase`. Todos los bloques van ahora guardados, lo que es requisito para tener varias páginas.

**3. Embudo de captación (`04c477c`)**

- **`auditoria-gratuita.html`** — landing de conversión con una sola acción. Cabecera sin navegación (sin rutas de escape), formulario sobre el pliegue, «qué pasa en los 45 minutos», qué se lleva el cliente aunque no contrate, cualificación explícita (para quién es / para quién no) y 5 objeciones reales incluida «sois nuevos, ¿por qué debería fiarme?». Sin GSAP: carga más rápido y el revelado va por IntersectionObserver.
- **`servicios.html`** — tarifas publicadas (280 / 190 / 60 €) y planes de capacidad reservada (590 / 990 / 1.690 €) con condiciones explícitas, lo incluido en toda entrega y FAQ de precios.
- El handler del formulario admite ahora formularios con campos distintos y etiqueta cada lead con su página de origen vía `data-origen`, para medir qué canal trae cada contacto **sin tocar el esquema de Supabase** (el MCP de Supabase devolvió «no tienes permiso», así que el origen va dentro del campo `detalles`).
- `copy-static.js` copia cualquier `.html` de la raíz; sitemap actualizado; caché a `v=5`.

**Verificado en producción:** las tres páginas responden 200, los precios se sirven correctamente y quedan 0 coincidencias de contenido inventado.

**Decisiones:**
- No se nombra públicamente a JPARENTE ni a Gil-bo: se indica «dos talleres en Cataluña» y se ofrece el contacto bajo petición, porque aún no han dado permiso
- Landing sin GSAP a propósito: la velocidad importa más que la animación en una página de conversión
- Origen del lead codificado en `detalles` en vez de crear columna nueva, para no tocar producción sin permisos

### Sesión 4 (29 julio 2026)
**Objetivo:** Romper la densidad de la home en arquitectura multipágina y reescribir los bloques de onboarding y autoridad con enfoque CRO.

**Commits:** `61c9c77` · `f926cb5`

**Reparto de contenido.** La home tenía 11 capas y el usuario la percibía densa. Las dos secciones más pesadas —las que cargaban casi todas las imágenes de Unsplash— pasan a página propia:
- `sectores.html` ← antigua capa 04 (9 tarjetas de sector)
- `capacidades.html` ← antigua capa 05 (escaparate técnico con 6 animaciones SVG)
- Home: de 11 capas a 9, de 790 a 595 líneas

**Contenido nuevo (los 4 pilares del brief):**
1. **Hero:** «Cero horas de máquina parada esperando programa», con el ángulo de absorber picos de oficina técnica sin ampliar plantilla fija. Trust-bar reescrita a 0 colisiones / 48 h / multi-control.
2. **Capa 02 «Cómo empezamos a trabajar»:** onboarding de 3 pasos contra el escepticismo ante proveedor externo. Paso 1 pide STEP/IGES/nativo + máquina, control (Heidenhain TNC, Fanuc 0i/30i, Siemens 840D) y amarre, más el truco de pedir un programa que ya funcione para derivar el postprocesador real. Paso 2 precio y plazo cerrados con el riesgo del lado del proveedor. Paso 3 el paquete listo para Cycle Start (código posprocesado, hoja de proceso, orígenes G54–G59, lista de herramientas con voladizos, F y S, vídeo de simulación).
3. **Capa 03 «Evidencia»:** tres tarjetas de autoridad técnica con animación SVG propia cada una — HSM con ángulo de compromiso constante, trocoidal en D2/H13/Ti-6Al-4V, y 5 ejes continuos con control de vector. Cada texto explica el *por qué* técnico, no el adjetivo. Al pie, tres enlaces a capacidades / sectores / tarifas.
4. **CTA de baja fricción:** «Manda tu plano y te digo la viabilidad» + WhatsApp, con la promesa explícita de que responde el ingeniero y no un comercial, y «sin registro ni llamada comercial».

**`docs/clips-spec.md`** — especificación de producción de los tres micro-clips de 3 s que sustituirán a las animaciones SVG: formato (recomienda MP4 sobre GIF, con el argumento de peso: 300–500 KB frente a 3–8 MB), resolución, reglas de bucle (cámara fija o el bucle se ve), qué debe verse en cada clip, comandos de `ffmpeg` y el HTML exacto de sustitución. Cada tarjeta de la home lleva un comentario que marca el punto de swap.

**Verificado en producción:** las 6 páginas y el sitemap responden 200, el copy nuevo se sirve correctamente, etiquetas balanceadas en las 5 páginas (`section`, `svg`, `div`), y validación cruzada de todos los anclajes internos y referencias entre páginas sin ningún enlace roto.

**Decisiones:**
- La landing mantiene cabecera sin navegación a propósito (sin rutas de escape); el resto comparte navegación unificada
- Animaciones SVG como estado de partida en lugar de dejar huecos esperando vídeo: la sección funciona hoy y el upgrade es un swap de bloque
- Alternancia de fondos recalculada tras el reordenado de capas

**Corregido de paso:** enlace roto `index.html#capacidades` en `servicios.html`, que apuntaba a una sección que ya no existe en la home.

---

## 📝 Estado técnico por módulo

### Frontend
| Componente | Estado | Notas |
|-----------|--------|-------|
| HTML estructura | ✅ 11 capas | Semántico, accesible |
| CSS (Tailwind) | ✅ 29 KB | Compilado, no CDN |
| JS vanilla | ✅ + Canvas 2D | 404 líneas nuevas en app.js |
| Toggle tema | ✅ | localStorage `mag-theme` |
| Quiz "preguntas rápidas" | ✅ | Integrado en sección "problemas" |
| Formulario contacto | ✅ | FormSubmit + Supabase (con try/catch) |
| Raster animation | ✅ | GSAP ScrollTrigger + MotionPathPlugin |
| Simulación hero panel | ✅ | Canvas 2D, 60 fps, islas + virutas |
| Scroll-snap | ⚠️ | Causa tirones; pendiente: desactivar o reducir |
| Parallax scrub | ⚠️ | Fuerza reflow; pendiente: quitar o reducir |
| Font Awesome | ⚠️ | Full (~100 KB) para 15 iconos; pendiente: SVG inline |
| Google Fonts | ⚠️ | Render-blocking; pendiente: self-host |

### Backend
| Componente | Estado | Notas |
|-----------|--------|-------|
| Supabase DB | ✅ | PostgreSQL, tabla `leads`, RLS activo |
| Supabase Auth | ⏳ | No usado (aún) |
| FormSubmit.co | ⏳ | Conectado, PENDIENTE: usuario activa email |
| Email corporativo | ⏳ | No existe (usar chapy9716@gmail.com por ahora) |
| Analytics | ⏳ | Script Vercel en `<head>`, no activado en dashboard |

### DevOps
| Componente | Estado | Notas |
|-----------|--------|-------|
| Vercel hosting | ✅ | mag-industries.vercel.app, equipo magi-ndustries |
| Git + Vercel integration | ✅ | Cada push = deploy (2 min) |
| Build command | ✅ | `npm run build` (tailwind + copy-static) |
| Node.js local | ✅ | LTS en `C:\Program Files\nodejs` (no en PATH) |
| GitHub repo | ✅ | AntiSysteMa/mag-industries, rama main |

### Seguridad & Compliance
| Componente | Estado | Notas |
|-----------|--------|-------|
| HTTPS | ✅ | Vercel + Let's Encrypt |
| RGPD (privacidad.html) | ⏳ | Plantilla lista, PENDIENTE: NIF + razón social |
| CSP | ✅ | Strict (no inline scripts, no CDN lejanos) |
| Honeypot formulario | ✅ | Campo `_gotcha` en FormSubmit |
| SEO (og-image, canonical, sitemap) | ✅ | JSON-LD ProfessionalService incluido |

---

## 🎯 Archivos clave

### Críticos (modificación = redeploy)
- `index.html` — estructura HTML, rutas, meta tags
- `app.js` — toda la interactividad (toggle, quiz, Canvas, GSAP)
- `input.css` — estilos custom (variables, animaciones)
- `tailwind.config.js` — tema (colores, fuentes, extensiones)

### Construcción
- `package.json` — scripts, dependencias (GSAP, Tailwind)
- `vercel.json` — buildCmd, outputDir, env vars

### Assets
- `assets/logo-oscuro.png` — 96px, PNG optimizado
- `assets/logo-claro.png` — 96px, PNG optimizado
- (No og-image.png en git; generada con System.Drawing, localmente)

### Documentación
- `CLAUDE.md` — este contexto
- `PROJECT_STATE.md` — estado sesión-a-sesión
- `.git/` — histórico, ramas

---

## 🚀 Siguiente sesión: Roadmap inmediato

### Hito 1 (Semana 1-2) — Captura de leads & fundamentos
**Propósito:** máquina de leads + identidad corporativa

- [ ] **Email corporativo**
  - Crear proyecto@magindustries.com o contacto@
  - Actualizar en `index.html`, `app.js` (formulario), `privacidad.html`
  - Reemplazar todas las instancias de chapy9716@gmail.com

- [ ] **Activar FormSubmit.co**
  - Usuario: ir a https://formsubmit.co/confirmacion
  - Confirmar email en bandeja
  - Post al formulario empezará a funcionar sin honeypot block

- [ ] **CRM básico en Supabase**
  - Dashboard Supabase: crear vistas/reports de `leads`
  - KPIs: leads/mes, conversión %, ciudad, sector
  - (Alternativa: Airtable/Notion si prefieres UI más simple)

- [ ] **Case study + testimonial**
  - Entrevistar 1 cliente real (proyecto pasado)
  - Documentar: problema → solución → impacto (% mejora)
  - Subir a sección "resultados" o blog

- [ ] **Landing "Auditoría gratis 30 min"**
  - Nueva subpágina: `/auditoria-gratuita.html`
  - Copy: problema → solución → formulario
  - Goal: 2-5% conversión

- [ ] **Activar Analytics en Vercel**
  - Dashboard Vercel → Analytics → Enable
  - Comienza a recopilar: page views, referrers, top pages

**Tiempo estimado:** 6-8h | **Impacto:** CAC + conversión + visibilidad

---

### Hito 2 (Semana 3-8) — Tracción digital
**Propósito:** leads orgánicos + autoridad

- [ ] **LinkedIn strategy**
  - 1 post/semana (tip técnico + case study + reflexión)
  - LinkedIn Ads: €300-500/mes (segmentar: gerentes producción, 20-200 empleados)

- [ ] **SEO: 5 artículos blog**
  - Temas: "cómo mejorar productividad CNC", "checklist auditoría técnica", etc.
  - Backlinks: cámaras industria, asociaciones técnicas

- [ ] **Prospecting list**
  - LinkedIn Sales Navigator: 50 leads/mes
  - Script frío: 15 seg, problema → solución → CTA
  - Follow-up: día 1, 3, 7, 14

- [ ] **Subpáginas**
  - `/servicios.html` — 3 ofertas (auditoría, programming, optimización)
  - `/proceso.html` — cómo trabajamos (ya existe, mejorar)
  - `/pricing.html` — rango de precios indicativo (tranquilidad B2B)

**Tiempo estimado:** 12-16h | **Impacto:** posicionamiento SEO + brand awareness

---

### Hito 3 (Semana 9-16) — Escala operativa
**Propósito:** cerrar deals + formalizar procesos

- [ ] **SOP (Standard Operating Procedures)**
  - Auditoría: checklist + templae reporte
  - Propuesta: template + negociación
  - Entrega: hitos, reportes, feedback loop

- [ ] **Identificar subcontratista**
  - Programador CNC freelance (Portugal/México es opción)
  - Backup para picos de demanda

- [ ] **Dashboard financiero**
  - Looker Studio (free): leads → conversión → MRR
  - KPIs: CAC, LTV, payback, runway

- [ ] **Cerrar 2-3 clientes piloto**
  - Aplicar learnings de leads
  - Documentar caso de éxito

**Tiempo estimado:** Ongoing | **Impacto:** revenue + operacional maturity

---

## 📋 Checklist de próxima sesión

**Al iniciar (2 min):**
- [ ] Leer CLAUDE.md (este archivo)
- [ ] Leer PROJECT_STATE.md (estado actual)
- [ ] Revisar memory en `C:\Users\chapy\.claude\projects\...\memory\`

**Trabajo (sesión):**
- [ ] Seleccionar 1-2 items de "Hito 1"
- [ ] Ejecutar con commits pequeños y verificables
- [ ] Documentar decisiones

**Al cerrar (5 min):**
- [ ] Actualizar PROJECT_STATE.md:
  - Qué se logró (commits, líneas, cambios)
  - Archivos modificados
  - Decisiones tomadas
  - Bloqueadores resueltos / nuevos
  - Siguientes pasos
- [ ] Commit: `docs: PROJECT_STATE update [sesión N]`
- [ ] Push a main

---

## 🔗 Referencias rápidas

**Documento maestro:** CLAUDE.md (arquitectura, stack, decisiones)  
**Estado actual:** PROJECT_STATE.md (este archivo)  
**Memoria persistent:** `memory/mag-industries-website.md`  
**Web en vivo:** https://mag-industries.vercel.app  
**Repo:** https://github.com/AntiSysteMa/mag-industries  

---

**Siguiente: Seleccionar trabajo del Hito 1 y ejecutar.**
