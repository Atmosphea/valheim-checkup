// @ts-check
/**
 * Gold (file 05): coins. Metalness 1, colour linear (1.00, 0.71, 0.29), roughness 0.28 with a
 * worn hammered normal, a polished raised rim at 0.12, darker engraving cavities (add a legend
 * with applyEngraving). The rim is found from the object-space radius, so `radius` must be the
 * coin's radius and its axis the geometry's y axis (as THREE.CylinderGeometry builds it).
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { addPatch, view, lin } from './patch.js';

/** @param {import('../textures/index.js').Textures} tex @param {{ radius: number, repeat?: [number, number] }} o */
export function createGold(tex, o) {
  const G = M.gold;
  const repeat = o.repeat ?? G.repeat;
  const m = new THREE.MeshPhysicalMaterial({
    name: 'gold',
    color: lin(G.color),
    metalness: G.metalness,
    roughness: 1, // absolute values in the map (G)
    roughnessMap: view(tex.out.hammered.data.texture, { repeat }),
    normalMap: view(tex.out.hammered.normal.texture, { repeat }),
    normalScale: new THREE.Vector2(G.normalStrength, G.normalStrength),
  });
  addPatch(m, {
    key: 'coinRim',
    uniforms: { uCoinR: { value: o.radius }, uRimFrom: { value: G.rimFrom }, uRimRough: { value: G.rimRoughness } },
    vertexHead: 'varying vec3 vcCoinPos;',
    vertexBody: 'vcCoinPos = position;',
    fragmentHead: 'uniform float uCoinR; uniform float uRimFrom; uniform float uRimRough; varying vec3 vcCoinPos;',
    afterMap: 'float vcRim = smoothstep(uRimFrom, uRimFrom + 0.035, length(vcCoinPos.xz) / uCoinR);',
    afterRoughness: 'roughnessFactor = mix(roughnessFactor, uRimRough, vcRim);',
    mapN: 'mapN.xy *= 1.0 - 0.85 * vcRim;',
  });
  return m;
}
