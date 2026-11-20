// @ts-check
/**
 * WP-06: the woodblock, its 13 steel bars, the plaque and the five coins, wired to the app.
 * Created by the desk stage (src/scene/stage.js) once its scene, camera and printed layer exist.
 *
 * Every frame (physics phase): the mechanism moves the bars; the brass inlays, tab counts and
 * plaque wheels follow what the app shows in its own (now invisible) controls; coins run
 * their reactions; moving things stir the breeze; the paper lifts in it.
 *
 * Debug API: `__vc.board` (state, events helpers, test hooks) and `__vc.engraved()`
 * (every carved string by slot id, DECISIONS point 12).
 */
import * as THREE from 'three';
import './board.css';
import { emit, on } from '../bus.js';
import { clock } from '../util/clock.js';
import { rng } from '../util/rng.js';
import { ease } from '../util/ease.js';
import { vc } from '../debug.js';
import { STRINGS } from '../strings.js';
import { bar as MB, coin as MC, breeze as MBz } from '../config/motion.js';
import { woodblock as WB, board as B, sheet, inset as LI, coins as LC } from '../config/layout.js';
import { board as BR, print as PR } from '../config/render.js';
import { createEngraver } from '../scene/textures/engrave.js';
import { refreshEngraving, setEngravingWipe } from '../scene/materials/index.js';
import { patchUniforms } from '../scene/materials/patch.js';
import { breeze } from '../scene/breeze.js';
import { impact, onImpact } from '../scene/impact.js';
import { createPaperLift } from '../scene/paper-lift.js';
import { createMechanism } from './mechanism.js';
import { createWoodblock, WHEEL_FACES } from './woodblock.js';
import { createBars } from './bars.js';
import { createCoins } from './coins.js';
import { createProxies } from './proxies.js';
import { createBurns } from './burn.js';
import { createRowHeight } from './rowheight.js';
import { rows, plaque as plaqueLayout } from './layout.js';
import { tabEntries, loadLegend } from './engravings.js';
import { clientToPlane } from './geometry.js';

/**
 * @param {object} ctx
 * @param {THREE.Scene} ctx.scene
 * @param {THREE.PerspectiveCamera} ctx.camera
 * @param {ReturnType<typeof import('../scene/placeholders.js').buildPlaceholders>} ctx.parts
 * @param {ReturnType<typeof import('../scene/veil.js').createVeil>} ctx.veil
 * @param {{ refresh(): void }} ctx.post
 * @param {import('../scene/textures/index.js').Textures} ctx.tex
 * @param {(el: HTMLElement, rect: {x0: number, y0: number, w: number, h: number, z?: number}) => any} ctx.addPrinted
 * @param {(phase: any, fn: (dt: number, t: number) => void) => () => void} ctx.onPhase
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} ctx.project
 * @param {{ fxPainters: Set<(ctx: CanvasRenderingContext2D, w: number, h: number) => void> }} ctx.overlays
 * @param {{ state: { inside: boolean, x: number, y: number, speed: number } }} ctx.input
 * @param {() => void} ctx.printDirty
 */
