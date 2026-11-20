// @ts-check
/**
 * Brass (file 05): slot inlays, plaque. Metalness 1, colour linear (0.89, 0.72, 0.42),
 * roughness 0.30. A molten-pour shader adds an orange emissive front during fills:
 * `setPour(material, front, on)` with front 0..1 along the mesh's u.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { addPatch, patchUniforms, view, lin } from './patch.js';

/** @param {import('../textures/index.js').Textures} tex @param {{ repeat?: [number, number] }} [o] */
export function createBrass(tex, o = {}) {
  const B = M.brass;
  const m = new THREE.MeshPhysicalMaterial({
    name: 'brass',
    color: lin(B.color),
    metalness: B.metalness,
    roughness: B.roughness,
    // a faint cast texture; it also gives engraving a tangent frame to work in
    normalMap: view(tex.out.hammered.normal.texture, { repeat: o.repeat ?? B.repeat }),
    normalScale: new THREE.Vector2(B.normalStrength, B.normalStrength),
  });
  addPatch(m, {
    key: 'pour',
    uniforms: {
      uPour: { value: new THREE.Vector4(0, B.pour.frontWidth, B.pour.coolLength, 0) },
      uPourColor: { value: lin(B.pour.color).multiplyScalar(B.pour.intensity) },
    },
    vertexHead: 'varying vec2 vcPourUv;',
    vertexBody: 'vcPourUv = uv;',
    fragmentHead: 'uniform vec4 uPour; uniform vec3 uPourColor; varying vec2 vcPourUv;',
    // x = front position (0..1 along u), y = front width, z = how far behind it the metal stays hot, w = on
    afterEmissive: `if (uPour.w > 0.0) {
        float d = uPour.x - vcPourUv.x;                       // > 0 behind the front (already poured)
        float front = exp(-d * d / (uPour.y * uPour.y));
        float hot = step(0.0, d) * exp(-max(d, 0.0) / uPour.z);
        totalEmissiveRadiance += uPourColor * uPour.w * max(front, hot * 0.55) * step(-uPour.y * 2.0, d);
      }`,
  });
  return m;
}

/** @param {THREE.Material} m @param {number} front 0..1 @param {number} [on] 0..1 */
export function setPour(m, front, on = 1) {
  const u = patchUniforms(m, 'pour').uPour;
  if (u) { u.value.x = front; u.value.w = on; }
}
