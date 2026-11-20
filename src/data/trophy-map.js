// @ts-check
/**
 * Paul, WP-17 item 26: trophy facts. `trophy-drops.json` (Valheim Wiki "Trophies" page,
 * CC BY-SA 3.0) is keyed by the game's prefab id (`TrophyFader`); the catalog names trophies by
 * their save token (`$item_trophy_fader`). This maps one to the other. Pure (the data is passed
 * in), so unit tests can check every catalog trophy without a bundler.
 */

/** Tokens whose prefab id is not the token's own name with the underscores dropped. */
const ALIAS = {
  $item_trophy_bonemaw: 'TrophyBonemawSerpent',
  $item_trophy_brutebro: 'TrophyGoblinBruteBrosBrute',
  $item_trophy_shamanbro: 'TrophyGoblinBruteBrosShaman',
  $item_trophy_elder: 'TrophyTheElder',
  $enemy_kvastur: 'TrophyKvastur',
};

const norm = (/** @type {string} */ s) => s.toLowerCase().replace(/_/g, '');

/**
 * The prefab id for a catalog trophy token, or null.
 * @param {string} token @param {Record<string, unknown>} trophies the JSON's `trophies` object
 */
export function prefabFor(token, trophies) {
  const alias = /** @type {Record<string, string>} */ (ALIAS)[token];
  if (alias) return alias in trophies ? alias : null;
  const m = /^\$item_trophy_(.+)$/.exec(token);
  if (!m) return null;
  const want = norm(m[1]);
  return Object.keys(trophies).find(p => norm(p.replace(/^Trophy/, '')) === want) ?? null;
}

/**
 * Drop chance and usage for an item's tokens, or null when the data has no entry (show nothing).
 * With no item-specific use, the first shared use ("Item Stand decoration") is given.
 * @param {string[]} tokens
 * @param {{ trophies: Record<string, { creature: string, dropChance: string, usage: string[] }>, sharedUsage?: string[] }} data
 * @returns {{ prefab: string, creature: string, dropChance: string, usage: string[], shared: boolean } | null}
 */
export function trophyFacts(tokens, data) {
  for (const t of tokens) {
    const p = prefabFor(t, data.trophies);
    if (!p) continue;
    const e = data.trophies[p];
    const own = Array.isArray(e.usage) ? e.usage.filter(Boolean) : [];
    const shared = !own.length && !!data.sharedUsage?.length;
    return { prefab: p, creature: e.creature, dropChance: e.dropChance, usage: own.length ? own : shared ? [/** @type {string[]} */ (data.sharedUsage)[0]] : [], shared };
  }
  return null;
}
