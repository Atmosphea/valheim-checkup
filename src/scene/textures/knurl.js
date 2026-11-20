// @ts-check
/**
 * Knurl, 256 × 256: a diamond knurl normal map (two crossing sets of grooves leave rows of
 * small pyramids), for the knob ends. Tiles in both directions.
 */
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T } from '../../config/render.js';

const KNURL = /* glsl */ `
uniform float uCount;
void main() {
  float a = fract((vUv.x + vUv.y) * uCount);
  float b = fract((vUv.x - vUv.y) * uCount);
  float h = min(1.0 - abs(2.0 * a - 1.0), 1.0 - abs(2.0 * b - 1.0));
  h = smoothstep(0.0, 0.9, h);                      // flat-ish tops, sharp grooves
  h += (rnd(ivec2(gl_FragCoord.xy), uSeed) - 0.5) * 0.03;  // a little machining noise
  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}`;

/** @param {import('./gpu.js').Painter} painter @param {number} seed */
export function knurlGenerator(painter, seed) {
  const K = T.knurl;
  const height = painter.target(K.size, K.size, { color: 'float' });
  const normal = painter.target(K.size, K.size, { color: 'linear' });
  return {
    name: 'knurl',
    outputs: { normal },
    steps: [
      () => painter.paint(height, KNURL, { uSeed: { value: seed >>> 0 }, uCount: { value: K.diamonds } }),
      () => { painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: { value: seed >>> 0 }, uHeight: { value: height.texture }, uStrength: { value: K.normalStrength }, uAlphaFrom: { value: 0 } }); painter.release(height); },
    ],
  };
}
