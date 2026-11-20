// WP-08 probe: build the model in Node, report triangles, pinch gap and penetrations per pose.
import { buildGauntlet } from '../src/gauntlet/model.js';
import { findPenetrations } from '../src/gauntlet/collide.js';
import { POSES } from '../src/gauntlet/poses.js';
const t0 = performance.now();
const g = buildGauntlet({ lod: 0 });
const t1 = performance.now();
console.log('build ms', (t1 - t0).toFixed(0), 'tris LOD0', g.triangles(), 'rivets', g.rivetCount, 'pinchGap', g.pinchGap.toFixed(3), 'pinchClear', JSON.stringify(g.pinchClear), JSON.stringify(POSES.pinch));
g.setLOD(1); console.log('tris LOD1', g.triangles()); g.setLOD(0);
const names = Object.keys(POSES);
const only = process.argv[2];
const cases = [];
for (const a of names) cases.push([a, { [a]: 1 }]);
if (!only) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) cases.push([`${names[i]}~${names[j]}`, { [names[i]]: 1, [names[j]]: 1 }]);
for (const pitch of [-35, 0, 35]) for (const yaw of [-20, 0, 20]) for (const base of ['hover', 'point', 'stretch', 'pinch']) {
  const P = JSON.parse(JSON.stringify(POSES[base])); P.wrist = { pitch, yaw, roll: 0 }; cases.push([`${base} wrist ${pitch}/${yaw}`, P]);
}
// finger extremes: every finger fully curled, and fully open with the widest fan
{ const P = JSON.parse(JSON.stringify(POSES.hover)); for (const f of ['index', 'middle', 'ring', 'little']) P[f].curl = [95, 95, 95]; cases.push(['all curled 95', P]); }
{ const P = JSON.parse(JSON.stringify(POSES.stretch)); P.index.spread = 12; P.middle.spread = 4; P.ring.spread = -4; P.little.spread = -12; cases.push(['fan ±12', P]); }
let total = 0;
for (const [label, w] of cases) {
  g.rig.setPose(w);
  const p = findPenetrations(g);
  total += p.length;
  if (p.length) console.log(label, JSON.stringify(p.slice(0, 12)));
}
console.log('cases', cases.length, 'pairs with penetration', total, 'ms', (performance.now() - t1).toFixed(0));
if (process.argv[3] === 'tris') {
  const rows = [];
  g.root.traverse(o => { if (o.isMesh && o.visible && !o.name.startsWith('gauntlet-proxy')) { const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); rows.push([o.name, Math.round(n)]); } });
  const agg = {}; for (const [n, c] of rows) { const k = n.replace(/\d/g, '#'); agg[k] = (agg[k] || 0) + c; }
  console.log(Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('\n'));
}
