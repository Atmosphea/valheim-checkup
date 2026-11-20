// WP-11 unit tests: the plain maths of the surfaces (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { foldPlan, foldAngle, flapAngleAt, closeStartMs, liftOf, Pendulum, swashCycle } from '../src/surfaces/plan.js';
import { surfaces as MS, hanging as MH } from '../src/config/motion.js';

test('fold plan: starts at W/8 × H/4 and doubles width, height, width, height, width', () => {
  const W = 640, H = 480;
  const { start, flaps } = foldPlan(W, H);
  assert.equal(start.w, W / 8);
  assert.equal(start.h, H / 4);
  assert.equal(flaps.length, 5);
  assert.deepEqual(flaps.map(f => f.axis), ['x', 'y', 'x', 'y', 'x']);
  // each flap is the same size as what was already open, and together they end at the full sheet
  let w = start.w, h = start.h;
  for (const f of flaps) {
    assert.deepEqual([f.rect.w, f.rect.h], [f.before.w, f.before.h]);
    if (f.axis === 'x') w *= 2; else h *= 2;
  }
  assert.deepEqual([w, h], [W, H]);
  // the flaps cover the whole sheet with no overlap: their areas plus the start add up
  const area = flaps.reduce((s, f) => s + f.rect.w * f.rect.h, start.w * start.h);
  assert.equal(area, W * H);
  // the hinge is on the edge the flap shares with what was open before
  for (const f of flaps) {
    if (f.hinge === 'left') assert.equal(f.rect.x, f.before.x + f.before.w);
    if (f.hinge === 'right') assert.equal(f.rect.x + f.rect.w, f.before.x);
    if (f.hinge === 'top') assert.equal(f.rect.y, f.before.y + f.before.h);
    if (f.hinge === 'bottom') assert.equal(f.rect.y + f.rect.h, f.before.y);
  }
  // directions alternate as in the config
  assert.deepEqual(flaps.map(f => f.hinge), MS.foldDirs.map((d, i) => (MS.foldAxes[i] === 'x' ? (d > 0 ? 'left' : 'right') : (d > 0 ? 'top' : 'bottom'))));
});

test('fold angle: 180° → 3° overshoot → 0° in 260 ms; folds start at 0, 250, 500, 750, 1000 ms', () => {
  assert.equal(foldAngle(0), 180);
  assert.equal(foldAngle(1), 0);
  const samples = Array.from({ length: 1001 }, (_, i) => foldAngle(i / 1000));
  assert.ok(Math.abs(Math.min(...samples) + MS.foldOvershootDeg) < 0.05, 'reaches −3°');
  assert.ok(samples.every(a => a <= 180 && a >= -MS.foldOvershootDeg - 1e-9));
  assert.equal(MS.foldMs, 260);
  assert.deepEqual(MS.foldStartsMs, [0, 250, 500, 750, 1000]);
  for (const [i, s] of MS.foldStartsMs.entries()) {
    assert.equal(flapAngleAt(i, s - 1), 180, `fold ${i} closed before its start`);
    assert.equal(flapAngleAt(i, s + MS.foldMs), 0, `fold ${i} flat ${MS.foldMs} ms later`);
  }
  // the last fold lands by 1,260 ms, inside the 1.5 s unfold
  assert.ok(MS.foldStartsMs[4] + MS.foldMs <= MS.unfoldRiseMs);
});

test('close: folds reverse in 900 ms, last fold first', () => {
  const n = MS.foldStartsMs.length;
  assert.equal(closeStartMs(n - 1), 0);
  assert.equal(closeStartMs(0) + MS.foldMs, MS.closeMs);
  for (let i = 0; i < n; i++) {
    assert.equal(flapAngleAt(i, closeStartMs(i) - 1, 'close'), 0);
    assert.equal(flapAngleAt(i, closeStartMs(i) + MS.foldMs, 'close'), 180);
  }
});

