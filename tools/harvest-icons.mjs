// @ts-check
/**
 * harvest-icons.mjs — WP-02. Finds an icon for every catalog token and packs the bundled ones
 * into one image (an "atlas": many small pictures laid out in a grid on one sheet).
 *
 *   node tools/harvest-icons.mjs            normal run (network only for what is still missing)
 *   node tools/harvest-icons.mjs --offline  no network at all; uses only what is already cached
 *   node tools/harvest-icons.mjs --refresh  re-download the Jötunn documentation
 *
 * Sources, tried in this order (spec/wp-02-icons.md):
 *   A  Jötunn documentation on GitHub (MIT). Fetched with a git sparse checkout when git exists,
 *      otherwise as a GitHub tarball with only the needed folders extracted (DECISIONS, WP-02 git
 *      workaround). Kept in a work folder outside the project.
 *      Then src/icons/overrides.json is applied (hand-checked mappings).
 *   B  valheim.tools (name → spawn ID → /icons/items/<id>.png), at most one request per second.
 *   C  Valheim wiki (Weird Gloop) pageimages API, 50 titles per request.
 *   D  Hotlink: B or C gave a URL but the download failed → the app loads it lazily at runtime.
 *   E  Glyph: engraved line art per category; every death cause and tree species has its own.
 *
 * Incremental: B/C downloads are cached in the work folder and remembered in
 * src/icons/sources.json, so a re-run only goes to the network for tokens without an icon.
 *
 * Writes src/icons/atlas.webp, src/icons/icon-map.json, src/icons/sources.json,
 * src/icons/coverage.md. Never touches src/catalog.json.
 *
 * The work folder defaults to <system temp>/valheim-checkup-icon-work; set ICON_WORK to move it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'src', 'icons');
const WORK = process.env.ICON_WORK || path.join(os.tmpdir(), 'valheim-checkup-icon-work');
const JOTUNN = path.join(WORK, 'jotunn');
const DOCS = path.join(JOTUNN, 'JotunnLib', 'Documentation');
const CACHE = path.join(WORK, 'downloads');
const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has('--offline');

/** Generic, descriptive User-Agent with no personal details (Weird Gloop API policy asks for one). */
const UA = 'valheim-checkup-icon-harvester/1.0 (offline fan-tool build script; one request per second)';
const JOTUNN_REPO = 'https://github.com/Valheim-Modding/Jotunn';
const JOTUNN_TARBALL = 'https://codeload.github.com/Valheim-Modding/Jotunn/tar.gz/refs/heads/dev';
const DOC_PARTS = ['JotunnLib/Documentation/data', 'JotunnLib/Documentation/images/items', 'JotunnLib/Documentation/images/pieces', 'JotunnLib/Documentation/images/characters'];

export const CELL = 96;
const WEBP_QUALITY = 82;
const ATLAS_LIMIT = 4 * 1024 * 1024;

const log = (...a) => console.log('[icons]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');

// ───────────────────────────── catalog ─────────────────────────────

/** Token prefixes treated as creatures (spec step A4). */
export const CREATURE = /^\$(enemy|animal|spiritcaller)_/i;
/** Tokens matched directly by token (spec step A3). */
export const DIRECT = /^\$(item|tool|ship|piece)_/i;
/** Death-cause and tree-species stat tokens: always their own glyph. */
export const isStat = t => !t.startsWith('$');

/**
 * Every unique token in the catalog with the things needed to find its icon.
 * @returns {Map<string, {token: string, names: string[], wiki: string|null, types: Set<string>}>}
 */
export function catalogTokens(catalog) {
  const out = new Map();
  for (const c of catalog.catalog) for (const i of c.items) for (const t of i.tokens) {
    let e = out.get(t);
    if (!e) out.set(t, e = { token: t, names: [], wiki: null, types: new Set() });
    if (!e.names.includes(i.name)) e.names.push(i.name);
    if (i.wiki && !e.wiki) e.wiki = i.wiki;
    e.types.add(c.type);
  }
  return out;
}

// ───────────────────────────── source A: Jötunn ─────────────────────────────

