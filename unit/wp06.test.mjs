// WP-06: slider mechanism, breeze field and impact falloff (pure logic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMechanism } from '../src/board/mechanism.js';
import { createBreeze } from '../src/scene/breeze.js';
import { falloff } from '../src/scene/impact.js';
import { bar as M, world as W } from '../src/config/motion.js';

const CATS = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident", 'Highlights', 'Skills & travel'];

function rig() {
  let now = 0;
  const log = [];
  const selected = [];
  const hints = [];
  const emit = (type, data) => log.push({ t: now, type, data });
  const m = createMechanism({
    categories: CATS, latched: 'The Master Chef', travel: 7, now: () => now, random: () => 0.5,
    emit, select: c => { selected.push(c); emit('app:category', { title: c }); m.sync(c); }, onHint: c => hints.push(c),
  });
  const run = (ms, step = 1000 / 60) => { for (let t = 0; t < ms; t += step) { now += step; m.step(step); } };
  const wait = ms => { now += ms; };
  return { m, log, selected, hints, run, wait, get now() { return now; } };
}

/** Drag bar i from its rest to `f` of the travel over `ms`, then release. Board x: pointer moves
 *  right (Paul, WP-16 item 9: rest is left, a bar slides right to select; it was left). */
function drag(r, i, f, ms = 400) {
  const x0 = 20;
  r.m.press(i, x0);
  const steps = 20;
  for (let k = 1; k <= steps; k++) { r.run(ms / steps); r.m.move(i, x0 + 7 * f * k / steps); }
  return r.m.release(i);
}

test('release at 59% springs back, at 61% latches; only one bar latched', () => {
  const r = rig();
  assert.equal(drag(r, 0, 0.59), 'springback');
  r.run(1500);
  assert.equal(r.m.bars[0].state, 'resting');
  assert.equal(r.m.latched, 'The Master Chef');
  assert.equal(r.selected.length, 0);
  assert.equal(drag(r, 0, 0.61), 'latch');
  assert.deepEqual(r.selected, ['The Artisan']);
  r.run(1500);
  const latched = r.m.bars.filter(b => b.state === 'latched' || b.state === 'latching');
  assert.deepEqual(latched.map(b => b.category), ['The Artisan']);
  assert.equal(r.m.bar('The Master Chef').state, 'resting');
});

test('event order for one drag: press → drag → detent… → latch → app:category → return', () => {
  const r = rig();
  drag(r, 2, 0.9);
  r.run(1000);
  const types = r.log.map(e => e.type).filter(t => t !== 'bar:hover');
  const first = k => types.indexOf(k);
  assert.equal(types[0], 'bar:press');
  assert.equal(types[1], 'bar:drag');
  const detents = r.log.filter(e => e.type === 'bar:detent');
  assert.equal(detents.length, 5, 'five detents inside 0…90% (each sixth)');
  assert.ok(first('bar:detent') > first('bar:drag'));
  assert.ok(first('bar:prelatch') > first('bar:detent'));
  assert.ok(first('bar:latch') > types.lastIndexOf('bar:detent'));
  assert.equal(types[first('bar:latch') + 1], 'app:category');
  const ret = r.log.find(e => e.type === 'bar:return');
  const lat = r.log.find(e => e.type === 'bar:latch');
  assert.equal(ret.data.category, 'The Master Chef');
  // Paul, WP-16 item 10: the old bar rides the new one home (was a timed 90 + 260 ms linkage), so
  // it lands when the new bar reaches its latch: after bar:latch, within the latch spring's settle
  const gap = ret.t - lat.t;
  assert.ok(gap > 0 && gap < 400, `latch → return ${gap} ms`);
  assert.ok(types.indexOf('bar:return') > first('app:category'));
});

test('Paul, WP-16 item 10: while a bar is dragged out, the selected bar slides back in lockstep', () => {
  const r = rig();
  const chef = r.m.bar('The Master Chef'), art = r.m.bar('The Artisan');
  r.m.press(0, 20);
  for (let k = 1; k <= 10; k++) {
    r.run(30); r.m.move(0, 20 + 0.5 * k);
    r.run(1000 / 60);
    assert.ok(Math.abs(chef.pos.value - (7 - art.pos.value)) < 1e-6, `coupled at step ${k}: ${chef.pos.value} + ${art.pos.value}`);
  }
  assert.ok(art.pos.value > 3 && chef.pos.value < 4);
  // let go short of the latch: both go back, the selected bar out again, still selected
  r.m.move(0, 20 + 3.5); r.run(30);
  assert.equal(r.m.release(0), 'springback');
  for (let k = 0; k < 60; k++) { r.run(1000 / 60); assert.ok(Math.abs(chef.pos.value + Math.max(0, Math.min(7, art.pos.value)) - 7) < 0.06 || art.state === 'resting'); }
  r.run(800);
  assert.equal(r.m.latched, 'The Master Chef');
  assert.equal(chef.state, 'latched');
  assert.ok(Math.abs(chef.pos.value - 7) < 1e-3 && Math.abs(art.pos.value) < 1e-3);
  // never two bars out: through a whole latch the two travels add up to the full travel
  drag(r, 0, 0.8);
  for (let k = 0; k < 40; k++) { r.run(1000 / 60); assert.ok(chef.pos.value + Math.min(7, art.pos.value) <= 7 + 1e-6); }
  r.run(600);
  assert.equal(r.m.latched, 'The Artisan');
  assert.equal(chef.state, 'resting');
});

