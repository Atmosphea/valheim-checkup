// @ts-check
/**
 * Current rendering quality tier (file 05 "Quality tiers"). WP-04/WP-14 renderers subscribe
 * with `onQualityChange`. `flat` here only means "lowest cost, no post effects" — it never
 * switches the run mode (DECISIONS point 8).
 */
import { runMode } from './mode.js';

export const TIERS = /** @type {const} */ (['high', 'medium', 'low', 'flat']);
/** @typedef {typeof TIERS[number]} Tier */

/** @type {Tier} */
let tier = runMode === 'flat' ? 'flat' : 'high';
/** @type {Set<(tier: Tier) => void>} */
const subscribers = new Set();

export const getQuality = () => tier;

/** @param {Tier} next @returns {Tier} */
export function setQuality(next) {
  if (!TIERS.includes(next)) throw new RangeError(`quality must be one of ${TIERS.join(', ')}`);
  if (next !== tier) {
    tier = next;
    for (const fn of [...subscribers]) { try { fn(tier); } catch (e) { console.error(e); } }
  }
  return tier;
}

/** @param {(tier: Tier) => void} fn */
export function onQualityChange(fn) { subscribers.add(fn); return () => { subscribers.delete(fn); }; }