const have = cmd => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;

async function fetchJotunn() {
  if (!ARGS.has('--refresh') && fs.existsSync(path.join(DOCS, 'data', 'objects', 'item-list.md'))) return 'cached';
  if (OFFLINE) throw new Error(`--offline but no Jötunn documentation in ${JOTUNN}`);
  fs.rmSync(JOTUNN, { recursive: true, force: true });
  fs.mkdirSync(JOTUNN, { recursive: true });
  if (have('git')) {
    log('source A: git sparse checkout');
    const git = (...a) => { const r = spawnSync('git', a, { cwd: JOTUNN, stdio: 'inherit' }); if (r.status) throw new Error('git ' + a.join(' ') + ' failed'); };
    fs.rmdirSync(JOTUNN);
    spawnSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', JOTUNN_REPO, JOTUNN], { stdio: 'inherit' });
    git('sparse-checkout', 'set', '--no-cone', ...DOC_PARTS.map(p => '/' + p + '/'));
    git('checkout');
    return 'git';
  }
  // DECISIONS (WP-02): no git on this machine → GitHub tarball, extract only the needed folders.
  log('source A: git not found, downloading the GitHub tarball (only the documentation folders are kept)');
  const res = await fetch(JOTUNN_TARBALL, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error('Jötunn tarball: HTTP ' + res.status);
  const bsd = /bsdtar/.test(spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout || '');
  const pats = DOC_PARTS.map(p => '*/' + p + '/*');
  const tarArgs = ['-xz', '-C', JOTUNN, '--strip-components=1', ...(bsd ? pats.flatMap(p => ['--include', p]) : ['--wildcards', ...pats])];
  const tar = spawn('tar', tarArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => tar.on('close', code => code ? fail(new Error('tar exit ' + code)) : ok(null)));
  await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), tar.stdin);
  await done;
  return 'tarball';
}

/** Rows look like `|Prefab<br><img src="../../images/<dir>/<file>.png">|AssetID|Token|English Name|Type|…`. */
const IMG = /<img src="\.\.\/\.\.\/images\/([a-z]+)\/([^"]+?)\.png">/i;

/**
 * @param {string} md
 * @returns {{prefab: string, image: string|null, token: string, name: string, type: string}[]}
 */
export function parseList(md) {
  const rows = [];
  const lines = md.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (!line.startsWith('|') || line.startsWith('|---') || lines[n + 1]?.startsWith('|---')) continue; // skip header rows
    const cells = line.split('|').slice(1, -1);
    if (cells.length < 4) continue;
    const m = cells[0].match(IMG);
    rows.push({ prefab: cells[0].replace(/<br>.*$/, '').trim(), image: m ? `${m[1]}/${m[2]}` : null, token: cells[2].trim(), name: cells[3].trim(), type: (cells[4] || '').trim() });
  }
  return rows;
}

/** Character list has no token column: `|Name<br><img …>|AssetID|Components|…`. */
export function parseCharacters(md) {
  const out = new Map();
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1] || '', m = first.match(IMG);
    if (m) out.set(normal(first.replace(/<br>.*$/, '')), `${m[1]}/${m[2]}`);
  }
  return out;
}

/** Lowercase and keep only letters and digits (spec A4). */
export const normal = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Builds the source-A lookup tables from the three Jötunn lists.
 * @param {{items: string, pieces: string, characters: string}} md
 */
export function jotunnIndex(md) {
  const byToken = new Map(), typeOf = new Map(), imageExists = new Set();
  for (const r of [...parseList(md.items), ...parseList(md.pieces)]) {
    const k = r.token.toLowerCase();
    if (r.type && !typeOf.has(k)) typeOf.set(k, r.type);
    if (r.image) { imageExists.add(r.image); if (!byToken.has(k)) byToken.set(k, r.image); }
  }
  const characters = parseCharacters(md.characters);
  for (const v of characters.values()) imageExists.add(v);
  return { byToken, typeOf, characters, imageExists };
}

/**
 * Source A for one token (spec A3–A4). Returns a Jötunn image path like `items/Club`, or null.
 * @param {string} token
 * @param {ReturnType<typeof jotunnIndex>} idx
 */
