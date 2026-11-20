// @ts-check
/**
 * Layer 4, #glow (file 05, WP-07 step 7): what makes the paper and its text brighter.
 *
 *   Spark light pool   a warm 2,700 K radial pool, 18 cm range on the paper projected to the
 *                      screen (so it is an ellipse under the camera's tilt), flickering
 *                      0.85–1.1 at 12 Hz (file 04 "Spark"). WP-09 moves it with the spark;
 *                      until then only `setSpark` (tests, the self-check) turns it on.
 *   Veil excess        light on the paper above 1.0 (the veil itself never exceeds 1.0),
 *                      re-captured when the camera moves (at most 4× a second).
 *   Hooks              `sheen` (WP-10 wet-ink and wash sheen) and `ripple` (WP-11 drop ripple):
 *                      painters drawn into this layer every frame while registered.
 *
 * #glow is blended with `screen`, so black is no change and nothing here can darken.
 */
import { spark as MS } from '../config/motion.js';
import { kelvinToColor } from '../scene/lights.js';
import { clock } from '../util/clock.js';

/** Strength of the pool's centre at flicker 1 (screen-blend alpha). Builder value (render.js would be the home once WP-09 tunes it). */
export const POOL_STRENGTH = 0.42;
/** Seconds between veil-excess captures while the camera moves. */
const EXCESS_EVERY_MS = 250;

/**
 * @param {{ overlays: any, project: (x: number, y: number, z?: number) => {x: number, y: number}, veil: any, camera: any, rng: { next(): number } }} o
 */
