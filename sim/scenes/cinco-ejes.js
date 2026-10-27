/* Escena cinco-ejes (§4.4, Evidencia 3): acabado con bola Ø10 de una banda del núcleo de molde en 1.2343 templado, en
   una máquina de cabezal B/C. El eje se inclina 10° respecto a la normal hacia el lado del flanco y, cerca de cada brida,
   hasta 14° más hacia el centro para apartar el portaherramientas del espárrago. GL sobre Z-map; respaldo en planta 2D.
   Cámara casi a lo largo de X desde −X+Y: la inclinación lateral se ve de perfil (≥ 6° en pantalla en todo punto). El
   amarre del lado de la cámara se pinta translúcido para no tapar el contacto. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.Shapes || !C.Shapes.nucleo || !C.Strat) return;
  const NU = C.Shapes.nucleo, PI = Math.PI, RAD = PI / 180, DEG = 180 / PI, hypot = Math.hypot, abs = Math.abs;

  const SIM = 4, HOLD = 1.5;
  const TOOL = { id: 'T4', num: 4, kind: 'ball', D: 10, z: 2, lc: 10, oal: 80, helix: 30, neck: { d: 9.7, l: 25 }, shank: 10, stick: 40,
    coat: '#3B3640', name: 'BOLA D10', holder: { type: 'shrink', A: 120, nose: 24, bore: 41, flange: 63, iface: 'HSK-A63' },
    cut: { vc: 503, S: 16000, fz: 0.08, F: 2560, ae: 0.3, ap: 0.15, Fentry: 1280 } };
  /* XC: centro de la bola en los extremos; con él el contacto llega al borde de la superficie (x = ±35) */
  const PASSES = 28, AE = 0.3, XC = 34, DS = 0.5, LAT = 10, XT = 14, RAMP = 12, SKIN = 0.15, SKIN_AE = 1;
  const ID_FIN = 1, ID_SEMI = 2, ZTOP = 100, LEAD = 6, LR = 2.5, SLICE = 12, RMARGIN = 0.85, PGM = 'NUCLEO';
  const SEP = 22, XF = -10, VEC_PX = 44, GHOST = 0.35, CAM_BOX = [-56, -27, 0, 62, 27, 30], HUD_W = 176;
  const NUMRE = /([XYZABC])([+-]\d+)(?:\.(\d+))?(?![\d.])/g, ncFix = s => s.replace(NUMRE, (m, w, i, d) => w + i + '.' + ((d || '') + '000').slice(0, 3));
  const KEEP_BC = ['b', 'c'], TOOL_HOME = [1e-7, 0, 1], fs0 = v => (v < 0 ? '' : '+') + v;
  const MACHINE = { rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200, kin: 'bc', rotary: { B: 20, C: 30 } };
  const NC = { dialect: 'tnc', title: 'ACABADO 5 EJES NUCLEO', tol: 0.01 };
  /* Bridas (§4.4): pletina 30×16×10 que pisa la placa de 37 a 45 y apoya el talón en un calzo de 10; espárrago Ø12 con
     arandela y tuerca M12. GAP: holgura porta–espárrago al final de la pasada central si no hubiera componente de brida. */
  const CLAMP = { x0: 37, x1: 67, w: 16, z0: 10, z1: 20, shim: 10, stud: 6, washer: [12, 2.5], nut: [10.97, 10], over: 10, color: '#2B3339' };
  const GAP = 1.5;
  const GRIDS = NU.grids;

  const tanL = Math.tan(LAT * RAD);
  const tiltX = x => { const s = Math.min(1, Math.max(0, (abs(x) - (XC - RAMP)) / RAMP)); return XT * (1 - Math.cos(PI * s)) / 2; };

  /* Postura en el centro de bola de abscisa x sobre la línea de contacto y = yc: contacto p, normal n, centro p + R·n,
     eje = n + tan(10°)·l + tan(bx)·c, con l ⟂ avance en el plano tangente hacia +Y y c la tangente en X hacia el centro.
     Como n, l, c son ortonormales, el ángulo eje–normal es atan(√(tan²10° + tan²bx)) exacto. */
  const nn = [0, 0, 0], ev = [0, 0, 0];
  /* warm: o trae la postura del punto anterior y el desplazamiento contacto–centro sirve de arranque (2–3 iteraciones) */
  function pose(x, yc, R, noTilt, o, warm) {
    let px = warm ? x + o.p[0] - o.c[0] : x;
    for (let it = 0; it < 8; it++) { NU.normal(px, yc, nn); const q = x - R * nn[0]; if (abs(q - px) < 1e-7) break; px = q; }
    const e = NU.eval(px, yc, ev), pz = e[0];
    const n0 = nn[0], n1 = nn[1], n2 = nn[2], gx = e[1], tl = hypot(1, gx), tx = 1 / tl, tz = gx / tl;
    /* l = n × t (t = avance en +X): sale con componente Y positiva */
    const lx = n1 * tz, ly = n2 * tx - n0 * tz, lz = -n1 * tx;
    const bx = noTilt ? 0 : tiltX(x), s = x > 0 ? -1 : 1, tb = Math.tan(bx * RAD);
    let ax = n0 + tanL * lx + tb * s * tx, ay = n1 + tanL * ly, az = n2 + tanL * lz + tb * s * tz;
    const al = hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
    const cx = px + R * n0, cy = yc + R * n1, cz = pz + R * n2;
    o.p[0] = px; o.p[1] = yc; o.p[2] = pz; o.n[0] = n0; o.n[1] = n1; o.n[2] = n2;
    o.a[0] = ax; o.a[1] = ay; o.a[2] = az; o.c[0] = cx; o.c[1] = cy; o.c[2] = cz;
    o.tip[0] = cx - R * ax; o.tip[1] = cy - R * ay; o.tip[2] = cz - R * az; o.bx = bx;
    return o;
  }
  const mkPose = () => ({ p: [0, 0, 0], n: [0, 0, 0], a: [0, 0, 1], c: [0, 0, 0], tip: [0, 0, 0], bx: 0 });

  /* ---------- holguras: anillos de la superficie de revolución contra los obstáculos (distancias con signo exactas) ---------- */
  function rings(T, na) {
    const out = [], g = T.gauge, st = T.stick;
    const add = (h, part) => out.push({ h, r: T.radiusAt(h), holder: part });
    for (let h = 0; h <= st; h += h < T.R ? 0.5 : 1) add(h, false);
    for (let h = st; h <= g - 0.5; h += h < st + 30 ? 0.5 : 2) add(h, true);
    const ca = new Float64Array(na), sa = new Float64Array(na);
    for (let k = 0; k < na; k++) { ca[k] = Math.cos(2 * PI * k / na); sa[k] = Math.sin(2 * PI * k / na); }
    return { list: out, ca, sa, na };
  }
  function sdCyl(o, x, y, z) {
    const dr = hypot(x - o.x, y - o.y) - o.r, dz = Math.max(o.z0 - z, z - o.z1);
    return hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0);
  }
  function sdBox(o, x, y, z) {
    const qx = Math.max(o.x0 - x, x - o.x1), qy = Math.max(o.y0 - y, y - o.y1), qz = Math.max(o.z0 - z, z - o.z1);
    return hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  }
  const sd = (o, x, y, z) => o.kind === 'cyl' ? sdCyl(o, x, y, z) : sdBox(o, x, y, z);
  /* cota inferior de la distancia de una esfera (c, r) a la caja envolvente del obstáculo */
  function lb(o, x, y, z, r) {
    const qx = Math.max(o.bx0 - x, x - o.bx1, 0), qy = Math.max(o.by0 - y, y - o.by1, 0), qz = Math.max(o.z0 - z, z - o.z1, 0);
    return hypot(qx, qy, qz) - r;
  }
  function obstacle(kind, d) {
    const o = Object.assign({ kind }, d);
    if (kind === 'cyl') { o.bx0 = o.x - o.r; o.bx1 = o.x + o.r; o.by0 = o.y - o.r; o.by1 = o.y + o.r; } else { o.bx0 = o.x0; o.bx1 = o.x1; o.by0 = o.y0; o.by1 = o.y1; }
    return o;
  }
  /* Holgura mínima de la herramienta (holder=false: bola, cuello y mango) o del porta (true) en la postura tip/a */
  const U = [0, 0, 0], W = [0, 0, 0];
  function clearance(RG, obs, tip, a, holder, limit) {
    let best = limit || 1e9;
    /* base ortonormal del plano del anillo */
    if (abs(a[2]) < 0.9) { U[0] = a[1]; U[1] = -a[0]; U[2] = 0; } else { U[0] = 0; U[1] = a[2]; U[2] = -a[1]; }
    const ul = hypot(U[0], U[1], U[2]); U[0] /= ul; U[1] /= ul; U[2] /= ul;
    W[0] = a[1] * U[2] - a[2] * U[1]; W[1] = a[2] * U[0] - a[0] * U[2]; W[2] = a[0] * U[1] - a[1] * U[0];
    const L = RG.list, ca = RG.ca, sa = RG.sa, na = RG.na;
    for (let i = 0; i < L.length; i++) {
      const rg = L[i];
      if (rg.holder !== holder) continue;
      const ox = tip[0] + a[0] * rg.h, oy = tip[1] + a[1] * rg.h, oz = tip[2] + a[2] * rg.h, r = rg.r;
      for (let q = 0; q < obs.length; q++) {
        const o = obs[q];
        if (lb(o, ox, oy, oz, r) >= best) continue;
        for (let k = 0; k < na; k++) {
          const c = ca[k] * r, s = sa[k] * r, d = sd(o, ox + c * U[0] + s * W[0], oy + c * U[1] + s * W[1], oz + c * U[2] + s * W[2]);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  /* Franja de acabado (la misma regla que NU.band()) con barrido grueso y bisección en los bordes: la de la forma
     muestrea cada 2 × 0.05 mm y cuesta ~40 ms en frío, más que todo el modelo */
  const E = [0, 0, 0];
  function bandFast() {
    const ok = (x, y) => { NU.eval(x, y, E); const a = Math.atan2(-E[2], 1) * DEG; return a >= 5 && a <= 25 && Math.atan2(abs(E[1]), 1) * DEG <= 8; };
    const edge = (x, ya, yb) => { const oa = ok(x, ya); for (let i = 0; i < 6; i++) { const m = (ya + yb) / 2; if (ok(x, m) === oa) ya = m; else yb = m; } return (ya + yb) / 2; };
    let lo = -1e9, hi = 1e9;
    for (let x = -34; x <= 34.001; x += 4) {
      let best = -1, b0 = 0, b1 = 0, a = 0, prev = false, y = -21.95;
      for (; y <= 22; y += 0.5) {
        const o = ok(x, y);
        if (o && !prev) a = y === -21.95 ? y : edge(x, y - 0.5, y);
        if (!o && prev) { const b = edge(x, y - 0.5, y); if (b - a > best) { best = b - a; b0 = a; b1 = b; } }
        prev = o;
      }
      if (prev && y - 0.5 - a > best) { b0 = a; b1 = y - 0.5; }
      lo = Math.max(lo, b0); hi = Math.min(hi, b1);
    }
    return { y0: lo, y1: hi };
  }

  /* ---------- programa completo (sin DOM): lo usan la escena y las pruebas de Node ---------- */
  async function build(nx, ny, idle) {
    idle = idle || (() => Promise.resolve());
    const now = () => G.performance ? G.performance.now() : Date.now(), ms = {};
    /* porciones de ≤ SLICE ms entre cesiones; ms[k] = trabajo de cada fase sin contar las esperas */
    let ts = now(), work = 0;
    const due = () => now() - ts > SLICE;
    const pause = async () => { work += now() - ts; await idle(); ts = now(); };
    const lap = async k => { ms[k] = +(work + now() - ts).toFixed(1); work = 0; await idle(); ts = now(); };
    const T = new C.Tool(TOOL), R = T.R, band = bandFast();
    await lap('band');

    /* modelo y piel de semiacabado en una pasada por filas: producto tensorial de la B-spline con las bases de cada
       columna precalculadas (mismas operaciones y orden que NU.eval, el modelo sale idéntico) */
    const zm = NU.zmap(nx, ny), N = nx * ny, model = new Float32Array(N), fp = NU.footprint, SF = NU.surf, BS = C.BSpline;
    const sx = SF.x1 - SF.x0, sy = SF.y1 - SF.y0, nv = SF.nv, Pc = SF.P, h = zm.h, at = zm.at, FL = C.ZMap.FLAG, pl = NU.plate;
    const su = new Int32Array(nx), Nu = new Float64Array(4 * nx), Du = new Float64Array(4 * nx), Nv = [0, 0, 0, 0], Dv = [0, 0, 0, 0], tN = [0, 0, 0, 0], tD = [0, 0, 0, 0];
    for (let i = 0; i < nx; i++) {
      const u = Math.min(1, Math.max(0, (zm.xc(i) - SF.x0) / sx)), s = su[i] = BS.span(SF.U, u);
      BS.basis(SF.U, u, s, tN, tD);
      for (let a = 0; a < 4; a++) { Nu[4 * i + a] = tN[a]; Du[4 * i + a] = tD[a]; }
    }
    /* fila j (función aparte: dentro del bucle con await el compilador no la optimiza) */
    const row = j => {
      const y = zm.yc(j), v = Math.min(1, Math.max(0, (y - SF.y0) / sy)), sv = BS.span(SF.V, v);
      BS.basis(SF.V, v, sv, Nv, Dv);
      for (let i = 0, q = j * nx; i < nx; i++, q++) {
        const x = zm.xc(i);
        if (x < pl.x0 || x > pl.x1 || y < pl.y0 || y > pl.y1) { h[q] = model[q] = 0; continue; }
        if (fp(x, y) > 0) { h[q] = model[q] = pl.z1; continue; }
        let z = 0, zu = 0, zv = 0;
        for (let a = 0, r = (su[i] - 3) * nv + sv - 3; a <= 3; a++, r += nv) for (let b = 0; b <= 3; b++) {
          const p = Pc[r + b], na = Nu[4 * i + a];
          z += na * Nv[b] * p; zu += Du[4 * i + a] * Nv[b] * p; zv += na * Dv[b] * p;
        }
        model[q] = z;
        /* piel de 0.15 sobre la normal exacta más la cresta de una bola a ae 1 en Y (marcas a lo largo de X) */
        const gx = zu / sx, gy = zv / sy, w = y / SKIN_AE, d = abs(w - Math.round(w)) * SKIN_AE * Math.sqrt(1 + gy * gy);
        h[q] = z + (SKIN + R - Math.sqrt(Math.max(0, R * R - d * d))) * Math.sqrt(1 + gx * gx + gy * gy);
        const w4 = 4 * q; at[w4] = ID_SEMI; at[w4 + 1] = 255; at[w4 + 2] = 128; at[w4 + 3] = FL.CUT | FL.MARK | FL.SKIN;
      }
    };
    for (let j = 0; j < ny; j++) { if (due()) await pause(); row(j); }
    zm.saveBase();
    await lap('model');

    /* pasadas en el centro de la franja; entrada y salida en arco tangente en el plano vertical de avance */
    const yc0 = (band.y0 + band.y1) / 2 - (PASSES - 1) * AE / 2, nX = Math.round(2 * XC / DS);
    const pb = new C.PathBuilder({ ds: DS, safeZ: ZTOP }), ps = mkPose(), q0 = mkPose();
    const cap = PASSES * (nX + 1) + 2 * LEAD + 12, CP = new Float32Array(3 * cap), NR = new Float32Array(3 * cap), AX = new Float32Array(3 * cap);
    const PASS = new Int16Array(cap), XS = new Float32Array(cap);
    let m = 0;
    const rec = (k, x) => { for (let e = 0; e < 3; e++) { CP[3 * m + e] = ps.p[e]; NR[3 * m + e] = ps.n[e]; AX[3 * m + e] = ps.a[e]; } PASS[m] = k; XS[m++] = x; };
    const ax = { i: 0, j: 0, k: 1 }, oax = () => { ax.i = ps.a[0]; ax.j = ps.a[1]; ax.k = ps.a[2]; return ax; };
    const blk = () => pb.blocks[pb.lastBlock()], tip = [0, 0, 0], tu = [0, 0, 0], up = [0, 0, 0];
    /* tangente del centro de la bola (ps → q0) y su perpendicular hacia arriba en el plano vertical que la contiene */
    const frameAt = () => {
      let l = 0;
      for (let e = 0; e < 3; e++) { tu[e] = q0.c[e] - ps.c[e]; l += tu[e] * tu[e]; }
      l = Math.sqrt(l); for (let e = 0; e < 3; e++) tu[e] /= l;
      for (let e = 0; e < 3; e++) up[e] = (e === 2 ? 1 : 0) - tu[2] * tu[e];
      l = hypot(up[0], up[1], up[2]); for (let e = 0; e < 3; e++) up[e] /= l;
    };
    /* punta para el centro de bola ps.c + r·(s·tu + c·up) con el eje de ps */
    const tipAt = (s, c) => { for (let e = 0; e < 3; e++) tip[e] = ps.c[e] + LR * (s * tu[e] + c * up[e]) - R * ps.a[e]; return tip; };

    pb.cycle('BEGIN PGM ' + PGM + ' MM');
    pb.cycle('BLK FORM 0.1 Z X' + fs0(pl.x0) + ' Y' + fs0(pl.y0) + ' Z+0');
    pb.cycle('BLK FORM 0.2 X' + fs0(pl.x1) + ' Y' + fs0(pl.y1) + ' Z' + fs0(zm.top));
    pb.cycle('CYCL DEF 32.0 TOLERANCIA'); pb.cycle('CYCL DEF 32.1 T' + NC.tol);
    pb.tc(T.num, T.name); blk().s = T.cut.S; blk().f = T.cut.F;
    /* el punto 0 es el de la llamada: ahí se espera a que el husillo llegue a régimen, con el cabezal vertical */
    pb.rapid(0, 0, ZTOP, { blk: pb.lastBlock() }); rec(-1, 0);
    /* TCPM antes de mover ningún eje con el cabezal inclinado: orientar arriba, posicionar en XY y bajar */
    pb.m('M128'); const iM128 = pb.lastBlock();
    pose(-XC, yc0, R, false, ps); pose(-XC + DS, yc0, R, false, q0); frameAt();
    const a0 = [ps.a[0], ps.a[1], ps.a[2]];
    pb.rapid(0, 0, ZTOP); blk().keep = KEEP_BC; rec(-1, 0);
    tipAt(-1, 1);
    pb.rapid(tip[0], tip[1], ZTOP); blk().m = 'M3'; rec(-1, -XC);
    pb.rapid(tip[0], tip[1], tip[2] + 2); rec(-1, -XC);
    pb.feed(tip[0], tip[1], tip[2], 2, T.cut.Fentry, oax()); rec(-1, -XC);
    for (let s = 1; s <= LEAD; s++) {
      const th = s * PI / 2 / LEAD;
      tipAt(-Math.cos(th), 1 - Math.sin(th));
      pb.feed(tip[0], tip[1], tip[2], 2, T.cut.Fentry, oax()); rec(s < LEAD ? -1 : 0, -XC);
    }
    const pass = k => {
      const yc = yc0 + k * AE, dir = k % 2 ? -1 : 1;
      for (let q = k ? 0 : 1; q <= nX; q++) {
        const x = dir * (-XC + q * DS);
        pose(x, yc, R, false, ps, true);
        pb.feed(ps.tip[0], ps.tip[1], ps.tip[2], 1, 0, oax()); rec(k, x);
      }
    };
    for (let k = 0; k < PASSES; k++) { if (due()) await pause(); pass(k); }
    const kLast = pb.n - 1, xe = XS[kLast];
    pose(xe + DS, yc0 + (PASSES - 1) * AE, R, false, q0);
    /* de q0 a ps es el sentido de avance de la última pasada (−X) */
    pose(xe, yc0 + (PASSES - 1) * AE, R, false, ps); frameAt();
    for (let e = 0; e < 3; e++) tu[e] = -tu[e];
    for (let s = 1; s <= LEAD; s++) {
      const th = s * PI / 2 / LEAD;
      tipAt(Math.sin(th), 1 - Math.cos(th));
      pb.feed(tip[0], tip[1], tip[2], 3, T.cut.Fentry, oax()); rec(-2, xe);
    }
    pb.rapid(pb.x, pb.y, ZTOP); rec(-2, xe);
    pb.rapid(pb.x, pb.y, ZTOP); blk().keep = KEEP_BC; rec(-2, xe);
    pb.m('M129'); const iM129 = pb.lastBlock();
    pb.m('M30'); pb.cycle('END PGM ' + PGM + ' MM');
    const path = pb.build();
    /* PathBuilder.rapid() no guarda el eje: los G0 tras M128 van ya orientados y el último vuelve a B0 C0 (el eje
       casi vertical apunta a +X para que C resuelva 0) */
    for (let k = 1; k <= 3; k++) for (let e = 0; e < 3; e++) path.axis[3 * k + e] = a0[e];
    path.axis.set(TOOL_HOME, 3 * (path.n - 1));
    await lap('path');

    /* bridas a partir de la postura sin componente de brida al final de la pasada central (§4.4, revisión de oficio) */
    const RG = rings(T, 48), RGs = rings(T, 24), mid = PASSES >> 1, ycm = yc0 + mid * AE, obs = [], fixtures = [];
    for (const sgn of [1, -1]) {
      if (sgn < 0) await pause();
      pose(sgn * XC, ycm, R, true, ps);
      const nose = [ps.tip[0] + T.stick * ps.a[0], ps.tip[1] + T.stick * ps.a[1], ps.tip[2] + T.stick * ps.a[2]];
      const top = nose[2] + CLAMP.over, y = nose[1], hw = CLAMP.w / 2;
      /* el espárrago se acerca hasta que la holgura sin componente de brida es GAP: la holgura crece casi 1:1 con la
         separación, así que la secante converge en 3–4 evaluaciones */
      const gapAt = md => clearance(RGs, [obstacle('cyl', { x: nose[0] + sgn * md, y, r: CLAMP.stud, z0: 0, z1: top })], ps.tip, ps.a, true) - GAP;
      let m0 = 15, m1 = 25, f0 = gapAt(m0), f1 = gapAt(m1);
      for (let it = 0; it < 8 && abs(f1) > 0.002; it++) { const m2 = m1 - f1 * (m1 - m0) / (f1 - f0); m0 = m1; f0 = f1; m1 = m2; f1 = gapAt(m1); }
      const xs = nose[0] + sgn * m1, xa = sgn * CLAMP.x0, xb = sgn * CLAMP.x1;
      const f = {
        side: sgn, nose, stud: obstacle('cyl', { x: xs, y, r: CLAMP.stud, z0: 0, z1: top }),
        washer: obstacle('cyl', { x: xs, y, r: CLAMP.washer[0], z0: CLAMP.z1, z1: CLAMP.z1 + CLAMP.washer[1] }),
        nut: obstacle('cyl', { x: xs, y, r: CLAMP.nut[0], z0: CLAMP.z1 + CLAMP.washer[1], z1: CLAMP.z1 + CLAMP.washer[1] + CLAMP.nut[1] }),
        strap: obstacle('box', { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: y - hw, y1: y + hw, z0: CLAMP.z0, z1: CLAMP.z1 }),
        shim: obstacle('box', { x0: Math.min(xb, xb - sgn * CLAMP.shim), x1: Math.max(xb, xb - sgn * CLAMP.shim), y0: y - hw, y1: y + hw, z0: 0, z1: CLAMP.z0 })
      };
      fixtures.push(f);
      obs.push(f.stud, f.washer, f.nut, f.strap, f.shim);
    }
    obs.push(obstacle('box', { x0: pl.x0, x1: pl.x1, y0: pl.y0, y1: pl.y1, z0: pl.z0, z1: pl.z1 }));
    await lap('fixtures');

    /* el programa escribe sus propios bloques (cabecera, M128 antes de orientar, vuelta a B0 C0, M129, fin); los
       topes rotativos llevan margen porque Program no modela la aceleración de los ejes giratorios */
    const mach = Object.assign({}, MACHINE, { start: 'p0', rotary: { B: MACHINE.rotary.B * RMARGIN, C: MACHINE.rotary.C * RMARGIN } });
    const nc = Object.assign({}, NC, { auto: false, map: b => { if (!b.keep) return b; const o = { g: b.g }; for (const k of b.keep) o[k] = b[k]; return o; } });
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T, toolId: ID_FIN, path, S: T.cut.S, label: 'acabado 5 ejes' }], machine: mach, sim: SIM, nc });
    await lap('program');
    const n = m;
    return { zm, model, T, path, prog, band, yc0, fixtures, obs, RG, kLast, iM128, iM129, ms,
      CP: CP.subarray(0, 3 * n), NR: NR.subarray(0, 3 * n), AX: AX.subarray(0, 3 * n), PASS: PASS.subarray(0, n), XS: XS.subarray(0, n) };
  }

  C.define('cinco-ejes', async function (env) {
    const V = C.V2D, PAL = C.PAL, g = GRIDS[env.tier] || GRIDS.A, gl = env.gl, fs = C.fmt.sign;
    await env.idle();
    const B = await build(g[0], g[1], env.idle), prog = B.prog, zm = B.zm, T = B.T, path = B.path;
    await env.idle();
    const VD = prog.visualDuration, D = VD + HOLD;
    let kF = B.kLast;
    while (kF > 0 && B.PASS[kF - 1] === PASSES - 1 && B.XS[kF - 1] <= XF) kF--;
    const tFin = prog.pointTime(0, kF);
    /* por pasada: distancia de inicio y primer y último punto */
    const passD = new Float32Array(PASSES + 1), pK0 = new Int32Array(PASSES).fill(-1), pK1 = new Int32Array(PASSES);
    for (let k = 0; k < path.n; k++) { const p = B.PASS[k]; if (p < 0) continue; if (pK0[p] < 0) { pK0[p] = k; passD[p] = path.dist[k]; } pK1[p] = k; }
    passD[PASSES] = path.len;
    const passOf = d => { let p = -1; while (p + 1 < PASSES && passD[p + 1] <= d) p++; return p; };

    const cam = { type: 'ortho', az: 160, el: 30, zoom: 0.86, fit: { bbox: CAM_BOX, safe: { top: 6, right: 16, bottom: env.safe.bottom, left: HUD_W } } };
    const RXV = [-Math.sin(cam.az * RAD), Math.cos(cam.az * RAD), 0];
    let ter = null, tm = null, ln = null, hog = null, halo = null, pair = null;
    const fixItems = [];
    if (gl) {
      ter = gl.terrain(zm, { model: B.model, material: 'steelHard', raw: 'milled', tints: { [ID_FIN]: PAL.tint.finish, [ID_SEMI]: PAL.tint.semi } });
      await env.idle();
      tm = gl.tool(T);
      ln = gl.lines(path);
      await env.idle();
      hog = gl.vectors(64, { width: 1, styles: [{ c: PAL.gold, a: 0.45 }] });
      halo = gl.vectors(4, { width: 4, styles: [{ c: PAL.bg, a: 0.55 }] });
      pair = gl.vectors(12, { width: 1.75, styles: [{ c: PAL.gold, a: 1 }, { c: '#EAF0F6', a: 0.95, dash: [4, 3] }, { c: PAL.gold, a: 0.8 }] });
      const mat = { color: CLAMP.color, metal: 0.25, gloss: 0.35 }, steel = { color: '#5A636B', metal: 0.5, gloss: 0.5 };
      const add = (h, a) => fixItems.push({ h, alpha: a });
      for (const f of B.fixtures) {
        const b = f.strap, s = f.shim, st = f.stud, w = f.washer, n = f.nut, a = f.side < 0 ? GHOST : 1;
        add(gl.mesh({ kind: 'box', size: [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0], at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], material: mat }), 1);
        add(gl.mesh({ kind: 'box', size: [s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0], at: [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2], material: mat }), 1);
        /* el espárrago del lado de la cámara se corta 4 mm por encima de la tuerca: entero taparía el contacto */
        const top = f.side < 0 ? n.z1 + 4 : st.z1;
        add(gl.mesh({ kind: 'cyl', r: st.r, h: top - st.z0, z0: st.z0, seg: 24, at: [st.x, st.y, 0], material: steel }), a);
        add(gl.mesh({ kind: 'cyl', r: w.r, h: w.z1 - w.z0, z0: w.z0, seg: 32, at: [w.x, w.y, 0], material: steel }), a);
        add(gl.mesh({ kind: 'cyl', r: n.r, h: n.z1 - n.z0, z0: n.z0, seg: 6, at: [n.x, n.y, 0], material: steel }), a);
      }
      await env.idle();
    }
    /* backplot: pasada actual y dos anteriores atenuadas (con la aproximación como «pasada −1») */
    const items = [{ h: ter }].concat(fixItems), iLn = items.length, LA = [1, 0.7, 0.4];
    for (let i = 0; i < 3; i++) items.push({ h: null, upTo: 0, from: 0, width: 1, alpha: LA[i] });
    items.push({ h: hog }, { h: halo }, { h: pair });
    const iTool = items.push({ h: tm, pos: null, axis: null, spin: 1 }) - 1, FRAME_O = {};

    /* estado en el punto de contacto, interpolado entre los puntos k−1 y k de la trayectoria */
    const cur = { p: [0, 0, 0], n: [0, 0, 1], a: [0, 0, 1], pass: -1, ang: 0, xs: 0 };
    function contact() {
      const st = prog.state(), k = Math.min(st.k, path.n - 1), k0 = Math.max(0, k - 1);
      const d0 = path.dist[k0], d1 = path.dist[k], u = d1 > d0 ? Math.min(1, Math.max(0, (st.dist - d0) / (d1 - d0))) : 1;
      for (let e = 0; e < 3; e++) {
        cur.p[e] = B.CP[3 * k0 + e] + (B.CP[3 * k + e] - B.CP[3 * k0 + e]) * u;
        cur.n[e] = B.NR[3 * k0 + e] + (B.NR[3 * k + e] - B.NR[3 * k0 + e]) * u;
      }
      const nl = hypot(cur.n[0], cur.n[1], cur.n[2]) || 1;
      cur.n[0] /= nl; cur.n[1] /= nl; cur.n[2] /= nl;
      const a = st.axis || cur.a;
      cur.a[0] = a[0]; cur.a[1] = a[1]; cur.a[2] = a[2];
      cur.xs = B.XS[k0] + (B.XS[k] - B.XS[k0]) * u;
      cur.pass = st.phase === 'cut' ? Math.max(B.PASS[k0], B.PASS[k]) : -1;
      cur.ang = Math.acos(Math.min(1, cur.n[0] * cur.a[0] + cur.n[1] * cur.a[1] + cur.n[2] * cur.a[2])) * DEG;
      return cur;
    }

    let t = 0, held = false, hudT = -1, clrMin = 1e9;
    /* HUD de lienzo en una columna a la izquierda: posición dibujada (DRO), TCPM modal con B, C y F reales, la medida
       del ángulo y la holgura; fuera del corte, la cuarta línea es el bloque NC en curso */
    const VAL = PAL.hud.value, TXT = PAL.hud.text;
    const L2 = [{ text: '', color: PAL.hud.g }, { text: '', color: VAL }];
    const L3 = [{ text: '', color: TXT }, { text: '', color: VAL }, { text: '', color: PAL.hud.sim }], L4 = [{ text: '', color: TXT }, { text: '', color: VAL }];
    const HUD = [{ text: '', color: VAL }, { parts: L2 }, { parts: L3 }, { parts: L4 }], SIMTXT = 'SIM ×' + SIM;
    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const st = prog.state(), r = st.rot || {}, c = contact();
      HUD[0].text = 'X' + fs(st.pos[0]) + ' Y' + fs(st.pos[1]) + ' Z' + fs(st.pos[2]);
      L2[0].text = st.block > B.iM128 && st.block < B.iM129 ? 'M128 ' : '';
      L2[1].text = 'B' + fs(r.B || 0) + ' C' + fs(r.C || 0) + (st.feed > 0 ? st.type === 0 ? ' FMAX' : ' F' + Math.round(st.feed) : '');
      if (c.pass >= 0) {
        const h = clearance(B.RG, B.obs, st.pos, st.axis || c.a, true, 99.9);
        if (h < clrMin) clrMin = h;
        L3[0].text = 'eje–normal '; L3[1].text = c.ang.toFixed(1) + '°  '; L3[2].text = SIMTXT;
        L4[0].text = 'holgura porta '; L4[1].text = h < 99.9 ? h.toFixed(1) + ' mm' : '–';
      } else { L3[0].text = L3[1].text = ''; L3[2].text = SIMTXT; L4[0].text = ''; L4[1].text = ncFix(prog.line(st.block)); }
    }
    const HUDO = { lh: 13 }, hudDraw = c => V.draw.hudText(c, 10, 8, HUD, HUDO);

    const q0 = [0, 0], q1 = [0, 0], P3 = [0, 0, 0];
    const tri = { x: [0, 0], y: [0, 0], z: [0, 0] }, TV = [tri.x, tri.y, tri.z], O3 = [0, 0, 0];
    function triad(c) {
      gl.project(O3, q0);
      let m = 0;
      for (let k = 0; k < 3; k++) {
        P3[0] = k === 0 ? 10 : 0; P3[1] = k === 1 ? 10 : 0; P3[2] = k === 2 ? 10 : 0;
        gl.project(P3, q1);
        TV[k][0] = q1[0] - q0[0]; TV[k][1] = q1[1] - q0[1]; m = Math.max(m, hypot(TV[k][0], TV[k][1]));
      }
      for (let k = 0; k < 3; k++) { TV[k][0] /= m; TV[k][1] /= m; }
      V.draw.triad2D(c, env.frame.w - 30, env.frame.h - env.safe.bottom - 26, tri);
    }
    function backplot(dNow) {
      const p = passOf(dNow);
      for (let i = 0; i < 3; i++) {
        const L = items[iLn + i], q = p - i;
        if (q < -1) { L.h = null; continue; }
        L.h = ln; L.from = q >= 0 ? passD[q] : 0; L.upTo = i ? passD[q + 1] : dNow;
      }
    }
    /* erizo: ejes cada 3 mm sobre lo ejecutado de la pasada actual y la anterior, que se desvanecen tras la herramienta */
    const HP = [0, 0, 0], HA = [0, 0, 0];
    function hedgehog(dNow) {
      hog.clear();
      const p = passOf(dNow);
      for (let pp = Math.max(0, p - 1); pp <= p; pp++) {
        let next = 0;
        for (let k = pK0[pp]; k <= pK1[pp]; k++) {
          if (path.dist[k] > dNow) break;
          const d = path.dist[k] - passD[pp];
          if (d < next) continue;
          next = d + 3;
          const al = 1 - (dNow - path.dist[k]) / 45;
          if (al <= 0) continue;
          for (let e = 0; e < 3; e++) { HP[e] = B.CP[3 * k + e]; HA[e] = B.AX[3 * k + e]; }
          hog.push(HP, HA, 7, 0, al);
        }
      }
    }
    /* Par normal–eje en 3D sobre una estación de la pasada a 22 mm hacia −X: con la vista casi a lo largo de X ese es el
       lado de la cámara y la separación en pantalla deja el par delante y fuera de la bola (a 8 mm caía sobre el
       cuello). Con un arco entre los dos y al menos 44 px de marco de largo: a 10° las puntas se separan ~8 px */
    const an = { k: -1, al: 0, len: 12, px: 0 }, PP = [0, 0, 0], PN = [0, 0, 0], PA = [0, 0, 0], AR = [0, 0, 0], AQ = [0, 0, 0], SG = [0, 0, 0];
    function anchor(c) {
      an.k = -1; an.al = 0;
      if (c.pass < 0) return an;
      const p = c.pass, st = prog.state(), kc = Math.min(Math.max(st.k, pK0[p]), pK1[p]), w = Math.round(SEP / DS);
      const ks = p % 2 ? Math.min(pK1[p], kc + w) : Math.max(pK0[p], kc - w);
      an.k = ks; an.al = Math.min(1, Math.max(0, (abs(B.XS[ks] - c.xs) - 10) / 4));
      for (let e = 0; e < 3; e++) { PP[e] = B.CP[3 * ks + e]; PN[e] = B.NR[3 * ks + e]; PA[e] = B.AX[3 * ks + e]; }
      if (gl) {
        gl.project(PP, q0);
        for (let e = 0; e < 3; e++) P3[e] = PP[e] + RXV[e] * 10;
        gl.project(P3, q1);
        const ppm = hypot(q1[0] - q0[0], q1[1] - q0[1]) / 10;
        an.len = Math.max(14, VEC_PX / ppm); an.px = an.len * ppm;
      }
      return an;
    }
    function vectors(c) {
      halo.clear(); pair.clear();
      if (anchor(c).al <= 0) return;
      const L = an.len, al = an.al;
      halo.push(PP, PN, L, 0, al); halo.push(PP, PA, L, 0, al);
      pair.push(PP, PN, L, 1, al); pair.push(PP, PA, L, 0, al);
      const th = Math.acos(Math.min(1, PN[0] * PA[0] + PN[1] * PA[1] + PN[2] * PA[2])), sn = Math.sin(th) || 1, r = 0.55 * L;
      for (let e = 0; e < 3; e++) AR[e] = PP[e] + r * PN[e];
      for (let s = 1; s <= 5; s++) {
        const w0 = Math.sin((1 - s / 5) * th) / sn, w1 = Math.sin(s / 5 * th) / sn;
        for (let e = 0; e < 3; e++) { AQ[e] = PP[e] + r * (w0 * PN[e] + w1 * PA[e]); SG[e] = AQ[e] - AR[e]; }
        pair.push(AR, SG, hypot(SG[0], SG[1], SG[2]), 2, al);
        AR[0] = AQ[0]; AR[1] = AQ[1]; AR[2] = AQ[2];
      }
    }

    const scene = {
      duration: D,
      grid: zm.nx + 'x' + zm.ny,
      start() { prog.reset(); t = 0; held = false; hudT = -1; texts(true); },
      update(tt) {
        if (tt >= VD && held) { t = tt; return false; }
        t = tt;
        prog.advanceTo(Math.min(tt, VD) * SIM);
        if (tt >= VD) held = true;
        texts(held);
        return true;
      },
      render() {
        if (!gl) return;
        const st = prog.state(), c = contact(), ctx = env.ctx2d;
        gl.camera(cam);
        backplot(st.dist);
        hedgehog(st.dist);
        vectors(c);
        const it = items[iTool];
        it.pos = st.pos; it.axis = st.axis; it.spin = st.S > 0 ? 1 : 0;
        /* sin sombra de herramienta: con la luz rasante de esta vista, incluso la de la bola y el cuello cruzaba la
           pieza como una banda oscura que se leía como una ranura (no hay opacidad de sombra en la API GL) */
        gl.frame(items, FRAME_O);
        triad(ctx);
        hudDraw(ctx);
      },
      final() {
        /* en la última pasada, con el contacto en x = XF: aún en avance, con el par normal–eje (que va 18 mm por
           delante, hacia la cámara) y el erizo; en el extremo de la pasada el par no tendría sitio */
        const tf = tFin;
        if (prog.t > tf) prog.reset();
        prog.advanceTo(tf);
        t = tf / SIM; held = true; texts(true);
      },
      hud() { return null; },
      resize() { hudT = -1; texts(true); },
      fallback(e2) { return plan(e2); },
      stats() {
        const c = contact(), r = prog.state().rot || {};
        /* inclinación eje–normal tal como se ve en pantalla en el par dibujado (o en el contacto): criterio ≥ 6° */
        let scr = 0;
        if (gl && c.pass >= 0) {
          const k = anchor(c).k, v = [0, 0], w = [0, 0];
          gl.project(PP, q0);
          for (let e = 0; e < 3; e++) P3[e] = PP[e] + PN[e] * 12;
          gl.project(P3, q1); v[0] = q1[0] - q0[0]; v[1] = q1[1] - q0[1];
          for (let e = 0; e < 3; e++) P3[e] = PP[e] + PA[e] * 12;
          gl.project(P3, q1); w[0] = q1[0] - q0[0]; w[1] = q1[1] - q0[1];
          scr = k < 0 ? 0 : Math.acos(Math.min(1, (v[0] * w[0] + v[1] * w[1]) / (hypot(v[0], v[1]) * hypot(w[0], w[1])))) * DEG;
        }
        return { simFactor: SIM, collisions: prog.collisions + zm.collisions, removedMm3: +zm.removed.toFixed(1), machineS: +prog.duration.toFixed(2),
          passes: PASSES, angleNow: +c.ang.toFixed(2), B: +(r.B || 0).toFixed(3), C: +(r.C || 0).toFixed(3), clearHolderSeen: +clrMin.toFixed(2),
          tiltScreenDeg: +scr.toFixed(2), vecPx: +an.px.toFixed(1), vecAlpha: +an.al.toFixed(2), initPhases: B.ms,
          hudText: HUD[0].text + ' | ' + L2[0].text + L2[1].text + ' | ' + L3[0].text + L3[1].text + L3[2].text + ' | ' + L4[0].text + L4[1].text };
      },
      dispose() { if (gl) gl.dispose(); }
    };

    /* Respaldo: planta del mismo Z-map con las bridas, la bola, la nariz del porta desplazada y el eje proyectado */
    function plan(e2) {
      let v = null;
      const c = e2.ctx2d, VIEW = { x0: -70, y0: -27, x1: 70, y1: 27 }, RECT = { x: 6, y: 52, w: 0, h: 0 };
      const rect = () => { RECT.w = e2.frame.w - 12; RECT.h = e2.frame.h - e2.safe.bottom - 56; return RECT; };
      const PLAN_AX = { x: [1, 0], y: [0, -1] };
      const box = o => { c.fillRect(v.X(o.x0), v.Y(o.y1), (o.x1 - o.x0) * v.s, (o.y1 - o.y0) * v.s); };
      const circ = (x, y, r) => { c.beginPath(); c.arc(v.X(x), v.Y(y), r * v.s, 0, 2 * PI); };
      return {
        update(tt) { return scene.update(tt); },
        render() {
          const st = prog.state(), cc = contact(), a = st.axis || cc.a;
          if (!v) v = V.TopView2D(c, zm, { shadows: true, shadowHz: 10, tints: { [ID_FIN]: PAL.tint.finish, [ID_SEMI]: PAL.tint.semi }, rect: rect(), view: VIEW, steel: PAL.mat.steelHard });
          v.setRect(rect());
          v.render();
          c.save();
          for (const f of B.fixtures) {
            c.fillStyle = CLAMP.color; box(f.shim); c.fillStyle = '#39434A'; box(f.strap);
            c.fillStyle = '#5A636B'; circ(f.nut.x, f.nut.y, f.nut.r); c.fill();
            c.fillStyle = '#8C9399'; circ(f.stud.x, f.stud.y, f.stud.r); c.fill();
          }
          const cx = st.pos[0] + T.R * a[0], cy = st.pos[1] + T.R * a[1], nx = st.pos[0] + T.stick * a[0], ny = st.pos[1] + T.stick * a[1];
          c.globalAlpha = 0.4; c.fillStyle = PAL.tool.holder; circ(nx, ny, T.holder.nose / 2); c.fill();
          c.globalAlpha = 1; c.strokeStyle = '#B9C4CE'; c.lineWidth = 1; c.stroke();
          c.fillStyle = PAL.tool.coat; circ(cx, cy, T.R); c.fill();
          c.strokeStyle = PAL.gold; c.lineWidth = 1.5; c.beginPath(); c.moveTo(v.X(cx), v.Y(cy)); c.lineTo(v.X(nx), v.Y(ny)); c.stroke();
          c.restore();
          V.draw.triad2D(c, e2.frame.w - 30, e2.frame.h - e2.safe.bottom - 26, PLAN_AX);
          hudDraw(c);
        },
        final() { scene.final(); },
        hud() { return null; },
        resize() { if (v) v.markAll(); scene.resize(); },
        stats() { return Object.assign(scene.stats(), { topMs: v ? +v.ms.toFixed(3) : 0 }); },
        dispose() { if (v) v.dispose(); }
      };
    }
    return scene;
  }, { kind: 'gl', drive: 'time', loop: true, frame: { w: 384, h: 192 }, frameM: { w: 350, h: 192 } });

  C.spec('cinco-ejes', {
    tools: [TOOL],
    cuts: [{ D: 10, z: 2, vc: 503, S: 16000, fz: 0.08, F: 2560, ae: 0.3 }],
    sim: SIM, hold: HOLD, passes: PASSES, ae: AE, xc: XC, lat: LAT, xt: XT, ramp: RAMP, skin: SKIN, skinAe: SKIN_AE, gap: GAP,
    grids: GRIDS, machine: MACHINE, rmargin: RMARGIN, lead: LEAD, leadR: LR, build, pose, mkPose, tiltX, rings, clearance, ncFix
  });
})(globalThis);
