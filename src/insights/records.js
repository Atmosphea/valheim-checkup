// @ts-check
/**
 * WP-18C (Paul, WP-18 items 18–19): two sections added to Highlights, both modes.
 *
 *   Bosses          one big square tile per boss (trophy icon, name, kills), dim when undefeated;
 *                   the lifetime boss totals; one quiet line on what the save doesn't record;
 *                   a "Played on" line with the world settings the Viking played under.
 *   Viking records  lifetime stats shown nowhere else, in five groups, big number left.
 *
 * Every number is read straight from the save:
 *   - kills, stats: core.js's own parse (app.js keeps it in localStorage, `valheim-checkup:v1:<id>`),
 *     lifetime bucket 0, the bucket Highlights already reads ('raw');
 *   - world settings: `save-extras.js`, which walks the file once more for the dictionary core.js
 *     skips, read from the file at load time and kept as a small summary in this browser.
 *
 * No per-frame work: the sections are built on `app:render` for Highlights only (registered before
 * the ink wash, so they ink in with the rest of the page), and the save is parsed once per load.
 * app.js, core.js and their markup are unchanged; the new sections are inserted before the
 * `.champions` list and carry no ids the app or the parity tests read.
 */
import { on } from '../bus.js';
import { readSaveExtras } from '../data/save-extras.js';
import { playedOn } from './played-on.js';
import { iconElement } from '../icons/icons.js';
import map from '../icons/icon-map.json';
import './records.css';

const DATA = /** @type {{statNames: string[]}} */ (JSON.parse(document.getElementById('catalogData')?.textContent || '{"statNames":[]}'));
const fmt = (/** @type {number} */ n) => Math.round(n).toLocaleString();
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);

/** The bosses, in the game's order. Kills: lifetime `enemy[0]` of the token (the Master Hunter's tokens). */
export const BOSSES = [
  { name: 'Eikthyr', token: '$enemy_eikthyr', trophy: '$item_trophy_eikthyr' },
  { name: 'The Elder', token: '$enemy_gdking', trophy: '$item_trophy_elder' },
  { name: 'Bonemass', token: '$enemy_bonemass', trophy: '$item_trophy_bonemass' },
  { name: 'Moder', token: '$enemy_dragon', trophy: '$item_trophy_dragonqueen' },
  { name: 'Yagluth', token: '$enemy_goblinking', trophy: '$item_trophy_goblinking' },
  { name: 'The Queen', token: '$enemy_seekerqueen', trophy: '$item_trophy_seekerqueen' },
  { name: 'Fader', token: '$enemy_fader', trophy: '$item_trophy_fader' },
  { name: 'Brenna', token: '$enemy_skeletonfire', trophy: '$item_trophy_skeleton_hildir', hildir: true },
  { name: 'Geirrhafa', token: '$enemy_fenringcultist_hildir', trophy: '$item_trophy_cultist_hildir', hildir: true },
  { name: 'Zil & Thungr', token: '$enemy_goblinbrute_hildircombined', trophy: '$item_trophy_brutebro', hildir: true },
];

/** Lifetime boss totals (stat name → label). These count the seven main bosses, not Hildir's. */
const BOSS_TOTALS = [
  ['BossKills', 'boss kills'],
  ['BossLastHits', 'bosses you landed the last hit on'],
  ['BossKillSolo', 'boss kills alone'],
  ['BossKillMultiplayer', 'boss kills with others'],
];

/**
 * Viking records: stat → label, by group. Only stats not shown anywhere else (Skills & travel has
 * deaths, builds, crafts, upgrades and the distances), only plain meanings, only non-zero values.
 * `h`: seconds shown as hours.
 * @type {[string, [string, string, ('h')?][]][]}
 */
