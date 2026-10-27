/* Figura del artículo trocoidal (§4.12): ranurado a pleno ancho frente a trocoidal con la misma fresa, en planta sobre
   el viewBox de la figura (640×280). El arco rojo es el contacto medido sobre un Z-map con la regla de ZMap.engagement. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.ZMap || !C.Tool) return;
  const PI = Math.PI, hypot = Math.hypot;

  /* Se trabaja en mm de pieza (Y hacia arriba) y se dibuja en u del viewBox (Y hacia abajo): la Ø10 mide 62 u */
  const K = 6.2, VB = { w: 640, h: 280 }, SIM = 2.5;
  const TOOL = { id: 'T1', num: 1, kind: 'flat', D: 10, z: 6, lc: 25, oal: 75, helix: 40, shank: 10, stick: 34, coat: '#3B3640',
    holder: { type: 'shrink', A: 100, nose: 24, bore: 41, flange: 63, iface: 'HSK-A63' },
    cut: { S: 3820, F: 1375, fz: 0.06, vc: 120, ae: 0.8, ap: 15 } };
  /* envolvente de un bucle completo (ρ + R): estampa de golpe los bucles ya cerrados al saltar en el tiempo */
  const LOOP_TOOL = { id: 'E', num: 9, kind: 'flat', D: 20, z: 2, lc: 20, oal: 60, shank: 20, stick: 30,
    holder: { type: 'shrink', A: 100, nose: 32, bore: 46, flange: 63, iface: 'HSK-A63' }, cut: { S: 1, F: 1, ae: 1, ap: 1 } };
  const R = 5, RHO = 5, SUB = 2, STEP = 0.8, LOOPS = 31, FE = 1375, FC = FE * RHO / (RHO + R), FR = 2.5 * FE, NCUT = 60, NRET = 30;
  /* u del viewBox. TXT: cajas de los textos del SVG (getBBox con Barlow, + 2 u) que el historial de bucles no pisa */
  const L = { stock: [30, 60, 280, 230], ax: 155, c0: 261, c1: 110, z: -1, bottom: -2 };
  const RT = { stock: [360, 60, 610, 230], ax: 485, c0: 292, z: -15, bottom: -16 };
  const TXT = [[27, 19, 220, 39], [135, 139, 175, 166], [115, 166, 195, 184], [79, 238, 231, 257],
    [357, 19, 439, 39], [478, 142, 523, 169], [460, 169, 540, 187], [420, 238, 550, 257]];
  const COL = { stock: '#0F1823', edge: '#2C3B4C', slot: '#16222F', wall: '#4A5B6E', tool: '#CDD8E4' };

  const mx = u => u / K, my = v => (VB.h - v) / K, ux = x => x * K, uy = y => VB.h - y * K;

  /* Bucles en G3 vistos desde +Z (concordancia con M03): semicírculo de corte alrededor de c_k, del flanco derecho al
     izquierdo pasando por delante, y retorno por detrás hasta el flanco derecho del siguiente. F de centro compensado. */
  function path() {
    const n = 1 + LOOPS * NCUT + (LOOPS - 1) * NRET, x = new Float64Array(n), y = new Float64Array(n), t = new Float64Array(n);
    const half = new Uint8Array(n), ls = new Uint32Array(LOOPS + 1), cx = mx(RT.ax), y0 = my(RT.c0);
    let k = 0;
    const put = (px, py, f, h) => {
      if (k) t[k] = t[k - 1] + hypot(px - x[k - 1], py - y[k - 1]) / (f / 60);
      x[k] = px; y[k] = py; half[k] = h; k++;
    };
    put(cx + RHO, y0, FC, 0);
    for (let i = 0; i < LOOPS; i++) {
      const cy = y0 + i * STEP;
      ls[i] = k - 1;
      for (let q = 1; q <= NCUT; q++) { const a = PI * q / NCUT; put(cx + RHO * Math.cos(a), cy + RHO * Math.sin(a), FC, 1); }
      if (i === LOOPS - 1) break;
      const ry = cy + STEP / 2, r = hypot(RHO, STEP / 2), a0 = Math.atan2(-STEP / 2, -RHO);
      for (let q = 1; q <= NRET; q++) { const a = a0 + PI * q / NRET; put(cx + r * Math.cos(a), ry + r * Math.sin(a), FR, 2); }
    }
    ls[LOOPS] = k - 1;
    return { n, x, y, t, half, ls, T: t[n - 1], cx, y0 };
  }

  /* Contacto como ZMap.engagement (180 muestras a R + 0.6·celda, material si h > punta + 0.05, semicírculo delantero,
     mayor arco contiguo) pero cerrando huecos de una muestra: donde la media luna adelgaza a una celda, la escalera de la
     envolvente anterior partía el arco y su longitud saltaba de 48 a 20° (requests/P-A1-engagement-huecos.md) */
  const NS = 180, CS = new Float64Array(NS), SN = new Float64Array(NS), MK = new Uint8Array(NS), MK2 = new Uint8Array(NS);
  for (let q = 0; q < NS; q++) { CS[q] = Math.cos(2 * PI * q / NS); SN[q] = Math.sin(2 * PI * q / NS); }
  function contact(zm, R, p, dir, out) {
    const r = R + 0.6 * zm.cell, zt = p[2] + 0.05, nx = zm.nx, ny = zm.ny;
    let n = 0;
    for (let q = 0; q < NS; q++) {
      const i = Math.floor((p[0] + r * CS[q] - zm.ox) / zm.cx), j = Math.floor((p[1] + r * SN[q] - zm.oy) / zm.cy);
      n += MK[q] = CS[q] * dir[0] + SN[q] * dir[1] > -1e-9 && i >= 0 && j >= 0 && i < nx && j < ny && zm.h[j * nx + i] > zt ? 1 : 0;
    }
    out.deg = out.a0 = out.a1 = 0;
    if (!n) return out;
    for (let q = 0; q < NS; q++) MK2[q] = MK[q] || (MK[(q + NS - 1) % NS] && MK[(q + 1) % NS]) ? 1 : 0;
    let s = 0;
    while (s < NS && MK2[s]) s++;
    if (s === NS) { out.deg = 360; out.a1 = 2 * PI; return out; }
    let best = 0, bs = 0, run = 0, rs = 0;
    for (let q = 1; q <= NS; q++) {
      const k = (s + q) % NS;
      if (MK2[k]) { if (!run) rs = k; if (++run > best) { best = run; bs = rs; } } else run = 0;
    }
    out.deg = best * 360 / NS; out.a0 = (bs - 0.5) * 2 * PI / NS; out.a1 = out.a0 + best * 2 * PI / NS;
    return out;
  }

  /* Estado de la simulación (sin DOM): un Z-map por figura, a media u por celda (0.08 mm) */
  function Sim(P) {
    /* sin chaflán: en planta el contacto se mide a la cota de la punta y el anillo del chaflán contaría como material */
    const T = new C.Tool(Object.assign({}, TOOL, { chamfer: 0 })), E = new C.Tool(Object.assign({}, LOOP_TOOL, { chamfer: 0 }));
    const zmap = (s, x0, x1, z) => new C.ZMap({ ox: mx(x0), oy: my(s.stock[3]), sx: (x1 - x0) / K, sy: (s.stock[3] - s.stock[1]) / K,
      nx: (x1 - x0) * SUB, ny: (s.stock[3] - s.stock[1]) * SUB, top: 0, bottom: z });
    const zl = zmap(L, 120, 190, L.bottom), zr = zmap(RT, 420, 550, RT.bottom), yl0 = my(L.c0), yl1 = my(L.c1);
    const a = [0, 0, 0], b = [0, 0, 0], d = [0, 1];
    const s = { T, zl, zr, P, k: 1, tm: 0, r: [0, 0, RT.z], l: [mx(L.ax), yl0, L.z], dr: [1, 0], eR: { deg: 0, a0: 0, a1: 0 }, eL: { deg: 0, a0: 0, a1: 0 } };
    const sweep = (zm, p, x, y) => {
      const dx = x - p[0], dy = y - p[1], l = hypot(dx, dy);
      if (l < 1e-9) return false;
      a[0] = p[0]; a[1] = p[1]; a[2] = p[2]; b[0] = x; b[1] = y; b[2] = p[2];
      zm.sweep(T, a, b, 1, false);
      p[0] = x; p[1] = y;
      if (zm === zr) { s.dr[0] = dx / l; s.dr[1] = dy / l; }
      return true;
    };
    const meter = (zm, p, dir, e) => contact(zm, R, p, dir, e);
    s.yl = tm => yl0 + (yl1 - yl0) * Math.min(1, tm / P.T);
    s.reset = () => {
      zl.reset(); zr.reset();
      s.k = 1; s.tm = 0; s.r[0] = P.x[0]; s.r[1] = P.y[0]; s.l[1] = yl0; s.dr[0] = 0; s.dr[1] = 1;
      s.eR.deg = s.eL.deg = 0;
    };
    s.to = tm => {
      tm = Math.min(Math.max(tm, s.tm), P.T);
      let moved = false;
      while (s.k < P.n && P.t[s.k] <= tm) { moved = sweep(zr, s.r, P.x[s.k], P.y[s.k]) || moved; s.k++; }
      if (s.k < P.n) {
        const k = s.k, f = (tm - P.t[k - 1]) / (P.t[k] - P.t[k - 1]);
        moved = sweep(zr, s.r, P.x[k - 1] + (P.x[k] - P.x[k - 1]) * f, P.y[k - 1] + (P.y[k] - P.y[k - 1]) * f) || moved;
      }
      /* parado (mismo t dos veces: seek, repintado) se conserva la última medida */
      if (moved) meter(zr, s.r, s.dr, s.eR);
      if (sweep(zl, s.l, s.l[0], s.yl(tm))) meter(zl, s.l, d, s.eL);
      s.tm = tm;
    };
    s.loop = tm => { let i = 0; while (i < LOOPS - 1 && P.t[P.ls[i + 1]] <= tm) i++; return i; };
    /* salto determinista: los bucles cerrados son la envolvente de radio ρ + R entre el primer centro y el último */
    s.jump = tm => {
      s.reset();
      const i = s.loop(tm), cx = P.cx;
      if (i > 0) {
        a[0] = b[0] = cx; a[1] = P.y0; b[1] = P.y0 + (i - 1) * STEP; a[2] = b[2] = RT.z;
        zr.sweep(E, a, b, 1, false);
        s.k = P.ls[i] + 1; s.r[0] = P.x[P.ls[i]]; s.r[1] = P.y[P.ls[i]]; s.tm = P.t[P.ls[i]];
      }
      sweep(zl, s.l, s.l[0], s.yl(s.tm));
      s.to(tm);
    };
    /* instante de máximo contacto del último bucle (fotograma de movimiento reducido) */
    s.peak = () => {
      const i0 = P.ls[LOOPS - 1], i1 = i0 + NCUT;
      s.jump(P.t[i0]);
      let best = 0, tb = P.t[i0];
      for (let k = i0 + 1; k <= i1; k++) { s.to(P.t[k]); if (s.eR.deg > best) { best = s.eR.deg; tb = P.t[k]; } }
      return { t: tb, deg: best };
    };
    return s;
  }

  C.define('blog-trocoidal', async function (env) {
    const PAL = C.PAL, P = path(), S = Sim(P), VD = P.T / SIM;
    const loops = [], red = PAL.alert, hist = PAL.css(PAL.green, 0.28);
    let t = 0, peak = null, maxDeg = 0;
    S.reset();

    const loopPath = i => {
      if (!loops[i]) {
        const p = new G.Path2D();
        for (let k = P.ls[i]; k <= P.ls[i + 1]; k++) (k === P.ls[i] ? p.moveTo : p.lineTo).call(p, ux(P.x[k]), uy(P.y[k]));
        loops[i] = p;
      }
      return loops[i];
    };
    const clipOut = (c, r) => {
      c.beginPath(); c.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      for (const b of TXT) c.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      c.clip('evenodd');
    };
    const stock = (c, s) => {
      const r = s.stock;
      c.fillStyle = COL.stock; c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      c.strokeStyle = COL.edge; c.lineWidth = 1; c.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - r[0] - 1, r[3] - r[1] - 1);
    };
    const capsule = (c, x, y0, y1, w) => {
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
    };
    const walls = (c, x0, x1, y0, y1) => {
      if (y1 >= y0) return;
      c.strokeStyle = COL.wall; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x0, y0); c.lineTo(x0, y1); c.moveTo(x1, y0); c.lineTo(x1, y1); c.stroke();
    };
    const tool = (c, x, y, e) => {
      const r = R * K;
      if (e.deg > 0) {
        c.strokeStyle = red; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.arc(x, y, r, -e.a1, -e.a0); c.stroke();
        c.lineCap = 'butt';
      }
      c.strokeStyle = COL.tool; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r, 0, 2 * PI); c.stroke();
      c.fillStyle = COL.tool; c.beginPath(); c.arc(x, y, 3, 0, 2 * PI); c.fill();
    };

    function draw(c) {
      const i = S.loop(S.tm), xl = ux(S.l[0]), yl = uy(S.l[1]), xr = ux(S.r[0]), yr = uy(S.r[1]), D = 2 * R * K;
      stock(c, L); stock(c, RT);
      c.save();
      c.beginPath(); c.rect(L.stock[0], L.stock[1], L.stock[2] - L.stock[0], L.stock[3] - L.stock[1]);
      c.rect(RT.stock[0], RT.stock[1], RT.stock[2] - RT.stock[0], RT.stock[3] - RT.stock[1]); c.clip();
      c.strokeStyle = COL.slot; c.lineCap = 'round'; c.lineJoin = 'round';
      capsule(c, xl, L.c0, yl, D);
      const yc = uy(P.y0 + (i - 1) * STEP);
      if (i > 0) capsule(c, ux(P.cx), RT.c0, yc, 2 * D);
      c.lineWidth = D; c.beginPath(); c.moveTo(ux(P.x[P.ls[i]]), uy(P.y[P.ls[i]]));
      for (let k = P.ls[i] + 1; k < S.k; k++) c.lineTo(ux(P.x[k]), uy(P.y[k]));
      c.lineTo(xr, yr); c.stroke();
      c.lineCap = 'butt'; c.lineJoin = 'miter';
      walls(c, L.ax - D / 2, L.ax + D / 2, L.stock[3], yl);
      if (i > 0) walls(c, RT.ax - D, RT.ax + D, RT.stock[3], yc);
      c.save();
      clipOut(c, [0, 0, VB.w, VB.h]);
      c.strokeStyle = hist; c.lineWidth = 0.8;
      for (let q = 0; q < i; q++) c.stroke(loopPath(q));
      c.beginPath(); c.moveTo(ux(P.x[P.ls[i]]), uy(P.y[P.ls[i]]));
      for (let k = P.ls[i] + 1; k < S.k; k++) c.lineTo(ux(P.x[k]), uy(P.y[k]));
      c.lineTo(xr, yr); c.stroke();
      c.restore();
      tool(c, xl, yl, S.eL);
      tool(c, xr, yr, S.eR);
      c.restore();
    }

    return {
      duration: VD,
      start() { S.reset(); t = 0; },
      update(tt) {
        if (tt < t) S.jump(tt * SIM); else S.to(tt * SIM);
        t = tt;
        if (S.eR.deg > maxDeg) maxDeg = S.eR.deg;
        return true;
      },
      render() { draw(env.ctx2d); },
      final() {
        if (!peak) peak = S.peak();
        S.jump(peak.t);
        t = peak.t / SIM;
      },
      hud() { return {}; },
      resize() {},
      stats() {
        return { simFactor: SIM, collisions: S.zl.collisions + S.zr.collisions, removedMm3: Math.round(S.zl.removed + S.zr.removed),
          machineS: +P.T.toFixed(3), loops: LOOPS, phi: +S.eR.deg.toFixed(1), phiL: +S.eL.deg.toFixed(1), phiMax: +maxDeg.toFixed(1),
          peak: peak && { t: +peak.t.toFixed(3), deg: peak.deg } };
      },
      dispose() { loops.length = 0; }
    };
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: VB.w, h: VB.h } });

  C.spec('blog-trocoidal', {
    tools: [TOOL],
    cuts: [{ D: 10, z: 6, vc: 120, S: 3820, fz: 0.06, F: 1375, ae: STEP }],
    sim: SIM, K, VB, R, RHO, STEP, LOOPS, FE, FC, FR, SUB, contact, left: L, right: RT, txt: TXT, path, Sim, mx, my, ux, uy
  });
})(globalThis);
