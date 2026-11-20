// WP-18P: medians of the interleaved before/after runs (docs/reports/wp-18p/perf-final-*.json).
//   node tools/wp18p-summary.cjs   → prints the report table, writes summary.json
const fs = require('node:fs'), path = require('node:path');
const D = path.join(__dirname, '..', 'docs', 'reports', 'wp-18p');
const runs = k => fs.readdirSync(D).filter(f => f.startsWith(`perf-final-${k}-`)).map(f => JSON.parse(fs.readFileSync(path.join(D, f))));
const med = a => { a = a.filter(x => typeof x === 'number').sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const B = runs('before'), A = runs('after');
const names = B[0].rows.map(r => r.name);
const pick = (rs, n, k) => rs.map(r => r.rows.find(x => x.name === n)?.[k]);
const traced = (rs, n, k) => rs.filter(r => r.rows.find(x => x.name === n)?.mainMs != null).map(r => r.rows.find(x => x.name === n)[k]);
const rows = names.map(n => ({
  name: n,
  before: { worst: med(pick(B, n, 'worstMs')), over16: med(pick(B, n, 'over16')), over33: med(pick(B, n, 'over33')), frames: med(pick(B, n, 'frames')), mainMs: med(traced(B, n, 'mainMs')), gpuMs: med(pick(B, n, 'gpuMs').filter(x => x)), all16: pick(B, n, 'over16') },
  after: { worst: med(pick(A, n, 'worstMs')), over16: med(pick(A, n, 'over16')), over33: med(pick(A, n, 'over33')), frames: med(pick(A, n, 'frames')), mainMs: med(traced(A, n, 'mainMs')), gpuMs: med(pick(A, n, 'gpuMs').filter(x => x)), all16: pick(A, n, 'over16') },
}));
fs.writeFileSync(path.join(D, 'summary.json'), JSON.stringify({ runs: { before: B.length, after: A.length }, rows }, null, 1));
console.log('| Transition | Worst ms before → after | Frames > 16.7 before → after (each run) | > 33 | Main-thread ms | GPU ms |\n| --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.name} | ${r.before.worst} → ${r.after.worst} | ${r.before.over16} → **${r.after.over16}** (${r.before.all16.join(', ')} → ${r.after.all16.join(', ')}) | ${r.before.over33} → ${r.after.over33} | ${r.before.mainMs ?? '—'} → ${r.after.mainMs ?? '—'} | ${r.before.gpuMs ?? '—'} → ${r.after.gpuMs ?? '—'} |`);
const tot = k => rows.reduce((s, r) => s + (r[k].over16 || 0), 0);
console.log(`\ntotal late frames (sum of medians): before ${tot('before')}, after ${tot('after')}`);
