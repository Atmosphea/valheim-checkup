// @ts-check
/**
 * Master layout (WP-04 table). Every position on the desk lives here.
 *
 * Units: centimetres. Origin at the centre of the main sheet; x to the right, y up the page,
 * z out of the paper. Rectangles are `{x0, x1, y0, y1}` (x0 < x1, y0 < y1).
 *
 * WP-07 may move things by up to 3 cm to fit text (logged in DECISIONS.md).
 */

/** The main sheet: 96 × 54 cm (16:9). */
export const sheet = { x0: -25, x1: 48, y0: -27, y1: 27 };
/*
 * Paul, WP-18 item 7 ("the paper margin left of the table equals the margin right of it"): the
 * table runs x −21.21 … 44.21 (its axis, and the collection title's, at x 11.5); the right margin
 * is 48 − 44.21 = 3.79 cm, so the left edge moves in from −36 to −21.21 − 3.79 = −25.0, which is
 * the woodblock's right edge: the woodblock stays where it is and no longer lies on the paper. The
 * sheet is 73 × 54 cm.
 */
/**
 * Paul, WP-17 item 3 ("bring the paper's left live edge closer to the main section"): the sheet's
 * left edge moved in from x −48 to −36 (it lies under the woodblock, 13 cm left of the main section;
 * the sheet is 84 × 54 cm now). The whole-desk camera view still frames the old 96 × 54 cm area, so
 * every woodblock slot stays in the window: `view`.
 */
export const view = { x0: -48, x1: 48, y0: -27, y1: 27 };

/**
 * Title "Valheim Checkup": centred at (0, 22). DECISIONS point 21: WP-07's 4.4 cm font size wins; cap height follows.
 * Paul, WP-16 item 20 ("reduce the header height a little"): the title block moved up 1 cm (was y 21)
 * and the inset sheet's top edge with it, so the header is 11.9 cm tall instead of 12.9.
 */
export const title = { x: 0, y: 22, capHeight: 3.2 };

/** Byline and lifetime records: centred under the title, y 17.5 to 16. */
export const byline = { x: 0, y0: 16, y1: 17.5 };

/** Favourite tags hang over the top edge, clear of the title. */
/* Paul, WP-17 item 3: x −46…−22 → −34.6…−24.6: on the narrower sheet, clear of the wider main section. */
/* Paul, WP-18 item 7: the sheet now starts at x −25, so the tags move onto it, left of the centred
   masthead (was −34.6…−24.6). */
export const tags = { x0: -23.4, x1: -13.4, y0: 22, y1: 27 };

/**
 * Coins: a row at y 20, plus the Sound coin. Order in the list = tab order on desk
 * (DECISIONS point 27: How to, Load, Import, Export … Sound last).
 * DECISIONS point 6 moves the Sound coin to (46.2, −26.0), beside the footer line.
 */
export const coins = [
  // Paul, WP-16 items 20 + 23: the row moved up 1 cm with the title (was y 20) and the coins are set
  // down by hand, not in a straight line: each a little higher or lower (± 0.5 cm)
  // Paul, WP-18 items 7, 8 and 10: the masthead is centred on the table's axis (x 11.5) and ends
  // at x 29, so the coins gather closer together right of it, not in a line, clear of every text:
  // How to lower left (free paper round it for the "start here" ring), Load (the big one) above
  // the help note (its top is y 18.3), Import and Export to the right. Was How to (24, 21.45),
  // Load (31.5, 20.7), Import (38.5, 21.55), Export (44, 20.6).
  { id: 'howto', x: 31.7, y: 17.7, r: 2.2 },
  { id: 'load', x: 35.6, y: 22.0, r: 3.4 },
  { id: 'import', x: 44.6, y: 23.6, r: 2.0 },
  { id: 'export', x: 41.6, y: 20.6, r: 2.0 },
  { id: 'sound', x: 46.2, y: -26.0, r: 1.6 },
];
/**
 * Paul, WP-18 item 10: "start here" around the How-to coin while no save is loaded
 * (surfaces/start-here.js). `rect` is its canvas on the coins' level; the lettering is centred at
 * `centerDeg` (screen angle, 90° = straight below the coin) on a ring `ringGap` outside the rim;
 * the arrow is a quadratic stroke from `arrowFrom` through `arrowBend` to `arrowTo` (cm).
 */
