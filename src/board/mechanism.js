// @ts-check
/**
 * The slider mechanism (WP-06 "Mechanism", file 04 "Woodblock and steel bars").
 *
 * Pure logic: no three.js and no DOM, so it runs (and is unit-tested) in Node. The board feeds
 * it pointer positions along the slot (cm) and calls `step(dt)` every frame; it moves the bars
 * with the shared springs, emits the canonical `bar:*` events and asks the app to select a
 * view at the latch moment.
 *
 * Positions are centimetres of travel: 0 = rest, `travel` = latched. Paul, WP-16 item 9: rest
 * is on the LEFT and a bar slides RIGHT to select (it was the other way round); the pointer's
 * board x grows toward the latch.
 *
 * Bar states: resting, hover, pinched, dragging, latching, latched, returning, springback.
 * Paul, WP-16 item 10: only one bar is out at a time. While another bar is dragged (or slides
 * by itself, or springs back) the selected bar is coupled to it: it sits at `travel − the other
 * bar's travel`, so it slides home exactly as the new one comes out, and back out if the new one
 * is let go short of the latch. After a latch the old bar is `returning` on that coupling until
 * it lands.
 *
 * Event order for one drag that latches (DECISIONS point 3):
 *   bar:press → bar:drag … (bar:detent ×n, bar:prelatch) → bar:latch → app:category → bar:return
 * `app:category` comes from the app's own setCategory, which `select()` triggers right after
 * `bar:latch`; `bar:return` is emitted when the previous bar lands, which (coupled) is when the
 * new one reaches its latch, never before `bar:latch`.
 */
import { Spring } from '../util/spring.js';
import { ease } from '../util/ease.js';
import { bar as M } from '../config/motion.js';

/** @typedef {'resting'|'hover'|'pinched'|'dragging'|'latching'|'latched'|'returning'|'springback'} BarState */

/**
 * @typedef {object} Bar
 * @property {number} index
 * @property {string} category
 * @property {BarState} state
 * @property {Spring} pos        travel position, cm (0 rest … travel latched)
 * @property {Spring} lift       height out of the slot, cm
 * @property {Spring} rattle     sideways offset from impacts / twitches, cm
 * @property {Spring} nudge      leftward nudge offset, cm
 * @property {number} tilt       0..1 press tilt amount (× pressTiltDeg)
 * @property {number} lastDetent detent index last passed (0…divisions)
 * @property {boolean} prelatched
 * @property {boolean} [coupled]  WP-16: positioned by the coupling this frame (the selected bar giving way)
 * @property {{ pointerX: number, startPos: number, t0: number, moved: number, desired: number, lastX: number } | null} drag
 * @property {{ from: number, to: number, t0: number, ms: number, kind: 'auto'|'return'|'nudge', select: boolean, delay: number, startEmitted: boolean } | null} timed
 * @property {number[]} pendingRattles  times (ms) at which a queued rattle kick fires
 * @property {number[]} pendingKicks    strengths for those kicks
 */

/**
 * @param {object} o
 * @param {string[]} o.categories           bar order, top to bottom
 * @param {string} [o.latched]              category latched at start (P17: The Master Chef)
 * @param {(type: string, data: any) => void} o.emit
 * @param {(category: string) => void} o.select   commit a selection (calls the app's setCategory)
 * @param {() => number} o.now              scaled clock ms
 * @param {() => number} [o.random]         0..1 (seeded rng), for the impact stagger
 * @param {(category: string) => void} [o.onHint]   second click within 4 s
 * @param {(bar: Bar, kind: 'latch'|'return'|'springback'|'detent'|'nudge') => void} [o.onContact]
 * @param {typeof M} [o.config]
 */
