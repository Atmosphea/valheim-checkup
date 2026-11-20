// @ts-check
/**
 * WP-08: put the real gauntlet on the desk in place of the WP-04 stand-in.
 *
 *   - materials from file 05: polished gauntlet steel with the hand's cube reflections, leather,
 *     rivets; plates, rivets and the ember socket on the BLOOM layer, leather not;
 *   - the shadow proxy casts the key light's shadow in layer 1 (its own layer, seen only by the
 *     shadow camera) and is mirrored into the veil (layer 3), so the hand's shadow falls on the
 *     paper and the printed text alike;
 *   - LOD0 on High and Medium, LOD1 on Low;
 *   - `place(tip, handQ)` runs the two-bone arm; WP-09's controller drives it every frame.
 *
 * Debug: `__vc.gauntlet` (see the bottom of this file).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vc } from '../debug.js';
import { buildGauntlet, PROXY_LAYER } from './model.js';
import { placeArm, handLocal } from './rig.js';
import { POSES, POSE_NAMES } from './poses.js';
import { findPenetrations } from './collide.js';
import { createGauntletSteel, createLeather, createRivets } from '../scene/materials/index.js';
import { BLOOM_LAYER } from '../scene/placeholders.js';
import { gauntlet as GR } from '../config/render.js';
import { gauntletRig as RIG } from '../config/motion.js';

/**
 * @param {object} ctx
 * @param {THREE.Scene} ctx.scene
 * @param {ReturnType<typeof import('../scene/placeholders.js').buildPlaceholders>} ctx.parts
 * @param {ReturnType<typeof import('../scene/veil.js').createVeil>} ctx.veil
 * @param {{ refresh(): void }} ctx.post
 * @param {import('../scene/textures/index.js').Textures} ctx.tex
 * @param {{ key: THREE.DirectionalLight }} ctx.lights
 * @param {{ useGauntlet(meshes: THREE.Object3D[], at: THREE.Object3D, steel: THREE.MeshPhysicalMaterial[]): void }} ctx.dressed
 * @param {'high'|'medium'|'low'|'flat'} ctx.tier
 */
