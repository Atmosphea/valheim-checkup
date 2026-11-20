// WP-18B (Paul's feedback round 3, items 11–17): the pure parts — stamp dot order, recipe icons, row burn config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { dotOrder } from '../src/ink/stamps.js';
import { rowBurn } from '../src/config/motion.js';
import { board } from '../src/config/render.js';
const barNotch = board.barNotch;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test('item 13: Missing is Completed\'s layout with filled and hollow reversed; Undiscovered and Unverified fill from the end', () => {
  const model = { dots: 10, drawn: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] };
  // Completed: model index j → circle j (first circles filled)
  assert.deepEqual(dotOrder('completed', model), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Missing: the 3 filled sit in the last 3 circles, in reading order; the hollow ones fill the start
  const m = dotOrder('missing', model);
  assert.deepEqual(m.slice(0, 3), [7, 8, 9]);
  assert.deepEqual(m.slice(3), [0, 1, 2, 3, 4, 5, 6]);
  // Undiscovered / Unverified: from the last circle backwards
  for (const k of ['discovered', 'unknown']) assert.deepEqual(dotOrder(k, model), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  // every order is a permutation (no circle twice, none lost)
  for (const k of ['completed', 'missing', 'discovered', 'unknown']) assert.deepEqual([...dotOrder(k, model)].sort((a, b) => a - b), [...Array(10).keys()]);
});

test('item 17: every ingredient and station in food-recipes.json has an icon (atlas cell or the extra sheet)', async () => {
  const foods = json('src/data/food-recipes.json').foods;
  const ri = json('src/icons/recipe-icons.json');
  const map = json('src/icons/icon-map.json');
  const names = new Set();
  for (const v of Object.values(foods)) { for (const i of v.ingredients || []) names.add(i.name); if (v.station) names.add(v.station); }
  assert.deepEqual(ri.missing, []);
  for (const n of names) {
    const e = ri.icons[n];
    assert.ok(e, `${n} has no icon`);
    if ('cell' in e) assert.equal(map.icons[e.token]?.cell, e.cell, `${n}: atlas cell matches icon-map.json`);
    else assert.ok(e.extra >= 0 && e.extra < ri.cols * ri.rows, `${n}: extra cell in range`);
  }
  const meta = await sharp(path.join(ROOT, 'src/icons/recipe-icons.webp')).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, ri.cols * 96);
  assert.equal(meta.height, ri.rows * 96);
});

test('item 17: the Gourmet data covers 96 of the 97 items and is credited like the trophy data', () => {
  const foods = json('src/data/food-recipes.json').foods;
  const gourmet = json('src/catalog.json').catalog.find(c => c.type === 'eat').items.map(i => i.name);
  assert.equal(gourmet.length, 97);
  assert.equal(gourmet.filter(n => foods[n]).length, 96);
  for (const f of ['README.md', 'LICENSES/README.md']) assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), /food-recipes\.json[\s\S]*?CC BY-SA 3\.0|CC BY-SA 3\.0[\s\S]*?food-recipes\.json/, f);
});

test('items 11 and 12: notch and row-burn settings are sane', () => {
  assert.ok(barNotch.widthCm < barNotch.pitchCm, 'a notch is narrower than its pitch (steel between notches)');
  assert.ok(barNotch.clearCm > 0 && barNotch.startCm > 0);
  assert.ok(rowBurn.awayMs > 0 && rowBurn.inMs > 0 && rowBurn.awayMs + rowBurn.holdMs + rowBurn.inMs <= 1500);
});