export function createBoard(ctx) {
  const now = () => clock.now();
  const R = rows();
  const T = B.thickness;
  const fork = rng.fork();
  const rnd = () => fork.next();

  // ── Replace the WP-04 placeholders (box and discs) with the real objects ────────────────
  const { parts, veil } = ctx;
  const drop = (/** @type {THREE.Object3D|undefined|null} */ m) => {
    if (!m) return;
    m.parent?.remove(m);
    veil.removeCaster(m);
    for (const list of [parts.hoverables, parts.casters]) { const i = list.indexOf(/** @type {any} */ (m)); if (i >= 0) list.splice(i, 1); }
    /** @type {THREE.Mesh} */ (m).geometry?.dispose();
  };
  drop(parts.block);
  for (const c of LC) drop(parts.root.getObjectByName(`coin-${c.id}`));

  const tabEngraver = createEngraver(ctx.tex.painter, { size: 512 });
  const wood = createWoodblock(ctx.tex, { tabEngraver });
  const bars = createBars(ctx.tex, wood.root);
  const coins = createCoins(ctx.tex, { emit, now, rng: fork, impact });
  parts.root.add(wood.root, coins.root); // under the stage's root, findable by the WP-04 names ('woodblock', 'coin-<id>')
  for (const m of [...wood.casters, ...coins.casters]) veil.addCaster(/** @type {THREE.Mesh} */ (m));
  // the stage's hover raycast (WP-04 `input().hover`) sees the real coins under their old names
  for (const c of coins.coins.values()) parts.hoverables.push(/** @type {any} */ (c.front));
  ctx.post.refresh();

  // ── Mechanism ────────────────────────────────────────────────────────────────────────────
  const current = /** @type {HTMLElement|null} */ (document.querySelector('#categories [aria-current="page"], #insightNav [aria-current="page"]'))?.dataset.category ?? 'The Master Chef';
  /** @type {ReturnType<typeof createProxies>} */
  let proxies;
  const hint = createHint(ctx);
  const mech = createMechanism({
    categories: R.map(r => r.category),
    latched: current,
    travel: B.travel,
    emit,
    now,
    random: rnd,
    select: category => proxies.selectThrough(category),
    onHint: category => hint.show(category),
    onContact(b, kind) {
      const w = worldOfBar(b.index);
      if (kind === 'latch') { bars.puff(b.index, now(), rnd); impact({ strength: MB.latchImpact, x: w.x, y: w.y, source: 'bar' }); }
      if (kind === 'return') impact({ strength: MB.returnImpact, x: w.x, y: w.y, source: 'bar' });
    },
  });
  /** World position of a bar's knob end (Paul, WP-16 item 9: travel goes right). @param {number} i */
  const worldOfBar = i => {
    const r = R[i], s = mech.bars[i];
    return { x: WB.x0 + r.barRestX0 + s.pos.value + B.bar.length, y: WB.y0 + r.cy };
  };
  /** WP-16 item 11: the height of the turned knob's grip centre (where fingers hold it). */
  const gripZ = T - B.groove.depth + B.bar.thickness + B.knob.rise * 0.66;
  // the app selected a view some other way (phone menu, favourite tag, restore, P18 tests)
  on('app:category', d => mech.sync(String(d?.title ?? '')));

  // ── Proxies ──────────────────────────────────────────────────────────────────────────────
  const W = () => innerWidth, H = () => innerHeight;
  proxies = createProxies({
    addPrinted: ctx.addPrinted,
    boardX(cx, cy) { const p = clientToPlane(ctx.camera, cx, cy, W(), H(), T - B.groove.depth + B.bar.thickness); return p ? p.x - WB.x0 : null; },
    paperAt(cx, cy) { const p = clientToPlane(ctx.camera, cx, cy, W(), H(), 0); return p ? { x: p.x, y: p.y } : null; },
    bars: {
      press: (i, x) => mech.press(i, x),
      move: (i, x) => mech.move(i, x),
      release: i => mech.release(i),
      cancel: i => mech.cancel(i),
      activate: i => mech.activate(i),
      hover(i, onOff) { mech.hover(i, onOff); if (onOff) bars.glint(i, now()); },
    },
    coins: {
      hover: (id, dx, dy) => { coins.hover(id, dx, dy); },
      press: (id, down) => coins.press(id, down),
      focus: (id, onOff) => coins.focus(id, onOff),
      click(id) {
        if (id === 'import' || id === 'export') { if (!(id === 'export' && /** @type {HTMLButtonElement} */ (document.getElementById('exportProgress'))?.disabled)) coins.flip(id, 'transfer'); }
        if (id === 'sound') {
          const muted = !!(/** @type {any} */ (vc).sound?.muted?.());
          emit('coin:mute', { coin: 'sound', muted: !muted });
        }
      },
    },
    barFocus: (i, onOff) => bars.focus(i, onOff),
  });

  // ── Paul, WP-17 item 17: the row-height slider in its groove left of the bars ─────────────
  const rowHeight = createRowHeight({
    tex: ctx.tex, root: wood.root, boardEl: proxies.boardEl, emit,
    boardY(cx, cy) { const p = clientToPlane(ctx.camera, cx, cy, W(), H(), T - B.rowSlider.depth + 0.45); return p ? p.y - WB.y0 : null; },
  });
  for (const m of rowHeight.casters) veil.addCaster(/** @type {THREE.Mesh} */ (m));

  // ── Whole-sheet file drop (P44) and file-drag reactions ──────────────────────────────────
  let dragDepth = 0;
  const hasFiles = (/** @type {DragEvent} */ e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const onDragEnter = (/** @type {DragEvent} */ e) => {
    if (!hasFiles(e)) return;
    if (dragDepth++ === 0) { coins.setFileDrag(true); emit('drag:file-enter', {}); }
  };
  const onDragLeave = (/** @type {DragEvent} */ e) => {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) { dragDepth = 0; coins.setFileDrag(false); emit('drag:file-leave', {}); }
  };
  const onDragOver = (/** @type {DragEvent} */ e) => { if (hasFiles(e)) e.preventDefault(); };
  const accepted = (/** @type {DragEvent} */ e) => { const f = e.dataTransfer?.files?.[0]; return !!f && /\.fch$/i.test(f.name); };
  /** drops forwarded to #loadTop pass the window listeners again: count each drop once */
  const forwarded = new WeakSet();
  const onDropCapture = (/** @type {DragEvent} */ e) => {
    if (!hasFiles(e) || forwarded.has(e)) return;
    dragDepth = 0; coins.setFileDrag(false);
    const p = clientToPlane(ctx.camera, e.clientX, e.clientY, W(), H(), 0);
    emit('drop:file', { x: p ? +p.x.toFixed(2) : 0, y: p ? +p.y.toFixed(2) : 0 });
    if (accepted(e)) coins.flip('load', 'drop');
  };
  // drops the app's own targets didn't take (they stop propagation): forward to the Load control
  const onDrop = (/** @type {DragEvent} */ e) => {
    if (!hasFiles(e) || e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const load = document.getElementById('loadTop');
    if (!load) return;
    const fwd = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: e.dataTransfer, clientX: e.clientX, clientY: e.clientY });
    forwarded.add(fwd);
    load.dispatchEvent(fwd);
  };
  addEventListener('dragenter', onDragEnter, true);
  addEventListener('dragleave', onDragLeave, true);
  addEventListener('dragover', onDragOver);
  addEventListener('drop', onDropCapture, true);
  addEventListener('drop', onDrop);

  // save loaded / failed
  const motes = createMotes(ctx, coins);
  on('app:load', d => {
    if (d?.ok) { coins.flash('load'); motes.burst(); } else coins.shake('load');
  });

  // impacts: bars rattle, coins may hop
  const offImpactBars = on('impact', e => {
    mech.impact(b => { const w = worldOfBar(b.index); return e.strength / (1 + Math.hypot(w.x - e.x, w.y - e.y) / 20) * (e.source === 'bar' ? 0.5 : 1); });
    coins.impact(c => { const p = c.base.position; return e.strength / (1 + Math.hypot(p.x - e.x, p.y - e.y) / 20); });
  });

  // ── Paper in the breeze ─────────────────────────────────────────────────────────────────
  const paperLift = createPaperLift([
    { mesh: parts.main, name: 'main', ...sheet, z: parts.main.position.z },
    { mesh: parts.inset, name: 'inset', x0: LI.x0, x1: LI.x1, y0: LI.y0, y1: LI.y1, z: parts.inset.position.z },
  ], { breeze, emit });

  // ── Readouts: inlays, tabs, plaque wheels follow the app's own numbers ───────────────────
  const read = createReadouts(wood, tabEngraver, bars);

  // ── Load coin legend: 180 ms wipe when the label changes (DECISIONS point 11) ────────────
  let loadHasSave = !!document.querySelector('#loadTop.has-save');
  let wipe = /** @type {{t0: number, to: boolean} | null} */ (null);
  const loadFront = /** @type {THREE.MeshPhysicalMaterial} */ (coins.coins.get('load')?.frontMat);
  const loadBack = /** @type {THREE.MeshPhysicalMaterial} */ (coins.coins.get('load')?.backMat);
  const legendSlot = (/** @type {boolean} */ has) => (has ? 'coin:load:alt' : 'coin:load');

  // ── After the atlas is drawn: point every engraved material at its slot ──────────────────
  let engraved = false;
  function refreshAll() {
    const E = ctx.tex.engraver;
    refreshEngraving(wood.topMaterial, E);
    refreshEngraving(wood.plaqueMaterial, E);
    for (const b of bars.list) fitBarName(b.bodyMat, E, `bar:${b.row.category}`);
    for (const c of coins.coins.values()) {
      if (c.id === 'load') { refreshEngraving(c.frontMat, E, { slotId: legendSlot(loadHasSave), altSlotId: legendSlot(loadHasSave) }); refreshEngraving(c.backMat, E, { slotId: legendSlot(loadHasSave), altSlotId: legendSlot(loadHasSave) }); }
      else { refreshEngraving(c.frontMat, E); refreshEngraving(c.backMat, E); }
    }
    engraved = true;
    // Paul, WP-16 item 12: the burned labels, drawn once the fonts are in (the atlas waits for them too)
    if (!burns) { burns = createBurns(wood.root); ctx.printDirty(); }
  }
  /** @type {ReturnType<typeof createBurns> | null} */
  let burns = null;
  ctx.tex.engraver.onEngrave(refreshAll);
  if (ctx.tex.engraver.slot('board:face')) refreshAll();

  const lastPointer = { x: 0, y: 0, ok: false };

  // ── Per frame ────────────────────────────────────────────────────────────────────────────
  /** Paul, WP-18 item 8: coins under the pointer last frame. @type {Set<string>} */
  const coinOver = new Set();
  const offPhase = ctx.onPhase('physics', (/** @type {number} */ dt) => {
    const t = now();
    mech.step(dt);
    rowHeight.update(dt);
    // Paul, WP-18 item 8: coin hover is a round hit test on each coin's face, at the face's own
    // height, every frame (the square HTML proxy's pointerenter missed the rim and the corners
    // overlapped neighbours now that the coins sit closer); entering a coin hops it
    {
      const s = /** @type {any} */ (ctx.input.state);
      for (const c of coins.coins.values()) {
        let over = false;
        if (s.inside && Number.isFinite(s.clientX)) {
          const p = clientToPlane(ctx.camera, s.clientX, s.clientY, W(), H(), c.t);
          const bp = c.base.position;
          over = !!p && Math.hypot(p.x - bp.x, p.y - bp.y) <= c.r * MC.hoverHitScale;
          if (over && !coinOver.has(c.id) && p) coins.hover(c.id, p.x - bp.x, p.y - bp.y);
        }
        if (over) coinOver.add(c.id); else coinOver.delete(c.id);
      }
    }
    const scale = Math.max(1, ctx.project(WB.x0 + 1, WB.y0).x - ctx.project(WB.x0, WB.y0).x) * devicePixelRatio;
    bars.update(mech, t, dt, scale * 2.2);
    proxies.follow(i => { const s = mech.bars[i]; return s.pos.value + s.nudge.value + s.rattle.value; });
    // breeze: dragged bars and the pointer
    for (const [i, s] of mech.bars.entries()) {
      const v = Math.abs(s.pos.velocity);
      if (v > 5) { const w = worldOfBar(i); breeze.write(w.x, w.y, v * MBz.barGain, MBz.barRadius); }
    }
    // (the pointer's own breeze is written by the gauntlet and the spark, WP-09)
    breeze.step(dt);
    paperLift.update(dt);
    // coins: Sound face, Export dimmed, Load legend wipe
    coins.setFace('sound', !!(/** @type {any} */ (vc).sound?.muted?.()));
    // WP-16A: write on change only (an attribute write every frame restyles the page)
    const pressed = String(!(/** @type {any} */ (vc).sound?.muted?.()));
    if (proxies.soundButton.getAttribute('aria-pressed') !== pressed) proxies.soundButton.setAttribute('aria-pressed', pressed);
    coins.setDimmed('export', !!(/** @type {HTMLButtonElement|null} */ (document.getElementById('exportProgress')))?.disabled);
    const has = !!document.querySelector('#loadTop.has-save');
    if (has !== loadHasSave && engraved) {
      loadHasSave = has;
      wipe = { t0: t, to: has };
      for (const m of [loadFront, loadBack]) refreshEngraving(m, ctx.tex.engraver, { altSlotId: legendSlot(has) });
    }
    if (wipe) {
      const x = Math.min(1, (t - wipe.t0) / 180);
      for (const m of [loadFront, loadBack]) setEngravingWipe(m, x);
      if (x >= 1) { for (const m of [loadFront, loadBack]) { refreshEngraving(m, ctx.tex.engraver, { slotId: legendSlot(wipe.to), altSlotId: legendSlot(wipe.to) }); setEngravingWipe(m, 0); } wipe = null; }
    }
    coins.update(dt);
    if (engraved) read.update(t);
    hint.update(t);
  });

  // ── Debug and test API ───────────────────────────────────────────────────────────────────
  const api = {
    mechanism: mech,
    state: () => ({ latched: mech.latched, bars: mech.state(), notches: bars.notches(), readouts: read.state(), paper: paperLift.read(), coins: [...coins.coins.values()].map(c => ({ id: c.id, z: +c.body.position.z.toFixed(3), face: c.face, hopping: !!c.hop, flipping: !!c.flip, spinning: !!c.spinAnim, hopT0: c.hop ? +c.hop.t0.toFixed(1) : null, r: c.r, at: c.base.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)) })) }),
    rows: R,
    rowHeight,
    /** WP-09: world centre of a bar's knob (cm). WP-16: at the turned knob's grip, where the fingers pinch it. @param {number} i */
    knobWorld(i) { const w = worldOfBar(i); return { x: w.x + B.knob.length / 2, y: w.y, z: gripZ }; },
    /** WP-09: index of the bar the user is holding (pinched or dragging), or −1. */
    held: () => mech.bars.findIndex(b => !!b.drag),
    /** WP-09: the held bar's speed along the groove (cm/s, + = toward the knob side, which WP-16 made the latch side). */
    heldVelocity() { const b = mech.bars.find(x => !!x.drag); return b ? b.pos.velocity : 0; },
    /** WP-09: coin rune glow 0…1 near the spark. @param {string} id @param {number} v */
    setRuneGlow: (id, v) => coins.setRuneGlow(id, v),
    coinTimings: coins.timings,
    /** Client px of a bar's knob centre (for real-pointer drags in tests). @param {string} category */
    knob(category) {
      const i = R.findIndex(r => r.category === category);
      const w = worldOfBar(i);
      return ctx.project(w.x + B.knob.length / 2, w.y, T - B.groove.depth + B.bar.thickness); // the plane drags are read on
    },
    /** Client px of a point on the bar's plane at board x (cm). @param {string} category @param {number} boardX */
    slotPoint(category, boardX) {
      const r = R.find(x => x.category === category);
      return r ? ctx.project(WB.x0 + boardX, WB.y0 + r.cy, T - B.groove.depth + B.bar.thickness) : null;
    },
    coin: (/** @type {string} */ id) => { const c = coins.coins.get(id); return c ? ctx.project(c.base.position.x, c.base.position.y, c.t) : null; },
    impact,
    breeze,
    hint: () => hint.visible(),
    objects: { wood, bars, coins, get burns() { return burns; } },
    /** @type {() => Record<string, string>} */
    engraved: () => ({}),
  };
  /** @type {any} */ (vc).board = api;
  /** Every engraved string by slot id (DECISIONS point 12): the main atlas plus the tab counts. */
  api.engraved = () => ({ ...ctx.tex.engraver.list(), ...tabEngraver.list() });
  /** @type {any} */ (vc).engraved = api.engraved;
  void STRINGS; void MC; void BR; void PR; void offImpactBars; void offPhase; void onImpact; void ease; void plaqueLayout; void loadLegend; void WHEEL_FACES; void patchUniforms;
  return api;
}

