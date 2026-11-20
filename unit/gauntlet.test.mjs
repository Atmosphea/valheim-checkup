// WP-08 and WP-09 pure logic: the gauntlet model (bones, budget, rivets, collisions, pinch, joint
// limits) and the spark (sudden-stop embers, click ring). Runs in Node, no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGauntlet } from '../src/gauntlet/model.js';
import { findPenetrations } from '../src/gauntlet/collide.js';
import { POSES } from '../src/gauntlet/poses.js';
import { createSpark } from '../src/gauntlet/spark.js';
import { gauntletRig as RIG, spark as MS } from '../src/config/motion.js';
import { Rng } from '../src/util/rng.js';

const g = buildGauntlet({ lod: 0 });

test('gauntlet: 19 bones, rivets ≈ 60, LOD0 80k–150k triangles, LOD1 lighter', () => {
  assert.equal(Object.keys(g.bones).length, 19);
  assert.ok(Math.abs(g.rivetCount - 60) <= 4, `rivets ${g.rivetCount}`);
  const t0 = g.triangles();
  assert.ok(t0 >= 80000 && t0 <= 150000, `LOD0 ${t0}`);
  g.setLOD(1);
  const t1 = g.triangles();
  g.setLOD(0);
  assert.ok(t1 < t0 / 2, `LOD1 ${t1}`);
  assert.equal(g.triangles(), t0);
});

test('gauntlet: the pinch closes (thumb pad on the index pad) without plates passing through', () => {
  assert.ok(g.pinchGap < 0.05, `gap ${g.pinchGap}`);
  assert.equal(g.pinchClear.penetrating, 0);
});

test('gauntlet: no plate passes through another in any pose, blend or wrist extreme', () => {
  const names = Object.keys(POSES);
  const cases = names.map(n => ({ [n]: 1 }));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) cases.push({ [names[i]]: 1, [names[j]]: 1 });
  for (const pitch of [-35, 35]) for (const yaw of [-20, 20]) for (const base of ['hover', 'pinch']) {
    const P = structuredClone(POSES[base]); P.wrist = { pitch, yaw, roll: 0 }; cases.push(P);
  }
  for (const w of cases) {
    g.rig.setPose(w);
    const p = findPenetrations(g);
    assert.equal(p.length, 0, `${JSON.stringify(Object.keys(w).length < 3 ? w : 'pose')}: ${JSON.stringify(p.slice(0, 3))}`);
  }
});

test('gauntlet: every pose stays inside the joint limits', () => {
  const L = RIG.limits;
  const inside = (v, [a, b]) => v >= a - 1e-6 && v <= b + 1e-6;
  for (const [name, P] of Object.entries(POSES)) {
    for (const f of ['index', 'middle', 'ring', 'little']) {
      for (const c of P[f].curl) assert.ok(inside(c, L.curl), `${name} ${f} curl ${c}`);
      assert.ok(inside(P[f].spread, L.spread), `${name} ${f} spread`);
    }
    const t = P.thumb;
    assert.ok(inside(t.opp, L.thumbOpp) && inside(t.curl1, L.thumbCurl1) && inside(t.spread1, L.thumbSpread1) && inside(t.curl2, L.thumbCurl) && inside(t.curl3, L.thumbCurl), `${name} thumb`);
    assert.ok(inside(P.wrist.pitch, L.wristPitch) && inside(P.wrist.yaw, L.wristYaw) && inside(P.wrist.roll, L.wristRoll), `${name} wrist`);
  }
});

/** A spark on a fake clock. */
function sparkAt() {
  let t = 1000;
  const events = [];
  const s = createSpark({ rng: new Rng(7), emit: (type, data) => events.push({ type, data }), now: () => t });
  return { s, events, tick: (ms, p) => { t += ms; s.update(ms, { visible: true, ...p }); } };
}

test('spark: a sudden stop throws 4–8 embers in the travel direction', () => {
  for (const [vx, vy, deg] of [[3000, 0, 0], [0, 3000, 90], [-2000, -2000, -135]]) {
    const { s, events, tick } = sparkAt();
    for (let i = 0; i < 6; i++) tick(16, { x: 100 + i * 10, y: 100, speedCm: 150, vx, vy });
    tick(16, { x: 160, y: 100, speedCm: 5, vx: 0, vy: 0 });
    const e = events.find(x => x.type === 'spark:embers');
    assert.ok(e, 'embers');
    assert.ok(e.data.count >= MS.stopEmbersMin && e.data.count <= MS.stopEmbersMax, `count ${e.data.count}`);
    assert.ok(Math.abs(((e.data.angle - deg + 540) % 360) - 180) < 1, `angle ${e.data.angle} vs ${deg}`);
    for (const em of s.read().embers) {
      const a = Math.atan2(em.vy, em.vx) * 180 / Math.PI;
      assert.ok(Math.abs(((a - deg + 540) % 360) - 180) <= MS.stopEmberSpreadDeg + 0.5, `ember at ${a}°`);
    }
  }
});

test('spark: a slow stop throws nothing; a click draws a ring with three embers', () => {
  const { s, events, tick } = sparkAt();
  for (let i = 0; i < 6; i++) tick(16, { x: 100, y: 100, speedCm: 40, vx: 400, vy: 0 });
  tick(16, { x: 100, y: 100, speedCm: 0, vx: 0, vy: 0 });
  assert.equal(events.filter(e => e.type === 'spark:embers').length, 0);
  s.click(50, 60);
  const r = s.read();
  assert.equal(r.rings, 1);
  assert.equal(r.embers.length, MS.clickEmbers);
  assert.ok(events.some(e => e.type === 'spark:click'));
  tick(MS.clickRingMs + 400, { x: 100, y: 100, speedCm: 0, vx: 0, vy: 0, visible: false });
  assert.equal(s.read().rings, 0);
  assert.equal(s.read().embers.length, 0, 'particles die out even while hidden');
});

test('gauntlet: a LOD built while the arm is posed and placed matches one built at rest (WP-10 rods)', async () => {
  const THREE = await import('three');
  const { placeArm } = await import('../src/gauntlet/rig.js');
  const posed = buildGauntlet({ lod: 0 });
  posed.root.position.set(12, -7, 9);
  placeArm(posed.rig, new THREE.Vector3(20, 5, 1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7));
  posed.root.updateMatrixWorld(true);
  posed.setLOD(1);
  const late = posed.leather.geometry.getAttribute('position').array;
  const rest = buildGauntlet({ lod: 1 }).leather.geometry.getAttribute('position').array;
  assert.equal(late.length, rest.length);
  let max = 0;
  for (let i = 0; i < late.length; i++) max = Math.max(max, Math.abs(late[i] - rest[i]));
  assert.ok(max < 1e-3, `max vertex difference ${max} cm`);
});
