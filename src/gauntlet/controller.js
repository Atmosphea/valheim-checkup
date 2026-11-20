// @ts-check
/**
 * WP-09: the gauntlet is the pointer over the board; outside it, a spark released from its
 * fingertip is the pointer; the handover is seamless both ways. Values from file 04
 * (src/config/motion.js `gauntlet`, `spark`).
 *
 * The true pointer position always decides hover and clicks (input.js reads it straight from the
 * events); the gauntlet and the spark only draw it.
 *
 *   zones      gauntlet zone = woodblock outline grown by 1 cm (tested on the board's top face),
 *              spark zone = the rest of #desk; 0.6 cm hysteresis across the border
 *   follow     pointerTip sits 4 cm above the board on the pointer's ray (1.2 cm while pinching),
 *              follow spring 220 / 26; it never falls more than 1.2 cm behind (catch-up)
 *   poses      hover ↔ point (within 4 cm of a knob) ↔ pinch-ready (over a knob) → pinch (press)
 *              → drag (pinchPoint rides the knob) → release → hover; stretch after 3 s idle,
 *              every 25–40 s
 *   freeze     Paul, WP-16 item 15: when the spark leaves, the hand stays where it was (no wall
 *              any more) until the spark comes back
 *   catch      item 16: then it moves to the spark with inertia (an underdamped spring), turns to
 *              face it, and the two meet; a little jolt, and the aiming dot spawns
 *   reticle    item 14: a white dot the spark's size on the board under the pointer; the
 *              fingertip hovers just above it (vertically over the point, not on the ray)
 *   twirl      item 17: the spark leaves on 1–3 full turns with a slow-motion burst of sparks
 *   handover   two continuous values, the tip cap's openness and the spark's flight (0 = in the
 *              socket, 1 = on the pointer), run forward or back: reversing never jumps
 */
import * as THREE from 'three';
import './cursor.css';
import { emit, on } from '../bus.js';
import { clock } from '../util/clock.js';
import { rng } from '../util/rng.js';
import { vc, setCursorMode } from '../debug.js';
import { Spring } from '../util/spring.js';
import { STRINGS } from '../strings.js';
import motion, { gauntlet as MG, spark as MS, gauntletRig as RIG, breeze as MBz } from '../config/motion.js';
import { woodblock as WB, board as B, coins as LC } from '../config/layout.js';
import { gauntlet as GR } from '../config/render.js';
import { POSES } from './poses.js';
import { createSpark } from './spark.js';
import { breeze } from '../scene/breeze.js';
import { falloff } from '../scene/impact.js';
import { kelvinToColor } from '../scene/lights.js';

const D = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const SHOW_POINTER_KEY = 'vc-show-pointer';
const CARET_SEL = 'input[type="search"], input[type="number"], textarea, select';
const CONTROL_SEL = 'a[href], button, summary, select, input, textarea, label, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"]';

/**
 * @param {object} ctx
 * @param {ReturnType<typeof import('./index.js').createGauntlet>} ctx.gauntlet
 * @param {THREE.PerspectiveCamera} ctx.camera
 * @param {ReturnType<typeof import('../scene/input.js').createInput>} ctx.input
 * @param {any} ctx.board  the WP-06 board API
 * @param {any} ctx.paper  the WP-07 paper API (glow)
 * @param {{ spark: THREE.PointLight }} ctx.lights
 * @param {{ fxPainters: Set<(c: CanvasRenderingContext2D, w: number, h: number) => void> }} ctx.overlays
 * @param {(phase: any, fn: (dt: number, t: number) => void) => () => void} ctx.onPhase
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} ctx.project
 * @param {HTMLElement} ctx.desk
 */
