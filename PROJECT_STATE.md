# PROJECT_STATE — MAG INDUSTRIES

**Última sesión:** 15 julio 2026 (Sesión 2)  
**Estado:** En producción, bugs críticos resueltos, simulación Canvas live  
**Siguiente sesión esperada:** Tracción de leads + email corporativo

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
