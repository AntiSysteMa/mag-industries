# MAG INDUSTRIES — Contexto de Proyecto

**Última actualización:** 15 julio 2026 | **Sesiones:** 2

---

## 📌 Visión

**MAG INDUSTRIES** es una consultoría B2B de ingeniería CAD/CAM/CNC especializada en:
- Programación CNC externa (Heidenhain, Fanuc, Siemens)
- Optimización de procesos de mecanizado
- Auditorías técnicas de talleres D2/CNC
- Simulación en gemelo digital (BobCAD-CAM)
- Verticales: aeronáutica, automoción, defensa, médico, matricería

**Modelo:** SaaS consulting + project-based. Ticket medio: €5-20k. Margen: 70-85%.

---

## 🏗️ Stack tecnológico

### Frontend (Producción)
- **HTML5** — estructura semántica
- **Tailwind CSS** — framework de utilidades (compilado a estático, ~29 KB)
- **Vanilla JavaScript** — `app.js`, sin frameworks
- **Canvas 2D** — simulación isométrica de mecanizado (hero panel)
- **SVG** — iconos inline (sustituye Font Awesome completo)
- **GSAP 3.12.5** — ScrollTrigger, MotionPathPlugin (fallback opcional con IntersectionObserver)
- **Supabase JS SDK 2.x** — persistencia de leads (CRM mínimo)
- **Web Analytics** — Vercel Analytics (en pipeline)

### Backend
- **Supabase** — PostgreSQL + RLS + Auth  
  - Proyecto: `bisioblvzoegaqokamel.supabase.co`  
  - Tabla: `leads` (nombre, email, empresa, teléfono, detalles, inactividad)  
  - Clave publicable: `sb_publishable_7__8eQRRx5RD09DRgnZQBw_Trn7Fqde`
- **FormSubmit.co** — envío de emails (chapy9716@gmail.com) — PENDIENTE: activación por usuario

### DevOps & Deploy
- **Vercel** — hosting (mag-industries.vercel.app)
  - Equipo: `magi-ndustries`  
  - Proyecto: `mag-industries`  
  - Buildcmd: `npm run build`  
  - Output: `public/`
- **GitHub** — repo (AntiSysteMa/mag-industries, rama main)
  - Git integration con Vercel ACTIVA
  - Cada push a main → deploy automático (~2 min)
- **Node.js LTS** — local en `C:\Program Files\nodejs`
  - NO está en PATH; prefixar comandos con `$env:Path = "C:\Program Files\nodejs;" + $env:Path`
- **npm** — package management
  - Scripts: `build` (tailwind + copy-static)

### Herramientas de desarrollo
- **Tailwind CLI** — compilación de CSS (`tailwind.css` → ~29 KB minificado)
- **Scripts Node** — `scripts/add-srcset.js` (inyecta srcset a imágenes Unsplash)
- **Git + Git Credential Manager** — autenticación guardada en Windows

---

## 📂 Arquitectura de ficheros

**Arquitectura de páginas (multipágina desde jul-2026).** La home tenía 11 secciones
y resultaba densa; el contenido se reparte ahora en páginas temáticas:

| Página | Rol | Contenido |
|---|---|---|
| `index.html` | Conversión | 9 capas: hero → cómo empezamos (3 pasos) → evidencia técnica → servicios → quiz → compromisos → referencias → FAQ → contacto |
| `auditoria-gratuita.html` | Landing de captación | Una sola acción. Cabecera sin navegación. Formulario `#contact-form` con `data-origen`. Sin GSAP (velocidad) |
| `servicios.html` | Página de dinero | Tarifas por pieza e igualas mensuales |
| `capacidades.html` | Autoridad técnica | Fresado, torneado, EDM, hilo, láser (con animaciones SVG) |
| `sectores.html` | SEO / cualificación | 9 tarjetas de sector con imágenes |
| `privacidad.html` | Legal | RGPD |

Navegación unificada en las 5 páginas públicas: Cómo trabajamos · Capacidades ·
Sectores · Tarifas · FAQ + CTA «Auditoría gratuita».

