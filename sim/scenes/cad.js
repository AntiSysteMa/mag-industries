/* Escena cad (§4.6): visor CAD del mismo núcleo que acaba cinco-ejes (Shapes.nucleo), con giro lento y modos
   encadenados: alámbrico con ocultas, sombreado con aristas, cebra y curvatura. Mallas GL; sin GL queda el póster. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.Shapes || !C.Shapes.nucleo) return;
  const N = C.Shapes.nucleo, PI = Math.PI, RAD = PI / 180, abs = Math.abs, max = Math.max, min = Math.min, sqrt = Math.sqrt;
  const HW = N.body.w / 2, HH = N.body.h / 2, RC = N.body.r, CX = HW - RC, CY = HH - RC, ZP = N.plate.z1;

  /* el ciclo dura un periodo de giro: el bucle cierra con el mismo azimut */
  const D = 16, FADE = 0.4, AZ = -30, SWING = 25, EL = 30;
  const MODES = [['edges', 0, 'alámbrico'], ['shaded', 3.5, 'sombreado'], ['zebra', 7, 'cebra · continuidad G2'], ['curv', 11, 'curvatura']];
  const TESS = { A: [96, 64], B: [80, 52], C: [72, 44] };
  const ISO = { u: 8, v: 6 }, DS = 0.5;
  const CAD = '#9AA8B6', EDGE = '#1B2634';
  /* bandas por radio de curvatura mínimo (mm): plano en azul, lo más curvo en oro */
  const BANDS = [100, 50, 25, 14], RAMP = ['#4C9BFF', '#3DC0D4', '#2EE6A8', '#81CA70', '#D4AF37'];
  const BOX = [-N.plate.x1, -N.plate.y1, 0, N.plate.x1, N.plate.y1, 32];
  /* márgenes del encaje (arriba, derecha, abajo sobre el rótulo, izquierda), px del marco */
  const SAFE = [20, 8, 4, 8];

  /* media anchura de la huella R6 a una abscisa (y viceversa) */
  const halfY = x => abs(x) <= CX ? HH : CY + sqrt(max(0, RC * RC - (abs(x) - CX) ** 2));
  const halfX = y => abs(y) <= CY ? HW : CX + sqrt(max(0, RC * RC - (abs(y) - CY) ** 2));

  /* mayor curvatura principal de z = f(x, y) a partir de sus derivadas */
  function kOf(fx, fy, fxx, fxy, fyy) {
    const E = 1 + fx * fx, F = fx * fy, Gg = 1 + fy * fy, W = sqrt(E + fy * fy), dn = E * Gg - F * F;
    const L = fxx / W, M = fxy / W, Nn = fyy / W, K = (L * Nn - M * M) / dn, H = (E * Nn - 2 * F * M + Gg * L) / (2 * dn);
    return abs(H) + sqrt(max(0, H * H - K));
  }

  /* isoparamétricas repartidas por tramo de nudos: ninguna cae encima de la costura */
  function isoParams(knots, n) {
    const k = knots.filter((v, i) => !i || v !== knots[i - 1]), out = [], sp = [];
    for (let i = 1; i < k.length; i++) sp.push([k[i - 1], k[i] - k[i - 1], max(0, Math.round(n * (k[i] - k[i - 1])))]);
    let s = sp.reduce((a, q) => a + q[2], 0);
    while (s !== n) { const q = sp.reduce((a, b) => (s < n ? b[1] / (b[2] + 1) > a[1] / (a[2] + 1) : b[2] > a[2]) ? b : a); q[2] += s < n ? 1 : -1; s += s < n ? 1 : -1; }
    for (const q of sp) for (let j = 1; j <= q[2]; j++) out.push(q[0] + q[1] * j / (q[2] + 1));
    return out;
  }
  /* curva recortada por la huella, cortada en el contorno exacto */
  function isoLine(E, dir, t) {
    const u = dir === 'u', c = u ? -HW + 2 * HW * t : -HH + 2 * HH * t, h = u ? halfY(c) : halfX(c), n = Math.ceil(2 * h / DS);
    for (let k = 0, px, py, pz; k <= n; k++) {
      const s = -h + 2 * h * k / n, x = u ? c : s, y = u ? s : c, z = N.height(x, y);
      if (k) E.push(px, py, pz, x, y, z);
      px = x; py = y; pz = z;
    }
  }

  /* malla estructurada sobre la huella: columnas en x (los R6 muestreados por ángulo) y y = s·halfY(x) */
  const e0 = [0, 0, 0], e1 = [0, 0, 0];
  /* filas repartidas por √|θ''| del perfil (θ = pendiente en Y): el error de interpolar la normal es ∝ Δy²·θ'', así
     queda igualado en toda la cara y la cebra no se desvía en el flanco */
  const rowCache = {};
  function rows(nv) {
    if (rowCache[nv]) return rowCache[nv];
    const n = 880, w = new Float64Array(n + 1), th = y => Math.atan(N.eval(0, y, e0)[2]), h = 0.05;
    for (let i = 1; i <= n; i++) {
      const y = -HH + 2 * HH * (i - 0.5) / n;
      w[i] = w[i - 1] + sqrt(abs(th(y + h) - 2 * th(y) + th(y - h)) / (h * h)) + 0.02;
    }
    const out = new Float64Array(nv + 1);
    for (let j = 0, i = 0; j <= nv; j++) {
      const target = w[n] * j / nv;
      while (i < n && w[i + 1] < target) i++;
      out[j] = j === nv ? 1 : -1 + 2 * (i + (i < n ? (target - w[i]) / (w[i + 1] - w[i] || 1) : 0)) / n;
    }
    return (rowCache[nv] = out);
  }
  /* en los R6 las filas conservan su y salvo en la franja exterior, que se comprime hasta el contorno */
  const squeeze = (y, h) => { const a = 2 * h - HH, u = abs(y); return u <= a ? y : Math.sign(y) * (a + (u - a) * (h - a) / (HH - a)); };
  function grid(nu, nv, curv) {
    const m = Math.round(1.6 * nu * RC * PI / 2 / (2 * CX + RC * PI)), ns = nu - 2 * m, nx = nu + 1, nvt = nx * (nv + 1);
    const xs = new Float64Array(nx), hs = new Float64Array(nx), pos = new Float32Array(nvt * 3), nrm = new Float32Array(nvt * 3), kap = curv ? new Float32Array(nvt) : null;
    for (let k = 0; k <= nu; k++) {
      let th = 0, x;
      if (k < m) { th = PI / 2 * (1 - k / m); x = -CX - RC * Math.sin(th); }
      else if (k <= m + ns) x = -CX + 2 * CX * (k - m) / ns;
      else { th = PI / 2 * (k - m - ns) / m; x = CX + RC * Math.sin(th); }
      xs[k] = x; hs[k] = th ? CY + RC * Math.cos(th) : HH;
    }
    const sv = rows(nv);
    for (let j = 0, q = 0; j <= nv; j++) for (let k = 0; k <= nu; k++, q++) {
      const x = xs[k], y = squeeze(HH * sv[j], hs[k]), f = N.eval(x, y, e0), fx = f[1], fy = f[2], l = Math.hypot(fx, fy, 1);
      pos[q * 3] = x; pos[q * 3 + 1] = y; pos[q * 3 + 2] = f[0];
      nrm[q * 3] = -fx / l; nrm[q * 3 + 1] = -fy / l; nrm[q * 3 + 2] = 1 / l;
      if (curv) {
        /* diferencias de un lado (C2: el error es del orden de h) */
        const hx = x > 0 ? -0.01 : 0.01, hy = y > 0 ? -0.01 : 0.01;
        N.eval(x + hx, y, e1); const fxx = (e1[1] - fx) / hx, fxy = (e1[2] - fy) / hx;
        N.eval(x, y + hy, e1);
        kap[q] = kOf(fx, fy, fxx, (fxy + (e1[1] - fx) / hy) / 2, (e1[2] - fy) / hy);
      }
    }
    const idx = new (nvt > 65535 ? Uint32Array : Uint16Array)(nu * nv * 6);
    for (let j = 0, o = 0; j < nv; j++) for (let k = 0; k < nu; k++) {
      const a = j * nx + k, b = a + 1, c = a + nx, d = c + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = c;
    }
    return { nu, nv, m, ns, nx, pos, nrm, kap, idx };
  }

  const tess = tier => TESS[tier] || TESS.A;
  function shape(tier, S) {
    S = S || grid(tess(tier)[0], tess(tier)[1], false);
    const { nu, nv, m, ns, nx, pos } = S;
    /* contorno en sentido antihorario y paredes verticales con la normal exterior del rectángulo redondeado */
    const ring = [];
    for (let k = 0; k <= nu; k++) ring.push(k);
    for (let j = 1; j <= nv; j++) ring.push(j * nx + nu);
    for (let k = nu - 1; k >= 0; k--) ring.push(nv * nx + k);
    for (let j = nv - 1; j >= 1; j--) ring.push(j * nx);
    const nr = ring.length, wp = new Float32Array(nr * 6), wn = new Float32Array(nr * 6), wi = new Uint16Array(nr * 6), ER = [], EB = [], ET = [];
    for (let i = 0; i < nr; i++) {
      const q = ring[i] * 3, x = pos[q], y = pos[q + 1], z = pos[q + 2];
      let ox = 0, oy = 0;
      if (abs(x) > CX + 1e-9 && abs(y) > CY + 1e-9) { ox = x - Math.sign(x) * CX; oy = y - Math.sign(y) * CY; const l = Math.hypot(ox, oy); ox /= l; oy /= l; }
      else if (abs(x) >= HW - 1e-9) ox = Math.sign(x); else oy = Math.sign(y);
      wp.set([x, y, ZP, x, y, z], i * 6); wn.set([ox, oy, 0, ox, oy, 0], i * 6);
      const a = i * 2, b = ((i + 1) % nr) * 2;
      wi.set([a, b, a + 1, a + 1, b, b + 1], i * 6);
      const r = ring[(i + 1) % nr] * 3;
      ER.push(x, y, z, pos[r], pos[r + 1], pos[r + 2]); EB.push(x, y, ZP, pos[r], pos[r + 1], ZP);
    }
    /* verticales de tangencia: donde los R6 empalman con los lados rectos */
    for (const k of [0, m, m + ns, nu]) for (const j of [0, nv]) {
      const q = (j * nx + k) * 3;
      ET.push(pos[q], pos[q + 1], ZP, pos[q], pos[q + 1], pos[q + 2]);
    }
    const EI = [], ES = [], isoU = isoParams(N.surf.U, ISO.u), isoV = isoParams(N.surf.V, ISO.v);
    for (const t of isoU) isoLine(EI, 'u', t);
    for (const t of isoV) isoLine(EI, 'v', t);
    isoLine(ES, 'u', (N.seamsX[0] + HW) / (2 * HW));
    /* puntos de silueta para el encaje: esquinas de la placa, contorno superior y una muestra de la superficie */
    const sil = [];
    for (let i = 0; i < 8; i++) sil.push(i & 1 ? N.plate.x1 : N.plate.x0, i & 2 ? N.plate.y1 : N.plate.y0, i & 4 ? ZP : 0);
    for (let q = 0; q < nx * (nv + 1); q += 3) sil.push(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
    for (const q of ring) sil.push(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
    return Object.assign(S, { ring, isoU, isoV, sil: new Float32Array(sil), walls: { pos: wp, nrm: wn, idx: wi },
      edges: { part: new Float32Array(ER.concat(EB, ET)), iso: new Float32Array(EI), seam: new Float32Array(ES) } });
  }

  /* la curvatura usa siempre la teselación C: los bordes de banda salen recortados, no de la densidad de la malla */
  const kgrid = () => grid(TESS.C[0], TESS.C[1], true);
  function curv(S) {
    S = S || kgrid();
    let k = 0; for (let i = 0; i < S.kap.length; i++) k = max(k, S.kap[i]);
    return { kgrid: S, bands: curvBands(S.pos, S.nrm, S.kap, S.idx), rMin: 1 / k };
  }
  const build = tier => Object.assign(shape(tier), curv());

  /* bandas de curvatura: cada triángulo se recorta por los umbrales (el campo es lineal en el triángulo), así los bordes
     de banda siguen la curva de nivel y no los dientes de la teselación */
  function curvBands(pos, nrm, kap, idx) {
    const lim = [0].concat(BANDS.map(r => 1 / r), [1e9]), nb = lim.length - 1, nvt = kap.length, out = [];
    for (let b = 0; b < nb; b++) out.push({ P: new Float32Array(nvt * 6), Nn: new Float32Array(nvt * 6), nv: 0, I: new Uint32Array(idx.length * 2), ni: 0, map: new Int32Array(nvt).fill(-1), color: RAMP[b] });
    const grow = (a, n) => { if (n <= a.length) return a; const b = new a.constructor(Math.max(n, a.length * 2)); b.set(a); return b; };
    const bufs = [new Float64Array(56), new Float64Array(56)], ids = [new Int32Array(8), new Int32Array(8)];
    const band = k => { let b = 0; while (b < nb - 1 && k >= lim[b + 1]) b++; return b; };
    function put(O, buf, id, i) {
      if (id >= 0 && O.map[id] >= 0) return O.map[id];
      const n = O.nv++, o = i * 7, l = Math.hypot(buf[o + 3], buf[o + 4], buf[o + 5]) || 1;
      O.P = grow(O.P, n * 3 + 3); O.Nn = grow(O.Nn, n * 3 + 3);
      O.P[n * 3] = buf[o]; O.P[n * 3 + 1] = buf[o + 1]; O.P[n * 3 + 2] = buf[o + 2];
      O.Nn[n * 3] = buf[o + 3] / l; O.Nn[n * 3 + 1] = buf[o + 4] / l; O.Nn[n * 3 + 2] = buf[o + 5] / l;
      if (id >= 0) O.map[id] = n;
      return n;
    }
    const tri = (O, a, b, c) => { O.I = grow(O.I, O.ni + 3); O.I[O.ni++] = a; O.I[O.ni++] = b; O.I[O.ni++] = c; };
    /* Sutherland–Hodgman sobre el campo escalar: conserva k ≥ lv (o k < lv). Todo corte cae en una arista original del
       triángulo (las curvas de nivel no se cruzan) y se calcula desde ella en orden fijo: el vecino obtiene el mismo
       punto bit a bit y no quedan grietas entre bandas */
    const eg = [new Int32Array(16), new Int32Array(16)];
    function clip(s, si, se, n, d, di, de, lv, above) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ka = s[i * 7 + 6], kb = s[j * 7 + 6], ina = above ? ka >= lv : ka < lv, inb = above ? kb >= lv : kb < lv;
        if (ina) { for (let c = 0; c < 7; c++) d[m * 7 + c] = s[i * 7 + c]; di[m] = si[i]; de[m * 2] = se[i * 2]; de[m * 2 + 1] = se[i * 2 + 1]; m++; }
        if (ina !== inb) {
          let a = se[i * 2], b = se[i * 2 + 1] !== a ? se[i * 2 + 1] : se[j * 2];
          if (b === a) b = se[j * 2 + 1];
          if (a > b) { const t = a; a = b; b = t; }
          const f = (lv - kap[a]) / (kap[b] - kap[a]);
          for (let c = 0; c < 3; c++) { d[m * 7 + c] = pos[a * 3 + c] + (pos[b * 3 + c] - pos[a * 3 + c]) * f; d[m * 7 + 3 + c] = nrm[a * 3 + c] + (nrm[b * 3 + c] - nrm[a * 3 + c]) * f; }
          d[m * 7 + 6] = lv; di[m] = -1; de[m * 2] = a; de[m * 2 + 1] = b; m++;
        }
      }
      return m;
    }
    const v3 = [0, 0, 0];
    for (let t = 0; t < idx.length; t += 3) {
      v3[0] = idx[t]; v3[1] = idx[t + 1]; v3[2] = idx[t + 2];
      const b0 = band(kap[v3[0]]), b1 = band(kap[v3[1]]), b2 = band(kap[v3[2]]), lo = min(b0, b1, b2), hi = max(b0, b1, b2);
      for (let bb = lo; bb <= hi; bb++) {
        let s = 0, n = 3;
        for (let i = 0; i < 3; i++) {
          const v = v3[i], B = bufs[0];
          for (let q = 0; q < 3; q++) { B[i * 7 + q] = pos[v * 3 + q]; B[i * 7 + 3 + q] = nrm[v * 3 + q]; }
          B[i * 7 + 6] = kap[v]; ids[0][i] = v; eg[0][i * 2] = eg[0][i * 2 + 1] = v;
        }
        if (bb > lo) { n = clip(bufs[s], ids[s], eg[s], n, bufs[1 - s], ids[1 - s], eg[1 - s], lim[bb], true); s = 1 - s; }
        if (bb < hi) { n = clip(bufs[s], ids[s], eg[s], n, bufs[1 - s], ids[1 - s], eg[1 - s], lim[bb + 1], false); s = 1 - s; }
        if (n < 3) continue;
        const O = out[bb], B = bufs[s], I = ids[s], i0 = put(O, B, I[0], 0);
        for (let i = 1; i + 1 < n; i++) tri(O, i0, put(O, B, I[i], i), put(O, B, I[i + 1], i + 1));
      }
    }
    return out.filter(O => O.ni).map(O => ({ pos: O.P.slice(0, O.nv * 3), nrm: O.Nn.slice(0, O.nv * 3), idx: O.nv > 65535 ? O.I.slice(0, O.ni) : Uint16Array.from(O.I.subarray(0, O.ni)), color: O.color }));
  }

  /* ejes de pantalla de la orto (derecha, arriba) para un azimut */
  function axes(az, o) {
    const a = az * RAD, e = EL * RAD, sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e);
    o[0] = -sa; o[1] = ca; o[2] = 0; o[3] = -se * ca; o[4] = -se * sa; o[5] = Math.cos(e);
    return o;
  }
  /* px/mm con que la cámara encaja la caja BOX centrada en el objetivo */
  function boxScale(az, bw, bh) {
    const o = axes(az, []), h = [(BOX[3] - BOX[0]) / 2, (BOX[4] - BOX[1]) / 2, (BOX[5] - BOX[2]) / 2];
    let ex = 0, ey = 0;
    for (let i = 0; i < 3; i++) { ex += h[i] * abs(o[i]); ey += h[i] * abs(o[3 + i]); }
    return min(bw / (2 * ex), bh / (2 * ey));
  }
  /* encaje con pivote y escala fijos en todo el giro (la pieza no «respira»), medido sobre la silueta real */
  function framing(sil, bw, bh) {
    const o = axes(AZ, []), pv = [0, 0, 0];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < sil.length; i += 3) {
      const x = sil[i] * o[0] + sil[i + 1] * o[1], y = sil[i] * o[3] + sil[i + 1] * o[4] + sil[i + 2] * o[5];
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y);
    }
    for (let i = 0; i < 3; i++) pv[i] = o[i] * (x0 + x1) / 2 + o[3 + i] * (y0 + y1) / 2;
    let s = Infinity;
    for (let az = AZ - SWING; az <= AZ + SWING + 1e-9; az += 1) {
      axes(az, o);
      let mx = 0, my = 0;
      for (let i = 0; i < sil.length; i += 3) {
        const dx = sil[i] - pv[0], dy = sil[i + 1] - pv[1], dz = sil[i + 2] - pv[2];
        mx = max(mx, abs(dx * o[0] + dy * o[1])); my = max(my, abs(dx * o[3] + dy * o[4] + dz * o[5]));
      }
      s = min(s, bw / (2 * mx), bh / (2 * my));
    }
    return { pv, s, bbox: [pv[0] + BOX[0], pv[1] + BOX[1], pv[2] - BOX[5] / 2, pv[0] + BOX[3], pv[1] + BOX[4], pv[2] + BOX[5] / 2] };
  }

  C.define('cad', async function (env) {
    const gl = env.gl, V = C.V2D, PAL = C.PAL;
    const scene = { duration: D, start() {}, update() { return false; }, render() {}, final() {}, hud() { return null; }, resize() {} };
    if (!gl) return scene;
    const now = () => performance.now(), tm = { t0: now() };
    const g0 = grid(tess(env.tier)[0], tess(env.tier)[1], false);
    tm.grid = now() - tm.t0;
    await env.idle();
    const M = shape(env.tier, g0);
    tm.shape = now() - tm.t0;
    await env.idle();
    tm.idle = now() - tm.t0;
    const mat = c => ({ color: c, metal: 0.25, gloss: 0.5 });
    const surf = gl.mesh({ kind: 'custom', pos: M.pos, nrm: M.nrm, idx: M.idx, edges: M.edges.iso, material: mat(CAD), zebra: 9 });
    const walls = gl.mesh({ kind: 'custom', pos: M.walls.pos, nrm: M.walls.nrm, idx: M.walls.idx, edges: M.edges.part, material: mat(CAD) });
    const plate = gl.mesh({ kind: 'box', size: [BOX[3] * 2, BOX[4] * 2, ZP], at: [0, 0, ZP / 2], material: mat(CAD) });
    /* portador de la costura: triángulo degenerado; solo aporta sus aristas con estilo propio */
    const s0 = M.edges.seam, seam = gl.mesh({ kind: 'custom', pos: s0.slice(0, 9), idx: new Uint16Array([0, 0, 0]), edges: s0, material: mat(CAD) });
    /* la pieza se pinta girada 90° en Z (X de pieza = Y del mundo GL): los tubos de la cebra, paralelos a Y del mundo,
       quedan a lo largo de la cresta y las franjas cruzan la costura. La cámara gira lo mismo: en pantalla no cambia nada */
    const ROT = new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), rot = p => [-p[1], p[0], p[2]];
    const it = (h, o) => Object.assign({ h, M: ROT }, o);
    const solid = { mode: 'shaded', edges: true, edgeColor: EDGE };
    const L = {
      edges: [it(plate, { mode: 'edges' }), it(walls, { mode: 'edges' }), it(surf, { mode: 'edges' }), it(seam, { mode: 'edges' })],
      shaded: [it(plate, solid), it(walls, solid), it(surf, { mode: 'shaded' }), it(seam, { mode: 'shaded', edges: true, edgeColor: EDGE, edgeWidth: 0.6, alpha: 0.8 })],
      zebra: [it(plate, solid), it(walls, solid), it(surf, { mode: 'zebra' }), it(seam, { mode: 'shaded', edges: true, edgeColor: PAL.gold, edgeWidth: 0.8, alpha: 0.9 })],
      curv: [it(plate, solid), it(walls, solid), it(seam, { mode: 'shaded', edges: true, edgeColor: EDGE, edgeWidth: 0.6, alpha: 0.8 })]
    };
    /* las bandas de curvatura no hacen falta hasta t = 11 s: se preparan después del primer fotograma, en trozos */
    let K = null;
    const bands = K0 => {
      if (K) return;
      K = curv(K0);
      for (const b of K.bands) L.curv.push(it(gl.mesh({ kind: 'custom', pos: b.pos, nrm: b.nrm, idx: b.idx, material: { color: b.color, metal: 0, gloss: 0.2 } }), { mode: 'shaded' }));
    };
    env.idle().then(() => { if (!K) { const g = kgrid(); return env.idle().then(() => bands(g)); } }).catch(() => {});
    const cam = { type: 'ortho', az: AZ, el: EL, zoom: 1, fit: { bbox: BOX, safe: null } };
    const LBL = MODES.map(md => [{ text: md[2], color: PAL.hud.value }]);
    LBL[3][0] = { parts: [{ text: MODES[3][2], color: PAL.hud.value }, { text: ' · plano ', color: PAL.hud.text }].concat(RAMP.map(c => ({ text: '■', color: c })), [{ text: ' curvo', color: PAL.hud.text }]) };
    const tri = [[0, 0], [0, 0], [0, 0], [0, 0]], tv = { x: [0, 0], y: [0, 0], z: [0, 0] }, TP = [[0, 0, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1]];
    let t = 0, fin = false, fk = '', fr = null, sf = null;
    tm.meshes = now() - tm.t0;
    await gl.whenReady();
    tm.ready = now() - tm.t0;

    function fit() {
      const F = env.frame, s = env.safe, k = F.w + 'x' + F.h + ':' + s.top + ',' + s.right + ',' + s.bottom + ',' + s.left;
      if (k === fk) return;
      fk = k;
      sf = { top: max(s.top, SAFE[0]), right: max(s.right, SAFE[1]), bottom: max(s.bottom, 18) + SAFE[2], left: max(s.left, SAFE[3]) };
      fr = framing(M.sil, F.w - sf.left - sf.right, F.h - sf.top - sf.bottom);
      const b = fr.bbox;
      cam.target = rot(fr.pv); cam.fit.bbox = [-b[4], b[0], b[2], -b[1], b[3], b[5]]; cam.fit.safe = sf;
    }
    function at(tt) {
      let i = MODES.length - 1;
      while (i > 0 && tt < MODES[i][1]) i--;
      const f = i > 0 ? (tt - MODES[i][1]) / FADE : 1;
      return f < 1 ? [i - 1, i, f] : [i, -1, 1];
    }
    function triad(c) {
      for (let i = 0; i < 4; i++) gl.project(TP[i], tri[i]);
      let lm = 0;
      for (let i = 1; i < 4; i++) lm = max(lm, Math.hypot(tri[i][0] - tri[0][0], tri[i][1] - tri[0][1]));
      const ax = ['x', 'y', 'z'];
      for (let i = 1; i < 4; i++) { const v = tv[ax[i - 1]]; v[0] = (tri[i][0] - tri[0][0]) / lm; v[1] = (tri[i][1] - tri[0][1]) / lm; }
      const F = env.frame;
      V.draw.triad2D(c, F.w - 30, F.h - sf.bottom - 16, tv);
    }

    Object.assign(scene, {
      grid: 'malla ' + M.nu + 'x' + M.nv,
      start() { t = 0; fin = false; },
      update(tt) { t = tt; fin = false; return true; },
      render() {
        if (!tm.first) tm.first = -1;
        fit();
        const az = fin ? AZ : AZ + SWING * Math.sin(2 * PI * t / D), md = fin ? [1, -1, 1] : at(t), c = env.ctx2d;
        cam.az = az + 90; cam.zoom = fr.s / boxScale(az, env.frame.w - sf.left - sf.right, env.frame.h - sf.top - sf.bottom);
        gl.camera(cam);
        c.save();
        if (md[0] === 3 || md[1] === 3) bands();
        if (md[1] < 0) gl.frame(L[MODES[md[0]][0]]);
        else {
          c.globalAlpha = 1 - md[2]; gl.frame(L[MODES[md[0]][0]]);
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = md[2]; gl.frame(L[MODES[md[1]][0]]);
          c.globalCompositeOperation = 'source-over';
        }
        c.globalAlpha = md[1] < 0 ? 1 : 1 - md[2];
        V.draw.hudText(c, 10, 8, LBL[md[0]], { size: 9.5 });
        if (md[1] >= 0) { c.globalAlpha = md[2]; V.draw.hudText(c, 10, 8, LBL[md[1]], { size: 9.5 }); }
        c.globalAlpha = 1;
        triad(c);
        c.restore();
        if (tm.first < 0) tm.first = now() - tm.t0;
      },
      final() { fin = true; t = 0; },
      resize() { fk = ''; },
      stats() {
        const m = gl.ms, md = at(t);
        return { mode: fin ? 'shaded' : MODES[md[1] < 0 ? md[0] : md[1]][0], az: +(cam.az - 90).toFixed(2), tess: M.nu + 'x' + M.nv, tris: M.idx.length / 3,
          bandTris: K ? K.bands.reduce((a, b) => a + b.idx.length / 3, 0) : 0, edgeSegs: (M.edges.part.length + M.edges.iso.length + M.edges.seam.length) / 6,
          rMin: K ? +K.rMin.toFixed(2) : null, initParts: tm, glSync: m ? +m.sync.toFixed(3) : null, glDraw: m ? +m.draw.toFixed(3) : null, glCopy: m ? +m.copy.toFixed(3) : null };
      },
      dispose() { gl.dispose(); }
    });
    return scene;
  }, { kind: 'gl', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('cad', { tools: [], cuts: [], duration: D, modes: MODES, tess: TESS, iso: ISO, bands: BANDS, box: BOX, build, shape, curv, grid, kOf, isoParams, halfX, halfY, axes, boxScale, framing });
})(globalThis);
