/* Runtime de las pantallas de simulación: montaje, ciclo de vida, HUD, scroll, movimiento reducido,
   pausa, respaldos, vigilante de fotogramas y CamSim.debug. Solo navegador. */
(function (G) {
'use strict';
const C = G.CamSim || (G.CamSim = {}), D = G.document;
if (!D || C.__rt) return;
C.__rt = 1;

const P = {};
try { new URLSearchParams(G.location.search).forEach((v, k) => { if (k.indexOf('sim') === 0) P[k.slice(3)] = v; }); } catch (e) {}
if (G.CamSimParams) Object.assign(P, G.CamSimParams);
const DBG = P.debug === '1', FORCE = P.gl === 'force';
const now = () => G.performance.now();
const mq = q => { try { return G.matchMedia(q); } catch (e) { return null; } };
const MQR = mq('(prefers-reduced-motion: reduce)'), MQM = mq('(max-width: 639px)');
let reduced = P.reduced === '1' || !!(MQR && MQR.matches);

const DPR_MAX = { A: 2, B: 1.5, C: 1 };
const BASE = (() => {
  if (/^[ABC]$/.test(P.tier)) return P.tier;
  const n = G.navigator || {}, f = mq('(pointer: fine)');
  return f && f.matches && !/Mobi|Android|iPhone|iPad/i.test(n.userAgent || '') && G.innerWidth >= 768 && !(n.deviceMemory <= 4) ? 'A' : 'B';
})();

const R = [], byName = {}, pool = [];
let hub = null, hubTried = false, glTier = BASE, raf = 0, prevNow = 0, lastScroll = -1e9, inits = 0;

function log(r, where, e) {
  if (r && r.warned) return;
  if (r) r.warned = true;
  try { G.console.warn('[sim] ' + (r ? r.n : '') + ' · ' + where + ': ' + (e && e.message || e)); } catch (x) {}
}

function getHub() {
  if (hubTried) return hub;
  hubTried = true;
  if (P.gl === '0' || !C.GL || typeof C.GL.hub !== 'function') return null;
  try { hub = C.GL.hub() || null; } catch (e) { hub = null; if (DBG) log(null, 'hub', e); }
  if (hub) {
    glTier = /^[ABC]$/.test(P.tier) ? P.tier : (hub.software || hub.tier === 'C') ? 'C' : BASE;
    if (hub.on) { hub.on('lost', onLost); hub.on('restored', onRestored); }
  }
  return hub;
}

/* ---------- llamadas protegidas y respaldos ---------- */
function call(r, fn, a, b) {
  const s = r.act;
  if (!s || typeof s[fn] !== 'function') return;
  try { return s[fn](a, b); } catch (e) { fail(r, e, fn); return false; }
}
function callMain(r, fn, a) {
  if (!r.main || typeof r.main[fn] !== 'function') return;
  try { return r.main[fn](a); } catch (e) { fail(r, e, fn); }
}
function fail(r, e, where) {
  log(r, where, e);
  if (r.act && r.act === r.main && typeof r.main.fallback === 'function' && to2d(r, 'error')) return;
  toPoster(r, String(e && e.message || e));
}
function to2d(r, why) {
  if (!r.main || typeof r.main.fallback !== 'function') { toPoster(r, why === 'error' ? 'error' : ''); return false; }
  try {
    const fb = r.fb || (r.fb = r.main.fallback(r.env2d));
    if (!fb) throw new Error('fallback vacío');
    r.act = fb; r.mode = '2d'; r.why = why; r.lostP = false;
    size(r); resized(r);
    return true;
  } catch (e) { log(r, 'fallback', e); toPoster(r, 'fallback'); return false; }
}
function toGL(r) {
  r.restP = false;
  if (r.noGL || !r.main || r.act === r.main || !r.env.gl || (hub && hub.lost)) return;
  r.act = r.main; r.mode = 'gl'; r.why = '';
  size(r); resized(r);
}
function toPoster(r, err) {
  if (err) r.err = err;
  const was = r.act;
  r.act = null; r.st = 'poster';
  r.scr.classList.remove('sim-live');
  btn(r);
  for (const s of [was, r.fb, r.main]) if (s && typeof s.dispose === 'function') { try { s.dispose(); } catch (e) {} }
  r.main = r.fb = null;
  r.res('poster');
}
function onLost() {
  for (const r of R) if (r.act && r.act === r.main && r.mode === 'gl') { r.lostP = true; r.restP = false; }
  wake();
}
function onRestored() {
  for (const r of R) if (r.fb && r.why === 'lost') r.restP = true;
  wake();
}

/* ---------- tamaño y marco ---------- */
function size(r, ent) {
  if (ent) {
    const cb = ent.contentBoxSize && ent.contentBoxSize[0], dp = ent.devicePixelContentBoxSize && ent.devicePixelContentBoxSize[0];
    const w = cb ? cb.inlineSize : ent.contentRect.width, h = cb ? cb.blockSize : ent.contentRect.height;
    if (w === r.cssW && h === r.cssH && dp && Math.abs(dp.inlineSize - r.devW) <= 1 && Math.abs(dp.blockSize - r.devH) <= 1) return false;
    r.cssW = w; r.cssH = h; r.devW = dp ? dp.inlineSize : 0; r.devH = dp ? dp.blockSize : 0;
  } else if (!r.cssW) { r.cssW = r.scr.clientWidth; r.cssH = r.scr.clientHeight; }
  if (!r.cssW || !r.cssH) return false;
  const dpr = +P.dpr || G.devicePixelRatio || 1, gl = r.mode === 'gl';
  /* devicePixelContentBoxSize solo si casa con el DPR: con DPR emulado (Chromium sin cabeza) devuelve px CSS */
  const dev = !P.dpr && r.devW && Math.abs(r.devW - r.cssW * dpr) <= 2 && Math.abs(r.devH - r.cssH * dpr) <= 2;
  const pw = dev ? r.devW : Math.round(r.cssW * dpr), ph = dev ? r.devH : Math.round(r.cssH * dpr);
  let k = Math.min(1, Math.min(gl ? DPR_MAX[r.tier] : 2, r.dprCap || 9) / dpr);
  if (gl && pw * ph * k * k > 2.5e6) k *= Math.sqrt(2.5e6 / (pw * ph * k * k));
  const w = Math.max(1, Math.round(pw * k)), h = Math.max(1, Math.round(ph * k));
  const m = r.m, fr = (MQM && MQM.matches && m.frameM) || m.frame || { w: r.cssW, h: r.cssH };
  const e = r.env, cv = r.cv;
  if (cv.width === w && cv.height === h && e.frame.w === fr.w && e.frame.h === fr.h) return false;
  cv.width = w; cv.height = h;
  const s = Math.min(w / fr.w, h / fr.h);
  e.frame.w = fr.w; e.frame.h = fr.h; e.scale = s; e.dpr = dpr * k;
  e.ox = Math.round((w - fr.w * s) / 2); e.oy = Math.round((h - fr.h * s) / 2);
  const v = e.view;
  v.w = fr.w; v.h = fr.h; v.scale = s; v.ox = e.ox; v.oy = e.oy; v.pw = Math.round(fr.w * s); v.ph = Math.round(fr.h * s);
  v.cw = w; v.ch = h; v.dpr = e.dpr; v.tier = r.tier; v.msaa = gl && r.tier === 'A' && e.dpr < 1.5 && !r.noMsaa;
  return true;
}
function resized(r) {
  if (!r.act) return;
  const e = r.env;
  call(r, 'resize', e.frame, e.scale, e.dpr);
  r.dirty = true;
  if (r.st === 'run' || r.st === 'final') paint(r, now());
}

/* ---------- pintado, HUD y fundido ---------- */
function paint(r, t) {
  const c = r.ctx, cv = r.cv, e = r.env;
  r.dirty = false;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.save();
  c.beginPath(); c.rect(e.ox, e.oy, e.frame.w * e.scale, e.frame.h * e.scale); c.clip();
  c.setTransform(e.scale, 0, 0, e.scale, e.ox, e.oy);
  call(r, 'render');
  c.restore();
  if (r.fadeT) {
    const k = (t - r.fadeT) / 600;
    if (k >= 1 || !r.aux) auxFree(r);
    else { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = (1 - k) * (1 - k) * (1 - k); c.drawImage(r.aux, 0, 0, cv.width, cv.height); c.globalAlpha = 1; }
  }
  if (!r.first && r.act) { r.first = true; firstFrame(r); }
}
function auxFree(r) {
  r.fadeT = 0;
  if (r.aux) { r.aux.width = r.aux.height = 0; pool.push(r.aux); r.aux = null; }
}
function hud(r, force) {
  const t = now();
  if (!force && t - r.hudT < 66) return;
  r.hudT = t;
  const o = call(r, 'hud');
  if (!o) return;
  r.hudLast = o;
  for (const k in o) {
    const v = o[k], els = r.hudEl[k], bars = r.hudBarEl[k];
    if (els) { const s = String(v); if (r.hudTxt[k] !== s) { r.hudTxt[k] = s; for (const el of els) el.textContent = s; } }
    if (bars) { const n = Math.max(0, Math.min(1, +v || 0)); if (r.hudBar[k] !== n) { r.hudBar[k] = n; for (const el of bars) el.style.transform = 'scaleX(' + n.toFixed(4) + ')'; } }
  }
}
function btn(r) {
  if (!r.btn) return;
  r.btn.hidden = !(r.st === 'run' && r.live && r.m.drive !== 'scroll' && !reduced);
}
function goLive(r) {
  r.hold = false; r.live = true;
  if (r.holdTimer) { clearTimeout(r.holdTimer); r.holdTimer = 0; }
  r.scr.classList.add('sim-live');
  hud(r, true);
  r.last = 0; btn(r); wake();
}
function firstFrame(r) {
  r.initMs = now() - r.t0;
  r.res(r.st);
  const img = r.img, intro = +r.m.introFinal || 0;
  if (r.st === 'run' && intro > 0 && img && img.complete && img.naturalWidth > 0 && !r.frozen) {
    r.hold = true;
    r.holdTimer = setTimeout(() => { r.holdTimer = 0; if (r.hold) goLive(r); }, intro * 1000);
  } else goLive(r);
}

/* ---------- ciclo ---------- */
function reseed(r) { r.gen = (C.rng || mulberry)(r.seed); }
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function restart(r) {
  r.t = 0;
  r.dur = +(r.main && r.main.duration) || r.dur;
  reseed(r);
  callMain(r, 'start');
  if (r.act && r.act !== r.main && typeof r.act.start === 'function') call(r, 'start');
}
function cycle(r) {
  r.cycles++;
  const cv = r.cv, a = r.aux || pool.pop() || D.createElement('canvas');
  a.width = cv.width; a.height = cv.height;
  a.getContext('2d').drawImage(cv, 0, 0);
  r.aux = a; r.fadeT = now();
  if (r.restP) toGL(r);
  restart(r);
}

function step(r, t, vis, gap) {
  if (!r.act || (r.st !== 'run' && r.st !== 'final')) return false;
  if (r.lostP) to2d(r, 'lost');
  if (!r.act) return false;
  const scroll = r.m.drive === 'scroll';
  const run = r.st === 'run' && vis && r.vis && !r.paused && !r.frozen && !r.hold;
  let changed = false, keep = false;
  if (run) {
    if (r.last && t - r.last < 1000 / r.fps - 4) return true;
    const dt = r.last ? Math.min(0.05, (t - r.last) / 1000) : 0;
    if (r.last) { r.iv[r.ivn++ % r.iv.length] = t - r.last; }
    r.last = t;
    const t0 = now();
    if (scroll) {
      if (r.sDirty) measure(r);
      if (r.p !== r.pT) {
        r.p += (r.pT - r.p) * (1 - Math.exp(-dt / 0.2));
        if (Math.abs(r.p - r.pT) < 5e-4) r.p = r.pT;
        call(r, 'seek', r.p);
        changed = true; keep = r.p !== r.pT;
      } else if (r.restP) { toGL(r); call(r, 'seek', r.p); }
    } else if (r.m.loop !== false || r.t < r.dur) {
      r.t += dt;
      if (r.t >= r.dur) { if (r.m.loop === false) r.t = r.dur; else cycle(r); }
      changed = call(r, 'update', r.t, dt) !== false;
      keep = true;
    }
    if (changed || r.dirty || r.fadeT) {
      paint(r, t);
      r.drew = true;
      r.frames++;
      r.cpu[r.cpun++ % r.cpu.length] = now() - t0;
      if (r.mode === 'gl') copyCheck(r);
    }
    if (changed) hud(r, false);
  } else {
    r.last = 0;
    if (r.dirty || r.fadeT) paint(r, t);
  }
  return keep || !!r.fadeT;
}
function measure(r) {
  r.sDirty = false;
  const b = r.scr.getBoundingClientRect(), vh = G.innerHeight || 1;
  r.pT = Math.max(0, Math.min(1, (0.85 * vh - b.top) / (b.height + 0.6 * vh)));
}

function tick(t) {
  raf = 0;
  const gap = prevNow ? t - prevNow : 16.7, vis = D.visibilityState !== 'hidden';
  prevNow = t;
  let again = false;
  for (const r of R) if (r.sDirty && r.vis && r.st === 'run' && r.m.drive === 'scroll') measure(r);
  for (const r of R) {
    if (r.drew) { r.drew = false; if (r.mode === 'gl') watch(r, gap, t); }
    if (step(r, t, vis, gap)) again = true;
  }
  if (again) wake(); else prevNow = 0;
}
function wake() { if (!raf && R.length) raf = G.requestAnimationFrame(tick); }

/* ---------- vigilante (solo escenas GL) ---------- */
function median(a, n) {
  const b = Array.prototype.slice.call(a, 0, n).sort((x, y) => x - y);
  return b.length ? b[b.length >> 1] : 0;
}
function act(r, what) {
  const w = r.wd;
  if (FORCE) { w.would = what; return; }
  w.did = what;
  if (what === 'dpr1') { r.dprCap = 1; r.fps = 30; r.noMsaa = true; size(r); resized(r); }
  else if (what === '30fps') r.fps = 30;
  else { r.noGL = true; to2d(r, 'watchdog'); }
}
function watch(r, gap, t) {
  const w = r.wd;
  if (inits || t - lastScroll < 300 + gap || w.st > 1) return;
  if (w.skip > 0) { w.skip--; return; }
  const g = r.env.gl;
  w.b[w.n++] = g && typeof g.gpuMs === 'number' ? g.gpuMs : gap;
  if (w.n < 90) return;
  w.med = median(w.b, 90); w.n = 0;
  if (w.st === 0 && w.med > 30) { w.st = 1; act(r, 'dpr1'); }
  else if (w.st === 1 && w.med > 45) { w.st = 2; act(r, '2d'); }
}
function copyCheck(r) {
  const g = r.env.gl, c = r.cp;
  if (!g || c.n >= 60 || typeof g.copyMs !== 'number') return;
  c.a[c.n++] = g.copyMs;
  if (c.n < 60) return;
  c.med = median(c.a, 60);
  if (c.med > 8) act(r, '2d'); else if (c.med > 3) act(r, '30fps');
}

/* ---------- montaje e inicialización ---------- */
function posterOk(img) { return !!(img && img.complete && img.naturalWidth > 0); }
function idle(r) {
  r.slice = Math.max(r.slice, now() - r.s0);
  return new Promise(res => {
    const go = () => { r.s0 = now(); res(); };
    if (G.requestIdleCallback) G.requestIdleCallback(go, { timeout: 200 });
    else { const ch = new MessageChannel(); ch.port1.onmessage = go; ch.port2.postMessage(0); }
  });
}
function font(spec, sample) {
  const f = D.fonts;
  if (!f || !f.load) return Promise.resolve();
  return Promise.race([f.load(spec, sample), new Promise(res => setTimeout(res, 1500))]).catch(() => {});
}
function makeEnv(r, fin) {
  const e = {
    name: r.n, canvas: r.cv, ctx2d: r.ctx, frame: { w: 0, h: 0 }, scale: 1, dpr: 1, ox: 0, oy: 0,
    tier: r.tier, reduced: !!fin, rng: () => r.gen(), safe: r.safe, gl: null, screen: r.scr, data: r.cv.dataset, meta: r.m,
    view: {}, mode: 'gl',
    idle: fin ? () => Promise.resolve() : () => idle(r),
    font,
    onFonts(fn) {
      if (D.fonts && D.fonts.addEventListener) D.fonts.addEventListener('loadingdone', () => {
        if (!r.act) return;
        try { fn(); } catch (x) { fail(r, x, 'fonts'); }
        r.dirty = true; wake();
      });
    },
    wake() { r.dirty = true; wake(); }
  };
  r.env2d = Object.create(e);
  r.env2d.gl = null; r.env2d.mode = '2d';
  return e;
}
function init(r, fin) {
  if (r.st !== 'idle' && !(r.st === 'poster' && !r.err && !r.main)) return r.initP || Promise.resolve();
  clearTimeout(r.timer);
  r.st = 'init'; inits++;
  r.t0 = r.s0 = now(); r.slice = 0;
  r.initP = (async () => {
    const m = r.m;
    r.tier = BASE;
    r.mode = '2d';
    const e = r.env = makeEnv(r, fin);
    if (m.kind === 'gl') {
      const h = getHub();
      if (h) {
        r.tier = e.tier = glTier; r.mode = 'gl';
        size(r);
        try { e.gl = h.scene(r.cv, r.ctx, e.view) || null; } catch (x) { e.gl = null; log(r, 'gl', x); }
      }
      if (!e.gl) r.mode = '2d';
    }
    r.fps = (r.mode === 'gl' ? r.tier : BASE) === 'A' ? 60 : 30;
    size(r);
    reseed(r);
    const s = await r.def.factory(e);
    if (!s) throw new Error('la fábrica no devolvió escena');
    r.main = r.act = s;
    r.dur = +s.duration || 1;
    if (m.kind === 'gl' && !e.gl) { r.noGL = true; if (!to2d(r, 'nogl')) return; }
    r.slice = Math.max(r.slice, now() - r.s0);
    resized(r);
    restart(r);
    if (!r.act) return;
    if (fin) return finish(r);
    r.st = 'run';
    if (m.drive === 'scroll') { measure(r); r.p = r.pT; call(r, 'seek', r.p); }
    else call(r, 'update', 0, 0);
    if (!r.act) return;
    paint(r, now());
    /* con introFinal el HUD del HTML ya dice lo mismo que el póster: se escribe al quitarlo */
    if (!r.hold) hud(r, true);
  })().catch(x => fail(r, x, 'init')).then(() => { inits--; if (r.st === 'init') toPoster(r, 'init'); });
  return r.initP;
}
function finish(r) {
  r.st = 'final';
  call(r, 'final');
  if (!r.act) return;
  paint(r, now());
  hud(r, true);
  if (r.first) goLive(r);
}
function armReduced(r) {
  const img = r.img;
  if (posterOk(img)) { r.st = 'poster'; btn(r); r.res('poster'); return; }
  if (img && !img.complete && !r.waitImg) {
    r.waitImg = true;
    const go = () => { img.removeEventListener('load', go); img.removeEventListener('error', go); clearTimeout(to); r.waitImg = false; if (reduced && r.st === 'idle') armReduced(r); };
    const to = setTimeout(() => { img.removeEventListener('load', go); img.removeEventListener('error', go); r.waitImg = false; if (reduced && r.st === 'idle') init(r, true); }, 5000);
    img.addEventListener('load', go); img.addEventListener('error', go);
    return;
  }
  if (!r.waitImg) init(r, true);
}
function arm(r) {
  r.near = true;
  if (r.st !== 'idle' || r.timer) return;
  if (reduced) return armReduced(r);
  const d = r.m.bootDelay != null ? +r.m.bootDelay : r.n === 'hero' ? 1600 : 0;
  if (!d) return init(r, false);
  const at = Math.max(now(), +G.__magBootEnd || 0) + d;
  r.timer = setTimeout(() => { r.timer = 0; if (r.st === 'idle' && !reduced) init(r, false); }, at - now());
}

let ioNear, ioVis, ro;
function observers() {
  if (ioNear) return;
  const IO = G.IntersectionObserver, RO = G.ResizeObserver;
  if (IO) {
    ioNear = new IO(es => { for (const e of es) if (e.isIntersecting) { ioNear.unobserve(e.target); arm(e.target.__sim); } }, { rootMargin: '100% 0px' });
    ioVis = new IO(es => {
      for (const e of es) {
        const r = e.target.__sim;
        r.ratio = e.intersectionRatio;
        r.vis = r.m.drive === 'scroll' ? e.isIntersecting : e.isIntersecting && e.intersectionRatio >= 0.249;
        if (r.vis) { r.sDirty = true; wake(); }
      }
    }, { threshold: [0, 0.25] });
  } else ioNear = ioVis = null;
  if (RO) ro = new RO(es => { for (const e of es) { const r = e.target.__sim; if (r.env && size(r, e)) resized(r); else if (!r.env) size0(r, e); } });
}
function size0(r, e) {
  const cb = e.contentBoxSize && e.contentBoxSize[0], dp = e.devicePixelContentBoxSize && e.devicePixelContentBoxSize[0];
  r.cssW = cb ? cb.inlineSize : e.contentRect.width; r.cssH = cb ? cb.blockSize : e.contentRect.height;
  r.devW = dp ? dp.inlineSize : 0; r.devH = dp ? dp.blockSize : 0;
}

function add(cv, def) {
  const scr = cv.closest('.screen') || cv.parentElement, pe = scr.querySelector('.sim-poster');
  const m = Object.assign({ kind: '2d', drive: 'time', loop: true, introFinal: 0 }, def.meta);
  const sf = (cv.dataset.safe || '0 0 18 0').split(/\s+/).map(Number);
  let seed = 2166136261;
  for (const ch of cv.dataset.sim) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const r = {
    n: cv.dataset.sim, cv, scr, def, m, ctx: cv.getContext('2d'),
    img: pe && (pe.tagName === 'IMG' ? pe : pe.querySelector('img')), btn: scr.querySelector('.sim-toggle'),
    st: 'idle', t: 0, p: 0, pT: 0, dur: 1, tier: BASE, mode: '2d', fps: 60, seed: +cv.dataset.seed || seed >>> 0,
    safe: { top: sf[0] || 0, right: sf[1] || 0, bottom: sf[2] || 0, left: sf[3] || 0 },
    vis: !G.IntersectionObserver, paused: false, frozen: false, hudT: -1e9, hudTxt: {}, hudBar: {}, hudEl: {}, hudBarEl: {},
    frames: 0, cycles: 0, cpu: new Float32Array(600), cpun: 0, iv: new Float32Array(120), ivn: 0,
    cp: { a: new Float32Array(60), n: 0 }, wd: { skip: 30, b: new Float32Array(90), n: 0, st: 0 }
  };
  r.readyP = new Promise(res => { r.res = res; });
  if (!r.ctx) { r.st = 'poster'; r.res('poster'); return; }
  for (const el of scr.querySelectorAll('[data-hud]')) (r.hudEl[el.dataset.hud] || (r.hudEl[el.dataset.hud] = [])).push(el);
  for (const el of scr.querySelectorAll('[data-hud-bar]')) (r.hudBarEl[el.dataset.hudBar] || (r.hudBarEl[el.dataset.hudBar] = [])).push(el);
  if (r.btn) {
    r.btn.hidden = true;
    r.btn.addEventListener('click', () => {
      r.paused = !r.paused;
      r.btn.setAttribute('aria-pressed', r.paused ? 'true' : 'false');
      r.btn.textContent = r.paused ? 'seguir' : 'pausa';
      r.last = 0; wake();
    });
  }
  cv.__sim = scr.__sim = r;
  R.push(r); byName[r.n] = r;
  observers();
  if (ioNear) { ioNear.observe(scr); ioVis.observe(scr); } else arm(r);
  if (ro) { try { ro.observe(scr, { box: 'device-pixel-content-box' }); } catch (e) { ro.observe(scr); } }
}

const pending = [];
function mount(last) {
  const list = pending.splice(0).concat(Array.prototype.slice.call(D.querySelectorAll('canvas[data-sim]')));
  for (const cv of list) {
    if (cv.__sim || pending.indexOf(cv) >= 0) continue;
    const def = C.scenes && C.scenes[cv.dataset.sim];
    if (def && typeof def.factory === 'function') add(cv, def);
    else if (last) { if (DBG) log(null, 'mount', 'escena no registrada: ' + cv.dataset.sim); }
    else pending.push(cv);
  }
}
if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', () => mount(false));
else Promise.resolve().then(() => mount(false));
G.addEventListener('load', () => mount(true));

G.addEventListener('scroll', () => { lastScroll = now(); for (const r of R) if (r.m.drive === 'scroll') r.sDirty = true; wake(); }, { passive: true });
G.addEventListener('resize', () => { for (const r of R) r.sDirty = true; wake(); });
D.addEventListener('visibilitychange', wake);
if (MQR && MQR.addEventListener) MQR.addEventListener('change', () => {
  const was = reduced;
  reduced = P.reduced === '1' || MQR.matches;
  if (was === reduced) return;
  for (const r of R) {
    if (reduced) {
      clearTimeout(r.timer); r.timer = 0;
      if (posterOk(r.img)) { if (r.st === 'run' || r.st === 'final') { r.st = 'poster'; r.scr.classList.remove('sim-live'); } }
      else if (r.st === 'run') { r.frozen = true; finish(r); r.frozen = false; }
    } else if (!r.err && r.main && r.act && (r.st === 'poster' || r.st === 'final')) {
      r.st = 'run'; restart(r); goLive(r); r.dirty = true;
    } else if (r.st === 'poster' && !r.main && !r.err) { r.st = 'idle'; if (r.near) arm(r); }
    btn(r);
  }
  wake();
});

/* ---------- CamSim.debug ---------- */
const get = n => byName[n];
function state(r) {
  if (r.st !== 'run') return r.st;
  if (r.paused || r.frozen) return 'paused';
  return r.m.kind === 'gl' && r.mode === '2d' ? 'fallback' : 'live';
}
function info(r) {
  const s = r.act || r.main || {};
  return {
    name: r.n, state: state(r), kind: r.m.kind, drive: r.m.drive, tier: r.mode === 'gl' ? r.tier : '2d', mode: r.mode,
    grid: s.grid || null, dpr: r.env ? +r.env.dpr.toFixed(3) : 0,
    renderer: r.mode === 'gl' && hub ? 'webgl2 ' + (hub.renderer || '') : '2d',
    frame: r.env ? { w: r.env.frame.w, h: r.env.frame.h } : r.m.frame || null,
    canvas: [r.cv.width, r.cv.height], duration: r.dur, t: +r.t.toFixed(4), p: +r.p.toFixed(4), why: r.why || '', err: r.err || ''
  };
}
async function ensure(r, fin) {
  if (r.st === 'idle' || (r.st === 'poster' && !r.err && !r.main)) init(r, fin && reduced);
  await r.initP;
  return !!r.act;
}
function cpuStats(r) {
  const n = Math.min(r.cpun, r.cpu.length), a = Array.prototype.slice.call(r.cpu, 0, n).sort((x, y) => x - y);
  if (!n) return { avg: 0, p95: 0, max: 0, n: 0 };
  const f = x => +x.toFixed(3);
  return { avg: f(a.reduce((s, x) => s + x, 0) / n), p95: f(a[Math.min(n - 1, Math.floor(n * 0.95))]), max: f(a[n - 1]), n };
}
C.debug = {
  scenes: () => R.map(info),
  ready: n => { const r = get(n); return r ? r.readyP : Promise.resolve('missing'); },
  pause(n) { const r = get(n); if (r) r.frozen = true; },
  play(n) {
    const r = get(n);
    if (!r) return;
    r.frozen = false;
    if (r.paused && r.btn) r.btn.click(); else r.paused = false;
    if (r.st === 'final' && r.act && !reduced) { r.st = 'run'; restart(r); r.dirty = true; }
    if (r.st === 'run' && !r.live && r.first) goLive(r);
    r.last = 0; wake();
  },
  async seek(n, x) {
    const r = get(n);
    if (!r || !(await ensure(r))) return null;
    r.frozen = true; auxFree(r);
    if (r.st === 'final') r.st = 'run';
    if (r.m.drive === 'scroll') { r.p = r.pT = Math.max(0, Math.min(1, +x || 0)); call(r, 'seek', r.p); }
    else {
      restart(r);
      const T = Math.max(0, Math.min(+x || 0, r.dur - 1e-4));
      let t = 0;
      call(r, 'update', 0, 0);
      while (t < T && r.act) { const dt = Math.min(1 / 30, T - t); t += dt; call(r, 'update', t, dt); }
      r.t = T;
    }
    if (!r.act) return info(r);
    paint(r, now()); hud(r, true);
    if (!r.live) goLive(r);
    return info(r);
  },
  async final(n) {
    const r = get(n);
    if (!r || !(await ensure(r, true))) return null;
    r.frozen = true; auxFree(r);
    finish(r);
    if (!r.live) goLive(r);
    return info(r);
  },
  stats(n) {
    const r = get(n);
    if (!r) return null;
    const iv = median(r.iv, Math.min(r.ivn, r.iv.length)), g = r.env && r.env.gl;
    const o = {
      frames: r.frames, cpu: cpuStats(r), initMs: r.initMs != null ? +r.initMs.toFixed(1) : null,
      longestInitSliceMs: +(r.slice || 0).toFixed(1), cycle: r.cycles, tier: info(r).tier, mode: r.mode, state: state(r),
      fpsMedian: iv ? +(1000 / iv).toFixed(1) : 0, fpsCap: r.fps, copyMs: r.cp.med != null ? +r.cp.med.toFixed(3) : g && g.copyMs != null ? g.copyMs : null,
      gpuMB: hub ? (typeof hub.gpuMB === 'number' ? hub.gpuMB : hub.stats ? hub.stats().gpuMB : null) : 0,
      watchdog: { stage: r.wd.st, median: r.wd.med || 0, did: r.wd.did || '', would: r.wd.would || '' }
    };
    const s = r.act || r.main;
    if (s && typeof s.stats === 'function') { try { Object.assign(o, s.stats()); } catch (e) { o.statsError = String(e.message || e); } }
    return o;
  },
  resetStats(n) { const r = get(n); if (r) { r.frames = r.cpun = r.ivn = 0; } },
  hud: n => { const r = get(n); return r ? r.hudLast || null : null; },
  tier: () => hub && !hub.lost ? glTier : '2d',
  loseContext: () => hubDbg('lose'),
  restoreContext: () => hubDbg('restore')
};
function hubDbg(w) {
  const h = getHub();
  if (!h) return false;
  const f = h[w + 'Context'] || (h.debug && h.debug[w]);
  if (typeof f !== 'function') return false;
  f.call(h.debug && h.debug[w] === f ? h.debug : h);
  return true;
}
})(globalThis);