```
mag-industries/
├── CLAUDE.md                      ← Este archivo (obligatorio)
├── PROJECT_STATE.md               ← Estado actual (sesión-a-sesión)
├── docs/clips-spec.md             ← Especificación de los micro-clips de evidencia
├── index.html                     ← Home (9 capas)
├── auditoria-gratuita.html        ← Landing de conversión
├── servicios.html                 ← Tarifas e igualas
├── capacidades.html               ← Escaparate técnico
├── sectores.html                  ← Sectores industriales
├── input.css                      ← @tailwind + custom CSS
├── tailwind.config.js             ← tema extendido (colores RGB, fuentes)
├── app.js                         ← JS vanilla + simulación Canvas (v4)
├── package.json                   ← dependencias (GSAP, Tailwind)
├── vercel.json                    ← config deploy (buildCmd, outputDir)
├── public/                        ← carpeta de salida (gitignored)
│   ├── index.html
│   ├── tailwind.css               ← compilado
│   ├── app.js
│   └── assets/
│       ├── logo-oscuro.png
│       ├── logo-claro.png
│       └── og-image.png
├── assets/                        ← fuente (git)
│   ├── logo-oscuro.png
│   ├── logo-claro.png
│   └── (sin og-image en git)
├── scripts/
│   ├── add-srcset.js              ← inyector de srcset (ya ejecutado)
│   └── copy-static.js             ← copia index.html + app.js + assets
├── source-assets/                 ← NO en git
│   ├── MAG_OSCURO_LOGO.png
│   └── MAG_CLARO_LOGO.png
└── .git/
    └── (GitHub: AntiSysteMa/mag-industries)
```

---

## ⚡ Comandos clave

### Desarrollo local (NO RECOMENDADO — respeta [[cuidado-sistema-usuario]])
```bash
# En PowerShell o Git Bash
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\chapy\Documents\ClaudeCode\mag-industries

# Compilar CSS + copiar assets
npm run build

# Verificar sintaxis JS sin ejecutar
node --check app.js

# Git workflow
git status
git add [archivo]
git commit -m "tipo(scope): mensaje"
git push origin main
```

### Verificación remota (curl, sin navegador)
```bash
# Verificar que Vercel sirve app.js
curl -s https://mag-industries.vercel.app/app.js | head -20

# Verificar que index.html tiene el canvas
curl -s https://mag-industries.vercel.app/ | grep -c "sim-canvas"
```

### Cache busting
Modificar versión en `index.html`:
```html
<script src="app.js?v=4" defer></script>  <!-- incrementar v -->
```

---

## 🎯 Estado actual (sesión 2, 15-jul-2026)

### ✅ Completado
1. **Bug JS crítico resuelto** (commit bd0351d)
   - Error: `Uncaught SyntaxError: Identifier 'supabase' has already been declared`
   - Causa: colisión entre global de SDK UMD y `let supabase` del script
   - Fix: renombrada a `supabaseClient` con try/catch robusto
   - Resultado: toggle, quiz, formularios y raster vuelven a funcionar

2. **Simulación Canvas 2D** (commit 34bd64a)
   - Sustituye SVG estático por motor Canvas con:
     - Proyección isométrica de cajera + 2 islas
     - Planificación de velocidad tipo CNC (desaceleración en curvas)
     - Rastro incandescente dinámico (3 capas con glow)
     - Virutas metálicas despedidas en dirección opuesta
     - Micro-vibración + banda de brillo de giro a RPM
     - HUD X/Y/Z alimentado por posición real
     - Oclusión y recorte (evenodd)
     - Fondo pre-renderizado, RAF pausado fuera de pantalla, DPR ≤2
   - Geometría verificada: 1104 muestras, 1379 u de trayectoria, 28.2 s de corte
   - Colisiones: 0 con islas (holgura mín 3 u)

3. **Infraestructura de deploy**
   - Git + Vercel integration activa
   - Build automático en cada push
   - Cada cambio despliega en ~2 min
   - Node.js LTS configurado

### ⚠️ En progreso
1. **Captura de leads → Supabase**
   - Formulario conectado a FormSubmit (email) + Supabase (DB)
   - Con try/catch: sigue funcionando si Supabase falla
   - PENDIENTE: activar en FormSubmit.co (usuario debe confirmar email)

2. **Email corporativo**
   - PENDIENTE: crear proyectos@magindustries.com (o similar)
   - Reemplazar chapy9716@gmail.com en formularios + privacidad.html

### 🔴 Bloqueado
1. **Analytics**
   - Script Vercel Web Analytics en `<head>`
   - PENDIENTE: activar en dashboard Vercel

2. **Privacidad.html**
   - Plantilla RGPD creada
   - PENDIENTE: rellenar [RAZÓN SOCIAL—NIF]

