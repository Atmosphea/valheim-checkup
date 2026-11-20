// @ts-check
/**
 * WP-08: the plate gauntlet. Every plate is a rigid mesh parented to its bone; the leather
 * under-glove is one skinned mesh bound to the same bones; rivets are instanced per bone; a
 * low-polygon shadow proxy rides the same bones for the light veil and the key light's shadow.
 *
 * `buildGauntlet({ lod, materials })` works without a DOM (unit tests build it in Node).
 * LOD0 (High, Medium): every curved surface finely divided, the back plate subdivided once
 * (Loop, three-subdivide). LOD1 (Low): about half the divisions, no subdivision pass.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { LoopSubdivision } from 'three-subdivide/src/LoopSubdivision.js';
import { buildPlate, plateSamples, lathe, zone, heightField, smooth } from './shell.js';
import { createRig, solvePinch } from './rig.js';
import { findPenetrations } from './collide.js';
import { POSES } from './poses.js';
import { SHELL, FINGERS, FINGER_NAMES, THUMB, ARM, HAND, WRIST_LAMES, WRIST_LAME_ARC_DEG, LAME_STEP, LAME_OVERLAP, LAME_ARC_DEG, CAP, CLEARANCE, DISTAL_STEP } from './dims.js';

const D = Math.PI / 180;
/** Layer the shadow proxy lives on: seen by the key light's shadow camera, never by the view camera. */
export const PROXY_LAYER = 2;

/** Division counts per LOD. */
const LODS = [
  { lameU: 32, lameV: 6, capV: 12, bead: 8, armU: 48, armV: 22, cuffU: 96, cuffV: 10, wristU: 40, wristV: 8, knuckleU: 44, knuckleV: 10, guardU: 24, guardV: 8, skinRing: 20, rivetW: 14, rivetH: 6, subdivide: true, tessEdge: 1.0 },
  { lameU: 16, lameV: 3, capV: 6, bead: 6, armU: 24, armV: 14, cuffU: 48, cuffV: 7, wristU: 20, wristV: 4, knuckleU: 22, knuckleV: 5, guardU: 12, guardV: 4, skinRing: 14, rivetW: 10, rivetH: 4, subdivide: false, tessEdge: 1.1 },
];

/**
 * @typedef {object} Plate
 * @property {string} name
 * @property {string} bone
 * @property {THREE.Mesh} mesh
 * @property {import('./shell.js').PlateSamples} samples
 * @property {(lod: number) => THREE.BufferGeometry} build
 */

/**
 * @param {{ lod?: number, materials?: { steel?: THREE.Material, rivet?: THREE.Material, leather?: THREE.Material, socket?: THREE.Material } }} [o]
 */
