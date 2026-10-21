/* Vistas Canvas 2D sobre Z-map (planta y oblicua) y primitivas de dibujo técnico de las escenas 2D.
   Todo se dibuja en coordenadas del marco (el runtime ya fija la transformación marco → lienzo). */
(function (G) {
'use strict';
const C = G.CamSim || (G.CamSim = {});
const AMB = 0.38, DIF = 0.62, PI = Math.PI;
const now = () => G.performance.now();
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const css = (h, k, a) => { const c = rgb(h), f = k == null ? 1 : k; return 'rgba(' + Math.min(255, c[0] * f | 0) + ',' + Math.min(255, c[1] * f | 0) + ',' + Math.min(255, c[2] * f | 0) + ',' + (a == null ? 1 : a) + ')'; };
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const c8 = v => v > 255 ? 255 : v < 0 ? 0 : v | 0;
const FONT = { hud: '10.5px ui-monospace,Menlo,Consolas,monospace', cap: '600 9px Barlow,sans-serif' };

function geo(zm) {
  const cx = zm.cx || zm.cell || zm.sx / zm.nx, cy = zm.cy || zm.cell || zm.sy / zm.ny;
  return { cx, cy, ox: zm.ox || 0, oy: zm.oy || 0, sx: zm.nx * cx, sy: zm.ny * cy };
}
function palette(o) {
  const b = new Float32Array(768), st = rgb(o.steel || '#9AA3AA'), raw = rgb(o.raw || '#7C848B'), t = o.tints || {};
  for (let i = 0; i < 256; i++) {
    const c = i ? st : raw, tt = i && t[i], tc = tt ? rgb(tt[0]) : c, m = tt ? tt[1] : 0;
    for (let k = 0; k < 3; k++) b[i * 3 + k] = c[k] + (tc[k] - c[k]) * m;
  }
  return b;
}
const none = d => { d[0] = d[1] = 1e9; d[2] = d[3] = -1; };
function take(d, zm) {
  if (!zm.isDirty()) return;
  d[0] = Math.min(d[0], zm.x0); d[1] = Math.min(d[1], zm.y0); d[2] = Math.max(d[2], zm.x1); d[3] = Math.max(d[3], zm.y1);
  zm.clean();
}
const pack = (b, o, k) => 0xFF000000 | c8(b[o + 2] * k) << 16 | c8(b[o + 1] * k) << 8 | c8(b[o] * k);

/* ---------- planta ---------- */
function TopView2D(ctx, zm, o) {
  if (!(this instanceof TopView2D)) return new TopView2D(ctx, zm, o);
  o = o || {};
  const g = this.g = geo(zm), nx = zm.nx, ny = zm.ny;
  this.ctx = ctx; this.zm = zm; this.o = o;
  this.shadows = o.shadows !== false; this.hz = o.shadowHz || 10;
  this.L = nrm(o.light || [-0.5, 0.45, 0.74]);
  const az = 2 * Math.atan2(this.L[1], this.L[0]);
  this.cl = Math.cos(az); this.sl = Math.sin(az);
  this.base = palette(o);
  this.off = G.document.createElement('canvas'); this.off.width = nx; this.off.height = ny;
  this.oc = this.off.getContext('2d'); this.img = this.oc.createImageData(nx, ny); this.pix = new Uint32Array(this.img.data.buffer);
  this.sb = new Uint8Array(nx * ny).fill(255);
  this.d = new Int32Array(4); this.sd = new Int32Array(4);
  this.d.set([0, 0, nx - 1, ny - 1]); this.sd.set(this.d);
  this.sT = -1e9; this.ms = 0;
  this.view = o.view || { x0: g.ox, y0: g.oy, x1: g.ox + g.sx, y1: g.oy + g.sy };
  this.X = x => this.ox + x * this.s;
  this.Y = y => this.oy - y * this.s;
  this.setRect(o.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height });
}
TopView2D.prototype.setRect = function (r, s) {
  const v = this.view;
  this.rect = r;
  this.s = s || this.o.s || Math.min(r.w / (v.x1 - v.x0), r.h / (v.y1 - v.y0));
  this.ox = r.x + (r.w - (v.x1 - v.x0) * this.s) / 2 - v.x0 * this.s;
  this.oy = r.y + (r.h + (v.y1 - v.y0) * this.s) / 2 + v.y0 * this.s;
};
TopView2D.prototype.markAll = function () { this.d.set([0, 0, this.zm.nx - 1, this.zm.ny - 1]); this.sd.set(this.d); };
TopView2D.prototype.shade = function (x0, y0, x1, y1) {
  const zm = this.zm, g = this.g, nx = zm.nx, ny = zm.ny, h = zm.h, at = zm.at, px = this.pix, sb = this.sb, B = this.base, L = this.L;
  const ix = 0.5 / g.cx, iy = 0.5 / g.cy, top = Math.max(zm.top, zm.hmax || zm.top), dr = 1 / Math.max(1e-6, top - zm.bottom), kz = DIF / L[2] / 255;
  const cl = this.cl / 127.5 * 0.035, sl = this.sl / 127.5 * 0.035;
  for (let j = y0; j <= y1; j++) {
    const row = (ny - 1 - j) * nx, jd = j > 0 ? -nx : 0, ju = j < ny - 1 ? nx : 0;
    for (let i = x0; i <= x1; i++) {
      const q = j * nx + i;
      const gx = (h[i < nx - 1 ? q + 1 : q] - h[i > 0 ? q - 1 : q]) * ix, gy = (h[q + ju] - h[q + jd]) * iy;
      const nl = (L[2] - gx * L[0] - gy * L[1]) / Math.sqrt(gx * gx + gy * gy + 1);
      const dz = (top - h[q]) * dr;
      let k = (AMB + (nl > 0 ? nl : 0) * kz * sb[q]) * (1 - 0.18 * (dz < 0 ? 0 : dz > 1 ? 1 : dz));
      const t = at[q * 4];
      if (t) k *= 1 + (at[q * 4 + 1] - 127.5) * cl + (at[q * 4 + 2] - 127.5) * sl;
      const b = t * 3;
      px[row + i] = 0xFF000000 | c8(B[b + 2] * k) << 16 | c8(B[b + 1] * k) << 8 | c8(B[b] * k);
    }
  }
};
TopView2D.prototype.shadow = function (x0, y0, x1, y1) {
  const zm = this.zm, g = this.g, nx = zm.nx, ny = zm.ny, h = zm.h, sb = this.sb, L = this.L;
  const ll = Math.hypot(L[0], L[1]) || 1, dx = L[0] / ll / g.cx, dy = L[1] / ll / g.cy, te = L[2] / ll;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const q = j * nx + i, h0 = h[q];
    let s = 1;
    for (let k = 1; k <= 16; k++) {
      const t = k * k * 0.06 + k * 0.4, x = i + 0.5 + dx * t, y = j + 0.5 + dy * t;
      if (x < 0 || y < 0 || x >= nx || y >= ny) break;
      const v = 0.5 + (h0 + t * te - h[(y | 0) * nx + (x | 0)]) / (0.06 * t + 0.12);
      if (v < s) { s = v > 0 ? v : 0; if (!s) break; }
    }
    sb[q] = s * 255;
  }
};
TopView2D.prototype.update = function () {
  const t0 = now(), zm = this.zm, d = this.d, sd = this.sd, nx = zm.nx, ny = zm.ny;
  if (zm.isDirty()) { sd[0] = Math.min(sd[0], zm.x0); sd[1] = Math.min(sd[1], zm.y0); sd[2] = Math.max(sd[2], zm.x1); sd[3] = Math.max(sd[3], zm.y1); take(d, zm); }
  if (this.shadows && sd[2] >= sd[0] && t0 - this.sT >= 1000 / this.hz) {
    this.sT = t0;
    const L = this.L, ll = Math.hypot(L[0], L[1]) || 1, T = 21.8;
    const x0 = Math.max(0, sd[0] - Math.ceil(Math.max(0, L[0] / ll) * T / this.g.cx)), x1 = Math.min(nx - 1, sd[2] + Math.ceil(Math.max(0, -L[0] / ll) * T / this.g.cx));
    const y0 = Math.max(0, sd[1] - Math.ceil(Math.max(0, L[1] / ll) * T / this.g.cy)), y1 = Math.min(ny - 1, sd[3] + Math.ceil(Math.max(0, -L[1] / ll) * T / this.g.cy));
    this.shadow(x0, y0, x1, y1);
    d[0] = Math.min(d[0], x0); d[1] = Math.min(d[1], y0); d[2] = Math.max(d[2], x1); d[3] = Math.max(d[3], y1);
    none(sd);
  } else if (!this.shadows) none(sd);
  if (d[2] >= d[0]) {
    const x0 = Math.max(0, d[0] - 1), y0 = Math.max(0, d[1] - 1), x1 = Math.min(nx - 1, d[2] + 1), y1 = Math.min(ny - 1, d[3] + 1);
    this.shade(x0, y0, x1, y1);
    this.oc.putImageData(this.img, 0, 0, x0, ny - 1 - y1, x1 - x0 + 1, y1 - y0 + 1);
    none(d);
  }
  this.ms = now() - t0;
};
TopView2D.prototype.draw = function () {
  const c = this.ctx, g = this.g, v = this.view, zm = this.zm;
  const x0 = Math.max(v.x0, g.ox), x1 = Math.min(v.x1, g.ox + g.sx), y0 = Math.max(v.y0, g.oy), y1 = Math.min(v.y1, g.oy + g.sy);
  if (x1 <= x0 || y1 <= y0) return;
  c.imageSmoothingEnabled = true;
  c.drawImage(this.off, (x0 - g.ox) / g.cx, zm.ny - (y1 - g.oy) / g.cy, (x1 - x0) / g.cx, (y1 - y0) / g.cy, this.X(x0), this.Y(y1), (x1 - x0) * this.s, (y1 - y0) * this.s);
};
TopView2D.prototype.render = function () { this.update(); this.draw(); };
TopView2D.prototype.dispose = function () { this.off.width = this.off.height = 0; };

