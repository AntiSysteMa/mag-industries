# PROJECT_STATE — MAG INDUSTRIES

**Última sesión:** 3 agosto 2026 (Sesión 11)
**Estado:** En producción, infraestructura cerrada y **entrega de correo confirmada con envío real** (SPF/DKIM/DMARC pass). Captación reforzada: el quiz ya captura, la landing tiene agenda y la home calculadora de coste. **Sitio a cero menciones de software CAD/CAM**, con Mazak añadido a los controles y una séptima área de transformación digital.
**Siguiente sesión esperada:** Guiones y clips de simulación + estrategia visual — **a petición del usuario, no antes de que él lo pida**. Antes, dos datos suyos: URL del calendario de citas y URL de LinkedIn / Google Business.

---

## ⚠️ BLOQUEADORES ACTIVOS (leer primero)

| # | Bloqueador | Impacto | Acción |
|---|-----------|---------|----|
| 1 | **Sin panel de lectura de leads** | Los contactos solo se consultan abriendo Supabase. 46 visitors en 7 días: es fricción creciente. | Edge Function autenticada o bastar con Supabase |
| 2 | **Referencia pendiente de permiso** | La web ofrece contacto con taller de matricería. | Pedir permiso a JPARENTE antes de que alguien lo solicite |
| 3 | **Rendimiento pendiente** | Font Awesome full (~100 KB) para ~15 iconos, Google Fonts render-blocking. Afecta Core Web Vitals y SEO. | Sesión estratégica: prioridad vs. otros trabajos |
| 4 | **Perfiles sociales sin personalizar y sin enlazar** | LinkedIn y Google Business Profile **ya creados** (sesión 9), pendientes de personalizar. La web no los enlaza todavía: el footer oculta los iconos hasta tener URL. | Personalizar ambos y **pasar las dos URL** para pegarlas en el footer |
| 5 | **Falta la URL del calendario de citas** | La sección `#agenda` de la landing está construida y desplegada, pero `data-cal-embed` / `data-cal-link` están vacíos, así que se oculta entera. Es el último paso para que la auditoría se pueda agendar sola. | Crear el horario de citas en Google Calendar y **pasar las dos URL** (ver guía al final de la sesión 9) |

**Decisiones del usuario, no bloqueadores** (no las «arregles» en próximas sesiones):
- **Razón social y NIF ocultos** en `privacidad.html`. **Criterio de salida fijado en la sesión 8:** se publicarán cuando haya **un cliente recurrente y 2.000 €/mes recurrentes**, no antes. Hasta entonces la frase queda completa y veraz, sin placeholder visible. Es una decisión consciente con umbral explícito, no un olvido.
- **Borrado a 2 años manual.** La política lo promete y se cumplirá a mano; con el volumen actual no compensa automatizarlo. La narrativa de la política **no se toca**.

**Resueltos:** FormSubmit activo y **confirmado operativo** · WhatsApp operativo · Supabase operativo (sesión 5) · Precios confirmados (sesión 6) · Dominio propio en producción (sesión 6) · **Google Workspace con `info@magindustries.es` (sesión 7)** · **Tabla huérfana `doc_memory` eliminada (sesión 7)** · **`leads` cerrada a `anon` por completo (sesión 7)** · **Cabeceras de seguridad desplegadas (sesión 7)** · **Rate limiting por IP y honeypot en servidor (sesión 7)** · **SPF + DKIM + DMARC verificados en DNS público (sesión 8)** · **Vercel Analytics activadas (sesión 8)**.

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
| Política RLS | **Ninguna.** RLS activo y cero políticas: `anon` y `authenticated` no acceden por ningún camino | Verificada 2-ago |
| Escritura | Solo `service_role`, dentro de la Edge Function `submit-lead` | Verificada 2-ago |
| Aviso por email | FormSubmit → info@magindustries.es | Funciona |

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
| Guardado de leads | Supabase `public.leads` vía Edge Function, con rate limiting por IP | ✅ |
| Aviso por email | FormSubmit → `info@magindustries.es` | ✅ |
| Contenido verificable | Sin cifras ni testimonios inventados | ✅ |
| Email corporativo | Google Workspace: `info@`, `proyectos@`, `ventas@`, `noreply@` | ✅ |
| Correo autenticado (SPF/DKIM/DMARC) | Los tres verificados en DNS público | ✅ |
| Presencia social (LinkedIn, Google Business) | No existe. Footer con enlaces a `#` | ❌ |
| Cabeceras de seguridad | CSP + 6 cabeceras más, verificadas en producción | ✅ |
| Analytics activadas | Sí (46 visitors/semana medidos) | ✅ |
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

