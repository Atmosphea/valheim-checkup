// @ts-check
/**
 * Paper (file 05): procedural fibres, faint stains, darker worn edges, two soft fold creases,
 * deckled edge in alpha, roughness 0.85.
 *
 * Layer 1 draws the paper unlit (albedo only); layer 3, the veil, lights it with the same normal
 * map in white (roughness 0.85). `createVeilPaper` builds that from the bitmap read back once.
 */
import * as THREE from 'three';
import { materials as M, stage as S } from '../../config/render.js';
import { addPatch } from './patch.js';

/** Layer 1: unlit albedo with the deckle cut out. @param {import('../textures/index.js').Textures} tex @param {string} [tint] */
export function createScenePaper(tex, tint = S.paperMain) {
  // the texture is already painted in the main sheet's cream; another tint is applied as a ratio
  const main = new THREE.Color(S.paperMain), t = new THREE.Color(tint);
  const ratio = new THREE.Color(t.r / main.r, t.g / main.g, t.b / main.b);
  return new THREE.MeshBasicMaterial({
    name: 'paper',
    map: tex.out.paper.albedo.texture,
    color: ratio.multiplyScalar(S.paperBoost),
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
}

/**
 * Layer 3: white, lit, with the paper's normals; discards outside the deckle so the desk
 * there is left alone. `bitmap` holds normal RGB + deckle A.
 * @param {ImageBitmap | THREE.Texture} bitmap
 */
export function createVeilPaper(bitmap) {
  const normal = bitmap instanceof THREE.Texture ? bitmap : new THREE.Texture(bitmap);
  normal.colorSpace = THREE.NoColorSpace;
  normal.flipY = false; // rows came straight from the render target (v = 0 first)
  normal.generateMipmaps = true;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.anisotropy = 4;
  normal.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    name: 'veilPaper',
    color: 0xffffff,
    roughness: M.paper.roughness,
    metalness: 0,
    normalMap: normal,
    normalScale: new THREE.Vector2(M.paper.veilNormalStrength, M.paper.veilNormalStrength),
  });
  addPatch(m, {
    key: 'deckle',
    afterMap: 'if (texture2D(normalMap, vNormalMapUv).a < 0.5) discard;',
  });
  return m;
}

/** For the ?materials page: the paper as it looks once the veil has lit it, in one material. @param {import('../textures/index.js').Textures} tex */
export function createLitPaper(tex) {
  const p = tex.out.paper;
  return new THREE.MeshStandardMaterial({
    name: 'paperLit',
    map: p.albedo.texture,
    normalMap: p.normal.texture,
    normalScale: new THREE.Vector2(M.paper.veilNormalStrength, M.paper.veilNormalStrength),
    roughnessMap: p.roughness.texture,
    roughness: 1,
    metalness: 0,
    alphaTest: 0.5,
  });
}
