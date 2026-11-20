// @ts-check
/**
 * Impacts (file 04 world rule 3; owned by WP-06, DECISIONS point 32).
 *
 * Anything that lands calls `impact({strength, x, y})` with strength 0–1 at a desk point in
 * cm. It is announced as the canonical `impact {strength, x, y}` event, and every object that
 * listens reacts with the strength reduced by its distance:
 *
 *   felt = strength × 1 / (1 + d / impactFalloff)      impactFalloff = 20 cm
 *
 *   impact({ strength: 1, x: 10, y: 0 });
 *   onImpact((felt, e) => …, () => ({ x, y }));         // felt already includes the falloff
 */
import { emit, on } from '../bus.js';
import { world as W } from '../config/motion.js';

/** Strength felt at distance d (cm). @param {number} strength @param {number} d */
export function falloff(strength, d) {
  return strength / (1 + Math.max(0, d) / W.impactFalloff);
}

/**
 * Something landed.
 * @param {{ strength: number, x: number, y: number, source?: string }} o
 */
export function impact(o) {
  const strength = Math.max(0, Math.min(1, +o.strength || 0));
  if (!strength) return null;
  return emit('impact', { strength, x: +o.x || 0, y: +o.y || 0, ...(o.source ? { source: o.source } : {}) });
}

/**
 * React to impacts at a point. `where()` returns the listener's position now (it may move).
 * @param {(felt: number, e: {strength: number, x: number, y: number, source?: string}) => void} fn
 * @param {() => {x: number, y: number}} where
 * @returns {() => void} stop listening
 */
export function onImpact(fn, where) {
  return on('impact', e => {
    const p = where();
    fn(falloff(e.strength, Math.hypot(p.x - e.x, p.y - e.y)), e);
  });
}
