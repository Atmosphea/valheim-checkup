// @ts-check
/**
 * WP-11 pure maths (no DOM), shared by the surfaces and the unit tests.
 *
 *   foldPlan     the five folds of the unfold engine: where the folded square starts and where
 *                each flap lies once open, worked backwards from the final sheet
 *   foldAngle    a flap's turn over its 260 ms: 180° → −3° (overshoot) → 0°
 *   liftOf       the header slip's offset, height, curl and shadow for a table scroll position
 *   Pendulum     a hanging tag on its pin (damped, driven by breeze, kicked by impacts)
 *   swashCycle   one flourish's draw / hold / erase / rest loop
 */
import { surfaces as MS, hanging as MH } from '../config/motion.js';

/** @typedef {{x: number, y: number, w: number, h: number}} Rect */
/**
 * @typedef {object} Flap
 * @property {number} i         fold index 0–4
 * @property {'x'|'y'} axis     x: the sheet doubles in width; y: in height
 * @property {Rect} rect        where the flap lies once open (sheet-local px, y down)
 * @property {'left'|'right'|'top'|'bottom'} hinge  the flap's edge it turns on
 * @property {Rect} before      the unfolded area just before this fold (the flap lies on it at 180°)
 */

/**
 * Work the folds backwards from the final sheet (w × h, origin top-left).
 * @param {number} w @param {number} h
 * @param {('x'|'y')[]} [axes] @param {number[]} [dirs]  +1 opens right/down, −1 left/up
 * @returns {{ start: Rect, flaps: Flap[] }}
 */
export function foldPlan(w, h, axes = /** @type {('x'|'y')[]} */ (MS.foldAxes), dirs = MS.foldDirs) {
  /** @type {Flap[]} */
  const flaps = [];
  let r = { x: 0, y: 0, w, h };
  for (let i = axes.length - 1; i >= 0; i--) {
    const axis = axes[i], dir = dirs[i] >= 0 ? 1 : -1;
    let before, rect, hinge;
    if (axis === 'x') {
      const half = r.w / 2;
      if (dir > 0) { before = { x: r.x, y: r.y, w: half, h: r.h }; rect = { x: r.x + half, y: r.y, w: half, h: r.h }; hinge = 'left'; }
      else { before = { x: r.x + half, y: r.y, w: half, h: r.h }; rect = { x: r.x, y: r.y, w: half, h: r.h }; hinge = 'right'; }
    } else {
      const half = r.h / 2;
      if (dir > 0) { before = { x: r.x, y: r.y, w: r.w, h: half }; rect = { x: r.x, y: r.y + half, w: r.w, h: half }; hinge = 'top'; }
      else { before = { x: r.x, y: r.y + half, w: r.w, h: half }; rect = { x: r.x, y: r.y, w: r.w, h: half }; hinge = 'bottom'; }
    }
    flaps.unshift({ i, axis, rect, hinge: /** @type {Flap['hinge']} */ (hinge), before });
    r = before;
  }
  return { start: r, flaps };
}

/**
 * @typedef {object} TimedFlap
 * @property {number} i
 * @property {'x'|'y'} axis
 * @property {Rect} rect
 * @property {'left'|'right'|'top'|'bottom'} hinge
 * @property {Rect} before
 * @property {number} t0    open: start (ms)
 * @property {number} dur   open: turn time (ms)
 * @property {number} c0    close: start (ms)
 * @property {number} cdur  close: turn time (ms)
 */
/**
 * @typedef {object} TimedPlan
 * @property {'five'|'pieces'|'letter'} style
 * @property {Rect} start
 * @property {TimedFlap[]} flaps
 * @property {number} riseMs     the packet reaches its place and height
 * @property {number} doneMs     the last flap lies flat (faced styles hand over here)
 * @property {number} closeMs    the last flap has folded back (then the shrink and the puff)
 * @property {number} startScale the packet's scale at t = 0 (letter: the button's size)
 * @property {boolean} faces     the text is printed on the panels (Paul, WP-16 items 24–25)
 */

/** Number of strips for the piece-by-piece plan (Paul, WP-16 item 24). @param {number} h */
export const pieceCount = h => Math.max(MS.piecesMin, Math.min(MS.piecesMax, Math.round(h / MS.pieceStripPx)));

