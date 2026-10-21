/* Estrategias de trayectoria (§2.6). Sin DOM: cuelga de globalThis.CamSim y carga igual en Node. Cada estrategia
   devuelve un CamSim.PathBuilder con su operación escrita. Concordancia con M03: material a la DERECHA del avance
   (frentes, cajeras y hélices en G3; islas en G2; bucles trocoidales en G3). */
(function (G) {
'use strict';
const C = G.CamSim;
if (!C || !C.PathBuilder) throw new Error('paths.js necesita core.js');
const { PI, sqrt, abs, min, max, floor, ceil, round, hypot, sin, cos, acos, atan2 } = Math;
const TAU = 2 * PI, BIG = 1e20, INF = Infinity;
const now = () => (G.performance ? G.performance.now() : Date.now());
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const asSdf = r => typeof r === 'function' ? r : C.Region.rect(r[0], r[1], r[2], r[3]);

/* ---------- montículo binario (clave mínima) ---------- */
function heap(n) {
  let K = new Float64Array(n), V = new Int32Array(n), len = 0;
  return {
    get size() { return len; },
    push(k, v) {
      if (len === K.length) { const k2 = new Float64Array(len * 2), v2 = new Int32Array(len * 2); k2.set(K); v2.set(V); K = k2; V = v2; }
      let i = len++;
      while (i) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
      K[i] = k; V[i] = v;
    },
    pop() {
      const top = V[0], k = K[--len], v = V[len];
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= len) break; if (c + 1 < len && K[c + 1] < K[c]) c++; if (K[c] >= k) break; K[i] = K[c]; V[i] = V[c]; i = c; }
      K[i] = k; V[i] = v; return top;
    }
  };
}

/* ---------- rejilla de nodos con la distancia al borde del dominio de centros (positiva dentro) ---------- */
function bounds(sdf, c) {
  for (let h = 64; h <= 4096; h *= 2) {
    const s = h / 32;
    let x0 = BIG, y0 = BIG, x1 = -BIG, y1 = -BIG, edge = false;
    for (let j = 0; j <= 64; j++) for (let i = 0; i <= 64; i++) {
      const x = c[0] - h + i * s, y = c[1] - h + j * s;
      if (sdf(x, y) >= s) continue;
      if (!i || !j || i === 64 || j === 64) edge = true;
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y);
    }
    if (!edge && x1 >= x0) return [x0 - s, y0 - s, x1 + s, y1 + s];
  }
  throw new Error('Strat: región sin límites');
}
function field(sdf, off, cell, c) {
  const b = bounds(sdf, c || [0, 0]), x0 = b[0], y0 = b[1], nx = ceil((b[2] - x0) / cell) + 1, ny = ceil((b[3] - y0) / cell) + 1;
  const D = new Float32Array(nx * ny);
  for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) D[q] = -sdf(x0 + i * cell, y0 + j * cell) - off;
  const F = { x0, y0, nx, ny, cell, D, sdf, off };
  /* bilineal sobre un campo de nodos; fuera de la rejilla, -BIG */
  F.at = (A, x, y) => {
    const u = (x - x0) / cell, v = (y - y0) / cell, i = floor(u), j = floor(v);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return -BIG;
    const fu = u - i, fv = v - j, q = j * nx + i;
    return (A[q] * (1 - fu) + A[q + 1] * fu) * (1 - fv) + (A[q + nx] * (1 - fu) + A[q + nx + 1] * fu) * fv;
  };
  return F;
}

/* transformada de distancia euclídea exacta (Felzenszwalb–Huttenlocher), en celdas² */
function edt(mask, nx, ny) {
  const n = max(nx, ny), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), out = new Float32Array(nx * ny);
  const dt = len => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * q - 2 * v[k]); }
      v[++k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k2 = 0; q < len; q++) { while (z[k2 + 1] < q) k2++; d[q] = (q - v[k2]) * (q - v[k2]) + f[v[k2]]; }
  };
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = mask[j * nx + i] ? 0 : BIG; dt(ny); for (let j = 0; j < ny; j++) out[j * nx + i] = d[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) f[i] = out[j * nx + i]; dt(nx); for (let i = 0; i < nx; i++) out[j * nx + i] = d[i]; }
  return out;
}

/* ae local por la anchura del dominio de centros (§4.1.4): un nodo tiene anchura ≥ 2r si lo contiene un disco de radio r
   inscrito en el dominio, es decir, si está a ≤ r de la erosión {D ≥ r} (apertura morfológica) */
function aeField(F, Dt, ae) {
  const { nx, ny, cell, D } = F, N = nx * ny, out = new Float32Array(N).fill(ae.tight), m = new Uint8Array(N);
  for (const [k, v] of [[0.35, ae.narrow], [0.55, ae.mid], [0.65, ae.wide]]) {
    const r = k * Dt, r2 = (r / cell) * (r / cell);
    for (let q = 0; q < N; q++) m[q] = D[q] >= r ? 1 : 0;
    const d2 = edt(m, nx, ny);
    for (let q = 0; q < N; q++) if (D[q] >= 0 && d2[q] <= r2 + 1e-6) out[q] = v;
  }
  return out;
}

/* fast marching de primer orden: tiempo de llegada con velocidad ae (mm por nivel). Dentro del dominio solo se
   propaga desde nodos del dominio; la franja exterior de `band` mm extiende el campo para recortar las curvas en el
   borde sin atajos por fuera */
function* march(F, ae, seeds, band) {
  const { nx, ny, cell, D } = F, N = nx * ny, T = new Float32Array(N).fill(INF), st = new Uint8Array(N), H = heap(N);
  for (const q of seeds) { T[q] = 0; H.push(0, q); }
  const nb = [0, 0, 0, 0];
  let cnt = 0;
  while (H.size) {
    const q = H.pop();
    if (st[q]) continue;
    st[q] = 1;
    const i = q % nx, j = (q - i) / nx;
    nb[0] = i > 0 ? q - 1 : -1; nb[1] = i < nx - 1 ? q + 1 : -1; nb[2] = j > 0 ? q - nx : -1; nb[3] = j < ny - 1 ? q + nx : -1;
    for (let e = 0; e < 4; e++) {
      const n = nb[e];
      if (n < 0 || st[n] || D[n] < -band) continue;
      const dom = D[n] >= 0, ni = n % nx, nj = (n - ni) / nx;
      const ok = m => st[m] && (!dom || D[m] >= 0) ? T[m] : INF;
      const a = min(ni > 0 ? ok(n - 1) : INF, ni < nx - 1 ? ok(n + 1) : INF), b = min(nj > 0 ? ok(n - nx) : INF, nj < ny - 1 ? ok(n + nx) : INF);
      if (a === INF && b === INF) continue;
      const h = cell / (dom ? ae[n] : ae[q]);
      let t;
      if (abs(a - b) >= h) t = min(a, b) + h;
      else t = (a + b + sqrt(2 * h * h - (a - b) * (a - b))) / 2;
      if (t < T[n]) { T[n] = t; H.push(t, n); }
    }
    if (++cnt % 25000 === 0) yield;
  }
  return T;
}

/* ---------- curvas de nivel (marching squares) orientadas con lo «alto» a la DERECHA del avance ----------
   sg = -1 invierte el campo. Devuelve [{p:[x,y,…], closed}] */
