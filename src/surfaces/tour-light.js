// @ts-check
/**
 * WP-11 · tour lighting on the desk (spec "Tour lighting"; WP-03 `setTourRenderer`).
 *
 * Tour start: the lamp dims, the key light ×0.35 in the scene and in the veil over 300 ms
 * (`tour:start` plays tour.dim). A warm light pool sits on each target: a spotlight in the scene,
 * the matching spotlight in the veil (so printed text is lit exactly like the paper under it) and
 * a soft warm term in #glow. It glides between steps on a 90 / 16 spring (`tour:step` plays
 * tour.move). The tour's slips live in #float (WP-03's layer is appended there). Tour end: the
 * light returns over 400 ms.
 *
 * Both spotlights exist from the start at intensity 0, so the shaders never recompile mid-tour.
 */
import { surfaces as MS } from '../config/motion.js';
import { stage as SCfg } from '../config/render.js';
import { SpringVec } from '../util/spring.js';
import { setTourRenderer } from '../tutorial/tour.js';

/**
 * @param {object} o
 * @param {any} o.THREE
 * @param {any} o.scene
 * @param {any} o.camera
 * @param {any} o.lights   layer 1 lights ({key})
 * @param {any} o.veil
 * @param {any} [o.glow]   paper glow (hooks.addRipple)
 * @param {(x: number, y: number, z?: number) => {x: number, y: number}} o.project
 * @param {(phase: string, fn: (dt: number, t: number) => void) => () => void} o.onPhase
 */
export function attachTourLight(o) {
  const T = o.THREE;
  const mk = (/** @type {any} */ intensityPerUnit) => {
    const s = new T.SpotLight(0xffd29a, 0, 0, Math.atan(MS.tourPoolCm / MS.tourSpotHeight) * 1.6, 0.75, 2);
    s.castShadow = false;
    // WP-14: in every pass (bloom, reflections), so each pass counts the same lights and reuses
    // the main pass's shader programs instead of compiling its own variant mid-use
    s.layers.enableAll();
    s.userData.perUnit = intensityPerUnit;
    return s;
  };
  // intensity so the pool's centre gets about the key light's own strength (inverse-square at the spot height)
  const d2 = MS.tourSpotHeight * MS.tourSpotHeight;
  const spot = mk(SCfg.keyIntensity);
  const vspot = mk(SCfg.veilKeyIntensity);
  o.scene.add(spot, spot.target);
  o.veil.scene.add(vspot, vspot.target);

  const keyBase = { scene: o.lights.key.intensity, veil: o.veil.key.intensity };
  /** @type {'off'|'dimming'|'on'|'restoring'} */
  let phase = 'off';
  let t = 0, k = 1, kFrom = 1;
  const pos = new SpringVec({ ...MS.tourMoveSpring, value: [0, 0] });
  /** @type {null | {x: number, y: number}} */
  let lastBox = null;
  let has = false;
  /** The pool's own fade (0–1): a step with no target (e.g. step 3 on a view without stamps) fades it out. */
  let vis = 0, visTo = 0;
  const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 0, 1), 0), hit = new T.Vector3(), ndc = new T.Vector2();

  /** Client px → paper point (cm) on the z = 0 plane. @param {number} x @param {number} y */
  function toPaper(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    o.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, o.camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  const pool = ctx => {
    if (!has || k >= 0.999 || vis <= 0) return;
    const [x, y] = pos.value;
    const c = o.project(x, y, 0), e = o.project(x + MS.tourPoolCm, y, 0), f = o.project(x, y + MS.tourPoolCm, 0);
    const rx = Math.max(4, Math.hypot(e.x - c.x, e.y - c.y)), ry = Math.max(4, Math.hypot(f.x - c.x, f.y - c.y));
    const a = MS.tourGlowStrength * (1 - k) / (1 - MS.tourDimTo) * vis;
    ctx.save();
    ctx.translate(c.x, c.y); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(255, 196, 128, ${a.toFixed(3)})`);
    g.addColorStop(0.6, `rgba(255, 170, 96, ${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 160, 80, 0)');
    ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };
  /** @type {null | (() => void)} */
  let poolOff = null;

  setTourRenderer({
    start() {
      keyBase.scene = o.lights.key.intensity; keyBase.veil = o.veil.key.intensity;
      phase = 'dimming'; t = 0; kFrom = k; has = false; vis = 0; visTo = 0;
      // the desk's board target: the original #categories is a 0-px wrapper there (its bars sit
      // over the 3D bars), so the tour's step 2 found nothing; the printed board is the target
      document.querySelector('#print .vc-board-print')?.setAttribute('data-tour', 'board');
      if (o.glow && !poolOff) poolOff = o.glow.hooks.addRipple(pool);
    },
    step(_n, _target, /** @type {any} */ box) {
      const p = box && toPaper((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      if (!p) { lastBox = null; visTo = 0; return; }
      lastBox = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
      if (!has) { pos.springs.forEach((s, i) => s.snap(i ? p.y : p.x)); has = true; }
      pos.setTarget([p.x, p.y]);
      visTo = 1;
    },
    end() { phase = 'restoring'; t = 0; kFrom = k; },
  });

  o.onPhase('physics', dt => {
    if (phase === 'off') return;
    t += dt;
    if (phase === 'dimming' || phase === 'on') {
      const u = Math.min(1, t / MS.tourDimMs), e = u * u * (3 - 2 * u);
      k = kFrom + (MS.tourDimTo - kFrom) * e;
      if (u >= 1) phase = 'on';
    } else {
      const u = Math.min(1, t / MS.tourRestoreMs), e = u * u * (3 - 2 * u);
      k = kFrom + (1 - kFrom) * e;
      if (u >= 1) { phase = 'off'; k = 1; has = false; vis = 0; visTo = 0; poolOff?.(); poolOff = null; }
    }
    o.lights.key.intensity = keyBase.scene * k;
    o.veil.key.intensity = keyBase.veil * k;
    pos.step(dt);
    vis = visTo > vis ? Math.min(visTo, vis + dt / MS.tourDimMs) : Math.max(visTo, vis - dt / MS.tourDimMs);
    if (vis <= 0 && visTo === 0) has = false; // faded out: the next target snaps instead of gliding from here
    const [x, y] = pos.value;
    const lit = has ? (1 - k) / (1 - MS.tourDimTo) * vis : 0;
    for (const [s, per] of [[spot, spot.userData.perUnit], [vspot, vspot.userData.perUnit]]) {
      s.position.set(x, y - 6, MS.tourSpotHeight);
      s.target.position.set(x, y, 0);
      s.target.updateMatrixWorld();
      s.updateMatrixWorld();
      s.intensity = per * d2 * 0.9 * lit;
    }
    o.glow?.invalidate?.();
  });

  return {
    read: () => ({
      // where the pool lands on screen vs the middle of the step's target (px)
      poolScreen: has ? (({ x, y }) => [+x.toFixed(1), +y.toFixed(1)])(o.project(pos.value[0], pos.value[1], 0)) : null,
      targetScreen: lastBox ? [+lastBox.x.toFixed(1), +lastBox.y.toFixed(1)] : null,
      phase, vis: +vis.toFixed(2), k: +k.toFixed(3), key: +o.lights.key.intensity.toFixed(4), veilKey: +o.veil.key.intensity.toFixed(4), keyBase: { ...keyBase }, pool: has ? pos.value.map(v => +v.toFixed(2)) : null, target: has ? pos.springs.map(s => +s.target.toFixed(2)) : null, spot: +spot.intensity.toFixed(1), veilSpot: +vspot.intensity.toFixed(3) }),
    toPaper,
  };
}
