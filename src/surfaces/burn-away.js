// @ts-check
/**
 * Paul, WP-17 item 27: closing Details burns the letter away (then about a second; now 1.5 s).
 * Paul, WP-18 item 15: stronger, and it must read as a real piece of paper falling and burning,
 * not a wipe:
 *   - the whole sheet toasts darker as it burns (a growing brown wash plus a seeded scorch-blotch
 *     texture), and the scorch band at the front is wide;
 *   - the sheet catches, then rotates and falls, carried sideways by the wind (with a sway and a
 *     slight 3D tumble), so the burn rides on a moving sheet;
 *   - a char front runs FAST and noisily (high, quickly changing harmonics) ahead of the ember
 *     front; the ember front follows and consumes the char;
 *   - what burns leaves floating black paper fragments (irregular pieces with glowing rims that
 *     cool, tumbling and drifting on the wind), not specks.
 *
 * A printed copy of the sheet (unfold.js `face`, inert and aria-hidden) takes the dialog's exact
 * place and transform. The burned part is cut away with an even-odd `clip-path` along the ember
 * front; a canvas on the sheet draws toast, the char band and the live ember edge; fragments fly
 * on a second, unclipped canvas over the host. The background dim is a plain fade. Everything is
 * seeded from the item id (file 01: no unseeded randomness) and removed when the last fragment is
 * gone. The sound is `fold.close`, built as a crackle (audio wiring, same item).
 */
import { ember as EMBER } from '../config/render.js';
import { Rng, toSeed } from '../util/rng.js';
import { clock } from '../util/clock.js';

export const BURN = {
  ms: 1500,            // the ember front crosses the whole sheet (WP-17: 1000; item 15 adds the fall)
  dimFadeMs: 450,      // the dim simply fades
  noise: [[3, 0.10], [5, 0.07], [9, 0.045], [14, 0.03], [23, 0.018]], // ember front: harmonics × amplitude
  charNoise: [[7, 0.06], [13, 0.05], [21, 0.04], [34, 0.03], [55, 0.02]], // char front: finer, faster
  charLead: 0.13,      // the char front is this much of the run ahead at first, then gets eaten
  charJitter: 9,       // how fast the char front's pattern changes (× the ember's)
  scorchPx: 34, emberPx: 3.4,
  toast: { tone: [92, 52, 18], darken: 0.38, blotch: 0.62 }, // a brown wash over the whole sheet + blotches
  // the fall: still for `catchMs`, then gravity, wind and a turn (px, px/s², degrees)
  fall: { catchMs: 160, gravity: 520, windPx: 260, swayPx: 34, swayHz: 1.1, turnDeg: 26, tumbleDeg: 22, shrink: 0.08 },
  frag: { perFrame: 4, sizePx: [4, 13], lifeMs: [1300, 2600], windPx: 70, lift: [10, 55], fallPx: 40, rimMs: 380 },
};

const rgb = (/** @type {number[]} */ c, /** @type {number} */ k = 1, /** @type {number} */ a = 1) =>
  `rgba(${c.map(v => Math.round(Math.min(1, v * k) * 255)).join(', ')}, ${a})`;
/** a fast front: it is already moving at the start and speeds up a little */
const easeIn = (/** @type {number} */ u) => u * (0.35 + 0.65 * u); // slow to catch, then eats fast
const clamp01 = (/** @type {number} */ x) => Math.max(0, Math.min(1, x));

