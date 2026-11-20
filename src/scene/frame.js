// @ts-check
/**
 * The one frame loop (WP-04 step 6). The central clock ticks first; then, in this order:
 *
 *   input → physics (springs, camera) → scene (renderer 1) → veil (renderer 2)
 *         → overlays (#glow, #fx, #grain) → print (CSS3D)
 *
 * Later WPs hook in with `onPhase(name, fn)`; nothing else calls requestAnimationFrame.
 * Each fn gets (dtMs, tMs) in scaled clock time.
 */

export const PHASES = /** @type {const} */ (['input', 'physics', 'scene', 'veil', 'overlays', 'print']);
/** @typedef {typeof PHASES[number]} Phase */

/** @type {Record<Phase, Set<(dt: number, t: number) => void>>} */
const hooks = /** @type {any} */ (Object.fromEntries(PHASES.map(p => [p, new Set()])));

/** @param {Phase} phase @param {(dt: number, t: number) => void} fn @returns {() => void} unsubscribe */
export function onPhase(phase, fn) {
  if (!hooks[phase]) throw new RangeError(`unknown frame phase ${phase}`);
  hooks[phase].add(fn);
  return () => { hooks[phase].delete(fn); };
}

/**
 * WP-07: smoothed CPU time per phase (ms), for `__vc.stage.phaseMs()`. Off until asked for
 * (`profilePhases(true)`): reading the clock right after a heavy phase makes a test's fake clock
 * (Playwright `page.clock`) drop that phase's time, so page timers drift late on slow machines.
 */
export const phaseMs = /** @type {Record<Phase, number>} */ (Object.fromEntries(PHASES.map(p => [p, 0])));
let profiling = false;
/** @param {boolean} on */
export function profilePhases(on) { profiling = !!on; }

/** Run one frame through every phase in order. Errors are reported, never fatal. @param {number} dt @param {number} t */
export function runFrame(dt, t) {
  for (const p of PHASES) {
    const t0 = profiling ? performance.now() : 0;
    for (const fn of hooks[p]) {
      try { fn(dt, t); } catch (e) { console.error(e); }
    }
    if (profiling) phaseMs[p] = phaseMs[p] * 0.9 + (performance.now() - t0) * 0.1;
  }
}
