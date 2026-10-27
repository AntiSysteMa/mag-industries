/* Escena multieje (§4.7): máquina de 5 ejes de cuna (mesa/mesa A/C). El husillo queda vertical; la cuna inclina A y el
   plato gira C mientras la punta, con TCP (G43.4), recorre una espiral de semiacabado sobre una cúpula de aluminio.
   El eje de herramienta es la normal girada 12° hacia el avance, así la bola no corta con el centro. Mallas GL con
   la pieza en el sistema de la mesa; sin GL queda el póster. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define) return;
  const PI = Math.PI, RAD = PI / 180, DEG = 180 / PI, sin = Math.sin, cos = Math.cos, hypot = Math.hypot, abs = Math.abs, max = Math.max, min = Math.min;

  const SIM = 3, HOLD = 1.5;
  /* casquete esférico R40 con base Ø70: centro de la esfera bajo la base, altura 20.6 */
  const R = 40, RB = 35, ZC = -Math.sqrt(R * R - RB * RB), TH_B = Math.asin(RB / R);
  const TH0 = 15 * RAD, TH1 = 45 * RAD, PITCH = 2, LEAD = 12 * RAD, DS = 0.5, APPR = 40, IN = 3, OUT = 25;
  const DTH = PITCH / R, TURNS = (TH1 - TH0) / DTH;
  const TOOL = { id: 'T7', num: 7, kind: 'ball', D: 8, z: 2, lc: 12, oal: 63, helix: 30, shank: 8, stick: 30, coat: '#3B3640', name: 'BOLA D8',
    holder: { type: 'shrink', A: 120, nose: 21, bore: 36, flange: 63, iface: 'HSK-A63' },
    cut: { vc: 400, S: 15900, fz: 0.08, F: 2544, ae: 2, ap: 0.5, Fentry: 1272 } };
  const MACHINE = { rapid: 36000, accel: 4.9, tcTime: 5, spindleRamp: 1.5, zChange: 200, start: 'p0', kin: 'ac', rotary: { A: 20, C: 30 } };
  const NC = { dialect: 'iso-mill', O: 3001, title: 'SEMIACABADO CUPULA 5 EJES' };
  /* eje A a 30 mm por encima de la cara del plato: la cúpula queda cerca del pivote */
  const ZA = -10, ZT = -40;
  /* tramos de la banda acabada: 5 muestras (2.5 mm); la malla se pinta por prefijos en potencias de dos */
  const CH = 5, LIFT = 0.05;

  /* ---------- espiral de contacto (sin DOM): la usan la escena y las pruebas de Node ---------- */
  function spiral() {
    const nf = 4000, cum = new Float64Array(nf + 1);
    const dsdu = u => R * hypot(DTH, 2 * PI * sin(TH0 + DTH * u));
    for (let i = 1, a = dsdu(0); i <= nf; i++) { const b = dsdu(TURNS * i / nf); cum[i] = cum[i - 1] + (a + b) / 2 * TURNS / nf; a = b; }
    const L = cum[nf], ns = Math.round(L / DS) + 1, U = new Float64Array(ns);
    for (let j = 1, i = 0; j < ns; j++) {
      const s = L * j / (ns - 1);
      while (i < nf - 1 && cum[i + 1] < s) i++;
      U[j] = TURNS * (i + (s - cum[i]) / (cum[i + 1] - cum[i])) / nf;
    }
    const TH = new Float64Array(ns), PH = new Float64Array(ns), P = new Float64Array(ns * 3), N = new Float64Array(ns * 3), A = new Float64Array(ns * 3), TIP = new Float64Array(ns * 3);
    const r = TOOL.D / 2, cl = cos(LEAD), sl = sin(LEAD);
    let ph0 = 0;
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < ns; j++) {
      const th = TH0 + DTH * U[j], ph = ph0 + 2 * PI * U[j], st = sin(th), ct = cos(th), sp = sin(ph), cp = cos(ph);
      /* tangente de la espiral: componente polar (paso) y azimutal (antihorario, concordancia con el material abajo) */
      let fx = DTH * ct * cp - 2 * PI * st * sp, fy = DTH * ct * sp + 2 * PI * st * cp, fz = -DTH * st;
      const fl = hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      const nx = st * cp, ny = st * sp, nz = ct, ax = cl * nx + sl * fx, ay = cl * ny + sl * fy, az = cl * nz + sl * fz;
      if (!pass) { ph0 = PI / 2 - Math.atan2(ay, ax); break; }
      TH[j] = th; PH[j] = ph;
      const q = j * 3;
      P[q] = R * nx; P[q + 1] = R * ny; P[q + 2] = ZC + R * nz;
      N[q] = nx; N[q + 1] = ny; N[q + 2] = nz; A[q] = ax; A[q + 1] = ay; A[q + 2] = az;
      TIP[q] = (R + r) * nx - r * ax; TIP[q + 1] = (R + r) * ny - r * ay; TIP[q + 2] = ZC + (R + r) * nz - r * az;
    }
    return { n: ns, len: L, TH, PH, P, N, A, TIP };
  }

  async function build(idle) {
    const S = spiral(), T = new C.Tool(TOOL), A = S.A, TP = S.TIP, e = S.n - 1;
    const pb = new C.PathBuilder({ ds: DS, safeZ: 60 });
    const o = { i: 0, j: 0, k: 1 }, ax = j => { o.i = A[j * 3]; o.j = A[j * 3 + 1]; o.k = A[j * 3 + 2]; return o; };
    const off = (j, d, k) => TP[j * 3 + k] + d * A[j * 3 + k];
    /* posicionado a lo largo del eje de entrada, giro de la mesa sin mover la punta (TCP) y bajada en vertical */
    pb.rapid(off(0, APPR, 0), off(0, APPR, 1), off(0, APPR, 2));
    pb.rapid(off(0, APPR, 0), off(0, APPR, 1), off(0, APPR, 2));
    pb.rapid(off(0, IN, 0), off(0, IN, 1), off(0, IN, 2));
    pb.feed(TP[0], TP[1], TP[2], 2, TOOL.cut.Fentry, ax(0));
    const k0 = pb.n - 1;
    for (let j = 1; j < S.n; j++) pb.feed(TP[j * 3], TP[j * 3 + 1], TP[j * 3 + 2], 1, 0, ax(j));
    pb.feed(off(e, IN, 0), off(e, IN, 1), off(e, IN, 2), 3, TOOL.cut.Fentry, ax(e));
    pb.rapid(off(e, OUT, 0), off(e, OUT, 1), off(e, OUT, 2));
    const path = pb.build();
    /* PathBuilder.rapid() no guarda el eje: el primer G0 va con el husillo vertical (A0 C0) y los dos siguientes ya orientados */
    path.axis[0] = 0; path.axis[1] = 0; path.axis[2] = 1;
    for (const k of [1, 2]) for (let c = 0; c < 3; c++) path.axis[k * 3 + c] = A[c];
    if (idle) await idle();
    const prog = new C.Program({ ops: [{ tool: T, path, S: TOOL.cut.S, label: 'semiacabado 5 ejes', tcp: true }], machine: MACHINE, sim: SIM, nc: NC });
    return { S, T, path, prog, k0, k1: k0 + S.n - 1 };
  }

  /* ---------- geometría de la máquina: prismas convexos y cilindros en mm, agrupados por color ---------- */
  function Geo() { this.p = []; this.n = []; this.i = []; }
  Geo.prototype = {
    v(x, y, z, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); return this.p.length / 3 - 1; },
    quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); },
    /* polígono convexo en XY extruido de z0 a z1 */
    prism(pts, z0, z1) {
      const n = pts.length;
      for (const [z, s] of [[z0, -1], [z1, 1]]) {
        const b = this.p.length / 3;
        for (const q of pts) this.v(q[0], q[1], z, 0, 0, s);
        for (let k = 1; k + 1 < n; k++) this.i.push(b, b + k, b + k + 1);
      }
      let ar = 0;
      for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
      for (let k = 0; k < n; k++) {
        const a = pts[k], b = pts[(k + 1) % n], l = hypot(b[0] - a[0], b[1] - a[1]) || 1, s = ar > 0 ? 1 : -1, nx = s * (b[1] - a[1]) / l, ny = -s * (b[0] - a[0]) / l;
        this.quad(this.v(a[0], a[1], z0, nx, ny, 0), this.v(b[0], b[1], z0, nx, ny, 0), this.v(b[0], b[1], z1, nx, ny, 0), this.v(a[0], a[1], z1, nx, ny, 0));
      }
      return this;
    },
    box(x0, y0, z0, x1, y1, z1) { return this.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1); },
    /* rectángulo radial girado ang alrededor de Z (garras) */
    radial(r0, r1, w, ang, z0, z1) {
      const c = cos(ang), s = sin(ang), h = w / 2, P = [[r0, -h], [r1, -h], [r1, h], [r0, h]].map(q => [q[0] * c - q[1] * s, q[0] * s + q[1] * c]);
      return this.prism(P, z0, z1);
    },
    /* cilindro de eje 'z' (centro x,y; de a a b en z) o 'x' (centro y,z; de a a b en x) */
    cyl(axis, u, w, r, a, b, seg) {
      seg = seg || 40;
      if (a > b) { const t = a; a = b; b = t; }
      const X = axis === 'x', pt = (ang, h, rr) => X ? [h, u + rr * cos(ang), w + rr * sin(ang)] : [u + rr * cos(ang), w + rr * sin(ang), h];
      const nr = ang => X ? [0, cos(ang), sin(ang)] : [cos(ang), sin(ang), 0], na = X ? [1, 0, 0] : [0, 0, 1];
      const b0 = this.p.length / 3;
      for (let k = 0; k <= seg; k++) { const g = 2 * PI * k / seg, n = nr(g); this.v(...pt(g, a, r), ...n); this.v(...pt(g, b, r), ...n); }
      for (let k = 0; k < seg; k++) this.quad(b0 + 2 * k, b0 + 2 * k + 2, b0 + 2 * k + 3, b0 + 2 * k + 1);
      for (const [h, s] of [[a, -1], [b, 1]]) {
        const c0 = this.v(...pt(0, h, 0), na[0] * s, na[1] * s, na[2] * s), b1 = this.p.length / 3;
        for (let k = 0; k <= seg; k++) this.v(...pt(2 * PI * k / seg, h, r), na[0] * s, na[1] * s, na[2] * s);
        for (let k = 0; k < seg; k++) this.i.push(c0, b1 + k, b1 + k + 1);
      }
      return this;
    },
    /* zona esférica de la cúpula entre los polares a y b, radio rr */
    zone(a, b, rr, nt, np) {
      const b0 = this.p.length / 3;
      for (let i = 0; i <= nt; i++) {
        const th = a + (b - a) * i / nt;
        for (let k = 0; k <= np; k++) { const ph = 2 * PI * k / np, nx = sin(th) * cos(ph), ny = sin(th) * sin(ph), nz = cos(th); this.v(rr * nx, rr * ny, ZC + rr * nz, nx, ny, nz); }
      }
      for (let i = 0; i < nt; i++) for (let k = 0; k < np; k++) { const q = b0 + i * (np + 1) + k; this.quad(q, q + 1, q + np + 2, q + np + 1); }
      return this;
    },
    /* sin CULL_FACE cada cara trasera se rasteriza y sombrea igual: con la cámara fija se quitan las caras que nunca
       miran a la cámara para ninguno de los giros de A en vis (en GL por software el coste es de relleno) */
    mesh(gl, mat, vis) {
      const nv = this.p.length / 3;
      if (vis) {
        const I = this.i, N = this.n, keep = [];
        for (let t = 0; t < I.length; t += 3) {
          let x = 0, y = 0, z = 0;
          for (let k = 0; k < 3; k++) { const q = I[t + k] * 3; x += N[q]; y += N[q + 1]; z += N[q + 2]; }
          if (vis === DOWN ? z > -2.7 : vis.some(a => x * EYE[0] + (y * cos(a) - z * sin(a)) * EYE[1] + (y * sin(a) + z * cos(a)) * EYE[2] > -0.6)) keep.push(I[t], I[t + 1], I[t + 2]);
        }
        this.i = keep;
      }
      return gl.mesh({ kind: 'custom', pos: new Float32Array(this.p), nrm: new Float32Array(this.n), idx: nv > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), material: mat });
    }
  };

  /* plato Ø200 con seis ranuras radiales abiertas al borde (contorno simple para la extrusión) */
  function plateShape() {
    const pts = [], n = 6, w = 7, ro = 100, ri = 44, seg = 14;
    for (let s = 0; s < n; s++) {
      const a = 2 * PI * s / n, da = Math.asin(w / ro), b = a + 2 * PI / n - da;
      pts.push([ri * cos(a) - w * sin(a), ri * sin(a) + w * cos(a)]);
      for (let k = 0; k <= seg; k++) { const g = a + da + (b - a - da) * k / seg; pts.push([ro * cos(g), ro * sin(g)]); }
      const a2 = a + 2 * PI / n;
      pts.push([ri * cos(a2) + w * sin(a2), ri * sin(a2) - w * cos(a2)]);
    }
    return pts;
  }

  const DOWN = [], AZ = -58, EL = 26, EYE = [cos(EL * RAD) * cos(AZ * RAD), cos(EL * RAD) * sin(AZ * RAD), sin(EL * RAD)];
  const mix = (a, b, k) => {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), ch = s => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  };

  C.define('multieje', async function (env) {
    const gl = env.gl, V = C.V2D, PAL = C.PAL, fs = C.fmt.fix;
    const scene = { duration: 10, start() {}, update() { return false; }, render() {}, final() {}, hud() { return null; }, resize() {} };
    if (!gl) return scene;
    const now = () => performance.now(), tm = { t0: now() };
    await env.idle();
    const B = await build(env.idle), prog = B.prog, S = B.S, path = B.path, T = B.T;
    tm.build = +(now() - tm.t0).toFixed(1);
    await env.idle();

    const ALU = PAL.mat.aluMilled, mat = (c, m, g) => ({ color: c, metal: m, gloss: g });
    const MAT = {
      base: mat('#26323A', 0.2, 0.3), frame: mat('#3A4752', 0.3, 0.4), cradle: mat('#53616D', 0.35, 0.45), plate: mat('#5C6872', 0.5, 0.5),
      chuck: mat('#4A5560', 0.45, 0.5), jaw: mat('#7F8A94', 0.55, 0.55), spindle: mat('#2B3339', 0.3, 0.45),
      bar: mat(PAL.mat.alu, 0.55, 0.35), raw: mat(mix('#B2B7BC', PAL.tint.rough[0], PAL.tint.rough[1]), 0.35, 0.2),
      cap: mat(mix(ALU, PAL.tint.finish[0], PAL.tint.finish[1]), 0.6, 0.55), fin: mat(mix(ALU, PAL.tint.semi[0], PAL.tint.semi[1]), 0.6, 0.6)
    };
    const g = () => new Geo();
    /* fijo: bancada y soportes de los muñones */
    const FIX = [0], TILT = [0, 12, 24, 36, 48].map(a => a * RAD);
    const mBase = g().box(-300, -190, -300, 300, 170, -240).mesh(gl, MAT.base, FIX);
    const fr = g();
    for (const s of [-1, 1]) { fr.box(s * 168, -72, -240, s * 222, 72, ZA); fr.cyl('x', 0, ZA, 72, s * 167, s * 223, 48); }
    fr.cyl('x', 0, ZA, 46, 222, 262, 32);
    const mFrame = fr.mesh(gl, MAT.frame, FIX);
    await env.idle();
    /* cuna (gira con A): cuerpo bajo el plato, brazos y muñones */
    const cr = g().cyl('z', 0, 0, 90, -84, -62, 64).box(-152, -56, -122, 152, 56, -84);
    for (const s of [-1, 1]) { cr.box(s * 130, -56, -122, s * 152, 56, ZA); cr.cyl('x', 0, ZA, 56, s * 129, s * 153, 40); cr.cyl('x', 0, ZA, 34, s * 153, s * 166, 32); }
    const mCradle = cr.mesh(gl, MAT.cradle, TILT);
    /* mesa (gira con A y C): plato ranurado, garras y pieza */
    const mPlate = gl.mesh({ kind: 'extrude', shape: plateShape(), z0: -52, z1: ZT, material: MAT.plate });
    const mPlateLow = g().cyl('z', 0, 0, 100, -62, -52, 72).cyl('z', 0, 0, 62.5, ZT, -14, 64).mesh(gl, MAT.chuck, DOWN);
    const jw = g();
    for (let k = 0; k < 3; k++) jw.radial(35, 58, 16, PI / 2 + 2 * PI * k / 3, -14, -4).radial(46, 58, 16, PI / 2 + 2 * PI * k / 3, -4, 2);
    const mJaw = jw.mesh(gl, MAT.jaw, DOWN);
    await env.idle();
    const mBar = g().cyl('z', 0, 0, RB, -24, 0, 72).mesh(gl, MAT.bar, DOWN);
    const mCap = g().zone(0, TH0, R, 8, 80).mesh(gl, MAT.cap);
    const mRaw = g().zone(TH0, TH_B, R, 22, 80).mesh(gl, MAT.raw);
    const mSpin = g().cyl('z', 0, 0, 46, T.gauge, T.gauge + 420, 48).cyl('z', 0, 0, 40, T.gauge - 1, T.gauge, 48).mesh(gl, MAT.spindle);
    const tmesh = gl.tool(T);
    const ln = gl.lines(path);
    tm.meshes = +(now() - tm.t0).toFixed(1);

    /* banda acabada: tramos de CH muestras; un prefijo de k tramos son ≤ log2 bloques alineados que se crean al usarse */
    const NCH = Math.ceil((S.n - 1) / CH), cache = new Map();
    function inner(j) { const th = S.TH[j] - 0.62 * DTH; return S.TH[j] < TH0 + DTH ? min(th, TH0) : th; }
    function block(lv, c0) {
      const key = lv * 65536 + c0;
      let m = cache.get(key);
      if (m) return m;
      const j0 = c0 * CH, j1 = min((c0 + (1 << lv)) * CH, S.n - 1), q = g(), rr = R + LIFT;
      for (let j = j0; j <= j1; j++) {
        const ph = S.PH[j], cp = cos(ph), sp = sin(ph);
        for (const th of [inner(j), S.TH[j] + 0.5 * DTH]) { const nx = sin(th) * cp, ny = sin(th) * sp, nz = cos(th); q.v(rr * nx, rr * ny, ZC + rr * nz, nx, ny, nz); }
        if (j > j0) { const b = (j - j0) * 2; q.quad(b - 2, b, b + 1, b - 1); }
      }
      cache.set(key, m = q.mesh(gl, MAT.fin));
      return m;
    }
    await gl.whenReady();
    tm.ready = +(now() - tm.t0).toFixed(1);

    /* matrices: cuna = T(zA)·Rx(A)·T(−zA); mesa = cuna·Rz(C); husillo = traslación a la punta */
    const MA = new Float32Array(16), MAC = new Float32Array(16), MS = new Float32Array(16);
    MA[15] = MAC[15] = MS[0] = MS[5] = MS[10] = MS[15] = 1;
    const tipW = [0, 0, 0], Zup = [0, 0, 1];
    function pose(A, Cc, p) {
      const c = cos(A * RAD), s = sin(A * RAD), cC = cos(Cc * RAD), sC = sin(Cc * RAD);
      MA[0] = 1; MA[1] = MA[2] = 0; MA[4] = 0; MA[5] = c; MA[6] = s; MA[8] = 0; MA[9] = -s; MA[10] = c;
      MA[12] = 0; MA[13] = ZA * s; MA[14] = ZA * (1 - c);
      MAC[0] = cC; MAC[1] = c * sC; MAC[2] = s * sC; MAC[4] = -sC; MAC[5] = c * cC; MAC[6] = s * cC; MAC[8] = 0; MAC[9] = -s; MAC[10] = c;
      MAC[12] = 0; MAC[13] = MA[13]; MAC[14] = MA[14];
      tipW[0] = MAC[0] * p[0] + MAC[4] * p[1] + MAC[8] * p[2] + MAC[12];
      tipW[1] = MAC[1] * p[0] + MAC[5] * p[1] + MAC[9] * p[2] + MAC[13];
      tipW[2] = MAC[2] * p[0] + MAC[6] * p[1] + MAC[10] * p[2] + MAC[14];
      MS[12] = tipW[0]; MS[13] = tipW[1]; MS[14] = tipW[2];
    }

    /* de delante atrás: la prueba de profundidad descarta lo tapado antes de sombrearlo (en GL por software el coste es
       de relleno: la cuna y los soportes son lo que más píxeles cubre) */
    const NB = 12, items = [];
    const iStrip = items.length;
    for (let k = 0; k < NB; k++) items.push({ h: null, M: MAC });
    for (const h of [mCap, mRaw, mBar, mJaw, mPlate, mPlateLow]) items.push({ h, M: MAC });
    items.push({ h: mCradle, M: MA }, { h: mFrame }, { h: mBase });
    const iLn = items.push({ h: ln, M: MAC, from: path.dist[2], upTo: 0, width: 1, alpha: 0.8 }) - 1;
    items.push({ h: mSpin, M: MS });
    const iTool = items.push({ h: tmesh, pos: tipW, axis: Zup, spin: 1 }) - 1;
    const shadow = { h: tmesh, pos: tipW, axis: Zup };
    const cam = { type: 'persp', fov: 28, az: AZ, el: EL, fit: { bbox: [-58, -58, -42, 58, 58, 32], safe: null } };

    /* backplot de la última vuelta: a esta escala la espiral entera (paso 2 mm) es una mancha verde */
    const BACK = new Float32Array(S.n), d0 = path.dist[2];
    for (let j = 0, i = 0; j < S.n; j++) { while (S.TH[i + 1] <= S.TH[j] - DTH) i++; BACK[j] = S.TH[j] - DTH < TH0 ? d0 : path.dist[B.k0 + i]; }
    /* tramos acabados según la distancia recorrida; las muestras de la espiral son los puntos k0…k1 de la trayectoria */
    let jDone = 0;
    function done(st) {
      if (st.phase === 'end' || st.k > B.k1) return S.n - 1;
      if (st.k <= B.k0) return 0;
      const d = path.dist;
      if (jDone > st.k - B.k0) jDone = 0;
      while (jDone + 1 < S.n && d[B.k0 + jDone + 1] <= st.dist + 1e-6) jDone++;
      return jDone;
    }
    function strips(j) {
      const k = j >= S.n - 1 ? NCH : Math.floor(j / CH);
      let c0 = 0, s = 0;
      for (let lv = 10; lv >= 0; lv--) if (k & (1 << lv)) { items[iStrip + s++].h = block(lv, c0); c0 += 1 << lv; }
      while (s < NB) items[iStrip + s++].h = null;
    }

    let t = 0, held = false, hudT = -1, sf = null, fk = '';
    const VAL = PAL.hud.value, TXT = PAL.hud.text, DIM = 'rgba(140,160,178,0.55)';
    const NCL = [{ text: '', color: DIM }, { text: '', color: VAL }, { text: '', color: DIM }];
    const DRO = [{ text: 'A', color: TXT }, { text: '', color: VAL }, { text: '   C', color: TXT }, { text: '', color: VAL }];
    const RT = [{ text: 'F ', color: TXT }, { text: '', color: VAL }, { text: '   SIM ×' + SIM, color: PAL.hud.sim }];
    const DL = [{ parts: DRO }], RL = [{ parts: RT }];
    function texts(force) {
      if (!force && abs(t - hudT) < 0.066) return;
      hudT = t;
      const st = prog.state(), r = st.rot, nb = prog.blocks.length, L = prog.lines(min(nb - 1, st.block + 6)), i = prog.lineIdx(st.block);
      let a = i - 1, b = i + 1;
      while (a >= 0 && !L[a]) a--;
      while (b < L.length && !L[b]) b++;
      NCL[0].text = a >= 0 ? L[a] : ''; NCL[1].text = L[i] || ''; NCL[2].text = b < L.length ? L[b] : '';
      DRO[1].text = ' ' + fs(r.A); DRO[3].text = ' ' + fs(r.C);
      RT[1].text = String(Math.round(st.feed));
    }
    function fit() {
      const F = env.frame, s = env.safe, k = F.w + 'x' + F.h + ':' + s.bottom;
      if (k === fk) return;
      fk = k;
      sf = { top: 40, right: 6, bottom: max(s.bottom, 18) + 22, left: 6 };
      cam.fit.safe = sf;
    }
    const q0 = [0, 0], q1 = [0, 0], P3 = [0, 0, 0], tri = { x: [0, 0], y: [0, 0], z: [0, 0] }, TV = [tri.x, tri.y, tri.z];
    function triad(c, x, y) {
      P3[0] = P3[1] = P3[2] = 0; gl.project(P3, q0);
      let m = 0;
      for (let k = 0; k < 3; k++) {
        P3[0] = k === 0 ? 40 : 0; P3[1] = k === 1 ? 40 : 0; P3[2] = k === 2 ? 40 : 0;
        gl.project(P3, q1);
        TV[k][0] = q1[0] - q0[0]; TV[k][1] = q1[1] - q0[1]; m = max(m, hypot(TV[k][0], TV[k][1]));
      }
      for (let k = 0; k < 3; k++) { TV[k][0] /= m; TV[k][1] /= m; }
      V.draw.triad2D(c, x, y, tri);
    }
    function hudDraw(c) {
      const F = env.frame, lh = 10.5, y = F.h - env.safe.bottom - 19;
      c.save();
      c.fillStyle = 'rgba(4,26,37,0.78)'; c.fillRect(0, 0, F.w - 60, 6 + 3 * lh); c.fillRect(0, y - 4, F.w, F.h - y + 4);
      c.fillStyle = 'rgba(46,230,168,0.10)'; c.fillRect(4, 5 + lh, F.w - 68, lh);
      c.fillStyle = PAL.green; c.fillRect(4, 5 + lh, 2, lh);
      c.restore();
      V.draw.hudText(c, 9, 6, NCL, { size: 8.5, lh });
      V.draw.hudText(c, 9, y, DL, { size: 12.5 });
      V.draw.hudText(c, F.w - 9, y + 2, RL, { size: 10.5, align: 'right' });
    }

    Object.assign(scene, {
      duration: prog.visualDuration + HOLD,
      grid: 'mallas',
      start() { prog.reset(); t = 0; held = false; jDone = 0; hudT = -1; texts(true); },
      update(tt) {
        if (tt >= prog.visualDuration && held) { t = tt; return false; }
        t = tt;
        prog.advanceTo(min(tt, prog.visualDuration) * SIM);
        if (tt >= prog.visualDuration) held = true;
        texts(held);
        return true;
      },
      render() {
        fit();
        const st = prog.state(), c = env.ctx2d;
        pose(st.rot.A, st.rot.C, st.pos);
        const j = done(st);
        strips(j);
        items[iLn].upTo = st.dist; items[iLn].from = BACK[j];
        items[iTool].spin = st.S > 0 ? 1 : 0;
        gl.camera(cam);
        gl.frame(items, { toolShadow: shadow });
        triad(c, env.frame.w - 26, 62);
        hudDraw(c);
      },
      final() { prog.finish(); t = prog.visualDuration; held = true; jDone = 0; texts(true); },
      hud() { return null; },
      resize() { fk = ''; hudT = -1; texts(true); },
      stats() {
        const st = prog.state(), r = st.rot, j = min(S.n - 1, max(0, st.k - B.k0)), q = j * 3, a = st.axis;
        const ang = Math.acos(min(1, S.N[q] * a[0] + S.N[q + 1] * a[1] + S.N[q + 2] * a[2])) * DEG, m = gl.ms;
        return { simFactor: SIM, machineS: +prog.duration.toFixed(2), spiralMm: +S.len.toFixed(1), A: +r.A.toFixed(3), C: +r.C.toFixed(3), feed: Math.round(st.feed),
          leadDeg: +ang.toFixed(2), tipWorld: tipW.map(v => +v.toFixed(3)), meshes: cache.size, initParts: tm,
          glSync: m ? +m.sync.toFixed(3) : null, glDraw: m ? +m.draw.toFixed(3) : null, glCopy: m ? +m.copy.toFixed(3) : null };
      },
      dispose() { gl.dispose(); }
    });
    return scene;
  }, { kind: 'gl', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('multieje', {
    tools: [TOOL],
    cuts: [{ D: 8, z: 2, vc: 400, S: 15900, fz: 0.08, F: 2544, ae: 2 }],
    sim: SIM, hold: HOLD, R, RB, ZC, th0: TH0 * DEG, th1: TH1 * DEG, pitch: PITCH, lead: LEAD * DEG, za: ZA, machine: MACHINE, nc: NC,
    spiral, build
  });
})(globalThis);
