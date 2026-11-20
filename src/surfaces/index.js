// @ts-check
/**
 * WP-11 · every remaining surface made physical (desk mode). Attached by the stage after the
 * board, the paper and the ink, before the shaders compile (the tour's spotlights must exist then).
 *
 *   title.js       swashes around the title, the byline's handwriting reveal
 *   tags.js        favourite tags hanging from brass pins, swinging
 *   lift.js        the header slip lifting off the table as it scrolls
 *   unfold.js      the five-fold unfold engine
 *   details.js     the Details sheet (show() in #float, modal by hand)
 *   help.js        the sealed help letter
 *   menus.js       parchment menus, the brass record-mode switch
 *   slips.js       the toast slip and paper tooltips
 *   tour-light.js  the lamp dimming and the light pool during the tour
 *   inkbits.js     the file-drop ripple, value wipes, the error blot
 *   columns.js     resizable table columns (Paul, WP-16 item 28; flat too)
 *
 * The How-to popup (WP-03) unfolds with the same engine; WP-03's modal layers (popup and tour)
 * live in #float on the desk (`setModalHost`).
 */
import './surfaces.css';
import { on, emit } from '../bus.js';
import { vc } from '../debug.js';
import { breeze } from '../scene/breeze.js';
import { Rng } from '../util/rng.js';
import { onImpact, impact } from '../scene/impact.js';
import { setModalHost } from '../tutorial/modal.js';
import { setPopupRenderer, popupParts } from '../tutorial/howto.js';
import { createUnfold } from './unfold.js';
import { attachDetails } from './details.js';
import { attachHelp } from './help.js';
import { attachLift } from './lift.js';
import { attachTitle } from './title.js';
import { attachTags } from './tags.js';
import { attachMenus } from './menus.js';
import { attachSlips } from './slips.js';
import { attachTourLight } from './tour-light.js';
import { attachInkBits } from './inkbits.js';
import { attachColumns } from './columns.js';
import { attachRowBurn } from './row-burn.js';
import { attachRowWindow } from './row-window.js';

/**
 * @param {object} ctx
 * @param {HTMLElement} ctx.float      layer 5
 * @param {HTMLElement} ctx.print      layer 2
 * @param {any} ctx.THREE
 * @param {any} ctx.scene
 * @param {any} ctx.camera
 * @param {any} ctx.lights
 * @param {any} ctx.veil
 * @param {any} ctx.paper              createPaper() result (glow, sheets)
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} ctx.project
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} ctx.onPhase
 * @param {{ next(): number, fork(): any }} ctx.rng
 * @param {() => void} ctx.printDirty
 */
export function attachSurfaces(ctx) {
  const host = ctx.float;
  // its own random stream (like WP-10's ink), so nothing drawn here shifts another WP's seeded draws
  const rng = new Rng(((/** @type {any} */ (ctx.rng).initialSeed ?? 1) ^ 0x51f7ace) >>> 0);
  host.classList.add('vc-float');
  setModalHost(() => host);

  /** Screen px per paper cm at the middle of the sheet. */
  const pxPerCm = () => {
    const a = ctx.project(0, 0, 0), b = ctx.project(10, 0, 0);
    return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) / 10);
  };
  // later: the tour light has the raycaster; until then a flat guess from two projections
  /** @type {(x: number, y: number) => {x: number, y: number} | null} */
  let toPaper = () => null;
  const air = (/** @type {number} */ x, /** @type {number} */ y) => { const p = toPaper(x, y); return p ? breeze.sample(p.x, p.y) : 0; };

  const unfold = createUnfold({ host, pxPerCm, air });
  onImpact(felt => unfold.knock(felt), () => ({ x: 0, y: 0 }));

  const inkbits = attachInkBits({ host, project: ctx.project, onPhase: ctx.onPhase });
  const tourLight = attachTourLight({ THREE: ctx.THREE, scene: ctx.scene, camera: ctx.camera, lights: ctx.lights, veil: ctx.veil, glow: ctx.paper.glow, project: ctx.project, onPhase: ctx.onPhase });
  toPaper = tourLight.toPaper;

  // WP-03's How-to popup moves into #float and unfolds like Details
  const pp = popupParts();
  host.append(pp.layer);
  setPopupRenderer({
    open(panel, from) {
      const r = from?.getBoundingClientRect();
      unfold.open({ sheet: panel, origin: r && r.width > 0 ? r : null, onFold: i => emit('details:fold', { i, surface: 'howto' }), onFloat: () => emit('details:float', { surface: 'howto' }), float: true });
    },
    close(panel, to, rect) {
      /** @type {any} */ (panel).__vcUnfloat?.();
      panel.classList.remove('vc-unfolding', 'vc-inkin');
      const r = to?.getBoundingClientRect();
      unfold.close({ rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, to: r && r.width > 0 ? r : null });
    },
  });

  const details = attachDetails({ host, unfold });
  const help = attachHelp({ host, unfold });
  const lift = attachLift({ onPhase: ctx.onPhase, THREE: ctx.THREE, scene: ctx.scene, veil: ctx.veil, printDirty: ctx.printDirty });
  // WP-18P: only when it isn't at the top already (setting scrollTop laid out the freshly rendered
  // view in the middle of the bar's release, before the browser's own layout of it)
  on('app:category', () => { if (lift.scrolled()) lift.wrap.scrollTop = 0; });
  ctx.paper.slot?.(); // the slip changed the header's layout: re-seat the hero and message
  const title = attachTitle({ onPhase: ctx.onPhase, rng: rng.fork(), project: ctx.project, glow: ctx.paper.glow });
  const tags = attachTags({ onPhase: ctx.onPhase, rng: rng.fork() });
  const menus = attachMenus({ host, print: ctx.print, onPhase: ctx.onPhase, air });
  const slips = attachSlips({ host, project: ctx.project, onPhase: ctx.onPhase, air });
  const columns = attachColumns(); // Paul, WP-16 item 28
  const rowBurn = attachRowBurn({ isDesk: () => document.body.classList.contains('mode-desk') }); // Paul, WP-18 item 12
  const rowWindow = attachRowWindow(); // WP-18P: off-screen rows' icons don't paint

  ctx.onPhase('physics', dt => unfold.update(dt));

  // stacking inside #float is by z-index (surfaces.css): the toast is always on top

  const api = {
    unfold, details, help, lift, title, tags, menus, slips, tourLight, inkbits, pxPerCm, columns, rowBurn, rowWindow,
    /** Test hooks: stir the air, land an impact (both in desk cm). */
    poke: {
      air: (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ speed, /** @type {number} */ r) => breeze.write(x, y, speed, r),
      impact: (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ strength) => impact({ x, y, strength, source: 'test' }),
    },
    read: () => ({ details: details.read(), help: help.read(), lift: lift.read(), unfold: unfold.state(), menu: menus.read(), toast: slips.toast.read(), tooltip: slips.tooltips.read(), tour: tourLight.read() }),
  };
  /** @type {any} */ (vc).surfaces = api;
  return api;
}