test('click without drag nudges, never selects; the hint shows on the second click within 4 s', () => {
  const r = rig();
  r.m.press(1, 20); r.run(100); r.m.move(1, 19.9);
  assert.equal(r.m.release(1), 'click');
  r.run(400);
  assert.equal(r.selected.length, 0);
  assert.equal(r.hints.length, 0);
  assert.ok(r.log.some(e => e.type === 'bar:nudge'));
  r.wait(2000);
  r.m.press(1, 20); r.run(100);
  assert.equal(r.m.release(1), 'click');
  assert.deepEqual(r.hints, ['The Blacksmith']);
  // a third click 5 s later starts a fresh count
  r.wait(5000);
  r.m.press(1, 20); r.run(50); r.m.release(1);
  assert.equal(r.hints.length, 1);
  assert.equal(r.selected.length, 0);
});

test('a slow press without movement is not a click (no nudge) and does not select', () => {
  const r = rig();
  r.m.press(4, 20); r.run(400);
  assert.equal(r.m.release(4), 'springback');
  assert.equal(r.selected.length, 0);
});

test('activate (keyboard / programmatic click) slides by itself in 420 ms and selects at the latch', () => {
  const r = rig();
  assert.equal(r.m.activate(8), 'slide');
  r.run(1000 / 60);
  const press = r.log.find(e => e.type === 'bar:press');
  r.run(600);
  const lat = r.log.find(e => e.type === 'bar:latch');
  assert.ok(lat, 'latched');
  assert.deepEqual(r.selected, ['The Fisherman']);
  const ms = lat.t - press.t;
  assert.ok(Math.abs(ms - M.autoSlideMs) <= M.autoSlideMs * 0.1, `auto slide ${ms} ms`);
  assert.equal(r.log.filter(e => e.type === 'bar:detent').length, 5);
  assert.ok(r.log.some(e => e.type === 'bar:prelatch'));
  r.run(800);
  assert.equal(r.m.latched, 'The Fisherman');
  assert.equal(r.m.bar('The Master Chef').state, 'resting');
});

test('activating the latched bar selects again at once; sync from elsewhere animates without selecting', () => {
  const r = rig();
  assert.equal(r.m.activate(3), 'select');
  assert.deepEqual(r.selected, ['The Master Chef']);
  r.m.sync('Highlights');
  r.run(1200);
  assert.equal(r.m.latched, 'Highlights');
  assert.deepEqual(r.selected, ['The Master Chef'], 'sync never selects');
  assert.equal(r.m.bar('The Master Chef').state, 'resting');
});

test('a second activation cancels a running auto-slide; never two latches', () => {
  const r = rig();
  r.m.activate(0); r.run(150);
  r.m.activate(1); r.run(1500);
  assert.deepEqual(r.selected, ['The Blacksmith']);
  assert.equal(r.m.bars.filter(b => b.state === 'latched' || b.state === 'latching').length, 1);
  assert.equal(r.m.bar('The Artisan').state, 'resting');
});

test('dragging the latched bar back right never unlatches it', () => {
  const r = rig();
  r.m.press(3, 10); r.run(200); r.m.move(3, 14); r.run(200);
  r.m.release(3); r.run(1500);
  assert.equal(r.m.latched, 'The Master Chef');
  assert.equal(r.m.bar('The Master Chef').state, 'latched');
  assert.equal(r.selected.length, 0);
});

test('latch overshoot stays within ~0.12 cm', () => {
  const r = rig();
  drag(r, 5, 0.62, 200);
  let max = 0;
  for (let k = 0; k < 120; k++) { r.run(1000 / 60); max = Math.max(max, r.m.bar('The Trophy Collector').pos.value); }
  assert.ok(max > 7, 'it overshoots once');
  assert.ok(max <= 7 + M.latchOvershoot + 1e-6, `overshoot ${max - 7}`);
});

test('impact rattles every bar, staggered, then settles', () => {
  const r = rig();
  r.m.impact(() => 1);
  r.run(20);
  r.run(200);
  const moved = r.m.bars.filter(b => Math.abs(b.rattle.value) > 1e-4 || Math.abs(b.rattle.velocity) > 1e-3).length;
  assert.equal(moved, 13);
  r.run(3000);
  assert.ok(r.m.bars.every(b => Math.abs(b.rattle.value) < 1e-3));
});

test('breeze: write, bilinear sample, 600 ms half-life, DECISIONS point 20 lift and swing', () => {
  const b = createBreeze();
  b.write(0, 0, 100, 6);
  const v0 = b.sample(0, 0);
  assert.ok(v0 > 60 && v0 <= 100, `sample ${v0}`);
  assert.equal(b.sample(40, 20), 0);
  b.step(W.breezeDecay);
  assert.ok(Math.abs(b.sample(0, 0) - v0 / 2) < 0.5, 'half after one half-life');
  b.clear(); b.write(0, 0, 500, 6);
  assert.equal(b.paperLift(0, 0), 0.25);
  assert.equal(b.tagSwingDeg(0, 0), 8);
  assert.equal(b.cols, 32); assert.equal(b.rows, 24);
});

test('impact falloff = 1 / (1 + d / 20 cm)', () => {
  assert.equal(falloff(1, 0), 1);
  assert.equal(falloff(1, 20), 0.5);
  assert.ok(Math.abs(falloff(0.8, 60) - 0.2) < 1e-9);
});
