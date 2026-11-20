// @ts-check
/**
 * WP-11 · the Details sheet on the desk (spec "Details unfold" step 1; P30).
 *
 * `#itemDialog` keeps its content and app.js keeps calling `showModal()` and `close()`. On the
 * desk those two calls are answered on the dialog itself (own properties, so app.js is unchanged):
 *
 *   showModal()  →  show() inside #float: the browser's top layer would hide the spark and the
 *                   grain. Modal behaviour by hand: aria-modal="true", the rest of the page inert,
 *                   a Tab trap, Escape and a click outside close, focus back to the Details button.
 *   close()      →  emits `app:details-close` at once (DECISIONS WP-01 round 1 fix 4: the native
 *                   `close` event comes a task later), then closes natively; that late event is
 *                   stopped before app.js's own listener can emit a second `app:details-close`.
 *
 * The unfold and fold-shut are the shared engine (unfold.js).
 *
 * Paul, WP-16 item 25: the sheet opens in ONE step, like a letter (unfold style `letter`, text
 * already printed); Paul, WP-18 item 14: not out of the button any more but from nothing in the
 * middle of the screen, fading in as it unfolds. The Details button itself still peels off the
 * paper, right edge first, and floats while the dialog is open; it settles back on close.
 * Paul, WP-17 items 25–30: the body is laid out condensed (details-layout.js) before the sheet is
 * measured and after every re-render; closing burns the sheet away (burn-away.js) instead of
 * folding it back into the button, while the dim fades; the floating sheet is rastered once
 * (`will-change`) and its shadow is a separate element, so the print rides the bob exactly.
 * Classes on the button: `vc-peel-off` (peel, then float), `vc-peel-float` (a re-rendered row's
 * button joins the float without peeling again), `vc-peel-settle` (back onto the paper).
 */
import { emit, on } from '../bus.js';
import { hold, trapTab, focusables } from '../tutorial/modal.js';
import { surfaces as MSu } from '../config/motion.js';
import { layoutDetails } from './details-layout.js';
import { burnAway } from './burn-away.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * @param {object} o
 * @param {HTMLElement} o.host  #float
 * @param {ReturnType<typeof import('./unfold.js').createUnfold>} o.unfold
 */
