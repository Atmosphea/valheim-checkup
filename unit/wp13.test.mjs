import test from 'node:test';
import assert from 'node:assert/strict';
import { paperPixels } from '../src/flat/paper.js';
import { flat as CF } from '../src/config/render.js';

const N = 128;
const lum = (px, x, y) => { const i = ((y % N) * N + (x % N)) * 4; return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; };

test('WP-13 paper: same seed gives the same tile, another seed a different one', () => {
  const a = paperPixels(N, 7), b = paperPixels(N, 7), c = paperPixels(N, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('WP-13 paper: warm parchment near the desk paper tone, opaque', () => {
  const px = paperPixels(N, 7);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; assert.equal(px[i + 3], 255); }
  const n = px.length / 4; r /= n; g /= n; b /= n;
  assert.ok(r > g && g > b, 'warm: red > green > blue');
  assert.ok(Math.abs(r - CF.paperBase[0]) < 18 && Math.abs(b - CF.paperBase[2]) < 22, `mean ${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)}`);
});

test('WP-13 paper: seamless (wrap seam no harsher than ordinary neighbours)', () => {
  const px = paperPixels(N, 7);
  let seam = 0, inner = 0;
  for (let y = 0; y < N; y++) { seam += Math.abs(lum(px, N - 1, y) - lum(px, 0, y)); inner += Math.abs(lum(px, N / 2, y) - lum(px, N / 2 + 1, y)); }
  assert.ok(seam <= inner * 1.6 + N * 1.5, `seam ${seam.toFixed(0)} vs inner ${inner.toFixed(0)}`);
});