export function resolveA(token, idx) {
  const k = token.toLowerCase();
  if (DIRECT.test(token)) return idx.byToken.get(k) || null;
  if (CREATURE.test(token)) {
    const name = k.replace(CREATURE, '');
    return idx.byToken.get('$item_trophy_' + name) // trophy icon first: the character images are T-pose renders
      || idx.byToken.get(k)                         // creatures that are also items (fish): their item icon
      || idx.characters.get(normal(name))
      || null;
  }
  return null;
}

// ───────────────────────────── sources B and C ─────────────────────────────

let lastRequest = 0;
/** At most one request per second to B and C. */
async function politeFetch(url) {
  const wait = lastRequest + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  return fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
}

async function download(url, file) {
  try {
    const res = await politeFetch(url);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\//.test(type)) return `HTTP ${res.status} ${type}`.trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (await visibleShare(buf) < BLANK_SHARE) return 'blank image'; // must be a real, visible image
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    return null;
  } catch (e) { return String(/** @type {any} */ (e).message || e); }
}

const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/**
 * Source B. Returns {token: {url, file?}} for what it could find, and a note about the attempt.
 * The command table's exact markup is unknown (the site answered 403 to the build machine),
 * so the parser reads every table row and takes the first cell that equals the English name and
 * the first cell that looks like a spawn ID.
 */
async function sourceB(missing, notes) {
  const found = {};
  if (OFFLINE || !missing.length) return found;
  let html;
  try {
    const res = await politeFetch('https://www.valheim.tools/commands');
    if (!res.ok) { notes.push(`B (valheim.tools): commands page answered HTTP ${res.status}; skipped.`); return found; }
    html = await res.text();
  } catch (e) { notes.push(`B (valheim.tools): ${e}; skipped.`); return found; }
  const ids = new Map();
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = row.split(/<\/t[dh]>/i).map(strip).filter(Boolean);
    const id = cells.find(c => /^[A-Za-z][A-Za-z0-9_]+$/.test(c));
    for (const c of cells) if (id && c !== id && !ids.has(c.toLowerCase())) ids.set(c.toLowerCase(), id);
  }
  if (!ids.size) { notes.push('B (valheim.tools): no rows could be parsed; skipped.'); return found; }
  for (const e of missing) {
    const id = e.names.map(n => ids.get(n.toLowerCase())).find(Boolean);
    if (!id) continue;
    const url = `https://www.valheim.tools/icons/items/${id}.png`;
    const file = path.join(CACHE, 'B', id + '.png');
    const err = fs.existsSync(file) ? null : await download(url, file);
    found[e.token] = err ? { url, error: err } : { url, file };
  }
  notes.push(`B (valheim.tools): ${Object.keys(found).length} of ${missing.length} matched by name.`);
  return found;
}

const WIKI_API = 'https://valheim.weirdgloop.org/api.php?format=json&action=query&';

/** One wiki API query, 50 titles at most. Returns the parsed `query` part, or null. */
async function wikiQuery(params, titles, notes) {
  try {
    const res = await politeFetch(WIKI_API + params + '&titles=' + encodeURIComponent(titles.join('|')));
    if (!res.ok) { notes.push(`C (Valheim wiki): API answered HTTP ${res.status}.`); return null; }
    return (await res.json()).query || {};
  } catch (e) { notes.push(`C (Valheim wiki): ${e}.`); return null; }
}

/** Follows the API's `normalized` and `redirects` lists; remembers if a redirect pointed into a section. */
function follow(q, t) {
  const steps = [...(q.normalized || []), ...(q.redirects || [])];
  let section = false;
  for (let r; (r = steps.find(s => s.from === t));) { if (r.tofragment) section = true; t = r.to; }
  return { title: t, section };
}

/**
 * Source C: Weird Gloop pageimages (each page's lead image), 50 titles per request.
 * A redirect into a section of another page (e.g. "Grilled Neck Tail" → "Neck Tail#Grilled")
 * would give the other item's picture, so for those, and for pages without an image, the
 * file `File:<name>.png` is looked up instead.
 */
