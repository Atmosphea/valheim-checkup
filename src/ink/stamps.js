// @ts-check
/**
 * WP-10 steps 4 and 8: what a stamp is made of, drawn into the markup app.js writes.
 *
 * app.js (line 57, logged in docs/app-js-changes.md) writes per stamp:
 *   <div class="metric done" data-metric="done">
 *     <svg class="stamp-frame">           ← the inked ornate frame, filled in here
 *     <strong>59</strong>                  ← fmt() number or "—" (unchanged)
 *     <span>Completed</span>               ← label (unchanged)
 *     <div class="dots" data-dots="38" data-full="5" data-partial="0.36…">  ← DECISIONS 25
 *
 * Here: the frame's paths (sized to the stamp so strokes never stretch) and the dot cells
 * (rows of 10, centred; filled, partial or inked outline). Both modes use this.
 */
import { stamp as MS } from '../config/motion.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * The four stamps in landing order (DECISIONS 25 names). Paul, WP-17 item 9: Undiscovered and
 * Unverified swapped places on the page (ink.css `order`), so they land left to right as shown.
 */
export const METRICS = /** @type {const} */ (['done', 'missing', 'discovered', 'unknown']);

/**
 * Ornate frame paths for a w × h px box: a heavy outer rule with notched corners, a fine inner
 * rule, and small flourishes in each corner.
 * @param {number} w @param {number} h
 */
export function framePaths(w, h) {
  const k = Math.max(0.6, Math.min(w, h) / 80); // scale ornaments with the stamp
  const o = 1.6 * k, n = 5.5 * k;              // outer inset, corner notch
  const i = 4.2 * k;                           // inner rule inset
  const f = (/** @type {number} */ v) => v.toFixed(2);
  // outer: rectangle with concave (notched) corners
  const outer = `M${f(o + n)} ${f(o)} H${f(w - o - n)} A${f(n)} ${f(n)} 0 0 0 ${f(w - o)} ${f(o + n)} V${f(h - o - n)} A${f(n)} ${f(n)} 0 0 0 ${f(w - o - n)} ${f(h - o)} H${f(o + n)} A${f(n)} ${f(n)} 0 0 0 ${f(o)} ${f(h - o - n)} V${f(o + n)} A${f(n)} ${f(n)} 0 0 0 ${f(o + n)} ${f(o)} Z`;
  const inner = `M${f(i)} ${f(i)} H${f(w - i)} V${f(h - i)} H${f(i)} Z`;
  // corner flourishes: a small diamond on each inner corner and a curl along each edge
  let orn = '';
  const d = 1.5 * k, c = 7 * k;
  for (const [x, y, sx, sy] of [[i, i, 1, 1], [w - i, i, -1, 1], [w - i, h - i, -1, -1], [i, h - i, 1, -1]]) {
    orn += `M${f(x)} ${f(y - d * sy)} L${f(x + d * sx)} ${f(y)} L${f(x)} ${f(y + d * sy)} L${f(x - d * sx)} ${f(y)} Z `;
    orn += `M${f(x + 2.2 * d * sx)} ${f(y + 0.9 * d * sy)} q${f(c * 0.5 * sx)} ${f(c * 0.35 * sy)} ${f(c * sx)} 0 `;
    orn += `M${f(x + 0.9 * d * sx)} ${f(y + 2.2 * d * sy)} q${f(c * 0.35 * sx)} ${f(c * 0.5 * sy)} 0 ${f(c * sy)} `;
  }
  return { outer, inner, orn, k };
}

/**
 * WP-14: stamp sizes come from a ResizeObserver, so drawing a frame never forces a layout (on a
 * view change every stamp's offsetWidth was read before the app had rendered: a second full
 * layout inside the click). The observer runs after layout and before paint, so a frame whose
 * size is not known yet, or has changed, is still drawn in the same frame.
 */
/** @type {WeakMap<Element, [number, number]>} */ const sizes = new WeakMap();
/** @type {ResizeObserver | null} */ let watcher = null;
/** @param {HTMLElement} host @returns {[number, number] | null} */
function sizeOf(host) {
  const known = sizes.get(host);
  if (known) return known;
  if (typeof ResizeObserver !== 'function') return [host.offsetWidth, host.offsetHeight];
  watcher ??= new ResizeObserver(entries => {
    for (const e of entries) {
      const t = /** @type {HTMLElement} */ (e.target), b = e.borderBoxSize?.[0];
      sizes.set(t, b ? [Math.round(b.inlineSize), Math.round(b.blockSize)] : [t.offsetWidth, t.offsetHeight]);
      const svg = t.querySelector(':scope > svg.stamp-frame');
      if (svg) drawFrame(/** @type {SVGSVGElement} */ (svg));
    }
  });
  watcher.observe(host);
  return null;
}

