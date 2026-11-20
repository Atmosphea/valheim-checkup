// @ts-check
/**
 * Recipes for bus `magic` (file 06 "Spark and magic"). Built (Scope cuts): spark.out, spark.in,
 * spark.crackle, load.success, load.fail. Same signature as mech.js.
 */
import { silence, partial, noiseBand, crackle, fmBell, toBuffer, expSweep, ms2n } from '../blocks.js';

/** @typedef {import('../blocks.js').Rng} Rng @typedef {import('../blocks.js').BufferMaker} Ctx */

/** Major pentatonic steps in semitones (load.success pings). */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

export const magic = {
  /**
   * spark.out: crackle burst (300/s for 120 ms above 2.5 kHz) + rising whoosh (band-pass
   * 800 → 4,000 Hz, 250 ms) + 2,640 Hz ting, 400 ms.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'spark.out'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, Math.max(p.tingMs + 40, p.whooshMs) + 10);
    crackle(sig, sr, rng, { ratePerSec: p.crackleRatePerSec, ms: p.crackleMs, aboveHz: p.crackleAboveHz, amp: 0.8 });
    noiseBand(sig, sr, rng, { ms: p.whooshMs, hz: expSweep(p.whooshHzFrom, p.whooshHzTo), q: 1.6, color: 'pink', shape: 'hann', amp: 1.4 });
    partial(sig, sr, { hz: p.tingHz, amp: 0.35, decayMs: p.tingMs, attackMs: 3, start: ms2n(sr, 40) });
    return toBuffer(ctx, sig);
  },

  /**
   * spark.in: reverse whoosh 4,000 → 800 Hz + low thup (300 Hz, 60 ms) + 1,980 Hz ting.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'spark.in'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, 450);
    noiseBand(sig, sr, rng, { ms: 250, hz: expSweep(p.whooshHzFrom, p.whooshHzTo), q: 1.6, color: 'pink', shape: 'hann', amp: 1.4 });
    const at = ms2n(sr, 230);
    partial(sig, sr, { hz: (/** @type {number} */ t) => p.thupHz * (1 - 0.3 * Math.min(1, t / (p.thupMs / 1000))), amp: 0.7, decayMs: p.thupMs, attackMs: 2, start: at });
    partial(sig, sr, { hz: p.tingHz, amp: 0.3, decayMs: 200, attackMs: 2, start: at });
    return toBuffer(ctx, sig);
  },

  /**
   * spark.crackle (continuous): one crackle grain above 3 kHz. The engine's grain loop plays
   * grains at 2 per second at rest up to 25 per second at speed, each re-pitched and re-levelled.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'spark.crackle'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, 10);
    crackle(sig, sr, rng, { ratePerSec: 600, ms: 6, aboveHz: p.aboveHz });
    sig[ms2n(sr, 0.3)] += 0.8; // at least one spike, whatever the seed
    return toBuffer(ctx, sig);
  },

  /**
   * load.success: FM bell (carrier 880 Hz, ratio 1.4, index 2 decaying) + 8 rising pentatonic
   * pings over 600 ms.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'load.success'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, 1700);
    fmBell(sig, sr, { hz: p.fmCarrierHz, ratio: p.fmRatio, index: p.fmIndex, decayMs: 1600, amp: 0.7 });
    for (let i = 0; i < p.pings; i++) {
      const hz = p.fmCarrierHz * Math.pow(2, PENTATONIC[i % PENTATONIC.length] / 12);
      partial(sig, sr, { hz, amp: 0.22, decayMs: 260, attackMs: 2, start: ms2n(sr, 40 + i * p.pingsOverMs / p.pings), phase: rng.next() * 6 });
    }
    return toBuffer(ctx, sig);
  },

  /**
   * load.fail: dull thud (90 Hz dropping, 120 ms) + muffled knock + wet ink squelch (noise
   * sweep 1.2 → 0.4 kHz, 200 ms).
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'load.fail'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, 380);
    partial(sig, sr, { hz: (/** @type {number} */ t) => p.thudHzFrom * (1 - 0.45 * Math.min(1, t / (p.thudMs / 1000))), amp: 1, decayMs: p.thudMs, attackMs: 2 });
    noiseBand(sig, sr, rng, { ms: 45, hz: 450, q: 1.2, start: ms2n(sr, 10), amp: 0.8 });
    noiseBand(sig, sr, rng, { ms: p.squelchMs, hz: expSweep(p.squelchHzFrom, p.squelchHzTo), q: 4, shape: 'hann', start: ms2n(sr, 120), amp: 1.6 });
    return toBuffer(ctx, sig);
  },
};

export const ranges = { 'spark.out': [400, 500], 'spark.in': [400, 500], 'spark.crackle': [5, 20], 'load.success': [1500, 1800], 'load.fail': [300, 450] };