/* ---------- alzado oblicuo por columnas: vista desde −Y con elevación el ---------- */
function Oblique2D(ctx, zm, o) {
  if (!(this instanceof Oblique2D)) return new Oblique2D(ctx, zm, o);
  o = o || {};
  const el = (o.el != null ? o.el : 50) * PI / 180;
  this.ctx = ctx; this.zm = zm; this.o = o; this.g = geo(zm);
  this.se = Math.sin(el); this.ce = Math.cos(el);
  this.L = nrm(o.light || [-0.45, -0.6, 0.66]);
  this.base = palette(o);
  this.off = G.document.createElement('canvas');
  this.W = this.H = this.k = 0; this.ms = 0;
  this.d = new Int32Array(4); none(this.d);
  this.px = (x) => this.X0 + (x - this.g.ox) * this.s;
  this.py = (x, y, z) => this.Yb - (y - this.g.oy) * this.s * this.se - (z - this.zm.bottom) * this.sz;
  this.setRect(o.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height });
}
Oblique2D.prototype.setRect = function (r) {
  const g = this.g, zm = this.zm, zt = Math.max(zm.top, zm.hmax || zm.top), hz = zt - zm.bottom + (this.o.above || 0), q = this.rect;
  if (q && q.x === r.x && q.y === r.y && q.w === r.w && q.h === r.h && zt === this.zt) return;
  this.zt = zt; this.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
  const s = this.s = this.o.s || Math.min(r.w / g.sx, r.h / (g.sy * this.se + hz * this.ce));
  this.sz = s * this.ce;
  this.X0 = r.x + (r.w - g.sx * s) / 2;
  this.Yb = r.y + (r.h + (g.sy * this.se + hz * this.ce) * s) / 2;
  this.k = 0;
};
Oblique2D.prototype.markAll = function () { this.d.set([0, 0, this.zm.nx - 1, this.zm.ny - 1]); };
Oblique2D.prototype.build = function (k) {
  const g = this.g, zm = this.zm, s = this.s;
  this.k = k;
  this.W = Math.max(1, Math.ceil(g.sx * s * k));
  this.H = Math.max(1, Math.ceil((g.sy * this.se + (this.zt - zm.bottom) * this.ce) * s * k) + 1);
  this.off.width = this.W; this.off.height = this.H;
  this.oc = this.off.getContext('2d'); this.img = this.oc.createImageData(this.W, this.H); this.pix = new Uint32Array(this.img.data.buffer);
  this.rp = g.cy * s * this.se * k; this.zp = s * this.ce * k; this.cn = zm.nx / this.W;
  const f = this.front = new Uint32Array(this.H);
  for (let y = 0; y < this.H; y++) {
    const z = (this.H - y) / this.zp;
    f[y] = pack(this.base, 0, 0.6 + 0.035 * Math.sin(z * 7.85) + 0.025 * Math.sin(z * 23.1 + 1.3) + 0.06 * Math.min(1, z / (this.zt - zm.bottom)));
  }
  this.markAll();
};
Oblique2D.prototype.col = function (c) {
  const zm = this.zm, nx = zm.nx, ny = zm.ny, h = zm.h, at = zm.at, W = this.W, H = this.H, px = this.pix, B = this.base, L = this.L, g = this.g;
  const u = (c + 0.5) * this.cn - 0.5;
  let i0 = Math.floor(u), f = u - i0;
  if (i0 < 0) { i0 = 0; f = 0; } else if (i0 >= nx - 1) { i0 = nx - 1; f = 0; }
  const i1 = i0 < nx - 1 ? i0 + 1 : i0, ic = f < 0.5 ? i0 : i1, il = ic > 0 ? ic - 1 : ic, ir = ic < nx - 1 ? ic + 1 : ic;
  for (let y = c, e = W * H; y < e; y += W) px[y] = 0;
  const rp = this.rp, zp = this.zp, bot = zm.bottom, top = this.zt, dr = 1 / Math.max(1e-6, top - bot), kz = DIF / L[2];
  const ix = 1 / ((ir - il) * g.cx || 1), iy = 0.5 / g.cy;
  let buf = H;
  for (let j = 0; j < ny && buf > 0; j++) {
    const q = j * nx, z = h[q + i0] + (h[q + i1] - h[q + i0]) * f, yF = H - j * rp - (z - bot) * zp, yB = yF - rp;
    if (yB >= buf) continue;
    let a = yF + 0.5 | 0;
    if (a > buf) a = buf;
    if (a < buf) {
      if (j === 0) for (let y = a < 0 ? 0 : a; y < buf; y++) px[y * W + c] = this.front[y];
      else {
        const t = at[(q + ic) * 4] || at[(q - nx + ic) * 4];
        for (let y = a < 0 ? 0 : a; y < buf; y++) {
          const zz = bot + (H - j * rp - y) / zp;
          px[y * W + c] = pack(B, t * 3, (t ? 0.74 : 0.6) * (1 - 0.3 * (top - zz) * dr));
        }
      }
    }
    const b0 = yB + 0.5 | 0, b = b0 < 0 ? 0 : b0;
    if (b < a) {
      const qc = q + ic, jd = j > 0 ? -nx : 0, ju = j < ny - 1 ? nx : 0;
      const gx = (h[q + ir] - h[q + il]) * ix, gy = (h[qc + ju] - h[qc + jd]) * iy;
      const nl = (L[2] - gx * L[0] - gy * L[1]) / Math.sqrt(gx * gx + gy * gy + 1);
      const t = at[qc * 4];
      const col = pack(B, t * 3, (AMB + (nl > 0 ? nl : 0) * kz) * (1 - 0.22 * Math.min(1, (top - h[qc]) * dr)));
      for (let y = b; y < a; y++) px[y * W + c] = col;
    }
    if (b < buf) buf = b;
  }
};
Oblique2D.prototype.update = function () {
  const t0 = now(), zm = this.zm, d = this.d;
  take(d, zm);
  if (!this.W || d[2] < d[0]) return;
  const c0 = Math.max(0, Math.floor((d[0] - 1) / this.cn)), c1 = Math.min(this.W - 1, Math.ceil((d[2] + 2) / this.cn));
  for (let c = c0; c <= c1; c++) this.col(c);
  this.oc.putImageData(this.img, 0, 0, c0, 0, c1 - c0 + 1, this.H);
  none(d);
  this.ms = now() - t0;
};
Oblique2D.prototype.draw = function () {
  const c = this.ctx, m = c.getTransform();
  if (Math.abs(m.a - this.k) > 1e-4) this.build(m.a);
  this.update();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(this.off, Math.round(m.a * this.X0 + m.e), Math.round(m.d * this.Yb + m.f) - this.H);
  c.restore();
};
Oblique2D.prototype.render = Oblique2D.prototype.draw;
/* Recorta lo que queda detrás del material más cercano al observador (filas con y < y de la herramienta). */
Oblique2D.prototype.clipFront = function (ctx, x, y, r) {
  const zm = this.zm, g = this.g, nx = zm.nx, h = zm.h, s = this.s, B = 1e4;
  const xa = Math.floor(this.px(x - r)), xb = Math.ceil(this.px(x + r)), js = Math.min(zm.ny, Math.floor((y - g.oy) / g.cy));
  ctx.beginPath();
  ctx.rect(-B, -B, xa + B, 3 * B);
  ctx.rect(xb, -B, 2 * B, 3 * B);
  ctx.moveTo(xa, -B);
  for (let X = xa; X <= xb; X++) {
    const i = Math.max(0, Math.min(nx - 1, Math.round((X - this.X0) / s / g.cx - 0.5)));
    let m = this.Yb;
    for (let j = 0; j < js; j++) { const v = this.Yb - (j + 1) * g.cy * s * this.se - (h[j * nx + i] - zm.bottom) * this.sz; if (v < m) m = v; }
    ctx.lineTo(X, m);
  }
  ctx.lineTo(xb, -B);
  ctx.closePath();
  ctx.clip();
};
Oblique2D.prototype.dispose = function () { this.off.width = this.off.height = 0; };

