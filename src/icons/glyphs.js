// @ts-check
/**
 * Engraved glyphs (WP-02 source E): simple line art, drawn with `currentColor` strokes on a
 * 24 × 24 grid so they take the ink colour of whatever page they are printed on.
 *
 * - Eight category glyphs, used when no picture of an item exists.
 * - One glyph for each of the 16 death causes and each of the 10 tree species. These always
 *   use their glyph (they are game statistics, not items, so no picture exists).
 *
 * Each value is the inside of an <svg viewBox="0 0 24 24">. Keys of the death and tree glyphs
 * are the catalog tokens exactly.
 */

/** @type {Record<string, string>} */
export const CATEGORY_GLYPHS = {
  weapon: '<path d="M19 4.5 9.5 14M19 4.5h-3.2M19 4.5v3.2M15.8 4.5 7.6 12.7M19 7.7l-8.2 8.2"/><path d="M6 12.5l5.5 5.5M8.2 15.8 4.6 19.4"/><circle cx="4" cy="20" r=".9"/>',
  armour: '<path d="M12 3.2 19 6v5.2c0 4.6-3.1 8.1-7 9.6-3.9-1.5-7-5-7-9.6V6z"/><path d="M12 3.2v17.6M5.4 10.6h13.2"/>',
  tool: '<path d="M13.5 4.5l6 6-2.2 2.2-6-6z"/><path d="M12.4 8.7 4.2 16.9l2.9 2.9 8.2-8.2"/><path d="M15.4 3.4l1.8-.6 4 4-.6 1.8"/>',
  food: '<path d="M3.5 12.5h17a8.5 7 0 0 1-17 0z"/><path d="M8 20.5h8"/><path d="M9 9.5c-1-1.3 1-2.2 0-3.6M12.5 9.5c-1-1.3 1-2.2 0-3.6M16 9.5c-1-1.3 1-2.2 0-3.6"/>',
  piece: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5v11h13v-11"/><path d="M10 20.5v-5.5h4v5.5M5.5 14.5h3M15.5 14.5h3"/>',
  creature: '<path d="M12 12.5c-3.3 0-5.6 3.3-5.6 5.6 0 1.8 1.8 2.4 5.6 2.4s5.6-.6 5.6-2.4c0-2.3-2.3-5.6-5.6-5.6z"/><ellipse cx="5.2" cy="10.4" rx="1.6" ry="2.1"/><ellipse cx="9.2" cy="6.4" rx="1.7" ry="2.3"/><ellipse cx="14.8" cy="6.4" rx="1.7" ry="2.3"/><ellipse cx="18.8" cy="10.4" rx="1.6" ry="2.1"/>',
  trophy: '<path d="M7.5 15h9l-1.5 5.5h-6z"/><path d="M12 15V9.5M12 11.5 8 7.5V3.5M8 7.5 5.5 5.5M12 11.5l4-4V3.5M16 7.5l2.5-2"/><circle cx="12" cy="9" r="1.4"/>',
  fish: '<path d="M2.8 12c3.8-5 10.2-5 14.2 0-4 5-10.4 5-14.2 0z"/><path d="M17 12l4.2-3.4v6.8z"/><circle cx="7" cy="11" r=".8"/><path d="M10.5 9.2c.9 1.8.9 3.8 0 5.6"/>',
};