/**
 * The fold plan with its timings, for each style.
 *   five    WP-11's five folds (How-to)
 *   pieces  Paul, WP-16 item 24 (help letter): a width crease, then one strip at a time down the sheet
 *   letter  Paul, WP-16 item 25 (Details): folded in half once; the top half opens in one step
 * @param {'five'|'pieces'|'letter'} style @param {number} w @param {number} h
 * @param {{w: number, h: number} | null} [origin]  the button the packet comes from (letter)
 * @returns {TimedPlan}
 */
export function timedPlan(style, w, h, origin = null) {
  if (style === 'pieces') {
    const n = pieceCount(h), sh = h / n;
    /** @type {TimedFlap[]} */
    const flaps = [];
    const total = n; // 1 width crease + (n − 1) strips
    const cstep = (MS.pieceCloseMs - MS.pieceCloseFoldMs) / Math.max(1, total - 1);
    const at = (/** @type {number} */ i) => ({ t0: i * MS.pieceStepMs, dur: MS.pieceMs, c0: (total - 1 - i) * cstep, cdur: MS.pieceCloseFoldMs });
    flaps.push({ i: 0, axis: 'x', rect: { x: w / 2, y: 0, w: w / 2, h: sh }, hinge: 'left', before: { x: 0, y: 0, w: w / 2, h: sh }, ...at(0) });
    for (let k = 1; k < n; k++) flaps.push({ i: k, axis: 'y', rect: { x: 0, y: k * sh, w, h: sh }, hinge: 'top', before: { x: 0, y: (k - 1) * sh, w, h: sh }, ...at(k) });
    const doneMs = (total - 1) * MS.pieceStepMs + MS.pieceMs;
    return { style, start: { x: 0, y: 0, w: w / 2, h: sh }, flaps, riseMs: doneMs, doneMs, closeMs: MS.pieceCloseMs, startScale: 1, faces: true };
  }
  if (style === 'letter') {
    const half = h / 2;
    const flap = { i: 0, axis: /** @type {'y'} */ ('y'), rect: { x: 0, y: 0, w, h: half }, hinge: /** @type {'bottom'} */ ('bottom'), before: { x: 0, y: half, w, h: half },
      t0: MS.letterFoldStartMs, dur: MS.letterFoldMs, c0: 0, cdur: MS.letterCloseFoldMs };
    const s0 = origin ? Math.max(0.06, Math.min(1, Math.max(origin.w / w, origin.h / half))) : 0.25;
    const doneMs = MS.letterFoldStartMs + MS.letterFoldMs;
    return { style, start: { x: 0, y: half, w, h: half }, flaps: [flap], riseMs: Math.max(MS.letterEmergeMs, doneMs), doneMs, closeMs: MS.letterCloseMs, startScale: s0, faces: true };
  }
  const p = foldPlan(w, h);
  return {
    style: 'five', start: p.start,
    flaps: p.flaps.map(f => ({ ...f, t0: MS.foldStartsMs[f.i], dur: MS.foldMs, c0: closeStartMs(f.i), cdur: MS.foldMs })),
    riseMs: MS.unfoldRiseMs, doneMs: MS.foldStartsMs[MS.foldStartsMs.length - 1] + MS.foldMs, closeMs: MS.closeMs, startScale: 1, faces: false,
  };
}

/**
 * Angle of a timed flap at time t (ms). Open: 180 → 0 with the overshoot; close: 0 → 180.
 * @param {TimedFlap} f @param {number} t @param {'open'|'close'} dir
 */
export function timedAngle(f, t, dir) {
  if (dir === 'open') return foldAngle((t - f.t0) / f.dur);
  return 180 - foldAngle((t - f.c0) / f.cdur, 0);
}

/**
 * A flap's angle (deg) at fraction u (0–1) of its turn: 180 → −overshoot at 78% → 0.
 * @param {number} u @param {number} [overshoot]
 */
export function foldAngle(u, overshoot = MS.foldOvershootDeg) {
  if (u <= 0) return 180;
  if (u >= 1) return 0;
  const k = 0.78;
  if (u < k) {
    const t = u / k, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return 180 - (180 + overshoot) * e;
  }
  const t = (u - k) / (1 - k), e = 1 - (1 - t) * (1 - t);
  return -overshoot * (1 - e);
}

