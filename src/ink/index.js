// @ts-check
/**
 * WP-10: the ink wash, the stamps and the dots (both modes; DOM based).
 *
 * A view change, from the moment of selection (the board latch, a click, a keypress, a favourite
 * or a loaded save):
 *
 *   0 ms     the old content (a ghost copy, ghost.js) washes out, element by element, top to bottom
 *   450      the new content washes in from the left: eyebrow, heading, description, notes, toggle
 *   1000     the four stamps land 150 ms apart; each number counts up from 0 over 800 ms
 *   1500     the dot grids ink in, all done by 3,500 ms
 *   1600     the progress rule draws to its percentage like a pen stroke
 *   1700     filters, list info and the table wash in; the first 12 rows cascade 25 ms apart
 *
 * app.js stays immediate: `setCategory` renders the new view at once, here it only starts out
 * masked, so screen readers and tests read the new view straight away. Every look is written
 * per frame from the sequence's clock time, onto whatever elements are in the page now, so an
 * app re-render in the middle (record mode, a filter) simply carries on.
 *
 * Smaller updates (filter, star, correction, record mode) never re-stamp: a changed number gets
 * the 180 ms ink wipe, and dots that change tick in or fade out. On the desk, the stage hands
 * in its glow layer, veil and camera shake (`attachDesk`): the wet front draws a damp sheen in
 * #glow (Paul, WP-18 item 1: it no longer darkens the paper in the veil); stamps call impact() and shake the camera.
 *
 * Debug: `__vc.ink` (state, timeline, grain hashes, fronts, `ascii(mode)`).
 */
import './ink.css';
import { emit, on } from '../bus.js';
import { clock } from '../util/clock.js';
import { rng as rootRng, Rng } from '../util/rng.js';
import { ease } from '../util/ease.js';
import { stamp as MS, wash as MW, paper as MP } from '../config/motion.js';
import { inset as LI } from '../config/layout.js';
import { print as PR } from '../config/render.js';
import { impact } from '../scene/impact.js';
import { washMasks, stampGrain } from './masks.js';
import { makeGhost, ghostCount, prepareGhost } from './ghost.js';
import { METRICS, drawFrame, buildDots, gridModel, setDot, dotOrder } from './stamps.js';

// its own stream from the page seed: forking the shared one here would shift every later fork
const rng = new Rng((rootRng.initialSeed ^ 0x1c0ffee) >>> 0);
const $ = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (document.querySelector(s));
const $$ = (/** @type {string} */ s, /** @type {ParentNode} */ r = document) => /** @type {HTMLElement[]} */ ([...r.querySelectorAll(s)]);
const fmt = (/** @type {number} */ n) => n.toLocaleString(); // app.js line 10
const ease3 = ease.inOutCubic, outCubic = ease.outCubic;
/**
 * Paul, WP-16 item 18: where the wash edge is, as a fraction of the unit's width, at progress p.
 * It used to travel −0.5 → 1.5 widths on an in-out cubic, so the edge was over the text for only
 * about a fifth of the unit's time (~125 ms of 600) and the reveal read as a pop. Now it runs from
 * just before the unit (the mask's feathered band and blooms fully off it) to just past it at an
 * even pace, as a brush stroke would, so the watercolour edge is on the text for most of the wash.
 */
const washK = (/** @type {number} */ p) => MW.edgeFrom + (MW.edgeTo - MW.edgeFrom) * clamp01(p);
const clamp01 = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// WP-14: checkVisibility() needs only style; offsetParent forced a full layout on every view
// change, before app.js had even rendered the new view (a second layout in the same click)
const shown = (/** @type {HTMLElement|null} */ el) => !!el && !el.closest('.hidden')
  && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : (el.offsetParent !== null || getComputedStyle(el).position === 'fixed'));

let asciiMode = /** @type {'grain'|'scramble'|'both'} */ (MS.stampAscii);
const masks = () => washMasks(rng);

// ── Desk hooks (set by the stage) ─────────────────────────────────────────────────────────
/** @type {null | { glow: any, veil: any, shake: (amount: number, ms: number) => void, veilCanvas: HTMLCanvasElement | null }} */
let desk = null;

// ── Grain (step 6): a fresh mask per landing; the last one per stamp stays on it ─────────────
/** @type {Map<string, {hash: string, url: string | null, pending: Promise<string>}>} */
const grain = new Map();
/** Every grain hash made this session (tests: two stampings differ). */
const grainLog = /** @type {{stamp: string, hash: string, t: number}[]} */ ([]);
/** Object URLs still possibly referenced (a ghost may hold one); revoked a few sequences later. */
const oldUrls = /** @type {string[][]} */ ([]);
/**
 * WP-14: impressions are drawn ahead, in idle time, from their own stream (drawing and encoding a
 * 512 × 280 grain cost 10–20 ms per stamp in the frame it landed). A landing takes one from the
 * pool and the pool is topped up when the page is idle again; an empty pool draws on the spot.
 */
const grainRng = new Rng((rootRng.initialSeed ^ 0x67a1a) >>> 0);
// Paul, WP-17 item 10b (the hitch on releasing a slider): the pool held one view's four stamps and
// refilled straight away, so the next impressions were drawn and PNG-encoded (~40 ms each) in idle
// slices during the wash and the next landing. Now it holds two views' worth, is pre-warmed at start,
// and refills only while no ink sequence runs and the idle slice has room.
const GRAIN_POOL = 8;
/** @type {ReturnType<typeof stampGrain>[]} */
const grainPool = [];
let grainFilling = false;
function fillGrainPool() {
  if (grainFilling || grainPool.length >= GRAIN_POOL) return;
  grainFilling = true;
  whenIdle((/** @type {any} */ deadline) => {
    grainFilling = false;
    const busy = !!seq || startPending !== null;
    const room = !deadline || deadline.didTimeout || deadline.timeRemaining() > 12;
    if (busy || !room) { setTimeout(fillGrainPool, busy ? 400 : 60); return; }
    if (grainPool.length < GRAIN_POOL) grainPool.push(stampGrain(grainRng));
    fillGrainPool();
  });
}
function freshGrain(/** @type {string} */ m) {
  const g = grainPool.shift() ?? stampGrain(grainRng);
  fillGrainPool();
  const entry = { hash: g.hash, url: /** @type {string|null} */ (null), pending: g.url };
  g.url.then(u => { entry.url = u; applyGrain(m); });
  const prev = grain.get(m);
  if (prev?.url) (oldUrls[oldUrls.length - 1] ??= []).push(prev.url);
  grain.set(m, entry);
  grainLog.push({ stamp: m, hash: g.hash, t: clock.now() });
  if (grainLog.length > 200) grainLog.shift();
  return entry;
}
function retireUrls() {
  oldUrls.push([]);
  while (oldUrls.length > 3) for (const u of oldUrls.shift() ?? []) URL.revokeObjectURL(u);
}
/** Put a stamp's grain on its element (mask layer 2 under any wash layer). @param {string} m */
function applyGrain(m) {
  const el = stampEl(m), g = grain.get(m);
  if (!el || !g?.url) return;
  el.dataset.vcGrain = g.url;
  if (!el.dataset.vcWash) setMask(el, null);
}
const stampEl = (/** @type {string} */ m) => $(`#metrics [data-metric="${m}"]`);

