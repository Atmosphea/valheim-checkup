// @ts-check
/**
 * WP-08 rig: 19 bones (forearm, wrist, hand, 3 per finger × 4, thumb × 3, index tip cap), joint
 * limits, poses blended per bone by quaternion slerp, the two helper points (`pointerTip`,
 * `pinchPoint`) and the two-bone arm (`placeArm`).
 *
 * Pure three.js (no DOM), so the unit tests can pose it in Node.
 */
import * as THREE from 'three';
import { FINGERS, FINGER_NAMES, THUMB, ARM, CAP, LAME_STEP, LAME_OVERLAP, CLEARANCE } from './dims.js';
import { POSES } from './poses.js';
import { gauntletRig as RIG } from '../config/motion.js';

const D = Math.PI / 180;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (/** @type {number} */ v, /** @type {number[]} */ [a, b]) => Math.min(b, Math.max(a, v));

/** Radius of a finger's segment `s` base (the inner lame), after nesting at the joints. */
export function segmentRadii(/** @type {{ r: number, taper: number }} */ f, /** @type {number} */ t, /** @type {number} */ rb, /** @type {number} */ overlap, /** @type {number} */ clearance) {
  const out = [f.r];
  for (let s = 1; s < 3; s++) {
    const prevOuterIn = out[s - 1] + LAME_STEP - t / 2;
    // the next inner lame swings under the previous outer lame about the joint: every point of
    // it within `overlap` of the joint must stay inside that lame's inner skin
    const fit = Math.sqrt(prevOuterIn * prevOuterIn - overlap * overlap) - clearance - (2 * rb - t / 2);
    out.push(Math.min(out[s - 1] * f.taper, fit));
  }
  return out;
}

/** The cap's radius: under the distal segment's inner lame (the visor swings inside the finger). */
export function capRadius(/** @type {number} */ r3, /** @type {number} */ t, /** @type {number} */ rb, /** @type {number} */ clearance) {
  return r3 - t / 2 - clearance - (2 * rb - t / 2) - 0.06;
}

/** Distal-segment layout shared by the model and the rig (where the cap's hinge and tip are). */
export function distalLayout(/** @type {number} */ len) {
  const aEnd = 0.4 * len, bStart = 0.3 * len, bEnd = 0.78 * len;
  const pivot = bEnd - 0.24;
  const capStart = pivot - 0.06;
  const tip = capStart + CAP.barrel + CAP.dome;
  return { aEnd, bStart, bEnd, pivot, capStart, tip };
}

/** @param {number} yaw @param {number} pitch @param {number} [roll] degrees: yaw about z, then pitch about y, then roll about x */
function ypr(yaw, pitch, roll = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(Z, yaw * D);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, pitch * D));
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(X, roll * D));
  return q;
}

/**
 * @param {{ t: number, rb: number }} shell  the small-plate shell (finger lames), for the radii
 */
