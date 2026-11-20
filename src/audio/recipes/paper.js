// @ts-check
/**
 * Recipes for bus `paper` (file 06 "Ink and paper"). Built (Scope cuts): wash.out, wash.in,
 * stamp.big, stamp.dot, paper.lift, paper.settle, unfold.flap, menu.open, toast.in, star.on,
 * star.off, and fold.close as a burning crackle (Paul, WP-18 item 15). Same signature as mech.js: (rng, ctx, entry, blocks) → AudioBuffer.
 */
import { silence, white, partial, modal, click, noiseBand, crackle, filter, room, mix, toBuffer, expSweep, ms2n, edges } from '../blocks.js';

/** @typedef {import('../blocks.js').Rng} Rng @typedef {import('../blocks.js').BufferMaker} Ctx */

/** Brush swish shared by wash.out / wash.in. @param {Rng} rng @param {Ctx} ctx @param {any} p @param {boolean} up */
function swish(rng, ctx, p, up) {
  const sr = ctx.sampleRate, sig = silence(sr, p.ms + 10);
  const [a, b] = up ? [p.bandHzMin, p.bandHzMax] : [p.bandHzMax, p.bandHzMin];
  noiseBand(sig, sr, rng, { ms: p.ms, hz: expSweep(a, b), q: 1.1, color: 'pink', shape: 'hann' });
  return toBuffer(ctx, sig);
}

/** Airy "fft" flap: noise 600 → 2,000 Hz, quick upward sweep. @param {Float32Array} sig @param {number} sr @param {Rng} rng @param {any} p @param {number} start @param {number} [amp] */
function flap(sig, sr, rng, p, start, amp = 1) {
  noiseBand(sig, sr, rng, { ms: p.ms, hz: expSweep(p.bandHzMin, p.bandHzMax), q: 0.9, attackMs: 8, decayMs: p.ms, start, amp });
}

/** Quill scratch: bright noise 3–6 kHz with a jittery nib, 130 ms. @param {Rng} rng @param {number} sr */
function scratch(rng, sr) {
  const n = ms2n(sr, 130), sig = white(rng, n);
  filter(sig, sr, 'bandpass', expSweep(3200, 5500), 1.5);
  let g = 1;
  for (let i = 0; i < n; i++) {
    if (i % ms2n(sr, 6) === 0) g = rng.range(0.35, 1);
    sig[i] *= g * Math.sin(Math.PI * i / n);
  }
  return edges(sig, sr, 3);
}