/** One per death cause in "Are You Alright?". @type {Record<string, string>} */
export const DEATH_GLYPHS = {
  // Three claw slashes.
  DeathByEnemyHit: '<path d="M6 4.5c3.5 4 5.5 9 6 15M10.5 3.5c3 4.5 4.5 9.5 4.5 15.5M15 4c2.5 4.2 3.7 8.6 3.5 13.5"/>',
  // A ledge and a body-length drop.
  DeathByFall: '<path d="M3 6.5h7.5v3"/><circle cx="15.5" cy="5.5" r="1.4"/><path d="M15.5 8v6M12.5 11.5l3 2.5 3-2.5"/><path d="M12 17.5l3.5 3.5 3.5-3.5"/><path d="M3 21h18"/>',
  // Waves closing over, with bubbles rising.
  DeathByDrowning: '<path d="M2.5 14c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0"/><path d="M2.5 18.5c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0"/><circle cx="11" cy="9.5" r="1.3"/><circle cx="13.5" cy="5.5" r="1"/><circle cx="10.5" cy="3" r=".7"/>',
  // A flame.
  DeathByBurning: '<path d="M12 3c1 3.4 5.5 5.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4 2.4-5.2.2 1.8.9 2.8 1.9 3.3C10.6 8.6 11 5.6 12 3z"/><path d="M12 20.5c-1.7 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.6 2.2-4 .9 1.4 3.4 2.4 3.4 4 0 1.6-1.1 2.8-2.8 2.8z"/>',
  // A snowflake.
  DeathByFreezing: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.6 4.2 12 6.4l2.4-2.2M9.6 19.8l2.4-2.2 2.4 2.2M4.6 10.6l3.1-1 .5-3.2M19.4 13.4l-3.1 1-.5 3.2M4.6 13.4l3.1 1 .5 3.2M19.4 10.6l-3.1-1-.5-3.2"/>',
  // A drop of venom with a small skull mark.
  DeathByPoisoned: '<path d="M12 2.8C9.6 7 6.5 10.3 6.5 14.3a5.5 5.5 0 0 0 11 0C17.5 10.3 14.4 7 12 2.8z"/><circle cx="10.3" cy="13.6" r=".9"/><circle cx="13.7" cy="13.6" r=".9"/><path d="M10.6 17h2.8"/>',
  // Rising curls of smoke.
  DeathBySmoke: '<path d="M7 21c-2.5-2.4 2.4-4.2 0-6.8s1.8-4.6 0-7M12 21c-2.5-2.4 2.4-4.2 0-6.8s1.8-4.6 0-7.2-.2-3 1-4.2M17 21c-2.5-2.4 2.4-4.2 0-6.8s1.8-4.6 0-7"/>',
  // The flat world's rim with the sea pouring off it.
  DeathByEdgeOfWorld: '<path d="M2.5 9.5h11"/><path d="M13.5 9.5c2 0 2.6 2.8 2.6 6.5v5.5M15.6 9.6c2.4.3 3 3.3 3 7v4.9M17.4 9.9c2.6.6 3.2 3.9 3.2 7.6v3.5"/><path d="M4.5 13c1.4-.9 2.6-.9 4 0s2.6.9 4 0"/><circle cx="9" cy="5" r="1.3"/>',
  // A tree trunk toppling, with a motion arc.
  DeathByTree: '<path d="M6.5 20.5 18 7.5M8.6 21.2l11.2-12.6"/><path d="M15.8 8.3l-1.6-3.2M17.9 11.1l3.3-.6"/><path d="M4.5 9.5a8 8 0 0 1 6-5.5"/><path d="M3 21h8"/>',
  // A ballista: bow arms and a bolt.
  DeathByTurret: '<path d="M4 6c4 1.5 4 10.5 0 12"/><path d="M4 6l4 6-4 6"/><path d="M8 12h13M18.5 9.8 21 12l-2.5 2.2"/><path d="M7 20.5h6l-2-3.5"/>',
  // Icicles hanging from a cave roof.
  DeathByStalagtite: '<path d="M2.5 3.5h19"/><path d="M4.5 3.5l1.6 9 1.6-9M9.5 3.5l2 15 2-15M15.5 3.5l1.5 7.5 1.5-7.5"/><path d="M11.5 21v.01"/>',
  // A catapult arm flinging a stone.
  DeathByCatapult: '<path d="M3 20.5h12M5 20.5l3-6 3 6M8 14.5 17.5 5"/><circle cx="19" cy="4" r="1.8"/><path d="M15 20.5v-2.5h-3"/><circle cx="6" cy="20.5" r=".01"/>',
  // Boiling, steaming water.
  DeathByAshlandsOcean: '<path d="M2.5 15c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0"/><path d="M2.5 19.5c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0"/><path d="M7 11c-1.2-1.6 1.2-2.6 0-4.4M12 10.5c-1.2-1.6 1.2-2.6 0-4.4s.8-2.4 0-3.6M17 11c-1.2-1.6 1.2-2.6 0-4.4"/>',
  // The obliterator: a chest struck by lightning.
  DeathByIncinerator: '<path d="M4 12h16v8.5H4zM4 15h16"/><path d="M12.8 2.5 9.5 7.5h3.5l-2.5 4"/><path d="M10.5 17.5h3"/>',
  // A gate tower with its bridge half lowered on a chain.
  DeathByDrawBridge: '<path d="M2.5 21V5.5h2v-2h2v2h2V21"/><path d="M4.2 21v-4a1.3 1.3 0 0 1 2.6 0v4"/><path d="M8.5 19.5 20.5 13M8.5 17.6l11.3-6.1"/><path d="M8.5 7.5 20 12.2" stroke-dasharray="1.2 1.4"/><path d="M8.5 21h13"/>',
  // A lava pool with a rising bubble and drip.
  DeathByAshlandsLava: '<path d="M2.5 17.5c2.5-2.2 5-2.2 7.5 0s5 2.2 7.5 0c1.4-1.2 2.6-1.6 4-1.4"/><path d="M3 21h18"/><circle cx="10" cy="11" r="2"/><circle cx="15.5" cy="7" r="1.2"/><path d="M6.5 13c.4-1.6 1.8-2 1.8-2"/>',
};