const CORN = [[0, 0], [1, 0], [1, 1], [0, 1]];
function iso(F, V, lv, sg, cells) {
  const { nx, ny, cell, x0, y0 } = F, SA = [], SB = [], PX = [], PY = [], QX = [], QY = [], start = new Map(), end = new Set();
  const v = [0, 0, 0, 0], ex = [0, 0, 0, 0], ey = [0, 0, 0, 0], eid = [0, 0, 0, 0], cr = [0, 0, 0, 0];
  const add = (c, ea, eb, X, Y, k) => {
    /* orientación: la esquina k queda a la derecha si es alta, a la izquierda si es baja */
    const ax = ex[ea], ay = ey[ea], bx = ex[eb], by = ey[eb], px = X + CORN[k][0] * cell, py = Y + CORN[k][1] * cell;
    const s = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if ((v[k] > 0) === (s > 0)) { const t = ea; ea = eb; eb = t; }
    const n = SA.length;
    SA.push(eid[ea]); SB.push(eid[eb]); PX.push(ex[ea]); PY.push(ey[ea]); QX.push(ex[eb]); QY.push(ey[eb]);
    start.set(eid[ea], n); end.add(eid[eb]);
  };
  const visit = c => {
    const i = c % nx, j = (c - i) / nx;
    if (i >= nx - 1 || j >= ny - 1) return;
    const q = [c, c + 1, c + nx + 1, c + nx];
    let hi = 0;
    /* un nodo justo en la cota (pared alineada con la rejilla) dejaría el tramo sin orientación: se desempata */
    for (let k = 0; k < 4; k++) { const w = V[q[k]]; if (!(abs(w) < BIG)) return; v[k] = sg * (w - lv) || 1e-9; if (v[k] > 0) hi++; }
    if (!hi || hi === 4) return;
    const X = x0 + i * cell, Y = y0 + j * cell;
    let nc = 0;
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) & 3;
      cr[e] = (v[a] > 0) !== (v[b] > 0);
      if (!cr[e]) continue;
      nc++;
      const t = v[a] / (v[a] - v[b]);
      /* el mismo nodo de partida en las dos celdas vecinas: misma coordenada a la vez */
      if (e === 0) { ex[e] = X + t * cell; ey[e] = Y; eid[e] = 2 * c; }
      else if (e === 1) { ex[e] = X + cell; ey[e] = Y + t * cell; eid[e] = 2 * (c + 1) + 1; }
      else if (e === 2) { const t2 = v[3] / (v[3] - v[2]); ex[e] = X + t2 * cell; ey[e] = Y + cell; eid[e] = 2 * (c + nx); }
      else { const t2 = v[0] / (v[0] - v[3]); ex[e] = X; ey[e] = Y + t2 * cell; eid[e] = 2 * c + 1; }
    }
    if (nc === 2) {
      let ea = -1, eb = -1, k = 0;
      for (let e = 0; e < 4; e++) if (cr[e]) { if (ea < 0) ea = e; else eb = e; }
      for (let m = 1; m < 4; m++) if (abs(v[m]) > abs(v[k])) k = m;
      add(c, ea, eb, X, Y, k);
    } else {
      /* silla: el centro decide qué esquinas quedan aisladas */
      const cs = v[0] + v[1] + v[2] + v[3] > 0;
      for (let k = 0; k < 4; k++) if ((v[k] > 0) !== cs) add(c, (k + 3) & 3, k, X, Y, k);
    }
  };
  if (cells) for (let k = 0; k < cells.length; k++) visit(cells[k]);
  else for (let c = 0; c < nx * ny; c++) visit(c);
  const used = new Uint8Array(SA.length), out = [];
  const chain = s0 => {
    const p = [];
    let s = s0;
    while (s != null && !used[s]) { used[s] = 1; p.push(PX[s], PY[s]); const nx2 = start.get(SB[s]); if (nx2 == null) { p.push(QX[s], QY[s]); return { p, closed: false }; } s = nx2; }
    return { p, closed: s === s0 };
  };
  for (let s = 0; s < SA.length; s++) if (!used[s] && !end.has(SA[s])) out.push(chain(s));
  for (let s = 0; s < SA.length; s++) if (!used[s]) out.push(chain(s));
  return out;
}

/* ---------- utilidades de polilíneas (arrays planos x,y) ---------- */
function plen(p, closed) { let L = 0; for (let k = 2; k < p.length; k += 2) L += hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]); if (closed && p.length > 2) L += hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]); return L; }
function resample(p, ds, closed) {
  const q = closed ? p.concat(p[0], p[1]) : p, n = q.length / 2;
  if (n < 2) return p.slice();
  const cum = new Float64Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + hypot(q[2 * k] - q[2 * k - 2], q[2 * k + 1] - q[2 * k - 1]);
  const L = cum[n - 1], m = max(closed ? 3 : 1, round(L / ds)), out = [];
  for (let s = 0, k = 0; s <= m - (closed ? 1 : 0); s++) {
    const t = L * s / m;
    while (k < n - 2 && cum[k + 1] < t) k++;
    const seg = cum[k + 1] - cum[k], u = seg > 1e-12 ? (t - cum[k]) / seg : 0;
    out.push(q[2 * k] + (q[2 * k + 2] - q[2 * k]) * u, q[2 * k + 1] + (q[2 * k + 3] - q[2 * k + 1]) * u);
  }
  return out;
}
function chaikin(p, closed) {
  const n = p.length / 2, out = closed ? [] : [p[0], p[1]];
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const a = 2 * k, b = 2 * ((k + 1) % n);
    if (closed || k > 0) out.push(0.75 * p[a] + 0.25 * p[b], 0.75 * p[a + 1] + 0.25 * p[b + 1]);
    if (closed || k < n - 2) out.push(0.25 * p[a] + 0.75 * p[b], 0.25 * p[a + 1] + 0.75 * p[b + 1]);
  }
  if (!closed) out.push(p[2 * n - 2], p[2 * n - 1]);
  return out;
}
const smooth = (p, closed, ds) => {
  if (plen(p, closed) < 2 * ds) return resample(p, ds, closed);
  return resample(chaikin(chaikin(resample(p, max(ds, 1), closed), closed), closed), ds, closed);
};
/* arranca un bucle cerrado en el punto más cercano a (x,y) */
function rotateTo(p, x, y) {
  let best = 0, bd = INF;
  for (let k = 0; k < p.length; k += 2) { const d = (p[k] - x) ** 2 + (p[k + 1] - y) ** 2; if (d < bd) { bd = d; best = k; } }
  return p.slice(best).concat(p.slice(0, best));
}
/* proyecta los puntos sobre la isolínea exacta del SDF (Newton con gradiente numérico) */
function snap(p, sdf, off) {
  const e = 1e-3;
  for (let k = 0; k < p.length; k += 2) for (let it = 0; it < 3; it++) {
    const x = p[k], y = p[k + 1], f = sdf(x, y) + off, gx = (sdf(x + e, y) - sdf(x - e, y)) / (2 * e), gy = (sdf(x, y + e) - sdf(x, y - e)) / (2 * e), g2 = gx * gx + gy * gy;
    if (g2 < 1e-12 || abs(f) < 1e-6) break;
    p[k] = x - f * gx / g2; p[k + 1] = y - f * gy / g2;
  }
  return p;
}
const signedArea = p => { let a = 0; for (let k = 0, n = p.length; k < n; k += 2) { const m = (k + 2) % n; a += p[k] * p[m + 1] - p[m] * p[k + 1]; } return a / 2; };
function tangent(p, k, closed) {
  const n = p.length / 2, a = closed ? (k - 1 + n) % n : max(0, k - 1), b = closed ? (k + 1) % n : min(n - 1, k + 1);
  const tx = p[2 * b] - p[2 * a], ty = p[2 * b + 1] - p[2 * a + 1], l = hypot(tx, ty) || 1;
  return [tx / l, ty / l];
}
/* arco antihorario de radio r alrededor de (cx,cy) desde el ángulo a0 barriendo sw, cada ds */
function arcPts(cx, cy, r, a0, sw, ds) {
  const n = max(2, ceil(abs(sw) * r / ds)), out = [];
  for (let k = 0; k <= n; k++) { const a = a0 + sw * k / n; out.push(cx + r * cos(a), cy + r * sin(a)); }
  return out;
}

/* ---------- ejecución troceable: con idle devuelve una promesa y cede tras cada trozo de ~20 ms ---------- */
function run(gen, idle) {
  if (!idle) { let r; do r = gen.next(); while (!r.done); return r.value; }
  return new Promise((res, rej) => {
    const step = () => {
      try {
        const t0 = now();
        for (;;) { const r = gen.next(); if (r.done) return res(r.value); if (now() - t0 > 20) break; }
        Promise.resolve(idle()).then(step, rej);
      } catch (e) { rej(e); }
    };
    step();
  });
}

/* normal del borde hacia dentro del dominio (gradiente de D) */
function inward(F, x, y, out) {
  const e = 0.5 * F.cell, gx = F.at(F.D, x + e, y) - F.at(F.D, x - e, y), gy = F.at(F.D, x, y + e) - F.at(F.D, x, y - e), l = hypot(gx, gy) || 1;
  out[0] = gx / l; out[1] = gy / l;
  return out;
}