// ── Masks on elements ─────────────────────────────────────────────────────────────────────
/**
 * Set (or clear) the wash mask on one element, keeping its grain mask (stamps) as a second layer.
 * @param {HTMLElement} el
 * @param {null | {url: string, size: number, x: number}} w  mask width px (3 × unit width) and x offset
 */
function setMask(el, w) {
  const s = el.style, g = el.dataset.vcGrain;
  const layers = [], sizes = [], pos = [];
  if (w) { layers.push(`url("${w.url}")`); sizes.push(`${w.size.toFixed(1)}px 100%`); pos.push(`${w.x.toFixed(1)}px 0`); }
  if (g) { layers.push(`url("${g}")`); sizes.push('100% 100%'); pos.push('0 0'); }
  if (!layers.length) {
    for (const p of ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size', 'mask-position', '-webkit-mask-position', 'mask-repeat', '-webkit-mask-repeat', 'mask-composite', '-webkit-mask-composite']) s.removeProperty(p);
    written.delete(el);
    delete el.dataset.vcWash;
    return;
  }
  if (w) el.dataset.vcWash = '1'; else delete el.dataset.vcWash;
  // WP-14 (JS per frame): a moving front changes only the position; every write of the long
  // mask-image URL made the browser re-parse it, so each property is written only when it changes
  let last = written.get(el);
  if (!last) { last = {}; written.set(el, last); }
  const put = (/** @type {string} */ name, /** @type {string} */ value) => {
    if (last[name] === value) return;
    last[name] = value;
    s.setProperty('-webkit-' + name, value); s.setProperty(name, value);
  };
  put('mask-image', layers.join(', '));
  put('mask-size', sizes.join(', '));
  put('mask-position', pos.join(', '));
  put('mask-repeat', 'no-repeat');
  const both = layers.length > 1 ? '1' : '';
  if (last.composite !== both) {
    last.composite = both;
    if (both) { s.setProperty('-webkit-mask-composite', 'source-in'); s.setProperty('mask-composite', 'intersect'); }
    else { s.removeProperty('-webkit-mask-composite'); s.removeProperty('mask-composite'); }
  }
}
/** What setMask last wrote on each element (WP-14). @type {WeakMap<HTMLElement, Record<string, string>>} */
const written = new WeakMap();
/**
 * Each unit's width and cell offsets, measured once per element and reused for every frame of the
 * wash, so a frame reads layout once per element, not once per mask write.
 * @type {WeakMap<HTMLElement, {W: number, cells: {c: HTMLElement, cx: number}[]}>}
 */
const geomCache = new WeakMap();
/** @param {HTMLElement} el */
function geomOf(el) {
  let g = geomCache.get(el);
  if (!g) {
    const cells = el.tagName === 'TR' ? /** @type {HTMLElement[]} */ ([...(/** @type {HTMLTableRowElement} */ (el)).cells]) : [el];
    g = { W: Math.max(1, el.offsetWidth), cells: cells.map(c => ({ c, cx: c === el ? 0 : c.offsetLeft })) };
    geomCache.set(el, g);
  }
  return g;
}
/** The mask offset last written per element (unchanged masks are not written again). @type {WeakMap<HTMLElement, string>} */
const lastMask = new WeakMap();

/** Mask one unit at progress p (0 … 1 of its own time; <0 not started). Writes only. @param {Unit} u @param {{W: number, cells: {c: HTMLElement, cx: number}[]}} g @param {number} p */
function writeUnit(u, g, p) {
  if (u.dir === 'in' && p >= 1) {
    for (const { c } of g.cells) if (c.dataset.vcWash) { setMask(c, null); lastMask.delete(c); }
    return;
  }
  const W = g.W, e = washK(p) * W;
  const url = u.dir === 'in' ? masks().in : masks().out;
  for (const { c, cx } of g.cells) {
    const x = e - cx - 1.5 * W, key = `${u.dir}${x.toFixed(1)}`;
    if (lastMask.get(c) === key && c.dataset.vcWash) continue;
    lastMask.set(c, key);
    setMask(c, { url, size: 3 * W, x });
  }
}
/** Mask a list of units at once: measure all, then write all. @param {Unit[]} list @param {number} t */
function paintUnits(list, t) {
  const jobs = [];
  for (const u of list) { const el = u.el(); if (el) jobs.push({ u, g: geomOf(el) }); }
  for (const j of jobs) writeUnit(j.u, j.g, (t - j.u.start) / j.u.dur);
}

/** Screen front of a unit at progress p from its rect: x on screen and the band it covers. @param {Unit} u @param {DOMRect} r @param {number} p */
function frontOf(u, r, p) {
  if (!r.width || !r.height) return null;
  const k = washK(p);
  return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, front: r.left + k * r.width, speed: 2 * r.width / u.dur };
}

/** Collection or insight units of the real (new) content, in their wash-in order and times. */
function realUnits() {
  /** @type {Unit[]} */
  const list = [];
  const one = (/** @type {string} */ sel, /** @type {number} */ start, /** @type {number} */ dur = MW.inMs) => {
    if (!shown($(sel))) return false;
    list.push({ el: () => $(sel), dir: 'in', start, dur, name: sel });
    return true;
  };
  let k = 0;
  const A = () => MW.inStartMs + MW.inStaggerMs * k++;
  if (shown($('#mobileCategory')) && one('#mobileCategory', MW.inStartMs)) k++;
  const collection = shown($('#collectionView'));
  if (collection) {
    // Paul, WP-17 item 8: the wash pours through everything, the masthead above the table included
    for (const s of ['.vc-masthead .brand', '#headerProfile', '#statline', '#collectionLabel', '#title', '#description', '#collectionNotice', '#collectionView .title-row > label', '#dropzone', '#message']) {
      const el = $(s);
      if (!shown(el) || (s === '#message' || s === '#collectionNotice') && !el?.textContent?.trim()) continue;
      one(s, A());
    }
    one('#mainTrack', MW.ruleStartMs, MW.ruleMs);
    let b = 0;
    // filters, list info, the table's header row; then the rows. Only rows that can be seen take
    // part (a mask over the whole, very tall, table would be slow to paint): the first 12 in view
    // cascade, the other visible ones appear at once at 1,700 ms ("without animation").
    for (const s of ['#collectionView .filterbar', '#collectionView .list-info', '#collectionView .tablewrap thead > tr']) if (one(s, MW.listStartMs + MW.rowStaggerMs * b)) b++;
    const wrap = $('#collectionView .tablewrap'), rows = $$('#items > tr');
    const wr = wrap?.getBoundingClientRect(), vh = innerHeight || 1000;
    const visible = [];
    for (let i = 0; i < rows.length && visible.length < 60; i++) {
      const r = rows[i].getBoundingClientRect();
      if (r.bottom < 0 || (wr && r.bottom < wr.top)) continue;
      if (r.top > vh || (wr && r.top > wr.bottom)) break;
      visible.push(i);
    }
    visible.forEach((idx, n) => {
      const cascade = n < MW.rowsAnimated;
      list.push({ el: () => /** @type {HTMLElement|null} */ (document.querySelectorAll('#items > tr')[idx] ?? null), dir: 'in', start: cascade ? MW.listStartMs + MW.rowStaggerMs * b++ : MW.listStartMs, dur: cascade ? MW.inMs : 1, quiet: !cascade, name: `row ${idx}` });
    });
  } else {
    for (const s of ['#dropzone', '#message']) { const el = $(s); if (shown(el) && el?.textContent?.trim()) one(s, A()); }
    const intro = $$('#insightsView > .insight-intro > *');
    intro.forEach((_, i) => list.push({ el: () => $$('#insightsView > .insight-intro > *')[i] ?? null, dir: 'in', start: A(), dur: MW.inMs, name: `intro ${i}` }));
    const rest = $$('#insightsView > :not(.insight-intro)');
    rest.forEach((_, i) => list.push({ el: () => $$('#insightsView > :not(.insight-intro)')[i] ?? null, dir: 'in', start: A(), dur: MW.inMs, name: `insight ${i}` }));
  }
  return list;
}

