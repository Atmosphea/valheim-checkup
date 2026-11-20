// WP-05 pure logic: texture hashing and sizing, the GPU memory estimate and the pixel-ratio fit,
// and the texture table in the config against spec/wp-05-materials.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, textureBytes } from '../src/scene/textures/gpu.js';
import { estimateGpuMemory, fitPixelRatio } from '../src/scene/gpu-memory.js';
import { MATERIAL_TABLE } from '../src/scene/materials/index.js';
import render, { textures as T } from '../src/config/render.js';

test('fnv1a: known vectors, and any changed byte changes the hash', () => {
  assert.equal(fnv1a(new Uint8Array([])), '811c9dc5');
  assert.equal(fnv1a(new TextEncoder().encode('a')), 'e40c292c');
  assert.equal(fnv1a(new TextEncoder().encode('foobar')), 'bf9cf968');
  const a = new Uint8Array(4096).map((_, i) => (i * 37) & 255);
  const b = a.slice(); b[2049] ^= 1;
  assert.notEqual(fnv1a(a), fnv1a(b));
  assert.equal(fnv1a(a), fnv1a(a.slice()));
});

test('textureBytes: mip chain adds about a third', () => {
  assert.equal(textureBytes(256, 256, 4, false), 256 * 256 * 4);
  const m = textureBytes(256, 256, 4, true);
  assert.ok(m > 256 * 256 * 4 * 1.33 && m < 256 * 256 * 4 * 1.34, String(m));
  // non-square chains keep going until both sides are 1
  assert.ok(textureBytes(2048, 128, 4, true) > 2048 * 128 * 4);
});

test('texture table matches spec/wp-05-materials.md', () => {
  assert.deepEqual(T.paper.size, [2048, 1152]);
  assert.deepEqual(T.walnut.size, [1024, 2048]);
  assert.deepEqual(T.brushedSteel.size, [2048, 128]);
  assert.equal(T.knurl.size, 256);
  assert.equal(T.hammered.size, 512);
  assert.equal(T.leather.size, 512);
  assert.equal(T.inkGrain.size, 512);
  assert.equal(T.grainTile, 256);
  assert.deepEqual([T.paper.creaseX, T.paper.creaseY], [10, -3]);
  assert.equal(T.budgetMs, 600);
  assert.ok(render.textures === T);
  // walnut tiles across u only if a whole number of rings fits the 24 cm patch
  const rings = T.walnut.cm[0] * T.walnut.ringsPerCm;
  assert.ok(Math.abs(rings - Math.round(rings)) < 1e-9, `24 cm × ringsPerCm = ${rings}`);
});

test('material table: every file 05 material, once', () => {
  const ids = MATERIAL_TABLE.map(m => m.id);
  assert.deepEqual(ids, ['brushedSteel', 'engraving', 'knurling', 'gauntletSteel', 'gauntletReflections', 'leather', 'rivets', 'gold', 'brass', 'oiledWood', 'paper', 'desk']);
  assert.equal(new Set(ids).size, ids.length);
});

const HIGH = { msaaSamples: 4, bloom: 'full', shadowMap: 2048, antialias: 'MSAA', cubePx: 128, veilResolution: 1 };
const base = { texturesBytes: 81 * 1024 * 1024, tier: HIGH, width: 1440, height: 900, scenePixelRatio: 1, veilPaper: /** @type {[number, number]} */ ([2048, 1152]), envCubePx: 128, studioPmremPx: 256 };

test('estimateGpuMemory: adds up parts and grows with pixel ratio', () => {
  const a = estimateGpuMemory(base);
  const sum = Object.values(a.parts).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - a.mb) < 0.1, `${sum} vs ${a.mb}`);
  const b = estimateGpuMemory({ ...base, scenePixelRatio: 2 });
  assert.ok(b.mb > a.mb * 1.5);
  // off-tier features cost nothing
  const low = estimateGpuMemory({ ...base, tier: { ...HIGH, msaaSamples: 0, bloom: 'off', antialias: 'FXAA', cubePx: 0 } });
  assert.equal(low.parts.bloom, 0);
  assert.equal(low.parts.gauntletCube, 0);
  assert.ok(low.parts.postFxaa > 0);
});

test('fitPixelRatio: largest step under budget, never below the floor', () => {
  const want = 2;
  const pr = fitPixelRatio(base, want, 1, 300);
  assert.ok(pr >= 1 && pr <= want);
  assert.ok(pr === 1 || estimateGpuMemory({ ...base, scenePixelRatio: pr }).mb <= 300);
  if (pr < want) assert.ok(estimateGpuMemory({ ...base, scenePixelRatio: pr + 0.125 }).mb > 300);
  assert.equal(fitPixelRatio(base, 2, 1, 10), 1, 'an impossible budget stops at the floor');
  assert.equal(fitPixelRatio(base, 1.5, 1, 1e6), 1.5, 'a roomy budget keeps the wanted ratio');
});