export const RECORD_GROUPS = [
  ['Combat', [
    ['EnemyHits', 'enemy hits'], ['EnemyKills', 'enemies killed'], ['EnemyKillsLastHits', 'kills where you landed the last hit'],
    ['HitsTakenEnemies', 'hits taken from enemies'], ['PlayerHits', 'hits on other players'], ['PlayerKills', 'players killed'],
    ['HitsTakenPlayers', 'hits taken from players'], ['ArrowsShot', 'arrows shot'], ['SkeletonSummons', 'skeletons summoned'],
    ['UseGuardianPower', 'guardian powers used'], ['SetGuardianPower', 'guardian powers chosen'],
    ['UsePowerEikthyr', "Eikthyr's power used"], ['UsePowerElder', "The Elder's power used"], ['UsePowerBonemass', "Bonemass's power used"],
    ['UsePowerModer', "Moder's power used"], ['UsePowerYagluth', "Yagluth's power used"], ['UsePowerQueen', "The Queen's power used"],
    ['UsePowerAshlands', "Fader's power used"],
    ['TrapArmed', 'traps armed'], ['TrapTriggered', 'traps triggered'], ['TurretAmmoAdded', 'times ammo was loaded into a turret'],
    ['TurretTrophySet', 'trophies set in a turret'], ['LeviathanSink', 'Leviathans sunk'], ['LavaLeviathanSink', 'lava Leviathans sunk'],
  ]],
  ['Travel & world', [
    ['Jumps', 'jumps'], ['PortalsUsed', 'portals used'], ['PortalDungeonIn', 'dungeons entered'], ['PortalDungeonOut', 'dungeons left'],
    ['TimeInBase', 'hours in base', 'h'], ['TimeOutOfBase', 'hours out of base', 'h'], ['Sleep', 'sleeps'],
    ['WorldLoads', 'world loads'], ['PlayerSpawn', 'times you spawned'], ['DoorsOpened', 'doors opened'], ['DoorsClosed', 'doors closed'],
    ['RavenAppear', 'Raven appearances'], ['RavenTalk', 'times the Raven talked'], ['RavenHits', 'times you hit the Raven'],
    ['ConsecutiveDaysSurvivedMax', 'most days survived in a row'], ['ConsecutiveDaysSurvived', 'days survived in a row now'],
    ['TreasureBuriedFound', 'buried treasures found'], ['TreasureDungeonFound', 'dungeon treasures found'], ['TreasureLocationFound', 'treasure locations found'],
    ['CreatureTamed', 'creatures tamed'], ['TamedPetting', 'tamed animals petted'], ['TamedCommand', 'commands given to tamed animals'],
    ['ItemStandUses', 'item stand uses'], ['ArmorStandUses', 'armour stand uses'],
  ]],
  ['Building', [
    ['BuiltPieces', 'pieces built'], ['BuildPiecesRemoved', 'pieces removed'], ['MaxBuildingHeight', 'maximum building height'],
    ['MaxComfort', 'highest comfort level'], ['PlaceStacks', 'stacks placed'],
    ['BuildClusterBuilding', 'building pieces'], ['BuildClusterFloor', 'floors'], ['BuildClusterWall', 'walls'], ['BuildClusterRoof', 'roof pieces'],
    ['BuildClusterStairs', 'stairs'], ['BuildClusterDoors', 'doors'], ['BuildClusterArchitecture', 'architecture pieces'],
    ['BuildClusterFurniture', 'furniture'], ['BuildClusterLighting', 'lights'], ['BuildClusterDecor', 'decorations'],
    ['BuildClusterStorage', 'storage'], ['BuildClusterCrafting', 'crafting stations'], ['BuildClusterTransport', 'transport pieces'],
    ['BuildClusterFood', 'food pieces'], ['BuildClusterMeads', 'mead pieces'], ['BuildClusterFeasts', 'feast pieces'],
    ['BuildClusterDefense', 'defences'], ['BuildClusterStacks', 'stacks'], ['BuildClusterSeasonal', 'seasonal pieces'], ['BuildClusterMisc', 'other pieces'],
  ]],
  ['Harvest & crafting', [
    ['ItemsPickedUp', 'items picked up'], ['TreeChops', 'tree chops'], ['Tree', 'trees felled'], ['LogChops', 'log chops'], ['Logs', 'logs split'],
    ['TreeBeech', 'beech felled'], ['TreeBirch', 'birch felled'], ['TreeOak', 'oak felled'], ['TreeFir', 'fir felled'], ['TreePine', 'pine felled'],
    ['TreeSwamp', 'swamp trees felled'], ['TreeSnowFir', 'snowy fir felled'], ['TreeSnowPine', 'snowy pine felled'], ['TreeAshlands', 'Ashlands trees felled'],
    ['TreeYggdrasilShoot', 'Yggdrasil shoots felled'],
    ['MineHits', 'mining hits'], ['Mines', 'rocks and deposits mined'], ['FoodEaten', 'foods eaten'],
    ['CraftFood', 'food cooked'], ['CraftGrill', 'grilled'], ['CraftGrillBurnt', 'burnt on the grill'], ['CraftWeapon', 'weapons crafted'],
    ['CraftArmor', 'armour crafted'], ['CraftTrinket', 'trinkets crafted'], ['CraftAmmo', 'ammo crafted'], ['CraftMaterial', 'materials crafted'],
    ['CraftTool', 'tools crafted'], ['CraftTorch', 'torches crafted'], ['CraftBait', 'bait crafted'], ['CraftOther', 'other things crafted'],
    ['HarvestCrop', 'crops harvested'], ['HarvestBerry', 'berries picked'], ['HarvestMushroom', 'mushrooms picked'], ['HarvestVine', 'vines harvested'],
    ['BeesHarvested', 'beehives harvested'], ['SapHarvested', 'sap harvested'],
    ['FishHooked', 'fish hooked'], ['FishCaught', 'fish caught'], ['FishLost', 'fish lost'],
  ]],
  ['Deaths & oddities', [
    ['DeathByEnemyHit', 'deaths by enemies'], ['DeathByPlayerHit', 'deaths by other players'], ['DeathByFall', 'deaths by falling'],
    ['DeathByDrowning', 'drownings'], ['DeathByBurning', 'deaths by burning'], ['DeathByFreezing', 'deaths by freezing'],
    ['DeathByPoisoned', 'deaths by poison'], ['DeathBySmoke', 'deaths by smoke'], ['DeathByWater', 'deaths by water'],
    ['DeathByEdgeOfWorld', 'deaths at the edge of the world'], ['DeathByImpact', 'deaths by impact'], ['DeathByCart', 'deaths by cart'],
    ['DeathByTree', 'deaths by falling trees'], ['DeathBySelf', 'deaths by your own hand'], ['DeathByStructural', 'deaths by collapsing buildings'],
    ['DeathByTurret', 'deaths by turrets'], ['DeathByBoat', 'deaths by boat'], ['DeathByStalagtite', 'deaths by stalactite'],
    ['DeathByCatapult', 'deaths by catapult'], ['DeathByCinderFire', 'deaths by cinder fire'], ['DeathByAshlandsOcean', 'deaths in the Ashlands ocean'],
    ['DeathByIncinerator', 'deaths by obliterator'], ['DeathByDrawBridge', 'deaths by drawbridge'], ['DeathByAshlandsLava', 'deaths by lava'],
    ['DeathByUndefined', 'deaths of unknown cause'],
    ['TombstonesOpenedOwn', 'own tombstones opened'], ['TombstonesOpenedOther', "other Vikings' tombstones opened"],
    ['Cheats', 'console cheats used'],
  ]],
];

