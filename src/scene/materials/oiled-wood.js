// @ts-check
/**
 * Oiled wood (file 05): the woodblock. Procedural dark walnut grain along the board's height,
 * roughness 0.45, clearcoat 0.25 at roughness 0.35, lighter worn edges, darker routed slots with
 * baked ambient occlusion. The carved interlace border is cut by Paul (DECISIONS): a plain
 * bevelled border is baked into the normal map instead. All of it comes from the board bake.
 */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { view } from './patch.js';

/**
 * @param {import('../textures/index.js').Textures} tex
 * @param {{ raw?: boolean, repeat?: [number, number] }} [o]  raw: plain walnut (no board bake), for curved samples
 */
export function createOiledWood(tex, o = {}) {
  const W = M.oiledWood;
  const b = o.raw ? tex.out.walnut : tex.out.board;
  const t = (/** @type {THREE.Texture} */ x) => (o.raw ? view(x, { repeat: o.repeat ?? [0.3, 0.15] }) : x);
  return new THREE.MeshPhysicalMaterial({
    name: 'oiledWood',
    map: t(b.albedo.texture),
    color: new THREE.Color().setScalar(W.shade),
    normalMap: t(b.normal.texture),
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: t(b.roughness.texture),
    roughness: W.roughness / W.mapMeanRoughness, // the map's mean is the walnut's 0.45
    metalness: 0,
    envMapIntensity: W.envMapIntensity,
    clearcoat: W.clearcoat,
    clearcoatRoughness: W.clearcoatRoughness,
  });
}
