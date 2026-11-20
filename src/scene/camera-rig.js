// @ts-check
/**
 * Camera rig (WP-04 step 3, file 04 "Camera").
 *
 * - Perspective camera, fov 28°, pitched 62° down (elevation above the paper plane), looking at
 *   the sheet. The distance and the aim point are solved so the main sheet fills
 *   `stage.sheetFill` of the limiting screen dimension and sits centred, like the reference.
 * - Drift: the camera slides toward the pointer, up to 1.6 × 1.0 cm, and zooms to 1.025 while
 *   the pointer is in the middle third of the window. Spring 30 / 10.
 * - Shake: `shake(amount, ms)` adds a decaying random offset on top (file 04 stamps row).
 * - `override({x, y, zoom})` pins the drift (tests; acceptance item 2). `release()` hands it back.
 *
 * The scene is z-up: paper in the xy plane, so camera.up is +z.
 */
import * as THREE from 'three';
import { Spring } from '../util/spring.js';
import { camera as cameraCfg, stage as stageCfg } from '../config/render.js';
import motion from '../config/motion.js';
import { view as sheet, mainFrame as MF, headerFrame as HF, woodFrame as WF, inset as LI } from '../config/layout.js'; // Paul, WP-17 item 3: the desk view, not the (narrower) sheet

const DEG = Math.PI / 180;
const corners = [
  new THREE.Vector3(sheet.x0, sheet.y0, 0), new THREE.Vector3(sheet.x1, sheet.y0, 0),
  new THREE.Vector3(sheet.x0, sheet.y1, 0), new THREE.Vector3(sheet.x1, sheet.y1, 0),
];
const tmp = new THREE.Vector3();

/**
 * Place `cam` at distance `d` from the aim point (0, ty, 0), elevation `pitch`.
 * @param {THREE.PerspectiveCamera} cam @param {number} d @param {number} ty @param {number} ox @param {number} oy
 */
function place(cam, d, ty, ox = 0, oy = 0) {
  const p = cameraCfg.pitchDeg * DEG;
  cam.up.set(0, 0, 1);
  cam.position.set(ox, ty + oy - d * Math.cos(p), d * Math.sin(p));
  cam.lookAt(ox, ty + oy, 0);
  cam.updateMatrixWorld(true);
}

/** NDC extent of the sheet's corners for the current camera. @param {THREE.PerspectiveCamera} cam */
function extent(cam) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    tmp.copy(c).project(cam);
    if (tmp.x < minX) minX = tmp.x; if (tmp.x > maxX) maxX = tmp.x;
    if (tmp.y < minY) minY = tmp.y; if (tmp.y > maxY) maxY = tmp.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Solve the framing for an aspect ratio: distance `d` and aim `ty` so the sheet is centred and
 * its widest NDC extent equals `fill`. Pure apart from the scratch camera. Exported for tests.
 * @param {number} aspect width / height
 * @param {number} [fill]
 * @returns {{distance: number, aimY: number}}
 */
export function solveFraming(aspect, fill = stageCfg.sheetFill) {
  const cam = new THREE.PerspectiveCamera(cameraCfg.fovDeg, aspect, stageCfg.near, stageCfg.far);
  cam.updateProjectionMatrix();
  let d = 150, ty = 0;
  for (let pass = 0; pass < 4; pass++) {
    // centre vertically: f(ty) = maxY + minY decreases as the aim moves up the page
    let lo = -30, hi = 30;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      place(cam, d, mid);
      const e = extent(cam);
      if (e.maxY + e.minY > 0) lo = mid; else hi = mid;
    }
    ty = (lo + hi) / 2;
    // fit: g(d) = widest extent − fill decreases with distance
    let dl = 20, dh = 3000;
    for (let i = 0; i < 50; i++) {
      const mid = (dl + dh) / 2;
      place(cam, mid, ty);
      const e = extent(cam);
      const widest = Math.max(e.maxX, -e.minX, e.maxY, -e.minY);
      if (widest > fill) dl = mid; else dh = mid;
    }
    d = (dl + dh) / 2;
  }
  return { distance: d, aimY: ty };
}

