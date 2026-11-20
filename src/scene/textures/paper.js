// @ts-check
/**
 * Paper, 2,048 × 1,152 (the main sheet is 96 × 54 cm, 16:9): albedo + normal + roughness.
 *
 *  - multi-octave fibre noise: long thin cells in several directions, over a cloudy "formation"
 *  - faint low-frequency stains with darker tide-line rims, more of them near the edges
 *  - darker, slightly burnt worn edges
 *  - deckled edge in alpha (albedo A and normal A)
 *  - two soft fold creases as gentle normal ridges: vertical near x = +10 cm, horizontal near y = −3 cm
 *
 * One texture covers the whole sheet once (it never repeats), so there are no tiling seams.
 */
import * as THREE from 'three';
import { NORMAL_FROM_HEIGHT } from './noise.glsl.js';
import { textures as T } from '../../config/render.js';

const FIELDS = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uCrease;
uniform float uCreaseWidth;
uniform float uDeckle;
const ivec2 BIG = ivec2(1 << 20);

float fibres(vec2 p) {
  float f = 0.0;
  for (int k = 0; k < 5; k++) {
    float a = float(k) * 1.2566 + rnd(ivec2(k, 3), uSeed) * 0.9;
    mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = R * p * vec2(1.6, 16.0);
    float n = gnoise(q, BIG, uSeed + uint(k) * 31u);
    float g = gnoise(q * vec2(0.5, 0.5) + 17.0, BIG, uSeed + uint(k) * 57u);
    f += pow(1.0 - abs(n), 9.0) * smoothstep(-0.2, 0.5, g);
  }
  return f / 2.0;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;            // cm, origin at the sheet centre
  float cloud = fbm(p * 0.35, BIG, 6, 0.55, uSeed + 7u);
  float fine = fbm(p * 6.0, BIG, 3, 0.5, uSeed + 11u);
  float fib = fibres(p);

  // distance to the sheet edge, with a ragged deckle and a few torn bites
  vec2 e = uSize * 0.5 - abs(p);
  float d = min(e.x, e.y);
  float rag = fbm(p * 0.7, BIG, 4, 0.5, uSeed + 13u) * 0.55 + fbm(p * 4.0, BIG, 3, 0.5, uSeed + 17u) * 0.18;
  float bite = max(0.0, fbm(p * 0.12, BIG, 3, 0.5, uSeed + 19u) - 0.18) * 4.0;
  float dj = d + rag - bite + fib * 0.06;
  float alpha = smoothstep(uDeckle * 0.5, uDeckle, dj);

  // worn, slightly burnt edges
  float wear = 1.0 - smoothstep(uDeckle, 4.0, dj + fbm(p * 1.3, BIG, 3, 0.5, uSeed + 23u) * 1.3);

  // stains: a domain-warped low-frequency field; mostly near the edges
  vec2 w = p * 0.045 + vec2(fbm(p * 0.05, BIG, 3, 0.5, uSeed + 29u), fbm(p * 0.05 + 9.0, BIG, 3, 0.5, uSeed + 31u)) * 0.9;
  float sn = fbm(w, BIG, 4, 0.5, uSeed + 37u);
  float edgeBias = 1.0 - smoothstep(4.0, 20.0, d);
  float level = mix(0.34, 0.12, edgeBias);
  float body = smoothstep(level, level + 0.12, sn);
  float rim = smoothstep(level - 0.015, level + 0.01, sn) * (1.0 - smoothstep(level + 0.01, level + 0.05, sn));
  float stain = clamp(body * 0.55 + rim * 0.9, 0.0, 1.0);

  // two soft fold creases, slightly wobbly
  float cx = p.x - uCrease.x - noise1(p.y * 0.06, 1 << 20, uSeed + 41u) * 0.35;
  float cy = p.y - uCrease.y - noise1(p.x * 0.05, 1 << 20, uSeed + 43u) * 0.35;
  float wv = uCreaseWidth;
  float crease = exp(-cx * cx / (wv * wv)) + exp(-cy * cy / (wv * wv));
  float broad = exp(-cx * cx / (9.0 * wv * wv)) + exp(-cy * cy / (9.0 * wv * wv));

  float height = cloud * 0.35 + fine * 0.10 + fib * 0.22 + crease * 0.3 - broad * 0.1 - wear * 0.15;
  gl_FragColor = vec4(height, stain, wear, alpha);
}`;

const ALBEDO = /* glsl */ `
uniform sampler2D uFields;
uniform vec2 uSize;
uniform vec2 uCrease;
uniform float uCreaseWidth;
uniform vec3 uCream;
uniform vec3 uStain;
uniform vec3 uBurnt;
const ivec2 BIG = ivec2(1 << 20);
void main() {
  vec4 f = texture2D(uFields, vUv);
  vec2 p = (vUv - 0.5) * uSize;
  float tone = fbm(p * 0.08, BIG, 3, 0.5, uSeed + 51u);
  float mottle = fbm(p * 0.9, BIG, 4, 0.5, uSeed + 53u);
  vec3 c = uCream * (0.95 + tone * 0.08 + mottle * 0.035 + (f.r - 0.1) * 0.06);
  c = mix(c, c * uStain, f.g * 0.6);
  float wear = clamp(f.b, 0.0, 1.0);
  c = mix(c, uBurnt, pow(wear, 1.6) * 0.75);
  // dust in the folds
  float cx = p.x - uCrease.x - noise1(p.y * 0.06, 1 << 20, uSeed + 41u) * 0.35;
  float cy = p.y - uCrease.y - noise1(p.x * 0.05, 1 << 20, uSeed + 43u) * 0.35;
  float w = uCreaseWidth * 0.6;
  float line = exp(-cx * cx / (w * w)) + exp(-cy * cy / (w * w));
  c *= 1.0 - 0.035 * min(line, 1.0);
  // sparse specks
  ivec2 cell = ivec2(floor(p * 3.0));
  float speck = step(0.9965, rnd(cell, uSeed + 59u));
  c *= 1.0 - speck * 0.25 * rnd(cell, uSeed + 61u);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), f.a);
}`;

const ROUGH = /* glsl */ `
uniform sampler2D uFields;
uniform float uBase;
void main() {
  vec4 f = texture2D(uFields, vUv);
  float r = uBase + (f.r - 0.1) * 0.06 - f.g * 0.04 + f.b * 0.05;
  gl_FragColor = vec4(1.0, clamp(r, 0.0, 1.0), 0.0, 1.0);
}`;

/**
 * @param {import('./gpu.js').Painter} painter
 * @param {number} seed
 * @param {number} maxAnisotropy
 */
export function paperGenerator(painter, seed, maxAnisotropy) {
  const P = T.paper;
  const [w, h] = P.size;
  const fields = painter.target(w, h, { color: 'float', repeat: false });
  const albedo = painter.target(w, h, { color: 'srgb', repeat: false, anisotropy: maxAnisotropy });
  const normal = painter.target(w, h, { color: 'linear', repeat: false, anisotropy: maxAnisotropy });
  const rough = painter.target(w / 2, h / 2, { color: 'linear', repeat: false });
  const common = {
    uSeed: { value: seed >>> 0 },
    uSize: { value: new THREE.Vector2(...P.sheetCm) },
    uCrease: { value: new THREE.Vector2(P.creaseX, P.creaseY) },
    uCreaseWidth: { value: P.creaseWidth },
  };
  return {
    name: 'paper',
    outputs: { albedo, normal, roughness: rough },
    steps: [
      () => painter.paint(fields, FIELDS, { ...common, uDeckle: { value: P.deckleCm } }),
      () => painter.paint(albedo, ALBEDO, {
        ...common, uFields: { value: fields.texture },
        uCream: { value: new THREE.Color(...P.cream) }, uStain: { value: new THREE.Color(...P.stain) }, uBurnt: { value: new THREE.Color(...P.burnt) },
      }),
      () => painter.paint(normal, NORMAL_FROM_HEIGHT, { uSeed: common.uSeed, uHeight: { value: fields.texture }, uStrength: { value: P.normalStrength }, uAlphaFrom: { value: 1 } }),
      () => { painter.paint(rough, ROUGH, { uSeed: common.uSeed, uFields: { value: fields.texture }, uBase: { value: P.roughness } }); painter.release(fields); },
    ],
  };
}
