// @ts-check
/**
 * Paul, WP-18 item 12: letting go of the row-height slider rescales everything in the table's
 * rows together (text, item icons, stars and buttons), with a burn-away and a burn-in.
 *
 *   scale     `--vc-row-k` on <html> = row scale ÷ the default (1.3); desk.css gives the table body
 *             its own `--cm` (the sheet's × k), so every cm-based size in the rows follows, while the
 *             row height keeps reading the sheet's own cm × the slider (no double scaling).
 *             During a drag only the row height moves (WP-17 item 17); the content follows on release.
 *   burn      an SVG filter on the table's scroll box while it runs (only the visible box is drawn):
 *             a burn map (soft blobs rising from the bottom, baked once into an image) is
 *             thresholded; the printed rows vanish behind a glowing ember edge with a charred band
 *             ahead of it (burn-away), the new size is applied with the same row kept at the top,
 *             then the threshold runs back and the rows appear through the same edge (burn-in).
 *
 * Desk only (the slider is on the woodblock). Keyboard steps commit 350 ms after the last key.
 * Debug: `__vc.surfaces.rowBurn.read()`.
 */
import { on, emit } from '../bus.js';
import { clock } from '../util/clock.js';
import { board as B } from '../config/layout.js';
import { rowBurn as MR } from '../config/motion.js';

const S = B.rowSlider;
const NS = 'http://www.w3.org/2000/svg';
const ID = 'vc-row-burn';
const MAP_MAX = 0.85;