/**
 * Bar names fill their face at the slot's own proportions: a 1.2 cm text box (WP-16: was 0.72 on
 * the 1.0 cm bar), at most 9.2 cm wide, from 0.9 cm in from the bar's left end.
 * @param {THREE.MeshPhysicalMaterial} m @param {import('../scene/textures/engrave.js').Engraver} E @param {string} slotId
 */
function fitBarName(m, E, slotId) {
  const slot = E.slot(slotId);
  if (!slot) return;
  const L = B.bar;
  // Paul, WP-17 item 14: the taller, shorter bar (1.48 × 10.5 cm): a 1.36 cm box, at most 8.4 cm wide
  let h = 1.36, w = h * slot.aspect;
  if (w > 8.4) { h *= 8.4 / w; w = 8.4; }
  const u0 = 0.9 / L.length, v0 = 0.5 - h / 2 / L.height;
  const face = [u0, v0, u0 + w / L.length, v0 + h / L.height];
  const info = m.userData.vcEngraving;
  if (info) info.o.faceRect = face;
  const u = patchUniforms(m, 'engraving');
  u.uEngFace?.value.set(...face);
  refreshEngraving(m, E);
}

/**
 * Brass inlays, tab counts and the plaque's digit wheels, read every frame from the app's own
 * controls (now invisible proxies), so they always show exactly what the app shows:
 *   inlay fill  = [data-bar] width;  tab text = [data-count] text (or "↗");  plaque = #overallCount.
 * A single change pours (inlay, 1,200 ms ease-out quartic) or rolls (plaque, 650 ms delay,
 * 1,800 ms ease-out quartic, P10 / DECISIONS point 23). When the app animates the numbers itself
 * (P10, re-loading the same character), they change every frame and the board simply follows.
 * @param {ReturnType<typeof createWoodblock>} wood
 * @param {import('../scene/textures/engrave.js').Engraver} tabEngraver
 * @param {ReturnType<typeof createBars>} bars
 */