export function createGlow(o) {
  const c = kelvinToColor(MS.lightKelvin);
  const rgb = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)].join(', ');

  // ── Spark light pool ──────────────────────────────────────────────────────────────────
  /** @type {{x: number, y: number, boost: number} | null} */
  let spark = null;
  // flicker: a new random level 12 times a second, eased between levels
  let flickFrom = 1, flickTo = 1, flickT = 0, flicker = 1;
  const nextLevel = () => MS.lightFlickerMin + o.rng.next() * (MS.lightFlickerMax - MS.lightFlickerMin);
  // Frame time (scaled clock ms), handed in by the veil phase: this layer never reads the clock
  // itself after the renders (see frame.js profilePhases on why that matters for fake clocks).
  let frameT = clock.now(), lastT = frameT;
  /** @param {CanvasRenderingContext2D} ctx */
  function paintPool(ctx) {
    if (!spark) return;
    const now = frameT, dt = Math.max(0, now - lastT); lastT = now;
    const period = 1000 / MS.lightFlickerHz;
    flickT += dt;
    while (flickT >= period) { flickT -= period; flickFrom = flickTo; flickTo = nextLevel(); }
    const u = flickT / period, e = u * u * (3 - 2 * u);
    flicker = flickFrom + (flickTo - flickFrom) * e;
    const ctr = o.project(spark.x, spark.y, 0);
    const ex = o.project(spark.x + MS.lightRange, spark.y, 0), ey = o.project(spark.x, spark.y + MS.lightRange, 0);
    const rx = Math.max(1, Math.hypot(ex.x - ctr.x, ex.y - ctr.y)), ry = Math.max(1, Math.hypot(ey.x - ctr.x, ey.y - ctr.y));
    const a = POOL_STRENGTH * flicker * (1 + spark.boost);
    ctx.save();
    ctx.translate(ctr.x, ctr.y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    // physically: light falls off with distance; a smooth 1 − d² curve to zero at the range
    for (const [s, k] of [[0, 1], [0.25, 0.86], [0.5, 0.56], [0.75, 0.22], [1, 0]]) g.addColorStop(s, `rgba(${rgb}, ${(a * k).toFixed(4)})`);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  // ── Veil excess ───────────────────────────────────────────────────────────────────────
  const excess = document.createElement('canvas');
  const ex = /** @type {CanvasRenderingContext2D} */ (excess.getContext('2d', { willReadFrequently: true }));
  let excessVersion = -1, excessAt = -Infinity, excessAny = false, excessMax = 0;
  let reading = false, asyncFailed = false;
  /** @type {ImageData | null} */ let excessImage = null;
  /**
   * The async readback's pixels (bottom-up rows) into the excess canvas, and its brightest value.
   * @param {Uint8Array} d @param {number} w @param {number} h
   */
  function useExcess(d, w, h) {
    if (excess.width !== w || excess.height !== h) { excess.width = w; excess.height = h; }
    if (!excessImage || excessImage.width !== w || excessImage.height !== h) excessImage = ex.createImageData(w, h);
    const out = excessImage.data, row = w * 4;
    let m = 0;
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * row;
      out.set(d.subarray(from, from + row), y * row);
    }
    for (let i = 0; i < d.length; i += 16) m = Math.max(m, d[i], d[i + 1], d[i + 2]);
    ex.putImageData(excessImage, 0, 0);
    excessMax = m / 255;
    excessAny = m > 1;
  }
  /** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h */
  function paintExcess(ctx, w, h) {
    if (!excessAny) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(excess, 0, 0, w, h);
    ctx.restore();
  }

  // ── Hooks for WP-10 / WP-11 ───────────────────────────────────────────────────────────
  /** @typedef {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} Painter */
  /** @type {Set<Painter>} */ const sheen = new Set();
  /** @type {Set<Painter>} */ const ripple = new Set();
  /** @type {Painter} */
  const painter = (ctx, w, h) => {
    paintExcess(ctx, w, h);
    paintPool(ctx);
    for (const p of sheen) p(ctx, w, h);
    for (const p of ripple) p(ctx, w, h);
  };
  /** @type {Painter} */
  const paintStatic = (ctx, w, h) => paintExcess(ctx, w, h);
  // Animated things (the pool's flicker, sheen, ripple) repaint every frame; the veil excess
  // alone is a still picture, painted once per capture (overlays.js `glowStatic`).
  const sync = () => {
    const ov = o.overlays;
    if (spark || sheen.size || ripple.size) { ov.glowPainters.add(painter); ov.glowStatic?.delete(paintStatic); }
    else {
      ov.glowPainters.delete(painter);
      if (excessAny && ov.glowStatic) ov.glowStatic.add(paintStatic);
      else { ov.glowStatic?.delete(paintStatic); if (excessAny) ov.glowPainters.add(painter); }
    }
    ov.markGlowDirty?.();
  };

  return {
    /**
     * Turn the spark's light pool on at paper point (x, y) cm, or off with null.
     * @param {{x: number, y: number, hover?: boolean} | null} s
     */
    setSpark(s) {
      spark = s ? { x: s.x, y: s.y, boost: s.hover ? MS.hoverLightBoost : 0 } : null;
      lastT = frameT;
      sync();
    },
    /**
     * Called once per frame around the veil's render. WP-14: called just before the stage's own
     * veil pass (`restore` false), whose normal render then also restores the canvas.
     * @param {number} cameraVersion @param {number} [t] frame time (ms) @param {boolean} [restore]
     */
    afterVeil(cameraVersion, t = frameT, restore = true) {
      frameT = t;
      const now = t;
      if (cameraVersion === excessVersion || now - excessAt < EXCESS_EVERY_MS || reading) return;
      excessVersion = cameraVersion; excessAt = now;
      // WP-14: read back asynchronously where the veil can (no GPU stall in the frame)
      if (o.veil.readExcess && !asyncFailed) {
        reading = true;
        o.veil.readExcess(o.camera).then((/** @type {{data: Uint8Array, w: number, h: number} | null} */ r) => {
          reading = false;
          if (!r) { asyncFailed = true; excessVersion = -1; return; }
          useExcess(r.data, r.w, r.h);
          sync();
        }, () => { reading = false; asyncFailed = true; excessVersion = -1; });
        return;
      }
      o.veil.renderExcess?.(o.camera, (/** @type {HTMLCanvasElement} */ src) => {
        const w = Math.max(1, Math.round(src.width / 4)), h = Math.max(1, Math.round(src.height / 4));
        if (excess.width !== w || excess.height !== h) { excess.width = w; excess.height = h; }
        ex.globalCompositeOperation = 'copy';
        ex.drawImage(src, 0, 0, w, h);
        ex.globalCompositeOperation = 'source-over';
        // anything above zero? (a small readback of the quarter-size copy)
        const d = ex.getImageData(0, 0, w, h).data;
        let m = 0;
        for (let i = 0; i < d.length; i += 16) m = Math.max(m, d[i], d[i + 1], d[i + 2]);
        excessMax = m / 255;
        excessAny = m > 1;
      }, restore);
      sync();
    },
    invalidate() { excessVersion = -1; excessAt = -Infinity; },
    hooks: {
      /** @param {Painter} p */ addSheen(p) { sheen.add(p); sync(); return () => { sheen.delete(p); sync(); }; },
      /** @param {Painter} p */ addRipple(p) { ripple.add(p); sync(); return () => { ripple.delete(p); sync(); }; },
    },
    read: () => ({ spark: spark ? { ...spark } : null, flicker: +flicker.toFixed(3), excessAny, excessMax: +excessMax.toFixed(3), kelvin: MS.lightKelvin, rangeCm: MS.lightRange }),
  };
}
