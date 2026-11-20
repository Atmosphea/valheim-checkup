// @ts-check
/**
 * Brushed steel (file 05): bars, knobs, the fingertip plate hinge.
 * MeshPhysicalMaterial, metalness 1, base colour linear (0.78, 0.80, 0.83). Roughness map of
 * fine streaks along the bar's length (0.14–0.32), anisotropy 0.85 along the length so the
 * highlights smear into long streaks, streak normal map at strength 0.15. Edges slightly
 * smoother and brighter (worn): give `half` (the box's half size in cm) to switch that on.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { addPatch, view, lin } from './patch.js';

/**
 * @param {import('../textures/index.js').Textures} tex
 * @param {{ repeatU?: number, half?: THREE.Vector3, bevel?: number, anisotropy?: number }} [o]
 */
export function createBrushedSteel(tex, o = {}) {
  const S = M.brushedSteel;
  const repeat = /** @type {[number, number]} */ ([o.repeatU ?? S.uvRepeatU, 1]);
  const m = new THREE.MeshPhysicalMaterial({
    name: 'brushedSteel',
    color: lin(S.color),
    metalness: S.metalness,
    roughness: 1, // the map holds absolute roughness
    roughnessMap: view(tex.out.brushedSteel.roughness.texture, { repeat }),
    normalMap: view(tex.out.brushedSteel.normal.texture, { repeat }),
    normalScale: new THREE.Vector2(S.normalStrength, S.normalStrength),
    anisotropy: o.anisotropy ?? S.anisotropy,
    anisotropyRotation: 0, // along u = along the bar
  });
  addPatch(m, {
    key: 'wornEdges',
    uniforms: { uHalf: { value: o.half ?? new THREE.Vector3() }, uBevel: { value: o.bevel ?? S.bevelRadius } },
    vertexHead: 'varying vec3 vcObjPos;',
    vertexBody: 'vcObjPos = position;',
    fragmentHead: `uniform vec3 uHalf; uniform float uBevel; varying vec3 vcObjPos;
      float vcEdgeAmount() {
        if (uHalf.x <= 0.0) return 0.0;
        vec3 a = smoothstep(uHalf - 3.0 * uBevel, uHalf - 0.3 * uBevel, abs(vcObjPos));
        return max(max(a.x * a.y, a.y * a.z), a.x * a.z);
      }`,
    afterMap: `float vcEdge = vcEdgeAmount(); diffuseColor.rgb *= 1.0 + ${S.edgeBrighten.toFixed(3)} * vcEdge;`,
    afterRoughness: `roughnessFactor *= 1.0 - ${S.edgeSmoother.toFixed(3)} * vcEdge;`,
  });
  return m;
}
