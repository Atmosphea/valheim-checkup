// WP-18P: the adaptive governor (trims inside a tier, climbing back with headroom, hold).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from '../src/scene/governor.js';
import render from '../src/config/render.js';

const Q = render.quality;
const make = (log, extra = {}) => createGovernor({
  benchmarkFrames: 60, warmupFrames: 10, highMs: 18, mediumMs: 26, dropFrameMs: Q.dropFrameMs, dropAfterMs: Q.dropAfterMs, dropLateShare: Q.dropLateShare,
  budgetMs: Q.budgetMs, trimSteps: Q.trims.length, trimWindowMs: Q.trimWindowMs, strainShare: Q.strainShare,
  cpuStrain: Q.cpuStrain, gpuStrain: Q.gpuStrain, lateShare: Q.lateShare, climbWindowMs: Q.climbWindowMs,
  climbCpu: Q.climbCpu, climbGpu: Q.climbGpu, climbBackoffMs: Q.climbBackoffMs,
  onTier: (t, why) => log.push(['tier', t, why]), onTrim: (n, why) => log.push(['trim', n, why]), ...extra,
});
const feed = (g, n, ms, load) => { for (let i = 0; i < n; i++) g.sample(ms, load); };

test('JS strain at 60 fps trims before any frame is late, one step per window', () => {
  const log = []; const g = make(log); g.setTier('high');
  feed(g, 46, 16.7, { cpu: 11, gpu: 9, active: true }); // ~768 ms, every frame's JS near the budget
  assert.ok(!log.some(l => l[0] === 'tier'), 'no tier change');
  assert.equal(g.trim, 1); assert.equal(g.tier, 'high');
  feed(g, 46, 16.7, { cpu: 11, gpu: 9, active: true });
  assert.equal(g.trim, 2);
  feed(g, 200, 16.7, { cpu: 11, gpu: 9, active: true });
  assert.equal(g.trim, Q.trims.length, 'never past the last trim'); assert.equal(g.tier, 'high', 'a 60 fps frame rate never drops a tier');
});

test('this Mac at High (GPU timer 11-22 ms, JS ~4 ms, a few late frames on a view change) changes nothing', () => {
  const log = []; const g = make(log); g.setTier('high');
  feed(g, 600, 16.7, { cpu: 4, gpu: 22, active: true });
  for (let k = 0; k < 40; k++) { feed(g, 50, 16.7, { cpu: 4, gpu: 9, active: true }); feed(g, 3, 33.4, { cpu: 30, gpu: 9, active: true }); }
  assert.deepEqual(log, []);
});

test('headroom climbs a trim back, then a tier (only on GPU evidence)', () => {
  const log = []; const g = make(log); g.setTier('medium', { manual: false });
  feed(g, 46, 16.7, { cpu: 11, gpu: 9, active: true });
  assert.equal(g.trim, 1);
  feed(g, 60 * 6, 16.7, { cpu: 2, gpu: 4, active: true }); // 6 s of headroom: the trim comes back
  assert.equal(g.trim, 0);
  feed(g, 60 * 6, 16.7, { cpu: 2, gpu: 4, active: true }); // … then the tier
  assert.equal(g.tier, 'high');
  assert.deepEqual(log.filter(l => l[0] === 'tier'), [['tier', 'high', 'climb']]);
  // without GPU times (Safari, Firefox, forced frames) a tier never climbs
  const l2 = []; const h = make(l2); h.setTier('medium', { manual: false });
  feed(h, 60 * 30, 8, { cpu: 1, gpu: null, active: true });
  assert.equal(h.tier, 'medium');
});

test('a hand-picked tier is the ceiling; idle frames count for nothing; hold freezes all', () => {
  const log = []; const g = make(log); g.setTier('medium');
  feed(g, 60 * 20, 16.7, { cpu: 1, gpu: 3, active: true });
  assert.equal(g.tier, 'medium', 'no climb above a hand-picked tier');
  feed(g, 60 * 5, 16.7, { cpu: 12, gpu: 16, active: false });
  assert.equal(g.trim, 0, 'idle frames never trim');
  g.hold(true); feed(g, 60 * 5, 40, { cpu: 30, gpu: 30, active: true });
  assert.equal(g.trim, 0); assert.equal(g.tier, 'medium'); assert.equal(g.drops, 0);
  g.hold(false); feed(g, 70, 40, { cpu: 30, gpu: 30, active: true });
  assert.equal(g.drops, 1); assert.equal(g.tier, 'low');
});

test('a climb that has to be undone waits longer next time (15 s, then 30 s)', () => {
  const log = []; const g = make(log); g.setTier('high');
  const strain = () => feed(g, 46, 16.7, { cpu: 11, gpu: 9, active: true });
  const room = s => feed(g, Math.round(60 * s), 16.7, { cpu: 2, gpu: 4, active: true });
  strain(); assert.equal(g.trim, 1);
  room(6); assert.equal(g.trim, 0, 'the first climb needs one headroom window');
  strain(); assert.equal(g.trim, 1, 'undone right after');
  room(10); assert.equal(g.trim, 1, 'now it waits 15 s');
  room(8); assert.equal(g.trim, 0);
  strain(); room(20); assert.equal(g.trim, 1, 'then 30 s');
  room(15); assert.equal(g.trim, 0);
});

test('a view change burst never drops a tier; sustained late frames do', () => {
  const log = []; const g = make(log); g.setTier('high');
  // Master Hunter release as measured: 16 late frames of 134, some 50-150 ms
  for (let k = 0; k < 10; k++) { feed(g, 118, 16.7, { cpu: 4, active: true }); feed(g, 10, 50, { cpu: 30, active: true }); feed(g, 6, 150, { cpu: 60, active: true }); }
  assert.equal(g.tier, 'high'); assert.equal(g.drops, 0);
  feed(g, 70, 33.4, { cpu: 8, active: true });
  assert.equal(g.tier, 'medium');
});