function createReadouts(wood, tabEngraver, bars) {
  const R = rows();
  /** @type {Map<string, {shown: number, dom: number, lastChange: number, anim: {from: number, to: number, t0: number} | null, follow: number}>} */
  const fills = new Map();
  for (const r of R) if (!r.insight) fills.set(r.category, { shown: NaN, dom: NaN, lastChange: -1e9, anim: null, follow: -1e9 });
  const plaque = { shown: /** @type {number|null} */ (null), dom: /** @type {number|null} */ (null), lastChange: -1e9, anim: /** @type {{from: number, to: number, t0: number}|null} */ (null), follow: -1e9, lastTick: -1e9, lastInt: -1 };
  /** @type {Record<string, string>} */
  let tabTexts = {};
  let tabsDirty = true, lastTabEngrave = -1e9;
  const wheelShown = new Array(B.plaque.wheels).fill(NaN);
  const parse = (/** @type {string} */ s) => { const n = Number(s.replace(/[^0-9.]/g, '')); return /\d/.test(s) && Number.isFinite(n) ? n : null; };
  const FOLLOW_MS = 160;

  function tabRefresh() {
    tabEngraver.engrave(tabEntries(tabTexts));
    for (const [cat, row] of wood.perRow) fitTab(row.tabMat, tabEngraver, `tab:${cat}`);
  }

  return {
    /** @param {number} t */
    update(t) {
      // inlays
      const barsEls = document.querySelectorAll('#categories [data-bar]');
      for (const el of barsEls) {
        const cat = /** @type {HTMLElement} */ (el).dataset.bar ?? '';
        const f = fills.get(cat);
        if (!f) continue;
        const dom = (parseFloat(/** @type {HTMLElement} */ (el).style.width) || 0) / 100;
        if (Number.isNaN(f.shown)) { f.shown = dom; f.dom = dom; }
        if (Math.abs(dom - f.dom) > 1e-6) {
          if (t - f.lastChange < FOLLOW_MS) f.follow = t;
          else { f.anim = { from: f.shown, to: dom, t0: t }; emit('brass:pour', { category: cat }); }
          f.lastChange = t; f.dom = dom;
        }
        let hot = 0;
        if (t - f.follow < FOLLOW_MS * 2) { f.anim = null; f.shown = dom; hot = 0.8; }
        else if (f.anim) {
          const x = Math.min(1, (t - f.anim.t0) / MB.brassPourMs);
          f.shown = f.anim.from + (f.anim.to - f.anim.from) * ease[MB.brassPourEase](x);
          hot = Math.sin(Math.min(1, x * 1.15) * Math.PI) * (f.anim.to > f.anim.from ? 1 : 0.3);
          if (x >= 1) f.anim = null;
        }
        bars.setFill(cat, f.shown, hot); // Paul, WP-17 item 14: the fill is on the bar itself
      }
      // tab counts
      /** @type {Record<string, string>} */
      const next = {};
      for (const r of R) {
        if (r.insight) { next[r.category] = '↗'; continue; }
        const el = [...document.querySelectorAll('#categories [data-count]')].find(x => /** @type {HTMLElement} */ (x).dataset.count === r.category);
        next[r.category] = (el?.textContent ?? '').trim();
      }
      if (Object.keys(next).some(k => next[k] !== tabTexts[k])) { tabTexts = next; tabsDirty = true; }
      if (tabsDirty && t - lastTabEngrave > 100) { tabsDirty = false; lastTabEngrave = t; tabRefresh(); }
      // plaque
      const dom = parse(document.getElementById('overallCount')?.textContent ?? '');
      if (plaque.dom === null && plaque.shown === null && dom !== null && plaque.lastChange < -1e8) { plaque.shown = dom; }
      if (dom !== plaque.dom) {
        if (t - plaque.lastChange < FOLLOW_MS) plaque.follow = t;
        else if (dom !== null && plaque.lastChange > -1e8) plaque.anim = { from: plaque.shown ?? 0, to: dom, t0: t };
        else if (dom === null) { plaque.anim = null; plaque.shown = null; }
        plaque.lastChange = t; plaque.dom = dom;
      }
      if (t - plaque.follow < FOLLOW_MS * 2 && dom !== null) { plaque.anim = null; plaque.shown = dom; }
      else if (plaque.anim) {
        const x = Math.min(1, Math.max(0, (t - plaque.anim.t0 - MB.plaqueRollDelayMs) / MB.plaqueRollMs));
        plaque.shown = plaque.anim.from + (plaque.anim.to - plaque.anim.from) * ease[MB.plaqueRollEase](x);
        if (x >= 1) plaque.anim = null;
      }
      const v = plaque.shown;
      const int = v === null ? -1 : Math.round(v);
      if (int !== plaque.lastInt && int >= 0 && t - plaque.lastTick > 60) { plaque.lastTick = t; plaque.lastInt = int; emit('plaque:tick', { value: int }); }
      for (let k = 0; k < B.plaque.wheels; k++) {
        const place = B.plaque.wheels - 1 - k; // wheel 0 is the thousands
        const f = wheelFace(v, place);
        // never teleport: roll the wheel toward its face along the shortest way round
        const cur = wheelShown[k];
        let target = f;
        if (Number.isFinite(cur)) { const d = ((f - cur) % WHEEL_FACES + WHEEL_FACES * 1.5) % WHEEL_FACES - WHEEL_FACES / 2; target = cur + d; }
        wheelShown[k] = Number.isFinite(cur) ? cur + (target - cur) * 0.35 : f;
        wood.setWheel(k, wheelShown[k]);
      }
    },
    state: () => ({
      plaque: plaque.shown, plaqueDom: plaque.dom,
      fills: Object.fromEntries([...fills].map(([k, f]) => [k, +f.shown.toFixed(4)])),
      tabs: { ...tabTexts },
      wheels: wheelShown.map(x => +(((x % WHEEL_FACES) + WHEEL_FACES) % WHEEL_FACES).toFixed(3)),
    }),
  };
}

