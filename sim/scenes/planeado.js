/* Planeado guiado por scroll. seek(p) no re-simula: cada celda guarda cuándo la tocan sus dos pasadas como mucho y qué
   deja cada una, así que hacia atrás cuesta lo mismo. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define) return;
  const PI = Math.PI, sqrt = Math.sqrt, min = Math.min, max = Math.max, now = () => G.performance ? G.performance.now() : Date.now();

  const PLATE = { x0: 0, y0: 0, x1: 240, y1: 84, top: 0, bottom: -30 };
  const AP = 0.4, AE = 8.4, Y0 = 79.8, PASSES = 10, XA = -8, XB = 248, ZR = 1, ZOUT = 5, FPLUNGE = 1000;
  const GRIDS = { A: [480, 168], B: [360, 126], C: [240, 84] };
  const TOOL = { id: 'T1', num: 1, kind: 'flat', D: 12, z: 3, lc: 26, oal: 73, helix: 40, shank: 12, stick: 35, coat: '#34363B',
    holder: { type: 'er32', A: 70, nose: 50, bore: 40, flange: 63, iface: 'SK40' },
    cut: { vc: 452, S: 12000, fz: 0.1333, F: 4800, ae: AE, ap: AP, Fentry: FPLUNGE } };
  const MACHINE = { rapid: 48000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200, start: 'p0' };
  const NC = { dialect: 'iso-mill', O: 1005, title: 'PLANEADO PASADAS PARALELAS - 7075' };
  /* placa y tuerca solo caben a ~3 px/mm casi de frente; con az −60, a 2.3 y con lo planeado igual que el laminado */
  const CAM = { w: { az: -85, el: 25 }, m: { az: -80, el: 28 } };
  /* Laminado más oscuro que el de la paleta: con su reflejo anisótropo quedaba a un 13 % de lo planeado. Marcas a media
     intensidad y la franja recta (r > 0.85R) a un cuarto: entre pasadas el filtrado de la dirección sacaba una costura. */
  const RAW = '#6A7178', MK = 0.5, SEAM = 0.25;
  /* techo: casi media tuerca (z 35–57) a la vista con la fresa en Z5 sobre la pasada trasera */
  const BOX = [XA - 6, PLATE.y0, PLATE.bottom, XB + 6, PLATE.y1, 45];
  /* RGBA de ZMap.at en el orden de bytes de la máquina: se copia por una vista Uint32 */
  const P8 = new Uint8Array(4), P32 = new Uint32Array(P8.buffer);
  const pack = (r, g, b, a) => { P8[0] = r; P8[1] = g; P8[2] = b; P8[3] = a; return P32[0]; };
  const RAW_AT = pack(0, 128, 128, 0);
  const FREV = TOOL.cut.fz * TOOL.z;

  const passY = k => Y0 - AE * k;

  function build(nx, ny) {
    const T = new C.Tool(TOOL), pb = new C.PathBuilder({ ds: 0.5, safeZ: ZOUT }), cutIdx = [];
    pb.rapid(XA, passY(0), ZOUT);
    for (let k = 0; k < PASSES; k++) {
      const y = passY(k);
      if (k) pb.rapid(pb.x, pb.y, ZR);
      pb.rapid(XA, y, ZR);
      pb.feed(XA, y, -AP, 2, FPLUNGE);
      pb.feed(XB, y, -AP, 1, T.cut.F);
      cutIdx.push(pb.n - 1);
    }
    pb.rapid(XB, passY(PASSES - 1), ZOUT);
    const path = pb.build();
    const prog = new C.Program({ ops: [{ tool: T, toolId: 1, path, S: T.cut.S, label: 'planeado' }], machine: MACHINE, sim: 1, nc: NC });
    const zm = new C.ZMap({ ox: PLATE.x0, oy: PLATE.y0, sx: PLATE.x1 - PLATE.x0, sy: PLATE.y1 - PLATE.y0, nx, ny, top: PLATE.top, bottom: PLATE.bottom });
    return { T, path, prog, zm, cutIdx };
  }

  /* x(t) de cada pasada, muestreado del Program cada 8 ms (0.64 mm a F4800) */
  function passTimes(B) {
    const prog = B.prog, out = [];
    for (const kb of B.cutIdx) {
      const t0 = prog.pointTime(0, kb - 1), t1 = prog.pointTime(0, kb), n = max(2, Math.ceil((t1 - t0) / 0.008) + 1);
      const ts = new Float64Array(n), xs = new Float64Array(n);
      for (let i = 0; i < n; i++) { ts[i] = t0 + (t1 - t0) * i / (n - 1); xs[i] = prog.advanceTo(ts[i], { stamp: false }).pos[0]; }
      out.push({ ts, xs, y: prog.state().pos[1] });
    }
    prog.reset();
    return out;
  }

  function rowTimes(xs, ts, x00, cx, n, out) {
    const ne = xs.length - 2;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const x = x00 + i * cx;
      while (m < ne && xs[m + 1] < x) m++;
      const x0 = xs[m], x1 = xs[m + 1], u = x1 > x0 ? min(1, max(0, (x - x0) / (x1 - x0))) : 0;
      out[i] = ts[m] + (ts[m + 1] - ts[m]) * u;
    }
  }

  /* Por celda, la primera pasada que la toca (A) y la siguiente si la vuelve a cortar a su cota o más abajo (B, cuyas
     marcas mandan), con el instante en que el filo delantero llega al centro de la celda. Altura y marca, como
     ZMap.sweep: chaflán de 0.2 y tangente del arco del borde delantero (con avance +X, (−s, √(1−s²)), s = dy/R). */
  function* tableGen(B, PT) {
    const zm = B.zm, T = B.T, nx = zm.nx, ny = zm.ny, N = nx * ny, R = T.R, a1 = R - T.ch, rFl = 0.85 * R;
    const tA = new Float32Array(N).fill(Infinity), tB = new Float32Array(N).fill(Infinity), hA = new Float32Array(N), hB = new Float32Array(N);
    const atA = new Uint32Array(N), atB = new Uint32Array(N), tr = new Float64Array(nx);
    const rowMin = new Float64Array(ny).fill(Infinity), rowMax = new Float64Array(ny).fill(-Infinity);
    for (const p of PT) {
      const j0 = max(0, Math.floor((p.y - R - zm.oy) / zm.cy)), j1 = min(ny - 1, Math.floor((p.y + R - zm.oy) / zm.cy));
      for (let j = j0; j <= j1; j++) {
        const dy = zm.yc(j) - p.y, r = Math.abs(dy);
        if (r > R) continue;
        const zt = -AP + (r <= a1 ? 0 : r - a1), lead = sqrt(R * R - dy * dy);
        let tx = 1, ty = 0, fl = 1 | 4 | 2, w = SEAM;
        if (r < rFl) { const s = dy / R; tx = -s; ty = sqrt(max(0, 1 - s * s)); fl = 1 | 4; w = MK; }
        const g = Math.round((w * (tx * tx - ty * ty) + 1) * 127.5), b = Math.round((w * 2 * tx * ty + 1) * 127.5);
        rowTimes(p.xs, p.ts, zm.ox + 0.5 * zm.cx - lead, zm.cx, nx, tr);
        const pk = pack(1, g, b, fl);
        let lo = rowMin[j], hi = rowMax[j];
        for (let i = 0, q = j * nx; i < nx; i++, q++) {
          const t = tr[i];
          if (tA[q] === Infinity) { tA[q] = t; hA[q] = zt; atA[q] = pk; }
          else if (zt <= hA[q] + 1e-5 && tB[q] === Infinity) { tB[q] = t; hB[q] = zt; atB[q] = pk; }
          else continue;
          if (t < lo) lo = t;
          if (t > hi) hi = t;
        }
        rowMin[j] = lo; rowMax[j] = hi;
      }
      yield;
    }
    return { tA, tB, hA, hB, atA, atB, rowMin, rowMax };
  }
  const cellTable = (B, PT) => { const g = tableGen(B, PT); let r; while (!(r = g.next()).done); return r.value; };

  function Cells(B, PT, tb) {
    const zm = B.zm, nx = zm.nx, ny = zm.ny, h = zm.h, at = new Uint32Array(zm.at.buffer, zm.at.byteOffset, nx * ny), ca = zm.cx * zm.cy;
    tb = tb || cellTable(B, PT);
    const tA = tb.tA, tB = tb.tB, hA = tb.hA, hB = tb.hB, atA = tb.atA, atB = tb.atB, rowMin = tb.rowMin, rowMax = tb.rowMax;
    const c = { tb, cur: -Infinity, ms: 0, msMax: 0, cells: 0 };
    c.reset = () => { zm.reset(); c.cur = -Infinity; };
    c.apply = t => {
      const t0 = now();
      const lo = min(c.cur, t), hi = max(c.cur, t);
      let i0 = nx, i1 = -1, j0 = ny, j1 = -1, vol = 0, n = 0;
      for (let j = 0; j < ny; j++) {
        if (hi < rowMin[j] || lo >= rowMax[j]) continue;
        for (let i = 0, q = j * nx; i < nx; i++, q++) {
          let H = PLATE.top, A = RAW_AT;
          if (tB[q] <= t) { H = hB[q]; A = atB[q]; } else if (tA[q] <= t) { H = hA[q]; A = atA[q]; }
          if (h[q] === H && at[q] === A) continue;
          vol += h[q] - H; h[q] = H; at[q] = A; n++;
          if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
        }
      }
      if (n) {
        zm.x0 = min(zm.x0, i0); zm.x1 = max(zm.x1, i1); zm.y0 = min(zm.y0, j0); zm.y1 = max(zm.y1, j1);
        zm.removed += vol * ca;
      }
      c.cur = t; c.cells = n;
      c.ms = now() - t0;
      if (c.ms > c.msMax) c.msMax = c.ms;
      return n;
    };
    return c;
  }

  C.define('planeado', async function (env) {
    const V = C.V2D, PAL = C.PAL, g = GRIDS[env.tier] || GRIDS.A, gl = env.gl;
    await env.idle();
    const B = build(g[0], g[1]), prog = B.prog, zm = B.zm, T = B.T, path = B.path, TM = prog.duration;
    const PT = passTimes(B);
    await env.idle();
    const tg = tableGen(B, PT);
    let tr;
    while (!(tr = tg.next()).done) await env.idle();
    const cells = Cells(B, PT, tr.value);
    let ter = null, tm = null, ln = null;
    if (gl) {
      await env.idle();
      ter = gl.terrain(zm, { material: 'alu', raw: 'rolled', colors: { raw: RAW } });
      tm = gl.tool(T);
      ln = gl.lines(path);
    }
    const items = [{ h: ter }, { h: ln, upTo: 0 }, { h: tm, pos: null, spin: 1 }], shadow = { h: tm, pos: null };
    const cam = { type: 'ortho', az: CAM.w.az, el: CAM.w.el, fit: { bbox: BOX, safe: { top: 0, right: 0, bottom: env.safe.bottom, left: 0 } } };
    const tri = { x: [0, 0], y: [0, 0], z: [0, 0] }, TV = [tri.x, tri.y, tri.z], q0 = [0, 0], AX = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]];
    const HUD = [{ text: '', color: PAL.hud.value }, { text: '', color: PAL.hud.text }], tot = ' / ' + C.fmt.mmss(TM);
    const HUD1 = [{ parts: [HUD[0], { text: '   ', color: PAL.hud.text }, HUD[1]] }];
    let p = 0, k = 1, hudT = NaN, hudB = -1, hudAt = 0, hudW = -1, one = false;

    /* px CSS por px de marco: el marco móvil se ve a la mitad */
    const sizes = () => { k = Math.min(2.4, Math.max(1, env.dpr / (env.scale || 1))); };
    const mobile = () => env.frame.w < env.frame.h * 2;
    /* 15 Hz como mucho mientras el scroll corre; los pasos cortos (la convergencia) se escriben siempre */
    function texts(force) {
      const st = prog.state(), tm = p * TM, w = now();
      if (!force && st.block === hudB && (Math.round(tm * 10) === Math.round(hudT * 10) || (w - hudAt < 66 && Math.abs(tm - hudT) > 0.1))) return;
      hudT = tm; hudB = st.block; hudAt = w; hudW = -1;
      HUD[0].text = prog.line(st.block);
      HUD[1].text = 't ' + C.fmt.mmss(tm) + tot;
    }
    function hudDraw(c) {
      const fs = 10.5 * k, lh = 14 * k, x = 10 * k, y = 8 * k;
      if (hudW < 0) {
        c.save(); c.font = fs + 'px ui-monospace,Menlo,Consolas,monospace';
        const a = c.measureText(HUD[0].text).width, b = c.measureText(HUD[1].text).width, sp = c.measureText('   ').width;
        c.restore();
        /* en una línea solo si cabe sin llegar al botón de pausa */
        one = mobile() && a + sp + b <= env.frame.w - x - 64 * k;
        hudW = one ? a + sp + b : max(a, b);
      }
      c.fillStyle = 'rgba(4,26,37,.6)';
      c.fillRect(x - 4 * k, y - 3 * k, hudW + 8 * k, (one ? 1 : 2) * lh + 2 * k);
      V.draw.hudText(c, x, y, one ? HUD1 : HUD, { size: fs, lh });
    }
    function triad(c) {
      gl.project(AX[0], q0);
      let m = 0;
      for (let a = 0; a < 3; a++) { const v = TV[a]; gl.project(AX[a + 1], v); v[0] -= q0[0]; v[1] -= q0[1]; m = max(m, Math.hypot(v[0], v[1])); }
      for (let a = 0; a < 3; a++) { TV[a][0] /= m; TV[a][1] /= m; }
      c.save(); c.translate(env.frame.w - 30 * k, env.frame.h - env.safe.bottom - 26 * k); c.scale(k, k);
      V.draw.triad2D(c, 0, 0, tri);
      c.restore();
    }
    const go = pp => { p = pp; const tm = pp * TM; prog.advanceTo(tm, { stamp: false }); cells.apply(tm); texts(); };

    const scene = {
      duration: TM,
      grid: zm.nx + 'x' + zm.ny,
      start() { cells.reset(); prog.reset(); go(p); texts(1); },
      update() { return false; },
      seek(pp) { go(Math.max(0, Math.min(1, +pp || 0))); },
      render() {
        if (!gl) return;
        const st = prog.state(), m = mobile(), v = m ? CAM.m : CAM.w;
        cam.az = v.az; cam.el = v.el; cam.fit.safe.top = m ? 36 * k : 0;
        gl.camera(cam);
        items[1].upTo = st.dist;
        items[2].pos = st.pos; items[2].spin = st.S > 0 ? 1 : 0; shadow.pos = st.pos;
        gl.frame(items, { toolShadow: shadow });
        hudDraw(env.ctx2d);
        triad(env.ctx2d);
      },
      final() { go(1); },
      hud() { return null; },
      resize() { sizes(); texts(1); },
      fallback(e2) { return plan(e2); },
      stats() {
        return { machineS: +TM.toFixed(2), p: +p.toFixed(4), seekMs: +cells.ms.toFixed(3), seekMsMax: +cells.msMax.toFixed(3), seekCells: cells.cells,
          removedMm3: +zm.removed.toFixed(1), collisions: zm.collisions };
      },
      dispose() { if (gl) gl.dispose(); }
    };
    sizes();

    /* Respaldo: planta sobre el mismo Z-map con las marcas de arco como trama ligera. Cada pasada pinta las suyas en su
       franja (±ae/2 del eje), así no se pisan; las pasadas terminadas van a un lienzo que se rehace al cambiar de pasada. */
    function plan(e2) {
      let v = null, mk = null, mc = null, mkN = -1;
      const c = e2.ctx2d, R = T.R;
      const rect = () => { const F = e2.frame, y = mobile() ? 26 * k : 8; return { x: 8 * k, y, w: F.w - 16 * k, h: F.h - y - e2.safe.bottom - 6 * k }; };
      const xAt = (P, tm) => {
        const n = P.ts.length;
        if (tm < P.ts[0]) return NaN;
        if (tm >= P.ts[n - 1]) return XB;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.ts[m] > tm) hi = m; else lo = m; }
        return P.xs[lo] + (P.xs[hi] - P.xs[lo]) * (tm - P.ts[lo]) / (P.ts[hi] - P.ts[lo]);
      };
      function arcs(cx, k0, k1, tm) {
        const lw = 1 / e2.scale, step = FREV * Math.ceil(3 / (FREV * v.s * e2.scale)), r = R * v.s, a = v.X(XA);
        cx.lineWidth = lw; cx.strokeStyle = 'rgba(234,240,246,.16)';
        for (let kp = k0; kp < k1; kp++) {
          const xe = xAt(PT[kp], tm), y = v.Y(PT[kp].y), b = v.X(xe);
          cx.save();
          cx.beginPath(); cx.moveTo(a, y - r); cx.lineTo(b, y - r); cx.arc(b, y, r, -PI / 2, PI / 2); cx.lineTo(a, y + r); cx.clip();
          cx.beginPath(); cx.rect(a, y - AE / 2 * v.s, b + r - a, AE * v.s); cx.clip();
          cx.beginPath();
          for (let x = XA; x <= xe; x += step) { const X = v.X(x); cx.moveTo(X, y - r); cx.arc(X, y, r, -PI / 2, PI / 2); }
          cx.stroke();
          cx.restore();
        }
      }
      function marks(tm) {
        const W = c.canvas.width, H = c.canvas.height;
        let done = 0;
        while (done < PASSES && xAt(PT[done], tm) === XB) done++;
        if (!mk || mk.width !== W || mk.height !== H) { mk = G.document.createElement('canvas'); mk.width = W; mk.height = H; mc = mk.getContext('2d'); mkN = -1; }
        if (done !== mkN) {
          mkN = done;
          mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, W, H);
          mc.setTransform(e2.scale, 0, 0, e2.scale, e2.ox, e2.oy);
          arcs(mc, 0, done, tm);
        }
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(mk, 0, 0); c.restore();
        if (done < PASSES && xAt(PT[done], tm) >= XA) arcs(c, done, done + 1, tm);
      }
      return {
        start() { mkN = -1; },
        update() { return false; },
        seek(pp) { scene.seek(pp); },
        render() {
          const st = prog.state();
          if (!v) v = V.TopView2D(c, zm, { rect: rect(), view: { x0: BOX[0], y0: -2, x1: BOX[3], y1: PLATE.y1 + 2 }, steel: PAL.mat.aluMilled, raw: RAW });
          v.setRect(rect());
          v.render();
          c.save();
          c.beginPath(); c.rect(v.X(0), v.Y(PLATE.y1), PLATE.x1 * v.s, PLATE.y1 * v.s); c.clip();
          marks(p * TM);
          c.restore();
          V.draw.backplot(c, path, st.dist, v.X(0), v.Y(0), v.s);
          V.draw.toolPlan(c, T, v.X(st.pos[0]), v.Y(st.pos[1]), v.s, { holder: true });
          hudDraw(c);
        },
        final() { scene.final(); },
        hud() { return null; },
        resize() { if (v) v.markAll(); mkN = -1; scene.resize(); },
        stats() { return Object.assign(scene.stats(), { topMs: v ? +v.ms.toFixed(3) : 0 }); },
        dispose() { if (v) v.dispose(); mk = mc = null; }
      };
    }
    return scene;
  }, { kind: 'gl', drive: 'scroll', loop: false, frame: { w: 1200, h: 345 }, frameM: { w: 700, h: 394 } });

  C.spec('planeado', {
    tools: [TOOL],
    cuts: [{ D: 12, z: 3, vc: 452, S: 12000, fz: 0.1333, F: 4800, ae: AE }],
    plate: PLATE, machine: MACHINE, ap: AP, ae: AE, y0: Y0, passes: PASSES, xa: XA, xb: XB, grids: GRIDS, cam: CAM,
    build, passTimes, cellTable, Cells
  });
})(globalThis);
