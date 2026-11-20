// @ts-check
/**
 * The breeze field (file 04 world rule 4, DECISIONS point 20; owned by WP-06).
 *
 * A 32 × 24 grid over the main sheet. Each cell holds the speed of the air above it in cm/s.
 * Fast-moving things (the gauntlet and spark from WP-09, a dragged bar, a lifted sheet) write
 * into it; paper, tags, slips and embers read it. Every cell decays with a half-life of
 * `breezeDecay` (600 ms, DECISIONS WP-01 open point 2).
 *
 *   breeze.write(x, y, speed, radius)   stir the air around a point (cm, cm/s, cm)
 *   breeze.sample(x, y)                  air speed at a point (bilinear), cm/s
 *   breeze.paperLift(x, y)               min(0.25 cm, speed × 0.002)
 *   breeze.tagSwingDeg(x, y)             min(8°, speed × 0.05)
 *   breeze.step(dtMs)                    decay (the desk stage calls it once per frame)
 *
 * Pure logic, no three.js, so it is unit-tested in Node.
 */
import { world as W } from '../config/motion.js';
import { sheet } from '../config/layout.js';

/**
 * @param {{ x0?: number, x1?: number, y0?: number, y1?: number, cols?: number, rows?: number, halfLifeMs?: number }} [o]
 */
export function createBreeze(o = {}) {
  const x0 = o.x0 ?? sheet.x0, x1 = o.x1 ?? sheet.x1, y0 = o.y0 ?? sheet.y0, y1 = o.y1 ?? sheet.y1;
  const cols = o.cols ?? W.breezeGridCols, rows = o.rows ?? W.breezeGridRows;
  const halfLife = o.halfLifeMs ?? W.breezeDecay;
  const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
  const cells = new Float32Array(cols * rows);
  let peak = 0;

  /** Cell centre coordinates → fractional grid index. */
  const gx = (/** @type {number} */ x) => (x - x0) / cw - 0.5;
  const gy = (/** @type {number} */ y) => (y - y0) / ch - 0.5;

  return {
    cols, rows, cells,
    /**
     * Stir the air: cells within `radius` rise to at least speed × falloff (air speed is not
     * additive; a second pass over the same spot doesn't double it).
     * @param {number} x @param {number} y @param {number} speed cm/s @param {number} [radius] cm
     */
    write(x, y, speed, radius = 5) {
      if (!(speed > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const c0 = Math.max(0, Math.floor((x - radius - x0) / cw)), c1 = Math.min(cols - 1, Math.floor((x + radius - x0) / cw));
      const r0 = Math.max(0, Math.floor((y - radius - y0) / ch)), r1 = Math.min(rows - 1, Math.floor((y + radius - y0) / ch));
      for (let r = r0; r <= r1; r++) {
        const cy = y0 + (r + 0.5) * ch;
        for (let c = c0; c <= c1; c++) {
          const cx = x0 + (c + 0.5) * cw;
          const d = Math.hypot(cx - x, cy - y);
          if (d > radius) continue;
          const f = 1 - (d / radius) ** 2;
          const v = speed * f;
          const i = r * cols + c;
          if (v > cells[i]) cells[i] = v;
          if (v > peak) peak = v;
        }
      }
    },
    /** Air speed at (x, y), bilinear between cell centres; 0 off the grid. @param {number} x @param {number} y */
    sample(x, y) {
      const fx = gx(x), fy = gy(y);
      if (fx < -0.5 || fy < -0.5 || fx > cols - 0.5 || fy > rows - 0.5) return 0;
      const cx = Math.max(0, Math.min(cols - 1, fx)), cy = Math.max(0, Math.min(rows - 1, fy));
      const i0 = Math.floor(cx), j0 = Math.floor(cy), i1 = Math.min(cols - 1, i0 + 1), j1 = Math.min(rows - 1, j0 + 1);
      const tx = cx - i0, ty = cy - j0;
      const a = cells[j0 * cols + i0], b = cells[j0 * cols + i1], c = cells[j1 * cols + i0], d = cells[j1 * cols + i1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
    /** DECISIONS point 20. @param {number} x @param {number} y */
    paperLift(x, y) { return Math.min(W.breezePaperLiftMax, this.sample(x, y) * W.breezePaperLiftPerSpeed); },
    /** DECISIONS point 20. @param {number} x @param {number} y */
    tagSwingDeg(x, y) { return Math.min(W.breezeTagSwingMaxDeg, this.sample(x, y) * W.breezeTagSwingPerSpeed); },
    /** Decay by the half-life. @param {number} dtMs */
    step(dtMs) {
      if (peak <= 0.01 || !(dtMs > 0)) return;
      const k = Math.pow(0.5, dtMs / halfLife);
      let p = 0;
      for (let i = 0; i < cells.length; i++) { const v = cells[i] * k; cells[i] = v < 0.01 ? 0 : v; if (v > p) p = v; }
      peak = p;
    },
    /** Strongest air anywhere (cm/s). */
    get peak() { return peak; },
    clear() { cells.fill(0); peak = 0; },
  };
}

/** @typedef {ReturnType<typeof createBreeze>} Breeze */

/** The desk's one breeze field. */
export const breeze = createBreeze();