// ── the save ─────────────────────────────────────────────────────────────────────────────────
// The "Played on" summary lives in sessionStorage (this tab, until it closes), never in
// localStorage: the app's own storage must hold exactly its two keys, and "Forget" must leave it
// empty (parity P11, P34). It is also wiped whenever the app has no active save (after Forget).
const EXTRAS_KEY = 'valheim-checkup-3d:played-on:';
function forgetExtras() {
  try { for (let k = sessionStorage.length; k--;) { const key = sessionStorage.key(k); if (key?.startsWith(EXTRAS_KEY)) sessionStorage.removeItem(key); } } catch { /* no storage */ }
}
/** @type {Promise<{parts: string[], hours: number} | null> | null} */ let pendingExtras = null;
/** The world settings of a file being loaded (read alongside app.js's own read). @param {File|undefined|null} file */
function readExtras(file) {
  if (!file || !/\.fch$/i.test(file.name)) return;
  pendingExtras = file.arrayBuffer().then(buf => { const x = readSaveExtras(buf); return x ? playedOn(x.extraB[0] || {}) : null; }).catch(() => null);
}
document.getElementById('saveFile')?.addEventListener('change', e => readExtras(/** @type {HTMLInputElement} */ (e.target).files?.[0]), { capture: true });
addEventListener('drop', e => readExtras(e.dataTransfer?.files?.[0]), { capture: true });

/** @type {{id: string, len: number, save: any} | null} */ let cache = null;
/** core.js's parse of the active save, as app.js stored it (parsed once per load). */
function activeSave() {
  try {
    const id = localStorage.getItem('valheim-checkup:active');
    if (!id) return null;
    const raw = localStorage.getItem('valheim-checkup:v1:' + id);
    if (!raw) return null;
    if (!cache || cache.id !== id || cache.len !== raw.length) cache = { id, len: raw.length, save: JSON.parse(raw).save };
    return cache.save;
  } catch { return null; }
}
function storedPlayedOn(/** @type {string} */ id) {
  try { return JSON.parse(sessionStorage.getItem(EXTRAS_KEY + id) || 'null'); } catch { return null; }
}

