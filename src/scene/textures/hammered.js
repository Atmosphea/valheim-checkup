// @ts-check
/**
 * Hammered gold, 512 × 512: soft dents and wear for the coins. Tiles in both directions.
 *   normal: overlapping shallow bowls (hammer blows) plus fine wear
 *   data:   R = micro-scratch mask 0..1, G = gold roughness (absolute), B = dent depth
 * The polished gauntlet steel reuses the same map for its faint dents (strength 0.05) and the
 * scratch mask for its 0.09–0.18 roughness.
 */
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T, materials as M } from '../../config/render.js';

const DENTS = /* glsl */ `
uniform int uOut;      // 0 = height, 1 = data
uniform float uRough;
void main() {
  vec2 q = vUv;
  vec3 a = worley(q * 7.0, ivec2(7), 0.85, uSeed + 1u);
  vec3 b = worley(q * 13.0 + 0.37, ivec2(13), 0.9, uSeed + 2u);
  vec3 c = worley(q * 23.0 + 0.71, ivec2(23), 0.9, uSeed + 3u);
  float dents = a.x * a.x * 0.6 + b.x * b.x * 0.3 + c.x * c.x * 0.12;
  // wear scratches: thin ridged lines in a few directions
  float sc = 0.0;
  for (int k = 0; k < 3; k++) {
    float ang = float(k) * 2.1 + rnd(ivec2(k, 9), uSeed) * 1.5;
    vec2 dir = vec2(cos(ang), sin(ang));
    // keep the direction on whole lattice steps so the pattern still tiles
    vec2 d = floor(dir * 4.0 + 0.5);
    float along = dot(q, d);
    float across = dot(q, vec2(-d.y, d.x));
    float n = gnoise(vec2(along * 3.0, across * 90.0), ivec2(3, 90), uSeed + uint(k) * 7u);
    float gate = smoothstep(0.1, 0.6, gnoise(q * 5.0, ivec2(5), uSeed + uint(k) * 11u));
    sc = max(sc, pow(1.0 - abs(n), 18.0) * gate);
  }
  float fine = fbm(q * 32.0, ivec2(32), 3, 0.5, uSeed + 5u);
  if (uOut == 0) { gl_FragColor = vec4(dents - sc * 0.03 + fine * 0.01, 0.0, 0.0, 1.0); return; }
  float rough = uRough + (a.x - 0.4) * 0.05 + sc * 0.06 + fine * 0.02;
  gl_FragColor = vec4(sc, clamp(rough, 0.0, 1.0), clamp(1.0 - a.x, 0.0, 1.0), 1.0);
}`;

/** @param {import('./gpu.js').Painter} painter @param {number} seed @param {number} maxAnisotropy */
export function hammeredGenerator(painter, seed, maxAnisotropy) {
  const H = T.hammered;
  const height = painter.target(H.size, H.size, { color: 'float' });
  const normal = painter.target(H.size, H.size, { color: 'linear', anisotropy: maxAnisotropy });
  const data = painter.target(H.size, H.size, { color: 'linear', anisotropy: maxAnisotropy });
  const u = (/** @type {number} */ out) => ({ uSeed: { value: seed >>> 0 }, uOut: { value: out }, uRough: { value: M.gold.roughness } });
  return {
    name: 'hammered',
    outputs: { normal, data },
    steps: [
      () => painter.paint(height, DENTS, u(0)),
      () => { painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: { value: seed >>> 0 }, uHeight: { value: height.texture }, uStrength: { value: H.normalStrength }, uAlphaFrom: { value: 0 } }); painter.release(height); },
      () => painter.paint(data, DENTS, u(1)),
    ],
  };
}