/** One per tree species in "That Can't Be an Accident". @type {Record<string, string>} */
export const TREE_GLYPHS = {
  // Fir: three stacked tiers.
  TreeFir: '<path d="M12 2.5 7.5 9h9z"/><path d="M12 7 6 14h12z"/><path d="M12 11.5 4.5 19.5h15z"/><path d="M12 19.5v2.5"/>',
  // Oak: broad round crown, thick trunk.
  TreeOak: '<path d="M7 15.5a4 4 0 0 1-1.5-7.6 4.5 4.5 0 0 1 6.5-4.2 4.5 4.5 0 0 1 6.5 4.2A4 4 0 0 1 17 15.5z"/><path d="M10.5 21.5c.6-2 .6-4 .4-6M13.5 21.5c-.6-2-.6-4-.4-6M11 18l-2 -1.5M13 17.5l2-1.5"/>',
  // Pine: tall narrow crown with drooping branch lines.
  TreePine: '<path d="M12 2v20"/><path d="M12 5 9 8M12 5l3 3M12 9l-4 3.5M12 9l4 3.5M12 13l-5 4M12 13l5 4"/>',
  // Ashlands tree: dead, gnarled, bare branches.
  TreeAshlands: '<path d="M11.5 21.5c.5-3.5 0-6.5-1-9M12.5 21.5c.2-3.8 1.2-6.6 2.6-9"/><path d="M10.5 12.5C8 10.5 7 8 7.5 4.5M10 10l-4-1.5M15.1 12.5c2.3-1.6 3.4-4.4 3-7.5M16.6 9.5l2.9-.8M12.6 15.5c.1-4 .2-7.4-.6-11"/>',
  // Yggdrasil shoot: a sprouting curl with two leaves.
  TreeYggdrasilShoot: '<path d="M12 21.5c-.5-5 2-8 0-11.5-1.4-2.5-4-2.3-4-.3s2.6 2.2 3.2.4"/><path d="M12.2 15c2-3 5.5-3.5 7.5-2.5-1 2.5-4.5 4-7.5 2.5z"/><path d="M11.8 18.2c-1.8-2-4.8-2.2-6.5-1.3 1 2 4 3 6.5 1.3z"/><path d="M8 21.5h8"/>',
  // Swamp tree: drooping crown, splayed roots.
  TreeSwamp: '<path d="M4 9.5C5 5 9 3 12 3s7 2 8 6.5"/><path d="M5.5 8.5v5M9 6v4M15 6v4M18.5 8.5v5"/><path d="M12 3.5v13.5"/><path d="M12 17c-2 .5-3.5 2.5-4.5 4.5M12 17c2 .5 3.5 2.5 4.5 4.5M12 17v4.5M3.5 21.5h17"/>',
  // Beech: smooth upright oval crown on a slim trunk.
  TreeBeech: '<ellipse cx="12" cy="9" rx="6" ry="6.5"/><path d="M12 22V7.5M12 12.5 9 9.5M12 10.5l2.8-2.8"/><path d="M9.5 22h5"/>',
  // Birch: thin striped trunk with a small light crown.
  TreeBirch: '<path d="M11.2 22V11.5M12.8 22V11.5"/><path d="M11.2 13.5h1M12 16.2h.8M11.2 19h1"/><path d="M12 11.5C9.6 10 9 7.6 9.5 5.5 10 3.2 11 2 12 2s2 1.2 2.5 3.5c.5 2.1-.1 4.5-2.5 6z"/><path d="M12 11.5V5"/><path d="M8.5 22h7"/>',
  // Snow fir: tiered fir with snow on each tier.
  TreeSnowFir: '<path d="M12 2.5 7.5 9h9z"/><path d="M12 7 6 14h12z"/><path d="M12 11.5 4.5 19.5h15z"/><path d="M12 19.5v2.5"/><path d="M8.8 9h1.5M13.7 9h1.5M7.4 14h2M14.6 14h2M5.6 19.5h2.4M16 19.5h2.4"/><circle cx="4" cy="5" r=".6"/><circle cx="20" cy="7.5" r=".6"/>',
  // Snow pine: narrow pine with falling snowflakes.
  TreeSnowPine: '<path d="M12 4v18"/><path d="M12 7l-3 3M12 7l3 3M12 11l-4 3.5M12 11l4 3.5M12 15l-5 4M12 15l5 4"/><path d="M4 4.5v3M2.5 6h3M19.5 2.5v3M18 4h3M19.8 11.2v2M18.8 12.2h2"/>',
};

/** Every glyph by key. */
export const GLYPHS = { ...CATEGORY_GLYPHS, ...DEATH_GLYPHS, ...TREE_GLYPHS };

/** Which category glyph a collection falls back to when one of its items has no token at all. */
export const COLLECTION_GLYPH = { craft: 'tool', build: 'piece', eat: 'food', pickup: 'trophy', killHard: 'creature', killAny: 'creature', fish: 'fish', stat: 'creature' };

/**
 * The full <svg> for a glyph.
 * @param {string} key
 * @returns {string}
 */
export function glyphSvg(key) {
  const body = GLYPHS[key] || CATEGORY_GLYPHS.tool;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${body}</svg>`;
}
