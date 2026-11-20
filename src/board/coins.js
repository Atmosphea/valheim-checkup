// @ts-check
/**
 * The five coins (WP-06 coin table): gold discs with raised polished rims, the legend
 * engraved around the field (IM Fell English SC) and an emblem in the middle, lying flat
 * with a slight fixed turn each, as if placed by hand.
 *
 * Reactions (file 04 "Coins"): hover hop (up 0.6 cm in 140 ms, tilt 8° toward the pointer,
 * spin 15°, two shrinking bounces 0.18 / 0.05 cm, 400 ms wobble), press −0.08 cm, file drag
 * (all coins hum with a fine jitter, the Load coin rises 0.4 cm and its rune ring turns),
 * drop accepted (Load flips 360° in 500 ms), save loaded (rune flash and gold motes),
 * load failed (shakes "no" twice), impact above 0.7 (rattle and a small hop), Import / Export
 * (flip 180° and back in 420 ms), Sound muted (turns to its struck-bell reverse in 300 ms).
 *
 * Each coin is a group: `base` (place and fixed turn) → `body` (hop, tilt, flip) → two lathe
 * halves, front (face up) and back.
 */
import * as THREE from 'three';
import { coins as LC, coinSpec } from '../config/layout.js';
import { coin as MC } from '../config/motion.js';
import { board as BR } from '../config/render.js';
import { createGold, applyEngraving } from '../scene/materials/index.js';
import { addPatch, patchUniforms } from '../scene/materials/patch.js';
import { Spring } from '../util/spring.js';
import { ease } from '../util/ease.js';

const DEG = Math.PI / 180;

/** Profile of one face half (r, y) for a coin of radius R and thickness t; y ≥ 0, axis y. */
function halfProfile(R, t) {
  const h = t / 2, drop = BR.coinFieldDrop;
  return [
    [0, h - drop], [0.83 * R, h - drop], [0.86 * R, h - drop * 0.3], [0.885 * R, h],
    [0.95 * R, h], [0.985 * R, h - 0.02], [R, h - 0.07], [R, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

/** Lathe half with planar uv over the face (u along x, v along −z, so text reads upright once turned to face +z). */
function halfGeometry(R, t, back) {
  const g = new THREE.LatheGeometry(halfProfile(R, t), BR.coinSegments);
  if (back) g.scale(1, -1, 1);
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    uv.setXY(i, 0.5 + x / (2 * R), 0.5 + (back ? z : -z) / (2 * R));
  }
  uv.needsUpdate = true;
  // LatheGeometry winds a centre-outward profile facing −y; the front half is re-wound to face +y.
  // The back half's mirror (scale y −1) already turns it to face −y.
  if (!back) { const idx = g.getIndex(); if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); } idx.needsUpdate = true; } }
  g.computeVertexNormals();
  // the vertices on the axis only touch degenerate triangles: give them the face normal
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i), pos.getZ(i)) < 1e-6) nrm.setXYZ(i, 0, back ? -1 : 1, 0);
  nrm.needsUpdate = true;
  return g;
}

/**
 * @typedef {object} Coin
 * @property {string} id
 * @property {number} r
 * @property {number} t
 * @property {THREE.Group} base
 * @property {THREE.Group} body
 * @property {THREE.Mesh} front
 * @property {THREE.Mesh} back
 * @property {THREE.MeshPhysicalMaterial} frontMat
 * @property {THREE.MeshPhysicalMaterial} backMat
 * @property {Spring} press
 * @property {Spring} rise
 * @property {Spring} dim
 * @property {{ t0: number, dirX: number, dirY: number, landed: number, zFrom?: number } | null} hop
 * @property {{ t0: number, from: number, to: number } | null} [spinAnim]  Paul, WP-18 item 8
 * @property {{ t0: number, ms: number, deg: number, back: boolean } | null} flip
 * @property {{ t0: number } | null} shake
 * @property {{ t0: number, h: number } | null} rattleHop
 * @property {number} spin
 * @property {number} face        0 = front up, 1 = reverse up (Sound muted)
 * @property {{ t0: number, from: number, to: number } | null} turn
 * @property {number} rune        rune glow 0..1 (WP-09 spark; "save loaded" flash)
 * @property {number} runeFlashT0
 * @property {number} focus
 */