**5. Rate limiting y honeypot en servidor (`f427a79`)**

Los CHECK acotaban el tamaño de cada fila pero no cuántas, y el honeypot `_gotcha` se validaba solo en JavaScript. Ambos agujeros se cierran con la Edge Function **`submit-lead`** (`verify_jwt: false`, endpoint público de formulario), que ahora es el **único** camino de escritura.

Cada petición atraviesa, en orden: lista blanca de origen → tamaño del cuerpo (16 KB, comprobado antes de parsear) → honeypot → longitudes y formato de email → rate limiting por IP (5/hora, 15/día). Solo entonces inserta con `service_role`, que nunca sale del servidor.

Detalles que importan:
- Ante un honeypot positivo se responde **200 sin insertar**. Si el bot recibiera un error, reintentaría variando el payload.
- La IP se guarda como **HMAC-SHA256** con la `service_role` de clave, nunca en claro: es dato personal y no hay motivo para conservarla legible. Verificado leyendo `rate_limit`: solo hashes.
- Los contadores viven en `public.rate_limit`, con RLS activo y **cero políticas**, más `bump_rate()` en `security definer` con `revoke` a los roles públicos.
- Si el contador falla, se registra y **se continúa**: perder un lead real es peor que aceptar uno de más.
- Un 429 no pierde el contacto: el aviso por FormSubmit es un camino independiente.

**6. Cierre del INSERT directo**

Con la función ya en producción se eliminó la política `anon puede registrar leads` y se revocaron todos los grants. **`leads` queda con RLS activo y cero políticas**: ningún rol público la lee ni la escribe. Solo `service_role`.

Verificado desde el navegador, en producción, antes y después del revoke:

| Prueba | Antes | Después |
|---|---|---|
| Lead vía Edge Function | 201 | **201** |
| INSERT directo en la tabla | 201 | **401** |
| SELECT de la tabla | 401 | **401** |

Y contra la función: origen ajeno `403` · email inválido `400` · sin nombre `400` · honeypot `200` sin fila · cuerpo de 20 KB `413` · lead legítimo `201` · sexta petición de la misma IP `429`.

**7. Decisiones del usuario aplicadas**

Razón social y NIF **ocultos** en `privacidad.html` (frase reescrita para que se lea completa y veraz, sin placeholder). Borrado a 2 años **queda manual** y la narrativa de la política no se toca. Script de analítica añadido a `privacidad.html`, la única página que no lo llevaba.

**Riesgo latente anotado:** `detalles` es texto controlado por quien envía el formulario. Cuando se construya el panel de lectura de leads, nunca debe volcarse con `innerHTML`.

**Deuda anotada:** `.hp-field` está declarado dos veces en `input.css` (líneas 161 y 185), resto de una refactorización. Es cosmético, no afecta al funcionamiento.

### Sesión 8 (2 agosto 2026)
**Objetivo:** Autenticar el correo corporativo (SPF/DKIM/DMARC) para que los envíos desde `@magindustries.es` no caigan en spam, y reconciliar la documentación con lo que de verdad está activo.

**Sin cambios de código.** Todo el trabajo fue en la zona DNS de DonDominio.

**1. Autenticación de correo — los tres registros**

Google Workspace llevaba desde la sesión 7 recibiendo correo (MX → `smtp.google.com`), pero **enviaba sin autenticar**: ni SPF, ni DKIM, ni DMARC. Un dominio nuevo enviando sin ninguno de los tres es el perfil que los filtros clasifican como sospechoso por defecto — y el emisor no se entera, porque el correo no rebota, se archiva en spam del destinatario.

