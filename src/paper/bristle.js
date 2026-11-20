// @ts-check
/**
 * Paper bristle (file 04 "Paper", owned by WP-07 per DECISIONS point 32).
 *
 *   Idle               a slow vertex ripple and fibre shimmer: bristleAmp 0.03 cm,
 *                      bristleFreq 0.08 /cm, bristleSpeed 0.15 (cycles per second)
 *   File dragged over  the sheet "breathes": bristleAmp ×2 (eased in and out)
 *
 * Done in the shaders, so nothing is uploaded per frame: the same displacement runs in the
 * layer 1 paper (albedo) and in the veil's paper (lighting), from one shared set of uniforms,
 * so the two layers never drift apart. The veil also tilts its normals by the ripple's slope:
 * that is the "fibre shimmer" the light picks up. Tiers (file 05 quality table): High and
 * Medium move the vertices and the normals; Low only the normals.
 *
 * The printed HTML does not ripple (0.03 cm is under half a screen pixel at 1440 px).
 */
import { paper as MP } from '../config/motion.js';
import { on } from '../bus.js';
import { addPatch } from '../scene/materials/patch.js';

/** Two crossed waves; returns height (cm) and its x/y slope. Same maths as the GLSL below. */
export function bristleAt(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ tSec, amp = MP.bristleAmp) {
  const k = 2 * Math.PI * MP.bristleFreq, w = 2 * Math.PI * MP.bristleSpeed;
  const a1 = k * (0.8 * x + 0.6 * y) + w * tSec;
  const a2 = k * 1.3 * (-0.5 * x + 0.866 * y) - 0.7 * w * tSec;
  return {
    z: amp * (0.6 * Math.sin(a1) + 0.4 * Math.sin(a2)),
    dx: amp * (0.6 * Math.cos(a1) * k * 0.8 + 0.4 * Math.cos(a2) * k * 1.3 * -0.5),
    dy: amp * (0.6 * Math.cos(a1) * k * 0.6 + 0.4 * Math.cos(a2) * k * 1.3 * 0.866),
  };
}

const GLSL_FN = /* glsl */ `
uniform float uBristleTime;
uniform float uBristleAmp;
uniform float uBristleVertex;
uniform float uBristleK;
uniform float uBristleW;
vec3 vcBristle(vec2 p) {
  float a1 = uBristleK * (0.8 * p.x + 0.6 * p.y) + uBristleW * uBristleTime;
  float a2 = uBristleK * 1.3 * (-0.5 * p.x + 0.866 * p.y) - 0.7 * uBristleW * uBristleTime;
  float z = uBristleAmp * (0.6 * sin(a1) + 0.4 * sin(a2));
  float dx = uBristleAmp * (0.6 * cos(a1) * uBristleK * 0.8 - 0.4 * cos(a2) * uBristleK * 1.3 * 0.5);
  float dy = uBristleAmp * (0.6 * cos(a1) * uBristleK * 0.6 + 0.4 * cos(a2) * uBristleK * 1.3 * 0.866);
  return vec3(z, dx, dy);
}
`;

/**
 * @param {{ parts: { main: any, inset: any }, veil: any, tier: () => any }} o
 */
export function createBristle(o) {
  const uniforms = {
    uBristleTime: { value: 0 },
    uBristleAmp: { value: MP.bristleAmp },
    uBristleVertex: { value: 1 },
    uBristleK: { value: 2 * Math.PI * MP.bristleFreq },
    uBristleW: { value: 2 * Math.PI * MP.bristleSpeed },
  };
  /** Vertex part: displace along z in world space (the sheets lie flat, normal +z). */
  const vertex = {
    vertexHead: `${GLSL_FN}\nvarying vec2 vBristleXY;`,
    vertexBody: /* glsl */ `
      {
        vec2 wxy = (modelMatrix * vec4(transformed, 1.0)).xy;
        vBristleXY = wxy;
        transformed.z += uBristleVertex * vcBristle(wxy).x;
      }`,
  };
  /** @param {any} m @param {boolean} lit */
  const patch = (m, lit) => {
    if (!m || m.userData.vcBristle) return;
    m.userData.vcBristle = true;
    addPatch(m, {
      key: 'bristle',
      uniforms,
      ...vertex,
      fragmentHead: lit ? `${GLSL_FN}\nvarying vec2 vBristleXY;` : 'varying vec2 vBristleXY;',
      // fibre shimmer: tilt the tangent-space normal by the ripple's slope (tangent space = paper x/y)
      mapN: lit ? 'mapN.xy -= vcBristle(vBristleXY).yz;' : undefined,
    });
    m.needsUpdate = true;
  };
  patch(o.parts.main.material, false);
  patch(o.parts.inset.material, false);
  o.veil.setPaperPatch?.((/** @type {any} */ m) => patch(m, true));

  let target = 1, mul = 1, tSec = 0;
  const offs = [
    on('drag:file-enter', () => { target = MP.fileDragBristleMul; }),
    on('drag:file-leave', () => { target = 1; }),
    on('drop:file', () => { target = 1; }),
  ];
  return {
    uniforms,
    /** @param {number} dt scaled ms */
    update(dt) {
      tSec += Math.max(0, dt) / 1000;
      // ease the "breathing" in and out over ~300 ms
      mul += (target - mul) * Math.min(1, dt / 300);
      uniforms.uBristleTime.value = tSec % 1000;
      uniforms.uBristleAmp.value = MP.bristleAmp * mul;
      const mode = o.tier()?.bristle ?? 'vertex+normal';
      uniforms.uBristleVertex.value = String(mode).includes('vertex') ? 1 : 0;
    },
    read: () => ({ amp: +uniforms.uBristleAmp.value.toFixed(4), mul: +mul.toFixed(3), vertex: uniforms.uBristleVertex.value, t: +tSec.toFixed(2) }),
    dispose() { for (const f of offs) f?.(); },
  };
}