/**
 * The face a counter wheel shows for value v at a decimal place (0 = units), as a continuous
 * position: digits 0–9, 10 = "—" (no save, units wheel), 11 = blank (leading zeros). Like an
 * odometer, a wheel turns only while every wheel to its right rolls from 9 to 0; the 9 → 0 step
 * passes the "—" and blank faces in one quick flick.
 * @param {number|null} v @param {number} place
 */
export function wheelFace(v, place) {
  if (v === null) return place === 0 ? 10 : 11;
  const p10 = 10 ** place;
  if (place > 0 && v < p10) {
    // blank until the value reaches this place, then roll blank → 0 → 1
    const roll = Math.max(0, Math.min(1, v - (p10 - 1)));
    return 11 + roll * 2;
  }
  const low = v % p10, carry = place === 0 ? v - Math.floor(v) : Math.max(0, low - (p10 - 1));
  const d = Math.floor(v / p10) % 10;
  const f = Math.max(0, Math.min(1, carry));
  return d === 9 ? 9 + f * 3 : d + f;
}

/**
 * Fit a tab's count into its face (1.6 × 0.9 cm): cap height up to 0.45 cm (DECISIONS point 18),
 * smaller when the text is wider than the tab.
 * @param {THREE.MeshPhysicalMaterial} m @param {import('../scene/textures/engrave.js').Engraver} E @param {string} slotId
 */