| Host | Tipo | Valor |
|---|---|---|
| `magindustries.es` | TXT | `v=spf1 include:_spf.google.com ~all` |
| `google._domainkey` | TXT | `v=DKIM1; k=rsa; p=MIIBIjANBg…` (2048 bits, emitida por Google Admin) |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; rua=mailto:info@magindustries.es; fo=1` |

**Verificado con `nslookup -type=TXT <host> 8.8.8.8`**, no asumido ni dado por bueno desde el panel del registrador: los tres resuelven contra DNS público. La propagación fue casi inmediata, no las 24-48 h habituales.

**2. Correcciones sobre el plan inicial**

Tres cosas que este documento y los artefactos daban por buenas y no lo eran:

- **No existía ningún SPF previo de DonDominio que editar.** `CLAUDE.md` y este archivo advertían de «editar el TXT SPF existente en vez de añadir un segundo». Esa advertencia describía un riesgo real pero un estado falso: la zona no tenía SPF de ninguna clase. Se creó uno limpio. La advertencia se mantiene reescrita porque **sí aplicará** en cuanto se añada un segundo emisor.
- **Tampoco había MX de DonDominio que borrar.** El único MX era ya el de Google, prioridad 0. Otro paso previsto que no hizo falta.
- **`rua=` apunta a `info@`, no a `postmaster@`.** El valor de manual es `postmaster@`, pero ese buzón **no existe** en este Workspace (solo `info@`, `proyectos@`, `ventas@`, `noreply@`). Con `postmaster@` los informes DMARC habrían rebotado en silencio: el registro se vería correcto y no llegaría nada.
- **`formsubmit.co` fuera del SPF.** Se descartó incluirlo: FormSubmit envía el aviso **desde su propio dominio**, no suplantando `@magindustries.es`. El SPF solo autoriza a quien dice ser tú; meter emisores que no lo hacen es ruido que además gasta uno de los 10 lookups DNS que permite la especificación.

**3. Estado real confirmado por el usuario**

Tres cosas que este documento listaba como pendientes y llevaban tiempo hechas:

- **Vercel Analytics activadas.** El bloqueador «un clic del usuario» del Hito 1 está cerrado.
- **FormSubmit activo** (el «falta pulsar Activate» del reporte estratégico de julio).
- **WhatsApp operativo** como canal directo.

**4. Decisión del usuario registrada**

Razón social y NIF permanecen ocultos en `privacidad.html` hasta alcanzar **un cliente recurrente y 2.000 €/mes recurrentes**. Antes el criterio era difuso («hasta que toque exponerse»); ahora es un umbral medible.

**Decisiones:**
- `p=quarantine` y no `p=reject`: con `reject` desde el día uno, cualquier emisor legítimo aún no autorizado pierde correo de forma irrecuperable. Se endurecerá cuando los informes DMARC confirmen que no falla nada legítimo.
- `~all` y no `-all`, por el mismo motivo.
- No se limpió el ruido heredado de la zona (CNAMEs `mail.`/`smtp.`/`pop.`/`imap.`/`webmail.` → DonDominio, wildcard `*` → parking, y un registro malformado `magindustries.es.magindustries.es`). No rompe nada porque el MX manda; tocarlo sin necesidad es riesgo gratuito sobre un servicio que acaba de quedar bien.

**Pendiente de esta sesión:** el DNS está correcto, pero **la entrega real solo se confirma con un envío**. Prueba a `check-auth@verifier.port25.com` o revisando cabeceras en un Gmail de destino → debe leerse SPF PASS / DKIM PASS / DMARC PASS.

### Sesión 9 (3 agosto 2026)
**Objetivo:** Ejecutar la Prioridad 0 del roadmap — cerrar los huecos de captación que los artefactos señalaban y el correo autenticado desbloqueó.

**Commit:** `c20329c` · caché a `app.js?v=12` y `tailwind.css?v=11`

**0. Entrega de correo confirmada (cierra la sesión 8)**

Envío real desde `info@magindustries.es` a `check-auth@verifier.port25.com`:
**SPF pass · DKIM pass · iprev pass**. El DKIM verifica con `header.d=magindustries.es` y el `mail-from` es del mismo dominio, así que ambos identificadores están alineados con el `From:` y **DMARC pasa**. La sesión 8 quedaba pendiente de esto y ya no lo está.

Dato secundario que salió del informe: el `iprev` de Google también pasa. No es algo que controlemos, pero es una de las señales de reputación que miran los filtros.

**1. El quiz ya no pierde leads**

Las respuestas morían dentro del IIFE: se pintaba el resultado y se perdían. Quien se autocalificaba como VIP y no bajaba a rellenar el formulario era un lead perdido en silencio — precisamente el de más valor. Era el hueco OP-030 del reporte estratégico.

Ahora hace tres cosas:
- El resultado pide **nombre y correo ahí mismo** (dos campos, sin bajar) y envía por los dos caminos de siempre: Edge Function + FormSubmit, con el diagnóstico ya redactado en `detalles`.
- Publica las respuestas en `sessionStorage`, así que si el visitante baja al formulario grande —o salta a la landing— el lead llega con el diagnóstico adjunto.
- Un lead VIP se marca en `origen`, para poder medirlo aparte.

El honeypot `_gotcha` va también en este formulario: sin él, este camino sería el más fácil de automatizar de toda la web.

**2. Agenda de la auditoría**

Sección `#agenda` nueva en la landing, preparada para el **horario de citas de Google Calendar** (nativo de Workspace: sin terceros nuevos, sin coste extra, y la disponibilidad sale del calendario real).

