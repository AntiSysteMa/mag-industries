// Adds srcset/sizes/decoding to Unsplash <img> tags for responsive, lighter loading.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

// Map each unsplash photo id to a sizes hint based on its grid context.
const sizesByPhoto = {
  '1540962351504-03099e0a754b': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1492144534655-ae79c964c9d7': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1508444845599-5c89863b1c44': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1579154204601-01588f351e67': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1466611653911-95081537e5b7': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1717386255773-1e3037c81788': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1537462715879-360eeb61a0ad': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1504328345606-18bbc8c9d7d1': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1541888946425-d81bb19240f5': '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw',
  '1563448448467-7fc866d214bb': '(min-width:1024px) 50vw, 100vw',
  '1740209475472-aa7d280f7452': '(min-width:1024px) 66vw, 100vw',
  '1713371398484-cc4e4f6a262a': '(min-width:1024px) 33vw, 100vw',
  '1591639713936-6fafe6748de0': '(min-width:1024px) 33vw, 100vw'
};

const imgTagRe = /<img src="(https:\/\/images\.unsplash\.com\/photo-([\w-]+)\?[^"]*?)&w=(\d+)&q=(\d+)"([^>]*?)>/g;

let count = 0;
html = html.replace(imgTagRe, (full, srcUrl, photoId, w, q, rest) => {
  const base = srcUrl.replace(/&w=\d+&q=\d+$/, '');
  const sizes = sizesByPhoto[photoId];
  if (!sizes) { console.warn('sin sizes definido para', photoId); return full; }
  const srcset = [400, 800, 1200].map(width => `${base}&w=${width}&q=${q} ${width}w`).join(', ');
  count++;
  // Insert srcset+sizes+decoding right after src, before the rest of the attributes.
  return `<img src="${srcUrl}&w=${w}&q=${q}" srcset="${srcset}" sizes="${sizes}" decoding="async"${rest}>`;
});

fs.writeFileSync(file, html, 'utf8');
console.log(`Actualizadas ${count} imágenes con srcset/sizes/decoding.`);
