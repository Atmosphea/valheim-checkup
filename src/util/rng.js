// @ts-check
/**
 * The one seeded random generator (file 01 "Randomness"). Nothing in the app may call
 * Math.random(); it asks `rng` instead. `?seed=N` in the address fixes the seed, so a test run
 * can be repeated exactly; otherwise the seed is picked once per page load.
 *
 * Algorithm: mulberry32 (32-bit state, fast, good enough for animation and sound variation).
 */

/** @param {number|string} value @returns {number} an unsigned 32-bit seed */
export function toSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return (Math.trunc(value) >>> 0);
  const s = String(value);
  if (/^-?\d+$/.test(s.trim())) return Number(s.trim()) >>> 0;
  // FNV-1a hash for non-numeric seeds such as "test".
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class Rng {
  /** @param {number|string} seed */
  constructor(seed) {
    /** @type {number} */ this.initialSeed = 0;
    /** @type {number} */ this.state = 0;
    this.seed(seed);
  }

  /** Restart the sequence from `seed`. Returns the 32-bit seed actually used. @param {number|string} seed */
  seed(seed) {
    this.initialSeed = toSeed(seed);
    this.state = this.initialSeed;
    return this.initialSeed;
  }

  /** Next float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). @param {number} min @param {number} max */
  range(min, max) { return min + (max - min) * this.next(); }

  /** Integer in [min, max], both ends included. @param {number} min @param {number} max */
  int(min, max) { return Math.floor(this.range(Math.ceil(min), Math.floor(max) + 1)); }

  /** `value` ± `amount`. @param {number} value @param {number} amount */
  jitter(value, amount) { return value + this.range(-amount, amount); }

  /** True with probability p. @param {number} p */
  chance(p) { return this.next() < p; }

  /** −1 or +1. */
  sign() { return this.next() < 0.5 ? -1 : 1; }

  /** One element of a non-empty array. @template T @param {readonly T[]} list @returns {T} */
  pick(list) {
    if (!list.length) throw new RangeError('pick() needs a non-empty array');
    return list[Math.floor(this.next() * list.length)];
  }

  /** A new independent generator seeded from this one (for per-object streams). */
  fork() { return new Rng(Math.floor(this.next() * 4294967296)); }
}

/** Seed from `?seed=N` when present, otherwise a fresh one per page load. @returns {number} */
export function initialSeed() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;
    if (q !== null && q !== '') return toSeed(q);
  } catch { /* no location: fall through */ }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Date.now() ^ 0x5bd1e995) >>> 0;
}

/** The app-wide generator. `__vc.seed(n)` reseeds it in place. */
export const rng = new Rng(initialSeed());