/** Paul, WP-17 item 2: a paper point (cm) inside the main section. @param {number} x @param {number} y */
export const inMain = (x, y) => x > LI.x0 && x < LI.x1 && y > LI.y0 - 2.5 && y < LI.y1;

/** True when a normalised pointer position (−1…1) is in the middle third of the window. */
export const inMiddleThird = (/** @type {number} */ nx, /** @type {number} */ ny) =>
  Math.abs(nx) < motion.camera.driftZoomZone && Math.abs(ny) < motion.camera.driftZoomZone;

/**
 * @param {{ rng: { range(a: number, b: number): number } }} deps
 */
export function createCameraRig({ rng }) {
  const cam = new THREE.PerspectiveCamera(cameraCfg.fovDeg, 16 / 9, stageCfg.near, stageCfg.far);
  const c = motion.camera;
  const sx = new Spring({ ...c.driftSpring });
  const sy = new Spring({ ...c.driftSpring });
  const sz = new Spring({ ...c.driftSpring, value: 1 });
  // WP-16A: user zoom (wheel, pinch) with its pan, and the spark-out framing (0 = off, 1 = on)
  const uz = new Spring({ ...c.zoomSpring, value: 1 });
  const ux = new Spring({ ...c.zoomSpring });
  const uy = new Spring({ ...c.zoomSpring });
  // Paul, WP-17 item 2: `sf` is now the main-section framing (1 = frame the main section, 0 = the
  // whole desk), chosen by where the pointer is, not by the spark; `clickOn` is the click-to-zoom
  const sf = new Spring({ ...c.sparkSpring, value: 1, target: 1 });
  let zoneOut = false, clickOn = false;
  /** The main-section framing (zoom and aim offset, cm), solved on resize. */
  let mainZoom = 1, mainX = 0, mainY = 0;
  /**
   * Paul, WP-18 item 6: three framings, solved on resize. `main` is the WP-17 fit × 1.2, centred
   * on the table's axis with the sheet's burned top edge at the top of the window; `header` (pointer
   * above the collection title) zooms out from it by the same factor as before (the old fit); `wood`
   * (pointer over the woodblock or at the window's left edge) is 1.5 × the whole-desk view, aimed
   * at the woodblock and following the pointer's height. `fx/fy/fz` ease between them.
   * @type {'main'|'header'|'wood'}
   */
  let zone = 'main';
  /** @type {Record<'main'|'header'|'wood', {x: number, y: number, zoom: number}> & {woodLow: number, woodHigh: number, fit: number}} */
  const frames = { main: { x: 0, y: 0, zoom: 1 }, header: { x: 0, y: 0, zoom: 1 }, wood: { x: 0, y: 0, zoom: 1 }, woodLow: 0, woodHigh: 0, fit: 1 };
  const fx = new Spring({ ...c.sparkSpring }), fy = new Spring({ ...c.sparkSpring }), fz = new Spring({ ...c.sparkSpring, value: 1 });
  /** Half the visible paper (cm) at zoom 1, at the aim point: set on resize. */
  let halfW = 48, halfH = 27;
  let framing = solveFraming(16 / 9);
  /** @type {{x: number, y: number, zoom: number} | null} */
  let pinned = null;
  // shake state
  let shakeAmount = 0, shakeMs = 0, shakeLeft = 0, shakeX = 0, shakeY = 0;
  let version = 0;
  const lastMatrix = new THREE.Matrix4();
  let lastZoom = NaN;

  /** Total zoom from the targets (user × framing), for the pan limits. */
  const zoomTarget = () => uz.target * fz.target;
  /** Keep the user pan inside what shows the paper (none at or under zoom 1). */
  function clampPan() {
    const z = zoomTarget();
    const ax = fx.target, ay = fy.target;
    const lx = Math.max(0, sheet.x1 + 2 - halfW / z), ly = Math.max(0, sheet.y1 + 2 - halfH / z);
    ux.target = THREE.MathUtils.clamp(ux.target + ax, -lx, lx) - ax;
    uy.target = THREE.MathUtils.clamp(uy.target + ay, -ly, ly) - ay;
    if (z <= 1) { ux.target = 0; uy.target = 0; }
  }
  function apply() {
    const ox = (pinned ? pinned.x : sx.value + ux.value + fx.value) + shakeX;
    const oy = (pinned ? pinned.y : sy.value + uy.value + fy.value) + shakeY;
    const zoom = pinned ? pinned.zoom : sz.value * uz.value * fz.value;
    if (cam.zoom !== zoom) { cam.zoom = zoom; cam.updateProjectionMatrix(); }
    place(cam, framing.distance, framing.aimY, ox, oy);
    if (!cam.matrixWorld.equals(lastMatrix) || zoom !== lastZoom) {
      lastMatrix.copy(cam.matrixWorld); lastZoom = zoom; version++;
    }
  }

  let sized = false;
  /**
   * Paul, WP-18 item 6: the aim offset (cm) that puts paper point (px, py) at NDC (`ndcX`, `ndcY`)
   * (`ndcX` 0: the window's middle column), at zoom `zoom`.
   * @param {number} zoom @param {number} px @param {number} py @param {number} ndcY @param {number} [ndcX]
   */
  function aimAt(zoom, px, py, ndcY, ndcX = 0) {
    const z0 = cam.zoom;
    cam.zoom = zoom; cam.updateProjectionMatrix();
    let ox = px, oy = py - framing.aimY;
    for (let i = 0; i < 24; i++) {
      place(cam, framing.distance, framing.aimY, ox, oy);
      tmp.set(px, py, 0).project(cam);
      ox += (tmp.x - ndcX) * halfW / zoom;
      oy += (tmp.y - ndcY) * halfH / zoom;
    }
    cam.zoom = z0; cam.updateProjectionMatrix();
    return { x: ox, y: oy };
  }

  /** @type {any} */
  const rig = {
    camera: cam,
    /** @param {number} width @param {number} height */
    resize(width, height) {
      cam.aspect = width / Math.max(1, height);
      cam.updateProjectionMatrix();
      framing = solveFraming(cam.aspect);
      // half the visible paper at zoom 1 (from the sheet's NDC extent: it is centred)
      const z0 = cam.zoom; cam.zoom = 1; cam.updateProjectionMatrix();
      place(cam, framing.distance, framing.aimY);
      const e = extent(cam);
      halfW = sheet.x1 / Math.max(1e-3, e.maxX); halfH = sheet.y1 / Math.max(1e-3, e.maxY);
      // Paul, WP-17 item 2: centre the main-section rectangle, then zoom until it fills the window
      const rc = [[MF.x0, MF.y0], [MF.x1, MF.y0], [MF.x0, MF.y1], [MF.x1, MF.y1]];
      let ox = (MF.x0 + MF.x1) / 2, oy = 0, r = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
      for (let i = 0; i < 8; i++) {
        place(cam, framing.distance, framing.aimY, ox, oy);
        r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        for (const [x, y] of rc) { tmp.set(x, y, 0).project(cam); r.minX = Math.min(r.minX, tmp.x); r.maxX = Math.max(r.maxX, tmp.x); r.minY = Math.min(r.minY, tmp.y); r.maxY = Math.max(r.maxY, tmp.y); }
        ox += (r.maxX + r.minX) / 2 * halfW; oy += (r.maxY + r.minY) / 2 * halfH;
      }
      mainX = ox; mainY = oy;
      mainZoom = Math.max(1, Math.min(2 / (r.maxX - r.minX), 2 / (r.maxY - r.minY)));
      // Paul, WP-18 item 6: the framings from that fit (see `zone`)
      const fit = mainZoom;
      frames.fit = fit;
      frames.main = { ...aimAt(fit * MF.zoomIn, MF.axisX, MF.topY, MF.topNdc), zoom: fit * MF.zoomIn };
      frames.header = { ...aimAt(MF.zoomIn, HF.x, HF.topY, HF.topNdc), zoom: MF.zoomIn };
      const lo = aimAt(WF.zoom, WF.edgeX, WF.yLow, 0, -1), hi = aimAt(WF.zoom, WF.edgeX, WF.yHigh, 0, -1);
      frames.wood = { x: lo.x, y: lo.y, zoom: WF.zoom }; frames.woodLow = lo.y; frames.woodHigh = hi.y;
      mainX = frames.main.x; mainY = frames.main.y; mainZoom = frames.main.zoom;
      const f = frames[zone];
      fx.target = f.x; fy.target = f.y; fz.target = f.zoom;
      if (!sized) { fx.snap(f.x); fy.snap(f.y); fz.snap(f.zoom); sized = true; }
      cam.zoom = z0; cam.updateProjectionMatrix();
      clampPan();
      apply();
    },
    /**
     * Advance the drift springs and the shake. `pointer` is normalised to the window (−1…1,
     * y up) or null when the pointer is outside the window (the camera drifts home).
     * @param {number} dtMs scaled ms
     * @param {{nx: number, ny: number} | null} pointer
     * @param {{ paper?: {x: number, y: number} | null }} [o]  Paul, WP-17 item 2: the pointer's point on the paper (cm)
     */
    update(dtMs, pointer, o = {}) {
      const nx = pointer ? THREE.MathUtils.clamp(pointer.nx, -1, 1) : 0;
      const ny = pointer ? THREE.MathUtils.clamp(pointer.ny, -1, 1) : 0;
      sx.target = nx * c.driftX;
      sy.target = ny * c.driftY;
      sz.target = pointer && inMiddleThird(nx, ny) ? c.driftZoomMax : 1;
      // Paul, WP-17 item 2 (replaces the WP-16A spark-out zoom): the main section fills the window;
      // the whole desk shows only while the pointer is over the woodblock or above the collection
      // title (the coins), with hysteresis; outside the window, the main section again
      const pp = o.paper;
      // Paul, WP-18 item 6: the woodblock (or the window's left edge, since the closer main framing
      // can leave the woodblock just off screen) frames the collections; the header zooms out
      if (!pointer || !pp) zone = 'main';
      else if (pp.x < MF.woodX || nx < MF.edgeNx) zone = 'wood';
      else if (pp.y > MF.headerY) zone = 'header';
      else if (pp.x > MF.returnX && pp.y < MF.returnY) zone = 'main';
      zoneOut = zone !== 'main';
      const fr = frames[zone];
      // over the woodblock the aim follows the pointer's height in the window (no feedback: screen y)
      const fyT = zone === 'wood' ? frames.woodLow + (frames.woodHigh - frames.woodLow) * (ny + 1) / 2 : fr.y;
      if (fx.target !== fr.x || fy.target !== fyT || fz.target !== fr.zoom) { fx.target = fr.x; fy.target = fyT; fz.target = fr.zoom; clampPan(); }
      // the click zoom ends once the pointer is back over the main section
      if (clickOn && (!pointer || (pp && inMain(pp.x, pp.y)))) { clickOn = false; uz.target = 1; ux.target = 0; uy.target = 0; }
      const on = zoneOut ? 0 : 1;
      if (sf.target !== on) { sf.target = on; clampPan(); }
      sx.step(dtMs); sy.step(dtMs); sz.step(dtMs);
      uz.step(dtMs); ux.step(dtMs); uy.step(dtMs); sf.step(dtMs); fx.step(dtMs); fy.step(dtMs); fz.step(dtMs);
      // WP-16A (render on demand): a spring this close to rest snaps onto its target, so the
      // camera stops exactly and its version stops counting (1e-5 cm and 1e-6 zoom are invisible)
      // Paul, WP-18 item 3: the thresholds were 1e-5 cm and 1e-6 zoom, which the springs reach
      // only ~2.5 s after the pointer stops; until then the camera crept by invisible amounts and
      // every creep re-drew both 3D layers and re-placed the whole printed page (the table's 400
      // rows included) each frame. 0.002 cm and 2e-5 zoom are under 0.1 screen px at 2×.
      for (const [sp, eps] of /** @type {[Spring, number][]} */ ([[sx, 2e-3], [sy, 2e-3], [sz, 2e-5], [uz, 2e-5], [ux, 2e-3], [uy, 2e-3], [sf, 2e-5], [fx, 2e-3], [fy, 2e-3], [fz, 2e-5]])) {
        if (sp.value !== sp.target && Math.abs(sp.value - sp.target) < eps && Math.abs(sp.velocity) < eps * 10) sp.snap(sp.target);
      }
      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dtMs);
        const env = shakeMs > 0 ? shakeLeft / shakeMs : 0;
        shakeX = rng.range(-1, 1) * shakeAmount * env;
        shakeY = rng.range(-1, 1) * shakeAmount * env;
      } else { shakeX = 0; shakeY = 0; }
      apply();
    },
    /** Camera shake on top of the drift (file 04: big stamp 0.04 cm, 140 ms). */
    shake(amount = motion.stamp.shakeAmount, ms = motion.stamp.shakeMs) {
      shakeAmount = Math.max(shakeLeft > 0 ? shakeAmount : 0, amount);
      shakeMs = ms; shakeLeft = ms;
    },
    /**
     * WP-16A: zoom by `factor` (wheel, pinch) about the pointer at (nx, ny) (−1…1, y up): the paper
     * point under it stays under it while the zoom eases in. Returns the new zoom target.
     * @param {number} factor @param {number} [nx] @param {number} [ny]
     */
    zoomBy(factor, nx = 0, ny = 0) {
      const z0 = zoomTarget();
      uz.target = THREE.MathUtils.clamp(uz.target * factor, c.zoomMin, c.zoomMax);
      const z1 = zoomTarget();
      if (z1 === z0) return uz.target;
      // the point under the pointer, from the aim the camera is heading for (targets, so notches compound)
      const ax = ux.target + fx.target, ay = uy.target + fy.target;
      const vx = nx * halfW, vy = ny * halfH;
      const px = ax + vx / z0, py = ay + vy / z0;
      ux.target = px - vx / z1 - fx.target;
      uy.target = py - vy / z1 - fy.target;
      clampPan();
      return uz.target;
    },
    /** WP-16A: back to zoom 1, no pan. */
    resetZoom() { uz.target = 1; ux.target = 0; uy.target = 0; clickOn = false; },
    /**
     * Paul, WP-17 item 2: a click outside the main section toggles a quick zoom (× `clickZoom`)
     * about the click; a second click, or the pointer coming back over the main section, ends it.
     * Returns whether the zoom is now on. @param {number} nx @param {number} ny
     */
    clickZoom(nx, ny) {
      if (clickOn) { rig.resetZoom(); return false; }
      uz.target = 1; ux.target = 0; uy.target = 0;
      rig.zoomBy(c.clickZoom, nx, ny);
      clickOn = true;
      return true;
    },
    /** Pin the drift to an exact offset (cm) and zoom. @param {{x?: number, y?: number, zoom?: number}} o */
    override(o) { pinned = { x: o.x ?? 0, y: o.y ?? 0, zoom: o.zoom ?? 1 }; apply(); },
    release() { pinned = null; apply(); },
    /** Current offset, zoom and framing (debug). */
    read() {
      return {
        x: pinned ? pinned.x : sx.value, y: pinned ? pinned.y : sy.value, zoom: cam.zoom,
        pinned: !!pinned, shaking: shakeLeft > 0, distance: framing.distance, aimY: framing.aimY,
        user: { zoom: +uz.value.toFixed(4), target: +uz.target.toFixed(4), panX: +ux.value.toFixed(3), panY: +uy.value.toFixed(3) },
        main: { framing: +sf.value.toFixed(3), on: sf.target === 1, zoom: +mainZoom.toFixed(4), x: +mainX.toFixed(2), y: +mainY.toFixed(2), zoneOut, click: clickOn, zone, fit: +frames.fit.toFixed(4) },
        frames: { main: { ...frames.main }, header: { ...frames.header }, wood: { ...frames.wood } },
        fovDeg: cam.fov, pitchDeg: cameraCfg.pitchDeg,
      };
    },
    /** Increments whenever the camera actually moved (the CSS3D layer re-renders only then). */
    get version() { return version; },
  };
  apply();
  return rig;
}
