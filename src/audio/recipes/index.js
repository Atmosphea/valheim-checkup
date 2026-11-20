// @ts-check
/**
 * All recipes in one table, plus the glue that hands each recipe its audio-mix.json values.
 * Only the sounds Paul kept (DECISIONS "Scope cuts") have recipes; every other file 06 sound is
 * marked `"deferred": true` in audio-mix.json and stays silent.
 */
import { mech, ranges as mechRanges } from './mech.js';
import { coin, ranges as coinRanges } from './coin.js';
import { magic, ranges as magicRanges } from './magic.js';
import { paper, ranges as paperRanges } from './paper.js';
import { ambience, ranges as ambienceRanges } from './ambience.js';

/** @type {Record<string, (rng: any, ctx: any, p: any, B: any) => AudioBuffer>} */
export const recipes = { ...mech, ...coin, ...magic, ...paper, ...ambience };

/** Expected take length per sound, ms [min, max]. @type {Record<string, number[]>} */
export const ranges = { ...mechRanges, ...coinRanges, ...magicRanges, ...paperRanges, ...ambienceRanges };

/** Shared block values plus the layers some recipes borrow. @param {any} mix */
export function blocksFor(mix) {
  return { ...mix.blocks, rattle: mix.sounds['bar.rattle'], land: mix.sounds['coin.land'] };
}

/** The entry a recipe reads (a few recipes are built on another sound's values). @param {string} name @param {any} mix */
export function paramsFor(name, mix) {
  const p = { ...mix.sounds[name] };
  if (name === 'bar.return') p.latch = mix.sounds['bar.latch'];
  if (name === 'menu.open') p.flap = mix.sounds['unfold.flap'];
  return p;
}

/**
 * Render one take.
 * @param {string} name @param {any} mix @param {import('../blocks.js').BufferMaker} ctx @param {import('../blocks.js').Rng} rng
 * @returns {AudioBuffer}
 */
export function renderTake(name, mix, ctx, rng) {
  const fn = recipes[name];
  if (!fn) throw new Error(`no recipe for ${name}`);
  return fn(rng, ctx, paramsFor(name, mix), blocksFor(mix));
}
