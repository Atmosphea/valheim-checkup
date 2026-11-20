// @ts-check
/** Leather (file 05): under-glove between plates. Dark brown, roughness 0.65, warm sheen 0.4, leather-grain normal map. */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { view, lin } from './patch.js';

/** @param {import('../textures/index.js').Textures} tex @param {{ repeat?: [number, number] }} [o] */
export function createLeather(tex, o = {}) {
  const L = M.leather;
  return new THREE.MeshPhysicalMaterial({
    name: 'leather',
    color: lin(L.color),
    roughness: L.roughness,
    metalness: 0,
    sheen: L.sheen,
    sheenColor: lin(L.sheenColor),
    sheenRoughness: L.sheenRoughness,
    normalMap: view(tex.out.leather.normal.texture, { repeat: o.repeat ?? L.repeat }),
    normalScale: new THREE.Vector2(L.normalStrength, L.normalStrength),
  });
}
