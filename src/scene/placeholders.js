// @ts-check
/**
 * Placeholder shapes at the master layout (WP-04 step 4): desk planks, main and inset sheets,
 * a woodblock box, five coin discs and a gauntlet stand-in. WP-05 gives them real materials,
 * WP-06 and WP-08 replace the board, coins and gauntlet with real models.
 *
 * The sheets in layer 1 are drawn unlit (albedo only): layer 3 lights them (file 05).
 */
import * as THREE from 'three';
import L from '../config/layout.js';
import { materials as M, stage as S } from '../config/render.js';

/** Selective-bloom layer (file 05: bloom on the gauntlet only). */
export const BLOOM_LAYER = 1;

const lin = (/** @type {number[]} */ rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);

/**
 * @param {{ range(a: number, b: number): number }} rng
 */
export function buildPlaceholders(rng) {
  const root = new THREE.Group();
  root.name = 'placeholders';
  /** @type {THREE.Mesh[]} */ const hoverables = [];
  /** @type {THREE.Mesh[]} */ const casters = [];
  /** @type {THREE.Mesh[]} */ const papers = [];
  /** @type {THREE.Mesh[]} */ const bloom = [];

  // Desk planks, running left–right like the reference.
  const desk = new THREE.Group();
  desk.name = 'desk';
  const D = L.desk;
  const plankGeo = new THREE.BoxGeometry(D.x1 - D.x0, D.plankWidth - D.gap, D.thickness);
  const base = new THREE.Color(S.deskPlank);
  for (let y = D.y0, i = 0; y < D.y1; y += D.plankWidth, i++) {
    const c = base.clone().multiplyScalar(1 + rng.range(-S.deskPlankVariation, S.deskPlankVariation));
    const plank = new THREE.Mesh(plankGeo, new THREE.MeshStandardMaterial({ color: c, roughness: S.deskRoughness, metalness: 0 }));
    plank.name = `plank-${i}`;
    plank.position.set(rng.range(-6, 6), y + D.plankWidth / 2, D.top - D.thickness / 2);
    plank.receiveShadow = true;
    desk.add(plank);
  }
  root.add(desk);

  // Main sheet and inset sheet: unlit albedo.
  const sheetW = L.sheet.x1 - L.sheet.x0, sheetH = L.sheet.y1 - L.sheet.y0;
  // WP-06: subdivided so the edges can lift in the breeze (src/scene/paper-lift.js); WP-07's bristle uses the same vertices
  const main = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, sheetH, 64, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(S.paperMain).multiplyScalar(S.paperBoost) }));
  main.name = 'sheet-main';
  main.position.set((L.sheet.x0 + L.sheet.x1) / 2, (L.sheet.y0 + L.sheet.y1) / 2, 0);
  papers.push(main);
  const I = L.inset;
  const inset = new THREE.Mesh(new THREE.PlaneGeometry(I.x1 - I.x0, I.y1 - I.y0, 40, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(S.paperInset).multiplyScalar(S.paperBoost) }));
  inset.name = 'sheet-inset';
  inset.position.set((I.x0 + I.x1) / 2, (I.y0 + I.y1) / 2, I.z);
  papers.push(inset);
  root.add(main, inset);

  // Woodblock box, resting on the sheet.
  const W = L.woodblock;
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(W.x1 - W.x0, W.y1 - W.y0, W.thickness),
    new THREE.MeshPhysicalMaterial({ color: S.woodblock, roughness: M.oiledWood.roughness, clearcoat: M.oiledWood.clearcoat, clearcoatRoughness: M.oiledWood.clearcoatRoughness }),
  );
  block.name = 'woodblock';
  block.position.set((W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, W.thickness / 2);
  block.castShadow = true; block.receiveShadow = true;
  hoverables.push(block); casters.push(block);
  root.add(block);

  // Five coin discs.
  const gold = M.gold;
  for (const c of L.coins) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(c.r, c.r, L.coinThickness, 48),
      new THREE.MeshStandardMaterial({ color: lin(gold.color), metalness: gold.metalness, roughness: gold.roughness }),
    );
    coin.name = `coin-${c.id}`;
    coin.rotation.x = Math.PI / 2; // cylinder axis along z
    coin.position.set(c.x, c.y, L.coinThickness / 2 + 0.02);
    coin.castShadow = true; coin.receiveShadow = true;
    hoverables.push(coin); casters.push(coin);
    root.add(coin);
  }

  // Gauntlet stand-in: a polished steel capsule along the forearm, plus a rounded fist.
  const G = L.gauntletStandIn;
  const from = new THREE.Vector3(G.from.x, G.from.y, G.from.z);
  const to = new THREE.Vector3(G.to.x, G.to.y, G.to.z);
  const steel = new THREE.MeshPhysicalMaterial({
    color: lin(M.gauntletSteel.color), metalness: M.gauntletSteel.metalness, roughness: M.gauntletSteel.roughness,
    clearcoat: M.gauntletSteel.clearcoat, clearcoatRoughness: M.gauntletSteel.clearcoatRoughness,
    envMapIntensity: S.standInEnvIntensity,
  });
  const len = from.distanceTo(to);
  const gauntlet = new THREE.Group();
  gauntlet.name = 'gauntlet';
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(G.radius, len, 8, 24), steel);
  arm.name = 'gauntlet-arm';
  arm.position.copy(from).add(to).multiplyScalar(0.5);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  const fist = new THREE.Mesh(new THREE.SphereGeometry(G.radius * 1.15, 32, 16), steel);
  fist.name = 'gauntlet-fist';
  fist.position.copy(to);
  fist.scale.set(1.1, 1.25, 0.8);
  for (const m of [arm, fist]) {
    m.castShadow = true; m.receiveShadow = true;
    m.layers.enable(BLOOM_LAYER);
    hoverables.push(m); casters.push(m); bloom.push(m);
    gauntlet.add(m);
  }
  root.add(gauntlet);

  return { root, desk, main, inset, block, gauntlet, hoverables, casters, papers, bloom };
}
