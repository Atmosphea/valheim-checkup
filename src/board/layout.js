// @ts-check
/**
 * The board's derived layout (WP-06). Every number comes from `board` in src/config/layout.js;
 * this file only works out where each row's groove, inlay, tab and bar sit.
 *
 * Board cm: origin at the board's bottom-left corner on the paper, x right, y up, z up.
 * World cm = board cm + (woodblock.x0, woodblock.y0, 0).
 */
import { board as B } from '../config/layout.js';

/** The 13 views in the original order (P13, P14); the divider sits between them. */
export const COLLECTION_ORDER = ['The Artisan', 'The Blacksmith', 'The Carpenter', 'The Master Chef', 'The Gourmet', 'The Trophy Collector', 'The Hunter', 'The Master Hunter', 'The Fisherman', 'Are You Alright?', "That Can't Be an Accident"];
export const INSIGHT_ORDER = ['Highlights', 'Skills & travel'];

/** @typedef {{x0: number, y0: number, x1: number, y1: number}} Rect */

/**
 * @typedef {object} Row
 * @property {number} index         0…12 (bar order, top to bottom)
 * @property {number} cell          0…13 (the divider takes cell 11)
 * @property {string} category
 * @property {boolean} insight
 * @property {number} top           cell top (board y)
 * @property {number} cy            groove centre y
 * @property {Rect} groove
 * @property {Rect} inlay
 * @property {Rect} tab
 * @property {number} barRestX0     bar's left end at rest (Paul, WP-16 item 9: rest is on the left)
 */

/** @param {string[]} [collections] @param {string[]} [insights] @returns {Row[]} */
export function rows(collections = COLLECTION_ORDER, insights = INSIGHT_ORDER) {
  const fieldTop = B.height - B.header;
  const views = [...collections.map(c => ({ c, insight: false })), ...insights.map(c => ({ c, insight: true }))];
  const out = [];
  let cell = 0;
  for (const [index, v] of views.entries()) {
    if (cell === B.dividerCell) cell++;
    const top = fieldTop - cell * B.pitch;
    const g = B.groove;
    const gy1 = top - g.topGap, gy0 = gy1 - g.height;
    const cy = (gy0 + gy1) / 2;
    const iy = top - B.inlay.centreFromTop;
    out.push({
      index, cell, category: v.c, insight: v.insight, top, cy,
      groove: { x0: g.x0, x1: g.x0 + g.length, y0: gy0, y1: gy1 },
      inlay: { x0: B.inlay.x0, x1: B.inlay.x0 + B.inlay.length, y0: iy - B.inlay.height / 2, y1: iy + B.inlay.height / 2 },
      tab: { x0: B.tab.cx - B.tab.w / 2, x1: B.tab.cx + B.tab.w / 2, y0: cy - B.tab.h / 2, y1: cy + B.tab.h / 2 },
      barRestX0: B.restLeftX,
    });
    cell++;
  }
  return out;
}

/** The "Your Viking" divider cell: its top and centre. */
export function divider() {
  const top = B.height - B.header - B.dividerCell * B.pitch;
  return { top, cy: top - B.pitch / 2 };
}

/** The plaque's rectangle (board cm) and its window (board cm). */
export function plaque() {
  const P = B.plaque, cx = fieldCx();
  return {
    cx, cy: P.cy,
    rect: { x0: cx - P.w / 2, x1: cx + P.w / 2, y0: P.cy - P.h / 2, y1: P.cy + P.h / 2 },
    window: { x0: cx + P.window.x0, x1: cx + P.window.x1, y0: P.cy + P.window.y0, y1: P.cy + P.window.y1 },
  };
}

/** The centre line of the field between the bands (board x, cm): carved texts and the plaque centre on it. */
export const fieldCx = () => (B.fieldX0 + B.fieldX1) / 2;

/** Paul, WP-17 item 17: the row-height groove, left of all the slots, from the first slot's top to the last one's bottom. */
export function rowGroove() {
  const R = rows(), S = B.rowSlider;
  return { x0: S.x0, x1: S.x0 + S.w, y0: R[R.length - 1].groove.y0, y1: R[0].groove.y1 };
}

/** Rectangles cut into the top face: the 13 grooves, the row-height groove and the plaque's counter window (last). */
export function cutouts() {
  return [...rows().map(r => r.groove), rowGroove(), plaque().window];
}

/** For the WP-05 board bake: the slot rectangles (it adds their ambient occlusion and halos). */
export function bakeSpec() {
  return { widthCm: B.width, heightCm: B.height, slots: cutouts() };
}

export { B as board };