on('app:load', async d => {
  if (!d?.ok || !pendingExtras) return;
  const p = pendingExtras; pendingExtras = null;
  const extras = await p;
  try {
    const id = localStorage.getItem('valheim-checkup:active');
    if (id) { if (extras) sessionStorage.setItem(EXTRAS_KEY + id, JSON.stringify(extras)); else sessionStorage.removeItem(EXTRAS_KEY + id); }
  } catch { /* storage unavailable: the line is simply not shown */ }
  // the page rendered before the file's settings were read: fill the line in place
  const line = document.querySelector('#insightsView .vc-played-on');
  if (line && extras) { line.textContent = 'Played on: ' + extras.parts.join(' · '); line.hidden = false; }
});

// ── the sections ─────────────────────────────────────────────────────────────────────────────
function bossesSection(/** @type {any} */ save, /** @type {string} */ id) {
  const b = save.buckets?.[0];
  const stat = (/** @type {string} */ n) => Math.max(0, b?.stats?.[DATA.statNames.indexOf(n)] || 0);
  const kills = b?.enemy?.[0] || {};
  const sec = document.createElement('section');
  sec.className = 'insight-card vc-bosses';
  sec.innerHTML = `<h2>Bosses</h2><div class="vc-boss-grid"></div>`
    + `<div class="vc-recs vc-boss-totals">${BOSS_TOTALS.map(([k, l]) => `<p><b>${fmt(stat(k))}</b> <span>${esc(l)}</span></p>`).join('')}</div>`
    + `<p class="sub">Lifetime totals count the seven main bosses; Hildir's are counted on their tiles only. The save doesn't record the damage you dealt to each boss, or how hard the world was for each kill.</p>`
    + `<p class="sub vc-played-on" hidden></p>`;
  const grid = /** @type {HTMLElement} */ (sec.querySelector('.vc-boss-grid'));
  for (const boss of BOSSES) {
    const n = Math.max(0, kills[boss.token] || 0);
    const tile = document.createElement('article');
    tile.className = 'vc-boss' + (n > 0 ? '' : ' vc-boss--undefeated') + (boss.hildir ? ' vc-boss--hildir' : '');
    const entry = /** @type {any} */ (map).icons[boss.trophy];
    if (entry) tile.append(iconElement(entry, 'details'));
    const text = document.createElement('div');
    text.innerHTML = `<strong>${esc(boss.name)}</strong><span>${n > 0 ? `Defeated ${fmt(n)}×` : 'Not yet defeated'}</span>`;
    tile.append(text);
    grid.append(tile);
  }
  const played = storedPlayedOn(id);
  const line = /** @type {HTMLElement} */ (sec.querySelector('.vc-played-on'));
  if (played?.parts?.length) { line.textContent = 'Played on: ' + played.parts.join(' · '); line.hidden = false; }
  return sec;
}

function recordsSection(/** @type {any} */ save) {
  const b = save.buckets?.[0];
  const stat = (/** @type {string} */ n) => Math.max(0, b?.stats?.[DATA.statNames.indexOf(n)] || 0);
  const sec = document.createElement('section');
  sec.className = 'vc-records';
  let html = `<h2 class="vc-records-title">Viking records</h2><div class="insight-grid vc-records-grid">`;
  let any = false;
  for (const [group, rows] of RECORD_GROUPS) {
    const shown = rows.map(([k, label, unit]) => [stat(k) / (unit === 'h' ? 3600 : 1), label]).filter(([v]) => /** @type {number} */ (v) >= 0.5);
    if (!shown.length) continue;
    any = true;
    html += `<section class="insight-card"><h2>${esc(group)}</h2><div class="vc-recs">${shown.map(([v, l]) => `<p><b>${fmt(/** @type {number} */ (v))}</b> <span>${esc(/** @type {string} */ (l))}</span></p>`).join('')}</div></section>`;
  }
  html += `</div><p class="sub">Lifetime counts, read straight from your character file.</p>`;
  if (!any) return null;
  sec.innerHTML = html;
  return sec;
}

on('app:render', d => {
  try { if (!localStorage.getItem('valheim-checkup:active')) forgetExtras(); } catch { /* no storage */ }
  if (d?.view !== 'Highlights') return;
  const view = document.getElementById('insightsView');
  const champions = view?.querySelector(':scope > .champions');
  const save = activeSave();
  if (!view || !champions || !save) return; // no save: app.js's own "load a character" intro only
  const id = localStorage.getItem('valheim-checkup:active') || '';
  const records = recordsSection(save);
  champions.before(bossesSection(save, id));
  if (records) champions.before(records);
});