async function sourceC(missing, notes) {
  const found = {};
  if (OFFLINE || !missing.length) return found;
  const title = e => (e.wiki || e.names[0]).replaceAll('_', ' ');
  const take = async (e, src, how) => {
    const file = path.join(CACHE, 'C', normal(e.token) + '.png');
    const err = fs.existsSync(file) ? null : await download(src, file);
    found[e.token] = err ? { url: src, error: err, how } : { url: src, file, how };
  };
  const retry = [];
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const q = await wikiQuery('prop=pageimages&piprop=original&redirects=1', batch.map(title), notes);
    if (!q) continue;
    const pages = new Map(Object.values(q.pages || {}).map(p => [p.title, p]));
    for (const e of batch) {
      const f = follow(q, title(e)), src = pages.get(f.title)?.original?.source;
      if (src && !f.section) await take(e, src, 'page image'); else retry.push(e);
    }
  }
  const fileTitle = e => 'File:' + e.names[0].replace(/[:#]/g, '') + '.png';
  for (let i = 0; i < retry.length; i += 50) {
    const batch = retry.slice(i, i + 50);
    const q = await wikiQuery('prop=imageinfo&iiprop=url', batch.map(fileTitle), notes);
    if (!q) continue;
    const pages = new Map(Object.values(q.pages || {}).map(p => [p.title, p]));
    for (const e of batch) {
      const src = pages.get(follow(q, fileTitle(e)).title)?.imageinfo?.[0]?.url;
      if (src) await take(e, src, 'file');
    }
  }
  notes.push(`C (Valheim wiki): ${Object.keys(found).length} of ${missing.length} found.`);
  return found;
}

// ───────────────────────────── source E: glyph category ─────────────────────────────

/**
 * Which engraved glyph a token falls back to (spec E). Stat tokens use their own glyph,
 * named after the token.
 * @param {{token: string, types: Set<string>}} e
 * @param {string|undefined} jotunnType  Jötunn's item Type column, when the item is listed
 */
export function glyphFor(e, jotunnType) {
  if (isStat(e.token)) return e.token;
  const t = e.types;
  if (t.has('fish')) return 'fish';
  if (t.has('pickup')) return 'trophy';
  if (t.has('killHard') || CREATURE.test(e.token)) return 'creature';
  if (t.has('build')) return 'piece';
  if (/Weapon|Bow|Shield|Ammo/.test(jotunnType || '')) return 'weapon';
  if (/Helmet|Chest|Legs|Shoulder/.test(jotunnType || '')) return 'armour';
  if (t.has('eat') || /Consumable/.test(jotunnType || '')) return 'food';
  if (/^\$piece_/i.test(e.token)) return 'piece';
  return 'tool';
}

// ───────────────────────────── blank-image check ─────────────────────────────

/**
 * Below this share of clearly visible pixels (alpha > 64) an image counts as blank. Measured on
 * the Jötunn set: the thinnest real icons (arrows, spears) are 1.9 % and up; the blank ones are
 * 0–1.2 % (scattered particles or nothing at all).
 */
export const BLANK_SHARE = 0.015;

/** @param {string|Buffer} file @returns {Promise<number>} share 0–1 of pixels with alpha > 64 */
export async function visibleShare(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 64) n++;
  return n / (info.width * info.height);
}

// ───────────────────────────── treatments ─────────────────────────────

/**
 * Optional changes an override may ask for (`"treatment"` in overrides.json).
 * spectral: the boss's trophy in pale ghost blue, for the "Aspect of …" creatures (spectral copies
 * of earlier bosses). Jötunn's own Aspect renders are blank, and the wiki has no Aspect pages;
 * the tint keeps the Aspect row from looking like the trophy row.
 */
export const TREATMENTS = {
  /** @param {Buffer} buf */
  spectral: async buf => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const l = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255, v = 0.35 + 0.65 * l;
      data[i] = Math.round(120 * v + 20); data[i + 1] = Math.round(205 * v + 25); data[i + 2] = Math.round(215 * v + 35);
      data[i + 3] = Math.round(data[i + 3] * 0.88);
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  },
};