/* ---------- herramienta ---------- */
const TOOLC = { cut: '#3B3640', neck: '#6E757B', shank: '#8C9399', holder: '#8A96A3', nut: '#4A5056', flange: '#4A5056' };
const PARTS = ['cut', 'neck', 'shank', 'holder', 'flange', 'nut'];
const tcache = new WeakMap();
function strips(tool) {
  let a = tcache.get(tool);
  if (a) return a;
  const st = typeof tool.stack === 'function' ? tool.stack() : [], by = {};
  for (const s of st) {
    const part = typeof s.part === 'number' ? PARTS[s.part] || 'shank' : s.part || 'shank';
    const pts = s.pts || (s.r != null ? [[s.r0 != null ? s.r0 : s.r, s.z0], [s.r, s.z1 != null ? s.z1 : s.z]] : []);
    (by[part] || (by[part] = [])).push.apply(by[part], pts);
  }
  a = { parts: Object.keys(by).map(k => ({ part: k, pts: by[k] })), R: tool.R || tool.D / 2, lc: tool.lc || tool.Lc || tool.D * 2, helix: tool.helix || 30 };
  tcache.set(tool, a);
  return a;
}
function revPath(pts, s, sz) {
  const p = new Path2D();
  pts.forEach((q, k) => k ? p.lineTo(q[0] * s, -q[1] * sz) : p.moveTo(q[0] * s, -q[1] * sz));
  for (let k = pts.length - 1; k >= 0; k--) p.lineTo(-pts[k][0] * s, -pts[k][1] * sz);
  p.closePath();
  return p;
}
function cylGrad(ctx, x0, x1, base, alpha, axisV) {
  const g = axisV ? ctx.createLinearGradient(x0, 0, x1, 0) : ctx.createLinearGradient(0, x0, 0, x1), a = alpha == null ? 1 : alpha;
  g.addColorStop(0, css(base, 0.45, a)); g.addColorStop(0.3, css(base, 1.3, a)); g.addColorStop(0.42, css(base, 1.05, a));
  g.addColorStop(0.8, css(base, 0.7, a)); g.addColorStop(1, css(base, 0.4, a));
  return g;
}
function toolSide(ctx, tool, x, yTip, s, o) {
  o = o || {};
  const sz = o.sz || s, T = strips(tool), key = s.toFixed(4) + '|' + sz.toFixed(4) + '|' + (o.spin !== false);
  let k = T.k;
  if (!k || k.key !== key) {
    k = T.k = { key, items: [] };
    for (const p of T.parts) {
      const w = Math.max.apply(null, p.pts.map(q => q[0])) * s || 1, op = p.part === 'holder' ? 0.4 : 1;
      k.items.push({ part: p.part, path: revPath(p.pts, s, sz), fill: cylGrad(ctx, -w, w, TOOLC[p.part] || TOOLC.shank, op, true), edge: p.part === 'holder' });
    }
    if (o.spin === false) {
      const hp = new Path2D(), R = T.R * s, pitch = 2 * PI * T.R / Math.tan(T.helix * PI / 180) * sz / Math.max(1, tool.z || 2);
      for (let z = 0; z < T.lc * sz; z += pitch) { hp.moveTo(-R, -z); hp.lineTo(R, -z - pitch * 0.5); }
      k.helix = hp;
    }
  }
  ctx.save();
  ctx.translate(x, yTip);
  for (const it of k.items) {
    ctx.fillStyle = it.fill;
    ctx.fill(it.path);
    if (it.edge) { ctx.strokeStyle = 'rgba(205,215,225,.55)'; ctx.lineWidth = 0.8; ctx.stroke(it.path); }
    if (it.part === 'cut' && k.helix) { ctx.save(); ctx.clip(it.path); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.stroke(k.helix); ctx.restore(); }
  }
  ctx.restore();
}
function toolPlan(ctx, tool, x, y, s, o) {
  o = o || {};
  const R = (tool.R || tool.D / 2) * s, hd = tool.holder;
  if (o.holder !== false) {
    const rn = (hd && hd.nose ? hd.nose / 2 : (tool.shank || tool.D) / 2 + 6) * s;
    ctx.fillStyle = 'rgba(138,150,163,.16)'; ctx.strokeStyle = 'rgba(205,215,225,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, rn, 0, 2 * PI); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(42,38,48,.92)'; ctx.strokeStyle = 'rgba(200,208,216,.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * PI); ctx.fill(); ctx.stroke();
  if (o.arc && o.arc.a1 !== o.arc.a0) {
    const f = o.yDown ? 1 : -1;
    ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 3; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(x, y, R, f * o.arc.a0, f * o.arc.a1, f < 0); ctx.stroke();
  }
}

/* ---------- torno: plaquita CNMG 120408 y porta PCLNR 2525 (alzado XZ, Z a la derecha, X arriba) ----------
   (px,py) = centro del radio de punta en el marco; rot en grados, positivo antihorario en pantalla. */
const CNMG = (() => {
  const a = 12.7 / Math.sin(80 * PI / 180), e1 = 85 * PI / 180, e2 = 5 * PI / 180, d = 0.8 / Math.sin(40 * PI / 180), b = 45 * PI / 180;
  const t = [-d * Math.cos(b), -d * Math.sin(b)];
  return [t, [t[0] + a * Math.cos(e1), t[1] + a * Math.sin(e1)], [t[0] + a * (Math.cos(e1) + Math.cos(e2)), t[1] + a * (Math.sin(e1) + Math.sin(e2))], [t[0] + a * Math.cos(e2), t[1] + a * Math.sin(e2)]];
})();
function polyRound(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let k = 1; k <= n; k++) ctx.arcTo(pts[k % n][0], pts[k % n][1], pts[(k + 1) % n][0], pts[(k + 1) % n][1], r);
  ctx.closePath();
}
function lathePose(ctx, px, py, s, rot) { ctx.translate(px, py); ctx.rotate(-(rot || 0) * PI / 180); ctx.scale(s, -s); }
function insertCNMG(ctx, px, py, s, o) {
  ctx.save();
  lathePose(ctx, px, py, s, o && o.rot);
  polyRound(ctx, CNMG, 0.8);
  const g = ctx.createLinearGradient(0, 0, 10, 10);
  g.addColorStop(0, '#5B5866'); g.addColorStop(1, '#2C2932');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1 / s; ctx.strokeStyle = 'rgba(210,214,220,.65)'; ctx.stroke();
  const c = [(CNMG[0][0] + CNMG[2][0]) / 2, (CNMG[0][1] + CNMG[2][1]) / 2];
  ctx.beginPath(); ctx.arc(c[0], c[1], 2.58, 0, 2 * PI); ctx.fillStyle = '#16141A'; ctx.fill();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const p = CNMG[k], q = [p[0] + (c[0] - p[0]) * 0.16, p[1] + (c[1] - p[1]) * 0.16]; k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
  ctx.restore();
}
function holderPCLNR(ctx, px, py, s, o) {
  ctx.save();
  lathePose(ctx, px, py, s, o && o.rot);
  const T = CNMG[0], top = 200;
  ctx.beginPath();
  ctx.moveTo(T[0] + 2.2, T[1] + 6); ctx.lineTo(T[0] + 7, T[1] + 1.2); ctx.lineTo(T[0] + 32, T[1] + 1.2);
  ctx.lineTo(T[0] + 32, top); ctx.lineTo(T[0] + 7, top); ctx.lineTo(T[0] + 7, T[1] + 30); ctx.lineTo(T[0] + 1.2, T[1] + 22);
  ctx.closePath();
  const g = ctx.createLinearGradient(T[0] + 1, 0, T[0] + 32, 0);
  g.addColorStop(0, '#3A3F45'); g.addColorStop(0.35, '#6A7179'); g.addColorStop(1, '#353A40');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1 / s; ctx.strokeStyle = 'rgba(200,208,216,.35)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(T[0] + 12, T[1] + 12, 2.6, 0, 2 * PI); ctx.fillStyle = '#23262B'; ctx.fill();
  ctx.restore();
}