/** The ghost's units: everything inked, top to bottom, 30 ms apart. @param {HTMLElement} copy */
function ghostUnits(copy) {
  const sel = [
    '.vc-masthead .brand', '#headerProfile', '#statline', // Paul, WP-17 item 8
    '#mobileCategory', '#dropzone', '#message', '#collectionLabel', '#title', '#description', '#collectionNotice', '.title-row > label',
    '#metrics > .metric', '#mainTrack', '.filterbar', '.list-info', '.tablewrap thead > tr', '#items > tr',
    '#insightsView > .insight-intro > *', '#insightsView > :not(.insight-intro)',
  ].join(', ');
  const wrap = /** @type {HTMLElement|null} */ (copy.querySelector('.tablewrap'));
  const wr = wrap?.getBoundingClientRect();
  const els = /** @type {HTMLElement[]} */ ([...copy.querySelectorAll(sel)]).filter(el => {
    if (el.closest('.hidden') || !el.getClientRects().length) return false;
    const b = el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) return false; // out of sight: goes with the ghost
    if (el.tagName === 'TR' && wr) { const r = el.getBoundingClientRect(); if (r.bottom < wr.top || r.top > wr.bottom) return false; }
    return true;
  });
  els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return els.map((el, i) => /** @type {Unit} */ ({ el: () => el, dir: 'out', start: MW.outStaggerMs * i, dur: MW.outMs, name: `ghost ${i}` }));
}

/** Remove table rows from the ghost that are out of view (keeps the copy small). @param {HTMLElement} copy */
function pruneGhost(copy) {
  const realWrap = $('#collectionView .tablewrap');
  const rows = [...copy.querySelectorAll('#items > tr')];
  if (realWrap && rows.length) {
    // keep only rows that can be seen: inside the table's scroll box (desk) and the window (flat)
    const realRows = $$('#items > tr');
    const top = realWrap.scrollTop, bottom = top + realWrap.clientHeight;
    const vh = innerHeight || 1000;
    rows.forEach((r, i) => {
      const rr = realRows[i];
      const out = !rr || rr.offsetTop + rr.offsetHeight < top - 40 || rr.offsetTop > bottom + 40;
      const b = !out && rr ? rr.getBoundingClientRect() : null;
      if (out || !b || b.bottom < -40 || b.top > vh + 40) r.remove();
    });
  }
  for (const v of copy.querySelectorAll('.visually-hidden')) v.remove();
}

// ── The sequence ──────────────────────────────────────────────────────────────────────────
/** @type {ReturnType<typeof makeGhost> | null} */
let ghost = null;
/** Units of the ghost (out) and the real content (in). @type {Unit[]} */
let units = [];
/**
 * @typedef {object} Seq
 * @property {number} t0
 * @property {'full'|'reduced'} kind
 * @property {string} reason
 * @property {Record<string, {land: number, value: number | null, text: string, landed: boolean, counted: boolean, scrambleUntil: number, countStart: number, grained: boolean}>} stamps
 * @property {{ m: string, at: number[], fired: number }[]} grids
 * @property {number} lastEnd
 * @property {boolean} inStarted
 * @property {boolean} ended
 * @property {number} frames     frames seen since the selection
 * @property {boolean} anchored  time 0 set (the first frame after the new view was painted)
 * @property {{type: string, t: number}[]} log
 * @property {number} shift     ms the timeline starts in (WP-17 item 13: the drag did the wash-out)
 * @property {boolean} faded    WP-17 item 13: the old view was faded out by the drag
 */
/** @type {Seq | null} */
let seq = null;
/** Ink-in moments of dots (for the 90 ms scale-in) and last-dot glints: metric → index → time. */
const dotAnim = /** @type {Map<string, Map<number, number>>} */ (new Map());
const glints = /** @type {Map<string, number>} */ (new Map());
const fades = /** @type {Map<string, Map<number, {from: number, t: number}>>} */ (new Map());
/** Persisted per-stamp look outside a sequence: landed (fresh ink time) and shown ink. */
const fresh = /** @type {Map<string, number>} */ (new Map());

/** Reduced motion: the elements fading in. @type {HTMLElement[]} */
let fading = [];
let pendingGhost = /** @type {ReturnType<typeof makeGhost> | null} */ (null);
let armed = /** @type {null | 'category' | 'load'} */ (null);
let armTimer = 0;

function workspace() { return /** @type {HTMLElement|null} */ (document.querySelector('main.workspace')); }

/** Copy what is on the inset sheet now into a (hidden) ghost. */
function snapshot() {
  const ws = workspace();
  if (!ws) return null;
  const sheetEl = /** @type {HTMLElement|null} */ (ws.closest('.vc-sheet-inset'));
  let frame = sheetEl;
  if (!frame) {
    frame = /** @type {HTMLElement} */ (ws.parentElement);
    if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
  }
  const g = makeGhost({ source: ws, frame, sheetWrap: !!sheetEl, prune: pruneGhost });
  g.host.style.visibility = 'hidden';
  return g;
}

function dropPending() { pendingGhost?.remove(); pendingGhost = null; }

/**
 * Paul, WP-17 item 10b ("a hitch when releasing a slider: pre-warm or defer whatever loads there"):
 * the ghost copy of the current view (~20 ms) is taken when a dragged bar passes its latch point
 * (`bar:prelatch`), not in the task that releases it. It is used only if nothing re-rendered or
 * scrolled since, and dropped when the bar springs back.
 */
let warmGhost = /** @type {ReturnType<typeof makeGhost> | null} */ (null);
let warmKey = '';
const viewKey = () => {
  const w = /** @type {HTMLElement|null} */ (document.querySelector('#collectionView .tablewrap'));
  const i = /** @type {HTMLElement|null} */ (document.getElementById('insightsView'));
  return `${renders}|${w?.scrollTop ?? 0}|${i?.scrollTop ?? 0}`;
};
let renders = 0;
function dropWarm() { warmGhost?.remove(); warmGhost = null; }
function prewarm() {
  if (!enabled || seq || armed) return;
  dropWarm();
  warmGhost = snapshot();
  warmKey = viewKey();
}
function takeWarm() {
  const g = warmGhost;
  warmGhost = null;
  cost.warmMiss = !g ? 'none' : warmKey === viewKey() ? '' : `${warmKey} → ${viewKey()}`;
  if (g && !cost.warmMiss) return g;
  g?.remove();
  return null;
}