export const startHere = {
  // the lettering on the lower-left arc (left of the record toggle, above the collection title's
  // swash); the arrow comes down from the free paper above it, right of "Valheim Checkup" (ends x 25.5)
  rect: { x0: 25.9, x1: 35.0, y0: 12.6, y1: 26.4 },
  pxPerCm: 60, ringGap: 0.6, letterCm: 1.4, trackCm: 0.04, centerDeg: 152,
  ink: 'rgba(118, 34, 20, 0.92)',
  arrowFrom: [27.4, 25.9], arrowBend: [27.3, 22.4], arrowTo: [29.5, 20.0], strokeCm: 0.16, headCm: 1.1,
};

/** Placeholder coin thickness (WP-04). WP-06 coins use `coinSpec` below. */
export const coinThickness = 0.35;

/**
 * WP-06 coin table: radius and thickness (cm), rim legend source and emblem. `rotDeg` is the
 * fixed hand-placed turn of each coin (builder values, "a slight fixed rotation each").
 */
export const coinSpec = {
  // Paul, WP-16 item 23: turns varied more (were −9, 6, −14, 11, −5) and a small resting tilt
  // `tiltDeg` [about x, about y], as if each coin had been set down by hand (one edge a hair up)
  howto: { r: 2.2, t: 0.35, emblem: 'book', rotDeg: -17, tiltDeg: [3.2, -2.4] },
  load: { r: 3.4, t: 0.45, emblem: 'diamond', rotDeg: 9, tiltDeg: [-1.8, 1.6] },
  import: { r: 2.0, t: 0.35, emblem: 'up', rotDeg: -5, tiltDeg: [2.6, 3.0] },
  export: { r: 2.0, t: 0.35, emblem: 'down', rotDeg: 19, tiltDeg: [-3.0, -2.2] },
  sound: { r: 1.6, t: 0.3, emblem: 'bell', rotDeg: -8, tiltDeg: [1.6, -2.0] },
};

/**
 * Woodblock. Paul, WP-16 items 7–8: narrower and much taller, running off the bottom of the
 * window and a little off its left edge, its own object on top of the paper (the sheet's left
 * part lies under it). Was x −44 to −16, y −20 to 16.
 */
export const woodblock = { x0: -52, x1: -25, y0: -46, y1: 19, thickness: 3 };

/**
 * WP-06 board, in the board's own centimetres: origin at its bottom-left corner on the paper,
 * x right, y up the page, z up (the top face is at z = 3). See src/board/layout.js.
 * Paul's scope cut: a plain bevelled border, no braided carving.
 *
 * Paul, WP-16 (items 7–13): 27 × 65 cm. The left band is wide (its outer part runs off the
 * window) and the slots start inside the window; slots 2.4 cm apart (was 2.0) with taller bars
 * and larger names; the bars are longer for their slot; rest is LEFT and a bar slides RIGHT to
 * select; turned round knobs; a big "Collection targets" counter at the top; the carved labels
 * are burned into the wood. Below the side note the wood just runs on off the window.
 * `fieldX0/fieldX1` is the part between the bands; texts centre on it.
 */