/* ---------- backplot: capa incremental en px de dispositivo ---------- */
const BP = (C.PAL && C.PAL.path || [{ c: '#D4AF37', a: 0.7, dash: [4, 4] }, { c: '#2EE6A8', a: 0.55 }, { c: '#9FF5D6', a: 0.8 }, { c: '#9FF5D6', a: 0.8 }, { c: '#D4AF37', a: 0.45 }])
  .map(p => [css(p.c, 1, p.a), p.dash || null]);
const layers = [];
function layerFor(ctx, path, key) {
  let L = layers.find(l => l.path === path);
  const cv = ctx.canvas;
  if (!L) {
    L = layers.length < 2 ? { cv: G.document.createElement('canvas') } : layers.shift();
    L.path = path; L.key = ''; layers.push(L);
  } else { layers.splice(layers.indexOf(L), 1); layers.push(L); }
  if (L.key !== key || L.cv.width !== cv.width || L.cv.height !== cv.height) {
    L.cv.width = cv.width; L.cv.height = cv.height; L.c = L.cv.getContext('2d'); L.k = 0; L.d = -1; L.key = key;
  }
  return L;
}
function backplot(ctx, path, upTo, X, Y, s) {
  if (!path || !path.n) return;
  const p = path.pts, dist = path.dist, n = path.n, fn = typeof X === 'function', m = ctx.getTransform();
  const key = [m.a, m.b, m.c, m.d, m.e, m.f, fn ? '' : X + ',' + Y + ',' + s].join('|');
  const L = layerFor(ctx, path, key);
  if (fn && (L.X !== X || L.Y !== Y)) { L.X = X; L.Y = Y; L.k = 0; L.c.clearRect(0, 0, L.cv.width, L.cv.height); }
  if (upTo < L.d) { L.k = 0; L.c.clearRect(0, 0, L.cv.width, L.cv.height); }
  L.d = upTo;
  const mx = k => fn ? X(p[k * 4], p[k * 4 + 1], p[k * 4 + 2]) : X + p[k * 4] * s;
  const my = k => fn ? Y(p[k * 4], p[k * 4 + 1], p[k * 4 + 2]) : Y - p[k * 4 + 1] * s;
  let e = L.k;
  while (e + 1 < n && dist[e + 1] <= upTo) e++;
  const c = L.c;
  if (e > L.k) {
    c.setTransform(m); c.lineWidth = 1;
    let st = -1;
    for (let k = Math.max(1, L.k + 1); k <= e; k++) {
      const ty = p[k * 4 + 3] | 0;
      if (ty !== st) {
        if (st >= 0) c.stroke();
        st = ty; c.strokeStyle = (BP[ty] || BP[1])[0]; c.setLineDash((BP[ty] || BP[1])[1] || []);
        c.beginPath(); c.moveTo(mx(k - 1), my(k - 1));
      }
      c.lineTo(mx(k), my(k));
    }
    if (st >= 0) c.stroke();
    L.k = e;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L.cv, 0, 0);
  ctx.restore();
  if (e + 1 < n && upTo > dist[e]) {
    const f = (upTo - dist[e]) / Math.max(1e-9, dist[e + 1] - dist[e]), ty = p[(e + 1) * 4 + 3] | 0, b = BP[ty] || BP[1];
    const x0 = mx(e), y0 = my(e), x1 = x0 + (mx(e + 1) - x0) * f, y1 = y0 + (my(e + 1) - y0) * f;
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = b[0]; ctx.setLineDash(b[1] || []);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  }
}

