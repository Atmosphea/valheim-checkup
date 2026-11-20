// @ts-check
/**
 * Paper in the breeze and under impacts (file 04 "Paper"; owned by WP-06, DECISIONS point 32).
 *
 *   Breeze   the sheet's edges and corners lift locally (up to 0.25 cm, DECISIONS point 20:
 *            min(0.25, air speed × 0.002)), corners weighted ×2, each point on a 120 / 14
 *            spring, then settle. Emits `paper:lift {speed, sheet}` once a lift passes 0.05 cm
 *            and `paper:settle {sheet}` when it is back under 0.01 cm.
 *   Impact   the whole sheet dips −0.02 cm × strength and rebounds on a 600 / 20 spring.
 *
 * Works on the sheets' own (subdivided) plane geometry, which the veil shares, so the paper's
 * lighting in layer 3 follows the lift. WP-07's bristle builds on the same vertices.
 */
import { paper as MP, breeze as MBz } from '../config/motion.js';
import { Spring, SUBSTEP } from '../util/spring.js';
import { onImpact } from './impact.js';

/**
 * @param {{ mesh: import('three').Mesh, name: string, x0: number, x1: number, y0: number, y1: number, z: number }[]} sheets
 * @param {{ breeze: import('./breeze.js').Breeze, emit: (type: string, data: any) => void }} o
 */
export function createPaperLift(sheets, o) {
  const k = MP.breezeLiftSpring.stiffness, c = MP.breezeLiftSpring.damping;
  const band = MBz.paperEdgeBand;
  const offs = [];
  const state = sheets.map(s => {
    const pos = s.mesh.geometry.getAttribute('position');
    const cx = s.mesh.position.x, cy = s.mesh.position.y;
    /** @type {number[]} */ const idx = [];
    /** @type {number[]} */ const wts = [];
    /** @type {number[]} */ const wx = [];
    /** @type {number[]} */ const wy = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, y = pos.getY(i) + cy;
      const ex = Math.max(0, 1 - Math.min(x - s.x0, s.x1 - x) / band);
      const ey = Math.max(0, 1 - Math.min(y - s.y0, s.y1 - y) / band);
      const w = ex * ex + ey * ey; // 1 along an edge, 2 in a corner (×2, file 04)
      if (w <= 0) continue;
      idx.push(i); wts.push(w); wx.push(x); wy.push(y);
    }
    const dip = new Spring({ ...MP.impactSpring, value: 0 });
    const st = {
      s, pos, idx, wts, wx, wy, dip,
      val: new Float32Array(idx.length), vel: new Float32Array(idx.length),
      carry: 0, lifted: false, max: 0,
    };
    offs.push(onImpact(felt => { dip.impulse(MP.impactDip * felt * Math.sqrt(MP.impactSpring.stiffness) * 1.7); }, () => ({ x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 })));
    return st;
  });

  return {
    /** @param {number} dt ms */
    update(dt) {
      for (const st of state) {
        st.dip.step(dt);
        st.s.mesh.position.z = st.s.z + st.dip.value;
        // springs toward the breeze lift, fixed substeps like util/spring.js
        st.carry += Math.min(Math.max(dt, 0), 100) / 1000;
        const steps = Math.floor(st.carry / SUBSTEP);
        st.carry -= steps * SUBSTEP;
        let max = 0, anyMoving = false, maxSpeed = 0;
        for (let j = 0; j < st.idx.length; j++) {
          const speed = o.breeze.sample(st.wx[j], st.wy[j]);
          const target = Math.min(MP.breezeLiftMax, speed * 0.002 * st.wts[j]);
          let v = st.val[j], u = st.vel[j];
          if (target === 0 && v === 0 && u === 0) continue;
          for (let n = 0; n < steps; n++) { u += (-k * (v - target) - c * u) * SUBSTEP; v += u * SUBSTEP; }
          if (Math.abs(v) < 1e-5 && Math.abs(u) < 1e-4 && target === 0) { v = 0; u = 0; }
          st.val[j] = v; st.vel[j] = u;
          st.pos.setZ(st.idx[j], v);
          anyMoving = true;
          if (v > max) { max = v; maxSpeed = speed; }
        }
        if (anyMoving) st.pos.needsUpdate = true;
        st.max = max;
        if (!st.lifted && max > MBz.paperLiftEventAt) { st.lifted = true; o.emit('paper:lift', { sheet: st.s.name, speed: +maxSpeed.toFixed(1) }); }
        else if (st.lifted && max < MBz.paperSettleEventAt) { st.lifted = false; o.emit('paper:settle', { sheet: st.s.name }); }
      }
    },
    /** Highest lift per sheet (cm), for tests. */
    read: () => Object.fromEntries(state.map(st => [st.s.name, { maxLift: +st.max.toFixed(4), dip: +st.dip.value.toFixed(4) }])),
    dispose() { for (const f of offs) f(); },
  };
}
