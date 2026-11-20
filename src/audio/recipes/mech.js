// @ts-check
/**
 * Recipes for bus `mech` (file 06 "Bars and board"). Each function is named exactly as the
 * sound, takes the seeded generator, a context that makes AudioBuffers, the sound's entry in
 * audio-mix.json and the shared `blocks` values, and returns an AudioBuffer.
 * Built in this WP (Scope cuts): bar.scrape, bar.latch, bar.return. The rest are deferred.
 */
import { silence, white, modal, click, partial, noiseBand, room, toBuffer, makeLoopable, ms2n } from '../blocks.js';

/** @typedef {import('../blocks.js').Rng} Rng @typedef {import('../blocks.js').BufferMaker} Ctx */

/**
 * The latch clink, shared by bar.latch and bar.return (file 06 bar.latch, four layers).
 * @param {Rng} rng @param {Ctx} ctx @param {any} latch audio-mix bar.latch @param {any} B blocks
 * @param {{hz?: number, decayMul?: number}} [o]
 */
function clink(rng, ctx, latch, B, o = {}) {
  const sr = ctx.sampleRate, m = latch.modal;
  const sig = silence(sr, 520);
  // Layer 1: 1.5 ms click above 5 kHz.
  click(sig, sr, rng, { ms: latch.click.ms, aboveHz: latch.click.aboveHz, amp: 0.6 });
  // Layer 2: modal bar at 2,150 Hz ± 4 %, with the detuned twin on the first partial.
  const hz = (o.hz ?? m.hz) * rng.jitter(1, m.spread);
  modal(sig, sr, rng, { hz, ratios: B.barRatios, amps: m.amps, decaysMs: m.decaysMs.map((/** @type {number} */ d) => d * (o.decayMul ?? 1)), twinDetuneHz: m.twinDetuneHz, amp: 0.5 });
  // Layer 3: body thunk, 140 Hz sine 50 ms + low-passed noise 40 ms at −8 dB.
  partial(sig, sr, { hz: latch.thunk.sineHz, amp: 0.45, decayMs: latch.thunk.sineMs, attackMs: 1 });
  noiseBand(sig, sr, rng, { ms: latch.thunk.noiseMs, type: 'lowpass', hz: latch.thunk.noiseLowpassHz, q: 0.7, amp: 0.45 * Math.pow(10, latch.thunk.noiseGainDb / 20) * 2 });
  // Layer 4: small room, 12 % wet.
  return toBuffer(ctx, room(sig, sr, rng, latch.room.type, latch.room.wet, B));
}

export const mech = {
  /**
   * bar.scrape (continuous): a 2 s loop of grit — white noise with a random 30–80 Hz tremolo at
   * depth 0.4. The engine's loop voice band-passes it live (centre 2.2 → 4.0 kHz, Q 2.5) and
   * sets the level from speed^0.7.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'bar.scrape'(rng, ctx, p) {
    const sr = ctx.sampleRate, n = ms2n(sr, 2100);
    const sig = white(rng, n);
    let ph = 0, rate = rng.range(p.tremoloHzMin, p.tremoloHzMax);
    for (let i = 0; i < n; i++) {
      if (i % ms2n(sr, 40) === 0) rate = rng.range(p.tremoloHzMin, p.tremoloHzMax); // grit wanders
      ph += 2 * Math.PI * rate / sr;
      sig[i] *= 1 - p.tremoloDepth * (0.5 + 0.5 * Math.sin(ph));
    }
    return toBuffer(ctx, makeLoopable(sig, sr, 100), { peak: 0.9 });
  },

  /** bar.latch: the satisfying clink. @param {Rng} rng @param {Ctx} ctx @param {any} p @param {any} B */
  'bar.latch'(rng, ctx, p, B) { return clink(rng, ctx, p, B); },

  /**
   * bar.return: the bar.latch recipe at 1,800 Hz with decays × 0.7. Needs bar.latch's values,
   * which the engine passes as `p.latch`.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p @param {any} B
   */
  'bar.return'(rng, ctx, p, B) { return clink(rng, ctx, p.latch, B, { hz: p.modalHz, decayMul: p.decayMul }); },
};

/** Expected take length in ms [min, max] (offline render test). */
export const ranges = { 'bar.scrape': [1900, 2100], 'bar.latch': [700, 1000], 'bar.return': [700, 1000] };