export function attachDetails(o) {
  const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('itemDialog'));
  const items = /** @type {HTMLElement} */ (document.getElementById('items'));
  const layer = document.createElement('div');
  layer.className = 'vc-float-layer vc-details-layer vc-modal-root';
  layer.hidden = true;
  o.host.append(layer);
  layer.append(dlg);
  dlg.setAttribute('aria-modal', 'true');

  const nativeShow = HTMLDialogElement.prototype.show;
  const nativeClose = HTMLDialogElement.prototype.close;

  // The button the sheet unfolds from: the Details button that was used, or the row's own one.
  /** @type {HTMLElement|null} */
  let trigger = null;
  const pick = (/** @type {Event} */ e) => {
    const t = /** @type {Element} */ (e.target);
    const row = t.closest?.('[data-item]');
    trigger = /** @type {HTMLElement|null} */ (t.closest?.('[data-details]') || row?.querySelector('[data-details]') || null);
  };
  for (const type of ['click', 'dblclick', 'contextmenu']) items.addEventListener(type, pick, true);

  /** @type {{category: string, id: string} | null} */
  let current = null;
  on('app:details-open', d => { current = { category: d.category, id: d.id }; layoutDetails(dlg, d.id); });
  // app.js re-writes the body after a correction: lay it out again (item 25)
  const body = /** @type {HTMLElement} */ (document.getElementById('detailBody'));
  new MutationObserver(() => { if (dlg.open) layoutDetails(dlg, current?.id); }).observe(body, { childList: true });
  /** @type {{x: number, y: number} | null} where an outside click closed from (item 27) */
  let closeFrom = null;
  /** The Details button for the item now (rows are rebuilt on every render). */
  const buttonFor = () => {
    const id = current?.id ?? trigger?.dataset.details;
    if (!id) return null;
    const b = [...items.querySelectorAll('[data-details]')].find(x => /** @type {HTMLElement} */ (x).dataset.details === id);
    return /** @type {HTMLElement|null} */ (b || null);
  };

  /** @type {null | (() => void)} */
  let release = null;
  /** @type {import('./plan.js').Rect | null} */
  let openRect = null;
  let suppress = 0;
  /** @type {ReturnType<typeof burnAway> | null} */
  let burnRun = null;

  // ── The peeling Details button (Paul, WP-16 item 25) ──────────────────────────────────────
  /** @type {HTMLElement|null} */
  let peeled = null;
  /** @param {HTMLElement|null} b */
  function peelOff(b) {
    if (!b) return;
    b.classList.remove('vc-peel-settle');
    b.style.setProperty('--vc-peel-ms', MSu.peelMs + 'ms');
    b.style.setProperty('--vc-peel-curl', -MSu.peelCurlDeg + 'deg');
    b.style.setProperty('--vc-peel-lift', MSu.peelLiftPx + 'px');
    b.style.setProperty('--vc-peel-bob', MSu.peelFloatBobPx + 'px');
    b.style.setProperty('--vc-peel-bob-s', (1 / MSu.peelFloatHz / 2).toFixed(2) + 's');
    b.classList.add(reduced() ? 'vc-peel-float' : 'vc-peel-off');
    peeled = b;
    emit('details:peel', { dir: 'off' });
  }
  /** @param {HTMLElement|null} b */
  function settle(b) {
    for (const x of items.querySelectorAll('.vc-peel-off, .vc-peel-float')) if (x !== b) x.classList.remove('vc-peel-off', 'vc-peel-float');
    if (!b) return;
    const was = b.classList.contains('vc-peel-off') || b.classList.contains('vc-peel-float');
    b.classList.remove('vc-peel-off', 'vc-peel-float');
    if (!was || reduced()) return;
    b.style.setProperty('--vc-peel-settle-ms', MSu.peelSettleMs + 'ms');
    b.classList.add('vc-peel-settle');
    b.addEventListener('animationend', () => b.classList.remove('vc-peel-settle'), { once: true });
    emit('details:peel', { dir: 'settle' });
  }
  // rows are rebuilt on every render: the open item's new button floats straight away
  new MutationObserver(() => {
    if (!dlg.open) return;
    const b = buttonFor();
    if (b && b !== peeled && !b.classList.contains('vc-peel-off')) { b.classList.add('vc-peel-float'); peeled = b; }
  }).observe(items, { childList: true });

  // the native `close` event arrives a task after close(): app:details-close went out already
  addEventListener('close', e => {
    if (e.target === dlg && suppress > 0) { suppress--; e.stopImmediatePropagation(); }
  }, true);

  function open() {
    if (dlg.open) return;
    const from = trigger && trigger.isConnected ? trigger : buttonFor();
    const origin = from ? from.getBoundingClientRect() : null;
    current = null;
    layoutDetails(dlg, trigger?.dataset.details ?? from?.dataset.details ?? null);
    layer.hidden = false;
    nativeShow.call(dlg);
    release = hold(layer);
    // like showModal(): focus the first focusable thing in the dialog (the × button)
    (focusables(dlg)[0] || dlg).focus({ preventScroll: true });
    peelOff(from);
    // Paul, WP-18 item 14: no box comes out of the Details button any more; the letter appears from
    // nothing where it will lie (mid-screen) and unfolds in
    void origin;
    o.unfold.open({
      sheet: dlg,
      style: 'letter',
      appear: true,
      onFold: i => emit('details:fold', { i }),
      onFloat: () => emit('details:float', {}),
    });
    const r = dlg.getBoundingClientRect();
    openRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** @param {string} [returnValue] */
  function close(returnValue) {
    if (!dlg.open) return;
    // a sheet still unfolding stops where it is (its panels go)
    o.unfold.stop?.(dlg);
    // Paul, WP-17 item 27: the sheet burns away where it floats; the dim simply fades
    const dim = getComputedStyle(layer).backgroundColor;
    const burn = burnAway({ host: o.host, sheet: dlg, face: o.unfold.face, from: closeFrom, seed: current?.id ?? '', reduced: reduced(), dim });
    burnRun = burn;
    burn.done.then(() => { if (burnRun === burn) burnRun = null; });
    closeFrom = null;
    /** @type {any} */ (dlg).__vcUnfloat?.();
    emit('app:details-close', { ...(current ?? {}) });
    suppress++;
    nativeClose.call(dlg, returnValue);
    dlg.classList.remove('vc-unfolding', 'vc-inkin');
    layer.hidden = true;
    release?.(); release = null;
    const back = buttonFor();
    (back || trigger)?.focus({ preventScroll: true });
    settle(back);
    peeled = null;
    trigger = null;
  }

  Object.defineProperty(dlg, 'showModal', { configurable: true, value: open });
  Object.defineProperty(dlg, 'close', { configurable: true, value: close });

  // Escape closes, Tab stays inside
  layer.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); close(); return; }
    trapTab(e, dlg, dlg);
  });
  // fallback: Escape with focus lost to the body (e.g. after a click on the sheet's paper)
  document.addEventListener('keydown', e => {
    if (!dlg.open || layer.hidden || layer.contains(/** @type {Node} */ (e.target))) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); }
  });
  // a click outside the sheet closes (press and release both outside)
  let downOutside = false;
  layer.addEventListener('pointerdown', e => { downOutside = e.target === layer; });
  layer.addEventListener('click', e => { if (downOutside && e.target === layer) { closeFrom = { x: e.clientX, y: e.clientY }; close(); } downOutside = false; });

  return {
    layer,
    isOpen: () => dlg.open,
    open, close,
    read: () => ({ open: dlg.open, inLayer: dlg.parentElement === layer, ariaModal: dlg.getAttribute('aria-modal'), current, burning: !!burnRun }),
  };
}
