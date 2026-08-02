# MAG INDUSTRIES — Contexto de Proyecto

**Última actualización:** 2 agosto 2026 | **Sesiones:** 7

> Este archivo describe **cómo es el proyecto**. El estado sesión-a-sesión vive
> en `PROJECT_STATE.md`. Lee los dos antes de tocar nada.
>
> **Regla que nació de un error real:** no marques nada como hecho en estos
> documentos sin haberlo verificado contra producción. Durante cuatro sesiones
> este archivo afirmó que había una CSP estricta; no existía ninguna. Creer que
> estás protegido es peor que saber que no lo estás.

---

## 📌 Visión

**MAG INDUSTRIES** es una consultoría B2B de ingeniería CAD/CAM/CNC:
- Programación CNC externa (Heidenhain TNC, Fanuc 0i/30i, Siemens 840D)
- Optimización de procesos de mecanizado
- Auditorías técnicas de talleres
- Simulación en gemelo digital
- Verticales: aeronáutica, automoción, defensa, médico, matricería

**Posicionamiento:** «No vendemos antigüedad. Vendemos compromisos.» Fundador
único con 7 años de ingeniería CAD/CAM. **Nada de cifras, testimonios ni casos
inventados** — en la sesión 3 se retiró una tanda entera de contenido falso que
estaba en producción. No lo reintroduzcas bajo ninguna forma.

**Modelo:** consultoría + proyectos. Ticket medio: 5-20 k€.

---

## 🌐 Infraestructura (verificada 2-ago-2026)

| Recurso | Valor |
|---|---|
| Dominio | `magindustries.es` (DonDominio, 4,95 €/año). Canónica: `https://www.magindustries.es` |
| DNS | Gestionado **en DonDominio**, no en Vercel |
| Hosting | Vercel · equipo `magi-ndustries` · proyecto `mag-industries` |
| Repo | `github.com/AntiSysteMa/mag-industries`, rama `main` |
| Supabase | `lryyubgldnrrxokkeeef` · «supabase-aero-bell» · eu-central-2 |
| Clave publicable | `sb_publishable_LnAfjL6RQRdoPnOw5ZSEkA_jlCcbNBZ` |
| Correo | Google Workspace. MX → `smtp.google.com` |
| Buzones | `info@` (el que usa la web), `proyectos@`, `ventas@`, `noreply@` |
| Node.js | LTS en `C:\Program Files\nodejs` — **no está en PATH** |

⚠️ **`bisioblvzoegaqokamel` no existe** (devuelve NXDOMAIN). Fue el ref erróneo
que arrastró el código desde el principio. Si reaparece en algún sitio, es un
error: no lo restaures.

⚠️ **`vdlnqgudysfzbysvztdp`** («Love-moon») es otra app del usuario en la misma
cuenta de Supabase. No tocar.

⚠️ **`magindustries.com`** está en manos de un especulador. No perseguirlo, y
no publicar direcciones `@magindustries.com`: no son nuestras.

⚠️ Al tocar DNS de correo: borrar antes los MX de DonDominio y **editar** el TXT
SPF existente en vez de añadir un segundo — dos SPF invalidan ambos.

---

## 🏗️ Stack

**Frontend:** HTML5 · Tailwind compilado a estático (~29 KB, no CDN) · JavaScript
vanilla sin frameworks · Canvas 2D para la simulación de mecanizado del hero ·
SVG inline · GSAP 3.12.5 desde cdnjs (ScrollTrigger, MotionPathPlugin) con
degradación a IntersectionObserver.

**Backend:** Supabase (PostgreSQL + RLS + Edge Functions) y FormSubmit.co para el
aviso por email. Los dos caminos son **independientes a propósito**: si uno cae,
el lead no se pierde.

**Deploy:** cada push a `main` dispara build en Vercel (~2 min).

---

## 🔐 Modelo de seguridad

Esto se endureció entero en la sesión 7. Antes de cambiar cualquier pieza,
entiende por qué está así.

