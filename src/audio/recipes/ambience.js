// @ts-check
/**
 * Paul, WP-17 item 21: the tavern ambience, `amb.hall` (file 06's hall chatter, until now a scope
 * cut). Generated here, not recorded: no third-party audio, so nothing to license (LICENSES/
 * records it as generated). A quiet bed of murmured, wordless chatter from `voices` people (a
 * glottal pulse through two moving vowel formants, syllables at 3–5 a second in phrases with
 * pauses) with an occasional laugh (a run of falling "ha"s), muffled (`lowpassHz`) and spread by
 * a small Schroeder hall, made loopable. Rendered at 16 kHz (it is low-passed far below 8 kHz),
 * so the take costs little to build. Same signature as the other recipe files.
 */
import { Biquad, makeLoopable, ms2n } from '../blocks.js';

/** @typedef {import('../blocks.js').Rng} Rng @typedef {import('../blocks.js').BufferMaker} Ctx */

const SR = 16000;
/** Take length before the loop crossfade, ms. */
const LEN_MS = 13500, XFADE_MS = 1500;

/**
 * One speaker: phrases of syllables and pauses written into `out` (additive).
 * @param {Float32Array} out @param {Rng} rng @param {any} p
 * @param {{ f0: number, level: number }} v
 */
function speaker(out, rng, p, v) {
  const n = out.length;
  const f1 = new Biquad('bandpass', SR), f2 = new Biquad('bandpass', SR), cons = new Biquad('bandpass', SR).set(3200, 1.2);
  let i = ms2n(SR, rng.range(0, 2500));
  let phase = rng.next();
  while (i < n) {
    // a phrase
    const phraseStart = i, phraseEnd = Math.min(n, i + ms2n(SR, rng.range(p.phraseMsMin, p.phraseMsMax)));
    const rate = rng.range(p.syllablesPerSecMin, p.syllablesPerSecMax);
    const tilt = rng.range(-0.25, 0.1); // the phrase's pitch falls a little toward its end
    while (i < phraseEnd) {
      const len = ms2n(SR, 1000 / rate * rng.range(0.7, 1.3));
      f1.set(rng.range(p.f1HzMin, p.f1HzMax), 6); f2.set(rng.range(p.f2HzMin, p.f2HzMax), 8);
      const stress = rng.range(0.55, 1);
      const consMs = rng.next() < 0.6 ? rng.range(12, 35) : 0;
      for (let k = 0; k < len && i < n; k++, i++) {
        const x = k / len;
        const env = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5 * stress;
        const f0 = v.f0 * (1 + tilt * (i - phraseStart) / Math.max(1, phraseEnd - phraseStart)) * (1 + 0.04 * Math.sin(i * 0.002));
        phase += Math.max(40, f0) / SR; if (phase >= 1) phase -= 1;
        const pulse = (phase < 0.08 ? 1 - phase / 0.08 : 0) - 0.08; // a glottal-ish pulse train
        const breath = (rng.next() * 2 - 1) * 0.08;
        let s = f1.step(pulse + breath) * 1.0 + f2.step(pulse + breath) * 0.55;
        if (k < consMs * SR / 1000) s += cons.step(rng.next() * 2 - 1) * 0.35 * (1 - k / (consMs * SR / 1000));
        out[i] += s * env * v.level;
      }
    }
    // a pause between phrases (someone else talks)
    i += ms2n(SR, rng.range(350, 2600));
  }
}

/**
 * A laugh: 4–7 falling "ha"s on an open vowel, the first loudest.
 * @param {Float32Array} out @param {Rng} rng @param {number} at sample @param {number} level
 */
