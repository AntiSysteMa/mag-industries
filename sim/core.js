/* Núcleo del motor de simulación de mecanizado. Sin DOM: carga igual en el navegador y en Node (vm) y cuelga de
   globalThis.CamSim. Unidades: mm, s, rpm, mm/min; grados en la API de oficio y radianes en CamSim.M. */
(function (G) {
'use strict';
const C = G.CamSim || (G.CamSim = {});
C.VERSION = '1.1.0';
const { PI, sqrt, abs, min, max, floor, ceil, round, hypot, sin, cos, atan2, acos } = Math;
const TAU = 2 * PI, RAD = PI / 180, DEG = 180 / PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- registro de escenas: vive aquí para que las pruebas de Node carguen las escenas sin DOM ---------- */
C.scenes = C.scenes || {};
C.sceneSpecs = C.sceneSpecs || {};
C.define = (name, factory, meta) => {
  if (typeof factory !== 'function') throw new TypeError('CamSim.define(' + name + '): falta la fábrica');
  return (C.scenes[name] = { factory, meta: Object.assign({ kind: '2d', drive: 'time', loop: true, introFinal: 0 }, meta) });
};
C.spec = (name, data) => data === undefined ? C.sceneSpecs[name] : (C.sceneSpecs[name] = data);

C.rng = seed => {
  const s0 = seed >>> 0; let s = s0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = () => { s = s0; return f; };
  f.range = (a, b) => a + (b - a) * f();
  return f;
};

const MEMO = new Map();
C.memo = (key, fn) => {
  if (MEMO.has(key)) return MEMO.get(key);
  const v = fn(); MEMO.set(key, v);
  /* una promesa rechazada no se queda en caché: el siguiente intento la recalcula */
  if (v && typeof v.then === 'function') v.then(null, () => { if (MEMO.get(key) === v) MEMO.delete(key); });
  return v;
};
C.memo.has = k => MEMO.has(k);
C.memo.clear = k => k === undefined ? MEMO.clear() : MEMO.delete(k);

C.util = {
  clamp, lerp,
  smooth: t => (t = clamp(t, 0, 1)) * t * (3 - 2 * t),
  easeOut: t => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
  easeInOut: t => (t = clamp(t, 0, 1)) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  ncText: s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[()]/g, '')
};

const pad2 = v => (v < 10 ? '0' : '') + v;
C.fmt = {
  fix: (v, d = 3) => (abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d),
  sign: (v, d = 3) => { const s = C.fmt.fix(v, d); return s[0] === '-' ? s : '+' + s; },
  int: v => String(round(v)),
  mmss: s => { s = round(max(0, s) * 10) / 10; const m = floor(s / 60), r = s - m * 60; return pad2(m) + ':' + (r < 10 ? '0' : '') + r.toFixed(1); },
  hms: s => { s = max(0, round(s)); return [floor(s / 3600), floor(s / 60) % 60, s % 60].map(pad2).join(':'); }
};

/* ---------- álgebra: mat4 column-major en Float32Array, como GL ---------- */
const M = C.M = {
  RAD, DEG,
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => hypot(a[0], a[1], a[2]),
  norm: a => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  ident() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  mul(a, b, o) {
    const r = o && o !== a && o !== b ? o : new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let w = 0; w < 4; w++) r[c * 4 + w] = a[w] * b[c * 4] + a[4 + w] * b[c * 4 + 1] + a[8 + w] * b[c * 4 + 2] + a[12 + w] * b[c * 4 + 3];
    if (o && r !== o) o.set(r);
    return o || r;
  },
  lookAt(e, c, u) {
    const z = M.norm(M.sub(e, c)), x = M.norm(M.cross(u, z)), y = M.cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -M.dot(x, e), -M.dot(y, e), -M.dot(z, e), 1]);
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o;
  },
  persp(fovy, asp, n, f) {
    const o = new Float32Array(16), t = 1 / Math.tan(fovy / 2);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o;
  },
  translate(x, y, z) { const o = M.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
  scaleM(x, y, z) { const o = M.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
  rotX(a) { const o = M.ident(), c = cos(a), s = sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  rotY(a) { const o = M.ident(), c = cos(a), s = sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  rotZ(a) { const o = M.ident(), c = cos(a), s = sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
  axisAngle(ax, a) {
    const [x, y, z] = M.norm(ax), c = cos(a), s = sin(a), t = 1 - c, o = M.ident();
    o[0] = t * x * x + c; o[1] = t * x * y + s * z; o[2] = t * x * z - s * y;
    o[4] = t * x * y - s * z; o[5] = t * y * y + c; o[6] = t * y * z + s * x;
    o[8] = t * x * z + s * y; o[9] = t * y * z - s * x; o[10] = t * z * z + c; return o;
  },
  invert(m, o) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!d) return null; d = 1 / d;
    const r = o || new Float32Array(16);
    r[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; r[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    r[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; r[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    r[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; r[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    r[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; r[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    r[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; r[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    r[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; r[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    r[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; r[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    r[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; r[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return r;
  },
  xf(m, p, o) {
    const x = p[0], y = p[1], z = p[2], r = o || [0, 0, 0];
    r[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; r[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; r[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return r;
  },
  xfDir(m, v, o) {
    const x = v[0], y = v[1], z = v[2], r = o || [0, 0, 0];
    r[0] = m[0] * x + m[4] * y + m[8] * z; r[1] = m[1] * x + m[5] * y + m[9] * z; r[2] = m[2] * x + m[6] * y + m[10] * z;
    return r;
  },
  /* a píxeles con Y hacia abajo: [x, y, zNDC] */
  project(m, p, w, h, o) {
    const x = p[0], y = p[1], z = p[2], r = o || [0, 0, 0], cw = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    r[0] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * 0.5 + 0.5) * w;
    r[1] = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * 0.5) * h;
    r[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / cw;
    return r;
  }
};

/* ---------- paleta (§3.1) ---------- */
C.PAL = {
  bg: '#041A25', gold: '#D4AF37', green: '#2EE6A8', alert: '#FF5A3C', entry: '#9FF5D6', gouge: '#FF5A3C',
  cmp: { excess: '#4CC9F0', ok: '#2EE6A8', gouge: '#FF5A3C', mix: 0.7 },
  tint: { rough: ['#D4AF37', 0.12], finish: ['#8FB8DE', 0.10], semi: ['#2EE6A8', 0.10] },
  axis: { x: '#FF5A3C', y: '#2EE6A8', z: '#4C9BFF' },
  hud: { text: '#8CA0B2', value: '#EAF0F6', g: '#2EE6A8', g0: '#D4AF37', sim: '#D4AF37' },
  mat: {
    steel: '#9AA3AA', steelHard: '#7E868D', h13: '#848C93', stock: '#7C848B',
    alu: '#8E959C', aluMilled: '#C9CED3', graphite: '#3A3D40', copper: '#B87333', brass: '#C9A227'
  },
  tool: { coat: '#3B3640', shank: '#8C9399', holder: '#8A96A3', holderAlpha: 0.4, flange: '#4A5056' },
  /* backplot por tipo de punto: 0 G0 · 1 corte · 2 entrada · 3 salida · 4 enlace */
  path: [
    { c: '#D4AF37', a: 0.7, dash: [4, 4] }, { c: '#2EE6A8', a: 0.55, dash: null }, { c: '#9FF5D6', a: 0.8, dash: null },
    { c: '#9FF5D6', a: 0.8, dash: null }, { c: '#D4AF37', a: 0.45, dash: null }
  ],
  rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; },
  css(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (a == null ? 1 : a) + ')'; }
};

/* ---------- fórmulas de oficio (Anexo B) ---------- */
const MECH = C.MECH = {
  rpm: (vc, d) => vc * 1000 / (PI * d),
  vc: (S, d) => PI * d * S / 1000,
  feed: (fz, z, S) => fz * z * S,
  fz: (F, z, S) => F / (z * S),
  engageDeg: (ae, d) => acos(1 - 2 * clamp(ae, 0, d) / d) * DEG,
  hex: (fz, ae, d) => ae >= d / 2 ? fz : fz * sqrt(1 - Math.pow(1 - 2 * ae / d, 2)),
  /* en ladera de slopeDeg con ae horizontal el paso real es ae/cos */
  cusp: (R, ae, slopeDeg = 0) => { const a = ae / cos(slopeDeg * RAD); return R - sqrt(max(0, R * R - a * a / 4)); },
  ballDeff: (d, ap, tiltDeg = 0) => { const R = d / 2; return d * sin(min(PI / 2, tiltDeg * RAD + acos(clamp((R - ap) / R, -1, 1)))); },
  cornerVmax: (a, r) => sqrt(a * 1000 * max(0, r)) * 60,
  helixPitch: (dPath, rampDeg) => PI * dPath * Math.tan(rampDeg * RAD),
  trochoidCenterF: (Fedge, rho, R) => Fedge * rho / (rho + R),
  trochoidEngageDeg: (rho, s, d) => { const R = d / 2; return acos(clamp((2 * rho * R - 2 * rho * s - s * s) / (2 * (rho + s) * R), -1, 1)) * DEG; },
  rotaryFeedMax: (rpmMax, rEff) => rpmMax * TAU * rEff,
  mrr: (ae, ap, F) => ae * ap * F / 1000,
  latheRpm: (vc, dia) => vc * 1000 / (PI * dia),
  latheRa: (f, re) => f * f / (32 * re) * 1000,
  vdiRa: vdi => 0.1 * Math.pow(10, vdi / 20),
  pulsePitch: (v, fkHz) => v / fkHz,
  sphereSpiral: (R, p, th0, th1) => TAU * R * R / p * (cos(th0 * RAD) - cos(th1 * RAD)),
  check(c) {
    const out = [], off = (a, b) => abs(a - b) > 0.02 * abs(b), d = c.dia || c.D;
    if (c.vc != null && c.S != null && d && off(c.S, MECH.rpm(c.vc, d))) out.push('S' + c.S + ' no casa con Vc ' + c.vc + ' en Ø' + d + ' (S' + round(MECH.rpm(c.vc, d)) + ')');
    if (c.fz != null && c.F != null && c.z && c.S && off(c.F, MECH.feed(c.fz, c.z, c.S))) out.push('F' + c.F + ' no casa con fz ' + c.fz + ' · z' + c.z + ' · S' + c.S + ' (F' + round(MECH.feed(c.fz, c.z, c.S)) + ')');
    if (c.f != null && c.F != null && c.S && off(c.F, c.f * c.S)) out.push('F' + c.F + ' no casa con f ' + c.f + ' mm/vuelta · S' + c.S);
    if (c.ae != null && c.D && c.ae >= c.D) out.push('ae ' + c.ae + ' ≥ D ' + c.D);
    if (c.F != null && !(c.F > 0)) out.push('F no positivo');
    if (c.S != null && !(c.S > 0)) out.push('S no positivo');
    return out;
  }
};

/* ---------- herramienta y portaherramientas ---------- */
const KIND = { flat: 0, ball: 1, bull: 2, face: 3 }, PARTS = ['cut', 'neck', 'shank', 'nut', 'holder', 'flange'];
class Tool {
  constructor(o) {
    if (!(o.kind in KIND)) throw new Error('Tool ' + o.id + ': tipo desconocido ' + o.kind);
    Object.assign(this, o);
    const k = this.k = KIND[o.kind], R = this.R = o.D / 2;
    this.rc = k === 1 ? R : k === 2 ? o.rc || 0 : 0;
    /* nunca punta viva: plana con chaflán de 0.2 salvo que se diga otra cosa */
    this.ch = k === 0 || k === 3 ? (o.chamfer != null ? o.chamfer : 0.2) : 0;
    this.z = o.z || 2; this.helix = o.helix || 35; this.shank = o.shank || o.D; this.lc = o.lc || 2 * o.D;
    this.holder = Object.assign({ type: 'shrink', A: 100, nose: 24, bore: 46, flange: 63, iface: 'HSK-A63' }, o.holder);
    this.cut = Object.assign({}, o.cut);
    this.embed = o.oal - o.stick;
    if (!(o.stick > 0) || !(o.oal > o.stick)) throw new Error('Tool ' + o.id + ': voladizo ' + o.stick + ' fuera de 0…' + o.oal);
    if (this.embed > this.holder.bore + 1e-9) throw new Error('Tool ' + o.id + ': ' + this.embed + ' mm embutidos y el porta admite ' + this.holder.bore);
    if (this.lc > o.stick + 1e-9) throw new Error('Tool ' + o.id + ': los filos (' + this.lc + ') entran en el porta (voladizo ' + o.stick + ')');
    this.gauge = o.stick + this.holder.A;
    this.lead = PI * o.D / Math.tan(this.helix * RAD);
    this.name = o.name || (k === 1 ? 'BOLA D' + o.D : k === 2 ? 'TORICA D' + o.D + ' R' + this.rc : k === 3 ? 'PLATO D' + o.D : 'FRESA D' + o.D + ' Z' + this.z);
    this._st = this._out = null;
  }
  prof(r) {
    const R = this.R; if (r > R) r = R;
    if (this.k === 1) return R - sqrt(max(0, R * R - r * r));
    if (this.k === 2) { const a = R - this.rc, d = r - a; return r <= a ? 0 : this.rc - sqrt(max(0, this.rc * this.rc - d * d)); }
    return r <= R - this.ch ? 0 : r - R + this.ch;
  }
  stack() {
    if (this._st) return this._st;
    const S = [], R = this.R, lc = this.lc, st = this.stick, rs = this.shank / 2, H = this.holder, rc = this.rc;
    const add = (part, pts) => S.push({ part, pi: PARTS.indexOf(part), pts });
    if (rc > 0) {
      const a = [[0, 0]], m = this.k === 1 ? 12 : 6;
      if (R > rc) a.push([R - rc, 0]);
      for (let i = 1; i <= m; i++) { const t = (i / m - 1) * PI / 2; a.push([R - rc + rc * cos(t), rc + rc * sin(t)]); }
      add('cut', a); add('cut', [[R, rc], [R, lc]]);
    } else {
      const c = this.ch; add('cut', [[0, 0], [R - c, 0]]); if (c > 0) add('cut', [[R - c, 0], [R, c]]); add('cut', [[R, c], [R, lc]]);
    }
    let z = lc, r = R;
    if (this.neck) {
      const rn = this.neck.d / 2, zl = max(lc + 1, this.neck.l);
      add('neck', [[R, lc], [rn, lc + 0.4]]); add('neck', [[rn, lc + 0.4], [rn, zl]]);
      z = zl; r = rn;
      if (rs > rn) { const z2 = min(st, zl + (rs - rn) / Math.tan(30 * RAD)); add('neck', [[rn, zl], [rs, z2]]); z = z2; r = rs; }
    }
    if (abs(r - rs) > 1e-6) { add('shank', [[r, z], [rs, z + 0.3]]); z += 0.3; }
    add('shank', [[rs, z], [rs, st]]);
    const fl = H.flange / 2, fh = H.iface === 'SK40' ? 16 : 20, zg = this.gauge, zf = zg - fh;
    if (H.type === 'er32' || H.type === 'er') {
      const rn = H.nose / 2 || 25, rb = min(rn, 25);
      add('nut', [[rs, st], [rn - 3, st]]); add('nut', [[rn - 3, st], [rn, st + 3]]); add('nut', [[rn, st + 3], [rn, st + 22]]); add('nut', [[rn, st + 22], [rb - 1.5, st + 22]]);
      add('holder', [[rb - 1.5, st + 22], [rb - 1.5, st + 24]]); add('holder', [[rb - 1.5, st + 24], [rb, st + 24.5]]); add('holder', [[rb, st + 24.5], [rb, zf]]); add('holder', [[rb, zf], [fl, zf]]);
    } else if (H.type === 'shellmill') {
      const rn = H.nose / 2; add('holder', [[rs, st], [rn, st]]); add('holder', [[rn, st], [rn, zf]]); add('holder', [[rn, zf], [fl, zf]]);
    } else {
      const rn = H.nose / 2, zc = zf - 10, rt = rn + Math.tan(4.5 * RAD) * max(0, zc - st - 1), rcol = max(22, rt + 1);
      add('holder', [[rs, st], [rn - 1, st]]); add('holder', [[rn - 1, st], [rn, st + 1]]); add('holder', [[rn, st + 1], [rt, zc]]);
      add('holder', [[rt, zc], [rcol, zc]]); add('holder', [[rcol, zc], [rcol, zf]]); add('holder', [[rcol, zf], [fl, zf]]);
    }
    add('flange', [[fl, zf], [fl, zf + fh * 0.25]]); add('flange', [[fl, zf + fh * 0.25], [fl - 3.5, zf + fh * 0.45]]);
    add('flange', [[fl - 3.5, zf + fh * 0.45], [fl, zf + fh * 0.65]]); add('flange', [[fl, zf + fh * 0.65], [fl, zg]]); add('flange', [[fl, zg], [0, zg]]);
    return (this._st = S);
  }
  envelope() {
    return this.stack().map(s => {
      let r = 0, z0 = 1e9, z1 = -1e9;
      for (const p of s.pts) { r = max(r, p[0]); z0 = min(z0, p[1]); z1 = max(z1, p[1]); }
      return { r, z0, z1, part: s.part };
    }).filter(c => c.z1 - c.z0 > 1e-6);
  }
  radiusAt(z) {
    const o = this._out || (this._out = [].concat(...this.stack().map(s => s.pts)));
    let r = 0;
    for (let i = 1; i < o.length; i++) {
      const a = o[i - 1], b = o[i], za = min(a[1], b[1]), zb = max(a[1], b[1]);
      if (z < za - 1e-9 || z > zb + 1e-9) continue;
      const v = zb - za < 1e-9 ? max(a[0], b[0]) : a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
      if (v > r) r = v;
    }
    return r;
  }
}
Tool.PARTS = PARTS;
C.Tool = Tool;

/* ---------- Z-map ---------- */
const FLAG = { CUT: 1, FLANK: 2, MARK: 4, SKIN: 8 };
class ZMap {
  constructor(o) {
    this.ox = o.ox || 0; this.oy = o.oy || 0; this.sx = o.sx; this.sy = o.sy; this.nx = o.nx | 0; this.ny = o.ny | 0;
    this.top = o.top != null ? o.top : 0; this.bottom = o.bottom != null ? o.bottom : this.top - 50;
    this.cx = this.sx / this.nx; this.cy = this.sy / this.ny; this.cell = min(this.cx, this.cy);
    const N = this.nx * this.ny;
    this.h = new Float32Array(N); this.at = new Uint8Array(N * 4);
    this.baseH = this.baseA = null; this.hmax = this.top;
    this.fx = 1; this.fy = 0; this._eng = new Uint8Array(180);
    this.reset();
  }
  setBase(src) {
    this.baseA = null;
    if (!src) { this.baseH = null; return this.reset(); }
    const b = this.baseH = new Float32Array(this.nx * this.ny);
    if (typeof src === 'function') { for (let j = 0, q = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++, q++) b[q] = src(this.xc(i), this.yc(j)); }
    else b.set(src);
    return this.reset();
  }
  saveBase() { this.baseH = this.h.slice(); this.baseA = this.at.slice(); this.removed = 0; this.collisions = 0; return this; }
  reset() {
    const h = this.h, a = this.at;
    if (this.baseH) h.set(this.baseH); else h.fill(this.top);
    if (this.baseA) a.set(this.baseA);
    else for (let i = 0; i < a.length; i += 4) { a[i] = a[i + 3] = 0; a[i + 1] = a[i + 2] = 128; }
    let m = -Infinity; for (let i = 0; i < h.length; i++) if (h[i] > m) m = h[i];
    this.hmax = m; this.removed = 0; this.collisions = 0; this.markAll(); return this;
  }
  markAll() { this.x0 = 0; this.y0 = 0; this.x1 = this.nx - 1; this.y1 = this.ny - 1; }
  clean() { this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1; this.y1 = -1; }
  isDirty() { return this.x1 >= this.x0; }
  xc(i) { return this.ox + (i + 0.5) * this.cx; }
  yc(j) { return this.oy + (j + 0.5) * this.cy; }
  ix(x) { return floor((x - this.ox) / this.cx); }
  iy(y) { return floor((y - this.oy) / this.cy); }
  heightAt(x, y) { return this.h[clamp(this.iy(y), 0, this.ny - 1) * this.nx + clamp(this.ix(x), 0, this.nx - 1)]; }
  /* barrido de la herramienta entre dos puntas (coordenadas pieza): exacto en XY a z constante; en rampas toma el mínimo
     entre la perpendicular y los extremos (pasos cortos: error despreciable) */
  sweep(T, a, b, tid, rapid) {
    return this._cap(T.R, T.k, T.rc, T.ch, a[0] - this.ox, a[1] - this.oy, a[2], b[0] - this.ox, b[1] - this.oy, b[2], tid, rapid);
  }
  stampBall(c, R, tid, c2) {
    const e = c2 || c;
    return this._cap(R, 1, R, 0, c[0] - this.ox, c[1] - this.oy, c[2] - R, e[0] - this.ox, e[1] - this.oy, e[2] - R, tid, false);
  }
  _cap(R, k, rc, ch, ax, ay, az, bx, by, bz, tid, rapid) {
    if (min(az, bz) >= this.hmax) return 0;
    const cx = this.cx, cy = this.cy, nx = this.nx, h = this.h, at = this.at;
    const i0 = max(0, floor((min(ax, bx) - R) / cx)), i1 = min(nx - 1, floor((max(ax, bx) + R) / cx));
    const j0 = max(0, floor((min(ay, by) - R) / cy)), j1 = min(this.ny - 1, floor((max(ay, by) + R) / cy));
    if (i0 > i1 || j0 > j1) return 0;
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy, R2 = R * R, a0 = R - rc, a1 = R - ch, rr = rc * rc;
    if (L2 > 1e-12) { const L = sqrt(L2); this.fx = dx / L; this.fy = dy / L; }
    const fx = this.fx, fy = this.fy, rFl = 0.85 * R, iL2 = L2 > 1e-12 ? 1 / L2 : 0;
    let vol = 0, X0 = this.x0, Y0 = this.y0, X1 = this.x1, Y1 = this.y1;
    for (let j = j0; j <= j1; j++) {
      const ey0 = (j + 0.5) * cy - ay;
      for (let i = i0; i <= i1; i++) {
        const ex0 = (i + 0.5) * cx - ax;
        let t = (ex0 * dx + ey0 * dy) * iL2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        let ex = ex0 - dx * t, ey = ey0 - dy * t, r2 = ex * ex + ey * ey;
        if (r2 > R2) continue;
        let r = sqrt(r2), zt = az + dz * t + (k === 1 ? R - sqrt(R2 - r2) : k === 2 ? (r <= a0 ? 0 : rc - sqrt(max(0, rr - (r - a0) * (r - a0)))) : r <= a1 ? 0 : r - a1);
        /* el punto más bajo de una rampa puede no estar en la perpendicular: se comprueban también los extremos */
        if (dz) for (let e = 0; e < 2; e++) {
          const qx = e ? ex0 - dx : ex0, qy = e ? ey0 - dy : ey0, q2 = qx * qx + qy * qy;
          if (q2 > R2) continue;
          const qr = sqrt(q2), z = (e ? bz : az) + (k === 1 ? R - sqrt(R2 - q2) : k === 2 ? (qr <= a0 ? 0 : rc - sqrt(max(0, rr - (qr - a0) * (qr - a0)))) : qr <= a1 ? 0 : qr - a1);
          if (z < zt) { zt = z; ex = qx; ey = qy; r = qr; }
        }
        const q = j * nx + i, ho = h[q];
        if (zt >= ho - 1e-5) continue;
        h[q] = zt; const d = ho - zt, w = q * 4; vol += d;
        at[w + 3] |= 1;
        if (d > 0.01) at[w] = tid;
        if (d > 0.05) {
          /* dirección de la marca: bola y flanco siguen el avance; el fondo de plana y tórica, el arco que deja el borde
             delantero del diente (tangente al círculo de radio R en el desplazamiento lateral s) */
          let tx = fx, ty = fy;
          if (k !== 1 && r < rFl) { const s = (ex * -fy + ey * fx) / R, c = sqrt(max(0, 1 - s * s)); tx = -s * fx - c * fy; ty = -s * fy + c * fx; at[w + 3] &= ~2; }
          else at[w + 3] |= 2;
          at[w + 1] = round((tx * tx - ty * ty + 1) * 127.5); at[w + 2] = round((2 * tx * ty + 1) * 127.5); at[w + 3] |= 4;
        }
        if (i < X0) X0 = i; if (i > X1) X1 = i; if (j < Y0) Y0 = j; if (j > Y1) Y1 = j;
      }
    }
    this.x0 = X0; this.y0 = Y0; this.x1 = X1; this.y1 = Y1;
    vol *= cx * cy; this.removed += vol;
    if (rapid && vol > 0.001) this.collisions++;
    return vol;
  }
  drop(T, x, y, model) {
    const m = model || this.h, R = T.R, cx = this.cx, cy = this.cy, nx = this.nx, lx = x - this.ox, ly = y - this.oy;
    const i0 = max(0, floor((lx - R) / cx)), i1 = min(nx - 1, floor((lx + R) / cx)), j0 = max(0, floor((ly - R) / cy)), j1 = min(this.ny - 1, floor((ly + R) / cy));
    let z = -1e9;
    for (let j = j0; j <= j1; j++) {
      const ey = (j + 0.5) * cy - ly;
      for (let i = i0; i <= i1; i++) {
        const ex = (i + 0.5) * cx - lx, r2 = ex * ex + ey * ey;
        if (r2 <= R * R) { const v = m[j * nx + i] - T.prof(sqrt(r2)); if (v > z) z = v; }
      }
    }
    return z;
  }
  /* arco de contacto tras estampar el paso: mayor arco contiguo con material (grados) y sus extremos en XY (rad, antihorario
     de a0 a a1). Solo cuenta el semicírculo delantero respecto al avance (dir, o el del último barrido): detrás queda la
     pared que acaba de dejar el propio flanco y a R + 0.6·celda se leería como material (+9° con celdas de 0.1, +16° con 0.39) */
  engagement(T, tip, out, dir) {
    out = out || { deg: 0, a0: 0, a1: 0 };
    const N = 180, m = this._eng, r = T.R + 0.6 * this.cell, zt = tip[2] + 0.05, nx = this.nx, ny = this.ny, fx = dir ? dir[0] : this.fx, fy = dir ? dir[1] : this.fy;
    let n = 0;
    for (let k = 0; k < N; k++) {
      const a = k * TAU / N, c = cos(a), s = sin(a), i = floor((tip[0] + r * c - this.ox) / this.cx), j = floor((tip[1] + r * s - this.oy) / this.cy);
      n += m[k] = c * fx + s * fy > -1e-9 && i >= 0 && j >= 0 && i < nx && j < ny && this.h[j * nx + i] > zt ? 1 : 0;
    }
    if (n === 0 || n === N) { out.deg = n ? 360 : 0; out.a0 = 0; out.a1 = n ? TAU : 0; return out; }
    let s = 0; while (m[s]) s++;
    let best = 0, bs = 0, run = 0, rs = 0;
    for (let q = 1; q <= N; q++) {
      const k = (s + q) % N;
      if (m[k]) { if (!run) rs = k; if (++run > best) { best = run; bs = rs; } } else run = 0;
    }
    out.deg = best * 360 / N; out.a0 = (bs - 0.5) * TAU / N; out.a1 = out.a0 + best * TAU / N;
    return out;
  }
  /* sobre la normal: -1 gouge · 0 en tolerancia · 1 exceso · 2 fuera de la comparación (nunca cortada y ya igual al
     modelo: caras en bruto) */
  classify(model, tolIn = 0.02, tolOut = 0.05, out, dev) {
    const nx = this.nx, ny = this.ny, h = this.h, at = this.at, o = out || new Int8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = j * nx + i;
      if (!(at[q * 4 + 3] & 1) && h[q] <= model[q] + 1e-6) { o[q] = 2; continue; }
      const gx = (h[q + (i < nx - 1 ? 1 : 0)] - h[q - (i > 0 ? 1 : 0)]) / ((i > 0 && i < nx - 1 ? 2 : 1) * this.cx);
      const gy = (h[q + (j < ny - 1 ? nx : 0)] - h[q - (j > 0 ? nx : 0)]) / ((j > 0 && j < ny - 1 ? 2 : 1) * this.cy);
      const d = (h[q] - model[q]) / sqrt(1 + gx * gx + gy * gy);
      if (dev) dev[q] = d;
      o[q] = d < -tolIn ? -1 : d > tolOut ? 1 : 0;
    }
    return o;
  }
  deviation(model, tolIn = 0.02, tolOut = 0.05) {
    const d = this._dev || (this._dev = new Float32Array(this.nx * this.ny)), c = this.classify(model, tolIn, tolOut, this._cls || (this._cls = new Int8Array(d.length)), d);
    let n = 0, ok = 0, g = 0, e = 0, maxG = 0, maxE = 0;
    for (let q = 0; q < c.length; q++) {
      const v = c[q]; if (v === 2) continue; n++;
      if (!v) ok++; else if (v < 0) { g++; maxG = min(maxG, d[q]); } else { e++; maxE = max(maxE, d[q]); }
    }
    const pc = v => n ? +(100 * v / n).toFixed(3) : 0;
    return { cells: n, okPct: pc(ok), gougePct: pc(g), excessPct: pc(e), maxGouge: +maxG.toFixed(4), maxExcess: +maxE.toFixed(4) };
  }
  snapshot() {
    const N = this.nx * this.ny, buf = new ArrayBuffer(16 + N * 8);
    new Float64Array(buf, 0, 2).set([this.removed, this.collisions]);
    new Float32Array(buf, 16, N).set(this.h); new Uint8Array(buf, 16 + N * 4, N * 4).set(this.at);
    return buf;
  }
  restore(buf) {
    const N = this.nx * this.ny, s = new Float64Array(buf, 0, 2);
    this.removed = s[0]; this.collisions = s[1];
    this.h.set(new Float32Array(buf, 16, N)); this.at.set(new Uint8Array(buf, 16 + N * 4, N * 4)); this.markAll(); return this;
  }
}
ZMap.FLAG = FLAG;
C.ZMap = ZMap;

/* ---------- regiones: campos de distancia con signo 2D (negativo dentro), en mm ---------- */
const box = (qx, qy) => hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0);
const Region = C.Region = {
  circle: (cx, cy, r) => (x, y) => hypot(x - cx, y - cy) - r,
  rect: (x0, y0, x1, y1) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = abs(x1 - x0) / 2, hy = abs(y1 - y0) / 2; return (x, y) => box(abs(x - cx) - hx, abs(y - cy) - hy); },
  rrect: (cx, cy, w, h, r) => { const hx = w / 2 - r, hy = h / 2 - r; return (x, y) => box(abs(x - cx) - hx, abs(y - cy) - hy) - r; },
  union: (...f) => (x, y) => { let d = Infinity; for (let i = 0; i < f.length; i++) d = min(d, f[i](x, y)); return d; },
  intersect: (...f) => (x, y) => { let d = -Infinity; for (let i = 0; i < f.length; i++) d = max(d, f[i](x, y)); return d; },
  subtract: (a, b) => (x, y) => max(a(x, y), -b(x, y)),
  /* d > 0 crece la región */
  offset: (f, d) => (x, y) => f(x, y) - d,
  grid(sdf, bbox, cell) {
    const x0 = bbox[0], y0 = bbox[1], nx = round((bbox[2] - x0) / cell) + 1, ny = round((bbox[3] - y0) / cell) + 1, f = new Float32Array(nx * ny);
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) f[q] = sdf(x0 + i * cell, y0 + j * cell);
    const at = (x, y) => {
      const u = clamp((x - x0) / cell, 0, nx - 1.000001), v = clamp((y - y0) / cell, 0, ny - 1.000001), i = u | 0, j = v | 0, fu = u - i, fv = v - j, q = j * nx + i;
      return (f[q] * (1 - fu) + f[q + 1] * fu) * (1 - fv) + (f[q + nx] * (1 - fu) + f[q + nx + 1] * fu) * fv;
    };
    return { f, nx, ny, x0, y0, cell, at };
  }
};

/* ---------- constructor de trayectorias ----------
   Cada punto describe el movimiento que TERMINA en él: tipo (0 G0 · 1 corte · 2 entrada · 3 salida · 4 enlace),
   F programado (0 = el de la herramienta según el tipo) y bloque NC. El primer punto es el de partida. */
class PathBuilder {
  constructor(o) {
    o = o || {};
    this.ds = o.ds || 0.5; this.safeZ = o.safeZ != null ? o.safeZ : 5;
    this.p = []; this.f = []; this.b = []; this.blocks = []; this.ax = this.ro = this.dw = null; this.n = 0;
    this._axis = [0, 0, 1]; this._rot = null;
  }
  get x() { return this.p[this.p.length - 4]; }
  get y() { return this.p[this.p.length - 3]; }
  get z() { return this.p[this.p.length - 2]; }
  last() { return this.n ? [this.x, this.y, this.z] : null; }
  _blk(b) { return this.blocks.push(b) - 1; }
  lastBlock() { return this.blocks.length - 1; }
  _pt(x, y, z, t, F, bi, o) {
    if (o) {
      if (o.i != null) { const l = hypot(o.i, o.j, o.k) || 1; this._axis = [o.i / l, o.j / l, o.k / l]; this.ax = this.ax || []; }
      if (o.a != null || o.b != null || o.c != null) { this._rot = { a: o.a, b: o.b, c: o.c }; this.ro = this.ro || []; }
    }
    const n = this.n;
    this.p.push(x, y, z, t); this.f.push(F > 0 ? F : 0); this.b.push(bi);
    if (this.ax) { while (this.ax.length < n * 3) this.ax.push(0, 0, 1); this.ax.push(...this._axis); }
    if (this.ro) { while (this.ro.length < n) this.ro.push(null); this.ro.push(this._rot); }
    this.n++;
    return this;
  }
  rapid(x, y, z, o) { return this._pt(x, y, z, 0, 0, o && o.blk != null ? o.blk : this._blk({ g: 'G0', x, y, z })); }
  feed(x, y, z, type = 1, F, o) {
    if (o && o.blk != null) return this._pt(x, y, z, type, F, o.blk, o);
    const blk = { g: 'G1', x, y, z }; if (F > 0) blk.f = F;
    if (o) { if (o.a != null) blk.a = o.a; if (o.b != null) blk.b = o.b; if (o.c != null) blk.c = o.c; }
    return this._pt(x, y, z, type, F, this._blk(blk), o);
  }
  /* al mismo punto, vuelta completa */
  arc(cx, cy, x, y, z, cw, type = 1, F) {
    let da = atan2(y - cy, x - cx) - atan2(this.y - cy, this.x - cx);
    if (cw) { while (da >= -1e-9) da -= TAU; } else { while (da <= 1e-9) da += TAU; }
    return this.arcTo(cx, cy, x, y, z, cw, type, F, abs(da));
  }
  arcTo(cx, cy, x, y, z, cw, type = 1, F, sweep) {
    const x0 = this.x, y0 = this.y, z0 = this.z, r0 = hypot(x0 - cx, y0 - cy), r1 = hypot(x - cx, y - cy), a0 = atan2(y0 - cy, x0 - cx), da = (cw ? -1 : 1) * sweep;
    const blk = { g: cw ? 'G2' : 'G3', x, y, z, i: cx - x0, j: cy - y0, cx, cy }; if (F > 0) blk.f = F;
    const bi = this._blk(blk), n = max(2, ceil(sweep * max(r0, r1) / this.ds));
    for (let k = 1; k < n; k++) { const u = k / n, a = a0 + da * u, r = r0 + (r1 - r0) * u; this._pt(cx + r * cos(a), cy + r * sin(a), z0 + (z - z0) * u, type, F, bi); }
    return this._pt(x, y, z, type, F, bi);
  }
  helix(cx, cy, r, z0, z1, pitch, cw, F) {
    if (!this.n) this.feed(cx + r, cy, z0, 2, F);
    const a0 = atan2(this.y - cy, this.x - cx);
    if (abs(hypot(this.x - cx, this.y - cy) - r) > 1e-3) this.feed(cx + r * cos(a0), cy + r * sin(a0), this.z, 2, F);
    if (abs(this.z - z0) > 1e-6) this.feed(this.x, this.y, z0, 2, F);
    const turns = abs(z0 - z1) / pitch, sg = cw ? -1 : 1, nb = ceil(turns - 1e-9);
    for (let b = 1; b <= nb; b++) {
      const tb = min(b, turns), a = a0 + sg * tb * TAU;
      this.arcTo(cx, cy, cx + r * cos(a), cy + r * sin(a), z0 + (z1 - z0) * tb / turns, cw, 2, F, (tb - b + 1) * TAU);
    }
    return this;
  }
  poly(pts, z, type = 1, F) { for (let k = 0; k + 1 < pts.length; k += 2) this.feed(pts[k], pts[k + 1], z, type, F); return this; }
  poly3(pts, type = 1, F) { for (let k = 0; k + 2 < pts.length; k += 3) this.feed(pts[k], pts[k + 1], pts[k + 2], type, F); return this; }
  tc(num, text) { this._blk({ g: 'TC', t: num, text }); return this; }
  m(code, dur) { const bi = this._blk({ g: 'M', text: code }); if (dur > 0) this.dwell(dur, bi); return this; }
  cycle(text, dur) { const bi = this._blk({ g: 'CYCLE', text }); if (dur > 0) this.dwell(dur, bi); return this; }
  comment(text) { this._blk({ g: 'TXT', text: '(' + C.util.ncText(text) + ')' }); return this; }
  dwell(sec, bi) {
    if (!this.n) return this;
    this.dw = this.dw || [];
    while (this.dw.length < this.n) this.dw.push(0);
    this._pt(this.x, this.y, this.z, this.p[this.p.length - 1], 0, bi != null ? bi : this.b[this.n - 1]);
    this.dw.push(sec);
    return this;
  }
  append(part, o) {
    o = o || {};
    if (!part || !part.n) return this;
    const P = part.p, sx = P[0], sy = P[1], sz = P[2], F = o.F, skip = this.n ? 1 : 0;
    if (skip) {
      const link = o.link || 'retract';
      if (link === 'direct') this.feed(sx, sy, sz, o.type != null ? o.type : 4, F);
      else if (link === 'lift') {
        const zl = max(this.z, sz) + (o.liftZ != null ? o.liftZ : 0.3);
        this.feed(this.x, this.y, zl, 4, F).feed(sx, sy, zl, 4, F).feed(sx, sy, sz, 4, F);
      } else {
        const zs = o.safeZ != null ? o.safeZ : this.safeZ, zt = max(this.z, sz);
        if (sz >= zs) this.rapid(this.x, this.y, zt).rapid(sx, sy, zt).rapid(sx, sy, sz);
        else { if (this.z < zs) this.rapid(this.x, this.y, zs); this.rapid(sx, sy, zs).feed(sx, sy, sz, 2, F); }
      }
    }
    const off = this.blocks.length;
    for (const b of part.blocks) this.blocks.push(Object.assign({}, b));
    for (let k = skip; k < part.n; k++) {
      const q = k * 4, o2 = part.ax || part.ro ? {} : null;
      if (part.ax) { o2.i = part.ax[k * 3]; o2.j = part.ax[k * 3 + 1]; o2.k = part.ax[k * 3 + 2]; }
      if (part.ro && part.ro[k]) Object.assign(o2, part.ro[k]);
      this._pt(P[q], P[q + 1], P[q + 2], P[q + 3], part.f[k], part.b[k] + off, o2);
      if (part.dw && part.dw[k]) { this.dw = this.dw || []; while (this.dw.length < this.n - 1) this.dw.push(0); this.dw.push(part.dw[k]); }
    }
    return this;
  }
  build() {
    const n = this.n, pts = new Float32Array(this.p), dist = new Float32Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) { const q = i * 4, dx = pts[q] - pts[q - 4], dy = pts[q + 1] - pts[q - 3], dz = pts[q + 2] - pts[q - 2]; dist[i] = acc += sqrt(dx * dx + dy * dy + dz * dz); }
    const path = { pts, n, dist, len: acc, blocks: this.blocks, blockOf: new Uint32Array(this.b), F: new Float32Array(this.f) };
    if (this.ax) { const a = this.ax.slice(); while (a.length < n * 3) a.push(0, 0, 1); path.axis = new Float32Array(a); }
    if (this.ro) {
      path.rot = {};
      for (const key of ['a', 'b', 'c']) {
        if (!this.ro.some(r => r && r[key] != null)) continue;
        const arr = path.rot[key.toUpperCase()] = new Float32Array(n); let v = 0;
        for (let i = 0; i < n; i++) { const r = this.ro[i]; if (r && r[key] != null) v = r[key]; arr[i] = v; }
      }
    }
    if (this.dw) { const d = path.dwell = new Float32Array(n); d.set(this.dw.slice(0, n)); }
    return path;
  }
}
C.PathBuilder = PathBuilder;

/* ---------- NC (Anexo A): salida modal por dialecto ---------- */
const NC = C.NC = (function () {
  const MOT = { G0: 'G00', G1: 'G01', G2: 'G02', G3: 'G03' };
  /* ISO: hasta 3 decimales sin ceros sobrantes y entero con punto (X35.); conversacional: signo y sin punto final */
  const iso = (v, d = 3) => { const k = Math.pow(10, d); let r = round(v * k) / k; if (abs(r) < 0.5 / k) r = 0; return d ? r.toFixed(d).replace(/0+$/, '') : r.toFixed(0) + '.'; };
  const tnc = (v, d = 3) => { const s = iso(v, d).replace(/\.$/, ''); return s[0] === '-' ? s : '+' + s; };
  const state = (dialect, o) => Object.assign({ d: dialect, n: 0, step: dialect === 'iso-lathe' ? 10 : 1, num: dialect === 'iso-mill' || dialect === 'iso-lathe', g: null, f: null, x: null, y: null, z: null, a: null, b: null, c: null, cc: null, r0: false }, o);
  const reset = st => { st.g = st.f = st.x = st.y = st.z = st.a = st.b = st.c = st.cc = null; st.r0 = false; };
  const coords = (b, st, keys, fm) => {
    const w = [];
    for (const k of keys) if (b[k] != null) { const s = fm(b[k]); if (st[k] !== s) { w.push(k.toUpperCase() + s); st[k] = s; } }
    return w;
  };
  const feed = (w, st, f) => { if (st.f !== f) { w.push('F' + f); st.f = f; } };
  function isoLine(b, st, d, fd) {
    const w = b.pre ? [b.pre] : [], g = b.g, f0 = b.f != null ? b.f : fd;
    if (MOT[g]) {
      const cw = coords(b, st, d === 'iso-lathe' ? ['x', 'z'] : ['x', 'y', 'z', 'a', 'b', 'c'], iso), arc = g === 'G2' || g === 'G3', moves = cw.length || arc;
      if (st.g !== MOT[g] && moves) { w.push(MOT[g]); st.g = MOT[g]; }
      w.push(...cw);
      if (arc) { if (b.r != null) w.push('R' + iso(b.r)); else for (const k of ['i', 'j', 'k']) if (b[k] != null) w.push(k.toUpperCase() + iso(b[k])); }
      if (g !== 'G0' && f0 != null && moves) feed(w, st, d === 'iso-lathe' ? iso(f0, 2) : iso(f0, 0));
    } else if (g === 'TC') {
      reset(st);
      if (d === 'iso-lathe') return 'T' + pad2(b.t) + pad2(b.t);
      w.push('T' + b.t, 'M06'); if (b.text) w.push('(' + C.util.ncText(b.text) + ')');
      return w.join(' ');
    } else if (b.text) w.push(b.text);
    if (b.s != null) w.push('S' + round(b.s));
    if (b.m) w.push(b.m);
    if (b.cm) w.push('(' + C.util.ncText(b.cm) + ')');
    return w.join(' ');
  }
  function tncLine(b, st, fd) {
    const g = b.g, f0 = b.f != null ? b.f : fd, fs = () => iso(f0, 0).replace(/\.$/, '');
    if (g === 'G0' || g === 'G1') {
      const w = coords(b, st, ['x', 'y', 'z', 'a', 'b', 'c'], tnc);
      if (!w.length && !b.m) return '';
      w.unshift('L');
      if (!st.r0) { w.push('R0'); st.r0 = true; }
      if (g === 'G0') { w.push('FMAX'); st.f = null; } else if (f0 != null) feed(w, st, fs());
      if (b.m) w.push(b.m);
      return w.join(' ');
    }
    if (g === 'G2' || g === 'G3') {
      const out = [];
      if (b.cx != null) { const cc = 'CC X' + tnc(b.cx) + ' Y' + tnc(b.cy); if (st.cc !== cc) { out.push(cc); st.cc = cc; } }
      const w = ['C', ...coords(b, st, ['x', 'y', 'z'], tnc), g === 'G2' ? 'DR-' : 'DR+'];
      if (f0 != null) feed(w, st, fs());
      out.push(w.join(' ')); return out.join('\n');
    }
    if (g === 'TC') { reset(st); return 'TOOL CALL ' + b.t + ' Z' + (b.s != null ? ' S' + round(b.s) : '') + (b.f != null ? ' F' + round(b.f) : ''); }
    return b.text || '';
  }
  return {
    iso, tnc, state,
    format(b, dialect, st, fd) {
      st = st || state(dialect);
      if (b.g === 'TXT') return b.text || '';
      const line = dialect === 'tnc' ? tncLine(b, st, fd) : isoLine(b, st, dialect, fd);
      if (!line || !st.num) return line;
      st.n += st.step; if (st.n > 99999) st.n = st.step;
      return 'N' + st.n + ' ' + line;
    },
    header(dialect, meta) {
      meta = meta || {};
      const t = meta.title ? ' (' + C.util.ncText(meta.title) + ')' : '';
      if (dialect === 'iso-mill') return ['O' + (meta.O || 1001) + t, 'G21 G90 G17 G40 G49 G80 G94'];
      if (dialect === 'iso-lathe') return ['O' + (meta.O || 2001) + t, 'G21 G18 G40 G99'];
      if (dialect === 'tnc') return ['CYCL DEF 32.0 TOLERANCIA', 'CYCL DEF 32.1 T' + iso(meta.tol || 0.01).replace(/\.$/, '')];
      return ['G90 G92 X' + iso(meta.x || 0) + ' Y' + iso(meta.y || 0)];
    }
  };
})();

/* ---------- cinemática de ejes rotativos ---------- */
C.kin = {
  /* cabezal B/C: B = inclinación respecto a Z, C = azimut del eje (con avance en X e inclinación hacia +Y, C ≈ +90) */
  bc(t, prevC) { let c = hypot(t[0], t[1]) < 1e-9 ? prevC || 0 : atan2(t[1], t[0]) * DEG; if (prevC != null) c = C.kin.unwrap(prevC, c); return { B: acos(clamp(t[2], -1, 1)) * DEG, C: c }; },
  /* mesa A/C: R_A(A)·R_C(C)·t = +Z con R_C antihorario sobre Z y R_A sobre X */
  ac(t, prevC) { const rho = hypot(t[0], t[1]); let c = rho < 1e-9 ? prevC || 0 : atan2(t[0], t[1]) * DEG; if (prevC != null) c = C.kin.unwrap(prevC, c); return { A: atan2(rho, t[2]) * DEG, C: c }; },
  unwrap: (prev, a) => a + 360 * round((prev - a) / 360)
};

/* ---------- programa: tiempo de máquina, cinemática y estampado ----------
   Une las operaciones en una línea de tiempo de puntos; el segmento i va del punto i-1 al i. */
const PHASE = ['rapid', 'cut', 'approach', 'link', 'tc', 'end'], PH_OF = [0, 1, 2, 2, 3];
class Program {
  constructor(o) {
    this.machine = Object.assign({ rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200, tol: 0.01, start: 'change', kin: 'bc' }, o.machine);
    this.zmap = o.zmap || null; this.ops = o.ops; this.sim = o.sim || 1;
    this.nc = o.nc || null; this.dialect = (this.nc && this.nc.dialect) || 'iso-mill';
    this.st = { pos: [0, 0, 0], axis: null, rot: null, op: 0, tool: null, toolId: 0, type: 0, block: 0, feed: 0, S: 0, phase: 'rapid', progress: 0, dir: [1, 0], dist: 0, k: 0 };
    this._build();
    this.visualDuration = this.duration / this.sim;
    this.reset();
  }
  get collisions() { return this.zmap ? this.zmap.collisions : 0; }
  get removed() { return this.zmap ? this.zmap.removed : 0; }
  _build() {
    const m = this.machine, ops = this.ops, d = this.dialect, mill = d === 'iso-mill', tncD = d === 'tnc', A = m.accel * 1000, ramp = m.spindleRamp;
    /* nc.auto === false: la escena escribe todos sus bloques (cabecera, cambio, posicionado y fin) en sus trayectorias */
    const auto = !(this.nc && this.nc.auto === false);
    let cap = 16; for (const op of ops) cap += op.path.n + 12;
    const X = new Float64Array(cap), Y = new Float64Array(cap), Z = new Float64Array(cap), FP = new Float64Array(cap), DW = new Float64Array(cap), PD = new Float64Array(cap);
    const TY = new Uint8Array(cap), PH = new Uint8Array(cap), OP = new Uint16Array(cap), BK = new Uint32Array(cap), PK = new Int32Array(cap), SP = new Uint8Array(cap);
    const five = ops.some(op => op.path.axis), AX = five ? new Float32Array(cap * 3) : null, rk = new Set();
    for (const op of ops) if (op.path.rot) for (const k in op.path.rot) rk.add(k);
    if (m.rotary && five && !rk.size) for (const k in m.rotary) rk.add(k);
    const R = [...rk].map(k => ({ k, v: new Float64Array(cap), w: m.rotary && m.rotary[k] ? m.rotary[k] * 6 : 0 })), rot = {}, ax = [0, 0, 1];
    for (const r of R) rot[r.k] = 0;
    const blocks = this.blocks = [], bf = this.bf = [], rb = this.rb = [], spin = [], evp = [], waits = [];
    let n = 0, pd = 0, pk = 0;
    const blk = b => blocks.push(b) - 1;
    const push = (x, y, z, ty, ph, F, dw, op, bk) => {
      X[n] = x; Y[n] = y; Z[n] = z; TY[n] = ty; PH[n] = ph; FP[n] = F; DW[n] = dw; OP[n] = op; BK[n] = bk; PD[n] = pd; PK[n] = pk;
      if (AX) { AX[n * 3] = ax[0]; AX[n * 3 + 1] = ax[1]; AX[n * 3 + 2] = ax[2]; }
      for (const r of R) r.v[n] = rot[r.k];
      return n++;
    };
    const kinRot = () => { const r = m.kin === 'ac' ? C.kin.ac(ax, rot.C) : C.kin.bc(ax, rot.C); for (const q of R) if (r[q.k] != null) rot[q.k] = r[q.k]; };
    /* secuencias de seguridad del Anexo A: antes de M06 y de M30 */
    const stopBlocks = () => mill ? [blk({ g: 'CYCLE', text: 'G05.1 Q0' }), blk({ g: 'M', text: 'M09' }), blk({ g: 'M', text: 'M05' })] : d === 'iso-lathe' ? [blk({ g: 'M', text: 'M09' }), blk({ g: 'M', text: 'M05' })] : [];
    if (this.nc && auto) NC.header(d, this.nc).forEach((s, k) => blk({ g: k ? 'CYCLE' : 'TXT', text: s }));
    this.opStart = []; let prevT = null, prevS = 0, m128 = false;
    ops.forEach((op, k) => {
      const P = op.path, T = op.tool, cut = T.cut, S = op.S || cut.S || 0, p0 = [P.pts[0], P.pts[1], P.pts[2]], tc = k === 0 || T !== prevT, sb = P.blockOf[0];
      if (op.toolId == null) op.toolId = T.num;
      const fdef = ty => ty === 4 ? cut.Flink || 8000 : ty === 2 || ty === 3 ? cut.Fentry || 0.5 * (cut.F || 1000) : cut.F || 1000;
      const orient = () => {
        if (P.axis) { ax[0] = P.axis[0]; ax[1] = P.axis[1]; ax[2] = P.axis[2]; }
        if (P.rot) { for (const key in P.rot) rot[key] = P.rot[key][0]; } else if (m.rotary && P.axis) kinRot();
      };
      let down = -1;
      if (tc) {
        let up = -1;
        if (k > 0) {
          if (auto && tncD) up = blk({ g: 'G0', z: m.zChange, m: m128 ? 'M129' : '' }); else if (auto) stopBlocks();
          m128 = false;
          spin.push({ i: n - 1, s0: prevS, s1: 0, dur: ramp });
        }
        const tcB = auto ? blk({ g: 'TC', t: T.num, text: T.name, s: S, f: cut.F }) : blocks.length + sb;
        if (k > 0) {
          /* en ISO la subida al punto de cambio la hace la macro de M06 */
          push(X[n - 1], Y[n - 1], m.zChange, 0, 4, m.rapid, 0, k - 1, up < 0 ? tcB : up);
          evp.push({ i: push(X[n - 1], Y[n - 1], m.zChange, 0, 4, 0, m.tcTime / 2, k - 1, tcB), kind: 'tc', op: k });
          orient(); pd = pk = 0;
          push(X[n - 1], Y[n - 1], m.zChange, 0, 4, 0, m.tcTime / 2, k, tcB);
        } else { orient(); push(p0[0], p0[1], m.start === 'p0' ? p0[2] : m.zChange, 0, 4, 0, 0, k, tcB); }
        let posB = tcB;
        if (auto) {
          const H = pad2(T.num), pos = { g: 'G0', x: p0[0], y: p0[1] }, dn = { g: 'G0', z: p0[2] };
          if (tncD) pos.m = 'M3';
          else { pos.s = S; pos.m = 'M03'; dn.m = 'M08'; if (mill) { pos.pre = 'G54'; dn.pre = (P.axis || op.tcp ? 'G43.4 H' : 'G43 H') + H; } }
          posB = blk(pos); down = blk(dn);
        }
        const i0 = n - 1, dxy = hypot(X[i0] - p0[0], Y[i0] - p0[1]), dzz = abs(Z[i0] - p0[2]);
        spin.push({ i: i0, s0: 0, s1: S, dur: ramp });
        /* espera del husillo: se fija tras la cinemática, con el tiempo real del reposicionamiento */
        const w = { w: push(X[i0], Y[i0], Z[i0], 0, 4, 0, 0, k, posB), s: 0 };
        if (dxy > 1e-6) push(p0[0], p0[1], Z[i0], 0, 0, m.rapid, 0, k, posB);
        if (dzz > 1e-6) push(p0[0], p0[1], p0[2], 0, 0, m.rapid, 0, k, auto ? down : posB);
        /* G43 H.. Z.. M08 lleva función M: la máquina se detiene ahí */
        SP[w.s = n - 1] = 1; waits.push(w);
        if (auto && tncD && P.axis) { blk({ g: 'M', text: 'M128' }); m128 = true; } else if (auto && mill) blk({ g: 'CYCLE', text: 'G05.1 Q1' });
      } else {
        orient(); pd = pk = 0;
        if (S !== prevS) spin.push({ i: n - 1, s0: prevS, s1: S, dur: ramp * abs(S - prevS) / max(S, prevS) });
      }
      /* con cambio, el G0 inicial de la trayectoria lo sustituye el bloque de bajada (G43 H.. Z.. M08) */
      const off = blocks.length, drop = auto && tc && P.blocks[sb] && P.blocks[sb].g === 'G0';
      for (let b = 0; b < P.blocks.length; b++) if (!(drop && b === sb)) blocks.push(P.blocks[b]);
      const map = b => !drop ? off + b : b === sb ? down : off + b - (b > sb ? 1 : 0);
      if (!tc) {
        const cx = X[n - 1], cy = Y[n - 1], cz = Z[n - 1], zs = max(cz, p0[2]), bk = map(sb);
        if (zs > cz + 1e-6) push(cx, cy, zs, 0, 0, m.rapid, 0, k, bk);
        if (hypot(cx - p0[0], cy - p0[1]) > 1e-6) push(p0[0], p0[1], zs, 0, 0, m.rapid, 0, k, bk);
        if (zs > p0[2] + 1e-6) push(p0[0], p0[1], p0[2], 0, 0, m.rapid, 0, k, bk);
      }
      this.opStart[k] = n - 1;
      evp.push({ i: n - 1, kind: 'op', op: k });
      for (let i = 1; i < P.n; i++) {
        const q = i * 4, ty = P.pts[q + 3], F = ty === 0 ? m.rapid : P.F[i] > 0 ? P.F[i] : fdef(ty), b = map(P.blockOf[i]);
        if (ty && bf[b] === undefined) bf[b] = F;
        if (P.axis) { ax[0] = P.axis[i * 3]; ax[1] = P.axis[i * 3 + 1]; ax[2] = P.axis[i * 3 + 2]; }
        if (P.rot) { for (const key in P.rot) rot[key] = P.rot[key][i]; }
        else if (m.rotary && P.axis) {
          /* los ejes rotativos que resuelve la cinemática también salen en el listado NC del bloque */
          kinRot(); const o = rb[b] = {}; for (const q of R) o[q.k.toLowerCase()] = rot[q.k];
        }
        pd = P.dist[i]; pk = i;
        push(P.pts[q], P.pts[q + 1], P.pts[q + 2], ty, PH_OF[ty] || 0, F, P.dwell ? P.dwell[i] : 0, k, b);
      }
      prevT = T; prevS = S;
    });
    const endB = !auto ? [] : tncD ? (m128 ? [blk({ g: 'M', text: 'M129' })] : []) : stopBlocks();
    this.endBlock = auto ? blk({ g: 'M', text: 'M30' }) : blocks.length - 1;
    spin.push({ i: n - 1, s0: prevS, s1: 0, dur: ramp });
    push(X[n - 1], Y[n - 1], Z[n - 1], 0, 5, 0, ramp, ops.length - 1, endB.length ? endB[endB.length - 1] : this.endBlock);
    this._kin(n, X, Y, Z, FP, DW, TY, PH, OP, SP, R, waits);
    const TE = this.TE, sub = a => a.subarray(0, n);
    Object.assign(this, { X: sub(X), Y: sub(Y), Z: sub(Z), TY: sub(TY), PH: sub(PH), OP: sub(OP), BK: sub(BK), PD: sub(PD), PK: sub(PK) });
    this.AX = AX ? AX.subarray(0, n * 3) : null;
    this.ROT = R.length ? R.map(r => ({ k: r.k, v: sub(r.v) })) : null;
    this.spin = spin.map(s => ({ t0: TE[s.i], t1: TE[s.i] + s.dur, s0: s.s0, s1: s.s1 }));
    this.events = evp.map(e => ({ t: TE[e.i], kind: e.kind, op: e.op })).concat([{ t: this.duration, kind: 'end', op: ops.length - 1 }]);
    if (this.ROT) this.st.rot = {};
    if (this.AX) this.st.axis = [0, 0, 1];
  }
  _kin(n, X, Y, Z, FP, DW, TY, PH, OP, SP, R, waits) {
    const m = this.machine, A = this.A = m.accel * 1000, ramp = m.spindleRamp;
    const L = new Float64Array(n), VC = new Float64Array(n), V = new Float64Array(n), TE = new Float64Array(n), RC = new Float64Array(n).fill(Infinity), dwl = DW.subarray(0, n);
    for (let i = 1; i < n; i++) {
      const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1], dz = Z[i] - Z[i - 1];
      L[i] = sqrt(dx * dx + dy * dy + dz * dz);
      VC[i] = max(1e-3, min(FP[i] || m.rapid, m.rapid) / 60);
      /* ejes rotativos: el tramo dura al menos lo que tarda cada eje a su velocidad máxima (F ≤ ω·r_eff) */
      for (const r of R) {
        const da = r.w ? abs(r.v[i] - r.v[i - 1]) : 0;
        if (da < 1e-9) continue;
        if (L[i] > 1e-9) VC[i] = min(VC[i], r.w * L[i] / da); else dwl[i] = max(dwl[i], da / r.w);
      }
    }
    for (let i = 1; i < n - 1; i++) {
      if (L[i] < 1e-9 || L[i + 1] < 1e-9) continue;
      const ax = X[i] - X[i - 1], ay = Y[i] - Y[i - 1], az = Z[i] - Z[i - 1], bx = X[i + 1] - X[i - 1], by = Y[i + 1] - Y[i - 1], bz = Z[i + 1] - Z[i - 1];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx, ar = sqrt(cx * cx + cy * cy + cz * cz);
      if (ar > 1e-12) RC[i] = L[i] * L[i + 1] * sqrt(bx * bx + by * by + bz * bz) / (2 * ar);
    }
    for (let i = 1; i < n; i++) {
      const rc = min(RC[i - 1], RC[i]);
      if (L[i] < 0.5 * rc && rc < Infinity) VC[i] = min(VC[i], sqrt(A * rc));
    }
    for (let i = 1; i < n - 1; i++) {
      if (SP[i] || dwl[i] > 0 || dwl[i + 1] > 0 || L[i] < 1e-9 || L[i + 1] < 1e-9 || OP[i] !== OP[i + 1] || !TY[i] !== !TY[i + 1] || PH[i] === 4 || PH[i + 1] === 4) continue;
      /* esquina: velocidad que respeta la tolerancia de contorno (desviación del redondeo) y √(a·r) */
      const c = ((X[i] - X[i - 1]) * (X[i + 1] - X[i]) + (Y[i] - Y[i - 1]) * (Y[i + 1] - Y[i]) + (Z[i] - Z[i - 1]) * (Z[i + 1] - Z[i])) / (L[i] * L[i + 1]);
      const ch = sqrt(max(0, (1 + clamp(c, -1, 1)) / 2)), req = ch < 1e-9 ? 0 : 1 / ch - 1 < 1e-12 ? Infinity : m.tol / (1 / ch - 1);
      V[i] = min(VC[i], VC[i + 1], sqrt(A * min(RC[i], req)));
    }
    for (let i = 1; i < n; i++) V[i] = min(V[i], sqrt(V[i - 1] * V[i - 1] + 2 * A * L[i]));
    for (let i = n - 2; i >= 0; i--) V[i] = min(V[i], sqrt(V[i + 1] * V[i + 1] + 2 * A * L[i + 1]));
    const VP = new Float64Array(n), MT = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      if (L[i] <= 1e-9) continue;
      const v0 = V[i - 1], v1 = V[i], vp = VP[i] = max(v0, v1, min(VC[i], sqrt((2 * A * L[i] + v0 * v0 + v1 * v1) / 2)));
      MT[i] = (2 * vp - v0 - v1) / A + max(0, L[i] - (2 * vp * vp - v0 * v0 - v1 * v1) / (2 * A)) / vp;
    }
    const sum = () => { for (let i = 1; i < n; i++) TE[i] = TE[i - 1] + dwl[i] + MT[i]; };
    sum();
    let late = false;
    for (const w of waits) { const e = ramp - (TE[w.s] - TE[w.w]); if (e > 1e-9) { dwl[w.w] += e; late = true; } }
    if (late) sum();
    this.n = n; this.duration = TE[n - 1];
    Object.assign(this, { L, V, VP, VC, TE, DWL: dwl, RC });
  }
  _seg(t) {
    const TE = this.TE; let lo = 1, hi = this.n - 1;
    if (t >= TE[hi]) return hi;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (TE[mid] > t) hi = mid; else lo = mid + 1; }
    return lo;
  }
  _motion(i, tau, out) {
    const L = this.L[i], A = this.A;
    out[0] = out[1] = 0;
    if (L < 1e-9 || (tau -= this.DWL[i]) <= 0) return out;
    const v0 = this.V[i - 1], v1 = this.V[i], vp = this.VP[i], t1 = (vp - v0) / A, d1 = (vp * vp - v0 * v0) / (2 * A), d2 = max(0, L - d1 - (vp * vp - v1 * v1) / (2 * A)), t2 = d2 / vp;
    let s, v;
    if (tau < t1) { s = v0 * tau + A * tau * tau / 2; v = v0 + A * tau; }
    else if (tau < t1 + t2) { s = d1 + vp * (tau - t1); v = vp; }
    else { const t3 = min(tau - t1 - t2, (vp - v1) / A); s = d1 + d2 + vp * t3 - A * t3 * t3 / 2; v = vp - A * t3; }
    out[0] = clamp(s, 0, L); out[1] = max(0, v); return out;
  }
  _loc(t) { const i = this._seg(t); this._motion(i, max(0, t - this.TE[i - 1]), this._mv || (this._mv = [0, 0])); return i; }
  spindle(t) {
    let S = 0;
    for (const s of this.spin) { if (s.t0 > t) break; S = t >= s.t1 ? s.s1 : lerp(s.s0, s.s1, (t - s.t0) / max(1e-9, s.t1 - s.t0)); }
    return S;
  }
  reset() { if (this.zmap) this.zmap.reset(); this.t = 0; this.si = 1; this.ss = 0; this._eval(0); return this.st; }
  advanceTo(t, opts) {
    t = clamp(t, 0, this.duration);
    if (this.zmap && !(opts && opts.stamp === false)) {
      if (t < this.t - 1e-12) this.reset();
      const it = this._loc(t), st = this._mv[0], each = opts && opts.each, step = opts && opts.step;
      let i = this.si, s = this.ss;
      while (i < it || (i === it && s < st - 1e-12)) {
        const e = i < it ? this.L[i] : st;
        if (this.L[i] > 1e-9 && e > s) this._sweep(i, s, e, each, step);
        if (i < it) { i++; s = 0; } else { s = e; break; }
      }
      this.si = i; this.ss = s;
    }
    this.t = t; this._eval(t); return this.st;
  }
  finish() { return this.advanceTo(this.duration); }
  state() { return this.st; }
  _sweep(i, s0, s1, each, stepMax) {
    const op = this.ops[this.OP[i]], T = op.tool, zm = this.zmap, L = this.L[i], X = this.X, Y = this.Y, Z = this.Z, A3 = this.AX;
    const ax = X[i - 1], ay = Y[i - 1], az = Z[i - 1], dx = X[i] - ax, dy = Y[i] - ay, dz = Z[i] - az, rapid = this.TY[i] === 0;
    const five = A3 && op.path.axis && T.k === 1, ramp = abs(dz) > 1e-9 && dx * dx + dy * dy > 1e-12;
    /* un tramo a z constante o vertical es una cápsula exacta; rampas y 5 ejes se trocean a media celda */
    const ns = max(1, ceil((s1 - s0) / min(five || ramp ? max(0.05, 0.5 * zm.cell) : Infinity, stepMax || Infinity)));
    const a = this._a || (this._a = [0, 0, 0]), b = this._b || (this._b = [0, 0, 0]);
    for (let k = 0; k < ns; k++) {
      const u0 = (s0 + (s1 - s0) * k / ns) / L, u1 = (s0 + (s1 - s0) * (k + 1) / ns) / L;
      a[0] = ax + dx * u0; a[1] = ay + dy * u0; a[2] = az + dz * u0; b[0] = ax + dx * u1; b[1] = ay + dy * u1; b[2] = az + dz * u1;
      if (five) {
        /* centro de la bola = punta + R·eje */
        for (let e = 0; e < 2; e++) {
          const p = e ? b : a, u = e ? u1 : u0, q = (i - 1) * 3;
          const ix = A3[q] + (A3[q + 3] - A3[q]) * u, iy = A3[q + 1] + (A3[q + 4] - A3[q + 1]) * u, iz = A3[q + 2] + (A3[q + 5] - A3[q + 2]) * u, l = hypot(ix, iy, iz) || 1;
          p[0] += T.R * ix / l; p[1] += T.R * iy / l; p[2] += T.R * iz / l;
        }
        zm.stampBall(a, T.R, op.toolId, b);
      } else zm.sweep(T, a, b, op.toolId, rapid);
      if (each) each(ax + dx * u1, ay + dy * u1, az + dz * u1, i, this.TY[i]);
    }
  }
  _eval(t) {
    const st = this.st, i = this._loc(t), s = this._mv[0], L = this.L[i], dt = this.TE[i] - this.TE[i - 1], X = this.X, Y = this.Y, Z = this.Z;
    const u = L > 1e-9 ? s / L : dt > 0 ? clamp((t - this.TE[i - 1]) / dt, 0, 1) : 1;
    st.pos[0] = lerp(X[i - 1], X[i], u); st.pos[1] = lerp(Y[i - 1], Y[i], u); st.pos[2] = lerp(Z[i - 1], Z[i], u);
    if (this.AX) {
      const q = (i - 1) * 3, A3 = this.AX, a = st.axis;
      a[0] = lerp(A3[q], A3[q + 3], u); a[1] = lerp(A3[q + 1], A3[q + 4], u); a[2] = lerp(A3[q + 2], A3[q + 5], u);
      const l = hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l;
    }
    if (this.ROT) for (const r of this.ROT) st.rot[r.k] = lerp(r.v[i - 1], r.v[i], u);
    const op = this.OP[i];
    st.op = op; st.tool = this.ops[op].tool; st.toolId = this.ops[op].toolId; st.type = this.TY[i]; st.block = this.BK[i]; st.k = this.PK[i];
    st.dist = this.OP[i - 1] === op ? lerp(this.PD[i - 1], this.PD[i], u) : this.PD[i];
    st.feed = this._mv[1] * 60; st.S = this.spindle(t); st.phase = PHASE[this.PH[i]]; st.progress = this.duration ? t / this.duration : 1;
    const hx = X[i] - X[i - 1], hy = Y[i] - Y[i - 1], hl = hypot(hx, hy);
    if (hl > 1e-9) { st.dir[0] = hx / hl; st.dir[1] = hy / hl; }
    if (t >= this.duration) { st.phase = 'end'; st.feed = 0; st.block = this.endBlock; }
    return st;
  }
  pointTime(op, k) { return this.TE[this.opStart[op] + k]; }
  /* mm recorridos sobre ops[op].path.dist en el instante actual (backplot progresivo) */
  pathDist(op) { const st = this.st; return op == null || op === st.op ? st.dist : op < st.op ? this.ops[op].path.len : 0; }
  /* el listado se formatea bajo demanda hasta el bloque pedido: la salida modal obliga a ir en orden y así el coste
     se reparte a lo largo del ciclo en vez de caer en el primer refresco del HUD */
  lines(upTo) {
    const L = this._lines || (this._lines = []), st = this._ncst || (this._ncst = NC.state(this.dialect)), f = this.nc && this.nc.map, bf = this.bf, B = this.blocks;
    for (let k = L.length, e = min(upTo == null ? B.length - 1 : upTo, B.length - 1); k <= e; k++) {
      const b = this.rb[k] ? Object.assign({}, B[k], this.rb[k]) : B[k];
      L.push(NC.format(f ? f(b, bf[k]) : b, this.dialect, st, bf[k]));
    }
    return L;
  }
  lineIdx(i) { const L = this.lines(i); for (let k = min(i, L.length - 1); k >= 0; k--) if (L[k]) return k; return 0; }
  line(i) { return this.lines(i)[this.lineIdx(i)] || ''; }
}
C.Program = Program;

/* ---------- B-spline cúbica (de Boor): bases y primeras derivadas ---------- */
const BS = C.BSpline = {
  span(U, u) {
    const n = U.length - 5;
    if (u >= U[n + 1]) return n;
    if (u <= U[3]) return 3;
    let lo = 3, hi = n + 1, m = (lo + hi) >> 1;
    while (u < U[m] || u >= U[m + 1]) { if (u < U[m]) hi = m; else lo = m; m = (lo + hi) >> 1; }
    return m;
  },
  /* N[r], D[r] corresponden a la base s-3+r */
  basis(U, u, s, N, D) {
    const Lf = BS._l, Rf = BS._r, N2 = BS._n2; N[0] = 1;
    for (let j = 1; j <= 3; j++) {
      Lf[j] = u - U[s + 1 - j]; Rf[j] = U[s + j] - u; let sv = 0;
      for (let r = 0; r < j; r++) { const t = N[r] / (Rf[r + 1] + Lf[j - r]); N[r] = sv + Rf[r + 1] * t; sv = Lf[j - r] * t; }
      N[j] = sv;
      if (j === 2) { N2[0] = N[0]; N2[1] = N[1]; N2[2] = N[2]; }
    }
    if (D) for (let r = 0; r <= 3; r++) {
      const i = s - 3 + r, da = U[i + 3] - U[i], db = U[i + 4] - U[i + 1];
      D[r] = 3 * ((r >= 1 && da > 0 ? N2[r - 1] / da : 0) - (r <= 2 && db > 0 ? N2[r] / db : 0));
    }
  },
  /* abscisas de Greville: con los puntos de control en ellas, x(u) es lineal */
  greville: U => { const g = []; for (let i = 0; i + 4 < U.length; i++) g.push((U[i + 1] + U[i + 2] + U[i + 3]) / 3); return g; },
  _l: [0, 0, 0, 0], _r: [0, 0, 0, 0], _n2: [0, 0, 0]
};

C.Shapes = C.Shapes || {};

/* §4.1: cajera 100×60 R8 de 14 con islas en un bruto de 150×100×40 (G54 en el centro de la cara superior) */
C.Shapes.pocketD2 = (function () {
  const pocket = Region.rrect(0, 0, 100, 60, 8), isA = Region.rect(-30, -4, -6, 8), isB = Region.circle(21, -2, 7);
  const islands = Region.union(isA, isB), region = Region.subtract(pocket, islands), depth = 14, rF = 1;
  const area = 100 * 60 - (4 - PI) * 64 - 24 * 12 - PI * 49, perim = 2 * (100 + 60) - 64 + TAU * 8 + 2 * (24 + 12) + TAU * 7;
  /* fondo con el R1 que deja la tórica: perfil por distancia al borde */
  const height = (x, y) => { const d = -region(x, y); return d <= 0 ? 0 : d >= rF ? -depth : -depth + rF - sqrt(rF * rF - (rF - d) * (rF - d)); };
  const S = {
    stock: { x0: -75, y0: -50, x1: 75, y1: 50, top: 0, bottom: -40, material: '1.2379' },
    pocket: { cx: 0, cy: 0, w: 100, h: 60, r: 8, depth, rFloor: rF },
    islands: [{ kind: 'rect', x0: -30, y0: -4, x1: -6, y1: 8 }, { kind: 'circle', cx: 21, cy: -2, r: 7 }],
    sdf: { pocket, islands, region },
    area, perimeter: perim, volumeNoFillet: area * depth, volume: area * depth - perim * (1 - PI / 4) * rF * rF,
    height,
    helix: { c: [0, -15], rPath: 3, zTop: 0.5, zEnd: -13.8, rampDeg: 3, F: 1200 },
    rough: { z: -13.8, stockWall: 0.3, stockFloor: 0.2, rStart: 3, linkLift: 0.3, Flink: 8000, ae: { wide: 1.2, mid: 1.0, narrow: 0.8, tight: 0.6 } },
    tools: {
      T1: { id: 'T1', num: 1, kind: 'bull', D: 12, rc: 1, z: 5, lc: 26, oal: 83, helix: 38, shank: 12, stick: 37, coat: '#3B3640', name: 'FRESA DINAMICA D12 R1 Z5',
        holder: { type: 'shrink', A: 100, nose: 24, bore: 46, flange: 63, iface: 'HSK-A63' }, cut: { vc: 180, S: 4775, fz: 0.095, F: 2268, ae: 1.2, ap: 13.8, Fentry: 1200, Flink: 8000 } },
      T2: { id: 'T2', num: 2, kind: 'bull', D: 10, rc: 1, z: 4, lc: 22, oal: 72, helix: 38, shank: 10, stick: 31, coat: '#3B3640', name: 'TORICA D10 R1',
        holder: { type: 'shrink', A: 120, nose: 24, bore: 41, flange: 63, iface: 'HSK-A63' }, cut: { vc: 200, S: 6366, fz: 0.105, F: 2674, ae: 0.3, ap: 14, Fentry: 1337 } }
    },
    grids: { A: [384, 256], B: [288, 192], C: [192, 128] },
    hsm: { rect: [-56, -36, 56, 36], grid: [280, 180] },
    model(zm) {
      const m = new Float32Array(zm.nx * zm.ny);
      for (let j = 0, q = 0; j < zm.ny; j++) for (let i = 0; i < zm.nx; i++, q++) m[q] = height(zm.xc(i), zm.yc(j));
      return m;
    },
    zmap(nx, ny, rect) {
      const r = rect || [-75, -50, 75, 50];
      return new ZMap({ ox: r[0], oy: r[1], sx: r[2] - r[0], sy: r[3] - r[1], nx, ny, top: 0, bottom: -40 });
    },
    /* desbaste T1 compartido por hero y hsm vía memo; necesita CamSim.Strat (paths.js) */
    roughT1(opts) {
      return C.memo('pocketD2.T1', () => {
        const St = C.Strat; if (!St || !St.adaptive || !St.helix) throw new Error('pocketD2.roughT1: falta CamSim.Strat');
        const T = new Tool(S.tools.T1), h = S.helix, r = S.rough, x0 = h.c[0] + h.rPath, y0 = h.c[1];
        const pb = new PathBuilder({ safeZ: 2 });
        pb.rapid(x0, y0, 50).rapid(x0, y0, 2).feed(x0, y0, h.zTop, 2, h.F);
        pb.append(St.helix({ c: h.c, rPath: h.rPath, zTop: h.zTop, zEnd: h.zEnd, rampDeg: h.rampDeg, F: h.F }), { link: 'direct', type: 2, F: h.F });
        const fin = ad => { pb.append(ad, { link: 'lift', liftZ: r.linkLift, F: r.Flink }); pb.rapid(pb.x, pb.y, 50); return pb.build(); };
        const ad = St.adaptive(Object.assign({ region, tool: T, stockWall: r.stockWall, z: r.z, start: h.c, rStart: r.rStart, ae: r.ae, cell: 0.25, linkLift: r.linkLift, Flink: r.Flink }, opts));
        return ad && typeof ad.then === 'function' ? ad.then(fin) : fin(ad);
      });
    }
  };
  return S;
})();

/* §4.4 / §4.6: núcleo de molde. Placa 90×54×10 (z 0…10), huella 70×44 R6 con paredes verticales y superficie libre
   B-spline bicúbica de 5×9 puntos con costura interior en x = -3.5. Cresta paralela a X con el flanco hacia +Y. */
C.Shapes.nucleo = (function () {
  const x0 = -35, x1 = 35, y0 = -22, y1 = 22, zp = 10;
  const U = [0, 0, 0, 0, 0.45, 1, 1, 1, 1], V = [0, 0, 0, 0, 0.206, 0.345, 0.572, 0.683, 0.795, 1, 1, 1, 1];
  /* perfil en Y ajustado numéricamente (flanco 48.6°, radio mínimo 8.6, franja de 14 mm) y desplazamiento suave en X */
  const prof = [17.47, 18.56, 22.19, 20.67, 19.35, 16.35, 7.68, 8.07, 8.08], row = [-0.5, 0.1, 0.6, 0.1, -0.4];
  const nu = 5, nv = 9, P = new Float64Array(nu * nv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) P[i * nv + j] = zp + prof[j] + row[i];
  const Nu = [0, 0, 0, 0], Du = [0, 0, 0, 0], Nv = [0, 0, 0, 0], Dv = [0, 0, 0, 0], tmp = [0, 0, 0];
  const footprint = Region.rrect(0, 0, 70, 44, 6);
  function evalS(x, y, out) {
    const u = clamp((x - x0) / (x1 - x0), 0, 1), v = clamp((y - y0) / (y1 - y0), 0, 1), su = BS.span(U, u), sv = BS.span(V, v);
    BS.basis(U, u, su, Nu, Du); BS.basis(V, v, sv, Nv, Dv);
    let z = 0, zu = 0, zv = 0;
    for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) {
      const p = P[(su - 3 + a) * nv + sv - 3 + b];
      z += Nu[a] * Nv[b] * p; zu += Du[a] * Nv[b] * p; zv += Nu[a] * Dv[b] * p;
    }
    const o = out || [0, 0, 0]; o[0] = z; o[1] = zu / (x1 - x0); o[2] = zv / (y1 - y0); return o;
  }
  const S = {
    plate: { x0: -45, y0: -27, x1: 45, y1: 27, z0: 0, z1: zp },
    body: { cx: 0, cy: 0, w: 70, h: 44, r: 6 },
    footprint,
    surf: { U, V, P, nu, nv, x0, x1, y0, y1, cpX: BS.greville(U).map(g => x0 + g * (x1 - x0)), cpY: BS.greville(V).map(g => y0 + g * (y1 - y0)) },
    seamsX: U.slice(4, U.length - 4).map(k => x0 + k * (x1 - x0)),
    seamsY: V.slice(4, V.length - 4).map(k => y0 + k * (y1 - y0)),
    material: '1.2343',
    grids: { A: [288, 172], B: [216, 130], C: [144, 86] },
    eval: evalS,
    height: (x, y) => evalS(x, y, tmp)[0],
    normal(x, y, out) {
      const e = evalS(x, y, tmp), l = hypot(e[1], e[2], 1), o = out || [0, 0, 0];
      o[0] = -e[1] / l; o[1] = -e[2] / l; o[2] = 1 / l; return o;
    },
    at: (x, y) => x < -45 || x > 45 || y < -27 || y > 27 ? 0 : footprint(x, y) <= 0 ? evalS(x, y, tmp)[0] : zp,
    model(zm) {
      const m = new Float32Array(zm.nx * zm.ny);
      for (let j = 0, q = 0; j < zm.ny; j++) for (let i = 0; i < zm.nx; i++, q++) m[q] = S.at(zm.xc(i), zm.yc(j));
      return m;
    },
    zmap: (nx, ny) => new ZMap({ ox: -45, oy: -27, sx: 90, sy: 54, nx, ny, top: zp + 26, bottom: 0 }),
    /* franja común de acabado a lo largo de todo X: normal inclinada hacia +Y entre 5° y 25° y pendiente en X ≤ 8° */
    band() {
      if (S._band !== undefined) return S._band;
      let lo = -Infinity, hi = Infinity;
      for (let x = -34; x <= 34.001; x += 2) {
        let best = null, a = null;
        for (let y = y0 + 0.05; y <= y1; y += 0.05) {
          const e = evalS(x, y, tmp), ok = atan2(-e[2], 1) * DEG >= 5 && atan2(-e[2], 1) * DEG <= 25 && atan2(abs(e[1]), 1) * DEG <= 8;
          if (ok && a === null) a = y;
          if ((!ok || y + 0.05 > y1) && a !== null) { const b = ok ? y : y - 0.05; if (!best || b - a > best[1] - best[0]) best = [a, b]; a = null; }
        }
        if (!best) return (S._band = null);
        lo = max(lo, best[0]); hi = min(hi, best[1]);
      }
      return (S._band = { y0: +lo.toFixed(2), y1: +hi.toFixed(2) });
    },
    iso(dir, t, ds = 0.5) {
      const out = [], len = dir === 'u' ? y1 - y0 : x1 - x0, n = ceil(len / ds);
      let cur = null;
      for (let k = 0; k <= n; k++) {
        const s = k / n, x = x0 + (dir === 'u' ? t : s) * (x1 - x0), y = y0 + (dir === 'u' ? s : t) * (y1 - y0);
        if (footprint(x, y) <= 1e-9) (cur || (cur = [])).push(x, y, evalS(x, y, tmp)[0]);
        else if (cur) { if (cur.length > 3) out.push(new Float32Array(cur)); cur = null; }
      }
      if (cur && cur.length > 3) out.push(new Float32Array(cur));
      return out;
    }
  };
  return S;
})();

})(typeof globalThis !== 'undefined' ? globalThis : this);
