// @ts-check
/**
 * WP-08 geometry kernel: one armour plate = a thin curved shell plus a rolled edge.
 *
 * A plate is described by its mid-surface `pos(u, v)` (u, v in 0…1, plate-local cm). The kernel
 * builds:
 *   - the outer and inner skins (thickness `t`), with analytic smooth normals, so no facet
 *     shows however close the camera gets;
 *   - the **rolled edge**: a round bead of radius `rb` swept along the whole outline. Its inner
 *     side is flush with the inner skin, so it stands proud of the outer skin by 2·rb − t, the
 *     detail that makes real armour catch light;
 *   - collision samples (mid-surface points, normals and the solid's extent along the normal)
 *     for the "no plate passes through another" check (src/gauntlet/collide.js).
 *
 * Corners of the (u, v) domain are pulled in a little (`round`), so outlines have soft corners
 * and the bead turns smoothly instead of kinking.
 *
 * Helpers build the three shapes the gauntlet needs: lathe shells (vambrace, cuff, finger lames,
 * tip caps: any profile around the local x axis, over any arc), ellipsoid zones (wrist lames,
 * which slide over each other about the wrist pivot) and height fields (knuckle plate, guard).
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;

/**
 * @typedef {object} PlateSamples
 * @property {Float32Array} p        mid-surface points (xyz × n), plate-local
 * @property {Float32Array} n        unit normals (outward)
 * @property {Uint8Array} edge       1 where the sample lies on the outline (the bead's reach)
 * @property {number} lo             solid extent along the normal: from lo …
 * @property {number} hi             … to hi (interior samples)
 * @property {number} hiEdge         … to hiEdge at the outline (the bead)
 * @property {number} spacing        largest distance between neighbouring samples
 * @property {number} reach          how far past an edge sample the solid reaches (the bead)
 */

/**
 * @typedef {object} PlateSpec
 * @property {(u: number, v: number, out: THREE.Vector3) => THREE.Vector3} pos  mid-surface
 * @property {(p: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3} [ref]  roughly outward at p (orients the normals)
 * @property {number} segU
 * @property {number} segV
 * @property {number} t           shell thickness (cm)
 * @property {number} rb          rolled-edge bead radius (cm); 0 = no bead
 * @property {number} [beadSides] tube sides of the bead
 * @property {boolean} [closedU]  u wraps around (full rings): only the v = 0 and v = 1 edges get a bead
 * @property {number} [round]     corner rounding 0…0.3
 * @property {[number, number]} [uvScale]  cm per texture unit (dents, scratches)
 * @property {number} [sampleU]   collision samples across u
 * @property {number} [sampleV]   collision samples across v
 */

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _du = new THREE.Vector3(), _dv = new THREE.Vector3();
const _n = new THREE.Vector3(), _r = new THREE.Vector3();

/** Pull the domain's corners in (soft outline corners). */
function mapUV(/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ k, /** @type {boolean} */ closedU) {
  if (!k) return [u, v];
  const x = 2 * u - 1, y = 2 * v - 1;
  const ax = Math.abs(x) ** 6, ay = Math.abs(y) ** 6;
  const xs = closedU ? x : x * (1 - k * ay);
  const ys = closedU ? y : y * (1 - k * ax);
  return [(xs + 1) / 2, (ys + 1) / 2];
}

/**
 * A sampler with analytic-quality normals (central differences on the analytic surface).
 * @param {PlateSpec} o
 */