/**
 * Paul, WP-17 item 13: while a bar is dragged toward a new view, the current view is already
 * fading out with the bar's travel (fully faded by the right end). If the drag latches, the
 * sequence then skips its wash-out (done by the fade) and the new view washes in at once.
 * The fade is an opacity on `main.workspace`; springback or a drag let go short eases it back.
 */
let dragFadeK = 0;
let dragFadeCat = '';
/** @param {number} k 0 (none) … 1 (fully faded) @param {boolean} [animate] */
function setDragFade(k, animate = false) {
  const ws = workspace();
  dragFadeK = clamp01(k);
  if (!ws) return;
  ws.style.transition = animate ? `opacity ${MW.dragFadeBackMs}ms ease-out` : '';
  if (dragFadeK <= 0.001) ws.style.removeProperty('opacity');
  else ws.style.opacity = (1 - dragFadeK).toFixed(3);
}
/** @param {any} d bar:drag data */
function onBarDrag(d) {
  if (!enabled || seq || d?.auto) return;
  const cur = /** @type {HTMLElement|null} */ (document.querySelector('#categories [aria-current="page"], #insightNav [aria-current="page"]'))?.dataset.category ?? '';
  if (!d?.category || d.category === cur) return;
  dragFadeCat = d.category;
  const f = clamp01((Number(d.travel) - MW.dragFadeFrom) / (MW.dragFadeTo - MW.dragFadeFrom));
  setDragFade(f * f * (3 - 2 * f));
}
function dragFadeBack() { if (dragFadeK > 0) setDragFade(0, true); dragFadeCat = ''; }

/** Selection is about to happen: ghost the current look now (before app.js renders). @param {'category'|'load'} why */
function arm(why) {
  if (!enabled) return;
  const w0 = performance.now();
  // Paul, WP-17 item 10b: a bar that reached its latch point already had the ghost taken (prewarm)
  const warm = why === 'category' ? takeWarm() : (dropWarm(), null);
  dropPending();
  pendingGhost = warm ?? snapshot();
  cost.prewarmed = !!warm;
  cost.snapshotMs = +(performance.now() - w0).toFixed(1);
  armed = why;
  clearTimeout(armTimer);
  // a click that does not select (the board's nudge) or a refused title: nothing follows
  if (why === 'category') armTimer = /** @type {any} */ (setTimeout(() => { if (armed === 'category') { armed = null; dropPending(); } }, 0));
}

/** Stop the running sequence: remove its ghost and every look it put on the real content. */
function stop() {
  if (!seq) return;
  ghost?.remove(); ghost = null;
  for (const u of units) if (u.dir === 'in') { const el = u.el(); if (el) for (const c of el.tagName === 'TR' ? [...(/** @type {HTMLTableRowElement} */ (el)).cells] : [el]) setMask(/** @type {HTMLElement} */ (c), null); }
  units = [];
  for (const m of METRICS) { const el = stampEl(m); if (el) { el.classList.remove('vc-wait'); for (const p of ['scale', 'rotate', 'translate', 'opacity']) el.style.removeProperty(p); el.querySelector('strong')?.removeAttribute('data-show'); } }
  const fill = /** @type {HTMLElement|null} */ ($('#mainTrack > i')); fill?.style.removeProperty('clip-path');
  for (const el of fading) el.style.removeProperty('opacity');
  fading = [];
  seq = null;
}

/** Begin a full (or reduced) sequence on the view that has just rendered. @param {string} reason */
function start(reason) {
  if (!enabled) return;
  // WP-14 (long tasks): the sequence begins in the next animation frame, not inside the click.
  // Its first reads (which units are shown) made the browser style and lay out the freshly
  // rendered view inside the click's task (~13 ms on The Artisan); in the frame that work is
  // what the browser does before painting anyway. Nothing paints in between, so the old look
  // never flashes; the ghost made at arm() stays pending (and `armed` set) until then.
  clearTimeout(armTimer);
  const first = startPending === null;
  startPending = reason;
  if (!first) return;
  const go = () => {
    if (startPending === null) return;
    const why = startPending; startPending = null;
    clearTimeout(startFallback);
    const w0 = performance.now();
    try { begin(why); } finally { cost.startMs = +(performance.now() - w0).toFixed(1); }
  };
  clock.nextFrame(go);
  startFallback = /** @type {any} */ (setTimeout(go, 100)); // a hidden tab runs no frames
}
/** The reason of a sequence waiting for its frame, or null. @type {string | null} */
let startPending = null;
/** @type {any} */ let startFallback = 0;
/** Debug switch (`__vc.ink.enable(false)`): view changes without the sequence, for comparisons. */
let enabled = true;
/** Debug: desk effects switched off one by one (`__vc.ink.off({impact: true})`), for comparisons. */
const off = { impact: false, shake: false };
/** Debug: what the last snapshot and start cost (wall ms, not the clock). */
const cost = { snapshotMs: 0, startMs: 0, prewarmed: false, warmMiss: '' };
/** @param {string} reason */
function begin(reason) {
  clearTimeout(armTimer);
  armed = null;
  let g = pendingGhost; pendingGhost = null;
  stop();
  retireUrls();
  // Paul, WP-17 item 13: the drag already faded the old view out: no ghost, the wash-in starts now
  const faded = dragFadeK >= MW.dragFadeSkipOut && reason === 'category';
  if (faded) { g?.remove(); g = null; }
  ghost = g;
  if (ghost) ghost.host.style.visibility = '';
  const kind = reducedMotion() ? 'reduced' : 'full';
  const t0 = clock.now();
  /** @type {Seq} */
  const s = { t0, kind, reason, stamps: {}, grids: [], lastEnd: 0, inStarted: false, ended: false, log: [], frames: 0, anchored: false, shift: faded ? MW.inStartMs : 0, faded };
  seq = s;
  dotAnim.clear(); glints.clear(); fades.clear();
  decorate(true);

  const inUnits = realUnits();
  if (kind === 'reduced') {
    // a 150 ms fade replaces the wash; stamps, numbers and dots at once; one soft stamp sound
    units = [];
    fading = /** @type {HTMLElement[]} */ (inUnits.map(u => u.el()).filter(Boolean));
    for (const el of fading) el.style.opacity = '0';
    if (dragFadeK > 0) setDragFade(0);
    for (const m of METRICS) { if (shown(stampEl(m))) { freshGrain(m); fresh.set(m, t0); } }
    s.lastEnd = MW.reducedFadeMs;
    const first = METRICS.find(m => shown(stampEl(m)));
    if (first) { emit('fx:stamp-land', { stamp: first, strength: MS.reducedStampStrength, reduced: true }); s.log.push({ type: 'fx:stamp-land', t: 0 }); }
    for (const m of METRICS) s.stamps[m] = { land: 0, value: null, text: '', landed: true, counted: true, scrambleUntil: 0, countStart: 0, grained: true };
    run();
    return;
  }
  // fx:wash-out-start (time 0) is emitted on the first frame after the new view is painted (anchor())
  const out = ghost ? ghostUnits(ghost.copy) : [];
  units = [...out, ...inUnits];
  s.lastEnd = Math.max(0, ...inUnits.map(u => u.start + u.dur));
  // every real unit starts fully masked (nothing of the new view shows before its turn)
  paintUnits(inUnits, 0);
  if (dragFadeK > 0) setDragFade(0);

  // stamps: land 150 ms apart from 1000 ms; a fresh grain for each landing (drawn shortly before it)
  const present = METRICS.filter(m => shown(stampEl(m))); // insight views have no stamps
  present.forEach((m, i) => {
    const el = /** @type {HTMLElement} */ (stampEl(m));
    el.classList.add('vc-wait');
    s.stamps[m] = { land: MW.stampStartMs + MW.stampStaggerMs * i, value: null, text: '', landed: false, counted: false, scrambleUntil: 0, countStart: 0, grained: false };
  });
  // dots (DECISIONS 4): interval = min(90, (2000 − 80 × (grids − 1)) ÷ largest), partial counts
  const runs = present.map(m => {
    const grid = /** @type {HTMLElement|null} */ (stampEl(m)?.querySelector('.dots') ?? null);
    const model = grid ? gridModel(grid) : null;
    const n = model ? model.full + (model.partial > 0 ? 1 : 0) : 0;
    return { m, n };
  }).filter(r => r.n > 0);
  const largest = Math.max(1, ...runs.map(r => r.n));
  const interval = Math.min(MW.dotIntervalMaxMs, (MW.dotSpanMs - MW.dotGridStaggerMs * (runs.length - 1)) / largest);
  s.grids = runs.map((r, gi) => ({ m: r.m, at: Array.from({ length: r.n }, (_, k) => MW.dotsStartMs + MW.dotGridStaggerMs * gi + k * interval), fired: 0 }));
  // the progress rule waits for its stroke
  const fill = /** @type {HTMLElement|null} */ ($('#mainTrack > i'));
  fill?.style.setProperty('clip-path', 'inset(0 100% 0 0)');
  run();
}

