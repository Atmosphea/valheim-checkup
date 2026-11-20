/**
 * WP-01 acceptance: "Every named value in files 04 to 06 exists in src/config/".
 *
 * Three checks:
 *  1. Every name the spec writes in backticks as a tunable exists as a key.
 *  2. Every sound in file 06 exists in audio-mix.json with a bus and a gain, and its trigger
 *     event is canonical.
 *  2b. Named values are checked by key: each backticked tunable and each named spring
 *     equals the number the spec writes next to it (WP-01 round 1, fix 3).
 *  3. Every number in the tables, bullets and numbered rules of files 04, 05 and 06 appears
 *     somewhere in the config, allowing the unit conversions the config uses
 *     (kHz → Hz, s → ms, % → fraction). This catches a forgotten value; it can't prove a
 *     number sits under the right name, which the code review and the checker do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import motion from '../src/config/motion.js';
import render from '../src/config/render.js';
import { isCanonical } from '../src/events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = f => fs.readFileSync(path.join(ROOT, 'spec', f), 'utf8');
const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/audio-mix.json'), 'utf8'));

/** All keys and all numeric leaves of an object tree. */
function leaves(root) {
  const keys = new Set(), nums = [];
  const walk = v => {
    if (typeof v === 'number') nums.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
  };
  walk(root);
  return { keys, nums };
}
const config = leaves({ motion, render, audio });

test('backticked tunable names from files 04–06 exist as config keys', () => {
  for (const name of ['bristleAmp', 'bristleFreq', 'bristleSpeed', 'impactFalloff', 'breezeDecay', 'pxPerCm', 'grainIntensity']) {
    assert.ok(config.keys.has(name), name);
  }
});

/** Value at a dotted path in the config, e.g. 'motion.paper.bristleAmp'. */
const at = p => p.split('.').reduce((o, k) => o?.[k], { motion, render });

test('backticked tunables hold the spec value, checked by key name', () => {
  const f04 = spec('04-behaviour.md'), f05 = spec('05-rendering.md');
  const expected = [
    // [config path, value, spec file text, the spec's own wording of the value]
    ['motion.paper.bristleAmp', 0.03, f04, '`bristleAmp 0.03 cm`'],
    ['motion.paper.bristleFreq', 0.08, f04, '`bristleFreq 0.08 /cm`'],
    ['motion.paper.bristleSpeed', 0.15, f04, '`bristleSpeed 0.15`'],
    ['motion.world.impactFalloff', 20, f04, '`impactFalloff = 1 / (1 + d/20 cm)`'],
    ['motion.world.breezeDecay', 600, f04, '`breezeDecay = 600 ms`'],
    ['render.print.pxPerCm', 29, f05, '`pxPerCm = 29`'],
    ['render.post.grainIntensity', 0.1, f05, '`grainIntensity 0.10`'],
  ];
  for (const [p, value, text, wording] of expected) {
    assert.ok(text.includes(wording), `spec still says ${wording}`);
    assert.equal(at(p), value, p);
  }
  assert.equal(at('motion.world.breezeDecayIsHalfLife'), true, 'breezeDecay is a half-life (DECISIONS)');
});