export function surfaceOf(o) {
  const h = 1e-4;
  const k = o.round ?? 0.12;
  let sign = 1;
  /** @param {number} u @param {number} v @param {THREE.Vector3} p @param {THREE.Vector3} n */
  function at(u, v, p, n) {
    const [mu, mv] = mapUV(u, v, k, !!o.closedU);
    o.pos(mu, mv, p);
    o.pos(mu + h, mv, _du); o.pos(mu - h, mv, _q); _du.sub(_q);
    o.pos(mu, mv + h, _dv); o.pos(mu, mv - h, _q); _dv.sub(_q);
    n.crossVectors(_du, _dv);
    if (n.lengthSq() < 1e-20) {
      // degenerate (a pole): nudge inward
      o.pos(mu + 2 * h * (mu < 0.5 ? 1 : -1), mv + 2 * h * (mv < 0.5 ? 1 : -1), _q);
      return at(Math.min(1, Math.max(0, u + (u < 0.5 ? 0.002 : -0.002))), Math.min(1, Math.max(0, v + (v < 0.5 ? 0.002 : -0.002))), p, n);
    }
    n.normalize().multiplyScalar(sign);
    return p;
  }
  // orient: compare with the reference direction at the centre
  at(0.5, 0.5, _p, _n);
  const ref = o.ref ? o.ref(_p, _r) : _r.set(0, 0, 1);
  if (_n.dot(ref) < 0) sign = -1;
  return { at, mapUV: (/** @type {number} */ u, /** @type {number} */ v) => mapUV(u, v, k, !!o.closedU) };
}

/**
 * Build one plate.
 * @param {PlateSpec} o
 * @returns {{ geometry: THREE.BufferGeometry, samples: PlateSamples, at: (u: number, v: number, p: THREE.Vector3, n: THREE.Vector3) => THREE.Vector3 }}
 */
