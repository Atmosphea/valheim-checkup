// @ts-check
/**
 * Event → sound (WP-12 step 7). The only file that calls the audio engine for app sounds.
 * Every file 06 sound is wired to its canonical event (src/events.js, DECISIONS point 29), so
 * a sound starts as soon as the feature that emits its event lands. Deferred sounds (Paul's
 * scope cuts) are wired too; the engine keeps them silent until a recipe or override exists.
 *
 * Pan comes from the object's screen x (−0.6 … 0.6): the event's `pan` or `screenX` if it has
 * one, else the on-screen element it names (bar proxy, coin, stamp), else the pointer.
 * Gain follows impact strength or speed where file 06 says so.
 */
import { on } from '../bus.js';
import { rng } from '../util/rng.js';
import { layoutEpoch } from '../util/layout-epoch.js';

/** @param {ReturnType<typeof import('./engine.js').createEngine>} engine */
export function wire(engine) {
  const mix = engine.mix, S = mix.sounds, V = mix.engine.variation;
  const play = engine.play;
  const offs = /** @type {(() => void)[]} */ ([]);
  const when = (/** @type {string} */ type, /** @type {(d: any) => void} */ fn) => offs.push(on(type, d => fn(d || {})));

  /* ── Where is it on screen? ─────────────────────────────────────────────────────────── */
  let pointerX = typeof innerWidth === 'number' ? innerWidth / 2 : 0;
  let pointerSpeed = 0, lastMove = { x: 0, y: 0, t: 0 };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', e => {
      const t = performance.now(), dt = Math.max(1, t - lastMove.t);
      const v = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt * 1000;
      pointerSpeed = pointerSpeed * 0.7 + v * 0.3;
      lastMove = { x: e.clientX, y: e.clientY, t };
      pointerX = e.clientX;
    }, { passive: true, capture: true });
  }
  const screenPan = (/** @type {number} */ x) => {
    const w = typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : 1;
    return V.panMin + Math.max(0, Math.min(1, x / w)) * (V.panMax - V.panMin);
  };
  const COINS = /** @type {Record<string, string>} */ ({ load: '#loadTop', import: '#importProgress', export: '#exportProgress', howto: '[data-howto], #howTo' });
  /** @param {any} d */
  function elementFor(d) {
    if (typeof document === 'undefined') return null;
    const esc = (/** @type {string} */ s) => (globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
    try {
      if (d.stamp) return document.querySelector(`#metrics [data-metric="${esc(String(d.stamp))}"]`);
      if (d.coin && COINS[d.coin]) return document.querySelector(COINS[d.coin]);
      if (d.category) return document.querySelector(`#categories [data-category="${esc(String(d.category))}"]`);
    } catch { /* bad selector */ }
    return null;
  }
  /**
   * WP-18P: an element's screen centre x, read at most once per layout change or 300 ms (camera
   * moves don't change the layout): a rect read for every dot's tick forced the page to restyle
   * and lay out mid-frame. Pan is coarse (file 06), so a few px of lag is inaudible.
   * @type {WeakMap<Element, {epoch: number, at: number, x: number|null}>}
   */
  const centres = new WeakMap();
  /** @param {Element} el */
  function centreX(el) {
    const now = performance.now(), c = centres.get(el);
    if (c && c.epoch === layoutEpoch() && now - c.at < 300) return c.x;
    const r = el.getBoundingClientRect();
    const x = r.width || r.height ? r.left + r.width / 2 : null;
    centres.set(el, { epoch: layoutEpoch(), at: now, x });
    return x;
  }
  /** Pan for an event. @param {any} d */
  function panOf(d) {
    if (typeof d.pan === 'number') return Math.max(V.panMin, Math.min(V.panMax, d.pan));
    if (typeof d.screenX === 'number') return screenPan(d.screenX);
    const el = elementFor(d);
    if (el) { const x = centreX(el); if (x !== null) return screenPan(x); }
    return screenPan(pointerX);
  }
  /** Default play options for an event. @param {any} d */
  const at = d => ({ pan: panOf(d) });

  /** At most one play per `minGapMs` (or `maxPerSecond`) for a sound. */
  const lastPlay = /** @type {Record<string, number>} */ ({});
  /** @param {string} name */
  function gapOk(name) {
    const s = S[name], gap = s.minGapMs ?? (s.maxPerSecond ? 1000 / s.maxPerSecond : 0);
    const t = performance.now();
    if (gap && t - (lastPlay[name] ?? -1e9) < gap) return false;
    lastPlay[name] = t;
    return true;
  }
  /** Strength 0–1 → dB below the sound's maximum. @param {any} x */
  const levelDb = x => (typeof x === 'number' ? 20 * Math.log10(Math.max(0.05, Math.min(1, x))) : 0);

  /* ── Bars and board (mech) ─────────────────────────────────────────────────────────── */
  const scrape = S['bar.scrape'];
  /** @type {{travel: number, t: number, timer: any}} */
  const drag = { travel: NaN, t: 0, timer: 0 };
  const stopScrape = () => { clearTimeout(drag.timer); drag.travel = NaN; engine.stopLoop('bar.scrape'); };
  when('bar:hover', d => play('bar.glint', at(d)));
  when('bar:press', d => play('bar.pickup', at(d)));
  when('bar:drag', d => {
    const t = performance.now();
    let speed = typeof d.speed === 'number' ? d.speed : 0; // cm/s
    if (typeof d.speed !== 'number' && typeof d.travel === 'number' && Number.isFinite(drag.travel)) {
      speed = Math.abs(d.travel - drag.travel) * scrape.travelCm / Math.max(1, t - drag.t) * 1000;
    }
    if (typeof d.travel === 'number') { drag.travel = d.travel; drag.t = t; }
    const o = { speed: Math.min(1, speed / scrape.speedMax), pan: panOf(d) };
    engine.startLoop('bar.scrape', o);
    engine.updateLoop('bar.scrape', o);
    clearTimeout(drag.timer);
    drag.timer = setTimeout(stopScrape, scrape.idleStopMs);
  });
  when('bar:detent', d => {
    const i = typeof d.index === 'number' ? d.index : Math.round((d.travel ?? 0) * 6);
    play('bar.detent', { ...at(d), pitch: 1 + S['bar.detent'].pitchStepPerDetent * i });
  });
  when('bar:prelatch', d => play('bar.prelatch', at(d)));
  when('bar:latch', d => {
    stopScrape();
    play('bar.latch', at(d));
    play('bar.linkage', { ...at(d), delayMs: 90 }); // the linkage starts 90 ms after latch (file 04)
  });
  when('bar:return', d => play('bar.return', at(d)));
  when('bar:springback', d => { stopScrape(); play('bar.springback', at(d)); });
  when('bar:nudge', d => play('bar.nudge', at(d)));
  when('impact', d => play('bar.rattle', { ...at(d), gainDb: levelDb(d.strength) }));
  when('brass:pour', d => play('brass.pour', at(d)));
  when('plaque:tick', d => { if (gapOk('plaque.tick')) play('plaque.tick', at(d)); });
  when('app:mode', d => play('toggle.brass', at(d)));

  /* ── Coins ──────────────────────────────────────────────────────────────────────────── */
  const land = S['coin.land'];
  /** One landing: first contact, or second contact plus the settling chatter. @param {any} d @param {number} contact @param {number} [delayMs] */
  function coinLand(d, contact, delayMs = 0) {
    const pan = panOf(d);
    if (contact <= 1) { play('coin.land', { pan, delayMs, gainDb: land.firstContactGain - land.gain }); return; }
    play('coin.land', { pan, delayMs, gainDb: land.secondContactGain - land.gain });
    let t = delayMs;
    for (const gap of land.chatterGapsMs) {
      t += gap;
      const g = rng.range(land.chatterGainMin, land.chatterGainMax);
      play('coin.land', { pan, delayMs: t, gainDb: g - land.gain, gainSpreadDb: 0 });
    }
  }
  when('coin:hop', d => play('coin.up', at(d)));
  when('coin:land', d => coinLand(d, d.contact ?? 1));
  when('coin:press', d => play('coin.press', at(d)));
  when('coin:flip', d => {
    play('coin.flip', at(d));
    const ms = S['coin.flip'].ms;
    coinLand(d, 1, ms); coinLand(d, 2, ms + 140); // "then coin.land"
  });
  when('coin:mute', d => {
    const next = typeof d.muted === 'boolean' ? d.muted : !engine.muted();
    if (next) { play('coin.mute', at(d)); setTimeout(() => engine.setMuted(true), 120); } // played before muting
    else { engine.setMuted(false); play('coin.mute', at(d)); }
  });

  /* ── Paul, WP-17 item 21: the tavern ambience ───────────────────────────────────────── */
  // A quiet bed under everything once sound is allowed: after the first click or key press, when
  // its take has been built in idle time (never inside a click), while the Sound coin is on. The
  // engine stops every loop on mute; this brings it back on unmute. `?soundboard` never starts it
  // by itself (the soundboard has its own Start button).
  const board = typeof location !== 'undefined' && new URLSearchParams(location.search).has(mix.engine.soundboardQuery ?? 'soundboard');
  if (!board && typeof setInterval === 'function' && S['amb.hall'] && !engine.isDeferred('amb.hall')) {
    setInterval(() => {
      if (!engine.isUnlocked() || engine.muted() || engine.looping('amb.hall') || !engine.hasTake('amb.hall')) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      engine.startLoop('amb.hall', { pan: 0 });
    }, 1000);
  }

  /* ── Gauntlet ───────────────────────────────────────────────────────────────────────── */
  when('gauntlet:creak', d => { if (gapOk('gauntlet.creak')) play('gauntlet.creak', at(d)); });
  when('gauntlet:stretch', d => play('gauntlet.stretch', at(d)));
  when('gauntlet:pinch', d => play('gauntlet.pinch', at(d)));
  when('gauntlet:wall', d => play('gauntlet.wall', at(d)));
  when('visor:open', d => play('visor.open', at(d)));
  when('visor:close', d => play('visor.close', at(d)));

  /* ── Spark and magic ────────────────────────────────────────────────────────────────── */
  let crackleTimer = /** @type {any} */ (0);
  const crackle = S['spark.crackle'];
  when('spark:out', d => {
    play('spark.out', at(d));
    if (engine.startLoop('spark.crackle', { speed: 0, pan: panOf(d) })) {
      clearInterval(crackleTimer);
      crackleTimer = setInterval(() => {
        pointerSpeed *= 0.85; // decays when the pointer stops
        engine.updateLoop('spark.crackle', { speed: Math.min(1, pointerSpeed / crackle.speedPxPerSecMax), pan: screenPan(pointerX) });
      }, 60);
    }
  });
  when('spark:in', d => {
    clearInterval(crackleTimer);
    engine.stopLoop('spark.crackle');
    play('spark.in', at(d));
  });
  when('spark:embers', d => play('spark.embers', at(d)));
  when('spark:click', d => play('spark.click', at(d)));
  when('spark:hover', d => play('spark.hover', at(d)));
  when('drag:file-enter', d => engine.startLoop('coin.hum', { speed: 1, pan: panOf(d) }));
  when('drag:file-leave', () => engine.stopLoop('coin.hum'));
  when('drop:file', d => { engine.stopLoop('coin.hum'); play('paper.ripple', at(d)); });
  when('app:load', d => play(d.ok ? 'load.success' : 'load.fail', at({ coin: 'load', ...d })));
  when('details:float', d => play('unfold.float', at(d)));

  /* ── Ink and paper ──────────────────────────────────────────────────────────────────── */
  when('fx:wash-out-start', () => play('wash.out', { pan: 0, panTo: V.panMax })); // centre → right
  when('fx:wash-in-start', () => play('wash.in', { pan: V.panMin, panTo: 0 }));   // left → centre
  const big = S['stamp.big'];
  let stampCount = 0;
  when('fx:wash-out-start', () => { stampCount = 0; });
  when('fx:stamp-land', d => {
    let i = big.order.indexOf(d.stamp);
    if (i < 0) i = stampCount % big.pitches.length;
    stampCount++;
    play('stamp.big', { ...at(d), pitch: big.pitches[i], pitchSpread: big.pitchSpread, gainDb: levelDb(d.strength) });
  });
  const dot = S['stamp.dot'];
  when('fx:dot', d => {
    // Pitch climbs 1 semitone every 4 dots within a grid, up to +7.
    const semis = Math.min(dot.pitchMaxSemitones, Math.floor((d.index ?? 0) / dot.pitchStepEveryDots) * dot.pitchStepSemitones);
    play('stamp.dot', { ...at(d), semis, gainSpreadDb: dot.gainSpreadDb });
  });
  when('fx:count-end', d => play('count.settle', at(d)));
  when('paper:lift', d => {
    if (!gapOk('paper.lift')) return;
    play('paper.lift', { ...at(d), gainDb: typeof d.speed === 'number' ? levelDb(d.speed / S['paper.lift'].speedMax) : 0 });
  });
  // Paul, WP-18 item 4: no sound when the table stops scrolling (lift.js's `paper:settle` for the
  // slip); a sheet settling after a breeze still sounds
  when('paper:settle', d => { if (d?.sheet !== 'slip') play('paper.settle', at(d)); });
  when('details:fold', d => play('unfold.flap', { ...at(d), semis: S['unfold.flap'].stepSemitones * (d.i ?? 0) }));
  when('app:details-close', d => play('fold.close', at(d)));
  when('menu:open', d => play('menu.open', at(d)));
  when('menu:close', d => play('menu.close', at(d)));
  when('menu:select', d => play('menu.select', at(d)));
  when('app:star', d => play(d.on ? 'star.on' : 'star.off', at(d)));
  when('app:toast', d => play('toast.in', { ...at(d), pan: V.panMax * 0.8 })); // the slip sits bottom right
  when('toast:out', d => play('toast.out', { ...at(d), pan: V.panMax * 0.8 }));
  when('app:favorite-add', d => play('tag.add', at(d)));
  when('app:favorite-remove', d => play('tag.remove', at(d)));
  when('tag:swing', d => play('tag.swing', at(d)));
  when('help:open', d => {
    const seal = S['seal.crack'];
    play('seal.crack', at(d));
    for (let i = 0; i < seal.thenTimes; i++) play('unfold.flap', { ...at(d), delayMs: seal.ms + i * 70, semis: S['unfold.flap'].stepSemitones * i });
  });
  when('app:export-list', d => play('export.quill', at(d)));
  when('title:stroke', d => play('title.quill', at(d)));
  when('hint:show', d => play('hint.ink', at(d)));

  /* ── Interface ──────────────────────────────────────────────────────────────────────── */
  when('tour:start', () => play('tour.dim', { pan: 0 }));
  when('tour:step', () => play('tour.move', { pan: 0 }));
  when('tour:end', () => play('tour.end', { pan: 0 }));

  // type.key has no bus event: it listens to typing in the search and note fields directly.
  if (typeof document !== 'undefined') {
    const typing = (/** @type {Event} */ e) => {
      const t = /** @type {Element} */ (e.target);
      if (t instanceof Element && t.matches('#search, #itemDialog textarea, #itemDialog input[type="text"]')) play('type.key', { pan: screenPan(pointerX) });
    };
    document.addEventListener('input', typing, true);
    offs.push(() => document.removeEventListener('input', typing, true));
  }

  return () => { for (const off of offs) off(); stopScrape(); clearInterval(crackleTimer); };
}
