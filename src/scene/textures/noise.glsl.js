// @ts-check
/**
 * Shared GLSL for the texture generators: integer hashing (PCG), tileable gradient noise,
 * fractal sums and cellular (Worley) noise. "Tileable" means the lattice wraps every `period`
 * cells, so a texture painted over exactly one period repeats without a seam.
 */
export const GLSL_NOISE = /* glsl */ `
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
uint hash2(ivec2 p, uint seed) { return pcg(uint(p.x) ^ pcg(uint(p.y) ^ pcg(seed))); }
float rnd(ivec2 p, uint seed) { return float(hash2(p, seed)) * (1.0 / 4294967295.0); }
vec2 rnd2(ivec2 p, uint seed) {
  uint h = hash2(p, seed);
  return vec2(float(h & 0xffffu), float(h >> 16u)) * (1.0 / 65535.0);
}
ivec2 wrapCell(ivec2 c, ivec2 period) { return ((c % period) + period) % period; }

/** Tileable gradient noise, roughly −1..1. x is in lattice units; period in cells. */
float gnoise(vec2 x, ivec2 period, uint seed) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  float a[4];
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    float ang = rnd(wrapCell(c + o, period), seed) * 6.2831853;
    a[k] = dot(vec2(cos(ang), sin(ang)), f - vec2(o));
  }
  return 1.4142 * mix(mix(a[0], a[1], u.x), mix(a[2], a[3], u.x), u.y);
}

/** Fractal sum of gradient noise. Frequency and period double each octave. */
float fbm(vec2 x, ivec2 period, int octaves, float gain, uint seed) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    sum += amp * gnoise(x, period, seed + uint(o) * 101u);
    norm += amp;
    x *= 2.0; period *= 2; amp *= gain;
  }
  return sum / norm;
}

/** Cellular noise: returns (F1, F2, cell id hash 0..1). Tileable with period. */
vec3 worley(vec2 x, ivec2 period, float jitter, uint seed) {
  vec2 i = floor(x), f = fract(x);
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    ivec2 o = ivec2(xx, y);
    ivec2 cell = wrapCell(ivec2(i) + o, period);
    vec2 p = vec2(o) + 0.5 + (rnd2(cell, seed) - 0.5) * jitter;
    float d = length(p - f);
    if (d < f1) { f2 = f1; f1 = d; id = rnd(cell, seed ^ 0x9e37u); }
    else if (d < f2) { f2 = d; }
  }
  return vec3(f1, f2, id);
}

/** Smooth 1D noise, −1..1, period in cells. */
float noise1(float x, int period, uint seed) {
  return gnoise(vec2(x, 0.5), ivec2(period, 1), seed);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * Height (R channel of uHeight) → tangent-space normal, central differences with wrap.
 * `uStrength` scales the slope; `uAlphaFrom` (0/1) copies the height texture's alpha into A.
 */
export const NORMAL_FROM_HEIGHT = /* glsl */ `
uniform sampler2D uHeight;
uniform float uStrength;
uniform float uAlphaFrom;
void main() {
  vec2 t = 1.0 / uRes;
  float l = texture2D(uHeight, vUv - vec2(t.x, 0.0)).r;
  float r = texture2D(uHeight, vUv + vec2(t.x, 0.0)).r;
  float d = texture2D(uHeight, vUv - vec2(0.0, t.y)).r;
  float u = texture2D(uHeight, vUv + vec2(0.0, t.y)).r;
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  float a = mix(1.0, texture2D(uHeight, vUv).a, uAlphaFrom);
  gl_FragColor = vec4(n * 0.5 + 0.5, a);
}`;