export function buildPlate(o) {
  const S = surfaceOf(o);
  const segU = Math.max(1, Math.round(o.segU)), segV = Math.max(1, Math.round(o.segV));
  const t = o.t, rb = o.rb;
  const sides = o.beadSides ?? 10;
  /** @type {number[]} */ const pos = [];
  /** @type {number[]} */ const nor = [];
  /** @type {number[]} */ const uvs = [];
  /** @type {number[]} */ const idx = [];
  const [cmU, cmV] = o.uvScale ?? [10, 10];
  // approximate physical lengths for texture coordinates
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), n0 = new THREE.Vector3();
  let lenU = 0, lenV = 0;
  for (let i = 0; i < 16; i++) {
    S.at(i / 16, 0.5, p0, n0); S.at((i + 1) / 16, 0.5, p1, n0); lenU += p0.distanceTo(p1);
    S.at(0.5, i / 16, p0, n0); S.at(0.5, (i + 1) / 16, p1, n0); lenV += p0.distanceTo(p1);
  }

  // ── skins ──────────────────────────────────────────────────────────────────────────────
  const gridP = new THREE.Vector3(), gridN = new THREE.Vector3();
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= segV; j++) {
      for (let i = 0; i <= segU; i++) {
        const u = i / segU, v = j / segV;
        S.at(u, v, gridP, gridN);
        pos.push(gridP.x + gridN.x * side * t / 2, gridP.y + gridN.y * side * t / 2, gridP.z + gridN.z * side * t / 2);
        nor.push(gridN.x * side, gridN.y * side, gridN.z * side);
        uvs.push(u * lenU / cmU, v * lenV / cmV);
      }
    }
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = base + j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
        // the outer skin's normal is +(du × dv)·sign; winding follows it
        if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
  }
  // the normals were oriented to `sign`; the winding above assumes du × dv points outward.
  // If the sampler flipped (sign −1), flip every triangle.
  {
    S.at(0.5, 0.5, p0, n0);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), nn = new THREE.Vector3();
    S.at(0.5, 0.5, pa, nn); S.at(0.5 + 1e-3, 0.5, pb, nn); S.at(0.5, 0.5 + 1e-3, pc, nn);
    const face = pb.sub(pa).cross(pc.sub(pa));
    if (face.dot(n0) < 0) for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
  }

  // ── rolled edge ────────────────────────────────────────────────────────────────────────
  if (rb > 0) {
    /** @type {[number, number][][]} */
    const loops = [];
    if (o.closedU) {
      for (const v of [0, 1]) {
        const L = [];
        for (let i = 0; i < segU; i++) L.push(/** @type {[number, number]} */ ([i / segU, v]));
        loops.push(L);
      }
    } else {
      const L = [];
      const nu = segU, nv = segV;
      for (let i = 0; i < nu; i++) L.push(/** @type {[number, number]} */ ([i / nu, 0]));
      for (let j = 0; j < nv; j++) L.push(/** @type {[number, number]} */ ([1, j / nv]));
      for (let i = nu; i > 0; i--) L.push(/** @type {[number, number]} */ ([i / nu, 1]));
      for (let j = nv; j > 0; j--) L.push(/** @type {[number, number]} */ ([0, j / nv]));
      loops.push(L);
    }
    const cP = new THREE.Vector3(), cN = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
    const pPrev = new THREE.Vector3(), pNext = new THREE.Vector3(), tmpN = new THREE.Vector3(), mid = new THREE.Vector3();
    S.at(0.5, 0.5, mid, tmpN);
    for (const L of loops) {
      const n = L.length;
      const base = pos.length / 3;
      let along = 0;
      const last = new THREE.Vector3();
      for (let k = 0; k <= n; k++) {
        const [u, v] = L[k % n];
        const [up, vp] = L[(k - 1 + n) % n];
        const [un, vn] = L[(k + 1) % n];
        S.at(u, v, cP, cN);
        S.at(up, vp, pPrev, tmpN); S.at(un, vn, pNext, tmpN);
        T.subVectors(pNext, pPrev).normalize();
        B.crossVectors(T, cN).normalize();
        // B points away from the plate (outward in the surface)
        const inward = o.closedU ? (v < 0.5 ? 1 : -1) : 0;
        if (o.closedU) {
          S.at(u, v < 0.5 ? 0.1 : 0.9, pPrev, tmpN);
          if (B.dot(pPrev.sub(cP)) > 0) B.negate();
        } else if (B.dot(_q.subVectors(cP, mid)) < 0) B.negate();
        void inward;
        if (k > 0) along += cP.distanceTo(last);
        last.copy(cP);
        const off = rb - t / 2;
        for (let s = 0; s <= sides; s++) {
          const a = (s / sides) * TAU;
          const ca = Math.cos(a), sa = Math.sin(a);
          const nx = cN.x * ca + B.x * sa, ny = cN.y * ca + B.y * sa, nz = cN.z * ca + B.z * sa;
          pos.push(cP.x + cN.x * off + nx * rb, cP.y + cN.y * off + ny * rb, cP.z + cN.z * off + nz * rb);
          nor.push(nx, ny, nz);
          uvs.push(along / cmU, s / sides * 0.05);
        }
      }
      for (let k = 0; k < n; k++) {
        for (let s = 0; s < sides; s++) {
          const a = base + k * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
          // tube winding: normal (cN cos + B sin) outward; T × ... choose by test below
          idx.push(a, c, b, b, c, d);
        }
      }
      // fix the tube winding if it faces inward (check the first quad)
      const ia = base, ib = base + 1, ic = base + sides + 1;
      const A = new THREE.Vector3(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]);
      const Bv = new THREE.Vector3(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]);
      const C = new THREE.Vector3(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]);
      const f = C.sub(A).cross(Bv.sub(A));
      const nA = new THREE.Vector3(nor[ia * 3], nor[ia * 3 + 1], nor[ia * 3 + 2]);
      if (f.dot(nA) < 0) {
        const start = idx.length - n * sides * 6;
        for (let i = start; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  return { geometry, samples: samplesOf(S, o), at: S.at };
}

/**
 * Collision samples on the mid-surface.
 * @param {ReturnType<typeof surfaceOf>} S @param {PlateSpec} o
 * @returns {PlateSamples}
 */
function samplesOf(S, o) {
  const nu = o.sampleU ?? Math.max(6, Math.round(o.segU / 3));
  const nv = o.sampleV ?? Math.max(4, Math.round(o.segV / 2));
  const p = new Float32Array((nu + 1) * (nv + 1) * 3), n = new Float32Array(p.length);
  const edge = new Uint8Array((nu + 1) * (nv + 1));
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let k = 0, spacing = 0;
  const prevRow = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      S.at(i / nu, j / nv, P, N);
      p.set([P.x, P.y, P.z], k * 3); n.set([N.x, N.y, N.z], k * 3);
      edge[k] = (j === 0 || j === nv || (!o.closedU && (i === 0 || i === nu))) ? 1 : 0;
      if (i > 0) spacing = Math.max(spacing, Math.hypot(P.x - p[(k - 1) * 3], P.y - p[(k - 1) * 3 + 1], P.z - p[(k - 1) * 3 + 2]));
      if (j > 0) spacing = Math.max(spacing, Math.hypot(P.x - prevRow[i * 3], P.y - prevRow[i * 3 + 1], P.z - prevRow[i * 3 + 2]));
      k++;
    }
    for (let i = 0; i <= nu; i++) { prevRow[i * 3] = p[(j * (nu + 1) + i) * 3]; prevRow[i * 3 + 1] = p[(j * (nu + 1) + i) * 3 + 1]; prevRow[i * 3 + 2] = p[(j * (nu + 1) + i) * 3 + 2]; }
  }
  return { p, n, edge, lo: -o.t / 2, hi: o.t / 2, hiEdge: Math.max(o.t / 2, 2 * o.rb - o.t / 2), spacing, reach: o.rb };
}