// ───────────────────────────── atlas ─────────────────────────────

/**
 * Private strings the atlas must never happen to spell: the character name in
 * fixtures/private/expected.json and the stem of each save file there. Read only, never printed
 * or written anywhere. Without fixtures/private (e.g. on someone else's machine) the list is empty.
 * @returns {string[]}
 */
export function privateStrings(dir = path.join(ROOT, 'fixtures', 'private')) {
  const out = new Set();
  try {
    const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
    const walk = (v, k = '') => { if (typeof v === 'string') { if (/name/i.test(k)) out.add(v); } else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
    walk(expected);
  } catch { /* no private fixture */ }
  try {
    for (const f of fs.readdirSync(dir)) if (/\.fch$/i.test(f)) {
      const stem = f.replace(/\.fch$/i, '');
      out.add(stem);
      for (const part of stem.split(/[_\s-]+/)) if (part.length >= 4 && !/^characters?$/i.test(part)) out.add(part);
    }
  } catch { /* no private folder */ }
  return [...out].filter(s => s.length >= 3);
}

/** Does the buffer, as raw bytes or as base64 text, contain any of the strings (any letter case)? */
export function containsAny(buf, strings) {
  if (!strings.length) return false;
  const texts = [buf.toString('base64').toLowerCase(), buf.toString('latin1').toLowerCase()];
  return strings.some(s => texts.some(t => t.includes(s.toLowerCase())));
}

/**
 * Packs images into a square-ish grid of CELL×CELL cells. Identical images share a cell.
 * @param {Map<string, {file: string, treatment?: string}>} fileOf token → absolute image file
 */
async function buildAtlas(fileOf) {
  const cellOfHash = new Map(), cellOf = new Map(), cells = [];
  for (const [token, { file, treatment }] of [...fileOf].sort(([a], [b]) => a.localeCompare(b))) {
    const buf = fs.readFileSync(file), h = sha1(buf) + (treatment || '');
    if (!cellOfHash.has(h)) { cellOfHash.set(h, cells.length); cells.push(treatment ? await TREATMENTS[treatment](buf) : buf); }
    cellOf.set(token, cellOfHash.get(h));
  }
  const cols = Math.ceil(Math.sqrt(cells.length)), rows = Math.ceil(cells.length / cols);
  const composites = await Promise.all(cells.map(async (buf, n) => ({
    input: await sharp(buf).resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png().toBuffer(),
    left: (n % cols) * CELL, top: Math.floor(n / cols) * CELL,
  })));
  const sheet = await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).png().toBuffer();
  // The single-file build carries the atlas as base64 text. By pure chance that text (or the raw
  // bytes) can spell a short private string, which a privacy grep would rightly flag. If it does,
  // encode again with a different effort setting (same quality, slightly different bytes).
  const secrets = privateStrings();
  let webp, effort, chance = 0;
  for (effort = 6; effort >= 0; effort--) {
    webp = await sharp(sheet).webp({ quality: WEBP_QUALITY, alphaQuality: 90, effort }).toBuffer();
    if (!containsAny(webp, secrets)) break;
    chance++;
  }
  if (effort < 0) throw new Error('atlas: every encoding contains a private string by chance; change WEBP_QUALITY');
  return { webp: /** @type {Buffer} */ (webp), effort, chance, cols, rows, count: cells.length, cellOf };
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const catalog = readJSON(path.join(ROOT, 'src', 'catalog.json'));
  const tokens = catalogTokens(catalog);
  const overrides = readJSON(path.join(ICONS, 'overrides.json'), {});
  const previous = readJSON(path.join(ICONS, 'sources.json'), { tokens: {} }).tokens || {};
  const notes = [];

  const how = await fetchJotunn();
  log('source A:', how, DOCS);
  const read = f => fs.readFileSync(path.join(DOCS, 'data', f), 'utf8');
  const idx = jotunnIndex({ items: read('objects/item-list.md'), pieces: read('pieces/piece-list.md'), characters: read('prefabs/character-list.md') });

  /** token → {source, image?, file?, url?, glyph?} */
  const result = {};
  for (const e of tokens.values()) {
    if (isStat(e.token)) continue;
    const img = resolveA(e.token, idx);
    if (img) result[e.token] = { source: 'A', image: img };
  }
  // Overrides win over the automatic match: each was looked at by hand (spec A5).
  for (const [token, o] of Object.entries(overrides)) {
    if (token.startsWith('_') || !o.jotunn) continue;
    if (!tokens.has(token)) { notes.push(`override ${token}: not a catalog token; ignored.`); continue; }
    if (!fs.existsSync(path.join(DOCS, 'images', o.jotunn + '.png'))) { notes.push(`override ${token}: ${o.jotunn} not found in Jötunn; ignored.`); continue; }
    if (result[token] && result[token].image !== o.jotunn) notes.push(`override ${token}: replaces automatic match ${result[token].image}.`);
    if (o.treatment && !TREATMENTS[o.treatment]) throw new Error(`override ${token}: unknown treatment ${o.treatment}`);
    result[token] = { source: 'A-override', image: o.jotunn, ...(o.treatment ? { treatment: o.treatment } : {}) };
  }

  // A few Jötunn images are blank (fully transparent, or particle-only renders such as every
  // "Aspect of …"). A blank icon is no icon: treat it as not found, so B and C get a chance.
  for (const [token, r] of Object.entries(result)) {
    const visible = await visibleShare(path.join(DOCS, 'images', r.image + '.png'));
    if (visible < BLANK_SHARE) { notes.push(`A: ${r.image} for ${token} is blank (${(visible * 100).toFixed(1)}% visible pixels); tried B/C instead.`); delete result[token]; }
  }

  // B and C only for tokens still without a bundled icon. Re-use earlier downloads (incremental).
  let missing = [...tokens.values()].filter(e => !isStat(e.token) && !result[e.token]);
  for (const e of [...missing]) {
    const p = previous[e.token];
    if (p && (p.source === 'B' || p.source === 'C') && p.file && fs.existsSync(path.join(CACHE, p.file))) {
      result[e.token] = { source: p.source, file: p.file, url: p.url, how: p.how };
      missing = missing.filter(m => m !== e);
    }
  }
  const hot = {};
  for (const [name, fn] of /** @type {const} */ ([['B', sourceB], ['C', sourceC]])) {
    const found = await fn(missing, notes);
    for (const [token, f] of Object.entries(found)) {
      if (f.file) { result[token] = { source: name, file: path.relative(CACHE, f.file), url: f.url, how: f.how }; delete hot[token]; }
      else if (!hot[token]) hot[token] = { source: name, url: f.url, error: f.error };
    }
    missing = missing.filter(e => !result[e.token]);
  }
  // D: a URL without a download → hotlink. E: everything else → glyph.
  for (const e of tokens.values()) {
    if (result[e.token]) continue;
    const glyph = glyphFor(e, idx.typeOf.get(e.token.toLowerCase()));
    if (hot[e.token]) result[e.token] = { source: 'D', url: hot[e.token].url, via: hot[e.token].source, error: hot[e.token].error, glyph };
    else result[e.token] = { source: 'E', glyph };
  }

  // Atlas.
  const fileOf = new Map();
  for (const [token, r] of Object.entries(result)) {
    if (r.image) fileOf.set(token, { file: path.join(DOCS, 'images', r.image + '.png'), treatment: r.treatment });
    else if (r.file) fileOf.set(token, { file: path.join(CACHE, r.file) });
  }
  const atlas = await buildAtlas(fileOf);
  if (atlas.webp.length >= ATLAS_LIMIT) throw new Error(`atlas is ${atlas.webp.length} bytes, over 4 MB`);
  fs.mkdirSync(ICONS, { recursive: true });
  fs.writeFileSync(path.join(ICONS, 'atlas.webp'), atlas.webp);

  // icon-map.json: token → {cell} | {hotlink} | {glyph}. Item-level fallbacks (items with no
  // token at all) are decided at runtime from the collection type.
  const icons = {};
  for (const token of [...tokens.keys()].sort()) {
    const r = result[token];
    icons[token] = atlas.cellOf.has(token) ? { cell: atlas.cellOf.get(token) } : r.url ? { hotlink: r.url, glyph: r.glyph } : { glyph: r.glyph }; // a hotlink keeps a glyph for when it fails to load
  }
  const usedB = Object.values(result).some(r => r.source === 'B' || r.via === 'B');
  const usedC = Object.values(result).some(r => r.source === 'C' || r.via === 'C');
  const map = { cell: CELL, cols: atlas.cols, rows: atlas.rows, cells: atlas.count, sources: { jotunn: true, valheimTools: usedB, wiki: usedC }, icons };
  fs.writeFileSync(path.join(ICONS, 'icon-map.json'), JSON.stringify(map) + '\n');

  const sources = { _about: 'Where each token\'s icon came from (written by tools/harvest-icons.mjs; read back on re-runs so B/C are not fetched again).', tokens: Object.fromEntries(Object.keys(icons).map(t => [t, result[t]])) };
  fs.writeFileSync(path.join(ICONS, 'sources.json'), JSON.stringify(sources, null, 1) + '\n');

  // coverage.md
  const all = Object.keys(icons), iconBearing = all.filter(t => !isStat(t));
  const count = s => Object.values(result).filter(r => r.source === s).length;
  const bundled = iconBearing.filter(t => 'cell' in icons[t]).length;
  const list = (s, f) => all.filter(t => result[t].source === s).map(t => `| \`${t}\` | ${tokens.get(t)?.names.join(' / ')} | ${f(result[t])} |`).join('\n') || '| — | — | — |';
  const md = `# Icon coverage

Written by \`node tools/harvest-icons.mjs\` on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.

**${bundled} of ${iconBearing.length}** icon-bearing tokens have a bundled icon. ${all.length - iconBearing.length} death-cause and tree tokens always use their own glyph.
Atlas: ${atlas.count} unique cells of ${CELL} px (${atlas.cols} × ${atlas.rows}), ${(atlas.webp.length / 1024 / 1024).toFixed(2)} MB WebP at quality ${WEBP_QUALITY}, encoder effort ${atlas.effort}.

| Source | Tokens |
| --- | --- |
| A · Jötunn documentation, matched automatically | ${count('A')} |
| A · Jötunn documentation, via \`overrides.json\` | ${count('A-override')} |
| B · valheim.tools | ${count('B')} |
| C · Valheim wiki | ${count('C')} |
| D · runtime hotlink | ${count('D')} |
| E · glyph | ${count('E')} |

## Notes from this run

${notes.map(n => '- ' + n).join('\n') || '- none'}

## Not from Jötunn's automatic match

| Token | Catalog name | Source |
| --- | --- | --- |
${list('A-override', r => 'Jötunn `' + r.image + '` (override' + (r.treatment ? ', ' + r.treatment + ' tint' : '') + ')')}
${list('B', r => 'valheim.tools ' + r.url)}
${list('C', r => 'Valheim wiki ' + (r.how || 'page image') + ' ' + r.url)}

## Hotlinks

| Token | Catalog name | URL |
| --- | --- | --- |
${list('D', r => r.url + ' (download failed: ' + r.error + ')')}

## Glyphs

| Token | Catalog name | Glyph |
| --- | --- | --- |
${list('E', r => r.glyph)}

Items with no token at all (the three Storage Displays in The Carpenter) get the collection's glyph at runtime.
`;
  fs.writeFileSync(path.join(ICONS, 'coverage.md'), md);
  log(`bundled ${bundled}/${iconBearing.length}; A ${count('A')}, overrides ${count('A-override')}, B ${count('B')}, C ${count('C')}, hotlinks ${count('D')}, glyphs ${count('E')}; atlas ${atlas.webp.length} bytes, ${atlas.count} cells`);
  if (atlas.chance) log(`atlas: re-encoded ${atlas.chance}× (effort ${atlas.effort}) to avoid a chance match with a private string`);
  notes.forEach(n => log(n));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('[icons] failed:', e); process.exit(1); });
}