let ticking = false;
function run() {
  if (ticking) return;
  ticking = true;
  const off = clock.onFrame(() => {
    const busy = frame();
    if (!busy) { off(); ticking = false; }
  });
  frame(true);
}

/**
 * Time 0 of a sequence is the first animation frame after the new view has been painted (the
 * second frame callback after the selection): the browser's paint of a long new table can block
 * the page for a second, and starting the clock before it would skip the whole wash-out unseen.
 * Until then the ghost covers the old look and the new content waits fully masked.
 * @param {Seq} s @param {number} now
 */
function anchor(s, now) {
  s.anchored = true;
  s.t0 = now - s.shift;
  if (s.kind === 'full') { emit('fx:wash-out-start', { reason: s.reason }); s.log.push({ type: 'fx:wash-out-start', t: 0 }); }
}

/** One frame of everything that moves. Returns whether anything is still moving. @param {boolean} [sync] called from start(), not a frame */
function frame(sync = false) {
  const now = clock.now();
  let busy = false;
  if (seq && !seq.anchored) {
    if (!sync && ++seq.frames >= 2) anchor(seq, now);
    else busy = true;
  }
  if (seq?.anchored) busy = seqFrame(seq, now - seq.t0) || busy;
  busy = updateFrame(now) || busy;
  busy = paintDots(now) || busy;
  busy = paintFresh(now) || busy;
  paintDesk();
  return busy;
}

/** @param {Seq} s @param {number} t */
function seqFrame(s, t) {
  if (s.kind === 'reduced') {
    const k = clamp01(t / MW.reducedFadeMs);
    if (ghost) ghost.host.style.opacity = (1 - k).toFixed(3);
    for (const el of fading) el.style.opacity = k.toFixed(3);
    if (k >= 1) {
      for (const el of fading) el.style.removeProperty('opacity');
      fading = [];
      ghost?.remove(); ghost = null;
      emit('fx:wash-in-end', { reduced: true });
      s.log.push({ type: 'fx:wash-in-end', t });
      seq = null;
      return false;
    }
    return true;
  }
  // units (ghost out, real in)
  let ghostLeft = false;
  // read phase: layout and screen rects of the units that move this frame
  const jobs = [];
  for (const u of units) {
    const p = (t - u.start) / u.dur;
    const dryP = 1 + MP.washDampDryMs / u.dur;
    if (u.dir === 'out') {
      // WP-17A: once the ghost is gone its damp band keeps drying off from the last rect (dropping it
      // at once darkened-then-lit the whole main section in one frame: wp16a flash check)
      if (!ghost) { u.front = u.rect && p <= dryP ? frontOf(u, u.rect, p) : null; if (u.front && p > 1) u.front.front += u.front.speed * (t - u.start - u.dur); continue; }
      if (p < 1) ghostLeft = true;
      if (p < 0) continue;
    }
    if (u.dir === 'in' && p < 0) continue; // still masked from the start
    const el = u.el();
    if (!el) { u.front = null; continue; }
    if (u.dir === 'in' && p > dryP && !el.dataset.vcWash) { u.front = null; continue; }
    jobs.push({ u, p, g: geomOf(el), r: p <= dryP && !u.quiet ? el.getBoundingClientRect() : null });
  }
  // write phase
  for (const { u, p, g, r } of jobs) {
    if (u.dir === 'out' && p > 1.05) { if (r) u.rect = r; u.front = r ? frontOf(u, r, p) : null; if (u.front) u.front.front += u.front.speed * (t - u.start - u.dur); continue; } // already erased
    writeUnit(u, g, p);
    if (r) u.rect = r;
    u.front = r ? frontOf(u, r, p) : null;
    if (u.front && p > 1) u.front.front += u.front.speed * (t - u.start - u.dur); // the dry band keeps moving off
  }
  if (!ghostLeft && ghost) { ghost.remove(); ghost = null; }
  if (!s.inStarted && t >= MW.inStartMs) { s.inStarted = true; emit('fx:wash-in-start', {}); s.log.push({ type: 'fx:wash-in-start', t }); }

  // stamps: the grain for each impression is drawn shortly before it lands (one per frame)
  for (const m of METRICS) {
    const st = s.stamps[m];
    if (st && !st.grained && t >= st.land - 450) { st.grained = true; freshGrain(m); break; }
  }
  for (const m of METRICS) {
    const st = s.stamps[m];
    if (!st) continue;
    const el = stampEl(m);
    if (!el) continue;
    paintStamp(m, el, st, t);
  }
  // progress rule: a pen stroke from 1600 over 600 ms
  const fill = /** @type {HTMLElement|null} */ ($('#mainTrack > i'));
  if (fill) {
    const k = ease.inOutSine(clamp01((t - MW.ruleStartMs) / MW.ruleMs));
    if (k >= 1) fill.style.removeProperty('clip-path');
    else fill.style.setProperty('clip-path', `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`);
  }
  // dots
  for (const g of s.grids) {
    while (g.fired < g.at.length && t >= g.at[g.fired]) {
      const index = g.fired++;
      let a = dotAnim.get(g.m); if (!a) dotAnim.set(g.m, (a = new Map()));
      a.set(index, s.t0 + g.at[index]);
      emit('fx:dot', { stamp: g.m, index });
      if (desk && !off.impact) impact({ strength: MS.dotImpact, ...deskPoint(stampEl(g.m)), source: 'dot' });
      if (g.fired === g.at.length) glints.set(g.m, s.t0 + g.at[index] + MS.dotMs);
    }
  }
  const dotsLeft = s.grids.some(g => g.fired < g.at.length);
  const stampsLeft = Object.values(s.stamps).some(st => !st.counted);
  const unitsLeft = t < s.lastEnd;
  if (!s.ended && !unitsLeft && !ghostLeft) {
    s.ended = true;
    paintUnits(units.filter(u => u.dir === 'in'), Infinity);
    emit('fx:wash-in-end', {});
    s.log.push({ type: 'fx:wash-in-end', t });
  }
  const frontsLeft = units.some(u => u.front);
  if (s.ended && !dotsLeft && !stampsLeft && !frontsLeft) { units = []; seq = null; return false; }
  return true;
}