3. **Rendimiento (web lenta)**
   - Causas identificadas: scroll-snap + parallax scrub + Font Awesome full + Google Fonts blocking
   - Pendientes:
     - Quitar/reducir parallax scrub
     - Reemplazar Font Awesome (15 iconos) por SVG inline
     - Self-host de Barlow + Saira Stencil One
     - Lazy load de secciones bajo pliegue

---

## 🚀 Hitos activos

### Hito 1: Captura & Conversión (semana 1-2)
- [ ] Email corporativo + firma
- [ ] Activar FormSubmit
- [ ] Dashboard CRM en Notion/Airtable (lead source → conversion)
- [ ] Case study real + testimonial
- [ ] Landing "Auditoría gratis 30 min"

### Hito 2: Tracción digital (semana 3-8)
- [ ] LinkedIn strategy (posts + ads)
- [ ] SEO: 5 artículos de blog
- [ ] Prospecting list (50 leads/mes)
- [ ] Subpáginas: servicios + pricing + proceso

### Hito 3: Escala operativa (semana 9-16)
- [ ] SOP (auditoría, propuesta, entrega)
- [ ] Subcontratista identificado
- [ ] Dashboard financiero (CAC, LTV, MRR)
- [ ] 10-15 clientes año 1

---

## 🔑 Decisiones arquitectónicas

1. **Canvas 2D vs SVG animado**  
   - SVG estático = rendimiento x, interactividad 0  
   - Canvas 2D = mejor control, 60 fps, sin deps nuevas  
   → Canvas ganador para simulación

2. **Supabase + FormSubmit paralelo**  
   - Redundancia: si Supabase cae, email sigue funcionando  
   - Try/catch en ambos → graceful degradation  
   → Robustez > una fuente única

3. **Git + Vercel vs deploy monolítico**  
   - Cambios de 10 KB = 1 commit, deploy en 2 min  
   - Antes: pegar 135 KB via MCP = lentísimo y caro en tokens  
   → Git integration = workflow x100

4. **CSS compilado vs CDN + JIT**  
   - Tailwind CDN JIT = ~50 KB, bloqueante  
   - CSS compilado = ~29 KB, no bloqueante  
   → Rendimiento + previsibilidad

5. **Vanilla JS vs framework**  
   - React/Vue = overkill para sitio marketing  
   - Vanilla + GSAP = control total, 0 cruft, caché-friendly  
   → Simplicidad

---

## 📝 Reglas de oro

1. **Nunca declarar `let/const supabase` en top-level**  
   → Choca con global del SDK UMD → SyntaxError abortador

2. **Siempre try/catch alrededor de dependencias CDN**  
   → GSAP, Supabase, cualquier tercero

3. **Cache busting con `?v=N`**  
   → Incrementar N cada deploy importante

4. **Verificar en producción por curl**  
   → No abrir navegador de preview (afecta WiFi)

5. **Commits pequeños y atómicos**  
   → 1 cambio = 1 commit, mensaje descriptivo

6. **Git workflow**  
   - Branch main = producción (protegida)
   - Cada push = deploy automático
   - Sin merge requests, todo directo (solo tú)

---

## 🎓 Contexto completo para Claude

Eres un experto en startup SaaS consulting. Conoces:
- Que este proyecto es **real, en producción, con ingresos esperados**
- Que el usuario es técnico (MBA + dev) y quiere **escalabilidad desde el inicio**
- Que hay sensibilidad con el WiFi/red (nunca abrir preview ni servidores locales)
- Que la prioridad es **tracción de leads** (antes que perfección técnica)
- Que hay una memoria persistente (`memory/`) que debes leer y actualizar
- Que el `PROJECT_STATE.md` se actualiza **al final de cada sesión**

**Al iniciar**: lee este archivo + PROJECT_STATE.md. Usa memoria existente. Propón cambios que Sean:
1. Rápidos de implementar (<4h sesión)
2. Impacto inmediato (métricas: CAC, conversión, SEO)
3. Sin refactoring innecesario

**Al cerrar**: actualiza PROJECT_STATE.md con lo logrado, siguientes pasos, decisiones.

---

## 📞 Contacto & Recursos

- **Web**: https://mag-industries.vercel.app
- **Repo**: https://github.com/AntiSysteMa/mag-industries
- **Supabase**: https://app.supabase.com (proyecto: bisioblvzoegaqokamel)
- **Vercel**: https://vercel.com/antisystema/mag-industries
- **Email**: chapy9716@gmail.com (PENDIENTE: corporativo)
- **User Vercel**: antisytema | **Team**: magi-ndustries

---

**Siguiente lectura obligatoria:** `PROJECT_STATE.md`
