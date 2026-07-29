# Especificación de micro-clips de evidencia técnica

Documento interno de producción. Los tres clips sustituyen a las animaciones SVG
provisionales de la sección **Evidencia** (capa 03 de `index.html`).

Objetivo: que un jefe de producción escéptico vea en tres segundos que quien
programa sabe lo que hace. No son vídeos de marketing — son pruebas técnicas.

---

## 1. Formato de entrega

**Usa MP4, no GIF.** Un GIF de 3 s a 960 px pesa entre 3 y 8 MB y se ve peor;
el mismo clip en H.264 pesa 300–500 KB. En una página que quieres que cargue
rápido, esa diferencia se nota, y son tres clips.

| Parámetro | Valor |
|---|---|
| Contenedor | MP4 (H.264) + WebM (VP9) como alternativa |
| Resolución | 960 × 540 (16:9) |
| Duración | 3,0 s exactos, en bucle continuo |
| Fotogramas | 30 fps |
| Peso objetivo | **< 500 KB** por clip (MP4) |
| Audio | Ninguno — pista eliminada, no silenciada |
| Póster | JPEG o WebP del primer fotograma, < 40 KB |
| Ubicación | `assets/clips/` |

Nombres de archivo:

```
assets/clips/01-hsm.mp4      01-hsm.webm      01-hsm.jpg
assets/clips/02-trocoidal.mp4  02-trocoidal.webm  02-trocoidal.jpg
assets/clips/03-cinco-ejes.mp4 03-cinco-ejes.webm 03-cinco-ejes.jpg
```

---

## 2. Reglas comunes de grabación

Aplican a los tres. Saltarse alguna arruina el bucle o la credibilidad.

- **Cámara completamente fija.** Nada de orbitar ni hacer zoom: un bucle solo
  funciona si el primer y el último fotograma coinciden. Si la cámara se mueve,
  el salto al reiniciar se ve y queda amateur.
- **Sin interfaz.** Oculta árbol de operaciones, cintas y paneles. Solo pieza,
  herramienta y trayectoria. En Fusion 360, F11 y colapsar el navegador.
- **Fondo oscuro.** Ajusta el entorno a un gris muy oscuro o negro plano, para
  que el clip case con el panel (`#041A25`). Evita el degradado azul por defecto.
- **Trayectoria en verde.** Deja el color de trayectoria lo más cerca posible del
  verde de marca `#12F7A0`. Es lo que ata el clip a la identidad.
- **Velocidad de simulación constante.** Si aceleras a mitad, el bucle cojea.
- **Elige un tramo repetitivo.** Graba 10–15 s de una zona donde el movimiento se
  repita y recorta después los 3 s que empalmen mejor.
- **Nada de cifras inventadas en pantalla.** Si sobreimpresionas un tiempo de
  ciclo, que sea el real de esa simulación.

Herramienta de captura: OBS Studio (gratis) grabando la ventana de Fusion 360.
Alternativa rápida en Windows: `Win + G`. Graba siempre a resolución nativa y
reduce a 960 px en el encodeado, nunca al revés.

---

## 3. Clip 01 · Desbaste HSM con carga de viruta constante

**Qué debe verse:** un vaciado adaptativo (*adaptive clearing*) en una cajera
rectangular. La fresa entra en rampa y va describiendo pasadas paralelas al
contorno, manteniendo el mismo ángulo de compromiso en todo el recorrido.

- Vista: isométrica ligeramente cenital, la cajera ocupando el 70 % del encuadre.
- Pieza: bloque de acero de herramienta, cajera con al menos una isla interior
  para que se aprecie cómo la trayectoria la rodea sin romper la continuidad.
- Lo que tiene que quedar claro: **el offset entre pasadas es siempre el mismo**.
  Ese es el argumento del texto que acompaña al clip.
- Momento a capturar: el desbaste ya en marcha, no la entrada inicial.
- Sobreimpresión opcional: `ae 12 % · ap 25 mm · D10 Z4`.

## 4. Clip 02 · Trocoidal agresivo en acero de herramienta / titanio

