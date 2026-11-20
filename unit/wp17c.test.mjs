// WP-17C unit checks: trophy facts mapping (Paul, WP-17 item 26) and per-item stains (item 30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prefabFor, trophyFacts } from '../src/data/trophy-map.js';

const drops = JSON.parse(readFileSync(new URL('../src/data/trophy-drops.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const trophies = catalog.catalog.find(c => c.type === 'pickup').items;

test('item 26: every catalog trophy maps to one wiki entry, none twice', () => {
  const seen = new Map();
  for (const i of trophies) {
    const p = i.tokens.map(t => prefabFor(t, drops.trophies)).find(Boolean);
    assert.ok(p, `no wiki entry for ${i.name}`);
    assert.ok(!seen.has(p), `${p} mapped by both ${seen.get(p)} and ${i.name}`);
    seen.set(p, i.name);
  }
  assert.equal(seen.size, trophies.length);
});

test('item 26: facts carry the drop chance and usage; unknown tokens give nothing', () => {
  const fader = trophies.find(i => i.name === 'Fader Trophy');
  const f = trophyFacts(fader.tokens, drops);
  assert.equal(f.prefab, 'TrophyFader');
  assert.match(f.dropChance, /^\d+%$/);
  const deer = trophyFacts(['$item_trophy_deer'], drops);
  assert.deepEqual(deer.usage, drops.trophies.TrophyDeer.usage);
  const boar = trophyFacts(['$item_trophy_boar'], drops);
  assert.deepEqual(boar.usage, [drops.sharedUsage[0]]);
  assert.equal(boar.shared, true);
  assert.equal(trophyFacts(['$item_wood'], drops), null);
  assert.equal(trophyFacts(['$item_trophy_nosuch'], drops), null);
});
