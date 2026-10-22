/* Escena penetración (§4.10): electroerosión por penetración de un cajeado con nervio en 1.2343, con un electrodo de
   grafito infradimensionado. Sección vertical de la cuba; la cavidad es un perfil de profundidad por columna. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define) return;
  const PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;

  const PX = 2.2, OIL = 45;
  /* cavidad nominal y electrodo (mm): cajeado 24 × 4 con nervio 3 × 12 debajo; electrodo 0.30 menor por lado */
  const CAV = { w: 24, d: 4, rib: 3, z: -16 };
  const UNDER = 0.30;
  const EL = { body: CAV.w - 2 * UNDER, rib: CAV.rib - 2 * UNDER, ribL: -CAV.d - CAV.z, bodyH: 16, holder: { w: 30, h: 5 }, shank: 12 };
  const ROUGH = { vdi: 34, gap: 0.25, z: -15.700 }, FIN = { vdi: 24, gap: 0.03, orbit: 0.27, z: -15.970 };
  /* lavado por salto: periodo, subida y bajada (s visuales); altura de 2 a 6 mm con la profundidad del nervio */
  const JUMP = { period: 0.8, up: 0.12, down: 0.15, h0: 2, h1: 6 };
  /* reloj de máquina por etapa (s): unas 2 h comprimidas en ≈ 11 s; la cadencia del salto es estilizada */
  const ST = [{ k: 'approach', d: 1.1, m: 8 }, { k: 'rough', d: 5.6, m: 3300 }, { k: 'switch', d: 0.2, m: 30 },
    { k: 'finish', d: 2.6, m: 3780 }, { k: 'retract', d: 0.75, m: 10 }, { k: 'end', d: 1.25, m: 0 }];
  const START = 58, OUT = OIL + 8, ORBIT_HZ = 2, RIB_SHARE = 0.62, STEP = 1 / 120;
  const X0 = -16, DX = 0.01, NX = 3200;
  const COL = { piece: '#848C93', wall: '#565C61', rim: '#1C2226', graphite: '#3A3D40', holder: '#8A939B' };

  let t0 = 0;
  const STAGES = ST.map(s => { const o = Object.assign({ t0 }, s); t0 += s.d; o.t1 = t0; return o; });
  const D = t0, MACH = ST.reduce((a, s) => a + s.m, 0);
  const stage = k => STAGES.find(s => s.k === k);
  const hJump = depth => JUMP.h0 + (JUMP.h1 - JUMP.h0) * min(1, max(0, depth / -CAV.z));
  /* el cuerpo empieza a erosionar cuando su base llega a la superficie más el gap */
  const zBody = -EL.ribL + ROUGH.gap;

  /* estado del electrodo en t: punta (z), avance del servo (zf), órbita (ox), gap, si erosiona y altura de salto */
  function state(t, o) {
    o = o || {};
    let s = STAGES[STAGES.length - 1];
    for (const q of STAGES) if (t < q.t1) { s = q; break; }
    const f = min(1, max(0, (t - s.t0) / s.d));
    o.k = s.k; o.f = f; o.gap = s.k === 'finish' || s.k === 'retract' || s.k === 'end' ? FIN.gap : ROUGH.gap;
    o.ox = 0; o.r = 0; o.jump = 0; o.erode = false; o.h = 0; o.micro = 0;
    o.clock = 0;
    for (const q of STAGES) { if (q === s) { o.clock += q.m * f; break; } o.clock += q.m; }
    if (s.k === 'approach') {
      const a = 0.7 / 1.1;
      o.zf = f < a ? START - (START - 3) * C.util.easeInOut(f / a) : 3 - (3 - ROUGH.gap) * ((f - a) / (1 - a));
      o.z = o.zf;
      return o;
    }
    if (s.k === 'retract') {
      const z0 = FIN.z;
      o.zf = z0 + (OUT - z0) * f * f;
      o.z = o.zf;
      return o;
    }
    if (s.k === 'end') { o.zf = o.z = OUT; return o; }
    if (s.k === 'switch') { o.zf = o.z = ROUGH.z; return o; }
    /* erosión con lavado por salto: el servo solo avanza mientras erosiona */
    const tt = t - s.t0, n = Math.floor(tt / JUMP.period), ph = tt - n * JUMP.period, on = JUMP.period - JUMP.up - JUMP.down;
    /* el servo llega a su cota un poco antes del final de la etapa, que acaba erosionando o al pie de un salto */
    const dE = s.d - 0.06, nE = Math.floor(dE / JUMP.period + 1e-9), eTot = nE * on + min(dE - nE * JUMP.period, on);
    const eNow = n * on + min(ph, on), e = min(1, eNow / (0.98 * eTot));
    if (s.k === 'rough') {
      o.zf = e < RIB_SHARE ? ROUGH.gap + (zBody - ROUGH.gap) * (e / RIB_SHARE)
        : zBody + (ROUGH.z - zBody) * ((e - RIB_SHARE) / (1 - RIB_SHARE));
    } else {
      /* la órbita se expande hasta 0.27 y sigue al menos una vuelta entera ya en la cota final */
      o.zf = ROUGH.z + (FIN.z - ROUGH.z) * min(1, e / 0.6);
      o.r = FIN.orbit * min(1, e / 0.5);
      o.ox = o.r * Math.cos(2 * PI * ORBIT_HZ * t);
    }
    o.h = hJump(-o.zf);
    if (ph < on) {
      o.erode = true;
      /* micro-saltos del servo: pulsos cortos de 0.3 mm */
      const m = (tt * 6) % 1;
      o.micro = m < 0.12 ? 0.3 * Math.sin(PI * m / 0.12) : 0;
    } else if (ph < on + JUMP.up) {
      const u = (ph - on) / JUMP.up;
      o.jump = o.h * (u * u * (3 - 2 * u));
    } else {
      const u = (ph - on - JUMP.up) / JUMP.down;
      o.jump = o.h * (1 - u) * (1 - u);
    }
    o.z = o.zf + o.jump + o.micro;
    return o;
  }

  /* perfil de la cavidad: z del fondo por columna de 0.01 mm (0 = cara de la pieza) */
  function Cavity() {
    const f = new Float32Array(NX), o = { f, removed: 0 };
    o.reset = () => { f.fill(0); o.removed = 0; };
    o.xc = i => X0 + (i + 0.5) * DX;
    /* electrodo dilatado por el gap (disco): rebaja cada columna hasta tocarlo */
    o.erode = (zt, ox, g) => {
      const hr = EL.rib / 2, zb = zt + EL.ribL, hb = zb - g < 0 ? EL.body / 2 : hr;
      const i0 = max(0, Math.floor((ox - hb - g - X0) / DX)), i1 = min(NX - 1, Math.ceil((ox + hb + g - X0) / DX));
      let v = 0;
      for (let i = i0; i <= i1; i++) {
        const x = X0 + (i + 0.5) * DX - ox, ax = abs(x);
        let E = Infinity, d = max(0, ax - hr);
        if (d <= g) E = zt - sqrt(g * g - d * d);
        d = max(0, ax - hb);
        if (d <= g) { const e = zb - sqrt(g * g - d * d); if (e < E) E = e; }
        if (E < f[i] && E < 0) { v += (min(0, f[i]) - E) * DX; f[i] = E; }
      }
      o.removed += v;
      return v;
    };
    /* anchura a la profundidad z (mm): extremos de las columnas por debajo de z */
    o.width = z => {
      let a = -1, b = -1;
      for (let i = 0; i < NX; i++) if (f[i] < z) { if (a < 0) a = i; b = i; }
      return a < 0 ? [0, 0] : [X0 + a * DX, X0 + (b + 1) * DX];
    };
    o.min = () => { let m = 0; for (let i = 0; i < NX; i++) if (f[i] < m) m = f[i]; return m; };
    o.reset();
    return o;
  }
  /* avanza la cavidad por los pasos fijos de la rejilla de tiempo (determinista con cualquier dt). En desbaste no hay
     órbita y el perfil es el mínimo de una erosión monótona en z: basta erosionar una vez en la cota más baja del
     tramo, que es lo que hace barato final() */
  function simulate(cav, ta, tb, S, check) {
    let k = Math.floor(ta / STEP) + 1, low = Infinity;
    for (; k * STEP <= tb + 1e-9; k++) {
      state(k * STEP, S);
      if (S.erode) {
        if (!check && S.k === 'rough') { if (S.zf < low) low = S.zf; }
        else { if (low < Infinity) { cav.erode(low, 0, ROUGH.gap); low = Infinity; } cav.erode(S.zf, S.ox, S.gap); }
      }
      if (check) check(S, cav);
    }
    if (low < Infinity) cav.erode(low, 0, ROUGH.gap);
  }

  C.define('penetracion', async function (env) {
    const V = C.V2D, PAL = C.PAL, fix = C.fmt.fix, q0 = G.performance.now(), rng = env.rng;
    const cav = Cavity(), S = state(0, {}), Q = {};
    const SPK = new Float32Array(5 * 8), BUB = [], DEB = [];
    for (let i = 0; i < 20; i++) BUB.push({ on: false, x: 0, y: 0, r: 1, v: 0, a: 0, w: 0, ph: 0, pop: 0 });
    for (let i = 0; i < 60; i++) DEB.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0 });
    let t = 0, last = -1, simT = 0, L = null, rows = null, hudT = -1, nSp = 0, wasJump = false, bAcc = 0;
    const jobs = { n: 0, sum: 0, max: 0 }, spk = { maxArea: 0, maxN: 0, inJump: 0 };
    const initMs = G.performance.now() - q0;

    const geo = () => {
      const w = env.frame.w, h = env.frame.h, lvl = 12, yP = lvl + OIL * PX;
      return { w, h, lvl, yP, cx: Math.round(w * 0.6), bot: h };
    };
    const X = x => L.cx + x * PX, Y = z => L.yP - z * PX;

    function reset() { cav.reset(); simT = 0; for (const b of BUB) b.on = false; for (const d of DEB) d.on = false; nSp = 0; bAcc = 0; wasJump = false; }

    function sparks(S) {
      nSp = 0;
      if (!S.erode) return;
      const fine = S.k === 'finish', n = 3 + Math.floor(rng() * (fine ? 3 : 6)), g = S.gap, zt = S.zf, zb = zt + EL.ribL;
      const hr = EL.rib / 2, hb = EL.body / 2, body = zb - g < 0;
      /* tramos del frente que erosiona: fondo y flancos del nervio y, si ya entró, fondo y flancos del cuerpo */
      const wRib = 2 * hr + 2 * min(EL.ribL, -zt), wBody = body ? 2 * (hb - hr) + 2 * min(-zb, CAV.d) : 0;
      let area = 0;
      for (let i = 0; i < n; i++) {
        let x, z, u = rng() * (wRib + wBody);
        if (u < 2 * hr) { x = -hr + u; z = zt - g / 2; }
        else if ((u -= 2 * hr) < 2 * min(EL.ribL, -zt)) { const s = u < min(EL.ribL, -zt) ? -1 : 1; x = s * (hr + g / 2); z = zt + (u % min(EL.ribL, -zt)); }
        else {
          u -= 2 * min(EL.ribL, -zt);
          if (u < 2 * (hb - hr)) { const s = u < hb - hr ? -1 : 1; x = s * (hr + (u % (hb - hr))); z = zb - g / 2; }
          else { u -= 2 * (hb - hr); const dd = min(-zb, CAV.d), s = u < dd ? -1 : 1; x = s * (hb + g / 2); z = zb + (u % dd); }
        }
        const sz = fine || rng() < 0.55 ? 1 : 2;
        SPK[5 * i] = x + S.ox; SPK[5 * i + 1] = z; SPK[5 * i + 2] = sz; SPK[5 * i + 3] = 0.35 + 0.35 * rng(); SPK[5 * i + 4] = rng();
        area += sz * sz;
      }
      nSp = n;
      if (area > spk.maxArea) spk.maxArea = area; if (n > spk.maxN) spk.maxN = n;
    }
    /* burbujas que suben ondulando desde la boca de la cavidad y nube de partículas que arrastra cada salto */
    function fluid(S, dt) {
      if (!L || dt <= 0) return;
      /* salen por la boca y suben junto al costado del cuerpo, que tapa el nervio */
      const zb = S.zf + EL.ribL, mouth = zb - S.gap < 0 ? EL.body / 2 + S.gap : EL.rib / 2 + S.gap, side = EL.body / 2, yS = min(L.yP, Y(zb)) - 1;
      const act = S.k === 'rough' || S.k === 'finish';
      if (act && S.erode) {
        bAcc += dt * (S.k === 'rough' ? 9 : 3.5);
        while (bAcc >= 1) {
          bAcc -= 1;
          const b = BUB.find(q => !q.on);
          if (!b) break;
          const s = rng() < 0.5 ? -1 : 1;
          Object.assign(b, { on: true, x: X(s * (side + 0.4 + 1.6 * rng()) + S.ox), y: yS, r: 0.5 + rng() * (S.k === 'rough' ? 1 : 0.5),
            v: 20 + 18 * rng(), a: 0.6 + rng(), w: 2 + 2 * rng(), ph: rng() * 2 * PI, pop: 0, x0: 0 });
          b.x0 = b.x;
        }
      }
      const jumping = act && S.jump > 0.05;
      if (jumping && !wasJump) {
        for (let i = 0; i < 14; i++) {
          const d = DEB.find(q => !q.on);
          if (!d) break;
          const s = rng() < 0.5 ? -1 : 1;
          Object.assign(d, { on: true, x: X(s * rng() * mouth + S.ox), y: L.yP - rng() * 2, vx: s * (8 + 22 * rng()), vy: -(12 + 26 * rng()), life: 1.1 + 0.5 * rng(), age: 0 });
        }
      }
      wasJump = jumping;
      /* al llegar al portaelectrodos, más ancho que el grafito, la burbuja lo rodea por fuera */
      const yH = Y(S.z + EL.ribL + EL.bodyH), hx = EL.holder.w / 2 * PX + 2, ax = X(S.ox), kx = min(1, 14 * dt);
      for (const b of BUB) {
        if (!b.on) continue;
        if (b.pop > 0) { b.pop -= dt; if (b.pop <= 0) b.on = false; continue; }
        b.y -= b.v * dt; b.ph += 2 * PI * b.w * dt;
        if (b.y < yH + 4 && abs(b.x0 - ax) < hx) b.x0 += (ax + (b.x0 < ax ? -hx : hx) - b.x0) * kx;
        b.x = b.x0 + b.a * Math.sin(b.ph);
        if (b.y <= L.lvl + b.r) { b.y = L.lvl; b.pop = 0.1; }
      }
      for (const d of DEB) {
        if (!d.on) continue;
        d.age += dt; if (d.age >= d.life) { d.on = false; continue; }
        d.vy *= Math.exp(-1.6 * dt); d.x += d.vx * dt; d.y += d.vy * dt;
      }
    }

    function step(tt, dt) {
      if (tt < simT - 1e-9) reset();
      simulate(cav, simT, tt, Q);
      simT = tt;
      state(tt, S);
      sparks(S);
      fluid(S, dt);
    }

    /* ---- pintado ---- */
    function piece(c) {
      const x0 = X(-32), x1 = X(32), y0 = L.yP, y1 = L.bot;
      c.fillStyle = COL.piece; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.save();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      c.strokeStyle = 'rgba(25,32,38,.42)'; c.lineWidth = 0.75; c.beginPath();
      for (let d = -(y1 - y0); d < x1 - x0; d += 4) { c.moveTo(x0 + d, y1); c.lineTo(x0 + d + (y1 - y0), y0); }
      c.stroke();
      c.restore();
      c.fillStyle = 'rgba(205,215,225,.3)'; c.fillRect(x0, y0, x1 - x0, 1);
      c.fillStyle = 'rgba(205,215,225,.18)'; c.fillRect(x0, y0, 1, y1 - y0); c.fillRect(x1 - 1, y0, 1, y1 - y0);
    }
    /* contorno de la cavidad: columnas agrupadas a ~1 px, con un grano de ±0.3 px fijo por posición */
    function cavPath(c, rim) {
      const f = cav.f, stepN = Math.max(1, Math.round(0.45 / DX));
      let i0 = -1, i1 = -1;
      for (let i = 0; i < NX; i++) if (f[i] < -1e-4) { if (i0 < 0) i0 = i; i1 = i; }
      if (i0 < 0) return false;
      const jit = i => rim ? ((Math.imul(i + 977, 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 0.6 : 0;
      c.beginPath();
      c.moveTo(X(X0 + i0 * DX), L.yP);
      let prev = f[i0];
      c.lineTo(X(X0 + i0 * DX), Y(prev));
      for (let i = i0 + 1; i <= i1 + 1; i++) {
        const z = i <= i1 ? f[i] : 0, x = X(X0 + i * DX);
        if (abs(z - prev) > 0.3) { c.lineTo(x, Y(prev) + jit(i)); c.lineTo(x, Y(z) + jit(i + 1)); prev = z; }
        else if ((i - i0) % stepN === 0 || abs(z - prev) > 0.02) { c.lineTo(x + jit(i), Y(z) + jit(i + 7)); prev = z; }
      }
      c.lineTo(X(X0 + (i1 + 1) * DX), L.yP);
      return true;
    }
    function cavity(c) {
      if (!cavPath(c, false)) return;
      c.fillStyle = COL.wall; c.fill();
      c.save(); c.clip();
      V.draw.noise(c, { x: X(-16), y: L.yP, w: 32 * PX, h: 17 * PX }, { seed: 11, amount: 0.14 });
      c.restore();
      cavPath(c, true);
      c.strokeStyle = COL.rim; c.lineWidth = 1; c.stroke();
    }
    function electrode(c) {
      const zt = S.z, ox = S.ox, hb = EL.body / 2, hr = EL.rib / 2, zb = zt + EL.ribL, ztop = zb + EL.bodyH;
      if (Y(ztop + EL.holder.h + 40) > L.bot) return;
      const sh = EL.shank / 2;
      V.draw.cylinderShade(c, X(ox - sh), 0, X(ox + sh), Y(ztop + EL.holder.h), '#7E868D', { axis: 'v' });
      const hx = EL.holder.w / 2, g = c.createLinearGradient(0, Y(ztop + EL.holder.h), 0, Y(ztop));
      g.addColorStop(0, '#9AA3AA'); g.addColorStop(1, '#6E767D');
      c.fillStyle = g; c.fillRect(X(ox - hx), Y(ztop + EL.holder.h), EL.holder.w * PX, EL.holder.h * PX);
      c.fillStyle = COL.graphite;
      c.fillRect(X(ox - hb), Y(ztop), EL.body * PX, EL.bodyH * PX);
      c.fillRect(X(ox - hr), Y(zb), EL.rib * PX, EL.ribL * PX);
      c.save();
      c.beginPath(); c.rect(X(ox - hb), Y(ztop), EL.body * PX, EL.bodyH * PX); c.rect(X(ox - hr), Y(zb), EL.rib * PX, EL.ribL * PX); c.clip();
      V.draw.noise(c, { x: X(ox - hb), y: Y(ztop), w: EL.body * PX, h: (EL.bodyH + EL.ribL) * PX }, { seed: 5, amount: 0.1 });
      c.restore();
      c.fillStyle = 'rgba(205,215,225,.10)';
      c.fillRect(X(ox - hb), Y(ztop), 1, EL.bodyH * PX); c.fillRect(X(ox - hr), Y(zb), 1, EL.ribL * PX);
    }
    /* aceite detrás de todo y un velo leve por delante de lo sumergido, para que grafito y acero no viren a marrón */
    function oil(c, front) {
      c.fillStyle = front ? 'rgba(120,80,20,.10)' : 'rgba(120,80,20,.28)'; c.fillRect(0, L.lvl, L.w, L.bot - L.lvl);
      if (front) { c.fillStyle = 'rgba(214,168,92,.38)'; c.fillRect(0, L.lvl, L.w, 1); }
    }
    function particles(c) {
      for (const d of DEB) {
        if (!d.on) continue;
        c.globalAlpha = 0.5 * (1 - d.age / d.life); c.fillStyle = '#17120D'; c.fillRect(d.x, d.y, 1.4, 1.4);
      }
      c.globalAlpha = 1;
      c.lineWidth = 0.6;
      for (const b of BUB) {
        if (!b.on) continue;
        c.strokeStyle = b.pop > 0 ? 'rgba(240,215,160,.45)' : 'rgba(240,220,170,.55)';
        c.beginPath(); c.arc(b.x, b.y, b.pop > 0 ? b.r + 1.2 : b.r, b.pop > 0 ? PI : 0, 2 * PI); c.stroke();
      }
      const cols = ['#FFB46B', '#FFD9A0', '#A9C8FF'];
      for (let i = 0; i < nSp; i++) {
        const sz = SPK[5 * i + 2];
        c.globalAlpha = SPK[5 * i + 3]; c.fillStyle = cols[Math.floor(SPK[5 * i + 4] * 3)];
        c.fillRect(Math.round(X(SPK[5 * i]) - sz / 2), Math.round(Y(SPK[5 * i + 1]) - sz / 2), sz, sz);
      }
      c.globalAlpha = 1;
    }

    const STXT = { approach: 'aproximación', rough: 'desbaste · VDI ' + ROUGH.vdi, switch: 'acabado · VDI ' + FIN.vdi + ' · órbita ' + fix(FIN.orbit, 2),
      finish: 'acabado · VDI ' + FIN.vdi + ' · órbita ' + fix(FIN.orbit, 2), retract: 'retirada', end: 'fin de programa' };
    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const T1 = PAL.hud.text, VV = PAL.hud.value, act = S.k === 'rough' || S.k === 'finish' || S.k === 'switch';
      rows = [[{ text: 'Z', color: T1 }, { text: fix(S.z, 3), color: VV }],
        [{ text: STXT[S.k], color: VV }],
        [{ text: 'salto ', color: T1 }, { text: act ? fix(hJump(-S.zf), 1) + ' mm' : '–', color: VV }],
        [{ text: 'gap ', color: T1 }, { text: S.k === 'approach' || S.k === 'rough' || act ? fix(S.gap, 2) : '–', color: VV }],
        [{ text: 't ', color: T1 }, { text: C.fmt.hms(S.clock), color: VV }]];
    }
    function hud(c) {
      c.save();
      c.font = '9px ui-monospace,Menlo,Consolas,monospace'; c.textBaseline = 'top'; c.lineJoin = 'round';
      c.lineWidth = 2; c.strokeStyle = 'rgba(4,26,37,.75)';
      rows.forEach((row, k) => {
        let x = 8;
        const y = L.lvl + 5 + k * 10.5;
        for (const p of row) { c.strokeText(p.text, x, y); c.fillStyle = p.color; c.fillText(p.text, x, y); x += c.measureText(p.text).width; }
      });
      c.restore();
    }

    const scene = {
      duration: D,
      grid: NX + ' × ' + DX + ' mm',
      start() { t = 0; last = -1; hudT = -1; reset(); step(0, 0); texts(true); },
      update(tt, dt) {
        const k0 = last >= 0 ? S.k : '';
        if (tt < last) reset();
        t = tt; last = tt;
        step(tt, dt || 0);
        texts(false);
        return !(k0 === 'end' && S.k === 'end' && !BUB.some(b => b.on) && !DEB.some(d => d.on));
      },
      render() {
        const c = env.ctx2d, q1 = G.performance.now();
        if (!L) scene.resize();
        oil(c, false);
        piece(c);
        cavity(c);
        electrode(c);
        oil(c, true);
        particles(c);
        hud(c);
        const ms = G.performance.now() - q1;
        jobs.n++; jobs.sum += ms; if (ms > jobs.max) jobs.max = ms;
      },
      final() {
        if (simT > D || last < 0 || last > D) reset();
        simulate(cav, simT, D, Q); simT = D;
        t = D; last = D; state(D, S); nSp = 0;
        for (const b of BUB) b.on = false; for (const d of DEB) d.on = false;
        texts(true);
      },
      hud() { return {}; },
      resize() { L = geo(); hudT = -1; texts(true); },
      stats() {
        const w4 = cav.width(-1), w15 = cav.width(-15.5);
        return { simFactor: null, cycleS: +D.toFixed(3), machineS: MACH, clock: C.fmt.hms(S.clock), initOwnMs: +initMs.toFixed(2),
          stage: S.k, z: +S.z.toFixed(3), gap: S.gap, orbit: +S.r.toFixed(3), jump: +S.jump.toFixed(3),
          cavity: { bottom: +cav.min().toFixed(3), pocket: +(w4[1] - w4[0]).toFixed(3), rib: +(w15[1] - w15[0]).toFixed(3), areaMm2: +cav.removed.toFixed(2) },
          sparks: { now: nSp, maxN: spk.maxN, maxAreaPx: spk.maxArea, maxAreaPct: +(100 * spk.maxArea / ((L ? L.w * L.h : 67584))).toFixed(4) },
          renderMs: { avg: +(jobs.sum / (jobs.n || 1)).toFixed(3), max: +jobs.max.toFixed(3), n: jobs.n } };
      },
      dispose() {}
    };
    return scene;
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('penetracion', {
    tools: [], cuts: [],
    cavity: CAV, under: UNDER, electrode: EL, rough: ROUGH, finish: FIN, jump: JUMP, stages: STAGES, duration: D, machineS: MACH,
    px: PX, oil: OIL, grid: { x0: X0, dx: DX, n: NX }, step: STEP, colors: COL,
    state, Cavity, simulate, hJump
  });
})(globalThis);