function fitTab(m, E, slotId) {
  const slot = E.slot(slotId);
  if (!slot) return;
  const TB = B.tab;
  // the slot box is ~2.2 × the cap height tall (font px × 1.45, cap ≈ 0.66 px)
  let h = Math.min(TB.h * 0.86, TB.capHeight * 2.2), w = h * slot.aspect;
  const maxW = TB.w * 0.92;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  const face = [0.5 - w / 2 / TB.w, 0.5 - h / 2 / TB.h, 0.5 + w / 2 / TB.w, 0.5 + h / 2 / TB.h];
  const info = m.userData.vcEngraving;
  if (info) info.o.faceRect = face;
  patchUniforms(m, 'engraving').uEngFace?.value.set(...face);
  refreshEngraving(m, E);
}

/**
 * "Drag the knob to the right" (WP-16): a small inked hint beside the board for 2.5 s (file 04).
 * @param {{ addPrinted: Function, printDirty: () => void }} ctx
 */
function createHint(ctx) {
  const el = document.createElement('div');
  el.className = 'vc-bar-hint';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const obj = ctx.addPrinted(el, { x0: WB.x1 + 0.35, y0: WB.y0 + 20, w: 3.3, h: 2.0, z: 0.06 });
  let until = -1e9;
  const rowsList = rows();
  return {
    /** @param {string} category */
    show(category) {
      const r = rowsList.find(x => x.category === category);
      if (r) { obj.position.y = WB.y0 + r.cy; ctx.printDirty(); }
      el.textContent = STRINGS.barDragHint;
      el.classList.add('on');
      until = clock.now() + MB.nudgeHintMs;
      emit('hint:show', { category, text: STRINGS.barDragHint });
    },
    /** @param {number} t */
    update(t) { if (until > -1e8 && t > until) { el.classList.remove('on'); until = -1e9; setTimeout(() => { if (!el.classList.contains('on')) el.textContent = ''; }, 400); } },
    visible: () => el.classList.contains('on'),
  };
}

