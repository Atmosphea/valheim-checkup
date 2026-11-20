// @ts-check
/**
 * WP-18C (Paul, WP-18 item 18): the "Played on" line, from the save's world-key dictionary
 * (`save-extras.js` extraB, lifetime bucket): keys "name value" → seconds played under them.
 * Pure, so the unit tests check it without a page.
 */
const fmt = (/** @type {number} */ n) => Math.round(n).toLocaleString();
const MODIFIERS = /** @type {Record<string, string>} */ ({
  enemydamage: 'Enemy damage', playerdamage: 'Player damage', enemyspeedsize: 'Enemy speed and size', enemyleveluprate: 'Enemy level-up rate',
  resourcerate: 'Resource rate', eventrate: 'Raid rate', staminarate: 'Stamina use', movestaminarate: 'Movement stamina',
  staminaregenrate: 'Stamina regeneration', skillgainrate: 'Skill gain', skillreductionrate: 'Skill loss on death',
  carryweightrate: 'Carry weight', foodrate: 'Food duration', durabilityrate: 'Durability', eitrrate: 'Eitr', adrenalinerate: 'Adrenaline',
});
const PRESET = /** @type {Record<string, string>} */ ({ combat: 'Combat', deathpenalty: 'Death penalty', resources: 'Resources', raids: 'Raids', portals: 'Portals' });
const words = (/** @type {string} */ v) => v.replace(/^(very|much)(?=.)/, '$1 ');

/**
 * The world settings played under, from the world-key dictionary (key "name value" → seconds).
 * Defaults are left out; a setting played under more than one value lists them, most time first.
 * @param {Record<string, number>} keys @returns {{parts: string[], hours: number} | null}
 */
export function playedOn(keys) {
  /** @type {Map<string, Map<string, number>>} */ const seen = new Map();
  const add = (/** @type {string} */ label, /** @type {string} */ value, /** @type {number} */ s) => {
    if (!seen.has(label)) seen.set(label, new Map());
    const m = /** @type {Map<string, number>} */ (seen.get(label)); m.set(value, Math.max(m.get(value) || 0, s));
  };
  let hours = 0;
  for (const [key, s] of Object.entries(keys)) {
    const [name, ...rest] = key.trim().split(' ');
    const value = rest.join(' ');
    if (name === 'preset') {
      hours = Math.max(hours, s / 3600);
      for (const part of value.split(':')) {
        const [k, v] = part.split('_');
        if (PRESET[k] && v && v !== 'default' && v !== 'normal') add(PRESET[k], words(v), s);
      }
      continue;
    }
    const label = MODIFIERS[name]; // lower-case keys only: the "EnemyDamage default" spellings are older duplicates
    if (!label || !value || value === 'default' || !/^\d+(\.\d+)?$/.test(value)) continue;
    add(label, value + ' %', s);
  }
  if (!seen.size) return null;
  const parts = [];
  for (const [label, values] of seen) {
    const list = [...values].sort((a, b) => b[1] - a[1]);
    const sep = PRESET[Object.keys(PRESET).find(k => PRESET[k] === label) || ''] ? ': ' : ' ';
    parts.push(label + sep + (list.length === 1 ? list[0][0] : list.map(([v, s]) => `${v} (${fmt(s / 3600)} h)`).join(' / ')));
  }
  // presets first (Combat, Resources…), then the numbers
  parts.sort((a, b) => Number(!/: /.test(a)) - Number(!/: /.test(b)));
  return { parts, hours };
}

