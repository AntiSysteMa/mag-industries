/* Escena hero (§4.1) */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.Shapes || !C.Shapes.pocketD2) return;
  const PK = C.Shapes.pocketD2, M = Math, PI = M.PI, hypot = M.hypot, min = M.min, max = M.max;

  const SIM = 10, PRE = 0.8, CMP = 3, FADE = 0.4, AZ = -38, ORB = 6, BOX = [-75, -50, -40, 75, 50, 28];
  /* pared a +0.02 (dentro de tolerancia): a 0 el Z-map lee gouges de redondeo */
  const ZF = -14, SW = 0.3, WS = 0.02, SAFE = 2, LIFT = 0.3, RAMP = LIFT / M.tan(3 * PI / 180);
  const TINT = { 1: C.PAL.tint.rough, 2: C.PAL.tint.finish }, JAW = { y: 50, t: 12, z0: -48, z1: -22, color: '#2B3339' };
  const near = (a, f, x, y) => { let bi = 0, bd = Infinity; a.forEach((q, i) => { const p = f(q), d = hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bi = i; } }); return bi; };

  function splitRings(P) {
    const p = P.pts, out = [];
    for (let k = 1, a = 0; k < P.n; k++) {
      if (k > a + 2 && p[4 * k] === p[4 * a] && p[4 * k + 1] === p[4 * a + 1]) {
        const r = new Float64Array(2 * (k - a));
        for (let q = a; q < k; q++) { r[2 * (q - a)] = p[4 * q]; r[2 * (q - a) + 1] = p[4 * q + 1]; }
        out.push(r);
        a = k + 1; k = a;
      }
    }
    return out;
  }

  function Cover(reg, T, g, wall) {
    const x0 = -50, y0 = -30, nx = 201, ny = 121, need = new Uint8Array(nx * ny), rF = T.R - T.rc - 0.3, rc = M.ceil(rF / g), r2 = rF * rF;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) need[j * nx + i] = -reg(x0 + i * g, y0 + j * g) > wall;
    const each = (x, y, fn) => {
      const ci = M.round((x - x0) / g), cj = M.round((y - y0) / g);
      for (let j = max(0, cj - rc); j <= min(ny - 1, cj + rc); j++)
        for (let i = max(0, ci - rc), dy = y0 + j * g - y; i <= min(nx - 1, ci + rc); i++) if ((x0 + i * g - x) ** 2 + dy * dy <= r2 && fn(j * nx + i)) return true;
      return false;
    };
    return {
      stamp(xy) { for (let k = 0; k < xy.length; k += 2) each(xy[k], xy[k + 1], q => { need[q] = 0; }); },
      useful: (x, y) => each(x, y, q => need[q]),
      at(x, y) { const i = M.round((x - x0) / g), j = M.round((y - y0) / g); return i >= 0 && j >= 0 && i < nx && j < ny && need[j * nx + i]; },
      left: () => need.reduce((s, v) => s + v, 0) * g * g
    };
  }

  function restPieces(rings, cov) {
    const out = [], EXT = 12;
    for (const r of rings) {
      const n = r.length / 2;
      for (let guard = 0; guard < 8; guard++) {
        const use = new Uint8Array(n);
        let any = 0, s = 0;
        for (let k = 0; k < n; k++) if (cov.useful(r[2 * k], r[2 * k + 1])) { use[k] = 1; any++; }
        if (!any) break;
        if (any < n) while (!(use[s] && !use[(s - 1 + n) % n])) s++;
        let e = s, len = 1;
        while (len < n && use[(e + 1) % n]) { e = (e + 1) % n; len++; }
        const m = min(n, len + 2 * EXT), a = (s - min(EXT, (n - len) >> 1) + n) % n, xy = new Float64Array(2 * m);
        for (let q = 0; q < m; q++) { const k = (a + q) % n; xy[2 * q] = r[2 * k]; xy[2 * q + 1] = r[2 * k + 1]; }
        cov.stamp(xy);
        out.push(xy);
      }
    }
    return out;
  }

  /* T2: entradas en rampa de 3° y rápidos hasta 1 mm sobre el fondo del desbaste */
  async function finishT2(T, idle) {
    const reg = PK.sdf.region, St = C.Strat, R = T.R, FE = T.cut.Fentry, RZ = PK.rough.z + 1;
    const inDom = (ax, ay, bx, by) => {
      const n = M.ceil(hypot(bx - ax, by - ay) / 0.5) || 1;
      for (let k = 0; k <= n; k++) if (-reg(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) < R + SW - 0.02) return false;
      return true;
    };
    const pb = new C.PathBuilder({ ds: 0.5, safeZ: SAFE }), d2 = (xy, k) => hypot(xy[k] - xy[k - 2], xy[k + 1] - xy[k - 1]);
    const side = xy => {
      let v = 0;
      for (let k = 2; k < xy.length - 2; k += 2) {
        const tx = xy[k + 2] - xy[k - 2], ty = xy[k + 3] - xy[k - 1], l = (R - 0.6) / (hypot(tx, ty) || 1);
        v += done.at(xy[k] - ty * l, xy[k + 1] + tx * l) - done.at(xy[k] + ty * l, xy[k + 1] - tx * l);
      }
      return v;
    };
    const air = (x, y, z) => {
      if (pb.n) pb.rapid(pb.x, pb.y, SAFE).rapid(x, y, SAFE); else pb.rapid(x, y, 50);
      pb.rapid(x, y, RZ).feed(x, y, z, 2, FE);
    };
    const run = (xy, closed) => {
      if (!closed && side(xy) > 0) for (let a = 0, b = xy.length - 2; a < b; a += 2, b -= 2) [xy[a], xy[a + 1], xy[b], xy[b + 1]] = [xy[b], xy[b + 1], xy[a], xy[a + 1]];
      done.stamp(xy);
      const n = xy.length, x = xy[0], y = xy[1];
      let s = 0;
      if (pb.n && hypot(x - pb.x, y - pb.y) < 1e-6) s = RAMP;
      else if (pb.n && inDom(pb.x, pb.y, x, y)) pb.feed(pb.x, pb.y, ZF + LIFT, 4).feed(x, y, ZF + LIFT, 4);
      else air(x, y, ZF + LIFT);
      const ramp = s < RAMP;
      for (let k = 2; k < n; k += 2) {
        s += d2(xy, k);
        if (s < RAMP) pb.feed(xy[k], xy[k + 1], ZF + LIFT * (1 - s / RAMP), 2, FE); else pb.feed(xy[k], xy[k + 1], ZF, 1);
      }
      if (!closed) return;
      pb.feed(x, y, ZF, 1);
      for (let k = 2, d = 0; ramp && k < n && d < RAMP + 0.5; k += 2) { d += d2(xy, k); pb.feed(xy[k], xy[k + 1], ZF, 1); }
    };
    const rings = sw => splitRings(St.offsets({ region: reg, tool: T, stockWall: sw, z: ZF, ae: 6, order: 'inside-out', start: PK.helix.c, cell: 0.5 }).build());
    const base = rings(SW);
    await idle();
    const ext = rings(SW + 4.5);
    await idle();
    const cov = Cover(reg, T, 0.5, 2 * R - T.rc - 0.3), done = Cover(reg, T, 0.5, T.rc);
    base.forEach(cov.stamp);
    await idle();
    const rest = restPieces(ext, cov);
    await idle();
    const lev = r => M.round((-reg(r[0], r[1]) - R - SW) / 6);
    for (const r of base) if (lev(r) > 0) run(r, true);
    while (rest.length) run(rest.splice(near(rest, q => q, pb.x, pb.y), 1)[0], false);
    for (const r of base) if (lev(r) <= 0) run(r, true);
    /* paredes: el tetón es un lazo de lado 0; entradas R4 por el lado libre (izquierda) */
    const line = (x, y) => { if (hypot(x - pb.x, y - pb.y) > 1e-6) pb.feed(x, y, ZF, 1); };
    const lead = (x, y, tx, ty, out) => {
      const cx = x - 4 * ty, cy = y + 4 * tx;
      if (out) return pb.arc(cx, cy, cx + 4 * tx, cy + 4 * ty, ZF, false, 3);
      air(cx - 4 * tx, cy - 4 * ty, ZF); pb.arc(cx, cy, x, y, ZF, false, 2, FE);
    };
    const r = R + WS, pk = PK.pocket, hx = pk.w / 2 - pk.r, hy = pk.h / 2 - pk.r;
    const loops = [[-hx, -hy, hx, hy, pk.r - r]].concat(PK.islands.map(i => i.r ? [i.cx, i.cy, i.cx, i.cy, i.r + r, 1] : [i.x0, i.y0, i.x1, i.y1, r, 1]));
    while (loops.length) {
      const [x0, y0, x1, y1, rr, cw] = loops.splice(near(loops, L => [(L[0] + L[2]) / 2, L[1] - L[4]], pb.x, pb.y), 1)[0];
      const sg = cw ? -1 : 1, px = (x0 + x1) / 2, py = y0 - rr;
      let ux = 0, uy = -1;
      lead(px, py, sg, 0);
      for (let i = 0; i < 4; i++) {
        const cx = (i < 2) !== !!cw ? x1 : x0, cy = i % 3 ? y1 : y0;
        line(cx + rr * ux, cy + rr * uy);
        [ux, uy] = [-sg * uy, sg * ux];
        pb.arc(cx, cy, cx + rr * ux, cy + rr * uy, ZF, cw, 1);
      }
      line(px, py);
      if (x1 > x0) { line(px + sg, py); lead(px + sg, py, sg, 0, 1); continue; }
      ux = M.sin(sg / rr); uy = -M.cos(sg / rr);
      pb.arc(x0, y0, x0 + rr * ux, y0 + rr * uy, ZF, cw, 1);
      lead(x0 + rr * ux, y0 + rr * uy, -sg * uy, sg * ux, 1);
    }
    const P = pb.rapid(pb.x, pb.y, 50).build();
    P.restMm2 = cov.left();
    return P;
  }

  /* copia (la de T1 se comparte con hsm) con la bajada de cada enlace al F de corte */
  function relink(P, F) {
    const p = P.pts, Fa = Float32Array.from(P.F), bl = P.blocks.slice();
    for (let k = 1, q = 4; k < P.n; k++, q += 4) {
      if (p[q + 3] === 4 && p[q + 2] < p[q - 2] && p[q] === p[q - 4] && p[q + 1] === p[q - 3]) { Fa[k] = F; const b = P.blockOf[k]; bl[b] = Object.assign({}, bl[b], { f: F }); }
    }
    return Object.assign({}, P, { F: Fa, blocks: bl });
  }

  async function build(nx, ny, idle) {
    idle = idle || (() => Promise.resolve());
    const zm = PK.zmap(nx, ny);
    await idle();
    const model = PK.model(zm);
    await idle();
    const P0 = await PK.roughT1({ idle });
    await idle();
    const P1 = relink(P0, PK.tools.T1.cut.F);
    await idle();
    const T1 = new C.Tool(PK.tools.T1), T2 = new C.Tool(PK.tools.T2), P2 = await finishT2(T2, idle);
    await idle();
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T1, toolId: 1, path: P1, S: T1.cut.S }, { tool: T2, toolId: 2, path: P2, S: T2.cut.S }],
      sim: SIM, nc: { dialect: 'iso-mill', O: 1001, title: 'FRESADO CAVIDAD D2 - 1.2379' } });
    const tc = prog.events.find(e => e.kind === 'tc') || {}, n = P2.n;
    return { zm, model, T: [T1, T2], P: [P1, P2], prog, tcT: tc.t, head: prog.lines(3).slice(0, 3),
      end: [P2.pts[4 * n - 4], P2.pts[4 * n - 3]] };
  }

  C.define('hero', async function (env) {
    const g = PK.grids[env.tier] || PK.grids.A, gl = env.gl, V = C.V2D, fx = C.fmt.fix;
    const B = await build(g[0], g[1], env.idle), prog = B.prog, zm = B.zm, VD = prog.visualDuration, D = PRE + VD + CMP;
    let t = 0, ter, tm, ln, jaws = [], mk, sh, dev = null;
    if (gl) {
      await env.idle();
      ter = gl.terrain(zm, { model: B.model, material: 'steel', raw: 'ground', tints: TINT });
      tm = B.T.map(T => gl.tool(T));
      /* sombra solo del filo: la del porta salía opaca */
      sh = tm.map(m => ({ caps: [m.caps[0], [0], [0]] }));
      mk = gl.vectors(48, { width: 1, styles: [{ c: '#000000', a: 0.08 }, { c: '#FFFFFF', a: 0.05 }] });
      for (let z = -0.8, q = 0; z > -40; z -= 0.9 + q * 7 % 5 * 0.3, q++) {
        mk.push([75, -50, z], [0, 1, 0], 100, q & 1);
        if (z > JAW.z1) mk.push([-75, -50, z], [1, 0, 0], 150, q & 1);
      }
      await env.idle();
      ln = B.P.map(P => gl.lines(P));
      for (const s of [-1, 1]) jaws.push(gl.mesh({ kind: 'box', size: [150, JAW.t, JAW.z1 - JAW.z0], at: [0, s * (JAW.y + JAW.t / 2), (JAW.z0 + JAW.z1) / 2], material: { color: JAW.color, metal: 0.2, gloss: 0.3 } }));
      await env.idle();
    }
    const items = [{ h: ter }, { h: jaws[0] }, { h: jaws[1] }, { upTo: 0, alpha: 1 }, { spin: 1 }, { h: mk }], shadow = {};
    const cam = { type: 'ortho', az: AZ, el: 34, fit: { bbox: BOX, safe: env.safe } };
    const tri = { x: [0, 0], y: [0, 0], z: [0, -M.cos(34 * PI / 180)] }, SE = M.sin(34 * PI / 180);
    const cmpK = () => max(0, min(1, (t - PRE - VD) / FADE));
    const toolIdx = () => +(prog.state().phase === 'end' || prog.t >= B.tcT);
    const triad = c => {
      const a = cam.az * PI / 180, X = tri.x, Y = tri.y;
      X[0] = -M.sin(a); X[1] = SE * M.cos(a); Y[0] = M.cos(a); Y[1] = SE * M.sin(a);
      V.draw.triad2D(c, 30, env.frame.h - env.safe.bottom - 30, tri);
    };

    const scene = {
      duration: D,
      grid: zm.nx + 'x' + zm.ny,
      start() { prog.reset(); t = 0; dev = null; },
      update(tt) { t = tt; prog.advanceTo(max(0, min(tt - PRE, VD)) * SIM); return true; },
      render() {
        if (!gl) return;
        const st = prog.state(), k = toolIdx(), cf = cmpK(), L = items[3], Tm = items[4];
        cam.az = AZ + ORB * M.sin(2 * PI * t / D);
        gl.camera(cam);
        ter.mode = cf > 0 ? 'compare' : 'tool';
        ter.compareFade = cf;
        L.h = ln[min(st.op, 1)]; L.upTo = st.phase === 'end' ? B.P[1].len : st.dist; L.alpha = 1 - cf;
        Tm.h = tm[k]; Tm.pos = st.pos; Tm.spin = +(st.S > 0);
        shadow.h = sh[k]; shadow.pos = st.pos[2] < 10 ? st.pos : null;
        gl.frame(items, { toolShadow: shadow });
        triad(env.ctx2d);
      },
      final() { prog.finish(); t = D; },
      hud() {
        /* antes del N3, la herramienta está sobre el final del ciclo anterior */
        const st = prog.state(), pre = t < PRE, p = pre ? B.end : st.pos;
        return { blk: pre ? B.head[(t >= 0.4) + (t >= 0.6)] : prog.line(st.block) || '', x: fx(p[0]), y: fx(p[1]), z: fx(st.pos[2]), f: '' + M.round(st.feed),
          s: '' + M.round(st.S), t: '' + (toolIdx() + 1), sim: 'SIM ×' + SIM, prog: min(1, prog.t / prog.duration) };
      },
      resize() {},
      fallback: e2 => oblique(e2),
      stats() {
        if (!dev && prog.state().phase === 'end') dev = zm.deviation(B.model);
        return { collisions: prog.collisions, removedMm3: M.round(zm.removed), simFactor: SIM, machineS: +prog.duration.toFixed(2), deviation: dev };
      },
      dispose() { if (gl) gl.dispose(); }
    };

    function oblique(e2) {
      let v = null, cmp = false;
      const c = e2.ctx2d, K = C.PAL.cmp, cls = new Int8Array(zm.nx * zm.ny);
      return {
        start() { cmp = false; },
        update: tt => scene.update(tt),
        render() {
          const F = e2.frame, sf = e2.safe, st = prog.state(), T = B.T[toolIdx()], s = st.pos;
          if (!v) v = V.Oblique2D(c, zm, { el: 50, above: 28, tints: Object.assign({ 5: [K.ok, K.mix], 6: [K.excess, K.mix], 7: [K.gouge, K.mix] }, TINT) });
          v.setRect({ x: 12, y: sf.top + 6, w: F.w - 24, h: F.h - sf.top - sf.bottom - 12 });
          if (!cmp && cmpK() > 0) {
            cmp = true;
            zm.classify(B.model, 0.02, 0.05, cls);
            cls.forEach((k, q) => { if (k !== 2) zm.at[4 * q] = k ? 6.5 - k / 2 : 5; });
            v.markAll();
          }
          v.render();
          const yj = -JAW.y - JAW.t, x0 = v.px(-75), w = v.px(75) - x0, ya = v.py(0, yj, JAW.z1), yt = v.py(0, -JAW.y, JAW.z1);
          c.fillStyle = JAW.color; c.fillRect(x0, ya, w, v.py(0, yj, JAW.z0) - ya);
          c.fillStyle = '#39434A'; c.fillRect(x0, yt, w, ya - yt);
          if (!cmp) V.draw.backplot(c, B.P[min(st.op, 1)], st.phase === 'end' ? B.P[1].len : st.dist, v.px, v.py);
          c.save();
          v.clipFront(c, s[0], s[1], T.holder.nose / 2 + 2);
          V.draw.toolSide(c, T, v.px(s[0]), v.py(s[0], s[1], s[2]), v.s, { sz: v.sz, spin: st.S > 0 });
          c.restore();
        },
        final: () => scene.final(),
        hud: () => scene.hud(),
        resize() { if (v) v.markAll(); },
        stats: () => ({ obliqueMs: v ? +v.ms.toFixed(3) : 0 }),
        dispose() { if (v) v.dispose(); }
      };
    }
    return scene;
  }, { kind: 'gl', drive: 'time', loop: true, introFinal: 1.5, frame: { w: 572, h: 420 }, frameM: { w: 350, h: 360 } });

  const TS = [PK.tools.T1, PK.tools.T2];
  C.spec('hero', { tools: TS, cuts: TS.map(T => Object.assign({ D: T.D, z: T.z }, T.cut)), sim: SIM, pre: PRE, compare: CMP, build });
})(globalThis);
