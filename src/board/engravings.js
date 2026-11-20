// @ts-check
/**
 * What the board and coins carry engraved (WP-06), as entries for the WP-05 engraving atlas.
 * Every string is read word-for-word from the page the app built (or from the original app's
 * own strings), never typed here, so the carving always matches the proxies (DECISIONS point 12).
 *
 *   board:face        the carved heading on the top band, the "Your Viking" divider and the
 *                     side note on the bottom band, drawn at their places on the whole top face
 *   bar:<view>        each bar's name without "The " (IM Fell English)
 *   plaque:face       "Collection targets ⓘ" and "/ 1,461", around the counter window
 *   coin:<id>         rim legend (IM Fell English SC) and emblem; coin:load:alt is the
 *                     "Load another save" legend the 180 ms wipe swaps in (DECISIONS point 11);
 *                     coin:sound:back is the struck-through bell on the Sound coin's reverse
 *   tab:<view>        (second, small atlas) the brass tab counts "{done} / {total}", "{total} items" or "↗"
 */
import { board as B, coinSpec } from '../config/layout.js';
import { STRINGS } from '../strings.js';
import { rows, divider, plaque } from './layout.js';

/** Atlas pixels per cm for the composite faces. */
/** WP-16: the board face now carries only the inlay channels (the labels are burned, src/board/burn.js), so 16 px/cm; the bigger plaque 56. */
export const PX = { board: 16, plaque: 56, coin: 60, bar: 72 };

const text = (/** @type {string} */ sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The original Load button's legend for a state: "Load character · click or drop .fch". @param {boolean} hasSave */
export function loadLegend(hasSave) {
  // app.js line 40 writes exactly these two labels and the "click or drop .fch" note
  const small = text('#loadTop small') || 'click or drop .fch';
  return `${hasSave ? 'Load another save' : 'Load character'} · ${small}`;
}

/** Paul, WP-18 item 9: a coin label in two balanced lines ("Load character" → Load / character). @param {string} t */
export function splitLabel(t) {
  const w = t.split(' ');
  if (w.length < 2) return [t];
  let best = 1, diff = Infinity;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < diff) { diff = d; best = i; } }
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}

/** A bar's engraved name (P13: names without "The "). @param {string} category */
export const barName = category => category.replace('The ', '');

