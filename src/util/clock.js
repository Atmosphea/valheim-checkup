// @ts-check
/**
 * The one central clock and frame scheduler (file 01 "Time"; WP-18P). Every animation reads time
 * from here, never from performance.now() or Date directly, so tests can slow, speed up or pause
 * the whole app with `__vc.timeScale(x)`. Nothing else in the app calls requestAnimationFrame or
 * requestIdleCallback (docs/explained/architecture.md).
 *
 * One tick per animation frame, in this order:
 *
 *   1. read    `onRead(fn)`: DOM measurements only (rects, offsets, hit tests). They run before
 *              anything in this frame writes to the DOM, so they never force a second style or
 *              layout pass (WP-18P measured ~10 forced recalcs per frame when reads and writes
 *              were interleaved across modules).
 *   2. timers  `after(ms, fn)`, on scaled time
 *   3. frame   `onFrame(fn)` every frame, `nextFrame(fn)` once: the writes (styles, uniforms,
 *              canvases); the desk stage runs its phases from one of these
 *   4. idle    `idle(task)`: deferred work, run only while this tick's JavaScript has used less
 *              than `idleBudgetMs`; a task that is a generator runs one step per slice, so long
 *              jobs spread over frames instead of making one frame long
 *
 * Times are milliseconds. "Scaled time" = wall time × time scale, accumulated, so changing the
 * scale never makes time jump.
 */

/** Longest wall-clock gap one frame may report (ms), so a hidden tab doesn't make springs explode. */
export const MAX_FRAME_MS = 100;
/**
 * WP-18P: JavaScript a tick may spend before idle work waits for the next frame (ms). A 60 Hz
 * frame is 16.7 ms; the browser's own style, layout, paint and compositing need the rest.
 */
export const IDLE_BUDGET_MS = 5;

/**
 * @typedef {object} Clock
 * @property {() => number} now             scaled ms since the clock was created
 * @property {() => number} wall            raw source time (ms)
 * @property {() => number} frameWall       wall time of the frame being run (the rAF timestamp; reads no clock)
 * @property {() => number} scale           current time scale
 * @property {(x: number) => number} setScale  set the time scale (0 pauses); returns it
 * @property {(wallNow?: number) => number} tick  advance one frame; returns scaled delta ms (clamped)
 * @property {(fn: (dt: number, t: number) => void) => () => void} onFrame  run fn every frame; returns unsubscribe
 * @property {(fn: (t: number) => void) => () => void} onRead  run fn at the start of every frame, before any write; returns unsubscribe
 * @property {(fn: (dt: number, t: number) => void) => () => void} nextFrame  run fn once, in the write phase of the next
 *   tick (asked for during a tick, that is the following frame, after a paint); returns cancel
 * @property {(fn: (t: number) => void) => () => void} nextRead  run fn once, first thing next frame while layout is still
 *   clean (a read, or a call such as focus() that needs clean style and layout); returns cancel
 * @property {(task: () => (void | Iterator<unknown>), o?: { timeoutMs?: number }) => () => void} idle
 *   queue deferred work; a returned iterator is stepped once per slice until done. `timeoutMs`
 *   (wall) runs it even if no frame has budget left by then. Returns cancel.
 * @property {() => {queued: number, ran: number, slices: number, overBudget: number}} idleStats
 * @property {(ms: number, fn: () => void) => () => void} after  call fn once after `ms` of scaled time; returns cancel
 * @property {() => void} start             start the requestAnimationFrame loop (no-op without rAF)
 * @property {() => void} stop
 * @property {() => {last: number, avg: number, worst: number, frames: number}} work
 *   WP-14: JavaScript time of each tick (all frame callbacks and due timers), real ms, over the
 *   last 240 ticks — the `?perf` overlay's "JS ms"
 */

/**
 * @param {{ source?: () => number, scale?: number }} [options]
 *   source: wall-time source in ms (default performance.now). Tests pass a fake.
 * @returns {Clock}
 */