### Base de datos

| Objeto | Configuración |
|---|---|
| `public.leads` | RLS activo y **cero políticas**. `anon` y `authenticated` **sin ningún GRANT**. Inaccesible salvo para `service_role` |
| `public.rate_limit` | Igual: RLS activo, cero políticas, sin grants. Guarda `HMAC(ip):ventana`, `hits`, `expires_at` |
| `public.bump_rate(text, interval)` | `security definer`. Incremento atómico + purga perezosa. `revoke` a `public`/`anon`/`authenticated` |

`leads` tiene CHECK de longitud en las 8 columnas, formato de email y
`nombre`/`email` obligatorios. **Si cambias esos límites, actualiza también la
constante `LIMITES` de la Edge Function**: son espejo el uno del otro.

### Camino de escritura

El navegador **no escribe en la tabla**. Envía a la Edge Function `submit-lead`
(`verify_jwt: false`, porque es un endpoint público de formulario), que valida en
este orden y solo entonces inserta con `service_role`:

1. Lista blanca de origen (`magindustries.es` y `www.`)
2. Tamaño del cuerpo, antes de parsear (16 KB)
3. Honeypot `_gotcha` → responde **200 sin insertar**, para que el bot no
   deduzca que ha sido detectado y reintente variando
4. Longitudes y formato de email
5. Rate limiting por IP: 5/hora y 15/día

Si el contador de rate limit falla, **se registra y se continúa**: perder un lead
real es peor que aceptar uno de más. Un 429 tampoco pierde el contacto, porque
FormSubmit va por su cuenta.

El código vive en `supabase/functions/submit-lead/index.ts` y está versionado en
el repo. Desplegarlo NO es automático con el push: hay que redeplegarlo aparte.

### Cabeceras

Definidas en `vercel.json` para `/(.*)`: CSP, `X-Frame-Options: DENY`,
`nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS con
`includeSubDomains`.

La CSP acota `script-src` a `'self'` + cdnjs, pero conserva `'unsafe-inline'`
porque el script de tema debe correr antes del pintado para evitar parpadeo y
Vercel estático no permite nonces por petición. **Si añades un origen externo
nuevo (una fuente, un pixel, un CDN), tienes que añadirlo a la CSP o se
bloqueará en silencio.**

### Privacidad

- La IP nunca se guarda en claro: solo su HMAC-SHA256, con la `service_role`
  como clave, que no sale del servidor.
- `leads` no se puede leer con la clave publicable. Para consultarla: panel de
  Supabase o `service_role`.
- La política de privacidad promete borrado a los dos años. **Hoy es manual y
  deliberadamente manual** (decisión del usuario, volumen bajo). No automatices
  eso ni reescribas esa promesa sin pedírselo.
- `privacidad.html` no publica razón social ni NIF por decisión del usuario
  hasta que toque exponerse. **No reintroduzcas un placeholder visible** del
  tipo `[RAZÓN SOCIAL — NIF]`: la frase debe leerse completa y veraz.

---

## 📂 Arquitectura de ficheros

Multipágina desde jul-2026: la home tenía 11 capas y resultaba densa, así que el
contenido se repartió en páginas temáticas.

| Página | Rol |
|---|---|
| `index.html` | Conversión. 9 capas: hero → cómo empezamos → evidencia → servicios → quiz → compromisos → referencias → FAQ → contacto |
| `auditoria-gratuita.html` | Landing de captación. Una sola acción, cabecera **sin navegación** (sin rutas de escape), sin GSAP a propósito (velocidad) |
| `servicios.html` | Tarifas por pieza e igualas mensuales |
| `capacidades.html` | Autoridad técnica: fresado, torneado, EDM, hilo, láser |
| `sectores.html` | SEO y cualificación. 9 tarjetas de sector |
| `blog.html` + 2 artículos | SEO de fondo |
| `privacidad.html` | Legal · RGPD |

```
mag-industries/
├── CLAUDE.md                       ← este archivo
├── PROJECT_STATE.md                ← estado sesión-a-sesión
├── docs/clips-spec.md              ← spec de los micro-clips de evidencia
├── index.html · auditoria-gratuita.html · servicios.html
├── capacidades.html · sectores.html · privacidad.html
├── blog.html · blog-trocoidal-acero-herramienta.html
├── blog-plantilla-o-externalizar.html
├── input.css                       ← @tailwind + CSS propio
├── tailwind.config.js
├── app.js                          ← JS vanilla + Canvas 2D
├── vercel.json                     ← build + cabeceras de seguridad
├── supabase/functions/submit-lead/
│   └── index.ts                    ← Edge Function de recepción de leads
├── scripts/copy-static.js          ← copia html + app.js + assets a public/
├── public/                         ← salida de build (gitignored)
└── assets/                         ← logos (en git)
```

---

## ⚡ Comandos

```bash
# PowerShell o Git Bash. Node no está en PATH:
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\chapy\Documents\ClaudeCode\mag-industries