El iframe se carga **solo al pulsar**. Esta landing se hizo sin GSAP a propósito para que cargara rápido; meter a Google en el primer pintado deshacía justo eso. Hasta que alguien pulsa, la página no habla con Google.

⚠️ **`data-cal-embed` y `data-cal-link` están vacíos**: falta pegar la URL del calendario. Mientras lo estén, `app.js` oculta la sección **y los dos enlaces que apuntan a ella**, y el formulario sigue siendo el camino. Nunca se enseña un botón que no lleva a ningún sitio. Verificado en producción: sección oculta, 2 de 2 CTA ocultos.

**3. Calculadora de coste de máquina parada**

En la capa 05, bajo el quiz: dos barras (horas paradas/semana × coste/hora) y la cifra en euros por semana y por año. Es el hueco OP-030 «calculadora».

Sobre **46 semanas y no 52**, descontando vacaciones y paradas de planta. Inflar esa cifra la haría más golosa y menos creíble, que es lo contrario de lo que buscamos con un lector técnico. Se explica bajo el resultado.

**4. Enlaces sociales del footer**

Apuntaban a `#` (hueco D-04). Ahora se ocultan solos si no tienen URL real, y aparecen sin tocar código en cuanto se pegue una. Sustituido el icono de X por el de Google, que es el perfil que sí existe. **Pendiente: pegar las URL de LinkedIn y Google Business Profile.**

**Verificado en producción** (no en local), tras el deploy:
- CSP sirve `frame-src https://calendar.google.com`
- Quiz completo por la ruta VIP → aparece el formulario de captura, botón en `rgb(46,230,168)` (cyber), `sessionStorage` con el diagnóstico
- Calculadora: 20 h × 90 € → 1.800 €/semana y 82.800 €/año
- Sección agenda y sus CTA ocultos al no haber URL
- Honeypot posicionado fuera de pantalla

**No se enviaron leads de prueba**: habrían creado filas reales en `leads` y disparado avisos a `info@`. El camino de envío está verificado por código y por la validación previa de la sesión 7, no por un envío nuevo.

**Decisiones:**
- **Google Calendar y no Cal.com**: ya se paga Workspace, la sincronización es nativa, no añade un tercero al que dar acceso al calendario y no amplía la CSP más allá de un `frame-src`.
- **Clases Tailwind literales en las dos ramas del quiz**, nunca concatenadas (`bg-${acento}`): Tailwind compila escaneando texto, así que una clase construida en tiempo de ejecución no llega a la hoja de estilos y el botón habría salido sin color. Se duplica markup a cambio de que no pueda romperse.
- **`f.elements.name` y no `f.name`** en el formulario del quiz: `name` colisiona con la propiedad nativa `HTMLFormElement.name`.

**Deuda saldada:** el bloque de ~20 líneas duplicado en `input.css` (foco, honeypot y `#wa-btn` declarados dos veces) estaba anotado desde la sesión 7. Eliminada la primera copia, que era la que quedaba sobrescrita; el resultado visual no cambia.

### Sesión 10 (3 agosto 2026)
**Objetivo:** Reescribir la narrativa de `capacidades.html` con enfoque general por áreas, sin nombrar software.

**Commit:** `0cb88d7` · sin cambios en `app.js` ni CSS, así que no se toca la caché.

**Motivo (del usuario):** enumerar herramientas concretas expone a discutir licencias y obliga a defender cada nombre en una llamada técnica. Es la misma preocupación que el reporte estratégico recoge en **A-04** («cada nombre que no puedas defender te resta credibilidad global») y **B-04**, marcada CRÍTICA («trabajar para terceros con licencias educativas o personales es un riesgo legal directo»). La página pasa a describir **qué se hace y para qué sirve**, no **con qué se hace** — que además no es lo que decide una compra.

**Siete áreas** (antes seis más control dimensional):
1. Ingeniería de producto y modelado paramétrico avanzado
2. Programación CNC y mecanizado multieje
3. Torneado CNC de alta precisión
4. Electroerosión por hilo
5. Electroerosión por penetración (EDM)
6. Marcado y grabado láser industrial
7. **Transformación digital y automatización de procesos** (nueva): automatización de procesos internos, documentación automática, agentes de IA, CRM y bases de datos, aplicaciones a medida e infraestructura digital.

