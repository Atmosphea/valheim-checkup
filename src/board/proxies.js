// @ts-check
/**
 * The board's and coins' invisible HTML proxies (WP-06, file 01 Accessibility, DECISIONS 26–28).
 *
 * The original elements move into #print, laid exactly over their 3D objects, invisible but
 * focusable, with their original ids, classes, text, data-category and aria-current:
 *
 *   aside.sidebar (whole)  → over the board: #overall over the plaque (its ⓘ proxy carries the
 *                            original tooltip, P12), the headings and side note over their
 *                            carvings, every button.category over its bar (it follows the bar)
 *   #howTo, #loadTop, #importProgress, #exportProgress → over their coins
 *   a new Sound button     → over the Sound coin (last in the tab order, DECISIONS point 27)
 *
 * Bars: roving tabindex (Up / Down / Home / End move between the 13 bars). A mouse click with
 * no drag only nudges (DECISIONS point 28): every click that follows a pointerdown on a bar is
 * stopped before #categories. Keyboard activation and programmatic .click() go to `activate`.
 * The board's own selection is let through with `selectThrough(category)`.
 */
import { board as B, woodblock as WB, coins as LC, coinSpec } from '../config/layout.js';
import { print as PR } from '../config/render.js';
import { STRINGS } from '../strings.js';
import { rows, plaque } from './layout.js';
import { clock } from '../util/clock.js';

const PX = PR.pxPerCm;

/**
 * @param {object} o
 * @param {(el: HTMLElement, rect: {x0: number, y0: number, w: number, h: number, z?: number}) => any} o.addPrinted
 * @param {(cx: number, cy: number) => number | null} o.boardX     client px → board x (cm) on the bars' plane
 * @param {(cx: number, cy: number) => {x: number, y: number} | null} o.paperAt  client px → desk point (cm)
 * @param {{ press(i: number, x: number): boolean, move(i: number, x: number): void, release(i: number): string, cancel(i: number): void, activate(i: number): string, hover(i: number, on: boolean): void }} o.bars
 * @param {{ hover(id: string, x: number, y: number): void, press(id: string, down: boolean): void, focus(id: string, on: boolean): void, click(id: string): void }} o.coins
 * @param {(i: number, on: boolean) => void} o.barFocus
 */
