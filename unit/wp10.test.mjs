// WP-10 unit tests: the plain-logic parts of the ink (no DOM, no canvas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ghostSelector } from '../src/ink/ghost.js';
import { framePaths, gridModel, METRICS } from '../src/ink/stamps.js';
import { hashBytes } from '../src/ink/masks.js';
import { stamp as MS, wash as MW } from '../src/config/motion.js';

test('ghost selectors: the chain outside the inset points at the stand-in wrappers', () => {
  assert.equal(ghostSelector(':root'), '.vc-gbody');
  assert.equal(ghostSelector('body.mode-desk #print .vc-sheet .metric'), '.vc-gbody.mode-desk .vc-gbody .vc-sheet .metric');
  assert.equal(ghostSelector('html, body'), '.vc-gbody, .vc-gbody');
  assert.equal(ghostSelector('#desk > #print'), '.vc-gbody > .vc-gbody');
  // ids that only start with the same letters, and class names containing "body", stay as they are
  assert.equal(ghostSelector('#printed .tbody #desktop'), '#printed .tbody #desktop');
  assert.equal(ghostSelector('#title'), '#title');
});

test('stamp frame: three paths, finite numbers, any size', () => {
  for (const [w, h] of [[200, 160], [60, 40], [1, 1]]) {
    const p = framePaths(w, h);
    const list = [p.outer, p.inner, p.orn];
    assert.ok(p.k > 0 && Number.isFinite(p.k));
    for (const d of list) assert.ok(/^[MLQCZAHVmlqczahv0-9.\s,-]+$/.test(String(d)) && !/NaN|Infinity/.test(String(d)), String(d));
  }
});

test('dot model (DECISIONS 5): logical fill from data-partial, drawn fill at least 25 %', () => {
  const grid = (/** @type {Record<string,string>} */ d) => ({ hasAttribute: (/** @type {string} */ k) => k === 'data-dots' && 'dots' in d, dataset: d });
  const m = gridModel(/** @type {any} */ (grid({ dots: '5', full: '2', partial: '0.1' })));
  assert.deepEqual(m?.drawn, [1, 1, MS.dotPartialMin, 0, 0]);
  assert.equal(m?.partial, 0.1);
  assert.deepEqual(gridModel(/** @type {any} */ (grid({ dots: '3', full: '1', partial: '0.6' })))?.drawn, [1, 0.6, 0]);
  assert.deepEqual(gridModel(/** @type {any} */ (grid({ dots: '3', full: '3', partial: '0' })))?.drawn, [1, 1, 1]);
  assert.equal(gridModel(/** @type {any} */ (grid({}))), null);
  // Paul, WP-17 item 9: Undiscovered and Unverified swapped places; they land left to right as shown
  assert.deepEqual([...METRICS], ['done', 'missing', 'discovered', 'unknown']);
});

test('dot interval (DECISIONS 4): every view ends by 3,500 ms', () => {
  const interval = (/** @type {number} */ grids, /** @type {number} */ largest) => Math.min(MW.dotIntervalMaxMs, (MW.dotSpanMs - MW.dotGridStaggerMs * (grids - 1)) / largest);
  for (const grids of [1, 2, 3, 4]) for (const largest of [1, 5, 40, 41]) {
    const end = MW.dotsStartMs + MW.dotGridStaggerMs * (grids - 1) + interval(grids, largest) * largest;
    assert.ok(end <= MW.dotsDoneByMs, `${grids} grids × ${largest} dots ends at ${end}`);
  }
});

test('grain hash: different bytes, different hash; same bytes, same hash', () => {
  const a = new Uint8Array([1, 2, 3, 4]), b = new Uint8Array([1, 2, 3, 5]);
  assert.equal(hashBytes(a), hashBytes(new Uint8Array(a)));
  assert.notEqual(hashBytes(a), hashBytes(b));
});
