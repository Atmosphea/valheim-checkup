// @ts-check
/**
 * Paul, WP-17 item 20: wood burning. Click and drag on the wood (the desk around the paper and the
 * woodblock's bevelled border, never the paper or a control) burns a drawing into it, with a glowing
 * ember edge that cools. The drawings are saved per viewer in localStorage (try/catch) and drawn
 * again on the next visit; nothing leaves the device (Paul's privacy rule).
 *
 *   char     a canvas over the desk in world cm (`R.rect`, `R.charPx` px/cm), white = burned;
 *            the desk planks and the woodblock's top sample it by world position and darken
 *   heat     a coarser canvas (`R.heatPx`), white = glowing; it fades every frame (`R.coolMs`)
 *            and adds the ember colour (config `ember`, the same look as the burned labels)
 *   strokes  stored as polylines in 0.1 cm steps (`R.maxPoints` in all; the oldest go first)
 *
 * Events: `wood:burn-start {x, y, on}` and `wood:burn-end {points}` (on: 'desk' | 'board').
 */
import * as THREE from 'three';
import { board as B, woodblock as WB, sheet, inset } from '../config/layout.js';
import { ember as EM, woodBurn as R } from '../config/render.js';
import { addPatch, lin } from './materials/patch.js';

const KEY = 'valheim-checkup:vc-wood-burns';
const CONTROL = 'button, a, input, select, textarea, label, summary, details, dialog, [role="button"], [role="slider"], [role="tab"], [tabindex], .vc-coin-print, .vc-menu';

/** @typedef {{ w: number, p: number[] }} Stroke   p = x0, y0, x1, y1 … in 0.1 cm */

/** The saved strokes (empty when storage is blocked or the data is not ours). @returns {Stroke[]} */
export function loadStrokes() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && d.v === 1 && Array.isArray(d.s)) return d.s.filter((/** @type {any} */ s) => s && Array.isArray(s.p) && s.p.length >= 2 && s.p.every(Number.isFinite));
  } catch { /* storage blocked or bad data */ }
  return [];
}
/** @param {Stroke[]} list */
function saveStrokes(list) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: list })); } catch { /* storage blocked or full */ } }

/**
 * Where a world point may be burned: 'desk' (outside the paper), 'board' (the woodblock's border
 * band), or null. Pure, for tests. @param {{x: number, y: number} | null} desk  pointer on z 0
 * @param {{x: number, y: number} | null} top  pointer on the board's top (z = thickness)
 */
export function burnable(desk, top) {
  if (top && top.x >= WB.x0 && top.x <= WB.x1 && top.y >= WB.y0 && top.y <= WB.y1) {
    const bx = top.x - WB.x0, by = top.y - WB.y0, e = B.border;
    return bx < e || bx > B.width - e || by < e || by > B.height - e ? 'board' : null;
  }
  if (!desk) return null;
  const onSheet = (r, m = 0) => desk.x >= r.x0 - m && desk.x <= r.x1 + m && desk.y >= r.y0 - m && desk.y <= r.y1 + m;
  // the deckled edge reaches ~0.6 cm past the sheet's rectangle in places
  if (onSheet(sheet, 0.8) || onSheet(inset)) return null;
  return 'desk';
}

/**
 * @param {object} o
 * @param {THREE.Camera} o.camera
 * @param {THREE.Material[]} o.materials   the desk planks' and the woodblock top's materials
 * @param {(cx: number, cy: number, z: number) => {x: number, y: number} | null} o.toPlane
 * @param {(fn: () => boolean) => void} o.keepAwake   the stage draws while this returns true
 * @param {(type: string, data: any) => void} o.emit
 * @param {() => number} o.now
 */
