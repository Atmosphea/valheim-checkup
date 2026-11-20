import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring, SpringVec, SUBSTEP } from '../src/util/spring.js';
import motion from '../src/config/motion.js';

/** Every {stiffness, damping} pair in src/config/motion.js (= every spring in spec file 04). */
function springsInConfig() {
  const out = [];
  const walk = (node, path) => {
    if (node && typeof node === 'object') {
      if ('stiffness' in node && 'damping' in node) { out.push({ path, ...node }); return; }
      for (const [k, v] of Object.entries(node)) walk(v, path ? path + '.' + k : k);
    }
  };
  walk(motion, '');
  return out;
}

/** Step response 0 → 1 at 60 fps. Returns the time (ms) after which |x − 1| stays under 1%. */
function settleTime(params, { frameMs = 1000 / 60, totalMs = 5000 } = {}) {
  const s = new Spring({ ...params, value: 0, target: 1 });
  let lastOutside = 0;
  for (let t = frameMs; t <= totalMs + 1e-9; t += frameMs) {
    const x = s.step(frameMs);
    assert.ok(Number.isFinite(x), 'stays finite');
    if (Math.abs(x - 1) >= 0.01) lastOutside = t;
  }
  return { settleMs: lastOutside, final: s.value };
}

const SPEC_PAIRS = [
  [120, 14], [600, 20], [500, 30], [900, 40], [700, 22], [400, 26], [500, 18],
  [220, 26], [300, 18], [60, 12], [30, 10],
];

test('config holds every stiffness / damping pair from file 04', () => {
  const found = springsInConfig().map(s => `${s.stiffness}/${s.damping}`);
  for (const [k, d] of SPEC_PAIRS) assert.ok(found.includes(`${k}/${d}`), `${k} / ${d} missing from motion.js`);
  for (const s of springsInConfig()) assert.equal(s.mass, 1, `${s.path} mass 1`);
});

test('every file 04 spring settles within 1% (step response, 60 fps)', () => {
  for (const s of springsInConfig()) {
    const { settleMs, final } = settleTime(s);
    // Underdamped: envelope e^(−(c/2m)t) < 1% at t = 2·ln(100)/c. Critically damped (ζ ≈ 1):
    // (1 + ωt)e^(−ωt) < 1% at ωt ≈ 6.64. Take the larger, plus 30% for the oscillation phase.
    const bound = Math.max(2 * Math.log(100) / s.damping, 6.64 / Math.sqrt(s.stiffness)) * 1000 * 1.3;
    assert.ok(Math.abs(final - 1) < 0.01, `${s.path} final ${final}`);
    assert.ok(settleMs <= bound, `${s.path} (${s.stiffness}/${s.damping}) settles in ${settleMs.toFixed(0)} ms, bound ${bound.toFixed(0)} ms`);
    assert.ok(settleMs < 3000, `${s.path} settles within 3 s`);
  }
});

test('matches the exact underdamped solution closely', () => {
  const k = 700, c = 22; // the bar latch
  const s = new Spring({ stiffness: k, damping: c, value: 0, target: 1 });
  const w0 = Math.sqrt(k), z = c / (2 * w0), wd = w0 * Math.sqrt(1 - z * z);
  const exact = t => 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  for (let i = 1; i <= 240; i++) {
    s.step(SUBSTEP * 1000);
    if (i % 24 === 0) assert.ok(Math.abs(s.value - exact(i * SUBSTEP)) < 0.02, `t=${(i * SUBSTEP).toFixed(2)} s`);
  }
});

test('frame-rate independent: 30, 60 and 144 fps agree', () => {
  const run = fps => { const s = new Spring({ stiffness: 900, damping: 40, target: 1 }); const dt = 1000 / fps; for (let t = 0; t < 600; t += dt) s.step(dt); return s.value; };
  const v30 = run(30), v60 = run(60), v144 = run(144);
  assert.ok(Math.abs(v30 - v60) < 0.01 && Math.abs(v60 - v144) < 0.01, `${v30} ${v60} ${v144}`);
});

test('the 700 / 22 latch overshoots once (file 04: "latch with one overshoot")', () => {
  const s = new Spring({ stiffness: 700, damping: 22, target: 1 });
  let peak = 0;
  for (let i = 0; i < 600; i++) peak = Math.max(peak, s.step(1000 / 240));
  assert.ok(peak > 1.05 && peak < 1.4, `peak ${peak}`);
});

test('huge steps are capped, negative steps ignored, snap/impulse/settled work', () => {
  const s = new Spring({ stiffness: 400, damping: 26, target: 1 });
  s.step(1e9);
  assert.ok(Number.isFinite(s.value));
  const v = s.value; s.step(-50); assert.equal(s.value, v);
  s.snap(3); assert.ok(s.settled()); assert.equal(s.value, 3);
  s.impulse(5); assert.ok(!s.settled());
  assert.throws(() => new Spring({ stiffness: 0, damping: 1 }));
  assert.ok(Math.abs(new Spring({ stiffness: 100, damping: 20 }).dampingRatio - 1) < 1e-12);
});

test('SpringVec moves several numbers together', () => {
  const v = new SpringVec({ stiffness: 220, damping: 26, value: [0, 0], target: [1, -2] });
  for (let i = 0; i < 400; i++) v.step(1000 / 60);
  assert.ok(v.settled(0.01));
  assert.ok(Math.abs(v.value[0] - 1) < 0.01 && Math.abs(v.value[1] + 2) < 0.01);
});