export function createGauntlet(ctx) {
  const t0 = performance.now();
  const steel = createGauntletSteel(ctx.tex, { envMapIntensity: GR.envMapIntensity });
  const leather = createLeather(ctx.tex);
  const rivet = createRivets();
  rivet.envMapIntensity = GR.envMapIntensity;
  const socket = new THREE.MeshStandardMaterial({ name: 'emberSocket', color: 0x301008, emissive: new THREE.Color(GR.socketColor), emissiveIntensity: 0, roughness: 0.6 });
  const lodFor = (/** @type {string} */ t) => (t === 'low' || t === 'flat' ? 1 : 0);
  const model = buildGauntlet({ lod: lodFor(ctx.tier), materials: { steel, leather, rivet, socket } });
  const buildMs = performance.now() - t0;

  // ── Out with the stand-in ───────────────────────────────────────────────────────────────
  const { parts } = ctx;
  for (const m of [...parts.gauntlet.children]) {
    ctx.veil.removeCaster(m);
    for (const list of [parts.hoverables, parts.casters, parts.bloom]) { const i = list.indexOf(/** @type {any} */ (m)); if (i >= 0) list.splice(i, 1); }
    parts.gauntlet.remove(m);
    /** @type {THREE.Mesh} */ (m).geometry?.dispose();
  }
  parts.root.remove(parts.gauntlet);
  ctx.scene.add(model.root);

  // ── Draw calls: the plates on one bone share one material, so they are drawn as one mesh
  // (61 → ~25 steel draws, each drawn again by the bloom pass). The model's own plate meshes stay
  // in place, hidden, for the collision check and LOD swaps (WP-08 "< 3 ms").
  /** @type {THREE.Mesh[]} */ let merged = [];
  function mergePlates() {
    for (const m of merged) { m.parent?.remove(m); m.geometry.dispose(); }
    merged = [];
    /** @type {Map<THREE.Object3D, Map<string, THREE.Mesh[]>>} */ const groups = new Map();
    for (const m of model.steelMeshes) {
      if (m.material !== steel || /** @type {any} */ (m).isInstancedMesh || !m.parent) continue;
      const sig = Object.keys(m.geometry.attributes).sort().join(',') + (m.geometry.index ? ':i' : ':n');
      const byParent = groups.get(m.parent) ?? new Map();
      groups.set(m.parent, byParent);
      byParent.set(sig, [...(byParent.get(sig) ?? []), m]);
    }
    for (const [parent, bySig] of groups) for (const list of bySig.values()) {
      if (list.length < 2) continue;
      const geos = list.map(m => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k]; return g; });
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      if (!g) continue;
      const mm = new THREE.Mesh(g, steel);
      mm.name = `plates-${parent.name}`;
      mm.layers.enable(BLOOM_LAYER);
      parent.add(mm);
      merged.push(mm);
      for (const m of list) m.visible = false;
    }
  }
  mergePlates();
  const drawn = () => model.steelMeshes.filter(m => m.visible).concat(merged);

  // ── Layers: bloom on steel, shadows through the proxy ──────────────────────────────────
  for (const m of model.steelMeshes) m.layers.enable(BLOOM_LAYER);
  model.socket.layers.enable(BLOOM_LAYER);
  ctx.lights.key.shadow.camera.layers.enable(PROXY_LAYER);
  for (const p of model.proxies) ctx.veil.addCaster(p);
  ctx.post.refresh();
  ctx.dressed.useGauntlet(drawn().concat([/** @type {any} */ (model.leather)]), model.bones.hand, [steel, rivet]);

  /** @param {string} t */
  function setTier(t) {
    if (lodFor(t) === model.lod) return;
    for (const m of model.steelMeshes) if (m.material === steel) m.visible = true;
    model.setLOD(lodFor(t));
    mergePlates();
    ctx.dressed.useGauntlet(drawn().concat([/** @type {any} */ (model.leather)]), model.bones.hand, []);
    ctx.post.refresh();
  }

  const tipQ = new THREE.Quaternion();
  // Paul, WP-17 item 19: a left hand. The whole model is mirrored in x at its root (every mesh,
  // the skinned leather and the shadow proxies flip with it, and three.js turns their faces round
  // for the negative determinant), and the arm is solved in that mirrored space: the tip and the
  // shoulder mirrored, the hand's turn conjugated by the mirror and turned 180° about its own z
  // (fingers stay forward and the back of the hand up; only its side is mirrored).
  const LEFT = RIG.hand === 'left';
  if (LEFT) model.root.scale.x = -1;
  const LS = RIG.left;
  const leftArm = { shoulder: { x: -LS.shoulder.x, y: LS.shoulder.y, z: LS.shoulder.z }, pole: { x: -LS.pole.x, y: LS.pole.y, z: LS.pole.z }, upperArm: LS.upperArm };
  const QZ180 = new THREE.Quaternion(0, 0, 1, 0);
  const mTip = new THREE.Vector3(), mQ = new THREE.Quaternion();
  const api = {
    model,
    rig: model.rig,
    root: model.root,
    helpers: model.rig.helpers,
    steel, leather, rivet, socket,
    buildMs,
    setTier,
    /**
     * Pose the fingers (a pose name, weights, or a full pose) and place the arm so `helper`
     * (pointerTip by default) lands on `tip` with the hand turned to `handQ`.
     * @param {THREE.Vector3} tip @param {THREE.Quaternion} handQ @param {{ helper?: THREE.Object3D }} [o]
     */
    place(tip, handQ, o) {
      if (!LEFT) return placeArm(model.rig, tip, handQ, o);
      // the shoulder leans after the hand (first person: the viewer's own arm and body move a little)
      const k = LS.followK;
      leftArm.shoulder.x = -((1 - k) * LS.shoulder.x + k * (tip.x + LS.follow.x));
      leftArm.shoulder.y = (1 - k) * LS.shoulder.y + k * (tip.y + LS.follow.y);
      leftArm.shoulder.z = (1 - k) * LS.shoulder.z + k * (tip.z + LS.follow.z);
      mTip.set(-tip.x, tip.y, tip.z);
      mQ.set(handQ.x, -handQ.y, -handQ.z, handQ.w).multiply(QZ180);
      const r = placeArm(model.rig, mTip, mQ, { ...o, ...leftArm });
      r.elbow.x = -r.elbow.x;
      return r;
    },
    /** WP-17 item 19: which hand. */
    hand: LEFT ? 'left' : 'right',
    /** Index tip cap openness 0…1 drives the socket's glow. @param {number} open */
    setCap(open) {
      const b = model.bones.indexCap;
      b.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -open * RIG.capOpenDeg * Math.PI / 180);
      model.socket.visible = open > 0.02;
      socket.emissiveIntensity = GR.socketGlow * Math.min(1, open * 1.4);
    },
    /** A helper's offset in the hand's frame as the world sees it (WP-17 item 19: mirrored across the hand for the left hand). */
    handLocal: (/** @type {THREE.Object3D} */ h) => { const v = handLocal(model.rig, h); if (LEFT) v.y = -v.y; return v; },
    tipQ,
  };

  /** @type {any} */ (vc).gauntlet = {
    triangles: () => model.triangles(),
    /** Steel draw calls per pass (merged plates + rivets + socket). */
    steelDraws: () => drawn().length,
    lod: () => model.lod,
    rivets: model.rivetCount,
    buildMs: +buildMs.toFixed(1),
    poses: POSE_NAMES,
    /** Penetrating plate pairs in the current pose (WP-08 acceptance). */
    penetrations: () => findPenetrations(model),
    /** World positions (cm) of the two helpers. */
    helpers() {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      model.rig.helpers.pointerTip.getWorldPosition(a); model.rig.helpers.pinchPoint.getWorldPosition(b);
      return { pointerTip: a.toArray().map(v => +v.toFixed(3)), pinchPoint: b.toArray().map(v => +v.toFixed(3)) };
    },
    bones: () => Object.keys(model.bones).length,
    pinchGap: model.pinchGap, pinchClear: model.pinchClear,
    /** @param {string} name */
    poseData: name => JSON.parse(JSON.stringify(POSES[name] ?? null)),
    /** WP-17 item 19: which hand, and the elbow, wrist and pointer tip in world cm. */
    hand: api.hand,
    arm() {
      const w = (/** @type {THREE.Object3D} */ o) => o.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(2));
      return { elbow: w(model.bones.forearm), wrist: w(model.bones.wrist), tip: w(model.rig.helpers.pointerTip) };
    },
  };
  return api;
}
