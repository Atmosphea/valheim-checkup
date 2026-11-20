// WP-14 unit tests: the blob-URL helper that keeps big images out of CSS custom properties.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { toBlobUrl } from '../src/util/image-url.js';

test('toBlobUrl: a base64 data URL becomes a short blob: URL with the same bytes and type', async () => {
  const bytes = Uint8Array.from({ length: 3000 }, (_, i) => (i * 37) & 255);
  const data = 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
  const url = toBlobUrl(data);
  assert.match(url, /^blob:/);
  assert.ok(url.length < 100, `short (${url.length})`);
  const blob = resolveObjectURL(url);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('toBlobUrl: a percent-encoded SVG data URL keeps its text', async () => {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/>";
  const url = toBlobUrl('data:image/svg+xml,' + encodeURIComponent(svg));
  const blob = resolveObjectURL(url);
  assert.equal(blob.type, 'image/svg+xml');
  assert.equal(await blob.text(), svg);
});

test('toBlobUrl: anything that is not a data URL comes back unchanged', () => {
  assert.equal(toBlobUrl('https://example.invalid/x.png'), 'https://example.invalid/x.png');
  assert.equal(toBlobUrl('data:broken'), 'data:broken');
});

test('WP-14 settings: stamp voids fade the ink by half; High draws its glow at half size', async () => {
  const { stamp } = await import('../src/config/motion.js');
  const { quality } = await import('../src/config/render.js');
  assert.ok(stamp.grainVoidDepth > 0 && stamp.grainVoidDepth <= 0.6, `void depth ${stamp.grainVoidDepth} keeps glyphs whole`);
  assert.equal(quality.tiers.high.bloom, 'half');
});
