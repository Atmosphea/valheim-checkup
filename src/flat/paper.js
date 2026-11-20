// @ts-check
/**
 * WP-13 step 1 · the parchment for flat mode, made on a 2D canvas (flat mode may have no WebGL).
 *
 * One seamless tile: a warm base, large soft stains, medium mottling, fine grain and short
 * fibres, all from a periodic value-noise lattice so the tile wraps without a seam. The colours
 * are the desk paper's (file 05 paper albedo, as layer 1 shows it: `--vc-paper-tone` #f3dfbd),
 * a little darker at the stains.
 *
 * `paperPixels()` is pure (unit-tested in Node); `makePaperUrl()` paints it in idle time so the
 * page's first paint never waits for it (WP-14: no long task over 100 ms).
 */
import { Rng } from '../util/rng.js';
import { flat as CF } from '../config/render.js';
import { clock } from '../util/clock.js';

/**
 * Periodic value noise: a `cells` × `cells` lattice of random values, smoothly interpolated.
 * @param {Rng} rng @param {number} cells
 */
function lattice(rng, cells) {
  const v = new Float32Array(cells * cells);
  for (let i = 0; i < v.length; i++) v[i] = rng.next();
  /** @param {number} u 0..1 @param {number} w 0..1 */
  return (u, w) => {
    const x = u * cells, y = w * cells;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i0 = ((x0 % cells) + cells) % cells, i1 = (i0 + 1) % cells;
    const j0 = ((y0 % cells) + cells) % cells, j1 = (j0 + 1) % cells;
    const a = v[j0 * cells + i0], b = v[j0 * cells + i1], c = v[j1 * cells + i0], d = v[j1 * cells + i1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

/**
 * RGBA pixels of one parchment tile.
 * @param {number} size  tile edge in px
 * @param {number} seed
 * @returns {Uint8ClampedArray}
 */
export function paperPixels(size, seed) {
  const rng = new Rng(seed >>> 0);
  const stain = lattice(rng, 3), stain2 = lattice(rng, 5), mottle = lattice(rng, 12), fine = lattice(rng, 48);
  const [br, bg, bb] = CF.paperBase;
  const out = new Uint8ClampedArray(size * size * 4);
  // grain: a cheap per-pixel hash (the same every run for a seed)
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let y = 0; y < size; y++) {
    const w = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = (h ^ (h + Math.imul(h ^ (h >>> 7), 0x297a2d39))) >>> 0;
      const g = ((h >>> 8) & 0xffff) / 65535 - 0.5;
      const s = (stain(u, w) * 0.65 + stain2(u, w) * 0.35) - 0.5;
      const m = mottle(u, w) - 0.5;
      const f = fine(u, w) - 0.5;
      // darkening in "ink units": stains are wide and warm (less blue), grain is neutral
      const d = s * CF.stain + m * CF.mottle + f * CF.fibre + g * CF.grain;
      const i = (y * size + x) * 4;
      out[i] = br * (1 + d);
      out[i + 1] = bg * (1 + d * 1.08);
      out[i + 2] = bb * (1 + d * 1.25);
      out[i + 3] = 255;
    }
  }
  // fibres: short pale and dark strokes, wrapped at the edges
  const n = Math.round(size * size * CF.fibresPer1000Px / 1000);
  for (let k = 0; k < n; k++) {
    let x = rng.next() * size, y = rng.next() * size;
    const a = rng.range(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI / 2) * 0.2;
    const len = rng.range(6, 22);
    const dark = rng.chance(0.55);
    const amt = rng.range(0.02, 0.05) * (dark ? -1 : 0.7);
    for (let t = 0; t < len; t++) {
      x += Math.cos(a); y += Math.sin(a) + rng.range(-0.3, 0.3);
      const xi = ((Math.round(x) % size) + size) % size, yi = ((Math.round(y) % size) + size) % size;
      const i = (yi * size + xi) * 4;
      out[i] *= 1 + amt; out[i + 1] *= 1 + amt; out[i + 2] *= 1 + amt * 1.2;
    }
  }
  return out;
}

/**
 * Paint the tile on a canvas and hand back a data URL (PNG). Runs when the browser is idle.
 * @param {number} seed
 * @returns {Promise<string>}
 */
export function makePaperUrl(seed) {
  return new Promise(resolve => {
    const run = () => {
      const size = CF.paperTilePx;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(''); return; }
      ctx.putImageData(new ImageData(/** @type {any} */ (paperPixels(size, seed)), size, size), 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    clock.idle(run, { timeoutMs: 600 }); // WP-18P: the central scheduler's idle queue
  });
}
