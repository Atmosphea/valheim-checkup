// @ts-check
/**
 * WP-05: put the real materials on the WP-04 placeholder shapes, so the desk already shows
 * paper, walnut, gold and polished steel. WP-06 and WP-08 replace the board, coins and
 * gauntlet shapes; they keep these materials.
 *
 *   planks     desk (walnut turned along x, each plank its own offset)
 *   sheets     paper (layer 1: unlit albedo with the deckle; the inset uses the same paper,
 *              sampled where it lies on the sheet, so its fibres continue)
 *   woodblock  oiled wood (board bake: plain bevelled border, worn edges)
 *   coins      gold, polished rim
 *   gauntlet   polished gauntlet steel with cube reflections
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import L from '../config/layout.js';
import { stage as S } from '../config/render.js';
import { createDeskPlank, createScenePaper, createOiledWood, createGold, createGauntletSteel, createGauntletReflections } from './materials/index.js';

/**
 * @param {ReturnType<typeof import('./placeholders.js').buildPlaceholders>} parts
 * @param {import('./textures/index.js').Textures} tex
 * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, studioCube: THREE.Texture | null, tier: { cubePx: number, cubeEveryNthFrame: number }, rng: { range(a: number, b: number): number } }} o
 */
export function dressPlaceholders(parts, tex, o) {
  const D = L.desk;
  // WP-14 (draw calls): the planks are one mesh. Each plank keeps its own grain offset (baked into
  // its UVs, drawn from the same random stream as before) and its WP-04 shade (vertex colour).
  {
    const planks = /** @type {THREE.Mesh[]} */ ([...parts.desk.children]);
    const geos = planks.map(m => {
      const old = /** @type {THREE.MeshStandardMaterial} */ (m.material);
      const shade = old.color.r / new THREE.Color(S.deskPlank).r; // keep WP-04's per-plank variation
      const du = o.rng.range(0, 1), dv = o.rng.range(0, 1);
      old.dispose();
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(shade), 3));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (merged) {
      const mat = createDeskPlank(tex, { lengthCm: D.x1 - D.x0, widthCm: D.plankWidth - D.gap, offset: [0, 0], shade: 1, gnarled: true });
      mat.vertexColors = true;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'planks';
      mesh.receiveShadow = true;
      for (const m of planks) parts.desk.remove(m);
      planks[0]?.geometry.dispose();
      parts.desk.add(mesh);
    }
  }

  // the inset samples the main sheet's paper where it lies on it
  const sw = L.sheet.x1 - L.sheet.x0, sh = L.sheet.y1 - L.sheet.y0, I = L.inset;
  const uv = parts.inset.geometry.getAttribute('uv');
  const pos = parts.inset.geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i) + (I.x0 + I.x1) / 2, y = pos.getY(i) + (I.y0 + I.y1) / 2;
    uv.setXY(i, (x - L.sheet.x0) / sw, (y - L.sheet.y0) / sh);
  }
  uv.needsUpdate = true;
  for (const [mesh, tint] of /** @type {[THREE.Mesh, string][]} */ ([[parts.main, S.paperMain], [parts.inset, S.paperInset]])) {
    /** @type {THREE.Material} */ (mesh.material).dispose();
    mesh.material = createScenePaper(tex, tint);
  }

  /** @type {THREE.Material} */ (parts.block.material).dispose();
  parts.block.material = createOiledWood(tex);

  for (const c of L.coins) {
    const coin = /** @type {THREE.Mesh} */ (parts.root.getObjectByName(`coin-${c.id}`));
    /** @type {THREE.Material} */ (coin.material).dispose();
    coin.material = createGold(tex, { radius: c.r });
  }

  const steel = createGauntletSteel(tex, { envMapIntensity: S.standInEnvIntensity });
  const reflections = o.studioCube ? createGauntletReflections(o.renderer, o.scene, o.studioCube, o.tier) : null;
  reflections?.attach(steel);
  const gauntletMeshes = /** @type {THREE.Mesh[]} */ (parts.gauntlet.children.filter(c => /** @type {THREE.Mesh} */ (c).isMesh));
  const oldSteel = /** @type {THREE.Material} */ (gauntletMeshes[0]?.material);
  for (const m of gauntletMeshes) m.material = steel;
  oldSteel?.dispose();
  let hand = /** @type {THREE.Object3D} */ (parts.root.getObjectByName('gauntlet-fist') ?? parts.gauntlet);
  let hide = /** @type {THREE.Object3D[]} */ (gauntletMeshes);
  const at = new THREE.Vector3();
  return {
    reflections,
    /** Refresh the hand's cube camera when due (call before rendering layer 1); 'pmrem' on the filtering frame. */
    update() { if (!reflections) return false; hand.getWorldPosition(at); return reflections.update(at, hide); },
    /**
     * WP-08: the real gauntlet replaces the stand-in: its meshes are hidden from the cube camera,
     * the camera sits at `atObj`, and its steel materials take the reflections.
     * @param {THREE.Object3D[]} meshes @param {THREE.Object3D} atObj @param {THREE.MeshPhysicalMaterial[]} steelMats
     */
    useGauntlet(meshes, atObj, steelMats) {
      hide = meshes; hand = atObj;
      for (const m of steelMats) reflections?.attach(m);
      steel.dispose();
    },
  };
}
