// @ts-check
/**
 * The woodblock's own maps, baked from the walnut texture for one board size (WP-05 step 4,
 * cut down by Paul: a plain bevelled border instead of the braided carving).
 *
 *   albedo:    walnut, lighter where the oil has worn off the edges, darker in routed slots
 *              (baked ambient occlusion)
 *   normal:    walnut grain combined with the bevelled border (outer round-over, flat frame,
 *              inner chamfer down to the field) and the slot walls
 *   roughness: walnut roughness, rougher where worn and on the slot floors
 *
 * The maps cover the board's top face once (uv 0..1 = the board in cm).
 */
import * as THREE from 'three';
import { textures as T } from '../../config/render.js';

const MAX_SLOTS = 16;

const BAKE = /* glsl */ `
#define MAX_SLOTS ${MAX_SLOTS}
uniform sampler2D uWoodAlbedo;
uniform sampler2D uWoodNormal;
uniform sampler2D uWoodRough;
uniform vec2 uBoard;          // cm
uniform vec2 uWoodCm;         // cm one walnut tile covers
uniform vec2 uWoodOffset;     // cm, so two boards don't share the same grain
uniform float uBorder;        // frame width, cm
uniform float uChamfer;       // inner chamfer width, cm
uniform float uRound;         // outer round-over, cm
uniform float uFieldDrop;     // how far the field sits below the frame (height units)
uniform int uSlotCount;
uniform vec4 uSlots[MAX_SLOTS];  // x0, y0, x1, y1 in cm from the board's bottom-left
uniform float uSlotDepth;
uniform vec3 uWorn;
uniform int uOut;             // 0 = albedo, 1 = normal, 2 = roughness

float boxDist(vec2 p, vec4 r) {           // signed distance to a rectangle, < 0 inside
  vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** Height of the carved surface at p (cm): frame, chamfer, field, slots. Also returns AO and wear. */
vec3 surface(vec2 p) {
  vec2 e = min(p, uBoard - p);
  float edge = min(e.x, e.y);                         // distance to the outer edge
  float h = 0.0;
  // outer round-over: a quarter circle profile
  float t = clamp(edge / uRound, 0.0, 1.0);
  h -= (1.0 - sqrt(1.0 - (1.0 - t) * (1.0 - t))) * uRound * 0.8;
  // inner chamfer from the frame down to the field
  float into = edge - uBorder;
  h -= clamp(into / uChamfer, 0.0, 1.0) * uFieldDrop;
  float ao = 1.0;
  float slotFloor = 0.0;
  for (int i = 0; i < MAX_SLOTS; i++) {
    if (i >= uSlotCount) break;
    float d = boxDist(p, uSlots[i]);
    float inside = 1.0 - smoothstep(-0.04, 0.04, d);
    h -= inside * uSlotDepth;
    slotFloor = max(slotFloor, inside);
    // occlusion: darkest along the walls inside the slot, a soft halo just outside
    ao *= 1.0 - inside * (0.35 + 0.35 * (1.0 - smoothstep(-0.6, 0.0, d)));
    ao *= 1.0 - (1.0 - inside) * 0.18 * (1.0 - smoothstep(0.0, 0.35, d));
  }
  // the chamfer's foot catches a little dirt
  ao *= 1.0 - 0.18 * exp(-pow((into - uChamfer) / 0.25, 2.0));
  // wear on high, exposed places: the outer edge and the frame's inner lip
  float wear = (1.0 - smoothstep(0.0, uRound * 1.6, edge)) + 0.6 * exp(-pow(into / 0.18, 2.0));
  return vec3(h, ao, clamp(wear, 0.0, 1.0) * (1.0 - slotFloor));
}

void main() {
  vec2 p = vUv * uBoard;
  vec2 wuv = (p + uWoodOffset) / uWoodCm;
  vec3 s = surface(p);
  float breakup = fbm(p * 0.9, ivec2(1 << 20), 4, 0.5, uSeed + 3u) * 0.5 + 0.5;
  float wear = clamp(s.z * (0.4 + breakup), 0.0, 1.0);
  if (uOut == 0) {
    vec3 c = texture2D(uWoodAlbedo, wuv).rgb;
    c = mix(c, uWorn * (0.8 + 0.4 * breakup), wear * 0.55);
    c *= s.y;
    gl_FragColor = vec4(c, 1.0);
  } else if (uOut == 1) {
    float px = 1.0 / uRes.x * uBoard.x;
    float hl = surface(p - vec2(px, 0.0)).x, hr = surface(p + vec2(px, 0.0)).x;
    float hd = surface(p - vec2(0.0, px)).x, hu = surface(p + vec2(0.0, px)).x;
    vec3 carve = normalize(vec3((hl - hr) / (2.0 * px), (hd - hu) / (2.0 * px), 1.0));
    vec3 wood = texture2D(uWoodNormal, wuv).xyz * 2.0 - 1.0;
    vec3 n = normalize(vec3(carve.xy / carve.z + wood.xy / wood.z, 1.0)); // add the slopes
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  } else {
    float r = texture2D(uWoodRough, wuv).g;
    float slot = 1.0 - smoothstep(0.6, 0.95, s.y);
    r = r + wear * 0.18 + slot * 0.12;
    gl_FragColor = vec4(1.0, clamp(r, 0.0, 1.0), 0.0, 1.0);
  }
}`;