/**
 * @param {import('../scene/textures/index.js').Textures} tex
 * @param {{ emit: (type: string, data: any) => void, now: () => number, rng: { range(a: number, b: number): number, next(): number }, impact: (o: {strength: number, x: number, y: number}) => void }} o
 */
export function createCoins(tex, o) {
  const root = new THREE.Group();
  root.name = 'coins';
  /** @type {Map<string, Coin>} */
  const coins = new Map();
  const runeColor = new THREE.Color(BR.runeColor);
  const focusColor = new THREE.Color(BR.focusGlow);

  for (const c of LC) {
    const spec = coinSpec[/** @type {keyof typeof coinSpec} */ (c.id)];
    const R = spec.r, t = spec.t;
    const base = new THREE.Group();
    base.name = `coin:${c.id}`;
    base.position.set(c.x, c.y, 0);
    const body = new THREE.Group();
    body.position.z = t / 2 + 0.02;
    const mkMat = (/** @type {string} */ slot, /** @type {boolean} */ back) => {
      const m = createGold(tex, { radius: R });
      m.name = `coin:${c.id}${back ? ':back' : ''}`;
      applyEngraving(m, tex.engraver, slot, { faceRect: [0, 0, 1, 1], axis: [0, back ? -1 : 1, 0], faceWidthCm: 2 * R, deferred: true, cavityShade: BR.metalEngraveShade, depth: BR.metalEngraveDepth });
      addPatch(m, {
        key: 'rune',
        uniforms: { uRune: { value: 0 }, uRuneColor: { value: runeColor.clone().multiplyScalar(MC.sparkRuneEmissiveTo) } },
        fragmentHead: 'uniform float uRune; uniform vec3 uRuneColor;',
        afterEmissive: 'totalEmissiveRadiance += uRuneColor * uRune * vcCav;',
      });
      m.emissive = new THREE.Color(0);
      m.userData.baseColor = m.color.clone();
      return m;
    };
    const frontMat = mkMat(`coin:${c.id}`, false);
    const backMat = mkMat(c.id === 'sound' ? 'coin:sound:back' : `coin:${c.id}`, true);
    // the coin's resting turn is baked into the geometry (about the lathe axis, which becomes z),
    // so its bounding box stays the coin's own circle
    const turned = (/** @type {boolean} */ back) => halfGeometry(R, t, back).rotateY(spec.rotDeg * DEG);
    const front = new THREE.Mesh(turned(false), frontMat);
    const back = new THREE.Mesh(turned(true), backMat);
    for (const m of [front, back]) {
      m.rotation.x = Math.PI / 2; // lathe axis y → z
      m.castShadow = true; m.receiveShadow = true;
      m.name = `coin-${c.id}`;
      body.add(m);
    }
    back.name = `coin-${c.id}-back`;
    // WP-14 (draw calls): the two halves throw the same shadow and the same veil silhouette, so
    // only the front half draws in the shadow pass and the veil
    back.castShadow = false;
    base.add(body);
    root.add(base);
    coins.set(c.id, {
      id: c.id, r: R, t, base, body, front, back, frontMat, backMat,
      press: new Spring({ ...MC.pressSpring, value: 0 }), rise: new Spring({ ...MC.pressSpring, value: 0 }), dim: new Spring({ stiffness: 300, damping: 35, value: 1 }),
      hop: null, flip: null, shake: null, rattleHop: null, spin: 0, face: 0, turn: null, rune: 0, runeFlashT0: -1e9, focus: 0,
    });
  }

  // timings of the hover hop (file 04: up 0.6 cm in 140 ms, bounces 0.18 and 0.05 cm)
  const g = 2 * MC.hoverHop / (MC.hoverHopMs / 1000) ** 2; // cm/s² that makes the rise take 140 ms
  const fallMs = MC.hoverHopMs; // symmetric
  const bounceMs = MC.hoverBounces.map(h => 2 * Math.sqrt(2 * h / g) * 1000);
  const HOP = {
    land1: MC.hoverHopMs + fallMs,
    land2: MC.hoverHopMs + fallMs + bounceMs[0],
    land3: MC.hoverHopMs + fallMs + bounceMs[0] + bounceMs[1],
  };
  HOP.end = HOP.land3 + MC.hoverWobbleMs;
  /** Paul, WP-18 item 8: the hover spin now (ease out with a small overshoot). @param {Coin} c @param {number} t */
  const spinNow = (c, t) => {
    const a = c.spinAnim; if (!a) return c.spin;
    const x = Math.min(1, Math.max(0, (t - a.t0) / MC.hoverSpinMs));
    const k = 1.70158 * 0.8, e = 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); // easeOutBack
    return a.from + (a.to - a.from) * e;
  };

  /** Height above rest during a hop, and the wobble amount 0..1. @param {number} ms */
  function hopAt(ms) {
    if (ms < MC.hoverHopMs) return { z: MC.hoverHop * ease.outQuad(ms / MC.hoverHopMs), air: 1, wob: 0 };
    if (ms < HOP.land1) { const x = (ms - MC.hoverHopMs) / fallMs; return { z: MC.hoverHop * (1 - x * x), air: 1, wob: 0 }; }
    if (ms < HOP.land2) { const x = (ms - HOP.land1) / bounceMs[0]; return { z: MC.hoverBounces[0] * 4 * x * (1 - x), air: 0.6, wob: 0 }; }
    if (ms < HOP.land3) { const x = (ms - HOP.land2) / bounceMs[1]; return { z: MC.hoverBounces[1] * 4 * x * (1 - x), air: 0.3, wob: 0 }; }
    if (ms < HOP.end) return { z: 0, air: 0, wob: 1 - (ms - HOP.land3) / MC.hoverWobbleMs };
    return null;
  }

  /** @param {string} id */
  const coinData = id => ({ coin: id });

  // file drag over the window
  let fileDrag = false, ringAngle = 0;

  const api = {
    root,
    coins,
    timings: HOP,
    /** Meshes the veil copies as casters. */
    casters: [...coins.values()].map(c => c.front),
    /**
     * Hover hop, tilting toward the pointer (dx, dy: pointer offset from the coin, cm).
     * @param {string} id @param {number} dx @param {number} dy
     */
    hover(id, dx = 0, dy = 0) {
      const c = coins.get(id);
      if (!c || c.flip || c.turn) return false;
      const t = o.now();
      // Paul, WP-18 item 8: a new hover retriggers at once, carrying on from the coin's height now
      if (c.hop && t - c.hop.t0 < MC.hoverRetriggerMs) return false;
      const was = c.hop ? hopAt(t - c.hop.t0) : null;
      const len = Math.hypot(dx, dy) || 1;
      c.hop = { t0: t, dirX: dx / len, dirY: dy / len, landed: 0, zFrom: was ? was.z : 0 };
      const from = c.spinAnim ? spinNow(c, t) : c.spin;
      c.spinAnim = { t0: t, from, to: from + (o.rng.next() < 0.5 ? -1 : 1) * MC.hoverSpinDeg * DEG };
      c.spin = from;
      o.emit('coin:hop', coinData(id));
      return true;
    },
    /** @param {string} id @param {boolean} down */
    press(id, down) {
      const c = coins.get(id);
      if (!c) return;
      c.press.target = down ? MC.pressDepth : 0;
      if (down) o.emit('coin:press', coinData(id));
    },
    /** Flip: Import / Export 180° and back in 420 ms; drop accepted 360° in 500 ms. @param {string} id @param {'transfer'|'drop'} kind */
    flip(id, kind) {
      const c = coins.get(id);
      if (!c || c.flip) return;
      c.hop = null;
      c.flip = kind === 'drop'
        ? { t0: o.now(), ms: MC.dropFlipMs, deg: MC.dropFlipDeg, back: false }
        : { t0: o.now(), ms: MC.transferFlipMs, deg: MC.transferFlipDeg, back: true };
      // coin:flip schedules its own landing sounds (WP-12): no coin:land for flips
      o.emit('coin:flip', { ...coinData(id), kind });
    },
    /** Load failed: shake "no", yaw ±10° twice. @param {string} id */
    shake(id) { const c = coins.get(id); if (c) c.shake = { t0: o.now() }; },
    /** Save loaded: the rune flashes gold. @param {string} id */
    flash(id) { const c = coins.get(id); if (c) c.runeFlashT0 = o.now(); },
    /** WP-09: the spark wakes a coin's runes (0..1). @param {string} id @param {number} v */
    setRuneGlow(id, v) { const c = coins.get(id); if (c) c.rune = Math.max(0, Math.min(1, v)); },
    /** Sound coin: show the reverse face (muted) or the front. @param {string} id @param {boolean} reverse */
    setFace(id, reverse) {
      const c = coins.get(id);
      const to = reverse ? 1 : 0;
      if (!c || (c.turn ? c.turn.to === to : c.face === to)) return;
      c.turn = { t0: o.now(), from: c.face, to };
    },
    /** Dimmed when its control is disabled (Export without a save). @param {string} id @param {boolean} on */
    setDimmed(id, on) { const c = coins.get(id); if (c) c.dim.target = on ? BR.disabledShade : 1; },
    /** Keyboard focus glow. @param {string} id @param {boolean} on */
    focus(id, on) { const c = coins.get(id); if (c) c.focus = on ? 1 : 0; },
    /** @param {boolean} on */
    setFileDrag(on) {
      fileDrag = on;
      const load = coins.get('load');
      if (load) load.rise.target = on ? MC.fileDragLoadRise : 0;
    },
    /** Impact felt at each coin. @param {(c: Coin) => number} feltAt */
    impact(feltAt) {
      for (const c of coins.values()) {
        const s = feltAt(c);
        if (s <= MC.impactHopThreshold || c.hop || c.flip) continue;
        c.rattleHop = { t0: o.now(), h: MC.impactHopMax * Math.min(1, (s - MC.impactHopThreshold) / (1 - MC.impactHopThreshold) + 0.3) };
      }
    },
    /** @param {number} dt */
    update(dt) {
      const now = o.now();
      if (fileDrag) ringAngle += MC.fileDragRingDegPerSec * DEG * dt / 1000;
      for (const c of coins.values()) {
        c.press.step(dt); c.rise.step(dt); c.dim.step(dt);
        // Paul, WP-16 item 23: the hand-set resting tilt; the raised edge lifts the centre by r·sin(tilt)
        const rest = /** @type {any} */ (coinSpec)[c.id]?.tiltDeg ?? [0, 0];
        let z = c.t / 2 + 0.02 + c.press.value + c.rise.value + c.r * Math.max(Math.abs(Math.sin(rest[0] * DEG)), Math.abs(Math.sin(rest[1] * DEG)));
        let tiltX = rest[0] * DEG, tiltY = rest[1] * DEG, flipA = 0, yaw = 0;
        // hover hop
        if (c.hop) {
          const ms = now - c.hop.t0;
          const h = hopAt(ms);
          if (!h) c.hop = null;
          else {
            // a retriggered hop starts from where the last one was and blends into its own rise
            const zf = c.hop.zFrom ?? 0;
            z += zf > 0 && ms < MC.hoverHopMs ? Math.max(h.z, zf * (1 - ms / MC.hoverHopMs) + h.z) : h.z;
            const tilt = MC.hoverTiltDeg * DEG * Math.min(1, h.air * 1.4);
            // wobble: rocking that speeds up as it dies, like a settling coin
            const wob = h.wob > 0 ? Math.sin((1 - h.wob) * MC.hoverWobbleMs / 1000 * Math.PI * 2 * MC.hoverWobbleHz * (1 + (1 - h.wob))) * h.wob * h.wob * MC.hoverTiltDeg * 0.4 * DEG : 0;
            // tilt toward the pointer: rotate about the axis perpendicular to the direction
            tiltX += -c.hop.dirY * (tilt + wob);
            tiltY += c.hop.dirX * (tilt + wob);
            if (c.hop.landed === 0 && ms >= HOP.land1) {
              c.hop.landed = 1;
              o.emit('coin:land', { ...coinData(c.id), contact: 1 });
              const wp = c.base.position;
              o.impact({ strength: MC.landImpact, x: wp.x, y: wp.y });
            } else if (c.hop.landed === 1 && ms >= HOP.land2) {
              c.hop.landed = 2;
              o.emit('coin:land', { ...coinData(c.id), contact: 2 });
            }
          }
        }
        // impact rattle hop
        if (c.rattleHop) {
          const x = (now - c.rattleHop.t0) / 120;
          if (x >= 1) c.rattleHop = null; else { z += c.rattleHop.h * 4 * x * (1 - x); tiltX += (o.rng.next() - 0.5) * 2 * DEG * (1 - x); }
        }
        // flips (lifted by the radius while on edge, plus an arc)
        if (c.flip) {
          const x = Math.min(1, (now - c.flip.t0) / c.flip.ms);
          const a = c.flip.back ? c.flip.deg * DEG * Math.sin(Math.PI * x) : c.flip.deg * DEG * ease.inOutQuad(x);
          flipA = a;
          z += Math.abs(Math.sin(a)) * c.r + 4 * x * (1 - x) * (c.flip.back ? 0.6 : 1.4);
          if (x >= 1) c.flip = null;
        }
        // Sound coin turning to its reverse (300 ms)
        if (c.turn) {
          const x = Math.min(1, (now - c.turn.t0) / MC.muteTurnMs);
          c.face = c.turn.from + (c.turn.to - c.turn.from) * ease.inOutQuad(x);
          if (x >= 1) { c.face = c.turn.to; c.turn = null; }
        }
        const faceA = c.face * Math.PI;
        z += Math.abs(Math.sin(faceA)) * c.r;
        // load failed: shake "no" twice, then settle with a thud
        if (c.shake) {
          const x = (now - c.shake.t0) / MC.failShakeMs;
          if (x >= 1) c.shake = null;
          else yaw = Math.sin(x * Math.PI * 2 * MC.failShakeCount) * MC.failShakeYawDeg * DEG * (1 - x * 0.5);
        }
        // file drag hum: fine jitter on every coin
        let jx = 0, jy = 0;
        if (fileDrag) {
          const ph = now / 1000 * MC.fileDragJitterHz * Math.PI * 2 + c.r * 7;
          jx = Math.sin(ph) * MC.fileDragJitter; jy = Math.cos(ph * 1.37) * MC.fileDragJitter;
        }
        c.body.position.set(jx, jy, z);
        if (c.spinAnim) { c.spin = spinNow(c, now); if (now - c.spinAnim.t0 >= MC.hoverSpinMs) { c.spin = c.spinAnim.to; c.spinAnim = null; } }
        c.body.rotation.set(tiltX + flipA + faceA, tiltY, c.spin + yaw + (c.id === 'load' ? ringAngle : 0), 'XYZ');
        // rune glow: spark (WP-09) or the "save loaded" flash
        const fx = (now - c.runeFlashT0) / MC.loadedFlashMs;
        const flash = fx >= 0 && fx <= 1 ? Math.sin(Math.PI * Math.min(1, fx * 1.6)) * (1 - fx * 0.3) : 0;
        const rune = Math.max(c.rune, flash, fileDrag && c.id === 'load' ? 0.35 + 0.25 * Math.sin(ringAngle * 3) : 0);
        for (const m of [c.frontMat, c.backMat]) {
          const u = patchUniforms(m, 'rune').uRune;
          if (u) u.value = rune;
          m.color.copy(m.userData.baseColor).multiplyScalar(c.dim.value);
          m.emissive.copy(focusColor).multiplyScalar(c.focus * 0.6);
        }
      }
    },
    dispose() {
      for (const c of coins.values()) { c.front.geometry.dispose(); c.back.geometry.dispose(); c.frontMat.dispose(); c.backMat.dispose(); }
    },
  };
  return api;
}

/** @typedef {ReturnType<typeof createCoins>} Coins */