/** @returns {import('../scene/textures/engrave.js').EngraveEntry[]} */
export function boardEntries() {
  /** @type {import('../scene/textures/engrave.js').EngraveEntry[]} */
  const list = [];
  const heading = text('.sidebar > .eyebrow:not(.insights-label)') || 'Achievement collections';
  const viking = text('.sidebar > .insights-label') || 'Your Viking';
  const note = text('.side-note');
  const W = B.width * PX.board, H = B.height * PX.board;
  const yPx = (/** @type {number} */ yb) => (B.height - yb) * PX.board;
  list.push({
    id: 'board:face', text: [heading, viking, note].join(' | '), w: W, h: H,
    texts: { 'heading:0': heading, 'heading:1': viking, sidenote: note },
    // Paul, WP-16 item 12: the heading, the "Your Viking" divider and the side note are burned
    // into the wood (src/board/burn.js draws them); the face keeps the strings it carries for
    // __vc.engraved() and draws only the empty inlay channels the brass fills
    // Paul, WP-17 item 14: the progress fill moved onto the bars, so no inlay channels any more
    draw() { void yPx; },
  });

  for (const r of rows()) list.push({ id: `bar:${r.category}`, text: barName(r.category), font: 'body', px: PX.bar });

  // plaque: "Collection targets ⓘ" on the top row, "/ 1,461" right of the counter window
  const label = text('#overall .eyebrow') || 'Collection targets ⓘ';
  const total = (text('#overall > span') || '/ 1,461').replace(/^\s*\/\s*/, '/ ');
  const P = plaque(), pw = B.plaque.w * PX.plaque, ph = B.plaque.h * PX.plaque;
  list.push({
    id: 'plaque:face', text: `${label} | ${total}`, w: pw, h: ph,
    texts: { 'plaque:label': label, 'plaque:total': total },
    draw(ctx, x, y, w, h, kit) {
      const toPx = (/** @type {number} */ bx, /** @type {number} */ by) => [x + (bx - P.rect.x0) * PX.plaque, y + (P.rect.y1 - by) * PX.plaque];
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      // Paul, WP-16 item 13: the bigger counter: 0.72 cm label caps, 0.95 cm total, a double frame
      const lp = kit.pxForCap('smallCaps', 0.72 * PX.plaque);
      ctx.font = kit.font('smallCaps', lp);
      const [lx, ly] = toPx(P.cx, P.rect.y1 - 0.95);
      ctx.fillText(label, lx, ly + 0.36 * PX.plaque);
      const tp = kit.pxForCap('body', 0.95 * PX.plaque);
      ctx.font = kit.font('body', tp);
      ctx.textAlign = 'left';
      const [tx, ty] = toPx(P.window.x1 + 0.45, (P.window.y0 + P.window.y1) / 2);
      ctx.fillText(total, tx, ty + 0.475 * PX.plaque);
      // engraved frame lines inside the plaque edge, and a rule under the label
      ctx.lineWidth = 0.05 * PX.plaque;
      const m = 0.18 * PX.plaque, m2 = 0.32 * PX.plaque;
      roundRect(ctx, x + m, y + m, w - 2 * m, h - 2 * m, 0.22 * PX.plaque); ctx.stroke();
      ctx.lineWidth = 0.025 * PX.plaque;
      roundRect(ctx, x + m2, y + m2, w - 2 * m2, h - 2 * m2, 0.14 * PX.plaque); ctx.stroke();
      const [rx0, ry] = toPx(P.rect.x0 + 2.2, P.rect.y1 - 1.38), [rx1] = toPx(P.rect.x1 - 2.2, 0);
      ctx.beginPath(); ctx.moveTo(rx0, ry); ctx.lineTo(rx1, ry); ctx.stroke();
    },
  });

  // coins
  const legends = {
    howto: text('#howTo') || STRINGS.howTo,
    load: loadLegend(!!document.querySelector('#loadTop.has-save')),
    import: document.querySelector('#importProgress')?.getAttribute('aria-label') ?? 'Import progress',
    export: document.querySelector('#exportProgress')?.getAttribute('aria-label') ?? 'Export progress',
    sound: STRINGS.soundCoin,
  };
  const hasSave = !!document.querySelector('#loadTop.has-save');
  /** @type {[string, keyof typeof coinSpec, string, string][]} */
  const faces = [
    ['coin:howto', 'howto', legends.howto, 'book'],
    ['coin:load', 'load', loadLegend(false), 'diamond'],
    ['coin:load:alt', 'load', loadLegend(true), 'diamond'],
    ['coin:import', 'import', legends.import, 'up'],
    ['coin:export', 'export', legends.export, 'down'],
    ['coin:sound', 'sound', legends.sound, 'bell'],
    ['coin:sound:back', 'sound', legends.sound, 'bell-struck'],
  ];
  void hasSave;
  for (const [id, coin, legend, emblem] of faces) {
    const R = coinSpec[coin].r;
    const side = Math.round(2 * R * PX.coin);
    list.push({
      id, text: legend, w: side, h: side,
      draw(ctx, x, y, w, h, kit) {
        // Paul, WP-18 item 9: the Load coin's words are big and legible: "Load character" (or "Load
        // another save") across the face in two lines, the "click or drop .fch" note on the rim
        if (coin === 'load') {
          const [main, note] = legend.split(' · ');
          drawCoinFace(ctx, x + w / 2, y + h / 2, R * PX.coin, note ?? '', emblem, kit, splitLabel(main));
        } else drawCoinFace(ctx, x + w / 2, y + h / 2, R * PX.coin, legend, emblem, kit);
      },
    });
  }
  return list;
}

/** Tab counts for the small atlas. @param {Record<string, string>} tabTexts category → text */
export function tabEntries(tabTexts) {
  return Object.entries(tabTexts).map(([category, t]) => ({ id: `tab:${category}`, text: t, font: /** @type {'smallCaps'} */ ('smallCaps'), px: 52 })); // WP-17 item 15: 44 → 52 px (the 512 atlas still fits 13)
}

/** Split a sentence into two lines of about equal width. @param {string} s @param {CanvasRenderingContext2D} ctx */
export function splitInTwo(s, ctx) {
  const words = s.split(' ');
  let best = [s], bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(ctx.measureText(a).width - ctx.measureText(b).width);
    if (d < bestDiff) { bestDiff = d; best = [a, b]; }
  }
  return best;
}

/** @param {CanvasRenderingContext2D} ctx */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/**
 * One coin face: the legend around the field just inside the polished rim, an inner ring and
 * the emblem in the middle. White = engraved.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} R px
 * @param {string} legend @param {string} emblem
 * @param {import('../scene/textures/engrave.js').DrawKit} kit
 * @param {string[]} [label]  Paul, WP-18 item 9: big words across the middle instead of the emblem
 */