export function createMechanism(o) {
  const C = o.config ?? M;
  const travel = o.travel ?? 7;
  const random = o.random ?? Math.random;
  const divisions = C.detentDivisions;

  /** @type {Bar[]} */
  const bars = o.categories.map((category, index) => ({
    index, category, state: /** @type {BarState} */ ('resting'),
    pos: new Spring({ ...C.dragSpring, value: 0 }),
    lift: new Spring({ ...C.liftSpring, value: 0 }),
    rattle: new Spring({ ...C.impactRattleSpring, value: 0 }),
    nudge: new Spring({ ...C.springbackSpring, value: 0 }),
    tilt: 0, lastDetent: 0, prelatched: false, coupled: false, drag: null, timed: null,
    pendingRattles: [], pendingKicks: [],
  }));
  const byCategory = new Map(bars.map(b => [b.category, b]));
  let lastNudgeAt = -Infinity;
  /** Selection the board itself committed and is waiting to see as app:category. */
  let selecting = /** @type {string|null} */ (null);

  const start = o.latched ? byCategory.get(o.latched) : null;
  if (start) { start.pos.snap(travel); start.state = 'latched'; start.lastDetent = divisions; start.prelatched = true; }
  /** The bar that owns the selection (latched or latching, or briefly held by the user). */
  let owner = start ?? null;

  const frac = (/** @type {Bar} */ b) => Math.max(0, Math.min(1, b.pos.value / travel));
  const data = (/** @type {Bar} */ b, extra = {}) => ({ category: b.category, travel: +frac(b).toFixed(4), ...extra });
  const latchedBar = () => owner;

  /** Switch a spring's parameters without losing its motion. @param {Spring} s @param {{stiffness: number, damping: number}} p */
  const params = (s, p) => { s.stiffness = p.stiffness; s.damping = p.damping; };

  /** Detents and the pre-latch click while the bar moves left under the user (or auto-slide). @param {Bar} b @param {number} x cm */
  function crossings(b, x) {
    const f = x / travel;
    const idx = Math.max(0, Math.min(divisions, Math.floor(f * divisions + 1e-9)));
    while (idx > b.lastDetent) {
      b.lastDetent++;
      if (b.lastDetent < divisions) {
        o.emit('bar:detent', data(b, { index: b.lastDetent }));
        o.onContact?.(b, 'detent');
      }
    }
    if (idx < b.lastDetent) b.lastDetent = idx; // moving back right re-arms the detents
    if (!b.prelatched && f >= C.latchThreshold) { b.prelatched = true; o.emit('bar:prelatch', data(b)); }
    if (b.prelatched && f < C.latchThreshold - 0.05) b.prelatched = false;
  }

  /** Where the bar is pulled while dragged: the pointer, plus detent micro-snaps and the magnetic latch pull. @param {number} x */
  function dragTarget(x) {
    const f = x / travel;
    // micro-snap: a tiny tug toward the nearest sixth
    const nearest = Math.round(f * divisions) / divisions * travel;
    const toward = Math.sign(nearest - x) * Math.min(C.detentSnap, Math.abs(nearest - x));
    // magnetic detent past 60%: up to 0.15 cm toward the latch
    const pull = f >= C.latchThreshold ? C.prelatchPull * Math.min(1, (f - C.latchThreshold) / (1 - C.latchThreshold) * 4) : 0;
    return Math.max(0, Math.min(travel, x + toward + pull));
  }

  /** Bars displaced by a latch, still riding the coupling home (Paul, WP-16 item 10). @type {Set<Bar>} */
  const homing = new Set();
  let latchAt = -Infinity;

  /** The previous latched bar goes home on the coupling; every other bar twitches. @param {Bar} next @param {number} t */
  function handover(next, t) {
    const prev = owner;
    owner = next;
    for (const b of bars) {
      if (b === next) continue;
      if (b === prev) {
        b.state = 'returning';
        b.timed = null; b.drag = null;
        homing.add(b);
      } else if (b.state !== 'returning' && b.state !== 'dragging') {
        b.rattle.impulse((random() < 0.5 ? -1 : 1) * C.linkageTwitch * 25);
      }
    }
    void t;
  }

  /**
   * The bar the selected bar is coupled to this frame: the non-owner bar that is furthest out
   * while held, auto-sliding, springing back or latching. @returns {Bar|null}
   */
  function challenger() {
    let best = null;
    for (const b of bars) {
      if (b === owner || homing.has(b)) continue;
      const active = !!b.drag || b.timed?.kind === 'auto' || b.state === 'springback' || b.state === 'dragging';
      if (active && (b.pos.value > 1e-4 || b.state === 'springback') && (!best || b.pos.value > best.pos.value)) best = b;
    }
    return best;
  }

  /** Put a coupled bar at travel − the leader's travel. @param {Bar} b @param {Bar|null} lead @param {number} dt */
  function couple(b, lead, dt) {
    const p = Math.max(0, Math.min(travel, travel - (lead ? Math.max(0, Math.min(travel, lead.pos.value)) : 0)));
    b.pos.velocity = dt > 0 ? (p - b.pos.value) / (dt / 1000) : 0;
    b.pos.value = p; b.pos.target = p;
  }

  /**
   * Latch a bar: the selection commits here.
   * @param {Bar} b @param {number} t @param {'user'|'app'} source  'app' = the view was chosen elsewhere; don't select again
   */
  function latch(b, t, source) {
    latchAt = t;
    b.state = 'latching';
    b.drag = null; b.timed = null;
    params(b.pos, C.latchSpring);
    b.pos.target = travel;
    b.lift.target = 0;
    b.tilt = 0;
    o.emit('bar:latch', data(b, { travel: 1, source }));
    o.onContact?.(b, 'latch');
    if (source === 'user') {
      selecting = b.category;
      try { o.select(b.category); } finally { selecting = null; }
    }
    handover(b, t);
  }

  /** @param {Bar} b @param {number} t */
  function springback(b, t) {
    b.state = 'springback';
    b.drag = null; b.timed = null;
    params(b.pos, C.springbackSpring);
    b.pos.target = 0;
    b.lift.target = 0;
    b.tilt = 0;
    b.prelatched = false;
    o.emit('bar:springback', data(b));
    o.onContact?.(b, 'springback');
    void t;
  }

  /** The owner bar goes back to its latch quietly (no new selection). @param {Bar} b */
  function relatch(b) {
    b.state = 'latching';
    params(b.pos, C.latchSpring);
    b.pos.target = travel;
    b.lift.target = 0;
    b.tilt = 0;
  }

  const api = {
    bars,
    travel,
    /** @param {string} category */
    bar: category => byCategory.get(category) ?? null,
    get latched() { return latchedBar()?.category ?? null; },
    get selecting() { return selecting; },
    /** Fraction of travel 0..1 for a bar. @param {Bar} b */
    fraction: frac,

    /** Pointer over the knob. @param {number} i @param {boolean} on */
    hover(i, on) {
      const b = bars[i];
      if (on && b.state === 'resting') { b.state = 'hover'; o.emit('bar:hover', data(b)); }
      else if (!on && b.state === 'hover') b.state = 'resting';
    },

    /** pointerdown on the knob's proxy. @param {number} i @param {number} x pointer along the slot, cm (board x) */
    press(i, x) {
      const b = bars[i], t = o.now();
      if (b.state === 'returning') return false; // the linkage has it
      b.drag = { pointerX: x, startPos: b.pos.value, t0: t, moved: 0, desired: b.pos.value, lastX: x };
      b.timed = null;
      b.state = 'pinched';
      params(b.pos, C.dragSpring);
      b.pos.target = b.pos.value;
      b.lift.target = C.pressLift;
      b.tilt = 1;
      o.emit('bar:press', data(b));
      return true;
    },

    /** Pointer moved while pressed. Travel follows the pointer along the slot only, clamped. @param {number} i @param {number} x */
    move(i, x) {
      const b = bars[i];
      if (!b.drag) return;
      const d = b.drag;
      d.moved = Math.max(d.moved, Math.abs(x - d.pointerX));
      d.lastX = x;
      // Paul, WP-16 item 9: dragging right (larger x) opens the bar
      d.desired = Math.max(0, Math.min(travel, d.startPos + (x - d.pointerX)));
      if (b.state === 'pinched' && d.moved < 0.02) return;
      b.state = 'dragging';
      b.pos.target = dragTarget(d.desired);
      crossings(b, d.desired);
      o.emit('bar:drag', data(b, { travel: +(d.desired / travel).toFixed(4), speed: +Math.abs(b.pos.velocity).toFixed(1) }));
    },

    /** pointerup. Returns what happened. @param {number} i @returns {'click'|'latch'|'springback'|'none'} */
    release(i) {
      const b = bars[i], t = o.now();
      const d = b.drag;
      if (!d) return 'none';
      b.drag = null;
      const quick = t - d.t0 <= C.clickMaxMs;
      if (d.moved < C.clickMaxMove && quick) {
        // Click without drag: nudge toward the latch and spring back; never selects (mechanism step 4).
        b.state = owner === b ? 'latching' : 'resting';
        if (owner === b) { params(b.pos, C.latchSpring); b.pos.target = travel; }
        else { params(b.pos, C.springbackSpring); b.pos.target = 0; }
        b.lift.target = 0; b.tilt = 0;
        b.timed = { from: 0, to: C.nudgeDistance, t0: t, ms: C.nudgeOutMs, kind: 'nudge', select: false, delay: 0, startEmitted: true };
        o.emit('bar:nudge', data(b));
        o.onContact?.(b, 'nudge');
        if (t - lastNudgeAt <= C.nudgeHintWindowMs) { o.onHint?.(b.category); lastNudgeAt = -Infinity; }
        else lastNudgeAt = t;
        return 'click';
      }
      // the latched bar can be wiggled, but it only goes home when another bar takes over
      if (owner === b) { relatch(b); return 'none'; }
      const f = d.desired / travel;
      if (f >= C.latchThreshold) { latch(b, t, 'user'); return 'latch'; }
      springback(b, t);
      return 'springback';
    },

    /** pointercancel / lost capture: spring back (mechanism step 2). @param {number} i */
    cancel(i) {
      const b = bars[i];
      if (!b.drag) return;
      b.drag = null;
      if (owner === b) { relatch(b); return; }
      springback(b, o.now());
    },

    /**
     * Keyboard Enter/Space or a programmatic click on the proxy: the bar slides by itself
     * (420 ms) and selects at the latch moment. On the bar that is already latched it selects
     * at once (the original button re-selects its own view).
     * @param {number} i
     * @returns {'select'|'slide'|'busy'}
     */
    activate(i) {
      const b = bars[i], t = o.now();
      if (owner === b) {
        selecting = b.category;
        try { o.select(b.category); } finally { selecting = null; }
        b.rattle.impulse(-C.linkageTwitch * 25);
        return 'select';
      }
      if (b.timed?.kind === 'auto') return 'busy';
      // an auto-slide toward another bar is cancelled (never two at once)
      for (const other of bars) if (other !== b && other.timed?.kind === 'auto') springback(other, t);
      b.drag = null;
      b.timed = { from: b.pos.value, to: travel, t0: t, ms: C.autoSlideMs * (1 - b.pos.value / travel), kind: 'auto', select: true, delay: 0, startEmitted: false };
      b.state = 'dragging';
      return 'slide';
    },

    /**
     * The view was chosen elsewhere (favourite tag, phone menu, restore): animate to match,
     * without selecting again (mechanism step 6).
     * @param {string} category
     */
    sync(category) {
      const b = byCategory.get(category);
      if (!b || selecting === category) return;
      if (owner === b) return;
      const t = o.now();
      for (const other of bars) if (other !== b && other.timed?.kind === 'auto') springback(other, t);
      b.drag = null;
      b.timed = { from: b.pos.value, to: travel, t0: t, ms: C.autoSlideMs * (1 - b.pos.value / travel), kind: 'auto', select: false, delay: 0, startEmitted: false };
      b.state = 'dragging';
    },

    /**
     * Impact felt at each bar (already reduced by distance): every bar rattles, staggered 0–40 ms.
     * @param {(b: Bar) => number} feltAt
     */
    impact(feltAt) {
      const t = o.now();
      for (const b of bars) {
        const s = feltAt(b);
        if (s <= 0.001) continue;
        b.pendingRattles.push(t + C.impactStaggerMinMs + random() * (C.impactStaggerMaxMs - C.impactStaggerMinMs));
        b.pendingKicks.push(s * (random() < 0.5 ? -1 : 1));
      }
    },

    /** Advance every bar. @param {number} dt ms */
    step(dt) {
      const t = o.now();
      for (const b of bars) {
        // queued impact rattles: a velocity kick sized so the peak is about ±0.03 cm × strength
        for (let k = b.pendingRattles.length - 1; k >= 0; k--) {
          if (b.pendingRattles[k] <= t) {
            b.rattle.impulse(b.pendingKicks[k] * C.impactRattle * Math.sqrt(C.impactRattleSpring.stiffness) * 1.6);
            b.pendingRattles.splice(k, 1); b.pendingKicks.splice(k, 1);
          }
        }
        const tm = b.timed;
        if (tm) {
          const local = t - tm.t0 - tm.delay;
          if (local >= 0) {
            if (tm.kind === 'nudge') {
              // out quickly, then the springback spring brings it home
              const x = Math.min(1, local / tm.ms);
              b.nudge.snap(tm.to * ease.outQuad(x));
              if (x >= 1) { b.nudge.target = 0; b.timed = null; }
            } else {
              if (!tm.startEmitted) {
                tm.startEmitted = true;
                if (tm.kind === 'auto') { b.state = 'dragging'; o.emit('bar:press', data(b, { auto: true })); }
              }
              const x = Math.min(1, local / Math.max(1, tm.ms));
              const e = (tm.kind === 'auto' ? ease[C.autoSlideEase] : ease[C.linkageEase])(x);
              const p = tm.from + (tm.to - tm.from) * e;
              const vel = (p - b.pos.value) / Math.max(1e-3, dt / 1000);
              b.pos.value = p; b.pos.target = p; b.pos.velocity = dt > 0 ? vel : 0;
              if (tm.kind === 'auto') {
                b.lift.target = x < 0.9 ? C.pressLift : 0;
                crossings(b, p);
                if (dt > 0) o.emit('bar:drag', data(b, { speed: +Math.abs(vel).toFixed(1), auto: true }));
                if (x >= 1) latch(b, t, tm.select ? 'user' : 'app');
              } else if (x >= 1) {
                b.timed = null;
                b.state = 'resting';
                b.lastDetent = 0; b.prelatched = false;
                params(b.pos, C.springbackSpring);
                b.pos.snap(0);
                o.emit('bar:return', data(b));
                o.onContact?.(b, 'return');
              }
            }
          }
        }
        if ((!b.timed || b.timed.kind === 'nudge') && !b.coupled && !homing.has(b)) {
          b.pos.step(dt);
          // the latch has an end stop: one overshoot of at most ~0.12 cm, then it drops in
          if (b.state === 'latching' && b.pos.value > travel + C.latchOvershoot) {
            b.pos.value = travel + C.latchOvershoot;
            if (b.pos.velocity > 0) b.pos.velocity *= -0.35;
          }
          if (b.pos.value < -0.05 && b.state === 'springback') { b.pos.value = -0.05; if (b.pos.velocity < 0) b.pos.velocity *= -0.3; }
        }
        b.lift.step(dt);
        b.rattle.step(dt);
        b.nudge.step(dt);
        if (b.state === 'latching' && b.pos.settled(2e-3)) { b.state = 'latched'; b.pos.snap(travel); }
        if (b.state === 'springback' && b.pos.settled(2e-3)) { b.state = 'resting'; b.pos.snap(0); b.lastDetent = 0; }
      }
      // ── Paul, WP-16 item 10: the coupling ──
      // the selected bar gives way to whichever bar is coming out
      if (owner && !owner.drag && (owner.state === 'latched' || owner.state === 'latching' || owner.state === 'returning')) {
        const lead = challenger();
        if (lead) { couple(owner, lead, dt); owner.state = 'returning'; owner.coupled = true; }
        else if (owner.coupled) { owner.coupled = false; owner.state = 'latching'; params(owner.pos, C.latchSpring); owner.pos.target = travel; }
      }
      // a bar displaced by a latch rides the new bar home, and lands when it latches
      for (const b of homing) {
        couple(b, owner, dt);
        // it lands when the new bar is home, but never before the selection has gone through
        // (DECISIONS point 3: … bar:latch → app:category → bar:return; the app's own render runs
        // in a task of its own, WP-14), so at least the old linkage delay after the latch
        const landed = owner && (owner.state === 'latched' || owner.pos.value >= travel - 1e-3) && o.now() - latchAt >= C.linkageDelayMs;
        if (landed || !owner) {
          homing.delete(b);
          b.coupled = false;
          b.state = 'resting';
          b.lastDetent = 0; b.prelatched = false;
          params(b.pos, C.springbackSpring);
          b.pos.snap(0);
          o.emit('bar:return', data(b));
          o.onContact?.(b, 'return');
        }
      }
    },

    /** Snapshot for tests and __vc.board.state(). */
    state() {
      return bars.map(b => ({ category: b.category, state: b.state, travel: +frac(b).toFixed(4), x: +b.pos.value.toFixed(3), lift: +b.lift.value.toFixed(3) }));
    },
  };
  return api;
}

/** @typedef {ReturnType<typeof createMechanism>} Mechanism */