/** A seeded scorch-blotch texture (brown, uneven), small and scaled up. @param {Rng} rng @param {number} w @param {number} h */
function blotchTexture(rng, w, h) {
  const c = document.createElement('canvas');
  const W = c.width = Math.max(8, Math.ceil(w / 6)), H = c.height = Math.max(8, Math.ceil(h / 6));
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * W, y = rng.next() * H, r = (0.06 + rng.next() * 0.22) * Math.max(W, H);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.10 + rng.next() * 0.22;
    gr.addColorStop(0, `rgba(70, 34, 10, ${a})`); gr.addColorStop(0.6, `rgba(90, 50, 18, ${a * 0.45})`); gr.addColorStop(1, 'rgba(90, 50, 18, 0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine fibre speckle so it reads as paper browning, not a gradient
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const s = rng.next();
    if (s < 0.18) { img.data[i] = 40; img.data[i + 1] = 20; img.data[i + 2] = 6; img.data[i + 3] = Math.min(255, img.data[i + 3] + 40 + s * 200); }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * @param {object} p
 * @param {HTMLElement} p.host       #float
 * @param {HTMLElement} p.sheet      the dialog, still laid out and transformed as it was open
 * @param {(src: HTMLElement, rect: {x:number,y:number,w:number,h:number}, pr: {x:number,y:number,w:number,h:number}) => HTMLElement} p.face  unfold.js's printed copy
 * @param {{x: number, y: number} | null} [p.from]  client point the close came from
 * @param {string} [p.seed]
 * @param {boolean} [p.reduced]
 * @param {string} [p.dim]  the dim colour the layer had
 * @returns {{ stage: HTMLElement, done: Promise<void> }}
 */
export function burnAway(p) {
  const stage = document.createElement('div');
  stage.className = 'vc-burn vc-keep-alive';
  stage.inert = true;
  stage.setAttribute('aria-hidden', 'true');
  const dim = document.createElement('div');
  dim.className = 'vc-burn-dim';
  if (p.dim) dim.style.background = p.dim;
  dim.style.transition = `opacity ${p.reduced ? 150 : BURN.dimFadeMs}ms linear`;
  stage.append(dim);
  p.host.append(stage);
  clock.nextFrame(() => { dim.style.opacity = '0'; });

  const w = p.sheet.offsetWidth, h = p.sheet.offsetHeight;
  if (p.reduced || !w || !h) {
    return { stage, done: new Promise(res => setTimeout(() => { stage.remove(); res(); }, 170)) };
  }

  // the sheet copy, exactly where the dialog was (same layout box, same transform)
  const wrap = document.createElement('div');
  wrap.className = 'vc-burn-sheet';
  const baseT = getComputedStyle(p.sheet).transform; // the bob is a compositor animation (item 29): take its value now
  const T0 = baseT && baseT !== 'none' ? baseT : '';
  const left = p.sheet.offsetLeft, top = p.sheet.offsetTop;
  Object.assign(wrap.style, {
    left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px',
    transform: T0, rotate: p.sheet.style.rotate || '',
  });
  const copy = p.face(p.sheet, { x: 0, y: 0, w, h }, { x: 0, y: 0, w, h });
  wrap.append(copy);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const edge = document.createElement('canvas');
  edge.className = 'vc-burn-edge';
  edge.width = Math.ceil(w * dpr); edge.height = Math.ceil(h * dpr);
  wrap.append(edge);
  stage.append(wrap);
  const inner = /** @type {HTMLElement|null} */ (copy.firstElementChild);
  if (inner) inner.scrollTop = p.sheet.scrollTop;
  const ash = document.createElement('canvas');
  ash.className = 'vc-burn-ash';
  const vw = p.host.clientWidth || innerWidth, vh = p.host.clientHeight || innerHeight;
  ash.width = Math.ceil(vw * dpr); ash.height = Math.ceil(vh * dpr);
  stage.append(ash);

  // sheet px → host px through the wrap's live transform (it falls and turns, item 15)
  const box0 = wrap.getBoundingClientRect();
  /** @type {DOMMatrix} */
  let M = new DOMMatrix();
  const updateMatrix = () => {
    try {
      const t = getComputedStyle(wrap);
      const m = new DOMMatrix(t.transform === 'none' ? '' : t.transform);
      const r = t.rotate && t.rotate !== 'none' ? new DOMMatrix(`rotate(${t.rotate})`) : new DOMMatrix();
      const [ox, oy] = (t.transformOrigin || `${w / 2}px ${h / 2}px`).split(' ').map(parseFloat);
      M = new DOMMatrix().translate(left + ox, top + oy).multiply(r).multiply(m).translate(-ox, -oy);
    } catch { M = new DOMMatrix().translate(left, top); }
  };
  updateMatrix();
  const toHost = (/** @type {number} */ x, /** @type {number} */ y) => {
    const q = M.transformPoint(new DOMPoint(x, y, 0, 1));
    return [q.x / (q.w || 1), q.y / (q.w || 1)];
  };

  // ignition: the nearest edge point to the click, else the lower left corner
  let ox = 0, oy = h;
  if (p.from) {
    const sx = box0.width / w || 1, sy = box0.height / h || 1;
    const lx = (p.from.x - box0.left) / sx, ly = (p.from.y - box0.top) / sy;
    const cx = Math.max(0, Math.min(w, lx)), cy = Math.max(0, Math.min(h, ly));
    const inside = lx > 0 && lx < w && ly > 0 && ly < h;
    if (!inside) { ox = cx; oy = cy; }
  }
  const rng = new Rng(toSeed('burn:' + (p.seed ?? '')));
  const phases = BURN.noise.map(() => rng.next() * Math.PI * 2);
  const speeds = BURN.noise.map(() => (rng.next() - 0.5) * 3);
  const cPhases = BURN.charNoise.map(() => rng.next() * Math.PI * 2);
  const cSpeeds = BURN.charNoise.map(() => (rng.next() - 0.5) * 3 * BURN.charJitter);
  const amp = BURN.noise.reduce((n, [, a]) => n + a, 0);
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy));
  const rMax = far / (1 - amp) + BURN.scorchPx;
  const N = 128;
  /** the ember front at angle a, time u (0..1) @param {number} a @param {number} u */
  const radius = (a, u) => {
    let n = 0;
    BURN.noise.forEach(([k, am], i) => { n += am * Math.sin(k * a + phases[i] + speeds[i] * u * 6); });
    return rMax * easeIn(u) * (1 + n);
  };
  /** the char front: ahead by a lead that shrinks to nothing, finer and faster-changing @param {number} a @param {number} u */
  const charRadius = (a, u) => {
    let n = 0;
    BURN.charNoise.forEach(([k, am], i) => { n += am * Math.sin(k * a + cPhases[i] + cSpeeds[i] * u); });
    const lead = BURN.charLead * (1 - u) * (0.7 + 0.3 * Math.sin(a * 4 + u * 20 + cPhases[0]));
    return Math.max(radius(a, u), rMax * easeIn(Math.min(1, u + lead)) * (1 + n));
  };
  /** @param {(a:number,u:number)=>number} rf @param {number} u */
  const ring = (rf, u) => {
    const pts = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const r = rf(a, u); pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]); }
    return pts;
  };
  /** @param {CanvasRenderingContext2D} c @param {number[][]} pts */
  const trace = (c, pts) => { pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); };

  // the wind blows away from the ignition side (so the flame trails), with a seeded lean
  const windDir = (ox < w / 2 ? 1 : -1) * (rng.next() < 0.2 ? -1 : 1);
  const F = BURN.fall, T = BURN.toast;
  const blotch = blotchTexture(rng, w, h);

  /** @type {{x:number,y:number,vx:number,vy:number,life:number,age:number,pts:number[][],rot:number,vr:number,flip:number,vf:number,rim:number}[]} */
  const frags = [];
  /** an irregular torn piece of paper, a few px across @param {number} s */
  const piece = s => {
    const k = 4 + Math.floor(rng.next() * 4), pts = [];
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + rng.next() * 0.7; const r = s * (0.45 + rng.next() * 0.55); pts.push([Math.cos(a) * r, Math.sin(a) * r * (0.5 + rng.next() * 0.5)]); }
    return pts;
  };
  const ctx = /** @type {CanvasRenderingContext2D} */ (edge.getContext('2d'));
  const actx = /** @type {CanvasRenderingContext2D} */ (ash.getContext('2d'));
  const t0 = clock.now(); // the central clock (file 01), so __vc.timeScale slows the burn too
  let last = t0;
  let resolve = () => {};
  const done = new Promise(res => { resolve = /** @type {any} */ (res); });

  const frame = () => {
    const now = clock.now();
    const dt = Math.min(50, now - last) / 1000; last = now;
    const el = now - t0;
    const u = Math.min(1, el / BURN.ms);
    // ── the fall: the sheet catches, then drops, drifts on the wind, turns and tumbles ──
    // (once burned through, the sheet is gone: only the fragments go on)
    if (u < 1) {
      const ft = Math.max(0, el - F.catchMs) / 1000;
      const dy = 0.5 * F.gravity * ft * ft * (1 - 0.35 * u);
      const dx = windDir * F.windPx * ft * ft * 0.8 + F.swayPx * Math.sin(ft * F.swayHz * Math.PI * 2) * Math.min(1, ft * 3);
      const turn = windDir * F.turnDeg * clamp01(ft * 1.3) * (0.6 + 0.4 * Math.sin(ft * 2.1));
      const tumble = F.tumbleDeg * Math.sin(ft * 3.3) * clamp01(ft * 2);
      const sc = 1 - F.shrink * clamp01(ft);
      wrap.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${turn.toFixed(2)}deg) rotateX(${tumble.toFixed(2)}deg) scale(${sc.toFixed(3)}) ${T0}`;
      updateMatrix();
    }
    // ── toast: the whole sheet browns and darkens as it burns ──
    // (a wash painted on the edge canvas below, not a CSS filter on the copy: under the 3D fall a
    // filter stops the copy being drawn at all)
    const k = clamp01(u * 1.4);

    const ePts = ring(radius, u), cPts = ring(charRadius, u);
    // the burned part is cut away along the EMBER front (even-odd: sheet minus the front)
    const d = `M0 0H${w}V${h}H0Z M` + ePts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
    wrap.style.clipPath = u >= 1 ? 'inset(50%)' : `path(evenodd, '${d}')`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (u < 1) {
      ctx.fillStyle = `rgba(${T.tone.join(', ')}, ${(T.darken * k).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = T.blotch * k;
      ctx.drawImage(blotch, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.lineJoin = 'round';
      // wide scorch ahead of the char
      ctx.beginPath(); trace(ctx, cPts);
      ctx.strokeStyle = 'rgba(96, 54, 20, 0.30)'; ctx.lineWidth = BURN.scorchPx * 2.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(58, 28, 10, 0.50)'; ctx.lineWidth = BURN.scorchPx * 1.1; ctx.stroke();
      // the char band: between the char front and the ember front, near black, crawling
      ctx.beginPath(); trace(ctx, cPts); trace(ctx, ePts);
      ctx.fillStyle = 'rgba(20, 10, 4, 0.94)'; ctx.fill('evenodd');
      ctx.beginPath(); trace(ctx, cPts);
      ctx.strokeStyle = 'rgba(14, 7, 3, 0.9)'; ctx.lineWidth = 3.2; ctx.stroke();
      // the live ember edge eats the char
      const flick = 0.75 + 0.25 * Math.sin(now / 1000 * EMBER.flickerHz * Math.PI * 2);
      ctx.beginPath(); trace(ctx, ePts);
      ctx.shadowColor = rgb(EMBER.color, 1, 1); ctx.shadowBlur = 18;
      ctx.strokeStyle = rgb(EMBER.color, 1, 0.55 * flick); ctx.lineWidth = BURN.emberPx * 4; ctx.stroke();
      ctx.strokeStyle = rgb(EMBER.color, 1, 0.95 * flick); ctx.lineWidth = BURN.emberPx * 2.2; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgb(EMBER.hot, 1, 0.9 * flick); ctx.lineWidth = BURN.emberPx; ctx.stroke();
      // black paper fragments break off the ember front where it is on the sheet
      const G = BURN.frag;
      for (let j = 0; j < G.perFrame; j++) {
        const q = ePts[Math.floor(rng.next() * N)];
        if (q[0] < 0 || q[0] > w || q[1] < 0 || q[1] > h) continue;
        const [hx, hy] = toHost(q[0], q[1]);
        frags.push({
          x: hx, y: hy,
          vx: windDir * G.windPx * (0.4 + rng.next()) + (rng.next() - 0.5) * 50,
          vy: -(G.lift[0] + rng.next() * (G.lift[1] - G.lift[0])),
          life: G.lifeMs[0] + rng.next() * (G.lifeMs[1] - G.lifeMs[0]), age: 0,
          pts: piece(G.sizePx[0] + rng.next() * (G.sizePx[1] - G.sizePx[0])),
          rot: rng.next() * 6.28, vr: (rng.next() - 0.5) * 7, flip: rng.next() * 6.28, vf: 3 + rng.next() * 6,
          rim: G.rimMs * (0.5 + rng.next()),
        });
      }
    }
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    actx.clearRect(0, 0, vw, vh);
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      f.age += dt * 1000;
      if (f.age >= f.life) { frags.splice(i, 1); continue; }
      const a = f.age / f.life;
      // wind gusts, a little lift first, then a slow flutter down; air drag on everything
      f.vx += (windDir * BURN.frag.windPx * 0.6 + Math.sin(f.age / 260 + f.rot) * 60) * dt;
      f.vy += (BURN.frag.fallPx * a - 8) * dt;
      f.vx *= 1 - 0.6 * dt; f.vy *= 1 - 0.9 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.flip += f.vf * dt;
      actx.save();
      actx.translate(f.x, f.y); actx.rotate(f.rot); actx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(f.flip)));
      actx.beginPath();
      f.pts.forEach((q, j) => (j ? actx.lineTo(q[0], q[1]) : actx.moveTo(q[0], q[1])));
      actx.closePath();
      const fade = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
      actx.fillStyle = `rgba(${16 + 26 * a | 0}, ${10 + 20 * a | 0}, ${7 + 16 * a | 0}, ${0.92 * fade})`;
      actx.fill();
      const rim = Math.max(0, 1 - f.age / f.rim);
      if (rim > 0.02) { actx.strokeStyle = rgb(EMBER.color, 1, 0.9 * rim * fade); actx.lineWidth = 1.2; actx.stroke(); }
      actx.restore();
    }
    stage.dataset.frags = String(frags.length); // debug read for tools/wp18b-check.cjs
    if (!(u < 1 || frags.length)) { stopFrames(); stage.remove(); resolve(); }
  };
  // WP-18P: on the central clock's frames (was its own requestAnimationFrame loop)
  const stopFrames = clock.onFrame(frame);
  return { stage, done };
}