export function buildGauntlet(o = {}) {
  const mats = {
    steel: o.materials?.steel ?? new THREE.MeshStandardMaterial({ color: 0xd6d8dc, metalness: 1, roughness: 0.15 }),
    rivet: o.materials?.rivet ?? new THREE.MeshStandardMaterial({ color: 0xa8aaae, metalness: 1, roughness: 0.2 }),
    leather: o.materials?.leather ?? new THREE.MeshStandardMaterial({ color: 0x3b291e, roughness: 0.65 }),
    socket: o.materials?.socket ?? new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
  };
  const small = SHELL.small, mid = SHELL.mid, big = SHELL.big;
  const rig = createRig(small);
  const pinchGap = solvePinch(rig);
  const { bones } = rig;
  let lod = o.lod ?? 0;

  /** @type {Plate[]} */
  const plates = [];
  /** @type {Map<string, { u: number, v: number, plate: Plate }[]>} */
  const rivetSpots = new Map();
  /**
   * @param {string} name @param {string} boneName
   * @param {(L: typeof LODS[0]) => import('./shell.js').PlateSpec} specOf
   * @param {{ x?: number }} [offset] plate-local x offset inside the bone frame
   */
  const plate = (name, boneName, specOf, offset = {}) => {
    /** @type {Map<number, ReturnType<typeof buildPlate>>} */
    const cache = new Map();
    const make = (/** @type {number} */ l) => {
      if (!cache.has(l)) cache.set(l, buildPlate(specOf(LODS[l])));
      return /** @type {ReturnType<typeof buildPlate>} */ (cache.get(l));
    };
    const built = make(lod);
    const mesh = new THREE.Mesh(built.geometry, mats.steel);
    mesh.name = `plate-${name}`;
    mesh.position.x = offset.x ?? 0;
    bones[boneName].add(mesh);
    /** @type {Plate} */
    const p = { name, bone: boneName, mesh, samples: plateSamples(specOf(LODS[1])), build: l => make(l).geometry };
    /** @type {any} */ (p).at = built.at;
    plates.push(p);
    return p;
  };
  const rivet = (/** @type {Plate} */ p, /** @type {number} */ u, /** @type {number} */ v) => {
    const list = rivetSpots.get(p.bone) ?? [];
    list.push({ u, v, plate: p });
    rivetSpots.set(p.bone, list);
  };

  // ── Fingers ────────────────────────────────────────────────────────────────────────────
  const arc = LAME_ARC_DEG * D;
  /** @param {number} x0 @param {number} x1 @param {number} r @param {typeof SHELL.small} sh */
  const lame = (x0, x1, r, sh = small) => (/** @type {typeof LODS[0]} */ L) => ({
    ...lathe({ prof: v => [x0 + (x1 - x0) * v, r * (1 + 0.025 * Math.sin(Math.PI * v))], phi0: -arc, phi1: arc }),
    segU: L.lameU, segV: L.lameV, t: sh.t, rb: sh.rb, beadSides: L.bead, round: 0.16, uvScale: [6, 6],
  });
  /** a tip cap: barrel then dome, from x0; `arcDeg` wider than the lames */
  const capSpec = (/** @type {number} */ x0, /** @type {number} */ r, /** @type {number} */ arcDeg) => (/** @type {typeof LODS[0]} */ L) => ({
    ...lathe({
      prof: v => {
        const vb = CAP.barrel / (CAP.barrel + CAP.dome * 1.2);
        if (v <= vb) return [x0 + CAP.barrel * (v / vb), r];
        const g = ((v - vb) / (1 - vb)) * (Math.PI / 2);
        return [x0 + CAP.barrel + CAP.dome * Math.sin(g), CAP.tipR + (r - CAP.tipR) * Math.cos(g)];
      },
      phi0: -arcDeg * D, phi1: arcDeg * D,
    }),
    segU: L.lameU, segV: L.capV, t: small.t, rb: small.rb, beadSides: L.bead, round: 0.1, uvScale: [6, 6],
  });
  const fingerRadii = /** @type {Record<string, number[]>} */ ({});
  for (const name of FINGER_NAMES) {
    const F = FINGERS[name];
    const R = rig.radii[name];
    fingerRadii[name] = R;
    for (let s = 0; s < 3; s++) {
      const len = F.len[s], bn = `${name}${s + 1}`;
      if (s < 2) {
        plate(`${name}${s + 1}a`, bn, lame(0.06, 0.6 * len, R[s]));
        plate(`${name}${s + 1}b`, bn, lame(0.48 * len, len + LAME_OVERLAP, R[s] + LAME_STEP));
      } else {
        const dl = rig.distal.aEnd ? { ...rig.distal } : rig.distal;
        // distal layout scaled to this finger's length
        const k = len / FINGERS.index.len[2];
        const aEnd = dl.aEnd * k, bStart = dl.bStart * k, bEnd = dl.bEnd * k;
        plate(`${name}3a`, bn, lame(0.06, aEnd, R[2]));
        plate(`${name}3b`, bn, lame(bStart, bEnd, R[2] + DISTAL_STEP));
        const rc = R[2] - small.t / 2 - CLEARANCE - (2 * small.rb - small.t / 2) - 0.02;
        if (name === 'index') {
          // the visor: hinged at its pivot (the cap bone), shown at the pivot's origin
          plate('indexCap', 'indexCap', capSpec(dl.capStart - dl.pivot, rig.capR, 112));
        } else {
          const pivot = bEnd - 0.24;
          plate(`${name}Cap`, bn, capSpec(pivot - 0.06, rc, 112));
        }
      }
    }
  }

  // ── Thumb ──────────────────────────────────────────────────────────────────────────────
  const TR = [THUMB.r];
  for (let s = 1; s < 3; s++) {
    const prevIn = TR[s - 1] + LAME_STEP - small.t / 2;
    TR.push(Math.min(TR[s - 1] * THUMB.taper, Math.sqrt(prevIn * prevIn - LAME_OVERLAP * LAME_OVERLAP) - CLEARANCE - (2 * small.rb - small.t / 2)));
  }
  const tl = THUMB.len;
  plate('thumb1a', 'thumb1', lame(THUMB.lamesFrom, THUMB.lamesFrom + 0.62 * (tl[0] - THUMB.lamesFrom), TR[0]));
  plate('thumb1b', 'thumb1', lame(THUMB.lamesFrom + 0.5 * (tl[0] - THUMB.lamesFrom), tl[0] + LAME_OVERLAP, TR[0] + LAME_STEP));
  plate('thumb2a', 'thumb2', lame(0.06, 0.6 * tl[1], TR[1]));
  plate('thumb2b', 'thumb2', lame(0.48 * tl[1], tl[1] + LAME_OVERLAP, TR[1] + LAME_STEP));
  plate('thumb3a', 'thumb3', lame(0.06, 0.52 * tl[2], TR[2]));
  plate('thumb3b', 'thumb3', lame(0.42 * tl[2], 0.78 * tl[2], TR[2] + DISTAL_STEP));
  plate('thumbCap', 'thumb3', capSpec(0.78 * tl[2] - 0.3, TR[2] - small.t / 2 - CLEARANCE - (2 * small.rb - small.t / 2) - 0.02, 112));
  // guard plate over the thumb's base, outside its lames
  const guardR = TR[0] + LAME_STEP + 0.2;
  const guard = plate('thumbGuard', 'thumb1', L => ({
    ...lathe({ prof: v => [0.15 + (THUMB.lamesFrom + 0.9 - 0.15) * v, guardR * (0.92 + 0.08 * Math.sin(Math.PI * v))], phi0: -70 * D, phi1: 85 * D }),
    segU: L.guardU, segV: L.guardV, t: mid.t, rb: mid.rb, beadSides: L.bead, round: 0.22, uvScale: [8, 8],
  }));
  rivet(guard, 0.5, 0.25); rivet(guard, 0.5, 0.78);

  // ── Back of the hand: extruded profile, 8 bevel segments, one Loop subdivision pass ────
  const H = HAND;
  const hw = (/** @type {number} */ x) => H.plateHalfWidthWrist + (H.plateHalfWidthKnuckles - H.plateHalfWidthWrist) * smooth(H.plateX0, H.plateX1, x);
  const domeZ = (/** @type {number} */ x, /** @type {number} */ y) => {
    const s = (x - H.plateX0) / (H.plateX1 - H.plateX0);
    const base = H.domeZ0 + (H.domeZ1 - H.domeZ0) * s;
    const w = hw(x);
    return base - H.domeCrown * (y / w) ** 2 * (1 + 0.6 * (y / w) ** 2) / 1.6 * 1.6 + H.fluteHeight * Math.exp(-((y / H.fluteWidth) ** 2));
  };
  const outline = (/** @type {number} */ n) => {
    /** @type {THREE.Vector2[]} */ const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // superellipse in a box that narrows toward the wrist
      const c = Math.cos(a), s = Math.sin(a);
      const ex = 4;
      const xr = Math.sign(c) * Math.abs(c) ** (2 / ex), yr = Math.sign(s) * Math.abs(s) ** (2 / ex);
      const x = (H.plateX0 + H.plateX1) / 2 + xr * (H.plateX1 - H.plateX0) / 2;
      pts.push(new THREE.Vector2(x, yr * hw(x)));
    }
    return pts;
  };
  const backPlate = {
    name: 'backPlate', bone: 'hand',
    mesh: new THREE.Mesh(undefined, mats.steel),
    samples: plateSamples({
      ...heightField({ x0: H.plateX0 + 0.1, x1: H.plateX1 - 0.1, y0: x => -hw(x) * 0.97, y1: x => hw(x) * 0.97, h: domeZ }),
      segU: 24, segV: 24, t: big.t, rb: big.rb, sampleU: 12, sampleV: 12,
    }),
    build: (/** @type {number} */ l) => backPlateGeometry(LODS[l], outline, domeZ, big),
  };
  backPlate.mesh.geometry = backPlate.build(lod);
  backPlate.mesh.name = 'plate-backPlate';
  bones.hand.add(backPlate.mesh);
  plates.push(backPlate);

  // ── Knuckle plate: curved band, four raised bosses ─────────────────────────────────────
  const bossAt = FINGER_NAMES.map(n => ({ x: FINGERS[n].at[0] - 0.85, y: FINGERS[n].at[1] }));
  const knuckleH = (/** @type {number} */ x, /** @type {number} */ y) => {
    let z = H.knuckleZ - 0.028 * y * y + 0.12 * Math.sin(Math.PI * (x - H.knuckleX0) / (H.knuckleX1 - H.knuckleX0));
    for (const b of bossAt) z += H.bossHeight * Math.exp(-(((x - b.x) / (H.bossRadius * 0.85)) ** 2 + ((y - b.y) / H.bossRadius) ** 2));
    return z;
  };
  const knuckle = plate('knuckles', 'hand', L => ({
    ...heightField({ x0: H.knuckleX0, x1: H.knuckleX1, y0: () => -4.85, y1: () => 4.95, h: knuckleH }),
    segU: L.knuckleV, segV: L.knuckleU, t: mid.t, rb: mid.rb, beadSides: L.bead, round: 0.25, uvScale: [8, 8], sampleU: 8, sampleV: 22,
  }));
  for (const y of [-0.9, 0.5]) rivet(knuckle, 0.5, y < 0 ? 0.03 : 0.97);
  for (let i = 0; i < 3; i++) rivet(knuckle, 0.35, (0.5 + (bossAt[i].y + bossAt[i + 1].y) / 2 + 4.85) / 9.8 - 0.05);

  // ── Wrist lames (sliding over each other about the wrist pivot) ────────────────────────
  const warc = WRIST_LAME_ARC_DEG * D;
  WRIST_LAMES.forEach((w, i) => {
    const p = plate(`wristLame${i + 1}`, w.bone, L => ({
      ...zone({ a: w.a, b: w.b, c: w.c, th0: w.th0 * D, th1: w.th1 * D, phi0: -warc, phi1: warc }),
      segU: L.wristU, segV: L.wristV, t: mid.t, rb: mid.rb, beadSides: L.bead, round: 0.2, uvScale: [8, 8], sampleU: 14, sampleV: 5,
    }), { x: w.bone === 'forearm' ? ARM.length : 0 });
    rivet(p, 0.06, 0.5); rivet(p, 0.94, 0.5); rivet(p, 0.5, 0.5);
  });

  // ── Cuff: flared bell, rolled edges ────────────────────────────────────────────────────
  const C = ARM.cuff;
  const cuffProf = (/** @type {number} */ v) => {
    const x = C.x0 + (C.x1 - C.x0) * v;
    const flare = Math.max(0, 1 - v) ** 2.2;
    return /** @type {[number, number]} */ ([x, C.r1 + (C.r0 - C.r1) * flare + 0.12 * Math.sin(Math.PI * v)]);
  };
  const cuff = plate('cuff', 'forearm', L => ({
    ...lathe({ prof: cuffProf, phi0: 0, phi1: Math.PI * 2, ey: C.ey, ez: C.ez }),
    segU: L.cuffU, segV: L.cuffV, t: big.t, rb: big.rb, beadSides: L.bead, closedU: true, round: 0, uvScale: [10, 10], sampleU: 64, sampleV: 24,
  }), { x: ARM.length });
  for (let i = 0; i < 8; i++) { rivet(cuff, (i + 0.5) / 8, 0.88); rivet(cuff, (i + 0.5) / 8, 0.12); }

  // ── Vambrace: two lathe-built halves (96 segments round), hinge, strap and buckle ──────
  const V = ARM.vambrace;
  const vProf = (/** @type {number} */ v) => /** @type {[number, number]} */ ([V.x0 + (V.x1 - V.x0) * v, V.r0 + (V.r1 - V.r0) * v]);
  const gap = V.gapDeg * D;
  /** @type {Plate[]} */ const halves = [];
  for (const [i, f0, f1] of /** @type {[number, number, number][]} */ ([[0, -Math.PI / 2 + gap, Math.PI / 2 - gap], [1, Math.PI / 2 + gap, 1.5 * Math.PI - gap]])) {
    const h = plate(`vambrace${i ? 'Under' : 'Top'}`, 'forearm', L => ({
      ...lathe({ prof: vProf, phi0: f0, phi1: f1, ey: V.ey, ez: V.ez }),
      segU: L.armU, segV: L.armV, t: big.t, rb: big.rb, beadSides: L.bead, round: 0.06, uvScale: [12, 12], sampleU: 32, sampleV: 20,
    }), { x: ARM.length });
    halves.push(h);
    for (let k = 0; k < 4; k++) { rivet(h, 0.035, 0.15 + k * 0.23); rivet(h, 0.965, 0.15 + k * 0.23); }
  }
  // a centre row of five along the top half and the under half
  for (let k = 0; k < 5; k++) { rivet(halves[0], 0.5, 0.08 + k * 0.21); rivet(halves[1], 0.5, 0.08 + k * 0.21); }
  // hinge along the −y seam: a rod with knuckles
  const hinge = new THREE.Group();
  hinge.name = 'vambrace-hinge';
  {
    const rAt = (/** @type {number} */ x) => V.r0 + (V.r1 - V.r0) * ((x - V.x0) / (V.x1 - V.x0));
    for (let k = 0; k < 7; k++) {
      const xa = V.x0 + 1 + k * ((V.x1 - V.x0 - 2) / 7), xb = xa + (V.x1 - V.x0 - 2) / 7 - 0.15;
      const g = new THREE.CylinderGeometry(0.26, 0.26, xb - xa, 20, 1);
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, mats.steel);
      const xm = (xa + xb) / 2;
      m.position.set(ARM.length + xm, -(rAt(xm) * V.ey + 0.12), 0);
      m.name = 'hinge-knuckle';
      hinge.add(m);
    }
  }
  bones.forearm.add(hinge);
  // leather strap round the vambrace, with a steel buckle on top
  const S = ARM.strap;
  const strapR = (/** @type {number} */ x) => V.r0 + (V.r1 - V.r0) * ((x - V.x0) / (V.x1 - V.x0)) + big.t + S.lift;
  const strapPlate = buildPlate({
    ...lathe({ prof: v => [S.x - S.width / 2 + S.width * v, strapR(S.x)], phi0: 0, phi1: Math.PI * 2, ey: V.ey, ez: V.ez }),
    segU: 96, segV: 2, t: 0.14, rb: 0.07, beadSides: 6, closedU: true, round: 0, uvScale: [6, 6],
  });
  const strap = new THREE.Mesh(strapPlate.geometry, mats.leather);
  strap.name = 'strap';
  strap.position.x = ARM.length;
  bones.forearm.add(strap);
  const buckle = new THREE.Group();
  buckle.name = 'buckle';
  {
    const bw = S.width + 0.7, bl = 2.6, bar = 0.22;
    const zTop = strapR(S.x) * V.ez + 0.18;
    for (const [dx, dy, sx, sy] of /** @type {number[][]} */ ([[0, bl / 2, bw, bar], [0, -bl / 2, bw, bar], [bw / 2, 0, bar, bl], [-bw / 2, 0, bar, bl], [0.15, 0, bar * 0.8, bl]])) {
      const g = new THREE.CapsuleGeometry(bar / 2, Math.max(sx, sy) - bar, 4, 12);
      if (sx > sy) g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, mats.steel);
      m.position.set(ARM.length + S.x + dx, dy, zTop);
      m.name = 'buckle-bar';
      buckle.add(m);
    }
  }
  bones.forearm.add(buckle);
  rivet(halves[0], 0.42, (S.x + 1.6 - V.x0) / (V.x1 - V.x0));
  rivet(halves[0], 0.58, (S.x + 1.6 - V.x0) / (V.x1 - V.x0));

  // ── Ember socket inside the index tip (glows only when the cap is open) ────────────────
  const socket = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), mats.socket);
  socket.name = 'ember-socket';
  socket.position.set(rig.distal.pivot + 0.25, 0, 0.05);
  socket.visible = false;
  bones.index3.add(socket);

  // ── Rivets: instanced per bone ─────────────────────────────────────────────────────────
  /** @type {THREE.InstancedMesh[]} */
  const rivetMeshes = [];
  const rivetGeo = (/** @type {number} */ l) => {
    const L = LODS[l];
    const g = new THREE.SphereGeometry(0.25, L.rivetW, L.rivetH, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.55, 1);
    return g;
  };
  /** @type {Map<number, THREE.BufferGeometry>} */
  const rivetGeos = new Map();
  const getRivetGeo = (/** @type {number} */ l) => { if (!rivetGeos.has(l)) rivetGeos.set(l, rivetGeo(l)); return /** @type {THREE.BufferGeometry} */ (rivetGeos.get(l)); };
  let rivetCount = 0;
  {
    const P = new THREE.Vector3(), N = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
    for (const [boneName, list] of rivetSpots) {
      const im = new THREE.InstancedMesh(getRivetGeo(lod), mats.rivet, list.length);
      im.name = `rivets-${boneName}`;
      list.forEach((r, i) => {
        /** @type {any} */ (r.plate).at(r.u, r.v, P, N);
        const thick = r.plate.name.startsWith('vambrace') || r.plate.name === 'cuff' ? big.t : mid.t;
        P.addScaledVector(N, thick / 2 - 0.02);
        P.x += r.plate.mesh.position.x;
        q.setFromUnitVectors(up, N);
        m.compose(P, q, one);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.frustumCulled = false;
      bones[boneName].add(im);
      rivetMeshes.push(im);
      rivetCount += list.length;
    }
  }

  // ── Leather under-glove: one skinned mesh ──────────────────────────────────────────────
  rig.setPose(restPose());
  rig.root.updateMatrixWorld(true);
  /** @type {Map<number, THREE.SkinnedMesh>} */
  const skins = new Map();
  const boneList = Object.values(bones);
  const skeleton = new THREE.Skeleton(boneList);
  const makeSkin = (/** @type {number} */ l) => {
    if (skins.has(l)) return /** @type {THREE.SkinnedMesh} */ (skins.get(l));
    // A later LOD (quality tier change) is built while the arm is posed and placed: build it
    // from the bones' bind-time matrices (the skeleton's inverses), not their live ones, or the
    // sleeve is skinned twice and stretches into rods across the desk (WP-10 finding).
    const live = skins.size ? boneList.map(b => b.matrixWorld.clone()) : null;
    if (live) skeleton.boneInverses.forEach((inv, i) => boneList[i].matrixWorld.copy(inv).invert());
    let geo;
    try { geo = leatherGeometry(rig, boneList, LODS[l], fingerRadii, TR, small); }
    finally { if (live) live.forEach((m, i) => boneList[i].matrixWorld.copy(m)); }
    const sm = new THREE.SkinnedMesh(geo, mats.leather);
    sm.name = 'leather';
    sm.frustumCulled = false;
    rig.root.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
    sm.visible = l === lod;
    skins.set(l, sm);
    return sm;
  };
  makeSkin(lod);

  // ── Shadow proxy: low-polygon, same bones ──────────────────────────────────────────────
  /** @type {THREE.Mesh[]} */
  const proxies = [];
  const proxyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addProxy = (/** @type {string} */ boneName, /** @type {THREE.BufferGeometry} */ g, /** @type {number[]} */ at) => {
    const m = new THREE.Mesh(g, proxyMat);
    m.name = `gauntlet-proxy-${boneName}`;
    m.position.set(at[0], at[1], at[2]);
    m.layers.set(PROXY_LAYER);
    m.castShadow = true;
    bones[boneName].add(m);
    proxies.push(m);
    return m;
  };
  {
    const cyl = (/** @type {number} */ r, /** @type {number} */ len, /** @type {number} */ sides = 10, /** @type {number} */ ey = 1, /** @type {number} */ ez = 1) => {
      const g = new THREE.CylinderGeometry(r, r, len, sides, 1);
      g.rotateZ(-Math.PI / 2);
      g.scale(1, ey, ez);
      return g;
    };
    addProxy('forearm', cyl(4.6, ARM.length - 2, 12, V.ey, V.ez), [ARM.length / 2 + 0.5, 0, 0]);
    const hb = new THREE.BoxGeometry(H.plateX1 + 1.2, 9.2, 3.4, 1, 1, 1);
    addProxy('hand', hb, [(H.plateX1 + 1.2) / 2, 0.1, 0.3]);
    for (const name of FINGER_NAMES) {
      FINGERS[name].len.forEach((len, s) => addProxy(`${name}${s + 1}`, cyl(fingerRadii[name][s] + 0.05, len + 0.3, 8), [len / 2, 0, 0]));
    }
    THUMB.len.forEach((len, s) => addProxy(`thumb${s + 1}`, cyl(TR[s] + 0.08, len, 8), [len / 2, 0, 0]));
  }

  // ── Pinch: keep the gap closed while the thumb's plates clear the index's ─────────────
  const pinchClear = refinePinch(rig, { plates, root: rig.root });

  // ── Layers, shadows ────────────────────────────────────────────────────────────────────
  const steelMeshes = /** @type {THREE.Mesh[]} */ ([]);
  rig.root.traverse(obj => {
    const m = /** @type {THREE.Mesh} */ (obj);
    if (!m.isMesh || proxies.includes(m)) return;
    m.castShadow = false; m.receiveShadow = false;
    if (m.material !== mats.leather) steelMeshes.push(m);
  });

  function setLOD(/** @type {number} */ l) {
    if (l === lod) return;
    lod = l;
    for (const p of plates) p.mesh.geometry = p.build(l);
    for (const im of rivetMeshes) im.geometry = getRivetGeo(l);
    makeSkin(l);
    for (const [k, sm] of skins) sm.visible = k === l;
  }

  function triangles() {
    let n = 0;
    rig.root.traverse(obj => {
      const m = /** @type {THREE.Mesh} */ (obj);
      if (!m.isMesh || !m.visible || proxies.includes(m)) return;
      const g = m.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      n += tris * (/** @type {THREE.InstancedMesh} */ (m).isInstancedMesh ? /** @type {THREE.InstancedMesh} */ (m).count : 1);
    });
    return Math.round(n);
  }

  return {
    rig, root: rig.root, bones, plates, proxies, socket, rivetMeshes, steelMeshes, skeleton,
    get leather() { return makeSkin(lod); },
    get lod() { return lod; },
    setLOD, triangles, rivetCount, pinchGap, pinchClear, materials: mats,
  };
}

/**
 * The pinch pose: thumb pad on the index pad (solvePinch), then nudged until no thumb plate
 * passes through an index plate, keeping the pads together (gap counts 20× a touching point).
 * @param {ReturnType<typeof createRig>} rig @param {{ plates: Plate[], root: THREE.Object3D }} model
 */
function refinePinch(rig, model) {
  const P = POSES.pinch;
  const only = (/** @type {string} */ n) => n.startsWith('thumb') || n.startsWith('index');
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const cost = () => {
    rig.setPose(P);
    const pen = findPenetrations(model, only).filter(x => (x.a.startsWith('thumb') !== x.b.startsWith('thumb')));
    rig.helpers.thumbPad.getWorldPosition(a); rig.helpers.pinchPoint.getWorldPosition(b);
    return { c: a.distanceTo(b) * 20 + pen.reduce((s, x) => s + x.points + x.depth * 50, 0), pen: pen.length, gap: a.distanceTo(b) };
  };
  let best = cost();
  /** @type {[any, string | number][]} */
  const knobs = [[P.thumb, 'opp'], [P.thumb, 'curl1'], [P.thumb, 'spread1'], [P.thumb, 'curl2'], [P.thumb, 'curl3'], [P.index.curl, 0], [P.index.curl, 1], [P.index.curl, 2]];
  for (let step = 4; step > 0.2 && best.pen; step *= 0.6) {
    for (let it = 0; it < 12 && best.pen; it++) {
      let improved = false;
      for (const [o, k] of knobs) {
        for (const d of [step, -step]) {
          const old = o[k];
          o[k] = old + d;
          const c = cost();
          if (c.c < best.c - 1e-6) { best = c; improved = true; } else o[k] = old;
        }
      }
      if (!improved) break;
    }
  }
  // pinchPoint is where the two pads meet: put it exactly on the thumb pad in this pose
  rig.setPose(P);
  rig.root.updateMatrixWorld(true);
  rig.helpers.thumbPad.getWorldPosition(a);
  rig.bones.index3.worldToLocal(a);
  rig.helpers.pinchPoint.position.copy(a);
  return { gap: +best.gap.toFixed(3), penetrating: best.pen };
}

/** All joints at rest (fingers straight, wrist neutral): the leather's bind pose. */
export function restPose() {
  const f = () => ({ curl: /** @type {[number, number, number]} */ ([0, 0, 0]), spread: 0 });
  return { index: f(), middle: f(), ring: f(), little: f(), thumb: { opp: 0, curl1: 0, spread1: 0, curl2: 0, curl3: 0 }, wrist: { pitch: 0, yaw: 0, roll: 0 }, cap: 0 };
}

/**
 * The back-of-hand plate: the outline extruded with 8 bevel segments, divided finely enough to
 * bend, subdivided once (Loop) on LOD0, bent onto the dome, smooth normals; plus its rolled edge.
 * @param {typeof LODS[0]} L
 * @param {(n: number) => THREE.Vector2[]} outline
 * @param {(x: number, y: number) => number} domeZ
 * @param {{ t: number, rb: number }} sh
 */
function backPlateGeometry(L, outline, domeZ, sh) {
  const pts = outline(L.subdivide ? 96 : 56);
  const shape = new THREE.Shape(pts);
  const bevelT = sh.t * 0.38, depth = sh.t - 2 * bevelT;
  let g = /** @type {THREE.BufferGeometry} */ (new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: 0.05, bevelSegments: 8, curveSegments: 8 }));
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g = new TessellateModifier(L.tessEdge, 12).modify(g);
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  if (L.subdivide) g = LoopSubdivision.modify(g, 1, { split: false, uvSmooth: false, preserveEdges: false, flatOnly: false });
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setZ(i, domeZ(x, y) + z - depth / 2);
  }
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  // uv in cm/10 for the dents
  const uv = new Float32Array(pos.count * 2);
  const P = g.getAttribute('position');
  for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / 8; uv[i * 2 + 1] = P.getY(i) / 8; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // rolled edge: a bead along the outline, sitting on the dome
  const ring = outline(L.subdivide ? 160 : 72).map(p => {
    const c = new THREE.Vector2((p.x - 5.25) * 0.0, 0);
    void c;
    return new THREE.Vector3(p.x, p.y, domeZ(p.x, p.y) + sh.rb - sh.t / 2);
  });
  const curve = new THREE.CatmullRomCurve3(ring, true, 'centripetal');
  const bead = new THREE.TubeGeometry(curve, ring.length, sh.rb, L.bead, true);
  const merged = mergeGeometries([g.index ? g.toNonIndexed() : g, bead.toNonIndexed()]);
  merged.computeBoundingSphere();
  return merged;
}

