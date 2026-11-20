// @ts-check
/**
 * Layers 4, 6 and 7 (file 05):
 *   4  canvas#glow   2D, `screen` blend: spark light pool, ink sheen, magic ripples (WP-09/10)
 *   6  canvas#fx     2D, normal blend, `lighter` compositing inside: spark core, trail, embers (WP-09)
 *   7  div#grain     film grain (256 px monochrome tile, re-offset at 24 fps, 10%) and an 18% vignette
 *
 * The 2D canvases only redraw when something asked them to, so an idle desk costs nothing here.
 */
import { post as postCfg, stage as S } from '../config/render.js';

/**
 * @param {{ glow: HTMLCanvasElement, fx: HTMLCanvasElement, grain: HTMLElement }} els
 * @param {{ next(): number }} rng
 */
export function createOverlays(els, rng) {
  const glow = /** @type {CanvasRenderingContext2D} */ (els.glow.getContext('2d'));
  const fx = /** @type {CanvasRenderingContext2D} */ (els.fx.getContext('2d'));
  /** @type {{x: number, y: number, r: number, strength: number}[]} */
  const glowSpots = [];
  let glowDirty = true, fxDirty = true;
  let pr = 1, cssW = 1, cssH = 1;
  /** Painters other modules register (WP-09/10): called with (ctx, cssWidth, cssHeight) after a clear. */
  /** @type {Set<(ctx: CanvasRenderingContext2D, w: number, h: number) => boolean | void>} */
  const glowPainters = new Set();
  /** @type {Set<(ctx: CanvasRenderingContext2D, w: number, h: number) => boolean | void>} */
  const fxPainters = new Set();
  /**
   * WP-07: glow painters whose picture only changes when they say so (`markGlowDirty`): drawn on
   * a repaint, never per frame. Repainting the full-screen #glow every frame makes the browser
   * re-composite the whole blended layer stack every frame (seconds per second on SwiftShader).
   * @type {Set<(ctx: CanvasRenderingContext2D, w: number, h: number) => void>}
   */
  const glowStatic = new Set();

  // Grain: a seeded noise tile at 10%, and a vignette, both inside #grain.
  const noise = document.createElement('div');
  noise.className = 'vc-grain-noise';
  noise.style.opacity = String(postCfg.grainIntensity);
  noise.style.backgroundImage = `url(${noiseTile(postCfg.grainTilePx, rng)})`;
  const vignette = document.createElement('div');
  vignette.className = 'vc-grain-vignette';
  vignette.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(S.vignetteInner * 100)}%, rgba(0,0,0,${postCfg.vignette}) 100%)`;
  els.grain.append(noise, vignette);
  let grainClock = 0;
  let grainOn = true;
  let grainStill = false;

  /** @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} c */
  const clear = (ctx, c) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.setTransform(pr, 0, 0, pr, 0, 0); };

  return {
    /** @param {number} w @param {number} h @param {number} pixelRatio */
    setSize(w, h, pixelRatio) {
      cssW = w; cssH = h; pr = pixelRatio;
      for (const c of [els.glow, els.fx]) { c.width = Math.max(1, Math.round(w * pr)); c.height = Math.max(1, Math.round(h * pr)); }
      glowDirty = fxDirty = true;
    },
    /** Grain on/off (`flat` quality turns post effects off). @param {boolean} on */
    setGrain(on) { grainOn = on; noise.style.display = on ? '' : 'none'; },
    /**
     * WP-07: keep the grain but stop it moving (software renderers): every move repaints a
     * full-screen layer and re-composites the blended stack, 58 → 10 frames/s on SwiftShader.
     * @param {boolean} still
     */
    setGrainStill(still) { grainStill = !!still; },
    /** @param {number} dtMs scaled ms */
    updateGrain(dtMs) {
      if (!grainOn || grainStill) return;
      grainClock += dtMs;
      const step = 1000 / postCfg.grainFps;
      if (grainClock < step) return;
      grainClock %= step;
      const t = postCfg.grainTilePx;
      noise.style.backgroundPosition = `${Math.floor(rng.next() * t)}px ${Math.floor(rng.next() * t)}px`;
    },
    render() {
      if (glowDirty || glowPainters.size) {
        clear(glow, els.glow);
        for (const s of glowSpots) {
          const g = glow.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
          g.addColorStop(0, `rgba(255, 196, 120, ${s.strength})`);
          g.addColorStop(1, 'rgba(255, 196, 120, 0)');
          glow.fillStyle = g;
          glow.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        for (const p of glowStatic) p(glow, cssW, cssH);
        for (const p of glowPainters) p(glow, cssW, cssH);
        glowDirty = false;
      }
      if (fxDirty || fxPainters.size) {
        clear(fx, els.fx);
        fx.globalCompositeOperation = 'lighter';
        for (const p of fxPainters) p(fx, cssW, cssH);
        fx.globalCompositeOperation = 'source-over';
        fxDirty = false;
      }
    },
    /** Test glow (acceptance item 3), screen px. @param {{x: number, y: number, r?: number, strength?: number}} s */
    addGlowSpot(s) { glowSpots.push({ r: 120, strength: 0.6, ...s }); glowDirty = true; },
    clearGlow() { glowSpots.length = 0; glowDirty = true; },
    /** Repaint #glow on the next frame (for `glowStatic` painters). */
    markGlowDirty() { glowDirty = true; },
    /** Paul, WP-17 item 10a: something on #glow or #fx is moving (a painter is registered). */
    animating: () => glowPainters.size > 0 || [...fxPainters].some(p => !(/** @type {any} */ (p).idle?.())),
    glowPainters,
    glowStatic,
    fxPainters,
    get grainPosition() { return noise.style.backgroundPosition; },
    /** WP-05: swap the startup noise tile for the GPU-generated film grain. @param {string} url */
    setGrainTile(url) { if (url) noise.style.backgroundImage = `url(${url})`; },
    get grainTile() { return noise.style.backgroundImage; },
  };
}

/**
 * A seeded monochrome noise tile as a PNG data URL.
 * @param {number} size @param {{ next(): number }} rng
 */
export function noiseTile(size, rng) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rng.next() * 256);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
