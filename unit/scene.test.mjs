// WP-04 pure scene logic: quality governor, pointer velocity, camera framing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, AUTO_TIERS } from '../src/scene/governor.js';
import { createVelocityTracker } from '../src/scene/velocity.js';
import { solveFraming, inMiddleThird } from '../src/scene/camera-rig.js';
import render from '../src/config/render.js';
import layout from '../src/config/layout.js';
import * as THREE from 'three';

const opts = (log) => ({
  benchmarkFrames: 60, warmupFrames: 10, highMs: 18, mediumMs: 26,
  dropFrameMs: 20, dropAfterMs: 2000, onTier: (t, why) => log.push([t, why]),
});
const feed = (g, ms, n) => { for (let i = 0; i < n; i++) g.sample(ms); };

test('benchmark: 60 frames after warm-up pick the start tier', () => {
  for (const [ms, want] of [[16.7, 'high'], [22, 'medium'], [40, 'low']]) {
    const log = []; const g = createGovernor(opts(log));
    feed(g, 999, 10); // warm-up frames are ignored, however slow
    feed(g, ms, 59);
    assert.equal(log.length, 0, 'not before the 60th frame');
    g.sample(ms);
    assert.deepEqual(log, [[want, 'benchmark']]);
  }
});

test('slow frames for 2 s drop exactly one tier; fast frames never climb back', () => {
  const log = []; const g = createGovernor(opts(log));
  g.setTier('high');
  feed(g, 30, 66); // 1,980 ms: not yet 2 s
  assert.equal(log.length, 0);
  g.sample(30);    // 2,010 ms of frames averaging 30 ms
  assert.deepEqual(log, [['medium', 'drop']]);
  feed(g, 8, 2000); // long run of fast frames
  assert.deepEqual(log, [['medium', 'drop']], 'never climbs back');
  assert.equal(g.tier, 'medium');
  assert.equal(g.drops, 1);
});

test('average at exactly 20 ms does not drop; the window restarts after each check', () => {
  const log = []; const g = createGovernor(opts(log));
  g.setTier('high');
  feed(g, 20, 500);
  assert.equal(log.length, 0);
  // a short spike inside a fast window does not drop
  feed(g, 16, 100); feed(g, 60, 5); feed(g, 16, 30);
  assert.equal(log.length, 0);
});

test('never drops below low; flat is only reached by hand', () => {
  const log = []; const g = createGovernor(opts(log));
  g.setTier('high');
  feed(g, 50, 41); feed(g, 50, 41); feed(g, 50, 41); feed(g, 50, 41);
  assert.deepEqual(log.map(x => x[0]), ['medium', 'low']);
  assert.deepEqual(AUTO_TIERS, ['high', 'medium', 'low']);
});

test('a manual tier cancels a pending benchmark', () => {
  const log = []; const g = createGovernor(opts(log));
  feed(g, 16, 20);
  g.setTier('low');
  feed(g, 16, 200);
  assert.equal(log.length, 0);
  assert.equal(g.tier, 'low');
});

test('velocity: 30 ms moving average in cm/s', () => {
  const v = createVelocityTracker(30);
  // 10 cm/s along x, samples every 8 ms
  for (let t = 0; t <= 80; t += 8) v.add(t, t * 0.01, 0);
  const r = v.read(80);
  assert.ok(Math.abs(r.vx - 10) < 1e-9, `vx ${r.vx}`);
  assert.equal(r.vy, 0);
  // only the last 30 ms count: a sudden change shows up within the window
  for (let t = 88; t <= 160; t += 8) v.add(t, 0.8, (t - 80) * 0.05); // now 50 cm/s along y
  const s = v.read(160);
  assert.ok(Math.abs(s.vy - 50) < 1e-9 && Math.abs(s.vx) < 1e-9, JSON.stringify(s));
  // stopped pointer reads 0
  assert.equal(v.read(400).speed, 0);
  v.reset();
  assert.equal(v.read(400).speed, 0);
});

