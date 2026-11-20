// @ts-check
/**
 * WP-03 three-step spotlight tour.
 *
 * Targets are found by `data-tour="load" | "board" | "stamps"`, in both modes. Several elements
 * may share a value (flat "stamps" = #metrics plus the table); the cut-out covers all the
 * visible ones. In flat mode: load = #loadTop, board = #categories (or #mobileCategory on
 * phones), stamps = #metrics + .tablewrap. WP-06 puts the same attributes on the desk proxies.
 *
 * Rules (WP-03 "Tour"):
 * - No Done, Finish or Skip button. A click anywhere advances; a click on step 3 ends.
 * - Escape ends from any step; → / Enter / Space advance; ← goes back.
 * - A transparent capture layer over the whole window swallows every click, so nothing
 *   underneath activates. The rest of the page is also `inert` (no focus, no keys).
 * - The slip is a role="dialog" beside the target (right, left, above; then below; then
 *   inside the window), with an arrow, and focus moves into it at each step.
 * - Flat mode dims the page to 35 % around a soft cut-out. Desk mode leaves the dimming to the
 *   lamp (WP-11), which listens to `tour:start`, `tour:step` and `tour:end`, or registers a
 *   renderer with `setTourRenderer()`.
 * - After the tour, focus returns to the How-to control (`[data-tour-anchor]`).
 *
 * Events: tour:start {mode}; tour:step {step, of, target, side}; tour:end {step, reason}
 * where reason is 'click' | 'key' | 'escape'.
 */
import { STRINGS } from '../strings.js';
import { emit } from '../bus.js';
import { runMode } from '../mode.js';
import { tour as cfg } from '../config/render.js';
import { placeSlip, unionBox, fitTarget } from './place.js';
import { hold, modalHost } from './modal.js';
import { vc } from '../debug.js';
import { clock } from '../util/clock.js';

/** @typedef {'load'|'board'|'stamps'} TourTarget */

/**
 * The three steps. Step 1 says "button" and step 2 "Pick a collection from the list." in flat.
 * @param {'desk'|'flat'} mode
 * @returns {{target: TourTarget, title: string, text: string}[]}
 */
export function tourSteps(mode) {
  const desk = mode === 'desk';
  return [
    { target: 'load', title: STRINGS.tour1Title, text: desk ? STRINGS.tour1Desk : STRINGS.tour1Flat },
    { target: 'board', title: STRINGS.tour2Title, text: desk ? STRINGS.tour2Desk : STRINGS.tour2Flat },
    { target: 'stamps', title: STRINGS.tour3Title, text: STRINGS.tour3 },
  ];
}

/** Flat-mode targets (DECISIONS point 26: attributes are added, nothing is renamed). */
function markFlatTargets() {
  const set = (/** @type {Element|null} */ el, /** @type {TourTarget} */ v) => el?.setAttribute('data-tour', v);
  set(document.getElementById('loadTop'), 'load');
  set(document.getElementById('categories'), 'board');
  set(document.getElementById('mobileCategory'), 'board');
  set(document.getElementById('metrics'), 'stamps');
  set(document.querySelector('#collectionView .tablewrap'), 'stamps');
}

/**
 * @typedef {object} TourRenderer  desk mode (WP-11): lights the tour instead of the CSS dim
 * @property {(steps: number) => void} [start]
 * @property {(step: number, target: TourTarget, box: import('./place.js').Box|null, elements: Element[]) => void} [step]
 * @property {() => void} [end]
 */
/** @type {TourRenderer|null} */
let renderer = null;
/** @param {TourRenderer|null} r */
export function setTourRenderer(r) { renderer = r; }