export const board = {
  width: 27, height: 65, thickness: 3,
  cornerRadius: 0.8, bevel: 0.28, bevelSegments: 8,
  border: 1.8,
  fieldX0: 4.2, fieldX1: 25.2,
  header: 9, foot: 19.6,
  /*
   * Paul, WP-17 item 14: thicker bars (there is room at the bottom): pitch 2.4 → 2.6, groove
   * 1.62 → 1.86 tall, bar 1.26 → 1.48. Item 17: a vertical row-height groove now runs down the left
   * of the slots (`rowSlider`), so the slots start at x 6.3 (was 4.6) and are 16.6 long (was 18.5);
   * the bar is 10.5 long (was 12.4), the travel unchanged. The tabs scale with the bars (item 15).
   */
  pitch: 2.6,
  /** 11 collections, the "Your Viking" divider (one pitch, DECISIONS point 19), 2 insights. */
  cells: 14,
  dividerCell: 11,
  groove: { length: 16.6, height: 1.86, depth: 0.6, x0: 6.3, topGap: 0.58 },
  /** Paul, WP-17 item 14: the progress fill is on the bars now; the lip inlay is gone (kept for the layout maths only). */
  inlay: { length: 15.8, height: 0.22, x0: 6.75, centreFromTop: 0.29, depth: 0.05 },
  /** DECISIONS point 18, scaled with the slot (WP-17 item 15: 1.8 × 1.1 → 2.3 × 1.4, cap 0.52 → 0.7). */
  tab: { w: 2.3, h: 1.4, cx: 24.1, thickness: 0.1, capHeight: 0.7 },
  bar: { length: 10.5, height: 1.48, thickness: 0.5, radius: 0.07, segments: 6 },
  /**
   * Paul, WP-16 item 11: a turned, round knob standing up from the bar's right end (was a 1.3 cm
   * knurled box). `length` is its footprint along the slot (the stem collar), `drawnHeight` the
   * same across it; `cap` the grip's radius, `rise` its top above the bar's top.
   */
  knob: { length: 1.4, height: 1.4, drawnHeight: 1.4, thickness: 1.0, chamfer: 0.12, cap: 0.84, stem: 0.5, rise: 1.3, flutes: 16 },
  /** Travel 4.4 cm: rest is LEFT, latched is RIGHT (Paul, WP-16 item 9). Left end at rest, in board cm. */
  travel: 4.4,
  restLeftX: 6.45,
  /** Paul, WP-17 item 14: the plaque a little bigger again (17 × 4.1 → 19.4 × 4.7), window and wheels with it. */
  plaque: { w: 19.4, h: 4.7, thickness: 0.22, radius: 0.4, cy: 59.2,
    window: { x0: -6.4, x1: 0.45, y0: -1.78, y1: -0.22 }, wheels: 4, wheelRadius: 1.08, wheelWidth: 1.35 },
  /**
   * Paul, WP-17 item 17: the row-height slider, a vertical groove left of all the bars (board cm),
   * from the first collection slot down to the last insight slot. Up = taller table rows; the
   * knob's travel maps linearly onto `min`…`max` × the original row height; `def` (1.3) is the default.
   */
  rowSlider: { x0: 4.3, w: 1.5, depth: 0.5, knobH: 1.9, knobW: 1.28, min: 1.0, max: 2.2, def: 1.3, baseRowCm: 1.79 },
  /** Carved (burned) text: cap heights and baselines' centres, cm. */
  headingCap: 1.0, headingY: 63.2,
  dividerCap: 0.66,
  sideNoteCap: 0.62, sideNoteY: [18.45, 17.25],
};
/**
 * Collection inset sheet: heading, stamps, filters, table. Lies just above the main sheet.
 * WP-07: bottom raised 0.8 cm (−25 → −24.2) so the resources and footer lines fit between it and
 * the deckled edge (DECISIONS, WP-07; within the 3 cm WP-07 allowance).
 */
export const inset = { x0: -23, x1: 46, y0: -24.2, y1: 26, z: 0.03 };
/*
 * Paul, WP-17 items 3–4: the inset is now the whole "main section": it grows left into the blank
 * paper beside the woodblock (x0 −12 → −23) and up to the sheet's burned top edge (y1 15 → 26), and
 * holds the title, byline and lifetime records above the table (they scroll with it). The coins and
 * the help strip stay on their own fixed level above it.
 */