/* Empalme con el borde del dominio de radio rho, tangente al frente y al borde, girando a la izquierda (lado ya
   vaciado). Al final del frente sustituye la llegada de frente contra la pared, que se come de golpe la lúnula de
   material entre dos pasadas (> 90° de contacto); al principio, el frente sale de la pared como el bucle de un
   trocoide. Devuelve {cut, P, c, q, sw, a0} o null */
function fillet(F, p, rho, atEnd, ds) {
  const n = p.length / 2, g = [0, 0];
  let pv = 0, pk = -1;
  for (let s = 0; s < n; s++) {
    if (s * ds > 3 * rho + 8) return null;
    const k = atEnd ? n - 1 - s : s, t = tangent(p, k, false), cx = p[2 * k] - rho * t[1], cy = p[2 * k + 1] + rho * t[0];
    const v = F.at(F.D, cx, cy) - rho;
    if (v >= 0) {
      if (!s) return null;
      const u = pv / (pv - v), ta = tangent(p, pk, false);
      const x = p[2 * pk] + (p[2 * k] - p[2 * pk]) * u, y = p[2 * pk + 1] + (p[2 * k + 1] - p[2 * pk + 1]) * u;
      let tx = ta[0] + (t[0] - ta[0]) * u, ty = ta[1] + (t[1] - ta[1]) * u;
      const tl = hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const c = [x - rho * ty, y + rho * tx];
      inward(F, c[0], c[1], g);
      const q = [c[0] - rho * g[0], c[1] - rho * g[1]], aP = atan2(y - c[1], x - c[0]), aQ = atan2(q[1] - c[1], q[0] - c[0]);
      let sw = atEnd ? aQ - aP : aP - aQ;
      while (sw <= 0) sw += TAU;
      /* tangente al tramo de borde donde acaba el frente, no a otra pared que quede más cerca del centro */
      const e = atEnd ? n - 1 : 0;
      if (sw > PI + 0.3 || hypot(q[0] - p[2 * e], q[1] - p[2 * e + 1]) > 2 * rho + 1) return null;
      return { cut: atEnd ? k : pk, P: [x, y], c, q, sw, a0: atEnd ? aP : aQ };
    }
    pv = v; pk = k;
  }
  return null;
}