// ── Shape helpers ────────────────────────────────────────────────────────────────────────

/**
 * Lathe shell around the local x axis: profile (x, r) over v, angle φ over u. φ = 0 is +z (the
 * back of the hand / top), positive φ turns toward −y. Elliptic sections via ey, ez.
 * @param {{ prof: (v: number) => [number, number], phi0: number, phi1: number, ey?: number, ez?: number, cy?: number, cz?: number }} s
 */
export function lathe(s) {
  const ey = s.ey ?? 1, ez = s.ez ?? 1, cy = s.cy ?? 0, cz = s.cz ?? 0;
  return {
    pos(/** @type {number} */ u, /** @type {number} */ v, /** @type {THREE.Vector3} */ out) {
      const [x, r] = s.prof(v);
      const f = s.phi0 + (s.phi1 - s.phi0) * u;
      return out.set(x, cy - r * ey * Math.sin(f), cz + r * ez * Math.cos(f));
    },
    ref(/** @type {THREE.Vector3} */ p, /** @type {THREE.Vector3} */ out) { return out.set(0, p.y - cy, p.z - cz); },
  };
}

/**
 * Ellipsoid zone about the origin (wrist lames): latitude θ over v (from +z toward +x), longitude
 * φ over u (around x, 0 = top).
 * @param {{ a: number, b: number, c: number, th0: number, th1: number, phi0: number, phi1: number }} s
 */
export function zone(s) {
  return {
    pos(/** @type {number} */ u, /** @type {number} */ v, /** @type {THREE.Vector3} */ out) {
      const th = s.th0 + (s.th1 - s.th0) * v, f = s.phi0 + (s.phi1 - s.phi0) * u;
      return out.set(s.a * Math.sin(th), -s.b * Math.cos(th) * Math.sin(f), s.c * Math.cos(th) * Math.cos(f));
    },
    ref(/** @type {THREE.Vector3} */ p, /** @type {THREE.Vector3} */ out) { return out.copy(p); },
  };
}

/**
 * Height field over a quad in x/y (u along x, v along y), with z = h(x, y).
 * @param {{ x0: number, x1: number, y0: (x: number) => number, y1: (x: number) => number, h: (x: number, y: number) => number }} s
 */
export function heightField(s) {
  return {
    pos(/** @type {number} */ u, /** @type {number} */ v, /** @type {THREE.Vector3} */ out) {
      const x = s.x0 + (s.x1 - s.x0) * u;
      const y = s.y0(x) + (s.y1(x) - s.y0(x)) * v;
      return out.set(x, y, s.h(x, y));
    },
    ref(/** @type {THREE.Vector3} */ _p, /** @type {THREE.Vector3} */ out) { return out.set(0, 0, 1); },
  };
}

/** Collision samples for a surface without building its mesh (the extruded back plate). @param {PlateSpec} o */
export function plateSamples(o) { return samplesOf(surfaceOf(o), o); }

/** Smoothstep. */
export const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
