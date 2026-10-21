/* Estrategias de trayectoria (§2.6). Sin DOM: cuelga de globalThis.CamSim y carga igual en Node. Cada estrategia
   devuelve un CamSim.PathBuilder con su operación escrita. Concordancia con M03: material a la DERECHA del avance
   (frentes, cajeras y hélices en G3; islas en G2; bucles trocoidales en G3). */
(function (G) {
'use strict';
const C = G.CamSim;
if (!C || !C.PathBuilder) throw new Error('paths.js necesita core.js');
const { PI, sqrt, abs, min, max, floor, ceil, round, hypot, sin, cos, atan2 } = Math;
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
    for (let k = 0; k < 4; k++) { const w = V[q[k]]; if (!(abs(w) < BIG) ) return; v[k] = sg * (w - lv); if (v[k] > 0) hi++; }
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

/* entrada tangente por la izquierda (lado ya vaciado): cuarto de arco que termina en p[0] con su tangente. Si el
   arranque está en el borde del dominio, el arco es el empalme con el borde (radio rho, centro a rho del borde) y
   sustituye el principio del tramo: así el filo llega al frente como en un bucle trocoidal y no de frente.
   ok(x,y,pre) valida cada punto (pre: parte previa al punto de tangencia). Devuelve {lead, from} o null */
function leadIn(F, p, closed, rhos, ok, ds) {
  const n = p.length / 2;
  for (const rho of rhos) {
    let lead = null, from = 0;
    if (!closed && F.at(F.D, p[0], p[1]) < 0.5 * F.cell) {
      for (let k = 0; k < n && k * ds <= 3 * rho + 2; k++) {
        const t = tangent(p, k, false), cx = p[2 * k] - rho * t[1], cy = p[2 * k + 1] + rho * t[0];
        if (F.at(F.D, cx, cy) < rho - 0.02) continue;
        const e = 1e-2, gx = F.at(F.D, cx + e, cy) - F.at(F.D, cx - e, cy), gy = F.at(F.D, cx, cy + e) - F.at(F.D, cx, cy - e), gl = hypot(gx, gy) || 1;
        const aq = atan2(-gy / gl, -gx / gl), ae = atan2(p[2 * k + 1] - cy, p[2 * k] - cx);
        let sw = ae - (aq - PI / 2); while (sw <= 0) sw += TAU; while (sw > 1.75 * PI) sw -= TAU;
        if (sw <= PI / 2) break;
        lead = arcPts(cx, cy, rho, aq - PI / 2, sw, ds); from = k; lead.pre = PI / 2 / sw; break;
      }
    } else {
      const t = tangent(p, 0, closed), cx = p[0] - rho * t[1], cy = p[1] + rho * t[0], a = atan2(p[1] - cy, p[0] - cx);
      lead = arcPts(cx, cy, rho, a - PI / 2, PI / 2, ds); lead.pre = 1;
    }
    if (!lead) continue;
    const m = lead.length / 2;
    let good = true;
    for (let k = 0; k < m - 1 && good; k++) good = ok(lead[2 * k], lead[2 * k + 1], k / (m - 1) <= lead.pre + 1e-9);
    if (good) return { lead, from };
  }
  return null;
}

/* ---------- ejecución troceable: con idle devuelve una promesa y cede entre trozos de ≤ ~25 ms ---------- */
function run(gen, idle) {
  if (!idle) { let r; do r = gen.next(); while (!r.done); return r.value; }
  return new Promise((res, rej) => {
    const step = () => {
      try {
        const t0 = now();
        for (;;) { const r = gen.next(); if (r.done) return res(r.value); if (now() - t0 > 25) break; }
        Promise.resolve(idle()).then(step, rej);
      } catch (e) { rej(e); }
    };
    step();
  });
}

/* enlace levantado por zona ya vaciada: recto si cabe; si no, A* sobre los nodos con T ≤ thr y tirado de cuerda */
function route(F, T, thr, a, b, skip) {
  const cell = F.cell, freeAt = (x, y) => { const t = F.at(T, x, y); return t > -BIG && t <= thr; };
  const clear = (x0, y0, x1, y1) => {
    const L = hypot(x1 - x0, y1 - y0), n = ceil(L / (0.5 * cell));
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      if (hypot(x - a[0], y - a[1]) < skip || hypot(x - b[0], y - b[1]) < skip) continue;
      if (!freeAt(x, y)) return false;
    }
    return true;
  };
  if (clear(a[0], a[1], b[0], b[1])) return [b[0], b[1]];
  const { nx, ny, x0, y0 } = F, N = nx * ny, g = new Float32Array(N).fill(INF), par = new Int32Array(N).fill(-1), H = heap(1024);
  const node = (x, y) => round((y - y0) / cell) * nx + round((x - x0) / cell);
  const free = q => { const x = x0 + (q % nx) * cell, y = y0 + floor(q / nx) * cell; return T[q] <= thr || hypot(x - a[0], y - a[1]) < skip || hypot(x - b[0], y - b[1]) < skip; };
  const s = node(a[0], a[1]), e = node(b[0], b[1]), ei = e % nx, ej = floor(e / nx);
  const hh = q => hypot(q % nx - ei, floor(q / nx) - ej);
  g[s] = 0; H.push(hh(s), s);
  let found = false;
  while (H.size) {
    const q = H.pop();
    if (q === e) { found = true; break; }
    const i = q % nx, j = floor(q / nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const m = jj * nx + ii, w = g[q] + (di && dj ? 1.41421356 : 1);
      if (w < g[m] && free(m)) { g[m] = w; par[m] = q; H.push(w + hh(m), m); }
    }
  }
  if (!found) return null;
  const pts = [[b[0], b[1]]];
  for (let q = par[e]; q >= 0 && q !== s; q = par[q]) pts.push([x0 + (q % nx) * cell, y0 + floor(q / nx) * cell]);
  pts.push([a[0], a[1]]); pts.reverse();
  const out = [];
  let cur = 0;
  while (cur < pts.length - 1) {
    let nxt = pts.length - 1;
    while (nxt > cur + 1 && !clear(pts[cur][0], pts[cur][1], pts[nxt][0], pts[nxt][1])) nxt--;
    out.push(pts[nxt][0], pts[nxt][1]); cur = nxt;
  }
  return out;
}

/* ---------- adaptativo (§4.1.4) ---------- */
function* adaptiveGen(o) {
  const t0 = now(), tool = o.tool, R = tool.R, Dt = tool.D, cell = o.cell || 0.25, z = o.z, lift = o.linkLift != null ? o.linkLift : 0.3;
  const Fl = o.Flink || 8000, ds = o.ds || 0.5, sw = o.stockWall || 0, smoothN = o.smooth != null ? o.smooth : 2;
  const aeS = typeof o.ae === 'number' ? { wide: o.ae, mid: o.ae, narrow: o.ae, tight: o.ae } : Object.assign({ wide: 1.2, mid: 1.0, narrow: 0.8, tight: 0.6 }, o.ae);
  for (const k in aeS) if (!(aeS[k] > 0 && aeS[k] < Dt)) throw new Error('Strat.adaptive: ae fuera de (0, D)');
  const sdf = o.region, start = o.start || [0, 0], rS = o.rStart != null ? o.rStart : 3;
  const F = field(sdf, R + sw, cell, start), { nx, ny, D } = F, N = nx * ny;
  yield;
  const AE = aeField(F, Dt, aeS);
  yield;
  const seeds = [];
  for (let q = 0; q < N; q++) if (D[q] >= 0 && hypot(F.x0 + (q % nx) * cell - start[0], F.y0 + floor(q / nx) * cell - start[1]) <= rS) seeds.push(q);
  if (!seeds.length) throw new Error('Strat.adaptive: el inicio no está en el dominio de centros');
  const T = yield* march(F, AE, seeds, 2.01 * cell);
  /* celdas por nivel (cada celda en los niveles enteros que cruza) */
  let Lmax = 0;
  const tmin = new Float32Array(N), tmax = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    const i = c % nx;
    if (i >= nx - 1 || c + nx + 1 >= N) { tmin[c] = INF; continue; }
    const a = T[c], b = T[c + 1], d = T[c + nx + 1], e = T[c + nx];
    tmin[c] = min(a, b, d, e); tmax[c] = max(a, b, d, e);
    if (tmax[c] < INF) Lmax = max(Lmax, ceil(tmax[c]) - 1);
  }
  const cnt = new Int32Array(Lmax + 2);
  for (let c = 0; c < N; c++) if (tmin[c] < INF && tmax[c] < INF) for (let L = max(1, ceil(tmin[c])); L < tmax[c]; L++) cnt[L]++;
  const off = new Int32Array(Lmax + 3);
  for (let L = 1; L <= Lmax + 1; L++) off[L + 1] = off[L] + cnt[L];
  const cells = new Int32Array(off[Lmax + 2]), fill = off.slice();
  for (let c = 0; c < N; c++) if (tmin[c] < INF && tmax[c] < INF) for (let L = max(1, ceil(tmin[c])); L < tmax[c]; L++) cells[fill[L]++] = c;
  yield;

  const pb = new C.PathBuilder({ ds });
  const aeAt = (x, y) => { const i = clamp(round((x - F.x0) / cell), 0, nx - 1), j = clamp(round((y - F.y0) / cell), 0, ny - 1); return AE[j * nx + i]; };
  const cut = (x, y, ty) => { pb.feed(x, y, z, ty || 1); pb.blocks[pb.lastBlock()].ae = aeAt(x, y); };
  const st = { pieces: 0, links: 0, routed: 0, lifts: 0, levels: Lmax, leads: 0, noLead: 0 };
  /* enlace levantado a z + lift por la zona con T ≤ thr */
  const link = (x, y, thr) => {
    if (!pb.n) { pb.feed(x, y, z, 1); return; }
    if (hypot(x - pb.x, y - pb.y) < 0.05) return;
    let r = route(F, T, thr, [pb.x, pb.y], [x, y], 1.5);
    st.links++;
    if (!r) { r = [x, y]; st.lifts++; }
    else if (r.length > 2) st.routed++;
    pb.feed(pb.x, pb.y, z + lift, 4, Fl);
    for (let k = 0; k < r.length; k += 2) pb.feed(r[k], r[k + 1], z + lift, 4, Fl);
    pb.feed(x, y, z, 4, Fl);
  };
  const rhos = o.leadR || [6, 4.5, 3, 2, 1.2];
  const pend = [];
  for (let L = 1; L <= Lmax; L++) {
    const thr = L - 1 + 0.02;
    for (const c of iso(F, T, L, 1, cells.subarray(off[L], off[L + 1]))) {
      /* recorte por el borde del dominio, con el punto exacto de cruce */
      const p = c.p, n = p.length / 2, d = new Float64Array(n);
      for (let k = 0; k < n; k++) d[k] = F.at(D, p[2 * k], p[2 * k + 1]);
      if (c.closed && d.every(v => v >= 0)) { pend.push({ p, closed: true }); continue; }
      if (c.closed) {
        let k0 = 0; while (d[k0] >= 0) k0++;
        p.push(...p.splice(0, 2 * k0)); const dd = Array.from(d); dd.push(...dd.splice(0, k0)); d.set(dd);
        p.push(p[0], p[1]);
      }
      let cur = null;
      const flush = () => { if (cur && plen(cur, false) >= 0.5) pend.push({ p: cur, closed: false }); cur = null; };
      const m = c.closed ? n + 1 : n;
      for (let k = 0; k < m; k++) {
        const kk = k % n, x = p[2 * k], y = p[2 * k + 1], v = d[kk];
        if (k > 0) {
          const kp = k - 1, vp = d[kp % n];
          if ((vp >= 0) !== (v >= 0)) {
            const u = vp / (vp - v), cx = p[2 * kp] + (x - p[2 * kp]) * u, cy = p[2 * kp + 1] + (y - p[2 * kp + 1]) * u;
            if (v >= 0) cur = [cx, cy]; else { if (cur) cur.push(cx, cy); flush(); }
          }
        }
        if (v >= 0) { if (!cur) cur = []; cur.push(x, y); }
      }
      flush();
    }
    const lvl = pend.splice(0).map(q => ({ p: smoothN ? smooth(q.p, q.closed, ds) : resample(q.p, ds, q.closed), closed: q.closed }));
    while (lvl.length) {
      const px = pb.n ? pb.x : start[0], py = pb.n ? pb.y : start[1];
      let bi = 0, bd = INF;
      for (let k = 0; k < lvl.length; k++) {
        const q = lvl[k], dd = q.closed ? INF : hypot(q.p[0] - px, q.p[1] - py);
        let dm = dd;
        if (q.closed) for (let j = 0; j < q.p.length; j += 2) dm = min(dm, hypot(q.p[j] - px, q.p[j + 1] - py));
        if (dm < bd) { bd = dm; bi = k; }
      }
      const q = lvl.splice(bi, 1)[0];
      let p = q.closed ? rotateTo(q.p, px, py) : q.p;
      const okPt = (x, y, pre) => { const dv = F.at(D, x, y); if (dv < -0.02) return false; return !pre || F.at(T, x, y) <= thr; };
      const li = leadIn(F, p, q.closed, rhos, okPt, ds);
      st.pieces++;
      if (li) { st.leads++; link(li.lead[0], li.lead[1], thr); for (let k = 2; k < li.lead.length; k += 2) cut(li.lead[k], li.lead[k + 1]); p = p.slice(2 * li.from + 2); }
      else { st.noLead++; link(p[0], p[1], thr); p = p.slice(2); }
      for (let k = 0; k < p.length; k += 2) cut(p[k], p[k + 1]);
      if (q.closed) {
        /* cierre del bucle, 1 mm de solape y salida en cuarto de arco hacia lo vaciado */
        const full = li ? q.p.slice(0, 2 * li.from + 2) : q.p.slice(0, 2);
        for (let k = 0; k < full.length; k += 2) cut(full[k], full[k + 1]);
        const t = tangent(q.p, li ? li.from : 0, true), r = 2, cx = pb.x - r * t[1], cy = pb.y + r * t[0], a = atan2(pb.y - cy, pb.x - cx);
        const out = arcPts(cx, cy, r, a, PI / 2, ds);
        if (out.every((v, k) => k & 1 || okPt(v, out[k + 1], false))) for (let k = 2; k < out.length; k += 2) cut(out[k], out[k + 1]);
      }
      if (st.pieces % 16 === 0) yield;
    }
  }
  /* repaso del contorno del dominio: deja el sobreespesor de pared uniforme */
  const loops = iso(F, D, 0, -1).filter(c => c.closed).map(c => snap(resample(c.p, ds, true), sdf, R + sw));
  loopPass(pb, loops, { leadR: 2, types: [1, 1], link: (x, y) => link(x, y, Lmax + 1), at: cut, z, inside: (x, y) => F.at(D, x, y) >= -0.02 });
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
    for (let k = order < 0 ? K : 0; order < 0 ? k >= 0 : k <= K; k -= order) {
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
    const D = o.D, R = D / 2, rho = (o.slotW - D) / 2, z = o.z, Fe = o.Fedge, Fc = round(C.MECH.trochoidCenterF(Fe, rho, R)), Fr = round((o.returnFactor || 2.5) * Fe);
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
  /* semiacabado previo estampado de golpe: piel uniforme de `stock` sobre el modelo con la cresta de la bola a paso ae
     y la marca en la dirección de las pasadas. Por defecto congela el resultado como estado de reset() */
  skin(o) {
    const zm = o.zmap, m = o.model, st = o.stock || 0, T = o.tool, ae = o.ae, ax = o.axis === 'y' ? 1 : 0, id = o.toolId != null ? o.toolId : 9;
    const R = T.R, sdf = o.region ? asSdf(o.region) : null, h = zm.h, at = zm.at, ball = T.k === 1, c2 = ax ? -1 : 1;
    const g = round((c2 + 1) * 127.5), FL = C.ZMap.FLAG;
    for (let j = 0, q = 0; j < zm.ny; j++) for (let i = 0; i < zm.nx; i++, q++) {
      const x = zm.xc(i), y = zm.yc(j);
      if (sdf && sdf(x, y) > 0) continue;
      const w = ((ax ? x : y) - (o.offset || 0)) / ae, d = abs(w - round(w)) * ae;
      const nz = m[q] + st + (ball ? R - sqrt(max(0, R * R - d * d)) : 0);
      if (nz >= h[q]) continue;
      zm.removed += (h[q] - nz) * zm.cx * zm.cy; h[q] = nz;
      const w4 = q * 4; at[w4] = id; at[w4 + 1] = g; at[w4 + 2] = 128; at[w4 + 3] = (at[w4 + 3] | FL.CUT | FL.MARK | FL.SKIN) & ~FL.FLANK;
    }
    zm.markAll();
    if (o.save !== false) zm.saveBase();
    return zm;
  }
};
Strat._internal = { field, iso, edt, aeField, resample, smooth, signedArea };
})(globalThis);