export function createController(ctx) {
  const G = ctx.gauntlet;
  const helpers = G.helpers;
  const fork = rng.fork();
  const now = () => clock.now();
  const boardTop = B.thickness;

  // ── WP-18P: the spark's hover/caret hit test, in the clock's read phase ──────────────────
  // Re-tested when the pointer moved, or every 250 ms while it rests (content can change under a
  // still pointer: a view change, a dialog), only while the spark is shown.
  const hit = { x: NaN, y: NaN, at: -1e9, stale: true, hover: false, caret: false };
  let hitWanted = false;
  clock.onRead(() => {
    if (!hitWanted) return;
    const p = ctx.input.state, w = clock.wall();
    if (!hit.stale && p.clientX === hit.x && p.clientY === hit.y && w - hit.at < 250) return;
    hit.x = p.clientX; hit.y = p.clientY; hit.at = w; hit.stale = false;
    const el = Number.isFinite(p.clientX) ? document.elementFromPoint(p.clientX, p.clientY) : null;
    hit.caret = !!el?.closest?.(CARET_SEL);
    hit.hover = !hit.caret && !!el?.closest?.(CONTROL_SEL);
  });

  // ── Geometry helpers ────────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  /** Pointer ray ∩ plane z, for client px. @param {number} cx @param {number} cy @param {number} z @param {THREE.Vector3} out */
  function onPlane(cx, cy, z, out) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    const d = ray.ray.direction, o = ray.ray.origin;
    const t = (z - o.z) / d.z;
    return out.copy(o).addScaledVector(d, t);
  }
  const zone = { x0: WB.x0 - MG.zoneGrow, x1: WB.x1 + MG.zoneGrow, y0: WB.y0 - MG.zoneGrow, y1: WB.y1 + MG.zoneGrow };
  /** Signed distance into the zone (cm, + inside). @param {number} x @param {number} y */
  const inside = (x, y) => Math.min(x - zone.x0, zone.x1 - x, y - zone.y0, zone.y1 - y);

  // ── State ───────────────────────────────────────────────────────────────────────────────
  const rest = new THREE.Vector3(WB.x0 + MG.restAt.x, WB.y0 + MG.restAt.y, boardTop + MG.hoverHeight);
  const tip = rest.clone();
  const sx = new Spring({ ...MG.followSpring, value: tip.x }), sy = new Spring({ ...MG.followSpring, value: tip.y }), sz = new Spring({ ...MG.followSpring, value: tip.z });
  const springs = [sx, sy, sz];
  const lean = { roll: new Spring({ ...MG.leanSpring }), pitch: new Spring({ ...MG.leanSpring }), yaw: new Spring({ ...MG.leanSpring }), wall: new Spring({ ...MG.leanSpring }), watch: new Spring({ ...MG.watchSpring }) };
  const bob = new Spring({ ...MG.bobSpring });
  /** @type {Spring[]} */
  const fingerLag = ['index', 'middle', 'ring', 'little'].map(() => new Spring({ ...MG.fingerSpring }));
  let mode = /** @type {'gauntlet'|'spark'} */ ('gauntlet');
  let catching = false;
  let maxLag = 0;
  /** pose weights */
  /** @type {Record<string, number>} */
  const weights = { hover: 1 };
  let poseName = 'hover';
  /** handover */
  let cap = 0, flight = 0, leaving = false;
  /** WP-16: where the hand froze when the spark left; the inertial return; the twirl's turns */
  /** @type {THREE.Vector3|null} */
  let frozen = null;
  let returning = false, turns = 1, metAt = -1e9;
  /** WP-16 item 14: the aiming dot (0…1) and when it last spawned */
  let reticleAlpha = 0, reticleT0 = -1e9, reticleOn = false;
  const reticleAt = new THREE.Vector2();
  /** WP-16 item 17: the socket's screen point when the spark left (the twirl's start) */
  const leaveFrom = { x: -1e9, y: 0 };
  let flightFrom = new THREE.Vector2(), sparkScreen = new THREE.Vector2();
  /** hold (a bar pinched or dragged by the user) */
  let held = -1, holdBlend = 0;
  /** idle and stretch */
  let lastMove = now(), nextStretch = now() + fork.range(MG.stretchIntervalMinMs, MG.stretchIntervalMaxMs), stretchT0 = -1e9;
  /** Paul, WP-18 item 5: the spark is fully out and the hand is not catching it: the hand idles,
   * deaf to the mouse; it stretches now and then */
  let resting = false;
  let touch = false;
  /** @type {{t: number, wall: number, mode: string}[]} */
  const switches = [];
  let windowIn = false, windowAlpha = 0;
  let showPointer = false;
  try { showPointer = localStorage.getItem(SHOW_POINTER_KEY) === '1'; } catch { /* storage blocked */ }
  document.body.classList.toggle('vc-show-pointer', showPointer);

  const spark = createSpark({ rng: fork, emit, now });
  // During the tour its capture layer (z-index 1000) covers #desk, so the spark is painted on a
  // small canvas of its own above it; otherwise on #fx (layer 6).
  const tourOpen = () => document.body.classList.contains('vc-tour-open');
  const fxPaint = Object.assign((/** @type {CanvasRenderingContext2D} */ c) => { if (!tourOpen()) { paintReticle(c); spark.paint(c); } }, {
    /** Paul, WP-17 item 10a: nothing of the spark or the dot is on screen (the 2D layers may idle). */
    idle: () => spark.state.alpha < 0.002 && reticleAlpha < 0.002,
  });
  ctx.overlays.fxPainters.add(fxPaint);
  /** WP-16 item 14: the white aiming dot, the spark's size and shape; it pops in when it spawns. @param {CanvasRenderingContext2D} c */
  function paintReticle(c) {
    if (reticleAlpha <= 0.005) return;
    const k = Math.min(1, (now() - reticleT0) / MS.reticlePopMs);
    const pop = k < 1 ? 1 + MS.reticlePop * Math.sin(Math.PI * k) : 1;
    spark.dot(c, reticleAt.x, reticleAt.y, reticleAlpha * Math.min(1, k * 1.6 + 0.2), pop);
  }
  const top = document.createElement('canvas');
  top.className = 'vc-spark-top';
  top.setAttribute('aria-hidden', 'true');
  document.body.append(top);
  const topCtx = /** @type {CanvasRenderingContext2D} */ (top.getContext('2d'));
  function paintTop() {
    const on = tourOpen();
    if (top.hidden !== !on) top.hidden = !on; // WP-16A: write on change only (each write restyles)
    if (!on) return;
    const pr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * pr), h = Math.round(innerHeight * pr);
    if (top.width !== w || top.height !== h) { top.width = w; top.height = h; }
    topCtx.setTransform(1, 0, 0, 1, 0, 0);
    topCtx.clearRect(0, 0, w, h);
    topCtx.setTransform(pr, 0, 0, pr, 0, 0);
    topCtx.globalCompositeOperation = 'lighter';
    spark.paint(topCtx);
  }

  // pose quaternions, computed once per pose (the pinch pose was solved when the model was built)
  /** @type {Record<string, Record<string, THREE.Quaternion>>} */
  const PQ = {};
  for (const n of Object.keys(POSES)) PQ[n] = G.rig.quats(POSES[n]);
  const boneNames = Object.keys(PQ.hover);

  // pointer kind (touch has no spark)
  addEventListener('pointerdown', e => { touch = e.pointerType === 'touch'; if (!touch && mode === 'spark' && spark.state.alpha > 0.2) spark.click(e.clientX, e.clientY); }, true);
  addEventListener('pointermove', e => { if (e.pointerType !== 'touch') touch = false; }, true);

  // impacts: a small bob in the air
  on('impact', (/** @type {any} */ e) => {
    const felt = falloff(e.strength, Math.hypot(tip.x - e.x, tip.y - e.y));
    bob.impulse(-MG.impactBob * Math.sqrt(MG.bobSpring.stiffness) * felt);
  });

  // ── Help switch: "Also show the normal pointer" ────────────────────────────────────────
  const help = document.querySelector('details.help');
  if (help) {
    const label = document.createElement('label');
    label.className = 'vc-pointer-switch';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'vcShowPointer';
    box.checked = showPointer;
    box.addEventListener('change', () => {
      showPointer = box.checked;
      document.body.classList.toggle('vc-show-pointer', showPointer);
      try { localStorage.setItem(SHOW_POINTER_KEY, showPointer ? '1' : '0'); } catch { /* storage blocked */ }
    });
    label.append(box, ' ', STRINGS.showPointer);
    help.append(label);
  }

  // ── Per frame ───────────────────────────────────────────────────────────────────────────
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), T = new THREE.Vector3(), tmp = new THREE.Vector3();
  const handQ = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const sparkColor = kelvinToColor(MS.lightKelvin);
  ctx.lights.spark.color.copy(sparkColor);
  ctx.lights.spark.distance = MS.lightRange;
  let lastHover = false;
  let prevTip = tip.clone();
  let knobInfo = { d: Infinity, over: false, i: -1 };

  const off = ctx.onPhase('physics', (/** @type {number} */ dt) => {
    const t = now();
    const s = ctx.input.state;
    const pointerIn = s.inside && !touch;
    // window fade (150 ms)
    windowIn = pointerIn;
    windowAlpha = Math.max(0, Math.min(1, windowAlpha + (windowIn ? 1 : -1) * dt / MS.windowFadeMs));
    if (s.speed > 2) lastMove = t;

    // ── zone with hysteresis (pointer on the board's top face) ──
    let inZone = mode === 'gauntlet';
    if (pointerIn) {
      onPlane(s.clientX, s.clientY, boardTop, P);
      const d = inside(P.x, P.y);
      if (mode === 'gauntlet' && d < -MG.zoneHysteresis / 2) inZone = false;
      else if (mode === 'spark' && d > MG.zoneHysteresis / 2) inZone = true;
    }
    if (!pointerIn) inZone = mode === 'gauntlet';
    if (touch) inZone = true;
    if ((inZone ? 'gauntlet' : 'spark') !== mode) {
      mode = inZone ? 'gauntlet' : 'spark';
      leaving = mode === 'spark';
      if (leaving) {
        // Paul, WP-16 item 15: the hand freezes right here until the spark comes back
        frozen = tip.clone();
        returning = false;
        if (flight <= 0) turns = 1 + Math.floor(fork.next() * 3); // item 17: one, two or three turns
        emit('gauntlet:wall', { x: +tip.x.toFixed(2), y: +tip.y.toFixed(2) });
        emit('gauntlet:freeze', { x: +tip.x.toFixed(2), y: +tip.y.toFixed(2) });
      } else if (frozen) {
        // item 16: go and catch it
        frozen = null;
        returning = true;
        emit('gauntlet:catch', {});
      }
      setCursorMode(mode);
      switches.push({ t: now(), wall: performance.now(), mode });
      if (switches.length > 50) switches.shift();
    }

    // ── hold: a bar pinched or dragged by the user ──
    const h = ctx.board.held?.() ?? -1;
    if (h !== held) {
      if (h >= 0) emit('gauntlet:pinch', { bar: h });
      held = h;
    }
    holdBlend = Math.max(0, Math.min(1, holdBlend + (held >= 0 ? 1 : -1) * dt / (touch ? MG.touchGlideMs : MG.pinchMs)));

    // ── target for pointerTip ──
    const height = held >= 0 ? MG.pinchHeight : MG.hoverHeight;
    // Paul, WP-16 item 14: the fingertip stands straight above the point under the pointer (where
    // the aiming dot is), not on the pointer's ray, so the dot shows just below the fingertip
    if (pointerIn && mode === 'gauntlet' && !touch) { onPlane(s.clientX, s.clientY, boardTop, T); T.z += height; }
    else if (frozen) T.copy(frozen);
    else T.copy(rest);
    // idle breathing bob
    T.z += MG.idleBob * Math.sin(2 * Math.PI * MG.idleBobHz * t / 1000) + bob.step(dt);

    // knob proximity (for the pose machine), on the board's top
    knobInfo = nearestKnob(T);

    // ── follow spring, catch-up, wall ──
    const wallish = false; // WP-16 item 15: no wall any more; the hand freezes instead
    for (const sp of springs) {
      const p = returning ? MG.returnSpring : catching ? MG.catchUpSpring : MG.followSpring;
      sp.stiffness = p.stiffness; sp.damping = p.damping;
    }
    sx.target = T.x; sy.target = T.y; sz.target = T.z;
    for (const sp of springs) sp.step(dt);
    tip.set(sx.value, sy.value, sz.value);
    let lag = tip.distanceTo(T);
    if (returning && lag < MG.returnDoneCm && flight <= 0 && Math.hypot(sx.velocity, sy.velocity) < MG.returnDoneSpeed) returning = false;
    if (!wallish && !returning && pointerIn && mode === 'gauntlet') {
      if (lag > MG.catchUpStartCm) catching = true;
      if (catching && lag < MG.catchUpEndCm) catching = false;
      if (lag > MG.catchUpStartCm) {
        // never more than 1.2 cm behind: pull the tip in along the lag
        tip.sub(T).setLength(MG.catchUpStartCm).add(T);
        sx.value = tip.x; sy.value = tip.y; sz.value = tip.z;
        lag = MG.catchUpStartCm;
      }
      maxLag = Math.max(maxLag, lag);
    }

    // ── handover: cap and spark flight ──
    const wasCap = cap, wasFlight = flight;
    if (touch) { leaving = false; }
    if (leaving) {
      cap = Math.min(1, cap + dt / MG.plateOpenMs);
      if (cap >= MG.sparkOutAtMs / MG.plateOpenMs || flight > 0) flight = Math.min(1, flight + dt / (MG.sparkOutMs + MG.sparkOutPerTurnMs * turns));
    } else if (flight > 0) {
      // WP-16 item 16: the spark waits at the pointer until the hand has come most of the way, then
      // the two close on each other and meet
      G.model.socket.getWorldPosition(tmp);
      const sock = ctx.project(tmp.x, tmp.y, tmp.z);
      const gapCm = Math.hypot(sock.x - s.clientX, sock.y - s.clientY) / Math.max(1e-3, pxPerCm(tip));
      if (touch || !pointerIn || !returning || gapCm < MG.catchMeetCm || flight < 1) flight = Math.max(0, flight - dt / MG.sparkInMs);
      if (flight <= 0) {
        // they meet: a small jolt along the spark's way in, the dot spawns
        metAt = t;
        const dx = tip.x - T.x, dy = tip.y - T.y, dl = Math.hypot(dx, dy) || 1;
        sx.velocity += (dx / dl) * MG.catchJolt; sy.velocity += (dy / dl) * MG.catchJolt;
        bob.impulse(-MG.catchBob * Math.sqrt(MG.bobSpring.stiffness));
        spark.burst(sock.x, sock.y, Math.atan2(sock.y - sparkScreen.y, sock.x - sparkScreen.x), MS.catchBurst);
      }
    } else cap = Math.max(0, cap - dt / MG.plateCloseMs);
    if (wasCap === 0 && cap > 0) emit('visor:open', {});
    if (wasCap >= 1 && cap < 1 && !leaving) emit('visor:close', {});
    if (wasFlight === 0 && flight > 0) {
      emit('spark:out', { x: Math.round(s.clientX), y: Math.round(s.clientY), turns });
      // item 17: a small burst of sparks as it leaves, like slow-motion gunfire
      G.model.socket.getWorldPosition(tmp);
      const sock = ctx.project(tmp.x, tmp.y, tmp.z);
      spark.burst(sock.x, sock.y, Math.atan2(s.clientY - sock.y, s.clientX - sock.x), MS.leaveBurst);
      leaveFrom.x = sock.x; leaveFrom.y = sock.y;
    }
    if (!leaving) leaveFrom.x = -1e9;
    if (wasFlight > 0 && flight === 0 && !leaving) emit('spark:in', {});
    G.setCap(easeInOut(cap));

    // ── pose machine ──
    // Paul, WP-18 item 5: once the spark is fully out the frozen hand settles into the gentle idle
    // (the hover pose with its breathing bob and finger curl) and ignores the mouse
    const wasResting = resting;
    resting = mode === 'spark' && leaving && flight >= 1 && held < 0 && !touch;
    if (resting && !wasResting) nextStretch = t + fork.range(MG.sparkStretchFirstMinMs, MG.sparkStretchFirstMaxMs);
    let want = 'hover';
    if (held >= 0) want = 'pinch';
    else if (resting) want = 'hover';
    else if (mode === 'spark' || flight > 0) want = leaving ? 'release' : 'receive';
    else if (!touch && pointerIn && knobInfo.over) want = 'pinchReady';
    else if (!touch && pointerIn && knobInfo.d < MG.knobPoseDistance) want = 'point';
    if (want !== poseName) poseName = want;
    const rate = dt / (want === 'pinch' || poseName === 'pinchReady' ? MG.pinchMs : MG.poseBlendMs);
    for (const n of Object.keys(PQ)) {
      if (n === 'stretch') continue;
      weights[n] = Math.max(0, Math.min(1, (weights[n] ?? 0) + (n === want ? rate : -rate)));
    }
    // stretch: Paul, WP-18 item 5: only while the spark is out and the hand rests (the mouse plays
    // no part); was: from hover after 3 s without mouse movement, every 25–40 s
    const idleFor = t - lastMove;
    if (resting && t >= nextStretch && t - stretchT0 > MG.stretchMs) {
      stretchT0 = t;
      nextStretch = t + fork.range(MG.sparkStretchIntervalMinMs, MG.sparkStretchIntervalMaxMs);
      emit('gauntlet:stretch', { idleMs: Math.round(idleFor) });
    }
    applyPose(t, dt);

    // ── hand orientation ──
    const v = ctx.input.state;
    const vel = tmp.subVectors(tip, prevTip).multiplyScalar(1000 / Math.max(1, dt));
    prevTip.copy(tip);
    // Paul, WP-17 item 19: the left hand aims away from its own (bottom-left) shoulder
    const AIM = RIG.hand === 'left' ? RIG.left : RIG;
    const yaw0 = Math.atan2(tip.y - AIM.aimFrom.y, tip.x - AIM.aimFrom.x) + AIM.yawBiasDeg * D;
    const fwd = vel.x * Math.cos(yaw0) + vel.y * Math.sin(yaw0);
    const lat = -vel.x * Math.sin(yaw0) + vel.y * Math.cos(yaw0);
    lean.roll.target = -clamp(lat * MG.leanRollDegPerSpeed, MG.leanRollMaxDeg);
    lean.pitch.target = clamp(fwd * MG.leanPitchDegPerSpeed, MG.leanPitchMaxDeg);
    lean.wall.target = wallish ? MG.wallWristDeg : 0;
    // drag: wrist tilts in the drag direction (up to 10°)
    const dragV = held >= 0 ? (ctx.board.heldVelocity?.() ?? 0) : 0;
    lean.yaw.target = clamp(-dragV * MG.dragWristDegPerSpeed, MG.dragWristTiltDeg);
    // WP-16: frozen while the spark is out (no watching turn); while catching it, turn to face it
    if (returning && flight > 0 && pointerIn) {
      onPlane(s.clientX, s.clientY, 0, Q);
      const to = Math.atan2(Q.y - tip.y, Q.x - tip.x);
      lean.watch.target = clamp(wrapDeg((to - yaw0) / D), MG.catchFaceDeg);
    } else if (!frozen) lean.watch.target = 0;
    for (const sp of Object.values(lean)) sp.step(dt);
    const pose = blendedWrist();
    handQ.setFromAxisAngle(Z, yaw0 + (lean.yaw.value + lean.watch.value + pose.yaw) * D)
      .multiply(qa.setFromAxisAngle(Y, (RIG.pitchDeg + lean.pitch.value + lean.wall.value + pose.pitch) * D))
      .multiply(qb.setFromAxisAngle(X, (lean.roll.value - pose.roll) * D));

    // ── place the arm: pointerTip on the tip; while held, pinchPoint on the knob ──
    if (holdBlend > 0 && held >= 0) {
      const k = ctx.board.knobWorld(held);
      const tipL = G.handLocal(helpers.pointerTip), pinL = G.handLocal(helpers.pinchPoint);
      // where pinchPoint is when the hand simply follows, glided onto the knob centre; the arm is
      // solved for pinchPoint itself, so at the end of the glide it sits exactly on the knob
      Q.subVectors(pinL, tipL).applyQuaternion(handQ).add(tip);
      const e = easeInOut(holdBlend);
      Q.lerp(P.set(k.x, k.y, k.z), e);
      G.place(Q, handQ, { helper: helpers.pinchPoint });
      if (e >= 1) {
        // keep the follow springs where the fingertip now is, so letting go never jumps
        helpers.pointerTip.getWorldPosition(tip);
        sx.value = tip.x; sy.value = tip.y; sz.value = tip.z; sx.velocity = sy.velocity = sz.velocity = 0;
      }
    } else G.place(tip, handQ);
    // Paul, WP-17 item 16: the burned labels glow like embers near the fingertip
    {
      const burns = ctx.board.objects?.burns;
      if (burns) { helpers.pointerTip.getWorldPosition(P); burns.setEmber(P.x, P.y, mode === 'gauntlet' && !touch && pointerIn, dt, t); }
    }

    // breeze: the hand's own motion
    const hs = vel.length();
    if (hs > 15) breeze.write(tip.x, tip.y, hs * MBz.pointerGain, MBz.pointerRadius);

    // ── the spark ──
    const sparkVisible = !touch && (mode === 'spark' || flight > 0);
    const pxv = { x: s.clientX, y: s.clientY };
    if (flight > 0 && flight < 1) {
      G.model.socket.getWorldPosition(tmp);
      const sock = ctx.project(tmp.x, tmp.y, tmp.z);
      const cm = pxPerCm(tip);
      if (leaving) {
        // Paul, WP-16 item 17: out on a twirl. It spirals out of the socket through 1–3 full turns
        // (the loops' centre barely moves for the first third), then darts to the pointer while
        // the loops close up. twirlPath() gives the shape.
        // from where the socket was when it left (the hand's release pose moves it a little)
        const o0 = leaveFrom.x > -1e8 ? leaveFrom : sock;
        const q = twirlPath(flight, turns, Math.atan2(pxv.y - o0.y, pxv.x - o0.x));
        sparkScreen.set(o0.x + (pxv.x - o0.x) * q.g + q.ox * MS.twirlRadiusCm * cm, o0.y + (pxv.y - o0.y) * q.g + q.oy * MS.twirlRadiusCm * cm);
      } else {
        const e = flight * flight * (3 - 2 * flight);
        sparkScreen.set(sock.x + (pxv.x - sock.x) * e, sock.y + (pxv.y - sock.y) * e);
      }
      void flightFrom;
    } else sparkScreen.set(pxv.x, pxv.y);
    // hover / caret from the true pointer
    let hover = false, caret = false;
    if (sparkVisible && pointerIn) {
      hitWanted = true;
      // WP-18P: the hit test ran here, after this frame's style writes, and forced a restyle,
      // layout and a hit test through the 3D page every frame; it now runs in the read phase
      if (hit.x !== s.clientX || hit.y !== s.clientY) hit.stale = true;
      caret = hit.caret; hover = hit.hover;
    } else hitWanted = false;
    if (hover && !lastHover) emit('spark:hover', { on: true });
    lastHover = hover;
    spark.state.hover = hover; spark.state.caret = caret;
    const visibleAlpha = sparkVisible ? (flight > 0 ? 1 : 0) * windowAlpha : 0;
    spark.state.alpha = visibleAlpha;
    const speedPx = Math.hypot(s.vx, s.vy) * pxPerCm(P.set(s.x, s.y, 0));
    void speedPx;
    const cmToPx = pxPerCm(Q.set(s.x, s.y, 0));
    spark.update(dt, { x: sparkScreen.x, y: sparkScreen.y, speedCm: s.speed, vx: s.vx * cmToPx, vy: -s.vy * cmToPx, visible: visibleAlpha > 0.05 });
    // ── WP-16 item 14: the aiming dot, at the point under the pointer, once the spark is home ──
    const wantReticle = !touch && pointerIn && mode === 'gauntlet' && flight <= 0 && held < 0;
    if (wantReticle && !reticleOn) { reticleT0 = t; emit('reticle:spawn', {}); }
    reticleOn = wantReticle;
    reticleAlpha = Math.max(0, Math.min(1, reticleAlpha + (wantReticle ? 1 : -1) * dt / (wantReticle ? MS.reticleInMs : MS.reticleOutMs)));
    if (!wantReticle && held >= 0) reticleAlpha = Math.max(0, reticleAlpha - dt / 60);
    reticleAt.set(s.clientX, s.clientY);
    // light: the point light (board, coins, gauntlet) and #glow (paper and text)
    if (visibleAlpha > 0.01) {
      const paperPt = onPlane(sparkScreen.x, sparkScreen.y, 0, Q);
      const boost = hover ? 1 + MS.hoverLightBoost : 1;
      ctx.lights.spark.position.set(paperPt.x, paperPt.y, GR.sparkLightHeight);
      ctx.lights.spark.intensity = GR.sparkLightIntensity * spark.state.flicker * boost * visibleAlpha;
      ctx.paper.glow?.setSpark({ x: paperPt.x, y: paperPt.y, hover });
      if (s.speed > 15) breeze.write(paperPt.x, paperPt.y, s.speed * MBz.pointerGain, MBz.pointerRadius);
      // coin runes wake near the spark
      for (const c of LC) {
        const d = Math.max(0, Math.hypot(paperPt.x - c.x, paperPt.y - c.y) - c.r);
        ctx.board.setRuneGlow?.(c.id, d < MG.runeWakeCm ? 1 - d / MG.runeWakeCm : 0);
      }
    } else {
      ctx.lights.spark.intensity = 0;
      ctx.paper.glow?.setSpark(null);
      for (const c of LC) ctx.board.setRuneGlow?.(c.id, 0);
    }
    paintTop();
  });

  /** Blend the pose weights per bone by slerp; stretch ripples index → little; idle micro-curl. @param {number} t @param {number} dt */
  function applyPose(t, dt) {
    const names = Object.keys(weights).filter(n => weights[n] > 0);
    let total = 0;
    /** @type {Record<string, THREE.Quaternion>} */
    const acc = {};
    for (const n of names) {
      const w = weights[n];
      total += w;
      const k = w / total;
      for (const b of boneNames) (acc[b] ??= PQ[n][b].clone()).slerp(PQ[n][b], acc[b] === PQ[n][b] ? 1 : k);
    }
    if (!total) return;
    // stretch overlay, staggered per finger
    const fingers = ['index', 'middle', 'ring', 'little'];
    for (const b of boneNames) {
      const f = fingers.findIndex(n => b.startsWith(n));
      const delay = f >= 0 ? f * MG.stretchFingerStaggerMs : 0;
      const e = stretchEnvelope(t - stretchT0 - delay);
      if (e > 0) acc[b].slerp(PQ.stretch[b], e);
    }
    const bones = G.rig.bones;
    for (const b of boneNames) bones[b].quaternion.copy(acc[b]);
    // idle micro-curl and secondary finger motion (trailing when moving fast)
    // Paul, WP-18 item 5: while the spark is out the fingers don't trail the mouse
    const v = resting ? 0 : ctx.input.state.speed;
    fingers.forEach((n, i) => {
      fingerLag[i].target = Math.min(MG.fingerTrailMaxDeg, v * MG.fingerTrailDegPerSpeed);
      fingerLag[i].step(dt);
      const micro = MG.idleCurlDeg * Math.sin(2 * Math.PI * MG.idleCurlHz * t / 1000 + i * 1.3);
      const add = (micro + fingerLag[i].value) * D;
      for (const j of [1, 2, 3]) bones[`${n}${j}`].quaternion.multiply(qa.setFromAxisAngle(Y, Math.max(-0.02, add) * (j === 1 ? 0.6 : 1)));
    });
  }
  /** 0 → 1 → 0 over stretchMs. @param {number} dt */
  function stretchEnvelope(dt) {
    if (dt <= 0 || dt >= MG.stretchMs) return 0;
    const k = dt / MG.stretchMs;
    return k < 0.3 ? easeInOut(k / 0.3) : k > 0.7 ? easeInOut((1 - k) / 0.3) : 1;
  }
  /** Wrist values of the blended pose (pitch, yaw, roll; stretch included). */
  function blendedWrist() {
    let pitch = 0, yaw = 0, roll = 0, total = 0;
    for (const [n, w] of Object.entries(weights)) {
      if (!w) continue;
      total += w;
      pitch += POSES[n].wrist.pitch * w; yaw += POSES[n].wrist.yaw * w; roll += POSES[n].wrist.roll * w;
    }
    if (total) { pitch /= total; yaw /= total; roll /= total; }
    const e = stretchEnvelope(now() - stretchT0);
    pitch += (POSES.stretch.wrist.pitch - pitch) * e; roll += (POSES.stretch.wrist.roll - roll) * e;
    return { pitch, yaw, roll };
  }
  /** Nearest knob to the hand target (on the board's top), and whether the target is over it. @param {THREE.Vector3} at */
  function nearestKnob(at) {
    const s = ctx.input.state;
    if (!s.inside) return { d: Infinity, over: false, i: -1 };
    // on the plane through the knob centres (the plane the board reads drags on)
    onPlane(s.clientX, s.clientY, ctx.board.knobWorld(0).z, tmp);
    let best = Infinity, bi = -1, over = false;
    const n = ctx.board.rows?.length ?? 0;
    // Paul, WP-17 item 18: the fingers curl over the whole bar (body and knob), not just the knob
    let overBar = false;
    for (let i = 0; i < n; i++) {
      const k = ctx.board.knobWorld(i);
      const dx = Math.max(0, Math.abs(tmp.x - k.x) - B.knob.length / 2), dy = Math.max(0, Math.abs(tmp.y - k.y) - B.knob.drawnHeight / 2);
      const d = Math.hypot(dx, dy);
      if (d < best) { best = d; bi = i; }
      const bx0 = k.x - B.knob.length / 2 - B.bar.length, bx1 = k.x + B.knob.length / 2;
      if (tmp.x >= bx0 && tmp.x <= bx1 && Math.abs(tmp.y - k.y) <= B.groove.height / 2) { overBar = true; if (d > 0.1) { best = Math.min(best, 0.1); bi = i; } }
    }
    // WP-17 item 17: the row-height thumb curls the fingers too
    const rh = ctx.board.rowHeight?.knobWorld?.();
    if (rh && Math.abs(tmp.x - rh.x) <= B.rowSlider.w / 2 + 0.2 && Math.abs(tmp.y - rh.y) <= B.rowSlider.knobH / 2 + 0.2) { overBar = true; best = Math.min(best, 0.1); }
    over = best <= 0.1 || overBar;
    void at;
    return { d: best, over, i: bi };
  }
  /** Screen px per cm near a world point. @param {THREE.Vector3} p */
  function pxPerCm(p) {
    const a = ctx.project(p.x, p.y, p.z), b = ctx.project(p.x + 1, p.y, p.z);
    return Math.max(1e-3, Math.hypot(b.x - a.x, b.y - a.y));
  }

  // ── Debug and test API ──────────────────────────────────────────────────────────────────
  const api = {
    get mode() { return mode; },
    state: () => {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      helpers.pointerTip.getWorldPosition(a); helpers.pinchPoint.getWorldPosition(b);
      return {
        mode, pose: poseName, weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, +v.toFixed(3)])),
        cap: +cap.toFixed(3), flight: +flight.toFixed(3), leaving, held, holdBlend: +holdBlend.toFixed(3),
        tip: a.toArray().map(x => +x.toFixed(3)), pinch: b.toArray().map(x => +x.toFixed(3)),
        target: [sx.target, sy.target, sz.target].map(x => +x.toFixed(3)),
        lag: +tip.distanceTo(new THREE.Vector3(sx.target, sy.target, sz.target)).toFixed(3), maxLag: +maxLag.toFixed(3), catching,
        knob: { d: +knobInfo.d.toFixed(2), over: knobInfo.over, i: knobInfo.i },
        spark: spark.read(), touch, showPointer, nextStretchIn: Math.round(nextStretch - now()), resting, stretching: now() - stretchT0 < MG.stretchMs,
        frozen: frozen ? frozen.toArray().map(x => +x.toFixed(3)) : null, returning, turns, metAgoMs: Math.round(now() - metAt), watchDeg: +lean.watch.value.toFixed(2),
        reticle: { alpha: +reticleAlpha.toFixed(3), x: Math.round(reticleAt.x), y: Math.round(reticleAt.y), on: reticleOn },
      };
    },
    resetMaxLag() { maxLag = 0; },
    switches,
    /** Screen px of the drawn fingertip. */
    tipScreen() { const a = new THREE.Vector3(); helpers.pointerTip.getWorldPosition(a); return ctx.project(a.x, a.y, a.z); },
    spark,
    dispose: off,
  };
  /** @type {any} */ (vc).cursor = api;
  setCursorMode(mode);
  void motion; void Q;
  return api;
}

