/* Escena trocoidal (§4.3, Evidencia 2): ranura en 1.2344 templado vista en sección por su plano medio, bucles en G3 con
   avance compensado y arco de contacto medido. GL sobre Z-map con tapa de sección; respaldo en planta 2D. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.Strat) return;
  const PI = Math.PI, TAU = 2 * PI, hypot = Math.hypot;

  const SIM = 5, HOLD = 1.5;
  const STOCK = { ox: 0, oy: 0, sx: 60, sy: 32, top: 0, bottom: -24 };
  /* x1: centro del último bucle; con ρ + R = 8 la pared final queda en x = 38 */
  const SLOT = { y: 16, x0: -8, x1: 30, w: 16 }, LOOPS = 48, Z = -15, SAFE = 5, FRET = 3440;
  const GRIDS = { A: [200, 107], B: [150, 80], C: [120, 64] };
  const TOOL = { id: 'T1', num: 1, kind: 'flat', D: 10, z: 6, lc: 25, oal: 75, helix: 40, shank: 10, stick: 34, coat: '#3B3640',
    holder: { type: 'shrink', A: 100, nose: 24, bore: 41, flange: 63, iface: 'HSK-A63' },
    cut: { S: 3820, F: 1375, fz: 0.06, vc: 120, ae: 0.8, ap: 15 } };
  const MACHINE = { rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200, start: 'p0' };
  const NC = { dialect: 'iso-mill', O: 1003, title: 'RANURA TROCOIDAL - 1.2344 50 HRC' };
  /* HUDW: columna izquierda del HUD; la escena se encaja a su derecha para que la herramienta no pase por debajo */
  const AZ = -72, EL = 24, BOX = [-14, 0, -24, 60, 32, 6], HUDW = 72;
  /* Contacto medido a R − EPS (umbral radial): ZMap.engagement mide a R + 0.6·celda y cuenta la lúnula rasante del bucle
     anterior, que infla φ 8–12° (nota de A2). Geometría exacta de lo barrido: material = bruto menos los discos de radio R
     de los puntos anteriores a la cota; bastan los del último bucle (WIN, con margen), los anteriores quedan dentro de su
     envolvente, y del bruto solo se alcanza la cara x = 0. φ en grados; a0 → a1 antihorario (rad). */
  const EPS = 0.02, WIN = 100;
  function contactAt(P, R, k, out, win) {
    const p = P.pts, r = R - EPS, x = p[4 * k], y = p[4 * k + 1];
    win = win || WIN;
    out.deg = out.a0 = out.a1 = 0;
    if (Math.abs(p[4 * k + 2] - Z) > 1e-6 || x + r <= 0) return 0;
    if (!contactAt.K || contactAt.K.length < 2 * win + 4) { contactAt.K = new Float64Array(2 * win + 4); contactAt.E = new Float64Array(2 * win + 4); }
    const K = contactAt.K, E = contactAt.E;
    let m = 0;
    const add = (s, l) => {
      s %= TAU; if (s < 0) s += TAU;
      if (s + l > TAU) { E[m] = s + l - TAU; K[m] = m; m++; l = TAU - s; }
      E[m] = s + l; K[m] = Math.floor(s * 1e6) * 1024 + m; m++;
    };
    if (x < r) { const g = Math.acos(-x / r); add(g, TAU - 2 * g); }
    for (let q = Math.max(0, k - win); q < k; q++) {
      if (Math.abs(p[4 * q + 2] - Z) > 1e-6) continue;
      const dx = p[4 * q] - x, dy = p[4 * q + 1] - y, d = hypot(dx, dy);
      if (d >= R + r) continue;
      if (d <= R - r) return 0;
      const g = Math.acos(Math.min(1, (r * r + d * d - R * R) / (2 * r * d)));
      add(Math.atan2(dy, dx) - g, 2 * g);
    }
    let best = TAU, b0 = 0;
    if (m) {
      const ks = K.subarray(0, m).sort();
      let reach = 0, first = 0;
      best = 0;
      for (let i = 0; i < m; i++) {
        const j = ks[i] % 1024, s = (ks[i] - j) / 1024e6;
        if (!i) first = s;
        else if (s - reach > best) { best = s - reach; b0 = reach; }
        if (E[j] > reach) reach = E[j];
      }
      if (TAU - reach + first > best) { best = TAU - reach + first; b0 = reach; }
    }
    out.a0 = b0; out.a1 = b0 + best;
    return (out.deg = best * 180 / PI);
  }

  /* Medida perezosa (la geometría no cambia entre ciclos). El HUD lee el máximo del último semicírculo de corte. */
  function Meter(P, R) {
    const n = P.n, phi = new Float32Array(n).fill(-1), A0 = new Float32Array(n), A1 = new Float32Array(n), o = { deg: 0, a0: 0, a1: 0 };
    const m = { phi, A0, A1, k: 0, cur: 0, last: 0, max: 0 };
    m.at = k => { if (phi[k] < 0) { phi[k] = contactAt(P, R, k, o); A0[k] = o.a0; A1[k] = o.a1; } return phi[k]; };
    m.reset = () => { m.k = 0; m.cur = m.last = 0; };
    m.to = kTo => {
      for (kTo = Math.min(kTo, n - 1); m.k <= kTo; m.k++) {
        const v = m.at(m.k), b = P.blocks[P.blockOf[m.k]];
        if (b && b.half === 'cut') m.cur = Math.max(m.cur, v); else if (m.cur) { m.last = m.cur; m.cur = 0; }
        if (v > m.max) m.max = v;
      }
    };
    return m;
  }

  function build(nx, ny) {
    const zm = new C.ZMap(Object.assign({ nx, ny }, STOCK)), T = new C.Tool(TOOL);
    const tro = C.Strat.trochoid({ p0: [SLOT.x0, SLOT.y], p1: [SLOT.x1, SLOT.y], slotW: SLOT.w, D: T.D, loops: LOOPS, z: Z, Fedge: T.cut.F, Freturn: FRET });
    const pb = new C.PathBuilder({ ds: 0.25, safeZ: SAFE });
    pb.rapid(SLOT.x0, SLOT.y, SAFE).rapid(SLOT.x0, SLOT.y, Z).append(tro, { link: 'direct', type: 2, F: tro.stats.Fcenter });
    pb.rapid(pb.x, pb.y, SAFE).rapid(SLOT.x0, SLOT.y, SAFE);
    const path = pb.build();
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T, toolId: 1, path, S: T.cut.S, label: 'trocoidal' }], machine: MACHINE, sim: SIM, nc: NC });
    const meter = Meter(path, T.R);
    /* final(): la herramienta en el punto de mayor φ del último bucle, con la pared final ya en x = 38 */
    let kPeak = path.n - 1;
    while (kPeak > 0 && !(path.blocks[path.blockOf[kPeak]] || {}).half) kPeak--;
    for (let k = kPeak, b0 = path.blockOf[kPeak]; k > 0 && path.blockOf[k] === b0; k--) if (meter.at(k) > meter.at(kPeak)) kPeak = k;
    return { zm, T, path, prog, tro: tro.stats, meter, kPeak };
  }

  C.define('trocoidal', async function (env) {
    const V = C.V2D, PAL = C.PAL, g = GRIDS[env.tier] || GRIDS.A, gl = env.gl;
    await env.idle();
    const B = build(g[0], g[1]), prog = B.prog, zm = B.zm, T = B.T, path = B.path, me = B.meter;
    const VD = prog.visualDuration, D = VD + HOLD, tPeak = (prog.pointTime(0, B.kPeak - 1) + prog.pointTime(0, B.kPeak)) / 2;
    let ter = null, tm = null;
    if (gl) {
      await env.idle();
      ter = gl.terrain(zm, { material: 'h13', raw: 'ground', tints: { 1: PAL.tint.rough }, section: { axis: 'y', at: SLOT.y, keep: '+' } });
      tm = gl.tool(T);
    }
    const items = [{ h: ter }, { h: tm, pos: null, spin: 1 }], shadow = { h: tm, pos: null };
    const cam = { type: 'ortho', az: AZ, el: EL, fit: { bbox: BOX, safe: { top: 22, right: 0, bottom: env.safe.bottom, left: HUDW } } };
    const ARC = 24, RA = T.R + 0.5, q = [0, 0], P3 = [0, 0, Z], cx = Math.cos(AZ * PI / 180), cy = Math.sin(AZ * PI / 180);
    let t = 0, held = false, hudT = -1;
    const HUD = [{ text: '', color: PAL.hud.text }, { text: 'paso ' + B.tro.step.toFixed(1), color: PAL.hud.text }, { text: 'ap ' + -Z, color: PAL.hud.text }, { text: '', color: PAL.hud.value }, { text: 'SIM ×' + SIM, color: PAL.hud.sim }];

    const go = tm => { const st = prog.advanceTo(tm); me.to(st.k); return st; };
    const reset = () => { prog.reset(); me.reset(); };
    const arcOf = () => { const st = prog.state(), k = Math.min(st.k, path.n - 1); return st.phase === 'cut' && me.at(k) > 0 ? k : -1; };
    function texts(force) {
      if (!force && Math.abs(t - hudT) < 0.066) return;
      hudT = t;
      const st = prog.state();
      HUD[0].text = 'S' + Math.round(st.S) + ' F' + Math.round(st.feed);
      HUD[3].text = 'φ ' + (me.last > 0 ? Math.round(me.last) + '°' : '–');
    }
    const hudDraw = c => V.draw.hudText(c, 10, 8, HUD, { lh: 13.5 });

    /* arco en el suelo de la ranura, al pie del filo; la parte que tapa el cuerpo de la fresa va discontinua */
    function arc3d(c, st, k) {
      const x = st.pos[0], y = st.pos[1], a = me.A0[k], b = me.A1[k];
      c.save(); c.strokeStyle = PAL.gold; c.lineCap = 'butt';
      for (let pass = 0; pass < 2; pass++) {
        c.lineWidth = pass ? 3 : 2; c.globalAlpha = pass ? 1 : 0.6; c.setLineDash(pass ? [] : [2, 2]);
        c.beginPath();
        let pen = false;
        for (let i = 0; i <= ARC; i++) {
          const u = a + (b - a) * i / ARC, front = Math.cos(u) * cx + Math.sin(u) * cy > 0;
          if (front !== !!pass) { pen = false; continue; }
          P3[0] = x + RA * Math.cos(u); P3[1] = y + RA * Math.sin(u);
          gl.project(P3, q);
          if (pen) c.lineTo(q[0], q[1]); else { c.moveTo(q[0], q[1]); pen = true; }
        }
        c.stroke();
      }
      c.restore();
    }

    const scene = {
      duration: D,
      grid: zm.nx + 'x' + zm.ny,
      start() { reset(); t = 0; held = false; hudT = -1; texts(true); },
      update(tt) {
        if (tt >= VD && held) { t = tt; return false; }
        t = tt;
        go(Math.min(tt, VD) * SIM);
        if (tt >= VD) held = true;
        texts(held);
        return true;
      },
      render() {
        if (!gl) return;
        const st = prog.state(), k = arcOf();
        gl.camera(cam);
        items[1].pos = st.pos; items[1].spin = st.S > 0 ? 1 : 0; shadow.pos = st.pos;
        gl.frame(items, { toolShadow: shadow });
        if (k >= 0) arc3d(env.ctx2d, st, k);
        hudDraw(env.ctx2d);
      },
      final() {
        if (prog.t > tPeak) reset();
        go(tPeak);
        t = tPeak / SIM; held = true; texts(true);
      },
      hud() { return null; },
      resize() { hudT = -1; texts(true); },
      fallback(e2) { return plan(e2); },
      stats() {
        const k = arcOf();
        return { simFactor: SIM, collisions: prog.collisions + zm.collisions, removedMm3: +zm.removed.toFixed(0), machineS: +prog.duration.toFixed(2),
          loops: B.tro.loops, step: +B.tro.step.toFixed(4), Fcenter: B.tro.Fcenter, Freturn: B.tro.Freturn, phiMax: +me.max.toFixed(1),
          phiNow: k >= 0 ? +me.phi[k].toFixed(1) : 0, phiShown: +me.last.toFixed(1) };
      },
      dispose() { if (gl) gl.dispose(); }
    };

    /* Respaldo: planta sobre el mismo Z-map y el mismo Program, con el círculo de la herramienta y el arco */
    function plan(e2) {
      let v = null;
      const c = e2.ctx2d, arc = { a0: 0, a1: 0 };
      const rect = () => { const F = e2.frame; return { x: HUDW, y: 8, w: F.w - HUDW - 10, h: F.h - e2.safe.bottom - 16 }; };
      return {
        update(tt) { return scene.update(tt); },
        render() {
          const st = prog.state(), k = arcOf();
          if (!v) v = V.TopView2D(c, zm, { shadows: false, tints: { 1: PAL.tint.rough }, rect: rect(), view: { x0: BOX[0], y0: 0, x1: 60, y1: 32 }, steel: PAL.mat.h13 });
          v.setRect(rect());
          v.render();
          if (k >= 0) { arc.a0 = me.A0[k]; arc.a1 = me.A1[k]; }
          V.draw.toolPlan(c, T, v.X(st.pos[0]), v.Y(st.pos[1]), v.s, { arc: k >= 0 ? arc : null, holder: true });
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

  C.spec('trocoidal', {
    tools: [TOOL],
    cuts: [{ D: 10, z: 6, vc: 120, S: 3820, fz: 0.06, F: 1375, ae: 0.8 }],
    sim: SIM, hold: HOLD, slot: SLOT, z: Z, stock: STOCK, grids: GRIDS, eps: EPS, build, contactAt, Meter
  });
})(globalThis);
