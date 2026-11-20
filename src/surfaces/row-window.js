// @ts-check
/**
 * WP-18P: the table's paint window (desk only).
 *
 * The printed page sits under a 3D transform, so the browser can't tell which part of the table's
 * scroll box is on screen and paints all of it: every row's icon, with its sepia filter and
 * multiply blend, for all 400 rows of The Carpenter, in every frame that repaints the page
 * (a wash, a burn, a stamp). This keeps the icons of rows far outside the scroll box's view from
 * painting (`.vc-far` → `visibility: hidden` on the icon only, desk.css).
 *
 * Every row stays in the DOM with all its text, attributes and handlers: parity, the census and
 * the exports read the same page as before. The window is the visible box plus one box height
 * above and below, so a fast scroll never shows a missing icon; the class follows within the
 * frame of the scroll (the measurement is in the clock's read phase, the class write in the next
 * write phase, both before that frame paints).
 *
 * Debug: `__vc.surfaces.rowWindow.read()`.
 */
import { on } from '../bus.js';
import { clock } from '../util/clock.js';

/** Overscan above and below the visible box, in box heights. */
const OVERSCAN = 1;

export function attachRowWindow() {
  /** @type {HTMLElement|null} */ let bound = null;
  let dirty = true, passes = 0;
  let farCount = 0;
  /** @type {{first: number, last: number, rows: number}} */
  let last = { first: -1, last: -1, rows: 0 };
  const mark = () => { dirty = true; };
  for (const t of ['app:render', 'app:category', 'app:load', 'rows:burn', 'rows:height']) on(t, mark);
  addEventListener('resize', mark, { passive: true });

  clock.onRead(() => {
    const w = /** @type {HTMLElement|null} */ (document.querySelector('#print #collectionView .tablewrap'));
    if (w !== bound) { bound?.removeEventListener('scroll', mark); w?.addEventListener('scroll', mark, { passive: true }); bound = w; dirty = true; }
    if (!dirty || !w || !document.body.classList.contains('mode-desk')) return;
    dirty = false; passes++;
    const table = /** @type {HTMLElement|null} */ (w.querySelector('table'));
    const rows = /** @type {HTMLElement[]} */ ([...w.querySelectorAll('#items > tr')]);
    if (!table || !rows.length) { last = { first: -1, last: -1, rows: 0 }; farCount = 0; return; }
    // layout px inside the scroll box's content (offsets: the 3D transform doesn't touch them)
    const base = table.offsetParent === w ? table.offsetTop : table.offsetTop - w.offsetTop;
    const h = w.clientHeight, lo = w.scrollTop - h * OVERSCAN, hi = w.scrollTop + h * (1 + OVERSCAN);
    // rows are in document order, so their tops only grow: binary search both ends
    const top = (/** @type {number} */ i) => base + rows[i].offsetTop;
    let a = 0, b = rows.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (top(m) + rows[m].offsetHeight > lo) b = m; else a = m + 1; }
    const first = a;
    a = first; b = rows.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (top(m) < hi) a = m; else b = m - 1; }
    const lastRow = a;
    last = { first, last: lastRow, rows: rows.length };
    farCount = rows.length - (lastRow - first + 1);
    want = { rows, first, last: lastRow };
  });
  // the class writes, in the write phase of the same frame, only where a row's state changes
  /** @type {null | {rows: HTMLElement[], first: number, last: number}} */
  let want = null;
  clock.onFrame(() => {
    if (!want) return;
    const { rows, first, last: l } = want; want = null;
    for (let i = 0; i < rows.length; i++) {
      const far = i < first || i > l;
      if (rows[i].classList.contains('vc-far') !== far) rows[i].classList.toggle('vc-far', far);
    }
  });

  return { read: () => ({ ...last, far: farCount, passes }), refresh: mark };
}