/**
 * Gold motes rising from the Load coin on "save loaded" (file 04, 600 ms), drawn in #fx.
 * @param {{ overlays: { fxPainters: Set<Function> }, project: (x: number, y: number, z?: number) => {x: number, y: number} }} ctx
 * @param {ReturnType<typeof createCoins>} coins
 */
function createMotes(ctx, coins) {
  /** @type {{x: number, y: number, z: number, vz: number, drift: number, t0: number, life: number}[]} */
  const list = [];
  const painter = (/** @type {CanvasRenderingContext2D} */ g) => {
    const t = clock.now();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const age = (t - m.t0) / m.life;
      if (age >= 1) { list.splice(i, 1); continue; }
      if (age < 0) continue;
      const p = ctx.project(m.x + m.drift * age, m.y, m.z + m.vz * age);
      const a = Math.sin(Math.PI * age);
      g.fillStyle = BR.moteColor;
      g.globalAlpha = a;
      g.beginPath(); g.arc(p.x, p.y, 1.2 + 1.4 * (1 - age), 0, Math.PI * 2); g.fill();
    }
    g.restore();
    if (!list.length) ctx.overlays.fxPainters.delete(painter);
  };
  return {
    burst() {
      const c = coins.coins.get('load');
      if (!c) return;
      const t = clock.now();
      for (let i = 0; i < MC.loadedMotes; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(0.2, 0.9) * c.r;
        list.push({ x: c.base.position.x + Math.cos(a) * r, y: c.base.position.y + Math.sin(a) * r, z: c.t, vz: MC.loadedMoteRise * rng.range(0.6, 1.2), drift: rng.range(-0.6, 0.6), t0: t + rng.range(0, 200), life: MC.loadedFlashMs * rng.range(0.9, 1.6) });
      }
      ctx.overlays.fxPainters.add(painter);
    },
  };
}