test('every named spring holds the stiffness / damping from its file 04 row, checked by key name', () => {
  const rows = spec('04-behaviour.md').split('\n');
  /** [config path, the row's first cell, stiffness, damping] */
  const expected = [
    ['motion.paper.breezeLiftSpring', 'Breeze', 120, 14],
    ['motion.paper.impactSpring', 'Impact', 600, 20],
    ['motion.printed.pressReleaseSpring', 'Press', 500, 30],
    ['motion.bar.dragSpring', 'Drag', 900, 40],
    ['motion.bar.latchSpring', 'Release at 60% or more', 700, 22],
    ['motion.bar.springbackSpring', 'Release under 60%', 400, 26],
    ['motion.bar.impactRattleSpring', 'Impact', 500, 18],
    ['motion.gauntlet.followSpring', 'Pointer moves over the board', 220, 26],
    ['motion.gauntlet.fingerSpring', 'Speed', 300, 18],
    ['motion.gauntlet.watchSpring', 'Spark is out', 60, 12],
    ['motion.camera.driftSpring', 'Pointer position', 30, 10],
  ];
  for (const [p, row, k, c] of expected) {
    const inSpec = rows.some(r => r.startsWith(`| ${row} |`) && r.includes(`spring \`${k} / ${c}\``));
    assert.ok(inSpec, `file 04 row "${row}" has spring ${k} / ${c}`);
    assert.deepEqual({ ...at(p) }, { stiffness: k, damping: c, mass: 1 }, p);
  }
  // The wall gives stiffness only (damping 49 is a starting value; DECISIONS open point 3).
  assert.ok(rows.some(r => r.includes('wall spring `600`')));
  assert.equal(at('motion.gauntlet.wallSpring').stiffness, 600);
});

test('all 69 sounds of file 06 are in audio-mix.json with bus, gain and a canonical trigger', () => {
  const text = spec('06-sound.md');
  const names = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const first = line.split('|')[1];
    for (const m of first.matchAll(/`([a-z]+\.[a-z-]+)`/g)) names.add(m[1]);
  }
  assert.equal(names.size, 69, 'file 06 lists 69 sounds');
  const sounds = audio.sounds;
  assert.equal(Object.keys(sounds).length, 69);
  const buses = new Set(audio.engine.buses);
  for (const n of names) {
    const s = sounds[n];
    assert.ok(s, `${n} missing`);
    assert.ok(buses.has(s.bus), `${n} bus ${s.bus}`);
    assert.ok(Number.isFinite(s.gain) && s.gain < 0, `${n} gain`);
    if (s.event === null) assert.ok(s.trigger || s.loop, `${n} needs a trigger description`);
    else assert.ok(isCanonical(s.event), `${n} event ${s.event} is canonical`);
  }
});

test('the gain column of file 06 matches audio-mix.json', () => {
  for (const line of spec('06-sound.md').split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').map(c => c.trim());
    const names = [...cells[1].matchAll(/`([a-z]+\.[a-z-]+)`/g)].map(m => m[1]);
    const gains = [...cells.at(-2).matchAll(/−(\d+)/g)].map(m => -Number(m[1]));
    if (!gains.length) continue; // "as stated" (coin.land): first contact −14 dB is checked below
    names.forEach((n, i) => assert.equal(audio.sounds[n].gain, gains[Math.min(i, gains.length - 1)], n));
  }
  assert.equal(audio.sounds['coin.land'].gain, -14);
});

/** Numbers in a line, skipping ids like WP-10, P10, F1, #2b1d14, 3rd. */
function numbersIn(line) {
  const out = [];
  const re = /(?<![\w.\-#])([−+]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\w])/g;
  for (const m of line.matchAll(re)) {
    const n = Number(m[2].replace(/,/g, ''));
    out.push(m[1] === '−' ? -n : n);
  }
  return out;
}

const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
/** Accept the number as written or in the config's units. */
function present(n) {
  const forms = [n, -n, n * 1000, -n * 1000, n / 100, -n / 100];
  return forms.some(f => config.nums.some(c => near(c, f)));
}

test('every number in files 04, 05 and 06 is in src/config/', () => {
  const missing = [];
  for (const file of ['04-behaviour.md', '05-rendering.md', '06-sound.md']) {
    for (const raw of spec(file).split('\n')) {
      const line = raw.trim();
      if (!(line.startsWith('|') || line.startsWith('- ') || /^\d+\. /.test(line))) continue;
      if (/^\|\s*-{3}/.test(line)) continue;
      for (const n of numbersIn(line)) if (!present(n)) missing.push(`${file}: ${n}  ←  ${line.slice(0, 90)}`);
    }
  }
  assert.deepEqual(missing, [], 'numbers in the spec with no config value:\n' + missing.join('\n'));
});
