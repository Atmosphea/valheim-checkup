// @ts-check
/**
 * Every material in file 05's table, one file each. This index lists them in table order with
 * their "used on" text, for the ?materials review page and for anything that needs them all.
 */
export { createBrushedSteel } from './brushed-steel.js';
export { applyEngraving, refreshEngraving, setEngravingWipe } from './engraving.js';
export { createKnurling } from './knurling.js';
export { createGauntletSteel } from './gauntlet-steel.js';
export { createGauntletReflections } from './gauntlet-reflections.js';
export { createLeather } from './leather.js';
export { createRivets, rivetGeometry } from './rivets.js';
export { createGold } from './gold.js';
export { createBrass, setPour } from './brass.js';
export { createOiledWood } from './oiled-wood.js';
export { createScenePaper, createVeilPaper, createLitPaper } from './paper.js';
export { createDeskPlank } from './desk.js';

/** File 05's material table, in order. */
export const MATERIAL_TABLE = [
  { id: 'brushedSteel', name: 'Brushed steel', usedOn: 'Bars, knobs, fingertip plate hinge' },
  { id: 'engraving', name: 'Engraving', usedOn: 'Bar names, coin legends, plaque' },
  { id: 'knurling', name: 'Knurling', usedOn: 'Knob ends' },
  { id: 'gauntletSteel', name: 'Polished gauntlet steel', usedOn: 'Gauntlet plates' },
  { id: 'gauntletReflections', name: 'Gauntlet reflections', usedOn: 'Gauntlet' },
  { id: 'leather', name: 'Leather', usedOn: 'Under-glove visible between plates' },
  { id: 'rivets', name: 'Rivets', usedOn: 'Gauntlet, bar ends' },
  { id: 'gold', name: 'Gold', usedOn: 'Coins' },
  { id: 'brass', name: 'Brass', usedOn: 'Slot inlays, plaque' },
  { id: 'oiledWood', name: 'Oiled wood', usedOn: 'Woodblock' },
  { id: 'paper', name: 'Paper', usedOn: 'Sheets' },
  { id: 'desk', name: 'Desk', usedOn: 'Under the paper' },
];
