// @ts-check
/**
 * WP-11 · small ink effects:
 *
 *   File drop (spec "File drop"; file 04 "Paper": magic): a faint ink ripple ring spreads from the
 *   drop point, 0 → 40 cm in 900 ms, 4% darker at the ring. Drawn in perspective on the paper
 *   plane (a canvas in #float). The coin hum, the sheet breathing, the Load coin rising and the
 *   coin flip are WP-06/07's and already answer `drag:file-enter` / `drop:file`.
 *
 *   Value wipe (file 04 "Printed text": a value change is a 180 ms wipe, never a hard swap;
 *   DECISIONS 32 gives WP-11 every case WP-06/10 don't cover): the list count, the lifetime
 *   records, the favourite counts, the progress percentage and the death-loss sandbox result.
 *
 *   Messages: `#message` is a hand-inked note; an error gets a red ink blot that spreads behind
 *   it (CSS; this restarts the spread whenever a new error is written).
 */
import { paper as MP, printed as MPr } from '../config/motion.js';
import { on } from '../bus.js';
import { clock } from '../util/clock.js';

/**
 * @param {object} o
 * @param {HTMLElement} o.host  #float
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} o.project
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 */
export function attachInkBits(o) {
  // ── The drop ripple ────────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.className = 'vc-ripple vc-keep-alive';
  canvas.setAttribute('aria-hidden', 'true');
  o.host.prepend(canvas);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {{x: number, y: number, t: number}[]} */
  const rings = [];
  let drawn = false;
  const size = () => {
    const pr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * pr); canvas.height = Math.round(innerHeight * pr);
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
  };
  size();
  addEventListener('resize', size);
  on('drop:file', d => { rings.push({ x: +d.x || 0, y: +d.y || 0, t: 0 }); });

  o.onPhase('overlays', dt => {
    if (!rings.length && !drawn) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    drawn = false;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const u = r.t / MP.dropRippleMs;
      if (u >= 1) { rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - u, 2);
      const rad = MP.dropRippleRadiusFrom + (MP.dropRippleRadiusTo - MP.dropRippleRadiusFrom) * e;
      const width = 1.2 + 2.2 * (1 - u);
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const p = o.project(r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad, 0);
        if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      // the ring: up to 4% darker in ink colour, fading as it spreads
      const scale = Math.abs(o.project(r.x + 1, r.y, 0).x - o.project(r.x, r.y, 0).x);
      ctx.lineWidth = Math.max(1, width * scale);
      ctx.strokeStyle = `rgba(43, 29, 20, ${(MP.dropRippleDarken * (1 - u * 0.85)).toFixed(4)})`;
      ctx.stroke();
      drawn = true;
    }
  });

  // ── The 180 ms value wipe ───────────────────────────────────────────────────────────────
  const WIPE = MPr.valueWipeMs;
  /** @param {Element} el */
  const wipe = el => {
    if (!(el instanceof HTMLElement)) return;
    el.style.setProperty('--vc-wipe-ms', WIPE + 'ms');
    clearTimeout(/** @type {any} */ (el).__vcWipe);
    // WP-14: restart the animation without a forced layout (an offsetWidth read here cost a full
    // style recalc of the freshly rebuilt table): if it is running, take the class off and put it
    // back on the next frame
    if (el.classList.contains('vc-wipe')) {
      el.classList.remove('vc-wipe');
      clock.nextFrame(() => el.classList.add('vc-wipe'));
    } else el.classList.add('vc-wipe');
    /** @type {any} */ (el).__vcWipe = setTimeout(() => el.classList.remove('vc-wipe'), WIPE + 60);
  };
  /** @type {Map<string, string>} */
  const last = new Map();
  /** Watch an element (re-read by key so a rebuilt node still compares with the old text). @param {string} key @param {() => Element[]} find */
  const watch = (key, find) => {
    const check = () => {
      find().forEach((el, i) => {
        const k = key + ':' + i, text = el.textContent || '';
        const before = last.get(k);
        last.set(k, text);
        if (before !== undefined && before !== text) wipe(el);
      });
    };
    check();
    return check;
  };
  const $$ = (/** @type {string} */ s) => [...document.querySelectorAll(s)];
  const checks = [
    watch('count', () => $$('#listCount')),
    watch('stat', () => $$('#statline b')),
    watch('fav', () => $$('#favorites .favorite b')),
    watch('pct', () => $$('#mainTrack .progress-hover')),
    watch('loss', () => $$('#lossResult')),
  ];
  const run = () => { for (const c of checks) c(); };
  const mo = new MutationObserver(run);
  for (const id of ['listCount', 'statline', 'favorites', 'mainTrack', 'insightsView']) {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { childList: true, characterData: true, subtree: true });
  }

  // ── Messages: restart the red blot's spread for each new error ─────────────────────────
  const msg = document.getElementById('message');
  if (msg) {
    let lastErr = '';
    new MutationObserver(() => {
      const err = msg.classList.contains('error') ? (msg.textContent || '') : '';
      // touch the class only on a real change: classList writes always queue a record, which
      // would wake this observer (and the paper's slot observer) again, forever
      if (err === lastErr) return;
      lastErr = err;
      if (err) { msg.classList.remove('vc-blot'); void msg.offsetWidth; msg.classList.add('vc-blot'); }
      else if (msg.classList.contains('vc-blot')) msg.classList.remove('vc-blot');
    }).observe(msg, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  }

  return { rings: () => rings.length, wipe };
}
