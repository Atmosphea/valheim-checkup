import test from 'node:test';
import assert from 'node:assert/strict';
import { emit, on, once, events, clearEvents, MAX_EVENTS } from '../src/bus.js';
import { EVENT_NAMES, FILE_01_EVENTS, POINT_29_EVENTS, isCanonical } from '../src/events.js';
import { clock } from '../src/util/clock.js';

test('emit records {t, wall, type, data} and calls listeners', () => {
  clearEvents();
  const got = [];
  const off = on('app:category', (data, entry) => got.push([data, entry.type]));
  const entry = emit('app:category', { title: 'The Artisan' });
  assert.deepEqual(got, [[{ title: 'The Artisan' }, 'app:category']]);
  assert.equal(events.length, 1);
  assert.equal(events[0], entry);
  assert.ok(Number.isFinite(entry.t) && Number.isFinite(entry.wall));
  off();
  emit('app:category', { title: 'x' });
  assert.equal(got.length, 1, 'unsubscribed');
});

test('t is scaled clock time', () => {
  clearEvents();
  clock.setScale(0);
  const a = emit('app:render', {}), b = emit('app:render', {});
  assert.equal(a.t, b.t, 'paused clock gives equal t');
  clock.setScale(1);
});

test('"*" hears everything; once() fires once', () => {
  let all = 0, one = 0;
  const off = on('*', () => all++);
  once('app:toast', () => one++);
  emit('app:toast', { text: 'a' }); emit('app:toast', { text: 'b' }); emit('app:load', { ok: true });
  off();
  assert.equal(all, 3);
  assert.equal(one, 1);
});

test('a throwing listener does not break the emitter or other listeners', () => {
  let ok = 0;
  const original = console.error; console.error = () => {};
  const offA = on('app:mode', () => { throw new Error('boom'); });
  const offB = on('app:mode', () => ok++);
  try { assert.doesNotThrow(() => emit('app:mode', { mode: 'raw' })); }
  finally { console.error = original; offA(); offB(); }
  assert.equal(ok, 1);
});

test('ring buffer keeps the last 2,000 events', () => {
  clearEvents();
  for (let i = 0; i < MAX_EVENTS + 250; i++) emit('fx:dot', { stamp: 'missing', index: i });
  assert.equal(MAX_EVENTS, 2000);
  assert.equal(events.length, 2000);
  assert.equal(events[0].data.index, 250);
  assert.equal(events.at(-1).data.index, 2249);
});

test('canonical list = file 01 (31 names) + DECISIONS point 29 (34 names), no duplicates', () => {
  assert.equal(FILE_01_EVENTS.length, 31);
  assert.equal(POINT_29_EVENTS.length, 34);
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
  for (const t of ['app:load', 'app:details-close', 'sound:play', 'impact', 'app:star', 'tour:start']) assert.ok(isCanonical(t), t);
  assert.ok(!isCanonical('app:nope'));
});