function laugh(out, rng, at, level) {
  const f1 = new Biquad('bandpass', SR).set(rng.range(700, 850), 5), f2 = new Biquad('bandpass', SR).set(rng.range(1150, 1350), 6);
  const asp = new Biquad('bandpass', SR).set(1800, 0.8);
  const count = rng.int(4, 7), f0s = rng.range(230, 330);
  let i = at, phase = 0;
  for (let h = 0; h < count; h++) {
    const len = ms2n(SR, rng.range(95, 130)), gap = ms2n(SR, rng.range(55, 85));
    const amp = level * (1 - h / (count + 1.5));
    const f0 = f0s * (1 - h * 0.035);
    for (let k = 0; k < len && i < out.length; k++, i++) {
      const x = k / len, env = Math.sin(Math.PI * x) ** 0.8;
      phase += f0 / SR; if (phase >= 1) phase -= 1;
      const pulse = (phase < 0.1 ? 1 - phase / 0.1 : 0) - 0.1;
      const h0 = (rng.next() * 2 - 1) * (x < 0.3 ? 0.5 * (1 - x / 0.3) : 0); // the breathy "h"
      out[i] += (f1.step(pulse) + 0.5 * f2.step(pulse) + asp.step(h0)) * env * amp;
    }
    i += gap;
  }
}

/** Schroeder hall: 4 parallel combs into 2 all-passes, mixed `wet`. @param {Float32Array} sig @param {number} wet */
function hall(sig, wet) {
  const combs = [29.7, 37.1, 41.1, 43.7].map(ms => ({ buf: new Float32Array(ms2n(SR, ms)), i: 0, fb: 0.8, lp: 0 }));
  const aps = [5.0, 1.7].map(ms => ({ buf: new Float32Array(ms2n(SR, ms)), i: 0 }));
  const out = new Float32Array(sig.length);
  for (let n = 0; n < sig.length; n++) {
    const x = sig[n];
    let y = 0;
    for (const c of combs) {
      const d = c.buf[c.i];
      c.lp = d * 0.6 + c.lp * 0.4; // damping
      c.buf[c.i] = x + c.lp * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      y += d;
    }
    y *= 0.25;
    for (const a of aps) {
      const d = a.buf[a.i];
      const v = y + d * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      y = d - v * 0.5;
    }
    out[n] = x * (1 - wet * 0.5) + y * wet * 2.2;
  }
  return out;
}

export const ambience = {
  /**
   * amb.hall: tavern chatter and an occasional laugh (Paul, WP-17 item 21).
   * @param {Rng} rng @param {Ctx} ctx @param {any} p
   */
  'amb.hall'(rng, ctx, p) {
    const n = ms2n(SR, LEN_MS);
    const sig = new Float32Array(n);
    for (let v = 0; v < (p.voices ?? 8); v++) speaker(sig, rng, p, { f0: rng.range(p.pitchHzMin, p.pitchHzMax), level: rng.range(0.35, 1) });
    // "occasional" laughs: two in the take, far apart
    laugh(sig, rng, ms2n(SR, rng.range(1500, 4500)), 1.3);
    laugh(sig, rng, ms2n(SR, rng.range(7500, 10500)), 1.0);
    // muffled across the room, then the hall
    const lp1 = new Biquad('lowpass', SR).set(p.lowpassHz ?? 1800, 0.707), lp2 = new Biquad('lowpass', SR).set(p.lowpassHz ?? 1800, 0.707);
    const hp = new Biquad('highpass', SR).set(120, 0.707);
    for (let i = 0; i < n; i++) sig[i] = hp.step(lp2.step(lp1.step(sig[i])));
    const wet = hall(sig, p.wet ?? 0.6);
    const loop = makeLoopable(wet, SR, XFADE_MS);
    let peak = 0;
    for (let i = 0; i < loop.length; i++) { if (!Number.isFinite(loop[i])) throw new Error('recipe produced a non-finite sample'); peak = Math.max(peak, Math.abs(loop[i])); }
    const buf = ctx.createBuffer(1, loop.length, SR);
    const ch = buf.getChannelData(0);
    const g = peak > 0 ? 1 / peak : 0;
    for (let i = 0; i < loop.length; i++) ch[i] = loop[i] * g;
    return buf;
  },
};

/** Expected take length per sound, ms [min, max]. */
export const ranges = { 'amb.hall': [LEN_MS - XFADE_MS - 50, LEN_MS - XFADE_MS + 50] };
