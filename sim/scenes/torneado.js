/* Escena torneado (§4.8): cilindrado de C45 con G71 + G70 en alzado XZ (Z a la derecha, X arriba), herramienta por
   encima del eje como en torreta trasera. Canvas 2D a 2.8 px/mm sobre un perfil de radios cada 0.1 mm de Z. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.NC) return;
  const PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, hypot = Math.hypot;

  const PX = 2.8, SIM = 4, ENTRY = 0.7, HOLD = 1.5;
  const BAR = { r: 16, stick: 70, jaw: 18, jawH: 22, jawW: 20, chuckR: 84.5 };
  const RE = 0.8, HOME = [50, 50], START = [1, 17];
  /* el husillo acelera a 1500 rpm/s: llega a 2200 en ≈ 1.5 s, como la rampa del resto de escenas */
  const MACH = { rapid: 24000, accel: 4.9, sAcc: 1500, sMax: 4000 };
  const ROUGH = { u: 1.5, ret: 0.5, U: 0.4, W: 0.1, f: 0.28, S: 2200 };
  const FIN = { f: 0.12, vc: 260 };
  /* perfil P70–Q140 tal como va en el programa (X en diámetro) */
  const PROF = [{ g: 'G0', x: 18 }, { g: 'G1', z: 0, f: FIN.f }, { g: 'G1', x: 20, z: -1 }, { g: 'G1', z: -25 },
    { g: 'G2', x: 26, z: -28, r: 3 }, { g: 'G1', z: -45 }, { g: 'G1', x: 30, z: -47 }, { g: 'G1', x: 33 }];
  const Z0 = -72, DZ = 0.1, NZ = 740;
  /* envolvente inferior de la CNMG 120408 en un PCLNR respecto al centro del radio de punta: arco de rε hasta la
     tangencia con el filo secundario (5° sobre +Z), que llega hasta 11.97 mm */
  const T5 = Math.tan(5 * PI / 180), TZ = RE * Math.sin(5 * PI / 180), TR = -RE * Math.cos(5 * PI / 180), EDGE = 11.97;
  const low = dz => dz < TZ ? -sqrt(max(0, RE * RE - dz * dz)) : TR + (dz - TZ) * T5;
  /* fondo del porta: 0.32 mm sobre el centro de punta, de 6.1 a 31.1 mm hacia +Z (view2d.holderPCLNR) */
  const HOLDER = { r: 0.32, z0: 6.12, z1: 31.12 };

  function listing() {
    const NC = C.NC, d = 'iso-lathe', H = NC.header(d, { O: 2001, title: 'CILINDRADO C45' }), out = [H[0]];
    let st = NC.state(d);
    const f = b => out.push(NC.format(b, d, st));
    f({ g: 'CYCLE', text: H[1] });
    f({ g: 'TC', t: 1 });
    f({ g: 'M', text: 'G97', s: ROUGH.S, m: 'M03' });
    f({ g: 'G0', x: 2 * START[1], z: START[0], m: 'M08' });
    f({ g: 'CYCLE', text: 'G71 U' + ROUGH.u + ' R' + ROUGH.ret });
    f({ g: 'CYCLE', text: 'G71 P70 Q140 U' + ROUGH.U + ' W' + ROUGH.W + ' F' + ROUGH.f });
    /* los bloques P–Q se leen como un perfil aparte: llevan su propio modal (G00/G01 explícitos) */
    st = NC.state(d, { n: st.n });
    PROF.forEach(f);
    f({ g: 'CYCLE', text: 'G50', s: MACH.sMax });
    f({ g: 'CYCLE', text: 'G96', s: FIN.vc });
    f({ g: 'CYCLE', text: 'G70 P70 Q140' });
    f({ g: 'G0', x: 2 * HOME[1], z: HOME[0], m: 'M09' });
    f({ g: 'M', text: 'M05' });
    f({ g: 'M', text: 'M30' });
    return out;
  }

  /* contorno en (z, radio), desplazado (dz, dr): U/W del G71 trasladan el perfil */
  function contour(dz, dr) {
    const segs = [];
    let z = START[0], r = 0;
    for (const b of PROF) {
      const z1 = b.z != null ? b.z + dz : z, r1 = b.x != null ? b.x / 2 + dr : r;
      if (b.g === 'G0') { r = r1; continue; }
      const s = { g: b.g, z0: z, r0: r, z1, r1 };
      if (b.r) {
        const cz = z1 - z, cr = r1 - r, L = hypot(cz, cr), h = sqrt(max(0, b.r * b.r - L * L / 4)) / L, sg = b.g === 'G2' ? 1 : -1;
        s.R = b.r; s.cz = (z + z1) / 2 + sg * h * cr; s.cr = (r + r1) / 2 - sg * h * cz;
        s.a0 = Math.atan2(r - s.cr, z - s.cz); s.a1 = Math.atan2(r1 - s.cr, z1 - s.cz);
        if (sg > 0) while (s.a1 > s.a0) s.a1 -= 2 * PI; else while (s.a1 < s.a0) s.a1 += 2 * PI;
      }
      segs.push(s); z = z1; r = r1;
    }
    return { r0: segs[0].r0, segs };
  }
  const points = (K, out) => {
    for (const s of K.segs) {
      if (!s.R) { out.push([s.z1, s.r1]); continue; }
      const n = Math.ceil(abs(s.a1 - s.a0) * s.R / 0.15);
      for (let k = 1; k <= n; k++) { const a = s.a0 + (s.a1 - s.a0) * k / n; out.push([s.cz + s.R * Math.cos(a), s.cr + s.R * Math.sin(a)]); }
    }
    return out;
  };
  /* fin de pasada: donde el contorno sube por encima del radio de la pasada (tipo I: r no decrece hacia −Z) */
  function passEnd(K, rk) {
    for (const s of K.segs) {
      if (!(max(s.r0, s.r1) > rk + 1e-9)) continue;
      if (!s.R) return abs(s.r1 - s.r0) < 1e-12 ? s.z0 : s.z0 + (rk - s.r0) / (s.r1 - s.r0) * (s.z1 - s.z0);
      const w = sqrt(max(0, s.R * s.R - (rk - s.cr) * (rk - s.cr))), a = s.cz - w, b = s.cz + w;
      return a >= min(s.z0, s.z1) - 1e-9 && a <= max(s.z0, s.z1) + 1e-9 ? a : b;
    }
    return K.segs[K.segs.length - 1].z1;
  }

  /* recorrido de máquina: muestras (t, z, r, S) con el husillo limitado en aceleración, G99 (F = f·S) y G96 con G0
     calculado al punto final del bloque, como hace el control */
  function build() {
    const lines = listing(), blk = n => lines.findIndex(l => l.indexOf('N' + n + ' ') === 0);
    const fin = contour(0, 0), sh = contour(ROUGH.W, ROUGH.U / 2), M = [];
    const go = (z, r, b) => M.push({ g0: 1, to: [z, r], blk: b, kind: 0 });
    const cut = (z, r, b, f, op, kind) => M.push({ to: [z, r], blk: b, f, op, kind: kind || 1 });
    M.push({ spin: ROUGH.S, blk: blk(30) });
    go(START[0], START[1], blk(40));
    /* el ciclo no baja del primer cilindro del perfil: lo que queda del chaflán lo quita la pasada de perfil */
    const rFloor = min(...sh.segs.filter(s => !s.R && s.z0 <= 0 && abs(s.r1 - s.r0) < 1e-9).map(s => s.r0)), passes = [], b60 = blk(60);
    for (let rk = BAR.r - ROUGH.u, last = false; !last; rk -= ROUGH.u) {
      if (rk <= rFloor + 1e-9) { rk = rFloor; last = true; }
      const ze = passEnd(sh, rk);
      passes.push({ d: 2 * rk, z: ze });
      go(START[0], rk, b60);
      cut(ze, rk, b60, ROUGH.f, 1);
      cut(ze + ROUGH.ret, rk + ROUGH.ret, b60, ROUGH.f, 1, 2);
      go(START[0], rk + ROUGH.ret, b60);
    }
    go(START[0], sh.r0, b60);
    for (const p of points(sh, [])) cut(p[0], p[1], b60, ROUGH.f, 1);
    go(START[0], START[1], b60);
    M.push({ css: true, blk: blk(160) });
    const b170 = blk(170);
    go(START[0], fin.r0, b170);
    for (const p of points(fin, [])) cut(p[0], p[1], b170, FIN.f, 2);
    go(START[0], START[1], b170);
    go(HOME[0], HOME[1], blk(180));
    M.push({ spin: 0, blk: blk(190) });
    const end = blk(200);
    return { lines, M, passes, fin, sh, end, rFloor, ...simulate(M) };
  }

  function simulate(M) {
    const A = MACH.accel * 1000, VR = MACH.rapid / 60, DT = 0.004, T = [], Zs = [], Rs = [], Ss = [], Mi = [], Wt = [];
    let t = 0, z = HOME[0], r = HOME[1], S = 0, Sp = 0, css = false;
    const rec = (i, w) => { T.push(t); Zs.push(z); Rs.push(r); Ss.push(S); Mi.push(i); Wt.push(w ? 1 : 0); };
    const toward = (tgt, dt) => { const d = MACH.sAcc * dt; S = abs(tgt - S) <= d ? tgt : S + (tgt > S ? d : -d); };
    const cssS = rr => min(MACH.sMax, FIN.vc * 1000 / (PI * 2 * max(rr, 1e-3)));
    rec(0);
    M.forEach((m, i) => {
      if (m.css) { css = true; return; }
      if (m.spin != null) {
        Sp = m.spin;
        while (S !== Sp) { const dt = min(DT, abs(Sp - S) / MACH.sAcc); toward(Sp, dt); t += dt; rec(i); }
        return;
      }
      /* llegada de husillo: el avance no arranca hasta que S está en su valor (G97 o el de G96 en ese diámetro) */
      if (!m.g0) { const tg = css ? cssS(r) : Sp; while (abs(S - tg) > 1) { const dt = min(DT, abs(tg - S) / MACH.sAcc); toward(tg, dt); t += dt; rec(i, 1); } }
      const z0 = z, r0 = r, L = hypot(m.to[0] - z0, m.to[1] - r0);
      let s = 0, v = 0;
      /* avance a S estable (G97, o G96 sin cambio de diámetro): velocidad constante, basta la muestra final */
      if (!m.g0 && L > 1e-9 && (!css || abs(m.to[1] - r0) < 1e-9) && abs(S - (css ? cssS(r0) : Sp)) <= 1) {
        S = css ? cssS(r0) : Sp; t += L / (m.f * S / 60); z = m.to[0]; r = m.to[1]; rec(i);
        return;
      }
      while (s < L - 1e-9) {
        toward(css ? cssS(m.g0 ? m.to[1] : r) : Sp, DT);
        const vt = m.g0 ? min(VR, v + A * DT, sqrt(2 * A * (L - s))) : m.f * S / 60;
        let dt = DT, ds = vt * DT;
        if (s + ds >= L) { ds = L - s; dt = ds / max(vt, 1e-6); }
        s += ds; t += dt; v = vt;
        z = z0 + (m.to[0] - z0) * s / L; r = r0 + (m.to[1] - r0) * s / L;
        rec(i);
      }
      z = m.to[0]; r = m.to[1];
    });
    const F = a => Float64Array.from(a);
    return { T: F(T), Z: F(Zs), R: F(Rs), S: F(Ss), MI: Uint16Array.from(Mi), W: Uint8Array.from(Wt), TM: t };
  }

  /* pieza: tabla de radios y estado de la superficie (0 bruto, 1 desbaste, 2 acabado) */
  function Part(B) {
    const prof = new Float32Array(NZ), surf = new Uint8Array(NZ), o = { prof, surf, k: 1, z: HOME[0], r: HOME[1], tm: 0 };
    const zc = i => Z0 + (i + 0.5) * DZ;
    o.reset = () => {
      for (let i = 0; i < NZ; i++) prof[i] = zc(i) < 0 ? BAR.r : 0;
      surf.fill(0);
      Object.assign(o, { k: 1, z: HOME[0], r: HOME[1], tm: 0, removed: 0, rapidMm3: 0, retMm3: 0, collisions: 0, holderHit: 0, d0: NZ, d1: -1, cutting: false });
    };
    function stamp(z, r, op, kind) {
      const nz = z + RE, nr = r + RE;
      if (nr - RE >= BAR.r) return 0;
      const i0 = max(0, Math.ceil((nz - RE - Z0) / DZ - 0.5)), i1 = min(NZ - 1, Math.floor((nz + EDGE - Z0) / DZ - 0.5));
      let v = 0;
      for (let i = i0; i <= i1; i++) {
        const nr2 = nr + low(zc(i) - nz), p = prof[i];
        if (nr2 < p - 1e-6) {
          v += PI * (p * p - nr2 * nr2) * DZ; prof[i] = nr2; surf[i] = op;
          if (i < o.d0) o.d0 = i; if (i > o.d1) o.d1 = i;
        }
      }
      const h0 = max(0, Math.ceil((nz + HOLDER.z0 - Z0) / DZ - 0.5)), h1 = min(NZ - 1, Math.floor((nz + HOLDER.z1 - Z0) / DZ - 0.5));
      for (let i = h0; i <= h1; i++) if (prof[i] > nr + HOLDER.r + 1e-6) { o.holderHit++; break; }
      o.removed += v;
      if (kind === 0) { o.rapidMm3 += v; if (v > 1e-3) o.collisions++; } else if (kind === 2) o.retMm3 += v;
      return v;
    }
    function line(z1, r1, m) {
      const L = hypot(z1 - o.z, r1 - o.r), n = Math.ceil(L / 0.05);
      let v = 0;
      for (let k = 1; k <= n; k++) v += stamp(o.z + (z1 - o.z) * k / n, o.r + (r1 - o.r) * k / n, m.op || 0, m.kind);
      o.z = z1; o.r = r1;
      return v;
    }
    /* posición, S y movimiento en tm (máquina) sin estampar */
    o.at = (tm, out) => {
      const T = B.T;
      let lo = 1, hi = T.length - 1;
      if (tm >= T[hi]) lo = hi; else while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] > tm) hi = m; else lo = m + 1; }
      const u = T[lo] > T[lo - 1] ? min(1, max(0, (tm - T[lo - 1]) / (T[lo] - T[lo - 1]))) : 1;
      out.k = lo; out.z = B.Z[lo - 1] + (B.Z[lo] - B.Z[lo - 1]) * u; out.r = B.R[lo - 1] + (B.R[lo] - B.R[lo - 1]) * u;
      out.S = B.S[lo - 1] + (B.S[lo] - B.S[lo - 1]) * u; out.m = B.M[B.MI[lo]]; out.wait = B.W[lo] === 1;
      return out;
    };
    const P = {};
    o.advance = tm => {
      if (tm < o.tm - 1e-12) o.reset();
      o.at(tm, P);
      let v = 0;
      for (let k = o.k; k < P.k; k++) v += line(B.Z[k], B.R[k], B.M[B.MI[k]]);
      v += line(P.z, P.r, P.m);
      o.k = P.k; o.tm = tm; o.cutting = v > 1e-4 && P.m.kind === 1;
      return P;
    };
    o.reset();
    return o;
  }

  /* viruta en «6» o «C»: sale de la punta hacia arriba y hacia +Z y cae; como mucho 12 vivas */
  function Chips(rng) {
    const MAX = 12, pool = [], g = 700;
    for (let k = 0; k < MAX; k++) pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, L: 0, R: 0, six: false, c: '', lw: 1, x0: 0, y0: 0 });
    const o = { pool, acc: 0, alive: 0, spawned: 0, maxAlive: 0 };
    o.reset = () => { for (const c of pool) c.on = false; o.acc = 0; o.alive = 0; o.spawned = 0; o.maxAlive = 0; };
    o.step = (dt, cut, x, y, apPx, fine, W, H) => {
      let n = 0;
      for (const c of pool) {
        if (!c.on) continue;
        c.vy += g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.w * dt;
        if (c.y > H + 20 || c.x > W + 20) c.on = false; else n++;
      }
      if (cut) {
        o.acc += dt;
        const gap = fine ? 1 / 14 : 1 / 11;
        while (o.acc >= gap) {
          o.acc -= gap;
          const c = n < MAX && pool.find(q => !q.on);
          if (!c) continue;
          const k = rng(), q = fine ? 0.6 : 1;
          c.on = true; n++; o.spawned++;
          c.x0 = c.x = x + rng() * 2; c.y0 = c.y = y - rng() * apPx;
          c.vx = 30 + 80 * rng(); c.vy = -(90 + 70 * rng()); c.a = rng() * 2 * PI; c.w = (rng() - 0.5) * 14;
          c.L = (4 + 4 * rng()) * PX * q; c.R = (1.1 + 0.6 * rng()) * PX * q; c.six = k < 0.5; c.lw = fine ? 0.8 : 1.15;
          const m = fine ? 0.75 + 0.25 * rng() : rng();
          c.c = 'rgb(' + Math.round(216 - 13 * m) + ',' + Math.round(196 + 14 * m) + ',' + Math.round(140 + 76 * m) + ')';
        }
      } else o.acc = 0;
      o.alive = n; if (n > o.maxAlive) o.maxAlive = n;
    };
    return o;
  }

  C.define('torneado', async function (env) {
    const V = C.V2D, PAL = C.PAL, doc = G.document, t0 = G.performance.now();
    const B = build(), buildMs = G.performance.now() - t0;
    await env.idle();
    const t1 = G.performance.now(), part = Part(B), chips = Chips(env.rng), VM = B.TM / SIM, D = ENTRY + VM + HOLD;
    const initMs = buildMs + G.performance.now() - t1, P = {}, fix = C.fmt.fix;
    let t = 0, last = -1, held = false, L = null, bar = null, strips = null, hudT = -1, rows = null, jobs = { n: 0, sum: 0, max: 0 };

    const geo = () => {
      const w = env.frame.w, x0 = w - 94, ya = 112, chuck = x0 - (BAR.stick + BAR.jaw) * PX;
      return { w, h: env.frame.h, x0, ya, chuck, jawX: x0 - BAR.stick * PX, hx: 16 };
    };
    const X = z => L.x0 + z * PX, Y = r => L.ya - r * PX;

    /* tiras de sombreado de cilindro (1 px de ancho), escaladas al radio de cada columna: brillo quieto */
    function strip(base, k, ks, sh) {
      const cv = doc.createElement('canvas'), N = 128, c = cv.getContext('2d'), im = c.createImageData(1, N), rgb = PAL.rgb(base);
      cv.width = 1; cv.height = N;
      const l = [0, 0.55, 0.83], hl = hypot(0, 0.55, 1.83), hy = 0.55 / hl, hz = 1.83 / hl;
      for (let j = 0; j < N; j++) {
        const ny = 1 - 2 * (j + 0.5) / N, nz = sqrt(max(0, 1 - ny * ny)), dif = max(0, ny * l[1] + nz * l[2]);
        const sp = ks * Math.pow(max(0, ny * hy + nz * hz), sh);
        for (let q = 0; q < 3; q++) im.data[4 * j + q] = min(255, 255 * (rgb[q] * k * (0.3 + 0.7 * dif) + sp));
        im.data[4 * j + 3] = 255;
      }
      c.putImageData(im, 0, 0);
      return cv;
    }
    const mkStrips = () => [[strip('#7C848B', 1, 0.12, 10)], [0.95, 1, 1.05].map(k => strip('#A7AEB5', k, 0.22, 16)), [strip('#C4CAD0', 1, 0.6, 60)]];
    const hash = i => (Math.imul(i, 2654435761) >>> 0) % 3;

    /* barra en un lienzo propio a resolución de dispositivo; solo se repintan las columnas que cambian */
    function barCanvas() {
      const s = env.scale, top = Math.floor((L.ya - BAR.r * PX - 2) * s), hgt = Math.ceil((2 * BAR.r * PX + 4) * s) + 2;
      const cv = bar && bar.cv || doc.createElement('canvas');
      cv.width = Math.ceil(L.w * s); cv.height = hgt;
      bar = { cv, c: cv.getContext('2d'), top, s, c0: Math.max(0, Math.floor(L.chuck * s)) };
      paint(0, cv.width);
    }
    function paint(c0, c1) {
      const b = bar, c = b.c, s = b.s, prof = part.prof, surf = part.surf, H = 128;
      c0 = max(c0, b.c0); c1 = min(c1, b.cv.width);
      if (c1 <= c0) return;
      c.clearRect(c0, 0, c1 - c0, b.cv.height);
      let run = c0, pr = -1, pv = -1;
      const flush = end => { if (pr > 0 && end > run) { const y = (L.ya - pr * PX) * s - b.top; c.drawImage(strips[pv >> 2][pv & 3], 0, 0, 1, H, run, y, end - run, 2 * pr * PX * s); } };
      for (let x = c0; x < c1; x++) {
        const z = ((x + 0.5) / s - L.x0) / PX, i = Math.floor((z - Z0) / DZ);
        let r, v;
        if (i < 0) { r = BAR.r; v = 0; } else if (i >= NZ) { r = 0; v = 0; } else {
          r = prof[i]; const st = surf[i];
          v = st === 1 ? 4 + hash(Math.floor(z * 4) + 4096) : st === 2 ? 8 : 0;
        }
        r = Math.round(r * 1000) / 1000;
        if (r !== pr || v !== pv) { flush(x); run = x; pr = r; pv = v; }
      }
      flush(c1);
    }
    function dirty() {
      if (part.d1 < part.d0 || !bar) return;
      const s = bar.s, xa = X(Z0 + part.d0 * DZ) * s, xb = X(Z0 + (part.d1 + 1) * DZ) * s;
      paint(Math.floor(xa) - 1, Math.ceil(xb) + 1);
      part.d0 = NZ; part.d1 = -1;
    }

    function chuck(c) {
      const yA = L.ya, R = BAR.chuckR * PX;
      if (L.chuck > 0) {
        const e = L.chuck - 3 * PX;
        V.draw.cylinderShade(c, 0, yA - R, e, yA + R, '#4C5359', { axis: 'h' });
        V.draw.cylinderShade(c, e, yA - R, L.chuck, yA + R, '#353B41', { axis: 'h' });
        c.fillStyle = 'rgba(205,215,225,.22)'; c.fillRect(e, 0, 1, L.h);
        c.fillStyle = 'rgba(205,215,225,.12)'; c.fillRect(L.chuck - 1, 0, 1, L.h);
      }
    }
    function jaws(c, S) {
      const x1 = L.jawX, x0 = L.chuck, yA = L.ya, rIn = BAR.r * PX, rOut = (BAR.r + BAR.jawH) * PX, w2 = BAR.jawW / 2 * PX;
      const spin = min(1, S / 120);
      if (spin > 0) {
        c.globalAlpha = spin;
        const ro = hypot(rOut, w2), g = c.createLinearGradient(0, yA - ro, 0, yA + ro);
        const st = [[0, 0], [(ro - rOut) / (2 * ro), 0.5], [(ro - rIn) / (2 * ro), 0.72], [(ro - rIn) / (2 * ro) + 0.001, 0.46], [0.5, 0.4]];
        for (const [p, a] of st) { g.addColorStop(p, 'rgba(120,128,136,' + a + ')'); g.addColorStop(1 - p, 'rgba(96,104,112,' + a + ')'); }
        c.fillStyle = g; c.fillRect(x0, yA - ro, x1 - x0, 2 * ro);
        c.fillStyle = 'rgba(205,215,225,.16)'; c.fillRect(x1 - 1, yA - ro, 1, 2 * ro);
      }
      if (spin < 1) {
        /* parado: una garra arriba y la delantera de las de 120°, nítidas */
        c.globalAlpha = 1 - spin;
        const box = (ya, yb, f) => { c.fillStyle = f; c.fillRect(x0, ya, x1 - x0, yb - ya); c.strokeStyle = 'rgba(205,215,225,.3)'; c.lineWidth = 1; c.strokeRect(x0 + 0.5, ya + 0.5, x1 - x0 - 1, yb - ya - 1); };
        box(yA - rOut, yA - rIn, '#6E767D');
        const p = [rIn * 0.5 - w2 * 0.866, rOut * 0.5 + w2 * 0.866];
        box(yA + max(-w2 * 0.2, p[0]), yA + p[1], '#555C63');
      }
      c.globalAlpha = 1;
    }
    function centerline(c) {
      c.save();
      c.strokeStyle = 'rgba(140,160,178,.32)'; c.lineWidth = 0.75; c.setLineDash([10, 3, 2, 3]);
      c.beginPath(); c.moveTo(X(0) + 4, L.ya + 0.5); c.lineTo(L.w, L.ya + 0.5); c.stroke();
      c.restore();
    }
    function tool(c) {
      const nx = X(P.z + RE), ny = Y(P.r + RE);
      if (nx > L.w + 10 || ny < -50) return;
      V.draw.holderPCLNR(c, nx, ny, PX);
      V.draw.insertCNMG(c, nx, ny, PX);
    }
    function drawChips(c) {
      c.save(); c.lineCap = 'round';
      for (const q of chips.pool) {
        if (!q.on) continue;
        const sw = q.L / q.R;
        c.setTransform(env.scale, 0, 0, env.scale, env.ox, env.oy); c.translate(q.x, q.y); c.rotate(q.a);
        c.strokeStyle = q.c; c.lineWidth = q.lw;
        c.beginPath();
        if (q.six) { c.arc(0, 0, q.R * 0.75, 0, min(sw * 0.7, 2 * PI)); c.lineTo(q.R * 1.6, -q.R * 1.2); }
        else c.arc(0, 0, q.R, 0, min(sw, 1.6 * PI));
        c.stroke();
      }
      c.restore();
    }

    /* HUD de lienzo bajo el rótulo del HTML (arriba a la izquierda): la torreta barre la mitad superior derecha. Cuatro
       filas como mucho: la quinta caería sobre la barra (borde superior en y = 67) */
    const GCOL = { G00: PAL.hud.g0 || PAL.gold, G01: PAL.hud.g, G02: PAL.hud.g, G03: PAL.hud.g, G70: PAL.hud.g, G71: PAL.hud.g };
    const tok = (s, col) => s.split(' ').map((w, k) => ({ text: (k ? ' ' : '') + w, color: k === 0 && /^N/.test(w) ? PAL.hud.text : GCOL[w] || col }));
    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const ended = t >= ENTRY + VM, m = P.m;
      let bl;
      if (t < ENTRY) bl = B.lines[t < ENTRY / 2 ? 1 : 2]; else bl = B.lines[ended ? B.end : m.blk];
      let b1 = bl, b2 = '';
      const cut = bl.indexOf(' U');
      if (/ G71 P/.test(bl) && cut > 0) { b1 = bl.slice(0, cut); b2 = bl.slice(cut + 1); }
      const feed = !ended && t >= ENTRY && m && m.f && !m.g0 && !P.wait, S = Math.round(P.S), dia = 2 * P.r;
      rows = [tok(b1, PAL.hud.value), b2 ? tok(b2, PAL.hud.value) : [],
        [{ text: 'X', color: PAL.hud.text }, { text: fix(dia, 3), color: PAL.hud.value }, { text: ' Z', color: PAL.hud.text }, { text: fix(P.z, 3), color: PAL.hud.value }],
        [{ text: 'S', color: PAL.hud.text }, { text: String(S), color: PAL.hud.value }, { text: ' · ', color: PAL.hud.text },
          feed ? { text: 'F' + m.f.toFixed(2), color: PAL.hud.value } : { text: m && m.g0 && !ended && t >= ENTRY ? 'G00' : 'F–', color: m && m.g0 && !ended && t >= ENTRY ? PAL.gold : PAL.hud.text },
          { text: ' · Vc ' + (feed ? Math.round(PI * dia * P.S / 1000) : '–') + ' · ', color: PAL.hud.text }, { text: 'SIM ×' + SIM, color: PAL.hud.sim }]];
      if (!b2) rows.splice(1, 1);
    }
    function hud(c) {
      c.save();
      c.font = '9px ui-monospace,Menlo,Consolas,monospace'; c.textBaseline = 'top'; c.lineJoin = 'round';
      c.lineWidth = 2; c.strokeStyle = 'rgba(4,26,37,.7)';
      rows.forEach((row, k) => {
        let x = L.hx;
        const y = 21 + k * 10.5;
        for (const p of row) { c.strokeText(p.text, x, y); c.fillStyle = p.color; c.fillText(p.text, x, y); x += c.measureText(p.text).width; }
      });
      c.restore();
    }

    function step(tt, dt) {
      const tm = min(B.TM, max(0, (tt - ENTRY) * SIM));
      part.advance(tm);
      part.at(tm, P);
      const m = P.m, f2 = m.op === 2;
      if (L) chips.step(dt, part.cutting && P.S > 0, X(P.z), Y(P.r), (f2 ? 0.2 : ROUGH.u) * PX, f2, L.w, L.h);
    }

    const scene = {
      duration: D,
      grid: NZ + ' × 0.1 mm',
      start() {
        part.reset(); chips.reset(); t = 0; last = -1; held = false; hudT = -1;
        if (bar) paint(0, bar.cv.width);
        step(0, 0); texts(true);
      },
      update(tt, dt) {
        if (tt < last) { part.reset(); chips.reset(); if (bar) paint(0, bar.cv.width); }
        const idle = tt < ENTRY ? last >= 0 && (last < ENTRY / 2) === (tt < ENTRY / 2) : tt >= ENTRY + VM && held && !chips.alive;
        t = tt; last = tt;
        if (idle) return false;
        step(tt, dt || 0);
        if (tt >= ENTRY + VM) held = true;
        texts(false);
        return true;
      },
      render() {
        const c = env.ctx2d, q0 = G.performance.now();
        if (!L) scene.resize();
        dirty();
        chuck(c);
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bar.cv, env.ox, env.oy + bar.top); c.restore();
        jaws(c, P.S);
        centerline(c);
        tool(c);
        drawChips(c);
        hud(c);
        const ms = G.performance.now() - q0;
        jobs.n++; jobs.sum += ms; if (ms > jobs.max) jobs.max = ms;
      },
      final() {
        chips.reset(); part.advance(B.TM); part.at(B.TM, P);
        t = D; last = D; held = true; texts(true);
      },
      hud() { return {}; },
      resize() {
        L = geo();
        if (!strips) strips = mkStrips();
        barCanvas();
        if (!P.m) part.at(0, P);
        hudT = -1; texts(true);
      },
      stats() {
        return { simFactor: SIM, machineS: +B.TM.toFixed(2), cycleS: +D.toFixed(2), initOwnMs: +initMs.toFixed(2),
          passes: B.passes.map(p => ({ d: p.d, z: +p.z.toFixed(3) })), removedMm3: +part.removed.toFixed(1),
          collisions: part.collisions, holderHit: part.holderHit, rapidMm3: +part.rapidMm3.toFixed(4), retMm3: +part.retMm3.toFixed(4),
          chips: { alive: chips.alive, max: chips.maxAlive, spawned: chips.spawned },
          renderMs: { avg: +(jobs.sum / (jobs.n || 1)).toFixed(3), max: +jobs.max.toFixed(3), n: jobs.n },
          tool: { z: +P.z.toFixed(3), x: +(2 * P.r).toFixed(3), S: Math.round(P.S) } };
      },
      dispose() { if (bar) bar.cv.width = 0; }
    };
    return scene;
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('torneado', {
    tools: [],
    cuts: [{ dia: 32, vc: 221, S: ROUGH.S, f: ROUGH.f, F: 616 }, { dia: 33, vc: FIN.vc, S: 2508, f: FIN.f, F: 301 },
      { dia: 18, vc: 226.2, S: MACH.sMax, f: FIN.f, F: 480 }],
    insert: { iso: 'CNMG 120408', ic: 12.7, re: RE, holder: 'PCLNR 2525' },
    sim: SIM, entry: ENTRY, hold: HOLD, px: PX, bar: BAR, mach: MACH, rough: ROUGH, finish: FIN, grid: { z0: Z0, dz: DZ, n: NZ },
    build, Part, Chips, contour, passEnd, listing, low, holder: HOLDER
  });
})(globalThis);
