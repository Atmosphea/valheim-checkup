// @ts-check
/**
 * Paul, WP-17 item 17: the row-height slider. A vertical groove routed into the woodblock left of
 * all the bars, with a steel thumb that slides in it; sliding it up raises the table's row height.
 * The default row height is 1.3 × the WP-17A one; the choice is saved per viewer in localStorage
 * (try/catch, nothing leaves the device). Desk only (the flat page has no woodblock).
 *
 *   3D       the groove is one of the board's cut-outs (layout.js `cutouts`); the thumb is a
 *            rounded steel block with a small turned knob on top, in board cm under `root`
 *   proxy    a focusable `role="slider"` over the groove in the printed board layer: pointer drags
 *            read the board plane under the pointer; ↑/↓/PageUp/PageDown/Home/End move it
 *   table    `--vc-row-scale` on <html>; desk.css sets each row's height from it
 *
 * Events: `rows:height {scale, source}` (bus) on every change and `rows:press` / `rows:release`
 * around a drag (the gauntlet curls on press like on a bar).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { board as B, woodblock as WB } from '../config/layout.js';
import { board as BR, print as PR } from '../config/render.js';
import { createBrushedSteel, createKnurling } from '../scene/materials/index.js';
import { rowGroove } from './layout.js';
import { turnedKnobGeometry } from './bars.js';

const S = B.rowSlider;
const KEY = 'valheim-checkup:vc-row-height';
const PX = PR.pxPerCm;

/** Scale (×) ↔ position 0 (bottom) … 1 (top). */
export const toScale = (/** @type {number} */ v) => S.min + Math.max(0, Math.min(1, v)) * (S.max - S.min);
export const toPos = (/** @type {number} */ k) => (Math.max(S.min, Math.min(S.max, k)) - S.min) / (S.max - S.min);

/** The saved scale, or the default. */
export function savedScale() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (Number.isFinite(v) && v >= S.min && v <= S.max) return v;
  } catch { /* storage blocked */ }
  return S.def;
}
/** Write the scale to the page (and optionally save it). @param {number} k @param {boolean} [save] */
export function applyScale(k, save = false) {
  document.documentElement.style.setProperty('--vc-row-scale', k.toFixed(3));
  if (save) { try { localStorage.setItem(KEY, k.toFixed(3)); } catch { /* storage blocked or full */ } }
}

/**
 * @param {object} o
 * @param {import('../scene/textures/index.js').Textures} o.tex
 * @param {THREE.Object3D} o.root      the woodblock root (board cm)
 * @param {HTMLElement} o.boardEl      the printed board layer (board px, origin top-left)
 * @param {(cx: number, cy: number) => number | null} o.boardY   client px → board y (cm) on the thumb's plane
 * @param {(type: string, data: any) => void} o.emit
 */