export const paper = {
  /** wash.out: pink-noise brush swish, 900 → 2,800 Hz up, 450 ms (pan centre → right is live). @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'wash.out'(rng, ctx, p) { return swish(rng, ctx, p, true); },
  /** wash.in: the same, 600 ms, sweeping down (pan left → centre is live). @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'wash.in'(rng, ctx, p) { return swish(rng, ctx, p, false); },

  /**
   * stamp.big: wood thump (sine 72 → 46 Hz over 120 ms) + knock (noise 350–900 Hz, 70 ms) +
   * ink smack (noise above 2 kHz, 25 ms, then a resonant sweep 3 → 1 kHz, 80 ms) + rattle and
   * coin chatter + small room 15 % wet. The wiring sets the per-stamp pitch.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p @param {any} B
   */
  'stamp.big'(rng, ctx, p, B) {
    const sr = ctx.sampleRate, sig = silence(sr, 420);
    const glide = (/** @type {number} */ t) => p.thumpHzFrom * Math.pow(p.thumpHzTo / p.thumpHzFrom, Math.min(1, t / (p.thumpMs / 1000)));
    partial(sig, sr, { hz: glide, amp: 1, decayMs: p.thumpMs * 1.6, attackMs: 1.5 });
    noiseBand(sig, sr, rng, { ms: p.knockMs, hz: Math.sqrt(p.knockHzMin * p.knockHzMax), q: 0.9, amp: 0.9 });
    noiseBand(sig, sr, rng, { ms: p.smackMs, type: 'highpass', hz: p.smackAboveHz, q: 0.7, amp: 0.5 });
    noiseBand(sig, sr, rng, { ms: p.smackSweepMs, hz: expSweep(p.smackSweepHzFrom, p.smackSweepHzTo), q: 7, start: ms2n(sr, p.smackMs * 0.6), amp: 1.2 });
    // bar.rattle layer: 3–6 tiny clinks 2.6–3.4 kHz over 120 ms.
    const rattle = B.rattle, clinks = rng.int(rattle.clinksMin, rattle.clinksMax);
    for (let i = 0; i < clinks; i++) partial(sig, sr, { hz: rng.range(rattle.hzMin, rattle.hzMax), amp: rng.range(0.03, 0.07), decayMs: 40, start: ms2n(sr, rng.range(10, rattle.spreadMs)) });
    // coin.land chatter layer: three short disc hits.
    const land = B.land;
    land.chatterGapsMs.reduce((/** @type {number} */ t, /** @type {number} */ gap) => {
      modal(sig, sr, rng, { hz: land.modalHz * rng.jitter(1, land.spread), ratios: B.discRatios, amps: land.amps, decaysMs: [90, 60, 40, 30], start: ms2n(sr, t), amp: rng.range(0.02, 0.04) });
      return t + gap;
    }, 30);
    return toBuffer(ctx, room(sig, sr, rng, 'small', p.roomWet, B));
  },

  /** stamp.dot: woody tick — noise 1.2–2.5 kHz, 25 ms + 420 Hz blip, 15 ms. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'stamp.dot'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, Math.max(p.noiseMs, p.blipMs) + 15);
    noiseBand(sig, sr, rng, { ms: p.noiseMs, hz: Math.sqrt(p.bandHzMin * p.bandHzMax), q: 1.3, attackMs: 0.5 });
    partial(sig, sr, { hz: p.blipHz, amp: 0.6, decayMs: p.blipMs, attackMs: 1 });
    return toBuffer(ctx, edges(sig, sr, 3));
  },

  /** paper.lift: rustle above 2 kHz with 8–20 crinkle impulses per second, 200–350 ms. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'paper.lift'(rng, ctx, p) {
    const sr = ctx.sampleRate, ms = rng.range(p.msMin, p.msMax), sig = silence(sr, ms + 10);
    noiseBand(sig, sr, rng, { ms, type: 'highpass', hz: p.aboveHz, q: 0.7, shape: 'hann', amp: 0.35 });
    crackle(sig, sr, rng, { ratePerSec: rng.range(p.crinklesPerSecMin, p.crinklesPerSecMax) * 2, ms, aboveHz: p.aboveHz, amp: 1 });
    return toBuffer(ctx, edges(sig, sr, 4));
  },

  /** paper.settle: soft flop — noise low-passed at 400 Hz, 150 ms + tiny rustle. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'paper.settle'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.ms + 40);
    noiseBand(sig, sr, rng, { ms: p.ms, type: 'lowpass', hz: p.lowpassHz, q: 0.7, attackMs: 6, amp: 2 });
    noiseBand(sig, sr, rng, { ms: 60, type: 'highpass', hz: 2500, q: 0.7, shape: 'hann', start: ms2n(sr, 30), amp: 0.12 });
    return toBuffer(ctx, sig);
  },

  /** unfold.flap: airy "fft", noise 600 → 2,000 Hz, 55 ms (the wiring raises each fold 1.5 semitones). @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'unfold.flap'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.ms + 5);
    flap(sig, sr, rng, p, 0);
    return toBuffer(ctx, sig);
  },

  /** menu.open: 2 quick flaps (unfold.flap's band, passed as `p.flap`). @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'menu.open'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.flapGapMs * (p.flaps - 1) + p.flap.ms + 5);
    for (let i = 0; i < p.flaps; i++) flap(sig, sr, rng, p.flap, ms2n(sr, i * p.flapGapMs), i ? 0.8 : 1);
    return toBuffer(ctx, sig);
  },

  /** toast.in: paper slide, noise sweep 1 → 3 kHz, 250 ms. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'toast.in'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.ms + 5);
    noiseBand(sig, sr, rng, { ms: p.ms, hz: expSweep(p.sweepHzFrom, p.sweepHzTo), q: 1.2, shape: 'hann' });
    return toBuffer(ctx, sig);
  },

  /**
   * fold.close → Paul, WP-18 item 15: "a crackle sound replaces the fold-close sound". The Details
   * close burns the letter, so this is paper catching and burning: a soft whoomph of flame (low
   * noise swell), dense dry crackle that thins out as the sheet falls away, a few louder pops.
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'fold.close'(rng, ctx, p) {
    const sr = ctx.sampleRate, sig = silence(sr, p.ms + 30);
    noiseBand(sig, sr, rng, { ms: p.ms, type: 'lowpass', hz: expSweep(p.flameHzFrom, p.flameHzTo), q: 0.6, color: 'pink', attackMs: p.flameAttackMs, decayMs: p.ms, amp: p.flameAmp });
    const seg = p.ms / 6;
    for (let i = 0; i < 6; i++) {
      crackle(sig, sr, rng, { ratePerSec: p.crackleRate * (1 - i / 7), ms: seg, aboveHz: p.crackleAboveHz, start: ms2n(sr, i * seg), amp: 1 - i * 0.12 });
    }
    for (let i = 0; i < p.pops; i++) {
      click(sig, sr, rng, { ms: rng.range(1.5, 3.5), aboveHz: 900, start: ms2n(sr, rng.range(20, p.ms * 0.7)), amp: rng.range(0.9, 1.6) });
    }
    return toBuffer(ctx, sig);
  },

  /** star.on: quill scratch. @param {Rng} rng @param {Ctx} ctx */
  'star.on'(rng, ctx) {
    const sr = ctx.sampleRate, sig = silence(sr, 140);
    mix(sig, scratch(rng, sr));
    click(sig, sr, rng, { ms: 1, aboveHz: 4000, amp: 0.4 });
    return toBuffer(ctx, sig);
  },

  /** star.off: the scratch reversed and softer. @param {Rng} rng @param {Ctx} ctx @param {any} p */
  'star.off'(rng, ctx, p) {
    const sr = ctx.sampleRate, s = scratch(rng, sr).reverse(), sig = silence(sr, 140);
    mix(sig, s);
    return toBuffer(ctx, sig, { peak: p.peak ?? 0.7 });
  },
};

export const ranges = {
  'wash.out': [450, 470], 'wash.in': [600, 620], 'stamp.big': [700, 800], 'stamp.dot': [30, 50],
  'paper.lift': [200, 370], 'paper.settle': [180, 200], 'unfold.flap': [55, 65], 'menu.open': [120, 135],
  'toast.in': [250, 260], 'fold.close': [800, 900], 'star.on': [130, 150], 'star.off': [130, 150],
};