export function createWoodBurn(o) {
  const RW = R.rect.x1 - R.rect.x0, RH = R.rect.y1 - R.rect.y0;
  const mk = (/** @type {number} */ ppc) => { const c = document.createElement('canvas'); c.width = Math.round(RW * ppc); c.height = Math.round(RH * ppc); const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); return { c, g, ppc }; };
  const char = mk(R.charPx), heat = mk(R.heatPx);
  const tex = (/** @type {HTMLCanvasElement} */ c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.flipY = false; return t; };
  const charTex = tex(char.c), heatTex = tex(heat.c);
  const uniforms = {
    uBurnChar: { value: charTex }, uBurnHeat: { value: heatTex },
    uBurnRect: { value: new THREE.Vector4(R.rect.x0, R.rect.y1, RW, RH) },
    uBurnEmber: { value: lin(EM.color).multiplyScalar(EM.intensity * R.emberGain) },
    uBurnHot: { value: lin(EM.hot).multiplyScalar(EM.intensity * R.emberGain) },
    uBurnDark: { value: R.darken },
  };
  for (const m of o.materials) {
    addPatch(m, {
      key: 'woodBurn',
      uniforms,
      vertexHead: 'varying vec2 vcBurnW;',
      vertexBody: 'vcBurnW = (modelMatrix * vec4(position, 1.0)).xy;',
      fragmentHead: 'uniform sampler2D uBurnChar; uniform sampler2D uBurnHeat; uniform vec4 uBurnRect; uniform vec3 uBurnEmber; uniform vec3 uBurnHot; uniform float uBurnDark; varying vec2 vcBurnW;',
      // canvas y runs down the page: v = (top − y) / height
      afterMap: `vec2 vcBurnUv = vec2((vcBurnW.x - uBurnRect.x) / uBurnRect.z, (uBurnRect.y - vcBurnW.y) / uBurnRect.w);
        float vcBurnIn = step(0.0, vcBurnUv.x) * step(vcBurnUv.x, 1.0) * step(0.0, vcBurnUv.y) * step(vcBurnUv.y, 1.0);
        float vcChar = texture2D(uBurnChar, vcBurnUv).r * vcBurnIn;
        diffuseColor.rgb *= 1.0 - uBurnDark * vcChar;`,
      afterEmissive: `{ float h = texture2D(uBurnHeat, vcBurnUv).r * vcBurnIn; totalEmissiveRadiance += mix(uBurnEmber, uBurnHot, smoothstep(0.85, 1.0, h) * 0.6) * h * h; }`,
    });
  }

  /** @type {Stroke[]} */
  let strokes = loadStrokes();
  const px = (/** @type {typeof char} */ L, /** @type {number} */ x, /** @type {number} */ y) => [(x - R.rect.x0) * L.ppc, (R.rect.y1 - y) * L.ppc];
  /** One burned segment (cm). @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} w */
  function burnSeg(x0, y0, x1, y1, w) {
    const g = char.g;
    const [a, b] = px(char, x0, y0), [c, d] = px(char, x1, y1);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // the scorched halo, then the char line itself (a few passes darken it, like a real pen)
    g.strokeStyle = `rgba(255,255,255,${R.haloAlpha})`; g.lineWidth = w * R.haloScale * char.ppc;
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${R.lineAlpha})`; g.lineWidth = w * char.ppc;
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
  }
  function redrawAll() {
    char.g.globalCompositeOperation = 'source-over';
    char.g.fillStyle = '#000'; char.g.fillRect(0, 0, char.c.width, char.c.height);
    char.g.globalCompositeOperation = 'lighter';
    for (const s of strokes) for (let i = 2; i < s.p.length; i += 2) burnSeg(s.p[i - 2] / 10, s.p[i - 1] / 10, s.p[i] / 10, s.p[i + 1] / 10, s.w);
    // a single dot
    for (const s of strokes) if (s.p.length === 2) burnSeg(s.p[0] / 10, s.p[1] / 10, s.p[0] / 10 + 0.01, s.p[1] / 10, s.w);
    charTex.needsUpdate = true;
  }
  if (strokes.length) redrawAll();
  char.g.globalCompositeOperation = 'lighter';

  // ── heat: glowing where the pen just was, cooling every frame ────────────────────────
  let hot = 0; // ms of glow left (an upper bound)
  /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} w */
  function heatSeg(x0, y0, x1, y1, w) {
    const g = heat.g;
    const [a, b] = px(heat, x0, y0), [c, d] = px(heat, x1, y1);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = w * R.heatScale * heat.ppc;
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
    g.globalCompositeOperation = 'source-over';
    hot = R.coolMs * 4;
  }
  let lastT = o.now();
  o.keepAwake(() => hot > 0 || drawing);
  function cool() {
    const t = o.now(), dt = Math.min(100, t - lastT); lastT = t;
    if (hot <= 0) return;
    hot -= dt;
    heat.g.globalCompositeOperation = 'source-over';
    heat.g.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-dt / R.coolMs)).toFixed(4)})`;
    heat.g.fillRect(0, 0, heat.c.width, heat.c.height);
    if (hot <= 0) { heat.g.fillStyle = '#000'; heat.g.fillRect(0, 0, heat.c.width, heat.c.height); }
    heatTex.needsUpdate = true;
  }

  // ── pointer ──────────────────────────────────────────────────────────────────────────
  let drawing = false, pid = -1;
  // WP-17C (17B overlap): nothing burns until the pointer has moved past the click zoom's 6 px
  // click radius (stage.js), so a plain click on the wood only zooms and a drag only burns.
  const DRAG_PX = 6;
  /** @type {{ p: {on: string, x: number, y: number}, x: number, y: number } | null} */ let pending = null;
  /** @type {Stroke | null} */ let cur = null;
  let last = /** @type {{x: number, y: number} | null} */ (null);
  let charDirty = false;
  /** @param {PointerEvent} e */
  const where = e => {
    const desk = o.toPlane(e.clientX, e.clientY, 0), top = o.toPlane(e.clientX, e.clientY, B.thickness);
    const on = burnable(desk, top);
    return on ? { on, ...(on === 'board' ? /** @type {{x: number, y: number}} */ (top) : /** @type {{x: number, y: number}} */ (desk)) } : null;
  };
  const blocked = (/** @type {Event} */ e) => {
    const t = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
    return !!t?.closest(CONTROL) || document.body.classList.contains('vc-modal-open') || document.body.classList.contains('vc-help-open');
  };
  /** @param {{x: number, y: number}} p */
  const add = p => {
    if (!cur) return;
    const q = [Math.round(p.x * 10), Math.round(p.y * 10)];
    const n = cur.p.length;
    if (n >= 2 && Math.hypot(q[0] - cur.p[n - 2], q[1] - cur.p[n - 1]) < R.stepCm * 10) return;
    if (last) { burnSeg(last.x, last.y, q[0] / 10, q[1] / 10, cur.w); heatSeg(last.x, last.y, q[0] / 10, q[1] / 10, cur.w); }
    else { burnSeg(q[0] / 10, q[1] / 10, q[0] / 10 + 0.01, q[1] / 10, cur.w); heatSeg(q[0] / 10, q[1] / 10, q[0] / 10 + 0.01, q[1] / 10, cur.w); }
    cur.p.push(q[0], q[1]);
    last = { x: q[0] / 10, y: q[1] / 10 };
    charDirty = true;
  };
  const endStroke = () => {
    if (cur && cur.p.length >= 2) {
      strokes.push(cur);
      // keep the drawings bounded: drop the oldest strokes past maxPoints
      let total = strokes.reduce((n, s) => n + s.p.length / 2, 0), cut = false;
      while (total > R.maxPoints && strokes.length > 1) { total -= /** @type {Stroke} */ (strokes.shift()).p.length / 2; cut = true; }
      if (cut) redrawAll();
      saveStrokes(strokes);
    }
    cur = null; last = null;
  };
  /** @param {PointerEvent} e */
  const onDown = e => {
    if (e.button !== 0 || !e.isPrimary || e.pointerType === 'touch' || blocked(e)) return;
    const p = where(e);
    if (!p) return;
    drawing = true; pid = e.pointerId;
    cur = null;
    pending = { p, x: e.clientX, y: e.clientY };
  };
  /** @param {PointerEvent} e */
  const onMove = e => {
    if (!drawing || e.pointerId !== pid) return;
    if (pending) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <= DRAG_PX) return;
      cur = { w: R.widthCm, p: [] };
      add(pending.p);
      o.emit('wood:burn-start', { on: pending.p.on });
      pending = null;
    }
    const p = where(e);
    // leaving the wood (onto the paper, a control or the board's field) lifts the pen
    if (!p) { if (cur && cur.p.length) { endStroke(); cur = { w: R.widthCm, p: [] }; } return; }
    if (!cur) cur = { w: R.widthCm, p: [] };
    for (const ev of /** @type {PointerEvent[]} */ (e.getCoalescedEvents?.() ?? [e])) { const q = ev === e ? p : where(ev); if (q) add(q); }
  };
  /** @param {PointerEvent} e */
  const onUp = e => {
    if (!drawing || e.pointerId !== pid) return;
    drawing = false; pid = -1;
    // a plain click (never moved past the click radius) burns nothing and makes no sound
    if (pending) { pending = null; cur = null; return; }
    const n = cur?.p.length ?? 0;
    endStroke();
    o.emit('wood:burn-end', { points: n / 2 });
  };
  addEventListener('pointerdown', onDown, { capture: true, passive: true });
  addEventListener('pointermove', onMove, { capture: true, passive: true });
  addEventListener('pointerup', onUp, { capture: true, passive: true });
  addEventListener('pointercancel', onUp, { capture: true, passive: true });

  return {
    /** Per frame (before rendering). */
    update() {
      if (charDirty) { charDirty = false; charTex.needsUpdate = true; }
      cool();
    },
    state: () => ({ strokes: strokes.length, points: strokes.reduce((n, s) => n + s.p.length / 2, 0), drawing, hot: Math.max(0, Math.round(hot)) }),
    /** Tests: the char and heat values (0…1) at a world point. @param {number} x @param {number} y */
    sample(x, y) {
      const at = (/** @type {typeof char} */ L) => { const [a, b] = px(L, x, y); return L.g.getImageData(Math.round(a), Math.round(b), 1, 1).data[0] / 255; };
      return { char: at(char), heat: at(heat) };
    },
    burnable,
    /** Tests: what a client point would burn (null = nothing). @param {number} cx @param {number} cy */
    at: (cx, cy) => where(/** @type {any} */ ({ clientX: cx, clientY: cy })),
    /** Tests / reset: forget every drawing. */
    clear() { strokes = []; saveStrokes(strokes); redrawAll(); char.g.globalCompositeOperation = 'lighter'; },
    dispose() {
      removeEventListener('pointerdown', onDown, true); removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true);
      charTex.dispose(); heatTex.dispose();
    },
  };
}