**Retirada la tarjeta de «Control dimensional».** No estaba en el alcance nuevo y además rozaba la metrología, que la FAQ de `auditoria-gratuita.html` dice expresamente que **no** se ofrece. Tenerla era una inconsistencia latente entre dos páginas.

La tarjeta nueva lleva **SVG propio** (diagrama de flujo digitalizado con pulsos de datos) en lugar de foto de stock: quita de paso la única imagen remota de Unsplash que quedaba en esta página.

**Verificado en producción:** 7 tarjetas con sus 7 títulos, **0 menciones** de software concreto, SVG nuevo renderizando con sus 3 pulsos animados, 0 imágenes remotas, y sin scroll horizontal ni títulos cortados en escritorio (1280) ni en móvil (375).

⚠️ Quedaban 11 menciones de software en el resto del sitio. **Resueltas en la sesión 11.**

### Sesión 11 (3 agosto 2026)
**Objetivo:** Extender al sitio entero la regla de no nombrar software CAD/CAM, y añadir Mazak a los controles.

**Commit:** `pendiente` · sin cambios en `app.js` ni CSS.

**1. Cero menciones de suites CAD/CAM en todo el sitio**

Verificado con búsqueda de `CATIA|SolidWorks|Mastercam|ESPRIT|BobCAD|Fusion|NX|Vericut|Inventor|Creo` sobre todos los `.html`: **0 coincidencias**.

Lo que se cambió, y por qué cada uno:
- `index.html` · meta keywords: fuera «programador de BobCAD-CAM», entran «programación CAM multiplataforma» e «independencia de plataforma CAD CAM».
- `index.html` · pie del panel del hero: «BobCAD-CAM · postprocesador…» → «posprocesado para…».
- `index.html` · paso 01 del onboarding: «un nativo de SolidWorks o Fusion» → «el fichero nativo de tu CAD».
- `index.html` · tarjeta «Plataformas CAM» → **«Independencia de plataforma»**, reescrita con la narrativa nueva. El contador pasa de `5` (plataformas CAM) a `4` (familias de control) con su etiqueta, porque el número anterior contaba justo lo que se ha dejado de nombrar.
- `auditoria-gratuita.html` · FAQ «¿Con qué software trabajáis?»: reescrita entera. Ahora el énfasis está en programar **con la licencia del cliente** para que el archivo quede en su entorno, y en que el proceso no depende del software.

**2. Mazak añadido a los controles, en los 8 puntos**

`index.html` ×6, `servicios.html` y `blog.html`. Se usa «Mazak Mazatrol» donde hay detalle de modelos y «Mazak» en las listas cortas. Verificado que ningún punto quedó sin actualizar: una lista incoherente entre páginas es peor que no darla.

**3. La narrativa que sustituye a la lista de productos**

Textual del usuario, y es el argumento que se ha llevado al copy: *el que sabe hacer el proceso puede hacerlo en cualquier software; el mecanizado y el diseño siguen los mismos caminos con distintas interfaces, y lo esencial es la planificación de ingeniería.* Sigue expresando dominio multiplataforma, pero sin declarar qué licencias se poseen.

**4. JSON-LD ampliado**

`description` y `knowsAbout` de `ProfessionalService` incorporan transformación digital y automatización de procesos, que faltaban desde que se añadió el área en la sesión 10.