/* ---------- adaptativo (§4.1.4) ---------- */
function* adaptiveGen(o) {
  /* rejilla del campo: 0.5 mm salvo fine. Con 0.25 el compromiso medido no mejora y cuesta un 25 % más; el borde del
     dominio no depende de ella porque el repaso final se proyecta sobre la SDF exacta */
  const t0 = now(), tool = o.tool, R = tool.R, Dt = tool.D, cell = o.fine ? o.cell || 0.25 : max(o.cell || 0.5, 0.5), z = o.z, lift = o.linkLift != null ? o.linkLift : 0.3;
  const Fl = o.Flink || 8000, zSafe = o.safeZ != null ? o.safeZ : z + 15, ds = o.ds || 0.5, sw = o.stockWall || 0, smoothN = o.smooth != null ? o.smooth : 2;
  const aeS = typeof o.ae === 'number' ? { wide: o.ae, mid: o.ae, narrow: o.ae, tight: o.ae } : Object.assign({ wide: 1.2, mid: 1.0, narrow: 0.8, tight: 0.6 }, o.ae);
  for (const k in aeS) if (!(aeS[k] > 0 && aeS[k] < Dt)) throw new Error('Strat.adaptive: ae fuera de (0, D)');
  const sdf = asSdf(o.region), start = o.start || [0, 0], rS = o.rStart != null ? o.rStart : 3;
  const F = field(sdf, R + sw, cell, start), { nx, ny, D } = F, N = nx * ny;
  yield;
  const AE = aeField(F, Dt, aeS);
  yield;
  const seeds = [];
  for (let q = 0; q < N; q++) if (D[q] >= 0 && hypot(F.x0 + (q % nx) * cell - start[0], F.y0 + floor(q / nx) * cell - start[1]) <= rS) seeds.push(q);
  if (!seeds.length) throw new Error('Strat.adaptive: el inicio no está en el dominio de centros');
  const T = yield* march(F, AE, seeds, 2.01 * cell);
  const Dat = (x, y) => F.at(D, x, y);
  const aeAt = (x, y) => { const i = clamp(round((x - F.x0) / cell), 0, nx - 1), j = clamp(round((y - F.y0) / cell), 0, ny - 1); return AE[j * nx + i]; };

  /* celdas por nivel (cada celda en los niveles enteros que cruza) */
  let Lmax = 0;
  const tmin = new Float32Array(N), tmax = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (c % nx >= nx - 1 || c + nx + 1 >= N) { tmin[c] = INF; continue; }
    const a = T[c], b = T[c + 1], d = T[c + nx + 1], e = T[c + nx];
    tmin[c] = min(a, b, d, e); tmax[c] = max(a, b, d, e);
    if (tmax[c] < INF) Lmax = max(Lmax, ceil(tmax[c]) - 1);
  }
  const cnt = new Int32Array(Lmax + 2);
  for (let c = 0; c < N; c++) if (tmax[c] < INF) for (let L = max(1, ceil(tmin[c])); L < tmax[c]; L++) cnt[L]++;
  const off = new Int32Array(Lmax + 3);
  for (let L = 1; L <= Lmax + 1; L++) off[L + 1] = off[L] + cnt[L];
  const cells = new Int32Array(off[Lmax + 2]), fill = off.slice();
  for (let c = 0; c < N; c++) if (tmax[c] < INF) for (let L = max(1, ceil(tmin[c])); L < tmax[c]; L++) cells[fill[L]++] = c;
  yield;

  /* 1. tramos de cada nivel recortados por el borde del dominio, suavizados y remuestreados */
  const levelPieces = (L, list, out) => {
    for (const c of iso(F, T, L, 1, list)) {
      const p = c.p, n = p.length / 2, d = new Float64Array(n);
      for (let k = 0; k < n; k++) d[k] = Dat(p[2 * k], p[2 * k + 1]);
      const push = (q, closed) => { if (plen(q, closed) >= 0.5) out.push({ L, p: smoothN ? smooth(q, closed, ds) : resample(q, ds, closed), closed }); };
      if (c.closed && d.every(v => v >= 0)) { push(p, true); continue; }
      if (c.closed) {
        let k0 = 0; while (d[k0] >= 0) k0++;
        p.push(...p.splice(0, 2 * k0)); const dd = Array.from(d); dd.push(...dd.splice(0, k0)); d.set(dd);
        p.push(p[0], p[1]);
      }
      let cur = null;
      const m = c.closed ? n + 1 : n;
      for (let k = 0; k < m; k++) {
        const x = p[2 * k], y = p[2 * k + 1], v = d[k % n];
        if (k > 0) {
          const kp = k - 1, vp = d[kp % n];
          if ((vp >= 0) !== (v >= 0)) {
            const u = vp / (vp - v), cx = p[2 * kp] + (x - p[2 * kp]) * u, cy = p[2 * kp + 1] + (y - p[2 * kp + 1]) * u;
            if (v >= 0) cur = [cx, cy]; else { if (cur) { cur.push(cx, cy); push(cur, false); } cur = null; }
          }
        }
        if (v >= 0) { if (!cur) cur = []; cur.push(x, y); }
      }
      if (cur) push(cur, false);
    }
    return out;
  };
  const pieces = [];
  for (let L = 1; L <= Lmax; L++) {
    levelPieces(L, cells.subarray(off[L], off[L + 1]), pieces);
    if (L % 8 === 0) yield;
  }
  yield;

  /* 2. Simulación en planta del material a vaciar: en cada nodo de una rejilla de 1 mm, la distancia de los centros
     ya cortados (hay material donde pasa de R). Interpolada da el borde del material con precisión de centésimas,
     que es lo que ve el arco de contacto. Con ella se elige la entrada de cada tramo, se baja siempre sobre vacío y los
     enlaces no tocan material. Se da por abierto el taladro de la hélice (centros a ≤ rStart del inicio) */
  const sg = o.simCell || 1, sx0 = F.x0, sy0 = F.y0, snx = floor((nx - 1) * cell / sg) + 1, sny = floor((ny - 1) * cell / sg) + 1;
  const Dm = new Float32Array(snx * sny), RU = R + 1.5, RSKIP = R - 1.6;
  let logI = new Int32Array(1 << 14), logV = new Float32Array(1 << 14), logN = 0;
  for (let j = 0, q = 0; j < sny; j++) for (let i = 0; i < snx; i++, q++) Dm[q] = max(0, hypot(sx0 + i * sg - start[0], sy0 + j * sg - start[1]) - rS);
  let logOn = false;
  /* solo las filas y columnas del disco o cápsula de radio RU; si el tramo continúa al anterior (cont), lo que
     queda detrás de su punto inicial ya está a esa distancia del tramo anterior */
  const stamp = (ax, ay, bx, by, cont) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, ylo = min(ay, by), yhi = max(ay, by), xlo = min(ax, bx), xhi = max(ax, bx);
    const j0 = max(0, ceil((ylo - RU - sy0) / sg)), j1 = min(sny - 1, floor((yhi + RU - sy0) / sg)), half = cont && l2 > 1e-12;
    for (let j = j0; j <= j1; j++) {
      const y = sy0 + j * sg, e0 = y < ylo ? ylo - y : y > yhi ? y - yhi : 0, w = sqrt(max(0, RU * RU - e0 * e0));
      let xa = xlo - w, xb = xhi + w;
      if (half) {
        const c = -(y - ay) * dy;
        if (abs(dx) > 1e-9) { const xc = ax + c / dx; if (dx > 0) xa = max(xa, xc); else xb = min(xb, xc); } else if (c >= 0) continue;
      }
      const i0 = max(0, ceil((xa - sx0) / sg)), i1 = min(snx - 1, floor((xb - sx0) / sg));
      for (let i = i0, q = j * snx + i0; i <= i1; i++, q++) {
        const old = Dm[q];
        if (old < RSKIP) continue;
        const x = sx0 + i * sg;
        let u = l2 > 1e-12 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - ax - u * dx, ey = y - ay - u * dy, d2 = ex * ex + ey * ey;
        if (d2 < old * old) {
          if (logOn) {
            if (logN === logI.length) { const a = new Int32Array(2 * logN), b = new Float32Array(2 * logN); a.set(logI); b.set(logV); logI = a; logV = b; }
            logI[logN] = q; logV[logN++] = old;
          }
          Dm[q] = sqrt(d2);
        }
      }
    }
  };
  const dAt = (x, y) => {
    const u = (x - sx0) / sg, v = (y - sy0) / sg, i = floor(u), j = floor(v);
    if (i < 0 || j < 0 || i >= snx - 1 || j >= sny - 1) return 1e4;
    const fu = u - i, fv = v - j, q = j * snx + i;
    return (Dm[q] * (1 - fu) + Dm[q + 1] * fu) * (1 - fv) + (Dm[q + snx] * (1 - fu) + Dm[q + snx + 1] * fu) * fv;
  };
  /* arco de contacto en la mitad delantera, como ZMap.engagement a 0.075 mm del filo; cuenta el sobreespesor de pared */
  const NP = 61, PC = new Float64Array(NP), PS = new Float64Array(NP), rp = R + 0.075;
  for (let k = 0; k < NP; k++) { const a = -PI / 2 + PI * k / (NP - 1); PC[k] = cos(a); PS[k] = sin(a); }
  /* el arco que no arranca en el lado derecho y queda a la izquierda del avance es fresado en oposición: penaliza */
  const engage = (cx, cy, hx, hy) => {
    let best = 0, r = 0, end = 0;
    const wall = Dat(cx, cy) < 0.2;
    for (let k = 0; k < NP; k++) {
      const x = cx + rp * (hx * PC[k] - hy * PS[k]), y = cy + rp * (hx * PS[k] + hy * PC[k]);
      if (dAt(x, y) > R || wall && Dat(x, y) < -R) { if (++r > best) { best = r; end = k; } } else r = 0;
    }
    const e = best * 180 / (NP - 1);
    return e >= 12 && end - best / 2 > 0.6 * NP ? e + 40 : e;
  };
  /* ¿el disco de la herramienta centrada aquí no toca material ni pared? Margen según el uso (lv): 0 justo donde
     acaba de cortar, 1 para bajar, 2 para enlazar a z + linkLift (a 0.3 mm del suelo, cualquier resto se pelaría en
     toda la altura). Se mira la circunferencia de radio R + margen y un anillo interior */
  const NC = 30, CC = new Float64Array(NC), CS = new Float64Array(NC);
  for (let k = 0; k < NC; k++) { CC[k] = cos(TAU * k / NC); CS[k] = sin(TAU * k / NC); }
  const RL = R + (o.linkMargin != null ? o.linkMargin : 0.15);
  const solid = (x, y) => dAt(x, y) > R + 0.005 && Dat(x, y) >= -R;
  const discClear = (x, y, lv, dEnd) => {
    const dv = Dat(x, y);
    if (dv < (lv > 1 ? 0.25 : dEnd ? min(0.25, 0.3 * dEnd) - 0.02 : -0.02)) return false;
    const rm = lv > 1 ? RL : lv ? R + 0.05 : R - 0.05;
    if (solid(x, y)) return false;
    for (let k = 0; k < NC; k++) if (solid(x + rm * CC[k], y + rm * CS[k])) return false;
    for (let k = 0; k < NC; k += 3) if (solid(x + 0.6 * R * CC[k], y + 0.6 * R * CS[k])) return false;
    return true;
  };
  /* estampa provisionalmente pts (x,y planos) a pasos de ~1 mm y devuelve el mayor compromiso desde el punto m0;
     deshace al salir */
  /* con win, además de lim: compromiso medio en 10 mm de recorrido; si pasa de win, cuenta como lim */
  let hotK = -1;
  const WB = new Float64Array(16);
  const trial = (pts, m0, lim = INF, win = INF) => {
    logOn = true; hotK = -1;
    let worst = 0, ax = pts[0], ay = pts[1], wn = 0, ws = 0;
    for (let k = 2; k < pts.length && worst < lim; k += 2) {
      const bx = pts[k], by = pts[k + 1], l = hypot(bx - ax, by - ay);
      if (l < 0.9 && k < pts.length - 2) continue;
      if (l < 1e-9) continue;
      stamp(ax, ay, bx, by, k > 2);
      if (k / 2 >= m0) {
        let e = engage(bx, by, (bx - ax) / l, (by - ay) / l);
        if (win < INF) { ws += e - (wn >= 10 ? WB[wn % 10] : 0); WB[wn++ % 10] = e; if (wn >= 10 && ws / 10 > win) e = max(e, lim); }
        if (e > worst) { worst = e; if (e >= lim) hotK = k; }
      }
      ax = bx; ay = by;
    }
    for (let k = logN - 1; k >= 0; k--) Dm[logI[k]] = logV[k];
    logN = 0; logOn = false;
    return worst;
  };
  yield;

  /* 3. entradas y salidas. Tipos por punto: 0 bajada (enlace), 1 corte, 2 entrada, 3 salida */
  const RH = o.leadR || 6, ACC = o.accept || 56, HARD = 74, SPAN = 8;
  const st = { pieces: pieces.length, levels: Lmax, relief: 0, links: 0, routed: 0, lifts: 0, filletIn: 0, filletOut: 0, leadIn: 0, plunge: 0, skipped: 0, dropped: 0 };
  const g2 = [0, 0];
  const geomOk = pts => { for (let k = 0; k < pts.length; k += 2) if (Dat(pts[k], pts[k + 1]) < -0.03) return false; return true; };
  /* Entrada desde la pared en media vuelta, como el fondo de un bucle trocoidal: recta por lo vaciado en sentido
     contrario al frente, semicírculo de radio rho que toca la pared en q y sale tangente al frente en P. Entrar a lo
     largo de la pared hacia el material arrastraría de frente la lúnula entre dos tangencias (contacto > 90°); en
     la media vuelta, lo que queda delante de q ya lo barrió la media vuelta anterior */
  const uTurn = (f, rho) => {
    const aP = atan2(f.P[1] - f.c[1], f.P[0] - f.c[0]), hx = -sin(aP), hy = cos(aP), bx = 2 * f.c[0] - f.P[0], by = 2 * f.c[1] - f.P[1];
    const arc = arcPts(f.c[0], f.c[1], rho, aP - PI, PI, ds);
    if (!geomOk(arc)) return null;
    const aeL = aeAt(f.q[0], f.q[1]);
    for (const dl of [aeL + 0.6, 2 * aeL + 1, 4, 6]) {
      const seg = [], n = max(1, ceil(dl / ds));
      for (let k = 0; k < n; k++) seg.push(bx + hx * dl * (1 - k / n), by + hy * dl * (1 - k / n));
      if (!geomOk(seg) || !discClear(seg[0], seg[1], 1)) continue;
      /* el tramo recto va por vacío al avance de enlace; el arco, al de corte */
      const lead = seg.concat(arc), ty = [], Fs = [], nq = seg.length / 2 + round((PI - f.sw) * rho / ds);
      for (let k = 0; k < lead.length / 2; k++) { ty.push(k < nq ? 2 : 1); Fs.push(k < seg.length / 2 ? Fl : undefined); }
      return { lead, ty, F: Fs };
    }
    return null;
  };
  /* arco de entrada por la izquierda (lado vaciado) tangente en el punto k: un cuarto o, si no cabe, media vuelta, que
     arranca más adentro (los primeros bucles alrededor del taladro de la hélice) */
  const quarter = (p, k, closed, rho, sw = PI / 2) => {
    const t = tangent(p, k, closed), cx = p[2 * k] - rho * t[1], cy = p[2 * k + 1] + rho * t[0];
    const arc = arcPts(cx, cy, rho, atan2(p[2 * k + 1] - cy, p[2 * k] - cx) - sw, sw, ds);
    return geomOk(arc) && discClear(arc[0], arc[1], 1) ? arc : null;
  };
  const front = (p, a, b) => { const out = []; for (let k = max(0, a); k <= b && k < p.length / 2; k++) out.push(p[2 * k], p[2 * k + 1]); return out; };
  /* Elige entre candidatos {lead, k0, skip}: el primero con compromiso ≤ ACC o, si ninguno, el mejor. Saltarse el
     principio del frente deja material junto a la pared que el frente siguiente se come de golpe: solo se admite
     si ninguna entrada completa baja de HARD */
  const pick = (cands, p) => {
    let best = null, bs = INF;
    for (const c of cands) {
      if (c.skip && bs <= HARD) break;
      const s = trial(c.lead.concat(front(p, c.k0 + 1, c.k0 + SPAN / ds)), 1, bs - 4 * c.skip) + 4 * c.skip;
      if (s < bs) { bs = s; best = c; }
      if (s <= ACC) break;
    }
    return best;
  };
  const radii = p => { let m = 0; for (let k = 0; k < p.length; k += 2) m = max(m, Dat(p[k], p[k + 1])); const r0 = clamp(0.9 * m, 1.2, RH); return [r0, 0.8 * r0, 0.6 * r0, 0.45 * r0].filter(r => r >= 1); };

  /* 4. orden: un tramo de nivel L se corta cuando ya no queda ningún tramo de nivel menor a menos de 2R + 4 mm (el
     material a su alrededor está como con el orden estricto por niveles, §4.1.4-7) y, de los disponibles, el más
     cercano. Así se acaba cada zona antes de saltar a otra y los enlaces son cortos */
  const HC = 4, dDep = 2 * R + 4, hnx = ceil(nx * cell / HC) + 1, hny = ceil(ny * cell / HC) + 1;
  const hcell = (x, y) => clamp(floor((y - sy0) / HC), 0, hny - 1) * hnx + clamp(floor((x - sx0) / HC), 0, hnx - 1);
  const owners = Array.from({ length: hnx * hny }, () => []), minL = new Float64Array(hnx * hny).fill(INF), rr = ceil(dDep / HC);
  pieces.forEach((pc, id) => {
    const own = new Set();
    for (let k = 0; k < pc.p.length; k += 2) own.add(hcell(pc.p[k], pc.p[k + 1]));
    pc.own = Array.from(own);
    const near = new Set();
    for (const h of pc.own) { const hi = h % hnx, hj = (h - hi) / hnx; for (let j = max(0, hj - rr); j <= min(hny - 1, hj + rr); j++) for (let i = max(0, hi - rr); i <= min(hnx - 1, hi + rr); i++) near.add(j * hnx + i); }
    pc.near = Int32Array.from(near);
    for (const h of pc.own) { owners[h].push(id); if (pc.L < minL[h]) minL[h] = pc.L; }
  });
  const avail = pc => { for (let k = 0; k < pc.near.length; k++) if (minL[pc.near[k]] < pc.L) return false; return true; };
  yield;

  const pb = new C.PathBuilder({ ds });
  /* corte: estampa en la simulación el tramo desde el punto anterior si ya estaba a la cota de corte */
  /* las entradas y salidas en el plano van al avance de corte (por defecto PathBuilder las pondría a la mitad) */
  const Fc = tool.cut && tool.cut.F || 0;
  /* la simulación se estampa a cuerdas de ~1 mm; flush() la pone al día antes de cada consulta */
  let sxp = NaN, syp = NaN;
  const flush = () => { if (sxp === sxp && pb.n && (pb.x !== sxp || pb.y !== syp)) stamp(sxp, syp, pb.x, pb.y, true); sxp = pb.x; syp = pb.y; };
  const cut = (x, y, ty, F) => {
    if (!(pb.n && abs(pb.z - z) < 1e-9)) sxp = NaN;
    else if (sxp !== sxp) { sxp = pb.x; syp = pb.y; }
    pb.feed(x, y, z, ty, F != null ? F : ty === 1 ? 0 : Fc); pb.blocks[pb.lastBlock()].ae = round(aeAt(x, y) * 100) / 100;
    if (sxp === sxp && hypot(x - sxp, y - syp) >= 1) { stamp(sxp, syp, x, y, true); sxp = x; syp = y; }
  };
  /* enlaces: A* en rejilla de 1 mm por los centros cuyo disco no toca material, con tirado de cuerda */
  const LG = 1, lnx = floor(snx * sg / LG) + 1, lny = floor(sny * sg / LG) + 1, gfree = new Int8Array(lnx * lny);
  /* a menos de 1 mm de los extremos (en el A*, 1.5) se admite rozar la pared y el margen es el de salida o bajada */
  /* en el tramo central basta el borde de la cápsula (y una línea interior): los discos completos solo en los
     extremos del tramo central y en el primer y último milímetro */
  const segClear = (x0, y0, x1, y1) => {
    const l = hypot(x1 - x0, y1 - y0), n = max(1, ceil(l / 0.8)), nx2 = -(y1 - y0) / (l || 1), ny2 = (x1 - x0) / (l || 1), ri = 0.6 * R;
    let mid = 0;
    for (let k = 1; k < n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, lv = u * l <= 1 ? 0 : (1 - u) * l <= 1 ? 1 : 2;
      if (lv < 2 || !mid++ || (k + 1 < n && (1 - (k + 1) / n) * l <= 1) || k === n - 1) { if (!discClear(x, y, lv, min(u, 1 - u) * l)) return false; continue; }
      if (Dat(x, y) < 0.25 || solid(x, y) || solid(x + RL * nx2, y + RL * ny2) || solid(x - RL * nx2, y - RL * ny2)) return false;
      if (k % 3 === 0 && (solid(x + ri * nx2, y + ri * ny2) || solid(x - ri * nx2, y - ri * ny2))) return false;
    }
    return true;
  };
  const route = (a, b) => {
    if (segClear(a[0], a[1], b[0], b[1])) return [b[0], b[1]];
    gfree.fill(0);
    const N2 = lnx * lny, g = new Float64Array(N2).fill(INF), par = new Int32Array(N2).fill(-1), H = heap(256);
    const nid = (x, y) => clamp(round((y - sy0) / LG), 0, lny - 1) * lnx + clamp(round((x - sx0) / LG), 0, lnx - 1);
    const s = nid(a[0], a[1]), e = nid(b[0], b[1]), ei = e % lnx, ej = (e - ei) / lnx;
    const hh = q => hypot(q % lnx - ei, floor(q / lnx) - ej);
    const fr = q => {
      if (q === e) return true;
      if (!gfree[q]) {
        const x = sx0 + (q % lnx) * LG, y = sy0 + floor(q / lnx) * LG;
        const da = hypot(x - a[0], y - a[1]), db = hypot(x - b[0], y - b[1]);
        gfree[q] = discClear(x, y, da < 1.5 ? 0 : db < 1.5 ? 1 : 2, min(da, db)) ? 1 : -1;
      }
      return gfree[q] > 0;
    };
    g[s] = 0; H.push(hh(s), s);
    let found = false;
    while (H.size) {
      const q = H.pop();
      if (q === e) { found = true; break; }
      const i = q % lnx, j = (q - i) / lnx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= lnx || jj >= lny) continue;
        const m = jj * lnx + ii, w = g[q] + (di && dj ? 1.41421356 : 1);
        if (w < g[m] && fr(m)) { g[m] = w; par[m] = q; H.push(w + 1.2 * hh(m), m); }
      }
    }
    if (!found) return null;
    const pts = [b];
    for (let q = par[e]; q >= 0 && q !== s; q = par[q]) pts.push([sx0 + (q % lnx) * LG, sy0 + floor(q / lnx) * LG]);
    pts.push(a); pts.reverse();
    const out = [];
    let cur = 0;
    while (cur < pts.length - 1) {
      let nxt = cur + 1;
      for (let k = cur + 2; k < pts.length && k - nxt <= 12; k++) if (segClear(pts[cur][0], pts[cur][1], pts[k][0], pts[k][1])) nxt = k;
      out.push(pts[nxt][0], pts[nxt][1]); cur = nxt;
    }
    return out;
  };
  /* enlace: sube linkLift, cruza por lo vaciado y baja en avance sobre vacío (la bajada es una entrada, tipo 2) */
  const away = (x, y) => { const dv = Dat(x, y); if (dv >= 0.25) return null; inward(F, x, y, g2); return [x + (0.3 - dv) * g2[0], y + (0.3 - dv) * g2[1]]; };
  const link = (x, y) => {
    if (!pb.n) { pb.feed(x, y, z, 2); stamp(x, y, x, y); return; }
    flush(); sxp = NaN;
    if (hypot(x - pb.x, y - pb.y) < 0.05) return;
    st.links++;
    /* junto a la pared, separarse (y acercarse) a la cota de corte: a z + linkLift las crestas entre pasadas de pared
       contarían como material arrancado por el enlace */
    const oa = away(pb.x, pb.y), ob = away(x, y), fx = x, fy = y;
    if (oa) { cut(oa[0], oa[1], 3); flush(); sxp = NaN; }
    if (ob) { x = ob[0]; y = ob[1]; }
    const r = route([pb.x, pb.y], [x, y]);
    if (r) {
      if (r.length > 2) st.routed++;
      pb.feed(pb.x, pb.y, z + lift, 4, Fl);
      for (let k = 0; k < r.length; k += 2) pb.feed(r[k], r[k + 1], z + lift, 4, Fl);
    } else {
      /* sin paso libre a ras: retirada por encima del bruto (no debería ocurrir; stats.lifts lo cuenta) */
      st.lifts++;
      pb.feed(pb.x, pb.y, zSafe, 4, Fl).feed(x, y, zSafe, 4, Fl);
    }
    pb.feed(x, y, z, 2);
    stamp(x, y, x, y);
    if (ob) cut(fx, fy, 2);
  };
  const emitLead = c => { for (let k = 0; k < c.lead.length; k += 2) { if (!k) link(c.lead[0], c.lead[1]); else cut(c.lead[k], c.lead[k + 1], c.ty ? c.ty[k / 2] : 2, c.F && c.F[k / 2]); } };

  /* Guarda de compromiso: si lo planeado (entrada y frente hasta la salida) pasa de GUARD en la simulación, antes se
     corta un frente intermedio (nivel L − 1/2, y luego L − 1/4) solo alrededor del punto caliente y se vuelve a planear.
     Pasa en las lúnulas junto a la pared y en frentes muy curvados, donde un paso de nivel arranca más de ae */
  const GUARD = o.guard != null ? o.guard : 74, GWIN = o.guardWin != null ? o.guardWin : 62, GD = o.guardDepth || 2, RZ = R + 4;
  const relief = (hx, hy, Lr, depth) => {
    st.relief++;
    const i0 = clamp(floor((hx - RZ - F.x0) / cell), 0, nx - 2), i1 = clamp(ceil((hx + RZ - F.x0) / cell), 0, nx - 2);
    const j0 = clamp(floor((hy - RZ - F.y0) / cell), 0, ny - 2), j1 = clamp(ceil((hy + RZ - F.y0) / cell), 0, ny - 2), list = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * nx + i; if (tmin[c] < Lr && tmax[c] > Lr && tmax[c] < INF) list.push(c); }
    const rp = levelPieces(Lr, list, []).filter(q => plen(q.p, q.closed) >= 2);
    while (rp.length) {
      let bi = 0, bd = INF;
      rp.forEach((q, i) => { const d = hypot(q.p[0] - pb.x, q.p[1] - pb.y); if (d < bd) { bd = d; bi = i; } });
      const q = rp.splice(bi, 1)[0];
      flush();
      if (trial(q.p, 1) < 8) continue;
      if (q.closed) doClosed(q, [pb.x, pb.y], depth); else doOpen(q, depth);
    }
  };
  const doOpen = (pc, depth = 0) => {
    flush();
    const p = pc.p, n = p.length / 2, RS = radii(p), cands = [];
    if (Dat(p[0], p[1]) < 0.5 * cell) for (const rho of RS) {
      const fi = fillet(F, p, rho, false, ds), u = fi && uTurn(fi, rho);
      if (u) cands.push({ lead: u.lead, ty: u.ty, F: u.F, k0: fi.cut, skip: 0, fil: 1 });
    }
    for (let k = 0; k < n - 2 && k * ds <= 8; k += 2) for (const rho of [4, 2.5, 1.2]) {
      const a = quarter(p, k, false, rho);
      if (a) { cands.push({ lead: a, k0: k, skip: k * ds }); break; }
    }
    const c = pick(cands, p);
    /* sin ninguna entrada sobre vacío (restos de esquina de pocos mm): se deja para el repaso del contorno */
    if (!c && plen(p, false) < 4) { st.dropped++; return; }
    const k0 = c ? c.k0 : 0;
    /* salida: empalme con el borde si mejora el compromiso de la llegada */
    const outs = [];
    if (Dat(p[2 * n - 2], p[2 * n - 1]) < 0.5 * cell) for (const rho of RS) {
      const fo = fillet(F, p, rho, true, ds);
      if (!fo || fo.cut <= k0 + 1) continue;
      const arc = arcPts(fo.c[0], fo.c[1], rho, fo.a0, fo.sw, ds);
      if (geomOk(arc)) outs.push({ cut: fo.cut, tail: [fo.P[0], fo.P[1]].concat(arc.slice(2)) });
    }
    outs.push({ cut: n - 1, tail: [] });
    let kc = n - 1;
    for (const e of outs) kc = min(kc, e.cut);
    kc = max(k0 + 1, kc - SPAN / ds);
    if (c && depth < GD) {
      const plan = c.lead.concat(front(p, k0 + 1, kc));
      if (trial(plan, 1, GUARD, GWIN) >= GUARD && hotK > 0) { relief(plan[hotK], plan[hotK + 1], pc.L - 0.5 ** (depth + 1), depth + 1); return doOpen(pc, depth + 1); }
    }
    if (!c) { st.plunge++; link(p[0], p[1]); }
    else { if (c.fil) st.filletIn++; else { st.leadIn++; if (c.skip) st.skipped++; } emitLead(c); }
    for (let k = k0 + 1; k <= kc; k++) cut(p[2 * k], p[2 * k + 1], 1);
    flush();
    let best = outs[outs.length - 1], bs = INF;
    if (outs.length > 1) for (const e of outs) {
      const s = trial([pb.x, pb.y].concat(front(p, kc + 1, e.cut), e.tail), 1, bs - 2);
      if (s < bs - 2) { bs = s; best = e; }
      if (s <= ACC) break;
    }
    if (depth < GD && bs >= GUARD) {
      const ex = [pb.x, pb.y].concat(front(p, kc + 1, best.cut), best.tail);
      if (trial(ex, 1, GUARD, GWIN) >= GUARD && hotK > 0) {
        relief(ex[hotK], ex[hotK + 1], pc.L - 0.5 ** (depth + 1), depth + 1);
        return doOpen({ L: pc.L, p: p.slice(2 * max(0, kc - 2)), closed: false }, depth + 1);
      }
    }
    if (best.tail.length) st.filletOut++;
    for (let k = kc + 1; k <= best.cut; k++) cut(p[2 * k], p[2 * k + 1], 1);
    for (let k = 0; k < best.tail.length; k += 2) cut(best.tail[k], best.tail[k + 1], 1);
  };
  const doClosed = (pc, from) => {
    flush();
    const p0 = rotateTo(pc.p, from[0], from[1]), n = p0.length / 2, cands = [];
    for (let off = 0; off < n && off * ds < 40; off += 10) {
      const p = off ? p0.slice(2 * off).concat(p0.slice(0, 2 * off)) : p0;
      for (const [rho, sw] of [[4, PI / 2], [3, PI / 2], [2, PI / 2], [1.2, PI / 2], [2, PI], [1.4, PI], [0.9, PI]]) { const a = quarter(p, 0, true, rho, sw); if (a) { cands.push({ lead: a, p, k0: 0, skip: 0 }); break; } }
    }
    let c = null, bs = INF;
    for (const k of cands) { const s = trial(k.lead.concat(k.p.slice(2, 2 + 2 * SPAN / ds)), 1, bs); if (s < bs) { bs = s; c = k; } if (s <= ACC) break; }
    const p = c ? c.p : p0;
    if (c) { st.leadIn++; emitLead(c); } else { st.plunge++; link(p[0], p[1]); }
    for (let k = 1; k < n; k++) cut(p[2 * k], p[2 * k + 1], 1);
    let ov = 0;
    for (let k = 0; k < n && ov < 1; k++) { cut(p[2 * k], p[2 * k + 1], 1); ov += k ? hypot(p[2 * k] - p[2 * k - 2], p[2 * k + 1] - p[2 * k - 1]) : 0; }
    const t = tangent(p, 0, true), cx = pb.x - 2 * t[1], cy = pb.y + 2 * t[0], lo = arcPts(cx, cy, 2, atan2(pb.y - cy, pb.x - cx), PI / 2, ds);
    if (geomOk(lo)) for (let k = 2; k < lo.length; k += 2) cut(lo[k], lo[k + 1], 3);
  };

  const done = new Uint8Array(pieces.length);
  let left = pieces.length, px = start[0], py = start[1];
  while (left) {
    let bi = -1, bd = INF;
    for (let i = 0; i < pieces.length; i++) {
      if (done[i]) continue;
      const pc = pieces[i];
      if (!avail(pc)) continue;
      let dm = hypot(pc.p[0] - px, pc.p[1] - py);
      if (pc.closed) for (let j = 2; j < pc.p.length; j += 2) dm = min(dm, hypot(pc.p[j] - px, pc.p[j + 1] - py));
      if (dm < bd) { bd = dm; bi = i; }
    }
    const pc = pieces[bi];
    if (pc.closed) doClosed(pc, [px, py]); else doOpen(pc);
    done[bi] = 1; left--;
    for (const h of pc.own) { let m = INF; for (const id of owners[h]) if (!done[id] && pieces[id].L < m) m = pieces[id].L; minL[h] = m; }
    px = pb.x; py = pb.y;
    yield;
  }
  /* repaso del contorno del dominio: deja el sobreespesor de pared uniforme */
  const loops = iso(F, D, 0, -1).filter(c => c.closed).map(c => snap(resample(c.p, ds, true), sdf, R + sw));
  loopPass(pb, loops, { leadR: 2, types: [2, 3], link, at: cut, z, inside: (x, y) => Dat(x, y) >= -0.02 });
  flush();
  /* la simulación estampa cuerdas de 1 mm: en los arcos de radio ≥ 1.2 la flecha llega a 0.11 */
  let rest = 0;
  for (let j = 0, q = 0; j < sny; j++) for (let i = 0; i < snx; i++, q++) if (Dm[q] > R + 0.12 && Dat(sx0 + i * sg, sy0 + j * sg) >= -R + 0.05) rest++;
  st.restMm2 = rest * sg * sg;
  st.ms = now() - t0;
  pb.stats = st;
  pb.field = { F, T, AE, aeAt };
  return pb;
}