export function createClock(options = {}) {
  const source = options.source || (() => performance.now());
  let timeScale = validScale(options.scale ?? 1);
  let baseWall = source();
  let baseScaled = 0;
  let lastWall = /** @type {number|null} */ (null);
  /** @type {Set<(dt: number, t: number) => void>} */
  const frameFns = new Set();
  /** @type {Set<(t: number) => void>} */
  const readFns = new Set();
  /** @type {Set<(dt: number, t: number) => void>} */
  let onceFns = new Set();
  /** @type {Set<(t: number) => void>} */
  let onceReads = new Set();
  /** @type {{fn: () => any, it: Iterator<unknown> | null, due: number}[]} */
  let idleQ = [];
  const idleStat = { ran: 0, slices: 0, overBudget: 0 };
  /** @type {{at: number, fn: () => void}[]} */
  let timers = [];
  let rafId = 0;
  const realNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  const workRing = new Float32Array(240);
  let workAt = 0, workFrames = 0, workLast = 0;

  const scaledAt = (/** @type {number} */ w) => baseScaled + (w - baseWall) * timeScale;

  /** @type {Clock} */
  const clock = {
    now: () => scaledAt(source()),
    wall: () => source(),
    scale: () => timeScale,
    setScale(x) {
      const w = source();
      baseScaled = scaledAt(w);
      baseWall = w;
      timeScale = validScale(x);
      return timeScale;
    },
    frameWall: () => (lastWall === null ? source() : lastWall),
    tick(wallNow = source()) {
      const w0 = realNow();
      const rawDelta = lastWall === null ? 0 : Math.max(0, Math.min(MAX_FRAME_MS, wallNow - lastWall));
      lastWall = wallNow;
      const dt = rawDelta * timeScale;
      const t = scaledAt(wallNow);
      // one-shots asked for during this tick wait for the next one (a later frame, after a paint)
      const onceW = onceFns; if (onceW.size) onceFns = new Set();
      if (onceReads.size) { const once = onceReads; onceReads = new Set(); for (const fn of once) safely(() => fn(t)); }
      for (const fn of [...readFns]) safely(() => fn(t));
      if (timers.length) {
        const due = timers.filter(x => x.at <= t);
        if (due.length) {
          timers = timers.filter(x => x.at > t);
          for (const d of due) safely(d.fn);
        }
      }
      for (const fn of [...frameFns]) safely(() => fn(dt, t));
      for (const fn of onceW) safely(() => fn(dt, t));
      if (idleQ.length) runIdle(w0, wallNow);
      workLast = realNow() - w0;
      workRing[workAt] = workLast; workAt = (workAt + 1) % workRing.length; workFrames++;
      return dt;
    },
    work() {
      const n = Math.min(workFrames, workRing.length);
      let sum = 0, worst = 0;
      for (let i = 0; i < n; i++) { sum += workRing[i]; if (workRing[i] > worst) worst = workRing[i]; }
      return { last: workLast, avg: n ? sum / n : 0, worst, frames: workFrames };
    },
    onFrame(fn) {
      frameFns.add(fn);
      clock.start();
      return () => { frameFns.delete(fn); };
    },
    onRead(fn) {
      readFns.add(fn);
      clock.start();
      return () => { readFns.delete(fn); };
    },
    nextFrame(fn) {
      const f = (/** @type {number} */ dt, /** @type {number} */ t) => fn(dt, t);
      onceFns.add(f);
      clock.start();
      // no animation frames (Node): the next "frame" is the next timer turn
      if (typeof requestAnimationFrame !== 'function') setTimeout(() => { if (onceFns.delete(f)) fn(0, clock.now()); }, 0);
      return () => { onceFns.delete(f); };
    },
    nextRead(fn) {
      const f = (/** @type {number} */ t) => fn(t);
      onceReads.add(f);
      clock.start();
      return () => { onceReads.delete(f); };
    },
    idle(task, o = {}) {
      const job = { fn: task, it: /** @type {Iterator<unknown> | null} */ (null), due: o.timeoutMs === undefined ? Infinity : source() + o.timeoutMs };
      idleQ.push(job);
      clock.start();
      // no animation frames (a hidden tab, Node): run it from a timer instead
      if (typeof requestAnimationFrame !== 'function') setTimeout(() => runIdle(realNow(), source(), true), 0);
      // a hidden tab runs no frames: a task with a deadline still runs by then
      else if (o.timeoutMs !== undefined) setTimeout(() => { if (idleQ.includes(job)) runIdle(realNow(), source()); }, o.timeoutMs + 50);
      return () => { idleQ = idleQ.filter(x => x !== job); };
    },
    idleStats: () => ({ queued: idleQ.length, ...idleStat }),
    after(ms, fn) {
      const timer = { at: clock.now() + ms, fn };
      timers.push(timer);
      clock.start();
      return () => { timers = timers.filter(x => x !== timer); };
    },
    start() {
      if (rafId || typeof requestAnimationFrame !== 'function') return;
      const loop = (/** @type {number} */ w) => { rafId = requestAnimationFrame(loop); clock.tick(w); };
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = 0;
      lastWall = null;
    },
  };
  /**
   * Run queued idle work while this tick's JavaScript is under budget (a task past its timeout
   * runs regardless). One generator step or one plain task per slice.
   * @param {number} w0 real ms at the tick's start @param {number} wallNow @param {boolean} [all]
   */
  function runIdle(w0, wallNow, all = false) {
    while (idleQ.length) {
      const job = idleQ[0];
      const late = wallNow >= job.due;
      if (!all && !late && realNow() - w0 >= IDLE_BUDGET_MS) { idleStat.overBudget++; return; }
      idleStat.slices++;
      let done = true;
      try {
        if (job.it) done = !!job.it.next().done;
        else {
          const r = job.fn();
          if (r && typeof (/** @type {any} */ (r)).next === 'function') { job.it = /** @type {Iterator<unknown>} */ (r); done = !!job.it.next().done; }
        }
      } catch (e) { console.error(e); done = true; }
      if (done) { idleQ.shift(); idleStat.ran++; }
    }
  }

  return clock;
}

/** @param {number} x */
function validScale(x) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new RangeError('time scale must be a finite number ≥ 0');
  return x;
}

/** @param {() => void} fn */
function safely(fn) {
  try { fn(); } catch (e) { console.error(e); }
}

/** The app-wide clock. */
export const clock = createClock();