**Regla escrita en `CLAUDE.md`** (Visión + regla de oro nº9) para que no se reintroduzca en una sesión futura.

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
| Supabase DB | ✅ | PostgreSQL. `leads` y `rate_limit` con RLS activo y cero políticas |
| Edge Function `submit-lead` | ✅ | Único camino de escritura. Código versionado en `supabase/functions/submit-lead/index.ts`. **Un push a `main` NO la redespliega**: hay que desplegarla aparte |
| Supabase Auth | ⏳ | No usado (aún) |
| FormSubmit.co | ✅ | Activo, destino `info@magindustries.es` |
| Email corporativo | ✅ | Google Workspace. Buzones: `info@` (principal, usado por la web), `proyectos@`, `ventas@`, `noreply@`. MX → `smtp.google.com` verificado |
| Autenticación de correo | ✅ | SPF · DKIM · DMARC los tres resueltos en DNS público (sesión 8). `p=quarantine` y `~all` a propósito. **Un solo TXT `v=spf1`**: al añadir emisor nuevo se edita, no se duplica |
| Analytics | ✅ | Vercel Web Analytics activadas en el dashboard (confirmado sesión 8). Script ya presente en las 9 páginas |

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
| RGPD (privacidad.html) | ✅ | Razón social y NIF **ocultos por decisión del usuario** hasta la exposición masiva. La frase se lee completa y veraz, sin placeholder |
| Camino de escritura | ✅ | Único: Edge Function `submit-lead` con `service_role`. `anon` no puede escribir en la tabla por ninguna vía |
| Rate limiting | ✅ | 5/hora y 15/día por IP. Contadores en `rate_limit` (RLS activo, cero políticas). IP guardada como HMAC-SHA256, nunca en claro |
| CSP | ✅ | Desplegada 2-ago-2026 en `vercel.json`. `script-src` mantiene `'unsafe-inline'` a propósito: el script de tema va inline en el `<head>` para evitar parpadeo. Verificada en las 9 páginas |
| Otras cabeceras | ✅ | `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS con `includeSubDomains` |
| Grants de `leads` | ✅ | `anon` y `authenticated` **sin ningún grant** y sin políticas. Antes tenían SELECT/UPDATE/DELETE/TRUNCATE con RLS como única barrera |
| Límites de entrada | ✅ | CHECK de longitud por columna + formato de email + nombre/email obligatorios en BD, `maxlength` espejo en los formularios y revalidación en la Edge Function |
| Honeypot formulario | ✅ | `_gotcha` validado **en servidor**. Un positivo responde 200 sin insertar, para no enseñarle al bot que fue detectado |
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

### Hito 1 — Fundamentos ✅ COMPLETADO (sesiones 3-7)

Email corporativo **autenticado**, FormSubmit, WhatsApp, landing de auditoría,
tarifas publicadas, dominio propio, Analytics activadas, limpieza de contenido
inventado y endurecimiento completo de seguridad.

**Cerrado sin restos (sesión 8). La infraestructura ya no es el cuello de
botella, y ya no queda ningún trabajo técnico que bloquee la captación.**

El cuello de botella pasa a ser, textualmente, lo que dice el reporte
estratégico de julio: **presencia y prueba**. La web está lista para recibir
tráfico que hoy no existe.

---

### Hito 1.5 (próximas 1-2 semanas) — Ver y aprovechar lo que entra
**Propósito:** cerrar el bucle entre lead captado y lead trabajado

- [ ] **Panel de lectura de leads**
  - Hoy hay que abrir Supabase para ver un contacto
  - Opción A: bastarse con el panel de Supabase (coste 0, fricción diaria)
  - Opción B: página protegida que lea con `service_role` desde una Edge
    Function autenticada
  - ⚠️ **`textContent`, nunca `innerHTML`**: `detalles` es texto del atacante

- [ ] **Aviso instantáneo de lead**
  - Hoy llega por FormSubmit; valorar push a WhatsApp o Slack
  - Un lead B2B respondido en <1 h convierte mucho más que a las 24 h

- [ ] **Medir el embudo por origen**
  - `leads.origen` ya distingue home / landing / blog
  - Con Analytics activo: visitas por página ÷ leads por origen = conversión real
  - Sirve para decidir dónde invertir, en vez de intuir

- [ ] **Case study real**
  - Entrevistar a un cliente actual: problema → solución → impacto medido
  - **Con permiso explícito por escrito.** Nada de cifras estimadas ni
    reconstruidas: es exactamente lo que se retiró en la sesión 3

**Tiempo estimado:** 4-6 h | **Impacto:** velocidad de respuesta y decisión con datos

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

- [ ] **Rendimiento** (pendiente desde la sesión 2, nunca abordado)
  - Font Awesome completo (~100 KB) para ~15 iconos → SVG inline
  - Google Fonts bloquea el render → self-host de Barlow y Saira Stencil One
  - Ambas son cargas de terceros: quitarlas **también simplifica la CSP**
  - Impacto directo en Core Web Vitals y por tanto en SEO

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
- [ ] Seleccionar 1-2 items del hito activo
- [ ] Ejecutar con commits pequeños y verificables
- [ ] Documentar decisiones
- [ ] **Verificar contra producción antes de marcar nada como hecho**

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

**Documento maestro:** `CLAUDE.md` (arquitectura, stack, modelo de seguridad)  
**Estado actual:** `PROJECT_STATE.md` (este archivo)  
**Edge Function:** `supabase/functions/submit-lead/index.ts` — **no se despliega con `git push`**  
**Web en vivo:** https://www.magindustries.es  
**Repo:** https://github.com/AntiSysteMa/mag-industries  
**Supabase:** proyecto `lryyubgldnrrxokkeeef`  
**Vercel:** equipo `magi-ndustries` · proyecto `mag-industries`  

---

---

## 🎯 Roadmap de sesiones siguientes (revisado 2-ago-2026, sesión 8)

> **Contrastado con los dos artefactos estratégicos:** «Reporte estratégico»
> (rev. A, 12-jul) y «Plan de operación 0→5k» (28-jul). Lo que sigue reordena el
> roadmap técnico según lo que esos documentos identifican como cuello de
> botella real — que **no es la web**.

**Lo que los artefactos daban por pendiente y ya está hecho:** dominio propio ·
email corporativo (fueron a Google Workspace en vez del Zoho Free que proponía
el plan: más caro, mejor decisión) · **SPF/DKIM/DMARC**, que el plan marcaba
como «configura esto o tus emails van a spam» · FormSubmit activado · WhatsApp ·
Analytics · retirada de cifras y testimonios inventados (D-01, D-02) ·
publicación de plazos y tarifas (A-03, A-05).

**Lo que los artefactos piden y sigue sin existir** — y es dónde está ahora el
retorno:

| Origen | Hueco | Estado |
|---|---|---|
| D-04 · OP-050 | LinkedIn + Google Business Profile | 🔶 Creados (sesión 9), sin personalizar; footer a la espera de las URL |
| Embudo etapa 4 | Agenda para la auditoría gratuita | 🔶 Construida (sesión 9), oculta hasta tener la URL del calendario |
| OP-030 | Lead magnet descargable (checklist PDF) | ❌ |
| OP-030 | Calculadora de coste de máquina parada | ✅ Sesión 9 |
| OP-030 | El resultado del quiz VIP no llega a ningún sitio | ✅ Sesión 9 |
| OP-030 · D-03 | Clips reales de simulación | ⏳ `docs/clips-spec.md` escrito, sin producir |
| Stack | CRM (HubSpot Free) | ❌ |
| C-03 · C-05 | Plantilla NDA · seguro RC profesional | ❌ Fuera del repo, pero la web ya los promete |
| §02 del plan | Alta censal / RETA | ❌ Techo del negocio, no del código |

---

**Prioridad 0: Presencia y captura (semana 1)**

0.1 ✅ **Prueba de entrega de correo** — SPF/DKIM/DMARC pass (sesión 9).

0.2 ✅ **El quiz captura al VIP** — formulario de dos campos en el propio
    resultado + diagnóstico adjunto al formulario grande (sesión 9).

0.3 ✅ **Calculadora de coste de máquina parada** en la home (sesión 9).

0.4 🔶 **Agenda de la auditoría** — construida y desplegada, oculta hasta
    recibir la URL del horario de citas de Google Calendar.

0.5 🔶 **Perfiles sociales** — creados; pendientes de personalizar y de que sus
    URL lleguen al footer.

**Guía para crear el horario de citas** (Google Calendar, cuenta de Workspace):
Crear → *Horario de citas* · duración 45 min · franjas de disponibilidad reales ·
tiempo de margen entre citas · añadir preguntas al reservar (empresa, teléfono,
qué pieza) para que el hueco llegue ya cualificado · **activar Google Meet** para
que la invitación lleve el enlace de videollamada. Luego *Compartir* y copiar las
**dos** URL: la larga de incrustar (`…/appointments/schedules/…?gv=true`) y la
corta (`https://calendar.app.google/…`).