export function drawCoinFace(ctx, cx, cy, R, legend, emblem, kit, label) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // legend: caps about 11% of the radius, on a circle at 72% of the radius, centred on top
  // (Paul, WP-18 item 9: 15 % on a coin with a label in the middle, the Load coin)
  const cap = R * (label ? 0.15 : 0.11);
  let px = kit.pxForCap('smallCaps', cap);
  ctx.font = kit.font('smallCaps', px);
  const Rt = R * 0.7;
  // shrink a long legend so it never runs more than ~300° around
  const width = ctx.measureText(legend).width;
  const maxArc = Rt * (300 / 180) * Math.PI;
  if (width > maxArc) { px *= maxArc / width; ctx.font = kit.font('smallCaps', px); }
  kit.arc(legend, cx, cy, Rt, px);
  // inner ring between legend and emblem
  ctx.lineWidth = R * 0.025;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.stroke();
  if (label) {
    // Paul, WP-18 item 9: the label in big engraved capitals across the field (no emblem)
    let lp = kit.pxForCap('smallCaps', R * 0.17);
    ctx.font = kit.font('smallCaps', lp);
    const widest = Math.max(...label.map(l => ctx.measureText(l).width));
    const room = R * 1.0;
    if (widest > room) { lp *= room / widest; ctx.font = kit.font('smallCaps', lp); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const gap = lp * 1.02;
    label.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (label.length - 1) / 2) * gap));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  // the emblem, inside 45% of the radius
  const s = R * 0.42;
  ctx.lineWidth = R * 0.05;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(cx, cy);
  EMBLEMS[emblem]?.(ctx, s);
  ctx.restore();
}

/** Emblems drawn around (0, 0), size s px (the emblem's half-width). @type {Record<string, (ctx: CanvasRenderingContext2D, s: number) => void>} */
const EMBLEMS = {
  /** Open book. */
  book(ctx, s) {
    const w = s * 0.95, h = s * 0.62;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.75);
      ctx.quadraticCurveTo(side * w * 0.5, -h * 1.0, side * w, -h * 0.8);
      ctx.lineTo(side * w, h * 0.85);
      ctx.quadraticCurveTo(side * w * 0.5, h * 0.65, 0, h * 0.95);
      ctx.closePath();
      ctx.stroke();
      // text lines on the page
      for (let i = 0; i < 3; i++) {
        const yy = -h * 0.35 + i * h * 0.38;
        ctx.beginPath(); ctx.moveTo(side * w * 0.2, yy); ctx.quadraticCurveTo(side * w * 0.5, yy - h * 0.12, side * w * 0.8, yy - h * 0.05); ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.moveTo(0, -h * 0.75); ctx.lineTo(0, h * 0.95); ctx.stroke();
  },
  /** Interlaced diamond, as in the reference: two nested diamonds woven over and under. */
  diamond(ctx, s) {
    const lw = ctx.lineWidth;
    const d = (/** @type {number} */ r) => { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.stroke(); };
    d(s); d(s * 0.62);
    // the woven band: a square turned 45° against the diamonds, broken where it passes under
    ctx.save();
    ctx.rotate(Math.PI / 4);
    const q = s * 0.58;
    ctx.beginPath(); ctx.rect(-q, -q, 2 * q, 2 * q); ctx.stroke();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = lw * 2.4;
    for (const [x, y] of [[q, 0], [-q, 0], [0, q], [0, -q]]) { ctx.beginPath(); ctx.moveTo(x * 0.92 - y * 0.1, y * 0.92 + x * 0.1); ctx.lineTo(x * 0.92 + y * 0.1, y * 0.92 - x * 0.1); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = lw;
    d(s * 0.25);
  },
  /** ↥ upwards arrow from bar. */
  up(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.75); ctx.lineTo(s * 0.6, s * 0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s * 0.55); ctx.lineTo(0, -s * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.35); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.45, -s * 0.35); ctx.stroke();
  },
  /** ↧ downwards arrow to bar. */
  down(ctx, s) {
    ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.8); ctx.lineTo(s * 0.6, s * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.75); ctx.lineTo(0, s * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.1); ctx.lineTo(0, s * 0.55); ctx.lineTo(s * 0.45, s * 0.1); ctx.stroke();
  },
  /** Bell. */
  bell(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.75, s * 0.5);
    ctx.quadraticCurveTo(-s * 0.55, s * 0.35, -s * 0.5, -s * 0.15);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.7, 0, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.45, -s * 0.7, s * 0.5, -s * 0.15);
    ctx.quadraticCurveTo(s * 0.55, s * 0.35, s * 0.75, s * 0.5);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, s * 0.68, s * 0.14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -s * 0.82, s * 0.1, 0, Math.PI * 2); ctx.stroke();
  },
  /** Bell, struck through (the Sound coin's reverse face: muted). */
  'bell-struck'(ctx, s) {
    EMBLEMS.bell(ctx, s);
    ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.85); ctx.lineTo(s * 0.85, -s * 0.85); ctx.stroke();
  },
};
