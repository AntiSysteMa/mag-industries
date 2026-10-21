/* Escena hsm (§4.2): planta del desbaste T1 del hero con el arco de contacto medido y φ frente al progreso, comparado
   con un vaciado por offsets. Canvas 2D sobre Z-map. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define || !C.Shapes || !C.Shapes.pocketD2) return;
  const PK = C.Shapes.pocketD2, hypot = Math.hypot, PI = Math.PI;

  const SIM = 14, HOLD = 1.5, BINS = 128, REF_BY = 1;
  const LIGHT = [-0.3, 0.3, 0.9], BP_ALPHA = 0.5;
  const MACHINE = { rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200 };
  const ZC = PK.rough.z, REF_AE = 6;
  /* φ se mide en un Z-map auxiliar de 0.2 mm: en la rejilla de la vista (0.4) los arcos rasantes contra la escalera de
     celdas suman hasta 6° y salen picos falsos de más de 70°. Cubre la cajera con 0.5 de margen. */
  const AUX = { cell: 0.2, rect: [-50.5, -30.5, 50.5, 30.5] };
  const STEP = 0.5;

  /* Recorre una trayectoria por pasos de ≤ STEP sobre el Z-map auxiliar y mide φ a la altura del flanco (punta + rc):
     con la punta, la cresta que deja el radio de esquina al pie del material contaría como contacto. */
  function Meter(T) {
    const r = AUX.rect, zm = PK.zmap(Math.round((r[2] - r[0]) / AUX.cell), Math.round((r[3] - r[1]) / AUX.cell), r);
    const a = [0, 0, 0], b = [0, 0, 0], tip = [0, 0, 0], dir = [1, 0], eng = { deg: 0, a0: 0, a1: 0 }, lift = T.rc || 0;
    const m = { zm, eng, has: false, rem: [0, 0, 0, 0, 0], wrong: 0, contact: false };
    m.reset = () => { zm.reset(); m.has = false; m.rem.fill(0); m.wrong = 0; m.contact = false; eng.deg = 0; };
    /* fn(d, deg) por cada paso de corte a la cota de desbaste */
    m.to = (x, y, z, ty, fn) => {
      if (!m.has) { a[0] = x; a[1] = y; a[2] = z; m.has = true; return; }
      const ax = a[0], ay = a[1], az = a[2], d = hypot(x - ax, y - ay), n = Math.max(1, Math.ceil(d / STEP));
      for (let k = 1; k <= n; k++) {
        b[0] = ax + (x - ax) * k / n; b[1] = ay + (y - ay) * k / n; b[2] = az + (z - az) * k / n;
        const r0 = zm.removed;
        zm.sweep(T, a, b, 1, ty === 0);
        m.rem[ty] += zm.removed - r0;
        const dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy);
        a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
        if (ty < 1 || ty > 3 || Math.abs(b[2] - ZC) > 1e-6 || l < 1e-9) { m.contact = false; continue; }
        dir[0] = dx / l; dir[1] = dy / l;
        tip[0] = b[0]; tip[1] = b[1]; tip[2] = b[2] + lift;
        zm.engagement(T, tip, eng, dir);
        m.contact = eng.deg > 0;
        if (eng.deg >= 20 && ty === 1) {
          const mid = (eng.a0 + eng.a1) / 2;
          if (dir[0] * Math.sin(mid) - dir[1] * Math.cos(mid) > 0.2) m.wrong++;
        }
        if (fn) fn(l, eng.deg);
      }
    };
    return m;
  }

  function cutLength(P) {
    const p = P.pts;
    let L = 0;
    for (let k = 1; k < P.n; k++) {
      const q = 4 * k, ty = p[q + 3];
      if (ty >= 1 && ty <= 3 && Math.abs(p[q + 2] - ZC) < 1e-6) L += hypot(p[q] - p[q - 4], p[q + 1] - p[q - 3]);
    }
    return L;
  }

  /* φ frente al progreso: máximo por casilla y muestras sueltas para los criterios */
  function Series(total, cap) {
    const s = { total, cum: 0, bin: -1, n: 0, cap, hi: new Float32Array(BINS), cnt: new Uint16Array(BINS), phi: new Float32Array(cap), at: new Float32Array(cap) };
    s.reset = () => { s.cum = 0; s.bin = -1; s.n = 0; s.hi.fill(0); s.cnt.fill(0); };
    s.add = (d, deg) => {
      s.cum += d;
      const k = Math.min(BINS - 1, Math.floor(s.cum / total * BINS));
      if (k > s.bin) s.bin = k;
      if (!(deg > 0)) return;
      if (s.n < cap) { s.phi[s.n] = deg; s.at[s.n] = s.cum; s.n++; }
      if (deg > s.hi[k]) s.hi[k] = deg;
      if (s.cnt[k] < 65535) s.cnt[k]++;
    };
    return s;
  }

  /* Referencia: offsets a ae 6 con la misma medida; entra en vertical en su primer punto, como desde un taladro previo.
     Se mide por trozos para no alargar el arranque. */
  function Reference(T) {
    const P = C.Strat.offsets({ region: PK.sdf.region, tool: T, stockWall: PK.rough.stockWall, z: ZC, ae: REF_AE, order: 'inside-out', start: PK.helix.c, cell: 0.5 }).build();
    const p = P.pts, S = Series(cutLength(P), P.n + Math.ceil(P.len / STEP) + 64), now = () => G.performance.now();
    let m = Meter(T), k = 1;
    m.to(p[0], p[1], ZC + 15, 0);
    m.to(p[0], p[1], ZC, 2);
    const R = { path: P, series: S, done: false };
    R.step = ms => {
      const t0 = now();
      while (m && k < P.n) {
        m.to(p[4 * k], p[4 * k + 1], p[4 * k + 2], p[4 * k + 3], S.add);
        k++;
        if ((k & 31) === 0 && now() - t0 > ms) break;
      }
      if (k >= P.n) { R.done = true; m = null; }
      return R.done;
    };
    return R;
  }

  async function build(o) {
    o = o || {};
    const idle = o.idle || (() => Promise.resolve());
    const g = PK.hsm.grid, zm = PK.zmap(g[0], g[1], PK.hsm.rect);
    const t0 = G.performance.now(), path = await PK.roughT1({ idle }), pathMs = G.performance.now() - t0;
    await idle();
    const T = new C.Tool(PK.tools.T1);
    const ref = C.memo('hsm.offsets', () => Reference(T));
    await idle();
    const prog = new C.Program({ zmap: zm, ops: [{ tool: T, toolId: 1, path, S: T.cut.S, label: 'desbaste' }], machine: MACHINE, sim: SIM,
      nc: { dialect: 'iso-mill', O: 1002, title: 'DESBASTE DINAMICO D2 - 1.2379' } });
    const p = path.pts;
    let k1 = 0, k2 = path.n - 1;
    while (k1 < path.n && (p[4 * k1 + 3] | 0) !== 1) k1++;
    while (k2 > 0 && (p[4 * k2 + 3] | 0) === 0) k2--;
    const total = cutLength(path);
    return { zm, T, path, pathMs, prog, ref, total, cap: path.n + Math.ceil(total / STEP) + 4096, roughS: prog.pointTime(0, k2) - prog.pointTime(0, k1) };
  }

  /* Muestras para los criterios de §4.1.4: sin el primer 3 %, solo en contacto */
  function summary(S) {
    const n = S.n, k0 = Math.floor(n * 0.03), a = Array.from(S.phi.subarray(k0, n)).sort((x, y) => x - y);
    const q = f => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : 0;
    let worst = 0, sum = 0, j = k0;
    for (let k = k0; k < n; k++) {
      sum += S.phi[k];
      while (S.at[k] - S.at[j] > 10) { sum -= S.phi[j]; j++; }
      if (S.at[k] - S.at[j] > 9) worst = Math.max(worst, sum / (k - j + 1));
    }
    return { n: a.length, med: q(0.5), p95: q(0.95), max: a.length ? a[a.length - 1] : 0, over70: a.filter(v => v > 70).length, win10: +worst.toFixed(1) };
  }

  C.define('hsm', async function (env) {
    const V = C.V2D, PAL = C.PAL, t0 = G.performance.now(), REDC = PAL.css(PAL.alert, 0.7);
    const B = await build({ idle: env.idle }), prog = B.prog, zm = B.zm, T = B.T, path = B.path, R = B.ref, ref = R.series;
    await env.idle();
    const meter = Meter(T), live = Series(B.total, B.cap), HUD = {};
    const VD = prog.visualDuration, D = VD + HOLD;
    /* final(): la herramienta en su última posición de corte (mitad del último tramo de corte a la cota) */
    const pp = path.pts;
    let kl = path.n - 1;
    while (kl > 1 && !((pp[4 * kl + 3] | 0) === 1 && Math.abs(pp[4 * kl + 2] - ZC) < 1e-6)) kl--;
    const tLast = (prog.pointTime(0, kl - 1) + prog.pointTime(0, kl)) / 2;
    const initOwnMs = G.performance.now() - t0 - B.pathMs, topMs = { n: 0, sum: 0, max: 0, over6: 0 }, fx = v => +v.toFixed(3);
    let t = 0, done = null, held = false, fin = false, top = null, ae = null, hudT = -1, phiTxt = '', l1 = '', l2 = '';
    /* sweep solo escribe el id si el rebaje del paso pasa de 0.01: en la rampa de la hélice el centro del taladro quedaba
       con color de bruto (requests/F-A1-id-rampa.md) */
    const fixIds = (x, y) => {
      const r = T.R, i0 = Math.max(0, zm.ix(x - r)), i1 = Math.min(zm.nx - 1, zm.ix(x + r)), j0 = Math.max(0, zm.iy(y - r)), j1 = Math.min(zm.ny - 1, zm.iy(y + r));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = j * zm.nx + i; if (!zm.at[4 * q] && zm.h[q] < zm.top - 0.01) zm.at[4 * q] = 1; }
    };
    let lz = 0;
    const each = (x, y, z, i, ty) => {
      if (z !== lz && ty !== 0 && z < zm.top) fixIds(x, y);
      lz = z;
      meter.to(x, y, z, ty, live.add);
    };
    const advance = tm => {
      const st = prog.advanceTo(tm, { each });
      if (st.phase === 'end' && !done) done = { phi: summary(live), wrong: meter.wrong, link: meter.rem[4] };
      return st;
    };

    function texts(force) {
      if (!force && Math.abs(t - hudT) < 0.066) return;
      hudT = t;
      const st = prog.state(), b = path.blocks[path.blockOf[st.k]];
      if (b && b.ae != null) ae = b.ae;
      const s = 'S' + Math.round(st.S) + ' F' + Math.round(st.feed), a = 'ae ' + (ae == null ? '–' : ae.toFixed(1));
      if (env.frame.w >= 380) { l1 = 'T1 Ø12 z5 · ' + s + ' · ' + a; l2 = ''; } else { l1 = 'T1 Ø12 z5 · ' + s; l2 = a + ' · '; }
      const on = meter.contact && st.phase !== 'end';
      phiTxt = 'φ ' + (on ? Math.round(meter.eng.deg) + '°' : '–');
    }

    function layout() {
      const F = env.frame, sf = env.safe, s = (F.w - 166) / 112, top0 = 34, bottom = F.h - sf.bottom;
      const plan = { x: 8, y: Math.max(top0, (top0 + bottom - 72 * s) / 2), w: 112 * s, h: 72 * s };
      return { s, plan, chart: { x: F.w - 8 - 128, y: top0, w: 128, h: bottom - 4 - top0 } };
    }

    function chart(c, r, cur) {
      c.save();
      c.font = V.font.cap; c.textBaseline = 'middle'; c.textAlign = 'right'; c.lineWidth = 1;
      for (const v of [0, 90, 180]) {
        const y = Math.round(r.y + r.h - v / 180 * r.h) + 0.5;
        c.strokeStyle = 'rgba(140,160,178,.22)'; c.setLineDash(v ? [2, 3] : []);
        c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); c.stroke();
        c.fillStyle = PAL.hud.text; c.fillText(v + '°', r.x - 3, y);
      }
      const X = k => r.x + (k + 0.5) / BINS * r.w, Y = v => r.y + r.h - Math.min(180, v) / 180 * r.h;
      const line = (S, upTo) => {
        let pen = false;
        c.beginPath();
        for (let k = 0; k <= upTo; k++) {
          if (!S.cnt[k]) { pen = false; continue; }
          const y = Y(S.hi[k]);
          if (pen) c.lineTo(X(k), y); else { c.moveTo(X(k), y); pen = true; }
        }
        c.stroke();
      };
      /* las dos series con el mismo estadístico: el φ máximo de cada casilla */
      if (R.done) { c.strokeStyle = REDC; c.lineWidth = 1; c.setLineDash([3, 2]); line(ref, BINS - 1); c.setLineDash([]); }
      c.strokeStyle = PAL.green; c.lineWidth = 1.25;
      line(cur, Math.min(BINS - 1, cur.bin));
      if (cur.bin >= 0 && cur.bin < BINS - 1) {
        const x = Math.round(r.x + Math.min(1, cur.cum / cur.total) * r.w) + 0.5;
        c.strokeStyle = 'rgba(234,240,246,.3)'; c.beginPath(); c.moveTo(x, r.y); c.lineTo(x, r.y + r.h); c.stroke();
      }
      c.restore();
    }

    function legend(c, x, y) {
      c.save();
      V.draw.hudText(c, x, y - 2, [{ text: phiTxt, color: PAL.hud.value }], { size: 13 });
      c.font = V.font.cap; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineWidth = 1.25;
      const yl = y + 19;
      c.fillStyle = PAL.hud.text;
      for (const [txt, col, dash] of [['HSM', PAL.green, []], ['offset', REDC, [3, 2]]]) {
        c.strokeStyle = col; c.setLineDash(dash); c.beginPath(); c.moveTo(x, yl + 0.5); c.lineTo(x + 10, yl + 0.5); c.stroke();
        c.fillText(txt, x + 13, yl);
        x += 22 + c.measureText(txt).width;
      }
      c.restore();
    }

    if (env.onFonts) env.onFonts(() => {});
    /* la referencia se termina en segundo plano; como tarde, al empezar el desbaste (antes ya no hay serie HSM) */
    if (!R.done) (async () => { while (!R.step(20)) await env.idle(); if (env.wake) env.wake(); })().catch(() => R.step(Infinity));
    const refNow = () => { if (!R.done) R.step(Infinity); };

    const scene = {
      duration: D,
      grid: zm.nx + 'x' + zm.ny,
      start() {
        prog.reset(); meter.reset(); live.reset();
        t = 0; held = false; fin = false; ae = null; hudT = -1;
        advance(0); texts(true);
      },
      update(tt) {
        if (tt >= VD && held) { t = tt; return false; }
        t = tt;
        if (tt > REF_BY) refNow();
        advance(Math.min(tt, VD) * SIM);
        texts(false);
        if (tt >= VD) { held = true; texts(true); }
        return true;
      },
      render() {
        const c = env.ctx2d, L = layout(), st = prog.state(), end = st.phase === 'end';
        if (!top) top = V.TopView2D(c, zm, { shadows: true, shadowHz: 10, tints: { 1: PAL.tint.rough }, rect: L.plan, s: L.s, light: LIGHT });
        top.setRect(L.plan, L.s);
        top.render();
        topMs.n++; topMs.sum += top.ms; if (top.ms > topMs.max) topMs.max = top.ms; if (top.ms > 6) topMs.over6++;
        if (!fin) {
          c.globalAlpha = BP_ALPHA;
          V.draw.backplot(c, path, end ? path.len : st.dist, top.ox, top.oy, top.s);
          c.globalAlpha = 1;
        }
        V.draw.toolPlan(c, T, top.X(st.pos[0]), top.Y(st.pos[1]), top.s, { arc: meter.contact && !end ? meter.eng : null, holder: true });
        const lines = [{ text: l1, color: PAL.hud.text }];
        lines.push(l2 ? { parts: [{ text: l2, color: PAL.hud.text }, { text: 'SIM ×' + SIM, color: PAL.hud.sim }] } : { text: 'SIM ×' + SIM, color: PAL.hud.sim });
        V.draw.hudText(c, 8, 4, lines, { lh: 14 });
        legend(c, L.chart.x, 4);
        chart(c, L.chart, live);
      },
      final() {
        refNow();
        if (prog.t > tLast) { prog.reset(); meter.reset(); live.reset(); }
        advance(tLast);
        t = tLast / SIM; held = true; fin = true; texts(true);
      },
      hud() { return HUD; },
      resize() { if (top) top.markAll(); hudT = -1; texts(true); },
      stats() {
        const r = R.done ? summary(ref) : null;
        return { simFactor: SIM, collisions: prog.collisions + zm.collisions, removedMm3: Math.round(zm.removed), machineS: fx(prog.duration),
          roughS: fx(B.roughS), auxCell: AUX.cell, pathMs: fx(B.pathMs), initOwnMs: fx(initOwnMs),
          topMs: { avg: fx(topMs.sum / (topMs.n || 1)), max: fx(topMs.max), n: topMs.n, over6: topMs.over6 },
          phi: done ? done.phi : summary(live), phiRef: r, cycleDone: !!done, wrongSide: done ? done.wrong : meter.wrong,
          linkMm3: fx(done ? done.link : meter.rem[4]), rapidMm3: fx(meter.rem[0]),
          arc: { on: meter.contact, deg: meter.eng.deg, drawnDeg: fx((meter.eng.a1 - meter.eng.a0) * 180 / PI) } };
      },
      dispose() { if (top) top.dispose(); }
    };
    return scene;
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: 384, h: 192 }, frameM: { w: 350, h: 192 } });

  C.spec('hsm', {
    tools: [PK.tools.T1],
    cuts: [{ D: 12, z: 5, vc: 180, S: 4775, fz: 0.095, F: 2268, ae: 1.2 }],
    sim: SIM, hold: HOLD, aux: AUX, bins: BINS, build, Meter, Series, cutLength, summary
  });
})(globalThis);
