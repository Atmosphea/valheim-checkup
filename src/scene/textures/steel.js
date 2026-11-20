// @ts-check
/**
 * Brushed steel, 2,048 × 128: roughness (G) and a streak normal map.
 * Streaks are 1D noise across v, stretched along u. The texture itself is 16:1; the material
 * repeats it 25× along the bar, so the streaks end up stretched 400:1 (DECISIONS point 22).
 * Anisotropy direction is along u (the material's anisotropyRotation 0).
 */
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T, materials as M } from '../../config/render.js';

const STREAKS = /* glsl */ `
uniform float uMin;
uniform float uMax;
uniform int uOut;   // 0 = height, 1 = roughness
void main() {
  // 1D noise across the streaks (v), barely changing along u (one cell over the whole width)
  float v = vUv.y, u = vUv.x;
  float s = 0.0, amp = 0.5, norm = 0.0;
  for (int o = 0; o < 6; o++) {
    float f = 16.0 * pow(2.0, float(o));
    int per = int(f);
    s += amp * gnoise(vec2(u * 1.0, v * f), ivec2(1, per), uSeed + uint(o) * 13u);
    norm += amp; amp *= 0.62;
  }
  s /= norm;
  float scratch = pow(1.0 - abs(gnoise(vec2(u * 2.0, v * 512.0), ivec2(2, 512), uSeed + 97u)), 14.0);
  float h = 0.5 + s * 0.5 + scratch * 0.2;
  if (uOut == 0) { gl_FragColor = vec4(h, 0.0, 0.0, 1.0); return; }
  float t = clamp(0.5 + s * 0.9 + scratch * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(1.0, mix(uMin, uMax, t), 0.0, 1.0);
}`;

/** @param {import('./gpu.js').Painter} painter @param {number} seed @param {number} maxAnisotropy */
export function steelGenerator(painter, seed, maxAnisotropy) {
  const [w, h] = T.brushedSteel.size;
  const height = painter.target(w, h, { color: 'float' });
  const normal = painter.target(w, h, { color: 'linear', anisotropy: maxAnisotropy });
  const rough = painter.target(w, h, { color: 'linear', anisotropy: maxAnisotropy });
  const S = M.brushedSteel;
  const u = (/** @type {number} */ out) => ({ uSeed: { value: seed >>> 0 }, uMin: { value: S.roughnessMin }, uMax: { value: S.roughnessMax }, uOut: { value: out } });
  return {
    name: 'brushedSteel',
    outputs: { normal, roughness: rough },
    steps: [
      () => painter.paint(height, STREAKS, u(0)),
      () => { painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: { value: seed >>> 0 }, uHeight: { value: height.texture }, uStrength: { value: T.brushedSteel.normalStrength }, uAlphaFrom: { value: 0 } }); painter.release(height); },
      () => painter.paint(rough, STREAKS, u(1)),
    ],
  };
}
