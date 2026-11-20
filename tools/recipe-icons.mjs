// @ts-check
/**
 * recipe-icons.mjs — Paul, WP-18 item 17: icons for the Gourmet recipe row (ingredients) and the
 * header lockup (cooking stations).
 *
 *   node tools/recipe-icons.mjs
 *
 * Every name in src/data/food-recipes.json (ingredients and stations) is matched by its English
 * display name to a Jötunn token (the same Jötunn documentation tools/harvest-icons.mjs uses as
 * source A, MIT, read from the same work folder; no network).
 *   - a token that already has a cell in the bundled atlas (src/icons/atlas.webp) uses that cell;
 *   - the rest (raw materials such as Boar Meat or Barley, which no collection tracks, so the main
 *     atlas never needed them) are packed into a small extra sheet, src/icons/recipe-icons.webp,
 *     made exactly like the atlas (96 px cells, WebP).
 * The main atlas, icon-map.json and their WP-02 counts are left as they are.
 *
 * Writes src/icons/recipe-icons.webp and src/icons/recipe-icons.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'src', 'icons');
const WORK = process.env.ICON_WORK || path.join(os.tmpdir(), 'valheim-checkup-icon-work');
const DOCS = path.join(WORK, 'jotunn', 'JotunnLib', 'Documentation');
const CELL = 96;
const COLS = 8;

const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'food-recipes.json'), 'utf8')).foods;
const map = JSON.parse(fs.readFileSync(path.join(ICONS, 'icon-map.json'), 'utf8'));
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(DOCS, 'data', f), 'utf8');
if (!fs.existsSync(path.join(DOCS, 'data', 'objects', 'item-list.md'))) {
  console.error(`[recipe-icons] no Jötunn documentation in ${WORK}: run node tools/harvest-icons.mjs once first`);
  process.exit(1);
}

/** English name (lowercase) → {token, image} from the Jötunn item and piece lists. */
const byName = new Map();
const IMG = /<img src="\.\.\/\.\.\/images\/(items|pieces)\/([^"]+)\.png">/;
for (const md of [read('objects/item-list.md'), read('pieces/piece-list.md')]) {
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|');
    const m = (c[1] || '').match(IMG), token = (c[3] || '').trim(), name = (c[4] || '').trim().toLowerCase();
    if (!m || !token.startsWith('$') || !name || byName.has(name)) continue;
    byName.set(name, { token, image: `${m[1]}/${m[2]}` });
  }
}

const names = new Set();
for (const v of Object.values(recipes)) {
  for (const i of v.ingredients || []) names.add(i.name);
  if (v.station) names.add(v.station);
}

/** @type {Record<string, {cell?: number, extra?: number, token: string}>} */
const out = {};
const extra = [];
const missing = [];
for (const n of [...names].sort()) {
  const hit = byName.get(n.toLowerCase());
  if (!hit) { missing.push(n); continue; }
  const e = map.icons[hit.token] || map.icons[hit.token.toLowerCase()];
  if (e && 'cell' in e) { out[n] = { token: hit.token, cell: e.cell }; continue; }
  const file = path.join(DOCS, 'images', hit.image + '.png');
  if (!fs.existsSync(file)) { missing.push(n); continue; }
  out[n] = { token: hit.token, extra: extra.length };
  extra.push(file);
}

const rows = Math.max(1, Math.ceil(extra.length / COLS));
const cells = await Promise.all(extra.map(async (f, i) => ({
  input: await sharp(f).resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL,
})));
const webp = await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(cells).webp({ quality: 82, effort: 6 }).toBuffer();
fs.writeFileSync(path.join(ICONS, 'recipe-icons.webp'), webp);
fs.writeFileSync(path.join(ICONS, 'recipe-icons.json'), JSON.stringify({
  _about: 'Paul, WP-18 item 17: recipe ingredient and station icons by display name (tools/recipe-icons.mjs). "cell" = a cell of atlas.webp; "extra" = a cell of recipe-icons.webp. Images: Jötunn documentation (MIT).',
  cols: COLS, rows, icons: out, missing,
}, null, 1) + '\n');
console.log(`[recipe-icons] ${names.size} names: ${Object.values(out).filter(e => 'cell' in e).length} from the atlas, ${extra.length} in recipe-icons.webp (${webp.length} bytes), ${missing.length} without an icon${missing.length ? ': ' + missing.join(', ') : ''}`);
