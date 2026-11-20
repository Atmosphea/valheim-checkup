// @ts-check
/**
 * Walnut, 1,024 × 2,048: albedo, normal and roughness for the oiled woodblock and the desk.
 * The texture covers 24 × 48 cm of wood and tiles seamlessly in both directions.
 *
 *  - growth rings running along the board's height (v), warped into gentle waves and arches
 *  - ray flecks: short, slightly lighter lenses across the rings
 *  - open pores: fine dark dashes along the grain
 *  - slow colour variation between chocolate and lighter brown
 * Normal and roughness come from the same grain: latewood and pores sit lower and rougher.
 */
import * as THREE from 'three';
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T } from '../../config/render.js';

const WOOD = /* glsl */ `
uniform vec2 uCm;            // 24, 48: the patch of wood one texture covers
uniform float uRingsPerCm;   // rings across u (24 * this is a whole number, so u tiles)
uniform vec3 uEarly;
uniform vec3 uLate;
uniform vec3 uLight;
uniform int uOut;            // 0 = albedo, 1 = height (R) for the normal pass, 2 = roughness
uniform float uRough;

void main() {
  vec2 p = vUv * uCm;
  vec2 q = vUv;                                   // 0..1 over one period
  // rings wander gently along the grain (v) and their spacing varies across it (u)
  float warp = fbm(q * vec2(2.0, 2.0), ivec2(2, 2), 3, 0.45, uSeed + 3u) * 1.3
             + fbm(q * vec2(4.0, 1.0), ivec2(4, 1), 2, 0.5, uSeed + 5u) * 0.25;
  float spacing = fbm(q * vec2(16.0, 1.0), ivec2(16, 1), 3, 0.5, uSeed + 9u) * 0.9;  // in rings
  float r = (p.x + warp) * uRingsPerCm + spacing;
  float ring = fract(r);
  float late = smoothstep(0.55, 0.85, ring) * (1.0 - smoothstep(0.9, 1.0, ring));
  float ringIndex = mod(floor(r), floor(uCm.x * uRingsPerCm + 0.5));  // wraps with u
  float ringW = 0.35 + 0.65 * rnd(ivec2(int(ringIndex), 0), uSeed + 7u);
  late *= ringW;

  // pores: fine dashes along the grain
  float pn = gnoise(q * vec2(384.0, 72.0), ivec2(384, 72), uSeed + 11u);
  float pores = smoothstep(0.45, 0.85, pn) * (0.5 + 0.5 * late);
  // ray flecks: short lenses across the grain
  vec3 wc = worley(q * vec2(18.0, 144.0), ivec2(18, 144), 0.9, uSeed + 13u);
  float fleck = (1.0 - smoothstep(0.0, 0.22, wc.x)) * step(0.78, wc.z);
  // slow colour variation
  float tone = fbm(q * vec2(2.0, 3.0), ivec2(2, 3), 3, 0.5, uSeed + 17u);
  float streak = fbm(q * vec2(24.0, 1.0), ivec2(24, 1), 3, 0.55, uSeed + 19u)
               + fbm(q * vec2(96.0, 2.0), ivec2(96, 2), 2, 0.5, uSeed + 23u) * 0.4;

  if (uOut == 1) {
    float h = 0.5 - late * 0.25 - pores * 0.45 + fleck * 0.08 + streak * 0.05;
    gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
    return;
  }
  if (uOut == 2) {
    float ro = uRough + late * 0.05 + pores * 0.14 - fleck * 0.05 + streak * 0.02;
    gl_FragColor = vec4(1.0, clamp(ro, 0.0, 1.0), 0.0, 1.0);
    return;
  }
  vec3 c = mix(uEarly, uLate, late * 0.5);
  c = mix(c, uLight, clamp(tone * 0.9 + 0.25, 0.0, 1.0) * 0.4);
  c *= 0.92 + streak * 0.3;
  c = mix(c, c * 0.45, pores);
  c = mix(c, uLight * 1.15, fleck * 0.35);
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * @param {import('./gpu.js').Painter} painter
 * @param {number} seed
 * @param {number} maxAnisotropy
 */
export function walnutGenerator(painter, seed, maxAnisotropy) {
  const W = T.walnut;
  const [w, h] = W.size;
  const albedo = painter.target(w, h, { color: 'srgb', anisotropy: maxAnisotropy });
  const height = painter.target(w, h, { color: 'float' });
  const normal = painter.target(w, h, { color: 'linear', anisotropy: maxAnisotropy });
  const rough = painter.target(w / 2, h / 2, { color: 'linear' });
  const u = (/** @type {number} */ out) => ({
    uSeed: { value: seed >>> 0 }, uCm: { value: new THREE.Vector2(...W.cm) }, uRingsPerCm: { value: W.ringsPerCm },
    uEarly: { value: new THREE.Color(...W.early) }, uLate: { value: new THREE.Color(...W.late) }, uLight: { value: new THREE.Color(...W.light) },
    uOut: { value: out }, uRough: { value: W.roughness },
  });
  return {
    name: 'walnut',
    outputs: { albedo, normal, roughness: rough },
    steps: [
      () => painter.paint(albedo, WOOD, u(0)),
      () => painter.paint(height, WOOD, u(1)),
      () => { painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: { value: seed >>> 0 }, uHeight: { value: height.texture }, uStrength: { value: W.normalStrength }, uAlphaFrom: { value: 0 } }); painter.release(height); },
      () => painter.paint(rough, WOOD, u(2)),
    ],
  };
}
