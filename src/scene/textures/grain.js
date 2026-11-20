// @ts-check
/**
 * Ink grain (512 × 512, alpha 0.85–1.0) and film grain (256 × 256, monochrome). Both are
 * read back once and exported as PNG data URLs: the ink grain for the CSS `mask-image` on
 * printed text (WP-07), the film grain for `#grain`. Both tile.
 */
import { textures as T, ink, post } from '../../config/render.js';

const INK = /* glsl */ `
uniform float uMin;
uniform float uMax;
void main() {
  float n = fbm(vUv * 48.0, ivec2(48), 3, 0.55, uSeed + 1u) * 0.5 + 0.5;
  float pits = step(0.93, rnd(ivec2(gl_FragCoord.xy), uSeed + 2u)) * 0.6;
  float fine = rnd(ivec2(gl_FragCoord.xy), uSeed + 3u);
  float t = clamp(n * 0.6 + fine * 0.4 - pits, 0.0, 1.0);
  gl_FragColor = vec4(1.0, 1.0, 1.0, mix(uMin, uMax, t));
}`;

const FILM = /* glsl */ `
void main() {
  float v = rnd(ivec2(gl_FragCoord.xy), uSeed + 5u);
  gl_FragColor = vec4(vec3(v), 1.0);
}`;

/** @param {import('./gpu.js').Painter} painter @param {number} seed */
export function grainGenerator(painter, seed) {
  const inkRT = painter.target(T.inkGrain.size, T.inkGrain.size, { color: 'linear', mips: false });
  const filmRT = painter.target(post.grainTilePx, post.grainTilePx, { color: 'linear', mips: false });
  return {
    name: 'grain',
    outputs: { ink: inkRT, film: filmRT },
    steps: [
      () => painter.paint(inkRT, INK, { uSeed: { value: seed >>> 0 }, uMin: { value: ink.grainAlphaMin }, uMax: { value: ink.grainAlphaMax } }),
      () => painter.paint(filmRT, FILM, { uSeed: { value: seed >>> 0 } }),
    ],
  };
}