/** The burn map: smooth blobs (value noise, 4 octaves) plus a rise from the bottom, in R. */
function burnMap() {
  const W = 192, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return '';
  // fixed lattice noise (no randomness from the page's seeded streams: same map every time)
  const hash = (/** @type {number} */ x, /** @type {number} */ y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (/** @type {number} */ t) => t * t * (3 - 2 * t);
  const noise = (/** @type {number} */ x, /** @type {number} */ y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c2 = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * fx + (c2 - a) * fy + (a - b - c2 + d) * fx * fy;
  };
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0, amp = 0.5, f = 1 / 22;
    for (let o = 0; o < 4; o++) { v += amp * noise(x * f, y * f * 1.3); amp *= 0.5; f *= 2.1; }
    // burns from the bottom up: the map is low at the bottom (0 burns first, 1 last)
    const rise = 1 - y / (H - 1);
    // rows' map tops out at MAP_MAX: the heading above it is held at 1 and never burns
    const n = MAP_MAX * Math.max(0, Math.min(1, 0.58 * v / 0.94 + 0.42 * rise));
    const k = (y * W + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(n * 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * The filter: `keep` = map above the threshold (hard), `ember` = a thin band just below it,
 * `char` = a wider band above it, where the ink goes black before it burns.
 * Thresholds are written per frame into the transfer functions' slope / intercept.
 */
function buildFilter() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', overflow: 'hidden' });
  svg.innerHTML = `<filter id="${ID}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
 <feFlood flood-color="#fff" result="white" />
    <feImage result="img" preserveAspectRatio="none" />
    <feMerge result="map"><feMergeNode in="white" /><feMergeNode in="img" /></feMerge>
    <feColorMatrix in="map" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="m" />
    <feComponentTransfer in="m" result="keep"><feFuncA data-k="keep" type="linear" slope="40" intercept="0" /></feComponentTransfer>
    <feComponentTransfer in="m" result="soft"><feFuncA data-k="soft" type="linear" slope="40" intercept="0" /></feComponentTransfer>
    <feComponentTransfer in="m" result="charA"><feFuncA data-k="char" type="linear" slope="40" intercept="0" /></feComponentTransfer>
    <feComposite in="soft" in2="keep" operator="arithmetic" k2="1" k3="-1" result="band" />
    <feComposite in="keep" in2="charA" operator="arithmetic" k2="1" k3="-1" result="charBand" />
    <feComposite in="SourceGraphic" in2="keep" operator="in" result="kept" />
    <feComposite in="SourceAlpha" in2="charBand" operator="in" result="charMask" />
    <feFlood flood-color="${MR.charColor}" result="charInk" />
    <feComposite in="charInk" in2="charMask" operator="in" result="charred" />
    <feComposite in="SourceAlpha" in2="band" operator="in" result="emberMask" />
    <feMorphology in="emberMask" operator="dilate" radius="0.8" result="emberWide" />
    <feFlood flood-color="${MR.emberColor}" result="emberInk" />
    <feComposite in="emberInk" in2="emberWide" operator="in" result="ember" />
    <feGaussianBlur in="ember" stdDeviation="${MR.glowPx}" result="glow" />
    <feMerge><feMergeNode in="kept" /><feMergeNode in="charred" /><feMergeNode in="glow" /><feMergeNode in="ember" /></feMerge>
  </filter>`;
  document.body.append(svg);
  const fe = /** @type {SVGFEImageElement} */ (svg.querySelector('feImage'));
  const url = burnMap();
  if (url) { fe.setAttribute('href', url); fe.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url); }
  const fn = (/** @type {string} */ k) => /** @type {SVGElement} */ (svg.querySelector(`[data-k="${k}"]`));
  return { svg, img: fe, keep: fn('keep'), soft: fn('soft'), char: fn('char') };
}

/** Set a step at threshold t (alpha = clamp((m − t) × slope)). @param {SVGElement} f @param {number} t @param {number} slope */
function step(f, t, slope) {
  f.setAttribute('slope', String(slope));
  f.setAttribute('intercept', (-t * slope).toFixed(4));
}

/** @param {{ isDesk: () => boolean }} o */
export function attachRowBurn(o) {
  const wrap = () => /** @type {HTMLElement|null} */ (document.querySelector('#collectionView .tablewrap'));
  /** @type {ReturnType<typeof buildFilter> | null} */
  let F = null;
  let applied = Number(getComputedStyle(document.documentElement).getPropertyValue('--vc-row-k')) || 1;
  /** @type {{ t0: number, from: number, to: number, swapped: boolean, anchor: {row: Element|null, off: number} } | null} */
  let run = null;
  /** @type {null | (() => void)} */ let stopFrames = null;
  let keyTimer = 0, runs = 0, lastMs = 0;
  /** @type {number|null} */
  let pending = null;

  const setK = (/** @type {number} */ k) => { document.documentElement.style.setProperty('--vc-row-k', k.toFixed(4)); applied = k; };
  // the saved scale's content size from the start (no burn on load)
  const initial = Number(getComputedStyle(document.documentElement).getPropertyValue('--vc-row-scale'));
  setK((Number.isFinite(initial) && initial > 0 ? initial : S.def) / S.def);

  /**
   * An element's top-left in the scroll box's own px (its visible box, scroll taken off), from
   * layout offsets. @param {HTMLElement} w @param {HTMLElement} el
   */
  const local = (w, el) => {
    const abs = (/** @type {HTMLElement|null} */ e) => { let x = 0, y = 0; for (; e; e = /** @type {HTMLElement|null} */ (e.offsetParent)) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
    const a = abs(el), b = abs(w);
    return { x: a.x - b.x - w.clientLeft - w.scrollLeft, y: a.y - b.y - w.clientTop - w.scrollTop };
  };
  /** Screen y of the heading row's foot (its sticky cells), or the box's top. @param {HTMLElement} w */
  const headFoot = w => Math.max(w.getBoundingClientRect().top, w.querySelector('thead th')?.getBoundingClientRect().bottom ?? -Infinity);
  /** The first row whose bottom is below the stuck heading, and its offset from the box's top. */
  function anchorOf(/** @type {HTMLElement} */ w) {
    const top = headFoot(w);
    for (const r of w.querySelectorAll('#items > tr')) {
      const b = r.getBoundingClientRect();
      if (b.bottom > top + 1) return { row: r, off: b.top - top };
    }
    return { row: null, off: 0 };
  }

  function commit(/** @type {number} */ scale) {
    const to = scale / S.def;
    const w = wrap();
    if (!o.isDesk() || !w || Math.abs(to - applied) < 1e-3) { if (Math.abs(to - applied) >= 1e-3) setK(to); return; }
    if (run) { pending = scale; return; }
    if (!F) F = buildFilter();
    const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
    if (reduce) { const a = anchorOf(w); setK(to); restore(w, a); return; }
    // the map covers only the rows on screen: from the heading row's foot to the box's foot, across
    // the table (the box is the whole main section's scroll). Elsewhere the map is white and never
    // reaches the threshold. User space is the box's own CSS px: measured in layout (offsets, which
    // the desk's 3D transforms and perspective don't touch; a sticky cell's offset includes its stick).
    const th = /** @type {HTMLElement|null} */ (w.querySelector('thead th')), table = /** @type {HTMLElement|null} */ (w.querySelector('table'));
    const items = /** @type {HTMLElement|null} */ (w.querySelector('#items'));
    if (!th || !table || !items) { setK(to); return; }
    const box = local(w, table), cell = local(w, th);
    const y0 = Math.max(0, cell.y + th.offsetHeight), y1 = Math.min(w.clientHeight, box.y + table.offsetHeight);
    if (y1 - y0 < 4) { setK(to); return; } // no rows on screen: nothing to burn
    F.img.setAttribute('x', box.x.toFixed(1)); F.img.setAttribute('y', y0.toFixed(1));
    F.img.setAttribute('width', table.offsetWidth.toFixed(1)); F.img.setAttribute('height', (y1 - y0).toFixed(1));
    run = { t0: clock.now(), from: applied, to, swapped: false, anchor: anchorOf(w) };
    runs++;
    w.style.filter = `url(#${ID})`;
    emit('rows:burn', { phase: 'away', scale: +scale.toFixed(3) });
    // WP-18P: on the central clock's frames (was its own requestAnimationFrame loop)
    stopFrames?.(); stopFrames = clock.onFrame(frame);
  }

  function restore(/** @type {HTMLElement} */ w, /** @type {{row: Element|null, off: number}} */ a) {
    if (!a.row || !a.row.isConnected) return;
    const top = headFoot(w);
    w.scrollTop += a.row.getBoundingClientRect().top - top - a.off;
  }

  function frame() {
    const w = wrap();
    if (!run || !w || !F) { run = null; stopFrames?.(); stopFrames = null; return; }
    const t = clock.now() - run.t0;
    const A = MR.awayMs, I = MR.inMs, total = A + MR.holdMs + I;
    // threshold: away 0 → just past the rows' map (everything in the rows gone), in back to 0;
    // the char band ahead of it stays below the heading's 1
    const span = MAP_MAX + 0.03;
    let th;
    if (t < A) th = -0.02 + span * easeIn(t / A);
    else if (t < A + MR.holdMs) th = span;
    else th = span * (1 - easeOut(Math.min(1, (t - A - MR.holdMs) / I))) - 0.02;
    if (t >= A && !run.swapped) {
      run.swapped = true;
      setK(run.to);
      restore(w, run.anchor);
      emit('rows:burn', { phase: 'in', scale: +(run.to * S.def).toFixed(3) });
    }
    step(F.keep, th, MR.edgeSlope);
    step(F.soft, th - MR.emberBand, MR.edgeSlope);
    step(F.char, th + MR.charBand, MR.edgeSlope * 0.5);
    lastMs = t;
    if (t >= total) {
      w.style.removeProperty('filter');
      run = null; stopFrames?.(); stopFrames = null;
      emit('rows:burn', { phase: 'done' });
      if (pending !== null) { const p = pending; pending = null; commit(p); }
      return;
    }
  }
  const easeIn = (/** @type {number} */ x) => x * x * (3 - 2 * x) * 0.6 + x * 0.4;
  const easeOut = (/** @type {number} */ x) => 1 - (1 - x) * (1 - x);

  on('rows:release', d => commit(+d.scale));
  on('rows:height', d => {
    if (d.source === 'pointer') return; // a drag commits on release
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => commit(+d.scale), MR.keyCommitMs);
  });

  return {
    read: () => ({ k: +applied.toFixed(4), running: !!run, phase: run ? (run.swapped ? 'in' : 'away') : null, runs, lastMs: Math.round(lastMs), filter: wrap()?.style.filter ?? '' }),
  };
}