const visible = (/** @type {Element} */ el) => {
  if (!(el instanceof HTMLElement) || el.closest('[hidden], .hidden')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** @type {null | {i: number, steps: ReturnType<typeof tourSteps>, layer: HTMLElement, hole: HTMLElement, slip: HTMLElement|null, release: () => void, raf: null | (() => void)}} */
let run = null;

export const isRunning = () => !!run;
export const currentStep = () => (run ? run.i + 1 : 0);

/** Start the tour at step 1 (does nothing if it is already running). */
export function startTour() {
  if (run) return;
  markFlatTargets();
  const steps = tourSteps(runMode);
  const layer = document.createElement('div');
  layer.className = 'vc-tour vc-modal-root' + (runMode === 'desk' ? ' vc-tour--desk' : '');
  layer.setAttribute('data-vc-tour', '');
  layer.style.setProperty('--vc-tour-dim', String(1 - cfg.dimTo));
  layer.style.setProperty('--vc-tour-soft', cfg.cutoutSoftPx + 'px');
  layer.style.setProperty('--vc-tour-radius', cfg.cutoutRadiusPx + 'px');
  layer.style.setProperty('--vc-tour-move', cfg.moveMs + 'ms');
  layer.style.setProperty('--vc-slip-w', cfg.slipWidthPx + 'px');
  const hole = document.createElement('div');
  hole.className = 'vc-tour-hole';
  hole.setAttribute('aria-hidden', 'true');
  layer.append(hole);
  // The capture layer is a direct child of <body>, above everything. File 05 puts desk tour
  // slips in #float; WP-11 can move the slip there from its renderer's step() hook.
  modalHost().append(layer);

  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend']) {
    layer.addEventListener(type, swallow, { passive: false });
  }
  layer.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey, true);
  addEventListener('scroll', onMove, true);
  addEventListener('resize', onMove);

  run = { i: 0, steps, layer, hole, slip: null, release: hold(layer), raf: null };
  document.body.classList.add('vc-tour-open');
  emit('tour:start', { mode: runMode });
  renderer?.start?.(steps.length);
  show(0);
}

/** @param {Event} e */
function swallow(e) {
  e.stopPropagation();
  if (e.cancelable && e.type !== 'touchstart') e.preventDefault();
}

/** @param {MouseEvent} e */
function onClick(e) {
  e.preventDefault();
  e.stopPropagation();
  advance('click');
}

/** @param {KeyboardEvent} e */
function onKey(e) {
  if (!run) return;
  const k = e.key;
  if (k === 'Escape' || k === 'Esc') { stop(e); end('escape'); }
  else if (k === 'ArrowRight' || k === 'Enter' || k === ' ' || k === 'Spacebar') { stop(e); if (!e.repeat || k === 'ArrowRight') advance('key'); }
  else if (k === 'ArrowLeft') { stop(e); if (run.i > 0) show(run.i - 1); }
  else if (k === 'Tab') { stop(e); run.slip?.focus(); }
}
/** @param {Event} e */
function stop(e) { e.preventDefault(); e.stopPropagation(); }

/** @param {'click'|'key'} how */
function advance(how) {
  if (!run) return;
  if (run.i >= run.steps.length - 1) end(how);
  else show(run.i + 1);
}