/** Landing, count-up and scramble for one stamp. @param {string} m @param {HTMLElement} el @param {Seq['stamps'][string]} st @param {number} t */
function paintStamp(m, el, st, t) {
  const strong = /** @type {HTMLElement|null} */ (el.querySelector('strong'));
  const text = strong?.textContent ?? '';
  if (st.text !== text) { st.text = text; st.value = /^[\d,]+$/.test(text) ? +text.replace(/,/g, '') : null; }
  const tl = st.land, fallFrom = tl - MS.bigFallMs;
  if (t < fallFrom) { el.classList.add('vc-wait'); return; }
  el.classList.remove('vc-wait');
  const tilt = (METRICS.indexOf(/** @type {any} */ (m)) % 2 ? 1 : -1) * MS.bigTiltDeg;
  if (t < tl) {
    // falling from 3 cm: bigger (nearer the eye), tilted, only its shadow-faint ink yet
    const p = ease.inQuad(clamp01((t - fallFrom) / MS.bigFallMs));
    el.style.scale = String(MS.bigScaleFrom + (MS.bigScaleTo - MS.bigScaleFrom) * p);
    el.style.rotate = `${(tilt * (1 - p)).toFixed(3)}deg`;
    el.style.opacity = (0.12 + 0.2 * p).toFixed(3);
    return;
  }
  if (!st.landed) {
    st.landed = true;
    if (!st.grained) { st.grained = true; freshGrain(m); }
    applyGrain(m);
    fresh.set(m, clock.now() - (t - tl));
    emit('fx:stamp-land', { stamp: m, strength: MS.bigImpact });
    seq?.log.push({ type: 'fx:stamp-land', t });
    if (desk) {
      if (!off.impact) impact({ strength: MS.bigImpact, ...deskPoint(el), source: 'stamp' });
      if (!off.shake) desk.shake(MS.shakeAmount, MS.shakeMs);
    }
    st.scrambleUntil = asciiMode === 'grain' ? tl : tl + MS.scrambleMs;
    st.countStart = st.scrambleUntil;
  }
  // rebound 0.15 cm (as scale, on the 3 cm fall's 1.12 → 1 range), then settle over 120 ms
  const r = t - tl;
  const rebound = MS.bigRebound / MS.bigFallHeight * (MS.bigScaleFrom - 1);
  if (r < MS.bigSettleMs) {
    el.style.scale = String(1 + rebound * Math.sin(Math.PI * r / MS.bigSettleMs));
    el.style.rotate = '';
    el.style.opacity = '';
  } else { el.style.removeProperty('scale'); el.style.removeProperty('rotate'); el.style.removeProperty('opacity'); }
  // count-up (and scramble before it)
  if (!strong) return;
  if (st.value === null) {
    strong.removeAttribute('data-show');
    if (!st.counted) { st.counted = true; emit('fx:count-end', { stamp: m, value: text }); }
    return;
  }
  if (t < st.scrambleUntil) {
    const n = text.length, chars = MS.scrambleChars;
    let out = '';
    for (let i = 0; i < n; i++) out += text[i] === ',' ? ',' : chars[Math.floor(rng.next() * chars.length)];
    strong.dataset.show = out;
    return;
  }
  const k = (t - st.countStart) / MS.countUpMs;
  if (k < 1) { strong.dataset.show = fmt(Math.round(st.value * outCubic(clamp01(k)))); return; }
  strong.removeAttribute('data-show');
  const sk = (t - st.countStart - MS.countUpMs) / MS.countSettleMs;
  if (sk < 1) strong.style.scale = String(MS.countSettleScaleFrom + (MS.countSettleScaleTo - MS.countSettleScaleFrom) * outCubic(clamp01(sk)));
  else strong.style.removeProperty('scale');
  if (!st.counted) { st.counted = true; emit('fx:count-end', { stamp: m, value: text }); seq?.log.push({ type: 'fx:count-end', t }); }
}

/** Desk point (cm) of an element on the inset sheet (for impact()). @param {HTMLElement|null} el */
function deskPoint(el) {
  const sheet = el?.closest('.vc-sheet-inset');
  if (!el || !sheet) return { x: (LI.x0 + LI.x1) / 2, y: (LI.y0 + LI.y1) / 2 };
  let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
  for (let p = /** @type {HTMLElement|null} */ (el); p && p !== sheet; p = /** @type {HTMLElement|null} */ (p.offsetParent)) { x += p.offsetLeft; y += p.offsetTop; }
  return { x: LI.x0 + x / PR.pxPerCm, y: LI.y1 - y / PR.pxPerCm };
}

// ── Dots on the page: filled count during a sequence, ink-in pop, glint, fades ────────────────
/** @param {number} now */
function paintDots(now) {
  let busy = false;
  for (const m of METRICS) {
    const el = stampEl(m);
    const grid = /** @type {HTMLElement|null} */ (el?.querySelector('.dots') ?? null);
    if (!grid) continue;
    const model = gridModel(grid);
    if (!model) continue;
    const g = seq?.grids.find(x => x.m === m);
    const inked = seq && seq.kind === 'full' && seq.stamps[m] ? (g ? g.fired : 0) : Infinity;
    if (grid.childElementCount !== model.dots) buildDots(grid, inked);
    // WP-18 item 13: model dot i sits in cell order[i] (Missing, Undiscovered and Unverified run from the end)
    const order = dotOrder(m, model);
    const cells = /** @type {HTMLElement[]} */ (order.map(ci => grid.children[ci]));
    const anim = dotAnim.get(m), fade = fades.get(m);
    cells.forEach((c, i) => {
      const f = fade?.get(i);
      if (f) {
        const k = clamp01((now - f.t) / MS.dotFadeMs);
        setDot(c, f.from * (1 - k));
        if (k >= 1) fade?.delete(i); else busy = true;
        return;
      }
      const at = anim?.get(i);
      if (at !== undefined && now < at) { setDot(c, 0); busy = true; return; }
      setDot(c, i < inked ? model.drawn[i] : 0);
      const ii = /** @type {HTMLElement} */ (c.firstElementChild);
      if (at !== undefined && now - at < MS.dotMs) {
        busy = true;
        const k = clamp01((now - at) / MS.dotMs);
        // small stamp with jitter: scale 1.3 → 1 in 90 ms, ±0.4 px, ±6° (seeded per dot)
        const j = jitter(m, i);
        ii.style.scale = String(MS.dotScaleFrom + (MS.dotScaleTo - MS.dotScaleFrom) * outCubic(k));
        ii.style.translate = `${(j.x).toFixed(2)}px ${(j.y).toFixed(2)}px`;
        ii.style.rotate = `${(j.r * (1 - k)).toFixed(2)}deg`;
      } else if (ii.style.scale) { ii.style.removeProperty('scale'); ii.style.removeProperty('rotate'); }
    });
    // the last dot's soft glint (250 ms)
    const gt = glints.get(m);
    const last = cells[(g ? g.at.length : 0) - 1];
    if (gt !== undefined && last) {
      const k = (now - gt) / MS.lastDotGlintMs;
      if (k >= 0 && k < 1) { last.style.setProperty('--g', Math.sin(Math.PI * k).toFixed(3)); busy = true; }
      else if (k >= 1) { last.style.removeProperty('--g'); glints.delete(m); }
      else busy = true;
    }
  }
  return busy;
}
const jitters = new Map();
function jitter(/** @type {string} */ m, /** @type {number} */ i) {
  const key = m + i;
  let j = jitters.get(key);
  if (!j) { j = { x: rng.range(-1, 1) * MS.dotJitterPx, y: rng.range(-1, 1) * MS.dotJitterPx, r: rng.range(-1, 1) * MS.dotRotateDeg }; jitters.set(key, j); }
  return j;
}

