import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMode, canRunDesk, DESK_AVAILABLE, runMode } from '../src/mode.js';

const desk = { webgl2: true, reducedMotion: false, finePointer: true, width: 1440, height: 900, deskAvailable: true };

test('since WP-04 the desk exists; outside a browser (no fine pointer) the answer is flat', () => {
  assert.equal(DESK_AVAILABLE, true);
  assert.equal(runMode, 'flat', 'node has no matchMedia, so no fine pointer');
  assert.equal(decideMode({ ...desk, deskAvailable: undefined }), 'desk');
  assert.equal(decideMode({ ...desk, deskAvailable: false, query: 'desk' }), 'flat', 'the emergency switch still wins');
});

test('desk when everything allows it (once the desk exists)', () => {
  assert.equal(decideMode(desk), 'desk');
});

test('WP-04 acceptance cases: no WebGL2, reduced motion, coarse pointer, 900 px wide window', () => {
  assert.equal(decideMode({ ...desk, webgl2: false }), 'flat');
  assert.equal(decideMode({ ...desk, reducedMotion: true }), 'flat');
  assert.equal(decideMode({ ...desk, finePointer: false }), 'flat');
  assert.equal(decideMode({ ...desk, width: 900 }), 'flat');
  assert.equal(decideMode({ ...desk, height: 600 }), 'flat');
  assert.equal(decideMode({ ...desk, width: 1024, height: 640 }), 'desk', 'exactly 1024 × 640 is enough');
});

test('help switch "Use the 3D desk anyway" overrides reduced motion only', () => {
  assert.equal(decideMode({ ...desk, reducedMotion: true, forceDesk: true }), 'desk');
  assert.equal(decideMode({ ...desk, reducedMotion: true, forceDesk: true, webgl2: false }), 'flat');
});

test('?mode= overrides (DECISIONS point 14)', () => {
  assert.equal(decideMode({ ...desk, query: 'flat' }), 'flat');
  assert.equal(decideMode({ ...desk, query: 'desk', reducedMotion: true }), 'desk', 'forced desk keeps reduced motion on desk');
  assert.equal(decideMode({ ...desk, query: 'desk', width: 390, height: 844, finePointer: false }), 'desk', 'forced desk at 390 px is allowed');
  assert.equal(decideMode({ ...desk, query: 'desk', webgl2: false }), 'flat', 'but never without WebGL2');
});

test('WebGL2 is only probed when the answer depends on it', () => {
  let probes = 0;
  const probe = () => { probes++; return true; };
  decideMode({ ...desk, webgl2: probe, query: 'flat' });
  decideMode({ ...desk, webgl2: probe, reducedMotion: true });
  decideMode({ ...desk, webgl2: probe, deskAvailable: false });
  assert.equal(probes, 0);
  assert.equal(decideMode({ ...desk, webgl2: probe }), 'desk');
  assert.equal(probes, 1);
});

test('WP-13 step 9: the help switch is offered only where the desk can run', () => {
  assert.equal(canRunDesk({ ...desk, reducedMotion: true }), true, 'reduced motion alone: offer it');
  assert.equal(canRunDesk({ ...desk, query: 'flat' }), true);
  assert.equal(canRunDesk({ ...desk, webgl2: false }), false, 'no WebGL2');
  assert.equal(canRunDesk({ ...desk, finePointer: false }), false, 'touch-only');
  assert.equal(canRunDesk({ ...desk, width: 390, height: 844 }), false, 'phone-sized');
});