⚠️ **Antes de cualquier campaña de correo en frío:** el dominio acaba de empezar
a autenticarse y **no tiene reputación**. Enviar volumen de golpe desde
`magindustries.es` quema justo lo que se acaba de construir. Calentar despacio
(5-10 correos/día las primeras semanas, subiendo gradual), y si algún día hay
envíos masivos o newsletter, hacerlos desde un **subdominio** (`mail.` o
`news.magindustries.es`) para que un problema de reputación no arrastre al
correo con el que se habla con los clientes.

---

**Prioridad 1: Visibilidad de leads (semana 1-2)**

1. **Panel de lectura de leads** (4-6h)
   - Opción A: Edge Function protegida que lee de `leads` con `service_role`
   - Opción B: Satisfacerse con panel de Supabase (coste 0, fricción diaria)
   - ⚠️ Usar `textContent`, nunca `innerHTML` — `detalles` es texto del atacante
   - Incluir: fecha, origen, nombre, empresa, email, resumen de `detalles`

2. **Aviso instantáneo de lead** (2-3h)
   - Hoy: aviso por FormSubmit (24h después)
   - Mejorar: push a WhatsApp o Slack (<1 min)
   - Un lead B2B respondido en <1h convierte 3x más

3. **Embudo de conversión** (1-2h)
   - Analytics ya da: visitas por página + fecha
   - Cruzar: visitas de `index.html` / leads de home → conversión %
   - Repetir para cada origen → decidir dónde invertir

