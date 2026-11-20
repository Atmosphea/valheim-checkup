// @ts-check
/** Knurling (file 05): knob ends. Procedural diamond knurl normal map, roughness 0.30, no anisotropy. */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { view, lin } from './patch.js';

/** @param {import('../textures/index.js').Textures} tex @param {{ repeat?: [number, number] }} [o] */
export function createKnurling(tex, o = {}) {
  return new THREE.MeshPhysicalMaterial({
    name: 'knurling',
    color: lin(M.brushedSteel.color),
    metalness: 1,
    roughness: M.knurling.roughness,
    normalMap: view(tex.out.knurl.normal.texture, { repeat: o.repeat ?? M.knurling.repeat }),
    normalScale: new THREE.Vector2(1, 1),
    anisotropy: M.knurling.anisotropy,
  });
}
