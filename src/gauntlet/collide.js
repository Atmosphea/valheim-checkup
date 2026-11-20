// @ts-check
/**
 * WP-08 acceptance: "no plate passes through another plate in any pose or blend between poses".
 *
 * Each plate carries collision samples on its mid-surface (shell.js): a point, its normal and
 * how far the solid reaches along that normal (its skin, or the rolled edge at the outline).
 * A sample point of plate A is inside plate B when, at B's nearest sample, it lies within B's
 * solid along B's normal and within B's sample spacing sideways. Every plate pair whose bounds
 * meet is tested both ways at the mid-surface and at both skins.
 */
import * as THREE from 'three';

const EPS = 0.004;

/**
 * @param {{ plates: import('./model.js').Plate[], root: THREE.Object3D }} model
 * @param {(name: string) => boolean} [only]  test only plates whose name passes (both sides)
 * @returns {{ a: string, b: string, points: number, depth: number }[]}
 */
export function findPenetrations(model, only) {
  model.root.updateMatrixWorld(true);
  const world = model.plates.filter(p => !only || only(p.name)).map(p => {
    const S = p.samples, m = p.mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
    const n = S.p.length / 3;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromArray(S.p, i * 3).applyMatrix4(m); P.set([v.x, v.y, v.z], i * 3); c.add(v);
      v.fromArray(S.n, i * 3).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3);
    }
    c.multiplyScalar(1 / n);
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z));
    return { p, S, P, N, n, c, r: r + S.spacing + S.hiEdge + S.reach };
  });
  /** @type {{ a: string, b: string, points: number, depth: number }[]} */
  const out = [];
  for (let i = 0; i < world.length; i++) {
    for (let j = 0; j < world.length; j++) {
      if (i === j) continue;
      const A = world[i], B = world[j];
      if (A.c.distanceTo(B.c) > A.r + B.r) continue;
      let points = 0, depth = 0;
      for (let k = 0; k < A.n; k++) {
        for (const off of [A.S.lo, 0, A.S.edge[k] ? A.S.hiEdge : A.S.hi]) {
          const qx = A.P[k * 3] + A.N[k * 3] * off, qy = A.P[k * 3 + 1] + A.N[k * 3 + 1] * off, qz = A.P[k * 3 + 2] + A.N[k * 3 + 2] * off;
          if ((qx - B.c.x) ** 2 + (qy - B.c.y) ** 2 + (qz - B.c.z) ** 2 > B.r * B.r) continue;
          // nearest sample of B
          let best = Infinity, bi = -1;
          for (let s = 0; s < B.n; s++) {
            const d = (qx - B.P[s * 3]) ** 2 + (qy - B.P[s * 3 + 1]) ** 2 + (qz - B.P[s * 3 + 2]) ** 2;
            if (d < best) { best = d; bi = s; }
          }
          const dx = qx - B.P[bi * 3], dy = qy - B.P[bi * 3 + 1], dz = qz - B.P[bi * 3 + 2];
          const along = dx * B.N[bi * 3] + dy * B.N[bi * 3 + 1] + dz * B.N[bi * 3 + 2];
          const lat = Math.sqrt(Math.max(0, best - along * along));
          const edge = !!B.S.edge[bi];
          const hi = edge ? B.S.hiEdge : B.S.hi;
          const latMax = B.S.spacing * 0.72 + (edge ? -0.5 * B.S.spacing + B.S.reach : 0);
          if (along > B.S.lo + EPS && along < hi - EPS && lat < latMax) {
            points++;
            depth = Math.max(depth, Math.min(along - B.S.lo, hi - along));
          }
        }
      }
      if (points) out.push({ a: A.p.name, b: B.p.name, points, depth: +depth.toFixed(3) });
    }
  }
  return out;
}