/**
 * Paul, WP-17 item 2: what the camera frames by default (the main section, with a sliver of the
 * woodblock on the left so the pointer can reach it), and the pointer zones that zoom out to the
 * whole desk: over the woodblock (x < `woodX`) or above the collection title (y > `headerY`).
 * `returnX/returnY`: back inside these (hysteresis), the camera frames the main section again.
 */
export const mainFrame = {
  x0: -28.5, x1: 47, y0: -27, y1: 25.6, woodX: -25, headerY: 15.4, returnX: -23.2, returnY: 13.6,
  /**
   * Paul, WP-18 item 6: the main framing is the fit of the rectangle above × `zoomIn` (20 % closer),
   * centred on the table's axis (`axisX`, the collection title's centre) with the sheet's top edge
   * (`topY`) at NDC height `topNdc`. With the woodblock now just off screen there, the window's
   * left edge (pointer nx < `edgeNx`) also brings the collections in.
   */
  zoomIn: 1.2, axisX: 11.5, topY: 26.6, topNdc: 0.985, edgeNx: -0.94,
};

/**
 * Paul, WP-18 item 6: the header framing (pointer above the collection title) zooms out from the
 * main framing by the same factor as in WP-17 (main ÷ fit = `mainFrame.zoomIn`): the coins and the
 * masthead fill the top of the window, the paper's top edge just inside it.
 */
export const headerFrame = { x: 11.5, topY: 27.4, topNdc: 0.97 };

/**
 * Paul, WP-18 item 6: the collections framing (pointer over the woodblock) is 50 % closer than the
 * whole-desk view it used to show (zoom 1 → 1.5); its aim moves between `yLow` and `yHigh` with the
 * pointer's height in the window. Across, the woodblock still runs off the window's left edge (WP-16
 * items 7–8): `edgeX` (2 cm in from its left side) sits on that edge. Centring x −19 instead left
 * ~2.5 cm of bare desk there at 16:10, where the cursor turned back into the spark.
 */
export const woodFrame = { zoom: 1.5, edgeX: -50, yLow: -11, yHigh: 1 };

/**
 * Help note (sealed letter). Paul, WP-16 item 22: top right, under the coins (between the coin row
 * and the inset sheet, right of the Load coin). It was beside the woodblock at x −23.6 … −13.4,
 * y −24.1 … −20.7 (16B), and before that x −44 … −32, y −26 … −22.
 */
export const helpNote = { x0: 35.4, x1: 45.4, y0: 15.35, y1: 18.3 };

/** Footer links and disclaimer: one line. WP-16: starts at x −24 (was −30), clear of the woodblock. */
export const footer = { x0: -24, x1: 46, y: -26.3 };

/**
 * Gauntlet stand-in (WP-04 placeholder; the real model is WP-08). The arm comes in from the
 * upper left, off the sheet, like the reference, and the hand rests over the board's top.
 * It never leaves the woodblock zone (file 05).
 */
export const gauntletStandIn = {
  from: { x: -60, y: 30, z: 9 },
  to: { x: -39, y: -4, z: 6 },
  radius: 3.4,
};

/** Desk under the paper: dark planks, mostly seen at the frame edges. */
export const desk = { x0: -90, x1: 90, y0: -60, y1: 60, plankWidth: 13, gap: 0.25, top: -0.05, thickness: 4 };

/** The printed layer's paper height above each sheet, so text never fights the paper. */
export const printLift = 0.005;

const layout = { sheet, view, title, byline, tags, coins, startHere, coinThickness, coinSpec, woodblock, board, inset, mainFrame, headerFrame, woodFrame, helpNote, footer, gauntletStandIn, desk, printLift };
export default layout;
