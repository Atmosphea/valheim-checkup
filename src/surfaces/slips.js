// @ts-check
/**
 * WP-11 · paper slips in #float: the toast and the tooltips (spec "Menus, toasts, tooltips,
 * messages"; P37, P38; DECISIONS 35 and 38).
 *
 * Toast: `#toast` moves into #float and becomes a paper slip at the bottom right of the sheet
 * (always inside the window's bottom-right quarter, DECISIONS 38). app.js and the tutorial still
 * write it exactly as before (text, the `hidden` class, their own 10 s timers). Each `app:toast`
 * slides it in from the bottom right with a slight curl (350 ms); 350 ms before its 10 s are up it
 * slides out again (`toast:out`), so it is gone when the app hides it. Breeze and impacts make it
 * flutter.
 *
 * Tooltips: after a 500 ms hover on anything with a `title`, a small paper slip shows that text.
 * While it shows, the text moves to `data-tip` so the browser's own tooltip doesn't double up; it
 * goes back to `title` when the pointer leaves, on any press or key, and on scroll. The census is
 * taken with no tooltip open (DECISIONS 35).
 */
import { emit, on } from '../bus.js';
import { surfaces as MS, hanging as MH } from '../config/motion.js';
import { sheet as LS } from '../config/layout.js';
import { Spring } from '../util/spring.js';
import { onImpact } from '../scene/impact.js';

/**
 * @param {object} o
 * @param {HTMLElement} o.host  #float
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} o.project
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 * @param {(x: number, y: number) => number} [o.air]
 */
export function attachSlips(o) {
  // ── Toast ───────────────────────────────────────────────────────────────────────────────
  const toast = /** @type {HTMLElement} */ (document.getElementById('toast'));
  o.host.append(toast);
  toast.classList.add('vc-toast-slip');
  toast.style.setProperty('--vc-toast-ms', MH.toastSlideMs + 'ms');
  toast.style.setProperty('--vc-toast-curl', MS.toastCurlDeg + 'deg');
  toast.style.setProperty('--vc-toast-life', MH.toastLifeMs + 'ms');
  const flutter = new Spring({ ...MS.toastFlutterSpring, value: 0 });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let outTimer;

  /** Anchor the slip at the sheet's bottom-right corner, kept inside the window's bottom-right quarter. */
  function place() {
    const p = o.project(LS.x1 - 1.2, LS.y0 + 1.6, 0);
    const right = Math.min(innerWidth - 12, Math.max(innerWidth * 0.8, p.x));
    const bottom = Math.min(innerHeight - 12, Math.max(innerHeight * 0.8, p.y));
    toast.style.right = (innerWidth - right).toFixed(1) + 'px';
    toast.style.bottom = (innerHeight - bottom).toFixed(1) + 'px';
    // the slip's centre for the breeze, kept here so the frame loop never reads layout
    centre = { x: right - 150, y: bottom - 25 };
  }
  let centre = { x: innerWidth - 150, y: innerHeight - 40 };
  on('app:toast', () => {
    place();
    toast.classList.remove('vc-toast-in', 'vc-toast-out');
    void toast.offsetWidth;
    // one 10 s CSS animation (in 350 ms, hold, out 350 ms, then visibility: hidden) runs the
    // slip's whole life on the compositor's clock; the timer below only marks the slide-out
    toast.classList.add('vc-toast-in');
    flutter.impulse(18);
    clearTimeout(outTimer);
    outTimer = setTimeout(() => {
      if (toast.classList.contains('hidden')) return;
      toast.classList.add('vc-toast-out');
      emit('toast:out', {});
    }, MH.toastLifeMs - MH.toastSlideMs);
  });
  // hidden by the app: clear the slide state for next time
  // (only when one is set: a class write always queues a record and would wake this observer again)
  new MutationObserver(() => {
    if (toast.classList.contains('hidden') && (toast.classList.contains('vc-toast-in') || toast.classList.contains('vc-toast-out'))) toast.classList.remove('vc-toast-in', 'vc-toast-out');
  })
    .observe(toast, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', place);
  let side = 1;
  onImpact(felt => { side = -side; flutter.impulse(side * felt * 50); }, () => ({ x: LS.x1 - 8, y: LS.y0 + 2 }));
  o.onPhase('physics', dt => {
    if (toast.classList.contains('hidden')) return;
    flutter.target = Math.min(MS.toastFlutterMaxDeg, (o.air ? o.air(centre.x, centre.y) : 0) * MS.toastFlutterDegPerSpeed);
    flutter.step(dt);
    const v = flutter.value.toFixed(2) + 'deg';
    if (toast.style.rotate !== v) toast.style.rotate = v;
  });
  place();

  // ── Tooltips ────────────────────────────────────────────────────────────────────────────
  const tip = document.createElement('div');
  tip.className = 'vc-tip vc-keep-alive';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  o.host.append(tip);
  /** @type {HTMLElement|null} */
  let over = null;
  /** @type {HTMLElement|null} */
  let moved = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let px = 0, py = 0;
  // WP-13: flat mode has no #desk; the whole page carries the tooltips there
  const desk = /** @type {HTMLElement} */ (document.getElementById('desk') || document.body);

  function restore() {
    clearTimeout(timer);
    if (moved) {
      const t = moved.dataset.tip;
      if (t !== undefined && !moved.hasAttribute('title')) moved.setAttribute('title', t);
      delete moved.dataset.tip;
      moved = null;
    }
    tip.hidden = true;
    tip.classList.remove('vc-tip--in');
  }
  function showTip() {
    if (!over || !over.isConnected || !over.hasAttribute('title')) return;
    const text = over.getAttribute('title') || '';
    if (!text) return;
    moved = over;
    over.dataset.tip = text;
    over.removeAttribute('title');
    tip.textContent = text;
    tip.hidden = false;
    // under and right of the pointer, kept on screen
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = px + 14, y = py + 20;
    if (x + w > innerWidth - 8) x = Math.max(8, px - 14 - w);
    if (y + h > innerHeight - 8) y = Math.max(8, py - 12 - h);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    void tip.offsetWidth;
    tip.classList.add('vc-tip--in');
  }
  desk.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const t = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('[title]'));
    if (t === over) return;
    restore();
    over = t;
    if (t && !t.closest('.vc-menu, .vc-tip')) timer = setTimeout(showTip, MS.tooltipDelayMs);
  });
  desk.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; }, { passive: true });
  desk.addEventListener('pointerout', e => {
    const to = /** @type {Node|null} */ (e.relatedTarget);
    if (over && (!to || !over.contains(to))) { restore(); over = null; }
  });
  for (const t of ['pointerdown', 'keydown', 'wheel']) addEventListener(t, () => { restore(); over = null; }, true);
  addEventListener('scroll', () => { restore(); over = null; }, true);
  addEventListener('blur', () => { restore(); over = null; });

  return {
    toast: { place, read: () => ({ rect: toast.getBoundingClientRect().toJSON(), in: toast.classList.contains('vc-toast-in'), out: toast.classList.contains('vc-toast-out'), rotate: toast.style.rotate }) },
    tooltips: { restore: () => { restore(); over = null; }, read: () => ({ shown: !tip.hidden, text: tip.hidden ? '' : tip.textContent, moved: !!moved }) },
  };
}
