// Copia los archivos públicos (HTML, JS, assets) a public/ tras compilar el CSS.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public');

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
fs.copyFileSync(path.join(root, 'app.js'), path.join(outDir, 'app.js'));

const assetsOut = path.join(outDir, 'assets');
fs.mkdirSync(assetsOut, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'assets'))) {
  fs.copyFileSync(path.join(root, 'assets', f), path.join(assetsOut, f));
}

console.log('Archivos estáticos copiados a public/.');
