// WP-12 unit tests: recipes and building blocks in plain Node (no Web Audio needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipes, ranges, renderTake } from '../src/audio/recipes/index.js';
import { convolve, peakOf, rmsOf, gainToDb, makeLoopable } from '../src/audio/blocks.js';
import { Rng } from '../src/util/rng.js';
import { isCanonical } from '../src/events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mix = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/audio-mix.json'), 'utf8'));
const ctx = { sampleRate: 48000, createBuffer: (c, n, sr) => { const d = new Float32Array(n); return { length: n, sampleRate: sr, duration: n / sr, getChannelData: () => d }; } };

// Paul, WP-17 item 21: the tavern ambience (amb.hall) is built again; Paul, WP-18 item 15: fold.close
// is built as the burn crackle: 23 built, 46 deferred
test('scope cuts: 23 built sounds have recipes, the other 46 are deferred and have none', () => {
  const built = Object.keys(mix.sounds).filter(n => !mix.sounds[n].deferred);
  assert.equal(built.length, 23);
  assert.deepEqual(Object.keys(recipes).sort(), built.sort());
  assert.equal(Object.values(mix.sounds).filter(s => s.deferred).length, 46);
  for (const n of built) assert.ok(ranges[n], `range for ${n}`);
});

test('every built recipe renders: finite, within its length range, RMS above −50 dBFS, normalised peak', () => {
  for (const n of Object.keys(recipes)) {
    const b = renderTake(n, mix, ctx, new Rng(11)), d = b.getChannelData(0);
    const ms = b.duration * 1000; // WP-17 item 21: amb.hall renders at 16 kHz (it is low-passed at 1.8 kHz)
    assert.ok(d.every(Number.isFinite), n);
    assert.ok(ms >= ranges[n][0] && ms <= ranges[n][1], `${n} ${ms} ms`);
    assert.ok(gainToDb(rmsOf(d)) > -50, n);
    assert.ok(peakOf(d) <= 1 + 1e-6 && peakOf(d) > 0.5, n);
  }
});

test('recipes are deterministic per seed and vary between seeds', () => {
  for (const n of ['bar.latch', 'stamp.big', 'coin.land']) {
    const a = renderTake(n, mix, ctx, new Rng(1)).getChannelData(0), b = renderTake(n, mix, ctx, new Rng(1)).getChannelData(0), c = renderTake(n, mix, ctx, new Rng(2)).getChannelData(0);
    assert.deepEqual(a, b, n);
    assert.notDeepEqual(a, c, n);
  }
});

test('FFT convolution matches direct convolution; loops join without a jump', () => {
  const r = new Rng(4), a = Float32Array.from({ length: 37 }, () => r.range(-1, 1)), b = Float32Array.from({ length: 19 }, () => r.range(-1, 1));
  const y = convolve(a, b);
  for (let i = 0; i < y.length; i++) {
    let s = 0; for (let j = 0; j < b.length; j++) if (i - j >= 0 && i - j < a.length) s += a[i - j] * b[j];
    assert.ok(Math.abs(s - y[i]) < 1e-4, `sample ${i}`);
  }
  const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * 0.05));
  const loop = makeLoopable(sine, 48000, 20);
  assert.ok(Math.abs(loop[0] - loop.at(-1)) < 0.06);
});

test('every wired event in audio-mix.json is canonical', () => {
  for (const [n, s] of Object.entries(mix.sounds)) {
    if (s.event) assert.ok(isCanonical(s.event), `${n}: ${s.event}`);
    if (s.stopEvent) assert.ok(isCanonical(s.stopEvent), `${n}: ${s.stopEvent}`);
  }
});
