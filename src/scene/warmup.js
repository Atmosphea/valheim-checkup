// @ts-check
/**
 * WP-05 step 7: while the textures are generated, the desk fades up from candle-dark, like a
 * lamp warming, over 800 ms. Layer 1 ramps its exposure and warms its key light from candle
 * colour to 3,200 K; layer 3 (the veil) dims the paper and the text printed on it the same way.
 * The fade never finishes before the textures do: lit share = min(time share, floor + rest × progress).
 */
import * as THREE from 'three';
import { textures as T, output } from '../config/render.js';
import { kelvinToColor } from './lights.js';

/**
 * @param {{ renderer: THREE.WebGLRenderer, key: THREE.DirectionalLight, veil: { setLightScale(k: number, warmth: number): void } }} o
 */
export function createWarmup(o) {
  const full = o.key.color.clone();
  const candle = kelvinToColor(T.fadeStartKelvin);
  const fullIntensity = o.key.intensity;
  let elapsed = 0, progress = 0, done = false;
  /** @type {(() => void)[]} */ const onDone = [];
  const ease = (/** @type {number} */ x) => 1 - Math.pow(1 - x, 3);

  function apply(/** @type {number} */ f) {
    o.renderer.toneMappingExposure = THREE.MathUtils.lerp(T.fadeStartExposure, output.exposure, f);
    o.key.color.copy(candle).lerp(full, f);
    o.key.intensity = fullIntensity * (0.35 + 0.65 * f);
    o.veil.setLightScale(THREE.MathUtils.lerp(T.fadeStartExposure, 1, f), 1 - f);
  }
  apply(0);

  return {
    /** @param {number} p 0..1 texture progress */
    setProgress(p) { progress = p; },
    /** @param {number} dtMs */
    update(dtMs) {
      if (done) return;
      elapsed += dtMs;
      const timeShare = Math.min(1, elapsed / T.fadeMs);
      const lit = Math.min(timeShare, T.fadeProgressFloor + (1 - T.fadeProgressFloor) * progress);
      apply(ease(lit));
      if (lit >= 1) { done = true; for (const f of onDone) f(); }
    },
    /** Skip to fully lit (tests, or if generation fails). */
    finish() { if (!done) { apply(1); done = true; for (const f of onDone) f(); } },
    /** @param {() => void} f */
    onDone(f) { if (done) f(); else onDone.push(f); },
    get state() { return { elapsed, progress, done, exposure: o.renderer.toneMappingExposure }; },
  };
}