export function createRowHeight(o) {
  const G = rowGroove();
  const T = B.thickness;
  const span = (G.y1 - G.y0) - S.knobH;
  // ── 3D thumb ─────────────────────────────────────────────────────────────────────────
  const group = new THREE.Group();
  group.name = 'row-height';
  const blockGeo = new RoundedBoxGeometry(S.knobW, S.knobH, 0.45, 4, 0.08);
  const blockMat = createBrushedSteel(o.tex, { half: new THREE.Vector3(S.knobW / 2, S.knobH / 2, 0.225), bevel: 0.08 });
  blockMat.name = 'row-height-thumb';
  blockMat.color.multiplyScalar(BR.barSteelTint);
  const block = new THREE.Mesh(blockGeo, blockMat);
  block.position.z = T - S.depth + 0.225;
  block.receiveShadow = true;
  const K = { ...B.knob, cap: 0.7, stem: 0.42, rise: 1.1 };
  const knobGeo = turnedKnobGeometry(K);
  const knobMat = createKnurling(o.tex, { repeat: BR.knobKnurlRepeat });
  knobMat.name = 'row-height-knob';
  knobMat.color.multiplyScalar(BR.knobSteelTint);
  knobMat.roughness = BR.knobRoughness;
  const knob = new THREE.Mesh(knobGeo, knobMat);
  knob.position.z = T - S.depth + 0.45;
  knob.castShadow = true; knob.receiveShadow = true;
  group.add(block, knob);
  group.position.x = (G.x0 + G.x1) / 2;
  o.root.add(group);

  // ── State ────────────────────────────────────────────────────────────────────────────
  let scale = savedScale();
  let shownPos = toPos(scale);
  let held = false, grabDy = 0;
  applyScale(scale);
  const yOf = (/** @type {number} */ v) => G.y0 + S.knobH / 2 + v * span;
  const place = () => { group.position.y = yOf(shownPos); };
  place();

  // ── Proxy ────────────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'vc-row-height';
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', 'Table row height');
  el.setAttribute('aria-orientation', 'vertical');
  el.setAttribute('aria-valuemin', String(Math.round(S.min * 100)));
  el.setAttribute('aria-valuemax', String(Math.round(S.max * 100)));
  el.tabIndex = 0;
  const px = (/** @type {number} */ cm) => `${(cm * PX).toFixed(2)}px`;
  Object.assign(el.style, { position: 'absolute', left: px(G.x0 - 0.2), top: px(B.height - G.y1), width: px(S.w + 0.4), height: px(G.y1 - G.y0) });
  const aria = () => { el.setAttribute('aria-valuenow', String(Math.round(scale * 100))); el.setAttribute('aria-valuetext', `${Math.round(scale * 100)} % row height`); };
  aria();
  o.boardEl.append(el);

  /** @param {number} k @param {string} source @param {boolean} save */
  const set = (k, source, save) => {
    const next = Math.max(S.min, Math.min(S.max, k));
    if (Math.abs(next - scale) < 1e-4 && !save) return;
    scale = next;
    applyScale(scale, save);
    aria();
    o.emit('rows:height', { scale: +scale.toFixed(3), source });
  };
  const posAt = (/** @type {PointerEvent} */ e) => { const y = o.boardY(e.clientX, e.clientY); return y === null ? null : (y - grabDy - G.y0 - S.knobH / 2) / span; };
  let pid = -1;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const y = o.boardY(e.clientX, e.clientY);
    if (y === null) return;
    e.preventDefault(); e.stopPropagation();
    const ky = yOf(toPos(scale));
    // grabbing the thumb keeps the grab point; a press elsewhere in the groove jumps the thumb there
    grabDy = Math.abs(y - ky) <= S.knobH / 2 ? y - ky : 0;
    held = true; pid = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    o.emit('rows:press', {});
    const p = posAt(e); if (p !== null) set(toScale(p), 'pointer', false);
  });
  el.addEventListener('pointermove', e => { if (!held || e.pointerId !== pid) return; const p = posAt(e); if (p !== null) set(toScale(p), 'pointer', false); });
  const end = (/** @type {PointerEvent} */ e) => { if (!held || e.pointerId !== pid) return; held = false; pid = -1; set(scale, 'pointer', true); o.emit('rows:release', { scale: +scale.toFixed(3) }); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('click', e => { e.stopPropagation(); });
  el.addEventListener('keydown', e => {
    const step = (S.max - S.min) / 24;
    const k = { ArrowUp: scale + step, ArrowRight: scale + step, ArrowDown: scale - step, ArrowLeft: scale - step, PageUp: scale + step * 4, PageDown: scale - step * 4, Home: S.min, End: S.max }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    set(k, 'keyboard', true);
  });

  return {
    group, el, groove: G,
    held: () => held,
    scale: () => scale,
    /** Thumb's knob in world cm (the gauntlet pinches it). */
    knobWorld: () => ({ x: WB.x0 + group.position.x, y: WB.y0 + group.position.y, z: T - S.depth + 0.45 + K.rise * 0.66 }),
    /** Client px of the thumb (tests). @param {(x: number, y: number, z: number) => {x: number, y: number}} project */
    thumb: project => project(WB.x0 + group.position.x, WB.y0 + group.position.y, T - S.depth + 0.45),
    /** @param {number} dt ms */
    update(dt) {
      const target = toPos(scale);
      shownPos += (target - shownPos) * Math.min(1, dt / 70);
      if (Math.abs(target - shownPos) < 1e-4) shownPos = target;
      place();
    },
    casters: [knob],
    dispose() { blockGeo.dispose(); blockMat.dispose(); knobGeo.dispose(); knobMat.dispose(); el.remove(); },
  };
}