/* recorre bucles cerrados en concordancia, el más cercano primero, con entrada y salida en arco tangente */
function loopPass(pb, loops, o) {
  const z = o.z, at = o.at || ((x, y, ty) => pb.feed(x, y, z, ty)), ty = o.types || [2, 3], ds = 0.5, rem = loops.slice();
  while (rem.length) {
    const px = pb.n ? pb.x : (o.from || [0, 0])[0], py = pb.n ? pb.y : (o.from || [0, 0])[1];
    let bi = 0, bd = INF;
    rem.forEach((q, k) => { for (let j = 0; j < q.length; j += 2) { const d = hypot(q[j] - px, q[j + 1] - py); if (d < bd) { bd = d; bi = k; } } });
    const p = rotateTo(rem.splice(bi, 1)[0], px, py), t = tangent(p, 0, true);
    let r = o.leadR, lead;
    for (;;) {
      const cx = p[0] - r * t[1], cy = p[1] + r * t[0], a = atan2(p[1] - cy, p[0] - cx);
      lead = arcPts(cx, cy, r, a - PI / 2, PI / 2, ds);
      if (!o.inside || r <= 0.5 || lead.every((v, k) => k & 1 || o.inside(v, lead[k + 1]))) break;
      r /= 2;
    }
    o.link(lead[0], lead[1]);
    for (let k = 2; k < lead.length; k += 2) at(lead[k], lead[k + 1], ty[0]);
    for (let k = 2; k < p.length; k += 2) at(p[k], p[k + 1], 1);
    let ov = 0;
    for (let k = 0; k < p.length && ov < 1; k += 2) { at(p[k], p[k + 1], 1); ov += k ? hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]) : 0; }
    const k2 = tangent(p, 0, true), cx = pb.x - r * k2[1], cy = pb.y + r * k2[0], a = atan2(pb.y - cy, pb.x - cx);
    const out = arcPts(cx, cy, r, a, PI / 2, ds);
    for (let k = 2; k < out.length; k += 2) at(out[k], out[k + 1], ty[1]);
  }
}

