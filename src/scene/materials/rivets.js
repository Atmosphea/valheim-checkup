// @ts-check
/** Rivets (file 05): gauntlet, bar ends. Domed, slightly darker steel, roughness 0.2. */
import * as THREE from 'three';
import { materials as M } from '../../config/render.js';
import { lin } from './patch.js';

export function createRivets() {
  return new THREE.MeshPhysicalMaterial({
    name: 'rivets',
    color: lin(M.rivets.color),
    metalness: 1,
    roughness: M.rivets.roughness,
  });
}

/** A domed rivet head (a squashed half sphere), radius in cm. @param {number} [r] */
export function rivetGeometry(r = 0.25) {
  const g = new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, M.rivets.dome, 1);
  return g;
}
