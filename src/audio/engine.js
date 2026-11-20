// @ts-check
/**
 * The audio engine (WP-12 step 1, file 06 "Engine rules"), trimmed by Paul's scope cuts:
 * one take per sound, no ambience.
 *
 *   sound → voice gain → panner → bus (mech, coin, gauntlet, magic, paper, ui, ambience)
 *         → compressor (−12 dB, 3:1) → limiter (−1 dBFS: a fast compressor plus a hard
 *           ceiling so the peak can never pass −1 dBFS) → mute → hidden-tab fade → speakers
 *
 * Nothing makes a sound before the first pointer or key press (browsers require that anyway).
 * Takes are rendered in idle time from page load, most-used first, into plain AudioBuffers that
 * need no context (WP-14: so the first clicks don't render sounds inside their own task); a sound
 * asked for before its take exists renders it on the spot. Every play goes to `__vc.sound.log` and emits `sound:play`.
 * Only src/audio/wiring.js (and the soundboard, which is a test page) call play().
 */
import { emit } from '../bus.js';
import { clock } from '../util/clock.js';
import { Rng, rng as appRng, toSeed } from '../util/rng.js';
import { soundLog } from '../debug.js';
import { dbToGain, semis as semitones, peakOf, rmsOf, gainToDb } from './blocks.js';
import { recipes, ranges, renderTake } from './recipes/index.js';

export const MAX_LOG = 2000;

/** Render order after unlock: bars, stamps, dots, coins, spark, wash, then the rest (WP-12 step 4). */
const PRIORITY = ['bar.', 'stamp.big', 'stamp.dot', 'coin.', 'spark.', 'wash.'];

/**
 * Build the bus → compressor → limiter chain on any context (live or offline).
 * @param {BaseAudioContext} ctx @param {any} engineCfg
 */
export function buildMaster(ctx, engineCfg) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = engineCfg.compressor.thresholdDb;
  comp.ratio.value = engineCfg.compressor.ratio;
  comp.knee.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = engineCfg.limiterDbfs;
  limiter.ratio.value = 20; limiter.knee.value = 0; limiter.attack.value = 0.001; limiter.release.value = 0.05;
  // Hard ceiling at −1 dBFS: a straight line clipped at ±ceiling (exact below it).
  const ceiling = engineCfg.limiterCeiling ?? dbToGain(engineCfg.limiterDbfs);
  const clip = ctx.createWaveShaper();
  const N = 4097, curve = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.max(-ceiling, Math.min(ceiling, x)); }
  clip.curve = curve;
  comp.connect(limiter).connect(clip);
  /** @type {Record<string, GainNode>} */
  const buses = {};
  for (const b of engineCfg.buses) { buses[b] = ctx.createGain(); buses[b].connect(comp); }
  return { buses, output: clip, ceiling };
}

/**
 * @typedef {object} PlayOptions
 * @property {number} [gainDb]   added to the mix gain (impact strength, contact number …)
 * @property {number} [semis]    pitch shift in semitones (dot climb, fold steps)
 * @property {number} [pitch]    extra playback-rate multiplier (stamp pitches)
 * @property {number} [pan]      −1 … 1
 * @property {number} [panTo]    pan glides to this over the sound's length (wash)
 * @property {number} [delayMs]  start later (coin chatter)
 * @property {number} [pitchSpread]  override the ±3 % pitch variation
 * @property {number} [gainSpreadDb] override the ±1.5 dB gain variation
 */