/** Fresh ink: bleed 0.5 px over 400 ms, wet sheen dries over 1,500 ms. @param {number} now */
function paintFresh(now) {
  let busy = false;
  for (const m of METRICS) {
    const el = stampEl(m), t = fresh.get(m);
    if (!el || t === undefined) continue;
    const a = now - t;
    const bleed = MS.freshBleedPx * outCubic(clamp01(a / MS.freshBleedMs));
    const wet = 1 - clamp01(a / MS.freshSheenDryMs);
    el.style.setProperty('--vc-bleed', `${bleed.toFixed(3)}px`);
    if (wet > 0) { el.style.setProperty('--vc-wet', wet.toFixed(3)); busy = true; }
    else el.style.removeProperty('--vc-wet');
    if (a < MS.freshBleedMs) busy = true;
  }
  return busy;
}

// ── Smaller updates: no re-stamp; 180 ms number wipe; dots tick in or fade out ─────────────────
/** @type {{t0: number, wipes: Map<string, string>} | null} */
let upd = null;
/** What each stamp showed last (text and per-dot ink). */
const lastShown = /** @type {Map<string, {text: string, drawn: number[]}>} */ (new Map());

function remember() {
  for (const m of METRICS) {
    const el = stampEl(m), grid = /** @type {HTMLElement|null} */ (el?.querySelector('.dots') ?? null);
    lastShown.set(m, { text: el?.querySelector('strong')?.textContent ?? '', drawn: grid ? gridModel(grid)?.drawn ?? [] : [] });
  }
}

/** After an app render that is not a view change. */
function smallUpdate() {
  if (seq) return; // a running sequence picks the new values up itself
  const now = clock.now();
  const wipes = new Map();
  let tick = 0;
  for (const m of METRICS) {
    const el = stampEl(m);
    if (!el) continue;
    const before = lastShown.get(m);
    const strong = el.querySelector('strong');
    const text = strong?.textContent ?? '';
    if (before && before.text !== text && strong) { wipes.set(m, before.text); /** @type {HTMLElement} */ (strong).dataset.old = before.text; }
    const grid = /** @type {HTMLElement|null} */ (el.querySelector('.dots'));
    const model = grid ? gridModel(grid) : null;
    if (!grid || !model) continue;
    const old = before?.drawn ?? [];
    for (let i = 0; i < model.dots; i++) {
      const a = old[i] ?? 0, b = model.drawn[i];
      if (Math.abs(a - b) < 1e-6) continue;
      if (b > a) {
        // ink in with a tick
        let an = dotAnim.get(m); if (!an) dotAnim.set(m, (an = new Map()));
        const at = now + MW.wipeMs + tick * MS.dotUpdateIntervalMs;
        an.set(i, at);
        const index = i;
        clock.after(at - now, () => { emit('fx:dot', { stamp: m, index, update: true }); });
        tick++;
      } else {
        let fm = fades.get(m); if (!fm) fades.set(m, (fm = new Map()));
        fm.set(i, { from: a, t: now });
        const index = i;
        clock.after(tick * MS.dotUpdateIntervalMs, () => emit('fx:dot', { stamp: m, index, update: true, fade: true }));
        tick++;
      }
    }
  }
  if (wipes.size || tick) { upd = { t0: now, wipes }; run(); }
}

/** @param {number} now */
function updateFrame(now) {
  if (!upd) return false;
  const k = clamp01((now - upd.t0) / MW.wipeMs);
  for (const m of upd.wipes.keys()) {
    const strong = /** @type {HTMLElement|null} */ (stampEl(m)?.querySelector('strong') ?? null);
    if (!strong) continue;
    if (k >= 1) { strong.removeAttribute('data-old'); strong.style.removeProperty('--vc-wipe'); }
    else { if (!strong.dataset.old) strong.dataset.old = /** @type {string} */ (upd.wipes.get(m)); strong.style.setProperty('--vc-wipe', k.toFixed(3)); }
  }
  const pending = [...dotAnim.values()].some(an => [...an.values()].some(at => now < at + MS.dotMs));
  if (k >= 1 && !pending) { upd = null; return false; }
  return true;
}

// ── Decorate every render: frames, dots, grain ────────────────────────────────────────────────
/** @param {boolean} [inSequence] */
function decorate(inSequence = false) {
  for (const m of METRICS) {
    const el = stampEl(m);
    if (!el) continue;
    const svg = /** @type {SVGSVGElement|null} */ (el.querySelector('svg.stamp-frame'));
    if (svg) drawFrame(svg);
    const grid = /** @type {HTMLElement|null} */ (el.querySelector('.dots'));
    if (grid) buildDots(grid, inSequence ? 0 : Infinity);
    if (!grain.has(m)) freshGrain(m);
    applyGrain(m);
    if (fresh.has(m)) el.style.setProperty('--vc-bleed', `${MS.freshBleedPx}px`);
  }
}
function redrawFrames() { for (const svg of $$('#metrics svg.stamp-frame')) { delete svg.dataset.size; drawFrame(/** @type {any} */ (svg)); } }

// ── Desk: wet front in the veil, sheen in #glow ───────────────────────────────────────────────
const MAXF = MW.maxFronts;
/** Current merged fronts (screen px), for the veil, the glow and tests. */
let fronts = /** @type {{front: number, x0: number, x1: number, y0: number, y1: number, dry: number}[]} */ ([]);
function mergeFronts() {
  const live = units.map(u => u.front).filter(Boolean);
  if (!live.length) { fronts = []; return; }
  const chunks = Math.min(MAXF, live.length), per = Math.ceil(live.length / chunks);
  const out = [];
  for (let c = 0; c < live.length; c += per) {
    const part = /** @type {NonNullable<Unit['front']>[]} */ (live.slice(c, c + per));
    const n = part.length;
    out.push({
      front: part.reduce((a, f) => a + f.front, 0) / n,
      x0: Math.min(...part.map(f => f.x0)), x1: Math.max(...part.map(f => f.x1)),
      y0: Math.min(...part.map(f => f.y0)), y1: Math.max(...part.map(f => f.y1)),
      dry: part.reduce((a, f) => a + f.speed, 0) / n * MP.washDampDryMs,
    });
  }
  fronts = out;
}
// WP-18P: the veil's damp-band uniforms are gone with the patch they fed (Paul, WP-18 item 1);
// the merged fronts drive the sheen in #glow only
function paintDesk() { mergeFronts(); }