/**
 * Paul, WP-16 item 17: the twirl. At flight f (0…1) the spark is at socket + (pointer − socket) × g
 * + (ox, oy) × the loop radius. The angle runs `turns` full turns over the first 62 % while the
 * loops' centre stays put (g = 0 until half way), then it darts to the pointer as the loops close.
 * @param {number} f @param {number} turns @param {number} dir  direction socket → pointer (radians)
 */
export function twirlPath(f, turns, dir) {
  const sm = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const g = sm(0.5, 1, f);
  const k = Math.min(1, f / 0.62), ang = 2 * Math.PI * turns * sm(0, 1, k);
  const r = Math.sin(Math.PI * Math.min(1, f / 0.96)) ** 0.5;
  // the loops lie ahead of the socket, toward the pointer, and start at the socket itself
  return { g, ang, r, ox: r * (Math.cos(dir) + Math.cos(dir + Math.PI + ang)), oy: r * (Math.sin(dir) + Math.sin(dir + Math.PI + ang)) };
}

const clamp = (/** @type {number} */ v, /** @type {number} */ m) => Math.max(-m, Math.min(m, v));
const wrapDeg = (/** @type {number} */ a) => ((a + 540) % 360) - 180;
const easeInOut = (/** @type {number} */ x) => x * x * (3 - 2 * x);
