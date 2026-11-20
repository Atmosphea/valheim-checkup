// @ts-check
/**
 * Leather, 512 × 512: a cellular (pebble) grain normal map for the under-glove. Tiles.
 */
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T } from '../../config/render.js';

const GRAIN = /* glsl */ `
void main() {
  vec3 a = worley(vUv * 18.0, ivec2(18), 0.95, uSeed + 1u);
  vec3 b = worley(vUv * 47.0, ivec2(47), 0.95, uSeed + 2u);
  float pebble = smoothstep(0.0, 0.16, a.y - a.x);
  float small = smoothstep(0.0, 0.2, b.y - b.x);
  float wrinkle = pow(1.0 - abs(gnoise(vUv * vec2(6.0, 40.0), ivec2(6, 40), uSeed + 3u)), 10.0);
  float h = pebble * 0.65 + small * 0.25 + fbm(vUv * 64.0, ivec2(64), 2, 0.5, uSeed + 4u) * 0.08 - wrinkle * 0.2;
  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}`;

/** @param {import('./gpu.js').Painter} painter @param {number} seed */
export function leatherGenerator(painter, seed) {
  const Lt = T.leather;
  const height = painter.target(Lt.size, Lt.size, { color: 'float' });
  const normal = painter.target(Lt.size, Lt.size, { color: 'linear' });
  return {
    name: 'leather',
    outputs: { normal },
    steps: [
      () => painter.paint(height, GRAIN, { uSeed: { value: seed >>> 0 } }),
      () => { painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: { value: seed >>> 0 }, uHeight: { value: height.texture }, uStrength: { value: Lt.normalStrength }, uAlphaFrom: { value: 0 } }); painter.release(height); },
    ],
  };
}
