// @ts-check
/**
 * Sound building blocks (WP-12 step 2, file 06 "Building blocks"). Plain JavaScript maths on
 * Float32Arrays, so every recipe gives the same samples for the same seed in the browser and
 * in Node unit tests. Nothing here touches Web Audio except `toBuffer`, which only asks the
 * context for an empty AudioBuffer.
 *
 * Every function that adds sound takes `start` (sample index) and `amp` (linear) and *adds*
 * into `out`, so layers mix by calling several blocks on the same array.
 */

/** @typedef {import('../util/rng.js').Rng} Rng */
/** @typedef {{sampleRate: number, createBuffer: (ch: number, len: number, sr: number) => AudioBuffer}} BufferMaker */

export const TAU = Math.PI * 2;
export const dbToGain = (/** @type {number} */ db) => Math.pow(10, db / 20);
export const gainToDb = (/** @type {number} */ g) => 20 * Math.log10(Math.max(1e-12, g));
export const semis = (/** @type {number} */ s) => Math.pow(2, s / 12);

/** Samples in `ms` milliseconds. @param {number} sr @param {number} ms */
export const ms2n = (sr, ms) => Math.max(1, Math.round(sr * ms / 1000));

/** An empty mono signal of `ms` length. @param {number} sr @param {number} ms */
export const silence = (sr, ms) => new Float32Array(ms2n(sr, ms));

