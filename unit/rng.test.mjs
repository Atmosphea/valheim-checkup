import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, toSeed, rng } from '../src/util/rng.js';

test('same seed gives the same sequence; different seeds differ', () => {
  const a = new Rng(42), b = new Rng(42), c = new Rng(43);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  const seqC = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('known first values for seed 1 (guards against accidental algorithm changes)', () => {
  const r = new Rng(1);
  const first = [r.next(), r.next(), r.next()].map(x => Math.round(x * 1e9));
  // mulberry32(1): 0.6270739405881613, 0.002735721180215478, 0.5274470399599522
  assert.deepEqual(first, [627073941, 2735721, 527447040]);
});

test('seed() restarts the sequence in place', () => {
  const r = new Rng(7);
  const first = [r.next(), r.next()];
  r.next();
  assert.equal(r.seed(7), 7);
  assert.deepEqual([r.next(), r.next()], first);
});

test('next() stays in [0, 1) and is roughly uniform', () => {
  const r = new Rng(123);
  const bins = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    bins[Math.floor(x * 10)]++;
  }
  for (const n of bins) assert.ok(Math.abs(n - 10000) < 500, `bin ${n}`);
});

test('range, int, jitter, chance, sign, pick', () => {
  const r = new Rng(9);
  const ints = new Set();
  for (let i = 0; i < 2000; i++) {
    const f = r.range(-2, 3); assert.ok(f >= -2 && f < 3);
    const n = r.int(4, 8); assert.ok(Number.isInteger(n) && n >= 4 && n <= 8); ints.add(n);
    const j = r.jitter(10, 0.5); assert.ok(j >= 9.5 && j <= 10.5);
    assert.ok([-1, 1].includes(r.sign()));
    assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
  }
  assert.deepEqual([...ints].sort(), [4, 5, 6, 7, 8], 'int() reaches both ends');
  assert.equal(r.chance(0), false);
  assert.equal(r.chance(1), true);
  assert.throws(() => r.pick([]));
});

test('fork() is deterministic and independent of later parent draws', () => {
  const a = new Rng(5).fork(), b = new Rng(5).fork();
  assert.equal(a.next(), b.next());
});

test('toSeed accepts numbers, numeric strings and words', () => {
  assert.equal(toSeed(12), 12);
  assert.equal(toSeed('12'), 12);
  assert.equal(toSeed(-1), 4294967295);
  assert.equal(toSeed('test'), toSeed('test'));
  assert.notEqual(toSeed('test'), toSeed('tests'));
});

test('the app-wide rng exists and can be reseeded', () => {
  rng.seed(99);
  const x = rng.next();
  rng.seed(99);
  assert.equal(rng.next(), x);
});
