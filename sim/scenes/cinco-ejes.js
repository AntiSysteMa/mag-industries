/* Escena cinco-ejes (§4.4, Evidencia 3): acabado con bola Ø10 de una banda del núcleo de molde en 1.2343 templado, en
   una máquina de cabezal B/C. El eje se inclina 10° respecto a la normal hacia el lado del flanco y, cerca de cada brida,
   hasta 14° más hacia el centro para apartar el portaherramientas del espárrago. GL sobre Z-map; respaldo en planta 2D.
   Cámara desde −X+Y pero más de lado que a lo largo de X: mirando por X el espárrago cercano tapa el contacto y no se
   ve el hueco entre porta y espárrago; a 118° la inclinación lateral sigue viéndose (≥ 7° en pantalla lejos de bridas). */
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
  const ID_FIN = 1, ID_SEMI = 2, APPR = 25, LIFT = 5, ZTOP = 100;
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
  const nn = [0, 0, 0];
  function pose(x, yc, R, noTilt, o) {
    let px = x;
    for (let it = 0; it < 8; it++) { NU.normal(px, yc, nn); const q = x - R * nn[0]; if (abs(q - px) < 1e-7) break; px = q; }
    const e = NU.eval(px, yc), pz = e[0];
    NU.normal(px, yc, nn);
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

  /* ---------- programa completo (sin DOM): lo usan la escena y las pruebas de Node ---------- */
  async function build(nx, ny, idle) {
    idle = idle || (() => Promise.resolve());
    const now = () => G.performance ? G.performance.now() : Date.now(), ms = {};
    let tm = now();
    const lap = k => { const t1 = now(); ms[k] = +(t1 - tm).toFixed(1); tm = t1; return idle().then(() => { tm = now(); }); };
    const T = new C.Tool(TOOL), R = T.R, band = NU.band();
    await lap('band');
    const zm = NU.zmap(nx, ny), model = NU.model(zm), fp = NU.footprint;
    await lap('model');
    /* semiacabado previo: la piel parte de un bruto ligeramente por encima, así las celdas del borde de la huella (donde
       el gradiente de rejilla no vale) quedan a la misma piel calculada sobre la normal analítica */
    const base = new Float32Array(model.length), E = [0, 0, 0], cx = 2 * zm.cx, cy = 2 * zm.cy, inner = -2 * Math.max(zm.cx, zm.cy);
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
      const x = zm.xc(i), y = zm.yc(j), d = fp(x, y);
      if (d > 0) { base[q] = model[q]; continue; }
      /* pendiente por diferencias centrales del modelo (superficie C2); junto al borde, la analítica */
      let gx, gy;
      if (d < inner) { gx = (model[q + 1] - model[q - 1]) / cx; gy = (model[q + nx] - model[q - nx]) / cy; } else { NU.eval(x, y, E); gx = E[1]; gy = E[2]; }
      base[q] = model[q] + (SKIN + 0.02) * hypot(gx, gy, 1);
    }
    zm.setBase(base);
    await lap('base');
    C.Strat.skin({ zmap: zm, model, stock: SKIN, tool: T, ae: SKIN_AE, axis: 'x', region: fp, toolId: ID_SEMI, save: false });
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
      if (fp(zm.xc(i), zm.yc(j)) > 0 || zm.at[4 * q] === ID_SEMI) continue;
      zm.at[4 * q] = ID_SEMI; zm.at[4 * q + 3] |= C.ZMap.FLAG.CUT;
    }
    zm.saveBase();
    await lap('skin');

    /* pasadas en el centro de la franja de acabado */
    const yc0 = (band.y0 + band.y1) / 2 - (PASSES - 1) * AE / 2, nX = Math.round(2 * XC / DS);
    const pb = new C.PathBuilder({ ds: DS, safeZ: ZTOP }), ps = mkPose();
    const cap = PASSES * (nX + 1) + 3, CP = new Float32Array(3 * cap), NR = new Float32Array(3 * cap), AX = new Float32Array(3 * cap);
    const PASS = new Int16Array(cap), XS = new Float32Array(cap);
    let m = 0;
    const rec = (k, x) => { for (let e = 0; e < 3; e++) { CP[3 * m + e] = ps.p[e]; NR[3 * m + e] = ps.n[e]; AX[3 * m + e] = ps.a[e]; } PASS[m] = k; XS[m++] = x; };
    const ax = { i: 0, j: 0, k: 1 }, oax = () => { ax.i = ps.a[0]; ax.j = ps.a[1]; ax.k = ps.a[2]; return ax; };
    for (let k = 0; k < PASSES; k++) {
      if (k === PASSES >> 1) await lap('path1');
      const yc = yc0 + k * AE, dir = k % 2 ? -1 : 1;
      for (let q = 0; q <= nX; q++) {
        const x = dir * (-XC + q * DS);
        pose(x, yc, R, false, ps);
        if (!pb.n) {
          /* aproximación a lo largo del eje: G0 a 25 mm de la punta y entrada en avance */
          const t = ps.tip, a = ps.a;
          pb.rapid(t[0] + APPR * a[0], t[1] + APPR * a[1], t[2] + APPR * a[2], oax()); rec(-1, x);
          pb.feed(t[0], t[1], t[2], 2, T.cut.Fentry, oax()); rec(k, x);
          continue;
        }
        pb.feed(ps.tip[0], ps.tip[1], ps.tip[2], 1, 0, oax()); rec(k, x);
      }
    }
    const kLast = pb.n - 1, t = ps.tip, a = ps.a;
    pb.feed(t[0] + LIFT * a[0], t[1] + LIFT * a[1], t[2] + LIFT * a[2], 3, T.cut.Fentry, oax()); rec(-2, XS[kLast]);
    pb.rapid(pb.x, pb.y, ZTOP, oax()); rec(-2, XS[kLast]);
    const path = pb.build();
    /* PathBuilder.rapid() no guarda el eje que recibe: el G0 de aproximación ya va orientado como la entrada */
    for (let e = 0; e < 3; e++) path.axis[e] = path.axis[3 + e];
    await lap('path');

    /* bridas a partir de la postura sin componente de brida al final de la pasada central (§4.4, revisión de oficio) */
    const RG = rings(T, 48), RGs = rings(T, 24), mid = PASSES >> 1, ycm = yc0 + mid * AE, obs = [], fixtures = [];
    for (const sgn of [1, -1]) {
      pose(sgn * XC, ycm, R, true, ps);
      const nose = [ps.tip[0] + T.stick * ps.a[0], ps.tip[1] + T.stick * ps.a[1], ps.tip[2] + T.stick * ps.a[2]];
      const top = nose[2] + CLAMP.over, y = nose[1], hw = CLAMP.w / 2;
      /* el espárrago se acerca hasta que la holgura sin componente de brida es GAP */
      let lo = 0, hi = 40;
      for (let it = 0; it < 16; it++) {
        const md = (lo + hi) / 2, st = [obstacle('cyl', { x: nose[0] + sgn * md, y, r: CLAMP.stud, z0: 0, z1: top })];
        if (clearance(RGs, st, ps.tip, ps.a, true) < GAP) lo = md; else hi = md;
      }
      const xs = nose[0] + sgn * hi, xa = sgn * CLAMP.x0, xb = sgn * CLAMP.x1;
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
    const plate = NU.plate;
    obs.push(obstacle('box', { x0: plate.x0, x1: plate.x1, y0: plate.y0, y1: plate.y1, z0: plate.z0, z1: plate.z1 }));
    await lap('fixtures');

    /* el posicionado inicial ya orienta el cabezal: B y C de la entrada en la misma línea (antes de M128) */
    const bc0 = C.kin.bc([path.axis[0], path.axis[1], path.axis[2]]);
    const nc = Object.assign({}, NC, { map: b => b.g === 'G0' && b.m === 'M3' ? Object.assign({}, b, { b: bc0.B, c: bc0.C }) : b });
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T, toolId: ID_FIN, path, S: T.cut.S, label: 'acabado 5 ejes' }], machine: MACHINE, sim: SIM, nc });
    await lap('program');
    const n = m;
    return { zm, model, T, path, prog, band, yc0, fixtures, obs, RG, kLast, ms,
      CP: CP.subarray(0, 3 * n), NR: NR.subarray(0, 3 * n), AX: AX.subarray(0, 3 * n), PASS: PASS.subarray(0, n), XS: XS.subarray(0, n) };
  }

  C.define('cinco-ejes', async function (env) {
    const V = C.V2D, PAL = C.PAL, g = GRIDS[env.tier] || GRIDS.A, gl = env.gl, fs = C.fmt.sign;
    await env.idle();
    const B = await build(g[0], g[1], env.idle), prog = B.prog, zm = B.zm, T = B.T, path = B.path;
    await env.idle();
    const VD = prog.visualDuration, D = VD + HOLD, tEnd = prog.pointTime(0, B.kLast);
    /* inicio de cada pasada en distancia (backplot y erizo solo de la pasada actual) */
    const passD = new Float32Array(PASSES + 1), passK = new Int32Array(PASSES + 1);
    for (let k = 0, p = -1; k < path.n; k++) if (B.PASS[k] > p) { p = B.PASS[k]; passD[p] = path.dist[k]; passK[p] = k; }
    passD[PASSES] = path.dist[B.kLast]; passK[PASSES] = B.kLast;

    let ter = null, tm = null, ln = null, vec = null;
    const meshes = [];
    if (gl) {
      ter = gl.terrain(zm, { model: B.model, material: 'steelHard', raw: 'milled', tints: { [ID_FIN]: PAL.tint.finish, [ID_SEMI]: PAL.tint.semi } });
      tm = gl.tool(T);
      ln = gl.lines(path);
      vec = gl.vectors(48, { width: 1, styles: [{ c: PAL.gold, a: 0.75 }] });
      const mat = { color: CLAMP.color, metal: 0.25, gloss: 0.35 }, steel = { color: '#5A636B', metal: 0.5, gloss: 0.5 };
      for (const f of B.fixtures) {
        const b = f.strap, s = f.shim, st = f.stud, w = f.washer, n = f.nut;
        meshes.push(gl.mesh({ kind: 'box', size: [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0], at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], material: mat }));
        meshes.push(gl.mesh({ kind: 'box', size: [s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0], at: [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2], material: mat }));
        meshes.push(gl.mesh({ kind: 'cyl', r: st.r, h: st.z1 - st.z0, z0: st.z0, seg: 24, at: [st.x, st.y, 0], material: steel }));
        meshes.push(gl.mesh({ kind: 'cyl', r: w.r, h: w.z1 - w.z0, z0: w.z0, seg: 32, at: [w.x, w.y, 0], material: steel }));
        meshes.push(gl.mesh({ kind: 'cyl', r: n.r, h: n.z1 - n.z0, z0: n.z0, seg: 6, at: [n.x, n.y, 0], material: steel }));
      }
      await env.idle();
    }
    const items = [{ h: ter }].concat(meshes.map(h => ({ h }))), iLn = items.push({ h: ln, upTo: 0, from: 0, width: 1 }) - 1;
    items.push({ h: vec });
    const iTool = items.push({ h: tm, pos: null, axis: null, spin: 1 }) - 1;
    const shadow = { h: tm, pos: null, axis: null };
    const cam = { type: 'ortho', az: 118, el: 26, fit: { bbox: [-62, -27, 0, 62, 27, 30], safe: { top: 44, right: 0, bottom: env.safe.bottom, left: 30 } } };

    /* estado en el punto de contacto, interpolado entre los puntos k−1 y k de la trayectoria */
    const cur = { p: [0, 0, 0], n: [0, 0, 1], a: [0, 0, 1], pass: -1, ang: 0 };
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
      cur.pass = st.phase === 'cut' ? Math.max(B.PASS[k0], B.PASS[k]) : -1;
      cur.ang = Math.acos(Math.min(1, cur.n[0] * cur.a[0] + cur.n[1] * cur.a[1] + cur.n[2] * cur.a[2])) * DEG;
      return cur;
    }

    let t = 0, held = false, hudT = -1, clrMin = 1e9;
    /* HUD de lienzo en tres líneas: el bloque en curso partido en la palabra B, y la medida del ángulo y de la holgura */
    const VAL = PAL.hud.value, TXT = PAL.hud.text;
    const L3 = [{ text: '', color: TXT }, { text: '', color: VAL }, { text: ' · holgura porta ', color: TXT }, { text: '', color: VAL }];
    const HUD = [{ text: '', color: VAL }, { parts: [{ text: '', color: VAL }, { text: '', color: PAL.hud.sim }] }, { parts: L3 }];
    const SIMTXT = '  SIM ×' + SIM;
    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const st = prog.state(), r = st.rot || {}, c = contact(), P2 = HUD[1].parts;
      if (c.pass < 0) {
        /* aproximación y retirada: la línea NC del programa (cabecera, M128, posicionado orientado) */
        const l = prog.line(st.block), k = l.length > 30 ? l.lastIndexOf(' B', 30) : -1;
        HUD[0].text = k > 0 ? l.slice(0, k) : l; P2[0].text = k > 0 ? l.slice(k + 1) : 'B' + fs(r.B || 0) + ' C' + fs(r.C || 0);
      } else {
        HUD[0].text = 'L X' + fs(st.pos[0]) + ' Y' + fs(st.pos[1]) + ' Z' + fs(st.pos[2]);
        P2[0].text = 'B' + fs(r.B || 0) + ' C' + fs(r.C || 0) + ' F' + Math.round(st.feed);
      }
      P2[1].text = SIMTXT;
      const h = clearance(B.RG, B.obs, st.pos, st.axis || c.a, true, 99.9);
      if (h < clrMin) clrMin = h;
      L3[0].text = 'eje–normal '; L3[1].text = c.pass >= 0 ? c.ang.toFixed(1) + '°' : '–';
      L3[3].text = h < 99.9 ? h.toFixed(1) + ' mm' : '–';
    }
    const hudDraw = c => V.draw.hudText(c, 10, 8, HUD, { lh: 13 });

    const q0 = [0, 0], q1 = [0, 0], P3 = [0, 0, 0];
    function seg2d(c, p, d, len, color, alpha, dash, w) {
      gl.project(p, q0); P3[0] = p[0] + d[0] * len; P3[1] = p[1] + d[1] * len; P3[2] = p[2] + d[2] * len; gl.project(P3, q1);
      c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.setLineDash(dash);
      c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke(); c.restore();
    }
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
    /* erizo: ejes cada 3 mm sobre la pasada actual, que se desvanecen detrás de la herramienta */
    const HP = [0, 0, 0], HA = [0, 0, 0];
    function hedgehog(c, dNow) {
      vec.clear();
      if (c.pass < 0) return;
      const k0 = passK[c.pass], k1 = passK[c.pass + 1];
      let next = 0;
      for (let k = k0; k < k1; k++) {
        const d = path.dist[k] - passD[c.pass];
        if (path.dist[k] > dNow) break;
        if (d < next) continue;
        next = d + 3;
        const age = dNow - path.dist[k], al = Math.max(0, 1 - age / 45);
        if (al <= 0) continue;
        for (let e = 0; e < 3; e++) { HP[e] = B.CP[3 * k + e]; HA[e] = B.AX[3 * k + e]; }
        vec.push(HP, HA, 7, 0, al);
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
        const L = items[iLn];
        if (c.pass >= 0) { L.h = ln; L.from = passD[c.pass]; L.upTo = st.dist; } else L.h = null;
        hedgehog(c, st.dist);
        const it = items[iTool];
        it.pos = st.pos; it.axis = st.axis; it.spin = st.S > 0 ? 1 : 0;
        shadow.pos = st.pos; shadow.axis = st.axis;
        gl.frame(items, { toolShadow: shadow });
        if (c.pass >= 0) {
          seg2d(ctx, c.p, c.n, 12, '#EAF0F6', 0.9, [3, 2.5], 1.25);
          seg2d(ctx, c.p, c.a, 12, PAL.gold, 1, [], 1.5);
        }
        triad(ctx);
        hudDraw(ctx);
      },
      final() {
        /* un instante antes del final de la última pasada: aún en avance, con el vector y el erizo */
        const tf = tEnd - 0.02;
        if (prog.t > tf) prog.reset();
        prog.advanceTo(tf);
        t = tf / SIM; held = true; texts(true);
      },
      hud() { return null; },
      resize() { hudT = -1; texts(true); },
      fallback(e2) { return plan(e2); },
      stats() {
        const c = contact(), r = prog.state().rot || {};
        /* inclinación eje–normal tal como se ve en pantalla (criterio de encuadre: ≥ 6°) */
        let scr = 0;
        if (gl && c.pass >= 0) {
          const v = [0, 0], w = [0, 0];
          gl.project(c.p, q0);
          for (let e = 0; e < 3; e++) P3[e] = c.p[e] + c.n[e] * 12;
          gl.project(P3, q1); v[0] = q1[0] - q0[0]; v[1] = q1[1] - q0[1];
          for (let e = 0; e < 3; e++) P3[e] = c.p[e] + c.a[e] * 12;
          gl.project(P3, q1); w[0] = q1[0] - q0[0]; w[1] = q1[1] - q0[1];
          scr = Math.acos(Math.min(1, (v[0] * w[0] + v[1] * w[1]) / (hypot(v[0], v[1]) * hypot(w[0], w[1])))) * DEG;
        }
        return { simFactor: SIM, collisions: prog.collisions + zm.collisions, removedMm3: +zm.removed.toFixed(1), machineS: +prog.duration.toFixed(2),
          passes: PASSES, angleNow: +c.ang.toFixed(2), B: +(r.B || 0).toFixed(3), C: +(r.C || 0).toFixed(3), clearHolderSeen: +clrMin.toFixed(2), tiltScreenDeg: +scr.toFixed(2), initPhases: B.ms };
      },
      dispose() { if (gl) gl.dispose(); }
    };

    /* Respaldo: planta del mismo Z-map con las bridas, la bola, la nariz del porta desplazada y el eje proyectado */
    function plan(e2) {
      let v = null;
      const c = e2.ctx2d, VIEW = { x0: -70, y0: -27, x1: 70, y1: 27 };
      const rect = () => { const F = e2.frame, sf = e2.safe; return { x: 6, y: 52, w: F.w - 12, h: F.h - sf.bottom - 56 }; };
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
    grids: GRIDS, machine: MACHINE, build, pose, mkPose, tiltX, rings, clearance
  });
})(globalThis);
