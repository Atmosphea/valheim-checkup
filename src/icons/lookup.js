// @ts-check
/**
 * Pure icon lookups (no DOM, no bundler imports), shared by src/icons/icons.js and the unit tests.
 */
import { COLLECTION_GLYPH } from './glyphs.js';
import { STRINGS } from '../strings.js';

/** @typedef {{cell: number} | {hotlink: string, glyph: string} | {glyph: string}} IconEntry */
/** @typedef {{tokens: string[], type: string}} ItemInfo */

/**
 * Item id → tokens and collection type, read from the same inlined catalog app.js reads.
 * The Hunter is a copy app.js makes of The Master Hunter, with ids `The Hunter:<order>`.
 * @param {any} catalog
 * @returns {Map<string, ItemInfo>}
 */
export function itemIndex(catalog) {
  const byId = new Map();
  for (const c of catalog.catalog) for (const i of c.items) if (!byId.has(i.id)) byId.set(i.id, { tokens: i.tokens, type: c.type });
  const hard = catalog.catalog.find(c => c.type === 'killHard');
  for (const i of hard?.items || []) byId.set('The Hunter:' + i.order, { tokens: i.tokens, type: 'killAny' });
  return byId;
}

/**
 * The icon for one item: the first token with a bundled icon, else the first with a hotlink,
 * else the first token's glyph; an item with no token gets its collection's glyph.
 * @param {ItemInfo|undefined} item
 * @param {Record<string, IconEntry>} icons  icon-map.json `icons`
 * @returns {IconEntry}
 */
export function iconFor(item, icons) {
  const entries = (item?.tokens || []).map(t => icons[t]).filter(Boolean);
  return entries.find(e => 'cell' in e) || entries.find(e => 'hotlink' in e) || entries[0]
    || { glyph: COLLECTION_GLYPH[/** @type {keyof typeof COLLECTION_GLYPH} */ (item?.type)] || 'tool' };
}

/** Every distinct host that icons are hotlinked from. @param {Record<string, IconEntry>} icons */
export function hotlinkHosts(icons) {
  const hosts = new Set();
  for (const e of Object.values(icons)) if ('hotlink' in e) { try { hosts.add(new URL(e.hotlink).host); } catch { /* skip */ } }
  return [...hosts].sort();
}

/** The help-text privacy sentence, or '' when nothing is hotlinked (WP-02 step 5). @param {Record<string, IconEntry>} icons */
export function hotlinkPrivacyText(icons) {
  const hosts = hotlinkHosts(icons);
  return hosts.length ? STRINGS.iconHotlinkPrivacy.replace('{host}', hosts.join(' and ')) : '';
}