export function createProxies(o) {
  const rowList = rows();
  const index = new Map(rowList.map(r => [r.category, r.index]));
  const byId = (/** @type {string} */ id) => /** @type {HTMLElement|null} */ (document.getElementById(id));

  // ── Coins ────────────────────────────────────────────────────────────────────────────
  /** @type {Map<string, HTMLElement>} */
  const coinButtons = new Map();
  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.id = 'vcSound';
  soundButton.textContent = STRINGS.soundCoin;
  soundButton.setAttribute('aria-pressed', 'true');
  const coinEls = { howto: byId('howTo'), load: byId('loadTop'), import: byId('importProgress'), export: byId('exportProgress'), sound: soundButton };
  /** @type {any[]} */
  const objects = [];
  for (const c of LC) {
    const el = coinEls[/** @type {keyof typeof coinEls} */ (c.id)];
    if (!el) continue;
    const spec = coinSpec[/** @type {keyof typeof coinSpec} */ (c.id)];
    if (c.id === 'sound') continue; // added last, after the board (tab order)
    objects.push(placeCoin(c.id, el, c, spec));
  }

  /** @param {string} id @param {HTMLElement} el @param {{x: number, y: number}} c @param {{r: number, t: number}} spec */
  function placeCoin(id, el, c, spec) {
    const wrap = document.createElement('div');
    wrap.className = 'vc-coin-print';
    wrap.dataset.coin = id;
    el.classList.add('vc-coin-proxy');
    wrap.append(el);
    coinButtons.set(id, el);
    // Paul, WP-18 item 8: hover is the board's per-frame round hit test now (board/index.js), not pointerenter
    el.addEventListener('pointerdown', e => { if (e.button === 0) o.coins.press(id, true); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(t, () => o.coins.press(id, false));
    el.addEventListener('click', () => o.coins.click(id));
    el.addEventListener('focus', () => o.coins.focus(id, el.matches(':focus-visible')));
    el.addEventListener('blur', () => o.coins.focus(id, false));
    return o.addPrinted(wrap, { x0: c.x - spec.r, y0: c.y - spec.r, w: spec.r * 2, h: spec.r * 2, z: spec.t + 0.02 });
  }

  // ── Board ────────────────────────────────────────────────────────────────────────────
  const sidebar = /** @type {HTMLElement} */ (document.querySelector('aside.sidebar'));
  const boardEl = document.createElement('div');
  boardEl.className = 'vc-board-print';
  boardEl.append(sidebar);
  sidebar.classList.add('vc-board-proxies');
  const px = (/** @type {number} */ cm) => `${(cm * PX).toFixed(2)}px`;
  /** Place an element over a board rectangle (board cm). @param {HTMLElement|null} el @param {{x0: number, x1: number, y0: number, y1: number}} r */
  const place = (el, r) => {
    if (!el) return;
    Object.assign(el.style, { position: 'absolute', left: px(r.x0), top: px(B.height - r.y1), width: px(r.x1 - r.x0), height: px(r.y1 - r.y0) });
  };
  const P = plaque();
  place(byId('overall'), P.rect);
  // WP-16: over the burned labels (heading on the top band, side note under the last slot)
  place(/** @type {HTMLElement|null} */ (sidebar.querySelector(':scope > .eyebrow:not(.insights-label)')), { x0: B.fieldX0, x1: B.fieldX1, y0: B.headingY - B.headingCap, y1: B.headingY + B.headingCap });
  const dividerTop = B.height - B.header - B.dividerCell * B.pitch;
  place(/** @type {HTMLElement|null} */ (sidebar.querySelector(':scope > .insights-label')), { x0: B.fieldX0, x1: B.fieldX1, y0: dividerTop - B.pitch, y1: dividerTop });
  place(/** @type {HTMLElement|null} */ (sidebar.querySelector(':scope > .side-note')), { x0: B.fieldX0, x1: B.fieldX1, y0: B.sideNoteY[1] - B.sideNoteCap * 1.2, y1: B.sideNoteY[0] + B.sideNoteCap * 1.4 });
  const boardObj = o.addPrinted(boardEl, { x0: WB.x0, y0: WB.y0, w: B.width, h: B.height, z: B.thickness });
  objects.push(boardObj);
  // the Sound coin comes last in the tab order (DECISIONS point 27)
  const sc = LC.find(c => c.id === 'sound');
  if (sc) objects.push(placeCoin('sound', soundButton, sc, coinSpec.sound));

  const barButtons = () => /** @type {HTMLButtonElement[]} */ ([...sidebar.querySelectorAll('#categories [data-category], #insightNav [data-category]')]);
  /** Last positions written, to skip unchanged style writes. */
  const shown = new Map();
  /** The bar that carries tabindex 0 (roving). */
  let rover = /** @type {string|null} */ (null);
  /** Focus to restore after the app re-renders the buttons. */
  let focused = /** @type {string|null} */ (null);
  /** Last pointerdown on each bar (ms, performance.now) — its click is a mouse click. */
  const downAt = new Map();
  let allowClick = false;

  function layoutBars() {
    const current = barButtons().find(b => b.getAttribute('aria-current') === 'page')?.dataset.category ?? null;
    if (!rover || !index.has(rover)) rover = current ?? rowList[0].category;
    for (const b of barButtons()) {
      const cat = b.dataset.category ?? '';
      const r = rowList[index.get(cat) ?? -1];
      if (!r) continue;
      b.classList.add('vc-bar-proxy');
      b.tabIndex = cat === rover ? 0 : -1;
      if (!b.style.left) {
        Object.assign(b.style, { position: 'absolute', left: px(r.barRestX0), top: px(B.height - r.groove.y1), width: px(B.bar.length + B.knob.length), height: px(B.groove.height) });
        shown.delete(cat);
      }
    }
    if (focused && (document.activeElement === document.body || !document.activeElement)) {
      // WP-18P: at the start of the next frame, while layout is clean: focus() here, right after
      // app.js re-rendered the whole view, restyled it in the middle of the bar's release
      const cat = focused;
      clock.nextRead(() => {
        if (document.activeElement !== document.body && document.activeElement) return;
        barButtons().find(x => x.dataset.category === cat)?.focus({ preventScroll: true });
      });
    }
  }
  layoutBars();
  // app.js rebuilds #categories on every render: re-apply positions, tabindex and focus
  const mo = new MutationObserver(layoutBars);
  mo.observe(sidebar, { childList: true, subtree: true });

  /** @param {Element|null} t */
  const barOf = t => /** @type {HTMLElement|null} */ (t instanceof Element ? t.closest('#categories [data-category], #insightNav [data-category]') : null);
  const idxOf = (/** @type {HTMLElement} */ b) => index.get(b.dataset.category ?? '') ?? -1;

  // pointer: drag along the slot with capture
  let dragging = -1, dragId = -1;
  sidebar.addEventListener('pointerdown', e => {
    const b = barOf(/** @type {Element} */ (e.target));
    if (!b || e.button !== 0) return;
    const i = idxOf(b);
    downAt.set(i, performance.now());
    const x = o.boardX(e.clientX, e.clientY);
    if (x === null || !o.bars.press(i, x)) return;
    dragging = i; dragId = e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  const onMove = (/** @type {PointerEvent} */ e) => {
    if (dragging < 0 || e.pointerId !== dragId) return;
    const x = o.boardX(e.clientX, e.clientY);
    if (x !== null) o.bars.move(dragging, x);
  };
  const onUp = (/** @type {PointerEvent} */ e) => {
    if (dragging < 0 || e.pointerId !== dragId) return;
    const i = dragging; dragging = -1;
    if (e.type === 'pointerup') { onMove(e); o.bars.release(i); } else o.bars.cancel(i);
  };
  sidebar.addEventListener('pointermove', onMove);
  sidebar.addEventListener('pointerup', onUp);
  sidebar.addEventListener('pointercancel', onUp);
  // the app re-rendering the button mid-drag loses the capture: treat it as a cancel
  sidebar.addEventListener('lostpointercapture', e => { if (dragging >= 0 && e.pointerId === dragId) { const i = dragging; dragging = -1; o.bars.cancel(i); } });
  window.addEventListener('pointerup', onUp, true);
  sidebar.addEventListener('pointerover', e => { const b = barOf(/** @type {Element} */ (e.target)); if (b && dragging < 0) o.bars.hover(idxOf(b), true); });
  sidebar.addEventListener('pointerout', e => { const b = barOf(/** @type {Element} */ (e.target)); if (b && !b.contains(/** @type {Node} */ (e.relatedTarget))) o.bars.hover(idxOf(b), false); });

  // clicks: mouse clicks never reach #categories; keyboard and programmatic clicks slide the bar
  boardEl.addEventListener('click', e => {
    const b = barOf(/** @type {Element} */ (e.target));
    if (!b || allowClick) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const i = idxOf(b);
    const t = downAt.get(i);
    downAt.delete(i);
    if (t !== undefined && performance.now() - t < 2000) return; // a mouse click: the pointer logic handled it
    o.bars.activate(i);
  }, true);

  // keyboard: roving tabindex across all 13 bars
  sidebar.addEventListener('keydown', e => {
    const b = barOf(/** @type {Element} */ (e.target));
    if (!b) return;
    const list = barButtons();
    const i = list.indexOf(/** @type {HTMLButtonElement} */ (b));
    let j = -1;
    // WP-07: ↑/↓ wrap around the ends, so the keyboard reaches every bar from the current one (P39)
    if (e.key === 'ArrowDown') j = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j < 0) return;
    e.preventDefault();
    rover = list[j].dataset.category ?? rover;
    for (const x of list) x.tabIndex = x === list[j] ? 0 : -1;
    list[j].focus({ preventScroll: true });
  });
  sidebar.addEventListener('focusin', e => {
    const b = barOf(/** @type {Element} */ (e.target));
    if (!b) return;
    focused = b.dataset.category ?? null;
    rover = focused;
    for (const x of barButtons()) x.tabIndex = x === b ? 0 : -1;
    o.barFocus(idxOf(b), b.matches(':focus-visible'));
  });
  sidebar.addEventListener('focusout', e => {
    const b = barOf(/** @type {Element} */ (e.target));
    if (!b) return;
    o.barFocus(idxOf(b), false);
    // keep `focused` if the app is about to replace the button (re-render); forget it otherwise
    setTimeout(() => { if (!barOf(document.activeElement) && document.activeElement !== document.body) focused = null; }, 0);
  });

  return {
    soundButton,
    coinButtons,
    boardEl,
    objects,
    /**
     * Let the board's own selection through to app.js (setCategory). WP-14: in a task of its
     * own, not inside the frame that latched the bar: the app's render and the scene's frame
     * together went over the 100 ms long-task budget. The latched bar already owns the view
     * by then, so the app's `app:category` echo doesn't move it again (mechanism.sync).
     * @param {string} category
     */
    selectThrough(category) {
      setTimeout(() => {
        const b = barButtons().find(x => x.dataset.category === category);
        if (!b) return;
        allowClick = true;
        // Paul, WP-17 item 10b: ink takes its ghost only for the click that goes through (it skips
        // the board's stopped mouse clicks, which used to cost a second ~20 ms snapshot)
        boardEl.dataset.through = '1';
        try { b.click(); } finally { allowClick = false; delete boardEl.dataset.through; }
      }, 0);
    },
    /** Move each bar's proxy with its bar. @param {(i: number) => number} offsetCm travel offset (cm, right positive since WP-16) */
    follow(offsetCm) {
      for (const b of barButtons()) {
        const i = idxOf(b);
        if (i < 0) continue;
        const dx = offsetCm(i) * PX;
        const cat = b.dataset.category ?? '';
        if (Math.abs((shown.get(cat) ?? 1e9) - dx) < 0.5) continue;
        shown.set(cat, dx);
        b.style.transform = `translateX(${dx.toFixed(1)}px)`;
      }
    },
    dispose() { mo.disconnect(); window.removeEventListener('pointerup', onUp, true); },
  };
}
