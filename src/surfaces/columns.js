// @ts-check
/**
 * WP-16C · resizable table columns (Paul, WP-16 item 28), desk and flat.
 *
 * Each column heading but the last gets a grip on its right edge (aria-hidden: a pointer-only
 * convenience; the table reads the same without it). Dragging a grip moves the edge between that
 * column and the next one: the one grows by what the other gives up, so the table keeps its width.
 * The first drag switches the table to a fixed layout with every column's current width.
 *
 * The widths are remembered per viewer in this browser (localStorage, every access in try/catch):
 * key `valheim-checkup:vc-column-widths`, a list of layout px per column. Nothing is stored until
 * someone resizes a column, so the app's own storage is unchanged otherwise. Double-click a grip
 * to go back to the automatic widths (and forget the stored ones).
 *
 * On the desk the table is printed on a sheet seen in perspective: a pointer move in screen px is
 * turned into the sheet's layout px with the heading's own on-screen scale.
 */
import { emit } from '../bus.js';

export const COLUMN_KEY = 'valheim-checkup:vc-column-widths';
const MIN_PX = 34;

/** @returns {number[] | null} */
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(COLUMN_KEY) || 'null');
    return Array.isArray(v) && v.every(n => typeof n === 'number' && n >= 0 && n < 5000) ? v : null;
  } catch { return null; }
}
/** @param {number[] | null} w */
function save(w) {
  try { if (w) localStorage.setItem(COLUMN_KEY, JSON.stringify(w.map(n => Math.round(n)))); else localStorage.removeItem(COLUMN_KEY); } catch { /* storage blocked: widths last for this visit only */ }
}

export function attachColumns() {
  const table = /** @type {HTMLTableElement|null} */ (document.querySelector('.tablewrap table'));
  const row = table?.tHead?.rows[0];
  if (!table || !row) return null;
  const ths = /** @type {HTMLTableCellElement[]} */ ([...row.cells]);
  let fixed = false;

  /** Widths as laid out now (0 for a hidden column). */
  const current = () => ths.map(th => th.offsetWidth);
  /** @param {number[]} w */
  function apply(w) {
    fixed = true;
    table.classList.add('vc-cols-fixed');
    ths.forEach((th, i) => { if (w[i] > 0) th.style.width = w[i] + 'px'; });
  }
  function reset() {
    fixed = false;
    table.classList.remove('vc-cols-fixed');
    for (const th of ths) th.style.width = '';
    save(null);
  }

  const stored = load();
  if (stored && stored.length === ths.length) apply(stored);

  ths.forEach((th, i) => {
    if (i === ths.length - 1) return;
    const grip = document.createElement('span');
    grip.className = 'vc-col-grip';
    grip.setAttribute('aria-hidden', 'true');
    th.append(grip);
    grip.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); reset(); emit('table:columns', { reset: true }); });
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // the next column that is shown gives up what this one takes
      let j = i + 1;
      while (j < ths.length && !ths[j].offsetWidth) j++;
      if (j >= ths.length) return;
      const start = current();
      if (!fixed) apply(start);
      const scale = th.offsetWidth / Math.max(1, th.getBoundingClientRect().width);
      const x0 = e.clientX;
      grip.setPointerCapture?.(e.pointerId);
      grip.classList.add('vc-col-grip--active');
      document.body.classList.add('vc-col-resizing');
      let w = start.slice();
      const move = (/** @type {PointerEvent} */ ev) => {
        const total = start[i] + start[j];
        const a = Math.max(MIN_PX, Math.min(total - MIN_PX, start[i] + (ev.clientX - x0) * scale));
        w = start.slice(); w[i] = a; w[j] = total - a;
        ths[i].style.width = a + 'px'; ths[j].style.width = (total - a) + 'px';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        grip.classList.remove('vc-col-grip--active');
        document.body.classList.remove('vc-col-resizing');
        save(w);
        emit('table:columns', { widths: w.map(n => Math.round(n)) });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  });

  return {
    read: () => ({ fixed, widths: current(), stored: load() }),
    reset,
  };
}