/** White noise in [−1, 1). @param {Rng} rng @param {number} n */
export function white(rng, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** Pink noise (Paul Kellet's filter), roughly [−1, 1]. @param {Rng} rng @param {number} n */
export function pink(rng, n) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/**
 * One biquad filter (RBJ cookbook), the same shapes as Web Audio's BiquadFilterNode.
 */
export class Biquad {
  /** @param {'lowpass'|'highpass'|'bandpass'} type @param {number} sr */
  constructor(type, sr) {
    this.type = type; this.sr = sr;
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  /** @param {number} hz @param {number} q */
  set(hz, q) {
    const f = Math.min(Math.max(hz, 10), this.sr * 0.45);
    const w = TAU * f / this.sr, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (this.type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; } // band-pass, 0 dB peak
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
    return this;
  }
  /** @param {number} x */
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/**
 * Filter a signal in place. `hz` may be a number or a function of progress 0–1 (a sweep);
 * sweeps update the coefficients every 32 samples.
 * @param {Float32Array} sig @param {number} sr @param {'lowpass'|'highpass'|'bandpass'} type
 * @param {number | ((p: number) => number)} hz @param {number} [q]
 */
export function filter(sig, sr, type, hz, q = 0.707) {
  const f = new Biquad(type, sr);
  const sweep = typeof hz === 'function';
  f.set(sweep ? hz(0) : hz, q);
  for (let i = 0; i < sig.length; i++) {
    if (sweep && (i & 31) === 0) f.set(hz(i / sig.length), q);
    sig[i] = f.step(sig[i]);
  }
  return sig;
}

/** Exponential sweep from a to b at progress p. @param {number} a @param {number} b */
export const expSweep = (a, b) => (/** @type {number} */ p) => a * Math.pow(b / a, p);

/**
 * Multiply by an attack/decay envelope: linear rise over attackMs, then exponential decay
 * reaching −60 dB after decayMs (or a raised-cosine fade when `shape` is 'hann').
 * @param {Float32Array} sig @param {number} sr @param {number} attackMs @param {number} decayMs
 * @param {'exp'|'hann'} [shape]
 */
export function envelope(sig, sr, attackMs, decayMs, shape = 'exp') {
  const a = ms2n(sr, attackMs), n = sig.length;
  if (shape === 'hann') {
    for (let i = 0; i < n; i++) sig[i] *= 0.5 - 0.5 * Math.cos(TAU * i / (n - 1 || 1));
    return sig;
  }
  const k = Math.log(1000) / Math.max(1, ms2n(sr, decayMs));
  for (let i = 0; i < n; i++) sig[i] *= i < a ? i / a : Math.exp(-(i - a) * k);
  return sig;
}

/** Fade the last `ms` of a signal to zero (and the first 1 ms in) so nothing clicks. @param {Float32Array} sig @param {number} sr @param {number} [ms] */
export function edges(sig, sr, ms = 4) {
  const n = Math.min(ms2n(sr, ms), sig.length >> 1), inN = Math.min(ms2n(sr, 1), n);
  for (let i = 0; i < inN; i++) sig[i] *= i / inN;
  for (let i = 0; i < n; i++) sig[sig.length - 1 - i] *= i / n;
  return sig;
}

/** Add `src` × amp into `out` from sample `start`. @param {Float32Array} out @param {Float32Array} src @param {number} [start] @param {number} [amp] */
export function mix(out, src, start = 0, amp = 1) {
  const s = Math.max(0, Math.round(start));
  const end = Math.min(out.length, s + src.length);
  for (let i = s; i < end; i++) out[i] += src[i - s] * amp;
  return out;
}

/**
 * Add a decaying sine partial. `hz` may be a function of time in seconds (pitch glides).
 * @param {Float32Array} out @param {number} sr
 * @param {{hz: number | ((t: number) => number), amp?: number, decayMs: number, attackMs?: number, start?: number, phase?: number}} o
 */
export function partial(out, sr, o) {
  const { amp = 1, decayMs, attackMs = 0.5, start = 0, phase = 0 } = o;
  const s = Math.max(0, Math.round(start));
  const k = Math.log(1000) / Math.max(1, ms2n(sr, decayMs));
  const a = ms2n(sr, attackMs);
  const len = Math.min(out.length - s, ms2n(sr, decayMs * 1.05) + a);
  let ph = phase;
  const glide = typeof o.hz === 'function' ? o.hz : null;
  const fixed = glide ? 0 : TAU * /** @type {number} */ (o.hz) / sr;
  for (let i = 0; i < len; i++) {
    const env = i < a ? i / a : Math.exp(-(i - a) * k);
    out[s + i] += Math.sin(ph) * amp * env;
    ph += glide ? TAU * glide(i / sr) / sr : fixed;
  }
  return out;
}

/**
 * Modal metal (file 06): a sum of decaying sine partials at inharmonic ratios.
 * @param {Float32Array} out @param {number} sr @param {Rng} rng
 * @param {{hz: number, ratios: number[], amps: number[], decaysMs: number[], start?: number, amp?: number, twinDetuneHz?: number}} o
 */
export function modal(out, sr, rng, o) {
  const { start = 0, amp = 1 } = o;
  o.ratios.forEach((r, i) => {
    const hz = o.hz * r;
    if (hz > sr * 0.45) return;
    const a = (o.amps[i] ?? o.amps.at(-1) ?? 0.2) * amp;
    const d = o.decaysMs[i] ?? o.decaysMs.at(-1) ?? 100;
    partial(out, sr, { hz, amp: a, decayMs: d, start, phase: rng.next() * TAU });
    // A twin of the first partial detuned a few Hz, so the ring shimmers (file 06 bar.latch).
    if (i === 0 && o.twinDetuneHz) partial(out, sr, { hz: hz + o.twinDetuneHz, amp: a * 0.7, decayMs: d, start, phase: rng.next() * TAU });
  });
  return out;
}

/**
 * A short high-passed noise click (1–3 ms in file 06).
 * @param {Float32Array} out @param {number} sr @param {Rng} rng
 * @param {{ms: number, aboveHz: number, start?: number, amp?: number}} o
 */
export function click(out, sr, rng, o) {
  const n = ms2n(sr, o.ms);
  const c = filter(white(rng, n + 8), sr, 'highpass', o.aboveHz, 0.8).subarray(0, n);
  for (let i = 0; i < n; i++) c[i] *= Math.exp(-5 * i / n);
  return mix(out, c, o.start ?? 0, o.amp ?? 1);
}

/**
 * Filtered noise burst: a noise band with an envelope and optional sweep.
 * @param {Float32Array} out @param {number} sr @param {Rng} rng
 * @param {{ms: number, type?: 'lowpass'|'highpass'|'bandpass', hz: number | ((p: number) => number), q?: number,
 *          attackMs?: number, decayMs?: number, shape?: 'exp'|'hann', color?: 'white'|'pink', start?: number, amp?: number}} o
 */
export function noiseBand(out, sr, rng, o) {
  const n = ms2n(sr, o.ms);
  const src = (o.color === 'pink' ? pink : white)(rng, n);
  filter(src, sr, o.type ?? 'bandpass', o.hz, o.q ?? 1);
  envelope(src, sr, o.attackMs ?? 1, o.decayMs ?? o.ms, o.shape ?? 'exp');
  edges(src, sr, 2);
  return mix(out, src, o.start ?? 0, o.amp ?? 1);
}

/**
 * Crackle: sparse random impulses (each a 0.1–0.4 ms spike), high-passed.
 * @param {Float32Array} out @param {number} sr @param {Rng} rng
 * @param {{ratePerSec: number, ms: number, aboveHz: number, start?: number, amp?: number}} o
 */
export function crackle(out, sr, rng, o) {
  const n = ms2n(sr, o.ms);
  const sig = new Float32Array(n + ms2n(sr, 3));
  let t = 0;
  while (true) {
    t += -Math.log(1 - rng.next()) / o.ratePerSec; // Poisson spacing
    const i = Math.round(t * sr);
    if (i >= n) break;
    const w = ms2n(sr, rng.range(0.1, 0.4)), a = rng.range(0.3, 1) * rng.sign();
    for (let j = 0; j < w && i + j < sig.length; j++) sig[i + j] += a * (1 - j / w);
  }
  filter(sig, sr, 'highpass', o.aboveHz, 0.7);
  return mix(out, sig, o.start ?? 0, o.amp ?? 1);
}

/**
 * FM bell (file 06 load.success): carrier with a modulator at `ratio`, index decaying to 0.
 * @param {Float32Array} out @param {number} sr
 * @param {{hz: number, ratio: number, index: number, decayMs: number, start?: number, amp?: number}} o
 */
export function fmBell(out, sr, o) {
  const s = o.start ?? 0, n = Math.min(out.length - s, ms2n(sr, o.decayMs));
  const k = Math.log(1000) / n, ki = Math.log(1000) / (n * 0.4);
  const wc = TAU * o.hz / sr, wm = wc * o.ratio;
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / ms2n(sr, 2)) * Math.exp(-i * k);
    out[s + i] += Math.sin(wc * i + o.index * Math.exp(-i * ki) * Math.sin(wm * i)) * env * (o.amp ?? 1);
  }
  return out;
}

/* ── Room: a generated impulse response and FFT convolution ──────────────────────────── */

/** In-place iterative radix-2 FFT. @param {Float64Array} re @param {Float64Array} im @param {boolean} inverse */
export function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? TAU : -TAU) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * A generated room impulse response: decaying noise, darker as it decays, with a few early
 * reflections. Small room 0.35 s, hall 2.2 s (file 06).
 * @param {Rng} rng @param {number} sr @param {number} seconds
 */
export function roomIR(rng, sr, seconds) {
  const n = Math.round(sr * seconds);
  const ir = white(rng, n);
  const k = Math.log(1000) / n;
  const lp = new Biquad('lowpass', sr).set(6000, 0.6);
  for (let i = 0; i < n; i++) ir[i] = lp.step(ir[i] * Math.exp(-i * k));
  for (let r = 0; r < 6; r++) ir[Math.floor(rng.range(0.004, 0.03) * sr)] += rng.range(0.3, 0.7) * rng.sign();
  let e = 0; for (let i = 0; i < n; i++) e += ir[i] * ir[i];
  const g = 1 / Math.sqrt(e || 1);
  for (let i = 0; i < n; i++) ir[i] *= g;
  return ir;
}

/** Linear convolution by FFT. @param {Float32Array} a @param {Float32Array} b */
export function convolve(a, b) {
  const outLen = a.length + b.length - 1;
  let n = 1; while (n < outLen) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = ar[i];
  return out;
}

/**
 * Add a room: dry + wet × (signal convolved with a generated IR). Returns a longer signal
 * (the tail). `wet` is the share of the wet level relative to the dry peak.
 * @param {Float32Array} sig @param {number} sr @param {Rng} rng @param {'small'|'hall'} type @param {number} wet
 * @param {{roomSmallMs: number, roomHallMs: number}} blocks
 */
export function room(sig, sr, rng, type, wet, blocks) {
  const ir = roomIR(rng, sr, (type === 'hall' ? blocks.roomHallMs : blocks.roomSmallMs) / 1000);
  const w = convolve(sig, ir);
  const dryPeak = peakOf(sig) || 1, wetPeak = peakOf(w) || 1;
  const g = wet * dryPeak / wetPeak;
  for (let i = 0; i < w.length; i++) w[i] = w[i] * g + (i < sig.length ? sig[i] * (1 - wet * 0.5) : 0);
  return edges(w, sr, 20);
}

/* ── Output ─────────────────────────────────────────────────────────────────────────── */

/** @param {ArrayLike<number>} sig */
export function peakOf(sig) { let p = 0; for (let i = 0; i < sig.length; i++) { const v = Math.abs(sig[i]); if (v > p) p = v; } return p; }

/** @param {ArrayLike<number>} sig */
export function rmsOf(sig) { let e = 0; for (let i = 0; i < sig.length; i++) e += sig[i] * sig[i]; return Math.sqrt(e / Math.max(1, sig.length)); }

/** Make an end of a loop flow into its start: crossfade the last `ms` into the first. @param {Float32Array} sig @param {number} sr @param {number} ms */
export function makeLoopable(sig, sr, ms) {
  const n = Math.min(ms2n(sr, ms), sig.length >> 1);
  const out = sig.slice(0, sig.length - n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    out[i] = out[i] * Math.sin(p * Math.PI / 2) + sig[sig.length - n + i] * Math.cos(p * Math.PI / 2);
  }
  return out;
}

/**
 * Normalise to `peak` (default 1: the mix gain in audio-mix.json is then the sound's peak
 * level) and wrap in an AudioBuffer. Throws on NaN so a broken recipe never plays.
 * @param {BufferMaker} ctx @param {Float32Array} sig @param {{peak?: number}} [o]
 */
export function toBuffer(ctx, sig, o = {}) {
  for (let i = 0; i < sig.length; i++) if (!Number.isFinite(sig[i])) throw new Error('recipe produced a non-finite sample');
  const p = peakOf(sig);
  const g = p > 0 ? (o.peak ?? 1) / p : 0;
  const buf = ctx.createBuffer(1, sig.length, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < sig.length; i++) ch[i] = sig[i] * g;
  return buf;
}
