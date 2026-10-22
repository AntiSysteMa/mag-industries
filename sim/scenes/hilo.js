/* Escena hilo (§4.9): electroerosión por hilo de una abertura de matriz en D2 templado. Dos proyecciones, una por
   panel: a la izquierda una sección vertical por el hilo, normal a la trayectoria; a la derecha la planta. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define) return;
  const PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, hypot = Math.hypot;

  const SIM = 300, SPLIT = 0.38;
  const WIRE = { d: 0.25, kerf: 0.32, rate: 220 }, PLATE = { w: 60, h: 40, t: 20 };
  const HOLE = { x: -9.5, y: 0, r: 1 }, BRIDGE = 1.5;
  /* corte principal + 3 repasos: OFS decreciente, avance creciente; los repasos alternan sentido */
  const PASSES = [{ ofs: 0.190, F: WIRE.rate / PLATE.t, ccw: true }, { ofs: 0.150, F: 18, ccw: false },
    { ofs: 0.140, F: 30, ccw: true }, { ofs: 0.135, F: 45, ccw: false }];
  /* abertura en forma de llave (coordenadas de placa, antihoraria): cabeza 13 × 13, caña de 4 con dos dientes */
  const KEY = [-16, -6.5, -3, -6.5, -3, -2, 6, -2, 6, -5, 9, -5, 9, -2, 11, -2, 11, -5, 14, -5, 14, -2, 16, -2, 16, 2,
    -3, 2, -3, 6.5, -16, 6.5];
  const T = { idle: 0.6, thread: 1.0, settle: 0.5, fall: 0.9, m00: 0.6, end: 2.6 };
  const COL = { plate: '#7E868D', sect: '#737B82', hole: '#08141B', slot: '#0B161D', brass: '#C9A227',
    wall: ['#4E575E', '#69737B', '#87919A', '#A9B2BA'] };

  const NV = KEY.length / 2, vx = i => KEY[2 * ((i + NV) % NV)], vy = i => KEY[2 * ((i + NV) % NV) + 1];
  function perimeter() { let L = 0; for (let i = 0; i < NV; i++) L += hypot(vx(i + 1) - vx(i), vy(i + 1) - vy(i)); return L; }
  function area() { let A = 0; for (let i = 0; i < NV; i++) A += vx(i) * vy(i + 1) - vx(i + 1) * vy(i); return A / 2; }

  /* trayectoria del hilo a d hacia dentro: esquinas convexas de la abertura en arista viva (intersección de las
     paralelas) y arco de radio d alrededor de las reentrantes, que así quedan vivas en la placa */
  function offsetLoop(d) {
    const out = [];
    for (let i = 0; i < NV; i++) {
      const ax = vx(i) - vx(i - 1), ay = vy(i) - vy(i - 1), bx = vx(i + 1) - vx(i), by = vy(i + 1) - vy(i);
      const la = hypot(ax, ay), lb = hypot(bx, by), n1x = -ay / la, n1y = ax / la, n2x = -by / lb, n2y = bx / lb;
      const cr = ax * by - ay * bx;
      if (cr > 0) {
        const k = d / (1 + n1x * n2x + n1y * n2y);
        out.push(vx(i) + k * (n1x + n2x), vy(i) + k * (n1y + n2y));
      } else {
        let a0 = Math.atan2(n1y, n1x), a1 = Math.atan2(n2y, n2x);
        while (a1 > a0) a1 -= 2 * PI;
        const n = max(2, Math.ceil((a0 - a1) / (PI / 12)));
        for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push(vx(i) + d * Math.cos(a), vy(i) + d * Math.sin(a)); }
      }
    }
    return out;
  }
  /* bucle cerrado que empieza y acaba en la pared izquierda de la cabeza a la altura del agujero */
  function loopFrom(d, ccw) {
    const L = offsetLoop(d), sx = vx(0) + d, sy = HOLE.y, pts = [sx, sy];
    for (let k = 0; k < L.length; k++) pts.push(L[k]);
    pts.push(sx, sy);
    if (!ccw) for (let a = 0, b = pts.length - 2; a < b; a += 2, b -= 2) {
      const x = pts[a], y = pts[a + 1]; pts[a] = pts[b]; pts[a + 1] = pts[b + 1]; pts[b] = x; pts[b + 1] = y;
    }
    return pts;
  }
  function poly(pts, extra) {
    const n = pts.length / 2, x = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n);
    for (let k = 0; k < n; k++) { x[k] = pts[2 * k]; y[k] = pts[2 * k + 1]; if (k) s[k] = s[k - 1] + hypot(x[k] - x[k - 1], y[k] - y[k - 1]); }
    return Object.assign({ x, y, s, n, len: s[n - 1] }, extra);
  }
  /* punto a distancia u sobre la polilínea (k = tramo) */
  function at(P, u, o) {
    u = min(P.len, max(0, u));
    let lo = 1, hi = P.n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (P.s[m] < u) lo = m + 1; else hi = m; }
    const k = lo, L = P.s[k] - P.s[k - 1], f = L > 0 ? (u - P.s[k - 1]) / L : 1;
    o.x = P.x[k - 1] + (P.x[k] - P.x[k - 1]) * f; o.y = P.y[k - 1] + (P.y[k] - P.y[k - 1]) * f;
    o.dx = L > 0 ? (P.x[k] - P.x[k - 1]) / L : o.dx; o.dy = L > 0 ? (P.y[k] - P.y[k - 1]) / L : o.dy; o.k = k;
    return o;
  }

  function build() {
    const passes = PASSES.map((p, i) => {
      const loop = loopFrom(p.ofs, p.ccw), pts = [];
      /* el corte principal entra desde el centro del agujero; cada repaso arranca donde acabó el anterior */
      if (i === 0) pts.push(HOLE.x, HOLE.y);
      else pts.push(vx(0) + PASSES[i - 1].ofs, HOLE.y);
      for (let k = 0; k < loop.length; k++) pts.push(loop[k]);
      const P = poly(pts, { i, ofs: p.ofs, F: p.F, ccw: p.ccw, sign: p.ccw ? 1 : -1 });
      P.cut = i === 0 ? P.len - BRIDGE : P.len;
      P.dur = P.len / p.F * 60 / SIM;
      return P;
    });
    /* línea de tiempo visual (s) */
    const ph = [], add = (k, d, o) => { const t0 = ph.length ? ph[ph.length - 1].t1 : 0; ph.push(Object.assign({ k, t0, t1: t0 + d }, o)); };
    const p1 = passes[0];
    add('idle', T.idle); add('thread', T.thread); add('settle', T.settle);
    add('cut', p1.cut / p1.F * 60 / SIM, { p: 0, u0: 0, u1: p1.cut });
    add('bridge', BRIDGE / p1.F * 60 / SIM, { p: 0, u0: p1.cut, u1: p1.len });
    add('fall', T.fall); add('m00', T.m00);
    for (let i = 1; i < passes.length; i++) add('skim', passes[i].dur, { p: i, u0: 0, u1: passes[i].len });
    add('end', T.end);
    const D = ph[ph.length - 1].t1, mm = ph.filter(p => p.p != null).reduce((a, p) => a + (p.u1 - p.u0) / passes[p.p].F * 60, 0);
    return { passes, ph, D, machineS: mm, perimeter: perimeter(), area: area(), loops: passes.map(p => p.len) };
  }

  /* intersección de la recta W + u·N con una cápsula A–B de radio r (convexa: un solo intervalo) */
  function capsule(Wx, Wy, Nx, Ny, Ax, Ay, Bx, By, r, o) {
    let lo = Infinity, hi = -Infinity;
    const disc = (cx, cy) => {
      const px = Wx - cx, py = Wy - cy, b = Nx * px + Ny * py, c = px * px + py * py - r * r, q = b * b - c;
      if (q < 0) return;
      const s = sqrt(q);
      if (-b - s < lo) lo = -b - s; if (-b + s > hi) hi = -b + s;
    };
    disc(Ax, Ay); disc(Bx, By);
    const dx = Bx - Ax, dy = By - Ay, L = hypot(dx, dy);
    if (L > 1e-9) {
      const ex = dx / L, ey = dy / L, nx = -ey, ny = ex, px = Wx - Ax, py = Wy - Ay;
      let a = -Infinity, b = Infinity;
      const slab = (c0, c1, l0, l1) => {
        if (abs(c1) < 1e-12) { if (c0 < l0 || c0 > l1) { a = Infinity; } return; }
        let u0 = (l0 - c0) / c1, u1 = (l1 - c0) / c1;
        if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
        if (u0 > a) a = u0; if (u1 < b) b = u1;
      };
      slab(ex * px + ey * py, ex * Nx + ey * Ny, 0, L);
      slab(nx * px + ny * py, nx * Nx + ny * Ny, -r, r);
      if (a <= b) { if (a < lo) lo = a; if (b > hi) hi = b; }
    }
    if (lo > hi) return false;
    o[0] = lo; o[1] = hi;
    return true;
  }
  /* cortes de la recta con el contorno de la abertura (pares dentro) */
  function crossings(Wx, Wy, Nx, Ny, out) {
    let n = 0;
    for (let i = 0; i < NV; i++) {
      const ax = vx(i), ay = vy(i), bx = vx(i + 1), by = vy(i + 1), ex = bx - ax, ey = by - ay;
      const den = Nx * ey - Ny * ex;
      if (abs(den) < 1e-12) continue;
      const qx = ax - Wx, qy = ay - Wy, u = (qx * ey - qy * ex) / den, s = (qx * Ny - qy * Nx) / den;
      if (s >= 0 && s < 1) out[n++] = u;
    }
    for (let i = 1; i < n; i++) { const v = out[i]; let j = i - 1; while (j >= 0 && out[j] > v) { out[j + 1] = out[j]; j--; } out[j + 1] = v; }
    return n;
  }

  /* estado de la escena en t (s visuales): posición del hilo, pasada, distancia y lo que hay en la sección */
  function Machine(B) {
    const o = { x: HOLE.x, y: HOLE.y, dx: -1, dy: 0, k: 1, phase: B.ph[0], pass: 0, u: 0, cutU: 0, fell: 0, threaded: 0, moving: false };
    o.at = t => {
      const ph = B.ph;
      let p = ph[ph.length - 1];
      for (let i = 0; i < ph.length; i++) if (t < ph[i].t1) { p = ph[i]; break; }
      o.phase = p;
      const f = p.t1 > p.t0 ? min(1, max(0, (t - p.t0) / (p.t1 - p.t0))) : 1;
      const after = k => t >= ph.find(q => q.k === k).t1;
      o.threaded = p.k === 'idle' ? 0 : p.k === 'thread' ? f : 1;
      o.fell = p.k === 'fall' ? f : after('fall') ? 1 : 0;
      o.cutU = after('bridge') ? B.passes[0].len : p.k === 'cut' || p.k === 'bridge' ? p.u0 + (p.u1 - p.u0) * f : 0;
      o.moving = p.p != null && f < 1;
      if (p.p != null) { o.pass = p.p; o.u = p.u0 + (p.u1 - p.u0) * f; }
      else if (p.k === 'idle' || p.k === 'thread' || p.k === 'settle') { o.pass = 0; o.u = 0; }
      else if (p.k === 'end') { o.pass = B.passes.length - 1; o.u = B.passes[o.pass].len; }
      else { o.pass = 0; o.u = B.passes[0].len; }
      at(B.passes[o.pass], o.u, o);
      return o;
    };
    return o;
  }

  C.define('hilo', async function (env) {
    const V = C.V2D, PAL = C.PAL, t0 = G.performance.now(), fix = C.fmt.fix;
    const B = build(), M = Machine(B), D = B.D, rng = env.rng;
    const initMs = G.performance.now() - t0;
    /* sección: normal suavizada en el tiempo para que el plano no salte en cada esquina */
    const SEC = { nx: 0, ny: -1, init: false }, iv = new Float64Array(2), U = new Float64Array(256), X = new Float64Array(64);
    const SP = new Float32Array(4 * 8), tmp = {}, slug = new Float64Array(64);
    let t = 0, last = -1, L = null, rows = null, hudT = -1, hudAt = { t: 0, x: 0, y: 0 }, nSp = 0, nSlug = 0, slugN = { x: 0, y: 0, nx: 0, ny: 0 };
    const jobs = { n: 0, sum: 0, max: 0 }, spk = { maxArea: 0, maxN: 0, frames: 0, during: { fall: 0, idle: 0 } };

    const geo = () => {
      const w = env.frame.w, h = env.frame.h, bot = h - env.safe.bottom, div = Math.round(w * SPLIT);
      const hx = div + 7, hudH = 3 * 10.5 + 6, s = min((w - div - 14) / PLATE.w, (bot - hudH - 3) / PLATE.h);
      const sa = 3.2, yT = 46;
      return { w, h, bot, div, hx, s, px: div + (w - div) / 2, py: hudH + 3 + PLATE.h * s / 2, sa, yT, yB: yT + PLATE.t * sa, cx: div / 2, lvl: 20 };
    };
    /* planta: mm de placa → px del marco (Y hacia arriba) */
    const PX = x => L.px + x * L.s, PY = y => L.py - y * L.s;

    function section(dt) {
      const P = B.passes[M.pass], sg = P.sign, tx = -M.dy * sg, ty = M.dx * sg;
      if (!SEC.init || dt <= 0) { SEC.nx = tx; SEC.ny = ty; SEC.init = true; return; }
      const k = 1 - Math.exp(-dt / 0.05);
      let nx = SEC.nx + (tx - SEC.nx) * k, ny = SEC.ny + (ty - SEC.ny) * k;
      const l = hypot(nx, ny);
      if (l < 1e-6) { nx = tx; ny = ty; } else { nx /= l; ny /= l; }
      SEC.nx = nx; SEC.ny = ny;
    }
    /* intervalos vacíos de la sección en u (mm): agujero, ranura ejecutada y, tras la caída, la abertura */
    function voids(Wx, Wy, Nx, Ny, withSlot, open) {
      let n = 0;
      const push = (a, b) => { if (n < 254) { U[n++] = a; U[n++] = b; } };
      if (capsule(Wx, Wy, Nx, Ny, HOLE.x, HOLE.y, HOLE.x, HOLE.y, HOLE.r, iv)) push(iv[0], iv[1]);
      if (withSlot > 0) {
        const P = B.passes[0], r = WIRE.kerf / 2;
        for (let k = 1; k < P.n && P.s[k - 1] < withSlot; k++) {
          let bx = P.x[k], by = P.y[k];
          if (P.s[k] > withSlot) { const f = (withSlot - P.s[k - 1]) / (P.s[k] - P.s[k - 1]); bx = P.x[k - 1] + (bx - P.x[k - 1]) * f; by = P.y[k - 1] + (by - P.y[k - 1]) * f; }
          if (capsule(Wx, Wy, Nx, Ny, P.x[k - 1], P.y[k - 1], bx, by, r, iv)) push(iv[0], iv[1]);
        }
      }
      if (open) { const m = crossings(Wx, Wy, Nx, Ny, X); for (let i = 0; i + 1 < m; i += 2) push(X[i], X[i + 1]); }
      for (let i = 2; i < n; i += 2) {
        const a = U[i], b = U[i + 1]; let j = i - 2;
        while (j >= 0 && U[j] > a) { U[j + 2] = U[j]; U[j + 3] = U[j + 1]; j -= 2; }
        U[j + 2] = a; U[j + 3] = b;
      }
      let m = 0;
      for (let i = 0; i < n; i += 2) {
        if (m && U[i] <= U[m - 1]) { if (U[i + 1] > U[m - 1]) U[m - 1] = U[i + 1]; } else { U[m++] = U[i]; U[m++] = U[i + 1]; }
      }
      return m;
    }
    /* tramo de placa sobre la recta (rectángulo 60 × 40) */
    function plateSpan(Wx, Wy, Nx, Ny, o) {
      let a = -Infinity, b = Infinity;
      const slab = (p, d, l0, l1) => {
        if (abs(d) < 1e-12) { if (p < l0 || p > l1) a = Infinity; return; }
        let u0 = (l0 - p) / d, u1 = (l1 - p) / d; if (u0 > u1) { const q = u0; u0 = u1; u1 = q; }
        if (u0 > a) a = u0; if (u1 < b) b = u1;
      };
      slab(Wx, Nx, -PLATE.w / 2, PLATE.w / 2); slab(Wy, Ny, -PLATE.h / 2, PLATE.h / 2);
      o[0] = a; o[1] = b;
      return a < b;
    }
    /* trozos del retal en la sección en el instante de soltarse (entre la ranura y la pared opuesta) */
    function slugAt(Wx, Wy, Nx, Ny) {
      const m = voids(Wx, Wy, Nx, Ny, B.passes[0].len, false), q = crossings(Wx, Wy, Nx, Ny, X);
      nSlug = 0;
      for (let i = 0; i + 1 < q; i += 2) {
        let a = X[i], b = X[i + 1];
        for (let j = 0; j < m && a < b; j += 2) {
          const va = U[j], vb = U[j + 1];
          if (vb <= a || va >= b) continue;
          if (va - a > 0.1 && nSlug < 62) { slug[nSlug++] = a; slug[nSlug++] = va; }
          a = vb;
        }
        if (b - a > 0.1 && nSlug < 62) { slug[nSlug++] = a; slug[nSlug++] = b; }
      }
      slugN.x = Wx; slugN.y = Wy; slugN.nx = Nx; slugN.ny = Ny;
    }

    function sparks() {
      nSp = 0;
      const k = M.phase.k;
      if (!(k === 'cut' || k === 'bridge' || k === 'skim') || !M.moving) return;
      const fine = k === 'skim', n = 3 + Math.floor(rng() * (fine ? 3 : 4));
      let a = 0;
      for (let i = 0; i < n; i++) {
        const sz = fine || rng() < 0.6 ? 1 : 2;
        SP[4 * i] = (rng() - 0.5) * 1.2; SP[4 * i + 1] = 0.08 + 0.84 * rng(); SP[4 * i + 2] = sz; SP[4 * i + 3] = 0.4 + 0.4 * rng();
        a += sz * sz;
      }
      nSp = n;
      spk.frames++; if (a > spk.maxArea) spk.maxArea = a; if (n > spk.maxN) spk.maxN = n;
    }

    function step(tt, dt) {
      const wasFall = M.fell > 0;
      M.at(tt);
      section(dt);
      if (M.fell > 0 && !wasFall) { section(0); slugAt(M.x, M.y, SEC.nx, SEC.ny); }
      sparks();
    }

    /* ---- pintado ---- */
    function alzado(c) {
      const { cx, sa, yT, yB, div, bot } = L, Wx = M.x, Wy = M.y, Nx = SEC.nx, Ny = SEC.ny, Ux = cx / sa + 1;
      c.save();
      c.beginPath(); c.rect(0, 0, div, bot); c.clip();
      const open = M.fell > 0, m = voids(Wx, Wy, Nx, Ny, M.cutU, open), ps = plateSpan(Wx, Wy, Nx, Ny, iv);
      const sx = u => cx + u * sa;
      /* placa en sección: tramos de material entre los vacíos */
      c.beginPath();
      let segs = 0;
      if (ps) {
        let a = max(iv[0], -Ux), b = min(iv[1], Ux);
        for (let j = 0; j < m && a < b; j += 2) {
          const va = U[j], vb = U[j + 1];
          if (vb <= a) continue; if (va >= b) break;
          if (va > a) { c.rect(sx(a), yT, (va - a) * sa, yB - yT); segs++; }
          a = vb;
        }
        if (a < b) { c.rect(sx(a), yT, (b - a) * sa, yB - yT); segs++; }
      }
      if (segs) {
        c.save(); c.clip();
        c.fillStyle = COL.sect; c.fillRect(0, yT, div, yB - yT);
        hatchLines(c, 0, yT, div, yB - yT, 'rgba(18,26,32,.42)');
        c.fillStyle = 'rgba(205,215,225,.28)'; c.fillRect(0, yT, div, 1); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, yB - 1, div, 1);
        c.restore();
      }
      /* retal cayendo con la gravedad (la sección quedó fija en el punto del puente) */
      if (M.fell > 0 && M.fell < 1 && nSlug) {
        const ff = M.fell, dy = 0.5 * 900 * (ff * T.fall) * (ff * T.fall);
        c.save();
        c.beginPath();
        for (let i = 0; i < nSlug; i += 2) { const a = max(slug[i], -Ux), b = min(slug[i + 1], Ux); if (b > a) c.rect(sx(a), yT + dy, (b - a) * sa, yB - yT); }
        c.clip();
        c.fillStyle = COL.sect; c.fillRect(0, yT + dy, div, yB - yT);
        hatchLines(c, 0, yT + dy, div, yB - yT, 'rgba(18,26,32,.42)');
        c.restore();
      }
      heads(c);
      /* hilo, chorro coaxial tenue en la ranura y microchispas */
      const th = M.threaded;
      if (th > 0) {
        const y1 = min(yB, yT + (yB - yT) * 1.25 * th);
        if (th >= 1) { c.fillStyle = 'rgba(160,215,245,.16)'; c.fillRect(cx - 1.5, yT, 3, yB - yT); }
        c.fillStyle = COL.brass; c.fillRect(cx - 0.4, yT, 0.8, y1 - yT);
      }
      for (let i = 0; i < nSp; i++) {
        const sz = SP[4 * i + 2];
        c.globalAlpha = SP[4 * i + 3]; c.fillStyle = i & 1 ? '#DDEBFF' : '#9CC8FF';
        c.fillRect(Math.round(cx + SP[4 * i] - sz / 2), Math.round(yT + SP[4 * i + 1] * (yB - yT)), sz, sz);
      }
      c.globalAlpha = 1;
      /* agua desionizada: lámina azulada por encima de la placa */
      c.fillStyle = 'rgba(70,150,210,.10)'; c.fillRect(0, L.lvl, div, bot - L.lvl);
      c.fillStyle = 'rgba(150,210,245,.35)'; c.fillRect(0, L.lvl, div, 1);
      c.restore();
      c.fillStyle = 'rgba(140,160,178,.28)'; c.fillRect(div, 0, 1, bot);
    }
    function hatchLines(c, x, y, w, h, col) {
      c.strokeStyle = col; c.lineWidth = 0.75;
      c.beginPath();
      for (let d = -h; d < w; d += 4) { c.moveTo(x + d, y + h); c.lineTo(x + d + h, y); }
      c.stroke();
    }
    /* boquillas superior e inferior tocando la placa, y sus cabezales */
    function heads(c) {
      const { cx, sa, yT, yB, bot } = L, tip = 3 * sa, top = 6.5 * sa, hc = 7 * sa, body = 10 * sa;
      const cone = (y0, dir) => {
        const y1 = y0 - dir * hc;
        const g = c.createLinearGradient(cx - top, 0, cx + top, 0);
        g.addColorStop(0, '#3E454B'); g.addColorStop(0.35, '#7D868E'); g.addColorStop(0.55, '#68717A'); g.addColorStop(1, '#353B41');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(cx - tip, y0); c.lineTo(cx + tip, y0); c.lineTo(cx + top, y1); c.lineTo(cx - top, y1); c.closePath(); c.fill();
        c.fillStyle = 'rgba(205,215,225,.25)'; c.fillRect(cx - tip, dir > 0 ? y0 - 1 : y0, 2 * tip, 1);
        return y1;
      };
      const yu = cone(yT, 1);
      V.draw.cylinderShade(c, cx - body, 0, cx + body, yu, '#4A5056', { axis: 'v' });
      const yl = cone(yB, -1);
      V.draw.cylinderShade(c, cx - body, yl, cx + body, bot, '#4A5056', { axis: 'v' });
    }

    function planta(c) {
      const s = L.s, x0 = PX(-PLATE.w / 2), y0 = PY(PLATE.h / 2), w = PLATE.w * s, h = PLATE.h * s;
      c.fillStyle = COL.plate; c.fillRect(x0, y0, w, h);
      V.draw.noise(c, { x: x0, y: y0, w, h }, { seed: 7, amount: 0.05 });
      c.strokeStyle = 'rgba(205,215,225,.32)'; c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      c.fillStyle = COL.hole; c.beginPath(); c.arc(PX(HOLE.x), PY(HOLE.y), HOLE.r * s, 0, 2 * PI); c.fill();
      const P1 = B.passes[0];
      if (M.fell > 0) {
        c.globalAlpha = M.fell;
        c.fillStyle = COL.hole; c.beginPath();
        for (let i = 0; i < NV; i++) i ? c.lineTo(PX(vx(i)), PY(vy(i))) : c.moveTo(PX(vx(i)), PY(vy(i)));
        c.closePath(); c.fill();
        c.globalAlpha = 1;
      }
      /* programa del corte principal en discontinua y ranura de 0.32 detrás del hilo */
      if (M.fell < 1) {
        c.save(); c.strokeStyle = 'rgba(46,230,168,.55)'; c.lineWidth = 1; c.setLineDash([3, 3]);
        polyline(c, P1, M.cutU, P1.len); c.stroke(); c.restore();
      }
      if (M.cutU > 0 && M.fell < 1) {
        c.strokeStyle = COL.slot; c.lineWidth = max(1, WIRE.kerf * s); c.lineJoin = 'miter';
        polyline(c, P1, 0, M.cutU); c.stroke();
      }
      if (M.fell > 0) {
        /* pared: se aclara en cada repaso */
        const done = M.phase.k === 'skim' ? M.pass - 1 : M.phase.k === 'end' ? B.passes.length - 1 : 0;
        c.lineWidth = 1; c.lineJoin = 'miter';
        c.strokeStyle = COL.wall[done]; c.globalAlpha = M.fell;
        c.beginPath();
        for (let i = 0; i < NV; i++) i ? c.lineTo(PX(vx(i)), PY(vy(i))) : c.moveTo(PX(vx(i)), PY(vy(i)));
        c.closePath(); c.stroke(); c.globalAlpha = 1;
        if (M.phase.k === 'skim') {
          const P = B.passes[M.pass];
          c.strokeStyle = COL.wall[M.pass]; c.lineWidth = 1.2; polyline(c, P, 0, M.u); c.stroke();
          c.save(); c.strokeStyle = 'rgba(46,230,168,.4)'; c.lineWidth = 1; c.setLineDash([3, 3]); polyline(c, P, M.u, P.len); c.stroke(); c.restore();
        }
      }
      /* el hilo en planta es un punto; el aro tenue es la boquilla (Ø6) por encima */
      if (M.threaded >= 1) {
        const x = PX(M.x), y = PY(M.y);
        c.strokeStyle = 'rgba(205,215,225,.22)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 3 * s, 0, 2 * PI); c.stroke();
        c.fillStyle = '#0B161D'; c.beginPath(); c.arc(x, y, 1.9, 0, 2 * PI); c.fill();
        c.fillStyle = COL.brass; c.beginPath(); c.arc(x, y, 1.25, 0, 2 * PI); c.fill();
      }
    }
    function polyline(c, P, u0, u1) {
      c.beginPath();
      if (u1 <= u0) return;
      const o = at(P, u0, tmp);
      c.moveTo(PX(o.x), PY(o.y));
      for (let k = o.k; k < P.n && P.s[k] < u1; k++) c.lineTo(PX(P.x[k]), PY(P.y[k]));
      at(P, u1, o); c.lineTo(PX(o.x), PY(o.y));
    }

    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const p = M.phase, P = B.passes[M.pass], T1 = PAL.hud.text, VV = PAL.hud.value;
      let l1;
      if (p.k === 'idle' || p.k === 'thread') l1 = [{ text: 'enhebrado', color: VV }];
      else if (p.k === 'm00') l1 = [{ text: 'M00', color: PAL.gold }, { text: ' · retirar retal', color: VV }];
      else if (p.k === 'end') l1 = [{ text: 'M02', color: PAL.gold }, { text: ' · fin de programa', color: VV }];
      else {
        const F = M.moving ? P.F : 0;
        l1 = [{ text: 'pasada ', color: T1 }, { text: (M.pass + 1) + '/' + B.passes.length, color: VV }];
        if (p.k === 'bridge') l1.push({ text: ' · puente ', color: T1 }, { text: fix(BRIDGE, 1), color: VV });
        else l1.push({ text: ' · OFS ', color: T1 }, { text: fix(P.ofs, 3), color: VV }, { text: ' · F ', color: T1 }, { text: fix(F, 1), color: VV });
      }
      const xy = [{ text: 'X', color: T1 }, { text: fix(M.x - HOLE.x, 3), color: VV }, { text: ' Y', color: T1 }, { text: fix(M.y - HOLE.y, 3), color: VV }];
      rows = [l1, xy, [{ text: 'SIM ×' + SIM, color: PAL.hud.sim }]];
      hudAt.t = t; hudAt.x = M.x - HOLE.x; hudAt.y = M.y - HOLE.y;
    }
    /* si la primera línea no cabe antes del botón de pausa, el avance baja a la segunda */
    function hud(c) {
      c.save();
      c.font = '9px ui-monospace,Menlo,Consolas,monospace'; c.textBaseline = 'top'; c.lineJoin = 'round';
      c.lineWidth = 2; c.strokeStyle = 'rgba(4,26,37,.75)';
      const avail = L.w - 58 - L.hx, wd = r => r.reduce((a, p) => a + c.measureText(p.text).width, 0);
      let R = rows;
      if (wd(rows[0]) > avail && rows[0].length >= 6) {
        const r0 = rows[0], k = r0.length - 2;
        R = [r0.slice(0, k), [{ text: 'F ', color: r0[k].color }, r0[k + 1], { text: ' · ', color: PAL.hud.text }].concat(rows[1]), rows[2]];
      }
      R.forEach((row, k) => {
        let x = L.hx;
        const y = 5 + k * 10.5;
        for (const p of row) { c.strokeText(p.text, x, y); c.fillStyle = p.color; c.fillText(p.text, x, y); x += c.measureText(p.text).width; }
      });
      c.restore();
    }

    const scene = {
      duration: D,
      grid: '—',
      start() { t = 0; last = -1; hudT = -1; nSlug = 0; SEC.init = false; step(0, 0); texts(true); },
      update(tt, dt) {
        if (tt < last) { SEC.init = false; nSlug = 0; }
        const k0 = last >= 0 ? M.phase.k : '';
        t = tt; last = tt;
        step(tt, dt || 0);
        texts(false);
        const k = M.phase.k;
        return !(k === k0 && (k === 'idle' || k === 'm00' || k === 'end'));
      },
      render() {
        const c = env.ctx2d, q0 = G.performance.now();
        if (!L) scene.resize();
        alzado(c);
        planta(c);
        hud(c);
        const ms = G.performance.now() - q0;
        jobs.n++; jobs.sum += ms; if (ms > jobs.max) jobs.max = ms;
      },
      final() { t = D; last = D; nSlug = 0; M.at(D); SEC.init = false; section(0); nSp = 0; texts(true); },
      hud() { return {}; },
      resize() { L = geo(); hudT = -1; texts(true); },
      stats() {
        const fr = L ? L.w * L.h : 384 * 176;
        return { simFactor: SIM, cycleS: +D.toFixed(3), machineS: +B.machineS.toFixed(1), initOwnMs: +initMs.toFixed(2),
          perimeter: +B.perimeter.toFixed(2), passes: B.passes.map(p => ({ ofs: p.ofs, F: p.F, len: +p.len.toFixed(2), visualS: +p.dur.toFixed(3) })),
          phase: M.phase.k, pass: M.pass + 1, section: [+SEC.nx.toFixed(4), +SEC.ny.toFixed(4)], wire: { x: +(M.x - HOLE.x).toFixed(3), y: +(M.y - HOLE.y).toFixed(3) }, hudAt: { t: +hudAt.t.toFixed(4), x: +hudAt.x.toFixed(3), y: +hudAt.y.toFixed(3) },
          sparks: { now: nSp, maxN: spk.maxN, maxAreaPx: spk.maxArea, maxAreaPct: +(100 * spk.maxArea / fr).toFixed(4) },
          renderMs: { avg: +(jobs.sum / (jobs.n || 1)).toFixed(3), max: +jobs.max.toFixed(3), n: jobs.n } };
      },
      dispose() {}
    };
    return scene;
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('hilo', {
    tools: [], cuts: [],
    wire: WIRE, plate: PLATE, hole: HOLE, bridge: BRIDGE, passes: PASSES, sim: SIM, split: SPLIT, key: KEY, times: T,
    build, offsetLoop, capsule, crossings, perimeter, area, Machine
  });
})(globalThis);