/**
 * @param {import('./gpu.js').Painter} painter
 * @param {number} seed
 * @param {{ albedo: THREE.WebGLRenderTarget, normal: THREE.WebGLRenderTarget, roughness: THREE.WebGLRenderTarget }} walnut
 * @param {{ widthCm: number, heightCm: number, slots?: {x0: number, y0: number, x1: number, y1: number}[] }} board
 * @param {number} maxAnisotropy
 */
export function boardGenerator(painter, seed, walnut, board, maxAnisotropy) {
  const B = T.board;
  const w = B.widthPx;
  const h = Math.round(w * board.heightCm / board.widthCm);
  const albedo = painter.target(w, h, { color: 'srgb', repeat: false, anisotropy: maxAnisotropy });
  const normal = painter.target(w, h, { color: 'linear', repeat: false, anisotropy: maxAnisotropy });
  const rough = painter.target(w / 2, Math.round(h / 2), { color: 'linear', repeat: false });
  const slots = (board.slots ?? []).slice(0, MAX_SLOTS);
  const slotVecs = Array.from({ length: MAX_SLOTS }, (_, i) => slots[i] ? new THREE.Vector4(slots[i].x0, slots[i].y0, slots[i].x1, slots[i].y1) : new THREE.Vector4());
  const u = (/** @type {number} */ out) => ({
    uSeed: { value: seed >>> 0 },
    uWoodAlbedo: { value: walnut.albedo.texture }, uWoodNormal: { value: walnut.normal.texture }, uWoodRough: { value: walnut.roughness.texture },
    uBoard: { value: new THREE.Vector2(board.widthCm, board.heightCm) },
    uWoodCm: { value: new THREE.Vector2(...T.walnut.cm) },
    uWoodOffset: { value: new THREE.Vector2(B.woodOffset[0], B.woodOffset[1]) },
    uBorder: { value: B.borderCm }, uChamfer: { value: B.chamferCm }, uRound: { value: B.roundCm }, uFieldDrop: { value: B.fieldDropCm },
    uSlotCount: { value: slots.length }, uSlots: { value: slotVecs }, uSlotDepth: { value: B.slotDepthCm },
    uWorn: { value: new THREE.Color(...B.worn) },
    uOut: { value: out },
  });
  return {
    name: 'board',
    outputs: { albedo, normal, roughness: rough },
    steps: [
      () => painter.paint(albedo, BAKE, u(0)),
      () => painter.paint(normal, BAKE, u(1)),
      () => painter.paint(rough, BAKE, u(2)),
    ],
  };
}