/* ---------- gráficos, texto, triedro y texturas ---------- */
function chart(ctx, r, series, o) {
  o = o || {};
  const yMax = o.yMax || 180, ticks = o.ticks || [0, 90, 180];
  ctx.save();
  ctx.lineWidth = 1; ctx.font = FONT.cap; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  for (const t of ticks) {
    const y = Math.round(r.y + r.h - t / yMax * r.h) + 0.5;
    ctx.strokeStyle = 'rgba(140,160,178,.22)'; ctx.setLineDash(t ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
    ctx.fillStyle = '#8CA0B2'; ctx.fillText(t + '°', r.x - 3, y);
  }
  for (const s of series) {
    const d = s.data, len = Math.max(2, s.len || d.length), n = Math.min(s.n == null ? d.length : s.n, d.length);
    if (n < 2) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.25; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = r.x + i / (len - 1) * r.w, y = r.y + r.h - Math.max(0, Math.min(yMax, d[i])) / yMax * r.h;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  if (o.cursor != null) {
    const x = Math.round(r.x + o.cursor * r.w) + 0.5;
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(234,240,246,.3)';
    ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke();
  }
  ctx.restore();
}
function hudText(ctx, x, y, lines, o) {
  o = o || {};
  const size = o.size || 10.5, lh = o.lh || size * 1.4;
  ctx.save();
  ctx.font = (o.weight ? o.weight + ' ' : '') + size + 'px ' + (o.family || 'ui-monospace,Menlo,Consolas,monospace');
  ctx.textBaseline = 'top'; ctx.textAlign = o.align || 'left';
  lines.forEach((ln, k) => {
    const yy = y + k * lh;
    if (ln.parts) {
      let xx = x;
      if (o.align === 'right') xx -= ln.parts.reduce((w, p) => w + ctx.measureText(p.text).width, 0);
      ctx.textAlign = 'left';
      for (const p of ln.parts) { ctx.fillStyle = p.color || '#8CA0B2'; ctx.fillText(p.text, xx, yy); xx += ctx.measureText(p.text).width; }
      ctx.textAlign = o.align || 'left';
    } else { ctx.fillStyle = ln.color || '#8CA0B2'; ctx.fillText(ln.text, x, yy); }
  });
  ctx.restore();
}
const PX = C.PAL && C.PAL.axis || { x: '#FF5A3C', y: '#2EE6A8', z: '#4C9BFF' };
const AX = [['x', PX.x, 'X'], ['y', PX.y, 'Y'], ['z', PX.z, 'Z']];
function triad2D(ctx, x, y, axes) {
  ctx.save();
  ctx.lineWidth = 1.25; ctx.font = '600 10px Barlow,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of AX) {
    const v = axes[a[0]];
    if (!v) continue;
    const L = 18 * Math.min(1, Math.hypot(v[0], v[1])), u = Math.hypot(v[0], v[1]) || 1, dx = v[0] / u, dy = v[1] / u;
    const ex = x + dx * L, ey = y + dy * L;
    ctx.strokeStyle = ctx.fillStyle = a[1];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    if (L > 4) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - dx * 4 - dy * 2.2, ey - dy * 4 + dx * 2.2); ctx.lineTo(ex - dx * 4 + dy * 2.2, ey - dy * 4 - dx * 2.2); ctx.closePath(); ctx.fill(); }
    ctx.fillText(a[2], ex + dx * 7, ey + dy * 7);
  }
  ctx.restore();
}
function hatch(ctx, path2D, o) {
  o = o || {};
  const r = o.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }, gap = o.gap || 4, a = (o.angle != null ? o.angle : 45) * PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = Math.hypot(r.w, r.h) / 2;
  ctx.save();
  ctx.clip(path2D);
  ctx.strokeStyle = o.color || 'rgba(140,160,178,.5)'; ctx.lineWidth = o.width || 1;
  ctx.beginPath();
  for (let d = -R; d <= R; d += gap) { ctx.moveTo(cx - sa * d - ca * R, cy + ca * d - sa * R); ctx.lineTo(cx - sa * d + ca * R, cy + ca * d + sa * R); }
  ctx.stroke();
  ctx.restore();
}
function cylinderShade(ctx, x0, y0, x1, y1, base, o) {
  const v = o && o.axis === 'v';
  ctx.fillStyle = cylGrad(ctx, v ? x0 : y0, v ? x1 : y1, base, o && o.alpha, v);
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}
const tiles = {};
function noise(ctx, r, o) {
  o = o || {};
  const seed = o.seed || 1;
  let t = tiles[seed];
  if (!t) {
    const cv = G.document.createElement('canvas'), N = 64;
    cv.width = cv.height = N;
    const c = cv.getContext('2d'), im = c.createImageData(N, N), rnd = (C.rng || (a => () => (a = (a * 16807) % 2147483647) / 2147483647))(seed);
    for (let i = 0; i < N * N; i++) { const v = rnd() * 255 | 0; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    c.putImageData(im, 0, 0);
    t = tiles[seed] = ctx.createPattern(cv, 'repeat');
  }
  ctx.save();
  ctx.globalAlpha = o.amount == null ? 0.06 : o.amount;
  ctx.globalCompositeOperation = o.mode || 'overlay';
  ctx.fillStyle = t;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

C.V2D = {
  TopView2D, Oblique2D, font: FONT, css,
  draw: { toolPlan, toolSide, insertCNMG, holderPCLNR, backplot, chart, hudText, triad2D, hatch, cylinderShade, noise }
};
})(globalThis);
