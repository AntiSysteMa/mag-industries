# DESIGN — MAG INDUSTRIES

Sistema visual y de movimiento del sitio. `CLAUDE.md` dice cómo es el proyecto;
este archivo, cómo se mueve y por qué. Se escribió en la sesión 13, con la capa
de movimiento v2.

## Idea

**La web se comporta como un centro de mecanizado.** Todo el movimiento sale del
oficio, no de la categoría «web de consultoría»:

| Pieza | Qué es en el taller | Dónde vive |
|---|---|---|
| Arranque «Cycle Start» | El programa se carga y se abren las puertas de la cabina | `#boot` en `index.html`, CSS en `input.css` |
| Retícula de palpador | El palpador busca el origen y se engancha a la pieza | `#reticle`, creado por `app.js` |
| Luz de sonda | La rejilla de la mesa iluminada donde apunta el palpador | `.probe` en el hero |
| Línea del hero que se decodifica | La lectura de un DRO estabilizándose | `.decode` + `decodificar()` en `app.js` |
| Panel del hero «mecanizado» | Barrido de arriba abajo, como una pasada | timeline del hero |
| Tarjetas que se apoyan | Una pieza que se deja sobre la mesa | revelado con `rotateX` |
| Placa de características | La placa remachada de una máquina: cifra y significado | `.plate` + `.spec-row` (Compromisos) |
| Albarán de entrega | Lo que va siempre dentro de la caja | `.manifest` (servicios, auditoría) |
| Pantallas de simulación | El visor del CAM o de la máquina: el material se arranca de verdad, con herramienta y porta a escala, backplot y HUD sacado del programa NC | `canvas[data-sim]` dentro de `.screen`; motor en `sim/` |

Si se añade movimiento nuevo, debe poder rellenar esta tabla. Si no tiene
equivalente en el taller, probablemente sobra.

## Tokens

```css
--ease-out:    cubic-bezier(.23,1,.32,1);   /* entradas y respuesta a la interacción */
--ease-in-out: cubic-bezier(.77,0,.175,1);  /* algo que se mueve en pantalla (puertas, círculo de tema) */
--ease-expo:   cubic-bezier(.16,1,.3,1);    /* revelados largos y de marketing */
--dur-press:140ms; --dur-ui:220ms; --dur-reveal:900ms;
```

En GSAP, el equivalente de `--ease-expo` es `expo.out` y el de `--ease-in-out`
es `expo.inOut`.

Paleta y tipografía no cambian: oro `--safety`, verde `--cyber` y fondo
`--c-bg`, con Saira Stencil One para titulares y Barlow para texto.

## Reglas

1. **El contenido es visible por defecto.** Ocultar para animar solo ocurre bajo
   `html.anim-ready`. El arranque se retira solo, por CSS, aunque falle todo el
   JS. Nada importante puede depender de un CDN.
2. **Movimiento reducido = sin desplazamiento.** Cada pieza tiene su salida en
   `@media (prefers-reduced-motion: reduce)` o en la comprobación `reduced` de
   `app.js`. El contenido llega igual.
3. **Solo propiedades baratas:** `transform`, `translate`, `opacity`,
   `clip-path`, `filter` y variables CSS. Nunca `width`, `height`, `top` ni
   `left` en una animación.
4. **La interfaz responde en menos de 300 ms.** El `:active` es `scale(.97)` en
   140 ms. Las animaciones largas (de 0,9 a 1,2 s) son solo para revelados y
   para el hero.
5. **Nunca `ease-in` en algo que entra.** Para entradas, `--ease-out` o
   `--ease-expo`.
6. **`translate` para la interacción y `transform` para el revelado.** GSAP
   deja `transform` en línea. Por eso la elevación de las tarjetas al hover y el
   magnetismo de los CTA usan la propiedad independiente `translate`, y los
   revelados terminan con `clearProps` y la clase `.in`.
7. **Lo del puntero, solo con puntero fino** (`(hover:hover) and (pointer:fine)`).
   En móvil no hay hover pegado ni retícula.
8. **El cursor nativo se mantiene.** La retícula acompaña, no sustituye.
9. **Un solo momento de autor por pantalla.** El hero tiene su coreografía; el
   resto de capas, revelado por tipo y nada más. No añadir partículas, fondos
   animados ni marquesinas encima.
10. **El arranque se ve una vez por sesión** (`sessionStorage.mag-boot`). No
    aparece si se llega con `#ancla` ni con movimiento reducido. Se salta con
    tecla, clic, rueda o toque. No debe pasar de unos 2 s.
11. **Lo nativo, siempre con red.** `@view-transition`, `startViewTransition` e
    `interpolate-size` son mejora progresiva: sin soporte, la web funciona igual.
12. **Accesibilidad del texto animado.** El decodificado deja el texto real en un
    `span.sr-only` y anima una copia `aria-hidden`. Los titulares partidos en
    palabras conservan su texto en el DOM.

## Estilo de la casa (sesión 13)

Tres hábitos de «web hecha con IA» que se retiraron y no deben volver:

1. **Sin etiquetas encima de los titulares.** Nada de rótulos en mayúsculas
   pequeñas sobre un h1 o un h2. Si el rótulo llevaba un dato («45 minutos · sin
   coste», «Programación CNC externa»), el dato se conserva como línea bajo el
   titular, en tamaño legible. Si solo decoraba, se borra.
2. **Sin numeración decorativa** (01 / 02 / 03, números gigantes de capa). Donde
   el orden importa, lo dicen el texto («Tú envías…», «Recibes…») y la
   semántica `<ol>`. El contador de navegación lateral sí se queda, porque
   indica dónde estás.
3. **Sin filas de tarjetas iguales con icono encima.** Una lista va en un solo
   panel, con filas separadas por un escalón de tono (`.plate`, `.manifest`),
   no por líneas.

## Simulaciones CAM (sesión 14)

Motor propio sin dependencias en `sim/`: `core.js` (Z-map, herramientas, NC,
cinemática), `paths.js` (adaptativo, trocoidal…), `gl.js` (un único contexto
WebGL2 por página, con pérdida y recuperación), `runtime.js` (ciclo de vida,
pausa fuera de vista, movimiento reducido, botón `pausa`) y `view2d.js`. Cada
escena vive en `sim/scenes/<nombre>.js`. `scripts/copy-static.js` concatena un
paquete por página en `public/sim/` (`index.js`, `capacidades.js`,
`blog-trocoidal.js`).

Reglas propias:
- Todo en mm reales, en concordancia, con `SIM ×N` declarado en el HUD.
- Sin GPU (o con WebGL por software) las escenas caen a su versión 2D; CAD y
  multieje solo existen en 3D y en ese caso dejan la pantalla con su rejilla.
- `?simgl=force` fuerza WebGL por software para probar en el contenedor.
- Sin imágenes de respaldo: decisión del usuario, sesión 14.

## Cómo comprobarlo

En este contenedor cdnjs está bloqueado. Se prueba con Playwright contra
`public/`, sirviendo GSAP 3.12.5 y Font Awesome 6.5.1 desde npm en la misma
versión. Tres casos mínimos:

- arranque fotograma a fotograma;
- `reducedMotion: 'reduce'`;
- CDN abortado, donde todo el contenido tiene que verse.

En producción, el navegador solo hace falta para las violaciones de CSP; para lo
demás vale `curl`.
