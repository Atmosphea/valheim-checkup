// @ts-check
/**
 * Debug and test API (file 01): `window.__vc`, present in every build.
 *
 *   __vc.events          ring buffer (last 2,000) of {t, wall, type, data}
 *   __vc.state()         {view, mode, runMode, filters, saveLoaded, quality, cursor}
 *   __vc.timeScale(x)    set (or with no argument, read) the central clock's time scale
 *   __vc.seed(n)         reseed (or read) the seeded random generator
 *   __vc.quality(tier)   'high' | 'medium' | 'low' | 'flat' (or read)
 *   __vc.sound.log       every sound played {name, gain, pitch, t}; filled by the audio engine (WP-12)
 *
 * `mode` is the record mode ('achievement' | 'raw', DECISIONS point 16); `runMode` is desk/flat.
 * state() reads the app's own controls, so app.js needs no extra hooks for it.
 */
import { events } from './bus.js';
import { clock } from './util/clock.js';
import { rng } from './util/rng.js';
import { runMode } from './mode.js';
import { getQuality, setQuality } from './quality.js';

/** @typedef {'native'|'gauntlet'|'spark'} CursorMode */

/** Flat mode keeps the normal pointer; WP-09 switches desk mode to gauntlet / spark. @type {CursorMode} */
let cursor = 'native';
/** @param {CursorMode} next */
export function setCursorMode(next) { cursor = next; }

/** Every sound played; the audio engine (WP-12) pushes here. @type {{name: string, gain: number, pitch: number, t?: number}[]} */
export const soundLog = [];

const byId = (/** @type {string} */ id) => /** @type {HTMLInputElement|HTMLSelectElement|null} */ (document.getElementById(id));

function state() {
  const active = document.querySelector('#categories [aria-current="page"], #insightNav [aria-current="page"]');
  const value = (/** @type {string} */ id) => byId(id)?.value ?? null;
  return {
    view: active instanceof HTMLElement ? active.dataset.category ?? null : null,
    mode: value('recordMode'),
    runMode,
    filters: {
      status: value('statusFilter'),
      discovery: value('discoveryFilter'),
      discoveryEnabled: !(byId('discoveryFilter')?.disabled ?? true),
      biome: value('biomeFilter'),
      sort: value('sort'),
      starred: !!(/** @type {HTMLInputElement|null} */ (byId('pinnedOnly'))?.checked),
      search: value('search'),
    },
    saveLoaded: !!document.getElementById('headerProfile') && !document.getElementById('headerProfile')?.classList.contains('hidden'),
    quality: getQuality(),
    cursor,
  };
}

/** WP-14 startup budget: when flat content was usable / the desk scene first drawn (ms since navigation). */
const startup = { usableMs: /** @type {number|null} */ (null) };
export function markUsable() { if (startup.usableMs === null) startup.usableMs = +performance.now().toFixed(1); }

export const vc = {
  startup: () => ({ ...startup }),
  events,
  state,
  /** @param {number} [x] */
  timeScale: x => (x === undefined ? clock.scale() : clock.setScale(x)),
  /** @param {number|string} [n] */
  seed: n => (n === undefined ? rng.initialSeed : rng.seed(n)),
  /** @param {import('./quality.js').Tier} [tier] */
  quality: tier => (tier === undefined ? getQuality() : setQuality(tier)),
  sound: { log: soundLog },
  clock,
  rng,
};

/** @type {any} */ (globalThis).__vc = vc;