/**
 * WP-18P: the wet stamps' screen rects, measured in the clock's read phase (before this frame's
 * writes). Read inside the painter, after the stamps' own style writes, each one forced a restyle
 * and layout in the middle of the frame. @type {Map<string, DOMRect>}
 */
const stampRects = new Map();
clock.onRead(() => {
  if (!desk || !fresh.size) { if (stampRects.size) stampRects.clear(); return; }
  const now = clock.now();
  for (const m of METRICS) {
    const t = fresh.get(m), el = stampEl(m);
    if (t === undefined || !el || now - t >= MS.freshSheenDryMs) { stampRects.delete(m); continue; }
    stampRects.set(m, el.getBoundingClientRect());
  }
});

/** #glow painter: the damp sheen band on each front, and the fresh-ink sheen over new stamps. */
const sheenPainter = (/** @type {CanvasRenderingContext2D} */ ctx) => {
  const sheen = MW.sheenAlpha * MP.washDampSheen / 0.3;
  for (const f of fronts) {
    const x = Math.min(f.front, f.x1);
    if (x < f.x0) continue;
    const band = MW.sheenBandPx;
    const g = ctx.createLinearGradient(x - band, 0, x + 2, 0);
    g.addColorStop(0, 'rgba(255, 246, 225, 0)');
    g.addColorStop(0.75, `rgba(255, 246, 225, ${(sheen * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 246, 225, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.max(f.x0, x - band), f.y0, Math.min(band + 2, x - f.x0 + 2), f.y1 - f.y0);
  }
  const now = clock.now();
  for (const m of METRICS) {
    const t = fresh.get(m), el = stampEl(m);
    if (t === undefined || !el) continue;
    const wet = 1 - clamp01((now - t) / MS.freshSheenDryMs);
    if (wet <= 0) continue;
    const r = stampRects.get(m);
    if (!r) continue;
    const g = ctx.createRadialGradient(r.left + r.width * 0.4, r.top + r.height * 0.35, 0, r.left + r.width * 0.4, r.top + r.height * 0.35, Math.max(r.width, r.height) * 0.7);
    g.addColorStop(0, `rgba(255, 248, 230, ${(MW.stampSheenAlpha * wet).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 248, 230, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(r.left, r.top, r.width, r.height);
  }
};

/**
 * Called by the desk stage once the paper exists.
 * @param {{ glow: any, veil: any, shake: (amount: number, ms: number) => void, THREE?: any, addPatch?: (m: any, p: any) => void }} o
 */
export function attachDesk(o) {
  desk = { glow: o.glow, veil: o.veil, shake: o.shake, veilCanvas: /** @type {HTMLCanvasElement|null} */ (document.getElementById('veil')) };
  // Paul, WP-18 item 1: the damp band no longer darkens the paper, so the veil gets no patch (it drew
  // a dark square behind each washing piece; removed with its config in WP-18P); the fronts still
  // drive the light sheen in #glow
  o.glow?.hooks?.addSheen(sheenPainter);
  // the sheets now have their desk sizes; the desk's styles are in, so prepare the ghost sheet again
  clock.nextFrame(() => { redrawFrames(); decorate(!!seq); });
  whenIdle(prepareGhost);
}

// ── Wiring ────────────────────────────────────────────────────────────────────────────────────
function init() {
  if (!document.getElementById('metrics')) return;
  // selections: capture phase, so the ghost is taken before app.js renders the new view
  document.addEventListener('click', e => {
    const t = /** @type {Element} */ (e.target);
    if (!t?.closest) return;
    // the board stops mouse clicks on its bar proxies (the drag already selected): no ghost for those
    const board = /** @type {HTMLElement|null} */ (t.closest('.vc-board-print'));
    if (board && board.dataset.through !== '1') return;
    if (t.closest('#categories [data-category], #insightNav [data-category], #favorites [data-favorite-open]')) arm('category');
  }, true);
  document.addEventListener('change', e => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t?.id === 'mobileCategory') arm('category');
    else if (t?.id === 'saveFile' && t.files?.length) arm('load');
  }, true);
  document.addEventListener('drop', e => {
    const t = /** @type {Element} */ (e.target);
    if (t?.closest?.('#dropzone, #loadTop') && e.dataTransfer?.files.length) arm('load');
  }, true);

  on('app:render', () => { renders++; });
  on('bar:prelatch', prewarm);
  on('bar:springback', dropWarm);
  on('bar:drag', onBarDrag);
  on('bar:springback', dragFadeBack);
  // a click (nudge) never selects; a coupled bar coming home ends a stale fade
  on('bar:nudge', dragFadeBack);
  on('bar:return', d => { if (d?.category === dragFadeCat && !seq) dragFadeBack(); });
  on('app:render', () => {
    if (armed) return; // the view change that follows starts the sequence
    decorate(!!seq);
    smallUpdate();
    remember();
  });
  on('app:category', () => { start('category'); remember(); });
  on('app:load', d => {
    if (d?.ok) { if (armed === 'load' || armed === null) { start('load'); remember(); } }
    else if (armed === 'load') { armed = null; dropPending(); }
  });
  addEventListener('resize', () => redrawFrames());
  document.fonts?.ready.then(() => redrawFrames());
  // the first render happened before this module loaded: decorate it as already stamped
  decorate(false);
  remember();
  // the one-off work (wash masks, the ghost's style sheet) happens while the page is idle
  whenIdle(() => { masks(); prepareGhost(); fillGrainPool(); });
}
/** @param {() => void} fn */
function whenIdle(fn) { clock.idle(fn, { timeoutMs: 3000 }); } // WP-18P: the central scheduler's idle queue
if (typeof document !== 'undefined') init();

// ── Debug ─────────────────────────────────────────────────────────────────────────────────────
const api = {
  state: () => ({
    running: !!seq || startPending !== null, kind: seq?.kind ?? null, t: seq ? +(clock.now() - seq.t0).toFixed(1) : null,
    ghosts: ghostCount(), armed, ascii: asciiMode, units: units.length,
    grids: seq?.grids.map(g => ({ stamp: g.m, dots: g.at.length, fired: g.fired, last: g.at[g.at.length - 1] })) ?? [],
  }),
  log: () => seq?.log.slice() ?? [],
  cost: () => ({ ...cost }),
  /** WP-17 item 13: the drag fade now (0…1). */
  dragFade: () => +dragFadeK.toFixed(3),
  /** @param {boolean} on */
  enable(on) { enabled = !!on; if (!on) stop(); return enabled; },
  /** @param {{impact?: boolean, shake?: boolean}} [o] */
  off(o) { Object.assign(off, o ?? {}); return { ...off }; },
  grains: () => grainLog.slice(),
  fronts: () => fronts.map(f => ({ ...f })),
  /** WP-18A: the current sequence's units (name, direction, start and length in ms). */
  units: () => units.map(u => ({ name: u.name ?? '', dir: u.dir, start: u.start, dur: u.dur })),
  /** @param {'grain'|'scramble'|'both'} [m] */
  ascii(m) { if (m) asciiMode = m; return asciiMode; },
  masks: () => masks(),
  redrawFrames,
};
/** @type {any} */ (globalThis).__vc && (/** @type {any} */ (globalThis).__vc.ink = api);
export { api as ink };