const Strat = C.Strat = {
  /* hélice siempre en G3 (concordancia en un taladro) y una vuelta plana al fondo para no dejar el escalón de la rampa */
  helix(o) {
    const [cx, cy] = o.c, r = o.rPath, F = o.F, pb = new C.PathBuilder({ ds: o.ds || 0.5 });
    pb.feed(cx + r, cy, o.zTop, 2, F).helix(cx, cy, r, o.zTop, o.zEnd, C.MECH.helixPitch(2 * r, o.rampDeg), false, F);
    if (o.flat !== false) pb.arc(cx, cy, pb.x, pb.y, o.zEnd, false, 2, F);
    return pb;
  },
  adaptive(o) { return run(adaptiveGen(o), o.idle); },
  /* offsets del dominio de dentro a fuera (convencional: solo como referencia del HSM). Los saltos entre anillos son
     avances rectos que cortan, como en un vaciado por offsets real */
  offsets(o) {
    const T = o.tool, sdf = asSdf(o.region), off = T.R + (o.stockWall || 0), F = field(sdf, off, o.cell || 0.25, o.start), z = o.z, ae = o.ae;
    let mx = 0; for (let q = 0; q < F.D.length; q++) mx = max(mx, F.D[q]);
    const pb = new C.PathBuilder({ ds: 0.5 }), K = floor(mx / ae - 1e-6), order = o.order === 'outside-in' ? 1 : -1;
    for (let k = order < 0 ? K : 0; order < 0 ? k >= 0 : k <= K; k += order) {
      const loops = iso(F, F.D, k * ae, -1).filter(c => c.closed).map(c => k ? resample(c.p, 0.5, true) : snap(resample(c.p, 0.5, true), sdf, off));
      while (loops.length) {
        const px = pb.n ? pb.x : (o.start || [0, 0])[0], py = pb.n ? pb.y : (o.start || [0, 0])[1];
        let bi = 0, bd = INF;
        loops.forEach((q, i) => { for (let j = 0; j < q.length; j += 2) { const d = hypot(q[j] - px, q[j + 1] - py); if (d < bd) { bd = d; bi = i; } } });
        const p = rotateTo(loops.splice(bi, 1)[0], px, py);
        for (let j = 0; j < p.length; j += 2) pb.feed(p[j], p[j + 1], z, 1);
        pb.feed(p[0], p[1], z, 1);
      }
    }
    return pb;
  },
  /* repaso de contorno a profundidad: pared de cajera en G3 y islas en G2, con entrada y salida en arco tangente */
  contour(o) {
    const T = o.tool, sdf = asSdf(o.region), off = T.R + (o.stock || 0), F = field(sdf, off, o.cell || 0.25, o.from), side = o.side || 'all';
    const loops = iso(F, F.D, 0, -1).filter(c => c.closed && (side === 'all' || (signedArea(c.p) > 0) === (side === 'pocket'))).map(c => snap(resample(c.p, 0.5, true), sdf, off));
    const pb = new C.PathBuilder({ ds: 0.5, safeZ: o.safeZ != null ? o.safeZ : 2 }), z = o.z;
    loopPass(pb, loops, {
      z, from: o.from, leadR: o.leadR != null ? o.leadR : 4, inside: (x, y) => -sdf(x, y) - off >= -0.01,
      link: (x, y) => { if (!pb.n) pb.feed(x, y, z, 2, o.F); else if (o.link === 'lift') pb.feed(pb.x, pb.y, z + 0.3, 4).feed(x, y, z + 0.3, 4).feed(x, y, z, 4); else pb.rapid(pb.x, pb.y, pb.safeZ).rapid(x, y, pb.safeZ).feed(x, y, z, 2, o.F); }
    });
    return pb;
  },
  /* ranura trocoidal de p0 a p1: bucles en G3 de radio rho = (slotW − D)/2. En el semicírculo de corte el F programado
     es el del centro, Fedge·rho/(rho+R), para que el filo vaya a Fedge; el retorno, sin corte, a returnFactor·Fedge */
  trochoid(o) {
    const D = o.D, R = D / 2, rho = (o.slotW - D) / 2, z = o.z, Fe = o.Fedge, Fc = round(C.MECH.trochoidCenterF(Fe, rho, R)), Fr = o.Freturn || round((o.returnFactor || 2.5) * Fe);
    if (!(rho > 0)) throw new Error('Strat.trochoid: la ranura debe ser más ancha que la herramienta');
    const [ax, ay] = o.p0, [bx, by] = o.p1, L = hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, vx = -uy, vy = ux;
    const nl = o.loops || ceil(L / o.step - 1e-9) + 1, s = L / (nl - 1);
    const pb = new C.PathBuilder({ ds: o.ds || 0.25 });
    pb.feed(ax - rho * vx, ay - rho * vy, z, 1, Fc);
    for (let k = 0; k < nl; k++) {
      const cx = ax + ux * s * k, cy = ay + uy * s * k;
      pb.arcTo(cx, cy, cx + rho * vx, cy + rho * vy, z, false, 1, Fc, PI);
      pb.blocks[pb.lastBlock()].half = 'cut';
      if (k === nl - 1) break;
      pb.arcTo(cx + ux * s / 2, cy + uy * s / 2, cx + ux * s - rho * vx, cy + uy * s - rho * vy, z, false, 1, Fr, PI);
      pb.blocks[pb.lastBlock()].half = 'return';
    }
    pb.feed(bx, by, z, 3, Fr);
    pb.stats = { loops: nl, step: s, rho, Fcenter: Fc, Freturn: Fr };
    return pb;
  },
  /* raster 3D por drop-cutter sobre el modelo (+ stock). vecFn(x, y, z, dir) → [i,j,k] da el eje de 5 ejes; con bola el
     centro no cambia al inclinar, así que la punta se recoloca a centro − R·eje */
  surfaceRaster(o) {
    const zm = o.zmap, T = o.tool, m = o.model, ae = o.ae, st = o.stock || 0, ax = o.axis === 'y' ? 1 : 0, ds = o.ds || 0.5;
    const sdf = o.region ? asSdf(o.region) : null, b = Array.isArray(o.region) ? o.region : o.bbox || [zm.ox, zm.oy, zm.ox + zm.sx, zm.oy + zm.sy];
    const u0 = b[ax], u1 = b[ax + 2], v0 = b[1 - ax], v1 = b[3 - ax], nv = floor((v1 - v0) / ae + 1e-6);
    const pb = new C.PathBuilder({ ds, safeZ: o.safeZ != null ? o.safeZ : zm.top + 5 }), zig = o.zigzag !== false;
    let line = 0;
    for (let kv = 0; kv <= nv; kv++) {
      const v = v0 + kv * ae, fw = !zig || line % 2 === 0, nu = max(1, round((u1 - u0) / ds)), run = [];
      for (let ku = 0; ku <= nu; ku++) {
        const u = fw ? u0 + (u1 - u0) * ku / nu : u1 - (u1 - u0) * ku / nu, x = ax ? v : u, y = ax ? u : v;
        if (sdf && sdf(x, y) > 0) { if (run.length) break; continue; }
        run.push(x, y, zm.drop(T, x, y, m) + st);
      }
      if (!run.length) continue;
      line++;
      const dir = ax ? [0, fw ? 1 : -1] : [fw ? 1 : -1, 0];
      for (let k = 0; k < run.length; k += 3) {
        let x = run[k], y = run[k + 1], zt = run[k + 2], opt;
        if (o.vecFn) {
          const a = o.vecFn(x, y, zt, dir), l = hypot(a[0], a[1], a[2]) || 1;
          if (T.k === 1) { x -= T.R * a[0] / l; y -= T.R * a[1] / l; zt += T.R - T.R * a[2] / l; }
          opt = { i: a[0], j: a[1], k: a[2] };
        }
        if (!k && pb.n) {
          if (zig && hypot(x - pb.x, y - pb.y) <= 3 * ae) pb.feed(x, y, zt, 1, 0, opt);
          else pb.rapid(pb.x, pb.y, pb.safeZ).rapid(x, y, pb.safeZ, opt).feed(x, y, zt, 2, 0, opt);
        } else pb.feed(x, y, zt, 1, 0, opt);
      }
    }
    return pb;
  },
  /* semiacabado previo estampado de golpe: piel de `stock` medida sobre la normal del modelo, con la cresta de la bola a
     paso ae (medido en planta, así que en ladera crece como ae/cos α) y la marca en la dirección de las pasadas. Por
     defecto congela el resultado como estado de reset() */
  skin(o) {
    const zm = o.zmap, m = o.model, st = o.stock || 0, T = o.tool, ae = o.ae, ax = o.axis === 'y' ? 1 : 0, id = o.toolId != null ? o.toolId : 9;
    const R = T.R, sdf = o.region ? asSdf(o.region) : null, h = zm.h, at = zm.at, ball = T.k === 1, nx = zm.nx, ny = zm.ny;
    const g = ax ? 0 : 255, FL = C.ZMap.FLAG;
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
      const x = zm.xc(i), y = zm.yc(j);
      if (sdf && sdf(x, y) > 0) continue;
      const gx = (m[q + (i < nx - 1 ? 1 : 0)] - m[q - (i > 0 ? 1 : 0)]) / ((i > 0 && i < nx - 1 ? 2 : 1) * zm.cx);
      const gy = (m[q + (j < ny - 1 ? nx : 0)] - m[q - (j > 0 ? nx : 0)]) / ((j > 0 && j < ny - 1 ? 2 : 1) * zm.cy);
      const w = ((ax ? x : y) - (o.offset || 0)) / ae, d = abs(w - round(w)) * ae * sqrt(1 + (ax ? gx * gx : gy * gy));
      const nz = m[q] + (st + (ball ? R - sqrt(max(0, R * R - d * d)) : 0)) * sqrt(1 + gx * gx + gy * gy);
      if (nz >= h[q]) continue;
      zm.removed += (h[q] - nz) * zm.cx * zm.cy; h[q] = nz;
      const w4 = q * 4; at[w4] = id; at[w4 + 1] = g; at[w4 + 2] = 128; at[w4 + 3] = (at[w4 + 3] | FL.CUT | FL.MARK | FL.SKIN) & ~FL.FLANK;
    }
    zm.markAll();
    if (o.save !== false) zm.saveBase();
    return zm;
  }
};
Strat._internal = { field, iso, edt, aeField, march, resample, smooth, signedArea, fillet };
})(globalThis);