/**
 * Open-sequence angle of flap `i` at time `t` (ms from the start). Close runs the folds in
 * reverse over `closeMs`: the last fold first.
 * @param {number} i @param {number} t @param {'open'|'close'} [dir]
 */
export function flapAngleAt(i, t, dir = 'open') {
  const starts = MS.foldStartsMs, n = starts.length;
  if (dir === 'open') return foldAngle((t - starts[i]) / MS.foldMs);
  // close: the same rhythm squeezed into closeMs, last fold first, no overshoot
  const step = (MS.closeMs - MS.foldMs) / (n - 1);
  const t0 = (n - 1 - i) * step;
  return 180 - foldAngle((t - t0) / MS.foldMs, 0);
}

/** Close timing for fold `i` (start ms), for tests and the sound. @param {number} i */
export const closeStartMs = i => (MS.foldStartsMs.length - 1 - i) * (MS.closeMs - MS.foldMs) / (MS.foldStartsMs.length - 1);

/**
 * The header slip for a scroll position. All lengths in the same unit (px or cm).
 * @param {number} s  table scroll position @param {number} H  slip height
 */
export function liftOf(s, H) {
  const offset = Math.max(0, Math.min(s, H));
  const f = H > 0 ? offset / H : 0;
  return {
    offset,
    f,
    lifted: offset > 0,
    /** cm above the sheet */
    z: offset > 0 ? MS.slipLiftBase + MS.slipLiftExtra * f : 0,
    curlDeg: MS.slipCurlDeg * f,
    shadowPx: offset > 0 ? MS.slipShadowMinPx + (MS.slipShadowMaxPx - MS.slipShadowMinPx) * f : 0,
  };
}

/**
 * A tag hanging from its pin: θ'' = −ω²θ − cθ' + drive. Angles in degrees, time in ms.
 * Idle sway (0.5° at 0.3 Hz) is added on top by `angle()`, so the pendulum itself rests at 0.
 */
export class Pendulum {
  /** @param {number} [phase] idle sway phase (radians) */
  constructor(phase = 0) {
    this.theta = 0; this.omega = 0; this.phase = phase; this.t = 0;
    this.w = 2 * Math.PI * MS.tagSwingHz;
    // file 04 "pendulum damping 0.9 /s": the swing's amplitude decays by e^(−0.9 t)
    this.c = 2 * MH.pendulumDamping;
  }
  /** @param {number} deg  angular velocity kick (deg/s) */
  kick(deg) { this.omega += deg; }
  /**
   * @param {number} dtMs
   * @param {number} [push] steady push from the breeze (deg the air would hold the tag at)
   */
  step(dtMs, push = 0) {
    let dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
    this.t += dt;
    const h = 1 / 240;
    while (dt > 1e-9) {
      const s = Math.min(h, dt);
      const a = -this.w * this.w * (this.theta - push) - this.c * this.omega;
      this.omega += a * s; this.theta += this.omega * s; dt -= s;
    }
    return this.angle();
  }
  /** Displayed angle: the swing plus the idle sway. */
  angle() { return this.theta + MH.tagSwayDeg * Math.sin(2 * Math.PI * MH.tagSwayHz * this.t + this.phase); }
}

/**
 * One flourish's loop. `durations` = {hold, rest} chosen per cycle by the caller's random stream.
 * Returns the stroke progress 0–1 (drawn length) and the phase name at time `t` within a cycle.
 * @param {number} t ms since the cycle began @param {{hold: number, rest: number}} d
 */
export function swashCycle(t, d) {
  const a = MS.swashDrawMs, b = a + d.hold, c = b + MS.swashEraseMs, end = c + d.rest;
  if (t < a) return { phase: 'draw', drawn: easeInOut(t / a), from: 0, end };
  if (t < b) return { phase: 'hold', drawn: 1, from: 0, end };
  if (t < c) return { phase: 'erase', drawn: 1, from: easeInOut((t - b) / MS.swashEraseMs), end };
  return { phase: 'rest', drawn: 0, from: 0, end };
}
/** @param {number} u */
const easeInOut = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