/** Fill one stamp's frame svg to its current size. @param {SVGSVGElement} svg */
export function drawFrame(svg) {
  const host = /** @type {HTMLElement} */ (svg.parentElement);
  const size = host ? sizeOf(host) : null;
  if (!size) return false;
  const [w, h] = size;
  if (!w || !h) return false;
  const key = `${w}x${h}`;
  if (svg.dataset.size === key) return true;
  svg.dataset.size = key;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  const p = framePaths(w, h);
  svg.innerHTML = '';
  const add = (/** @type {string} */ d, /** @type {number} */ sw, /** @type {string} */ fill = 'none') => {
    const e = document.createElementNS(NS, 'path');
    e.setAttribute('d', d); e.setAttribute('fill', fill);
    e.setAttribute('stroke', 'currentColor'); e.setAttribute('stroke-width', sw.toFixed(2));
    e.setAttribute('stroke-linejoin', 'round'); e.setAttribute('stroke-linecap', 'round');
    svg.append(e);
  };
  add(p.outer, 1.9 * p.k);
  add(p.inner, 0.6 * p.k);
  add(p.orn, 0.7 * p.k);
  return true;
}

/**
 * Dot-grid model for one grid element (file 07 rule via the DECISIONS 25 attributes).
 * @param {HTMLElement} grid
 * @returns {{ dots: number, full: number, partial: number, drawn: number[] } | null}
 *   drawn: per dot, the ink drawn (1 full, partial ≥ 25 %, 0 outline)
 */
export function gridModel(grid) {
  if (!grid.hasAttribute('data-dots')) return null;
  const dots = +(grid.dataset.dots ?? 0), full = +(grid.dataset.full ?? 0), partial = +(grid.dataset.partial ?? 0);
  const drawn = [];
  for (let i = 0; i < dots; i++) drawn.push(i < full ? 1 : i === full && partial > 0 ? Math.max(MS.dotPartialMin, partial) : 0);
  return { dots, full, partial, drawn };
}

/**
 * Paul, WP-18 item 13 (correcting WP-17 item 9): where each dot of the model goes in the grid.
 * Every stamp uses Completed's layout (rows of 10 from the top left); the model's dots (filled
 * ones first, in the order they ink in) are placed so that:
 *   done (Completed)         filled from the first circle on, inking forwards
 *   missing                  Completed with filled and hollow reversed: hollow first, the filled
 *                            run at the end, inking forwards along it
 *   discovered (Undiscovered) the same look as Missing, but inking from the last circle backwards
 *   unknown (Unverified)     also from the last circle, backwards
 * Returns cell index per model index.
 * @param {string} metric @param {{dots: number, drawn: number[]}} model
 */
export function dotOrder(metric, model) {
  const n = model.dots, order = new Array(n);
  if (metric === 'missing') {
    const filled = model.drawn.filter(f => f > 0).length;
    for (let j = 0; j < n; j++) order[j] = j < filled ? n - filled + j : j - filled;
  } else if (metric === 'discovered' || metric === 'unknown') {
    for (let j = 0; j < n; j++) order[j] = n - 1 - j;
  } else for (let j = 0; j < n; j++) order[j] = j;
  return order;
}
/** The stamp's metric for a dot grid. @param {HTMLElement} grid */
export const metricOf = grid => /** @type {HTMLElement|null} */ (grid.closest('[data-metric]'))?.dataset.metric ?? '';

/**
 * Build the dot cells inside a grid (once per render). Each cell: <span class="dot"><i></i></span>,
 * its ink in `--f` (0 … 1) on the cell. `filled` = how many leading dots show their ink now.
 * @param {HTMLElement} grid @param {number} [filled]
 */
export function buildDots(grid, filled = Infinity) {
  const m = gridModel(grid);
  if (!m) { grid.textContent = ''; return null; }
  if (grid.childElementCount !== m.dots) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < m.dots; i++) {
      const s = document.createElement('span');
      s.className = 'dot';
      s.append(document.createElement('i'));
      frag.append(s);
    }
    grid.textContent = '';
    grid.append(frag);
  }
  const cells = /** @type {HTMLElement[]} */ ([...grid.children]);
  const order = dotOrder(metricOf(grid), m); // WP-18 item 13
  order.forEach((ci, j) => setDot(cells[ci], j < filled ? m.drawn[j] : 0));
  return m;
}

/** @param {HTMLElement} cell @param {number} f */
export function setDot(cell, f) {
  cell.style.setProperty('--f', f.toFixed(3));
  cell.classList.toggle('on', f > 0);
}