export function createRig(shell = { t: 0.05, rb: 0.045 }) {
  const root = new THREE.Group();
  root.name = 'gauntlet';
  /** @type {Record<string, THREE.Bone>} */
  const bones = {};
  /** @type {Record<string, THREE.Quaternion>} */
  const rest = {};
  const bone = (/** @type {string} */ name, /** @type {THREE.Object3D} */ parent, /** @type {number[]} */ at, /** @type {THREE.Quaternion} */ q = new THREE.Quaternion()) => {
    const b = new THREE.Bone();
    b.name = `g-${name}`;
    b.position.set(at[0], at[1], at[2]);
    b.quaternion.copy(q);
    rest[name] = q.clone();
    parent.add(b);
    bones[name] = b;
    return b;
  };
  const forearm = bone('forearm', root, [0, 0, 0]);
  const wrist = bone('wrist', forearm, [ARM.length, 0, 0]);
  const hand = bone('hand', wrist, [0, 0, 0]);
  /** @type {Record<string, number[]>} */
  const radii = {};
  for (const name of FINGER_NAMES) {
    const F = FINGERS[name];
    radii[name] = segmentRadii(F, shell.t, shell.rb, LAME_OVERLAP, CLEARANCE);
    const b1 = bone(`${name}1`, hand, F.at, ypr(F.yaw, F.pitch));
    const b2 = bone(`${name}2`, b1, [F.len[0], 0, 0]);
    bone(`${name}3`, b2, [F.len[1], 0, 0]);
  }
  const T = THUMB;
  const t1 = bone('thumb1', hand, T.at, ypr(T.yaw, T.pitch, T.roll));
  const t2 = bone('thumb2', t1, [T.len[0], 0, 0]);
  bone('thumb3', t2, [T.len[1], 0, 0]);
  const dl = distalLayout(FINGERS.index.len[2]);
  bone('indexCap', bones.index3, [dl.pivot, 0, 0]);

  // helpers
  const pointerTip = new THREE.Object3D();
  pointerTip.name = 'pointerTip';
  pointerTip.position.set(dl.tip, 0, -0.05);
  bones.index3.add(pointerTip);
  const r3 = radii.index[2];
  const pinchPoint = new THREE.Object3D();
  pinchPoint.name = 'pinchPoint';
  pinchPoint.position.set(FINGERS.index.len[2] * 0.5, 0, -(r3 + 0.28));
  bones.index3.add(pinchPoint);
  const tr3 = THUMB.r * THUMB.taper * THUMB.taper;
  const thumbPad = new THREE.Object3D();
  thumbPad.name = 'thumbPad';
  thumbPad.position.set(THUMB.len[2] * 0.55, 0, -(tr3 * 1.2));
  bones.thumb3.add(thumbPad);

  const L = RIG.limits;
  /** Pose → local quaternions per bone (limits applied). @param {import('./poses.js').Pose} p */
  function quats(p) {
    /** @type {Record<string, THREE.Quaternion>} */
    const q = {};
    for (const name of FINGER_NAMES) {
      const fp = p[name];
      const c = fp.curl.map(v => clamp(v, L.curl));
      const s = clamp(fp.spread, L.spread);
      q[`${name}1`] = rest[`${name}1`].clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z, s * D)).multiply(new THREE.Quaternion().setFromAxisAngle(Y, c[0] * D));
      q[`${name}2`] = new THREE.Quaternion().setFromAxisAngle(Y, c[1] * D);
      q[`${name}3`] = new THREE.Quaternion().setFromAxisAngle(Y, c[2] * D);
    }
    const th = p.thumb;
    // opposition swings the thumb under the palm: about the hand's x axis, in the hand frame
    q.thumb1 = new THREE.Quaternion().setFromAxisAngle(X, -clamp(th.opp, L.thumbOpp) * D)
      .multiply(rest.thumb1)
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, clamp(th.spread1, L.thumbSpread1) * D))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Y, clamp(th.curl1, L.thumbCurl1) * D));
    q.thumb2 = new THREE.Quaternion().setFromAxisAngle(Y, clamp(th.curl2, L.thumbCurl) * D);
    q.thumb3 = new THREE.Quaternion().setFromAxisAngle(Y, clamp(th.curl3, L.thumbCurl) * D);
    const w = p.wrist;
    // roll is the whole arm's (placeArm rolls the forearm with the hand); the wrist bones bend in pitch and yaw
    const R = ypr(clamp(w.yaw, L.wristYaw), clamp(w.pitch, L.wristPitch));
    const half = new THREE.Quaternion().slerp(R, 0.5);
    q.wrist = half.clone();
    q.hand = half.clone();
    q.indexCap = new THREE.Quaternion().setFromAxisAngle(Y, -Math.min(1, Math.max(0, p.cap)) * RIG.capOpenDeg * D);
    return q;
  }

  /**
   * Set the bones to a blend of poses. `weights` maps pose name → weight (normalised here);
   * blended by successive slerp, which for two poses is the plain per-bone slerp.
   * @param {Record<string, number> | import('./poses.js').Pose} what
   */
  function setPose(what) {
    const entries = 'index' in what ? [[/** @type {any} */ (what), 1]] : Object.entries(what).filter(([, w]) => w > 0).map(([n, w]) => [POSES[n], w]);
    let acc = /** @type {Record<string, THREE.Quaternion> | null} */ (null), total = 0;
    for (const [p, w] of entries) {
      const q = quats(p);
      if (!acc) { acc = q; total = w; continue; }
      total += w;
      const t = w / total;
      for (const k of Object.keys(q)) acc[k].slerp(q[k], t);
    }
    if (!acc) return;
    for (const k of Object.keys(acc)) bones[k].quaternion.copy(acc[k]);
  }

  return { root, bones, rest, radii, helpers: { pointerTip, pinchPoint, thumbPad }, quats, setPose, distal: dl, capR: capRadius(r3, shell.t, shell.rb, CLEARANCE) };
}