test('framing: sheet centred and filling the screen, at 16:9, 16:10 and 4:3', () => {
  for (const aspect of [16 / 9, 1.6, 4 / 3, 2.4]) {
    const f = solveFraming(aspect);
    const cam = new THREE.PerspectiveCamera(render.camera.fovDeg, aspect, 5, 2000);
    const p = render.camera.pitchDeg * Math.PI / 180;
    cam.up.set(0, 0, 1);
    cam.position.set(0, f.aimY - f.distance * Math.cos(p), f.distance * Math.sin(p));
    cam.lookAt(0, f.aimY, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const S = layout.sheet; let mx = -1, Mx = -9, my = 9, My = -9;
    for (const [x, y] of [[S.x0, S.y0], [S.x1, S.y0], [S.x0, S.y1], [S.x1, S.y1]]) {
      const v = new THREE.Vector3(x, y, 0).project(cam);
      mx = Math.max(mx, -v.x); Mx = Math.max(Mx, v.x); my = Math.min(my, v.y); My = Math.max(My, v.y);
    }
    const widest = Math.max(mx, Mx, -my, My);
    assert.ok(Math.abs(widest - render.stage.sheetFill) < 1e-3, `aspect ${aspect}: widest ${widest}`);
    assert.ok(Math.abs(My + my) < 1e-3, `aspect ${aspect}: centred ${My} ${my}`);
  }
});

test('zoom zone is the middle third of the window', () => {
  assert.equal(inMiddleThird(0, 0), true);
  assert.equal(inMiddleThird(0.32, -0.32), true);
  assert.equal(inMiddleThird(0.34, 0), false);
  assert.equal(inMiddleThird(0, -0.5), false);
});

test('layout: placeholders sit where WP-04 and DECISIONS say', () => {
  // Paul, WP-17 item 3: the sheet's left live edge came in from x −48 to −36 (84 × 54 cm); the
  // camera's whole-desk view keeps the old 16:9 area
  // Paul, WP-18 item 7: the left edge came in again (−36 → −25, 73 × 54 cm) so the paper margins left
  // and right of the table are equal (3.79 cm each) and the collection title is centred on the sheet
  assert.deepEqual(layout.sheet, { x0: -25, x1: 48, y0: -27, y1: 27 });
  assert.deepEqual(layout.view, { x0: -48, x1: 48, y0: -27, y1: 27 });
  assert.equal((layout.view.x1 - layout.view.x0) / (layout.view.y1 - layout.view.y0), 16 / 9);
  // Paul, WP-16 items 20 + 23: the row is 1 cm higher with the title, each coin a little higher or lower (was y 20 for all four)
  // Paul, WP-18 item 8: the four sit closer together, not in a line, clear of the centred masthead
  // (WP-16/17 had them in a row at x 24 / 31.5 / 38.5 / 44)
  assert.deepEqual(layout.coins.map(c => [c.id, c.x, c.y, c.r]), [
    ['howto', 31.7, 17.7, 2.2], ['load', 35.6, 22.0, 3.4], ['import', 44.6, 23.6, 2.0], ['export', 41.6, 20.6, 2.0], ['sound', 46.2, -26.0, 1.6],
  ]);
  // Paul, WP-16 items 7–8: narrower, taller, running off the bottom and the left edge (was x −44…−16, y −20…16)
  assert.deepEqual(layout.woodblock, { x0: -52, x1: -25, y0: -46, y1: 19, thickness: 3 });
  // WP-07 raised the inset sheet's foot by 0.8 cm (−25 → −24.2) for the footer lines (DECISIONS, WP-07)
  // Paul, WP-16 item 20: the header is 1 cm shorter, so the inset's top edge is 1 cm higher (was 14)
  // Paul, WP-17 items 3–4: the main section grew left (x0 −12 → −23) and up to the burned top edge (y1 15 → 26)
  assert.deepEqual([layout.inset.x0, layout.inset.x1, layout.inset.y0, layout.inset.y1], [-23, 46, -24.2, 26]);
  // Paul, WP-16 item 22: the help note is top right, under the coins (16B had it at x −23.6…−13.4, y −24.1…−20.7)
  assert.deepEqual(layout.helpNote, { x0: 35.4, x1: 45.4, y0: 15.35, y1: 18.3 });
  assert.deepEqual(layout.footer, { x0: -24, x1: 46, y: -26.3 });
  // Paul, WP-17 item 3: on the narrower sheet, clear of the wider main section (was x −46…−22)
  // Paul, WP-18 item 7: moved with the sheet's left edge (was x −34.6…−24.6)
  assert.deepEqual(layout.tags, { x0: -23.4, x1: -13.4, y0: 22, y1: 27 });
  // Paul, WP-16 item 20: the title block 1 cm higher (was y 21)
  assert.deepEqual([layout.title.x, layout.title.y], [0, 22]);
});

test('layer stack config matches file 05', () => {
  assert.deepEqual(render.layers.map(l => [l.id, l.blend, l.pointer]), [
    ['scene', 'normal', false], ['print', 'normal', true], ['veil', 'multiply', false], ['glow', 'screen', false],
    ['float', 'normal', true], ['fx', 'normal+lighter', false], ['grain', 'overlay', false],
  ]);
});