npm run build          # tailwind + copy-static
node --check app.js    # sintaxis sin ejecutar

git add [archivo] && git commit -m "tipo(scope): mensaje" && git push origin main
```

Verificación remota sin abrir navegador:

```bash
curl -sI https://www.magindustries.es/ | grep -i content-security-policy
```

**Cache busting:** `app.js?v=N` en las 8 páginas que lo cargan. Incrementa N en
todas a la vez tras un cambio importante de `app.js`. Va por **v=11**.

---

## 📝 Reglas de oro

1. **Nunca `let/const supabase` en top-level.** Choca con el global del SDK UMD
   y aborta el script entero (bug de la sesión 1).
2. **Try/catch alrededor de toda dependencia de CDN.** GSAP, cualquier tercero.
3. **Todo bloque de `app.js` comprueba que sus elementos existan.** El mismo
   archivo se carga en 8 páginas con secciones distintas; un `getElementById`
   que devuelva `null` sin guardar aborta el script completo.
4. **Nunca vuelvas a dar GRANT sobre `leads` a `anon` o `authenticated`.** El
   único camino de escritura es la Edge Function.
5. **Nunca vuelques datos de un lead con `innerHTML`.** `detalles`, `nombre` y
   `empresa` son texto controlado por quien envía el formulario. Cuando se
   construya el panel de lectura, `textContent` siempre.
6. **Verifica en producción, no en local.** Con `curl` para cabeceras y
   contenido; el navegador solo cuando haga falta comprobar algo que `curl` no
   ve (violaciones de CSP, ejecución de JS). Nada de servidores locales en
   segundo plano.
7. **Commits pequeños y atómicos.** Un cambio, un commit, mensaje que explique
   el *porqué*.
8. **`main` es producción.** Cada push despliega.

---

## 🎓 Cómo trabajar en este proyecto

El usuario es técnico (MBA + dev), el proyecto es **real y en producción**, y la
prioridad es **tracción de leads** antes que perfección técnica. Hay sensibilidad
con la red del sistema: no levantes servidores locales ni los dejes corriendo.

**Al iniciar:** lee este archivo y `PROJECT_STATE.md`. Revisa la memoria
persistente en `~/.claude/projects/.../memory/`.

**Al proponer:** rápido de implementar, impacto medible (conversión, CAC, SEO),
sin refactorizaciones que nadie ha pedido.

**Al cerrar:** actualiza `PROJECT_STATE.md` con lo logrado, lo decidido y lo que
queda abierto. Si has cambiado infraestructura o seguridad, actualiza también
este archivo.

---

## 📞 Recursos

- **Web:** https://www.magindustries.es
- **Repo:** https://github.com/AntiSysteMa/mag-industries
- **Vercel:** https://vercel.com/magi-ndustries/mag-industries
- **Supabase:** https://app.supabase.com → proyecto `lryyubgldnrrxokkeeef`
- **Correo:** info@magindustries.es

**Siguiente lectura obligatoria:** `PROJECT_STATE.md`
