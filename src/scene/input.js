// @ts-check
/**
 * Input (WP-04 steps 7 and 8).
 *
 * - The true pointer position, never smoothed: client px straight from the last pointer event,
 *   plus its point on the paper plane (z = 0) in cm.
 * - Velocity: 30 ms moving average in cm/s on the paper plane (velocity.js).
 * - Hover: a raycast against the 3D placeholders, once per frame, only for hover visuals.
 *   Clicks, focus and drags go to the invisible HTML proxies in #print, never to the raycast.
 *
 * Listens on window in the capture phase, so proxies and #float content never hide the pointer.
 * The native cursor stays visible (WP-09 swaps in the spark).
 */
import * as THREE from 'three';
import { createVelocityTracker } from './velocity.js';

const PAPER = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * @param {{ camera: THREE.PerspectiveCamera, hoverables: THREE.Object3D[], onHover?: (name: string|null, prev: string|null) => void }} o
 */
export function createInput(o) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  /** @type {THREE.Intersection[]} */
  const hits = [];
  const velocity = createVelocityTracker();
  const state = {
    inside: false,
    clientX: 0, clientY: 0,
    /** normalised to the window, −1…1, y up */
    nx: 0, ny: 0,
    /** on the paper plane, cm */
    x: 0, y: 0,
    vx: 0, vy: 0, speed: 0,
    /** @type {string|null} */
    hover: null,
    buttons: 0,
  };
  let width = innerWidth, height = innerHeight;
  let moved = false;
  let lastCamera = -1;

  /** @param {number} cx @param {number} cy */
  function toPaper(cx, cy) {
    ndc.set((cx / width) * 2 - 1, -(cy / height) * 2 + 1);
    raycaster.setFromCamera(ndc, o.camera);
    return raycaster.ray.intersectPlane(PAPER, hit);
  }

  /** @param {PointerEvent} e */
  function onMove(e) {
    if (e.pointerType === 'touch' && e.type === 'pointermove' && !e.isPrimary) return;
    state.inside = true;
    state.clientX = e.clientX; state.clientY = e.clientY;
    state.buttons = e.buttons;
    state.nx = (e.clientX / width) * 2 - 1;
    state.ny = -(e.clientY / height) * 2 + 1;
    if (toPaper(e.clientX, e.clientY)) {
      state.x = hit.x; state.y = hit.y;
      velocity.add(e.timeStamp || performance.now(), hit.x, hit.y);
    }
    moved = true;
  }
  const onLeave = (/** @type {PointerEvent|MouseEvent} */ e) => {
    if (/** @type {MouseEvent} */ (e).relatedTarget) return;
    state.inside = false; moved = true; velocity.reset();
  };

  addEventListener('pointermove', onMove, { capture: true, passive: true });
  addEventListener('pointerdown', onMove, { capture: true, passive: true });
  addEventListener('pointerup', onMove, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave, { passive: true });
  document.addEventListener('mouseout', onLeave, { passive: true });

  return {
    state,
    /** @param {number} w @param {number} h */
    setSize(w, h) { width = w; height = h; },
    /**
     * Frame step: update velocity and the hover raycast.
     * @param {number} cameraVersion  rig.version, so a moving camera also refreshes hover
     */
    update(cameraVersion) {
      const v = velocity.read(performance.now());
      state.vx = v.vx; state.vy = v.vy; state.speed = v.speed;
      if (!moved && cameraVersion === lastCamera) return;
      moved = false; lastCamera = cameraVersion;
      let name = null;
      if (state.inside) {
        ndc.set(state.nx, state.ny);
        raycaster.setFromCamera(ndc, o.camera);
        hits.length = 0;
        raycaster.intersectObjects(o.hoverables, false, hits);
        name = hits.length ? hits[0].object.name : null;
        if (state.inside && toPaper(state.clientX, state.clientY)) { state.x = hit.x; state.y = hit.y; }
      }
      if (name !== state.hover) {
        const prev = state.hover;
        state.hover = name;
        o.onHover?.(name, prev);
      }
    },
    /** The state with the velocity read right now (debug; the frame loop uses `update`). */
    readNow() {
      const v = velocity.read(performance.now());
      return { ...state, vx: v.vx, vy: v.vy, speed: v.speed };
    },
    /** Paper point under a client position (cm), or null. @param {number} cx @param {number} cy */
    paperAt(cx, cy) { const p = toPaper(cx, cy); return p ? { x: p.x, y: p.y } : null; },
    resetVelocity() { velocity.reset(); },
    dispose() {
      removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerdown', onMove, true);
      removeEventListener('pointerup', onMove, true);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('mouseout', onLeave);
    },
  };
}
