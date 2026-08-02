# PROJECT_STATE — MAG INDUSTRIES

**Última sesión:** 2 agosto 2026 (Sesión 7)
**Estado:** En producción en dominio propio (magindustries.es). Correo corporativo operativo. Base de datos y cabeceras endurecidas.
**Siguiente sesión esperada:** Rate limiting de inserciones, razón social/NIF en privacidad.html y panel de lectura de leads

---

## ⚠️ BLOQUEADORES ACTIVOS (leer primero)

| # | Bloqueador | Impacto | Acción del usuario |
|---|-----------|---------|--------------------|
| 1 | **`[RAZÓN SOCIAL — NIF]` sin rellenar** | `privacidad.html` sigue con el placeholder mientras ya se tratan datos personales reales. Exposición legal activa ante la AEPD. | Sustituir por la razón social y NIF definitivos |
| 2 | **Referencia pendiente de permiso** | La web ofrece poner en contacto a prospectos con el taller de matricería. | Pedir permiso a JPARENTE antes de que alguien lo solicite |
| 3 | Sin rate limiting de inserciones | Los CHECK acotan el tamaño de cada fila, pero no el número de filas. Un atacante con la clave publicable puede inundar la tabla. El aviso por email seguiría llegando. | Edge Function con límite por IP, o monitorización de volumen |
| 4 | Sin borrado automático a 2 años | La política de privacidad lo promete; no hay nada que lo ejecute. | Cron de Supabase o revisión manual periódica |
| 5 | Analytics de Vercel sin activar | El script está en el HTML pero no está habilitado en el dashboard. | Activar en el dashboard de Vercel |

**Resueltos:** FormSubmit activo · Supabase operativo (sesión 5) · Precios confirmados (sesión 6) · Dominio propio en producción (sesión 6) · **Google Workspace operativo con `info@magindustries.es` (sesión 7)** · **Tabla huérfana `doc_memory` eliminada y `leads` endurecida (sesión 7)** · **Cabeceras de seguridad desplegadas (sesión 7)**.

---

## 🌐 Dominio (verificado 30-jul-2026)

**`magindustries.es`** — registrado en DonDominio (4,95 €/año), en producción.

| Registro | Valor | Estado |
|---|---|---|
| Apex `magindustries.es` | → `216.198.79.65` / `64.29.17.65` (Vercel) | 308 → www |
| `www` | CNAME → `58b50ebb31dd7a95.vercel-dns-017.com` | 200 OK |
| SSL | Emitido por Vercel | Válido |

⚠️ **DNS gestionado en DonDominio**, no en Vercel. Al añadir registros de correo hay que **borrar antes los MX de DonDominio** (`mailsrv1.dondominio.com`) y **editar** el TXT SPF existente (`v=spf1 include:spf.dondominio.com`) en vez de añadir uno segundo — dos SPF rompen la validación de ambos.

`magindustries.com` está en manos de un especulador (nameservers de NameBright). No perseguirlo.

Aún **no se publica ninguna dirección `@magindustries.es`** en la web hasta que Workspace esté activo. FormSubmit sigue apuntando a la dirección de Gmail actual a propósito: cambiar el destino exige activar antes la nueva en FormSubmit, y hacerlo prematuramente dejaría la captación rota.

---

## 🔐 Datos de infraestructura verificados (29-jul-2026)

| Recurso | Valor | Estado |
|---|---|---|
| Proyecto Supabase | `lryyubgldnrrxokkeeef` · «supabase-aero-bell» · eu-central-2 | ACTIVE_HEALTHY |
| Clave publicable | `sb_publishable_LnAfjL6RQRdoPnOw5ZSEkA_jlCcbNBZ` | En uso |
| Tabla | `public.leads` | Creada, RLS activo |
| Política RLS | Solo INSERT para `anon`. **Sin política de SELECT** a propósito | Verificada |
| Aviso por email | FormSubmit → chapy9716@gmail.com | Funciona |

⚠️ **`bisioblvzoegaqokamel` no existe.** Es el ref que estuvo en el código desde el principio y devuelve NXDOMAIN. Si vuelve a aparecer en algún sitio, es un error — no lo restaures.

Otro proyecto en la cuenta, `vdlnqgudysfzbysvztdp` («Love-moon»), es una app distinta sin relación con MAG. No tocar.

Para leer los leads: panel de Supabase o `service_role`. Con la clave publicable no se pueden leer, y eso es intencionado.

---

## 📊 Resumen ejecutivo

| Métrica | Valor | Estado |
|---------|-------|--------|
| Sitio web | Live en `www.magindustries.es` | ✅ |
| Dominio propio | `magindustries.es` (DonDominio, DNS → Vercel, SSL OK) | ✅ |
| Arquitectura | 9 páginas (home + landing + tarifas + capacidades + sectores + privacidad + blog y 2 artículos) | ✅ |
| Guardado de leads | Supabase `public.leads`, RLS solo INSERT | ✅ |
| Aviso por email | FormSubmit → `info@magindustries.es` | ✅ |
| Contenido verificable | Sin cifras ni testimonios inventados | ✅ |
| Email corporativo | Google Workspace: `info@`, `proyectos@`, `ventas@`, `noreply@` | ✅ |
| Cabeceras de seguridad | CSP + 6 cabeceras más, verificadas en producción | ✅ |
| Analytics activadas | No | ⏳ |
| Leads captados | 0 (embudo recién publicado) | 📝 |
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

