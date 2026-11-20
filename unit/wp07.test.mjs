// WP-07: paper layer geometry, bristle maths and config (pure logic; the DOM parts are checked in
// tools/wp07-check.cjs and the parity suite on TARGET=desk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECTS } from '../src/paper/layout.js';
import { bristleAt } from '../src/paper/bristle.js';
import layout from '../src/config/layout.js';
import { paper as MP, printed as MPr, spark as MS } from '../src/config/motion.js';
import render from '../src/config/render.js';

const inside = (r, o) => r.x0 >= o.x0 && r.x1 <= o.x1 && r.y0 >= o.y0 && r.y1 <= o.y1;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('every printed part lies on the main sheet', () => {
  for (const [k, r] of Object.entries(RECTS)) {
    assert.ok(r.x0 < r.x1 && r.y0 < r.y1, `${k} is a proper rectangle`);
    assert.ok(inside(r, layout.sheet), `${k} inside the sheet`);
  }
});

test('title-area parts sit inside the title area; foot parts inside the foot strip', () => {
  // Paul, WP-17 item 4: the title, byline and records moved into the main section (they scroll
  // with the table); the header keeps the favourite tags
  for (const k of ['favorites']) assert.ok(inside(RECTS[k], RECTS.header), k);
  for (const k of ['brand', 'profile', 'statline']) assert.ok(inside(RECTS[k], layout.inset), `${k} in the main section`);
  // Paul, WP-16 item 22: the help letter moved to the top right, under the coins, on its own strip
  for (const k of ['resources', 'footer']) assert.ok(inside(RECTS[k], RECTS.foot), k);
  assert.ok(inside(RECTS.help, RECTS.helpStrip), 'help');
});

test('printed text stays clear of the woodblock, the coins and the inset sheet', () => {
  const wb = layout.woodblock;
  for (const k of ['brand', 'profile', 'statline', 'favorites', 'help', 'resources', 'footer']) assert.ok(!overlaps(RECTS[k], wb), `${k} clear of the woodblock`);
  // Paul, WP-17 item 4: brand/profile/statline are now part of the main section, and the help strip
  // lies on its own fixed level above it (with the coins), so only the foot lines stay clear of it
  for (const k of ['resources', 'footer']) assert.ok(!overlaps(RECTS[k], layout.inset), `${k} clear of the inset sheet`);
  for (const c of layout.coins) {
    const box = { x0: c.x - c.r, x1: c.x + c.r, y0: c.y - c.r, y1: c.y + c.r };
    for (const k of ['brand', 'profile', 'statline', 'favorites', 'resources', 'footer', 'help']) assert.ok(!overlaps(RECTS[k], box), `${k} clear of the ${c.id} coin`);
  }
});

test('the title is centred on the WP-04 anchor and the tags hang at the top edge', () => {
  assert.equal((RECTS.brand.x0 + RECTS.brand.x1) / 2, layout.title.x);
  assert.ok(RECTS.brand.y0 < layout.title.y && RECTS.brand.y1 > layout.title.y);
  assert.ok(RECTS.favorites.y1 > layout.sheet.y1 - 1.5, 'tags reach the top edge');
});

test('inset sheet: WP-07 moved its foot by at most 3 cm and the four 11 cm stamps fit in a row', () => {
  assert.ok(Math.abs(layout.inset.y0 - -25) <= 3);
  const inner = (layout.inset.x1 - layout.inset.x0) - 2 * 1.8;
  assert.ok(4 * 11 <= inner, `${inner} cm for the stamps`);
});

test('bristle: amplitude, slope and the file-drag doubling', () => {
  let maxZ = 0;
  for (let i = 0; i < 400; i++) {
    const x = -48 + (i % 20) * 4.8, y = -27 + Math.floor(i / 20) * 2.7, t = i * 0.37;
    const b = bristleAt(x, y, t);
    maxZ = Math.max(maxZ, Math.abs(b.z));
    // slope equals the numerical derivative
    const e = 1e-4;
    assert.ok(Math.abs((bristleAt(x + e, y, t).z - bristleAt(x - e, y, t).z) / (2 * e) - b.dx) < 1e-6);
    assert.ok(Math.abs((bristleAt(x, y + e, t).z - bristleAt(x, y - e, t).z) / (2 * e) - b.dy) < 1e-6);
  }
  assert.ok(maxZ <= MP.bristleAmp + 1e-9 && maxZ > MP.bristleAmp * 0.6, `max ${maxZ}`);
  assert.ok(Math.abs(bristleAt(3, 4, 2, MP.bristleAmp * MP.fileDragBristleMul).z - 2 * bristleAt(3, 4, 2).z) < 1e-12);
  // period in time = 1 / bristleSpeed seconds for the first wave
  assert.equal(MP.bristleSpeed, 0.15);
});

test('file 04 / file 05 values the paper layer uses', () => {
  assert.equal(MPr.hoverDarken, 0.08);
  assert.equal(MPr.pressDarken, 0.15);
  assert.equal(MPr.disabledOpacity, 0.45);
  assert.deepEqual([MPr.pressReleaseSpring.stiffness, MPr.pressReleaseSpring.damping], [500, 30]);
  assert.deepEqual([MS.lightKelvin, MS.lightRange, MS.lightFlickerMin, MS.lightFlickerMax, MS.lightFlickerHz], [2700, 18, 0.85, 1.1, 12]);
  assert.equal(render.print.pxPerCm, 29);
  assert.deepEqual(render.ink.stamps, { completed: '#4f6b34', missing: '#8e2a1e', unverified: '#3c5a7a', undiscovered: '#6b655c' });
});

test('software renderer names', () => {
  const re = render.stage.softwareRenderer;
  assert.ok(re.test('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)))'));
  assert.ok(re.test('llvmpipe (LLVM 15.0.7, 256 bits)'));
  assert.ok(!re.test('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'));
  assert.ok(!re.test('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'));
});
