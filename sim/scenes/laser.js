/* Escena láser (§4.11): marcado negro por recocido de una placa de características de inoxidable 304 cepillado, en
   planta. El haz de fibra es infrarrojo: solo se ven el diodo guía en la previsualización y el punto de plasma. */
(function (G) {
  'use strict';
  const C = G.CamSim;
  if (!C || !C.define) return;
  const min = Math.min, max = Math.max, floor = Math.floor, ceil = Math.ceil, round = Math.round, PI = Math.PI;

  const TXT = 'MAG · SN-0427', DM_TXT = 'MAG SN-0427';
  const PLATE = { w: 80, h: 24, r: 1.5, hole: 4.5, hx: 36, hy: 8 };
  const CAP = 4, CAP_EM = 0.7, TRACK = 0.14, FS = CAP / CAP_EM, GAP = 3;
  /* vJ: salto del galvo; seg: retardos de encendido y apagado por tramo marcado */
  const LZ = { v: 1000, f: 400, ns: 200, hatch: 0.01, vC: 300, vJ: 6000, seg: 60e-6 };
  /* fracción de tinta dentro de la caja de cada glifo y perímetro ≈ 3·(ancho + alto): estimaciones para el reloj,
     porque la máscara no se puede leer desde el lienzo */
  const INK = 0.42, PERIM = 3;
  const SIM = 2, T_PRE = 1.2, T_END = 2;
  const DMS = { n: 16, mm: 10, data: 12, ecc: 12 }, MOD = DMS.mm / DMS.n;
  const COL = { mark: '#1C1A1A', halo: '#5A4630', edge: '#141212', guide: '#FF2A2A', plasma: '#B9D0FF', smoke: '#59616A' };
  /* Barlow 600 en em, medida en Chromium: [avance, tinta izq., tinta der., alto sobre la base, bajo la base] */
  const BW = { 'M': [.715, .07, .65, .70, 0], 'A': [.648, .02, .62, .70, 0], 'G': [.613, .05, .56, .71, .01],
    ' ': [.2, 0, 0, 0, 0], '·': [.226, .04, .19, .36, -.21], 'S': [.591, .04, .55, .71, .01], 'N': [.669, .07, .60, .70, 0],
    '-': [.404, .03, .38, .36, -.25], '0': [.568, .05, .52, .71, .02], '4': [.585, .03, .54, .70, 0],
    '2': [.551, .04, .51, .71, 0], '7': [.488, .02, .48, .70, 0] };

  /* ---- Data Matrix ECC200 (Anexo D) ---- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x12D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  const SIZES = { 10: { data: 3, ecc: 5 }, 16: { data: 12, ecc: 12 } };

  function rs(data, n) {
    let g = [1];
    for (let i = 1; i <= n; i++) {
      const q = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { q[j] ^= g[j]; q[j + 1] ^= gmul(g[j], EXP[i]); }
      g = q;
    }
    const r = new Array(n).fill(0);
    for (const d of data) {
      const f = d ^ r[0];
      r.shift(); r.push(0);
      for (let j = 0; j < n; j++) r[j] ^= gmul(g[j + 1], f);
    }
    return r;
  }
  function ascii(s) {
    const o = [];
    for (let i = 0; i < s.length; i++) {
      const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), d = c => c >= 48 && c <= 57;
      if (d(a) && d(b)) { o.push(130 + (a - 48) * 10 + (b - 48)); i++; } else o.push(a + 1);
    }
    return o;
  }
  function pad(cw, n) {
    const o = cw.slice();
    if (o.length < n) o.push(129);
    while (o.length < n) { const p = o.length + 1; let v = 129 + (149 * p) % 253 + 1; if (v > 254) v -= 254; o.push(v); }
    return o;
  }
  /* colocación «utah» de la norma: cada módulo de la región de datos → [palabra (base 0), bit 0 = MSB]; −1 = fijo oscuro */
  function place(nr, nc) {
    const W = new Int16Array(nr * nc).fill(-9), B = new Uint8Array(nr * nc);
    const mod = (r, c, k, bit) => {
      if (r < 0) { r += nr; c += 4 - ((nr + 4) % 8); }
      if (c < 0) { c += nc; r += 4 - ((nc + 4) % 8); }
      W[r * nc + c] = k; B[r * nc + c] = bit;
    };
    const set = (k, cells) => { for (let b = 0; b < 8; b++) mod(cells[2 * b], cells[2 * b + 1], k, b); };
    const utah = (r, c, k) => set(k, [r - 2, c - 2, r - 2, c - 1, r - 1, c - 2, r - 1, c - 1, r - 1, c, r, c - 2, r, c - 1, r, c]);
    const c1 = k => set(k, [nr - 1, 0, nr - 1, 1, nr - 1, 2, 0, nc - 2, 0, nc - 1, 1, nc - 1, 2, nc - 1, 3, nc - 1]);
    const c2 = k => set(k, [nr - 3, 0, nr - 2, 0, nr - 1, 0, 0, nc - 4, 0, nc - 3, 0, nc - 2, 0, nc - 1, 1, nc - 1]);
    const c3 = k => set(k, [nr - 3, 0, nr - 2, 0, nr - 1, 0, 0, nc - 2, 0, nc - 1, 1, nc - 1, 2, nc - 1, 3, nc - 1]);
    const c4 = k => set(k, [nr - 1, 0, nr - 1, nc - 1, 0, nc - 3, 0, nc - 2, 0, nc - 1, 1, nc - 3, 1, nc - 2, 1, nc - 1]);
    const free = (r, c) => W[r * nc + c] === -9;
    let r = 4, c = 0, k = 0;
    do {
      if (r === nr && c === 0) c1(k++);
      if (r === nr - 2 && c === 0 && nc % 4) c2(k++);
      if (r === nr - 2 && c === 0 && nc % 8 === 4) c3(k++);
      if (r === nr + 4 && c === 2 && !(nc % 8)) c4(k++);
      do { if (r < nr && c >= 0 && free(r, c)) utah(r, c, k++); r -= 2; c += 2; } while (r >= 0 && c < nc);
      r += 1; c += 3;
      do { if (r >= 0 && c < nc && free(r, c)) utah(r, c, k++); r += 2; c -= 2; } while (r < nr && c >= 0);
      r += 3; c += 1;
    } while (r < nr || c < nc);
    if (free(nr - 1, nc - 1)) { W[(nr - 1) * nc + nc - 1] = -1; W[(nr - 2) * nc + nc - 2] = -1; }
    for (let i = 0; i < W.length; i++) if (W[i] === -9) W[i] = -2;
    return { W, B, nr, nc };
  }
  /* símbolo N×N (fila 0 arriba, 1 = oscuro) con el patrón de localización: L continua a la izquierda y abajo */
  function symbol(cw, N) {
    const m = N - 2, P = place(m, m), M = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v;
      if (x === 0 || y === N - 1) v = 1;
      else if (y === 0) v = x % 2 === 0 ? 1 : 0;
      else if (x === N - 1) v = y % 2;
      else {
        const i = (y - 1) * m + x - 1, w = P.W[i];
        v = w === -1 ? 1 : w < 0 ? 0 : (cw[w] >> (7 - P.B[i])) & 1;
      }
      M[y * N + x] = v;
    }
    return M;
  }
  function encode(text, N) {
    const s = SIZES[N], cw = ascii(text);
    if (!s || cw.length > s.data) return null;
    const data = pad(cw, s.data);
    return { data, ecc: rs(data, s.ecc), N, matrix: symbol(data.concat(rs(data, s.ecc)), N) };
  }
  /* comprobación propia antes de dibujar: vector de la norma y relectura del símbolo con síndromes nulos */
  function verify(e) {
    const t = encode('123456', 10);
    if (!t || [142, 164, 186, 114, 25, 5, 88, 102].join() !== t.data.concat(t.ecc).join()) return false;
    if (!e) return false;
    const N = e.N, m = N - 2, P = place(m, m), all = e.data.concat(e.ecc), got = new Array(all.length).fill(0);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = (y - 1) * m + x - 1, w = P.W[i];
      if (w >= 0 && e.matrix[y * N + x]) got[w] |= 128 >> P.B[i];
    }
    if (got.join() !== all.join()) return false;
    for (let i = 1; i <= SIZES[N].ecc; i++) {
      let s = 0;
      for (const v of got) s = gmul(s, EXP[i]) ^ v;
      if (s) return false;
    }
    return true;
  }

  /* ---- composición y reloj de máquina (independientes de la carga de la fuente) ---- */
  function plan(dm) {
    const glyphs = [];
    let adv = 0;
    for (const ch of TXT) { glyphs.push({ ch, m: BW[ch] || BW[' '], o: adv }); adv += ((BW[ch] || BW[' '])[0] + TRACK) * FS; }
    const wt = adv - TRACK * FS, qz = 2 * MOD, wg = wt + GAP + DMS.mm + qz, x0 = -wg / 2, yb = -CAP / 2;
    let yT = -1e9, yB = 1e9, ix0 = 1e9, ix1 = -1e9;
    for (const g of glyphs) {
      const m = g.m;
      g.x = x0 + g.o; g.ink = m[2] > m[1];
      g.x0 = g.x + m[1] * FS; g.x1 = g.x + m[2] * FS; g.y0 = yb - m[4] * FS; g.y1 = yb + m[3] * FS;
      if (!g.ink) continue;
      yT = max(yT, g.y1); yB = min(yB, g.y0); ix0 = min(ix0, g.x0); ix1 = max(ix1, g.x1);
    }
    const inked = glyphs.filter(g => g.ink);
    const dmx = x0 + wt + GAP + MOD, dmy = DMS.mm / 2;

    function lines(n, yTop, fill) {
      const L = { n, yTop, y: new Float64Array(n), sx0: new Float64Array(n), sx1: new Float64Array(n), cum: new Float64Array(n + 1) };
      for (let i = 0; i < n; i++) {
        const y = yTop - (i + 0.5) * LZ.hatch, r = fill(y, i);
        L.y[i] = y; L.sx0[i] = r.a; L.sx1[i] = r.b;
        L.cum[i + 1] = L.cum[i] + (r.on > 0 ? r.on / LZ.v + max(0, r.b - r.a - r.on) / LZ.vJ + r.k * LZ.seg : 0);
      }
      L.T = L.cum[n];
      return L;
    }
    const text = lines(ceil((yT - yB) / LZ.hatch - 1e-9), yT, y => {
      let a = 1e9, b = -1e9, on = 0, k = 0;
      for (const g of inked) if (y >= g.y0 && y <= g.y1) { a = min(a, g.x0); b = max(b, g.x1); on += INK * (g.x1 - g.x0); k += 2; }
      return { a, b, on, k };
    });
    let runs = null, dmL = null;
    if (dm) {
      const N = dm.N;
      runs = [];
      for (let y = 0; y < N; y++) {
        const r = [];
        for (let x = 0; x < N; x++) if (dm.matrix[y * N + x]) { const s = x; while (x + 1 < N && dm.matrix[y * N + x + 1]) x++; r.push(s, x + 1); }
        runs.push(r);
      }
      dmL = lines(round(DMS.mm / LZ.hatch), dmy, (y, i) => {
        const r = runs[min(N - 1, floor((i + 0.5) * LZ.hatch / MOD))];
        let on = 0;
        for (let j = 0; j < r.length; j += 2) on += (r[j + 1] - r[j]) * MOD;
        return { a: dmx + r[0] * MOD, b: dmx + r[r.length - 1] * MOD, on, k: r.length / 2 };
      });
    }
    const cont = new Float64Array(inked.length + 1);
    inked.forEach((g, i) => { cont[i + 1] = cont[i] + PERIM * (g.x1 - g.x0 + g.y1 - g.y0) / LZ.vC + 4 * LZ.seg; });
    const M = { pre: SIM * T_PRE, text: text.T, cont: cont[inked.length], dm: dmL ? dmL.T : 0 };
    M.t1 = M.pre; M.t2 = M.t1 + M.text; M.t3 = M.t2 + M.cont; M.t4 = M.t3 + M.dm;
    const area = { x0: min(ix0, dm ? dmx : ix0) - 0.4, x1: (dm ? dmx + DMS.mm : ix1) + 0.4, y0: min(yB, dm ? -dmy : yB) - 0.4, y1: max(yT, dm ? dmy : yT) + 0.4 };
    return { glyphs, inked, wt, wg, x0, yb, yT, yB, ink: { x0: ix0, x1: ix1 }, dm: dm ? { x: dmx, y: dmy, runs, N: dm.N } : null, text, dmL, cont,
      M, D: T_PRE + (M.t4 - M.t1) / SIM + T_END, area, group: { x0, x1: x0 + wg } };
  }
  const tau = (P, t) => SIM * min(t, P.D - T_END);
  function lineAt(L, tm) {
    let a = 0, b = L.n - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (L.cum[m] <= tm) a = m; else b = m - 1; }
    return a;
  }
  /* galvo en relleno bidireccional a 0°: líneas pares hacia +X, impares hacia −X */
  function xAt(L, i, tm) {
    const d = L.cum[i + 1] - L.cum[i], u = d > 0 ? min(1, max(0, (tm - L.cum[i]) / d)) : 0;
    return i % 2 ? L.sx1[i] - u * (L.sx1[i] - L.sx0[i]) : L.sx0[i] + u * (L.sx1[i] - L.sx0[i]);
  }

  const DM = encode(DM_TXT, DMS.n), DM_OK = verify(DM), PLAN = plan(DM_OK ? DM : null);

  C.define('laser', async function (env) {
    const V = C.V2D, PAL = C.PAL, fix = C.fmt.fix, q0 = G.performance.now(), rng = env.rng, P = PLAN, doc = G.document;
    const SMK = [];
    for (let i = 0; i < 48; i++) SMK.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, a: 0, life: 1, age: 0 });
    let t = 0, last = -1, tm = 0, tmPrev = 0, L = null, rows = null, hudT = -1, sAcc = 0, idle = false;
    let pc = null, mk = null, ctn = null, ctp = null, dmc = null, pl = null;
    const jobs = { n: 0, sum: 0, max: 0, build: 0 }, head = { on: false, x: 0, y: 0, maxPx2: 0 };
    const initMs = G.performance.now() - q0;

    function geo() {
      const w = env.frame.w, h = env.frame.h, top = 30, bot = h - (env.safe ? env.safe.bottom : 18) - 4;
      const s = min((w - 24) / PLATE.w, (bot - top) / PLATE.h);
      return { w, h, s, cx: w / 2, cy: (top + bot) / 2, K: s * env.scale };
    }
    const X = x => L.cx + x * L.s, Y = y => L.cy - y * L.s;
    /* lienzo auxiliar alineado al píxel de dispositivo que cubre [x0,x1]×[y0,y1] mm */
    function bake(x0, y0, x1, y1, o) {
      const sc = env.scale, dl = round(env.ox + X(x0) * sc), dt = round(env.oy + Y(y1) * sc);
      const W = ceil((x1 - x0) * L.K), H = ceil((y1 - y0) * L.K);
      const cv = (o && o.cv) || doc.createElement('canvas');
      cv.width = W; cv.height = H;
      const fx = (dl - env.ox) / sc, fy = (dt - env.oy) / sc, mx0 = (fx - L.cx) / L.s, my1 = (L.cy - fy) / L.s;
      return { cv, c: cv.getContext('2d'), fx, fy, fw: W / sc, fh: H / sc, W, H, u: x => (x - mx0) * L.K, v: y => (my1 - y) * L.K };
    }
    function rrect(c, x, y, w, h, r) {
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    function plate() {
      const b = bake(-PLATE.w / 2 - 1, -PLATE.h / 2 - 1.5, PLATE.w / 2 + 1.5, PLATE.h / 2 + 1, pc), c = b.c, K = L.K;
      const x = b.u(-PLATE.w / 2), y = b.v(PLATE.h / 2), w = PLATE.w * K, h = PLATE.h * K, r = PLATE.r * K, R = C.rng(304);
      c.fillStyle = '#000';
      for (let k = 3; k >= 1; k--) { c.globalAlpha = 0.16; const e = 0.12 * k * K; rrect(c, x + 0.25 * K - e, y + 0.4 * K - e, w + 2 * e, h + 2 * e, r + e); c.fill(); }
      c.globalAlpha = 1;
      const g = c.createLinearGradient(x, y, x + w * 0.35, y + h);
      g.addColorStop(0, '#B6BCC2'); g.addColorStop(0.55, '#A5ACB2'); g.addColorStop(1, '#959CA3');
      c.fillStyle = g; rrect(c, x, y, w, h, r); c.fill();
      c.save(); c.clip();
      /* vetas del cepillado: trazos horizontales de 1 px de dispositivo con alfa aleatorio fijo */
      for (let yy = floor(y); yy < y + h; yy++) {
        for (let k = 0; k < 3; k++) {
          const a = 0.025 + 0.06 * R(), x0 = x - 20 + R() * w, len = w * (0.15 + 0.9 * R());
          c.globalAlpha = a; c.fillStyle = R() < 0.5 ? '#FFFFFF' : '#1C2228';
          c.fillRect(x0, yy, len, 1);
        }
      }
      c.globalAlpha = 1;
      const sh = c.createLinearGradient(0, y, 0, y + h);
      sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.08)');
      c.fillStyle = sh; c.fillRect(x, y, w, h);
      c.restore();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const hx = b.u(sx * PLATE.hx), hy = b.v(sy * PLATE.hy), hr = PLATE.hole / 2 * K;
        c.fillStyle = '#04141B'; c.beginPath(); c.arc(hx, hy, hr, 0, 2 * PI); c.fill();
        const rg = c.createLinearGradient(hx - hr, hy - hr, hx + hr, hy + hr);
        rg.addColorStop(0, 'rgba(60,68,76,.9)'); rg.addColorStop(1, 'rgba(225,230,235,.75)');
        c.strokeStyle = rg; c.lineWidth = max(1, 0.3 * K); c.beginPath(); c.arc(hx, hy, hr + 0.12 * K, 0, 2 * PI); c.stroke();
      }
      c.lineWidth = 1;
      const eg = c.createLinearGradient(0, y, 0, y + h);
      eg.addColorStop(0, 'rgba(235,240,245,.55)'); eg.addColorStop(1, 'rgba(20,26,32,.55)');
      c.strokeStyle = eg; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
      pc = b;
    }
    /* glifos rasterizados a resolución de dispositivo: la máscara no se lee (§1), así que más finura no aporta nada */
    function marks() {
      const bx0 = P.ink.x0 - 1, bx1 = P.ink.x1 + 1, by0 = P.yB - 1, by1 = P.yT + 1;
      const glyphsOn = (c, k, u, v, fn) => {
        c.font = '600 ' + (FS * k).toFixed(2) + 'px Barlow, sans-serif'; c.textBaseline = 'alphabetic';
        for (const g of P.inked) fn(g.ch, u(g.x), v(P.yb));
      };
      const b = bake(bx0, by0, bx1, by1, mk), hc = b.c;
      hc.lineJoin = 'round'; hc.strokeStyle = COL.halo; hc.globalAlpha = 0.6; hc.lineWidth = max(0.8, 0.05 * L.K);
      glyphsOn(hc, L.K, b.u, b.v, (ch, x, y) => hc.strokeText(ch, x, y));
      hc.globalAlpha = 1; hc.fillStyle = COL.mark;
      glyphsOn(hc, L.K, b.u, b.v, (ch, x, y) => hc.fillText(ch, x, y));
      mk = b;
      const edge = (o, color, lw) => {
        const e = bake(bx0, by0, bx1, by1, o);
        e.c.strokeStyle = color; e.c.lineWidth = lw; e.c.lineJoin = 'round';
        glyphsOn(e.c, L.K, e.u, e.v, (ch, x, y) => e.c.strokeText(ch, x, y));
        return e;
      };
      ctn = edge(ctn, COL.edge, max(0.7, 0.03 * L.K));
      ctp = edge(ctp, COL.plasma, max(1, 0.06 * L.K));
      pl = pl || { cv: doc.createElement('canvas') };
      pl.W = mk.W; pl.H = ceil(7 * env.scale) + 1; pl.cv.width = pl.W; pl.cv.height = pl.H; pl.c = pl.cv.getContext('2d');
    }
    function matrix() {
      if (!P.dm) { dmc = null; return; }
      const d = P.dm, b = bake(d.x - 0.5, -d.y - 0.5, d.x + DMS.mm + 0.5, d.y + 0.5, dmc), c = b.c, N = d.N, g = max(0.6, 0.04 * L.K);
      const xs = i => round(b.u(d.x + i * MOD)), ys = j => round(b.v(d.y - j * MOD));
      c.fillStyle = COL.halo; c.globalAlpha = 0.5;
      for (let j = 0; j < N; j++) { const r = d.runs[j]; for (let k = 0; k < r.length; k += 2) c.fillRect(xs(r[k]) - g, ys(j) - g, xs(r[k + 1]) - xs(r[k]) + 2 * g, ys(j + 1) - ys(j) + 2 * g); }
      c.globalAlpha = 1; c.fillStyle = COL.mark;
      for (let j = 0; j < N; j++) { const r = d.runs[j]; for (let k = 0; k < r.length; k += 2) c.fillRect(xs(r[k]), ys(j), xs(r[k + 1]) - xs(r[k]), ys(j + 1) - ys(j)); }
      dmc = b;
    }
    function build() {
      const q = G.performance.now();
      L = geo(); plate(); marks(); matrix();
      jobs.build = G.performance.now() - q;
    }
    /* sin esperar a la fuente: la marca no se ve hasta pasados los 1.2 s de guía, y al cargar se rehace */
    env.font('600 40px Barlow', TXT).then(() => { if (L) { marks(); env.wake(); } }, () => {});
    env.onFonts(() => { if (L) marks(); });

    function phase(m) { return m < P.M.t1 ? 'pre' : m < P.M.t2 ? 'text' : m < P.M.t3 ? 'cont' : m < P.M.t4 ? 'dm' : 'end'; }
    function contourAt(m) { const k = m - P.M.t2; let i = 0; while (i < P.inked.length && P.cont[i + 1] <= k) i++; return i; }
    function onInk(x, y) { for (const g of P.inked) if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1) return true; return false; }
    function onRun(i, x) {
      const d = P.dm, r = d.runs[min(d.N - 1, floor((i + 0.5) * LZ.hatch / MOD))];
      for (let k = 0; k < r.length; k += 2) if (x >= d.x + r[k] * MOD && x <= d.x + r[k + 1] * MOD) return true;
      return false;
    }
    function locate() {
      const ph = phase(tm);
      head.on = false;
      if (ph === 'text') {
        const i = lineAt(P.text, tm - P.M.t1);
        head.x = xAt(P.text, i, tm - P.M.t1); head.y = P.text.y[i]; head.on = onInk(head.x, head.y);
      } else if (ph === 'dm') {
        const i = lineAt(P.dmL, tm - P.M.t3);
        head.x = xAt(P.dmL, i, tm - P.M.t3); head.y = P.dmL.y[i]; head.on = onRun(i, head.x);
      } else if (ph === 'cont') {
        const g = P.inked[min(P.inked.length - 1, contourAt(tm))];
        head.x = g.x1; head.y = (g.y0 + g.y1) / 2; head.on = true;
      }
      return ph;
    }
    function smoke(dt, ph) {
      if (!L || dt <= 0) return;
      if (head.on && (ph === 'text' || ph === 'dm' || ph === 'cont')) {
        sAcc += dt * 26;
        while (sAcc >= 1) {
          sAcc -= 1;
          const p = SMK.find(q => !q.on);
          if (!p) break;
          p.on = true; p.x = X(head.x) + (rng() - 0.5) * 2; p.y = Y(head.y); p.vx = 2 + 5 * rng(); p.vy = -(5 + 7 * rng());
          p.a = 0.08 + 0.07 * rng(); p.life = 1.1 + 0.6 * rng(); p.age = 0;
        }
      }
      for (const p of SMK) {
        if (!p.on) continue;
        p.age += dt; if (p.age >= p.life) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }

    const PH = { pre: 'guía · marco', text: 'relleno 0° · texto', cont: 'contorno', dm: 'relleno 0° · data matrix', end: 'fin de programa' };
    function texts(force) {
      if (!force && Math.abs(t - hudT) < 0.066) return;
      hudT = t;
      const T1 = PAL.hud.text, VV = PAL.hud.value, ph = phase(tm);
      rows = [[{ text: 'v ', color: T1 }, { text: String(ph === 'cont' ? LZ.vC : LZ.v), color: VV }, { text: ' mm/s · ', color: T1 },
        { text: String(LZ.f), color: VV }, { text: ' kHz · ', color: T1 }, { text: String(LZ.ns), color: VV }, { text: ' ns · hatch ', color: T1 },
        { text: String(LZ.hatch), color: VV }],
        [{ text: 't ', color: T1 }, { text: fix(tm, 1) + ' s', color: VV }, { text: '  ', color: T1 }, { text: 'SIM ×' + SIM, color: PAL.hud.sim },
          { text: '  ' + PH[ph], color: T1 }]];
    }
    function hud(c) {
      c.save();
      c.font = '9px ui-monospace,Menlo,Consolas,monospace'; c.textBaseline = 'top'; c.lineJoin = 'round';
      c.lineWidth = 2; c.strokeStyle = 'rgba(4,26,37,.75)';
      rows.forEach((row, k) => {
        let x = 8;
        const y = 6 + k * 10.5;
        for (const p of row) { c.strokeText(p.text, x, y); c.fillStyle = p.color; c.fillText(p.text, x, y); x += c.measureText(p.text).width; }
      });
      c.restore();
    }

    /* estela del fotograma: tramos recorridos entre la posición anterior y la actual, más vivos cuanto más recientes */
    function trail(Lh, ta, tb, emit) {
      let ia = lineAt(Lh, ta);
      const ib = lineAt(Lh, tb);
      if (ib - ia > 8) { ia = ib - 8; ta = max(ta, Lh.cum[ia]); }
      const span = max(1e-6, tb - ta);
      for (let i = ia; i <= ib; i++) {
        const t0 = max(ta, Lh.cum[i]), t1 = min(tb, Lh.cum[i + 1]);
        if (t1 <= t0) continue;
        for (let k = 0; k < 4; k++) {
          const a = t0 + (t1 - t0) * k / 4, b = t0 + (t1 - t0) * (k + 1) / 4, xa = xAt(Lh, i, a), xb = xAt(Lh, i, b);
          emit(i, min(xa, xb), max(xa, xb), 1 - (tb - (a + b) / 2) / span);
        }
      }
    }
    let ec = null, ey = 0;
    const emitText = (i, xa, xb, a) => { ec.globalAlpha = 0.25 + 0.65 * a * a; ec.fillRect(mk.u(xa), ey, max(1, (xb - xa) * L.K), max(1, round(env.scale))); };
    const emitDm = (i, xa, xb, a) => {
      const d = P.dm, r = d.runs[min(d.N - 1, floor((i + 0.5) * LZ.hatch / MOD))], y = Y(P.dmL.y[i]);
      ec.globalAlpha = 0.25 + 0.65 * a * a;
      for (let k = 0; k < r.length; k += 2) {
        const x0 = max(xa, d.x + r[k] * MOD), x1 = min(xb, d.x + r[k + 1] * MOD);
        if (x1 > x0) ec.fillRect(X(x0), y - 0.5, max(0.5, (x1 - x0) * L.s), 1);
      }
    };
    function headDot(c, x, y, k) {
      c.globalAlpha = 0.45; c.fillStyle = '#C8DAFF'; c.beginPath(); c.arc(x, y, 2.4 * k, 0, 2 * PI); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#FFFFFF'; c.fillRect(x - k, y - k, 2 * k, 2 * k);
    }
    function plasma(c, ph) {
      if (ph === 'text' && mk) {
        const o = P.M.t1, i = lineAt(P.text, tm - o), yc = round(mk.v(P.text.y[i])), sy = yc - (pl.H >> 1), p = pl.c;
        p.globalCompositeOperation = 'source-over'; p.clearRect(0, 0, pl.W, pl.H);
        p.fillStyle = COL.plasma; ec = p; ey = yc - sy - (max(1, round(env.scale)) >> 1);
        trail(P.text, max(0, tmPrev - o), tm - o, emitText);
        headDot(p, mk.u(head.x), yc - sy, env.scale);
        p.globalAlpha = 1; p.globalCompositeOperation = 'destination-in';
        p.drawImage(mk.cv, 0, sy, pl.W, pl.H, 0, 0, pl.W, pl.H);
        p.globalCompositeOperation = 'source-over';
        c.drawImage(pl.cv, 0, 0, pl.W, pl.H, mk.fx, mk.fy + sy / env.scale, pl.W / env.scale, pl.H / env.scale);
        if (head.on) head.maxPx2 = max(head.maxPx2, 4 * env.scale * env.scale);
      } else if (ph === 'dm' && P.dm) {
        const o = P.M.t3;
        c.fillStyle = COL.plasma; ec = c;
        trail(P.dmL, max(0, tmPrev - o), tm - o, emitDm);
        c.globalAlpha = 1;
        if (head.on) {
          const i = lineAt(P.dmL, tm - o), d = P.dm, r = d.runs[min(d.N - 1, floor((i + 0.5) * LZ.hatch / MOD))];
          for (let k = 0; k < r.length; k += 2) {
            const x0 = d.x + r[k] * MOD, x1 = d.x + r[k + 1] * MOD;
            if (head.x < x0 || head.x > x1) continue;
            c.save(); c.beginPath(); c.rect(X(x0), Y(head.y) - 3, (x1 - x0) * L.s, 6); c.clip();
            headDot(c, X(head.x), Y(head.y), 1); c.restore();
          }
          head.maxPx2 = max(head.maxPx2, 4 * env.scale * env.scale);
        }
      } else if (ph === 'cont' && ctp) {
        const k = contourAt(tm), g = P.inked[min(P.inked.length - 1, k)], a = max(0, floor(ctp.u(g.x0 - 0.3))), b = min(ctp.W, ceil(ctp.u(g.x1 + 0.3)));
        c.globalAlpha = 0.6;
        c.drawImage(ctp.cv, a, 0, b - a, ctp.H, ctp.fx + a / env.scale, ctp.fy, (b - a) / env.scale, ctp.fh);
      }
      c.globalAlpha = 1;
    }
    function particles(c) {
      c.fillStyle = COL.smoke;
      for (const p of SMK) {
        if (!p.on) continue;
        const k = p.age / p.life;
        c.globalAlpha = p.a * Math.sin(PI * k);
        c.beginPath(); c.arc(p.x, p.y, 0.8 + 4 * k, 0, 2 * PI); c.fill();
      }
      c.globalAlpha = 1;
    }
    function guide(c) {
      const f = 0.65 + 0.1 * Math.sin(2 * PI * 7.3 * t) + 0.04 * Math.sin(2 * PI * 13.1 * t + 1.3), A = P.area;
      c.globalAlpha = f; c.strokeStyle = COL.guide; c.lineWidth = 1;
      c.strokeRect(X(A.x0), Y(A.y1), (A.x1 - A.x0) * L.s, (A.y1 - A.y0) * L.s);
      c.globalAlpha = 1;
    }
    /* cota en mm por encima de la cual ya hay marca: la línea de relleno en curso (nada antes de que pase el punto) */
    function markY(ph, which) {
      const done = which === 'text' ? ph !== 'pre' && ph !== 'text' : ph === 'end';
      if (done) return -Infinity;
      if (which === 'text' && ph === 'text') return P.text.y[lineAt(P.text, tm - P.M.t1)];
      if (which === 'dm' && ph === 'dm') return P.dmL.y[lineAt(P.dmL, tm - P.M.t3)];
      return Infinity;
    }
    function reveal(c, b, yLine) {
      if (!b || yLine === Infinity) return;
      const r = yLine === -Infinity ? b.H : min(b.H, floor(b.v(yLine)));
      if (r > 0) c.drawImage(b.cv, 0, 0, b.W, r, b.fx, b.fy, b.fw, r / env.scale);
    }

    function reset() { for (const p of SMK) p.on = false; sAcc = 0; head.on = false; idle = false; }
    const scene = {
      duration: P.D,
      grid: 'máscara a resolución de dispositivo',
      start() { t = 0; last = -1; tm = tmPrev = 0; hudT = -1; reset(); texts(true); },
      update(tt, dt) {
        if (tt < last) { reset(); tmPrev = tau(P, tt); }
        else tmPrev = tm;
        t = tt; last = tt; tm = tau(P, tt);
        const ph = locate();
        smoke(dt || 0, ph);
        texts(false);
        if (ph === 'end' && !SMK.some(p => p.on)) { if (idle) return false; idle = true; }
        else idle = false;
        return true;
      },
      render() {
        const c = env.ctx2d, q1 = G.performance.now();
        if (!L) build();
        const ph = phase(tm);
        c.drawImage(pc.cv, pc.fx, pc.fy, pc.fw, pc.fh);
        reveal(c, mk, markY(ph, 'text'));
        if (ph === 'cont') {
          const k = contourAt(tm), x = k > 0 ? P.inked[k - 1].x1 + 0.3 : -1e9, w = x > -1e8 ? min(ctn.W, ceil(ctn.u(x))) : 0;
          if (w > 0) c.drawImage(ctn.cv, 0, 0, w, ctn.H, ctn.fx, ctn.fy, w / env.scale, ctn.fh);
        } else if (ph === 'dm' || ph === 'end') c.drawImage(ctn.cv, ctn.fx, ctn.fy, ctn.fw, ctn.fh);
        reveal(c, dmc, markY(ph, 'dm'));
        if (ph === 'pre') guide(c);
        plasma(c, ph);
        particles(c);
        hud(c);
        const ms = G.performance.now() - q1;
        jobs.n++; jobs.sum += ms; if (ms > jobs.max) jobs.max = ms;
      },
      final() { reset(); t = last = P.D; tm = tmPrev = tau(P, P.D); locate(); head.on = false; texts(true); },
      hud() { return {}; },
      resize() { build(); hudT = -1; texts(true); },
      stats() {
        return { simFactor: SIM, cycleS: +P.D.toFixed(3), phase: phase(tm), tMachine: +tm.toFixed(3),
          machineS: { preview: +P.M.pre.toFixed(3), text: +P.M.text.toFixed(3), contour: +P.M.cont.toFixed(3), dm: +P.M.dm.toFixed(3), total: +P.M.t4.toFixed(3) },
          pulsePitchUm: +C.MECH.pulsePitch(LZ.v, LZ.f).toFixed(3), dm: DM_OK, textMm: +P.wt.toFixed(2), groupMm: [+P.group.x0.toFixed(2), +P.group.x1.toFixed(2)],
          hatchLines: { text: P.text.n, dm: P.dmL ? P.dmL.n : 0 }, headOn: head.on, head: [+head.x.toFixed(3), +head.y.toFixed(3)],
          markY: { text: markY(phase(tm), 'text'), dm: markY(phase(tm), 'dm') }, headPx2Max: head.maxPx2,
          smoke: SMK.reduce((n, p) => n + (p.on ? 1 : 0), 0), initOwnMs: +initMs.toFixed(2), buildMs: +jobs.build.toFixed(2),
          renderMs: { avg: +(jobs.sum / (jobs.n || 1)).toFixed(3), max: +jobs.max.toFixed(3), n: jobs.n } };
      },
      dispose() { for (const b of [pc, mk, ctn, ctp, dmc, pl]) if (b && b.cv) b.cv.width = 0; }
    };
    return scene;
  }, { kind: '2d', drive: 'time', loop: true, frame: { w: 384, h: 176 }, frameM: { w: 350, h: 176 } });

  C.spec('laser', {
    tools: [], cuts: [],
    text: TXT, dmText: DM_TXT, plate: PLATE, cap: CAP, capEm: CAP_EM, track: TRACK, fontMm: FS, gap: GAP, laser: LZ, ink: INK, perim: PERIM,
    sim: SIM, tPre: T_PRE, tEnd: T_END, dmSpec: DMS, module: MOD, colors: COL, metrics: BW,
    plan: PLAN, dm: DM, dmOk: DM_OK, duration: PLAN.D,
    encode, verify, rs, ascii, pad, place, symbol, gf: { EXP, LOG, mul: gmul }, lineAt, xAt, tau: t => tau(PLAN, t)
  });
})(globalThis);