**Qué debe verse:** ranurado trocoidal avanzando por una ranura estrecha. Los
bucles circulares deben leerse con claridad, uno detrás de otro.

- Vista: cenital pura, la ranura en horizontal cruzando el encuadre.
- Pieza: D2, H13 o Ti-6Al-4V. Indica el material en la sobreimpresión: es lo que
  convierte el clip en una prueba de que trabajas materiales duros.
- Lo que tiene que quedar claro: **poca inmersión radial, mucha profundidad
  axial**. Se ve en que los bucles son anchos y la herramienta apenas muerde.
- Momento a capturar: el avance en régimen, con la ranura ya iniciada.
- El bucle sale muy limpio aquí: recorta entre dos bucles equivalentes.
- Sobreimpresión opcional: `D2 templado · ae 8 % · ap 30 mm`.

## 5. Clip 03 · Cinco ejes continuos evitando colisiones

**Qué debe verse:** simulación de máquina completa —mesa, basculante y cabezal—
mecanizando una superficie curva, con la cabeza inclinándose de forma continua.

- Vista: la cinemática de máquina, **no solo la herramienta**. Este es el punto:
  el riesgo en 5 ejes está en el portaherramientas, el cabezal y las bridas, y
  eso solo se ve si aparece la máquina entera.
- Debe verse el indicador de verificación sin colisiones si el software lo
  muestra en pantalla.
- Lo que tiene que quedar claro: **el vector de herramienta cambia de forma
  progresiva**, sin tirones bruscos de orientación.
- Encuadre: máquina completa, evitando que el cabezal se salga del plano.
- Sobreimpresión opcional: `5 ejes continuos · 0 colisiones`.

---

## 6. Encodeado

Con FFmpeg, desde la carpeta donde tengas la captura en bruto:

```bash
ffmpeg -ss 00:00:04 -i bruto.mp4 -t 3 -an -vf "scale=960:-2,fps=30" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart 01-hsm.mp4
```

```bash
ffmpeg -ss 00:00:04 -i bruto.mp4 -t 3 -an -vf "scale=960:-2,fps=30" -c:v libvpx-vp9 -crf 34 -b:v 0 01-hsm.webm
```

```bash
ffmpeg -i 01-hsm.mp4 -frames:v 1 -q:v 4 01-hsm.jpg
```

Ajusta `-ss` para elegir el punto de entrada del bucle y sube el `-crf` si el
archivo supera los 500 KB.

---

## 7. Cómo montarlos en la web

En `index.html`, sección `id="cases"`, cada tarjeta tiene un comentario que marca
el punto exacto de sustitución. Reemplaza el bloque
`<div class="screen ...">…</div>` completo por:

```html
<div class="screen relative h-48 overflow-hidden border-b border-night-line">
  <video class="absolute inset-0 w-full h-full object-cover"
         autoplay loop muted playsinline preload="none"
         poster="assets/clips/01-hsm.jpg"
         aria-label="Simulación de desbaste HSM con carga de viruta constante">
    <source src="assets/clips/01-hsm.webm" type="video/webm">
    <source src="assets/clips/01-hsm.mp4" type="video/mp4">
  </video>
</div>
```

Notas de implementación:

- `muted` y `playsinline` son **obligatorios** o iOS y Chrome bloquean el
  autoarranque.
- `preload="none"` evita descargar los tres clips antes de que el usuario baje.
- El `poster` es lo que se ve mientras carga: que sea un fotograma representativo.
- Si añades los clips, acuérdate de subir el `?v=` de `app.js` y `tailwind.css`
  en las tres páginas para invalidar la caché.
- `assets/` se copia entera a `public/` en el build, así que basta con dejar los
  archivos en `assets/clips/` y ejecutar `npm run build`.

Accesibilidad: los clips son decorativos respecto al texto, que ya explica el
concepto. Aun así el `aria-label` describe el contenido. Quien tenga activado
`prefers-reduced-motion` verá el póster estático — considera añadir la regla si
llegas a montarlos.
