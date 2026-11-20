import test from 'node:test';
import assert from 'node:assert/strict';
import { ease, MONOTONIC, tween, clamp01, lerp } from '../src/util/ease.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('every curve starts at 0 and ends at 1', () => {
  for (const [name, f] of Object.entries(ease)) {
    assert.ok(close(f(0), 0), `${name}(0) = ${f(0)}`);
    assert.ok(close(f(1), 1), `${name}(1) = ${f(1)}`);
  }
});

test('inputs outside 0–1 are clamped', () => {
  for (const [name, f] of Object.entries(ease)) {
    assert.ok(close(f(-0.5), 0), name);
    assert.ok(close(f(1.5), 1), name);
  }
});

test('monotonic curves never go backwards or leave 0–1', () => {
  for (const name of MONOTONIC) {
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const y = ease[name](i / 1000);
      assert.ok(y >= prev - 1e-12, `${name} decreases at ${i / 1000}`);
      assert.ok(y >= -1e-12 && y <= 1 + 1e-12, `${name} leaves 0–1`);
      prev = y;
    }
  }
});

test('outQuart is the original app formula 1 − (1 − x)^4 (DECISIONS point 23)', () => {
  for (let i = 0; i <= 100; i++) { const x = i / 100; assert.ok(close(ease.outQuart(x), 1 - Math.pow(1 - x, 4))); }
});

test('outCubic is 1 − (1 − x)^3 (stamp count-up)', () => {
  for (let i = 0; i <= 100; i++) { const x = i / 100; assert.ok(close(ease.outCubic(x), 1 - Math.pow(1 - x, 3))); }
});

test('inOut curves pass through the middle', () => {
  for (const name of ['inOutQuad', 'inOutCubic', 'inOutQuart', 'inOutSine', 'inOutExpo', 'inOutBack']) assert.ok(close(ease[name](0.5), 0.5), name);
});

test('back curves anticipate and overshoot', () => {
  assert.ok(ease.inBack(0.2) < 0, 'inBack dips below 0');
  assert.ok(Math.max(...Array.from({ length: 101 }, (_, i) => ease.outBack(i / 100))) > 1, 'outBack overshoots 1');
});

test('tween, lerp, clamp01', () => {
  assert.equal(tween('linear', 10, 20, 0.25), 12.5);
  assert.ok(close(tween(ease.outQuart, 0, 100, 0.5), 93.75));
  assert.throws(() => tween(/** @type {any} */ ('nope'), 0, 1, 0.5));
  assert.equal(lerp(2, 4, 0.5), 3);
  assert.equal(clamp01(2), 1);
});