/**
 * Solve the pinch pose's thumb so its pad meets the index pad at pinchPoint (spec). Coordinate
 * descent over the five thumb angles within their limits; mutates POSES.pinch.thumb.
 * @param {ReturnType<typeof createRig>} rig
 * @returns {number} the remaining gap, cm
 */
export function solvePinch(rig) {
  const P = POSES.pinch;
  const keys = /** @type {(keyof import('./poses.js').ThumbPose)[]} */ (['opp', 'curl1', 'spread1', 'curl2', 'curl3']);
  /** the index curls toward the thumb as well (0, 1, 2) */
  const ikeys = [0, 1, 2];
  const lim = { opp: RIG.limits.thumbOpp, curl1: RIG.limits.thumbCurl1, spread1: RIG.limits.thumbSpread1, curl2: RIG.limits.thumbCurl, curl3: RIG.limits.thumbCurl };
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const hand = rig.bones.hand;
  const saved = { p: rig.root.position.clone(), q: rig.root.quaternion.clone() };
  const err = () => {
    rig.setPose(P);
    hand.updateMatrixWorld(true);
    rig.helpers.thumbPad.getWorldPosition(a);
    rig.helpers.pinchPoint.getWorldPosition(b);
    return a.distanceTo(b);
  };
  let e = err();
  for (let step = 8; step > 0.01; step *= 0.6) {
    for (let it = 0; it < 30; it++) {
      let improved = false;
      for (const k of keys) {
        for (const d of [step, -step]) {
          const old = P.thumb[k];
          P.thumb[k] = clamp(old + d, lim[k]);
          const e2 = err();
          if (e2 < e - 1e-6) { e = e2; improved = true; } else P.thumb[k] = old;
        }
      }
      for (const k of ikeys) {
        for (const d of [step, -step]) {
          const old = P.index.curl[k];
          P.index.curl[k] = clamp(old + d, [k === 2 ? 5 : 15, 75]);
          const e2 = err();
          if (e2 < e - 1e-6) { e = e2; improved = true; } else P.index.curl[k] = old;
        }
      }
      if (!improved) break;
    }
  }
  rig.root.position.copy(saved.p); rig.root.quaternion.copy(saved.q);
  return e;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();
const _eu = new THREE.Euler();

/**
 * The two-bone arm: put the forearm so that the wrist is where the hand needs it and the elbow
 * bends toward the pole, then split the wrist's turn (clamped to its limits) between the wrist
 * and hand bones. Iterates so that `pointerTip` lands on `tip` even when the wrist is clamped.
 * The root must sit at the world origin (the gauntlet root is in world space).
 *
 * @param {ReturnType<typeof createRig>} rig
 * @param {THREE.Vector3} tip     wanted pointerTip (or pinchPoint) position, world cm
 * @param {THREE.Quaternion} handQ  wanted hand orientation, world
 * @param {{ helper?: THREE.Object3D, roll?: number, shoulder?: {x: number, y: number, z: number}, pole?: {x: number, y: number, z: number}, upperArm?: number }} [o]
 * @returns {{ wristClamped: boolean, reach: number, elbow: THREE.Vector3 }}
 */
export function placeArm(rig, tip, handQ, o = {}) {
  const B = rig.bones;
  const helper = o.helper ?? rig.helpers.pointerTip;
  // WP-17 item 19: the left hand is solved as the mirror image of a right arm (gauntlet/index.js),
  // so its shoulder, pole and upper arm come in here already mirrored
  const SH = o.shoulder ?? RIG.shoulder, PO = o.pole ?? RIG.pole;
  const S = _v.set(SH.x, SH.y, SH.z);
  const L1 = o.upperArm ?? RIG.upperArm, L2 = ARM.length;
  // helper position in the hand frame (fingers already posed)
  B.hand.updateMatrix();
  const local = handLocal(rig, helper);
  let Qh = handQ.clone();
  let clamped = false, reach = 0;
  const E = new THREE.Vector3();
  const L = RIG.limits;
  for (let it = 0; it < 4; it++) {
    // wrist = tip − Qh · local
    _w.copy(local).applyQuaternion(Qh);
    const W = _w.multiplyScalar(-1).add(tip);
    // two-bone IK: elbow on the circle, toward the pole
    _f.subVectors(W, S);
    let d = _f.length();
    reach = d / (L1 + L2);
    d = Math.min(Math.max(d, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01);
    const dir = _f.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _e.set(PO.x, PO.y, PO.z).normalize();
    _e.addScaledVector(dir, -_e.dot(dir)).normalize();
    E.copy(S).addScaledVector(dir, a).addScaledVector(_e, h);
    // forearm frame: x along the forearm, roll so its back faces the hand's back
    _ax.subVectors(W, E).normalize();
    _az.set(0, 0, 1).applyQuaternion(Qh);
    _az.addScaledVector(_ax, -_az.dot(_ax));
    if (_az.lengthSq() < 1e-6) _az.set(0, 0, 1).addScaledVector(_ax, -_ax.z);
    _az.normalize();
    _ay.crossVectors(_az, _ax);
    _m.makeBasis(_ax, _ay, _az);
    const Qf = _q.setFromRotationMatrix(_m);
    // wrist turn = Qf⁻¹ · Qh, clamped
    const R = _qi.copy(Qf).invert().multiply(Qh);
    _eu.setFromQuaternion(R, 'ZYX');
    const yaw = _eu.z / D, pitch = _eu.y / D, roll = _eu.x / D;
    const cy = clamp(yaw, L.wristYaw), cp = clamp(pitch, L.wristPitch), cr = clamp(roll, L.wristRoll);
    clamped = cy !== yaw || cp !== pitch || cr !== roll;
    const Rc = ypr(cy, cp, cr);
    B.forearm.position.copy(E);
    B.forearm.quaternion.copy(Qf);
    const half = new THREE.Quaternion().slerp(Rc, 0.5);
    B.wrist.quaternion.copy(half);
    B.hand.quaternion.copy(half);
    const Qh2 = Qf.clone().multiply(Rc);
    if (!clamped || Qh2.angleTo(Qh) < 1e-4) { Qh = Qh2; break; }
    Qh = Qh2;
  }
  rig.root.updateMatrixWorld(true);
  return { wristClamped: clamped, reach, elbow: E };
}

/** A helper's position in the hand frame (fingers as currently posed). @param {ReturnType<typeof createRig>} rig @param {THREE.Object3D} helper */
export function handLocal(rig, helper) {
  const out = new THREE.Vector3();
  helper.updateMatrix();
  out.copy(helper.position);
  for (let o = helper.parent; o && o !== rig.bones.hand; o = o.parent) { o.updateMatrix(); out.applyMatrix4(o.matrix); }
  return out;
}
