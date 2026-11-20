// WP-02 icons: harvester parsing, icon-map coverage, glyphs, runtime lookups, credit and privacy wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as H from '../tools/harvest-icons.mjs';
import { GLYPHS, DEATH_GLYPHS, TREE_GLYPHS, CATEGORY_GLYPHS, glyphSvg } from '../src/icons/glyphs.js';
import { itemIndex, iconFor, hotlinkHosts, hotlinkPrivacyText } from '../src/icons/lookup.js';
import { iconCredit, STRINGS } from '../src/strings.js';
import { icons as cfg } from '../src/config/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const catalog = JSON.parse(read('src/catalog.json'));
const map = JSON.parse(read('src/icons/icon-map.json'));
const overrides = JSON.parse(read('src/icons/overrides.json'));
const tokens = H.catalogTokens(catalog);
const iconBearing = [...tokens.keys()].filter(t => !H.isStat(t));
const stats = [...tokens.keys()].filter(H.isStat);

test('catalog has 1,052 icon-bearing tokens and 26 death/tree tokens (spec numbers)', () => {
  assert.equal(iconBearing.length, 1052);
  assert.equal(stats.length, 26);
});

test('acceptance 1: at least 1,050 of 1,052 tokens bundled; every other one has a hotlink or glyph', () => {
  const bundled = iconBearing.filter(t => 'cell' in (map.icons[t] || {}));
  assert.ok(bundled.length >= 1050, `bundled ${bundled.length}`);
  for (const t of tokens.keys()) {
    const e = map.icons[t];
    assert.ok(e, `${t} missing from icon-map.json`);
    assert.ok('cell' in e || 'hotlink' in e || 'glyph' in e, t);
    if ('cell' in e) assert.ok(Number.isInteger(e.cell) && e.cell >= 0 && e.cell < map.cells, t);
    if ('hotlink' in e) assert.ok(e.glyph in GLYPHS && /^https:\/\//.test(e.hotlink), t);
    if ('glyph' in e && !('hotlink' in e)) assert.ok(e.glyph in GLYPHS, `${t}: unknown glyph ${e.glyph}`);
  }
});

test('acceptance 1: the 16 death causes and 10 trees each have their own, distinct glyph', () => {
  assert.equal(Object.keys(DEATH_GLYPHS).length, 16);
  assert.equal(Object.keys(TREE_GLYPHS).length, 10);
  for (const t of stats) assert.deepEqual(map.icons[t], { glyph: t }, t);
  const bodies = Object.values(GLYPHS);
  assert.equal(new Set(bodies).size, bodies.length, 'two glyphs share the same drawing');
  for (const k of ['weapon', 'armour', 'tool', 'food', 'piece', 'creature', 'trophy', 'fish']) assert.ok(CATEGORY_GLYPHS[k], k);
  assert.match(glyphSvg('TreeOak'), /^<svg viewBox="0 0 24 24"[^>]*stroke="currentColor"[^>]*aria-hidden="true">/);
});

test('acceptance 4: atlas is WebP, 96 px cells, under 4 MB, and matches the map', async () => {
  const buf = fs.readFileSync(path.join(ROOT, 'src/icons/atlas.webp'));
  assert.ok(buf.length < 4 * 1024 * 1024, `${buf.length} bytes`);
  const meta = await sharp(buf).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(map.cell, 96);
  assert.equal(meta.width, map.cols * 96);
  assert.equal(meta.height, map.rows * 96);
  assert.ok(map.cells <= map.cols * map.rows);
});

test('every bundled cell is a visible picture (no blank Jötunn renders slipped through)', async () => {
  const { data, info } = await sharp(path.join(ROOT, 'src/icons/atlas.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let c = 0; c < map.cells; c++) {
    const x0 = (c % map.cols) * 96, y0 = Math.floor(c / map.cols) * 96;
    let n = 0;
    for (let y = y0; y < y0 + 96; y++) for (let x = x0; x < x0 + 96; x++) if (data[(y * info.width + x) * 4 + 3] > 64) n++;
    assert.ok(n / (96 * 96) >= H.BLANK_SHARE * 0.8, `cell ${c} is nearly blank (${n} px)`);
  }
});

test('overrides: every entry is a catalog token and was looked at before it was accepted', () => {
  const entries = Object.entries(overrides).filter(([k]) => !k.startsWith('_'));
  assert.ok(entries.length >= 19);
  for (const [t, o] of entries) {
    assert.ok(tokens.has(t), `${t} not in catalog`);
    assert.match(o.checked, /^2026-\d\d-\d\d, WP-02 builder( \(orchestrator follow-up[^)]*\))?: .+\. Accepted\.$/, t);
    if (o.treatment) assert.ok(o.treatment in H.TREATMENTS, t);
  }
  // The spec's verified seed list is all present.
  for (const t of ['$enemy_aspect_gdking', '$enemy_root', '$enemy_drake', '$enemy_skeletonfire', '$item_upgrader_tier1', '$item_staffredlightning']) assert.ok(overrides[t], t);
});

test('harvester: parses Jötunn list rows, with and without images', () => {
  const md = [
    '|Item |AssetID |Token |English Name |Type |Description |',
    '|---|---|---|---|---|---|',
    '|Abomination_attack1|af1b|Swing attack|Swing attack|OneHandedWeapon|NULL|',
    '|Club<br><img src="../../images/items/Club.png">|a1|$item_club|Club|OneHandedWeapon|A club.|',
  ].join('\n');
  assert.deepEqual(H.parseList(md).map(r => [r.prefab, r.image, r.token, r.type]), [
    ['Abomination_attack1', null, 'Swing attack', 'OneHandedWeapon'],
    ['Club', 'items/Club', '$item_club', 'OneHandedWeapon'],
  ]);
  const chars = H.parseCharacters('|Name |AssetID |\n|---|---|\n|Boar_piggy<br><img src="../../images/characters/Boar_piggy.png">|b6|');
  assert.equal(chars.get('boarpiggy'), 'characters/Boar_piggy');
  assert.equal(H.normal('Charred_Melee_Fader'), 'charredmeleefader');
});

test('harvester: token match rules (direct, case-insensitive; creatures: trophy, then item, then character)', () => {
  const idx = H.jotunnIndex({
    items: '|Club<br><img src="../../images/items/Club.png">|a|$item_Club|Club|OneHandedWeapon|x|\n|TrophyBoar<br><img src="../../images/items/TrophyBoar.png">|b|$item_trophy_boar|Boar Trophy|Trophy|x|\n|Fish1<br><img src="../../images/items/Fish1.png">|c|$animal_fish1|Perch|Fish|x|',
    pieces: '|Bench<br><img src="../../images/pieces/piece_workbench.png">|d|$piece_workbench|Workbench|x|',
    characters: '|Boar<br><img src="../../images/characters/Boar.png">|e|\n|Greyling<br><img src="../../images/characters/Greyling.png">|f|',
  });
  assert.equal(H.resolveA('$item_club', idx), 'items/Club');
  assert.equal(H.resolveA('$piece_workbench', idx), 'pieces/piece_workbench');
  assert.equal(H.resolveA('$enemy_boar', idx), 'items/TrophyBoar');
  assert.equal(H.resolveA('$animal_fish1', idx), 'items/Fish1');
  assert.equal(H.resolveA('$enemy_greyling', idx), 'characters/Greyling');
  assert.equal(H.resolveA('$enemy_nothing', idx), null);
  assert.equal(H.resolveA('DeathByFall', idx), null);
});

test('harvester: glyph categories', () => {
  const e = (token, ...types) => ({ token, types: new Set(types) });
  assert.equal(H.glyphFor(e('DeathByFall', 'stat')), 'DeathByFall');
  assert.equal(H.glyphFor(e('$animal_fish1', 'fish')), 'fish');
  assert.equal(H.glyphFor(e('$item_trophy_boar', 'pickup')), 'trophy');
  assert.equal(H.glyphFor(e('$enemy_boar', 'killHard')), 'creature');
  assert.equal(H.glyphFor(e('$piece_x', 'build')), 'piece');
  assert.equal(H.glyphFor(e('$item_sword', 'craft'), 'OneHandedWeapon'), 'weapon');
  assert.equal(H.glyphFor(e('$item_helmet', 'craft'), 'Helmet'), 'armour');
  assert.equal(H.glyphFor(e('$item_soup', 'craft', 'eat'), 'Consumable'), 'food');
  assert.equal(H.glyphFor(e('$item_hoe', 'craft'), 'Tool'), 'tool');
});

test('runtime lookup: every row of every collection resolves, including The Hunter and items without a token', () => {
  const idx = itemIndex(catalog);
  const hard = catalog.catalog.find(c => c.type === 'killHard');
  assert.equal(idx.get('The Hunter:0')?.type, 'killAny');
  assert.deepEqual(idx.get('The Hunter:0')?.tokens, hard.items.find(i => i.order === 0).tokens);
  let rows = 0, cells = 0;
  for (const c of catalog.catalog) for (const i of c.items) {
    const e = iconFor(idx.get(i.id), map.icons); rows++;
    if ('cell' in e) cells++;
    else assert.ok('glyph' in e && e.glyph in GLYPHS, i.id);
  }
  assert.equal(rows, 1353);
  const display = catalog.catalog.find(c => c.type === 'build').items.find(i => !i.tokens.length);
  assert.deepEqual(iconFor(idx.get(display.id), map.icons), { glyph: 'piece' });
  assert.deepEqual(iconFor(undefined, map.icons), { glyph: 'tool' });
});

test('runtime lookup: bundled beats hotlink beats glyph across an item\'s tokens', () => {
  const icons = { a: { glyph: 'weapon' }, b: { hotlink: 'https://img.example.org/b.png', glyph: 'weapon' }, c: { cell: 3 } };
  assert.deepEqual(iconFor({ tokens: ['a', 'b', 'c'], type: 'craft' }, icons), { cell: 3 });
  assert.deepEqual(iconFor({ tokens: ['a', 'b'], type: 'craft' }, icons), icons.b);
  assert.deepEqual(iconFor({ tokens: ['a'], type: 'craft' }, icons), { glyph: 'weapon' });
});

test('acceptance 5: privacy line present if and only if hotlinks exist', () => {
  const realHotlinks = Object.values(map.icons).some(e => 'hotlink' in e);
  assert.equal(hotlinkPrivacyText(map.icons) !== '', realHotlinks);
  assert.equal(hotlinkPrivacyText({ a: { cell: 0 }, b: { glyph: 'fish' } }), '');
  const two = { a: { hotlink: 'https://valheim.weirdgloop.org/images/A.png', glyph: 'fish' }, b: { hotlink: 'https://www.valheim.tools/icons/items/B.png', glyph: 'fish' } };
  assert.deepEqual(hotlinkHosts(two), ['valheim.weirdgloop.org', 'www.valheim.tools']);
  assert.equal(hotlinkPrivacyText({ a: two.a }), 'A few item icons load from valheim.weirdgloop.org; your save is never sent.');
  assert.equal(STRINGS.iconHotlinkPrivacy, 'A few item icons load from {host}; your save is never sent.');
});

test('acceptance 5: credit line worded for the sources actually used', () => {
  const base = 'Item, piece and creature icons © Iron Gate AB, via the Jötunn documentation (MIT)';
  assert.equal(iconCredit({}), base + '.');
  assert.equal(iconCredit({ wiki: true }), base + ' and the Valheim wiki.');
  assert.equal(iconCredit({ valheimTools: true }), base + ' and valheim.tools.');
  assert.equal(iconCredit({ valheimTools: true, wiki: true }), base + ', valheim.tools and the Valheim wiki.');
  // The map's flags match what the cells actually came from.
  const sources = JSON.parse(read('src/icons/sources.json')).tokens;
  const used = s => Object.values(sources).some(r => r.source === s || r.via === s);
  assert.deepEqual(map.sources, { jotunn: true, valheimTools: used('B'), wiki: used('C') });
});

test('config: icon sizes and print treatment from the spec', () => {
  assert.equal(cfg.rowPx, 28);
  assert.equal(cfg.detailsPx, 64);
  assert.equal(cfg.sepia, 0.15);
  assert.equal(cfg.blend, 'multiply');
  assert.ok(cfg.grainAlphaMin >= 0.85 && cfg.grainAlphaMax <= 1);
});

test('privacy guard: atlas never spells a private string, even by chance (made-up values only)', async () => {
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-icons-'));
  fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify({ name: 'Zorbu', other: 'keep' }));
  fs.writeFileSync(path.join(dir, 'characters_qwopx.fch'), '');
  assert.deepEqual(H.privateStrings(dir).sort(), ['Zorbu', 'characters_qwopx', 'qwopx'].sort());
  assert.deepEqual(H.privateStrings(path.join(dir, 'missing')), []);
  fs.rmSync(dir, { recursive: true });
  const buf = Buffer.from('xxZORBUxx');
  assert.equal(H.containsAny(buf, ['zorbu']), true);                                  // raw bytes, any case
  assert.equal(H.containsAny(Buffer.from(Buffer.from('ab').toString('base64') + '!'), []), false);
  assert.equal(H.containsAny(Buffer.from([0x66, 0x8a, 0xdb, 0x9e]), ['zorb']), true);              // these bytes are base64 "Zorb"
  assert.equal(H.containsAny(Buffer.from('plain text'), ['zorbu']), false);
  assert.equal(H.containsAny(Buffer.from('hello'), [Buffer.from('hello').toString('base64').slice(0, 5)]), true); // base64 text
  // The committed atlas passes the guard against whatever private strings exist on this machine.
  assert.equal(H.containsAny(fs.readFileSync(path.join(ROOT, 'src/icons/atlas.webp')), H.privateStrings()), false);
});
