// WP-18C: the save's skipped dictionaries (read beside core.js) and the "Played on" line.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { readSaveExtras } from '../src/data/save-extras.js';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');

// the same minimal profile as scripts/test.cjs, with the three skipped dictionaries filled
const i = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const f = n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; };
const str = s => { const b = Buffer.from(s), a = []; let n = b.length; do { a.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n); return Buffer.concat([Buffer.from(a), b]); };
const dict = o => Buffer.concat([i(Object.keys(o).length), ...Object.entries(o).flatMap(([k, v]) => [str(k), f(v)])]);
function fixture() {
  const player = Buffer.concat([i(33), f(25), f(25), f(0), f(0), str(''), f(0), i(109), Buffer.alloc(2), ...Array.from({ length: 7 }, () => i(0)), i(0), str(''), str(''), Buffer.alloc(24), i(0), i(0), i(2), i(0), i(0), f(0), f(0), f(0), i(0)]);
  const buckets = Array.from({ length: 10 }, (_, k) => Buffer.concat([Buffer.alloc(205 * 4),
    dict(k === 0 ? { World: 3600 } : {}),
    dict(k === 0 ? { 'preset combat_hard:deathpenalty_default:resources_muchmore': 7200, 'enemydamage 150': 7200, 'playerdamage default': 7200, 'EnemyDamage default': 10, 'defeated_eikthyr': 20 } : {}),
    dict(k === 0 ? { spawn: 2 } : {}),
    i(5), ...Array.from({ length: 5 }, () => dict(k === 0 ? { $enemy_eikthyr: 2 } : {})), dict({}), dict({}), dict({}), dict({}), dict({})]));
  const body = Buffer.concat([i(46), i(205), i(10), ...buckets, Buffer.from([0]), i(0), str('Fixture'), Buffer.alloc(8), str(''), Buffer.from([0]), Buffer.alloc(8), Buffer.from([1]), i(player.length), player]);
  return Buffer.concat([i(body.length), body, i(64), crypto.createHash('sha512').update(body).digest()]);
}

test('the three skipped dictionaries are read, and core.js still reads the same save', async () => {
  const bytes = fixture();
  const save = await core.parseSave(bytes);
  assert.equal(save.buckets[0].enemy[0].$enemy_eikthyr, 2, 'core.js unchanged: kills from enemy[0]');
  const x = readSaveExtras(bytes);
  assert.ok(x);
  assert.deepEqual(x.extraA[0], { World: 3600 });
  assert.equal(x.extraB[0]['enemydamage 150'], 7200);
  assert.deepEqual(x.extraC[0], { spawn: 2 });
  assert.equal(x.extraA.length, 10);
});

test('a damaged or unknown layout gives null, never a guess', () => {
  const bytes = fixture();
  assert.equal(readSaveExtras(bytes.subarray(0, 200)), null);
  const other = Buffer.from(bytes); other.writeInt32LE(48, 4);
  assert.equal(readSaveExtras(other), null);
});

import { playedOn } from '../src/insights/played-on.js';
test('"Played on": presets and numbers, no defaults, no world keys', () => {
  const r = playedOn({ 'preset combat_hard:deathpenalty_default:resources_muchmore:raids_default': 7200, 'enemydamage 150': 7200, 'resourcerate 200': 7200,
    'playerdamage default': 7200, 'EnemyDamage default': 10, 'defeated_eikthyr': 20, 'defeated_eikthyr ': 7000, 'playerevents': 5, 'activebosses 1': 30 });
  assert.deepEqual(r.parts, ['Combat: hard', 'Resources: much more', 'Enemy damage 150 %', 'Resource rate 200 %']);
  assert.equal(Math.round(r.hours), 2);
  assert.equal(playedOn({ 'worldlevel default': 100 }), null, 'all defaults: no line');
});

test('"Played on": a setting played under two values lists both, most time first', () => {
  const r = playedOn({ 'enemydamage 150': 3600 * 3, 'enemydamage 200': 3600 * 10 });
  assert.deepEqual(r.parts, ['Enemy damage 200 % (10 h) / 150 % (3 h)']);
});