/** Header height to keep clear, when the header sticks to the top of the window. */
function stickyTop() {
  const header = document.querySelector('header.top');
  if (!(header instanceof HTMLElement)) return 0;
  const pos = getComputedStyle(header).position;
  return pos === 'sticky' || pos === 'fixed' ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

/** @param {TourTarget} target */
function targetsFor(target) {
  return [...document.querySelectorAll(`[data-tour="${target}"]`)].filter(visible);
}

/** Scroll the target into the free part of the window if it isn't there yet. */
function bringIntoView(/** @type {Element[]} */ els) {
  if (!els.length || els.every(el => el.closest('header'))) return;
  const box = unionBox(els.map(el => el.getBoundingClientRect()));
  if (!box) return;
  const top = stickyTop(), h = innerHeight;
  if (box.top >= top + 8 && box.top <= top + (h - top) * 0.45) return;
  scrollBy({ top: box.top - top - Math.max(24, cfg.slipGapPx), left: 0, behavior: 'instant' });
}

/** Measure the target now. @param {Element[]} els */
function measure(els) {
  const raw = unionBox(els.map(el => el.getBoundingClientRect()));
  if (!raw) return null;
  const inHeader = els.every(el => el.closest('header'));
  const fitted = fitTarget(raw, { w: innerWidth, h: innerHeight }, inHeader ? 0 : stickyTop(), cfg.maxTargetShare);
  const p = cfg.cutoutPadPx;
  return { left: fitted.left - p, top: fitted.top - p, right: fitted.right + p, bottom: fitted.bottom + p };
}

/** @param {number} i  step index, 0-based */
function show(i) {
  if (!run) return;
  run.i = i;
  const step = run.steps[i];
  const els = targetsFor(step.target);
  bringIntoView(els);

  // A new slip each step: moving focus into it makes screen readers read the new step.
  run.slip?.remove();
  const slip = document.createElement('div');
  const id = 'vcTourStep' + (i + 1);
  slip.className = 'vc-slip vc-paper-slip';
  slip.setAttribute('role', 'dialog');
  slip.setAttribute('aria-modal', 'true');
  slip.setAttribute('aria-labelledby', id + 'Title');
  slip.setAttribute('aria-describedby', `${id}Count ${id}Text ${id}Hint`);
  slip.tabIndex = -1;
  slip.dataset.step = String(i + 1);
  slip.dataset.target = step.target;
  slip.innerHTML = `<p class="vc-slip-count" id="${id}Count"></p><h2 class="vc-slip-title" id="${id}Title"></h2><p class="vc-slip-text" id="${id}Text"></p><p class="vc-slip-hint" id="${id}Hint"></p>`;
  /** @type {HTMLElement} */ (slip.querySelector('.vc-slip-count')).textContent = STRINGS.tourStep.replace('{n}', String(i + 1)).replace('{total}', String(run.steps.length));
  /** @type {HTMLElement} */ (slip.querySelector('.vc-slip-title')).textContent = step.title;
  /** @type {HTMLElement} */ (slip.querySelector('.vc-slip-text')).textContent = step.text;
  /** @type {HTMLElement} */ (slip.querySelector('.vc-slip-hint')).textContent = STRINGS.tourHint;
  run.layer.append(slip);
  run.slip = slip;

  const box = layout();
  slip.focus({ preventScroll: true });
  emit('tour:step', { step: i + 1, of: run.steps.length, target: step.target, side: slip.dataset.side || 'none' });
  renderer?.step?.(i + 1, step.target, box, els);
}

/** Put the cut-out and the slip where they belong (each step, and on scroll or resize). */
function layout() {
  if (!run || !run.slip) return null;
  const { hole, slip } = run;
  const box = measure(targetsFor(run.steps[run.i].target));
  const view = { w: innerWidth, h: innerHeight };
  if (box) {
    Object.assign(hole.style, { left: box.left + 'px', top: box.top + 'px', width: (box.right - box.left) + 'px', height: (box.bottom - box.top) + 'px' });
    hole.classList.remove('vc-tour-hole--none');
  } else {
    Object.assign(hole.style, { left: view.w / 2 + 'px', top: view.h / 2 + 'px', width: '0px', height: '0px' });
    hole.classList.add('vc-tour-hole--none');
  }
  const size = { w: slip.offsetWidth, h: slip.offsetHeight };
  const opts = { gap: cfg.slipGapPx, margin: cfg.viewportMarginPx, arrowInset: cfg.arrowInsetPx };
  const at = box ? placeSlip(box, size, view, opts)
    : { x: Math.max(opts.margin, (view.w - size.w) / 2), y: Math.max(opts.margin, (view.h - size.h) / 2), side: /** @type {const} */ ('none'), arrow: 0 };
  slip.style.left = at.x + 'px';
  slip.style.top = at.y + 'px';
  slip.dataset.side = at.side;
  slip.style.setProperty('--vc-arrow', at.arrow + 'px');
  return box;
}

function onMove() {
  if (!run) return;
  // Resize and scroll (round 2, fix 4): lay out at once, in the event itself, with transitions
  // off, so the slip is already in its new on-screen place in the next frame; only step changes
  // glide. The snap class comes off one frame later.
  const { layer } = run;
  layer.classList.add('vc-tour--snap');
  layout();
  void layer.offsetWidth; // apply the new place while transitions are off
  run.raf?.();
  run.raf = clock.nextFrame(() => { if (run) { run.raf = null; layer.classList.remove('vc-tour--snap'); } });
}

/**
 * End the tour and give focus back to the How-to control.
 * @param {'click'|'key'|'escape'} reason
 */
export function end(reason = 'key') {
  if (!run) return;
  const r = run;
  run = null;
  r.raf?.();
  document.removeEventListener('keydown', onKey, true);
  removeEventListener('scroll', onMove, true);
  removeEventListener('resize', onMove);
  r.layer.remove();
  r.release();
  document.body.classList.remove('vc-tour-open');
  renderer?.end?.();
  emit('tour:end', { step: r.i + 1, reason });
  const anchor = [...document.querySelectorAll('[data-tour-anchor]')].find(visible) || document.querySelector('[data-tour-anchor]');
  if (anchor instanceof HTMLElement) anchor.focus();
}

markFlatTargets();

/** Test hook (additive, like `__vc.icons`). */
/** @type {any} */ (vc).tour = { start: startTour, end, isRunning, step: currentStep, steps: () => tourSteps(runMode) };