### Sesión 7 (2 agosto 2026)
**Objetivo:** Migrar al correo corporativo y auditar los flancos de seguridad de la base de datos y los formularios.

**Commits:** `5818376` · `b341265`

**1. Correo corporativo (`5818376`)**

Google Workspace operativo sobre `magindustries.es`, MX verificado apuntando a `smtp.google.com`. Buzones creados: `info@` (principal), `proyectos@`, `ventas@` y `noreply@`. El destino de FormSubmit en `app.js` pasa de `chapy9716@gmail.com` a `info@magindustries.es`, y `privacidad.html` deja de publicar `proyectos@magindustries.com` — un dominio que **no es nuestro**: cualquier ejercicio de derechos RGPD enviado ahí llegaba a un tercero.

**2. Auditoría de seguridad — hallazgo crítico no documentado**

La tabla **`public.doc_memory`** vivía en el mismo proyecto Supabase que `leads` con la política `single_user_full_access`: `ALL` para `anon` y `authenticated`, `USING(true)` y `WITH CHECK(true)`. Cualquiera que leyese `app.js` obtenía la clave publicable y con ella podía leer, escribir, borrar y truncar esa tabla — es decir, usar el proyecto como almacenamiento gratuito, incluido contenido ilegal alojado bajo esta cuenta. No estaba referenciada en ningún archivo del repositorio y tenía 0 filas. **Eliminada.**

**3. Endurecimiento de `leads`**

- CHECK de longitud en las 8 columnas (`detalles` máx. 4000, `email` máx. 254, etc.). Antes se podían insertar strings de megabytes por POST directo y agotar el almacenamiento.
- CHECK de formato de email y de campos mínimos (`nombre` y `email` no vacíos): la validación de `app.js` solo protege al que usa el navegador.
- `revoke all ... from anon, authenticated` + `grant insert to anon`. Antes `anon` tenía SELECT/UPDATE/DELETE/TRUNCATE y **RLS era lo único** que impedía leer los contactos con una clave publicada en `app.js`. El INSERT sigue funcionando porque `app.js` usa `Prefer: return=minimal` y no necesita SELECT.

Verificado con peticiones reales usando la clave publicable: INSERT legítimo `201`; SELECT de leads `401`; DELETE masivo `401`; payload de 50 KB `400`; email inválido `400`.

**4. Cabeceras de seguridad (`b341265`)**

Los headers de producción eran **solo HSTS**. No había CSP, pese a que este documento afirmaba «CSP ✅ Strict (no inline scripts, no CDN lejanos)» — falso en los tres puntos: hay script inline en el `<head>` y se cargan dos CDN externos. Creer que existía una CSP era peor que saber que no.

CSP nueva ajustada a los orígenes reales (cdnjs para GSAP y Font Awesome, Google Fonts, Unsplash, Supabase, FormSubmit) más `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS con `includeSubDomains`.

Verificado en las 9 páginas de producción: todas responden 200 con las cabeceras, ningún origen externo queda bloqueado, y en navegador GSAP 3.12.5 carga sin necesitar `unsafe-eval`, Font Awesome y Barlow renderizan, la simulación del hero corre y no hay imágenes rotas.

**Decisiones:**
- `script-src` conserva `'unsafe-inline'`: el script de tema debe ejecutarse antes del pintado para evitar parpadeo, y Vercel estático no permite nonces por petición. Se acepta el compromiso porque hoy la web no renderiza contenido de terceros; las demás directivas sí acotan orígenes.
- Los CHECK acotan el tamaño de cada fila pero **no** el número de filas: el rate limiting real exige una Edge Function que vea la IP. Queda pendiente y anotado como bloqueador.

**Riesgo latente anotado:** `detalles` es texto controlado por quien envía el formulario. Cuando se construya el panel de lectura de leads, nunca debe volcarse con `innerHTML`.

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
| FormSubmit.co | ✅ | Activo, destino `info@magindustries.es` |
| Email corporativo | ✅ | Google Workspace. Buzones: `info@` (principal, usado por la web), `proyectos@`, `ventas@`, `noreply@`. MX → `smtp.google.com` verificado |
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
| CSP | ✅ | Desplegada 2-ago-2026 en `vercel.json`. `script-src` mantiene `'unsafe-inline'` a propósito: el script de tema va inline en el `<head>` para evitar parpadeo. Verificada en las 9 páginas |
| Otras cabeceras | ✅ | `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS con `includeSubDomains` |
| Grants de `leads` | ✅ | `anon` conserva solo INSERT. Antes tenía SELECT/UPDATE/DELETE/TRUNCATE y RLS era la única barrera |
| Límites de entrada | ✅ | CHECK de longitud por columna + formato de email + nombre/email obligatorios en BD, con `maxlength` espejo en ambos formularios |
| Honeypot formulario | ⚠️ | Campo `_gotcha`, pero se valida **solo en JavaScript** ([app.js:468](app.js:468)): un POST directo a la REST API lo ignora |
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