**Prioridad 2: Rendimiento (semana 3-4) — impacta SEO directo**

4. **Font Awesome → SVG inline** (3-4h)
   - Full consume ~100 KB para ~15 iconos
   - Identificar los 15, convertirlos a SVG inline en `app.js`
   - Gain: -100 KB de CDN, CSP más simple

5. **Google Fonts → self-host** (2-3h)
   - Barlow + Saira Stencil One descargados localmente
   - Referencia desde `/assets/fonts/` en lugar de `fonts.googleapis.com`
   - Gain: no render-blocking, -1 CDN del CSP

6. **Lazy load de secciones bajo pliegue** (4-5h)
   - `sectores.html` carga 15 imágenes Unsplash en paralelo
   - Lazy load hasta intersection
   - Resultado: mejora FCP + LCP

**Prioridad 3: Autoridad (semana 5-8) — genera leads orgánicos**

6.5 **Portfolio de casos de transformación digital** (pedido por el usuario, sesión 11)
   - Casos de implantación en **distintos comercios**, no solo industria: es la
     prueba que sostiene el área nueva de `capacidades.html`
   - Hoy esa capacidad se ofrece **sin nada que enseñar**. Es el mismo hueco que
     D-01/D-02 señalaban para el mecanizado, y se resolvió retirando lo que no
     era demostrable — aquí toca resolverlo al revés: documentando lo que sí
   - **Con permiso escrito y sin cifras reconstruidas.** Aplica la regla de la
     sesión 3 sin excepción: nada inventado, nada estimado a posteriori
   - Formato sugerido: problema → qué se automatizó → qué cambió de medible
     (horas ahorradas, errores evitados, tiempo de respuesta)
   - Ubicación por decidir: sección propia en `capacidades.html`, página nueva
     o entradas de blog

7. **Case study real con permiso** (4-5h)
   - Entrevistar cliente actual (técnica + impacto medido)
   - **Exigir permiso escrito** — no cifras estimadas
   - Documentar: problema → solución (paso a paso) → resultado (% mejora)
   - Subir a sección nueva o blog

8. **LinkedIn strategy** (1-2h planning + 8-10h ejecución)
   - 1 post/semana: tip técnico + case study + reflexión
   - Segmentación: gerentes de producción, 20-200 empleados
   - Presupuesto sugerido: €300-500/mes en ads

9. **SEO: 5 artículos blog** (20-24h)
   - Ya hay 2 (`blog-trocoidal-acero-herramienta.html`, `blog-plantilla-o-externalizar.html`)
   - Faltan 3: «productividad CNC», «checklist auditoría», «reducción de tiempos de ciclo»
   - Backlinks: cámaras de industria, asociaciones técnicas

**Prioridad 4: Escala (mes 2-3)**

10. **Dashboard de KPIs** (2-3h)
    - Looker Studio (free): leads → conversión → MRR
    - Métricas: CAC, LTV, payback
    - Actualización semanal

11. **SOP formal** (6-8h)
    - Auditoría: checklist + template reporte
    - Propuesta: template + hoja de términos
    - Entrega: hitos, feedback loop

12. **Subcontratista identificado** (ongoing)
    - Programador CNC freelance (Portugal/México opción)
    - Para picos de demanda

---

**Resumen estado (3-ago-2026, tras sesión 9):**
✅ **Fundamentos — cerrados.** Dominio · correo autenticado y **entrega confirmada** · seguridad · Analytics · FormSubmit · WhatsApp  
✅ **Captura — cerrada por el lado del código.** Quiz que captura · agenda construida · calculadora · footer preparado  
🔶 **Dos datos del usuario** desbloquean lo que queda: URL del calendario y URL de los perfiles sociales  
❌ **Presencia — pendiente de personalizar** los perfiles ya creados  
⏳ Visibilidad (panel de leads, avisos instantáneos)  
⏳ Rendimiento (Font Awesome, Fonts, lazy load)  
⏳ Autoridad (case study, clips de simulación, blog) — **el usuario pidió expresamente no abordar clips ni guiones hasta que él lo pida**

**La frase que resume la sesión 9:** ya no queda trabajo de código que bloquee la
captación. La web recoge todo lo que entra —quiz, formulario, agenda, WhatsApp—
y el correo con el que se responde ya no cae en spam. Lo que falta para que
esto produzca leads no se escribe en un editor: es publicar y prospectar.
