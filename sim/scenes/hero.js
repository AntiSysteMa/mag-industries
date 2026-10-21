/* Escena hero (§4.1): fresado de una cavidad con islas en 1.2379 recocido. Desbaste dinámico con T1, cambio a T2,
   acabado de fondo y paredes, M30 y comparación con el modelo. GL sobre Z-map; respaldo en vista oblicua 2D. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.Shapes || !C.Shapes.pocketD2) return;
  const PK = C.Shapes.pocketD2, PI = Math.PI, hypot = Math.hypot;

  const SIM = 10, MACHINE = { rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200 };
  /* el M06 inicial dura lo que un cambio: la cabecera se lee con la herramienta aún en el cambiador */
  const PRE = MACHINE.tcTime / SIM, CMP = 3, FADE = 0.4;
  const AZ = -38, EL = 34, ORB = 6;
  const BOX = [-75, -50, -40, 75, 50, 28];
  /* WS: el contorno acaba a +0.02 (dentro de la tolerancia) porque la trayectoria es exacta a ±0.02 */
  const ZF = -14, SW = 0.3, WS = 0.02, SAFE = 2, LIFT = 0.3;
  const NC = { dialect: 'iso-mill', O: 1001, title: 'FRESADO CAVIDAD D2 - 1.2379' };
  const JAW = { y: 50, t: 12, z0: -48, z1: -22, color: '#2B3339' };

  /* Trocea los anillos de Strat.offsets: cada anillo acaba repitiendo su primer punto */
  function splitRings(P) {
    const p = P.pts, out = [];
    let a = 0;
    for (let k = 1; k < P.n; k++) {
      if (k > a + 2 && p[4 * k] === p[4 * a] && p[4 * k + 1] === p[4 * a + 1]) {
        const r = new Float64Array(2 * (k - a));
        for (let q = a; q < k; q++) { r[2 * (q - a)] = p[4 * q]; r[2 * (q - a) + 1] = p[4 * q + 1]; }
        out.push(r);
        a = k + 1; k = a;
      }
    }
    return out;
  }

  /* Rejilla de cobertura del suelo: un punto está acabado si queda bajo la parte plana de la tórica (R − rc) de
     alguna pasada. Las paredes las cubre el contorno final (hasta 2R − rc de la pared). */
  function Cover(reg, T, x0, y0, x1, y1, g, wall) {
    const nx = Math.round((x1 - x0) / g) + 1, ny = Math.round((y1 - y0) / g) + 1, need = new Uint8Array(nx * ny);
    const rFlat = T.R - T.rc - 0.3;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (-reg(x0 + i * g, y0 + j * g) > wall) need[j * nx + i] = 1;
    const rc = Math.ceil(rFlat / g), r2 = rFlat * rFlat;
    const each = (x, y, fn) => {
      const ci = Math.round((x - x0) / g), cj = Math.round((y - y0) / g);
      for (let j = Math.max(0, cj - rc); j <= Math.min(ny - 1, cj + rc); j++) {
        const dy = y0 + j * g - y;
        for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
          const dx = x0 + i * g - x;
          if (dx * dx + dy * dy <= r2 && fn(j * nx + i)) return true;
        }
      }
      return false;
    };
    return {
      stamp(xy) { for (let k = 0; k < xy.length; k += 2) each(xy[k], xy[k + 1], q => { need[q] = 0; }); },
      useful(x, y) { return each(x, y, q => need[q] === 1); },
      at(x, y) { const i = Math.round((x - x0) / g), j = Math.round((y - y0) / g); return i >= 0 && j >= 0 && i < nx && j < ny && need[j * nx + i] === 1; },
      left() { let n = 0; for (let q = 0; q < need.length; q++) n += need[q]; return n * g * g; }
    };
  }

  /* Tramos de un anillo auxiliar que cubren lo que los anillos a ae 6 no alcanzan (el eje de los canales de 20–22 mm).
     Se cortan antes que el anillo pegado a paredes e islas, que así solo encuentra piel sin cortar a su derecha. */
  function restPieces(rings, cov) {
    const out = [], EXT = 6;
    for (const r of rings) {
      const n = r.length / 2;
      for (let guard = 0; guard < 8; guard++) {
        const use = new Uint8Array(n);
        let any = 0;
        for (let k = 0; k < n; k++) if (cov.useful(r[2 * k], r[2 * k + 1])) { use[k] = 1; any++; }
        if (!any) break;
        let s = 0;
        if (any < n) { while (!(use[s] && !use[(s - 1 + n) % n])) s++; }
        let e = s, len = 1;
        while (len < n && use[(e + 1) % n]) { e = (e + 1) % n; len++; }
        const m = Math.min(n, len + 2 * EXT), a = (s - Math.min(EXT, (n - len) >> 1) + n) % n;
        const xy = new Float64Array(2 * m);
        for (let q = 0; q < m; q++) { const k = (a + q) % n; xy[2 * q] = r[2 * k]; xy[2 * q + 1] = r[2 * k + 1]; }
        cov.stamp(xy);
        out.push(xy);
      }
    }
    return out;
  }

  /* T2: fondo por anillos a ae 6 de dentro a fuera, restos del eje de los canales y paredes con entrada y salida en arco.
     Los enlaces cruzan levantados 0.3 si la recta no sale del dominio de centros; si no, por el plano de seguridad. */
  async function finishT2(T, idle) {
    const reg = PK.sdf.region, St = C.Strat, R = T.R, FE = T.cut.Fentry, h = PK.helix;
    const inDom = (ax, ay, bx, by) => {
      const n = Math.max(1, Math.ceil(hypot(bx - ax, by - ay) / 0.5));
      for (let k = 0; k <= n; k++) if (-reg(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) < R + SW - 0.02) return false;
      return true;
    };
    const pb = new C.PathBuilder({ ds: 0.5, safeZ: SAFE });
    /* piel sin cortar a la izquierda menos a la derecha, a R − 0.6 del centro: > 0 pide invertir el tramo (concordancia) */
    const side = xy => {
      let v = 0;
      for (let k = 2; k < xy.length - 2; k += 2) {
        const tx = xy[k + 2] - xy[k - 2], ty = xy[k + 3] - xy[k - 1], l = hypot(tx, ty) || 1, nx = -ty / l * (R - 0.6), ny = tx / l * (R - 0.6);
        v += done.at(xy[k] + nx, xy[k + 1] + ny) - done.at(xy[k] - nx, xy[k + 1] - ny);
      }
      return v;
    };
    const reverse = xy => { for (let a = 0, b = xy.length - 2; a < b; a += 2, b -= 2) { const x = xy[a], y = xy[a + 1]; xy[a] = xy[b]; xy[a + 1] = xy[b + 1]; xy[b] = x; xy[b + 1] = y; } };
    const go = (x, y) => {
      if (!pb.n) { pb.rapid(x, y, 50).rapid(x, y, SAFE).feed(x, y, ZF, 2, FE); return; }
      if (hypot(x - pb.x, y - pb.y) < 1e-6) return;
      if (inDom(pb.x, pb.y, x, y)) pb.feed(pb.x, pb.y, ZF + LIFT, 4).feed(x, y, ZF + LIFT, 4).feed(x, y, ZF, 2, FE);
      else pb.rapid(pb.x, pb.y, SAFE).rapid(x, y, SAFE).feed(x, y, ZF, 2, FE);
    };
    const run = (xy, closed) => {
      if (!closed && side(xy) > 0) reverse(xy);
      done.stamp(xy);
      go(xy[0], xy[1]);
      for (let k = 2; k < xy.length; k += 2) pb.feed(xy[k], xy[k + 1], ZF, 1);
      if (closed) pb.feed(xy[0], xy[1], ZF, 1);
    };
    const base = splitRings(St.offsets({ region: reg, tool: T, stockWall: SW, z: ZF, ae: 6, order: 'inside-out', start: h.c, cell: 0.5 }).build());
    await idle();
    const ext = splitRings(St.offsets({ region: reg, tool: T, stockWall: SW + 4.5, z: ZF, ae: 6, order: 'inside-out', start: h.c, cell: 0.5 }).build());
    await idle();
    const cov = Cover(reg, T, -50, -30, 50, 30, 0.5, 2 * R - T.rc - 0.3), done = Cover(reg, T, -50, -30, 50, 30, 0.5, T.rc);
    for (const r of base) cov.stamp(r);
    const rest = restPieces(ext, cov);
    const lev = r => Math.round((-reg(r[0], r[1]) - R - SW) / 6);
    for (const r of base) if (lev(r) > 0) run(r, true);
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((q, i) => { const d = hypot(q[0] - pb.x, q[1] - pb.y); if (d < bd) { bd = d; bi = i; } });
      run(rest.splice(bi, 1)[0], false);
    }
    for (const r of base) if (lev(r) <= 0) run(r, true);
    await idle();
    const walls = St.contour({ region: reg, tool: T, stock: WS, z: ZF, leadR: 4, F: FE, link: 'retract', safeZ: SAFE, from: [pb.x, pb.y], cell: 0.5 });
    pb.append(walls, { link: 'retract', safeZ: SAFE, F: FE });
    pb.rapid(pb.x, pb.y, 50);
    const P = pb.build();
    P.restMm2 = cov.left();
    return P;
  }

  /* Programa completo (sin DOM): lo usan la escena y las pruebas de Node */
  async function build(nx, ny, idle) {
    idle = idle || (() => Promise.resolve());
    const zm = PK.zmap(nx, ny);
    await idle();
    const model = PK.model(zm);
    await idle();
    const P1 = await PK.roughT1({ idle });
    await idle();
    const T1 = new C.Tool(PK.tools.T1), T2 = new C.Tool(PK.tools.T2);
    const P2 = await finishT2(T2, idle);
    await idle();
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T1, toolId: 1, path: P1, S: T1.cut.S, label: 'desbaste' }, { tool: T2, toolId: 2, path: P2, S: T2.cut.S, label: 'acabado' }],
      machine: MACHINE, sim: SIM, nc: NC });
    const tc = prog.events.find(e => e.kind === 'tc'), p = P1.pts;
    let k1 = 0, k2 = P1.n - 1;
    while (k1 < P1.n && (p[4 * k1 + 3] | 0) !== 1) k1++;
    while (k2 > 0 && (p[4 * k2 + 3] | 0) === 0) k2--;
    return { zm, model, T: [T1, T2], P: [P1, P2], prog, tcT: tc ? tc.t : Infinity, head: prog.lines(3).slice(0, 3), roughS: prog.pointTime(0, k2) - prog.pointTime(0, k1) };
  }

  C.define('hero', async function (env) {
    const g = PK.grids[env.tier] || PK.grids.A, gl = env.gl, V = C.V2D, fx = C.fmt.fix;
    const B = await build(g[0], g[1], env.idle), prog = B.prog, zm = B.zm;
    const VD = prog.visualDuration, D = PRE + VD + CMP;
    let t = 0;

    let ter = null, tm = null, ln = null, jaws = null;
    if (gl) {
      await env.idle();
      ter = gl.terrain(zm, { model: B.model, material: 'steel', raw: 'ground', tints: { 1: C.PAL.tint.rough, 2: C.PAL.tint.finish } });
      tm = [gl.tool(B.T[0]), gl.tool(B.T[1])];
      await env.idle();
      ln = [gl.lines(B.P[0]), gl.lines(B.P[1])];
      const jm = { color: JAW.color, metal: 0.2, gloss: 0.3 }, jh = JAW.z1 - JAW.z0, jy = JAW.y + JAW.t / 2, jz = (JAW.z0 + JAW.z1) / 2;
      jaws = [gl.mesh({ kind: 'box', size: [150, JAW.t, jh], at: [0, -jy, jz], material: jm }), gl.mesh({ kind: 'box', size: [150, JAW.t, jh], at: [0, jy, jz], material: jm })];
      await env.idle();
    }
    const items = [{ h: ter }, { h: jaws && jaws[0] }, { h: jaws && jaws[1] }, { h: null, upTo: 0, alpha: 1 }, { h: null, pos: null, spin: 1 }];
    const shadow = { h: null, pos: null };
    const cam = { type: 'ortho', az: AZ, el: EL, fit: { bbox: BOX, safe: env.safe } };
    const tri = { x: [0, 0], y: [0, 0], z: [0, 0] }, TV = [tri.x, tri.y, tri.z], q0 = [0, 0], q1 = [0, 0], O = [BOX[0], BOX[1], BOX[2]], P3 = [0, 0, 0];

    const tMachine = tt => Math.max(0, Math.min(tt - PRE, VD)) * SIM;
    const cmpK = () => Math.max(0, Math.min(1, (t - PRE - VD) / FADE));
    const toolIdx = () => (prog.state().phase === 'end' || prog.t >= B.tcT ? 1 : 0);
    const triad = (c) => {
      gl.project(O, q0);
      let m = 0;
      for (let k = 0; k < 3; k++) {
        P3[0] = O[0] + (k === 0 ? 10 : 0); P3[1] = O[1] + (k === 1 ? 10 : 0); P3[2] = O[2] + (k === 2 ? 10 : 0);
        gl.project(P3, q1);
        TV[k][0] = q1[0] - q0[0]; TV[k][1] = q1[1] - q0[1];
        m = Math.max(m, hypot(TV[k][0], TV[k][1]));
      }
      for (let k = 0; k < 3; k++) { TV[k][0] /= m; TV[k][1] /= m; }
      V.draw.triad2D(c, 30, env.frame.h - env.safe.bottom - 30, tri);
    };

    let dev = null;
    const scene = {
      duration: D,
      grid: zm.nx + 'x' + zm.ny,
      start() { prog.reset(); t = 0; dev = null; },
      update(tt) { t = tt; prog.advanceTo(tMachine(tt)); return true; },
      render() {
        if (!gl) return;
        const st = prog.state(), k = toolIdx(), cf = cmpK();
        cam.az = AZ + ORB * Math.sin(2 * PI * t / D);
        gl.camera(cam);
        ter.mode = cf > 0 ? 'compare' : 'tool';
        ter.compareFade = cf;
        const L = items[3];
        L.h = ln[Math.min(st.op, 1)]; L.upTo = st.dist; L.alpha = 1 - cf;
        if (st.phase === 'end') L.upTo = B.P[1].len;
        const Tm = items[4];
        Tm.h = tm[k]; Tm.pos = st.pos; Tm.spin = st.S > 0 ? 1 : 0;
        shadow.h = tm[k]; shadow.pos = st.pos;
        gl.frame(items, { toolShadow: shadow });
        triad(env.ctx2d);
      },
      final() { prog.finish(); t = D; },
      hud() {
        const st = prog.state();
        let blk;
        if (t < PRE) blk = B.head[t < 0.12 ? 0 : t < 0.27 ? 1 : 2];
        else blk = prog.line(st.block) || '';
        return { blk, x: fx(st.pos[0]), y: fx(st.pos[1]), z: fx(st.pos[2]), f: String(Math.round(st.feed)), s: String(Math.round(st.S)),
          t: String(B.T[toolIdx()].num), sim: 'SIM ×' + SIM, prog: Math.min(1, prog.t / prog.duration) };
      },
      resize() {},
      fallback(env2d) { return oblique(env2d); },
      stats() {
        if (!dev && prog.state().phase === 'end') dev = zm.deviation(B.model);
        return { collisions: prog.collisions, removedMm3: +zm.removed.toFixed(0), simFactor: SIM, machineS: +prog.duration.toFixed(2),
          roughS: +B.roughS.toFixed(2), points: B.P[0].n + B.P[1].n, restMm2: B.P[1].restMm2, deviation: dev };
      },
      dispose() { if (gl) gl.dispose(); }
    };

    /* Respaldo 2D. La comparación se pinta con ids de herramienta libres (5 en tolerancia, 6 exceso, 7 gouge) escritos en
       el Z-map al llegar al final; start() lo reinicia. */
    function oblique(e2) {
      let v = null, cmp = false;
      const c = e2.ctx2d, K = C.PAL.cmp, cls = new Int8Array(zm.nx * zm.ny);
      const tints = { 1: C.PAL.tint.rough, 2: C.PAL.tint.finish, 5: [K.ok, K.mix], 6: [K.excess, K.mix], 7: [K.gouge, K.mix] };
      return {
        start() { cmp = false; },
        update(tt) { return scene.update(tt); },
        render() {
          const F = e2.frame, sf = e2.safe, st = prog.state(), k = toolIdx(), T = B.T[k];
          if (!v) v = V.Oblique2D(c, zm, { el: 50, above: 28, tints });
          v.setRect({ x: 12, y: sf.top + 6, w: F.w - 24, h: F.h - sf.top - sf.bottom - 12 });
          if (!cmp && cmpK() > 0) {
            cmp = true;
            zm.classify(B.model, 0.02, 0.05, cls);
            for (let q = 0; q < cls.length; q++) if (cls[q] !== 2) zm.at[4 * q] = cls[q] === 0 ? 5 : cls[q] > 0 ? 6 : 7;
            v.markAll();
          }
          v.render();
          const yj = -JAW.y - JAW.t, x0 = v.px(-75), x1 = v.px(75), ya = v.py(0, yj, JAW.z1), yb = v.py(0, yj, JAW.z0), yt = v.py(0, -JAW.y, JAW.z1);
          c.fillStyle = JAW.color; c.fillRect(x0, ya, x1 - x0, yb - ya);
          c.fillStyle = '#39434A'; c.fillRect(x0, yt, x1 - x0, ya - yt);
          if (!cmp) V.draw.backplot(c, B.P[Math.min(st.op, 1)], st.phase === 'end' ? B.P[1].len : st.dist, v.px, v.py);
          c.save();
          v.clipFront(c, st.pos[0], st.pos[1], T.holder.nose / 2 + 2);
          V.draw.toolSide(c, T, v.px(st.pos[0]), v.py(st.pos[0], st.pos[1], st.pos[2]), v.s, { sz: v.sz, spin: st.S > 0 });
          c.restore();
        },
        final() { scene.final(); },
        hud() { return scene.hud(); },
        resize() { if (v) v.markAll(); },
        stats() { return { obliqueMs: v ? +v.ms.toFixed(3) : 0 }; },
        dispose() { if (v) v.dispose(); }
      };
    }
    return scene;
  }, { kind: 'gl', drive: 'time', loop: true, introFinal: 1.5, frame: { w: 572, h: 420 }, frameM: { w: 350, h: 360 } });

  C.spec('hero', {
    tools: [PK.tools.T1, PK.tools.T2],
    cuts: [{ D: 12, z: 5, vc: 180, S: 4775, fz: 0.095, F: 2268, ae: 1.2 }, { D: 10, z: 4, vc: 200, S: 6366, fz: 0.105, F: 2674, ae: 6 }],
    sim: SIM, pre: PRE, compare: CMP, build
  });
})(globalThis);