/** Concatenate non-indexed geometries with position, normal and uv. @param {THREE.BufferGeometry[]} list */
function mergeGeometries(list) {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
    pos.set(/** @type {Float32Array} */ (P.array), o * 3);
    nor.set(/** @type {Float32Array} */ (N.array), o * 3);
    if (U) uv.set(/** @type {Float32Array} */ (U.array), o * 2);
    o += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/**
 * Leather under-glove: tubes along the wrist, palm, fingers and thumb, skinned with two bones
 * blended at every joint, so it bends smoothly under the plates.
 * @param {ReturnType<typeof createRig>} rig
 * @param {THREE.Bone[]} boneList
 * @param {typeof LODS[0]} L
 * @param {Record<string, number[]>} fingerRadii
 * @param {number[]} thumbRadii
 * @param {{ t: number }} small
 */
function leatherGeometry(rig, boneList, L, fingerRadii, thumbRadii, small) {
  const B = rig.bones;
  const idxOf = (/** @type {string} */ n) => boneList.indexOf(B[n]);
  /** @type {number[]} */ const pos = [], uv = [], si = [], sw = [], index = [];
  const n = L.skinRing;
  const P = new THREE.Vector3(), tmp = new THREE.Vector3();
  /**
   * @param {{ bone: string, x: number, ry: number, rz: number, cz?: number, w: [string, number][] }[]} rings
   * @param {boolean} capEnd close the end with a dome point
   */
  const tube = (rings, capEnd) => {
    const base = pos.length / 3;
    rings.forEach((r, k) => {
      const m = B[r.bone].matrixWorld;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        P.set(r.x, -Math.sin(a) * r.ry, (r.cz ?? 0) + Math.cos(a) * r.rz).applyMatrix4(m);
        pos.push(P.x, P.y, P.z);
        uv.push(i / n * 2, k * 0.15);
        const ws = r.w.slice(0, 4);
        while (ws.length < 4) ws.push([r.bone, 0]);
        for (const [bn, w] of ws) { si.push(idxOf(bn)); sw.push(w); }
      }
    });
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < n; i++) {
        const a = base + k * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    if (capEnd) {
      const last = rings[rings.length - 1];
      tmp.set(last.x + Math.min(last.ry, last.rz) * 0.9, 0, last.cz ?? 0).applyMatrix4(B[last.bone].matrixWorld);
      const apex = pos.length / 3;
      pos.push(tmp.x, tmp.y, tmp.z); uv.push(0.5, rings.length * 0.15);
      const ws = last.w.slice(0, 4); while (ws.length < 4) ws.push([last.bone, 0]);
      for (const [bn, w] of ws) { si.push(idxOf(bn)); sw.push(w); }
      const lb = base + (rings.length - 1) * (n + 1);
      for (let i = 0; i < n; i++) index.push(lb + i, apex, lb + i + 1);
    }
  };
  const blend = (/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ s) => /** @type {[string, number][]} */ (s <= 0 ? [[a, 1]] : s >= 1 ? [[b, 1]] : [[a, 1 - s], [b, s]]);
  const ramp = (/** @type {number} */ x, /** @type {number} */ c, /** @type {number} */ half) => Math.min(1, Math.max(0, (x - (c - half)) / (2 * half)));

  // wrist: forearm → wrist → hand (in the hand frame, x −3.5 … 3)
  {
    const rings = [];
    for (let x = -3.6; x <= 3.01; x += 0.4) {
      const s1 = ramp(x, -0.9, 0.9), s2 = ramp(x, 0.9, 0.9);
      const w = /** @type {[string, number][]} */ (s1 < 1 ? blend('forearm', 'wrist', s1) : blend('wrist', 'hand', s2));
      const k = smooth(-3.6, 3, x);
      rings.push({ bone: x < 0 ? 'wrist' : 'hand', x, ry: 3.95 - 0.1 * k, rz: 2.3 - 0.35 * k, cz: -0.05, w });
    }
    tube(rings, false);
  }
  // palm (hand bone)
  {
    const rings = [];
    for (let x = 1.8; x <= 9.6; x += 0.4) {
      const k = smooth(1.8, 8.5, x);
      rings.push({ bone: 'hand', x, ry: HAND.palmHalfWidth - 0.3 + 0.75 * k, rz: HAND.palmHalfHeight - 0.15 * k, cz: 0.05, w: /** @type {[string, number][]} */ ([['hand', 1]]) });
    }
    tube(rings, false);
  }
  // fingers
  for (const name of FINGER_NAMES) {
    const F = FINGERS[name];
    const R = fingerRadii[name];
    const rings = [];
    const total = F.len[0] + F.len[1] + F.len[2] * 0.95;
    for (let s = -0.9; s <= total; s += 0.3) {
      // which segment
      let seg = 0, x = s;
      if (s >= F.len[0]) { seg = 1; x = s - F.len[0]; }
      if (s >= F.len[0] + F.len[1]) { seg = 2; x = s - F.len[0] - F.len[1]; }
      const bone = `${name}${seg + 1}`;
      const r = (R[seg] - small.t / 2 - 0.09) * (seg === 2 ? 1 - 0.25 * smooth(F.len[2] * 0.5, F.len[2], x) : 1);
      /** @type {[string, number][]} */
      let w;
      if (seg === 0) w = blend('hand', bone, ramp(s, 0, 0.45));
      else if (seg === 1) w = x < 0.4 ? blend(`${name}1`, bone, ramp(x, 0, 0.4)) : [[bone, 1]];
      else w = x < 0.4 ? blend(`${name}2`, bone, ramp(x, 0, 0.4)) : [[bone, 1]];
      if (seg === 0 && s > F.len[0] - 0.4) w = blend(bone, `${name}2`, ramp(s, F.len[0], 0.4));
      if (seg === 1 && x > F.len[1] - 0.4) w = blend(bone, `${name}3`, ramp(x, F.len[1], 0.4));
      rings.push({ bone, x, ry: r, rz: r, w });
    }
    tube(rings, true);
  }
  // thumb
  {
    const rings = [];
    const T = THUMB;
    const total = T.len[0] + T.len[1] + T.len[2] * 0.9;
    for (let s = 0.4; s <= total; s += 0.3) {
      let seg = 0, x = s;
      if (s >= T.len[0]) { seg = 1; x = s - T.len[0]; }
      if (s >= T.len[0] + T.len[1]) { seg = 2; x = s - T.len[0] - T.len[1]; }
      const bone = `thumb${seg + 1}`;
      const r = (thumbRadii[seg] - small.t / 2 - 0.1) * (seg === 0 ? 0.92 + 0.08 * smooth(0.4, 2, s) : 1) * (seg === 2 ? 1 - 0.25 * smooth(T.len[2] * 0.5, T.len[2], x) : 1);
      /** @type {[string, number][]} */
      let w = [[bone, 1]];
      if (seg === 0) w = blend('hand', bone, ramp(s, 1.2, 0.8));
      if (seg === 0 && s > T.len[0] - 0.4) w = blend(bone, 'thumb2', ramp(s, T.len[0], 0.4));
      if (seg === 1 && x < 0.4) w = blend('thumb1', bone, ramp(x, 0, 0.4));
      if (seg === 1 && x > T.len[1] - 0.4) w = blend(bone, 'thumb3', ramp(x, T.len[1], 0.4));
      if (seg === 2 && x < 0.4) w = blend('thumb2', bone, ramp(x, 0, 0.4));
      rings.push({ bone, x, ry: r, rz: r, w });
    }
    tube(rings, true);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
