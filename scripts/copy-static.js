// Copia los archivos públicos (HTML, JS, assets) a public/ tras compilar el CSS
// y concatena los paquetes de simulación de sim/ (uno por página).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public');

fs.mkdirSync(outDir, { recursive: true });

// Todas las páginas HTML de la raíz, para no tener que tocar este script
// cada vez que se añade una landing nueva.
const paginas = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
for (const f of [...paginas, 'app.js', 'robots.txt', 'sitemap.xml']) {
  fs.copyFileSync(path.join(root, f), path.join(outDir, f));
}

// Recursivo: una subcarpeta (assets/sim/ con los pósters) rompía el build con EISDIR.
function copiarDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copiarDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}
copiarDir(path.join(root, 'assets'), path.join(outDir, 'assets'));

// Paquetes de simulación: sim/ no se publica tal cual. Cada página carga un solo
// script del mismo origen (la CSP no cambia) con el motor y sus escenas, en este
// orden y sin transformar el código. «?» = opcional: program y shapes solo
// existen si el núcleo se parte en tres archivos con la misma API.
const PAQUETES = {
  'index.js': ['core', 'program?', 'shapes?', 'paths', 'gl', 'view2d', 'runtime',
    'scenes/hero', 'scenes/hsm', 'scenes/trocoidal', 'scenes/cinco-ejes'],
  'capacidades.js': ['core', 'program?', 'shapes?', 'gl', 'view2d', 'runtime',
    'scenes/planeado', 'scenes/cad', 'scenes/multieje', 'scenes/torneado', 'scenes/hilo',
    'scenes/penetracion', 'scenes/laser'],
  'blog-trocoidal.js': ['core', 'program?', 'view2d', 'runtime', 'scenes/blog-trocoidal'],
};
const simDir = path.join(root, 'sim');
const simOut = path.join(outDir, 'sim');
fs.rmSync(simOut, { recursive: true, force: true });
fs.mkdirSync(simOut, { recursive: true });
const faltan = [];
for (const [paquete, lista] of Object.entries(PAQUETES)) {
  const partes = [];
  for (const item of lista) {
    const opcional = item.endsWith('?');
    const nombre = item.replace(/\?$/, '');
    const f = path.join(simDir, nombre + '.js');
    if (!fs.existsSync(f)) {
      // Una escena que falta deja su póster en la página; un motor que falta, no.
      if (nombre.startsWith('scenes/')) faltan.push(`${paquete}: sim/${nombre}.js`);
      else if (!opcional) throw new Error(`Falta sim/${nombre}.js para public/sim/${paquete}`);
      continue;
    }
    partes.push(`/* sim/${nombre}.js */\n` + fs.readFileSync(f, 'utf8'));
  }
  // El «;» separa archivos que no acaben en punto y coma (cada uno es una IIFE).
  const js = partes.join('\n;\n');
  fs.writeFileSync(path.join(simOut, paquete), js);
  const gz = zlib.gzipSync(js, { level: 9 }).length;
  console.log(`public/sim/${paquete}: ${(js.length / 1024).toFixed(1)} KB · ${(gz / 1024).toFixed(1)} KB gz`);
}
if (faltan.length) console.warn('Escenas sin archivo (queda su póster):\n  ' + faltan.join('\n  '));

console.log('Archivos estáticos copiados a public/.');
