// @ts-check
/**
 * Polished gauntlet steel (file 05): metalness 1, base colour linear (0.84, 0.85, 0.87),
 * roughness 0.12 with very faint micro-scratches (0.09–0.18), clearcoat 0.3 at 0.05 for an
 * oiled sheen, and a normal map limited to faint hammer dents (strength 0.05).
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { addPatch, view, lin } from './patch.js';

/** @param {import('../textures/index.js').Textures} tex @param {{ repeat?: [number, number], envMapIntensity?: number }} [o] */
export function createGauntletSteel(tex, o = {}) {
  const G = M.gauntletSteel;
  const repeat = o.repeat ?? G.repeat;
  const m = new THREE.MeshPhysicalMaterial({
    name: 'gauntletSteel',
    color: lin(G.color),
    metalness: G.metalness,
    roughness: G.roughness,
    clearcoat: G.clearcoat,
    clearcoatRoughness: G.clearcoatRoughness,
    normalMap: view(tex.out.hammered.normal.texture, { repeat }),
    normalScale: new THREE.Vector2(G.dentNormalStrength, G.dentNormalStrength),
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  addPatch(m, {
    key: 'scratches',
    uniforms: { uScratch: { value: view(tex.out.hammered.data.texture, { repeat }) }, uScrMin: { value: G.scratchRoughnessMin }, uScrMax: { value: G.scratchRoughnessMax } },
    fragmentHead: 'uniform sampler2D uScratch; uniform float uScrMin; uniform float uScrMax;',
    // the scratch mask shares the normal map's uv (same repeat)
    afterRoughness: `roughnessFactor = mix(uScrMin, uScrMax, clamp(texture2D(uScratch, vNormalMapUv).r * 1.4 + 0.15, 0.0, 1.0));`,
  });
  return m;
}
