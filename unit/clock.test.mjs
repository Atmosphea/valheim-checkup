import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, MAX_FRAME_MS, clock } from '../src/util/clock.js';

/** A fake wall clock the test moves by hand. */
function fake(start = 1000) {
  let t = start;
  return { source: () => t, advance: ms => { t += ms; }, get t() { return t; } };
}

test('now() follows wall time at scale 1', () => {
  const w = fake(), c = createClock({ source: w.source });
  assert.equal(c.now(), 0);
  w.advance(250);
  assert.equal(c.now(), 250);
});

test('timeScale slows, speeds and pauses without jumps', () => {
  const w = fake(), c = createClock({ source: w.source });
  w.advance(100);                 // 100 at ×1
  c.setScale(0.5); assert.equal(c.now(), 100, 'changing scale does not jump');
  w.advance(100);                 // +50
  assert.equal(c.now(), 150);
  c.setScale(4);
  w.advance(10);                  // +40
  assert.equal(c.now(), 190);
  c.setScale(0);
  w.advance(1000);                // paused
  assert.equal(c.now(), 190);
  assert.equal(c.scale(), 0);
});

test('setScale rejects bad values', () => {
  const c = createClock({ source: fake().source });
  for (const bad of [-1, NaN, Infinity, '2']) assert.throws(() => c.setScale(/** @type {any} */ (bad)));
});

test('tick() returns scaled frame delta, clamped after a stall', () => {
  const w = fake(), c = createClock({ source: w.source });
  assert.equal(c.tick(w.t), 0, 'first frame has no delta');
  w.advance(16); assert.equal(c.tick(w.t), 16);
  c.setScale(2);
  w.advance(16); assert.equal(c.tick(w.t), 32);
  w.advance(5000); assert.equal(c.tick(w.t), MAX_FRAME_MS * 2, 'a hidden-tab gap is cut to MAX_FRAME_MS');
});

test('onFrame subscribers get (dt, t); unsubscribe works', () => {
  const w = fake(), c = createClock({ source: w.source });
  const seen = [];
  const off = c.onFrame((dt, t) => seen.push([dt, t]));
  c.tick(w.t); w.advance(20); c.tick(w.t);
  off();
  w.advance(20); c.tick(w.t);
  assert.deepEqual(seen, [[0, 0], [20, 20]]);
});

test('after() fires once on scaled time, and can be cancelled', () => {
  const w = fake(), c = createClock({ source: w.source });
  let fired = 0, cancelled = 0;
  c.after(100, () => fired++);
  const cancel = c.after(100, () => cancelled++);
  cancel();
  c.setScale(0.5);
  w.advance(150); c.tick(w.t);   // scaled 75
  assert.equal(fired, 0);
  w.advance(60); c.tick(w.t);    // scaled 105
  assert.equal(fired, 1);
  w.advance(500); c.tick(w.t);
  assert.equal(fired, 1, 'only once');
  assert.equal(cancelled, 0);
});

test('a throwing subscriber does not stop the others', () => {
  const w = fake(), c = createClock({ source: w.source });
  let ok = 0;
  const original = console.error; console.error = () => {};
  try {
    c.onFrame(() => { throw new Error('boom'); });
    c.onFrame(() => ok++);
    c.tick(w.t);
  } finally { console.error = original; }
  assert.equal(ok, 1);
});

test('the app-wide clock uses performance.now', () => {
  const a = clock.now();
  assert.ok(Number.isFinite(a) && a >= 0);
});

// ── WP-18P: the scheduler (read phase, nextFrame, budgeted idle work) ────────────────────────
test('WP-18P: reads run before timers and writes in every tick', () => {
  const w = fake(), c = createClock({ source: w.source });
  const order = [];
  c.onFrame(() => order.push('write'));
  c.onRead(() => order.push('read'));
  c.after(0, () => order.push('timer'));
  c.tick(w.t);
  assert.deepEqual(order, ['read', 'timer', 'write']);
});

test('WP-18P: nextFrame runs once, after the frame subscribers', () => {
  const w = fake(), c = createClock({ source: w.source });
  const seen = [];
  c.onFrame(() => seen.push('every'));
  c.nextFrame(() => seen.push('once'));
  c.tick(w.t); w.advance(16); c.tick(w.t);
  assert.deepEqual(seen, ['every', 'once', 'every']);
  const cancel = c.nextFrame(() => seen.push('never'));
  cancel(); w.advance(16); c.tick(w.t);
  assert.ok(!seen.includes('never'));
});

test('WP-18P: idle work waits while a tick is over budget, and generators run one step per slice', () => {
  const w = fake(), c = createClock({ source: w.source });
  let heavy = true;
  // a frame subscriber that burns the whole budget (real time) on the first tick only
  c.onFrame(() => { if (heavy) { const t0 = performance.now(); while (performance.now() - t0 < 7) { /* busy */ } } });
  const steps = [];
  c.idle(function* () { steps.push(1); yield; steps.push(2); yield; steps.push(3); });
  c.tick(w.t);
  assert.deepEqual(steps, [], 'no idle work in a tick that used its budget');
  heavy = false; w.advance(16); c.tick(w.t);
  assert.deepEqual(steps, [1, 2, 3], 'all steps when the tick is cheap');
  assert.equal(c.idleStats().queued, 0);
  assert.ok(c.idleStats().overBudget >= 1);
});

test('WP-18P: an idle task past its deadline runs even in a busy tick', () => {
  const w = fake(), c = createClock({ source: w.source });
  c.onFrame(() => { const t0 = performance.now(); while (performance.now() - t0 < 7) { /* busy */ } });
  let ran = 0;
  c.idle(() => { ran++; }, { timeoutMs: 100 });
  c.tick(w.t); assert.equal(ran, 0);
  w.advance(150); c.tick(w.t); assert.equal(ran, 1);
});
