// @ts-check
/** Small geometry helpers for the board (WP-06). */
import * as THREE from 'three';

/**
 * Planar uv, chosen per vertex by its dominant normal: top/bottom faces get (x, y), faces
 * looking along y get (x, z), faces looking along x get (z, y). So a box's top face reads
 * u along x and v along y (engraving, brushed streaks along the length), and no face has a
 * degenerate tangent frame for its normal map.
 *
 * Either normalise to a rectangle (`x0, x1, y0, y1`; z uses the same scale as y) or use a
 * plain `scale` (uv = cm × scale).
 * @param {THREE.BufferGeometry} g
 * @param {{ x0?: number, x1?: number, y0?: number, y1?: number, scale?: number }} [o]
 */
export function planarUv(g, o = {}) {
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  let uv = g.getAttribute('uv');
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv); }
  g.computeBoundingBox();
  const bb = /** @type {THREE.Box3} */ (g.boundingBox);
  const x0 = o.x0 ?? bb.min.x, x1 = o.x1 ?? bb.max.x, y0 = o.y0 ?? bb.min.y, y1 = o.y1 ?? bb.max.y;
  const sx = o.scale ?? 1 / Math.max(1e-6, x1 - x0), sy = o.scale ?? 1 / Math.max(1e-6, y1 - y0);
  const ox = o.scale ? 0 : x0, oy = o.scale ? 0 : y0;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (az >= ax && az >= ay) uv.setXY(i, (x - ox) * sx, (y - oy) * sy);
    else if (ay >= ax) uv.setXY(i, (x - ox) * sx, z * sy);
    else uv.setXY(i, z * sx, (y - oy) * sy);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Where a client pixel's ray meets the horizontal plane z = `z` (world cm).
 * @param {THREE.Camera} camera @param {number} cx @param {number} cy @param {number} w @param {number} h @param {number} z
 */
export function clientToPlane(camera, cx, cy, w, h, z) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1), camera);
  const hit = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), hit) ? hit : null;
}