/** @param {any} mixConfig the parsed audio-mix.json */
export function createEngine(mixConfig) {
  const mix = mixConfig;
  const E = mix.engine;
  const vary = new Rng(toSeed(appRng.initialSeed ^ 0x5eed));

  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {ReturnType<typeof buildMaster>|null} */ let master = null;
  /** @type {GainNode|null} */ let muteGain = null;
  /** @type {GainNode|null} */ let hideGain = null;
  let unlocked = false;
  let muted = readMuted();
  /** @type {Map<string, AudioBuffer>} */ const takes = new Map();
  /** @type {Map<string, string>} */ let overrideUrls = new Map();
  /** @type {{name: string, src: AudioBufferSourceNode, gain: GainNode, start: number, end: number}[]} */
  let voices = [];
  /** @type {Map<string, any>} */ const loops = new Map();
  /** @type {{name: string, t: number, played: boolean, why?: string}[]} */ const requests = [];
  const stats = { maxVoices: /** @type {Record<string, number>} */ ({}), maxTotal: 0, cut: 0, rendered: 0, renderMs: 0 };

  function readMuted() {
    try { return localStorage.getItem(E.muteKey) === '0'; } catch { return false; }
  }

  const sound = (/** @type {string} */ n) => mix.sounds[n];
  /** Silent: cut by Paul and no recorded override dropped in. @param {string} n */
  const isDeferred = n => !!sound(n)?.deferred && !overrideUrls.has(n);
  const playable = (/** @type {string} */ n) => !!sound(n) && !isDeferred(n) && (!!recipes[n] || overrideUrls.has(n));

  /**
   * What takes are rendered into: the live context once it exists, before that a stand-in that
   * makes plain AudioBuffers (no gesture needed, no warning). Recipes only use sampleRate and
   * createBuffer. A take made at the stand-in rate plays fine on a context at another rate.
   */
  let maker = /** @type {any} */ (null);
  function bufferMaker() {
    if (ctx) return ctx;
    if (!maker) {
      const sampleRate = E.prerenderRate ?? 48000;
      const AB = /** @type {any} */ (globalThis).AudioBuffer;
      let direct = false;
      try { direct = !!AB && !!new AB({ length: 1, sampleRate }); } catch { direct = false; }
      if (direct) maker = { sampleRate, createBuffer: (/** @type {number} */ ch, /** @type {number} */ len, /** @type {number} */ sr) => new AB({ numberOfChannels: ch, length: len, sampleRate: sr }) };
      else {
        const OAC = /** @type {any} */ (globalThis).OfflineAudioContext || /** @type {any} */ (globalThis).webkitOfflineAudioContext;
        try { maker = OAC ? new OAC(1, 1, sampleRate) : null; } catch { maker = null; }
      }
    }
    return maker;
  }

  /** The take for a sound, rendering it on the spot if idle time hasn't reached it yet. @param {string} name */
  function take(name) {
    let buf = takes.get(name);
    const m = recipes[name] ? bufferMaker() : null;
    if (!buf && m) {
      const t0 = performance.now();
      buf = renderTake(name, mix, m, new Rng(toSeed(name) ^ appRng.initialSeed));
      stats.rendered++; stats.renderMs += performance.now() - t0;
      takes.set(name, buf);
    }
    return buf || null;
  }

  /* ── Unlock, idle rendering, overrides ─────────────────────────────────────────────── */

  /**
   * The context is created in idle time after load (WP-14: the first AudioContext starts the
   * browser's audio service, ~100 ms of native time that used to land inside the first click).
   * Browsers keep it suspended until a gesture and `unlocked` stays false, so nothing sounds
   * before the first pointer or key press, which resumes it (and every later press resumes a
   * context the browser suspended). A press that beats the idle creation creates it on the spot.
   */
  function createContext() {
    if (ctx) return true;
    const AC = /** @type {any} */ (globalThis).AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
    if (!AC) return false;
    try { ctx = /** @type {AudioContext} */ (new AC({ latencyHint: 'interactive' })); } catch { return false; }
    const c = /** @type {AudioContext} */ (ctx);
    master = buildMaster(c, E);
    muteGain = c.createGain(); muteGain.gain.value = muted ? 0 : 1;
    hideGain = c.createGain(); hideGain.gain.value = document.hidden ? 0 : 1;
    master.output.connect(muteGain).connect(hideGain).connect(c.destination);
    return true;
  }

  function unlock() {
    if (unlocked) { if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); return; }
    if (!createContext()) return;
    /** @type {AudioContext} */ (ctx).resume().catch(() => {});
    unlocked = true;
    loadOverrides();
  }

  async function loadOverrides() {
    try {
      const { overrides } = await import('./overrides.js');
      overrideUrls = new Map(Object.entries(overrides));
      for (const [name, url] of overrideUrls) {
        const data = await (await fetch(url)).arrayBuffer();
        if (ctx) takes.set(name, await ctx.decodeAudioData(data));
      }
    } catch (e) { console.warn('audio: override failed', e); }
  }

  let idleStarted = false;
  function scheduleIdle() {
    if (idleStarted) return;
    idleStarted = true;
    const rank = (/** @type {string} */ n) => { const i = PRIORITY.findIndex(p => n.startsWith(p)); return i < 0 ? PRIORITY.length : i; };
    const queue = Object.keys(mix.sounds).filter(n => playable(n) && recipes[n]).sort((a, b) => rank(a) - rank(b));
    // WP-18P: one sound per idle slice of the central scheduler (it runs only in frames with budget left)
    clock.idle(function* () { while (queue.length) { take(/** @type {string} */ (queue.shift())); yield; } });
  }

  /* ── Playing ───────────────────────────────────────────────────────────────────────── */

  /**
   * Every play request, played or not, with the reason when silent (tests prove deferred sounds
   * are wired to their events). Returns true when the sound may play.
   * @param {string} name
   */
  function request(name) {
    const why = !sound(name) ? 'unknown' : !unlocked || !ctx || !master ? 'locked' : muted ? 'muted' : isDeferred(name) ? 'deferred' : !playable(name) ? 'no-recipe' : null;
    requests.push({ name, t: clock.now(), played: !why, ...(why ? { why } : {}) });
    if (requests.length > MAX_LOG) requests.splice(0, requests.length - MAX_LOG);
    return !why;
  }

  /** @param {string} name @param {number} gainDb @param {number} rate @param {any} [extra] */
  function log(name, gainDb, rate, extra = {}) {
    const g = Math.round(gainDb * 100) / 100, p = Math.round(rate * 10000) / 10000;
    soundLog.push({ name, gain: g, pitch: p, t: clock.now(), ...extra });
    if (soundLog.length > MAX_LOG) soundLog.splice(0, soundLog.length - MAX_LOG);
    emit('sound:play', { name, gain: g, pitch: p, ...(extra.phase ? { phase: extra.phase } : {}) });
  }

  /** Fade a voice out quickly and stop it (voice stealing, loop stops). @param {{src: AudioBufferSourceNode, gain: GainNode}} v @param {number} [ms] */
  function cut(v, ms = 6) {
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
      v.src.stop(t + ms / 1000 + 0.005);
    } catch { /* already stopped */ }
  }

  /**
   * Play a one-shot sound. Returns the voice, or null when nothing played (before the first
   * interaction, muted, deferred, unknown).
   * @param {string} name @param {PlayOptions} [o]
   */
  function play(name, o = {}) {
    const s = sound(name);
    if (!request(name)) return null;
    const buf = take(name);
    if (!buf) return null;
    const c = ctx;
    const gainDb = s.gain + (o.gainDb ?? 0) + vary.range(-1, 1) * (o.gainSpreadDb ?? s.gainSpreadDb ?? E.variation.gainDb);
    const rate = (s.pitch ?? 1) * (o.pitch ?? 1) * semitones(o.semis ?? 0) * vary.jitter(1, o.pitchSpread ?? E.variation.pitch);
    const start = c.currentTime + Math.max(0, o.delayMs ?? 0) / 1000;
    const end = start + buf.duration / rate;

    // Voice limits: this sound's own limit, then 24 overall; the oldest is cut.
    voices = voices.filter(v => v.end > c.currentTime);
    const limit = s.voices ?? E.voicesPerSound;
    const same = voices.filter(v => v.name === name && v.end > start);
    if (same.length >= limit) { const old = same[0]; cut(old); voices = voices.filter(v => v !== old); stats.cut++; }
    if (voices.length >= E.voices) { const old = voices[0]; cut(old); voices.shift(); stats.cut++; }

    const src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = dbToGain(gainDb);
    const pan = c.createStereoPanner();
    const p0 = clampPan(o.pan ?? 0);
    pan.pan.setValueAtTime(p0, start);
    if (o.panTo !== undefined) pan.pan.linearRampToValueAtTime(clampPan(o.panTo), end);
    src.connect(g).connect(pan).connect(master.buses[s.bus]);
    src.start(start);
    const v = { name, src, gain: g, start, end };
    voices.push(v);
    src.onended = () => { voices = voices.filter(x => x !== v); };

    const live = voices.filter(x => x.name === name && x.start <= start && x.end > start).length;
    stats.maxVoices[name] = Math.max(stats.maxVoices[name] ?? 0, live);
    stats.maxTotal = Math.max(stats.maxTotal, voices.filter(x => x.start <= start && x.end > start).length);
    log(name, gainDb, rate, o.delayMs ? { delayMs: Math.round(o.delayMs) } : {});
    return v;
  }

  const clampPan = (/** @type {number} */ x) => Math.max(-1, Math.min(1, x));

  /* ── Continuous sounds (WP-12 step 6) ──────────────────────────────────────────────── */

  /**
   * Start a looping voice: bar.scrape (band-passed grit), spark.crackle (grains). Speed 0–1.
   * Logs start and stop only (DECISIONS point 29).
   * @param {string} name @param {{speed?: number, pan?: number}} [o]
   */
  function startLoop(name, o = {}) {
    const s = sound(name);
    if (loops.has(name)) return loops.get(name);
    if (!request(name)) return null;
    const buf = take(name);
    if (!buf) return null;
    const c = ctx;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner(); pan.pan.value = clampPan(o.pan ?? 0);
    out.connect(pan).connect(master.buses[s.bus]);
    /** @type {any} */
    const loop = { name, out, pan, speed: 0 };
    if (s.bus === 'ambience') {
      // Paul, WP-17 item 21: a plain looped bed, faded in over ambienceFadeInMs
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      src.connect(out); src.start(c.currentTime, vary.range(0, buf.duration));
      out.gain.setValueAtTime(0, c.currentTime);
      out.gain.linearRampToValueAtTime(dbToGain(s.gain), c.currentTime + (E.ambienceFadeInMs ?? 3000) / 1000);
      loop.src = src;
      loops.set(name, loop);
      log(name, s.gain, 1, { phase: 'start' });
      return loop;
    }
    if (name === 'spark.crackle') {
      out.gain.value = dbToGain(s.gain);
      let next = c.currentTime;
      loop.timer = setInterval(() => {
        // Grains: 2 per second at rest up to 25 per second at full speed.
        const rate = s.ratePerSecRest + (s.ratePerSecMax - s.ratePerSecRest) * loop.speed;
        const horizon = c.currentTime + 0.12;
        while (next < horizon) {
          next = Math.max(next, c.currentTime) + -Math.log(1 - vary.next()) / rate;
          const g = c.createBufferSource(); g.buffer = buf; g.playbackRate.value = vary.range(0.7, 1.4);
          const gg = c.createGain(); gg.gain.value = dbToGain(vary.range(-6, 0));
          g.connect(gg).connect(out); g.start(next);
        }
      }, 50);
    } else {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = s.q ?? 1; bp.frequency.value = s.centerHzFrom ?? 2000;
      src.connect(bp).connect(out); src.start();
      loop.src = src; loop.bp = bp;
    }
    loops.set(name, loop);
    log(name, s.gain, 1, { phase: 'start' });
    updateLoop(name, o);
    return loop;
  }

  /** Live automation from speed (0–1): filter centre, level ∝ speed^0.7 (bar.scrape), grain rate (crackle). @param {string} name @param {{speed?: number, pan?: number}} o */
  function updateLoop(name, o) {
    const loop = loops.get(name), s = sound(name);
    if (!loop || !ctx) return;
    const t = ctx.currentTime;
    if (o.speed !== undefined) loop.speed = Math.max(0, Math.min(1, o.speed));
    if (o.pan !== undefined) loop.pan.pan.setTargetAtTime(clampPan(o.pan), t, 0.03);
    if (loop.bp) {
      loop.bp.frequency.setTargetAtTime(s.centerHzFrom + (s.centerHzTo - s.centerHzFrom) * loop.speed, t, 0.02);
      loop.out.gain.setTargetAtTime(dbToGain(s.gain) * Math.pow(loop.speed, s.levelSpeedExponent ?? 1), t, 0.02);
    }
  }

  /** @param {string} name */
  function stopLoop(name) {
    const loop = loops.get(name), s = sound(name);
    if (!loop || !ctx) return;
    loops.delete(name);
    const t = ctx.currentTime, fade = (s.stopFadeMs ?? 60) / 1000;
    loop.out.gain.cancelScheduledValues(t);
    loop.out.gain.setValueAtTime(loop.out.gain.value, t);
    loop.out.gain.linearRampToValueAtTime(0, t + fade);
    if (loop.timer) clearInterval(loop.timer);
    if (loop.src) loop.src.stop(t + fade + 0.01);
    setTimeout(() => { try { loop.out.disconnect(); } catch { /* gone */ } }, fade * 1000 + 50);
    log(name, s.gain, 1, { phase: 'stop' });
  }

  /* ── Mute, hidden tab ──────────────────────────────────────────────────────────────── */

  /** @param {boolean} m */
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(E.muteKey, muted ? '0' : '1'); } catch { /* storage blocked */ }
    if (muted) for (const n of [...loops.keys()]) stopLoop(n);
    if (ctx && muteGain) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    return muted;
  }

  function onVisibility() {
    if (!ctx || !hideGain) return;
    const t = ctx.currentTime, g = hideGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    if (document.hidden) g.linearRampToValueAtTime(0, t + E.hiddenFadeOutMs / 1000);
    else { ctx.resume().catch(() => {}); g.linearRampToValueAtTime(1, t + 0.2); }
  }

  if (typeof window !== 'undefined') {
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlock, { capture: true, passive: true });
    // WP-14: start rendering takes once the page has loaded, before anyone clicks
    const afterLoad = () => setTimeout(() => { scheduleIdle(); setTimeout(createContext, 0); }, 0);
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
    document.addEventListener('visibilitychange', onVisibility);
  }

  /* ── Mix pass (soundboard) and tests ───────────────────────────────────────────────── */

  /**
   * Offline test of one take (WP-12 acceptance 1): render it through a fresh master chain at
   * `gainDb` and measure. Works before unlock (OfflineAudioContext needs no gesture).
   * @param {string} name @param {number} [gainDb]
   */
  async function offlineCheck(name, gainDb = 0) {
    const sr = 48000;
    const probe = new OfflineAudioContext(1, 1, sr);
    const buf = renderTake(name, mix, probe, new Rng(toSeed(name) ^ appRng.initialSeed));
    const off = new OfflineAudioContext(2, buf.length + sr * 0.05, sr);
    const m = buildMaster(off, E);
    m.output.connect(off.destination);
    const src = off.createBufferSource(); src.buffer = buf;
    const g = off.createGain(); g.gain.value = dbToGain(gainDb);
    src.connect(g).connect(m.buses[sound(name).bus]); src.start();
    const out = (await off.startRendering()).getChannelData(0);
    const raw = buf.getChannelData(0);
    let nan = 0; for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) nan++;
    for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) nan++;
    return { name, ms: buf.duration * 1000, range: ranges[name], rmsDb: gainToDb(rmsOf(raw)), peakDb: gainToDb(peakOf(out)), outRmsDb: gainToDb(rmsOf(out.subarray(0, raw.length + Math.round(sr * 0.006)))) /* the take's own span, plus the compressor's 6 ms look-ahead */, nan };
  }

  return {
    play, startLoop, updateLoop, stopLoop, unlock, setMuted,
    /** WP-17 item 21: whether a sound's take is built (the ambience waits for idle time, never builds in a click). @param {string} n */
    hasTake: n => takes.has(n),
    /** WP-17 item 21: whether a loop is running. @param {string} n */
    looping: n => loops.has(n),
    isUnlocked: () => unlocked,
    muted: () => muted,
    unlocked: () => unlocked,
    isDeferred, playable,
    mix,
    requests,
    stats: () => ({ ...stats, maxVoices: { ...stats.maxVoices }, active: voices.length, loops: [...loops.keys()], takes: takes.size, state: ctx?.state ?? 'locked' }),
    resetStats() { stats.maxVoices = {}; stats.maxTotal = 0; stats.cut = 0; },
    /** Soundboard: live gain (dB) and pitch (rate) for one sound. @param {string} name @param {number} db */
    setGain(name, db) { mix.sounds[name].gain = db; },
    /** @param {string} name @param {number} rate */
    setPitch(name, rate) { if (rate === 1) delete mix.sounds[name].pitch; else mix.sounds[name].pitch = rate; },
    offlineCheck,
    built: () => Object.keys(recipes),
  };
}