test('lift: offset follows the scroll up to the slip height; height, curl and shadow grow with it', () => {
  const H = 500;
  assert.deepEqual(liftOf(0, H), { offset: 0, f: 0, lifted: false, z: 0, curlDeg: 0, shadowPx: 0 });
  const a = liftOf(100, H), b = liftOf(H, H), c = liftOf(5000, H);
  assert.equal(a.offset, 100);               // no drift: the slip travels exactly the scroll
  assert.ok(Math.abs(a.z - (0.6 + 0.6 * 0.2)) < 1e-9);
  assert.equal(b.z, 1.2);
  assert.equal(b.curlDeg, 8);
  assert.equal(b.shadowPx, 14);
  assert.deepEqual(c, b);                    // past the slip height nothing changes
  assert.equal(liftOf(-20, H).offset, 0);    // overscroll bounce
});

test('pendulum: rests at 0, swings at 1.1 Hz after a kick and decays at 0.9 /s', () => {
  const p = new Pendulum(0);
  for (let i = 0; i < 100; i++) p.step(16);
  assert.ok(Math.abs(p.theta) < 1e-9, 'no swing without a push');
  assert.ok(Math.abs(p.angle()) <= MH.tagSwayDeg + 1e-9, 'idle sway within 0.5°');
  p.kick(100);
  const th = [];
  for (let i = 0; i < 4000; i++) { p.step(1); th.push(p.theta); }
  // zero crossings → frequency
  const cross = [];
  for (let i = 1; i < th.length; i++) if (th[i - 1] < 0 && th[i] >= 0) cross.push(i);
  const period = (cross[cross.length - 1] - cross[0]) / (cross.length - 1) / 1000;
  const wd = Math.sqrt((2 * Math.PI * MS.tagSwingHz) ** 2 - MH.pendulumDamping ** 2) / (2 * Math.PI);
  assert.ok(Math.abs(1 / period - wd) < 0.02, `swing ${(1 / period).toFixed(3)} Hz`);
  // amplitude: peaks one period apart shrink by e^(−0.9 × period)
  const peaks = [];
  for (let i = 1; i < th.length - 1; i++) if (th[i] > th[i - 1] && th[i] >= th[i + 1] && th[i] > 0) peaks.push(th[i]);
  const ratio = peaks[1] / peaks[0];
  assert.ok(Math.abs(ratio - Math.exp(-MH.pendulumDamping * period)) < 0.02, `decay ${ratio.toFixed(3)}`);
  // a steady push holds it at the push angle
  const q = new Pendulum(0);
  for (let i = 0; i < 2000; i++) q.step(10, 2.5);
  assert.ok(Math.abs(q.theta - 2.5) < 1e-3);
  // a huge frame is clamped, never explodes
  q.step(1e9);
  assert.ok(Number.isFinite(q.theta));
});

test('swash cycle: draw → hold → erase → rest, with the given hold and rest', () => {
  const d = { hold: 4000, rest: 2000 };
  const at = t => swashCycle(t, d);
  assert.equal(at(0).phase, 'draw');
  assert.equal(at(0).drawn, 0);
  assert.equal(at(MS.swashDrawMs - 1).phase, 'draw');
  assert.equal(at(MS.swashDrawMs).phase, 'hold');
  assert.equal(at(MS.swashDrawMs + 4000).phase, 'erase');
  assert.equal(at(MS.swashDrawMs + 4000 + MS.swashEraseMs).phase, 'rest');
  assert.equal(at(0).end, MS.swashDrawMs + 4000 + MS.swashEraseMs + 2000);
  // drawn grows monotonically while drawing; the erase eats from the start of the stroke
  let last = -1;
  for (let t = 0; t <= MS.swashDrawMs; t += 50) { const v = at(t).drawn; assert.ok(v >= last); last = v; }
  assert.ok(at(MS.swashDrawMs + 4000 + MS.swashEraseMs / 2).from > 0.3);
});
