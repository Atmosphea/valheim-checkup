// @ts-check
/**
 * Recipes for bus `coin` (file 06 "Coins"). Built (Scope cuts): coin.up, coin.land.
 * Same signature as mech.js: (rng, ctx, entry, blocks) → AudioBuffer.
 */
import { silence, modal, click, noiseBand, toBuffer, expSweep } from '../blocks.js';

/** @typedef {import('../blocks.js').Rng} Rng @typedef {import('../blocks.js').BufferMaker} Ctx */

export const coin = {
  /** coin.up: tiny air flick, band-pass 2 → 5 kHz, 80 ms. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'coin.up'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.ms + 5);
    noiseBand(sig, sr, rng, { ms: p.ms, hz: expSweep(p.bandHzMin, p.bandHzMax), q: 1.4, attackMs: 15, shape: 'hann' });
    return toBuffer(ctx, sig);
  },

  /**
   * coin.land: one contact — modal disc at 3,200 Hz ± 5 %, decays 600/380/220/120 ms, plus a
   * contact click. The wiring plays it at −14 dB for the first contact, −22 dB for the second
   * and adds the settling chatter (3 more hits) — see wiring.js.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p @param {any} B
   */
  'coin.land'(rng, ctx, p, B) {
    const sr = ctx.sampleRate, sig = silence(sr, Math.max(...p.decaysMs) + 30);
    click(sig, sr, rng, { ms: 1.5, aboveHz: 6000, amp: 0.5 });
    modal(sig, sr, rng, { hz: p.modalHz * rng.jitter(1, p.spread), ratios: B.discRatios, amps: p.amps, decaysMs: p.decaysMs, amp: 0.6 });
    return toBuffer(ctx, sig);
  },
};

export const ranges = { 'coin.up': [80, 100], 'coin.land': [600, 700] };
