// @ts-check
/**
 * WP-07: where the printed parts sit on the main sheet (cm, x0 < x1, y0 < y1, origin at the
 * sheet's centre, y up the page). WP-04's master layout (src/config/layout.js) gives the anchors;
 * the boxes around them are sized here for the WP-07 type scale. Kept free of CSS imports so the
 * unit tests can read it.
 */
import { sheet as LS, title as LT, tags as LTags, helpNote as LH, footer as LF } from '../config/layout.js';

/**
 * Main-sheet rectangles (cm, x0 < x1, y0 < y1). WP-04's layout gives the anchors; the boxes
 * around them are sized here for the WP-07 type scale.
 */
export const RECTS = {
  // Paul, WP-16 item 20: the whole title block 1 cm higher (header y0 was 15.05, byline 17.25, records 15.1)
  // Paul, WP-17 item 4: the title, byline and records moved into the main section (.vc-masthead,
  // they scroll with the table); header.top keeps only the favourite tags on the top-left edge
  // (and stays the favourite drop zone; the masthead forwards drops to it)
  header: { x0: LTags.x0, x1: LTags.x1 + 0.6, y0: LTags.y0 - 0.6, y1: 26.7 },
  brand: { x0: LT.x - 19, x1: LT.x + 19, y0: LT.y - 2.6, y1: LT.y + 3.0 },
  profile: { x0: -15.4, x1: 15.4, y0: 18.25, y1: 19.35 },
  // clear of the woodblock (its right edge is x −16): two lines when the numbers are long
  statline: { x0: -15.4, x1: 15.4, y0: 16.1, y1: 18.15 },
  favorites: { x0: LTags.x0, x1: LTags.x1 + 0.6, y0: LTags.y0 - 0.6, y1: LTags.y1 - 0.4 },
  help: { x0: LH.x0, x1: LH.x1 + 1, y0: LH.y0, y1: LH.y1 },
  /** The foot strip (its own CSS3D object): resources and footer lines (Paul, WP-16 item 22: the help letter left it for the top right). */
  foot: { x0: LS.x0 + 1, x1: LS.x1 - 3.4, y0: LS.y0 + 0.8, y1: -24.1 },
  /** Paul, WP-16 item 22: the help letter's own strip, top right under the coins. */
  helpStrip: { x0: LH.x0, x1: LH.x1 + 1, y0: LH.y0, y1: LH.y1 },
  // between the inset sheet's foot (y −24.2) and the deckle, left of the Sound coin
  resources: { x0: LF.x0 + 1, x1: LF.x1 - 2.4, y0: -24.95, y1: -24.3 },
  footer: { x0: LF.x0 + 1, x1: LF.x1 - 2.4, y0: -25.8, y1: -25.05 },
};

export default RECTS;
